// HTML (strings) for the results of the connection checks (column base,
// steel-to-timber, timber bearing): summary with the governing utilisation,
// the table of checks with clause references, intermediate values and notes.
// No DOM access: used by the pages and by the Node tests.

const ICON = { ok: "✓", fail: "✗", warning: "!" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

const num = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : "—");

/** A force in N shown in kN; small values with two decimals. */
export function kN(valueN) {
  const value = valueN / 1000;
  return Math.abs(value) < 10 ? value.toFixed(2) : value.toFixed(1);
}

function quantity(value, unit) {
  if (unit === "N") return `${kN(value)} kN`;
  if (unit === "N/mm") return `${num(value, 0)} N/mm`;
  if (unit === "Nmm") return `${num(value / 1e6, 1)} kNm`;
  if (unit === "—") return num(value, 2);
  return `${num(value, unit === "MPa" ? 2 : 1)} ${unit}`;
}

/** One line per check: demand against resistance (or provided against required). */
function checkText(row) {
  if (row.kind === "info") return "";
  if (row.kind === "minimum") return `${quantity(row.demand, row.unit)} ≥ ${quantity(row.capacity, row.unit)}`;
  if (row.kind === "maximum") return `${quantity(row.demand, row.unit)} ≤ ${quantity(row.capacity, row.unit)}`;
  return `${quantity(row.demand, row.unit)} / ${quantity(row.capacity, row.unit)}`;
}

export function summaryHtml(result) {
  const governing = result.governing;
  const util = result.maxUtilisation;
  const statusText = result.status === "fail" ? "does not satisfy all checks" : result.status === "warning" ? "satisfies the resistance checks — see the warnings" : "satisfies all checks";
  const failing = result.checks.filter(row => row.status === "fail").length;
  const warnings = result.checks.filter(row => row.status === "warning").length;
  const bar = governing ? `
    <div class="util util-wide ${util <= 1 ? "ok" : "fail"}" role="img" aria-label="Maximum utilisation ${num(util, 2)}">
      <div class="util-fill" style="width:${Math.min(100, util * 100).toFixed(1)}%"></div>
      <span class="util-text">Maximum utilisation <strong>${num(util, 2)}</strong> — ${governing.label} <span class="ref">(${escapeHtml(governing.reference)})</span></span>
    </div>` : "";
  return `<p class="design-result status-${result.status}">The connection <strong>${statusText}</strong>${failing ? ` (${failing} failing)` : ""}${warnings ? ` · ${warnings} warning${warnings > 1 ? "s" : ""}` : ""}.</p>${bar}`;
}

export function checksTableHtml(result) {
  const groups = [];
  for (const row of result.checks) {
    let group = groups.find(item => item.title === row.group);
    if (!group) groups.push(group = { title: row.group, rows: [] });
    group.rows.push(row);
  }
  const body = groups.map(group => `
    <tr class="group"><th colspan="5" scope="colgroup">${escapeHtml(group.title)}</th></tr>
    ${group.rows.map(row => `<tr class="check-${row.status}${row === result.governing ? " governing" : ""}">
      <td class="state"><span class="icon" aria-label="${row.status}">${ICON[row.status]}</span></td>
      <th scope="row">${row.label}${row.note ? `<div class="row-note">${escapeHtml(row.note)}</div>` : ""}</th>
      <td class="num">${checkText(row)}</td>
      <td class="num">${row.kind === "info" ? "" : num(row.utilisation, 2)}</td>
      <td class="ref">${escapeHtml(row.reference)}</td></tr>`).join("")}`).join("");
  return `<div class="table-wrap"><table class="results-table check-table"><thead><tr><th></th><th>Check</th><th class="num">E<sub>d</sub> / R<sub>d</sub></th><th class="num">η</th><th>Clause</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

export function valuesHtml(result) {
  return result.values.map(group => `
    <h4>${escapeHtml(group.title)}</h4>
    <div class="table-wrap"><table class="results-table"><tbody>
      ${group.rows.map(row => `<tr><th>${row.label}</th><td class="num">${typeof row.value === "number" ? num(row.value, row.digits ?? 1) : escapeHtml(row.value)}</td><td>${escapeHtml(row.unit)}</td></tr>`).join("")}
    </tbody></table></div>`).join("");
}

export function notesHtml(result) {
  return `<ul class="assumptions">${result.notes.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
}
