// Dimensioned drawings (SVG strings) of the column base, the steel-to-timber
// connection and the timber bearing. Pure functions without DOM access.
import { PALETTE, arrowHead, dimH, dimV, f1, fmt, nextDrawingId, textAt } from "./drawing.js";

const { INK, STEEL, STEEL_DARK, BOLT, DIM } = PALETTE;
const LOAD = "#b03a2e";
const EFFECTIVE = "#f2d29b";
const WOOD = "#ead7b0";
const WOOD_LINE = "#b99a62";
const GROUT = "#d8d3c6";

function svg(viewBox, title, label, body, defs = "") {
  const [x, y, , ] = viewBox;
  const size = viewBox[4];
  return `<svg class="drawing" viewBox="${viewBox.slice(0, 4).map(f1).join(" ")}" role="img" aria-label="${label}" font-family="Arial, Helvetica, sans-serif">
${defs ? `<defs>${defs}</defs>` : ""}
${textAt(x + size * 0.2, y + size * 1.3, title, size, "start", `font-weight="700" fill="${INK}"`).replace(`fill="${DIM}" `, "")}
${body}
</svg>`;
}

function hatch(id, size, background = "#eef1f4", line = "#9aa6b2") {
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f1(size)}" height="${f1(size)}" patternTransform="rotate(45)"><rect width="${f1(size)}" height="${f1(size)}" fill="${background}"/><line x1="0" y1="0" x2="0" y2="${f1(size)}" stroke="${line}" stroke-width="${f1(size * 0.12)}"/></pattern>`;
}

function rect(x0, y0, x1, y1, fill, stroke = INK, width = 1, extra = "") {
  const x = Math.min(x0, x1), y = Math.min(y0, y1);
  return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(Math.abs(x1 - x0))}" height="${f1(Math.abs(y1 - y0))}" fill="${fill}" stroke="${stroke}" stroke-width="${f1(width)}" ${extra}/>`;
}

function arrow(x1, y1, x2, y2, size, label, labelSide = 1) {
  const head = arrowHead(x2, y2, x2 - x1, y2 - y1, size * 1.2).replace(DIM, LOAD);
  const text = label ? textAt(x1 + labelSide * size * 0.6, (y1 + y2) / 2, label, size * 1.05, labelSide > 0 ? "start" : "end", `font-weight="700" fill="${LOAD}"`).replace(`fill="${DIM}" `, "") : "";
  return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${LOAD}" stroke-width="${f1(size * 0.2)}"/>${head}${text}`;
}

function bolt(x, y, d0, dw, size) {
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(dw / 2)}" fill="none" stroke="${BOLT}" stroke-width="${f1(size * 0.06)}" stroke-dasharray="${f1(size * 0.35)} ${f1(size * 0.2)}"/>`
    + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(d0 / 2)}" fill="#ffffff" stroke="${INK}" stroke-width="${f1(size * 0.09)}"/>`
    + `<line x1="${f1(x - dw / 2 - size * 0.4)}" y1="${f1(y)}" x2="${f1(x + dw / 2 + size * 0.4)}" y2="${f1(y)}" stroke="${INK}" stroke-width="${f1(size * 0.04)}"/>`
    + `<line x1="${f1(x)}" y1="${f1(y - dw / 2 - size * 0.4)}" x2="${f1(x)}" y2="${f1(y + dw / 2 + size * 0.4)}" stroke="${INK}" stroke-width="${f1(size * 0.04)}"/>`;
}

/** Zigzag break line from (x, y0) to (x, y1), SVG coordinates. */
function breakLine(x, y0, y1, size) {
  const mid = (y0 + y1) / 2, a = size * 0.8;
  return `<polyline points="${f1(x)},${f1(y0)} ${f1(x)},${f1(mid - a)} ${f1(x + a)},${f1(mid - a / 2)} ${f1(x - a)},${f1(mid + a / 2)} ${f1(x)},${f1(mid + a)} ${f1(x)},${f1(y1)}" fill="none" stroke="${INK}" stroke-width="${f1(size * 0.08)}"/>`;
}

