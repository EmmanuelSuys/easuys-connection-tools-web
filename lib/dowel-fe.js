/**
 * One-dimensional FE model of a laterally loaded dowel-type fastener (nail,
 * screw, bolt or dowel) in single or double shear, as a check of the Johansen
 * (European Yield Model) equations of EN 1995-1-1 8.2.2 and 8.2.3.
 *
 * Model
 * - The fastener is a line of Euler-Bernoulli beam elements (cubic Hermite,
 *   elastic, EI = E pi d^4 / 64) along its axis z. Plasticity in bending is
 *   lumped at the nodes: every interior node carries a rotational spring
 *   between the two adjacent elements that is rigid (penalty) up to the plastic
 *   moment M_y,Rk and perfectly plastic beyond it (plastic hinge).
 * - Embedment: distributed springs along each timber member, integrated at
 *   three Gauss points per element. Force per unit length p = k (v - u_member),
 *   capped at f_h d (elastic-perfectly-plastic). Rigid-plastic embedment uses a
 *   penalty stiffness (yield at a slip of d / 1000); elastoplastic embedment
 *   uses a foundation modulus k calibrated to the slip modulus K_ser of
 *   EN 1995-1-1 7.1 (calibrateFoundationModulus).
 * - Steel plates are points on the fastener axis that move with the plate: a
 *   thin plate (t_s <= 0.5 d) is pinned, a thick plate (t_s >= d) clamps the
 *   fastener through a hinge with the plastic moment M_y,Rk (EN 1995-1-1
 *   8.2.3(1)); in between, the results are interpolated linearly as EN does.
 * - Loading: displacement control. One member (or the plates) translates by
 *   the slip delta, the others are fixed. The model is piecewise linear, so
 *   the increments run from event to event (a spring or hinge reaching its
 *   plastic limit or unloading) with an active-set iteration per increment;
 *   after every increment equilibrium is verified with the full return
 *   mapping against a residual tolerance in N (N mm for moments) and, where
 *   needed, restored by Newton iterations with an increment tolerance in mm.
 *   Iteration caps apply throughout; a failure stops the analysis with an
 *   error (fail-closed), it never returns the last iterate as a result.
 * - Collapse: the tangent load rate of the current mechanism falls below
 *   1e-4 times the initial stiffness.
 * - Numerical post-yield stiffness: springs and hinges keep a tangent of
 *   1e-2 f_h d / d per mm of slip and 1e-4 M_y per radian after yield, so that
 *   the tangent matrix stays regular in a mechanism. It is removed from the
 *   results: for a given set of yielding components the load rate is linear
 *   in H, so the rate of the perfectly plastic model is 2 rate(H) - rate(2 H)
 *   (Richardson extrapolation); its integral over the slip is the reported
 *   load, curve and collapse load. The difference to the load with H is
 *   reported as hardeningN.
 *
 * By the limit theorems of plasticity the collapse load of this
 * elastic-perfectly-plastic model does not depend on the elastic stiffnesses;
 * it equals the rigid-plastic limit load of the Johansen mechanisms. The EN
 * equations add calibration factors to the mechanical Johansen values (1.05
 * and 1.15 on the modes with plastic hinges, 0.4 instead of sqrt(2) - 1 in
 * (8.9 a)) and the rope effect F_ax,Rk / 4 (8.2.2(2)); neither is part of
 * this model. Units: N, mm, MPa.
 */
