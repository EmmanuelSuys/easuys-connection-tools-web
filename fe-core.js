// FE analysis for the browser page: validation, analysis, design check and
// report, without DOM access, so the module runs in a Web Worker and in Node
// tests alike.
import {
  analyseTStub,
  boltPositionsY,
  BOLT_SIZES,
  checkTStubDesign,
  hashTStubInput,
  normaliseTStubInput,
  renderTStubReport,
  TOOL_NAME,
  TOOL_VERSION,
  TSTUB_INPUT_FIELDS
} from "./lib/index.js";
import { tstubPlanSvg, tstubSectionSvg } from "./drawing.js";
import { designReportHtml } from "./design-view.js";
import { autoScale, fieldSvg, strainLegendHtml } from "./view3d.js";

export class InputError extends Error {
  constructor(errors) {
    super(errors.join("; "));
    this.name = "InputError";
    this.errors = errors;
  }
}

/** Optional fields the visitor left empty, marked "default" in the report. */
export function defaultedFields(raw) {
  return TSTUB_INPUT_FIELDS
    .filter(field => !field.required && !Object.prototype.hasOwnProperty.call(raw, field.name))
    .map(field => String(field.name));
}

const REPORT_STYLE = `<style>
.drawings{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.drawing,.view3d{width:100%;height:auto;max-height:520px}
.design-result{font-size:15px}.util{position:relative;height:26px;border:1px solid #9aa6b2;background:#f4f6f8;margin:6px 0 10px;max-width:620px}
.util-fill{position:absolute;left:0;top:0;bottom:0;background:#86c58f}.util.fail .util-fill{background:#e58b80}.util-text{position:relative;padding:0 8px;line-height:26px}
tr.governing th,tr.governing td{font-weight:700;background:#fff4d6}tr.info{color:#5b6672}.formula{font-size:12px}
.checks{list-style:none;padding:0}.checks li{margin:4px 0}.checks .ok .icon{color:#1d7a35}.checks .fail .icon{color:#b91c1c}.checks .warning .icon{color:#a15c00}.ref{color:#5b6672;font-size:12px}
.legend{font-size:12px;color:#46515d}.swatch{display:inline-block;width:14px;height:10px;margin:0 3px 0 8px;border:1px solid #8a97a5;vertical-align:middle}
</style>`;

/** Geometry part of a raw or normalised input. */
export function geometryOf(input) {
  return { L: input.L, b: input.b, tw: input.tw, hw: input.hw, tf: input.tf, m: input.m, nb: input.nb };
}

/**
 * Runs the T-stub FE analysis on a raw input object and renders the report.
 * options.design (steelGrade, boltSize, boltClass, gammaM0, gammaM2, FEd in N)
 * adds the design check and the drawings; options.onProgress(step, stepCount,
 * displacement) is called after each converged load step.
 */
export async function runBrowserAnalysis(raw, options = {}) {
  const { design: designOptions, onProgress = () => {} } = typeof options === "function" ? { onProgress: options } : options;
  const validation = normaliseTStubInput(raw);
  if (!validation.ok) throw new InputError(validation.errors);
  const input = validation.input;
  const design = designOptions ? checkTStubDesign(geometryOf(input), designOptions) : undefined;
  const result = analyseTStub(input, {
    includeField: true,
    onStep: (point, step, stepCount) => onProgress(step, stepCount, point.displacement)
  });
  const generatedAt = new Date().toISOString();
  const inputSha256 = await hashTStubInput(input);
  const view = { azimuth: -35, elevation: 28, scale: autoScale(result.field, input.b), showUndeformed: false, b: input.b, hw: input.hw, tf: input.tf };
  const extraSections = [];
  if (design) {
    const bolt = BOLT_SIZES[designOptions.boltSize];
    extraSections.push({
      title: "Connection drawing",
      html: `${REPORT_STYLE}<div class="drawings">${tstubSectionSvg(geometryOf(input), bolt)}${tstubPlanSvg(geometryOf(input), bolt, boltPositionsY(input.L, input.nb))}</div>`
    });
    extraSections.push({ title: "Design check (partial factors)", html: designReportHtml(design) });
  }
  extraSections.push({
    title: "Deformed shape at the resistance event",
    html: `${design ? "" : REPORT_STYLE}${fieldSvg(result.field, view)}${strainLegendHtml()}<p class="note">Displacements magnified ${view.scale}×; bolt forces in kN (red: bolt at F<sub>t,Rd</sub> = 0.9 f<sub>ub</sub> A<sub>s</sub>, γ = 1).</p>`
  });
  const reportHtml = await renderTStubReport(result, {
    input,
    defaultedFields: defaultedFields(raw),
    tool: TOOL_NAME,
    version: TOOL_VERSION,
    generatedAt,
    extraSections
  });
  return {
    tool: TOOL_NAME,
    version: TOOL_VERSION,
    input,
    design,
    en: result.en,
    fe: result.fe,
    curve: result.curve,
    boltForces: result.boltForces,
    pryingForce: result.pryingForce,
    maxPlasticStrain: result.maxPlasticStrain,
    dofCount: result.dofCount,
    timingMs: result.timingMs,
    field: result.field,
    audit: { inputSha256, generatedAt, calculatedIn: "browser" },
    reportHtml
  };
}
