// Well logs, cross-sections, formation tops, and tests, cores & notes.
// See the field list at the top of shots.mjs.
//
// Nothing here is saved. Tops, depth records, rocks and log-viewer preferences stay blocked
// (`BLOCKED_WRITES`): editors and armed modes are opened and pictured just before the write. The
// tops routes that READ by POST (a section's wells, a surface, the formations in view, the values
// beside the wells) are let through: they change nothing.
//
// The logs pictured are the regulatory catalogues' (public record). The account's own and its
// organisation's uploads are switched off the Logs layer in the page (`logsOn`), and its own wells
// and My Data layers are kept out of frame.

import {
    around,
    box,
    greyEnterprise,
    H,
    mapIdle,
    noOwnWells,
    onPage,
    openMapControl,
    parkPointer,
    ready,
    VIEWPORT,
    withMap,
} from '../lib.mjs';

/** Reads the tops service answers by POST; every write to it stays blocked. */
const TOPS_READS = /^\/api\/v1\/tops\/(?:section\/columns|formations|surface|points)$/;

// ─── local helpers (copies of the chrome group's map helpers, plus this group's own) ─────────

/**
 * The Logs layer on, with the regulatory catalogues only: the account's own and its organisation's
 * uploads (the blue capsules) are its business. `gear` leaves the layer's settings panel open;
 * `card` leaves the Layers card open.
 */
async function logsOn(page, { gear = false, card = false } = {}) {
    await openMapControl(page, 'Layers');
    const row = page.locator('[class*="layerCard"]').getByText('Logs', { exact: true }).first();
    await row.click();
    await page.waitForTimeout(800);
    const settings = page.getByRole('button', { name: 'Logs options', exact: true });
    await settings.click();
    const mine = page.getByText('Mine & my org', { exact: true }).locator('xpath=..').getByRole('switch');
    await mine.waitFor({ state: 'attached', timeout: 15_000 });
    if (await mine.isChecked()) await mine.uncheck({ force: true });
    await page.waitForTimeout(800);
    if (!gear) {
        await page.getByRole('button', { name: 'Close Logs options', exact: true }).click();
        await page.waitForTimeout(600);
    }
    if (!card) {
        await page.getByRole('button', { name: 'Layers', exact: true }).click();
        await page.waitForTimeout(800);
    }
}

/** The Layers card's row for `name`: the innermost element holding its name and its switch. */
const layerRow = (page, name) =>
    page.locator('[class*="layerCard"]').getByText(name, { exact: true }).first().locator('xpath=ancestor::*[.//*[@role="switch"]][1]');

/** A well's popup, from a click on it (the default since 2026-10-16 is "On click"). */
async function hoverWell(page, lnglat, apiTail) {
    const at = await onPage(page, lnglat);
    await page.mouse.move(at.x + 40, at.y + 40);
    await page.waitForTimeout(400);
    await page.mouse.move(at.x, at.y, { steps: 6 });
    await page.mouse.click(at.x, at.y);
    const popup = page.locator('.qs-wp').first();
    await popup.waitFor({ timeout: 30_000 });
    if (!(await popup.textContent()).includes(apiTail)) throw new Error('the popup is for another well');
    // The lease's totals and the perforations arrive after the popup opens.
    await page.waitForFunction(() => !document.querySelector('.qs-wp .qs-wp-bar, .qs-wp [aria-busy="true"]'), null, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1_500);
    return popup;
}

// GWENDOLYN #2310D (Crescent Energy, south-west Midland County): a producing well with a digital
// (LAS) log in the regulatory catalogue, which opens in the Log tab, and five petrophysics zones.
const GWEN = { api: '4232938918', tail: '38918', at: [-102.2549057006836, 31.88892709286806] };
const GWEN_VIEW = box(-102.34, 31.86, -102.2, 31.925);

