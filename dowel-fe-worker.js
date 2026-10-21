// Module Web Worker: runs the FE verification of a dowel-type fastener off the page's main thread.
import { verifyFastenerFe } from "./lib/index.js";

self.onmessage = event => {
  const { id, spec } = event.data;
  try {
    self.postMessage({ id, type: "done", result: verifyFastenerFe(spec) });
  } catch (error) {
    self.postMessage({ id, type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
