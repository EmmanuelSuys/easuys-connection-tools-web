// Plate in tension page: EN 1993-1-1 6.2.3 gross and net section while typing (no FE).
import { PLATE_TENSION_FIELDS, normalisePlateTensionInput, calculatePlateTension } from "./lib/index.js";
import { plateTensionPlanSvg } from "./steel-drawings.js";
import { mountCheckPage } from "./check-page.js";

mountCheckPage({
  fields: PLATE_TENSION_FIELDS,
  normalise: normalisePlateTensionInput,
  check: calculatePlateTension,
  drawings: (input, result) => plateTensionPlanSvg(input, result)
});
