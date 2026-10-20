// Bolted T-stub page: live drawing and EN 1993-1-8 design check while typing;
// FE verification in the visitor's browser (module Web Worker) with a 3D view.
import {
  BOLT_CLASSES,
  BOLT_SIZES,
  boltPositionsY,
  checkTStubDesign,
  estimateTStubDof,
  makeCurveSvg,
  normaliseTStubInput,
  steelStrength,
  TOOL_VERSION
} from "./lib/index.js";
import { tstubPlanSvg, tstubSectionSvg } from "./drawing.js";
import { DESIGN_ASSUMPTIONS, designChecksHtml, designSummaryHtml, designTableHtml } from "./design-view.js";
import { autoScale, fieldSvg, strainLegendHtml } from "./view3d.js";

const MAX_DOF = 12000;
const SLOW_DOF = 6000;
const GEOMETRY = ["L", "b", "tw", "hw", "tf", "m", "nb"];
const FE_SETTINGS = ["meshSize", "displacementLimit", "loadSteps", "E", "nu", "Et"];

// The acceptance case of the prototype (EN mode 2 at gamma = 1), S355, M20 10.9; 16 load
// steps give a smoother curve than the 4 of the acceptance run at the same resistance.
const EXAMPLE = {
  L: 100, b: 200, tw: 20, hw: 100, tf: 25, m: 40, nb: 1,
  steelGrade: "S355", boltSize: "M20", boltClass: "10.9",
  FEd: 200, gammaM0: 1.0, gammaM2: 1.25,
  meshSize: 5, displacementLimit: 4, loadSteps: 16, E: 210000, nu: 0.3, Et: ""
};
const SELFTEST = { ...EXAMPLE, meshSize: 10 };
const DEFAULT_VIEW = { azimuth: -35, elevation: 28 };

const $ = selector => document.querySelector(selector);
const form = $("[data-input-form]");
const formStatus = $("[data-form-status]");
const feButton = $("[data-run-fe]");
const cancelButton = $("[data-cancel-fe]");
const progressBox = $("[data-progress]");
const progressBar = $("[data-progress-bar]");
const progressText = $("[data-progress-text]");
const feOutput = $("[data-fe-output]");
const feSummary = $("[data-fe-summary]");
const viewHost = $("[data-view3d]");
const scaleInput = $("[data-view-scale]");
const scaleText = $("[data-view-scale-text]");
const undeformedInput = $("[data-view-undeformed]");
const reportFrame = $("[data-report-frame]");
const selftestOutput = $("[data-selftest]");

let feWorker = null;
let feTimer = null;
let lastFeResult = null;
let current = null; // { raw, designOptions, design, errors }
const view = { ...DEFAULT_VIEW, autoScale: 1, factor: 1 };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}
const kN = valueN => `${(valueN / 1000).toFixed(1)} kN`;
const fixed = (value, digits) => (Number.isFinite(value) ? value.toFixed(digits) : "—");

function field(name) { return form.elements.namedItem(name); }

function setValues(values) {
  for (const [name, value] of Object.entries(values)) {
    const element = field(name);
    if (element) element.value = String(value);
  }
  update();
}

function numberOf(name) {
  const text = (field(name)?.value ?? "").trim();
  if (text === "") return undefined;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : text;
}

/** Reads the form: the FE input (validated by the shared schema) and the design options. */
function readForm() {
  const errors = [];
  const raw = {};
  for (const name of [...GEOMETRY, ...FE_SETTINGS]) {
    const value = numberOf(name);
    if (value !== undefined) raw[name] = value;
  }
  const steelGrade = field("steelGrade").value;
  const boltSize = field("boltSize").value;
  const boltClass = field("boltClass").value;
  const bolt = BOLT_SIZES[boltSize];
  raw.fub = BOLT_CLASSES[boltClass].fub;
  raw.As = bolt.As;
  if (typeof raw.tf === "number" && raw.tf > 0) {
    try { raw.fy = steelStrength(steelGrade, raw.tf).fy; } catch (error) { errors.push(error.message); }
  }
  if (typeof raw.tw === "number" && raw.tw > 80) errors.push(`Web thickness ${raw.tw} mm exceeds 80 mm, outside EN 1993-1-1 Table 3.1`);
  const FEd = numberOf("FEd");
  const gammaM0 = numberOf("gammaM0");
  const gammaM2 = numberOf("gammaM2");
  if (FEd !== undefined && !(typeof FEd === "number" && FEd >= 0)) errors.push("F_Ed must be a number ≥ 0");
  for (const [label, value] of [["γM0", gammaM0], ["γM2", gammaM2]]) {
    if (!(typeof value === "number" && value >= 1 && value <= 2)) errors.push(`${label} must be between 1.00 and 2.00`);
  }
  const designOptions = {
    steelGrade, boltSize, boltClass,
    gammaM0: typeof gammaM0 === "number" ? gammaM0 : 1,
    gammaM2: typeof gammaM2 === "number" ? gammaM2 : 1.25,
    ...(typeof FEd === "number" ? { FEd: FEd * 1000 } : {})
  };
  return { raw, designOptions, bolt, errors };
}

