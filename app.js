/* Contested Language evidence browser — Atlas shell.
   Static site over derived JSON artifacts (see contested/analysis.py
   export_analysis). Governing rule unchanged: every displayed number resolves
   to the KWIC concordance lines behind it, each line timestamped into its
   source video. All text is inserted via textContent — transcript data is data.

   Changes from the pre-Atlas app.js:
   - grouping pills render in the sidebar (#grouping-pills); cell tabs stay in
     the collocates card (data-driven, unchanged).
   - evidence renders into the persistent right-hand tray; no scrollIntoView.
   - sidebar role/year chips FILTER THE DISPLAYED EVIDENCE LINES client-side
     (they narrow the sample, never the corpus — the note says when they do);
     active-filter count + Clear all in the sidebar footer.
   - term search input filters the term nav.
   - re-renders the chart on `themechange` so it picks up the new CSS vars. */
"use strict";

const DATA = "data";
const state = {
  meta: null, rates: null, collocs: null, kwicIndex: null,
  kwicCache: {},               // phrase -> {lines, sample}
  profilesIndex: null,         // phrase -> {file, profiles, stale} (Layer 4)
  profilesCache: {},           // phrase -> {profiles, lines}
  term: null, grouping: "overall", cell: "overall",
  fRoles: new Set(), fYears: new Set(),   // empty = no filter
  lastEvidence: null,          // {title, note, lines, term, collocate}
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const GROUPING_LABELS = { overall: "whole corpus", year: "by year", role: "by role", creator: "by creator" };
const groupingLabel = (g) => GROUPING_LABELS[g] || ("by " + g);
const cellLabel = (c) => (c === "None" || c === null ? "undated" : c);

function minN() { return state.meta.parameters.min_n; }

// ---- term matching (for KWIC highlighting) ----------------------------------

function phraseRegex(words) {
  return words.map(esc).join("[\\s\\-]+");
}
function termRegex(term) {
  const t = state.meta.terms.find((t) => t.phrase === term);
  const pats = [t.phrase, ...(t.variants || [])]
    .map((p) => phraseRegex(p.split(/\s+/)));
  return new RegExp("\\b(?:" + pats.join("|") + ")\\b", "gi");
}
function collocRegex(token) {
  return new RegExp("\\b" + phraseRegex(token.split("_")) + "\\b", "gi");
}

/* Build a highlighted context: term matches bold, collocate matches washed.
   Non-overlapping, term wins. Safe by construction: text nodes + <mark>. */
function highlightContext(text, term, collocate) {
  const spans = [];
  const collect = (rx, cls) => {
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(text)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length, cls });
      if (m.index === rx.lastIndex) rx.lastIndex++;
    }
  };
  collect(termRegex(term), "term");
  if (collocate) collect(collocRegex(collocate), "collocate");
  spans.sort((a, b) => a.start - b.start || (a.cls === "term" ? -1 : 1));
  const p = el("p", "kwic-context");
  let pos = 0;
  for (const s of spans) {
    if (s.start < pos) continue;                      // overlap: first wins
    if (s.start > pos) p.append(text.slice(pos, s.start));
    p.append(el("mark", s.cls === "collocate" ? "collocate" : "", text.slice(s.start, s.end)));
    pos = s.end;
  }
  if (pos < text.length) p.append(text.slice(pos));
  return p;
}

// ---- data loading ------------------------------------------------------------

async function loadKwic(term) {
  if (!state.kwicCache[term]) {
    state.kwicCache[term] = await fetchJSON("kwic/" + state.kwicIndex[term]);
  }
  return state.kwicCache[term];
}

// ---- rates helpers -----------------------------------------------------------

function rateCells(term, groupBy) {
  return state.rates[groupBy].filter((c) => c.term === term);
}
function overallCell(term) {
  return rateCells(term, "overall")[0];
}

// ---- sidebar: term nav + search ------------------------------------------------

