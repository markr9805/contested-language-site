/* Contested Language creator map — Atlas shell.
   Same three views and honesty rules as before (pending-data creators are
   listed with reasons, never plotted; polar labeled data-derived). Changes:
   view switcher renders as sidebar buttons; the distance audit renders into
   the persistent right tray as stacked blocks (no scrollIntoView, the page
   never moves); charts re-render on `themechange`. All text via textContent. */
"use strict";

const DATA = "data";
const state = { views: null, rates: null, meta: null, view: "organic",
                creator: null };

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
const css = () => getComputedStyle(document.documentElement);
const C = (name) => css().getPropertyValue(name).trim();

async function fetchJSON(path) {
  const r = await fetch(`${DATA}/${path}`);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

const creators = () => state.views.creators;
const name = (slug) => creators()[slug].display_name;

// ---- shared: pending-data listing -------------------------------------------

function renderPending(containerId, key) {
  const wrap = $(containerId);
  wrap.replaceChildren();
  // "cannot-say" is a measurement refusal, not an ingestion delay. Sweeping it
  // in here would tell the reader a creator is awaiting transcription when its
  // corpus is fine and the axis simply cannot separate it.
  const pending = Object.entries(creators())
    .filter(([, c]) => c[key].status !== "ok" && c[key].status !== "provisional")
    .sort(([a], [b]) => a.localeCompare(b));
  if (!pending.length) return;
  const note = el("div", "insufficient-note");
  note.append(el("strong", "", `Pending data (${pending.length}): `));
  note.append("these creators are not placed — the transcription batch is " +
    "still filling their corpora. ");
  const table = el("table", "data-table pending-table");
  const head = el("tr");
  for (const [h, num] of [["Creator", 0], ["words", 1], ["videos", 1], ["why pending", 0]]) {
    head.append(el("th", num ? "num" : "", h));
  }
  table.append(head);
  for (const [slug, c] of pending) {
    const tr = el("tr");
    tr.append(el("td", "", c.display_name));
    tr.append(el("td", "num", fmt(c.words)));
    tr.append(el("td", "num", fmt(c.videos)));
    tr.append(el("td", "insufficient", c[key].reason || "insufficient data"));
    table.append(tr);
  }
  wrap.append(note, table);
}

// ---- distance audit → tray ----------------------------------------------------
// The 340px tray can't hold the old three-column table; each pair renders as a
// stacked block: other creator + mean JS, then the per-term values as rows.

function showDistances(slug) {
  const rows = Object.entries(state.views.distances)
    .filter(([pair]) => pair.split("|").includes(slug))
    .sort(([, a], [, b]) => a.js - b.js);
  $("distance-title").textContent = `Distances from ${name(slug)}`;
  $("distance-note").textContent = rows.length
    ? "Mean Jensen-Shannon divergence over shared sufficient terms; the " +
      "per-term values are the audit trail — read them against the term " +
      "explorer's concordance lines."
    : "No pairwise distances yet: no other creator shares enough " +
      "sufficient terms with this one.";
  const body = $("distance-body");
  body.replaceChildren();
  for (const [pair, d] of rows) {
    const other = pair.split("|").find((s) => s !== slug);
    const block = el("div", "kwic-line");
    const head = el("div", "kwic-meta");
    head.append(el("strong", "", name(other)));
    head.append(` · mean JS ${d.js.toFixed(4)}`);
    block.append(head);
    for (const [t, v] of Object.entries(d.terms).sort()) {
      const row = el("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "2px 0";
      row.style.fontSize = "12px";
      const a = el("a", "", t);
      a.href = `index.html#term=${encodeURIComponent(t)}`;
      a.style.minWidth = "110px";
      const bar = el("span", "rate-bar");
      bar.style.width = `${Math.round(v * 160)}px`;
      const num = el("span", "", v.toFixed(3));
      num.style.marginLeft = "auto";
      num.style.color = "var(--text-secondary)";
      num.style.fontVariantNumeric = "tabular-nums";
      row.append(a, bar, num);
      block.append(row);
    }
    body.append(block);
  }
  // tray is persistent — no scrolling, the viewport never moves
}

// ---- scatter plumbing (unchanged from pre-Atlas) --------------------------------

function drawPoints(svg, pts, axis) {
  svg.replaceChildren();
  const W = 760, H = 420, PAD = 56;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if (!pts.length) return;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const lo = axis ? axis.lo : Math.min(...xs), hi = axis ? axis.hi : Math.max(...xs);
  const ylo = Math.min(...ys, 0), yhi = Math.max(...ys, 0);
  const spanX = (hi - lo) || 1, spanY = (yhi - ylo) || 1;
  const px = (x) => PAD + ((x - lo) / spanX) * (W - 2 * PAD);
  const py = (y) => (H - PAD) - ((y - ylo) / spanY) * (H - 2 * PAD);

  if (axis) {
    svg.append(mk("line", { x1: px(lo), x2: px(hi), y1: H / 2, y2: H / 2,
      stroke: C("--baseline"), "stroke-width": 1 }));
    for (const [x, label, anchorSide] of
         [[lo, axis.labels[0], "start"], [hi, axis.labels[1], "end"]]) {
      const t = mk("text", { x: px(x), y: H - 16, "font-size": 12,
        "font-weight": 650, fill: C("--text-secondary"),
        "text-anchor": anchorSide });
      t.textContent = label;
      svg.append(t);
    }
  }

  const placedBoxes = [];
  const labelBox = (cx, dy, w) =>
    ({ x1: cx - w / 2, x2: cx + w / 2, y1: dy - 13, y2: dy + 3 });
  const collides = (b) => placedBoxes.some((o) =>
    b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1);

  for (const p of [...pts].sort((a, b) => a.x - b.x)) {
    const cx = px(p.x), cy = axis ? H / 2 + (p.y * 60) : py(p.y);
    const g = mk("g", { tabindex: 0, role: "button" });
    g.style.cursor = "pointer";
    g.append(mk("circle", { cx, cy, r: p.anchor ? 8 : 6,
      fill: p.anchor ? C("--text-primary") : C("--series-1"),
      stroke: C("--surface-1"), "stroke-width": 2 }));
    const text = name(p.slug) + (p.anchor ? " ⚓" : "");
    const w = 7 * text.length + 6;
    const lx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, cx));
    let dy = cy - 12;
    for (const step of [-12, -28, 18, -44, 34, -60, 50, -76, 66]) {
      dy = cy + step;
      if (!collides(labelBox(lx, dy, w))) break;
    }
    placedBoxes.push(labelBox(lx, dy, w));
    if (Math.abs(dy - cy) > 20) {
      g.append(mk("line", { x1: cx, y1: cy + (dy > cy ? 8 : -8),
        x2: lx, y2: dy + (dy > cy ? -11 : 2),
        stroke: C("--baseline"), "stroke-width": 1 }));
    }
    const label = mk("text", { x: lx, y: dy, "text-anchor": "middle",
      "font-size": 11.5, fill: C("--text-primary") });
    label.textContent = text;
    g.append(label);
    const open = () => showDistances(p.slug);
    g.addEventListener("click", open);
    g.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); }
    });
    svg.append(g);
  }
}

