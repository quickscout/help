// Shared pieces of the screenshot run: where the app is, how to drive and wait for it, the
// annotations, the write block, and how a capture lands on its page. The shots themselves are
// in shots/*.mjs; the runner is shots.mjs.
//
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

import { chromium } from 'playwright';
import sharp from 'sharp';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BASE_URL = (process.env.BASE_URL ?? 'https://quickscout.io').replace(/\/$/, '');
export const AUTH_FILE = join(ROOT, 'screenshots', '.auth', `${new URL(BASE_URL).host.replace(':', '_')}.json`);

/**
 * The saved session as a shot may use it: the cookies, and of the page's storage only Clerk's own.
 * Signing in loads the app, which caches the account's map workspaces, its active project and its
 * project definitions in localStorage; carried into a shot, they would put the account's camera,
 * tabs, layers and project on the page (2026-10-22: a project name on the rail). Blocking the server's
 * copy of the workspace (`shots.mjs`) is not enough without this.
 */
export function authState() {
    const saved = JSON.parse(readFileSync(AUTH_FILE, 'utf8'));
    return {
        cookies: saved.cookies ?? [],
        origins: (saved.origins ?? []).map((o) => ({ ...o, localStorage: (o.localStorage ?? []).filter((kv) => kv.name.startsWith('__clerk')) })),
    };
}

export const VIEWPORT = { width: 1440, height: 900 };

// Midland — dense enough that every layer and table has something to show. A box, not
// lat/lng/zoom: /maps ignores those (Mapbox's `bounds` option wins over `center`/`zoom`).
export const box = (w, s, e, n) => 'box2d=' + encodeURIComponent(`BOX(${w} ${s},${e} ${n})`);
export const MIDLAND = box(-102.25, 31.88, -101.9, 32.12);
// Heatmap cells are miles across, so that shot stands further back.
export const MIDLAND_BASIN = box(-102.7, 31.55, -101.3, 32.6);
// The sample well, and a box that puts it right of the record drawer. `?api=` opens the record
// but leaves the camera where it was.
export const SAMPLE_API = '4231740219';
export const SAMPLE_WELL = box(-102.31, 32.255, -102.12, 32.365);
// The sample well's operator, Diamondback E&P: big enough that every tab has something in it.
export const SAMPLE_OPERATOR = '217012';

// The Enterprise shots all show this project. `also` tells two projects with one name apart.
export const PROJECT = {
    name: process.env.SHOTS_PROJECT ?? 'Midland 2026 Deal',
    also: process.env.SHOTS_PROJECT_ALSO ?? 'PIONEER',
};
// An operator project has no areas of its own, so the Areas page is pictured from one that does.
export const AREAS_PROJECT = {
    name: process.env.SHOTS_AREAS_PROJECT ?? PROJECT.name,
    also: process.env.SHOTS_AREAS_PROJECT_ALSO ?? 'AREAS',
};

// ─── helpers: maps ───────────────────────────────────────────────────────────

/** Mapbox paints after the canvas appears; tiles keep landing for a few seconds more. */
export async function mapSettled(page) {
    await page.locator('canvas.mapboxgl-canvas').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(6_000);
}

/** Map controls open on click. Accessible names work in both dev and production. */
export async function openMapControl(page, name) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(1_000);
}

// ─── helpers: data tables ────────────────────────────────────────────────────

/** Opens the tables. `wide` drags them to their widest beside the map — at the default width the
 *  toolbar is icons only and a row shows four columns. */
export async function openTables(page, { wide = true } = {}) {
    await page.getByRole('button', { name: 'Show data tables' }).click();
    await rowsSteady(page);
    if (!wide) return;
    const handle = await page.getByRole('button', { name: 'Hide data tables' }).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, 200);
    await page.mouse.down();
    await page.mouse.move(560, 200, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1_500);
}

/** Wells in view, biggest producers first: rows a reader recognises, not the statewide list's
 *  first page of "%MARQUEE CORPORATION". */
