/**
 * Linear plane-stress (membrane) model: 4-node bilinear isoparametric
 * quadrilaterals (Q4, 2 x 2 Gauss), prescribed zero displacements, nodal
 * loads and linear "coupling springs" with energy 1/2 k (sum c_i u_i)^2 (used
 * for bolts: the bolt displacement is the load-weighted average of the plate
 * displacements over the bolt disk, see diskWeights). Solved directly with the
 * skyline Cholesky of linalg.ts after a reverse Cuthill-McKee ordering. Units
 * N, mm, MPa. Elastic only: no plasticity, contact, holes or slip.
 *
 * Two DOFs per node: u_x = 2 n, u_y = 2 n + 1.
 */
import { createSkyline, reverseCuthillMcKee, skylineAdd, solveSkyline } from "./linalg.js";
const GAUSS = 1 / Math.sqrt(3);
const XI = [-1, 1, 1, -1];
const ETA = [-1, -1, 1, 1];
/** Plane-stress elasticity matrix (Voigt: sx, sy, txy). */
export function planeStressD(E, nu) {
    const c = E / (1 - nu * nu);
    return [[c, c * nu, 0], [c * nu, c, 0], [0, 0, c * (1 - nu) / 2]];
}
/** Shape functions, x/y derivatives and det J of a Q4 at (xi, eta); xy = 8 coordinates. */
export function q4ShapeDerivatives(xy, xi, eta) {
    const N = [0, 0, 0, 0], dNdxi = [0, 0, 0, 0], dNdeta = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
        N[i] = 0.25 * (1 + XI[i] * xi) * (1 + ETA[i] * eta);
        dNdxi[i] = 0.25 * XI[i] * (1 + ETA[i] * eta);
        dNdeta[i] = 0.25 * ETA[i] * (1 + XI[i] * xi);
    }
    let j11 = 0, j12 = 0, j21 = 0, j22 = 0;
    for (let i = 0; i < 4; i++) {
        j11 += dNdxi[i] * xy[2 * i];
        j12 += dNdxi[i] * xy[2 * i + 1];
        j21 += dNdeta[i] * xy[2 * i];
        j22 += dNdeta[i] * xy[2 * i + 1];
    }
    const detJ = j11 * j22 - j12 * j21;
    if (!(detJ > 0))
        throw new Error(`Q4 element with non-positive Jacobian (${detJ}); check the node order`);
    const dNdx = [0, 0, 0, 0], dNdy = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
        dNdx[i] = (j22 * dNdxi[i] - j12 * dNdeta[i]) / detJ;
        dNdy[i] = (-j21 * dNdxi[i] + j11 * dNdeta[i]) / detJ;
    }
    return { N, dNdx, dNdy, detJ };
}
/** 8 x 8 stiffness of a Q4 plane-stress element (2 x 2 Gauss). */
export function q4Stiffness(xy, thickness, E, nu) {
    const D = planeStressD(E, nu);
    const K = Array.from({ length: 8 }, () => Array(8).fill(0));
    for (const xi of [-GAUSS, GAUSS])
        for (const eta of [-GAUSS, GAUSS]) {
            const { dNdx, dNdy, detJ } = q4ShapeDerivatives(xy, xi, eta);
            const B = [Array(8).fill(0), Array(8).fill(0), Array(8).fill(0)];
            for (let i = 0; i < 4; i++) {
                B[0][2 * i] = dNdx[i];
                B[1][2 * i + 1] = dNdy[i];
                B[2][2 * i] = dNdy[i];
                B[2][2 * i + 1] = dNdx[i];
            }
            const scale = detJ * thickness;
            for (let a = 0; a < 8; a++) {
                const db = [0, 0, 0];
                for (let r = 0; r < 3; r++)
                    db[r] = D[r][0] * B[0][a] + D[r][1] * B[1][a] + D[r][2] * B[2][a];
                for (let b = 0; b < 8; b++)
                    K[a][b] += scale * (B[0][b] * db[0] + B[1][b] * db[1] + B[2][b] * db[2]);
            }
        }
    return K;
}
/** Stress (sx, sy, txy) at (xi, eta) from the 8 element displacements. */
export function q4Stress(xy, u, E, nu, xi = 0, eta = 0) {
    const { dNdx, dNdy } = q4ShapeDerivatives(xy, xi, eta);
    let ex = 0, ey = 0, gxy = 0;
    for (let i = 0; i < 4; i++) {
        ex += dNdx[i] * u[2 * i];
        ey += dNdy[i] * u[2 * i + 1];
        gxy += dNdy[i] * u[2 * i] + dNdx[i] * u[2 * i + 1];
    }
    const D = planeStressD(E, nu);
    return [D[0][0] * ex + D[0][1] * ey, D[1][0] * ex + D[1][1] * ey, D[2][2] * gxy];
}
export function vonMises(s) {
    return Math.sqrt(s[0] * s[0] - s[0] * s[1] + s[1] * s[1] + 3 * s[2] * s[2]);
}
function elementXY(model, element) {
    return element.nodes.flatMap(n => [model.xy[2 * n], model.xy[2 * n + 1]]);
}
/** Solve K u = f with u = 0 on the fixed DOFs. */
export function solvePlaneModel(model) {
    const started = Date.now();
    const nodeCount = model.xy.length / 2;
    const dofTotal = 2 * nodeCount;
    // node graph for the ordering: elements and coupling cliques
    const adjacency = Array.from({ length: nodeCount }, () => new Set());
    const link = (nodes) => { for (const a of nodes)
        for (const b of nodes)
            if (a !== b)
                adjacency[a].add(b); };
    for (const element of model.elements)
        link(element.nodes);
    for (const coupling of model.couplings)
        link([...new Set(coupling.dofs.map(dof => Math.floor(dof / 2)))]);
    const order = reverseCuthillMcKee(adjacency);
    const equation = new Int32Array(dofTotal).fill(-1);
    let count = 0;
    for (const node of order)
        for (const local of [0, 1]) {
            const dof = 2 * node + local;
            if (!model.fixed.has(dof))
                equation[dof] = count++;
        }
    if (count === 0)
        throw new Error("Plane model has no free DOF");
    const firstRow = new Int32Array(count);
    for (let i = 0; i < count; i++)
        firstRow[i] = i;
    const touch = (dofs) => {
        let lowest = Infinity;
        for (const dof of dofs) {
            const eq = equation[dof];
            if (eq >= 0 && eq < lowest)
                lowest = eq;
        }
        for (const dof of dofs) {
            const eq = equation[dof];
            if (eq >= 0 && lowest < firstRow[eq])
                firstRow[eq] = lowest;
        }
    };
    const elementDofs = model.elements.map(element => element.nodes.flatMap(n => [2 * n, 2 * n + 1]));
    for (const dofs of elementDofs)
        touch(dofs);
    for (const coupling of model.couplings)
        touch(coupling.dofs);
    const K = createSkyline(firstRow);
    const elementK = [];
    model.elements.forEach((element, index) => {
        const ke = q4Stiffness(elementXY(model, element), element.thickness, element.E, element.nu);
        elementK.push(ke);
        const dofs = elementDofs[index];
        for (let a = 0; a < 8; a++) {
            const ea = equation[dofs[a]];
            if (ea < 0)
                continue;
            for (let b = a; b < 8; b++) {
                const eb = equation[dofs[b]];
                if (eb < 0)
                    continue;
                // upper triangle only: (a, b) and (b, a) are the same skyline entry
                skylineAdd(K, ea, eb, ke[a][b]);
            }
        }
    });
    for (const coupling of model.couplings) {
        const n = coupling.dofs.length;
        for (let a = 0; a < n; a++) {
            const ea = equation[coupling.dofs[a]];
            if (ea < 0)
                continue;
            for (let b = a; b < n; b++) {
                const eb = equation[coupling.dofs[b]];
                if (eb < 0)
                    continue;
                const value = coupling.stiffness * coupling.coeffs[a] * coupling.coeffs[b];
                // a pair (a, b) with a != b but the same equation (repeated DOF) needs both halves
                skylineAdd(K, ea, eb, a !== b && ea === eb ? 2 * value : value);
            }
        }
    }
    const rhs = new Float64Array(count);
    for (const [dof, value] of model.loads) {
        const eq = equation[dof];
        if (eq === undefined)
            throw new Error(`Load on unknown DOF ${dof}`);
        if (eq >= 0)
            rhs[eq] += value;
    }
    const x = solveSkyline(K, rhs);
    const displacement = new Float64Array(dofTotal);
    for (let dof = 0; dof < dofTotal; dof++)
        if (equation[dof] >= 0)
            displacement[dof] = x[equation[dof]];
    // reactions: internal force at the fixed DOFs minus the loads there
    const internal = new Map();
    model.elements.forEach((_, index) => {
        const dofs = elementDofs[index];
        if (!dofs.some(dof => model.fixed.has(dof)))
            return;
        const ke = elementK[index];
        for (let a = 0; a < 8; a++) {
            if (!model.fixed.has(dofs[a]))
                continue;
            let f = 0;
            for (let b = 0; b < 8; b++)
                f += ke[a][b] * displacement[dofs[b]];
            internal.set(dofs[a], (internal.get(dofs[a]) ?? 0) + f);
        }
    });
    for (const coupling of model.couplings) {
        if (!coupling.dofs.some(dof => model.fixed.has(dof)))
            continue;
        const stretch = coupling.dofs.reduce((sum, dof, i) => sum + coupling.coeffs[i] * displacement[dof], 0);
        coupling.dofs.forEach((dof, i) => { if (model.fixed.has(dof))
            internal.set(dof, (internal.get(dof) ?? 0) + coupling.stiffness * coupling.coeffs[i] * stretch); });
    }
    const reactions = new Map();
    for (const dof of model.fixed)
        reactions.set(dof, (internal.get(dof) ?? 0) - (model.loads.get(dof) ?? 0));
    return { displacement, dofCount: count, profileSize: K.values.length, reactions, solveMilliseconds: Date.now() - started };
}
/** Force in a coupling spring: stiffness * (sum c_i u_i). */
export function couplingForce(coupling, displacement) {
    return coupling.stiffness * coupling.dofs.reduce((sum, dof, i) => sum + coupling.coeffs[i] * displacement[dof], 0);
}
/** Centroid stresses of every element: [sx, sy, txy] per element. */
export function elementStresses(model, displacement) {
    return model.elements.map(element => {
        const u = element.nodes.flatMap(n => [displacement[2 * n], displacement[2 * n + 1]]);
        return q4Stress(elementXY(model, element), u, element.E, element.nu);
    });
}
/**
 * Nodal weights of a uniform load over a disk (centre cx, cy, radius r) on the
 * elements of one part: w_i = integral over the disk of N_i dA / disk area,
 * with a 4 x 4 Gauss rule per element and only the Gauss points inside the
 * disk. sum w_i = 1. The bolt displacement is sum w_i u_i (an averaging
 * "spider"), which keeps the bolt load spread over the bolt area: a nodal
 * point load in plane stress has an unbounded (mesh-dependent) displacement.
 */
