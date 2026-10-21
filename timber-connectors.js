import {
  AXIAL_SCREW_FIELDS, TOOTHED_PLATE_FIELDS,
  normaliseFields, normaliseAxialScrewInput, normaliseToothedPlateInput, checkAxialScrew, checkToothedPlate
} from "./lib/index.js";
import { mountCheckPage } from "./check-page.js";
import { timberConnectorSvg } from "./timber-special-drawings.js";

const modeField = { name: "mode", group: "Connection", label: "Connection check", unit: "", kind: "select", options: ["axial-screw", "toothed-plate"], default: "axial-screw" };
const fields = [
  modeField,
  ...AXIAL_SCREW_FIELDS.map(field => ({ ...field, name: `s_${field.name}`, showIf: { mode: ["axial-screw"] } })),
  ...TOOTHED_PLATE_FIELDS.map(field => ({ ...field, name: `t_${field.name}`, showIf: { mode: ["toothed-plate"] } }))
];

function payload(values, prefix) {
  return Object.fromEntries(Object.entries(values).filter(([name]) => name.startsWith(prefix)).map(([name, value]) => [name.slice(prefix.length), value]));
}

function normalise(raw) {
  const checked = normaliseFields(raw, fields);
  if (!checked.ok) return checked;
  const values = checked.values;
  const mode = values.mode;
  const mapped = payload(values, mode === "axial-screw" ? "s_" : "t_");
  const result = mode === "axial-screw" ? normaliseAxialScrewInput(mapped) : normaliseToothedPlateInput(mapped);
  return result.ok ? { ok: true, input: { mode, input: result.input } } : result;
}

mountCheckPage({
  fields,
  normalise,
  check: state => state.mode === "axial-screw" ? { ...checkAxialScrew(state.input), mode: state.mode } : { ...checkToothedPlate(state.input), mode: state.mode },
  drawings: (state, result) => timberConnectorSvg(state, result)
});
