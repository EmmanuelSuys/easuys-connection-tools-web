// HTML (strings) for the design check of checkTStubDesign: used by the page
// and by the calculation report. No DOM access.

const kN = valueN => (valueN / 1000).toFixed(1);
const num = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : "—");

const GOVERNING_TEXT = {
  "mode 1": "mode 1 — complete yielding of the flange",
  "mode 2": "mode 2 — bolt failure with yielding of the flange",
  "mode 3": "mode 3 — bolt failure",
  web: "web in tension"
};

export function governingText(design) {
  return GOVERNING_TEXT[design.governing];
}

/** One-line result with the utilisation bar (when F_Ed is given). */
export function designSummaryHtml(design) {
  const util = design.utilisation;
  const status = util === undefined ? "" : util <= 1 ? "ok" : "fail";
  const bar = util === undefined ? "" : `
    <div class="util ${status}" role="img" aria-label="Utilisation ${num(util, 2)}">
      <div class="util-fill" style="width:${Math.min(100, util * 100).toFixed(1)}%"></div>
      <span class="util-text">F<sub>Ed</sub> / F<sub>T,Rd</sub> = ${kN(design.FEd)} / ${kN(design.resistance)} = <strong>${num(util, 2)}</strong> ${util <= 1 ? "✓" : "✗ exceeds"}</span>
    </div>`;
  return `<p class="design-result">Design resistance <strong>F<sub>T,Rd</sub> = ${kN(design.resistance)} kN</strong>, governed by ${governingText(design)}.</p>${bar}`;
}

export function designTableHtml(design) {
  const row = (key, label, formula, value, unit = "kN") =>
    `<tr class="${design.governing === key ? "governing" : ""}"><th scope="row">${label}</th><td class="formula">${formula}</td><td class="num">${value}</td><td>${unit}</td></tr>`;
  const b = design.bolt;
  return `
  <div class="table-wrap"><table class="results-table design-table"><thead><tr><th>Failure mode</th><th>EN 1993-1-8</th><th class="num">Value</th><th></th></tr></thead><tbody>
    ${row("mode 1", "Mode 1", "F<sub>T,1,Rd</sub> = 4 M<sub>pl,1,Rd</sub> / m (Table 6.2, method 1)", kN(design.FT1))}
    <tr class="info"><th scope="row">Mode 1, method 2</th><td class="formula">(8n − 2e<sub>w</sub>) M<sub>pl,1,Rd</sub> / (2mn − e<sub>w</sub>(m + n)), e<sub>w</sub> = d<sub>w</sub>/4 — alternative, for information</td><td class="num">${kN(design.FT1Method2)}</td><td>kN</td></tr>
    ${row("mode 2", "Mode 2", "F<sub>T,2,Rd</sub> = (2 M<sub>pl,2,Rd</sub> + n ΣB<sub>t,Rd</sub>) / (m + n)", kN(design.FT2))}
    ${row("mode 3", "Mode 3", "F<sub>T,3,Rd</sub> = ΣB<sub>t,Rd</sub>", kN(design.FT3))}
    ${row("web", "Web in tension", "F<sub>t,wb,Rd</sub> = l<sub>eff</sub> t<sub>w</sub> f<sub>y</sub> / γ<sub>M0</sub> (6.2.6.8)", kN(design.webRd))}
  </tbody></table></div>
  <details class="intermediate"><summary>Intermediate values</summary>
  <div class="table-wrap"><table class="results-table"><tbody>
    <tr><th>Flange f<sub>y</sub> / f<sub>u</sub></th><td class="num">${design.flange.fy} / ${design.flange.fu}</td><td>MPa</td></tr>
    <tr><th>Web f<sub>y</sub></th><td class="num">${design.web.fy}</td><td>MPa</td></tr>
    <tr><th>M<sub>pl,1,Rd</sub> = M<sub>pl,2,Rd</sub> = 0.25 l<sub>eff</sub> t<sub>f</sub>² f<sub>y</sub> / γ<sub>M0</sub></th><td class="num">${num(design.MplRd / 1e6, 2)}</td><td>kNm</td></tr>
    <tr><th>e / n = min(e, 1.25 m)</th><td class="num">${num(design.e)} / ${num(design.n)}</td><td>mm</td></tr>
    <tr><th>Bolt ${b.size} ${b.boltClass}: A<sub>s</sub>, f<sub>ub</sub></th><td class="num">${b.As} mm², ${b.fub}</td><td>MPa</td></tr>
    <tr><th>F<sub>t,Rd</sub> = 0.9 f<sub>ub</sub> A<sub>s</sub> / γ<sub>M2</sub></th><td class="num">${kN(design.FtRd)}</td><td>kN</td></tr>
    <tr><th>B<sub>p,Rd</sub> = 0.6 π d<sub>m</sub> t<sub>f</sub> f<sub>u</sub> / γ<sub>M2</sub> (d<sub>m</sub> ${num(b.dm)} mm)</th><td class="num">${kN(design.BpRd)}</td><td>kN</td></tr>
    <tr><th>B<sub>t,Rd</sub> = min(F<sub>t,Rd</sub>, B<sub>p,Rd</sub>) per bolt; ΣB<sub>t,Rd</sub></th><td class="num">${kN(design.BtRd)}; ${kN(design.sumBtRd)}</td><td>kN</td></tr>
    <tr><th>γ<sub>M0</sub> / γ<sub>M2</sub></th><td class="num">${num(design.gammaM0, 2)} / ${num(design.gammaM2, 2)}</td><td></td></tr>
  </tbody></table></div></details>`;
}

