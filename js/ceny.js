(() => {
// Strona /ceny/: wykresy cen Leafów z wątków grupy. Dane (window.CENY) wstawia szablon layouts/ceny.html
// z site/data/ceny.json, który buduje scripts/build_prices.py.
const DATA = window.CENY || [];
const FIRST = DATA.reduce((m, r) => r.post < m ? r.post : m, DATA[0]?.post || "");
const GROUPS = [
  ["I-24", "Leaf I · 24 kWh", "ZE0 / AZE0, lata 2011–2017"],
  ["I-30", "Leaf I · 30 kWh", "AZE0, lata 2016–2017"],
  ["I-?", "Leaf I · pojemność nieznana", "wpisy bez podanej baterii"],
  ["II-40", "Leaf II · 40 kWh", "ZE1, od 2018"],
  ["II-62", "Leaf II · 62 kWh (e+)", "ZE1, od 2019"],
  ["II-?", "Leaf II · pojemność nieznana", "wpisy bez podanej baterii"],
  ["swap", "Z wymienioną baterią", "Leaf I i II po przeszczepie większej baterii"],
  ["new", "Nowe auta", "Leaf I i II, ceny salonowe podawane w wątkach"],
  ["III", "Leaf III · 52 kWh", "crossover, w sprzedaży od lipca 2026 r., ceny nowych aut"],
];
const VARIANTS = ["Visia", "Acenta", "N-Connecta", "Tekna", "Nordic", "Black Edition", "SV", "wariant nieznany"];
const TYPES = { O: "ogłoszenie", T: "transakcja", W: "wycena / opinia", N: "cena nowego" };
const MON = ["sty","lut","mar","kwi","maj","cze","lip","sie","wrz","paź","lis","gru"];
const fmt = n => n.toLocaleString("pl-PL").replace(/ /g, " ");
const zl = n => fmt(n) + " zł";
const pct = v => v == null ? "—" : v.toLocaleString("pl-PL") + "%";
const barsTxt = b => b == null ? "" : `${String(b).replace(".5", "–" + (Math.floor(b) + 1))} ${Math.floor(b) >= 5 ? "kresek" : "kreski"}`;
const sohTxt = r => r.soh == null ? (r.bars != null ? barsTxt(r.bars) : "—") : r.est ? `≈${pct(r.soh)} (z ${barsTxt(r.bars)})` : pct(r.soh) + (r.bars != null ? `, ${barsTxt(r.bars)}` : "");
const ns = "http://www.w3.org/2000/svg";

// Rocznik → kolor (od starych, chłodnych, do nowych, ciepłych).
// Skale kolorów, wszędzie czerwony = gorzej, niebieski = lepiej: rocznik (od starych do nowych), SOH (od słabych do dobrych),
// przebieg (od małych, niebieskich, do dużych, czerwonych; w tys. km).
const SCALES = {
  y:   { stops: [[2011,[200,60,40]],[2014,[214,140,0]],[2017,[42,157,110]],[2020,[38,140,170]],[2023,[38,110,190]]], lo: "2011", hi: "2023+" },
  soh: { stops: [[50,[200,60,40]],[70,[214,140,0]],[85,[42,157,110]],[95,[38,110,190]]], lo: "≤50%", hi: "≥95%" },
  km:  { stops: [[20,[38,110,190]],[80,[42,157,110]],[140,[214,140,0]],[200,[200,60,40]]], lo: "≤20 tys. km", hi: "≥200 tys. km" },
};
const MODE_LABEL = { y: "rocznik", soh: "SOH", km: "przebieg" };
const MODE_MISSING = { soh: "brak SOH i kresek we wpisie", km: "brak przebiegu we wpisie" };
const MODE_KNOWN = { soh: "SOH w", km: "z przebiegiem:" };
let MODE = "y";
function scaleColor(v, stops) {
  if (v == null) return "var(--unknown)";
  if (v <= stops[0][0]) return `rgb(${stops[0][1]})`;
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) {
    const [v0,c0] = stops[i-1], [v1,c1] = stops[i], t = (v - v0) / (v1 - v0);
    return `rgb(${c0.map((c,k) => Math.round(c + (c1[k]-c) * t))})`;
  }
  return `rgb(${stops.at(-1)[1]})`;
}
const val = r => MODE === "y" ? r.y : r[MODE];
const pointColor = r => scaleColor(val(r), SCALES[MODE].stops);

const toT = s => { const [y,m,d] = s.split("-").map(Number); return y * 12 + (m - 1) + (d - 1) / 31; };
const T0 = Math.floor(Math.min(...DATA.map(r => toT(r.d))) / 6) * 6;
const T1 = Math.ceil((Math.max(...DATA.map(r => toT(r.d))) + 0.5) / 3) * 3;

function filters() {
  return { O: $("f-O").checked, T: $("f-T").checked, W: $("f-W").checked, bad: $("f-bad").checked,
    v: new Set(VARIANTS.filter((v, i) => $("v-" + i)?.checked)) };
}
function $(id) { return document.getElementById(id); }
function visible(r, f) { return (r.t === "N" || f[r.t]) && (f.bad || !r.bad) && f.v.has(r.v); }

function variantControls() {
  const box = $("cn-variants");
  box.innerHTML = `<span class="lbl">Wariant</span>` + VARIANTS.map((v, i) => {
    const n = DATA.filter(r => r.v === v).length;
    return n ? `<label><input type="checkbox" id="v-${i}" checked> ${v} <span class="cnt">${n}</span></label>` : "";
  }).join("") + `<button type="button" id="v-all">wszystkie</button>`;
  box.addEventListener("change", render);
  $("v-all").addEventListener("click", () => { box.querySelectorAll("input").forEach(i => i.checked = true); render(); });
}

function median(a) { const s = [...a].sort((x,y) => x-y), n = s.length; return n % 2 ? s[(n-1)/2] : (s[n/2-1] + s[n/2]) / 2; }
function niceStep(range, n) {
  const raw = range / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(ns, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function marker(g, r, x, y) {
  const c = pointColor(r);
  if (MODE !== "y" && val(r) == null) g.setAttribute("opacity", .35);
  if (r.bad) {
    el("path", { d: `M${x-4},${y-4}L${x+4},${y+4}M${x-4},${y+4}L${x+4},${y-4}`, stroke: c, "stroke-width": 2, fill: "none" }, g);
    el("circle", { cx: x, cy: y, r: 6, fill: "transparent" }, g);
  } else if (r.t === "T") {
    el("rect", { x: x-4, y: y-4, width: 8, height: 8, fill: c, transform: `rotate(45 ${x} ${y})` }, g);
  } else if (r.t === "W") {
    el("circle", { cx: x, cy: y, r: 4, fill: "var(--surface)", stroke: c, "stroke-width": 2 }, g);
  } else {
    el("circle", { cx: x, cy: y, r: 4.2, fill: c, "fill-opacity": .9 }, g);
  }
}

function chart(rows, yDom, wide) {
  const W = wide ? 980 : 480, H = wide ? 290 : 250, L = 52, R = 12, Tm = 10, B = 26;
  const sx = t => L + (t - T0) / (T1 - T0) * (W - L - R);
  const sy = p => Tm + (1 - (p - yDom[0]) / (yDom[1] - yDom[0])) * (H - Tm - B);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img" });
  // siatka i osie
  for (let p = yDom[0]; p <= yDom[1] + 1; p += yDom[2]) {
    el("line", { x1: L, x2: W - R, y1: sy(p), y2: sy(p), stroke: "var(--grid)", "stroke-width": 1 }, svg);
    const t = el("text", { x: L - 6, y: sy(p) + 4, "text-anchor": "end", "font-size": 11 }, svg);
    t.textContent = p >= 1000 ? fmt(p / 1000) + " tys." : fmt(p);
  }
  const every = wide ? 3 : 6;
  for (let t = Math.ceil(T0 / every) * every; t <= T1; t += every) {
    el("line", { x1: sx(t), x2: sx(t), y1: Tm, y2: H - B, stroke: "var(--grid)", "stroke-width": t % 12 === 0 ? 1.5 : 1 }, svg);
    if (!wide && t % 12) continue;
    const lab = el("text", { x: sx(t), y: H - 8, "text-anchor": "middle", "font-size": 11 }, svg);
    lab.textContent = wide ? `${MON[t % 12]} ${Math.floor(t / 12)}` : `${Math.floor(t / 12)}`;
  }
  // linia trendu: mediana kwartalna
  const q = new Map();
  for (const r of rows) if (!r.bad && (r.t === "O" || r.t === "T")) {
    const k = Math.floor(toT(r.d) / 3); (q.get(k) || q.set(k, []).get(k)).push(r.p);
  }
  const pts = [...q].filter(([,v]) => v.length >= 2).sort((a,b) => a[0]-b[0]).map(([k,v]) => [sx(k*3 + 1.5), sy(median(v))]);
  if (pts.length >= 2)
    el("polyline", { points: pts.map(p => p.join(",")).join(" "), fill: "none", stroke: "var(--trend)",
      "stroke-width": 2, "stroke-opacity": .55, "stroke-linejoin": "round" }, svg);
  const order = MODE === "y" ? rows : [...rows].sort((a, b) => (val(a) != null) - (val(b) != null));
  for (const r of order) {
    const g = el("g", { class: "pt", tabindex: 0, role: "button",
      "aria-label": `${zl(r.p)}, ${TYPES[r.t]}, ${r.d}` }, svg);
    marker(g, r, sx(toT(r.d)), sy(r.p));
    g.addEventListener("mouseenter", e => showTip(r, e, false));
    g.addEventListener("mouseleave", () => hideTip(false));
    g.addEventListener("click", e => { e.stopPropagation(); showTip(r, e, true); });
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showTip(r, e, true); } });
  }
  return svg;
}

