import { createSkyline, reverseCuthillMcKee, solveSkyline, skylineAdd } from "./linalg.js";
import { initialShellState, evaluateShell } from "./shell.js";
function makePrepared(model, constrained) {
    const adjacency = Array.from({ length: model.nodes.length }, () => new Set());
    for (const element of model.elements)
        for (const a of element.nodes)
            for (const b of element.nodes)
                if (a.id !== b.id)
                    adjacency[a.id].add(b.id);
    for (const link of model.links ?? []) {
        if (!(Math.abs(Math.hypot(...link.direction) - 1) <= 1e-12))
            throw new Error(`Link spring ${link.id} direction must be a unit vector (within 1e-12)`);
        adjacency[link.nodeA].add(link.nodeB);
        adjacency[link.nodeB].add(link.nodeA);
    }
    const order = reverseCuthillMcKee(adjacency);
    const equation = new Int32Array(model.nodes.length * 6).fill(-1);
    const globalDofs = [];
    for (const node of order)
        for (let d = 0; d < 6; d++) {
            const gd = node * 6 + d;
            if (!constrained.has(gd)) {
                equation[gd] = globalDofs.length;
                globalDofs.push(gd);
            }
        }
    const first = new Int32Array(globalDofs.length);
    for (let i = 0; i < first.length; i++)
        first[i] = i;
    const elementEquations = model.elements.map(element => element.nodes.flatMap(node => Array.from({ length: 6 }, (_, d) => equation[node.id * 6 + d])));
    const linkEquations = (model.links ?? []).map(link => [link.nodeA, link.nodeB].flatMap(node => Array.from({ length: 3 }, (_, d) => equation[node * 6 + d])));
    for (const eqs of [...elementEquations, ...linkEquations])
        for (const a of eqs)
            if (a >= 0)
                for (const b of eqs)
                    if (b >= 0) {
                        const col = Math.min(a, b), row = Math.max(a, b);
                        if (col < first[row])
                            first[row] = col;
                    }
    return { order, equation, globalDofs, profile: createSkyline(first), elementEquations, linkEquations };
}
function normFree(r, eqs) {
    let sum = 0;
    for (const i of eqs)
        sum += r[i] * r[i];
    return Math.sqrt(sum);
}
/** Solve a sequence of full-DOF displacement constraints, with rollback and bisection. */
export function solveDisplacementPath(model, targets, options = {}) {
    const startTime = Date.now();
    const memoryBefore = (globalThis.process?.memoryUsage().rss) ?? 0;
    let peakMemoryBytes = memoryBefore;
    const sampleMemory = () => {
        const rss = (globalThis.process?.memoryUsage().rss) ?? 0;
        peakMemoryBytes = Math.max(peakMemoryBytes, rss);
    };
    const constrained = new Set(model.fixedDofs?.keys() ?? []);
    for (const target of targets)
        for (const dof of target.keys())
            constrained.add(dof);
    const prep = makePrepared(model, constrained);
    const nDof = model.nodes.length * 6;
    const u = new Float64Array(nDof);
    for (const [dof, value] of model.fixedDofs ?? [])
        u[dof] = value;
    const states = model.elements.map(() => initialShellState());
    const freeEquations = prep.globalDofs.map((_, i) => i);
    const resultPoints = [];
    const tolerance = options.tolerance ?? 1e-6;
    const maxIterations = options.maxIterations ?? 35;
    const maxBisections = options.maxBisections ?? 8;
    const assemble = (trialU, baseStates) => {
        sampleMemory();
        const residual = new Float64Array(nDof);
        const stiffness = createSkyline(prep.profile.firstRow);
        const trialStates = [];
        let maxPlastic = 0;
        let maxFlangePlastic = 0;
        let flangeYieldingElements = 0;
        for (let ei = 0; ei < model.elements.length; ei++) {
            const element = model.elements[ei];
            const dofs = element.nodes.flatMap(node => Array.from({ length: 6 }, (_, d) => trialU[node.id * 6 + d]));
            const response = evaluateShell(element, dofs, baseStates[ei]);
            trialStates.push(response.state);
            maxPlastic = Math.max(maxPlastic, response.maxPlasticStrain);
            if (element.region === "flange") {
                maxFlangePlastic = Math.max(maxFlangePlastic, response.maxPlasticStrain);
                if (response.maxPlasticStrain > 1e-8)
                    flangeYieldingElements++;
            }
            const eqs = prep.elementEquations[ei];
            for (let a = 0; a < 24; a++) {
                const ga = element.nodes[Math.floor(a / 6)].id * 6 + a % 6;
                residual[ga] += response.force[a];
                const ea = eqs[a];
                if (ea < 0)
                    continue;
                for (let b = 0; b <= a; b++) {
                    const eb = eqs[b];
                    if (eb >= 0)
                        skylineAdd(stiffness, ea, eb, response.stiffness[a][b]);
                }
            }
        }
        const boltForces = {};
        let prying = 0;
        for (const spring of model.springs) {
            const base = spring.nodeId * 6;
            const extension = spring.direction[0] * trialU[base] + spring.direction[1] * trialU[base + 1] + spring.direction[2] * trialU[base + 2];
            let forceScalar = 0, tangent = 0;
            if (spring.kind === "contact" && extension <= 0) {
                forceScalar = spring.stiffness * extension;
                tangent = spring.stiffness;
                prying -= forceScalar * spring.direction[2] * (spring.reportMultiplier ?? 1);
            }
            else if (spring.kind === "bolt" && extension > 0) {
                const raw = spring.stiffness * extension;
                forceScalar = Math.min(raw, spring.capacity ?? Number.POSITIVE_INFINITY);
                tangent = raw < (spring.capacity ?? Number.POSITIVE_INFINITY) ? spring.stiffness : 0;
                boltForces[spring.id] = forceScalar * (spring.reportMultiplier ?? 1);
            }
            else if (spring.kind === "bolt")
                boltForces[spring.id] = 0;
            for (let i = 0; i < 3; i++) {
                const gi = base + i;
                residual[gi] += forceScalar * spring.direction[i];
                const ei = prep.equation[gi];
                if (ei < 0)
                    continue;
                for (let j = 0; j <= i; j++) {
                    const ej = prep.equation[base + j];
                    if (ej >= 0)
                        skylineAdd(stiffness, ei, ej, tangent * spring.direction[i] * spring.direction[j]);
                }
            }
        }
        for (let li = 0; li < (model.links?.length ?? 0); li++) {
            const link = model.links[li];
            const baseA = link.nodeA * 6, baseB = link.nodeB * 6;
            const extension = link.direction[0] * (trialU[baseB] - trialU[baseA]) + link.direction[1] * (trialU[baseB + 1] - trialU[baseA + 1]) + link.direction[2] * (trialU[baseB + 2] - trialU[baseA + 2]);
            let forceScalar = 0, tangent = 0;
            if (link.kind === "contact" && extension <= 0) {
                forceScalar = link.stiffness * extension;
                tangent = link.stiffness;
                prying -= forceScalar * link.direction[2] * (link.reportMultiplier ?? 1);
            }
            else if (link.kind === "bolt" && extension > 0) {
                const raw = link.stiffness * extension;
                forceScalar = Math.min(raw, link.capacity ?? Number.POSITIVE_INFINITY);
                tangent = raw < (link.capacity ?? Number.POSITIVE_INFINITY) ? link.stiffness : 0;
                boltForces[link.id] = forceScalar * (link.reportMultiplier ?? 1);
            }
            else if (link.kind === "bolt")
                boltForces[link.id] = 0;
            const eqs = prep.linkEquations[li];
            // The signed directions give internal forces [-f d, +f d] and the
            // symmetric translational block [[K, -K], [-K, K]], K = tangent d d^T.
            for (let a = 0; a < 6; a++) {
                const ga = (a < 3 ? baseA : baseB) + a % 3;
                const da = (a < 3 ? -1 : 1) * link.direction[a % 3];
                residual[ga] += forceScalar * da;
                const ea = eqs[a];
                if (ea < 0)
                    continue;
                for (let b = 0; b <= a; b++) {
                    const eb = eqs[b];
                    const db = (b < 3 ? -1 : 1) * link.direction[b % 3];
                    if (eb >= 0)
                        skylineAdd(stiffness, ea, eb, tangent * da * db);
                }
            }
        }
        for (const [dof, load] of model.loads ?? [])
            residual[dof] -= load;
        sampleMemory();
        return { residual, stiffness, trialStates, maxPlastic, maxFlangePlastic, flangeYieldingElements, boltForces, prying };
    };
    const attempt = (baseU, baseStates, target, depth) => {
        const candidate = baseU.slice();
        for (const [dof, value] of model.fixedDofs ?? [])
            candidate[dof] = value;
        for (const [dof, value] of target)
            candidate[dof] = value;
        let failureReason = "iteration limit";
        let pendingAssembly;
        for (let iteration = 1; iteration <= maxIterations; iteration++) {
            let assembled;
            if (pendingAssembly) {
                assembled = pendingAssembly;
                pendingAssembly = undefined;
            }
            else {
                try {
                    assembled = assemble(candidate, baseStates);
                }
                catch (error) {
                    failureReason = `assembly failed: ${error instanceof Error ? error.message : String(error)}`;
                    break;
                }
            }
            const controlDofs = new Set([...(model.fixedDofs?.keys() ?? []), ...target.keys()]);
            let reactionNorm2 = 0;
            let reactionSum = 0;
            for (const gd of controlDofs)
                reactionNorm2 += assembled.residual[gd] ** 2;
            for (const gd of target.keys())
                reactionSum += assembled.residual[gd];
            const reactionNorm = Math.sqrt(reactionNorm2);
            const freeNorm = Math.sqrt(freeEquations.reduce((sum, eq) => sum + assembled.residual[prep.globalDofs[eq]] ** 2, 0));
            if (freeNorm <= tolerance * Math.max(reactionNorm, 1)) {
                const scalar = [...target.values()][0] ?? 0;
                return { displacement: candidate, states: assembled.trialStates, point: { displacement: scalar, reaction: reactionSum, maxPlasticStrain: assembled.maxPlastic, maxFlangePlasticStrain: assembled.maxFlangePlastic, flangeYieldingElements: assembled.flangeYieldingElements, boltForces: assembled.boltForces, pryingForce: assembled.prying, iterations: iteration,
                        ...(options.reportFixedReactions ? { fixedReactions: Object.fromEntries([...(model.fixedDofs?.keys() ?? [])].map(dof => [dof, assembled.residual[dof]])) } : {}),
                    } };
            }
            const rhs = freeEquations.map(eq => -assembled.residual[prep.globalDofs[eq]]);
            let increment;
            try {
                increment = solveSkyline(assembled.stiffness, rhs);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const pivot = /(?:pivot|diagonal) at (\d+)/.exec(message);
                if (pivot) {
                    const equation = Number(pivot[1]), globalDof = prep.globalDofs[equation];
                    const node = model.nodes[Math.floor(globalDof / 6)];
                    failureReason = `${message}; equation=${equation}, globalDof=${globalDof}, node=${node.id}, component=${globalDof % 6}, xyz=${node.xyz.join(",")}`;
                }
                else
                    failureReason = message;
                break;
            }
            let accepted = false;
            for (let lineSearch = 0; lineSearch <= 12; lineSearch++) {
                const alpha = 2 ** -lineSearch;
                const trial = candidate.slice();
                let maxUpdate = 0;
                for (let eq = 0; eq < increment.length; eq++) {
                    const update = alpha * increment[eq];
                    const gd = prep.globalDofs[eq];
                    trial[gd] += update;
                    maxUpdate = Math.max(maxUpdate, Math.abs(update));
                }
                if (maxUpdate > 1e6 || !Number.isFinite(maxUpdate))
                    continue;
                let trialAssembly;
                try {
                    trialAssembly = assemble(trial, baseStates);
                }
                catch {
                    continue;
                }
                const trialNorm = Math.sqrt(freeEquations.reduce((sum, eq) => sum + trialAssembly.residual[prep.globalDofs[eq]] ** 2, 0));
                if (trialNorm < freeNorm * (1 - 1e-4 * alpha) || trialNorm <= tolerance * Math.max(reactionNorm, 1)) {
                    candidate.set(trial);
                    pendingAssembly = trialAssembly;
                    accepted = true;
                    break;
                }
            }
            if (!accepted) {
                failureReason = "Newton line search could not reduce the free residual";
                break;
            }
        }
        if (depth >= maxBisections)
            throw new Error(`Newton solve failed after ${maxIterations} iterations and ${depth} cutbacks (${failureReason})`);
        const middle = new Map();
        for (const [dof, end] of target) {
            const start = baseU[dof];
            middle.set(dof, (start + end) / 2);
        }
        const first = attempt(baseU, baseStates, middle, depth + 1);
        const second = attempt(first.displacement, first.states, target, depth + 1);
        return { ...second, point: { ...second.point, iterations: first.point.iterations + second.point.iterations } };
    };
    let current = u;
    for (const target of targets) {
        // A target map may omit fixed DOFs; fixed supports are always imposed.
        const solved = attempt(current, states, target, 0);
        const bisections = options.eventBisections ?? 0;
        if (bisections > 0 && options.stopWhen?.(solved.point)) {
            // The stop event lies in this step (opt-in; default off): bisect the step from the last
            // converged state without the event (lo) towards the first state with it (hi), so that the
            // event is bracketed within 2^-bisections of the step; returns lo and hi as the last two points.
            let loU = current, loStates = states.slice(), loPoint = null;
            let loTarget = new Map([...target.keys()].map(dof => [dof, current[dof]]));
            let hiTarget = target, hi = solved;
            for (let b = 0; b < bisections; b++) {
                const mid = new Map();
                for (const [dof, end] of hiTarget)
                    mid.set(dof, (loTarget.get(dof) + end) / 2);
                const midSolved = attempt(loU, loStates, mid, 0);
                if (options.stopWhen(midSolved.point)) {
                    hi = midSolved;
                    hiTarget = mid;
                }
                else {
                    loU = midSolved.displacement;
                    loStates = midSolved.states;
                    loPoint = midSolved.point;
                    loTarget = mid;
                }
            }
            if (loPoint) {
                resultPoints.push(loPoint);
                options.onStep?.(loPoint, resultPoints.length, targets.length, loU);
            }
            current = hi.displacement;
            for (let i = 0; i < states.length; i++)
                states[i] = hi.states[i];
            resultPoints.push(hi.point);
            options.onStep?.(hi.point, resultPoints.length, targets.length, current);
            break;
        }
        current = solved.displacement;
        for (let i = 0; i < states.length; i++)
            states[i] = solved.states[i];
        resultPoints.push(solved.point);
        options.onStep?.(solved.point, resultPoints.length, targets.length, current);
        if (options.stopWhen?.(solved.point))
            break;
    }
    sampleMemory();
    return { points: resultPoints, displacement: current, states, dofCount: nDof, solveMilliseconds: Date.now() - startTime, peakMemoryBytes };
}
