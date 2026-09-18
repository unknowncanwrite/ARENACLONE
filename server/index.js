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

// Track all connected WebSocket clients for broadcasting
const wsClients = new Set();

// Broadcast function - sends to all connected clients
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  }
}

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

// Ensure workspace
const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || './workspace');
if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

// Services
const fileManager = new FileManager(WORKSPACE_DIR);
const terminalManager = new TerminalManager(WORKSPACE_DIR);
const previewManager = new PreviewManager(WORKSPACE_DIR);
const agentService = new AgentService(WORKSPACE_DIR, fileManager, terminalManager, previewManager, broadcast);

// ==================== Preview Proxy ====================

app.all('/preview', (req, res) => {
  const status = previewManager.getStatus();
  if (!status.running) {
    return res.send(`<!DOCTYPE html><html><head><style>body{background:#0a0a0f;color:#71717a;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style></head><body><div style="text-align:center"><div style="font-size:48px;margin-bottom:16px">🖥️</div><h3 style="color:#e4e4e7">No Preview Running</h3><p>Ask the agent to build something!</p></div></body></html>`);
  }
  return res.redirect('/preview/');
});

app.use('/preview', (req, res) => {
  const status = previewManager.getStatus();
  if (!status.running) return res.status(503).json({ error: 'No preview running' });

  const targetPath = req.url.replace(/^\/preview/, '') || '/';
  const targetUrl = `http://127.0.0.1:${status.port}${targetPath}`;
  
  const proxyReq = http.request(targetUrl, {
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${status.port}` },
  }, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    if (headers.location) {
      headers.location = headers.location.replace(`http://127.0.0.1:${status.port}`, `${req.protocol}://${req.get('host')}/preview`);
    }
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => res.status(502).json({ error: 'Preview not responding' }));
  req.pipe(proxyReq);
});

// ==================== REST API ====================

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/preview/status', (req, res) => res.json(previewManager.getStatus()));
app.post('/api/preview/stop', (req, res) => { previewManager.stop(); res.json({ ok: true }); });

app.get('/api/files', (req, res) => {
  try { res.json(fileManager.getTree()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/files/read', (req, res) => {
  try { res.json({ content: fileManager.readFile(req.query.path) }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/files/write', (req, res) => {
  try { fileManager.writeFile(req.body.path, req.body.content); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// Chat/Agent SSE endpoint
app.post('/api/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    await agentService.run(req.body.messages, uuidv4(), (event) => {
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

// ==================== WebSocket ====================

wss.on('connection', (ws, req) => {
  wsClients.add(ws);
  
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

  ws.on('close', () => {
    wsClients.delete(ws);
  });
});

// Also handle broadcast events that target the terminal
// When agent broadcasts terminal_write, send to all terminal connections
const origBroadcast = broadcast;

// Override broadcast to also write to terminals
function broadcastWithTerminal(data) {
  const msg = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState !== ws.OPEN) continue;
    
    if (data.type === 'terminal_write') {
      // Send as terminal data to terminal connections
      ws.send(JSON.stringify({ type: 'terminal:data', data: data.data }));
    } else {
      ws.send(msg);
    }
  }
}

// Replace broadcast in agent service
agentService.broadcast = broadcastWithTerminal;

// ==================== Serve Frontend ====================

const clientDist = path.join(__dirname, '..', 'client', 'dist');
console.log(`📂 Frontend: ${fs.existsSync(clientDist) ? 'found' : 'missing'}`);

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1d', index: 'index.html' }));
}

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/preview')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const indexPath = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.send('<h1 style="color:white;text-align:center;margin-top:40vh">Frontend not built</h1>');
});

// ==================== Start ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Arena Agent Mode on http://0.0.0.0:${PORT}`);
  console.log(`📁 Workspace: ${WORKSPACE_DIR}`);
  console.log(`🤖 Provider: ${process.env.ACTIVE_PROVIDER || 'dashscope'}`);
  console.log(`🖥️  Preview: /preview/ → agent apps`);
});

process.on('SIGTERM', () => { terminalManager.killAll(); previewManager.stop(); process.exit(0); });
process.on('SIGINT', () => { terminalManager.killAll(); previewManager.stop(); process.exit(0); });
