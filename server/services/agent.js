const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const SYSTEM_PROMPT = `You are a powerful AI coding agent. You build, test, and deploy applications step by step.

## Your Workflow
Always follow this structured approach:

### 1. 🧠 PLAN
First, briefly outline what you're going to build and how.

### 2. 🏗️ BUILD
Create all files and install dependencies. Write complete, working code — never placeholders.

### 3. 🧪 TEST  
Run the code, check for errors, fix any issues you find.

### 4. 🖥️ PREVIEW
Start a preview server so the user can see and interact with what you built.
Use the start_preview tool with port 8080 and the appropriate command.
For static HTML: "npx serve -s . -l 8080 --no-clipboard"
For Node.js apps: "node server.js" (make sure it listens on process.env.PORT || 8080)
For React/Vite: "npx vite --port 8080 --host 0.0.0.0"

### 5. ✅ RESULT
Summarize what was built. The user can now see it in the Live Preview panel!

## Communication Style
- Use emoji headers (🧠 🏗️ 🧪 ✅) to mark each phase
- Explain each step as you go
- Show command output and explain any errors
- Be concise but thorough

## Rules
- ALWAYS use tools to actually do the work (don't just describe what to do)
- Write complete files, never partial
- Install dependencies before running code
- Test your work before declaring it done
- Fix errors immediately when you find them
`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with complete content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace' },
          content: { type: 'string', description: 'Complete file content' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read file contents from workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command. Streams output in real-time.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          timeout: { type: 'integer', description: 'Timeout in seconds (default 60, max 180)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: ".")' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing exact text match.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_text: { type: 'string', description: 'Exact text to find' },
          new_text: { type: 'string', description: 'Replacement text' }
        },
        required: ['path', 'old_text', 'new_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Search for text across workspace files.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern' },
          path: { type: 'string', description: 'Directory to search (default: ".")' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file or directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to delete' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'start_preview',
      description: 'Start a preview server for the built app. The preview will be shown live in the UI. Use this AFTER building the app to let the user see and interact with it.',
      parameters: {
        type: 'object',
        properties: {
          port: { type: 'integer', description: 'Port to run the preview on (use 8080)' },
          command: { type: 'string', description: 'Command to start the app (e.g. "npx serve -s . -l 8080" or "node server.js" or "npx http-server -p 8080")' }
        },
        required: ['port', 'command']
      }
    }
  }
];

class AgentService {
  constructor(workspaceDir, fileManager, terminalManager, previewManager) {
    this.workspaceDir = workspaceDir;
    this.fileManager = fileManager;
    this.terminalManager = terminalManager;
    this.previewManager = previewManager;

    const provider = process.env.ACTIVE_PROVIDER || 'dashscope';
    try {
      if (provider === 'xkiro') {
        this.client = new OpenAI({
          apiKey: process.env.XKIRO_API_KEY || 'not-set',
          baseURL: process.env.XKIRO_BASE_URL,
        });
        this.model = 'gpt-4o-mini';
      } else {
        this.client = new OpenAI({
          apiKey: process.env.DASHSCOPE_API_KEY || 'not-set',
          baseURL: process.env.DASHSCOPE_BASE_URL,
        });
        this.model = 'qwen-plus';
      }
      console.log(`🤖 LLM: ${provider} / ${this.model}`);
    } catch (err) {
      console.error('Failed to init LLM:', err.message);
      this.client = null;
    }
  }

