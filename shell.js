/* The shared site shell: the helpers every page had its own copy of, and the
   view nav.

   Loaded FIRST, before each page's own script, as a classic script — these are
   globals on purpose. The pages are plain <script src> documents that still
   open from file://, and converting them to modules would take that away for
   no benefit the tests need.

   WHY THIS EXISTS. `el` was defined in 8 files, `$` in 7, `fetchJSON` in 6,
   `fmt` in 5 — and they had already drifted: concepts.js threw
   `${path}: ${r.status}` where five others said `HTTP ${r.status}`, verses.js
   and concepts.js wrote `el` as a declaration where the rest used an arrow.
   Two helpers had genuinely different BEHAVIOUR, which is the part a reader
   cannot see by skimming; see `pct` and `fmtTime` below.

   Tested by tests/js/shell.test.js, which loads this file into a jsdom window
   with vm.runInContext -- the same way the browser does, no module shim. */

// --- DOM primitives ---------------------------------------------------------

/* Every string reaches the page through textContent, never innerHTML. This is
   a fully-attributed public site quoting real people: a creator's own words
   are untrusted input as far as the DOM is concerned. */
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const $ = (id) => document.getElementById(id);

/* Resolves `DATA` at CALL time, not parse time: each page declares its own
   `const DATA` in the script that loads after this one, and classic scripts
   share one global lexical scope. */
async function fetchJSON(path) {
  const r = await fetch(`${DATA}/${path}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

// --- formatting -------------------------------------------------------------

const fmt = (x) => x.toLocaleString("en-US");

/* Rolls over past an hour: this corpus is long-form, and a two-hour video
   rendered "128:23" reads as a bug rather than a timestamp.

   Was `fmtTime` in three pages and `tstamp` in two, written differently and
   verified here to agree on every second from 0 to 40,000. One name now. */
function fmtTime(t) {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/* Small percentages keep their significant digits instead of collapsing to
   "0.0%". This page family reports COVERAGE, where the difference between
   "none" and "a little" is the whole point.

   The two implementations really differed, and the naive one was live: the
   verse explorer rendered the-omnist-rone -- 22 of 3,141 videos transcribed --
   as "22/3141 (0.0%)", a cell that contradicts itself. contestation.js had
   this version; verses.js had `(x * 100).toFixed(1)`. Unified on this one. */
function pct(x) {
  const v = Number(x) * 100;
  return `${v < 1 ? v.toPrecision(2) : v.toFixed(1)}%`;
}

// --- the view nav -----------------------------------------------------------

/* One list, rendered into every page's `nav.side-nav`, so adding a view is one
   edit rather than eight. It was eight: `galaxy.html` reached the live site
   linked from NO page but itself, because six of the seven navs were copies of
   a list written before it existed. */
const VIEWS = [
  ["index.html", "Terms"],
  ["map.html", "Creator map"],
  ["galaxy.html", "Concept galaxy"],
  ["cloud.html", "Occurrence cloud"],
  ["verses.html", "Verse explorer"],
  ["contestation.html", "Contestation"],
  ["concepts.html", "Creator concepts"],
];

/* Pages deliberately absent from the nav, with the reason. Reachable by URL,
   never linked -- so "unlisted" is the only access control, which is only
   honest for a page that carries no data.

   edges.html qualifies: it fetches nothing (zero fetch calls) and reads a
   locally-picked file that never leaves the browser, so publishing the page
   discloses nothing. Anything that reads site/data does NOT belong here. */
const UNLISTED = {
  "edges.html": "operator tool; loads a locally dropped file, fetches nothing",
};

function currentView() {
  const last = location.pathname.split("/").pop();
  return last || "index.html";
}

function renderNav(root, current = currentView()) {
  const nav = root || document.querySelector("nav.side-nav");
  if (!nav) return null;
  while (nav.firstChild) nav.removeChild(nav.firstChild);
  for (const [href, label] of VIEWS) {
    const a = el("a", null, label);
    a.href = href;
    if (href === current) a.setAttribute("aria-current", "page");
    nav.append(a);
  }
  return nav;
}

/* Render now if the nav is already in the document -- it is, because every page
   loads this script below its sidebar -- and fall back to DOMContentLoaded only
   if it is not, which is what a future page putting shell.js in <head> would
   need. Keying solely on readyState was wrong twice over: it renders nothing
   when the nav is present but parsing continues, and it depends on an event
   that a page assembled after load never fires. */
if (typeof document !== "undefined" && !renderNav()) {
  document.addEventListener("DOMContentLoaded", () => renderNav());
}
