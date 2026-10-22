// FE check of the end-plate tension zone for the end-plate pages: validation, analysis and report,
// without DOM access, so the module runs in a Web Worker and in Node tests alike.
import {
  analyseEndPlateFe,
  canonicalJson,
  CONNECTIONS_VERSION,
  ENDPLATE_FE_MAX_DOF,
  ENDPLATE_TYPES,
  EndPlateFeError,
  endPlateFeSize,
  evaluateEndPlatePage,
  renderEndPlateFeReport,
  sha256Hex,
  TOOL_NAME
} from "./lib/index.js";
import { autoScale, fieldSvg, strainLegendHtml } from "./view3d.js";

export const FE_MESH_SIZES = [15, 12.5, 10, 7.5];
export const FE_DEFAULTS = { meshSize: 10, loading: "rotation", displacementLimit: 4, loadSteps: 16, columnSide: false };

/** FE options from the panel controls (strings or numbers); errors as messages. */
export function normaliseFeOptions(raw = {}) {
  const errors = [];
  const meshSize = Number(raw.meshSize ?? FE_DEFAULTS.meshSize);
  const loading = raw.loading ?? FE_DEFAULTS.loading;
  const displacementLimit = Number(raw.displacementLimit ?? FE_DEFAULTS.displacementLimit);
  const loadSteps = Number(raw.loadSteps ?? FE_DEFAULTS.loadSteps);
  const columnSide = raw.columnSide ?? false;
  if (typeof columnSide !== "boolean") errors.push("Include the column flange must be true or false");
  if (!FE_MESH_SIZES.includes(meshSize)) errors.push(`Mesh size must be one of ${FE_MESH_SIZES.join(", ")} mm`);
  if (loading !== "rotation" && loading !== "uniform") errors.push("Loading must be rotation or uniform");
  if (!(displacementLimit >= 0.5 && displacementLimit <= 20)) errors.push("Displacement limit must be 0.5 to 20 mm");
  if (!(Number.isInteger(loadSteps) && loadSteps >= 4 && loadSteps <= 60)) errors.push("Load steps must be an integer from 4 to 60");
  return errors.length ? { ok: false, errors } : { ok: true, options: { meshSize, loading, displacementLimit, loadSteps, ...(columnSide ? { columnSide: true } : {}) } };
}

/** Reason why the FE model does not cover a page input, or null. */
export function feScopeError(type, input, result) {
  if (!result?.spec || !result.joint) return "The route makes no moment check for this input, so there is no tension zone to analyse.";
  if (type === "web" && (input.beam.kind === "U" || input.values.sectionType === "channel")) {
    return "The FE model is symmetric about the beam web; channel secondaries are outside its scope.";
  }
  return null;
}

/** Model size for the panel (no solve). */
export function estimateFe(type, result, options) {
  return endPlateFeSize(type, result.spec, options);
}

function inputRows(type, values) {
  const rows = [["Connection", ENDPLATE_TYPES[type].title]];
  for (const field of ENDPLATE_TYPES[type].fields) {
    const value = values[field.name];
    if (value === undefined || value === "") continue;
    rows.push([field.label, `${value}${field.unit && field.unit !== "—" ? ` ${field.unit}` : ""}`]);
  }
  return rows;
}

/**
 * Runs the FE check of a page input: message { type, raw, options } as posted to the worker.
 * onProgress(step, stepCount, displacement) after each converged load step.
 */
export async function runEndPlateFeAnalysis(message, onProgress = () => {}) {
  const { type, raw } = message;
  if (!ENDPLATE_TYPES[type]) throw new EndPlateFeError(`Unknown end-plate page type ${type}`);
  const checked = normaliseFeOptions(message.options);
  if (!checked.ok) throw new EndPlateFeError(checked.errors.join("; "));
  const options = checked.options;
  const page = evaluateEndPlatePage(type, raw);
  if (!page.ok) throw new EndPlateFeError(page.errors.join("; "));
  const scope = feScopeError(type, page.input, page.result);
  if (scope) throw new EndPlateFeError(scope);
  const size = estimateFe(type, page.result, options);
  if (size.dofCount > ENDPLATE_FE_MAX_DOF) throw new EndPlateFeError(`The model has ${size.dofCount} degrees of freedom, above the ${ENDPLATE_FE_MAX_DOF} limit: use a coarser mesh.`);
  const result = analyseEndPlateFe(type, page.result.spec, { ...options, onStep: onProgress });
  const view = { azimuth: -35, elevation: 28, scale: autoScale(result.field, result.view.b), showUndeformed: false, ...result.view };
  const viewHtml = `${fieldSvg(result.field, view)}${strainLegendHtml()}<p class="note">Displacements magnified ${view.scale}×; bolt forces in kN (red: bolt at F<sub>t</sub> = 0.9 f<sub>ub</sub> A<sub>s</sub>, γ = 1). ${result.columnSide ? "Both plates and the supported column-web strip are shown." : "The support is drawn as a plane under the plate."}</p>`;
  const generatedAt = new Date().toISOString();
  const inputSha256 = await sha256Hex(canonicalJson({ type, values: page.input.values, options }));
  const reportHtml = renderEndPlateFeReport(result, {
    title: ENDPLATE_TYPES[type].title,
    inputRows: [...inputRows(type, page.input.values), ["FE mesh size", `${options.meshSize} mm`], ["FE loading", options.loading], ["FE displacement limit", `${options.displacementLimit} mm`], ["FE load steps", String(options.loadSteps)], ...(options.columnSide ? [["FE column flange", "included"]] : [])],
    inputSha256, generatedAt, tool: `${TOOL_NAME} ${CONNECTIONS_VERSION}`, viewHtml
  });
  return { ...result, options, audit: { inputSha256, generatedAt, calculatedIn: "browser" }, reportHtml };
}
