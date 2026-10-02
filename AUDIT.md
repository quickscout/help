# Help coverage audit — 2026-10-02

Maintainer record; excluded from publishing by `.mintignore`.

Source: sibling `strawn` checkout at `0e2ad0d6`, including its uncommitted Maps work. Existing app changes were preserved. The review compares primary workflows, on-screen labels, access, persistence and limits with implementation; it does not certify every backend response or deployed behavior.

## Source paths

Source references are in `strawn`, not this help repository:

- Unprefixed app paths start at `src/app/(app)/maps/`.
- `A/` starts at `src/app/(app)/(main)/`.
- `P/` starts at `src/app/(app)/(main)/prospect/`.
- `src/` and `docs/` start at the app repository root.
- Short repeated paths in a row use the same subsystem directory as the preceding reference.

## Every guide

| Guide | Implementation references | Audit result |
|---|---|---|
| `index` | MapsShell.tsx; src/lib/brand/links.ts | Updated: links to common tasks and billing. |
| `get-started/sign-in` | MapsShell.tsx; controls/dropdowns/settings-dropdown.tsx | Updated: billing fallback for accounts without a subscription. |
| `get-started/plans` | src/lib/auth/entitlements.ts; components/auth/PlanSelection.tsx; components/auth/SubscriptionOffer.tsx | Updated: distinguish signed-in tables from paid drawers; first-time trial and billing recovery. |
| `get-started/billing` | A/billing/page.tsx; components/auth/BillingStatePanel.tsx; src/lib/stripe/rules.ts | Added: current subscription states and recovery actions. |
| `maps/tour` | MapsShell.tsx; controls/main.control.tsx; page.tsx | Updated: click controls, Map style, printing and timeline links. |
| `maps/search` | components/drawer-contexts/search/SearchLedger.tsx; search/local/queryTokens.ts; data-table/datasets/tabs.ts | Updated: facets, scope widening, local/server fallback and temporary Search table. |
| `maps/layers` | controls/dropdowns/layer-dropdown.tsx; controls/dropdowns/settings-dropdown.tsx; config/ | Updated: click behavior, timeline, label editor; remove brittle catalog counts. |
| `maps/drilling-timeline` | timeline/DrillingTimeline.tsx; timeline/timelineStore.ts; timeline/timelineLabels.ts | Added: replay, labels, estimated/undated records and saved choices. |
| `maps/well-labels` | controls/well-style/WellStyleModal.tsx; workspace/wellLabelsPref.ts; docs/maps-well-labels.md | Added: presets, fields, placement, Apply and lease-rate interpretation. |
| `maps/printing` | print/PrintStudio.tsx; print/printModel.ts; docs/maps-print-studio.md | Added: sheet setup, scale, output formats, marks and fit rules. |
| `maps/records` | components/drawer-contexts/map-item/; components/drawer-contexts/land-abstract/; components/drawer-contexts/uic/ | Reviewed: record navigation, production downloads, logs, UIC and land. |
| `maps/ask-the-map` | controls/components/map-context/MapContextPill.tsx; controls/components/map-context/PlacePanel.tsx | Reviewed: hover/click place panel is still distinct from click-only rail controls. |
| `maps/alerts` | components/drawer-contexts/alerts/; A/alerts/ | Reviewed: three-step editor, hourly checks, replay and source-specific filters. |
| `maps/my-data` | components/drawer-contexts/my-data/; my-data/ingest/formats.ts | Reviewed: import formats, placement, drawing and layer downloads. |
| `maps/data-panel` | data-table/components/DataTablePanel.tsx; data-table/components/DataTableWorkspace.tsx; data-table/datasets/tabs.ts | Updated: temporary Search tab, two row types and per-project strip persistence. |
| `maps/operators-fields` | data-table/datasets/operators/; data-table/datasets/fields/; docs/maps-fields-tab.md | Reviewed: in-view semantics, production basis, field coverage and local-copy dependencies. |
| `maps/filters` | data-table/engine/useMapFollow.ts; layers/well-isolation.ts; layers/lease-isolation.ts | Updated: Search table; reviewed 100,000-match map-follow limit and single active-tab behavior. |
| `maps/row-cards` | data-table/inspector/RowInspector.tsx; data-table/inspector/production/; src/lib/economics/declineOverrideStore.ts | Updated: expanded decline workbench, Apply and session lifetime. |
| `maps/charts` | data-table/components/AnalysisSlot.tsx; data-table/datasets/registry.ts; data-table/engine/chart/ | Reviewed: recipes, chart selection, type curves, midstream and comparisons. |
| `maps/offline` | local-data/registry.ts; local-data/rowState.ts; data-table/components/SnapshotWarmers.tsx | Updated: map/download priority, waiting/stalled states, version refresh and offline limits. |
| `maps/exports` | data-table/datasets/wells/export/; data-table/datasets/leases/export/; components/drawer-contexts/map-item/content/lease/useLeaseDrawerExport.ts | Updated: access wording and map printing link; reviewed format caps and selection/month behavior. |
| `tools/alerts` | A/alerts/page.tsx; A/alerts-access/page.tsx | Reviewed: Table/Cards, replay, editor and plan gate. |
| `tools/well-report` | A/wells/[api]/report/ | Reviewed: options, link-carried choices and print-to-PDF. |
| `tools/wellbore-builder` | A/wellbore/components/WellboreBuilder.tsx; A/wellbore/utils/exportPng.ts | Updated: direct signed-in entry; reviewed RRC load, saved diagrams, components and PNG/PDF exports. |
| `tools/dashboard` | A/dashboard/page.tsx; A/dashboard/components/ | Reviewed: signed-out access, horizontal/vertical scope and statewide KPIs. |
| `tools/ask` | A/ask/; src/app/api/v1/ask/rrc/route.ts; src/app/api/v1/ask/geology/route.ts | Reviewed: independent questions, free access, modes and ten-per-minute limits. |
| `owners/overview` | A/owners/page.tsx; A/owners/components/; components/drawer-contexts/map-item/content/lease/ClaimInterestButton.tsx | Reviewed: free portal, claims, pending save, disabled Financials, county scope, offers and reports. |
| `enterprise/overview` | P/components/railItems.ts; P/components/ProspectHeader.tsx | Updated: links for all rail destinations; hidden visibility retained. |
| `enterprise/projects` | P/projects/; P/components/onboarding/; docs/project-config.md | Reviewed: scope, creation, sharing, switching and project preferences. |
| `enterprise/areas` | P/areas/; P/hooks/useProjectAreas.ts | Reviewed: drawing, import, geometry editing and editor-only changes. |
| `enterprise/wells` | P/wells/page.tsx; P/wells/components/WellFilterMenu.tsx; P/wells/wellColumns.ts | Added: full scoped well catalog; explicitly all-projects Logs view. |
| `enterprise/home` | P/home/; P/components/brief/ | Reviewed: board layout, brief, event feed and comparisons. |
| `enterprise/activity` | P/activity/; P/activity/components/ActivityViewControls.tsx; P/activity/savedViews.ts | Reviewed: scope, windows, grouping, exports, keyboard and device-local saved views. |
| `enterprise/watchlist` | P/entities/components/EntitiesPanel.tsx; data-table/watchRefs.ts | Reviewed: project association, read-only restrictions and 500-per-kind map actions. |
| `enterprise/economics` | P/analytics/page.tsx; P/analytics/scope.ts; P/analytics/hooks/useProjectValuation.ts | Updated: annual cash-flow coverage; reviewed assumptions, AOI what-if scope and lease exports. |
| `enterprise/charts` | P/charts/; P/charts/series/ | Reviewed: chart builder, board actions, series and decline overlays. |
| `enterprise/deals` | P/deals/; deals/; P/deals/components/CimModal.tsx | Reviewed: draft, curation, package, CIM/workbook and deletion. |
| `enterprise/well-logs` | P/uploads/page.tsx; P/analyze/; P/cross-section/; P/tops/ | Updated: inventory link; reviewed upload formats, statuses, analysis, sections and tops. |
| `enterprise/alerts` | P/alerts/components/AlertCreatePanel.tsx; P/alerts/components/AlertsRunHistory.tsx | Updated: remove incorrect one-email-per-day promise; hourly checks. |
| `enterprise/credits` | P/billing/components/CreditMeter.tsx; P/billing/components/PackCard.tsx | Updated: purchased-credit rollover wording; reviewed meter, top-up and payment-method timing. |
| `enterprise/files` | P/files/page.tsx; P/files/StoragePanel.tsx; P/components/ProjectDocumentsPanel.tsx | Added: document processing/discussion versus raw storage. |
| `enterprise/datasets` | P/data/components/DataWorkspace.tsx; P/data/components/SyncPanel.tsx; P/data/components/SchemasPanel.tsx | Added: import, mapping, export, cloud restore and destructive-action distinctions. |

