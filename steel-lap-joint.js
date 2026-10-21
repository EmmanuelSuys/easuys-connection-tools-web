// Bolted lap joint page: EN 1993-1-8 check while typing, then the elastic
// bolt-force FE (membrane plates on bolt springs) in this browser.
import { LAP_JOINT_FIELDS, normaliseLapJointInput, calculateLapJoint, analyseLapJointFE, BOLT_CLASS_TABLE } from "./lib/index.js";
import { lapJointPlanSvg, lapJointSectionSvg } from "./steel-drawings.js";
import { mountCheckPage } from "./check-page.js";
import { createFePanel, lapFeHtml } from "./steel-fe-view.js";

const fe = createFePanel({
  build: (input, result, divisions) => ({
    t1: input.plate_t1_mm, t2: input.plate_t2_mm, b: input.plate_width_mm, d: input.bolt_diameter_mm,
    rows: input.num_rows, cols: input.num_cols, e1: input.e1_mm, p1: input.p1_mm ?? 0, p2: input.p2_mm ?? 0,
    F: input.force_uls_kn * 1000, fu: result.fu, fub: BOLT_CLASS_TABLE[result.input.boltClass].fub, divisions
  }),
  run: analyseLapJointFE,
  render: lapFeHtml
});

mountCheckPage({
  fields: LAP_JOINT_FIELDS,
  normalise: normaliseLapJointInput,
  check: input => { const result = calculateLapJoint(input); fe.update(input, result); return result; },
  drawings: (input, result) => lapJointPlanSvg(input, result) + lapJointSectionSvg(input, result)
});
