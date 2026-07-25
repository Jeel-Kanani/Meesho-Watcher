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

// Wait until the CDP endpoint is ready
function waitForCDP(cdpUrl, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const url = new URL(cdpUrl);

    function attempt() {
      const req = http.get({ hostname: url.hostname, port: url.port, path: '/json/version' }, (res) => {
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

/**
 * Launch Chrome as a COMPLETELY NORMAL process (no Playwright control),
 * then connect via CDP. This means Chrome has zero automation flags
 * and Akamai/bot-detection cannot distinguish it from a user's real Chrome.
 */
async function launchPersistentBrowser(appConfig) {
  const chromePath = findChrome();
  const userDataDir = appConfig.browser.userDataDir;
  const cdpUrl = appConfig.browser.cdpUrl; // http://127.0.0.1:9222
  const cdpPort = new URL(cdpUrl).port || '9222';

  // Ensure profile dir exists
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  console.log(`Launching real Chrome (no automation flags)...`);

  // Spawn Chrome as a completely normal process — only --remote-debugging-port is added
  // This is the same as the user manually starting Chrome; Akamai cannot detect automation
  const chromeProcess = spawn(
    chromePath,
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

  // Connect Playwright as a controller — Chrome itself is a normal process
  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();

  return {
    context,
    page,
    close: async () => {
      await browser.disconnect();
      chromeProcess.kill();
    },
  };
}

// This module owns browser lifecycle details so the rest of the project can stay focused on business flows.
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
