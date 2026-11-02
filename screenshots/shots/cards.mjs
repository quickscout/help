// Record cards, row cards, operators and fields, compare, plats and exports.
// See the field list at the top of shots.mjs.

import {
    box,
    cardSettled,
    clickFirstRow,
    copiesSaved,
    fillWindow,
    greyEnterprise,
    H,
    hideOwnData,
    hoverRow,
    JONES,
    mapSettled,
    maskPhones,
    MIDLAND,
    openTables,
    parkPointer,
    pickTab,
    ready,
    rowsSteady,
    SAMPLE_API,
    SAMPLE_OPERATOR,
    tablesOnly,
    VIEWPORT,
    wellsInViewByCumOil,
    widenPanel,
    withMap,
} from '../lib.mjs';

// ─── local helpers ───────────────────────────────────────────────────────────

const card = (page) => page.locator(H.card).first();

/** The record card up, and its own skeletons gone (a block that reads a while keeps one; give it time). */
async function cardReady(page, ms = 4_000) {
    await card(page).waitFor({ timeout: 120_000 });
    await page.waitForFunction(() => !document.querySelector('[aria-label="Row detail"] [class*="keleton"]'), null, { timeout: 150_000 }).catch(() => {});
    await page.waitForTimeout(ms);
}

/** Producing horizontal wells drawn inside `rect` (page px), at their surface holes, one per lease and
 *  none on the leases in `skip`: a comparison of wells off different leases, each with production. */
async function wellsIn(page, rect, skip = []) {
    return withMap(page, (map, { b, skip }) => {
        const r = map.getContainer().getBoundingClientRect();
        const fs = map.queryRenderedFeatures([[b.x - r.left, b.y - r.top], [b.x + b.width - r.left, b.y + b.height - r.top]]);
        const out = [];
        const leases = new Set(skip);
        for (const f of fs) {
            const p = f.properties ?? {};
            if (!p.api || f.geometry.type !== 'Point' || p.status !== 'PRODUCING' || !(Number(p.lateral_length) > 5000)) continue;
            const lease = `${p.district_name}/${p.lease_no}`;
            if (leases.has(lease)) continue;
            leases.add(lease);
            const pt = map.project(f.geometry.coordinates);
            out.push({ api: String(p.api), lease, x: r.left + pt.x, y: r.top + pt.y });
        }
        return out;
    }, { b: rect, skip });
}

/** Hovers wells in turn until a popup comes up for a producing oil well, with its Compare; returns that
 *  well, or null. On a pad several wells share a spot, and the popup is the top one's. */
async function popupWithCompare(page, wells) {
    for (const w of wells.slice(0, 12)) {
        // A click opens the popup (the default since 2026-10-16); Esc closes it before the next well.
        await page.mouse.move(w.x, w.y);
        await page.mouse.click(w.x, w.y);
        await page.waitForTimeout(2_500);
        if (!(await page.locator(H.popupCompare).first().isVisible().catch(() => false))) continue;
        const text = await page.locator('.qs-wp').first().innerText().catch(() => '');
        // The popup's lease band reads To date · Per day now · 12 months (no boe/d since 2026-10-21).
        if (/Oil well/i.test(text) && /Per day now/i.test(text) && !/No production in 12 months/.test(text)) return w;
        await page.keyboard.press('Escape');
        await parkPointer(page);
        await page.waitForTimeout(600);
    }
    return null;
}

/** The hovered well's card, from its popup's View well, and the well into the tray from the card. */
async function addFromCard(page) {
    await page.locator(H.popupViewWell).first().click();
    await cardReady(page, 1_500);
    await card(page).getByRole('button', { name: 'Compare', exact: true }).click();
    await card(page).locator('button[aria-label="Compare"][aria-pressed="true"]').waitFor({ timeout: 30_000 });
    await parkPointer(page);
    await page.waitForTimeout(800);
}

/** The tables' pane dragged wide once it has finished opening: the handle out to x = 560, which the
 *  pane's own limit (60% of the window) stops at about x = 620. */
async function widePanel(page) {
    await page.waitForTimeout(2_000);
    for (let i = 0; i < 2; i++) {
        const p = await page.locator('#maps-data-panel').boundingBox();
        if (p && p.x < 640) return;
        await widenPanel(page);
    }
}

/** The facts grid back at its first column (a Baseline click scrolls to the column it is in). */
async function gridToStart(page) {
    await page.evaluate(() => {
        const grid = document.querySelector('[role="table"][aria-label="Facts, one column per record"]');
        if (grid) grid.scrollLeft = 0;
    });
    await page.waitForTimeout(500);
}

/** The card on the right, top to bottom. */
const CARD_CLIP = { x: 930, y: 0, width: VIEWPORT.width - 930, height: VIEWPORT.height };

