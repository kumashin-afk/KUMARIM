import {
  blockTransfers,
  buildLipRock,
  buildPitRock,
  buildUnderworldBlock,
  createUnderworldField,
  generateAbyss,
  rockTransfers
} from "./chunk-3ERKUAXH.js";
import "./chunk-MLKGABMK.js";

// underworld-worker.js
var field = null;
self.onmessage = ({ data }) => {
  const id = data.id;
  try {
    if (data.type === "init") {
      const interior = generateAbyss(data.plan.interiorInput);
      field = createUnderworldField(interior);
      self.postMessage({ type: "ready", id, result: interior });
      return;
    }
    if (data.type === "block") {
      if (!field) throw new Error("Underworld worker not initialised");
      const block = buildUnderworldBlock(field, data.bx, data.bz);
      self.postMessage({ type: "block", id, block }, blockTransfers(block));
      return;
    }
    if (data.type === "pit" || data.type === "lip") {
      const result = data.type === "lip" ? buildLipRock(data.lip, data.ground) : buildPitRock(data.pit, data.ground);
      self.postMessage({ type: data.type, id, result }, rockTransfers(result));
      return;
    }
    throw new Error("Unknown underworld job " + data.type);
  } catch (error) {
    self.postMessage({ type: "error", id, error: String(error?.stack || error) });
  }
};