function renderNav() {
  const wrap = $("term-list");
  const q = $("term-search").value.trim().toLowerCase();
  wrap.replaceChildren();
  let shown = 0;
  for (const [status, label] of [["active", "Curated lexicon"], ["watchlist", "Watchlist"]]) {
    const terms = state.meta.terms.filter((t) =>
      t.status === status && (!q || t.phrase.toLowerCase().includes(q)));
    if (!terms.length) continue;
    shown += terms.length;
    wrap.append(el("div", "term-group-label", label.toUpperCase()));
    terms.sort((a, b) =>
      (b.dispersion?.weighted ?? 0) - (a.dispersion?.weighted ?? 0) ||
      a.phrase.localeCompare(b.phrase));
    for (const t of terms) {
      const b = el("button", "term-btn");
      b.type = "button";
      b.append(el("span", "", t.phrase), el("span", "n", fmt(overallCell(t.phrase).n)));
      const d = t.dispersion;
      if (d) {
        const badge = el("span", "range-badge",
          `${d.creator_range}/${d.n_creators}`);
        badge.title = d.status === "too-concentrated"
          ? "used by too few creators to disperse — likely one creator's idiolect"
          : `shared across ${d.creator_range} of ${d.n_creators} creators`;
        b.append(badge);
      }
      b.dataset.term = t.phrase;
      b.setAttribute("aria-current", String(t.phrase === state.term));
      b.addEventListener("click", () => selectTerm(t.phrase));
      wrap.append(b);
    }
  }
  // #254: a no-match search used to leave this panel blank, which reads as
  // a loading failure rather than "nothing matched" -- every other empty
  // state on the site discloses itself.
  if (!shown && q) {
    wrap.append(el("p", "term-empty-note", `No terms match "${q}".`));
  }
}

// ---- sidebar: evidence filters (role / year) -----------------------------------
// These narrow which sampled concordance lines are DISPLAYED. They never touch
// the counts, rates, or profiles — those always describe the whole cell.

function evidenceFilterValues() {
  const roles = [...new Set(state.rates.role.map((c) => c.group))].filter(Boolean).sort();
  const years = [...new Set(state.rates.year.map((c) => c.group))].filter(Boolean).sort();
  return { roles, years };
}

function renderFilterChips() {
  const { roles, years } = evidenceFilterValues();
  const build = (host, values, set) => {
    const row = $(host);
    row.replaceChildren();
    for (const v of values) {
      const b = el("button", "chip", cellLabel(v));
      b.type = "button";
      b.setAttribute("aria-pressed", String(set.has(v)));
      b.addEventListener("click", () => {
        set.has(v) ? set.delete(v) : set.add(v);
        onFiltersChanged();
      });
      row.append(b);
    }
  };
  build("role-chips", roles, state.fRoles);
  build("year-chips", years, state.fYears);

  const badge = (id, set) => {
    const e = $(id);
    e.textContent = set.size ? `${set.size} selected` : "all";
    e.classList.toggle("on", set.size > 0);
  };
  badge("role-badge", state.fRoles);
  badge("year-badge", state.fYears);

  const n = (state.fRoles.size ? 1 : 0) + (state.fYears.size ? 1 : 0);
  $("active-count").textContent = String(n);
  $("active-word").textContent = n === 1 ? "filter" : "filters";
}

function onFiltersChanged() {
  renderFilterChips();
  if (state.lastEvidence) {
    const { title, note, lines, term, collocate } = state.lastEvidence;
    renderEvidence(title, note, lines, term, collocate);
  }
}

function lineMatchesFilters(ln) {
  if (state.fRoles.size && !state.fRoles.has(ln.role)) return false;
  if (state.fYears.size) {
    const y = ln.published_at ? ln.published_at.slice(0, 4) : null;
    if (!y || !state.fYears.has(y)) return false;
  }
  return true;
}

// ---- term view ---------------------------------------------------------------

function selectTerm(term) {
  state.term = term;
  state.grouping = "overall";
  state.cell = "overall";
  for (const b of document.querySelectorAll(".term-btn")) {
    b.setAttribute("aria-current", String(b.dataset.term === term));
  }
  $("placeholder").hidden = true;
  $("term-view").hidden = false;

  $("term-title").textContent = term;
  const t = state.meta.terms.find((x) => x.phrase === term);
  $("term-variants").textContent = t.variants && t.variants.length
    ? "counted with variants: " + t.variants.join(", ")
    : "no variants counted";

  renderStatRow(term);
  renderChart(term);
  renderRoleTable(term);
  renderGroupingPills(term);
  renderCollocBody(term);
  renderProfiles(term);
  showSampleEvidence(term, "overall", "overall");
}

// ---- Layer 4 sense profiles --------------------------------------------------

