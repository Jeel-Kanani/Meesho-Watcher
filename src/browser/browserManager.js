const { chromium } = require('playwright');

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

// Keep a friendly name for future callers that only care about starting the browser.
async function launchBrowser(appConfig) {
  if (!appConfig.browser.attachToExistingChrome) {
    throw new Error(
      'attachToExistingChrome is disabled. Enable it or start Chrome with --remote-debugging-port=9222 so Copilot can attach to the logged-in session.',
    );
  }

  try {
    return await launchAttachedBrowser(appConfig);
  } catch (error) {
    throw new Error(
      `Unable to attach to Chrome at ${appConfig.browser.cdpUrl}. Start Chrome with --remote-debugging-port=9222 and keep your logged-in profile open, then run npm start again. Original error: ${error.message}`,
    );
  }
}

module.exports = { launchBrowser, launchAttachedBrowser };