export function diskWeights(model, part, cx, cy, r) {
    const g = [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526];
    const w = [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538];
    const acc = new Map();
    let area = 0;
    for (const element of model.elements) {
        if (element.part !== part)
            continue;
        const xy = elementXY(model, element);
        const xs = [xy[0], xy[2], xy[4], xy[6]], ys = [xy[1], xy[3], xy[5], xy[7]];
        if (Math.min(...xs) > cx + r || Math.max(...xs) < cx - r || Math.min(...ys) > cy + r || Math.max(...ys) < cy - r)
            continue;
        for (let i = 0; i < 4; i++)
            for (let j = 0; j < 4; j++) {
                const { N, detJ } = q4ShapeDerivatives(xy, g[i], g[j]);
                let px = 0, py = 0;
                for (let k = 0; k < 4; k++) {
                    px += N[k] * xs[k];
                    py += N[k] * ys[k];
                }
                if ((px - cx) ** 2 + (py - cy) ** 2 > r * r * (1 + 1e-9))
                    continue;
                const dA = detJ * w[i] * w[j];
                area += dA;
                element.nodes.forEach((node, k) => acc.set(node, (acc.get(node) ?? 0) + N[k] * dA));
            }
    }
    if (!(area > 0))
        throw new Error(`Bolt disk at (${cx.toFixed(1)}, ${cy.toFixed(1)}) holds no integration point: refine the mesh`);
    const nodes = [...acc.keys()].sort((a, b) => a - b);
    return { nodes, weights: nodes.map(node => acc.get(node) / area), coveredArea: area };
}
/**
 * Coordinates along one direction through the given breakpoints, with every
 * interval divided into ceil(length / h) equal parts. Breakpoints closer than
 * tolerance are merged.
 */