## Coverage boundaries

- All public app routes have a guide or are reached through the relevant workflow: home/sign-in, Maps, billing, alerts/access, dashboard, Ask, wellbore, well reports and owners.
- All Enterprise rail destinations have coverage. Uploads, log analysis, cross sections and formation tops share the Well logs guide; Map reuses Maps guides. Credit billing has its own guide.
- Admin/staff routes, API implementation, internal labs, old-route aliases and archived designs are outside customer help.
- Enterprise remains hidden in navigation. Active public copy links only to public guides; launch copy is held in MDX comments. Existing guide URLs and anchors remain available.

## Verification

- `npm run validate`: strict Mintlify validation passed without warnings or errors.
- `npm run check`: Mintlify found no broken links.
- `node --check screenshots/shots.mjs`: capture script syntax passed.
- Existing Mintlify preview: all 24 new or edited guides returned HTTP 200 and rendered their titles. Printing, labels, timeline, search, billing and datasets were checked at 1440 px and 390 px with no broken visible images or page overflow; desktop and phone screenshots were visually reviewed.
- Seven refreshed local-app images were visually reviewed: Maps overview, Layers, heatmap, search results, Print Studio, well labels and drilling timeline. These captures verify the pictured controls; the coverage table also includes source-only reviews.

## Publication and remaining checks

1. Confirm checkout-only features are deployed before publishing their instructions: click-only control rail, Print Studio, label editor, drilling timeline and current Search-table behavior.
2. Billing state actions are checked against implementation. The available screenshot account cannot exercise every first-time, failed-payment or lapsed-subscriber state; no real payment or cancellation was submitted.
3. Backend contracts live in a separate repository. Delivery timing, current data freshness, valuations and third-party records still depend on the service; the guides avoid stronger guarantees than the UI supports.
4. Hidden log-analysis and deal-curation screenshot markers still need suitable demo fixtures. Do not create user data merely to replace these markers.
5. End-to-end writes (new alerts, claims, uploads, sharing and paid AI) were not submitted against the account. Their instructions were checked against forms and source; a demo-account acceptance pass remains appropriate before launch.
