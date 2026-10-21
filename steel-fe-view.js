// Views (SVG / HTML strings) of the elastic bolt-force FE of the lap joint
// and the bolt group: stress map of the plates (sequential blue ramp, one
// path per colour band), bolt-force bars, the long-joint efficiency against
// beta_Lf, and the bolt-by-bolt comparison tables. Plus a small controller
// that runs the FE in the page after the check (debounced). No DOM access in
// the view functions: they are used by the pages and by the Node tests.
import { f1 } from "./drawing.js";
import { escapeHtml } from "./check-view.js";

const INK = "#1f2a36", MUTED = "#5b6773", GRID = "#d9dee4", FE_COLOR = "#2a78d6", CHAIN = "#1f2a36", LOAD = "#b03a2e", POLAR = "#1f2a36";
// sequential blue ramp, steps 100..700 (light = low)
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
const BANDS = RAMP.length;

const kN = value => (value / 1000);
const n1 = value => (Number.isFinite(value) ? value.toFixed(1) : "—");
const n2 = value => (Number.isFinite(value) ? value.toFixed(2) : "—");
const n3 = value => (Number.isFinite(value) ? value.toFixed(3) : "—");

/**
 * Stress map: element values coloured in bands; parts drawn with an offset
 * (dy per part) so that overlapping plates of a lap joint are shown one above
 * the other. bolts: [{ x, y, part, fx, fy, label }] with forces in N.
 */
