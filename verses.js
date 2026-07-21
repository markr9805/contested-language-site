"use strict";
// Slice 5 verse explorer — Atlas shell.
// Honesty posture unchanged from the pre-Atlas verses.js: the validity-floor
// banner is computed from the coverage block; the sense card renders only on
// exporter status "ok"; failures are visible, never silent; renders are
// atomic per verse (generation token). Changes: books group by testament in
// collapsible <details> (collapsed by default — 66 books stay navigable),
// a find-a-verse search auto-expands matches, citations render into the
// persistent right tray, and sidebar creator/method chips narrow the
// DISPLAYED citation list (dimming the creator table) without ever touching
// a count. All text lands via textContent.

const DATA = "data";
let INDEX = null;
const BOOK_CACHE = {};

// canonical testament split; books absent from the citation data never render
const OT = new Set(["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings",
  "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job",
  "Psalms", "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah",
  "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
  "Zechariah", "Malachi"]);

const filters = { creators: new Set(), methods: new Set() };
let currentRef = null;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

async function getJSON(path) {
  const r = await fetch(`${DATA}/${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

function pct(x) { return `${(x * 100).toFixed(1)}%`; }

function fmtTime(t) {
  const s = Math.floor(t), m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// Must match verse_senses._slug exactly — it names the verse-senses files.
function refSlug(ref) {
  return ref.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// --- the standing, computed honesty caption -------------------------------
function renderBanner(cov) {
  const t = cov.totals;
  const top = cov.creators.reduce((a, c) => (c.citations > a.citations ? c : a),
                                  {citations: -1, slug: "—", coverage: 0});
  const b = document.getElementById("coverage-banner");
  b.append(el("strong", null, "This layer is at the validity floor. "));
  b.append(el("span", null,
    `${t.citations} citations across ${t.verse_refs} verses, ` +
    `${t.singletons} of them cited exactly once. ` +
    `${pct(t.top_creator_share)} of all citations come from one creator ` +
    `(${top.slug}), who is ${pct(top.coverage)} transcribed, while ` +
    `${t.creators_untranscribed} roster channels have no transcripts at all. ` +
    `That makes every ordering here a picture of the transcription queue, not ` +
    `of who cites scripture — so no cross-side comparison is supported yet.`));
  document.getElementById("corpus-stats").textContent =
    `${t.citations} citations · ${t.verse_refs} verses · ` +
    `${t.transcribed}/${t.videos} videos transcribed`;
}

// --- sidebar: testament groups > collapsed books > verses -----------------
// Counts are shown but never sorted on.
function verseSortKey(ref) {
  const m = ref.match(/ (\d+):(\d+)$/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

function renderSidebar() {
  const list = document.getElementById("book-list");
  list.replaceChildren();
  const q = document.getElementById("verse-search").value.trim().toLowerCase();
  const byBook = {};
  for (const [ref, v] of Object.entries(INDEX.verses)) {
    (byBook[v.book] = byBook[v.book] || []).push(ref);
  }
  const groups = [["OLD TESTAMENT", []], ["NEW TESTAMENT", []]];
  for (const b of INDEX.books) {
    groups[OT.has(b.book) ? 0 : 1][1].push(b);
  }
  let shown = 0;
  for (const [label, books] of groups) {
    const visible = books.filter((b) => {
      if (!q) return true;
      if (b.book.toLowerCase().startsWith(q)) return true;
      return (byBook[b.book] || []).some((r) => r.toLowerCase().includes(q));
    });
    if (!visible.length) continue;
    list.append(el("div", "term-group-label", label));
    for (const b of visible) {
      const details = el("details", "book-group");
      // search auto-expands matching books; the current verse's book stays open
      details.open = q ? true
        : Boolean(currentRef && INDEX.verses[currentRef] &&
                  INDEX.verses[currentRef].book === b.book);
      details.append(el("summary", null, `${b.book} (${b.verses})`));
      const refs = (byBook[b.book] || [])
        .filter((r) => !q || r.toLowerCase().includes(q) ||
                       b.book.toLowerCase().startsWith(q))
        .sort((x, y) => {
          const a = verseSortKey(x), c = verseSortKey(y);
          return a[0] - c[0] || a[1] - c[1];
        });
      for (const ref of refs) {
        const a = el("a", "verse-link");
        a.href = `#${encodeURIComponent(ref)}`;
        if (ref === currentRef) a.setAttribute("aria-current", "true");
        a.append(el("span", null, ref),
                 el("span", "verse-n", `n=${INDEX.verses[ref].n}`));
        details.append(a);
      }
      list.append(details);
      shown += 1;
    }
  }
  document.getElementById("book-footnote").textContent = q
    ? `Showing books and verses matching “${q}”.`
    : `Showing cited books only — ${shown} of 66 have citations so far; ` +
      "the list grows as transcription proceeds. Counts are shown but never " +
      "sorted on — sorting by count would lead with the coverage artifact.";
}