// Every claim on this card is computed from HOST speech only. That guard is
// silent by default, so a creator can truthfully say a large share of their
// words was discarded before anyone characterised them (DESIGN §7.6 —
// interpretive exposure). This states the share alongside the claims.
//
// Returns null when the share was never measured. An absent measurement must
// never render as a measured zero: 'we did not look' and 'nothing was
// excluded' are different claims, and only one of them is honest.
function cellExposure(cell) {
  const exp = (state.meta || {}).non_host_exposure;
  if (!exp) return null;
  let host = 0;
  let nonHost = 0;
  if (cell === "overall") {
    for (const v of Object.values(exp)) {
      host += v.host_words;
      nonHost += v.non_host_words;
    }
    // meta.words is the host-only corpus total, so it is an exact check that
    // the exposure map covers every creator. If it does not, summing the map
    // and calling the result "the whole corpus" would understate the excluded
    // share by however many creators are missing — a partial figure presented
    // as a complete one. Say nothing rather than say that.
    if (host !== state.meta.words) return null;
  } else {
    const v = exp[cell.split("=", 2)[1]];
    if (!v) return null;
    host = v.host_words;
    nonHost = v.non_host_words;
  }
  const total = host + nonHost;
  if (!total) return null;

  const row = el("p", "profile-exposure");
  const pct = el("span", "tip",
    `${((nonHost / total) * 100).toFixed(1)}% of transcribed words excluded as non-host`);
  // analysis.non_host_exposure buckets every role that is not exactly 'host'
  // into non_host, so unresolved attribution lands here too. That makes the
  // number an UPPER bound on other people's speech, not an exact measure --
  // say so, rather than implying a precision the guard does not have.
  pct.setAttribute("data-tip",
    "Every figure on this card counts host speech only. This is the share of " +
    "transcribed words not positively attributed to the channel host — guests, " +
    "embedded clips and debate opponents, but also speech whose speaker " +
    "attribution is still unresolved. It is therefore an upper bound on other " +
    "people's speech: a high figure on a solo channel means attribution needs " +
    "work, not that the channel is full of guests.");
  row.append(pct);
  row.append(el("span", "profile-exposure-n",
    ` · ${fmt(nonHost)} of ${fmt(total)} words`));
  return row;
}

async function renderProfiles(term) {
  const card = $("profiles-card");
  const entry = (state.profilesIndex || {})[term];
  if (!entry) { card.hidden = true; return; }
  if (!state.profilesCache[term]) {
    try {
      state.profilesCache[term] = await fetchJSON("profiles/" + entry.file);
    } catch { card.hidden = true; return; }
  }
  if (state.term !== term) return;      // user moved on mid-fetch
  const doc = state.profilesCache[term];
  const body = $("profiles-body");
  body.replaceChildren();

  const models = [...new Set(doc.profiles.map((p) => p.model))];
  const stale = doc.profiles.filter((p) => p.stale).length;
  $("profiles-provenance").textContent =
    `Generated by ${models.join(", ")} (prompt v${doc.profiles[0].prompt_version}) ` +
    "from the sampled concordance lines only — every claim cites the lines " +
    "it derives from; claims without resolvable evidence were dropped " +
    "before publication." +
    (stale ? ` ${stale} profile${stale === 1 ? " is" : "s are"} marked stale: ` +
             "the underlying data changed since generation — regenerate with " +
             "\`python3 -m contested generate-profiles\`." : "");

  const cells = [...new Set(doc.profiles.map((p) => p.cell))]
    .sort((a, b) => (a === "overall" ? -1 : b === "overall" ? 1 : a.localeCompare(b)));
  for (const cell of cells) {
    const cellLabelTxt = cell === "overall"
      ? "Whole corpus" : "Creator: " + cell.split("=", 2)[1];
    body.append(el("h4", "profile-cell-head", cellLabelTxt));
    const exposure = cellExposure(cell);
    if (exposure) body.append(exposure);
    for (const p of doc.profiles.filter((x) => x.cell === cell)) {
      const block = el("div", "profile-block");
      const head = el("div", "profile-head");
      head.append(el("span", "profile-sense", `sense ${p.sense + 1} of ${p.k}`));
      head.append(el("span", "profile-n", `n=${fmt(p.n)}`));
      if (p.stale) head.append(el("span", "stale-chip", "stale — data changed"));
      block.append(head);
      for (const c of p.claims) {
        const row = el("div", "claim-row");
        row.append(el("span", "aspect-chip", c.aspect));
        row.append(el("span", "claim-text", c.text));
        const b = el("button", "lines-btn",
          `${c.evidence.length} line${c.evidence.length === 1 ? "" : "s"} →`);
        b.type = "button";
        b.addEventListener("click", () => showClaimEvidence(term, p, c, doc));
        row.append(b);
        block.append(row);
      }
      body.append(block);
    }
  }
  card.hidden = false;
}

