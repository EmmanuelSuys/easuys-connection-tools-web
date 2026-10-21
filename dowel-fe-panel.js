// "FE verification of the fastener" panel: runs the dowel FE for the current
// input in a module Web Worker (inline if workers are not available), a short
// while after the last change, and renders the comparison with Johansen.
import { verifyFastenerFe } from "./lib/index.js";
import { escapeHtml } from "./check-view.js";
import { dowelCurveSvg, dowelFeNotesHtml, dowelFeSummaryHtml, dowelShapeLegendHtml, dowelShapeSvg } from "./dowel-fe-view.js";

const DELAY_MS = 300;

/**
 * root: the panel element (with data-dowel-fe-status, -summary, -shape, -curve, -notes).
 * describe(input, result) → { spec, en, d } or null (spec for verifyFastenerFe; en: { Fk, ropeUsed } of the EN check).
 */
export function mountDowelFePanel(root, describe) {
  if (!root.querySelector("[data-dowel-fe-status]")) root.innerHTML = DOWEL_FE_PANEL_HTML;
  const $ = name => root.querySelector(`[data-dowel-fe-${name}]`);
  $("notes").innerHTML = dowelFeNotesHtml();
  const jobs = new Map();
  let worker = null;
  let latest = 0;
  let timer = null;
  let pending = null;

  const setState = (state, text) => {
    root.dataset.feStatus = state;
    $("status").innerHTML = text;
  };

  function render(result, job) {
    const titles = result.runs.map(run => run.plate ? `Collapse mechanism — ${run.plate} plate` : "Collapse mechanism");
    $("summary").innerHTML = dowelFeSummaryHtml(result, job.en);
    $("shape").innerHTML = result.runs.map((run, i) => dowelShapeSvg(run.rigid, job.d, titles[i])).join("") + dowelShapeLegendHtml();
    $("curve").innerHTML = dowelCurveSvg(result, job.en);
    const ratio = result.feCollapse / result.johansenMechanical;
    setState("done", `FE collapse load ${(result.feCollapse / 1000).toFixed(2)} kN per shear plane = ${ratio.toFixed(3)} × Johansen; computed in ${(result.timingMs / 1000).toFixed(2)} s in this browser.`);
  }

  function fail(message) {
    $("summary").innerHTML = "";
    $("shape").innerHTML = "";
    $("curve").innerHTML = "";
    setState("error", `<span class="error">The FE verification stopped: ${escapeHtml(message)}</span>`);
  }

  function runInline(id, job) {
    setTimeout(() => {
      if (id !== latest) return;
      try { render(verifyFastenerFe(job.spec), job); } catch (error) { fail(error.message); }
    }, 0);
  }

  function start() {
    const job = pending;
    pending = null;
    if (!job) return;
    const id = ++latest;
    setState("running", "Running the FE verification…");
    if (!worker && typeof Worker !== "undefined") {
      try {
        worker = new Worker(new URL("./dowel-fe-worker.js", import.meta.url), { type: "module" });
        worker.onmessage = event => {
          const message = event.data;
          if (message.id !== latest) return; // a newer input is on its way
          if (message.type === "done") render(message.result, jobs.get(message.id));
          else fail(message.message);
          jobs.delete(message.id);
        };
        worker.onerror = event => {
          event.preventDefault?.();
          worker = null;
          runInline(latest, jobs.get(latest));
        };
      } catch {
        worker = null;
      }
    }
    jobs.set(id, job);
    if (worker) worker.postMessage({ id, spec: job.spec });
    else runInline(id, job);
  }

  return {
    update(input, result) {
      let job = null;
      try { job = describe(input, result); } catch (error) { fail(error.message); return; }
      clearTimeout(timer);
      if (!job) {
        latest++;
        setState("idle", "The FE verification is not available for this input.");
        return;
      }
      pending = job;
      setState("waiting", "Waiting for the input to settle…");
      timer = setTimeout(start, DELAY_MS);
    },
    invalidate() {
      clearTimeout(timer);
      latest++;
      setState("idle", "Complete the input to run the FE verification.");
    }
  };
}

/** Panel markup shared by the pages (inserted where the page has a data-dowel-fe element). */
export const DOWEL_FE_PANEL_HTML = `
  <div class="panel-heading"><h2>FE verification of the fastener (in this browser)</h2></div>
  <p>A one-dimensional FE model of one fastener — beam elements with plastic hinges at M<sub>y,Rk</sub> on yielding embedment springs — is loaded by an increasing slip until it collapses. Its collapse load is compared with the Johansen equations of the check above <strong>without the rope effect</strong> at γ = 1: EN adds the rope effect on top (EN 1995-1-1 8.2.2(2)).</p>
  <div class="fe-dowel-status" data-dowel-fe-status role="status" aria-live="polite"></div>
  <div data-dowel-fe-summary></div>
  <div class="fe-dowel-grid">
    <figure class="fe-dowel-shape" data-dowel-fe-shape></figure>
    <figure class="curve-host" data-dowel-fe-curve></figure>
  </div>
  <details class="assumption-details"><summary>FE model, tolerances and limits</summary><div data-dowel-fe-notes></div></details>`;