// ---- views (unchanged logic) -----------------------------------------------------

function renderOrganic() {
  const pts = Object.entries(creators())
    .filter(([, c]) => c.organic.status === "ok")
    .map(([slug, c]) => ({ slug, x: c.organic.xy[0], y: c.organic.xy[1],
                           anchor: c.is_anchor }));
  drawPoints($("organic-chart"), pts, null);
  $("organic-caption").textContent = pts.length
    ? `${pts.length} creator${pts.length === 1 ? "" : "s"} positioned by ` +
      "classical MDS over pairwise sense-distribution divergence. Axes are " +
      "unitless similarity space — only relative distances mean anything. " +
      "Click a point for its distance audit."
    : "No creators can be positioned yet: positioning requires at least " +
      "two creators above the minimum corpus size sharing sufficient " +
      "terms. The transcription batch is filling the second side now.";
  renderPending("organic-pending", "organic");
}

function renderPolar() {
  const poleNames = Object.keys(state.views.poles).sort();
  const pts = Object.entries(creators())
    .filter(([, c]) => c.polar.status === "ok")
    .map(([slug, c]) => ({ slug, x: c.polar.x, y: c.polar.y || 0,
                           anchor: c.is_anchor }));
  drawPoints($("polar-chart"), pts,
    { lo: -1, hi: 1, labels: [poleNames[0], poleNames[poleNames.length - 1]] });
  const anchors = Object.entries(state.views.poles)
    .map(([community, p]) =>
      `${p.anchors.map(name).join(" + ")} (${community})`).join(", ");
  $("polar-caption").textContent =
    `Poles are data-derived from author-designated anchors: ${anchors}. ` +
    "Non-anchor positions come from computed affinity weights — linguistic " +
    "proximity to each pole's anchors — so this is the readable view; check it " +
    "against the organic view, which imposes no categories.";
  renderAnchorCaveat();
  renderProvisionalSides();
  renderPending("polar-pending", "polar");
}

