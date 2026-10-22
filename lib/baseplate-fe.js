/**
 * FE verification of the pinned column base (base-plate.html), built on the
 * T-stub engine: MITC4 shells with layered plane-stress plasticity
 * (shell.ts, material.ts), ground springs for contact and anchors and
 * displacement control with rollback and bisection (solver.ts).
 *
 * Model (quarter of the doubly symmetric base, x along the column depth h,
 * y along the width b, origin at the column axis, plate mid-plane z = 0):
 * - base plate as shells; the plate under the column walls and their fillet
 *   welds (0.8 a√2 beyond each face, as EN 1993-1-8 measures m) is a stiff
 *   zone (3 t_p), so the plate hinges where EN puts the yield line;
 * - column flanges and web (I/H) or walls (hollow section) as vertical shells
 *   of height H, joined to the plate along their mid-planes, pulled (uplift)
 *   or pushed (compression) by a uniform displacement of their top edge;
 * - each anchor as a tension-only spring E A_s / L_b (L_b of EN 1993-1-8
 *   6.2.6.12), capped at F_t = 0.9 f_ub A_s (γ = 1), spread over the washer
 *   area (a square of the washer's area) by tributary weights;
 * - uplift: two runs, compression-only contact on a support (original penalty
 *   4000 N/mm³ × tributary area, the T-stub's 1e5 N/mm per node at 5 mm),
 *   and a free plate without support, compared with EN with/without prying;
 * - compression (indicative): an elastic bed E_cm / (1.275 √A_eff)
 *   (EN 1993-1-8 Table 6.11) capped at the bearing strength f_jd (γ = 1);
 * - optional grout t_g/E_g in series with either support, leaving f_jd unchanged.
 *
 * Resistance criterion: twice-elastic-slope limit load or anchor yield,
 * interpolated to the event; 5 % strain is information only. Units N, mm, MPa.
 */
