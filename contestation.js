/* Contested Language — contestation view.
   Static site over site/data/contestation.json (Layer-4 framings for pinned
   terms + the Layer-2 candidate pool). Governing rule unchanged: every
   framing cites the quotes it was read from, and the model annotates
   evidence — it is never itself the evidence (DESIGN.md §3 claims
   discipline). All text is inserted via textContent; evidence renders into
   the persistent right-hand tray, never scrollIntoView. */
"use strict";

const DATA = "data";
const VERDICT_ORDER = ["contested", "mixed", "convergent", "insufficient", "pending"];

const state = {
  meta: null,
  terms: [],
  candidates: [],
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

// ---- sidebar: verdict groups --------------------------------------------------

function renderVerdictGroups() {
  const wrap = $("verdict-groups");
  wrap.replaceChildren();
  for (const verdict of VERDICT_ORDER) {
    const terms = state.terms.filter((t) => t.verdict === verdict);
    const details = el("details");
    if (verdict === "contested") details.open = true;
    const summary = el("summary", "", `${verdict} (${terms.length})`);
    details.append(summary);
    const body = el("div", "chip-row");
    body.style.flexDirection = "column";
    body.style.alignItems = "stretch";
    for (const t of terms) {
      const b = el("button", "term-btn", t.phrase);
      b.type = "button";
      b.dataset.term = t.phrase;
      b.setAttribute("aria-current", "false");
      b.addEventListener("click", () => selectTerm(t.phrase));
      body.append(b);
    }
    details.append(body);
    wrap.append(details);
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

function selectTerm(phrase) {
  const term = state.terms.find((t) => t.phrase === phrase);
  if (!term) return;
  state.term = term;
  state.candidate = null;

  clearSelectionButtons();
  const btn = document.querySelector(`.term-btn[data-term="${CSS.escape(phrase)}"]`);
  if (btn) btn.setAttribute("aria-current", "true");

  $("placeholder").hidden = true;
  $("candidate-view").hidden = true;
  $("framing-view").hidden = false;

  $("framing-title").textContent = term.phrase;
  const badge = $("verdict-badge");
  badge.className = `verdict tip ${term.verdict}`;
  badge.textContent = term.verdict;
  badge.dataset.tip = "an LLM's reading of the cited quotes, not a verdict of record";

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

  $("corpus-stats").textContent =
    `${fmt(state.meta.corpus_host_words)} host words · Layer-4 framings + Layer-2 pool`;

  renderCaveat();
  renderVerdictGroups();
  renderCandidateList();

  document.addEventListener("themechange", () => {});
}

init().catch((e) => {
  $("corpus-stats").textContent = "failed to load artifacts: " + e.message +
    " — serve this directory over HTTP (python3 -m http.server -d site) and ensure data/ exists.";
  $("caveat").textContent =
    `Data failed to load (${e.message}). The contestation view cannot show any framings right now — try reloading the page.`;
});
