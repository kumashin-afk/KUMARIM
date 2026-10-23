import {
  clipOceanDomain
} from "./chunk-SLVIRNLQ.js";
import "./chunk-HGFZA34L.js";
import "./chunk-MLKGABMK.js";

// ocean-domain-worker.js
var source = null;
var attributeTypes = null;
var now = () => globalThis.performance?.now?.() ?? Date.now();
self.addEventListener("message", ({ data }) => {
  const serial = data?.serial;
  try {
    if (data?.type === "init") {
      if (source) throw new Error("Ocean domain worker was already initialized");
      const candidate = data.source;
      if (!candidate?.attributes || !ArrayBuffer.isView(candidate.index)) throw new TypeError("Transferred indexed geometry source required");
      const types = {};
      for (const [name, attribute] of Object.entries(candidate.attributes)) {
        if (!ArrayBuffer.isView(attribute.array) || !attribute.array.BYTES_PER_ELEMENT) throw new TypeError(`Transferred typed ${name} attribute required`);
        types[name] = attribute.array.constructor;
      }
      source = candidate;
      attributeTypes = types;
      self.postMessage({ type: "ready" });
      return;
    }
    if (data?.type !== "build") throw new TypeError("Unknown ocean domain worker message");
    if (!source) throw new Error("Ocean domain worker is not initialized");
    if (!Number.isSafeInteger(serial) || serial < 0) throw new TypeError("A nonnegative integer build serial is required");
    const start = now();
    const clipped = clipOceanDomain(source, data.options);
    const attributes = {};
    const buffers = [];
    for (const [name, attribute] of Object.entries(clipped.attributes)) {
      const array = new attributeTypes[name](attribute.array);
      attributes[name] = { array, itemSize: attribute.itemSize, normalized: !!attribute.normalized };
      buffers.push(array.buffer);
    }
    const index = new Uint32Array(clipped.index);
    buffers.push(index.buffer);
    self.postMessage({
      type: "built",
      serial,
      result: { attributes, index, stats: clipped.stats },
      buildMs: now() - start
    }, buffers);
  } catch (error) {
    self.postMessage({ type: "error", serial, message: error instanceof Error ? error.message : String(error) });
  }
});
