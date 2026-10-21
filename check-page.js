// Page controller shared by the connection check pages: builds the input form
// from the field descriptions of the calculation module, validates and checks
// while typing, and renders the drawing and the results. Everything runs in
// the visitor's browser.
import { CONNECTIONS_VERSION, exampleValues, fieldApplies } from "./lib/index.js";
import { checksTableHtml, escapeHtml, notesHtml, summaryHtml, valuesHtml } from "./check-view.js";

const $ = selector => document.querySelector(selector);

function fieldHtml(field) {
  const id = `f-${field.name}`;
  const note = field.note ? `<span class="field-note">${escapeHtml(field.note)}</span>` : "";
  if (field.kind === "checkbox") {
    return `<div class="field field-check" data-field="${field.name}"><label for="${id}"><input type="checkbox" id="${id}" name="${field.name}"><span>${field.label}</span></label>${note}</div>`;
  }
  const control = field.kind === "select"
    ? `<select id="${id}" name="${field.name}">${field.options.map(option => `<option>${escapeHtml(option)}</option>`).join("")}</select>`
    : `<input id="${id}" name="${field.name}" inputmode="${field.kind === "integer" ? "numeric" : "decimal"}" autocomplete="off"${field.optional ? ` placeholder="—"` : ""}>`;
  return `<div class="field" data-field="${field.name}"><label for="${id}">${field.label}${note}</label>${control}<span class="unit">${escapeHtml(field.unit)}</span></div>`;
}

function formHtml(fields) {
  const groups = [];
  for (const field of fields) {
    let group = groups.find(item => item.title === field.group);
    if (!group) groups.push(group = { title: field.group, fields: [] });
    group.fields.push(field);
  }
  return groups.map(group => `<fieldset><legend>${escapeHtml(group.title)}</legend>${group.fields.map(fieldHtml).join("")}</fieldset>`).join("");
}

/**
 * config: { fields, normalise(raw), check(input), drawings(input, result) → HTML,
 * onUpdate(input, result) (optional: called after every check, with nulls when the input is invalid) }
 */
export function mountCheckPage(config) {
  const { fields, normalise, check, drawings, onUpdate = () => {} } = config;
  const form = $("[data-input-form]");
  const status = $("[data-form-status]");
  $("[data-fields]").innerHTML = formHtml(fields);
  const element = name => form.elements.namedItem(name);

  function selectValues() {
    const values = {};
    for (const field of fields) if (field.kind === "select" || field.kind === "checkbox") {
      values[field.name] = field.kind === "checkbox" ? element(field.name).checked : element(field.name).value;
    }
    return values;
  }

  function readForm() {
    const selects = selectValues();
    const raw = {};
    for (const field of fields) {
      const applies = fieldApplies(field, selects);
      form.querySelector(`[data-field="${field.name}"]`).hidden = !applies;
      if (!applies) continue;
      if (field.kind === "select" || field.kind === "checkbox") { raw[field.name] = selects[field.name]; continue; }
      const text = element(field.name).value.trim();
      if (text === "") continue;
      const value = Number(text.replace(",", "."));
      raw[field.name] = Number.isFinite(value) ? value : text;
    }
    return raw;
  }

  function markInvalid(messages) {
    for (const input of form.querySelectorAll("input, select")) {
      const invalid = messages.some(message => message.startsWith(`${input.name} `));
      input.setAttribute("aria-invalid", invalid ? "true" : "false");
    }
  }

  function update() {
    const normalised = normalise(readForm());
    if (!normalised.ok) {
      markInvalid(normalised.errors);
      status.innerHTML = `<ul>${normalised.errors.map(message => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`;
      for (const target of ["[data-summary]", "[data-checks]", "[data-values]"]) $(target).innerHTML = "";
      document.body.dataset.checkStatus = "invalid";
      onUpdate(null, null);
      return;
    }
    markInvalid([]);
    status.innerHTML = "";
    let result;
    try {
      result = check(normalised.input);
    } catch (error) {
      status.innerHTML = `<p class="error">The check could not be completed: ${escapeHtml(error.message)}</p>`;
      document.body.dataset.checkStatus = "error";
      onUpdate(null, null);
      return;
    }
    $("[data-drawings]").innerHTML = drawings(normalised.input, result);
    $("[data-summary]").innerHTML = summaryHtml(result);
    $("[data-checks]").innerHTML = checksTableHtml(result);
    $("[data-values]").innerHTML = valuesHtml(result);
    $("[data-assumptions]").innerHTML = notesHtml(result);
    document.body.dataset.checkStatus = result.status;
    document.body.dataset.maxUtilisation = result.maxUtilisation.toFixed(4);
    onUpdate(normalised.input, result);
  }

  function setValues(values) {
    for (const field of fields) {
      const control = element(field.name);
      const value = values[field.name] ?? field.default;
      if (field.kind === "checkbox") control.checked = value === true;
      else control.value = value === undefined ? "" : String(value);
    }
    update();
  }

  form.addEventListener("input", update);
  form.addEventListener("change", update);
  form.addEventListener("submit", event => event.preventDefault());
  $("[data-reset]").addEventListener("click", () => setValues(exampleValues(fields)));
  $("[data-print]")?.addEventListener("click", () => window.print());
  window.addEventListener("beforeprint", () => { for (const details of document.querySelectorAll("details")) details.open = true; });
  $("[data-version]").textContent = `Tool version ${CONNECTIONS_VERSION}`;
  setValues(exampleValues(fields));
}
