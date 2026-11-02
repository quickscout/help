// Enterprise (hidden in the navigation). These switch the account's active project.
// See the field list at the top of shots.mjs.

import { AREAS_PROJECT, PROJECT, openProject, openWelcome } from '../lib.mjs';

export default [

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
];
