import { MASONRY_FIXING_FIELDS, normaliseFields, normaliseMasonryFixingInput, checkMasonryFixing } from "./lib/index.js";
import { mountCheckPage } from "./check-page.js";
import { masonryFixingSvg } from "./timber-special-drawings.js";

const kinds = Object.keys(MASONRY_FIXING_FIELDS);
const kindField = { name: "kind", group: "Connection", label: "Fixing check", unit: "", kind: "select", options: kinds, default: "pocket-pin" };
const byName = new Map();
for (const kind of kinds) for (const field of MASONRY_FIXING_FIELDS[kind]) {
  const current = byName.get(field.name);
  if (!current) {
    byName.set(field.name, { ...field, showIf: { ...(field.showIf ?? {}), kind: [kind] } });
    continue;
  }
  current.showIf.kind.push(kind);
  if (field.showIf) for (const [name, allowed] of Object.entries(field.showIf)) {
    if (name === "kind") continue;
    current.showIf[name] = [...new Set([...(current.showIf[name] ?? []), ...allowed])];
  }
}
const fields = [kindField, ...byName.values()];

function normalise(raw) {
  const checked = normaliseFields(raw, fields);
  if (!checked.ok) return checked;
  const { kind, ...payload } = checked.values;
  return normaliseMasonryFixingInput(kind, payload);
}

mountCheckPage({
  fields,
  normalise,
  check: checkMasonryFixing,
  drawings: (input, result) => masonryFixingSvg(input, result)
});
