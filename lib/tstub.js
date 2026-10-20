import { meshRectangle } from "./mesh.js";
import { solveDisplacementPath } from "./solver.js";
/** Flange divisions across the width: even, so that a node row lies on the web plane x = 0. */
export function flangeDivisions(b, meshSize) {
    return 2 * Math.max(1, Math.round(b / (2 * meshSize)));
}
export function checkTStubEN(input) {
    const fy = input.fy ?? 355, fub = input.fub ?? 1000, As = input.As ?? 245;
    const MplRd = 0.25 * input.L * input.tf ** 2 * fy;
    const e = input.b / 2 - input.tw / 2 - input.m;
    const n = Math.min(e, 1.25 * input.m);
    const boltResistancePerRow = input.nb * 0.9 * fub * As;
    // EN 1993-1-8 Table 6.2: F_T,1 = 4 M_pl,1,Rd / m is the resistance of the
    // whole T-stub, and sum F_t,Rd is the total of all bolts in the T-stub, i.e.
    // both bolt rows (one on each side of the web).
    const sumFtRd = 2 * boltResistancePerRow;
    const FT1 = 4 * MplRd / input.m;
    const FT2 = (2 * MplRd + n * sumFtRd) / (input.m + n);
    const FT3 = sumFtRd;
    const resistance = Math.min(FT1, FT2, FT3);
    const mode = resistance === FT1 ? 1 : resistance === FT2 ? 2 : 3;
    // web in tension (EN 1993-1-8 6.2.6.8, b_eff = l_eff = L, gamma_M0 = 1): the
    // T-stub equations only govern while the web is stronger
    const webTension = input.L * input.tw * fy;
    return { MplRd, n, boltResistancePerRow, sumFtRd, FT1, FT2, FT3, resistance, mode, webTension,
        governing: webTension < resistance ? "web" : "flange" };
}
function closestNode(mesh, point) {
    let result = -1, distance = Number.POSITIVE_INFINITY;
    for (const node of mesh.nodes) {
        const d = Math.hypot(node.xyz[0] - point[0], node.xyz[1] - point[1], node.xyz[2] - point[2]);
        if (d < distance) {
            distance = d;
            result = node.id;
        }
    }
    return result;
}
export function buildTStub(input) {
    const E = input.E ?? 210_000, nu = input.nu ?? 0.3, fy = input.fy ?? 355, Et = input.Et ?? E / 1000;
    const fub = input.fub ?? 1000, As = input.As ?? 245;
    const meshSize = input.meshSize ?? 5;
    if (input.L <= 0 || input.b <= 0 || input.tw <= 0 || input.hw <= 0 || input.tf <= 0 || input.m <= 0 || input.nb < 1)
        throw new Error("T-stub dimensions and bolt count must be positive");
    const material = { E, nu, fy, Et };
    const mesh = { nodes: [], elements: [] };
    // even number of flange divisions: the web (x = 0) is joined to the flange
    // only through coincident nodes; an odd count (e.g. b = 127.1 at 5 mm) left
    // the web unconnected and the stiffness matrix singular
    const divB = flangeDivisions(input.b, meshSize);
    const longitudinalSymmetry = input.nb === 1;
    const modeledLength = longitudinalSymmetry ? input.L / 2 : input.L;
    const divL = Math.max(1, Math.round(modeledLength / meshSize));
    const divH = Math.max(1, Math.round(input.hw / meshSize));
    meshRectangle(mesh, [-input.b / 2, 0, 0], [input.b, 0, 0], [0, modeledLength, 0], divB, divL, input.tf, material, 1e-6, "flange");
    meshRectangle(mesh, [0, 0, 0], [0, modeledLength, 0], [0, 0, input.hw], divL, divH, input.tw, material, 1e-6, "web");
    const bolts = [];
    const capacity = 0.9 * fub * As;
    const boltStiffness = E * As / (2 * input.tf + 20);
    for (let row = -1; row <= 1; row += 2)
        for (let i = 0; i < input.nb; i++) {
            // equal pitch L / nb, half a pitch to each end (nb = 1: mid-length, the symmetry plane)
            const y = (i + 0.5) * input.L / input.nb;
            const x = row * (input.tw / 2 + input.m);
            const nodeId = closestNode(mesh, [x, y, 0]);
            bolts.push({ id: `bolt-${row < 0 ? "L" : "R"}-${i + 1}`, nodeId, x, y, capacity, stiffness: boltStiffness });
        }
    const springs = mesh.nodes.filter(node => Math.abs(node.xyz[2]) < 1e-9).map(node => {
        const onSymmetry = longitudinalSymmetry && Math.abs(node.xyz[1] - input.L / 2) < 1e-9;
        return { id: `contact-${node.id}`, nodeId: node.id, direction: [0, 0, 1], stiffness: onSymmetry ? 5e4 : 1e5, kind: "contact", reportMultiplier: longitudinalSymmetry ? 2 : 1 };
    });
    for (const bolt of bolts)
        springs.push({ id: bolt.id, nodeId: bolt.nodeId, direction: [0, 0, 1], stiffness: longitudinalSymmetry ? bolt.stiffness / 2 : bolt.stiffness, kind: "bolt", capacity: longitudinalSymmetry ? bolt.capacity / 2 : bolt.capacity, reportMultiplier: longitudinalSymmetry ? 2 : 1 });
    const fixedDofs = new Map();
    const supportA = closestNode(mesh, [-input.b / 2, 0, 0]);
    const supportB = closestNode(mesh, [input.b / 2, 0, 0]);
    fixedDofs.set(supportA * 6, 0);
    fixedDofs.set(supportA * 6 + 1, 0);
    fixedDofs.set(supportB * 6 + 1, 0);
    if (longitudinalSymmetry)
        for (const node of mesh.nodes.filter(node => Math.abs(node.xyz[1] - input.L / 2) < 1e-9)) {
            fixedDofs.set(node.id * 6 + 1, 0);
            fixedDofs.set(node.id * 6 + 3, 0);
            fixedDofs.set(node.id * 6 + 5, 0);
        }
    const topNodes = mesh.nodes.filter(node => Math.abs(node.xyz[2] - input.hw) < 1e-6);
    const topDofs = topNodes.map(node => node.id * 6 + 2);
    if (topDofs.length === 0)
        throw new Error("T-stub web top edge has no mesh nodes");
    // grip: u_x = 0 on the web top edge (zero anyway by symmetry about x = 0).
    // Without it, once the bolts yield and the flange has lifted off, the rigid
    // rotation about the flange-web junction line (u_x = theta z, u_z = -theta x)
    // is unrestrained and the tangent is singular (mode 3).
    for (const node of topNodes)
        fixedDofs.set(node.id * 6, 0);
    const model = { nodes: mesh.nodes, elements: mesh.elements, springs, fixedDofs };
    return {
        model, topDofs, loadFactor: longitudinalSymmetry ? 2 : 1, bolts, en: checkTStubEN(input),
        input: { ...input, E, nu, fy, Et, fub, As }
    };
}
export function runTStub(input, options = {}) {
    const built = buildTStub(input);
    const steps = input.loadSteps ?? 24;
    const limit = input.displacementLimit ?? 4;
    const targets = Array.from({ length: steps }, (_, i) => {
        const value = limit * ((i + 1) / steps) ** 2;
        return new Map(built.topDofs.map(dof => [dof, value]));
    });
    const isEvent = (point) => point.maxPlasticStrain >= 0.05 || Object.entries(point.boltForces).some(([id, force]) => force >= built.bolts.find(b => b.id === id).capacity * (1 - 1e-7));
    const solution = solveDisplacementPath(built.model, targets, { stopWhen: isEvent, onStep: options.onStep });
    const curve = solution.points.map(point => ({ displacement: point.displacement, reaction: point.reaction * built.loadFactor }));
    let eventIndex = solution.points.findIndex(isEvent);
    if (eventIndex < 0)
        eventIndex = solution.points.length - 1;
    const point = solution.points[eventIndex];
    const prior = solution.points[Math.max(0, eventIndex - 1)];
    const strainEvent = point.maxPlasticStrain >= 0.05;
    const boltEvent = Object.entries(point.boltForces).some(([id, force]) => force >= built.bolts.find(b => b.id === id).capacity * (1 - 1e-7));
    let mode = strainEvent && !boltEvent ? 1 : point.maxFlangePlasticStrain > 0.005 && point.flangeYieldingElements > 4 ? 2 : 3;
    if (strainEvent && boltEvent && point.maxFlangePlasticStrain >= 0.005 && point.flangeYieldingElements > 4)
        mode = 2;
    let resistance = point.reaction * built.loadFactor;
    let failureDisplacement = point.displacement;
    if (eventIndex > 0 && point.displacement > prior.displacement) {
        const threshold = strainEvent && !boltEvent ? 0.05 : Math.max(...built.bolts.map(b => b.capacity));
        const priorMeasure = strainEvent && !boltEvent ? prior.maxPlasticStrain : Math.max(...Object.values(prior.boltForces));
        const currentMeasure = strainEvent && !boltEvent ? point.maxPlasticStrain : Math.max(...Object.values(point.boltForces));
        if (currentMeasure > priorMeasure && priorMeasure < threshold && currentMeasure >= threshold) {
            const alpha = (threshold - priorMeasure) / (currentMeasure - priorMeasure);
            resistance = (prior.reaction + alpha * (point.reaction - prior.reaction)) * built.loadFactor;
            failureDisplacement = prior.displacement + alpha * (point.displacement - prior.displacement);
        }
    }
    if (mode === 2 && point.flangeYieldingElements < 5)
        mode = 3;
    return { built, solution, curve, resistance, mode, maxPlasticStrain: point.maxPlasticStrain, boltForces: point.boltForces, pryingForce: point.pryingForce, failureDisplacement };
}
