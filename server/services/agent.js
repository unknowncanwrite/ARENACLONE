const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const SYSTEM_PROMPT = `You are a powerful AI coding agent running inside a sandboxed workspace environment. You help users build, debug, and deploy applications.

You have access to the following tools to interact with the workspace. ALWAYS use tools when you need to read, write, or explore files, or run commands. Never pretend to have done something — actually do it using the tools.

IMPORTANT RULES:
- Always explore the workspace before making changes
- Write complete, working code — no placeholders like "// add more here"
- Explain what you're doing as you go
- If a command fails, debug it and try again
- Create files with complete content, never partial
- When editing files, use write_file with the complete file content
- Run commands to verify your work (npm install, npm run build, etc.)
- Install dependencies before running code
`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file from the workspace. Returns file content as text.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file in the workspace with the given content. Parent directories are created automatically.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          content: { type: 'string', description: 'The complete file content to write' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command in the workspace directory. Returns stdout and stderr. Use for npm install, git, building, testing, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The bash command to execute' },
          timeout: { type: 'integer', description: 'Timeout in seconds (default 30, max 120)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files and directories in the given path (default: workspace root). Shows file sizes and types.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path relative to workspace root (default: ".")' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing an exact text match with new text. Use for targeted edits without rewriting the whole file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          old_text: { type: 'string', description: 'The exact text to find and replace' },
          new_text: { type: 'string', description: 'The replacement text' }
        },
        required: ['path', 'old_text', 'new_text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file or empty directory from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for a text pattern across files in the workspace using grep. Returns matching lines with file paths.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Text or regex pattern to search for' },
          path: { type: 'string', description: 'Directory to search in (default: workspace root)' }
        },
        required: ['pattern']
      }
    }
  }
];

class AgentService {
  constructor(workspaceDir, fileManager, terminalManager) {
    this.workspaceDir = workspaceDir;
    this.fileManager = fileManager;
    this.terminalManager = terminalManager;

    // Initialize OpenAI-compatible client
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
    } catch (err) {
      console.error('Failed to initialize LLM client:', err.message);
      this.client = null;
    }
  }

  async run(messages, sessionId, onEvent) {
    const conversationHistory = [
      { role: 'system', content: SYSTEM_PROMPT + `\n\nCurrent workspace directory: ${this.workspaceDir}` },
      ...messages
    ];

    let iterations = 0;
    const MAX_ITERATIONS = 25;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      let response;
      try {
        if (!this.client) {
          onEvent({ type: 'error', error: 'LLM client not initialized. Check your API keys in .env' });
          return;
        }
        response = await this.client.chat.completions.create({
          model: this.model,
          messages: conversationHistory,
          tools: TOOLS,
          tool_choice: 'auto',
          temperature: 0.1,
          max_tokens: 4096,
        });
      } catch (err) {
        console.error('LLM API error:', err.message);
        onEvent({ type: 'error', error: `LLM API error: ${err.message}` });
        return;
      }

      const choice = response.choices[0];
      const assistantMessage = choice.message;

      // Stream the text content
      if (assistantMessage.content) {
        onEvent({ type: 'assistant', content: assistantMessage.content });
      }

      // If no tool calls, we're done
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        break;
      }

      // Add assistant message to history
      conversationHistory.push(assistantMessage);

      // Process tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        const fnName = toolCall.function.name;
        let fnArgs;
        try {
          fnArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          fnArgs = {};
        }

        onEvent({ type: 'tool_call', name: fnName, args: fnArgs });

        let result;
        try {
          result = await this.executeTool(fnName, fnArgs);
        } catch (err) {
          result = `Error: ${err.message}`;
        }

        onEvent({ type: 'tool_result', name: fnName, result: result.substring(0, 2000) });

        conversationHistory.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.substring(0, 8000), // Limit result size
        });
      }
    }

    if (iterations >= MAX_ITERATIONS) {
      onEvent({ type: 'assistant', content: '\n\n⚠️ Reached maximum iterations. Please continue the conversation to proceed.' });
    }
  }

  async executeTool(name, args) {
    switch (name) {
      case 'read_file':
        return this.fileManager.readFile(args.path);

      case 'write_file':
        this.fileManager.writeFile(args.path, args.content);
        return `Successfully wrote to ${args.path}`;

      case 'edit_file': {
        const content = this.fileManager.readFile(args.path);
        if (!content.includes(args.old_text)) {
          return `Error: Could not find the specified text in ${args.path}`;
        }
        const newContent = content.replace(args.old_text, args.new_text);
        this.fileManager.writeFile(args.path, newContent);
        return `Successfully edited ${args.path}`;
      }

      case 'delete_file':
        this.fileManager.deleteFile(args.path);
        return `Successfully deleted ${args.path}`;

      case 'list_directory':
        return this.fileManager.listDir(args.path || '.');

      case 'run_command': {
        const timeout = Math.min((args.timeout || 30) * 1000, 120000);
        return new Promise((resolve) => {
          const proc = spawn('bash', ['-c', args.command], {
            cwd: this.workspaceDir,
            env: { ...process.env, PATH: process.env.PATH },
            timeout,
          });
          let stdout = '';
          let stderr = '';
          proc.stdout.on('data', (d) => { stdout += d.toString(); });
          proc.stderr.on('data', (d) => { stderr += d.toString(); });
          proc.on('close', (code) => {
            let result = '';
            if (stdout) result += stdout;
            if (stderr) result += (result ? '\n' : '') + stderr;
            result += `\n[exit code: ${code}]`;
            resolve(result.substring(0, 8000));
          });
          proc.on('error', (err) => {
            resolve(`Error: ${err.message}`);
          });
        });
      }

      case 'search_files': {
        const searchPath = args.path || '.';
        const fullPath = path.join(this.workspaceDir, searchPath);
        try {
          const result = execSync(
            `grep -r --include='*' -n "${args.pattern.replace(/"/g, '\\"')}" . 2>/dev/null | head -50`,
            { cwd: fullPath, encoding: 'utf-8', timeout: 15000 }
          );
          return result || 'No matches found.';
        } catch (err) {
          if (err.stdout) return err.stdout || 'No matches found.';
          return `Search error: ${err.message}`;
        }
      }

      default:
        return `Unknown tool: ${name}`;
    }
  }
}

module.exports = { AgentService };