/** Tolerances and caps of the incremental solution (explicit units). */
export const DOWEL_FE_TOLERANCES = {
    /** Residual force: absolute part, N, plus relative part times the total embedment capacity. */
    forceN: 1e-3,
    forceRelative: 1e-8,
    /** Newton increment: absolute part, mm (rotations: mm / d). */
    displacementMm: 1e-6,
    /** Cap of the active-set iterations per increment and of the Newton corrections. */
    maxIterations: 50,
    /**
     * Collapse: the load rate of the current mechanism without the numerical post-yield stiffness is at most
     * plateauTangent x initial stiffness, or the load per shear plane rose by at most
     * max(plateauForceN, plateauRelative x load) over the last plateauSlip x d of slip.
     */
    plateauTangent: 1e-7,
    plateauForceN: 0.05,
    plateauRelative: 2e-5,
    plateauSlip: 0.05,
    /** Rigid-plastic embedment yields at a slip of d x rigidYieldSlip; a rigid-plastic dowel has EI x rigidBending. */
    rigidYieldSlip: 1e-3,
    rigidBending: 10,
    /** Hinge rotational penalty: hingePenalty x 4 EI / element length. */
    hingePenalty: 10,
    /** Post-yield (numerical) stiffness: springs springHardening f_h d / d per mm; hinges hingeHardening M_y per rad. */
    springHardening: 1e-2,
    hingeHardening: 1e-4
};
export class DowelFeError extends Error {
    constructor(message) {
        super(message);
        this.name = "DowelFeError";
    }
}
function requirePositive(value, name) {
    if (value === undefined || !Number.isFinite(value) || value <= 0)
        throw new DowelFeError(`${name} must be a positive number`);
    return value;
}
function layoutOf(input, k1, k2) {
    const c = input.configuration;
    const t1 = () => requirePositive(input.t1, "t1"), t2 = () => requirePositive(input.t2, "t2");
    const fh1 = () => requirePositive(input.fh1, "fh1"), fh2 = () => requirePositive(input.fh2, "fh2");
    const clamped = input.plate === "thick";
    if ((c === "steel-single" || c === "steel-outer") && input.plate !== "thin" && input.plate !== "thick")
        throw new DowelFeError("plate must be thin or thick");
    switch (c) {
        case "timber-single":
            return { members: [
                    { name: "member 1", z0: -t1(), z1: 0, fh: fh1(), k: k1, moving: false },
                    { name: "member 2", z0: 0, z1: t2(), fh: fh2(), k: k2, moving: true }
                ], plates: [], planes: 1, shearPlanes: [0], timberMoves: true };
        case "timber-double":
            return { members: [
                    { name: "outer member A", z0: -t1(), z1: 0, fh: fh1(), k: k1, moving: false },
                    { name: "inner member", z0: 0, z1: t2(), fh: fh2(), k: k2, moving: true },
                    { name: "outer member B", z0: t2(), z1: t2() + t1(), fh: fh1(), k: k1, moving: false }
                ], plates: [], planes: 2, shearPlanes: [0, t2()], timberMoves: true };
        case "steel-single":
            return { members: [{ name: "timber member", z0: 0, z1: t1(), fh: fh1(), k: k1, moving: false }],
                plates: [{ name: "steel plate", z: 0, clamped }], planes: 1, shearPlanes: [0], timberMoves: false };
        case "steel-slotted":
            return { members: [
                    { name: "timber side A", z0: -t1(), z1: 0, fh: fh1(), k: k1, moving: false },
                    { name: "timber side B", z0: 0, z1: t1(), fh: fh1(), k: k1, moving: false }
                ], plates: [{ name: "slotted-in plate", z: 0, clamped: false }], planes: 2, shearPlanes: [0], timberMoves: false };
        case "steel-outer":
            return { members: [{ name: "timber member", z0: 0, z1: t2(), fh: fh2(), k: k2, moving: false }],
                plates: [{ name: "steel plate A", z: 0, clamped }, { name: "steel plate B", z: t2(), clamped }], planes: 2, shearPlanes: [0, t2()], timberMoves: false };
        default:
            throw new DowelFeError(`Unknown configuration ${String(c)}`);
    }
}
// ------------------------------------------------------------------ model
const GAUSS = [
    { xi: 0.5 - Math.sqrt(0.15), w: 5 / 18 },
    { xi: 0.5, w: 8 / 18 },
    { xi: 0.5 + Math.sqrt(0.15), w: 5 / 18 }
];
const vDof = (node) => 3 * node;
const thetaA = (element) => 3 * element + 1;
const thetaB = (element) => 3 * element + 2;
const HALF_BAND = 3;
function buildModel(input) {
    const d = requirePositive(input.d, "d");
    const My = requirePositive(input.My, "My");
    const E = input.E ?? 210000;
    const nEl = input.elementsPerMember ?? 80;
    if (!Number.isInteger(nEl) || nEl < 2 || nEl > 400)
        throw new DowelFeError("elementsPerMember must be an integer from 2 to 400");
    const tol = DOWEL_FE_TOLERANCES;
    const rigidEmbedment = (input.embedment ?? "rigid-plastic") === "rigid-plastic";
    const rigidDowel = (input.dowel ?? "rigid-plastic") === "rigid-plastic";
    const kOf = (fh, k, name) => rigidEmbedment ? fh * d / (tol.rigidYieldSlip * d) : requirePositive(k, name);
    // provisional layout to read fh values for the stiffness of rigid embedment
    const probe = layoutOf(input, 1, 1);
    const fhOf = (index) => probe.members[index].fh;
    const c = input.configuration;
    const index1 = c === "steel-outer" ? -1 : 0;
    const index2 = c === "timber-single" || c === "timber-double" ? 1 : c === "steel-outer" ? 0 : -1;
    const k1 = index1 >= 0 ? kOf(fhOf(index1), input.k1, "k1") : 1;
    const k2 = index2 >= 0 ? kOf(fhOf(index2), input.k2, "k2") : 1;
    const layout = layoutOf(input, k1, k2);
    const EI = E * Math.PI * d ** 4 / 64 * (rigidDowel ? tol.rigidBending : 1);
    // nodes: nEl elements in the thickest member and the same element length in the others (at least 4
    // elements); members share their interface nodes. A uniform length keeps the stiff fastener from
    // getting very short elements in thin members, which would make the tangent ill-conditioned.
    const thickest = Math.max(...layout.members.map(member => member.z1 - member.z0));
    const z = [];
    const nodeMember = [];
    const elements = [];
    layout.members.forEach((member, m) => {
        const count = Math.max(4, Math.round(nEl * (member.z1 - member.z0) / thickest));
        const L = (member.z1 - member.z0) / count;
        for (let i = 0; i <= count; i++) {
            const zi = i === count ? member.z1 : member.z0 + i * L;
            if (z.length && Math.abs(z[z.length - 1] - zi) < 1e-9 * Math.max(1, Math.abs(zi)))
                continue;
            z.push(zi);
            nodeMember.push(m);
        }
        const first = z.length - 1 - count;
        for (let i = 0; i < count; i++)
            elements.push({ a: first + i, b: first + i + 1, L, EI, member: m });
    });
    const N = z.length;
    if (elements.length !== N - 1)
        throw new DowelFeError("Internal error: members are not contiguous along the fastener");
    const springs = [];
    let capacityTotal = 0;
    elements.forEach((element, e) => {
        const member = layout.members[element.member];
        for (const gp of GAUSS) {
            const xi = gp.xi, L = element.L, w = gp.w * L;
            const N1 = 1 - 3 * xi * xi + 2 * xi ** 3, N2 = L * (xi - 2 * xi * xi + xi ** 3);
            const N3 = 3 * xi * xi - 2 * xi ** 3, N4 = L * (-xi * xi + xi ** 3);
            const cap = member.fh * d * w;
            capacityTotal += cap;
            springs.push({ element: e, member: element.member, z: z[element.a] + xi * L, N: [N1, N2, N3, N4],
                k: member.k * w, cap, H: tol.springHardening * cap / d, moving: member.moving,
                vp: 0, alpha: 0, trialVp: 0, trialAlpha: 0, force: 0, yielded: false });
        }
    });
    const minL = Math.min(...elements.map(element => element.L));
    const Kh = tol.hingePenalty * 4 * EI / minL;
    const hinge = (left, right, node, plate) => ({
        left, right, z: z[node], node, plate, member: nodeMember[node], K: Kh, Mp: My, H: tol.hingeHardening * My,
        thp: 0, alpha: 0, trialThp: 0, trialAlpha: 0, moment: 0, yielded: false
    });
    const hinges = [];
    const plateAt = (zi) => layout.plates.find(plate => Math.abs(plate.z - zi) < 1e-9 * Math.max(1, Math.abs(zi))) ?? null;
    for (let i = 1; i < N - 1; i++)
        hinges.push(hinge(thetaB(i - 1), thetaA(i), i, plateAt(z[i])?.name ?? null));
    const prescribed = [];
    for (const plate of layout.plates) {
        const node = z.findIndex(zi => Math.abs(zi - plate.z) < 1e-9 * Math.max(1, Math.abs(zi)));
        if (node < 0)
            throw new DowelFeError(`Internal error: no node at ${plate.name}`);
        prescribed.push(vDof(node));
        if (plate.clamped) {
            if (node === 0)
                hinges.push(hinge(-1, thetaA(0), node, plate.name));
            else if (node === N - 1)
                hinges.push(hinge(thetaB(N - 2), -1, node, plate.name));
            else
                throw new DowelFeError("Internal error: clamped plates are at the fastener ends");
        }
    }
    return { layout, z, nodeMember, elements, springs, hinges, nDof: 3 * (N - 1) + 1, prescribed, capacityTotal, d };
}
// ------------------------------------------------------------------ banded LDL^T
/** y = K x for the symmetric band storage. */
function bandMultiply(n, band, x) {
    const w = HALF_BAND + 1;
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        y[i] += band[i * w] * x[i];
        for (let j = i + 1; j <= Math.min(n - 1, i + HALF_BAND); j++) {
            const a = band[i * w + (j - i)];
            y[i] += a * x[j];
            y[j] += a * x[i];
        }
    }
    return y;
}
/**
 * Solves K x = b (K symmetric positive definite, band storage) by LDL^T with
 * two steps of iterative refinement: the stiff fastener next to yielded
 * springs makes K ill-conditioned (pivots below 1e-15 of the diagonal count as singular). Every increment is followed by an
 * equilibrium check with the full return mapping, which catches an inaccurate solve.
 */
