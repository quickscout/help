// The place card and Ask, pages from Ask, My Wells and My Data.
// See the field list at the top of shots.mjs.
//
// Some shots here save something to picture it, and take it away again:
//   - The Ask walkthrough runs one real Ask turn, which costs credits: run it once, on purpose.
//     `ASK_DRY=1` rehearses it up to the question without sending it. Its thread is deleted after.
//   - That same answer publishes a page: its card is the walkthrough's last step (`pages-link-card`),
//     the next three shots picture the page, and `pages-cleanup` (a shot with no picture) moves it
//     to the trash.
//   - The My Wells shots add a HELP DEMO well and save one correction, in Reagan County, where no
//     other shot looks; each is removed in its shot's `after`.
// Whatever is saved is recorded with `recordFixture` first, and forgotten once it is gone.
//
// Not here: the workbook shots (that branch is not merged), and `pages-view-only`, which needs a
// signed-out session and a link-shared page.

import {
    around,
    BASE_URL,
    box,
    DEMO,
    FIND_MAP,
    fixtures,
    forgetFixture,
    greyEnterprise,
    H,
    mapIdle,
    mapSettled,
    MIDLAND,
    onPage,
    openMapControl,
    parkPointer,
    ready,
    recordFixture,
    rowsSteady,
    topOf,
    VIEWPORT,
    wellsInViewByCumOil,
    withMap,
} from '../lib.mjs';

const DRY = !!process.env.ASK_DRY;

// ─── local helpers: the live map ─────────────────────────────────────────────
// (copies of shots/chrome.mjs's, which it does not export)

/** `lnglat` in the middle of the map's uncovered part (left of an open card), at `zoom`. Opening a
 *  record from the URL leaves the camera where the box put it, which can be under the card. */
async function frameAt(page, lnglat, zoom) {
    const card = await page.locator(H.card).first().boundingBox({ timeout: 2_000 }).catch(() => null);
    await withMap(
        page,
        (map, a) => {
            const r = map.getContainer().getBoundingClientRect();
            const right = a.cardLeft ? a.cardLeft - r.left : r.width;
            map.easeTo({ center: a.ll, zoom: a.zoom, offset: [right / 2 - r.width / 2, 0], duration: 0 });
        },
        { ll: lnglat, zoom, cardLeft: card?.x ?? null },
    );
    await mapIdle(page);
    await page.waitForTimeout(1_500);
}

/** A fixed, invisible element over a region of the page, for an annotation to point at. */
async function marker(page, id, b) {
    await page.evaluate(({ id, b }) => {
        document.getElementById(id)?.remove();
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText = `position:fixed;left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px;pointer-events:none;`;
        document.body.appendChild(el);
    }, { id, b });
}

/** A tall window, for a card that runs past 900 px; a short one, for a grid of one row. */
const TALL = { width: VIEWPORT.width, height: 1240 };
const SHORT = { width: VIEWPORT.width, height: 600 };

/** A marker over the union of several elements' boxes; returns that box. */
async function unionMarker(page, id, locators) {
    const boxes = [];
    for (const l of locators) {
        const b = await l.boundingBox({ timeout: 5_000 }).catch(() => null);
        if (b) boxes.push(b);
    }
    if (!boxes.length) throw new Error(`nothing to mark for ${id}`);
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const u = { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
    await marker(page, id, u);
    return u;
}

async function waitEnabled(locator, ms = 90_000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
        if (await locator.isEnabled().catch(() => false)) return;
        await locator.page().waitForTimeout(500);
    }
    throw new Error('never became usable');
}

// ─── local helpers: the account's data, for tidying up ───────────────────────
// Reads, and the deletes the app's own buttons make, sent with the page's sign-in. The shot's
// `allowWrites` decides what gets through.

/** The API's origin, off the requests the page has made (the dev app's API is on another port). */
async function apiOrigin(page) {
    return page.evaluate(() => {
        const hit = performance
            .getEntriesByType('resource')
            .map((e) => e.name)
            .find((n) => /\/api\/v1\//.test(n) && !n.startsWith(location.origin));
        return hit ? new URL(hit).origin : null;
    });
}

async function api(page, method, path) {
    let origin = await apiOrigin(page).catch(() => null);
    if (!origin) {
        await page.goto(`${BASE_URL}/maps?${REAGAN}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await mapSettled(page);
        origin = await apiOrigin(page);
    }
    if (!origin) throw new Error('the API origin is not known');
    return page.evaluate(
        async ({ origin, method, path }) => {
            const token = await window.Clerk?.session?.getToken();
            const r = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${token}` } });
            const text = await r.text();
            let body = null;
            try {
                body = JSON.parse(text);
            } catch {
                body = null;
            }
            return { status: r.status, body };
        },
        { origin, method, path },
    );
}

// The account's own corrections: never touched, whatever a match says.
const NOT_OURS = new Set(['w1013636', 'w1013666', 'w1013667']);

async function ownWells(page) {
    const r = await api(page, 'GET', '/api/v1/well-edits/wells?since_version=0&limit=1000');
    if (r.status !== 200) throw new Error(`reading My Wells: ${r.status}`);
    return r.body?.wells ?? [];
}

const leaseOf = (w) => String(w.props?.lease_name ?? w.overrides?.lease_name ?? '');

/** Removes the account's wells that `match`: a well it added is deleted, a correction goes back to the RRC. */
async function removeOwnWells(page, match) {
    const hits = (await ownWells(page)).filter(match);
    for (const w of hits) {
        if (NOT_OURS.has(w.ref)) throw new Error(`refusing to touch ${w.ref}: it is the account's own`);
        const r = await api(page, 'DELETE', `/api/v1/well-edits/wells/${encodeURIComponent(w.ref)}`);
        if (r.status >= 300 && r.status !== 404) throw new Error(`removing ${w.ref}: ${r.status}`);
    }
    const left = (await ownWells(page)).filter(match);
    if (left.length) throw new Error(`still there: ${left.map((w) => w.ref).join(', ')}`);
    return hits.length;
}

// ─── the Ask column ──────────────────────────────────────────────────────────

const ASK_ONLY = /\/api\/v1\/map\/chats?\b/;
const column = (page) => page.locator(H.askColumn);
const askBox = (page) => column(page).getByLabel('Ask about this view');

async function openAsk(page) {
    if (!(await column(page).isVisible().catch(() => false))) await page.locator(H.ask).click();
    await column(page).waitFor({ timeout: 30_000 });
    await waitEnabled(askBox(page));
}

/** Sends `question` and waits for the whole answer: Stop comes and goes, then the folded trail. */
async function ask(page, question, ms = 480_000) {
    if (DRY) throw new Error('ASK_DRY: stopping before the question is sent');
    await askBox(page).fill(question);
    await askBox(page).press('Enter');
    const stop = column(page).getByRole('button', { name: 'Stop', exact: true });
    await stop.waitFor({ timeout: 60_000 });
    await stop.waitFor({ state: 'detached', timeout: ms });
    await column(page).getByRole('button', { name: /^Worked/ }).last().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(3_000);
}

