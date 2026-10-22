// Module Web Worker: runs the column base FE off the page's main thread.
import { InputError, runBasePlateFeBrowser } from "./baseplate-fe-core.js";

self.onmessage = async event => {
  try {
    const result = await runBasePlateFeBrowser(event.data.input, event.data.options, {
      onProgress: (step, stepCount, displacement, progress) => self.postMessage({ type: "progress", step, stepCount, displacement, progress })
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
