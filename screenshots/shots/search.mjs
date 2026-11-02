// Search, the Search tab, and the data tables (data-panel, filters, charts, map data).
// See the field list at the top of shots.mjs.

import {
    box,
    findFirstRow,
    greyEnterprise,
    H,
    mapSettled,
    MIDLAND,
    openAnalyze,
    openTables,
    parkPointer,
    pickTab,
    rowsSteady,
    tableFilters,
    VIEWPORT,
    wellsInViewByCumOil,
    widenPanel,
} from '../lib.mjs';

// ─── local helpers ───────────────────────────────────────────────────────────

/** Midland, moved east so Pioneer's lit wells near Saddle Club sit left of a wide Search tab. */
const MIDLAND_EAST = box(-102.14, 31.88, -101.79, 32.12);
/** South Wise County: the KIKER leases are on screen here, so a hovered one lights where it can be seen. */
const WISE_KIKER = box(-97.66, 33.06, -97.48, 33.16);

const field = (page) => page.getByRole('combobox', { name: 'Search the map' });
const panelRows = (page, group) => page.locator(`[role="group"][aria-label="${group}"] [role="option"]`);

/** Types a search and presses Enter: the data panel opens on the Search tab, once the server or this
 *  device has answered, and the "read by the server…" note has gone (the files have landed). */
async function runSearch(page, words) {
    const input = field(page);
    await input.click();
    await input.pressSequentially(words, { delay: 50 });
    await page.waitForTimeout(1_500);
    await input.press('Enter');
    await page.getByText(new RegExp(`results? for “${words}”`, 'i')).first().waitFor({ timeout: 180_000 });
    await page
        .waitForFunction(() => !/read by the server/.test(document.body.innerText), null, { timeout: 420_000 })
        .catch(() => {});
    await page.waitForTimeout(2_000);
}

/** Scrolls every scrolled box in the Search tab back to its top. */
async function listToTop(page) {
    await page.evaluate(() => {
        for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0 && el.closest('#maps-data-panel')) el.scrollTop = 0;
    });
    await page.waitForTimeout(800);
}

/** A row hovered while the list changed under it can leave its pin and chip on the map: hover a quiet
 *  spot in the panel and leave it, then park the pointer. */
async function clearHover(page, x = 1000, y = 70) {
    await page.mouse.move(x, y);
    await page.waitForTimeout(400);
    await parkPointer(page);
}

