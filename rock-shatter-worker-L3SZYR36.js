import {
  shatterRockGeometry,
  splitContactRock
} from "./chunk-Z4KTIP7W.js";
import "./chunk-HGFZA34L.js";
import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Vector3,
  three_module_exports
} from "./chunk-2ABRGHYR.js";
import "./chunk-MLKGABMK.js";

// rock-shatter-worker.js
function pack(geometry, transfer) {
  const position = geometry.attributes.position.array, normal = geometry.attributes.normal.array, uv = geometry.attributes.uv.array;
  const index = geometry.index.array instanceof Uint32Array ? geometry.index.array : Uint32Array.from(geometry.index.array);
  transfer.push(position.buffer, normal.buffer, uv.buffer, index.buffer);
  return { position, normal, uv, index, volume: Math.abs(geometry.userData.volume ?? 0), contactLocal: !!geometry.userData.contactLocal };
}
self.onmessage = ({ data }) => {
  const { sequence } = data;
  try {
    let geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(data.position, 3));
    geometry.setAttribute("normal", new BufferAttribute(data.normal, 3));
    geometry.setAttribute("uv", new BufferAttribute(data.uv, 2));
    if (data.index) geometry.setIndex(new BufferAttribute(data.index, 1));
    const matrix = new Matrix4().fromArray(data.matrix), transfer = [];
    let remaining = null, plane = null;
    if (data.bite) {
      const normal = new Vector3(...data.bite.normal).normalize(), tangent = new Vector3(-normal.z, 0, normal.x);
      if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0);
      tangent.normalize();
      const bitangent = new Vector3().crossVectors(normal, tangent);
      let seed = data.bite.seed >>> 0 || 1;
      const random = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
      for (let attempt = 0; attempt < 4 && !remaining; attempt++) {
        const shift = attempt ? 0.06 + random() * 0.1 : random() * 0.08, angle = random() * Math.PI * 2;
        const point = new Vector3(...data.bite.point).addScaledVector(tangent, Math.cos(angle) * shift).addScaledVector(bitangent, Math.sin(angle) * shift).addScaledVector(normal, -0.02 * attempt);
        const split = splitContactRock(three_module_exports, geometry, matrix, point, normal, { spin: random() * Math.PI * 2 });
        if (split) {
          remaining = split.remaining;
          plane = split.plane;
          split.detached.dispose();
          geometry = remaining;
        }
      }
    }
    const world = geometry.clone().applyMatrix4(matrix);
    const { pieces } = shatterRockGeometry(three_module_exports, world, data.options || {});
    const reply = { sequence, ok: true, plane, remaining: remaining ? pack(remaining, transfer) : null, pieces: pieces.map((piece) => pack(piece, transfer)) };
    self.postMessage(reply, [...new Set(transfer)]);
  } catch (error) {
    self.postMessage({ sequence, ok: false, error: String(error?.stack || error) });
  }
};
