import {
  GLTFLoader
} from "./chunk-RLLM4NEF.js";
import {
  LoaderUtils
} from "./chunk-7DPYFN6K.js";
import "./chunk-MLKGABMK.js";

// model-pack.js
var MODEL_PACK_ACTIVE = globalThis.KUMARIM_MODEL_PACK === "gltf-json";
var GLB_MAGIC = 1179937895;
var JSON_CHUNK = 1313821514;
var BIN_CHUNK = 5130562;
function decodeBase64(text) {
  const binary = atob(text), out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function gltfJsonToGlb(json) {
  let bin = null;
  const buffers = json.buffers || [];
  if (buffers.length) {
    if (buffers.length !== 1) throw new Error("Model pack expects one embedded buffer");
    const match = /^data:[^;,]*;base64,(.*)$/s.exec(buffers[0].uri || "");
    if (!match) throw new Error("Model pack buffer must be an embedded base64 data URI");
    bin = decodeBase64(match[1]);
    if (bin.byteLength !== buffers[0].byteLength) throw new Error("Model pack buffer length mismatch");
    json = { ...json, buffers: [{ byteLength: buffers[0].byteLength }] };
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(jsonBytes.length / 4) * 4, binLength = bin ? Math.ceil(bin.length / 4) * 4 : 0;
  const total = 20 + jsonLength + (bin ? 8 + binLength : 0);
  const out = new ArrayBuffer(total), view = new DataView(out), bytes = new Uint8Array(out);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, JSON_CHUNK, true);
  bytes.set(jsonBytes, 20);
  bytes.fill(32, 20 + jsonBytes.length, 20 + jsonLength);
  if (bin) {
    const at = 20 + jsonLength;
    view.setUint32(at, binLength, true);
    view.setUint32(at + 4, BIN_CHUNK, true);
    bytes.set(bin, at + 8);
  }
  return out;
}
if (MODEL_PACK_ACTIVE) {
  const originalLoad = GLTFLoader.prototype.load;
  GLTFLoader.prototype.load = function(url, onLoad, onProgress, onError) {
    if (typeof url !== "string" || !/\.glb$/i.test(url.split(/[?#]/)[0])) return originalLoad.call(this, url, onLoad, onProgress, onError);
    const scope = this, packUrl = url.replace(/\.glb(?=$|[?#])/i, ".gltf.json");
    const resourcePath = this.resourcePath !== "" ? this.resourcePath : this.path !== "" ? LoaderUtils.resolveURL(LoaderUtils.extractUrlBase(url), this.path) : LoaderUtils.extractUrlBase(url);
    const fail = (error) => {
      if (onError) onError(error);
      else console.error(error);
      scope.manager.itemError(url);
      scope.manager.itemEnd(url);
    };
    this.manager.itemStart(url);
    fetch(LoaderUtils.resolveURL(packUrl, this.path), { credentials: this.withCredentials ? "include" : "same-origin" }).then((response) => {
      if (!response.ok) throw new Error(`Model pack ${packUrl}: HTTP ${response.status}`);
      return response.json();
    }).then((json) => scope.parse(gltfJsonToGlb(json), resourcePath, (gltf) => {
      onLoad(gltf);
      scope.manager.itemEnd(url);
    }, fail)).catch(fail);
  };
}
export {
  MODEL_PACK_ACTIVE,
  gltfJsonToGlb
};
