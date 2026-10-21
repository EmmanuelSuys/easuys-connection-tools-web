/**
 * Timber-to-timber connection with nails, screws, bolts or dowels in single
 * shear (two members) or double shear (two outer members and one inner
 * member), EN 1995-1-1:2004+A1:2008 8.2.2. The fasteners stand in n_r rows
 * parallel to the grain with n fasteners per row; the grain of all members is
 * parallel and the force acts at an angle alpha to it.
 *
 * EN 1995-1-1: (8.6) / (8.7) Johansen modes with the rope effect of 8.2.2(2)
 * and its caps; M_y,Rk (8.14) nails and screws, (8.30) bolts and dowels;
 * embedment (8.15)/(8.16) for nails up to 8 mm and screws up to 6 mm (8.3.1.1,
 * 8.7.1), (8.31)-(8.33) with k_90 for bolts, dowels and larger screws; the
 * effective number (8.17) with Table 8.1 (nails, small screws) and (8.34)
 * (bolts, dowels, larger screws) with the interpolation of 8.5.1.1(4);
 * splitting (8.1.4); spacings Tables 8.2 / 8.4 / 8.5; k_mod Table 3.1 and
 * gamma_M Table 2.3. Rope effect of bolts: F_ax,Rk = min(bolt tension, washer
 * bearing at 3 f_c,90,k, 8.5.2(2)); nails and screws: F_ax,Rk is an input
 * (8.3.2 / 8.7.2 or a product declaration). Units: input forces kN, else N,
 * mm, MPa.
 *
 * Geometry: grain along x; the member ends are at x = 0 (loaded or unloaded
 * end per endLoaded); the first row of fasteners is at y = a4 from the bottom
 * edge. In a timber-to-timber joint the two members are loaded in opposite
 * directions, so a force component perpendicular to the grain loads the
 * bottom edge of one member and the top edge of the other.
 */
