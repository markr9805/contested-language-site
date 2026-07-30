/* Contested Language — contestation view.
   Static site over site/data/contestation.json (Layer-4 framings for pinned
   terms + the Layer-2 candidate pool), plus the optional Plan-2 LLM concept
   layer's site/data/discovered.json (machine-DISCOVERED framings, not yet
   pinned into the lexicon — DESIGN.md §8/§9). Governing rule unchanged:
   every framing cites the quotes it was read from, and the model annotates
   evidence — it is never itself the evidence (DESIGN.md §3 claims
   discipline). All text is inserted via textContent; evidence renders into
   the persistent right-hand tray, never scrollIntoView. */
"use strict";

const DATA = "data";
const VERDICT_ORDER = ["contested", "mixed", "convergent", "insufficient", "pending"];
const DISC_PREFIX = "disc:";

const state = {
  meta: null,
  terms: [],
  candidates: [],
  discovered: [],      // adapted discovered concepts, term-shaped (see adaptDiscovered)
  showDiscovered: false,
  term: null,       // selected term object, or null
  candidate: null,  // selected candidate object, or null
};

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (x) => x.toLocaleString("en-US");

async function fetchJSON(path) {
  const r = await fetch(`${DATA}/${path}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

// ---- discovered concepts (Plan-2 LLM layer, not pinned) ------------------------
//
// discovered.json shape (export_concepts): {meta:{model,generated_at,note},
// concepts:[{surface, verdict, apologetics:{text,quotes:[string,...]},
// deconstruction:{...}, apol, decon, keyness}]}. Adapted here into the same
// term shape selectTerm/renderFramingCol/renderTermEvidence already expect —
// {phrase, verdict, apologetics:{text,quotes:[{context,creator}]}, ...} —
// with a `discovered: true` flag and no per-quote creator (the export cites
// context only, so `creator` reads as "unattributed").

function adaptSide(side) {
  if (!side || !side.text) return null;
  const quotes = (side.quotes || []).map((q) => ({ context: q, creator: "unattributed — discovered" }));
  return { text: side.text, quotes };
}

function adaptDiscovered(concepts) {
  return (concepts || []).map((c) => ({
    phrase: c.surface,
    verdict: c.verdict,
    discovered: true,
    bar: c.bar || null,
    apologetics: adaptSide(c.apologetics),
    deconstruction: adaptSide(c.deconstruction),
  }));
}

// DESIGN §3: a verdict is a community claim, so it must show the significance
// bar its evidence rests on. An unmeasured bar reads as unmeasured, never as a
// cleared one.
//
// The PROVISIONAL state is reachable on the pinned lane, which annotates every
// curated term regardless of its bar. The discovered lane selects on the bar
// before annotating (reading thousands of candidates with an LLM is not
// feasible), so its chips only ever read as cleared — which is why the chip
// leads with the q value rather than a pass/fail verdict that cannot vary.
// B1: a discovered term's rank is a selection from a pool of thousands, ranked
// by a significance-flavoured statistic with no multiplicity correction on the
// ranking itself. The reliability gate is corrected (FDR); the ORDERING is not.
// Saying so is cheaper and more honest than implying the top of the list is the
// strongest signal rather than partly the luckiest draw.
function renderDiscoveredSelection() {
  const host = $("toggle-discovered")?.closest("label")?.parentElement;
  const sel = state.discMeta && state.discMeta.selection;
  if (!host || !sel) return;
  const old = host.querySelector(".disc-selection");
  if (old) old.remove();
  const p = el("p", "disc-selection tip",
    `${sel.published} of ${fmt(sel.pool)} candidates · ranked by ${sel.ranked_by}`);
  // The bar ADMITS terms into this lane, so its specificity bounds every
  // verdict shown here. Carried in the tooltip beside the selection note
  // because both describe the same thing: what this list's rank does and does
  // not mean. Exported data that nothing renders is not disclosure.
  p.dataset.tip = [sel.note, state.discMeta.bar_specificity]
    .filter(Boolean).join(" — ");
  host.append(p);
}

function barChip(bar) {
  if (!bar) return null;
  if (bar.status !== "ok") {
    const chip = el("span", "bar-chip unmeasured tip", "bar: unmeasured");
    chip.dataset.tip = bar.reason || "the significance bar was not computed for this term";
    return chip;
  }
  const passes = !!bar.passes;
  // Lead with the measurement, not a verdict. In the discovered lane the gate
  // selects on q BEFORE annotation, so a pass/fail label there could only ever
  // read "clears the bar" — decorative. The number is what carries information
  // and it is comparable across terms; colour still encodes the verdict for
  // the pinned lane, which is not gated and can genuinely fail.
  const value = bar.corrected
    ? `FDR q=${Number(bar.q).toPrecision(2)}`
    : `p=${Number(bar.p).toPrecision(2)}`;
  const chip = el("span", `bar-chip ${passes ? "passes" : "provisional"} tip`, value);
  chip.dataset.tip =
    (bar.corrected
      ? "Benjamini-Hochberg false-discovery rate across this run's terms. "
      : "Uncorrected: this is a curated term, not selected from a ranking, so there is no selection effect to correct. ") +
    `Exhaustive permutation over all ${Number(bar.assignments || 0).toLocaleString("en-US")} ` +
    "ways of splitting these creators into the observed group sizes — how often " +
    "does a random split produce a cross-side gap this large? " +
    (passes
      ? "Below threshold — but clearing it is NECESSARY, NOT SUFFICIENT. " +
        "Measured 2026-07-29 by two independent runs: 65–75% of arbitrary " +
        "words of comparable frequency also clear this bar, and profiles " +
        "carrying no information about the word at all — only which creator " +
        "used it and how often — clear it at 88%. The bar detects side-linked " +
        "structure, much of which is topic and creator, not contested meaning."
      : "PROVISIONAL — creator-level variation explains a gap this size, so this is a proposal, not a community difference.");
  return chip;
}

// The corpus a bar was measured against, beside the bar itself.
//
// A p-value is a statement about a body of evidence and is only checkable
// alongside that body. Both lanes used to publish one without the other: the
// number was there, what it described was not. The pinned lane could be worse
// than merely undated — its bar is computed from every line of a term's
// evidence while the only cache key covers the ~32 lines the annotator read, so
// a bar could describe a body of evidence that no longer existed and nothing
// said so. `current: false` is that case, and the chip states it in its LABEL
// rather than only in a tooltip, because a reader who never hovers is exactly
// the reader who needs it.
//
// Both lanes ship the same shape (see concepts._bar_corpus), so there is no
// branch here on which lane a term came from. The discovered lane carries one
// vintage for the whole set — its q values are frozen against a floor run, not
// against per-term lines — so it is read off the shared meta.
function vintageOf(term) {
  if (term.bar_corpus) return term.bar_corpus;
  if (term.discovered && state.discMeta) return state.discMeta.bar_corpus || null;
  return null;
}

function vintageChip(term) {
  const v = vintageOf(term);
  if (!v) return null;

  if (v.frozen === false) {
    const chip = el("span", "vintage-chip stale tip", "undated");
    chip.dataset.tip = v.note ||
      "this figure predates the profile freeze, so what it was measured " +
      "against was never recorded and cannot be recovered";
    return chip;
  }

  const videos = (v.corpus || {}).videos;
  const stale = v.current === false;
  const chip = el("span", `vintage-chip tip${stale ? " stale" : ""}`,
    stale ? "measured on older evidence"
          : videos ? `on ${fmt(videos)} videos` : "dated");
  const detail = [];
  if (videos) detail.push(`Measured against a corpus of ${fmt(videos)} videos`);
  if (v.measured_at) detail.push(`on ${v.measured_at}`);
  const lines = v.lines;
  if (lines) {
    detail.push(
      `— ${fmt(lines.apologetics || 0)} apologetics and ` +
      `${fmt(lines.deconstruction || 0)} deconstruction lines`);
  }
  if ((v.corpus || {}).fingerprint) detail.push(`(${v.corpus.fingerprint})`);
  chip.dataset.tip = `${detail.join(" ")}. ${stale ? v.stale_note || "" : v.note || ""}`.trim();
  return chip;
}

// A discovered concept's surface can collide with a pinned term's phrase
// (e.g. both could be "deconstruction"); key discovered lookups under a
// distinct namespace so selection never resolves to the wrong one.
function keyFor(term) {
  return term.discovered ? DISC_PREFIX + term.phrase : term.phrase;
}

function findTermByKey(key) {
  if (key.startsWith(DISC_PREFIX)) {
    const surface = key.slice(DISC_PREFIX.length);
    return state.discovered.find((t) => t.phrase === surface);
  }
  return state.terms.find((t) => t.phrase === key);
}

// ---- sidebar: verdict groups --------------------------------------------------

function renderVerdictGroups() {
  const wrap = $("verdict-groups");
  wrap.replaceChildren();
  for (const verdict of VERDICT_ORDER) {
    const terms = state.terms.filter((t) => t.verdict === verdict);
    const discovered = state.showDiscovered
      ? state.discovered.filter((t) => t.verdict === verdict)
      : [];
    const details = el("details");
    if (verdict === "contested") details.open = true;
    const count = discovered.length
      ? `${terms.length} + ${discovered.length} discovered`
      : `${terms.length}`;
    const summary = el("summary", "", `${verdict} (${count})`);
    details.append(summary);
    const body = el("div", "chip-row");
    body.style.flexDirection = "column";
    body.style.alignItems = "stretch";
    for (const t of terms) {
      const b = el("button", "term-btn", t.phrase);
      b.type = "button";
      b.dataset.term = keyFor(t);
      b.setAttribute("aria-current", "false");
      b.addEventListener("click", () => selectTerm(keyFor(t)));
      body.append(b);
    }
    for (const t of discovered) {
      const b = el("button", "term-btn discovered");
      b.type = "button";
      b.append(el("span", "", t.phrase), el("span", "discovered-badge", "discovered"));
      b.dataset.term = keyFor(t);
      b.setAttribute("aria-current", "false");
      b.addEventListener("click", () => selectTerm(keyFor(t)));
      body.append(b);
    }
    details.append(body);
    wrap.append(details);
  }
  // re-render loses all button nodes — restore the current selection's
  // highlight (if it's still visible under the current toggle state).
  if (state.term) {
    const btn = document.querySelector(`.term-btn[data-term="${CSS.escape(keyFor(state.term))}"]`);
    if (btn) btn.setAttribute("aria-current", "true");
  }
}

// ---- sidebar: Layer-2 candidates ----------------------------------------------

function renderCandidateList() {
  const wrap = $("candidate-list");
  wrap.replaceChildren();
  const sorted = state.candidates.slice().sort((a, b) => b.rank - a.rank);
  for (const c of sorted) {
    const b = el("button", "term-btn");
    b.type = "button";
    b.append(el("span", "", c.surface), el("span", "n", c.rank.toFixed(2)));
    b.dataset.candidate = c.surface;
    b.setAttribute("aria-current", "false");
    b.addEventListener("click", () => selectCandidate(c.surface));
    wrap.append(b);
  }
}

function clearSelectionButtons() {
  for (const b of document.querySelectorAll(".term-btn")) {
    b.setAttribute("aria-current", "false");
  }
}

// Reset to the same "nothing selected" state the page boots into: placeholder
// shown, both detail views hidden, tray back to its default note. Used when
// the discovered toggle turns off while a discovered concept is selected, so
// the main panel/tray never show a discovered concept with no visible
// selected button.
function clearSelection() {
  state.term = null;
  state.candidate = null;
  clearSelectionButtons();
  $("placeholder").hidden = false;
  $("framing-view").hidden = true;
  $("candidate-view").hidden = true;
  $("evidence-title").textContent = "Cited quotes";
  $("evidence-note").textContent =
    "Pick a term or candidate — the quotes its framing was drawn from land here without moving the page.";
  $("evidence-quotes").replaceChildren();
}

// ---- verdict badge --------------------------------------------------------------

function sideNote(term) {
  if (term.verdict === "insufficient") {
    return "insufficient — not enough cited evidence on this side to characterize a framing";
  }
  if (term.verdict === "pending") {
    return "pending — awaiting a Layer-4 framing pass";
  }
  return "no framing recorded for this side";
}

// ---- term (framing) view --------------------------------------------------------

function selectTerm(key) {
  const term = findTermByKey(key);
  if (!term) return;
  state.term = term;
  state.candidate = null;

  clearSelectionButtons();
  const btn = document.querySelector(`.term-btn[data-term="${CSS.escape(key)}"]`);
  if (btn) btn.setAttribute("aria-current", "true");

  $("placeholder").hidden = true;
  $("candidate-view").hidden = true;
  $("framing-view").hidden = false;

  $("framing-title").textContent = term.phrase;
  const badge = $("verdict-badge");
  badge.className = `verdict tip ${term.verdict}`;
  badge.textContent = term.verdict;
  badge.dataset.tip = "an LLM's reading of the cited quotes, not a verdict of record";
  const variants = badge.parentElement;

  const oldDisc = variants.querySelector(".discovered-badge");
  if (oldDisc) oldDisc.remove();
  const oldBar = variants.querySelector(".bar-chip");
  if (oldBar) oldBar.remove();
  const oldVintage = variants.querySelector(".vintage-chip");
  if (oldVintage) oldVintage.remove();
  if (term.discovered) {
    const disc = el("span", "discovered-badge tip", "discovered");
    disc.dataset.tip = "machine-DISCOVERED — proposed by an LLM from distinctive-word statistics, not pinned into the lexicon";
    variants.append(disc);
  }
  const chip = barChip(term.bar);
  if (chip) variants.append(chip);
  const vintage = vintageChip(term);
  if (vintage) variants.append(vintage);

  renderFramingCol("apol-col", "apol-text", term.apologetics, term);
  renderFramingCol("decon-col", "decon-text", term.deconstruction, term);

  renderTermEvidence(term);
}

function renderFramingCol(colId, textId, side, term) {
  const col = $(colId);
  const p = $(textId);
  if (side) {
    col.classList.remove("empty");
    p.textContent = side.text;
  } else {
    col.classList.add("empty");
    p.textContent = sideNote(term);
  }
}

function renderTermEvidence(term) {
  $("evidence-title").textContent = `“${term.phrase}” — cited quotes`;
  const wrap = $("evidence-quotes");
  wrap.replaceChildren();

  const sides = [
    ["apologetics", term.apologetics],
    ["deconstruction", term.deconstruction],
  ];
  let total = 0;
  for (const [label, side] of sides) {
    if (!side) continue;
    for (const q of side.quotes) {
      total++;
      const div = el("div", "quote", q.context);
      div.append(el("p", "quote-cite", `— ${q.creator} · ${label}`));
      wrap.append(div);
    }
  }
  if (!total) {
    wrap.append(el("div", "insufficient-note",
      `No quotes are cited for “${term.phrase}” — its verdict is ${term.verdict}, ` +
      "so no Layer-4 framing has been drafted on either side yet."));
  }
  $("evidence-note").textContent = total
    ? `${total} quote${total === 1 ? "" : "s"} cited across the apologetics and ` +
      "deconstruction framings above."
    : "Nothing to cite yet for this term.";
}

// ---- candidate (Layer-2) view ---------------------------------------------------

function selectCandidate(surface) {
  const c = state.candidates.find((x) => x.surface === surface);
  if (!c) return;
  state.candidate = c;
  state.term = null;

  clearSelectionButtons();
  const btn = document.querySelector(`.term-btn[data-candidate="${CSS.escape(surface)}"]`);
  if (btn) btn.setAttribute("aria-current", "true");

  $("placeholder").hidden = true;
  $("framing-view").hidden = true;
  $("candidate-view").hidden = false;

  $("candidate-title").textContent = c.surface;
  renderCandidateTable(c);
  renderCandidateEvidence(c);
}

function renderCandidateTable(c) {
  const table = $("candidate-table");
  table.replaceChildren();
  const head = el("tr");
  for (const h of ["Rank", "Balance", "Divergence", "Dispersion", "Apol n", "Decon n"]) {
    head.append(el("th", "num", h));
  }
  table.append(head);
  const row = el("tr");
  row.append(el("td", "num", c.rank.toFixed(3)));
  row.append(el("td", "num", c.balance.toFixed(2)));
  row.append(el("td", "num", c.divergence.toFixed(2)));
  row.append(el("td", "num", c.dispersion.toFixed(2)));
  row.append(el("td", "num", fmt(c.apol)));
  row.append(el("td", "num", fmt(c.decon)));
  table.append(row);
}

function renderCandidateEvidence(c) {
  $("evidence-title").textContent = `“${c.surface}” — sample snippet`;
  const wrap = $("evidence-quotes");
  wrap.replaceChildren();
  const div = el("div", "quote", c.snippet);
  div.append(el("p", "quote-cite", "— unattributed Layer-2 snippet (no creator recorded)"));
  wrap.append(div);
  $("evidence-note").textContent =
    "Layer-2 candidates are ranked automatically from raw co-occurrence — no " +
    "cited quotes exist until the term is pinned into the lexicon and a " +
    "Layer-4 framing pass is run. This is one representative occurrence.";
}

// ---- caveat banner ---------------------------------------------------------------

function renderCaveat() {
  const b = $("caveat");
  b.replaceChildren();
  const text = state.meta.caveat;
  // meta.caveat already opens with its own "DISCLOSED, NOT CERTIFIED (...)"
  // label — bold that lead-in instead of prepending a second, duplicate one.
  const idx = text.indexOf(": ");
  if (idx !== -1) {
    b.append(el("strong", null, text.slice(0, idx + 1)));
    b.append(el("span", null, " " + text.slice(idx + 1).trim()));
  } else {
    b.append(el("strong", null, "DISCLOSED, NOT CERTIFIED. "));
    b.append(el("span", null, text));
  }
}

// ---- boot --------------------------------------------------------------------

async function init() {
  const data = await fetchJSON("contestation.json");
  state.meta = data.meta;
  state.terms = data.terms;
  state.candidates = data.candidates;

  // discovered.json is optional — the Plan-2 LLM concept layer may not have
  // been run. Its absence is not a page failure: the toggle just shows
  // nothing (house ethic: an absent artifact is disclosed, not faked, and
  // here disclosure is simply an empty list rather than a broken page).
  try {
    const disc = await fetchJSON("discovered.json");
    state.discovered = adaptDiscovered(disc.concepts);
    state.discMeta = disc.meta || null;
  } catch (e) {
    state.discovered = [];
    state.discMeta = null;
    console.warn("discovered.json not available — discovered-concept toggle will show nothing:", e.message);
  }

  $("corpus-stats").textContent =
    `${fmt(state.meta.corpus_host_words)} host words · Layer-4 framings + Layer-2 pool`;

  renderCaveat();
  renderVerdictGroups();
  renderCandidateList();

  renderDiscoveredSelection();

  const toggle = $("toggle-discovered");
  toggle.checked = state.showDiscovered;
  toggle.addEventListener("change", () => {
    state.showDiscovered = toggle.checked;
    if (!state.showDiscovered && state.term && state.term.discovered) {
      clearSelection();
    }
    renderVerdictGroups();
  });

  document.addEventListener("themechange", () => {});
}

init().catch((e) => {
  $("corpus-stats").textContent = "failed to load artifacts: " + e.message +
    " — serve this directory over HTTP (python3 -m http.server -d site) and ensure data/ exists.";
  $("caveat").textContent =
    `Data failed to load (${e.message}). The contestation view cannot show any framings right now — try reloading the page.`;
});