// The sample well, MABEE C NORTH #H 18MS (42-317-40219), stands at about -102.1747, 32.3027. This box
// puts it left of the middle of the map that a card on the right leaves open.
const SAMPLE_VIEW = box(-102.2317, 32.2498, -102.0417, 32.3556);
// Its lease, MABEE C NORTH (08-48137), by the keys a /maps link opens a lease's card with.
const SAMPLE_LEASE = 'lease_no=48137&district_name=08&state_id=42';
// HILL 30-19 F #163 (42-329-44958): permitted in 2021 and completed since, so its documents run from
// the W-1 and its plat to the completion packet and the surveys.
const DOCS_WELL = { api: '4232944958', view: box(-102.1739, 31.8498, -101.9839, 31.9556) };
// THREE PENNY F #10HB and G #14JM (42-317-47440 / 47441), permits of 2026-09-02: one W-1 plat each,
// placed. The box leaves the sheet whole, left of the card.
const PLAT_WELLS = { first: '4231747440', second: '4231747441', view: box(-102.025, 32.0488, -101.785, 32.1826) };

// The window the facts grid is pictured in, filled by the Compare tab: three columns, each wide enough
// for its head's buttons.
const FACTS_WIDTH = 1040;

const field = (page) => page.getByRole('combobox', { name: 'Search the map' });

/** Waits until a card's button reads one of `labels` (a plat being placed takes a few seconds). */
async function cardButton(page, labels, timeout = 120_000) {
    await page.waitForFunction(
        (labels) => [...document.querySelectorAll('[aria-label="Row detail"] button')].some((b) => labels.includes(b.textContent.trim())),
        labels,
        { timeout },
    );
}

/** The tables' pane from its left edge to the window's right, `height` tall. */
async function panelClip(page, height) {
    const p = await page.locator('#maps-data-panel').boundingBox();
    const x = Math.max(0, Math.floor(p?.x ?? 560));
    return { x, y: 0, width: VIEWPORT.width - x, height };
}

