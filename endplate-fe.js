// FE panel of the end-plate pages: model size while typing, the FE check of the tension zone in a
// module Web Worker with progress and cancel, then the summary, 3D view, curves, row and group
// tables and the calculation report.
import { ENDPLATE_FE_MAX_DOF, endPlateFeCurveSvg, endPlateFeModelHtml, endPlateFeRowsSvg, endPlateFeSummaryHtml, endPlateFeTablesHtml } from "./lib/index.js";
import { autoScale, fieldSvg, strainLegendHtml } from "./view3d.js";
import { estimateFe, FE_DEFAULTS, feScopeError, normaliseFeOptions } from "./endplate-fe-core.js";

const DEFAULT_VIEW = { azimuth: -35, elevation: 28 };
const SLOW_DOF = 6000;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
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

/** Mounts the FE panel ([data-fe-panel]) of an end-plate page; returns { update(input, result) }. */
export function mountEndPlateFe(type) {
  const panel = document.querySelector("[data-fe-panel]");
  const $ = selector => panel.querySelector(selector);
  const runButton = $("[data-run-fe]");
  const cancelButton = $("[data-cancel-fe]");
  const sizeText = $("[data-fe-dof]");
  const progressBox = $("[data-progress]");
  const progressBar = $("[data-progress-bar]");
  const progressText = $("[data-progress-text]");
  const output = $("[data-fe-output]");
  const viewHost = $("[data-view3d]");
  const scaleInput = $("[data-view-scale]");
  const undeformedInput = $("[data-view-undeformed]");
  const reportFrame = $("[data-report-frame]");
  const view = { ...DEFAULT_VIEW, autoScale: 1, factor: 1 };
  let current = null; // { input, result }
  let worker = null;
  let timer = null;
  let last = null;

  for (const [name, value] of Object.entries(FE_DEFAULTS)) {
    const control = panel.querySelector(`[name="fe-${name}"]`);
    if (control) control.value = String(value);
  }
  const readOptions = () => normaliseFeOptions(Object.fromEntries(Object.keys(FE_DEFAULTS).map(name => [name, panel.querySelector(`[name="fe-${name}"]`)?.value])));

  function refresh() {
    const running = worker !== null;
    if (!current) { sizeText.textContent = "Correct the input to run the FE check."; runButton.disabled = true; return; }
    const scope = feScopeError(type, current.input, current.result);
    if (scope) { sizeText.textContent = scope; runButton.disabled = true; return; }
    const options = readOptions();
    if (!options.ok) { sizeText.textContent = options.errors.join("; "); runButton.disabled = true; return; }
    let size;
    try { size = estimateFe(type, current.result, options.options); }
    catch (error) { sizeText.textContent = `The FE model cannot be built: ${error.message}`; runButton.disabled = true; return; }
    const tooBig = size.dofCount > ENDPLATE_FE_MAX_DOF;
    sizeText.textContent = `Estimated model: ${size.dofCount.toLocaleString("en")} degrees of freedom, ${size.elementCount} shells${tooBig ? ` — above the ${ENDPLATE_FE_MAX_DOF.toLocaleString("en")} limit; use a coarser mesh.` : size.dofCount > SLOW_DOF ? " — this can take a minute or more." : "."}`;
    runButton.disabled = tooBig || running;
  }

  function stop() {
    if (worker) worker.terminate();
    worker = null;
    clearInterval(timer);
    timer = null;
    cancelButton.hidden = true;
    refresh();
  }

  function renderView() {
    if (!last) return;
    const scale = Math.round(view.autoScale * view.factor * 10) / 10;
    $("[data-view-scale-text]").textContent = `${scale}×`;
    viewHost.innerHTML = fieldSvg(last.field, { azimuth: view.azimuth, elevation: view.elevation, scale, showUndeformed: undeformedInput.checked, ...last.view });
  }

  function render(result) {
    last = result;
    $("[data-fe-summary]").innerHTML = endPlateFeSummaryHtml(result);
    view.autoScale = autoScale(result.field, result.view.b);
    view.factor = 1;
    scaleInput.value = "1";
    $("[data-view-legend]").innerHTML = strainLegendHtml();
    renderView();
    $("[data-fe-curves]").innerHTML = endPlateFeCurveSvg(result) + endPlateFeRowsSvg(result);
    $("[data-fe-tables]").innerHTML = endPlateFeTablesHtml(result);
    $("[data-fe-model]").innerHTML = endPlateFeModelHtml(result);
    reportFrame.srcdoc = result.reportHtml;
    output.hidden = false;
  }

  function run() {
    if (!current || worker) return;
    const options = readOptions();
    if (!options.ok) { refresh(); return; }
    const started = performance.now();
    let stepText = "Building the model…";
    progressBar.value = 0;
    progressBar.max = options.options.loadSteps;
    progressBox.hidden = false;
    cancelButton.hidden = false;
    document.body.dataset.feState = "running";
    const tick = () => { progressText.textContent = `${stepText} · ${Math.round((performance.now() - started) / 1000)} s`; };
    tick();
    timer = setInterval(tick, 500);
    worker = new Worker(new URL("./endplate-fe-worker.js", import.meta.url), { type: "module" });
    refresh();
    worker.onmessage = event => {
      const message = event.data;
      if (message.type === "progress") {
        progressBar.max = message.stepCount;
        progressBar.value = message.step;
        stepText = `Load step ${message.step} of ${message.stepCount} (${message.displacement.toFixed(2)} mm)`;
        tick();
        return;
      }
      stop();
      if (message.type === "done") {
        progressBar.value = progressBar.max; // the analysis stops at the resistance event
        progressText.textContent = `Finished in ${Math.round((performance.now() - started) / 1000)} s.`;
        render(message.result);
        document.body.dataset.feState = "done";
      } else {
        progressText.textContent = "";
        output.hidden = false;
        $("[data-fe-summary]").innerHTML = `<p class="error">The FE analysis stopped: ${escapeHtml(message.message)}</p>`;
        document.body.dataset.feState = "error";
      }
    };
    worker.onerror = event => {
      stop();
      progressText.textContent = "";
      output.hidden = false;
      $("[data-fe-summary]").innerHTML = `<p class="error">The FE analysis could not run in this browser${event.message ? `: ${escapeHtml(event.message)}` : ""}.</p>`;
      document.body.dataset.feState = "error";
    };
    worker.postMessage({ type, raw: current.input.values, options: options.options });
  }

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
  for (const control of panel.querySelectorAll("[name^='fe-']")) control.addEventListener("change", refresh);
  runButton.addEventListener("click", run);
  cancelButton.addEventListener("click", () => { stop(); progressText.textContent = "FE analysis cancelled."; document.body.dataset.feState = "cancelled"; });
  $("[data-download-report]").addEventListener("click", () => {
    if (last) download(`endplate-fe-report-${last.audit.inputSha256.slice(0, 8)}.html`, "text/html", last.reportHtml);
  });
  $("[data-download-json]").addEventListener("click", () => {
    if (!last) return;
    const { reportHtml: _report, field: _field, ...data } = last;
    download(`endplate-fe-result-${last.audit.inputSha256.slice(0, 8)}.json`, "application/json", JSON.stringify(data, null, 2));
  });

  return {
    update(input, result) {
      current = input && result ? { input, result } : null;
      refresh();
    },
    run,
  };
}
