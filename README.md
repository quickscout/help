# QuickScout Help

User documentation for QuickScout, published with [Mintlify](https://mintlify.com).

This repo contains only the public help pages, never app code. Mintlify's GitHub app is granted access to this repository alone.

## Preview locally

```bash
npx mint dev          # http://localhost:3000
npx mint broken-links # before pushing
```

## Layout

- `docs.json`: site config and navigation
- `get-started/`, `maps/`, `tools/`, `enterprise/`, `owners/`: pages (MDX)
- `images/`: screenshots
- `logo/`, `favicon.svg`: brand assets

Pages are written from the app's on-screen labels. When a label changes in the app, update the page that quotes it.

## Screenshots

Screenshots are captured from the live app by `screenshots/shots.mjs` (Playwright).

```bash
npm install && npx playwright install chromium   # once
npm run shots:login        # once: sign in with the DEMO account, press Enter
npm run shots              # every shot → images/<name>.png
npm run shots -- row-card  # just one
```

- **Use a demo account, never a real one.** The app saves map position, open panels and the active project to the account. The script blocks map-state writes, but a demo account is the real protection. The Enterprise shot shows the demo account's active project, so give it a tidy one.
- A page marks where a shot goes with `{/* screenshot: <name> — note */}`. The first capture swaps the marker for a `<Frame>`; later runs only replace the image.
- To add a shot, add an entry to `SHOTS` in `shots.mjs` and a marker on the page.
- A failed shot saves what the browser saw to `screenshots/.auth/FAILED-<name>.png`.
- `BASE_URL=http://localhost:3004` runs against a local app, which signs in against the DEV Clerk instance, so it needs its own `shots:login`.
