// Bolt group under in-plane eccentric load: EN 1993-1-8 check per bolt while
// typing, then the elastic FE of the plate on bolt springs in this browser.
import { BOLT_GROUP_FIELDS, normaliseBoltGroupInput, calculateBoltGroup, analyseBoltGroupFE, BOLT_CLASS_TABLE } from "./lib/index.js";
import { boltGroupElevationSvg } from "./steel-drawings.js";
import { mountCheckPage } from "./check-page.js";
import { createFePanel, groupFeHtml } from "./steel-fe-view.js";

const fe = createFePanel({
  build: (input, result, divisions) => ({
    t: input.plate_thickness_mm, d: input.bolt_diameter_mm, rows: input.num_rows, cols: input.num_cols,
    pitchX: input.pitch_x_mm ?? 0, pitchZ: input.pitch_z_mm ?? 0,
    edgeTop: input.edge_top_mm, edgeBottom: input.edge_bottom_mm, edgeLeft: input.edge_left_mm, edgeRight: input.edge_right_mm,
    Vx: (input.shear_force_x_kn ?? 0) * 1000, Vz: (input.shear_force_z_kn ?? 0) * 1000, T: (input.torsion_moment_knm ?? 0) * 1e6,
    fu: result.fu, fub: BOLT_CLASS_TABLE[result.input.boltClass].fub, divisions
  }),
  run: analyseBoltGroupFE,
  render: groupFeHtml
});

mountCheckPage({
  fields: BOLT_GROUP_FIELDS,
  normalise: normaliseBoltGroupInput,
  check: input => { const result = calculateBoltGroup(input); fe.update(input, result); return result; },
  drawings: (input, result) => boltGroupElevationSvg(input, result)
});