import { steelStrength } from "./design.js";
import { CheckList, normaliseFields, summariseChecks } from "./checks.js";
import { BOLT_STRESS_AREA, LOAD_DURATIONS, TIMBER_CLASSES, kmodOf } from "./eurocode-data.js";
/** Mean densities, kg/m3: EN 338:2016 Table 1 (solid timber) and EN 14080:2013 Table 5 (glulam). For K_ser (EN 1995-1-1 7.1). */
export const TIMBER_MEAN_DENSITY = {
    C16: 370, C18: 380, C24: 420, C30: 460, GL24h: 420, GL28h: 460, GL32h: 490, GL24c: 400, GL28c: 420
};
const CONNECTION = "Connection";
const MEMBERS = "Timber members";
const FASTENERS = "Fasteners";
const LAYOUT = "Layout (mm)";
const ACTION = "Design action";
const FACTORS = "Factors";
const CLASSES = Object.keys(TIMBER_CLASSES);
export const TIMBER_TIMBER_FIELDS = [
    { name: "shear", group: CONNECTION, label: "Shear planes", unit: "", kind: "select", options: ["single", "double"], default: "double", note: "single: two members; double: two outer members and one inner member" },
    { name: "class1", group: MEMBERS, label: "Member 1 / outer members — strength class", unit: "", kind: "select", options: CLASSES, default: "C24" },
    { name: "t1", group: MEMBERS, label: "<b>t<sub>1</sub></b> — thickness of member 1 / of each outer member", unit: "mm", kind: "number", min: 8, max: 400, default: 45 },
    { name: "class2", group: MEMBERS, label: "Member 2 / inner member — strength class", unit: "", kind: "select", options: CLASSES, default: "GL24h" },
    { name: "t2", group: MEMBERS, label: "<b>t<sub>2</sub></b> — member 2 (point-side penetration for nails and screws) / inner member", unit: "mm", kind: "number", min: 8, max: 400, default: 90 },
    { name: "h", group: MEMBERS, label: "<b>h</b> — member depth (perpendicular to the grain)", unit: "mm", kind: "number", min: 30, max: 2000, default: 200 },
    { name: "fastener", group: FASTENERS, label: "Fastener", unit: "", kind: "select", options: ["nail", "screw", "bolt", "dowel"], default: "dowel" },
    { name: "d", group: FASTENERS, label: "<b>d</b> — diameter (screws: effective diameter d<sub>ef</sub>, 8.7.1)", unit: "mm", kind: "number", min: 2, max: 30, default: 12 },
    { name: "nailShank", group: FASTENERS, label: "Nail shank", unit: "", kind: "select", options: ["smooth", "square", "threaded"], default: "smooth", showIf: { fastener: ["nail"] }, note: "smooth round; square or grooved; threaded (other nails)" },
    { name: "fu", group: FASTENERS, label: "<b>f<sub>u,k</sub></b> — tensile strength of the wire", unit: "MPa", kind: "number", min: 300, max: 1600, default: 600, showIf: { fastener: ["nail", "screw"] } },
    { name: "boltClass", group: FASTENERS, label: "Bolt class", unit: "", kind: "select", options: ["4.6", "5.6", "8.8"], default: "4.6", showIf: { fastener: ["bolt"] } },
    { name: "dowelGrade", group: FASTENERS, label: "Dowel steel", unit: "", kind: "select", options: ["S235", "S275", "S355"], default: "S235", showIf: { fastener: ["dowel"] } },
    { name: "MyRk", group: FASTENERS, label: "<b>M<sub>y,Rk</sub></b> from the product declaration (empty: EN formula)", unit: "Nm", kind: "number", min: 0.1, max: 2000, optional: true, showIf: { fastener: ["nail", "screw"] } },
    { name: "predrilled", group: FASTENERS, label: "Predrilled holes", unit: "", kind: "checkbox", default: false, showIf: { fastener: ["nail", "screw"] } },
    { name: "ropeEffect", group: FASTENERS, label: "Count the rope effect (8.2.2(2), capped)", unit: "", kind: "checkbox", default: false, showIf: { fastener: ["nail", "screw", "bolt"] } },
    { name: "FaxRk", group: FASTENERS, label: "<b>F<sub>ax,Rk</sub></b> — withdrawal capacity (8.3.2 / 8.7.2)", unit: "kN", kind: "number", min: 0, max: 100, default: 0, fallback: true, showIf: { fastener: ["nail", "screw"], ropeEffect: ["true"] } },
    { name: "rows", group: LAYOUT, label: "<b>n<sub>r</sub></b> — rows parallel to the grain", unit: "—", kind: "integer", min: 1, max: 12, default: 2 },
    { name: "perRow", group: LAYOUT, label: "<b>n</b> — fasteners per row", unit: "—", kind: "integer", min: 1, max: 30, default: 3 },
    { name: "a1", group: LAYOUT, label: "<b>a<sub>1</sub></b> — spacing along the grain", unit: "mm", kind: "number", min: 5, max: 1000, default: 84 },
    { name: "a2", group: LAYOUT, label: "<b>a<sub>2</sub></b> — spacing across the grain", unit: "mm", kind: "number", min: 5, max: 1000, default: 60 },
    { name: "a3", group: LAYOUT, label: "<b>a<sub>3</sub></b> — end distance (both members)", unit: "mm", kind: "number", min: 5, max: 2000, default: 100 },
    { name: "a4", group: LAYOUT, label: "<b>a<sub>4</sub></b> — distance from the first row to the bottom edge", unit: "mm", kind: "number", min: 5, max: 2000, default: 50 },
    { name: "endLoaded", group: ACTION, label: "Force towards the member ends (loaded ends, a<sub>3,t</sub>; e.g. a tension splice)", unit: "", kind: "checkbox", default: true },
    { name: "FEd", group: ACTION, label: "<b>F<sub>Ed</sub></b> — design force on the connection", unit: "kN", kind: "number", min: 0, max: 5000, default: 30 },
    { name: "alpha", group: ACTION, label: "<b>α</b> — angle between force and grain", unit: "°", kind: "number", min: 0, max: 90, default: 0 },
    { name: "serviceClass", group: FACTORS, label: "Service class", unit: "", kind: "select", options: ["1", "2", "3"], default: "1" },
    { name: "loadDuration", group: FACTORS, label: "Load-duration class (k<sub>mod</sub>)", unit: "", kind: "select", options: LOAD_DURATIONS, default: "medium-term" },
    { name: "gammaM", group: FACTORS, label: "<b>γ<sub>M</sub></b> — connections (EN 1995-1-1 Table 2.3)", unit: "—", kind: "number", min: 1, max: 2, default: 1.3, fallback: true }
];
export function normaliseTimberTimberInput(raw) {
    const checked = normaliseFields(raw, TIMBER_TIMBER_FIELDS);
    if (!checked.ok)
        return checked;
    const input = checked.values;
    const errors = [];
    const top = input.h - input.a4 - (input.rows - 1) * input.a2;
    if (!(top > 0))
        errors.push(`a4 and a2 place the fasteners outside the member depth h (top edge distance ${top.toFixed(0)} mm)`);
    if (input.fastener === "nail" && input.d > 8)
        errors.push("d of nails is limited to 8 mm here (EN 1995-1-1 8.3.1.1(6): larger nails follow the bolt rules)");
    if (input.fastener === "screw" && input.d > 12)
        errors.push("d of screws is limited to 12 mm here");
    if ((input.fastener === "bolt" || input.fastener === "dowel") && input.d < 6)
        errors.push("d of bolts and dowels must be at least 6 mm (EN 1995-1-1 8.5.1.1, 8.6)");
    return errors.length ? { ok: false, errors } : { ok: true, input };
}
// ------------------------------------------------------------------ EN building blocks (exported for tests and the API parity)
/** f_u,k of the fastener, MPa. */
export function timberFastenerFu(input) {
    if (input.fastener === "bolt")
        return { "4.6": 400, "5.6": 500, "8.8": 800 }[input.boltClass ?? "4.6"];
    if (input.fastener === "dowel")
        return steelStrength(input.dowelGrade ?? "S235", input.d).fu;
    return input.fu ?? 600;
}
/** M_y,Rk, N mm: (8.14) nails (square and grooved 0.45) and screws (8.7.1), (8.30) bolts and dowels. */
export function fastenerYieldMoment(fastener, d, fu, shank = "smooth") {
    return (fastener === "nail" && shank === "square" ? 0.45 : 0.3) * fu * d ** 2.6;
}
/** Nails up to 8 mm (8.3.1.1(5)-(6)) and screws up to 6 mm (8.7.1) use the nail rules. */
export function usesNailRules(fastener, d) {
    return (fastener === "nail" && d <= 8) || (fastener === "screw" && d <= 6);
}
/** k_90 for softwood (solid timber and glulam), (8.33). */
export function k90Softwood(d) {
    return 1.35 + 0.015 * d;
}
/**
 * Embedment strength f_h,k, MPa: nails and small screws (8.15) without and
 * (8.16) with predrilled holes, for any angle; bolts, dowels and larger screws
 * (8.32) with (8.31) and k_90 (8.33) at the angle alpha (degrees).
 */
