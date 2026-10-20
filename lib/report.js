import { TSTUB_INPUT_FIELDS } from "./validate.js";
export const TOOL_NAME = "easuys-connection-tools";
export const TOOL_VERSION = "tstub-0.2.0";
export function canonicalTStubInputJson(input) {
    const ordered = {};
    for (const key of Object.keys(input).sort())
        ordered[key] = input[key];
    return JSON.stringify(ordered);
}
export async function hashTStubInput(input) {
    const bytes = new TextEncoder().encode(canonicalTStubInputJson(input));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[character]);
}
function significant(value, digits = 3) {
    if (!Number.isFinite(value))
        return "—";
    return Number(value.toPrecision(digits)).toString();
}
function forceKn(valueN) {
    return significant(valueN / 1000, 3);
}
function modeLabel(mode) {
    return `Mode ${mode}`;
}
/** Axis end and tick step: a 1-2-2.5-5 step with a little headroom above the data. */
function niceAxis(maximum) {
    const raw = Math.max(maximum, 1e-9) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(value => value >= raw);
    return { end: step * Math.ceil(maximum * 1.05 / step), step };
}
export function makeCurveSvg(result) {
    // a 480-unit canvas keeps the text legible on a phone (CSS caps it at 640 px)
    const width = 480, height = 300;
    const left = 50, right = 14, top = 30, bottom = 46;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const points = result.curve;
    const xAxis = niceAxis(Math.max(0.001, ...points.map(point => point.displacement), result.fe.failureDisplacement));
    const yAxis = niceAxis(Math.max(0.001, ...points.map(point => point.reaction / 1000), result.en.resistance / 1000, result.fe.resistance / 1000));
    const maxX = xAxis.end, maxY = yAxis.end;
    const x = (value) => left + value / maxX * plotWidth;
    const y = (value) => top + plotHeight - value / maxY * plotHeight;
    const path = points.map((point, index) => `${index ? "L" : "M"}${x(point.displacement).toFixed(2)},${y(point.reaction / 1000).toFixed(2)}`).join(" ");
    const tickValues = (axis) => Array.from({ length: Math.round(axis.end / axis.step) + 1 }, (_, index) => index * axis.step);
    const xTicks = tickValues(xAxis).map(value => {
        const px = x(value).toFixed(2);
        return `<line class="grid" x1="${px}" y1="${top}" x2="${px}" y2="${top + plotHeight}"/><line class="tick" x1="${px}" y1="${top + plotHeight}" x2="${px}" y2="${top + plotHeight + 5}"/><text x="${px}" y="${top + plotHeight + 19}" text-anchor="middle">${significant(value, 3)}</text>`;
    }).join("");
    const yTicks = tickValues(yAxis).map(value => {
        const py = y(value).toFixed(2);
        return `<line class="grid" x1="${left}" y1="${py}" x2="${left + plotWidth}" y2="${py}"/><line class="tick" x1="${left - 5}" y1="${py}" x2="${left}" y2="${py}"/><text x="${left - 8}" y="${Number(py) + 4}" text-anchor="end">${significant(value, 3)}</text>`;
    }).join("");
    const enY = y(result.en.resistance / 1000);
    const feX = x(result.fe.failureDisplacement), feY = y(result.fe.resistance / 1000);
    return `<svg class="curve" viewBox="0 0 ${width} ${height}" role="img" aria-label="Force-displacement curve in kN and mm">
    <g class="gridlines">${xTicks}${yTicks}</g>
    <line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + plotHeight}"/><line class="axis" x1="${left}" y1="${top + plotHeight}" x2="${left + plotWidth}" y2="${top + plotHeight}"/>
    <line class="en-line" x1="${left}" y1="${enY}" x2="${left + plotWidth}" y2="${enY}"/>
    <path class="fe-line" d="${path}"/><circle class="fe-marker" cx="${feX}" cy="${feY}" r="5"/>
    <text class="axis-label" x="${left + plotWidth / 2}" y="${height - 5}" text-anchor="middle">Displacement (mm)</text>
    <text class="axis-label" transform="translate(15 ${top + plotHeight / 2}) rotate(-90)" text-anchor="middle">Force (kN)</text>
    <g class="legend"><line class="fe-line" x1="${left}" y1="12" x2="${left + 26}" y2="12"/><text x="${left + 32}" y="16">FE curve</text><line class="en-line" x1="${left + 110}" y1="12" x2="${left + 136}" y2="12"/><text x="${left + 142}" y="16">EN resistance</text></g>
  </svg>`;
}
/** Render a self-contained, printable calculation report. */
export async function renderTStubReport(result, meta) {
    const input = meta.input;
    const inputSha256 = await hashTStubInput(input);
    const generatedAt = meta.generatedAt ?? new Date().toISOString();
    const tool = escapeHtml(meta.tool ?? TOOL_NAME);
    const version = escapeHtml(meta.version ?? TOOL_VERSION);
    const defaulted = new Set(meta.defaultedFields ?? []);
    const inputRows = TSTUB_INPUT_FIELDS.map(field => {
        const value = input[field.name];
        const marker = defaulted.has(String(field.name)) ? " <span class=\"default\">default</span>" : "";
        return `<tr><th scope="row">${escapeHtml(field.name)}</th><td>${escapeHtml(value)}</td><td>${escapeHtml(field.unit)}</td><td>${escapeHtml(field.description)}${marker}</td></tr>`;
    }).join("");
    const en = result.en;
    const boltRows = Object.entries(result.boltForces).map(([id, force]) => `<tr><th scope="row">${escapeHtml(id)}</th><td>${forceKn(force)}</td><td>kN</td></tr>`).join("");
    const curve = makeCurveSvg(result);
    const extraSections = meta.extraSections ?? [];
    const order = ["Input", ...extraSections.map(section => section.title), "EN 1993-1-8 T-stub check", "FE analysis", "Force–displacement curve", "Audit", "Limitations"];
    const number = (title) => String(order.indexOf(title) + 1);
    const extra = extraSections.map(section => `<section><h2>${number(section.title)} ${escapeHtml(section.title)}</h2>${section.html}</section>`).join("\n");
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bolted T-stub — component check</title>
<style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}html,body{margin:0;padding:0;color:#18212b;font:14px/1.45 Arial,Helvetica,sans-serif}body{max-width:900px;margin:0 auto;padding:18px}h1{font-size:25px;margin:0 0 8px}h2{font-size:18px;margin:26px 0 9px;border-bottom:1px solid #aab4bf;padding-bottom:5px}p{margin:7px 0}.status{display:inline-block;border:1px solid #9b4d00;color:#713800;background:#fff1df;font-weight:700;padding:6px 9px;margin:4px 0 12px}.table-wrap{max-width:100%;overflow-x:auto}table{border-collapse:collapse;width:100%;table-layout:auto;margin:7px 0 14px}th,td{border:1px solid #c9d0d8;padding:5px 7px;text-align:left;vertical-align:top}th[scope=row],td:nth-child(2),td:nth-child(3){white-space:nowrap}thead th{background:#edf1f5}td.numeric{text-align:right;font-variant-numeric:tabular-nums}.default{font-size:11px;color:#455d75;font-weight:700;white-space:nowrap}.note{color:#46515d}.summary{font-weight:700}.curve{display:block;width:100%;max-width:640px;height:auto;margin:8px 0}.curve text{font:12px Arial,Helvetica,sans-serif;fill:#263342}.curve .axis{stroke:#273543;stroke-width:1.4}.curve .tick{stroke:#273543;stroke-width:1}.curve .grid{stroke:#dce2e8;stroke-width:1}.curve .fe-line{fill:none;stroke:#1265a8;stroke-width:3}.curve .en-line{stroke:#bd4a34;stroke-width:2;stroke-dasharray:7 5}.curve .fe-marker{fill:#1265a8;stroke:#fff;stroke-width:2}.curve .axis-label{font-weight:700}.curve .legend{font-size:12px}.audit{overflow-wrap:anywhere;font-family:monospace;font-size:12px}.limit-list{padding-left:20px}.limit-list li{margin:5px 0}@media(max-width:480px){body{padding:12px;font-size:13px}h1{font-size:21px}h2{font-size:16px}th,td{padding:4px;font-size:12px}}@media print{body{max-width:none;padding:0}h2{break-after:avoid}table,svg{break-inside:avoid}section{break-inside:auto}}
</style></head><body>
<header><h1>Bolted T-stub — component check</h1><p class="status">Feasibility prototype — not for design use</p></header>
<section><h2>${number("Input")} Input</h2><div class="table-wrap"><table><thead><tr><th>Field</th><th>Value</th><th>Unit</th><th>Description</th></tr></thead><tbody>${inputRows}</tbody></table></div></section>
${extra}
<section><h2>${number("EN 1993-1-8 T-stub check")} EN 1993-1-8 T-stub check (Table 6.2, l<sub>eff</sub> = L, γ<sub>M</sub> = 1)</h2>
<div class="table-wrap"><table><tbody>
<tr><th>M<sub>pl,Rd</sub></th><td>${significant(en.MplRd / 1e6, 3)}</td><td>kN·m</td></tr><tr><th>n</th><td>${significant(en.n, 3)}</td><td>mm</td></tr>
<tr><th>ΣF<sub>t,Rd</sub></th><td>${forceKn(en.sumFtRd)}</td><td>kN</td></tr><tr><th>F<sub>T,1</sub></th><td>${forceKn(en.FT1)}</td><td>kN</td></tr>
<tr><th>F<sub>T,2</sub></th><td>${forceKn(en.FT2)}</td><td>kN</td></tr><tr><th>F<sub>T,3</sub></th><td>${forceKn(en.FT3)}</td><td>kN</td></tr>
<tr><th>Web in tension</th><td>${forceKn(en.webTension)}</td><td>kN</td></tr><tr><th>Resistance</th><td class="summary">${forceKn(en.resistance)}</td><td>kN</td></tr>
<tr><th>Mode</th><td>${modeLabel(en.mode)}</td><td></td></tr><tr><th>Governing</th><td>${escapeHtml(en.governing)}</td><td></td></tr>
</tbody></table></div></section>
<section><h2>${number("FE analysis")} FE analysis</h2>
<p>Four-node shells with layered plane-stress plasticity E<sub>t</sub> = E/1000, compression-only contact on a rigid plane, tension-only bolt springs capped at F<sub>t,Rd</sub>, and displacement control.</p>
<p><strong>Resistance criterion:</strong> 5% plastic strain or bolt yield, interpolated to the event.</p>
<div class="table-wrap"><table><tbody><tr><th>Mesh size</th><td>${significant(input.meshSize, 3)} mm</td></tr><tr><th>DOF</th><td>${result.dofCount}</td></tr>
<tr><th>FE resistance</th><td>${forceKn(result.fe.resistance)} kN</td></tr><tr><th>FE mode</th><td>${modeLabel(result.fe.mode)}</td></tr>
<tr><th>FE / EN ratio</th><td>${significant(result.fe.resistance / en.resistance, 3)}</td></tr><tr><th>Failure displacement</th><td>${significant(result.fe.failureDisplacement, 3)} mm</td></tr>
<tr><th>Prying force</th><td>${forceKn(result.pryingForce)} kN</td></tr><tr><th>Maximum plastic strain</th><td>${significant(result.maxPlasticStrain * 100, 3)}%</td></tr>
</tbody></table></div><h3>Bolt forces</h3><div class="table-wrap"><table><thead><tr><th>Bolt</th><th>Force</th><th>Unit</th></tr></thead><tbody>${boltRows}</tbody></table></div></section>
<section><h2>${number("Force–displacement curve")} Force–displacement curve</h2><p class="note">FE reaction and EN resistance; marker shows the FE resistance event.</p>${curve}</section>
<section><h2>${number("Audit")} Audit</h2><p>Tool: ${tool}</p><p>Tool version: ${version}</p><p>Canonical normalised input SHA-256: <span class="audit">${escapeHtml(inputSha256)}</span></p>
<p>Generated: <span class="audit">${escapeHtml(generatedAt)}</span></p><p>Analysis time: ${significant(result.timingMs, 3)} ms</p><p>DOF: ${result.dofCount}</p></section>
<section><h2>${number("Limitations")} Limitations</h2><ul class="limit-list">
<li>The shell formulation uses small-displacement kinematics, elastic transverse shear, a rigid support plane, penalty contact, and axial-only bolt springs.</li>
<li>There is no bolt shear or bearing, weld failure or yielding link, fracture, geometric nonlinearity, arbitrary plate topology, or calibrated contact compliance. The web–flange junction is a shared shell line with no weld or web thickness offset, which moves the flange hinge to the web mid-plane.</li>
<li>Plastic strain at the terminating increment is sensitive to mesh and load step (for a 2.5 mm mesh and 16 mm flange, the reported value varied from 18% to 8%); the resistance is interpolated to the 5% event. Runtime on Node at 4,026 DOF was 4–14 seconds in the prototype acceptance runs. Larger connections need a faster sparse solver and fewer global iterations.</li>
<li>These results are a feasibility prototype and are not validated for design use.</li>
</ul></section></body></html>`;
}