// ---------------------------------------------------------------- column base

/** Plan of the base plate: column, anchors, effective compression area. x to the right, y up. */
export function basePlatePlanSvg(g, result, title = "Plan") {
  const size = Math.max(g.hp, g.bp) / 28;
  const Y = y => -y;
  const parts = [];
  parts.push(rect(-g.hp / 2, Y(-g.bp / 2), g.hp / 2, Y(g.bp / 2), STEEL, INK, size * 0.1));
  for (const [x0, x1, y0, y1] of result.compression.rects) parts.push(rect(x0, Y(y0), x1, Y(y1), EFFECTIVE, "none", 0));
  if (g.columnType === "I") {
    parts.push(rect(g.h / 2 - g.tf, Y(-g.b / 2), g.h / 2, Y(g.b / 2), STEEL_DARK, INK, size * 0.08));
    parts.push(rect(-g.h / 2, Y(-g.b / 2), -g.h / 2 + g.tf, Y(g.b / 2), STEEL_DARK, INK, size * 0.08));
    parts.push(rect(-g.h / 2 + g.tf, Y(-g.tw / 2), g.h / 2 - g.tf, Y(g.tw / 2), STEEL_DARK, INK, size * 0.08));
  } else {
    parts.push(rect(g.h / 2 - g.t, Y(-g.b / 2), g.h / 2, Y(g.b / 2), STEEL_DARK, INK, size * 0.08));
    parts.push(rect(-g.h / 2, Y(-g.b / 2), -g.h / 2 + g.t, Y(g.b / 2), STEEL_DARK, INK, size * 0.08));
    parts.push(rect(-g.h / 2, Y(g.b / 2 - g.t), g.h / 2, Y(g.b / 2), STEEL_DARK, INK, size * 0.08));
    parts.push(rect(-g.h / 2, Y(-g.b / 2), g.h / 2, Y(-g.b / 2 + g.t), STEEL_DARK, INK, size * 0.08));
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) parts.push(bolt(sx * g.px / 2, Y(sy * g.py / 2), result.bolt.d0, result.bolt.dw, size));
  // dimensions: x below, y on the right
  const yChain = g.bp / 2 + 2 * size, yTotal = yChain + 2.3 * size;
  const xs = [-g.hp / 2, -g.px / 2, g.px / 2, g.hp / 2];
  const xLabels = [`ex ${fmt((g.hp - g.px) / 2)}`, `px ${fmt(g.px)}`, `ex ${fmt((g.hp - g.px) / 2)}`];
  for (let i = 0; i < 3; i++) parts.push(dimH(xs[i], xs[i + 1], yChain, g.bp / 2 + size * 0.3, xLabels[i], size * 0.8));
  parts.push(dimH(-g.hp / 2, g.hp / 2, yTotal, yChain, `hp ${fmt(g.hp)}`, size * 0.85));
  const xChain = g.hp / 2 + 1.8 * size, xTotal = xChain + 6 * size;
  const ys = [-g.bp / 2, -g.py / 2, g.py / 2, g.bp / 2];
  const yLabels = [`e ${fmt((g.bp - g.py) / 2)}`, `py ${fmt(g.py)}`, `e ${fmt((g.bp - g.py) / 2)}`];
  for (let i = 0; i < 3; i++) parts.push(dimV(Y(ys[i]), Y(ys[i + 1]), xChain, g.hp / 2 + size * 0.3, yLabels[i], size * 0.8));
  parts.push(dimV(Y(-g.bp / 2), Y(g.bp / 2), xTotal, xChain + 4.4 * size, `bp ${fmt(g.bp)}`, size * 0.85));
  parts.push(`<rect x="${f1(-g.hp / 2)}" y="${f1(yTotal + 1.6 * size)}" width="${f1(size * 1.2)}" height="${f1(size * 0.8)}" fill="${EFFECTIVE}" stroke="${INK}" stroke-width="${f1(size * 0.04)}"/>`);
  parts.push(textAt(-g.hp / 2 + size * 1.8, yTotal + 2.3 * size, `effective area in compression (c = ${fmt(result.compression.c)} mm)`, size * 0.8, "start"));
  const column = g.columnType === "I" ? `I ${fmt(g.h)} × ${fmt(g.b)}` : `hollow ${fmt(g.h)} × ${fmt(g.b)} × ${fmt(g.t)}`;
  const vb = [-g.hp / 2 - 1.5 * size, Y(g.bp / 2) - 3 * size, g.hp + 11.5 * size, g.bp + 10 * size, size];
  return svg(vb, `${title} — column ${column}, plate ${fmt(g.hp)} × ${fmt(g.bp)} × ${fmt(g.tp)}`, `${title}: base plate with column, anchors and effective compression area`, parts.join("\n"));
}

