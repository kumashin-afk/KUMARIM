import {
  buildHandMeshes,
  paintHandToolTextures,
  paintPickableAtlas
} from "./chunk-7PWMME35.js";
import "./chunk-MLKGABMK.js";

// texture-paint-worker.js
self.onmessage = (event) => {
  const kind = event.data;
  if (kind === "pickables") {
    const levels = paintPickableAtlas();
    self.postMessage({ kind, result: levels }, levels.map((level) => level.data.buffer));
  } else if (kind === "tools") {
    const painted = paintHandToolTextures(), buffers = [];
    for (const part of Object.values(painted)) buffers.push(part.rgba.buffer, part.normal.buffer);
    self.postMessage({ kind, result: painted }, buffers);
  } else if (kind === "hands" || kind === "hands-light") {
    const { meshes, buffers } = buildHandMeshes(kind === "hands" ? 24e-4 : 32e-4);
    self.postMessage({ kind, result: meshes }, buffers);
  }
};
