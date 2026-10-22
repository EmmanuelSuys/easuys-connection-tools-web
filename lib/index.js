import { runTStub } from "./tstub.js";
export * from "./linalg.js";
export * from "./material.js";
export * from "./mesh.js";
export * from "./shell.js";
export * from "./solver.js";
export * from "./limit-load.js";
export * from "./tstub.js";
export * from "./validate.js";
export * from "./report.js";
export * from "./design.js";
export * from "./checks.js";
export * from "./eurocode-data.js";
export * from "./baseplate.js";
export * from "./steel-timber.js";
export * from "./timber-bearing.js";
export * from "./axial-screw.js";
export * from "./toothed-plate.js";
export * from "./contact-joint.js";
export * from "./contact-joint-fe.js";
export * from "./eta-brackets.js";
export * from "./eta-brackets-data.js";
export * from "./masonry-fixings.js";
/** Analyse an equal-leg bolted T-stub. Units are N, mm and MPa. */
function extractField(run) {
    const { model, bolts, input } = run.built;
    const u = run.solution.displacement;
    return {
        nodes: model.nodes.flatMap(node => node.xyz),
        elements: model.elements.flatMap(element => element.nodes.map(node => node.id)),
        regions: model.elements.map(element => element.region === "web" ? 1 : 0),
        displacement: model.nodes.flatMap(node => [u[node.id * 6], u[node.id * 6 + 1], u[node.id * 6 + 2]]),
        plasticStrain: run.solution.states.map(state => state.points.reduce((max, point) => Math.max(max, point.equivalentPlasticStrain), 0)),
        mirrorY: input.nb === 1 ? input.L / 2 : null,
        bolts: bolts.map(bolt => ({ id: bolt.id, x: bolt.x, y: bolt.y, force: run.boltForces[bolt.id] ?? 0, capacity: bolt.capacity }))
    };
}
export function analyseTStub(input, options = {}) {
    const started = Date.now();
    const result = runTStub(input, options);
    const field = options.includeField ? extractField(result) : undefined;
    return {
        curve: [{ displacement: 0, reaction: 0 }, ...result.curve],
        fe: { resistance: result.resistance, mode: result.mode, failureDisplacement: result.failureDisplacement, event: result.event },
        limitLoad: result.limitLoad, strain5: result.strain5, warnings: result.warnings,
        en: result.built.en,
        boltForces: result.boltForces,
        pryingForce: result.pryingForce,
        maxPlasticStrain: result.maxPlasticStrain,
        dofCount: result.solution.dofCount,
        timingMs: Date.now() - started,
        peakMemoryBytes: result.solution.peakMemoryBytes,
        ...(field ? { field } : {})
    };
}
export * from "./dowel-fe.js";
export * from "./timber-timber.js";
export * from "./steel-basic.js";
export * from "./membrane.js";
export * from "./bolt-fe.js";
export * from "./baseplate-fe.js";
// End-plate connections (lane C3, 2026-10-20): EN 1993-1-8 routes ported from the structural API
// and page inputs/checks; FE check of the end-plate tension zone in src/endplate-fe.ts.
export { EndPlateInputError, alphaFigure611, alphaCurveLambda1, analyseEndPlateJoint, tStubResistance as endPlateTStubResistance } from "./ec3_endplate.js";
export * from "./endplate-routes.js";
export * from "./endplate-pages.js";
export * from "./endplate-fe.js";
export * from "./endplate-fe-view.js";
