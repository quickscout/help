// Screenshots for the help pages, captured from the running app.
//
//   npm run shots                     every shot, against https://quickscout.io
//   npm run shots -- data-panel       only the shots whose name contains "data-panel"
//   BASE_URL=http://localhost:3004 npm run shots
//
// Signed-in shots reuse the session saved by `npm run shots:login` (your own account is fine:
// the saved map workspace is blocked, so shots start clean and never write back to it).
//
// Each shot writes images/<name>.png. When a page has a `{/* screenshot: <name> … */}` marker,
// the marker is swapped for a <Frame> showing the image. Re-running a shot overwrites the image
// and leaves the page alone.

import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = (process.env.BASE_URL ?? 'https://quickscout.io').replace(/\/$/, '');
const AUTH_FILE = join(ROOT, 'screenshots', '.auth', `${new URL(BASE_URL).host.replace(':', '_')}.json`);
const only = process.argv.slice(2);

// Midland — dense enough that every layer and table has something to show. A box, not
// lat/lng/zoom: /maps ignores those (Mapbox's `bounds` option wins over `center`/`zoom`).
const MIDLAND = 'box2d=' + encodeURIComponent('BOX(-102.25 31.88,-101.9 32.12)');
const SAMPLE_API = '4231740219';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Mapbox paints after the canvas appears; tiles keep landing for a few seconds more. */
async function mapSettled(page) {
    await page.locator('canvas.mapboxgl-canvas').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(6_000);
}

async function openTables(page) {
    await page.getByRole('button', { name: 'Show data tables' }).click();
    await rowsSteady(page);
}

/** Rows on screen and the footer done "Updating…" — held for 3 s, because the table swaps
 *  back to skeletons when its source changes (network read → the copy on this device). */
async function rowsSteady(page) {
    const deadline = Date.now() + 120_000;
    let steadySince = 0;
    while (Date.now() < deadline) {
        const ready = await page.evaluate(
            (find) => !!new Function(`return (${find})`)()() && !/Updating for this view/.test(document.body.innerText),
            findFirstRow.toString(),
        );
        if (!ready) steadySince = 0;
        else if (!steadySince) steadySince = Date.now();
        else if (Date.now() - steadySince > 3_000) return;
        await page.waitForTimeout(500);
    }
    throw new Error('table rows never settled');
}

/** A loaded table row (not a skeleton). CSS-module names differ between `next dev`
 *  (`data-table-module__x__row`) and the prod build (`data-table_row__x`), so match both. */
function findFirstRow() {
    // Only the data table's stylesheet: other modules (the top bar) have a `row` class too.
    const isRow = (c) => /^data-table-module__\w+__row$|^data-table_row__/.test(c);
    const isSkeleton = (c) => /^data-table-module__\w+__rowSkeleton$|^data-table_rowSkeleton__/.test(c);
    return [...document.querySelectorAll('[class]')].find(
        (el) => [...el.classList].some(isRow) && ![...el.classList].some(isSkeleton),
    ) ?? null;
}

async function clickFirstRow(page) {
    await rowsSteady(page);
    const row = (await page.evaluateHandle(findFirstRow)).asElement();
    if (!row) throw new Error('no table row to click');
    await row.click();
}

/** The right-side map controls are hover cards without labels: Layers, Basemap, Filters, Settings. */
async function hoverMapControl(page, index) {
    await page.locator('[class*="controlCapsule"] > *').nth(index).hover();
    await page.waitForTimeout(1_000);
}

// ─── the shots ───────────────────────────────────────────────────────────────
// name     → images/<name>.png, and the marker it replaces
// auth     → needs the saved session
// alt      → the image's alt text on the page

