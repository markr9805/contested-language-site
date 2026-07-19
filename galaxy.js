/* Contested Language concept galaxy — Slice 8 over data/galaxy/ artifacts.
   Two skies side by side (the cross-community comparison is the headline
   interaction); stars are (term, sense) pairs sized by n and colored by
   term with senses sharing a hue. Honesty rules carried through from the
   exporter: ghosts are listed, never positioned; high-stress stars are
   dash-ringed and the threshold disclosed; every star opens its KWIC
   exemplars and every nearness claim opens a distance audit with the
   quoted occurrence pairs behind it; cross-side claims are labeled
   provisional while side two is thin. All text lands via textContent. */
"use strict";

const DATA = "data";
const state = { index: null, suggestions: null, docs: {}, senses: {},
                panels: [null, null], sel: null,
                mirror: true, overallNodes: null };

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const fmt = (x) => x.toLocaleString("en-US");
const NS = "http://www.w3.org/2000/svg";
const mk = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const C = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

async function fetchJSON(path) {
  const r = await fetch(`${DATA}/${path}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

async function cellDoc(file) {
  if (!state.docs[file]) state.docs[file] = await fetchJSON(`galaxy/${file}`);
  return state.docs[file];
}

async function sensesDoc(file) {
  if (!state.senses[file]) state.senses[file] = await fetchJSON(file);
  return state.senses[file];
}

const params = () => state.index.parameters;
const nodeLabel = (key) => {
  const cut = key.lastIndexOf("|");
  return `${key.slice(0, cut)}·s${key.slice(cut + 1)}`;
};

// ---- term colors: senses of one term share a hue -----------------------------

function termHues(doc) {
  const terms = [...new Set(Object.values(doc.nodes).map((n) => n.term))]
    .sort();
  const hues = {};
  terms.forEach((t, i) => { hues[t] = Math.round((360 * i) / terms.length); });
  return hues;
}

const starColor = (hue, sense) =>
  `hsl(${hue} 62% ${Math.min(42 + sense * 12, 70)}%)`;

// ---- sky rendering -----------------------------------------------------------

function panelCellFile(p) {
  return state.index.cells[p.grouping][p.cell].file;
}

function renderControls(i, wrap) {
  const p = state.panels[i];
  const row = el("div", "sky-controls");
  const selG = el("select", "sky-select");
  for (const g of Object.keys(state.index.cells).sort()) {
    const o = el("option", "", g);
    o.value = g;
    o.selected = g === p.grouping;
    selG.append(o);
  }
  const selC = el("select", "sky-select");
  for (const c of Object.keys(state.index.cells[p.grouping]).sort()) {
    const o = el("option", "", c);
    o.value = c;
    o.selected = c === p.cell;
    selC.append(o);
  }
  selG.addEventListener("change", () => {
    const g = selG.value;
    state.panels[i] = { grouping: g,
                        cell: Object.keys(state.index.cells[g]).sort()[0] };
    renderSkies();
  });
  selC.addEventListener("change", () => {
    state.panels[i] = { grouping: p.grouping, cell: selC.value };
    renderSkies();
  });
  row.append(selG, selC);
  wrap.append(row);
}

function drawSky(i, wrap, doc) {
  const W = 520, H = 400, PAD = 34;
  const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
  // mirror mode: one shared whole-corpus frame positions every star in both
  // skies (the Stellarium move — same sky, different constellations); the
  // cell's own MDS otherwise. A star with no frame position stays a ghost.
  const mirror = state.mirror && state.overallNodes;
  const frameXY = (key, n) => {
    if (!mirror) return n.status === "ok" ? n.xy : null;
    const ref = state.overallNodes[key];
    return ref && ref.status === "ok" ? ref.xy : null;
  };
  const placed = Object.entries(doc.nodes)
    .map(([key, n]) => [key, n, frameXY(key, n)])
    .filter(([, , xy]) => xy);
  const ok = placed.filter(([, n]) => n.status === "ok");
  const hues = termHues(doc);
  // focus & blur: with a star selected, only its neighborhood stays lit
  const neighbors = new Set();
  if (state.sel) {
    neighbors.add(state.sel);
    for (const e of doc.edges) {
      if (e.a === state.sel) neighbors.add(e.b);
      if (e.b === state.sel) neighbors.add(e.a);
    }
  }
  if (placed.length) {
    const xs = placed.map(([, , xy]) => xy[0]);
    const ys = placed.map(([, , xy]) => xy[1]);
    const [xlo, xhi] = [Math.min(...xs), Math.max(...xs)];
    const [ylo, yhi] = [Math.min(...ys), Math.max(...ys)];
    const sx = (x) => PAD + ((x - xlo) / ((xhi - xlo) || 1)) * (W - 2 * PAD);
    const sy = (y) => (H - PAD) - ((y - ylo) / ((yhi - ylo) || 1)) * (H - 2 * PAD);
    const maxN = Math.max(...ok.map(([, n]) => n.n), 1);
    const pos = {};
    for (const [key, , xy] of placed) pos[key] = [sx(xy[0]), sy(xy[1])];

    // selected star's neighborhood: its edges, drawn under the stars
    if (state.sel && pos[state.sel]) {
      for (const e of doc.edges) {
        if (e.a !== state.sel && e.b !== state.sel) continue;
        const other = e.a === state.sel ? e.b : e.a;
        if (!pos[other]) continue;
        const [x1, y1] = pos[state.sel], [x2, y2] = pos[other];
        const line = mk("line", { x1, y1, x2, y2,
          stroke: C("--baseline"), "stroke-width": 1.5,
          opacity: Math.max(0.25, 1 - e.dist) });
        svg.append(line);
        const hit = mk("line", { x1, y1, x2, y2, stroke: "transparent",
          "stroke-width": 9 });
        hit.style.cursor = "pointer";
        hit.addEventListener("click", () => showAudit(i, e));
        svg.append(hit);
      }
    }

    for (const [key, n] of placed) {
      const [cx, cy] = pos[key];
      const ghost = n.status !== "ok";
      const r = ghost ? 4 : 4 + 9 * Math.sqrt(n.n / maxN);
      const g = mk("g", { tabindex: 0, role: "button" });
      g.style.cursor = "pointer";
      if (state.sel && !neighbors.has(key)) g.setAttribute("opacity", 0.18);
      if (ghost) {
        // sense exists; this cell can't place it confidently — the shared
        // frame lends a position, drawn hollow so it never reads as a claim
        g.append(mk("circle", { cx, cy, r, fill: "none",
          stroke: C("--text-muted"), "stroke-width": 1.2,
          "stroke-dasharray": "2 2" }));
        const t = mk("title", {});
        t.textContent = `${n.term} · sense ${n.sense} — ghost here: ` +
          `${n.reason}; position is the whole-corpus layout, not a claim`;
        g.append(t);
        const open = () => { state.sel = key; renderSkies(); showSense(i, key); };
        g.addEventListener("click", open);
        svg.append(g);
        continue;
      }
      if (n.stress > params().stress_high) {
        g.append(mk("circle", { cx, cy, r: r + 3.5, fill: "none",
          stroke: C("--text-muted"), "stroke-width": 1,
          "stroke-dasharray": "3 2" }));
      }
      g.append(mk("circle", { cx, cy, r,
        fill: starColor(hues[n.term], n.sense),
        stroke: key === state.sel ? C("--text-primary") : C("--surface-1"),
        "stroke-width": key === state.sel ? 2.5 : 1.5 }));
      const label = mk("text", { x: cx, y: cy - r - 4,
        "text-anchor": "middle", "font-size": 10,
        fill: C("--text-secondary") });
      label.textContent = nodeLabel(key);
      g.append(label);
      const t = mk("title", {});
      t.textContent = `${n.term} · sense ${n.sense} — n=${n.n}, ` +
        `stress ${n.stress}` +
        (n.stress > params().stress_high ? " (high: trust the audit, " +
         "not the picture)" : "");
      g.append(t);
      const open = () => { state.sel = key; renderSkies(); showSense(i, key); };
      g.addEventListener("click", open);
      g.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); }
      });
      svg.append(g);
    }
  } else {
    const t = mk("text", { x: W / 2, y: H / 2, "text-anchor": "middle",
      "font-size": 13, fill: C("--text-muted") });
    t.textContent = "no sense reaches the occurrence minimum in this cell";
    svg.append(t);
  }
  const chart = el("div", "chart-wrap sky-chart");
  chart.append(svg);
  wrap.append(chart);

  const placedKeys = new Set(
    (state.mirror && state.overallNodes)
      ? Object.keys(doc.nodes).filter((k) => {
          const ref = state.overallNodes[k];
          return ref && ref.status === "ok";
        })
      : Object.keys(doc.nodes).filter((k) => doc.nodes[k].status === "ok"));
  const ghosts = Object.entries(doc.nodes)
    .filter(([key, n]) => n.status === "ghost" && !placedKeys.has(key))
    .sort();
  if (ghosts.length) {
    const strip = el("div", "ghost-strip");
    strip.append(el("span", "ghost-label",
      `insufficient-data ghosts (${ghosts.length}) — present, never ` +
      "positioned:"));
    for (const [key, n] of ghosts) {
      const chip = el("span", "ghost-chip", `${nodeLabel(key)} n=${n.n}`);
      chip.title = n.reason;
      strip.append(chip);
    }
    wrap.append(strip);
  }
}

async function renderSkies() {
  for (const i of [0, 1]) {
    const wrap = $(`sky-${i}`);
    wrap.replaceChildren();
    const p = state.panels[i];
    renderControls(i, wrap);
    const meta = state.index.cells[p.grouping][p.cell];
    wrap.append(el("p", "sky-meta",
      `${p.grouping} · ${p.cell} — ${meta.nodes_ok} stars, ` +
      `${meta.nodes_ghost} ghosts, ${fmt(meta.occurrences)} occurrences`));
    drawSky(i, wrap, await cellDoc(meta.file));
  }
  const high = params().stress_high;
  const axes = "There are no axes: positions are a unitless MDS projection " +
    "of centroid cosine distances, so only relative nearness carries " +
    "meaning. ";
  $("galaxy-caption").textContent = (state.mirror && state.overallNodes)
    ? axes +
      "Mirror mode: both skies share the whole-corpus layout — the same " +
      "sense sits at the same spot, so what differs is each side's data: " +
      "star size (occurrences in that cell), hollow dashed stars (below " +
      "the cell minimum — lent a position, never a claim), and which " +
      "neighborhood lights up when you select a star. Dash-ringed stars " +
      `have projection stress above ${high}: trust the audit, not the ` +
      "picture."
    : axes +
      "Per-cell layout: each sky is its own projection, so positions are " +
      "NOT comparable across skies — compare which stars sit near which, " +
      "not coordinates. Dash-ringed stars have projection stress above " +
      `${high} (mean top-k distance error relative to true distance): ` +
      "open the audit instead. Click a star for its senses and neighbors; " +
      "click a connection or neighbor row for the quoted evidence behind " +
      "the nearness claim.";
}

// ---- star -> sense panel (KWIC exemplars) ------------------------------------

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

async function showSense(i, key) {
  $("audit-card").hidden = true;
  const card = $("sense-card");
  const p = state.panels[i];
  const doc = await cellDoc(panelCellFile(p));
  const node = doc.nodes[key];
  $("sense-title").textContent =
    `${node.term} · sense ${node.sense} — ${p.grouping} · ${p.cell}`;
  $("sense-note").textContent =
    `${fmt(node.n)} occurrences in this cell` +
    (node.status === "ok"
      ? `; projection stress ${node.stress}` +
        (node.stress > params().stress_high
          ? ` (above ${params().stress_high}: high)` : "")
      : "; below the cell minimum — ghost, no confident position") +
    ". Exemplar concordance lines are the sense's evidence; open the term " +
    "in the term explorer for the full profile.";

  const nb = $("sense-neighbors");
  nb.replaceChildren();
  const edges = doc.edges
    .filter((e) => e.a === key || e.b === key)
    .sort((x, y) => x.dist - y.dist);
  if (edges.length) {
    const other = state.panels[i === 0 ? 1 : 0];
    const otherDoc = await cellDoc(panelCellFile(other));
    const table = el("table", "data-table");
    const head = el("tr");
    for (const [h, num] of [["Neighbor", 0], ["cosine dist", 1],
                            [`in other sky (${other.grouping} · ${other.cell})`, 1],
                            ["", 0]]) {
      head.append(el("th", num ? "num" : "", h));
    }
    table.append(head);
    for (const e of edges) {
      const otherKey = e.a === key ? e.b : e.a;
      const tr = el("tr", "clickable");
      const td = el("td", "", nodeLabel(otherKey));
      if (e.same_term) td.append(el("span", "same-term-chip",
        "same term — within-term sense separation, a different claim"));
      tr.append(td);
      tr.append(el("td", "num", e.dist.toFixed(4)));
      const oe = otherDoc.edges.find((x) => x.a === e.a && x.b === e.b);
      tr.append(el("td", "num", oe ? oe.dist.toFixed(4) : "—"));
      tr.append(el("td", "", "open audit →"));
      tr.addEventListener("click", () => showAudit(i, e));
      table.append(tr);
    }
    nb.append(el("p", "evidence-note",
      "Nearest senses by centroid cosine distance in this cell (top-k " +
      `${params().top_k}). The other-sky column is the cross-cell ` +
      "comparison: a pair near here and far there is exactly the signal " +
      "this layer exists to surface — click through to the audit before " +
      "believing it."), table);
  }

  const ex = $("sense-exemplars");
  ex.replaceChildren();
  try {
    const sd = await sensesDoc(node.file);
    const lines = (sd.exemplars || {})[String(node.sense)] || [];
    if (lines.length) {
      ex.append(el("h4", "exemplar-head",
        "Exemplar concordance lines (nearest the sense centroid, " +
        "whole corpus)"));
      for (const line of lines) ex.append(kwicBlock(line));
    }
    const link = el("a", "term-link", "open in term explorer →");
    link.href = `index.html#term=${encodeURIComponent(node.term)}`;
    ex.append(link);
  } catch {
    ex.append(el("p", "insufficient-note",
      "exemplars unavailable — regenerate artifacts with " +
      "`python3 -m contested export-site`"));
  }
  card.hidden = false;
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---- edge -> distance audit --------------------------------------------------

