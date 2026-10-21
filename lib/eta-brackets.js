/**
 * Proprietary timber connectors checked against their European Technical Assessment, as cited data (no product
 * formula invented here). Port of WoodSection/eta_connectors.py (EA_Suys0 scripts): same values (the data file is
 * copied verbatim in eta-brackets-data.ts), same refusals.
 *
 * Rule: a proprietary bracket is never specified with arbitrary screws or anchors. The hole pattern and the
 * configuration are matched against the ETA first; only an ETA configuration gets an ETA capacity
 * (etaConfiguration refuses anything else).
 *
 * - Simpson Strong-Tie ABR105: ETA-06/0106 (2026-03-09) Annex D3, Tables D3-1 (2 brackets, beam to beam),
 *   D3-2 to D3-6 (1 bracket, beam to beam, per load duration), D3-8 (2 brackets on a rigid support) and D3-9
 *   (1 bracket on a rigid support; R5 is a required input).
 * - Simpson Strong-Tie ABR90: ETA-06/0106 Annex D1, Table D1-1 (2 brackets, beam to beam).
 * - Simpson Strong-Tie SBE80/150 joist hanger: dimensions checked against ETA-06/0270 (2018-02-13) Annex D39; the
 *   characteristic values come from the manufacturer's data sheet (flagged in every result).
 *
 * Design values (ETA-06/0106 Annex C1): R_d = (R_k x k_mod)/gamma_M for tables in "R_k x k_mod", R_d = R_k k_mod /
 * gamma_M for characteristic tables; gamma_M of connections 1.3 (EN 1995-1-1 Table 2.3), never lowered; service
 * classes 1 and 2 only; rho_k < 350 kg/m3: k_dens = rho_k/350 (Annex C4-2). Combined forces: the third inequality
 * of Annex C1, sqrt((F1/R1 + F4or5/R4or5)^2 + (F2or3/R2or3)^2) <= 1. Units kN, mm.
 */
import { ETA_DATA } from "./eta-brackets-data.js";
export const ETA_GAMMA_M = 1.3;
export const KMOD_SC12 = { P: 0.6, L: 0.7, M: 0.8, S: 0.9, I: 1.1 };
export const RHO_K_TABLES = 350;
const OWNER_RULE = "never specify a proprietary bracket with arbitrary screws/anchors: check its ETA hole pattern and configuration first";
function pos(name, v) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0)
        throw new Error(`${name} must be a positive finite number, got ${v}`);
    return v;
}
function nonneg(name, v) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
        throw new Error(`${name} must be a finite number >= 0, got ${v}`);
    return v;
}
/** Python's "%g" for the table numbers used in citations. */
function g6(v) { return String(Number(v.toPrecision(6))); }
export function etaProduct(name) {
    const products = ETA_DATA.products;
    if (!(name in products))
        throw new Error(`product '${name}' is not encoded; encoded: ${Object.keys(products).sort().join(", ")}`);
    return products[name];
}
export function sourceRef(key) {
    const s = ETA_DATA.sources[key];
    if (key.startsWith("ETA-"))
        return `${key} of ${s.issued}`;
    return `${s.title} (${s.kind})`;
}
function cite(product, table, row, column, nail, duration) {
    const p = etaProduct(product);
    const t = p.tables[table];
    const parts = [`${sourceRef(p.source)} Annex ${p.annex} Table ${table} (p. ${t.page})`, `nailing pattern ${row}`, column];
    if (nail)
        parts.push(`CNA ${nail.replace(".", ",")}`);
    if (duration)
        parts.push(`load duration ${duration}`);
    return parts.join(", ");
}
function gamma(g) {
    if (!Number.isFinite(g) || g < ETA_GAMMA_M - 1e-12)
        throw new Error(`gamma_M ${g} below ${ETA_GAMMA_M} (EN 1995-1-1 Table 2.3, connections); the partial factor is never lowered`);
    return g;
}
/** k_mod of EN 1995-1-1 Table 3.1 (solid timber, glulam, LVL) in service class 1 or 2. */
export function kmodForDuration(duration, serviceClass = 1) {
    if (serviceClass !== 1 && serviceClass !== 2)
        throw new Error("ETA-06/0106 tables are encoded for service classes 1 and 2 only (Annex C1)");
    if (!(duration in KMOD_SC12))
        throw new Error(`load duration must be one of ${Object.keys(KMOD_SC12).join(", ")}`);
    return KMOD_SC12[duration];
}
function kDens(rhoK) { return Math.min(1, pos("rho_k", rhoK) / RHO_K_TABLES); }
export function nailKey(nail) {
    const key = nail.replace(",", ".").replace("CNA", "").replace(/ /g, "").toLowerCase();
    if (!key.startsWith("4.0x"))
        throw new Error(`nail '${nail}': the encoded tables use CNA 4,0 mm connector nails (ETA-04/0013)`);
    return key;
}
function sameCounts(a, b) {
    if (!a)
        return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => b[k] === a[k]);
}
/**
 * Match a planned bracket fixing to an ETA nailing pattern and table, or refuse it. support: 'timber' (beam to
 * beam), 'rigid' (beam to concrete/masonry/steel through the d11 hole) or 'column'. Flanges: counts by fastener
 * kind, e.g. {nails: 10} and {bolts: 1}. Any other fastener kind or count that is not an ETA pattern throws.
 */