export function stressMapSvg(field, values, options) {
  const { parts, offsets, title, label, bolts = [], yDown = true, unit = "MPa", quantity = "σ" } = options;
  const xy = field.xy;
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  const nodeY = (n, part) => (yDown ? xy[2 * n + 1] : -xy[2 * n + 1]) + (offsets[part] ?? 0);
  for (let e = 0; e < field.part.length; e++) {
    if (!parts.includes(field.part[e])) continue;
    for (let k = 0; k < 4; k++) {
      const n = field.quads[4 * e + k];
      xMin = Math.min(xMin, xy[2 * n]); xMax = Math.max(xMax, xy[2 * n]);
      const y = nodeY(n, field.part[e]); yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
    }
  }
  const selected = values.filter((_, e) => parts.includes(field.part[e]));
  const vMin = Math.min(...selected), vMax = Math.max(...selected);
  const span = vMax - vMin || 1;
  const paths = Array.from({ length: BANDS }, () => []);
  for (let e = 0; e < field.part.length; e++) {
    if (!parts.includes(field.part[e])) continue;
    const band = Math.min(BANDS - 1, Math.floor((values[e] - vMin) / span * BANDS));
    const pts = [0, 1, 2, 3].map(k => { const n = field.quads[4 * e + k]; return `${f1(xy[2 * n])},${f1(nodeY(n, field.part[e]))}`; });
    paths[band].push(`M${pts.join("L")}Z`);
  }
  const W = xMax - xMin, H = yMax - yMin;
  const size = Math.max(W, H) / 40;
  const body = [];
  paths.forEach((list, band) => { if (list.length) body.push(`<path d="${list.join("")}" fill="${RAMP[band]}" stroke="${RAMP[band]}" stroke-width="${f1(size * 0.02)}"/>`); });
  // plate outlines
  for (const part of parts) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let e = 0; e < field.part.length; e++) {
      if (field.part[e] !== part) continue;
      for (let k = 0; k < 4; k++) { const n = field.quads[4 * e + k]; a = Math.min(a, xy[2 * n]); b = Math.max(b, xy[2 * n]); const y = nodeY(n, part); c = Math.min(c, y); d = Math.max(d, y); }
    }
    body.push(`<rect x="${f1(a)}" y="${f1(c)}" width="${f1(b - a)}" height="${f1(d - c)}" fill="none" stroke="${INK}" stroke-width="${f1(size * 0.1)}"/>`);
    if (options.partLabels?.[part]) body.push(`<text x="${f1(a + size * 0.4)}" y="${f1(c - size * 0.4)}" font-size="${f1(size * 0.9)}" fill="${INK}">${options.partLabels[part]}</text>`);
  }
  // bolts and force arrows (scaled to the largest bolt force)
  const maxForce = Math.max(1e-9, ...bolts.map(b => Math.hypot(b.fx, b.fy)));
  const arrowLength = options.arrowLength ?? 6 * size;
  for (const bolt of bolts) {
    const y = (yDown ? bolt.y : -bolt.y) + (offsets[bolt.part] ?? 0);
    const force = Math.hypot(bolt.fx, bolt.fy);
    const s = arrowLength / maxForce;
    const ex = bolt.x + bolt.fx * s, ey = y + (yDown ? bolt.fy : -bolt.fy) * s;
    body.push(`<g><title>${escapeHtml(bolt.label)}</title><circle cx="${f1(bolt.x)}" cy="${f1(y)}" r="${f1(options.boltRadius ?? size * 0.5)}" fill="#ffffff" stroke="${INK}" stroke-width="${f1(size * 0.1)}"/>`
      + (force > 1e-9 ? `<line x1="${f1(bolt.x)}" y1="${f1(y)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="${LOAD}" stroke-width="${f1(size * 0.18)}" stroke-linecap="round"/>` : "") + `</g>`);
    if (bolt.compare) {
      const cx = bolt.x + bolt.compare.fx * s, cy = y + (yDown ? bolt.compare.fy : -bolt.compare.fy) * s;
      body.push(`<line x1="${f1(bolt.x)}" y1="${f1(y)}" x2="${f1(cx)}" y2="${f1(cy)}" stroke="${POLAR}" stroke-width="${f1(size * 0.07)}" stroke-dasharray="${f1(size * 0.35)} ${f1(size * 0.25)}"/>`);
    }
  }
  // colour bar under the map
  const barY = yMax + 2.2 * size, barW = Math.min(W, 30 * size), barH = 0.9 * size;
  const gid = `ramp-${Math.random().toString(36).slice(2, 8)}`;
  const stops = RAMP.map((colour, i) => `<stop offset="${(i / (BANDS - 1)).toFixed(3)}" stop-color="${colour}"/>`).join("");
  body.push(`<rect x="${f1(xMin)}" y="${f1(barY)}" width="${f1(barW)}" height="${f1(barH)}" fill="url(#${gid})" stroke="${MUTED}" stroke-width="${f1(size * 0.04)}"/>`);
  for (const [t, v] of [[0, vMin], [0.5, (vMin + vMax) / 2], [1, vMax]]) {
    body.push(`<text x="${f1(xMin + t * barW)}" y="${f1(barY + barH + 1.1 * size)}" font-size="${f1(size * 0.8)}" text-anchor="${t === 0 ? "start" : t === 1 ? "end" : "middle"}" fill="${INK}">${v.toFixed(0)}</text>`);
  }
  body.push(`<text x="${f1(xMin + barW + size)}" y="${f1(barY + barH * 0.85)}" font-size="${f1(size * 0.8)}" fill="${INK}">${quantity} (${unit}), element centroids; arrows: bolt forces${bolts.some(b => b.compare) ? " (solid: FE, dashed: elastic polar method)" : ""}</text>`);
  const vb = [xMin - 2 * size, yMin - 3.5 * size, W + 4 * size, H + 8.5 * size];
  return `<svg class="drawing fe-map" viewBox="${vb.map(f1).join(" ")}" role="img" aria-label="${escapeHtml(label)}" font-family="Arial, Helvetica, sans-serif">
<defs><linearGradient id="${gid}">${stops}</linearGradient></defs>
<text x="${f1(xMin)}" y="${f1(yMin - 2 * size)}" font-size="${f1(size)}" font-weight="700" fill="${INK}">${title}</text>
${body.join("\n")}
</svg>`;
}

/** Axis helper: nice tick step. */
function niceStep(range, count) {
  const raw = range / count, magnitude = 10 ** Math.floor(Math.log10(raw)), r = raw / magnitude;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * magnitude;
}

