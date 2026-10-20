import { solveDense } from "./linalg.js";
const elasticCache = new WeakMap();
export function elasticPlaneStress(material) {
    const cached = elasticCache.get(material);
    if (cached)
        return cached;
    const { E, nu } = material;
    const c = E / (1 - nu * nu);
    const matrix = [[c, c * nu, 0], [c * nu, c, 0], [0, 0, E / (2 * (1 + nu))]];
    elasticCache.set(material, matrix);
    return matrix;
}
function yieldValue(s) {
    return Math.sqrt(Math.max(0, s[0] ** 2 - s[0] * s[1] + s[1] ** 2 + 3 * s[2] ** 2));
}
function yieldGradient(s) {
    const q = yieldValue(s);
    if (q < 1e-30)
        return [0, 0, 0];
    return [(s[0] - 0.5 * s[1]) / q, (s[1] - 0.5 * s[0]) / q, 3 * s[2] / q];
}
function yieldHessian(s) {
    const q = Math.max(yieldValue(s), 1e-30);
    const v = [s[0] - 0.5 * s[1], s[1] - 0.5 * s[0], 3 * s[2]];
    const m = [[1, -0.5, 0], [-0.5, 1, 0], [0, 0, 3]];
    return m.map((row, i) => row.map((x, j) => x / q - v[i] * v[j] / q ** 3));
}
function multiplyVector(a, x) {
    return a.map(row => row.reduce((s, v, j) => s + v * x[j], 0));
}
export function integratePlaneStress(material, strain, old) {
    const d = elasticPlaneStress(material);
    const elasticStrain = Array.from(strain, (x, i) => x - old.plasticStrain[i]);
    const trial = multiplyVector(d, elasticStrain);
    const tangentModulus = material.Et ?? material.E / 1000;
    const hardening = tangentModulus * material.E / (material.E - tangentModulus);
    const phiTrial = yieldValue(trial) - (material.fy + hardening * old.equivalentPlasticStrain);
    if (phiTrial <= 1e-10 * material.fy) {
        return { stress: trial, tangent: d, state: { stress: trial, plasticStrain: old.plasticStrain, equivalentPlasticStrain: old.equivalentPlasticStrain }, yielded: false };
    }
    // Local Newton solve of the plane-stress consistency equations (Simo–Taylor form).
    let stress = [...trial];
    let gamma = Math.max(0, phiTrial / (material.E + hardening));
    for (let iteration = 0; iteration < 30; iteration++) {
        const n = yieldGradient(stress);
        const dn = multiplyVector(d, n);
        const residual = stress.map((x, i) => x + gamma * dn[i] - trial[i]);
        const consistency = yieldValue(stress) - material.fy - hardening * (old.equivalentPlasticStrain + gamma);
        if (Math.max(Math.abs(consistency), ...residual.map(Math.abs)) <= 1e-10 * material.fy)
            break;
        const h = yieldHessian(stress);
        const dh = d.map(row => row.map((_, j) => row.reduce((s, x, k) => s + x * h[k][j], 0)));
        const jac = Array.from({ length: 4 }, (_, i) => Array(4).fill(0));
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++)
                jac[i][j] = (i === j ? 1 : 0) + gamma * dh[i][j];
            jac[i][3] = dn[i];
        }
        for (let j = 0; j < 3; j++)
            jac[3][j] = n[j];
        jac[3][3] = -hardening;
        const correction = solveDense(jac, [...residual, consistency]);
        for (let i = 0; i < 3; i++)
            stress[i] -= correction[i];
        gamma -= correction[3];
        if (gamma < 0)
            gamma = 0;
        if (iteration === 29)
            throw new Error(`Plane-stress plastic return mapping did not converge (trial=${trial.join(",")}, stress=${stress.join(",")}, gamma=${gamma}, consistency=${consistency}, residual=${residual.join(",")})`);
    }
    const n = yieldGradient(stress);
    const dn = multiplyVector(d, n);
    const h = yieldHessian(stress);
    const jac = Array.from({ length: 4 }, (_, i) => Array(4).fill(0));
    const dh = d.map(row => row.map((_, j) => row.reduce((s, x, k) => s + x * h[k][j], 0)));
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++)
            jac[i][j] = (i === j ? 1 : 0) + gamma * dh[i][j];
        jac[i][3] = dn[i];
    }
    for (let j = 0; j < 3; j++)
        jac[3][j] = n[j];
    jac[3][3] = -hardening;
    const tangent = Array.from({ length: 3 }, () => Array(3).fill(0));
    for (let j = 0; j < 3; j++) {
        const rhs = [d[0][j], d[1][j], d[2][j], 0];
        const column = solveDense(jac, rhs);
        for (let i = 0; i < 3; i++)
            tangent[i][j] = column[i];
    }
    const committedStress = stress;
    const plasticStrain = old.plasticStrain.map((x, i) => x + gamma * n[i]);
    return { stress: committedStress, tangent, state: { stress: committedStress, plasticStrain, equivalentPlasticStrain: old.equivalentPlasticStrain + gamma }, yielded: true };
}
export function zeroPlasticState() {
    return { stress: [0, 0, 0], plasticStrain: [0, 0, 0], equivalentPlasticStrain: 0 };
}