export function etaConfiguration(product, support, brackets, flangeA, flangeB) {
    const p = etaProduct(product);
    if (!p.patterns)
        throw new Error(`${product} has no bracket nailing patterns`);
    const holes = p.geometry.holes;
    for (const [side, fl] of [["A", flangeA], ["B", flangeB]]) {
        for (const [kind, n] of Object.entries(fl)) {
            if (!["nails", "bolts", "ssh"].includes(kind))
                throw new Error(`${product} flange ${side}: fastener kind '${kind}' is not in any ETA pattern (${OWNER_RULE})`);
            if (!Number.isInteger(n) || n < 0)
                throw new Error("fastener counts are non-negative integers");
        }
        if ((fl.nails ?? 0) > holes[side].d5)
            throw new Error(`${product} flange ${side} has ${holes[side].d5} holes d5, not ${fl.nails}`);
        if ((fl.bolts ?? 0) > holes[side].d11)
            throw new Error(`${product} flange ${side} has ${holes[side].d11} holes d11, not ${fl.bolts}`);
    }
    const wantA = Object.fromEntries(Object.entries(flangeA).filter(([, v]) => v));
    const wantB = Object.fromEntries(Object.entries(flangeB).filter(([, v]) => v));
    const patterns = p.patterns;
    let match = null;
    for (const [pid, pat] of Object.entries(patterns)) {
        if (pid === "page" || pat.use !== support)
            continue;
        if (sameCounts(pat.A, wantA) && sameCounts(pat.B, wantB)) {
            match = pid;
            break;
        }
    }
    const fmt = (o) => `{${Object.entries(o).map(([k, v]) => `'${k}': ${v}`).join(", ")}}`;
    if (match === null) {
        const allowed = Object.entries(patterns).filter(([k, v]) => k !== "page" && v.use === support).map(([k, v]) => `${k}: A ${v.A ? fmt(v.A) : "None"} / B ${v.B ? fmt(v.B) : "None"}`);
        throw new Error(`${product} ${support}: A ${fmt(wantA)} / B ${fmt(wantB)} is not an ETA nailing pattern (${sourceRef(p.source)} Annex ${p.annex} p. ${patterns.page}); allowed: ${allowed.join("; ")}. Rule: ${OWNER_RULE}`);
    }
    const tables = Object.entries(p.tables).filter(([, t]) => t.use === support && t.brackets === brackets && match in t.rows).map(([tid]) => tid);
    if (!tables.length)
        throw new Error(`${product} nailing pattern ${match} with ${brackets} bracket(s) per connection: no encoded ETA table (only the tables in the data file are encoded)`);
    return { product, pattern: match, tables, brackets, support, description: patterns[match].description, source: `${sourceRef(p.source)} Annex ${p.annex} p. ${patterns.page}` };
}
// ------------------------------------------------------------------ piecewise table formulas
function pieceValue(piece, x, b) {
    const form = piece.form;
    if (form === "const")
        return piece.c;
    if (form === "k/(x+s)") {
        const den = x + piece.s;
        return den > 0 ? piece.k / den : NaN;
    }
    if (form === "k/(s-x)") {
        const den = piece.s - x;
        return den > 0 ? piece.k / den : NaN;
    }
    if (form === "(a*b+c)/(x+s)") {
        if (b === undefined)
            throw new Error("this ETA formula needs the width b of the supported member");
        const den = x + piece.s;
        return den > 0 ? (piece.a * b + piece.c) / den : NaN;
    }
    throw new Error(`unknown table form '${form}'`);
}
/** First piece with lo < x <= hi; 'from' opens a gap the ETA leaves empty; 'to_b' = [fa, fb] -> fa b + fb. */
function piecewise(pieces, x, b, what) {
    let prev = -Infinity;
    for (const piece of pieces) {
        const lo = piece.from !== undefined ? piece.from : prev;
        let hi;
        if (piece.to_b !== undefined) {
            if (b === undefined)
                throw new Error(`${what}: the range limit needs the width b`);
            hi = piece.to_b[0] * b + piece.to_b[1];
        }
        else
            hi = piece.to !== undefined ? piece.to : Infinity;
        if (hi <= lo)
            continue;
        if (x <= lo)
            throw new Error(`${what}: ${g6(x)} mm lies in a range the ETA table leaves empty (${g6(prev)} < x <= ${g6(lo)})`);
        if (x <= hi) {
            const v = pieceValue(piece, x, b);
            if (!Number.isFinite(v) || v <= 0)
                throw new Error(`${what}: ${g6(x)} mm is outside the valid range of the ETA formula`);
            return v;
        }
        prev = hi;
    }
    throw new Error(`${what}: ${g6(x)} mm is beyond the last range of the ETA table`);
}
/** R4/5 when the direction of F4/5 is not known: the lower of R4 and R5. */
export function r45Of(res) {
    const values = [res.R4, res.R5].filter((v) => v !== null);
    return values.length ? Math.min(...values) : null;
}
/**
 * Timber beam to timber beam: ABR105 Tables D3-1 (2 brackets) and D3-2..D3-6 (1 bracket), ABR90 Table D1-1.
 * b width of the supported member, e height of F4/5 above the base (default h/2), f distance of F1 from flange A
 * for one bracket (default b/2). wane: the grey wane values (R1 of D3-1/D1-1) or the added grey R4 formula
 * (1 bracket, e < 37.5 mm); by default the bracket faces are free of wane.
 */