export function embedmentStrength(fastener, d, rhoK, alphaDeg, predrilled) {
    if (usesNailRules(fastener, d))
        return predrilled ? 0.082 * (1 - 0.01 * d) * rhoK : 0.082 * rhoK * d ** -0.3;
    const fh0 = 0.082 * (1 - 0.01 * d) * rhoK;
    const a = alphaDeg * Math.PI / 180;
    return fh0 / (k90Softwood(d) * Math.sin(a) ** 2 + Math.cos(a) ** 2);
}
/** Rope-effect cap as a share of the Johansen part, 8.2.2(2). */
export function ropeEffectCap(fastener, shank = "smooth") {
    if (fastener === "nail")
        return shank === "smooth" ? 0.15 : shank === "square" ? 0.25 : 0.5;
    return { screw: 1.0, bolt: 0.25, dowel: 0 }[fastener];
}
/**
 * Characteristic resistance per shear plane and fastener, N: (8.6) single or
 * (8.7) double shear. The rope term F_ax,Rk/4 is added to modes c-f / j-k and
 * limited to ropeCap times the Johansen part (8.2.2(2)).
 */
export function johansenTimberTimber(shear, fh1, fh2, t1, t2, d, My, Fax, ropeCap) {
    const beta = fh2 / fh1;
    const oneHinge = 1.05 * fh1 * t1 * d / (2 + beta) * (Math.sqrt(2 * beta * (1 + beta) + 4 * beta * (2 + beta) * My / (fh1 * d * t1 * t1)) - beta);
    const twoHinges = 1.15 * Math.sqrt(2 * beta / (1 + beta)) * Math.sqrt(2 * My * fh1 * d);
    const raw = [];
    if (shear === "single") {
        const r = t2 / t1;
        raw.push({ key: "(8.6 a)", johansen: fh1 * t1 * d, rope: false }, { key: "(8.6 b)", johansen: fh2 * t2 * d, rope: false }, { key: "(8.6 c)", johansen: fh1 * t1 * d / (1 + beta) * (Math.sqrt(beta + 2 * beta * beta * (1 + r + r * r) + beta ** 3 * r * r) - beta * (1 + r)), rope: true }, { key: "(8.6 d)", johansen: oneHinge, rope: true }, { key: "(8.6 e)", johansen: 1.05 * fh1 * t2 * d / (1 + 2 * beta) * (Math.sqrt(2 * beta * beta * (1 + beta) + 4 * beta * (1 + 2 * beta) * My / (fh1 * d * t2 * t2)) - beta), rope: true }, { key: "(8.6 f)", johansen: twoHinges, rope: true });
    }
    else {
        raw.push({ key: "(8.7 g)", johansen: fh1 * t1 * d, rope: false }, { key: "(8.7 h)", johansen: 0.5 * fh2 * t2 * d, rope: false }, { key: "(8.7 j)", johansen: oneHinge, rope: true }, { key: "(8.7 k)", johansen: twoHinges, rope: true });
    }
    const modes = raw.map(mode => {
        const rope = mode.rope ? Math.min(Fax / 4, ropeCap * mode.johansen) : 0;
        return { key: mode.key, johansen: mode.johansen, rope, value: mode.johansen + rope };
    });
    const governing = modes.reduce((best, mode) => mode.value < best.value ? mode : best, modes[0]);
    return { modes, Fk: governing.value, governingMode: governing.key, ropeUsed: governing.rope, beta };
}
/**
 * Effective number of fasteners in a row parallel to the grain. Bolts, dowels
 * and screws over 6 mm: (8.34) n_ef = min(n, n^0.9 (a1 / 13 d)^0.25). Nails
 * and screws up to 6 mm: (8.17) n_ef = n^k_ef with k_ef from Table 8.1
 * (a1 >= 14d: 1.0; 10d: 0.85; 7d: 0.7; 4d: 0.5; linear in between and 0.5
 * below 4d; the table gives 4d for predrilled nails only, but Table 8.2 does
 * not allow such spacings without predrilling, so the spacing check fails there).
 */
