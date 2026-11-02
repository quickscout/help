// Get started, the tools, the Owner Portal and What's new.
// See the field list at the top of shots.mjs.

import {
    H,
    MIDLAND,
    SAMPLE_API,
    SAMPLE_WELL,
    VIEWPORT,
    mapSettled,
    maskEmails,
    parkPointer,
    settle,
    topOf,
} from '../lib.mjs';

// ─── record cards (this update) ──────────────────────────────────────────────

/** The card on screen. Cards stepped past stay mounted out of sight, hence `:visible`. */
const card = (page) => page.locator(`${H.card}:visible`).first();

/** The card shots are 100 px taller than the rest: a well card's More menu runs to about 920 px. */
const TALL = { width: VIEWPORT.width, height: 1_000 };

/** The card and the map just left of it (wide enough for the open well's pin and name), full height. */
const CARD_CLIP = { x: 500, y: 0, width: VIEWPORT.width - 500, height: TALL.height };

/** `parkPointer`, for a window of any height: below it, off the map and the rail. */
async function parkOff(page) {
    await page.mouse.move(40, page.viewportSize().height + 60);
    await page.waitForTimeout(400);
}

/** Out from the open well until the status bar's scale reads `miles` (0.5 mi: the sample box's own
 *  scale, where the map stops labelling every well), the pointer on the well's mark. Mapbox zooms
 *  about the pointer, so the well stays where Zoom to put it. (The Zoom out button pivots on the
 *  canvas centre, which the card covers, and slides the well behind the card.) */
async function zoomOutOnWell(page, miles = 0.5) {
    const at = await page.locator('[class*="focused-well"][class*="crosshair"]').first().boundingBox();
    if (!at) throw new Error('the open well is not marked on the map');
    // The pointer on a well raises its popup, which would take the wheel; out of the way while zooming.
    await page.addStyleTag({ content: '.mapboxgl-popup { display: none !important; }' });
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    for (let i = 0; i < 12; i++) {
        const scale = /([\d.]+)\s*mi\b/.exec(await page.locator(H.status).innerText().catch(() => ''));
        if (scale && Number(scale[1]) >= miles) break;
        await page.mouse.wheel(0, 300);
        await page.waitForTimeout(1_200);
    }
    await page.waitForTimeout(6_000);
}

/** The record the shot's URL names, its card painted, and the map framed on it by the card's own
 *  Zoom to (a camera move; nothing is saved). A well's card then steps back out (`zoomOutOnWell`),
 *  so the map around the well reads; a lease's Zoom to already fits the whole lease. */
async function cardOnMap(page, outFromWell = false) {
    await mapSettled(page);
    await card(page).waitFor({ timeout: 90_000 });
    await page
        .waitForFunction(() => !document.querySelector('[aria-label="Row detail"] [class*="keleton"]'), null, { timeout: 120_000 })
        .catch(() => {});
    await page.waitForTimeout(4_000);
    await card(page).getByRole('button', { name: /^(Show on map|Zoom to)$/ }).first().click();
    await page.waitForTimeout(7_000);
    if (outFromWell) await zoomOutOnWell(page);
    else await page.waitForTimeout(5_000);
}

/** The lease's well chip on the card that is widest, and so certainly clickable: "open this well". */
async function openLeaseWell(page) {
    const chips = card(page).locator('[title$="· open this well"]');
    const widths = await chips.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    if (!widths.length) throw new Error("the card's lease has no other well to open");
    await chips.nth(widths.indexOf(Math.max(...widths))).click();
    await page.waitForTimeout(6_000);
}

