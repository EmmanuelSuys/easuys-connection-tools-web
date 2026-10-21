/**
 * Timber-to-timber moment joint: compression by contact, tension by screws crossing the interface (one bending
 * axis, ULS). Port of TimberContactMomentJoint/timber_contact_moment_joint_uls.py (EA_Suys0 scripts) and the
 * structural API route /calculate/ec5/timber-contact-moment-joint, same model:
 *
 * - contact: rectangular plastic block at f_c,a,d = f_c,0,d / (cos²a + sin²a f_c,0,d / (k_c,90 f_c,90,d))
 *   (EN 1995-1-1 (6.16)), the lower of the two members;
 * - screws: tension only, elastic-plastic, F_i = min(k_ax,i (y_i - x_n) lambda, R_d,i n_act^0.9 / n_act) with the
 *   axial resistance of EN 1995-1-1 8.7.2 per screw (axial-screw.ts, incl. the k_d correction) and gamma_M = 1.3;
 * - capacity: full-range scan followed by local refinement around the best neutral-axis position. Refinement stops
 *   only when both the position and moment tolerances are met; reaching the iteration cap fails the check.
 *   lambda is solved exactly by enumerating its piecewise-linear breakpoints.
 *
 * Correction against the source: for M_Ed < 0 the source added the screw moments with the wrong sign
 * (F y_i sign instead of F y_i' in the mirrored coordinates); here both signs use the mirrored coordinates, so a
 * symmetric joint has the same M_Rd for +M and -M.
 *
 * Sign convention: N_Ed > 0 tension; M_Ed > 0 puts the screws at positive y in tension; y from the interface
 * centroid. Input forces kN and kNm, everything else N, mm, MPa.
 */
