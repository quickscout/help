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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = (process.env.BASE_URL ?? 'https://quickscout.io').replace(/\/$/, '');
const AUTH_FILE = join(ROOT, 'screenshots', '.auth', `${new URL(BASE_URL).host.replace(':', '_')}.json`);
const only = process.argv.slice(2);

const VIEWPORT = { width: 1440, height: 900 };

// Midland — dense enough that every layer and table has something to show. A box, not
// lat/lng/zoom: /maps ignores those (Mapbox's `bounds` option wins over `center`/`zoom`).
const box = (w, s, e, n) => 'box2d=' + encodeURIComponent(`BOX(${w} ${s},${e} ${n})`);
const MIDLAND = box(-102.25, 31.88, -101.9, 32.12);
// Heatmap cells are miles across, so that shot stands further back.
const MIDLAND_BASIN = box(-102.7, 31.55, -101.3, 32.6);
// The sample well, and a box that puts it right of the record drawer. `?api=` opens the record
// but leaves the camera where it was.
const SAMPLE_API = '4231740219';
const SAMPLE_WELL = box(-102.31, 32.255, -102.12, 32.365);
// The sample well's operator, Diamondback E&P: big enough that every tab has something in it.
const SAMPLE_OPERATOR = '217012';

// The Enterprise shots all show this project. `also` tells two projects with one name apart.
const PROJECT = {
    name: process.env.SHOTS_PROJECT ?? 'Midland 2026 Deal',
    also: process.env.SHOTS_PROJECT_ALSO ?? 'PIONEER',
};
// An operator project has no areas of its own, so the Areas page is pictured from one that does.
const AREAS_PROJECT = {
    name: process.env.SHOTS_AREAS_PROJECT ?? PROJECT.name,
    also: process.env.SHOTS_AREAS_PROJECT_ALSO ?? 'AREAS',
};

// ─── helpers: maps ───────────────────────────────────────────────────────────

/** Mapbox paints after the canvas appears; tiles keep landing for a few seconds more. */
async function mapSettled(page) {
    await page.locator('canvas.mapboxgl-canvas').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(6_000);
}

/** The right-side map controls are hover cards without labels: Layers, Basemap, Filters, Settings. */
async function hoverMapControl(page, index) {
    await page.locator('[class*="controlCapsule"] > *').nth(index).hover();
    await page.waitForTimeout(1_000);
}

/** A row of the Layers card: the layer's name, then its switch. */
function layerSwitch(page, name) {
    return page
        .locator('.mantine-Group-root')
        .filter({ has: page.locator('.mantine-Switch-root') })
        .filter({ hasText: new RegExp(`^${name}$`) })
        .locator('.mantine-Switch-track');
}

// ─── helpers: data tables ────────────────────────────────────────────────────

/** Opens the tables. `wide` drags them to their widest beside the map — at the default width the
 *  toolbar is icons only and a row shows four columns. */