export function bracketBeamToBeam(product, brackets, duration, bMm, hMm, options = {}) {
    const { pattern = "1", nail = "4.0x40", gammaM = ETA_GAMMA_M, wane = false, rhoK = RHO_K_TABLES, serviceClass = 1 } = options;
    const kmod = kmodForDuration(duration, serviceClass);
    const g = gamma(gammaM);
    const b = pos("b_mm", bMm);
    const nk = nailKey(nail);
    const p = etaProduct(product);
    let eIn = options.e;
    if (eIn === undefined) {
        if (hMm === undefined)
            throw new Error("give h_mm (e = h/2) or e_mm");
        eIn = pos("h_mm", hMm) / 2;
    }
    const e = pos("e_mm", eIn);
    const kd = kDens(rhoK);
    const flags = [];
    if (kd < 1)
        flags.push(`rho_k ${g6(rhoK)} < 350: k_dens = ${kd.toFixed(3)} (ETA-06/0106 Annex C4-2)`);
    let cites = {};
    let tid, r1, r23, r4, r5;
    let f = null;
    if (brackets === 2) {
        const found = Object.entries(p.tables).find(([, v]) => v.use === "timber" && v.brackets === 2);
        if (!found || !(pattern in found[1].rows))
            throw new Error(`${product}: no encoded 2-bracket beam-to-beam table for nailing pattern ${pattern}`);
        tid = found[0];
        const row = found[1].rows[pattern];
        if (!(nk in row.R1))
            throw new Error(`${product} Table ${tid}: nail ${nail} not tabulated (use 4.0x40 or 4.0x60)`);
        r1 = row[wane ? "R1_wane" : "R1"][nk][duration];
        r23 = row.R23[nk][duration];
        const [a, c, cap] = row.R45[nk][duration];
        if (e <= 10.7)
            throw new Error("Table R4/5 formula needs e > 10.7 mm");
        r4 = r5 = Math.min(cap, (a * b + c) / (e - 10.7));
        const col1 = wane ? "R1,k x kmod (grey: wane)" : "R1,k x kmod";
        cites = { R1: cite(product, tid, pattern, col1, nk, duration), R23: cite(product, tid, pattern, "R2/3,k x kmod", nk, duration),
            R45: cite(product, tid, pattern, `R4/5,k x kmod = (${g6(a)} b + ${g6(c)})/(e - 10,7) <= ${g6(cap)}`, nk, duration) };
    }
    else if (brackets === 1) {
        if (product !== "ABR105")
            throw new Error(`${product}: 1-bracket tables are not encoded`);
        const found = Object.entries(p.tables).find(([, v]) => v.use === "timber" && v.brackets === 1 && v.duration === duration);
        if (!found || !(pattern in found[1].rows))
            throw new Error(`${product}: no encoded 1-bracket table for duration ${duration}, pattern ${pattern}`);
        tid = found[0];
        const row = found[1].rows[pattern];
        if (!(nk in row.R1))
            throw new Error(`${product} Table ${tid}: nail ${nail} not tabulated (use 4.0x40 or 4.0x60)`);
        f = options.f === undefined ? b / 2 : pos("f_mm", options.f);
        r1 = piecewise(row.R1[nk], f, b, `${tid} R1 (f)`);
        r23 = row.R23[nk];
        r4 = piecewise(row.R4[nk], e, b, `${tid} R4 (e)`);
        if (wane && e < row.R4_wane[nk].below) {
            const w = row.R4_wane[nk];
            r4 = Math.min(r4, w.k / (w.below - e));
            flags.push(`wane: grey R4 formula ${g6(w.k)}/(37,5 - e) checked additionally (${tid})`);
        }
        r5 = piecewise(row.R5[nk], e, b, `${tid} R5 (e)`);
        cites = { R1: cite(product, tid, pattern, "R1,k x kmod (f)", nk, duration), R23: cite(product, tid, pattern, "R2/3,k x kmod", nk, duration),
            R4: cite(product, tid, pattern, "R4,k x kmod (e)", nk, duration), R5: cite(product, tid, pattern, "R5,k x kmod (e, b)", nk, duration) };
    }
    else {
        throw new Error("beam to beam: 1 or 2 brackets per connection (ETA-06/0106 Annex C2: 2 brackets opposite each other)");
    }
    return { product, table: tid, brackets, pattern, nail: nk, duration, kmod, gammaM: g, R1: kd * r1 / g, R23: kd * r23 / g, R4: kd * r4 / g, R5: kd * r5 / g,
        citations: cites, kDens: kd, b, e, f, flags, extra: {} };
}
/**
 * ABR105 timber beam to rigid support: Table D3-8 (2 brackets) or D3-9 (1 bracket), characteristic values. One
 * bolt (anchor) per bracket in the d11 hole of flange B. R4/5 (2 brackets): max{R4 + R5 (D3-9); min{4.6/k_mod;
 * R1/2 b/e}}; without the D3-9 R5 value (a required input) only the second term, a lower bound. 1 bracket: R2/3
 * is half the 2-bracket value when the timber is prevented from rotation, otherwise 0.
 */