const tip = $("cn-tip");
function showTip(r, e, pin) {
  if (tip.classList.contains("pinned") && !pin) return;
  const km = r.km != null ? fmt(Math.round(r.km * 1000)) + " km" : "—";
  tip.innerHTML = `<div class="price">${zl(r.p)}${r.netto ? " <span class='muted' style='font-size:12px'>(z netto)</span>" : ""}</div>
    <dl><dt>Rodzaj</dt><dd>${TYPES[r.t]}${r.bad ? ", uszkodzony lub zużyta bateria" : ""}</dd>
    <dt>Model</dt><dd>Leaf ${r.gen}${r.kwh ? " · " + r.kwh + " kWh" : ""} · ${r.v}</dd>
    <dt>Rocznik</dt><dd>${r.y ?? "—"}</dd><dt>Przebieg</dt><dd>${km}</dd>
    <dt>SOH</dt><dd>${sohTxt(r)}</dd><dt>Hx</dt><dd>${pct(r.hx)}</dd>
    <dt>Data</dt><dd>${r.d.slice(0,7)}${r.moved ? ` (wpis z ${r.post})` : r.post !== r.d ? "" : ""}</dd></dl>
    ${r.n ? `<div class="muted">${r.n}</div>` : ""}
    ${pin ? `<div style="margin-top:6px"><a href="${r.url}" target="_blank" rel="noopener">Otwórz wpis na Facebooku</a></div>` : ""}`;
  tip.hidden = false;
  tip.classList.toggle("pinned", pin);
  const box = (e.currentTarget || e.target).getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = box.left + box.width / 2 - tw / 2, y = box.top - th - 10;
  if (y < 8) y = box.bottom + 10;
  x = Math.max(8, Math.min(x, innerWidth - tw - 8));
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
function hideTip(force) { if (force || !tip.classList.contains("pinned")) { tip.hidden = true; tip.classList.remove("pinned"); } }
document.addEventListener("click", e => { if (!tip.contains(e.target)) hideTip(true); });
document.addEventListener("keydown", e => { if (e.key === "Escape") hideTip(true); });
addEventListener("scroll", () => hideTip(true), { passive: true });

function legend() {
  const sym = (inner) => `<svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">${inner}</svg>`;
  const c = "var(--muted)";
  $("cn-legend").innerHTML = `
    <span>${sym(`<circle r="4.2" fill="${c}"/>`)} ogłoszenie</span>
    <span>${sym(`<rect x="-4" y="-4" width="8" height="8" fill="${c}" transform="rotate(45)"/>`)} transakcja</span>
    <span>${sym(`<circle r="4" fill="var(--surface)" stroke="${c}" stroke-width="2"/>`)} wycena</span>
    <span>${sym(`<path d="M-4,-4L4,4M-4,4L4,-4" stroke="${c}" stroke-width="2"/>`)} uszkodzony / zużyta bateria</span>
    <span class="ramp">${MODE_LABEL[MODE]}: ${SCALES[MODE].lo} <i style="background:linear-gradient(90deg,${SCALES[MODE].stops.map(([v]) => scaleColor(v, SCALES[MODE].stops)).join(",")})"></i> ${SCALES[MODE].hi}</span>
    ${MODE === "y" ? "" : `<span>${sym(`<circle r="4.2" fill="var(--unknown)" opacity=".35"/>`)} ${MODE_MISSING[MODE]}</span>`}
    <span class="ramp"><i style="width:22px;height:2px;background:var(--trend);opacity:.55"></i> mediana kwartalna</span>`;
}

function halves(rows) {
  const h = new Map();
  for (const r of rows) if (!r.bad && (r.t === "O" || r.t === "T")) {
    const [y, m] = r.d.split("-").map(Number), k = `${y} ${m <= 6 ? "I" : "II"} poł.`;
    (h.get(k) || h.set(k, []).get(k)).push(r.p);
  }
  return [...h].sort().filter(([,v]) => v.length >= 3)
    .map(([k,v]) => `<span>${k}: <b>${fmt(Math.round(median(v) / 100) * 100)}</b> <span style="padding:0;border:0">(${v.length})</span></span>`).join("");
}

function render() {
  const f = filters(), root = $("cn-models");
  root.innerHTML = "";
  const shown = DATA.filter(r => visible(r, f));
  $("cn-lede").textContent = `${fmt(DATA.length)} cen z ${new Set(DATA.map(r => r.url)).size} wątków, wpisy od ${MON[+FIRST.slice(5,7)-1]} ${FIRST.slice(0,4)} do ${MON[+DATA.at(-1).post.slice(5,7)-1]} ${DATA.at(-1).post.slice(0,4)}. Kliknij punkt, żeby zobaczyć szczegóły i link do wpisu.`;
  for (const [key, title, sub] of GROUPS) {
    const rows = shown.filter(r => r.g === key);
    const all = DATA.filter(r => r.g === key);
    if (!all.length) continue;
    const ps = all.map(r => r.p), step = niceStep(Math.max(...ps) - Math.min(...ps) || 10000, 5);
    const yDom = [Math.max(0, Math.floor(Math.min(...ps) / step) * step), Math.ceil(Math.max(...ps) / step) * step, step];
    const sec = document.createElement("section");
    sec.className = "model";
    sec.innerHTML = `<div class="model-head"><div><h2>${title}</h2><div class="muted" style="font-size:14px">${sub} · ${rows.length} z ${all.length} cen</div></div>
      <div class="halves" title="Mediana ogłoszeń i transakcji w półroczu (liczba cen)">${key === "new" || key === "III" ? "" : halves(rows)}</div></div>`;
    const grid = document.createElement("div");
    grid.className = "charts";
    const card = (name, rs, wide) => {
      const c = document.createElement("div");
      c.className = "card" + (wide ? " wide" : "");
      const nest = MODE === "soh" ? rs.filter(r => r.est).length : 0;
      const known = MODE === "y" ? "" : `, ${MODE_KNOWN[MODE]} ${rs.filter(r => val(r) != null).length}${nest ? ` (${nest} z kresek)` : ""}`;
      c.innerHTML = `<div class="card-head"><h3>${name}</h3><span class="n">${rs.length} ${rs.length === 1 ? "cena" : rs.length % 10 >= 2 && rs.length % 10 <= 4 && (rs.length % 100 < 10 || rs.length % 100 > 20) ? "ceny" : "cen"}${known}</span></div>`;
      const svg = chart(rs, yDom, wide);
      svg.setAttribute("aria-label", `${title}, ${name}: ceny w czasie`);
      c.appendChild(svg);
      grid.appendChild(c);
    };
    const sel = VARIANTS.filter(v => f.v.has(v) && all.some(r => r.v === v));
    const allSel = VARIANTS.every(v => f.v.has(v) || !all.some(r => r.v === v));
    card(allSel ? "Wszystkie warianty" : sel.length ? sel.join(", ") : "Żaden wariant nie jest zaznaczony", rows, true);
    sec.appendChild(grid);
    const det = document.createElement("details");
    det.innerHTML = `<summary>Źródła: ${rows.length} rekordów</summary><div class="tablewrap"><table>
      <thead><tr><th>Data</th><th>Wariant</th><th>kWh</th><th>Rocznik</th><th style="text-align:right">Przebieg</th><th style="text-align:right">Cena</th><th style="text-align:right">SOH</th><th style="text-align:right">Hx</th><th>Rodzaj</th><th>Uwagi</th><th>Wpis</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="date">${r.d.slice(0,7)}</td><td>${r.v}</td><td>${r.kwh || "—"}</td><td>${r.y ?? "—"}</td>
        <td class="num">${r.km != null ? fmt(Math.round(r.km)) + " tys. km" : "—"}</td><td class="num">${zl(r.p)}</td><td class="num">${r.soh == null ? "—" : (r.est ? "≈" : "") + pct(r.soh)}</td><td class="num">${pct(r.hx)}</td><td>${TYPES[r.t]}</td>
        <td>${r.n}</td><td><a href="${r.url}" target="_blank" rel="noopener">post</a></td></tr>`).join("")}
      </tbody></table></div>`;
    sec.appendChild(det);
    root.appendChild(sec);
  }
}

{ const h = location.hash.slice(1); if (h in SCALES) { MODE = h; $("cn-mode").value = h; } }
variantControls();
legend();
render();
for (const id of ["f-O", "f-T", "f-W", "f-bad"]) $(id).addEventListener("change", render);
$("cn-mode").addEventListener("change", e => { MODE = e.target.value; legend(); render(); });
})();
