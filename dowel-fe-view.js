// HTML and SVG (strings) for the FE verification of a dowel-type fastener:
// summary table FE against Johansen, the deformed fastener at collapse with
// hinges and yielded embedment, and the force-slip curves. No DOM access.
import { escapeHtml, kN } from "./check-view.js";

const INK = "#273543";
const WOOD = "#ead7b0";
const WOOD_MOVING = "#dcc394";
const STEEL = "#7d8a97";
const FASTENER = "#1265a8";
const HINGE = "#b03a2e";
const YIELD_POS = "#c0392b";
const YIELD_NEG = "#2e86c1";
const f1 = value => Number(value.toFixed(1)).toString();

/** Linear interpolation of a curve at a slip; beyond the end the plateau value if given. */
function loadAt(curve, slip, plateau) {
  if (slip <= 0) return 0;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1], b = curve[i];
    if (b.slip >= slip) return a.load + (b.load - a.load) * (slip - a.slip) / (b.slip - a.slip);
  }
  return plateau ?? curve[curve.length - 1].load;
}

/** Curve of a run or of the thin/thick interpolation, sampled at fixed slips (N per shear plane). */
function sampledCurve(verification, pick, maxSlip, samples = 160) {
  const { runs, plateFactor } = verification;
  const at = (run, s) => {
    const r = pick(run);
    return loadAt(r.curve, s, r.collapsed ? r.collapseLoad : undefined);
  };
  const points = [];
  for (let i = 0; i <= samples; i++) {
    const s = maxSlip * (i / samples) ** 2; // denser near zero, where the rigid-plastic run rises
    const load = runs.length === 2 ? at(runs[0], s) + plateFactor * (at(runs[1], s) - at(runs[0], s)) : at(runs[0], s);
    points.push({ slip: s, load });
  }
  return points;
}

function niceAxis(maximum) {
  const raw = Math.max(maximum, 1e-9) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(value => value >= raw);
  return { end: step * Math.ceil(maximum * 1.05 / step), step };
}

const MODE_TEXT = {
  "(8.6 a)": "embedment in member 1", "(8.6 b)": "embedment in member 2", "(8.6 c)": "fastener rotates in both members",
  "(8.6 d)": "one hinge in member 2", "(8.6 e)": "one hinge in member 1", "(8.6 f)": "two hinges",
  "(8.7 g)": "embedment in the outer members", "(8.7 h)": "embedment in the inner member", "(8.7 j)": "one hinge per shear plane", "(8.7 k)": "two hinges per shear plane",
  "(8.9 a)": "fastener rotates in the timber", "(8.9 b)": "one hinge in the timber", "(8.10 c)": "hinge at the plate, rotation in the timber",
  "(8.10 d)": "hinges at the plate and in the timber", "(8.10 e)": "embedment over the timber thickness",
  "(8.11 f)": "embedment over the timber thickness", "(8.11 g)": "hinge at the plate, rotation in the timber", "(8.11 h)": "hinges at the plate and in the timber",
  "(8.12 j)": "embedment of the timber", "(8.12 k)": "one hinge per shear plane", "(8.13 l)": "embedment of the timber", "(8.13 m)": "hinges at the plates and in the timber"
};
export const modeText = key => key ? `${key} ${MODE_TEXT[key] ?? ""}`.trim() : "no EN mode recognised";

/**
 * Summary table. en: { Fk per shear plane with the rope effect (the page check), ropeUsed } from the page.
 */
