// Dimensioned drawings (SVG strings) of the timber-to-timber connection: an
// elevation of the lap with the fastener pattern and the forces, and a
// cross-section through a column of fasteners. Pure functions, no DOM access.
import { PALETTE, arrowHead, dimH, dimV, f1, fmt, textAt } from "./drawing.js";

const { INK, BOLT, DIM } = PALETTE;
const LOAD = "#b03a2e";
const WOOD = "#ead7b0";
const WOOD_2 = "#d9bf8c";
const WOOD_LINE = "#b99a62";

function svg(viewBox, title, label, body) {
  const [x, y, , , size] = viewBox;
  return `<svg class="drawing" viewBox="${viewBox.slice(0, 4).map(f1).join(" ")}" role="img" aria-label="${label}" font-family="Arial, Helvetica, sans-serif">
${textAt(x + size * 0.2, y + size * 1.3, title, size, "start", `font-weight="700" fill="${INK}"`).replace(`fill="${DIM}" `, "")}
${body}
</svg>`;
}

function rect(x0, y0, x1, y1, fill, stroke = INK, width = 1, extra = "") {
  return `<rect x="${f1(Math.min(x0, x1))}" y="${f1(Math.min(y0, y1))}" width="${f1(Math.abs(x1 - x0))}" height="${f1(Math.abs(y1 - y0))}" fill="${fill}" stroke="${stroke}" stroke-width="${f1(width)}" ${extra}/>`;
}

/** Force arrow centred on (x, y) with the label above its middle. */
function force(x, y, ux, uy, len, size, label) {
  const x1 = x - ux * len / 2, y1 = y - uy * len / 2, x2 = x + ux * len / 2, y2 = y + uy * len / 2;
  return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${LOAD}" stroke-width="${f1(size * 0.2)}"/>`
    + arrowHead(x2, y2, ux, uy, size * 1.2).replace(DIM, LOAD)
    + textAt(x, Math.min(y1, y2) - size * 0.8, label, size * 0.95, "middle", `font-weight="700" fill="${LOAD}"`).replace(`fill="${DIM}" `, "");
}

const fastenerName = g => g.fastener === "bolt" ? `bolts M${fmt(g.d)}` : g.fastener === "dowel" ? `dowels Ø${fmt(g.d)}` : g.fastener === "nail" ? `nails Ø${fmt(g.d)}` : `screws d${fmt(g.d)}`;

/**
 * Elevation of the lap: member 2 (inner) ends at x = 0 on the left and runs to the right, member 1 (outer) ends at the
 * right end of the group and runs to the left; grain horizontal. Forces as for a tension splice when endLoaded.
 */
export function timberTimberElevationSvg(g, result, title = "Elevation") {
  const Y = y => -y;
  const span = (g.perRow - 1) * g.a1;
  const xEnd1 = 2 * g.a3 + span;
  const ext = Math.max(0.6 * g.h, 0.5 * xEnd1, 3 * g.d);
  const size = Math.max(xEnd1 + 2 * ext, 1.6 * g.h) / 32;
  const xs = Array.from({ length: g.perRow }, (_, i) => g.a3 + i * g.a1);
  const ys = Array.from({ length: g.rows }, (_, j) => g.a4 + j * g.a2);
  const parts = [];
  // member 2 (inner / point side) from its end at x = 0 to the right
  parts.push(rect(0, Y(0), xEnd1 + ext, Y(g.h), WOOD_2, INK, size * 0.08));
  // member 1 (outer / head side) from its end at xEnd1 to the left, drawn in front, translucent
  parts.push(rect(-ext, Y(0), xEnd1, Y(g.h), WOOD, INK, size * 0.08, `fill-opacity="0.82"`));
  for (let k = 1; k <= 3; k++) parts.push(`<line x1="${f1(-ext + size)}" y1="${f1(Y(k * g.h / 4))}" x2="${f1(xEnd1 - size)}" y2="${f1(Y(k * g.h / 4))}" stroke="${WOOD_LINE}" stroke-width="${f1(size * 0.05)}"/>`);
  // member names in the bottom corners (the force labels sit above the arrows)
  parts.push(textAt(-ext + size * 0.6, Y(0) - size * 0.6, g.shear === "single" ? "member 1" : "outer members", size * 0.8, "start"));
  parts.push(textAt(xEnd1 + ext - size * 0.6, Y(0) - size * 0.6, g.shear === "single" ? "member 2" : "inner member", size * 0.8, "end"));
  const r = Math.max(g.d / 2, size * 0.25);
  for (const x of xs) for (const y of ys) parts.push(`<circle cx="${f1(x)}" cy="${f1(Y(y))}" r="${f1(r)}" fill="${BOLT}" stroke="${INK}" stroke-width="${f1(size * 0.05)}"/>`);
  // forces on the far ends: member 2 pulled away from its end (loaded end) or pushed towards it
  const a = g.alpha * Math.PI / 180, sign = g.endLoaded ? 1 : -1;
  // arrows inside the free part of each member (beyond the overlap), centred there
  const len = Math.min(0.7 * ext, Math.max(0.35 * g.h, 5 * size));
  const ux = sign * Math.cos(a), uy = -sign * Math.sin(a);
  parts.push(force(xEnd1 + ext / 2, Y(g.h / 2), ux, -uy, len, size, `F ${g.FEd} kN`));
  parts.push(force(-ext / 2, Y(g.h / 2), -ux, uy, len, size, g.shear === "single" ? "F" : "F/2 + F/2"));
  // dimensions along the grain below, across on the right
  const yChain = Y(0) + 2 * size;
  const stops = [0, ...xs, xEnd1];
  for (let i = 0; i < stops.length - 1; i++) {
    const label = i === 0 || i === stops.length - 2 ? `a3 ${fmt(g.a3)}` : `a1 ${fmt(g.a1)}`;
    parts.push(dimH(stops[i], stops[i + 1], yChain, Y(0) + size * 0.3, label, size * 0.8));
  }
  const xChain = xEnd1 + ext + 2.2 * size;
  const vstops = [0, ...ys, g.h];
  for (let j = 0; j < vstops.length - 1; j++) {
    const label = j === 0 ? `a4 ${fmt(g.a4)}` : j === vstops.length - 2 ? `${fmt(g.h - ys[ys.length - 1])}` : `a2 ${fmt(g.a2)}`;
    parts.push(dimV(Y(vstops[j]), Y(vstops[j + 1]), xChain, xEnd1 + ext + size * 0.3, label, size * 0.8));
  }
  parts.push(dimV(Y(0), Y(g.h), xChain + 6 * size, xChain + 4.5 * size, `h ${fmt(g.h)}`, size * 0.85));
  parts.push(textAt(xEnd1 / 2, Y(0) + 4.4 * size, `${g.endLoaded ? "loaded ends (tension splice)" : "unloaded ends"} · grain horizontal · α = ${fmt(g.alpha)}°`, size * 0.75));
  const vb = [-ext - 6 * size, Y(g.h) - 4 * size, xEnd1 + 2 * ext + 21 * size, g.h + 10 * size, size];
  return svg(vb, `${title} — ${g.rows} × ${g.perRow} ${fastenerName(g)}`, `${title}: lapped timber members with the fastener pattern and the forces`, parts.join("\n"));
}

