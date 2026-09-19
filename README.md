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

## Enterprise is parked

The Enterprise workspace (Prospect) isn't open to users yet, so its pages are out of sight:

- The **Enterprise** group in `docs.json` has `"hidden": true`. Its pages are off the sidebar and out of search, but still load for anyone with the URL, which keeps the in-app Help link working for us. To unpublish them entirely, add `enterprise/` to `.mintignore`.
- Everywhere else, what described Enterprise is commented out and tagged. `grep -rn "enterprise-hold" --include="*.mdx" .` lists every block, and each says where it goes.
- What stays: the Enterprise row in the pricing table, **Prospect is invite-only**, and the short notes on the buttons every user sees greyed out (**Projects**, **Watchlist**, the **Deals** tab, **Add to watchlist**, **Watch**, **Deal draft**). Those notes link nowhere.
- An MDX comment can't sit in the middle of a list or a table: it never closes and the page stops building. Put it after, with a blank line either side.

To bring Enterprise back: drop the `hidden` flag, restore the tagged blocks, and re-run the `enterprise-*` shots.

## Screenshots

Screenshots are captured from the live app by `screenshots/shots.mjs` (Playwright).

```bash
npm install && npx playwright install chromium   # once
npm run shots:login        # once: sign in; the window closes by itself
npm run shots              # every shot → images/<name>.webp
npm run shots -- row-card  # just the shots whose name contains "row-card"
```

- **Your own account works, but the pictures are public.** The script never loads or writes the account's saved map workspace. It does show what the account holds, so it keeps that out of frame: the Enterprise shots open one project and take the account's other projects off the rail, the Owner Portal shot stops above the property rows, and the Filters shot leaves out the My Data layer names. Look at every new image before you commit it.
- **The Enterprise shots open one project**, `PROJECT` at the top of `shots.mjs` (or `SHOTS_PROJECT` / `SHOTS_PROJECT_ALSO`). Opening it makes it the account's active project.
- Images are WebP at 2x. A map is a photograph to a compressor: the same shots as PNG ran to 5 MB each.
- A page marks where a shot goes with `{/* screenshot: <name> — note */}`. The first capture swaps the marker for a `<Frame>`; later runs only replace the image.
- To add a shot, add an entry to `SHOTS` in `shots.mjs` and a marker on the page.
- A failed shot saves what the browser saw to `screenshots/.auth/FAILED-<name>.png`.
- `BASE_URL=http://localhost:3004` runs against a local app, which signs in against the DEV Clerk instance, so it needs its own `shots:login`.
