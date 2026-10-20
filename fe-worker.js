// Module Web Worker: runs the FE analysis off the page's main thread.
import { InputError, runBrowserAnalysis } from "./fe-core.js";

self.onmessage = async event => {
  try {
    const result = await runBrowserAnalysis(event.data.input, {
      design: event.data.design,
      onProgress: (step, stepCount, displacement) => self.postMessage({ type: "progress", step, stepCount, displacement })
    });
    self.postMessage({ type: "done", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      errors: error instanceof InputError ? error.errors : undefined
    });
  }
};