function showClaimEvidence(term, profile, claim, doc) {
  const lines = claim.evidence.map((i) => doc.lines[String(i)])
    .filter(Boolean).sort(lineSorter);
  const cellTxt = profile.cell === "overall"
    ? "whole corpus" : profile.cell.replace("=", " = ");
  renderEvidence(
    `“${term}” sense ${profile.sense + 1} — evidence behind a claim (${cellTxt})`,
    `The ${lines.length} concordance lines this claim was derived from ` +
    `(“${claim.text}”). The model saw only sampled lines like these; ` +
    "if they don't show a reader the claim, the claim is wrong.",
    lines, term, null);
}

function renderStatRow(term) {
  const row = $("stat-row");
  row.replaceChildren();
  const o = overallCell(term);

  const occ = el("button", "stat-tile");
  occ.type = "button";
  occ.append(el("span", "label", "Occurrences"),
             el("span", "value", fmt(o.n)),
             el("span", "sub link", "view concordance →"));
  occ.addEventListener("click", () => showSampleEvidence(term, "overall", "overall"));
  row.append(occ);

  const rate = el("div", "stat-tile");
  if (o.status === "ok") {
    rate.append(el("span", "label", "Rate per million words"),
                el("span", "value", o.rate_pmw.toFixed(1)),
                el("span", "sub", `95% CI ${o.ci_low_pmw.toFixed(1)}–${o.ci_high_pmw.toFixed(1)}`));
  } else {
    rate.append(el("span", "label", "Rate per million words"),
                el("span", "value", "—"),
                el("span", "sub", `n = ${o.n} < ${minN()}: insufficient data`));
  }
  row.append(rate);
}

// ---- rate-over-time chart (unchanged logic; re-renders on theme change) --------

function niceTicks(maxVal) {
  if (maxVal <= 0) return { max: 1, step: 1 };
  const raw = maxVal / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  return { max: Math.ceil(maxVal / step) * step, step };
}

