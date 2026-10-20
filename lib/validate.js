/** The shared field descriptions used by validation, the schema endpoint and reports. */
export const TSTUB_INPUT_FIELDS = [
    { name: "E", unit: "MPa", required: false, default: 210000, min: 100000, max: 300000, description: "Young's modulus" },
    { name: "nu", unit: "—", required: false, default: 0.3, min: 0, max: 0.49, description: "Poisson's ratio" },
    { name: "fy", unit: "MPa", required: false, default: 355, min: 150, max: 700, description: "Steel yield strength" },
    { name: "Et", unit: "MPa", required: false, default: "E / 1000", min: 0, max: "E / 10", description: "Plastic tangent modulus" },
    { name: "fub", unit: "MPa", required: false, default: 1000, min: 300, max: 1200, description: "Bolt ultimate strength" },
    { name: "As", unit: "mm²", required: false, default: 245, min: 20, max: 2000, description: "Bolt tensile stress area" },
    { name: "L", unit: "mm", required: true, default: null, min: 20, max: 1000, description: "T-stub length" },
    { name: "b", unit: "mm", required: true, default: null, min: 50, max: 1000, description: "Flange width" },
    { name: "tw", unit: "mm", required: true, default: null, min: 3, max: 100, description: "Web thickness" },
    { name: "hw", unit: "mm", required: true, default: null, min: 20, max: 1000, description: "Web height" },
    { name: "tf", unit: "mm", required: true, default: null, min: 3, max: 100, description: "Flange thickness" },
    { name: "m", unit: "mm", required: true, default: null, min: 10, max: 500, description: "Web face to bolt axis; for a rolled section the EN 1993-1-8 value, measured from 0.8 r off the web face (the model has no root fillet)" },
    { name: "nb", unit: "—", required: true, default: null, min: 1, max: 6, description: "Bolts per row" },
    { name: "meshSize", unit: "mm", required: false, default: 5, min: 2.5, max: 20, description: "Target shell mesh size" },
    { name: "displacementLimit", unit: "mm", required: false, default: 4, min: 0.5, max: 20, description: "Maximum prescribed displacement" },
    { name: "loadSteps", unit: "—", required: false, default: 24, min: 1, max: 60, description: "Number of displacement increments" }
];
const REQUIRED_FIELDS = new Set(TSTUB_INPUT_FIELDS.filter(field => field.required).map(field => field.name));
const INTEGER_FIELDS = new Set(["nb", "loadSteps"]);
const OPTIONAL_DEFAULTS = {
    E: 210000, nu: 0.3, fy: 355, fub: 1000, As: 245,
    meshSize: 5, displacementLimit: 4, loadSteps: 24
};
export function estimateTStubDof(input) {
    const divB = 2 * Math.max(1, Math.round(input.b / (2 * input.meshSize))); // as flangeDivisions in tstub.ts
    const modeledLength = input.nb === 1 ? input.L / 2 : input.L;
    const divL = Math.max(1, Math.round(modeledLength / input.meshSize));
    const divH = Math.max(1, Math.round(input.hw / input.meshSize));
    const nodes = (divB + 1) * (divL + 1) + (divL + 1) * divH;
    return 6 * nodes;
}
/**
 * Validates and completes a T-stub input. `checkModelSize` (default true)
 * rejects inputs whose FE model would exceed 12 000 DOF; the analytical
 * EN 1993-1-8 check builds no model and skips it.
 */
export function normaliseTStubInput(raw, options = {}) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, errors: ["Input must be a JSON object"] };
    }
    const source = raw;
    const names = new Set(TSTUB_INPUT_FIELDS.map(field => String(field.name)));
    const errors = [];
    const unknown = Object.keys(source).filter(key => !names.has(key)).sort();
    if (unknown.length)
        errors.push(`Unknown field(s): ${unknown.join(", ")}`);
    for (const name of REQUIRED_FIELDS) {
        if (!(name in source))
            errors.push(`${name} is required`);
    }
    const candidate = {};
    for (const field of TSTUB_INPUT_FIELDS) {
        const name = String(field.name);
        const hasValue = Object.prototype.hasOwnProperty.call(source, name);
        if (!hasValue) {
            if (field.required)
                continue;
            if (name === "Et")
                continue;
            candidate[name] = OPTIONAL_DEFAULTS[name];
            continue;
        }
        const value = source[name];
        if (typeof value !== "number" || !Number.isFinite(value)) {
            errors.push(`${name} must be a finite number`);
            continue;
        }
        candidate[name] = value;
        if (INTEGER_FIELDS.has(name) && !Number.isInteger(value)) {
            errors.push(`${name} must be an integer`);
            continue;
        }
        if (field.min !== null && (name === "Et" ? value <= field.min : value < field.min)) {
            errors.push(`${name} must be ${name === "Et" ? ">" : "at least "}${field.min}${name === "Et" ? "" : ""}`);
        }
        const maximum = name === "Et" ? candidate.E / 10 : typeof field.max === "number" ? field.max : null;
        if (maximum !== null && value > maximum)
            errors.push(`${name} must be at most ${maximum}`);
    }
    if (candidate.E !== undefined && !Object.prototype.hasOwnProperty.call(source, "Et"))
        candidate.Et = candidate.E / 1000;
    if (candidate.b !== undefined && candidate.tw !== undefined && candidate.m !== undefined) {
        const e = candidate.b / 2 - candidate.tw / 2 - candidate.m;
        if (!(e > 0))
            errors.push(`Geometry invalid: e = b/2 − tw/2 − m must be > 0 (got ${e} mm)`);
    }
    const neededForDof = ["L", "b", "hw", "nb", "meshSize"];
    if ((options.checkModelSize ?? true) && neededForDof.every(name => candidate[name] !== undefined && Number.isFinite(candidate[name]))) {
        const dof = estimateTStubDof(candidate);
        if (dof > 12000)
            errors.push(`Estimated model size is ${dof} DOF; maximum is 12000`);
    }
    if (errors.length)
        return { ok: false, errors };
    return {
        ok: true,
        input: {
            E: candidate.E, nu: candidate.nu, fy: candidate.fy, Et: candidate.Et,
            fub: candidate.fub, As: candidate.As, L: candidate.L, b: candidate.b,
            tw: candidate.tw, hw: candidate.hw, tf: candidate.tf, m: candidate.m,
            nb: candidate.nb, meshSize: candidate.meshSize,
            displacementLimit: candidate.displacementLimit, loadSteps: candidate.loadSteps
        }
    };
}