export function abr105RigidSupport(brackets, duration, options = {}) {
    const { pattern = "3", nail = "4.0x40", preventedFromRotation = false, gammaM = ETA_GAMMA_M, rhoK = RHO_K_TABLES, serviceClass = 1 } = options;
    const kmod = kmodForDuration(duration, serviceClass);
    const g = gamma(gammaM);
    const nk = nailKey(nail);
    const p = etaProduct("ABR105");
    const kd = kDens(rhoK);
    const flags = [];
    if (kd < 1)
        flags.push(`rho_k ${g6(rhoK)} < 350: k_dens = ${kd.toFixed(3)} (ETA-06/0106 Annex C4-2)`);
    const t8 = p.tables["D3-8"];
    if (!(pattern in t8.rows))
        throw new Error("rigid support: nailing pattern 3 or 4 (ETA-06/0106 Annex D3 p. 48)");
    const row8 = t8.rows[pattern];
    if (!(nk in row8.R1))
        throw new Error(`Table D3-8: nail ${nail} not tabulated (4.0x35, 4.0x40, 4.0x50, 4.0x60)`);
    let r1k2 = row8.R1[nk];
    if (row8.R1_kmod_cap !== undefined && row8.R1_kmod_cap / kmod < r1k2) {
        r1k2 = row8.R1_kmod_cap / kmod;
        flags.push("R1,k limited to 7,7/k_mod (Table D3-8, pattern 3)");
    }
    const r23k2 = row8.R23[nk];
    const extra = { bolts: brackets };
    const cites = {};
    let tid, r1k, r23k, r4d = null, r5d = null;
    let bOut = null, eOut = null, fOut = null;
    const r5Given = options.R5kOneBracket !== undefined;
    const requireR5Source = () => { if (!options.R5Source || !options.R5Source.trim())
        throw new Error("R5_k_one_bracket_kN needs R5_source (the ETA-06/0106 Table D3-9 row used)"); };
    if (brackets === 2) {
        r1k = r1k2;
        r23k = r23k2;
        cites.R1 = cite("ABR105", "D3-8", pattern, "R1,k (min of the nail value and 7,7/k_mod)", nk);
        cites.R23 = cite("ABR105", "D3-8", pattern, "R2/3,k", nk);
        let r45k = null;
        if (options.b !== undefined && options.e !== undefined) {
            const b = pos("b_mm", options.b), e = pos("e_mm", options.e);
            const lower = Math.min(t8.R45_min_term.k_over_kmod / kmod, r1k / 2 * b / e);
            r45k = lower;
            cites.R45 = cite("ABR105", "D3-8", pattern, "R4/5,k = max{R4+R5 (D3-9); min{4,6/k_mod; R1,k/2 b/e}}");
            if (r5Given) {
                requireR5Source();
                const t9 = p.tables["D3-9"].rows[pattern];
                const r4k1 = pieceValue(t9.R4_kmod, e, undefined) / kmod;
                r45k = Math.max(r4k1 + pos("R5_k_one_bracket_kN", options.R5kOneBracket), lower);
                cites.R5_input = options.R5Source;
            }
            else
                flags.push("R4/5 = min{4,6/k_mod; R1/2 b/e} only (lower bound): R5,k of Table D3-9 not given");
        }
        extra.bolt_factors = t8.bolt_factors;
        r4d = r5d = r45k === null ? null : kd * r45k * kmod / g;
        eOut = options.e ?? null;
        bOut = options.b ?? null;
        tid = "D3-8";
    }
    else if (brackets === 1) {
        const t9 = p.tables["D3-9"].rows[pattern];
        if (options.f === undefined)
            throw new Error("1 bracket on a rigid support: give f_mm (distance of F1 from flange A)");
        const f = pos("f_mm", options.f);
        r1k = pieceValue(t9.R1_kmod, f, undefined) / kmod;
        r23k = preventedFromRotation ? 0.5 * r23k2 : 0;
        cites.R1 = cite("ABR105", "D3-9", pattern, "R1,k = 45,8/((f+81) k_mod)");
        cites.R23 = preventedFromRotation ? cite("ABR105", "D3-9", pattern, "R2/3,k = half of Table D3-8 (timber prevented from rotation)")
            : cite("ABR105", "D3-9", pattern, "R2/3,k = 0 (timber free to rotate)");
        if (options.e !== undefined) {
            const e = pos("e_mm", options.e);
            if (e < 10)
                throw new Error("Table D3-9: e >= 10 mm");
            r4d = kd * pieceValue(t9.R4_kmod, e, undefined) / g;
            cites.R4 = cite("ABR105", "D3-9", pattern, "R4,k = 45,28/(e k_mod)");
            eOut = e;
            if (r5Given) {
                requireR5Source();
                r5d = kd * pos("R5_k_one_bracket_kN", options.R5kOneBracket) * kmod / g;
                cites.R5_input = options.R5Source;
            }
            else
                flags.push("R5,k of Table D3-9 not given (required input): F5 cannot be checked");
        }
        extra.bolt_factors = p.tables["D3-9"].bolt_factors;
        bOut = options.b ?? null;
        fOut = f;
        tid = "D3-9";
    }
    else {
        throw new Error("rigid support: 1 bracket (Table D3-9) or 2 brackets opposite each other (Table D3-8); two pairs above each other is not an ETA-06/0106 configuration");
    }
    return { product: "ABR105", table: tid, brackets, pattern, nail: nk, duration, kmod, gammaM: g, R1: kd * r1k * kmod / g, R23: kd * r23k * kmod / g, R4: r4d, R5: r5d,
        citations: cites, kDens: kd, b: bOut, e: eOut, f: fOut, flags, extra };
}
/**
 * Forces per bolt for 2 ABR105 on a rigid support (Table D3-8 "Connection with bolt"): bolt 1 (on the F4/5 side)
 * axial 0.50 F1 + (e/b) F4/5, lateral 0.5 F2/3; bolt 2 axial 0.50 F1 + 0.13 F4/5, lateral 0.5 F2/3 + 1.00 F4/5.
 * The anchor then needs its own ETA check in the base material.
 */
