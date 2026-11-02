// Select an area (maps/selection): Select's bar, the Selected area card, its Export card, Narrow,
// the tag the selection leaves on the map, and the Selected area tab. One walkthrough, so the area
// is drawn once and each step sees what the one before did. See the field list at the top of shots.mjs.
//
// Nothing is saved: the selection lives in the map workspace, which every shot's context blocks
// (`shots.mjs`), and the context's own storage goes with it. The Export card is only opened: its
// choice of formats is a map pref too, and nothing is pressed or downloaded.
//
// LOCAL_API=http://127.0.0.1:8000 sends the Export card's two newest reads (the land grid's
// `/land/tracts` and `/geo/nad27`, prod-data-api 2026-10-24) to a local prod-data-api, for the
// pictures taken before those routes are deployed. Without it, a deployed API that lacks them
// shows the card's "Needs a server update." line.

import { greyEnterprise, H, MIDLAND, onPage, parkPointer, ready, rowsSteady, VIEWPORT } from '../lib.mjs';

// About a thousand wells on four or five hundred leases in and around Midland: every default
// block has something in it, and the area sits in the middle of the MIDLAND frame.
const AREA = { west: -102.1, south: 31.95, east: -102.0, north: 32.05 };

const card = (page) => page.locator(H.card).first();
const hint = '[role="toolbar"][aria-label="Select an area"]';
const tagOpen = 'button[title="Open the selected area’s card"]';
const selectTool = `${H.draw} button[aria-label="Select"]`;

/** Select armed through its own button — on a short map the tools fold behind Draw first. */
async function armSelect(page) {
    if (!(await page.locator(selectTool).isVisible().catch(() => false))) {
        await page.locator(H.draw).getByRole('button', { name: /^Draw tools/ }).click();
    }
    await page.getByRole('button', { name: 'Select', exact: true }).first().click();
    await page.locator(hint).waitFor({ timeout: 30_000 });
}

/** The box dragged corner to corner, the way a reader draws it. */
async function dragArea(page) {
    const a = await onPage(page, [AREA.west, AREA.north]);
    const b = await onPage(page, [AREA.east, AREA.south]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 24 });
    await page.mouse.up();
}

/** The card up and its blocks past their skeletons — the production reads take the longest. */
async function cardReady(page, ms = 4_000) {
    await card(page).waitFor({ timeout: 120_000 });
    await page.getByText('Everything in the area', { exact: true }).first().waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => !document.querySelector('[aria-label="Row detail"] [class*="keleton"]'), null, { timeout: 180_000 }).catch(() => {});
    await page.waitForTimeout(ms);
}

const exportCard = '[role="dialog"][aria-label="Export"]';

/** The land grid's and NAD27's routes read from LOCAL_API, when it is set (see the top of this file). */
async function localRoutes(page) {
    const base = process.env.LOCAL_API;
    if (!base) return;
    await page.evaluate((local) => {
        if (window.__qsShotRoutes) return;
        window.__qsShotRoutes = true;
        const original = window.fetch.bind(window);
        window.fetch = (input, init) => {
            if (typeof input === 'string') {
                const path = new URL(input, location.href).pathname;
                if (/^\/api\/v1\/(?:land\/tracts|geo\/nad27)$/.test(path)) return original(`${local}${path}`, init);
            }
            return original(input, init);
        };
    }, base);
}

/** Marks the smallest box in the card holding all six verbs, so one ring can go round them. */
async function markTiles(page) {
    await page.evaluate(() => {
        const root = document.querySelector('[aria-label="Row detail"]');
        const zoom = root && [...root.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === 'Zoom to');
        let el = zoom;
        while (el && el !== root && !/Export/.test(el.textContent ?? '')) el = el.parentElement;
        el?.setAttribute('data-shot', 'selection-tiles');
    });
}

