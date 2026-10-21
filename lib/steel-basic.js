/**
 * Basic steel connections per EN 1993-1-8:2005 and EN 1993-1-1:2005 (2004
 * Eurocodes, recommended values of the NDPs: gamma_M0 = 1.0, gamma_M2 = 1.25,
 * gamma_M3 = 1.25, gamma_M3,ser = 1.1):
 *
 * - bolted lap joint (two plates, concentric, bolts in single shear);
 * - bolt group under in-plane eccentric load (direct shear plus torsion);
 * - fillet weld (simplified 4.5.3.3 or directional 4.5.3.2 method);
 * - plate in tension (gross and net section, EN 1993-1-1 6.2.3).
 *
 * Inputs (names, units kN / kNm / mm / MPa, defaults), rejections and result
 * records follow the EA Suys structural API routes /calculate/ec3/
 * bolted-lap-joint, /bolt-group-torsion, /fillet-weld and /plate-tension as
 * corrected on branch feature/e1-lifts-steel-20261020 (commits dfbad77,
 * 69ba690, aff8170, 0967954; reference for the parity tests). Production
 * commit 5c41bd9 deviates from EN in the places listed in
 * STEEL_BASIC_DEVIATIONS. One intentional difference from the corrected
 * branch: the tensile stress area of M12 (STEEL_BASIC_DIFFERENCES_FROM_FIXED_API).
 */
import { CheckList, normaliseFields } from "./checks.js";
export const STEEL_BASIC_VERSION = "steel-basic-0.1.0";
/** Parity reference: the corrected API routes. */
export const STEEL_BASIC_API_REFERENCE = "structural API feature/e1-lifts-steel-20261020 @ 0967954";
/** The input is rejected (same role and messages as the API's CalculationError). */
export class SteelBasicInputError extends Error {
    status;
    constructor(message, status = 400) {
        super(message);
        this.name = "SteelBasicInputError";
        this.status = status;
    }
}
/** Where production 5c41bd9 deviates from EN and this implementation (and the corrected API branch) differ from it. */
export const STEEL_BASIC_DEVIATIONS = [
    { route: "lap joint, bolt group", item: "Hole clearance (EN 1090-2 Table 11)", api: "1 mm up to d = 14, else 2 mm; oversized +3 mm", here: "normal 1 / 2 / 3 mm (M12-M14 / M16-M24 / M27+); oversized 3 / 4 / 6 / 8 mm (M12 / M14-M22 / M24 / M27+)" },
    { route: "lap joint, bolt group", item: "Plate f_y, f_u above 40 mm", api: "t <= 40 mm values for every thickness", here: "EN 1993-1-1 Table 3.1, 40 < t <= 80 mm row (S355: 335/470); t > 80 mm rejected" },
    { route: "lap joint", item: "Bearing (Table 3.4)", api: "corner bolt (2.8 e2/d0 - 1.7, e1/3d0) and fully inner bolt only; no oversized factor", here: "every bolt position (end/inner row, edge/inner column; edge k1 includes 1.4 p2/d0 - 1.7), 0.8 for oversized holes, single-row cap 1.5 f_u d t / gamma_M2 (3.6.1(10)), group n x smallest (3.7(1))" },
    { route: "lap joint", item: "Net section (EN 1993-1-1 6.2.3)", api: "A_net f_y / gamma_M0 for every category", here: "categories A/B: min(A f_y / gamma_M0, 0.9 A_net f_u / gamma_M2); category C: A_net f_y / gamma_M0" },
    { route: "lap joint", item: "Block tearing (3.10.2 (3.9))", api: "f_u A_nv / gamma_M2 + f_y A_nt / (sqrt3 gamma_M0), full net width, 0.5 d0 deducted", here: "f_u A_nt / gamma_M2 + f_y A_nv / (sqrt3 gamma_M0), net areas ((n - 0.5) d0 deducted), central and one-sided block" },
    { route: "lap joint", item: "Long joints (3.8)", api: "not applied", here: "beta_Lf (3.5) on F_v,Rd when L_j > 15 d" },
    { route: "lap joint", item: "Maximum spacing and end/edge distance (Table 3.3)", api: "max(14 t, 200 mm)", here: "min(14 t, 200 mm) and 4 t + 40 mm (warnings)" },
    { route: "lap joint", item: "Slip-resistant categories B and C", api: "any bolt class", here: "8.8 and 10.9 only (3.1.2(1)); other classes rejected" },
    { route: "lap joint", item: "Pitch with several rows or columns", api: "p1 = 0 or p2 = 0 accepted", here: "rejected (p1_mm / p2_mm must be positive when num_rows / num_cols > 1)" },
    { route: "lap joint", item: "Primary web bearing", api: "k1 without the p2 term, no oversized factor", here: "Table 3.4 k1 (edge with the p2 term, inner), 0.8 for oversized holes, alpha_b = 0.5 (source-script convention)" },
    { route: "bolt group", item: "Bearing (Table 3.4 note 3)", api: "directional edge-distance heuristic; inner bolts get alpha_b up to 1", here: "x and z components verified separately per bolt: alpha_d = e/3d0 for an end bolt, p/3d0 - 1/4 for an inner bolt; k1 of the lines parallel to the component; 0.8 for oversized holes" },
    { route: "fillet weld", item: "S460 f_u", api: "550 MPa", here: "540 MPa (EN 1993-1-1 Table 3.1, EN 10025-3/-4)" },
    { route: "fillet weld", item: "Minimum effective length (4.5.1(2))", api: "L_eff > max(30 mm, 6 a)", here: "L_eff >= max(30 mm, 6 a)" },
    { route: "plate tension", item: "f_y, f_u", api: "t <= 40 mm values for every thickness", here: "EN 1993-1-1 Table 3.1 by thickness (40 < t <= 80 row); t > 80 mm rejected" },
];
/** Intentional differences from the corrected API branch (0967954). */
export const STEEL_BASIC_DIFFERENCES_FROM_FIXED_API = [
    { item: "Tensile stress area A_s of M12 (bolt shear through the thread, preload F_p,C)", api: "92.1 mm2 (the M12 x 1.25 fine-thread value)", here: "84.3 mm2 (EN ISO 898-1, coarse thread); -8.5 % on F_v,Rd (thread) and F_s,Rd of M12" },
];
// ------------------------------------------------------------------ data
/** EN 1993-1-1 Table 3.1, EN 10025-2 rows (plate in tension). */
export const PLATE_STEEL_TABLE = {
    S235: { upTo40: { fy: 235, fu: 360 }, upTo80: { fy: 215, fu: 360 } },
    S275: { upTo40: { fy: 275, fu: 430 }, upTo80: { fy: 255, fu: 410 } },
    S355: { upTo40: { fy: 355, fu: 510 }, upTo80: { fy: 335, fu: 470 } },
    S450: { upTo40: { fy: 440, fu: 550 }, upTo80: { fy: 410, fu: 550 } },
};
/**
 * Bolted connection plates (lap joint, bolt group), as the corrected API: EN
 * 1993-1-1 Table 3.1 by thickness; S355 t <= 40 mm with f_u = 490 MPa (the
 * EN 10025-3 N/NL row, below the 510 MPa EN 10025-2 row).
 */
