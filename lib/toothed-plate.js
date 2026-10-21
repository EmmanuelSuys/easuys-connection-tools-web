/**
 * Toothed-plate connectors in a single-shear timber-to-timber connection, EN 1995-1-1:2004+A1:2008 8.10:
 * F_v,Rk = 18 k1 k2 k3 dc^1.5 (C1-C9) or 25 k1 k2 k3 dc^1.5 (C10-C11) (8.72) per connector, plus the connecting
 * bolts per 8.5 (Johansen single shear (8.6), with the optional capped rope effect), summed (8.10(1)). The bolt part
 * applies the effective number n_ef from (8.34)-(8.35), including linear interpolation by load angle, and angle
 * dependent embedment strength from (8.31)-(8.33). These corrections are implemented directly from EN; the Python
 * and API routes do not include all of them:
 *
 * - k1 = min(1; min(t1, t2)/(3 h_e)) (8.73, both members are side members in single shear);
 * - k2 = min(1; a3,t/(1.5 dc)) for C1-C9 (8.74), min(1; a3,t/(2.0 dc)) for C10-C11 (8.76);
 * - k3 = min(1.5; rho_k/350) with the lower rho_k of the two members (8.78);
 * - bolt embedment strength at the load angle (8.31)-(8.33), M_y,Rk = 0.3 f_u,k d^2.6 (8.30);
 * - n_ef from (8.34)-(8.35), and rope effect in Johansen modes c-f only: min(F_ax,Rk/4, 25% of the Johansen mode)
 *   for bolts, zero for dowels (8.2.2(2)); unknown F_ax,Rk means zero rope effect;
 * - k_mod = sqrt(k_mod,1 k_mod,2) when the two members differ (2.6);
 * - minimum spacings and distances of the source (a1 (1.2 + 0.3|cos a|) dc, a2 1.2 dc, a3,t max(1.5 dc; 7d;
 *   80 mm), a3,c 1.2 dc, a4,t (0.6 + 0.2|sin a|) dc, a4,c 0.6 dc) as fail rows, not refusals.
 *
 * Not applied: a group effect for the toothed plates themselves, the minimum member thickness
 * for the tooth depth, washers. Input forces in kN, everything else N, mm, MPa.
 */
import { CheckList, normaliseFields, summariseChecks } from "./checks.js";
import { LOAD_DURATIONS, kmodOf } from "./eurocode-data.js";
import { GAMMA_M_CONNECTIONS } from "./axial-screw.js";
export const TIMBER_KINDS = ["softwood", "glulam", "LVL", "hardwood"];
/** EN 1995-1-1 (8.33): k_90 of bolts and dowels. */
export function k90Of(kind, d) {
    if (kind === "softwood" || kind === "glulam")
        return 1.35 + 0.015 * d;
    if (kind === "LVL")
        return 1.3 + 0.015 * d;
    return 0.9 + 0.015 * d;
}
/** Bolt embedment strength at angle alpha to the grain, EN 1995-1-1 (8.31)-(8.33), MPa. */
export function boltEmbedmentAtAngle(rhoK, d, kind, alphaDeg) {
    const alpha = alphaDeg * Math.PI / 180;
    const k90 = k90Of(kind, d);
    return 0.082 * (1 - 0.01 * d) * rhoK / (k90 * Math.sin(alpha) ** 2 + Math.cos(alpha) ** 2);
}
/**
 * Johansen single shear timber-to-timber, EN 1995-1-1 (8.6) a-f, plus the permitted rope effect, per fastener (N).
 * fh1, fh2 embedment strengths of member 1 (t1) and 2 (t2), My yield moment (N mm).
 */
