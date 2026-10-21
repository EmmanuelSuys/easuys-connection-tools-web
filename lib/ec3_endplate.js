/**
 * Bolted end-plate joints to EN 1993-1-8:2005 (+AC:2009), used from 2026-10-19 by
 * /calculate/ec3/bolted-moment-connection and /calculate/ec3/splice-moment-connection.
 *
 * - Effective lengths: Table 6.4 (unstiffened column flange, continuous column) and Table 6.6
 *   (end plate), per bolt row individually and as part of a group of rows, circular and
 *   non-circular patterns; leff,1 = min(leff,nc; leff,cp) and leff,2 = leff,nc (Table 6.2 notes).
 * - alpha of Figure 6.11 from lambda1 = m/(m+e) and lambda2 = m2/(m+e) by the closed-form fit of
 *   the chart published in SCI P398 (2013) Appendix G, solved for alpha by bisection.
 * - T-stub resistances: Table 6.2, method 1, without backing plates, with the prying criterion
 *   Lb <= Lb* = 8.8 m^3 As nb / (sum leff,1 t^3).
 * - Effective row resistances in sequence from the row farthest from the centre of compression,
 *   6.2.7.2(6)-(9): individual rows, groups of rows, the compression side and the triangular limit.
 * - Rotational stiffness: 6.3.1, 6.3.3.1 and Table 6.11.
 * - From 2026-10-20 also used by /calculate/ec3/double-sided-web-connection: a beam_splice whose two end
 *   plates clamp the supporting web (packingThicknessMm in the bolt grip), with the route's own
 *   compression-side resistances (extraCompressionLimits) and, for channel sections, without the
 *   Figure 6.11 stiffening of the first row below the tension flange (tensionFlangeStiffensFirstRow).
 *
 * The module has no dependency on the rest of the API; input errors are thrown as EndPlateInputError.
 *
 * Connection tools copy (2026-10-20): calculation copied from the structural API at commit 5c41bd9
 * (src/ec3_endplate.ts, SHA-256 E3E5ED2073DAE40AA7AB8A8458BF463C1EC50DE444F520BF39FB4CFFE4BD0762).
 * tests/endplate_parity.test.mjs compares the routes with the API build of 5c41bd9 on every fixture.
 */
export class EndPlateInputError extends Error {
    constructor(message) {
        super(message);
        this.name = "EndPlateInputError";
    }
}
export const E_STEEL_MPA = 210000.0;
export const ALPHA_MAX = 8.0;
export const ALPHA_CHART_MIN = 4.45;
/** Bisection tolerances on alpha (dimensionless) and the iteration cap. */
const ALPHA_ABS_TOL = 1e-10;
const ALPHA_REL_TOL = 1e-12;
const ALPHA_MAX_ITERATIONS = 200;
/** Residual check on lambda1 after the bisection (dimensionless). */
const ALPHA_LAMBDA_RESIDUAL_TOL = 1e-8;
/** Yield strength [MPa] for t <= 40 mm and 40 < t <= 80 mm, EN 1993-1-1 Table 3.1. */
const FY_TABLE_3_1 = {
    S235: [235, 215],
    S275: [275, 255],
    S355: [355, 335],
    S420: [420, 390],
    S460: [460, 430],
};
/**
 * Bolt head height k, nut height m and washer thickness [mm]: the larger of ISO 4014 / ISO 4032 /
 * ISO 7089 and EN 14399-4 / EN 14399-6, so that Lb (Table 6.11) is not underestimated.
 */
const BOLT_LB_PARTS = {
    12: [8, 10.8, 3],
    16: [10, 14.8, 4],
    20: [13, 18, 4],
    22: [14, 19.4, 4],
    24: [15, 21.5, 4],
    27: [17, 23.8, 5],
    30: [19, 25.6, 5],
    33: [21, 28.7, 5],
    36: [23, 31, 6],
};
export function fyForThickness(grade, thicknessMm) {
    const row = FY_TABLE_3_1[grade];
    if (!row)
        throw new EndPlateInputError(`Unsupported steel grade '${grade}'.`);
    if (thicknessMm > 80.0)
        throw new EndPlateInputError(`Element thickness ${thicknessMm} mm exceeds 80 mm (EN 1993-1-1 Table 3.1).`);
    return thicknessMm <= 40.0 ? row[0] : row[1];
}
/** lambda1 of the Figure 6.11 curve for a given alpha at a given lambda2 (SCI P398 Appendix G). */
export function alphaCurveLambda1(alpha, lambda2) {
    if (!(alpha > 2.75))
        throw new EndPlateInputError(`alpha must exceed 2.75 (got ${alpha}).`);
    const lambda1Lim = 1.25 / (alpha - 2.75);
    const lambda2Lim = alpha * lambda1Lim / 2.0;
    if (lambda2 >= lambda2Lim)
        return lambda1Lim;
    const ratio = (lambda2Lim - lambda2) / lambda2Lim;
    return lambda1Lim + (1.0 - lambda1Lim) * ratio ** (0.185 * alpha ** 1.785);
}
/**
 * alpha of EN 1993-1-8 Figure 6.11. The curve lambda1(alpha) decreases with alpha, so the
 * bisection keeps the point between the unstiffened value 2.75 + 1.25/lambda1 (4m + 1.25e = alpha m)
 * and the chart maximum 8. Fails closed when it does not converge.
 */
