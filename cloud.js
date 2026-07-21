/* Contested Language occurrence cloud — Atlas shell.
   Same engine and honesty rules as before (vendored cosmos.gl, simulation
   OFF, fixed PCA positions; filters dim, never remove; per-side counts
   printed while the corpus is unbalanced; clicked points resolve through
   the published KWIC sample or say so). Changes: the filter checkbox walls
   move into collapsible sidebar groups (term/side/creator) with "n of m"
   badges, an always-visible active-filter count, and one Clear all. The sky
   stays dark in both themes so density reads consistently.
   All text lands via textContent. */
"use strict";

const DATA = "data";
const VISIBLE_ALPHA = 0.85;
const DIM_ALPHA = 0.04;
const POINT_SIZE = 3;
const SEL_SIZE = 9;
const SKY_BG = "#0b0e1a";   // fixed dark sky in both themes, like the pilot

const state = {
  doc: null,          // raw columnar artifact
  n: 0,
  graph: null,
  colorBy: "term",
  checked: {},        // dim -> Set of enum codes currently checked
  sel: null,          // selected point index
  sizes: null,
  kwicIndex: null,    // phrase -> file
  kwicDocs: {},
  evidenced: null,    // Uint8Array: 1 = resolves in the published KWIC sample
  evidencedOnly: false,
  suggestionsDone: false,
};

const FILTER_DIMS = ["side", "creator", "term"];   // the decided surface

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

// ---- colors -------------------------------------------------------------------

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

// same hue logic as the galaxy's termHues: terms sorted, hues spread evenly,
// senses of one term share the hue at stepped lightness
function termRgb(termCode, sense) {
  const terms = state.doc.enums.term;
  const hue = Math.round((360 * termCode) / terms.length);
  return hslToRgb(hue, 62, Math.min(48 + sense * 10, 72));
}

const SIDE_RGB = {
  "deconstruction": hslToRgb(214, 72, 58),   // the site's series blue
  "apologetics": hslToRgb(32, 78, 58),       // warm counterpoint
  "": hslToRgb(0, 0, 62),                    // unsided: neutral gray
};

function creatorRgb(code) {
  const n = state.doc.enums.creator.length;
  return hslToRgb(Math.round((360 * code) / n), 60, 60);
}

function pointRgb(i) {
  const c = state.doc.columns;
  if (state.colorBy === "side") {
    return SIDE_RGB[state.doc.enums.side[c.side[i]]] || SIDE_RGB[""];
  }
  if (state.colorBy === "creator") return creatorRgb(c.creator[i]);
  return termRgb(c.term[i], c.sense[i]);
}

function pointVisible(i) {
  const c = state.doc.columns;
  if (state.evidencedOnly && state.evidenced && !state.evidenced[i]) return false;
  return FILTER_DIMS.every((dim) => state.checked[dim].has(c[dim][i]));
}

function recolor() {
  const colors = new Float32Array(state.n * 4);
  let shown = 0;
  for (let i = 0; i < state.n; i++) {
    const [r, g, b] = pointRgb(i);
    const vis = pointVisible(i);
    if (vis) shown += 1;
    colors[4 * i] = r;
    colors[4 * i + 1] = g;
    colors[4 * i + 2] = b;
    colors[4 * i + 3] = vis ? VISIBLE_ALPHA : DIM_ALPHA;
  }
  state.graph.setPointColors(colors);
  state.graph.render(undefined, 0);
  const anyFilter = state.evidencedOnly || FILTER_DIMS.some(
    (dim) => state.checked[dim].size < state.doc.enums[dim].length);
  $("count-line").textContent = anyFilter
    ? `showing ${fmt(shown)} of ${fmt(state.n)} occurrences — ` +
      "filtered-out points are dimmed, never removed"
    : "";
  updateFilterChrome();
  renderLegend();
}

function resize() {
  if (!state.sizes) state.sizes = new Float32Array(state.n).fill(POINT_SIZE);
  const sizes = state.sizes;
  sizes.fill(POINT_SIZE);
  if (state.sel !== null) sizes[state.sel] = SEL_SIZE;
  state.graph.setPointSizes(sizes);
  state.graph.render(undefined, 0);
}

// ---- legend -------------------------------------------------------------------

// ---- legend (clickable — a second way to toggle the same filters) ---------------