/** Section through the anchor rows (x-z plane): column, plate, grout, foundation, anchors. */
export function basePlateSectionSvg(g, result, title = "Section") {
  const Y = z => -z;
  const W = Math.min(g.af, g.hp + 2 * Math.max(1.2 * g.hef, 0.5 * g.hp));
  const D = Math.min(g.hf, g.hef + Math.max(0.4 * g.hef, 100));
  const colH = 0.6 * Math.max(g.hp, 250);
  const top = g.tg + g.tp;
  const size = Math.max(W, D + top + colH) / 30;
  const hatchId = nextDrawingId("concrete");
  const parts = [];
  parts.push(`<rect x="${f1(-W / 2)}" y="${f1(Y(0))}" width="${f1(W)}" height="${f1(D)}" fill="url(#${hatchId})" stroke="none"/>`);
  const edges = [`M${f1(-W / 2)},${f1(Y(0))} L${f1(W / 2)},${f1(Y(0))}`];
  if (W >= g.af - 1e-6) edges.push(`M${f1(-W / 2)},${f1(Y(0))} L${f1(-W / 2)},${f1(Y(-D))}`, `M${f1(W / 2)},${f1(Y(0))} L${f1(W / 2)},${f1(Y(-D))}`);
  if (D >= g.hf - 1e-6) edges.push(`M${f1(-W / 2)},${f1(Y(-D))} L${f1(W / 2)},${f1(Y(-D))}`);
  parts.push(`<path d="${edges.join(" ")}" stroke="${INK}" stroke-width="${f1(size * 0.1)}" fill="none"/>`);
  if (g.tg > 0) parts.push(rect(-g.hp / 2 - g.tg, Y(0), g.hp / 2 + g.tg, Y(g.tg), GROUT, INK, size * 0.06));
  parts.push(rect(-g.hp / 2, Y(g.tg), g.hp / 2, Y(top), STEEL, INK, size * 0.1));
  const wall = g.columnType === "I" ? g.tf : g.t;
  parts.push(rect(-g.h / 2 + wall, Y(top), g.h / 2 - wall, Y(top + colH), STEEL, INK, size * 0.06));
  parts.push(rect(-g.h / 2, Y(top), -g.h / 2 + wall, Y(top + colH), STEEL_DARK, INK, size * 0.08));
  parts.push(rect(g.h / 2 - wall, Y(top), g.h / 2, Y(top + colH), STEEL_DARK, INK, size * 0.08));
  const leg = g.aw * Math.SQRT2;
  for (const s of [-1, 1]) {
    parts.push(`<path d="M${f1(s * g.h / 2)},${f1(Y(top))} L${f1(s * (g.h / 2 + leg))},${f1(Y(top))} L${f1(s * g.h / 2)},${f1(Y(top + leg))} Z" fill="${INK}"/>`);
  }
  const b = result.bolt;
  const head = Math.max(0.6 * b.d, 8), washer = Math.max(3, 0.15 * b.d), nut = 0.8 * b.d, protrude = 0.4 * b.d;
  for (const s of [-1, 1]) {
    const x = s * g.px / 2;
    parts.push(rect(x - b.d / 2, Y(-g.hef), x + b.d / 2, Y(top + washer + nut + protrude), BOLT, "none", 0, `opacity="0.85"`));
    parts.push(rect(x - g.dh / 2, Y(-g.hef - head), x + g.dh / 2, Y(-g.hef), "#6b7682", INK, size * 0.05));
    parts.push(rect(x - b.dw / 2, Y(top), x + b.dw / 2, Y(top + washer), "#7d8894", INK, size * 0.05));
    parts.push(rect(x - b.s / 2, Y(top + washer), x + b.s / 2, Y(top + washer + nut), "#6b7682", INK, size * 0.05));
  }
  // loads
  const zTop = top + colH;
  parts.push(arrow(0, Y(zTop + 5 * size), 0, Y(zTop + 0.3 * size), size, "N", 1));
  parts.push(arrow(-g.h / 2 - 6 * size, Y(zTop - 2 * size), -g.h / 2 - 0.4 * size, Y(zTop - 2 * size), size, "V", -1));
  // dimensions
  const xLeft = -g.px / 2 - g.dh / 2 - 4.5 * size;
  parts.push(dimV(Y(0), Y(-g.hef), xLeft, -g.px / 2 - g.dh / 2, `hef ${fmt(g.hef)}`, size * 0.8));
  const xRight = g.hp / 2 + g.tg + 1.6 * size;
  if (g.tg > 0) parts.push(dimV(Y(0), Y(g.tg), xRight, g.hp / 2 + g.tg, `tg ${fmt(g.tg)}`, size * 0.75));
  parts.push(dimV(Y(g.tg), Y(top), xRight + (g.tg > 0 ? 4.2 * size : 0), g.hp / 2, `tp ${fmt(g.tp)}`, size * 0.75));
  const yBelow = Y(-D) + 2 * size;
  parts.push(dimH(-g.px / 2, g.px / 2, yBelow, Y(-g.hef - head), `px ${fmt(g.px)}`, size * 0.85));
  const vb = [-W / 2 - 2 * size, Y(zTop + 7.5 * size), W + 4 * size + 9 * size, zTop + 7.5 * size + D + 4 * size, size];
  vb[0] = Math.min(vb[0], xLeft - 1.5 * size);
  vb[2] = Math.max(W / 2, xRight + 9 * size) - vb[0];
  return svg(vb, `${title} — anchors ${b.size} ${g.anchorClass}, foundation ${fmt(g.af)} × ${fmt(g.bf)} × ${fmt(g.hf)}`, `${title}: column base with grout, foundation and anchors`, parts.join("\n"), hatch(hatchId, size));
}