// --- sidebar: creator + method display filters ------------------------------
// These narrow which citations are DISPLAYED in the tray and dim the creator
// table's rows. They never change a count — shares always describe the
// unfiltered total.

const METHOD_LABEL = {
  explicit_citation: ["explicit",
    "chapter-and-verse reference — certain by construction"],
  shingle_match: ["shingle",
    "near-verbatim quote matched against reference text"],
  embedding_match: ["embedding",
    "paraphrase match — unconfirmed unless LLM-confirmed, a weaker tier than an explicit citation"],
};

function renderFilterChips() {
  const cRow = document.getElementById("creator-chips");
  cRow.replaceChildren();
  const cited = INDEX.coverage.creators.filter((c) => c.citations > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug));
  for (const c of cited) {
    const b = el("button", "chip soft", c.slug);
    b.type = "button";
    b.setAttribute("aria-pressed", String(filters.creators.has(c.slug)));
    b.addEventListener("click", () => {
      filters.creators.has(c.slug) ? filters.creators.delete(c.slug)
                                   : filters.creators.add(c.slug);
      onFiltersChanged();
    });
    cRow.append(b);
  }
  const mRow = document.getElementById("method-chips");
  mRow.replaceChildren();
  for (const [key, [label, title]] of Object.entries(METHOD_LABEL)) {
    const b = el("button", "chip soft", label);
    b.type = "button";
    b.title = title;
    b.setAttribute("aria-pressed", String(filters.methods.has(key)));
    b.addEventListener("click", () => {
      filters.methods.has(key) ? filters.methods.delete(key)
                               : filters.methods.add(key);
      onFiltersChanged();
    });
    mRow.append(b);
  }
  const badge = (id, set) => {
    const e = document.getElementById(id);
    e.textContent = set.size ? `${set.size} selected` : "all";
    e.classList.toggle("on", set.size > 0);
  };
  badge("creator-badge", filters.creators);
  badge("method-badge", filters.methods);
  const n = (filters.creators.size ? 1 : 0) + (filters.methods.size ? 1 : 0);
  document.getElementById("active-count").textContent = String(n);
  document.getElementById("active-word").textContent =
    n === 1 ? "filter" : "filters";
}

function onFiltersChanged() {
  renderFilterChips();
  if (currentRef) renderVerse(currentRef);
}

function citationMatches(c) {
  if (filters.creators.size && !filters.creators.has(c.creator)) return false;
  if (filters.methods.size && !filters.methods.has(c.detection_method)) return false;
  return true;
}

// --- main pane ------------------------------------------------------------

function statusNote(status, n) {
  const p = INDEX.parameters;
  if (status === "too-few-creators") {
    return `Cited by fewer than ${p.min_creators} creators, so there is no ` +
      `within-side spread to measure a difference against. No cluster is shown.`;
  }
  if (status === "single-creator-concentration") {
    return `One creator holds more than ${pct(p.max_creator_share)} of these ` +
      `citations. Any split found here is a division inside one person's ` +
      `speech — plausibly rhetorical register or era — not evidence that the ` +
      `verse does different work for different communities. No cluster is shown.`;
  }
  if (status === "insufficient-data") {
    return `Too few citations to induce use-senses (${n} < ` +
      `${p.verse_sense_min_n}). No cluster is shown.`;
  }
  return "This verse does not meet the bar for showing use-senses. No " +
    "cluster is shown.";
}

