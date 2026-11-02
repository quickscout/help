# Help coverage audit — 2026-10-15, brought forward 2026-10-22 and 2026-10-24

Maintainer record. It is excluded from publishing by `.mintignore`.

## 2026-10-24 pass

**What was checked.** strawn `d3e054a0` plus its uncommitted tree as of 2026-10-24 15:00, against the 2026-10-22 pass. Two changes reach the help pages, and both are uncommitted in strawn [U]:

- **Area export** [U]. Source: strawn `src/app/(app)/maps/area-export/` (ExportCard, choices, ExportStatusRow, job, area) and `docs/maps-area-export.md`.
  - One **Export** tile on the Selected area card and on the county card opens the Export card: rows by data, format buttons on each row, and one zip with a README. On the Selected area card it replaces `Export ▾`, which never shipped.
  - The land grid and the NAD27 coordinates come from two new prod-data-api routes, `/land/tracts` and `/geo/nad27`, which deploy before strawn. Until they do, the card says *Needs a server update.* and its map files are WGS84. The pages describe the card as it will be once they're deployed.
  - The Wells and Leases tabs' ASCII4, OWX, DRI and Production CSV have no limits now: past one request's ceiling they're written in batches, with progress and **Cancel** in the footer.
- **Synopsis at the foot** [U]. Source: strawn `data-table/inspector/synopsis/synopsis.ts` (`zone: 'foot'`, `movedToFoot`). The block now sits under every other block on well, lease, operator and field cards, including the Permit and Injection layouts. It used to be on top (lease, operator, field) or under the Header (well).

**Pages changed.**
- `maps/exports`:
  - the description, and a fifth card on the front door;
  - four rows in *Find your export*, and the *Watch the footer* step;
  - the Wells and Leases tables lose their Limit column;
  - a new section, *Export an area or a county*: its steps, its rows, *While it's written* and *What's in the zip*;
  - troubleshooting: *An option is greyed out* loses its over-a-limit bullet, *fewer wells* gains two bullets, and *An area's export stopped* is new;
  - *More places to export*.
- `maps/selection`: the **Export** button and the *Export* section, rewritten for the Export card.
- `maps/records`:
  - *Synopsis* says it's at the foot;
  - the well Overview table, the lease Overview list, and the operator and field block lists end on **Synopsis**;
  - the county card gains **Export**, and *Selected areas* mentions it.
- `maps/row-cards` and `maps/operators-fields`: the Synopsis is at the foot.
- `maps/data-panel`: the footer counts off a batched export, with **Cancel**.
- `whats-new`:
  - the intro, and the Synopsis bullet;
  - *Select an area*'s Export bullet;
  - a new section, *Export an area or a county, in one zip*.
- `index`: a task line, and the *Screen and export* sentence.

**Screenshots, 2026-10-24.** Taken against :3004 at strawn `d3e054a0` plus its working tree, as the 10-15 account (session saved 10-22). The images were backed up to the session scratchpad first.
- **New: `selection-export`**, a step in `shots/selection.mjs`, on `maps/selection` and `maps/exports`. It reads `/land/tracts` and `/geo/nad27` from a local prod-data-api: `LOCAL_API=http://127.0.0.1:8000` turns on a fetch rewrite inside the step. Re-take it without `LOCAL_API` once those routes are deployed.
- **Re-taken:**
  - the `selection` walkthrough, because the Export tile has lost its ▾;
  - `lease-card`, `operator-card`, `field-card` and `find-a-record` 1–4, for the Synopsis;
  - `county-card`, for its **Export**;
  - `data-export`, `data-export-leases` and `record-tab-export`, whose limit lines are gone.
- **Looked at and left alone:** `well-card`, `well-card-builder`, `whats-new-map` and `row-card`. In each, the Header or the Wellbore fills the card, and the Synopsis was never in view.

**Verification (2026-10-24).** `npm run validate` passed and `npm run check` found no broken links. `npm run labels` finds the same 44 unmatched labels as on 10-22, none of them on a page changed today.

## 2026-10-22 pass

**What was checked.** strawn `d3e054a0` (2026-10-22) plus its uncommitted tree, against every page written for `150643c9`. Production strawn is still `0e2ad0d6` (2026-10-01), so the whole site still documents the next deploy.