/** Marks `rect` with an empty element the annotations can point at (nothing in the app has a box there). */
async function markRect(page, id, rect) {
    await page.evaluate(
        ({ id, rect }) => {
            document.getElementById(id)?.remove();
            const el = document.createElement('div');
            el.id = id;
            el.style.cssText = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;`;
            document.body.appendChild(el);
        },
        { id, rect },
    );
}

/** The tables' footer stamp, which opens Map data. */
const stamp = (page) => page.locator('button[title$="— open Map data"]').first();
const dialog = (page) => page.getByRole('dialog').first();

/** Opens Map data once the tables have a row, and waits until nothing in it is downloading. */
async function openMapData(page) {
    await stamp(page).click();
    await dialog(page).waitFor({ timeout: 30_000 });
    await page
        .waitForFunction(() => !/Downloading/.test(document.querySelector('[role="dialog"]')?.textContent ?? ''), null, { timeout: 420_000 })
        .catch(() => {});
    await page.waitForTimeout(2_000);
}

/** The dialog, centred over the page. */
const DIALOG_CLIP = { x: 480, y: 25, width: 480, height: 850 };

/** One table's row in Map data → Each table. */
const tableRow = (page, label) =>
    dialog(page).locator('div').filter({ has: page.getByText(label, { exact: true }) }).filter({ has: page.getByRole('button', { name: /^Repair / }) }).last();

/** The Map data stamp and the tables' copies settled: the footer has stopped saving to this device. */
async function copiesLanded(page) {
    await page
        .waitForFunction(() => !/Saving a copy to this device|rows appear when it lands/.test(document.body.innerText), null, { timeout: 420_000 })
        .catch(() => {});
    await rowsSteady(page);
}

export default [
    // ─── Search (maps/search.mdx) ─────────────────────────────────────────────────
    {
        name: 'maps-search',
        alt: 'The search panel for Pioneer: the Search row and Search on screen, then the Leases, Wells, Fields and Operators groups with their counts, each row with its rate and how far it is from the view',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            // The panel opens on a click in the field (focus alone never opens it).
            await field(page).click();
            await field(page).pressSequentially('Pioneer', { delay: 40 });
            await panelRows(page, 'Leases').first().waitFor({ timeout: 120_000 });
            await panelRows(page, 'Wells').first().waitFor({ timeout: 300_000 });
            // Not while the Wells group still says it is downloading.
            await page
                .waitForFunction(() => !/Downloading the wells/.test(document.body.innerText), null, { timeout: 300_000 })
                .catch(() => {});
            await page.waitForTimeout(4_000);
            return { x: 0, y: 0, width: 900, height: VIEWPORT.height };
        },
    },
    {
        name: 'find-a-record',
        auth: true,
        path: `/maps?${WISE_KIKER}`,
        steps: [
            {
                name: 'find-a-record-1',
                alt: 'The search panel open with nothing typed: Recent searches, Recently opened, Ask about this view and the Narrow as you type terms',
                run: async (page) => {
                    await mapSettled(page);
                    // Recent searches are kept in this browser, per user: two past searches.
                    await page.evaluate(() => {
                        const id = window.Clerk?.user?.id;
                        if (!id) return;
                        const now = Date.now();
                        localStorage.setItem(
                            `search_history_${id}`,
                            JSON.stringify([
                                { id: 'help-1', query: 'pioneer', timestamp: now - 26 * 60_000 },
                                { id: 'help-2', query: 'chisholm', timestamp: now - 3 * 3_600_000 },
                            ]),
                        );
                    });
                    // A record opened for a moment, so Recently opened has one: the operator here.
                    await field(page).click();
                    await field(page).pressSequentially('bkv', { delay: 50 });
                    await panelRows(page, 'Operators').first().waitFor({ timeout: 120_000 });
                    await panelRows(page, 'Operators').first().click();
                    await page.locator(H.card).first().waitFor({ timeout: 60_000 });
                    await page.waitForTimeout(3_000);
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(1_500);
                    const draft = page.getByRole('button', { name: 'Clear what you typed' });
                    if (await draft.isVisible().catch(() => false)) await draft.click();
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(800);
                    await field(page).click();
                    await page.locator('[role="group"][aria-label="Recently opened"]').waitFor({ timeout: 30_000 });
                    await page.waitForTimeout(2_000);
                },
                annotate: [{ at: H.search, n: 1 }],
            },
            {
                name: 'find-a-record-2',
                alt: 'The search panel for kiker over Wise County: the lit Search “kiker” in Texas row, Search “kiker” on screen, then the Leases and Wells groups, every row on screen',
                run: async (page) => {
                    await field(page).pressSequentially('kiker', { delay: 60 });
                    await panelRows(page, 'Leases').first().waitFor({ timeout: 120_000 });
                    await panelRows(page, 'Wells').first().waitFor({ timeout: 300_000 });
                    await page.waitForTimeout(5_000);
                },
                annotate: [{ at: '[role="group"][aria-label="Leases"]', n: 2, kind: 'box' }],
            },
            {
                name: 'find-a-record-3',
                alt: 'The pointer on the first KIKER lease in the panel, and that lease lit in amber with a pin on the map',
                run: async (page) => {
                    await panelRows(page, 'Leases').first().hover();
                    await page.locator('.mapboxgl-marker[class*="__waypoint"]').first().waitFor({ timeout: 30_000 });
                    await page.waitForTimeout(2_500);
                },
                annotate: [
                    { at: (page) => panelRows(page, 'Leases').first().locator('xpath=..'), n: 3 },
                    { at: '.mapboxgl-marker[class*="__waypoint"]', pad: 10 },
                ],
            },
            {
                name: 'find-a-record-4',
                alt: 'The lease’s card open on the right of the map after clicking its row: KIKER-PERKINS, ET AL (SA), its verbs, Totals and Production',
                run: async (page) => {
                    await panelRows(page, 'Leases').first().click();
                    const card = page.locator(H.card).first();
                    await card.waitFor({ timeout: 60_000 });
                    await page.waitForFunction(() => !document.querySelector('[aria-label="Row detail"] [class*="keleton"]'), null, { timeout: 120_000 }).catch(() => {});
                    await page.waitForTimeout(5_000);
                    // The card's title: its largest line of text.
                    await card.evaluate((el) => {
                        let best = null;
                        for (const node of el.querySelectorAll('*')) {
                            if (node.children.length || !(node.textContent ?? '').trim()) continue;
                            const size = parseFloat(getComputedStyle(node).fontSize);
                            if (!best || size > best.size) best = { node, size };
                        }
                        best?.node.setAttribute('data-shot', 'card-title');
                    });
                    await greyEnterprise(page);
                    await parkPointer(page);
                },
                annotate: [{ at: '[data-shot="card-title"]', n: 4 }],
            },
        ],
    },
    {
        name: 'search-live-bar',
        alt: 'The search box after searching pioneer: the words, how many of the search’s wells are on screen, and the clear button, over a map with the matching wells in violet and the rest dimmed',
        auth: true,
        path: `/maps?${MIDLAND_EAST}`,
        run: async (page) => {
            await mapSettled(page);
            await runSearch(page, 'pioneer');
            // The map's own count arrives once its set is built.
            await page.getByRole('button', { name: 'Close the tables' }).click();
            await page.locator(`button[title^="The search's wells:"]`).first().waitFor({ timeout: 300_000 });
            await page.waitForTimeout(6_000);
            await parkPointer(page);
        },
        annotate: [
            { at: `button[title^="The search's wells:"]`, n: 1, side: 'bottom' },
            { at: 'button[title="Clear this search from the map"]', n: 2, side: 'right' },
        ],
    },

    // ─── Search results (maps/search-results.mdx) ─────────────────────────────────
    {
        name: 'maps-search-results',
        alt: 'The Search tab for Pioneer beside the map: the result count, Searching Statewide and the best match, the All, Leases, Wells, Fields and Operators tabs, Filters, Sort, Only these on map and Zoom to all, then the Leases and Wells sections',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await runSearch(page, 'pioneer');
            await widenPanel(page);
            await clearHover(page);
            await page.waitForTimeout(3_000);
        },
    },
    {
        name: 'search-results-drill',
        alt: 'The Search tab for chisholm, drilled into CHISHOLM OPERATING, INC.: the way back to “chisholm”, Open operator, and the operator’s leases, wells and fields',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await runSearch(page, 'chisholm');
            await widenPanel(page);
            // A click on an operator's row drills into it (its "Open operator" verb is its card).
            const row = page.locator('[role="button"]').filter({ hasText: /^CHISHOLM OPERATING, INC\./ }).first();
            await row.click({ position: { x: 80, y: 12 } });
            await page.locator('nav[aria-label="Where this is under the search"]').waitFor({ timeout: 60_000 });
            await page.waitForTimeout(6_000);
            await listToTop(page);
            await clearHover(page);
            await page.waitForTimeout(1_500);
            return { x: 620, y: 0, width: VIEWPORT.width - 620, height: VIEWPORT.height };
        },
        annotate: [
            { at: 'nav[aria-label="Where this is under the search"]', n: 1 },
            { at: (page) => page.getByRole('button', { name: /^Open operator/ }).first(), n: 2, side: 'left' },
        ],
    },
    {
        name: 'narrow-results',
        auth: true,
        path: `/maps?${MIDLAND_EAST}`,
        steps: [
            {
                name: 'narrow-results-1',
                alt: 'The Search tab for pioneer on its Leases tab: the leases named “pioneer”, then the ones not named for it, with how they matched',
                run: async (page) => {
                    await mapSettled(page);
                    await runSearch(page, 'pioneer');
                    await widenPanel(page);
                    await page.locator('[role="tablist"][aria-label="Result types"] [role="tab"]').filter({ hasText: /^Leases/ }).first().click();
                    await page.getByText(/^Named/).first().waitFor({ timeout: 120_000 });
                    await page.getByText(/^Not named/).first().waitFor({ timeout: 120_000 }).catch(() => {});
                    await page.waitForTimeout(3_000);
                    await clearHover(page);
                },
                annotate: [{ at: (page) => page.locator('[role="tablist"][aria-label="Result types"] [role="tab"]').filter({ hasText: /^Leases/ }).first(), n: 1 }],
            },
            {
                name: 'narrow-results-2',
                alt: 'The Search tab’s Filters over the Leases list, with Producing ticked under Status and the count updated',
                run: async (page) => {
                    await page.getByRole('toolbar', { name: 'Filter and sort the results' }).getByRole('button', { name: /^Filters/ }).click();
                    const producing = page.locator('[role="checkbox"]:visible').filter({ hasText: /^Producing/ }).first();
                    await producing.waitFor({ timeout: 120_000 });
                    await producing.click();
                    await page.waitForTimeout(4_000);
                    await parkPointer(page);
                },
                annotate: [{ at: (page) => page.locator('[role="checkbox"]:visible').filter({ hasText: /^Producing/ }).first(), n: 2 }],
            },
            {
                name: 'narrow-results-3',
                alt: 'A dashed violet outline drawn on the map, the results narrowed to the area you drew, and the Producing and Drawn area chips under the Search tab’s buttons',
                run: async (page) => {
                    await page.locator('[role="radio"]:visible').filter({ hasText: 'An area you draw on the map' }).first().click();
                    await page.waitForTimeout(1_000);
                    const corners = [[150, 170], [520, 150], [540, 720], [170, 760]];
                    for (const [x, y] of corners.slice(0, 3)) {
                        await page.mouse.click(x, y);
                        await page.waitForTimeout(400);
                    }
                    await page.mouse.dblclick(...corners[3]);
                    await page.getByText('the area you drew').first().waitFor({ timeout: 60_000 });
                    await page.waitForTimeout(3_000);
                    // Back to the list, so the chips under the buttons show.
                    await page.getByRole('button', { name: /^Show [\d,]+ leases?$/ }).click();
                    await page.waitForTimeout(3_000);
                    await markRect(page, 'shot-drawn-corner', { x: corners[0][0], y: corners[0][1], width: 1, height: 1 });
                    await parkPointer(page);
                },
                annotate: [
                    { at: '#shot-drawn-corner', n: 3, kind: 'badge' },
                    { at: (page) => page.locator('[aria-label="What the search is narrowed to"]').getByText('Drawn area', { exact: true }).first(), pad: 6 },
                ],
            },
            {
                name: 'narrow-results-4',
                alt: 'The Sort menu over the narrowed Leases list: Best match, Daily boe chosen, Cumulative boe, Distance from map center and Name, with High to low and Low to high',
                run: async (page) => {
                    await page.getByRole('button', { name: /^Sort:/ }).click();
                    await page.locator('[role="menuitemradio"]').filter({ hasText: 'Daily BOE' }).first().click();
                    await page.waitForTimeout(2_500);
                    // Open again, to show the choice and its direction.
                    await page.getByRole('button', { name: /^Sort:/ }).click();
                    await page.waitForTimeout(1_500);
                    await parkPointer(page);
                },
                annotate: [{ at: (page) => page.locator('[role="menuitemradio"]').filter({ hasText: 'Daily BOE' }).first(), n: 4, side: 'left' }],
            },
            {
                name: 'narrow-results-5',
                alt: 'Only these on map lit in the Search tab’s toolbar, and the map framed on the search’s wells inside the drawn area, every other well hidden',
                run: async (page) => {
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(1_500);
                    await page.getByRole('button', { name: 'Only these on map' }).click();
                    await page.waitForTimeout(2_000);
                    await page.getByRole('button', { name: 'Zoom to all' }).click();
                    await page.waitForTimeout(9_000);
                    await parkPointer(page);
                },
                annotate: [{ at: (page) => page.getByRole('button', { name: 'Only these on map' }), n: 5 }],
            },
        ],
    },

    // ─── Data tables (maps/data-panel.mdx) ────────────────────────────────────────
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
        alt: 'The tables filling the window: tabs with their counts and symbols, the filter box, and the toolbar with its labels',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page, { wide: false });
            await wellsInViewByCumOil(page);
            await page.getByRole('button', { name: 'Full screen' }).click();
            // The pointer is left over the top row's buttons, and their tooltip covers Columns.
            await page.mouse.move(720, 620);
            await rowsSteady(page);
            return { x: 72, y: 0, width: VIEWPORT.width - 72, height: 330 };
        },
    },
    {
        name: 'record-tab',
        alt: 'A field’s Record tab after Show wells on its card: the band with Field, BENEDUM (SPRABERRY) and its RRC number, the note that your own tabs are untouched, On the map with Table + map, and Close, over the field’s wells',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await field(page).click();
            await field(page).pressSequentially('benedum', { delay: 50 });
            await panelRows(page, 'Fields').first().waitFor({ timeout: 120_000 });
            await panelRows(page, 'Fields').filter({ hasText: 'BENEDUM (SPRABERRY)' }).first().click();
            const card = page.locator(H.card).first();
            await card.waitFor({ timeout: 60_000 });
            await page.waitForTimeout(3_000);
            await card.getByRole('button', { name: 'Show wells' }).first().click();
            await page.getByText(/All of its wells/).first().waitFor({ timeout: 60_000 });
            // The card stays open; the picture is of the tab, so close the card and give the tables the
            // window (narrower, the band's choice reads "Both | Table").
            await page.keyboard.press('Escape');
            await page.waitForTimeout(1_000);
            if (await card.isVisible().catch(() => false)) await card.getByRole('button', { name: /^Close/ }).first().click().catch(() => {});
            await page.getByRole('button', { name: 'Full screen' }).click();
            await rowsSteady(page);
            await page.waitForTimeout(2_000);
            // The band's own title (the tab strip names the record too).
            await page.evaluate(() => {
                const note = [...document.querySelectorAll('p')].find((p) => /^All of its wells/.test(p.textContent ?? ''));
                const band = note?.parentElement;
                const title = band && [...band.querySelectorAll('span')].find((el) => (el.textContent ?? '').trim() === 'BENEDUM (SPRABERRY)');
                title?.setAttribute('data-shot', 'band-title');
            });
            await page.mouse.move(720, 700);
            await parkPointer(page);
            return { x: 72, y: 0, width: VIEWPORT.width - 72, height: 440 };
        },
        annotate: [
            { at: '[data-shot="band-title"]', n: 1 },
            { at: '[role="radio"][data-label="Table + map"]', n: 2, side: 'top' },
            { at: 'button[title^="Close this tab"]', n: 3 },
        ],
    },
    {
        name: 'table-hover-chip',
        alt: 'The pointer on SACROC UNIT in the Leases table, with Scope on All, and the chip at the edge of the map pointing to the lease: an arrow, its name and how far away it is',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page, { wide: false });
            await pickTab(page, 'Leases');
            // All, so the rows include leases off the map.
            await page.getByRole('radiogroup', { name: 'Scope', exact: true }).getByRole('radio', { name: 'All' }).click();
            await rowsSteady(page);
            await page.waitForTimeout(2_000);
            const rect = await page.evaluate((find) => {
                const el = new Function(`return (${find})`)()();
                if (!el) return null;
                el.setAttribute('data-shot', 'hovered-row');
                const r = el.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width, height: r.height };
            }, findFirstRow.toString());
            if (!rect) throw new Error('no table row to hover');
            await page.mouse.move(rect.x + 160, rect.y + rect.height / 2);
            await page.locator('button[class*="waypoint"]').filter({ hasText: /\d+ mi/ }).first().waitFor({ timeout: 30_000 });
            await page.waitForTimeout(2_500);
        },
        annotate: [
            { at: '[data-shot="hovered-row"]', n: 1, side: 'left', pad: 2 },
            { at: (page) => page.locator('button[class*="waypoint"]').filter({ hasText: /\d+ mi/ }).first(), n: 2, side: 'bottom' },
        ],
    },
    {
        name: 'data-filters',
        alt: 'The Filters popover on the Wells tab: the Saved line, a blank filter row, and quick filter pills with their counts',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await wellsInViewByCumOil(page);
            await (await tableFilters(page)).click();
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
            // From the tables' seam: further left, the clip cuts through the map's control labels.
            return { x: 596, y: 0, width: VIEWPORT.width - 596, height: Math.ceil(bottom) + 90 };
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
            await openAnalyze(page);
            await page.getByRole('button', { name: 'Lateral × cum oil' }).click();
            await page.waitForTimeout(6_000);
            await parkPointer(page);
        },
    },

    // ─── Map data (maps/offline.mdx) ──────────────────────────────────────────────
    {
        name: 'map-data-dialog',
        alt: 'The Map data dialog: one sentence saying how much map data is on this device, Download all and Clear all map data, and Each table open on a row per table with its size and chip',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page, { wide: false });
            await copiesLanded(page);
            await openMapData(page);
            await dialog(page).getByText('Each table', { exact: true }).click();
            await page.waitForTimeout(1_500);
            await parkPointer(page);
            return DIALOG_CLIP;
        },
        annotate: [
            { at: '[role="dialog"] p[role="status"]', n: 1 },
            { at: (page) => dialog(page).getByRole('button', { name: /^(Download all|Update all|Try again)$/ }), n: 2, side: 'left' },
            { at: (page) => dialog(page).getByText('Each table', { exact: true }), n: 3, side: 'left' },
        ],
    },
    {
        // Map data's own switch (2026-10-17). Turned off, it asks first — in a dialog that takes Map
        // data's place, so the two cannot share a picture: the question is the page's words.
        name: 'map-data-server-switch',
        alt: 'Map data with Where answers come from open: the Keep map data on this device switch and the line under it',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page, { wide: false });
            await rowsSteady(page);
            await openMapData(page);
            await dialog(page).getByText('Where answers come from', { exact: true }).click();
            await dialog(page).getByText('Keep map data on this device', { exact: true }).scrollIntoViewIfNeeded();
            await page.waitForTimeout(1_000);
            await parkPointer(page);
            return DIALOG_CLIP;
        },
        annotate: (page) => [
            { at: () => page.getByText('Where answers come from', { exact: true }).first(), n: 1, side: 'left' },
            { at: () => page.getByText('Keep map data on this device', { exact: true }).first(), n: 2, side: 'left' },
        ],
    },
    {
        name: 'map-data',
        auth: true,
        path: `/maps?${MIDLAND}`,
        steps: [
            {
                name: 'map-data-1',
                alt: 'The foot of the Wells table: which rows are showing, and at its right end the date stamp that opens Map data',
                run: async (page) => {
                    await mapSettled(page);
                    await openTables(page, { wide: false });
                    await copiesLanded(page);
                    await page.waitForTimeout(2_000);
                    await parkPointer(page);
                    return { x: 893, y: 600, width: VIEWPORT.width - 893, height: VIEWPORT.height - 600 };
                },
                annotate: [{ at: 'button[title$="— open Map data"]', n: 1, side: 'left' }],
            },
            {
                name: 'map-data-2',
                alt: 'Map data saying some of its tables are not downloaded yet, with Download all ready to click',
                run: async (page) => {
                    await openMapData(page);
                    // Clear one table this page isn't showing, in this test browser only, so its copy is missing.
                    await dialog(page).getByText('Each table', { exact: true }).click();
                    await page.waitForTimeout(1_000);
                    const rigs = tableRow(page, 'Rigs');
                    await rigs.getByRole('button', { name: 'Remove rigs from this device' }).click();
                    await page.getByText(/tables? (is|are) not downloaded yet/).first().waitFor({ timeout: 60_000 });
                    // Fold the list again: this step is the sentence and its two buttons.
                    await dialog(page).getByText('Each table', { exact: true }).click();
                    await page.waitForTimeout(1_500);
                    await parkPointer(page);
                    return { x: 480, y: 25, width: 480, height: 230 };
                },
                annotate: [{ at: (page) => dialog(page).getByRole('button', { name: 'Download all' }), n: 2, side: 'left' }],
            },
            {
                name: 'map-data-4',
                alt: 'Map data → Each table, each table’s row with its size and chip, and its Repair and Remove',
                run: async (page) => {
                    // Every row carries its Repair and Remove now; there is nothing to open.
                    await dialog(page).getByText('Each table', { exact: true }).click();
                    await page.waitForTimeout(1_200);
                    // Back to the top of the dialog: the Wells row is the first, under the sentence.
                    await page.evaluate(() => {
                        for (const el of document.querySelectorAll('[role="dialog"], [role="dialog"] *')) if (el.scrollTop > 0) el.scrollTop = 0;
                    });
                    await page.waitForTimeout(600);
                    await parkPointer(page);
                    return DIALOG_CLIP;
                },
                annotate: [{ at: (page) => dialog(page).getByRole('button', { name: 'Repair wells' }), n: 4, side: 'left' }],
            },
        ],
    },
    {
        name: 'map-data-3',
        alt: 'Map data → Each table with the Fields row’s download given up: its chip, why it gave up, and Download now, Repair and Remove',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            // In this test page only, the Fields file arrives with its last bytes changed: it downloads
            // whole and is refused, the failure Try again is for. Nothing outside the page is touched.
            await page.route(/fields_snapshot\/.*\/fields\.parquet/, async (route) => {
                const response = await route.fetch();
                const body = Buffer.from(await response.body());
                const range = /bytes (\d+)-(\d+)\/(\d+)/.exec(response.headers()['content-range'] ?? '');
                if ((!range || Number(range[2]) === Number(range[3]) - 1) && body.length >= 4) body.write('XXXX', body.length - 4, 'latin1');
                await route.fulfill({ response, body });
            });
            await page.reload({ waitUntil: 'domcontentloaded' });
            await mapSettled(page);
            await openTables(page, { wide: false });
            await copiesLanded(page);
            await openMapData(page);
            await dialog(page).getByText('Each table', { exact: true }).click();
            const fields = tableRow(page, 'Fields');
            // The server answers meanwhile, so the row's button reads Download now (Try again elsewhere).
            await fields.getByRole('button', { name: /^(Try again|Download now)$/ }).waitFor({ timeout: 300_000 });
            await fields.scrollIntoViewIfNeeded();
            await page.waitForTimeout(1_500);
            await parkPointer(page);
            return DIALOG_CLIP;
        },
        annotate: [{ at: (page) => tableRow(page, 'Fields').getByRole('button', { name: /^(Try again|Download now)$/ }), n: 3, side: 'left' }],
    },
    {
        name: 'map-data-5',
        alt: 'Map data saying the browser stopped this site at 120 MB, so tables are kept for this visit only, with what to do about it, and the rows of the tables it held back',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            // The ceiling the app learns when the browser refuses this site more room, set in this
            // test browser only (120 MB, learned now), so the next downloads meet it.
            await page.evaluate(() => localStorage.setItem('strawn.storage.ceiling', JSON.stringify({ bytes: 120 * 1024 * 1024, at: Date.now() })));
            await page.reload({ waitUntil: 'domcontentloaded' });
            await mapSettled(page);
            await openTables(page, { wide: false });
            await stamp(page).click();
            await dialog(page).waitFor({ timeout: 30_000 });
            await page.getByText(/stopped this site at/).first().waitFor({ timeout: 300_000 });
            await page
                .waitForFunction(() => !/Downloading/.test(document.querySelector('[role="dialog"]')?.textContent ?? ''), null, { timeout: 300_000 })
                .catch(() => {});
            await dialog(page).getByText('Each table', { exact: true }).click();
            await page.waitForTimeout(1_500);
            // One box around the warning and what to do about it.
            const both = await page.evaluate(() => {
                const status = document.querySelector('[role="dialog"] p[role="status"]');
                const guide = status?.nextElementSibling;
                if (!status || !guide) return null;
                const a = status.getBoundingClientRect();
                const b = guide.getBoundingClientRect();
                return { x: Math.min(a.x, b.x), y: a.y, width: Math.max(a.right, b.right) - Math.min(a.x, b.x), height: b.bottom - a.y };
            });
            if (both) await markRect(page, 'shot-capped', both);
            await parkPointer(page);
            return DIALOG_CLIP;
        },
        annotate: [{ at: '#shot-capped', n: 5, kind: 'box' }],
    },
];
