// Steel-to-timber page: EN 1995-1-1 / EN 1993-1-8 check while typing.
import { STEEL_TIMBER_FIELDS, checkSteelTimber, normaliseSteelTimberInput } from "./lib/index.js";
import { steelTimberElevationSvg, steelTimberSectionSvg } from "./connection-drawings.js";
import { mountCheckPage } from "./check-page.js";

mountCheckPage({
  fields: STEEL_TIMBER_FIELDS,
  normalise: normaliseSteelTimberInput,
  check: checkSteelTimber,
  drawings: (input, result) => steelTimberElevationSvg(input, result) + steelTimberSectionSvg(input, result)
});
