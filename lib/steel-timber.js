/**
 * Steel-to-timber connection with bolts or dowels (EN 1995-1-1 8.2.3, 8.5,
 * 8.6): one steel plate on one side (single shear), one slotted-in plate
 * (double shear) or two outer plates (double shear). The fasteners stand in
 * n_r rows parallel to the grain with n fasteners per row; the force acts at
 * an angle α to the grain.
 *
 * EN 1995-1-1: (8.9)-(8.13) Johansen modes, 8.2.2(2) rope effect (bolts, at
 * most 25 %), (8.30)-(8.33) M_y,Rk and embedment, 8.5.1.1(4) and (8.34)
 * effective number, 8.1.2(4)-(5), 8.1.4 splitting, Tables 8.4 / 8.5
 * spacings and distances, 8.5.2(2) washer bearing, Tables 2.3 / 3.1.
 * EN 1993-1-8 Table 3.4: fastener shear and bearing on the steel plate.
 *
 * Geometry of the timber member: grain along x; the member end is at x = 0
 * and the first column of fasteners at x = a3; the loaded edge (towards which
 * the force component perpendicular to the grain points) is at y = 0 and the
 * first row at y = a4. Input forces in kN, everything else N, mm, MPa.
 */
import { steelStrength } from "./design.js";
import { CheckList, normaliseFields, summariseChecks } from "./checks.js";
import { BOLT_STRESS_AREA, LOAD_DURATIONS, TIMBER_CLASSES, kmodOf } from "./eurocode-data.js";
const CONNECTION = "Connection";
const TIMBER = "Timber member";
const FASTENERS = "Fasteners";
const LAYOUT = "Layout (mm)";
const ACTION = "Design action";
const FACTORS = "Factors";
export const STEEL_TIMBER_FIELDS = [
    { name: "configuration", group: CONNECTION, label: "Steel plate(s)", unit: "", kind: "select", options: ["single", "slotted", "outer"], default: "slotted" },
    { name: "ts", group: CONNECTION, label: "<b>t<sub>s</sub></b> — steel plate thickness", unit: "mm", kind: "number", min: 2, max: 40, default: 10 },
    { name: "plateGrade", group: CONNECTION, label: "Steel plate grade", unit: "", kind: "select", options: ["S235", "S275", "S355"], default: "S235" },
    { name: "timberClass", group: TIMBER, label: "Strength class", unit: "", kind: "select", options: Object.keys(TIMBER_CLASSES), default: "GL24h" },
    { name: "b", group: TIMBER, label: "<b>b</b> — member thickness (along the fastener)", unit: "mm", kind: "number", min: 20, max: 400, default: 140 },
    { name: "h", group: TIMBER, label: "<b>h</b> — member depth (perpendicular to the grain)", unit: "mm", kind: "number", min: 40, max: 2000, default: 240 },
    { name: "fastener", group: FASTENERS, label: "Fastener", unit: "", kind: "select", options: ["bolt", "dowel"], default: "dowel" },
    { name: "d", group: FASTENERS, label: "<b>d</b> — diameter", unit: "mm", kind: "select", options: ["8", "10", "12", "16", "20", "24"], default: "12" },
    { name: "boltClass", group: FASTENERS, label: "Bolt class", unit: "", kind: "select", options: ["4.6", "5.6", "8.8"], default: "8.8", showIf: { fastener: ["bolt"] } },
    { name: "dowelGrade", group: FASTENERS, label: "Dowel steel", unit: "", kind: "select", options: ["S235", "S275", "S355"], default: "S235", showIf: { fastener: ["dowel"] } },
    { name: "ropeEffect", group: FASTENERS, label: "Count the rope effect (8.2.2(2), washers ≥ 3d)", unit: "", kind: "checkbox", default: false, showIf: { fastener: ["bolt"] } },
    { name: "rows", group: LAYOUT, label: "<b>n<sub>r</sub></b> — rows parallel to the grain", unit: "—", kind: "integer", min: 1, max: 8, default: 2 },
    { name: "perRow", group: LAYOUT, label: "<b>n</b> — fasteners per row", unit: "—", kind: "integer", min: 1, max: 12, default: 3 },
    { name: "a1", group: LAYOUT, label: "<b>a<sub>1</sub></b> — spacing along the grain", unit: "mm", kind: "number", min: 10, max: 1000, default: 84 },
    { name: "a2", group: LAYOUT, label: "<b>a<sub>2</sub></b> — spacing across the grain", unit: "mm", kind: "number", min: 10, max: 1000, default: 100 },
    { name: "a3", group: LAYOUT, label: "<b>a<sub>3</sub></b> — end distance", unit: "mm", kind: "number", min: 10, max: 2000, default: 100 },
    { name: "a4", group: LAYOUT, label: "<b>a<sub>4</sub></b> — distance to the loaded edge", unit: "mm", kind: "number", min: 10, max: 2000, default: 70 },
    { name: "endLoaded", group: ACTION, label: "Force towards the member end (loaded end, a<sub>3,t</sub>)", unit: "", kind: "checkbox", default: true },
    { name: "FEd", group: ACTION, label: "<b>F<sub>Ed</sub></b> — design force on the connection", unit: "kN", kind: "number", min: 0, max: 5000, default: 45 },
    { name: "alpha", group: ACTION, label: "<b>α</b> — angle between force and grain", unit: "°", kind: "number", min: 0, max: 90, default: 0 },
    { name: "serviceClass", group: FACTORS, label: "Service class", unit: "", kind: "select", options: ["1", "2", "3"], default: "1" },
    { name: "loadDuration", group: FACTORS, label: "Load-duration class (k<sub>mod</sub>)", unit: "", kind: "select", options: LOAD_DURATIONS, default: "medium-term" },
    { name: "gammaM", group: FACTORS, label: "<b>γ<sub>M</sub></b> — connections (EN 1995-1-1 Table 2.3)", unit: "—", kind: "number", min: 1, max: 2, default: 1.3, fallback: true },
    { name: "gammaM2", group: FACTORS, label: "<b>γ<sub>M2</sub></b> — steel (EN 1993-1-8)", unit: "—", kind: "number", min: 1, max: 2, default: 1.25, fallback: true }
];
/** Characteristic ultimate strength of the fastener steel. */
export function fastenerFu(input) {
    if (input.fastener === "bolt")
        return { "4.6": 400, "5.6": 500, "8.8": 800 }[input.boltClass ?? "8.8"];
    return steelStrength(input.dowelGrade ?? "S235", input.d).fu;
}
export function normaliseSteelTimberInput(raw) {
    // d arrives as a select string from the page or as a number from the API
    const source = raw !== null && typeof raw === "object" && !Array.isArray(raw) && typeof raw.d === "number"
        ? { ...raw, d: String(raw.d) } : raw;
    const checked = normaliseFields(source, STEEL_TIMBER_FIELDS);
    if (!checked.ok)
        return checked;
    const input = { ...checked.values, d: Number(checked.values.d) };
    const errors = [];
    const hEdge = input.h - input.a4 - (input.rows - 1) * input.a2;
    if (!(hEdge > 0))
        errors.push(`a4 and a2 place the fasteners outside the member depth h (unloaded edge distance ${hEdge.toFixed(0)} mm)`);
    if (input.configuration === "slotted" && !((input.b - input.ts - 2) / 2 > input.d / 2))
        errors.push("b is too small for a slotted-in plate: (b − t_s − 2)/2 must exceed d/2");
    return errors.length ? { ok: false, errors } : { ok: true, input };
}
/** Smallest mode; the rope term F_ax,Rk/4 is added where the formula has it, limited to 25 % (8.2.2(2)). */
function governingMode(modes, Fax, ropeAllowed) {
    const values = {};
    let best = { key: "", Fk: Infinity, rope: 0 };
    for (const mode of modes) {
        const rope = mode.rope && ropeAllowed ? Math.min(Fax / 4, 0.25 * mode.johansen) : 0;
        const value = mode.johansen + rope;
        values[mode.key] = value;
        if (value < best.Fk)
            best = { key: mode.key, Fk: value, rope };
    }
    return { modes: values, Fk: best.Fk, governingMode: best.key, ropeUsed: best.rope };
}
/** Characteristic resistance per shear plane and fastener, EN 1995-1-1 8.2.3, N. */
export function johansenSteelTimber(configuration, fh, t, d, ts, My, Fax, ropeAllowed) {
    const bending = (factor) => factor * Math.sqrt(My * fh * d);
    const partial = fh * t * d * (Math.sqrt(2 + 4 * My / (fh * d * t * t)) - 1);
    if (configuration === "slotted") {
        return governingMode([
            { key: "(8.11 f)", johansen: fh * t * d, rope: false },
            { key: "(8.11 g)", johansen: partial, rope: true },
            { key: "(8.11 h)", johansen: bending(2.3), rope: true }
        ], Fax, ropeAllowed);
    }
    const single = configuration === "single";
    // thin (t_s <= 0.5 d) and thick (t_s >= d) plates; linear interpolation in between (8.2.3(1))
    const thin = governingMode(single
        ? [{ key: "(8.9 a)", johansen: 0.4 * fh * t * d, rope: false }, { key: "(8.9 b)", johansen: 1.15 * Math.sqrt(2 * My * fh * d), rope: true }]
        : [{ key: "(8.12 j)", johansen: 0.5 * fh * t * d, rope: false }, { key: "(8.12 k)", johansen: 1.15 * Math.sqrt(2 * My * fh * d), rope: true }], Fax, ropeAllowed);
    const thick = governingMode(single
        ? [{ key: "(8.10 c)", johansen: partial, rope: true }, { key: "(8.10 d)", johansen: bending(2.3), rope: true }, { key: "(8.10 e)", johansen: fh * t * d, rope: false }]
        : [{ key: "(8.13 l)", johansen: 0.5 * fh * t * d, rope: false }, { key: "(8.13 m)", johansen: bending(2.3), rope: true }], Fax, ropeAllowed);
    if (ts <= 0.5 * d)
        return thin;
    if (ts >= d)
        return thick;
    const k = (ts - 0.5 * d) / (0.5 * d);
    return {
        modes: { ...thin.modes, ...thick.modes },
        Fk: thin.Fk + k * (thick.Fk - thin.Fk),
        governingMode: `${thin.governingMode} / ${thick.governingMode} interpolated`,
        ropeUsed: thin.ropeUsed + k * (thick.ropeUsed - thin.ropeUsed)
    };
}
export function checkSteelTimber(input) {
    const g = input;
    const FEd = g.FEd * 1000;
    const timber = TIMBER_CLASSES[g.timberClass];
    const kmod = kmodOf(g.serviceClass, g.loadDuration);
    const d = g.d;
    const fu = fastenerFu(g);
    const plate = steelStrength(g.plateGrade, g.ts);
    const alphaRad = g.alpha * Math.PI / 180;
    const sin = Math.sin(alphaRad), cos = Math.cos(alphaRad);
    // ---- embedment and yield moment: EN 1995-1-1 (8.30)-(8.33)
    const My = 0.3 * fu * d ** 2.6;
    const fh0 = 0.082 * (1 - 0.01 * d) * timber.rhoK;
    const k90 = 1.35 + 0.015 * d;
    const fhAt = (s, c) => fh0 / (k90 * s * s + c * c);
    const fhAlpha = fhAt(sin, cos);
    const t = g.configuration === "slotted" ? (g.b - g.ts - 2) / 2 : g.b;
    const planes = g.configuration === "single" ? 1 : 2;
    // ---- rope effect: F_ax,Rk = min(bolt tension, washer bearing 3 f_c,90,k on timber sides) (8.5.2(2))
    const As = BOLT_STRESS_AREA[d] ?? Math.PI * d * d / 4 * 0.78;
    const washerD = 3 * d;
    const washerBearing = 3 * timber.fc90k * Math.PI / 4 * (washerD ** 2 - (d + 1) ** 2);
    const ropeAllowed = g.fastener === "bolt" && g.ropeEffect === true;
    const Fax = ropeAllowed ? Math.min(0.9 * fu * As, g.configuration === "outer" ? Infinity : washerBearing) : 0;
    const perPlane = johansenSteelTimber(g.configuration, fhAlpha, t, d, g.ts, My, Fax, ropeAllowed);
    const perPlane0 = johansenSteelTimber(g.configuration, fh0, t, d, g.ts, My, Fax, ropeAllowed);
    const FvRd = kmod * planes * perPlane.Fk / g.gammaM;
    const FvRd0 = kmod * planes * perPlane0.Fk / g.gammaM;
    // ---- effective number along the grain (8.34), perpendicular n_ef = n, linear in between (8.5.1.1(4))
    const n = g.perRow;
    const nef0 = n === 1 ? 1 : Math.min(n, n ** 0.9 * (g.a1 / (13 * d)) ** 0.25);
    const nefAlpha = nef0 + (n - nef0) * g.alpha / 90;
    const FvefRd = g.rows * nefAlpha * FvRd;
    const checks = new CheckList("Timber side — EN 1995-1-1");
    checks.resistance("group", `Fastener group: F<sub>Ed</sub> ≤ n<sub>r</sub> n<sub>ef</sub> F<sub>v,Rd</sub> (α = ${g.alpha}°)`, FEd, FvefRd, "N", "EN 1995-1-1 8.1.2(4), 8.2.3, 8.5.1.1(4)");
    if (g.alpha > 0 && g.alpha < 90) {
        checks.resistance("group-parallel", "Component along the rows: F<sub>Ed</sub> cos α ≤ n<sub>r</sub> n<sub>ef,0</sub> F<sub>v,0,Rd</sub>", FEd * cos, g.rows * nef0 * FvRd0, "N", "EN 1995-1-1 8.1.2(5)");
    }
    // ---- splitting by the component perpendicular to the grain (8.1.4)
    const he = g.a4 + (g.rows - 1) * g.a2;
    const F90Rd = kmod * 14 * g.b * 1 * Math.sqrt(he / (1 - he / g.h)) / g.gammaM;
    if (g.alpha > 0) {
        checks.resistance("splitting", `Splitting: F<sub>Ed</sub> sin α ≤ F<sub>90,Rd</sub> = 14 b w √(h<sub>e</sub>/(1 − h<sub>e</sub>/h)) (h<sub>e</sub> = ${he.toFixed(0)} mm)`, FEd * sin, F90Rd, "N", "EN 1995-1-1 8.1.4", "full perpendicular component taken as the shear force on one side of the connection");
    }
    // ---- steel side: EN 1993-1-8 Table 3.4
    const nTotal = g.rows * g.perRow;
    const shearArea = g.fastener === "bolt" ? As : Math.PI * d * d / 4;
    const steelShearRd = 0.6 * fu * shearArea / g.gammaM2;
    const plates = g.configuration === "outer" ? 2 : 1;
    const bearingRd = 2.5 * Math.min(fu / plate.fu, 1) * plate.fu * d * g.ts / g.gammaM2;
    checks.setGroup("Steel side — EN 1993-1-8");
    checks.resistance("fastener-shear", `Fastener shear: ${nTotal} × ${planes} plane${planes > 1 ? "s" : ""} × 0.6 f<sub>u</sub> A / γ<sub>M2</sub>`, FEd, nTotal * planes * steelShearRd, "N", "EN 1993-1-8 Table 3.4", g.fastener === "bolt" ? "threads in the shear plane (A = A_s)" : "plain dowel (A = πd²/4)");
    checks.resistance("plate-bearing", `Bearing on the steel plate${plates > 1 ? "s" : ""} (k<sub>1</sub> = 2.5, α<sub>b</sub> = min(f<sub>u,fastener</sub>/f<sub>u</sub>, 1))`, FEd, nTotal * plates * bearingRd, "N", "EN 1993-1-8 Table 3.4", "edge distances in the plate e1 ≥ 3 d0, e2 ≥ 1.5 d0, p1 ≥ 3.75 d0, p2 ≥ 3 d0 assumed");
    // ---- spacings and distances: Tables 8.4 (bolts) / 8.5 (dowels)
    const bolt = g.fastener === "bolt";
    const absCos = Math.abs(cos);
    const a1Min = (bolt ? 4 + absCos : 3 + 2 * absCos) * d;
    const a2Min = (bolt ? 4 : 3) * d;
    const a3t = Math.max(7 * d, 80);
    const a3Min = g.endLoaded ? a3t : g.alpha <= 30 ? (bolt ? 4 : 3) * d : bolt ? (1 + 6 * sin) * d : Math.max(a3t * sin, 3 * d);
    const a4t = Math.max((2 + 2 * sin) * d, 3 * d);
    const a4c = 3 * d;
    const unloadedEdge = g.h - he;
    checks.setGroup(`Spacings and distances — EN 1995-1-1 Table ${bolt ? "8.4" : "8.5"}`);
    if (g.perRow > 1)
        checks.minimum("a1", "Spacing along the grain a<sub>1</sub>", g.a1, a1Min, "mm", `EN 1995-1-1 Table ${bolt ? "8.4" : "8.5"}`);
    if (g.rows > 1)
        checks.minimum("a2", "Spacing across the grain a<sub>2</sub>", g.a2, a2Min, "mm", `EN 1995-1-1 Table ${bolt ? "8.4" : "8.5"}`);
    checks.minimum("a3", `End distance a<sub>3,${g.endLoaded ? "t" : "c"}</sub>`, g.a3, a3Min, "mm", `EN 1995-1-1 Table ${bolt ? "8.4" : "8.5"}`);
    checks.minimum("a4t", g.alpha > 0 ? "Loaded edge a<sub>4,t</sub>" : "Edge distance a<sub>4</sub>", g.a4, g.alpha > 0 ? a4t : a4c, "mm", `EN 1995-1-1 Table ${bolt ? "8.4" : "8.5"}`);
    checks.minimum("a4c", "Unloaded edge a<sub>4,c</sub> = h − a<sub>4</sub> − (n<sub>r</sub> − 1) a<sub>2</sub>", unloadedEdge, a4c, "mm", `EN 1995-1-1 Table ${bolt ? "8.4" : "8.5"}`);
    if (g.configuration === "single" && g.ts > 0.5 * d && g.ts < d)
        checks.info("plate-interpolation", "Plate between thin (0.5d) and thick (d): resistance interpolated linearly", "ok", "EN 1995-1-1 8.2.3(1)");
    if (g.configuration !== "slotted" && g.ts >= d)
        checks.info("thick-plate", "Thick-plate modes need hole tolerances below 0.1 d (e.g. fitted holes)", "warning", "EN 1995-1-1 8.2.3(1)");
    const kN = 1000;
    const values = [
        { title: "Materials and factors", rows: [
                { label: `${g.timberClass}: ρ<sub>k</sub>; f<sub>c,90,k</sub>`, value: `${timber.rhoK}; ${timber.fc90k}`, unit: "kg/m³; MPa" },
                { label: `k<sub>mod</sub> (service class ${g.serviceClass}, ${g.loadDuration}); γ<sub>M</sub>`, value: `${kmod}; ${g.gammaM}`, unit: "—" },
                { label: `Fastener f<sub>u,k</sub> (${bolt ? `bolt ${g.boltClass}` : `dowel ${g.dowelGrade}`})`, value: fu, unit: "MPa", digits: 0 }
            ] },
        { title: "Fastener — EN 1995-1-1 8.5.1.1", rows: [
                { label: "M<sub>y,Rk</sub> = 0.3 f<sub>u,k</sub> d<sup>2.6</sup>", value: My / 1000, unit: "Nm", digits: 1 },
                { label: "f<sub>h,0,k</sub> = 0.082 (1 − 0.01 d) ρ<sub>k</sub>; k<sub>90</sub> = 1.35 + 0.015 d", value: `${fh0.toFixed(2)}; ${k90.toFixed(3)}`, unit: "MPa; —" },
                { label: `f<sub>h,α,k</sub> = f<sub>h,0,k</sub> / (k<sub>90</sub> sin²α + cos²α), α = ${g.alpha}°`, value: fhAlpha, unit: "MPa", digits: 2 },
                { label: g.configuration === "slotted" ? "Timber thickness per side t<sub>1</sub> = (b − t<sub>s</sub> − 2)/2" : g.configuration === "single" ? "Timber thickness t<sub>1</sub> = b" : "Central timber thickness t<sub>2</sub> = b", value: t, unit: "mm" },
                { label: ropeAllowed ? `F<sub>ax,Rk</sub> = min(0.9 f<sub>u</sub> A<sub>s</sub>${g.configuration === "outer" ? "" : ", 3 f<sub>c,90,k</sub> A<sub>washer</sub> (washer 3d)"})` : "Rope effect", value: ropeAllowed ? (Fax / kN).toFixed(1) : "not counted", unit: ropeAllowed ? "kN" : "" },
                { label: `F<sub>v,Rk</sub> per shear plane: ${perPlane.governingMode}`, value: perPlane.Fk / kN, unit: "kN", digits: 2 },
                { label: `F<sub>v,Rd</sub> = k<sub>mod</sub> × ${planes} × F<sub>v,Rk</sub> / γ<sub>M</sub> per fastener (α); along the grain`, value: `${(FvRd / kN).toFixed(2)}; ${(FvRd0 / kN).toFixed(2)}`, unit: "kN" }
            ] },
        { title: "Group", rows: [
                { label: "n<sub>ef,0</sub> = min(n, n<sup>0.9</sup> (a<sub>1</sub>/(13d))<sup>0.25</sup>); n<sub>ef</sub>(α)", value: `${nef0.toFixed(3)}; ${nefAlpha.toFixed(3)}`, unit: "—" },
                { label: "F<sub>v,ef,Rd</sub> = n<sub>r</sub> n<sub>ef</sub> F<sub>v,Rd</sub>", value: FvefRd / kN, unit: "kN" },
                { label: "Splitting F<sub>90,Rd</sub> (h<sub>e</sub>, h)", value: F90Rd / kN, unit: "kN" },
                { label: "Steel: shear per plane; bearing per plate and fastener", value: `${(steelShearRd / kN).toFixed(1)}; ${(bearingRd / kN).toFixed(1)}`, unit: "kN" }
            ] }
    ];
    const notes = [
        "Timber side per EN 1995-1-1 8.2.3 for steel-to-timber connections; the steel plate is thin for t_s ≤ 0.5 d and thick for t_s ≥ d (with hole tolerances below 0.1 d), interpolated in between. A slotted-in plate is the central member (8.11) whatever its thickness; the slot is taken 2 mm wider than the plate.",
        "Embedment strength for softwood (k_90 = 1.35 + 0.015 d) and diameters up to 30 mm; the rope effect is counted only for bolts when switched on, limited to 25 % of the Johansen part, with washers of at least 3d (10.4.3).",
        "The splitting check takes the whole perpendicular component as the shear force on one side of the connection (a connection at a member end); for a connection in the span it is conservative.",
        "Not covered: block shear and plug shear (EN 1995-1-1 Annex A), net section of the timber and of the steel plate, block tearing of the plate (EN 1993-1-8 3.10.2), eccentricity moments in the group.",
        "Partial factors default to the recommended values; check the National Annex that applies to the project."
    ];
    return {
        checks: checks.rows, values, notes, ...summariseChecks(checks.rows),
        kmod, rhoK: timber.rhoK, fu, My, fh0, k90, fhAlpha, t, planes, Fax, perPlane, perPlane0, FvRd, FvRd0, nef0, nefAlpha, FvefRd, F90Rd, he,
        steelShearRd, bearingRd, minimums: { a1: a1Min, a2: a2Min, a3: a3Min, a4t, a4c }
    };
}