const SHOTS = [
    {
        name: 'maps-overview',
        alt: 'The Maps screen over Midland County',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: mapSettled,
    },
    {
        name: 'maps-layers',
        alt: 'The Layers panel open beside the map',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await hoverMapControl(page, 0);
        },
    },
    {
        name: 'maps-search',
        alt: 'Search suggestions for an operator name',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await page.getByPlaceholder('Search QuickScout Maps...').fill('Pioneer');
            await page.waitForTimeout(3_000);
        },
    },
    {
        name: 'well-drawer',
        alt: 'A well record open in the drawer',
        auth: true,
        path: `/maps?api=${SAMPLE_API}`,
        run: async (page) => {
            await mapSettled(page);
            await page.getByText('Report', { exact: true }).first().waitFor({ timeout: 30_000 });
            await page.waitForTimeout(2_000);
        },
    },
    {
        name: 'data-panel',
        alt: 'The Wells table open beside the map',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
        },
    },
    {
        name: 'data-filters',
        alt: 'The Filters popover with quick filters',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await page.getByRole('button', { name: /^Filters/ }).first().click();
            await page.waitForTimeout(1_500);
        },
    },
    {
        name: 'row-card',
        alt: 'A well row card beside the table',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await clickFirstRow(page);
            await page.waitForTimeout(4_000);
        },
    },
    {
        name: 'well-report',
        alt: 'The printable well report',
        auth: true,
        path: `/wells/${SAMPLE_API}/report`,
        run: async (page) => {
            await page.getByRole('button', { name: 'Print' }).waitFor({ timeout: 60_000 });
            await page.waitForTimeout(4_000);
        },
    },
    {
        name: 'enterprise-home',
        alt: "An Enterprise project's home board",
        auth: true,
        path: '/prospect',
        run: async (page) => {
            await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
            await page.waitForTimeout(6_000);
        },
    },
    {
        name: 'dashboard',
        alt: 'The statewide Dashboard',
        auth: false,
        path: '/dashboard',
        run: async (page) => {
            await page.getByText('Permit & completion activity').waitFor({ timeout: 60_000 });
            await page.waitForTimeout(3_000);
        },
    },
    {
        name: 'owners-portal',
        alt: 'The Owner Portal',
        auth: true,
        path: '/owners',
        run: async (page) => {
            await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
            await page.waitForTimeout(3_000);
        },
    },
];

// ─── marker → <Frame> ────────────────────────────────────────────────────────

function mdxFiles(dir) {
    return readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        if (f.startsWith('.') || f === 'node_modules' || f === 'screenshots') return [];
        return statSync(p).isDirectory() ? mdxFiles(p) : p.endsWith('.mdx') ? [p] : [];
    });
}

function embed(shot) {
    const marker = new RegExp(`\\{/\\* screenshot: ${shot.name}\\b[^*]*\\*/\\}`);
    for (const file of mdxFiles(ROOT)) {
        const text = readFileSync(file, 'utf8');
        if (!marker.test(text)) continue;
        const frame = `<Frame>\n  <img src="/images/${shot.name}.png" alt="${shot.alt}" />\n</Frame>`;
        writeFileSync(file, text.replace(marker, frame));
        return file.slice(ROOT.length + 1);
    }
    return null;
}

// ─── run ─────────────────────────────────────────────────────────────────────

const todo = SHOTS.filter((s) => only.length === 0 || only.some((o) => s.name.includes(o)));
const haveAuth = existsSync(AUTH_FILE);
if (todo.some((s) => s.auth) && !haveAuth) {
    console.warn(`No saved session for ${BASE_URL} — signed-in shots will be skipped. Run: npm run shots:login\n`);
}

const browser = await chromium.launch({
    // Mapbox needs WebGL; headless Chromium only has it through SwiftShader.
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const failed = [];
for (const shot of todo) {
    if (shot.auth && !haveAuth) {
        console.log(`– ${shot.name} (skipped: not signed in)`);
        continue;
    }
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: 'light',
        storageState: shot.auth ? AUTH_FILE : undefined,
    });
    // The account's saved map workspace (camera, open panels, tabs) is neither loaded nor
    // written: shots start from a clean map framed by their URL, and the account is untouched.
    await context.route('**/api/v1/core/map-state**', (route) => route.abort());
    await context.route(/sentry\.io|ingest\.sentry/, (route) => route.abort());

    // `next dev` puts its dev-tools badge in the corner; it isn't part of the app.
    await context.addInitScript(() => {
        const hide = () => {
            const style = document.createElement('style');
            style.textContent = 'nextjs-portal { display: none !important; }';
            document.head.appendChild(style);
        };
        if (document.head) hide();
        else document.addEventListener('DOMContentLoaded', hide);
    });

    const page = await context.newPage();
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
        await shot.run(page);
        await page.screenshot({ path: join(ROOT, 'images', `${shot.name}.png`) });
        const placed = embed(shot);
        console.log(`✓ ${shot.name}${placed ? `  → placed in ${placed}` : ''}`);
    } catch (err) {
        failed.push(shot.name);
        await page.screenshot({ path: join(ROOT, 'screenshots', '.auth', `FAILED-${shot.name}.png`) }).catch(() => {});
        console.log(`✗ ${shot.name}: ${err.message.split('\n')[0]}`);
    } finally {
        await context.close();
    }
}

await browser.close();
if (failed.length) {
    console.log(`\n${failed.length} failed. What the page looked like is in screenshots/.auth/FAILED-*.png`);
    process.exit(1);
}