export function alphaFigure611(lambda1, lambda2) {
    if (!(lambda1 > 0.0 && lambda1 < 1.0))
        throw new EndPlateInputError(`lambda1 must lie between 0 and 1 (got ${lambda1}).`);
    if (!(lambda2 >= 0.0))
        throw new EndPlateInputError(`lambda2 must not be negative (got ${lambda2}).`);
    if (alphaCurveLambda1(ALPHA_MAX, lambda2) >= lambda1) {
        return { alpha: ALPHA_MAX, lambda1, lambda2, region: "capped_at_8", iterations: 0, stopReason: "left of the alpha = 8 curve" };
    }
    let lower = 2.75 + 1.25 / lambda1;
    let upper = ALPHA_MAX;
    let iterations = 0;
    while (upper - lower > ALPHA_ABS_TOL + ALPHA_REL_TOL * upper) {
        iterations += 1;
        if (iterations > ALPHA_MAX_ITERATIONS)
            throw new Error("Figure 6.11 alpha: bisection did not converge.");
        const middle = 0.5 * (lower + upper);
        if (alphaCurveLambda1(middle, lambda2) >= lambda1)
            lower = middle;
        else
            upper = middle;
    }
    const alpha = 0.5 * (lower + upper);
    const residual = Math.abs(alphaCurveLambda1(alpha, lambda2) - lambda1);
    const unstiffened = 2.75 + 1.25 / lambda1;
    if (residual > ALPHA_LAMBDA_RESIDUAL_TOL && alpha - unstiffened > 1e-6) {
        throw new Error(`Figure 6.11 alpha: residual ${residual} on lambda1 after convergence.`);
    }
    return {
        alpha,
        lambda1,
        lambda2,
        region: alpha < ALPHA_CHART_MIN ? "below_chart" : "chart",
        iterations,
        stopReason: `bracket width <= ${ALPHA_ABS_TOL} + ${ALPHA_REL_TOL} alpha`,
    };
}
function sectionArea(s) {
    return 2.0 * s.widthMm * s.flangeThicknessMm
        + (s.heightMm - 2.0 * s.flangeThicknessMm) * s.webThicknessMm
        + (4.0 - Math.PI) * s.rootRadiusMm ** 2;
}
/** EN 1993-1-1 6.2.6(3)a, rolled I/H section, eta taken as 1.0. */
export function shearAreaRolled(s) {
    const av = sectionArea(s) - 2.0 * s.widthMm * s.flangeThicknessMm + (s.webThicknessMm + 2.0 * s.rootRadiusMm) * s.flangeThicknessMm;
    const hwTw = (s.heightMm - 2.0 * s.flangeThicknessMm) * s.webThicknessMm;
    return Math.max(av, hwTw);
}
function plasticModulusRolled(s) {
    const { heightMm: h, widthMm: b, webThicknessMm: tw, flangeThicknessMm: tf, rootRadiusMm: r } = s;
    return tw * h ** 2 / 4.0 + (b - tw) * (h - tf) * tf + (4.0 - Math.PI) / 2.0 * r ** 2 * (h - 2.0 * tf)
        + (3.0 * Math.PI - 10.0) / 3.0 * r ** 3;
}
function elasticModulusWithoutFillets(s) {
    const { heightMm: h, widthMm: b, webThicknessMm: tw, flangeThicknessMm: tf } = s;
    const inertia = (b * h ** 3 - (b - tw) * (h - 2.0 * tf) ** 3) / 12.0;
    return inertia / (h / 2.0);
}
/** Class for bending about the major axis, EN 1993-1-1 Table 5.2 (outstand flange, web in bending). */
function bendingClass(s, fy) {
    const epsilon = Math.sqrt(235.0 / fy);
    const flangeRatio = (s.widthMm - s.webThicknessMm - 2.0 * s.rootRadiusMm) / 2.0 / s.flangeThicknessMm / epsilon;
    const webRatio = (s.heightMm - 2.0 * s.flangeThicknessMm - 2.0 * s.rootRadiusMm) / s.webThicknessMm / epsilon;
    const flangeClass = flangeRatio <= 9.0 ? 1 : flangeRatio <= 10.0 ? 2 : flangeRatio <= 14.0 ? 3 : 4;
    const webClass = webRatio <= 72.0 ? 1 : webRatio <= 83.0 ? 2 : webRatio <= 124.0 ? 3 : 4;
    return Math.max(flangeClass, webClass);
}
function omega1(beffMm, twMm, avcMm2) {
    return 1.0 / Math.sqrt(1.0 + 1.3 * (beffMm * twMm / avcMm2) ** 2);
}
function locateRows(spec, yBottomFlangeOuter) {
    const beam = spec.beam;
    const yTopFlangeOuter = yBottomFlangeOuter + beam.heightMm;
    const yTopFlangeInner = yTopFlangeOuter - beam.flangeThicknessMm;
    const yCompressionFlangeInner = yBottomFlangeOuter + beam.flangeThicknessMm;
    const centreOfCompressionMm = yBottomFlangeOuter + beam.flangeThicknessMm / 2.0;
    const flangeWeldLeg = 0.8 * Math.SQRT2 * spec.flangeWeldThroatMm;
    const sorted = [...spec.rows].sort((a, b) => b.verticalPositionMm - a.verticalPositionMm);
    const rows = [];
    for (const row of sorted) {
        if (row.numberOfBolts !== 2) {
            throw new EndPlateInputError(`Bolt row ${row.rowId}: Tables 6.4 and 6.6 of EN 1993-1-8 cover two bolts per row; ${row.numberOfBolts} bolts per row are outside the scope.`);
        }
        const y = row.verticalPositionMm;
        const leverArmMm = y - centreOfCompressionMm;
        if (leverArmMm <= 0.0) {
            if (spec.joint === "beam_to_column")
                throw new EndPlateInputError(`Bolt row ${row.rowId} is not in the tension zone (at or below the centre of compression).`);
            continue;
        }
        if (y > yTopFlangeOuter) {
            const mx = y - yTopFlangeOuter - flangeWeldLeg;
            if (!(mx > 0.0))
                throw new EndPlateInputError(`Bolt row ${row.rowId} lies in the tension-flange weld (mx = ${mx.toFixed(1)} mm).`);
            const ex = spec.plate.heightMm - y;
            if (!(ex > 0.0))
                throw new EndPlateInputError(`Bolt row ${row.rowId} lies outside the end plate.`);
            rows.push({ rowId: row.rowId, yMm: y, leverArmMm, location: "outside_tension_flange", mxMm: mx, exMm: ex, m2Mm: null });
        }
        else if (y >= yTopFlangeInner) {
            throw new EndPlateInputError(`Bolt row ${row.rowId} lies within the depth of the tension flange.`);
        }
        else {
            if (!(y - yCompressionFlangeInner - flangeWeldLeg > 0.0)) {
                throw new EndPlateInputError(`Bolt row ${row.rowId} lies in the compression flange or its weld.`);
            }
            rows.push({ rowId: row.rowId, yMm: y, leverArmMm, location: "other_below_tension_flange", mxMm: null, exMm: null, m2Mm: yTopFlangeInner - y - flangeWeldLeg });
        }
    }
    if (rows.filter((row) => row.location === "outside_tension_flange").length > 1) {
        throw new EndPlateInputError("Table 6.6 covers one bolt row outside the tension flange; more than one was given.");
    }
    const firstBelow = rows.find((row) => row.location === "other_below_tension_flange");
    if (firstBelow) {
        if (!(firstBelow.m2Mm !== null && firstBelow.m2Mm > 0.0)) {
            throw new EndPlateInputError(`Bolt row ${firstBelow.rowId} lies in the tension-flange weld.`);
        }
        if (spec.tensionFlangeStiffensFirstRow !== false)
            firstBelow.location = "first_below_tension_flange";
    }
    return { rows, centreOfCompressionMm };
}
// ---------------------------------------------------------------------------------------------
// Tables 6.4 and 6.6: pattern contributions
// ---------------------------------------------------------------------------------------------
function pair(cp, cpPattern, nc, ncPattern) {
    return { cp, nc, cpPattern, ncPattern };
}
function smallest(entries) {
    let best;
    for (const entry of entries)
        if (!best || entry[1] < best[1])
            best = entry;
    if (!best)
        throw new Error("no pattern");
    return best;
}
/** Table 6.4, unstiffened column flange of a continuous column (e1 to a column end not limiting). */
const ColumnFlangeTable64 = {
    individual(m, e) {
        return pair(2.0 * Math.PI * m, "2 pi m", 4.0 * m + 1.25 * e, "4m + 1.25e");
    },
    groupEnd(m, e, p) {
        return pair(Math.PI * m + p, "pi m + p", 2.0 * m + 0.625 * e + 0.5 * p, "2m + 0.625e + 0.5p");
    },
    groupInner(pAbove, pBelow) {
        const p = 0.5 * (pAbove + pBelow);
        return pair(2.0 * p, "2p", p, "p");
    },
};
/** Table 6.6, end plate. */
const EndPlateTable66 = {
    outsideTensionFlange(mx, ex, e, w, bp) {
        const cp = smallest([["2 pi mx", 2.0 * Math.PI * mx], ["pi mx + w", Math.PI * mx + w], ["pi mx + 2e", Math.PI * mx + 2.0 * e]]);
        const nc = smallest([
            ["4mx + 1.25ex", 4.0 * mx + 1.25 * ex],
            ["e + 2mx + 0.625ex", e + 2.0 * mx + 0.625 * ex],
            ["0.5bp", 0.5 * bp],
            ["0.5w + 2mx + 0.625ex", 0.5 * w + 2.0 * mx + 0.625 * ex],
        ]);
        return pair(cp[1], cp[0], nc[1], nc[0]);
    },
    firstBelowIndividual(m, alpha) {
        return pair(2.0 * Math.PI * m, "2 pi m", alpha * m, "alpha m");
    },
    firstBelowGroupEnd(m, e, alpha, p) {
        return pair(Math.PI * m + p, "pi m + p", 0.5 * p + alpha * m - (2.0 * m + 0.625 * e), "0.5p + alpha m - (2m + 0.625e)");
    },
    otherIndividual(m, e) {
        return pair(2.0 * Math.PI * m, "2 pi m", 4.0 * m + 1.25 * e, "4m + 1.25e");
    },
    otherGroupEnd(m, e, p) {
        return pair(Math.PI * m + p, "pi m + p", 2.0 * m + 0.625 * e + 0.5 * p, "2m + 0.625e + 0.5p");
    },
    otherGroupInner(pAbove, pBelow) {
        const p = 0.5 * (pAbove + pBelow);
        return pair(2.0 * p, "2p", p, "p");
    },
};
/** T-stub flange resistance, EN 1993-1-8 Table 6.2 (method 1, no backing plates). */
export function tStubResistance(args) {
    const { rows, leff1Mm, leff2Mm, mMm, nMm, thicknessMm, fyMpa, gammaM0 } = args;
    const sumFtRd = 2.0 * rows * args.boltTensionRdN;
    const mpl1RdNmm = 0.25 * leff1Mm * thicknessMm ** 2 * fyMpa / gammaM0;
    const mpl2RdNmm = 0.25 * leff2Mm * thicknessMm ** 2 * fyMpa / gammaM0;
    const lbStarMm = 8.8 * mMm ** 3 * args.tensileAreaMm2 * rows / (leff1Mm * thicknessMm ** 3);
    const prying = args.pryingAllowed && args.lbMm <= lbStarMm;
    if (prying) {
        const ft1 = 4.0 * mpl1RdNmm / mMm;
        const ft2 = (2.0 * mpl2RdNmm + nMm * sumFtRd) / (mMm + nMm);
        const ftRdN = Math.min(ft1, ft2, sumFtRd);
        const mode = ftRdN === ft1 ? "1" : ftRdN === ft2 ? "2" : "3";
        return { rows, leff1Mm, leff2Mm, mMm, nMm, thicknessMm, fyMpa, mpl1RdNmm, mpl2RdNmm, lbMm: args.lbMm, lbStarMm, prying, ft1RdN: ft1, ft2RdN: ft2, ft12RdN: null, ft3RdN: sumFtRd, mode, ftRdN };
    }
    const ft12 = 2.0 * mpl1RdNmm / mMm;
    const ftRdN = Math.min(ft12, sumFtRd);
    return { rows, leff1Mm, leff2Mm, mMm, nMm, thicknessMm, fyMpa, mpl1RdNmm, mpl2RdNmm, lbMm: args.lbMm, lbStarMm, prying, ft1RdN: null, ft2RdN: null, ft12RdN: ft12, ft3RdN: sumFtRd, mode: ftRdN === ft12 ? "1-2" : "3", ftRdN };
}
export function analyseEndPlateJoint(spec) {
    const { beam, plate } = spec;
    const column = spec.joint === "beam_to_column" ? spec.column : null;
    if (spec.joint === "beam_to_column" && !column)
        throw new EndPlateInputError("A column section is required.");
    if (plate.heightMm < beam.heightMm)
        throw new EndPlateInputError("End-plate height must be at least the beam height.");
    const yBottomFlangeOuter = (plate.heightMm - beam.heightMm) / 2.0;
    const { rows: geometry, centreOfCompressionMm } = locateRows(spec, yBottomFlangeOuter);
    const n = geometry.length;
    const at = (array, index) => {
        const value = array[index];
        if (value === undefined)
            throw new Error(`index ${index} out of range`);
        return value;
    };
    const pitch = (upper) => at(geometry, upper).yMm - at(geometry, upper + 1).yMm;
    const fyBeam = fyForThickness(beam.steelGrade, beam.flangeThicknessMm);
    const fyPlate = fyForThickness(plate.steelGrade, plate.thicknessMm);
    const w = spec.gaugeMm;
    const ep = Math.min(spec.plateEdgeDistanceMm, (plate.widthMm - w) / 2.0);
    const mp = (w - beam.webThicknessMm) / 2.0 - 0.8 * Math.SQRT2 * spec.webWeldThroatMm;
    if (!(mp > 0.0))
        throw new EndPlateInputError(`End plate: m = ${mp.toFixed(1)} mm is not positive (gauge too small for the beam web and its weld).`);
    if (!(ep > 0.0))
        throw new EndPlateInputError("End plate: the edge distance e is not positive.");
    let mc = Number.NaN;
    let ec = Number.NaN;
    let fyColumn = Number.NaN;
    let avc = Number.NaN;
    if (column) {
        fyColumn = fyForThickness(column.steelGrade, column.flangeThicknessMm);
        mc = (w - column.webThicknessMm) / 2.0 - 0.8 * column.rootRadiusMm;
        ec = (column.widthMm - w) / 2.0;
        if (!(mc > 0.0))
            throw new EndPlateInputError(`Column flange: m = ${mc.toFixed(1)} mm is not positive (gauge too small for the column web and root radius).`);
        if (!(ec > 0.0))
            throw new EndPlateInputError("Column flange: the gauge exceeds the column flange width.");
        avc = shearAreaRolled(column);
        const dc = column.heightMm - 2.0 * (column.flangeThicknessMm + column.rootRadiusMm);
        if (dc / column.webThicknessMm > 69.0 * Math.sqrt(235.0 / fyColumn)) {
            throw new EndPlateInputError("Column web slenderness dc/tw exceeds 69 epsilon (EN 1993-1-8 6.2.6.1(1)); outside the scope.");
        }
    }
    const eMin = column ? Math.min(ec, ep) : ep;
    const nc = column ? Math.min(eMin, 1.25 * mc) : Number.NaN;
    const np = Math.min(eMin, 1.25 * mp);
    const lbParts = BOLT_LB_PARTS[spec.bolt.diameterMm];
    if (!lbParts)
        throw new EndPlateInputError(`Unsupported bolt diameter M${spec.bolt.diameterMm}.`);
    const [headHeight, nutHeight, washer] = lbParts;
    const packingMm = spec.packingThicknessMm ?? 0.0;
    if (!(Number.isFinite(packingMm) && packingMm >= 0.0))
        throw new EndPlateInputError("The packing thickness in the bolt grip must be finite and not negative.");
    const grip = (column ? column.flangeThicknessMm + plate.thicknessMm : 2.0 * plate.thicknessMm) + packingMm;
    const lbMm = grip + 2.0 * washer + 0.5 * (headHeight + nutHeight);
    const boltTensionRdN = 0.9 * spec.bolt.fubMpa * spec.bolt.tensileAreaMm2 / spec.gammaM2;
    const firstBelowIndex = geometry.findIndex((row) => row.location === "first_below_tension_flange");
    let alpha = null;
    if (firstBelowIndex >= 0) {
        const m2 = at(geometry, firstBelowIndex).m2Mm ?? Number.NaN;
        alpha = alphaFigure611(mp / (mp + ep), m2 / (mp + ep));
    }
    const alphaValue = alpha ? alpha.alpha : Number.NaN;
    // Pattern contribution of row r when rows first..last act together (first === last: individual).
    const columnContribution = (first, last, r) => {
        if (first === last)
            return ColumnFlangeTable64.individual(mc, ec);
        if (r === first)
            return ColumnFlangeTable64.groupEnd(mc, ec, pitch(r));
        if (r === last)
            return ColumnFlangeTable64.groupEnd(mc, ec, pitch(r - 1));
        return ColumnFlangeTable64.groupInner(pitch(r - 1), pitch(r));
    };
    const plateContribution = (first, last, r) => {
        const row = at(geometry, r);
        if (row.location === "outside_tension_flange") {
            if (first !== last)
                throw new Error("the row outside the tension flange cannot be part of a group");
            return EndPlateTable66.outsideTensionFlange(row.mxMm ?? Number.NaN, row.exMm ?? Number.NaN, ep, w, plate.widthMm);
        }
        if (row.location === "first_below_tension_flange") {
            if (first === last)
                return EndPlateTable66.firstBelowIndividual(mp, alphaValue);
            if (r !== first)
                throw new Error("the first row below the tension flange must head its group");
            return EndPlateTable66.firstBelowGroupEnd(mp, ep, alphaValue, pitch(r));
        }
        if (first === last)
            return EndPlateTable66.otherIndividual(mp, ep);
        if (r === first)
            return EndPlateTable66.otherGroupEnd(mp, ep, pitch(r));
        if (r === last)
            return EndPlateTable66.otherGroupEnd(mp, ep, pitch(r - 1));
        return EndPlateTable66.otherGroupInner(pitch(r - 1), pitch(r));
    };
    const plateGroupAllowed = (first, last) => {
        for (let r = first; r <= last; r += 1)
            if (at(geometry, r).location === "outside_tension_flange")
                return false;
        return true;
    };
    const sumPatterns = (contribution, first, last) => {
        let cp = 0.0;
        let ncSum = 0.0;
        for (let r = first; r <= last; r += 1) {
            const c = contribution(first, last, r);
            cp += c.cp;
            ncSum += c.nc;
        }
        return { cp, nc: ncSum, leff1: Math.min(cp, ncSum), leff2: ncSum };
    };
    const columnTStub = (leff1, leff2, rowsInGroup) => tStubResistance({
        rows: rowsInGroup, leff1Mm: leff1, leff2Mm: leff2, mMm: mc, nMm: nc, thicknessMm: column?.flangeThicknessMm ?? Number.NaN,
        fyMpa: fyColumn, gammaM0: spec.gammaM0, boltTensionRdN, tensileAreaMm2: spec.bolt.tensileAreaMm2, lbMm, pryingAllowed: spec.pryingAllowed,
    });
    const plateTStub = (leff1, leff2, rowsInGroup, headRow) => {
        const outside = headRow.location === "outside_tension_flange";
        const m = outside ? headRow.mxMm ?? Number.NaN : mp;
        const nValue = outside ? Math.min(headRow.exMm ?? Number.NaN, 1.25 * m) : np;
        return tStubResistance({
            rows: rowsInGroup, leff1Mm: leff1, leff2Mm: leff2, mMm: m, nMm: nValue, thicknessMm: plate.thicknessMm,
            fyMpa: fyPlate, gammaM0: spec.gammaM0, boltTensionRdN, tensileAreaMm2: spec.bolt.tensileAreaMm2, lbMm, pryingAllowed: spec.pryingAllowed,
        });
    };
    const columnWebTension = (beff) => {
        if (!column)
            return Number.NaN;
        return omega1(beff, column.webThicknessMm, avc) * beff * column.webThicknessMm * fyColumn / spec.gammaM0;
    };
    const beamWebTension = (beff) => beff * beam.webThicknessMm * fyBeam / spec.gammaM0;
    // Individual rows.
    const columnSides = [];
    const plateSides = [];
    for (let r = 0; r < n; r += 1) {
        const row = at(geometry, r);
        if (column) {
            const patterns = columnContribution(r, r, r);
            const leff1 = Math.min(patterns.cp, patterns.nc);
            columnSides.push({ mMm: mc, eMm: ec, nMm: nc, patterns, leff1Mm: leff1, leff2Mm: patterns.nc, tstub: columnTStub(leff1, patterns.nc, 1) });
        }
        else {
            columnSides.push(null);
        }
        const patterns = plateContribution(r, r, r);
        const leff1 = Math.min(patterns.cp, patterns.nc);
        const tstub = plateTStub(leff1, patterns.nc, 1, row);
        plateSides.push({ mMm: tstub.mMm, eMm: row.location === "outside_tension_flange" ? row.exMm ?? Number.NaN : ep, nMm: tstub.nMm, patterns, leff1Mm: leff1, leff2Mm: patterns.nc, tstub });
    }
    const groups = [];
    const groupCache = new Map();
    const cached = (key, make) => {
        if (!groupCache.has(key)) {
            const value = make();
            groupCache.set(key, value);
            if (value)
                groups.push(value);
        }
        return groupCache.get(key) ?? null;
    };
    const rowIds = (first, last) => geometry.slice(first, last + 1).map((row) => row.rowId);
    const components = [];
    if (column) {
        components.push({
            name: "column flange in bending",
            appliesTo: () => true,
            individual: (r) => at(columnSides, r)?.tstub.ftRdN ?? Number.NaN,
            group: (first, last) => cached(`cf:${first}:${last}`, () => {
                const sums = sumPatterns(columnContribution, first, last);
                const tstub = columnTStub(sums.leff1, sums.leff2, last - first + 1);
                return { component: "column flange in bending", rowIds: rowIds(first, last), leffCpMm: sums.cp, leffNcMm: sums.nc, leff1Mm: sums.leff1, leff2Mm: sums.leff2, ftRdN: tstub.ftRdN, tstub };
            }),
        });
        components.push({
            name: "column web in tension",
            appliesTo: () => true,
            individual: (r) => columnWebTension(at(columnSides, r)?.leff1Mm ?? Number.NaN),
            group: (first, last) => cached(`cw:${first}:${last}`, () => {
                const sums = sumPatterns(columnContribution, first, last);
                return { component: "column web in tension", rowIds: rowIds(first, last), leffCpMm: sums.cp, leffNcMm: sums.nc, leff1Mm: sums.leff1, leff2Mm: sums.leff2, ftRdN: columnWebTension(sums.leff1), tstub: null };
            }),
        });
    }
    components.push({
        name: "end plate in bending",
        appliesTo: () => true,
        individual: (r) => at(plateSides, r).tstub.ftRdN,
        group: (first, last) => cached(`ep:${first}:${last}`, () => {
            if (!plateGroupAllowed(first, last))
                return null;
            const sums = sumPatterns(plateContribution, first, last);
            const tstub = plateTStub(sums.leff1, sums.leff2, last - first + 1, at(geometry, first));
            return { component: "end plate in bending", rowIds: rowIds(first, last), leffCpMm: sums.cp, leffNcMm: sums.nc, leff1Mm: sums.leff1, leff2Mm: sums.leff2, ftRdN: tstub.ftRdN, tstub };
        }),
    });
    components.push({
        name: "beam web in tension",
        appliesTo: (r) => at(geometry, r).location !== "outside_tension_flange",
        individual: (r) => beamWebTension(at(plateSides, r).leff1Mm),
        group: (first, last) => cached(`bw:${first}:${last}`, () => {
            if (!plateGroupAllowed(first, last))
                return null;
            const sums = sumPatterns(plateContribution, first, last);
            return { component: "beam web in tension", rowIds: rowIds(first, last), leffCpMm: sums.cp, leffNcMm: sums.nc, leff1Mm: sums.leff1, leff2Mm: sums.leff2, ftRdN: beamWebTension(sums.leff1), tstub: null };
        }),
    });
    // Compression side, 6.2.6.1, 6.2.6.2 and 6.2.6.7.
    const beamClass = bendingClass(beam, fyBeam);
    if (beamClass === 4)
        throw new EndPlateInputError("Class 4 beam sections are outside the scope (EN 1993-1-8 6.2.6.7).");
    const mcRdNmm = (beamClass <= 2 ? plasticModulusRolled(beam) : elasticModulusWithoutFillets(beam)) * fyBeam / spec.gammaM0;
    const fcFbRdN = mcRdNmm / (beam.heightMm - beam.flangeThicknessMm);
    let vwpRdN = null;
    let fcWcRdN = null;
    let beffCWcMm = null;
    let dc = Number.NaN;
    const limits = [["beam flange and web in compression", fcFbRdN]];
    for (const [name, value] of spec.extraCompressionLimits ?? []) {
        if (!(Number.isFinite(value) && value > 0.0))
            throw new EndPlateInputError(`Compression-side resistance '${name}' must be finite and positive.`);
        limits.push([name, value]);
    }
    if (column) {
        vwpRdN = 0.9 * fyColumn * avc / (Math.sqrt(3.0) * spec.gammaM0);
        const projectionBelow = yBottomFlangeOuter;
        const sp = plate.thicknessMm + Math.min(plate.thicknessMm, Math.max(0.0, projectionBelow - Math.SQRT2 * spec.flangeWeldThroatMm));
        beffCWcMm = beam.flangeThicknessMm + 2.0 * Math.SQRT2 * spec.flangeWeldThroatMm + 5.0 * (column.flangeThicknessMm + column.rootRadiusMm) + sp;
        dc = column.heightMm - 2.0 * (column.flangeThicknessMm + column.rootRadiusMm);
        const omega = omega1(beffCWcMm, column.webThicknessMm, avc);
        const lambdaP = 0.932 * Math.sqrt(beffCWcMm * dc * fyColumn / (E_STEEL_MPA * column.webThicknessMm ** 2));
        const rho = lambdaP <= 0.72 ? 1.0 : (lambdaP - 0.2) / lambdaP ** 2;
        const crushing = omega * beffCWcMm * column.webThicknessMm * fyColumn / spec.gammaM0;
        const buckling = omega * rho * beffCWcMm * column.webThicknessMm * fyColumn / spec.gammaM1;
        fcWcRdN = Math.min(crushing, buckling);
        limits.unshift(["column web in compression", fcWcRdN]);
        limits.unshift(["column web panel in shear (Vwp,Rd / beta, beta = 1)", vwpRdN]);
    }
    const limit = smallest(limits);
    // 6.2.7.2(6)-(9): effective row resistances, from the row farthest from the centre of compression.
    const runSequence = (applyCompressionLimit) => {
        const ftr = [];
        const reasons = [];
        const individual = [];
        const individualReason = [];
        let triangular = false;
        for (let r = 0; r < n; r += 1) {
            let value = Number.POSITIVE_INFINITY;
            let reason = "";
            for (const component of components) {
                if (!component.appliesTo(r))
                    continue;
                const candidate = component.individual(r);
                if (candidate < value) {
                    value = candidate;
                    reason = `${component.name} (row alone)`;
                }
            }
            individual.push(value);
            individualReason.push(reason);
            for (const component of components) {
                if (!component.group)
                    continue;
                for (let first = r - 1; first >= 0; first -= 1) {
                    if (!component.appliesTo(first) || !component.appliesTo(r))
                        continue;
                    const group = component.group(first, r);
                    if (!group)
                        continue;
                    let above = 0.0;
                    for (let i = first; i < r; i += 1)
                        above += at(ftr, i);
                    const candidate = group.ftRdN - above;
                    if (candidate < value) {
                        value = candidate;
                        reason = `${component.name} (rows ${group.rowIds.join("-")} as a group)`;
                    }
                }
            }
            for (let x = 0; x < r; x += 1) {
                const previous = at(ftr, x);
                if (previous > 1.9 * boltTensionRdN) {
                    const candidate = previous * at(geometry, r).leverArmMm / at(geometry, x).leverArmMm;
                    if (candidate < value) {
                        value = candidate;
                        reason = `triangular limit from row ${at(geometry, x).rowId} (6.2.7.2(9))`;
                        triangular = true;
                    }
                }
            }
            if (applyCompressionLimit) {
                let above = 0.0;
                for (let i = 0; i < r; i += 1)
                    above += at(ftr, i);
                const candidate = limit[1] - above;
                if (candidate < value) {
                    value = candidate;
                    reason = `${limit[0]} (6.2.7.2(7))`;
                }
            }
            if (value < 0.0)
                value = 0.0;
            ftr.push(value);
            reasons.push(reason);
        }
        return { ftr, reasons, individual, individualReason, triangular };
    };
    const uncapped = runSequence(false);
    const sequence = runSequence(true);
    const sumFtrUncappedN = uncapped.ftr.reduce((sum, value) => sum + value, 0.0);
    const sumFtrN = sequence.ftr.reduce((sum, value) => sum + value, 0.0);
    const rowsLimited = sequence.reasons.some((reason) => reason.endsWith("(6.2.7.2(7))"));
    const mjRdNmm = sequence.ftr.reduce((sum, value, r) => sum + value * at(geometry, r).leverArmMm, 0.0);
    // Stiffness, Table 6.11 and 6.3.3.1: leff = smallest of the row's patterns, alone or in any group.
    const smallestContribution = (contribution, r, allowed) => {
        let best = Number.POSITIVE_INFINITY;
        for (let first = 0; first <= r; first += 1) {
            for (let last = r; last < n; last += 1) {
                if (first !== last && !allowed(first, last))
                    continue;
                const c = contribution(first, last, r);
                best = Math.min(best, c.cp, c.nc);
            }
        }
        return best;
    };
    const k10 = 1.6 * spec.bolt.tensileAreaMm2 / lbMm;
    const rowStiffness = geometry.map((row, r) => {
        const leffEp = smallestContribution(plateContribution, r, plateGroupAllowed);
        const mForK5 = row.location === "outside_tension_flange" ? row.mxMm ?? Number.NaN : mp;
        const k5 = 0.9 * leffEp * plate.thicknessMm ** 3 / mForK5 ** 3;
        if (column) {
            const leffCf = smallestContribution(columnContribution, r, () => true);
            const k3 = 0.7 * leffCf * column.webThicknessMm / dc;
            const k4 = 0.9 * leffCf * column.flangeThicknessMm ** 3 / mc ** 3;
            return { leffColumnFlangeMm: leffCf, leffEndPlateMm: leffEp, k3Mm: k3, k4Mm: k4, k5Mm: k5, k10Mm: k10, keffMm: 1.0 / (1.0 / k3 + 1.0 / k4 + 1.0 / k5 + 1.0 / k10) };
        }
        return { leffColumnFlangeMm: null, leffEndPlateMm: leffEp, k3Mm: null, k4Mm: null, k5Mm: k5, k10Mm: k10, keffMm: 1.0 / (2.0 / k5 + 1.0 / k10) };
    });
    let sumKh = 0.0;
    let sumKh2 = 0.0;
    rowStiffness.forEach((k, r) => {
        const h = at(geometry, r).leverArmMm;
        sumKh += k.keffMm * h;
        sumKh2 += k.keffMm * h ** 2;
    });
    const zEqMm = sumKh > 0.0 ? sumKh2 / sumKh : 0.0;
    const keqMm = zEqMm > 0.0 ? sumKh / zEqMm : 0.0;
    let k1Mm = null;
    let k2Mm = null;
    let sjIniNmmPerRad = 0.0;
    if (column && beffCWcMm !== null) {
        k1Mm = spec.doubleSided || zEqMm <= 0.0 ? null : 0.38 * avc / (1.0 * zEqMm);
        k2Mm = 0.7 * beffCWcMm * column.webThicknessMm / dc;
        sjIniNmmPerRad = keqMm > 0.0 ? E_STEEL_MPA * zEqMm ** 2 / ((k1Mm === null ? 0.0 : 1.0 / k1Mm) + 1.0 / k2Mm + 1.0 / keqMm) : 0.0;
    }
    else {
        sjIniNmmPerRad = E_STEEL_MPA * zEqMm ** 2 * keqMm;
    }
    const rows = geometry.map((row, r) => {
        const cf = at(columnSides, r);
        return {
            rowId: row.rowId,
            yMm: row.yMm,
            leverArmMm: row.leverArmMm,
            location: row.location,
            mxMm: row.mxMm,
            exMm: row.exMm,
            m2Mm: row.m2Mm,
            columnFlange: cf,
            endPlate: at(plateSides, r),
            ftWcRdN: cf ? columnWebTension(cf.leff1Mm) : null,
            ftWbRdN: row.location === "outside_tension_flange" ? null : beamWebTension(at(plateSides, r).leff1Mm),
            boltRowRdN: 2.0 * boltTensionRdN,
            ftIndividualRdN: at(sequence.individual, r),
            individualGoverning: at(sequence.individualReason, r),
            ftrRdN: at(sequence.ftr, r),
            ftrLimitedBy: at(sequence.reasons, r),
            stiffness: at(rowStiffness, r),
        };
    });
    // Make sure every group of two or more consecutive rows is listed, even if not reached above.
    for (const component of components) {
        if (!component.group)
            continue;
        for (let first = 0; first < n; first += 1) {
            for (let last = first + 1; last < n; last += 1) {
                if (component.appliesTo(first) && component.appliesTo(last))
                    component.group(first, last);
            }
        }
    }
    const boltFailureGoverns = rows.some((row) => row.ftrRdN > 0.0 && ((row.endPlate.tstub.mode === "3" && row.ftIndividualRdN === row.endPlate.tstub.ftRdN)
        || (row.columnFlange !== null && row.columnFlange.tstub.mode === "3" && row.ftIndividualRdN === row.columnFlange.tstub.ftRdN)));
    return {
        joint: spec.joint,
        centreOfCompressionMm,
        columnFlange: column ? { mMm: mc, eMm: ec, nMm: nc, fyMpa: fyColumn } : null,
        endPlate: { mMm: mp, eMm: ep, nMm: np, fyMpa: fyPlate },
        boltTensionRdN,
        lbMm,
        alpha,
        rows,
        groups,
        compression: {
            vwpRdN,
            fcWcRdN,
            beffCWcMm,
            fcFbRdN,
            beamSectionClass: beamClass,
            limitN: limit[1],
            limitComponent: limit[0],
            rowsLimited,
        },
        avcMm2: column ? avc : null,
        sumFtrUncappedN,
        sumFtrN,
        triangularLimitApplied: sequence.triangular,
        boltFailureGoverns,
        mjRdNmm,
        stiffness: { zEqMm, keqMm, k1Mm, k2Mm, sjIniNmmPerRad },
    };
}
