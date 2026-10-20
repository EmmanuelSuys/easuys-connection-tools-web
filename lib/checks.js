/**
 * Shared building blocks of the connection check pages (column base,
 * steel-to-timber, timber bearing): input field descriptions with one
 * validator, check rows with utilisations and clause references, and the
 * summary of a set of checks. Units: N, mm, MPa unless a field says kN.
 */
export const CONNECTIONS_VERSION = "connections-0.1.0";
/** Whether a field applies, given the select values of the other fields. */
export function fieldApplies(field, values) {
    if (!field.showIf)
        return true;
    return Object.entries(field.showIf).every(([name, allowed]) => allowed.includes(String(values[name])));
}
/** Example input: the default of every field that applies. */
export function exampleValues(fields) {
    const values = {};
    for (const field of fields)
        if (field.default !== undefined)
            values[field.name] = field.default;
    for (const field of fields)
        if (!fieldApplies(field, values))
            delete values[field.name];
    return values;
}
/**
 * Validates raw input against the field descriptions: unknown names, required
 * numbers, ranges, integers and select options. Fields that do not apply
 * (showIf) are ignored. Error messages start with the field name.
 */
export function normaliseFields(raw, fields) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
        return { ok: false, errors: ["Input must be a JSON object"] };
    const source = raw;
    const errors = [];
    const known = new Set(fields.map(field => field.name));
    const unknown = Object.keys(source).filter(key => !known.has(key)).sort();
    if (unknown.length)
        errors.push(`Unknown field(s): ${unknown.join(", ")}`);
    const values = {};
    // selects and checkboxes first: they decide which other fields apply
    for (const field of fields) {
        if (field.kind !== "select" && field.kind !== "checkbox")
            continue;
        const value = Object.prototype.hasOwnProperty.call(source, field.name) ? source[field.name] : field.default;
        if (field.kind === "checkbox") {
            if (typeof value !== "boolean")
                errors.push(`${field.name} must be true or false`);
            else
                values[field.name] = value;
        }
        else if (typeof value !== "string" || !(field.options ?? []).includes(value)) {
            errors.push(`${field.name} must be one of ${(field.options ?? []).join(", ")}`);
        }
        else
            values[field.name] = value;
    }
    for (const field of fields) {
        if (field.kind === "select" || field.kind === "checkbox")
            continue;
        if (!fieldApplies(field, values))
            continue;
        const present = Object.prototype.hasOwnProperty.call(source, field.name) && source[field.name] !== undefined && source[field.name] !== null && source[field.name] !== "";
        if (!present) {
            if (field.fallback && typeof field.default === "number")
                values[field.name] = field.default;
            else if (!field.optional)
                errors.push(`${field.name} is required`);
            continue;
        }
        const value = source[field.name];
        if (typeof value !== "number" || !Number.isFinite(value)) {
            errors.push(`${field.name} must be a finite number`);
            continue;
        }
        if (field.kind === "integer" && !Number.isInteger(value)) {
            errors.push(`${field.name} must be an integer`);
            continue;
        }
        if (field.min !== undefined && value < field.min) {
            errors.push(`${field.name} must be at least ${field.min}`);
            continue;
        }
        if (field.max !== undefined && value > field.max) {
            errors.push(`${field.name} must be at most ${field.max}`);
            continue;
        }
        values[field.name] = value;
    }
    return errors.length ? { ok: false, errors } : { ok: true, values };
}
export class CheckList {
    group;
    rows = [];
    constructor(group = "") {
        this.group = group;
    }
    setGroup(group) { this.group = group; return this; }
    resistance(id, label, demand, capacity, unit, reference, note) {
        const utilisation = demand <= 0 ? 0 : capacity > 0 ? demand / capacity : Infinity;
        return this.push({ id, group: this.group, label, kind: "resistance", demand, capacity, unit, utilisation,
            status: utilisation <= 1 + 1e-9 ? "ok" : "fail", reference, ...(note ? { note } : {}) });
    }
    minimum(id, label, provided, required, unit, reference, failStatus = "fail", note) {
        const utilisation = provided > 0 ? required / provided : Infinity;
        return this.push({ id, group: this.group, label, kind: "minimum", demand: provided, capacity: required, unit, utilisation,
            status: provided >= required - 1e-9 ? "ok" : failStatus, reference, ...(note ? { note } : {}) });
    }
    maximum(id, label, provided, allowed, unit, reference, failStatus = "fail", note) {
        const utilisation = allowed > 0 ? provided / allowed : provided > 0 ? Infinity : 0;
        return this.push({ id, group: this.group, label, kind: "maximum", demand: provided, capacity: allowed, unit, utilisation,
            status: provided <= allowed + 1e-9 ? "ok" : failStatus, reference, ...(note ? { note } : {}) });
    }
    info(id, label, status, reference, note) {
        return this.push({ id, group: this.group, label, kind: "info", demand: 0, capacity: 0, unit: "—", utilisation: 0, status, reference, ...(note ? { note } : {}) });
    }
    push(row) { this.rows.push(row); return row; }
}
/** Governing check (highest utilisation of the resistance checks) and overall status. */
export function summariseChecks(checks) {
    const resistances = checks.filter(row => row.kind === "resistance");
    const governing = resistances.reduce((best, row) => (best === null || row.utilisation > best.utilisation ? row : best), null);
    const status = checks.some(row => row.status === "fail") ? "fail" : checks.some(row => row.status === "warning") ? "warning" : "ok";
    return { maxUtilisation: governing ? governing.utilisation : 0, governing, status };
}