// ---------------------------------------------------------- steel to timber

/** Elevation of the timber member (grain horizontal) with the fastener pattern and the force. */
export function steelTimberElevationSvg(g, result, title = "Elevation") {
  const Y = y => -y;
  const span = g.a3 + (g.perRow - 1) * g.a1;
  const L = span + Math.max(g.a3, 0.8 * g.h);
  const size = Math.max(L, g.h * 1.6) / 30;
  const xs = Array.from({ length: g.perRow }, (_, i) => g.a3 + i * g.a1);
  const ys = Array.from({ length: g.rows }, (_, j) => g.a4 + j * g.a2);
  const parts = [];
  parts.push(rect(0, Y(0), L, Y(g.h), WOOD, "none", 0));
  for (let k = 1; k <= 4; k++) parts.push(`<line x1="${f1(size)}" y1="${f1(Y(k * g.h / 5))}" x2="${f1(L - size)}" y2="${f1(Y(k * g.h / 5))}" stroke="${WOOD_LINE}" stroke-width="${f1(size * 0.05)}"/>`);
  parts.push(`<path d="M${f1(L)},${f1(Y(0))} L0,${f1(Y(0))} L0,${f1(Y(g.h))} L${f1(L)},${f1(Y(g.h))}" fill="none" stroke="${INK}" stroke-width="${f1(size * 0.1)}"/>`);
  parts.push(breakLine(L, Y(g.h), Y(0), size));
  // steel plate
  const pad = Math.max(2 * g.d, 0.4 * Math.min(g.a4, g.a3));
  const px0 = -Math.max(0.6 * g.a3, 3 * size), px1 = span + pad;
  const py0 = Math.max(-0.12 * g.h, ys[0] - pad), py1 = Math.min(1.12 * g.h, ys[ys.length - 1] + pad);
  const dashed = g.configuration === "slotted" ? `stroke-dasharray="${f1(size * 0.6)} ${f1(size * 0.3)}"` : "";
  parts.push(rect(px0, Y(py0), px1, Y(py1), STEEL, INK, size * 0.08, `fill-opacity="${g.configuration === "slotted" ? 0.45 : 0.75}" ${dashed}`));
  for (const x of xs) for (const y of ys) {
    parts.push(`<circle cx="${f1(x)}" cy="${f1(Y(y))}" r="${f1(g.d / 2)}" fill="${BOLT}" stroke="${INK}" stroke-width="${f1(size * 0.05)}"/>`);
  }
  // force on the group
  const xc = (xs[0] + xs[xs.length - 1]) / 2, yc = (ys[0] + ys[ys.length - 1]) / 2;
  const a = g.alpha * Math.PI / 180, len = Math.max(0.45 * g.h, 6 * size);
  const ux = (g.endLoaded ? -1 : 1) * Math.cos(a), uy = -Math.sin(a);
  parts.push(arrow(xc, Y(yc), xc + ux * len, Y(yc + uy * len), size, "", 1));
  parts.push(textAt(xc + ux * len + (ux >= 0 ? 1 : -1) * size * 0.8, Y(yc + uy * len) - size * 0.6, `F ${g.FEd} kN, α ${g.alpha}°`, size * 0.95, ux >= 0 ? "start" : "end", `font-weight="700" fill="${LOAD}"`).replace(`fill="${DIM}" `, ""));
  // grain direction
  parts.push(`<line x1="${f1(L - 9 * size)}" y1="${f1(Y(g.h) - 1.2 * size)}" x2="${f1(L - 3 * size)}" y2="${f1(Y(g.h) - 1.2 * size)}" stroke="${WOOD_LINE}" stroke-width="${f1(size * 0.12)}"/>`);
  parts.push(arrowHead(L - 3 * size, Y(g.h) - 1.2 * size, 1, 0, size * 0.8).replace(DIM, WOOD_LINE) + arrowHead(L - 9 * size, Y(g.h) - 1.2 * size, -1, 0, size * 0.8).replace(DIM, WOOD_LINE));
  parts.push(textAt(L - 6 * size, Y(g.h) - 1.8 * size, "grain", size * 0.8, "middle"));
  // dimensions: along the grain below, across on the right
  const yChain = Y(0) + 2 * size;
  const stops = [0, ...xs];
  for (let i = 0; i < stops.length - 1; i++) parts.push(dimH(stops[i], stops[i + 1], yChain, Y(0) + size * 0.3, i === 0 ? `a3 ${fmt(g.a3)}` : `a1 ${fmt(g.a1)}`, size * 0.8));
  const xChain = L + 2.2 * size;
  const vstops = [0, ...ys, g.h];
  for (let j = 0; j < vstops.length - 1; j++) {
    const label = j === 0 ? `a4${g.alpha > 0 ? ",t" : ""} ${fmt(g.a4)}` : j === vstops.length - 2 ? `a4,c ${fmt(g.h - ys[ys.length - 1])}` : `a2 ${fmt(g.a2)}`;
    parts.push(dimV(Y(vstops[j]), Y(vstops[j + 1]), xChain, L + size * 0.3, label, size * 0.8));
  }
  parts.push(dimV(Y(0), Y(g.h), xChain + 7 * size, xChain + 5 * size, `h ${fmt(g.h)}`, size * 0.85));
  if (g.alpha > 0) parts.push(textAt(L / 2, Y(0) + 4.6 * size, "loaded edge (force component perpendicular to the grain points towards it)", size * 0.75));
  const vb = [px0 - 2 * size, Y(Math.max(g.h, py1)) - 4 * size, L - px0 + 15 * size, Math.max(g.h, py1) + 4 * size + 6 * size - Math.min(0, py0), size];
  return svg(vb, `${title} — ${g.rows} × ${g.perRow} ${g.fastener === "bolt" ? "bolts M" : "dowels Ø"}${g.d}`, `${title}: timber member with steel plate, fasteners and force`, parts.join("\n"));
}

