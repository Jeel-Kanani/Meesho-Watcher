# Meesho Watcher

Small Windows-friendly Node.js project for opening a Meesho shop page.

## What it does

Current behavior is intentionally minimal:

* `npm start` opens the configured Meesho shop in a dedicated Chrome automation window, then clicks its first product card.
* The browser profile is kept in `.auth/meesho-automation-session` so it does not conflict with normal Chrome.
* The project keeps the Meesho shop URL in `.env` so it is easy to change.

## Requirements

* Node.js 18+.
* Google Chrome installed on Windows.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

## Configuration

Environment variables are read from `.env`:

* `MEESHO_SHOP_URL` - shop page to open.
* `MEESHO_BASE_URL` - legacy homepage URL value.
* `MEESHO_SEARCH_QUERY` - legacy search value.
* `MEESHO_TARGET_COLLECTION` - legacy target collection value.
* `MEESHO_CHROME_USER_DATA_DIR` - legacy Chrome profile path used by older automation attempts.
* `MEESHO_CHROME_PROFILE_DIRECTORY` - legacy Chrome profile name.
* `MEESHO_CHROME_CDP_URL` - legacy CDP endpoint for attach experiments.
* `MEESHO_ATTACH_TO_EXISTING_CHROME` - legacy attach toggle.

## Project Structure

* `index.js` - startup script that runs the shop-to-product flow.
* `src/config/appConfig.js` - environment/config values.
* `src/browser/browserManager.js` - legacy browser helper retained for reference.
* `src/pages/` - page objects from earlier automation work.
* `screenshots/` - saved screenshots from older flows.
* `logs/` - log output.

## Notes

The repository previously contained Playwright-driven shop/product automation. That code was simplified after repeated browser-profile and access issues. If you want to restore the old flow, start from the browser helper and page object files instead of the current `index.js` entrypoint.
