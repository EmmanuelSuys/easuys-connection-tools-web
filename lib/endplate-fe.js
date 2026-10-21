/**
 * FE check of the tension zone of a bolted end plate: a generalised T-stub.
 *
 * The model is the T-stub model of src/tstub.ts extended to the bolt-row assembly of an end plate:
 *
 * - the end plate as a shell (bilinear MITC4, layered plane-stress plasticity, src/shell.ts) with all
 *   tension bolt rows of the page input, two bolts per row;
 * - the beam web (plane x = 0) and the beam tension flange as welded shell strips of depth `depth`;
 * - the plate under the beam web and tension flange plus 0.8 a sqrt(2) of their welds three times as
 *   thick (elastic in practice), so that the free bending length of the plate is the m, m_x and m_2 of
 *   EN 1993-1-8 6.2.6.5 / Figure 6.10;
 * - bolts as one-node springs with the bolt capacity F_t = 0.9 f_ub A_s (gamma = 1) as a force cap;
 * - unilateral contact of every plate node against a rigid support (the column flange, the
 *   opposite plate of a splice, or the primary-beam web), as the T-stub;
 * - symmetry about the web plane: half the joint is modelled (x >= 0);
 * - loading: a uniform displacement of the beam-strip ends (the tension zone pulled as a whole),
 *   increased step by step to the T-stub failure criterion: 5 % equivalent plastic strain anywhere
 *   except under the washers (where the one-node bolt's point load makes the strain mesh-dependent
 *   without bound), or a bolt reaching F_t; the step with the event is bisected to locate it.
 *
 * Row forces are the bolt forces of a row less the contact (prying) forces in its band of the plate;
 * they add up to the applied tension (checked at every step). M_j = sum F_r h_r with the lever arms of
 * the EN model. The EN comparison uses the same joint at gamma = 1, end-plate side components only.
 * Units: N, mm, MPa.
 */
