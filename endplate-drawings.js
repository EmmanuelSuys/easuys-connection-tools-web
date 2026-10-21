// Live schematic elevation and section views for the three EC3 end-plate pages.
// These drawings explain the entered geometry; they are not fabrication drawings.
const ink = "#27323b";
const steel = "#dbe3ea";
const steelDark = "#9aa9b6";
const plate = "#c4d2de";
const bolt = "#344c61";
const tension = "#bd604c";

const f = value => Number(value.toFixed(1));
const esc = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
const rect = (x, y, width, height, fill, extra = "") =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(width)}" height="${f(height)}" fill="${fill}" stroke="${ink}" stroke-width="1.4" ${extra}/>`;
const line = (x1, y1, x2, y2, color = ink, width = 1.5, dash = "") =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
const text = (x, y, value, size = 12, anchor = "start", color = ink, weight = "400") =>
  `<text x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="${color}" font-weight="${weight}">${esc(value)}</text>`;
const circle = (x, y, radius, fill = "#fff") =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${f(radius)}" fill="${fill}" stroke="${bolt}" stroke-width="2"/>`;

function wrapSvg(label, body, height = 420) {
  return `<svg class="drawing" viewBox="0 0 720 ${height}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="720" height="${height}" fill="#fff"/>
    ${body}
  </svg>`;
}

function beamStub(x1, x2, top, bottom, section, opacity = 1) {
  const h = Math.max(2, bottom - top);
  const flangeH = Math.max(4, Math.min(11, section.tf * (h / section.h)));
  return `<g opacity="${opacity}">
    ${rect(x1, top, x2 - x1, h, steel)}
    ${rect(x1, top, x2 - x1, flangeH, steelDark)}
    ${rect(x1, bottom - flangeH, x2 - x1, flangeH, steelDark)}
    ${line(x1, top + h / 2, x2, top + h / 2, "#71818e", 1, "5 4")}
  </g>`;
}

function verticalMember(x, y, width, height, section, labelText) {
  const flange = Math.max(10, Math.min(24, section.tf * 0.8));
  const webX = x + width / 2 - Math.max(5, Math.min(10, section.tw * 0.55));
  return `${rect(x, y, width, height, steel)}
    ${rect(x, y, flange, height, steelDark)}
    ${rect(x + width - flange, y, flange, height, steelDark)}
    ${rect(webX, y, Math.max(6, width - 2 * (webX - x)), height, "#bcc9d3", "opacity=\"0.65\"")}
    ${text(x + width / 2, y + height + 18, labelText, 11, "middle", ink, "700")}`;
}

/** Elevation with plate outline, the beam(s), two bolts per row and live row labels. */
export function endPlateElevationSvg(input, result) {
  const { type, values } = input;
  const section = input.beam;
  const plateH = Number(values.hp);
  const maxH = Math.max(plateH, section.h, input.column?.h ?? 0, input.primary?.h ?? 0);
  const scale = Math.min(0.42, 300 / maxH);
  const drawnPlateH = plateH * scale;
  const plateW = Math.max(70, Math.min(160, Number(values.bp) * scale));
  const plateX = 300;
  const plateY = 75 + Math.max(0, (300 - drawnPlateH) / 2);
  const plateBottom = plateY + drawnPlateH;
  const beamBottom = type === "web" ? plateBottom : plateBottom - Math.max(0, (plateH - section.h) * scale / 2);
  const beamTop = beamBottom - section.h * scale;
  const plateMid = plateX + plateW / 2;
  const boltOffset = Math.min(plateW * 0.36, Number(values.w) * scale / 2);
  const radius = Math.max(4, Math.min(8, Number(values.boltSize.slice(1)) * scale * 0.38));
  const body = [];

  body.push(text(28, 28, "Elevation — bolt rows and end plate", 16, "start", ink, "700"));
  body.push(rect(plateX, plateY, plateW, drawnPlateH, plate));

  if (type === "splice") {
    body.push(beamStub(52, plateX, beamTop, beamBottom, section));
    body.push(beamStub(plateX + plateW, 668, beamTop, beamBottom, section));
    body.push(line(plateMid, plateY, plateMid, plateBottom, "#657583", 1.2, "5 4"));
    body.push(text(160, beamTop - 12, `${section.profile} — beam A`, 11, "middle"));
    body.push(text(548, beamTop - 12, `${section.profile} — beam B`, 11, "middle"));
    body.push(text(plateMid, plateY - 10, "paired end plates", 11, "middle", ink, "700"));
  } else if (type === "web") {
    body.push(beamStub(52, plateX, beamTop, beamBottom, section));
    body.push(beamStub(plateX + plateW, 455, beamTop, beamBottom, section, 0.45));
    body.push(verticalMember(plateX + plateW + 32, 52, 78, 316, input.primary, "Primary beam web"));
    body.push(text(156, beamTop - 12, `${section.profile} secondary ×2`, 11, "middle"));
    body.push(text(550, beamTop + 22, "opposite side shown light", 10, "middle", "#63717c"));
  } else {
    body.push(beamStub(52, plateX, beamTop, beamBottom, section));
    body.push(verticalMember(plateX + plateW + 34, 52, 84, 316, input.column, `${input.column.profile} column`));
    body.push(text(160, beamTop - 12, `${section.profile} beam`, 11, "middle"));
  }

  body.push(text(plateMid, plateY - 10, `End plate ${f(Number(values.bp))} × ${f(plateH)} mm`, 11, "middle", ink, "700"));
  const rowDetails = (result.route.resistance?.per_row ?? []).map(row => ({ id: row.row_id, y: row.vertical_position_mm }));
  for (const row of rowDetails) {
    const cy = plateBottom - row.y * scale;
    const beamBottomOffset = type === "web" ? 0 : (plateH - section.h) / 2;
    const tensionLimit = beamBottomOffset + section.tf / 2;
    const color = row.y > tensionLimit ? tension : bolt;
    body.push(circle(plateMid - boltOffset, cy, radius, "#fff"));
    body.push(circle(plateMid + boltOffset, cy, radius, "#fff"));
    body.push(text(plateX + plateW + 8, cy + 4, `R${row.id}  y ${f(row.y)} mm`, 10, "start", color, "700"));
  }
  body.push(line(plateMid - boltOffset, plateBottom + 22, plateMid + boltOffset, plateBottom + 22, "#687783", 1));
  body.push(line(plateMid - boltOffset, plateBottom + 16, plateMid - boltOffset, plateBottom + 27, "#687783", 1));
  body.push(line(plateMid + boltOffset, plateBottom + 16, plateMid + boltOffset, plateBottom + 27, "#687783", 1));
  body.push(text(plateMid, plateBottom + 39, `gauge w = ${f(Number(values.w))} mm`, 10, "middle"));
  body.push(text(29, 400, "Two bolts per row · live geometry schematic · not a fabrication drawing", 10, "start", "#56636d"));
  return wrapSvg("End-plate connection elevation showing the beam, plate and two bolts at each tension row", body.join("\n"));
}

