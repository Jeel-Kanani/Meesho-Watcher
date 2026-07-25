const { appConfig } = require('./src/config/appConfig');
const { launchPersistentBrowser } = require('./src/browser/browserManager');
const { openShopAndFirstProduct, scrollProductImagesLikeHuman } = require('./src/browser/navigationManager');

async function main() {
  console.log('Starting the Meesho automation browser...');
  console.log(`Profile path: ${appConfig.browser.userDataDir}\n`);

  const { page } = await launchPersistentBrowser(appConfig);

  const productPage = await openShopAndFirstProduct(page, appConfig);
  console.log('Product opened successfully.');

  await scrollProductImagesLikeHuman(productPage, appConfig);
  console.log('Done. Keep the browser window open when you are done.');
}

main().catch((error) => {
  console.error('Failed:', error.message);
  process.exitCode = 1;
});
