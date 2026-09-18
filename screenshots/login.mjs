// Opens a browser window on the sign-in page. Sign in there; the window closes by itself once
// you're in, and the session is saved for `npm run shots`.
//
//   npm run shots:login                                  (https://quickscout.io)
//   BASE_URL=http://localhost:3004 npm run shots:login   (local signs in against the DEV Clerk instance)

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = (process.env.BASE_URL ?? 'https://quickscout.io').replace(/\/$/, '');
const AUTH_DIR = join(ROOT, 'screenshots', '.auth');
const AUTH_FILE = join(AUTH_DIR, `${new URL(BASE_URL).host.replace(':', '_')}.json`);

mkdirSync(AUTH_DIR, { recursive: true });
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
await page.goto(`${BASE_URL}/sign-in`);
console.log('Sign in in the browser window. It closes by itself once you are in (10 minutes max).');

// Signed in = Clerk's session cookie is set and the page has left /sign-in.
const deadline = Date.now() + 10 * 60_000;
for (;;) {
    const cookies = await context.cookies(BASE_URL);
    if (cookies.some((c) => c.name.startsWith('__session')) && !page.url().includes('/sign-in')) break;
    if (Date.now() > deadline) {
        console.error('Timed out waiting for sign-in.');
        await browser.close();
        process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1_000));
}
await page.waitForTimeout(3_000); // let Clerk finish writing its cookies
await context.storageState({ path: AUTH_FILE });
await browser.close();
console.log(`Signed in. Saved the session to ${AUTH_FILE.slice(ROOT.length + 1)}`);
