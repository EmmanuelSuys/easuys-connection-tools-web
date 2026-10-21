/**
 * Elastic bolt-force distribution in bolted plates (membrane FE, membrane.ts):
 *
 * - lap joint: two plates (t1, t2) overlapping in one plane, n_rows bolt rows
 *   along the force and n_cols bolts per row; plate 1 pulled at its far end,
 *   plate 2 held at its far end. Compared with a 1D bar-spring chain (plates
 *   as bars E b t between the rows, one spring n_cols k_b per row; the
 *   classical discrete model of Tate and Rosenfeld, 1946) and with the
 *   long-joint factor beta_Lf of EN 1993-1-8 3.8 (3.5).
 * - bolt group under in-plane eccentric load: one plate on bolts to a rigid
 *   support, loaded by (V_x, V_z, T) about the bolt-group centroid. Compared
 *   with the elastic polar-moment method (rigid plate, equal bolts).
 *
 * Bolt spring stiffness per bolt and shear plane from EN 1993-1-8:2005 Table
 * 6.11: bolts in shear k11 = 16 n_b d^2 f_ub / (E d_M16), bolts in bearing
 * k12 = 24 n_b k_b k_t d f_u / E per plate (k_b = min(k_b1, k_b2),
 * k_b1 = 0.25 e_b/d + 0.5 <= 1.25, k_b2 = 0.25 p_b/d + 0.375 <= 1.25,
 * k_t = 1.5 t/d_M16 <= 2.5), in series: k = E / (1/k11 + sum 1/k12), n_b = 1.
 * The same stiffness acts in both in-plane directions. Bolt load is spread
 * over the bolt disk (diameter d) of each plate (membrane.ts diskWeights).
 *
 * This is an elastic distribution check (linear, no holes, no slip, no
 * bearing plasticity, no out-of-plane bending of a single lap): it is not a
 * resistance. Units N, mm, MPa.
 */
import { solveDense } from "./linalg.js";
import { addGrid, couplingForce, diskWeights, elementStresses, gridLine, solvePlaneModel, vonMises } from "./membrane.js";
export const BOLT_FE_VERSION = "bolt-fe-0.1.0";
export const STEEL_E = 210000;
export const STEEL_NU = 0.3;
const D_M16 = 16;
export class BoltFeInputError extends Error {
    constructor(message) { super(message); this.name = "BoltFeInputError"; }
}
/** Bolt shear/bearing spring per bolt (EN 1993-1-8 Table 6.11, n_b = 1). pb = Infinity for a single row. */
export function boltShearStiffnessEN(d, fub, plates, eb, pb, E = STEEL_E) {
    const k11 = 16 * d * d * fub / (E * D_M16);
    const kb1 = Math.min(0.25 * eb / d + 0.5, 1.25);
    const kb2 = Number.isFinite(pb) ? Math.min(0.25 * pb / d + 0.375, 1.25) : 1.25;
    const kb = Math.min(kb1, kb2);
    const kt = plates.map(plate => Math.min(1.5 * plate.t / D_M16, 2.5));
    const k12 = plates.map((plate, i) => 24 * kb * kt[i] * d * plate.fu / E);
    const kEq = 1 / (1 / k11 + k12.reduce((sum, k) => sum + 1 / k, 0));
    return { k11, k12, kb, kt, kEq, stiffness: E * kEq };
}
/** EN 1993-1-8 3.8 (3.5): beta_Lf for L_j > 15 d, 0.75 <= beta_Lf <= 1. */
export function longJointFactor(Lj, d) {
    if (!(Lj > 15 * d))
        return 1;
    return Math.min(1, Math.max(0.75, 1 - (Lj - 15 * d) / (200 * d)));
}
/**
 * Discrete bar-spring chain of a lap joint (n rows): plate 1 (axial stiffness
 * EA1) loaded by F beyond the last row, its other end free; plate 2 (EA2) held
 * at supportLength before the first row. Spring kRow per row. Returns the
 * row forces (sum = F).
 */
