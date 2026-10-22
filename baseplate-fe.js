// Column base page: FE verification panel (uplift; compression indicative),
// run in a module Web Worker in the visitor's browser, with progress, cancel,
// summary, 3D view, curve, contact-pressure map and report.
import {
  BASE_PLATE_FIELDS,
  BASEPLATE_FE_MAX_DOF,
  estimateBasePlateFeDof,
  fieldApplies,
  makeCurveSvg,
  normaliseBasePlateFeOptions,
  normaliseBasePlateInput
} from "./lib/index.js";
import { pryingPairsTableHtml, summaryTableHtml } from "./baseplate-fe-core.js";
import { autoScale, fieldSvg, strainLegendHtml } from "./view3d.js";

const SLOW_DOF = 6000;
const DEFAULT_VIEW = { azimuth: -35, elevation: 28 };
const SETTINGS = ["meshSize", "displacementLimit", "loadSteps", "groutThickness", "groutE"];

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);

export function mountBasePlateFe() {
  const $ = selector => document.querySelector(selector);
  const form = $("[data-input-form]");
  const panel = $("[data-fe-panel]");
  if (!form || !panel) return;
  const runButton = $("[data-run-fe]");
  const cancelButton = $("[data-cancel-fe]");
  const dofText = $("[data-fe-dof]");
  const settingsStatus = $("[data-fe-status]");
  const progressBox = $("[data-progress]");
  const progressBar = $("[data-progress-bar]");
  const progressText = $("[data-progress-text]");
  const output = $("[data-fe-output]");
  const summary = $("[data-fe-summary]");
  const viewHost = $("[data-view3d]");
  const scaleInput = $("[data-view-scale]");
  const scaleText = $("[data-view-scale-text]");
  const undeformedInput = $("[data-view-undeformed]");
  const bearingBox = $("[data-bearing]");
  const reportFrame = $("[data-report-frame]");
  const selftestOutput = $("[data-selftest]");
  let worker = null, timer = null, last = null, current = null;
  const view = { ...DEFAULT_VIEW, autoScale: 1, factor: 1 };

  function readInput() {
    const element = name => form.elements.namedItem(name);
    const selects = {};
    for (const field of BASE_PLATE_FIELDS) if (field.kind === "select" || field.kind === "checkbox") selects[field.name] = field.kind === "checkbox" ? element(field.name).checked : element(field.name).value;
    const raw = {};
    for (const field of BASE_PLATE_FIELDS) {
      if (!fieldApplies(field, selects)) continue;
      if (field.kind === "select" || field.kind === "checkbox") { raw[field.name] = selects[field.name]; continue; }
      const text = element(field.name).value.trim();
      if (text === "") continue;
      const value = Number(text.replace(",", "."));
      raw[field.name] = Number.isFinite(value) ? value : text;
    }
    return raw;
  }

  function readOptions() {
    const options = { loadCase: panel.querySelector("[name=fe-loadCase]:checked")?.value ?? "uplift" };
    for (const name of SETTINGS) {
      const text = panel.querySelector(`[name=fe-${name}]`).value.trim();
      if (text === "") continue;
      const value = Number(text.replace(",", "."));
      options[name] = Number.isFinite(value) ? value : text;
    }
    return options;
  }

  function update() {
    const input = normaliseBasePlateInput(readInput());
    const options = normaliseBasePlateFeOptions(readOptions());
    const errors = [...(input.ok ? [] : ["Correct the input above first."]), ...(options.ok ? [] : options.errors)];
    for (const name of SETTINGS) {
      const control = panel.querySelector(`[name=fe-${name}]`);
      control.setAttribute("aria-invalid", options.ok || !options.errors.some(message => message.startsWith(`${name} `)) ? "false" : "true");
    }
    current = null;
    if (errors.length) {
      settingsStatus.innerHTML = errors.map(message => `<p class="error">${escapeHtml(message)}</p>`).join("");
      dofText.textContent = "";
      runButton.disabled = true;
      return;
    }
    let dof;
    try { dof = estimateBasePlateFeDof(input.input, options.options); }
    catch (error) { settingsStatus.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`; runButton.disabled = true; return; }
    settingsStatus.innerHTML = "";
    current = { input: readInput(), options: readOptions() };
    dofText.textContent = dof > BASEPLATE_FE_MAX_DOF
      ? `Estimated model: ${dof.toLocaleString("en")} degrees of freedom — above the ${BASEPLATE_FE_MAX_DOF.toLocaleString("en")} limit; use a coarser mesh size.`
      : `Estimated model: ${dof.toLocaleString("en")} degrees of freedom${dof > SLOW_DOF ? " — this can take a few minutes" : ""}.`;
    runButton.disabled = worker !== null || dof > BASEPLATE_FE_MAX_DOF;
  }

  function stop() {
    if (worker) worker.terminate();
    worker = null;
    clearInterval(timer);
    timer = null;
    cancelButton.hidden = true;
    update();
  }

  function renderView() {
    if (!last) return;
    const scale = Math.round(view.autoScale * view.factor * 10) / 10;
    scaleText.textContent = `${scale}×`;
    viewHost.innerHTML = fieldSvg(last.field, {
      azimuth: view.azimuth, elevation: view.elevation, scale, showUndeformed: undeformedInput.checked,
      b: last.input.hp, hw: last.options.columnHeight, tf: last.input.tp
    });
  }

  function render(result) {
    last = result;
    $("[data-fe-pairs]").innerHTML = pryingPairsTableHtml(result);
    summary.innerHTML = `${summaryTableHtml(result)}${result.warnings.map(text => `<p class="warning">${escapeHtml(text)}</p>`).join("")}`;
    view.autoScale = autoScale(result.field, Math.max(result.input.hp, result.input.bp));
    view.factor = 1;
    scaleInput.value = "1";
    $("[data-view-legend]").innerHTML = strainLegendHtml();
    renderView();
    $("[data-curve]").innerHTML = makeCurveSvg(result);
    bearingBox.innerHTML = result.bearingHtml ? `<h3>Contact pressure under the plate</h3>${result.bearingHtml}` : "";
    reportFrame.srcdoc = result.reportHtml;
    output.hidden = false;
    document.body.dataset.feStatus = "done";
  }

  function writeSelftest(payload) {
    const data = payload.state === "done"
      ? { state: "done", loadCase: payload.result.loadCase, feResistance: payload.result.fe.resistance, feMode: payload.result.fe.mode, enResistance: payload.result.en.resistance, ratio: payload.result.ratio, enApplies: payload.result.enApplies, pairs: payload.result.pairs?.map(p => ({ support: p.support, fe: p.fe, en: p.en, ratio: p.ratio, contactForce: p.contactForce, supportModulus: p.supportModulus })), dofCount: payload.result.dofCount, timingMs: payload.result.timingMs, equilibrium: payload.result.equilibrium.pass }
      : payload;
    selftestOutput.textContent = JSON.stringify(data);
    selftestOutput.dataset.state = payload.state;
    selftestOutput.hidden = false;
  }

  function run({ selftest = false } = {}) {
    if (!current) return;
    const started = performance.now();
    let stepText = "Building the model…";
    progressBar.value = 0;
    progressBox.hidden = false;
    cancelButton.hidden = false;
    document.body.dataset.feStatus = "running";
    const tick = () => { progressText.textContent = `${stepText} · ${Math.round((performance.now() - started) / 1000)} s`; };
    tick();
    timer = setInterval(tick, 500);
    worker = new Worker(new URL("./baseplate-fe-worker.js", import.meta.url), { type: "module" });
    update();
    worker.onmessage = event => {
      const message = event.data;
      if (message.type === "progress") {
        progressBar.max = message.stepCount;
        progressBar.value = message.step;
        const p = message.progress;
        stepText = p ? `Run ${p.run} of ${p.runCount} (${p.support}): load step ${message.step - (p.run - 1) * message.stepCount / p.runCount} of ${message.stepCount / p.runCount} (${message.displacement.toFixed(2)} mm)` : `Load step ${message.step} of ${message.stepCount} (${message.displacement.toFixed(2)} mm)`;
        tick();
        return;
      }
      stop();
      if (message.type === "done") {
        progressBar.value = progressBar.max;
        progressText.textContent = `Finished in ${Math.round((performance.now() - started) / 1000)} s.`;
        render(message.result);
        if (selftest) writeSelftest({ state: "done", result: message.result });
      } else {
        $("[data-fe-pairs]").innerHTML = "";
        progressText.textContent = "";
        output.hidden = false;
        summary.innerHTML = `<p class="error">The FE analysis stopped: ${escapeHtml(message.message)}</p>`;
        document.body.dataset.feStatus = "error";
        if (selftest) writeSelftest({ state: "error", message: message.message });
      }
    };
    worker.onerror = event => {
      stop();
      $("[data-fe-pairs]").innerHTML = "";
      progressText.textContent = "";
      output.hidden = false;
      summary.innerHTML = `<p class="error">The FE analysis could not run in this browser${event.message ? `: ${escapeHtml(event.message)}` : ""}.</p>`;
      document.body.dataset.feStatus = "error";
      if (selftest) writeSelftest({ state: "error", message: event.message || "worker error" });
    };
    worker.postMessage(current);
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
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  $("[data-reset]")?.addEventListener("click", () => setTimeout(update, 0));
  panel.addEventListener("input", update);
  panel.addEventListener("change", update);
  runButton.addEventListener("click", () => run());
  cancelButton.addEventListener("click", () => { stop(); progressText.textContent = "FE analysis cancelled."; document.body.dataset.feStatus = "cancelled"; });
  $("[data-download-report]").addEventListener("click", () => {
    if (last) download(`column-base-fe-${last.loadCase}-${last.audit.inputSha256.slice(0, 8)}.html`, "text/html", last.reportHtml);
  });
  $("[data-download-json]").addEventListener("click", () => {
    if (!last) return;
    const { reportHtml, field: _field, bearingHtml: _map, bearing, ...data } = last;
    const bearingData = bearing ? { ...bearing, cells: undefined } : undefined;
    download(`column-base-fe-${last.loadCase}-${last.audit.inputSha256.slice(0, 8)}.json`, "application/json", JSON.stringify({ ...data, ...(bearingData ? { bearing: bearingData } : {}) }, null, 2));
  });

  update();
  const params = new URLSearchParams(location.search);
  if (params.has("selftest")) {
    panel.querySelector("[name=fe-meshSize]").value = params.get("mesh") ?? "16";
    const loadCase = params.get("case") === "compression" ? "compression" : "uplift";
    panel.querySelector(`[name=fe-loadCase][value=${loadCase}]`).checked = true;
    update();
    run({ selftest: true });
  }
}