/** Cross-section through a column of fasteners: members side by side across their thickness. */
export function timberTimberSectionSvg(g, result, title = "Cross-section") {
  const Y = y => -y;
  const single = g.shear === "single";
  const layers = single ? [{ t: g.t1, fill: WOOD, name: "1" }, { t: g.t2, fill: WOOD_2, name: "2" }]
    : [{ t: g.t1, fill: WOOD, name: "outer" }, { t: g.t2, fill: WOOD_2, name: "inner" }, { t: g.t1, fill: WOOD, name: "outer" }];
  const total = layers.reduce((sum, layer) => sum + layer.t, 0);
  const size = Math.max(total + 4 * g.d, g.h) / 22;
  const ys = Array.from({ length: g.rows }, (_, j) => g.a4 + j * g.a2);
  const parts = [];
  let x = -total / 2;
  const edges = [x];
  for (const layer of layers) {
    parts.push(rect(x, Y(0), x + layer.t, Y(g.h), layer.fill, INK, size * 0.08));
    x += layer.t;
    edges.push(x);
  }
  const nailLike = g.fastener === "nail" || g.fastener === "screw";
  // the fastener crosses all members (for nails and screws t2 is the point-side penetration in single shear)
  const x0 = -total / 2, x1 = total / 2;
  const ext = g.fastener === "bolt" ? 0.8 * g.d : 0;
  const shaft = Math.max(g.d, size * 0.25);
  for (const y of ys) {
    parts.push(rect(x0 - ext, Y(y - shaft / 2), x1 + ext, Y(y + shaft / 2), BOLT, "none", 0, `opacity="0.85"`));
    if (g.fastener === "bolt") for (const xb of [x0 - ext, x1]) parts.push(rect(xb, Y(y - 1.5 * g.d), xb + ext, Y(y + 1.5 * g.d), "#6b7682", INK, size * 0.04));
    if (nailLike) parts.push(rect(x0 - 0.35 * shaft - size * 0.15, Y(y - 1.2 * shaft), x0, Y(y + 1.2 * shaft), "#6b7682", INK, size * 0.04));
  }
  const yDim = Y(g.h) - 1.8 * size;
  for (let i = 0; i < layers.length; i++) parts.push(dimH(edges[i], edges[i + 1], yDim, Y(g.h) - size * 0.2, `${single ? `t${i + 1}` : i === 1 ? "t2" : "t1"} ${fmt(layers[i].t)}`, size * 0.8));
  const shear = single ? "single shear" : "double shear";
  parts.push(textAt(0, Y(0) + 2.4 * size, `${shear} · ${fastenerName(g)}`, size * 0.8));
  const vb = [-total / 2 - 2 * g.d - 5 * size, Y(g.h) - 4.2 * size, total + 4 * g.d + 10 * size, g.h + 4.2 * size + 4 * size, size];
  return svg(vb, title, `${title}: member thicknesses with the fasteners`, parts.join("\n"));
}