// DESIGN §3: a claim that does not clear its bar is marked provisional with the
// reason stated, never silently dropped. This axis was MEASURED unstable —
// swapping in other same-side creators as anchors moves 45% of positions across
// the midline — so the number has to travel with the chart, not sit in a
// research document.
//
// Driven by `pole_stability.provisional`, which the export computes from the
// roster's actual ensemble sizes. Designate more anchors per pole and this
// disappears on its own rather than becoming a stale warning.
// The stronger caveat, and the one an earlier draft got wrong. It said
// "positions near the middle are the least settled", which implies some are
// not. Measured: non-anchor creators occupy under 6% of the axis they are drawn
// on, median |x| = 0.009 — nearly all are near the middle, so "which side"
// carries little information for most of them. The anchors are pinned to +/-1
// by construction, which is what makes the chart look separated at all.
function occupancy(s) {
  const o = s.axis_occupancy;
  if (!o) return "";
  return ` Note the scale: excluding the anchors — pinned to the ends by` +
         ` definition — the ${o.positioned} placed creators span only` +
         ` ${Math.round(o.fraction_of_axis * 100)}% of this axis` +
         ` (${o.lo.toFixed(3)} to ${o.hi.toFixed(3)}), and` +
         ` ${o.within_0_05_of_midline} of them sit within 0.05 of the midline.` +
         ` For those, which side of the line they fall on carries little` +
         ` information.`;
}

// DESIGN §3 disclose-never-drop: these creators ARE measured, and the
// measurement is what share of defensible anchor ensembles agree. Showing
// them with their range is the honest rendering; omitting them from the chart
// silently would be the drop the discipline forbids, and filing them under
// "pending data" would misattribute a refusal to an ingestion delay.
function renderProvisionalSides() {
  const host = $("polar-provisional");
  if (!host) return;
  host.replaceChildren();
  const rows = Object.entries(creators())
    .filter(([, c]) => c.polar && c.polar.status === "provisional")
    .sort(([a], [b]) => a.localeCompare(b));
  if (!rows.length) return;

  const note = el("div", "insufficient-note");
  note.append(el("strong", "", `Side provisional (${rows.length}): `));
  note.append(
    "these creators are placed, but their side does not survive the choice of " +
    "anchors. The figure is the share of every equally defensible anchor " +
    "ensemble that agrees with the side shown — below 50% the published side " +
    "is the minority view. Position is shown; the side is not claimed.");
  const table = el("table", "data-table pending-table");
  const head = el("tr");
  for (const [h, num] of [["Creator", 0], ["x", 1], ["anchor ensembles agreeing", 1]]) {
    head.append(el("th", num ? "num" : "", h));
  }
  table.append(head);
  for (const [, c] of rows) {
    const tr = el("tr");
    tr.append(el("td", "", c.display_name));
    tr.append(el("td", "num", c.polar.x.toFixed(4)));
    const a = c.polar.anchor_agreement;
    tr.append(el("td", "num", a === undefined ? "—"
      : `${(a * 100).toFixed(1)}%${a < 0.5 ? " (minority)" : ""}`));
    table.append(tr);
  }
  note.append(table);
  host.append(note);
}

