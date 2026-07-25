const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Find the installed Chrome executable on Windows
function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Google Chrome not found. Install Chrome and try again.');
}

// Wait until the CDP endpoint is ready (polls every 300ms up to timeoutMs)
function waitForCDP(cdpUrl, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const url = new URL(cdpUrl);

    function attempt() {
      const req = http.get({ hostname: url.hostname, port: url.port, path: '/json/version' }, () => {
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Chrome CDP not ready at ${cdpUrl} after ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, 300);
        }
      });
      req.end();
    }
    attempt();
  });
}

// Quick one-shot check: is CDP already up? Resolves true/false immediately (no retry).
function isCDPAlive(cdpUrl) {
  return new Promise((resolve) => {
    const url = new URL(cdpUrl);
    const req = http.get(
      { hostname: url.hostname, port: url.port, path: '/json/version', timeout: 1500 },
      () => resolve(true),
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Launch Chrome as a COMPLETELY NORMAL process (no Playwright control),
 * then connect via CDP. This means Chrome has zero automation flags
 * and Akamai/bot-detection cannot distinguish it from a user's real Chrome.
 *
 * If Chrome is already running on the CDP port (e.g. from a previous run),
 * we reuse it instead of spawning a second instance — which would crash.
 */
async function launchPersistentBrowser(appConfig) {
  const cdpUrl = appConfig.browser.cdpUrl; // http://127.0.0.1:9222
  const cdpPort = new URL(cdpUrl).port || '9222';
  const userDataDir = appConfig.browser.userDataDir;

  // ── Check if Chrome is already alive on this port ────────────────────────
  const alreadyRunning = await isCDPAlive(cdpUrl);

  if (alreadyRunning) {
    console.log('Chrome is already running. Reusing existing session...');
  } else {
    // Ensure profile dir exists before launching
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    console.log('Launching real Chrome (no automation flags)...');

    // Spawn Chrome as a completely normal process — only --remote-debugging-port is added.
    // This is the same as the user manually starting Chrome; Akamai cannot detect automation.
    const chromeProcess = spawn(
      findChrome(),
      [
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--start-maximized',
        'about:blank',
      ],
      { detached: false, stdio: 'ignore' },
    );

    chromeProcess.on('error', (err) => {
      throw new Error(`Chrome failed to start: ${err.message}`);
    });

    // Wait for Chrome's CDP endpoint to be ready
    await waitForCDP(cdpUrl);
    console.log('Chrome is ready. Connecting via CDP...');
  }

  // Connect Playwright as a controller — Chrome itself is a normal process
  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();

  return {
    context,
    page,
    close: async () => {
      await browser.disconnect();
    },
  };
}

// Attach to an already-running Chrome session directly (no spawn fallback).
async function launchAttachedBrowser(appConfig) {
  const browser = await chromium.connectOverCDP(appConfig.browser.cdpUrl);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();

  return {
    browser,
    context,
    page,
    close: async () => {
      await browser.disconnect();
    },
  };
}

module.exports = { launchPersistentBrowser, launchAttachedBrowser };