export function designChecksHtml(design) {
  const icon = { ok: "✓", fail: "✗", warning: "!" };
  const value = item => item.unit === "N" ? `${kN(item.value)} kN ≥ ${kN(item.limit)} kN`
    : item.unit === "—" ? `${num(item.value, 2)} ≤ ${num(item.limit, 2)}`
    : `${num(item.value)} ≥ ${num(item.limit)} ${item.unit}`;
  return `<ul class="checks">${design.checks.map(item => `<li class="${item.status}"><span class="icon" aria-hidden="true">${icon[item.status]}</span> <strong>${item.label}</strong>: ${value(item)} <span class="ref">(${item.reference})</span></li>`).join("")}</ul>`;
}

export const DESIGN_ASSUMPTIONS = `<ul class="assumptions">
  <li>The T-stub length L is the effective length l<sub>eff</sub> for all yield-line patterns (equal-leg T-stub, one bolt row on each side of the web, nb bolts per row at pitch L/nb).</li>
  <li>m is the distance from the web face to the bolt axis in both the model and the EN check. The model has no root fillet or weld: for a rolled section enter the EN 1993-1-8 value (Figure 6.2, measured from 0.8 r off the web face), which also stands in for the stiffness of the fillet; for a welded T-stub, from 0.8 a√2 off the web face. The edge distance is then e = b/2 − t<sub>w</sub>/2 − m, 0.8 r more than the physical one, which only matters where e &lt; 1.25 m. With the full distance from the web face the model is more flexible and gives a lower resistance.</li>
  <li>Prying is assumed (Table 6.2 modes 1 and 2 with prying). Steel strengths from EN 1993-1-1 Table 3.1 by element thickness; bolt data from the product standards.</li>
  <li>γ<sub>M0</sub> and γ<sub>M2</sub> default to the recommended values of EN 1993-1-1 / EN 1993-1-8; check the National Annex that applies to the project.</li>
</ul>`;

/** Complete design section for the report. */
export function designReportHtml(design) {
  return `${designSummaryHtml(design)}${designTableHtml(design).replace("<details class=\"intermediate\">", "<details class=\"intermediate\" open>")}${designChecksHtml(design)}<h3>Assumptions</h3>${DESIGN_ASSUMPTIONS}`;
}