function renderChart(term) {
  const cells = rateCells(term, "year").filter((c) => c.group !== null)
    .sort((a, b) => a.group.localeCompare(b.group));
  const svg = $("rate-chart");
  svg.replaceChildren();
  const NS = "http://www.w3.org/2000/svg";
  const W = 760, H = 300, L = 56, R = 20, T = 18, B = 46;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const plotW = W - L - R, plotH = H - T - B, bottom = T + plotH;
  const mk = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const css = getComputedStyle(document.documentElement);
  const C = (name) => css.getPropertyValue(name).trim();

  const ok = cells.filter((c) => c.status === "ok");
  const x = (i) => L + ((i + 0.5) / cells.length) * plotW;
  const { max: yMax, step } = niceTicks(Math.max(1, ...ok.map((c) => c.ci_high_pmw)));
  const y = (v) => bottom - (v / yMax) * plotH;

  svg.setAttribute("aria-label",
    `Rate of “${term}” per million words by publish year. ` +
    ok.map((c) => `${c.group}: ${c.rate_pmw.toFixed(1)}`).join(", ") + ".");

  for (let v = 0; v <= yMax; v += step) {
    svg.append(mk("line", { x1: L, x2: W - R, y1: y(v), y2: y(v),
      stroke: v === 0 ? C("--baseline") : C("--gridline"), "stroke-width": 1 }));
    const lab = mk("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end",
      "font-size": 11, fill: C("--text-muted") });
    lab.textContent = fmt(v);
    svg.append(lab);
  }
  cells.forEach((c, i) => {
    const lab = mk("text", { x: x(i), y: bottom + 18, "text-anchor": "middle",
      "font-size": 11, fill: C("--text-muted") });
    lab.textContent = c.group;
    svg.append(lab);
  });

  for (const c of ok) {
    const i = cells.indexOf(c), xi = x(i);
    svg.append(mk("line", { x1: xi, x2: xi, y1: y(c.ci_low_pmw), y2: y(c.ci_high_pmw),
      stroke: C("--series-1"), "stroke-width": 1.5, opacity: 0.45 }));
    for (const v of [c.ci_low_pmw, c.ci_high_pmw]) {
      svg.append(mk("line", { x1: xi - 4, x2: xi + 4, y1: y(v), y2: y(v),
        stroke: C("--series-1"), "stroke-width": 1.5, opacity: 0.45 }));
    }
  }

  if (ok.length > 1) {
    const d = ok.map((c, k) =>
      `${k ? "L" : "M"}${x(cells.indexOf(c))},${y(c.rate_pmw)}`).join("");
    svg.append(mk("path", { d, fill: "none", stroke: C("--series-1"),
      "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  }

  cells.forEach((c, i) => {
    let dot;
    if (c.status === "ok") {
      dot = mk("circle", { cx: x(i), cy: y(c.rate_pmw), r: 5,
        fill: C("--series-1"), stroke: C("--surface-1"), "stroke-width": 2 });
    } else {
      dot = mk("circle", { cx: x(i), cy: bottom, r: 4.5,
        fill: C("--surface-1"), stroke: C("--text-muted"),
        "stroke-width": 1.5, "stroke-dasharray": "2 2" });
    }
    dot.setAttribute("tabindex", "0");
    dot.setAttribute("role", "button");
    dot.style.cursor = "pointer";
    dot.addEventListener("focus", () => showChartTooltip(i, cells, x, y));
    dot.addEventListener("blur", hideChartTooltip);
    dot.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        showSampleEvidence(term, "year", c.group);
      }
    });
    svg.append(dot);
  });

  const last = ok[ok.length - 1];
  if (last) {
    const lab = mk("text", { x: x(cells.indexOf(last)) + 9, y: y(last.rate_pmw) - 8,
      "font-size": 12, "font-weight": 650, fill: C("--text-primary") });
    lab.textContent = last.rate_pmw.toFixed(1);
    svg.append(lab);
  }

  const hair = mk("line", { y1: T, y2: bottom, stroke: C("--baseline"),
    "stroke-width": 1, visibility: "hidden" });
  svg.append(hair);
  const hit = mk("rect", { x: L, y: T, width: plotW, height: plotH,
    fill: "transparent" });
  hit.style.cursor = "pointer";
  const nearest = (ev) => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    let best = 0;
    cells.forEach((_, i) => { if (Math.abs(x(i) - p.x) < Math.abs(x(best) - p.x)) best = i; });
    return best;
  };
  hit.addEventListener("pointermove", (ev) => {
    const i = nearest(ev);
    hair.setAttribute("x1", x(i));
    hair.setAttribute("x2", x(i));
    hair.setAttribute("visibility", "visible");
    showChartTooltip(i, cells, x, y);
  });
  hit.addEventListener("pointerleave", () => {
    hair.setAttribute("visibility", "hidden");
    hideChartTooltip();
  });
  hit.addEventListener("click", (ev) => {
    const c = cells[nearest(ev)];
    if (c.n > 0) showSampleEvidence(term, "year", c.group);
  });
  svg.append(hit);

  const insuff = cells.filter((c) => c.status !== "ok");
  $("chart-caption").textContent =
    (insuff.length
      ? `Hollow markers on the axis: ${insuff.map((c) => `${c.group} (n=${c.n})`).join(", ")} — ` +
        `below the minimum of ${minN()} occurrences, no rate is plotted. `
      : "") +
    "Whiskers are exact 95% Poisson intervals. Click a year to read its concordance lines.";

  renderChartTable(term, cells);
}

function showChartTooltip(i, cells, x, y) {
  const c = cells[i];
  const tip = $("chart-tooltip");
  tip.replaceChildren();
  tip.append(el("div", "tt-label", c.group));
  if (c.status === "ok") {
    tip.append(el("div", "tt-value", `${c.rate_pmw.toFixed(1)} /M words`));
    tip.append(el("div", "tt-label",
      `95% CI ${c.ci_low_pmw.toFixed(1)}–${c.ci_high_pmw.toFixed(1)} · n=${fmt(c.n)} in ${fmt(c.words)} words`));
  } else {
    tip.append(el("div", "tt-value", `n = ${c.n}`));
    tip.append(el("div", "tt-label", `insufficient data (min ${minN()}) — no rate shown`));
  }
  tip.hidden = false;
  const svgBox = $("rate-chart").getBoundingClientRect();
  const sx = svgBox.width / 760;
  const px = x(i) * sx;
  tip.style.left = Math.min(px + 14, svgBox.width - tip.offsetWidth - 8) + "px";
  tip.style.top = "14px";
}
function hideChartTooltip() { $("chart-tooltip").hidden = true; }

