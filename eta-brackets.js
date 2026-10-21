import {
  ETA_DATA, CheckList, normaliseFields, summariseChecks,
  etaProduct, etaConfiguration, bracketBeamToBeam, abr105RigidSupport, bracketUtilisation, r45Of,
  hangerResistance, hangerCheck
} from "./lib/index.js";
import { mountCheckPage } from "./check-page.js";
import { etaBracketSvg } from "./timber-special-drawings.js";

const show = mode => ({ mode: [mode] });
const fields = [
  { name: "mode", group: "Connection", label: "Check type", unit: "", kind: "select", options: ["beam-to-beam", "rigid-support", "joist-hanger", "configuration"], default: "beam-to-beam" },
  { name: "bb_product", group: "Beam-to-beam ETA tables", label: "Bracket", unit: "", kind: "select", options: ["ABR105", "ABR90"], default: "ABR105", showIf: show("beam-to-beam") },
  { name: "bb_brackets", group: "Beam-to-beam ETA tables", label: "Brackets in the connection", unit: "", kind: "integer", min: 1, max: 2, default: 2, showIf: show("beam-to-beam") },
  { name: "bb_pattern", group: "Beam-to-beam ETA tables", label: "ETA nailing pattern", unit: "", kind: "select", options: ["1", "2"], default: "1", showIf: show("beam-to-beam") },
  { name: "bb_nail", group: "Beam-to-beam ETA tables", label: "CNA nail", unit: "", kind: "select", options: ["4.0x40", "4.0x60"], default: "4.0x40", showIf: show("beam-to-beam") },
  { name: "bb_duration", group: "Beam-to-beam ETA tables", label: "Load duration", unit: "", kind: "select", options: ["P", "L", "M", "S", "I"], default: "M", showIf: show("beam-to-beam") },
  { name: "bb_serviceClass", group: "Beam-to-beam ETA tables", label: "Service class (ETA tables: 1 or 2)", unit: "", kind: "select", options: ["1", "2"], default: "1", showIf: show("beam-to-beam") },
  { name: "bb_b", group: "Beam-to-beam ETA tables", label: "Supported member width b", unit: "mm", kind: "number", min: 20, max: 600, default: 75, showIf: show("beam-to-beam") },
  { name: "bb_h", group: "Beam-to-beam ETA tables", label: "Supported member height h (e = h/2 unless e is entered)", unit: "mm", kind: "number", min: 20, max: 1200, default: 225, showIf: show("beam-to-beam") },
  { name: "bb_e", group: "Beam-to-beam ETA tables", label: "Height e of F4/F5 above support (optional)", unit: "mm", kind: "number", min: 11, max: 1000, optional: true, showIf: show("beam-to-beam") },
  { name: "bb_f", group: "Beam-to-beam ETA tables", label: "Distance f for one-bracket table (optional)", unit: "mm", kind: "number", min: 1, max: 600, optional: true, showIf: show("beam-to-beam") },
  { name: "bb_wane", group: "Beam-to-beam ETA tables", label: "Use ETA grey wane values", unit: "", kind: "checkbox", default: false, showIf: show("beam-to-beam") },
  { name: "bb_rhoK", group: "Beam-to-beam ETA tables", label: "Characteristic timber density", unit: "kg/m3", kind: "number", min: 250, max: 700, default: 350, showIf: show("beam-to-beam") },
  { name: "bb_F1", group: "Beam-to-beam design actions", label: "F1", unit: "kN", kind: "number", min: 0, max: 500, default: 2, showIf: show("beam-to-beam") },
  { name: "bb_F23", group: "Beam-to-beam design actions", label: "F2 or F3", unit: "kN", kind: "number", min: 0, max: 500, default: 1, showIf: show("beam-to-beam") },
  { name: "bb_F45", group: "Beam-to-beam design actions", label: "F4 or F5", unit: "kN", kind: "number", min: 0, max: 500, default: 0, showIf: show("beam-to-beam") },
  { name: "bb_direction45", group: "Beam-to-beam design actions", label: "F4/F5 direction", unit: "", kind: "select", options: ["min", "4", "5"], default: "min", showIf: show("beam-to-beam") },

  { name: "rs_brackets", group: "ABR105 to rigid support", label: "Brackets in the connection", unit: "", kind: "integer", min: 1, max: 2, default: 2, showIf: show("rigid-support") },
  { name: "rs_pattern", group: "ABR105 to rigid support", label: "ETA nailing pattern", unit: "", kind: "select", options: ["3", "4"], default: "3", showIf: show("rigid-support") },
  { name: "rs_nail", group: "ABR105 to rigid support", label: "CNA nail", unit: "", kind: "select", options: ["4.0x35", "4.0x40", "4.0x50", "4.0x60"], default: "4.0x40", showIf: show("rigid-support") },
  { name: "rs_duration", group: "ABR105 to rigid support", label: "Load duration", unit: "", kind: "select", options: ["P", "L", "M", "S", "I"], default: "M", showIf: show("rigid-support") },
  { name: "rs_serviceClass", group: "ABR105 to rigid support", label: "Service class (ETA tables: 1 or 2)", unit: "", kind: "select", options: ["1", "2"], default: "1", showIf: show("rigid-support") },
  { name: "rs_b", group: "ABR105 to rigid support", label: "Supported member width b", unit: "mm", kind: "number", min: 20, max: 600, default: 100, showIf: show("rigid-support") },
  { name: "rs_e", group: "ABR105 to rigid support", label: "Height e of F4/F5 above support", unit: "mm", kind: "number", min: 1, max: 1000, default: 100, showIf: show("rigid-support") },
  { name: "rs_prevented", group: "ABR105 to rigid support", label: "Supported timber prevented from rotation", unit: "", kind: "checkbox", default: false, showIf: show("rigid-support") },
  { name: "rs_rhoK", group: "ABR105 to rigid support", label: "Characteristic timber density", unit: "kg/m3", kind: "number", min: 250, max: 700, default: 350, showIf: show("rigid-support") },
  { name: "rs_F1", group: "Rigid-support design actions", label: "F1", unit: "kN", kind: "number", min: 0, max: 500, default: 2, showIf: show("rigid-support") },
  { name: "rs_F23", group: "Rigid-support design actions", label: "F2 or F3", unit: "kN", kind: "number", min: 0, max: 500, default: 1, showIf: show("rigid-support") },
  { name: "rs_F45", group: "Rigid-support design actions", label: "F4 or F5", unit: "kN", kind: "number", min: 0, max: 500, default: 0, showIf: show("rigid-support") },
  { name: "rs_direction45", group: "Rigid-support design actions", label: "F4/F5 direction", unit: "", kind: "select", options: ["min", "4", "5"], default: "min", showIf: show("rigid-support") },

  { name: "jh_nail", group: "SBE80/150 joist hanger", label: "CNA nail", unit: "", kind: "select", options: ["4.0x35", "4.0x50"], default: "4.0x35", showIf: show("joist-hanger") },
  { name: "jh_duration", group: "SBE80/150 joist hanger", label: "Load duration", unit: "", kind: "select", options: ["P", "M", "S", "I"], default: "S", showIf: show("joist-hanger") },
  { name: "jh_serviceClass", group: "SBE80/150 joist hanger", label: "Service class (1 or 2)", unit: "", kind: "select", options: ["1", "2"], default: "1", showIf: show("joist-hanger") },
  { name: "jh_joistH", group: "SBE80/150 joist hanger", label: "Joist height (optional geometry note)", unit: "mm", kind: "number", min: 40, max: 500, optional: true, default: 200, showIf: show("joist-hanger") },
  { name: "jh_joistWidth", group: "SBE80/150 joist hanger", label: "Joist width (optional geometry note)", unit: "mm", kind: "number", min: 30, max: 200, optional: true, default: 80, showIf: show("joist-hanger") },
  { name: "jh_FDown", group: "SBE80/150 design actions", label: "Downward load", unit: "kN", kind: "number", min: 0, max: 500, default: 3, showIf: show("joist-hanger") },
  { name: "jh_FUp", group: "SBE80/150 design actions", label: "Uplift", unit: "kN", kind: "number", min: 0, max: 500, default: 0, showIf: show("joist-hanger") },
  { name: "jh_FLateral", group: "SBE80/150 design actions", label: "Lateral load", unit: "kN", kind: "number", min: 0, max: 500, default: 0, showIf: show("joist-hanger") },

  { name: "cfg_product", group: "ETA configuration", label: "Bracket", unit: "", kind: "select", options: ["ABR105", "ABR90"], default: "ABR105", showIf: show("configuration") },
  { name: "cfg_support", group: "ETA configuration", label: "Support type", unit: "", kind: "select", options: ["timber", "rigid"], default: "timber", showIf: show("configuration") },
  { name: "cfg_brackets", group: "ETA configuration", label: "Brackets in the connection", unit: "", kind: "integer", min: 1, max: 2, default: 2, showIf: show("configuration") },
  { name: "cfg_aNails", group: "Flange A fasteners", label: "Nails", unit: "count", kind: "integer", min: 0, max: 20, default: 10, showIf: show("configuration") },
  { name: "cfg_aBolts", group: "Flange A fasteners", label: "Bolts", unit: "count", kind: "integer", min: 0, max: 4, default: 0, showIf: show("configuration") },
  { name: "cfg_aSsh", group: "Flange A fasteners", label: "SSH screws", unit: "count", kind: "integer", min: 0, max: 4, default: 0, showIf: show("configuration") },
  { name: "cfg_bNails", group: "Flange B fasteners", label: "Nails", unit: "count", kind: "integer", min: 0, max: 20, default: 14, showIf: show("configuration") },
  { name: "cfg_bBolts", group: "Flange B fasteners", label: "Bolts", unit: "count", kind: "integer", min: 0, max: 4, default: 0, showIf: show("configuration") },
  { name: "cfg_bSsh", group: "Flange B fasteners", label: "SSH screws", unit: "count", kind: "integer", min: 0, max: 4, default: 0, showIf: show("configuration") }
];

