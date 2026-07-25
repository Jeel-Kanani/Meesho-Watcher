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

  async openShopAndFirstProduct() {
    try {
      console.log('Opening the Meesho shop...');
      await this.page.goto(this.appConfig.app.shopUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await this.dismissCommonInterruptions();

      console.log('Waiting for a product in the shop...');
      const productLink = this.page.locator('a[href*="/p/"]').first();
      await productLink.waitFor({ state: 'visible', timeout: 30000 });

      // Extract the raw href directly from the DOM — this gives the exact full product URL
      // with no truncation (Next.js router corruption only happens when clicking, not here)
      const rawHref = await productLink.getAttribute('href');
      if (!rawHref) throw new Error('Could not find a product link on the shop page.');

      const fullProductUrl = new URL(rawHref, this.page.url()).href;
      console.log(`Product URL found: ${fullProductUrl}`);

      // Navigate directly — real Chrome (no bot flags) means Akamai allows direct goto()
      // This completely avoids the Next.js router URL truncation bug from clicks
      await this.page.goto(fullProductUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      console.log(`Product page loaded: ${this.page.url()}`);
      return this.page;
    } catch (error) {
      try {
        const errorScreenshot = this.saveScreenshot('error-shop');
        await this.page.screenshot({ path: errorScreenshot, fullPage: true });
        console.log(`Saved failure screenshot to: ${errorScreenshot}`);
      } catch (screenshotError) {
        console.error('Failed to take failure screenshot:', screenshotError);
      }
      throw error;
    }
  }

  // ── Progress helpers (resume support) ─────────────────────────────────────

  get progressFilePath() {
    return path.join(this.appConfig.projectRoot, 'logs', 'progress.json');
  }

  loadProgress() {
    try {
      if (fs.existsSync(this.progressFilePath)) {
        const raw = fs.readFileSync(this.progressFilePath, 'utf8');
        const data = JSON.parse(raw);
        return Array.isArray(data.visitedUrls) ? data.visitedUrls : [];
      }
    } catch (e) {
      console.warn('Could not read progress file — starting fresh.');
    }
    return [];
  }

  saveProgress(visitedUrls) {
    const logsDir = path.join(this.appConfig.projectRoot, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(
      this.progressFilePath,
      JSON.stringify({ visitedUrls, totalVisited: visitedUrls.length, lastRun: new Date().toISOString() }, null, 2),
    );
  }

  // ── Pagination helper: collect ALL own-shop product URLs across pages ──────

  async collectShopProductUrls(maxCount) {
    const shopLinkSelector = 'a[href*="/p/"][href*="source=Meri"]';
    const baseShopUrl = this.appConfig.app.shopUrl; // e.g. meesho.com/CJMENTERPRISE?ms=2
    const productUrls = [];
    let pageNum = 1;

    console.log(`\nScanning shop pages to collect up to ${maxCount} product URLs...`);

    while (productUrls.length < maxCount) {
      // Meesho shop pagination: append &page=N  (page 1 keeps the original URL)
      const pageUrl = pageNum === 1 ? baseShopUrl : `${baseShopUrl}&page=${pageNum}`;
      console.log(`  Shop page ${pageNum}: ${pageUrl}`);

      await this.page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (pageNum === 1) await this.dismissCommonInterruptions();

      // Wait up to 15 s for own-shop products; if none appear, we've passed the last page
      try {
        await this.page.locator(shopLinkSelector).first().waitFor({ state: 'visible', timeout: 15000 });
      } catch {
        console.log(`  No own-shop products on page ${pageNum}. Reached end of shop.`);
        break;
      }

      const allLinks = this.page.locator(shopLinkSelector);
      const foundOnPage = await allLinks.count();
      const pageBase = this.page.url();

      let addedOnPage = 0;
      for (let i = 0; i < foundOnPage && productUrls.length < maxCount; i++) {
        const href = await allLinks.nth(i).getAttribute('href').catch(() => null);
        if (href) {
          const full = new URL(href, pageBase).href;
          if (!productUrls.includes(full)) {
            productUrls.push(full);
            addedOnPage++;
          }
        }
      }

      console.log(`  → ${addedOnPage} new URLs added (page total: ${foundOnPage}). Running total: ${productUrls.length}`);

      // Fewer than 20 products on this page means it's the last page
      if (foundOnPage < 20) {
        console.log('  Reached last page of shop.');
        break;
      }

      pageNum++;
      // Small polite pause between shop page loads
      await this.page.waitForTimeout(600 + Math.floor(Math.random() * 400));
    }

    console.log(`Collected ${productUrls.length} unique own-shop product URLs.\n`);
    return productUrls;
  }

  /**
   * Walk every page of the shop, collect own-shop product URLs, then visit each
   * one with human-like scrolling.
   *
   * Resume support: already-visited URLs are stored in logs/progress.json.
   * If the script is stopped mid-run, the next run skips products already seen.
   */
  async browseAllProducts(maxCount) {
    const count = maxCount || this.appConfig.navigation.productCount || 5;

    // ── Step 1: collect all shop product URLs (paginated) ─────────────────────
    const allUrls = await this.collectShopProductUrls(count);

    // ── Step 2: load previous progress and filter out already-visited URLs ────
    const visited = this.loadProgress();
    const pending = allUrls.filter((u) => !visited.includes(u));

    if (visited.length > 0) {
      console.log(`Resume: ${visited.length} already visited, ${pending.length} remaining.\n`);
    }

    if (pending.length === 0) {
      console.log('All products have been visited. Resetting progress for a fresh run.');
      this.saveProgress([]);
      return;
    }

    // ── Step 3: visit each pending product ────────────────────────────────────
    const sessionVisited = [...visited];

    for (let idx = 0; idx < pending.length; idx++) {
      const url = pending[idx];
      const overallNum = visited.length + idx + 1;
      console.log(`--- Product ${overallNum} / ${allUrls.length} (this session: ${idx + 1}/${pending.length}) ---`);
      console.log(`Navigating to: ${url}`);

      try {
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log(`Loaded: ${this.page.url()}`);

        await this.scrollProductImagesLikeHuman(this.page);

        // Mark as visited immediately so progress is saved even on partial runs
        sessionVisited.push(url);
        this.saveProgress(sessionVisited);

        // Human-like pause between products (1.5 – 3 s)
        const pauseMs = 1500 + Math.floor(Math.random() * 1500);
        console.log(`Pausing ${pauseMs}ms before next product...\n`);
        await this.page.waitForTimeout(pauseMs);
      } catch (err) {
        if (err.message.includes('Target page, context or browser has been closed')) {
          console.log('\nChrome was closed. Progress saved. Run again to resume.');
          return;
        }
        console.warn(`  Skipping product ${overallNum} due to error: ${err.message.split('\n')[0]}`);
      }
    }

    console.log(`\nFinished browsing all ${sessionVisited.length} products from the shop.`);
  }

  async scrollProductImagesLikeHuman(targetPage) {
    const page = targetPage || this.page;

    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(500);

    // ── Step 1: find thumbnail images by their actual rendered size ───────────
    // Thumbnails on Meesho product pages are small images (40-130px) in the
    // upper portion of the page. We measure their real bounding rects via JS
    // so we click exactly where the element is — no hardcoded coordinates.
    const thumbCoords = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')];
      return imgs
        .filter((img) => {
          const r = img.getBoundingClientRect();
          return (
            r.width >= 40 && r.width <= 130
            && r.height >= 40 && r.height <= 130
            && r.top >= 0 && r.top < 1200
            && r.left >= 0
            && img.src && (img.src.includes('meesho') || img.src.includes('cdninstashop'))
          );
        })
        .slice(0, 8) // click up to 8 thumbnails
        .map((img) => {
          const r = img.getBoundingClientRect();
          return {
            x: Math.round(r.left + r.width / 2),
            y: Math.round(r.top + r.height / 2),
          };
        });
    }).catch(() => []);

    // ── Step 2: click each thumbnail so the main image visibly changes ────────
    if (thumbCoords.length > 0) {
      console.log(`Clicking through ${thumbCoords.length} product images...`);
      for (let i = 0; i < thumbCoords.length; i++) {
        const { x, y } = thumbCoords[i];
        try {
          await page.mouse.click(x, y);
          console.log(`  Image ${i + 1}/${thumbCoords.length} clicked`);
          // Wait for the main image to visibly update
          await page.waitForTimeout(500 + Math.floor(Math.random() * 300));
        } catch (e) {
          // ignore individual click failures
        }
      }
    } else {
      console.log('No thumbnail images found on this product page.');
    }

    // ── Step 3: scroll the product detail section ─────────────────────────────
    console.log('Scrolling product details...');
    for (let s = 0; s < 4; s++) {
      await page.evaluate(() => {
        window.scrollBy({ top: 300, behavior: 'smooth' });
      }).catch(() => {});
      await page.waitForTimeout(280);
    }

    // Scroll back to top
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(() => {});
    await page.waitForTimeout(200);

    console.log('Product viewing complete.');
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

async function openShopAndFirstProduct(page, appConfig) {
  const navigationManager = new NavigationManager(page, appConfig);
  return navigationManager.openShopAndFirstProduct();
}

async function scrollProductImagesLikeHuman(page, appConfig) {
  const navigationManager = new NavigationManager(page, appConfig);
  return navigationManager.scrollProductImagesLikeHuman(page);
}

async function browseAllProducts(page, appConfig, maxCount) {
  const navigationManager = new NavigationManager(page, appConfig);
  return navigationManager.browseAllProducts(maxCount);
}

module.exports = {
  NavigationManager,
  openHomePage,
  searchProducts,
  openTargetCollection,
  openShopAndFirstProduct,
  scrollProductImagesLikeHuman,
  browseAllProducts,
};
