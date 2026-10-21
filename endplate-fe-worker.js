// Module Web Worker: runs the end-plate FE check off the page's main thread.
import { runEndPlateFeAnalysis } from "./endplate-fe-core.js";

self.onmessage = async event => {
  try {
    const result = await runEndPlateFeAnalysis(event.data, (step, stepCount, displacement) => self.postMessage({ type: "progress", step, stepCount, displacement }));
    self.postMessage({ type: "done", result });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
