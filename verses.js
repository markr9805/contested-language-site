"use strict";
// Slice 5 verse explorer (docs/verse-explorer-slice5-design.md).
// The page's default state is the validity floor. Nothing here may imply
// "same verse, different arguments" is demonstrated: the sense card renders
// only when the exporter's status is "ok", which today is no verse at all.

const DATA = "data";
let INDEX = null;
const BOOK_CACHE = {};

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
// Written from the coverage block, never by hand, so it weakens itself as
// transcription proceeds instead of going stale.
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

// --- sidebar: books in canonical order, verses in chapter:verse order -----
// Counts are shown but never sorted on: sorting by count would lead with the
// coverage artifact.
function verseSortKey(ref) {
  const m = ref.match(/ (\d+):(\d+)$/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

function renderSidebar() {
  const list = document.getElementById("book-list");
  const byBook = {};
  for (const [ref, v] of Object.entries(INDEX.verses)) {
    (byBook[v.book] = byBook[v.book] || []).push(ref);
  }
  for (const b of INDEX.books) {
    const details = el("details", "book-group");
    details.append(el("summary", null, `${b.book} (${b.verses})`));
    const refs = (byBook[b.book] || []).sort((x, y) => {
      const a = verseSortKey(x), c = verseSortKey(y);
      return a[0] - c[0] || a[1] - c[1];
    });
    for (const ref of refs) {
      const a = el("a", "verse-link");
      a.href = `#${encodeURIComponent(ref)}`;
      a.append(el("span", null, ref),
               el("span", "verse-n", `n=${INDEX.verses[ref].n}`));
      details.append(a);
    }
    list.append(details);
  }
}

// --- main pane ------------------------------------------------------------
const METHOD_LABEL = {
  explicit_citation: ["explicit",
    "chapter-and-verse reference — certain by construction"],
  shingle_match: ["shingle",
    "near-verbatim quote matched against reference text"],
  embedding_match: ["embedding",
    "paraphrase match — unconfirmed unless LLM-confirmed, a weaker tier than an explicit citation"],
};

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
// call. A render that resumes after an await checks this before touching
// the DOM — if a newer render has since started, the stale one bails
// instead of racing it onto the page (Finding 4).
let renderGen = 0;

async function renderVerse(ref) {
  const myGen = ++renderGen;

  const placeholder = document.getElementById("placeholder");
  const view = document.getElementById("verse-view");
  const titleEl = document.getElementById("verse-title");
  const textBox = document.getElementById("verse-text");
  const tbl = document.getElementById("creator-table");
  const body = document.getElementById("senses-body");
  const lines = document.getElementById("evidence-lines");
  const evidenceTitle = document.getElementById("evidence-title");
  const evidenceNote = document.getElementById("evidence-note");

  // Clear every evidence pane and set the new title before the first await.
  // This is what makes the render atomic from the reader's point of view:
  // whatever happens next (a failed fetch, a missing shard entry, a
  // superseded render), the PREVIOUS verse's creator table, sense note, and
  // KWIC lines can never be left on screen under the NEW verse's title —
  // for this page, that would be worse than showing nothing (Finding 1).
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
    // Cache the in-flight promise, not the resolved value, so two quick
    // navigations into the same book share one fetch instead of racing two
    // (Finding 3).
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

    // From here on `v` is trustworthy and belongs to `ref` — populate every
    // pane from it.
    for (const tr of Object.keys(v.text).sort()) {
      const p = el("p", "verse-line");
      p.append(el("span", "verse-tr", tr), el("span", null, v.text[tr]));
      textBox.append(p);
    }
    if (!Object.keys(v.text).length) {
      textBox.append(el("p", "insufficient-note",
        "No reference text loaded for this verse."));
    }

    // creator breakdown, each row carrying its own transcription coverage
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
        // The publication guard said "ok" but the per-verse sense document
        // failed to fetch or parse. An empty card here would look like a
        // verse with zero use-senses, which is a different (false) claim —
        // say plainly that the data could not be loaded (Finding: fail
        // visibly, never fail silent, same posture as failVisibly() above).
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

    // citations, every one a KWIC line with provenance
    evidenceTitle.textContent =
      `Citations (${v.n}${v.truncated
        ? `, showing first ${INDEX.parameters.citations_per_verse}` : ""})`;
    evidenceNote.textContent =
      "Each line is the transcript span around the citation, with the video and " +
      "timestamp it came from. Detection method is shown per line and is never " +
      "flattened into a single confidence.";
    for (const c of v.citations) {
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
  window.addEventListener("hashchange", onHash);
  onHash();
}

main();