export function dowelFeSummaryHtml(v, en) {
  const ratio = (a, b) => (b > 0 ? (a / b).toFixed(3) : "—");
  const plate = v.runs.length === 2
    ? `thin ${kN(v.runs[0].rigid.collapseLoad)} / thick ${kN(v.runs[1].rigid.collapseLoad)} kN, interpolated with k = ${v.plateFactor.toFixed(2)} (EN 8.2.3(1))`
    : v.runs[0].plate ? `${v.runs[0].plate} plate (${v.runs[0].plate === "thin" ? "pinned" : "clamped"})` : "";
  const run = v.runs[v.runs.length - 1];
  const modes = v.runs.map(r => `${r.plate ? `${r.plate}: ` : ""}FE ${modeText(r.rigid.mode)} · EN ${modeText(r.johansen.governingEn.key)}`).join("<br>");
  const elastic = v.runs.map(r => r.elastic);
  const reached = elastic.every(r => r.collapsed);
  const why = v.runs.map(r => {
    const fe = r.johansen.governingMechanical, en = r.johansen.governingEn;
    const prefix = r.plate ? `${r.plate}: ` : "";
    if (fe.key === en.key) return `${prefix}EN factor ${fe.factor.toFixed(fe.factor === 1 ? 0 : 3)} on ${fe.key}: FE / EN = 1 / ${fe.factor.toFixed(fe.factor === 1 ? 0 : 3)} = ${(1 / fe.factor).toFixed(3)} expected`;
    return `${prefix}mechanically ${fe.key} governs (${kN(fe.mechanical)} kN); EN multiplies it by ${fe.factor.toFixed(2)}, so ${en.key} (${kN(en.en)} kN) governs in EN`;
  }).join("<br>");
  const reachedAt = Math.max(...elastic.map(r => r.slipAtCollapse ?? r.slipAtEnd));
  const fine = v.runs[0].foundation;
  const rows = [
    ["key", "FE collapse load per shear plane (rigid-plastic, γ = 1)", `${kN(v.feCollapse)} kN`],
    ["", "Johansen, mechanical (EN equations without rope effect and without the factors 1.05 / 1.15)", `${kN(v.johansenMechanical)} kN`],
    ["key", "FE / Johansen", ratio(v.feCollapse, v.johansenMechanical)],
    ["", "EN 1995-1-1 without rope effect (γ = 1)", `${kN(v.johansenEn)} kN`],
    ["key", "FE / EN without rope effect", ratio(v.feCollapse, v.johansenEn)],
    ["", "Why FE / EN differs from 1", why],
    ...(en && en.ropeUsed > 0 ? [["", "EN with the rope effect, as in the check above (8.2.2(2))", `${kN(en.Fk)} kN`]] : []),
    ["", "Failure mode", modes],
    ...(plate ? [["", "Steel plate", plate]] : []),
    ["", `Finite stiffness (K<sub>ser</sub>-calibrated, k = ${fine.k1.toFixed(0)}${fine.k2 !== fine.k1 && v.runs[0].rigid.configuration.startsWith("timber") ? ` / ${fine.k2.toFixed(0)}` : ""} N/mm²)`,
      reached ? `collapse load ${kN(v.elasticAtEnd)} kN (${(100 * v.elasticAtEnd / v.feCollapse).toFixed(1)} % of the rigid-plastic value); plateau detected at a slip of ${reachedAt.toFixed(1)} mm`
        : `${kN(v.elasticAtEnd)} kN at ${v.elasticSlip.toFixed(0)} mm slip (${(100 * v.elasticAtEnd / v.feCollapse).toFixed(1)} % of the collapse load, still rising)`],
    ["", "Model", `${run.rigid.stats.dofs} DOF, ${run.rigid.stats.elementsPerMember} elements in the thickest member; ${v.runs.length * 2} runs in ${(v.timingMs / 1000).toFixed(2)} s in this browser`]
  ];
  return `<div class="table-wrap"><table class="results-table"><tbody>${rows.map(([cls, label, value]) => `<tr${cls ? ` class="${cls}"` : ""}><th>${label}</th><td class="num">${value}</td></tr>`).join("")}</tbody></table></div>`;
}