async function openTables(page, { wide = true } = {}) {
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
async function wellsInViewByCumOil(page) {
    await page.getByRole('button', { name: /^Scope:/ }).click();
    await page.getByText('In view', { exact: true }).first().click();
    await page.keyboard.press('Escape');
    await rowsSteady(page);
    await page.getByRole('button', { name: /^Sort:/ }).click();
    await page.getByText('Cum oil bbl', { exact: true }).first().click();
    await page.getByText(/^Descending/).first().click();
    await page.keyboard.press('Escape');
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

/** The Leases tab, rows loaded, with a button the app has not released left out of the picture. */
async function openLeasesTab(page) {
    await page.getByRole('tab', { name: /^Leases/ }).click();
    await page.waitForTimeout(3_000);
    await rowsSteady(page);
    // "Midstream" is held back from the deploy; a local build may still draw its button.
    await page.evaluate(() => {
        for (const label of document.querySelectorAll('button span')) {
            if (label.textContent.trim() === 'Midstream') label.closest('button').style.display = 'none';
        }
    });
}

/** The sample well's lease, open in its drawer. */
async function openSampleLease(page) {
    await mapSettled(page);
    // The lease name in the well's header is the way through; "View lease" is its tooltip.
    await page.getByTitle('View lease').first().click();
    await page.getByRole('tab', { name: 'Owners' }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(6_000);
}

/** The lease drawer from the bottom of its chart down: the title block, the two export buttons
 *  under it, and whichever export menu is open. */
const LEASE_EXPORT_CLIP = { x: 0, y: 400, width: 640, height: 500 };
/** Somewhere to leave the pointer: the operator's name, which has no hover of its own. The map
 *  beside the drawer answers a resting pointer with a well popup. */
const LEASE_REST = [270, 466];

/** The top of the first element showing `text`, in CSS px — where a clip should stop. */
async function topOf(page, text) {
    const at = await page.getByText(text, { exact: false }).first().boundingBox();
    if (!at) throw new Error(`"${text}" is not on screen`);
    return Math.floor(at.y);
}

// ─── helpers: Enterprise ─────────────────────────────────────────────────────

async function settle(page, ms = 4_000) {
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(ms);
}

const onWelcome = (page) => page.getByText(/^Welcome back/).first().isVisible().catch(() => false);

/** The project picker, whatever project the account last had open. */
async function openWelcome(page) {
    await settle(page);
    if (await onWelcome(page)) return;
    await page.keyboard.press('Control+Shift+Digit0');
    await page.getByText(/^Welcome back/).first().waitFor({ timeout: 30_000 });
    await settle(page, 2_000);
}

/** Opens PROJECT, then a page of it, with the workspace tidied for a picture: the account's other
 *  projects taken off the rail, and the docked Ask panel closed. `ready` is text the page shows
 *  once it has loaded. */
async function openProject(page, path = '/prospect', ready = null, project = PROJECT) {
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

// ─── the shots ───────────────────────────────────────────────────────────────
// name        → images/<name>.webp, and the marker it replaces
// alt         → the image's alt text on the page
// auth        → needs the saved session
// startDrawer → leave Maps' first-load start drawer open (every other Maps shot closes it)
// run         → drives the page; may return a clip `{ x, y, width, height }` in CSS px

const SHOTS = [
    // Maps
    {
        name: 'maps-overview',
        alt: 'The Maps screen over Midland County',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: mapSettled,
    },
    {
        name: 'maps-start-drawer',
        alt: 'The start drawer, with Go to place, Go to RRC record, Basins and Saved scopes',
        auth: true,
        startDrawer: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            return { x: 0, y: 0, width: 900, height: 900 };
        },
    },
    {
        name: 'maps-layers',
        alt: 'The layer list, grouped into Wells, Analytics and Reference',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await hoverMapControl(page, 0);
            return { x: 640, y: 0, width: 800, height: 640 };
        },
    },
    {
        name: 'maps-heatmap',
        alt: 'The Well Heatmap over the Midland Basin, with its metric menu and color legend',
        auth: true,
        path: `/maps?${MIDLAND_BASIN}`,
        run: async (page) => {
            await mapSettled(page);
            await hoverMapControl(page, 0);
            await layerSwitch(page, 'Well Heatmap').click();
            await page.waitForTimeout(8_000);
        },
    },
    {
        name: 'maps-search',
        alt: 'Search suggestions for Pioneer, each with its operator, field, county and daily production',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await page.getByPlaceholder('Search QuickScout Maps...').fill('Pioneer');
            await page.waitForTimeout(3_000);
            return { x: 0, y: 0, width: 900, height: 640 };
        },
    },
    {
        name: 'maps-search-results',
        alt: 'The results list for Pioneer, with tabs, sort chips and the matching leases highlighted on the map',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await page.getByPlaceholder('Search QuickScout Maps...').fill('Pioneer');
            await page.waitForTimeout(3_000);
            await page.keyboard.press('Enter');
            await page.getByText('Export CSV').first().waitFor({ timeout: 60_000 });
            await page.waitForTimeout(6_000);
        },
    },
    {
        name: 'place-panel',
        alt: 'The place panel for Midland County: the In this view digest, suggested questions, and the Ask about this view box',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await page.getByRole('button', { name: /Midland County/ }).hover();
            const ask = page.getByPlaceholder('Ask about this view…');
            await ask.waitFor({ timeout: 30_000 });
            // The digest lands after the panel opens, and pushes the ask box down.
            await page.getByText('In this view').first().waitFor({ timeout: 20_000 }).catch(() => {});
            await page.waitForTimeout(3_000);
            const bottom = (await ask.boundingBox()).y + 70;
            return { x: 380, y: 0, width: 760, height: Math.min(Math.ceil(bottom), VIEWPORT.height) };
        },
    },
    {
        name: 'well-drawer',
        alt: 'A well record: satellite view, operator and lease, the Builder and Report buttons, and the Wellbore tab',
        auth: true,
        path: `/maps?${SAMPLE_WELL}&api=${SAMPLE_API}`,
        run: async (page) => {
            await mapSettled(page);
            await page.getByText('Report', { exact: true }).first().waitFor({ timeout: 30_000 });
            // The satellite picture is the slowest thing in the drawer.
            await page.waitForTimeout(12_000);
        },
    },
    {
        name: 'lease-drawer',
        alt: 'A lease record: its production chart, the Production and Wells export buttons under its name, Claim Your Interest, and the Overview tab',
        auth: true,
        path: `/maps?${SAMPLE_WELL}&api=${SAMPLE_API}`,
        run: openSampleLease,
    },
    {
        name: 'lease-export-production',
        alt: "A lease's Production export menu: the production window, Production CSV and DRI",
        auth: true,
        path: `/maps?${SAMPLE_WELL}&api=${SAMPLE_API}`,
        run: async (page) => {
            await openSampleLease(page);
            await page.getByRole('button', { name: 'Export production' }).click();
            await page.getByText('Production CSV — a row per month').waitFor({ timeout: 30_000 });
            await page.mouse.move(...LEASE_REST);
            await page.waitForTimeout(1_500);
            return LEASE_EXPORT_CLIP;
        },
    },
    {
        name: 'lease-export-wells',
        alt: "A lease's Wells export menu: Wells CSV, GeoGraphix ASCII4, OpenWorks OWX and Copy API numbers",
        auth: true,
        path: `/maps?${SAMPLE_WELL}&api=${SAMPLE_API}`,
        run: async (page) => {
            await openSampleLease(page);
            await page.getByRole('button', { name: 'Export wells' }).click();
            await page.getByText('Wells CSV — a row per bore').waitFor({ timeout: 30_000 });
            // The options are greyed out until the lease's wells have been read.
            await page
                .waitForFunction(() => !/Reading the lease/.test(document.body.innerText), null, { timeout: 90_000 })
                .catch(() => {});
            await page.mouse.move(...LEASE_REST);
            await page.waitForTimeout(1_500);
            return LEASE_EXPORT_CLIP;
        },
    },

    {
        name: 'chart-download',
        alt: "The gear menu on a lease's production chart, ending in Download Image and Download CSV",
        auth: true,
        path: `/maps?${SAMPLE_WELL}&api=${SAMPLE_API}`,
        run: async (page) => {
            await openSampleLease(page);
            // Three unlabelled icons sit at the chart's top right; the gear is the last of them.
            const icons = await page.evaluate(() =>
                [...document.querySelectorAll('button')]
                    .map((b) => b.getBoundingClientRect())
                    .filter((r) => r.top > 60 && r.top < 110 && r.left > 370 && r.left < 470 && r.width < 30)
                    .map((r) => [r.left + r.width / 2, r.top + r.height / 2])
                    .sort((a, b) => a[0] - b[0]),
            );
            if (!icons.length) throw new Error("the chart's icons are not where they were");
            await page.mouse.click(...icons[icons.length - 1]);
            await page.getByText('Download CSV').waitFor({ timeout: 30_000 });
            await page.getByText('Download CSV').scrollIntoViewIfNeeded();
            // Left of the menu and still on the drawer: over the map, a resting pointer raises a well popup.
            await page.mouse.move(120, 466);
            await page.waitForTimeout(1_500);
            return { x: 0, y: 0, width: 640, height: VIEWPORT.height };
        },
    },
    {
        name: 'operator-wells-export',
        alt: "An operator's Wells tab: Export CSV beside the well count, above Plugging Liability Only",
        auth: true,
        path: `/maps?${SAMPLE_WELL}&operator_no=${SAMPLE_OPERATOR}`,
        run: async (page) => {
            await mapSettled(page);
            await page.getByRole('tab', { name: 'Wells' }).click();
            await page.getByRole('button', { name: 'Export CSV' }).waitFor({ timeout: 60_000 });
            await page.mouse.move(270, 466);
            await page.waitForTimeout(4_000);
            return { x: 0, y: 420, width: 640, height: 480 };
        },
    },

    // Data tables
    {
        name: 'data-panel',
        alt: 'The Wells table open beside the map, listing the wells in view by cumulative oil',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await wellsInViewByCumOil(page);
        },
    },
    {
        name: 'data-toolbar',
        alt: 'The tables filling the window: tabs with their counts, the search box, and the toolbar with its labels',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page, { wide: false });
            await wellsInViewByCumOil(page);
            await page.getByRole('button', { name: 'Fill the window' }).click();
            // The pointer is left over the top row's buttons, and their tooltip covers Columns.
            await page.mouse.move(720, 620);
            await rowsSteady(page);
            return { x: 72, y: 0, width: VIEWPORT.width - 72, height: 330 };
        },
    },
    {
        name: 'data-filters',
        alt: 'The Filters popover on the Wells tab, with quick filter pills and their counts',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await wellsInViewByCumOil(page);
            await page.getByRole('button', { name: /^Filters/ }).first().click();
            await page.getByText('Include historic wells').waitFor({ timeout: 30_000 });
            await page.waitForTimeout(1_500);
            // "Inside a My Data layer" lists the account's own file names. Without it this is the
            // popover an account with no area layers sees, so drop that section rather than crop it.
            const bottom = await page.evaluate(() => {
                const leaves = [...document.querySelectorAll('*')].filter((el) => el.children.length === 0);
                const label = leaves.find((el) => /inside a my data layer/i.test(el.textContent ?? ''));
                let section = label ?? null;
                while (section?.parentElement && !/include historic wells/i.test(section.parentElement.textContent ?? '')) {
                    section = section.parentElement;
                }
                const popover = section?.parentElement ?? leaves.find((el) => /include historic wells/i.test(el.textContent ?? ''));
                if (section) section.style.display = 'none';
                return popover.getBoundingClientRect().bottom;
            });
            return { x: 560, y: 0, width: VIEWPORT.width - 560, height: Math.ceil(bottom) + 90 };
        },
    },
    {
        name: 'row-card',
        alt: "A well's row card open beside the Wells table, showing totals and production blocks",
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await wellsInViewByCumOil(page);
            // A horizontal well: every block of the card has something in it.
            await page.getByRole('button', { name: /^Filters/ }).first().click();
            await page.getByRole('button', { name: /horizontal$/ }).first().click();
            await page.keyboard.press('Escape');
            await clickFirstRow(page);
            await page.getByText('Open full well record').waitFor({ timeout: 30_000 });
            await page.waitForTimeout(8_000);
        },
    },
    {
        name: 'data-chart',
        alt: 'A scatter of lateral length against cumulative oil above the Wells table',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await wellsInViewByCumOil(page);
            await page.getByRole('button', { name: 'Charts', exact: true }).click();
            await page.getByRole('button', { name: 'Lateral × cum oil' }).click();
            await page.waitForTimeout(6_000);
        },
    },
    {
        name: 'data-export',
        alt: 'The Export menu on the Wells tab, listing Table CSV, GeoGraphix ASCII4, OpenWorks OWX and DRI',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await wellsInViewByCumOil(page);
            await page.getByRole('button', { name: 'Export', exact: true }).click();
            await page.getByText('DRI v2.4 production (.dri)').waitFor({ timeout: 30_000 });
            await page.waitForTimeout(1_000);
            return { x: 560, y: 0, width: VIEWPORT.width - 560, height: 420 };
        },
    },
    {
        name: 'data-export-leases',
        alt: 'The Export menu on the Leases tab: the production window, then Table CSV, Production CSV and DRI',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await openLeasesTab(page);
            await page.getByRole('button', { name: 'Export', exact: true }).click();
            await page.getByText('Production CSV — a row per lease-month').waitFor({ timeout: 30_000 });
            await page.mouse.move(720, 700);
            await page.waitForTimeout(1_500);
            return { x: 560, y: 0, width: VIEWPORT.width - 560, height: 420 };
        },
    },
    {
        name: 'data-selection',
        alt: 'Three leases ticked, and the bar above the table: Export CSV, Export production, Compare production and Copy lease keys, with the Enterprise actions greyed out',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await openLeasesTab(page);
            const tick = page.getByRole('button', { name: 'Select lease', exact: true });
            for (let i = 0; i < 3; i++) await tick.nth(i).click();
            await page.getByText('3 selected').waitFor({ timeout: 30_000 });
            // Pictured the way the readers of these pages see it: the Enterprise actions greyed out.
            await page.evaluate(() => {
                const enterprise = ['Add to watchlist', 'Add to project scope', 'New project from these', 'Add to deal draft'];
                for (const button of document.querySelectorAll('button')) {
                    if (enterprise.includes(button.textContent.trim())) button.disabled = true;
                }
            });
            await page.mouse.move(720, 700);
            await page.waitForTimeout(1_500);
            return { x: 560, y: 0, width: VIEWPORT.width - 560, height: 380 };
        },
    },
    {
        name: 'offline-copies',
        alt: 'The Local data panel listing each dataset, its size and whether it is stored on this device',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await wellsInViewByCumOil(page);
            await page.getByRole('button', { name: /^Snapshot/ }).click();
            await page.getByText('Remove everything stored on this device').waitFor({ timeout: 30_000 });
            // A fresh browser has no copies: give the downloads time to land, so the panel shows
            // "On this device" rather than six rows of "Downloading".
            await page
                .waitForFunction(() => !/Downloading/.test(document.body.innerText), null, { timeout: 240_000 })
                .catch(() => {});
            await page.waitForTimeout(2_000);
            return { x: 560, y: 0, width: VIEWPORT.width - 560, height: VIEWPORT.height };
        },
    },

    // Tools
    {
        name: 'well-report',
        alt: 'The cover page of a well report, with the Options and Print buttons above it',
        auth: true,
        path: `/wells/${SAMPLE_API}/report`,
        run: async (page) => {
            await page.getByRole('button', { name: 'Print' }).waitFor({ timeout: 60_000 });
            await page.waitForTimeout(4_000);
        },
    },
    {
        name: 'well-report-options',
        alt: 'The Options panel of the well report: pages, appendices, chart scale and months in table',
        auth: true,
        path: `/wells/${SAMPLE_API}/report`,
        run: async (page) => {
            await page.getByRole('button', { name: 'Print' }).waitFor({ timeout: 60_000 });
            await page.getByRole('button', { name: 'Options' }).click();
            await page.getByText('Months in table').waitFor({ timeout: 30_000 });
            await page.mouse.move(1_100, 500);
            await page.waitForTimeout(2_000);
        },
    },
    {
        name: 'wellbore-builder',
        alt: 'The Wellbore Builder with a horizontal well loaded from the RRC record',
        auth: true,
        path: `/wellbore?api=${SAMPLE_API}`,
        run: async (page) => {
            await page.getByText(/Components \(\d+\)/).waitFor({ timeout: 60_000 });
            // "Loaded from RRC" lands over the header's buttons.
            const toast = page.getByText('Loaded from RRC').first();
            await toast.waitFor({ timeout: 15_000 }).catch(() => {});
            const close = page.locator('div').filter({ has: toast }).last().locator('button').first();
            if (await close.isVisible().catch(() => false)) await close.click();
            await toast.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
            await page.waitForTimeout(1_500);
        },
    },
    {
        name: 'alerts-page',
        alt: 'The Alerts page in Table view: every match across your alerts, newest first',
        auth: true,
        path: '/alerts',
        run: async (page) => {
            await page.getByText('Every match across your alerts').waitFor({ timeout: 60_000 });
            await page.waitForTimeout(3_000);
        },
    },
    {
        name: 'ask-ai',
        alt: 'Ask QuickScout AI answering a question about transferring a lease, with the RRC and Geology modes beside the question box',
        auth: true,
        path: '/ask',
        run: async (page) => {
            // A real question, the one the page gives as its example, in place of the idle demo.
            const ask = page.getByPlaceholder(/Ask about RRC/);
            await ask.waitFor({ timeout: 60_000 });
            // The box is in the server's HTML before React has hold of it; typing too soon is lost.
            await page.waitForTimeout(4_000);
            await ask.click();
            await ask.pressSequentially('Which form do I file to transfer a lease to a new operator?', { delay: 15 });
            await ask.press('Enter');
            // Done when the answer has stopped growing for three seconds.
            let last = '';
            let stillFor = 0;
            for (let i = 0; i < 180 && stillFor < 6; i++) {
                await page.waitForTimeout(500);
                const text = await page.locator('body').innerText();
                stillFor = text === last && i > 10 ? stillFor + 1 : 0;
                last = text;
            }
        },
    },
    {
        name: 'dashboard',
        alt: 'The statewide Dashboard: headline numbers, permit and completion activity, and initial potential',
        auth: false,
        path: '/dashboard',
        run: async (page) => {
            await page.getByText('Permit & completion activity').waitFor({ timeout: 60_000 });
            await page.waitForTimeout(3_000);
        },
    },

    // Owner Portal
    {
        name: 'owners-search',
        alt: 'The Search tab of the Owner Portal, with the county and owner number search',
        auth: true,
        path: '/owners',
        run: async (page) => {
            await settle(page, 3_000);
            await page.getByRole('tab', { name: /Search/ }).click();
            await page.getByText('Search for Your Producing Mineral Properties').waitFor({ timeout: 30_000 });
            await page.waitForTimeout(2_000);
        },
    },
    {
        name: 'owners-portal',
        alt: 'The Properties tab of the Owner Portal: the tabs, your totals, and the downloads',
        auth: true,
        path: '/owners',
        run: async (page) => {
            await settle(page, 3_000);
            // Stops under the column headings: the rows are the account's own interests.
            const downloads = await topOf(page, 'Download Report');
            return { x: 0, y: 0, width: VIEWPORT.width, height: downloads + 108 };
        },
    },

    // Enterprise
    {
        name: 'enterprise-welcome',
        alt: 'The welcome screen: your projects on the right, each with its recent events and production',
        auth: true,
        path: '/prospect',
        run: async (page) => {
            await openWelcome(page);
            // Only the projects the pictures use, not the account's whole list.
            await page.getByPlaceholder(/^Filter \d+ projects/).fill(PROJECT.name);
            await page.waitForTimeout(2_000);
        },
    },
    {
        name: 'enterprise-home',
        alt: "A project's Home board: overview totals, the daily brief, the activity map and the event feed",
        auth: true,
        path: '/prospect',
        run: (page) => openProject(page, '/prospect', 'WELL RECORDS'),
    },
    {
        name: 'enterprise-activity',
        alt: 'The Activity page: the Summary band, then every event in the window',
        auth: true,
        path: '/prospect',
        run: (page) => openProject(page, '/prospect/activity'),
    },
    {
        name: 'enterprise-areas',
        alt: "The Areas page: the project's areas listed beside the map they are drawn on",
        auth: true,
        path: '/prospect',
        run: async (page) => {
            await openProject(page, '/prospect/areas', null, AREAS_PROJECT);
            // The map opens on all of Texas, where one county-sized area is a speck.
            await page.getByRole('button', { name: 'Zoom to area' }).first().click();
            await page.mouse.move(520, 600);
            await page.waitForTimeout(6_000);
        },
    },
    {
        name: 'enterprise-economics',
        alt: 'The Economics page: net asset value, the discount ladder, and where the value sits',
        auth: true,
        path: '/prospect',
        run: (page) => openProject(page, '/prospect/analytics'),
    },
    {
        name: 'enterprise-charts',
        alt: 'An empty chart board, with starter questions and Build one from scratch',
        auth: true,
        path: '/prospect',
        run: (page) => openProject(page, '/prospect/charts'),
    },
    {
        name: 'enterprise-chart-builder',
        alt: 'The chart builder in Guided mode: the three steps, the chart described in words, and a live preview',
        auth: true,
        path: '/prospect',
        run: async (page) => {
            await openProject(page, '/prospect/charts');
            // Opening the builder saves nothing: a chart exists once "Add to board" is pressed.
            await page.getByRole('button', { name: 'Build one from scratch' }).click();
            await page.getByText('What are you looking at?').first().waitFor({ timeout: 30_000 });
            await page.waitForTimeout(3_000);
        },
    },
    {
        name: 'enterprise-deal-new',
        alt: 'Starting a deal: What are you buying? An operator, a lease collection, or an area of interest',
        auth: true,
        path: '/prospect',
        run: (page) => openProject(page, '/prospect/deals/new', 'What are you buying?'),
    },
    // Not pictured yet, because PROJECT has none: a deal on its Curate tab, a log in Log Analysis,
    // a cross section. Their markers are on the pages; give the project one of each, then add shots.
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
    // The marker's own indent carries onto every line of the frame, so one inside a <Step> stays there.
    // `(?![\w-])`, not `\b`: "well-report" must not claim the "well-report-options" marker.
    const marker = new RegExp(`^([ \\t]*)\\{/\\* screenshot: ${shot.name}(?![\\w-])[^*]*\\*/\\}`, 'm');
    for (const file of mdxFiles(ROOT)) {
        const text = readFileSync(file, 'utf8');
        if (!marker.test(text)) continue;
        const alt = shot.alt.replace(/"/g, '&quot;');
        const frame = (pad) => `${pad}<Frame>\n${pad}  <img src="/images/${shot.name}.webp" alt="${alt}" />\n${pad}</Frame>`;
        writeFileSync(file, text.replace(marker, (_, pad) => frame(pad)));
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
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        colorScheme: 'light',
        storageState: shot.auth ? AUTH_FILE : undefined,
    });
    // The account's saved map workspace (camera, open panels, tabs) is neither loaded nor
    // written: shots start from a clean map framed by their URL, and the account is untouched.
    await context.route('**/api/v1/core/map-state**', (route) => route.abort());
    await context.route(/sentry\.io|ingest\.sentry/, (route) => route.abort());

    await context.addInitScript((startDrawer) => {
        // Maps opens its start drawer on a session's first load, and every shot is a first load.
        if (!startDrawer) sessionStorage.setItem('map-loaded', 'true');
        // `next dev` puts its dev-tools badge in the corner; it isn't part of the app.
        const hide = () => {
            const style = document.createElement('style');
            style.textContent = 'nextjs-portal { display: none !important; }';
            document.head.appendChild(style);
        };
        if (document.head) hide();
        else document.addEventListener('DOMContentLoaded', hide);
    }, !!shot.startDrawer);

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
        const clip = (await shot.run(page)) ?? undefined;
        // WebP, not PNG: a map is a photograph to a compressor, and a PNG of one runs to 5 MB.
        const png = await page.screenshot({ clip });
        await sharp(png).webp({ quality: 86 }).toFile(join(ROOT, 'images', `${shot.name}.webp`));
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
