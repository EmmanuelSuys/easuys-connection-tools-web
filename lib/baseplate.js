/**
 * Column base: steel base plate on a grout layer and a concrete foundation,
 * four cast-in headed anchor bolts in two rows outside the column (one row
 * beyond each flange or wall). Pinned: two load cases, compression with
 * shear and uplift with shear. Fixed: axial force with a strong-axis moment
 * and shear, EN 1993-1-8 6.2.8.3 / Table 6.7 (checkFixedBase below).
 *
 * EN 1993-1-8: 6.2.5 (f_jd, c), 6.2.8.2 (axial resistance), 6.2.6.11 with
 * 6.2.6.5 and Table 6.6 (base plate in bending under tension, extended
 * end-plate row), Table 6.2 (T-stub modes, prying limit L_b*), 6.2.6.12 and
 * Table 3.4 (anchor bolts), 6.2.2(6)-(8) (shear: friction + anchors),
 * 4.5.3.3 (fillet welds). EN 1992-1-1 6.7 (concentration factor α).
 * EN 1992-4 (cast-in headed fasteners): 7.2.1.3 steel, 7.2.1.4 concrete
 * cone, 7.2.1.5 pull-out, 7.2.2.4 pry-out, 7.2.2.5 concrete edge, 7.2.3
 * interaction.
 *
 * Coordinates: x along the column depth h (anchor rows at ±p_x/2), y along
 * the column width b (anchors of a row at ±p_y/2), origin at the column axis.
 * Input forces in kN, everything else N, mm, MPa.
 */
import { BOLT_CLASSES, BOLT_SIZES, steelStrength } from "./design.js";
import { CheckList, normaliseFields, summariseChecks } from "./checks.js";
import { CONCRETE_CLASSES, NUT_WASHER, WELD_BETA } from "./eurocode-data.js";
const COLUMN = "Column";
const PLATE = "Base plate and grout";
const ANCHORS = "Anchors (cast-in, headed)";
const CONCRETE = "Concrete foundation";
const ACTIONS = "Design actions";
const FACTORS = "Partial factors";
export const BASE_PLATE_FIELDS = [
    { name: "baseType", group: COLUMN, label: "Column base: <b>pinned</b> (N, V) or <b>fixed</b> (N, M about the strong axis x, V)", unit: "", kind: "select", options: ["pinned", "fixed"], default: "pinned" },
    { name: "columnType", group: COLUMN, label: "Column section", unit: "", kind: "select", options: ["I", "RHS"], default: "I" },
    { name: "h", group: COLUMN, label: "<b>h</b> — depth (x, anchor rows beyond it)", unit: "mm", kind: "number", min: 50, max: 1000, default: 200 },
    { name: "b", group: COLUMN, label: "<b>b</b> — width (y)", unit: "mm", kind: "number", min: 50, max: 1000, default: 200 },
    { name: "tw", group: COLUMN, label: "<b>t<sub>w</sub></b> — web thickness", unit: "mm", kind: "number", min: 3, max: 80, default: 9, showIf: { columnType: ["I"] } },
    { name: "tf", group: COLUMN, label: "<b>t<sub>f</sub></b> — flange thickness", unit: "mm", kind: "number", min: 3, max: 80, default: 15, showIf: { columnType: ["I"] } },
    { name: "t", group: COLUMN, label: "<b>t</b> — wall thickness", unit: "mm", kind: "number", min: 2, max: 40, default: 8, showIf: { columnType: ["RHS"] } },
    { name: "aw", group: COLUMN, label: "<b>a</b> — fillet weld throat (all round)", unit: "mm", kind: "number", min: 3, max: 20, default: 5 },
    { name: "hp", group: PLATE, label: "<b>h<sub>p</sub></b> — plate length (x)", unit: "mm", kind: "number", min: 60, max: 1500, default: 360 },
    { name: "bp", group: PLATE, label: "<b>b<sub>p</sub></b> — plate width (y)", unit: "mm", kind: "number", min: 60, max: 1500, default: 360 },
    { name: "tp", group: PLATE, label: "<b>t<sub>p</sub></b> — plate thickness", unit: "mm", kind: "number", min: 6, max: 80, default: 20 },
    { name: "steelGrade", group: PLATE, label: "Steel grade, plate and column (EN 10025-2)", unit: "", kind: "select", options: ["S235", "S275", "S355"], default: "S235" },
    { name: "tg", group: PLATE, label: "<b>t<sub>g</sub></b> — grout thickness", unit: "mm", kind: "number", min: 0, max: 100, default: 30 },
    { name: "anchorSize", group: ANCHORS, label: "Anchor size", unit: "", kind: "select", options: ["M12", "M16", "M20", "M24", "M27", "M30", "M36"], default: "M20" },
    { name: "anchorClass", group: ANCHORS, label: "Anchor class", unit: "", kind: "select", options: ["4.6", "5.6", "8.8"], default: "8.8" },
    { name: "px", group: ANCHORS, label: "<b>p<sub>x</sub></b> — spacing of the two anchor rows (x)", unit: "mm", kind: "number", min: 60, max: 1400, default: 280 },
    { name: "py", group: ANCHORS, label: "<b>p<sub>y</sub></b> — spacing of the anchors in a row (y)", unit: "mm", kind: "number", min: 40, max: 1400, default: 260 },
    { name: "hef", group: ANCHORS, label: "<b>h<sub>ef</sub></b> — effective embedment depth", unit: "mm", kind: "number", min: 60, max: 1000, default: 200 },
    { name: "dh", group: ANCHORS, label: "<b>d<sub>h</sub></b> — head or anchor-plate bearing diameter", unit: "mm", kind: "number", min: 15, max: 200, default: 50 },
    { name: "concrete", group: CONCRETE, label: "Concrete class", unit: "", kind: "select", options: Object.keys(CONCRETE_CLASSES), default: "C25/30" },
    { name: "cracked", group: CONCRETE, label: "Cracked concrete (EN 1992-4)", unit: "", kind: "checkbox", default: true },
    { name: "af", group: CONCRETE, label: "<b>a<sub>f</sub></b> — foundation length (x)", unit: "mm", kind: "number", min: 60, max: 20000, default: 1000 },
    { name: "bf", group: CONCRETE, label: "<b>b<sub>f</sub></b> — foundation width (y)", unit: "mm", kind: "number", min: 60, max: 20000, default: 1000 },
    { name: "hf", group: CONCRETE, label: "<b>h<sub>f</sub></b> — foundation depth", unit: "mm", kind: "number", min: 100, max: 5000, default: 600 },
    { name: "alpha", group: CONCRETE, label: "<b>α</b> — concentration factor (empty: from the foundation size)", unit: "—", kind: "number", min: 1, max: 3, optional: true },
    { name: "NcEd", group: ACTIONS, label: "Case 1: <b>N<sub>c,Ed</sub></b> — compression", unit: "kN", kind: "number", min: 0, max: 20000, default: 600, showIf: { baseType: ["pinned"] } },
    { name: "VcEd", group: ACTIONS, label: "Case 1: <b>V<sub>Ed</sub></b> — concurrent shear", unit: "kN", kind: "number", min: 0, max: 5000, default: 30, showIf: { baseType: ["pinned"] } },
    { name: "NtEd", group: ACTIONS, label: "Case 2: <b>N<sub>t,Ed</sub></b> — uplift", unit: "kN", kind: "number", min: 0, max: 5000, default: 60, showIf: { baseType: ["pinned"] } },
    { name: "VtEd", group: ACTIONS, label: "Case 2: <b>V<sub>Ed</sub></b> — concurrent shear", unit: "kN", kind: "number", min: 0, max: 5000, default: 15, showIf: { baseType: ["pinned"] } },
    { name: "NfixedEd", group: ACTIONS, label: "<b>N<sub>Ed</sub></b> — compression negative, tension positive", unit: "kN", kind: "number", min: -20000, max: 20000, default: -200, showIf: { baseType: ["fixed"] } },
    { name: "MfixedEd", group: ACTIONS, label: "<b>M<sub>Ed</sub></b> — strong axis; + tensions the +x row", unit: "kNm", kind: "number", min: -5000, max: 5000, default: 30, showIf: { baseType: ["fixed"] } },
    { name: "VfixedEd", group: ACTIONS, label: "<b>V<sub>Ed</sub></b> — shear magnitude", unit: "kN", kind: "number", min: 0, max: 5000, default: 30, showIf: { baseType: ["fixed"] } },
    { name: "gammaM0", group: FACTORS, label: "<b>γ<sub>M0</sub></b>", unit: "—", kind: "number", min: 1, max: 2, default: 1.0, fallback: true },
    { name: "gammaM2", group: FACTORS, label: "<b>γ<sub>M2</sub></b>", unit: "—", kind: "number", min: 1, max: 2, default: 1.25, fallback: true },
    { name: "gammaC", group: FACTORS, label: "<b>γ<sub>c</sub></b> (EN 1992-4: γ<sub>Mc</sub> = γ<sub>c</sub>)", unit: "—", kind: "number", min: 1, max: 2, default: 1.5, fallback: true },
    { name: "alphaCC", group: FACTORS, label: "<b>α<sub>cc</sub></b>", unit: "—", kind: "number", min: 0.8, max: 1, default: 1.0, fallback: true }
];
/** Validates the input, including the geometric consistency of column, plate, anchors and foundation. */
export function normaliseBasePlateInput(raw) {
    const checked = normaliseFields(raw, BASE_PLATE_FIELDS);
    if (!checked.ok)
        return checked;
    const input = checked.values;
    const errors = [];
    const { h, b, aw, hp, bp, px, py, af, bf, hf, hef } = input;
    if (input.columnType === "I") {
        if (2 * input.tf >= h)
            errors.push("tf must be less than h/2");
        if (input.tw >= b)
            errors.push("tw must be less than b");
    }
    else if (2 * input.t >= Math.min(h, b))
        errors.push("t must be less than half the smaller side of the hollow section");
    if (hp < h)
        errors.push(`hp must be at least the column depth h = ${h} mm`);
    if (bp < b)
        errors.push(`bp must be at least the column width b = ${b} mm`);
    const mx = px / 2 - h / 2 - 0.8 * aw * Math.SQRT2;
    if (!(mx > 0))
        errors.push(`px must place the anchor rows outside the column and its weld: px/2 − h/2 − 0.8 a√2 = ${mx.toFixed(1)} mm`);
    if (px >= hp)
        errors.push("px must be less than the plate length hp");
    if (py >= bp)
        errors.push("py must be less than the plate width bp");
    if (af < hp)
        errors.push("af must be at least the plate length hp");
    if (bf < bp)
        errors.push("bf must be at least the plate width bp");
    if (hef >= hf)
        errors.push("hef must be less than the foundation depth hf");
    const bolt = BOLT_SIZES[input.anchorSize];
    if (input.dh <= bolt.d)
        errors.push(`dh must exceed the anchor diameter ${bolt.d} mm`);
    return errors.length ? { ok: false, errors } : { ok: true, input };
}
/** Exact area of a union of axis-parallel rectangles (coordinate compression). */
export function unionArea(rects) {
    const xs = [...new Set(rects.flatMap(r => [r[0], r[1]]))].sort((p, q) => p - q);
    const ys = [...new Set(rects.flatMap(r => [r[2], r[3]]))].sort((p, q) => p - q);
    let area = 0;
    for (let i = 0; i < xs.length - 1; i++) {
        const xm = (xs[i] + xs[i + 1]) / 2;
        for (let j = 0; j < ys.length - 1; j++) {
            const ym = (ys[j] + ys[j + 1]) / 2;
            if (rects.some(r => xm > r[0] && xm < r[1] && ym > r[2] && ym < r[3]))
                area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
        }
    }
    return area;
}
/**
 * T-stubs in compression (EN 1993-1-8 6.2.5, Figure 6.4): every flange, web
 * or wall widened by c on all free sides, clipped to the plate. For a hollow
 * section the strips also extend c inside the section.
 */
