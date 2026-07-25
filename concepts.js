/* Creator concepts view. Static over site/data/concepts/. All text via
   textContent; evidence renders into the tray (never scrollIntoView);
   discovered, not pinned (DESIGN.md §3/§8). */
const DATA = "data/concepts";
const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
async function fetchJSON(path) {
  const r = await fetch(`${DATA}/${path}`);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

let CURRENT = null;   // loaded per-creator doc
let selectSeq = 0;    // guards against out-of-order fetches

function coverageText(cov) {
  const pct = Math.round((cov.coverage_pct || 0) * 100);
  const base = cov.complete
    ? `complete corpus (${cov.total_videos} videos)`
    : `partial sample — ${pct}% ingested (${cov.ingested_videos} of ${cov.total_videos} videos)`;
  const stale = cov.added_since > 0
    ? ` · ${cov.added_since} videos added since — re-run pending` : "";
  return `Based on ${cov.basis_videos} transcribed videos · ${base}${stale}`;
}

function rowNode(row) {
  const div = el("div", "concept-row");
  const name = el("span", "concept-surface", row.surface);
  div.appendChild(name);
  div.appendChild(el("span", "concept-dist", `dist ${row.distinctiveness.toFixed(1)} · ×${row.creator_count}`));
  if (row.signal) {
    div.classList.add("is-signal");
    const flag = el("button", "signal-flag", `⚑ ${row.note || "signal"}`);
    flag.type = "button";
    flag.addEventListener("click", () => showEvidence(row));
    div.appendChild(flag);
  }
  return div;
}

function showEvidence(row) {
  $("evidence-title").textContent = `“${row.surface}” — cited quotes`;
  const box = $("evidence-quotes");
  box.replaceChildren();
  const quotes = row.quotes || [];
  $("evidence-note").textContent = quotes.length
    ? `${quotes.length} cited line${quotes.length > 1 ? "s" : ""} behind “${row.note}”.`
    : "No quote stored for this row.";
  for (const q of quotes) box.appendChild(el("p", "evidence-quote", q));
}

function applyFilters() {
  if (!CURRENT) return;
  const showC = $("f-concepts").checked, showE = $("f-entities").checked,
        sigOnly = $("f-signal").checked;
  const pick = (rows) => rows.filter((r) => !sigOnly || r.signal);
  const cs = showC ? pick(CURRENT.concepts) : [];
  const es = showE ? pick(CURRENT.entities) : [];
  $("concepts-card").hidden = !showC;
  $("entities-card").hidden = !showE;
  const cl = $("concepts-list"); cl.replaceChildren();
  for (const r of cs) cl.appendChild(rowNode(r));
  if (showC && !cs.length) cl.appendChild(el("p", "insufficient-note",
    sigOnly && CURRENT.concepts.length > 0
      ? "No signal-flagged concepts — clear the Signal-only filter to see all."
      : "No concepts at current ingestion — see coverage above."));
  const eln = $("entities-list"); eln.replaceChildren();
  for (const r of es) eln.appendChild(rowNode(r));
  const hidden = (CURRENT.concepts.length + CURRENT.entities.length) - (cs.length + es.length);
  $("filter-note").textContent = hidden > 0 ? `${hidden} rows hidden by filters` : "";
}

async function selectCreator(slug, name) {
  const mySeq = ++selectSeq;
  let doc;
  try {
    doc = await fetchJSON(`${slug}.json`);
  } catch (e) {
    if (mySeq !== selectSeq) return;
    $("creator-view").hidden = true;
    const ph = $("placeholder");
    ph.hidden = false;
    ph.textContent = "Failed to load this creator — click to retry.";
    return;
  }
  if (mySeq !== selectSeq) return;
  CURRENT = doc;
  $("placeholder").hidden = true;
  $("creator-view").hidden = false;
  $("creator-title").textContent = name;
  const cov = $("coverage");
  cov.hidden = false;
  cov.textContent = coverageText(CURRENT.coverage);
  $("isolated-link").href = `map.html#${slug}`;
  $("evidence-title").textContent = "Cited quotes";
  $("evidence-quotes").replaceChildren();
  $("evidence-note").textContent = "Click a signal-flagged phrase (⚑) to see its quotes.";
  applyFilters();
}

async function init() {
  for (const id of ["f-concepts", "f-entities", "f-signal"])
    $(id).addEventListener("change", applyFilters);
  let idx;
  try { idx = await fetchJSON("index.json"); }
  catch (e) {
    $("corpus-stats").textContent = "failed to load creator concepts — serve over HTTP "
      + "(python3 -m http.server -d site) and run export-creator-concepts first.";
    return;
  }
  $("corpus-stats").textContent = idx.meta.model
    ? `discovered ${idx.meta.classified_at?.slice(0, 10) || ""} · ${idx.meta.model} · not pinned`
    : "no classification run yet";
  const list = $("creator-list");
  const buttons = [];
  for (const c of idx.creators) {
    const b = el("button", "creator-item");
    b.type = "button";
    b.appendChild(el("span", "creator-name", c.display_name || c.slug));
    const pct = Math.round((c.coverage.coverage_pct || 0) * 100);
    b.appendChild(el("span", "creator-meta",
      `${c.counts.concept}c/${c.counts.entity}e · ${pct}% · ${c.side || "—"}`));
    b.addEventListener("click", () => {
      for (const other of buttons) other.removeAttribute("aria-current");
      b.setAttribute("aria-current", "true");
      selectCreator(c.slug, c.display_name || c.slug);
    });
    buttons.push(b);
    list.appendChild(b);
  }
}
init();
