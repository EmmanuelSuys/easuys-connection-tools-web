/**
 * Fixings in existing masonry without resin bond or masonry tension: port of the dowel and pocket part of
 * MasonSection/anchorage_existing_masonry.py (EA_Suys0 scripts), same formulas and refusals:
 *
 * - dowelInMasonry: steel dowel or pin in a grouted hole loaded in SHEAR, bearing on the masonry at the design
 *   compressive strength f_d (embedment strength f_h = f_d, no bond): the lower of the yield mode (one plastic
 *   hinge, V = f_d d_h (sqrt(e² + 2 M_y/(f_d d_h)) - e)) and the rigid-pin mode (V = f_d d_h (sqrt((L + 2e)² + L²)
 *   - (L + 2e))); M_y = f_y d_s³/6 (plastic, d_s from the stressed area); steel shear alpha_v f_ub A_s / gamma_M2
 *   (EN 1993-1-8 Table 3.4, threads in the shear plane). Refused when the embedment is shorter than the hinge depth.
 * - bed-joint sliding, EN 1996-1-1 3.6.2 (3.5)/(3.6): f_vk = f_vk0 + 0.4 sigma_d <= 0.065 f_b (filled perpends) or
 *   0.5 f_vk0 + 0.4 sigma_d <= 0.045 f_b (unfilled), sigma_d < 0 taken as 0; across the wall one unit bed face per
 *   course reached, along the wall over the tributary length.
 * - uplift resisted only by the dead weight of the masonry above (EQU, EN 1990 Table A1.2(A) gamma_G,stb = 0.9,
 *   never raised).
 * - pocketPin, crestDowel, upliftTie, pocketHoldDown: the mechanisms built from these. The hold-down spreads at
 *   most 30 deg from the vertical (60 deg to the horizontal, as EN 1996-1-1 6.1.3), width at mid-height.
 *
 * Partial factor of the masonry: Belgian NBN EN 1996-1-1 Table 2.1-ANB, rows A-C and execution classes S/N. It may
 * be raised, never lowered. EN 1993-1-8 gamma_M2 = 1.25 and EN 1990 gamma_G,stb = 0.9 use recommended values.
 * Units: kN, mm, MPa; the source's lengths in m are kept where the name ends in M.
 */