function payload(values, prefix) {
  return Object.fromEntries(Object.entries(values).filter(([name]) => name.startsWith(prefix)).map(([name, value]) => [name.slice(prefix.length), value]));
}
function etaPattern(product, support, pattern, brackets) {
  const productData = etaProduct(product);
  const row = productData.patterns?.[pattern];
  if (!row) throw new Error(`${product}: pattern ${pattern} is not encoded in the ETA`);
  return etaConfiguration(product, support, brackets, row.A ?? {}, row.B ?? {});
}

function normalise(raw) {
  const checked = normaliseFields(raw, fields);
  if (!checked.ok) return checked;
  const v = checked.values;
  try {
    if (v.mode === "beam-to-beam") etaPattern(v.bb_product, "timber", v.bb_pattern, v.bb_brackets);
    else if (v.mode === "rigid-support") etaPattern("ABR105", "rigid", v.rs_pattern, v.rs_brackets);
    else if (v.mode === "configuration") {
      const configuration = etaConfiguration(v.cfg_product, v.cfg_support, v.cfg_brackets,
        { nails: v.cfg_aNails, bolts: v.cfg_aBolts, ssh: v.cfg_aSsh },
        { nails: v.cfg_bNails, bolts: v.cfg_bBolts, ssh: v.cfg_bSsh });
      return { ok: true, input: { mode: v.mode, data: payload(v, "cfg_"), configuration } };
    }
    return { ok: true, input: { mode: v.mode, data: payload(v, v.mode === "beam-to-beam" ? "bb_" : v.mode === "rigid-support" ? "rs_" : "jh_") } };
  } catch (error) {
    return { ok: false, errors: [error.message] };
  }
}

