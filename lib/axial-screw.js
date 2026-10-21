/**
 * Axially loaded screws in timber, EN 1995-1-1:2004+A1:2008 8.7.2: withdrawal (8.38)-(8.40a), head
 * pull-through (8.40b), tension of the screw (8.40c), group n_ef = n^0.9 (8.41), geometry of 8.7.2 and
 * Table 8.6. Port of WoodSection/axial_screw_verification.py (EA_Suys0 scripts) and of the structural API route
 * /calculate/ec5/axial-screw, with one correction to EN 1995-1-1:
 *
 * - (8.38) route, screws with 6 mm <= d <= 12 mm and 0.6 <= d1/d <= 0.75 and f_ax,k from (8.39):
 *   F_ax,a,Rk = n_ef k_d f_ax,k d l_ef / (1.2 cos²a + sin²a) with k_d = min(d/8; 1) (8.40). The source multiplied
 *   by (rho_k/rho_a)^0.8 and left out k_d; (8.39) already contains rho_k, so the density term counted it twice.
 * - (8.40a) route, f_ax,k given (EN 14592 / ETA, for the associated density rho_a): unchanged,
 *   F_ax,a,Rk = n_ef f_ax,k d l_ef / (1.2 cos²a + sin²a) (rho_k/rho_a)^0.8.
 *
 * Refusals as in the source: l_ef < 6d, t < 12d, a < 30 deg, spacings below Table 8.6, and no f_ax,k outside
 * the (8.38) conditions. Design value k_mod R_k / gamma_M for every mode (as the source; gamma_M of
 * connections, EN 1995-1-1 Table 2.3). Input forces in kN, everything else N, mm, MPa.
 */
import { CheckList, normaliseFields, summariseChecks } from "./checks.js";
import { LOAD_DURATIONS, kmodOf } from "./eurocode-data.js";
/** EN 1995-1-1 Table 2.3, connections (recommended value; the tools never lower it). */
export const GAMMA_M_CONNECTIONS = 1.3;
/** Whether the (8.38)/(8.39) conditions hold: 6 mm <= d <= 12 mm and 0.6 <= d1/d <= 0.75. */
export function en838Applies(d, d1) {
    const ratio = d1 / d;
    return d >= 6 && d <= 12 && ratio >= 0.6 && ratio <= 0.75;
}
/**
 * Characteristic axial resistances of ONE screw (multiply by n_ef for a group). Throws when f_ax,k is missing
 * outside the (8.38) conditions (source refusal).
 */