  async run(messages, sessionId, onEvent) {
    if (!this.client) {
      onEvent({ type: 'error', error: 'LLM not configured. Set API keys.' });
      return;
    }

    const history = [
      { role: 'system', content: SYSTEM_PROMPT + `\n\nWorkspace: ${this.workspaceDir}\nDate: ${new Date().toISOString()}` },
      ...messages
    ];

    let iterations = 0;
    const MAX = 30;

    onEvent({ type: 'phase', phase: 'thinking', message: '🧠 Analyzing your request...' });

    while (iterations < MAX) {
      iterations++;

      let response;
      try {
        response = await this.client.chat.completions.create({
          model: this.model,
          messages: history,
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.1,
          max_tokens: 4096,
        });
      } catch (err) {
        console.error('LLM error:', err.message);
        onEvent({ type: 'error', error: `API Error: ${err.message}` });
        return;
      }

      const msg = response.choices[0].message;

      // Stream text content
      if (msg.content) {
        // Detect phase changes
        if (msg.content.includes('🏗️') || msg.content.includes('BUILD')) {
          onEvent({ type: 'phase', phase: 'building', message: '🏗️ Building...' });
        } else if (msg.content.includes('🧪') || msg.content.includes('TEST')) {
          onEvent({ type: 'phase', phase: 'testing', message: '🧪 Testing...' });
        } else if (msg.content.includes('✅') || msg.content.includes('RESULT')) {
          onEvent({ type: 'phase', phase: 'done', message: '✅ Complete!' });
        }
        onEvent({ type: 'text', content: msg.content });
      }

      // No tool calls = done
      if (!msg.tool_calls || msg.tool_calls.length === 0) break;

      history.push(msg);

      // Execute tool calls
      for (const call of msg.tool_calls) {
        const name = call.function.name;
        let args;
        try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

        onEvent({ type: 'tool_start', name, args });

        let result;
        if (name === 'run_command') {
          // Stream command output in real-time
          result = await this.runCommandStreaming(args, onEvent);
        } else {
          result = await this.executeTool(name, args);
        }

        onEvent({ type: 'tool_end', name, result: result.substring(0, 3000) });

        // Emit preview_started event when preview tool runs
        if (name === 'start_preview') {
          onEvent({ type: 'preview_started', port: args.port || 8080 });
        }

        history.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.substring(0, 8000),
        });
      }
    }

    if (iterations >= MAX) {
      onEvent({ type: 'text', content: '\n\n⚠️ Max iterations reached. Ask me to continue.' });
    }

    onEvent({ type: 'phase', phase: 'done', message: '✅ Done!' });
  }

  async runCommandStreaming(args, onEvent) {
    const timeout = Math.min((args.timeout || 60) * 1000, 180000);
    const command = args.command;

    onEvent({ type: 'command_start', command });

    return new Promise((resolve) => {
      const proc = spawn('bash', ['-c', command], {
        cwd: this.workspaceDir,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      let output = '';
      let lastStream = Date.now();

      const streamOutput = (data) => {
        output += data;
        // Throttle streaming to every 100ms
        const now = Date.now();
        if (now - lastStream > 100) {
          onEvent({ type: 'command_output', data: data.toString() });
          lastStream = now;
        }
      };

      proc.stdout.on('data', (d) => streamOutput(d.toString()));
      proc.stderr.on('data', (d) => streamOutput(d.toString()));

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        output += '\n[timeout]';
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);
        const finalOutput = output + `\n[exit code: ${code}]`;
        onEvent({ type: 'command_end', exitCode: code, output: finalOutput.substring(0, 3000) });
        resolve(finalOutput);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        const errMsg = `Error: ${err.message}\n[exit code: 1]`;
        onEvent({ type: 'command_end', exitCode: 1, output: errMsg });
        resolve(errMsg);
      });
    });
  }

  async executeTool(name, args) {
    switch (name) {
      case 'write_file':
        this.fileManager.writeFile(args.path, args.content);
        return `✅ Wrote ${args.path} (${args.content.length} bytes)`;

      case 'read_file':
        return this.fileManager.readFile(args.path);

      case 'edit_file': {
        const content = this.fileManager.readFile(args.path);
        if (!content.includes(args.old_text)) {
          return `❌ Text not found in ${args.path}`;
        }
        const updated = content.replace(args.old_text, args.new_text);
        this.fileManager.writeFile(args.path, updated);
        return `✅ Edited ${args.path}`;
      }

      case 'delete_file':
        this.fileManager.deleteFile(args.path);
        return `✅ Deleted ${args.path}`;

      case 'list_files':
        return this.fileManager.listDir(args.path || '.');

      case 'search': {
        const searchPath = args.path || '.';
        const fullPath = path.join(this.workspaceDir, searchPath);
        try {
          const { execSync } = require('child_process');
          const result = execSync(
            `grep -rn --include='*' "${args.pattern.replace(/"/g, '\\"')}" . 2>/dev/null | head -50`,
            { cwd: fullPath, encoding: 'utf-8', timeout: 15000 }
          );
          return result || 'No matches found.';
        } catch (err) {
          return err.stdout || 'No matches found.';
        }
      }

      case 'run_command':
        // Handled by streaming version
        return 'Use streaming version';

      case 'start_preview': {
        if (this.previewManager) {
          const result = this.previewManager.start(
            args.port || 8080,
            args.command || 'npx serve -s . -l 8080 --no-clipboard'
          );
          return `✅ Preview started on port ${result.port} (PID: ${result.pid}). User can view it in the Live Preview panel at /preview/`;
        }
        return 'Preview manager not available';
      }

      default:
        return `Unknown tool: ${name}`;
    }
  }
}

module.exports = { AgentService };