function markInvalid(messages) {
  for (const element of form.querySelectorAll("input")) {
    const name = element.name;
    const invalid = messages.some(message => message.startsWith(`${name} `) || message.includes(` ${name} `) || message.includes(`${name} =`));
    element.setAttribute("aria-invalid", invalid ? "true" : "false");
  }
}

function update() {
  const { raw, designOptions, bolt, errors } = readForm();
  const forCheck = normaliseTStubInput(raw, { checkModelSize: false });
  const messages = [...errors, ...(forCheck.ok ? [] : forCheck.errors)];
  markInvalid(messages);
  const running = feWorker !== null;
  if (messages.length) {
    current = null;
    formStatus.innerHTML = `<ul>${messages.map(message => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`;
    feButton.disabled = true;
    $("[data-dof]").textContent = "";
    return;
  }
  const input = forCheck.input;
  const geometry = { L: input.L, b: input.b, tw: input.tw, hw: input.hw, tf: input.tf, m: input.m, nb: input.nb };
  const design = checkTStubDesign(geometry, designOptions);
  current = { raw, designOptions, design };
  formStatus.innerHTML = "";
  $("[data-drawings]").innerHTML = tstubSectionSvg(geometry, bolt, "Section") + tstubPlanSvg(geometry, bolt, boltPositionsY(input.L, input.nb), "Plan");
  $("[data-design-summary]").innerHTML = designSummaryHtml(design);
  $("[data-design-table]").innerHTML = designTableHtml(design);
  $("[data-design-checks]").innerHTML = designChecksHtml(design);
  const forFe = normaliseTStubInput(raw);
  const dof = estimateTStubDof(input);
  const dofText = dof > MAX_DOF
    ? `Estimated model: ${dof.toLocaleString("en")} degrees of freedom — above the ${MAX_DOF.toLocaleString("en")} limit; use a coarser mesh size.`
    : `Estimated model: ${dof.toLocaleString("en")} degrees of freedom${dof > SLOW_DOF ? " — this can take a minute or more" : ""}.`;
  $("[data-dof]").textContent = dofText;
  feButton.disabled = !forFe.ok || running;
}

function stopFe() {
  if (feWorker) feWorker.terminate();
  feWorker = null;
  clearInterval(feTimer);
  feTimer = null;
  cancelButton.hidden = true;
  update();
}

function runFe({ selftest = false } = {}) {
  if (!current) return;
  const { raw, designOptions } = current;
  const validation = normaliseTStubInput(raw);
  if (!validation.ok) { update(); return; }
  const started = performance.now();
  let stepText = "Building the model…";
  progressBar.value = 0;
  progressBar.max = validation.input.loadSteps;
  progressBox.hidden = false;
  cancelButton.hidden = false;
  const tick = () => { progressText.textContent = `${stepText} · ${Math.round((performance.now() - started) / 1000)} s`; };
  tick();
  feTimer = setInterval(tick, 500);

  feWorker = new Worker(new URL("./fe-worker.js", import.meta.url), { type: "module" });
  update();
  feWorker.onmessage = event => {
    const message = event.data;
    if (message.type === "progress") {
      progressBar.max = message.stepCount;
      progressBar.value = message.step;
      stepText = `Load step ${message.step} of ${message.stepCount} (${fixed(message.displacement, 2)} mm)`;
      tick();
      return;
    }
    stopFe();
    if (message.type === "done") {
      progressBar.value = progressBar.max; // the analysis stops at the resistance event
      progressText.textContent = `Finished in ${Math.round((performance.now() - started) / 1000)} s.`;
      renderFe(message.result);
      if (selftest) writeSelftest({ state: "done", result: message.result });
    } else {
      progressText.textContent = "";
      feOutput.hidden = false;
      feSummary.innerHTML = `<p class="error">The FE analysis stopped: ${escapeHtml(message.message)}</p>`;
      if (selftest) writeSelftest({ state: "error", message: message.message });
    }
  };
  feWorker.onerror = event => {
    stopFe();
    progressText.textContent = "";
    feOutput.hidden = false;
    feSummary.innerHTML = `<p class="error">The FE analysis could not run in this browser${event.message ? `: ${escapeHtml(event.message)}` : ""}.</p>`;
    if (selftest) writeSelftest({ state: "error", message: event.message || "worker error" });
  };
  feWorker.postMessage({ input: raw, design: designOptions });
}

function noEventReached(result) {
  const boltCapacity = 0.9 * result.input.fub * result.input.As;
  const boltYielded = Object.values(result.boltForces).some(force => force >= boltCapacity * (1 - 1e-7));
  return result.maxPlasticStrain < 0.05 && !boltYielded;
}

function renderView() {
  if (!lastFeResult) return;
  const scale = Math.round(view.autoScale * view.factor * 10) / 10;
  scaleText.textContent = `${scale}×`;
  viewHost.innerHTML = fieldSvg(lastFeResult.field, {
    azimuth: view.azimuth, elevation: view.elevation, scale,
    showUndeformed: undeformedInput.checked,
    b: lastFeResult.input.b, hw: lastFeResult.input.hw, tf: lastFeResult.input.tf
  });
}

