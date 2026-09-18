// Opens a browser window on the sign-in page. Sign in with the DEMO account, then come back to
// the terminal and press Enter: the session is saved for `npm run shots`.
//
//   npm run shots:login
//   BASE_URL=http://localhost:3004 npm run shots:login   (local uses the DEV Clerk instance)

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = (process.env.BASE_URL ?? 'https://quickscout.io').replace(/\/$/, '');
const AUTH_DIR = join(ROOT, 'screenshots', '.auth');
const AUTH_FILE = join(AUTH_DIR, `${new URL(BASE_URL).host.replace(':', '_')}.json`);

mkdirSync(AUTH_DIR, { recursive: true });
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
await page.goto(`${BASE_URL}/sign-in`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question('Sign in with the demo account in the browser window, then press Enter here… ');
rl.close();

await context.storageState({ path: AUTH_FILE });
await browser.close();
console.log(`Saved the session to ${AUTH_FILE.slice(ROOT.length + 1)}`);