function valuesForResistance(res) {
  return [
    { label: "ETA table and nailing pattern", value: `${res.table}; ${res.pattern}; ${res.nail}`, unit: "" },
    { label: "k_mod; gamma_M; density factor", value: `${res.kmod}; ${res.gammaM}; ${res.kDens}`, unit: "" },
    { label: "R1; R2/3; R4; R5", value: `${res.R1.toFixed(3)}; ${res.R23.toFixed(3)}; ${res.R4?.toFixed(3) ?? "-"}; ${res.R5?.toFixed(3) ?? "-"}`, unit: "kN" }
  ];
}
function bracketCheck(res, data, direction45, ref) {
  const f1 = data.F1, f23 = data.F23, f45 = data.F45;
  const checks = new CheckList("ETA connection resistances");
  checks.resistance("F1", "F1 against ETA R1", f1, res.R1, "kN", res.citations.R1 ?? ref);
  checks.resistance("F23", "F2/F3 against ETA R2/3", f23, res.R23, "kN", res.citations.R23 ?? ref);
  const r45 = direction45 === "4" ? res.R4 : direction45 === "5" ? res.R5 : r45Of(res);
  checks.resistance("F45", `F4/F5 against ETA ${direction45 === "min" ? "lower of R4/R5" : `R${direction45}`}`, f45, r45 ?? 0, "kN", res.citations.R45 ?? ref);
  const utilisation = bracketUtilisation(f1, f23, f45, res, direction45);
  checks.resistance("combined", "Combined loading per ETA Annex C1", utilisation, 1, "-", ref);
  for (const flag of res.flags) checks.info("eta-flag", flag, "warning", ref);
  const values = [{ title: "Design resistances from the cited ETA", rows: valuesForResistance(res) }];
  const notes = ["Only fastener patterns encoded from the ETA are accepted. Gamma_M is at least 1.3; service classes 1 and 2 are encoded.", ...res.flags];
  return { checks: checks.rows, values, notes, ...summariseChecks(checks.rows), resistance: res };
}

