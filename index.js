const { appConfig } = require('./src/config/appConfig');
const { launchPersistentBrowser } = require('./src/browser/browserManager');
const { browseAllProducts } = require('./src/browser/navigationManager');

async function main() {
  console.log('Starting the Meesho automation browser...');
  console.log(`Profile path: ${appConfig.browser.userDataDir}`);
  console.log(`Products to visit: ${appConfig.navigation.productCount}\n`);

  const { page } = await launchPersistentBrowser(appConfig);

  await browseAllProducts(page, appConfig);

  console.log('\nDone. Keep the browser window open when you are done.');
}

main().catch((error) => {
  console.error('Failed:', error.message);
  process.exitCode = 1;
});
