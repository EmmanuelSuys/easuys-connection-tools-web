// Steel-to-timber page: EN 1995-1-1 / EN 1993-1-8 check while typing, and the FE verification of one fastener.
import { STEEL_TIMBER_FIELDS, checkSteelTimber, normaliseSteelTimberInput } from "./lib/index.js";
import { steelTimberElevationSvg, steelTimberSectionSvg } from "./connection-drawings.js";
import { mountCheckPage } from "./check-page.js";
import { mountDowelFePanel } from "./dowel-fe-panel.js";
import { steelTimberFeJob } from "./dowel-fe-jobs.js";

const panel = mountDowelFePanel(document.querySelector("[data-dowel-fe]"), steelTimberFeJob);

mountCheckPage({
  fields: STEEL_TIMBER_FIELDS,
  normalise: raw => {
    const normalised = normaliseSteelTimberInput(raw);
    if (!normalised.ok) panel.invalidate();
    return normalised;
  },
  check: input => {
    const result = checkSteelTimber(input);
    panel.update(input, result);
    return result;
  },
  drawings: (input, result) => steelTimberElevationSvg(input, result) + steelTimberSectionSvg(input, result)
});
