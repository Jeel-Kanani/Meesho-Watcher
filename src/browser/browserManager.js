const { chromium } = require('playwright');

// This module owns browser lifecycle details so the rest of the project can stay focused on business flows.
async function launchPersistentBrowser(appConfig) {
  let context;

  try {
    context = await chromium.launchPersistentContext(appConfig.browser.userDataDir, {
      // Use the installed Chrome browser to better match a normal desktop session.
      channel: 'chrome',
      headless: appConfig.browser.headless,
      viewport: appConfig.browser.viewport,
      args: [
        '--start-maximized',
        `--profile-directory=${appConfig.browser.profileDirectory}`,
      ],
    });
  } catch (error) {
    if (String(error.message || '').includes('Opening in existing browser session')) {
      throw new Error(
        `The Chrome profile at ${appConfig.browser.userDataDir} is already open. Close Chrome first, then run npm start again, or set MEESHO_CHROME_USER_DATA_DIR to a separate profile.`,
      );
    }

    throw error;
  }

  // Reuse the existing tab if Playwright restored one from a previous session.
  const page = context.pages()[0] || (await context.newPage());

  return { context, page };
}

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
  if (appConfig.browser.attachToExistingChrome) {
    try {
      return await launchAttachedBrowser(appConfig);
    } catch (error) {
      console.log(`Unable to attach to Chrome at ${appConfig.browser.cdpUrl}: ${error.message}`);
      console.log('Falling back to a dedicated Chrome profile.');
    }
  }

  return launchPersistentBrowser(appConfig);
}

module.exports = { launchBrowser, launchPersistentBrowser };