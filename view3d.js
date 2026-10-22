// 3D view of the FE result as an SVG string: deformed shells coloured by the
// equivalent plastic strain, bolts with their forces, the rigid support and
// the load. Orthographic projection with painter's sorting; no DOM access.

const STRAIN_LIMIT = 0.05; // informational plastic-strain colour scale

const f1 = value => Number(value.toFixed(2)).toString();

function mix(a, b, t) {
  return a.map((value, i) => Math.round(value + (b[i] - value) * t));
}

/** Colour for a plastic strain: grey-blue elastic, yellow → orange → red up to 5 %. */
export function strainColour(strain, region) {
  if (!(strain > 1e-6)) return region === 1 ? [168, 184, 202] : [196, 208, 221];
  const t = Math.min(1, strain / STRAIN_LIMIT);
  const stops = [[253, 230, 138], [245, 158, 11], [220, 38, 38]];
  return t < 0.4 ? mix(stops[0], stops[1], t / 0.4) : mix(stops[1], stops[2], (t - 0.4) / 0.6);
}

/** Full model: mirrors the half model about y = mirrorY when needed. */
export function expandField(field) {
  const nodes = [], disp = [];
  const count = field.nodes.length / 3;
  for (let i = 0; i < count; i++) {
    nodes.push([field.nodes[3 * i], field.nodes[3 * i + 1], field.nodes[3 * i + 2]]);
    disp.push([field.displacement[3 * i], field.displacement[3 * i + 1], field.displacement[3 * i + 2]]);
  }
  const quads = [];
  for (let e = 0; e < field.elements.length / 4; e++) {
    quads.push({ nodes: field.elements.slice(4 * e, 4 * e + 4), region: field.regions[e], strain: field.plasticStrain[e] });
  }
  if (field.mirrorY !== null && field.mirrorY !== undefined) {
    const m = field.mirrorY;
    for (let i = 0; i < count; i++) {
      nodes.push([nodes[i][0], 2 * m - nodes[i][1], nodes[i][2]]);
      disp.push([disp[i][0], -disp[i][1], disp[i][2]]);
    }
    const original = quads.length;
    for (let e = 0; e < original; e++) quads.push({ ...quads[e], nodes: quads[e].nodes.map(n => n + count).reverse() });
  }
  return { nodes, disp, quads, bolts: field.bolts };
}

export function maxDisplacement(field) {
  let max = 0;
  for (let i = 0; i < field.displacement.length; i += 3) {
    max = Math.max(max, Math.hypot(field.displacement[i], field.displacement[i + 1], field.displacement[i + 2]));
  }
  return max;
}

/** Displacement magnification so that the largest displacement shows as ~12 % of the flange width. */
export function autoScale(field, b) {
  const max = maxDisplacement(field);
  return max > 0 ? Math.max(1, Math.round((0.12 * b) / max)) : 1;
}

/**
 * view: { azimuth (deg), elevation (deg), scale (displacement factor),
 * showUndeformed (bool), b, hw, tf (mm, for support and arrow sizes) }.
 */
