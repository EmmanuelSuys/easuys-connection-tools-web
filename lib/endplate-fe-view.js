/**
 * Presentation of the end-plate FE check (src/endplate-fe.ts): result tables, the moment-rotation
 * (or tension-displacement) curve, the row-force curves and the self-contained calculation report.
 * No DOM access: used by the browser page, its Web Worker and the Node tests. Units: N, mm.
 */
const ROW_COLOURS = ["#1265a8", "#c2410c", "#15803d", "#7c3aed", "#b45309", "#0e7490"];
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}
const fixed = (value, digits) => (value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits));
const kN = (valueN) => fixed(valueN / 1000, 1);
const kNm = (valueNmm) => (valueNmm === null ? "—" : fixed(valueNmm / 1e6, 1));
function niceAxis(maximum) {
    const raw = Math.max(maximum, 1e-9) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(value => value >= raw);
    return { end: step * Math.ceil(maximum * 1.05 / step), step };
}
const significant = (value, digits = 3) => Number(value.toPrecision(digits)).toString();
/** x of a curve point: rotation in mrad (rotation loading) or the strip-end displacement in mm. */
function abscissa(result) {
    if (result.model.loading === "rotation") {
        const arm = result.model.yReference - result.model.yCentre;
        return { label: "Rotation φ (mrad)", of: d => d / arm * 1000 };
    }
    return { label: "Displacement (mm)", of: d => d };
}
function chartSvg(title, xLabel, yLabel, series) {
    const legendLines = Math.ceil(series.length / 3);
    const width = 480, height = 286 + 14 * legendLines, left = 52, right = 14, top = 22 + 14 * legendLines, bottom = 46;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const xs = series.flatMap(s => s.values.map(v => v[0]));
    const ys = series.flatMap(s => [...s.values.map(v => v[1]), s.level ?? 0, s.marker?.[1] ?? 0]);
    const xAxis = niceAxis(Math.max(1e-6, ...xs)), yAxis = niceAxis(Math.max(1e-6, ...ys));
    const x = (v) => left + v / xAxis.end * plotWidth;
    const y = (v) => top + plotHeight - v / yAxis.end * plotHeight;
    const ticks = (axis) => Array.from({ length: Math.round(axis.end / axis.step) + 1 }, (_, i) => i * axis.step);
    const grid = ticks(xAxis).map(v => `<line class="grid" x1="${x(v).toFixed(1)}" y1="${top}" x2="${x(v).toFixed(1)}" y2="${top + plotHeight}"/><text x="${x(v).toFixed(1)}" y="${top + plotHeight + 18}" text-anchor="middle">${significant(v)}</text>`).join("")
        + ticks(yAxis).map(v => `<line class="grid" x1="${left}" y1="${y(v).toFixed(1)}" x2="${left + plotWidth}" y2="${y(v).toFixed(1)}"/><text x="${left - 7}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${significant(v)}</text>`).join("");
    const lines = series.map(s => {
        const path = s.values.map((v, i) => `${i ? "L" : "M"}${x(v[0]).toFixed(1)},${y(v[1]).toFixed(1)}`).join(" ");
        const level = s.level !== undefined ? `<line x1="${left}" y1="${y(s.level).toFixed(1)}" x2="${left + plotWidth}" y2="${y(s.level).toFixed(1)}" stroke="${s.colour}" stroke-width="1.6" stroke-dasharray="7 5"/>` : "";
        const marker = s.marker ? `<circle cx="${x(s.marker[0]).toFixed(1)}" cy="${y(s.marker[1]).toFixed(1)}" r="4.5" fill="${s.colour}" stroke="#fff" stroke-width="1.5"/>` : "";
        return `${level}<path d="${path}" fill="none" stroke="${s.colour}" stroke-width="2.6"/>${marker}`;
    }).join("");
    const legend = series.map((s, i) => `<g transform="translate(${left + (i % 3) * 140} ${12 + Math.floor(i / 3) * 14})"><line x1="0" y1="0" x2="20" y2="0" stroke="${s.colour}" stroke-width="2.6"${s.values.length ? "" : ' stroke-dasharray="6 4"'}/><text x="25" y="4">${escapeHtml(s.label)}</text></g>`).join("");
    return `<svg class="curve" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}" font-family="Arial, Helvetica, sans-serif">
<g class="gridlines">${grid}</g>
<line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}"/><line class="axis" x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}"/>
${lines}
<text class="axis-label" x="${left + plotWidth / 2}" y="${height - 6}" text-anchor="middle">${escapeHtml(xLabel)}</text>
<text class="axis-label" transform="translate(14 ${top + plotHeight / 2}) rotate(-90)" text-anchor="middle">${escapeHtml(yLabel)}</text>
<g class="legend" font-size="12">${legend}</g>
</svg>`;
}
/** Joint curve: M (exact moment of the plate forces) against rotation, or tension against displacement. */
export function endPlateFeCurveSvg(result) {
    const axis = abscissa(result);
    const event = [axis.of(result.fe.failureDisplacement), result.model.loading === "rotation" ? (result.fe.momentExactNmm ?? 0) / 1e6 : result.fe.resistance / 1000];
    if (result.model.loading === "rotation") {
        return chartSvg("Moment-rotation curve of the tension zone", axis.label, "Moment (kNm)", [
            { values: result.curve.map(p => [axis.of(p.displacement), p.moment / 1e6]), colour: "#1265a8", label: "FE moment", marker: event },
            { values: [], colour: "#bd4a34", label: "EN end-plate side (γ = 1)", level: result.en.mjNmm / 1e6 },
        ]);
    }
    return chartSvg("Tension-displacement curve of the tension zone", axis.label, "Tension (kN)", [
        { values: result.curve.map(p => [axis.of(p.displacement), p.reaction / 1000]), colour: "#1265a8", label: "FE tension", marker: event },
        { values: [], colour: "#bd4a34", label: "EN end-plate side (γ = 1)", level: result.en.sumFtr / 1000 },
    ]);
}
/** Row forces against rotation (or displacement), with the EN effective row resistances dashed. */
export function endPlateFeRowsSvg(result) {
    const axis = abscissa(result);
    return chartSvg("Bolt-row forces", axis.label, "Row force (kN)", result.rows.map((row, i) => ({
        values: result.curve.map(p => [axis.of(p.displacement), p.rows[i] / 1000]),
        colour: ROW_COLOURS[i % ROW_COLOURS.length],
        label: `Row ${row.id} (EN dashed)`,
        level: row.enEffective / 1000,
    })));
}
const ratio = (fe, en) => (en > 0 ? fixed(fe / en, 3) : "—");
/** Summary table and warnings of the FE check. */
export function endPlateFeSummaryHtml(result) {
    const r = result, rotation = r.model.loading === "rotation";
    const arm = r.model.yReference - r.model.yCentre;
    const warnings = [];
    if (r.fe.lowerBound)
        warnings.push("No failure event was reached within the displacement limit: the FE values are lower bounds. Increase the displacement limit.");
    if (r.type === "column" && r.en.columnSideGoverns)
        warnings.push("In the EN model the column side (column flange or web) limits at least one row. The FE model takes the column flange as rigid, so it checks the end-plate side only.");
    if (r.fe.event === "plastic strain")
        warnings.push("The event is the 5 % plastic-strain criterion. It depends on the mesh, because a plastic hinge concentrates its strain in about one element width: in the convergence study a finer mesh gave 4–8 % lower values for such cases. Bolt-governed events changed by about 1 %.");
    if (r.en.compressionLimited)
        warnings.push("In the EN model the compression side limits the rows (6.2.7.2(7)); the FE model covers the tension zone only.");
    return `<div class="table-wrap"><table class="results-table"><tbody>
<tr><th>Loading</th><td>${rotation ? `beam end turned about the EN centre of compression (y = ${fixed(r.model.yCentre, 1)} mm)` : "tension zone pulled as a whole"}</td></tr>
<tr class="key"><th>FE event and mechanism</th><td>${escapeHtml(r.fe.mechanism)}</td></tr>
<tr class="key"><th>FE M<sub>j</sub> = Σ F<sub>r</sub> h<sub>r</sub> (γ = 1)</th><td class="num">${kNm(r.fe.mjNmm)} kNm</td></tr>
<tr><th>EN end-plate side Σ F<sub>tr</sub> h<sub>r</sub> (γ = 1)</th><td class="num">${kNm(r.en.mjNmm)} kNm</td></tr>
<tr class="key"><th>FE / EN, moment</th><td class="num">${fixed(r.ratios.moment, 3)}</td></tr>
<tr><th>FE tension in the bolt rows Σ F<sub>r</sub></th><td class="num">${kN(r.fe.resistance)} kN</td></tr>
<tr><th>EN end-plate side Σ F<sub>tr</sub> (γ = 1)</th><td class="num">${kN(r.en.sumFtr)} kN</td></tr>
<tr><th>FE / EN, tension</th><td class="num">${fixed(r.ratios.resistance, 3)}</td></tr>
<tr class="info"><th>EN joint M<sub>j</sub> at γ = 1, all components (incl. ${r.type === "column" ? "column side and " : ""}compression side)</th><td class="num">${kNm(r.en.jointMjNmm)} kNm</td></tr>
${rotation ? `<tr><th>Moment of the bolt and contact forces at their own positions</th><td class="num">${kNm(r.fe.momentExactNmm)} kNm</td></tr>` : ""}
<tr><th>${rotation ? "Rotation at the event (flange displacement)" : "Displacement at the event"}</th><td class="num">${rotation ? `${fixed(r.fe.failureDisplacement / arm * 1000, 2)} mrad (${fixed(r.fe.failureDisplacement, 2)} mm)` : `${fixed(r.fe.failureDisplacement, 2)} mm`}</td></tr>
<tr><th>Maximum plastic strain</th><td class="num">${fixed(r.fe.maxPlasticStrain * 100, 2)} %</td></tr>
<tr><th>Model size</th><td class="num">${r.model.dofCount.toLocaleString("en")} DOF, ${r.model.elementCount} shells, mesh ${fixed(r.model.meshSize, 1)} mm</td></tr>
<tr><th>Analysis time</th><td class="num">${fixed(r.timingMs / 1000, 1)} s</td></tr>
</tbody></table></div>
${warnings.map(text => `<p class="warning">${escapeHtml(text)}</p>`).join("")}`;
}
/** Row and group tables: FE row forces at the event against the EN component model at gamma = 1. */
export function endPlateFeTablesHtml(result) {
    const rows = result.rows.map(row => `<tr${row.id === result.fe.governingRowId ? ' class="governing"' : ""}><th>${row.id}</th><td class="num">${fixed(row.y, 1)}</td><td class="num">${fixed(row.leverArm, 1)}</td><td>${escapeHtml(row.location.replace(/_/g, " "))}</td>
<td class="num">${kN(row.fe)}</td><td class="num">${kN(2 * row.feBoltForce)} / ${kN(row.fePrying)}</td><td class="num">${kN(row.enIndividual)}</td><td class="formula">${escapeHtml(row.enIndividualBy)}</td><td class="num">${kN(row.enEffective)}</td><td class="formula">${escapeHtml(row.enEffectiveBy)}</td><td class="num">${ratio(row.fe, row.enEffective)}</td></tr>`).join("");
    const groups = result.groups.map(group => `<tr><td>${escapeHtml(group.component)}</td><td>${group.rowIds.join(" + ")}</td><td class="num">${kN(group.en)}${group.mode ? ` (mode ${escapeHtml(group.mode)})` : ""}</td><td class="num">${kN(group.fe)}</td><td class="num">${ratio(group.fe, group.en)}</td></tr>`).join("");
    return `<h3>Bolt rows at the FE event</h3>
<div class="table-wrap"><table class="results-table"><thead><tr><th>Row</th><th>y (mm)</th><th>h<sub>r</sub> (mm)</th><th>Location</th><th>FE F<sub>r</sub> (kN)</th><th>FE bolts / prying (kN)</th><th>EN alone (kN)</th><th>governed by</th><th>EN F<sub>tr</sub> (kN)</th><th>governed by</th><th>FE / EN F<sub>tr</sub></th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="note">FE F<sub>r</sub>: forces of both bolts of the row less the contact (prying) forces in the row's band of the plate, at the resistance event; they add up to the tension of the tension zone. EN: end-plate side components at γ = 1 (end plate in bending with the bolts, Table 6.2; beam web in tension), effective row resistances in sequence (6.2.7.2(6)–(9)), without the compression-side limit.</p>
${groups ? `<h3>Row groups</h3>
<div class="table-wrap"><table class="results-table"><thead><tr><th>EN component</th><th>Rows</th><th>EN group resistance (kN)</th><th>FE Σ F<sub>r</sub> at the event (kN)</th><th>FE / EN</th></tr></thead><tbody>${groups}</tbody></table></div>
<p class="note">The FE sum of a group is the force of its rows at the joint's first event, not the group's own FE resistance: a ratio well below 1 means the group does not govern.</p>` : ""}`;
}
/** Model description lines (HTML). */
export function endPlateFeModelHtml(result) {
    const m = result.model;
    return `<ul class="limit-list">
<li>One model of the whole bolt-row assembly: all ${result.rows.length} tension rows act together (no split into single-row T-stubs), so row groups form by themselves.</li>
<li>End plate (t<sub>p</sub>, f<sub>y</sub> of the plate), beam web and tension flange as shell strips ${fixed(m.depth, 0)} mm long; bilinear MITC4 shells with layered von Mises plasticity, hardening E/1000; half model about the beam web.</li>
<li>Plate modelled from y = ${fixed(m.yCut, 1)} mm (${escapeHtml(m.cutReason)}) to the plate top; width 2 × ${fixed(m.halfWidth, 1)} mm = w + 2e.</li>
<li>Plate under the beam web and flange and 0.8 a√2 of their welds ${m.stiffZoneFactor} × as thick, so that the free bending lengths are m, m<sub>x</sub> and m<sub>2</sub> of EN 1993-1-8.</li>
<li>Bolts: axial stiffness ${fixed(m.boltStiffness / 1000, 0)} kN/mm (E A<sub>s</sub> / L<sub>b</sub>${result.type === "column" ? "" : " × 2 for two symmetric plates"}, L<sub>b</sub> = ${fixed(m.lbMm, 1)} mm)${m.washerHalfSide > 0 ? `; one spring at the bolt-axis node, as the T-stub model` : "; one spring at the bolt-axis node, as the T-stub model"}; bolt resistance F<sub>t</sub> = 0.9 f<sub>ub</sub> A<sub>s</sub> = ${kN(m.boltCapacity)} kN (γ = 1).</li>
<li>Support: ${escapeHtml(result.support)}; unilateral contact at every plate node (${fixed(m.contactStiffness / 1000, 0)} kN/mm per node).</li>
<li>Loading: ${m.loading === "rotation" ? `the beam-strip ends turn about the EN centre of compression (y = ${fixed(m.yCentre, 1)} mm); the tension flange end moves up to ${fixed(m.displacementLimit, 1)} mm` : `uniform displacement of the beam-strip ends up to ${fixed(m.displacementLimit, 1)} mm`} in ${m.loadSteps} steps, the step with the event bisected ${m.eventBisections} times (event within 1/${2 ** m.eventBisections} of the step); Newton iterations with line search, at most 35 per step and 8 step bisections, free residual ≤ 10<sup>−6</sup> × max(reaction norm, 1 N); a step that does not converge stops the analysis with an error.</li>
<li>Resistance event (T-stub criterion): 5 % equivalent plastic strain anywhere${m.washerHalfSide > 0 ? ` except under the washers (squares of the washer area, ${fixed(2 * m.washerHalfSide, 1)} mm wide, where the point load of a one-node bolt makes the strain grow without bound as the mesh is refined)` : ""}, or the first bolt reaching F<sub>t</sub>. Equilibrium gate at every step: |Σ F<sub>r</sub> − applied tension| ≤ 10<sup>−4</sup> × tension + 1 N (largest error ${fixed(result.fe.equilibriumErrorN, 3)} N).</li>
</ul>`;
}
export const ENDPLATE_FE_LIMITATIONS = [
    "Characteristic strengths, γ = 1: a check of the EN component model, not a design value.",
    "Tension zone of the end-plate side only: the column flange (beam-to-column), the opposite plate (splice) and the primary web (double-sided) are rigid supports; the column side, the column web panel and the compression side are checked by the EN model only.",
    "The loading turns the beam end as a rigid section about the EN centre of compression (or pulls the tension zone as a whole); shear and axial force are not applied.",
    "Bolts are axial springs at one node each (as the T-stub model), without bending, preload, threads or holes; the strain criterion is not applied under the washers. Welds are not modelled beyond the stiffened plate zones.",
    "First-event resistance: the analysis stops when one bolt reaches its resistance or one point reaches 5 % plastic strain; redistribution beyond that is not used.",
    "Feasibility prototype — not for design use.",
];
/** Canonical JSON of the page input and FE options (sorted keys), for the audit hash. */
export function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object")
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    return JSON.stringify(value ?? null);
}
export async function sha256Hex(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
/** Self-contained, printable report of the FE check. */
export function renderEndPlateFeReport(result, meta) {
    const input = meta.inputRows.map(([label, value]) => `<tr><th>${label}</th><td>${escapeHtml(value)}</td></tr>`).join("");
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(meta.title)} — FE check</title>
<style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0 auto;max-width:900px;padding:18px;color:#18212b;font:14px/1.45 Arial,Helvetica,sans-serif;background:#fff}h1{font-size:24px;margin:0 0 8px}h2{font-size:18px;margin:24px 0 8px;border-bottom:1px solid #aab4bf;padding-bottom:4px}h3{font-size:15px;margin:16px 0 6px}
.status{display:inline-block;border:1px solid #9b4d00;color:#713800;background:#fff1df;font-weight:700;padding:6px 9px;margin:4px 0 12px}.table-wrap{max-width:100%;overflow-x:auto}table{border-collapse:collapse;width:100%;margin:6px 0 12px}th,td{border:1px solid #c9d0d8;padding:4px 6px;text-align:left;vertical-align:top}thead th{background:#edf1f5}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}tr.key th,tr.key td{font-weight:700;background:#edf3f9}tr.governing th,tr.governing td{font-weight:700;background:#fff4d6}tr.info th,tr.info td{color:#5b6672}.formula{font-size:12px;color:#5b6672}.note{color:#46515d}.warning{color:#8a4b00}
.curve{display:block;width:100%;max-width:560px;height:auto}.curve text{font:12px Arial,Helvetica,sans-serif;fill:#263342}.curve .axis{stroke:#273543;stroke-width:1.4}.curve .grid{stroke:#dce2e8;stroke-width:1}.curve .axis-label{font-weight:700}.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
.view3d{width:100%;height:auto;max-height:520px}.legend{font-size:12px;color:#46515d}.swatch{display:inline-block;width:14px;height:10px;margin:0 3px 0 8px;border:1px solid #8a97a5;vertical-align:middle}.audit{overflow-wrap:anywhere;font-family:monospace;font-size:12px}.limit-list{padding-left:20px}.limit-list li{margin:4px 0}
@media print{body{max-width:none;padding:0}h2{break-after:avoid}table,svg{break-inside:avoid}}
</style></head><body>
<header><h1>${escapeHtml(meta.title)} — FE check of the tension zone</h1><p class="status">Feasibility prototype — not for design use</p>
<p>Characteristic strengths (γ = 1): a check of the EN 1993-1-8 component model, not a design value.</p></header>
<section><h2>1 Input</h2><div class="table-wrap"><table><tbody>${input}</tbody></table></div></section>
<section><h2>2 FE model</h2>${endPlateFeModelHtml(result)}</section>
<section><h2>3 FE and EN at γ = 1</h2>${endPlateFeSummaryHtml(result)}${endPlateFeTablesHtml(result)}</section>
<section><h2>4 Curves</h2><div class="charts">${endPlateFeCurveSvg(result)}${endPlateFeRowsSvg(result)}</div></section>
${meta.viewHtml ? `<section><h2>5 Deformed shape at the resistance event</h2>${meta.viewHtml}</section>` : ""}
<section><h2>${meta.viewHtml ? 6 : 5} Audit</h2><table><tbody><tr><th>Tool</th><td>${escapeHtml(meta.tool)} · ${escapeHtml(result.version)}</td></tr><tr><th>Input SHA-256</th><td class="audit">${escapeHtml(meta.inputSha256)}</td></tr><tr><th>Generated</th><td>${escapeHtml(meta.generatedAt)}</td></tr><tr><th>Calculated in</th><td>the visitor's browser</td></tr></tbody></table></section>
<section><h2>${meta.viewHtml ? 7 : 6} Limitations</h2><ul class="limit-list">${ENDPLATE_FE_LIMITATIONS.map(text => `<li>${escapeHtml(text)}</li>`).join("")}</ul></section>
</body></html>`;
}