export async function wellsInViewByCumOil(page) {
    await page.getByRole('radiogroup', { name: 'Scope', exact: true }).getByRole('radio', { name: 'In view' }).click();
    await rowsSteady(page);
    await page.getByRole('button', { name: /^Sort:/ }).click();
    await page.getByText('Cum oil bbl', { exact: true }).first().click();
    await page.getByText(/^Descending/).first().click();
    await page.keyboard.press('Escape');
    await rowsSteady(page);
}

/** Rows on screen and the footer done "Updating…" — held for 3 s. Not the stand-in either: while the
 *  wells copy downloads, the table shows the file's first rows unsorted ("The first 1,000 wells in
 *  the file, unsorted and unfiltered…"), which is not the view the shot sets up. Held for 3 s, because the table swaps
 *  back to skeletons when its source changes (network read → the copy on this device). */
export async function rowsSteady(page) {
    // Long enough for a fresh browser to download the wells copy.
    const deadline = Date.now() + 300_000;
    let steadySince = 0;
    while (Date.now() < deadline) {
        const ready = await page.evaluate(
            (find) => !!new Function(`return (${find})`)()() && !/Updating for this view|in the file, unsorted and unfiltered|rows appear when it lands/.test(document.body.innerText),
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
export function findFirstRow() {
    // Only the data table's stylesheet: other modules (the top bar) have a `row` class too.
    const isRow = (c) => /^data-table-module__\w+__row$|^data-table_row__/.test(c);
    const isSkeleton = (c) => /^data-table-module__\w+__rowSkeleton$|^data-table_rowSkeleton__/.test(c);
    return [...document.querySelectorAll('[class]')].find(
        (el) => [...el.classList].some(isRow) && ![...el.classList].some(isSkeleton),
    ) ?? null;
}

/** The table's Filters button. The map's control rail has a "Filters" button too (the map's own
 *  filter card), and both say "Filters"; the table's is the one furthest right. */
export async function tableFilters(page) {
    const buttons = page.getByRole('button', { name: /^Filters/ });
    const lefts = await buttons.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
    return buttons.nth(lefts.indexOf(Math.max(...lefts)));
}

export async function clickFirstRow(page) {
    await rowsSteady(page);
    const row = (await page.evaluateHandle(findFirstRow)).asElement();
    if (!row) throw new Error('no table row to click');
    await row.click();
}

/** A table tab, rows loaded — through the folded "Tables —" menu when the strip has no room for
 *  its tabs. */
export async function openTab(page, name) {
    const tab = page.getByRole('tab', { name: new RegExp(`^${name}`) });
    if (await tab.first().isVisible().catch(() => false)) await tab.first().click();
    else {
        await page.locator('button[aria-label^="Tables —"]').click();
        await page.locator('[role="menuitemradio"]').filter({ hasText: new RegExp(`^${name}`) }).first().click();
    }
    await page.waitForTimeout(3_000);
    await rowsSteady(page);
}

export const pickTab = openTab;

export const openLeasesTab = (page) => openTab(page, 'Leases');

/** Opens the analysis panel (Analyze, at the end of the toolbar) on its Charts tab. */
export async function openAnalyze(page) {
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await page.waitForTimeout(2_000);
    const charts = page.getByRole('tab', { name: 'Charts', exact: true });
    if (await charts.isVisible().catch(() => false)) await charts.click();
    await page.waitForTimeout(1_000);
}

/** A card has painted once its stamp line is there and its blocks have swapped their skeletons
 *  for rows — a big field's production takes a while. */
export async function cardSettled(page, text) {
    await page.getByText(text).first().waitFor({ timeout: 90_000 });
    await page
        .waitForFunction(() => !document.querySelector('[class*="keleton"]'), null, { timeout: 180_000 })
        .catch(() => {});
    await page.waitForTimeout(4_000);
}

/** The tables filling the window, so a card opened from them is wide enough to read. */
export async function fillWindow(page) {
    await page.getByRole('button', { name: 'Full screen' }).click();
    await page.mouse.move(720, 870);
    await rowsSteady(page);
}

/** The tables alone, right of the map, once the footer has finished saving a copy to this device. */
export async function tablesOnly(page) {
    await page
        .waitForFunction(() => !/Saving a copy to this device|Totalling every lease/.test(document.body.innerText), null, { timeout: 240_000 })
        .catch(() => {});
    // Once the copy lands the table reads it afresh (and Operators re-totals Texas).
    await rowsSteady(page);
    await page.mouse.move(720, 870);
    await page.waitForTimeout(1_500);
    return { x: 600, y: 0, width: VIEWPORT.width - 600, height: VIEWPORT.height };
}

/** A fresh browser has no copies on this device: the field card's lease chart and the field hover
 *  read the Leases and Wells copies, so wait for the footer to stop saving them. */
export async function copiesSaved(page) {
    await page.waitForTimeout(5_000);
    await page
        // While its copy downloads the server answers, and the footer says so (2026-10-17).
        .waitForFunction(() => !/Saving a copy to this device|Answered by the server while a copy|Waiting for the wells snapshot/.test(document.body.innerText), null, { timeout: 300_000 })
        .catch(() => {});
    await rowsSteady(page);
}

/** Hovers the table row whose first cell reads `name`. */
export async function hoverRow(page, name) {
    await page.getByText(name, { exact: true }).first().hover();
}


/** The top of the first element showing `text`, in CSS px — where a clip should stop. */
export async function topOf(page, text) {
    const at = await page.getByText(text, { exact: false }).first().boundingBox();
    if (!at) throw new Error(`"${text}" is not on screen`);
    return Math.floor(at.y);
}


/** The Alerts drawer, from the rail button just above Profile. */
export async function openAlerts(page) {
    await mapSettled(page);
    await page.getByRole('button', { name: /^Alerts/ }).last().click();
    await page.getByRole('button', { name: /^New( alert)?$/ }).first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3_000);
}

/** The alert form, new, with Jones County picked and these types ticked (New permits starts ticked).
 *  Nothing is saved: the shots never press Create alert. Jones, because the account has no alert
 *  there, so the form doesn't stop on "You already have this alert". */
export async function newAlertForm(page, types = ['New permits']) {
    await openAlerts(page);
    await page.getByRole('button', { name: /^New( alert)?$/ }).first().click();
    await page.getByText('What do you want to hear about?').waitFor({ timeout: 30_000 });
    // The form's own example: the map's place control can read Jones County too.
    await page.getByText('For example').locator('..').getByRole('button', { name: 'Jones County' }).click();
    for (const type of ['New permits', 'Completions', 'Pending permits', 'Rig activity']) {
        const tick = page.getByRole('checkbox', { name: new RegExp(`^${type}`) });
        if ((await tick.isChecked()) !== types.includes(type)) await tick.click();
    }
    // The count under the sentence asks the server, and the first answer can take a while.
    await page.getByText(/in the last 12 months/).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2_000);
}

/** The Jones County map: the county clear of the drawer, for the alert form's outline. */
export const JONES_BESIDE_DRAWER = box(-100.9, 32.2, -99.2, 33.3);
/** The same, with the map's centre, so its place control, on the county. */
export const JONES = box(-100.15, 32.51, -99.61, 32.96);

export const ALERT_CLIP = { x: 0, y: 0, width: 1000, height: 900 };

// ─── helpers: Enterprise ─────────────────────────────────────────────────────

export async function settle(page, ms = 4_000) {
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(ms);
}

export const onWelcome = (page) => page.getByText(/^Welcome back/).first().isVisible().catch(() => false);

/** The project picker, whatever project the account last had open. */
export async function openWelcome(page) {
    await settle(page);
    if (await onWelcome(page)) return;
    await page.keyboard.press('Control+Shift+Digit0');
    await page.getByText(/^Welcome back/).first().waitFor({ timeout: 30_000 });
    await settle(page, 2_000);
}

/** Opens PROJECT, then a page of it, with the workspace tidied for a picture: the account's other
 *  projects taken off the rail, and the docked Ask panel closed. `ready` is text the page shows
 *  once it has loaded. */
export async function openProject(page, path = '/prospect', ready = null, project = PROJECT) {
    await openWelcome(page);
    // The row is the innermost element holding both the name and what it covers.
    await page.locator('div, li, a, button').filter({ hasText: project.name }).filter({ hasText: project.also }).last().click();
    await page.getByRole('button', { name: 'Manage coverage' }).waitFor({ timeout: 60_000 });
    if (path !== '/prospect') await page.goto(BASE_URL + path, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (ready) await page.getByText(ready).first().waitFor({ timeout: 90_000 });
    await settle(page, 6_000);
    const closeAsk = page.getByRole('button', { name: 'Close Ask' });
    if (await closeAsk.isVisible().catch(() => false)) await closeAsk.click();
    // The feed's sources load separately, and one of them failing leaves a "retry" in the panel.
    const retry = page.getByText(/^retry$/i).first();
    if (await retry.isVisible().catch(() => false)) {
        await retry.click();
        await page.waitForTimeout(4_000);
        // Still failing is the local API's trouble, not something the help pages should picture.
        await page.evaluate(() => {
            // The smallest element holding the message — every ancestor up to <body> holds it too.
            const holders = [...document.querySelectorAll('body *')].filter((el) => /did(n.t| not) load/i.test(el.textContent ?? ''));
            let row = holders.sort((a, b) => a.textContent.length - b.textContent.length)[0] ?? null;
            // Then out to the banner it sits in: wrappers that say nothing more than it does.
            while (row?.parentElement && row.parentElement.textContent.trim().length <= row.textContent.trim().length + 8) row = row.parentElement;
            if (row && row.textContent.length < 300) row.style.display = 'none';
        });
    }
    // The rail lists the account's projects under PROJECTS; its sections don't fold. Leave only
    // the one the pictures are of.
    await page.evaluate((keep) => {
        const heading = [...document.querySelectorAll('span')].find(
            (el) => /^projects$/i.test(el.textContent.trim()) && !el.closest('a') && el.getBoundingClientRect().left < 60,
        );
        if (!heading) return;
        const top = heading.getBoundingClientRect().top;
        for (const button of document.querySelectorAll('button')) {
            const at = button.getBoundingClientRect();
            const inList = at.left < 220 && at.top > top && at.width > 100;
            if (inList && button.textContent.trim() !== keep) button.style.display = 'none';
        }
    }, project.name);
    await page.mouse.move(720, 450);
    await page.waitForTimeout(2_500);
}

// ─── annotations ─────────────────────────────────────────────────────────────
// A shot's `annotate` lists what the picture points at: a ring around each target and a numbered
// badge on it, drawn into the page just before the capture (so it is sharp at 2×) and removed
// after. A walkthrough step's badge number is its step number on the page.
//
// A target is a CSS selector — the app's help anchor wherever there is one (`[data-help="…"]`,
// listed in strawn's `maps/help/anchors.ts`; `H` below) — or a function from the page to a
// Playwright locator. `kind`: 'ring' (default), 'box' (a dashed region, for an area of the
// screen), or 'badge' (the number alone). `side` puts the badge somewhere other than the
// target's top-left corner: 'left', 'right', 'top' or 'bottom'.
//
// The colour is provisional until the in-app Help's pointer is designed; then it matches that.
export const ANNOTATION = { color: '#e8590c', halo: 'rgba(232, 89, 12, 0.24)', ink: '#ffffff' };

/** strawn `maps/help/anchors.ts`, the ones the shots use. */
export const H = {
    navRecents: '[data-help="nav.recents"]',
    navMyData: '[data-help="nav.myData"]',
    navProduction: '[data-help="nav.production"]',
    navOperators: '[data-help="nav.operators"]',
    navFields: '[data-help="nav.fields"]',
    navAlerts: '[data-help="nav.alerts"]',
    navProfile: '[data-help="nav.profile"]',
    navProject: '[data-help="nav.project"]',
    navLogo: '[data-help="nav.logo"]',
    search: 'input[role="combobox"][aria-label="Search the map"]',
    place: '[data-cb-place-toggle]',
    layers: '[data-help="rail.layers"]',
    filters: '[data-help="rail.filters"]',
    settings: '[data-help="rail.settings"]',
    print: '[data-help="rail.print"]',
    section: '[data-help="rail.section"]',
    ask: '[data-help="rail.ask"]',
    basemap: '[data-help="dock.basemap"]',
    status: '[data-help="dock.status"]',
    draw: '[data-help="tools.draw"]',
    zoom: '[data-help="tools.zoom"]',
    agentRow: '[data-testid="agent-chip"]',
    spine: 'button[aria-controls="maps-data-panel"]',
    strip: '[data-strip-tabs]',
    exportButton: '[data-help="tables.export"]',
    tab: (id) => `[role="tab"][data-tab="${id}"]`,
    card: '[aria-label="Row detail"]',
    tray: '[aria-label="Compare tray"]',
    askColumn: 'aside[aria-label="Ask"]',
    popupViewWell: '.qs-wp-pri',
    popupLogs: '[data-logs-well]',
    popupCompare: '.qs-wp-cmp',
};

export async function drawAnnotations(page, marks) {
    const boxes = [];
    for (const mark of marks) {
        const target = typeof mark.at === 'function' ? mark.at(page) : page.locator(mark.at).first();
        const box = await target.boundingBox({ timeout: 15_000 }).catch(() => null);
        if (!box) throw new Error(`annotation ${mark.n ?? ''} has nothing to point at: ${typeof mark.at === 'function' ? mark.at.toString() : mark.at}`);
        boxes.push({ ...box, n: mark.n ?? null, label: mark.label ?? null, kind: mark.kind ?? 'ring', side: mark.side ?? 'corner', pad: mark.pad ?? 4 });
    }
    await page.evaluate(({ boxes, color, halo, ink }) => {
        const root = document.createElement('div');
        root.id = 'qs-shot-annotations';
        root.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:600 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const BADGE = 26;
        for (const b of boxes) {
            const x = b.x - b.pad;
            const y = b.y - b.pad;
            const w = b.width + 2 * b.pad;
            const h = b.height + 2 * b.pad;
            if (b.kind !== 'badge') {
                const ring = document.createElement('div');
                const dashed = b.kind === 'box';
                ring.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;border-radius:${dashed ? 12 : 10}px;border:2.5px ${dashed ? 'dashed' : 'solid'} ${color};${dashed ? '' : `box-shadow:0 0 0 4px ${halo};`}`;
                root.appendChild(ring);
            }
            if (b.n == null && !b.label) continue;
            // The badge sits on the ring's top-left corner, or beside the target when asked.
            let bx = x - BADGE / 2;
            let by = y - BADGE / 2;
            if (b.side === 'left') { bx = x - BADGE - 6; by = y + h / 2 - BADGE / 2; }
            if (b.side === 'right') { bx = x + w + 6; by = y + h / 2 - BADGE / 2; }
            if (b.side === 'top') { bx = x + w / 2 - BADGE / 2; by = y - BADGE - 6; }
            if (b.side === 'bottom') { bx = x + w / 2 - BADGE / 2; by = y + h + 6; }
            bx = clamp(bx, 4, vw - BADGE - 4);
            by = clamp(by, 4, vh - BADGE - 4);
            const badge = document.createElement('div');
            badge.style.cssText = `position:absolute;left:${bx}px;top:${by}px;height:${BADGE}px;min-width:${BADGE}px;padding:0 ${b.n == null ? 10 : 0}px;box-sizing:border-box;border-radius:${BADGE / 2}px;background:${color};color:${ink};border:2px solid ${ink};box-shadow:0 2px 6px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;`;
            badge.textContent = b.n != null ? String(b.n) : b.label;
            if (b.n != null && b.label) {
                const label = document.createElement('span');
                label.style.cssText = 'padding-right:9px;font-weight:600;';
                label.textContent = b.label;
                badge.style.padding = '0 0 0 9px';
                badge.appendChild(label);
            }
            root.appendChild(badge);
        }
        document.body.appendChild(root);
    }, { boxes, ...ANNOTATION });
}

export async function clearAnnotations(page) {
    await page.evaluate(() => document.getElementById('qs-shot-annotations')?.remove()).catch(() => {});
}

// ─── writes ──────────────────────────────────────────────────────────────────
// Shots never change the account. The saved map workspace is blocked outright (below, in the run
// loop); these are the other things a shot could save by walking through a feature — an edited
// well, tops, depth records, a log viewer preference, an Ask turn or thread, a synopsis, a page, a
// workbook, a deal, a claim, an alert, a watchlist entry, a placed plat. A non-GET that is not on
// this list goes through (some reads are POSTs) and is printed once, so a new one gets noticed.
// The tops map and the cross-section READ by POST (`tops/section`, `/surface`, `/formations`,
// `/points`), so those go through.
export const BLOCKED_WRITES = /\/api\/v1\/(?:well-edits|tops(?!\/(?:section|surface|formations|points)\b)|intervals|lithology|logs\/preferences|map\/chats?|map\/synopsis|artifacts|workbooks|deals|owners\/claims|alerts|watchlist|plats)\b/;

export async function blockWrites(context, seen, allow = null) {
    await context.route('**/api/**', (route) => {
        const request = route.request();
        const method = request.method();
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return route.fallback();
        const path = new URL(request.url()).pathname;
        const blocked = BLOCKED_WRITES.test(path) && !allow?.test(path);
        const key = `${blocked ? 'blocked' : 'allowed'} ${method} ${path.replace(/\/[0-9a-f-]{8,}|\/\d{5,}/gi, '/…')}`;
        if (!seen.has(key)) {
            seen.add(key);
            console.log(`    · ${key}`);
        }
        return blocked ? route.abort() : route.fallback();
    });
}


// ─── marker → <Frame> ────────────────────────────────────────────────────────

export function mdxFiles(dir) {
    return readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        if (f.startsWith('.') || f === 'node_modules' || f === 'screenshots') return [];
        return statSync(p).isDirectory() ? mdxFiles(p) : p.endsWith('.mdx') ? [p] : [];
    });
}

export function embed(shot) {
    // The marker's own indent carries onto every line of the frame, so one inside a <Step> stays there.
    // `(?![\w-])`, not `\b`: "well-report" must not claim the "well-report-options" marker.
    const marker = new RegExp(`^([ \\t]*)\\{/\\* screenshot: ${shot.name}(?![\\w-])[^*]*\\*/\\}`, 'm');
    const alt = shot.alt.replace(/"/g, '&quot;');
    for (const file of mdxFiles(ROOT)) {
        const text = readFileSync(file, 'utf8');
        if (!marker.test(text)) continue;
        const frame = (pad) => `${pad}<Frame>\n${pad}  <img src="/images/${shot.name}.webp" alt="${alt}" />\n${pad}</Frame>`;
        writeFileSync(file, text.replace(marker, (_, pad) => frame(pad)));
        return file.slice(ROOT.length + 1);
    }
    // Already placed: the picture changed, so its words follow the shot's.
    const placed = new RegExp(`(<img src="/images/${shot.name}\\.webp" alt=")([^"]*)(")`, 'g');
    for (const file of mdxFiles(ROOT)) {
        const text = readFileSync(file, 'utf8');
        const next = text.replace(placed, (all, head, old, tail) => (old === alt ? all : head + alt + tail));
        if (next !== text) {
            writeFileSync(file, next);
            return `${file.slice(ROOT.length + 1)} (alt updated)`;
        }
    }
    return null;
}

// ─── help-demo fixtures ──────────────────────────────────────────────────────
// A shot that must save something to picture it (a well of your own, a correction, an Ask
// thread, a published page) names it "Help demo — …" (wells: HELP DEMO), records it here before
// it saves, and takes it away again in its `after`, forgetting it here once it is gone. Whatever
// is still recorded after a run is a leftover: `node screenshots/fixtures.mjs` lists it, and
// `node screenshots/fixtures.mjs teardown` removes it.
export const FIXTURES_FILE = join(ROOT, 'screenshots', '.auth', 'fixtures.json');
export const DEMO = 'Help demo';

export function fixtures() {
    try {
        return JSON.parse(readFileSync(FIXTURES_FILE, 'utf8'));
    } catch {
        return [];
    }
}

/** `{ kind: 'well'|'correction'|'thread'|'page'|…, … }` — what teardown needs to find it again. */
export function recordFixture(item) {
    const all = fixtures().filter((f) => JSON.stringify(f) !== JSON.stringify(item));
    writeFileSync(FIXTURES_FILE, JSON.stringify([...all, { ...item, at: new Date().toISOString() }], null, 2));
}

export function forgetFixture(match) {
    const keep = fixtures().filter((f) => !Object.entries(match).every(([k, v]) => f[k] === v));
    writeFileSync(FIXTURES_FILE, JSON.stringify(keep, null, 2));
}

// ─── tidy frames ─────────────────────────────────────────────────────────────

/** Off the map and the chrome: a resting pointer over wells raises a popup, over a control a tooltip. */
export async function parkPointer(page) {
    const { height } = page.viewportSize() ?? VIEWPORT;
    await page.mouse.move(40, height + 60);
    await page.waitForTimeout(400);
}

/** The capture account is Enterprise; readers of these pages mostly are not. Grey out what they
 *  would see greyed out, as it would look to them. */
export const ENTERPRISE_ACTIONS = ['Watch', 'Deal draft', 'Add to watchlist', 'Add to project scope', 'New project from these', 'Add to deal draft', 'New project'];
export async function greyEnterprise(page) {
    await page.evaluate((labels) => {
        for (const button of document.querySelectorAll('button')) {
            if (labels.includes(button.textContent.trim()) || labels.includes(button.getAttribute('aria-label') ?? '')) button.disabled = true;
        }
    }, ENTERPRISE_ACTIONS);
}

/** Every email address on screen reads `you@company.com` — the account's own is never published. */
export async function maskEmails(page) {
    await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, 'you@company.com');
        }
    });
}

/** The alert form's "Text to ‹number›" reads the form's own example number: the account's is never
 *  published. Call it last in a shot, so nothing redraws it, and it throws rather than let one through. */
export async function maskPhones(page) {
    const left = await page.evaluate(() => {
        const phone = /\+\d{10,15}/g;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (phone.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(phone, '(432) 555-0100');
        }
        return (document.body.innerText.match(phone) ?? []).length;
    });
    if (left) throw new Error(`${left} phone numbers still on screen`);
}

/** The projects an alert in the drawer belongs to come off its row: other projects are the account's business. */
export async function hideAlertProjects(page) {
    await page.evaluate(() => {
        for (const icon of document.querySelectorAll('.tabler-icon-folder')) {
            const chip = icon.closest('span[title]');
            if (chip) chip.style.display = 'none';
        }
    });
}

// ─── helpers: the live map ───────────────────────────────────────────────────

/**
 * The live Mapbox map. The page doesn't publish it, so it is found through React's fiber on the
 * map's container: the `<Map>` component holds it in a ref. The shots that point at one well or
 * one mark use it to find where that thing is on screen (`project`), never to change the map.
 */
export const FIND_MAP = `(() => {
    const el = document.querySelector('.mapboxgl-map');
    if (!el) return null;
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    let fiber = key ? el[key] : null;
    while (fiber) {
        for (let hook = fiber.memoizedState; hook && typeof hook === 'object'; hook = hook.next) {
            const v = hook.memoizedState;
            const c = v && typeof v === 'object' && 'current' in v ? v.current : null;
            if (c && typeof c.querySourceFeatures === 'function' && typeof c.project === 'function') return c;
        }
        fiber = fiber.return;
    }
    return null;
})()`;

/** Runs `fn(map, arg)` in the page against the live map and returns what it returns. */
export async function withMap(page, fn, arg = null) {
    return page.evaluate(
        ({ src, fn, arg }) => {
            const map = (0, eval)(src);
            if (!map) throw new Error('the map instance was not found');
            return new Function('map', 'arg', `return (${fn})(map, arg);`)(map, arg);
        },
        { src: FIND_MAP, fn: fn.toString(), arg },
    );
}

/** Where `lnglat` is on the page, in CSS px: `project` is relative to the map's container, which
 *  starts right of the left rail. */
export async function onPage(page, lnglat) {
    return withMap(page, (map, ll) => {
        const p = map.project(ll);
        const r = map.getContainer().getBoundingClientRect();
        return { x: r.left + p.x, y: r.top + p.y };
    }, lnglat);
}

/** Every tile in view loaded and drawn: Mapbox's `idle`, or `ms`, whichever comes first. */
export async function mapIdle(page, ms = 15_000) {
    await withMap(
        page,
        (map, ms) =>
            new Promise((done) => {
                const t = setTimeout(done, ms);
                map.once('idle', () => {
                    clearTimeout(t);
                    done();
                });
                map.triggerRepaint();
            }),
        ms,
    );
}

/**
 * The account's My Data layers (its own uploads and drawings) taken off the map in this page only,
 * and kept off as they load: they are its business, not the help's. Nothing is saved; the layers'
 * own switches are untouched.
 */
export async function hideOwnData(page) {
    await withMap(page, (map) => {
        const hide = () => {
            for (const l of map.getStyle()?.layers ?? []) {
                if (l.source === 'my-data' && map.getLayoutProperty(l.id, 'visibility') !== 'none') map.setLayoutProperty(l.id, 'visibility', 'none');
            }
        };
        hide();
        if (!window.__qsHideOwnData) window.__qsHideOwnData = setInterval(hide, 300);
    });
}

/** The map painted, with the account's own data off it. */
export async function ready(page) {
    await mapSettled(page);
    await hideOwnData(page);
    await page.waitForTimeout(500);
}

/** None of the account's own wells (My Wells) in `clip`: they are its business, not the help's. */
export async function noOwnWells(page, clip = null) {
    const n = await withMap(
        page,
        (map, c) => {
            if (!map.getSource('my-wells')) return 0;
            const layers = map.getStyle().layers.filter((l) => l.source === 'my-wells').map((l) => l.id);
            const r = map.getContainer().getBoundingClientRect();
            const area = c ? [[c.x - r.left, c.y - r.top], [c.x - r.left + c.width, c.y - r.top + c.height]] : undefined;
            return map.queryRenderedFeatures(area, { layers }).length;
        },
        clip,
    );
    if (n) throw new Error(`${n} of the account's own wells are in frame`);
}

/** A region around `box` (CSS px), widened by `pad` and kept on the page. */
export function around(b, pad, page = VIEWPORT) {
    const x = Math.max(0, Math.floor(b.x - pad.left));
    const y = Math.max(0, Math.floor(b.y - pad.top));
    const right = Math.min(page.width, Math.ceil(b.x + b.width + pad.right));
    const bottom = Math.min(page.height, Math.ceil(b.y + b.height + pad.bottom));
    return { x, y, width: right - x, height: bottom - y };
}

/** Drags the tables' handle out to x = 560, as `openTables` does: the Search tab's toolbar then has room
 *  for every word, and its rows their columns. */
export async function widenPanel(page) {
    const handle = await page.getByRole('button', { name: 'Hide data tables' }).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, 200);
    await page.mouse.down();
    await page.mouse.move(560, 200, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(2_500);
}
