/**
 * Bearing of a timber beam or joist on its support: compression
 * perpendicular to the grain (EN 1995-1-1 6.1.5, A1:2008) and the support
 * under the bearing: masonry under a concentrated load (EN 1996-1-1 6.1.3),
 * concrete (EN 1992-1-1 6.7 with α = 1) or a steel plate or flange (not
 * checked here).
 *
 * Geometry along the beam: the bearing of length l starts at a distance a
 * from the member end (a = 0: the beam ends at the bearing edge); l1 is the
 * clear distance to the next bearing or concentrated load on the other side.
 * In a wall pocket, l is the bearing depth into the wall and b the beam width
 * along the wall. Input forces in kN, everything else N, mm, MPa.
 */
import { CheckList, normaliseFields, summariseChecks } from "./checks.js";
import { CONCRETE_CLASSES, LOAD_DURATIONS, TIMBER_CLASSES, kmodOf } from "./eurocode-data.js";
const BEAM = "Timber member";
const BEARING = "Bearing";
const SUPPORT = "Support";
const ACTION = "Design action and factors";
export const TIMBER_BEARING_FIELDS = [
    { name: "timberClass", group: BEAM, label: "Strength class", unit: "", kind: "select", options: Object.keys(TIMBER_CLASSES), default: "C24" },
    { name: "b", group: BEAM, label: "<b>b</b> — width at the bearing", unit: "mm", kind: "number", min: 20, max: 600, default: 75 },
    { name: "h", group: BEAM, label: "<b>h</b> — depth", unit: "mm", kind: "number", min: 20, max: 2500, default: 225 },
    { name: "supportType", group: BEAM, label: "Member on (EN 1995-1-1 Figure 6.2)", unit: "", kind: "select", options: ["discrete", "continuous"], default: "discrete" },
    { name: "l", group: BEARING, label: "<b>l</b> — bearing length along the grain", unit: "mm", kind: "number", min: 10, max: 2000, default: 120 },
    { name: "a", group: BEARING, label: "<b>a</b> — member end beyond the bearing (0: ends at the bearing)", unit: "mm", kind: "number", min: 0, max: 5000, default: 0 },
    { name: "l1", group: BEARING, label: "<b>l<sub>1</sub></b> — clear distance to the next bearing or point load (empty: far)", unit: "mm", kind: "number", min: 0, max: 50000, optional: true },
    { name: "kc90One", group: BEARING, label: "Take k<sub>c,90</sub> = 1.0 (conservative)", unit: "", kind: "checkbox", default: false },
    { name: "support", group: SUPPORT, label: "Support", unit: "", kind: "select", options: ["masonry", "concrete", "steel"], default: "masonry" },
    { name: "fk", group: SUPPORT, label: "<b>f<sub>k</sub></b> — characteristic compressive strength of the masonry", unit: "MPa", kind: "number", min: 0.5, max: 30, default: 3.5, showIf: { support: ["masonry"] } },
    { name: "gammaMm", group: SUPPORT, label: "<b>γ<sub>M</sub></b> — masonry", unit: "—", kind: "number", min: 1, max: 3.5, default: 2.5, showIf: { support: ["masonry"] } },
    { name: "tWall", group: SUPPORT, label: "<b>t</b> — wall thickness", unit: "mm", kind: "number", min: 50, max: 1500, default: 220, showIf: { support: ["masonry"] } },
    { name: "hc", group: SUPPORT, label: "<b>h<sub>c</sub></b> — wall height up to the bearing", unit: "mm", kind: "number", min: 200, max: 30000, default: 2800, showIf: { support: ["masonry"] } },
    { name: "a1", group: SUPPORT, label: "<b>a<sub>1</sub></b> — wall end to the bearing (empty: far)", unit: "mm", kind: "number", min: 0, max: 50000, optional: true, showIf: { support: ["masonry"] } },
    { name: "group1", group: SUPPORT, label: "Group 1 units, solid under the bearing (else β = 1)", unit: "", kind: "checkbox", default: true, showIf: { support: ["masonry"] } },
    { name: "concrete", group: SUPPORT, label: "Concrete class", unit: "", kind: "select", options: Object.keys(CONCRETE_CLASSES), default: "C25/30", showIf: { support: ["concrete"] } },
    { name: "alphaCC", group: SUPPORT, label: "<b>α<sub>cc</sub></b>", unit: "—", kind: "number", min: 0.8, max: 1, default: 1.0, fallback: true, showIf: { support: ["concrete"] } },
    { name: "gammaC", group: SUPPORT, label: "<b>γ<sub>c</sub></b>", unit: "—", kind: "number", min: 1, max: 2, default: 1.5, fallback: true, showIf: { support: ["concrete"] } },
    { name: "FEd", group: ACTION, label: "<b>F<sub>c,90,Ed</sub></b> — support reaction", unit: "kN", kind: "number", min: 0, max: 5000, default: 8 },
    { name: "serviceClass", group: ACTION, label: "Service class", unit: "", kind: "select", options: ["1", "2", "3"], default: "1" },
    { name: "loadDuration", group: ACTION, label: "Load-duration class (k<sub>mod</sub>)", unit: "", kind: "select", options: LOAD_DURATIONS, default: "medium-term" },
    { name: "gammaM", group: ACTION, label: "<b>γ<sub>M</sub></b> — timber (EN 1995-1-1 Table 2.3: 1.3 solid, 1.25 glulam)", unit: "—", kind: "number", min: 1, max: 2, default: 1.3, fallback: true }
];
export function normaliseTimberBearingInput(raw) {
    const checked = normaliseFields(raw, TIMBER_BEARING_FIELDS);
    if (!checked.ok)
        return checked;
    const input = checked.values;
    const errors = [];
    if (input.support === "masonry" && input.l > input.tWall)
        errors.push(`l must not exceed the wall thickness t = ${input.tWall} mm`);
    return errors.length ? { ok: false, errors } : { ok: true, input };
}
export function checkTimberBearing(input) {
    const g = input;
    const kN = 1000;
    const FEd = g.FEd * kN;
    const timber = TIMBER_CLASSES[g.timberClass];
    const kmod = kmodOf(g.serviceClass, g.loadDuration);
    const fc90d = kmod * timber.fc90k / g.gammaM;
    const l1 = g.l1 ?? Infinity;
    // ---- EN 1995-1-1 6.1.5(1): l_ef = l + 30 mm on each side, not more than a, l or l1/2
    const extEnd = Math.min(30, g.a, g.l);
    const extInner = Math.min(30, g.l, l1 / 2);
    const lef = g.l + extEnd + extInner;
    const Aef = g.b * lef;
    // ---- k_c,90: 6.1.5(4)-(6)
    let kc90 = 1.0;
    let kc90Reason = "6.1.5(4): k_c,90 = 1.0";
    if (g.kc90One)
        kc90Reason = "taken as 1.0 (input)";
    else if (l1 < 2 * g.h)
        kc90Reason = "l1 < 2h: k_c,90 = 1.0";
    else if (g.supportType === "continuous") {
        kc90 = timber.kind === "glulam" ? 1.5 : 1.25;
        kc90Reason = `6.1.5(5): member on continuous supports, ${timber.kind === "glulam" ? "glued laminated" : "solid"} softwood`;
    }
    else if (timber.kind === "solid") {
        kc90 = 1.5;
        kc90Reason = "6.1.5(6): member on discrete supports, solid softwood";
    }
    else if (g.l <= 400) {
        kc90 = 1.75;
        kc90Reason = "6.1.5(6): member on discrete supports, glued laminated softwood, l ≤ 400 mm";
    }
    else
        kc90Reason = "glued laminated, l > 400 mm: k_c,90 = 1.0";
    const sigma = FEd / Aef;
    const FRdTimber = kc90 * fc90d * Aef;
    const checks = new CheckList("Timber — EN 1995-1-1");
    checks.resistance("timber-c90", "Compression perpendicular to the grain: σ<sub>c,90,d</sub> ≤ k<sub>c,90</sub> f<sub>c,90,d</sub>", FEd, FRdTimber, "N", "EN 1995-1-1 6.1.5 (6.3)");
    const values = [
        { title: "Timber — EN 1995-1-1 6.1.5", rows: [
                { label: `${g.timberClass}: f<sub>c,90,k</sub>; k<sub>mod</sub> (service class ${g.serviceClass}, ${g.loadDuration}); γ<sub>M</sub>`, value: `${timber.fc90k}; ${kmod}; ${g.gammaM}`, unit: "MPa; —; —" },
                { label: "f<sub>c,90,d</sub> = k<sub>mod</sub> f<sub>c,90,k</sub> / γ<sub>M</sub>", value: fc90d, unit: "MPa", digits: 3 },
                { label: "l<sub>ef</sub> = l + min(30, a, l) + min(30, l, l<sub>1</sub>/2)", value: `${g.l} + ${extEnd.toFixed(0)} + ${extInner.toFixed(0)} = ${lef.toFixed(0)}`, unit: "mm" },
                { label: "A<sub>ef</sub> = b l<sub>ef</sub>", value: Aef, unit: "mm²", digits: 0 },
                { label: `k<sub>c,90</sub> (${kc90Reason})`, value: kc90, unit: "—", digits: 2 },
                { label: "σ<sub>c,90,d</sub> = F / A<sub>ef</sub>; F<sub>Rd</sub> = k<sub>c,90</sub> f<sub>c,90,d</sub> A<sub>ef</sub>", value: `${sigma.toFixed(3)} MPa; ${(FRdTimber / kN).toFixed(2)} kN`, unit: "" }
            ] }
    ];
    let masonry;
    let concrete;
    if (g.support === "masonry") {
        // ---- EN 1996-1-1 6.1.3: N_Rdc = β A_b f_d
        const t = g.tWall, hc = g.hc, a1 = g.a1 ?? Infinity;
        const fd = g.fk / g.gammaMm;
        const Ab = g.b * g.l;
        const spread = hc / 2 * Math.tan(Math.PI / 6);
        const lefm = g.b + Math.min(a1, spread) + spread;
        const AefWall = lefm * t;
        const ratio = Math.min(Ab / AefWall, 0.45);
        let beta = 1.0;
        if (g.group1) {
            const upper = Math.min(1.25 + a1 / (2 * hc), 1.5);
            const formula = Number.isFinite(a1) ? (1 + 0.3 * a1 / hc) * (1.5 - 1.1 * ratio) : Infinity;
            beta = Math.min(Math.max(formula, 1.0), upper);
        }
        const NRdc = beta * Ab * fd;
        const eccentricity = t / 2 - g.l / 2;
        masonry = { fd, Ab, lefm, Aef: AefWall, ratio, beta, NRdc, eccentricity };
        checks.setGroup("Masonry — EN 1996-1-1");
        checks.resistance("masonry", "Concentrated load on the wall: N<sub>Ed</sub> ≤ N<sub>Rdc</sub> = β A<sub>b</sub> f<sub>d</sub>", FEd, NRdc, "N", "EN 1996-1-1 6.1.3");
        checks.maximum("masonry-eccentricity", "Eccentricity of the bearing from the wall centre line, t/2 − l/2 ≤ t/4", eccentricity, t / 4, "mm", "EN 1996-1-1 6.1.3(4)", "warning");
        values.push({ title: "Masonry — EN 1996-1-1 6.1.3", rows: [
                { label: "f<sub>d</sub> = f<sub>k</sub> / γ<sub>M</sub>", value: fd, unit: "MPa", digits: 3 },
                { label: "A<sub>b</sub> = b l (bearing area)", value: Ab, unit: "mm²", digits: 0 },
                { label: "l<sub>efm</sub> = b + spread at 60° to mid-height of the wall (one side limited by a<sub>1</sub>)", value: lefm, unit: "mm", digits: 0 },
                { label: "A<sub>b</sub> / A<sub>ef</sub> (≤ 0.45), A<sub>ef</sub> = l<sub>efm</sub> t", value: ratio, unit: "—", digits: 4 },
                { label: g.group1 ? "β = (1 + 0.3 a<sub>1</sub>/h<sub>c</sub>)(1.5 − 1.1 A<sub>b</sub>/A<sub>ef</sub>), 1.0 ≤ β ≤ min(1.25 + a<sub>1</sub>/(2h<sub>c</sub>), 1.5)" : "β = 1.0 (not group 1)", value: beta, unit: "—", digits: 3 },
                { label: "N<sub>Rdc</sub> = β A<sub>b</sub> f<sub>d</sub>", value: NRdc / kN, unit: "kN", digits: 2 }
            ] });
    }
    else if (g.support === "concrete") {
        const fcd = g.alphaCC * CONCRETE_CLASSES[g.concrete] / g.gammaC;
        const Ac0 = g.b * g.l;
        const FRdu = Ac0 * fcd;
        concrete = { fcd, Ac0, FRdu };
        checks.setGroup("Concrete — EN 1992-1-1");
        checks.resistance("concrete", "Partially loaded area with α = 1: F<sub>Rdu</sub> = A<sub>c0</sub> f<sub>cd</sub>", FEd, FRdu, "N", "EN 1992-1-1 6.7 (6.63)");
        values.push({ title: "Concrete — EN 1992-1-1 6.7", rows: [
                { label: "f<sub>cd</sub> = α<sub>cc</sub> f<sub>ck</sub> / γ<sub>c</sub>", value: fcd, unit: "MPa", digits: 2 },
                { label: "F<sub>Rdu</sub> = A<sub>c0</sub> f<sub>cd</sub>", value: FRdu / kN, unit: "kN" }
            ] });
    }
    else {
        checks.setGroup("Steel support");
        checks.info("steel-support", "Steel plate or flange: its bending and web resistance are not checked here", "ok", "EN 1993-1-5 / EN 1993-1-8");
    }
    const notes = [
        "EN 1995-1-1:2004+A1:2008 6.1.5: the effective contact length adds up to 30 mm on each side of the bearing, but not more than a, l or l1/2; k_c,90 per 6.1.5(4)-(6) unless set to 1.0.",
        "Masonry: concentrated load per EN 1996-1-1 6.1.3 on the timber bearing area (no spreader plate), load spread at 60° to the mid-height of the wall; the wall itself at mid-height (6.1.2) is not checked here.",
        "Concrete: no enhancement for the partially loaded area (α = 1).",
        "Not covered: shear of the beam at the support (6.1.7), notches (6.5), fixings against uplift or sliding.",
        "Partial factors default to the recommended values; check the National Annex that applies to the project."
    ];
    return {
        checks: checks.rows, values, notes, ...summariseChecks(checks.rows),
        kmod, fc90k: timber.fc90k, fc90d, extEnd, extInner, lef, Aef, kc90, kc90Reason, sigma, FRdTimber,
        ...(masonry ? { masonry } : {}), ...(concrete ? { concrete } : {})
    };
}
