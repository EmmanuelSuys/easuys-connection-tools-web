/**
 * Indicative contact-joint FE: plane sections, compression-only strip springs
 * and tension-only screw springs. N, mm, MPa; delta(y) = delta0 + theta*y.
 * Design strengths and the active screw group n^0.9/n follow contact-joint.ts.
 * Lc and muC are assumptions, not EN 1995 material parameters. The EN check decides.
 * No post-failure unloading: the path stops at the first brittle screw / strip event.
 */
import { JOINT_MEAN_MODULI, analyseContactJoint, contactJointRefusals } from "./contact-joint.js";
function positive(name, value) {
    if (!Number.isFinite(value) || value <= 0)
        throw new Error(`${name} must be finite and > 0`);
}
/** Harmonic interpolation of the mean longitudinal / transverse moduli, MPa. */
export function contactJointMeanModulus(E0, E90, angle) {
    const a = angle * Math.PI / 180;
    return E0 * E90 / (E0 * Math.sin(a) ** 2 + E90 * Math.cos(a) ** 2);
}
function settings(spec, options) {
    const result = {
        Lc: spec.height / 2, muC: 5, screwBehaviour: "brittle",
        thetaMax: 0.05, steps: 400, nStrips: 200,
        absoluteToleranceN: 1e-8, relativeTolerance: 1e-10,
        maxIterations: 120, maxBracketIterations: 60, ...options
    };
    for (const key of ["Lc", "thetaMax", "absoluteToleranceN", "relativeTolerance"])
        positive(key, result[key]);
    if (!Number.isFinite(result.muC) || result.muC < 1)
        throw new Error("muC must be finite and >= 1");
    if (!["brittle", "ductile"].includes(result.screwBehaviour))
        throw new Error("screwBehaviour must be brittle or ductile");
    for (const key of ["steps", "nStrips", "maxIterations", "maxBracketIterations"]) {
        positive(key, result[key]);
        if (!Number.isSafeInteger(result[key]))
            throw new Error(`${key} must be an integer`);
    }
    return result;
}
function validate(spec) {
    if (!Object.hasOwn(JOINT_MEAN_MODULI, spec.grade))
        throw new Error("unknown timber grade");
    for (const key of ["width", "height", "kc90One", "kc90Two"])
        positive(key, spec[key]);
    for (const key of ["angle1", "angle2", "NEd", "MEd"]) {
        if (!Number.isFinite(spec[key]))
            throw new Error(`${key} must be finite`);
    }
    const ids = new Set();
    for (const screw of spec.screws) {
        if (ids.has(screw.id))
            throw new Error("screw ids must be unique");
        ids.add(screw.id);
        for (const key of ["kax", "d", "d1", "dh", "lef", "rhoA", "fheadK", "ftensK"])
            positive(`screw ${screw.id}: ${key}`, screw[key]);
        for (const key of ["y", "alpha"])
            if (!Number.isFinite(screw[key]))
                throw new Error(`screw ${screw.id}: ${key} must be finite`);
        if (screw.faxK !== undefined)
            positive(`screw ${screw.id}: faxK`, screw.faxK);
    }
    const errors = contactJointRefusals(spec);
    if (errors.length)
        throw new Error(errors.join("; "));
}
/** Throws on any unbracketed / unconverged state; never returns a last iterate. */
function solvePoint(spec, en, opt, kc, theta) {
    const half = spec.height / 2, dh = spec.height / opt.nStrips;
    const area = spec.width * dh, closingLimit = opt.muC * en.fc / kc;
    function evaluate(delta0) {
        const gaps = spec.screws.map(s => delta0 + theta * s.y);
        const n = gaps.filter(gap => gap > 0).length;
        const group = n ? n ** 0.9 / n : 1;
        let tension = 0, compression = 0, moment = 0, maxScrewUtilisation = 0;
        const screws = spec.screws.map((s, i) => {
            const engaged = gaps[i] > 0;
            const capacity = en.screwDesign[i].Rd * (engaged ? group : 1);
            const elasticForce = s.kax * Math.max(0, gaps[i]);
            // Retain the elastic trial utilisation for locating the first brittle event.
            maxScrewUtilisation = Math.max(maxScrewUtilisation, elasticForce / capacity);
            const force = Math.min(elasticForce, capacity);
            tension += force;
            moment += force * s.y;
            return { id: s.id, y: s.y, force, capacity, utilisation: force / capacity, engaged };
        });
        for (let j = 0; j < opt.nStrips; j++) {
            const y = -half + (j + 0.5) * dh;
            const force = area * Math.min(kc * Math.max(0, -delta0 - theta * y), en.fc);
            compression += force;
            moment -= force * y;
        }
        const axialForce = tension - compression;
        const maxClosing = Math.max(0, -delta0 + Math.abs(theta) * (half - dh / 2));
        const depth = theta === 0 ? (delta0 < 0 ? spec.height : 0)
            : Math.max(0, Math.min(spec.height, half - delta0 / Math.abs(theta)));
        return { theta, moment, delta0, compression, depth, axialForce, residualN: axialForce - spec.NEd,
            screws, maxScrewUtilisation, maxClosing, contactUtilisation: maxClosing / closingLimit };
    }
    const tolerance = (p) => opt.absoluteToleranceN + opt.relativeTolerance
        * Math.max(1, Math.abs(spec.NEd), p.compression, p.axialForce + p.compression);
    const accepted = (p) => Number.isFinite(p.residualN) && Math.abs(p.residualN) <= tolerance(p);
    const finish = (p, iterations, bracketIterations) => {
        const gateN = 1e-6 * Math.max(p.compression, 1) + 0.5;
        if (!(Math.abs(p.residualN) <= gateN) || !Number.isFinite(p.moment)) {
            throw new Error(`equilibrium gate failed at theta=${theta}: residual ${p.residualN} N, gate ${gateN} N`);
        }
        return { ...p, equilibrium: { converged: true, stoppingReason: "absolute + relative force tolerance met",
                iterations, bracketIterations, toleranceN: tolerance(p), gateN } };
    };
    const origin = evaluate(0);
    if (accepted(origin))
        return finish(origin, 0, 0);
    let span = Math.max(1e-6, Math.abs(theta) * spec.height, en.fc / kc, ...spec.screws.map((s, i) => en.screwDesign[i].Rd / s.kax));
    let left = evaluate(-span), right = evaluate(span), brackets = 0;
    while (!(left.residualN <= 0 && right.residualN >= 0) && brackets < opt.maxBracketIterations) {
        span *= 2;
        left = evaluate(-span);
        right = evaluate(span);
        brackets++;
    }
    if (accepted(left))
        return finish(left, 0, brackets);
    if (accepted(right))
        return finish(right, 0, brackets);
    if (!(left.residualN <= 0 && right.residualN >= 0)) {
        throw new Error(`axial equilibrium not bracketed at theta=${theta} after ${brackets} expansions (N_Ed=${spec.NEd} N)`);
    }
    // Each fixed active group has a monotone spring law. Changing n at engagement
    // can jump the EN group caps. Such a discontinuity must meet the force test;
    // shrinking the displacement bracket alone is NEVER convergence.
    for (let iteration = 1; iteration <= opt.maxIterations; iteration++) {
        const delta0 = (left.delta0 + right.delta0) / 2;
        if (delta0 === left.delta0 || delta0 === right.delta0)
            break;
        const point = evaluate(delta0);
        if (accepted(point))
            return finish(point, iteration, brackets);
        if (point.residualN < 0)
            left = point;
        else
            right = point;
    }
    throw new Error(`axial equilibrium did not converge at theta=${theta}: force tolerance not met (iteration cap ${opt.maxIterations} or bracket stagnation / active-group jump)`);
}
/** Indicative deformation-compatibility check alongside analyseContactJoint. */
export function analyseContactJointFE(spec, options = {}) {
    const started = Date.now();
    validate(spec);
    const opt = settings(spec, options);
    const en = analyseContactJoint(spec);
    if (!en.state || !(en.MRd > 0))
        throw new Error("EN model has no positive moment resistance at this axial force");
    const { E0, E90 } = JOINT_MEAN_MODULI[spec.grade];
    const Ealpha1 = contactJointMeanModulus(E0, E90, spec.angle1);
    const Ealpha2 = contactJointMeanModulus(E0, E90, spec.angle2);
    const kc = 1 / (opt.Lc / Ealpha1 + opt.Lc / Ealpha2);
    positive("contact stiffness", kc);
    const sign = spec.MEd < 0 ? -1 : 1;
    const pointAt = (magnitude) => solvePoint(spec, en, opt, kc, sign * magnitude);
    const limit = (p) => Math.max(p.contactUtilisation, opt.screwBehaviour === "brittle" ? p.maxScrewUtilisation : 0);
    const curve = [pointAt(0)];
    let event = "theta_max";
    for (let step = 0; step <= opt.steps; step++) {
        const previous = curve[curve.length - 1];
        let next = step === 0 ? previous : pointAt(opt.thetaMax * step / opt.steps);
        if (limit(next) >= 1) {
            if (step > 0) {
                let low = Math.abs(previous.theta), high = Math.abs(next.theta);
                let located = false;
                for (let i = 0; i < 80; i++) {
                    if (high - low <= 1e-12 * Math.max(opt.thetaMax, high) && limit(next) <= 1 + 1e-7) {
                        located = true;
                        break;
                    }
                    const mid = (low + high) / 2;
                    if (mid === low || mid === high)
                        break;
                    const trial = pointAt(mid);
                    if (limit(trial) >= 1) {
                        high = mid;
                        next = trial;
                    }
                    else
                        low = mid;
                }
                if (!located)
                    throw new Error("FE event search did not converge (event tolerance or active-group jump)");
                curve.push(next);
            }
            event = opt.screwBehaviour === "brittle" && next.maxScrewUtilisation >= 1 ? "screw" : "contact";
            break;
        }
        if (step > 0)
            curve.push(next);
    }
    const eventState = curve[curve.length - 1];
    const capacityState = event === "theta_max" && opt.screwBehaviour === "ductile"
        ? curve.reduce((best, p) => sign * p.moment > sign * best.moment ? p : best) : eventState;
    const MFE = Math.max(0, sign * capacityState.moment);
    const lowerBound = event === "theta_max";
    const stoppingReason = event === "screw" ? "first brittle screw reached its group-reduced design capacity"
        : event === "contact" ? "first contact strip reached its ductility limit"
            : "theta_max reached; moment is a lower bound";
    return { curve, MFE, MRd: en.MRd, ratio: MFE / en.MRd, event, thetaEvent: eventState.theta,
        eventState, capacityState, lowerBound, options: opt, kc, Ealpha1, Ealpha2, fc: en.fc,
        yieldClosing: en.fc / kc, failureClosing: opt.muC * en.fc / kc, stoppingReason,
        timingMs: Date.now() - started };
}