export function abr105RigidBoltForces(F1, F23, F45 = 0, geometry = {}) {
    nonneg("F1", F1);
    nonneg("F23", F23);
    nonneg("F45", F45);
    const k = etaProduct("ABR105").tables["D3-8"].bolt_factors;
    let eb = 0;
    if (F45 > 0) {
        if (geometry.b === undefined || geometry.e === undefined)
            throw new Error("F4/5 on the bolts needs b_mm and e_mm (k_ax = e/b for bolt 1)");
        eb = pos("e_mm", geometry.e) / pos("b_mm", geometry.b);
    }
    const ax1 = k.k_ax.F1 * F1 + eb * F45;
    const ax2 = k.k_ax.F1 * F1 + k.k_ax.F45_bolt2 * F45;
    const lat1 = k.k_lat.F23 * F23;
    const lat2 = k.k_lat.F23 * F23 + k.k_lat.F45_bolt2 * F45;
    return { bolt1: { N: ax1, V: lat1 }, bolt2: { N: ax2, V: lat2 }, governingN: Math.max(ax1, ax2), governingV: Math.max(lat1, lat2),
        source: `${sourceRef("ETA-06/0106")} Annex D3 Table D3-8 (p. 55), 'Connection with bolt'` };
}
/**
 * ETA-06/0106 Annex C1, third inequality as a utilisation (covers the other two). direction45: '4' (towards the
 * vertical flange), '5' (away from it) or 'min' (the lower resistance). Infinity when a force acts in a direction
 * without resistance (e.g. F2/3 on one free bracket).
 */