function check(input) {
  const { mode, data: v } = input;
  if (mode === "configuration") {
    const checks = new CheckList("ETA configuration");
    checks.info("pattern", `Accepted ETA pattern ${input.configuration.pattern}`, "ok", input.configuration.source, input.configuration.description);
    return { checks: checks.rows, values: [{ title: "Verified fastener pattern", rows: [
      { label: "Bracket / support / number", value: `${input.configuration.product} / ${input.configuration.support} / ${input.configuration.brackets}`, unit: "" },
      { label: "Pattern / table", value: `${input.configuration.pattern} / ${input.configuration.tables.join(", ")}`, unit: "" },
      { label: "Configuration source", value: input.configuration.source, unit: "" }
    ] }], notes: ["This route validates only the declared ETA fastener arrangement; it does not calculate resistance."], ...summariseChecks(checks.rows), configuration: input.configuration };
  }
  if (mode === "beam-to-beam") {
    const res = bracketBeamToBeam(v.product, v.brackets, v.duration, v.b, v.h, {
      pattern: v.pattern, nail: v.nail, ...(v.e !== undefined ? { e: v.e } : {}), ...(v.f !== undefined ? { f: v.f } : {}),
      wane: v.wane, rhoK: v.rhoK, serviceClass: Number(v.serviceClass)
    });
    const result = bracketCheck(res, { F1: v.F1, F23: v.F23, F45: v.F45 }, v.direction45, res.citations.R1);
    return { ...result, mode, resistance: res };
  }
  if (mode === "rigid-support") {
    const res = abr105RigidSupport(v.brackets, v.duration, {
      pattern: v.pattern, nail: v.nail, b: v.b, e: v.e, preventedFromRotation: v.prevented,
      rhoK: v.rhoK, serviceClass: Number(v.serviceClass)
    });
    const result = bracketCheck(res, { F1: v.F1, F23: v.F23, F45: v.F45 }, v.direction45, res.citations.R1);
    return { ...result, mode, resistance: res };
  }
  const res = hangerResistance("SBE80/150", v.duration, {
    nail: v.nail, ...(v.joistH !== undefined ? { joistH: v.joistH } : {}),
    ...(v.joistWidth !== undefined ? { joistWidth: v.joistWidth } : {}), rhoK: 350, serviceClass: Number(v.serviceClass)
  });
  const result = hangerCheck(v.FDown, v.FUp, res, v.FLateral);
  const checks = new CheckList("SBE80/150 directional resistance");
  checks.resistance("down", "Downward load against R1", v.FDown, res.R1, "kN", res.citation);
  checks.resistance("up", "Uplift against R2", v.FUp, res.R2, "kN", res.citation);
  checks.resistance("lateral", "Lateral load against the lower of R3/R4", v.FLateral, Math.min(res.R3, res.R4), "kN", res.citation);
  for (const flag of result.flags) checks.info("hanger-flag", flag, "warning", res.citation);
  const values = [{ title: "SBE80/150 cited values and design values", rows: [
    { label: "Source table / nailing", value: `${res.citation}; ${res.nailing}`, unit: "" },
    { label: "Characteristic R1; R2; R3; R4", value: `${res.Rk.R1}; ${res.Rk.R2}; ${res.Rk.R3}; ${res.Rk.R4}`, unit: "kN" },
    { label: "Design R1; R2; R3; R4", value: `${res.R1.toFixed(3)}; ${res.R2.toFixed(3)}; ${res.R3.toFixed(3)}; ${res.R4.toFixed(3)}`, unit: "kN" },
    { label: "k_mod; gamma_M", value: `${res.kmod}; ${res.gammaM}`, unit: "" }
  ] }];
  return { checks: checks.rows, values, notes: ["SBE values are characteristic values from the cited manufacturer data sheet; its declaration and ETA must match the selected product and installation.", ...result.flags], ...summariseChecks(checks.rows), mode, resistance: res, hanger: result };
}