/** Every Ask thread named "Help demo…", deleted through History; then none is left there. */
async function deleteDemoThreads(page) {
    if (!/\/maps/.test(page.url())) {
        await page.goto(`${BASE_URL}/maps?${MIDLAND}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await mapSettled(page);
    }
    await page.keyboard.press('Escape').catch(() => {});
    await openAsk(page);
    const list = page.locator('[aria-label="Saved threads"]');
    for (let i = 0; i < 6; i++) {
        await column(page).getByRole('button', { name: 'History', exact: true }).click();
        await list.waitFor({ timeout: 30_000 });
        await page.waitForFunction(() => document.querySelector('[aria-label="Saved threads"]')?.getAttribute('aria-busy') === 'false', null, { timeout: 30_000 }).catch(() => {});
        const trash = list.getByRole('button', { name: new RegExp(`^Delete ${DEMO}`) }).first();
        if (!(await trash.isVisible().catch(() => false))) {
            await page.keyboard.press('Escape');
            break;
        }
        await trash.click();
        await list.getByRole('button', { name: 'Delete', exact: true }).click();
        await page.waitForTimeout(2_500);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
    }
    const r = await api(page, 'GET', '/api/v1/map/chats');
    const left = (r.body?.discussions ?? []).filter((d) => `${d.title ?? ''} ${d.first_message ?? ''}`.trim().startsWith(DEMO));
    if (left.length) throw new Error(`${left.length} Help demo thread(s) still in History`);
    forgetFixture({ kind: 'thread' });
    console.log('    · Help demo threads deleted');
}

/** Every label the agent wrote on the map, in page px, lowest number first: its numbered marks
 *  ('agent-marks-label', which open their record on a click) or its ranked wells
 *  ('agent-well-ranks-label', which take no click: the well under one does). Each with the point it
 *  labels, and whether that point is on open map (not under the chrome). Read off the rendered labels. */
async function agentLabels(page) {
    return withMap(page, (map) => {
        const layers = ['agent-marks-label', 'agent-well-ranks-label'].filter((id) => map.getLayer(id));
        if (!layers.length) return [];
        const r = map.getContainer().getBoundingClientRect();
        const c = map.getCanvas().getBoundingClientRect();
        const groups = new Map();
        for (let y = 8; y < c.height - 8; y += 4) {
            for (let x = 8; x < c.width - 8; x += 4) {
                const f = map.queryRenderedFeatures([x, y], { layers })[0];
                if (!f) continue;
                const p = f.properties ?? {};
                const key = `${f.layer.id}|${p.set ?? ''}|${p.i ?? p.rank ?? ''}`;
                let g = groups.get(key);
                if (!g) {
                    const ll = f.geometry?.type === 'Point' ? f.geometry.coordinates : null;
                    const at = ll ? map.project(ll) : null;
                    const point = at ? { x: r.left + at.x, y: r.top + at.y } : null;
                    const el = point ? document.elementFromPoint(point.x, point.y) : null;
                    g = {
                        layer: f.layer.id,
                        n: Number(p.n ?? p.rank ?? 0),
                        name: String(p.label ?? p.name ?? ''),
                        point,
                        open: !!el && !!el.closest('.mapboxgl-canvas-container'),
                        xs: [],
                        ys: [],
                    };
                    groups.set(key, g);
                }
                g.xs.push(x);
                g.ys.push(y);
            }
        }
        return [...groups.values()]
            .map((g) => {
                const x0 = Math.min(...g.xs);
                const y0 = Math.min(...g.ys);
                return { layer: g.layer, n: g.n, name: g.name, point: g.point, open: g.open, x: r.left + x0 - 2, y: r.top + y0 - 2, width: Math.max(...g.xs) - x0 + 4, height: Math.max(...g.ys) - y0 + 4 };
            })
            .sort((a, b) => a.n - b.n);
    });
}

/** The labels step 3 found, for step 4 to open one. */
let foundLabels = [];

/** The open card closed by its ✕ (Esc when there is none). */
async function closeCard(page) {
    await page
        .locator(H.card)
        .first()
        .getByRole('button', { name: 'Close the card', exact: true })
        .click({ timeout: 5_000 })
        .catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(1_000);
}

/** Until the camera has held still for two seconds: an answer's fit can land after its text. */
async function cameraStill(page, ms = 30_000) {
    const until = Date.now() + ms;
    let last = '';
    let still = 0;
    while (Date.now() < until && still < 4) {
        await page.waitForTimeout(500);
        const now = await withMap(page, (map) => JSON.stringify([map.getCenter().toArray(), map.getZoom()]));
        still = now === last ? still + 1 : 0;
        last = now;
    }
    await mapIdle(page);
}

/** A well's name as the card and the labels both spell it: a mark writes `3601H` where the card has `#3601H`. */
const plainName = (s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** Opens the card of a well the answer named: a mark's label opens its record; a ranked well opens
 *  from the well itself, whose click pins its popup, and the popup's View well opens the card. Kept
 *  only when the card is that well's. Returns its name, or null. */
async function openNamedCard(page) {
    for (const label of foundLabels) {
        const name = plainName(label.name.split('·').pop());
        if (!name) continue;
        if (label.layer === 'agent-marks-label') await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
        else if (label.point && label.open) {
            await page.mouse.click(label.point.x, label.point.y);
            const view = page.locator(H.popupViewWell).first();
            if (await view.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)) await view.click();
        } else continue;
        const card = page.locator(H.card).first();
        if (!(await card.waitFor({ timeout: 12_000 }).then(() => true).catch(() => false))) continue;
        await page.waitForTimeout(1_500);
        if (plainName(await card.innerText()).includes(name)) return name;
        await closeCard(page);
    }
    return null;
}

// ─── pages from Ask ──────────────────────────────────────────────────────────

const PAGE_TITLE = `${DEMO} — Top oil wells in view`;
// One turn does both: the walkthrough pictures what it does to the map, and its page is the one
// the page shots picture.
const THREAD_QUESTION = `${DEMO}: mark the five wells in view that have made the most oil, with each one's operator. Then publish a one-page report on them titled “${PAGE_TITLE}”, with a short summary, a production chart and a table, without asking me first.`;

/** The Help demo page `pages-link-card` made, by its recorded slug. */
function demoPage() {
    const found = fixtures().find((f) => f.kind === 'page' && f.slug);
    if (!found) throw new Error('no Help demo page recorded: run pages-link-card first');
    return found;
}

async function openDemoPage(page) {
    const { slug } = demoPage();
    await page.goto(`${BASE_URL}/artifacts/${encodeURIComponent(slug)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('button', { name: /^Share/ }).waitFor({ timeout: 90_000 });
    const title = (await page.locator('header [class*="title"]').first().textContent())?.trim() ?? '';
    if (!title.startsWith(DEMO)) throw new Error(`the recorded page is "${title}", not a Help demo page`);
    // The page itself is in a frame: give its charts and map a moment.
    await page.locator('iframe').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(10_000);
}

/** The page's chat folded away. On a page made through Ask it never stops loading (the app resumes the
 *  conversation with a read its own re-render cancels), so the pictures leave it closed; its button
 *  stays in the bar. */
async function hideChat(page) {
    const chat = page.locator('aside[aria-label="Ask about this page"]');
    if (await chat.isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Hide the chat' }).click();
        await chat.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(1_500);
    }
}

const shareDialog = (page) => page.getByRole('dialog').filter({ hasText: 'People with access' });

/** The Share dialog, and its General access menu while that is open: the page behind is not the picture. */
async function dialogClip(page) {
    const boxes = [await shareDialog(page).boundingBox().catch(() => null)];
    if (await page.getByRole('listbox').last().isVisible().catch(() => false)) boxes.push(await page.getByRole('listbox').last().boundingBox());
    const real = boxes.filter(Boolean);
    if (!real.length) throw new Error('the Share dialog is not on screen');
    const x = Math.min(...real.map((b) => b.x));
    const y = Math.min(...real.map((b) => b.y));
    const u = { x, y, width: Math.max(...real.map((b) => b.x + b.width)) - x, height: Math.max(...real.map((b) => b.y + b.height)) - y };
    return around(u, { left: 48, right: 56, top: 24, bottom: 24 });
}

// ─── My Wells ────────────────────────────────────────────────────────────────

// Reagan County, south of every other shot's view: the HELP DEMO well and the one correction live
// here while their shots run.
const REAGAN = box(-101.505, 31.18, -101.395, 31.245);
// SCOTT #3 (Miltex Oil), a producing vertical oil well at Big Lake: the well the correction is saved on.
const SCOTT = { api: '4238332482', api8: '38332482', at: [-101.42681, 31.21131], view: box(-101.47, 31.195, -101.40, 31.228) };
const isDemoWell = (w) => w.origin === 'user' && /^HELP DEMO$/i.test(leaseOf(w));
const isScott = (w) => w.origin === 'rrc' && String(w.props?.api ?? '') === SCOTT.api8;

const findWell = (page) => page.getByLabel('Find one of your wells');

/** The well card's Edit (Edit · 3 once values are yours): the card's own verb, ahead of a block's Edit. */
const editButton = (page) => page.locator(H.card).getByRole('button', { name: /^Edit( · \d+)?$/ }).first();

/** The account's own corrected wells, by name: a picture is never taken with one of them on screen. */
const OWN_NAMES = /HENDERSON|WHEELER/i;
async function noOwnCorrections(page, where) {
    const text = await where.innerText().catch(() => '');
    if (OWN_NAMES.test(text)) throw new Error('the account’s own corrected wells are on screen: not capturing');
}

/** My Data → My wells, from the left rail: Open on the My wells row (Formation tops has its own). */
async function openMyWellsHome(page) {
    await page.locator(H.navMyData).click();
    await page
        .locator('[class*="wellsRow"]')
        .filter({ hasText: 'My wells' })
        .getByRole('button', { name: /^open$/i })
        .click({ timeout: 60_000 });
    await findWell(page).waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1_500);
}

/** A spot on open ground in the map's uncovered part: no well drawn within 30 px. */
async function openGround(page) {
    return withMap(page, (map) => {
        const r = map.getContainer().getBoundingClientRect();
        const uncovered = (x, y) => {
            const el = document.elementFromPoint(r.left + x, r.top + y);
            return !!el && !!el.closest('.mapboxgl-canvas-container');
        };
        const wells = map.getStyle().layers.filter((l) => /well|permit/i.test(l.id)).map((l) => l.id);
        const c = map.getCanvas().getBoundingClientRect();
        let best = null;
        for (let y = 140; y < c.height - 140; y += 24) {
            for (let x = 160; x < c.width - 160; x += 24) {
                if (!uncovered(x, y)) continue;
                if (map.queryRenderedFeatures([[x - 30, y - 30], [x + 30, y + 30]], { layers: wells }).length) continue;
                const d = Math.hypot(x - c.width * 0.6, y - c.height * 0.5);
                if (!best || d < best.d) best = { x, y, d };
            }
        }
        return best ? { x: r.left + best.x, y: r.top + best.y } : null;
    });
}

/** The whole window but the left rail: its badges count the account's own things. */
const NO_RAIL = { x: 72, y: 0, width: VIEWPORT.width - 72, height: VIEWPORT.height };

/** The answer's map line in the Ask column. */
const mapLine = (page) => column(page).locator('[class*="mapLine"]:not([class*="mapLineLabel"]):not([class*="mapLineMore"])').last();

const STEP_4_WITH_CARD = 'Step 4: the follow-up questions under the answer, and the card of a well the answer named, opened from the map';
const STEP_4_FOLLOW_UPS = 'Step 4: the follow-up questions under the answer';
const STEP_4 = {
    name: 'ask-the-view-4',
    alt: STEP_4_WITH_CARD,
    run: async (page) => {
        // Where the labels are now: the map can have moved since step 3 read them.
        await cameraStill(page);
        foundLabels = await agentLabels(page);
        const opened = await openNamedCard(page);
        // The picture says what it shows: with the card, or the follow-ups alone.
        STEP_4.alt = opened ? STEP_4_WITH_CARD : STEP_4_FOLLOW_UPS;
        if (opened) {
            await page.waitForFunction(() => !document.querySelector('[aria-label="Row detail"] [class*="keleton"]'), null, { timeout: 90_000 }).catch(() => {});
            await page.waitForTimeout(2_000);
        }
        const follow = column(page).locator('[aria-label="Follow-up questions"]');
        if (await follow.isVisible().catch(() => false)) await follow.scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);
        await greyEnterprise(page);
        await parkPointer(page);
        return NO_RAIL;
    },
    annotate: async (page) => {
        const follow = column(page).locator('[aria-label="Follow-up questions"]');
        const marks = [];
        if (await follow.isVisible().catch(() => false)) marks.push({ at: () => follow, n: 4, side: 'left' });
        else marks.push({ at: (p) => askBox(p), n: 4, side: 'left' });
        if (await page.locator(H.card).first().isVisible().catch(() => false)) marks.push({ at: (p) => p.locator(H.card).first(), pad: 2 });
        return marks;
    },
};

// ─── the shots ───────────────────────────────────────────────────────────────

export default [
    // ─── The place card (maps/ask-the-map.mdx) ───────────────────────────────────
    {
        name: 'place-panel',
        alt: 'The place card: the size of the view with Zoom to county and View county, two questions to ask, the leases in view ranked by boe/d and counted whole, and the busiest operators and fields',
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            // Taller than the usual window, so the whole card shows, down to All production in view.
            await page.setViewportSize(TALL);
            await ready(page);
            await page.locator(H.place).click();
            const card = page.getByRole('dialog', { name: 'This view' });
            await card.waitFor({ timeout: 30_000 });
            // The leases listed (not their skeletons), then the busiest operators and fields.
            await card.locator('[aria-label^="Leases in view"]:not([data-pending]) button[title^="Open "]').first().waitFor({ timeout: 120_000 });
            await card.getByText('Busiest here').waitFor({ timeout: 60_000 });
            await page.waitForTimeout(3_000);
            await parkPointer(page);
            const control = await page.locator('[role="group"][aria-label="Map place context"]').boundingBox();
            const at = await card.boundingBox();
            const top = Math.min(control.y, at.y);
            const left = Math.min(control.x, at.x);
            const union = { x: left, y: top, width: Math.max(control.x + control.width, at.x + at.width) - left, height: at.y + at.height - top };
            return around(union, { left: 160, right: 160, top: 12, bottom: 24 }, TALL);
        },
    },

    // ─── Ask a question (maps/ask-the-map.mdx) ───────────────────────────────────
    // One Ask turn. Its thread is deleted from History afterwards.
    {
        name: 'ask-the-view',
        auth: true,
        path: `/maps?${MIDLAND}`,
        allowWrites: ASK_ONLY,
        steps: [
            {
                name: 'ask-the-view-1',
                alt: 'Step 1: the Ask column opened beside the map over Midland County, empty, with its introduction and suggested questions above the question box, and Ask on the right side of the map',
                run: async (page) => {
                    await ready(page);
                    await openAsk(page);
                    await column(page).locator('[aria-label="Suggested questions"]').waitFor({ timeout: 30_000 }).catch(() => {});
                    await page.waitForTimeout(1_500);
                    await parkPointer(page);
                    return NO_RAIL;
                },
                annotate: [
                    { at: H.ask, n: 1, side: 'left' },
                    { at: (page) => askBox(page), pad: 6 },
                ],
            },
            {
                name: 'ask-the-view-2',
                alt: 'Step 2: a question typed in the Ask column’s box, ready to send',
                run: async (page) => {
                    await askBox(page).fill(THREAD_QUESTION);
                    await page.waitForTimeout(800);
                    await parkPointer(page);
                    return NO_RAIL;
                },
                annotate: [
                    { at: (page) => askBox(page), n: 2, pad: 6 },
                    { at: (page) => column(page).getByRole('button', { name: 'Send', exact: true }) },
                ],
            },
            {
                name: 'ask-the-view-3',
                alt: 'Step 3: the answer in the Ask column, with the Worked row and the line naming what it did to the map, with Undo; on the map, the labels it wrote beside the wells it named',
                run: async (page) => {
                    recordFixture({ kind: 'thread', title: THREAD_QUESTION });
                    recordFixture({ kind: 'page', title: PAGE_TITLE });
                    await ask(page, THREAD_QUESTION, 600_000);
                    // The page it published, if it did: recorded at once, so it is tidied whatever happens next.
                    const open = column(page).getByRole('link', { name: 'Open page' }).last();
                    if (await open.isVisible().catch(() => false)) {
                        const href = await open.getAttribute('href');
                        const slug = decodeURIComponent(href.split('/artifacts/')[1].split(/[?#]/)[0]);
                        forgetFixture({ kind: 'page', title: PAGE_TITLE });
                        recordFixture({ kind: 'page', slug, title: PAGE_TITLE });
                    }
                    await page.waitForTimeout(4_000);
                    await cameraStill(page);
                    foundLabels = await agentLabels(page);
                    if (foundLabels[0]) await marker(page, 'shot-agent-label', foundLabels[0]);
                    // The top of the answer: the folded trail and the map line under it.
                    await mapLine(page).scrollIntoViewIfNeeded();
                    await column(page).getByRole('button', { name: /^Worked/ }).last().scrollIntoViewIfNeeded();
                    await page.waitForTimeout(800);
                    await parkPointer(page);
                    return NO_RAIL;
                },
                annotate: async (page) => {
                    const marks = [{ at: (p) => mapLine(p), n: 3, side: 'left' }];
                    if (await page.locator('#shot-agent-label').count()) marks.push({ at: '#shot-agent-label', pad: 6 });
                    return marks;
                },
            },
            STEP_4,
            {
                name: 'ask-the-view-5',
                alt: 'Step 5: the Ask row at the bottom of the map, with the question and Undo, and New thread in the Ask column’s header',
                run: async (page) => {
                    // The card goes, so the row and the header are in view.
                    if (await page.locator(H.card).first().isVisible().catch(() => false)) await closeCard(page);
                    await page.locator(H.agentRow).waitFor({ timeout: 30_000 });
                    await parkPointer(page);
                    return NO_RAIL;
                },
                annotate: [
                    { at: (page) => page.locator(H.agentRow).getByRole('button', { name: 'Undo', exact: true }), n: 5, side: 'top' },
                    { at: (page) => column(page).getByRole('button', { name: 'New thread', exact: true }) },
                ],
            },
            {
                // maps/pages.mdx: the card of the page the same answer published.
                name: 'pages-link-card',
                alt: 'The card of the page an Ask answer published: its name and description, Edit here, Open page and the new-tab icon',
                run: async (page) => {
                    const open = column(page).getByRole('link', { name: 'Open page' }).last();
                    await open.waitFor({ timeout: 10_000 });
                    // The column at its widest (End on its edge), so the card's name has room, and
                    // the card mid-column, with the end of the answer above it.
                    const seam = page.getByRole('separator', { name: 'Resize the Ask column' });
                    if (await seam.isVisible().catch(() => false)) {
                        await seam.focus().catch(() => {});
                        await page.keyboard.press('End').catch(() => {});
                        await page.waitForTimeout(800);
                    }
                    await open.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => open.scrollIntoViewIfNeeded());
                    await page.waitForTimeout(1_000);
                    await parkPointer(page);
                    const card = await open.locator('xpath=ancestor::div[contains(@class,"mantine-Paper-root")][1]').boundingBox();
                    const col = await column(page).boundingBox();
                    const top = Math.max(col.y, card.y - 220);
                    return { x: Math.floor(col.x), y: Math.floor(top), width: Math.ceil(col.width), height: Math.min(VIEWPORT.height - Math.floor(top), Math.ceil(card.y + card.height + 24 - top)) };
                },
                annotate: [
                    { at: (page) => column(page).getByRole('link', { name: 'Open page' }).last(), n: 1, side: 'bottom' },
                    { at: (page) => column(page).getByRole('button', { name: 'Edit here' }).last(), n: 2, side: 'bottom' },
                ],
            },
        ],
        after: async (page) => {
            if (fixtures().some((f) => f.kind === 'thread')) await deleteDemoThreads(page);
            // A page that never got a slug was never published.
            for (const f of fixtures().filter((f) => f.kind === 'page' && !f.slug)) forgetFixture({ kind: 'page', title: f.title });
        },
    },

    // ─── Pages from Ask (maps/pages.mdx) ─────────────────────────────────────────
    // One Ask turn makes the page. Its thread is deleted here; the page stays for the next three
    // shots, and `pages-cleanup` moves it to the trash.
    {
        name: 'pages-viewer',
        alt: 'The Help demo page open: the bar with Back to the map, the title, Private · only you, the version button, Copy link, Open in a new tab, Ask about this page, More and Share; under it, the page itself',
        auth: true,
        path: '/artifacts',
        run: async (page) => {
            await openDemoPage(page);
            await hideChat(page);
            await parkPointer(page);
            // Down to the page's first chart: the summary, the figures and the map say what a page is.
            const frame = page.frames().find((f) => f !== page.mainFrame());
            const chart = frame ? await frame.locator('h2, h3').filter({ hasText: /production/i }).first().boundingBox().catch(() => null) : null;
            const bottom = chart ? Math.floor(chart.y - 16) : VIEWPORT.height;
            return { x: 0, y: 0, width: VIEWPORT.width, height: Math.max(420, Math.min(VIEWPORT.height, bottom)) };
        },
        annotate: [
            // Right of the chip, where the bar is empty: below it is the page's own title.
            { at: '[class*="accessChip"]', n: 1, side: 'right' },
            { at: (page) => page.getByRole('button', { name: /^v\d+/ }), n: 2, side: 'left' },
            { at: (page) => page.getByRole('button', { name: 'More', exact: true }), n: 3, side: 'bottom' },
            { at: (page) => page.getByRole('button', { name: /^Share/ }), n: 4, side: 'bottom' },
        ],
    },
    {
        // Filled with example.com addresses only. Share is never pressed, and General access is only
        // looked at: nothing here is saved (every write stays blocked).
        name: 'share-a-page',
        auth: true,
        path: '/artifacts',
        steps: [
            {
                name: 'share-a-page-1',
                alt: 'Step 1: the Help demo page’s bar, with Share at the top right',
                run: async (page) => {
                    await openDemoPage(page);
                    await hideChat(page);
                    await parkPointer(page);
                    return { x: 0, y: 0, width: VIEWPORT.width, height: 260 };
                },
                annotate: [{ at: (page) => page.getByRole('button', { name: /^Share/ }), n: 1, side: 'bottom' }],
            },
            {
                name: 'share-a-page-2',
                alt: 'Step 2: the Share dialog with two example addresses added, and the Viewer or Editor menu beside them',
                run: async (page) => {
                    await page.getByRole('button', { name: /^Share/ }).click();
                    const dialog = shareDialog(page);
                    await dialog.waitFor({ timeout: 30_000 });
                    const people = dialog.getByLabel('Add people by email');
                    await people.click();
                    await people.pressSequentially('jane@example.com,', { delay: 25 });
                    await people.pressSequentially('sam@example.com,', { delay: 25 });
                    await dialog.getByText('Notify people').waitFor({ timeout: 10_000 });
                    await page.waitForTimeout(600);
                    await parkPointer(page);
                    return dialogClip(page);
                },
                annotate: [
                    { at: (page) => shareDialog(page).getByLabel('Add people by email').locator('xpath=ancestor::div[contains(@class,"mantine-TagsInput-root")][1]'), n: 2, pad: 4 },
                    { at: (page) => shareDialog(page).getByLabel('Role for the people you add') },
                ],
            },
            {
                name: 'share-a-page-3',
                alt: 'Step 3: Notify people ticked, a short message, and the Share button that sends the invitations',
                run: async (page) => {
                    await shareDialog(page).getByPlaceholder('Message (optional)').fill('Here is the page on the top oil wells we talked about.');
                    await page.waitForTimeout(600);
                    await parkPointer(page);
                    return dialogClip(page);
                },
                annotate: [
                    { at: (page) => shareDialog(page).getByRole('button', { name: 'Share', exact: true }), n: 3, side: 'left' },
                    { at: (page) => shareDialog(page).getByLabel('Notify people').locator('xpath=ancestor::div[contains(@class,"mantine-Checkbox-root")][1]'), pad: 4 },
                ],
            },
            {
                name: 'share-a-page-4',
                alt: 'Step 4: the General access menu open: Restricted, Project, Organization and Anyone with the link, each with who it lets in',
                run: async (page) => {
                    await shareDialog(page).getByLabel('General access').click();
                    await page.getByRole('option', { name: /Anyone with the link/ }).waitFor({ timeout: 10_000 });
                    await page.waitForTimeout(600);
                    await parkPointer(page);
                    return dialogClip(page);
                },
                annotate: [{ at: (page) => page.getByRole('listbox').last(), n: 4, side: 'right' }],
            },
            {
                name: 'share-a-page-5',
                alt: 'Step 5: the foot of the Share dialog, with People with access, General access still Restricted, Copy link and Done',
                run: async (page) => {
                    // Closed without choosing: the setting stays as it was.
                    await page.keyboard.press('Escape');
                    await page.waitForTimeout(600);
                    if (!(await shareDialog(page).isVisible().catch(() => false))) throw new Error('the Share dialog closed with the menu');
                    await parkPointer(page);
                    return dialogClip(page);
                },
                annotate: [
                    { at: (page) => shareDialog(page).getByRole('button', { name: 'Copy link' }), n: 5, side: 'left' },
                    { at: (page) => shareDialog(page).getByRole('button', { name: 'Done', exact: true }) },
                ],
            },
        ],
    },
    {
        name: 'pages-index',
        alt: 'Your pages at /artifacts on the Mine tab, searched for “Help demo”: the Help demo page with its description, Restricted and its date, under Mine, Shared with me and Trash',
        auth: true,
        path: '/artifacts',
        run: async (page) => {
            await page.getByRole('heading', { name: 'Your pages' }).waitFor({ timeout: 60_000 });
            // The list read first: a search typed before the page has come to life is wiped by it.
            await page.getByText(PAGE_TITLE).first().waitFor({ timeout: 60_000 });
            await page.waitForTimeout(1_500);
            // Only the help's page: the account's own pages stay out of frame, and the picture is not
            // taken while any other row is listed.
            const search = page.getByLabel('Search pages');
            await search.fill(DEMO);
            const onlyOurs = () =>
                page.waitForFunction(
                    (demo) => {
                        const rows = [...document.querySelectorAll('a[href^="/artifacts/"], [class*="row"]')].filter((el) => el.querySelector('[class*="rowTitle"]'));
                        return rows.length > 0 && rows.every((el) => el.querySelector('[class*="rowTitle"]').textContent.trim().startsWith(demo));
                    },
                    DEMO,
                    { timeout: 15_000 },
                );
            if (!(await onlyOurs().then(() => true).catch(() => false))) {
                await search.fill('');
                await search.pressSequentially(DEMO, { delay: 40 });
                await onlyOurs();
            }
            if ((await search.inputValue()) !== DEMO) throw new Error('the search did not take: not capturing the account’s own pages');
            await page.waitForTimeout(1_000);
            await parkPointer(page);
            const content = await page.getByRole('heading', { name: 'Your pages' }).locator('xpath=ancestor::div[2]').boundingBox();
            return around({ ...content, height: Math.min(content.height, 420) }, { left: 24, right: 24, top: 24, bottom: 24 });
        },
        annotate: [
            { at: (page) => page.getByRole('radiogroup').first(), n: 1, side: 'left' },
            { at: (page) => page.getByLabel('Search pages'), n: 2, side: 'right' },
        ],
    },
    {
        // No picture: moves the Help demo page to the trash once the shots above have it, and makes
        // sure no Help demo thread is left. Its `after` does the work.
        name: 'pages-cleanup',
        auth: true,
        path: '/artifacts',
        allowWrites: /\/api\/v1\/artifacts\/[^/]+$/,
        steps: [],
        after: async (page) => {
            const recorded = fixtures().find((f) => f.kind === 'page' && f.slug);
            if (recorded) {
                await openDemoPage(page);
                await page.getByRole('button', { name: 'More', exact: true }).click();
                await page.getByRole('menuitem', { name: 'Move to trash' }).click();
                await page.getByRole('dialog', { name: 'Move this page to the trash?' }).getByRole('button', { name: 'Move to trash' }).click();
                await page.getByText(/This page is in your trash/).waitFor({ timeout: 30_000 });
                forgetFixture({ kind: 'page' });
                console.log(`    · moved ${recorded.slug} to the trash`);
            }
            if (fixtures().some((f) => f.kind === 'thread')) await deleteDemoThreads(page);
        },
    },

    // ─── Fix a value on a well (maps/my-wells.mdx) ───────────────────────────────
    // Saves one correction (Total depth) on SCOTT #3 for step 4, and puts it back to the RRC after.
    // Your team sees it meanwhile (My Wells values are shared across the organization).
    {
        name: 'correct-a-well',
        auth: true,
        path: `/maps?${SCOTT.view}&api=${SCOTT.api}`,
        allowWrites: /\/api\/v1\/well-edits\b/,
        steps: [
            {
                name: 'correct-a-well-1',
                alt: 'Step 1: the card of SCOTT #3, a producing oil well, open beside the map, with Edit in its row of buttons',
                run: async (page) => {
                    await ready(page);
                    if ((await ownWells(page)).some(isScott)) throw new Error('SCOTT #3 already has values of the account’s: revert them first');
                    const edit = editButton(page);
                    await edit.waitFor({ timeout: 90_000 });
                    await waitEnabled(edit);
                    await page.waitForFunction(() => !document.querySelector('[aria-label="Row detail"] [class*="keleton"]'), null, { timeout: 120_000 }).catch(() => {});
                    // The well beside its card, marked on the map, rather than under the card.
                    await frameAt(page, SCOTT.at, 14);
                    await page.waitForTimeout(1_500);
                    await greyEnterprise(page);
                    await parkPointer(page);
                    return NO_RAIL;
                },
                annotate: [{ at: (page) => editButton(page), n: 1, side: 'bottom' }],
            },
            {
                name: 'correct-a-well-2',
                alt: 'Step 2: the editor on Well data, with “total depth” in Find a field, a new Total depth typed in, and the RRC’s value on the line under it',
                run: async (page) => {
                    await editButton(page).click();
                    const find = page.getByLabel('Find a field');
                    await find.waitFor({ timeout: 60_000 });
                    await page.locator('#we-td').waitFor({ timeout: 60_000 });
                    await waitEnabled(page.locator('#we-td'));
                    await find.fill('total depth');
                    const rrc = Number(((await page.locator('#we-td').inputValue()) || '').replace(/[^\d.]/g, ''));
                    // A different depth, round, so the change reads as one.
                    const mine = Number.isFinite(rrc) && rrc > 0 ? Math.round(rrc / 10) * 10 + 40 : 2950;
                    await page.locator('#we-td').fill(String(mine));
                    await page.locator('#we-td').press('Tab');
                    await page.getByText(/1 unsaved change/).first().waitFor({ timeout: 10_000 });
                    await page.waitForTimeout(800);
                    await greyEnterprise(page);
                    await parkPointer(page);
                    return NO_RAIL;
                },
                annotate: [
                    { at: (page) => page.getByLabel('Find a field'), n: 2, side: 'right' },
                    { at: '[data-field="td"]', pad: 4 },
                ],
            },
            {
                name: 'correct-a-well-3',
                alt: 'Step 3: the editor’s bottom bar reading 1 unsaved change, with Discard and Save 1 change',
                run: async (page) => {
                    await parkPointer(page);
                    return NO_RAIL;
                },
                annotate: [
                    { at: (page) => page.getByRole('button', { name: 'Save 1 change' }), n: 3, side: 'top' },
                    { at: (page) => page.getByText(/1 unsaved change/).first(), pad: 4 },
                ],
            },
            {
                name: 'correct-a-well-4',
                alt: 'Step 4: SCOTT #3 on the map, close in, with the blue dot on its symbol and its popup reading Your version and 1 value yours',
                run: async (page) => {
                    recordFixture({ kind: 'correction', api: SCOTT.api, field: 'td' });
                    await page.getByRole('button', { name: 'Save 1 change' }).click();
                    await page.getByText('Your team sees your values').first().waitFor({ timeout: 60_000 });
                    // Out of the drawer and the card, by their own buttons: the map close in, the well in the middle.
                    await page.getByRole('button', { name: 'Close the side panel' }).first().click({ timeout: 5_000 }).catch(() => {});
                    await page.waitForTimeout(1_000);
                    if (await page.locator(H.card).first().isVisible().catch(() => false)) await closeCard(page);
                    await page.waitForTimeout(500);
                    await frameAt(page, SCOTT.at, 14);
                    // The well drawn as the account's: its dot is on the my-wells badge layer.
                    await page
                        .waitForFunction(
                            (src) => {
                                const map = (0, eval)(src);
                                return !!map?.getLayer('my-wells-badge') && map.queryRenderedFeatures({ layers: ['my-wells-badge'] }).length > 0;
                            },
                            FIND_MAP,
                            { timeout: 90_000 },
                        )
                        .catch(() => {});
                    await page.waitForTimeout(2_500);
                    // A click pins the popup (the Well Popup setting's default, On click).
                    const at = await onPage(page, SCOTT.at);
                    await page.mouse.click(at.x, at.y);
                    const own = page.locator('.mapboxgl-popup').filter({ hasText: 'Your version' }).first();
                    await own.waitFor({ timeout: 20_000 });
                    // Its dates and zone are read after it opens: their bars go once they land.
                    await page.waitForFunction(() => !document.querySelector('.mapboxgl-popup .qs-wp-bar'), null, { timeout: 60_000 }).catch(() => {});
                    await page.waitForTimeout(1_200);
                    await marker(page, 'shot-own-dot', { x: at.x - 4, y: at.y - 22, width: 26, height: 26 });
                    const popup = await own.boundingBox();
                    const x0 = Math.min(at.x - 60, popup?.x ?? at.x);
                    const y0 = Math.min(at.y - 60, popup?.y ?? at.y);
                    const x1 = Math.max(at.x + 60, popup ? popup.x + popup.width : 0);
                    const y1 = Math.max(at.y + 60, popup ? popup.y + popup.height : 0);
                    return around({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, { left: 90, right: 90, top: 40, bottom: 40 });
                },
                annotate: [
                    { at: '#shot-own-dot', n: 4, side: 'left' },
                    { at: (page) => page.locator('.mapboxgl-popup').getByText('Your version').first(), pad: 4 },
                ],
            },
        ],
        after: async (page) => {
            const n = await removeOwnWells(page, isScott);
            forgetFixture({ kind: 'correction' });
            console.log(`    · SCOTT #3 back to the RRC (${n} removed)`);
        },
    },

    // ─── Add a well, the list, the import, the grid, the Layers row (maps/my-wells.mdx) ───
    // Adds the HELP DEMO 1H well after the first picture, and deletes it after the last.
    {
        name: 'my-wells',
        auth: true,
        path: `/maps?${REAGAN}`,
        allowWrites: /\/api\/v1\/well-edits\b/,
        steps: [
            {
                name: 'my-wells-add-well',
                alt: 'The editor for a new well: Add a well at the top, New well, HELP DEMO and 1H typed in, the Surface location row with Pick on map and its datum, and the bottom bar reading Still needed: a surface location beside Cancel and Add well',
                run: async (page) => {
                    // Tall enough that the whole form shows, from the title down to the location.
                    await page.setViewportSize(TALL);
                    await ready(page);
                    if ((await ownWells(page)).some(isDemoWell)) throw new Error('a HELP DEMO well already exists: remove it first');
                    await openMyWellsHome(page);
                    await page.getByRole('button', { name: 'Add well', exact: true }).click();
                    await page.getByText('New well', { exact: true }).waitFor({ timeout: 30_000 });
                    await page.locator('#we-lease_name').fill('HELP DEMO');
                    await page.locator('#we-well_no').fill('1H');
                    // A depth too, so the grid has a cell to type in later.
                    await page.locator('#we-td').fill('10500');
                    await page.locator('#we-lease_name').scrollIntoViewIfNeeded();
                    await page.evaluate(() => {
                        const row = document.querySelector('[data-field="surface"]');
                        for (let el = row?.parentElement; el; el = el.parentElement) {
                            if (el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible') {
                                el.scrollTop = 0;
                                break;
                            }
                        }
                    });
                    await page.waitForTimeout(800);
                    await parkPointer(page);
                    const drawer = await page.getByText('New well', { exact: true }).locator('xpath=ancestor::*[contains(@class,"mantine-Drawer-content")][1]').boundingBox();
                    return drawer ? around(drawer, { left: 10, right: 300, top: 10, bottom: 10 }, TALL) : undefined;
                },
                annotate: [
                    { at: (page) => page.locator('[data-field="surface"]').getByRole('button', { name: 'Pick on map' }), n: 1, side: 'right' },
                    { at: (page) => page.locator('[data-field="surface"]').getByLabel('Datum of the coordinates').locator('xpath=..'), n: 2, side: 'right' },
                    { at: (page) => page.getByText(/^Still needed: a surface location/).first(), n: 3, side: 'top' },
                    { at: (page) => page.getByRole('button', { name: 'Add well', exact: true }), n: 4, side: 'top' },
                ],
            },
            {
                name: 'my-wells-home',
                alt: 'My Data · My wells, searched for HELP DEMO: Add well, the counts Need review, Added, Hidden, Team and All, the HELP DEMO #1H well, and at the bottom Import wells or records, Mine or Team with the three exports, and Open the grid →',
                run: async (page) => {
                    // Placed on open ground with Pick on map, then added.
                    await page.locator('[data-field="surface"]').getByRole('button', { name: 'Pick on map' }).click();
                    await page.getByText(/Click the map to place the surface location/).waitFor({ timeout: 10_000 });
                    const spot = await openGround(page);
                    if (!spot) throw new Error('no open ground on the map to place the well');
                    await page.mouse.click(spot.x, spot.y);
                    await page.getByText(/^Still needed/).waitFor({ state: 'detached', timeout: 15_000 });
                    recordFixture({ kind: 'well', lease: 'HELP DEMO', well_no: '1H' });
                    await page.getByRole('button', { name: 'Add well', exact: true }).click();
                    await page.getByText('Added by you').first().waitFor({ timeout: 60_000 });
                    await page.waitForTimeout(1_500);
                    await page.setViewportSize(VIEWPORT);
                    await page.getByTitle('Back to your wells in My Data').click();
                    await findWell(page).waitFor({ timeout: 30_000 });
                    // Only the help's well: the account's own corrections stay out of frame.
                    await findWell(page).fill('HELP DEMO');
                    await page.getByText(/HELP DEMO/).first().waitFor({ timeout: 30_000 });
                    await page.waitForTimeout(1_000);
                    if ((await findWell(page).inputValue()) !== 'HELP DEMO') throw new Error('the search did not take: not capturing the account’s own wells');
                    await noOwnCorrections(page, findWell(page).locator('xpath=ancestor::*[contains(@class,"mantine-Drawer-content")][1]'));
                    await parkPointer(page);
                    const drawer = await findWell(page).locator('xpath=ancestor::*[contains(@class,"mantine-Drawer-content")][1]').boundingBox();
                    const grid = await page.getByRole('button', { name: 'Open the grid →' }).boundingBox();
                    if (!drawer || !grid) return undefined;
                    // Down to the footer: the card's empty foot says nothing. The drawer meets the
                    // window's left edge, so the badges stand on the map to its right.
                    return around({ ...drawer, height: grid.y + grid.height - drawer.y }, { left: 10, right: 60, top: 10, bottom: 44 });
                },
                annotate: [
                    { at: (page) => page.getByRole('button', { name: 'Add well', exact: true }), n: 1, side: 'right' },
                    { at: '[aria-label="Which wells to list"]', n: 2, side: 'right' },
                    { at: (page) => page.getByRole('button', { name: 'Import wells or records' }), n: 3, side: 'top' },
                    // Mine or Team, then one button per file.
                    { at: '[class*="exportRow"]', n: 4, side: 'right', pad: 4 },
                    { at: (page) => page.getByRole('button', { name: 'Open the grid →' }), n: 5, side: 'bottom' },
                ],
            },
            {
                name: 'my-wells-import',
                alt: 'Import wells and records at its first step: its steps, the drop area for a scout-ticket PDF or a table, and What is read',
                run: async (page) => {
                    await page.getByRole('button', { name: 'Import wells or records' }).click();
                    await page.getByText('Drop a scout-ticket PDF or a table, or browse').waitFor({ timeout: 30_000 });
                    await page.getByText('Your imports').waitFor({ timeout: 30_000 });
                    await page.waitForTimeout(1_500);
                    await parkPointer(page);
                    // Down to the list of past imports, which is the account's own business.
                    const modal = await page.locator('.mantine-Modal-content').last().boundingBox();
                    const stop = await topOf(page, 'Your imports');
                    return { x: Math.floor(modal.x), y: Math.floor(modal.y), width: Math.ceil(modal.width), height: Math.max(200, stop - 10 - Math.floor(modal.y)) };
                },
                annotate: [
                    { at: '[aria-label="Steps"]', n: 1, side: 'right' },
                    { at: (page) => page.getByText('Drop a scout-ticket PDF or a table, or browse').locator('xpath=ancestor::label[1]'), n: 2, side: 'top' },
                ],
            },
            {
                name: 'my-wells-grid',
                alt: 'The My wells tab in the data panel, filtered to HELP DEMO: the Wells and Values chips, the Needs review, Added, Hidden and Team chips, the well ticked with its Total depth cell, and the selection bar under the list',
                run: async (page) => {
                    await page.getByRole('button', { name: 'Close the import', exact: true }).click();
                    await page.waitForTimeout(800);
                    // A short window: the grid holds one row, and the selection bar sits at its foot.
                    await page.setViewportSize(SHORT);
                    await page.getByRole('button', { name: 'OPEN THE GRID →' }).click();
                    const filter = page.getByPlaceholder('Filter by well, API, operator, field…');
                    await filter.waitFor({ timeout: 60_000 });
                    await filter.fill('HELP DEMO');
                    const tick = page.getByRole('checkbox', { name: /^Tick HELP DEMO/ }).first();
                    await tick.waitFor({ timeout: 30_000 });
                    await tick.click();
                    await page.waitForTimeout(1_200);
                    await noOwnCorrections(page, page.locator('#maps-data-panel'));
                    // The grid's own chips: My Data's counts carry the same words.
                    const grid = page.locator('#maps-data-panel');
                    await unionMarker(page, 'shot-grid-chips', [
                        grid.getByRole('button', { name: /^Needs review/ }),
                        grid.getByRole('button', { name: /^Added/ }).last(),
                        grid.getByRole('button', { name: /^Hidden/ }).last(),
                        grid.getByRole('button', { name: /^Team/ }).last(),
                    ]);
                    await parkPointer(page);
                    const panel = await page.locator('#maps-data-panel').boundingBox();
                    return panel ? around(panel, { left: 0, right: 0, top: 0, bottom: 0 }, SHORT) : undefined;
                },
                annotate: [
                    { at: (page) => page.getByRole('radio', { name: 'Values' }).locator('xpath=..'), n: 1, side: 'right' },
                    { at: '#shot-grid-chips', n: 2, side: 'right', pad: 4 },
                    { at: (page) => page.locator('#maps-data-panel td').filter({ hasText: /^10,?500/ }).first(), n: 3, side: 'bottom' },
                    { at: (page) => page.locator('#maps-data-panel').getByRole('button', { name: 'Edit together' }).locator('xpath=..'), n: 4, side: 'top' },
                ],
            },
            {
                name: 'my-wells-layers',
                alt: 'The Layers card with the My Wells row on and its options open: Replace RRC or Compare, how many wells are yours, marked in blue, and Open in My Data and Open the grid',
                run: async (page) => {
                    await page.setViewportSize(VIEWPORT);
                    // The drawer and the tables put away, so the card and its options stand on the map.
                    await page.getByRole('button', { name: 'Close the side panel' }).first().click({ timeout: 5_000 }).catch(() => {});
                    const hide = page.getByRole('button', { name: 'Hide data tables', exact: true });
                    if (await hide.isVisible().catch(() => false)) await hide.click();
                    await page.waitForTimeout(1_500);
                    await openMapControl(page, 'Layers');
                    await page.getByRole('button', { name: 'My Wells options', exact: true }).click();
                    const line = page.getByText(/you corrected or added, marked in blue/);
                    await line.waitFor({ timeout: 15_000 });
                    await page.waitForTimeout(800);
                    await parkPointer(page);
                    const u = await unionMarker(page, 'shot-layers-area', [
                        page.locator('[class*="layerCard"]').first(),
                        page.getByRole('radiogroup', { name: 'My Wells mode' }),
                        line,
                        page.getByRole('button', { name: 'Open in My Data' }),
                    ]);
                    // The row's name and its Options: the badge goes in the gap before its switch.
                    await unionMarker(page, 'shot-my-wells-row', [
                        page.locator('[class*="layerCard"]').getByText('My Wells', { exact: true }).first(),
                        page.getByRole('button', { name: 'My Wells options', exact: true }),
                    ]);
                    return around(u, { left: 44, right: 16, top: 12, bottom: 12 });
                },
                annotate: [
                    { at: '#shot-my-wells-row', n: 1, side: 'right', pad: 4 },
                    { at: (page) => page.getByRole('radiogroup', { name: 'My Wells mode' }), n: 2, side: 'left' },
                ],
            },
        ],
        after: async (page) => {
            const n = await removeOwnWells(page, isDemoWell);
            forgetFixture({ kind: 'well' });
            console.log(`    · HELP DEMO well removed (${n})`);
        },
    },

    // ─── Edit several wells together (maps/my-wells.mdx) ─────────────────────────
    // Opened from three ticked rows and never saved: every write stays blocked but the editor's
    // read of the wells, a POST of their refs.
    {
        name: 'my-wells-together',
        alt: 'Edit wells together for three wells ticked in the Wells table: the well chips at the top, a Total depth typed beside Set all with how the wells stand now, the count of wells that would change, and Save at the bottom',
        auth: true,
        path: `/maps?${REAGAN}`,
        allowWrites: /^\/api\/v1\/well-edits\/wells\/views$/,
        run: async (page) => {
            await ready(page);
            await page.getByRole('button', { name: 'Show data tables' }).click();
            await rowsSteady(page);
            await wellsInViewByCumOil(page);
            const ticks = page.getByRole('button', { name: 'Select well', exact: true });
            for (let i = 0; i < 3; i++) {
                await ticks.first().click();
                await page.waitForTimeout(400);
            }
            await page.getByRole('button', { name: 'Edit together', exact: true }).click();
            await page.getByText('Edit wells together').first().waitFor({ timeout: 30_000 });
            await page.getByText(/^Reading/).waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {});
            await page.locator('#web-td').waitFor({ timeout: 60_000 });
            await waitEnabled(page.locator('#web-td'));
            await page.getByLabel('Find a field').fill('depth');
            await page.locator('#web-td').fill('9500');
            await page.getByText(/^Changes \d+ of 3/).first().waitFor({ timeout: 10_000 });
            await page.waitForTimeout(800);
            await greyEnterprise(page);
            await parkPointer(page);
            // The drawer card alone: the editor is the picture.
            const drawer = await page.getByText('Edit wells together').first().locator('xpath=ancestor::*[contains(@class,"mantine-Drawer-content")][1]').boundingBox();
            const save = await page.getByRole('button', { name: /^Save \d+ value/ }).boundingBox();
            if (!drawer || !save) return undefined;
            // Down to the bottom bar: the card's empty foot says nothing.
            return around({ ...drawer, height: save.y + save.height - drawer.y }, { left: 12, right: 40, top: 12, bottom: 22 });
        },
        annotate: [
            { at: (page) => page.getByRole('button', { name: /^Take .* off this edit$/ }).first().locator('xpath=ancestor::div[1]'), n: 1, side: 'right' },
            { at: (page) => page.getByLabel(/^How to apply Total depth/).locator('xpath=..'), n: 2, side: 'right' },
            { at: (page) => page.getByText(/^Changes \d+ of 3/).first(), n: 3, side: 'right' },
            { at: (page) => page.getByRole('button', { name: /^Save \d+ value/ }), n: 4, side: 'top' },
        ],
    },
];