/** Row forces of the lap joint: FE bars, chain markers, uniform share line (kN). */
export function rowForceChartSvg(fe) {
  const rows = fe.rowForces.length;
  const W = 640, H = 300, left = 56, right = 16, top = 34, bottom = 46;
  const yMax = Math.max(...fe.rowForces, ...fe.chainRowForces, fe.uniformRowForce) * 1.15 / 1000;
  const step = niceStep(yMax, 5);
  const top2 = Math.ceil(yMax / step) * step;
  const X = i => left + (i + 0.5) * (W - left - right) / rows;
  const Y = v => top + (H - top - bottom) * (1 - v / top2);
  const barW = Math.min(36, 0.55 * (W - left - right) / rows);
  const parts = [];
  for (let v = 0; v <= top2 + 1e-9; v += step) {
    parts.push(`<line x1="${left}" y1="${f1(Y(v))}" x2="${W - right}" y2="${f1(Y(v))}" stroke="${GRID}" stroke-width="1"/>`);
    parts.push(`<text x="${left - 6}" y="${f1(Y(v) + 4)}" font-size="11" text-anchor="end" fill="${MUTED}">${+v.toFixed(6)}</text>`);
  }
  fe.rowForces.forEach((f, i) => {
    const v = kN(f), x = X(i) - barW / 2, y = Y(v), h = Y(0) - y;
    parts.push(`<g><title>Row ${i + 1}: FE ${n2(v)} kN, chain ${n2(kN(fe.chainRowForces[i]))} kN, uniform ${n2(kN(fe.uniformRowForce))} kN</title><path d="M${f1(x)},${f1(Y(0))} V${f1(y + 4)} Q${f1(x)},${f1(y)} ${f1(x + 4)},${f1(y)} H${f1(x + barW - 4)} Q${f1(x + barW)},${f1(y)} ${f1(x + barW)},${f1(y + 4)} V${f1(Y(0))} Z" fill="${FE_COLOR}"/></g>`);
    const cy = Y(kN(fe.chainRowForces[i]));
    parts.push(`<path d="M${f1(X(i))},${f1(cy - 6)} L${f1(X(i) + 6)},${f1(cy)} L${f1(X(i))},${f1(cy + 6)} L${f1(X(i) - 6)},${f1(cy)} Z" fill="#ffffff" stroke="${CHAIN}" stroke-width="2"/>`);
    if (rows <= 16) parts.push(`<text x="${f1(X(i))}" y="${H - bottom + 16}" font-size="11" text-anchor="middle" fill="${MUTED}">${i + 1}</text>`);
  });
  const ends = [0, rows - 1];
  for (const i of [...new Set(ends)]) parts.push(`<text x="${f1(X(i))}" y="${f1(Y(kN(fe.rowForces[i])) - 9)}" font-size="11" text-anchor="middle" fill="${INK}">${n1(kN(fe.rowForces[i]))}</text>`);
  parts.push(`<line x1="${left}" y1="${f1(Y(kN(fe.uniformRowForce)))}" x2="${W - right}" y2="${f1(Y(kN(fe.uniformRowForce)))}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="6 4"/>`);
  parts.push(`<line x1="${left}" y1="${f1(Y(0))}" x2="${W - right}" y2="${f1(Y(0))}" stroke="${INK}" stroke-width="1"/>`);
  parts.push(`<text x="${(left + W - right) / 2}" y="${H - 8}" font-size="11" text-anchor="middle" fill="${MUTED}">bolt row (row 1 at the free end of plate 1, the last row next to its loaded end)</text>`);
  parts.push(`<text x="${left}" y="14" font-size="12" font-weight="700" fill="${INK}">Force per bolt row (kN)</text>`);
  // legend
  const lx = W - right - 330;
  parts.push(`<rect x="${lx}" y="6" width="12" height="12" rx="2" fill="${FE_COLOR}"/><text x="${lx + 17}" y="16" font-size="11" fill="${INK}">FE</text>`);
  parts.push(`<path d="M${lx + 52},6 L${lx + 58},12 L${lx + 52},18 L${lx + 46},12 Z" fill="#ffffff" stroke="${CHAIN}" stroke-width="2"/><text x="${lx + 63}" y="16" font-size="11" fill="${INK}">bar-spring chain</text>`);
  parts.push(`<line x1="${lx + 165}" y1="12" x2="${lx + 189}" y2="12" stroke="${INK}" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${lx + 194}" y="16" font-size="11" fill="${INK}">uniform F / n<tspan dy="3" font-size="8">rows</tspan></text>`);
  return `<svg class="fe-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Force per bolt row: FE, bar-spring chain and uniform share" font-family="Arial, Helvetica, sans-serif">${parts.join("")}</svg>`;
}

