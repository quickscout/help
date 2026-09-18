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
