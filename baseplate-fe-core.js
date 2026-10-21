// Column base FE verification for the browser page: validation, analysis,
// 3D view, contact-pressure map and report, without DOM access, so the module
// runs in a Web Worker and in Node tests alike.
import {
  analyseBasePlateFe,
  BASE_PLATE_FIELDS,
  BASEPLATE_FE_MAX_DOF,
  BASEPLATE_FE_VERSION,
  estimateBasePlateFeDof,
  fieldApplies,
  makeCurveSvg,
  normaliseBasePlateFeOptions,
  normaliseBasePlateInput,
  TOOL_NAME
} from "./lib/index.js";
import { autoScale, fieldSvg, strainLegendHtml } from "./view3d.js";

export class InputError extends Error {
  constructor(errors) {
    super(errors.join("; "));
    this.name = "InputError";
    this.errors = errors;
  }
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
const kN = valueN => (Number.isFinite(valueN) ? (valueN / 1000).toFixed(1) : "—");
const fixed = (value, digits) => (Number.isFinite(value) ? value.toFixed(digits) : "—");
const f1 = value => Number(value.toFixed(2)).toString();

/**
 * Validates the column-base input and the FE settings; checks the model size.
 * Returns { input, options } or throws InputError.
 */
export function validateBasePlateFe(rawInput, rawOptions = {}, maxDof = BASEPLATE_FE_MAX_DOF) {
  const input = normaliseBasePlateInput(rawInput);
  const options = normaliseBasePlateFeOptions(rawOptions);
  const errors = [...(input.ok ? [] : input.errors), ...(options.ok ? [] : options.errors)];
  if (errors.length) throw new InputError(errors);
  const dof = estimateBasePlateFeDof(input.input, options.options);
  if (dof > maxDof) throw new InputError([`meshSize gives ${dof.toLocaleString("en")} degrees of freedom, above the ${maxDof.toLocaleString("en")} limit of this page: use a coarser mesh`]);
  return { input: input.input, options: options.options, dof };
}

/** Colour of a contact pressure p / f_jd: light grey without contact, light to dark blue up to f_jd. */
export function pressureColour(ratio) {
  if (!(ratio > 1e-6)) return "rgb(244,246,248)";
  const t = Math.min(1, ratio);
  const a = [219, 234, 254], b = [37, 99, 235], c = [30, 41, 120];
  const mix = (p, q, s) => p.map((v, i) => Math.round(v + (q[i] - v) * s));
  return `rgb(${(t < 0.7 ? mix(a, b, t / 0.7) : mix(b, c, (t - 0.7) / 0.3)).join(",")})`;
}

/** Contact pressure under the plate (compression), with the EN effective area outlined. */
export function bearingMapSvg(bearing, input) {
  const { hp, bp, fjd } = bearing;
  const pad = 0.08 * Math.max(hp, bp);
  const width = hp + 2 * pad, height = bp + 2 * pad;
  const X = x => x + hp / 2 + pad, Y = y => bp / 2 - y + pad;
  const colour = pressureColour;
  const parts = [];
  for (let k = 0; k < bearing.cells.length; k += 5) {
    const [x, y, dx, dy, p] = bearing.cells.slice(k, k + 5);
    if (!(dx > 0 && dy > 0)) continue;
    parts.push(`<rect x="${f1(X(x - dx / 2))}" y="${f1(Y(y + dy / 2))}" width="${f1(dx)}" height="${f1(dy)}" fill="${colour(p / fjd)}"/>`);
  }
  parts.push(`<rect x="${f1(X(-hp / 2))}" y="${f1(Y(bp / 2))}" width="${f1(hp)}" height="${f1(bp)}" fill="none" stroke="#273543" stroke-width="1.5"/>`);
  for (const [x0, x1, y0, y1] of bearing.rects) parts.push(`<rect x="${f1(X(x0))}" y="${f1(Y(y1))}" width="${f1(x1 - x0)}" height="${f1(y1 - y0)}" fill="none" stroke="#bd4a34" stroke-width="1.6" stroke-dasharray="6 4"/>`);
  if (input) {
    if (input.columnType === "I") {
      const { h, b, tf, tw } = input;
      const pts = [[-h / 2, b / 2], [-h / 2 + tf, b / 2], [-h / 2 + tf, tw / 2], [h / 2 - tf, tw / 2], [h / 2 - tf, b / 2], [h / 2, b / 2], [h / 2, -b / 2], [h / 2 - tf, -b / 2], [h / 2 - tf, -tw / 2], [-h / 2 + tf, -tw / 2], [-h / 2 + tf, -b / 2], [-h / 2, -b / 2]];
      parts.push(`<polygon points="${pts.map(([x, y]) => `${f1(X(x))},${f1(Y(y))}`).join(" ")}" fill="none" stroke="#111827" stroke-width="1.2"/>`);
    } else {
      const { h, b, t } = input;
      parts.push(`<rect x="${f1(X(-h / 2))}" y="${f1(Y(b / 2))}" width="${f1(h)}" height="${f1(b)}" fill="none" stroke="#111827" stroke-width="1.2"/><rect x="${f1(X(-h / 2 + t))}" y="${f1(Y(b / 2 - t))}" width="${f1(h - 2 * t)}" height="${f1(b - 2 * t)}" fill="none" stroke="#111827" stroke-width="1.2"/>`);
    }
  }
  return `<svg class="drawing bearing-map" viewBox="0 0 ${f1(width)} ${f1(height)}" role="img" aria-label="Contact pressure under the base plate; dashed: EN effective area" font-family="Arial, Helvetica, sans-serif">
${parts.join("\n")}
</svg>`;
}

/** Legend of the contact-pressure map (HTML). */
export function bearingLegendHtml() {
  const swatch = (ratio, label) => `<span class="swatch" style="background:${pressureColour(ratio)}"></span>${label}`;
  return `<div class="legend">${swatch(0, "no contact")} ${swatch(0.25, "0.25")} ${swatch(0.5, "0.5")} ${swatch(0.75, "0.75")} ${swatch(1, "1.0")} × f<sub>jd</sub> <span class="swatch" style="background:none;border:0;border-top:2px dashed #bd4a34;height:0"></span>EN effective area A<sub>eff</sub>; solid: column outline</div>`;
}

export const REPORT_STYLE = `<style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#18212b;font:14px/1.45 Arial,Helvetica,sans-serif}body{max-width:900px;margin:0 auto;padding:18px}h1{font-size:25px;margin:0 0 8px}h2{font-size:18px;margin:26px 0 9px;border-bottom:1px solid #aab4bf;padding-bottom:5px}h3{font-size:15px;margin:14px 0 6px}p{margin:7px 0}.status{display:inline-block;border:1px solid #9b4d00;color:#713800;background:#fff1df;font-weight:700;padding:6px 9px;margin:4px 0 12px}.table-wrap{max-width:100%;overflow-x:auto}table{border-collapse:collapse;width:100%;margin:7px 0 14px}th,td{border:1px solid #c9d0d8;padding:5px 7px;text-align:left;vertical-align:top}thead th{background:#edf1f5}td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}tr.key th,tr.key td{font-weight:700;background:#edf3f9}.note{color:#46515d}.warning{color:#8a4b00}.view3d,.drawing{display:block;width:100%;height:auto;max-height:520px}.curve{display:block;width:100%;max-width:640px;height:auto;margin:8px 0}.curve text{font:12px Arial,Helvetica,sans-serif;fill:#263342}.curve .axis{stroke:#273543;stroke-width:1.4}.curve .tick{stroke:#273543;stroke-width:1}.curve .grid{stroke:#dce2e8;stroke-width:1}.curve .fe-line{fill:none;stroke:#1265a8;stroke-width:3}.curve .en-line{stroke:#bd4a34;stroke-width:2;stroke-dasharray:7 5}.curve .fe-marker{fill:#1265a8;stroke:#fff;stroke-width:2}.curve .axis-label{font-weight:700}.legend{font-size:12px;color:#46515d}.swatch{display:inline-block;width:14px;height:10px;margin:0 3px 0 8px;border:1px solid #8a97a5;vertical-align:middle}.audit{overflow-wrap:anywhere;font-family:monospace;font-size:12px}ul{padding-left:20px}li{margin:4px 0}@media print{body{max-width:none;padding:0}h2{break-after:avoid}table,svg{break-inside:avoid}}
</style>`;

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function rows(items) {
  return items.map(([label, value, unit, key]) => `<tr${key ? " class=\"key\"" : ""}><th>${label}</th><td class="num">${value}</td><td>${escapeHtml(unit ?? "")}</td></tr>`).join("");
}

/** Summary rows shared by the page and the report. */
export function summaryRows(result) {
  const uplift = result.loadCase === "uplift";
  const t = result.en.tension;
  const items = [
    ["FE resistance (γ = 1)", kN(result.fe.resistance), "kN", true],
    [`EN component model (γ = 1)${uplift ? `, ${escapeHtml(result.en.mode)}${t.prying ? "" : " (no prying: L<sub>b</sub> &gt; L<sub>b</sub>*)"}` : ", N<sub>c,Rk</sub> = A<sub>eff</sub> f<sub>jd</sub>"}`, kN(result.en.resistance), "kN"],
    ["FE / EN", fixed(result.ratio, 3), "", true],
    ["FE failure mode", escapeHtml(result.fe.mode), ""],
    ...(result.fe.event === "strain" ? [[`Peak plastic strain at (x, y) of the quarter${result.fe.peakStrain.atZoneCorner ? ", corner of the stiff zone" : ""}`, `${fixed(result.fe.peakStrain.x, 0)}, ${fixed(result.fe.peakStrain.y, 0)}`, "mm"]] : []),
    ["Displacement of the column at the event", fixed(result.fe.failureDisplacement, 2), "mm"]
  ];
  if (uplift) {
    if (!t.prying) items.splice(2, 0, [`For reference: EN Table 6.2 with prying, ${escapeHtml(result.en.withPrying.mode)}`, kN(result.en.withPrying.resistance), "kN"]);
    items.push(["Anchor force, each of 4 (FE / capacity 0.9 f<sub>ub</sub> A<sub>s</sub>)", `${kN(result.anchorForce)} / ${kN(result.anchorCapacity)}`, "kN"]);
    items.push([`EN anchor force at the EN resistance${t.prying ? " (upper bound with prying)" : ""}`, kN(result.en.anchorForce), "kN"]);
    items.push(["Prying force (contact under the plate, total)", kN(result.contactForce), "kN"]);
  } else if (result.bearing) {
    const b = result.bearing;
    items.push([`Contact pressure at ${b.at === "N_c,Rk" ? "N = N<sub>c,Rk</sub> (EN)" : "the last step"}: share of the force inside A<sub>eff</sub>`, fixed(100 * b.shareInsideAeff, 1), "%"]);
    items.push(["Peak contact pressure / f<sub>jd</sub>", `${fixed(b.peakPressure, 1)} / ${fixed(b.fjd, 1)}`, "MPa"]);
    items.push(["Contact area / EN A<sub>eff</sub>", `${fixed(b.contactArea / 100, 0)} / ${fixed(b.Aeff / 100, 0)}`, "cm²"]);
  }
  items.push(["Maximum plastic strain: plate / stiff zone / column", `${fixed(100 * result.strainByKind.plate, 2)} / ${fixed(100 * result.strainByKind.stiff, 2)} / ${fixed(100 * result.strainByKind.wall, 2)}`, "%"]);
  items.push([`Equilibrium gate (|column − springs| ≤ ${fixed(result.equilibrium.tolerance, 0)} N)`, `${result.equilibrium.pass ? "pass" : "FAIL"}, ${fixed(result.equilibrium.error, 3)} N`, ""]);
  items.push(["Model size; load steps", `${result.dofCount.toLocaleString("en")} DOF; ${result.steps}`, ""]);
  items.push(["Analysis time", fixed(result.timingMs / 1000, 1), "s"]);
  return items;
}

/** Two columns (the value cell carries the unit): fits the narrow result column of the page. */
export function summaryTableHtml(result) {
  const body = summaryRows(result).map(([label, value, unit, key]) => `<tr${key ? " class=\"key\"" : ""}><th>${label}</th><td class="num">${value}${unit ? ` ${escapeHtml(unit)}` : ""}</td></tr>`).join("");
  return `<div class="table-wrap"><table class="results-table"><tbody>${body}</tbody></table></div>`;
}

function inputRowsHtml(input) {
  const selects = Object.fromEntries(BASE_PLATE_FIELDS.filter(f => f.kind === "select" || f.kind === "checkbox").map(f => [f.name, input[f.name]]));
  return BASE_PLATE_FIELDS.filter(field => fieldApplies(field, selects) && input[field.name] !== undefined)
    .map(field => `<tr><th>${field.label}</th><td class="num">${escapeHtml(input[field.name])}</td><td>${escapeHtml(field.unit)}</td></tr>`).join("");
}

function enSectionHtml(result) {
  const t = result.en.tension, c = result.en.compression;
  if (result.loadCase === "uplift") {
    return `<p>Base plate in bending under tension, EN 1993-1-8 6.2.6.11 with 6.2.6.5 (Table 6.6, extension row: one T-stub per anchor row of two anchors) and Table 6.2; anchors 0.9 f<sub>ub</sub> A<sub>s</sub>; γ<sub>M0</sub> = γ<sub>M2</sub> = 1.</p>
<div class="table-wrap"><table><tbody>${rows([
      ["m<sub>x</sub>; e<sub>x</sub>; e; n", `${fixed(t.mx, 1)}; ${fixed(t.ex, 1)}; ${fixed(t.e, 1)}; ${fixed(t.n, 1)}`, "mm"],
      ["l<sub>eff,1</sub>; l<sub>eff,2</sub>", `${fixed(t.leff1, 1)}; ${fixed(t.leff2, 1)}`, "mm"],
      ["L<sub>b</sub>; L<sub>b</sub>*", `${fixed(t.Lb, 0)}; ${fixed(t.LbStar, 0)}`, "mm"],
      [t.prying ? "F<sub>T,1</sub>; F<sub>T,2</sub>; F<sub>T,3</sub> per row (prying)" : "F<sub>T,1-2</sub>; F<sub>T,3</sub> per row (no prying)", t.prying ? `${kN(t.FT1)}; ${kN(t.FT2)}; ${kN(t.FT3)}` : `${kN(t.FT12)}; ${kN(t.FT3)}`, "kN"],
      [`N<sub>t,Rk</sub> = 2 F<sub>T</sub> (${escapeHtml(t.mode)})`, kN(t.NtRd), "kN", true],
      ["For reference, Table 6.2 with prying (both rows): F<sub>T,1</sub>; F<sub>T,2</sub>; F<sub>T,3</sub>", `${kN(result.en.withPrying.FT1)}; ${kN(result.en.withPrying.FT2)}; ${kN(result.en.withPrying.FT3)}`, "kN"]
    ])}</tbody></table></div>`;
  }
  return `<p>Concrete and grout in compression, EN 1993-1-8 6.2.5 and 6.2.8.2 with γ<sub>c</sub> = 1, α<sub>cc</sub> = 1, γ<sub>M0</sub> = 1.</p>
<div class="table-wrap"><table><tbody>${rows([
    ["α; f<sub>jd</sub> = β<sub>j</sub> α f<sub>ck</sub>", `${fixed(c.alpha, 3)}; ${fixed(c.fjd, 2)}`, "—; MPa"],
    ["c = t<sub>p</sub> √(f<sub>y</sub> / (3 f<sub>jd</sub>))", fixed(c.c, 1), "mm"],
    ["A<sub>eff</sub>", fixed(c.Aeff, 0), "mm²"],
    ["N<sub>c,Rk</sub> = A<sub>eff</sub> f<sub>jd</sub>", kN(c.NcRd), "kN", true]
  ])}</tbody></table></div>`;
}

function modelSectionHtml(result) {
  const o = result.options;
  const items = [
    "Quarter of the doubly symmetric base: four-node shells (MITC4) with layered plane-stress plasticity, E = " + o.E + " MPa, ν = " + o.nu + ", E<sub>t</sub> = " + fixed(o.Et, 0) + " MPa, characteristic f<sub>y</sub>; small displacements.",
    "Base plate as shells; under the column walls and their fillet welds (0.8 a√2 beyond each face, as EN measures m) a stiff zone of " + o.stiffZoneFactor + " t<sub>p</sub>.",
    "Column flanges and web, or walls, as vertical shells of height " + fixed(o.columnHeight, 0) + " mm on their mid-planes, loaded by a uniform displacement of their top edge" + (result.loadCase === "compression" ? " (elastic in the compression case: the column is not checked)." : "."),
    "Anchors: tension-only springs E A<sub>s</sub> / L<sub>b</sub> = " + fixed(result.anchor.stiffness / 1000, 1) + " kN/mm (L<sub>b</sub> = " + fixed(result.anchor.Lb, 0) + " mm, EN 1993-1-8 6.2.6.12), capped at 0.9 f<sub>ub</sub> A<sub>s</sub>, spread over a square of the washer area (side " + fixed(result.anchor.washerSide, 1) + " mm).",
    result.loadCase === "uplift"
      ? "Support: compression-only contact on a rigid plane (penalty 4000 N/mm³ × tributary area, as the T-stub model)."
      : `Support: elastic bed E<sub>cm</sub> / (1.275 √A<sub>eff</sub>) = ${fixed(result.bed.modulus, 1)} N/mm³ (EN 1993-1-8 Table 6.11), compression only, capped at f<sub>jd</sub> = ${fixed(result.bed.pressure, 1)} MPa.`,
    `Mesh size ${fixed(o.meshSize / o.meshRefinement, 1)} mm${o.meshSizeAuto ? " (automatic: m<sub>x</sub>/3)" : ""}; ${o.loadSteps} displacement steps up to ${fixed(o.displacementLimit, 1)} mm${o.displacementLimitAuto ? " (automatic)" : ""}, Newton iterations capped at 35 with up to 8 step bisections; a step that does not converge stops the analysis.`,
    "Resistance criterion: 5 % equivalent plastic strain or anchor yield, interpolated to the event (as the T-stub FE)."
  ];
  return `<ul>${items.map(item => `<li>${item}</li>`).join("")}</ul>`;
}

function curveTableHtml(result) {
  return `<div class="table-wrap"><table><thead><tr><th>Column displacement (mm)</th><th>Column force (kN)</th><th>Anchor force, each (kN)</th><th>${result.loadCase === "uplift" ? "Prying force (kN)" : "Bed force (kN)"}</th></tr></thead><tbody>${result.curve.map(p => `<tr><td class="num">${fixed(p.displacement, 3)}</td><td class="num">${kN(p.reaction)}</td><td class="num">${kN(p.anchorForce)}</td><td class="num">${kN(p.contactForce)}</td></tr>`).join("")}</tbody></table></div>`;
}

const LIMITATIONS = [
  "The FE model checks the steel part: plate, anchor steel and contact. The anchorage in concrete (cone, pull-out, splitting, edge), the welds, the column and the foundation are not part of it.",
  "Small-displacement shells, elastic transverse shear, no geometric nonlinearity, no anchor holes, no anchor bending, no fracture; rigid support in the uplift case.",
  "Seven-point through-thickness integration: a fully plastic section carries 0.960 of t² f<sub>y</sub>/4 in the shells (conservative); with E<sub>t</sub> = E/1000 the 5 % event lies about 3 % above the plastic moment.",
  "The 5 % plastic strain is a criterion at element level. Where it is reached at a corner of the stiff zone (flange tip or wall end with its weld), the strain concentration grows with mesh refinement and the FE resistance does not converge: about 10 to 20 % lower per halving of the mesh in the validation runs. Plate strips without such a corner converge at first order to the plastic resistance.",
  "Compression case: indicative only; Winkler bed with a pressure cap, not a model of the grout and concrete.",
  "These results are a feasibility prototype and are not validated for design use."
];

/** Renders a self-contained, printable report of a column base FE run. */
export function renderBasePlateFeReport(result, { input, viewHtml, bearingHtml, audit }) {
  const uplift = result.loadCase === "uplift";
  const title = `Column base — FE verification (${uplift ? "uplift" : "compression, indicative"})`;
  const sections = [
    ["Input", `<div class="table-wrap"><table><thead><tr><th>Field</th><th>Value</th><th>Unit</th></tr></thead><tbody>${inputRowsHtml(input)}</tbody></table></div><p class="note">The design actions of the input are not used by the FE run; the analysis loads the base to its resistance.</p>`],
    [`EN component model at γ = 1`, enSectionHtml(result)],
    ["FE model", modelSectionHtml(result)],
    ["FE result", `${summaryTableHtml(result)}${result.warnings.map(text => `<p class="warning">${escapeHtml(text)}</p>`).join("")}`],
    ["Deformed shape at the resistance event", viewHtml],
    ...(bearingHtml ? [["Contact pressure under the plate", bearingHtml]] : []),
    ["Force–displacement curve", `<p class="note">Column force against the displacement of the column top; dashed: EN resistance; marker: FE resistance event.</p>${makeCurveSvg(result)}${curveTableHtml(result)}`],
    ["Audit", `<p>Tool: ${escapeHtml(TOOL_NAME)}, ${escapeHtml(result.version)}</p><p>Canonical input SHA-256: <span class="audit">${escapeHtml(audit.inputSha256)}</span></p><p>Generated: <span class="audit">${escapeHtml(audit.generatedAt)}</span>, calculated in the ${escapeHtml(audit.calculatedIn)}</p>`],
    ["Limitations", `<ul>${LIMITATIONS.map(item => `<li>${item}</li>`).join("")}</ul>`]
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>${REPORT_STYLE}</head><body>
<header><h1>${escapeHtml(title)}</h1><p class="status">Feasibility prototype — not for design use</p>
<p class="note">Characteristic strengths, γ = 1: a check of the EN component model, not a design value.</p></header>
${sections.map(([heading, html], index) => `<section><h2>${index + 1} ${escapeHtml(heading)}</h2>${html}</section>`).join("\n")}
</body></html>`;
}

/**
 * Runs the column base FE on raw page values and renders the view, map and
 * report. onProgress(step, stepCount, displacement) after each load step.
 */
export async function runBasePlateFeBrowser(rawInput, rawOptions = {}, { onProgress = () => {}, calculatedIn = "browser" } = {}) {
  const { input, options } = validateBasePlateFe(rawInput, rawOptions);
  const result = analyseBasePlateFe(input, options, {
    includeField: true,
    onStep: (point, step, stepCount) => onProgress(step, stepCount, Math.abs(point.displacement))
  });
  const generatedAt = new Date().toISOString();
  const inputSha256 = await sha256(canonicalJson({ input, options: result.options, version: result.version }));
  const audit = { inputSha256, generatedAt, calculatedIn };
  const viewOptions = { azimuth: -35, elevation: 28, scale: autoScale(result.field, Math.max(input.hp, input.bp)), showUndeformed: false, b: input.hp, hw: result.options.columnHeight, tf: input.tp };
  const viewHtml = `${fieldSvg(result.field, viewOptions)}${strainLegendHtml()}<p class="note">Displacements magnified ${viewOptions.scale}×; anchor forces in kN (red: anchor at 0.9 f<sub>ub</sub> A<sub>s</sub>, γ = 1).</p>`;
  const bearingHtml = result.bearing ? `${bearingMapSvg(result.bearing, input)}${bearingLegendHtml()}<p class="note">Contact pressure at ${result.bearing.at === "N_c,Rk" ? `the first load step that carries N<sub>c,Rk</sub> = ${kN(result.en.resistance)} kN (${kN(result.bearing.columnForce)} kN)` : "the last load step"}; dashed: the EN effective area A<sub>eff</sub>.</p>` : "";
  const reportHtml = renderBasePlateFeReport(result, { input, viewHtml, bearingHtml, audit });
  return { ...result, input, audit, viewOptions, bearingHtml, reportHtml };
}
