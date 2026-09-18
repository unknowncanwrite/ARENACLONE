# 🏟️ Arena Agent Mode Clone

A full-featured AI coding agent interface inspired by Arena.ai's Agent Mode. Deploy on Render and get your own AI-powered development environment with chat, terminal, file explorer, and code editor.

![Arena Agent Mode](https://img.shields.io/badge/Arena-Agent%20Mode-6366f1?style=for-the-badge)

## ✨ Features

- **🤖 AI Agent Chat** - Conversational AI with tool-use capabilities (reads/writes files, runs commands, edits code)
- **📁 File Explorer** - Browse and navigate your workspace files with a tree view
- **✏️ Code Editor** - Monaco Editor (VS Code's editor) with syntax highlighting for 20+ languages
- **💻 Live Terminal** - Full PTY terminal with xterm.js, connected to your workspace
- **🔄 Real-time Tool Display** - Watch the agent work with expandable tool call cards
- **📱 Responsive Layout** - Resizable panels with drag handles
- **🌙 Dark Theme** - Beautiful dark UI optimized for coding

## 🚀 Quick Deploy to Render

### One-Click Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Manual Deploy

1. **Fork this repository** to your GitHub account

2. **Create a new Web Service on Render**:
   - Go to [render.com](https://render.com) → New → Web Service
   - Connect your forked repository
   - Render will auto-detect the `render.yaml` configuration

3. **Set Environment Variables** in Render dashboard:
   ```
   DASHSCOPE_API_KEY=your_dashscope_key
   DASHSCOPE_BASE_URL=https://ws-8euxjezal8y5x0vi.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
   ACTIVE_PROVIDER=dashscope
   ```

   **OR** for XKiro:
   ```
   XKIRO_API_KEY=your_xkiro_key
   XKIRO_BASE_URL=https://api.xkiro.com/v1
   ACTIVE_PROVIDER=xkiro
   ```

4. **Deploy!** 🎉

## 🛠️ Local Development

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd ARENACLONE

# Install all dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys

# Run in development mode
npm run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (frontend + backend) |
| `npm run build` | Build frontend for production |
| `npm start` | Start production server |
| `npm run install:all` | Install all dependencies |

## 🏗️ Architecture

```
ARENACLONE/
├── server/
│   ├── index.js              # Express + WebSocket server
│   └── services/
│       ├── agent.js          # AI Agent with tool-use loop
│       ├── terminal.js       # PTY terminal manager (node-pty)
│       └── files.js          # File system operations
├── client/
│   ├── src/
│   │   ├── App.jsx           # Main layout
│   │   ├── store.js          # Zustand state management
│   │   └── components/
│   │       ├── Header.jsx    # Top navigation bar
│   │       ├── Sidebar.jsx   # File explorer tree
│   │       ├── ChatPanel.jsx # Agent chat interface
│   │       ├── EditorPanel.jsx # Monaco code editor
│   │       └── TerminalPanel.jsx # xterm.js terminal
│   └── vite.config.js        # Vite dev server config
├── workspace/                 # Agent's working directory
├── render.yaml               # Render deployment config
└── package.json
```

## 🤖 Supported LLM Providers

The agent supports any OpenAI-compatible API:

| Provider | Model | Base URL |
|----------|-------|----------|
| **DashScope** (default) | qwen-plus | Alibaba Cloud |
| **XKiro** | gpt-4o-mini | api.xkiro.com |
| **Custom** | Any | Any OpenAI-compatible endpoint |

Set `ACTIVE_PROVIDER` in your environment to switch.

## 🔧 Agent Tools

The AI agent has access to these tools:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Create/overwrite files |
| `edit_file` | Find and replace in files |
| `delete_file` | Delete files or directories |
| `list_directory` | List directory contents |
| `run_command` | Execute shell commands |
| `search_files` | Grep search across files |

## 📝 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ACTIVE_PROVIDER` | Yes | `dashscope` or `xkiro` |
| `DASHSCOPE_API_KEY` | If dashscope | DashScope API key |
| `DASHSCOPE_BASE_URL` | If dashscope | DashScope API endpoint |
| `XKIRO_API_KEY` | If xkiro | XKiro API key |
| `XKIRO_BASE_URL` | If xkiro | XKiro API endpoint |
| `PORT` | No | Server port (default: 3000) |
| `WORKSPACE_DIR` | No | Workspace path (default: ./workspace) |

## 🎯 How It Works

1. **User sends a message** in the chat panel
2. **The agent** processes the message with the LLM
3. **The LLM decides** which tools to use (read files, run commands, etc.)
4. **Tools execute** in the sandbox workspace
5. **Results feed back** to the LLM for further reasoning
6. **Loop continues** until the task is complete
7. **Response streams** back to the user in real-time

## ⚠️ Security Notes

- The workspace is sandboxed to the `workspace/` directory
- Path traversal is blocked in file operations
- For production use, consider adding authentication
- Terminal commands run with the server's user permissions

## 📄 License

MIT
