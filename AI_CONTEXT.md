# AI Context

This repository is a Windows Node.js project for opening Meesho in the browser.

## Current behavior

* `npm start` runs `node index.js`.
* `index.js` launches a dedicated Playwright Chrome profile, opens `MEESHO_SHOP_URL`, and clicks its first product card.

## Important history

* The repo used to try Playwright persistent contexts, CDP attach, and shop/product gallery automation.
* Those attempts repeatedly caused guest profiles, blank tabs, access denied pages, and browser-session conflicts.
* The current code was simplified to avoid those failures.

## Files that matter

* `index.js` - current runtime entrypoint for the shop-to-product flow.
* `src/config/appConfig.js` - environment values and legacy browser settings.
* `src/browser/browserManager.js` - legacy automation helper, currently not used by `index.js`.
* `.env` - local shop URL and legacy variables.

## Cautions for future changes

* The automation runs in its own Chrome profile. It will not use the signed-in normal Chrome session unless you manually log in to this automation window.
* If true attachment to an existing Chrome session is needed, Chrome must be started with remote debugging first.

## Suggested next steps if automation returns

* Rebuild one focused flow at a time.
* Keep browser launch separate from page navigation.
* Prefer explicit selectors and small validation checks.