function renderLegend() {
  const box = $("cloud-legend");
  box.replaceChildren();
  const dim = state.colorBy;               // term | side | creator
  const entries = dim === "term"
    ? state.doc.enums.term.map((t, i) => [t, termRgb(i, 0)])
    : dim === "side"
      ? state.doc.enums.side.map((s) => [s || "unsided", SIDE_RGB[s]])
      : state.doc.enums.creator.map((cr, i) => [cr, creatorRgb(i)]);
  entries.forEach(([label, [r, g, b]], code) => {
    const item = el("button", "legend-item");
    item.type = "button";
    item.style.pointerEvents = "auto";     // container is pointer-events:none
    item.style.cursor = "pointer";
    item.style.background = "none";
    item.style.border = "0";
    item.style.padding = "0";
    item.style.font = "inherit";
    const on = state.checked[dim].has(code);
    item.style.opacity = on ? "1" : "0.35";
    item.title = (on ? "dim" : "undim") + ` ${label} — same as the sidebar chip`;
    const dot = el("span", "legend-dot");
    dot.style.background =
      `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
    item.append(dot, label);
    item.addEventListener("click", () => {
      on ? state.checked[dim].delete(code) : state.checked[dim].add(code);
      const chip = document.querySelector(
        `.chip[data-dim="${dim}"][data-code="${code}"]`);
      if (chip) chip.setAttribute("aria-pressed", String(!on));
      recolor();
    });
    box.append(item);
  });
}

// ---- term centers ---------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";
const mkSvg = (tag, attrs) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function buildCentroids() {
  const c = state.doc.columns;
  const counts = state.doc.enums.term.map(() => 0);
  for (let i = 0; i < state.n; i++) counts[c.term[i]] += 1;
  const svg = $("centroid-layer");
  state.centroids = counts
    .map((n, code) => ({ code, term: state.doc.enums.term[code], n }))
    .filter((cen) => cen.n > 0)
    .sort((a, b) => b.n - a.n);          // big terms claim their spot first
  for (const cen of state.centroids) {
    const [r, g, b] = termRgb(cen.code, 2);
    const rgb = `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ` +
                `${Math.round(b * 255)})`;
    cen.el = mkSvg("g", {});
    cen.line = mkSvg("line", { stroke: "#8a8a97", "stroke-width": 1 });
    cen.dot = mkSvg("circle", { r: 3.5, fill: rgb, stroke: "#0b0e1a",
                                "stroke-width": 1.5 });
    cen.text = mkSvg("text", { fill: rgb });
    cen.text.textContent = cen.term;
    cen.el.append(cen.line, cen.dot, cen.text);
    svg.append(cen.el);
  }
}

// cosmos rescales the input data into its internal space on upload;
// spaceToScreenPosition speaks that space, so centroids are averaged over
// getPointPositions() (the rescaled coordinates), not the raw data columns
function computeCentroidSpace() {
  const pos = state.graph.getPointPositions();
  if (!pos || pos.length !== 2 * state.n) return false;
  const t = state.doc.columns.term;
  const m = state.doc.enums.term.length;
  const ax = new Float64Array(m), ay = new Float64Array(m);
  for (let i = 0; i < state.n; i++) {
    ax[t[i]] += pos[2 * i];
    ay[t[i]] += pos[2 * i + 1];
  }
  for (const cen of state.centroids) {
    cen.x = ax[cen.code] / cen.n;
    cen.y = ay[cen.code] / cen.n;
  }
  return true;
}

function layoutCentroids() {
  const svg = $("centroid-layer");
  if (svg.style.display === "none" || !state.centroids) return;
  if (!state.centroidSpaceReady) {
    if (!computeCentroidSpace()) return;
    state.centroidSpaceReady = true;
  }
  const rect = $("cloud").getBoundingClientRect();
  const t = state.graph.zoomInstance.eventTransform;
  const stamp = `${t.k}|${t.x}|${t.y}|${rect.width}|${rect.height}|` +
                [...state.checked.term].sort().join(",");
  if (stamp === state.centroidStamp) return;
  state.centroidStamp = stamp;
  svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  const placed = [];
  const collides = (b) => placed.some((o) =>
    b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1);
  for (const cen of state.centroids) {
    const [sx, sy] = state.graph.spaceToScreenPosition([cen.x, cen.y]);
    if (!Number.isFinite(sx) || !Number.isFinite(sy) ||
        sx < -30 || sx > rect.width + 30 || sy < -30 || sy > rect.height + 30) {
      cen.el.setAttribute("display", "none");
      continue;
    }
    cen.el.removeAttribute("display");
    cen.el.setAttribute("opacity", state.checked.term.has(cen.code) ? 1 : 0.12);
    const w = 7 * cen.term.length + 10;
    const lx = Math.max(w / 2 + 2, Math.min(rect.width - w / 2 - 2, sx));
    let ly = sy - 12;
    for (const step of [-12, -28, 18, -44, 34, -60, 50, -76, 66]) {
      ly = sy + step;
      if (!collides({ x1: lx - w / 2, x2: lx + w / 2, y1: ly - 12, y2: ly + 4 })) break;
    }
    placed.push({ x1: lx - w / 2, x2: lx + w / 2, y1: ly - 12, y2: ly + 4 });
    cen.dot.setAttribute("cx", sx);
    cen.dot.setAttribute("cy", sy);
    cen.text.setAttribute("x", lx);
    cen.text.setAttribute("y", ly);
    const far = Math.abs(ly - sy) > 20 || Math.abs(lx - sx) > w / 2;
    cen.line.setAttribute("display", far ? "" : "none");
    if (far) {
      cen.line.setAttribute("x1", sx);
      cen.line.setAttribute("y1", sy + (ly > sy ? 4 : -4));
      cen.line.setAttribute("x2", lx);
      cen.line.setAttribute("y2", ly + (ly > sy ? -11 : 3));
    }
  }
}

// ---- sidebar filters ------------------------------------------------------------
// The old full-width checkbox rows become collapsible groups with "n of m"
// badges; chips toggle aria-pressed; the footer shows the active count.

function renderFilters() {
  const wrap = $("filter-groups");
  wrap.replaceChildren();
  for (const dim of FILTER_DIMS) {
    const details = document.createElement("details");
    details.className = "filter-area";
    details.style.borderTop = "0";
    details.open = dim !== "creator";       // the longest list starts closed
    const summary = el("summary");
    summary.append(el("span", "", dim));
    const badge = el("span", "badge", "all");
    badge.dataset.dim = dim;
    summary.append(badge);
    details.append(summary);
    const row = el("div", "chip-row");
    state.doc.enums[dim].forEach((value, code) => {
      const b = el("button", "chip soft", value === "" ? "(unsided)" : value);
      b.type = "button";
      b.dataset.dim = dim;
      b.dataset.code = String(code);
      b.setAttribute("aria-pressed", "true");
      b.addEventListener("click", () => {
        const on = state.checked[dim].has(code);
        on ? state.checked[dim].delete(code) : state.checked[dim].add(code);
        b.setAttribute("aria-pressed", String(!on));
        recolor();
      });
      row.append(b);
    });
    details.append(row);
    wrap.append(details);
  }
}

function updateFilterChrome() {
  let active = state.evidencedOnly ? 1 : 0;
  for (const dim of FILTER_DIMS) {
    const total = state.doc.enums[dim].length;
    const on = state.checked[dim].size;
    if (on < total) active += 1;
    const badge = document.querySelector(`.badge[data-dim="${dim}"]`);
    if (badge) {
      badge.textContent = on < total ? `${on} of ${total}` : "all";
      badge.classList.toggle("on", on < total);
    }
  }
  $("active-count").textContent = String(active);
  $("active-word").textContent = active === 1 ? "filter" : "filters";
}

function clearFilters() {
  for (const dim of FILTER_DIMS) {
    state.checked[dim] = new Set(state.doc.enums[dim].map((_, code) => code));
  }
  state.evidencedOnly = false;
  $("evidenced-only").checked = false;
  for (const b of document.querySelectorAll(".chip[data-dim]")) {
    b.setAttribute("aria-pressed", "true");
  }
  recolor();
}

// ---- tooltip ------------------------------------------------------------------

function pointLabel(i) {
  const c = state.doc.columns, e = state.doc.enums;
  return {
    node: `${e.term[c.term[i]]}|${c.sense[i]}`,
    creator: e.creator[c.creator[i]],
    side: e.side[c.side[i]] || "unsided",
    role: e.role[c.role[i]],
    year: c.year[i] === null ? "?" : String(c.year[i]),
    occ: c.occurrence_id[i],
  };
}

function showTooltip(i, ev) {
  const tip = $("cloud-tooltip");
  const p = pointLabel(i);
  tip.replaceChildren(
    el("div", "tt-value", p.node),
    el("div", "tt-label", `${p.creator} · ${p.side} · ${p.role} · ${p.year}`));
  const wrapRect = $("cloud-wrap").getBoundingClientRect();
  const x = (ev && ev.clientX !== undefined) ? ev.clientX - wrapRect.left : 20;
  const y = (ev && ev.clientY !== undefined) ? ev.clientY - wrapRect.top : 20;
  tip.style.left = `${Math.min(x + 14, wrapRect.width - 170)}px`;
  tip.style.top = `${y + 14}px`;
  tip.hidden = false;
}

function hideTooltip() { $("cloud-tooltip").hidden = true; }

// ---- selection -> evidence panel (no auto-scroll, ever) ------------------------

function kwicBlock(line) {
  const item = el("div", "kwic-line");
  const meta = el("div", "kwic-meta");
  const date = (line.published_at || "?").slice(0, 10);
  const t = Math.round(line.t || 0);
  const a = el("a", "", `${line.title} @ ${Math.floor(t / 60)}:` +
                        `${String(t % 60).padStart(2, "0")}`);
  a.href = `https://www.youtube.com/watch?v=${line.video_id}&t=${t}s`;
  a.target = "_blank";
  a.rel = "noopener";
  meta.append(`[${date}] `, a, " ");
  meta.append(el("span", "role-chip", line.role));
  item.append(meta);
  const ctx = el("p", "kwic-context");
  const text = line.context || "";
  const surf = (line.surface || "").toLowerCase();
  const at = surf ? text.toLowerCase().indexOf(surf) : -1;
  if (at >= 0) {
    ctx.append(text.slice(0, at));
    ctx.append(el("mark", "", text.slice(at, at + surf.length)));
    ctx.append(text.slice(at + surf.length));
  } else {
    ctx.textContent = text;
  }
  item.append(ctx);
  return item;
}

async function kwicDoc(phrase) {
  const file = state.kwicIndex[phrase];
  if (!file) return null;
  if (!state.kwicDocs[file]) {
    state.kwicDocs[file] = await fetchJSON(`kwic/${file}`);
  }
  return state.kwicDocs[file];
}

async function showPoint(i) {
  state.sel = i;
  resize();
  const p = pointLabel(i);
  const term = state.doc.enums.term[state.doc.columns.term[i]];
  $("point-title").textContent = `${p.node} — occurrence #${p.occ}`;
  $("point-attrs").textContent =
    `term "${term}" · sense ${state.doc.columns.sense[i]} · ` +
    `creator ${p.creator} · side ${p.side} · role ${p.role} · ` +
    `year ${p.year}. Position is the shared whole-corpus PCA frame — ` +
    "a projection, not a claim.";
  const link = $("point-term-link");
  link.href = `index.html#term=${encodeURIComponent(term)}` +
              `&creator=${encodeURIComponent(p.creator)}`;
  const box = $("point-evidence");
  box.replaceChildren();
  try {
    const kd = await kwicDoc(term);
    const line = kd && kd.lines[String(p.occ)];
    if (line) {
      box.append(el("p", "evidence-note",
        "This occurrence is in the published concordance sample — the " +
        "quoted line and watch link below are the full evidence chain."));
      box.append(kwicBlock(line));
    } else {
      box.append(el("p", "insufficient-note",
        "This occurrence is not in the published concordance sample — " +
        "the term explorer holds the sampled evidence for this cell."));
    }
  } catch (e) {
    box.append(el("p", "insufficient-note",
      "concordance sample unavailable: " + e.message));
  }
  // the panel is pinned over the sky, so the response to a click is
  // immediate and the viewport never moves — no scrollIntoView
  $("point-overlay").hidden = false;
}

function deselect() {
  if (state.sel === null) return;
  state.sel = null;
  resize();
  $("point-overlay").hidden = true;
}

// ---- evidence flags + worth-a-look suggestions ----------------------------------

async function loadEvidenceFlags() {
  const byTerm = {};
  for (const term of Object.keys(state.kwicIndex)) {
    const kd = await kwicDoc(term);
    if (kd) byTerm[term] = kd.lines;
  }
  const flags = new Uint8Array(state.n);
  const c = state.doc.columns, terms = state.doc.enums.term;
  for (let i = 0; i < state.n; i++) {
    const lines = byTerm[terms[c.term[i]]];
    if (lines && lines[String(c.occurrence_id[i])]) flags[i] = 1;
  }
  state.evidenced = flags;
  let total = 0;
  for (const v of flags) total += v;
  const cb = $("evidenced-only");
  cb.disabled = false;
  $("evidenced-label").append(` (${fmt(total)})`);
}

function computeSuggestions() {
  const pos = state.graph.getPointPositions();
  const c = state.doc.columns, e = state.doc.enums;
  const cenByCode = {};
  for (const cen of state.centroids) cenByCode[cen.code] = cen;
  const spreadSum = new Float64Array(e.term.length);
  const sided = e.side.map((s) => s === "apologetics" || s === "deconstruction");
  const sideAcc = {};
  for (let i = 0; i < state.n; i++) {
    const cen = cenByCode[c.term[i]];
    spreadSum[c.term[i]] += Math.hypot(pos[2 * i] - cen.x, pos[2 * i + 1] - cen.y);
    if (sided[c.side[i]]) {
      const a = sideAcc[c.side[i]] || (sideAcc[c.side[i]] = { x: 0, y: 0, n: 0 });
      a.x += pos[2 * i]; a.y += pos[2 * i + 1]; a.n += 1;
    }
  }
  const sideCodes = Object.keys(sideAcc).map(Number);
  for (const s of sideCodes) { sideAcc[s].x /= sideAcc[s].n; sideAcc[s].y /= sideAcc[s].n; }

  const outliers = [], intruders = [];
  for (let i = 0; i < state.n; i++) {
    if (!state.evidenced[i]) continue;
    const cen = cenByCode[c.term[i]];
    const d = Math.hypot(pos[2 * i] - cen.x, pos[2 * i + 1] - cen.y);
    outliers.push([i, d / (spreadSum[c.term[i]] / cen.n)]);
    if (sideCodes.length === 2 && sided[c.side[i]]) {
      const own = sideAcc[c.side[i]];
      const other = sideAcc[sideCodes.find((s) => s !== c.side[i])];
      const dOwn = Math.hypot(pos[2 * i] - own.x, pos[2 * i + 1] - own.y);
      const dOther = Math.hypot(pos[2 * i] - other.x, pos[2 * i + 1] - other.y);
      intruders.push([i, (dOwn - dOther) / (dOwn + dOther)]);
    }
  }
  const pick = (arr, perKey, total, keyOf) => {
    arr.sort((a, b) => b[1] - a[1]);
    const used = {}, out = [];
    for (const [i] of arr) {
      const k = keyOf(i);
      if ((used[k] || 0) >= perKey) continue;
      used[k] = (used[k] || 0) + 1;
      out.push(i);
      if (out.length >= total) break;
    }
    return out;
  };
  const out = pick(outliers, 1, 5, (i) => c.term[i]);
  const intr = pick(
    intruders.filter(([i, v]) => v > 0 && !out.includes(i)),
    1, 5, (i) => c.creator[i]);
  return [...intr.map((i) => [i, "cross-side"]),
          ...out.map((i) => [i, "unusual context"])];
}

function renderSuggestions() {
  const strip = $("worth-strip");
  const sug = computeSuggestions();
  if (!sug.length) return;
  strip.replaceChildren(el("span", "filter-label", "worth a look"));
  const c = state.doc.columns, e = state.doc.enums;
  for (const [i, why] of sug) {
    const b = el("button", "worth-chip");
    b.type = "button";
    b.append(el("strong", "", e.term[c.term[i]]),
      ` · ${e.creator[c.creator[i]]}` +
      (c.year[i] ? ` ’${String(c.year[i]).slice(2)}` : "") + ` — ${why}`);
    b.addEventListener("click", () => {
      showPoint(i);
      state.graph.zoomToPointByIndex(i, 700);
    });
    strip.append(b);
  }
  strip.append(el("span", "worth-note",
    "ranked by plain geometry on the projected plane (far from the term's " +
    "center; closer to the other side's region), evidenced occurrences " +
    "only — starting points, not findings"));
  strip.hidden = false;
}

// ---- boot ---------------------------------------------------------------------

async function init() {
  const [doc, kwicIndex] = await Promise.all([
    fetchJSON("cloud/points.json"), fetchJSON("kwic/index.json"),
  ]);
  state.doc = doc;
  state.n = doc.n;
  state.kwicIndex = kwicIndex;
  for (const dim of FILTER_DIMS) {
    state.checked[dim] = new Set(doc.enums[dim].map((_, code) => code));
  }

  const sideCounts = doc.enums.side.map(() => 0);
  for (const s of doc.columns.side) sideCounts[s] += 1;
  const sideLine = doc.enums.side
    .map((s, i) => `${s || "unsided"} ${fmt(sideCounts[i])}`)
    .join(" · ");

  const evr = doc.projection.explained_variance_ratio;
  const pctXY = ((evr[0] + evr[1]) * 100).toFixed(1);
  $("corpus-stats").textContent =
    `${fmt(doc.n)} embedded occurrences · ${doc.enums.term.length} terms · ` +
    `${doc.enums.creator.length} creators · embedding model ` +
    `${doc.generated_from}`;
  $("cloud-caption").textContent =
    `Positions are a 2-D PCA projection explaining ${pctXY}% of the ` +
    "embedding space's variance — trust the audit lines, not the picture. " +
    "Colors and filters change what is visible, never what exists. " +
    `Per-side occurrence counts (the corpus is still unbalanced): ` +
    `${sideLine}. Scroll to zoom, drag to pan, click a point for its ` +
    "evidence; click empty sky or press Escape to deselect. Term-center " +
    "markers are the centroid of each term's full point set — a summary " +
    "laid over heavily overlapping clouds, not a cluster boundary. " +
    "“Evidenced only” dims occurrences that don't resolve in the published " +
    "concordance sample (most don't — the sample is bounded on purpose). " +
    "The legend doubles as a filter: click an entry to dim or undim it, " +
    "same as the sidebar chips. " +
    "The sky stays dark in both themes so density reads consistently.";

  const positions = new Float32Array(state.n * 2);
  for (let i = 0; i < state.n; i++) {
    positions[2 * i] = doc.columns.x[i];
    positions[2 * i + 1] = doc.columns.y[i];
  }

  state.graph = new Cosmos.Graph($("cloud"), {
    enableSimulation: false,        // the picture is the fixed artifact
    scalePointsOnZoom: true,        // points grow as you zoom — clickable detail
    backgroundColor: SKY_BG,
    fitViewOnInit: true,
    fitViewDelay: 150,
    hoveredPointCursor: "pointer",
    hoveredPointRingColor: "#ffffff",
    renderHoveredPointRing: true,
    onClick: (index) => {
      if (index === undefined || index === null) deselect();
      else showPoint(index);
    },
    onPointMouseOver: (index, pos, ev) => showTooltip(index, ev),
    onPointMouseOut: () => hideTooltip(),
  });
  state.graph.setPointPositions(positions);
  state.graph.render();
  resize();

  renderFilters();
  recolor();

  buildCentroids();
  $("show-centers").addEventListener("change", () => {
    $("centroid-layer").style.display =
      $("show-centers").checked ? "" : "none";
  });
  $("evidenced-only").addEventListener("change", () => {
    state.evidencedOnly = $("evidenced-only").checked;
    recolor();
  });
  $("clear-filters").addEventListener("click", clearFilters);
  $("overlay-close").addEventListener("click", deselect);
  loadEvidenceFlags().catch((e) => {
    $("evidenced-label").append(` (unavailable: ${e.message})`);
  });
  (function tick() {
    layoutCentroids();
    if (state.evidenced && state.centroidSpaceReady && !state.suggestionsDone) {
      state.suggestionsDone = true;
      renderSuggestions();
    }
    requestAnimationFrame(tick);
  })();

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") deselect();
  });
  $("color-by").addEventListener("change", () => {
    state.colorBy = $("color-by").value;
    recolor();
  });
}

init().catch((e) => {
  $("corpus-stats").textContent = "failed to load artifacts: " + e.message +
    " — regenerate with `python3 -m contested export-site` and serve over HTTP.";
});
