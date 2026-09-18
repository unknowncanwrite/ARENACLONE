const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const SYSTEM_PROMPT = `You are a powerful AI coding agent. You build, test, and deliver applications step by step.

## Your Workflow — ALWAYS follow this:

### 1. 🧠 PLAN
Briefly outline what you're going to build.

### 2. 🏗️ BUILD
Create all files and install dependencies. Write complete, working code.

### 3. 🧪 TEST
Run the code, check for errors, fix any issues.

### 4. 🖥️ PREVIEW
Start a preview server on port 8080 so the user can see it live.
- Static HTML/CSS/JS: "npx serve -s . -l 8080 --no-clipboard"  
- Node.js server: "node server.js" (must use process.env.PORT || 8080)
- React/Vite: "npx vite --port 8080 --host 0.0.0.0"

### 5. ✅ RESULT
Brief summary. The user sees it live in the Preview panel!

## RULES
- ALWAYS use tools to do the work. Never just describe.
- Write COMPLETE files — no placeholders, no "add more here"
- Install deps before running code
- Test your work and fix errors immediately
- Start the preview when the app is ready
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
      description: 'Read file contents.',
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
      description: 'Execute a shell command. Output streams live to the terminal.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          timeout: { type: 'integer', description: 'Timeout seconds (default 60, max 180)' }
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
          path: { type: 'string', description: 'Directory (default: ".")' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing exact text.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old_text: { type: 'string', description: 'Text to find' },
          new_text: { type: 'string', description: 'Replacement text' }
        },
        required: ['path', 'old_text', 'new_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'start_preview',
      description: 'Start a live preview of the built app on port 8080. The user sees it in the Live Preview panel.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to start the app on port 8080' }
        },
        required: ['command']
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
        properties: { path: { type: 'string', description: 'Path to delete' } },
        required: ['path']
      }
    }
  }
];

class AgentService {
  constructor(workspaceDir, fileManager, terminalManager, previewManager, broadcast) {
    this.workspaceDir = workspaceDir;
    this.fileManager = fileManager;
    this.terminalManager = terminalManager;
    this.previewManager = previewManager;
    this.broadcast = broadcast || (() => {});

    const provider = process.env.ACTIVE_PROVIDER || 'dashscope';
    try {
      if (provider === 'xkiro') {
        this.client = new OpenAI({ apiKey: process.env.XKIRO_API_KEY || 'x', baseURL: process.env.XKIRO_BASE_URL });
        this.model = 'gpt-4o-mini';
      } else {
        this.client = new OpenAI({ apiKey: process.env.DASHSCOPE_API_KEY || 'x', baseURL: process.env.DASHSCOPE_BASE_URL });
        this.model = 'qwen-plus';
      }
      console.log(`🤖 LLM: ${provider} / ${this.model}`);
    } catch (err) {
      console.error('LLM init error:', err.message);
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

      // Use STREAMING for character-by-character output
      let fullContent = '';
      let toolCalls = {};
      let finishReason = null;

      try {
        const stream = await this.client.chat.completions.create({
          model: this.model,
          messages: history,
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.1,
          max_tokens: 4096,
          stream: true,
        });

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta;
          finishReason = chunk.choices?.[0]?.finish_reason;

          // Stream text content token by token
          if (delta?.content) {
            fullContent += delta.content;
            onEvent({ type: 'text_delta', content: delta.content });
          }

          // Accumulate tool calls from stream
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (!toolCalls[tc.index]) {
                toolCalls[tc.index] = { id: '', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCalls[tc.index].id = tc.id;
              if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
            }
          }
        }
      } catch (err) {
        console.error('LLM error:', err.message);
        onEvent({ type: 'error', error: `API Error: ${err.message}` });
        return;
      }

      // Detect phases from full content
      if (fullContent.includes('🏗️')) onEvent({ type: 'phase', phase: 'building', message: '🏗️ Building...' });
      if (fullContent.includes('🧪')) onEvent({ type: 'phase', phase: 'testing', message: '🧪 Testing...' });
      if (fullContent.includes('✅')) onEvent({ type: 'phase', phase: 'done', message: '✅ Complete!' });

      // Mark text as complete
      if (fullContent) {
        onEvent({ type: 'text_end' });
      }

      // Build assistant message for history
      const assistantMsg = { role: 'assistant', content: fullContent || null };
      const tcArray = Object.values(toolCalls);

      if (tcArray.length > 0) {
        assistantMsg.tool_calls = tcArray.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments }
        }));
      }

      // No tool calls = done
      if (tcArray.length === 0) break;

      history.push(assistantMsg);

      // Execute each tool call
      for (const call of tcArray) {
        const name = call.function.name;
        let args;
        try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

        onEvent({ type: 'tool_start', name, args });
        this.broadcast({ type: 'tool_start', name, args });

        let result;

        if (name === 'run_command') {
          result = await this.runCommandLive(args, onEvent);
        } else if (name === 'write_file') {
          result = this.executeWriteFile(args, onEvent);
        } else if (name === 'start_preview') {
          result = this.executeStartPreview(args, onEvent);
        } else {
          result = await this.executeTool(name, args);
        }

        onEvent({ type: 'tool_end', name, result: result.substring(0, 3000) });
        this.broadcast({ type: 'tool_end', name, result: result.substring(0, 500) });

        if (name === 'start_preview') {
          onEvent({ type: 'preview_started', port: 8080 });
          this.broadcast({ type: 'preview_started', port: 8080 });
        }

        // Refresh file tree after file operations
        if (['write_file', 'edit_file', 'delete_file'].includes(name)) {
          this.broadcast({ type: 'files_changed' });
        }

        history.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result.substring(0, 8000),
        });
      }
    }

    if (iterations >= MAX) {
      onEvent({ type: 'text_delta', content: '\n\n⚠️ Max iterations reached.' });
      onEvent({ type: 'text_end' });
    }

    onEvent({ type: 'phase', phase: 'done', message: '✅ Done!' });
  }

  // Run command with LIVE streaming to terminal AND chat
  async runCommandLive(args, onEvent) {
    const timeout = Math.min((args.timeout || 60) * 1000, 180000);
    const command = args.command;

    onEvent({ type: 'command_start', command });
    
    // Also send to the live terminal via broadcast
    this.broadcast({ type: 'terminal_write', data: `\x1b[36m$ ${command}\x1b[0m\r\n` });

    return new Promise((resolve) => {
      const proc = spawn('bash', ['-c', command], {
        cwd: this.workspaceDir,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      let output = '';

      proc.stdout.on('data', (d) => {
        const text = d.toString();
        output += text;
        // Stream to chat
        onEvent({ type: 'command_output', data: text });
        // Stream to live terminal
        this.broadcast({ type: 'terminal_write', data: text });
      });

      proc.stderr.on('data', (d) => {
        const text = d.toString();
        output += text;
        onEvent({ type: 'command_output', data: text });
        this.broadcast({ type: 'terminal_write', data: `\x1b[31m${text}\x1b[0m` });
      });

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        output += '\n[timeout]';
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timer);
        const result = output + `\n[exit code: ${code}]`;
        const statusMsg = code === 0 
          ? `\x1b[32m✓ exit ${code}\x1b[0m\r\n` 
          : `\x1b[31m✗ exit ${code}\x1b[0m\r\n`;
        this.broadcast({ type: 'terminal_write', data: statusMsg });
        onEvent({ type: 'command_end', exitCode: code, output: result.substring(0, 3000) });
        resolve(result);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        const errMsg = `Error: ${err.message}\n[exit code: 1]`;
        onEvent({ type: 'command_end', exitCode: 1, output: errMsg });
        resolve(errMsg);
      });
    });
  }

  executeWriteFile(args, onEvent) {
    this.fileManager.writeFile(args.path, args.content);
    // Broadcast file content update so editor can show it live
    this.broadcast({ type: 'file_written', path: args.path, size: args.content.length });
    return `✅ Wrote ${args.path} (${args.content.length} bytes)`;
  }

  executeStartPreview(args, onEvent) {
    if (this.previewManager) {
      const result = this.previewManager.start(8080, args.command || 'npx serve -s . -l 8080 --no-clipboard');
      return `✅ Preview started on port 8080 (PID: ${result.pid})`;
    }
    return 'Preview manager not available';
  }

  async executeTool(name, args) {
    switch (name) {
      case 'read_file':
        return this.fileManager.readFile(args.path);
      case 'edit_file': {
        const content = this.fileManager.readFile(args.path);
        if (!content.includes(args.old_text)) return `❌ Text not found in ${args.path}`;
        this.fileManager.writeFile(args.path, content.replace(args.old_text, args.new_text));
        this.broadcast({ type: 'file_written', path: args.path });
        return `✅ Edited ${args.path}`;
      }
      case 'delete_file':
        this.fileManager.deleteFile(args.path);
        return `✅ Deleted ${args.path}`;
      case 'list_files':
        return this.fileManager.listDir(args.path || '.');
      default:
        return `Unknown: ${name}`;
    }
  }
}

module.exports = { AgentService };
