// Every **bold** label on a help page should be on screen in the app. This reads the pages, pulls the
// bold spans out, and looks for each one in the app's source (the sibling strawn checkout). What it
// cannot find is printed for a person to look at: a renamed button, a typo, or a bold phrase that
// was never a label. It is a report, not a gate — it always exits 0.
//
//   npm run labels                       every page, against ../strawn
//   npm run labels -- maps/compare       only pages whose path contains "maps/compare"
//   STRAWN_DIR=/path/to/strawn npm run labels
//
// Pages in WORKBOOKS_PAGES describe the `workbooks` branch until it merges, so they are read
// against WORKBOOKS_DIR (../strawn-workbooks) as well.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STRAWN_DIR = process.env.STRAWN_DIR ?? join(ROOT, '..', 'strawn');
const WORKBOOKS_DIR = process.env.WORKBOOKS_DIR ?? join(ROOT, '..', 'strawn-workbooks');
const WORKBOOKS_PAGES = ['maps/workbooks'];
const only = process.argv.slice(2);

function files(dir, keep, skip = () => false) {
    return readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        if (f.startsWith('.') || f === 'node_modules' || skip(f)) return [];
        return statSync(p).isDirectory() ? files(p, keep, skip) : keep(p) ? [p] : [];
    });
}

/** Quotes, apostrophes and ellipses are written several ways in source and in prose. */
const norm = (s) =>
    s
        .replace(/&apos;|&#39;|\\u2019|’|‘/g, "'")
        .replace(/&quot;|\\u201[cd]|“|”/g, '"')
        .replace(/\\u2026|&hellip;/g, '…')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ');

function sourceText(dir) {
    if (!existsSync(join(dir, 'src'))) return null;
    const all = files(join(dir, 'src'), (p) => /\.(tsx?|jsx?)$/.test(p), (f) => f === '__tests__');
    return norm(all.map((p) => readFileSync(p, 'utf8')).join('\n'));
}

/** The bold spans of a page that look like labels, outside code and MDX comments. */
function labelsOf(text) {
    const prose = text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`\n]*`/g, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    const out = [];
    for (const m of prose.matchAll(/\*\*([^*\n]+?(?:\*[^*\n]+\*[^*\n]*?)*)\*\*/g)) {
        const raw = m[1].trim();
        // A run-in heading ("**Find anything.**", "**Area:**") is emphasis, not a label.
        if (/[.:]$/.test(raw) && !/…$/.test(raw)) continue;
        if (raw.split(/\s+/).length > 9) continue;
        // A path ("Profile → Billing") is one label per step.
        out.push(...raw.split(/\s+→\s+/).filter(Boolean));
    }
    return [...new Set(out)];
}

/** A label is found when its literal pieces are. `*N*` (italic), `‹name›` and a lone `…` stand
 *  for a number or a name. An all-caps label is a section heading the app capitalises in CSS. */
function found(label, source, sourceLower) {
    const caps = /[A-Z]/.test(label) && label === label.toUpperCase();
    const pieces = norm(caps ? label.toLowerCase() : label)
        .split(/\*[^*]+\*|‹[^›]*›|(?<=\s|^)…(?=\s|$)/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1);
    const haystack = caps ? sourceLower : source;
    return pieces.length > 0 && pieces.every((piece) => haystack.includes(piece));
}

/** Icons (‹ › ✕ ⋮ + −) are drawn, not written: nothing to look for. */
const isGlyph = (label) => !/[A-Za-z0-9]/.test(label);

const strawn = sourceText(STRAWN_DIR);
if (!strawn) {
    console.error(`No strawn checkout at ${STRAWN_DIR} — set STRAWN_DIR.`);
    process.exit(0);
}
const workbooks = sourceText(WORKBOOKS_DIR);
const strawnLower = strawn.toLowerCase();
const workbooksLower = workbooks?.toLowerCase() ?? null;

const pages = files(ROOT, (p) => p.endsWith('.mdx'), (f) => f === 'screenshots' || f === 'scripts')
    .map((p) => relative(ROOT, p))
    .filter((p) => only.length === 0 || only.some((o) => p.includes(o)))
    .sort();

let missing = 0;
let checked = 0;
for (const page of pages) {
    const isWorkbooks = WORKBOOKS_PAGES.some((w) => page.startsWith(w));
    const lost = labelsOf(readFileSync(join(ROOT, page), 'utf8')).filter((label) => {
        if (isGlyph(label)) return false;
        checked += 1;
        return !found(label, strawn, strawnLower) && !(isWorkbooks && workbooks && found(label, workbooks, workbooksLower));
    });
    if (!lost.length) continue;
    missing += lost.length;
    console.log(`\n${page}`);
    for (const label of lost) console.log(`  ✗ ${label}`);
}
console.log(`\n${checked} bold labels on ${pages.length} pages; ${missing} not found in the app's source.`);
