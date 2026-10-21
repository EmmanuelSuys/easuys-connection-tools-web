// Dimensioned drawings (SVG strings) of the basic steel connections: lap
// joint (plan and section), bolt group under eccentric load (elevation with
// the bolt forces), fillet weld (section and plan) and plate in tension
// (plan with the holes of the critical section). Pure functions without DOM
// access: used by the pages and by the Node tests. Units mm, forces kN.
import { PALETTE, arrowHead, dimH, dimV, f1, fmt, nextDrawingId, textAt } from "./drawing.js";

const { INK, STEEL, STEEL_DARK, BOLT, DIM } = PALETTE;
const LOAD = "#b03a2e";
const WELD = "#3d4852";
const CRITICAL = "#b03a2e";

function svg(viewBox, title, label, body, defs = "") {
  const [x, y, , , size] = viewBox;
  return `<svg class="drawing" viewBox="${viewBox.slice(0, 4).map(f1).join(" ")}" role="img" aria-label="${label}" font-family="Arial, Helvetica, sans-serif">
${defs ? `<defs>${defs}</defs>` : ""}
<text x="${f1(x + size * 0.2)}" y="${f1(y + size * 1.3)}" font-size="${f1(size)}" text-anchor="start" font-weight="700" fill="${INK}">${title}</text>
${body}
</svg>`;
}

function rect(x0, y0, x1, y1, fill, stroke = INK, width = 1, extra = "") {
  const x = Math.min(x0, x1), y = Math.min(y0, y1);
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(Math.abs(x1 - x0))}" height="${f1(Math.abs(y1 - y0))}" fill="${fill}" stroke="${stroke}" stroke-width="${f1(width)}" ${extra}/>`;
}

function hatch(id, size) {
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f1(size)}" height="${f1(size)}" patternTransform="rotate(45)"><rect width="${f1(size)}" height="${f1(size)}" fill="#eef1f4"/><line x1="0" y1="0" x2="0" y2="${f1(size)}" stroke="#9aa6b2" stroke-width="${f1(size * 0.12)}"/></pattern>`;
}

function loadArrow(x1, y1, x2, y2, size, label, anchor = "start", dx = 0.6, dy = -0.5) {
  const head = arrowHead(x2, y2, x2 - x1, y2 - y1, size * 1.2).replace(DIM, LOAD);
  const text = label ? textAt(x2 + dx * size, y2 + dy * size, label, size * 1.0, anchor, `font-weight="700" fill="${LOAD}"`).replace(`fill="${DIM}" `, "") : "";
  return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${LOAD}" stroke-width="${f1(size * 0.2)}"/>${head}${text}`;
}

function hole(x, y, d0, size, extra = "") {
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(d0 / 2)}" fill="#ffffff" stroke="${INK}" stroke-width="${f1(size * 0.09)}" ${extra}/>`
    + `<line x1="${f1(x - d0 / 2 - size * 0.4)}" y1="${f1(y)}" x2="${f1(x + d0 / 2 + size * 0.4)}" y2="${f1(y)}" stroke="${INK}" stroke-width="${f1(size * 0.04)}"/>`
    + `<line x1="${f1(x)}" y1="${f1(y - d0 / 2 - size * 0.4)}" x2="${f1(x)}" y2="${f1(y + d0 / 2 + size * 0.4)}" stroke="${INK}" stroke-width="${f1(size * 0.04)}"/>`;
}

function breakLine(x, y0, y1, size) {
  const mid = (y0 + y1) / 2, a = size * 0.8;
  return `<polyline points="${f1(x)},${f1(y0)} ${f1(x)},${f1(mid - a)} ${f1(x + a)},${f1(mid - a / 2)} ${f1(x - a)},${f1(mid + a / 2)} ${f1(x)},${f1(mid + a)} ${f1(x)},${f1(y1)}" fill="none" stroke="${INK}" stroke-width="${f1(size * 0.08)}"/>`;
}

