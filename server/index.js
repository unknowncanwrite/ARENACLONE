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

// Track WebSocket clients
const wsClients = new Set();

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

// Broadcast with terminal routing
function broadcastAll(data) {
  for (const ws of wsClients) {
    if (ws.readyState !== ws.OPEN) continue;
    if (data.type === 'terminal_write') {
      ws.send(JSON.stringify({ type: 'terminal:data', data: data.data }));
    } else {
      ws.send(JSON.stringify(data));
    }
  }
}

// WebSocket upgrade
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

// Workspace
const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || './workspace');
if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

// Services
const fileManager = new FileManager(WORKSPACE_DIR);
const terminalManager = new TerminalManager(WORKSPACE_DIR);
const previewManager = new PreviewManager(WORKSPACE_DIR);
const agentService = new AgentService(WORKSPACE_DIR, fileManager, terminalManager, previewManager, broadcastAll);

// ==================== API Routes ====================

app.get('/api/health', (req, res) => res.json({ status: 'ok', preview: previewManager.getStatus() }));
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

// Chat/Agent SSE
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

// ==================== Preview Proxy ====================
// Only proxy /preview/* paths — do NOT redirect the root URL

app.use('/preview', (req, res) => {
  const status = previewManager.getStatus();
  if (!status.running) {
    return res.send(`<!DOCTYPE html><html><head><style>
      body{background:#0a0a0f;color:#71717a;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    </style></head><body><div style="text-align:center">
      <div style="font-size:48px;margin-bottom:16px">🖥️</div>
      <h3 style="color:#e4e4e7;margin-bottom:8px">No Preview Running</h3>
      <p>Ask the agent to build and run something!</p>
    </div></body></html>`);
  }

  // Strip /preview prefix from the path
  let targetPath = req.originalUrl.replace(/^\/preview/, '') || '/';
  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;
  
  const targetUrl = `http://127.0.0.1:${status.port}${targetPath}`;
  
  const proxyReq = http.request(targetUrl, {
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${status.port}` },
  }, (proxyRes) => {
    // Rewrite redirect Location headers to go through /preview
    const headers = { ...proxyRes.headers };
    if (headers.location) {
      try {
        const loc = new URL(headers.location);
        if (loc.hostname === '127.0.0.1' || loc.hostname === 'localhost') {
          const basePath = `${req.protocol}://${req.get('host')}/preview`;
          headers.location = basePath + loc.pathname.replace(/^\//, '') + loc.search;
        }
      } catch (e) {}
    }
    // Remove security headers that might cause issues
    delete headers['x-frame-options'];
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Preview proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).send('Preview server not responding');
    }
  });

  req.pipe(proxyReq);
});

// ==================== Serve Frontend ====================

const clientDist = path.join(__dirname, '..', 'client', 'dist');
const indexHtml = path.join(clientDist, 'index.html');
const hasFrontend = fs.existsSync(indexHtml);

console.log(`📂 Frontend: ${hasFrontend ? 'found at ' + clientDist : 'NOT FOUND'}`);

if (hasFrontend) {
  // Serve static assets with cache
  app.use('/assets', express.static(path.join(clientDist, 'assets'), { maxAge: '7d' }));
  app.use(express.static(clientDist, { maxAge: '1d', index: false, redirect: false }));
}

// SPA catch-all — serve index.html for ALL non-API, non-preview routes
app.get('*', (req, res) => {
  // Skip API and preview paths
  if (req.path.startsWith('/api') || req.path.startsWith('/preview') || req.path.startsWith('/ws')) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (hasFrontend) {
    return res.sendFile(indexHtml);
  }

  // Fallback page if frontend not built
  res.send(`<!DOCTYPE html><html><head><title>Arena Agent</title>
<style>body{background:#0a0a0f;color:#e4e4e7;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{background:#12121a;border:1px solid #1e1e2e;border-radius:12px;padding:40px;max-width:500px;text-align:center}
h1{color:#6366f1}code{background:#1a1a2e;padding:2px 8px;border-radius:4px}</style></head>
<body><div class="box"><h1>Arena Agent Mode</h1><p>Frontend not built.</p><p>Run: <code>cd client && npm run build</code></p></div></body></html>`);
});

// ==================== WebSocket Handler ====================

wss.on('connection', (ws, req) => {
  wsClients.add(ws);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const type = url.searchParams.get('type');

  if (type === 'terminal') {
    const termId = url.searchParams.get('id') || uuidv4();
    const term = terminalManager.create(termId);
    ws.send(JSON.stringify({ type: 'terminal:id', id: termId }));

    term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'terminal:data', data }));
    });
    term.onExit(({ exitCode }) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'terminal:exit', exitCode }));
    });
    ws.on('message', (msg) => {
      try {
        const p = JSON.parse(msg);
        if (p.type === 'terminal:input') term.write(p.data);
        else if (p.type === 'terminal:resize') term.resize(p.cols, p.rows);
      } catch (e) {}
    });
  }
  // 'events' type just registers for broadcasts — no terminal

  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

// ==================== Start ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Arena Agent Mode on http://0.0.0.0:${PORT}`);
  console.log(`📁 Workspace: ${WORKSPACE_DIR}`);
  console.log(`🤖 LLM: ${process.env.ACTIVE_PROVIDER || 'dashscope'}`);
  console.log(`🖥️  Preview: /preview/`);
  console.log(`📂 Frontend: ${hasFrontend ? 'READY' : 'MISSING'}`);
});

process.on('SIGTERM', () => { terminalManager.killAll(); previewManager.stop(); process.exit(0); });
process.on('SIGINT', () => { terminalManager.killAll(); previewManager.stop(); process.exit(0); });