function renderChartTable(term, cells) {
  const table = $("chart-table");
  table.replaceChildren();
  const head = el("tr");
  for (const [h, num] of [["Year", 0], ["n", 1], ["Rate /M", 1], ["95% CI", 1], ["Words", 1]]) {
    head.append(el("th", num ? "num" : "", h));
  }
  table.append(head);
  for (const c of cells) {
    const tr = el("tr", c.n > 0 ? "clickable" : "");
    tr.append(el("td", "", c.group));
    tr.append(el("td", "num", fmt(c.n)));
    if (c.status === "ok") {
      tr.append(el("td", "num", c.rate_pmw.toFixed(1)));
      tr.append(el("td", "num", `${c.ci_low_pmw.toFixed(1)}–${c.ci_high_pmw.toFixed(1)}`));
    } else {
      tr.append(el("td", "num insufficient", "insufficient"), el("td", "num", "—"));
    }
    tr.append(el("td", "num", fmt(c.words)));
    if (c.n > 0) tr.addEventListener("click", () => showSampleEvidence(term, "year", c.group));
    table.append(tr);
  }
}

// ---- role table --------------------------------------------------------------

function renderRoleTable(term) {
  const table = $("role-table");
  table.replaceChildren();
  const cells = rateCells(term, "role").sort((a, b) => b.n - a.n);
  const head = el("tr");
  for (const [h, num] of [["Role", 0], ["n", 1], ["Rate /M", 1], ["95% CI", 1], ["Words", 1], ["", 0]]) {
    head.append(el("th", num ? "num" : "", h));
  }
  table.append(head);
  for (const c of cells) {
    const tr = el("tr", c.n > 0 ? "clickable" : "");
    tr.append(el("td", "", cellLabel(c.group)));
    tr.append(el("td", "num", fmt(c.n)));
    if (c.status === "ok") {
      tr.append(el("td", "num", c.rate_pmw.toFixed(1)));
      tr.append(el("td", "num", `${c.ci_low_pmw.toFixed(1)}–${c.ci_high_pmw.toFixed(1)}`));
    } else {
      tr.append(el("td", "num insufficient", "insufficient"), el("td", "num", "—"));
    }
    tr.append(el("td", "num", fmt(c.words)));
    const td = el("td");
    if (c.n > 0) {
      const b = el("button", "lines-btn", "lines →");
      b.type = "button";
      td.append(b);
      tr.addEventListener("click", () => showSampleEvidence(term, "role", c.group));
    }
    tr.append(td);
    table.append(tr);
  }
}

// ---- collocates --------------------------------------------------------------

function renderGroupingPills(term) {
  const row = $("grouping-pills");
  row.replaceChildren();
  const available = state.meta.groupings.filter((g) => state.collocs[term][g]);
  for (const g of available) {
    const b = el("button", "chip", groupingLabel(g));
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(g === state.grouping));
    b.addEventListener("click", () => {
      state.grouping = g;
      const cells = Object.keys(state.collocs[term][g]);
      state.cell = defaultCell(term, g, cells);
      renderGroupingPills(term);
      renderCollocBody(term);
    });
    row.append(b);
  }
}

function defaultCell(term, grouping, cells) {
  if (grouping === "overall") return "overall";
  if (grouping === "year") return cells.filter((c) => c !== "None").sort().pop() || cells[0];
  return cells.sort((a, b) =>
    state.collocs[term][grouping][b].node_n - state.collocs[term][grouping][a].node_n)[0];
}