export function boltGroupEffectiveNumber(n, a1, d, alphaDeg) {
    if (!Number.isInteger(n) || !(n > 0) || !(a1 > 0) || !(d > 0) || !Number.isFinite(alphaDeg) || alphaDeg < 0 || alphaDeg > 90)
        throw new Error("n, a1 and d must be positive and alpha must be in 0..90 degrees");
    if (n === 1)
        return { parallel: 1, effective: 1 };
    const parallel = Math.min(n, n ** 0.9 * (a1 / (13 * d)) ** 0.25);
    return { parallel, effective: parallel + (n - parallel) * alphaDeg / 90 };
}
/** EN 1995-1-1 (8.2.2(2)): known axial resistance may add rope effect, capped by fastener type. */
export function ropeEffectContribution(fastener, faxRk, johansen) {
    if (!Number.isFinite(johansen) || johansen < 0 || (faxRk !== undefined && (!Number.isFinite(faxRk) || faxRk < 0)))
        throw new Error("Fax,Rk and Johansen resistance must be finite and non-negative");
    if (faxRk === undefined || faxRk <= 0 || fastener === "dowel")
        return 0;
    return Math.min(faxRk / 4, 0.25 * johansen);
}
export function singleShearTimberTimber(fh1, fh2, t1, t2, d, My, options = {}) {
    const beta = fh2 / fh1;
    const r = t2 / t1;
    const a = fh1 * t1 * d;
    const b = fh2 * t2 * d;
    const c = fh1 * t1 * d / (1 + beta) * (Math.sqrt(beta + 2 * beta ** 2 * (1 + r + r * r) + beta ** 3 * r * r) - beta * (1 + r));
    const dd = 1.05 * fh1 * t1 * d / (2 + beta) * (Math.sqrt(2 * beta * (1 + beta) + 4 * beta * (2 + beta) * My / (fh1 * d * t1 * t1)) - beta);
    const e = 1.05 * fh1 * t2 * d / (1 + 2 * beta) * (Math.sqrt(2 * beta ** 2 * (1 + beta) + 4 * beta * (1 + 2 * beta) * My / (fh1 * d * t2 * t2)) - beta);
    const f = 1.15 * Math.sqrt(2 * beta / (1 + beta)) * Math.sqrt(2 * My * fh1 * d);
    const johansenModes = { a, b, c, d: dd, e, f, beta };
    const rope = (value) => ropeEffectContribution(options.fastener ?? "bolt", options.faxRk, value);
    const ropeModes = { a: 0, b: 0, c: rope(c), d: rope(dd), e: rope(e), f: rope(f), beta: 0 };
    const modes = { a: a + ropeModes.a, b: b + ropeModes.b, c: c + ropeModes.c, d: dd + ropeModes.d, e: e + ropeModes.e, f: f + ropeModes.f, beta };
    const keys = ["a", "b", "c", "d", "e", "f"];
    const mode = keys.reduce((best, key) => (modes[key] < modes[best] ? key : best));
    return { FvRk: modes[mode], mode, modes, johansenModes, ropeModes };
}
const MEMBERS = "Timber members";
const CONNECTORS = "Connectors and bolts";
const GEOMETRY = "Spacings and distances";
const ACTION = "Design action and factors";
export const TOOTHED_PLATE_FIELDS = [
    { name: "faxRk", group: CONNECTORS, label: "Known characteristic axial bolt resistance (empty: zero rope effect)", unit: "kN", kind: "number", min: 0, max: 1000, optional: true, default: 0 },
    { name: "t1", group: MEMBERS, label: "<b>t<sub>1</sub></b> — thickness of member 1", unit: "mm", kind: "number", min: 10, max: 500, default: 80 },
    { name: "t2", group: MEMBERS, label: "<b>t<sub>2</sub></b> — thickness of member 2", unit: "mm", kind: "number", min: 10, max: 500, default: 80 },
    { name: "timberType1", group: MEMBERS, label: "Member 1 (k<sub>90</sub>)", unit: "", kind: "select", options: TIMBER_KINDS, default: "softwood" },
    { name: "timberType2", group: MEMBERS, label: "Member 2 (k<sub>90</sub>)", unit: "", kind: "select", options: TIMBER_KINDS, default: "softwood" },
    { name: "rhoK1", group: MEMBERS, label: "<b>ρ<sub>k,1</sub></b> — characteristic density, member 1", unit: "kg/m³", kind: "number", min: 250, max: 900, default: 350 },
    { name: "rhoK2", group: MEMBERS, label: "<b>ρ<sub>k,2</sub></b> — characteristic density, member 2", unit: "kg/m³", kind: "number", min: 250, max: 900, default: 350 },
    { name: "serviceClass1", group: MEMBERS, label: "Service class, member 1", unit: "", kind: "select", options: ["1", "2", "3"], default: "1" },
    { name: "serviceClass2", group: MEMBERS, label: "Service class, member 2", unit: "", kind: "select", options: ["1", "2", "3"], default: "1" },
    { name: "connectorType", group: CONNECTORS, label: "Connector type (EN 912)", unit: "", kind: "select", options: ["C1-C9", "C10-C11"], default: "C1-C9" },
    { name: "n", group: CONNECTORS, label: "<b>n</b> — connectors (one per bolt)", unit: "—", kind: "integer", min: 1, max: 50, default: 4 },
    { name: "dc", group: CONNECTORS, label: "<b>d<sub>c</sub></b> — connector diameter (or side length)", unit: "mm", kind: "number", min: 30, max: 200, default: 75 },
    { name: "he", group: CONNECTORS, label: "<b>h<sub>e</sub></b> — tooth penetration depth", unit: "mm", kind: "number", min: 2, max: 40, default: 17 },
    { name: "d", group: CONNECTORS, label: "<b>d</b> — bolt diameter", unit: "mm", kind: "number", min: 6, max: 30, default: 12 },
    { name: "fuk", group: CONNECTORS, label: "<b>f<sub>u,k</sub></b> — bolt tensile strength", unit: "MPa", kind: "number", min: 300, max: 1200, default: 500 },
    { name: "alpha", group: GEOMETRY, label: "<b>α</b> — angle between force and grain", unit: "°", kind: "number", min: 0, max: 90, default: 0 },
    { name: "a1", group: GEOMETRY, label: "<b>a<sub>1</sub></b> — spacing parallel to the grain", unit: "mm", kind: "number", min: 0, max: 2000, default: 140 },
    { name: "a2", group: GEOMETRY, label: "<b>a<sub>2</sub></b> — spacing perpendicular to the grain", unit: "mm", kind: "number", min: 0, max: 2000, default: 95 },
    { name: "a3t", group: GEOMETRY, label: "<b>a<sub>3,t</sub></b> — loaded end distance", unit: "mm", kind: "number", min: 0, max: 2000, default: 120 },
    { name: "a3c", group: GEOMETRY, label: "<b>a<sub>3,c</sub></b> — unloaded end distance", unit: "mm", kind: "number", min: 0, max: 2000, default: 95 },
    { name: "a4t", group: GEOMETRY, label: "<b>a<sub>4,t</sub></b> — loaded edge distance", unit: "mm", kind: "number", min: 0, max: 2000, default: 50 },
    { name: "a4c", group: GEOMETRY, label: "<b>a<sub>4,c</sub></b> — unloaded edge distance", unit: "mm", kind: "number", min: 0, max: 2000, default: 50 },
    { name: "FvEd", group: ACTION, label: "<b>F<sub>v,Ed</sub></b> — shear force on the connection", unit: "kN", kind: "number", min: 0, max: 5000, default: 40 },
    { name: "loadDuration", group: ACTION, label: "Load-duration class (k<sub>mod</sub>)", unit: "", kind: "select", options: LOAD_DURATIONS, default: "medium-term" },
    { name: "gammaM", group: ACTION, label: "<b>γ<sub>M</sub></b> — connections (EN 1995-1-1 Table 2.3: 1.3; never lower)", unit: "—", kind: "number", min: GAMMA_M_CONNECTIONS, max: 3, default: GAMMA_M_CONNECTIONS, fallback: true }
];
export function normaliseToothedPlateInput(raw) {
    const checked = normaliseFields(raw, TOOTHED_PLATE_FIELDS);
    if (!checked.ok)
        return checked;
    return { ok: true, input: checked.values };
}
/** Minimum spacings and distances of the source (see the module comment). */
export function toothedPlateMinimumDistances(type, dc, d, alphaDeg) {
    const alpha = alphaDeg * Math.PI / 180;
    const a3t = type === "C1-C9" ? Math.max(1.5 * dc, 1.1 * d, 7 * d, 80) : Math.max(1.5 * dc, 7 * d, 80);
    return {
        a1: (1.2 + 0.3 * Math.abs(Math.cos(alpha))) * dc,
        a2: 1.2 * dc,
        a3t,
        a3c: 1.2 * dc,
        a4t: (0.6 + 0.2 * Math.abs(Math.sin(alpha))) * dc,
        a4c: 0.6 * dc
    };
}
const MODE_TEXT = { a: "a (embedment, member 1)", b: "b (embedment, member 2)", c: "c (embedment, both)", d: "d (one hinge, member 1)", e: "e (one hinge, member 2)", f: "f (two hinges)" };
export function checkToothedPlate(input) {
    const g = input;
    const kN = 1000;
    const kmod1 = kmodOf(g.serviceClass1, g.loadDuration);
    const kmod2 = kmodOf(g.serviceClass2, g.loadDuration);
    const kmod = kmod1 !== kmod2 ? Math.sqrt(kmod1 * kmod2) : kmod1;
    const k1 = Math.min(1, Math.min(g.t1, g.t2) / (3 * g.he));
    const k2 = g.connectorType === "C1-C9" ? Math.min(g.a3t / (1.5 * g.dc), 1) : Math.min(g.a3t / (2 * g.dc), 1);
    const k3 = Math.min(Math.min(g.rhoK1, g.rhoK2) / 350, 1.5);
    const constant = g.connectorType === "C1-C9" ? 18 : 25;
    const FvRkPlate = constant * k1 * k2 * k3 * g.dc ** 1.5;
    const RdPlate = kmod * FvRkPlate * g.n / g.gammaM;
    const My = 0.3 * g.fuk * g.d ** 2.6;
    const fh1 = boltEmbedmentAtAngle(g.rhoK1, g.d, g.timberType1, g.alpha);
    const fh2 = boltEmbedmentAtAngle(g.rhoK2, g.d, g.timberType2, g.alpha);
    const bolt = singleShearTimberTimber(fh1, fh2, g.t1, g.t2, g.d, My, { faxRk: g.faxRk === undefined ? undefined : g.faxRk * kN, fastener: "bolt" });
    const boltNef = boltGroupEffectiveNumber(g.n, g.a1, g.d, g.alpha);
    const RdBolt = kmod * bolt.FvRk * boltNef.effective / g.gammaM;
    const Rd = RdPlate + RdBolt;
    const FvEd = g.FvEd * kN;
    const minimum = toothedPlateMinimumDistances(g.connectorType, g.dc, g.d, g.alpha);
    const checks = new CheckList("Connection — EN 1995-1-1 8.10");
    checks.resistance("connection", "Shear: F<sub>v,Ed</sub> ≤ R<sub>d,plates</sub> + R<sub>d,bolts</sub>", FvEd, Rd, "N", "EN 1995-1-1 8.10(1), (8.72), (8.6)");
    checks.setGroup(`Spacings and distances — ${g.connectorType}`);
    const rows = [["a1", "a<sub>1</sub> ≥ (1.2 + 0.3|cos α|) d<sub>c</sub>"], ["a2", "a<sub>2</sub> ≥ 1.2 d<sub>c</sub>"],
        ["a3t", "a<sub>3,t</sub> ≥ max(1.5 d<sub>c</sub>; 7d; 80 mm)"], ["a3c", "a<sub>3,c</sub> ≥ 1.2 d<sub>c</sub>"],
        ["a4t", "a<sub>4,t</sub> ≥ (0.6 + 0.2|sin α|) d<sub>c</sub>"], ["a4c", "a<sub>4,c</sub> ≥ 0.6 d<sub>c</sub>"]];
    for (const [key, label] of rows)
        checks.minimum(key, label, g[key], minimum[key], "mm", g.connectorType === "C1-C9" ? "EN 1995-1-1 Table 8.8 (as in the source)" : "EN 1995-1-1 Table 8.9 (as in the source)");
    const geometryOk = rows.every(([key]) => g[key] >= minimum[key] - 1e-9);
    const values = [
        { title: "Toothed plates — EN 1995-1-1 8.10", rows: [
                { label: `k<sub>mod,1</sub>; k<sub>mod,2</sub>; k<sub>mod</sub>${kmod1 !== kmod2 ? " = √(k<sub>mod,1</sub> k<sub>mod,2</sub>)" : ""}`, value: `${kmod1}; ${kmod2}; ${kmod.toFixed(4)}`, unit: "—" },
                { label: "k<sub>1</sub> = min(1; min(t<sub>1</sub>, t<sub>2</sub>) / (3 h<sub>e</sub>)) (8.73)", value: k1, unit: "—", digits: 4 },
                { label: `k<sub>2</sub> = min(1; a<sub>3,t</sub> / (${g.connectorType === "C1-C9" ? "1.5" : "2.0"} d<sub>c</sub>)) (${g.connectorType === "C1-C9" ? "8.74" : "8.76"})`, value: k2, unit: "—", digits: 4 },
                { label: "k<sub>3</sub> = min(1.5; ρ<sub>k,min</sub> / 350) (8.78)", value: k3, unit: "—", digits: 4 },
                { label: `F<sub>v,Rk</sub> = ${constant} k<sub>1</sub> k<sub>2</sub> k<sub>3</sub> d<sub>c</sub><sup>1.5</sup> per connector (8.72)`, value: FvRkPlate / kN, unit: "kN", digits: 3 },
                { label: "R<sub>d,plates</sub> = k<sub>mod</sub> n F<sub>v,Rk</sub> / γ<sub>M</sub>", value: RdPlate / kN, unit: "kN", digits: 2 }
            ] },
        { title: "Connecting bolts — EN 1995-1-1 8.5, (8.6)", rows: [
                { label: "M<sub>y,Rk</sub> = 0.3 f<sub>u,k</sub> d<sup>2.6</sup> (8.30)", value: My, unit: "N mm", digits: 0 },
                { label: "f<sub>h,1,k</sub>; f<sub>h,2,k</sub> = 0.082 (1 − 0.01 d) ρ<sub>k</sub> / k<sub>90</sub> (perpendicular to the grain)", value: `${fh1.toFixed(3)}; ${fh2.toFixed(3)}`, unit: "MPa" },
                { label: "F<sub>v,Rk</sub> modes a; b; c; d; e; f per bolt", value: ["a", "b", "c", "d", "e", "f"].map(key => (bolt.modes[key] / kN).toFixed(2)).join("; "), unit: "kN" },
                { label: `F<sub>v,Rk</sub> per bolt, mode ${MODE_TEXT[bolt.mode]}`, value: bolt.FvRk / kN, unit: "kN", digits: 3 },
                { label: "R<sub>d,bolts</sub> = k<sub>mod</sub> n F<sub>v,Rk</sub> / γ<sub>M</sub>", value: RdBolt / kN, unit: "kN", digits: 2 },
                { label: "R<sub>d</sub> = R<sub>d,plates</sub> + R<sub>d,bolts</sub>", value: Rd / kN, unit: "kN", digits: 2 }
            ] }
    ];
    const notes = [
        "EN 1995-1-1:2004+A1:2008 8.10: single shear, timber to timber; one toothed-plate connector per bolt; plate and bolt resistances added (8.10(1)).",
        "Bolt embedment strength perpendicular to the grain in both members, whatever the load angle (conservative, as in the source); no rope effect.",
        "Minimum spacings and distances as in the source script; spacings below the minimum fail the check, they are not refused.",
        "Not covered: group effect of several connectors or bolts in a row parallel to the grain, minimum member thickness for the tooth depth, washers (10.4.3), the members themselves.",
        "γ_M and the k_mod table are the recommended EN values; check the National Annex that applies to the project."
    ];
    const boltValues = values.find(group => group.title.startsWith("Connecting bolts"));
    if (boltValues)
        for (const row of boltValues.rows) {
            if (row.label.startsWith("f<sub>h,1,k</sub>"))
                row.label = "f<sub>h,alpha,k</sub> = 0.082 (1 - 0.01 d) rho_k / (k_90 sin^2 alpha + cos^2 alpha) (8.31)-(8.33)";
            if (row.label.startsWith("F<sub>v,Rk</sub> modes"))
                row.label = "F<sub>v,Rk</sub> modes a; b; c; d; e; f, including capped rope effect";
            if (row.label.startsWith("R<sub>d,bolts</sub>"))
                row.label = "R<sub>d,bolts</sub> = k<sub>mod</sub> n<sub>ef</sub> F<sub>v,Rk</sub> / gamma_M";
        }
    values.unshift({ title: "Bolt row effects - EN 1995-1-1 8.5.1.1(4)-(5), 8.2.2(2)", rows: [
            { label: "n_ef parallel from min(n, n^0.9 (a1 / 13d)^0.25); linear interpolation to n at 90 degrees", value: `${boltNef.parallel.toFixed(3)}; ${boltNef.effective.toFixed(3)}`, unit: "-" },
            { label: "Selected Johansen mode; base resistance; capped rope contribution per bolt", value: `${bolt.mode}; ${(bolt.johansenModes[bolt.mode] / kN).toFixed(3)}; ${(bolt.ropeModes[bolt.mode] / kN).toFixed(3)}`, unit: "kN" },
            { label: "Known F_ax,Rk per bolt; empty input means unknown and zero rope effect", value: g.faxRk ?? 0, unit: "kN" }
        ] });
    notes[1] = "Bolt embedment strength uses the EN 1995-1-1 angle formula (8.31)-(8.33). The effective bolt count follows (8.34)-(8.35), interpolating linearly to n for perpendicular loading. Rope effect is min(F_ax,Rk/4, 25% of the Johansen part) for bolts and zero for dowels; if F_ax,Rk is unknown it is zero (8.2.2(2)).";
    notes[2] = "Minimum toothed-plate spacings and distances are checked; the bolt-row effective number uses a1 and alpha. Spacings below a minimum fail the check, they are not refused.";
    notes[3] = "Not covered: separate plate-row group effect, minimum member thickness for the tooth depth, washer bearing (10.4.3), splitting from inclined forces, the members themselves.";
    return {
        checks: checks.rows, values, notes, ...summariseChecks(checks.rows),
        kmod1, kmod2, kmod, k1, k2, k3, FvRkPlate, RdPlate, My, fh1, fh2, FvRkBolt: bolt.FvRk, boltMode: bolt.mode,
        boltModes: bolt.modes, boltRopeModes: bolt.ropeModes, boltNef: boltNef.effective, boltNefParallel: boltNef.parallel, RdBolt, Rd, minimum, geometryOk
    };
}
