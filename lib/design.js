/**
 * Design check of the equal-leg bolted T-stub in tension with partial factors
 * (EN 1993-1-8 Table 6.2 with Table 3.4 and 6.2.6.8; material values from
 * EN 1993-1-1 Table 3.1). Units: N, mm, MPa. Complements checkTStubEN, which
 * uses gamma = 1 and the input strengths and serves as the reference for the
 * FE comparison.
 */
/** EN 1993-1-1 Table 3.1 (EN 10025-2): nominal fy / fu for t <= 40 mm and 40 < t <= 80 mm. */
export const STEEL_GRADES = {
    S235: { upTo40: { fy: 235, fu: 360 }, upTo80: { fy: 215, fu: 360 } },
    S275: { upTo40: { fy: 275, fu: 430 }, upTo80: { fy: 255, fu: 410 } },
    S355: { upTo40: { fy: 355, fu: 490 }, upTo80: { fy: 335, fu: 470 } }
};
/**
 * d nominal diameter, As tensile stress area (EN ISO 898-1), s width across
 * flats of head and nut (ISO 4014 / ISO 4032), dw outside diameter of the
 * washer (ISO 7089), d0 normal clearance hole (EN 1090-2: +1 mm up to M14,
 * +2 mm M16-M24, +3 mm from M27).
 */
export const BOLT_SIZES = {
    M12: { d: 12, As: 84.3, s: 18, dw: 24, d0: 13 },
    M16: { d: 16, As: 157, s: 24, dw: 30, d0: 18 },
    M20: { d: 20, As: 245, s: 30, dw: 37, d0: 22 },
    M24: { d: 24, As: 353, s: 36, dw: 44, d0: 26 },
    M27: { d: 27, As: 459, s: 41, dw: 50, d0: 30 },
    M30: { d: 30, As: 561, s: 46, dw: 56, d0: 33 },
    M36: { d: 36, As: 817, s: 55, dw: 66, d0: 39 }
};
/** EN 1993-1-8 Table 3.1. */
export const BOLT_CLASSES = {
    "4.6": { fyb: 240, fub: 400 },
    "5.6": { fyb: 300, fub: 500 },
    "8.8": { fyb: 640, fub: 800 },
    "10.9": { fyb: 900, fub: 1000 }
};
/** Nominal steel strength for an element thickness (EN 1993-1-1 Table 3.1). */
export function steelStrength(grade, thickness) {
    const values = STEEL_GRADES[grade];
    if (!values)
        throw new Error(`Unknown steel grade ${grade}`);
    if (thickness <= 40)
        return values.upTo40;
    if (thickness <= 80)
        return values.upTo80;
    throw new Error(`Thickness ${thickness} mm exceeds 80 mm, outside EN 1993-1-1 Table 3.1`);
}
/**
 * Bolt positions along the T-stub length: nb bolts per row at equal pitch
 * L / nb with half a pitch to each end (the FE model uses the same layout).
 */
export function boltPositionsY(L, nb) {
    return Array.from({ length: nb }, (_, i) => (i + 0.5) * L / nb);
}
export function checkTStubDesign(geometry, options) {
    const { L, b, tw, tf, m, nb } = geometry;
    const gammaM0 = options.gammaM0 ?? 1.0;
    const gammaM2 = options.gammaM2 ?? 1.25;
    const flange = steelStrength(options.steelGrade, tf);
    const web = steelStrength(options.steelGrade, tw);
    const size = BOLT_SIZES[options.boltSize];
    const grade = BOLT_CLASSES[options.boltClass];
    if (!size)
        throw new Error(`Unknown bolt size ${options.boltSize}`);
    if (!grade)
        throw new Error(`Unknown bolt class ${options.boltClass}`);
    // mean of across points (s / cos 30 deg) and across flats of head and nut (Table 3.4)
    const dm = (size.s + size.s / Math.cos(Math.PI / 6)) / 2;
    const bolt = { size: options.boltSize, boltClass: options.boltClass, d: size.d, d0: size.d0, As: size.As, fub: grade.fub, s: size.s, dm, dw: size.dw };
    const e = b / 2 - tw / 2 - m;
    const n = Math.min(e, 1.25 * m);
    const ew = size.dw / 4;
    // l_eff = L for all patterns (the T-stub length is the effective length)
    const MplRd = 0.25 * L * tf ** 2 * flange.fy / gammaM0;
    const FtRd = 0.9 * grade.fub * size.As / gammaM2;
    const BpRd = 0.6 * Math.PI * dm * tf * flange.fu / gammaM2;
    const BtRd = Math.min(FtRd, BpRd);
    const sumBtRd = 2 * nb * BtRd; // all bolts: nb per row, one row on each side of the web
    const FT1 = 4 * MplRd / m;
    const FT1Method2 = (8 * n - 2 * ew) * MplRd / (2 * m * n - ew * (m + n));
    const FT2 = (2 * MplRd + n * sumBtRd) / (m + n);
    const FT3 = sumBtRd;
    const webRd = L * tw * web.fy / gammaM0;
    const candidates = [["mode 1", FT1], ["mode 2", FT2], ["mode 3", FT3], ["web", webRd]];
    const [governing, resistance] = candidates.reduce((best, item) => item[1] < best[1] ? item : best);
    const positions = boltPositionsY(L, nb);
    const checks = [];
    const add = (id, label, value, limit, unit, pass, reference, failStatus = "fail") => checks.push({ id, label, value, limit, unit, status: pass ? "ok" : failStatus, reference });
    if (options.FEd !== undefined)
        add("utilisation", "F_Ed / F_T,Rd", options.FEd / resistance, 1, "—", options.FEd <= resistance, "EN 1993-1-8 6.2.4");
    add("edge-across", "Edge distance e (across)", e, 1.2 * size.d0, "mm", e >= 1.2 * size.d0, "EN 1993-1-8 Table 3.3: e2 ≥ 1.2 d0");
    if (nb === 1)
        add("edge-along", "End distance e1 = L/2", L / 2, 1.2 * size.d0, "mm", L / 2 >= 1.2 * size.d0, "EN 1993-1-8 Table 3.3: e1 ≥ 1.2 d0");
    else {
        add("pitch", "Pitch p = L/nb", L / nb, 2.2 * size.d0, "mm", L / nb >= 2.2 * size.d0, "EN 1993-1-8 Table 3.3: p1 ≥ 2.2 d0");
        add("edge-along", "End distance e1 = p/2", L / (2 * nb), 1.2 * size.d0, "mm", L / (2 * nb) >= 1.2 * size.d0, "EN 1993-1-8 Table 3.3: e1 ≥ 1.2 d0");
    }
    add("washer", "Washer clear of the web: m", m, size.dw / 2, "mm", m >= size.dw / 2, "washer outside diameter dw / 2", "warning");
    add("punching", "Punching B_p,Rd ≥ F_t,Rd", BpRd, FtRd, "N", BpRd >= FtRd, "EN 1993-1-8 Table 3.4", "warning");
    return {
        flange, web, bolt, gammaM0, gammaM2, e, n, ew, MplRd, FtRd, BpRd, BtRd, sumBtRd,
        FT1, FT1Method2, FT2, FT3, webRd, resistance, governing,
        FEd: options.FEd, utilisation: options.FEd !== undefined ? options.FEd / resistance : undefined,
        boltPositionsY: positions, checks
    };
}