export function gridLine(breakpoints, h, tolerance = 1e-6) {
    const sorted = [...breakpoints].sort((a, b) => a - b);
    const unique = [];
    for (const value of sorted)
        if (!unique.length || value - unique[unique.length - 1] > tolerance)
            unique.push(value);
    const line = [unique[0]];
    for (let i = 1; i < unique.length; i++) {
        const a = unique[i - 1], b = unique[i];
        const parts = Math.max(1, Math.ceil((b - a) / h - 1e-9));
        for (let k = 1; k <= parts; k++)
            line.push(a + (b - a) * k / parts);
    }
    return line;
}
/**
 * Adds a structured rectangular grid (x-lines by y-lines) as one part; returns
 * the node index grid [j][i] (row j along y, column i along x).
 */
export function addGrid(nodes, elements, xLine, yLine, part, thickness, E, nu) {
    const grid = [];
    for (let j = 0; j < yLine.length; j++) {
        const row = [];
        for (let i = 0; i < xLine.length; i++) {
            row.push(nodes.length / 2);
            nodes.push(xLine[i], yLine[j]);
        }
        grid.push(row);
    }
    for (let j = 0; j + 1 < yLine.length; j++)
        for (let i = 0; i + 1 < xLine.length; i++) {
            elements.push({ nodes: [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]], thickness, E, nu, part });
        }
    return grid;
}