/** Elastic efficiency F_mean / F_max of the chain against L_j / d, with beta_Lf (EN 1993-1-8 3.8) and the FE point. */
export function etaCurveSvg(fe, d) {
  const W = 640, H = 300, left = 52, right = 16, top = 34, bottom = 46;
  const xMax = Math.max(70, ...fe.etaCurve.map(p => p.LjOverD)) , yMin = Math.min(0.5, Math.floor(Math.min(...fe.etaCurve.map(p => p.eta), fe.etaElastic) * 10) / 10);
  const X = v => left + (W - left - right) * v / xMax;
  const Y = v => top + (H - top - bottom) * (1 - (v - yMin) / (1 - yMin));
  const parts = [];
  for (let v = yMin; v <= 1 + 1e-9; v += 0.1) {
    parts.push(`<line x1="${left}" y1="${f1(Y(v))}" x2="${W - right}" y2="${f1(Y(v))}" stroke="${GRID}"/>`);
    parts.push(`<text x="${left - 6}" y="${f1(Y(v) + 4)}" font-size="11" text-anchor="end" fill="${MUTED}">${v.toFixed(1)}</text>`);
  }
  for (let v = 0; v <= xMax + 1e-9; v += 10) parts.push(`<text x="${f1(X(v))}" y="${H - bottom + 16}" font-size="11" text-anchor="middle" fill="${MUTED}">${v}</text>`);
  // beta_Lf
  const beta = [[0, 1], [15, 1], [65, 0.75], [xMax, 0.75]];
  parts.push(`<polyline points="${beta.map(([x, y]) => `${f1(X(x))},${f1(Y(y))}`).join(" ")}" fill="none" stroke="${INK}" stroke-width="2"/>`);
  parts.push(`<text x="${f1(X(40))}" y="${f1(Y(0.875) - 8)}" font-size="11" fill="${INK}">β<tspan dy="3" font-size="8">Lf</tspan><tspan dy="-3"> (3.5)</tspan></text>`);
  // elastic chain efficiency
  const pts = fe.etaCurve;
  parts.push(`<polyline points="${pts.map(p => `${f1(X(p.LjOverD))},${f1(Y(p.eta))}`).join(" ")}" fill="none" stroke="${FE_COLOR}" stroke-width="2"/>`);
  for (const p of pts) parts.push(`<g><title>${p.rows} rows: L_j/d = ${n1(p.LjOverD)}, elastic F_mean/F_max = ${n3(p.eta)}, β_Lf = ${n3(p.betaLf)}</title><circle cx="${f1(X(p.LjOverD))}" cy="${f1(Y(p.eta))}" r="4" fill="${FE_COLOR}" stroke="#ffffff" stroke-width="2"/></g>`);
  // current FE point
  const cx = X(fe.Lj / d), cy = Y(fe.etaElastic);
  parts.push(`<g><title>This joint (FE): L_j/d = ${n1(fe.Lj / d)}, F_mean/F_max = ${n3(fe.etaElastic)}, β_Lf = ${n3(fe.betaLf)}</title><circle cx="${f1(cx)}" cy="${f1(cy)}" r="7" fill="#ffffff" stroke="${LOAD}" stroke-width="3"/></g>`);
  parts.push(`<line x1="${left}" y1="${f1(Y(yMin))}" x2="${W - right}" y2="${f1(Y(yMin))}" stroke="${INK}"/>`);
  parts.push(`<text x="${(left + W - right) / 2}" y="${H - 8}" font-size="11" text-anchor="middle" fill="${MUTED}">L<tspan dy="3" font-size="8">j</tspan><tspan dy="-3"> / d (same plates, bolts and pitch, more rows)</tspan></text>`);
  parts.push(`<text x="${left}" y="14" font-size="12" font-weight="700" fill="${INK}">Elastic efficiency F<tspan dy="3" font-size="8">mean</tspan><tspan dy="-3"> / F</tspan><tspan dy="3" font-size="8">max</tspan><tspan dy="-3"> against β</tspan><tspan dy="3" font-size="8">Lf</tspan></text>`);
  const lx = W - right - 250;
  parts.push(`<line x1="${lx}" y1="12" x2="${lx + 20}" y2="12" stroke="${FE_COLOR}" stroke-width="2"/><circle cx="${lx + 10}" cy="12" r="4" fill="${FE_COLOR}"/><text x="${lx + 25}" y="16" font-size="11" fill="${INK}">elastic (chain)</text>`);
  parts.push(`<circle cx="${lx + 120}" cy="12" r="6" fill="#ffffff" stroke="${LOAD}" stroke-width="3"/><text x="${lx + 131}" y="16" font-size="11" fill="${INK}">this joint (FE)</text>`);
  return `<svg class="fe-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Elastic efficiency against the long-joint factor" font-family="Arial, Helvetica, sans-serif">${parts.join("")}</svg>`;
}

