/**
 * Twice-elastic-slope criterion, as for the plastic collapse load in pressure-vessel
 * practice: line through the origin with half the elastic stiffness. Points are
 * converged states in increasing displacement, with positive force/displacement
 * magnitudes and the maximum plastic strain over ALL element kinds. The origin
 * may be included; index identifies the upper bracketing point (last if not crossed).
 */
export function tesLimitLoad(points) {
    const first = points.find(p => p.displacement > 0);
    if (!first)
        throw new Error("TES requires a converged point with positive displacement");
    const elastic = points.filter(p => p.displacement > 0 && p.plasticStrain === 0);
    const elasticFound = elastic.length > 0;
    const Ke = elasticFound ? Math.max(...elastic.map(p => p.reaction / p.displacement)) : first.reaction / first.displacement;
    for (let i = 1; i < points.length; i++) {
        const before = points[i - 1], after = points[i];
        const g0 = before.reaction - Ke / 2 * before.displacement;
        const g1 = after.reaction - Ke / 2 * after.displacement;
        if (g0 > 0 && g1 <= 0) {
            const alpha = g0 / (g0 - g1);
            return { Ke, F: before.reaction + alpha * (after.reaction - before.reaction),
                u: before.displacement + alpha * (after.displacement - before.displacement), index: i, elasticFound, crossed: true };
        }
    }
    const index = points.length - 1, last = points[index];
    return { Ke, F: last.reaction, u: last.displacement, index, elasticFound, crossed: false };
}
/** Informational first peak-strain crossing; never a resistance or stopping event. */
export function strainInformation(points, threshold = 0.05) {
    const index = points.findIndex(p => p.plasticStrain >= threshold);
    if (index < 0)
        return null;
    const after = points[index], before = points[index - 1] ?? { displacement: 0, reaction: 0, plasticStrain: 0 };
    const alpha = (threshold - before.plasticStrain) / (after.plasticStrain - before.plasticStrain);
    return { F: before.reaction + alpha * (after.reaction - before.reaction), u: before.displacement + alpha * (after.displacement - before.displacement) };
}
export function limitLoadWarnings(limit, event) {
    return [
        ...(!limit.elasticFound ? ["no elastic step: reduce the first load step"] : []),
        ...(event === "none" ? ["No limit load or bolt/anchor event within the displacement limit: the FE value is a lower bound. Increase the displacement limit."] : []),
    ];
}
