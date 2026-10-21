/**
 * End-plate connection pages: input fields, validation and the design check shown on the page, for
 * three connection types that share the EN 1993-1-8 end-plate model of src/ec3_endplate.ts:
 *
 * - "column": bolted beam-to-column end plate (flush or extended), route bolted-moment-connection;
 * - "splice": end-plate beam splice (two identical plates), route splice-moment-connection;
 * - "web": double-sided beam-to-beam connection through the web of a primary beam, route
 *   double-sided-web-connection.
 *
 * The page input is flat (one field per value); it is converted to the API JSON of the route, and the
 * route result (identical to the structural API, see tests/endplate_parity.test.mjs) is shown as check
 * rows, intermediate values and the bolt-row table. Units: N, mm, MPa; actions in kN and kNm.
 */
import { CheckList, normaliseFields, summariseChecks } from "./checks.js";
import { EC3_BOLT_CLASSES, EC3_MOMENT_BOLT_AREAS, EndPlateRouteError, runEndPlateRoute } from "./endplate-routes.js";
/** Rolled sections (EN 10365 nominal dimensions): h, b, tw, tf, r in mm. */
export const SECTION_PROFILES = {
    IPE200: { h: 200, b: 100, tw: 5.6, tf: 8.5, r: 12, kind: "I" },
    IPE220: { h: 220, b: 110, tw: 5.9, tf: 9.2, r: 12, kind: "I" },
    IPE240: { h: 240, b: 120, tw: 6.2, tf: 9.8, r: 15, kind: "I" },
    IPE270: { h: 270, b: 135, tw: 6.6, tf: 10.2, r: 15, kind: "I" },
    IPE300: { h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15, kind: "I" },
    IPE330: { h: 330, b: 160, tw: 7.5, tf: 11.5, r: 18, kind: "I" },
    IPE360: { h: 360, b: 170, tw: 8, tf: 12.7, r: 18, kind: "I" },
    IPE400: { h: 400, b: 180, tw: 8.6, tf: 13.5, r: 21, kind: "I" },
    IPE450: { h: 450, b: 190, tw: 9.4, tf: 14.6, r: 21, kind: "I" },
    IPE500: { h: 500, b: 200, tw: 10.2, tf: 16, r: 21, kind: "I" },
    IPE550: { h: 550, b: 210, tw: 11.1, tf: 17.2, r: 24, kind: "I" },
    IPE600: { h: 600, b: 220, tw: 12, tf: 19, r: 24, kind: "I" },
    HEA160: { h: 152, b: 160, tw: 6, tf: 9, r: 15, kind: "I" },
    HEA180: { h: 171, b: 180, tw: 6, tf: 9.5, r: 15, kind: "I" },
    HEA200: { h: 190, b: 200, tw: 6.5, tf: 10, r: 18, kind: "I" },
    HEA220: { h: 210, b: 220, tw: 7, tf: 11, r: 18, kind: "I" },
    HEA240: { h: 230, b: 240, tw: 7.5, tf: 12, r: 21, kind: "I" },
    HEA260: { h: 250, b: 260, tw: 7.5, tf: 12.5, r: 24, kind: "I" },
    HEA280: { h: 270, b: 280, tw: 8, tf: 13, r: 24, kind: "I" },
    HEA300: { h: 290, b: 300, tw: 8.5, tf: 14, r: 27, kind: "I" },
    HEA320: { h: 310, b: 300, tw: 9, tf: 15.5, r: 27, kind: "I" },
    HEA340: { h: 330, b: 300, tw: 9.5, tf: 16.5, r: 27, kind: "I" },
    HEA360: { h: 350, b: 300, tw: 10, tf: 17.5, r: 27, kind: "I" },
    HEA400: { h: 390, b: 300, tw: 11, tf: 19, r: 27, kind: "I" },
    HEA450: { h: 440, b: 300, tw: 11.5, tf: 21, r: 27, kind: "I" },
    HEA500: { h: 490, b: 300, tw: 12, tf: 23, r: 27, kind: "I" },
    HEB160: { h: 160, b: 160, tw: 8, tf: 13, r: 15, kind: "I" },
    HEB180: { h: 180, b: 180, tw: 8.5, tf: 14, r: 15, kind: "I" },
    HEB200: { h: 200, b: 200, tw: 9, tf: 15, r: 18, kind: "I" },
    HEB220: { h: 220, b: 220, tw: 9.5, tf: 16, r: 18, kind: "I" },
    HEB240: { h: 240, b: 240, tw: 10, tf: 17, r: 21, kind: "I" },
    HEB260: { h: 260, b: 260, tw: 10, tf: 17.5, r: 24, kind: "I" },
    HEB280: { h: 280, b: 280, tw: 10.5, tf: 18, r: 24, kind: "I" },
    HEB300: { h: 300, b: 300, tw: 11, tf: 19, r: 27, kind: "I" },
    HEB320: { h: 320, b: 300, tw: 11.5, tf: 20.5, r: 27, kind: "I" },
    HEB340: { h: 340, b: 300, tw: 12, tf: 21.5, r: 27, kind: "I" },
    HEB360: { h: 360, b: 300, tw: 12.5, tf: 22.5, r: 27, kind: "I" },
    HEB400: { h: 400, b: 300, tw: 13.5, tf: 24, r: 27, kind: "I" },
    HEB450: { h: 450, b: 300, tw: 14, tf: 26, r: 27, kind: "I" },
    HEB500: { h: 500, b: 300, tw: 14.5, tf: 28, r: 27, kind: "I" },
    UPN160: { h: 160, b: 65, tw: 7.5, tf: 10.5, r: 10.5, kind: "U" },
    UPN180: { h: 180, b: 70, tw: 8, tf: 11, r: 11, kind: "U" },
    UPN200: { h: 200, b: 75, tw: 8.5, tf: 11.5, r: 11.5, kind: "U" },
    UPN220: { h: 220, b: 80, tw: 9, tf: 12.5, r: 12.5, kind: "U" },
    UPN240: { h: 240, b: 85, tw: 9.5, tf: 13, r: 13, kind: "U" },
    UPN260: { h: 260, b: 90, tw: 10, tf: 14, r: 14, kind: "U" },
    UPN280: { h: 280, b: 95, tw: 10, tf: 15, r: 15, kind: "U" },
    UPN300: { h: 300, b: 100, tw: 10, tf: 16, r: 16, kind: "U" },
};
const names = (prefix) => Object.keys(SECTION_PROFILES).filter(name => name.startsWith(prefix));
const CUSTOM = "custom";
const GRADES = ["S235", "S275", "S355", "S420", "S460"];
const BOLT_SIZES = Object.keys(EC3_MOMENT_BOLT_AREAS).map(d => `M${d}`);
const BOLT_CLASS_NAMES = Object.keys(EC3_BOLT_CLASSES);
const ROW_COUNTS = ["1", "2", "3", "4", "5", "6"];
export const MAX_BOLT_ROWS = 6;
const BEAM = { profile: "beamProfile", h: "hb", b: "bb", tw: "twb", tf: "tfb", r: "rb", grade: "beamGrade" };
const COLUMN = { profile: "columnProfile", h: "hc", b: "bc", tw: "twc", tf: "tfc", r: "rc", grade: "columnGrade" };
const PRIMARY = { profile: "primaryProfile", h: "hpr", b: "bpr", tw: "twpr", tf: "tfpr", r: "rpr", grade: "primaryGrade" };
function sectionFields(group, names_, options, example, grade, what) {
    const p = SECTION_PROFILES[example];
    const custom = { [names_.profile]: [CUSTOM] };
    return [
        { name: names_.profile, group, label: `${what} section`, unit: "", kind: "select", options: [...options, CUSTOM], default: example },
        { name: names_.h, group, label: "<b>h</b> — depth", unit: "mm", kind: "number", min: 80, max: 1200, default: p.h, showIf: custom },
        { name: names_.b, group, label: "<b>b</b> — flange width", unit: "mm", kind: "number", min: 40, max: 500, default: p.b, showIf: custom },
        { name: names_.tw, group, label: "<b>t<sub>w</sub></b> — web thickness", unit: "mm", kind: "number", min: 3, max: 60, default: p.tw, showIf: custom },
        { name: names_.tf, group, label: "<b>t<sub>f</sub></b> — flange thickness", unit: "mm", kind: "number", min: 3, max: 80, default: p.tf, showIf: custom },
        { name: names_.r, group, label: "<b>r</b> — root radius", unit: "mm", kind: "number", min: 0, max: 60, default: p.r, showIf: custom },
        { name: names_.grade, group, label: "Steel grade (EN 10025-2)", unit: "", kind: "select", options: GRADES, default: grade },
    ];
}
function rowFields(group, positions, from) {
    const fields = [
        { name: "rowCount", group, label: "Number of bolt rows (two bolts per row)", unit: "", kind: "select", options: ROW_COUNTS, default: String(positions.length) },
    ];
    for (let i = 1; i <= MAX_BOLT_ROWS; i++) {
        fields.push({
            name: `y${i}`, group, label: `<b>y<sub>${i}</sub></b> — row ${i}${i === 1 ? " (top)" : ""} above ${from}`, unit: "mm", kind: "number", min: 1, max: 3000,
            ...(positions[i - 1] !== undefined ? { default: positions[i - 1] } : {}),
            showIf: { rowCount: ROW_COUNTS.slice(i - 1) },
        });
    }
    return fields;
}
const PLATE_GROUP = "End plate and welds";
const BOLT_GROUP = "Bolts";
const ROW_GROUP = "Bolt rows";
const ACTIONS = "Design actions";
const FACTORS = "Partial factors and options";
function plateFields(tp, bp, hp, grade, af, aw, hpNote) {
    return [
        { name: "tp", group: PLATE_GROUP, label: "<b>t<sub>p</sub></b> — plate thickness", unit: "mm", kind: "number", min: 5, max: 80, default: tp },
        { name: "bp", group: PLATE_GROUP, label: "<b>b<sub>p</sub></b> — plate width", unit: "mm", kind: "number", min: 40, max: 800, default: bp },
        { name: "hp", group: PLATE_GROUP, label: `<b>h<sub>p</sub></b> — plate height${hpNote}`, unit: "mm", kind: "number", min: 80, max: 2000, default: hp },
        { name: "plateGrade", group: PLATE_GROUP, label: "Plate steel grade", unit: "", kind: "select", options: GRADES, default: grade },
        { name: "af", group: PLATE_GROUP, label: "<b>a<sub>f</sub></b> — flange weld throat", unit: "mm", kind: "number", min: 1, max: 30, default: af },
        { name: "aw", group: PLATE_GROUP, label: "<b>a<sub>w</sub></b> — web weld throat", unit: "mm", kind: "number", min: 1, max: 30, default: aw },
    ];
}
function boltFields(size, boltClass, w, e) {
    return [
        { name: "boltSize", group: BOLT_GROUP, label: "Bolt size", unit: "", kind: "select", options: BOLT_SIZES, default: size },
        { name: "boltClass", group: BOLT_GROUP, label: "Bolt class", unit: "", kind: "select", options: BOLT_CLASS_NAMES, default: boltClass },
        { name: "w", group: BOLT_GROUP, label: "<b>w</b> — gauge (bolt spacing across the plate)", unit: "mm", kind: "number", min: 20, max: 600, default: w },
        { name: "e", group: BOLT_GROUP, label: "<b>e</b> — bolt axis to the plate side", unit: "mm", kind: "number", min: 5, max: 300, default: e },
    ];
}
const gamma = (name, label, value) => ({ name, group: FACTORS, label: `<b>${label}</b> (recommended value)`, unit: "—", kind: "number", min: 1, max: 2, default: value, fallback: true });
/** Fields of the beam-to-column page; page example: HEA300 column / IPE500 beam at M_Ed = 150 kNm. */
export const ENDPLATE_COLUMN_FIELDS = [
    ...sectionFields("Column (continuous, unstiffened)", COLUMN, [...names("HEA"), ...names("HEB"), ...names("IPE")], "HEA300", "S355", "Column"),
    ...sectionFields("Beam", BEAM, [...names("IPE"), ...names("HEA"), ...names("HEB")], "IPE500", "S355", "Beam"),
    ...plateFields(20, 200, 530, "S355", 8, 5, " (beam centred on it)"),
    ...boltFields("M20", "8.8", 100, 50),
    { name: "eTop", group: BOLT_GROUP, label: "<b>e<sub>top</sub></b> — top row to the plate top", unit: "mm", kind: "number", min: 1, max: 1000, default: 91 },
    { name: "eBottom", group: BOLT_GROUP, label: "<b>e<sub>bottom</sub></b> — lowest row to the plate bottom", unit: "mm", kind: "number", min: 1, max: 2000, default: 349 },
    ...rowFields(ROW_GROUP, [439, 349], "the plate's lower edge"),
    { name: "MEd", group: ACTIONS, label: "<b>M<sub>j,Ed</sub></b> — moment (hogging: beam top flange in tension)", unit: "kNm", kind: "number", min: -1e5, max: 1e5, default: 150 },
    { name: "VEd", group: ACTIONS, label: "<b>V<sub>Ed</sub></b> — beam shear (warning only)", unit: "kN", kind: "number", min: -1e5, max: 1e5, default: 150 },
    { name: "NEd", group: ACTIONS, label: "<b>N<sub>Ed</sub></b> — beam axial force (not combined)", unit: "kN", kind: "number", min: -1e5, max: 1e5, default: 0 },
    { name: "side", group: FACTORS, label: "Joint configuration", unit: "", kind: "select", options: ["single-sided", "double-sided"], default: "single-sided" },
    { name: "prying", group: FACTORS, label: "Prying forces can develop (Table 6.2 with L<sub>b</sub> ≤ L<sub>b</sub>*)", unit: "", kind: "checkbox", default: true },
    gamma("gammaM0", "γ<sub>M0</sub>", 1.0), gamma("gammaM1", "γ<sub>M1</sub>", 1.0), gamma("gammaM2", "γ<sub>M2</sub>", 1.25),
];
/** Fields of the splice page; the example is the API fixture "splice sample" (IPE400, extended). */
export const ENDPLATE_SPLICE_FIELDS = [
    ...sectionFields("Beam (both sides)", BEAM, [...names("IPE"), ...names("HEA"), ...names("HEB")], "IPE400", "S355", "Beam"),
    ...plateFields(20, 200, 560, "S355", 8, 5, " (each plate, beam centred on it)"),
    ...boltFields("M20", "8.8", 100, 50),
    { name: "eTop", group: BOLT_GROUP, label: "<b>e<sub>top</sub></b> — top row to the plate top", unit: "mm", kind: "number", min: 1, max: 1000, default: 40 },
    { name: "eBottom", group: BOLT_GROUP, label: "<b>e<sub>bottom</sub></b> — lowest row to the plate bottom", unit: "mm", kind: "number", min: 1, max: 2000, default: 40 },
    ...rowFields(ROW_GROUP, [520, 411.5, 148.5, 40], "the plate's lower edge"),
    { name: "MEd", group: ACTIONS, label: "<b>M<sub>j,Ed</sub></b> — moment (top flange in tension)", unit: "kNm", kind: "number", min: -1e5, max: 1e5, default: 180 },
    { name: "VEd", group: ACTIONS, label: "<b>V<sub>Ed</sub></b> — shear (warning only)", unit: "kN", kind: "number", min: -1e5, max: 1e5, default: 100 },
    { name: "NEd", group: ACTIONS, label: "<b>N<sub>Ed</sub></b> — axial force (not combined)", unit: "kN", kind: "number", min: -1e5, max: 1e5, default: 0 },
    gamma("gammaM0", "γ<sub>M0</sub>", 1.0), gamma("gammaM1", "γ<sub>M1</sub>", 1.0), gamma("gammaM2", "γ<sub>M2</sub>", 1.25),
];
/** Fields of the double-sided web page; the example is the API hand case D1 (IPE300 on an IPE500 web). */
export const ENDPLATE_WEB_FIELDS = [
    ...sectionFields("Primary beam (its web is clamped)", PRIMARY, [...names("IPE"), ...names("HEA"), ...names("HEB")], "IPE500", "S355", "Primary"),
    ...sectionFields("Secondary beams (identical, both sides)", BEAM, [...names("IPE"), ...names("UPN"), ...names("HEA")], "IPE300", "S355", "Secondary"),
    { name: "sectionType", group: "Secondary beams (identical, both sides)", label: "Section type of the secondary", unit: "", kind: "select", options: ["from the profile name", "I-section", "channel"], default: "from the profile name" },
    ...plateFields(15, 150, 300, "S355", 6, 4, " (at least the secondary depth)"),
    ...boltFields("M20", "8.8", 90, 30),
    ...rowFields(ROW_GROUP, [250, 190], "the secondary's compression-flange face"),
    { name: "MEd", group: ACTIONS, label: "<b>M<sub>Ed</sub></b> — moment on each side (balanced)", unit: "kNm", kind: "number", min: 0, max: 1e5, default: 80 },
    { name: "VEd", group: ACTIONS, label: "<b>V<sub>Ed</sub></b> — shear on each side", unit: "kN", kind: "number", min: 0, max: 1e5, default: 100 },
    { name: "webBearingFactor", group: FACTORS, label: "Load factor on V<sub>Ed</sub> for primary-web bearing (2: both sides push the same way)", unit: "—", kind: "number", min: 1, max: 2, default: 1, fallback: true },
    gamma("gammaM0", "γ<sub>M0</sub>", 1.0), gamma("gammaM2", "γ<sub>M2</sub>", 1.25),
];
export const ENDPLATE_TYPES = {
    column: { title: "Beam-to-column end plate", routeId: "ec3_bolted_moment_connection", fields: ENDPLATE_COLUMN_FIELDS },
    splice: { title: "End-plate beam splice", routeId: "ec3_splice_moment_connection", fields: ENDPLATE_SPLICE_FIELDS },
    web: { title: "Double-sided connection to a beam web", routeId: "ec3_double_sided_web_connection", fields: ENDPLATE_WEB_FIELDS },
};
function sectionOf(values, n) {
    const profile = String(values[n.profile]);
    const grade = String(values[n.grade]);
    const table = SECTION_PROFILES[profile];
    if (table)
        return { profile, ...table, grade };
    return { profile: CUSTOM, h: Number(values[n.h]), b: Number(values[n.b]), tw: Number(values[n.tw]), tf: Number(values[n.tf]), r: Number(values[n.r]), grade, kind: "I" };
}
const apiSection = (s) => ({ profile: s.profile, height_mm: s.h, width_mm: s.b, web_thickness_mm: s.tw, flange_thickness_mm: s.tf, root_radius_mm: s.r, steel_grade: s.grade });
/** Validates the page input of one connection type and builds the API JSON of its route. */
export function normaliseEndPlateInput(type, raw) {
    const spec = ENDPLATE_TYPES[type];
    if (!spec)
        return { ok: false, errors: [`Unknown connection type ${String(type)}`] };
    const checked = normaliseFields(raw, spec.fields);
    if (!checked.ok)
        return checked;
    const v = checked.values;
    const beam = sectionOf(v, BEAM);
    const column = type === "column" ? sectionOf(v, COLUMN) : null;
    const primary = type === "web" ? sectionOf(v, PRIMARY) : null;
    const count = Number(v.rowCount);
    const rows = Array.from({ length: count }, (_, i) => ({ id: i + 1, y: Number(v[`y${i + 1}`]) }));
    const diameter = Number(String(v.boltSize).slice(1));
    const plate = { thickness_mm: v.tp, width_mm: v.bp, height_mm: v.hp, steel_grade: v.plateGrade };
    const welds = { flange_throat_mm: v.af, web_throat_mm: v.aw };
    const apiRows = rows.map(row => ({ row_id: row.id, vertical_position_mm: row.y, number_of_bolts: 2 }));
    let api;
    if (type === "web") {
        const sectionType = v.sectionType === "I-section" ? { section_type: "i_section" } : v.sectionType === "channel" ? { section_type: "channel" } : {};
        api = {
            project_name: "End-plate page",
            primary: apiSection(primary),
            secondary: { ...apiSection(beam), ...sectionType },
            end_plate: plate, welds,
            bolts: { diameter_mm: diameter, bolt_class: v.boltClass, rows: apiRows, horizontal_spacing_mm: v.w, edge_distance_horizontal_mm: v.e },
            loads: { moment_knm: v.MEd, shear_kn: v.VEd },
            gamma_m0: v.gammaM0, gamma_m2: v.gammaM2, web_bearing_factor: v.webBearingFactor,
        };
    }
    else {
        api = {
            ...(column ? { column: apiSection(column) } : {}),
            beam: apiSection(beam),
            end_plate: plate, welds,
            bolts: {
                diameter_mm: diameter, bolt_class: v.boltClass, rows: apiRows, horizontal_spacing_mm: v.w, edge_distance_horizontal_mm: v.e,
                edge_distance_vertical_top_mm: v.eTop, edge_distance_vertical_bottom_mm: v.eBottom,
            },
            loads: { moment_knm: v.MEd, shear_kn: v.VEd, axial_kn: v.NEd },
            gamma_m0: v.gammaM0, gamma_m1: v.gammaM1, gamma_m2: v.gammaM2,
            ...(type === "column" ? { connection_type: v.side === "double-sided" ? "double_sided" : "single_sided", include_prying_action: v.prying } : {}),
        };
    }
    return { ok: true, input: { type, values: v, beam, column, primary, rows, api } };
}
const WARNING_TEXT = {
    TRIANGULAR_LIMIT_APPLIED: ["A row with F<sub>tr,Rd</sub> > 1.9 F<sub>t,Rd</sub> limits the rows below it to a triangular distribution", "ok"],
    BOLT_FAILURE_GOVERNS: ["Bolt fracture (mode 3) governs a row: the joint is not ductile", "warning"],
    ALPHA_BELOW_4_45: ["α of Figure 6.11 below the chart (4.45): closed form continued to the unstiffened value", "warning"],
    BEAM_SHEAR_ABOVE_HALF_VPL: ["Beam shear above 0.5 V<sub>pl,Rd</sub>: the beam resistances are not reduced for shear here", "warning"],
    COMPRESSION_SIDE_LIMITS_ROWS: ["The compression side limits the lower rows", "ok"],
    COMPRESSION_FLANGE_GOVERNS: ["The beam flange in compression limits the lower rows", "ok"],
    COMPRESSION_REDUCTION_APPLIED: ["The compression side limits the lower rows", "ok"],
    DOUBLE_SIDED_STIFFNESS_ASSUMPTION: ["Double-sided: β = 1 is kept; moments of opposite sign need a separate web-panel check (Table 5.4)", "warning"],
};
/** Runs the route for the page input and returns the checks, values and notes of the page. */
export function checkEndPlate(input) {
    const routeId = ENDPLATE_TYPES[input.type].routeId;
    const run = runEndPlateRoute(routeId, input.api);
    const r = run.response.result;
    const checks = new CheckList();
    const kN = 1000;
    const holeDiameter = r.bolt_hole_diameter_mm ?? r.hole_diameter_mm;
    if (input.type === "web") {
        checks.setGroup("Shear (source-script checks, unchanged from the API)");
        for (const check of r.checks) {
            if (check.component === "Moment Resistance")
                continue;
            const label = check.component === "Bolt Shear" ? "Bolt shear, all bolts" : check.component === "Plate Bearing" ? "Bearing on the end plate, α<sub>b</sub> = 0.5" : "Bearing on the primary web";
            checks.resistance(check.component, label, check.load * kN, check.capacity * kN, "N", check.component === "Bolt Shear" ? "EN 1993-1-8 Table 3.4" : "EN 1993-1-8 Table 3.4 (simplified)", check.note || undefined);
        }
        checks.setGroup("Moment — EN 1993-1-8 6.2.7.2");
        const moment = r.checks.find(check => check.component === "Moment Resistance");
        if (moment)
            checks.resistance("moment", "Moment resistance M<sub>j,Rd</sub> = Σ F<sub>tr,Rd</sub> h<sub>r</sub>", moment.load, moment.capacity, "kNm", "EN 1993-1-8 6.2.7.2 (6.25)");
        else
            checks.info("moment", "No moment: the moment check is not made", "ok", "—");
        if (r.compression_limit_kn !== null) {
            checks.info("compression", `Compression side: ${r.compression_limit_component}, ${Number(r.compression_limit_kn).toFixed(1)} kN`, "ok", "6.2.7.2(7)");
        }
    }
    else {
        checks.setGroup("Moment — EN 1993-1-8 6.2.7.2");
        for (const check of r.component_checks) {
            const unitN = check.unit === "kN";
            const label = check.key === "joint_moment" || check.component === "Moment Resistance" ? "Moment resistance M<sub>j,Rd</sub> = Σ F<sub>tr,Rd</sub> h<sub>r</sub>"
                : check.key === "column_web_panel_shear" ? "Column web panel in shear, M<sub>Ed</sub>/z<sub>eq</sub> ≤ V<sub>wp,Rd</sub> (β = 1)"
                    : check.key === "column_web_compression" ? "Column web in compression, M<sub>Ed</sub>/z<sub>eq</sub> ≤ F<sub>c,wc,Rd</sub>"
                        : input.type === "splice" ? "Beam flange and web in compression, Σ F<sub>tr,Rd</sub> ≤ F<sub>c,fb,Rd</sub>"
                            : "Beam flange and web in compression, M<sub>Ed</sub>/z<sub>eq</sub> ≤ F<sub>c,fb,Rd</sub>";
            checks.resistance(check.key ?? check.component, label, unitN ? check.applied * kN : check.applied, unitN ? check.resistance * kN : check.resistance, unitN ? "N" : "kNm", check.clause.replace("EN 1993-1-8, ", "EN 1993-1-8 "));
        }
        checks.setGroup("Detailing — EN 1993-1-8 Table 3.3 and 4.5.2");
        for (const g of r.geometry_checks) {
            const failStatus = g.status === "FAIL" || (input.type === "splice" && g.key !== "flange_weld") ? "fail" : "warning";
            const label = g.name.replace("Horiz Edge Dist", "Bolt axis to the plate side e ≥ 1.2 d<sub>0</sub>").replace("Horiz Spacing", "Gauge w ≥ 2.2 d<sub>0</sub>")
                .replace("Flange Weld", "Flange weld throat ≥ 0.5 √t<sub>f</sub> (recommendation)").replace(/^Vert Spacing R(\d+)-R(\d+)$/, "Row pitch, rows $1–$2, ≥ 2.2 d<sub>0</sub>");
            if (g.comparison === "<=")
                checks.maximum(g.key, label, g.provided_mm, g.required_mm, "mm", g.clause, failStatus);
            else
                checks.minimum(g.key, label, g.provided_mm, g.required_mm, "mm", g.clause, failStatus);
        }
    }
    const warningCodes = r.warning_codes ?? [];
    const shown = warningCodes.filter(code => WARNING_TEXT[code]);
    if (shown.length) {
        checks.setGroup("Method notes");
        for (const code of shown)
            checks.info(code, WARNING_TEXT[code][0], WARNING_TEXT[code][1], "EN 1993-1-8");
    }
    const res = r.resistance;
    const values = [];
    if (res) {
        values.push({ title: "Bolts and end plate", rows: [
                { label: `F<sub>t,Rd</sub> = 0.9 f<sub>ub</sub> A<sub>s</sub> / γ<sub>M2</sub> per bolt (${input.values.boltSize} ${input.values.boltClass})`, value: res.bolt_tension_rd_per_bolt_kn, unit: "kN" },
                { label: "L<sub>b</sub> — bolt elongation length (grip + washers + (head + nut)/2)", value: res.lb_mm, unit: "mm" },
                { label: "End plate: m = (w − t<sub>w</sub>)/2 − 0.8 a<sub>w</sub>√2; e; n = min(e, 1.25 m)", value: `${res.end_plate.m_mm.toFixed(1)}; ${res.end_plate.e_mm.toFixed(1)}; ${res.end_plate.n_mm.toFixed(1)}`, unit: "mm" },
                { label: "End plate f<sub>y</sub> (EN 1993-1-1 Table 3.1)", value: res.end_plate.fy_mpa, unit: "MPa", digits: 0 },
                ...(res.column_flange ? [{ label: "Column flange: m = (w − t<sub>wc</sub>)/2 − 0.8 r<sub>c</sub>; e; n", value: `${res.column_flange.m_mm.toFixed(1)}; ${res.column_flange.e_mm.toFixed(1)}; ${res.column_flange.n_mm.toFixed(1)}`, unit: "mm" }] : []),
                ...(res.alpha ? [{ label: `α (Figure 6.11) at λ<sub>1</sub> = ${res.alpha.lambda_1.toFixed(3)}, λ<sub>2</sub> = ${res.alpha.lambda_2.toFixed(3)}${res.alpha.region === "capped_at_8" ? " (α = 8)" : ""}`, value: res.alpha.alpha, unit: "—", digits: 3 }] : []),
            ] });
        values.push({ title: "Compression side and moment", rows: [
                ...(res.vwp_rd_kn !== null ? [{ label: "V<sub>wp,Rd</sub> — column web panel in shear (β = 1)", value: res.vwp_rd_kn, unit: "kN" }] : []),
                ...(res.fc_wc_rd_kn !== null ? [{ label: `F<sub>c,wc,Rd</sub> — column web in compression (b<sub>eff,c,wc</sub> = ${Number(res.beff_c_wc_mm).toFixed(0)} mm)`, value: res.fc_wc_rd_kn, unit: "kN" }] : []),
                { label: `F<sub>c,fb,Rd</sub> = M<sub>c,Rd</sub>/(h − t<sub>f</sub>) — beam flange and web, class ${res.beam_section_class}`, value: res.fc_fb_rd_kn, unit: "kN" },
                { label: `Compression limit: ${res.compression_limit_component}`, value: res.compression_limit_kn, unit: "kN" },
                { label: "Σ F<sub>tr,Rd</sub> (with / without the compression limit)", value: `${Number(res.sum_ftr_rd_kn).toFixed(1)} / ${Number(res.sum_ftr_rd_without_compression_limit_kn).toFixed(1)}`, unit: "kN" },
                { label: "M<sub>j,Rd</sub> = Σ F<sub>tr,Rd</sub> h<sub>r</sub>", value: res.mj_rd_knm, unit: "kNm", digits: 2 },
                ...(r.sj_ini_knm_per_rad !== undefined ? [{ label: "S<sub>j,ini</sub> (6.3.1, Table 6.11); z<sub>eq</sub>", value: `${Number(r.sj_ini_knm_per_rad).toFixed(0)} kNm/rad; ${Number(r.z_eq_mm).toFixed(1)} mm`, unit: "" }] : []),
            ] });
        const perRow = res.per_row ?? [];
        values.push({ title: "Tension rows — EN 1993-1-8 6.2.7.2", rows: perRow.map(row => ({
                label: `Row ${row.row_id} (${row.location}): y = ${Number(row.vertical_position_mm).toFixed(1)} mm; h = ${Number(row.lever_arm_mm).toFixed(1)} mm; individual ${Number(row.ft_rd_individual_kn).toFixed(2)} kN (${row.individual_governing_component}); effective row governed by ${row.governing_component}`,
                value: row.ftr_rd_kn,
                unit: "kN",
                digits: 2,
            })) });
        const groups = res.groups ?? [];
        values.push({ title: "Row groups — EN 1993-1-8 Tables 6.4 / 6.6", rows: groups.map(group => ({
                label: `${group.component}, rows ${group.row_ids.join(" + ")}: l<sub>eff,cp</sub> = ${Number(group.leff_cp_mm).toFixed(1)} mm; l<sub>eff,nc</sub> = ${Number(group.leff_nc_mm).toFixed(1)} mm; l<sub>eff,1</sub> = ${Number(group.leff_1_mm).toFixed(1)} mm; l<sub>eff,2</sub> = ${Number(group.leff_2_mm).toFixed(1)} mm${group.governing_mode ? `; mode ${group.governing_mode}` : ""}`,
                value: group.ft_rd_kn,
                unit: "kN",
                digits: 2,
            })) });
    }
    const notes = [...(run.response.assumptions ?? [])];
    notes.push("Ported from the EA Suys structural API (formula version ea-suys-structural-formulas-2026-10-20.5): same inputs, results and scope rejections.");
    notes.push("Partial factors default to the EN 1993-1-1 / EN 1993-1-8 recommended values (γM0 = γM1 = 1.0, γM2 = 1.25); the National Annex may differ.");
    const rows = checks.rows;
    return {
        checks: rows, values, notes, ...summariseChecks(rows),
        type: input.type, routeId, route: r, joint: run.joint, spec: run.spec,
        boltHoleDiameter: holeDiameter,
        centreOfCompression: res ? (r.center_of_compression_mm ?? (input.type === "web" ? input.beam.tf / 2 : null)) : null,
    };
}
/** Normalise and check in one call; route rejections are returned as input errors. */
export function evaluateEndPlatePage(type, raw) {
    const normalised = normaliseEndPlateInput(type, raw);
    if (!normalised.ok)
        return normalised;
    try {
        return { ok: true, input: normalised.input, result: checkEndPlate(normalised.input) };
    }
    catch (error) {
        if (error instanceof EndPlateRouteError)
            return { ok: false, errors: [error.message], scope: true };
        throw error;
    }
}
