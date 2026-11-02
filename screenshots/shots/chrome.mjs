// The map itself: overview, layers, settings, timeline, labels, printing, panels and alerts.
// See the field list at the top of shots.mjs.

import {
    ALERT_CLIP,
    around,
    box,
    H,
    hideAlertProjects,
    hideOwnData,
    JONES_BESIDE_DRAWER,
    mapIdle,
    mapSettled,
    maskPhones,
    MIDLAND,
    MIDLAND_BASIN,
    newAlertForm,
    noOwnWells,
    onPage,
    openAlerts,
    openMapControl,
    parkPointer,
    ready,
    VIEWPORT,
    withMap,
} from '../lib.mjs';

// ─── local helpers ───────────────────────────────────────────────────────────

/** The Logs layer on with the regulatory catalogues' logs only: the account's own logs and its org's
 *  (the blue capsules) are its business, not the help's. */
async function regulatoryLogsOn(page) {
    await openMapControl(page, 'Layers');
    await page.locator('[class*="layerCard"]').getByText('Logs', { exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Logs options', exact: true }).click();
    const mine = page.getByText('Mine & my org', { exact: true }).locator('xpath=..').getByRole('switch');
    await mine.waitFor({ state: 'attached', timeout: 15_000 });
    if (await mine.isChecked()) await mine.uncheck({ force: true });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await page.waitForTimeout(800);
}

/** The drilling timeline's Play (or Pause) is enabled: its wells are read. */
async function timelinePlayable(page) {
    await page.waitForFunction(() => {
        const bar = document.querySelector('[aria-label="Drilling timeline"]');
        if (!bar) return false;
        // Play is labelled by its word (2026-10-16), Pause while it plays.
        const play = [...bar.querySelectorAll('button')].find((b) => /^(Play|Pause)$/.test((b.getAttribute('aria-label') ?? b.textContent ?? '').trim()));
        return !!play && !play.disabled && !/Reading…|Opening the wells file|Getting the wells ready/.test(bar.textContent ?? '');
    }, null, { timeout: 180_000 });
}

/** A left-rail panel (a drawer) that has read the view: no skeleton rows left in it. */
async function panelSettled(page, text) {
    await page.getByText(text, { exact: true }).first().waitFor({ timeout: 120_000 });
    await page
        .waitForFunction(() => !document.querySelector('.mantine-Drawer-content [class*="skel"], .mantine-Drawer-content [aria-label="Reading the production history"]'), null, { timeout: 180_000 })
        .catch(() => {});
    await page.waitForTimeout(2_500);
}

// A producing horizontal well with a digital (LAS) log on record: GWENDOLYN #2310D, Crescent Energy,
// in south-west Midland County. The popup's Logs shows only for a well the map knows has a log.
const POPUP_WELL = { api: '32938918', at: [-102.2549057006836, 31.88892709286806] };

// Four record marks within two miles of each other in an open stretch of south Howard County, where
// few other wells crowd them: a vertical permit (a horizontal one is drawn as its line), a
// completion, a well with a LAS log, and another well with only a scanned log.
const MARKS = {
    permit: { at: [-101.49204, 32.14219], layer: 'permits-points' },
    completion: { at: [-101.48964, 32.13434], layer: 'completions-points' },
    las: { at: [-101.50269, 32.16457], layer: 'logs-points', digital: true },
    scan: { at: [-101.47213, 32.15905], layer: 'logs-points', digital: false },
};

export default [
    {
        name: 'maps-drilling-timeline',
        alt: 'The drilling timeline over Midland, with playback, speed, labels and blank-map controls, the which-wells row with two operators picked in their own colors, and the date track',
        auth: true,
        path: `/maps?${box(-102.31, 31.86, -102.19, 31.925)}`,
        run: async (page) => {
            await ready(page);
            await openMapControl(page, 'Layers');
            await page.getByText('Drilling Timeline', { exact: true }).click();
            const bar = page.getByRole('group', { name: 'Drilling timeline', exact: true });
            await bar.waitFor({ timeout: 30_000 });
            await page.getByRole('button', { name: 'Layers', exact: true }).click();
            await timelinePlayable(page);
            // The two operators who drilled the most wells in view, each in its own colour.
            await bar.getByRole('button', { name: 'Add operator' }).click();
            const items = page.getByRole('menuitemcheckbox');
            await items.first().waitFor({ timeout: 90_000 });
            await items.nth(0).click();
            await page.waitForTimeout(800);
            await items.nth(1).click();
            await page.waitForTimeout(800);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(2_000);
            await timelinePlayable(page);
            const pause = page.getByRole('button', { name: 'Pause', exact: true });
            if (await pause.isVisible()) await pause.click();
            // The playhead at the end: every well of theirs drawn.
            await page.getByRole('slider', { name: 'Drilling date' }).press('End');
            await mapIdle(page);
            await parkPointer(page);
            await page.waitForTimeout(1_500);
        },
    },
    {
        name: 'maps-printing',
        alt: 'Map Print Studio with a scaled Midland sheet, paper and export controls',
        auth: true,
        path: `/maps?${box(-102.18, 31.98, -102.14, 32.015)}`,
        run: async (page) => {
            await ready(page);
            await page.getByRole('button', { name: 'Print map', exact: true }).click();
            await page.getByRole('button', { name: 'Export PDF', exact: true }).waitFor({ timeout: 60_000 });
            await page.getByLabel('Feet per inch', { exact: true }).fill('2000');
            await page.getByLabel('Feet per inch', { exact: true }).press('Enter');
            await page.getByText('Loading map…', { exact: true }).waitFor({ state: 'hidden', timeout: 120_000 });
            await page.mouse.move(720, 870);
            await page.waitForTimeout(2_000);
        },
    },
    {
        name: 'maps-well-labels',
        alt: 'The Well labels editor with presets, fields and label positions around the symbol',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await ready(page);
            await openMapControl(page, 'Settings');
            await page.getByRole('button', { name: 'Edit labels…', exact: true }).click();
            await page.getByRole('button', { name: 'Apply to map', exact: true }).waitFor({ timeout: 30_000 });
            await page.mouse.move(720, 870);
            await page.waitForTimeout(1_000);
        },
    },
    // Maps
    {
        name: 'maps-overview',
        alt: 'The Maps screen over Midland County: the left rail with the project tile at its head, the search box at the top left, the place control at the top centre, the right rail from Layers down to Cross section and Ask, and the status bar at the bottom left',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: ready,
    },
    {
        name: 'maps-overview-annotated',
        alt: 'The Maps screen over Midland County, numbered: 1 the left rail, 2 the search box, 3 the place control, 4 Layers, Filters, Settings and Print, 5 Cross section, 6 Ask, 7 the map style and status bar, 8 the draw tools and zoom, 9 the Tables handle',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await hideOwnData(page);
            // Off the map: a resting pointer over wells raises a popup.
            await page.mouse.move(40, 960);
            await page.waitForTimeout(500);
        },
        annotate: [
            { at: 'nav.mantine-AppShell-navbar', n: 1, kind: 'box', side: 'right', pad: -2 },
            { at: H.search, n: 2, side: 'left' },
            { at: '[role="group"][aria-label="Map place context"]', n: 3, side: 'left' },
            { at: '[role="toolbar"][aria-label="Map panels"]', n: 4, side: 'left' },
            { at: H.section, n: 5, side: 'left' },
            { at: H.ask, n: 6, side: 'left' },
            { at: '.map-left-chrome', n: 7, side: 'top' },
            { at: (page) => page.locator('.map-right-chrome').filter({ has: page.locator(H.draw) }), n: 8, side: 'left' },
            { at: H.spine, n: 9, side: 'left', pad: 2 },
        ],
    },
    {
        name: 'well-popup',
        alt: 'The popup of a producing horizontal well, GWENDOLYN #2310D, in the Standard size: its status with Edit, its operator, field and API with its Copy icon, the lease\'s totals to date, per day now and over 12 months, the wellbore with All perforations and tops, the dates, and View well, Compare and More',
        auth: true,
        path: `/maps?${box(-102.34, 31.86, -102.20, 31.925)}`,
        run: async (page) => {
            await ready(page);
            // The popup offers Logs only for a well the map knows has one: the Logs layer reads them.
            await regulatoryLogsOn(page);
            await mapIdle(page);
            const at = await onPage(page, POPUP_WELL.at);
            await page.mouse.move(at.x + 40, at.y + 40);
            await page.waitForTimeout(400);
            await page.mouse.move(at.x, at.y, { steps: 6 });
            // A click opens the popup (the default since 2026-10-16), and it stays until a click off it.
            await page.mouse.click(at.x, at.y);
            const popup = page.locator('.qs-wp').first();
            await popup.waitFor({ timeout: 30_000 });
            if (!(await popup.textContent()).includes('38918')) throw new Error('the popup is for another well on the pad');
            await popup.locator('.qs-wp-more-t').waitFor({ timeout: 15_000 });
            // The lease's totals and the perforations arrive after the popup opens.
            await page.waitForFunction(() => !document.querySelector('.qs-wp .qs-wp-bar, .qs-wp [aria-busy="true"]'), null, { timeout: 60_000 }).catch(() => {});
            await page.waitForTimeout(2_000);
            const b = await popup.boundingBox();
            const clip = around(
                { x: Math.min(b.x, at.x), y: Math.min(b.y, at.y), width: Math.max(b.x + b.width, at.x) - Math.min(b.x, at.x), height: Math.max(b.y + b.height, at.y) - Math.min(b.y, at.y) },
                { left: 70, top: 50, right: 70, bottom: 60 },
            );
            await noOwnWells(page, clip);
            return clip;
        },
        annotate: [
            { at: (page) => page.locator('.qs-wp [data-edit-well]:not([data-edit-tab])').first(), n: 1, side: 'right' },
            { at: '.qs-wp .qs-wp-lease', n: 2, side: 'left', pad: 2 },
            { at: '.qs-wp .qs-wp-zm', n: 3, side: 'right' },
            { at: `.qs-wp ${H.popupViewWell}`, n: 4, side: 'bottom' },
            { at: '.qs-wp .qs-wp-more-t', n: 5, side: 'bottom' },
            { at: `.qs-wp ${H.popupCompare}`, n: 6, side: 'bottom' },
        ],
    },
    {
        name: 'maps-start-drawer',
        alt: 'The start drawer, with Go to place, Go to RRC record, Basins and Saved scopes',
        auth: true,
        startDrawer: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await ready(page);
            await parkPointer(page);
            return { x: 0, y: 0, width: 960, height: VIEWPORT.height };
        },
    },
    {
        name: 'maps-layers',
        alt: 'The Layers card, grouped into Wells, Analytics and Reference, each row\'s swatch showing the mark its layer draws: the permit\'s ring, the completion\'s triangle and the log\'s capsule among them',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            // A taller window, so the card has room for all three groups without scrolling, and the draw
            // tools (anchored to the bottom) fall below the picture.
            const tall = { width: VIEWPORT.width, height: 1420 };
            await page.setViewportSize(tall);
            await ready(page);
            await openMapControl(page, 'Layers');
            // Logs on, so its capsule swatch is drawn at full strength beside the permit's and the completion's.
            await page.locator('[class*="layerCard"]').getByText('Logs', { exact: true }).first().click();
            await page.waitForTimeout(3_000);
            await parkPointer(page);
            const card = await page.locator('[class*="layerCard"]').boundingBox();
            return around(card, { left: 24, top: 24, right: VIEWPORT.width, bottom: 24 }, tall);
        },
    },
    {
        name: 'map-record-marks',
        alt: 'Close in on a quiet stretch of the Permian Basin with Permits, Completions and Logs on: a permit\'s raspberry ring, a completion\'s teal triangle, and log capsules around two wells, solid for a LAS log and dashed for a scan',
        auth: true,
        // About zoom 14: close enough for the marks, not so close that every well wears its labels.
        path: `/maps?${box(-101.5344, 32.118, -101.4404, 32.181)}`,
        run: async (page) => {
            await ready(page);
            await regulatoryLogsOn(page);
            await mapIdle(page);
            await parkPointer(page);
            // Each mark where the map draws it: the feature of its layer nearest to where it should be.
            const found = await withMap(page, (map, marks) => {
                const r = map.getContainer().getBoundingClientRect();
                const out = {};
                for (const [k, m] of Object.entries(marks)) {
                    const p = map.project(m.at);
                    const fs = map
                        .queryRenderedFeatures([[p.x - 14, p.y - 14], [p.x + 14, p.y + 14]], { layers: [m.layer] })
                        .filter((f) => f.geometry.type === 'Point' && (m.digital === undefined || !!f.properties.is_digital === m.digital));
                    if (!fs.length) return { missing: k };
                    const q = map.project(fs[0].geometry.coordinates);
                    out[k] = { x: r.left + q.x, y: r.top + q.y };
                }
                return out;
            }, MARKS);
            if (found.missing) throw new Error(`the ${found.missing} mark is not drawn where it should be`);
            const xs = Object.values(found).map((v) => v.x);
            const ys = Object.values(found).map((v) => v.y);
            const clip = around(
                { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
                { left: 130, top: 90, right: 130, bottom: 90 },
            );
            await noOwnWells(page, clip);
            await page.evaluate((found) => {
                for (const [k, v] of Object.entries(found)) {
                    const el = document.createElement('div');
                    el.dataset.shotMark = k;
                    el.style.cssText = `position:fixed;left:${v.x - 10}px;top:${v.y - 12}px;width:20px;height:24px;pointer-events:none;`;
                    document.body.appendChild(el);
                }
            }, found);
            return clip;
        },
        annotate: [
            { at: '[data-shot-mark="permit"]', n: 1, pad: 6, side: 'right' },
            { at: '[data-shot-mark="completion"]', n: 2, pad: 6, side: 'right' },
            { at: '[data-shot-mark="las"]', n: 3, pad: 6, side: 'right' },
            { at: '[data-shot-mark="scan"]', n: 4, pad: 6, side: 'right' },
        ],
    },
    {
        name: 'maps-heatmap',
        alt: 'The Well Heatmap over the Midland Basin, with its metric menu and color legend',
        auth: true,
        path: `/maps?${MIDLAND_BASIN}`,
        run: async (page) => {
            await ready(page);
            await openMapControl(page, 'Layers');
            // The heatmaps are radios in the Analytics group's SURFACE box, not switches.
            await page.getByText('Well heatmap', { exact: true }).first().click();
            await page.waitForTimeout(8_000);
            await parkPointer(page);
        },
    },
    {
        // Style wells by your data (2026-10-18): the Wells row's Style button and its panel, TD chosen.
        name: 'maps-style-wells',
        alt: 'The Layers card with the Wells row’s style panel open and TD chosen: its colour ramp, Quantile, Equal and Custom breaks and the classes with how many wells fall in each; on the map, the wells coloured by TD, and the legend',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await ready(page);
            await openMapControl(page, 'Layers');
            await page.getByRole('button', { name: 'Wells options', exact: true }).click();
            const panel = page.locator('[role="radiogroup"][aria-label="Style wells by"]');
            await panel.waitFor({ timeout: 30_000 });
            await panel.getByRole('radio', { name: /^TD/ }).click();
            await page.locator('[aria-label="Legend"]').waitFor({ timeout: 60_000 });
            // The class counts are the map's own: wait until they are numbers, not bars.
            await page.waitForFunction(() => !document.querySelector('[role="radiogroup"][aria-label="Style wells by"] [aria-label="Counting"]'), null, { timeout: 90_000 }).catch(() => {});
            await mapIdle(page);
            await page.waitForTimeout(2_000);
            await parkPointer(page);
        },
        annotate: [
            // Right of the button: on its left the badge would cover the row's name.
            { at: 'button[aria-label="Wells options"]', n: 1, side: 'right' },
            { at: '[role="radiogroup"][aria-label="Breaks"]', n: 2, side: 'left' },
            { at: '[aria-label="Legend"]', n: 3, side: 'top' },
        ],
    },
    {
        name: 'maps-filters-card',
        alt: 'The Filters card on the right side of the map: well types, wellbore, Any column and the saved filters line',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            // A taller window, so the draw tools (anchored to the bottom) clear the card's foot.
            await page.setViewportSize({ width: VIEWPORT.width, height: 1100 });
            await ready(page);
            await openMapControl(page, 'Filters');
            await page.getByText('Any column', { exact: true }).waitFor({ timeout: 30_000 });
            await parkPointer(page);
            await page.waitForTimeout(1_500);
            // From the place control's left edge (whole, not cut) to the card's foot, above the draw tools.
            const place = await page.locator('[role="group"][aria-label="Map place context"]').boundingBox();
            const foot = await page.getByText(/^The Wells table lists only the wells the map draws/).first().boundingBox();
            const draw = await page.locator(H.draw).first().boundingBox();
            const bottom = Math.min(foot.y + foot.height + 28, draw ? draw.y - 6 : VIEWPORT.height);
            const x = Math.max(0, Math.floor(place.x - 16));
            return { x, y: 0, width: VIEWPORT.width - x, height: Math.ceil(bottom) };
        },
    },

    // Map settings
    {
        name: 'maps-settings',
        alt: 'The Settings card: Appearance, Record cards with Right and Left, Place production, Status bar, Well popup with On click or On hover and Standard, Large or Extra large, Well marks, Well labels, and Map data… under Support',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            // A taller window, so the whole card shows without scrolling, and the draw tools (anchored to
            // the bottom) fall below the picture rather than being cut by it.
            const tall = { width: VIEWPORT.width, height: 1340 };
            await page.setViewportSize(tall);
            await ready(page);
            await openMapControl(page, 'Settings');
            await page.getByRole('button', { name: 'Map data…', exact: true }).waitFor({ timeout: 30_000 });
            await parkPointer(page);
            const card = await page.locator('[class*="settingsCard"]').first().boundingBox();
            return around(card, { left: 60, top: 16, right: VIEWPORT.width, bottom: 20 }, tall);
        },
        annotate: [
            { at: '[role="radiogroup"][aria-label="Where record cards open"]', n: 1, side: 'left' },
            { at: '[role="radiogroup"][aria-label="How the place control shows production"]', n: 2, side: 'left' },
            { at: (page) => page.locator('[class*="settingsCard"]').getByText('Show status bar', { exact: true }).locator('xpath=..'), n: 3, side: 'left' },
            { at: '[role="radiogroup"][aria-label="Popup size"]', n: 4, side: 'left' },
            { at: (page) => page.getByRole('button', { name: 'Map data…', exact: true }), n: 5, side: 'left' },
        ],
    },
    {
        name: 'maps-status-bar',
        alt: 'The status bar\'s card above the bar at the bottom left of the map: Scale bar, Scale as a ratio, Cursor coordinates with its two formats, Zoom level, and County, Abstract and Survey, block and section under the cursor, with Hide at the top',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await ready(page);
            await page.locator(H.status).click();
            const card = page.locator('[class*="settingsCard"]').filter({ hasText: 'Under the cursor' }).first();
            await card.waitFor({ timeout: 30_000 });
            // A third part on, as the picture's words say: Zoom level, beside the scale and coordinates.
            await card.getByText('Zoom level', { exact: true }).click();
            await page.waitForTimeout(800);
            await parkPointer(page);
            const b = await card.boundingBox();
            const bar = await page.locator(H.status).boundingBox();
            // The map's corner only, right of the left rail.
            const rail = await page.locator('nav.mantine-AppShell-navbar').boundingBox();
            const left = rail.x + rail.width + 2;
            return around({ x: left, y: b.y, width: Math.max(b.x + b.width, bar.x + bar.width) - left, height: bar.y + bar.height - b.y }, { left: 0, top: 30, right: 60, bottom: 16 });
        },
        annotate: [
            { at: H.status, n: 1, side: 'right' },
            { at: (page) => page.locator('[class*="settingsCard"]').getByRole('button', { name: 'Hide', exact: true }), n: 2, side: 'right' },
            { at: (page) => page.locator('[class*="settingsCard"]').getByText('Under the cursor', { exact: true }), n: 3, side: 'right' },
        ],
    },

    // Operator and field layers
    {
        name: 'operator-layers',
        auth: true,
        path: `/maps?${box(-102.45, 31.7, -101.6, 32.2)}`,
        steps: [
            {
                name: 'operator-layers-1',
                alt: 'The Operators panel open beside the map with nothing added yet: Color the operators you care about, Add top 5 by boe/d, the Rate by operator chart and the operators in view, biggest first',
                run: async (page) => {
                    await ready(page);
                    await page.locator(H.navOperators).click();
                    await panelSettled(page, 'Color the operators you care about');
                    await page.locator('section[aria-label="Rate by operator"] canvas').first().waitFor({ timeout: 120_000 }).catch(() => {});
                    await mapIdle(page);
                    await parkPointer(page);
                },
                annotate: [{ at: H.navOperators, n: 1, side: 'right' }],
            },
            {
                name: 'operator-layers-2',
                alt: 'The Operators panel with the pointer on an operator under In view: its Add button showing, and its leasehold previewed on the map in the color it would get',
                run: async (page) => {
                    // The second operator in view, so the list's first row stays plain beside it.
                    const rows = page.locator('[title="Add to map"]');
                    await rows.nth(1).hover();
                    await page.waitForTimeout(1_000);
                    await mapIdle(page);
                    await page.waitForTimeout(1_500);
                },
                annotate: [{ at: (page) => page.getByRole('button', { name: 'Add top 5 by boe/d' }), n: 2, side: 'right' }],
            },
            {
                name: 'operator-layers-3',
                alt: 'Five operators under On the map, each in its own color, with one operator\'s color picker open on its ten colors',
                run: async (page) => {
                    await page.getByRole('button', { name: 'Add top 5 by boe/d' }).click();
                    await page.getByRole('heading', { name: 'On the map' }).waitFor({ timeout: 30_000 });
                    // Each operator's line on the chart, read before the picture.
                    await page.waitForFunction(() => !/Reading the rest of the lines/.test(document.querySelector('section[aria-label="Rate by operator"]')?.textContent ?? ''), null, { timeout: 180_000 }).catch(() => {});
                    await mapIdle(page);
                    await page.waitForTimeout(1_500);
                    await page.locator('button[aria-label^="Change color of"]').first().click();
                    await page.getByRole('dialog', { name: 'Color' }).first().waitFor({ timeout: 15_000 });
                    await mapIdle(page);
                    await page.waitForTimeout(1_500);
                },
                annotate: [{ at: (page) => page.locator('button[aria-label^="Change color of"]').first(), n: 3, side: 'left' }],
            },
            {
                name: 'operator-layers-4',
                alt: 'The map with five operators\' leasehold in their colors, the Rate by operator chart with a line for each, and the pointer on one operator so its line and its leasehold stand out',
                run: async (page) => {
                    // The swatch again closes its picker (an Escape would also reach the drawer, which closes on one).
                    await page.locator('button[aria-label^="Change color of"]').first().click();
                    await page.waitForTimeout(800);
                    await page.locator('section[aria-label="Rate by operator"] canvas').first().waitFor({ timeout: 60_000 }).catch(() => {});
                    await page.waitForFunction(() => !/Reading the rest of the lines/.test(document.querySelector('section[aria-label="Rate by operator"]')?.textContent ?? ''), null, { timeout: 120_000 }).catch(() => {});
                    // Point at the second operator on the map: its line comes forward, its leasehold lifts.
                    await page.locator('[role="button"][aria-pressed]').filter({ has: page.locator('button[aria-label^="Change color of"]') }).nth(1).hover();
                    await page.waitForTimeout(1_200);
                    await mapIdle(page);
                    await page.waitForTimeout(1_000);
                },
                annotate: [{ at: 'section[aria-label="Rate by operator"]', n: 4, side: 'right', kind: 'box' }],
            },
        ],
    },
    {
        name: 'fields-panel',
        alt: 'The Fields panel on Cumulative oil over the Central Basin Platform: Goldsmith, Cowden North and Foster added and shaded on the map by their cumulative oil, with the key under boe/d, Cumulative oil and Cumulative gas',
        auth: true,
        // The Central Basin Platform, where the old fields (Cowden, Goldsmith, Fullerton…) each have a shape
        // of their own; over the Midland Basin the Spraberry Trend shades everything one colour.
        path: `/maps?${box(-103.0, 31.72, -102.35, 32.12)}`,
        run: async (page) => {
            await ready(page);
            await page.locator(H.navFields).click();
            await panelSettled(page, 'Color the fields you care about');
            await page.getByRole('radiogroup', { name: 'Color and rank fields by' }).getByRole('radio', { name: 'Cumulative oil' }).click();
            await page.waitForTimeout(3_000);
            // Three of the platform's own fields, by name (Enter adds the top match). "Add top 5 by
            // cumulative oil" would rank by each field's lifetime total in Texas, and lead with a field
            // that has one stray well here.
            const find = page.getByRole('textbox', { name: 'Find field' });
            for (const name of ['GOLDSMITH', 'COWDEN, NORTH', 'FOSTER']) {
                await find.fill(name);
                await page.getByRole('heading', { name: 'In view' }).first().waitFor({ timeout: 60_000 });
                await page.waitForTimeout(2_500);
                await find.press('Enter');
                await page.waitForTimeout(1_500);
            }
            await page.getByRole('heading', { name: 'On the map' }).waitFor({ timeout: 30_000 });
            await page.locator('[aria-label="cumulative oil, bbl"]').waitFor({ timeout: 60_000 });
            await page.waitForTimeout(3_000);
            await mapIdle(page);
            await parkPointer(page);
        },
        annotate: [
            { at: '[role="radiogroup"][aria-label="Color and rank fields by"]', n: 1, side: 'right' },
            { at: '[aria-label="cumulative oil, bbl"]', n: 2, side: 'right' },
        ],
    },

    // Production in view
    {
        name: 'production-panel',
        alt: 'The Production panel over the Midland Basin: the area\'s boe/d with its oil and gas, the Per well chart with a faint curve for each lease, the P10–P90 band and the P50, and the leases in view ranked by boe/d',
        auth: true,
        path: `/maps?${box(-102.45, 31.7, -101.6, 32.2)}`,
        run: async (page) => {
            await ready(page);
            await page.locator(H.navProduction).click();
            await panelSettled(page, 'Cumulative per well');
            await page.locator('[role="tablist"][aria-label="Rows by"]').waitFor({ timeout: 60_000 });
            await page.waitForFunction(() => !document.querySelector('[aria-label="Reading the production history"]'), null, { timeout: 180_000 }).catch(() => {});
            // At rest: the big unit leases at the top of the list mostly have no per-well curve to light
            // (their history starts before the record), and pointing further down scrolls the panel.
            await parkPointer(page);
            await page.waitForTimeout(1_500);
        },
        annotate: [
            { at: (page) => page.locator('.mantine-Drawer-content [class*="__big"]').filter({ hasText: 'boe/d' }).first(), n: 1, side: 'right' },
            { at: '[role="radiogroup"][aria-label="Chart"]', n: 2, side: 'right' },
            { at: '[role="tablist"][aria-label="Rows by"]', n: 3, side: 'right' },
            // The filter box and the sort button share a row: one box, so their badges don't collide.
            { at: (page) => page.locator('.mantine-Drawer-content [class*="__flt"]').first(), n: 4, side: 'right', kind: 'box' },
            { at: (page) => page.locator('.mantine-Drawer-content').getByRole('button', { name: 'Export CSV' }).first(), n: 5, side: 'right' },
        ],
    },

    // Alerts in Maps
    {
        name: 'alerts-drawer',
        alt: 'The Alerts drawer: each alert with its type, recent matches and Active switch, one expanded with its check history and matches',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await openAlerts(page);
            await hideOwnData(page);
            // Expand the first alert: its check history, matches, and its area outlined on the map.
            await page.getByRole('button', { name: /^Pause alert|^Resume alert/ }).first().waitFor({ timeout: 30_000 }).catch(() => {});
            // A row's second line ("198 matches · 2h ago") expands it; the name pill up top is the place panel.
            await page.getByText(/^\d[\d,]* matches$/).first().click();
            await page.waitForTimeout(8_000);
            await hideAlertProjects(page);
            return ALERT_CLIP;
        },
    },
    {
        name: 'alert-form',
        alt: 'The alert form: New permits and Completions ticked, Jones County picked and outlined on the map, As they come in by email, and the sentence at the foot above Create 2 alerts',
        auth: true,
        path: `/maps?${JONES_BESIDE_DRAWER}`,
        run: async (page) => {
            // Tall enough for the whole form: it's one screen, and the picture should be too.
            await page.setViewportSize({ width: 1440, height: 1420 });
            await newAlertForm(page, ['New permits', 'Completions']);
            await hideOwnData(page);
            await mapIdle(page);
            const cancel = await page.getByRole('button', { name: 'Cancel', exact: true }).last().boundingBox();
            await maskPhones(page);
            return { x: 0, y: 0, width: 1120, height: Math.min(1420, Math.ceil(cancel.y + cancel.height + 62)) };
        },
    },
    {
        name: 'alert-narrow',
        alt: 'Narrow further open for Completions: Purpose of Filing, Completion Type, Wellbore Profile, the date and rate filters and Forms in the filing, with Initial Potential and Horizontal chosen',
        auth: true,
        path: `/maps?${JONES_BESIDE_DRAWER}`,
        run: async (page) => {
            await page.setViewportSize({ width: 1440, height: 1900 });
            await newAlertForm(page, ['Completions']);
            await page.getByRole('button', { name: /^Narrow further/ }).click();
            await page.getByRole('button', { name: 'INITIAL POTENTIAL' }).click({ timeout: 60_000 });
            await page.getByRole('button', { name: 'HORIZONTAL' }).click();
            await page.waitForTimeout(3_000);
            const top = await page.getByRole('button', { name: /^Narrow further/ }).boundingBox();
            const end = await page.getByText('Any of those you pick.').boundingBox();
            await maskPhones(page);
            return { x: Math.floor(top.x - 18), y: Math.floor(top.y - 12), width: 396, height: Math.ceil(end.y + end.height + 14 - (top.y - 12)) };
        },
    },
    {
        name: 'alert-delivery',
        alt: 'How should we tell you: As they come in, Every morning and Monday mornings, Email and Text ticks, and Delivery open with other schedules, a minimum count, the email format and a name',
        auth: true,
        path: `/maps?${JONES_BESIDE_DRAWER}`,
        run: async (page) => {
            await page.setViewportSize({ width: 1440, height: 1700 });
            await newAlertForm(page, ['New permits']);
            await page.getByRole('button', { name: /^Delivery/ }).click();
            await page.getByRole('button', { name: 'Choose days and hours' }).click();
            await page.waitForTimeout(1_500);
            const top = await page.getByRole('heading', { name: 'How should we tell you?' }).boundingBox();
            const end = await page.getByPlaceholder('Named for you').boundingBox();
            await maskPhones(page);
            return { x: Math.floor(top.x - 18), y: Math.floor(top.y - 14), width: 396, height: Math.ceil(end.y + end.height + 16 - (top.y - 14)) };
        },
    },
];