import { solveDisplacementPath } from "./solver.js";
import { analyseEndPlateJoint, fyForThickness } from "./ec3_endplate.js";
export const ENDPLATE_FE_VERSION = "endplate-fe-0.1.0";
/** Resistance criterion of the T-stub model: equivalent plastic strain. */
export const ENDPLATE_FE_STRAIN_LIMIT = 0.05;
/** Contact penalty per plate node [N/mm], as the T-stub model. */
export const ENDPLATE_FE_CONTACT_STIFFNESS = 1e5;
/** Thickness factor of the plate under the beam web / flange and their welds. */
export const ENDPLATE_FE_STIFF_ZONE_FACTOR = 3;
/** Largest model offered in the browser (degrees of freedom). */
export const ENDPLATE_FE_MAX_DOF = 15000;
/** Equilibrium gate: |sum of row forces - applied tension| <= 1e-4 P + 1 N at every step. */
export const ENDPLATE_FE_EQUILIBRIUM_RTOL = 1e-4;
export const ENDPLATE_FE_EQUILIBRIUM_ATOL_N = 1;
export class EndPlateFeError extends Error {
    constructor(message) { super(message); this.name = "EndPlateFeError"; }
}
/** Grid lines through the required positions, merged closer than 0.3 h, intervals split to <= h. */
export function endPlateGridLines(required, lo, hi, h) {
    const candidates = [{ value: lo, priority: -1 }, { value: hi, priority: -1 }, ...required.filter(line => line.value > lo + 1e-9 && line.value < hi - 1e-9)]
        .sort((a, b) => a.value - b.value);
    const kept = [];
    for (const line of candidates) {
        const last = kept[kept.length - 1];
        if (last && line.value - last.value < 0.3 * h) {
            if (line.priority < last.priority)
                kept[kept.length - 1] = line;
            continue;
        }
        kept.push(line);
    }
    // the end lines win any merge
    kept[0] = { value: lo, priority: -1 };
    kept[kept.length - 1] = { value: hi, priority: -1 };
    const lines = [lo];
    for (let i = 1; i < kept.length; i++) {
        const a = kept[i - 1].value, b = kept[i].value;
        const n = Math.max(1, Math.ceil((b - a) / h - 1e-9));
        for (let k = 1; k <= n; k++)
            lines.push(k === n ? b : a + (b - a) * k / n);
    }
    return lines;
}
function nearest(lines, value) {
    let best = lines[0];
    for (const line of lines)
        if (Math.abs(line - value) < Math.abs(best - value))
            best = line;
    return best;
}
function depthLines(depth, h, graded) {
    if (!graded)
        return endPlateGridLines([], 0, depth, h);
    const lines = [0];
    let z = 0;
    while (z < depth - 1e-9) {
        const step = z >= 3 * h - 1e-9 ? 2 * h : h;
        let next = Math.min(depth, z + step);
        if (depth - next < 0.5 * step)
            next = depth;
        lines.push(next);
        z = next;
    }
    return lines;
}
/** Builds the half model (x >= 0) of the plate assembly. */
export function buildPlateAssembly(geometry, mesh) {
    const g = geometry, h = mesh.meshSize;
    if (!(h > 0))
        throw new EndPlateFeError("Mesh size must be positive");
    if (!(g.plate.halfWidth > g.boltX && g.boltX > 0))
        throw new EndPlateFeError("The bolts must lie on the plate, beside the web");
    if (!(g.plate.yMax > g.plate.yMin) || !(g.web.yMax > g.web.yMin) || !(g.depth > 0))
        throw new EndPlateFeError("Plate, web and strip extents must be positive");
    if (g.rows.length === 0)
        throw new EndPlateFeError("At least one bolt row is needed");
    for (const row of g.rows)
        if (!(row.y > g.plate.yMin && row.y < g.plate.yMax))
            throw new EndPlateFeError(`Bolt row ${row.id} lies outside the modelled plate`);
    const washer = g.bolt.washerHalfSide ?? 0;
    const xRequired = [{ value: g.boltX, priority: 0 }];
    if (washer > 0)
        xRequired.push({ value: g.boltX - washer, priority: 0 }, { value: g.boltX + washer, priority: 0 });
    if (g.flange)
        xRequired.push({ value: Math.min(g.flange.halfWidth, g.plate.halfWidth), priority: 1 });
    for (const zone of g.stiffZones)
        xRequired.push({ value: zone.xMax, priority: 2 });
    const yRequired = g.rows.map(row => ({ value: row.y, priority: 0 }));
    if (washer > 0)
        for (const row of g.rows)
            yRequired.push({ value: row.y - washer, priority: 0 }, { value: row.y + washer, priority: 0 });
    yRequired.push({ value: g.web.yMin, priority: 1 }, { value: g.web.yMax, priority: 1 });
    if (g.flange)
        yRequired.push({ value: g.flange.y, priority: 0 });
    for (const zone of g.stiffZones)
        yRequired.push({ value: zone.yMin, priority: 2 }, { value: zone.yMax, priority: 2 });
    const xLines = endPlateGridLines(xRequired, 0, g.plate.halfWidth, h);
    const yLines = endPlateGridLines(yRequired, g.plate.yMin, g.plate.yMax, h);
    const zLines = depthLines(g.depth, h, mesh.gradedDepth ?? true);
    const snapped = g.stiffZones.map(zone => ({ xMax: nearest(xLines, zone.xMax), yMin: nearest(yLines, zone.yMin), yMax: nearest(yLines, zone.yMax) }));
    const webYMin = nearest(yLines, g.web.yMin), webYMax = nearest(yLines, g.web.yMax);
    const flangeY = g.flange ? nearest(yLines, g.flange.y) : null;
    const flangeHalf = g.flange ? nearest(xLines, Math.min(g.flange.halfWidth, g.plate.halfWidth)) : 0;
    const nodes = [];
    const byKey = new Map();
    const node = (x, y, z) => {
        const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
        let found = byKey.get(key);
        if (!found) {
            found = { id: nodes.length, xyz: [x, y, z] };
            nodes.push(found);
            byKey.set(key, found);
        }
        return found;
    };
    const material = (fy) => ({ E: g.E, nu: g.nu, fy, Et: g.Et });
    const plateMaterial = material(g.plate.fy), webMaterial = material(g.web.fy), flangeMaterial = material(g.flange?.fy ?? g.web.fy);
    const elements = [];
    const centroids = [];
    const stiff = [];
    let area = 0;
    const elementParts = [];
    // the solver's "flange" strain measures cover the elements of the strain criterion: all but the washers
    const add = (corners, thickness, mat, part, isStiff) => {
        elements.push({ nodes: corners, thickness, material: mat, region: part === "washer" ? "washer" : "flange" });
        elementParts.push(part);
        const c = [0, 0, 0];
        for (const n of corners)
            for (let i = 0; i < 3; i++)
                c[i] += n.xyz[i] / 4;
        centroids.push(c);
        stiff.push(isStiff);
        const u = corners[1].xyz.map((v, i) => v - corners[0].xyz[i]), v = corners[3].xyz.map((w, i) => w - corners[0].xyz[i]);
        area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    };
    const washerSquares = washer > 0 ? g.rows.map(row => ({ x0: nearest(xLines, g.boltX - washer), x1: nearest(xLines, g.boltX + washer), y0: nearest(yLines, row.y - washer), y1: nearest(yLines, row.y + washer) })) : [];
    for (let j = 0; j + 1 < yLines.length; j++)
        for (let i = 0; i + 1 < xLines.length; i++) {
            const x0 = xLines[i], x1 = xLines[i + 1], y0 = yLines[j], y1 = yLines[j + 1];
            const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
            const isStiff = snapped.some(zone => cx < zone.xMax && cy > zone.yMin && cy < zone.yMax);
            const underWasher = washerSquares.some(sq => cx > sq.x0 && cx < sq.x1 && cy > sq.y0 && cy < sq.y1);
            add([node(x0, y0, 0), node(x1, y0, 0), node(x1, y1, 0), node(x0, y1, 0)], isStiff ? ENDPLATE_FE_STIFF_ZONE_FACTOR * g.plate.thickness : g.plate.thickness, plateMaterial, underWasher ? "washer" : "plate", isStiff);
        }
    const webY = yLines.filter(y => y >= webYMin - 1e-9 && y <= webYMax + 1e-9);
    for (let j = 0; j + 1 < webY.length; j++)
        for (let k = 0; k + 1 < zLines.length; k++) {
            const y0 = webY[j], y1 = webY[j + 1], z0 = zLines[k], z1 = zLines[k + 1];
            add([node(0, y0, z0), node(0, y1, z0), node(0, y1, z1), node(0, y0, z1)], g.web.thickness / 2, webMaterial, "web", false);
        }
    if (g.flange && flangeY !== null) {
        const flangeX = xLines.filter(x => x <= flangeHalf + 1e-9);
        for (let i = 0; i + 1 < flangeX.length; i++)
            for (let k = 0; k + 1 < zLines.length; k++) {
                const x0 = flangeX[i], x1 = flangeX[i + 1], z0 = zLines[k], z1 = zLines[k + 1];
                add([node(x0, flangeY, z0), node(x1, flangeY, z0), node(x1, flangeY, z1), node(x0, flangeY, z1)], g.flange.thickness, flangeMaterial, "beamflange", false);
            }
    }
    // bolts: one per row in the half model (the second bolt of the row is its mirror image)
    const bolts = g.rows.map(row => {
        const n = byKey.get(`${Math.round(g.boltX * 1e4)},${Math.round(row.y * 1e4)},0`);
        if (!n)
            throw new EndPlateFeError(`Bolt row ${row.id}: no mesh node at the bolt axis`);
        const id = `bolt-${row.id}`;
        const parts = [{ springId: id, nodeId: n.id, y: row.y, stiffness: g.bolt.stiffness }];
        return { id, rowId: row.id, nodeId: n.id, x: g.boltX, y: row.y, capacity: g.bolt.capacity, stiffness: g.bolt.stiffness, parts };
    });
    // row bands of the plate: boundaries at the tension flange between two rows, else at mid-pitch
    const sorted = [...g.rows].sort((a, b) => b.y - a.y);
    const bandLimits = sorted.map((row, r) => {
        const boundary = (upper, lower) => g.flange && g.flange.y < upper.y && g.flange.y > lower.y ? g.flange.y : (upper.y + lower.y) / 2;
        return {
            rowId: row.id,
            upper: r === 0 ? Number.POSITIVE_INFINITY : boundary(sorted[r - 1], row),
            lower: r === sorted.length - 1 ? Number.NEGATIVE_INFINITY : boundary(row, sorted[r + 1]),
        };
    });
    const rowIndex = new Map(g.rows.map((row, i) => [row.id, i]));
    const plateNodes = nodes.filter(n => Math.abs(n.xyz[2]) < 1e-9);
    const contacts = plateNodes.map(n => {
        const y = n.xyz[1];
        const bands = [];
        for (const band of bandLimits) {
            const index = rowIndex.get(band.rowId);
            const onUpper = Number.isFinite(band.upper) && Math.abs(y - band.upper) < 1e-6;
            const onLower = Number.isFinite(band.lower) && Math.abs(y - band.lower) < 1e-6;
            if (onUpper || onLower)
                bands.push([index, 0.5]);
            else if (y < band.upper && y > band.lower)
                bands.push([index, 1]);
        }
        const onSymmetry = Math.abs(n.xyz[0]) < 1e-9;
        return { nodeId: n.id, stiffness: onSymmetry ? ENDPLATE_FE_CONTACT_STIFFNESS / 2 : ENDPLATE_FE_CONTACT_STIFFNESS, bands };
    });
    const springs = contacts.map(c => ({ id: `contact-${c.nodeId}`, nodeId: c.nodeId, direction: [0, 0, 1], stiffness: c.stiffness, kind: "contact", reportMultiplier: 2 }));
    for (const bolt of bolts)
        for (const part of bolt.parts) {
            springs.push({ id: part.springId, nodeId: part.nodeId, direction: [0, 0, 1], stiffness: part.stiffness, kind: "bolt", capacity: bolt.capacity * part.stiffness / bolt.stiffness, reportMultiplier: 1 });
        }
    const fixedDofs = new Map();
    // symmetry about the web plane x = 0: u_x = 0, theta_y = 0, theta_z = 0
    for (const n of nodes)
        if (Math.abs(n.xyz[0]) < 1e-9) {
            fixedDofs.set(n.id * 6, 0);
            fixedDofs.set(n.id * 6 + 4, 0);
            fixedDofs.set(n.id * 6 + 5, 0);
        }
    const topNodes = nodes.filter(n => Math.abs(n.xyz[2] - g.depth) < 1e-6);
    if (topNodes.length === 0)
        throw new EndPlateFeError("The beam strips have no end nodes");
    // the only free rigid-body motion left is a translation along y: hold one end node of the web
    const meanRowY = g.rows.reduce((sum, row) => sum + row.y, 0) / g.rows.length;
    const webEnd = topNodes.filter(n => Math.abs(n.xyz[0]) < 1e-9);
    let anchor = webEnd[0];
    for (const n of webEnd)
        if (Math.abs(n.xyz[1] - meanRowY) < Math.abs(anchor.xyz[1] - meanRowY))
            anchor = n;
    fixedDofs.set(anchor.id * 6 + 1, 0);
    const loading = g.loading ?? { kind: "uniform" };
    if (loading.kind === "rotation" && !(loading.yReference > loading.yCentre && topNodes.every(n => n.xyz[1] > loading.yCentre))) {
        throw new EndPlateFeError("Rotation loading: the beam strips must lie above the centre of rotation");
    }
    const topFactors = topNodes.map(n => loading.kind === "rotation" ? (n.xyz[1] - loading.yCentre) / (loading.yReference - loading.yCentre) : 1);
    const model = { nodes, elements, springs, fixedDofs };
    return {
        model, topDofs: topNodes.map(n => n.id * 6 + 2), topFactors, loadFactor: 2, bolts, contacts, bandLimits,
        elementCentroids: centroids, elementParts, stiffElements: stiff, xLines, yLines, zLines, geometry, meshSize: h, area,
    };
}
/** Model size without solving: degrees of freedom and elements. */
export function plateAssemblySize(geometry, mesh) {
    const built = buildPlateAssembly(geometry, mesh);
    return { dofCount: built.model.nodes.length * 6, elementCount: built.model.elements.length, representativeSize: Math.sqrt(built.area / built.model.elements.length) };
}
/** Runs the plate assembly to the T-stub failure criterion (fail-closed on non-convergence). */
export function runPlateAssembly(geometry, mesh, options = {}) {
    const started = Date.now();
    const built = buildPlateAssembly(geometry, mesh);
    const steps = options.loadSteps ?? 16;
    const limit = options.displacementLimit ?? 4;
    if (!(Number.isInteger(steps) && steps >= 2 && steps <= 200))
        throw new EndPlateFeError("Load steps must be an integer from 2 to 200");
    if (!(limit > 0 && limit <= 50))
        throw new EndPlateFeError("The displacement limit must be above 0 and at most 50 mm");
    const reference = Array.from({ length: steps }, (_, i) => limit * ((i + 1) / steps) ** 2);
    const targets = reference.map(value => new Map(built.topDofs.map((dof, k) => [dof, value * built.topFactors[k]])));
    const loading = geometry.loading ?? { kind: "uniform" };
    const momentCentre = loading.kind === "rotation" ? loading.yCentre : null;
    const capacity = geometry.bolt.capacity;
    /** Bolt force (sum of its springs) and the force without the cap (stiffness x elongation). */
    const boltForce = (point, bolt) => bolt.parts.reduce((sum, part) => sum + (point.boltForces[part.springId] ?? 0), 0);
    const boltDemand = (u, bolt) => bolt.parts.reduce((sum, part) => sum + part.stiffness * Math.max(0, u[part.nodeId * 6 + 2]), 0);
    const boltAtCapacity = (point) => built.bolts.some(bolt => boltForce(point, bolt) >= bolt.capacity * (1 - 1e-7));
    // the strain criterion covers all elements but those under the washers (the solver's "flange" measure)
    const criterionStrain = (point) => point.maxFlangePlasticStrain;
    const isEvent = (point) => criterionStrain(point) >= ENDPLATE_FE_STRAIN_LIMIT || boltAtCapacity(point);
    const rowCount = geometry.rows.length;
    const nodeY = (id) => built.model.nodes[id].xyz[1];
    // exact moment of the plate forces about y = momentCentre (bolt and contact forces at their own
    // y); equal to the moment of the strip-end forces, since no other force acts normal to the plate
    let stepMoment = 0;
    const rowsAt = (point, u) => {
        const prying = new Array(rowCount).fill(0);
        let moment = 0;
        for (const contact of built.contacts) {
            const uz = u[contact.nodeId * 6 + 2];
            if (uz >= 0)
                continue;
            const force = 2 * contact.stiffness * -uz;
            for (const [index, weight] of contact.bands)
                prying[index] += weight * force;
            if (momentCentre !== null)
                moment -= force * (nodeY(contact.nodeId) - momentCentre);
        }
        const rows = geometry.rows.map((row, i) => {
            const bolt = built.bolts[i];
            const force = boltForce(point, bolt);
            if (momentCentre !== null)
                for (const part of bolt.parts)
                    moment += 2 * (point.boltForces[part.springId] ?? 0) * (part.y - momentCentre);
            return { id: row.id, force: 2 * force - prying[i], boltForce: force, prying: prying[i] };
        });
        stepMoment = moment;
        return rows;
    };
    const stepRows = [];
    const stepMoments = [];
    // reference displacement of each converged state (load steps and event substeps)
    const stepReference = [];
    // largest bolt spring force without the cap (stiffness x elongation): the bolt measure for the
    // event interpolation, so that the event is the first bolt reaching F_t and not the end of the step
    const stepBoltDemand = [];
    let equilibriumErrorN = 0;
    let solution;
    try {
        solution = solveDisplacementPath(built.model, targets, {
            stopWhen: isEvent,
            eventBisections: options.eventBisections ?? 6,
            onStep: (point, step, stepCount, u) => {
                stepReference.push(u[built.topDofs[0]] / built.topFactors[0]);
                const rows = rowsAt(point, u);
                stepRows.push(rows);
                stepMoments.push(stepMoment);
                stepBoltDemand.push(Math.max(...built.bolts.map(bolt => boltDemand(u, bolt))));
                const applied = point.reaction * built.loadFactor;
                const error = Math.abs(rows.reduce((sum, row) => sum + row.force, 0) - applied);
                equilibriumErrorN = Math.max(equilibriumErrorN, error);
                if (error > ENDPLATE_FE_EQUILIBRIUM_RTOL * Math.abs(applied) + ENDPLATE_FE_EQUILIBRIUM_ATOL_N) {
                    throw new EndPlateFeError(`Equilibrium gate failed at step ${step}: row forces differ from the applied tension by ${error.toFixed(1)} N`);
                }
                options.onStep?.(Math.min(step, stepCount), stepCount, stepReference[step - 1]);
            },
        });
    }
    catch (error) {
        if (error instanceof EndPlateFeError)
            throw error;
        throw new EndPlateFeError(`The FE analysis did not converge: ${error instanceof Error ? error.message : String(error)}`);
    }
    const points = solution.points;
    const curve = points.map((point, i) => ({
        displacement: stepReference[i], reaction: point.reaction * built.loadFactor, moment: stepMoments[i], rows: stepRows[i].map(row => row.force),
    }));
    let eventIndex = points.findIndex(isEvent);
    const reached = eventIndex >= 0;
    if (!reached)
        eventIndex = points.length - 1;
    const point = points[eventIndex];
    // the state before the event step (the unloaded state before step 1)
    const zeroRows = geometry.rows.map(row => ({ id: row.id, force: 0, boltForce: 0, prying: 0 }));
    const prior = eventIndex > 0
        ? { reaction: points[eventIndex - 1].reaction, strain: criterionStrain(points[eventIndex - 1]), demand: stepBoltDemand[eventIndex - 1], displacement: stepReference[eventIndex - 1], moment: stepMoments[eventIndex - 1], rows: stepRows[eventIndex - 1] }
        : { reaction: 0, strain: 0, demand: 0, displacement: 0, moment: 0, rows: zeroRows };
    // the event within the step: linear interpolation of each measure to its threshold; when both
    // thresholds are crossed in the same step, the earlier crossing governs
    const crossing = (before, after, threshold) => after >= threshold && before < threshold && after > before ? (threshold - before) / (after - before) : null;
    const alphaStrain = reached ? crossing(prior.strain, criterionStrain(point), ENDPLATE_FE_STRAIN_LIMIT) : null;
    const alphaBolt = reached ? crossing(prior.demand, stepBoltDemand[eventIndex], capacity) : null;
    const strainFirst = criterionStrain(point) >= ENDPLATE_FE_STRAIN_LIMIT
        && (!boltAtCapacity(point) || (alphaStrain !== null && (alphaBolt === null || alphaStrain < alphaBolt)));
    const event = !reached ? "none" : strainFirst ? "plastic strain" : "bolt";
    let resistance = point.reaction * built.loadFactor;
    let failureDisplacement = stepReference[eventIndex];
    let moment = stepMoments[eventIndex];
    let rowForces = stepRows[eventIndex];
    const alpha = event === "bolt" ? alphaBolt : event === "plastic strain" ? alphaStrain : null;
    if (alpha !== null) {
        resistance = (prior.reaction + alpha * (point.reaction - prior.reaction)) * built.loadFactor;
        failureDisplacement = prior.displacement + alpha * (failureDisplacement - prior.displacement);
        moment = prior.moment + alpha * (moment - prior.moment);
        rowForces = rowForces.map((row, i) => {
            const b = prior.rows[i];
            return { id: row.id, force: b.force + alpha * (row.force - b.force), boltForce: b.boltForce + alpha * (row.boltForce - b.boltForce), prying: b.prying + alpha * (row.prying - b.prying) };
        });
    }
    // where the plasticity is at the event step (the solver stops there)
    const strains = solution.states.map(state => state.points.reduce((max, p) => Math.max(max, p.equivalentPlasticStrain), 0));
    let maxElement = 0;
    const parts = built.elementParts;
    strains.forEach((value, i) => { if (parts[i] !== "washer" && (parts[maxElement] === "washer" || value > strains[maxElement]))
        maxElement = i; });
    const regionOf = (i) => {
        const part = parts[i];
        return part === "web" ? "beam web" : part === "beamflange" ? "beam flange" : "end plate";
    };
    const bandOfY = (y) => built.bandLimits.find(band => y <= band.upper && y >= band.lower)?.rowId ?? null;
    let governingRowId = null;
    let mode = null;
    let governingRegion = strains[maxElement] > 0 ? regionOf(maxElement) : null;
    let mechanism;
    if (event === "bolt") {
        const demand = (bolt) => boltDemand(solution.displacement, bolt);
        let best = built.bolts[0];
        for (const bolt of built.bolts)
            if (demand(bolt) > demand(best))
                best = bolt;
        governingRowId = best.rowId;
        const band = built.bandLimits.find(item => item.rowId === best.rowId);
        let bandMax = 0, bandYielding = 0;
        built.model.elements.forEach((element, i) => {
            const c = built.elementCentroids[i];
            if (parts[i] !== "plate" || built.stiffElements[i] || c[1] > band.upper || c[1] < band.lower)
                return;
            bandMax = Math.max(bandMax, strains[i]);
            if (strains[i] > 1e-8)
                bandYielding++;
        });
        mode = bandMax > 0.005 && bandYielding > 4 ? 2 : 3;
        mechanism = mode === 2 ? `Mode 2 — the bolts of row ${best.rowId} reach their resistance, with yielding of the end plate` : `Mode 3 — the bolts of row ${best.rowId} reach their resistance before the end plate yields`;
        governingRegion = mode === 2 ? "end plate" : null;
    }
    else if (event === "plastic strain") {
        const c = built.elementCentroids[maxElement];
        governingRowId = bandOfY(c[1]);
        if (governingRegion === "end plate") {
            mode = 1;
            mechanism = `Mode 1 — the end plate yields at row ${governingRowId} (5 % plastic strain, bolts below their resistance)`;
        }
        else
            mechanism = `${governingRegion === "beam web" ? "Beam web in tension" : "Beam flange"} reaches 5 % plastic strain${governingRowId !== null ? ` near row ${governingRowId}` : ""}`;
    }
    else {
        mechanism = "No failure event within the displacement limit: the FE value is a lower bound";
    }
    const u = solution.displacement;
    const nodesCount = built.model.nodes.length;
    // full-width field for the 3D view: the half model and its mirror image about x = 0
    const mirrorIndex = new Int32Array(nodesCount).fill(-1);
    const fieldNodes = [], fieldDisp = [];
    for (const n of built.model.nodes) {
        fieldNodes.push(...n.xyz);
        fieldDisp.push(u[n.id * 6], u[n.id * 6 + 1], u[n.id * 6 + 2]);
    }
    let next = nodesCount;
    for (const n of built.model.nodes) {
        if (Math.abs(n.xyz[0]) < 1e-9) {
            mirrorIndex[n.id] = n.id;
            continue;
        }
        mirrorIndex[n.id] = next++;
        fieldNodes.push(-n.xyz[0], n.xyz[1], n.xyz[2]);
        fieldDisp.push(-u[n.id * 6], u[n.id * 6 + 1], u[n.id * 6 + 2]);
    }
    const fieldElements = [], regions = [], plastic = [];
    built.model.elements.forEach((element, i) => {
        fieldElements.push(...element.nodes.map(n => n.id));
        regions.push(parts[i] === "plate" || parts[i] === "washer" ? 0 : 1);
        plastic.push(strains[i]);
    });
    built.model.elements.forEach((element, i) => {
        if (parts[i] === "web")
            return; // the web lies in the symmetry plane
        fieldElements.push(...element.nodes.map(n => mirrorIndex[n.id]).reverse());
        regions.push(parts[i] === "plate" || parts[i] === "washer" ? 0 : 1);
        plastic.push(strains[i]);
    });
    const fieldBolts = built.bolts.flatMap(bolt => {
        const force = rowForces.find(row => row.id === bolt.rowId)?.boltForce ?? 0;
        return [-1, 1].map(side => ({ id: `${bolt.id}-${side < 0 ? "L" : "R"}`, x: side * bolt.x, y: bolt.y, force, capacity: bolt.capacity }));
    });
    const newtonIterations = points.reduce((sum, p) => sum + p.iterations, 0);
    return {
        built, resistance, failureDisplacement, event, rowForces, mode, governingRowId, governingRegion, mechanism,
        maxPlasticStrain: criterionStrain(point), moment,
        maxStrainAt: strains[maxElement] > 0 ? built.elementCentroids[maxElement] : null,
        curve, equilibriumErrorN,
        dofCount: solution.dofCount, elementCount: built.model.elements.length,
        representativeSize: Math.sqrt(built.area / built.model.elements.length),
        stepsRun: points.length, newtonIterations,
        timingMs: Date.now() - started, peakMemoryBytes: solution.peakMemoryBytes,
        field: { nodes: fieldNodes, elements: fieldElements, regions, displacement: fieldDisp, plasticStrain: plastic, mirrorY: null, bolts: fieldBolts },
    };
}
/**
 * The equal-leg T-stub of src/tstub.ts (one or more bolts per side along L) as a plate assembly:
 * same mesh, bolt springs (E A_s / (2 t_f + 20)), contact and loading, but modelled about the web plane
 * instead of the mid-length. Used to verify the assembly model against the T-stub model.
 */
