// Shared page controller for the beam-to-column, splice and double-sided web pages.
import { ENDPLATE_TYPES, checkEndPlate, normaliseEndPlateInput } from "./lib/index.js";
import { mountCheckPage } from "./check-page.js";
import { endPlateElevationSvg, endPlateSectionSvg } from "./endplate-drawings.js";
import { mountEndPlateFe } from "./endplate-fe.js";

const type = document.body.dataset.endplateType;
const page = ENDPLATE_TYPES[type];
if (!page) throw new Error(`Unknown end-plate page type: ${type}`);

const fe = mountEndPlateFe(type);
mountCheckPage({
  fields: page.fields,
  normalise: raw => normaliseEndPlateInput(type, raw),
  check: checkEndPlate,
  drawings: (input, result) => endPlateElevationSvg(input, result) + endPlateSectionSvg(input),
  onUpdate: (input, result) => fe.update(input, result)
});

// ?fe=run starts the FE check of the example once the page has loaded (page screenshots)
if (new URLSearchParams(location.search).get("fe") === "run") fe.run();