function renderAnchorCaveat() {
  const host = $("polar-caveat");
  if (!host) return;
  host.textContent = "";
  const s = state.views.pole_stability;
  if (!s) return;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const note = document.createElement("p");
  note.className = "caveat";

  if (s.provisional) {
    // Severe: a pole defined by one creator.
    note.textContent =
      `Provisional: each pole is defined by a single anchor, and this axis ` +
      `depends on that choice. Substituting other same-side creators as ` +
      `anchors moves ${pct(s.positions_changing_side)} of creators across the ` +
      `midline, and ${pct(s.pairs_disagreeing)} of those choices disagree with ` +
      `this one about the ordering. The instability tracks speaking register, ` +
      `so the axis carries format as well as ideology. Read a creator's side ` +
      `here as one defensible arrangement, not a fixed position.` +
      occupancy(s);
  } else if (s.residual_instability) {
    // Reduced, not eliminated. Saying "resolved" here would trade a loud
    // overstatement for a quiet one.
    note.textContent =
      `Each pole is defined by ${s.anchors_per_pole} anchors, which makes this ` +
      `axis substantially more stable than a single-anchor definition — but ` +
      `not fixed. Across every alternative set of ${s.anchors_per_pole} ` +
      `same-side anchors, ${pct(s.pairs_disagreeing)} still disagree with this ` +
      `ordering, and the worst case inverts it. The instability tracks ` +
      `speaking register, so the axis carries format as well as ideology. ` +
      occupancy(s) +
      ` The organic view imposes no poles and does not inherit this.`;
  } else {
    return;
  }
  host.appendChild(note);
}

function isolatedCells(slug) {
  return state.rates.creator.filter((c) => c.group === slug);
}