export default [

    // What's new: the map as this update leaves it. 1600 × 1000, the width at which the place control
    // shows whole beside the search box while a card is open (narrower, it is its pin alone).
    {
        name: 'whats-new-map',
        alt: "The map with a well's card open on the right, numbered: 1 the well's card, 2 the place control at the top centre, 3 wells in the compare tray at the foot of the map, 4 Cross section on the right-hand controls",
        auth: true,
        path: `/maps?${SAMPLE_WELL}&api=${SAMPLE_API}`,
        run: async (page) => {
            await page.setViewportSize({ width: 1_600, height: 1_000 });
            await mapSettled(page);
            await card(page).waitFor({ timeout: 90_000 });
            await page.waitForTimeout(6_000);
            // Wells into the compare tray, in this page only (the compare set lives in the blocked
            // workspace): the sample well from its card, two more ticked in the Wells table. A well's card
            // has no list of its lease's wells since the block cards (2026-10-16).
            await card(page).getByRole('button', { name: 'Compare', exact: true }).click();
            await page.waitForTimeout(2_000);
            await page.getByRole('button', { name: 'Show data tables' }).click();
            // Wells near the sample: the table in view, not the statewide list.
            await page.getByRole('radiogroup', { name: 'Scope', exact: true }).getByRole('radio', { name: 'In view' }).click();
            await page.waitForTimeout(3_000);
            const tick = page.getByRole('button', { name: /^Select (well|row)$/ });
            await tick.first().waitFor({ timeout: 120_000 });
            for (let i = 0; i < 2; i++) await tick.first().click();
            await page.getByRole('button', { name: 'Add to compare', exact: true }).click();
            await page.locator(H.tray).getByRole('button', { name: /Compare \d+ wells/ }).first().waitFor({ timeout: 30_000 });
            await page.getByRole('button', { name: 'Hide data tables' }).click();
            await page.waitForTimeout(4_000);
            await zoomOutOnWell(page);
            await parkOff(page);
        },
        annotate: [
            { at: (page) => card(page), n: 1, kind: 'box', side: 'left' },
            { at: H.place, n: 2, side: 'bottom' },
            { at: H.tray, n: 3, kind: 'box', side: 'top' },
            { at: H.section, n: 4, side: 'left' },
        ],
    },

    // Sign in: the account menu, its plan line under the (masked) email.
    {
        name: 'profile-plan-line',
        alt: "The Profile menu in Maps: the email, the plan line under it (here the company's plan), then Manage Account, Manage Team, Help center and Sign Out",
        auth: true,
        path: `/maps?${MIDLAND}`,
        run: async (page) => {
            await mapSettled(page);
            await page.locator(H.navProfile).click();
            await page.locator('.mantine-Menu-dropdown').filter({ hasText: 'Sign Out' }).waitFor({ timeout: 30_000 });
            await page.waitForTimeout(1_500);
            // The account's own address is never published.
            await maskEmails(page);
            await parkPointer(page);
            // From under the rail's Production label down: Operators, Fields, Alerts, Profile and the menu.
            return { x: 0, y: 578, width: 520, height: VIEWPORT.height - 578 };
        },
        annotate: [
            { at: H.navProfile, n: 1 },
            { at: (page) => page.locator('.mantine-Menu-dropdown .mantine-Menu-label p').nth(1), n: 2, side: 'right', pad: 2 },
        ],
    },

    // Tools: where the well report and the wellbore builder are on a well's card. One page, two pictures.
    {
        name: 'start-well-card',
        auth: true,
        path: `/maps?${SAMPLE_WELL}&api=${SAMPLE_API}`,
        steps: [
            {
                name: 'well-card-report',
                alt: "A producing well's card beside the map, with Report in its row of buttons under the well's name",
                run: async (page) => {
                    await page.setViewportSize(TALL);
                    await cardOnMap(page, true);
                    await parkOff(page);
                    return CARD_CLIP;
                },
                annotate: [{ at: (page) => card(page).getByRole('link', { name: 'Report', exact: true }), n: 1, side: 'left' }],
            },
            {
                name: 'well-card-builder',
                alt: "A well's card scrolled to its Wellbore block, with Open in the wellbore builder at the block's foot",
                run: async (page) => {
                    // A card has no More menu since 2026-10-16: the builder is the Wellbore block's own action.
                    const open = card(page).getByRole('button', { name: 'Open in the wellbore builder' }).first();
                    await open.waitFor({ timeout: 60_000 });
                    await open.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(1_000);
                    await parkOff(page);
                    return CARD_CLIP;
                },
                annotate: [{ at: (page) => card(page).getByRole('button', { name: 'Open in the wellbore builder' }).first(), n: 1, side: 'left' }],
            },
        ],
    },

    // Owner Portal: claiming an interest from a lease's card. MABEE C NORTH (08-48137), the sample
    // well's lease, is not one the account has claimed; only the menu is opened, never the claim form.
    {
        name: 'lease-card-claim',
        alt: "A lease's card with its More menu open: Claim your interest… and Copy lease key",
        auth: true,
        path: `/maps?${SAMPLE_WELL}&lease_no=48137&district_name=08&state_id=42`,
        run: async (page) => {
            await page.setViewportSize(TALL);
            await cardOnMap(page);
            // As readers without Prospect see the card: Deal draft is a Prospect verb, greyed out for them.
            await page.evaluate(() => {
                for (const button of document.querySelectorAll('[aria-label="Row detail"] button')) {
                    if (button.textContent.trim() === 'Deal draft') button.disabled = true;
                }
            });
            await card(page).getByRole('button', { name: 'More', exact: true }).click();
            // "Your interest…" while the account's claims are read; a lease it has claimed would read "Your WI · …".
            await page.getByRole('menuitem', { name: 'Claim your interest…' }).waitFor({ timeout: 60_000 });
            await page.waitForTimeout(1_000);
            await parkOff(page);
            return CARD_CLIP;
        },
        annotate: [
            // More is last in the row: its right side is the only one that covers nothing.
            { at: (page) => card(page).getByRole('button', { name: 'More', exact: true }), n: 1, side: 'right' },
            { at: (page) => page.getByRole('menuitem', { name: 'Claim your interest…' }), n: 2, side: 'left' },
        ],
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
];
