import { CONTACT_JOINT_FIELDS, normaliseContactJointInput, checkContactJoint } from "./lib/index.js";
import { mountCheckPage } from "./check-page.js";
import { contactMomentJointSvg } from "./timber-special-drawings.js";

mountCheckPage({
  fields: CONTACT_JOINT_FIELDS,
  normalise: normaliseContactJointInput,
  check: checkContactJoint,
  drawings: (input, result) => contactMomentJointSvg(input, result)
});