export function bracketUtilisation(F1, F23, F45, res, direction45 = "min") {
    nonneg("F1", F1);
    nonneg("F23", F23);
    nonneg("F45", F45);
    const r45 = direction45 === "4" ? res.R4 : direction45 === "5" ? res.R5 : r45Of(res);
    const ratio = (force, r) => {
        if (force === 0)
            return 0;
        if (r === null)
            throw new Error("a force acts in a direction whose resistance is not available (see the flags)");
        return r <= 0 ? Infinity : force / r;
    };
    const a = ratio(F1, res.R1) + ratio(F45, r45);
    return Math.hypot(a, ratio(F23, res.R23));
}
/**
 * Which ETA configuration an ABR105 pair takes at a joist end in an existing wall: pocket (or a notch at least
 * wallFaceMin below the crest) -> flange B on the wall face, Table D3-8; shallow notch -> flange B on the crest top
 * (needs >= 105 mm of joist above the crest); crest (sill on the crest) -> beam to beam on the sill, Table D3-1.
 * The 100 mm wall-face minimum is a practice rule (flange B on sound masonry), not an ETA value.
 */
export function abr105PocketConfiguration(bearing, joistH, opts = {}) {
    const { brackets = 2, wallFaceMin = 100 } = opts;
    const h = pos("joist_h_mm", joistH);
    const geo = etaProduct("ABR105").geometry;
    if (brackets !== 2)
        throw new Error("a joist end in a wall takes 2 ABR105, one on each side (Table D3-8 / D3-1); 4 (two pairs above each other) is not an ETA-06/0106 configuration");
    let config, table, F1is, F23is;
    if (bearing === "crest") {
        config = "sill_on_crest";
        table = "D3-1";
        F1is = "uplift";
        F23is = "pull-out";
    }
    else if (bearing === "pocket" || bearing === "notch") {
        if (bearing === "notch" && opts.belowCrest === undefined)
            throw new Error("a notch needs below_crest_mm (depth of the joist underside below the crest)");
        if (bearing === "pocket" || opts.belowCrest >= wallFaceMin) {
            config = "wall_face";
            table = "D3-8";
            F1is = "pull-out";
            F23is = "uplift";
        }
        else {
            if (opts.aboveCrest === undefined || opts.aboveCrest < geo.A_mm)
                throw new Error(`notch too shallow for flange B on the wall face (< ${g6(wallFaceMin)} mm) and too little joist above the crest for flange A (${geo.A_mm} mm)`);
            config = "crest_top";
            table = "D3-8";
            F1is = "uplift";
            F23is = "pull-out";
        }
    }
    else
        throw new Error("bearing must be 'pocket', 'notch' or 'crest'");
    if (h < geo.C_mm)
        throw new Error(`joist height ${g6(h)} mm < bracket width C = ${geo.C_mm} mm`);
    const pattern = table === "D3-1" ? "1" : "3";
    return { config, table, pattern, brackets: 2, anchors: table === "D3-1" ? 0 : 2, F1is, F23is, source: `${sourceRef("ETA-06/0106")} Annex D3, Table ${table}, nailing pattern ${pattern}` };
}
/**
 * Design resistances of a joist hanger with full nailing (R1 down, R2 up, R3/R4 lateral), kN. Values from the cited
 * source (SBE80/150: the manufacturer's data sheet; dimensions agree with ETA-06/0270 Annex D39 blank 380). Outside
 * the joist-height range of the source a flag is raised and ok is false.
 */