async function showAudit(i, edge) {
  const card = $("audit-card");
  const p = state.panels[i];
  const doc = await cellDoc(panelCellFile(p));
  $("audit-title").textContent =
    `${nodeLabel(edge.a)} ↔ ${nodeLabel(edge.b)} — cosine distance ` +
    `${edge.dist.toFixed(4)} (${p.grouping} · ${p.cell})`;
  $("audit-note").textContent =
    (edge.same_term
      ? "Same-term pair: this distance is within-term sense separation, " +
        "not cross-term proximity. "
      : "") +
    "Below are the nearest occurrence pairs across the two senses in this " +
    "cell — the actual quoted speech behind the nearness claim. If these " +
    "lines don't read as semantically adjacent to you, the galaxy is " +
    "wrong, not you.";
  const wrap = $("audit-pairs");
  wrap.replaceChildren();
  for (const pair of edge.audit_pairs) {
    const box = el("div", "audit-pair");
    box.append(el("div", "audit-pair-head",
      `occurrence pair distance ${pair.dist.toFixed(4)}`));
    const grid = el("div", "audit-pair-grid");
    for (const [occ, key] of [[pair.a_occ, edge.a], [pair.b_occ, edge.b]]) {
      const cellBox = el("div", "audit-pair-cell");
      cellBox.append(el("div", "kwic-meta", nodeLabel(key)));
      const line = doc.audit_lines[String(occ)];
      cellBox.append(line ? kwicBlock(line)
                          : el("p", "insufficient-note", `occurrence #${occ} ` +
                               "not found in this cell's audit lines"));
      grid.append(cellBox);
    }
    box.append(grid);
    wrap.append(box);
  }
  card.hidden = false;
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---- watchlist suggestions ---------------------------------------------------

function renderSuggestions() {
  const s = state.suggestions;
  const card = $("suggestions-card");
  card.hidden = false;
  const note = $("suggestions-note");
  const table = $("suggestions-table");
  table.replaceChildren();
  if (s.status !== "ok") {
    note.textContent = `No cross-side suggestions yet: ${s.reason}`;
    return;
  }
  note.textContent =
    `${fmt(s.considered_pairs)} cross-term pairs compared between ` +
    `${s.sides[0]} and ${s.sides[1]}; top ${s.kept} shown, ranked by how ` +
    "differently the two sides place the pair. The variance bar column is " +
    "the §3 significance discipline one level up: a cross-side difference " +
    "counts only if it beats the same pair's spread among same-side " +
    "creators.";
  const head = el("tr");
  for (const [h, num] of [["Pair", 0], [s.sides[0], 1], [s.sides[1], 1],
                          ["Δ", 1], ["variance bar", 0]]) {
    head.append(el("th", num ? "num" : "", h));
  }
  table.append(head);
  for (const e of s.suggestions) {
    const tr = el("tr");
    tr.append(el("td", "", `${nodeLabel(e.a)} ↔ ${nodeLabel(e.b)}`));
    tr.append(el("td", "num", e.dist[s.sides[0]].toFixed(4)));
    tr.append(el("td", "num", e.dist[s.sides[1]].toFixed(4)));
    tr.append(el("td", "num", e.delta.toFixed(4)));
    const vb = e.variance_bar;
    tr.append(el("td", vb.status === "ok" && vb.passes ? "" : "insufficient",
      vb.status === "provisional" ? `provisional — ${vb.reason}`
        : vb.passes ? `beats within-side spread (bar ${vb.bar})`
                    : `within noise (bar ${vb.bar})`));
    table.append(tr);
  }
}

// ---- boot --------------------------------------------------------------------

function defaultPanels() {
  const cells = state.index.cells;
  const communities = Object.keys(cells.community || {}).sort();
  if (communities.length >= 2) {
    return [{ grouping: "community", cell: communities[0] },
            { grouping: "community", cell: communities[1] }];
  }
  const left = { grouping: "overall", cell: "overall" };
  if (communities.length === 1) {
    return [left, { grouping: "community", cell: communities[0] }];
  }
  const g = Object.keys(cells).sort().find((k) => k !== "overall");
  const c = g ? Object.keys(cells[g]).sort()[0] : "overall";
  return [left, g ? { grouping: g, cell: c } : left];
}

async function init() {
  const [index, suggestions] = await Promise.all([
    fetchJSON("galaxy/index.json"), fetchJSON("galaxy/suggestions.json"),
  ]);
  Object.assign(state, { index, suggestions });
  const nCells = Object.values(index.cells)
    .reduce((s, g) => s + Object.keys(g).length, 0);
  $("corpus-stats").textContent =
    `${nCells} grouping cells · embedding model ${index.model} · ` +
    `top-k ${index.parameters.top_k} · min cell n ` +
    `${index.parameters.min_cell_n}`;
  const ovMeta = (index.cells.overall || {}).overall;
  if (ovMeta) state.overallNodes = (await cellDoc(ovMeta.file)).nodes;
  const mt = $("mirror-toggle");
  if (mt) {
    mt.addEventListener("change", () => {
      state.mirror = mt.checked;
      renderSkies();
    });
  }
  if (index.cross_side.provisional) {
    const b = $("provisional-banner");
    b.textContent =
      "Cross-side claims are provisional: fewer than two creators per " +
      "side have sufficient data, so the within-side variance bar — the " +
      "discipline that separates a community difference from creator " +
      "idiosyncrasy — cannot be computed yet. The transcription batch is " +
      "filling side two; this page improves automatically as it does.";
    b.hidden = false;
  }
  state.panels = defaultPanels();
  await renderSkies();
  renderSuggestions();
}

init().catch((e) => {
  $("corpus-stats").textContent = "failed to load artifacts: " + e.message +
    " — regenerate with `python3 -m contested export-site` and serve over HTTP.";
});