export function compressionRectangles(input, c) {
    const { h, b, hp, bp } = input;
    const raw = [];
    if (input.columnType === "I") {
        const tf = input.tf, tw = input.tw;
        raw.push([h / 2 - tf - c, h / 2 + c, -b / 2 - c, b / 2 + c]);
        raw.push([-h / 2 - c, -h / 2 + tf + c, -b / 2 - c, b / 2 + c]);
        raw.push([-h / 2 + tf, h / 2 - tf, -tw / 2 - c, tw / 2 + c]);
    }
    else {
        const t = input.t;
        raw.push([h / 2 - t - c, h / 2 + c, -b / 2 - c, b / 2 + c]);
        raw.push([-h / 2 - c, -h / 2 + t + c, -b / 2 - c, b / 2 + c]);
        raw.push([-h / 2 - c, h / 2 + c, b / 2 - t - c, b / 2 + c]);
        raw.push([-h / 2 - c, h / 2 + c, -b / 2 - c, -b / 2 + t + c]);
    }
    let clipped = false;
    const rects = raw.map(([x0, x1, y0, y1]) => {
        const r = [Math.max(x0, -hp / 2), Math.min(x1, hp / 2), Math.max(y0, -bp / 2), Math.min(y1, bp / 2)];
        if (r[0] !== x0 || r[1] !== x1 || r[2] !== y0 || r[3] !== y1)
            clipped = true;
        return r;
    }).filter(r => r[1] > r[0] && r[3] > r[2]);
    return { rects, clipped };
}
/** Column bending resistance about the strong axis for 6.2.6.7: class 1-2 plastic, class 3 elastic; class 4 refused. */
function columnBending(g, fy) {
    const eps = Math.sqrt(235 / fy);
    const { h, b } = g;
    let flangeRatio, webRatio, Wpl, I;
    let flangeLimits;
    if (g.columnType === "I") {
        const tf = g.tf, tw = g.tw;
        flangeRatio = (b - tw) / 2 / tf; // outstand without root radius (conservative)
        flangeLimits = [9 * eps, 10 * eps, 14 * eps];
        webRatio = (h - 2 * tf) / tw;
        Wpl = b * tf * (h - tf) + tw * (h - 2 * tf) ** 2 / 4;
        I = (b * h ** 3 - (b - tw) * (h - 2 * tf) ** 3) / 12;
    }
    else {
        const t = g.t;
        flangeRatio = (b - 3 * t) / t; // EN 1993-1-1 Table 5.2, internal part of a hollow section
        flangeLimits = [33 * eps, 38 * eps, 42 * eps];
        webRatio = (h - 3 * t) / t;
        Wpl = b * t * (h - t) + t * (h - 2 * t) ** 2 / 2;
        I = (b * h ** 3 - (b - 2 * t) * (h - 2 * t) ** 3) / 12;
    }
    const webLimits = [72 * eps, 83 * eps, 124 * eps];
    const classOf = (ratio, limits) => ratio <= limits[0] ? 1 : ratio <= limits[1] ? 2 : ratio <= limits[2] ? 3 : 4;
    const cls = Math.max(classOf(flangeRatio, flangeLimits), classOf(webRatio, webLimits));
    if (cls === 4)
        throw new Error("fixed base: the column section is class 4 in bending (EN 1993-1-1 Table 5.2); not covered");
    return { cls: cls, W: cls <= 2 ? Wpl : I / (h / 2) };
}
/**
 * Column base under N_Ed and a moment about the strong axis (EN 1993-1-8 6.2.8.3, Table 6.7) with the
 * resistances of the pinned check: the tension side is the base-plate T-stub of the anchor row beyond the
 * tensioned flange (6.2.6.11), the compression side the smaller of the concrete under the compressed flange
 * T-stub (6.2.6.9, the concrete under the web omitted per 6.2.8.3(1)) and the column flange and web in
 * compression (6.2.6.7). M_j,Rd is evaluated at the given N_Ed (the same pass/fail limit as Table 6.7 with
 * e = M_Ed/N_Ed). N_Ed is positive in tension; the layout is symmetric, so only |M_Ed| matters.
 */