/** Positions of the lap joint bolts: x along the force (from the free end of plate 1), y across (from the edge). */
export function lapJointGeometry(input) {
  const rows = input.num_rows, cols = input.num_cols, e1 = input.e1_mm, p1 = input.p1_mm ?? 0, p2 = input.p2_mm ?? 0, b = input.plate_width_mm;
  const overlap = 2 * e1 + (rows - 1) * p1;
  const xs = Array.from({ length: rows }, (_, i) => e1 + i * p1);
  const ys = Array.from({ length: cols }, (_, j) => b / 2 + (j - (cols - 1) / 2) * p2);
  return { rows, cols, e1, p1, p2, b, overlap, xs, ys, free: Math.max(0.6 * b, 3 * input.bolt_diameter_mm, 40) };
}

/** Plan of the lap joint: plate 2 (held, left), plate 1 (pulled, right), bolts, dimensions. */
export function lapJointPlanSvg(input, result, title = "Plan") {
  const g = lapJointGeometry(input);
  const L = g.overlap + 2 * g.free;
  const size = Math.max(L, g.b * 1.6) / 34;
  const parts = [];
  const hatchId = nextDrawingId("support");
  // plate 2 (lower, held at the left) and plate 1 (upper, pulled to the right)
  parts.push(rect(-g.free, 0, g.overlap, g.b, STEEL_DARK, INK, size * 0.08));
  parts.push(rect(0, 0, g.overlap + g.free, g.b, STEEL, INK, size * 0.1, `fill-opacity="0.82"`));
  parts.push(`<line x1="${f1(g.overlap)}" y1="0" x2="${f1(g.overlap)}" y2="${f1(g.b)}" stroke="${INK}" stroke-width="${f1(size * 0.06)}" stroke-dasharray="${f1(size * 0.5)} ${f1(size * 0.3)}"/>`);
  parts.push(rect(-g.free - 1.6 * size, -0.6 * size, -g.free, g.b + 0.6 * size, `url(#${hatchId})`, "none", 0));
  parts.push(breakLine(g.overlap + g.free, 0, g.b, size));
  for (const x of g.xs) for (const y of g.ys) parts.push(hole(x, y, result.d0, size));
  parts.push(loadArrow(g.overlap + g.free + 0.6 * size, g.b / 2, g.overlap + g.free + 6 * size, g.b / 2, size, `F<tspan dy="0.3em" font-size="70%">Ed</tspan><tspan dy="-0.3em"> ${fmt(input.force_uls_kn)} kN</tspan>`, "start", -5.4, -1.2));
  parts.push(textAt(g.overlap + g.free / 2, g.b - size * 0.6, `plate 1, t ${fmt(input.plate_t1_mm)}`, size * 0.8));
  parts.push(textAt(-g.free / 2, g.b - size * 0.6, `plate 2, t ${fmt(input.plate_t2_mm)}`, size * 0.8));
  // dimensions along the force (below) and across (right)
  const yChain = g.b + 2 * size;
  const stops = [0, ...g.xs, g.overlap];
  for (let i = 0; i < stops.length - 1; i++) {
    const label = i === 0 || i === stops.length - 2 ? `e1 ${fmt(g.e1)}` : `p1 ${fmt(g.p1)}`;
    parts.push(dimH(stops[i], stops[i + 1], yChain, g.b + size * 0.3, label, size * 0.75));
  }
  const xChain = g.overlap + g.free + 9 * size;
  const vstops = [0, ...g.ys, g.b];
  for (let j = 0; j < vstops.length - 1; j++) {
    const label = j === 0 || j === vstops.length - 2 ? `e2 ${fmt(vstops[j + 1] - vstops[j])}` : `p2 ${fmt(g.p2)}`;
    parts.push(dimV(vstops[j], vstops[j + 1], xChain, g.overlap + g.free + 7.5 * size, label, size * 0.75));
  }
  parts.push(dimV(0, g.b, xChain + 7 * size, xChain + 5.5 * size, `b ${fmt(g.b)}`, size * 0.8));
  const vb = [-g.free - 2.5 * size, -3 * size, L + 22 * size, g.b + 7 * size, size];
  return svg(vb, `${title} — ${g.rows} × ${g.cols} bolts M${fmt(input.bolt_diameter_mm)} ${result.input.boltClass}, holes d0 ${fmt(result.d0)}`, `${title}: lap joint with bolt pattern and dimensions`, parts.join("\n"), hatch(hatchId, size));
}