import { CheckList, normaliseFields, summariseChecks } from "./checks.js";
import { LOAD_DURATIONS, kmodOf } from "./eurocode-data.js";
import { GAMMA_M_CONNECTIONS, screwAxialCharacteristic } from "./axial-screw.js";
/** EN 338:2016 (solid) and EN 14080:2013 (glulam): f_c,0,k, f_c,90,k, rho_k; gamma_M of EN 1995-1-1 Table 2.3. */
export const JOINT_GRADES = {
    C24: { kind: "solid", fc0k: 21, fc90k: 2.5, rhoK: 350, gammaM: 1.3 },
    C27: { kind: "solid", fc0k: 22, fc90k: 2.6, rhoK: 370, gammaM: 1.3 },
    GL24h: { kind: "glulam", fc0k: 24, fc90k: 2.5, rhoK: 385, gammaM: 1.25 },
    GL28h: { kind: "glulam", fc0k: 28, fc90k: 2.5, rhoK: 425, gammaM: 1.25 }
};
const TOL = 1e-9;
/** Joint refusals of the source (lef >= 6d, 30 <= alpha <= 90, |y| <= h/2, f_ax,k route). */
export function contactJointRefusals(spec) {
    const errors = [];
    if (!spec.screws.length)
        errors.push("at least one screw row is required");
    for (const screw of spec.screws) {
        if (Math.abs(screw.y) > spec.height / 2 + TOL)
            errors.push(`screw ${screw.id}: y = ${screw.y} mm lies outside the interface (±${spec.height / 2} mm)`);
        if (screw.d1 >= screw.d)
            errors.push(`screw ${screw.id}: d1 must be smaller than d = ${screw.d} mm`);
        if (screw.lef < 6 * screw.d)
            errors.push(`screw ${screw.id}: lef = ${screw.lef} mm is below 6d = ${6 * screw.d} mm`);
        if (screw.alpha < 30 || screw.alpha > 90)
            errors.push(`screw ${screw.id}: alpha must lie between 30 and 90 degrees`);
        if (screw.faxK === undefined) {
            try {
                screwAxialCharacteristic({ ...screw, rhoK: JOINT_GRADES[spec.grade].rhoK });
            }
            catch (error) {
                errors.push(`screw ${screw.id}: faxK is required: ${error.message}`);
            }
        }
    }
    for (const [name, angle] of [["angle1", spec.angle1], ["angle2", spec.angle2]])
        if (angle < 0 || angle > 90)
            errors.push(`${name} must lie between 0° and 90°`);
    return errors;
}
/** EN 1995-1-1 (6.16): design compressive strength at an angle to the grain, MPa. */
export function compressionAtAngle(fc0d, fc90d, angleDeg, kc90) {
    const a = angleDeg * Math.PI / 180;
    return fc0d / (Math.cos(a) ** 2 + Math.sin(a) ** 2 * fc0d / (kc90 * fc90d));
}
/** Exact solution of sum min(s_i lambda, c_i) = T (piecewise linear, monotone), T in [0, sum c_i]. */
export function solveScrewLambda(T, stiffness, capacity) {
    if (T <= TOL)
        return { lambda: 0, forces: stiffness.map(() => 0) };
    const order = stiffness.map((s, i) => ({ i, at: s > TOL ? capacity[i] / s : Infinity })).sort((p, q) => p.at - q.at);
    let yielded = 0;
    let slope = stiffness.reduce((sum, s) => sum + (s > TOL ? s : 0), 0);
    let lambda = 0;
    for (const { i, at } of order) {
        if (!Number.isFinite(at))
            break;
        // total at the next breakpoint
        if (yielded + slope * at >= T)
            break;
        yielded += capacity[i];
        slope -= stiffness[i];
        lambda = at;
    }
    lambda = slope > 0 ? Math.max(lambda, (T - yielded) / slope) : lambda;
    return { lambda, forces: stiffness.map((s, i) => Math.min(s * lambda, capacity[i])) };
}
function evaluateState(c, spec, screws, fc, sign) {
    const half = spec.height / 2;
    const depth = Math.max(0, Math.min(spec.height, c + half));
    const C = fc * spec.width * depth;
    const centroid = depth <= TOL ? 0 : -half + depth / 2;
    const required = spec.NEd + C;
    if (required < -1e-6)
        return null;
    const active = screws.filter(item => item.y > c + TOL);
    const base = -C * centroid;
    if (!active.length) {
        if (Math.abs(required) > 1e-6)
            return null;
        return { neutralAxis: sign * c, lambda: 0, depth, compression: C, centroid: sign * centroid, moment: Math.max(0, base),
            screws: screws.map(item => ({ id: item.screw.id, y: item.screw.y, force: 0, capacity: item.design.Rd, utilisation: 0, engaged: false })) };
    }
    const groupFactor = active.length ** 0.9 / active.length;
    const stiffness = active.map(item => item.screw.kax * (item.y - c));
    const capacity = active.map(item => item.design.Rd * groupFactor);
    if (required > capacity.reduce((sum, value) => sum + value, 0) + 1e-6)
        return null;
    const { lambda, forces } = solveScrewLambda(required, stiffness, capacity);
    const force = new Map(active.map((item, i) => [item.screw.id, { force: forces[i], capacity: capacity[i] }]));
    let moment = base;
    const states = screws.map(item => {
        const f = force.get(item.screw.id);
        const value = f?.force ?? 0;
        const cap = f?.capacity ?? item.design.Rd;
        moment += value * item.y; // mirrored coordinates for M_Ed < 0 (source: value * y * sign, see the header)
        return { id: item.screw.id, y: item.screw.y, force: value, capacity: cap, utilisation: cap <= TOL ? 0 : value / cap, engaged: f !== undefined };
    });
    if (moment < -1e-6)
        return null;
    return { neutralAxis: sign * c, lambda, depth, compression: C, centroid: sign * centroid, moment: Math.max(0, moment), screws: states };
}
function round6(value) { return Math.round(value * 1e6) / 1e6; }
export function neutralAxisCandidates(height, ys) {
    const minScrew = ys.length ? Math.min(...ys) : -height / 2;
    const maxScrew = ys.length ? Math.max(...ys) : height / 2;
    const lower = Math.min(-2 * height, minScrew - height);
    const upper = Math.max(2 * height, maxScrew + height);
    const list = [];
    for (let i = 0; i <= 1200; i++)
        list.push(lower + (upper - lower) * i / 1200);
    list.push(-height / 2, height / 2, 0, minScrew, maxScrew);
    for (const y of ys)
        list.push(y - 1e-6, y, y + 1e-6);
    return [...new Set(list.map(round6))].sort((a, b) => a - b);
}
function bestOver(candidates, spec, screws, fc, sign) {
    let best = null;
    for (const c of candidates) {
        const state = evaluateState(c, spec, screws, fc, sign);
        if (state && (!best || state.moment > best.moment))
            best = state;
    }
    return best;
}
export function analyseContactJoint(spec) {
    const grade = JOINT_GRADES[spec.grade];
    const kmod = kmodOf(spec.serviceClass, spec.loadDuration);
    const fc0d = kmod * grade.fc0k / grade.gammaM;
    const fc90d = kmod * grade.fc90k / grade.gammaM;
    const fc1 = compressionAtAngle(fc0d, fc90d, spec.angle1, spec.kc90One);
    const fc2 = compressionAtAngle(fc0d, fc90d, spec.angle2, spec.kc90Two);
    const fc = Math.min(fc1, fc2);
    const governingMember = fc1 <= fc2 ? 1 : 2;
    const screwDesign = spec.screws.map(screw => {
        const single = screwAxialCharacteristic({ ...screw, rhoK: grade.rhoK });
        const modes = { withdrawal: single.withdrawal, "head pull-through": single.headPull, tension: single.tension };
        const governing = Object.keys(modes).reduce((a, b) => (modes[b] < modes[a] ? b : a));
        return { id: screw.id, single, governing, Rd: kmod * modes[governing] / GAMMA_M_CONNECTIONS };
    });
    const sign = spec.MEd >= 0 ? 1 : -1;
    const screws = spec.screws.map((screw, i) => ({ screw, design: screwDesign[i], y: sign * screw.y }));
    const candidates = neutralAxisCandidates(spec.height, screws.map(item => item.y));
    let best = bestOver(candidates, spec, screws, fc, sign);
    const positionToleranceMm = 1e-4 + 1e-6 * spec.height;
    const momentScale = Math.max(1, Math.abs(spec.MEd), Math.abs(spec.NEd) * spec.height, best?.moment ?? 0);
    const momentToleranceNmm = 1e-3 + 1e-8 * momentScale;
    const search = {
        scanPoints: candidates.length, passes: 0,
        finalStep: (candidates[candidates.length - 1] - candidates[0]) / 1200,
        lastPassChange: 0, positionToleranceMm, momentToleranceNmm,
        stoppingReason: best ? "refinement pending" : "no feasible equilibrium state on the full-range scan",
        converged: false
    };
    if (best) {
        const first = candidates[0], last = candidates[candidates.length - 1];
        let centre = sign * best.neutralAxis;
        let left = Math.max(first, centre - spec.height / 5);
        let right = Math.min(last, centre + spec.height / 5);
        const maximumPasses = 32;
        for (let pass = 0; pass < maximumPasses; pass++) {
            const local = Array.from({ length: 201 }, (_, i) => left + (right - left) * i / 200);
            const found = bestOver(local, spec, screws, fc, sign);
            if (!found)
                throw new Error("contact moment neutral-axis refinement lost its feasible state");
            search.passes = pass + 1;
            search.finalStep = (right - left) / 200;
            const previousMoment = best.moment;
            if (found.moment >= best.moment)
                best = found; // never drop a better state found earlier
            search.lastPassChange = Math.abs(best.moment - previousMoment);
            if (search.finalStep <= positionToleranceMm && search.lastPassChange <= momentToleranceNmm) {
                search.converged = true;
                search.stoppingReason = "position and moment tolerances met";
                break;
            }
            centre = sign * best.neutralAxis;
            const span = (right - left) / 8;
            left = Math.max(first, centre - span);
            right = Math.min(last, centre + span);
        }
        if (!search.converged)
            throw new Error(`contact moment neutral-axis search did not converge in ${maximumPasses} passes (step ${search.finalStep} mm; last moment change ${search.lastPassChange} N mm)`);
    }
    return { kmod, fc1, fc2, fc, governingMember, screwDesign, state: best, MRd: best ? best.moment : 0, search };
}
const JOINT = "Interface and timber";
const SCREWS = "Screws (EN 14592 / ETA values)";
const ROWS = "Screw rows (y from the interface centre, + on the tension side for M > 0)";
const ACTIONS = "Design actions";
export const CONTACT_JOINT_FIELDS = [
    { name: "grade", group: JOINT, label: "Strength class (both members)", unit: "", kind: "select", options: Object.keys(JOINT_GRADES), default: "GL24h" },
    { name: "width", group: JOINT, label: "<b>b</b> — interface width", unit: "mm", kind: "number", min: 20, max: 2000, default: 160 },
    { name: "height", group: JOINT, label: "<b>h</b> — interface height (bending direction)", unit: "mm", kind: "number", min: 40, max: 3000, default: 360 },
    { name: "angle1", group: JOINT, label: "<b>α<sub>1</sub></b> — contact stress to grain, member 1", unit: "°", kind: "number", min: 0, max: 90, default: 90 },
    { name: "angle2", group: JOINT, label: "<b>α<sub>2</sub></b> — contact stress to grain, member 2", unit: "°", kind: "number", min: 0, max: 90, default: 90 },
    { name: "kc90One", group: JOINT, label: "<b>k<sub>c,90</sub></b> — member 1", unit: "—", kind: "number", min: 1, max: 1.75, default: 1, fallback: true },
    { name: "kc90Two", group: JOINT, label: "<b>k<sub>c,90</sub></b> — member 2", unit: "—", kind: "number", min: 1, max: 1.75, default: 1, fallback: true },
    { name: "d", group: SCREWS, label: "<b>d</b> — outer thread diameter", unit: "mm", kind: "number", min: 2, max: 20, default: 8 },
    { name: "d1", group: SCREWS, label: "<b>d<sub>1</sub></b> — inner thread diameter", unit: "mm", kind: "number", min: 1, max: 16, default: 5.6 },
    { name: "dh", group: SCREWS, label: "<b>d<sub>h</sub></b> — head diameter", unit: "mm", kind: "number", min: 3, max: 60, default: 22 },
    { name: "lef", group: SCREWS, label: "<b>l<sub>ef</sub></b> — governing threaded length", unit: "mm", kind: "number", min: 10, max: 1000, default: 140 },
    { name: "alpha", group: SCREWS, label: "<b>α</b> — screw axis to grain", unit: "°", kind: "number", min: 0, max: 90, default: 45 },
    { name: "faxK", group: SCREWS, label: "<b>f<sub>ax,k</sub></b> — withdrawal parameter (empty: EN 1995-1-1 (8.39))", unit: "MPa", kind: "number", min: 0.5, max: 60, optional: true, default: 11 },
    { name: "rhoA", group: SCREWS, label: "<b>ρ<sub>a</sub></b> — associated density", unit: "kg/m³", kind: "number", min: 250, max: 800, default: 350, fallback: true },
    { name: "fheadK", group: SCREWS, label: "<b>f<sub>head,k</sub></b> — head pull-through parameter", unit: "MPa", kind: "number", min: 0.5, max: 200, default: 40 },
    { name: "ftensK", group: SCREWS, label: "<b>f<sub>tens,k</sub></b> — tensile capacity of one screw", unit: "kN", kind: "number", min: 0.1, max: 500, default: 18 },
    { name: "kax", group: SCREWS, label: "<b>K<sub>ax</sub></b> — axial slip modulus of one screw", unit: "N/mm", kind: "number", min: 100, max: 1e6, default: 12000 },
    { name: "perRow", group: ROWS, label: "Screws per row", unit: "—", kind: "integer", min: 1, max: 10, default: 2 },
    { name: "y1", group: ROWS, label: "Row 1: <b>y<sub>1</sub></b>", unit: "mm", kind: "number", min: -1500, max: 1500, default: -120, optional: true },
    { name: "y2", group: ROWS, label: "Row 2: <b>y<sub>2</sub></b>", unit: "mm", kind: "number", min: -1500, max: 1500, default: -60, optional: true },
    { name: "y3", group: ROWS, label: "Row 3: <b>y<sub>3</sub></b>", unit: "mm", kind: "number", min: -1500, max: 1500, default: 60, optional: true },
    { name: "y4", group: ROWS, label: "Row 4: <b>y<sub>4</sub></b>", unit: "mm", kind: "number", min: -1500, max: 1500, default: 120, optional: true },
    { name: "y5", group: ROWS, label: "Row 5: <b>y<sub>5</sub></b> (empty: none)", unit: "mm", kind: "number", min: -1500, max: 1500, optional: true },
    { name: "y6", group: ROWS, label: "Row 6: <b>y<sub>6</sub></b> (empty: none)", unit: "mm", kind: "number", min: -1500, max: 1500, optional: true },
    { name: "NEd", group: ACTIONS, label: "<b>N<sub>Ed</sub></b> — axial force (+ tension)", unit: "kN", kind: "number", min: -5000, max: 5000, default: 0 },
    { name: "MEd", group: ACTIONS, label: "<b>M<sub>Ed</sub></b> — bending moment", unit: "kNm", kind: "number", min: -5000, max: 5000, default: 4 },
    { name: "serviceClass", group: ACTIONS, label: "Service class", unit: "", kind: "select", options: ["1", "2", "3"], default: "2" },
    { name: "loadDuration", group: ACTIONS, label: "Load-duration class (k<sub>mod</sub>)", unit: "", kind: "select", options: LOAD_DURATIONS, default: "short-term" }
];
const ROW_KEYS = ["y1", "y2", "y3", "y4", "y5", "y6"];
export function contactJointSpec(input) {
    const screws = [];
    ROW_KEYS.forEach((key, row) => {
        const y = input[key];
        if (y === undefined)
            return;
        for (let k = 0; k < input.perRow; k++) {
            screws.push({ id: `R${row + 1}.${k + 1}`, y, d: input.d, d1: input.d1, dh: input.dh, lef: input.lef, alpha: input.alpha, rhoA: input.rhoA,
                ...(input.faxK !== undefined ? { faxK: input.faxK } : {}), fheadK: input.fheadK, ftensK: input.ftensK * 1000, kax: input.kax });
        }
    });
    return { grade: input.grade, serviceClass: input.serviceClass, loadDuration: input.loadDuration, width: input.width, height: input.height,
        angle1: input.angle1, angle2: input.angle2, kc90One: input.kc90One, kc90Two: input.kc90Two, NEd: input.NEd * 1000, MEd: input.MEd * 1e6, screws };
}
export function normaliseContactJointInput(raw) {
    const checked = normaliseFields(raw, CONTACT_JOINT_FIELDS);
    if (!checked.ok)
        return checked;
    const input = checked.values;
    const errors = contactJointRefusals(contactJointSpec(input));
    return errors.length ? { ok: false, errors } : { ok: true, input };
}
export function checkContactJoint(input) {
    const spec = contactJointSpec(input);
    const analysis = analyseContactJoint(spec);
    const MRdkNm = analysis.MRd / 1e6;
    const demand = Math.abs(input.MEd);
    const checks = new CheckList("Moment joint — contact and screws");
    checks.resistance("moment", "Bending: |M<sub>Ed</sub>| ≤ M<sub>Rd</sub>(N<sub>Ed</sub>)", demand, MRdkNm, "kNm", "EN 1995-1-1 (6.16), 8.7.2; joint model", analysis.state ? undefined : "No equilibrium state for this N_Ed: the axial force exceeds the screw tension or the contact compression capacity.");
    const kN = 1000;
    const grade = JOINT_GRADES[spec.grade];
    const first = analysis.screwDesign[0];
    const values = [
        { title: "Contact — EN 1995-1-1 (6.16)", rows: [
                { label: `${spec.grade}: f<sub>c,0,k</sub>; f<sub>c,90,k</sub>; ρ<sub>k</sub>; γ<sub>M</sub>`, value: `${grade.fc0k}; ${grade.fc90k}; ${grade.rhoK}; ${grade.gammaM}`, unit: "MPa; MPa; kg/m³; —" },
                { label: `k<sub>mod</sub> (service class ${spec.serviceClass}, ${spec.loadDuration})`, value: analysis.kmod, unit: "—", digits: 2 },
                { label: "f<sub>c,α,d</sub> member 1; member 2", value: `${analysis.fc1.toFixed(3)}; ${analysis.fc2.toFixed(3)}`, unit: "MPa" },
                { label: `f<sub>c,d</sub> of the contact block (member ${analysis.governingMember})`, value: analysis.fc, unit: "MPa", digits: 3 }
            ] }
    ];
    if (first) {
        values.push({ title: "One screw — EN 1995-1-1 8.7.2 (γ<sub>M</sub> = 1.3)", rows: [
                { label: first.single.route === "8.38" ? "f<sub>ax,k</sub> (8.39), k<sub>d</sub> (8.40)" : "f<sub>ax,k</sub> given, (ρ<sub>k</sub>/ρ<sub>a</sub>)<sup>0.8</sup> (8.40a)", value: first.single.route === "8.38" ? `${first.single.faxK.toFixed(3)}; ${first.single.kd.toFixed(3)}` : `${first.single.faxK}; ${first.single.densityFactor.toFixed(4)}`, unit: "MPa; —" },
                { label: "Withdrawal; head pull-through; tension (characteristic)", value: `${(first.single.withdrawal / kN).toFixed(2)}; ${(first.single.headPull / kN).toFixed(2)}; ${(first.single.tension / kN).toFixed(2)}`, unit: "kN" },
                { label: `R<sub>d</sub> = k<sub>mod</sub> min / 1.3 (${first.governing})`, value: first.Rd / kN, unit: "kN", digits: 3 }
            ] });
    }
    if (analysis.state) {
        const s = analysis.state;
        values.push({ title: "Capacity state at N<sub>Ed</sub>", rows: [
                { label: "Neutral axis x<sub>n</sub> (from the centre); compression depth", value: `${s.neutralAxis.toFixed(2)}; ${s.depth.toFixed(2)}`, unit: "mm" },
                { label: "Contact force C; centroid", value: `${(s.compression / kN).toFixed(2)} kN; ${s.centroid.toFixed(1)} mm`, unit: "" },
                { label: "M<sub>Rd</sub>", value: MRdkNm, unit: "kNm", digits: 3 },
                { label: "Search: scan points; refinement passes; final step; change in the last pass", value: `${analysis.search.scanPoints}; ${analysis.search.passes}; ${analysis.search.finalStep.toExponential(2)} mm; ${(analysis.search.lastPassChange / 1e6).toExponential(2)} kNm`, unit: "" },
                ...s.screws.map(screw => ({ label: `Screw ${screw.id} at y = ${screw.y} mm${screw.engaged ? "" : " (not in tension)"}`, value: `${(screw.force / kN).toFixed(2)} / ${(screw.capacity / kN).toFixed(2)} kN (${screw.utilisation.toFixed(2)})`, unit: "" }))
            ] });
    }
    const notes = [
        "Joint model: plastic contact block at f_c,α,d of the weaker member (EN 1995-1-1 (6.16)), tension-only screws with an elastic-plastic law and the group factor n^0.9/n over the screws in tension, one bending axis.",
        "Screw resistance per EN 1995-1-1 8.7.2 with k_d (8.40) in the (8.38) route; γ_M = 1.3 for the screws, the member γ_M for the contact.",
        "For M_Ed < 0 the screw moments use the mirrored coordinates (correction of the earlier tool, which entered them with the wrong sign).",
        "Not covered: shear and friction in the interface, lateral screw loads and the axial-lateral interaction (8.7.3), spacings of the screws, the members away from the joint.",
        "γ_M and the k_mod table are the recommended EN values; check the National Annex that applies to the project."
    ];
    values.push({ title: "Neutral-axis search convergence", rows: [
            { label: "Stopping reason", value: analysis.search.stoppingReason, unit: "" },
            { label: "Final position step <= tolerance", value: `${analysis.search.finalStep.toExponential(3)} mm <= ${analysis.search.positionToleranceMm.toExponential(3)} mm`, unit: "" },
            { label: "Last moment change <= tolerance", value: `${analysis.search.lastPassChange.toExponential(3)} N mm <= ${analysis.search.momentToleranceNmm.toExponential(3)} N mm`, unit: "" },
            { label: "Converged; passes; full-range scan points", value: `${analysis.search.converged}; ${analysis.search.passes}; ${analysis.search.scanPoints}`, unit: "" }
        ] });
    return { checks: checks.rows, values, notes, ...summariseChecks(checks.rows), spec, analysis, MRdkNm };
}
