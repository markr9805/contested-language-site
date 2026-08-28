/* Contested Language mention-edge viewer (#183) — Atlas shell.
   Private research tool for the #176 artifact. The page ships with the
   site; the data does not: the artifact is loaded client-side via file
   picker or drag-drop and never leaves the browser. Filters dim rows
   rather than remove them; evidence renders into the persistent tray;
   the artifact's own caveat (edges are recall candidates, not findings)
   is displayed, not tucked away. All text lands via textContent. */
"use strict";

const FILTER_DIMS = ["term", "source", "target"];

const state = {
  art: null,
  checked: { term: new Set(), source: new Set(), target: new Set() },
  sel: null,
};

// ---- loading ---------------------------------------------------------------

function loadFile(file) {
  file.text().then((txt) => {
    let art;
    try {
      art = JSON.parse(txt);
    } catch {
      $("corpus-stats").textContent = "not JSON: " + file.name;
      return;
    }
    if (!art || !Array.isArray(art.edges) || !art.meta || !art.targets) {
      $("corpus-stats").textContent =
        "not a mention-edges artifact: " + file.name;
      return;
    }
    state.art = art;
    state.sel = null;
    for (const d of FILTER_DIMS) state.checked[d].clear();
    render();
  });
}

$("load-btn").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", (ev) => {
  if (ev.target.files.length) loadFile(ev.target.files[0]);
});
document.addEventListener("dragover", (ev) => ev.preventDefault());
document.addEventListener("drop", (ev) => {
  ev.preventDefault();
  if (ev.dataTransfer.files.length) loadFile(ev.dataTransfer.files[0]);
});

// ---- rendering -------------------------------------------------------------

function render() {
  const art = state.art;
  const m = art.meta;
  $("empty-card").hidden = true;
  $("meta-card").hidden = false;
  $("edges-card").hidden = false;
  $("filter-note").hidden = false;

  $("corpus-stats").textContent =
    `${m.corpus.fingerprint} · ${m.corpus.videos} videos · ` +
    `${art.edges.length} edges`;
  $("meta-params").textContent =
    `±${m.window_s}s window · terms: ${m.terms.join(", ")} · ` +
    `${m.excluded_name_collision_mentions} collision-flagged mentions ` +
    `excluded · evidence capped at ${m.evidence_cap_per_edge}/edge ` +
    `(true pair counts shown)`;
  $("meta-caveat").textContent = m.caveat;

  buildFilters();
  renderRows();
}

function buildFilters() {
  const wrap = $("filter-groups");
  wrap.replaceChildren();
  for (const dim of FILTER_DIMS) {
    const values = new Map();
    for (const e of state.art.edges) {
      values.set(e[dim], (values.get(e[dim]) || 0) + 1);
    }
    const det = el("details");
    det.open = dim === "term";
    const sum = el("summary", "", `${dim} (${values.size})`);
    det.append(sum);
    const row = el("div", "chip-row");
    for (const [v, n] of [...values.entries()].sort()) {
      const chip = el("button", "chip soft", `${v} · ${n}`);
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(state.checked[dim].has(v)));
      chip.addEventListener("click", () => {
        const set = state.checked[dim];
        set.has(v) ? set.delete(v) : set.add(v);
        chip.setAttribute("aria-pressed", String(set.has(v)));
        renderRows();
      });
      row.append(chip);
    }
    det.append(row);
    wrap.append(det);
  }
}

function edgeMatches(e) {
  return FILTER_DIMS.every((d) =>
    !state.checked[d].size || state.checked[d].has(e[d]));
}

function renderRows() {
  const art = state.art;
  const tbody = $("edge-rows");
  tbody.replaceChildren();
  const edges = [...art.edges].sort((a, b) =>
    b.n_occurrences - a.n_occurrences
    || String(a.source).localeCompare(b.source)
    || String(a.target).localeCompare(b.target)
    || String(a.term).localeCompare(b.term));
  let shown = 0;
  for (const e of edges) {
    const match = edgeMatches(e);
    if (match) shown += 1;
    const tr = el("tr", "edge-row" + (match ? "" : " dimmed"));
    tr.setAttribute("aria-selected", String(state.sel === e));
    const tdTarget = el("td", "", e.target);
    tdTarget.append(el("span", "kind-chip", e.target_kind));
    tr.append(
      el("td", "", e.source), tdTarget, el("td", "", e.term),
      el("td", "edge-num", String(e.n_occurrences)),
      el("td", "edge-num", String(e.n_pairs)),
      el("td", "edge-num",
         (art.targets[e.target]?.max_source_share ?? "—").toString()));
    tr.addEventListener("click", () => {
      state.sel = e;
      renderRows();
      renderEvidence(e);
    });
    tbody.append(tr);
  }
  const active = FILTER_DIMS.reduce((n, d) => n + state.checked[d].size, 0);
  $("active-count").textContent = String(active);
  $("count-line").textContent = active
    ? `${art.edges.length} edges · ${shown} matching (rest dimmed, never removed)`
    : `${art.edges.length} edges`;
}

$("clear-filters").addEventListener("click", () => {
  for (const d of FILTER_DIMS) state.checked[d].clear();
  if (state.art) { buildFilters(); renderRows(); }
});

// ---- evidence tray ---------------------------------------------------------

function highlight(context, term) {
  // textContent-safe term highlighting: text nodes + <mark>, no innerHTML
  const wrap = el("div", "kwic-text");
  const body = term.split(/\s+/).map((w) =>
    w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s-]+");
  const rx = new RegExp(`\\b${body}\\b`, "gi");
  let last = 0;
  for (const m of context.matchAll(rx)) {
    wrap.append(context.slice(last, m.index));
    wrap.append(el("mark", "", m[0]));
    last = m.index + m[0].length;
  }
  wrap.append(context.slice(last));
  return wrap;
}

function renderEvidence(e) {
  $("evidence-title").textContent = `${e.source} → ${e.target} · ${e.term}`;
  const capped = e.n_pairs > e.evidence.length;
  $("evidence-note").textContent =
    `${e.n_occurrences} occurrence(s), ${e.n_pairs} mention–occurrence ` +
    `pair(s).` + (capped
      ? ` Showing the ${e.evidence.length} closest pairs — the cap is ` +
        `disclosed in the artifact meta, the counts above are the truth.`
      : "");
  const wrap = $("evidence-lines");
  wrap.replaceChildren();
  for (const p of e.evidence) {
    const div = el("div", "kwic-line");
    const meta = el("div", "kwic-meta");
    const date = p.published_at ? p.published_at.slice(0, 10) : "undated";
    meta.append(`${date} · ${p.title || p.video_id} · `);
    const a = el("a", "", `watch @ ${fmtTime(p.occ_s)} ↗`);
    a.href = `https://www.youtube.com/watch?v=${encodeURIComponent(p.video_id)}` +
             `&t=${Math.max(0, Math.floor(p.occ_s))}s`;
    a.target = "_blank";
    a.rel = "noopener";
    meta.append(a);
    meta.append(el("span", "role-chip", p.occ_role || "unattributed"));
    meta.append(el("span", "kind-chip", `Δ${p.delta_s}s`));
    div.append(meta);
    div.append(highlight(p.context, e.term));
    div.append(el("p", "mention-quote",
                  `mention: “${p.mention_text}” @ ${fmtTime(p.mention_s)}`));
    wrap.append(div);
  }
}