/** The data tables dragged wider (still narrow enough that the log's chat sits under the strip). */
async function widenTables(page, to = 620) {
    const handle = await page.getByRole('button', { name: 'Hide data tables' }).boundingBox();
    if (!handle) throw new Error('the tables are not open');
    await page.mouse.move(handle.x + handle.width / 2, 200);
    await page.mouse.down();
    await page.mouse.move(to, 200, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(2_000);
}

/** The Log tab has read its log: the band, and the Tool menu (it shows once the strip has a range). */
async function logReady(page) {
    await page.getByText('API 329-38918', { exact: true }).first().waitFor({ timeout: 90_000 });
    await page.getByRole('button', { name: /^Tool$|^Pick (tops|interval)$/ }).first().waitFor({ timeout: 120_000 });
    await page.waitForFunction(() => !document.querySelector('.mantine-LoadingOverlay-root'), null, { timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(3_000);
}

/** The well's popup shut. It stays pinned since 2026-10-16, over whatever was opened from it. */
async function closePopup(page) {
    const x = page.locator('button[data-wp-close]').first();
    if (await x.isVisible().catch(() => false)) await x.click();
    await page.waitForTimeout(600);
}

/** GWENDOLYN's log open in the Log tab, from its popup's Logs, the tables widened. */
async function openGwendolynLog(page) {
    await ready(page);
    await logsOn(page);
    await mapIdle(page);
    const popup = await hoverWell(page, GWEN.at, GWEN.tail);
    // Logs is one of the popup's More (2026-10-21).
    await popup.locator('.qs-wp-more-t').click();
    await popup.locator(H.popupLogs).click();
    await logReady(page);
    await closePopup(page);
    await widenTables(page);
    await parkPointer(page);
    await page.waitForTimeout(1_500);
}

/**
 * The log's chat is Enterprise; most readers see a one-line note in its place. Every Log tab
 * picture stops at the top of the chat, so it shows only what every reader with the log sees.
 */
async function aboveTheChat(page) {
    // The chat's own box in the Log tab (`LogPanelView`'s first child of its body), whatever it holds.
    const top = await page.evaluate(() => {
        const chat = document.querySelector('#maps-data-panel [class*="chat"]');
        const r = chat?.getBoundingClientRect();
        return r && r.height > 0 ? r.top : null;
    });
    if (top === null) throw new Error("the log's chat was not found, so the picture would not stop above it");
    return Math.floor(top);
}

/** The Log tab's panel, from its left edge, down to the chat. */
async function logPanelClip(page) {
    const panel = await page.locator('#maps-data-panel').boundingBox();
    const bottom = await aboveTheChat(page);
    const x = Math.max(0, Math.floor((panel?.x ?? 620) - 1));
    return { x, y: 0, width: VIEWPORT.width - x, height: bottom };
}

// A section across the Fuhrman-Mascho field, Andrews County, west to east: five shallow wells with
// the RRC's tops from the Rustler down to the San Andres (and the Glorieta in some).
const SECTION_VIEW = box(-102.692, 32.2018, -102.542, 32.2818);
const SECTION_WELLS = [
    [-102.666335, 32.270878], // KING, E. F. #12
    // KING, E. F. #2R (-102.655563, 32.265961) left the list on 2026-10-22: at this zoom eight KING wells
    // share its spot and a click there picks a neighbour.
    [-102.643139, 32.272384], // NORTHEAST FUHRMAN-MASCHO UNIT #114
    [-102.621617, 32.263257], // NORTHEAST FUHRMAN-MASCHO UNIT #136
    [-102.571449, 32.261407], // PARKER, J. E. -H- (AMOCO) #14W
];

/**
 * Well popups on click, for this page only (the browser's setting, not the account's): with popups
 * on hover, a pointer resting on a picked well opens its popup over the next well to pick.
 */
async function popupsOnClick(page) {
    await page.evaluate(() => {
        localStorage.setItem('well-hover-mode', JSON.stringify('click'));
        window.dispatchEvent(new CustomEvent('wellHoverModeChanged', { detail: 'click' }));
    });
}

/** The top of the section panel (the map above it takes the clicks). */
async function panelTop(page) {
    const head = await page.getByRole('heading', { name: 'Cross section', exact: true }).boundingBox();
    return head ? head.y - 30 : VIEWPORT.height;
}

async function startSection(page) {
    await ready(page);
    await popupsOnClick(page);
    await page.locator(H.section).click();
    await page.getByRole('heading', { name: 'Cross section', exact: true }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1_500);
}

/** Clicks each well; each one must be on the open map above the panel, clear of the command bar. */
async function pickWells(page, wells) {
    const top = await panelTop(page);
    for (const ll of wells) {
        const at = await onPage(page, ll);
        if (at.y > top - 50 || at.y < 80) throw new Error(`a section well is off the open map (y ${Math.round(at.y)})`);
        await page.mouse.click(at.x, at.y);
        await page.mouse.move(at.x, at.y - 90, { steps: 3 });
        await page.waitForTimeout(1_200);
    }
}

/** Every well in the section read: the panel's head counts them, and no column still says Reading…. */
async function sectionRead(page, n) {
    await page.getByText(new RegExp(`A → A′ · ${n} wells`)).first().waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => {
        const head = [...document.querySelectorAll('h3')].find((h) => h.textContent === 'Cross section');
        const panel = head?.closest('[data-qs-chrome]');
        return panel && !/Reading…/.test(panel.textContent ?? '');
    }, null, { timeout: 120_000 });
    await page.waitForTimeout(2_500);
}

/** The five-well section built, picking done, the pointer off it. */
async function buildSection(page) {
    await startSection(page);
    await pickWells(page, SECTION_WELLS);
    await page.getByRole('toolbar', { name: 'Cross section' }).getByRole('button', { name: 'Done', exact: true }).click();
    await sectionRead(page, SECTION_WELLS.length);
    await parkPointer(page);
}

/** The middle of a formation's layer carried between two wells, found by its title (`Name · rock · …`). */
async function layerBetween(page, name) {
    return page.evaluate((name) => {
        const g = document.querySelector('g[class*="layers"]');
        const titled = [...(g?.querySelectorAll('title') ?? [])].filter((t) => (t.textContent ?? '').startsWith(`${name} ·`));
        const wide = titled
            .map((t) => t.parentElement?.getBoundingClientRect())
            .filter((r) => r && r.width > 100 && r.height > 6)
            .sort((a, b) => b.height - a.height)[0];
        return wide ? { x: wide.left + wide.width / 2, y: wide.top + wide.height / 2 } : null;
    }, name);
}

// KING, E. F. #12 (Citation Oil & Gas, Fuhrman-Mascho): eight RRC tops, from the Rustler to the
// Glorieta, and no depth records.
const KING = { api: '4200305215', view: box(-102.70, 32.24, -102.62, 32.30) };

/** KING #12's card, its `section` (data-section) brought into view. */
async function kingCard(page, section) {
    await ready(page);
    await page.locator(H.card).waitFor({ timeout: 90_000 });
    const sec = page.locator(`[aria-label="Row detail"] [data-block-frame="${section}"]`);
    await sec.waitFor({ timeout: 90_000 });
    await sec.scrollIntoViewIfNeeded();
    await page.waitForFunction((s) => !document.querySelector(`[aria-label="Row detail"] [data-block-frame="${s}"] [class*="keleton"]`), section, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2_500);
    return sec;
}

export default [
    // ─── maps/well-logs ─────────────────────────────────────────────────────────────────────
    {
        name: 'maps-logs-layer',
        alt: 'The Layers card with Logs on and its options open: Regulatory catalogues, Mine & my org and LAS logs only, and the key to the four capsules, over a map where olive capsules frame the wells with a log on record',
        auth: true,
        path: `/maps?${GWEN_VIEW}`,
        run: async (page) => {
            await ready(page);
            await logsOn(page, { gear: true, card: true });
            await mapIdle(page);
            await parkPointer(page);
            // Down to the layer's own note: the catalogue's attribution under it is the publisher's terms.
            const note = await page.getByText(/^Where a well log is on record/).first().boundingBox();
            const clip = { x: 72, y: 0, width: VIEWPORT.width - 72, height: Math.ceil(note.y + note.height + 4) };
            await noOwnWells(page, clip);
            return clip;
        },
        annotate: [
            { at: (page) => layerRow(page, 'Logs'), n: 1, side: 'right' },
            { at: (page) => page.getByText('LAS, digital — opens in the viewer', { exact: true }).locator('xpath=../..'), n: 2, side: 'left' },
        ],
    },
    {
        name: 'open-a-log',
        auth: true,
        path: `/maps?${GWEN_VIEW}`,
        steps: [
            {
                name: 'open-a-log-1',
                alt: 'Step 1: the Layers card open on the right of the map, with Logs switched on in the Wells group',
                run: async (page) => {
                    await ready(page);
                    await logsOn(page, { card: true });
                    await mapIdle(page);
                    await parkPointer(page);
                    await noOwnWells(page);
                },
                annotate: [{ at: (page) => layerRow(page, 'Logs'), n: 1, side: 'left' }],
            },
            {
                name: 'open-a-log-2',
                alt: "Step 2: the popup of GWENDOLYN #2310D, a well with a digital log, its footer's More open on Logs, Documents, Land & owners and RRC GIS",
                run: async (page) => {
                    await page.getByRole('button', { name: 'Layers', exact: true }).click();
                    await page.waitForTimeout(800);
                    await parkPointer(page);
                    await mapIdle(page);
                    const popup = await hoverWell(page, GWEN.at, GWEN.tail);
                    await popup.locator('.qs-wp-more-t').click();
                    await popup.locator(H.popupLogs).waitFor({ timeout: 15_000 });
                    await page.waitForTimeout(600);
                    const b = await popup.boundingBox();
                    const at = await onPage(page, GWEN.at);
                    const clip = around(
                        { x: Math.min(b.x, at.x), y: Math.min(b.y, at.y), width: Math.max(b.x + b.width, at.x) - Math.min(b.x, at.x), height: Math.max(b.y + b.height, at.y) - Math.min(b.y, at.y) },
                        { left: 90, top: 60, right: 90, bottom: 60 },
                    );
                    await noOwnWells(page, clip);
                    return clip;
                },
                annotate: [{ at: `.qs-wp ${H.popupLogs}`, n: 2, side: 'bottom' }],
            },
            {
                name: 'open-a-log-3',
                alt: "Step 3: GWENDOLYN #2310D's log in the Log tab beside the map: the band with the well's name, API, LAS, regulatory and the logged depths, and the curve tracks below it",
                run: async (page) => {
                    await page.locator(`.qs-wp ${H.popupLogs}`).click();
                    await logReady(page);
                    await closePopup(page);
                    await widenTables(page);
                    await parkPointer(page);
                    await page.waitForTimeout(1_500);
                    return { x: 0, y: 0, width: VIEWPORT.width, height: await aboveTheChat(page) };
                },
                annotate: [{ at: H.tab('log'), n: 3, side: 'bottom' }],
            },
            {
                name: 'open-a-log-4',
                alt: 'Step 4: an interval chosen on the strip, 4,280 to 4,420 ft, its Top, Base and Thick over the strip and In the interval listing each curve below it',
                run: async (page) => {
                    // Taller, so the strip keeps some height above the interval's figures.
                    await page.setViewportSize({ width: VIEWPORT.width, height: 1250 });
                    await page.waitForTimeout(1_500);
                    await page.locator('[aria-label="Strip zoom"]').getByText('1×', { exact: true }).click();
                    await page.waitForTimeout(1_000);
                    await page.getByLabel('Top depth').fill('4280');
                    await page.getByLabel('Top depth').press('Enter');
                    await page.getByLabel('Base depth').fill('4420');
                    await page.getByLabel('Base depth').press('Enter');
                    await page.waitForTimeout(2_000);
                    // In the interval folds; open it if this account last left it folded (the preference is not saved).
                    const head = page.locator('button[aria-expanded]').filter({ hasText: 'In the interval' }).first();
                    if ((await head.getAttribute('aria-expanded')) === 'false') await head.click();
                    await page.waitForTimeout(2_500);
                    await parkPointer(page);
                    return logPanelClip(page);
                },
                annotate: [{ at: (page) => page.getByLabel('Top depth').locator('xpath=ancestor::div[.//input[@aria-label="Base depth"]][1]'), n: 4, side: 'left' }],
            },
        ],
    },
    {
        name: 'maps-logs-drawer',
        alt: 'The log drawer for a scanned log with no well under it: Well log, Open log, the note that its depth datum is approximate, and the log’s format, total depth, well type and surface elevation, beside the capsule on the map',
        auth: true,
        // A water well's scanned log (a BRACS TIFF) in Ector County: no RRC well dot under its capsule,
        // so the capsule itself takes the click, zoomed in.
        path: `/maps?${box(-102.66, 32.035, -102.595, 32.068)}`,
        run: async (page) => {
            await ready(page);
            await logsOn(page);
            await mapIdle(page);
            const LOG = [-102.62723922729492, 32.0515893436572];
            const at = await onPage(page, LOG);
            const under = await withMap(page, (map, p) => {
                const r = map.getContainer().getBoundingClientRect();
                const pt = [p.x - r.left, p.y - r.top];
                const hit = (map.getStyle()?.layers ?? []).map((l) => l.id).filter((id) => id.endsWith('-hit-detection') || id.endsWith('-well-laterals-clickable'));
                return { wells: map.queryRenderedFeatures(pt, { layers: hit }).length, logs: map.queryRenderedFeatures(pt, { layers: ['logs-points'] }).length };
            }, at);
            if (under.wells || !under.logs) throw new Error(`the capsule is not alone (wells ${under.wells}, logs ${under.logs})`);
            await page.mouse.click(at.x, at.y);
            await page.getByRole('link', { name: 'Open log' }).waitFor({ timeout: 30_000 });
            await page.waitForTimeout(2_000);
            await parkPointer(page);
            const facts = await page.getByText('Surface elevation', { exact: true }).first().boundingBox();
            const clip = { x: 72, y: 0, width: Math.min(VIEWPORT.width - 72, Math.ceil(at.x + 140 - 72)), height: Math.ceil(Math.max(facts.y + facts.height, at.y) + 60) };
            await noOwnWells(page, clip);
            return clip;
        },
        annotate: [{ at: (page) => page.getByRole('link', { name: 'Open log' }), n: 1, side: 'right' }],
    },
    {
        name: 'maps-logs-card',
        alt: "The Well logs block of GWENDOLYN #2310D's card: its logs with their top, base and source, the digital log first, and Cross section and Upload a log at its foot",
        auth: true,
        path: `/maps?${GWEN_VIEW}&api=${GWEN.api}`,
        run: async (page) => {
            await ready(page);
            await page.locator(H.card).waitFor({ timeout: 90_000 });
            const sec = page.locator('[aria-label="Row detail"] [data-block-frame="logs"]');
            await sec.waitFor({ timeout: 90_000 });
            await sec.scrollIntoViewIfNeeded();
            await sec.locator('tbody tr').first().waitFor({ timeout: 90_000 });
            await page.waitForTimeout(2_000);
            await greyEnterprise(page);
            await parkPointer(page);
            // Room on the left for the first badge.
            return around(await sec.boundingBox(), { left: 24, top: 8, right: 8, bottom: 8 });
        },
        annotate: [
            { at: '[aria-label="Row detail"] [data-block-frame="logs"] tbody tr', n: 1, side: 'left' },
            { at: (page) => page.locator('[aria-label="Row detail"] [data-block-frame="logs"]').getByRole('button', { name: 'Cross section', exact: true }), n: 2, side: 'left' },
        ],
    },
    {
        name: 'maps-logs-tool-menu',
        alt: "The Log tab's Tool menu open over the band: Pick interval (I), Pick tops (T), Add top (A) and Add interval",
        auth: true,
        path: `/maps?${GWEN_VIEW}`,
        run: async (page) => {
            await openGwendolynLog(page);
            await page.getByRole('button', { name: 'Tool', exact: true }).click();
            await page.getByText('Pick interval', { exact: true }).waitFor({ timeout: 15_000 });
            // The menu fades in: wait for it to be fully drawn.
            await page.waitForFunction(() => {
                const item = [...document.querySelectorAll('.mantine-Popover-dropdown')].find((d) => /Pick interval/.test(d.textContent ?? ''));
                return item && getComputedStyle(item).opacity === '1';
            }, null, { timeout: 15_000 });
            await page.waitForTimeout(1_000);
            return logPanelClip(page);
        },
        annotate: [{ at: (page) => page.getByRole('button', { name: 'Tool', exact: true }), n: 1, side: 'left' }],
    },
    {
        name: 'maps-logs-petrophysics',
        alt: "Petrophysics unfolded under GWENDOLYN #2310D's log: each zone's depths with its effective porosity, water saturation, shale volume and net pay",
        auth: true,
        path: `/maps?${GWEN_VIEW}`,
        run: async (page) => {
            await openGwendolynLog(page);
            const head = page.locator('button[aria-expanded]').filter({ hasText: 'Petrophysics' }).first();
            await head.waitFor({ timeout: 60_000 });
            if ((await head.getAttribute('aria-expanded')) === 'false') await head.click();
            await page.getByText('net pay', { exact: true }).first().waitFor({ timeout: 30_000 });
            await page.waitForTimeout(1_500);
            await parkPointer(page);
            return logPanelClip(page);
        },
        annotate: [{ at: (page) => page.locator('button[aria-expanded]').filter({ hasText: 'Petrophysics' }).first(), n: 1, side: 'top' }],
    },

    // ─── maps/cross-section ─────────────────────────────────────────────────────────────────
    {
        name: 'maps-xsection-panel',
        alt: 'A cross-section of four wells in Andrews County on Subsea, with Lithology on: the wells across the top, the ruler from A to A′, each formation carried from well to well, the Show row and the foot, and the wells ringed and joined by a dashed line on the map above',
        auth: true,
        path: `/maps?${SECTION_VIEW}`,
        allowWrites: TOPS_READS,
        run: async (page) => {
            await buildSection(page);
            await noOwnWells(page);
        },
        annotate: [
            { at: '[aria-label="Show the wells as"]', n: 1, side: 'bottom' },
            { at: '[class*="keyRow"]', n: 2, side: 'top', kind: 'box' },
            { at: '[aria-label="What the section is hung on"]', n: 3 },
        ],
    },
    {
        name: 'build-a-section',
        auth: true,
        path: `/maps?${SECTION_VIEW}`,
        allowWrites: TOPS_READS,
        steps: [
            {
                name: 'build-a-section-1',
                alt: 'Step 1: Cross section pressed on the right of the map, and the empty section panel below reading Click the first well on the map',
                run: async (page) => {
                    await startSection(page);
                    await parkPointer(page);
                    await noOwnWells(page);
                },
                annotate: [{ at: H.section, n: 1, side: 'left' }],
            },
            {
                name: 'build-a-section-2',
                alt: 'Step 2: three wells picked, ringed on the map and joined by a dashed line, and the bar at the bottom of the map previewing the tops of the well under the pointer',
                run: async (page) => {
                    await pickWells(page, SECTION_WELLS.slice(0, 3));
                    const at = await onPage(page, SECTION_WELLS[3]);
                    await page.mouse.move(at.x + 20, at.y + 20);
                    await page.mouse.move(at.x, at.y, { steps: 5 });
                    await page.waitForFunction(() => {
                        const hud = document.querySelector('[role="toolbar"][aria-label="Cross section"]');
                        return hud && /\d+ tops? ·/.test(hud.textContent ?? '');
                    }, null, { timeout: 60_000 });
                    await page.waitForTimeout(1_000);
                    await noOwnWells(page);
                },
                annotate: [{ at: '[role="toolbar"][aria-label="Cross section"] [class*="hudWell"]', n: 2, side: 'top' }],
            },
            {
                name: 'build-a-section-3',
                alt: 'Step 3: four wells picked from A to A′, and the bar at the bottom of the map with the count, Undo, Clear and Done',
                run: async (page) => {
                    await pickWells(page, SECTION_WELLS.slice(3));
                    await parkPointer(page);
                    await sectionRead(page, SECTION_WELLS.length);
                    await parkPointer(page);
                },
                annotate: [{ at: (page) => page.getByRole('toolbar', { name: 'Cross section' }).getByRole('button', { name: 'Done', exact: true }), n: 3, side: 'top' }],
            },
            {
                name: 'build-a-section-4',
                alt: 'Step 4: the section flattened on the San Andres, which every well shares: Flatten chosen beside Depth, the San Andres chip after on, and its top level across the four wells',
                run: async (page) => {
                    await page.getByRole('toolbar', { name: 'Cross section' }).getByRole('button', { name: 'Done', exact: true }).click();
                    await page.waitForTimeout(1_500);
                    await page.locator('[aria-label="What the section is hung on"]').getByText('Flatten', { exact: true }).click();
                    await page.waitForTimeout(1_500);
                    await page.getByRole('button', { name: 'San Andres', exact: true }).click();
                    await page.waitForTimeout(3_000);
                    await parkPointer(page);
                },
                annotate: [{ at: (page) => page.getByRole('button', { name: 'San Andres', exact: true }), n: 4 }],
            },
        ],
    },
    {
        name: 'maps-xsection-rock',
        alt: "The rock picker open on the San Andres at #136: the rock now and where it came from, This well, All 4 wells or the county, the nine rocks, and Back to the rock on file",
        auth: true,
        path: `/maps?${SECTION_VIEW}`,
        allowWrites: TOPS_READS,
        run: async (page) => {
            await buildSection(page);
            const at = await layerBetween(page, 'San Andres');
            if (!at) throw new Error('no San Andres layer between two wells');
            await page.mouse.click(at.x, at.y);
            await page.locator('[role="dialog"][aria-label*="rock at"]').waitFor({ timeout: 15_000 });
            await page.waitForTimeout(1_000);
            await parkPointer(page);
            const top = await panelTop(page);
            return { x: 72, y: Math.floor(top), width: VIEWPORT.width - 72, height: VIEWPORT.height - Math.floor(top) };
        },
        annotate: [
            { at: '[role="dialog"][aria-label*="rock at"] [aria-label="Set it on"]', n: 1, side: 'left' },
            { at: '[role="dialog"][aria-label*="rock at"] [class*="rockGrid"]', n: 2, side: 'left' },
        ],
    },
    {
        name: 'maps-xsection-pick-tops',
        alt: 'Pick tops on the section with the Queen armed: the picking row of formation chips and Done, each well’s Queen pick on its bore, and a faint mark where the neighbouring wells put the Queen in the one well without it',
        auth: true,
        path: `/maps?${SECTION_VIEW}`,
        allowWrites: TOPS_READS,
        run: async (page) => {
            await buildSection(page);
            await page.getByRole('button', { name: 'Pick tops', exact: true }).click();
            await page.locator('[data-chip]').first().waitFor({ timeout: 15_000 });
            await page.locator('[data-chip]').filter({ hasText: /^Queen$/ }).first().click();
            await page.locator('[data-pick-ghost]').first().waitFor({ timeout: 15_000 });
            await page.waitForTimeout(1_000);
            await parkPointer(page);
            const top = await panelTop(page);
            return { x: 72, y: Math.floor(top), width: VIEWPORT.width - 72, height: VIEWPORT.height - Math.floor(top) };
        },
        annotate: [
            { at: '[data-chip][aria-pressed="true"]', n: 1, side: 'top' },
            { at: '[data-pick-ghost]', n: 2, side: 'right' },
            { at: (page) => page.getByRole('button', { name: 'Done', exact: true }).last(), n: 3, side: 'top' },
        ],
    },
    {
        name: 'maps-xsection-new-record',
        alt: 'A new record marked by dragging down a bore: the New at #114 box with DST chosen among the kinds, Top and Base in ft MD, Recovered, the shut-in pressures, a note, More fields… and Add',
        auth: true,
        path: `/maps?${SECTION_VIEW}`,
        allowWrites: TOPS_READS,
        run: async (page) => {
            await buildSection(page);
            const bore = await page.locator('[data-bore]').nth(1).boundingBox();
            if (!bore) throw new Error('no second bore');
            const x = bore.x + bore.width / 2;
            const y0 = bore.y + bore.height * 0.62;
            await page.mouse.move(x, y0);
            await page.mouse.down();
            await page.mouse.move(x, y0 + 9, { steps: 6 });
            await page.mouse.up();
            await page.locator('[role="dialog"][aria-label^="A new record"]').waitFor({ timeout: 15_000 });
            await page.waitForTimeout(1_000);
            await parkPointer(page);
            const top = await panelTop(page);
            return { x: 72, y: Math.floor(top), width: VIEWPORT.width - 72, height: VIEWPORT.height - Math.floor(top) };
        },
        annotate: [
            { at: '[role="dialog"][aria-label^="A new record"] [class*="kindChips"]', n: 1, side: 'right' },
            { at: (page) => page.locator('[role="dialog"][aria-label^="A new record"]').getByRole('button', { name: 'More fields…' }), n: 2, side: 'bottom' },
        ],
    },

    // ─── maps/formation-tops ────────────────────────────────────────────────────────────────
    {
        name: 'maps-tops-card',
        alt: "The Formation tops block of KING, E. F. #12's card: eight tops from the Rustler to the Glorieta with MD, TVD, Subsea and Source, and Edit tops",
        auth: true,
        path: `/maps?${KING.view}&api=${KING.api}`,
        run: async (page) => {
            const sec = await kingCard(page, 'tops');
            await sec.locator('tbody tr').first().waitFor({ timeout: 60_000 });
            await greyEnterprise(page);
            await parkPointer(page);
            return around(await sec.boundingBox(), { left: 8, top: 8, right: 8, bottom: 8 });
        },
        annotate: [{ at: (page) => page.locator('[aria-label="Row detail"] [data-block-frame="tops"]').getByRole('button', { name: 'Edit tops' }), n: 1, side: 'left' }],
    },
    {
        name: 'maps-tops-layer',
        alt: 'Formation tops contouring the San Andres structure across Andrews County, with its options open: the formation, Structure, Isopach or Depth, whose picks, Only wells the map shows, Contour every, and the legend saying how many wells it was built from',
        auth: true,
        path: `/maps?${box(-103.0, 31.98, -102.3, 32.5)}`,
        allowWrites: TOPS_READS,
        run: async (page) => {
            await ready(page);
            await openMapControl(page, 'Layers');
            await layerRow(page, 'Formation tops').click();
            await page.waitForTimeout(1_000);
            const gear = page.getByRole('button', { name: 'Formation tops options', exact: true });
            if (!(await page.getByText('Contour every', { exact: true }).isVisible().catch(() => false))) await gear.click();
            const pick = page.locator('input[placeholder="Pick a formation"]');
            await pick.waitFor({ timeout: 30_000 });
            await page.waitForFunction(() => !/Reading the formations in view/.test(document.body.innerText), null, { timeout: 120_000 }).catch(() => {});
            await pick.click();
            await pick.fill('San Andres');
            await page.getByRole('option', { name: /^San Andres · / }).first().click();
            await page.getByText(/^From [\d,]+ wells/).first().waitFor({ timeout: 180_000 });
            await mapIdle(page);
            await page.waitForTimeout(2_000);
            await parkPointer(page);
            await noOwnWells(page);
        },
        annotate: [
            { at: 'input[placeholder="Pick a formation"]', n: 1, side: 'left' },
            { at: '[aria-label="What the contours show"]', n: 2, side: 'left' },
            { at: (page) => page.getByText(/^From [\d,]+ wells/).first(), n: 3, side: 'left' },
        ],
    },
    {
        name: 'maps-tops-editor',
        alt: "The Edit well data drawer on its Tops tab for KING, E. F. #12: Depths measured from, Your tops with two rows copied from the RRC and not yet saved, Add top, and the RRC's tops with Use as mine",
        auth: true,
        path: `/maps?${KING.view}&api=${KING.api}`,
        run: async (page) => {
            const sec = await kingCard(page, 'tops');
            await sec.getByRole('button', { name: 'Edit tops' }).click();
            const drawer = page.locator('.mantine-Drawer-content');
            await drawer.getByText('Depths measured from', { exact: true }).waitFor({ timeout: 30_000 });
            await drawer.getByRole('button', { name: 'Use as mine' }).first().waitFor({ timeout: 30_000 });
            // Two of the RRC's tops copied into Your tops: drafts on this page, never saved.
            for (const name of ['Yates', 'San Andres']) {
                const row = drawer.locator('[class*="readRow"]').filter({ hasText: new RegExp(`^${name}`) }).first();
                await row.getByRole('button', { name: 'Use as mine' }).click();
                await page.waitForTimeout(600);
            }
            // Use as mine scrolls the drawer to the row: back to the top, where Depths measured from is.
            await drawer.evaluate((el) => {
                for (const n of [el, ...el.querySelectorAll('*')]) if (n.scrollTop > 0) n.scrollTop = 0;
            });
            await page.waitForTimeout(1_000);
            await parkPointer(page);
            return around(await drawer.boundingBox(), { left: 2, top: 2, right: 2, bottom: 2 });
        },
        annotate: [
            { at: '#tops-datum', n: 1 },
            { at: (page) => page.locator('.mantine-Drawer-content').getByRole('button', { name: 'Add top' }), n: 2, side: 'right' },
            { at: (page) => page.locator('.mantine-Drawer-content').getByRole('button', { name: 'Use as mine' }).first(), n: 3, side: 'left' },
        ],
    },

    // ─── maps/depth-records ─────────────────────────────────────────────────────────────────
    // maps-depth-records-card is left as a marker: the card lists the account's and its team's
    // records only (the RRC's tests are left out of it), and the account has none to show.
    {
        name: 'maps-depth-records-editor',
        alt: 'The Records editor for KING, E. F. #12 with a DST being added: the kinds DST, Core, Test, Show, Note, Completion, Perforation, Treatment, Squeeze, Casing, Log run and Analysis, New kind…, then Top and Base, Name, Date, Formation as filed and the DST’s own fields',
        auth: true,
        path: `/maps?${KING.view}&api=${KING.api}`,
        run: async (page) => {
            const sec = await kingCard(page, 'intervals');
            await sec.getByRole('button', { name: /^(Add one|Edit)$/ }).first().click();
            const drawer = page.locator('.mantine-Drawer-content');
            await drawer.getByRole('button', { name: 'Add a DST' }).click();
            // Typed, never added.
            await page.locator('#iv-top').fill('4217');
            await page.locator('#iv-base').fill('4260');
            await page.waitForTimeout(800);
            await parkPointer(page);
            return around(await drawer.boundingBox(), { left: 2, top: 2, right: 2, bottom: 2 });
        },
        annotate: [
            { at: (page) => page.locator('.mantine-Drawer-content [class*="kindRow"]').first(), n: 1, side: 'top' },
            { at: (page) => page.locator('#iv-top').locator('xpath=..'), n: 2, side: 'left' },
            // Base is ringed with Top, under the one number.
            { at: (page) => page.locator('#iv-base').locator('xpath=..') },
        ],
    },
];
