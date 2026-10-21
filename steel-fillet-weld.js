// Fillet weld page: EN 1993-1-8 simplified or directional method while typing (no FE).
import { FILLET_WELD_FIELDS, normaliseFilletWeldInput, calculateFilletWeld } from "./lib/index.js";
import { filletWeldPlanSvg, filletWeldSectionSvg } from "./steel-drawings.js";
import { mountCheckPage } from "./check-page.js";

mountCheckPage({
  fields: FILLET_WELD_FIELDS,
  normalise: normaliseFilletWeldInput,
  check: calculateFilletWeld,
  drawings: (input, result) => filletWeldSectionSvg(input, result) + filletWeldPlanSvg(input, result)
});