/** Cross-section across the member thickness with the plate arrangement. */
export function steelTimberSectionSvg(g, result, title = "Cross-section") {
  const Y = y => -y;
  const ts = g.ts, b = g.b;
  const outer = g.configuration === "outer", single = g.configuration === "single", slotted = g.configuration === "slotted";
  const xMinPart = outer ? -b / 2 - ts : -b / 2;
  const xMaxPart = outer || single ? b / 2 + ts : b / 2;
  const size = Math.max(xMaxPart - xMinPart + 0.8 * g.d * 4, g.h) / 22;
  const ys = Array.from({ length: g.rows }, (_, j) => g.a4 + j * g.a2);
  const pad = Math.max(2 * g.d, 0.4 * g.a4);
  const py0 = Math.max(-0.12 * g.h, ys[0] - pad), py1 = Math.min(1.12 * g.h, ys[ys.length - 1] + pad);
  const parts = [];
  if (slotted) {
    const slot = ts + 2;
    parts.push(rect(-b / 2, Y(0), -slot / 2, Y(g.h), WOOD, INK, size * 0.08));
    parts.push(rect(slot / 2, Y(0), b / 2, Y(g.h), WOOD, INK, size * 0.08));
    parts.push(rect(-slot / 2, Y(0), slot / 2, Y(g.h), "#ffffff", INK, size * 0.04, `stroke-dasharray="${f1(size * 0.3)} ${f1(size * 0.2)}"`));
    parts.push(rect(-ts / 2, Y(py0), ts / 2, Y(py1), STEEL_DARK, INK, size * 0.08));
  } else {
    parts.push(rect(-b / 2, Y(0), b / 2, Y(g.h), WOOD, INK, size * 0.08));
    parts.push(rect(b / 2, Y(py0), b / 2 + ts, Y(py1), STEEL_DARK, INK, size * 0.08));
    if (outer) parts.push(rect(-b / 2 - ts, Y(py0), -b / 2, Y(py1), STEEL_DARK, INK, size * 0.08));
  }
  const isBolt = g.fastener === "bolt";
  const ext = isBolt ? 0.8 * g.d : 0;
  for (const y of ys) {
    const x0 = (outer ? -b / 2 - ts : -b / 2) - ext, x1 = (outer || single ? b / 2 + ts : b / 2) + ext;
    parts.push(rect(x0, Y(y - g.d / 2), x1, Y(y + g.d / 2), BOLT, "none", 0, `opacity="0.85"`));
    if (isBolt) for (const x of [x0, x1 - ext]) parts.push(rect(x, Y(y - 0.9 * g.d), x + ext, Y(y + 0.9 * g.d), "#6b7682", INK, size * 0.04));
  }
  const yDim = Y(g.h) - 1.8 * size;
  parts.push(dimH(-b / 2, b / 2, yDim, Y(g.h) - size * 0.2, `b ${fmt(b)}`, size * 0.85));
  const yBelow = Y(0) + 2 * size;
  if (slotted) parts.push(dimH(-ts / 2, ts / 2, yBelow, Y(py0), `ts ${fmt(ts)}`, size * 0.75));
  else parts.push(dimH(b / 2, b / 2 + ts, yBelow, Y(py0), `ts ${fmt(ts)}`, size * 0.75));
  const label = slotted ? "slotted-in plate, double shear" : outer ? "two outer plates, double shear" : "one plate, single shear";
  parts.push(textAt(0, yBelow + 2.6 * size, label, size * 0.8));
  const x0 = xMinPart - ext - 6 * size, x1 = xMaxPart + ext + 6 * size;
  const vb = [x0, Y(g.h) - 4.2 * size, x1 - x0, g.h + 4.2 * size + 4 * size, size];
  return svg(vb, title, `${title}: member thickness with the steel plates`, parts.join("\n"));
}