/** Longitudinal section of the single lap: plate 1 on top of plate 2, bolts through both. */
export function lapJointSectionSvg(input, result, title = "Section") {
  const g = lapJointGeometry(input);
  const t1 = input.plate_t1_mm, t2 = input.plate_t2_mm, d = input.bolt_diameter_mm;
  const L = g.overlap + 2 * g.free;
  const size = L / 34;
  const parts = [];
  // z up: plate 2 from -t2 to 0, plate 1 from 0 to t1 (SVG y = -z)
  parts.push(rect(-g.free, 0, g.overlap, t2, STEEL_DARK, INK, size * 0.08));
  parts.push(rect(0, -t1, g.overlap + g.free, 0, STEEL, INK, size * 0.1));
  const head = 0.65 * d, nut = 0.8 * d, s = 1.6 * d, washer = Math.max(3, 0.15 * d);
  for (const x of g.xs) {
    parts.push(rect(x - d / 2, -t1 - washer - head, x + d / 2, t2 + washer + nut + 0.4 * d, BOLT, "none", 0, `opacity="0.85"`));
    parts.push(rect(x - s / 2, -t1 - washer - head, x + s / 2, -t1 - washer, "#6b7682", INK, size * 0.05));
    parts.push(rect(x - 1.1 * s / 2, -t1 - washer, x + 1.1 * s / 2, -t1, "#7d8894", INK, size * 0.05));
    parts.push(rect(x - 1.1 * s / 2, t2, x + 1.1 * s / 2, t2 + washer, "#7d8894", INK, size * 0.05));
    parts.push(rect(x - s / 2, t2 + washer, x + s / 2, t2 + washer + nut, "#6b7682", INK, size * 0.05));
  }
  parts.push(loadArrow(g.overlap + g.free + 0.5 * size, -t1 / 2, g.overlap + g.free + 5.5 * size, -t1 / 2, size, "F", "start", 0.4, 0.35));
  parts.push(loadArrow(-g.free - 0.5 * size, t2 / 2, -g.free - 5.5 * size, t2 / 2, size, "F", "end", -0.4, 0.35));
  const xDim = g.overlap + g.free + 8.5 * size;
  parts.push(dimV(-t1, 0, xDim, g.overlap + g.free, `t1 ${fmt(t1)}`, size * 0.7));
  parts.push(dimV(0, t2, xDim, g.overlap, `t2 ${fmt(t2)}`, size * 0.7));
  parts.push(textAt(g.overlap / 2, t2 + washer + nut + 0.4 * d + 1.6 * size, "single lap: one shear plane per bolt; the eccentricity of the lap (bending) is not checked", size * 0.7));
  const top = t1 + washer + head + 3 * size;
  const vb = [-g.free - 7.5 * size, -top, L + 22 * size, top + t2 + washer + nut + 0.4 * d + 2.6 * size, size];
  return svg(vb, `${title} — single lap`, `${title}: two plates with bolts in single shear`, parts.join("\n"));
}

/**
 * Elevation of the bolt group (x right, z down): plate, holes, bolt force
 * arrows of the elastic method (scaled), the loads at the centroid, the
 * critical bolt and the dimensions.
 */