/** Deformed fastener of one rigid-plastic run (the collapse mechanism), members side by side along the fastener axis. */
export function dowelShapeSvg(result, d, title) {
  const width = 640, height = 280, left = 20, right = 20, mid = 150;
  const zs = result.shape.z;
  const z0 = Math.min(...zs, ...result.plates.map(p => p.z)), z1 = Math.max(...zs, ...result.plates.map(p => p.z));
  const padZ = Math.max(0.06 * (z1 - z0), 1.2 * d);
  const sx = (width - left - right) / (z1 - z0 + 2 * padZ);
  const X = z => left + (z - z0 + padZ) * sx;
  // lateral scale: the largest displacement (fastener or slip) drawn as 45 px
  const vMax = Math.max(1e-9, result.slipAtEnd, ...result.shape.v.map(Math.abs));
  const sv = 45 / vMax;
  const shift = member => (result.members[member]?.moving ? result.slipAtEnd * sv : 0);
  const Y = v => mid - v * sv;
  const parts = [];
  const memberHeight = 120;
  // the moving member (or the plates) is drawn shifted by the slip, in the scale of the fastener displacements
  result.members.forEach(member => {
    const y0 = mid - memberHeight / 2 - (member.moving ? result.slipAtEnd * sv : 0);
    parts.push(`<rect x="${f1(X(member.z0))}" y="${f1(y0)}" width="${f1(X(member.z1) - X(member.z0))}" height="${memberHeight}" fill="${member.moving ? WOOD_MOVING : WOOD}" stroke="${INK}" stroke-width="1"/>`);
    parts.push(`<text x="${f1((X(member.z0) + X(member.z1)) / 2)}" y="${f1(y0 + 14)}" text-anchor="middle" font-size="11" fill="${INK}">${escapeHtml(member.name)}${member.moving ? " (moves)" : ""}</text>`);
  });
  for (const plate of result.plates) {
    const w = Math.max(6, 0.5 * d * sx);
    parts.push(`<rect x="${f1(X(plate.z) - w / 2)}" y="${f1(mid - memberHeight / 2 - result.slipAtEnd * sv)}" width="${f1(w)}" height="${memberHeight}" fill="${STEEL}" stroke="${INK}" stroke-width="1" opacity="0.9"/>`);
    parts.push(`<text x="${f1(X(plate.z))}" y="${f1(mid + memberHeight / 2 + 14 - result.slipAtEnd * sv)}" text-anchor="middle" font-size="11" fill="${INK}">${plate.clamped ? "thick plate" : "plate"}</text>`);
  }
  // yielded embedment: coloured ticks along the fastener (red: pushed one way, blue: the other)
  const e = result.embedment;
  for (let i = 0; i < e.z.length; i++) {
    const ratio = e.ratio[i];
    if (Math.abs(ratio) < 0.999) continue;
    const x = X(e.z[i]), yTick = mid + memberHeight / 2 - 14 - shift(e.member[i]);
    parts.push(`<line x1="${f1(x)}" y1="${f1(yTick)}" x2="${f1(x)}" y2="${f1(yTick + 8)}" stroke="${ratio > 0 ? YIELD_POS : YIELD_NEG}" stroke-width="2"/>`);
  }
  const path = zs.map((z, i) => `${i ? "L" : "M"}${f1(X(z))},${f1(Y(result.shape.v[i]))}`).join(" ");
  parts.push(`<path d="${path}" fill="none" stroke="${FASTENER}" stroke-width="${Math.max(3, Math.min(9, d * sx * 0.6)).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round"/>`);
  for (const hinge of result.hinges) {
    const i = zs.reduce((best, z, k) => Math.abs(z - hinge.z) < Math.abs(zs[best] - hinge.z) ? k : best, 0);
    parts.push(`<circle cx="${f1(X(hinge.z))}" cy="${f1(Y(result.shape.v[i]))}" r="6" fill="#fff" stroke="${HINGE}" stroke-width="2.5"/>`);
  }
  parts.push(`<text x="${left}" y="16" font-size="12" font-weight="700" fill="${INK}">${escapeHtml(title)}</text>`);
  parts.push(`<text x="${width - right}" y="16" font-size="11" text-anchor="end" fill="${INK}">${result.hinges.length} plastic hinge${result.hinges.length === 1 ? "" : "s"} (○) · displacements magnified</text>`);
  return `<svg class="dowel-shape" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}: deformed fastener at collapse with plastic hinges" font-family="Arial, Helvetica, sans-serif">${parts.join("")}</svg>`;
}

export function dowelShapeLegendHtml() {
  return `<p class="legend"><span class="swatch" style="background:${FASTENER}"></span>fastener <span class="swatch" style="background:#fff;border-color:${HINGE}"></span>plastic hinge <span class="swatch" style="background:${YIELD_POS}"></span><span class="swatch" style="background:${YIELD_NEG}"></span>embedment at f<sub>h</sub> d (both directions)</p>`;
}

