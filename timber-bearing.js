// Timber bearing page: EN 1995-1-1 / EN 1996-1-1 check while typing.
import { TIMBER_BEARING_FIELDS, checkTimberBearing, normaliseTimberBearingInput } from "./lib/index.js";
import { timberBearingSvg } from "./connection-drawings.js";
import { mountCheckPage } from "./check-page.js";

mountCheckPage({
  fields: TIMBER_BEARING_FIELDS,
  normalise: normaliseTimberBearingInput,
  check: checkTimberBearing,
  drawings: (input, result) => timberBearingSvg(input, result)
});