import { CheckList, normaliseFields, summariseChecks } from "./checks.js";
/** Belgian NBN EN 1996-1-1 Table 2.1-ANB, gamma_M by unit row and execution control class. */
export const EN1996_GAMMA_M = {
    A: { S: 2.0, N: 2.5 },
    B: { S: 2.3, N: 2.8 },
    C: { S: 3.0, N: 3.5 }
};
export const MASONRY_ROWS = {
    A: "A: units of category I, designed mortar",
    B: "B: units of category I, prescribed mortar",
    C: "C: units of category II, any mortar"
};
/** EN 1993-1-8 Table 3.1 (f_yb, f_ub) and Table 3.4 (alpha_v, shear plane through the thread). */
export const ROD_GRADES = { "4.6": [240, 400, 0.6], "4.8": [320, 400, 0.5], "5.6": [300, 500, 0.6], "5.8": [400, 500, 0.5], "6.8": [480, 600, 0.5], "8.8": [640, 800, 0.6], "10.9": [900, 1000, 0.5] };
/** EN 1993-1-8 Table 2.1, recommended value. */
export const GAMMA_M2 = 1.25;
/** EN 1990 Table A1.2(A), EQU, favourable permanent action (recommended value). */
export const GAMMA_G_STB = 0.9;
export function tableGammaM(row, cls) {
    const values = EN1996_GAMMA_M[row];
    if (!values || (cls !== "S" && cls !== "N"))
        throw new Error("row must be A, B or C and execution class S or N (NBN EN 1996-1-1 Table 2.1-ANB)");
    return values[cls];
}
export function masonryGammaM(m) {
    const table = tableGammaM(m.row, m.cls);
    if (m.gammaM === undefined)
        return table;
    if (!Number.isFinite(m.gammaM) || m.gammaM < table - 1e-12)
        throw new Error(`gamma_M ${m.gammaM} is below ${table} of EN 1996-1-1 Table 2.1 (row ${m.row}, class ${m.cls}); the partial factor is never lowered`);
    return m.gammaM;
}
export function rodRefusals(rod) {
    const errors = [];
    if (!(rod.grade in ROD_GRADES))
        errors.push(`grade must be one of ${Object.keys(ROD_GRADES).join(", ")}`);
    if (rod.hole < rod.d)
        errors.push("hole must be at least d");
    return errors;
}
/** f_vd = f_vk / gamma_M, EN 1996-1-1 (3.5)/(3.6). */
export function bedJointFvd(m, sigmaD) {
    const sd = Math.max(sigmaD, 0);
    const fvk = m.perpends === "unfilled" ? Math.min(0.5 * m.fvk0 + 0.4 * sd, 0.045 * m.fb) : Math.min(m.fvk0 + 0.4 * sd, 0.065 * m.fb);
    return fvk / masonryGammaM(m);
}
function gammaStb(g) {
    if (!Number.isFinite(g) || g <= 0 || g > GAMMA_G_STB + 1e-12)
        throw new Error(`gamma_G,stb ${g} above ${GAMMA_G_STB} (EN 1990 Table A1.2(A): EQU); a favourable dead weight is never factored up`);
    return g;
}
/** Design compressive stress (MPa) from hAboveM of masonry plus a permanent line load (kN/m), with gamma_G,stb. */
export function sigmaDFavourable(m, hAboveM, tM, lineLoad = 0, gStb = GAMMA_G_STB) {
    const g = gammaStb(gStb);
    if (!(tM > 0))
        throw new Error("t must be positive");
    return g * (m.unitWeight * Math.max(hAboveM, 0) + Math.max(lineLoad, 0) / tM) / 1000;
}
/** Stabilising dead weight of the masonry above a tie or pocket (EQU), kN. */
export function deadWeightAbove(m, widthM, heightM, tM, gStb = GAMMA_G_STB) {
    const g = gammaStb(gStb);
    if (!(widthM > 0) || !(tM > 0))
        throw new Error("width and t must be positive");
    return g * m.unitWeight * widthM * Math.max(heightM, 0) * tM;
}
/** Grouted dowel or pin in shear at e from the masonry face, bearing only (see the header), kN. */
export function dowelInMasonry(m, rod, e, L) {
    if (!(e >= 0))
        throw new Error("e must be >= 0");
    if (!(L > 0))
        throw new Error("embedment must be positive");
    const gammaM = masonryGammaM(m);
    const fd = m.fk / gammaM;
    const dh = rod.hole;
    const ds = Math.sqrt(4 * rod.As / Math.PI);
    const [fy, fu, alphaV] = ROD_GRADES[rod.grade];
    const My = fy * ds ** 3 / 6;
    const hinge = Math.sqrt(e * e + 2 * My / (fd * dh)) - e;
    if (L < hinge - 1e-9)
        throw new Error(`dowel too short: embedment ${L} mm < hinge depth ${hinge.toFixed(0)} mm`);
    const VHinge = fd * dh * hinge / 1000;
    const a = L + 2 * e;
    const VRigid = fd * dh * (Math.sqrt(a * a + L * L) - a) / 1000;
    const VBear = Math.min(VHinge, VRigid);
    const VSteel = alphaV * fu * rod.As / GAMMA_M2 / 1000;
    const courses = Math.max(1, Math.floor(Math.min(L, 2 * hinge) / m.course));
    return { hinge, VHinge, VRigid, mode: VHinge <= VRigid ? "hinge" : "rigid", VBear, VSteel, courses, VRd: Math.min(VBear, VSteel), My, fd, gammaM, ds };
}
/** Units pushed out of the wall face (across the wall): one unit bed face per course reached, kN. */
export function bedJointSlideAcross(m, courses, sigmaD) {
    if (!Number.isInteger(courses) || courses < 1)
        throw new Error("courses must be a positive integer");
    return courses * m.unitL * m.unitB * bedJointFvd(m, sigmaD) / 1000;
}
/** Bed joint along the wall over the tributary length (head joints in compression), kN. */
export function bedJointSlideAlong(m, length, t, sigmaD) {
    if (!(length > 0) || !(t > 0))
        throw new Error("length and t must be positive");
    return length * t * bedJointFvd(m, sigmaD) / 1000;
}
export function pocketPin(m, rod, e, depth, sigmaD) {
    const d = dowelInMasonry(m, rod, e, depth);
    const VSlide = bedJointSlideAcross(m, d.courses, sigmaD);
    return { ...d, VSlide, Rd: Math.min(d.VRd, VSlide), sigmaD, fvd: bedJointFvd(m, sigmaD) };
}
export function crestDowel(m, rod, e, depth, sigmaD, trib, t) {
    const d = dowelInMasonry(m, rod, e, depth);
    const slideAlong = bedJointSlideAlong(m, trib, t, sigmaD);
    const slideAcross = bedJointSlideAcross(m, d.courses, sigmaD);
    return { ...d, slideAlong, slideAcross, along: Math.min(d.VRd, slideAlong), across: Math.min(d.VRd, slideAcross), sigmaD, fvd: bedJointFvd(m, sigmaD) };
}
export function upliftTie(m, rod, e, embed, depthBelowCrestM, widthM, tM, dowels = 1, gStb = GAMMA_G_STB) {
    if (!Number.isInteger(dowels) || dowels < 1)
        throw new Error("dowels must be a positive integer");
    const d = dowelInMasonry(m, rod, e, embed);
    const W = deadWeightAbove(m, widthM, depthBelowCrestM, tM, gStb);
    return { ...d, W, dowels, Rd: Math.min(d.VRd * dowels, W) };
}
export function pocketHoldDown(m, blockWidthM, hAboveM, tM, roofGk = 0, spreadDeg = 30, gStb = GAMMA_G_STB) {
    if (!(spreadDeg >= 0 && spreadDeg <= 30))
        throw new Error("spread must lie in 0..30° from the vertical (EN 1996-1-1 6.1.3: 60° to the horizontal)");
    const g = gammaStb(gStb);
    if (!(hAboveM >= 0))
        throw new Error("h above must be >= 0");
    if (!(blockWidthM > 0) || !(tM > 0))
        throw new Error("block width and t must be positive");
    const width = blockWidthM + 2 * (hAboveM / 2) * Math.tan(spreadDeg * Math.PI / 180);
    const masonry = deadWeightAbove(m, width, hAboveM, tM, g);
    const roof = g * Math.max(roofGk, 0) * width;
    return { width, hAboveM, tM, masonry, roof, Rd: masonry + roof, gammaGstb: g };
}
const MASONRY = "Existing masonry";
const ROD = "Dowel or pin (grouted hole)";
const GEOM = "Geometry and loads above";
const ACTION = "Design action";
const masonryStrength = [
    { name: "fk", group: MASONRY, label: "<b>f<sub>k</sub></b> — characteristic compressive strength", unit: "MPa", kind: "number", min: 0.5, max: 30, default: 3.65 },
    { name: "row", group: MASONRY, label: "gamma_M masonry category, NBN EN 1996-1-1 Table 2.1-ANB", unit: "", kind: "select", options: ["A", "B", "C"], default: "A" },
    { name: "cls", group: MASONRY, label: "Execution control class (Belgian ANB)", unit: "", kind: "select", options: ["S", "N"], default: "N" },
    { name: "gammaM", group: MASONRY, label: "<b>γ<sub>M</sub></b> raised to (empty: table value; never lower)", unit: "—", kind: "number", min: 1, max: 5, optional: true }
];
const masonryShear = [
    { name: "fvk0", group: MASONRY, label: "<b>f<sub>vk0</sub></b> — initial shear strength", unit: "MPa", kind: "number", min: 0.01, max: 1, default: 0.1 },
    { name: "fb", group: MASONRY, label: "<b>f<sub>b</sub></b> — normalised unit strength", unit: "MPa", kind: "number", min: 1, max: 100, default: 15 },
    { name: "perpends", group: MASONRY, label: "Perpend (head) joints", unit: "", kind: "select", options: ["unfilled", "filled"], default: "unfilled" },
    { name: "unitL", group: MASONRY, label: "Unit length (bed face)", unit: "mm", kind: "number", min: 50, max: 600, default: 190 },
    { name: "unitB", group: MASONRY, label: "Unit width (bed face)", unit: "mm", kind: "number", min: 50, max: 500, default: 90 },
    { name: "course", group: MASONRY, label: "Course height (unit + bed joint)", unit: "mm", kind: "number", min: 30, max: 400, default: 60 }
];
const unitWeight = { name: "unitWeight", group: MASONRY, label: "Unit weight of the masonry", unit: "kN/m³", kind: "number", min: 5, max: 25, default: 18 };
const rodFields = [
    { name: "d", group: ROD, label: "<b>d</b> — rod diameter", unit: "mm", kind: "number", min: 6, max: 36, default: 20 },
    { name: "As", group: ROD, label: "<b>A<sub>s</sub></b> — stressed area", unit: "mm²", kind: "number", min: 10, max: 1000, default: 245 },
    { name: "grade", group: ROD, label: "Grade (EN 1993-1-8 Table 3.1)", unit: "", kind: "select", options: Object.keys(ROD_GRADES), default: "5.8" },
    { name: "hole", group: ROD, label: "<b>d<sub>h</sub></b> — drilled hole (grouted) diameter", unit: "mm", kind: "number", min: 6, max: 60, default: 25 },
    { name: "e", group: ROD, label: "<b>e</b> — load above the masonry face (lever arm)", unit: "mm", kind: "number", min: 0, max: 300, default: 25 }
];
const fsd = [
    { name: "hAbove", group: GEOM, label: "Masonry above the joint for σ<sub>d</sub>", unit: "mm", kind: "number", min: 0, max: 20000, default: 550 },
    { name: "lineLoad", group: GEOM, label: "Permanent line load on the wall for σ<sub>d</sub>", unit: "kN/m", kind: "number", min: 0, max: 500, default: 0 },
    { name: "t", group: GEOM, label: "<b>t</b> — wall thickness", unit: "mm", kind: "number", min: 50, max: 1500, default: 270 }
];
const gstb = { name: "gammaGstb", group: ACTION, label: "<b>γ<sub>G,stb</sub></b> — favourable dead weight (EQU; never above 0.9)", unit: "—", kind: "number", min: 0.5, max: GAMMA_G_STB, default: GAMMA_G_STB, fallback: true };
export const MASONRY_FIXING_FIELDS = {
    "bed-joint-slide": [...masonryStrength, ...masonryShear, unitWeight, ...fsd,
        { name: "direction", group: GEOM, label: "Sliding direction", unit: "", kind: "select", options: ["along", "across"], default: "along" },
        { name: "length", group: GEOM, label: "Bed-joint length along the wall", unit: "mm", kind: "number", min: 50, max: 10000, default: 600, showIf: { direction: ["along"] } },
        { name: "courses", group: GEOM, label: "Number of bed courses mobilised across the wall", unit: "", kind: "integer", min: 1, max: 50, default: 1, showIf: { direction: ["across"] } },
        { name: "HEd", group: ACTION, label: "Design shear force parallel to the bed joint", unit: "kN", kind: "number", min: 0, max: 500, default: 2 }],
    "pocket-pin": [...masonryStrength, ...masonryShear, unitWeight, ...rodFields,
        { name: "depth", group: ROD, label: "<b>L</b> — embedment below the pocket floor", unit: "mm", kind: "number", min: 10, max: 2000, default: 250 },
        ...fsd, gstb,
        { name: "HEd", group: ACTION, label: "<b>H<sub>Ed</sub></b> — pull along the member, out of the pocket", unit: "kN", kind: "number", min: 0, max: 500, default: 2 }],
    "crest-dowel": [...masonryStrength, ...masonryShear, unitWeight, ...rodFields,
        { name: "depth", group: ROD, label: "<b>L</b> — embedment below the crest", unit: "mm", kind: "number", min: 10, max: 2000, default: 250 },
        { name: "hAbove", group: GEOM, label: "Masonry above the crest for σ<sub>d</sub> (usually 0)", unit: "mm", kind: "number", min: 0, max: 20000, default: 0 },
        { name: "lineLoad", group: GEOM, label: "Permanent line load on the crest for σ<sub>d</sub>", unit: "kN/m", kind: "number", min: 0, max: 500, default: 5.4 },
        { name: "t", group: GEOM, label: "<b>t</b> — wall thickness", unit: "mm", kind: "number", min: 50, max: 1500, default: 270 },
        { name: "trib", group: GEOM, label: "Tributary length of the dowel along the wall", unit: "mm", kind: "number", min: 50, max: 10000, default: 600 },
        gstb,
        { name: "VAlong", group: ACTION, label: "<b>V<sub>Ed,along</sub></b> — shear along the wall", unit: "kN", kind: "number", min: 0, max: 500, default: 1.5 },
        { name: "VAcross", group: ACTION, label: "<b>V<sub>Ed,across</sub></b> — shear across the wall", unit: "kN", kind: "number", min: 0, max: 500, default: 0.5 }],
    "uplift-tie": [...masonryStrength, unitWeight, ...rodFields,
        { name: "depth", group: ROD, label: "<b>L</b> — embedment of each horizontal dowel", unit: "mm", kind: "number", min: 10, max: 2000, default: 250 },
        { name: "dowels", group: ROD, label: "Dowels in the strap", unit: "—", kind: "integer", min: 1, max: 10, default: 1 },
        { name: "depthBelowCrest", group: GEOM, label: "Dowel depth below the crest (masonry above it)", unit: "mm", kind: "number", min: 0, max: 20000, default: 600 },
        { name: "width", group: GEOM, label: "Masonry width taken by the tie", unit: "mm", kind: "number", min: 50, max: 10000, default: 500 },
        { name: "t", group: GEOM, label: "<b>t</b> — wall thickness", unit: "mm", kind: "number", min: 50, max: 1500, default: 270 },
        gstb,
        { name: "NEd", group: ACTION, label: "<b>N<sub>Ed</sub></b> — uplift on the strap", unit: "kN", kind: "number", min: 0, max: 500, default: 1.2 }],
    "hold-down": [unitWeight,
        { name: "block", group: GEOM, label: "<b>b</b> — width of the member (block) in the pocket", unit: "mm", kind: "number", min: 20, max: 2000, default: 63 },
        { name: "hAbove", group: GEOM, label: "<b>h</b> — solid masonry above the member", unit: "mm", kind: "number", min: 0, max: 20000, default: 550 },
        { name: "t", group: GEOM, label: "<b>t</b> — wall thickness", unit: "mm", kind: "number", min: 50, max: 1500, default: 270 },
        { name: "spread", group: GEOM, label: "Spread from the vertical on each side (≤ 30°)", unit: "°", kind: "number", min: 0, max: 45, default: 30 },
        { name: "roofGk", group: GEOM, label: "Permanent roof line load on that wall", unit: "kN/m", kind: "number", min: 0, max: 200, default: 1.37 },
        gstb,
        { name: "NEd", group: ACTION, label: "<b>N<sub>Ed</sub></b> — uplift of the member end", unit: "kN", kind: "number", min: 0, max: 500, default: 0.8 }]
};
function masonryOf(v) {
    return { fk: v.fk ?? 1, fvk0: v.fvk0 ?? 0.1, fb: v.fb ?? 10, row: v.row ?? "A", cls: v.cls ?? "N",
        unitWeight: v.unitWeight, unitL: v.unitL ?? 190, unitB: v.unitB ?? 90, course: v.course ?? 60,
        perpends: v.perpends ?? "unfilled", ...(v.gammaM !== undefined ? { gammaM: v.gammaM } : {}) };
}
function rodOf(v) { return { d: v.d, As: v.As, grade: v.grade, hole: v.hole }; }
export function normaliseMasonryFixingInput(kind, raw) {
    const checked = normaliseFields(raw, MASONRY_FIXING_FIELDS[kind]);
    if (!checked.ok)
        return checked;
    const input = { ...checked.values, kind };
    const errors = [];
    if (kind === "bed-joint-slide") {
        try {
            masonryGammaM(masonryOf(input));
        }
        catch (error) {
            errors.push(`gammaM ${error.message.replace(/^gamma_M /, "")}`);
        }
    }
    else if (kind !== "hold-down") {
        try {
            masonryGammaM(masonryOf(input));
        }
        catch (error) {
            errors.push(`gammaM ${error.message.replace(/^gamma_M /, "")}`);
        }
        errors.push(...rodRefusals(rodOf(input)));
        if (!errors.length) {
            try {
                dowelInMasonry(masonryOf(input), rodOf(input), input.e, input.depth);
            }
            catch (error) {
                errors.push(`depth: ${error.message}`);
            }
        }
    }
    else if (input.spread > 30)
        errors.push("spread must not exceed 30° from the vertical (EN 1996-1-1 6.1.3: 60° to the horizontal)");
    return errors.length ? { ok: false, errors } : { ok: true, input };
}
function dowelRows(d) {
    return { title: "Dowel in shear — bearing at f<sub>d</sub>, EN 1993-1-8 Table 3.4", rows: [
            { label: `f<sub>d</sub> = f<sub>k</sub> / γ<sub>M</sub> (γ<sub>M</sub> = ${d.gammaM})`, value: d.fd, unit: "MPa", digits: 3 },
            { label: "d<sub>s</sub> = √(4 A<sub>s</sub>/π); M<sub>y</sub> = f<sub>y</sub> d<sub>s</sub>³/6", value: `${d.ds.toFixed(2)} mm; ${(d.My / 1e3).toFixed(1)} kN mm`, unit: "" },
            { label: "Hinge depth x = √(e² + 2 M<sub>y</sub>/(f<sub>d</sub> d<sub>h</sub>)) − e", value: d.hinge, unit: "mm", digits: 1 },
            { label: "V<sub>hinge</sub> = f<sub>d</sub> d<sub>h</sub> x", value: d.VHinge, unit: "kN", digits: 3 },
            { label: "V<sub>rigid</sub> = f<sub>d</sub> d<sub>h</sub> (√((L + 2e)² + L²) − (L + 2e))", value: d.VRigid, unit: "kN", digits: 3 },
            { label: "V<sub>steel</sub> = α<sub>v</sub> f<sub>ub</sub> A<sub>s</sub> / γ<sub>M2</sub>", value: d.VSteel, unit: "kN", digits: 3 },
            { label: "Courses reached: ⌊min(L, 2x) / course⌋ ≥ 1", value: d.courses, unit: "—", digits: 0 }
        ] };
}
const COMMON_NOTES = [
    "No resin bond and no masonry tension are relied on: dowels bear on the masonry at f_d, uplift is held by dead weight only (EQU).",
    "γ_M of the masonry from EN 1996-1-1 Table 2.1 (recommended values, NDP; it may be raised, never lowered); γ_M2 = 1.25 (EN 1993-1-8) and γ_G,stb = 0.9 (EN 1990 Table A1.2(A)) are recommended values. Check the National Annex that applies to the project.",
    "Site conditions: solid, bonded masonry where the check relies on it; holes drilled in units, not in joints; grout fully filling the hole."
];
export function checkMasonryFixing(input) {
    const v = input;
    const kN = 1000;
    const checks = new CheckList();
    const values = [];
    const notes = [...COMMON_NOTES];
    const t = v.t;
    const gStb = v.gammaGstb;
    if (v.kind === "hold-down") {
        const m = masonryOf(v);
        const r = pocketHoldDown(m, v.block / 1000, v.hAbove / 1000, t / 1000, v.roofGk, v.spread, gStb);
        checks.setGroup("Uplift — dead weight above the pocket (EQU)");
        checks.resistance("hold-down", "Uplift: N<sub>Ed</sub> ≤ γ<sub>G,stb</sub> (W<sub>masonry</sub> + g<sub>roof</sub> w)", v.NEd * kN, r.Rd * kN, "N", "EN 1990 Table A1.2(A); spread as EN 1996-1-1 6.1.3");
        values.push({ title: "Masonry above the pocket", rows: [
                { label: "w = b + 2 (h/2) tan(spread) (width at mid-height)", value: r.width * 1000, unit: "mm", digits: 1 },
                { label: "γ<sub>G,stb</sub> γ w h t", value: r.masonry, unit: "kN", digits: 3 },
                { label: "γ<sub>G,stb</sub> g<sub>roof</sub> w", value: r.roof, unit: "kN", digits: 3 },
                { label: "R<sub>d</sub>", value: r.Rd, unit: "kN", digits: 3 }
            ] });
        notes.push("Site check: solid bonded masonry above the pocket up to the height used, and the roof load present when it is counted.");
        return { checks: checks.rows, values, notes, ...summariseChecks(checks.rows), kind: v.kind, holdDown: r, Rd: r.Rd };
    }
    const m = masonryOf(v);
    if (v.kind === "bed-joint-slide") {
        const sigmaD = sigmaDFavourable(m, v.hAbove / 1000, t / 1000, v.lineLoad, gStb);
        const fvd = bedJointFvd(m, sigmaD);
        const direction = v.direction;
        const Rd = direction === "along"
            ? bedJointSlideAlong(m, v.length, t, sigmaD)
            : bedJointSlideAcross(m, v.courses, sigmaD);
        checks.setGroup(`Bed-joint sliding ${direction} the wall`);
        checks.resistance("bed-joint-slide", "Shear: H<sub>Ed</sub> <= R<sub>d</sub>", v.HEd * kN, Rd * kN, "N", "EN 1996-1-1 3.6.2 (3.5)/(3.6)");
        values.push({ title: "Bed-joint shear resistance", rows: [
                { label: "sigma_d from favourable permanent load", value: sigmaD, unit: "MPa", digits: 4 },
                { label: "f_vd = min(f_vk0 + 0.4 sigma_d, cap) / gamma_M", value: fvd, unit: "MPa", digits: 4 },
                { label: direction === "along" ? "R_d = length x wall thickness x f_vd" : "R_d = courses x unit bed-face area x f_vd", value: Rd, unit: "kN", digits: 3 }
            ] });
        return { checks: checks.rows, values, notes, ...summariseChecks(checks.rows), kind: v.kind, sigmaD, fvd, Rd };
    }
    const rod = rodOf(v);
    const e = v.e, depth = v.depth;
    if (v.kind === "uplift-tie") {
        const r = upliftTie(m, rod, e, depth, v.depthBelowCrest / 1000, v.width / 1000, t / 1000, v.dowels, gStb);
        const NEd = v.NEd * kN;
        checks.setGroup("Strap down the wall face to horizontal dowels");
        checks.resistance("dowels", `Dowels in shear: N<sub>Ed</sub> ≤ ${r.dowels} V<sub>Rd</sub> (bearing ${r.mode}, steel)`, NEd, r.dowels * r.VRd * kN, "N", "EN 1996-1-1 2.4.3; EN 1993-1-8 Table 3.4");
        checks.resistance("dead-weight", "Masonry lifted with the dowels: N<sub>Ed</sub> ≤ γ<sub>G,stb</sub> γ w h t", NEd, r.W * kN, "N", "EN 1990 Table A1.2(A) (EQU)");
        values.push(dowelRows(r), { title: "Dead weight above the dowels (EQU)", rows: [{ label: "W<sub>stb</sub> = γ<sub>G,stb</sub> γ w h t", value: r.W, unit: "kN", digits: 3 }, { label: "R<sub>d</sub> = min(n V<sub>Rd</sub>; W<sub>stb</sub>)", value: r.Rd, unit: "kN", digits: 3 }] });
        return { checks: checks.rows, values, notes, ...summariseChecks(checks.rows), kind: v.kind, dowel: r, W: r.W, Rd: r.Rd };
    }
    const sigmaD = sigmaDFavourable(m, v.hAbove / 1000, t / 1000, v.lineLoad, gStb);
    const fvd = bedJointFvd(m, sigmaD);
    const shearValues = { title: "Bed joints — EN 1996-1-1 3.6.2", rows: [
            { label: "σ<sub>d</sub> = γ<sub>G,stb</sub> (γ h + q / t) (favourable)", value: sigmaD, unit: "MPa", digits: 4 },
            { label: m.perpends === "unfilled" ? "f<sub>vk</sub> = 0.5 f<sub>vk0</sub> + 0.4 σ<sub>d</sub> ≤ 0.045 f<sub>b</sub> (3.6)" : "f<sub>vk</sub> = f<sub>vk0</sub> + 0.4 σ<sub>d</sub> ≤ 0.065 f<sub>b</sub> (3.5)", value: fvd * masonryGammaM(m), unit: "MPa", digits: 4 },
            { label: "f<sub>vd</sub> = f<sub>vk</sub> / γ<sub>M</sub>", value: fvd, unit: "MPa", digits: 4 }
        ] };
    if (v.kind === "pocket-pin") {
        const r = pocketPin(m, rod, e, depth, sigmaD);
        const HEd = v.HEd * kN;
        checks.setGroup("Pin under the pocket floor");
        checks.resistance("bearing", `Pin bearing on the masonry (${r.mode === "hinge" ? "one plastic hinge" : "rigid pin"})`, HEd, r.VBear * kN, "N", "EN 1996-1-1 2.4.3; Johansen one hinge / rigid pin");
        checks.resistance("steel", "Pin steel in shear", HEd, r.VSteel * kN, "N", "EN 1993-1-8 Table 3.4");
        checks.resistance("slide", `Units pushed out along their bed joints (${r.courses} course${r.courses > 1 ? "s" : ""})`, HEd, r.VSlide * kN, "N", "EN 1996-1-1 (3.5)/(3.6)");
        shearValues.rows.push({ label: "V<sub>slide</sub> = courses × l<sub>unit</sub> b<sub>unit</sub> f<sub>vd</sub>", value: r.VSlide, unit: "kN", digits: 3 }, { label: "R<sub>d</sub> = min(V<sub>bear</sub>; V<sub>steel</sub>; V<sub>slide</sub>)", value: r.Rd, unit: "kN", digits: 3 });
        values.push(dowelRows(r), shearValues);
        return { checks: checks.rows, values, notes, ...summariseChecks(checks.rows), kind: v.kind, dowel: r, sigmaD, fvd, Rd: r.Rd };
    }
    const r = crestDowel(m, rod, e, depth, sigmaD, v.trib, t);
    const along = v.VAlong * kN, across = v.VAcross * kN;
    checks.setGroup("Along the wall");
    checks.resistance("along-dowel", `Dowel (bearing ${r.mode}, steel)`, along, r.VRd * kN, "N", "EN 1996-1-1 2.4.3; EN 1993-1-8 Table 3.4");
    checks.resistance("along-slide", "Bed joint over the tributary length", along, r.slideAlong * kN, "N", "EN 1996-1-1 (3.5)/(3.6)");
    checks.setGroup("Across the wall");
    checks.resistance("across-dowel", `Dowel (bearing ${r.mode}, steel)`, across, r.VRd * kN, "N", "EN 1996-1-1 2.4.3; EN 1993-1-8 Table 3.4");
    checks.resistance("across-slide", `Units pushed out along their bed joints (${r.courses} course${r.courses > 1 ? "s" : ""})`, across, r.slideAcross * kN, "N", "EN 1996-1-1 (3.5)/(3.6)");
    shearValues.rows.push({ label: "V<sub>along</sub> = l<sub>trib</sub> t f<sub>vd</sub>; V<sub>across</sub> = courses × l<sub>unit</sub> b<sub>unit</sub> f<sub>vd</sub>", value: `${r.slideAlong.toFixed(3)}; ${r.slideAcross.toFixed(3)}`, unit: "kN" });
    values.push(dowelRows(r), shearValues);
    notes.push("The two directions are checked separately (as in the source); no interaction of along and across.");
    return { checks: checks.rows, values, notes, ...summariseChecks(checks.rows), kind: v.kind, dowel: r, sigmaD, fvd, Rd: Math.min(r.along, r.across) };
}
