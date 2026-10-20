// Dimensioned drawings of the T-stub (cross-section and plan) as SVG strings.
// Pure functions without DOM access: used by the page and by the report.

const INK = "#1f2a36";
const STEEL = "#c9d3de";
const STEEL_DARK = "#9fb0c2";
const BOLT = "#56616d";
const DIM = "#2f5f8f";
let drawingCounter = 0;

/** Colours shared with the other connection drawings. */
export const PALETTE = { INK, STEEL, STEEL_DARK, BOLT, DIM };

/** Unique id for SVG patterns when several drawings share a page. */
export function nextDrawingId(prefix) { drawingCounter += 1; return `${prefix}-${drawingCounter}`; }

export const f1 = value => Number(value.toFixed(1)).toString();
export const fmt = value => (Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value).toString() : value.toFixed(1));

export function textAt(x, y, label, size, anchor = "middle", extra = "") {
  return `<text x="${f1(x)}" y="${f1(y)}" font-size="${f1(size)}" text-anchor="${anchor}" fill="${DIM}" ${extra}>${label}</text>`;
}

export function arrowHead(x, y, dx, dy, size) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const bx = x - ux * size, by = y - uy * size;
  const px = -uy * size * 0.35, py = ux * size * 0.35;
  return `<path d="M${f1(x)},${f1(y)} L${f1(bx + px)},${f1(by + py)} L${f1(bx - px)},${f1(by - py)} Z" fill="${DIM}"/>`;
}

/** Horizontal dimension between x1 and x2 at height y; ext lines from yFrom. */
export function dimH(x1, x2, y, yFrom, label, size) {
  if (Math.abs(x2 - x1) < 1e-9) return "";
  const a = size * 0.9;
  const inside = Math.abs(x2 - x1) > 2.4 * a;
  const ext = `<line x1="${f1(x1)}" y1="${f1(yFrom)}" x2="${f1(x1)}" y2="${f1(y + size * 0.4)}" stroke="${DIM}" stroke-width="${f1(size * 0.06)}"/>`
    + `<line x1="${f1(x2)}" y1="${f1(yFrom)}" x2="${f1(x2)}" y2="${f1(y + size * 0.4)}" stroke="${DIM}" stroke-width="${f1(size * 0.06)}"/>`;
  const line = `<line x1="${f1(x1)}" y1="${f1(y)}" x2="${f1(x2)}" y2="${f1(y)}" stroke="${DIM}" stroke-width="${f1(size * 0.07)}"/>`;
  const heads = inside ? arrowHead(x1, y, x1 - x2, 0, a) + arrowHead(x2, y, x2 - x1, 0, a)
    : arrowHead(x1, y, x2 - x1, 0, a) + arrowHead(x2, y, x1 - x2, 0, a);
  return ext + line + heads + textAt((x1 + x2) / 2, y - size * 0.35, label, size);
}

/** Vertical dimension between y1 and y2 at x; ext lines from xFrom. */
export function dimV(y1, y2, x, xFrom, label, size) {
  if (Math.abs(y2 - y1) < 1e-9) return "";
  const a = size * 0.9;
  const inside = Math.abs(y2 - y1) > 2.4 * a;
  const ext = `<line x1="${f1(xFrom)}" y1="${f1(y1)}" x2="${f1(x + size * 0.4)}" y2="${f1(y1)}" stroke="${DIM}" stroke-width="${f1(size * 0.06)}"/>`
    + `<line x1="${f1(xFrom)}" y1="${f1(y2)}" x2="${f1(x + size * 0.4)}" y2="${f1(y2)}" stroke="${DIM}" stroke-width="${f1(size * 0.06)}"/>`;
  const line = `<line x1="${f1(x)}" y1="${f1(y1)}" x2="${f1(x)}" y2="${f1(y2)}" stroke="${DIM}" stroke-width="${f1(size * 0.07)}"/>`;
  const heads = inside ? arrowHead(x, y1, 0, y1 - y2, a) + arrowHead(x, y2, 0, y2 - y1, a)
    : arrowHead(x, y1, 0, y2 - y1, a) + arrowHead(x, y2, 0, y1 - y2, a);
  return ext + line + heads + textAt(x + size * 0.45, (y1 + y2) / 2 + size * 0.35, label, size, "start");
}

/**
 * Cross-section (x across, z up; SVG y = -z). g: L, b, tw, hw, tf, m, nb;
 * bolt: d, d0, s, dw (mm).
 */