function stiffnessText(k) {
  return `bolt spring k = E / (1/k<sub>11</sub> + Σ1/k<sub>12</sub>) = ${n1(k.stiffness / 1000)} kN/mm (k<sub>11</sub> ${n3(k.k11)} mm, k<sub>12</sub> ${k.k12.map(n3).join(" / ")} mm, k<sub>b</sub> ${n3(k.kb)}; EN 1993-1-8 Table 6.11)`;
}

/** Result block of the lap joint FE. */
export function lapFeHtml(fe, input) {
  const d = input.bolt_diameter_mm;
  const bolts = fe.bolts.flatMap(b => [1, 2].map(part => ({ x: b.x, y: b.y, part, fx: part === 1 ? -b.fx : b.fx, fy: part === 1 ? -b.fy : b.fy, label: `Bolt ${b.id} (row ${b.row}, column ${b.col}): ${n2(kN(b.force))} kN` })));
  const offsets = { 1: 0, 2: input.plate_width_mm * 1.35 };
  const map = stressMapSvg(fe.field, fe.field.sx, { parts: [1, 2], offsets, title: "Axial stress σx in the plates (FE, elastic); arrows: bolt force acting on each plate", label: "Axial stress in plate 1 and plate 2 with the bolt forces",
    bolts, partLabels: { 1: `plate 1 (t ${input.plate_t1_mm}, pulled at the right end)`, 2: `plate 2 (t ${input.plate_t2_mm}, held at the left end)` }, quantity: "σx", boltRadius: d / 2, arrowLength: 0.45 * Math.min(input.p1_mm || 3 * d, 3 * d) });
  const rows = fe.rowForces.map((f, i) => `<tr><th scope="row">${i + 1}</th><td class="num">${n2(kN(f))}</td><td class="num">${n2(kN(fe.chainRowForces[i]))}</td><td class="num">${n3(f / fe.uniformRowForce)}</td></tr>`).join("");
  const longJoint = fe.Lj > 15 * d;
  return `
    <p class="fe-summary"><strong>Peak bolt force / mean bolt force = ${n3(fe.peakToMean)}</strong> (FE) · ${n3(fe.chainPeakToMean)} (bar-spring chain) · elastic efficiency F<sub>mean</sub>/F<sub>max</sub> = ${n3(fe.etaElastic)} ·
      L<sub>j</sub> = ${n1(fe.Lj)} mm = ${n1(fe.Lj / d)} d, β<sub>Lf</sub> = ${n3(fe.betaLf)}${longJoint ? "" : " (L<sub>j</sub> ≤ 15 d: no reduction)"}.</p>
    <p class="fe-note">The elastic distribution loads the end rows most. EN 1993-1-8 3.8 reduces the shear resistance only for L<sub>j</sub> &gt; 15 d and by less than the elastic peak, because the bolts and the holes deform plastically and share the load before failure; the elastic peak is therefore an upper bound on the end-row demand, not a resistance.</p>
    <div class="fe-charts">${rowForceChartSvg(fe)}${fe.etaCurve.length > 1 ? etaCurveSvg(fe, d) : ""}</div>
    ${map}
    <details class="intermediate"><summary>Row forces (table)</summary><div class="table-wrap"><table class="results-table"><thead><tr><th>Row</th><th class="num">FE (kN)</th><th class="num">Chain (kN)</th><th class="num">FE / uniform</th></tr></thead><tbody>${rows}</tbody></table></div></details>
    <p class="fe-meta">Model: two membrane plates (Q4, plane stress, E = 210 000 MPa, ν = 0.3) of width ${n1(input.plate_width_mm)} mm in one plane, overlap ${n1(fe.geometry.overlap)} mm plus ${n1(fe.geometry.freeLength)} mm free length each side; bolt load spread over the bolt area (diameter d); ${stiffnessText(fe.stiffness)}.
      Mesh ${n1(fe.meshSize)} mm, ${fe.elementCount} elements, ${fe.dofCount} DOF, ${fe.timingMs} ms; equilibrium error ${fe.equilibriumError.toExponential(1)}.</p>`;
}

