// The steel createFePanel requires a mesh selector and reports plate DOFs.
// This spring model follows the dowel panel lifecycle, with invalidation and
// build/run/render, and keeps its assumed parameters separate from the EN input.
import { analyseContactJointFE } from "./lib/index.js";
import { escapeHtml } from "./check-view.js";

const eventLabel = event => ({ screw: "First brittle screw at R_d", contact: "Contact strip ductility limit", theta_max: "Maximum rotation reached (lower bound)" })[event];
const number = (v, digits = 3) => v.toFixed(digits);

/** Signed M-theta curve, with the EN moment and the terminating event marked. */
export function contactJointFeCurveSvg(fe) {
  const W = 640, H = 300, left = 64, right = 20, top = 30, bottom = 52;
  const sign = fe.thetaEvent < 0 ? -1 : 1;
  const en = sign * fe.MRd / 1e6;
  const thetaSpan = Math.max(Math.abs(fe.thetaEvent), 1e-9);
  const xMin = sign < 0 ? -thetaSpan : 0, xMax = sign < 0 ? 0 : thetaSpan;
  const moments = [0, en, ...fe.curve.map(p => p.moment / 1e6)];
  const yMin = Math.min(...moments), yMax = Math.max(...moments);
  const ySpan = Math.max(yMax - yMin, 1e-9);
  const X = theta => left + (theta - xMin) / (xMax - xMin) * (W - left - right);
  const Y = m => H - bottom - (m - yMin) / ySpan * (H - top - bottom);
  const parts = [];
  for (let i = 0; i <= 4; i++) {
    const theta = xMin + (xMax - xMin) * i / 4, m = yMin + ySpan * i / 4;
    parts.push(`<line class="grid" x1="${left}" y1="${Y(m)}" x2="${W - right}" y2="${Y(m)}"/>
      <text x="${left - 8}" y="${Y(m) + 4}" text-anchor="end">${number(m, 2)}</text>
      <text x="${X(theta)}" y="${H - bottom + 20}" text-anchor="middle">${theta.toPrecision(3)}</text>`);
  }
  const points = fe.curve.map(p => `${X(p.theta)},${Y(p.moment / 1e6)}`).join(" ");
  const event = fe.eventState;
  parts.push(`<line class="axis" x1="${left}" y1="${Y(0)}" x2="${W - right}" y2="${Y(0)}"/>
    <line class="axis" x1="${X(0)}" y1="${top}" x2="${X(0)}" y2="${H - bottom}"/>
    <line class="en-line" x1="${left}" y1="${Y(en)}" x2="${W - right}" y2="${Y(en)}"/>
    <polyline class="fe-line" points="${points}"/>
    <circle class="fe-marker" cx="${X(event.theta)}" cy="${Y(event.moment / 1e6)}" r="5"><title>${eventLabel(fe.event)}</title></circle>
    <text class="axis-label" x="${left}" y="16">M (kNm); dashed: EN M_Rd</text>
    <text class="axis-label" x="${(W + left - right) / 2}" y="${H - 8}" text-anchor="middle">Rotation θ (rad)</text>`);
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Indicative FE moment against rotation, compared with EN" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

export function contactJointFeHtml(fe) {
  const state = fe.eventState;
  const rows = state.screws.map(s => `<tr><th scope="row">${escapeHtml(s.id)}</th><td class="num">${number(s.y, 1)}</td><td class="num">${number(s.force / 1000)}</td><td class="num">${number(s.capacity / 1000)}</td></tr>`).join("");
  const peak = fe.capacityState !== state
    ? ` Peak M_FE occurs at θ = ${fe.capacityState.theta.toPrecision(6)} rad.` : "";
  return `<p><strong>M<sub>FE</sub> = ${number(fe.MFE / 1e6)} kNm${fe.lowerBound ? " (lower bound)" : ""}</strong> ·
    M<sub>FE</sub> / M<sub>Rd</sub>(EN) = <strong>${number(fe.ratio, 5)}</strong> (EN ${number(fe.MRd / 1e6)} kNm).</p>
    <p>${eventLabel(fe.event)} at θ = ${fe.thetaEvent.toPrecision(6)} rad.${peak}
    Compression depth at the event: ${number(state.depth, 2)} mm; centroid opening δ<sub>0</sub> = ${number(state.delta0, 5)} mm.</p>
    <figure class="curve-host">${contactJointFeCurveSvg(fe)}</figure>
    <details class="intermediate"><summary>Screw forces and equilibrium at the event</summary>
      <div class="table-wrap"><table class="results-table"><thead><tr><th>Screw</th><th class="num">y (mm)</th><th class="num">Force (kN)</th><th class="num">Group capacity (kN)</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p>ΣF − N<sub>Ed</sub> = ${state.residualN.toExponential(3)} N; equilibrium gate ${number(state.equilibrium.gateN, 6)} N.
      ${escapeHtml(state.equilibrium.stoppingReason)}; ${state.equilibrium.iterations} bisections, ${state.equilibrium.bracketIterations} bracket expansions.</p>
    </details>
    <details class="assumption-details"><summary>FE model and stopping reason</summary>
      <p>Plane sections: δ(y) = δ<sub>0</sub> + θy. Opening and N are positive in tension; positive M tensions screws at +y.
      ${fe.options.nStrips} compression-only midpoint strip springs, ${fe.options.steps} rotation steps with event refinement.
      E<sub>α1</sub> / E<sub>α2</sub> = ${number(fe.Ealpha1, 1)} / ${number(fe.Ealpha2, 1)} MPa;
      k<sub>c</sub> = ${number(fe.kc, 6)} N/mm³; f<sub>c</sub> = ${number(fe.fc)} MPa.
      L<sub>c</sub> = ${number(fe.options.Lc)} mm per member; μ<sub>c</sub> = ${fe.options.muC}; screws ${fe.options.screwBehaviour}.</p>
      <p>Stopping reason: ${escapeHtml(fe.stoppingReason)}. Each equilibrium solve uses an absolute tolerance of ${fe.options.absoluteToleranceN} N
      plus a relative tolerance of ${fe.options.relativeTolerance}; iteration cap ${fe.options.maxIterations}.
      Screws use the EN active group factor n<sup>0.9</sup>/n. An unresolved equilibrium or event fails the FE check.</p>
    </details>`;
}

export function mountContactJointFePanel(root) {
  const $ = name => root.querySelector(`[data-fe-${name}]`);
  let last = null, timer = null, version = 0, customLc = false;
  const status = (state, message) => {
    root.dataset.feStatus = state;
    $("status").textContent = message;
  };
  const clear = () => { $("output").innerHTML = ""; };
  function build() {
    const read = name => {
      const value = $(name).value.trim();
      if (!value) throw new Error(`Enter ${name}.`);
      return Number(value.replace(",", "."));
    };
    return { spec: last.spec, options: { Lc: read("lc"), muC: read("mu"), thetaMax: read("theta"), screwBehaviour: $("behaviour").value } };
  }
  function run() {
    clearTimeout(timer);
    const id = ++version;
    clear();
    if (!last) { status("idle", "Complete the EN input to run the indicative FE check."); return; }
    let job;
    try { job = build(); }
    catch (error) { status("error", error.message); return; }
    status("running", "Running the indicative FE model…");
    setTimeout(() => {
      if (id !== version) return;
      try {
        const fe = analyseContactJointFE(job.spec, job.options);
        $("output").innerHTML = contactJointFeHtml(fe);
        status("done", `Indicative FE completed in ${fe.timingMs} ms. The EN check decides.`);
      } catch (error) {
        clear();
        status("error", `The indicative FE check failed: ${error.message}`);
      }
    }, 0);
  }
  function schedule() {
    clearTimeout(timer);
    version++;
    clear();
    status("waiting", "Waiting for the input to settle…");
    timer = setTimeout(run, 300);
  }
  for (const name of ["lc", "mu", "theta", "behaviour"]) {
    $(name).addEventListener("input", () => { if (name === "lc") customLc = true; schedule(); });
    $(name).addEventListener("change", schedule);
  }
  $("run").addEventListener("click", run);
  return {
    update(input, result) {
      last = result;
      if (!customLc && result) $("lc").value = String(result.spec.height / 2);
      if (!input || !result) {
        clearTimeout(timer); version++; clear();
        status("idle", "Complete the EN input to run the indicative FE check.");
      } else schedule();
    }
  };
}