// Monotonically increasing token identifying the most recent renderVerse
// call — a render that resumes after an await bails if superseded.
let renderGen = 0;

async function renderVerse(ref) {
  const myGen = ++renderGen;
  currentRef = ref;
  renderSidebar();

  const placeholder = document.getElementById("placeholder");
  const view = document.getElementById("verse-view");
  const titleEl = document.getElementById("verse-title");
  const textBox = document.getElementById("verse-text");
  const tbl = document.getElementById("creator-table");
  const body = document.getElementById("senses-body");
  const lines = document.getElementById("evidence-lines");
  const evidenceTitle = document.getElementById("evidence-title");
  const evidenceNote = document.getElementById("evidence-note");

  // Atomic render: clear every pane and set the new title before the first
  // await, so a failed fetch or superseded render can never leave the
  // previous verse's evidence under the new verse's title.
  placeholder.hidden = true;
  view.hidden = false;
  titleEl.textContent = ref;
  textBox.replaceChildren();
  tbl.replaceChildren();
  body.replaceChildren();
  lines.replaceChildren();
  evidenceTitle.textContent = "Citations";
  evidenceNote.textContent = "";

  function failVisibly(message) {
    if (myGen !== renderGen) return; // a newer render already owns the UI
    textBox.replaceChildren();
    tbl.replaceChildren();
    body.replaceChildren();
    lines.replaceChildren();
    textBox.append(el("p", "insufficient-note", message));
  }

  try {
    const meta = INDEX.verses[ref];
    if (!meta) {
      failVisibly(`No indexed verse matches "${ref}".`);
      return;
    }
    const bookEntry = INDEX.books.find(b => b.book === meta.book);
    if (!bookEntry) {
      failVisibly(`Failed to load "${ref}": no book shard is registered ` +
        `for ${meta.book}.`);
      return;
    }
    const slug = bookEntry.slug;
    // Cache the in-flight promise so two quick navigations share one fetch.
    if (!BOOK_CACHE[slug]) BOOK_CACHE[slug] = getJSON(`verses/${slug}.json`);
    let book;
    try {
      book = await BOOK_CACHE[slug];
    } catch (err) {
      delete BOOK_CACHE[slug]; // don't pin a transient failure forever
      throw err;
    }
    if (myGen !== renderGen) return;

    const v = book.verses[ref];
    if (!v) {
      failVisibly(`Failed to load "${ref}": the verse index and book ` +
        `shard are out of sync (no entry for this reference).`);
      return;
    }

    for (const tr of Object.keys(v.text).sort()) {
      const p = el("p", "verse-line");
      p.append(el("span", "verse-tr", tr), el("span", null, v.text[tr]));
      textBox.append(p);
    }
    if (!Object.keys(v.text).length) {
      textBox.append(el("p", "insufficient-note",
        "No reference text loaded for this verse."));
    }

    // creator breakdown, each row carrying its own transcription coverage;
    // rows outside the creator filter dim, never disappear
    const covBySlug = {};
    for (const c of INDEX.coverage.creators) covBySlug[c.slug] = c;
    const head = el("tr");
    for (const h of ["creator", "citations", "share", "transcribed"]) {
      head.append(el("th", null, h));
    }
    tbl.append(head);
    for (const [name, n] of Object.entries(v.creators)
         .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      const c = covBySlug[name] || {transcribed: 0, videos: 0, coverage: 0};
      const tr = el("tr");
      if (filters.creators.size && !filters.creators.has(name)) {
        tr.style.opacity = "0.35";
      }
      tr.append(el("td", null, name),
                el("td", "num", String(n)),
                el("td", "num", pct(n / v.n)),
                el("td", "num",
                   `${c.transcribed}/${c.videos} (${pct(c.coverage)})`));
      tbl.append(tr);
    }

    // sense card: the dark state is the default, and it says why
    if (meta.status === "ok") {
      const doc = await getJSON(`verse-senses/${refSlug(ref)}.json`)
        .catch(() => null);
      if (myGen !== renderGen) return;
      if (doc) {
        body.append(el("p", "evidence-note",
          `k=${doc.k} induced use-senses over n=${doc.n} citations ` +
          `(silhouette ${doc.silhouette}). Read the exemplar lines below: if the ` +
          `split is not visible to you in the quoted speech, the clustering is ` +
          `wrong.`));
        for (const [sense, rows] of Object.entries(doc.exemplars).sort()) {
          body.append(el("h4", null, `sense ${sense}`));
          for (const row of rows) {
            const line = el("div", "kwic-line");
            line.append(el("div", "kwic-meta",
                           `${row.creator} · ${row.title || row.video_id}`),
                        el("div", "kwic-context", row.context));
            body.append(line);
          }
        }
      } else {
        const note = el("div", "insufficient-note");
        note.append(el("strong", null, "cluster data unavailable — "),
                    el("span", null,
                       "This verse qualifies for a use-sense view, but its " +
                       "cluster data file failed to load. No cluster is " +
                       "shown."));
        body.append(note);
      }
    } else {
      const note = el("div", "insufficient-note");
      note.append(el("strong", null, "insufficient data — "),
                  el("span", null, statusNote(meta.status, meta.n)));
      body.append(note);
    }

    // citations → tray, narrowed by the display filters (disclosed)
    const shownCits = v.citations.filter(citationMatches);
    const filtered = shownCits.length < v.citations.length;
    evidenceTitle.textContent =
      `Citations (${filtered ? `${shownCits.length} of ` : ""}${v.n}` +
      `${v.truncated
        ? `, sample of first ${INDEX.parameters.citations_per_verse}` : ""})`;
    evidenceNote.textContent =
      "Each line is the transcript span around the citation, with the video and " +
      "timestamp it came from. Detection method is shown per line and is never " +
      "flattened into a single confidence." +
      (filtered ? " Sidebar filters narrow this list — they never change the " +
        "counts in the creator table." : "");
    for (const c of shownCits) {
      const row = el("div", "kwic-line");
      const [label, title] = METHOD_LABEL[c.detection_method] ||
                             [c.detection_method, ""];
      const badge = el("span", `method-badge method-${c.detection_method}`, label);
      badge.title = title;
      const metaRow = el("div", "kwic-meta");
      const link = el("a", null,
        `${c.creator} · ${c.title || c.video_id} @ ${fmtTime(c.t)}`);
      link.href =
        `https://www.youtube.com/watch?v=${c.video_id}&t=${Math.floor(c.t)}s`;
      link.target = "_blank";
      link.rel = "noopener";
      metaRow.append(badge, link);
      if (c.matched_translation) {
        const tr = el("span", "sub",
          ` matched against ${c.matched_translation} text`);
        tr.title = "Detection provenance — which reference edition's text " +
          "produced the match. Not a claim about which Bible the speaker carries.";
        metaRow.append(tr);
      }
      row.append(metaRow, el("div", "kwic-context", c.context));
      lines.append(row);
    }
    if (!shownCits.length) {
      lines.append(el("div", "insufficient-note",
        "No citations match the current creator/method filters — clear them " +
        "to see all of this verse's citations."));
    }
  } catch (err) {
    failVisibly(`Failed to load "${ref}": ${err.message}`);
  }
}

function onHash() {
  const ref = decodeURIComponent(location.hash.slice(1));
  if (ref) renderVerse(ref);
}

async function main() {
  try {
    INDEX = await getJSON("verses/index.json");
  } catch (err) {
    document.getElementById("corpus-stats").textContent =
      "Failed to load citation data.";
    document.getElementById("coverage-banner").append(el("strong", null,
      `Data failed to load (${err.message}). The verse explorer cannot ` +
      `show any citations right now — try reloading the page.`));
    document.getElementById("placeholder").textContent =
      `Citation data failed to load (${err.message}). Try reloading the page.`;
    return;
  }
  renderBanner(INDEX.coverage);
  renderSidebar();
  renderFilterChips();
  document.getElementById("verse-search")
    .addEventListener("input", renderSidebar);
  document.getElementById("clear-filters").addEventListener("click", () => {
    filters.creators.clear();
    filters.methods.clear();
    document.getElementById("verse-search").value = "";
    onFiltersChanged();
    renderSidebar();
  });
  window.addEventListener("hashchange", onHash);
  onHash();
}

main();