function renderCollocBody(term) {
  const cellRow = $("cell-tabs");
  cellRow.replaceChildren();
  const g = state.grouping;
  const profiles = state.collocs[term][g];
  let cells = Object.keys(profiles);
  if (g === "year") cells.sort();
  else cells.sort((a, b) => profiles[b].node_n - profiles[a].node_n);
  cellRow.hidden = g === "overall";
  if (!profiles[state.cell]) state.cell = defaultCell(term, g, cells);
  for (const c of cells) {
    const b = el("button", "tab-btn",
      `${cellLabel(c)} · n=${fmt(profiles[c].node_n)}`);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(c === state.cell));
    b.addEventListener("click", () => { state.cell = c; renderCollocBody(term); });
    cellRow.append(b);
  }

  const body = $("colloc-body");
  body.replaceChildren();
  const prof = profiles[state.cell];
  const where = g === "overall" ? "whole corpus" : `${groupingLabel(g)} · ${cellLabel(state.cell)}`;

  if (prof.node_n < minN()) {
    const note = el("div", "insufficient-note");
    note.append(`n = ${fmt(prof.node_n)} in this cell — below the minimum of ${minN()}, ` +
      `so no collocation profile is claimed. `);
    const b = el("button", "lines-btn", `read the ${fmt(prof.node_n)} lines`);
    b.type = "button";
    b.addEventListener("click", () => showSampleEvidence(term, g, state.cell));
    note.append(b);
    body.append(note);
    return;
  }
  if (!prof.collocates.length) {
    body.append(el("div", "insufficient-note",
      `No collocate reached the minimum co-occurrence count (${state.meta.parameters.min_cooc}) in this cell.`));
    return;
  }

  const table = el("table", "data-table");
  const head = el("tr");
  const ths = [
    ["Collocate", 0, "A word that repeatedly appears near the term."],
    ["log-Dice", 1, "Lexical association strength (0–14), comparable across corpus sizes. Above ~7 is a solid collocate."],
    ["PMI", 1, "Pointwise mutual information: how much more often the pair co-occurs than chance. Favors rare pairs — read alongside co-occurrences."],
    ["co-occurrences", 1, `Raw count within a ±${state.meta.parameters.window}-token window. Every count clicks through to its lines.`],
    ["range", 1, "How many creators keep the term's company here, out of those who use the term at all — high = broadly shared, low = one creator's idiolect."],
    ["evidence", 0, null],
  ];
  for (const [h, num, tip] of ths) {
    const th = el("th", num ? "num" : "");
    if (tip) {
      const s = el("span", "tip", h);
      s.dataset.tip = tip;
      th.append(s);
    } else th.textContent = h;
    head.append(th);
  }
  table.append(head);
  let rows = prof.collocates;
  if (g === "overall") {
    rows = rows.slice().sort((a, b) =>
      (b.weighted ?? 0) - (a.weighted ?? 0) || (b.logdice - a.logdice));
  }
  for (const r of rows) {
    const tr = el("tr", "clickable");
    tr.append(el("td", "", r.collocate.replace(/_/g, " ")));
    tr.append(el("td", "num", r.logdice.toFixed(2)));
    tr.append(el("td", "num", r.pmi.toFixed(2)));
    tr.append(el("td", "num", fmt(r.cooc)));
    const hasDisp = r.creator_range !== undefined;
    const rangeTd = el("td", "num", hasDisp ? `${r.creator_range}/${r.n_creators}` : "—");
    if (hasDisp && r.dp === null) rangeTd.classList.add("muted");
    rangeTd.title = !hasDisp
      ? "dispersion is computed across the whole corpus (the overall view)"
      : r.dp === null
        ? "co-occurs in too few creators to disperse"
        : `keeps the term's company across ${r.creator_range} of ${r.n_creators} creators`;
    tr.append(rangeTd);
    const td = el("td");
    const b = el("button", "lines-btn", `${r.evidence.length} lines →`);
    b.type = "button";
    td.append(b);
    tr.append(td);
    tr.addEventListener("click", () => showCollocEvidence(term, g, state.cell, r, where));
    table.append(tr);
  }
  body.append(table);
}

// ---- evidence tray ---------------------------------------------------------

function lineSorter(a, b) {
  return String(a.published_at || "").localeCompare(String(b.published_at || ""))
    || a.occurrence_id - b.occurrence_id;
}

function renderEvidence(title, note, lines, term, collocate) {
  state.lastEvidence = { title, note, lines, term, collocate };
  const shown = lines.filter(lineMatchesFilters);
  $("evidence-title").textContent = title;
  const filtered = shown.length < lines.length;
  $("evidence-note").textContent = note + (filtered
    ? ` Sidebar filters narrow the display to ${shown.length} of these ${lines.length} ` +
      "sampled lines — they never change the counts above."
    : "");
  const wrap = $("evidence-lines");
  wrap.replaceChildren();
  for (const ln of shown) {
    const div = el("div", "kwic-line");
    const meta = el("div", "kwic-meta");
    const date = ln.published_at ? ln.published_at.slice(0, 10) : "undated";
    meta.append(`${date} · ${ln.title || ln.video_id} · `);
    const a = el("a", "", `watch @ ${fmtTime(ln.t)} ↗`);
    a.href = `https://www.youtube.com/watch?v=${encodeURIComponent(ln.video_id)}&t=${Math.max(0, Math.floor(ln.t))}s`;
    a.target = "_blank";
    a.rel = "noopener";
    meta.append(a);
    meta.append(el("span", "role-chip", ln.role));
    div.append(meta);
    div.append(highlightContext(ln.context, term, collocate));
    wrap.append(div);
  }
  if (!shown.length) {
    const note2 = el("div", "insufficient-note",
      "No sampled lines match the current role/year filters — filters narrow " +
      "the display, never the corpus. Clear them to see all sampled lines.");
    wrap.append(note2);
  }
  // The tray is persistent and visible — no scrolling, the page never moves.
}