export function lapJointChain(rows, pitch, EA1, EA2, kRow, F, supportLength) {
    if (rows === 1)
        return [F];
    const n = rows;
    const s1 = EA1 / pitch, s2 = EA2 / pitch, s0 = EA2 / supportLength;
    // unknowns: u1_i (0..n-1), u2_i (n..2n-1)
    const K = Array.from({ length: 2 * n }, () => Array(2 * n).fill(0));
    const f = Array(2 * n).fill(0);
    const add = (i, j, k) => { K[i][i] += k; K[j][j] += k; K[i][j] -= k; K[j][i] -= k; };
    for (let i = 0; i < n; i++)
        add(i, n + i, kRow);
    for (let i = 0; i + 1 < n; i++) {
        add(i, i + 1, s1);
        add(n + i, n + i + 1, s2);
    }
    K[n][n] += s0;
    f[n - 1] = F;
    const u = solveDense(K, f);
    return Array.from({ length: n }, (_, i) => kRow * (u[i] - u[n + i]));
}
function stressField(model, displacement) {
    const stresses = elementStresses(model, displacement);
    return {
        xy: Array.from(model.xy),
        quads: model.elements.flatMap(element => element.nodes),
        part: model.elements.map(element => element.part),
        sx: stresses.map(s => s[0]),
        sy: stresses.map(s => s[1]),
        txy: stresses.map(s => s[2]),
        vonMises: stresses.map(vonMises)
    };
}
function boltCouplings(model, parts, signs, x, y, r, stiffness) {
    const dofsX = [], dofsY = [], coeffs = [];
    parts.forEach((part, k) => {
        const disk = diskWeights(model, part, x, y, r);
        disk.nodes.forEach((node, i) => {
            dofsX.push(2 * node);
            dofsY.push(2 * node + 1);
            coeffs.push(signs[k] * disk.weights[i]);
        });
    });
    return [{ dofs: dofsX, coeffs, stiffness }, { dofs: dofsY, coeffs: [...coeffs], stiffness }];
}
function checkSize(nodeCount, fixedCount, maxDof) {
    const dofs = 2 * nodeCount - fixedCount;
    if (dofs > maxDof)
        throw new BoltFeInputError(`FE model too large (${dofs} DOF > ${maxDof}): choose a coarser mesh`);
}
/** Positions of the bolt columns across the width (centred). */
export function lapColumnPositions(b, cols, p2) {
    return Array.from({ length: cols }, (_, j) => b / 2 + (j - (cols - 1) / 2) * p2);
}
export function analyseLapJointFE(input) {
    const started = Date.now();
    const E = input.E ?? STEEL_E, nu = input.nu ?? STEEL_NU;
    const { t1, t2, b, d, rows, cols, e1, p1, p2, F } = input;
    for (const [name, value] of Object.entries({ t1, t2, b, d, e1, F, fu: input.fu, fub: input.fub })) {
        if (!(Number.isFinite(value) && value > 0))
            throw new BoltFeInputError(`${name} must be positive for the FE model`);
    }
    if (!(Number.isInteger(rows) && rows >= 1 && Number.isInteger(cols) && cols >= 1))
        throw new BoltFeInputError("rows and columns must be positive integers");
    if (rows > 1 && !(p1 > 0))
        throw new BoltFeInputError("p1 must be positive for the FE model when there is more than one row");
    if (cols > 1 && !(p2 > 0))
        throw new BoltFeInputError("p2 must be positive for the FE model when there is more than one column");
    const r = d / 2;
    const divisions = input.divisions ?? 4;
    const h = d / divisions;
    const overlap = 2 * e1 + (rows - 1) * p1;
    const freeLength = input.freeLength ?? Math.max(b, 2 * d, rows > 1 ? p1 : 0);
    const xRows = Array.from({ length: rows }, (_, i) => e1 + i * p1);
    const yCols = lapColumnPositions(b, cols, p2);
    if (e1 < r + 1e-9)
        throw new BoltFeInputError("e1 must exceed d/2 for the FE model");
    if (yCols[0] < r + 1e-9 || yCols[cols - 1] > b - r - 1e-9)
        throw new BoltFeInputError("the bolts do not fit across the plate width (b < (n_cols - 1) p2 + d)");
    if (rows > 1 && p1 < d)
        throw new BoltFeInputError("p1 must be at least d for the FE model");
    if (cols > 1 && p2 < d)
        throw new BoltFeInputError("p2 must be at least d for the FE model");
    const xBreaks = [-freeLength, 0, overlap, overlap + freeLength, ...xRows.flatMap(x => [x - r, x, x + r])];
    const yBreaks = [0, b, b / 2, ...yCols.flatMap(y => [y - r, y, y + r])];
    const xAll = gridLine(xBreaks, h);
    const yLine = gridLine(yBreaks, h);
    const tol = 1e-6;
    const x1 = xAll.filter(x => x >= -tol);
    const x2 = xAll.filter(x => x <= overlap + tol);
    const estimatedNodes = (x1.length + x2.length) * yLine.length;
    checkSize(estimatedNodes, yLine.length + 2, input.maxDof ?? 60000);
    const nodes = [];
    const elements = [];
    const grid1 = addGrid(nodes, elements, x1, yLine, 1, t1, E, nu);
    const grid2 = addGrid(nodes, elements, x2, yLine, 2, t2, E, nu);
    const model = { xy: Float64Array.from(nodes), elements, fixed: new Set(), loads: new Map(), couplings: [] };
    const mid = yLine.findIndex(y => Math.abs(y - b / 2) < tol);
    // plate 2 held at its far end: u_x on the edge, u_y at mid-width
    for (const row of grid2)
        model.fixed.add(2 * row[0]);
    model.fixed.add(2 * grid2[mid][0] + 1);
    // plate 1: anti-rotation support at mid-width of the loaded end (zero reaction by symmetry)
    const last = x1.length - 1;
    const antiRotationDof = 2 * grid1[mid][last] + 1;
    model.fixed.add(antiRotationDof);
    // uniform traction F / b on the loaded end of plate 1 (consistent nodal loads)
    for (let j = 0; j + 1 < yLine.length; j++) {
        const share = F * (yLine[j + 1] - yLine[j]) / b / 2;
        for (const jj of [j, j + 1]) {
            const dof = 2 * grid1[jj][last];
            model.loads.set(dof, (model.loads.get(dof) ?? 0) + share);
        }
    }
    const pb = rows > 1 ? p1 : Infinity;
    const stiffness = boltShearStiffnessEN(d, input.fub, [{ t: t1, fu: input.fu }, { t: t2, fu: input.fu }], e1, pb, E);
    const boltSprings = [];
    xRows.forEach((x, row) => yCols.forEach((y, col) => {
        const springs = boltCouplings(model, [1, 2], [1, -1], x, y, r, stiffness.stiffness);
        model.couplings.push(...springs);
        boltSprings.push({ row, col, x, y, springs });
    }));
    const solution = solvePlaneModel(model);
    const u = solution.displacement;
    const bolts = boltSprings.map((bolt, index) => {
        const fx = couplingForce(bolt.springs[0], u), fy = couplingForce(bolt.springs[1], u);
        return { id: index + 1, row: bolt.row + 1, col: bolt.col + 1, x: bolt.x, y: bolt.y, fx, fy, force: Math.hypot(fx, fy) };
    });
    const sumFx = bolts.reduce((sum, bolt) => sum + bolt.fx, 0);
    const equilibriumError = Math.abs(sumFx - F) / F;
    if (!(equilibriumError <= 1e-6))
        throw new Error(`FE equilibrium gate failed: sum of bolt forces ${sumFx} N for F = ${F} N`);
    const antiRotationReaction = solution.reactions.get(antiRotationDof) ?? 0;
    const rowForces = Array.from({ length: rows }, (_, i) => bolts.filter(bolt => bolt.row === i + 1).reduce((sum, bolt) => sum + bolt.fx, 0));
    const n = rows * cols;
    const peak = Math.max(...bolts.map(bolt => bolt.force));
    const peakToMean = peak / (F / n);
    const supportLength = freeLength + e1;
    const kRow = cols * stiffness.stiffness;
    const chainRowForces = lapJointChain(rows, p1 || 1, E * b * t1, E * b * t2, kRow, F, supportLength);
    const chainPeakToMean = Math.max(...chainRowForces) / (F / rows);
    const Lj = (rows - 1) * p1;
    const nMax = Math.max(rows, Math.min(40, rows > 1 ? Math.ceil(65 * d / p1) + 1 : 1));
    const etaCurve = [];
    if (rows > 1)
        for (let m = 1; m <= nMax; m++) {
            const forces = lapJointChain(m, p1, E * b * t1, E * b * t2, kRow, F, supportLength);
            const L = (m - 1) * p1;
            etaCurve.push({ rows: m, Lj: L, LjOverD: L / d, eta: (F / m) / Math.max(...forces), betaLf: longJointFactor(L, d) });
        }
    const field = stressField(model, u);
    return {
        bolts, rowForces, chainRowForces, uniformRowForce: F / rows,
        peakToMean, etaElastic: 1 / peakToMean, chainPeakToMean, chainEta: 1 / chainPeakToMean,
        Lj, betaLf: longJointFactor(Lj, d), etaCurve, stiffness,
        geometry: { overlap, freeLength, xRows, yCols },
        meshSize: h, dofCount: solution.dofCount, elementCount: elements.length,
        equilibriumError, antiRotationReaction,
        maxVonMises: Math.max(...field.vonMises), field,
        timingMs: Date.now() - started
    };
}
/** Elastic polar-moment method: F_i = V / n + T (-z_i, x_i) / sum r^2 (rigid plate, equal bolts). */
export function polarBoltForces(coordinates, Vx, Vz, T) {
    const n = coordinates.length;
    const Ip = coordinates.reduce((sum, c) => sum + c.x * c.x + c.z * c.z, 0);
    return coordinates.map(c => ({
        fx: Vx / n + (Ip > 1e-9 ? -T * c.z / Ip : 0),
        fz: Vz / n + (Ip > 1e-9 ? T * c.x / Ip : 0)
    }));
}
export function analyseBoltGroupFE(input) {
    const started = Date.now();
    const E = input.E ?? STEEL_E, nu = input.nu ?? STEEL_NU;
    const { t, d, rows, cols, pitchX, pitchZ, Vx, Vz, T } = input;
    for (const [name, value] of Object.entries({ t, d, fu: input.fu, fub: input.fub, edgeTop: input.edgeTop, edgeBottom: input.edgeBottom, edgeLeft: input.edgeLeft, edgeRight: input.edgeRight })) {
        if (!(Number.isFinite(value) && value > 0))
            throw new BoltFeInputError(`${name} must be positive for the FE model`);
    }
    if (!(Number.isInteger(rows) && rows >= 1 && Number.isInteger(cols) && cols >= 1))
        throw new BoltFeInputError("rows and columns must be positive integers");
    if (rows * cols < 2)
        throw new BoltFeInputError("the FE model needs at least two bolts (one bolt cannot carry a moment)");
    if (rows > 1 && !(pitchZ >= d))
        throw new BoltFeInputError("pitch_z must be at least d for the FE model");
    if (cols > 1 && !(pitchX >= d))
        throw new BoltFeInputError("pitch_x must be at least d for the FE model");
    const r = d / 2;
    if (Math.min(input.edgeTop, input.edgeBottom, input.edgeLeft, input.edgeRight) < r + 1e-9)
        throw new BoltFeInputError("edge distances must exceed d/2 for the FE model");
    if (!(Math.abs(Vx) + Math.abs(Vz) + Math.abs(T) > 0))
        throw new BoltFeInputError("the FE model needs a load");
    const divisions = input.divisions ?? 4;
    const h = d / divisions;
    const halfW = (cols - 1) * pitchX / 2, halfH = (rows - 1) * pitchZ / 2;
    const plate = { xMin: -halfW - input.edgeLeft, xMax: halfW + input.edgeRight, zMin: -halfH - input.edgeTop, zMax: halfH + input.edgeBottom };
    const coordinates = [];
    for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++)
            coordinates.push({ x: -halfW + col * pitchX, z: -halfH + row * pitchZ });
    const xLine = gridLine([plate.xMin, plate.xMax, ...coordinates.flatMap(c => [c.x - r, c.x, c.x + r])], h);
    const zLine = gridLine([plate.zMin, plate.zMax, ...coordinates.flatMap(c => [c.z - r, c.z, c.z + r])], h);
    checkSize(xLine.length * zLine.length, 0, input.maxDof ?? 60000);
    const nodes = [];
    const elements = [];
    addGrid(nodes, elements, xLine, zLine, 1, t, E * (input.plateStiffnessFactor ?? 1), nu);
    const model = { xy: Float64Array.from(nodes), elements, fixed: new Set(), loads: new Map(), couplings: [] };
    // load: rigid-body distribution over the plate area with the resultant (V_x, V_z, T) about the bolt centroid
    const nodeCount = nodes.length / 2;
    const mass = new Float64Array(nodeCount);
    for (const element of elements) {
        const xs = element.nodes.map(n => model.xy[2 * n]), zs = element.nodes.map(n => model.xy[2 * n + 1]);
        const area = 0.5 * Math.abs((xs[0] - xs[2]) * (zs[1] - zs[3]) - (xs[1] - xs[3]) * (zs[0] - zs[2]));
        for (const n of element.nodes)
            mass[n] += area / 4;
    }
    let A = 0, xBar = 0, zBar = 0;
    for (let n = 0; n < nodeCount; n++) {
        A += mass[n];
        xBar += mass[n] * model.xy[2 * n];
        zBar += mass[n] * model.xy[2 * n + 1];
    }
    xBar /= A;
    zBar /= A;
    let J = 0;
    for (let n = 0; n < nodeCount; n++)
        J += mass[n] * ((model.xy[2 * n] - xBar) ** 2 + (model.xy[2 * n + 1] - zBar) ** 2);
    const Trot = T - (xBar * Vz - zBar * Vx);
    for (let n = 0; n < nodeCount; n++) {
        const dx = model.xy[2 * n] - xBar, dz = model.xy[2 * n + 1] - zBar;
        const fx = mass[n] * (Vx / A - Trot * dz / J);
        const fz = mass[n] * (Vz / A + Trot * dx / J);
        if (fx !== 0)
            model.loads.set(2 * n, fx);
        if (fz !== 0)
            model.loads.set(2 * n + 1, fz);
    }
    const eb = Math.min(input.edgeTop, input.edgeBottom, input.edgeLeft, input.edgeRight);
    const pitches = [...(cols > 1 ? [pitchX] : []), ...(rows > 1 ? [pitchZ] : [])];
    const pb = pitches.length ? Math.min(...pitches) : Infinity;
    // support member assumed of the same thickness and steel as the plate (two plies in bearing)
    const stiffness = boltShearStiffnessEN(d, input.fub, [{ t, fu: input.fu }, { t, fu: input.fu }], eb, pb, E);
    const springs = coordinates.map(c => {
        const pair = boltCouplings(model, [1], [1], c.x, c.z, r, stiffness.stiffness);
        model.couplings.push(...pair);
        return pair;
    });
    const solution = solvePlaneModel(model);
    const u = solution.displacement;
    const polar = polarBoltForces(coordinates, Vx, Vz, T);
    const bolts = coordinates.map((c, i) => {
        const fx = couplingForce(springs[i][0], u), fz = couplingForce(springs[i][1], u);
        return { id: i + 1, x: c.x, z: c.z, fx, fz, force: Math.hypot(fx, fz), polarFx: polar[i].fx, polarFz: polar[i].fz, polarForce: Math.hypot(polar[i].fx, polar[i].fz) };
    });
    const sumFx = bolts.reduce((s, b) => s + b.fx, 0), sumFz = bolts.reduce((s, b) => s + b.fz, 0);
    const moment = bolts.reduce((s, b) => s + b.x * b.fz - b.z * b.fx, 0);
    const span = Math.max(plate.xMax - plate.xMin, plate.zMax - plate.zMin);
    const scale = Math.max(Math.abs(Vx), Math.abs(Vz), Math.abs(T) / span);
    const equilibriumError = Math.max(Math.abs(sumFx - Vx), Math.abs(sumFz - Vz), Math.abs(moment - T) / span) / scale;
    if (!(equilibriumError <= 1e-6))
        throw new Error(`FE equilibrium gate failed: (${sumFx}, ${sumFz}, ${moment}) for (${Vx}, ${Vz}, ${T})`);
    const maxPolarForce = Math.max(...bolts.map(b => b.polarForce));
    const maxForce = Math.max(...bolts.map(b => b.force));
    const maxDeviation = Math.max(...bolts.map(b => Math.hypot(b.fx - b.polarFx, b.fz - b.polarFz))) / maxPolarForce;
    const field = stressField(model, u);
    return {
        bolts, maxForce, maxPolarForce, maxDeviation, peakRatio: maxForce / maxPolarForce, stiffness,
        polarInertia: coordinates.reduce((s, c) => s + c.x * c.x + c.z * c.z, 0), plate,
        meshSize: h, dofCount: solution.dofCount, elementCount: elements.length, equilibriumError,
        maxVonMises: Math.max(...field.vonMises), field, timingMs: Date.now() - started
    };
}
