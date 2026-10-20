import {
  generateWorldData,
  worldDataTransfers
} from "./chunk-RO4SQODB.js";
import "./chunk-MLKGABMK.js";

// worldgen/world-worker.js
self.onmessage = ({ data }) => {
  if (data?.type !== "generate") return;
  try {
    let last = -1;
    const result = generateWorldData(data.seed, { onProgress: (p) => {
      const value = p.stage === "erosion" ? p.value * 0.92 : 0.92 + p.value * 0.08, step = Math.floor(value * 50);
      if (step !== last) {
        last = step;
        self.postMessage({ type: "progress", value });
      }
    } });
    self.postMessage({ type: "done", data: result }, worldDataTransfers(result));
  } catch (error) {
    self.postMessage({ type: "error", message: String(error?.stack || error) });
  }
};