export default [
    // ─── Record cards (maps/records.mdx) ─────────────────────────────────────────
    {
        name: 'well-card',
        alt: 'The sample well’s card on the right of the map: its kind and status, its name, operator and field, the API with its Copy icon, county and district, the Highlight switch, the buttons Zoom to, Add plat, Watch, Compare, Edit and Report, then its Header block; the well marked in amber on the map with its name',
        auth: true,
        path: `/maps?${SAMPLE_VIEW}&api=${SAMPLE_API}`,
        run: async (page) => {
            await ready(page);
            await cardReady(page, 6_000);
            await greyEnterprise(page);
            await page.evaluate(() => {
                const root = document.querySelector('[aria-label="Row detail"]');
                let el = root && [...root.querySelectorAll('button, a')].find((b) => (b.textContent ?? '').trim() === 'Zoom to');
                while (el && el !== root && !/Report/.test(el.textContent ?? '')) el = el.parentElement;
                el?.setAttribute('data-shot', 'well-tiles');
            });
            await parkPointer(page);
        },
        annotate: [
            { at: '[data-shot="well-tiles"]', n: 1, side: 'left' },
            { at: '[class*="focused-well-module"][class*="__core"]', n: 2, pad: 14, side: 'bottom' },
        ],
    },
    {
        name: 'card-side-setting',
        alt: 'The Settings card open from the right side of the map, with its Record cards section: Right, beside the tables, and Left, where the drawer was',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await ready(page);
            await page.locator(H.settings).click();
            await page.locator('[role="radiogroup"][aria-label="Where record cards open"]').waitFor({ timeout: 30_000 });
            await page.waitForTimeout(1_000);
            await parkPointer(page);
            return { x: 860, y: 0, width: VIEWPORT.width - 860, height: 360 };
        },
        annotate: [{ at: (page) => page.locator('[role="radio"]').filter({ hasText: 'Where the drawer was' }), n: 1, side: 'bottom' }],
    },
    {
        name: 'card-back-link',
        alt: 'The lease card MABEE C NORTH, opened from the sample well’s card by the lease’s name: the link back to the well sits above the lease’s name',
        auth: true,
        path: `/maps?${SAMPLE_VIEW}&api=${SAMPLE_API}`,
        run: async (page) => {
            await ready(page);
            await cardReady(page);
            await card(page).locator('button[title^="Open the "][title$=" lease card"]').first().click();
            await card(page).locator('button[title^="Back to "]').waitFor({ timeout: 60_000 });
            await cardReady(page, 5_000);
            await greyEnterprise(page);
            await parkPointer(page);
            return { x: 930, y: 0, width: VIEWPORT.width - 930, height: 440 };
        },
        annotate: [{ at: '[aria-label="Row detail"] button[title^="Back to "]', n: 1, side: 'left' }],
    },
    {
        name: 'lease-card',
        alt: 'The lease card for MABEE C NORTH on the right of the map: its operator, field, lease number with its Copy icon and county, then Zoom to, Watch, Deal draft and Compare, the Totals and Production blocks, and Layout and Blocks at its foot; the lease’s wells lit on the map',
        auth: true,
        path: `/maps?${SAMPLE_VIEW}&${SAMPLE_LEASE}`,
        run: async (page) => {
            await ready(page);
            await cardReady(page, 6_000);
            await greyEnterprise(page);
            await parkPointer(page);
        },
        annotate: [
            { at: (page) => card(page).getByRole('button', { name: 'Zoom to', exact: true }).locator('xpath=..'), n: 1, side: 'left' },
            // The Layout and Blocks menus, one badge for the pair.
            { at: '[aria-label="Row detail"] button[aria-label^="Layout · "]' },
            { at: '[aria-label="Row detail"] [aria-label="Blocks on this card"]', n: 2, side: 'right' },
        ],
    },

    // ─── Row cards (maps/row-cards.mdx) ──────────────────────────────────────────
    {
        name: 'row-card',
        alt: 'A permit’s card open beside the Wells table: its verbs, the Layout and Blocks menus, and the blocks of the Permit layout',
        auth: true,
        path: `/maps?${PLAT_WELLS.view}`,
        run: async (page) => {
            await ready(page);
            await openTables(page);
            // Permits of September 2026, found by name in the tab's own search.
            await page.locator('[data-strip-search] input').fill('THREE PENNY F');
            await page.waitForTimeout(2_000);
            await rowsSteady(page);
            await clickFirstRow(page);
            await cardReady(page, 6_000);
            await greyEnterprise(page);
            await parkPointer(page);
            // The card and the table; the sliver of map left of the card says nothing here.
            return { x: 122, y: 0, width: VIEWPORT.width - 122, height: VIEWPORT.height };
        },
    },
    {
        name: 'lease-workbench-by-well',
        alt: 'The MABEE C NORTH lease’s Production block expanded on By well: Oil, Calendar and the Estimate tag over a line for each well, and the Wells list beside it with Since, To date and Of lease',
        auth: true,
        path: `/maps?${SAMPLE_VIEW}&${SAMPLE_LEASE}`,
        run: async (page) => {
            await ready(page);
            await cardReady(page);
            await page.getByRole('button', { name: 'Expand Production', exact: true }).click();
            await page.getByRole('radio', { name: 'By well' }).waitFor({ timeout: 30_000 });
            await page.waitForTimeout(3_000);
            await page.getByRole('radio', { name: 'By well' }).click();
            await page.waitForFunction(() => !document.querySelector('[aria-label="Splitting the lease’s production across its wells"]'), null, { timeout: 120_000 });
            await page.locator('[aria-label$=" in the chart"]').first().waitFor({ timeout: 60_000 });
            await page.waitForTimeout(4_000);
            await parkPointer(page);
        },
        annotate: [
            { at: (page) => page.getByRole('radio', { name: 'By well' }), n: 1, side: 'bottom' },
            { at: '.mantine-Modal-content [class*="estPill"]', n: 2, side: 'right' },
            { at: '[aria-label$=" in the chart"]', n: 3, pad: 6, side: 'left' },
        ],
    },

    // ─── Exports (maps/exports.mdx) ──────────────────────────────────────────────
    {
        name: 'export-a-lease',
        auth: true,
        path: `/maps?${SAMPLE_VIEW}`,
        steps: [
            {
                name: 'export-a-lease-1',
                alt: 'The search panel with “mabee c north” typed: the MABEE C NORTH lease lit at the top of the Leases group',
                run: async (page) => {
                    await ready(page);
                    await field(page).click();
                    await field(page).pressSequentially('mabee c north', { delay: 50 });
                    const row = page.locator('[role="group"][aria-label="Leases"] [role="option"]').filter({ hasText: /^MABEE C NORTH/ }).first();
                    await row.waitFor({ timeout: 120_000 });
                    await page.waitForTimeout(3_000);
                    await row.hover();
                    await page.waitForTimeout(2_500);
                },
                annotate: [{ at: (page) => page.locator('[role="group"][aria-label="Leases"] [role="option"]').filter({ hasText: /^MABEE C NORTH/ }).first().locator('xpath=..'), n: 1, side: 'right' }],
            },
            {
                name: 'export-a-lease-2',
                alt: 'The MABEE C NORTH lease card scrolled to its Lease record block, with Export at its foot: Production and Wells',
                run: async (page) => {
                    await page.locator('[role="group"][aria-label="Leases"] [role="option"]').filter({ hasText: /^MABEE C NORTH/ }).first().click();
                    await cardReady(page);
                    await card(page).locator('[data-block="record"]').scrollIntoViewIfNeeded();
                    await page.waitForTimeout(1_500);
                    await greyEnterprise(page);
                    await parkPointer(page);
                },
                annotate: [{ at: '[aria-label="Row detail"] button[aria-label="Export production"]', n: 2, side: 'top' }],
            },
            {
                name: 'export-a-lease-3',
                alt: 'The lease card’s Production export menu: the production window, then Production CSV — a row per month and DRI v2.4 production (.dri)',
                run: async (page) => {
                    await card(page).locator('button[aria-label="Export production"]').click();
                    await page.getByText('Production CSV — a row per month').first().waitFor({ timeout: 30_000 });
                    await page.waitForTimeout(1_500);
                    await parkPointer(page);
                },
                annotate: [{ at: (page) => page.locator('button').filter({ hasText: 'Production CSV — a row per month' }).first(), n: 3, side: 'left' }],
            },
            {
                name: 'export-a-lease-4',
                alt: 'The same menu once the file has downloaded: Production CSV written, with how many months it holds',
                run: async (page) => {
                    await page.locator('button').filter({ hasText: 'Production CSV — a row per month' }).first().click();
                    await page.getByText(/^Production CSV written/).first().waitFor({ timeout: 60_000 });
                    await page.waitForTimeout(1_000);
                    await parkPointer(page);
                },
                annotate: [{ at: (page) => page.getByText(/^Production CSV written/).first(), n: 4, side: 'left' }],
            },
        ],
    },
    {
        name: 'lease-export-wells',
        alt: 'A lease card’s Wells export menu, from its Lease record block: Wells CSV, GeoGraphix ASCII4, OpenWorks OWX and Copy API numbers',
        auth: true,
        path: `/maps?${SAMPLE_VIEW}&${SAMPLE_LEASE}`,
        run: async (page) => {
            await ready(page);
            await cardReady(page);
            await card(page).locator('[data-block="record"]').scrollIntoViewIfNeeded();
            await page.waitForTimeout(1_000);
            await card(page).locator('button[aria-label="Export wells"]').click();
            await page.getByText('Wells CSV — a row per bore').first().waitFor({ timeout: 30_000 });
            // The options are greyed out until the lease's wells have been read.
            await page.waitForFunction(() => !/Reading the lease's wells/.test(document.body.innerText), null, { timeout: 90_000 }).catch(() => {});
            await page.waitForTimeout(1_500);
            await parkPointer(page);
            return { x: 930, y: 300, width: VIEWPORT.width - 930, height: VIEWPORT.height - 300 };
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
            return panelClip(page, 420);
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
            await pickTab(page, 'Leases');
            await page.getByRole('button', { name: 'Export', exact: true }).click();
            await page.getByText('Production CSV — a row per lease-month').waitFor({ timeout: 30_000 });
            await page.mouse.move(720, 700);
            await page.waitForTimeout(1_500);
            return panelClip(page, 420);
        },
    },
    {
        name: 'data-selection',
        alt: 'Three leases ticked, and the bar under the rows: Export CSV, Export production, Compare production, Add to compare and Copy lease keys, with the Enterprise actions greyed out',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await pickTab(page, 'Leases');
            // The first three rows: a ticked row's box is relabelled, so the first unticked one is next.
            const tick = page.getByRole('button', { name: 'Select lease', exact: true });
            for (let i = 0; i < 3; i++) await tick.first().click();
            await page.getByText('3 selected').waitFor({ timeout: 30_000 });
            // Pictured the way the readers of these pages see it: the Enterprise actions greyed out.
            await greyEnterprise(page);
            await page.mouse.move(720, 700);
            await page.waitForTimeout(1_500);
            // The bar opens under the rows, above the footer (it used to sit above them): the whole pane.
            return panelClip(page, VIEWPORT.height);
        },
    },
    {
        // A block's own actions sit at its foot since 2026-10-16 (the ⋯ menu, and the county drawer's
        // chart gear, are gone).
        name: 'card-production-foot',
        alt: 'An operator’s card with its Production block in view: the chart with Monthly and Log chosen, Expand and Hide in the block’s header, and Export CSV and Save PNG at its foot',
        auth: true,
        path: `/maps?${MIDLAND}&operator_no=${SAMPLE_OPERATOR}`,
        run: async (page) => {
            await ready(page);
            await cardReady(page, 6_000);
            // The block's foot into view: the card scrolls, the map does not move.
            await card(page).getByRole('button', { name: 'Save PNG', exact: true }).first().scrollIntoViewIfNeeded();
            await page.waitForTimeout(1_000);
            await parkPointer(page);
            return CARD_CLIP;
        },
        annotate: (page) => [
            { at: () => card(page).getByRole('button', { name: 'Export CSV', exact: true }).first(), n: 1, side: 'left' },
            { at: () => card(page).getByRole('button', { name: 'Save PNG', exact: true }).first(), n: 2, side: 'right' },
        ],
    },
    {
        name: 'record-tab-export',
        alt: 'Diamondback E&P’s wells on the Record tab after Show wells on its card, with the Export menu open: Table CSV, GeoGraphix ASCII4, OpenWorks OWX and DRI',
        auth: true,
        path: `/maps?${MIDLAND}&operator_no=${SAMPLE_OPERATOR}`,
        run: async (page) => {
            await ready(page);
            await cardReady(page);
            await card(page).getByRole('button', { name: 'Show wells', exact: true }).click();
            await page.locator('[class*="record-module"][class*="__band"]').waitFor({ timeout: 60_000 });
            await rowsSteady(page);
            // The operator's card stays open beside the tab; put it away, and give the tab the room.
            await card(page).getByRole('button', { name: 'Close' }).first().click();
            await page.waitForTimeout(1_000);
            await widePanel(page);
            await rowsSteady(page);
            await page.locator(H.exportButton).click();
            await page.getByText('DRI v2.4 production (.dri)').first().waitFor({ timeout: 30_000 });
            await page.waitForTimeout(1_500);
            await parkPointer(page);
            return panelClip(page, 560);
        },
        annotate: [
            { at: '[class*="record-module"][class*="__what"]', n: 1, side: 'right' },
            { at: H.exportButton, n: 2, side: 'left' },
        ],
    },
    {
        name: 'well-card-documents',
        alt: 'A well’s card with its Filings & documents block added: All, Permit, Completion and Surveys with their counts, then each document’s form, name, date and size, and Add in the Map column on the plat’s row',
        auth: true,
        path: `/maps?${DOCS_WELL.view}&api=${DOCS_WELL.api}`,
        run: async (page) => {
            await ready(page);
            await cardReady(page);
            await card(page).getByRole('button', { name: 'Blocks on this card' }).click();
            await page.getByRole('checkbox', { name: 'Filings & documents', exact: true }).check();
            await page.keyboard.press('Escape');
            const section = card(page).locator('[data-block-frame="documents"]');
            await section.waitFor({ timeout: 30_000 });
            await section.locator('[class*="docChips"]').waitFor({ timeout: 60_000 });
            await section.scrollIntoViewIfNeeded();
            await page.waitForTimeout(4_000);
            await greyEnterprise(page);
            await parkPointer(page);
            return CARD_CLIP;
        },
        annotate: [
            { at: '[aria-label="Row detail"] [data-block-frame="documents"] [class*="docChips"]', n: 1, side: 'left' },
            { at: '[aria-label="Row detail"] [data-block-frame="documents"] a[class*="docLink"]', n: 2, side: 'left' },
        ],
    },

    // ─── Compare (maps/compare.mdx) ──────────────────────────────────────────────
    {
        name: 'compare-wells',
        auth: true,
        path: `/maps?${SAMPLE_VIEW}&api=${SAMPLE_API}`,
        steps: [
            {
                name: 'compare-wells-1',
                alt: 'The sample well’s card with Compare pressed, and the compare tray at the foot of the map holding that well',
                run: async (page) => {
                    await ready(page);
                    await cardReady(page);
                    await card(page).getByRole('button', { name: 'Compare', exact: true }).click();
                    await page.locator(H.tray).waitFor({ timeout: 30_000 });
                    await page.waitForTimeout(2_000);
                    await greyEnterprise(page);
                    await parkPointer(page);
                },
                annotate: [{ at: '[aria-label="Row detail"] button[aria-label="Compare"][aria-pressed="true"]', n: 1, side: 'right' }],
            },
            {
                name: 'compare-wells-2',
                alt: 'Another well’s popup on the map, with View well, Compare and More, and the compare tray below holding the first well',
                run: async (page) => {
                    // Put the card away: the popup then has the map to itself.
                    await card(page).getByRole('button', { name: 'Close' }).first().click();
                    await page.waitForTimeout(1_500);
                    // A producing horizontal off another lease than the sample well's.
                    const picked = await popupWithCompare(page, await wellsIn(page, { x: 200, y: 140, width: 380, height: 300 }, ['08/48137']));
                    if (!picked) throw new Error('no well popup with Compare came up');
                    await page.evaluate((lease) => { window.__qsComparedLeases = ['08/48137', lease]; }, picked.lease);
                },
                annotate: [{ at: H.popupCompare, n: 2, side: 'right' }],
            },
            {
                name: 'compare-wells-3',
                alt: 'The compare tray holding three wells, each with its name and a line about it, and the Compare 3 wells, Zoom to, Clear and Hide buttons',
                run: async (page) => {
                    // Each added from its card (View well, then Compare): a well added from its popup
                    // carries no location, so the Compare tab could place only the first.
                    await addFromCard(page);
                    // A third, off a third lease, from another part of the map.
                    const skip = await page.evaluate(() => window.__qsComparedLeases ?? ['08/48137']);
                    const third = await popupWithCompare(page, await wellsIn(page, { x: 520, y: 260, width: 400, height: 380 }, skip));
                    if (!third) throw new Error('no third well popup with Compare came up');
                    await addFromCard(page);
                    await card(page).getByRole('button', { name: 'Close' }).first().click();
                    await page.locator(H.tray).getByRole('button', { name: 'Compare 3 wells' }).waitFor({ timeout: 30_000 });
                    await parkPointer(page);
                    await page.waitForTimeout(1_500);
                    // The tray, and a strip of the map over it.
                    const t = await page.locator(H.tray).boundingBox();
                    const y = Math.max(0, Math.floor(t.y - 80));
                    return { x: Math.max(0, Math.floor(t.x - 16)), y, width: Math.min(VIEWPORT.width, Math.ceil(t.width + 32)), height: VIEWPORT.height - y };
                },
                annotate: [{ at: (page) => page.locator(H.tray).getByRole('button', { name: 'Compare 3 wells' }), n: 3, side: 'top' }],
            },
            {
                name: 'compare-wells-4',
                alt: 'The Compare tab for the three wells: the band, the Production controls and their cumulative oil overlaid, then the facts grid with a column for each well and its differences from the first',
                run: async (page) => {
                    await page.locator(H.tray).getByRole('button', { name: 'Compare 3 wells' }).click();
                    await page.getByRole('button', { name: 'Differences only' }).waitFor({ timeout: 60_000 });
                    await widePanel(page);
                    await page.locator('[class*="compareGrid"][class*="__delta"]').first().waitFor({ timeout: 120_000 });
                    await page.waitForFunction(() => !document.querySelector('#maps-data-panel [aria-label="reading"]'), null, { timeout: 120_000 }).catch(() => {});
                    await page.waitForTimeout(4_000);
                    await parkPointer(page);
                    // The footer's note on where the rows were read is left out of frame.
                    return panelClip(page, 870);
                },
                annotate: [{ at: '[class*="compareGrid"][class*="__delta"]', n: 4, side: 'bottom' }],
            },
            {
                name: 'compare-tab-facts',
                alt: 'The facts grid for three wells: each column with its number, View well, Baseline and Remove, one well chosen as the baseline, and under every other figure its difference from it, with ▲ where it is better',
                run: async (page) => {
                    // Fold the chart away, and give the tab the window, so the grid shows every column; a
                    // narrower window keeps the columns close enough to read.
                    await page.locator('#maps-data-panel button').filter({ hasText: /^Production/ }).first().click();
                    await page.getByRole('button', { name: 'Full screen' }).click();
                    await page.setViewportSize({ width: FACTS_WIDTH, height: VIEWPORT.height });
                    await page.waitForTimeout(2_500);
                    // Read the others against the smallest producer, so their differences carry a ▲.
                    const smallest = await page.evaluate(() => {
                        const label = [...document.querySelectorAll('[role="rowheader"]')].find((el) => el.textContent.trim() === 'Cum oil');
                        const values = [];
                        for (let el = label?.nextElementSibling; el && el.getAttribute('role') === 'cell'; el = el.nextElementSibling) {
                            values.push(Number((el.textContent.match(/[\d,]+/) ?? ['0'])[0].replace(/,/g, '')) || Infinity);
                        }
                        return values.indexOf(Math.min(...values));
                    });
                    await page.locator('[role="columnheader"]').nth(Math.max(0, smallest)).getByRole('button', { name: 'Baseline', exact: true }).click();
                    await page.waitForTimeout(1_200);
                    await gridToStart(page);
                    await parkPointer(page);
                    const x = Math.max(0, Math.floor((await page.locator('#maps-data-panel').boundingBox())?.x ?? 0));
                    return { x, y: 0, width: FACTS_WIDTH - x, height: 640 };
                },
                annotate: [
                    { at: '[role="columnheader"] button[aria-pressed="true"]', n: 1, side: 'bottom' },
                    { at: (page) => page.locator('[class*="compareGrid"][class*="__delta"]').filter({ hasText: '▲' }).first(), n: 2, side: 'left' },
                ],
            },
        ],
    },
    {
        name: 'compare-tray',
        alt: 'The compare tray holding wells and leases: the Wells 3 and Leases 2 chips, three wells with their names and fact lines, and Compare 3 wells, Zoom to, Clear and Hide',
        auth: true,
        path: `/maps?${SAMPLE_VIEW}&api=${SAMPLE_API}`,
        run: async (page) => {
            await ready(page);
            await cardReady(page);
            // Three wells, each from its card (a well ticked in the Wells table comes into the tray
            // without its cum oil and lateral), off three leases.
            await card(page).getByRole('button', { name: 'Compare', exact: true }).click();
            await page.locator(H.tray).waitFor({ timeout: 30_000 });
            await card(page).getByRole('button', { name: 'Close' }).first().click();
            await page.waitForTimeout(1_500);
            const second = await popupWithCompare(page, await wellsIn(page, { x: 200, y: 140, width: 380, height: 300 }, ['08/48137']));
            if (!second) throw new Error('no second well popup came up');
            await addFromCard(page);
            const third = await popupWithCompare(page, await wellsIn(page, { x: 520, y: 260, width: 400, height: 380 }, ['08/48137', second.lease]));
            if (!third) throw new Error('no third well popup came up');
            await addFromCard(page);
            await card(page).getByRole('button', { name: 'Close' }).first().click();
            await page.waitForTimeout(1_000);
            // Two leases, ticked on the Leases tab.
            await openTables(page);
            await pickTab(page, 'Leases');
            const leases = page.getByRole('button', { name: 'Select lease', exact: true });
            for (let i = 0; i < 2; i++) await leases.first().click();
            await page.getByText('2 selected').waitFor({ timeout: 30_000 });
            await page.getByRole('button', { name: 'Add to compare', exact: true }).click();
            await page.locator(H.tray).getByRole('radio', { name: /^Leases/ }).waitFor({ timeout: 30_000 });
            await page.getByRole('button', { name: 'Close the tables' }).click();
            await page.waitForTimeout(2_500);
            await page.locator(H.tray).getByRole('radio', { name: /^Wells/ }).click();
            await page.waitForTimeout(1_500);
            await parkPointer(page);
            // The tray, room above it for a badge and right of it for another.
            const t = await page.locator(H.tray).boundingBox();
            const x = Math.max(0, Math.floor(t.x - 14));
            const y = Math.max(0, Math.floor(t.y - 40));
            return { x, y, width: Math.min(VIEWPORT.width - x, Math.ceil(t.x + t.width + 36 - x)), height: VIEWPORT.height - y };
        },
        annotate: [
            { at: '[aria-label="Compare tray"] [role="radiogroup"]', n: 1 },
            { at: '[aria-label="Compare tray"] button[title^="Remove "][title$=" from compare"]', n: 2, side: 'top' },
            { at: '[aria-label="Compare tray"] button[title^="Hide the tray"]', n: 3, side: 'right' },
        ],
    },

    {
        // The county card (2026-10-21), from the place card's View county over Midland County.
        name: 'county-card',
        alt: 'Midland County’s card beside the map: County in its bar, the county’s name, its basin and id line, the buttons Show wells, Show leases, Zoom to, Show on map and Export, then its Totals and Production blocks, and Layout and Blocks at its foot',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await ready(page);
            await page.locator(H.place).click();
            await page.getByRole('button', { name: 'View county' }).first().click();
            await cardReady(page, 6_000);
            await card(page).getByRole('button', { name: 'Show wells', exact: true }).first().waitFor({ timeout: 60_000 });
            // One ring round the five verbs (Export the fifth, 2026-10-24), one round Layout and Blocks.
            await page.evaluate(() => {
                const root = document.querySelector('[aria-label="Row detail"]');
                const mark = (word, also, name) => {
                    let el = root && [...root.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim().startsWith(word));
                    while (el && el !== root && !also.test(el.textContent ?? '')) el = el.parentElement;
                    el?.setAttribute('data-shot', name);
                };
                mark('Show wells', /Show on map/, 'county-tiles');
                mark('Blocks', /Layout/, 'county-foot');
            });
            await parkPointer(page);
        },
        annotate: [
            { at: '[data-shot="county-tiles"]', n: 1, side: 'left' },
            { at: '[aria-label="Row detail"] [data-block-frame="overview"]', n: 2, side: 'left' },
            { at: '[data-shot="county-foot"]', n: 3, side: 'top' },
        ],
    },
    // Jones, where the account has no alert: elsewhere the panel lists its alerts instead.
    {
        name: 'alert-panel',
        alt: 'The Alert panel on Jones County’s card: each type with its count in the last 12 months, How often, Tell me by, the sentence, Create 2 alerts and More options',
        auth: true,
        path: `/maps?${JONES}`,
        run: async (page) => {
            await ready(page);
            await page.locator(H.place).click();
            await page.getByRole('button', { name: 'View county' }).first().click();
            await cardReady(page, 3_000);
            await card(page).getByRole('button', { name: 'Alert', exact: true }).first().click();
            const panel = page.locator('section[aria-label^="Alert me about"]');
            await panel.waitFor({ timeout: 60_000 });
            // The counts ask the server; each row holds a placeholder until its answer lands.
            await page.waitForFunction(() => !document.querySelector('section[aria-label^="Alert me about"] [class*="bone"]'), null, { timeout: 60_000 }).catch(() => {});
            await page.waitForTimeout(2_000);
            await parkPointer(page);
            await maskPhones(page);
            const p = await panel.boundingBox();
            const c = await card(page).boundingBox();
            const x = Math.max(0, Math.floor(Math.min(p.x, c.x) - 16));
            const right = Math.min(VIEWPORT.width, Math.ceil(Math.max(p.x + p.width, c.x + c.width) + 16));
            const y = Math.max(0, Math.floor(Math.min(p.y, c.y) - 16));
            const bottom = Math.min(VIEWPORT.height, Math.ceil(Math.max(p.y + p.height, 560) + 16));
            return { x, y, width: right - x, height: bottom - y };
        },
    },

    // ─── W-1 plats (maps/plats.mdx) ──────────────────────────────────────────────
    {
        name: 'plats',
        auth: true,
        path: `/maps?${PLAT_WELLS.view}&api=${PLAT_WELLS.first}`,
        steps: [
            {
                name: 'plat-on-map',
                alt: 'A permit’s card with its button reading Plat on map, and the well’s W-1 plat laid over the map around it, its name tag at the sheet’s top-left corner',
                run: async (page) => {
                    await ready(page);
                    await cardReady(page);
                    await card(page).getByRole('button', { name: 'Plat on map', exact: true }).click();
                    await cardButton(page, ['Plat on map', 'Plat failed']);
                    if (await card(page).getByRole('button', { name: 'Plat failed', exact: true }).isVisible().catch(() => false)) throw new Error('the plat could not be placed');
                    await page.locator('button[title$=" · W-1 plat"]').first().waitFor({ timeout: 60_000 });
                    await page.waitForTimeout(5_000);
                    await greyEnterprise(page);
                    await parkPointer(page);
                },
                annotate: [
                    { at: '[aria-label="Row detail"] button[aria-label="Plat on map"]', n: 1, side: 'bottom' },
                    { at: 'button[title$=" · W-1 plat"]', n: 2, side: 'left' },
                ],
            },
            {
                name: 'plats-layer-panel',
                alt: 'The Layers card with W-1 plats switched on and its options open: On the map · 2 of 8, Clear all, and two plats, each with its filing, how it fits, an opacity slider, View plat, Zoom to and Remove',
                run: async (page) => {
                    // A second plat, from a second permit: its card, by its API in the search.
                    await field(page).click();
                    await field(page).pressSequentially(PLAT_WELLS.second, { delay: 40 });
                    await page.waitForTimeout(2_500);
                    await field(page).press('Enter');
                    await card(page).getByText('THREE PENNY G', { exact: false }).first().waitFor({ timeout: 60_000 });
                    await cardReady(page, 2_000);
                    await card(page).getByRole('button', { name: 'Plat on map', exact: true }).click();
                    await cardButton(page, ['Plat on map', 'Plat failed']);
                    await page.waitForTimeout(3_000);
                    await page.locator(H.layers).click();
                    await page.getByRole('button', { name: 'W-1 plats options' }).click();
                    await page.getByText(/^On the map · 2 of 8$/).first().waitFor({ timeout: 30_000 });
                    await page.waitForTimeout(2_500);
                    await parkPointer(page);
                    // The plats' settings card, beside the Layers card.
                    const panel = await page.getByText(/^On the map · 2 of 8$/).first().boundingBox();
                    const x = Math.max(0, Math.floor((panel?.x ?? 270) - 50));
                    return { x, y: 0, width: 890 - x, height: VIEWPORT.height };
                },
                annotate: [
                    { at: '[aria-label^="Opacity of"]', n: 1, side: 'left' },
                    { at: (page) => page.getByRole('button', { name: 'Clear all', exact: true }), n: 2, side: 'left' },
                ],
            },
            {
                name: 'plat-view',
                alt: 'View plat: one plat and its well over a veiled map, and the strip naming the plat with Previous, 1 of 2, Next, Zoom to, View well and Done',
                run: async (page) => {
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(600);
                    if (await page.getByRole('button', { name: 'W-1 plats options' }).isVisible().catch(() => false)) await page.locator(H.layers).click();
                    await page.waitForTimeout(800);
                    await page.locator('button[title$=" · W-1 plat"]').filter({ hasText: 'THREE PENNY F' }).first().click();
                    await page.getByRole('menuitem', { name: 'View plat' }).click();
                    await page.locator('[role="toolbar"][aria-label="View plat"]').waitFor({ timeout: 30_000 });
                    await page.waitForTimeout(5_000);
                    await parkPointer(page);
                },
                annotate: [
                    { at: (page) => page.locator('[role="toolbar"][aria-label="View plat"]').getByRole('button', { name: 'Zoom to' }), n: 1, side: 'bottom' },
                    { at: (page) => page.locator('[role="toolbar"][aria-label="View plat"]').getByRole('button', { name: 'Done' }), n: 2, side: 'bottom' },
                ],
            },
        ],
    },

    // ─── Operators & Fields (maps/operators-fields.mdx) ──────────────────────────
    {
        name: 'operators-table',
        alt: 'The Operators tab over Midland County: each operator totalled over its leases in view, biggest boe/d first',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await pickTab(page, 'Leases');
            await copiesSaved(page);
            await pickTab(page, 'Operators');
            return tablesOnly(page);
        },
    },
    {
        name: 'operator-card',
        alt: 'An operator’s card beside the Operators table: Zoom to, Show on map, Add layer, Show leases, Show wells and Compare, then its Totals, Production and By lease blocks',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await pickTab(page, 'Leases');
            await copiesSaved(page);
            await pickTab(page, 'Operators');
            await fillWindow(page);
            await clickFirstRow(page);
            await cardSettled(page, /^RRC through/);
            await parkPointer(page);
        },
    },
    {
        name: 'fields-table',
        alt: 'The Fields tab over Midland County: RRC lifetime totals, the share the map can place, and the gap',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await pickTab(page, 'Fields');
            return tablesOnly(page);
        },
    },
    {
        name: 'fields-hover',
        alt: 'Hovering the Parks field: each of its leases a bubble sized by lifetime oil, the biggest labelled, and the readout at the bottom left summing up the field',
        auth: true,
        // South-west Midland County, where the Parks field's leases are.
        path: `/maps?${box(-102.2, 31.84, -102.02, 31.95)}`,
        run: async (page) => {
            await mapSettled(page);
            await hideOwnData(page);
            await openTables(page, { wide: false });
            await pickTab(page, 'Fields');
            await copiesSaved(page);
            // Not the Spraberry, first in the list: it covers the whole view. The first hover of a
            // fresh page reads the field's leases and draws nothing; off the row and back on, it draws.
            await hoverRow(page, 'PARKS (CONSOLIDATED)');
            await page.waitForTimeout(8_000);
            await page.mouse.move(1200, 886);
            await page.waitForTimeout(1_500);
            await hoverRow(page, 'PARKS (CONSOLIDATED)');
            await page.locator('[aria-label="PARKS (CONSOLIDATED) in view"]').waitFor({ timeout: 60_000 });
            await page.waitForTimeout(6_000);
        },
    },
    {
        name: 'field-card',
        alt: 'A field’s card beside the Fields table: Zoom to, Show on map, Add layer, Show leases, Show wells and Compare, then its Totals, Production and By lease blocks',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await openTables(page);
            await pickTab(page, 'Fields');
            await copiesSaved(page);
            await fillWindow(page);
            // The Spraberry, first in the list, has thousands of leases in view and charts slowly.
            await page.getByText('PARKS (CONSOLIDATED)', { exact: true }).first().click();
            await cardSettled(page, 'RRC field file');
            // The By lease block lands after the card's facts.
            await page.getByText(/^Each band is one lease/).first().waitFor({ timeout: 120_000 }).catch(() => {});
            await page.waitForTimeout(3_000);
            await parkPointer(page);
        },
    },
];
