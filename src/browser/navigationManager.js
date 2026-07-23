const fs = require('fs');
const path = require('path');
const { MeeshoHomePage } = require('../pages/meeshoHomePage');

class NavigationManager {
  constructor(page, appConfig) {
    this.page = page;
    this.appConfig = appConfig;
    this.homePage = new MeeshoHomePage(page);
  }

  saveScreenshot(prefix) {
    const screenshotDir = path.resolve(this.appConfig.projectRoot, 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });

    return path.join(
      screenshotDir,
      `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
    );
  }

  async scrollToTop() {
    await this.page.evaluate(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }).catch(() => {});
  }

  async waitForVisibleLocator(locators, retryCount = 3) {
    let lastError;
    const visibleTimeoutMs = 20000;

    for (let attempt = 1; attempt <= retryCount; attempt += 1) {
      for (const locator of locators) {
        try {
          await locator.first().waitFor({ state: 'visible', timeout: visibleTimeoutMs });
          return locator.first();
        } catch (error) {
          lastError = error;
        }
      }

      if (attempt < retryCount) {
        console.log(`Retrying navigation check (${attempt}/${retryCount})...`);
        await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await this.page.waitForLoadState('load').catch(() => {});
      }
    }

    throw lastError || new Error('No visible locator was found.');
  }

  async dismissCommonInterruptions() {
    console.log('Checking for popups or banners...');

    for (const locator of this.homePage.getCommonDismissLocators()) {
      try {
        await locator.first().waitFor({ state: 'visible', timeout: 1500 });
        await locator.first().click({ force: true });
        console.log('Dismissed an interruption banner or popup.');
        return;
      } catch (error) {
        void error;
      }
    }
  }

  async waitForHomeReady() {
    console.log('Waiting for the Meesho homepage to finish loading...');

    await this.scrollToTop();
    const readyLocator = await this.waitForVisibleLocator(this.homePage.getHomeReadyIndicators(), 3);
    console.log('Meesho homepage is ready.');
    return readyLocator;
  }

  async openHomePage() {
    console.log('Opening the Meesho customer homepage...');

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.page.goto(this.appConfig.app.baseUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        await this.page.waitForLoadState('load').catch(() => {});
        await this.dismissCommonInterruptions();
        await this.waitForHomeReady();

        console.log('Customer homepage loaded.');
        return;
      } catch (error) {
        console.log(`Homepage load attempt ${attempt} failed: ${error.message}`);

        if (attempt === 3) {
          throw new Error(`Unable to load the Meesho customer homepage after ${attempt} attempts. Last error: ${error.message}`);
        }
      }
    }
  }

  async searchProducts(searchQuery) {
    console.log(`Searching for products using query: ${searchQuery}`);
    await this.waitForHomeReady();
    await this.dismissCommonInterruptions();
    await this.scrollToTop();

    const searchBox = await this.waitForVisibleLocator([this.homePage.getSearchBox()], 3);
    await searchBox.fill(searchQuery);
    await this.page.keyboard.press('Enter').catch(() => {});

    const resultsLocator = await this.waitForVisibleLocator(this.homePage.getSearchResultsIndicators(), 3);

    console.log('Search results page loaded successfully.');

    const screenshotPath = this.saveScreenshot('search-results');

    await this.page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    console.log(`Saved search results screenshot to ${screenshotPath}`);

    return resultsLocator;
  }

  async openTargetCollection(targetName) {
    console.log(`Opening target collection: ${targetName}`);
    await this.waitForHomeReady();
    await this.dismissCommonInterruptions();

    const targetLocator = await this.waitForVisibleLocator(
      this.homePage.getTargetCollectionLocators(targetName),
      3,
    );

    console.log('Target collection control found. Clicking it now...');
    await targetLocator.click({ timeout: 15000 });

    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.page.waitForLoadState('load').catch(() => {});

    const collectionIndicators = await this.waitForVisibleLocator(this.homePage.getSearchResultsIndicators(), 3);

    console.log('Target collection page loaded successfully.');

    const screenshotPath = this.saveScreenshot('target-page');

    await this.page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    console.log(`Saved target page screenshot to ${screenshotPath}`);

    return collectionIndicators;
  }
}

async function openHomePage(page, appConfig) {
  const navigationManager = new NavigationManager(page, appConfig);
  return navigationManager.openHomePage();
}

async function searchProducts(page, appConfig, searchQuery) {
  const navigationManager = new NavigationManager(page, appConfig);
  return navigationManager.searchProducts(searchQuery);
}

async function openTargetCollection(page, appConfig, targetName) {
  const navigationManager = new NavigationManager(page, appConfig);
  return navigationManager.openTargetCollection(targetName);
}

module.exports = { NavigationManager, openHomePage, searchProducts, openTargetCollection };