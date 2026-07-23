class MeeshoHomePage {
  constructor(page) {
    this.page = page;
  }

  // The customer homepage exposes the main search entry and the category rail that we will reuse in later milestones.
  getSearchBox() {
    return this.page.locator('input.search-input-elm').first();
  }

  getHomeReadyIndicators() {
    return [
      this.page.getByText(/shop millions of products across all categories/i),
      this.page.getByText(/trusted by millions/i),
      this.page.getByText(/discover a world of affordable fashion & everyday essentials/i),
      this.getSearchBox(),
    ];
  }

  getSearchResultsIndicators() {
    return [
      this.page.getByText(/filters/i),
      this.page.getByText(/sort by/i),
      this.page.getByText(/products for you/i),
    ];
  }

  getTargetCollectionLocators(targetName) {
    const targetPattern = new RegExp(targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    return [
      this.page.getByRole('link', { name: targetPattern }),
      this.page.getByRole('button', { name: targetPattern }),
      this.page.getByText(targetPattern).first(),
      this.page.locator('a, button, [role="link"], [role="button"]').filter({ hasText: targetPattern }).first(),
    ];
  }

  getCommonDismissLocators() {
    return [
      this.page.getByRole('button', { name: /close/i }),
      this.page.getByRole('button', { name: /dismiss/i }),
      this.page.getByRole('button', { name: /not now/i }),
      this.page.getByRole('button', { name: /no thanks/i }),
      this.page.getByRole('button', { name: /accept/i }),
      this.page.getByRole('button', { name: /got it/i }),
    ];
  }
}

module.exports = { MeeshoHomePage };