function checkFixedBase(g) {
    const kN = 1000;
    const NEd = (g.NfixedEd ?? 0) * kN;
    const MEd = Math.abs(g.MfixedEd ?? 0) * kN * 1000;
    const VEd = (g.VfixedEd ?? 0) * kN;
    // Resistances do not depend on the actions: take them from the pinned check with zero actions.
    const base = checkPinnedBase({ ...g, NcEd: 0, VcEd: 0, NtEd: 0, VtEd: 0 });
    const { fjd, c } = base.compression;
    const { FTRd, FtRd, mx, n, prying } = base.tension;
    const { NRds, NRdp, cx, cy, gammaMc, N0Rkc, VRdcp, VRdc } = base.anchorage;
    const column = steelStrength(g.steelGrade, g.columnType === "I" ? Math.max(g.tf, g.tw) : g.t);
    const tf = g.columnType === "I" ? g.tf : g.t;
    const checks = new CheckList();
    // ---- compression side: the T-stub under the compressed (−x) flange, clipped to the plate
    const fx0 = Math.max(-g.h / 2 - c, -g.hp / 2), fx1 = Math.min(-g.h / 2 + tf + c, g.hp / 2);
    const fy0 = Math.max(-g.b / 2 - c, -g.bp / 2), fy1 = Math.min(g.b / 2 + c, g.bp / 2);
    const Aflange = Math.max(0, fx1 - fx0) * Math.max(0, fy1 - fy0);
    const zC = -(fx0 + fx1) / 2;
    const FcplRd = Aflange * fjd;
    const bending = columnBending(g, column.fy);
    const McRd = bending.W * column.fy / g.gammaM0;
    const FcfbRd = McRd / (g.h - tf);
    const FCRd = Math.min(FcplRd, FcfbRd);
    const zT = g.px / 2;
    if (!(zC > 0 && zT > 0))
        throw new Error("fixed base: lever arms must be positive");
    // ---- Table 6.7 equilibrium at N_Ed (N positive in tension)
    const z = zT + zC;
    let loadCase, TEd, CEd, MjRd;
    const Tmixed = (MEd + NEd * zC) / z, Cmixed = (MEd - NEd * zT) / z;
    if (Tmixed >= 0 && Cmixed >= 0) {
        loadCase = "tension-compression";
        TEd = Tmixed;
        CEd = Cmixed;
        MjRd = Math.min(FTRd * z - NEd * zC, FCRd * z + NEd * zT);
    }
    else if (Tmixed < 0) {
        // both flanges in compression: the moment adds to the −x side
        loadCase = "compression-compression";
        TEd = 0;
        CEd = -NEd / 2 + MEd / (2 * zC);
        MjRd = (2 * FCRd + NEd) * zC;
    }
    else {
        // both anchor rows in tension
        loadCase = "tension-tension";
        CEd = 0;
        TEd = NEd / 2 + MEd / (2 * zT);
        MjRd = (2 * FTRd - NEd) * zT;
    }
    checks.setGroup("Fixed base: N + M (Table 6.7)");
    if (loadCase !== "compression-compression") {
        checks.resistance("fixed-tension", `Tension on the anchor row, T<sub>Ed</sub> ≤ F<sub>T,Rd</sub> (base-plate T-stub, ${base.tension.mode})`, TEd, FTRd, "N", "EN 1993-1-8 6.2.8.3, 6.2.6.11, Table 6.2");
    }
    if (loadCase !== "tension-tension") {
        checks.resistance("fixed-compression", "Compression under the flange, C<sub>Ed</sub> ≤ F<sub>C,Rd</sub> = min(F<sub>c,pl,Rd</sub>, F<sub>c,fb,Rd</sub>)", CEd, FCRd, "N", "EN 1993-1-8 6.2.8.3, 6.2.6.9, 6.2.6.7");
    }
    if (MjRd > 0)
        checks.resistance("fixed-moment", `Moment at N<sub>Ed</sub>: M<sub>Ed</sub> ≤ M<sub>j,Rd</sub> (${loadCase.replace("-", " and ")})`, MEd, MjRd, "Nmm", "EN 1993-1-8 Table 6.7");
    else
        checks.info("fixed-moment", "The axial force alone exceeds the resistance of the joint: M<sub>j,Rd</sub> ≤ 0", "fail", "EN 1993-1-8 Table 6.7");
    checks.maximum("grout", "Grout thickness for β<sub>j</sub> = 2/3: t<sub>g</sub> ≤ 0.2 min(h<sub>p</sub>, b<sub>p</sub>)", g.tg, 0.2 * Math.min(g.hp, g.bp), "mm", "EN 1993-1-8 6.2.5(7)", "warning", "β_j = 2/3 also needs a grout strength of at least 0.2 f_ck of the foundation");
    // ---- shear: friction from the column compression plus the anchors (6.2.2(6)-(8))
    const Nc = Math.max(0, -NEd);
    const FfRd = 0.2 * Nc;
    const Fvb = base.shear.Fvb;
    const FvRd = FfRd + 4 * Fvb;
    checks.setGroup("Fixed base: shear and anchors");
    checks.resistance("fixed-shear", "Shear: friction 0.2 N<sub>c,Ed</sub> + 4 F<sub>vb,Rd</sub>", VEd, FvRd, "N", "EN 1993-1-8 6.2.2(6)-(8)");
    const rowTension = loadCase === "compression-compression" ? 0 : TEd;
    const anchorForce = rowTension / 2 * (prying ? (mx + n) / n : 1);
    const anchorShear = Math.max(0, VEd - FfRd) / 4;
    checks.resistance("anchor-combined", "Anchor of the tension row in shear and tension: F<sub>v,Ed</sub>/F<sub>vb,Rd</sub> + F<sub>t,Ed</sub>/(1.4 F<sub>t,Rd</sub>) ≤ 1", anchorShear / Fvb + anchorForce / (1.4 * FtRd), 1, "—", "EN 1993-1-8 Table 3.4");
    // ---- EN 1992-4: the two anchors of the tension row as a group (the other row is not in tension)
    const ccr0 = 1.5 * g.hef;
    const close = [cx, cy, cy].filter(value => value < ccr0);
    const hefPair = close.length >= 3 ? Math.min(g.hef, Math.max(Math.max(...close) / 1.5, g.py / 3)) : g.hef;
    const ccr = 1.5 * hefPair, scr = 3 * hefPair;
    const N0Pair = N0Rkc * (hefPair / base.anchorage.hefUsed) ** 1.5;
    const AcNpair = (Math.min(cx, ccr) + ccr) * (2 * Math.min(cy, ccr) + Math.min(g.py, scr));
    const psiS = Math.min(1, 0.7 + 0.3 * Math.min(cx, cy) / ccr);
    const psiRe = Math.min(1, 0.5 + g.hef / 200);
    const NRdcPair = N0Pair * AcNpair / scr ** 2 * psiS * psiRe / gammaMc;
    const pairForce = 2 * anchorForce;
    checks.setGroup("Anchorage in concrete, tension row");
    const pryNote = prying ? "anchor force with prying, upper bound T/2 (m + n)/n" : undefined;
    checks.resistance("anchor-steel", "Anchor steel failure, per anchor", anchorForce, NRds, "N", "EN 1992-4 7.2.1.3", pryNote);
    checks.resistance("anchor-pullout", "Pull-out of the head, per anchor", anchorForce, NRdp, "N", "EN 1992-4 7.2.1.5");
    checks.resistance("anchor-cone", `Concrete cone of the two anchors of the tension row${close.length >= 3 ? " (narrow member: h′<sub>ef</sub>)" : ""}`, pairForce, NRdcPair, "N", "EN 1992-4 7.2.1.4");
    checks.minimum("blow-out", "Edge distance c ≥ 0.5 h<sub>ef</sub> (blow-out not covered by this check)", Math.min(cx, cy), 0.5 * g.hef, "mm", "EN 1992-4 7.2.1.8", "warning");
    checks.setGroup("Anchorage in concrete, shear (friction neglected)");
    checks.resistance("pry-out", "Pry-out of the group", VEd, VRdcp, "N", "EN 1992-4 7.2.2.4");
    checks.resistance("concrete-edge", "Concrete edge failure, front anchor pair towards the nearer edge", VEd, VRdc, "N", "EN 1992-4 7.2.2.5");
    const betaN = Math.max(anchorForce / NRdp, pairForce / NRdcPair);
    const betaV = Math.max(VEd / VRdcp, VEd / VRdc);
    checks.resistance("anchor-interaction", "Concrete modes in tension and shear: β<sub>N</sub><sup>1.5</sup> + β<sub>V</sub><sup>1.5</sup> ≤ 1", betaN ** 1.5 + betaV ** 1.5, 1, "—", "EN 1992-4 7.2.3, Table 7.3");
    // ---- weld of the tension flange: flange force M/(h − t_f) + N/2, with the shear on the web welds
    const { FwRd, Lv } = base.weld;
    const Lflange = g.columnType === "I" ? 2 * g.b - g.tw : g.b;
    const flangeForce = Math.max(0, MEd / (g.h - tf) + NEd / 2);
    checks.setGroup("Weld column – base plate");
    checks.resistance("weld-fixed", "Fillet weld of the tension flange (flange force) with the shear on the web welds", Math.hypot(flangeForce / Lflange, VEd / Lv), FwRd, "N/mm", "EN 1993-1-8 4.5.3.3");
    // ---- detailing as for the pinned base
    checks.setGroup("Detailing");
    for (const row of base.checks.filter(r => r.group === "Detailing"))
        checks.rows.push(row);
    const fixed = {
        loadCase, NEd, MEd, VEd, zT, zC, Aflange, FcplRd, columnClass: bending.cls, Wcolumn: bending.W, McRd, FcfbRd, FCRd,
        FTRd, TEd, CEd, MjRd, anchorForce, pairForce, NRdcPair, FfRd, FvRd, flangeForce
    };
    const values = [
        base.values[0], base.values[1], base.values[2],
        { title: "Fixed base — EN 1993-1-8 6.2.8.3, Table 6.7", rows: [
                { label: "N<sub>Ed</sub> (tension positive); |M<sub>Ed</sub>|", value: `${(NEd / kN).toFixed(1)}; ${(MEd / 1e6).toFixed(1)}`, unit: "kN; kNm" },
                { label: "z<sub>T</sub> = p<sub>x</sub>/2 (anchor row); z<sub>C</sub> (centre of the flange T-stub)", value: `${zT.toFixed(1)}; ${zC.toFixed(1)}`, unit: "mm" },
                { label: "A<sub>flange</sub> (flange widened by c, clipped); F<sub>c,pl,Rd</sub> = A f<sub>jd</sub>", value: `${Aflange.toFixed(0)}; ${(FcplRd / kN).toFixed(1)}`, unit: "mm²; kN" },
                { label: `Column class ${bending.cls} in bending: W = ${bending.cls <= 2 ? "W<sub>pl</sub>" : "W<sub>el</sub>"}; M<sub>c,Rd</sub>; F<sub>c,fb,Rd</sub> = M<sub>c,Rd</sub>/(h − t<sub>f</sub>)`, value: `${(bending.W / 1e3).toFixed(0)} cm³; ${(McRd / 1e6).toFixed(1)}; ${(FcfbRd / kN).toFixed(1)}`, unit: "—; kNm; kN" },
                { label: "F<sub>C,Rd</sub>; F<sub>T,Rd</sub> (one anchor row)", value: `${(FCRd / kN).toFixed(1)}; ${(FTRd / kN).toFixed(1)}`, unit: "kN" },
                { label: `Forces at N<sub>Ed</sub>, M<sub>Ed</sub> (${loadCase}): T<sub>Ed</sub>; C<sub>Ed</sub>`, value: `${(TEd / kN).toFixed(1)}; ${(CEd / kN).toFixed(1)}`, unit: "kN" },
                { label: "M<sub>j,Rd</sub> at N<sub>Ed</sub>", value: MjRd / 1e6, unit: "kNm" },
                { label: "Shear: F<sub>f,Rd</sub> = 0.2 N<sub>c,Ed</sub>; F<sub>v,Rd</sub> = F<sub>f,Rd</sub> + 4 F<sub>vb,Rd</sub>", value: `${(FfRd / kN).toFixed(1)}; ${(FvRd / kN).toFixed(1)}`, unit: "kN" },
                { label: "Tension row: anchor force; N<sub>Rd,c</sub> of the pair", value: `${(anchorForce / kN).toFixed(1)}; ${(NRdcPair / kN).toFixed(1)}`, unit: "kN" }
            ] },
        base.values[4], base.values[5]
    ];
    const notes = [
        "Fixed base: axial force and a moment about the strong axis x (EN 1993-1-8 6.2.8.3, Table 6.7); M_j,Rd is evaluated at the given N_Ed. Biaxial bending is not covered.",
        "Tension side: the base-plate T-stub of the anchor row beyond the tensioned flange (6.2.6.11, Table 6.6 extension row, Table 6.2). With anchors outside the flanges the column web in tension (6.2.6.3) is not a component of this layout.",
        "Compression side: the smaller of the concrete under the compressed flange T-stub (the concrete under the web is omitted, 6.2.8.3(1)) and the column flange and web in compression, F_c,fb,Rd = M_c,Rd/(h − t_f) (6.2.6.7); M_c,Rd is not reduced for N or V: check the column member separately.",
        "The rotational stiffness S_j,ini (6.3.4) is not calculated.",
        ...base.notes.slice(1)
    ];
    const rows = checks.rows;
    return { ...base, checks: rows, values, notes, ...summariseChecks(rows), fixed };
}
export function checkBasePlate(input) {
    return input.baseType === "fixed" ? checkFixedBase(input) : checkPinnedBase(input);
}
/** Concrete edge resistance in shear of the front anchor pair (EN 1992-4 7.2.2.5), N. */
function edgeResistance(c1, c2, s2, input, d, fck, gammaMc) {
    const hf = input.hf;
    let c1u = c1;
    if (c2 < 1.5 * c1 && hf < 1.5 * c1)
        c1u = Math.min(c1, Math.max(c2 / 1.5, hf / 1.5, s2 / 3));
    const lf = d <= 24 ? Math.min(input.hef, 12 * d) : Math.min(input.hef, Math.max(8 * d, 300));
    const alpha = 0.1 * Math.sqrt(lf / c1u);
    const beta = 0.1 * (d / c1u) ** 0.2;
    const k9 = input.cracked ? 1.7 : 2.4;
    const V0 = k9 * d ** alpha * lf ** beta * Math.sqrt(fck) * c1u ** 1.5;
    const A0 = 4.5 * c1u ** 2;
    const AcV = (2 * Math.min(c2, 1.5 * c1u) + Math.min(s2, 3 * c1u)) * Math.min(hf, 1.5 * c1u);
    const psiS = Math.min(1, 0.7 + 0.3 * c2 / (1.5 * c1u));
    const psiH = Math.max(1, Math.sqrt(1.5 * c1u / hf));
    return V0 * AcV / A0 * psiS * psiH / gammaMc;
}
function checkPinnedBase(input) {
    const g = input;
    const kN = 1000;
    const NcEd = g.NcEd * kN, VcEd = g.VcEd * kN, NtEd = g.NtEd * kN, VtEd = g.VtEd * kN;
    const plate = steelStrength(g.steelGrade, g.tp);
    const column = steelStrength(g.steelGrade, g.columnType === "I" ? Math.max(g.tf, g.tw) : g.t);
    const size = BOLT_SIZES[g.anchorSize];
    const grade = BOLT_CLASSES[g.anchorClass];
    const bolt = { size: g.anchorSize, d: size.d, d0: size.d0, As: size.As, dw: size.dw, s: size.s, fub: grade.fub, fyb: grade.fyb };
    const fck = CONCRETE_CLASSES[g.concrete];
    const checks = new CheckList();
    // ---- compression: EN 1993-1-8 6.2.5 and 6.2.8.2(1)
    const fcd = g.alphaCC * fck / g.gammaC;
    const ar = (g.af - g.hp) / 2, br = (g.bf - g.bp) / 2;
    const a1 = Math.max(g.hp, Math.min(g.hp + 2 * ar, 3 * g.hp, g.hp + g.hf));
    const b1 = Math.max(g.bp, Math.min(g.bp + 2 * br, 3 * g.bp, g.bp + g.hf));
    const alphaFoundation = Math.min(3, Math.sqrt(a1 * b1 / (g.hp * g.bp)));
    const alpha = g.alpha ?? alphaFoundation;
    const betaJ = 2 / 3;
    const fjd = betaJ * alpha * fcd;
    const c = g.tp * Math.sqrt(plate.fy / (3 * fjd * g.gammaM0));
    const { rects, clipped } = compressionRectangles(g, c);
    const Aeff = unionArea(rects);
    const NcRd = Aeff * fjd;
    checks.setGroup("Compression (case 1)");
    checks.resistance("compression", "Concrete and grout in compression under the base plate, N<sub>c,Ed</sub> ≤ A<sub>eff</sub> f<sub>jd</sub>", NcEd, NcRd, "N", "EN 1993-1-8 6.2.5, 6.2.8.2(1)");
    checks.maximum("grout", "Grout thickness for β<sub>j</sub> = 2/3: t<sub>g</sub> ≤ 0.2 min(h<sub>p</sub>, b<sub>p</sub>)", g.tg, 0.2 * Math.min(g.hp, g.bp), "mm", "EN 1993-1-8 6.2.5(7)", "warning", "β_j = 2/3 also needs a grout strength of at least 0.2 f_ck of the foundation");
    // ---- tension: base plate in bending (6.2.6.11 -> 6.2.6.5, Table 6.6 extension row) and anchors (6.2.6.12)
    const mx = g.px / 2 - g.h / 2 - 0.8 * g.aw * Math.SQRT2;
    const ex = (g.hp - g.px) / 2;
    const e = (g.bp - g.py) / 2;
    const w = g.py;
    const leffCp = Math.min(2 * Math.PI * mx, Math.PI * mx + w, Math.PI * mx + 2 * e);
    const leffNc = Math.min(4 * mx + 1.25 * ex, e + 2 * mx + 0.625 * ex, 0.5 * g.bp, 0.5 * w + 2 * mx + 0.625 * ex);
    const leff1 = Math.min(leffCp, leffNc);
    const leff2 = leffNc;
    const n = Math.min(ex, 1.25 * mx);
    const Mpl1 = 0.25 * leff1 * g.tp ** 2 * plate.fy / g.gammaM0;
    const Mpl2 = 0.25 * leff2 * g.tp ** 2 * plate.fy / g.gammaM0;
    const FtRd = 0.9 * bolt.fub * bolt.As / g.gammaM2;
    const sumFt = 2 * FtRd;
    const nw = NUT_WASHER[g.anchorSize];
    const Lb = 8 * bolt.d + g.tg + g.tp + nw.washer + nw.nut / 2;
    const LbStar = 8.8 * mx ** 3 * bolt.As * 1 / (leff1 * g.tp ** 3);
    const prying = Lb <= LbStar;
    let FT1, FT2, FT12;
    const FT3 = sumFt;
    let FTRd, mode;
    if (prying) {
        FT1 = 4 * Mpl1 / mx;
        FT2 = (2 * Mpl2 + n * sumFt) / (mx + n);
        [mode, FTRd] = [["mode 1", FT1], ["mode 2", FT2], ["mode 3", FT3]].reduce((best, item) => item[1] < best[1] ? item : best);
    }
    else {
        FT12 = 2 * Mpl1 / mx;
        [mode, FTRd] = FT12 <= FT3 ? ["mode 1-2", FT12] : ["mode 3", FT3];
    }
    const NtRd = 2 * FTRd;
    // anchor tension for the EN 1992-4 checks: with prying an upper bound F/2 (m + n)/n per anchor pair
    const anchorForce = NtEd / 4 * (prying ? (mx + n) / n : 1);
    checks.setGroup("Uplift (case 2)");
    checks.resistance("tension", `Base plate and anchors in tension, N<sub>t,Ed</sub> ≤ 2 F<sub>T,Rd</sub> (${mode})`, NtEd, NtRd, "N", "EN 1993-1-8 6.2.6.11, 6.2.6.5, Table 6.6, Table 6.2");
    // ---- shear: EN 1993-1-8 6.2.2(6)-(8)
    const FfRd = 0.2 * NcEd;
    const alphaBc = 0.44 - 0.0003 * bolt.fyb;
    const F2vb = alphaBc * bolt.fub * bolt.As / g.gammaM2;
    const bearing = (e1, p1, e2, p2) => {
        const alphaD = Math.min(e1 / (3 * bolt.d0), p1 / (3 * bolt.d0) - 0.25);
        const alphaB = Math.min(alphaD, bolt.fub / plate.fu, 1);
        const k1 = Math.min(2.8 * e2 / bolt.d0 - 1.7, 1.4 * p2 / bolt.d0 - 1.7, 2.5);
        return Math.max(0, k1) * Math.max(0, alphaB) * plate.fu * bolt.d * g.tp / g.gammaM2;
    };
    const F1vb = Math.min(bearing(ex, g.px, e, g.py), bearing(e, g.py, ex, g.px));
    const Fvb = Math.min(F1vb, F2vb);
    const FvRd1 = FfRd + 4 * Fvb;
    const FvRd2 = 4 * Fvb;
    checks.setGroup("Compression (case 1)");
    checks.resistance("shear-1", "Shear: friction 0.2 N<sub>c,Ed</sub> + 4 F<sub>vb,Rd</sub>", VcEd, FvRd1, "N", "EN 1993-1-8 6.2.2(6)-(8)");
    checks.setGroup("Uplift (case 2)");
    checks.resistance("shear-2", "Shear without friction: 4 F<sub>vb,Rd</sub>", VtEd, FvRd2, "N", "EN 1993-1-8 6.2.2(7)-(8)");
    const combined = (VtEd / 4) / Fvb + anchorForce / (1.4 * FtRd);
    checks.resistance("anchor-combined", "Anchor in shear and tension: F<sub>v,Ed</sub>/F<sub>vb,Rd</sub> + F<sub>t,Ed</sub>/(1.4 F<sub>t,Rd</sub>) ≤ 1", combined, 1, "—", "EN 1993-1-8 Table 3.4");
    // ---- anchorage in concrete: EN 1992-4 (headed fasteners)
    const gammaMs = Math.max(1.2 * bolt.fub / bolt.fyb, 1.4);
    const gammaMc = g.gammaC * 1.0; // γ_inst = 1.0 for headed fasteners
    const NRds = bolt.As * bolt.fub / gammaMs;
    const Ah = Math.PI / 4 * (g.dh ** 2 - bolt.d ** 2);
    const NRdp = (g.cracked ? 7.5 : 10.5) * Ah * fck / gammaMc;
    const cx = (g.af - g.px) / 2, cy = (g.bf - g.py) / 2;
    const ccr0 = 1.5 * g.hef;
    const close = [cx, cx, cy, cy].filter(value => value < ccr0);
    const narrow = close.length >= 3;
    const hefUsed = narrow ? Math.min(g.hef, Math.max(Math.max(...close) / 1.5, Math.max(g.px, g.py) / 3)) : g.hef;
    const ccr = 1.5 * hefUsed, scr = 3 * hefUsed;
    const N0Rkc = (g.cracked ? 8.9 : 12.7) * Math.sqrt(fck) * hefUsed ** 1.5;
    const AcN = (2 * Math.min(cx, ccr) + Math.min(g.px, scr)) * (2 * Math.min(cy, ccr) + Math.min(g.py, scr));
    const A0cN = scr ** 2;
    const psiS = Math.min(1, 0.7 + 0.3 * Math.min(cx, cy) / ccr);
    const psiRe = Math.min(1, 0.5 + g.hef / 200);
    const NRkc = N0Rkc * AcN / A0cN * psiS * psiRe;
    const NRdc = NRkc / gammaMc;
    const groupForce = 4 * anchorForce;
    checks.setGroup("Anchorage in concrete, tension (case 2)");
    const pryNote = prying ? "anchor force with prying, upper bound N/4 (m + n)/n" : undefined;
    checks.resistance("anchor-steel", "Anchor steel failure, per anchor", anchorForce, NRds, "N", "EN 1992-4 7.2.1.3", pryNote);
    checks.resistance("anchor-pullout", "Pull-out of the head, per anchor", anchorForce, NRdp, "N", "EN 1992-4 7.2.1.5");
    checks.resistance("anchor-cone", `Concrete cone of the group of 4${narrow ? " (narrow member: h′<sub>ef</sub>)" : ""}`, groupForce, NRdc, "N", "EN 1992-4 7.2.1.4");
    const cmin = Math.min(cx, cy);
    checks.minimum("blow-out", "Edge distance c ≥ 0.5 h<sub>ef</sub> (blow-out not covered by this check)", cmin, 0.5 * g.hef, "mm", "EN 1992-4 7.2.1.8", "warning");
    if (g.cracked)
        checks.info("splitting", "Splitting: not checked — cracked concrete with reinforcement limiting crack widths to 0.3 mm assumed", "ok", "EN 1992-4 7.2.1.7(2)");
    else
        checks.info("splitting", "Splitting in uncracked concrete is not covered: check it separately or use cracked concrete", "warning", "EN 1992-4 7.2.1.7");
    const VEd = Math.max(VcEd, VtEd);
    const k8 = g.hef >= 60 ? 2.0 : 1.0;
    const VRdcp = k8 * NRkc / gammaMc;
    const VRdcX = edgeResistance(cx, cy, g.py, g, bolt.d, fck, gammaMc);
    const VRdcY = edgeResistance(cy, cx, g.px, g, bolt.d, fck, gammaMc);
    const VRdc = Math.min(VRdcX, VRdcY);
    checks.setGroup("Anchorage in concrete, shear (friction neglected)");
    checks.resistance("pry-out", "Pry-out of the group", VEd, VRdcp, "N", "EN 1992-4 7.2.2.4");
    checks.resistance("concrete-edge", "Concrete edge failure, front anchor pair towards the nearer edge", VEd, VRdc, "N", "EN 1992-4 7.2.2.5");
    const betaN = Math.max(anchorForce / NRdp, groupForce / NRdc);
    const betaV = Math.max(VtEd / VRdcp, VtEd / VRdc);
    checks.setGroup("Anchorage in concrete, tension (case 2)");
    checks.resistance("anchor-interaction", "Concrete modes in tension and shear: β<sub>N</sub><sup>1.5</sup> + β<sub>V</sub><sup>1.5</sup> ≤ 1", betaN ** 1.5 + betaV ** 1.5, 1, "—", "EN 1992-4 7.2.3, Table 7.3");
    // ---- weld column to plate: EN 1993-1-8 4.5.3.3
    const betaW = WELD_BETA[g.steelGrade];
    const fu = Math.min(plate.fu, column.fu);
    const fvwd = fu / (Math.sqrt(3) * betaW * g.gammaM2);
    const FwRd = fvwd * g.aw;
    const Lw = g.columnType === "I" ? 2 * g.b + 2 * (g.b - g.tw) + 2 * (g.h - 2 * g.tf) : 2 * (g.h + g.b);
    const Lv = g.columnType === "I" ? Math.min(2 * (g.h - 2 * g.tf), 2 * g.b + 2 * (g.b - g.tw)) : Math.min(2 * g.h, 2 * g.b);
    const fw1 = VcEd / Lv;
    const fw2 = Math.hypot(NtEd / Lw, VtEd / Lv);
    checks.setGroup("Weld column – base plate");
    checks.resistance("weld-1", "Fillet weld, case 1 (compression by contact, shear on the welds parallel to it)", fw1, FwRd, "N/mm", "EN 1993-1-8 4.5.3.3");
    checks.resistance("weld-2", "Fillet weld, case 2 (uplift on all welds + shear)", fw2, FwRd, "N/mm", "EN 1993-1-8 4.5.3.3");
    // ---- detailing: EN 1993-1-8 Table 3.3 (anchors in the plate)
    checks.setGroup("Detailing");
    checks.minimum("end-distance", "Anchor to plate end, e<sub>x</sub> ≥ 1.2 d<sub>0</sub>", ex, 1.2 * bolt.d0, "mm", "EN 1993-1-8 Table 3.3");
    checks.minimum("edge-distance", "Anchor to plate side, e ≥ 1.2 d<sub>0</sub>", e, 1.2 * bolt.d0, "mm", "EN 1993-1-8 Table 3.3");
    checks.minimum("spacing-x", "Row spacing p<sub>x</sub> ≥ 2.2 d<sub>0</sub>", g.px, 2.2 * bolt.d0, "mm", "EN 1993-1-8 Table 3.3");
    checks.minimum("spacing-y", "Anchor spacing in a row p<sub>y</sub> ≥ 2.4 d<sub>0</sub>", g.py, 2.4 * bolt.d0, "mm", "EN 1993-1-8 Table 3.3");
    checks.minimum("washer", "Washer clear of the weld: p<sub>x</sub>/2 − h/2 ≥ d<sub>w</sub>/2 + a√2", g.px / 2 - g.h / 2, bolt.dw / 2 + g.aw * Math.SQRT2, "mm", "fabrication", "warning");
    const values = [
        { title: "Materials", rows: [
                { label: "Plate f<sub>y</sub> / f<sub>u</sub> (EN 1993-1-1 Table 3.1)", value: `${plate.fy} / ${plate.fu}`, unit: "MPa" },
                { label: `Anchor ${bolt.size} ${g.anchorClass}: A<sub>s</sub>, f<sub>yb</sub> / f<sub>ub</sub>`, value: `${bolt.As} mm², ${bolt.fyb} / ${bolt.fub}`, unit: "MPa" },
                { label: `Concrete ${g.concrete}: f<sub>ck</sub>, f<sub>cd</sub> = α<sub>cc</sub> f<sub>ck</sub> / γ<sub>c</sub>`, value: `${fck}, ${fcd.toFixed(2)}`, unit: "MPa" }
            ] },
        { title: "Compression — EN 1993-1-8 6.2.5", rows: [
                { label: `α = √(A<sub>c1</sub>/A<sub>c0</sub>) ≤ 3 (${g.alpha === undefined ? "plate area as A<sub>c0</sub>, foundation as A<sub>c1</sub>" : "input"})`, value: alpha, unit: "—", digits: 3 },
                { label: "f<sub>jd</sub> = β<sub>j</sub> α f<sub>cd</sub>, β<sub>j</sub> = 2/3", value: fjd, unit: "MPa", digits: 2 },
                { label: "c = t<sub>p</sub> √(f<sub>y</sub> / (3 f<sub>jd</sub> γ<sub>M0</sub>))", value: c, unit: "mm" },
                { label: `A<sub>eff</sub> (T-stubs widened by c${clipped ? ", limited by the plate" : ""})`, value: Aeff, unit: "mm²", digits: 0 },
                { label: "N<sub>c,Rd</sub> = A<sub>eff</sub> f<sub>jd</sub>", value: NcRd / kN, unit: "kN" }
            ] },
        { title: "Tension — base plate T-stub per anchor row (Table 6.6, extension row)", rows: [
                { label: "m<sub>x</sub> = p<sub>x</sub>/2 − h/2 − 0.8 a√2; e<sub>x</sub>; e; w = p<sub>y</sub>", value: `${mx.toFixed(1)}; ${ex.toFixed(1)}; ${e.toFixed(1)}; ${w.toFixed(1)}`, unit: "mm" },
                { label: "l<sub>eff,cp</sub> = min(2πm<sub>x</sub>, πm<sub>x</sub> + w, πm<sub>x</sub> + 2e)", value: leffCp, unit: "mm" },
                { label: "l<sub>eff,nc</sub> = min(4m<sub>x</sub> + 1.25e<sub>x</sub>, e + 2m<sub>x</sub> + 0.625e<sub>x</sub>, 0.5b<sub>p</sub>, 0.5w + 2m<sub>x</sub> + 0.625e<sub>x</sub>)", value: leffNc, unit: "mm" },
                { label: "n = min(e<sub>x</sub>, 1.25 m<sub>x</sub>)", value: n, unit: "mm" },
                { label: "F<sub>t,Rd</sub> = 0.9 f<sub>ub</sub> A<sub>s</sub> / γ<sub>M2</sub> per anchor", value: FtRd / kN, unit: "kN" },
                { label: "L<sub>b</sub> = 8d + t<sub>g</sub> + t<sub>p</sub> + washer + nut/2; L<sub>b</sub>* = 8.8 m<sub>x</sub>³ A<sub>s</sub> / (l<sub>eff,1</sub> t<sub>p</sub>³)", value: `${Lb.toFixed(0)}; ${LbStar.toFixed(0)}`, unit: "mm" },
                { label: prying ? "Prying can develop (L<sub>b</sub> ≤ L<sub>b</sub>*): F<sub>T,1</sub>; F<sub>T,2</sub>; F<sub>T,3</sub>" : "No prying (L<sub>b</sub> > L<sub>b</sub>*): F<sub>T,1-2</sub> = 2M<sub>pl,1</sub>/m<sub>x</sub>; F<sub>T,3</sub>",
                    value: prying ? `${(FT1 / kN).toFixed(1)}; ${(FT2 / kN).toFixed(1)}; ${(FT3 / kN).toFixed(1)}` : `${(FT12 / kN).toFixed(1)}; ${(FT3 / kN).toFixed(1)}`, unit: "kN" },
                { label: `N<sub>t,Rd</sub> = 2 F<sub>T,Rd</sub> (${mode})`, value: NtRd / kN, unit: "kN" }
            ] },
        { title: "Shear — EN 1993-1-8 6.2.2", rows: [
                { label: "F<sub>f,Rd</sub> = C<sub>f,d</sub> N<sub>c,Ed</sub>, C<sub>f,d</sub> = 0.2", value: FfRd / kN, unit: "kN" },
                { label: "F<sub>1,vb,Rd</sub> (bearing on the plate, Table 3.4, either direction)", value: F1vb / kN, unit: "kN" },
                { label: `F<sub>2,vb,Rd</sub> = α<sub>bc</sub> f<sub>ub</sub> A<sub>s</sub> / γ<sub>M2</sub>, α<sub>bc</sub> = ${alphaBc.toFixed(3)}`, value: F2vb / kN, unit: "kN" },
                { label: "F<sub>v,Rd</sub>: case 1 (with friction); case 2", value: `${(FvRd1 / kN).toFixed(1)}; ${(FvRd2 / kN).toFixed(1)}`, unit: "kN" }
            ] },
        { title: "Anchorage — EN 1992-4", rows: [
                { label: "γ<sub>Ms</sub> = 1.2 f<sub>ub</sub>/f<sub>yb</sub> ≥ 1.4; N<sub>Rd,s</sub> = A<sub>s</sub> f<sub>ub</sub> / γ<sub>Ms</sub>", value: `${gammaMs.toFixed(2)}; ${(NRds / kN).toFixed(1)}`, unit: "—; kN" },
                { label: `A<sub>h</sub> = π(d<sub>h</sub>² − d²)/4; N<sub>Rd,p</sub> = k<sub>2</sub> A<sub>h</sub> f<sub>ck</sub> / γ<sub>Mc</sub>, k<sub>2</sub> = ${g.cracked ? 7.5 : 10.5}`, value: `${Ah.toFixed(0)}; ${(NRdp / kN).toFixed(1)}`, unit: "mm²; kN" },
                { label: "Edge distances c<sub>x</sub>; c<sub>y</sub> (anchor axis to foundation side)", value: `${cx.toFixed(0)}; ${cy.toFixed(0)}`, unit: "mm" },
                { label: `N<sup>0</sup><sub>Rk,c</sub> = k<sub>1</sub> √f<sub>ck</sub> h<sub>ef</sub><sup>1.5</sup>, k<sub>1</sub> = ${g.cracked ? 8.9 : 12.7}${narrow ? `, h′<sub>ef</sub> = ${hefUsed.toFixed(0)} mm` : ""}`, value: N0Rkc / kN, unit: "kN" },
                { label: "A<sub>c,N</sub> / A<sup>0</sup><sub>c,N</sub>; ψ<sub>s,N</sub>; ψ<sub>re,N</sub>", value: `${(AcN / A0cN).toFixed(3)}; ${psiS.toFixed(3)}; ${psiRe.toFixed(3)}`, unit: "—" },
                { label: "N<sub>Rd,c</sub> (group)", value: NRdc / kN, unit: "kN" },
                { label: `V<sub>Rd,cp</sub> = k<sub>8</sub> N<sub>Rk,c</sub> / γ<sub>Mc</sub>, k<sub>8</sub> = ${k8}`, value: VRdcp / kN, unit: "kN" },
                { label: "V<sub>Rd,c</sub> towards the x edge; towards the y edge", value: `${(VRdcX / kN).toFixed(1)}; ${(VRdcY / kN).toFixed(1)}`, unit: "kN" }
            ] },
        { title: "Weld — EN 1993-1-8 4.5.3.3", rows: [
                { label: `f<sub>vw,d</sub> = f<sub>u</sub> / (√3 β<sub>w</sub> γ<sub>M2</sub>), β<sub>w</sub> = ${betaW}`, value: fvwd, unit: "MPa" },
                { label: "F<sub>w,Rd</sub> = f<sub>vw,d</sub> a", value: FwRd, unit: "N/mm", digits: 0 },
                { label: "Weld length: all round L<sub>w</sub>; parallel to the shear L<sub>v</sub> (smaller direction)", value: `${Lw.toFixed(0)}; ${Lv.toFixed(0)}`, unit: "mm" }
            ] }
    ];
    const notes = [
        "Pinned base: the column moment at the base is taken as zero; a fixed base (EN 1993-1-8 6.2.8.3, Table 6.7) is not covered.",
        "Four cast-in headed anchors in two rows outside the column, plate centred on the foundation; normal clearance holes in the plate (EN 1090-2).",
        "The concentration factor α uses the plate area as A_c0 and the largest similar area within the foundation as A_c1 (min(a + 2a_r, 3a, a + h_f)): conservative compared with A_c0 = A_eff.",
        "Compression is transferred by contact (column end square to the plate); the welds carry uplift and shear only.",
        "EN 1992-4 shear checks carry the full shear on the anchors (friction neglected) towards the nearer foundation side; the steel shear resistance of the anchors is the EN 1993-1-8 6.2.2(7) value, which covers bending in the grout layer.",
        "Not covered: blow-out (EN 1992-4 7.2.1.8), anchor reinforcement, the column itself and the foundation design.",
        "Partial factors default to the recommended values; check the National Annex that applies to the project."
    ];
    const checksRows = checks.rows;
    return {
        checks: checksRows, values, notes, ...summariseChecks(checksRows),
        plate, bolt, fck,
        compression: { fcd, alpha, alphaSource: g.alpha === undefined ? "foundation" : "input", fjd, c, Aeff, NcRd, rects, clipped },
        tension: { mx, ex, e, w, leffCp, leffNc, leff1, leff2, n, FtRd, Lb, LbStar, prying, ...(FT1 !== undefined ? { FT1 } : {}), ...(FT2 !== undefined ? { FT2 } : {}), ...(FT12 !== undefined ? { FT12 } : {}), FT3, FTRd, mode, NtRd, anchorForce },
        shear: { FfRd, alphaBc, F1vb, F2vb, Fvb, FvRd1, FvRd2 },
        anchorage: { gammaMs, gammaMc, NRds, Ah, NRdp, cx, cy, hefUsed, narrow, N0Rkc, AcN, A0cN, psiS, psiRe, NRkc, NRdc, groupForce, k8, VRdcp, VRdcX, VRdcY, VRdc },
        weld: { betaW, fvwd, FwRd, Lw, Lv, fw1, fw2 }
    };
}