export const BOLTED_PLATE_TABLE = {
    S235: { upTo40: { fy: 235, fu: 360 }, upTo80: { fy: 215, fu: 360 } },
    S275: { upTo40: { fy: 275, fu: 430 }, upTo80: { fy: 255, fu: 410 } },
    S355: { upTo40: { fy: 355, fu: 490 }, upTo80: { fy: 335, fu: 470 } },
};
const BOLTED_GRADES = Object.keys(BOLTED_PLATE_TABLE);
const TENSION_GRADES = Object.keys(PLATE_STEEL_TABLE);
/** EN 1993-1-8 Table 3.1. */
export const BOLT_CLASS_TABLE = {
    "4.6": { fyb: 240, fub: 400 },
    "4.8": { fyb: 320, fub: 400 },
    "5.6": { fyb: 300, fub: 500 },
    "5.8": { fyb: 400, fub: 500 },
    "6.8": { fyb: 480, fub: 600 },
    "8.8": { fyb: 640, fub: 800 },
    "10.9": { fyb: 900, fub: 1000 },
};
const PRELOADABLE = ["8.8", "10.9"];
/** Tensile stress area A_s of coarse-thread bolts (EN ISO 898-1), mm2. */
export const BOLT_TENSILE_AREA = {
    12: 84.3, 14: 115, 16: 157, 18: 192, 20: 245, 22: 303, 24: 353, 27: 459, 30: 561,
};
/** EN 1993-1-8 Table 4.1 (beta_w) with f_u from EN 1993-1-1 Table 3.1 (S420, S460: EN 10025-3/-4). */
export const WELD_STEEL_TABLE = {
    S235: { fu: 360, betaW: 0.8 },
    S275: { fu: 430, betaW: 0.85 },
    S355: { fu: 510, betaW: 0.9 },
    S420: { fu: 520, betaW: 1.0 },
    S460: { fu: 540, betaW: 1.0 },
};
/** EN 1993-1-8 Table 3.7 slip factors. */
export const SLIP_FACTORS = { A: 0.5, B: 0.4, C: 0.3, D: 0.2 };
/** Recommended values (EN 1993-1-1 6.1 Note 2B; EN 1993-1-8 2.2 Table 2.1). */
export const GAMMA = { M0: 1.0, M2: 1.25, M3: 1.25, M3ser: 1.1 };
/** f_y, f_u of a bolted plate by thickness (rejects t > 80 mm). */
export function boltedPlateSteel(grade, t) {
    const row = BOLTED_PLATE_TABLE[grade];
    if (!row)
        throw new SteelBasicInputError(`Unsupported steel_grade '${grade}'.`);
    if (t > 80)
        throw new SteelBasicInputError(`Plate thickness ${t} mm exceeds 80 mm, the range of EN 1993-1-1 Table 3.1.`);
    return t <= 40 ? row.upTo40 : row.upTo80;
}
/** Hole diameter d0 = d + nominal clearance (EN 1090-2 Table 11). */
export function holeDiameter(d, holeType) {
    if (holeType === "oversized")
        return d + (d <= 12 ? 3 : d <= 22 ? 4 : d <= 24 ? 6 : 8);
    return d + (d <= 14 ? 1 : d <= 24 ? 2 : 3);
}
/** Tensile stress area by the rounded diameter; 0.78 pi d^2/4 outside the table. */
export function tensileArea(d) {
    const table = BOLT_TENSILE_AREA[Math.round(d)];
    return table !== undefined ? { area: table, approximated: false } : { area: 0.78 * Math.PI * d * d / 4, approximated: true };
}
/** EN 1993-1-8 Table 3.4: shear resistance per shear plane, N. */
export function boltShearResistance(boltClass, d, shearInThreads, gammaM2) {
    const bolt = BOLT_CLASS_TABLE[boltClass];
    if (!bolt)
        throw new SteelBasicInputError(`Unsupported bolt_class '${boltClass}'.`);
    const As = tensileArea(d);
    const alphaV = shearInThreads && !["4.6", "5.6", "8.8"].includes(boltClass) ? 0.5 : 0.6;
    const area = shearInThreads ? As.area : Math.PI * d * d / 4;
    return { Fv: alphaV * bolt.fub * area / gammaM2, alphaV, area, approximated: shearInThreads && As.approximated };
}
/** EN 1993-1-8 3.8 (3.5). */
export function betaLf(Lj, d) {
    if (!(Lj > 15 * d))
        return 1;
    return Math.min(1, Math.max(0.75, 1 - (Lj - 15 * d) / (200 * d)));
}
/** EN 1993-1-8 3.10.2(2) (3.9), N. */
export function blockTearing(fu, fy, Ant, Anv, gammaM0, gammaM2) {
    return fu * Math.max(Ant, 0) / gammaM2 + fy * Math.max(Anv, 0) / (Math.sqrt(3) * gammaM0);
}
// ------------------------------------------------------------------ input helpers (API semantics and messages)
function booleanValue(raw, key, fallback) {
    if (raw?.[key] === undefined)
        return fallback;
    if (typeof raw[key] !== "boolean")
        throw new SteelBasicInputError(`${key} must be a boolean.`);
    return raw[key];
}
function stringValue(raw, key, fallback) {
    if (raw?.[key] === undefined) {
        if (fallback !== undefined)
            return fallback;
        throw new SteelBasicInputError(`Missing required string '${key}'.`);
    }
    const value = String(raw[key]).trim();
    if (!value)
        throw new SteelBasicInputError(`${key} cannot be empty.`);
    return value;
}
function numberValue(raw, key, fallback) {
    if (raw?.[key] === undefined) {
        if (fallback !== undefined)
            return fallback;
        throw new SteelBasicInputError(`Missing required number '${key}'.`);
    }
    const value = Number(raw[key]);
    if (!Number.isFinite(value))
        throw new SteelBasicInputError(`${key} must be a finite number.`);
    return value;
}
function positiveNumber(raw, key, fallback) {
    const value = numberValue(raw, key, fallback);
    if (!(value > 0.0))
        throw new SteelBasicInputError(`${key} must be positive.`);
    return value;
}
function optionalPositiveNumber(raw, key) {
    if (raw?.[key] === undefined || raw[key] === null)
        return null;
    return positiveNumber(raw, key);
}
function nonNegativeNumber(raw, key, fallback) {
    const value = numberValue(raw, key, fallback);
    if (value < 0.0)
        throw new SteelBasicInputError(`${key} must be non-negative.`);
    return value;
}
function positiveInteger(raw, key, fallback) {
    const value = positiveNumber(raw, key, fallback);
    if (!Number.isInteger(value))
        throw new SteelBasicInputError(`${key} must be an integer.`);
    return value;
}
function nonNegativeInteger(raw, key, fallback) {
    const value = nonNegativeNumber(raw, key, fallback);
    if (!Number.isInteger(value))
        throw new SteelBasicInputError(`${key} must be an integer.`);
    return value;
}
/** Rounding of the API records. */
export function apiRound(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
const round = apiRound;
const kN = (valueN) => valueN / 1000;
/** Page result: governing = highest utilisation of the resistance rows; status from all rows. */
function finish(checks, values, notes) {
    const resistances = checks.filter(row => row.kind === "resistance");
    const governing = resistances.reduce((best, row) => (best === null || row.utilisation > best.utilisation ? row : best), null);
    const status = checks.some(row => row.status === "fail") ? "fail" : checks.some(row => row.status === "warning") ? "warning" : "ok";
    return { checks, values, notes, maxUtilisation: governing ? governing.utilisation : 0, governing, status };
}
const COMMON_NOTES = [
    "EN 1993-1-8:2005 and EN 1993-1-1:2005 with the recommended values of the nationally determined parameters (γM0 = 1.0, γM2 = 1.25, γM3 = 1.25, γM3,ser = 1.1); the Belgian National Annex is not applied.",
    "Indicative calculation aid (feasibility prototype), not a design note; input values are not verified.",
];
/** Parses the lap joint input (keys, defaults, rejections and their order as the corrected API). */
export function parseLapJoint(raw) {
    const category = stringValue(raw, "category", "A").toUpperCase();
    if (!["A", "B", "C"].includes(category))
        throw new SteelBasicInputError(`Unsupported category '${category}'.`);
    const holeType = stringValue(raw, "hole_type", "normal").toLowerCase();
    if (!["normal", "oversized"].includes(holeType))
        throw new SteelBasicInputError(`Unsupported hole_type '${holeType}'.`);
    const frictionSurfaceClass = raw.friction_surface_class === undefined || raw.friction_surface_class === null
        ? null : stringValue(raw, "friction_surface_class").toUpperCase();
    if (frictionSurfaceClass !== null && !["A", "B", "C", "D"].includes(frictionSurfaceClass)) {
        throw new SteelBasicInputError(`Unsupported friction_surface_class '${frictionSurfaceClass}'.`);
    }
    if ((category === "B" || category === "C") && frictionSurfaceClass === null) {
        throw new SteelBasicInputError(`Category ${category} requires friction_surface_class.`);
    }
    const plateT1Mm = positiveNumber(raw, "plate_t1_mm");
    const plateT2Mm = positiveNumber(raw, "plate_t2_mm");
    const numRows = positiveInteger(raw, "num_rows");
    const numCols = positiveInteger(raw, "num_cols");
    const forceSlsKn = optionalPositiveNumber(raw, "force_sls_kn");
    if (category === "B" && forceSlsKn === null)
        throw new SteelBasicInputError("Category B requires force_sls_kn.");
    const p1Mm = nonNegativeNumber(raw, "p1_mm", 0.0);
    const p2Mm = nonNegativeNumber(raw, "p2_mm", 0.0);
    if (numRows > 1 && p1Mm <= 0.0)
        throw new SteelBasicInputError("p1_mm must be positive when num_rows > 1.");
    if (numCols > 1 && p2Mm <= 0.0)
        throw new SteelBasicInputError("p2_mm must be positive when num_cols > 1.");
    return {
        plateT1Mm, plateT2Mm,
        plateWidthMm: positiveNumber(raw, "plate_width_mm"),
        steelGrade: stringValue(raw, "steel_grade", "S355").toUpperCase(),
        boltClass: stringValue(raw, "bolt_class", "8.8").toUpperCase(),
        boltDiameterMm: positiveNumber(raw, "bolt_diameter_mm"),
        shearInThreads: booleanValue(raw, "shear_in_threads", false),
        numRows, numCols,
        e1Mm: positiveNumber(raw, "e1_mm"),
        e2Mm: positiveNumber(raw, "e2_mm"),
        p1Mm, p2Mm,
        forceUlsKn: positiveNumber(raw, "force_uls_kn"),
        forceSlsKn, category, frictionSurfaceClass, holeType,
        primaryWebThicknessMm: optionalPositiveNumber(raw, "primary_web_thickness_mm"),
        primaryWebFuMpa: optionalPositiveNumber(raw, "primary_web_fu_mpa"),
        webBearingFactor: positiveNumber(raw, "web_bearing_factor", 1.0),
        thinnerPlateThicknessMm: Math.min(plateT1Mm, plateT2Mm),
        boltCount: numRows * numCols,
    };
}
/** Mode names of the API's summary (first resistance equal to the governing value, in record order). */
function modeName(resistances, value) {
    const labels = {
        bolt_shear_group_kn: "bolt shear group", bolt_bearing_group_kn: "bolt bearing group", primary_web_bearing_group_kn: "primary web bearing group",
        bolt_slip_group_kn: "Slip", gross_section_kn: "gross section", net_section_kn: "net section", block_tear_kn: "block tear",
    };
    for (const [key, v] of Object.entries(resistances))
        if (typeof v === "number" && Math.abs(v - value) < 1e-6)
            return labels[key] || key.replaceAll("_", " ");
    return "Unknown";
}
export function calculateLapJoint(raw) {
    const input = parseLapJoint(raw);
    const plate = boltedPlateSteel(input.steelGrade, Math.max(input.plateT1Mm, input.plateT2Mm));
    const bolt = BOLT_CLASS_TABLE[input.boltClass];
    if (!bolt)
        throw new SteelBasicInputError(`Unsupported bolt_class '${input.boltClass}'.`);
    if ((input.category === "B" || input.category === "C") && !PRELOADABLE.includes(input.boltClass)) {
        throw new SteelBasicInputError(`Category ${input.category} needs preloaded bolts of class 8.8 or 10.9 (EN 1993-1-8 3.1.2(1)); got '${input.boltClass}'.`);
    }
    const gammaM2 = GAMMA.M2;
    const d = input.boltDiameterMm, t = input.thinnerPlateThicknessMm, n = input.boltCount;
    const { numRows: rows, numCols: cols, e1Mm: e1, e2Mm: e2, p1Mm: p1, p2Mm: p2 } = input;
    const As = tensileArea(d);
    const d0 = holeDiameter(d, input.holeType);
    const holeFactor = input.holeType === "oversized" ? 0.8 : 1.0;
    // detailing, Table 3.3 (warnings)
    const maxSpacing = Math.min(14 * t, 200), maxEdge = 4 * t + 40;
    const geometry = [];
    const geo = (name, provided, required, comparison) => {
        if (provided <= 0)
            return;
        const passed = comparison === ">=" ? provided >= required : provided <= required;
        geometry.push({ name, provided_mm: provided, required_mm: round(required, 6), comparison, status: passed ? "PASS" : "WARN" });
    };
    geo("Minimum end distance", e1, 1.2 * d0, ">=");
    geo("Minimum edge distance", e2, 1.2 * d0, ">=");
    if (rows > 1 && p1 > 0) {
        geo("Minimum pitch", p1, 2.2 * d0, ">=");
        geo("Maximum pitch", p1, maxSpacing, "<=");
    }
    if (cols > 1 && p2 > 0) {
        geo("Minimum gauge", p2, 2.4 * d0, ">=");
        geo("Maximum gauge", p2, maxSpacing, "<=");
    }
    geo("Maximum end distance", e1, maxEdge, "<=");
    geo("Maximum edge distance", e2, maxEdge, "<=");
    const geometryWarningCount = geometry.filter(g => g.status === "WARN").length;
    // bolt shear with the long-joint factor (3.8)
    const Lj = Math.max(rows - 1, 0) * p1;
    const beta = betaLf(Lj, d);
    const shearRes = boltShearResistance(input.boltClass, d, input.shearInThreads, gammaM2);
    const FvPerBolt = shearRes.Fv * beta;
    // bearing for every bolt position (Table 3.4), thinner plate
    const kEdge = Math.max(Math.min(2.8 * e2 / d0 - 1.7, 2.5, ...(cols > 1 ? [1.4 * p2 / d0 - 1.7] : [])), 0);
    const kInner = cols > 2 ? Math.max(Math.min(1.4 * p2 / d0 - 1.7, 2.5), 0) : null;
    const aEnd = Math.max(Math.min(e1 / (3 * d0), bolt.fub / plate.fu, 1), 0);
    const aInner = rows > 1 ? Math.max(Math.min(p1 / (3 * d0) - 0.25, bolt.fub / plate.fu, 1), 0) : null;
    const singleRowCap = rows === 1 ? 1.5 * plate.fu * d * t / gammaM2 : null;
    const positions = [];
    let capApplied = false;
    for (const [rowLabel, alphaB, rowCount] of [["end row", aEnd, 1], ["inner row", aInner, rows - 1]]) {
        if (alphaB === null)
            continue;
        for (const [colLabel, k1, colCount] of [["edge column", kEdge, Math.min(cols, 2)], ["inner column", kInner, Math.max(cols - 2, 0)]]) {
            if (k1 === null)
                continue;
            const uncapped = holeFactor * k1 * alphaB * plate.fu * d * t / gammaM2;
            const Fb = singleRowCap === null ? uncapped : Math.min(uncapped, singleRowCap);
            if (singleRowCap !== null && uncapped > singleRowCap)
                capApplied = true;
            positions.push({ position: `${rowLabel}, ${colLabel}`, count: rowCount * colCount, k1, alphaB, Fb, capped: singleRowCap !== null && uncapped > singleRowCap });
        }
    }
    const FbPerBolt = Math.min(...positions.map(p => p.Fb));
    // primary web (source-script convention, alpha_b = 0.5)
    let web = null;
    if (input.primaryWebThicknessMm !== null) {
        const tw = input.primaryWebThicknessMm || t;
        const fuWeb = input.primaryWebFuMpa || plate.fu;
        const kMin = kInner === null ? kEdge : Math.min(kEdge, kInner);
        const perBolt = holeFactor * kMin * 0.5 * fuWeb * d * tw / gammaM2;
        web = { perBolt, group: perBolt * n / input.webBearingFactor };
    }
    // plate: gross, net (6.2.3), block tearing (3.10.2)
    const gross = input.plateWidthMm * t * plate.fy / GAMMA.M0;
    const Anet = Math.max(input.plateWidthMm - cols * d0, 0) * t;
    const net = input.category === "C"
        ? { Anet, resistance: Anet * plate.fy / GAMMA.M0, formula: "N_net,Rd = A_net fy / gamma_M0" }
        : { Anet, resistance: 0.9 * Anet * plate.fu / gammaM2, formula: "N_u,Rd = 0.9 A_net fu / gamma_M2" };
    const shearLength = Math.max(e1 + Math.max(rows - 1, 0) * p1 - (rows - 0.5) * d0, 0);
    const centralAnt = Math.max((cols - 1) * (p2 - d0), 0) * t, centralAnv = 2 * shearLength * t;
    const central = { Ant: centralAnt, Anv: centralAnv, V: blockTearing(plate.fu, plate.fy, centralAnt, centralAnv, GAMMA.M0, gammaM2) };
    let oneSided = null;
    if (cols > 1) {
        const Ant = Math.max((cols - 1) * p2 + e2 - (cols - 0.5) * d0, 0) * t, Anv = shearLength * t;
        oneSided = { Ant, Anv, V: blockTearing(plate.fu, plate.fy, Ant, Anv, GAMMA.M0, gammaM2) };
    }
    const block = oneSided && oneSided.V < central.V
        ? { central, oneSided, resistance: oneSided.V, pattern: "one-sided block" }
        : { central, oneSided, resistance: central.V, pattern: "central block" };
    // slip (3.9.1)
    let slip = null;
    const warningCodes = [];
    if (geometryWarningCount > 0)
        warningCodes.push("GEOMETRY_WARNINGS");
    if (web)
        warningCodes.push("PRIMARY_WEB_BEARING_INCLUDED");
    if (beta < 1)
        warningCodes.push("LONG_JOINT_REDUCTION");
    if (capApplied)
        warningCodes.push("SINGLE_ROW_BEARING_LIMIT");
    if (input.category === "B" || input.category === "C") {
        warningCodes.push("SLIP_CHECK_INCLUDED");
        const mu = SLIP_FACTORS[input.frictionSurfaceClass ?? ""];
        if (mu === undefined)
            throw new SteelBasicInputError(`Unsupported friction_surface_class '${input.frictionSurfaceClass}'.`);
        if (input.holeType !== "normal")
            throw new SteelBasicInputError(`Unsupported hole_type '${input.holeType}' for slip calculation.`);
        const FpC = 0.7 * bolt.fub * As.area;
        const gammaM3 = input.category === "B" ? GAMMA.M3ser : GAMMA.M3;
        const perBolt = mu * FpC / gammaM3;
        slip = { mu, FpC, gammaM3, perBolt, group: perBolt * n };
    }
    // summary in kN with the API's rounded resistances
    const resistances = {
        bolt_shear_group_kn: round(kN(FvPerBolt * n), 6),
        bolt_bearing_group_kn: round(kN(FbPerBolt * n), 6),
        gross_section_kn: round(kN(gross), 6),
        net_section_kn: round(kN(net.resistance), 6),
        block_tear_kn: round(kN(block.resistance), 6),
    };
    if (web)
        resistances.primary_web_bearing_group_kn = round(kN(web.group), 6);
    if (slip)
        resistances.bolt_slip_group_kn = round(kN(slip.group), 6);
    const plateKn = Math.min(resistances.gross_section_kn, resistances.net_section_kn, resistances.block_tear_kn);
    const boltComponents = [resistances.bolt_shear_group_kn, resistances.bolt_bearing_group_kn, ...(web ? [resistances.primary_web_bearing_group_kn] : [])];
    let governingMode, governingResistanceKn, utilization;
    let utilizationSls = null, utilizationUls = null;
    if (input.category === "A") {
        governingResistanceKn = Math.min(...boltComponents, plateKn);
        utilization = input.forceUlsKn / governingResistanceKn;
        governingMode = modeName(resistances, governingResistanceKn);
    }
    else if (input.category === "B") {
        const uls = Math.min(...boltComponents, plateKn);
        utilizationUls = input.forceUlsKn / uls;
        utilizationSls = (input.forceSlsKn || 0) / (slip ? kN(slip.group) : Infinity);
        const bySlip = utilizationSls >= utilizationUls;
        utilization = Math.max(utilizationSls, utilizationUls);
        governingMode = bySlip ? "Slip (SLS)" : modeName(resistances, uls);
        governingResistanceKn = bySlip ? kN(slip.group) : uls;
    }
    else {
        const components = [slip ? kN(slip.group) : 0, resistances.bolt_bearing_group_kn, ...(web ? [resistances.primary_web_bearing_group_kn] : [])];
        governingResistanceKn = Math.min(...components, plateKn);
        utilization = input.forceUlsKn / governingResistanceKn;
        governingMode = modeName({ bolt_slip_group_kn: slip ? kN(slip.group) : null, bolt_bearing_group_kn: resistances.bolt_bearing_group_kn, gross_section_kn: resistances.gross_section_kn,
            net_section_kn: resistances.net_section_kn, block_tear_kn: resistances.block_tear_kn, primary_web_bearing_group_kn: resistances.primary_web_bearing_group_kn }, governingResistanceKn);
    }
    const status = utilization <= 1 ? "PASS" : "FAIL";
    if (utilizationSls !== null && utilizationSls > 1)
        warningCodes.push("SLS_SLIP_CHECK_FAILED");
    if (utilizationUls !== null && utilizationUls > 1)
        warningCodes.push("ULS_CHECK_FAILED");
    if (status === "FAIL")
        warningCodes.push("STRENGTH_CHECK_FAILED");
    const record = {
        steel_grade: input.steelGrade, fy_mpa: plate.fy, fu_mpa: plate.fu, bolt_class: input.boltClass, category: input.category,
        bolt_count: n, hole_diameter_mm: d0, bolt_tensile_area_mm2: round(As.area, 6),
        geometry_warning_count: geometryWarningCount, geometry_checks: geometry,
        long_joint: { joint_length_lj_mm: round(Lj, 6), limit_15d_mm: round(15 * d, 6), beta_lf: round(beta, 6) },
        bearing_positions: positions.map(p => ({ position: p.position, k1: round(p.k1, 6), alpha_b: round(p.alphaB, 6), f_b_rd_kn: round(kN(p.Fb), 6) })),
        per_bolt_resistances: {
            bolt_shear_kn: round(kN(FvPerBolt), 6), bolt_bearing_kn: round(kN(FbPerBolt), 6),
            ...(web ? { primary_web_bearing_kn: round(kN(web.perBolt), 6) } : {}),
            ...(slip ? { bolt_slip_kn: round(kN(slip.perBolt), 6) } : {}),
        },
        resistances,
        net_section: { formula: net.formula, a_net_mm2: round(Anet, 6), resistance_kn: round(kN(net.resistance), 6) },
        block_tearing: { central_block_kn: round(kN(central.V), 6), one_sided_block_kn: oneSided === null ? null : round(kN(oneSided.V), 6), governing_pattern: block.pattern },
        governing_mode: governingMode, governing_resistance_kn: round(governingResistanceKn, 6),
        applied_force_uls_kn: input.forceUlsKn, applied_force_sls_kn: input.forceSlsKn,
        utilization_ratio: round(utilization, 6), utilization_percent: round(utilization * 100, 1),
        utilization_sls: utilizationSls === null ? null : round(utilizationSls, 6),
        utilization_uls: utilizationUls === null ? null : round(utilizationUls, 6),
        overall_status: status, check_passed: status === "PASS", warning_codes: warningCodes,
    };
    // page rows (N)
    const F = input.forceUlsKn * 1000;
    const list = new CheckList("Bolts");
    if (input.category !== "C") {
        list.resistance("shear", `Bolt shear: n F<sub>v,Rd</sub>${beta < 1 ? ` × β<sub>Lf</sub> (β<sub>Lf</sub> = ${beta.toFixed(3)})` : ""}, ${n} bolts in single shear`, F, FvPerBolt * n, "N", `Table 3.4${beta < 1 ? ", 3.8" : ""}`, input.shearInThreads ? "Shear plane through the thread (A_s)" : "Shear plane through the shank (A)");
    }
    if (slip && input.category === "B")
        list.resistance("slip-sls", "Slip at SLS: n F<sub>s,Rd,ser</sub> (category B)", (input.forceSlsKn ?? 0) * 1000, slip.group, "N", "3.9.1 (3.6), Table 3.2");
    if (slip && input.category === "C")
        list.resistance("slip-uls", "Slip at ULS: n F<sub>s,Rd</sub> (category C)", F, slip.group, "N", "3.9.1 (3.6), Table 3.2");
    const governingPosition = positions.reduce((a, b) => (b.Fb < a.Fb ? b : a));
    list.resistance("bearing", `Bearing: n × smallest F<sub>b,Rd</sub> (${governingPosition.position})`, F, FbPerBolt * n, "N", `Table 3.4, 3.7(1)${capApplied ? ", 3.6.1(10)" : ""}${holeFactor < 1 ? ", × 0.8 oversized" : ""}`);
    if (web)
        list.resistance("web", "Primary web in bearing (source-script convention, α<sub>b</sub> = 0.5)", F, web.group, "N", "Table 3.4 k1, API route method");
    list.setGroup(`Plate (thinner plate, t = ${t} mm; fy = ${plate.fy} MPa, fu = ${plate.fu} MPa)`);
    list.resistance("gross", "Gross section N<sub>pl,Rd</sub> = A f<sub>y</sub> / γ<sub>M0</sub>", F, gross, "N", "EN 1993-1-1 6.2.3(2)a");
    list.resistance("net", input.category === "C" ? "Net section N<sub>net,Rd</sub> = A<sub>net</sub> f<sub>y</sub> / γ<sub>M0</sub> (category C)" : "Net section N<sub>u,Rd</sub> = 0.9 A<sub>net</sub> f<sub>u</sub> / γ<sub>M2</sub>", F, net.resistance, "N", input.category === "C" ? "EN 1993-1-1 6.2.3(4)" : "EN 1993-1-1 6.2.3(2)b");
    list.resistance("block", `Block tearing (${block.pattern})`, F, block.resistance, "N", "3.10.2(2) (3.9)");
    list.setGroup("Detailing (Table 3.3, warnings)");
    geometry.forEach((g, i) => {
        if (g.comparison === ">=")
            list.minimum(`geo-${i}`, g.name, g.provided_mm, g.required_mm, "mm", "Table 3.3", "warning");
        else
            list.maximum(`geo-${i}`, g.name, g.provided_mm, g.required_mm, "mm", g.name.includes("pitch") || g.name.includes("gauge") ? "Table 3.3, min(14 t, 200)" : "Table 3.3, 4 t + 40 (exposed steel)", "warning");
    });
    const widthGap = input.plateWidthMm - 2 * e2 - (cols - 1) * p2;
    if (Math.abs(widthGap) > 0.5)
        list.info("width", `Plate width b = ${input.plateWidthMm} mm differs from 2 e<sub>2</sub> + (n<sub>cols</sub> − 1) p<sub>2</sub> = ${2 * e2 + (cols - 1) * p2} mm`, "warning", "input", "The sections use b; bearing and the one-sided block use e2 and p2");
    const values = [
        { title: "Bolts", rows: [
                { label: "d / d<sub>0</sub> (EN 1090-2 Table 11)", value: `${d} / ${d0}`, unit: "mm" },
                { label: "A<sub>s</sub>", value: As.area, unit: As.approximated ? "mm² (0.78 πd²/4)" : "mm²", digits: 1 },
                { label: `F<sub>v,Rd</sub> per bolt (α<sub>v</sub> = ${shearRes.alphaV})`, value: kN(shearRes.Fv), unit: "kN", digits: 2 },
                { label: "L<sub>j</sub> / β<sub>Lf</sub>", value: `${Lj.toFixed(0)} mm / ${beta.toFixed(3)}`, unit: "" },
                ...(slip ? [{ label: "F<sub>p,C</sub> / μ / F<sub>s,Rd</sub> per bolt", value: `${kN(slip.FpC).toFixed(1)} kN / ${slip.mu} / ${kN(slip.perBolt).toFixed(2)} kN`, unit: "" }] : []),
            ] },
        { title: `Bearing per bolt position (thinner plate, t = ${t} mm)`, rows: [
                ...positions.map(p => ({ label: `${p.position} (${p.count}×): k<sub>1</sub> = ${p.k1.toFixed(3)}, α<sub>b</sub> = ${p.alphaB.toFixed(3)}${p.capped ? ", capped" : ""}`, value: kN(p.Fb), unit: "kN", digits: 2 })),
                ...(singleRowCap !== null ? [{ label: "Cap 1.5 f<sub>u</sub> d t / γ<sub>M2</sub> (single lap, one bolt row)", value: kN(singleRowCap), unit: "kN", digits: 2 }] : []),
            ] },
        { title: "Plate", rows: [
                { label: "A / A<sub>net</sub>", value: `${(input.plateWidthMm * t).toFixed(0)} / ${Anet.toFixed(0)}`, unit: "mm²" },
                { label: `Block, central: A<sub>nt</sub> = ${central.Ant.toFixed(0)}, A<sub>nv</sub> = ${central.Anv.toFixed(0)} mm²`, value: kN(central.V), unit: "kN", digits: 1 },
                ...(oneSided ? [{ label: `Block, one-sided: A<sub>nt</sub> = ${oneSided.Ant.toFixed(0)}, A<sub>nv</sub> = ${oneSided.Anv.toFixed(0)} mm²`, value: kN(oneSided.V), unit: "kN", digits: 1 }] : []),
            ] },
    ];
    const notes = [
        ...COMMON_NOTES,
        "Concentric lap joint of two plates of equal width, bolts in single shear (one shear plane), non-staggered rows. Bending of the single lap, prying, combined shear and tension are not checked.",
        "Both plates take f_y and f_u of EN 1993-1-1 Table 3.1 for the thickness class of the thicker plate (S355: f_u = 490 MPa, the EN 10025-3 N/NL row, as the corrected API); the plate checks use the thinner plate.",
        "Bearing for every bolt position present (end or inner row, edge or inner column); the group resistance is the number of bolts times the smallest bolt resistance (3.7(1)). Oversized holes: 0.8 F_b,Rd.",
        "Detailing limits (Table 3.3) are warnings, as in the API route; the maxima apply to compression members and to steel exposed to corrosion.",
        ...(rows === 1 ? ["One bolt row in a single lap joint: washers under head and nut are required and F_b,Rd ≤ 1.5 f_u d t / γM2 (3.6.1(10))."] : []),
        ...(slip ? ["Slip resistance with k_s = 1 (normal holes) and one friction surface; preloaded bolts per EN 1090-2."] : []),
    ];
    return {
        ...finish(list.rows, values, notes), input, fy: plate.fy, fu: plate.fu, d0, As: As.area, AsApproximated: As.approximated,
        shear: { Fv: shearRes.Fv, alphaV: shearRes.alphaV, area: shearRes.area, Lj, betaLf: beta, perBolt: FvPerBolt, group: FvPerBolt * n },
        bearing: { positions, perBolt: FbPerBolt, group: FbPerBolt * n, singleRowCap, capApplied },
        slip, web, gross, net, block, geometry,
        summary: { governingMode, governingResistanceKn, utilization, utilizationSls, utilizationUls, status, warningCodes }, record,
    };
}
export function parseBoltGroup(raw) {
    const steelGrade = stringValue(raw, "steel_grade", "S235").toUpperCase();
    if (!BOLTED_PLATE_TABLE[steelGrade])
        throw new SteelBasicInputError(`Unsupported steel_grade '${steelGrade}'.`);
    boltedPlateSteel(steelGrade, positiveNumber(raw, "plate_thickness_mm"));
    const boltClass = stringValue(raw, "bolt_class", "8.8").toUpperCase();
    if (!BOLT_CLASS_TABLE[boltClass])
        throw new SteelBasicInputError(`Unsupported bolt_class '${boltClass}'.`);
    const boltDiameterMm = positiveNumber(raw, "bolt_diameter_mm");
    const numRows = positiveInteger(raw, "num_rows");
    const numCols = positiveInteger(raw, "num_cols");
    const pitchZMm = numberValue(raw, "pitch_z_mm", 0.0);
    const pitchXMm = numberValue(raw, "pitch_x_mm", 0.0);
    if (numRows > 1 && pitchZMm <= 0.0)
        throw new SteelBasicInputError("pitch_z_mm must be positive when num_rows > 1.");
    if (numCols > 1 && pitchXMm <= 0.0)
        throw new SteelBasicInputError("pitch_x_mm must be positive when num_cols > 1.");
    const holeType = stringValue(raw, "hole_type", "normal").toLowerCase();
    if (holeType !== "normal" && holeType !== "oversized")
        throw new SteelBasicInputError(`Unsupported hole_type '${holeType}'.`);
    return {
        plateThicknessMm: positiveNumber(raw, "plate_thickness_mm"),
        steelGrade, boltClass, boltDiameterMm,
        shearInThreads: booleanValue(raw, "shear_in_threads", true),
        numRows, numCols, pitchZMm, pitchXMm,
        edgeTopMm: positiveNumber(raw, "edge_top_mm"),
        edgeBottomMm: positiveNumber(raw, "edge_bottom_mm"),
        edgeLeftMm: positiveNumber(raw, "edge_left_mm"),
        edgeRightMm: positiveNumber(raw, "edge_right_mm"),
        shearForceZKn: numberValue(raw, "shear_force_z_kn", 0.0),
        shearForceXKn: numberValue(raw, "shear_force_x_kn", 0.0),
        torsionMomentKnm: numberValue(raw, "torsion_moment_knm", 0.0),
        holeType,
        gammaM2: positiveNumber(raw, "gamma_m2", GAMMA.M2),
        boltCount: numRows * numCols,
    };
}
/** Bolt coordinates: centred on the group centroid, x to the right, z downwards, row by row (as the API). */
export function boltGroupLayout(input) {
    const startX = -((input.numCols - 1) * input.pitchXMm) / 2, startZ = -((input.numRows - 1) * input.pitchZMm) / 2;
    const out = [];
    for (let row = 0; row < input.numRows; row++)
        for (let col = 0; col < input.numCols; col++)
            out.push({ row, col, xMm: startX + col * input.pitchXMm, zMm: startZ + row * input.pitchZMm });
    return out;
}
/**
 * Bearing of one bolt for its force component along x or z (Table 3.4 note
 * 3): alpha_d = e / (3 d0) for an end bolt (no bolt ahead, e = the edge
 * distance ahead), p / (3 d0) - 1/4 for an inner bolt; k1 of the lines
 * parallel to the component: outer line min(2.8 e2/d0 - 1.7, 1.4 p2/d0 - 1.7,
 * 2.5) (the p2 term with more than one line), inner line min(1.4 p2/d0 - 1.7,
 * 2.5). Oversized holes 0.8. A zero component takes the lower direction.
 */
function componentBearing(input, fub, fu, d0, row, col, axis, component) {
    const columns = { count: input.numCols, pitch: input.pitchXMm, minus: input.edgeLeftMm, plus: input.edgeRightMm, index: col };
    const rows = { count: input.numRows, pitch: input.pitchZMm, minus: input.edgeTopMm, plus: input.edgeBottomMm, index: row };
    const along = axis === "x" ? columns : rows;
    const across = axis === "x" ? rows : columns;
    let k1;
    if (across.count === 1)
        k1 = Math.min(2.8 * Math.min(across.minus, across.plus) / d0 - 1.7, 2.5);
    else if (across.index === 0 || across.index === across.count - 1) {
        const e2 = across.index === 0 ? across.minus : across.plus;
        k1 = Math.min(2.8 * e2 / d0 - 1.7, 1.4 * across.pitch / d0 - 1.7, 2.5);
    }
    else
        k1 = Math.min(1.4 * across.pitch / d0 - 1.7, 2.5);
    k1 = Math.max(k1, 0);
    const holeFactor = input.holeType === "oversized" ? 0.8 : 1.0;
    const forDirection = (direction) => {
        const end = direction > 0 ? along.index === along.count - 1 : along.index === 0;
        const alphaD = end ? (direction > 0 ? along.plus : along.minus) / (3 * d0) : along.pitch / (3 * d0) - 0.25;
        const alphaB = Math.max(Math.min(alphaD, fub / fu, 1), 0);
        return { Fb: holeFactor * k1 * alphaB * fu * input.boltDiameterMm * input.plateThicknessMm / input.gammaM2 / 1000, k1, alphaB, end };
    };
    if (component > 1e-12)
        return forDirection(1);
    if (component < -1e-12)
        return forDirection(-1);
    const plus = forDirection(1), minus = forDirection(-1);
    return minus.Fb < plus.Fb ? minus : plus;
}
export function calculateBoltGroup(raw) {
    const input = parseBoltGroup(raw);
    const { fy, fu } = boltedPlateSteel(input.steelGrade, input.plateThicknessMm);
    const d = input.boltDiameterMm;
    const d0 = holeDiameter(d, input.holeType);
    const fub = BOLT_CLASS_TABLE[input.boltClass].fub;
    const shearRes = boltShearResistance(input.boltClass, d, input.shearInThreads, input.gammaM2);
    const Fv = shearRes.Fv / 1000;
    const layout = boltGroupLayout(input);
    const Ip = layout.reduce((sum, b) => sum + b.xMm ** 2 + b.zMm ** 2, 0);
    const n = input.boltCount;
    const bolts = layout.map((b, i) => {
        const fxShear = input.shearForceXKn / n, fzShear = input.shearForceZKn / n;
        const factor = Ip > 1e-9 ? input.torsionMomentKnm * 1000 / Ip : 0;
        const fxTorsion = -factor * b.zMm, fzTorsion = factor * b.xMm;
        const fx = fxShear + fxTorsion, fz = fzShear + fzTorsion;
        const resultant = Math.sqrt(fx ** 2 + fz ** 2);
        const bearingX = componentBearing(input, fub, fu, d0, b.row, b.col, "x", fx);
        const bearingZ = componentBearing(input, fub, fu, d0, b.row, b.col, "z", fz);
        const ratio = (force, res) => (Math.abs(force) <= 1e-12 ? 0 : res > 1e-9 ? Math.abs(force) / res : Infinity);
        const utilBearing = Math.max(ratio(fx, bearingX.Fb), ratio(fz, bearingZ.Fb));
        const utilShear = Fv > 1e-9 ? resultant / Fv : Infinity;
        const bearingEquivalent = utilBearing > 0 ? resultant / utilBearing : Math.min(bearingX.Fb, bearingZ.Fb);
        return { id: i + 1, row: b.row + 1, col: b.col + 1, xMm: b.xMm, zMm: b.zMm, fxShear, fzShear, fxTorsion, fzTorsion, fx, fz, resultant,
            bearingX, bearingZ, bearingEquivalent, shearResistance: Fv, utilShear, utilBearing, utilization: Math.max(utilShear, utilBearing),
            governing: utilBearing > utilShear ? "bearing" : "shear" };
    });
    const critical = bolts.reduce((best, b) => (b.utilization > best.utilization ? b : best));
    const status = critical.utilization <= 1 ? "PASS" : "FAIL";
    const warningCodes = [];
    if (bolts.some(b => b.governing === "bearing"))
        warningCodes.push("BEARING_RESISTANCE_GOVERNS");
    if (bolts.some(b => b.governing === "shear"))
        warningCodes.push("SHEAR_RESISTANCE_GOVERNS");
    if (status === "FAIL")
        warningCodes.push("STRENGTH_CHECK_FAILED");
    const record = {
        steel_grade: input.steelGrade, bolt_class: input.boltClass, bolt_count: n, bolt_diameter_mm: d,
        hole_diameter_mm: round(d0, 6), polar_inertia_mm2: round(Ip, 6), shear_resistance_per_bolt_kn: round(Fv, 6),
        min_bearing_resistance_kn: round(Math.min(...bolts.map(b => b.bearingEquivalent)), 6),
        max_bolt_force_kn: round(Math.max(0, ...bolts.map(b => b.resultant)), 6),
        critical_bolt_id: critical.id, global_utilization: round(critical.utilization, 6), utilization_percent: round(critical.utilization * 100, 1),
        overall_status: status, check_passed: status === "PASS",
        bolts: bolts.map(b => ({
            id: b.id, x_mm: round(b.xMm, 6), z_mm: round(b.zMm, 6),
            fx_shear_kn: round(b.fxShear, 6), fz_shear_kn: round(b.fzShear, 6), fx_torsion_kn: round(b.fxTorsion, 6), fz_torsion_kn: round(b.fzTorsion, 6),
            fx_total_kn: round(b.fx, 6), fz_total_kn: round(b.fz, 6), resultant_force_kn: round(b.resultant, 6),
            bearing_resistance_x_kn: round(b.bearingX.Fb, 6), bearing_resistance_z_kn: round(b.bearingZ.Fb, 6),
            bearing_utilization_ratio: round(b.utilBearing, 6), shear_utilization_ratio: round(b.utilShear, 6),
            bearing_resistance_kn: round(b.bearingEquivalent, 6), shear_resistance_kn: round(Fv, 6),
            design_resistance_kn: round(Math.min(Fv, b.bearingEquivalent), 6), governing_resistance: b.governing,
            utilization_ratio: round(b.utilization, 6), utilization_percent: round(b.utilization * 100, 1), status: b.utilization <= 1 ? "PASS" : "FAIL",
        })),
        warning_codes: warningCodes,
    };
    const oversized = input.holeType === "oversized";
    const list = new CheckList(`Critical bolt ${critical.id} (row ${critical.row}, column ${critical.col})`);
    list.resistance("shear", "Bolt shear: |F| against F<sub>v,Rd</sub>", critical.resultant * 1000, Fv * 1000, "N", "Table 3.4", input.shearInThreads ? "Shear plane through the thread (A_s)" : "Shear plane through the shank (A)");
    if (Math.abs(critical.fx) > 1e-12)
        list.resistance("bearing-x", `Bearing, x component (${critical.bearingX.end ? "end" : "inner"} bolt in that direction)`, Math.abs(critical.fx) * 1000, critical.bearingX.Fb * 1000, "N", `Table 3.4 note 3${oversized ? ", × 0.8" : ""}`);
    if (Math.abs(critical.fz) > 1e-12)
        list.resistance("bearing-z", `Bearing, z component (${critical.bearingZ.end ? "end" : "inner"} bolt in that direction)`, Math.abs(critical.fz) * 1000, critical.bearingZ.Fb * 1000, "N", `Table 3.4 note 3${oversized ? ", × 0.8" : ""}`);
    const others = bolts.filter(b => b !== critical).sort((a, b) => b.utilization - a.utilization);
    if (others.length) {
        list.setGroup("Other bolts (governing check per bolt)");
        for (const b of others) {
            const rx = Math.abs(b.fx) > 1e-12 && b.bearingX.Fb > 0 ? Math.abs(b.fx) / b.bearingX.Fb : 0;
            const rz = Math.abs(b.fz) > 1e-12 && b.bearingZ.Fb > 0 ? Math.abs(b.fz) / b.bearingZ.Fb : 0;
            const bearing = b.governing === "bearing";
            const x = rx >= rz;
            const demand = bearing ? (x ? Math.abs(b.fx) : Math.abs(b.fz)) : b.resultant;
            const capacity = bearing ? (x ? b.bearingX.Fb : b.bearingZ.Fb) : Fv;
            list.resistance(`bolt-${b.id}`, `Bolt ${b.id} (row ${b.row}, col ${b.col}): ${bearing ? `bearing, ${x ? "x" : "z"} component` : "shear"}`, demand * 1000, capacity * 1000, "N", bearing ? "Table 3.4 note 3" : "Table 3.4");
        }
    }
    list.setGroup("Detailing (Table 3.3, warnings; not in the API route)");
    const minima = [
        ["Edge distance top", input.edgeTopMm, 1.2 * d0], ["Edge distance bottom", input.edgeBottomMm, 1.2 * d0],
        ["Edge distance left", input.edgeLeftMm, 1.2 * d0], ["Edge distance right", input.edgeRightMm, 1.2 * d0],
        ...(input.numRows > 1 ? [["Pitch p<sub>z</sub>", input.pitchZMm, 2.2 * d0]] : []),
        ...(input.numCols > 1 ? [["Pitch p<sub>x</sub>", input.pitchXMm, 2.2 * d0]] : []),
    ];
    minima.forEach(([label, provided, required], i) => list.minimum(`geo-${i}`, label, provided, required, "mm", "Table 3.3", "warning"));
    if (Ip <= 1e-9 && input.torsionMomentKnm !== 0)
        list.info("single", "A single bolt cannot carry the torsion moment: the elastic method ignores T (as the API)", "warning", "elastic method");
    const values = [
        { title: "Bolts and plate", rows: [
                { label: "d / d<sub>0</sub> (EN 1090-2 Table 11)", value: `${d} / ${d0}`, unit: "mm" },
                { label: `f<sub>y</sub> / f<sub>u</sub> plate (t = ${input.plateThicknessMm} mm)`, value: `${fy} / ${fu}`, unit: "MPa" },
                { label: `F<sub>v,Rd</sub> per bolt (α<sub>v</sub> = ${shearRes.alphaV})`, value: Fv, unit: "kN", digits: 2 },
                { label: "Σ r² (polar moment of the bolt group)", value: Ip, unit: "mm²", digits: 0 },
            ] },
        { title: "Bolt forces (elastic polar method) and bearing per component", rows: bolts.map(b => ({
                label: `Bolt ${b.id} (x ${b.xMm.toFixed(0)}, z ${b.zMm.toFixed(0)}): F<sub>x</sub> ${b.fx.toFixed(2)}, F<sub>z</sub> ${b.fz.toFixed(2)} kN; F<sub>b,x</sub> ${b.bearingX.Fb.toFixed(1)}, F<sub>b,z</sub> ${b.bearingZ.Fb.toFixed(1)} kN`,
                value: b.utilization, unit: "η", digits: 3
            })) },
    ];
    const notes = [
        ...COMMON_NOTES,
        "Rectangular bolt group under direct shear (V_x, V_z) and in-plane torsion T about the group centroid; elastic polar-moment method (rigid plate, equal bolts): F_i = V/n + T r_i / Σr².",
        "Bearing per bolt and per force component (EN 1993-1-8 Table 3.4 note 3): the x and z components are verified separately against the bearing resistance in their direction; bolt shear on the resultant.",
        "Plate f_y, f_u per EN 1993-1-1 Table 3.1 by thickness (S355: f_u = 490 MPa, as the corrected API). The supporting member is not checked; bolts in single shear; no slip resistance, prying or bolt tension. Coordinates: x to the right, z downwards; T positive from x towards z.",
    ];
    return { ...finish(list.rows, values, notes), input, d0, fy, fu, polarInertia: Ip, shearResistanceKn: Fv, bolts, critical, summary: { utilization: critical.utilization, status, warningCodes }, record };
}
export function calculateFilletWeld(raw) {
    const steelGrade = stringValue(raw, "steel_grade", "S355");
    const material = WELD_STEEL_TABLE[steelGrade];
    if (!material)
        throw new SteelBasicInputError(`Unsupported steel_grade '${steelGrade}'.`);
    const method = stringValue(raw, "verification_method", "simplified");
    if (method !== "simplified" && method !== "directional")
        throw new SteelBasicInputError(`Unsupported verification_method '${method}'.`);
    const a = positiveNumber(raw, "throat_thickness_a_mm");
    const L = optionalPositiveNumber(raw, "effective_length_leff_mm");
    const gammaM2 = positiveNumber(raw, "gamma_m2", GAMMA.M2);
    const warningCodes = [];
    const throatPassed = a >= 3.0;
    if (!throatPassed)
        warningCodes.push("THROAT_BELOW_MINIMUM");
    const minLength = Math.max(30, 6 * a);
    const lengthPassed = L === null || L >= minLength;
    if (!lengthPassed)
        warningCodes.push("EFFECTIVE_LENGTH_BELOW_MINIMUM");
    const geometryPassed = throatPassed && lengthPassed;
    if (!geometryPassed)
        warningCodes.push("GEOMETRY_CHECK_FAILED");
    let simplified = null, directional = null;
    let utilization = 999.9, status = "FAIL";
    let verification;
    if (geometryPassed && method === "simplified") {
        const fwEd = positiveNumber(raw, "force_per_unit_length_fw_ed_n_per_mm");
        const fvwd = material.fu / Math.sqrt(3) / (material.betaW * gammaM2);
        const FwRd = fvwd * a;
        utilization = fwEd / FwRd;
        status = fwEd <= FwRd ? "PASS" : "FAIL";
        if (status === "FAIL")
            warningCodes.push("SIMPLIFIED_STRENGTH_CHECK_FAILED");
        simplified = { fwEd, fvwd, FwRd, utilization };
        verification = { method: "simplified", force_per_unit_length_fw_ed_n_per_mm: fwEd, f_vw_d_mpa: round(fvwd, 6), f_w_rd_n_per_mm: round(FwRd, 6),
            utilization_ratio: round(utilization, 6), utilization_percent: round(utilization * 100, 1), status };
    }
    else if (geometryPassed) {
        const sigmaPerp = positiveNumber(raw, "sigma_perp_mpa");
        const tauPerp = nonNegativeNumber(raw, "tau_perp_mpa");
        const tauParallel = nonNegativeNumber(raw, "tau_parallel_mpa");
        const effective = Math.sqrt(sigmaPerp ** 2 + 3 * (tauPerp ** 2 + tauParallel ** 2));
        const limit1 = material.fu / (material.betaW * gammaM2), limit2 = 0.9 * material.fu / gammaM2;
        const util1 = effective / limit1, util2 = sigmaPerp / limit2;
        utilization = Math.max(util1, util2);
        status = effective <= limit1 && sigmaPerp <= limit2 ? "PASS" : "FAIL";
        if (effective > limit1)
            warningCodes.push("DIRECTIONAL_CRITERION_1_FAILED");
        if (sigmaPerp > limit2)
            warningCodes.push("DIRECTIONAL_CRITERION_2_FAILED");
        directional = { sigmaPerp, tauPerp, tauParallel, effective, limit1, limit2, util1, util2 };
        verification = { method: "directional", sigma_perp_mpa: sigmaPerp, tau_perp_mpa: tauPerp, tau_parallel_mpa: tauParallel,
            effective_stress_mpa: round(effective, 6), resistance_stress_1_mpa: round(limit1, 6), resistance_stress_2_mpa: round(limit2, 6),
            criterion_1_passed: effective <= limit1, criterion_2_passed: sigmaPerp <= limit2, utilization_1_ratio: round(util1, 6), utilization_2_ratio: round(util2, 6),
            utilization_ratio: round(utilization, 6), utilization_percent: round(utilization * 100, 1), status };
    }
    else {
        verification = { method, status: "FAIL - Geometry constraints not met" };
    }
    const betaLw1 = L !== null && L > 150 * a ? Math.min(1, 1.2 - 0.2 * L / (150 * a)) : null;
    const overall = geometryPassed ? status : "FAIL - Geometry constraints not met";
    const record = {
        steel_grade: steelGrade, fu_mpa: material.fu, beta_w: material.betaW, gamma_m2: gammaM2, verification_method: method,
        geometry_check: {
            throat_check_passed: throatPassed, throat_thickness_a_mm: a, minimum_throat_thickness_mm: 3.0,
            length_check_passed: lengthPassed, effective_length_leff_mm: L,
            minimum_effective_length_mm: L === null ? null : round(minLength, 3), geometry_check_passed: geometryPassed,
        },
        verification,
        utilization_ratio: round(utilization, 6), utilization_percent: round(utilization * 100, 1),
        overall_status: overall, check_passed: geometryPassed && status === "PASS", warning_codes: warningCodes,
    };
    const list = new CheckList("Weld geometry (4.5.2)");
    list.minimum("throat", "Throat thickness a", a, 3, "mm", "4.5.2(2)");
    if (L !== null)
        list.minimum("length", "Effective length L<sub>eff</sub> ≥ max(30 mm, 6 a)", L, minLength, "mm", "4.5.1(2), 4.5.2(2)");
    list.setGroup(method === "simplified" ? "Simplified method (4.5.3.3)" : "Directional method (4.5.3.2)");
    if (simplified)
        list.resistance("fw", "F<sub>w,Ed</sub> ≤ F<sub>w,Rd</sub> = f<sub>vw,d</sub> a", simplified.fwEd, simplified.FwRd, "N/mm", "4.5.3.3 (4.3), (4.4)");
    if (directional) {
        list.resistance("crit1", "[σ⊥² + 3(τ⊥² + τ∥²)]<sup>0.5</sup> ≤ f<sub>u</sub> / (β<sub>w</sub> γ<sub>M2</sub>)", directional.effective, directional.limit1, "MPa", "4.5.3.2 (4.1)");
        list.resistance("crit2", "σ⊥ ≤ 0.9 f<sub>u</sub> / γ<sub>M2</sub>", directional.sigmaPerp, directional.limit2, "MPa", "4.5.3.2 (4.1)");
    }
    if (!geometryPassed)
        list.info("geometry", "The weld does not satisfy 4.5.2(2): it should not be designed to carry load", "fail", "4.5.2(2)");
    if (betaLw1 !== null)
        list.info("long", `L<sub>eff</sub> > 150 a: in a lap joint reduce the resistance by β<sub>Lw,1</sub> = ${betaLw1.toFixed(3)} (not applied here)`, "warning", "4.11 (4.9)");
    const values = [{ title: "Weld", rows: [
                { label: "f<sub>u</sub> (weaker part) / β<sub>w</sub> / γ<sub>M2</sub>", value: `${material.fu} / ${material.betaW} / ${gammaM2}`, unit: "" },
                { label: "Leg length z = a √2", value: a * Math.SQRT2, unit: "mm", digits: 1 },
                ...(simplified ? [{ label: "f<sub>vw,d</sub> = f<sub>u</sub> / (√3 β<sub>w</sub> γ<sub>M2</sub>)", value: simplified.fvwd, unit: "MPa", digits: 2 },
                    ...(L !== null ? [{ label: "F<sub>w,Rd</sub> L<sub>eff</sub> (whole weld)", value: simplified.FwRd * L / 1000, unit: "kN", digits: 1 }] : [])] : []),
            ] }];
    const notes = [
        ...COMMON_NOTES,
        "Fillet weld in the weaker connected part's steel grade (f_u per EN 1993-1-1 Table 3.1, t ≤ 40 mm; S460: 540 MPa); the stresses (directional method) or the force per unit length (simplified method) are input values: the distribution over a weld group is not calculated.",
        "Weld detailing, penetration, fatigue, execution class and the parent material are not checked.",
    ];
    return { ...finish(list.rows, values, notes), steelGrade, fu: material.fu, betaW: material.betaW, gammaM2, method, throat: a, effectiveLength: L, geometryPassed, simplified, directional, betaLw1,
        summary: { utilization, status: overall, checkPassed: geometryPassed && status === "PASS", warningCodes }, record };
}
export function calculatePlateTension(raw) {
    const width = positiveNumber(raw, "width_mm");
    const thickness = positiveNumber(raw, "thickness_mm");
    const nEd = positiveNumber(raw, "n_ed_kn");
    const steelGrade = stringValue(raw, "steel_grade", "S235");
    const row = PLATE_STEEL_TABLE[steelGrade];
    if (!row)
        throw new SteelBasicInputError(`Unsupported steel_grade '${steelGrade}'.`);
    if (thickness > 80)
        throw new SteelBasicInputError(`thickness_mm ${thickness} exceeds 80 mm, the range of EN 1993-1-1 Table 3.1; take fy and fu from the product standard.`);
    const { fy, fu } = thickness > 40 ? row.upTo80 : row.upTo40;
    const range = thickness > 40 ? "40 < t <= 80 mm" : "t <= 40 mm";
    const holeD = nonNegativeNumber(raw, "hole_diameter_mm", 0.0);
    const holes = nonNegativeInteger(raw, "n_holes", 0);
    const A = width * thickness;
    const NplKn = round(A * fy / GAMMA.M0 / 1000, 2);
    const grossPercent = round(nEd / NplKn * 100, 1);
    const grossStatus = nEd <= NplKn ? "PASS" : "FAIL";
    const warningCodes = [];
    let NRdKn = NplKn, governingCriterion = "gross_section";
    let Anet = null, NuKn = null;
    let netCheck = { message: "No bolt holes - net section check not applicable" };
    if (holeD > 0 && holes > 0) {
        Anet = Math.max((width - holes * holeD) * thickness, 0);
        NuKn = round(0.9 * Anet * fu / GAMMA.M2 / 1000, 2);
        const netPercent = NuKn > 1e-9 ? round(nEd / NuKn * 100, 1) : null;
        const netStatus = NuKn > 1e-9 && nEd <= NuKn ? "PASS" : "FAIL";
        netCheck = { formula: "N_u,Rd = 0.9 * A_net * f_u / gamma_M2", a_gross_mm2: A, hole_reduction_mm2: A - Anet, a_net_mm2: Anet, fu_mpa: fu, gamma_m2: GAMMA.M2,
            n_u_rd_kn: NuKn, n_ed_kn: nEd, utilization_percent: netPercent, status: netStatus };
        if (NuKn < NplKn) {
            NRdKn = NuKn;
            governingCriterion = "net_section";
            warningCodes.push("NET_SECTION_GOVERNS");
        }
        if (netStatus === "FAIL")
            warningCodes.push("NET_SECTION_FAILED");
    }
    else
        warningCodes.push("NET_SECTION_NOT_CHECKED");
    if (grossStatus === "FAIL")
        warningCodes.push("GROSS_SECTION_FAILED");
    const utilizationPercent = NRdKn > 1e-9 ? round(nEd / NRdKn * 100, 1) : null;
    const status = NRdKn > 1e-9 && nEd <= NRdKn ? "PASS" : "FAIL";
    const record = {
        steel_grade: steelGrade, fy_mpa: fy, fu_mpa: fu, table_3_1_thickness_range: range, a_gross_mm2: A, n_pl_rd_kn: NplKn,
        gross_utilization_percent: grossPercent, gross_status: grossStatus, n_rd_kn: NRdKn, governing_criterion: governingCriterion,
        utilization_percent: utilizationPercent, overall_status: status, check_passed: status === "PASS", warning_codes: warningCodes,
        gross_section_check: { formula: "N_pl,Rd = A_gross * f_y / gamma_M0", a_gross_mm2: A, fy_mpa: fy, gamma_m0: GAMMA.M0, n_pl_rd_kn: NplKn, n_ed_kn: nEd, utilization_percent: grossPercent, status: grossStatus },
        net_section_check: netCheck,
    };
    const list = new CheckList("Plate in tension (EN 1993-1-1 6.2.3)");
    list.resistance("gross", "Gross section: N<sub>pl,Rd</sub> = A f<sub>y</sub> / γ<sub>M0</sub>", nEd * 1000, NplKn * 1000, "N", "EN 1993-1-1 6.2.3(2)a (6.6)");
    if (NuKn !== null)
        list.resistance("net", `Net section: N<sub>u,Rd</sub> = 0.9 A<sub>net</sub> f<sub>u</sub> / γ<sub>M2</sub> (${holes} hole${holes > 1 ? "s" : ""} Ø${holeD})`, nEd * 1000, NuKn * 1000, "N", "EN 1993-1-1 6.2.3(2)b (6.7)");
    else
        list.info("net", "No holes in the critical section: net section not checked", "ok", "EN 1993-1-1 6.2.3");
    const values = [{ title: "Plate", rows: [
                { label: `f<sub>y</sub> / f<sub>u</sub> (t = ${thickness} mm, Table 3.1, ${range.replaceAll("<=", "≤")})`, value: `${fy} / ${fu}`, unit: "MPa" },
                { label: "A", value: A, unit: "mm²", digits: 0 },
                ...(Anet !== null ? [{ label: "A<sub>net</sub>", value: Anet, unit: "mm²", digits: 0 }] : []),
            ] }];
    const notes = [
        ...COMMON_NOTES,
        "Rectangular plate in pure tension, EN 10025-2 steel (EN 1993-1-1 Table 3.1 by thickness); one non-staggered critical section across the width (holes in a line).",
        "Staggered holes, shear lag (angles, 3.10.3), block tearing, eccentricity and category C connections (N_net,Rd) are not checked here.",
    ];
    return { ...finish(list.rows, values, notes), steelGrade, fy, fu, width, thickness, holeDiameter: holeD, holes, A, Anet, NplKn, NuKn, NRdKn,
        summary: { utilizationPercent, status, governingCriterion, warningCodes }, record };
}
/** The four calculators by API calculator id. */
export const STEEL_BASIC_CALCULATORS = {
    ec3_bolted_lap_joint: calculateLapJoint,
    ec3_bolt_group_torsion: calculateBoltGroup,
    ec3_fillet_weld: calculateFilletWeld,
    ec3_plate_tension: calculatePlateTension,
};
// ================================================================== page fields and adapters
const opt = (list) => [...list];
export const LAP_JOINT_FIELDS = [
    { name: "plate_t1_mm", group: "Plates", label: "<b>t<sub>1</sub></b> — plate 1 (loaded)", unit: "mm", kind: "number", min: 0, default: 10 },
    { name: "plate_t2_mm", group: "Plates", label: "<b>t<sub>2</sub></b> — plate 2 (held)", unit: "mm", kind: "number", min: 0, default: 8 },
    { name: "plate_width_mm", group: "Plates", label: "<b>b</b> — plate width", unit: "mm", kind: "number", min: 0, default: 140 },
    { name: "steel_grade", group: "Plates", label: "Steel grade", unit: "", kind: "select", options: opt(BOLTED_GRADES), default: "S355" },
    { name: "bolt_diameter_mm", group: "Bolts", label: "<b>d</b> — bolt diameter", unit: "mm", kind: "number", min: 0, default: 16 },
    { name: "bolt_class", group: "Bolts", label: "Bolt class", unit: "", kind: "select", options: Object.keys(BOLT_CLASS_TABLE), default: "8.8" },
    { name: "shear_in_threads", group: "Bolts", label: "Shear plane through the thread", unit: "", kind: "checkbox", default: false },
    { name: "hole_type", group: "Bolts", label: "Holes", unit: "", kind: "select", options: ["normal", "oversized"], default: "normal" },
    { name: "num_rows", group: "Layout", label: "<b>n<sub>rows</sub></b> — rows along the force", unit: "—", kind: "integer", min: 1, max: 40, default: 4 },
    { name: "num_cols", group: "Layout", label: "<b>n<sub>cols</sub></b> — bolts per row", unit: "—", kind: "integer", min: 1, max: 12, default: 2 },
    { name: "e1_mm", group: "Layout", label: "<b>e<sub>1</sub></b> — end distance", unit: "mm", kind: "number", min: 0, default: 40 },
    { name: "e2_mm", group: "Layout", label: "<b>e<sub>2</sub></b> — edge distance", unit: "mm", kind: "number", min: 0, default: 35 },
    { name: "p1_mm", group: "Layout", label: "<b>p<sub>1</sub></b> — spacing along the force", unit: "mm", kind: "number", min: 0, default: 60, optional: true },
    { name: "p2_mm", group: "Layout", label: "<b>p<sub>2</sub></b> — spacing across", unit: "mm", kind: "number", min: 0, default: 70, optional: true },
    { name: "category", group: "Category and forces", label: "Category (EN 1993-1-8 3.4.1)", unit: "", kind: "select", options: ["A", "B", "C"], default: "A" },
    { name: "friction_surface_class", group: "Category and forces", label: "Friction surface class (Table 3.7)", unit: "", kind: "select", options: ["A", "B", "C", "D"], default: "A", showIf: { category: ["B", "C"] } },
    { name: "force_uls_kn", group: "Category and forces", label: "<b>F<sub>Ed</sub></b> — ULS force on the joint", unit: "kN", kind: "number", min: 0, default: 250 },
    { name: "force_sls_kn", group: "Category and forces", label: "<b>F<sub>Ed,ser</sub></b> — SLS force (category B)", unit: "kN", kind: "number", min: 0, default: 90, showIf: { category: ["B"] } },
    { name: "primary_web_thickness_mm", group: "Primary web (optional)", label: "Primary web thickness", unit: "mm", kind: "number", min: 0, optional: true, note: "Source-script check with α_b = 0.5" },
    { name: "primary_web_fu_mpa", group: "Primary web (optional)", label: "Primary web f<sub>u</sub>", unit: "MPa", kind: "number", min: 0, optional: true },
    { name: "web_bearing_factor", group: "Primary web (optional)", label: "Web bearing divisor", unit: "—", kind: "number", min: 0, optional: true },
];
export const BOLT_GROUP_FIELDS = [
    { name: "plate_thickness_mm", group: "Plate", label: "<b>t</b> — plate thickness", unit: "mm", kind: "number", min: 0, default: 10 },
    { name: "steel_grade", group: "Plate", label: "Steel grade", unit: "", kind: "select", options: opt(BOLTED_GRADES), default: "S235" },
    { name: "bolt_diameter_mm", group: "Bolts", label: "<b>d</b> — bolt diameter", unit: "mm", kind: "number", min: 0, default: 20 },
    { name: "bolt_class", group: "Bolts", label: "Bolt class", unit: "", kind: "select", options: Object.keys(BOLT_CLASS_TABLE), default: "8.8" },
    { name: "shear_in_threads", group: "Bolts", label: "Shear plane through the thread", unit: "", kind: "checkbox", default: true },
    { name: "hole_type", group: "Bolts", label: "Holes", unit: "", kind: "select", options: ["normal", "oversized"], default: "normal" },
    { name: "num_rows", group: "Layout", label: "<b>n<sub>rows</sub></b> — rows (along z)", unit: "—", kind: "integer", min: 1, max: 12, default: 3 },
    { name: "num_cols", group: "Layout", label: "<b>n<sub>cols</sub></b> — columns (along x)", unit: "—", kind: "integer", min: 1, max: 8, default: 2 },
    { name: "pitch_z_mm", group: "Layout", label: "<b>p<sub>z</sub></b> — row pitch", unit: "mm", kind: "number", min: 0, default: 80, optional: true },
    { name: "pitch_x_mm", group: "Layout", label: "<b>p<sub>x</sub></b> — column pitch", unit: "mm", kind: "number", min: 0, default: 100, optional: true },
    { name: "edge_top_mm", group: "Edges", label: "Edge distance top", unit: "mm", kind: "number", min: 0, default: 45 },
    { name: "edge_bottom_mm", group: "Edges", label: "Edge distance bottom", unit: "mm", kind: "number", min: 0, default: 45 },
    { name: "edge_left_mm", group: "Edges", label: "Edge distance left", unit: "mm", kind: "number", min: 0, default: 45 },
    { name: "edge_right_mm", group: "Edges", label: "Edge distance right", unit: "mm", kind: "number", min: 0, default: 45 },
    { name: "shear_force_z_kn", group: "Loads at the bolt-group centroid", label: "<b>V<sub>z</sub></b> — shear, positive down", unit: "kN", kind: "number", default: 120, optional: true },
    { name: "shear_force_x_kn", group: "Loads at the bolt-group centroid", label: "<b>V<sub>x</sub></b> — shear, positive right", unit: "kN", kind: "number", default: 0, optional: true },
    { name: "torsion_moment_knm", group: "Loads at the bolt-group centroid", label: "<b>T</b> — in-plane moment (e.g. V<sub>z</sub> × eccentricity)", unit: "kNm", kind: "number", default: 18, optional: true },
    { name: "gamma_m2", group: "Factors", label: "<b>γ<sub>M2</sub></b>", unit: "—", kind: "number", min: 0, default: 1.25, fallback: true },
];
export const FILLET_WELD_FIELDS = [
    { name: "steel_grade", group: "Weld", label: "Steel grade (weaker part)", unit: "", kind: "select", options: Object.keys(WELD_STEEL_TABLE), default: "S235" },
    { name: "throat_thickness_a_mm", group: "Weld", label: "<b>a</b> — throat thickness", unit: "mm", kind: "number", min: 0, default: 5 },
    { name: "effective_length_leff_mm", group: "Weld", label: "<b>L<sub>eff</sub></b> — effective length", unit: "mm", kind: "number", min: 0, default: 120, optional: true },
    { name: "verification_method", group: "Method and action", label: "Method", unit: "", kind: "select", options: ["simplified", "directional"], default: "simplified" },
    { name: "force_per_unit_length_fw_ed_n_per_mm", group: "Method and action", label: "<b>F<sub>w,Ed</sub></b> — force per unit length", unit: "N/mm", kind: "number", min: 0, default: 850, showIf: { verification_method: ["simplified"] } },
    { name: "sigma_perp_mpa", group: "Method and action", label: "<b>σ⊥</b> — normal stress on the throat", unit: "MPa", kind: "number", min: 0, default: 200, showIf: { verification_method: ["directional"] } },
    { name: "tau_perp_mpa", group: "Method and action", label: "<b>τ⊥</b> — shear across the weld axis", unit: "MPa", kind: "number", min: 0, default: 100, showIf: { verification_method: ["directional"] } },
    { name: "tau_parallel_mpa", group: "Method and action", label: "<b>τ∥</b> — shear along the weld axis", unit: "MPa", kind: "number", min: 0, default: 60, showIf: { verification_method: ["directional"] } },
    { name: "gamma_m2", group: "Factors", label: "<b>γ<sub>M2</sub></b>", unit: "—", kind: "number", min: 0, default: 1.25, fallback: true },
];
export const PLATE_TENSION_FIELDS = [
    { name: "width_mm", group: "Plate", label: "<b>b</b> — width", unit: "mm", kind: "number", min: 0, default: 120 },
    { name: "thickness_mm", group: "Plate", label: "<b>t</b> — thickness", unit: "mm", kind: "number", min: 0, default: 10 },
    { name: "steel_grade", group: "Plate", label: "Steel grade", unit: "", kind: "select", options: opt(TENSION_GRADES), default: "S235" },
    { name: "n_holes", group: "Holes in the critical section", label: "<b>n</b> — holes across the width", unit: "—", kind: "integer", min: 0, max: 20, default: 2, optional: true },
    { name: "hole_diameter_mm", group: "Holes in the critical section", label: "<b>d<sub>0</sub></b> — hole diameter", unit: "mm", kind: "number", min: 0, default: 22, optional: true },
    { name: "n_ed_kn", group: "Action", label: "<b>N<sub>Ed</sub></b> — design tension", unit: "kN", kind: "number", min: 0, default: 180 },
];
/** Validates the page form (field list) and the route (calculator); a rejected input returns its message. */
function normaliseWith(fields, calculate) {
    return (raw) => {
        const checked = normaliseFields(raw, fields);
        if (!checked.ok)
            return checked;
        const api = {};
        for (const [key, value] of Object.entries(checked.values))
            if (value !== undefined)
                api[key] = value;
        try {
            calculate(api);
        }
        catch (error) {
            if (error instanceof SteelBasicInputError)
                return { ok: false, errors: [error.message] };
            throw error;
        }
        return { ok: true, input: api };
    };
}
export const normaliseLapJointInput = normaliseWith(LAP_JOINT_FIELDS, calculateLapJoint);
export const normaliseBoltGroupInput = normaliseWith(BOLT_GROUP_FIELDS, calculateBoltGroup);
export const normaliseFilletWeldInput = normaliseWith(FILLET_WELD_FIELDS, calculateFilletWeld);
export const normalisePlateTensionInput = normaliseWith(PLATE_TENSION_FIELDS, calculatePlateTension);