export function tstubSectionSvg(g, bolt, title = "Section") {
  const xb = g.tw / 2 + g.m;
  const e = g.b / 2 - xb;
  const hb = Math.max(1.2 * g.tf, 20);              // rigid support (drawn)
  const washer = Math.max(2, 0.15 * bolt.d);
  const nutH = 0.8 * bolt.d, headH = 0.65 * bolt.d, protrude = 0.35 * bolt.d;
  const top = g.tf + g.hw;
  const width = g.b + 2 * Math.max(0.35 * g.b, 40);
  const size = Math.max(width, top + hb) / 30;      // text size in mm
  const arrow = Math.max(0.18 * g.hw, 4 * size);
  const zMin = -hb - washer - headH - 4.2 * size;
  const zMax = top + arrow + 2.2 * size;
  const xMin = -width / 2, xMax = width / 2 + 3 * size;
  const Y = z => -z;
  const parts = [];
  // support with hatching
  const sx0 = -g.b / 2 - 0.25 * g.b, sx1 = g.b / 2 + 0.25 * g.b;
  const hatchId = `hatch-${(drawingCounter += 1)}`;
  parts.push(`<rect x="${f1(sx0)}" y="${f1(Y(0))}" width="${f1(sx1 - sx0)}" height="${f1(hb)}" fill="url(#${hatchId})" stroke="${INK}" stroke-width="${f1(size * 0.08)}"/>`);
  // flange and web
  parts.push(`<rect x="${f1(-g.b / 2)}" y="${f1(Y(g.tf))}" width="${f1(g.b)}" height="${f1(g.tf)}" fill="${STEEL}" stroke="${INK}" stroke-width="${f1(size * 0.1)}"/>`);
  parts.push(`<rect x="${f1(-g.tw / 2)}" y="${f1(Y(top))}" width="${f1(g.tw)}" height="${f1(g.hw)}" fill="${STEEL_DARK}" stroke="${INK}" stroke-width="${f1(size * 0.1)}"/>`);
  // bolts: shank through flange and support, washer + nut on top, washer + head below
  for (const side of [-1, 1]) {
    const x = side * xb;
    parts.push(`<rect x="${f1(x - bolt.d / 2)}" y="${f1(Y(g.tf + washer + nutH + protrude))}" width="${f1(bolt.d)}" height="${f1(g.tf + washer + nutH + protrude + hb + washer)}" fill="${BOLT}" opacity="0.85"/>`);
    parts.push(`<rect x="${f1(x - bolt.dw / 2)}" y="${f1(Y(g.tf + washer))}" width="${f1(bolt.dw)}" height="${f1(washer)}" fill="#7d8894" stroke="${INK}" stroke-width="${f1(size * 0.05)}"/>`);
    parts.push(`<rect x="${f1(x - bolt.s / 2)}" y="${f1(Y(g.tf + washer + nutH))}" width="${f1(bolt.s)}" height="${f1(nutH)}" fill="#6b7682" stroke="${INK}" stroke-width="${f1(size * 0.06)}"/>`);
    parts.push(`<rect x="${f1(x - bolt.dw / 2)}" y="${f1(Y(-hb))}" width="${f1(bolt.dw)}" height="${f1(washer)}" fill="#7d8894" stroke="${INK}" stroke-width="${f1(size * 0.05)}"/>`);
    parts.push(`<rect x="${f1(x - bolt.s / 2)}" y="${f1(Y(-hb - washer))}" width="${f1(bolt.s)}" height="${f1(headH)}" fill="#6b7682" stroke="${INK}" stroke-width="${f1(size * 0.06)}"/>`);
    parts.push(`<line x1="${f1(x)}" y1="${f1(Y(g.tf + washer + nutH + protrude + size))}" x2="${f1(x)}" y2="${f1(Y(-hb - washer - headH - size))}" stroke="${INK}" stroke-width="${f1(size * 0.05)}" stroke-dasharray="${f1(size * 0.6)} ${f1(size * 0.25)} ${f1(size * 0.1)} ${f1(size * 0.25)}"/>`);
  }
  // load
  parts.push(`<line x1="0" y1="${f1(Y(top))}" x2="0" y2="${f1(Y(top + arrow))}" stroke="#b03a2e" stroke-width="${f1(size * 0.22)}"/>`);
  parts.push(arrowHead(0, Y(top + arrow + size * 0.2), 0, -1, size * 1.3).replace(DIM, "#b03a2e"));
  parts.push(textAt(size * 0.8, Y(top + arrow * 0.6), "F", size * 1.2, "start", `font-weight="700" fill="#b03a2e"`).replace(`fill="${DIM}" `, ""));
  // dimensions: chain e | m | tw | m | e and overall b below; tf, hw on the right
  const yChain = Y(-hb - washer - headH - 1.6 * size);
  const yTotal = yChain + 2.2 * size;
  const yFrom = Y(-hb) + size * 0.3;
  const xs = [-g.b / 2, -xb, -g.tw / 2, g.tw / 2, xb, g.b / 2];
  const labels = [`e ${fmt(e)}`, `m ${fmt(g.m)}`, `${fmt(g.tw)}`, `m ${fmt(g.m)}`, `e ${fmt(e)}`];
  for (let i = 0; i < 5; i++) parts.push(dimH(xs[i], xs[i + 1], yChain, yFrom, labels[i], size * 0.85));
  parts.push(dimH(-g.b / 2, g.b / 2, yTotal, yChain, `b ${fmt(g.b)}`, size * 0.9));
  const xRight = g.b / 2 + 1.6 * size;
  parts.push(dimV(Y(0), Y(g.tf), xRight, g.b / 2 + size * 0.3, `tf ${fmt(g.tf)}`, size * 0.85));
  parts.push(dimV(Y(g.tf), Y(top), xRight, g.tw / 2 + size * 0.3, `hw ${fmt(g.hw)}`, size * 0.85));
  const vb = [xMin, Y(zMax), xMax - xMin, zMax - zMin + 1.2 * size];
  return `<svg class="drawing" viewBox="${vb.map(f1).join(" ")}" role="img" aria-label="${title}: T-stub cross-section with dimensions" font-family="Arial, Helvetica, sans-serif">
<defs><pattern id="${hatchId}" patternUnits="userSpaceOnUse" width="${f1(size)}" height="${f1(size)}" patternTransform="rotate(45)"><rect width="${f1(size)}" height="${f1(size)}" fill="#eef1f4"/><line x1="0" y1="0" x2="0" y2="${f1(size)}" stroke="#9aa6b2" stroke-width="${f1(size * 0.12)}"/></pattern></defs>
${textAt(xMin + size * 0.2, Y(zMax) + size * 1.2, title, size, "start", `font-weight="700" fill="${INK}"`).replace(`fill="${DIM}" `, "")}
${parts.join("\n")}
</svg>`;
}