export function boltGroupElevationSvg(input, result, title = "Elevation") {
  const r = result;
  const cols = input.num_cols, rows = input.num_rows, px = input.pitch_x_mm ?? 0, pz = input.pitch_z_mm ?? 0;
  const halfW = (cols - 1) * px / 2, halfH = (rows - 1) * pz / 2;
  const x0 = -halfW - input.edge_left_mm, x1 = halfW + input.edge_right_mm, z0 = -halfH - input.edge_top_mm, z1 = halfH + input.edge_bottom_mm;
  const W = x1 - x0, H = z1 - z0;
  const size = Math.max(W, H) / 26;
  const parts = [];
  parts.push(rect(x0, z0, x1, z1, STEEL, INK, size * 0.1));
  const maxForce = Math.max(...r.bolts.map(b => b.resultant), 1e-9);
  const arrowLength = 0.42 * Math.min(px > 0 ? px : W, pz > 0 ? pz : H, 0.6 * Math.max(W, H)) + 1.5 * size;
  for (const b of r.bolts) {
    const critical = b.id === r.critical.id;
    parts.push(hole(b.xMm, b.zMm, r.d0, size, critical ? `stroke="${CRITICAL}"` : ""));
    if (critical) parts.push(`<circle cx="${f1(b.xMm)}" cy="${f1(b.zMm)}" r="${f1(r.d0 / 2 + 0.7 * size)}" fill="none" stroke="${CRITICAL}" stroke-width="${f1(size * 0.14)}"/>`);
    if (b.resultant > 1e-9) {
      const k = arrowLength * b.resultant / maxForce / b.resultant;
      const ex = b.xMm + b.fx * k, ez = b.zMm + b.fz * k;
      parts.push(`<g><title>Bolt ${b.id}: F = ${b.resultant.toFixed(2)} kN (Fx ${b.fx.toFixed(2)}, Fz ${b.fz.toFixed(2)}), η = ${b.utilization.toFixed(2)}</title>${loadArrow(b.xMm, b.zMm, ex, ez, size * 0.7, "")}</g>`);
      parts.push(textAt(b.xMm + size * 0.6, b.zMm - r.d0 / 2 - size * 0.5, `${b.id}: ${b.resultant.toFixed(1)}`, size * 0.62, "start"));
    }
  }
  // loads at the centroid
  const V = Math.hypot(input.shear_force_x_kn ?? 0, input.shear_force_z_kn ?? 0);
  const T = input.torsion_moment_knm ?? 0;
  parts.push(`<circle cx="0" cy="0" r="${f1(size * 0.35)}" fill="${LOAD}"/>`);
  if (T !== 0) {
    const R = Math.max(1.6 * size, 0.18 * Math.min(W, H));
    const sweep = T > 0 ? 1 : 0;
    const a0 = -2.4, a1 = 0.9;
    const sx = R * Math.cos(T > 0 ? a0 : a1), sz = R * Math.sin(T > 0 ? a0 : a1), exx = R * Math.cos(T > 0 ? a1 : a0), ezz = R * Math.sin(T > 0 ? a1 : a0);
    parts.push(`<path d="M${f1(sx)},${f1(sz)} A${f1(R)},${f1(R)} 0 1 ${sweep} ${f1(exx)},${f1(ezz)}" fill="none" stroke="${LOAD}" stroke-width="${f1(size * 0.15)}"/>`);
    const ang = T > 0 ? a1 : a0;
    const tx = -Math.sin(ang) * (T > 0 ? 1 : -1), tz = Math.cos(ang) * (T > 0 ? 1 : -1);
    parts.push(arrowHead(exx, ezz, tx, tz, size * 0.9).replace(DIM, LOAD));
    parts.push(textAt(R * 0.75, -R * 0.95, `T ${fmt(T)} kNm`, size * 0.8, "start", `font-weight="700" fill="${LOAD}"`).replace(`fill="${DIM}" `, ""));
  }
  if (V > 0) {
    const ux = (input.shear_force_x_kn ?? 0) / V, uz = (input.shear_force_z_kn ?? 0) / V;
    const len = Math.max(3 * size, 0.25 * Math.min(W, H));
    parts.push(loadArrow(0, 0, ux * len, uz * len, size * 0.85, `V ${fmt(V)} kN`, "start", 0.5, 1.1));
  }
  // dimensions: x above, z on the right
  const xs = [x0, ...Array.from({ length: cols }, (_, j) => -halfW + j * px), x1];
  const yChain = z0 - 1.6 * size;
  for (let i = 0; i < xs.length - 1; i++) {
    const label = i === 0 ? `${fmt(input.edge_left_mm)}` : i === xs.length - 2 ? `${fmt(input.edge_right_mm)}` : `px ${fmt(px)}`;
    parts.push(dimH(xs[i], xs[i + 1], yChain, z0 - size * 0.3, label, size * 0.7));
  }
  const zs = [z0, ...Array.from({ length: rows }, (_, i) => -halfH + i * pz), z1];
  const xChain = x1 + 1.6 * size;
  for (let i = 0; i < zs.length - 1; i++) {
    const label = i === 0 ? `${fmt(input.edge_top_mm)}` : i === zs.length - 2 ? `${fmt(input.edge_bottom_mm)}` : `pz ${fmt(pz)}`;
    parts.push(dimV(zs[i], zs[i + 1], xChain, x1 + size * 0.3, label, size * 0.7));
  }
  parts.push(textAt(x0, z1 + 1.8 * size, `x →, z ↓; arrows: bolt forces of the elastic method (kN), critical bolt ${r.critical.id} circled`, size * 0.7, "start"));
  const vb = [x0 - 2 * size, z0 - 5 * size, W + 10 * size, H + 8 * size, size];
  return svg(vb, `${title} — ${rows} × ${cols} bolts M${fmt(input.bolt_diameter_mm)} ${r.input.boltClass}, t ${fmt(input.plate_thickness_mm)}`, `${title}: bolt group with loads and bolt forces`, parts.join("\n"));
}

