/**
 * Material and product data used by the connection checks. Units: mm, MPa,
 * kg/m³.
 */
/** EN 1992-1-1 Table 3.1: characteristic cylinder strength f_ck. */
export const CONCRETE_CLASSES = {
    "C20/25": 20, "C25/30": 25, "C30/37": 30, "C35/45": 35, "C40/50": 40, "C45/55": 45, "C50/60": 50
};
/** EN 1993-1-8 Table 4.1: correlation factor β_w of fillet welds. */
export const WELD_BETA = { S235: 0.8, S275: 0.85, S355: 0.9 };
/** Washer thickness (ISO 7089) and nut height (ISO 4032), mm: elongation length of anchor bolts. */
export const NUT_WASHER = {
    M12: { washer: 2.5, nut: 10.8 },
    M16: { washer: 3, nut: 14.8 },
    M20: { washer: 3, nut: 18 },
    M24: { washer: 4, nut: 21.5 },
    M27: { washer: 4, nut: 23.8 },
    M30: { washer: 4, nut: 25.6 },
    M36: { washer: 5, nut: 31 }
};
/** Tensile stress area A_s of metric bolts (EN ISO 898-1), by nominal diameter in mm. */
export const BOLT_STRESS_AREA = { 8: 36.6, 10: 58, 12: 84.3, 16: 157, 20: 245, 24: 353, 27: 459, 30: 561 };
/**
 * Softwood strength classes: solid timber EN 338:2016, glued laminated
 * timber EN 14080:2013 (homogeneous h / combined c). ρ_k characteristic
 * density, f_c,90,k compression perpendicular to the grain.
 */
export const TIMBER_CLASSES = {
    C16: { kind: "solid", rhoK: 310, fc90k: 2.2 },
    C18: { kind: "solid", rhoK: 320, fc90k: 2.2 },
    C24: { kind: "solid", rhoK: 350, fc90k: 2.5 },
    C30: { kind: "solid", rhoK: 380, fc90k: 2.7 },
    GL24h: { kind: "glulam", rhoK: 385, fc90k: 2.5 },
    GL28h: { kind: "glulam", rhoK: 425, fc90k: 2.5 },
    GL32h: { kind: "glulam", rhoK: 440, fc90k: 2.5 },
    GL24c: { kind: "glulam", rhoK: 365, fc90k: 2.5 },
    GL28c: { kind: "glulam", rhoK: 390, fc90k: 2.5 }
};
export const LOAD_DURATIONS = ["permanent", "long-term", "medium-term", "short-term", "instantaneous"];
/** EN 1995-1-1 Table 3.1: k_mod of solid timber and glued laminated timber. */
export const KMOD = {
    "1": { permanent: 0.6, "long-term": 0.7, "medium-term": 0.8, "short-term": 0.9, instantaneous: 1.1 },
    "2": { permanent: 0.6, "long-term": 0.7, "medium-term": 0.8, "short-term": 0.9, instantaneous: 1.1 },
    "3": { permanent: 0.5, "long-term": 0.55, "medium-term": 0.65, "short-term": 0.7, instantaneous: 0.9 }
};
export function kmodOf(serviceClass, duration) {
    const row = KMOD[serviceClass];
    if (!row || row[duration] === undefined)
        throw new Error(`Unknown service class ${serviceClass} or load duration ${duration}`);
    return row[duration];
}
