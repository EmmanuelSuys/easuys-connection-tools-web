// Timber-to-timber page: EN 1995-1-1 check while typing, and the FE verification of one fastener.
import { TIMBER_TIMBER_FIELDS, checkTimberTimber, normaliseTimberTimberInput } from "./lib/index.js";
import { timberTimberElevationSvg, timberTimberSectionSvg } from "./timber-timber-drawings.js";
import { mountCheckPage } from "./check-page.js";
import { mountDowelFePanel } from "./dowel-fe-panel.js";
import { timberTimberFeJob } from "./dowel-fe-jobs.js";

const panel = mountDowelFePanel(document.querySelector("[data-dowel-fe]"), timberTimberFeJob);

mountCheckPage({
  fields: TIMBER_TIMBER_FIELDS,
  normalise: raw => {
    const normalised = normaliseTimberTimberInput(raw);
    if (!normalised.ok) panel.invalidate();
    return normalised;
  },
  check: input => {
    const result = checkTimberTimber(input);
    panel.update(input, result);
    return result;
  },
  drawings: (input, result) => timberTimberElevationSvg(input, result) + timberTimberSectionSvg(input, result)
});