export function fieldSvg(field, view) {
  const model = expandField(field);
  const az = (view.azimuth * Math.PI) / 180, el = (view.elevation * Math.PI) / 180;
  const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
  let ymin = Infinity, ymax = -Infinity;
  for (const p of model.nodes) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
  const cy = (ymin + ymax) / 2;
  // screen (sx right, sy up), depth d (larger = farther away)
  const project = (x, y, z) => {
    const x1 = ca * x - sa * (y - cy);
    const y1 = sa * x + ca * (y - cy);
    return [x1, z * ce + y1 * se, y1 * ce - z * se];
  };
  const deformed = model.nodes.map((p, i) => {
    const u = model.disp[i];
    return project(p[0] + view.scale * u[0], p[1] + view.scale * u[1], p[2] + view.scale * u[2]);
  });
  const light = [0.35, -0.45, 0.82];
  const polys = model.quads.map(q => {
    const pts = q.nodes.map(n => deformed[n]);
    const depth = pts.reduce((s, p) => s + p[2], 0) / 4;
    // shading from the undeformed normal in world space
    const a = model.nodes[q.nodes[0]], b = model.nodes[q.nodes[1]], c = model.nodes[q.nodes[3]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    const shade = 0.72 + 0.28 * Math.abs((n[0] * light[0] + n[1] * light[1] + n[2] * light[2]) / len);
    const colour = strainColour(q.strain, q.region).map(value => Math.round(value * shade));
    return { pts, depth, colour, strain: q.strain };
  });
  polys.sort((p, q) => q.depth - p.depth);

  // extents
  let xmin = Infinity, xmax = -Infinity, smin = Infinity, smax = -Infinity;
  for (const p of deformed) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); smin = Math.min(smin, p[1]); smax = Math.max(smax, p[1]); }
  const span = Math.max(xmax - xmin, smax - smin);
  const pad = 0.16 * span;
  const stroke = span / 900;

  // rigid support plane under the flange (z = 0), drawn first
  const b2 = view.b / 2 * 1.25;
  const plane = [[-b2, ymin - 0.1 * (ymax - ymin)], [b2, ymin - 0.1 * (ymax - ymin)], [b2, ymax + 0.1 * (ymax - ymin)], [-b2, ymax + 0.1 * (ymax - ymin)]]
    .map(([x, y]) => project(x, y, -view.tf / 2));
  const parts = [];
  const columnSide = field.regions.includes(2);
  if (!columnSide) parts.push(`<polygon points="${plane.map(p => `${f1(p[0])},${f1(-p[1])}`).join(" ")}" fill="#e7ebef" stroke="#b6c0ca" stroke-width="${f1(stroke * 2)}"/>`);
  if (view.showUndeformed) {
    const und = model.nodes.map(p => project(p[0], p[1], p[2]));
    for (const q of model.quads) parts.push(`<polygon points="${q.nodes.map(n => `${f1(und[n][0])},${f1(-und[n][1])}`).join(" ")}" fill="none" stroke="#8a97a5" stroke-width="${f1(stroke)}" stroke-dasharray="${f1(stroke * 4)} ${f1(stroke * 3)}"/>`);
  }
  for (const p of polys) {
    parts.push(`<polygon points="${p.pts.map(q => `${f1(q[0])},${f1(-q[1])}`).join(" ")}" fill="rgb(${p.colour.join(",")})" stroke="#4d5b69" stroke-width="${f1(stroke)}" stroke-linejoin="round"/>`);
  }
  // bolts: from the flange (deformed) down through the support
  const nearest = (x, y) => {
    let best = 0, dist = Infinity;
    model.nodes.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y, p[2]); if (d < dist) { dist = d; best = i; } });
    return best;
  };
  const font = span / 32;
  for (const bolt of model.bolts) {
    const i = nearest(bolt.x, bolt.y);
    const topZ = view.tf / 2 + view.scale * model.disp[i][2] + 0.25 * view.hw * 0.4;
    const top = project(bolt.x, bolt.y, topZ);
    const columnNode = columnSide ? model.nodes.findIndex(p => Math.abs(p[0] - bolt.x) < 1e-6 && Math.abs(p[1] - bolt.y) < 1e-6 && p[2] < -1e-6) : -1;
    const bottom = columnNode >= 0 ? project(bolt.x, bolt.y, model.nodes[columnNode][2] + view.scale * model.disp[columnNode][2] - 0.25 * view.hw) : project(bolt.x, bolt.y, -view.tf / 2 - 0.25 * view.hw);
    const ratio = bolt.capacity > 0 ? bolt.force / bolt.capacity : 0;
    const colour = ratio >= 0.999 ? "#b91c1c" : "#374151";
    parts.push(`<line x1="${f1(top[0])}" y1="${f1(-top[1])}" x2="${f1(bottom[0])}" y2="${f1(-bottom[1])}" stroke="${colour}" stroke-width="${f1(stroke * 9)}" stroke-linecap="round"/>`);
    parts.push(`<text x="${f1(top[0])}" y="${f1(-top[1] - font * 0.5)}" font-size="${f1(font)}" text-anchor="middle" fill="${colour}" font-weight="700">${(bolt.force / 1000).toFixed(1)} kN</text>`);
  }
  // load arrow at the web top centre
  const webTop = Math.max(...model.nodes.map(p => p[2]));
  let topDisp = 0;
  model.nodes.forEach((p, i) => { if (Math.abs(p[2] - webTop) < 1e-6) topDisp = Math.max(topDisp, model.disp[i][2]); });
  const a0 = project(0, cy, webTop + view.scale * topDisp + 0.05 * view.hw);
  const a1 = project(0, cy, webTop + view.scale * topDisp + 0.45 * view.hw);
  parts.push(`<line x1="${f1(a0[0])}" y1="${f1(-a0[1])}" x2="${f1(a1[0])}" y2="${f1(-a1[1])}" stroke="#b03a2e" stroke-width="${f1(stroke * 7)}"/>`);
  parts.push(`<circle cx="${f1(a1[0])}" cy="${f1(-a1[1])}" r="${f1(stroke * 9)}" fill="#b03a2e"/>`);
  parts.push(`<text x="${f1(a1[0] + font * 0.6)}" y="${f1(-a1[1] + font * 0.35)}" font-size="${f1(font * 1.1)}" fill="#b03a2e" font-weight="700">F</text>`);

  let sTop = Math.max(smax, a1[1]);
  const vb = [xmin - pad, -sTop - pad, xmax - xmin + 2 * pad, sTop - smin + 2 * pad + font * 1.5];
  return `<svg class="view3d" viewBox="${vb.map(f1).join(" ")}" role="img" aria-label="Deformed FE model, displacements magnified ${view.scale} times, coloured by plastic strain" font-family="Arial, Helvetica, sans-serif">
${parts.join("\n")}
</svg>`;
}

/** Colour legend (HTML) for the plastic strain colours. */
export function strainLegendHtml() {
  const swatch = (rgb, label) => `<span class="swatch" style="background:rgb(${rgb.join(",")})"></span>${label}`;
  return `<div class="legend">${swatch(strainColour(0, 0), "elastic")} ${swatch(strainColour(0.0005, 0), "0.05 %")} ${swatch(strainColour(0.01, 0), "1 %")} ${swatch(strainColour(0.025, 0), "2.5 %")} ${swatch(strainColour(0.05, 0), "≥ 5 % (information)")} — equivalent plastic strain</div>`;
}
