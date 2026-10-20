import { integratePlaneStress, zeroPlasticState } from "./material.js";
import { zeros } from "./linalg.js";
export const SHELL_DOF = 6;
const lobattoX = [-1, -0.8302238962785669, -0.4688487934707142, 0, 0.4688487934707142, 0.8302238962785669, 1];
const lobattoW = [1 / 21, 0.27682604736156595, 0.4317453812098626, 0.4876190476190476, 0.4317453812098626, 0.27682604736156595, 1 / 21];
const gauss = [-1 / Math.sqrt(3), 1 / Math.sqrt(3)];
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { return Math.hypot(...a); }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function shape(xi, eta) {
    return {
        n: [(1 - xi) * (1 - eta) / 4, (1 + xi) * (1 - eta) / 4, (1 + xi) * (1 + eta) / 4, (1 - xi) * (1 + eta) / 4],
        dx: [-(1 - eta) / 4, (1 - eta) / 4, (1 + eta) / 4, -(1 + eta) / 4],
        de: [-(1 - xi) / 4, -(1 + xi) / 4, (1 + xi) / 4, (1 - xi) / 4]
    };
}
const frameCache = new WeakMap();
function localFrame(element) {
    const cached = frameCache.get(element);
    if (cached)
        return cached;
    const xyz = element.nodes.map(n => n.xyz);
    const xAxis = scale(subtract(xyz[1], xyz[0]), 1 / norm(subtract(xyz[1], xyz[0])));
    const zRaw = cross(subtract(xyz[1], xyz[0]), subtract(xyz[3], xyz[0]));
    const zAxis = scale(zRaw, 1 / norm(zRaw));
    const yAxis = cross(zAxis, xAxis);
    const axes = [xAxis, yAxis, zAxis];
    const frame = { axes, xy: xyz.map(p => { const rel = subtract(p, xyz[0]); return [dot3(rel, xAxis), dot3(rel, yAxis)]; }) };
    frameCache.set(element, frame);
    return frame;
}
function rowDot(row, x) {
    let s = 0;
    for (let i = 0; i < row.length; i++)
        s += row[i] * x[i];
    return s;
}
export function initialShellState() {
    return { points: Array.from({ length: 28 }, zeroPlasticState) };
}
const integrationCache = new WeakMap();
function integrationGeometry(element) {
    const cached = integrationCache.get(element);
    if (cached)
        return cached;
    const { xy } = localFrame(element);
    const points = [];
    for (const xi of gauss)
        for (const eta of gauss) {
            const s = shape(xi, eta);
            let j00 = 0, j01 = 0, j10 = 0, j11 = 0;
            for (let a = 0; a < 4; a++) {
                j00 += s.dx[a] * xy[a][0];
                j01 += s.de[a] * xy[a][0];
                j10 += s.dx[a] * xy[a][1];
                j11 += s.de[a] * xy[a][1];
            }
            const det = j00 * j11 - j01 * j10;
            if (!(det > 0))
                throw new Error(`Invalid shell element orientation or Jacobian: ${det}`);
            const dx = s.dx.map((v, a) => (j11 * v - j10 * s.de[a]) / det);
            const dy = s.de.map((v, a) => (-j01 * s.dx[a] + j00 * v) / det);
            const membrane = zeros(3, 24), curvature = zeros(3, 24);
            for (let a = 0; a < 4; a++) {
                const q = a * 6;
                membrane[0][q] = dx[a];
                membrane[1][q + 1] = dy[a];
                membrane[2][q] = dy[a];
                membrane[2][q + 1] = dx[a];
                curvature[0][q + 4] = dx[a];
                curvature[1][q + 3] = -dy[a];
                curvature[2][q + 3] = -dx[a];
                curvature[2][q + 4] = dy[a];
            }
            const xiMinus = Array(24).fill(0), xiPlus = Array(24).fill(0);
            for (const tieEta of [-1, 1]) {
                const ts = shape(0, tieEta), target = tieEta < 0 ? xiMinus : xiPlus;
                let tx = 0, ty = 0;
                for (let a = 0; a < 4; a++) {
                    tx += ts.dx[a] * xy[a][0];
                    ty += ts.dx[a] * xy[a][1];
                }
                for (let a = 0; a < 4; a++) {
                    const q = a * 6;
                    target[q + 2] += ts.dx[a];
                    target[q + 4] += tx * ts.n[a];
                    target[q + 3] -= ty * ts.n[a];
                }
            }
            const etaMinus = Array(24).fill(0), etaPlus = Array(24).fill(0);
            for (const tieXi of [-1, 1]) {
                const ts = shape(tieXi, 0), target = tieXi < 0 ? etaMinus : etaPlus;
                let tx = 0, ty = 0;
                for (let a = 0; a < 4; a++) {
                    tx += ts.de[a] * xy[a][0];
                    ty += ts.de[a] * xy[a][1];
                }
                for (let a = 0; a < 4; a++) {
                    const q = a * 6;
                    target[q + 2] += ts.de[a];
                    target[q + 4] += tx * ts.n[a];
                    target[q + 3] -= ty * ts.n[a];
                }
            }
            const covXi = xiMinus.map((v, i) => (1 - eta) * 0.5 * v + (1 + eta) * 0.5 * xiPlus[i]);
            const covEta = etaMinus.map((v, i) => (1 - xi) * 0.5 * v + (1 + xi) * 0.5 * etaPlus[i]);
            const shear = covXi.map((v, i) => [(j11 * v - j10 * covEta[i]) / det, (-j01 * v + j00 * covEta[i]) / det]);
            points.push({ det, membrane, curvature, shear });
        }
    integrationCache.set(element, points);
    return points;
}
/** Bilinear MITC4 shell with layered plane-stress plasticity. */
export function evaluateShell(element, displacement, committed) {
    const { axes } = localFrame(element);
    const localU = Array(24).fill(0);
    for (let a = 0; a < 4; a++)
        for (let c = 0; c < 3; c++)
            for (let g = 0; g < 3; g++) {
                localU[a * 6 + c] += axes[c][g] * displacement[a * 6 + g];
                localU[a * 6 + c + 3] += axes[c][g] * displacement[a * 6 + g + 3];
            }
    const k = zeros(24, 24);
    const f = Array(24).fill(0);
    const updated = Array(28);
    const shearModulus = element.material.E / (2 * (1 + element.material.nu));
    const thickness = element.thickness;
    let maxPlasticStrain = 0;
    let layerIndex = 0;
    for (const { det, membrane, curvature, shear } of integrationGeometry(element)) {
        const membraneStrain = membrane.map(row => rowDot(row, localU));
        const curvatureStrain = curvature.map(row => rowDot(row, localU));
        const membraneResultant = [0, 0, 0], momentResultant = [0, 0, 0];
        const c0 = zeros(3, 3), c1 = zeros(3, 3), c2 = zeros(3, 3);
        for (let iz = 0; iz < 7; iz++) {
            const z = thickness * lobattoX[iz] / 2;
            const strain = membraneStrain.map((value, p) => value + z * curvatureStrain[p]);
            const old = committed.points[layerIndex] ?? zeroPlasticState();
            const response = integratePlaneStress(element.material, strain, old);
            updated[layerIndex] = response.state;
            maxPlasticStrain = Math.max(maxPlasticStrain, response.state.equivalentPlasticStrain);
            const weight = det * lobattoW[iz] * thickness / 2;
            for (let p = 0; p < 3; p++) {
                membraneResultant[p] += weight * response.stress[p];
                momentResultant[p] += weight * z * response.stress[p];
                for (let q = 0; q < 3; q++) {
                    const tangent = response.tangent[p][q];
                    c0[p][q] += weight * tangent;
                    c1[p][q] += weight * z * tangent;
                    c2[p][q] += weight * z * z * tangent;
                }
            }
            layerIndex++;
        }
        const strainSupport = Array.from({ length: 3 }, (_, p) => {
            const dofs = [];
            for (let r = 0; r < 24; r++)
                if (membrane[p][r] !== 0 || curvature[p][r] !== 0)
                    dofs.push(r);
            return dofs;
        });
        for (let p = 0; p < 3; p++)
            for (const r of strainSupport[p]) {
                f[r] += membrane[p][r] * membraneResultant[p] + curvature[p][r] * momentResultant[p];
            }
        for (let p = 0; p < 3; p++)
            for (let q = 0; q < 3; q++) {
                const a0 = c0[p][q], a1 = c1[p][q], a1t = c1[q][p], a2 = c2[p][q];
                for (const r of strainSupport[p])
                    for (const c of strainSupport[q]) {
                        k[r][c] += membrane[p][r] * (a0 * membrane[q][c] + a1 * curvature[q][c])
                            + curvature[p][r] * (a1t * membrane[q][c] + a2 * curvature[q][c]);
                    }
            }
        const shearWeight = det * thickness;
        const shearXi = rowDot(shear.map(row => row[0]), localU);
        const shearEta = rowDot(shear.map(row => row[1]), localU);
        const shearSupport = [];
        for (let r = 0; r < 24; r++)
            if (shear[r][0] !== 0 || shear[r][1] !== 0)
                shearSupport.push(r);
        for (const r of shearSupport) {
            f[r] += shearWeight * (5 / 6) * shearModulus * (shear[r][0] * shearXi + shear[r][1] * shearEta);
            for (const c of shearSupport)
                k[r][c] += shearWeight * (5 / 6) * shearModulus * (shear[r][0] * shear[c][0] + shear[r][1] * shear[c][1]);
        }
    }
    const drilling = 1e-4 * shearModulus * thickness;
    for (let a = 0; a < 4; a++) {
        const i = a * 6 + 5;
        k[i][i] += drilling;
        f[i] += drilling * localU[i];
    }
    const globalForce = Array(24).fill(0);
    const globalK = zeros(24, 24);
    const transformDofs = Array.from({ length: 24 }, (_, local) => {
        const node = Math.floor(local / 6), component = local % 6, axis = axes[component % 3];
        const out = [];
        for (let g = 0; g < 3; g++)
            if (axis[g] !== 0)
                out.push({ dof: node * 6 + g + (component >= 3 ? 3 : 0), factor: axis[g] });
        return out;
    });
    for (let a = 0; a < 4; a++)
        for (let c = 0; c < 3; c++)
            for (let g = 0; g < 3; g++) {
                globalForce[a * 6 + g] += axes[c][g] * f[a * 6 + c];
                globalForce[a * 6 + g + 3] += axes[c][g] * f[a * 6 + c + 3];
            }
    for (let a = 0; a < 24; a++)
        for (let b = 0; b < 24; b++) {
            const value = k[a][b];
            for (const ga of transformDofs[a])
                for (const gb of transformDofs[b])
                    globalK[ga.dof][gb.dof] += ga.factor * value * gb.factor;
        }
    return { force: globalForce, stiffness: globalK, state: { points: updated }, maxPlasticStrain };
}