function solveBanded(n, band, rhs) {
    const factor = factorBanded(n, band);
    const x = substitute(n, factor, rhs);
    for (let pass = 0; pass < 2; pass++) {
        const r = bandMultiply(n, band, x);
        for (let i = 0; i < n; i++)
            r[i] = rhs[i] - r[i];
        const dx = substitute(n, factor, r);
        for (let i = 0; i < n; i++)
            x[i] += dx[i];
    }
    return x;
}
function factorBanded(n, band) {
    const w = HALF_BAND + 1;
    const a = band.slice();
    const D = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let di = a[i * w];
        for (let k = Math.max(0, i - HALF_BAND); k < i; k++) {
            const u = a[k * w + (i - k)];
            di -= u * u * D[k];
        }
        if (!(di > 1e-15 * Math.abs(band[i * w])) || !Number.isFinite(di))
            throw new DowelFeError(`Tangent matrix is singular at equation ${i}`);
        D[i] = di;
        for (let j = i + 1; j <= Math.min(n - 1, i + HALF_BAND); j++) {
            let s = a[i * w + (j - i)];
            for (let k = Math.max(0, j - HALF_BAND); k < i; k++)
                s -= a[k * w + (i - k)] * a[k * w + (j - k)] * D[k];
            a[i * w + (j - i)] = s / di;
        }
    }
    return { a, D };
}
function substitute(n, factor, rhs) {
    const w = HALF_BAND + 1;
    const { a, D } = factor;
    const x = Float64Array.from(rhs);
    for (let i = 0; i < n; i++)
        for (let k = Math.max(0, i - HALF_BAND); k < i; k++)
            x[i] -= a[k * w + (i - k)] * x[k];
    for (let i = 0; i < n; i++)
        x[i] /= D[i];
    for (let i = n - 1; i >= 0; i--)
        for (let j = i + 1; j <= Math.min(n - 1, i + HALF_BAND); j++)
            x[i] -= a[i * w + (j - i)] * x[j];
    return x;
}
function addBand(band, i, j, value) {
    if (j < i)
        [i, j] = [j, i];
    band[i * (HALF_BAND + 1) + (j - i)] += value;
}
/** Elastic-plastic return mapping with linear hardening; returns force and tangent. */
function returnMap(k, cap, H, strain, plastic, alpha) {
    const trial = k * (strain - plastic);
    const limit = cap + H * alpha;
    if (Math.abs(trial) <= limit)
        return { force: trial, tangent: k, plastic, alpha, yielded: false };
    const gamma = (Math.abs(trial) - limit) / (k + H);
    const sign = Math.sign(trial);
    return { force: trial - sign * k * gamma, tangent: k * H / (k + H), plastic: plastic + sign * gamma, alpha: alpha + gamma, yielded: true };
}
/** Internal forces, tangent and load at displacement u and slip delta (trial states, not committed). */
function evaluate(model, u, delta, elasticOnly = false) {
    const fint = new Float64Array(model.nDof);
    const band = new Float64Array(model.nDof * (HALF_BAND + 1));
    for (let e = 0; e < model.elements.length; e++) {
        const { L, EI } = model.elements[e];
        const dofs = [vDof(e), thetaA(e), vDof(e + 1), thetaB(e)];
        const c = EI / L ** 3;
        const K = [
            [12 * c, 6 * L * c, -12 * c, 6 * L * c],
            [6 * L * c, 4 * L * L * c, -6 * L * c, 2 * L * L * c],
            [-12 * c, -6 * L * c, 12 * c, -6 * L * c],
            [6 * L * c, 2 * L * L * c, -6 * L * c, 4 * L * L * c]
        ];
        for (let r = 0; r < 4; r++)
            for (let s = 0; s < 4; s++)
                if (dofs[s] >= dofs[r])
                    addBand(band, dofs[r], dofs[s], K[r][s]);
        // end forces from the deformations (rigid-body motion removed first: no cancellation of large K u terms)
        const psi = (u[vDof(e + 1)] - u[vDof(e)]) / L;
        const ka = u[thetaA(e)] - psi, kb = u[thetaB(e)] - psi;
        const Ma = EI / L * (4 * ka + 2 * kb), Mb = EI / L * (2 * ka + 4 * kb);
        const V = (Ma + Mb) / L;
        fint[vDof(e)] += V;
        fint[vDof(e + 1)] -= V;
        fint[thetaA(e)] += Ma;
        fint[thetaB(e)] += Mb;
    }
    let load = 0, hardening = 0;
    for (const spring of model.springs) {
        const e = spring.element;
        const dofs = [vDof(e), thetaA(e), vDof(e + 1), thetaB(e)];
        const v = spring.N[0] * u[dofs[0]] + spring.N[1] * u[dofs[1]] + spring.N[2] * u[dofs[2]] + spring.N[3] * u[dofs[3]];
        const relative = v - (spring.moving ? delta : 0);
        const state = elasticOnly
            ? { force: spring.k * relative, tangent: spring.k, plastic: 0, alpha: 0, yielded: false }
            : returnMap(spring.k, spring.cap, spring.H, relative, spring.vp, spring.alpha);
        spring.force = state.force;
        spring.trialVp = state.plastic;
        spring.trialAlpha = state.alpha;
        spring.yielded = state.yielded;
        for (let r = 0; r < 4; r++) {
            fint[dofs[r]] += state.force * spring.N[r];
            for (let s = 0; s < 4; s++)
                if (dofs[s] >= dofs[r])
                    addBand(band, dofs[r], dofs[s], state.tangent * spring.N[r] * spring.N[s]);
        }
        // load: the moving timber member is dragged by -force; fixed timber is pushed by +force
        const transmits = model.layout.timberMoves ? spring.moving : true;
        if (transmits) {
            const sign = spring.moving ? -1 : 1;
            load += sign * state.force;
            hardening += spring.H * state.alpha;
        }
    }
    for (const hinge of model.hinges) {
        const rotation = (hinge.right >= 0 ? u[hinge.right] : 0) - (hinge.left >= 0 ? u[hinge.left] : 0);
        const state = elasticOnly
            ? { force: hinge.K * rotation, tangent: hinge.K, plastic: 0, alpha: 0, yielded: false }
            : returnMap(hinge.K, hinge.Mp, hinge.H, rotation, hinge.thp, hinge.alpha);
        hinge.moment = state.force;
        hinge.trialThp = state.plastic;
        hinge.trialAlpha = state.alpha;
        hinge.yielded = state.yielded;
        if (hinge.right >= 0) {
            fint[hinge.right] += state.force;
            addBand(band, hinge.right, hinge.right, state.tangent);
        }
        if (hinge.left >= 0) {
            fint[hinge.left] -= state.force;
            addBand(band, hinge.left, hinge.left, state.tangent);
        }
        if (hinge.left >= 0 && hinge.right >= 0)
            addBand(band, hinge.left, hinge.right, -state.tangent);
    }
    let reaction = 0;
    for (const dof of model.prescribed)
        reaction += fint[dof];
    return { fint, band, load, reaction, hardening };
}
function commit(model) {
    for (const spring of model.springs) {
        spring.vp = spring.trialVp;
        spring.alpha = spring.trialAlpha;
    }
    for (const hinge of model.hinges) {
        hinge.thp = hinge.trialThp;
        hinge.alpha = hinge.trialAlpha;
    }
}
function applyPrescribed(model, band, residual) {
    const w = HALF_BAND + 1;
    for (const dof of model.prescribed) {
        for (let k = Math.max(0, dof - HALF_BAND); k < dof; k++)
            band[k * w + (dof - k)] = 0;
        for (let j = dof + 1; j <= Math.min(model.nDof - 1, dof + HALF_BAND); j++)
            band[dof * w + (j - dof)] = 0;
        band[dof * w] = 1;
        residual[dof] = 0;
    }
}
/** Out-of-balance forces (prescribed equations zeroed) and the matching tangent rows. */
function residualOf(model, evaluation) {
    const residual = evaluation.fint.map(value => -value);
    applyPrescribed(model, evaluation.band, residual);
    return residual;
}
/** Largest residual force (N) and moment (N mm), and a Euclidean merit with moments divided by d. */
function residualNorms(residual, d) {
    let force = 0, moment = 0, sum = 0;
    for (let i = 0; i < residual.length; i++) {
        const value = Math.abs(residual[i]);
        if (i % 3 !== 0) {
            moment = Math.max(moment, value);
            sum += (value / d) ** 2;
        }
        else {
            force = Math.max(force, value);
            sum += value * value;
        }
    }
    return { force, moment, merit: Math.sqrt(sum) };
}
/** Load per shear plane of the linear-elastic model at a unit slip (initial stiffness, N/mm). */
function elasticStiffness(model) {
    const u = new Float64Array(model.nDof);
    for (const dof of model.prescribed)
        u[dof] = 1;
    const first = evaluate(model, u, 1, true);
    const residual = first.fint.map(value => -value);
    applyPrescribed(model, first.band, residual);
    const du = solveBanded(model.nDof, first.band, residual);
    for (let i = 0; i < model.nDof; i++)
        u[i] += du[i];
    const final = evaluate(model, u, 1, true);
    return final.load / model.layout.planes;
}
function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}
/** Tangent matrix for a given set of yielding components, and the derivative of the internal forces with respect to the slip. */
function tangentFor(model, springPlastic, hingePlastic, hardeningScale = 1) {
    const band = new Float64Array(model.nDof * (HALF_BAND + 1));
    const dfdDelta = new Float64Array(model.nDof);
    for (let e = 0; e < model.elements.length; e++) {
        const { L, EI } = model.elements[e];
        const dofs = [vDof(e), thetaA(e), vDof(e + 1), thetaB(e)];
        const c = EI / L ** 3;
        const K = [
            [12 * c, 6 * L * c, -12 * c, 6 * L * c],
            [6 * L * c, 4 * L * L * c, -6 * L * c, 2 * L * L * c],
            [-12 * c, -6 * L * c, 12 * c, -6 * L * c],
            [6 * L * c, 2 * L * L * c, -6 * L * c, 4 * L * L * c]
        ];
        for (let r = 0; r < 4; r++)
            for (let s = 0; s < 4; s++)
                if (dofs[s] >= dofs[r])
                    addBand(band, dofs[r], dofs[s], K[r][s]);
    }
    model.springs.forEach((spring, index) => {
        const e = spring.element;
        const dofs = [vDof(e), thetaA(e), vDof(e + 1), thetaB(e)];
        const H = spring.H * hardeningScale;
        const kt = springPlastic[index] ? spring.k * H / (spring.k + H) : spring.k;
        for (let r = 0; r < 4; r++) {
            if (spring.moving)
                dfdDelta[dofs[r]] -= kt * spring.N[r];
            for (let s = 0; s < 4; s++)
                if (dofs[s] >= dofs[r])
                    addBand(band, dofs[r], dofs[s], kt * spring.N[r] * spring.N[s]);
        }
    });
    model.hinges.forEach((hinge, index) => {
        const H = hinge.H * hardeningScale;
        const kt = hingePlastic[index] ? hinge.K * H / (hinge.K + H) : hinge.K;
        if (hinge.right >= 0)
            addBand(band, hinge.right, hinge.right, kt);
        if (hinge.left >= 0)
            addBand(band, hinge.left, hinge.left, kt);
        if (hinge.left >= 0 && hinge.right >= 0)
            addBand(band, hinge.left, hinge.right, -kt);
    });
    return { band, dfdDelta };
}
/** Displacement rate du/d(delta) for a tangent: prescribed plate displacements move with rate 1. */
function rateSolve(model, band, dfdDelta) {
    const w = HALF_BAND + 1;
    const rhs = dfdDelta.map(value => -value);
    const prescribed = new Set(model.prescribed);
    for (const p of model.prescribed) {
        for (let i = Math.max(0, p - HALF_BAND); i <= Math.min(model.nDof - 1, p + HALF_BAND); i++) {
            if (i === p || prescribed.has(i))
                continue;
            const kip = i < p ? band[i * w + (p - i)] : band[p * w + (i - p)];
            rhs[i] -= kip;
        }
    }
    const copy = band.slice();
    const residual = Float64Array.from(rhs);
    applyPrescribed(model, copy, residual);
    for (const p of model.prescribed)
        residual[p] = 1;
    return solveBanded(model.nDof, copy, residual);
}
const springRate = (spring, rate) => {
    const e = spring.element;
    return spring.N[0] * rate[vDof(e)] + spring.N[1] * rate[thetaA(e)] + spring.N[2] * rate[vDof(e + 1)] + spring.N[3] * rate[thetaB(e)] - (spring.moving ? 1 : 0);
};
const hingeRate = (hinge, rate) => (hinge.right >= 0 ? rate[hinge.right] : 0) - (hinge.left >= 0 ? rate[hinge.left] : 0);
/**
 * Runs the displacement-controlled analysis to the collapse load or to the
 * largest slip. The model is piecewise linear, so the analysis proceeds from
 * event to event (a spring or hinge reaching its plastic limit, or a yielded
 * one unloading): in each increment the set of yielding components is found by
 * an active-set iteration (capped), the increment ends exactly at the next
 * event or at the step limit, and equilibrium is then verified with the full
 * return mapping against the residual tolerances in N and N mm. A residual
 * above the tolerance is corrected by Newton iterations (capped, with an
 * increment tolerance in mm); if that fails the analysis stops with an error.
 */