/** Section of a T-joint with two fillet welds: throat a, leg z = a sqrt2, throat stresses. */
export function filletWeldSectionSvg(input, result, title = "Section") {
  const a = input.throat_thickness_a_mm, z = a * Math.SQRT2;
  const tp = Math.max(3 * z, 12), tw = Math.max(2 * z, 10), H = 10 * z, B = 12 * z;
  const size = B / 22;
  const parts = [];
  parts.push(rect(-B / 2, 0, B / 2, tp, STEEL, INK, size * 0.08));
  parts.push(rect(-tw / 2, -H, tw / 2, 0, STEEL, INK, size * 0.08));
  for (const s of [-1, 1]) {
    parts.push(`<path d="M${f1(s * tw / 2)},0 L${f1(s * (tw / 2 + z))},0 L${f1(s * tw / 2)},${f1(-z)} Z" fill="${WELD}"/>`);
  }
  // throat on the right weld: from the root (tw/2, 0) normal to the face
  const rx = tw / 2, mx = tw / 2 + z / 2, mz = -z / 2;
  parts.push(`<line x1="${f1(rx)}" y1="0" x2="${f1(mx)}" y2="${f1(mz)}" stroke="#ffffff" stroke-width="${f1(size * 0.12)}"/>`);
  parts.push(textAt(mx + 1.4 * size, mz - 1.4 * size, `a ${fmt(a)}`, size * 0.9, "start", `font-weight="700"`));
  parts.push(dimH(tw / 2, tw / 2 + z, tp + 2 * size, tp + 0.3 * size, `z ${fmt(z)}`, size * 0.7));
  if (input.verification_method === "directional") {
    parts.push(textAt(-B / 2 + size, -H + 2 * size, `σ⊥ ${fmt(input.sigma_perp_mpa)}, τ⊥ ${fmt(input.tau_perp_mpa)}, τ∥ ${fmt(input.tau_parallel_mpa)} MPa on the throat`, size * 0.7, "start"));
  } else {
    parts.push(textAt(-B / 2 + size, -H + 2 * size, `F<tspan dy="0.3em" font-size="70%">w,Ed</tspan><tspan dy="-0.3em"> ${fmt(input.force_per_unit_length_fw_ed_n_per_mm)} N/mm per weld</tspan>`, size * 0.75, "start"));
  }
  const vb = [-B / 2 - size, -H - 1.5 * size, B + 2 * size, H + tp + 5 * size, size];
  return svg(vb, `${title} — fillet welds a ${fmt(a)} (${input.steel_grade})`, `${title}: T-joint with fillet welds, throat a and leg z`, parts.join("\n"));
}

