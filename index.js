const { appConfig } = require('./src/config/appConfig');
const { launchPersistentBrowser } = require('./src/browser/browserManager');
const { ensureLoggedIn, browseAllProducts } = require('./src/browser/navigationManager');

async function main() {
  console.log('Starting the Meesho automation browser...');
  console.log(`Profile path: ${appConfig.browser.userDataDir}`);
  console.log(`Products to visit: ${appConfig.navigation.productCount}\n`);

  const { page } = await launchPersistentBrowser(appConfig);

  // Verify the profile is logged in before starting product browsing.
  // If not logged in, the browser window will open the login page and
  // the script will wait up to 90 seconds for a manual login.
  await ensureLoggedIn(page, appConfig);

  await browseAllProducts(page, appConfig);

  console.log('\nDone. Keep the browser window open when you are done.');
}

main().catch((error) => {
  console.error('Failed:', error.message);
  process.exitCode = 1;
});