function renderIsolated() {
  const tabs = $("creator-tabs");
  tabs.replaceChildren();
  const eligible = Object.entries(creators())
    .sort(([, a], [, b]) => b.words - a.words);
  if (!state.creator) state.creator = eligible[0][0];
  for (const [slug, c] of eligible) {
    const b = el("button", "tab-btn",
      `${c.display_name} · ${fmt(c.words)} words`);
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(slug === state.creator));
    b.addEventListener("click", () => { state.creator = slug; renderIsolated(); });
    tabs.append(b);
  }

  const body = $("isolated-body");
  body.replaceChildren();
  const slug = state.creator;
  const c = creators()[slug];
  if (c.corpus_status !== "ok") {
    body.append(el("div", "insufficient-note",
      `${c.display_name}: pending data — ${fmt(c.words)} words transcribed ` +
      `so far (minimum ${fmt(state.views.parameters.min_creator_words)}). ` +
      "Term weightings against a corpus this small would be noise dressed " +
      "as findings; this view fills in automatically as transcription " +
      "progresses."));
    return;
  }
  const cells = isolatedCells(slug)
    .sort((a, b) => (b.status === "ok" ? b.rate_pmw : -1) -
                    (a.status === "ok" ? a.rate_pmw : -1));
  if (!cells.length) {
    body.append(el("div", "insufficient-note",
      "No per-creator rates in the current artifacts — regenerate with " +
      "`python3 -m contested export-site`."));
    return;
  }
  const note = el("p", "evidence-note",
    `Every lexicon term's rate inside ${c.display_name}'s own corpus ` +
    `(${fmt(c.words)} words) — no cross-creator comparison, the creator ` +
    "studied in their own world. Open a term in the term explorer for its " +
    "concordance lines.");
  const table = el("table", "data-table");
  const head = el("tr");
  for (const [h, num] of [["Term", 0], ["n", 1], ["rate /M", 1], ["95% CI", 1]]) {
    head.append(el("th", num ? "num" : "", h));
  }
  table.append(head);
  const max = Math.max(...cells.filter((x) => x.status === "ok")
                              .map((x) => x.rate_pmw), 1);
  for (const cell of cells) {
    const tr = el("tr", "clickable");
    const td = el("td");
    td.append(el("span", "", cell.term));
    if (cell.status === "ok") {
      const bar = el("span", "rate-bar");
      bar.style.width = `${(cell.rate_pmw / max) * 140}px`;
      td.append(bar);
    }
    tr.append(td);
    tr.append(el("td", "num", fmt(cell.n)));
    if (cell.status === "ok") {
      tr.append(el("td", "num", cell.rate_pmw.toFixed(1)));
      tr.append(el("td", "num",
        `${cell.ci_low_pmw.toFixed(1)}–${cell.ci_high_pmw.toFixed(1)}`));
    } else {
      tr.append(el("td", "num insufficient", "insufficient"),
                el("td", "num", "—"));
    }
    tr.addEventListener("click", () => {
      location.href = `index.html#term=${encodeURIComponent(cell.term)}` +
                      `&creator=${encodeURIComponent(slug)}`;
    });
    table.append(tr);
  }
  body.append(note, table);
}

// ---- boot -------------------------------------------------------------------

function selectView(v) {
  state.view = v;
  for (const b of document.querySelectorAll("#view-tabs .view-btn")) {
    b.setAttribute("aria-selected", String(b.dataset.view === v));
  }
  for (const id of ["organic", "polar", "isolated"]) {
    $(`view-${id}`).hidden = id !== v;
  }
  ({ organic: renderOrganic, polar: renderPolar,
     isolated: renderIsolated })[v]();
}

async function init() {
  const [views, rates, meta] = await Promise.all([
    fetchJSON("views/creators.json"), fetchJSON("rates.json"),
    fetchJSON("meta.json"),
  ]);
  Object.assign(state, { views, rates, meta });
  const cs = Object.values(views.creators);
  const okOrganic = cs.filter((c) => c.organic.status === "ok").length;
  $("corpus-stats").textContent =
    `${cs.length} active creators · ${okOrganic} positioned · ` +
    `${cs.length - okOrganic} pending data · ` +
    `${fmt(cs.reduce((s, c) => s + c.words, 0))} transcribed words`;
  for (const b of document.querySelectorAll("#view-tabs .view-btn")) {
    b.addEventListener("click", () => selectView(b.dataset.view));
  }
  document.addEventListener("themechange", () => selectView(state.view));
  // A cross-link (e.g. from the creator concepts view) may land here as
  // map.html#<slug> — if the slug names a real creator, open straight on
  // the isolated view for them instead of the default organic scatter.
  // A malformed fragment (e.g. "#%") throws URIError on decode -- treat that
  // as no hash so it falls through to the default organic view below, rather
  // than surfacing as the generic "failed to load artifacts" error and
  // taking down the whole map view.
  let hashSlug = "";
  try {
    hashSlug = decodeURIComponent(location.hash.slice(1));
  } catch { /* malformed hash -> no hash */ }
  if (hashSlug && views.creators[hashSlug]) {
    state.creator = hashSlug;
    selectView("isolated");
  } else {
    selectView("organic");
  }
}

init().catch((e) => {
  $("corpus-stats").textContent = "failed to load artifacts: " + e.message +
    " — regenerate with `python3 -m contested export-site` and serve over HTTP.";
});