export function effectiveNumberParallel(fastener, n, a1, d, predrilled) {
    if (n <= 1)
        return { nef: n, kef: null };
    if (!usesNailRules(fastener, d))
        return { nef: Math.min(n, n ** 0.9 * (a1 / (13 * d)) ** 0.25), kef: null };
    const s = a1 / d;
    const table = [[4, 0.5], [7, 0.7], [10, 0.85], [14, 1.0]];
    let kef;
    if (s >= 14)
        kef = 1.0;
    else if (s <= 4)
        kef = 0.5;
    else {
        const i = table.findIndex(([x]) => x >= s);
        const [x0, y0] = table[i - 1], [x1, y1] = table[i];
        kef = y0 + (y1 - y0) * (s - x0) / (x1 - x0);
    }
    return { nef: n ** kef, kef };
}
/**
 * Minimum spacings and distances: Table 8.2 (nails and screws up to 6 mm,
 * by rho_k and predrilling), Table 8.4 (bolts, screws over 6 mm), Table 8.5
 * (dowels). alpha in degrees (0-90); endLoaded selects a3,t or a3,c.
 */
export function spacingMinimums(fastener, d, rhoK, predrilled, alphaDeg, endLoaded) {
    const a = alphaDeg * Math.PI / 180;
    const sin = Math.sin(a), cos = Math.abs(Math.cos(a));
    if (usesNailRules(fastener, d)) {
        if (predrilled) {
            return { table: "8.2 (predrilled)", a1: (4 + cos) * d, a2: (3 + sin) * d, a3: endLoaded ? (7 + 5 * cos) * d : 7 * d,
                a4t: (d < 5 ? 3 + 2 * sin : 3 + 4 * sin) * d, a4c: 3 * d };
        }
        if (rhoK <= 420) {
            return { table: "8.2 (ρk ≤ 420)", a1: (d < 5 ? 5 + 5 * cos : 5 + 7 * cos) * d, a2: 5 * d, a3: endLoaded ? (10 + 5 * cos) * d : 10 * d,
                a4t: (d < 5 ? 5 + 2 * sin : 5 + 5 * sin) * d, a4c: 5 * d };
        }
        return { table: "8.2 (420 < ρk ≤ 500)", a1: (7 + 8 * cos) * d, a2: 7 * d, a3: endLoaded ? (15 + 5 * cos) * d : 15 * d,
            a4t: (d < 5 ? 7 + 2 * sin : 7 + 5 * sin) * d, a4c: 7 * d };
    }
    const a3t = Math.max(7 * d, 80);
    const a4t = Math.max((2 + 2 * sin) * d, 3 * d);
    if (fastener === "dowel") {
        return { table: "8.5", a1: (3 + 2 * cos) * d, a2: 3 * d, a3: endLoaded ? a3t : alphaDeg <= 30 ? 3 * d : Math.max(a3t * sin, 3 * d), a4t, a4c: 3 * d };
    }
    return { table: "8.4", a1: (4 + cos) * d, a2: 4 * d, a3: endLoaded ? a3t : alphaDeg <= 30 ? 4 * d : Math.max((1 + 6 * sin) * d, 4 * d), a4t, a4c: 3 * d };
}
/** Slip modulus K_ser per shear plane and fastener, N/mm, EN 1995-1-1 Table 7.1 with rho_m = sqrt(rho_m1 rho_m2) (7.1(2)). */
export function slipModulus(fastener, d, rhoMean1, rhoMean2, predrilled) {
    const rhoM = Math.sqrt(rhoMean1 * rhoMean2);
    return fastener === "nail" && !predrilled ? rhoM ** 1.5 * d ** 0.8 / 30 : rhoM ** 1.5 * d / 23;
}
export function checkTimberTimber(input) {
    const g = input;
    const FEd = g.FEd * 1000;
    const m1 = TIMBER_CLASSES[g.class1], m2 = TIMBER_CLASSES[g.class2];
    const kmod = kmodOf(g.serviceClass, g.loadDuration);
    const d = g.d;
    const shank = g.nailShank ?? "smooth";
    const predrilled = (g.fastener === "nail" || g.fastener === "screw") && g.predrilled === true;
    const fu = timberFastenerFu(g);
    const MyDeclared = (g.fastener === "nail" || g.fastener === "screw") && g.MyRk !== undefined;
    const My = MyDeclared ? g.MyRk * 1000 : fastenerYieldMoment(g.fastener, d, fu, shank);
    const nailRules = usesNailRules(g.fastener, d);
    const alphaRad = g.alpha * Math.PI / 180;
    const sin = Math.sin(alphaRad), cos = Math.cos(alphaRad);
    const fh1 = embedmentStrength(g.fastener, d, m1.rhoK, g.alpha, predrilled);
    const fh2 = embedmentStrength(g.fastener, d, m2.rhoK, g.alpha, predrilled);
    const fh10 = embedmentStrength(g.fastener, d, m1.rhoK, 0, predrilled);
    const fh20 = embedmentStrength(g.fastener, d, m2.rhoK, 0, predrilled);
    const planes = g.shear === "single" ? 1 : 2;
    // ---- rope effect, 8.2.2(2)
    const ropeCap = ropeEffectCap(g.fastener, shank);
    const ropeOn = g.ropeEffect === true && g.fastener !== "dowel";
    let Fax = 0;
    let washerBearing = Infinity, boltTension = Infinity;
    if (ropeOn && g.fastener === "bolt") {
        const As = BOLT_STRESS_AREA[d] ?? Math.PI * d * d / 4 * 0.78;
        boltTension = 0.9 * fu * As;
        // washers (outer diameter 3d, hole d + 1) bear on the outer faces: both members in single shear, the outer members in double shear
        const fc90 = g.shear === "single" ? Math.min(m1.fc90k, m2.fc90k) : m1.fc90k;
        washerBearing = 3 * fc90 * Math.PI / 4 * ((3 * d) ** 2 - (d + 1) ** 2);
        Fax = Math.min(boltTension, washerBearing);
    }
    else if (ropeOn)
        Fax = (g.FaxRk ?? 0) * 1000;
    const perPlane = johansenTimberTimber(g.shear, fh1, fh2, g.t1, g.t2, d, My, Fax, ropeCap);
    const perPlane0 = johansenTimberTimber(g.shear, fh10, fh20, g.t1, g.t2, d, My, Fax, ropeCap);
    const FvRd = kmod * planes * perPlane.Fk / g.gammaM;
    const FvRd0 = kmod * planes * perPlane0.Fk / g.gammaM;
    // ---- effective number of one row: bolts, dowels and larger screws (8.34) interpolated linearly to n at
    // 90 degrees (8.5.1.1(4)); nails and small screws (8.17) for the force component along the row (8.1.2(4)-(5)):
    // one row carries min(n, n_ef / cos alpha) F_v,Rk
    const n = g.perRow;
    const effective = effectiveNumberParallel(g.fastener, n, g.a1, d, predrilled);
    const nef0 = effective.nef;
    const nefAlpha = nailRules
        ? (Math.abs(cos) <= 1e-12 ? n : Math.min(n, nef0 / Math.abs(cos)))
        : nef0 + (n - nef0) * g.alpha / 90;
    const FvefRd = g.rows * nefAlpha * FvRd;
    const checks = new CheckList("Fasteners — EN 1995-1-1 8.2.2");
    const groupRef = nailRules ? "EN 1995-1-1 8.1.2(4)-(5), 8.3.1.1(8), Table 8.1" : "EN 1995-1-1 8.2.2, 8.5.1.1(4), (8.34)";
    checks.resistance("group", `Fastener group: F<sub>Ed</sub> ≤ n<sub>r</sub> n<sub>ef</sub> F<sub>v,Rd</sub> (α = ${g.alpha}°${nailRules ? ", n<sub>ef</sub> = min(n, n<sub>ef,0</sub>/cos α)" : ""})`, FEd, FvefRd, "N", groupRef);
    if (!nailRules && g.alpha > 0 && g.alpha < 90) {
        checks.resistance("group-parallel", "Component along the rows: F<sub>Ed</sub> cos α ≤ n<sub>r</sub> n<sub>ef,0</sub> F<sub>v,0,Rd</sub>", FEd * cos, g.rows * nef0 * FvRd0, "N", "EN 1995-1-1 8.1.2(4)-(5)");
    }
    // ---- splitting (8.1.4): each member is loaded towards the opposite edge
    const groupDepth = (g.rows - 1) * g.a2;
    const topEdge = g.h - g.a4 - groupDepth;
    const F90 = (b, he) => kmod * 14 * b * Math.sqrt(he / (1 - he / g.h)) / g.gammaM;
    if (g.alpha > 0) {
        const share1 = g.shear === "single" ? 1 : 0.5;
        checks.resistance("splitting-2", `Splitting of member ${g.shear === "single" ? "2" : "2 (inner)"}: F<sub>Ed</sub> sin α ≤ F<sub>90,Rd</sub> (b = t<sub>2</sub>, h<sub>e</sub> = ${(g.a4 + groupDepth).toFixed(0)} mm)`, FEd * sin, F90(g.t2, g.a4 + groupDepth), "N", "EN 1995-1-1 8.1.4", "full perpendicular component taken as the shear force on one side of the connection");
        checks.resistance("splitting-1", `Splitting of ${g.shear === "single" ? "member 1" : "each outer member"}: ${share1 === 1 ? "" : "½ "}F<sub>Ed</sub> sin α ≤ F<sub>90,Rd</sub> (b = t<sub>1</sub>, h<sub>e</sub> = ${(topEdge + groupDepth).toFixed(0)} mm from the top edge)`, share1 * FEd * sin, F90(g.t1, topEdge + groupDepth), "N", "EN 1995-1-1 8.1.4");
    }
    // ---- spacings and distances (the denser member decides for nails)
    const rhoSpacing = Math.max(m1.rhoK, m2.rhoK);
    const minimums = spacingMinimums(g.fastener, d, rhoSpacing, predrilled, g.alpha, g.endLoaded);
    const tableRef = `EN 1995-1-1 Table ${minimums.table}`;
    checks.setGroup(`Spacings and distances — Table ${minimums.table}`);
    if (g.perRow > 1)
        checks.minimum("a1", "Spacing along the grain a<sub>1</sub>", g.a1, minimums.a1, "mm", tableRef);
    if (g.rows > 1)
        checks.minimum("a2", "Spacing across the grain a<sub>2</sub>", g.a2, minimums.a2, "mm", tableRef);
    checks.minimum("a3", `End distance a<sub>3,${g.endLoaded ? "t" : "c"}</sub> (each member)`, g.a3, minimums.a3, "mm", tableRef);
    const edgeMin = g.alpha > 0 ? minimums.a4t : minimums.a4c;
    const edgeLabel = g.alpha > 0 ? "a<sub>4,t</sub> (one member is loaded towards each edge)" : "a<sub>4,c</sub>";
    checks.minimum("a4-bottom", `Bottom edge distance a<sub>4</sub> ≥ ${edgeLabel}`, g.a4, edgeMin, "mm", tableRef);
    checks.minimum("a4-top", `Top edge distance h − a<sub>4</sub> − (n<sub>r</sub> − 1) a<sub>2</sub> ≥ ${edgeLabel}`, topEdge, edgeMin, "mm", tableRef);
    if (rhoSpacing > 500 && nailRules && !predrilled)
        checks.info("rho-500", "Table 8.2 without predrilling covers ρ<sub>k</sub> ≤ 500 kg/m³ only", "fail", tableRef);
    // ---- nails and small screws: detailing of 8.3.1.2
    if (g.fastener === "nail") {
        checks.setGroup("Nail detailing — EN 1995-1-1 8.3.1.2");
        const penetration = shank === "smooth" ? 8 * d : 6 * d;
        // single shear: the point side is member 2; double shear: the nail ends in the far outer member (t1)
        const pointSide = g.shear === "single" ? g.t2 : g.t1;
        checks.minimum("penetration", `Point-side penetration ${g.shear === "single" ? "t<sub>2</sub>" : "in the far outer member t<sub>1</sub>"} ≥ ${shank === "smooth" ? 8 : 6} d`, pointSide, penetration, "mm", "EN 1995-1-1 8.3.1.2");
        if (!predrilled) {
            const tMin = Math.max(7 * d, (13 * d - 30) * Math.max(m1.rhoK, m2.rhoK) / 400);
            checks.minimum("thickness", "Thinnest member without predrilling min(t<sub>1</sub>, t<sub>2</sub>) ≥ max(7d, (13d − 30) ρ<sub>k</sub>/400)", Math.min(g.t1, g.t2), tMin, "mm", "EN 1995-1-1 (8.18)");
            if (d > 6)
                checks.info("predrill-d", "Nails over 6 mm need predrilled holes", "fail", "EN 1995-1-1 8.3.1.2(2)");
        }
    }
    if (g.fastener === "screw" && MyDeclared === false)
        checks.info("screw-my", "M<sub>y,Rk</sub> of the screw from (8.14) with d<sub>ef</sub>; a product declaration (ETA) usually gives it", "warning", "EN 1995-1-1 8.7.1");
    if (g.fastener === "bolt")
        checks.info("bolt-holes", "Bolt holes in timber at most 1 mm oversize; washers ≥ 3d and 0.3d thick", "ok", "EN 1995-1-1 10.4.3");
    // ---- serviceability stiffness (information for the FE check)
    const rhoMean1 = TIMBER_MEAN_DENSITY[g.class1], rhoMean2 = TIMBER_MEAN_DENSITY[g.class2];
    const Kser = slipModulus(g.fastener, d, rhoMean1, rhoMean2, predrilled);
    const kN = 1000;
    const fastenerText = g.fastener === "bolt" ? `bolt ${g.boltClass ?? "4.6"}` : g.fastener === "dowel" ? `dowel ${g.dowelGrade ?? "S235"}` : g.fastener === "nail" ? `${shank} nail` : "screw";
    const values = [
        { title: "Materials and factors", rows: [
                { label: `${g.class1} / ${g.class2}: ρ<sub>k</sub>; f<sub>c,90,k</sub>`, value: `${m1.rhoK} / ${m2.rhoK}; ${m1.fc90k} / ${m2.fc90k}`, unit: "kg/m³; MPa" },
                { label: `k<sub>mod</sub> (service class ${g.serviceClass}, ${g.loadDuration}); γ<sub>M</sub>`, value: `${kmod}; ${g.gammaM}`, unit: "—" },
                { label: `Fastener f<sub>u,k</sub> (${fastenerText})`, value: fu, unit: "MPa", digits: 0 }
            ] },
        { title: `Fastener — EN 1995-1-1 ${nailRules ? "8.3.1.1" : "8.5.1.1"}`, rows: [
                { label: MyDeclared ? "M<sub>y,Rk</sub> (product declaration)" : `M<sub>y,Rk</sub> = ${g.fastener === "nail" && shank === "square" ? "0.45" : "0.3"} f<sub>u,k</sub> d<sup>2.6</sup>`, value: My / 1000, unit: "Nm", digits: 2 },
                nailRules
                    ? { label: predrilled ? "f<sub>h,k</sub> = 0.082 (1 − 0.01 d) ρ<sub>k</sub> (8.16), any angle" : "f<sub>h,k</sub> = 0.082 ρ<sub>k</sub> d<sup>−0.3</sup> (8.15), any angle", value: `${fh1.toFixed(2)} / ${fh2.toFixed(2)}`, unit: "MPa" }
                    : { label: `f<sub>h,α,k</sub> = f<sub>h,0,k</sub> / (k<sub>90</sub> sin²α + cos²α), k<sub>90</sub> = ${k90Softwood(d).toFixed(3)}, α = ${g.alpha}°`, value: `${fh1.toFixed(2)} / ${fh2.toFixed(2)}`, unit: "MPa" },
                { label: "β = f<sub>h,2,k</sub> / f<sub>h,1,k</sub>", value: perPlane.beta, unit: "—", digits: 3 },
                { label: ropeOn ? (g.fastener === "bolt" ? "F<sub>ax,Rk</sub> = min(0.9 f<sub>u</sub> A<sub>s</sub>, 3 f<sub>c,90,k</sub> A<sub>washer</sub>)" : "F<sub>ax,Rk</sub> (input)") : "Rope effect", value: ropeOn ? (Fax / kN).toFixed(2) : "not counted", unit: ropeOn ? "kN" : "" },
                { label: `Rope-effect cap (8.2.2(2)); rope term used`, value: `${(ropeCap * 100).toFixed(0)} %; ${(perPlane.ropeUsed / kN).toFixed(3)}`, unit: "—; kN" },
                { label: `F<sub>v,Rk</sub> per shear plane: ${perPlane.governingMode}`, value: perPlane.Fk / kN, unit: "kN", digits: 3 },
                { label: `F<sub>v,Rd</sub> = k<sub>mod</sub> × ${planes} × F<sub>v,Rk</sub> / γ<sub>M</sub> per fastener (α); along the grain`, value: `${(FvRd / kN).toFixed(3)}; ${(FvRd0 / kN).toFixed(3)}`, unit: "kN" }
            ] },
        { title: "Group", rows: [
                { label: nailRules ? `n<sub>ef,0</sub> = n<sup>k<sub>ef</sub></sup>, k<sub>ef</sub> = ${effective.kef?.toFixed(3) ?? "—"} (Table 8.1); n<sub>ef</sub>(α) = min(n, n<sub>ef,0</sub>/cos α)` : "n<sub>ef,0</sub> = min(n, n<sup>0.9</sup> (a<sub>1</sub>/(13d))<sup>0.25</sup>); n<sub>ef</sub>(α)", value: `${nef0.toFixed(3)}; ${nefAlpha.toFixed(3)}`, unit: "—" },
                { label: "F<sub>v,ef,Rd</sub> = n<sub>r</sub> n<sub>ef</sub> F<sub>v,Rd</sub>", value: FvefRd / kN, unit: "kN" },
                { label: "K<sub>ser</sub> per shear plane and fastener (Table 7.1, ρ<sub>m</sub> = √(ρ<sub>m,1</sub> ρ<sub>m,2</sub>))", value: Kser, unit: "N/mm", digits: 0 }
            ] }
    ];
    const notes = [
        "Johansen modes per EN 1995-1-1 (8.6) single shear and (8.7) double shear; the rope term F_ax,Rk/4 is added to the modes with fastener rotation or hinges and limited per 8.2.2(2): smooth nails 15 %, square or grooved nails 25 %, other nails 50 %, screws 100 %, bolts 25 %, dowels 0 %.",
        "Embedment: nails up to 8 mm and screws up to 6 mm per (8.15)/(8.16) for any angle; bolts, dowels and larger screws per (8.31)-(8.33) with k_90 for softwood (solid timber and glulam). Hardwood and LVL are not covered.",
        "All members have parallel grain; the force acts at α to it. In double shear, t1 is each outer member and t2 the inner member; nails from both sides overlapping in the inner member need (t − t2) > 4d (8.3.1.1(7)), not checked.",
        "The effective number applies per row parallel to the grain: bolts, dowels and screws over 6 mm per (8.34), interpolated linearly to n at 90° (8.5.1.1(4)); nails and screws up to 6 mm per (8.17) and Table 8.1 for the force component along the row, i.e. one row carries min(n, n_ef/cos α) F_v,Rk. Rows staggered by at least 1d (no reduction) are not modelled (conservative).",
        "Splitting takes the whole perpendicular component as the shear force on one side of the connection; one member is loaded towards each edge, so both edge distances are checked against a4,t when α > 0.",
        "Not covered: block shear and plug shear (Annex A), net sections, moments from eccentricity in the group, members at an angle to each other, axially loaded fasteners (F_ax,Rk of nails and screws is an input).",
        "Partial factors default to the recommended values; check the National Annex that applies to the project."
    ];
    return {
        checks: checks.rows, values, notes, ...summariseChecks(checks.rows),
        kmod, fu, My, nailRules, fh1, fh2, fh10, fh20, planes, Fax, ropeCap, perPlane, perPlane0, FvRd, FvRd0, nef0, kef: effective.kef, nefAlpha, FvefRd,
        minimums, Kser, rhoMean1, rhoMean2
    };
}
