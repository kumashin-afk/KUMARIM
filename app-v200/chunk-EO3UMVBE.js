// geometry.js
var clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
function stableHash(seed) {
  let h = 2166136261;
  for (let k = 0; k < arguments.length; k++) {
    if (k) {
      h ^= 124;
      h = Math.imul(h, 16777619);
    }
    const v = arguments[k];
    if (v === null || v === void 0) continue;
    const s = typeof v === "string" ? v : String(v);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2146121005);
  h ^= h >>> 15;
  h = Math.imul(h, 2221713035);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function distanceSegment(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, den = dx * dx + dz * dz, t = den ? clamp(((x - a.x) * dx + (z - a.z) * dz) / den) : 0;
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}
function boundsOf(points, pad = 0) {
  return { minX: Math.min(...points.map((p) => p.x)) - pad, minZ: Math.min(...points.map((p) => p.z)) - pad, maxX: Math.max(...points.map((p) => p.x)) + pad, maxZ: Math.max(...points.map((p) => p.z)) + pad };
}
function overlaps(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}
function localPoint(anchor, yaw, x, z) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: anchor.x + c * x + s * z, z: anchor.z - s * x + c * z };
}
function rectangle(anchor, yaw, width, depth, offsetX = 0, offsetZ = 0) {
  return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]].map(([x, z]) => localPoint(anchor, yaw, x + offsetX, z + offsetZ));
}
function distancePolygon(x, z, points) {
  let inside = false, d = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i];
    if (a.z > z !== b.z > z && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    d = Math.min(d, distanceSegment(x, z, a, b));
  }
  return inside ? 0 : d;
}
function intersectsReservation(r, x, z, radius = 0) {
  if (r.shape === "circle") return Math.hypot(x - r.x, z - r.z) <= r.radius + radius;
  if (r.shape === "polygon") return distancePolygon(x, z, r.points) <= radius;
  for (let i = 1; i < r.points.length; i++) if (distanceSegment(x, z, r.points[i - 1], r.points[i]) <= r.width / 2 + radius) return true;
  return false;
}
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const v of Object.values(value)) freezeDeep(v);
  return Object.freeze(value);
}