export function screwAxialCharacteristic(p) {
    const alpha = p.alpha * Math.PI / 180;
    const angleFactor = 1.2 * Math.cos(alpha) ** 2 + Math.sin(alpha) ** 2;
    const densityFactor = (p.rhoK / p.rhoA) ** 0.8;
    const headPull = p.fheadK * p.dh ** 2 * densityFactor;
    if (p.faxK !== undefined && p.faxK > 0) {
        return { route: "8.40a", faxK: p.faxK, kd: 1, angleFactor, densityFactor, withdrawal: p.faxK * p.d * p.lef / angleFactor * densityFactor, headPull, tension: p.ftensK };
    }
    if (!(p.d >= 6 && p.d <= 12))
        throw new Error("f_ax,k must be given: the EN 1995-1-1 (8.39) value applies only for 6 mm <= d <= 12 mm");
    if (!en838Applies(p.d, p.d1))
        throw new Error("f_ax,k must be given: the EN 1995-1-1 (8.39) value applies only for 0.6 <= d1/d <= 0.75");
    const faxK = 0.52 * p.d ** -0.5 * p.lef ** -0.1 * p.rhoK ** 0.8;
    const kd = Math.min(p.d / 8, 1);
    return { route: "8.38", faxK, kd, angleFactor, densityFactor, withdrawal: kd * faxK * p.d * p.lef / angleFactor, headPull, tension: p.ftensK };
}
/** The withdrawal value of the earlier formula (source script and API before the correction), per screw, N. */
export function legacyWithdrawal(p) {
    const c = screwAxialCharacteristic(p);
    return c.route === "8.40a" ? c.withdrawal : c.faxK * p.d * p.lef / c.angleFactor * c.densityFactor;
}
const SCREW = "Screws";
const TIMBER = "Timber and geometry";
const PRODUCT = "Product values (EN 14592 / ETA)";
const ACTION = "Design action and factors";
export const AXIAL_SCREW_FIELDS = [
    { name: "n", group: SCREW, label: "<b>n</b> — screws in the group", unit: "—", kind: "integer", min: 1, max: 100, default: 4 },
    { name: "d", group: SCREW, label: "<b>d</b> — outer thread diameter", unit: "mm", kind: "number", min: 2, max: 20, default: 8 },
    { name: "d1", group: SCREW, label: "<b>d<sub>1</sub></b> — inner thread diameter", unit: "mm", kind: "number", min: 1, max: 16, default: 5.6 },
    { name: "dh", group: SCREW, label: "<b>d<sub>h</sub></b> — head diameter", unit: "mm", kind: "number", min: 3, max: 60, default: 12 },
    { name: "lef", group: SCREW, label: "<b>l<sub>ef</sub></b> — threaded length in the point-side member", unit: "mm", kind: "number", min: 10, max: 1000, default: 80 },
    { name: "alpha", group: SCREW, label: "<b>α</b> — angle between screw axis and grain", unit: "°", kind: "number", min: 0, max: 90, default: 45 },
    { name: "tTimber", group: TIMBER, label: "<b>t</b> — timber thickness", unit: "mm", kind: "number", min: 10, max: 2000, default: 140 },
    { name: "rhoK", group: TIMBER, label: "<b>ρ<sub>k</sub></b> — characteristic density (C24 350, GL24h 385)", unit: "kg/m³", kind: "number", min: 250, max: 800, default: 420 },
    { name: "a1", group: TIMBER, label: "<b>a<sub>1</sub></b> — spacing in a plane parallel to the grain", unit: "mm", kind: "number", min: 0, max: 2000, default: 70 },
    { name: "a2", group: TIMBER, label: "<b>a<sub>2</sub></b> — spacing perpendicular to that plane", unit: "mm", kind: "number", min: 0, max: 2000, default: 50 },
    { name: "a1cg", group: TIMBER, label: "<b>a<sub>1,CG</sub></b> — end distance of the centre of gravity of the threaded part", unit: "mm", kind: "number", min: 0, max: 2000, default: 90 },
    { name: "a2cg", group: TIMBER, label: "<b>a<sub>2,CG</sub></b> — edge distance of the centre of gravity of the threaded part", unit: "mm", kind: "number", min: 0, max: 2000, default: 40 },
    { name: "faxK", group: PRODUCT, label: "<b>f<sub>ax,k</sub></b> — withdrawal parameter (empty: EN 1995-1-1 (8.39))", unit: "MPa", kind: "number", min: 0.5, max: 60, optional: true },
    { name: "rhoA", group: PRODUCT, label: "<b>ρ<sub>a</sub></b> — associated density of f<sub>ax,k</sub> and f<sub>head,k</sub>", unit: "kg/m³", kind: "number", min: 250, max: 800, default: 350, fallback: true },
    { name: "fheadK", group: PRODUCT, label: "<b>f<sub>head,k</sub></b> — head pull-through parameter", unit: "MPa", kind: "number", min: 0.5, max: 200, default: 12 },
    { name: "ftensK", group: PRODUCT, label: "<b>f<sub>tens,k</sub></b> — tensile capacity of one screw", unit: "kN", kind: "number", min: 0.1, max: 500, default: 18 },
    { name: "FEd", group: ACTION, label: "<b>F<sub>ax,Ed</sub></b> — axial force on the group", unit: "kN", kind: "number", min: 0, max: 5000, default: 3 },
    { name: "serviceClass", group: ACTION, label: "Service class", unit: "", kind: "select", options: ["1", "2", "3"], default: "2" },
    { name: "loadDuration", group: ACTION, label: "Load-duration class (k<sub>mod</sub>)", unit: "", kind: "select", options: LOAD_DURATIONS, default: "short-term" },
    { name: "gammaM", group: ACTION, label: "<b>γ<sub>M</sub></b> — connections (EN 1995-1-1 Table 2.3: 1.3; never lower)", unit: "—", kind: "number", min: GAMMA_M_CONNECTIONS, max: 3, default: GAMMA_M_CONNECTIONS, fallback: true }
];
/** Validates the input and applies the refusals of the source (geometry of 8.7.2 and Table 8.6, f_ax,k route). */
export function normaliseAxialScrewInput(raw) {
    const checked = normaliseFields(raw, AXIAL_SCREW_FIELDS);
    if (!checked.ok)
        return checked;
    const input = checked.values;
    const errors = axialScrewRefusals(input);
    return errors.length ? { ok: false, errors } : { ok: true, input };
}
export function axialScrewRefusals(g) {
    const errors = [];
    const d = g.d;
    if (g.d1 >= g.d)
        errors.push(`d1 must be smaller than d = ${d} mm`);
    if (g.lef < 6 * d)
        errors.push(`lef = ${g.lef} mm is below 6d = ${6 * d} mm (EN 1995-1-1 8.7.2: point-side penetration of the thread)`);
    if (g.tTimber < 12 * d)
        errors.push(`tTimber = ${g.tTimber} mm is below 12d = ${12 * d} mm (EN 1995-1-1 8.7.2, Table 8.6)`);
    if (g.alpha < 30)
        errors.push("alpha must be at least 30° (EN 1995-1-1 8.7.2: angle between screw axis and grain)");
    const spacing = [["a1", 7 * d, "7d"], ["a2", 5 * d, "5d"], ["a1cg", 10 * d, "10d"], ["a2cg", 4 * d, "4d"]];
    for (const [name, minimum, text] of spacing) {
        if (g[name] < minimum - 1e-9)
            errors.push(`${name} = ${g[name]} mm is below ${text} = ${minimum} mm (EN 1995-1-1 Table 8.6)`);
    }
    if (g.faxK === undefined && !(d >= 6 && d <= 12))
        errors.push("faxK is required: EN 1995-1-1 (8.39) applies only for 6 mm ≤ d ≤ 12 mm");
    else if (g.faxK === undefined && !en838Applies(d, g.d1))
        errors.push("faxK is required: EN 1995-1-1 (8.39) applies only for 0.6 ≤ d1/d ≤ 0.75");
    return errors;
}
export function checkAxialScrew(input) {
    const g = input;
    const kN = 1000;
    const props = { d: g.d, d1: g.d1, dh: g.dh, lef: g.lef, alpha: g.alpha, rhoK: g.rhoK, rhoA: g.rhoA, ...(g.faxK !== undefined ? { faxK: g.faxK } : {}), fheadK: g.fheadK, ftensK: g.ftensK * kN };
    const single = screwAxialCharacteristic(props);
    const nef = g.n ** 0.9;
    const kmod = kmodOf(g.serviceClass, g.loadDuration);
    const factor = kmod / g.gammaM;
    const RkWithdrawal = nef * single.withdrawal, RkHead = nef * single.headPull, RkTension = nef * single.tension;
    const modes = { withdrawal: RkWithdrawal, "head pull-through": RkHead, tension: RkTension };
    const governingMode = Object.keys(modes).reduce((a, b) => (modes[b] < modes[a] ? b : a));
    const Rd = factor * modes[governingMode];
    const FEd = g.FEd * kN;
    const checks = new CheckList("Axial resistance — EN 1995-1-1 8.7.2");
    const withdrawalRef = single.route === "8.38" ? "EN 1995-1-1 (8.38)-(8.40)" : "EN 1995-1-1 (8.40a)";
    checks.resistance("withdrawal", "Withdrawal of the thread: F<sub>ax,Ed</sub> ≤ k<sub>mod</sub> F<sub>ax,α,Rk</sub> / γ<sub>M</sub>", FEd, factor * RkWithdrawal, "N", withdrawalRef);
    checks.resistance("head", "Head pull-through: F<sub>ax,Ed</sub> ≤ k<sub>mod</sub> F<sub>ax,α,Rk,head</sub> / γ<sub>M</sub>", FEd, factor * RkHead, "N", "EN 1995-1-1 (8.40b)");
    checks.resistance("tension", "Tension of the screws: F<sub>ax,Ed</sub> ≤ k<sub>mod</sub> F<sub>t,Rk</sub> / γ<sub>M</sub>", FEd, factor * RkTension, "N", "EN 1995-1-1 (8.40c)");
    checks.setGroup("Geometry — EN 1995-1-1 8.7.2, Table 8.6");
    checks.minimum("lef", "Thread penetration l<sub>ef</sub> ≥ 6d", g.lef, 6 * g.d, "mm", "EN 1995-1-1 8.7.2");
    checks.minimum("t", "Timber thickness t ≥ 12d", g.tTimber, 12 * g.d, "mm", "EN 1995-1-1 8.7.2");
    checks.minimum("alpha", "Angle to the grain α ≥ 30°", g.alpha, 30, "°", "EN 1995-1-1 8.7.2");
    checks.minimum("a1", "Spacing a<sub>1</sub> ≥ 7d", g.a1, 7 * g.d, "mm", "EN 1995-1-1 Table 8.6");
    checks.minimum("a2", "Spacing a<sub>2</sub> ≥ 5d", g.a2, 5 * g.d, "mm", "EN 1995-1-1 Table 8.6");
    checks.minimum("a1cg", "End distance a<sub>1,CG</sub> ≥ 10d", g.a1cg, 10 * g.d, "mm", "EN 1995-1-1 Table 8.6");
    checks.minimum("a2cg", "Edge distance a<sub>2,CG</sub> ≥ 4d", g.a2cg, 4 * g.d, "mm", "EN 1995-1-1 Table 8.6");
    const routeText = single.route === "8.38"
        ? "f<sub>ax,k</sub> = 0.52 d<sup>−0.5</sup> l<sub>ef</sub><sup>−0.1</sup> ρ<sub>k</sub><sup>0.8</sup> (8.39)"
        : "f<sub>ax,k</sub> given (EN 14592 / ETA, at ρ<sub>a</sub>)";
    const values = [
        { title: "Screw group — EN 1995-1-1 8.7.2", rows: [
                { label: "n<sub>ef</sub> = n<sup>0.9</sup> (8.41)", value: nef, unit: "—", digits: 3 },
                { label: routeText, value: single.faxK, unit: "MPa", digits: 3 },
                { label: "k<sub>d</sub> = min(d/8; 1) (8.40)" + (single.route === "8.40a" ? " — not used in (8.40a)" : ""), value: single.kd, unit: "—", digits: 3 },
                { label: "1.2 cos²α + sin²α", value: single.angleFactor, unit: "—", digits: 4 },
                { label: "(ρ<sub>k</sub>/ρ<sub>a</sub>)<sup>0.8</sup>" + (single.route === "8.38" ? " — head pull-through only" : ""), value: single.densityFactor, unit: "—", digits: 4 },
                { label: single.route === "8.38" ? "F<sub>ax,α,Rk</sub> = n<sub>ef</sub> k<sub>d</sub> f<sub>ax,k</sub> d l<sub>ef</sub> / (1.2 cos²α + sin²α)" : "F<sub>ax,α,Rk</sub> = n<sub>ef</sub> f<sub>ax,k</sub> d l<sub>ef</sub> (ρ<sub>k</sub>/ρ<sub>a</sub>)<sup>0.8</sup> / (1.2 cos²α + sin²α)", value: RkWithdrawal / kN, unit: "kN", digits: 2 },
                { label: "F<sub>ax,α,Rk,head</sub> = n<sub>ef</sub> f<sub>head,k</sub> d<sub>h</sub>² (ρ<sub>k</sub>/ρ<sub>a</sub>)<sup>0.8</sup>", value: RkHead / kN, unit: "kN", digits: 2 },
                { label: "F<sub>t,Rk</sub> = n<sub>ef</sub> f<sub>tens,k</sub>", value: RkTension / kN, unit: "kN", digits: 2 },
                { label: `k<sub>mod</sub> (service class ${g.serviceClass}, ${g.loadDuration}); γ<sub>M</sub>`, value: `${kmod}; ${g.gammaM}`, unit: "—" },
                { label: `F<sub>ax,Rd</sub> = k<sub>mod</sub> min(R<sub>k</sub>) / γ<sub>M</sub> (${governingMode})`, value: Rd / kN, unit: "kN", digits: 2 }
            ] }
    ];
    const notes = [
        "EN 1995-1-1:2004+A1:2008 8.7.2. Screws with 6 mm ≤ d ≤ 12 mm and 0.6 ≤ d1/d ≤ 0.75 without a product value use (8.38)-(8.40) with k_d = min(d/8; 1); with a product f_ax,k (EN 14592 or ETA) the check uses (8.40a) with (ρ_k/ρ_a)^0.8.",
        "Correction against the earlier tool formula: in the (8.38) route the earlier formula also multiplied by (ρ_k/ρ_a)^0.8 and left out k_d; (8.39) already contains ρ_k.",
        "Design value k_mod R_k / γ_M for all three modes, including the steel tension of the screw, as in the source script; an ETA may prescribe γ_M2 for the steel failure instead.",
        "Not covered: combined axial and lateral load (8.7.3), screws in end grain, splitting and the member itself.",
        "γ_M and the k_mod table are the recommended EN values; check the National Annex that applies to the project."
    ];
    return {
        checks: checks.rows, values, notes, ...summariseChecks(checks.rows),
        nef, kmod, single, RkWithdrawal, RkHead, RkTension, Rd, governingMode,
        legacyRkWithdrawal: nef * legacyWithdrawal(props)
    };
}