const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const sourceUrl = key => ETA_DATA.sources[key]?.url ?? "";
function citedValuesHtml(input, result) {
  const rows = [];
  const add = (product, table, pattern, column, value, source, page) => rows.push(`<tr><th>${esc(product)} ${esc(table)} / ${esc(pattern)}</th><td>${esc(column)}</td><td class="num">${esc(value)}</td><td>${esc(source)} p. ${esc(page)}</td></tr>`);
  for (const [product, tableId] of [["ABR105", "D3-1"], ["ABR90", "D1-1"]]) {
    const p = ETA_DATA.products[product], table = p.tables[tableId], source = p.source;
    for (const duration of ["P", "L", "M", "S", "I"]) {
      const row = table.rows["1"];
      for (const nail of ["4.0x40", "4.0x60"]) {
        add(product, tableId, `pattern 1, ${nail}, ${duration}`, "R1 x k_mod", row.R1[nail][duration], source, table.page);
        add(product, tableId, `pattern 1, ${nail}, ${duration}`, "R2/3 x k_mod", row.R23[nail][duration], source, table.page);
      }
    }
  }
  const rigid = ETA_DATA.products.ABR105.tables["D3-8"];
  for (const pattern of ["3", "4"]) for (const nail of ["4.0x40", "4.0x60"]) {
    const row = rigid.rows[pattern];
    add("ABR105", "D3-8", `pattern ${pattern}, ${nail}`, "R1,k", row.R1[nail], "ETA-06/0106 Annex D3", rigid.page);
    add("ABR105", "D3-8", `pattern ${pattern}, ${nail}`, "R2/3,k", row.R23[nail], "ETA-06/0106 Annex D3", rigid.page);
  }
  const sbe = ETA_DATA.products["SBE80/150"], source = sbe.source, s = ETA_DATA.sources[source];
  for (const nail of ["4.0x35", "4.0x50"]) for (const column of ["R1", "R2", "R3", "R4"])
    add("SBE80/150", sbe.values.table, `${nail}, full nailing`, `${column}, characteristic`, sbe.values[column][nail], s.title, sbe.values.datasheet_page);
  let current = "<p>Select a connection option to see the cited values used in its check.</p>";
  if (result.resistance?.citations) {
    const res = result.resistance;
    const prod = ETA_DATA.products[res.product], sourceKey = prod?.source, url = sourceUrl(sourceKey);
    const values = [
      ["R1", res.R1, res.citations.R1], ["R2/3", res.R23, res.citations.R23],
      ["R4", res.R4, res.citations.R45], ["R5", res.R5, res.citations.R45]
    ].filter(([, value]) => value !== null && value !== undefined);
    current = `<p><strong>Active check:</strong> ${esc(res.product)} ${esc(res.table)}, pattern ${esc(res.pattern)}, ${esc(res.nail)}, ${esc(res.duration)}. Design values include the encoded factors.</p><div class="table-wrap"><table class="results-table"><thead><tr><th>Resistance</th><th>Design value</th><th>ETA citation</th></tr></thead><tbody>${values.map(([key, value, cite]) => `<tr><th>${esc(key)}</th><td class="num">${Number(value).toFixed(3)} kN</td><td>${esc(cite ?? "")}</td></tr>`).join("")}</tbody></table></div>${url ? `<p><a href="${esc(url)}" target="_blank" rel="noreferrer">Open cited source</a></p>` : ""}`;
  } else if (result.resistance?.citation) {
    const r = result.resistance, sbeSource = ETA_DATA.sources["SST-SBE-NL"];
    current = `<p><strong>Active check:</strong> ${esc(r.citation)}. These SBE values are from the product data sheet, not an ETA table.</p><div class="table-wrap"><table class="results-table"><thead><tr><th>Value</th><th>Characteristic</th><th>Design</th></tr></thead><tbody>${["R1", "R2", "R3", "R4"].map(key => `<tr><th>${key}</th><td class="num">${r.Rk[key].toFixed(3)} kN</td><td class="num">${r[key].toFixed(3)} kN</td></tr>`).join("")}</tbody></table></div><p><a href="${esc(sbeSource.url)}" target="_blank" rel="noreferrer">Open SBE manufacturer data and current certification links</a></p>`;
  } else if (result.configuration) {
    current = `<p><strong>Active check:</strong> ${esc(result.configuration.source)}; accepted pattern ${esc(result.configuration.pattern)}.</p>`;
  }
  const firstSource = ETA_DATA.sources["ETA-06/0106"];
  const staticTable = `<div class="table-wrap"><table class="results-table"><thead><tr><th>Product / table / row</th><th>Column</th><th>Tabulated value</th><th>Source</th></tr></thead><tbody>${rows.map(row => row).join("")}</tbody></table></div><p><a href="${esc(firstSource.url)}" target="_blank" rel="noreferrer">ETA-06/0106, issued ${esc(firstSource.issued)}</a>; ABR105 and ABR90 values are transcribed from Annex D3 and D1. The SBE80/150 values shown above come from the linked manufacturer data sheet, not an ETA table. The packaged ETA-06/0270 source record is the 2018 issue; the manufacturer currently lists Revision 9 from 2024, so check that revision before using the SBE values.</p>`;
  return `${current}<details><summary>Encoded source table values for ABR105, ABR90 and SBE80/150</summary>${staticTable}</details>`;
}

mountCheckPage({
  fields,
  normalise,
  check,
  drawings: (input, result) => {
    const target = document.querySelector("[data-eta-values]");
    if (target) target.innerHTML = citedValuesHtml(input, result);
    return etaBracketSvg(input, result);
  }
});
