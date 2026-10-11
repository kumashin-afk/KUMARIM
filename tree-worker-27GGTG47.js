import {
  bakeCrownLight,
  generateTreeFamily,
  treeRadiusAt
} from "./chunk-FSJQKUMD.js";
import "./chunk-MLKGABMK.js";

// tree-worker.js
self.onmessage = ({ data }) => {
  try {
    const result = bakeCrownLight(generateTreeFamily(data)), transfer = [];
    result.branchAnchors = result.skeleton.filter((e) => e.detail !== "virtual").map((e) => ({ id: e.id, parent: e.parent, point: e.p[3], radius: treeRadiusAt(e, 1), kind: e.detail }));
    result.rootProfile = result.skeleton[0];
    delete result.skeleton;
    delete result.anchors;
    for (const lod of [result.near, result.far, result.far2]) if (lod) for (const part of [lod.wood, lod.leaf]) for (const attr of Object.values(part)) transfer.push(attr.buffer);
    if (result.crownGrid) transfer.push(result.crownGrid.data.buffer);
    self.postMessage({ result }, transfer);
  } catch (error) {
    self.postMessage({ error: error.stack || String(error) });
  }
};