// reservation-context.js
var worlds = /* @__PURE__ */ new WeakMap();
var EMPTY = Object.freeze({ all: Object.freeze([]), layers: Object.freeze(Object.fromEntries(["trees", "treeCrowns", "rocks", "decor", "groundcover", "occupied"].map((k) => [k, Object.freeze([])]))) });
var overlap = (a, b, pad = 0) => a.minX <= b.maxX + pad && a.maxX >= b.minX - pad && a.minZ <= b.maxZ + pad && a.maxZ >= b.minZ - pad;
var bounds = (points) => ({ minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)), minZ: Math.min(...points.map((p) => p.z)), maxZ: Math.max(...points.map((p) => p.z)) });
var cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function segmentsCross(a, b, c, d) {
  const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b);
  if (Math.abs(ac) < 1e-9 && distanceSegment(c.x, c.z, a, b) < 1e-8) return true;
  if (Math.abs(ad) < 1e-9 && distanceSegment(d.x, d.z, a, b) < 1e-8) return true;
  return ac > 0 !== ad > 0 && ca > 0 !== cb > 0;
}
function segmentDistance(a, b, c, d) {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(distanceSegment(a.x, a.z, c, d), distanceSegment(b.x, b.z, c, d), distanceSegment(c.x, c.z, a, b), distanceSegment(d.x, d.z, a, b));
}
function cacheFor(world) {
  const planner = world.worldPlanner;
  let state = worlds.get(world);
  if (!state || state.planner !== planner) {
    state = { planner, queries: 0, chunks: /* @__PURE__ */ new Map(), contexts: /* @__PURE__ */ new Map() };
    worlds.set(world, state);
  }
  return state;
}
function chunkReservations(state, cx, cz) {
  const key = cx + "," + cz;
  let result = state.chunks.get(key);
  if (result) return result;
  state.queries++;
  result = Object.freeze(state.planner.queryChunk(cx, cz).reservations.filter((r) => r.ownerId !== "legacy" && !r.legacy));
  if (state.chunks.size >= 1024) state.chunks.delete(state.chunks.keys().next().value);
  state.chunks.set(key, result);
  return result;
}
function reservationContext(world, c) {
  if (!world.worldPlanner?.queryChunk) return EMPTY;
  const state = cacheFor(world), key = c.cx + "," + c.cz;
  let context = state.contexts.get(key);
  if (context) return context;
  const area = { minX: c.cx * 64 - 64, minZ: c.cz * 64 - 64, maxX: (c.cx + 2) * 64, maxZ: (c.cz + 2) * 64 }, unique = /* @__PURE__ */ new Map();
  for (const r of world.fixedReservations || []) if (overlap(area, r.bounds)) unique.set(r.id, r);
  for (const r of world.hydrology?.reservations(area) || []) unique.set(r.id, r);
  for (let z = c.cz - 1; z <= c.cz + 1; z++) for (let x = c.cx - 1; x <= c.cx + 1; x++) for (const r of chunkReservations(state, x, z)) unique.set(r.id, r);
  if (!unique.size) context = EMPTY;
  else {
    const all = Object.freeze([...unique.values()].sort((a, b) => a.id.localeCompare(b.id))), layers = {};
    for (const layer of ["trees", "treeCrowns", "rocks", "decor", "groundcover"]) layers[layer] = Object.freeze(all.filter((r) => r.layers.includes(layer)));
    layers.occupied = Object.freeze(all.filter((r) => r.shape === "polygon" && r.layers.includes("decor")));
    context = Object.freeze({ all, layers: Object.freeze(layers) });
  }
  if (state.contexts.size >= 1024) state.contexts.delete(state.contexts.keys().next().value);
  state.contexts.set(key, context);
  return context;
}
function reservationAllows(context, layer, x, z, radius = 0) {
  for (const r of context.layers[layer] || []) {
    const b = r.bounds;
    if (x + radius < b.minX || x - radius > b.maxX || z + radius < b.minZ || z - radius > b.maxZ) continue;
    if (r.shape === "polygon") {
      const ring = immutableRingBounds(r.points);
      if (ring) {
        if (indexedPolygonContains(r.points, ring, x, z, radius)) return false;
        continue;
      }
    }
    if (intersectsReservation(r, x, z, radius)) return false;
  }
  return true;
}
function reservationAllowsPolygon(context, layer, points, pad = 0) {
  const list = context.layers[layer] || [];
  if (!list.length) return true;
  const footprintBounds = bounds(points);
  for (const r of list) {
    if (!overlap(footprintBounds, r.bounds, pad)) continue;
    if (r.shape === "polyline" && Number.isFinite(r.width / 2 + pad) && r.width / 2 + pad >= 0) {
      const cached = immutableSegmentBounds(r.points);
      if (cached) {
        if (indexedPolylineIntersects(r, points, footprintBounds, r.width / 2 + pad, cached)) return false;
        continue;
      }
    }
    if (r.shape === "polygon") {
      const ring = immutableRingBounds(r.points);
      if (ring) {
        if (indexedPolygonIntersects(r.points, points, footprintBounds, pad, ring)) return false;
        continue;
      }
    }
    if (points.some((p) => intersectsReservation(r, p.x, p.z, pad))) return false;
    if (r.shape === "circle") {
      if (distancePolygon(r.x, r.z, points) <= r.radius + pad) return false;
      continue;
    }
    const extra = r.shape === "polyline" ? r.width / 2 : 0;
    if (r.points.some((p) => distancePolygon(p.x, p.z, points) <= extra + pad)) return false;
    const end = r.shape === "polygon" ? r.points.length : r.points.length - 1;
    for (let i = 0; i < points.length; i++) for (let j = 0; j < end; j++) if (segmentDistance(points[i], points[(i + 1) % points.length], r.points[j], r.points[(j + 1) % r.points.length]) <= extra + pad) return false;
  }
  return true;
}
function reservationCacheStats(world) {
  const s = worlds.get(world);
  return s ? { queries: s.queries, chunks: s.chunks.size, contexts: s.contexts.size, chunkLimit: 1024, contextLimit: 1024 } : { queries: 0, chunks: 0, contexts: 0, chunkLimit: 1024, contextLimit: 1024 };
}
function clearReservationCache(world) {
  worlds.delete(world);
}
function convexFootprint(points) {
  const ordered = points.slice().sort((a, b) => a.x - b.x || a.z - b.z), unique = ordered.filter((p, i) => !i || p.x !== ordered[i - 1].x || p.z !== ordered[i - 1].z), lower = [], upper = [];
  for (const p of unique) {
    while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 1e-10) lower.pop();
    lower.push(p);
  }
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 1e-10) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
var segmentBoundsCache = /* @__PURE__ */ new WeakMap();
function immutableSegmentBounds(points) {
  let cached = segmentBoundsCache.get(points);
  if (cached !== void 0) return cached;
  if (!Object.isFrozen(points) || points.length < 2) return null;
  if (!points.every((p, i) => Object.getOwnPropertyDescriptor(points, String(i))?.value === p && Object.isFrozen(p) && Number.isFinite(Object.getOwnPropertyDescriptor(p, "x")?.value) && Number.isFinite(Object.getOwnPropertyDescriptor(p, "z")?.value))) {
    segmentBoundsCache.set(points, null);
    return null;
  }
  cached = new Float64Array((points.length - 1) * 4);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], k = i * 4;
    cached[k] = Math.min(a.x, b.x);
    cached[k + 1] = Math.max(a.x, b.x);
    cached[k + 2] = Math.min(a.z, b.z);
    cached[k + 3] = Math.max(a.z, b.z);
  }
  segmentBoundsCache.set(points, cached);
  return cached;
}
function indexedPolylineIntersects(r, points, bounds2, reach, index) {
  const margin = reach + 1e-8 + 32 * Number.EPSILON * Math.max(1, Math.abs(bounds2.minX), Math.abs(bounds2.maxX), Math.abs(bounds2.minZ), Math.abs(bounds2.maxZ));
  for (let j = 0; j < r.points.length - 1; j++) {
    const k = j * 4;
    if (bounds2.minX > index[k + 1] + margin || bounds2.maxX < index[k] - margin || bounds2.minZ > index[k + 3] + margin || bounds2.maxZ < index[k + 2] - margin) continue;
    const a = r.points[j], b = r.points[j + 1];
    for (const p of points) if (distanceSegment(p.x, p.z, a, b) <= reach) return true;
    if (distancePolygon(a.x, a.z, points) <= reach || distancePolygon(b.x, b.z, points) <= reach) return true;
    for (let i = 0; i < points.length; i++) if (segmentDistance(points[i], points[(i + 1) % points.length], a, b) <= reach) return true;
  }
  return false;
}
var ringBoundsCache = /* @__PURE__ */ new WeakMap();
function immutableRingBounds(points) {
  let cached = ringBoundsCache.get(points);
  if (cached !== void 0) return cached;
  if (!Object.isFrozen(points) || points.length < 3 || !points.every((p, i) => Object.getOwnPropertyDescriptor(points, String(i))?.value === p && Object.isFrozen(p) && Number.isFinite(Object.getOwnPropertyDescriptor(p, "x")?.value) && Number.isFinite(Object.getOwnPropertyDescriptor(p, "z")?.value))) {
    ringBoundsCache.set(points, null);
    return null;
  }
  const n = points.length;
  cached = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n], k = i * 4;
    cached[k] = Math.min(a.x, b.x);
    cached[k + 1] = Math.max(a.x, b.x);
    cached[k + 2] = Math.min(a.z, b.z);
    cached[k + 3] = Math.max(a.z, b.z);
  }
  ringBoundsCache.set(points, cached);
  return cached;
}
function insideRing(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i];
    if (a.z > z !== b.z > z && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
function ringMargin(reach, b) {
  return reach + 1e-8 + 32 * Number.EPSILON * Math.max(1, Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minZ), Math.abs(b.maxZ));
}
function indexedPolygonContains(points, index, x, z, radius) {
  const margin = ringMargin(radius, { minX: x, maxX: x, minZ: z, maxZ: z }), n = points.length;
  for (let j = 0; j < n; j++) {
    const k = j * 4;
    if (x > index[k + 1] + margin || x < index[k] - margin || z > index[k + 3] + margin || z < index[k + 2] - margin) continue;
    if (distanceSegment(x, z, points[j], points[(j + 1) % n]) <= radius) return true;
  }
  return insideRing(points, x, z);
}
function indexedPolygonIntersects(ring, points, bounds2, pad, index) {
  const margin = ringMargin(pad, bounds2), n = ring.length;
  for (let j = 0; j < n; j++) {
    const k = j * 4;
    if (bounds2.minX > index[k + 1] + margin || bounds2.maxX < index[k] - margin || bounds2.minZ > index[k + 3] + margin || bounds2.maxZ < index[k + 2] - margin) continue;
    const a = ring[j], b = ring[(j + 1) % n];
    for (const p of points) if (distanceSegment(p.x, p.z, a, b) <= pad) return true;
    if (distancePolygon(a.x, a.z, points) <= pad || distancePolygon(b.x, b.z, points) <= pad) return true;
    for (let i = 0; i < points.length; i++) if (segmentDistance(points[i], points[(i + 1) % points.length], a, b) <= pad) return true;
  }
  return insideRing(ring, points[0].x, points[0].z);
}

export {
  clamp,
  stableHash,
  distanceSegment,
  boundsOf,
  overlaps,
  localPoint,
  rectangle,
  distancePolygon,
  intersectsReservation,
  freezeDeep,
  reservationContext,
  reservationAllows,
  reservationAllowsPolygon,
  reservationCacheStats,
  clearReservationCache,
  convexFootprint
};