export default [
    {
        name: 'selection',
        auth: true,
        path: `/maps?${MIDLAND}`,
        steps: [
            {
                name: 'selection-hint',
                alt: 'The bottom of the map over Midland with Select on: the bar with Box pressed, Shape, Wells and Survey, Drag a box over the area and Cancel, and Select lit in the draw tools',
                run: async (page) => {
                    await ready(page);
                    await armSelect(page);
                    await parkPointer(page);
                    await page.waitForTimeout(1_000);
                    // The whole draw-tools group (it starts about halfway down a 900 px map) and the bar under the map.
                    return { x: 72, y: VIEWPORT.height - 440, width: VIEWPORT.width - 72, height: 440 };
                },
                annotate: [
                    { at: selectTool, n: 1, side: 'left' },
                    { at: '[role="group"][aria-label="Select by"]', n: 2, side: 'top' },
                ],
            },
            {
                name: 'selection-card',
                alt: 'The Selected area card beside the map over Midland: Selected area · Box with Clear, the counties and the acres, Everything in the area, the buttons Zoom to, Show on map, Narrow, Table, Cross section and Export, and the Totals block',
                run: async (page) => {
                    await dragArea(page);
                    await cardReady(page);
                    await greyEnterprise(page);
                    await markTiles(page);
                    await parkPointer(page);
                },
                annotate: (page) => [
                    { at: () => card(page).getByRole('button', { name: 'Clear', exact: true }).first(), n: 1, side: 'left' },
                    { at: () => card(page).getByText('Everything in the area', { exact: true }).first(), n: 2, side: 'right' },
                    { at: '[data-shot="selection-tiles"]', n: 3, side: 'left' },
                ],
            },
            {
                name: 'selection-export',
                alt: 'The Export card open under the Selected area card’s Export button: Wells, Monthly production, Land grid, Leases and Outline, each with its count and its format buttons, and the foot with how many files and Download',
                run: async (page) => {
                    await localRoutes(page);
                    await card(page).getByRole('button', { name: 'Export', exact: true }).first().click();
                    const dialog = page.locator(exportCard);
                    await dialog.waitFor({ timeout: 30_000 });
                    // Every chosen row counted: the foot then says how many files, and about how big.
                    await dialog.getByText(/ · one \.zip · about /).waitFor({ timeout: 180_000 });
                    await page.waitForFunction((sel) => !document.querySelector(`${sel} [aria-label="Counting"]`), exportCard, { timeout: 180_000 }).catch(() => {});
                    await page.evaluate((sel) => {
                        document.querySelector(`${sel} [class*="__formats"]`)?.setAttribute('data-shot', 'export-wells-formats');
                    }, exportCard);
                    await page.waitForTimeout(1_000);
                    await parkPointer(page);
                    // The card and the Export card over it; the map to their left says nothing here.
                    return { x: 820, y: 0, width: VIEWPORT.width - 820, height: VIEWPORT.height };
                },
                annotate: (page) => [
                    // Above the tile: to its left the badge would sit on the Cross section tile's word.
                    { at: () => card(page).getByRole('button', { name: 'Export', exact: true }).first(), n: 1, side: 'top' },
                    { at: '[data-shot="export-wells-formats"]', n: 2, side: 'left' },
                    { at: () => page.locator(exportCard).getByRole('button', { name: 'Download', exact: true }), n: 3, side: 'left' },
                ],
            },
            {
                name: 'selection-narrow',
                alt: 'Narrow the selection, open beside the Selected area card: Wellbore with Both pressed, the area’s wells by map symbol with their counts, the First production years and the start of the Operators list',
                run: async (page) => {
                    // Esc shuts the Export card, and only it (the card's own Esc stops there).
                    if (await page.locator(exportCard).isVisible().catch(() => false)) {
                        await page.keyboard.press('Escape');
                        await page.locator(exportCard).waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
                    }
                    await card(page).getByRole('button', { name: /^Narrow/ }).first().click();
                    const dialog = page.locator('[role="dialog"][aria-label="Narrow the selection"]');
                    await dialog.waitFor({ timeout: 30_000 });
                    await page.waitForFunction(() => !/Counting the area’s wells/.test(document.querySelector('[role="dialog"][aria-label="Narrow the selection"]')?.textContent ?? ''), null, { timeout: 120_000 });
                    await page.evaluate(() => {
                        const box = document.querySelector('[role="dialog"][aria-label="Narrow the selection"] [role="checkbox"]');
                        box?.parentElement?.setAttribute('data-shot', 'narrow-wells');
                    });
                    await page.waitForTimeout(1_500);
                    await parkPointer(page);
                },
                // The card's foot (the count, Reset and Done) runs past the bottom of a 900 px page.
                annotate: [
                    { at: '[role="dialog"][aria-label="Narrow the selection"] [role="radiogroup"][aria-label="Wellbore"]', n: 1, side: 'left' },
                    { at: '[data-shot="narrow-wells"]', n: 2, side: 'left' },
                ],
            },
            {
                name: 'selection-tag',
                alt: 'The map over Midland with the selected area’s outline, the tag at its top corner with the well count, Open and ×, and Select in the draw tools wearing the same count',
                run: async (page) => {
                    // Esc shuts Narrow without applying it; the card's ✕ shuts the card and leaves the selection.
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(800);
                    await card(page).getByRole('button', { name: 'Close the card' }).first().click();
                    await page.locator(tagOpen).waitFor({ timeout: 30_000 });
                    await page.waitForTimeout(2_000);
                    await parkPointer(page);
                },
                annotate: (page) => [
                    { at: () => page.locator(tagOpen).locator('..'), n: 1, side: 'top' },
                    { at: selectTool, n: 2, side: 'left' },
                ],
            },
            {
                name: 'selection-tab',
                alt: 'The Selected area tab in the data tables: the band with Selected area, the area’s size and Everything in the selected area, On the map with Table + map, and Close, the Rows choice, and the area’s wells',
                run: async (page) => {
                    await page.locator(tagOpen).click();
                    await cardReady(page, 1_500);
                    await card(page).getByRole('button', { name: 'Table', exact: true }).first().click();
                    await page.getByText(/^Everything in the selected area/).first().waitFor({ timeout: 60_000 });
                    // The picture is of the tab: the card goes, and the tables take the window.
                    await card(page).getByRole('button', { name: 'Close the card' }).first().click().catch(() => {});
                    await page.getByRole('button', { name: 'Full screen' }).click();
                    await rowsSteady(page);
                    // The band's note, not the whole band: the band starts at the clip's edge, so a badge
                    // on its corner would fall outside the picture.
                    await page.evaluate(() => {
                        const note = [...document.querySelectorAll('p')].find((p) => /^Everything in the selected area/.test(p.textContent ?? ''));
                        note?.setAttribute('data-shot', 'selection-band');
                    });
                    await page.mouse.move(720, 700);
                    await parkPointer(page);
                    return { x: 72, y: 0, width: VIEWPORT.width - 72, height: 440 };
                },
                annotate: [
                    { at: '[data-shot="selection-band"]', n: 1 },
                    { at: 'button[aria-label^="Rows:"]', n: 2, side: 'bottom' },
                ],
            },
        ],
    },
];
