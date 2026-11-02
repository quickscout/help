// Screenshots for the help pages, captured from the running app.
//
//   npm run shots                     every shot, against https://quickscout.io
//   npm run shots -- data-panel       only the shots whose name contains "data-panel"
//   BASE_URL=http://localhost:3004 npm run shots
//
// Signed-in shots reuse the session saved by `npm run shots:login` (your own account is fine:
// the saved map workspace is blocked, so shots start clean and never write back to it).
//
// Each shot writes images/<name>.webp. When a page has a `{/* screenshot: <name> … */}` marker,
// the marker is swapped for a <Frame> showing the image. Re-running a shot overwrites the image
// and leaves the page alone.
//
// These pictures are published, so a shot shows nothing that is only the account's business:
// the Enterprise shots use one project (PROJECT below) and take the others off the rail,
// the Owner Portal stops above the property rows, and the Filters popover leaves out the
// My Data layer names. Keep to that when adding a shot.
//
// The shots live in shots/*.mjs, one module per group of pages; the shared helpers in lib.mjs.
// `SHOTS_MODULE=search` loads only shots/search.mjs (several people can work on different groups
// at once without one half-edited module stopping the others).

import { chromium } from 'playwright';
import sharp from 'sharp';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_FILE, BASE_URL, ROOT, VIEWPORT, authState, blockWrites, clearAnnotations, drawAnnotations, embed } from './lib.mjs';

const only = process.argv.slice(2);

// ─── the shots ───────────────────────────────────────────────────────────────
// name        → images/<name>.webp, and the marker it replaces
// alt         → the image's alt text on the page
// auth        → needs the saved session
// startDrawer → leave Maps' first-load start drawer open (every other Maps shot closes it)
// run         → drives the page; may return a clip `{ x, y, width, height }` in CSS px
// annotate    → what the picture points at (see "annotations" above); an array, or a function of
//               the page that returns one
// steps       → a walkthrough: `{ name, alt, run, annotate }` captured one after another in the same
//               page, so step 3 sees what steps 1 and 2 did. The shot's own name only groups them.
// allowWrites → a path pattern let through the write block, for the one shot that must (an Ask turn)
// after       → tidies up after the captures (a thread the shot made), whether or not they worked

const MODULES = join(ROOT, 'screenshots', 'shots');
const pick = process.env.SHOTS_MODULE;
const SHOTS = [];
for (const file of readdirSync(MODULES).filter((f) => f.endsWith('.mjs')).sort()) {
    if (pick && file !== `${pick}.mjs`) continue;
    SHOTS.push(...(await import(join(MODULES, file))).default);
}
const names = SHOTS.flatMap((s) => [s.name, ...(s.steps ?? []).map((step) => step.name)]);
const twice = names.filter((n, i) => names.indexOf(n) !== i);
if (twice.length) throw new Error(`shot names used twice: ${[...new Set(twice)].join(', ')}`);

// ─── run ─────────────────────────────────────────────────────────────────────

const named = (s) => [s.name, ...(s.steps ?? []).map((step) => step.name)];
const todo = SHOTS.filter((s) => only.length === 0 || only.some((o) => named(s).some((n) => n.includes(o))));
const haveAuth = existsSync(AUTH_FILE);
if (todo.some((s) => s.auth) && !haveAuth) {
    console.warn(`No saved session for ${BASE_URL} — signed-in shots will be skipped. Run: npm run shots:login\n`);
}

const browser = await chromium.launch({
    // Mapbox needs WebGL; headless Chromium only has it through SwiftShader.
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const failed = [];
const writesSeen = new Set();
for (const shot of todo) {
    if (shot.auth && !haveAuth) {
        console.log(`– ${shot.name} (skipped: not signed in)`);
        continue;
    }
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        colorScheme: 'light',
        storageState: shot.auth ? authState() : undefined,
    });
    // The account's saved map workspace (camera, open panels, tabs) is neither loaded nor
    // written: shots start from a clean map framed by their URL, and the account is untouched.
    await context.route('**/api/v1/core/map-state**', (route) => route.abort());
    await context.route(/sentry\.io|ingest\.sentry/, (route) => route.abort());
    await blockWrites(context, writesSeen, shot.allowWrites ?? null);

    await context.addInitScript((startDrawer) => {
        // Maps opens its start drawer on a session's first load, and every shot is a first load.
        if (!startDrawer) sessionStorage.setItem('map-loaded', 'true');
        // `next dev` puts its dev-tools badge in the corner; it isn't part of the app.
        const hide = () => {
            const style = document.createElement('style');
            // And the left rail's counts (My Data, Owner Portal, …): they are the account's, not the help's.
            style.textContent = 'nextjs-portal { display: none !important; } button[data-help^="nav."] span[aria-hidden] { display: none !important; }';
            document.head.appendChild(style);
        };
        if (document.head) hide();
        else document.addEventListener('DOMContentLoaded', hide);
        // A development Clerk instance prompts over every page ("Organizations feature required");
        // the live one does not. Dismiss that prompt, and no other Clerk modal, with its own button:
        // it makes the rest of the page inert while open, so taking it out of the DOM is not enough.
        new MutationObserver(() => {
            for (const el of document.querySelectorAll('.cl-modalBackdrop')) {
                if (!/feature required/i.test(el.textContent ?? '')) continue;
                [...el.querySelectorAll('button')].find((b) => /remove it myself/i.test(b.textContent ?? ''))?.click();
            }
        }).observe(document, { childList: true, subtree: true });
    }, !!shot.startDrawer);

    const page = await context.newPage();
    let current = shot.name;
    try {
        if (shot.auth) {
            // The saved __session cookie lives about a minute; a client page refreshes it before
            // a server-gated page (the well report) checks it.
            await page.goto(BASE_URL + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 60_000 });
            await page.waitForTimeout(3_000);
        }
        await page.goto(BASE_URL + shot.path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        if (shot.auth && /\/sign-in/.test(page.url())) {
            throw new Error('redirected to sign-in — the saved session has expired; run npm run shots:login');
        }
        for (const step of shot.steps ?? [shot]) {
            current = step.name;
            const clip = (await step.run(page)) ?? undefined;
            if (step.annotate) {
                const marks = typeof step.annotate === 'function' ? await step.annotate(page) : step.annotate;
                await drawAnnotations(page, marks);
            }
            // WebP, not PNG: a map is a photograph to a compressor, and a PNG of one runs to 5 MB.
            const png = await page.screenshot({ clip });
            await clearAnnotations(page);
            await sharp(png).webp({ quality: 86 }).toFile(join(ROOT, 'images', `${step.name}.webp`));
            const placed = embed(step);
            console.log(`✓ ${step.name}${placed ? `  → placed in ${placed}` : ''}`);
        }
    } catch (err) {
        failed.push(current);
        await page.screenshot({ path: join(ROOT, 'screenshots', '.auth', `FAILED-${current}.png`) }).catch(() => {});
        console.log(`✗ ${current}: ${err.message.split('\n')[0]}`);
    } finally {
        if (shot.after) await shot.after(page).catch((err) => console.log(`  ! tidying after ${shot.name}: ${err.message.split('\n')[0]}`));
        await context.close();
    }
}

await browser.close();
if (failed.length) {
    console.log(`\n${failed.length} failed. What the page looked like is in screenshots/.auth/FAILED-*.png`);
    process.exit(1);
}
