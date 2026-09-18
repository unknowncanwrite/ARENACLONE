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
const { PreviewManager } = require('./services/preview');

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

// Ensure workspace directory exists
const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || './workspace');
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

// Services
const fileManager = new FileManager(WORKSPACE_DIR);
const terminalManager = new TerminalManager(WORKSPACE_DIR);
const previewManager = new PreviewManager(WORKSPACE_DIR);
const agentService = new AgentService(WORKSPACE_DIR, fileManager, terminalManager, previewManager);

// ==================== Preview Proxy ====================
// Proxy /preview/* to the running preview server

app.all('/preview', (req, res) => {
  const status = previewManager.getStatus();
  if (!status.running) {
    return res.send(`<!DOCTYPE html><html><head><style>
      body{background:#0a0a0f;color:#71717a;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    </style></head><body><div style="text-align:center">
      <div style="font-size:48px;margin-bottom:16px">🖥️</div>
      <h3 style="color:#e4e4e7;margin-bottom:8px">No Preview Running</h3>
      <p>Ask the agent to build and run something to see a live preview here.</p>
    </div></body></html>`);
  }
  // Redirect /preview to /preview/
  return res.redirect('/preview/');
});

app.use('/preview', (req, res) => {
  const status = previewManager.getStatus();
  if (!status.running) {
    return res.status(503).json({ error: 'No preview server running' });
  }

  const targetUrl = `http://127.0.0.1:${status.port}${req.url.replace(/^\/preview/, '')}`;
  
  const proxyReq = http.request(targetUrl, {
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${status.port}`,
    },
  }, (proxyRes) => {
    // Rewrite Location headers for redirects
    const headers = { ...proxyRes.headers };
    if (headers.location) {
      headers.location = headers.location.replace(
        `http://127.0.0.1:${status.port}`,
        `${req.protocol}://${req.get('host')}/preview`
      );
    }
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Preview proxy error:', err.message);
    res.status(502).json({ error: 'Preview server not responding' });
  });

  req.pipe(proxyReq);
});

// ==================== REST API Routes ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', workspace: WORKSPACE_DIR });
});

// Preview API
app.get('/api/preview/status', (req, res) => {
  res.json(previewManager.getStatus());
});

app.post('/api/preview/start', (req, res) => {
  try {
    const { port, command } = req.body;
    const result = previewManager.start(port || 8080, command || 'npm start');
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/preview/stop', (req, res) => {
  previewManager.stop();
  res.json({ success: true });
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

// Chat/Agent endpoint (SSE stream)
app.post('/api/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const { messages } = req.body;

  try {
    await agentService.run(messages, uuidv4(), (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
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
        if (parsed.type === 'terminal:input') term.write(parsed.data);
        else if (parsed.type === 'terminal:resize') term.resize(parsed.cols, parsed.rows);
      } catch (e) {}
    });
  }
});

// ==================== Serve Frontend ====================

const clientDist = path.join(__dirname, '..', 'client', 'dist');
console.log(`📂 Frontend at: ${clientDist} (${fs.existsSync(clientDist) ? 'found' : 'missing'})`);

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1d', index: 'index.html' }));
}

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/preview')) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  const indexPath = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  
  res.send('<h1 style="color:white;text-align:center;margin-top:40vh">Arena Agent Mode - Frontend not built</h1>');
});

// ==================== Start Server ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Arena Agent Mode running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Workspace: ${WORKSPACE_DIR}`);
  console.log(`🤖 Provider: ${process.env.ACTIVE_PROVIDER || 'dashscope'}`);
  console.log(`🖥️  Preview proxy: /preview/ → agent-built apps`);
});

// Cleanup on exit
process.on('SIGTERM', () => {
  terminalManager.killAll();
  previewManager.stop();
  process.exit(0);
});
process.on('SIGINT', () => {
  terminalManager.killAll();
  previewManager.stop();
  process.exit(0);
});