export function analyseDowelFe(input) {
    const started = now();
    const model = buildModel(input);
    const tol = DOWEL_FE_TOLERANCES;
    const d = model.d;
    const rigid = (input.embedment ?? "rigid-plastic") === "rigid-plastic";
    const maxSlip = input.maxSlip ?? (rigid ? 0.5 * d : 15);
    const maxSteps = input.maxSteps ?? 5000;
    if (!(maxSlip > 0))
        throw new DowelFeError("maxSlip must be positive");
    const K0 = elasticStiffness(model);
    const planes = model.layout.planes;
    const stepMax = maxSlip / 100;
    const baseForceTol = tol.forceN + tol.forceRelative * model.capacityTotal;
    // round-off floor of the residual: 16 eps max(K_ii) max|u| (N); the stiff fastener on short elements sets max(K_ii)
    const elasticBand = tangentFor(model, new Uint8Array(model.springs.length), new Uint8Array(model.hinges.length)).band;
    let diagonalMax = 0;
    for (let i = 0; i < model.nDof; i++)
        if (i % 3 === 0)
            diagonalMax = Math.max(diagonalMax, elasticBand[i * (HALF_BAND + 1)]);
    const toleranceAt = (displacement) => {
        let uMax = 0;
        for (let i = 0; i < model.nDof; i += 3)
            uMax = Math.max(uMax, Math.abs(displacement[i]));
        const force = baseForceTol + 16 * Number.EPSILON * diagonalMax * uMax;
        return { force, moment: force * d };
    };
    const dispTol = tol.displacementMm;
    const atLimit = 1 - 1e-9;
    let u = new Float64Array(model.nDof);
    let delta = 0;
    const curve = [{ slip: 0, load: 0 }];
    // load of the perfectly plastic model (integral of the extrapolated load rate): no drift from the post-yield stiffness
    const plasticCurve = [{ slip: 0, load: 0 }];
    let iterations = 0, maxIterationsInStep = 0, corrections = 0, steps = 0;
    let collapsed = false;
    let collapse = { plasticLoad: NaN, slip: NaN, hardening: NaN };
    // after the collapse the analysis follows the mechanism a little further, so that the hinges and the plateau show
    let endSlip = maxSlip;
    let last = evaluate(model, u, 0);
    commit(model);
    const springPlastic = new Uint8Array(model.springs.length);
    const hingePlastic = new Uint8Array(model.hinges.length);
    while (delta < endSlip * (1 - 1e-12)) {
        if (steps >= maxSteps)
            throw new DowelFeError(`The analysis needed more than ${maxSteps} increments before the collapse load or a slip of ${maxSlip} mm`);
        // active set: components at their plastic limit that keep loading
        model.springs.forEach((spring, i) => { springPlastic[i] = Math.abs(spring.force) >= (spring.cap + spring.H * spring.alpha) * atLimit ? 1 : 0; });
        model.hinges.forEach((hinge, i) => { hingePlastic[i] = Math.abs(hinge.moment) >= (hinge.Mp + hinge.H * hinge.alpha) * atLimit ? 1 : 0; });
        let rate = null;
        let tangent = null;
        for (let iteration = 1; iteration <= tol.maxIterations; iteration++) {
            iterations++;
            tangent = tangentFor(model, springPlastic, hingePlastic);
            rate = rateSolve(model, tangent.band, tangent.dfdDelta);
            let changed = false;
            model.springs.forEach((spring, i) => {
                if (springPlastic[i] && Math.sign(spring.force) * springRate(spring, rate) < 0) {
                    springPlastic[i] = 0;
                    changed = true;
                }
            });
            model.hinges.forEach((hinge, i) => {
                if (hingePlastic[i] && Math.sign(hinge.moment) * hingeRate(hinge, rate) < 0) {
                    hingePlastic[i] = 0;
                    changed = true;
                }
            });
            if (!changed) {
                maxIterationsInStep = Math.max(maxIterationsInStep, iteration);
                break;
            }
            if (iteration === tol.maxIterations)
                throw new DowelFeError(`The set of yielding components did not settle in ${tol.maxIterations} iterations at a slip of ${delta.toFixed(4)} mm`);
        }
        // load rate of the perfectly plastic model: the rate is linear in the small post-yield stiffness H for a
        // given set of yielding components, so rate(H = 0) = 2 rate(H) - rate(2 H) (Richardson extrapolation)
        const loadRateWith = (displacementRate, scale) => {
            let total = 0;
            model.springs.forEach((spring, i) => {
                if (!(model.layout.timberMoves ? spring.moving : true))
                    return;
                const H = spring.H * scale;
                const kt = springPlastic[i] ? spring.k * H / (spring.k + H) : spring.k;
                total += (spring.moving ? -1 : 1) * kt * springRate(spring, displacementRate);
            });
            return total / planes;
        };
        const doubled = tangentFor(model, springPlastic, hingePlastic, 2);
        const loadRate = 2 * loadRateWith(rate, 1) - loadRateWith(rateSolve(model, doubled.band, doubled.dfdDelta), 2);
        // slip increment to the next event
        let increment = Math.min(stepMax, endSlip - delta);
        model.springs.forEach((spring, i) => {
            const r = springRate(spring, rate);
            if (springPlastic[i] || r === 0)
                return;
            const limit = spring.cap + spring.H * spring.alpha;
            const fRate = spring.k * r;
            const room = fRate > 0 ? limit - spring.force : limit + spring.force;
            increment = Math.min(increment, Math.max(room, 0) / Math.abs(fRate));
        });
        model.hinges.forEach((hinge, i) => {
            const r = hingeRate(hinge, rate);
            if (hingePlastic[i] || r === 0)
                return;
            const limit = hinge.Mp + hinge.H * hinge.alpha;
            const mRate = hinge.K * r;
            const room = mRate > 0 ? limit - hinge.moment : limit + hinge.moment;
            increment = Math.min(increment, Math.max(room, 0) / Math.abs(mRate));
        });
        const loadNow = last.load / planes;
        const plasticLoadNow = plasticCurve[plasticCurve.length - 1].load;
        const window = tol.plateauSlip * d;
        const plateau = delta >= window && plasticLoadNow - loadAtSlip(plasticCurve, delta - window) <= Math.max(tol.plateauForceN, tol.plateauRelative * plasticLoadNow);
        if (!collapsed && steps > 0 && (loadRate <= tol.plateauTangent * K0 || plateau)) {
            collapsed = true;
            collapse = { plasticLoad: plasticLoadNow, slip: delta, hardening: loadNow - plasticLoadNow };
            endSlip = Math.min(maxSlip, Math.max(1.25 * delta, delta + 0.02 * d));
            if (delta >= endSlip * (1 - 1e-12))
                break;
            increment = Math.min(increment, endSlip - delta);
        }
        increment = Math.max(increment, 1e-12 * d);
        // exact increment, then the equilibrium check with the full return mapping
        const trial = Float64Array.from(u);
        for (let i = 0; i < model.nDof; i++)
            trial[i] += rate[i] * increment;
        const target = delta + increment;
        let evaluation = evaluate(model, trial, target);
        let residual = residualOf(model, evaluation);
        let norms = residualNorms(residual, d);
        let limits = toleranceAt(trial);
        let lastCorrection = 0;
        for (let iteration = 1; norms.force > limits.force || norms.moment > limits.moment || lastCorrection > dispTol; iteration++) {
            if (iteration > tol.maxIterations) {
                throw new DowelFeError(`Equilibrium was not restored at a slip of ${target.toFixed(4)} mm in ${tol.maxIterations} Newton iterations (residual ${norms.force.toExponential(2)} N > ${limits.force.toExponential(2)} N or increment ${lastCorrection.toExponential(2)} mm > ${dispTol} mm)`);
            }
            corrections++;
            const correction = solveBanded(model.nDof, evaluation.band, residual);
            lastCorrection = 0;
            for (let i = 0; i < model.nDof; i++) {
                trial[i] += correction[i];
                lastCorrection = Math.max(lastCorrection, Math.abs(correction[i]) * (i % 3 !== 0 ? d : 1));
            }
            evaluation = evaluate(model, trial, target);
            residual = residualOf(model, evaluation);
            norms = residualNorms(residual, d);
            limits = toleranceAt(trial);
        }
        commit(model);
        u = trial;
        delta = target;
        steps++;
        last = evaluation;
        curve.push({ slip: delta, load: evaluation.load / planes });
        plasticCurve.push({ slip: delta, load: plasticCurve[plasticCurve.length - 1].load + loadRate * increment });
    }
    const plasticEnd = plasticCurve[plasticCurve.length - 1].load;
    const loadEnd = collapsed ? collapse.plasticLoad : plasticEnd;
    const equilibriumErrorN = model.prescribed.length ? Math.abs(last.load - last.reaction) / planes : 0;
    const hardeningN = collapsed ? collapse.hardening : last.load / planes - plasticEnd;
    const members = memberStates(model);
    const hinges = hingeList(model, d);
    const { mode, mechanism } = classify(model, input, hinges, members);
    return {
        configuration: input.configuration,
        plate: input.configuration === "steel-single" || input.configuration === "steel-outer" ? input.plate ?? null : null,
        planes,
        collapseLoad: loadEnd,
        collapsed,
        slipAtCollapse: collapsed ? collapse.slip : null,
        slipAtEnd: delta,
        initialStiffness: K0,
        curve: plasticCurve,
        shape: { z: [...model.z], v: model.z.map((_, i) => u[vDof(i)]), member: [...model.nodeMember] },
        embedment: {
            z: model.springs.map(spring => spring.z),
            ratio: model.springs.map(spring => spring.force / (spring.cap + spring.H * spring.alpha)),
            member: model.springs.map(spring => spring.member)
        },
        members,
        plates: model.layout.plates.map(plate => ({ ...plate })),
        hinges,
        mode,
        mechanism,
        hardeningN,
        equilibriumErrorN,
        stats: { steps, iterations, maxIterationsInStep, corrections, dofs: model.nDof, elementsPerMember: input.elementsPerMember ?? 80, timingMs: now() - started }
    };
}
function memberStates(model) {
    return model.layout.members.map((member, m) => {
        let positive = 0, negative = 0;
        for (const spring of model.springs) {
            if (spring.member !== m)
                continue;
            const limit = spring.cap + spring.H * spring.alpha;
            if (spring.alpha > 0 && Math.abs(spring.force) >= limit * (1 - 1e-9)) {
                const share = spring.cap / (member.fh * model.d) / (member.z1 - member.z0);
                if (spring.force > 0)
                    positive += share;
                else
                    negative += share;
            }
        }
        const total = positive + negative;
        const pattern = Math.max(positive, negative) >= 0.995 ? "translation"
            : positive > 0.02 && negative > 0.02 && total >= 0.9 ? "rotation"
                : total > 0 ? "partial" : "elastic";
        return { name: member.name, z0: member.z0, z1: member.z1, moving: member.moving, yieldedPositive: positive, yieldedNegative: negative, pattern };
    });
}
/** Active plastic hinges, adjacent hinge nodes merged into one hinge at their rotation-weighted position. */
function hingeList(model, d) {
    const active = model.hinges.filter(hinge => hinge.alpha > 1e-7 && Math.abs(hinge.moment) >= (hinge.Mp + hinge.H * hinge.alpha) * (1 - 1e-6));
    active.sort((a, b) => a.z - b.z || (a.plate ? -1 : 1));
    const groups = [];
    for (const hinge of active) {
        const group = groups[groups.length - 1];
        const previous = group?.[group.length - 1];
        const adjacent = previous && !previous.plate && !hinge.plate && Math.abs(hinge.node - previous.node) <= 1;
        if (group && adjacent)
            group.push(hinge);
        else
            groups.push([hinge]);
    }
    void d;
    return groups.map(group => {
        const rotation = group.reduce((sum, hinge) => sum + hinge.alpha, 0);
        const z = group.reduce((sum, hinge) => sum + hinge.z * hinge.alpha, 0) / rotation;
        const plate = group.find(hinge => hinge.plate)?.plate ?? null;
        const node = group.reduce((best, hinge) => hinge.alpha > best.alpha ? hinge : best, group[0]);
        const memberIndex = model.layout.members.findIndex(member => z > member.z0 + 1e-9 && z < member.z1 - 1e-9);
        const member = plate ? plate : memberIndex >= 0 ? model.layout.members[memberIndex].name : `interface z = ${z.toFixed(2)}`;
        return { z, member, plate, rotation, moment: Math.abs(node.moment) };
    });
}
function classify(model, input, hinges, members) {
    const c = input.configuration;
    const inMember = (name) => hinges.filter(hinge => hinge.member === name).length;
    const atPlates = hinges.filter(hinge => hinge.plate !== null).length;
    const inTimber = hinges.length - atPlates;
    const state = (name) => members.find(member => member.name === name)?.pattern ?? "elastic";
    const hingeText = hinges.length === 0 ? "no plastic hinge"
        : `${hinges.length} plastic hinge${hinges.length > 1 ? "s" : ""} (${hinges.map(hinge => `${hinge.plate ? `at the ${hinge.plate}` : `${hinge.member}, z = ${hinge.z.toFixed(1)} mm`}`).join("; ")})`;
    const embedText = members.map(member => `${member.name}: ${member.pattern === "translation" ? "embedment over the full thickness" : member.pattern === "rotation" ? "embedment with rotation of the fastener" : member.pattern === "partial" ? "embedment yields in part" : "elastic"}`).join("; ");
    let mode = "";
    // pure embedment over a whole member decides the mode even if hinges formed that do not take part in the mechanism
    const translation = (name) => state(name) === "translation";
    if (c === "timber-single" && translation("member 1") !== translation("member 2"))
        mode = translation("member 1") ? "(8.6 a)" : "(8.6 b)";
    else if (c === "timber-double" && (translation("inner member") || (translation("outer member A") && translation("outer member B"))))
        mode = translation("inner member") ? "(8.7 h)" : "(8.7 g)";
    else if (c === "steel-single" && input.plate === "thick" && translation("timber member"))
        mode = "(8.10 e)";
    else if (c === "steel-slotted" && translation("timber side A") && translation("timber side B"))
        mode = "(8.11 f)";
    else if (c === "steel-outer" && translation("timber member"))
        mode = input.plate === "thin" ? "(8.12 j)" : "(8.13 l)";
    else if (c === "timber-single") {
        const h1 = inMember("member 1"), h2 = inMember("member 2");
        if (h1 === 0 && h2 === 0 && hinges.length === 0) {
            const s1 = state("member 1"), s2 = state("member 2");
            mode = s1 === "translation" && s2 !== "translation" ? "(8.6 a)" : s2 === "translation" && s1 !== "translation" ? "(8.6 b)" : s1 === "rotation" && s2 === "rotation" ? "(8.6 c)" : "";
        }
        else if (h1 === 0 && h2 >= 1 && hinges.length === h2)
            mode = "(8.6 d)";
        else if (h1 >= 1 && h2 === 0 && hinges.length === h1)
            mode = "(8.6 e)";
        else if (h1 >= 1 && h2 >= 1)
            mode = "(8.6 f)";
    }
    else if (c === "timber-double") {
        const outer = inMember("outer member A") + inMember("outer member B");
        const inner = inMember("inner member");
        if (hinges.length === 0) {
            mode = state("outer member A") === "translation" && state("outer member B") === "translation" ? "(8.7 g)" : state("inner member") === "translation" ? "(8.7 h)" : "";
        }
        else if (outer === 0 && inner >= 1 && inner === hinges.length)
            mode = "(8.7 j)";
        else if (outer >= 1 && inner >= 1)
            mode = "(8.7 k)";
    }
    else if (c === "steel-single") {
        if (input.plate === "thin")
            mode = inTimber === 0 && atPlates === 0 ? (state("timber member") === "rotation" ? "(8.9 a)" : "") : atPlates === 0 ? "(8.9 b)" : "";
        else
            mode = atPlates === 0 && inTimber === 0 ? (state("timber member") === "translation" ? "(8.10 e)" : "") : atPlates === 1 && inTimber === 0 ? "(8.10 c)" : atPlates === 1 && inTimber >= 1 ? "(8.10 d)" : "";
    }
    else if (c === "steel-slotted") {
        mode = hinges.length === 0 ? (state("timber side A") === "translation" ? "(8.11 f)" : "") : atPlates === 1 && inTimber === 0 ? "(8.11 g)" : atPlates === 1 && inTimber >= 1 ? "(8.11 h)" : "";
    }
    else {
        if (input.plate === "thin")
            mode = hinges.length === 0 ? (state("timber member") === "translation" ? "(8.12 j)" : "") : atPlates === 0 ? "(8.12 k)" : "";
        else
            mode = hinges.length === 0 ? (state("timber member") === "translation" ? "(8.13 l)" : "") : atPlates >= 1 && inTimber >= 1 ? "(8.13 m)" : "";
    }
    void model;
    return { mode, mechanism: `${hingeText}; ${embedText}` };
}
/** EN 1995-1-1 (8.6), (8.7), (8.9)-(8.13) per shear plane without the rope effect, with the mechanical values. */
export function johansenReference(input) {
    const { d, My } = input;
    const t1 = input.t1 ?? NaN, t2 = input.t2 ?? NaN, f1 = input.fh1 ?? NaN, f2 = input.fh2 ?? NaN;
    const mode = (key, mechanical, factor = 1) => ({ key, en: mechanical * factor, mechanical, factor });
    const modes = [];
    const oneHinge = (fh, t, beta) => fh * t * d / (2 + beta) * (Math.sqrt(2 * beta * (1 + beta) + 4 * beta * (2 + beta) * My / (fh * d * t * t)) - beta);
    const twoHinges = (fh, beta) => Math.sqrt(2 * beta / (1 + beta)) * Math.sqrt(2 * My * fh * d);
    switch (input.configuration) {
        case "timber-single": {
            const beta = f2 / f1, r = t2 / t1;
            modes.push(mode("(8.6 a)", f1 * t1 * d), mode("(8.6 b)", f2 * t2 * d), mode("(8.6 c)", f1 * t1 * d / (1 + beta) * (Math.sqrt(beta + 2 * beta ** 2 * (1 + r + r * r) + beta ** 3 * r * r) - beta * (1 + r))), mode("(8.6 d)", oneHinge(f1, t1, beta), 1.05), mode("(8.6 e)", f1 * t2 * d / (1 + 2 * beta) * (Math.sqrt(2 * beta ** 2 * (1 + beta) + 4 * beta * (1 + 2 * beta) * My / (f1 * d * t2 * t2)) - beta), 1.05), mode("(8.6 f)", twoHinges(f1, beta), 1.15));
            break;
        }
        case "timber-double": {
            const beta = f2 / f1;
            modes.push(mode("(8.7 g)", f1 * t1 * d), mode("(8.7 h)", 0.5 * f2 * t2 * d), mode("(8.7 j)", oneHinge(f1, t1, beta), 1.05), mode("(8.7 k)", twoHinges(f1, beta), 1.15));
            break;
        }
        case "steel-single":
            if (input.plate === "thin")
                modes.push(mode("(8.9 a)", (Math.SQRT2 - 1) * f1 * t1 * d, 0.4 / (Math.SQRT2 - 1)), mode("(8.9 b)", Math.sqrt(2 * My * f1 * d), 1.15));
            else
                modes.push(mode("(8.10 c)", f1 * t1 * d * (Math.sqrt(2 + 4 * My / (f1 * d * t1 * t1)) - 1)), mode("(8.10 d)", 2 * Math.sqrt(My * f1 * d), 1.15), mode("(8.10 e)", f1 * t1 * d));
            break;
        case "steel-slotted":
            modes.push(mode("(8.11 f)", f1 * t1 * d), mode("(8.11 g)", f1 * t1 * d * (Math.sqrt(2 + 4 * My / (f1 * d * t1 * t1)) - 1)), mode("(8.11 h)", 2 * Math.sqrt(My * f1 * d), 1.15));
            break;
        case "steel-outer":
            if (input.plate === "thin")
                modes.push(mode("(8.12 j)", 0.5 * f2 * t2 * d), mode("(8.12 k)", Math.sqrt(2 * My * f2 * d), 1.15));
            else
                modes.push(mode("(8.13 l)", 0.5 * f2 * t2 * d), mode("(8.13 m)", 2 * Math.sqrt(My * f2 * d), 1.15));
            break;
    }
    if (!modes.length || modes.some(item => !Number.isFinite(item.mechanical)))
        throw new DowelFeError("Johansen reference needs d, My and the thicknesses and embedment strengths of the configuration");
    const minBy = (pick) => modes.reduce((best, item) => pick(item) < pick(best) ? item : best, modes[0]);
    return { modes, governingEn: minBy(item => item.en), governingMechanical: minBy(item => item.mechanical) };
}
// ------------------------------------------------------------------ calibration and page verification
/**
 * Foundation moduli k1 = c w1, k2 = c w2 (N/mm per mm) such that the initial
 * stiffness of the elastic FE model per shear plane equals the target slip
 * modulus (N/mm). Bracket from the rigid-fastener estimate K / t, then
 * bisection on log c to a relative tolerance of 1e-6 on the stiffness, at most
 * 200 bisections; fails closed otherwise.
 */