/** Force-slip curves per shear plane: rigid-plastic, K_ser-calibrated, and the reference lines. */
export function dowelCurveSvg(v, en) {
  const width = 480, height = 300, left = 52, right = 14, top = 34, bottom = 46;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maxSlip = v.elasticSlip;
  const rigid = sampledCurve(v, run => run.rigid, maxSlip);
  const elastic = sampledCurve(v, run => run.elastic, maxSlip);
  const yMax = Math.max(v.johansenEn, v.feCollapse, en?.Fk ?? 0, ...elastic.map(p => p.load)) / 1000;
  const xAxis = niceAxis(maxSlip), yAxis = niceAxis(yMax);
  const x = s => left + s / xAxis.end * plotWidth;
  const y = f => top + plotHeight - f / yAxis.end * plotHeight;
  const path = points => points.map((p, i) => `${i ? "L" : "M"}${x(p.slip).toFixed(1)},${y(p.load / 1000).toFixed(1)}`).join(" ");
  const ticks = axis => Array.from({ length: Math.round(axis.end / axis.step) + 1 }, (_, i) => i * axis.step);
  const fmt = value => Number(value.toPrecision(3)).toString();
  const grid = ticks(xAxis).map(t => `<line class="grid" x1="${x(t).toFixed(1)}" y1="${top}" x2="${x(t).toFixed(1)}" y2="${top + plotHeight}"/><text x="${x(t).toFixed(1)}" y="${top + plotHeight + 18}" text-anchor="middle">${fmt(t)}</text>`).join("")
    + ticks(yAxis).map(t => `<line class="grid" x1="${left}" y1="${y(t).toFixed(1)}" x2="${left + plotWidth}" y2="${y(t).toFixed(1)}"/><text x="${left - 7}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${fmt(t)}</text>`).join("");
  const hline = (value, cls) => `<line class="${cls}" x1="${left}" y1="${y(value / 1000).toFixed(1)}" x2="${left + plotWidth}" y2="${y(value / 1000).toFixed(1)}"/>`;
  return `<svg class="curve" viewBox="0 0 ${width} ${height}" role="img" aria-label="Force per shear plane against slip, kN and mm">
    <g>${grid}</g>
    <line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}"/><line class="axis" x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}"/>
    ${hline(v.johansenEn, "en-line")}${en && en.ropeUsed > 0 ? hline(en.Fk, "rope-line") : ""}
    <path class="rigid-line" d="${path(rigid)}"/><path class="fe-line" d="${path(elastic)}"/>
    <text class="axis-label" x="${left + plotWidth / 2}" y="${height - 6}" text-anchor="middle">Slip (mm)</text>
    <text class="axis-label" transform="translate(14 ${top + plotHeight / 2}) rotate(-90)" text-anchor="middle">Force per shear plane (kN)</text>
    <g class="legend"><line class="rigid-line" x1="${left}" y1="12" x2="${left + 22}" y2="12"/><text x="${left + 27}" y="16">FE rigid-plastic</text>
      <line class="fe-line" x1="${left + 128}" y1="12" x2="${left + 150}" y2="12"/><text x="${left + 155}" y="16">FE K<tspan baseline-shift="sub" font-size="9">ser</tspan></text>
      <line class="en-line" x1="${left + 222}" y1="12" x2="${left + 244}" y2="12"/><text x="${left + 249}" y="16">EN w/o rope</text>
      ${en && en.ropeUsed > 0 ? `<line class="rope-line" x1="${left + 330}" y1="12" x2="${left + 352}" y2="12"/><text x="${left + 357}" y="16">EN + rope</text>` : ""}</g>
  </svg>`;
}

export function dowelFeNotesHtml() {
  const notes = [
    "The fastener is a line of beam elements with plastic hinges at M_y,Rk (the EN value); the timber holds it with embedment springs that yield at f_h,k d per unit length (f_h at the angle of the force). Steel plates: thin plates (t ≤ 0.5 d) pin the fastener, thick plates (t ≥ d) clamp it; in between both are run and interpolated as EN 1995-1-1 8.2.3(1) does.",
    "Rigid-plastic run: very stiff springs and fastener; by the limit theorems its collapse load is the Johansen value of the governing mechanism. Finite-stiffness run: springs calibrated so that the initial stiffness per shear plane equals K_ser (EN 1995-1-1 Table 7.1, ×2 for steel plates, 7.1(3)); same collapse load, reached after some slip.",
    "The rope effect (EN 1995-1-1 8.2.2(2)) needs axial force and friction in the fastener, which the model does not have: EN adds it on top of the Johansen part. EN also multiplies the modes with hinges by 1.05 (one hinge) or 1.15 (two hinges) and uses 0.4 instead of √2 − 1 in (8.9 a); these calibration factors are not mechanical, so FE / EN differs from 1 by them where such a mode governs.",
    "Displacement control from event to event (a spring or hinge yielding); equilibrium checked after every increment against 0.001 N (plus round-off) and 0.001 N × d for moments, Newton corrections with a 1e-6 mm increment tolerance, at most 50 iterations; an increment that fails stops the analysis with an error instead of a result.",
    "Characteristic values at γ = 1; the design check above stays the EN check. Feasibility prototype — not for design use."
  ];
  return `<ul class="assumptions">${notes.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
}
