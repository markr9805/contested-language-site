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
// concepts:[{surface, verdict, apologetics:{text,quotes:[{context,creator,
// video_id,t}, ...]}, deconstruction:{...}, apol, decon, keyness}]}. Adapted
// here into the same term shape selectTerm/renderFramingCol/renderTermEvidence
// already expect, with a `discovered: true` flag.
//
// Quotes used to be bare context strings, which is why this attributed them to
// "unattributed — discovered": the export simply did not carry who said it or
// where. Since #139 they are objects with creator, video_id and t, so the
// discovered lane cites and deep-links exactly like the pinned one. The string
// branch is kept because a cached discovered.json from before that change is
// still readable — it renders without a link rather than crashing.

function adaptSide(side) {
  if (!side || !side.text) return null;
  const quotes = (side.quotes || []).map((q) => (
    typeof q === "string"
      ? { context: q, creator: "unattributed — discovered" }
      : { context: q.context, creator: q.creator || "unattributed — discovered",
          video_id: q.video_id, t: q.t }));
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
// leads with the measurement rather than a pass/fail verdict that cannot vary.
// B1: a discovered term's rank is a selection from a pool of thousands. The
// ADMISSION is gated (DESIGN §3's two legs); the ORDERING carries no correction
// at all. Saying so is cheaper and more honest than implying the top of the
// list is the strongest signal rather than partly the luckiest draw.
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
  // not mean. Exported data that nothing renders is not disclosure — which is
  // why `rule` is rendered too: DESIGN §3 publishes a STATED selection rule in
  // place of the retracted FDR guarantee, and a stated rule nobody is shown is
  // not a disclosure either.
  p.dataset.tip = [sel.rule, sel.note, state.discMeta.bar_specificity]
    .filter(Boolean).join(" — ");
  host.append(p);
}

// DESIGN §3's TWO-LEG bar, for both lanes (#112 pinned, #122 discovered).
//
// This read `bar.corrected ? FDR q=… : p=…` until 2026-07-30. Those fields
// belonged to the superseded single-leg payload; `gate.two_leg_verdict`
// carries `validity_p`, `percentile`, `pool_n`, `failed` and `thresholds`
// instead, so the chip rendered `p=NaN` the moment either lane re-exported,
// and its tooltip still asserted the single leg's 65–75%/88% figures as
// though they described what the reader was looking at.
//
// Both legs are shown, because which one failed is the finding. Failing
// validity means the gap is inside the spread among same-side creators;
// failing specificity means the gap is real but ordinary for a word of this
// frequency — a much more interesting thing to be told than "provisional".
function pct(x) {
  const v = Number(x) * 100;
  return `${v < 1 ? v.toPrecision(2) : v.toFixed(1)}%`;
}

