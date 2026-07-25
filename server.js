'use strict';

const express = require('express');
const { WebSocketServer } = require('ws');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 3000;
const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config', 'dashboard-config.json');
const STATS_PATH = path.join(ROOT, 'logs', 'stats.json');
const PROGRESS_PATH = path.join(ROOT, 'logs', 'progress.json');
const COLLECTED_PATH = path.join(ROOT, 'logs', 'collected-urls.json');
const CONTROL_PATH = path.join(ROOT, 'logs', 'control.json');

const DEFAULT_CONFIG = {
  shopUrls: ['https://www.meesho.com/CJMENTERPRISE?ms=2'],
  executionMode: 'serial', // 'serial' or 'parallel'
  speedLevel: 5,
  imagePauseBase: 500,
  productPauseBase: 1500,
  buyNowPauseBase: 3000,
  jumpToIndex: 1,
};

// ── helpers ────────────────────────────────────────────────────────────────
function readJSON(filePath, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return fallback; }
}

function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

function initConfig() {
  ensureDir(CONFIG_PATH);
  if (!fs.existsSync(CONFIG_PATH))
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));

  ensureDir(CONTROL_PATH);
  if (!fs.existsSync(CONTROL_PATH))
    fs.writeFileSync(CONTROL_PATH, JSON.stringify({ isPaused: false }, null, 2));
}

// Extract human readable title from meesho URL slug
function parseProductMeta(url, idx) {
  try {
    const parts = url.split('/p/');
    const slug = parts[0].split('/').pop() || '';
    const pid = parts[1] ? parts[1].split('?')[0] : '';
    const title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { index: idx + 1, url, title: title || `Product #${idx + 1}`, pid };
  } catch {
    return { index: idx + 1, url, title: `Product #${idx + 1}`, pid: '' };
  }
}

// ── Express setup ─────────────────────────────────────────────────────────
initConfig();
const app = express();

app.use(express.json());
app.use(express.static(ROOT)); // serves dashboard.html etc.

let activeProcesses = [];
const wsClients = new Set();

// ── REST ───────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'dashboard.html')));

app.get('/api/config', (_req, res) => res.json(readJSON(CONFIG_PATH, DEFAULT_CONFIG)));

app.post('/api/config', (req, res) => {
  ensureDir(CONFIG_PATH);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(req.body, null, 2));
  res.json({ ok: true });
});

app.get('/api/stats', (_req, res) => res.json(readJSON(STATS_PATH, {})));

app.get('/api/products', (req, res) => {
  const config = readJSON(CONFIG_PATH, DEFAULT_CONFIG);
  const collected = readJSON(COLLECTED_PATH, { urls: [], shops: [] });
  const progress = readJSON(PROGRESS_PATH, { visitedUrls: [] });
  const visitedSet = new Set(progress.visitedUrls || []);

  const configShopUrls = config.shopUrls || [];
  const collectedShopUrls = (collected.shops || []).map((s) => s.shopUrl);

  // Union of configured shops and collected shops so newly added shops appear immediately
  const shopsList = Array.from(new Set([...configShopUrls, ...collectedShopUrls]));

  const filterShopUrl = req.query.shopUrl || '';

  let targetUrls = collected.urls || [];
  if (filterShopUrl && filterShopUrl !== 'ALL') {
    if (collected.shops && collected.shops.length > 0) {
      const foundShop = collected.shops.find((s) => s.shopUrl === filterShopUrl);
      if (foundShop) {
        targetUrls = foundShop.urls;
      }
    }
  }

  const items = targetUrls.map((url, i) => {
    const meta = parseProductMeta(url, i);
    return { ...meta, visited: visitedSet.has(url) };
  });

  res.json({
    items,
    shops: shopsList,
    selectedShop: filterShopUrl,
    total: items.length,
    visitedCount: items.filter((x) => x.visited).length,
    pendingCount: items.filter((x) => !x.visited).length,
  });
});

app.post('/api/pause', (_req, res) => {
  ensureDir(CONTROL_PATH);
  fs.writeFileSync(CONTROL_PATH, JSON.stringify({ isPaused: true }, null, 2));
  broadcast({ type: 'log', text: '\n⏸  Pause command sent.\n' });
  broadcast({ type: 'control', isPaused: true });
  res.json({ ok: true });
});

app.post('/api/resume-control', (_req, res) => {
  ensureDir(CONTROL_PATH);
  fs.writeFileSync(CONTROL_PATH, JSON.stringify({ isPaused: false }, null, 2));
  broadcast({ type: 'log', text: '\n▶  Resume command sent.\n' });
  broadcast({ type: 'control', isPaused: false });
  res.json({ ok: true });
});