import { checkBasePlate } from "./baseplate.js";
import { BOLT_CLASSES, BOLT_SIZES, steelStrength } from "./design.js";
import { CONCRETE_CLASSES } from "./eurocode-data.js";
import { solveDisplacementPath } from "./solver.js";
import { tesLimitLoad, strainInformation, limitLoadWarnings } from "./limit-load.js";
export const BASEPLATE_FE_VERSION = "baseplate-fe-0.1.0";
/** Informational peak equivalent plastic strain threshold; not a failure criterion. */
export const FE_STRAIN_LIMIT = 0.05;
/** Largest model the browser page runs. */
export const BASEPLATE_FE_MAX_DOF = 12000;
/** Penalty modulus of the rigid support, N/mm³. */
export const RIGID_SUPPORT_MODULUS = 4000;
/** Stiff zone under the column walls and welds: thickness factor on t_p. */
export const STIFF_ZONE_FACTOR = 3;
const KEY_TOLERANCE = 1e-6;
/** Grid lines through all key coordinates; every interval divided into refinement × ceil(length / h) parts. */
export function gridLines(lo, hi, keys, h, refinement = 1) {
    const inside = keys.filter(v => Number.isFinite(v) && v > lo + KEY_TOLERANCE && v < hi - KEY_TOLERANCE);
    const sorted = [lo, ...inside, hi].sort((p, q) => p - q);
    const unique = [];
    for (const v of sorted)
        if (!unique.length || v - unique[unique.length - 1] > KEY_TOLERANCE)
            unique.push(v);
    const lines = [unique[0]];
    for (let i = 1; i < unique.length; i++) {
        const a = unique[i - 1], b = unique[i];
        const n = refinement * Math.max(1, Math.ceil((b - a) / h - 1e-9));
        for (let k = 1; k <= n; k++)
            lines.push(k === n ? b : a + (b - a) * k / n);
    }
    return lines;
}
/** Length of the tributary interval of line i clipped to [lo, hi]; a degenerate range picks the line on it. */
function tributary(lines, i, lo, hi) {
    if (hi - lo < KEY_TOLERANCE)
        return Math.abs(lines[i] - lo) < KEY_TOLERANCE ? 1 : 0;
    const a = i > 0 ? (lines[i - 1] + lines[i]) / 2 : lines[i];
    const b = i < lines.length - 1 ? (lines[i] + lines[i + 1]) / 2 : lines[i];
    return Math.max(0, Math.min(b, hi) - Math.max(a, lo));
}
function indexOfLine(lines, value) {
    const index = lines.findIndex(v => Math.abs(v - value) < KEY_TOLERANCE);
    if (index < 0)
        throw new Error(`No mesh line at ${value} mm`);
    return index;
}
export function buildPlateModel(spec) {
    const { plate, meshSize } = spec;
    const refinement = spec.meshRefinement ?? 1;
    if (!(meshSize > 0) || !Number.isInteger(refinement) || refinement < 1)
        throw new Error("Mesh size must be positive and the refinement a positive integer");
    if (!(plate.x1 > plate.x0) || !(plate.y1 > plate.y0) || !(spec.thickness > 0) || !(spec.wallHeight > 0))
        throw new Error("Plate extents, thickness and wall height must be positive");
    if (spec.walls.length === 0)
        throw new Error("The plate model needs at least one wall to carry the load");
    const clipX = (v) => Math.min(plate.x1, Math.max(plate.x0, v));
    const clipY = (v) => Math.min(plate.y1, Math.max(plate.y0, v));
    const keyX = [], keyY = [];
    for (const z of spec.zones) {
        keyX.push(z.x0, z.x1);
        keyY.push(z.y0, z.y1);
    }
    for (const w of spec.walls) {
        if (w.plane === "x") {
            keyX.push(w.at);
            keyY.push(w.from, w.to);
        }
        else {
            keyY.push(w.at);
            keyX.push(w.from, w.to);
        }
    }
    for (const a of spec.anchors) {
        keyX.push(a.x0, a.x, a.x1);
        keyY.push(a.y0, a.y, a.y1);
    }
    const xs = gridLines(plate.x0, plate.x1, keyX.map(clipX), meshSize, refinement);
    const ys = gridLines(plate.y0, plate.y1, keyY.map(clipY), meshSize, refinement);
    const nodes = [];
    const byKey = new Map();
    const key = (p) => p.map(v => Math.round(v / KEY_TOLERANCE)).join(",");
    const nodeAt = (p) => {
        const k = key(p);
        let node = byKey.get(k);
        if (!node) {
            node = { id: nodes.length, xyz: p };
            nodes.push(node);
            byKey.set(k, node);
        }
        return node;
    };
    const E = spec.material.E, nu = spec.material.nu, Et = spec.material.Et ?? E / 1000;
    const plateMaterial = { E, nu, fy: spec.material.fy, Et };
    const plateNodes = ys.map(y => xs.map(x => nodeAt([x, y, 0]).id));
    const elements = [];
    const elementKinds = [];
    for (let j = 0; j < ys.length - 1; j++)
        for (let i = 0; i < xs.length - 1; i++) {
            const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
            const zone = spec.zones.find(z => cx > z.x0 && cx < z.x1 && cy > z.y0 && cy < z.y1);
            const ids = [plateNodes[j][i], plateNodes[j][i + 1], plateNodes[j + 1][i + 1], plateNodes[j + 1][i]];
            elements.push({ nodes: ids.map(id => nodes[id]), thickness: zone ? zone.thickness : spec.thickness, material: plateMaterial, region: zone ? "stiff" : "flange" });
            elementKinds.push(zone ? "stiff" : "plate");
        }
    const zs = gridLines(0, spec.wallHeight, [], meshSize * (spec.wallMeshFactor ?? 2), refinement);
    const wallMaterials = new Map();
    const topNodes = new Set();
    for (const wall of spec.walls) {
        const fy = wall.fy ?? spec.material.fy;
        let material = wallMaterials.get(fy);
        if (!material) {
            material = { E, nu, fy, Et };
            wallMaterials.set(fy, material);
        }
        const along = wall.plane === "x" ? ys : xs;
        const from = wall.plane === "x" ? clipY(wall.from) : clipX(wall.from);
        const to = wall.plane === "x" ? clipY(wall.to) : clipX(wall.to);
        const first = indexOfLine(along, Math.min(from, to)), last = indexOfLine(along, Math.max(from, to));
        indexOfLine(wall.plane === "x" ? xs : ys, wall.at); // the wall must sit on a plate mesh line
        const point = (s, z) => wall.plane === "x" ? [wall.at, s, z] : [s, wall.at, z];
        for (let k = first; k < last; k++)
            for (let l = 0; l < zs.length - 1; l++) {
                const quad = [point(along[k], zs[l]), point(along[k + 1], zs[l]), point(along[k + 1], zs[l + 1]), point(along[k], zs[l + 1])].map(nodeAt);
                elements.push({ nodes: quad, thickness: wall.thickness, material, region: "web" });
                elementKinds.push("wall");
            }
        for (let k = first; k <= last; k++)
            topNodes.add(nodeAt(point(along[k], spec.wallHeight)).id);
    }
    // foundation springs at every plate node, by tributary area
    const springs = [];
    const foundation = [];
    if (spec.foundation.kind !== "none") {
        for (let j = 0; j < ys.length; j++)
            for (let i = 0; i < xs.length; i++) {
                const area = tributary(xs, i, plate.x0, plate.x1) * tributary(ys, j, plate.y0, plate.y1);
                const nodeId = plateNodes[j][i];
                if (spec.foundation.kind === "rigid") {
                    const id = `contact-${nodeId}`;
                    springs.push({ id, nodeId, direction: [0, 0, 1], stiffness: spec.foundation.modulus * area, kind: "contact", reportMultiplier: 1 });
                    foundation.push({ id, nodeId, x: xs[i], y: ys[j], area });
                }
                else {
                    // compression-only bed with a pressure cap: a capped tension-only spring acting downwards
                    const id = `bed-${nodeId}`;
                    springs.push({ id, nodeId, direction: [0, 0, -1], stiffness: spec.foundation.modulus * area, kind: "bolt", capacity: spec.foundation.pressure * area, reportMultiplier: 1 });
                    foundation.push({ id, nodeId, x: xs[i], y: ys[j], area });
                }
            }
    }
    const anchors = [];
    for (const anchor of spec.anchors) {
        const x0 = clipX(anchor.x0), x1 = clipX(anchor.x1), y0 = clipY(anchor.y0), y1 = clipY(anchor.y1);
        const raw = [];
        for (let j = 0; j < ys.length; j++) {
            const wy = tributary(ys, j, y0, y1);
            if (wy <= 0)
                continue;
            for (let i = 0; i < xs.length; i++) {
                const wx = tributary(xs, i, x0, x1);
                if (wx > 0)
                    raw.push({ nodeId: plateNodes[j][i], weight: wx * wy });
            }
        }
        const total = raw.reduce((sum, item) => sum + item.weight, 0);
        if (!(total > 0))
            throw new Error(`Anchor ${anchor.id} has no mesh node in its area`);
        const parts = raw.map((item, k) => ({ id: `${anchor.id}#${k}`, nodeId: item.nodeId, weight: item.weight / total }));
        for (const part of parts)
            springs.push({ id: part.id, nodeId: part.nodeId, direction: [0, 0, 1], stiffness: anchor.stiffness * part.weight, kind: "bolt", capacity: anchor.capacity * part.weight, reportMultiplier: 1 });
        anchors.push({ spec: anchor, springs: parts });
    }
    const fixedDofs = new Map();
    const sym = spec.symmetry;
    for (const node of nodes) {
        const [x, y] = node.xyz;
        if ((sym.x0 && Math.abs(x - plate.x0) < KEY_TOLERANCE) || (sym.x1 && Math.abs(x - plate.x1) < KEY_TOLERANCE))
            for (const d of [0, 4, 5])
                fixedDofs.set(node.id * 6 + d, 0);
        if ((sym.y0 && Math.abs(y - plate.y0) < KEY_TOLERANCE) || (sym.y1 && Math.abs(y - plate.y1) < KEY_TOLERANCE))
            for (const d of [1, 3, 5])
                fixedDofs.set(node.id * 6 + d, 0);
    }
    // the column continues above the stub: its top section keeps its shape (u_x = u_y = 0)
    for (const id of topNodes) {
        fixedDofs.set(id * 6, 0);
        fixedDofs.set(id * 6 + 1, 0);
    }
    const topDofs = [...topNodes].map(id => id * 6 + 2);
    return { spec, model: { nodes, elements, springs, fixedDofs }, topDofs, xs, ys, plateNodes, elementKinds, anchors, foundation };
}
function anchorTotals(built, point) {
    return built.anchors.map(anchor => anchor.springs.reduce((sum, part) => sum + (point.boltForces[part.id] ?? 0), 0));
}
function foundationTotal(built, point) {
    if (built.spec.foundation.kind === "rigid")
        return point.pryingForce;
    if (built.spec.foundation.kind === "bed")
        return built.foundation.reduce((sum, item) => sum + (point.boltForces[item.id] ?? 0), 0);
    return 0;
}
export function runPlateModel(built, options) {
    const { spec } = built;
    const steps = options.loadSteps, limit = options.displacementLimit;
    if (!Number.isInteger(steps) || steps < 1 || !(limit > 0))
        throw new Error("Load steps must be a positive integer and the displacement limit positive");
    const targets = Array.from({ length: steps }, (_, i) => {
        const value = spec.direction * limit * ((i + 1) / steps) ** 2;
        return new Map(built.topDofs.map(dof => [dof, value]));
    });
    const capacities = built.anchors.map(anchor => anchor.spec.capacity);
    const anchorRatio = (point) => Math.max(0, ...anchorTotals(built, point).map((force, i) => force / capacities[i]));
    const anchorYield = (point) => built.anchors.length > 0 && anchorRatio(point) >= 1 - 1e-7;
    const m = spec.multiplier;
    const force = (point) => spec.direction * point.reaction * m;
    const accepted = [];
    const asLimitPoint = (point) => ({ displacement: Math.abs(point.displacement), reaction: force(point), plasticStrain: point.maxPlasticStrain });
    const isEvent = (point) => anchorYield(point) || tesLimitLoad((accepted.at(-1) === point ? accepted : [...accepted, point]).map(asLimitPoint)).crossed;
    const solution = solveDisplacementPath(built.model, targets, { stopWhen: isEvent, onStep: (point, step, count) => { accepted.push(point); options.onStep?.(point, step, count); } });
    const limitPoints = solution.points.map(asLimitPoint);
    const limitLoad = tesLimitLoad(limitPoints);
    const curve = [{ displacement: 0, force: 0, anchorForce: 0, contactForce: 0 }, ...solution.points.map(point => ({
            displacement: Math.abs(point.displacement), force: force(point),
            anchorForce: Math.max(0, ...anchorTotals(built, point)), contactForce: foundationTotal(built, point) * m
        }))];
    const eventIndex = solution.points.length - 1;
    const point = solution.points[eventIndex];
    const prior = eventIndex > 0 ? solution.points[eventIndex - 1] : undefined;
    // interpolate to the first event between the previous step (or the unloaded state) and the event
    // step; when both thresholds are crossed in the same step the earlier crossing governs
    const crossing = (measure, threshold) => {
        const before = prior ? measure(prior) : 0, after = measure(point);
        if (after < threshold)
            return Number.POSITIVE_INFINITY;
        return after > before && before < threshold ? (threshold - before) / (after - before) : 1;
    };
    const alphaLimit = limitLoad.crossed ? (limitLoad.u - (prior ? Math.abs(prior.displacement) : 0)) / (Math.abs(point.displacement) - (prior ? Math.abs(prior.displacement) : 0)) : Number.POSITIVE_INFINITY;
    const alphaAnchor = built.anchors.length > 0 ? crossing(anchorRatio, 1 - 1e-7) : Number.POSITIVE_INFINITY;
    const event = !limitLoad.crossed && !anchorYield(point) ? "none" : alphaAnchor < alphaLimit ? "anchor" : "limit load";
    const alpha = event === "none" ? 1 : Math.min(alphaLimit, alphaAnchor);
    const lerp = (a, b) => a + alpha * (b - a);
    const resistance = lerp(prior ? force(prior) : 0, force(point));
    const failureDisplacement = lerp(prior ? Math.abs(prior.displacement) : 0, Math.abs(point.displacement));
    const totalsNow = anchorTotals(built, point), totalsBefore = prior ? anchorTotals(built, prior) : totalsNow.map(() => 0);
    const anchorForces = {};
    built.anchors.forEach((anchor, i) => { anchorForces[anchor.spec.id] = lerp(totalsBefore[i], totalsNow[i]); });
    const contactForce = lerp(prior ? foundationTotal(built, prior) : 0, foundationTotal(built, point)) * m;
    // per element kind: largest equivalent plastic strain of the converged event step
    const strainByKind = { plate: 0, stiff: 0, wall: 0 };
    let peakElement = 0, peakValue = -1;
    solution.states.forEach((state, e) => {
        const kind = built.elementKinds[e];
        for (const p of state.points) {
            if (p.equivalentPlasticStrain > strainByKind[kind])
                strainByKind[kind] = p.equivalentPlasticStrain;
            if (p.equivalentPlasticStrain > peakValue) {
                peakValue = p.equivalentPlasticStrain;
                peakElement = e;
            }
        }
    });
    const peakNodes = built.model.elements[peakElement].nodes;
    const centre = [0, 1, 2].map(k => peakNodes.reduce((sum, node) => sum + node.xyz[k], 0) / 4);
    // a corner of a stiff zone that lies inside the plate (a re-entrant corner of the clamped region)
    const corners = spec.zones.flatMap(z => [[z.x0, z.y0], [z.x0, z.y1], [z.x1, z.y0], [z.x1, z.y1]])
        .filter(([x, y]) => x > spec.plate.x0 + KEY_TOLERANCE && x < spec.plate.x1 - KEY_TOLERANCE && y > spec.plate.y0 + KEY_TOLERANCE && y < spec.plate.y1 - KEY_TOLERANCE)
        .filter(([x, y]) => !spec.zones.some(z => x > z.x0 + KEY_TOLERANCE && x < z.x1 - KEY_TOLERANCE && y > z.y0 + KEY_TOLERANCE && y < z.y1 - KEY_TOLERANCE));
    const atZoneCorner = peakNodes.some(node => Math.abs(node.xyz[2]) < KEY_TOLERANCE && corners.some(([x, y]) => Math.abs(node.xyz[0] - x) < KEY_TOLERANCE && Math.abs(node.xyz[1] - y) < KEY_TOLERANCE));
    const peakStrain = { kind: built.elementKinds[peakElement], x: centre[0], y: centre[1], z: centre[2], strain: Math.max(0, peakValue), atZoneCorner };
    // fail-closed gate: vertical equilibrium of the model at the converged event step,
    // column force = anchors - contact (uplift) or bed - anchors (compression)
    const anchorSum = totalsNow.reduce((sum, f) => sum + f, 0);
    const foundationSum = foundationTotal(built, point);
    const reaction = spec.direction * point.reaction;
    const springsNet = spec.direction > 0 ? anchorSum - foundationSum : foundationSum - anchorSum;
    const tolerance = 1e-3 * Math.max(Math.abs(reaction), anchorSum, foundationSum) + 1;
    const error = Math.abs(reaction - springsNet);
    const equilibrium = { reaction: reaction * m, springs: springsNet * m, error: error * m, tolerance: tolerance * m, pass: error <= tolerance };
    if (!equilibrium.pass)
        throw new Error(`Equilibrium gate failed: column force ${reaction.toFixed(1)} N vs springs ${springsNet.toFixed(1)} N (tolerance ${tolerance.toFixed(1)} N, model scale)`);
    return {
        built, solution, curve, event, resistance, failureDisplacement, anchorForces, contactForce,
        limitLoad, strain5: strainInformation(limitPoints, FE_STRAIN_LIMIT), warnings: limitLoadWarnings(limitLoad, event),
        maxPlasticStrain: point.maxPlasticStrain, maxPlatePlasticStrain: point.maxFlangePlasticStrain,
        plateYieldingElements: point.flangeYieldingElements, strainByKind, peakStrain, equilibrium
    };
}
const OPTION_FIELDS = [
    { name: "meshSize", min: 2.5, max: 25 },
    { name: "meshRefinement", min: 1, max: 4, integer: true },
    { name: "displacementLimit", min: 0.2, max: 30 },
    { name: "loadSteps", min: 4, max: 60, integer: true },
    { name: "groutThickness", min: 0, max: 100 },
    { name: "groutE", min: 5000, max: 60000 },
    { name: "E", min: 100000, max: 300000 },
    { name: "nu", min: 0, max: 0.49 },
    { name: "Et", min: 0, max: 30000 }
];
/** Validates the FE settings of the page (empty or missing values take the defaults). */
export function normaliseBasePlateFeOptions(raw) {
    if (raw === undefined || raw === null)
        return { ok: true, options: {} };
    if (typeof raw !== "object" || Array.isArray(raw))
        return { ok: false, errors: ["FE settings must be an object"] };
    const source = raw;
    const errors = [];
    const known = new Set(["loadCase", ...OPTION_FIELDS.map(field => field.name)]);
    const unknown = Object.keys(source).filter(name => !known.has(name));
    if (unknown.length)
        errors.push(`Unknown FE setting(s): ${unknown.join(", ")}`);
    const options = {};
    if (source.loadCase !== undefined && source.loadCase !== "") {
        if (source.loadCase !== "uplift" && source.loadCase !== "compression")
            errors.push("loadCase must be uplift or compression");
        else
            options.loadCase = source.loadCase;
    }
    for (const field of OPTION_FIELDS) {
        const value = source[field.name];
        if (value === undefined || value === "" || value === null)
            continue;
        if (typeof value !== "number" || !Number.isFinite(value)) {
            errors.push(`${field.name} must be a finite number`);
            continue;
        }
        if (field.integer && !Number.isInteger(value)) {
            errors.push(`${field.name} must be an integer`);
            continue;
        }
        if (field.name === "Et" ? value <= field.min || value > field.max : value < field.min || value > field.max) {
            errors.push(`${field.name} must be ${field.name === "Et" ? `> ${field.min}` : `at least ${field.min}`} and at most ${field.max}`);
            continue;
        }
        options[field.name] = value;
    }
    return errors.length ? { ok: false, errors } : { ok: true, options };
}
/** EN 1992-1-1 Table 3.1: E_cm = 22 000 ((f_ck + 8) / 10)^0.3 MPa. */
export function concreteEcm(fck) {
    return 22000 * ((fck + 8) / 10) ** 0.3;
}
/** The EN component model at γ = 1 (characteristic strengths), the reference of the FE comparison. */
export function checkBasePlateCharacteristic(input) {
    return checkBasePlate({ ...input, gammaM0: 1, gammaM2: 1, gammaC: 1, alphaCC: 1 });
}
function anchorSquareSide(dw) {
    // square of the washer's area
    return dw * Math.sqrt(Math.PI) / 2;
}
function columnHeightOf(input) {
    return Math.min(400, Math.max(100, 0.75 * Math.max(input.h, input.b)));
}
/** Series support modulus (N/mm³); bypass arithmetic at zero thickness for bit-identical defaults. */
function groutSupportModulus(k0, options) {
    return options.groutThickness === 0 ? k0 : 1 / (1 / k0 + options.groutThickness / options.groutE);
}
function specFor(input, options, en) {
    const g = input;
    const plateSteel = steelStrength(g.steelGrade, g.tp);
    const material = { E: options.E, nu: options.nu, fy: plateSteel.fy, Et: options.Et };
    const wl = 0.8 * g.aw * Math.SQRT2;
    const hx = g.hp / 2, hy = g.bp / 2;
    const zoneThickness = options.stiffZoneFactor * g.tp;
    // compression: the column stub stays elastic, so that its squash load (not checked here) cannot cap the bearing
    const wallFy = (t) => (options.loadCase === "compression" ? 10 : 1) * steelStrength(g.steelGrade, t).fy;
    const zones = [];
    const walls = [];
    const zone = (x0, x1, y0, y1) => {
        const r = { x0: Math.max(0, x0), x1: Math.min(hx, x1), y0: Math.max(0, y0), y1: Math.min(hy, y1), thickness: zoneThickness };
        if (r.x1 > r.x0 && r.y1 > r.y0)
            zones.push(r);
    };
    if (g.columnType === "I") {
        const tf = g.tf, tw = g.tw;
        walls.push({ plane: "x", at: g.h / 2 - tf / 2, from: 0, to: g.b / 2, thickness: tf, fy: wallFy(tf), name: "flange" });
        // the web lies in the symmetry plane y = 0: half its thickness
        walls.push({ plane: "y", at: 0, from: 0, to: g.h / 2 - tf / 2, thickness: tw / 2, fy: wallFy(tw), name: "web" });
        zone(g.h / 2 - tf - wl, g.h / 2 + wl, 0, g.b / 2 + wl);
        zone(0, g.h / 2 - tf, 0, tw / 2 + wl);
    }
    else {
        const t = g.t;
        const fy = wallFy(t);
        walls.push({ plane: "x", at: g.h / 2 - t / 2, from: 0, to: g.b / 2 - t / 2, thickness: t, fy, name: "wall (x)" });
        walls.push({ plane: "y", at: g.b / 2 - t / 2, from: 0, to: g.h / 2 - t / 2, thickness: t, fy, name: "wall (y)" });
        // fillet welds outside only
        zone(g.h / 2 - t, g.h / 2 + wl, 0, g.b / 2 + wl);
        zone(0, g.h / 2 + wl, g.b / 2 - t, g.b / 2 + wl);
    }
    const bolt = BOLT_SIZES[g.anchorSize];
    const fub = BOLT_CLASSES[g.anchorClass].fub;
    const Lb = en.tension.Lb;
    const stiffness = options.E * bolt.As / Lb;
    const capacity = 0.9 * fub * bolt.As;
    const side = anchorSquareSide(bolt.dw);
    const ax = g.px / 2, ay = g.py / 2;
    const anchors = [{ id: "anchor", x: ax, y: ay, x0: ax - side / 2, x1: ax + side / 2, y0: ay - side / 2, y1: ay + side / 2, stiffness, capacity }];
    let foundation;
    let bed;
    let k0;
    if (options.loadCase === "uplift") {
        k0 = RIGID_SUPPORT_MODULUS;
        foundation = { kind: "rigid", modulus: groutSupportModulus(k0, options) };
    }
    else {
        const Ecm = concreteEcm(CONCRETE_CLASSES[g.concrete]);
        k0 = Ecm / (1.275 * Math.sqrt(en.compression.Aeff));
        const modulus = groutSupportModulus(k0, options);
        bed = { modulus, pressure: en.compression.fjd, Ecm };
        foundation = { kind: "bed", modulus, pressure: en.compression.fjd };
    }
    const spec = {
        plate: { x0: 0, x1: hx, y0: 0, y1: hy }, thickness: g.tp, material, zones, walls,
        wallHeight: options.columnHeight, anchors, foundation, symmetry: { x0: true, y0: true },
        meshSize: options.meshSize, meshRefinement: options.meshRefinement, multiplier: 4,
        direction: options.loadCase === "uplift" ? 1 : -1
    };
    return { spec, anchor: { stiffness, capacity, Lb, As: bolt.As, fub, washerSide: side }, supportModulus: { k0, k: foundation.modulus }, ...(bed ? { bed } : {}) };
}
/** Resolves the defaults: automatic mesh size (coarsened to the DOF limit) and displacement limit. */
export function resolveBasePlateFeOptions(input, options = {}, maxDof = BASEPLATE_FE_MAX_DOF) {
    const en = checkBasePlateCharacteristic(input);
    const E = options.E ?? 210000;
    const loadCase = options.loadCase ?? "uplift";
    const base = {
        loadCase, meshRefinement: options.meshRefinement ?? 1, loadSteps: options.loadSteps ?? 24,
        groutThickness: options.groutThickness ?? 0, groutE: options.groutE ?? 30000,
        E, nu: options.nu ?? 0.3, Et: options.Et ?? E / 1000,
        columnHeight: columnHeightOf(input), stiffZoneFactor: STIFF_ZONE_FACTOR
    };
    let meshSize = options.meshSize;
    const meshSizeAuto = meshSize === undefined;
    if (meshSize === undefined) {
        meshSize = Math.min(15, Math.max(5, Math.round(en.tension.mx / 3 * 2) / 2));
        for (let guard = 0; guard < 60; guard++) {
            const trial = { ...base, meshSize, displacementLimit: 1, meshSizeAuto, displacementLimitAuto: true };
            if (buildPlateModel(specFor(input, trial, en).spec).model.nodes.length * 6 <= maxDof || meshSize >= 25)
                break;
            meshSize += 0.5;
        }
    }
    let displacementLimit = options.displacementLimit;
    const displacementLimitAuto = displacementLimit === undefined;
    if (displacementLimit === undefined) {
        if (loadCase === "uplift") {
            const fub = BOLT_CLASSES[input.anchorClass].fub;
            const anchorYieldElongation = 0.9 * fub * en.tension.Lb / E;
            displacementLimit = Math.min(30, Math.max(4, 3 * anchorYieldElongation + en.tension.mx / 5));
        }
        else {
            const modulus = concreteEcm(CONCRETE_CLASSES[input.concrete]) / (1.275 * Math.sqrt(en.compression.Aeff));
            displacementLimit = Math.min(30, Math.max(2, 10 * en.compression.fjd / modulus));
        }
        displacementLimit = Math.round(displacementLimit * 10) / 10;
    }
    return { ...base, meshSize, displacementLimit, meshSizeAuto, displacementLimitAuto };
}
export function buildBasePlateFe(input, options = {}) {
    const resolved = resolveBasePlateFeOptions(input, options);
    const en = checkBasePlateCharacteristic(input);
    const { spec, anchor, supportModulus, bed } = specFor(input, resolved, en);
    return { built: buildPlateModel(spec), options: resolved, en, anchor, supportModulus, ...(bed ? { bed } : {}) };
}
/** Degrees of freedom of the FE model (the mesh is built, nothing is solved). */
export function estimateBasePlateFeDof(input, options = {}) {
    return buildBasePlateFe(input, options).built.model.nodes.length * 6;
}
function modeOf(run, loadCase) {
    if (run.event === "none")
        return "no limit load within the displacement limit";
    if (loadCase === "compression")
        return "plate yield (limit load)";
    if (run.event === "anchor")
        return run.maxPlatePlasticStrain > 0.005 && run.plateYieldingElements > 4 ? "mode 2: plate yield and anchor yield" : "mode 3: anchor yield";
    const location = Object.entries(run.strainByKind).reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    if (location === "wall")
        return "column wall yield (limit load)";
    return run.contactForce > 0.01 * run.resistance ? "mode 1: plate yield with prying" : "mode 1-2: plate yield, no prying";
}
function fieldOf(run, input, anchorCapacity) {
    const { model, elementKinds, spec } = run.built;
    const u = run.solution.displacement;
    const nodes = [], displacement = [], elements = [], regions = [], plasticStrain = [];
    const strains = run.solution.states.map(state => state.points.reduce((max, p) => Math.max(max, p.equivalentPlasticStrain), 0));
    const count = model.nodes.length;
    const quadrants = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    quadrants.forEach(([sx, sy], q) => {
        for (const node of model.nodes) {
            nodes.push(sx * node.xyz[0], sy * node.xyz[1], node.xyz[2]);
            displacement.push(sx * u[node.id * 6], sy * u[node.id * 6 + 1], u[node.id * 6 + 2]);
        }
        model.elements.forEach((element, e) => {
            const onX = element.nodes.every(n => Math.abs(n.xyz[0]) < KEY_TOLERANCE);
            const onY = element.nodes.every(n => Math.abs(n.xyz[1]) < KEY_TOLERANCE);
            if ((sx < 0 && onX) || (sy < 0 && onY))
                return; // lies in the mirror plane: drawn once
            const ids = element.nodes.map(n => n.id + q * count);
            elements.push(...(sx * sy < 0 ? ids.reverse() : ids));
            regions.push(elementKinds[e] === "wall" ? 1 : 0);
            plasticStrain.push(strains[e]);
        });
    });
    const force = run.anchorForces[spec.anchors[0].id] ?? 0;
    const bolts = quadrants.map(([sx, sy], q) => ({ id: `anchor-${q + 1}`, x: sx * input.px / 2, y: sy * input.py / 2, force, capacity: anchorCapacity }));
    return { nodes, elements, regions, displacement, plasticStrain, mirrorY: null, bolts };
}
function bearingOf(run, input, en) {
    const { built } = run;
    // the first converged step that carries N_c,Rk of the EN model, else the last step
    const reached = run.curve.findIndex(p => p.force >= en.compression.NcRd);
    const stepIndex = reached > 0 ? reached - 1 : run.solution.points.length - 1;
    const point = run.solution.points[stepIndex];
    const columnForce = run.curve[stepIndex + 1].force;
    const { xs, ys } = built;
    const half = (lines, i) => [i > 0 ? (lines[i] - lines[i - 1]) / 2 : 0, i < lines.length - 1 ? (lines[i + 1] - lines[i]) / 2 : 0];
    const cells = [];
    let contactArea = 0, yieldedArea = 0, inside = 0, total = 0, peak = 0;
    const fjd = en.compression.fjd;
    const rects = en.compression.rects;
    for (const item of built.foundation) {
        const force = point.boltForces[item.id] ?? 0;
        const pressure = item.area > 0 ? force / item.area : 0;
        const i = xs.findIndex(v => Math.abs(v - item.x) < KEY_TOLERANCE), j = ys.findIndex(v => Math.abs(v - item.y) < KEY_TOLERANCE);
        const [xl, xr] = half(xs, i), [yl, yr] = half(ys, j);
        // the quarter's node and its mirror images (nodes on a symmetry plane only once)
        // a node in a symmetry plane covers both sides of it
        const onX = item.x <= KEY_TOLERANCE, onY = item.y <= KEY_TOLERANCE;
        for (const sx of onX ? [1] : [1, -1])
            for (const sy of onY ? [1] : [1, -1]) {
                const x0 = onX ? -xr : sx > 0 ? item.x - xl : -item.x - xr, x1 = onX ? xr : sx > 0 ? item.x + xr : -item.x + xl;
                const y0 = onY ? -yr : sy > 0 ? item.y - yl : -item.y - yr, y1 = onY ? yr : sy > 0 ? item.y + yr : -item.y + yl;
                cells.push((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, pressure);
            }
        if (force > 0)
            contactArea += item.area;
        if (force >= fjd * item.area * (1 - 1e-6) && force > 0)
            yieldedArea += item.area;
        total += force;
        if (rects.some(r => item.x >= r[0] - KEY_TOLERANCE && item.x <= r[1] + KEY_TOLERANCE && item.y >= r[2] - KEY_TOLERANCE && item.y <= r[3] + KEY_TOLERANCE))
            inside += force;
        peak = Math.max(peak, pressure);
    }
    return {
        at: reached > 0 ? "N_c,Rk" : "last step", columnForce,
        cells, fjd, hp: input.hp, bp: input.bp, rects, Aeff: en.compression.Aeff,
        contactArea: contactArea * 4, yieldedArea: yieldedArea * 4, shareInsideAeff: total > 0 ? inside / total : 0, peakPressure: peak
    };
}
function stateOf(result, loadCase, supportModulus) {
    const anchorForce = result.anchorForces[result.built.spec.anchors[0].id] ?? 0;
    const location = result.event === "limit load" ? Object.entries(result.strainByKind).reduce((a, b) => (b[1] > a[1] ? b : a))[0] : null;
    const warnings = [...result.warnings];
    if (location === "wall")
        warnings.push("Plasticity at the limit load is concentrated in the column walls: the column stub governs the FE model.");
    if (location === "stiff")
        warnings.push("Plasticity at the limit load is concentrated in the stiff zone under the column walls: check the weld region separately.");
    if (result.peakStrain.atZoneCorner)
        warnings.push("Peak plastic strain is at a corner of the stiff zone and can grow with mesh refinement; strain is shown for information only.");
    if (loadCase === "uplift")
        warnings.push("The anchorage in concrete (EN 1992-4: cone, pull-out, splitting) is not part of the FE model; see the design check.");
    else
        warnings.push("Compression FE is indicative: elastic bed with a pressure cap f_jd and an elastic column stub, compared with the EN effective area (additional width c).");
    return {
        limitLoad: result.limitLoad, strain5: result.strain5,
        fe: { resistance: result.resistance, event: result.event, mode: modeOf(result, loadCase), failureDisplacement: result.failureDisplacement, strainLocation: location, peakStrain: result.peakStrain },
        curve: result.curve.map(p => ({ displacement: p.displacement, reaction: p.force, anchorForce: p.anchorForce, contactForce: p.contactForce })),
        anchorForce,
        contactForce: result.contactForce,
        supportModulus,
        maxPlasticStrain: result.maxPlasticStrain,
        maxPlatePlasticStrain: result.maxPlatePlasticStrain,
        strainByKind: result.strainByKind,
        equilibrium: result.equilibrium,
        warnings,
        dofCount: result.solution.dofCount,
        steps: result.solution.points.length,
        peakMemoryBytes: result.solution.peakMemoryBytes
    };
}
/** FE verification of the column base. Units N, mm, MPa; the input forces of the design check are not used. */
export function analyseBasePlateFe(input, options = {}, run = {}) {
    const started = Date.now();
    const model = buildBasePlateFe(input, options);
    const { options: resolved, en } = model;
    const loadCase = resolved.loadCase;
    const t = en.tension;
    const enResistance = loadCase === "uplift" ? t.NtRd : en.compression.NcRd;
    const enAnchorForce = t.NtRd / 4 * (t.prying ? (t.mx + t.n) / t.n : 1);
    // EN 1993-1-8 Table 6.2, rows with prying: modes 1, 2 and 3 at gamma = 1, both anchor rows.
    const Mpl1 = 0.25 * t.leff1 * input.tp ** 2 * en.plate.fy, Mpl2 = 0.25 * t.leff2 * input.tp ** 2 * en.plate.fy;
    const sumFt = 2 * t.FtRd;
    const withPryingModes = [["mode 1", 2 * 4 * Mpl1 / t.mx], ["mode 2", 2 * (2 * Mpl2 + t.n * sumFt) / (t.mx + t.n)], ["mode 3", 2 * sumFt]];
    const governingPrying = withPryingModes.reduce((a, b) => (b[1] < a[1] ? b : a));
    const withPrying = { FT1: withPryingModes[0][1], FT2: withPryingModes[1][1], FT3: withPryingModes[2][1], resistance: governingPrying[1], mode: governingPrying[0] };
    // Table 6.2, rows without prying: mode 1-2 = 2 M_pl,1 / m_x per row; mode 3 = sum F_t,Rd.
    // The leading factor 2 includes both anchor rows, exactly as in withPryingModes.
    const withoutPryingModes = [["mode 1-2", 2 * 2 * Mpl1 / t.mx], ["mode 3", 2 * sumFt]];
    const governingFree = withoutPryingModes.reduce((a, b) => (b[1] < a[1] ? b : a));
    const withoutPrying = { FT12: withoutPryingModes[0][1], FT3: withoutPryingModes[1][1], resistance: governingFree[1], mode: governingFree[0] };
    const solve = (built, progress) => runPlateModel(built, {
        displacementLimit: resolved.displacementLimit, loadSteps: resolved.loadSteps,
        ...(run.onStep ? { onStep: (point, step, count) => run.onStep(point, step, count, progress) } : {})
    });
    const supported = solve(model.built, { run: 1, runCount: loadCase === "uplift" ? 2 : 1, support: loadCase === "uplift" ? "prying" : "bed" });
    let result = supported;
    let state = stateOf(supported, loadCase, model.supportModulus);
    let comparison = {};
    if (loadCase === "uplift") {
        // Only the foundation changes: identical mesh, anchors, load steps and displacement limit.
        const free = solve(buildPlateModel({ ...model.built.spec, foundation: { kind: "none" } }), { run: 2, runCount: 2, support: "free" });
        const freeState = stateOf(free, loadCase, { k0: 0, k: 0 });
        const pairs = [
            { support: "prying", ...state, en: withPrying, ratio: state.fe.resistance / withPrying.resistance },
            { support: "free", ...freeState, en: withoutPrying, ratio: freeState.fe.resistance / withoutPrying.resistance }
        ];
        const enApplies = t.prying ? "prying" : "free";
        comparison = { pairs, enApplies };
        if (!t.prying) {
            result = free;
            state = freeState;
        }
    }
    return {
        ...state,
        version: BASEPLATE_FE_VERSION, loadCase, options: resolved,
        en: { resistance: enResistance, mode: loadCase === "uplift" ? t.mode : "bearing over A_eff", tension: t, compression: en.compression, anchorForce: enAnchorForce, withPrying, withoutPrying },
        ratio: state.fe.resistance / enResistance,
        ...comparison,
        anchorCapacity: model.anchor.capacity, anchor: model.anchor,
        ...(model.bed ? { bed: model.bed, bearing: bearingOf(result, input, en) } : {}),
        timingMs: Date.now() - started,
        ...(run.includeField ? { field: fieldOf(result, input, model.anchor.capacity) } : {})
    };
}
/**
 * Plastic resistance of the half strip (one side of the symmetric T-stub), plane strain von Mises:
 * m_p = (2/√3) f_y t² / 4 per unit width; one hinge F = m_p B / m, two hinges F = 2 m_p B / m.
 */
export function stripClosedForm(input) {
    const mp = 2 / Math.sqrt(3) * input.fy * input.t ** 2 / 4;
    return (input.support === "free" ? 1 : 2) * mp * input.B / input.m;
}
export function buildStripModel(input) {
    const E = input.E ?? 210000;
    const { s, m, n, B, t } = input;
    const ax = s + m;
    const spec = {
        plate: { x0: 0, x1: ax + n, y0: 0, y1: B }, thickness: t, material: { E, nu: 0.3, fy: input.fy, Et: input.Et ?? E / 1000 },
        zones: [{ x0: 0, x1: s, y0: 0, y1: B, thickness: STIFF_ZONE_FACTOR * t }],
        // the wall stands in the symmetry plane x = 0 (membrane only); strong enough to stay elastic
        walls: [{ plane: "x", at: 0, from: 0, to: B, thickness: t, fy: 10 * input.fy }],
        wallHeight: Math.max(40, 2 * m),
        // anchor line across the whole strip, strong enough not to yield
        anchors: [{ id: "line", x: ax, y: B / 2, x0: ax, x1: ax, y0: 0, y1: B, stiffness: input.anchorStiffness ?? 1e6 * B, capacity: 1e3 * stripClosedForm(input) }],
        foundation: input.support === "prying" ? { kind: "rigid", modulus: RIGID_SUPPORT_MODULUS } : { kind: "none" },
        symmetry: { x0: true, y0: true, y1: true },
        meshSize: input.meshSize, meshRefinement: input.meshRefinement ?? 1, wallMeshFactor: 2, multiplier: 1, direction: 1
    };
    return buildPlateModel(spec);
}
export function runStripBenchmark(input) {
    const built = buildStripModel(input);
    const run = runPlateModel(built, { displacementLimit: input.displacementLimit, loadSteps: input.loadSteps });
    const closedForm = stripClosedForm(input);
    return { run, closedForm, ratio: run.resistance / closedForm, dofCount: built.model.nodes.length * 6 };
}