async function showSampleEvidence(term, grouping, cell) {
  const kw = await loadKwic(term);
  const key = cell === null ? "None" : String(cell);
  const ids = grouping === "overall"
    ? kw.sample.overall
    : (kw.sample[grouping] || {})[key] || [];
  const lines = ids.map((i) => kw.lines[String(i)]).filter(Boolean).sort(lineSorter);
  const cellRate = rateCells(term, grouping).find((c) =>
    grouping === "overall" || String(c.group === null ? "None" : c.group) === key);
  const total = cellRate ? cellRate.n : lines.length;
  const whereTxt = grouping === "overall" ? "whole corpus" : `${grouping} = ${cellLabel(cell)}`;
  renderEvidence(
    `“${term}” — concordance lines (${whereTxt})`,
    lines.length < total
      ? `Date-ordered sample: first ${lines.length} of ${fmt(total)} occurrences in this cell. Each line links to its timestamp in the source video.`
      : `All ${fmt(lines.length)} occurrences in this cell, date-ordered. Each line links to its timestamp in the source video.`,
    lines, term, null);
}

async function showCollocEvidence(term, grouping, cell, row, whereTxt) {
  const kw = await loadKwic(term);
  const lines = row.evidence.map((i) => kw.lines[String(i)]).filter(Boolean).sort(lineSorter);
  const word = row.collocate.replace(/_/g, " ");
  renderEvidence(
    `“${term}” × “${word}” (${whereTxt})`,
    `${lines.length} sampled of ${fmt(row.cooc)} co-occurrences within a ±${state.meta.parameters.window}-token window. Each line links to its timestamp in the source video.`,
    lines, term, row.collocate);
}

// ---- boot --------------------------------------------------------------------

async function init() {
  const [meta, rates, collocs, kwicIndex] = await Promise.all([
    fetchJSON("meta.json"), fetchJSON("rates.json"),
    fetchJSON("collocations.json"), fetchJSON("kwic/index.json"),
  ]);
  Object.assign(state, { meta, rates, collocs, kwicIndex });
  try {
    state.profilesIndex = (await fetchJSON("profiles/index.json")).terms;
  } catch { state.profilesIndex = {}; }   // Layer 4 not exported yet
  $("corpus-stats").textContent =
    // meta.words counts HOST speech only (analysis._word_totals applies
    // HOST_ONLY), so "transcribed words" overstated what it measures by the
    // ~2.0M non-host words it excludes — and disagreed with map.js, which sums
    // creators.json words with no role filter and is correctly labelled.
    `${fmt(meta.videos)} videos · ${fmt(meta.words)} words of host speech · ` +
    `${meta.terms.length} lexicon terms · ${meta.duplicates_excluded} duplicate re-uploads excluded`;
  renderNav();
  renderFilterChips();

  $("term-search").addEventListener("input", renderNav);
  $("clear-filters").addEventListener("click", () => {
    state.fRoles.clear();
    state.fYears.clear();
    onFiltersChanged();
  });
  document.addEventListener("themechange", () => {
    if (state.term) renderChart(state.term);
  });

  // deep link from the creator map: #term=<phrase>&creator=<slug>
  const hash = new URLSearchParams(location.hash.slice(1));
  const linkedTerm = hash.get("term");
  if (linkedTerm && state.meta.terms.some((t) => t.phrase === linkedTerm)) {
    selectTerm(linkedTerm);
    const creator = hash.get("creator");
    if (creator) showSampleEvidence(linkedTerm, "creator", creator);
  }
  $("chart-table-toggle").addEventListener("click", (ev) => {
    const b = ev.currentTarget;
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    $("chart-table").hidden = !on;
    $("chart-wrap").style.display = on ? "none" : "";
  });
}

init().catch((e) => {
  $("corpus-stats").textContent = "failed to load artifacts: " + e.message +
    " — serve this directory over HTTP (python3 -m http.server -d site) and ensure data/ exists.";
});