**New page.** `maps/selection` ("Select an area", Records group): Select and Shift-drag; Box, Shape, Wells and Survey; the Selected area card, its blocks, Narrow, Show on map, the Selected area tab, Export, Add an area, Edit outline, Save area, Compare, the tag and Clear. Source: `selection/` (selectHintView, SelectHint, SavedAreasMenu, SelectionTag, SelectionMapVerb, mapShowWords); `data-table/datasets/selection/` (inspector/SelectionCard, blocks, NarrowCard, ExportMenu, exportModel, verbs/); `docs/maps-selection.md`.

**What changed across the site.**
- Every page but `maps/pages`, `tools/alerts`, `tools/ask` and the hidden groups was revised. 199 unmatched bold labels went to 45, all reviewed (below).
- The county card replaces the county drawer: `maps/records#counties`, the place card's **Zoom to county** / **View county** (`ask-the-map`, `tour`), county exports, and its Record tab entry points.
- Select replaces box selection everywhere: `tour`, `records#box-selection` (kept as a span), `data-panel`, `exports`, `compare`, `cross-section`, `alerts`, `whats-new` and `index`.
- The 2026-10-16 labels rule: no More menu on cards, no ⋯ menu on blocks (**Export CSV** / **Save PNG** at a block's foot), Copy icons beside ids, gear buttons now **Options**, sentence-case labels, **Full screen** / **Show map** / **Close the tables**, and table Scope **In view** | **All**.
- The well popup opens **On click** by default, with **More** (Logs, Documents, Land & owners, RRC GIS) and the **Standard** / **Large** / **Extra large** sizes.
- My Wells values are shared with the team (`my-wells` rewritten). `depth-records` is now "Well records", with seven new kinds. Tops and formations are in My Data.
- Map data: the server answers for Wells, Leases, Fields and search until their copies land (Pads and Rigs wait). The **Keep map data on this device** switch was added.
- Every paid tier holds the Enterprise workspace (`plans`, `data-panel`, `records`, `whats-new`). The `enterprise-hold` comment blocks are untouched: releasing them, and un-hiding the Enterprise group, is a decision still to make.
- New sections: `layers#style-wells-by-your-data`, Production units, `offline#answer-from-the-server-instead`, and `my-wells`' "Your values and your team's".

**Labels left unmatched (44), all reviewed.** Templates ("Save *N* changes", "Records · 3", "Other ‹kind› in gray", "How ‹kind› polygons are drawn", "Clear wells"); labels the server defines (DST pressures, alert source names); the browser's print dialog; CSS-uppercased **RESTORED V2**; a page name ("Alerts page"); `&rsquo;` text ("Open the well’s records"); the hidden Enterprise pages (not reviewed this pass).

**Unreferenced images.** `card-production-more`, `chart-download` (both show block ⋯ menus) and `lease-card-claim` (Claim came off the lease card 2026-10-20, "for now"; its shot is still in `shots/start.mjs`).

**Harness.**
- `npx playwright install chromium` was needed (Playwright 1.63).
- The saved :3004 session (2026-09-18) had expired, and a reload sent the account to the dashboard. Signing in again saves the account's cached map workspaces and projects too, and those put its project tile on the rail. `lib.mjs` `authState()` now hands a shot the cookies and Clerk's storage only.
- `shots.mjs` hides the left rail's counts (`button[data-help^="nav."] span[aria-hidden]`), because they are the account's.
- Updated for the app since 10-15:
  - Scope chips; **Full screen** / **Close the tables**.
  - Popups open on click and stay pinned, so a log shot closes it (`data-wp-close`). Logs is under the popup's **More** (`.qs-wp-more-t`).
  - Cards: a block is `[data-block-frame=…]`, not `section[data-section]`. Compare is `aria-pressed`. There is no card **More**: the wellbore builder is at the foot of the Wellbore block, documents come from **Blocks**, **Report** is a link.
  - `… settings` buttons are `… options`. Plat **Zoom to** / **Done**, **Clear all**. Map data's per-row **Repair** / **Remove**.
  - The Operators tab waits for the leases copy (see below).
- New modules and shots:
  - `shots/selection.mjs`: five steps.
  - `county-card` and `card-production-foot` in `cards.mjs`; it replaces `card-production-more` and `chart-download`.
  - `map-data-server-switch` in `search.mjs` and `maps-style-wells` in `chrome.mjs`.

**Screenshots, 2026-10-22.** Against :3004 at strawn `d3e054a0` plus its working tree, as the 10-15 account.
- **Re-taken or new: 144 of 155.** Every one was looked at.
  - `ask.mjs` (23) and `ask-ai` ran with Craig's go-ahead ("Ask and My Wells fine"). They wrote to the account, and each fixture was removed after its shot:
    - one Ask turn, its thread deleted from History;
    - the page `Help demo — Top oil wells in view`, moved to Trash, where it stays 30 days;
    - a Total depth correction on SCOTT #3, back to the RRC;
    - a HELP DEMO #1H well, deleted.
  - `ask-the-view-4` came out without a well's card, so its alt names the follow-up questions only.
  - `pages-link-card` shows the card's name cut to "Help…" by the Ask column's 400 px.
- **Not re-taken:**
  - **Enterprise (8):** they switch the account's active project. Craig said not to run them (2026-10-22).
  - **`lease-card-claim`, `card-production-more`, `chart-download`:** no page uses them.
- `ask.mjs` updated for the app since 10-15:
  - **Well card:** the card's verb is **Edit** (**Edit · 3**).
  - **Editor:** after a save it reads *Your team sees your values*.
  - **Popup:** an own well's popup opens on a click, and the shot waits for its `.qs-wp-bar` placeholders to go.
  - **My Data:** **Open** on the My wells row, **Add well**, **Import wells or records (…)**, the Mine | Team export row, **Close the import**, the grid's **Team** chip, and **My Wells options** in Layers.
  - **Cards and tables:** **Close the card**, **Hide data tables**.
  - **Edit together:** its read, `POST /well-edits/wells/views`, is let through the write block.
  - **Harness fix:** `FIND_MAP` was used without being exported from `lib.mjs`.
- Changed for the next run of the Ask walkthrough (not yet run):
  - **Step 3:** waits for the camera to stop.
  - **Step 4:** re-reads the labels, compares well names without their "#", and opens a ranked well through its popup's **View well**.
  - **Link card:** widens the column (End on its edge) and centres the card.
  - **Viewer:** badge 1 moves right of the access chip.
- Open markers still need a picture:
  - `maps-production-units` (needs prod-data-api's units tiles)
  - `maps-tops-my-data`
  - `my-wells-import-map-columns`
  - `maps-depth-records-card`
  - `pages-view-only`
  - Workbooks and Enterprise
- The cross-section's five wells are four now: at the shot's zoom eight KING wells share KING, E. F. #2R's spot.

**Page fix from the Ask shots.** `ask-the-map` said a click on a numbered label "or the well beside it" opens its card. A ranked well's label takes no click, and a click on a well opens its popup, so step 4 and "What Ask can do" now say so.

**Seen in the Ask answer (app behaviour, not changed):**
- Each named well carried two labels: its rank ("4 CROSS BAR RANCH #3003 · 3.19M bbl") and its mark ("4 COG OPERATING · CROSS BAR RANCH 3003").
- Those labels round volumes (*4.63M bbl*), not the exact figures elsewhere in the app.
- At the default width, the page card in the Ask column cuts its title to "Help…".

**App bug seen while shooting.** With the leases copy not on the device, the Operators tab reads *Could not read the operators in this view — the server engine cannot keep a table built from another temp table (operator_statewide)*. The shots wait for the copy to land. A reader whose browser keeps no copy, or who turned on **Answer from the server**, can't use the Operators tab.

**Verification (2026-10-22).** `npm run validate` passed and `npm run check` found no broken links.

## 2026-10-15 pass

**What was checked.** The sibling `strawn` checkout at `150643c9` (2026-10-15), plus its uncommitted working tree.
**What came before.** The 2026-10-03 audit used `69cf7f04`.

None of `69cf7f04..150643c9` is deployed yet. `origin/main` is `0e2ad0d6` (2026-10-01), so this pass documents the next deploy as a whole.

Workbooks is documented from the `workbooks` branch (worktree `../strawn-workbooks`). Its two guides sit in a hidden navigation group until that branch merges and deploys.

The review compared these with the implementation:
- workflows
- on-screen labels
- access
- persistence
- limits

It does not certify backend responses or deployed behavior.

## Source paths

Source references are in `strawn`, not in this repository:

- Unprefixed app paths start at `src/app/(app)/maps/`.
- `A/` starts at `src/app/(app)/(main)/`.
- `P/` starts at `src/app/(app)/(main)/prospect/`.
- `W/` starts at `src/app/(app)/workbooks/` in `../strawn-workbooks`.
- `src/` and `docs/` start at the app repository root.

[U] marks a statement that rests on uncommitted strawn code. Re-check those against the deploy commit before publishing.

## Every guide

| Guide | Implementation references | Audit result |
|---|---|---|
| `index` | MapsShell.tsx; src/lib/brand/links.ts | Updated: What's new card; tasks for compare, logs and cross-sections; overview re-shot. |
| `whats-new` | (every guide below) | Added: this update's headline changes and a "Where things moved" table. |
| `get-started/sign-in` | MapsShell.tsx; components/auth/PlanLine.tsx | Updated: the plan line, **See plans** / **Billing**, landing on the map. |
| `get-started/plans` | src/lib/auth/entitlements.ts; components/drawer-contexts/registry.ts; utils/map-link.ts | Updated: cards instead of drawers; what a paid plan unlocks from the map; checkout returns to the view; Ask and synopsis credits. |
| `get-started/billing` | A/billing/page.tsx; MapsShell.tsx | Updated: **Profile** → **Billing**. |
| `maps/tour` | MapsShell.tsx; controls/main.control.tsx; controls/command-bar/; controls/components/map-context/; controls/map-controls/ | Rewritten: rail panels, place control at top centre, **Cross section** and Ask column, status bar, compare tray, popup 2a, cards. |
| `maps/search` | controls/search.control.tsx; controls/command-bar/; components/drawer-contexts/search/ | Rewritten: the typeahead's groups, keys and compare verb; the one-line live search; number search opens a Record tab. Results moved to their own page. |
| `maps/search-results` | data-table/datasets/search/ (SearchOverview, SearchLedger, SearchDrill, SearchNames [U], SearchToolbar, SearchFilters); components/drawer-contexts/search/local/searchAreaDraw.ts | Added: type tabs, via lines, Named / Not named [U], drill-down, Filters incl. a drawn area, Sort, **Only these on map**, map↔list. |
| `maps/layers` | controls/dropdowns/layer-dropdown.tsx; components/EntityMark.tsx; layers/entity-map-marks.ts | Updated: record marks; **My Wells**, **Formation tops** and **W-1 plats** rows; the Logs capsule. Settings moved out; `#settings` kept as a stub. |
| `maps/settings` | controls/dropdowns/settings-dropdown.tsx; controls/dropdowns/CardSidePicker.tsx; controls/map-controls/MapStatusOptions.tsx; workspace/wellPopupSizePref.ts [U] | Added: every Settings section, the status bar's parts, popup size [U]. |
| `maps/drilling-timeline` | timeline/ (WhichWellsRow, DrillingTimeline, useTimelinePrefs) | Updated: Wellbore, years, operators in their colours, **Fit**, horizontals as sticks. |
| `maps/well-labels` | controls/well-style/WellStyleModal.tsx; my-wells/editor-rows.tsx | Updated: a My Wells **Map label** replaces the operator's name. |
| `maps/production-panel` | components/drawer-contexts/production/ProductionDrawer.tsx | Added. |
| `maps/operator-field-layers` | components/drawer-contexts/polygon-layers/; docs/maps-polygon-layers.md | Added: Operators and Fields panels, colours, stripes, Add top 5, field measures. |
| `maps/plats` | plats/; data-table/inspector/report/documentsModel.ts | Added: **Add plat**, the Documents Map column, Layers → W-1 plats. |
| `maps/alerts` | components/drawer-contexts/alerts/ | Reviewed: a well now opens as its card. |
| `maps/records` | utils/open-map-record.ts; data-table/inspector/ (SoloInspector, PendingCardView, inspectorStore, cardSide, synopsis/); datasets/*/inspector/ | Rewritten as "Record cards": the left drawer's record views were deleted 2026-10-06. Covers card side, Back/Esc, the placeholder, Synopsis, each card's verbs, what still opens in drawers, land. Anchors kept. |
| `maps/compare` | compare/; data-table/compare/; docs/maps-compare.md | Added. |
| `maps/my-wells` | my-wells/ (WellEditor, BulkWellEditor, import/ImportWizard); components/drawer-contexts/my-data/MyWellsHome.tsx; data-table/datasets/wells/ownRows.ts | Added: editor, Add a well, scout-ticket import, grid, export, entry points. |
| `maps/my-data` | components/drawer-contexts/my-data/ | Updated: the My wells row. |
| `maps/well-logs` | layers/initialize-logs-layer.ts; config/published-logs.config.ts; logs/; data-table/inspector/logs/WellLogsBlock.tsx; components/drawer-contexts/published-logs/PublishedLogDrawer.tsx | Added. Regulatory-catalogue sections depend on the catalogue being public in production (see below). |
| `maps/cross-section` | xsection/ (CrossSectionPanel, PickRow, SectionHud, SectionToolItem, RockPicker, FormationAdd, usePickGestures, curves/ [U]) | Added: picking, the panel, flattening, lithology, Pick tops, depth records on a bore. Log tracks and the Zoom foot are [U]. |
| `maps/formation-tops` | layers (formation tops); data-table/inspector (tops section); my-wells/ (Tops tab) | Added. |
| `maps/depth-records` | intervals/IntervalsEditor.tsx; data-table/inspector/intervals/IntervalsBlock.tsx | Added. |
| `maps/ask-the-map` | controls/components/map-context/ (MapContextPill, PlaceHere, PlaceListSections); agent/ (AgentColumn, AgentComposer, AgentThread, StepTrail, MapAgentProvider); layers/agent-layers/AgentLayersChip.tsx; contracts/agent-capabilities.json | Rewritten as "The place card and Ask": the new place card, the docked Ask column, what Ask can do, the Undo row, credits. |
| `maps/pages` | src/app/(app)/artifacts/ (ArtifactViewer, ShareDialog, ArtifactIndex, PublicArtifactView); P/discuss/ArtifactLinkCard.tsx | Added. |
| `maps/workbooks`, `maps/workbooks-share` | W/; maps/workbook/ (branch); design/workbooks/README.md (branch) | Added from the branch; hidden group. `pages#your-pages` must be rewritten when the branch replaces the /artifacts index. |
| `maps/data-panel` | data-table/components/ (DataTableWorkspace, PanelStrip, EntityTabs); data-table/engine/recordTab.ts; data-table/datasets/record/ | Updated: Search, Record, Compare, Log and My wells tabs; `#record-tab`; `c` to compare; selection bars; hover chip [U]. |
| `maps/operators-fields` | data-table/datasets/operators/; data-table/datasets/fields/ | Updated: card blocks and verbs; Show leases / Show wells open a Record tab. |
| `maps/filters` | data-table/components/SavedFilters.tsx; data-table/engine/ | Updated: the session tabs and how they relate to filters. |
| `maps/row-cards` | data-table/inspector/; inspector/production/workbench/byWell/ [U] | Updated: one card with history; layouts where they remain; verbs; By well [U]. |
| `maps/charts` | data-table/components/AnalysisSlot.tsx; data-table/engine/chart/ | Updated: P-4/Frac sample size [U]; Analyze's Compare vs the compare tray. |
| `maps/offline` | local-data/ (MapDataDialog, LocalDataPanel, panelSummary, rowState); data-table/engine/ (storage ceiling, serverSnapshotDb [U]) | Rewritten as "Map data on this device". |
| `maps/exports` | data-table/datasets/wells/export/; data-table/datasets/leases/export/; data-table/datasets/leases/inspector/LeaseCard.tsx | Updated: every export from cards and the Record tab; By well [U]; Production panel and My Wells exports. The drawer routes are gone. |
| `maps/printing` | print/exportPrint.ts | Updated: exports work in Safari. |
| `tools/well-report` | A/wells/[api]/report/; data-table/inspector/verbs.tsx | Updated: **Report** on the card. |
| `tools/wellbore-builder` | A/wellbore/; data-table/datasets/wells/inspector/ | Updated: card **More** → **Open in the wellbore builder**. |
| `tools/alerts`, `tools/dashboard`, `tools/ask` | A/alerts/; A/dashboard/; A/ask/ | Reviewed: unchanged since the 2026-10-03 audit. |
| `owners/overview` | A/owners/; data-table/datasets/leases/inspector/LeaseCard.tsx | Updated: claim from the lease card's **More**. |
| `enterprise/well-logs` | P/uploads/; P/cross-section/ | Updated: map cross-section vs Prospect's; picks shared with the org and shown on Maps. |
| Other `enterprise/*` | (see the 2026-10-03 audit) | Not re-reviewed; hidden. |

## Before publishing

1. **Deploy first.** Publish this repository only after strawn deploys. Confirm what is live with `https://quickscout.io/api/health`.
2. **Uncommitted strawn work.** Re-check every [U] statement against the deploy commit: search follow-ups, popup size, By well, the hover chip, server-answered P-4/Frac, cross-section log tracks.
3. **Migrations behind documented features.** Confirm these are applied in production:
   - 214 and 215 (My Wells)
   - 228 (card synopsis)
   - 229 (search set tiles)
4. **The regulatory log catalogue.** It was preview-only in production at the time of writing.
   - Until it is public, `maps/well-logs#regulatory-logs-in-the-viewer` and the catalogue lines on that page and in `get-started/plans` promise more than production shows.
   - Either gate them or confirm the flip.
5. **Plat overlays.** Confirm the plat renderer is configured in production. The app can answer "Plat overlays are not set up on this server yet".
6. **Workbooks.** Keep its group hidden until the branch merges. At merge:
   - rewrite `maps/pages#your-pages`
   - capture its screenshots
   - unhide it
7. **Labels.** Run `npm run labels` and review what it lists.

## Screenshots

There are 146 images, all referenced from a page. The drawer-era images were removed: `well-drawer`, `lease-drawer`, `lease-export-production`, `operator-wells-export` and `offline-copies`.

**How they were captured.** Against `next dev` on :3004, signed in as the shots account (Enterprise tier, no project).

- **Layout.** Shots live in `screenshots/shots/<group>.mjs`, with shared helpers in `screenshots/lib.mjs`.
- **Walkthroughs.** These are `steps` shots: one page, a badge per step.
- **Annotations.** Orange rings and badges, provisional until the in-app Help pointer is designed. They point through strawn's `data-help` anchors (`src/app/(app)/maps/help/anchors.ts`) wherever one exists.

**Privacy handling.** Every frame was looked at.

- **Kept out of frame:**
  - the account's My Data layers, hidden in the page
  - its own and its org's logs: the Logs layer runs with **Mine & my org** off
  - its My Wells corrections: lists are filtered to the Help demo items
  - its email: masked
  - the left rail's own counts, where a shot is cropped
- **Enterprise-only controls** (Watch, Deal draft, bulk project actions) are greyed out, as most readers see them.
- **`profile-plan-line`** shows the account's company plan. The account can't show an individual plan's **Billing** or **See plans**.

**Writes.** None reached the account except labelled fixtures that the shots themselves created and removed:

- two Ask threads, deleted
- a HELP DEMO well, deleted
- a correction on SCOTT #3, reverted
- one page, "Help demo — Top oil wells in view", in the account's Trash: the server keeps a trashed page for 30 days, and there is no purge

`screenshots/.auth/fixtures.json` is empty.

**Markers still open:**

| Marker | Why it's open |
|---|---|
| `maps-depth-records-card` | No records to show without creating one |
| `pages-view-only` | Needs a signed-out session and a public share |
| The Workbooks markers | The branch isn't merged |
| `enterprise-log`, `enterprise-deal-curate` | No demo fixtures |

## Verification (2026-10-15)

- `npm run validate`: strict Mintlify validation passed.
- `npm run check`: no broken links.
- `npm run labels`: 2,911 bold labels on 57 pages; 68 not found literally.
  - The 68 were reviewed by hand. They are built from templates ("Export leases as CSV", "Compare *N* wells"), come from the browser's print dialog, or sit in text split across elements.
- Every shot module loads, with 161 unique shot names.
- strawn after adding the anchors:
  - `npm run typecheck`: clean.
  - `npx eslint` on the changed files: no errors.
  - `npm run test:maps`: 3,344 tests passed, including the new `help/__tests__/anchors.test.ts`.