/** Plan of the flange (x across, y along the length, downwards). */
export function tstubPlanSvg(g, bolt, positionsY, title = "Plan") {
  const xb = g.tw / 2 + g.m;
  const width = g.b + 2 * Math.max(0.35 * g.b, 40);
  const size = Math.max(width, 0.6 * g.L) / 30;   // text size follows the width, as in the section
  const xMin = -width / 2, xMax = width / 2 + 6 * size;
  const yMin = -3 * size, yMax = g.L + 4.2 * size;
  const parts = [];
  parts.push(`<rect x="${f1(-g.b / 2)}" y="0" width="${f1(g.b)}" height="${f1(g.L)}" fill="${STEEL}" stroke="${INK}" stroke-width="${f1(size * 0.1)}"/>`);
  parts.push(`<rect x="${f1(-g.tw / 2)}" y="0" width="${f1(g.tw)}" height="${f1(g.L)}" fill="${STEEL_DARK}" stroke="${INK}" stroke-width="${f1(size * 0.08)}"/>`);
  for (const side of [-1, 1]) for (const y of positionsY) {
    const x = side * xb;
    parts.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(bolt.dw / 2)}" fill="none" stroke="${BOLT}" stroke-width="${f1(size * 0.06)}" stroke-dasharray="${f1(size * 0.35)} ${f1(size * 0.2)}"/>`);
    parts.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(bolt.d0 / 2)}" fill="#ffffff" stroke="${INK}" stroke-width="${f1(size * 0.09)}"/>`);
    parts.push(`<line x1="${f1(x - bolt.dw / 2 - size * 0.4)}" y1="${f1(y)}" x2="${f1(x + bolt.dw / 2 + size * 0.4)}" y2="${f1(y)}" stroke="${INK}" stroke-width="${f1(size * 0.04)}"/>`);
    parts.push(`<line x1="${f1(x)}" y1="${f1(y - bolt.dw / 2 - size * 0.4)}" x2="${f1(x)}" y2="${f1(y + bolt.dw / 2 + size * 0.4)}" stroke="${INK}" stroke-width="${f1(size * 0.04)}"/>`);
  }
  parts.push(dimH(-g.b / 2, g.b / 2, g.L + 2.4 * size, g.L + size * 0.3, `b ${fmt(g.b)}`, size * 0.9));
  // along the length: e1 | p ... | e1 at the right, L overall further right
  const xChain = g.b / 2 + 1.8 * size;
  const stops = [0, ...positionsY, g.L];
  for (let i = 0; i < stops.length - 1; i++) {
    const label = i === 0 || i === stops.length - 2 ? `e1 ${fmt(stops[i + 1] - stops[i])}` : `p ${fmt(stops[i + 1] - stops[i])}`;
    parts.push(dimV(stops[i], stops[i + 1], xChain, i === 0 || i === stops.length - 2 ? g.b / 2 + size * 0.3 : xb + bolt.dw / 2, label, size * 0.8));
  }
  parts.push(dimV(0, g.L, xChain + 6.2 * size, xChain + size * 0.8, `L ${fmt(g.L)}`, size * 0.9));
  const vb = [xMin, yMin, xMax - xMin + 6 * size, yMax - yMin];
  return `<svg class="drawing" viewBox="${vb.map(f1).join(" ")}" role="img" aria-label="${title}: flange plan with bolt positions" font-family="Arial, Helvetica, sans-serif">
${textAt(xMin + size * 0.2, yMin + size * 1.4, title, size, "start", `font-weight="700" fill="${INK}"`).replace(`fill="${DIM}" `, "")}
${parts.join("\n")}
</svg>`;
}