function renderFe(result) {
  lastFeResult = result;
  const ratio = result.fe.resistance / result.en.resistance;
  const warnings = [];
  if (result.en.governing === "web") warnings.push("The web in tension governs the EN check; the FE model does not check the web.");
  if (noEventReached(result)) warnings.push("No failure event was reached within the displacement limit: the FE value is a lower bound. Increase the displacement limit.");
  feSummary.innerHTML = `
    <div class="table-wrap"><table class="results-table"><tbody>
      <tr class="key"><th>FE resistance (γ = 1)</th><td class="num">${kN(result.fe.resistance)}</td></tr>
      <tr><th>EN component model (γ = 1)</th><td class="num">${kN(result.en.resistance)}</td></tr>
      <tr class="key"><th>FE / EN</th><td class="num">${fixed(ratio, 3)}</td></tr>
      <tr><th>Failure mode FE / EN</th><td class="num">${result.fe.mode} / ${result.en.mode}</td></tr>
      <tr><th>Failure displacement</th><td class="num">${fixed(result.fe.failureDisplacement, 2)} mm</td></tr>
      <tr><th>Prying force</th><td class="num">${kN(result.pryingForce)}</td></tr>
      <tr><th>Maximum plastic strain</th><td class="num">${fixed(result.maxPlasticStrain * 100, 2)} %</td></tr>
      <tr><th>Model size</th><td class="num">${result.dofCount.toLocaleString("en")} DOF</td></tr>
      <tr><th>Analysis time (this browser)</th><td class="num">${fixed(result.timingMs / 1000, 1)} s</td></tr>
    </tbody></table></div>
    ${warnings.map(text => `<p class="warning">${escapeHtml(text)}</p>`).join("")}`;
  view.autoScale = autoScale(result.field, result.input.b);
  view.factor = 1;
  scaleInput.value = "1";
  $("[data-view-legend]").innerHTML = strainLegendHtml();
  renderView();
  $("[data-curve]").innerHTML = makeCurveSvg(result);
  reportFrame.srcdoc = result.reportHtml;
  feOutput.hidden = false;
}

function download(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function writeSelftest(payload) {
  const summary = payload.state === "done"
    ? {
        state: "done",
        feResistance: payload.result.fe.resistance,
        feMode: payload.result.fe.mode,
        enResistance: payload.result.en.resistance,
        enMode: payload.result.en.mode,
        designResistance: payload.result.design?.resistance,
        dofCount: payload.result.dofCount,
        timingMs: payload.result.timingMs,
        input: payload.result.input
      }
    : payload;
  selftestOutput.textContent = JSON.stringify(summary);
  selftestOutput.dataset.state = payload.state;
  selftestOutput.hidden = false;
}

// view interaction: drag to rotate
let drag = null;
viewHost.addEventListener("pointerdown", event => {
  drag = { x: event.clientX, y: event.clientY, azimuth: view.azimuth, elevation: view.elevation };
  viewHost.setPointerCapture(event.pointerId);
});
viewHost.addEventListener("pointermove", event => {
  if (!drag) return;
  view.azimuth = drag.azimuth + (event.clientX - drag.x) * 0.5;
  view.elevation = Math.max(-5, Math.min(85, drag.elevation + (event.clientY - drag.y) * 0.4));
  requestAnimationFrame(renderView);
});
viewHost.addEventListener("pointerup", () => { drag = null; });
viewHost.addEventListener("pointercancel", () => { drag = null; });
scaleInput.addEventListener("input", () => { view.factor = Number(scaleInput.value); renderView(); });
undeformedInput.addEventListener("change", renderView);
$("[data-view-reset]").addEventListener("click", () => { Object.assign(view, DEFAULT_VIEW); view.factor = 1; scaleInput.value = "1"; renderView(); });

$("[data-design-assumptions]").innerHTML = DESIGN_ASSUMPTIONS;
$("[data-version]").textContent = `Tool version ${TOOL_VERSION}`;
form.addEventListener("input", update);
form.addEventListener("change", update);
form.addEventListener("submit", event => event.preventDefault());
$("[data-reset]").addEventListener("click", () => setValues(EXAMPLE));
feButton.addEventListener("click", () => runFe());
cancelButton.addEventListener("click", () => { stopFe(); progressText.textContent = "FE analysis cancelled."; });
$("[data-download-report]").addEventListener("click", () => {
  if (lastFeResult) download(`tstub-report-${lastFeResult.audit.inputSha256.slice(0, 8)}.html`, "text/html", lastFeResult.reportHtml);
});
$("[data-download-json]").addEventListener("click", () => {
  if (!lastFeResult) return;
  const { reportHtml, field: _field, ...data } = lastFeResult;
  download(`tstub-result-${lastFeResult.audit.inputSha256.slice(0, 8)}.json`, "application/json", JSON.stringify(data, null, 2));
});

if (new URLSearchParams(location.search).has("selftest")) {
  setValues(SELFTEST);
  runFe({ selftest: true });
} else {
  setValues(EXAMPLE);
}