export function tStubAsAssembly(input) {
    const E = input.E ?? 210_000, nu = input.nu ?? 0.3, fy = input.fy ?? 355, Et = input.Et ?? E / 1000;
    const fub = input.fub ?? 1000, As = input.As ?? 245;
    return {
        plate: { halfWidth: input.b / 2, yMin: 0, yMax: input.L, thickness: input.tf, fy },
        web: { thickness: input.tw, yMin: 0, yMax: input.L, fy },
        flange: null,
        depth: input.hw,
        boltX: input.tw / 2 + input.m,
        rows: Array.from({ length: input.nb }, (_, i) => ({ id: i + 1, y: (i + 0.5) * input.L / input.nb, leverArm: Number.NaN })),
        bolt: { capacity: 0.9 * fub * As, stiffness: E * As / (2 * input.tf + 20) },
        stiffZones: [],
        E, nu, Et,
    };
}
// ---------------------------------------------------------------------------------------------
// End-plate joints of the three pages
// ---------------------------------------------------------------------------------------------
/** Washer outer diameter d_w [mm] by bolt diameter (EN 14399-6 washers). */
export const WASHER_DIAMETER_MM = { 12: 24, 16: 30, 20: 37, 22: 39, 24: 44, 27: 50, 30: 56, 36: 66 };
export const ENDPLATE_FE_SUPPORT = {
    column: "column flange, taken as rigid (the column flange side is checked by the EN model only)",
    splice: "the opposite end plate (symmetry plane between the two plates)",
    web: "the primary-beam web, taken as rigid (the joint is symmetric about it)",
};
/** EN 1993-1-8 spec at gamma = 1 (characteristic strengths), for the comparison with the FE model. */
export function characteristicSpec(spec) {
    return { ...spec, gammaM0: 1, gammaM1: 1, gammaM2: 1 };
}
/** Geometry of the end-plate side tension zone, from the joint of a page (rows from the EN model). */
export function endPlateFeGeometry(type, spec, joint, options = {}) {
    const beam = spec.beam, plate = spec.plate;
    const yBottomOuter = (plate.heightMm - beam.heightMm) / 2;
    const yTopOuter = yBottomOuter + beam.heightMm;
    const yFlange = yTopOuter - beam.flangeThicknessMm / 2;
    const flangeWeld = 0.8 * Math.SQRT2 * spec.flangeWeldThroatMm;
    const webWeld = 0.8 * Math.SQRT2 * spec.webWeldThroatMm;
    const w = spec.gaugeMm;
    const ep = joint.endPlate.eMm;
    const mp = joint.endPlate.mMm;
    const rows = joint.rows.map(row => ({ id: row.rowId, y: row.yMm, leverArm: row.leverArmMm }));
    if (rows.length === 0)
        throw new EndPlateFeError("The joint has no bolt row in tension");
    const yLow = Math.min(...rows.map(row => row.y));
    const extent = 2 * mp + 0.625 * ep;
    const floor = yBottomOuter + beam.flangeThicknessMm + flangeWeld;
    const yCut = Math.max(yLow - extent, floor);
    const cutReason = yLow - extent >= floor
        ? `2m + 0.625e = ${extent.toFixed(1)} mm below the lowest tension row (the end-row pattern of Table 6.6)`
        : "at the compression-flange weld (the end-row pattern reaches the compression flange)";
    const fyBeam = fyForThickness(beam.steelGrade, beam.flangeThicknessMm);
    const E = 210_000;
    const halfWidth = w / 2 + ep;
    const flangeHalf = Math.min(beam.widthMm / 2, halfWidth);
    // a rigid counterpart takes the whole bolt elongation; two symmetric plates halve it
    const counterparts = type === "column" ? 1 : 2;
    const webZoneX = beam.webThicknessMm / 2 + webWeld;
    const flangeZone = [yFlange - beam.flangeThicknessMm / 2 - flangeWeld, Math.min(plate.heightMm, yFlange + beam.flangeThicknessMm / 2 + flangeWeld)];
    // washer footprint (outside the strain criterion): the square of the washer area (d_w of
    // EN 14399-6), kept clear of the stiff zones, the plate edges and the neighbouring rows
    const dw = WASHER_DIAMETER_MM[spec.bolt.diameterMm] ?? 1.85 * spec.bolt.diameterMm;
    const margins = [webZoneX < w / 2 ? w / 2 - webZoneX : 0, halfWidth - w / 2];
    const ys = rows.map(row => row.y).sort((a, b) => a - b);
    ys.forEach((y, i) => {
        margins.push(y - yCut, plate.heightMm - y);
        if (y > flangeZone[1])
            margins.push(y - flangeZone[1]);
        else if (y < flangeZone[0])
            margins.push(flangeZone[0] - y);
        if (i > 0)
            margins.push((y - ys[i - 1]) / 2);
    });
    let washerHalfSide = Math.min(Math.sqrt(Math.PI) / 4 * dw, ...margins.map(m => 0.9 * m));
    if (!(washerHalfSide >= 2))
        washerHalfSide = 0;
    return {
        plate: { halfWidth, yMin: yCut, yMax: plate.heightMm, thickness: plate.thicknessMm, fy: joint.endPlate.fyMpa },
        web: { thickness: beam.webThicknessMm, yMin: yCut, yMax: yFlange, fy: fyBeam },
        flange: { y: yFlange, halfWidth: flangeHalf, thickness: beam.flangeThicknessMm, fy: fyBeam },
        depth: options.depth ?? 100,
        boltX: w / 2,
        rows,
        bolt: { capacity: 0.9 * spec.bolt.fubMpa * spec.bolt.tensileAreaMm2, stiffness: counterparts * E * spec.bolt.tensileAreaMm2 / joint.lbMm, washerHalfSide },
        stiffZones: [
            { xMax: webZoneX, yMin: yCut - 1, yMax: yFlange },
            { xMax: flangeHalf, yMin: flangeZone[0], yMax: flangeZone[1] },
        ],
        E, nu: 0.3, Et: E / 1000,
        loading: options.loading === "uniform" ? { kind: "uniform" } : { kind: "rotation", yCentre: joint.centreOfCompressionMm, yReference: yFlange },
        yCut, cutReason,
    };
}
/**
 * EN 1993-1-8 6.2.7.2 effective row resistances with the end-plate side components only (end plate in
 * bending, bolts, beam web in tension), no compression-side limit: the components the FE model has.
 */