/** Plan of the weld length on the attached plate. */
export function filletWeldPlanSvg(input, result, title = "Plan") {
  const L = input.effective_length_leff_mm;
  if (!(L > 0)) return "";
  const a = input.throat_thickness_a_mm, z = a * Math.SQRT2;
  const size = L / 28;
  const w = Math.max(4 * z, L / 6);
  const parts = [];
  parts.push(rect(0, 0, L, w, STEEL, INK, size * 0.08));
  parts.push(rect(0, w, L, w + Math.max(z, size * 0.6), WELD, "none", 0));
  parts.push(dimH(0, L, w + Math.max(z, size * 0.6) + 2.2 * size, w + Math.max(z, size * 0.6) + 0.3 * size, `Leff ${fmt(L)}`, size * 0.8));
  if (result.betaLw1 !== null) parts.push(textAt(L / 2, w / 2 + size * 0.3, `L > 150 a: β_Lw,1 = ${result.betaLw1.toFixed(3)} in a lap joint`, size * 0.75));
  const vb = [-size, -2.5 * size, L + 2 * size, w + z + 7 * size, size];
  return svg(vb, `${title} — effective length`, `${title}: weld length`, parts.join("\n"));
}

/** Plan of the plate in tension with the holes of the critical section. */
export function plateTensionPlanSvg(input, result, title = "Plan") {
  const b = input.width_mm, L = Math.max(2.2 * b, 200);
  const size = Math.max(L, b) / 30;
  const n = input.n_holes ?? 0, d0 = input.hole_diameter_mm ?? 0;
  const parts = [];
  parts.push(rect(0, 0, L, b, STEEL, INK, size * 0.1));
  parts.push(breakLine(0, 0, b, size));
  parts.push(breakLine(L, 0, b, size));
  if (n > 0 && d0 > 0) {
    const xs = L / 2;
    for (let i = 0; i < n; i++) parts.push(hole(xs, b * (i + 0.5) / n, d0, size));
    parts.push(`<line x1="${f1(xs)}" y1="${f1(-1.2 * size)}" x2="${f1(xs)}" y2="${f1(b + 1.2 * size)}" stroke="${LOAD}" stroke-width="${f1(size * 0.08)}" stroke-dasharray="${f1(size * 0.6)} ${f1(size * 0.3)}"/>`);
    parts.push(textAt(xs + size * 0.6, -1.4 * size, `critical section: ${n} × d0 ${fmt(d0)}`, size * 0.75, "start"));
  }
  parts.push(loadArrow(L + 0.5 * size, b / 2, L + 6 * size, b / 2, size, `N<tspan dy="0.3em" font-size="70%">Ed</tspan><tspan dy="-0.3em"> ${fmt(input.n_ed_kn)} kN</tspan>`, "start", -5.5, -1.3));
  parts.push(loadArrow(-0.5 * size, b / 2, -6 * size, b / 2, size, "", "end"));
  parts.push(dimV(0, b, L + 9 * size, L + 0.3 * size, `b ${fmt(b)}`, size * 0.8));
  parts.push(textAt(L / 4, b / 2 + size * 0.3, `t ${fmt(input.thickness_mm)} · ${input.steel_grade}`, size * 0.85));
  const vb = [-7.5 * size, -3.5 * size, L + 22 * size, b + 6 * size, size];
  return svg(vb, `${title} — plate ${fmt(b)} × ${fmt(input.thickness_mm)}`, `${title}: plate in tension with the holes of the critical section`, parts.join("\n"));
}
