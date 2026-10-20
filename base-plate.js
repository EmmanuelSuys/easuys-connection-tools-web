// Column base page: EN 1993-1-8 / EN 1992-4 check while typing (no FE).
import { BASE_PLATE_FIELDS, checkBasePlate, normaliseBasePlateInput } from "./lib/index.js";
import { basePlatePlanSvg, basePlateSectionSvg } from "./connection-drawings.js";
import { mountCheckPage } from "./check-page.js";

mountCheckPage({
  fields: BASE_PLATE_FIELDS,
  normalise: normaliseBasePlateInput,
  check: checkBasePlate,
  drawings: (input, result) => basePlatePlanSvg(input, result) + basePlateSectionSvg(input, result)
});