export function enEndPlateSide(joint) {
    const rows = joint.rows;
    const index = new Map(rows.map((row, i) => [row.rowId, i]));
    const groups = joint.groups
        .filter(group => group.component === "end plate in bending" || group.component === "beam web in tension")
        .map(group => ({ component: group.component, rowIds: group.rowIds, resistance: group.ftRdN, mode: group.tstub?.mode ?? null }));
    const result = [];
    const ftr = [];
    rows.forEach((row, r) => {
        let individual = row.endPlate.tstub.ftRdN;
        let individualBy = `end plate in bending, mode ${row.endPlate.tstub.mode}`;
        if (row.ftWbRdN !== null && row.ftWbRdN < individual) {
            individual = row.ftWbRdN;
            individualBy = "beam web in tension";
        }
        let value = individual, by = `${individualBy} (row alone)`;
        for (const group of groups) {
            const ids = group.rowIds.map(id => index.get(id));
            const first = Math.min(...ids), last = Math.max(...ids);
            if (last !== r || first === last)
                continue;
            let above = 0;
            for (let i = first; i < r; i++)
                above += ftr[i];
            if (group.resistance - above < value) {
                value = group.resistance - above;
                by = `${group.component} (rows ${group.rowIds.join("-")} as a group)`;
            }
        }
        for (let x = 0; x < r; x++) {
            if (ftr[x] > 1.9 * joint.boltTensionRdN) {
                const candidate = ftr[x] * row.leverArmMm / rows[x].leverArmMm;
                if (candidate < value) {
                    value = candidate;
                    by = `triangular limit from row ${rows[x].rowId} (6.2.7.2(9))`;
                }
            }
        }
        value = Math.max(0, value);
        ftr.push(value);
        result.push({ id: row.rowId, individual, individualBy, effective: value, effectiveBy: by });
    });
    return { rows: result, groups, sumFtr: ftr.reduce((s, v) => s + v, 0), mjNmm: ftr.reduce((s, v, r) => s + v * rows[r].leverArmMm, 0) };
}
/** Model size of a page joint (no solve). */
export function endPlateFeSize(type, spec, options = {}) {
    const joint = analyseEndPlateJoint(characteristicSpec(spec));
    return plateAssemblySize(endPlateFeGeometry(type, spec, joint, options), { meshSize: options.meshSize ?? 10 });
}
/** FE check of the end-plate tension zone of a page joint, with the EN comparison at gamma = 1. */
export function analyseEndPlateFe(type, spec, options = {}) {
    const started = Date.now();
    const joint = analyseEndPlateJoint(characteristicSpec(spec));
    const geometry = endPlateFeGeometry(type, spec, joint, options);
    const meshSize = options.meshSize ?? 10;
    const loadSteps = options.loadSteps ?? 16;
    const displacementLimit = options.displacementLimit ?? 4;
    const size = plateAssemblySize(geometry, { meshSize });
    if (size.dofCount > ENDPLATE_FE_MAX_DOF)
        throw new EndPlateFeError(`The model has ${size.dofCount} degrees of freedom, above the ${ENDPLATE_FE_MAX_DOF} limit: use a coarser mesh`);
    const eventBisections = options.eventBisections ?? 6;
    const run = runPlateAssembly(geometry, { meshSize }, { loadSteps, displacementLimit, eventBisections, onStep: options.onStep });
    const en = enEndPlateSide(joint);
    const feById = new Map(run.rowForces.map(row => [row.id, row]));
    const enById = new Map(en.rows.map(row => [row.id, row]));
    const rows = joint.rows.map(row => {
        const fe = feById.get(row.rowId), e = enById.get(row.rowId);
        return {
            id: row.rowId, y: row.yMm, leverArm: row.leverArmMm, location: row.location,
            fe: fe.force, feBoltForce: fe.boltForce, fePrying: fe.prying,
            enIndividual: e.individual, enIndividualBy: e.individualBy, enEffective: e.effective, enEffectiveBy: e.effectiveBy,
            enJoint: row.ftrRdN, enJointBy: row.ftrLimitedBy,
        };
    });
    const groups = en.groups.map(group => ({
        component: group.component, rowIds: group.rowIds, mode: group.mode, en: group.resistance,
        fe: group.rowIds.reduce((sum, id) => sum + (feById.get(id)?.force ?? 0), 0),
    }));
    const mjNmm = rows.reduce((sum, row) => sum + row.fe * row.leverArm, 0);
    const columnSideGoverns = joint.rows.some(row => /column/.test(row.ftrLimitedBy) || /column/.test(row.individualGoverning));
    return {
        version: ENDPLATE_FE_VERSION, type, support: ENDPLATE_FE_SUPPORT[type],
        model: {
            meshSize, representativeSize: run.representativeSize, depth: geometry.depth, dofCount: run.dofCount, elementCount: run.elementCount,
            yCut: geometry.yCut, cutReason: geometry.cutReason, halfWidth: geometry.plate.halfWidth,
            boltStiffness: geometry.bolt.stiffness, boltCapacity: geometry.bolt.capacity, lbMm: joint.lbMm,
            loadSteps, displacementLimit, stiffZoneFactor: ENDPLATE_FE_STIFF_ZONE_FACTOR, contactStiffness: ENDPLATE_FE_CONTACT_STIFFNESS,
            loading: geometry.loading?.kind ?? "uniform", eventBisections, washerHalfSide: geometry.bolt.washerHalfSide ?? 0, yCentre: joint.centreOfCompressionMm, yReference: geometry.flange.y,
        },
        fe: {
            resistance: run.resistance, failureDisplacement: run.failureDisplacement, event: run.event, mode: run.mode, mechanism: run.mechanism,
            governingRowId: run.governingRowId, governingRegion: run.governingRegion, maxPlasticStrain: run.maxPlasticStrain, maxStrainAt: run.maxStrainAt,
            mjNmm, momentExactNmm: geometry.loading?.kind === "rotation" ? run.moment : null, lowerBound: run.event === "none", equilibriumErrorN: run.equilibriumErrorN, stepsRun: run.stepsRun, newtonIterations: run.newtonIterations,
        },
        rows, groups,
        en: {
            sumFtr: en.sumFtr, mjNmm: en.mjNmm, jointSumFtr: joint.sumFtrN, jointMjNmm: joint.mjRdNmm, boltTension: joint.boltTensionRdN,
            columnSideGoverns, compressionLimited: joint.compression.rowsLimited,
        },
        ratios: { resistance: run.resistance / en.sumFtr, moment: mjNmm / en.mjNmm },
        curve: [{ displacement: 0, reaction: 0, moment: 0, rows: rows.map(() => 0) }, ...run.curve],
        field: run.field,
        view: { b: 2 * geometry.plate.halfWidth, hw: geometry.depth, tf: geometry.plate.thickness },
        timingMs: Date.now() - started,
        peakMemoryBytes: run.peakMemoryBytes,
    };
}
