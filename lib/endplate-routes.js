/**
 * The three end-plate routes of the structural API, ported to the connection tools so that they run in
 * the browser: /calculate/ec3/bolted-moment-connection, /calculate/ec3/splice-moment-connection and
 * /calculate/ec3/double-sided-web-connection.
 *
 * Source: structural API at commit 5c41bd9 (src/calculators.ts, formula version
 * ea-suys-structural-formulas-2026-10-20.5). The input parsing, scope rejections, error messages,
 * calculations and the result record are kept as in the API; only the response wrapper is local.
 * tests/endplate_parity.test.mjs compares every field of the result with the API build on all API
 * fixtures of the three routes and the rejection messages on a set of invalid inputs.
 *
 * Input: the API JSON (snake_case, forces in kN, moments in kNm, lengths in mm, stresses in MPa).
 */
import { EndPlateInputError, analyseEndPlateJoint, fyForThickness, shearAreaRolled, } from "./ec3_endplate.js";
export const ENDPLATE_API_COMMIT = "5c41bd9";
export const ENDPLATE_API_FORMULA_VERSION = "ea-suys-structural-formulas-2026-10-20.5";
/** An input outside the scope of a route (the API answers 400 with the same message). */
export class EndPlateRouteError extends Error {
    status;
    constructor(message, status = 400) {
        super(message);
        this.name = "EndPlateRouteError";
        this.status = status;
    }
}
const CalculationError = EndPlateRouteError;
const TOL = 1e-9;
const COMMON_ASSUMPTIONS = [
    "Indicative calculation aid, not a design note.",
    "Input values are user-provided and not verified by EA Suys.",
    "Belgian National Annex choices and project-specific applicability remain to be checked by the engineer.",
];
/** EN 1993-1-8 Table 3.1. */
export const EC3_BOLT_CLASSES = {
    "4.6": { fyb_mpa: 240, fub_mpa: 400 },
    "4.8": { fyb_mpa: 320, fub_mpa: 400 },
    "5.6": { fyb_mpa: 300, fub_mpa: 500 },
    "5.8": { fyb_mpa: 400, fub_mpa: 500 },
    "6.8": { fyb_mpa: 480, fub_mpa: 600 },
    "8.8": { fyb_mpa: 640, fub_mpa: 800 },
    "10.9": { fyb_mpa: 900, fub_mpa: 1000 },
};
/** Recommended partial factors (EN 1993-1-8 Table 2.1 note / EN 1993-1-1 6.1 note 2B). */
export const EC3_GAMMA_M0 = 1.0;
export const EC3_GAMMA_M1 = 1.0;
export const EC3_GAMMA_M2 = 1.25;
export const EC3_MOMENT_STEEL_GRADES = {
    S235: { fy_mpa: 235, fu_mpa: 360, e_mpa: 210000 },
    S275: { fy_mpa: 275, fu_mpa: 430, e_mpa: 210000 },
    S355: { fy_mpa: 355, fu_mpa: 490, e_mpa: 210000 },
    S420: { fy_mpa: 420, fu_mpa: 520, e_mpa: 210000 },
    S460: { fy_mpa: 460, fu_mpa: 550, e_mpa: 210000 },
};
/** Tensile stress areas As [mm2] of the moment routes. */
export const EC3_MOMENT_BOLT_AREAS = {
    12: 84.3,
    16: 157.0,
    20: 245.0,
    22: 303.0,
    24: 353.0,
    27: 459.0,
    30: 561.0,
    33: 694.0,
    36: 817.0,
};
function response(calculatorId, input, result, options = {}) {
    return {
        calculator_id: calculatorId,
        formula_version: ENDPLATE_API_FORMULA_VERSION,
        input,
        result,
        assumptions: options.assumptions || COMMON_ASSUMPTIONS,
        source_refs: options.source_refs || [],
        status: result.check_passed === false ? "review" : "ok",
    };
}
// ---------------------------------------------------------------------------------------------
// Input helpers (as in the API)
// ---------------------------------------------------------------------------------------------
function isJsonObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function requiredObject(raw, key) {
    const value = raw?.[key];
    if (!isJsonObject(value)) {
        throw new CalculationError(`Input must include object '${key}'.`);
    }
    return value;
}
function arrayValue(raw, key) {
    const value = raw?.[key];
    if (!Array.isArray(value))
        throw new CalculationError(`Input must include array '${key}'.`);
    return value;
}
function ensureObject(value, label) {
    if (!isJsonObject(value)) {
        throw new CalculationError(`${label} must be an object.`);
    }
    return value;
}
function booleanValue(raw, key, fallback) {
    if (raw?.[key] === undefined)
        return fallback;
    if (typeof raw[key] !== "boolean")
        throw new CalculationError(`${key} must be a boolean.`);
    return raw[key];
}
function stringValue(raw, key, fallback) {
    if (raw?.[key] === undefined) {
        if (fallback !== undefined)
            return fallback;
        throw new CalculationError(`Missing required string '${key}'.`);
    }
    const value = String(raw[key]).trim();
    if (!value)
        throw new CalculationError(`${key} cannot be empty.`);
    return value;
}
function numberValue(raw, key, fallback) {
    if (raw?.[key] === undefined) {
        if (fallback !== undefined)
            return fallback;
        throw new CalculationError(`Missing required number '${key}'.`);
    }
    const value = Number(raw[key]);
    if (!Number.isFinite(value))
        throw new CalculationError(`${key} must be a finite number.`);
    return value;
}
function positiveNumber(raw, key, fallback) {
    const value = numberValue(raw, key, fallback);
    if (!(value > 0.0))
        throw new CalculationError(`${key} must be positive.`);
    return value;
}
function nonNegativeNumber(raw, key, fallback) {
    const value = numberValue(raw, key, fallback);
    if (value < 0.0)
        throw new CalculationError(`${key} must be non-negative.`);
    return value;
}
function positiveInteger(raw, key, fallback) {
    const value = positiveNumber(raw, key, fallback);
    if (!Number.isInteger(value))
        throw new CalculationError(`${key} must be an integer.`);
    return value;
}
function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
/** Runs the EN 1993-1-8 end-plate analysis and reports its input errors as route errors (400). */
function endPlateJoint(spec) {
    try {
        return analyseEndPlateJoint(spec);
    }
    catch (error) {
        if (error instanceof EndPlateInputError)
            throw new CalculationError(error.message);
        throw error;
    }
}
function endPlateSection(section) {
    return {
        heightMm: section.heightMm,
        widthMm: section.widthMm,
        webThicknessMm: section.webThicknessMm,
        flangeThicknessMm: section.flangeThicknessMm,
        rootRadiusMm: section.rootRadiusMm,
        steelGrade: section.steelGrade,
    };
}
/** Method-related warning codes shared by the moment and splice routes. */
function endPlateMethodWarnings(joint, beam, shearKn, gammaM0) {
    const warnings = [];
    if (joint.triangularLimitApplied)
        warnings.push("TRIANGULAR_LIMIT_APPLIED");
    if (joint.boltFailureGoverns)
        warnings.push("BOLT_FAILURE_GOVERNS");
    if (joint.alpha && joint.alpha.region === "below_chart")
        warnings.push("ALPHA_BELOW_4_45");
    const fyBeam = fyForThickness(beam.steelGrade, beam.flangeThicknessMm);
    const vplRdKn = shearAreaRolled(endPlateSection(beam)) * fyBeam / (Math.sqrt(3.0) * gammaM0) / 1e3;
    if (Math.abs(shearKn) > 0.5 * vplRdKn)
        warnings.push("BEAM_SHEAR_ABOVE_HALF_VPL");
    return warnings;
}
function kn(valueN) {
    return valueN === null ? null : round(valueN / 1e3, 6);
}
function mm(value) {
    return value === null ? null : round(value, 6);
}
function serializeEndPlateTStub(tstub) {
    return {
        bolt_rows: tstub.rows,
        leff_1_mm: round(tstub.leff1Mm, 6),
        leff_2_mm: round(tstub.leff2Mm, 6),
        m_mm: round(tstub.mMm, 6),
        n_mm: round(tstub.nMm, 6),
        thickness_mm: tstub.thicknessMm,
        fy_mpa: tstub.fyMpa,
        mpl_1_rd_nmm: round(tstub.mpl1RdNmm, 6),
        mpl_2_rd_nmm: round(tstub.mpl2RdNmm, 6),
        lb_mm: round(tstub.lbMm, 6),
        lb_star_mm: round(tstub.lbStarMm, 6),
        prying: tstub.prying,
        ft_1_rd_kn: kn(tstub.ft1RdN),
        ft_2_rd_kn: kn(tstub.ft2RdN),
        ft_12_rd_kn: kn(tstub.ft12RdN),
        ft_3_rd_kn: kn(tstub.ft3RdN),
        governing_mode: tstub.mode,
        ft_rd_kn: kn(tstub.ftRdN),
    };
}
function serializeFlangeSide(side) {
    return {
        m_mm: round(side.mMm, 6),
        e_mm: round(side.eMm, 6),
        n_mm: round(side.nMm, 6),
        leff_cp_mm: round(side.patterns.cp, 6),
        leff_cp_pattern: side.patterns.cpPattern,
        leff_nc_mm: round(side.patterns.nc, 6),
        leff_nc_pattern: side.patterns.ncPattern,
        leff_1_mm: round(side.leff1Mm, 6),
        leff_2_mm: round(side.leff2Mm, 6),
        tstub: serializeEndPlateTStub(side.tstub),
    };
}
function serializeEndPlateResistance(joint) {
    return {
        method: "EN 1993-1-8 6.2.7.2: rows in sequence from the top, individually and in groups (Tables 6.4/6.6), compression side and triangular limit",
        bolt_tension_rd_per_bolt_kn: kn(joint.boltTensionRdN),
        lb_mm: round(joint.lbMm, 6),
        column_flange: joint.columnFlange
            ? { m_mm: round(joint.columnFlange.mMm, 6), e_mm: round(joint.columnFlange.eMm, 6), n_mm: round(joint.columnFlange.nMm, 6), fy_mpa: joint.columnFlange.fyMpa }
            : null,
        end_plate: { m_mm: round(joint.endPlate.mMm, 6), e_mm: round(joint.endPlate.eMm, 6), n_mm: round(joint.endPlate.nMm, 6), fy_mpa: joint.endPlate.fyMpa },
        alpha: joint.alpha
            ? {
                lambda_1: round(joint.alpha.lambda1, 6),
                lambda_2: round(joint.alpha.lambda2, 6),
                alpha: round(joint.alpha.alpha, 6),
                region: joint.alpha.region,
                method: "Figure 6.11 by the closed-form fit of SCI P398 Appendix G (within about 2 % of chart readings), bisection on alpha",
                iterations: joint.alpha.iterations,
            }
            : null,
        avc_mm2: mm(joint.avcMm2),
        vwp_rd_kn: kn(joint.compression.vwpRdN),
        fc_wc_rd_kn: kn(joint.compression.fcWcRdN),
        beff_c_wc_mm: mm(joint.compression.beffCWcMm),
        fc_fb_rd_kn: kn(joint.compression.fcFbRdN),
        beam_section_class: joint.compression.beamSectionClass,
        compression_limit_kn: kn(joint.compression.limitN),
        compression_limit_component: joint.compression.limitComponent,
        sum_ftr_rd_kn: kn(joint.sumFtrN),
        sum_ftr_rd_without_compression_limit_kn: kn(joint.sumFtrUncappedN),
        mj_rd_knm: round(joint.mjRdNmm / 1e6, 6),
        per_row: joint.rows.map((row) => ({
            row_id: row.rowId,
            location: row.location,
            vertical_position_mm: row.yMm,
            lever_arm_mm: round(row.leverArmMm, 6),
            mx_mm: mm(row.mxMm),
            ex_mm: mm(row.exMm),
            m2_mm: mm(row.m2Mm),
            column_flange: row.columnFlange ? serializeFlangeSide(row.columnFlange) : null,
            end_plate: serializeFlangeSide(row.endPlate),
            ft_wc_rd_kn: kn(row.ftWcRdN),
            ft_wb_rd_kn: kn(row.ftWbRdN),
            ft_b_rd_kn: kn(row.boltRowRdN),
            ft_rd_individual_kn: kn(row.ftIndividualRdN),
            individual_governing_component: row.individualGoverning,
            ftr_rd_kn: kn(row.ftrRdN),
            governing_component: row.ftrLimitedBy,
        })),
        groups: joint.groups.map((group) => ({
            component: group.component,
            row_ids: group.rowIds,
            leff_cp_mm: round(group.leffCpMm, 6),
            leff_nc_mm: round(group.leffNcMm, 6),
            leff_1_mm: round(group.leff1Mm, 6),
            leff_2_mm: round(group.leff2Mm, 6),
            ft_rd_kn: kn(group.ftRdN),
            governing_mode: group.tstub ? group.tstub.mode : null,
            prying: group.tstub ? group.tstub.prying : null,
        })),
    };
}
function serializeEndPlateStiffness(joint) {
    return {
        k1_web_panel_shear_mm: mm(joint.stiffness.k1Mm),
        k2_web_compression_mm: mm(joint.stiffness.k2Mm),
        z_eq_mm: round(joint.stiffness.zEqMm, 6),
        keq_mm: round(joint.stiffness.keqMm, 6),
        sj_ini_knm_per_rad: round(joint.stiffness.sjIniNmmPerRad / 1e6, 6),
        per_row: joint.rows.map((row) => ({
            row_id: row.rowId,
            lever_arm_mm: round(row.leverArmMm, 6),
            leff_column_flange_mm: mm(row.stiffness.leffColumnFlangeMm),
            leff_end_plate_mm: round(row.stiffness.leffEndPlateMm, 6),
            k3_web_tension_mm: mm(row.stiffness.k3Mm),
            k4_flange_bending_mm: mm(row.stiffness.k4Mm),
            k5_endplate_bending_mm: round(row.stiffness.k5Mm, 6),
            k10_bolts_tension_mm: round(row.stiffness.k10Mm, 6),
            keff_mm: round(row.stiffness.keffMm, 6),
        })),
    };
}
function momentBoltArea(diameterMm) {
    const area = EC3_MOMENT_BOLT_AREAS[diameterMm];
    if (area === undefined)
        throw new CalculationError(`Unsupported bolt diameter M${diameterMm}.`);
    return area;
}
function normalizeMomentSteelGrade(grade) {
    return grade.toUpperCase();
}
function normalizeMomentBoltClass(boltClass) {
    return boltClass.toUpperCase().replace("CL", "");
}
function parseMomentISection(raw, label) {
    const profile = stringValue(raw, "profile", label === "column" ? "HEA300" : "IPE500");
    const steelGrade = normalizeMomentSteelGrade(stringValue(raw, "steel_grade", "S355"));
    if (!EC3_MOMENT_STEEL_GRADES[steelGrade])
        throw new CalculationError(`Unsupported ${label} steel_grade '${steelGrade}'.`);
    const heightMm = positiveNumber(raw, "height_mm");
    const widthMm = positiveNumber(raw, "width_mm");
    const webThicknessMm = positiveNumber(raw, "web_thickness_mm");
    const flangeThicknessMm = positiveNumber(raw, "flange_thickness_mm");
    const rootRadiusMm = positiveNumber(raw, "root_radius_mm");
    if (label === "column" && webThicknessMm > widthMm / 2.0) {
        throw new CalculationError("Column web thickness cannot exceed half the width.");
    }
    return {
        profile,
        heightMm,
        widthMm,
        webThicknessMm,
        flangeThicknessMm,
        rootRadiusMm,
        steelGrade,
        webDepthMm: heightMm - 2.0 * flangeThicknessMm - 2.0 * rootRadiusMm,
        shearAreaMm2: heightMm * webThicknessMm,
        leverArmEstimateMm: heightMm - flangeThicknessMm,
    };
}
function parseMomentWelds(raw) {
    const flangeThroatMm = positiveNumber(raw, "flange_throat_mm");
    const webThroatMm = positiveNumber(raw, "web_throat_mm");
    if (flangeThroatMm < 3.0)
        throw new CalculationError("Flange weld throat should be at least 3 mm.");
    if (webThroatMm < 3.0)
        throw new CalculationError("Web weld throat should be at least 3 mm.");
    return { flangeThroatMm, webThroatMm };
}
export function calculateEc3BoltedMomentConnection(raw) {
    return boltedMomentRoute(raw).response;
}
function boltedMomentRoute(raw) {
    const input = parseEc3BoltedMomentInput(raw);
    const geometryChecks = momentGeometryChecks(input);
    const geometryWarningCount = geometryChecks.filter((check) => check.status === "WARN").length;
    const geometryStatus = geometryWarningCount > 0 ? "WARN" : "PASS";
    const boltClass = EC3_BOLT_CLASSES[input.bolts.boltClass];
    if (!boltClass)
        throw new CalculationError(`Unsupported bolt_class '${input.bolts.boltClass}'.`);
    const spec = {
        joint: "beam_to_column",
        beam: endPlateSection(input.beam),
        column: endPlateSection(input.column),
        plate: { ...input.endPlate },
        flangeWeldThroatMm: input.welds.flangeThroatMm,
        webWeldThroatMm: input.welds.webThroatMm,
        bolt: { diameterMm: input.bolts.diameterMm, tensileAreaMm2: momentBoltArea(input.bolts.diameterMm), fubMpa: boltClass.fub_mpa },
        gaugeMm: input.bolts.horizontalSpacingMm,
        plateEdgeDistanceMm: input.bolts.edgeDistanceHorizontalMm,
        rows: input.bolts.rows,
        gammaM0: input.gammaM0,
        gammaM1: input.gammaM1,
        gammaM2: input.gammaM2,
        pryingAllowed: input.includePryingAction,
        doubleSided: input.connectionType === "double_sided",
    };
    const joint = endPlateJoint(spec);
    const componentChecks = momentConnectionComponentChecks(input, joint);
    const failedComponents = componentChecks.filter((check) => check.status === "FAIL");
    const overallUtilization = componentChecks.reduce((maximum, check) => Math.max(maximum, check.utilization_ratio), 0.0);
    const criticalComponent = componentChecks.reduce((critical, check) => !critical || check.utilization_ratio > critical.utilization_ratio ? check : critical, null);
    if (!criticalComponent)
        throw new CalculationError("Moment connection did not produce component checks.");
    const warningCodes = [];
    if (geometryWarningCount > 0)
        warningCodes.push("GEOMETRY_WARNINGS");
    if (failedComponents.some((check) => check.key === "joint_moment"))
        warningCodes.push("MOMENT_CHECK_FAILED");
    if (failedComponents.some((check) => check.key === "column_web_panel_shear"))
        warningCodes.push("WEB_PANEL_SHEAR_FAILED");
    if (failedComponents.some((check) => check.key === "column_web_compression"))
        warningCodes.push("WEB_COMPRESSION_FAILED");
    if (failedComponents.some((check) => check.key === "beam_flange_compression"))
        warningCodes.push("BEAM_FLANGE_COMPRESSION_FAILED");
    if (failedComponents.length > 0)
        warningCodes.push("STRENGTH_CHECK_FAILED");
    if (joint.compression.rowsLimited)
        warningCodes.push("COMPRESSION_SIDE_LIMITS_ROWS");
    warningCodes.push(...endPlateMethodWarnings(joint, input.beam, input.loads.shearKn, input.gammaM0));
    if (input.connectionType === "double_sided")
        warningCodes.push("DOUBLE_SIDED_STIFFNESS_ASSUMPTION");
    const routeResponse = response("ec3_bolted_moment_connection", raw, {
        connection_type: input.connectionType,
        column_profile: input.column.profile,
        beam_profile: input.beam.profile,
        steel_grades: {
            column: input.column.steelGrade,
            beam: input.beam.steelGrade,
            end_plate: input.endPlate.steelGrade,
        },
        bolt_class: input.bolts.boltClass,
        bolt_diameter_mm: input.bolts.diameterMm,
        bolt_hole_diameter_mm: input.bolts.holeDiameterMm,
        bolt_row_count: input.bolts.rows.length,
        center_of_compression_mm: round(input.centerOfCompressionMm, 6),
        applied_moment_knm: input.loads.momentKnm,
        applied_shear_kn: input.loads.shearKn,
        applied_axial_kn: input.loads.axialKn,
        geometry_status: geometryStatus,
        geometry_warning_count: geometryWarningCount,
        geometry_checks: geometryChecks,
        sj_ini_knm_per_rad: round(joint.stiffness.sjIniNmmPerRad / 1e6, 6),
        z_eq_mm: round(joint.stiffness.zEqMm, 6),
        keq_mm: round(joint.stiffness.keqMm, 6),
        mj_rd_knm: round(joint.mjRdNmm / 1e6, 6),
        stiffness: serializeEndPlateStiffness(joint),
        resistance: serializeEndPlateResistance(joint),
        component_checks: componentChecks.map((check) => ({
            ...check,
            applied: round(check.applied, 6),
            resistance: round(check.resistance, 6),
            utilization_ratio: round(check.utilization_ratio, 6),
            utilization_percent: round(check.utilization_ratio * 100.0, 1),
        })),
        critical_component: criticalComponent.component,
        overall_utilization: round(overallUtilization, 6),
        utilization_percent: round(overallUtilization * 100.0, 1),
        overall_status: overallUtilization <= 1.0 ? "PASS" : "FAIL",
        check_passed: overallUtilization <= 1.0,
        warning_codes: warningCodes,
    }, {
        source_refs: [
            "EN 1993-1-8:2005+AC:2009: Tables 3.3 and 3.4; 6.2.4-6.2.6 with Table 6.2, Table 6.4 (column flange) and Table 6.6 (end plate), rows individually and in groups; Figure 6.11 (alpha); 6.2.6.1-6.2.6.3, 6.2.6.7, 6.2.6.8; 6.2.7.2(6)-(9); 6.3 with Tables 6.10 and 6.11.",
            "Figure 6.11 alpha by the closed-form fit of SCI P398 (2013) Appendix G.",
        ],
        assumptions: [
            ...COMMON_ASSUMPTIONS,
            "Single I-section beam on an unstiffened, continuous I-section column (no column end near the joint, no stiffeners or backing plates), two bolts per row; the beam is centred on the plate height.",
            "Effective row resistances follow EN 1993-1-8 6.2.7.2 (rows and groups, Vwp,Rd/beta with beta = 1, Fc,wc,Rd with kwc = 1, Fc,fb,Rd, triangular limit); Mj,Rd = sum Ftr,Rd hr.",
            "double_sided keeps beta = 1 for the resistance and omits k1 in Sj,ini; moments of opposite sign on the two sides (beta up to 2, EN 1993-1-8 Table 5.4) need a separate web panel check.",
            "Lb = tfc + tp + 2 washers + (head + nut)/2 with the larger of the ISO 4014/4032/7089 and EN 14399-4/-6 dimensions; prying per Table 6.2 unless include_prying_action is false.",
            "Steel yield strength reduced for elements thicker than 40 mm (EN 1993-1-1 Table 3.1); Mc,Rd of the beam is not reduced for shear.",
            "Bolt shear, welds and member checks are outside this route; shear and axial actions are not combined with the moment.",
            "Geometry warnings do not stop the resistance calculation.",
        ],
    });
    return { response: routeResponse, joint, spec };
}
function parseEc3BoltedMomentInput(raw) {
    const column = parseMomentISection(requiredObject(raw, "column"), "column");
    const beam = parseMomentISection(requiredObject(raw, "beam"), "beam");
    const endPlate = parseMomentEndPlate(requiredObject(raw, "end_plate"));
    const welds = parseMomentWelds(requiredObject(raw, "welds"));
    const boltsRaw = requiredObject(raw, "bolts");
    const loadsRaw = requiredObject(raw, "loads");
    const connectionTypeRaw = stringValue(raw, "connection_type", "single_sided");
    if (connectionTypeRaw !== "single_sided" && connectionTypeRaw !== "double_sided") {
        throw new CalculationError(`Unsupported connection_type '${connectionTypeRaw}'.`);
    }
    const gammaM0 = positiveNumber(raw, "gamma_m0", EC3_GAMMA_M0);
    const gammaM1 = positiveNumber(raw, "gamma_m1", EC3_GAMMA_M1);
    const gammaM2 = positiveNumber(raw, "gamma_m2", EC3_GAMMA_M2);
    const includePryingAction = booleanValue(raw, "include_prying_action", true);
    if (endPlate.widthMm < beam.widthMm) {
        throw new CalculationError(`End-plate width (${endPlate.widthMm} mm) must be >= beam width (${beam.widthMm} mm).`);
    }
    const boltClass = normalizeMomentBoltClass(stringValue(boltsRaw, "bolt_class", "8.8"));
    if (!EC3_BOLT_CLASSES[boltClass])
        throw new CalculationError(`Unsupported bolt_class '${boltClass}'.`);
    const diameterMm = positiveNumber(boltsRaw, "diameter_mm");
    const boltArea = EC3_MOMENT_BOLT_AREAS[diameterMm];
    if (boltArea === undefined)
        throw new CalculationError(`Unsupported bolt diameter M${diameterMm}.`);
    const holeDiameterMm = diameterMm <= 24 ? diameterMm + 2 : diameterMm + 3;
    const rowValues = arrayValue(boltsRaw, "rows").map((value, index) => {
        const row = ensureObject(value, `bolts.rows[${index}]`);
        return {
            rowId: positiveInteger(row, "row_id"),
            verticalPositionMm: positiveNumber(row, "vertical_position_mm"),
            numberOfBolts: positiveInteger(row, "number_of_bolts", 2),
            leverArmMm: 0.0,
        };
    }).sort((a, b) => a.verticalPositionMm - b.verticalPositionMm);
    if (rowValues.length < 2)
        throw new CalculationError("At least 2 bolt rows are required for moment connection.");
    const bolts = {
        diameterMm,
        boltClass,
        rows: rowValues,
        horizontalSpacingMm: positiveNumber(boltsRaw, "horizontal_spacing_mm"),
        edgeDistanceHorizontalMm: positiveNumber(boltsRaw, "edge_distance_horizontal_mm"),
        edgeDistanceVerticalTopMm: positiveNumber(boltsRaw, "edge_distance_vertical_top_mm"),
        edgeDistanceVerticalBottomMm: positiveNumber(boltsRaw, "edge_distance_vertical_bottom_mm"),
        holeDiameterMm,
    };
    const minSpacing = 2.2 * holeDiameterMm;
    if (bolts.horizontalSpacingMm < minSpacing) {
        throw new CalculationError(`Horizontal spacing ${bolts.horizontalSpacingMm.toFixed(1)} mm < minimum ${minSpacing.toFixed(1)} mm.`);
    }
    const minEdge = 1.2 * holeDiameterMm;
    for (const [label, value] of [
        ["Horizontal edge distance", bolts.edgeDistanceHorizontalMm],
        ["Top edge distance", bolts.edgeDistanceVerticalTopMm],
        ["Bottom edge distance", bolts.edgeDistanceVerticalBottomMm],
    ]) {
        if (value < minEdge)
            throw new CalculationError(`${label} ${value.toFixed(1)} mm < minimum ${minEdge.toFixed(1)} mm.`);
    }
    const maxBoltPosition = Math.max(...bolts.rows.map((row) => row.verticalPositionMm));
    if (maxBoltPosition + bolts.edgeDistanceVerticalTopMm > endPlate.heightMm) {
        throw new CalculationError("End-plate height insufficient for bolt configuration.");
    }
    const centerOfCompressionMm = (endPlate.heightMm - beam.heightMm) / 2.0 + beam.flangeThicknessMm / 2.0;
    for (const row of bolts.rows) {
        row.leverArmMm = row.verticalPositionMm - centerOfCompressionMm;
        if (row.leverArmMm <= 0.0) {
            throw new CalculationError(`Bolt row ${row.rowId} is not in tension zone.`);
        }
    }
    const momentKnm = numberValue(loadsRaw, "moment_knm");
    const shearKn = numberValue(loadsRaw, "shear_kn", 0.0);
    const axialKn = numberValue(loadsRaw, "axial_kn", 0.0);
    if (momentKnm === 0.0 && shearKn === 0.0 && axialKn === 0.0) {
        throw new CalculationError("At least one load component must be non-zero.");
    }
    return {
        column,
        beam,
        endPlate,
        welds,
        bolts,
        loads: { momentKnm, shearKn, axialKn },
        connectionType: connectionTypeRaw,
        includePryingAction,
        gammaM0,
        gammaM1,
        gammaM2,
        centerOfCompressionMm,
    };
}
function parseMomentEndPlate(raw) {
    const thicknessMm = positiveNumber(raw, "thickness_mm");
    if (thicknessMm < 8.0)
        throw new CalculationError("End-plate thickness should be at least 8 mm.");
    if (thicknessMm > 40.0)
        throw new CalculationError("End-plate thickness should not exceed 40 mm.");
    const steelGrade = normalizeMomentSteelGrade(stringValue(raw, "steel_grade", "S355"));
    if (!EC3_MOMENT_STEEL_GRADES[steelGrade])
        throw new CalculationError(`Unsupported end_plate steel_grade '${steelGrade}'.`);
    return {
        thicknessMm,
        widthMm: positiveNumber(raw, "width_mm"),
        heightMm: positiveNumber(raw, "height_mm"),
        steelGrade,
    };
}
function momentGeometryChecks(input) {
    const checks = [];
    const d0 = input.bolts.holeDiameterMm;
    const minEdge = 1.2 * d0;
    const maxEdge = 4.0 * input.endPlate.thicknessMm + 40.0;
    const minSpacing = 2.2 * d0;
    const maxSpacing = Math.min(14.0 * input.endPlate.thicknessMm, 200.0);
    const addCheck = (key, name, clause, provided, required, comparison) => {
        const passed = comparison === ">=" ? provided >= required : provided <= required;
        checks.push({
            key,
            name,
            clause,
            provided_mm: round(provided, 6),
            required_mm: round(required, 6),
            comparison,
            status: passed ? "PASS" : "WARN",
            message: `${name}: ${provided.toFixed(1)} mm should be ${comparison} ${required.toFixed(1)} mm`,
        });
    };
    addCheck("min_horizontal_edge", "Minimum horizontal edge distance", "Table 3.3", input.bolts.edgeDistanceHorizontalMm, minEdge, ">=");
    addCheck("max_horizontal_edge", "Maximum horizontal edge distance", "Table 3.3", input.bolts.edgeDistanceHorizontalMm, maxEdge, "<=");
    addCheck("min_top_edge", "Minimum top edge distance", "Table 3.3", input.bolts.edgeDistanceVerticalTopMm, minEdge, ">=");
    addCheck("max_top_edge", "Maximum top edge distance", "Table 3.3", input.bolts.edgeDistanceVerticalTopMm, maxEdge, "<=");
    addCheck("min_horizontal_spacing", "Minimum horizontal spacing", "Table 3.3", input.bolts.horizontalSpacingMm, minSpacing, ">=");
    addCheck("max_horizontal_spacing", "Maximum horizontal spacing", "Table 3.3", input.bolts.horizontalSpacingMm, maxSpacing, "<=");
    for (let i = 0; i < input.bolts.rows.length - 1; i += 1) {
        const row1 = input.bolts.rows[i];
        const row2 = input.bolts.rows[i + 1];
        if (!row1 || !row2)
            continue;
        const spacing = row2.verticalPositionMm - row1.verticalPositionMm;
        addCheck(`min_vertical_spacing_${row1.rowId}_${row2.rowId}`, `Minimum vertical spacing (Row ${row1.rowId} to ${row2.rowId})`, "Table 3.3", spacing, minSpacing, ">=");
        addCheck(`max_vertical_spacing_${row1.rowId}_${row2.rowId}`, `Maximum vertical spacing (Row ${row1.rowId} to ${row2.rowId})`, "Table 3.3", spacing, maxSpacing, "<=");
    }
    const minWidth = input.bolts.horizontalSpacingMm + 2.0 * input.bolts.edgeDistanceHorizontalMm;
    addCheck("end_plate_width", "End-plate width adequacy", "Constructability", input.endPlate.widthMm, minWidth, ">=");
    addCheck("min_flange_weld_throat", "Minimum flange weld throat", "EN 1993-1-8, 4.5.2", input.welds.flangeThroatMm, 0.5 * Math.sqrt(input.beam.flangeThicknessMm), ">=");
    addCheck("min_web_weld_throat", "Minimum web weld throat", "EN 1993-1-8, 4.5.2", input.welds.webThroatMm, 0.5 * Math.sqrt(input.beam.webThicknessMm), ">=");
    return checks;
}
function momentConnectionComponentChecks(input, joint) {
    const checks = [];
    const mEdNmm = Math.abs(input.loads.momentKnm) * 1e6;
    const z = joint.stiffness.zEqMm;
    const addCheck = (key, component, location, applied, capacity, unit, clause) => {
        const utilization = capacity > 0.0 ? applied / capacity : Infinity;
        checks.push({
            key,
            component,
            location,
            applied,
            resistance: capacity,
            unit,
            utilization_ratio: utilization,
            status: utilization <= 1.0 ? "PASS" : "FAIL",
            clause,
        });
    };
    const forceAtZ = z > 0.0 ? mEdNmm / z / 1e3 : 0.0;
    const compression = joint.compression;
    addCheck("joint_moment", "Joint moment resistance", "Connection", mEdNmm / 1e6, joint.mjRdNmm / 1e6, "kNm", "EN 1993-1-8, 6.2.7.2 (6.25)");
    addCheck("column_web_panel_shear", "Column web panel shear", "Column", forceAtZ, (compression.vwpRdN ?? 0.0) / 1e3, "kN", "EN 1993-1-8, 6.2.6.1 (beta = 1, z = z_eq)");
    addCheck("column_web_compression", "Column web compression", "Column", forceAtZ, (compression.fcWcRdN ?? 0.0) / 1e3, "kN", "EN 1993-1-8, 6.2.6.2 (z = z_eq)");
    addCheck("beam_flange_compression", "Beam flange and web in compression", "Beam", forceAtZ, compression.fcFbRdN / 1e3, "kN", "EN 1993-1-8, 6.2.6.7 (z = z_eq)");
    return checks;
}
export function calculateEc3SpliceMomentConnection(raw) {
    return spliceRoute(raw).response;
}
function spliceRoute(raw) {
    const input = parseEc3SpliceMomentInput(raw);
    const geometryChecks = spliceGeometryChecks(input);
    const geometryStatus = geometryChecks.some((check) => check.status === "FAIL")
        ? "FAIL"
        : geometryChecks.some((check) => check.status === "WARN") ? "WARN" : "PASS";
    const boltClass = EC3_BOLT_CLASSES[input.bolts.boltClass];
    if (!boltClass)
        throw new CalculationError(`Unsupported bolt_class '${input.bolts.boltClass}'.`);
    const spec = {
        joint: "beam_splice",
        beam: endPlateSection(input.beam),
        column: null,
        plate: { ...input.endPlate },
        flangeWeldThroatMm: input.welds.flangeThroatMm,
        webWeldThroatMm: input.welds.webThroatMm,
        bolt: { diameterMm: input.bolts.diameterMm, tensileAreaMm2: momentBoltArea(input.bolts.diameterMm), fubMpa: boltClass.fub_mpa },
        gaugeMm: input.bolts.horizontalSpacingMm,
        plateEdgeDistanceMm: input.bolts.edgeDistanceHorizontalMm,
        rows: input.bolts.rows,
        gammaM0: input.gammaM0,
        gammaM1: input.gammaM1,
        gammaM2: input.gammaM2,
        pryingAllowed: true,
        doubleSided: false,
    };
    const joint = endPlateJoint(spec);
    const mjRdKnm = joint.mjRdNmm / 1e6;
    const momentUtilization = mjRdKnm > 0.0 ? Math.abs(input.loads.momentKnm) / mjRdKnm : Infinity;
    const overallStatus = momentUtilization <= 1.0 && geometryStatus !== "FAIL" ? "PASS" : "FAIL";
    const compressionAppliedKn = joint.sumFtrN / 1e3;
    const compressionResistanceKn = joint.compression.fcFbRdN / 1e3;
    const compressionUtilization = compressionAppliedKn / compressionResistanceKn;
    const compressionReductionFactor = joint.sumFtrUncappedN > 0.0 ? joint.sumFtrN / joint.sumFtrUncappedN : 1.0;
    const componentChecks = [
        {
            component: "Beam Flange Compression",
            location: "Beam",
            applied: compressionAppliedKn,
            resistance: compressionResistanceKn,
            unit: "kN",
            utilization_ratio: compressionUtilization,
            status: compressionUtilization <= 1.0 + 1e-9 ? "PASS" : "FAIL",
            clause: "EN 1993-1-8, 6.2.6.7 and 6.2.7.2(7)",
        },
        {
            component: "Moment Resistance",
            location: "Connection",
            applied: Math.abs(input.loads.momentKnm),
            resistance: mjRdKnm,
            unit: "kNm",
            utilization_ratio: momentUtilization,
            status: momentUtilization <= 1.0 && geometryStatus !== "FAIL" ? "PASS" : "FAIL",
            clause: "EN 1993-1-8, 6.2.7.2 (6.25)",
        },
    ];
    const warningCodes = [];
    if (geometryStatus === "WARN")
        warningCodes.push("GEOMETRY_WARNINGS");
    if (geometryStatus === "FAIL")
        warningCodes.push("GEOMETRY_CHECK_FAILED");
    if (joint.compression.rowsLimited)
        warningCodes.push("COMPRESSION_FLANGE_GOVERNS");
    warningCodes.push(...endPlateMethodWarnings(joint, input.beam, input.loads.shearKn, input.gammaM0));
    if (momentUtilization > 1.0 || geometryStatus === "FAIL")
        warningCodes.push("MOMENT_CHECK_FAILED", "STRENGTH_CHECK_FAILED");
    const routeResponse = response("ec3_splice_moment_connection", raw, {
        beam_profile: input.beam.profile,
        steel_grade: input.beam.steelGrade,
        end_plate_steel_grade: input.endPlate.steelGrade,
        bolt_class: input.bolts.boltClass,
        bolt_diameter_mm: input.bolts.diameterMm,
        bolt_hole_diameter_mm: input.bolts.holeDiameterMm,
        bolt_row_count: input.bolts.rows.length,
        tension_row_count: joint.rows.length,
        center_of_compression_mm: round(joint.centreOfCompressionMm, 6),
        geometry_status: geometryStatus,
        geometry_warning_count: geometryChecks.filter((check) => check.status === "WARN").length,
        geometry_failure_count: geometryChecks.filter((check) => check.status === "FAIL").length,
        geometry_checks: geometryChecks,
        mj_rd_knm: round(mjRdKnm, 6),
        sj_ini_knm_per_rad: round(joint.stiffness.sjIniNmmPerRad / 1e6, 6),
        z_eq_mm: round(joint.stiffness.zEqMm, 6),
        keq_mm: round(joint.stiffness.keqMm, 6),
        compression_flange_governs: joint.compression.rowsLimited,
        compression_reduction_factor: round(compressionReductionFactor, 6),
        resistance: serializeEndPlateResistance(joint),
        stiffness: serializeEndPlateStiffness(joint),
        applied_moment_knm: input.loads.momentKnm,
        applied_shear_kn: input.loads.shearKn,
        applied_axial_kn: input.loads.axialKn,
        component_checks: componentChecks.map((check) => ({
            ...check,
            applied: round(check.applied, 6),
            resistance: round(check.resistance, 6),
            utilization_ratio: round(check.utilization_ratio, 6),
            utilization_percent: round(check.utilization_ratio * 100.0, 1),
        })),
        overall_utilization: round(momentUtilization, 6),
        utilization_percent: round(momentUtilization * 100.0, 1),
        critical_component: "Moment Resistance",
        overall_status: overallStatus,
        check_passed: overallStatus === "PASS",
        warning_codes: warningCodes,
    }, {
        source_refs: [
            "EN 1993-1-8:2005+AC:2009: Table 3.3; 6.2.4-6.2.6 with Tables 6.2 and 6.6 (end plate, rows individually and in groups); Figure 6.11 (alpha); 6.2.6.7, 6.2.6.8; 6.2.7.2(6)-(9); 6.3 with Tables 6.10 and 6.11.",
            "Figure 6.11 alpha by the closed-form fit of SCI P398 (2013) Appendix G.",
        ],
        assumptions: [
            ...COMMON_ASSUMPTIONS,
            "Symmetric I-section beam-to-beam splice with two identical welded end plates, two bolts per row; the beam is centred on the plate height.",
            "Rows at or below the centre of the compression flange are not tension rows; at most one row outside the tension flange.",
            "Effective row resistances follow EN 1993-1-8 6.2.7.2 (rows and groups, beam flange in compression, triangular limit); Mj,Rd = sum Ftr,Rd hr.",
            "Lb = 2 tp + 2 washers + (head + nut)/2 with the larger of the ISO 4014/4032/7089 and EN 14399-4/-6 dimensions; prying per Table 6.2.",
            "Steel yield strength reduced for elements thicker than 40 mm (EN 1993-1-1 Table 3.1); Mc,Rd of the beam is not reduced for shear.",
            "Bolt shear, welds and the beam member check are outside this route.",
        ],
    });
    return { response: routeResponse, joint, spec };
}
function parseEc3SpliceMomentInput(raw) {
    const beam = parseMomentISection(requiredObject(raw, "beam"), "beam");
    const endPlate = parseSpliceEndPlate(requiredObject(raw, "end_plate"));
    const welds = parseMomentWelds(requiredObject(raw, "welds"));
    const bolts = parseSpliceBolts(requiredObject(raw, "bolts"));
    const loadsRaw = requiredObject(raw, "loads");
    if (endPlate.widthMm < beam.widthMm)
        throw new CalculationError(`End-plate width (${endPlate.widthMm} mm) must be >= beam width (${beam.widthMm} mm).`);
    const beamBottomOffset = (endPlate.heightMm - beam.heightMm) / 2.0;
    if (beamBottomOffset < 0.0)
        throw new CalculationError("End-plate height must be >= beam height.");
    const centerOfCompressionMm = beamBottomOffset + beam.flangeThicknessMm / 2.0;
    for (const row of bolts.rows)
        row.leverArmMm = row.verticalPositionMm - centerOfCompressionMm;
    return {
        beam,
        endPlate,
        welds,
        bolts,
        loads: {
            momentKnm: numberValue(loadsRaw, "moment_knm"),
            shearKn: numberValue(loadsRaw, "shear_kn", 0.0),
            axialKn: numberValue(loadsRaw, "axial_kn", 0.0),
        },
        gammaM0: positiveNumber(raw, "gamma_m0", EC3_GAMMA_M0),
        gammaM1: positiveNumber(raw, "gamma_m1", EC3_GAMMA_M1),
        gammaM2: positiveNumber(raw, "gamma_m2", EC3_GAMMA_M2),
        centerOfCompressionMm,
    };
}
function parseSpliceEndPlate(raw) {
    const thicknessMm = positiveNumber(raw, "thickness_mm");
    if (thicknessMm < 8.0)
        throw new CalculationError("End-plate thickness should be at least 8 mm.");
    if (thicknessMm > 50.0)
        throw new CalculationError("End-plate thickness should not exceed 50 mm.");
    const steelGrade = normalizeMomentSteelGrade(stringValue(raw, "steel_grade", "S355"));
    if (!EC3_MOMENT_STEEL_GRADES[steelGrade])
        throw new CalculationError(`Unsupported end_plate steel_grade '${steelGrade}'.`);
    return {
        thicknessMm,
        widthMm: positiveNumber(raw, "width_mm"),
        heightMm: positiveNumber(raw, "height_mm"),
        steelGrade,
    };
}
function parseSpliceBolts(raw) {
    const boltClass = normalizeMomentBoltClass(stringValue(raw, "bolt_class", "8.8"));
    if (!EC3_BOLT_CLASSES[boltClass])
        throw new CalculationError(`Unsupported bolt_class '${boltClass}'.`);
    const diameterMm = positiveNumber(raw, "diameter_mm");
    if (EC3_MOMENT_BOLT_AREAS[diameterMm] === undefined)
        throw new CalculationError(`Unsupported bolt diameter M${diameterMm}.`);
    const holeDiameterMm = diameterMm <= 24 ? diameterMm + 2 : diameterMm + 3;
    const rows = arrayValue(raw, "rows").map((value, index) => {
        const row = ensureObject(value, `bolts.rows[${index}]`);
        const numberOfBolts = positiveInteger(row, "number_of_bolts", 2);
        if (numberOfBolts > 4)
            throw new CalculationError("Number of bolts per row should not exceed 4 for standard splices.");
        return {
            rowId: positiveInteger(row, "row_id"),
            verticalPositionMm: positiveNumber(row, "vertical_position_mm"),
            numberOfBolts,
            leverArmMm: 0.0,
        };
    }).sort((a, b) => a.verticalPositionMm - b.verticalPositionMm);
    if (rows.length < 1)
        throw new CalculationError("At least one bolt row required.");
    const horizontalSpacingMm = positiveNumber(raw, "horizontal_spacing_mm");
    const edgeDistanceHorizontalMm = positiveNumber(raw, "edge_distance_horizontal_mm");
    const minSpacing = 2.2 * holeDiameterMm;
    const minEdge = 1.2 * holeDiameterMm;
    if (horizontalSpacingMm < minSpacing)
        throw new CalculationError(`Horizontal spacing ${horizontalSpacingMm.toFixed(1)} mm < minimum ${minSpacing.toFixed(1)} mm.`);
    if (edgeDistanceHorizontalMm < minEdge)
        throw new CalculationError(`Horizontal edge distance ${edgeDistanceHorizontalMm.toFixed(1)} mm < minimum ${minEdge.toFixed(1)} mm.`);
    return {
        diameterMm,
        boltClass,
        rows,
        horizontalSpacingMm,
        edgeDistanceHorizontalMm,
        edgeDistanceVerticalTopMm: positiveNumber(raw, "edge_distance_vertical_top_mm"),
        edgeDistanceVerticalBottomMm: positiveNumber(raw, "edge_distance_vertical_bottom_mm"),
        holeDiameterMm,
    };
}
function spliceGeometryChecks(input) {
    const d0 = input.bolts.holeDiameterMm;
    const minEdge = 1.2 * d0;
    const minSpacing = 2.2 * d0;
    const checks = [
        spliceGeometryCheck("horizontal_edge", "Horiz Edge Dist", "Table 3.3", input.bolts.edgeDistanceHorizontalMm, minEdge, "FAIL"),
        spliceGeometryCheck("horizontal_spacing", "Horiz Spacing", "Table 3.3", input.bolts.horizontalSpacingMm, minSpacing, "FAIL"),
        spliceGeometryCheck("flange_weld", "Flange Weld", "Rec.", input.welds.flangeThroatMm, 0.5 * Math.sqrt(input.beam.flangeThicknessMm), "WARN"),
    ];
    for (let i = 0; i < input.bolts.rows.length - 1; i += 1) {
        const row1 = input.bolts.rows[i];
        const row2 = input.bolts.rows[i + 1];
        if (!row1 || !row2)
            continue;
        checks.push(spliceGeometryCheck(`vertical_spacing_${row1.rowId}_${row2.rowId}`, `Vert Spacing R${row1.rowId}-R${row2.rowId}`, "Table 3.3", row2.verticalPositionMm - row1.verticalPositionMm, minSpacing, "FAIL"));
    }
    return checks;
}
function spliceGeometryCheck(key, name, clause, providedMm, requiredMm, failureStatus) {
    const passed = providedMm >= requiredMm;
    return {
        key,
        name,
        clause,
        provided_mm: round(providedMm, 6),
        required_mm: round(requiredMm, 6),
        status: passed ? "PASS" : failureStatus,
        message: passed ? `>= ${requiredMm.toFixed(1)} mm` : `${providedMm.toFixed(1)} mm < ${requiredMm.toFixed(1)} mm`,
    };
}
/** Profile names read as channel sections when section_type is not given: U, UPN, UPE, UAP, PFC followed by a size. */
export const DOUBLE_SIDED_CHANNEL_PROFILE = /^\s*(UPN|UPE|UAP|PFC|U)\s*-?\s*\d/i;
export function calculateEc3DoubleSidedWebConnection(raw) {
    return doubleSidedRoute(raw).response;
}
function doubleSidedRoute(raw) {
    const input = parseEc3DoubleSidedWebConnectionInput(raw);
    const primaryProps = steelProps(input.primary.steelGrade, "primary");
    const secondaryProps = steelProps(input.secondary.steelGrade, "secondary");
    const plateProps = steelProps(input.endPlate.steelGrade, "end_plate");
    const boltProps = EC3_BOLT_CLASSES[input.bolts.boltClass];
    if (!boltProps)
        throw new CalculationError(`Unsupported bolt_class '${input.bolts.boltClass}'.`);
    const boltCount = input.bolts.rows.reduce((sum, row) => sum + row.numberOfBolts, 0);
    if (boltCount <= 0)
        throw new CalculationError("At least one bolt is required.");
    const boltAreaMm2 = doubleSidedBoltArea(input.bolts.diameterMm);
    const holeDiameterMm = input.bolts.diameterMm <= 24 ? input.bolts.diameterMm + 2 : input.bolts.diameterMm + 3;
    const alphaV = ["4.6", "5.6", "8.8"].some((needle) => input.bolts.boltClass.includes(needle)) ? 0.6 : 0.5;
    const boltShearCapacityKn = boltCount * (alphaV * boltProps.fub_mpa * boltAreaMm2 / input.gammaM2) / 1000.0;
    const k1 = Math.min(2.8 * input.bolts.edgeDistanceHorizontalMm / holeDiameterMm - 1.7, 2.5);
    if (!(k1 > 0.0))
        throw new CalculationError("Horizontal edge distance is too small for positive bearing capacity.");
    const alphaB = 0.5;
    const plateBearingCapacityKn = boltCount * (k1 * alphaB * plateProps.fu_mpa * input.bolts.diameterMm * input.endPlate.thicknessMm / input.gammaM2) / 1000.0;
    const primaryWebBearingCapacityKn = boltCount * (k1 * alphaB * primaryProps.fu_mpa * input.bolts.diameterMm * input.primary.webThicknessMm / input.gammaM2) / 1000.0;
    const primaryWebBearingLoadKn = input.webBearingFactor * input.loads.shearKn;
    const checks = [
        doubleSidedCheck("Bolt Shear", boltShearCapacityKn, input.loads.shearKn),
        doubleSidedCheck("Plate Bearing", plateBearingCapacityKn, input.loads.shearKn),
        doubleSidedCheck("Primary Web Bearing", primaryWebBearingCapacityKn, primaryWebBearingLoadKn, `Load factor on V_Ed = ${input.webBearingFactor.toFixed(1)}`),
    ];
    const momentResult = doubleSidedMomentResistance(input, primaryProps, secondaryProps, boltProps, boltAreaMm2);
    if (momentResult !== null) {
        checks.push(doubleSidedCheck("Moment Resistance", momentResult.momentResistanceKnm, input.loads.momentKnm));
    }
    const critical = checks.reduce((best, check) => check.utilization_ratio > best.utilization_ratio ? check : best);
    const warningCodes = doubleSidedWarningCodes(checks, momentResult);
    const overallStatus = critical.utilization_ratio <= 1.0 ? "PASS" : "FAIL";
    const routeResponse = response("ec3_double_sided_web_connection", raw, {
        project_name: input.projectName,
        primary_profile: input.primary.profile,
        secondary_profile: input.secondary.profile,
        secondary_section_type: input.secondarySectionType,
        bolt_count: boltCount,
        bolt_diameter_mm: input.bolts.diameterMm,
        hole_diameter_mm: holeDiameterMm,
        bolt_tensile_area_mm2: round(boltAreaMm2, 6),
        alpha_v: alphaV,
        bearing_k1: round(k1, 6),
        bearing_alpha_b: alphaB,
        web_bearing_factor: input.webBearingFactor,
        bolt_shear_capacity_kn: round(boltShearCapacityKn, 6),
        plate_bearing_capacity_kn: round(plateBearingCapacityKn, 6),
        primary_web_bearing_capacity_kn: round(primaryWebBearingCapacityKn, 6),
        moment_resistance_knm: momentResult === null ? null : round(momentResult.momentResistanceKnm, 6),
        compression_limit_kn: momentResult === null ? null : round(momentResult.compressionLimitN / 1000.0, 6),
        compression_reduction_factor: momentResult === null ? null : round(momentResult.compressionReductionFactor, 6),
        effective_web_compression_width_mm: momentResult === null ? null : round(momentResult.effectiveWebCompressionWidthMm, 6),
        compression_limit_component: momentResult === null ? null : momentResult.compressionLimitComponent,
        secondary_flange_compression_kn: momentResult === null ? null : round(momentResult.secondaryFlangeCompressionN / 1000.0, 6),
        primary_web_compression_kn: momentResult === null ? null : round(momentResult.primaryWebCompressionN / 1000.0, 6),
        resistance: momentResult === null ? null : serializeEndPlateResistance(momentResult.joint),
        max_utilization: round(critical.utilization_ratio, 6),
        utilization_percent: round(critical.utilization_ratio * 100.0, 1),
        critical_component: critical.component,
        checks,
        bolt_forces: momentResult?.boltForces || [],
        messages: momentResult?.messages || [],
        overall_status: overallStatus,
        check_passed: overallStatus === "PASS",
        warning_codes: warningCodes,
    }, {
        source_refs: [
            "EN 1993-1-8:2005+AC:2009: Tables 3.4 and 6.2; 6.2.4-6.2.6 with Table 6.6 (end plate, rows individually and in groups); Figure 6.11 (alpha); 6.2.6.7, 6.2.6.8; 6.2.7.2(6)-(9).",
            "Figure 6.11 alpha by the closed-form fit of SCI P398 (2013) Appendix G.",
            "Bolt shear, plate bearing, primary web bearing and the compression-side resistances as in source script double_sided_web.py.",
        ],
        assumptions: [
            ...COMMON_ASSUMPTIONS,
            "Scope is a symmetric double-sided web connection with through-bolts and identical secondary beams on both sides; the moments on both sides balance, so each bolt row is loaded by the two end-plate T-stubs in series and the primary web is clamped between them (it adds to the bolt grip Lb).",
            "Moment resistance by EN 1993-1-8 6.2.7.2: end-plate T-stubs per Table 6.6 (leff,1 = min(leff,cp; leff,nc), leff,2 = leff,nc) for every row alone and every group of rows, Table 6.2 modes 1, 2 and 3 with the Lb* prying criterion, beam web in tension with beff,t,wb = leff (6.2.6.8), the compression side and the triangular limit; Mj,Rd = sum Ftr,Rd hr.",
            "Row positions are measured from the outer face of the secondary compression flange; the centre of compression is the centre of that flange. Two bolts per row; rows above the secondary beam (extended end plate) are not covered, because the plate position relative to the beam is not an input.",
            "Channel secondary sections (section_type channel, inferred from a U/UPN/UPE/UAP/PFC profile name): the tension flange is not taken to stiffen the first row below it (no Figure 6.11 alpha), which is never less safe.",
            "Compression side: the lowest of the secondary flange b tf fy / gamma_M0 and the primary web beff tw fy / gamma_M0 of the source script, and Mc,Rd/(h - tf) of the secondary (6.2.6.7).",
            "Steel yield strength of the end plate and secondary reduced for elements thicker than 40 mm (EN 1993-1-1 Table 3.1) in the moment check.",
            "The source script's simplified bolt shear, plate bearing (alpha_b = 0.5) and primary web bearing checks are unchanged.",
            "Set web_bearing_factor to 2.0 when both sides load the primary web in the same direction; the source script default is 1.0.",
        ],
    });
    return { response: routeResponse, joint: momentResult?.joint ?? null, spec: momentResult?.spec ?? null };
}
function parseEc3DoubleSidedWebConnectionInput(raw) {
    const loadsRaw = requiredObject(raw, "loads");
    const primary = parseDoubleSidedWebSection(requiredObject(raw, "primary"), "primary");
    const secondaryRaw = requiredObject(raw, "secondary");
    const secondary = parseDoubleSidedWebSection(secondaryRaw, "secondary");
    const input = {
        projectName: stringValue(raw, "project_name", "Double-sided web connection"),
        primary,
        secondary,
        secondarySectionType: parseDoubleSidedSectionType(secondaryRaw, secondary.profile),
        endPlate: parseDoubleSidedWebEndPlate(requiredObject(raw, "end_plate")),
        welds: parseDoubleSidedWebWelds(requiredObject(raw, "welds")),
        bolts: parseDoubleSidedWebBolts(requiredObject(raw, "bolts")),
        loads: {
            momentKnm: nonNegativeNumber(loadsRaw, "moment_knm"),
            shearKn: nonNegativeNumber(loadsRaw, "shear_kn"),
            axialKn: numberValue(loadsRaw, "axial_kn", 0.0),
        },
        gammaM0: positiveNumber(raw, "gamma_m0", EC3_GAMMA_M0),
        gammaM2: positiveNumber(raw, "gamma_m2", EC3_GAMMA_M2),
        webBearingFactor: positiveNumber(raw, "web_bearing_factor", 1.0),
    };
    if (input.endPlate.widthMm < input.secondary.widthMm) {
        throw new CalculationError(`End-plate width (${input.endPlate.widthMm} mm) must be >= secondary width (${input.secondary.widthMm} mm).`);
    }
    return input;
}
function parseDoubleSidedWebSection(raw, label) {
    const steelGrade = normalizeMomentSteelGrade(stringValue(raw, "steel_grade", "S355"));
    if (!EC3_MOMENT_STEEL_GRADES[steelGrade])
        throw new CalculationError(`Unsupported ${label} steel_grade '${steelGrade}'.`);
    return {
        profile: stringValue(raw, "profile", label),
        heightMm: positiveNumber(raw, "height_mm"),
        widthMm: positiveNumber(raw, "width_mm"),
        webThicknessMm: positiveNumber(raw, "web_thickness_mm"),
        flangeThicknessMm: positiveNumber(raw, "flange_thickness_mm"),
        rootRadiusMm: nonNegativeNumber(raw, "root_radius_mm", 0.0),
        steelGrade,
    };
}
function parseDoubleSidedSectionType(raw, profile) {
    if (raw.section_type === undefined)
        return DOUBLE_SIDED_CHANNEL_PROFILE.test(profile) ? "channel" : "i_section";
    const value = stringValue(raw, "section_type");
    if (value !== "i_section" && value !== "channel") {
        throw new CalculationError(`Unsupported secondary section_type '${value}'; use i_section or channel.`);
    }
    return value;
}
function parseDoubleSidedWebEndPlate(raw) {
    const steelGrade = normalizeMomentSteelGrade(stringValue(raw, "steel_grade", "S355"));
    if (!EC3_MOMENT_STEEL_GRADES[steelGrade])
        throw new CalculationError(`Unsupported end_plate steel_grade '${steelGrade}'.`);
    return {
        thicknessMm: positiveNumber(raw, "thickness_mm"),
        widthMm: positiveNumber(raw, "width_mm"),
        heightMm: positiveNumber(raw, "height_mm"),
        steelGrade,
    };
}
function parseDoubleSidedWebWelds(raw) {
    return {
        flangeThroatMm: positiveNumber(raw, "flange_throat_mm"),
        webThroatMm: positiveNumber(raw, "web_throat_mm"),
    };
}
function parseDoubleSidedWebBolts(raw) {
    const boltClass = normalizeMomentBoltClass(stringValue(raw, "bolt_class", "8.8"));
    if (!EC3_BOLT_CLASSES[boltClass])
        throw new CalculationError(`Unsupported bolt_class '${boltClass}'.`);
    const rows = arrayValue(raw, "rows").map((value, index) => {
        const row = ensureObject(value, `bolts.rows[${index}]`);
        return {
            rowId: positiveInteger(row, "row_id"),
            verticalPositionMm: positiveNumber(row, "vertical_position_mm"),
            numberOfBolts: positiveInteger(row, "number_of_bolts", 2),
        };
    });
    if (rows.length === 0)
        throw new CalculationError("At least one bolt row is required.");
    return {
        diameterMm: positiveNumber(raw, "diameter_mm"),
        boltClass,
        rows,
        horizontalSpacingMm: positiveNumber(raw, "horizontal_spacing_mm"),
        edgeDistanceHorizontalMm: positiveNumber(raw, "edge_distance_horizontal_mm"),
    };
}
function doubleSidedBoltArea(diameterMm) {
    return EC3_MOMENT_BOLT_AREAS[Math.round(diameterMm)] ?? 0.7854 * (diameterMm - 0.9382 * 1.25) ** 2;
}
function steelProps(steelGrade, label) {
    const material = EC3_MOMENT_STEEL_GRADES[steelGrade];
    if (!material)
        throw new CalculationError(`Unsupported ${label} steel_grade '${steelGrade}'.`);
    return material;
}
function doubleSidedCheck(component, capacity, load, note = "") {
    const utilization = capacity > TOL ? load / capacity : Infinity;
    return {
        component,
        capacity: round(capacity, 6),
        load: round(load, 6),
        utilization_ratio: round(utilization, 6),
        utilization_percent: round(utilization * 100.0, 1),
        status: utilization <= 1.0 ? "PASS" : "FAIL",
        note,
    };
}
const DOUBLE_SIDED_SECONDARY_FLANGE = "secondary flange in compression (b tf fy / gamma_M0)";
const DOUBLE_SIDED_PRIMARY_WEB = "primary web in compression (beff tw fy / gamma_M0)";
/**
 * Moment resistance of the double-sided web connection by EN 1993-1-8 6.2.7.2 with the shared end-plate
 * module: a beam_splice of the two secondary end plates with the primary web clamped between them (bolt
 * grip), the route's compression-side resistances and, for channels, no flange stiffening of the first row.
 */
