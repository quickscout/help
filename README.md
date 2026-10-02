# QuickScout Help

User documentation for QuickScout, published with [Mintlify](https://mintlify.com). This repository contains public help content and capture tooling, never app code.

## Preview and validate

```bash
npm install
npm run dev -- --port 3333 --no-open
npm run validate
npm run check
```

Reuse an existing preview if one is running. Strict validation must finish without warnings or errors; the link check must find no broken internal links. Also review changed pages at desktop and narrow widths.

## Keep guides useful

- Start with the task, required access and shortest path to a result. Use the app's exact button labels.
- Keep paragraphs short. Put optional controls after the main steps; use tables for comparisons and accordions for troubleshooting.
- Verify behavior in the sibling `strawn` app. Its code is the source of truth; internal design documents and API contracts can lag implementation.
- Check sign-in and plan gates, defaults, limits, saved settings and failure messages. Don't imply planned features are available.
- Keep existing page paths and section anchors when editing: the app and customers link to them.
- Add new pages to `docs.json` and link them from the related task guide.
- Refresh screenshots only when they change what a reader needs to recognize. Review every image before committing it.

`AUDIT.md` records page coverage, source locations and verification gaps. It is a maintainer file, excluded from the published site. Update it when a feature or guide changes.

## Enterprise stays hidden

The **Enterprise** navigation group has `"hidden": true`. Its guides remain available by URL for the in-app help link; they are not promoted in public navigation. Public pages retain short explanations of visible, disabled Enterprise controls without linking to hidden guides.

`enterprise-hold` MDX comments preserve launch copy. Find them with:

```bash
rg -n enterprise-hold --glob '*.mdx' --glob '!node_modules/**'
```

Keep MDX comments outside lists and tables, with blank lines on either side. Before making Enterprise public, verify the deployed feature set, remove the hidden flag, review the held copy and refresh its screenshots. Hiding navigation is not access control; never put private information in a guide.

## Screenshots

`screenshots/shots.mjs` captures the running app with Playwright and writes WebP images at 2× resolution. Controls are opened by their accessible button names.

```bash
npx playwright install chromium
BASE_URL=http://localhost:3004 npm run shots:login
BASE_URL=http://localhost:3004 npm run shots -- maps-layers maps-printing maps-well-labels
```

Use the existing local app server to capture checkout behavior. Without `BASE_URL`, captures use `https://quickscout.io`; its login is separate. Login sessions and failure images live in ignored `screenshots/.auth/`. Never commit them.

A `{/* screenshot: <name> — note */}` marker is replaced with a `<Frame>` when its capture succeeds. Later runs replace only the image. A missing demo fixture is a reason to leave a marker, not invent a screenshot.

The capture script blocks saved map-workspace reads and writes. It can still display private information: keep account email, property rows, uploaded layer names and other projects out of frame. Enterprise captures open one demo project, which changes the account's active project. Use an account and project suitable for public screenshots.

Inspect new images for loading placeholders, clipped controls and private data. If capture fails, remove an obsolete image from its guide until it can be replaced; document the gap in `AUDIT.md`.

## Layout

- `docs.json`: site configuration and navigation.
- `get-started/`, `maps/`, `tools/`, `enterprise/`, `owners/`: MDX guides.
- `images/`: reviewed screenshots.
- `logo/`, `favicon.svg`: brand assets.
- `AUDIT.md`: maintainer coverage and verification record.