/** Section across the clamped parts and bolt grip, with one live bolt line per row. */
export function endPlateSectionSvg(input) {
  const body = [];
  const rows = input.rows;
  const maxY = Math.max(...rows.map(row => row.y), 1);
  const yFor = (row, i) => rows.length === 1 ? 130 : 58 + (row.y / maxY) * 126 + (i % 2) * 1.5;
  const label = input.type === "column" ? "Section — beam end plate to column flange" : input.type === "splice" ? "Section — paired splice plates" : "Section — through-bolts clamp the primary web";
  body.push(text(28, 28, label, 16, "start", ink, "700"));

  if (input.type === "column") {
    body.push(rect(58, 72, 232, 116, steel));
    body.push(rect(58, 72, 232, 18, steelDark));
    body.push(rect(58, 170, 232, 18, steelDark));
    body.push(text(160, 207, `${input.beam.profile} beam`, 11, "middle", ink, "700"));
    body.push(rect(290, 58, 16, 144, plate));
    body.push(rect(430, 52, 18, 156, steelDark));
    body.push(rect(448, 52, 196, 156, steel));
    body.push(text(438, 226, "column flange", 11, "middle", ink, "700"));
  } else if (input.type === "splice") {
    body.push(rect(48, 72, 226, 116, steel));
    body.push(rect(48, 72, 226, 18, steelDark));
    body.push(rect(48, 170, 226, 18, steelDark));
    body.push(rect(274, 58, 18, 144, plate));
    body.push(rect(428, 58, 18, 144, plate));
    body.push(rect(446, 72, 226, 116, steel));
    body.push(rect(446, 72, 226, 18, steelDark));
    body.push(rect(446, 170, 226, 18, steelDark));
    body.push(text(160, 218, "Beam A", 11, "middle", ink, "700"));
    body.push(text(558, 218, "Beam B", 11, "middle", ink, "700"));
    body.push(text(360, 45, "end plates", 10, "middle", ink, "700"));
  } else {
    body.push(rect(55, 72, 198, 116, steel));
    body.push(rect(55, 72, 198, 18, steelDark));
    body.push(rect(55, 170, 198, 18, steelDark));
    body.push(rect(253, 58, 16, 144, plate));
    body.push(rect(352, 48, 16, 164, steelDark));
    body.push(rect(431, 58, 16, 144, plate));
    body.push(rect(447, 72, 218, 116, steel));
    body.push(rect(447, 72, 218, 18, steelDark));
    body.push(rect(447, 170, 218, 18, steelDark));
    body.push(text(153, 218, "Secondary beam", 11, "middle", ink, "700"));
    body.push(text(540, 218, "Secondary beam", 11, "middle", ink, "700"));
    body.push(text(360, 38, "primary web", 10, "middle", ink, "700"));
  }

  const leftBolt = input.type === "web" ? 253 : input.type === "splice" ? 274 : 290;
  const rightBolt = input.type === "web" ? 447 : input.type === "splice" ? 446 : 430;
  for (let i = 0; i < rows.length; i++) {
    const y = yFor(rows[i], i);
    body.push(line(leftBolt - 8, y, rightBolt + 8, y, bolt, 4));
    body.push(rect(leftBolt - 13, y - 6, 8, 12, bolt));
    body.push(rect(rightBolt + 5, y - 6, 8, 12, bolt));
    body.push(text(682, y + 4, `R${rows[i].id}`, 10, "end", bolt, "700"));
  }
  body.push(text(28, 240, `Bolt grip includes the clamped plies; plate ${f(Number(input.values.tp))} mm; ${input.rows.length} active row${input.rows.length === 1 ? "" : "s"}`, 10, "start", "#56636d"));
  return wrapSvg(`${label}; bolts pass through the clamped steel parts`, body.join("\n"), 250);
}