export function hangerResistance(model, duration, opts = {}) {
    const { nail = "4.0x35", gammaM = ETA_GAMMA_M, rhoK = RHO_K_TABLES, serviceClass = 1 } = opts;
    const kmod = kmodForDuration(duration, serviceClass);
    const g = gamma(gammaM);
    const p = etaProduct(model);
    if (!p.values)
        throw new Error(`${model} is not a hanger`);
    const nk = nailKey(nail);
    const v = p.values;
    if (!(nk in v.R1))
        throw new Error(`${model}: nail ${nail} not tabulated (${Object.keys(v.R1).sort().join(", ")})`);
    if (pos("rho_k", rhoK) < RHO_K_TABLES)
        throw new Error(`${model}: values for ${v.timber} (rho_k 350); lower densities are not encoded`);
    const geo = p.geometry;
    const flags = [];
    if (opts.joistH !== undefined) {
        const h = pos("joist_h_mm", opts.joistH);
        if (!(geo.joist_h_min_mm <= h && h <= geo.joist_h_max_mm))
            flags.push(`joist height ${g6(h)} mm outside ${geo.joist_h_min_mm}-${geo.joist_h_max_mm} mm of the ${model} row (data sheet p. ${geo.datasheet_page})`);
    }
    if (opts.joistWidth !== undefined && Math.abs(opts.joistWidth - geo.joist_width_mm) > 1e-9)
        flags.push(`joist width ${opts.joistWidth} mm differs from A = ${geo.joist_width_mm} mm`);
    const citation = `${sourceRef(p.source)}, p. ${v.datasheet_page} '${v.table}', row ${model}, CNA ${nk.replace(".", ",")}`;
    const Rk = { R1: v.R1[nk], R2: v.R2[nk], R3: v.R3[nk], R4: v.R4[nk] };
    return { R1: Rk.R1 * kmod / g, R2: Rk.R2 * kmod / g, R3: Rk.R3 * kmod / g, R4: Rk.R4 * kmod / g, model, duration, kmod, gammaM: g, nail: nk, Rk, citation,
        nailing: v.nailing, eta: p.eta, etaCheck: geo.eta_check, sourceKind: ETA_DATA.sources[p.source].kind, flags, ok: flags.length === 0 };
}
/** Single-direction utilisations of a hanger; a combination of directions is flagged (the ETA-06/0270 Annex C interaction is not encoded). */
export function hangerCheck(FDown, FUp, res, FLat = 0) {
    nonneg("F_down", FDown);
    nonneg("F_up", FUp);
    nonneg("F_lat", FLat);
    if (FDown > 0 && FUp > 0)
        throw new Error("one load case acts either down or up on a hanger");
    const eta = { down: FDown / res.R1, up: FUp / res.R2, lateral: FLat / Math.min(res.R3, res.R4) };
    const flags = [...res.flags];
    if (FLat > 0 && (FDown > 0 || FUp > 0))
        flags.push("combined vertical and lateral force: the ETA-06/0270 Annex C interaction is not encoded");
    const keys = ["down", "up", "lateral"];
    const governing = keys.reduce((best, key) => (eta[key] > eta[best] ? key : best));
    return { eta, governing, utilisation: eta[governing], flags, ok: eta[governing] <= 1 && flags.length === 0 };
}
