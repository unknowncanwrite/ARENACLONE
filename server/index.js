const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const { AgentService } = require('./services/agent');
const { TerminalManager } = require('./services/terminal');
const { FileManager } = require('./services/files');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Ensure workspace directory exists
const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || './workspace');
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

// Services
const fileManager = new FileManager(WORKSPACE_DIR);
const terminalManager = new TerminalManager(WORKSPACE_DIR);
const agentService = new AgentService(WORKSPACE_DIR, fileManager, terminalManager);

// ==================== REST API Routes ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', workspace: WORKSPACE_DIR });
});

// File operations
app.get('/api/files', (req, res) => {
  try {
    const tree = fileManager.getTree();
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/files/read', (req, res) => {
  try {
    const content = fileManager.readFile(req.query.path);
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/write', (req, res) => {
  try {
    fileManager.writeFile(req.body.path, req.body.content);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/delete', (req, res) => {
  try {
    fileManager.deleteFile(req.body.path);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/rename', (req, res) => {
  try {
    fileManager.renameFile(req.body.oldPath, req.body.newPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chat/Agent endpoint (SSE stream)
app.post('/api/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const { messages, sessionId } = req.body;
  const session = sessionId || uuidv4();

  try {
    await agentService.run(messages, session, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    res.write(`data: ${JSON.stringify({ type: 'done', sessionId: session })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Agent error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }
});

// ==================== WebSocket (Terminal) ====================

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const type = url.searchParams.get('type');

  if (type === 'terminal') {
    const termId = url.searchParams.get('id') || uuidv4();
    const term = terminalManager.create(termId);
    
    ws.send(JSON.stringify({ type: 'terminal:id', id: termId }));

    term.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal:data', data }));
      }
    });

    term.onExit(({ exitCode }) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal:exit', exitCode }));
      }
    });

    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === 'terminal:input') {
          term.write(parsed.data);
        } else if (parsed.type === 'terminal:resize') {
          term.resize(parsed.cols, parsed.rows);
        }
      } catch (e) {
        // ignore
      }
    });

    ws.on('close', () => {
      // Don't destroy terminal on disconnect - user might reconnect
    });
  }
});

// ==================== Serve Frontend ====================

const clientDist = path.join(__dirname, '..', 'client', 'dist');
console.log(`📂 Looking for frontend at: ${clientDist}`);
console.log(`📂 Frontend exists: ${fs.existsSync(clientDist)}`);

if (fs.existsSync(clientDist)) {
  const files = fs.readdirSync(clientDist);
  console.log(`📂 Frontend files: ${files.join(', ')}`);
  app.use(express.static(clientDist, {
    maxAge: '1d',
    index: 'index.html'
  }));
}

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  const indexPath = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    console.log(`📄 Serving index.html for ${req.path}`);
    return res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('Error sending index.html:', err);
        res.status(500).send('Error loading application');
      }
    });
  }
  
  // Fallback if build doesn't exist
  console.log('⚠️  Frontend not built, serving fallback page');
  res.send(`<!DOCTYPE html>
<html><head><title>Arena Agent Mode</title>
<style>body{background:#0a0a0f;color:#e4e4e7;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:#12121a;border:1px solid #1e1e2e;border-radius:12px;padding:40px;max-width:500px;text-align:center}
h1{color:#6366f1;margin-bottom:16px}code{background:#1a1a2e;padding:2px 8px;border-radius:4px}</style></head>
<body><div class="box"><h1>⚠️ Frontend Not Built</h1>
<p>The client needs to be built first.</p>
<p>Run: <code>cd client && npm install && npm run build</code></p>
<p>Or redeploy with the correct build command.</p></div></body></html>`);
});

// ==================== Start Server ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Arena Agent Mode running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Workspace: ${WORKSPACE_DIR}`);
  console.log(`🤖 Provider: ${process.env.ACTIVE_PROVIDER || 'dashscope'}`);
});

// Cleanup on exit
process.on('SIGTERM', () => {
  terminalManager.killAll();
  process.exit(0);
});
process.on('SIGINT', () => {
  terminalManager.killAll();
  process.exit(0);
});
