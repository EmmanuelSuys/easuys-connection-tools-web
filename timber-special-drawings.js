const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const wood = "#ead9b8", woodLine = "#986f3c", steel = "#b9c4cf", ink = "#243241", blue = "#1265a8", red = "#a63a2c";
const line = (x1, y1, x2, y2, color = ink, width = 2, dash = "") => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`;
const txt = (x, y, value, size = 15, anchor = "middle", color = ink, weight = 400) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(value)}</text>`;
const rect = (x, y, w, h, fill = wood, stroke = woodLine, width = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const arrow = (x1, y1, x2, y2, label) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${red}" stroke-width="3" marker-end="url(#arrow)"/>${txt((x1 + x2) / 2, (y1 + y2) / 2 - 10, label, 15, "middle", red, 700)}`;
const wrap = (title, body) => `<svg class="drawing" viewBox="0 0 720 340" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arrow" markerWidth="10" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L9,4 L0,8 Z" fill="${red}"/></marker><pattern id="hatch" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="9" stroke="#c1ad8e" stroke-width="2"/></pattern></defs><rect x="0" y="0" width="720" height="340" fill="#fff"/>${txt(360, 28, title, 19, "middle", ink, 700)}${body}</svg>`;

export function timberConnectorSvg(state, result) {
  const { mode, input } = state;
  if (mode === "axial-screw") {
    const n = Math.min(8, Math.max(1, Math.round(input.n)));
    const screws = Array.from({ length: n }, (_, i) => {
      const x = 190 + i * (340 / Math.max(1, n - 1));
      return `<line x1="${x}" y1="90" x2="${x}" y2="245" stroke="#677583" stroke-width="5"/><circle cx="${x}" cy="91" r="12" fill="${steel}" stroke="${ink}" stroke-width="2"/>`;
    }).join("");
    const body = `${rect(130, 76, 460, 188)}${screws}${arrow(360, 64, 360, 40, `F_ax,Ed ${input.FEd} kN`)}${txt(360, 296, `${n} screws | d ${input.d} mm | l_ef ${input.lef} mm`, 15)}${txt(360, 320, `Withdrawal, head pull-through and screw tension; governing ${result.governingMode}`, 13, "middle", ink, 600)}`;
    return wrap("Axially loaded screws in timber", body);
  }
  const n = Math.min(8, Math.max(1, Math.round(input.n)));
  const bolts = Array.from({ length: n }, (_, i) => {
    const x = 214 + (i % 4) * 96, y = i < 4 ? 135 : 213;
    return `<circle cx="${x}" cy="${y}" r="12" fill="#6b7784" stroke="${ink}" stroke-width="2"/>`;
  }).join("");
  const body = `${rect(75, 80, 230, 180)}${rect(415, 80, 230, 180)}${rect(326, 99, 68, 142, steel, ink, 2)}${line(326, 99, 394, 99, ink, 2)}${line(326, 241, 394, 241, ink, 2)}${bolts}${arrow(560, 52, 650, 52, `F_v,Ed ${input.FvEd} kN`)}${txt(190, 177, "member 1", 16)}${txt(530, 177, "member 2", 16)}${txt(360, 285, `${input.connectorType} toothed plates + ${n} connecting bolts`, 15)}${txt(360, 312, `bolt n_ef ${result.boltNef.toFixed(2)} | mode ${result.boltMode}`, 13, "middle", ink, 600)}`;
  return wrap("Toothed-plate connection in single shear", body);
}

export function contactMomentJointSvg(input, result) {
  const h = input.height;
  const rows = [input.y1, input.y2, input.y3, input.y4, input.y5, input.y6].filter(y => y !== undefined);
  const screws = rows.map(y => {
    const cy = 165 - (y / Math.max(1, h)) * 190;
    return Array.from({ length: Math.min(6, input.perRow) }, (_, j) => `<circle cx="${337 + j * 11}" cy="${cy}" r="4.5" fill="#657381"/>`).join("");
  }).join("");
  const neutral = result.analysis.state ? 165 - result.analysis.state.neutralAxis / Math.max(1, h) * 190 : 165;
  const body = `${rect(90, 62, 247, 208)}${rect(383, 62, 247, 208)}${line(360, 62, 360, 270, ink, 3)}${screws}${rect(338, 62, 44, 208, "url(#hatch)", "none", 0)}${line(325, neutral, 395, neutral, blue, 2, "7 5")}${arrow(220, 48, 145, 48, `M_Ed ${input.MEd} kNm`)}${txt(210, 302, `${input.grade} | interface ${input.width} x ${input.height} mm`, 14)}${txt(500, 302, `M_Rd ${result.MRdkNm.toFixed(2)} kNm`, 14, "middle", blue, 700)}${txt(360, 328, result.analysis.state ? `compression depth ${result.analysis.state.depth.toFixed(1)} mm | ${result.analysis.search.stoppingReason}` : "No feasible equilibrium state", 12)}`;
  return wrap("Timber contact moment joint", body);
}

export function etaBracketSvg(state, result) {
  const mode = state.mode;
  const input = state.data ?? state.input ?? state;
  const bracketCount = Math.max(1, Math.min(4, Number(input.brackets ?? 1)));
  const bracket = Array.from({ length: bracketCount }, (_, i) => {
    const x = 273 + i * (82 / Math.max(1, bracketCount - 1));
    return `<path d="M${x} 103 L${x} 225 L${x + 102} 225 L${x + 102} 201 L${x + 25} 201 L${x + 25} 103 Z" fill="${steel}" stroke="${ink}" stroke-width="3"/>`;
  }).join("");
  const supports = mode === "joist-hanger" ? `${rect(280, 75, 160, 178)}${rect(327, 88, 66, 165, wood, woodLine, 2)}` : `${rect(80, 90, 235, 170)}${rect(415, 90, 235, 170)}`;
  const force = mode === "joist-hanger" ? arrow(360, 57, 360, 34, `F_down ${input.FDown ?? 0} kN`) : arrow(570, 66, 644, 66, `F1 ${input.F1 ?? 0} kN`);
  const caption = mode === "configuration" ? `${result.configuration.product}: ${result.configuration.description}; ${result.configuration.source}` : `${input.product ?? "SBE80/150"} | ${mode} | ${input.pattern ?? "-"}`;
  return wrap("Proprietary ETA bracket or hanger", `${supports}${bracket}${force}${txt(360, 292, caption, 13)}${txt(360, 319, result.resistance ? `R1 ${result.resistance.R1.toFixed(2)} kN | R2/3 ${result.resistance.R23.toFixed(2)} kN` : "Exact ETA fastener configuration required", 13, "middle", blue, 600)}`);
}

export function masonryFixingSvg(input, result) {
  const wall = rect(230, 62, 290, 220, "url(#hatch)", "#8d806b", 2);
  const kind = input.kind;
  let details = "";
  if (kind === "hold-down") {
    details = `${rect(335, 112, 80, 166, wood, woodLine)}${arrow(375, 76, 375, 43, `N_Ed ${input.NEd} kN`)}${line(295, 276, 455, 276, blue, 3)}`;
  } else if (kind === "uplift-tie") {
    details = `${line(330, 238, 330, 135, "#697785", 8)}${line(330, 135, 425, 135, "#697785", 8)}${line(425, 135, 425, 238, "#697785", 8)}${arrow(375, 111, 375, 75, `N_Ed ${input.NEd} kN`)}`;
  } else if (kind === "bed-joint-slide") {
    details = `${line(230, 170, 520, 170, blue, 4, "10 5")}${arrow(192, 170, 130, 170, `H_Ed ${input.HEd} kN`)}`;
  } else {
    details = `${line(285, 205, 465, 205, "#697785", 10)}<circle cx="390" cy="205" r="13" fill="#566575"/>${arrow(390, 180, 390, 141, `V_Ed ${input.HEd ?? input.VAlong ?? 0} kN`)}`;
  }
  const kindLabel = { "pocket-pin": "grouted pocket pin", "bed-joint-slide": `bed-joint sliding ${input.direction}`, "crest-dowel": "crest dowel", "uplift-tie": "dead-weight uplift tie", "hold-down": "pocket hold-down" }[kind] ?? kind;
  return wrap("Fixing in existing masonry", `${wall}${details}${txt(360, 310, `${kindLabel} | R_d ${result.Rd.toFixed(2)} kN`, 15, "middle", ink, 700)}`);
}
