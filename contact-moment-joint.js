import { CONTACT_JOINT_FIELDS, normaliseContactJointInput, checkContactJoint } from "./lib/index.js";
import { mountCheckPage } from "./check-page.js";
import { contactMomentJointSvg } from "./timber-special-drawings.js";
import { mountContactJointFePanel } from "./contact-joint-fe-panel.js";

const fe = mountContactJointFePanel(document.querySelector("[data-contact-fe]"));

mountCheckPage({
  fields: CONTACT_JOINT_FIELDS,
  normalise: normaliseContactJointInput,
  check: checkContactJoint,
  drawings: (input, result) => contactMomentJointSvg(input, result),
  onUpdate: (input, result) => fe.update(input, result)
});