export function calibrateFoundationModulus(input, target, weights = { w1: 1, w2: 1 }) {
    if (!(target > 0))
        throw new DowelFeError("Target slip modulus must be positive");
    const stiffnessAt = (c) => elasticStiffness(buildModel({ ...input, embedment: "elastoplastic", k1: c * weights.w1, k2: c * weights.w2 }));
    // bracket around the estimate of a rigid fastener, k ~ K / t (members in series), widened by factors of 4
    const thickness = Math.max(input.t1 ?? 0, input.t2 ?? 0);
    const estimate = target / thickness / Math.max(weights.w1, weights.w2);
    let lo = estimate / 4, hi = estimate * 4;
    let iterations = 0;
    while (stiffnessAt(hi) < target) {
        hi *= 4;
        if (++iterations > 20)
            throw new DowelFeError("Slip modulus calibration: no upper bracket");
    }
    while (stiffnessAt(lo) > target) {
        lo /= 4;
        if (++iterations > 40)
            throw new DowelFeError("Slip modulus calibration: no lower bracket");
    }
    for (let i = 0; i < 200; i++) {
        iterations++;
        const mid = Math.sqrt(lo * hi);
        const value = stiffnessAt(mid);
        if (Math.abs(value - target) <= 1e-6 * target || hi / lo - 1 < 1e-12)
            return { k1: mid * weights.w1, k2: mid * weights.w2, stiffness: value, iterations };
        if (value < target)
            lo = mid;
        else
            hi = mid;
    }
    throw new DowelFeError("Slip modulus calibration did not converge in 200 bisections");
}
/** FE check of one fastener for a page: rigid-plastic collapse and an elastoplastic force-slip curve. */
export function verifyFastenerFe(spec) {
    const started = now();
    const needsPlate = spec.configuration === "steel-single" || spec.configuration === "steel-outer";
    let plates = [null];
    let plateFactor = null;
    if (needsPlate) {
        const ts = requirePositive(spec.ts, "ts");
        plateFactor = Math.min(1, Math.max(0, (ts - 0.5 * spec.d) / (0.5 * spec.d)));
        plates = plateFactor <= 0 ? ["thin"] : plateFactor >= 1 ? ["thick"] : ["thin", "thick"];
    }
    const runs = plates.map(plate => {
        const base = {
            configuration: spec.configuration, d: spec.d, My: spec.My, t1: spec.t1, t2: spec.t2, fh1: spec.fh1, fh2: spec.fh2,
            ...(plate ? { plate } : {}), elementsPerMember: spec.elementsPerMember ?? 80
        };
        const rigid = analyseDowelFe({ ...base, embedment: "rigid-plastic", dowel: "rigid-plastic" });
        const foundation = calibrateFoundationModulus({ ...base, dowel: "elastoplastic" }, spec.kser, spec.weights);
        const elastic = analyseDowelFe({ ...base, embedment: "elastoplastic", dowel: "elastoplastic", k1: foundation.k1, k2: foundation.k2, maxSlip: spec.maxSlip ?? 15 });
        return { plate, rigid, elastic, johansen: johansenReference(base), foundation: { k1: foundation.k1, k2: foundation.k2 } };
    });
    const mix = (pick) => runs.length === 2 ? pick(runs[0]) + plateFactor * (pick(runs[1]) - pick(runs[0])) : pick(runs[0]);
    return {
        runs,
        plateFactor,
        feCollapse: mix(run => run.rigid.collapseLoad),
        johansenMechanical: mix(run => run.johansen.governingMechanical.mechanical),
        johansenEn: mix(run => run.johansen.governingEn.en),
        elasticAtEnd: mix(run => run.elastic.collapseLoad),
        elasticSlip: Math.max(...runs.map(run => run.elastic.slipAtEnd)),
        timingMs: now() - started
    };
}
/** Load of a force-slip curve at a slip (linear interpolation), N; beyond the end: plateau if given, else NaN. */
export function loadAtSlip(curve, slip, plateau) {
    if (slip <= 0)
        return 0;
    for (let i = 1; i < curve.length; i++) {
        const a = curve[i - 1], b = curve[i];
        if (b.slip >= slip)
            return a.load + (b.load - a.load) * (slip - a.slip) / (b.slip - a.slip);
    }
    return plateau ?? NaN;
}