function doubleSidedMomentResistance(input, primaryProps, secondaryProps, boltProps, boltAreaMm2) {
    if (input.loads.momentKnm <= TOL)
        return null;
    const secondary = input.secondary;
    if (input.endPlate.heightMm < secondary.heightMm) {
        throw new CalculationError(`End-plate height (${input.endPlate.heightMm} mm) must be at least the secondary height (${secondary.heightMm} mm) for the moment check (end plate welded to both flanges).`);
    }
    const seenIds = new Set();
    const seenPositions = new Set();
    for (const row of input.bolts.rows) {
        if (seenIds.has(row.rowId))
            throw new CalculationError(`Bolt row id ${row.rowId} is used more than once.`);
        if (seenPositions.has(row.verticalPositionMm)) {
            throw new CalculationError(`Two bolt rows share the vertical position ${row.verticalPositionMm} mm.`);
        }
        seenIds.add(row.rowId);
        seenPositions.add(row.verticalPositionMm);
    }
    const compressionAxisMm = secondary.flangeThicknessMm / 2.0;
    const tensionRows = input.bolts.rows
        .map((row) => ({ row, leverArmMm: row.verticalPositionMm - compressionAxisMm }))
        .filter((item) => item.leverArmMm > 0.0);
    if (tensionRows.length === 0)
        throw new CalculationError("At least one bolt row must be above the compression axis.");
    for (const { row } of tensionRows) {
        if (row.verticalPositionMm > secondary.heightMm) {
            throw new CalculationError(`Bolt row ${row.rowId} lies above the secondary beam (extended end plate). The route has no input for the end-plate position relative to the beam, so the edge distance ex of EN 1993-1-8 Table 6.6 is unknown; only rows between the secondary flanges are covered.`);
        }
    }
    // Compression side of the source script, unchanged.
    const secondaryFlangeCompressionN = secondary.widthMm * secondary.flangeThicknessMm * secondaryProps.fy_mpa / input.gammaM0;
    const effectiveWebCompressionWidthMm = Math.min(secondary.flangeThicknessMm +
        2.0 * Math.SQRT2 * input.welds.flangeThroatMm +
        5.0 * (input.primary.flangeThicknessMm + input.primary.rootRadiusMm) +
        2.0 * input.endPlate.thicknessMm, input.primary.widthMm);
    const primaryWebCompressionN = effectiveWebCompressionWidthMm * input.primary.webThicknessMm * primaryProps.fy_mpa / input.gammaM0;
    // Rows are measured from the outer face of the secondary compression flange. With the plate height taken as
    // the secondary height, the module uses the same origin; rows above the beam were rejected above, so the
    // real plate height does not enter the tension side.
    const spec = {
        joint: "beam_splice",
        beam: {
            heightMm: secondary.heightMm,
            widthMm: secondary.widthMm,
            webThicknessMm: secondary.webThicknessMm,
            flangeThicknessMm: secondary.flangeThicknessMm,
            rootRadiusMm: secondary.rootRadiusMm,
            steelGrade: secondary.steelGrade,
        },
        column: null,
        plate: {
            thicknessMm: input.endPlate.thicknessMm,
            widthMm: input.endPlate.widthMm,
            heightMm: secondary.heightMm,
            steelGrade: input.endPlate.steelGrade,
        },
        flangeWeldThroatMm: input.welds.flangeThroatMm,
        webWeldThroatMm: input.welds.webThroatMm,
        bolt: { diameterMm: input.bolts.diameterMm, tensileAreaMm2: boltAreaMm2, fubMpa: boltProps.fub_mpa },
        gaugeMm: input.bolts.horizontalSpacingMm,
        plateEdgeDistanceMm: input.bolts.edgeDistanceHorizontalMm,
        rows: input.bolts.rows,
        gammaM0: input.gammaM0,
        gammaM1: EC3_GAMMA_M1,
        gammaM2: input.gammaM2,
        pryingAllowed: true,
        doubleSided: true,
        packingThicknessMm: input.primary.webThicknessMm,
        extraCompressionLimits: [
            [DOUBLE_SIDED_SECONDARY_FLANGE, secondaryFlangeCompressionN],
            [DOUBLE_SIDED_PRIMARY_WEB, primaryWebCompressionN],
        ],
        tensionFlangeStiffensFirstRow: input.secondarySectionType === "i_section",
    };
    const joint = endPlateJoint(spec);
    const compressionLimitN = joint.compression.limitN;
    const compressionReductionFactor = joint.sumFtrUncappedN > 0.0 ? joint.sumFtrN / joint.sumFtrUncappedN : 1.0;
    let compressionGoverningComponent = null;
    const messages = [];
    if (joint.compression.rowsLimited) {
        messages.push(`Moment capacity governed by compression (${(compressionLimitN / 1000.0).toFixed(1)} kN)`);
        if (joint.compression.limitComponent === DOUBLE_SIDED_PRIMARY_WEB) {
            compressionGoverningComponent = "primary_web";
            messages.push("Critical: Primary Web Compression");
        }
        else {
            compressionGoverningComponent = "secondary_flange";
            messages.push("Critical: Secondary Beam Flange Compression");
        }
    }
    const momentResistanceKnm = joint.mjRdNmm / 1e6;
    const boltCount = input.bolts.rows.reduce((sum, row) => sum + row.numberOfBolts, 0);
    const shearPerBoltKn = input.loads.shearKn / boltCount;
    const denominator = tensionRows.reduce((sum, row) => sum + row.row.numberOfBolts * row.leverArmMm ** 2, 0.0);
    const boltForces = tensionRows.map((row) => {
        const rowTensionN = denominator > 0.0
            ? input.loads.momentKnm * 1e6 * (row.row.numberOfBolts * row.leverArmMm) / denominator
            : 0.0;
        const rowTensionKn = rowTensionN / 1000.0;
        return {
            row_id: row.row.rowId,
            tension_per_bolt_kn: round(rowTensionKn / row.row.numberOfBolts, 6),
            tension_row_kn: round(rowTensionKn, 6),
            lever_arm_mm: round(row.leverArmMm, 6),
            shear_per_bolt_kn: round(shearPerBoltKn, 6),
        };
    });
    return {
        momentResistanceKnm,
        compressionLimitN,
        compressionLimitComponent: joint.compression.limitComponent,
        compressionReductionFactor,
        effectiveWebCompressionWidthMm,
        secondaryFlangeCompressionN,
        primaryWebCompressionN,
        compressionGoverningComponent,
        messages,
        boltForces,
        joint,
        spec,
    };
}
function doubleSidedWarningCodes(checks, momentResult) {
    const warnings = [];
    if (momentResult && momentResult.joint.compression.rowsLimited) {
        warnings.push("COMPRESSION_REDUCTION_APPLIED");
        if (momentResult.compressionGoverningComponent === "secondary_flange")
            warnings.push("SECONDARY_FLANGE_COMPRESSION_GOVERNS");
        if (momentResult.compressionGoverningComponent === "primary_web")
            warnings.push("PRIMARY_WEB_COMPRESSION_GOVERNS");
    }
    if (momentResult) {
        if (momentResult.joint.triangularLimitApplied)
            warnings.push("TRIANGULAR_LIMIT_APPLIED");
        if (momentResult.joint.boltFailureGoverns)
            warnings.push("BOLT_FAILURE_GOVERNS");
        if (momentResult.joint.alpha && momentResult.joint.alpha.region === "below_chart")
            warnings.push("ALPHA_BELOW_4_45");
    }
    const failed = checks.filter((check) => check.status === "FAIL").map((check) => check.component);
    if (failed.includes("Bolt Shear"))
        warnings.push("BOLT_SHEAR_FAILED");
    if (failed.includes("Plate Bearing"))
        warnings.push("PLATE_BEARING_FAILED");
    if (failed.includes("Primary Web Bearing"))
        warnings.push("PRIMARY_WEB_BEARING_FAILED");
    if (failed.includes("Moment Resistance"))
        warnings.push("MOMENT_CHECK_FAILED");
    if (failed.length > 0)
        warnings.push("STRENGTH_CHECK_FAILED");
    return warnings;
}
/** Runs one of the three routes by its calculator id (API JSON input) and keeps the joint analysis. */
export function runEndPlateRoute(calculatorId, raw) {
    if (calculatorId === "ec3_bolted_moment_connection")
        return boltedMomentRoute(raw);
    if (calculatorId === "ec3_splice_moment_connection")
        return spliceRoute(raw);
    if (calculatorId === "ec3_double_sided_web_connection")
        return doubleSidedRoute(raw);
    throw new EndPlateRouteError(`Unknown end-plate route '${String(calculatorId)}'.`);
}
/** Runs one of the three routes by its calculator id; the response equals the API response body. */
export function calculateEndPlateRoute(calculatorId, raw) {
    return runEndPlateRoute(calculatorId, raw).response;
}