function barChip(bar) {
  if (!bar) return null;
  if (bar.status !== "ok") {
    const chip = el("span", "bar-chip unmeasured tip", "bar: unmeasured");
    chip.dataset.tip = (bar.reason ||
      "the significance bar was not computed for this term") +
      " — unmeasured is not a pass: there was no bar to clear.";
    return chip;
  }
  const passes = !!bar.passes;
  const failed = bar.failed || [];
  const thin = !!bar.reduced_resolution;

  // Lead with the measurement; colour encodes the verdict. `reduced` is in the
  // LABEL rather than only the tooltip, on the same principle as the vintage
  // chip's `current: false` — a reader who never hovers is exactly the reader
  // who needs to know the pool was under-filled.
  const label = `p=${Number(bar.validity_p).toPrecision(2)} · ` +
    `top ${pct(bar.percentile)}${thin ? " · reduced" : ""}`;
  const chip = el("span", `bar-chip ${passes ? "passes" : "provisional"} tip`, label);

  const parts = [
    "DESIGN §3's two-leg bar. Leg 1 (validity): an exhaustive permutation of a " +
    "PERMANOVA pseudo-F over every way of splitting these creators into the " +
    "observed group sizes, each creator counting once — does the cross-side gap " +
    `exceed the spread among same-side creators? p=${Number(bar.validity_p).toPrecision(3)}. `,
    "Leg 2 (specificity): where this term's divergence falls among " +
    `${Number(bar.pool_n || 0).toLocaleString("en-US")} arbitrary words of the same ` +
    `occurrence mass — top ${pct(bar.percentile)}, and it must be in the top ` +
    `${pct((bar.thresholds || {}).specificity ?? 0.05)} to clear. `,
  ];
  if (thin) {
    parts.push(
      "REDUCED RESOLUTION: fewer than 40 same-mass peers exist for this term, " +
      "so leg 2 is calibrated against a short pool. The band is reported short " +
      "rather than widened, because widening it would answer a different " +
      "question. ");
  }
  if (passes) {
    parts.push(
      "Both legs clear. Composite false-positive rate 3.1%, measured on 225 " +
      "frequency-matched arbitrary words — against 74.7% for leg 1 alone, " +
      "which is why leg 2 exists.");
  } else if (failed.length === 1 && failed[0] === "specificity") {
    parts.push(
      "PROVISIONAL — side-linked, but within the range of ordinary " +
      "same-frequency topic separation at this corpus size. The difference is " +
      "real; what is not established is that it is about this word.");
  } else if (failed.length === 1 && failed[0] === "validity") {
    parts.push(
      "PROVISIONAL — creator-level variation explains a gap this size, so this " +
      "is a proposal, not a community difference.");
  } else {
    parts.push(
      "PROVISIONAL — neither leg clears: the gap is inside same-side spread " +
      "AND inside ordinary same-frequency topic separation.");
  }
  if (bar.caveat) parts.push(` ${bar.caveat}.`);

  // The BH diagnostic, discovered lane only, explicitly not the verdict.
  const d = bar.diagnostic;
  if (d && d.perm_q != null) {
    parts.push(
      ` Diagnostic, NOT the gate: pooled permutation q=${Number(d.perm_q).toPrecision(2)}. ` +
      `Its null is ${d.null || "different from the gate's"} — it answers a ` +
      "different question and certifies far too much, so it is reported rather " +
      "than relied on.");
  }
  chip.dataset.tip = parts.join("");
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
  // Preserve the EXPORT's order rather than re-sorting. It orders by keyness
  // deliberately (#101): the `rank` score is anti-correlated with being a
  // concept at all — it buries `biblical inerrancy` at position 1500 — and
  // re-sorting here by rank silently undid that, putting `christian
  // apologists` sixth behind `right or wrong`.
  const sorted = state.candidates;

  // Say what this pool is and is not, in the panel rather than only in a
  // tooltip — a reader who never hovers is exactly the reader who would take
  // these for findings. The genericness is measured, not an apology: every
  // candidate already clears the distinctiveness floor, so what is on display
  // is the lane's BEST output, not its unfiltered tail.
  // Count in the summary, so the pool is legible while closed — collapsing it
  // must hide the SPACE it took, not the fact that it exists.
  const count = $("candidate-count");
  if (count) count.textContent = ` (${sorted.length})`;

  const note = $("candidate-disclosure");
  if (note) {
    note.textContent =
      `${sorted.length} unpinned phrase${sorted.length === 1 ? "" : "s"}, ranked ` +
      "and NOT gated: none has been through the two-leg significance bar that " +
      "every term above publishes. Multi-word phrases in this corpus are " +
      "mostly common-word combinations, so treat these as raw proposals to " +
      "pin from — the score orders the pool, it does not certify anything.";
  }

  for (const c of sorted) {
    const b = el("button", "term-btn");
    b.type = "button";
    // Show the score the list is ORDERED by. Showing `rank` beside a
    // keyness ordering reads as a sorting bug.
    const score = c.keyness != null ? c.keyness.toFixed(1) : c.rank.toFixed(2);
    const n = el("span", "n tip", score);
    n.dataset.tip = c.keyness != null
      ? "Keyness: how much more this phrase is used here than in general "
        + "English. The pool is ordered by it, because the ranking score is "
        + "anti-correlated with being a concept at all."
      : "Layer-2 rank (balance x divergence x dispersion).";
    b.append(el("span", "", c.surface), n);
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

function fmtTime(t) {
  // Rolls over past an hour: this corpus is long-form, and a two-hour video
  // rendered "128:23" reads as a bug rather than a timestamp.
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

// The citation line under a quote, deep-linked to the second it was said (#139)
// — the affordance the Verse Explorer already had and this page did not.
//
// Degrades rather than breaks: a quote with no video_id/t still renders its
// attribution as plain text. That matters because the two lanes reach a
// timestamp differently — the pinned lane reads occurrences.start_time_s, while
// a DISCOVERED term is unextracted and takes the segment start off the token
// stream — and because a cached JSON from before this change carries neither.
function citeLine(q, label) {
  const who = [q.creator, label].filter(Boolean).join(" · ");
  if (!q.video_id || q.t == null) return el("p", "quote-cite", `— ${who}`);
  const p = el("p", "quote-cite", `— ${who} · `);
  const a = el("a", null, `watch @ ${fmtTime(q.t)}`);
  a.href = `https://www.youtube.com/watch?v=${encodeURIComponent(q.video_id)}` +
    `&t=${Math.max(0, Math.floor(q.t))}s`;
  a.target = "_blank";
  a.rel = "noopener";
  a.title = "Opens the source video at this line — the claim in context, " +
    "which is where DESIGN §3 says every claim must be checkable.";
  p.append(a);
  return p;
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
      div.append(citeLine(q, label));
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