app.post('/api/start', (req, res) => {
  // Ensure unpaused when starting
  ensureDir(CONTROL_PATH);
  fs.writeFileSync(CONTROL_PATH, JSON.stringify({ isPaused: false }, null, 2));

  if (activeProcesses.length > 0)
    return res.json({ ok: false, error: 'Automation is already running' });

  const config = readJSON(CONFIG_PATH, DEFAULT_CONFIG);
  const { mode = 'resume', jumpToIndex = 1 } = req.body || {};

  config.jumpToIndex = (mode === 'jump') ? jumpToIndex : 1;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  if (mode === 'fresh') {
    ensureDir(PROGRESS_PATH);
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify({ visitedUrls: [] }, null, 2));
  } else if (mode === 'jump' && jumpToIndex > 1) {
    const collected = readJSON(COLLECTED_PATH, { urls: [] });
    if (collected.urls && collected.urls.length >= jumpToIndex - 1) {
      const toSkip = collected.urls.slice(0, jumpToIndex - 1);
      ensureDir(PROGRESS_PATH);
      fs.writeFileSync(PROGRESS_PATH, JSON.stringify({ visitedUrls: toSkip }, null, 2));
    }
  }

  const isParallel = config.executionMode === 'parallel' && (config.shopUrls || []).length > 1;

  if (isParallel) {
    broadcast({ type: 'log', text: `\n▶  Starting PARALLEL execution across ${config.shopUrls.length} shops...\n` });
    // In parallel mode, spawn process per shop URL
    config.shopUrls.forEach((shopUrl, i) => {
      const env = { ...process.env, MEESHO_SHOP_URL: shopUrl };
      const proc = spawn('node', ['index.js'], { cwd: ROOT, env });
      activeProcesses.push(proc);

      proc.stdout.on('data', (d) => broadcast({ type: 'log', text: `[Shop ${i + 1}] ${d.toString()}` }));
      proc.stderr.on('data', (d) => broadcast({ type: 'log', text: `[Shop ${i + 1}] ${d.toString()}`, isError: true }));

      proc.on('close', () => {
        activeProcesses = activeProcesses.filter((p) => p !== proc);
        if (activeProcesses.length === 0) {
          broadcast({ type: 'status', running: false });
          broadcast({ type: 'log', text: `\n■  All parallel shop sessions finished.\n` });
        }
      });
    });
  } else {
    broadcast({ type: 'log', text: `\n▶  Starting SERIAL execution (mode: ${mode})\n` });
    const proc = spawn('node', ['index.js'], { cwd: ROOT });
    activeProcesses.push(proc);

    proc.stdout.on('data', (d) => broadcast({ type: 'log', text: d.toString() }));
    proc.stderr.on('data', (d) => broadcast({ type: 'log', text: d.toString(), isError: true }));

    proc.on('close', (code) => {
      activeProcesses = [];
      broadcast({ type: 'status', running: false });
      broadcast({ type: 'log', text: `\n■  Process exited (code ${code})\n` });
      try {
        const s = readJSON(STATS_PATH, {});
        s.isRunning = false;
        fs.writeFileSync(STATS_PATH, JSON.stringify(s, null, 2));
      } catch { }
    });
  }

  broadcast({ type: 'status', running: true });
  res.json({ ok: true });
});

app.post('/api/stop', (_req, res) => {
  activeProcesses.forEach((proc) => {
    try { proc.kill('SIGTERM'); } catch (e) { }
  });
  activeProcesses = [];
  broadcast({ type: 'status', running: false });
  broadcast({ type: 'log', text: '\n⏹ Process stopped by user.\n' });
  res.json({ ok: true });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wsClients.forEach((ws) => { if (ws.readyState === 1) ws.send(msg); });
}

// Push stats every 2 s
setInterval(() => {
  const s = readJSON(STATS_PATH, null);
  if (s) broadcast({ type: 'stats', ...s });
}, 2000);

// ── Start with Port Fallback ─────────────────────────────────────────────
function startServer(portToTry) {
  const serverInstance = http.createServer(app);
  const wssInstance = new WebSocketServer({ server: serverInstance, path: '/ws' });
  wssInstance.on('error', () => { }); // silence port collision re-emit

  wssInstance.on('connection', (ws) => {
    wsClients.add(ws);
    ws.send(JSON.stringify({ type: 'stats', ...readJSON(STATS_PATH, {}) }));
    ws.send(JSON.stringify({ type: 'status', running: activeProcesses.length > 0 }));
    ws.on('close', () => wsClients.delete(ws));
  });

  serverInstance.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${portToTry} is currently in use, trying port ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  serverInstance.listen(portToTry, () => {
    const url = `http://localhost:${portToTry}`;
    console.log(`\n🚀  Meesho Watcher Dashboard running at → ${url}\n`);
    exec(`start ${url}`, (err) => { if (err) console.log(`Open: ${url}`); });
  });
}

startServer(parseInt(process.env.PORT, 10) || PORT);