// -------------------------------------------------------------- timber bearing

/** Elevation of the beam end on its support with the effective contact length. */
export function timberBearingSvg(g, result, title = "Elevation") {
  const Y = y => -y;
  const ext = Math.max(2 * g.h, 300);
  const L = g.a + g.l + ext;
  const supportH = Math.max(1.1 * g.h, 200);
  const masonry = g.support === "masonry";
  const s0 = masonry ? g.a + g.l - g.tWall : g.a === 0 ? -0.4 * g.l : g.a;
  const s1 = g.a + g.l;
  const xMin = Math.min(0, s0);
  const size = Math.max(L - xMin, g.h + supportH) / 30;
  const hatchId = nextDrawingId("support");
  const parts = [];
  const fill = g.support === "steel" ? STEEL : `url(#${hatchId})`;
  const supportDepth = g.support === "steel" ? Math.max(12, 0.08 * g.h) : supportH;
  parts.push(rect(s0, Y(0), s1, Y(-supportDepth), fill, INK, size * 0.1));
  if (g.support === "steel") parts.push(rect((s0 + s1) / 2 - 4, Y(-supportDepth), (s0 + s1) / 2 + 4, Y(-supportH), STEEL_DARK, INK, size * 0.06));
  // beam
  parts.push(rect(0, Y(0), L, Y(g.h), WOOD, "none", 0));
  for (let k = 1; k <= 3; k++) parts.push(`<line x1="${f1(size)}" y1="${f1(Y(k * g.h / 4))}" x2="${f1(L - size)}" y2="${f1(Y(k * g.h / 4))}" stroke="${WOOD_LINE}" stroke-width="${f1(size * 0.05)}"/>`);
  parts.push(`<path d="M${f1(L)},${f1(Y(0))} L0,${f1(Y(0))} L0,${f1(Y(g.h))} L${f1(L)},${f1(Y(g.h))}" fill="none" stroke="${INK}" stroke-width="${f1(size * 0.1)}"/>`);
  parts.push(breakLine(L, Y(g.h), Y(0), size));
  // effective contact length
  const e0 = g.a - result.extEnd, e1 = g.a + g.l + result.extInner;
  parts.push(rect(e0, Y(0), e1, Y(0.1 * g.h), EFFECTIVE, INK, size * 0.04, `stroke-dasharray="${f1(size * 0.4)} ${f1(size * 0.25)}"`));
  parts.push(rect(g.a, Y(0), g.a + g.l, Y(0.1 * g.h), "#d9a441", "none", 0));
  // load
  const xc = g.a + g.l / 2;
  parts.push(arrow(xc, Y(g.h + 5 * size), xc, Y(g.h + 0.3 * size), size, `F ${g.FEd} kN`, 1));
  // dimensions below the support
  const yChain = Y(-supportH) + 2 * size;
  if (g.a > 0) parts.push(dimH(0, g.a, yChain, Y(0) + size * 0.3, `a ${fmt(g.a)}`, size * 0.8));
  parts.push(dimH(g.a, g.a + g.l, yChain, Y(0) + size * 0.3, `l ${fmt(g.l)}`, size * 0.8));
  parts.push(dimH(e0, e1, yChain + 2.3 * size, yChain, `lef ${fmt(result.lef)}`, size * 0.8));
  if (masonry) parts.push(dimH(s0, s1, yChain + 4.6 * size, Y(-supportH) + size * 0.3, `t ${fmt(g.tWall)}`, size * 0.8));
  parts.push(dimV(Y(0), Y(g.h), L + 2.4 * size, L + size * 0.3, `h ${fmt(g.h)}`, size * 0.85));
  const supportName = masonry ? "masonry wall (pocket)" : g.support === "concrete" ? "concrete" : "steel plate or flange";
  const vb = [xMin - 2 * size, Y(g.h + 8 * size), L - xMin + 10 * size, g.h + 8 * size + supportH + 9 * size, size];
  return svg(vb, `${title} — b ${fmt(g.b)} × h ${fmt(g.h)} on ${supportName}`, `${title}: beam end on its support with the effective contact length`, parts.join("\n"),
    hatch(hatchId, size, masonry ? "#f3e6dc" : "#eef1f4", masonry ? "#b9826a" : "#9aa6b2"));
}
