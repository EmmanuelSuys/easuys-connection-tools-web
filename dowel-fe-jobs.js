// FE jobs (input of verifyFastenerFe) for the pages, from the page input and its EN result. Pure functions.
import { TIMBER_MEAN_DENSITY } from "./lib/index.js";

/** Timber-to-timber: the fastener with the embedment strengths at the angle of the force. */
export function timberTimberFeJob(input, result) {
  return {
    d: input.d,
    en: { Fk: result.perPlane.Fk, ropeUsed: result.perPlane.ropeUsed },
    spec: {
      configuration: input.shear === "single" ? "timber-single" : "timber-double",
      d: input.d, My: result.My, t1: input.t1, t2: input.t2, fh1: result.fh1, fh2: result.fh2,
      kser: result.Kser, weights: { w1: result.rhoMean1 ** 1.5, w2: result.rhoMean2 ** 1.5 }
    }
  };
}

/**
 * Steel-to-timber: one plate (thin/thick by t_s, interpolated), a slotted-in plate, or two outer plates. K_ser per
 * shear plane from EN 1995-1-1 Table 7.1 (bolts, dowels: rho_m^1.5 d / 23) times 2 for steel plates (7.1(3)).
 */
export function steelTimberFeJob(input, result) {
  const rhoM = TIMBER_MEAN_DENSITY[input.timberClass];
  const kser = 2 * rhoM ** 1.5 * input.d / 23;
  const common = { d: input.d, My: result.My, kser };
  const spec = input.configuration === "single" ? { ...common, configuration: "steel-single", t1: result.t, fh1: result.fhAlpha, ts: input.ts }
    : input.configuration === "slotted" ? { ...common, configuration: "steel-slotted", t1: result.t, fh1: result.fhAlpha }
      : { ...common, configuration: "steel-outer", t2: result.t, fh2: result.fhAlpha, ts: input.ts };
  return { d: input.d, en: { Fk: result.perPlane.Fk, ropeUsed: result.perPlane.ropeUsed }, spec };
}
