const path = require('path');
const os = require('os');

require('dotenv').config();

// Keep all environment-specific values in one place so future milestones can grow without touching the workflow code.
const projectRoot = path.resolve(__dirname, '..', '..');

const appConfig = {
  projectRoot,
  browser: {
    // Use the real Chrome profile by default so the session matches your normal signed-in browser.
    userDataDir: process.env.MEESHO_CHROME_USER_DATA_DIR
      || path.join(process.env.LOCALAPPDATA || os.homedir(), 'Google', 'Chrome', 'User Data'),
    profileDirectory: process.env.MEESHO_CHROME_PROFILE_DIRECTORY || 'Default',
    cdpUrl: process.env.MEESHO_CHROME_CDP_URL || 'http://127.0.0.1:9222',
    attachToExistingChrome: process.env.MEESHO_ATTACH_TO_EXISTING_CHROME !== 'false',
    headless: false,
    viewport: null,
  },
  app: {
    // The shop URL is the default flow target; the homepage base URL stays available for fallback use.
    baseUrl: process.env.MEESHO_BASE_URL || 'https://www.meesho.com/',
    shopUrl: process.env.MEESHO_SHOP_URL || 'https://www.meesho.com/CJMENTERPRISE?ms=2',
  },
  navigation: {
    // Keep the default search target configurable so future milestones can change behavior without code edits.
    searchQuery: process.env.MEESHO_SEARCH_QUERY || 'saree',
    targetCollection: process.env.MEESHO_TARGET_COLLECTION || 'Kurti, Saree & Lehenga',
  },
};

module.exports = { appConfig };