/** Result block of the bolt group FE. */
export function groupFeHtml(fe, input) {
  const bolts = fe.bolts.map(b => ({ x: b.x, y: b.z, part: 1, fx: b.fx, fy: b.fz, compare: { fx: b.polarFx, fy: b.polarFz }, label: `Bolt ${b.id}: FE ${n2(kN(b.force))} kN, polar ${n2(kN(b.polarForce))} kN` }));
  const minPitch = Math.min(...[input.pitch_x_mm, input.pitch_z_mm].filter(p => p > 0), 120);
  const map = stressMapSvg(fe.field, fe.field.vonMises, { parts: [1], offsets: { 1: 0 }, title: "Von Mises stress in the plate (FE, elastic)", label: "Von Mises stress in the plate with the bolt forces",
    bolts, quantity: "σ_eq", boltRadius: input.bolt_diameter_mm / 2, arrowLength: 0.45 * minPitch });
  const rows = fe.bolts.map(b => `<tr><th scope="row">${b.id}</th><td class="num">${n1(b.x)}</td><td class="num">${n1(b.z)}</td><td class="num">${n2(kN(b.force))}</td><td class="num">${n2(kN(b.polarForce))}</td><td class="num">${n3(b.polarForce > 0 ? b.force / b.polarForce : NaN)}</td></tr>`).join("");
  return `
    <p class="fe-summary"><strong>Largest bolt force: FE ${n2(kN(fe.maxForce))} kN, elastic polar method ${n2(kN(fe.maxPolarForce))} kN (ratio ${n3(fe.peakRatio)})</strong>; largest difference per bolt ${n2(100 * fe.maxDeviation)} % of the largest polar force.</p>
    <p class="fe-note">The polar method assumes a rigid plate and equal bolts. The FE keeps the bolts equal but lets the plate deform; a difference of a few per cent or less confirms the rigid-plate assumption for this plate. Elastic distribution only: not a resistance.</p>
    ${map}
    <details class="intermediate" open><summary>Bolt forces, FE and polar method (table)</summary><div class="table-wrap"><table class="results-table"><thead><tr><th>Bolt</th><th class="num">x (mm)</th><th class="num">z (mm)</th><th class="num">FE (kN)</th><th class="num">Polar (kN)</th><th class="num">FE / polar</th></tr></thead><tbody>${rows}</tbody></table></div></details>
    <p class="fe-meta">Model: membrane plate (Q4, plane stress, E = 210 000 MPa, ν = 0.3) on bolt springs to a rigid support; the loads act as a distributed rigid-body load with the resultant (V<sub>x</sub>, V<sub>z</sub>, T) at the bolt-group centroid; ${stiffnessText(fe.stiffness)} (support member taken as a second ply of the same plate).
      Mesh ${n1(fe.meshSize)} mm, ${fe.elementCount} elements, ${fe.dofCount} DOF, ${fe.timingMs} ms; equilibrium error ${fe.equilibriumError.toExponential(1)}.</p>`;
}

/**
 * Runs the FE after each valid check (debounced): config { build(input,
 * result, divisions) -> FE input, run(feInput) -> result, render(fe, input) ->
 * HTML }. The page holds [data-fe-status], [data-fe-output], [data-fe-mesh]
 * and [data-fe-run].
 */
export function createFePanel(config) {
  const status = document.querySelector("[data-fe-status]");
  const output = document.querySelector("[data-fe-output]");
  const mesh = document.querySelector("[data-fe-mesh]");
  const button = document.querySelector("[data-fe-run]");
  let last = null, timer = null;
  function run() {
    if (!last) return;
    const { input, result } = last;
    let feInput;
    try {
      feInput = config.build(input, result, Number(mesh.value));
    } catch (error) {
      status.textContent = error.message;
      output.innerHTML = "";
      document.body.dataset.feStatus = "skipped";
      return;
    }
    status.textContent = "Running the FE model…";
    document.body.dataset.feStatus = "running";
    setTimeout(() => {
      try {
        const fe = config.run(feInput);
        output.innerHTML = config.render(fe, input);
        status.textContent = `FE done in ${fe.timingMs} ms (${fe.dofCount} DOF).`;
        document.body.dataset.feStatus = "done";
      } catch (error) {
        status.textContent = `The FE model could not be solved: ${error.message}`;
        output.innerHTML = "";
        document.body.dataset.feStatus = "error";
      }
    }, 20);
  }
  button.addEventListener("click", run);
  mesh.addEventListener("change", run);
  return {
    /** Call from the page's check function with the normalised input and the check result. */
    update(input, result) {
      last = { input, result };
      clearTimeout(timer);
      timer = setTimeout(run, 450);
    }
  };
}
