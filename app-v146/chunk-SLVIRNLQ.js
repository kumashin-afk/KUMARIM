import {
  WORKER_NAMES,
  reportWorker
} from "./chunk-HGFZA34L.js";

// ocean-domain.js
var DEFAULT_SEGMENTS = 96;
var EPSILON = 1e-10;
var now = () => globalThis.performance?.now?.() ?? Date.now();
var finite = Number.isFinite;
function positive(value, name) {
  if (!finite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite`);
  return value;
}
function segmentDistanceSquared(a, b) {
  const dx = b.u - a.u, dz = b.v - a.v, d = dx * dx + dz * dz;
  const t = d ? Math.max(0, Math.min(1, -(a.u * dx + a.v * dz) / d)) : 0;
  const x = a.u + t * dx, z = a.v + t * dz;
  return x * x + z * z;
}
function triangleMeetsCircle(a, b, c, radiusSquared) {
  const ab = a.u * b.v - a.v * b.u;
  const bc = b.u * c.v - b.v * c.u;
  const ca = c.u * a.v - c.v * a.u;
  if (ab >= 0 && bc >= 0 && ca >= 0 || ab <= 0 && bc <= 0 && ca <= 0) return true;
  return Math.min(segmentDistanceSquared(a, b), segmentDistanceSquared(b, c), segmentDistanceSquared(c, a)) <= radiusSquared;
}
function clipOceanDomain(source, {
  anchorX = 0,
  anchorZ = 0,
  centerX = 0,
  centerZ = 0,
  radiusX,
  radiusZ,
  segments = DEFAULT_SEGMENTS,
  padding = 0,
  maxInputTriangles = 2e5,
  maxOutputTriangles = 24e4,
  maxPlaneTests = 2e6
} = {}) {
  if (![anchorX, anchorZ, centerX, centerZ, padding].every(finite) || padding < 0) throw new RangeError("Finite domain coordinates and nonnegative padding required");
  radiusX = positive(radiusX, "radiusX") + padding;
  radiusZ = positive(radiusZ, "radiusZ") + padding;
  if (!Number.isInteger(segments) || segments < 16 || segments > 256) throw new RangeError("Domain polygon segments must be between 16 and 256");
  if (![maxInputTriangles, maxOutputTriangles, maxPlaneTests].every((v) => Number.isInteger(v) && v > 0)) throw new RangeError("Positive geometry work budgets required");
  const input = source?.attributes, position = input?.position, sourceIndex = source?.index;
  if (!position || position.itemSize !== 3 || !position.array || position.array.length % 3 || !sourceIndex || sourceIndex.length % 3) throw new TypeError("Indexed position geometry required");
  const vertexCount = position.array.length / 3, inputTriangles = sourceIndex.length / 3;
  if (!vertexCount || inputTriangles > maxInputTriangles) throw new RangeError("Source geometry exceeds input budget or is empty");
  const names = Object.keys(input), attributes = {};
  for (const name of names) {
    const attribute = input[name];
    if (!Number.isInteger(attribute.itemSize) || attribute.itemSize < 1 || attribute.itemSize > 16 || !attribute.array || attribute.array.length !== vertexCount * attribute.itemSize) throw new TypeError(`Invalid ${name} attribute`);
    for (const value of attribute.array) if (!finite(value)) throw new TypeError(`Nonfinite ${name} attribute`);
    attributes[name] = { array: Array.from(attribute.array), itemSize: attribute.itemSize, normalized: !!attribute.normalized };
  }
  const step = Math.PI * 2 / segments, circumradius = 1 / Math.cos(Math.PI / segments);
  const normals = Array.from({ length: segments }, (_, i) => [Math.cos(i * step), Math.sin(i * step)]);
  const vertices = Array.from({ length: vertexCount }, (_, index2) => {
    const u = (position.array[index2 * 3] + anchorX - centerX) / radiusX;
    const v = (position.array[index2 * 3 + 2] + anchorZ - centerZ) / radiusZ;
    const r2 = u * u + v * v;
    let inside = r2 <= 1;
    if (!inside && r2 <= circumradius * circumradius + EPSILON) {
      let nearest = Math.round(Math.atan2(v, u) / step) % segments;
      if (nearest < 0) nearest += segments;
      const [nx, nz] = normals[nearest];
      inside = u * nx + v * nz <= 1 + EPSILON;
    }
    return { index: index2, u, v, inside };
  });
  const stats = {
    inputTriangles,
    outputTriangles: 0,
    inputVertices: vertexCount,
    outputVertices: vertexCount,
    insideTriangles: 0,
    outsideTriangles: 0,
    splitTriangles: 0,
    discardedTriangles: 0,
    skirtTriangles: 0,
    planeTests: 0,
    segments,
    padding,
    maximumPolygonExcess: Math.max(radiusX, radiusZ) * (circumradius - 1)
  };
  const index = [];
  function valueAt(vertex, name, component) {
    return vertex.values ? vertex.values[name][component] : input[name].array[vertex.index * input[name].itemSize + component];
  }
  function intersect(a, b, da, db) {
    const t = Math.max(0, Math.min(1, da / (da - db)));
    if (t <= EPSILON) return a;
    if (t >= 1 - EPSILON) return b;
    const values = {};
    for (const name of names) {
      values[name] = Array.from({ length: input[name].itemSize }, (_, k) => {
        const av = valueAt(a, name, k), bv = valueAt(b, name, k);
        return av + (bv - av) * t;
      });
    }
    return { u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, values };
  }
  function outputVertex(vertex) {
    if (vertex.index !== void 0) return vertex.index;
    vertex.index = attributes.position.array.length / 3;
    for (const name of names) attributes[name].array.push(...vertex.values[name]);
    return vertex.index;
  }
  function emit(polygon) {
    for (let j = 1; j + 1 < polygon.length; j++) {
      const a = polygon[0], b = polygon[j], c = polygon[j + 1];
      const area = (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);
      if (Math.abs(area) < 1e-18) continue;
      if (stats.outputTriangles >= maxOutputTriangles) throw new RangeError("Ocean domain output triangle budget exceeded");
      index.push(outputVertex(a), outputVertex(b), outputVertex(c));
      stats.outputTriangles++;
    }
  }
  function emitOriginal(a, b, c) {
    const area = (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);
    if (Math.abs(area) < 1e-18) return;
    if (stats.outputTriangles >= maxOutputTriangles) throw new RangeError("Ocean domain output triangle budget exceeded");
    index.push(a.index, b.index, c.index);
    stats.outputTriangles++;
  }
  for (let i = 0; i < sourceIndex.length; i += 3) {
    const ai = sourceIndex[i], bi = sourceIndex[i + 1], ci = sourceIndex[i + 2];
    if (!Number.isInteger(ai) || !Number.isInteger(bi) || !Number.isInteger(ci) || Math.min(ai, bi, ci) < 0 || Math.max(ai, bi, ci) >= vertexCount) throw new RangeError("Invalid source triangle index");
    const a = vertices[ai], b = vertices[bi], c = vertices[ci], sp = input.spacing;
    const skirt = sp && (sp.array[ai * sp.itemSize] < 0 || sp.array[bi * sp.itemSize] < 0 || sp.array[ci * sp.itemSize] < 0);
    if (skirt) stats.skirtTriangles++;
    if (a.inside && b.inside && c.inside) {
      if (skirt) throw new RangeError("Ocean exclusion reaches the horizon skirt");
      stats.insideTriangles++;
      stats.discardedTriangles++;
      continue;
    }
    const minU = Math.min(a.u, b.u, c.u), maxU = Math.max(a.u, b.u, c.u);
    const minV = Math.min(a.v, b.v, c.v), maxV = Math.max(a.v, b.v, c.v);
    if (minU > circumradius || maxU < -circumradius || minV > circumradius || maxV < -circumradius || !triangleMeetsCircle(a, b, c, circumradius * circumradius)) {
      emitOriginal(a, b, c);
      stats.outsideTriangles++;
      continue;
    }
    let remaining = [a, b, c];
    const fragments = [];
    for (const [nx, nz] of normals) {
      if (!remaining.length) break;
      const inside = [], outside = [];
      for (let j = 0; j < remaining.length; j++) {
        const p = remaining[j], q = remaining[(j + 1) % remaining.length];
        const dp = nx * p.u + nz * p.v - 1, dq = nx * q.u + nz * q.v - 1;
        const pInside = dp <= 0, qInside = dq <= 0;
        if (++stats.planeTests > maxPlaneTests) throw new RangeError("Ocean domain clipping work budget exceeded");
        (pInside ? inside : outside).push(p);
        if (pInside !== qInside) {
          const crossing = intersect(p, q, dp, dq);
          inside.push(crossing);
          outside.push(crossing);
        }
      }
      if (outside.length >= 3) fragments.push(outside);
      remaining = inside;
    }
    if (skirt) {
      if (remaining.length >= 3) throw new RangeError("Ocean exclusion reaches the horizon skirt");
      emitOriginal(a, b, c);
      stats.outsideTriangles++;
      continue;
    }
    const before = stats.outputTriangles;
    for (const fragment of fragments) emit(fragment);
    stats.splitTriangles++;
    if (before === stats.outputTriangles) stats.discardedTriangles++;
  }
  stats.outputVertices = attributes.position.array.length / 3;
  return { attributes, index, stats };
}
function copyGeometrySource(geometry) {
  const index = geometry.getIndex(), attributes = {};
  if (!index) throw new TypeError("Ocean geometry must be indexed");
  if (geometry.groups.length) throw new TypeError("Ocean domain expects a single ungrouped material");
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.getAttribute(name), data = attribute.isInterleavedBufferAttribute ? attribute.data : attribute;
    const original = data.array, array = new original.constructor(attribute.count * attribute.itemSize);
    const stride = attribute.isInterleavedBufferAttribute ? data.stride : attribute.itemSize;
    const offset = attribute.isInterleavedBufferAttribute ? attribute.offset : 0;
    for (let i = 0; i < attribute.count; i++) for (let k = 0; k < attribute.itemSize; k++) array[i * attribute.itemSize + k] = original[i * stride + offset + k];
    attributes[name] = { array, itemSize: attribute.itemSize, normalized: attribute.normalized };
  }
  return { attributes, index: new index.array.constructor(index.array) };
}
function identityParent(parent) {
  if (!parent) return true;
  parent.updateWorldMatrix(true, false);
  return parent.matrixWorld.elements.every((value, i) => Math.abs(value - (i % 5 === 0 ? 1 : 0)) < 1e-9);
}
function createOceanDomain(THREE, body, island) {
  const params = island?.params ?? island;
  if (!body?.isMesh || !body.geometry || !params) throw new TypeError("A returned ocean Mesh and island parameters are required");
  const oldParent = body.parent, originalGeometry = body.geometry;
  if (!identityParent(oldParent) || Math.abs(body.rotation.x) + Math.abs(body.rotation.y) + Math.abs(body.rotation.z) > 1e-9 || ![body.scale.x, body.scale.y, body.scale.z].every((v) => Math.abs(v - 1) < 1e-9)) throw new RangeError("Ocean domain requires an unrotated, unscaled mesh under an identity world parent");
  const keep = island?.keep;
  const domain = keep ? { centerX: keep.x, centerZ: keep.z, radiusX: positive(keep.r, "island.keep.r"), radiusZ: keep.r, segments: DEFAULT_SEGMENTS } : {
    centerX: params.centerX,
    centerZ: params.centerZ,
    radiusX: positive(params.radiusX, "island.radiusX") * positive(params.keepRadius, "island.keepRadius"),
    radiusZ: positive(params.radiusZ, "island.radiusZ") * params.keepRadius,
    segments: DEFAULT_SEGMENTS
  };
  if (![domain.centerX, domain.centerZ].every(finite)) throw new TypeError("Finite island center required");
  const source = copyGeometrySource(originalGeometry);
  const ordinaryRadius = positive(originalGeometry.userData.outerRadius, "ocean geometry outerRadius");
  const sourceUserData = { ...originalGeometry.userData };
  const sourceSphere = originalGeometry.boundingSphere?.clone() ?? null;
  const sourceBox = originalGeometry.boundingBox?.clone() ?? null;
  const spacing = source.attributes.spacing;
  if (!spacing || spacing.itemSize !== 1) throw new TypeError("Ocean geometry spacing attribute required");
  let minimumSpacing = Infinity, finestRadius = 0;
  for (const value of spacing.array) if (value > 0) minimumSpacing = Math.min(minimumSpacing, value);
  positive(minimumSpacing, "ocean minimum spacing");
  for (let i = 0; i < spacing.array.length; i++) if (spacing.array[i] > 0 && spacing.array[i] <= minimumSpacing * 1.001) {
    const p = source.attributes.position.array;
    finestRadius = Math.max(finestRadius, Math.hypot(p[i * 3], p[i * 3 + 2]));
  }
  const snap = finestRadius >= Math.SQRT2 * 2 ? 4 : 2;
  const lagLimit = Math.max(finestRadius, snap / Math.SQRT2);
  const group = new THREE.Group();
  group.name = "application-ocean-domain";
  if (oldParent) oldParent.add(group);
  group.add(body);
  const cameraPosition = new THREE.Vector3();
  let disposed = false, anchorX = NaN, anchorZ = NaN, ownedGeometry = null;
  let worker = null, serial = 0, inFlight = null, queued = null, completed = null, desired = null;
  const built = /* @__PURE__ */ new Map(), keyOf = (t) => t.x + "," + t.z;
  let movedX = 0, movedZ = 0, lastCameraX = NaN, lastCameraZ = NaN;
  let workerFailed = false, warnedWorker = false, warnedLag = false, vertexCapacity = 0, indexCapacity = 0;
  const state = {
    sourceReads: 1,
    snapMeters: snap,
    finestRadius,
    updates: 0,
    rebuilds: 0,
    lastBuildMs: 0,
    maximumBuildMs: 0,
    totalBuildMs: 0,
    lastCommitMs: 0,
    maximumCommitMs: 0,
    bufferGrowths: 0,
    anchorX: null,
    anchorZ: null,
    cameraOffset: 0,
    anchorLagMeters: 0,
    maximumAnchorLagMeters: 0,
    anchorLagLimitMeters: lagLimit,
    lagFallbacks: 0,
    staleReplies: 0,
    prefetches: 0,
    readyCommits: 0,
    geometry: null,
    worker: { supported: typeof globalThis.Worker === "function", ready: false, inFlight: false, queued: false, failures: 0, lastError: null, lastBuildMs: 0 }
  };
  const sameAnchor = (a, b) => !!a && !!b && a.x === b.x && a.z === b.z;
  const capacityFor = (value) => 2 ** Math.ceil(Math.log2(Math.max(1, value)));
  function validateAnchor(target) {
    const exclusionReach = Math.hypot(target.x - domain.centerX, target.z - domain.centerZ) + Math.max(domain.radiusX, domain.radiusZ) / Math.cos(Math.PI / domain.segments);
    if (exclusionReach >= ordinaryRadius) throw new RangeError("Ocean domain exclusion reaches the horizon skirt; camera is outside the supported region");
  }
  function syncWorkerStats() {
    state.worker.inFlight = !!inFlight;
    state.worker.queued = !!queued;
  }
  function disableWorker(message) {
    if (disposed) return;
    workerFailed = true;
    worker?.terminate();
    worker = null;
    reportWorker(WORKER_NAMES.ocean, false, message);
    inFlight = null;
    queued = null;
    completed = null;
    built.clear();
    state.worker.failures++;
    state.worker.lastError = String(message);
    state.worker.ready = false;
    syncWorkerStats();
    if (!warnedWorker) {
      warnedWorker = true;
      console.warn("[OceanDomain] Worker unavailable; bounded synchronous geometry fallback is active.", message);
    }
  }
  function dispatch(target) {
    if (!worker || disposed || workerFailed || inFlight) return;
    validateAnchor(target);
    inFlight = { ...target, serial: ++serial };
    queued = null;
    syncWorkerStats();
    try {
      worker.postMessage({ type: "build", serial: inFlight.serial, options: { ...domain, anchorX: target.x, anchorZ: target.z } });
    } catch (error) {
      disableWorker(error.message);
    }
  }
  function initializeWorker() {
    if (!state.worker.supported) {
      disableWorker("Module Worker is not supported");
      return;
    }
    try {
      worker = new globalThis.Worker(new URL("./ocean-domain-worker-327JTUGO.js", import.meta.url), { type: "module" });
      worker.onmessage = (event) => {
        if (disposed || workerFailed) return;
        const message = event.data;
        if (message?.type === "ready") {
          state.worker.ready = true;
          reportWorker(WORKER_NAMES.ocean, true);
          return;
        }
        if (message?.type === "error" && message.serial === void 0) {
          disableWorker(message.message || "Worker initialization failed");
          return;
        }
        if (!inFlight || message?.serial !== inFlight.serial) {
          state.staleReplies++;
          return;
        }
        const target = inFlight;
        inFlight = null;
        if (message.type === "error") {
          disableWorker(message.message);
          return;
        }
        if (message.type !== "built") {
          disableWorker("Unexpected worker reply");
          return;
        }
        state.worker.lastBuildMs = message.buildMs;
        built.set(keyOf(target), { target, result: message.result, buildMs: message.buildMs });
        while (built.size > 4) built.delete(built.keys().next().value);
        const next = queued;
        queued = null;
        syncWorkerStats();
        if (next && !built.has(keyOf(next))) dispatch(next);
      };
      worker.onerror = (event) => {
        event.preventDefault?.();
        disableWorker(event.message || "Worker initialization/build failed");
      };
      worker.onmessageerror = () => disableWorker("Worker transfer could not be decoded");
      const workerSource = { attributes: {}, index: source.index.slice() }, transfers = [workerSource.index.buffer];
      for (const [name, attribute] of Object.entries(source.attributes)) {
        const array = attribute.array.slice();
        workerSource.attributes[name] = { ...attribute, array };
        transfers.push(array.buffer);
      }
      worker.postMessage({ type: "init", source: workerSource }, transfers);
    } catch (error) {
      disableWorker(error.message);
    }
  }
  function commit(result, target, buildMs) {
    const start = now(), requiredVertices = result.attributes.position.array.length / 3, requiredIndices = result.index.length;
    if (requiredVertices > 1e6 || requiredIndices > 24e4 * 3) throw new RangeError("Ocean domain reply exceeds geometry budget");
    if (!ownedGeometry || requiredVertices > vertexCapacity || requiredIndices > indexCapacity) {
      vertexCapacity = Math.max(vertexCapacity, capacityFor(requiredVertices));
      indexCapacity = Math.max(indexCapacity, capacityFor(requiredIndices));
      state.bufferGrowths++;
      const previous = ownedGeometry;
      ownedGeometry = new THREE.BufferGeometry();
      ownedGeometry.name = "application-ocean-domain-geometry";
      ownedGeometry.userData = { ...sourceUserData };
      ownedGeometry.boundingSphere = sourceSphere?.clone() ?? null;
      ownedGeometry.boundingBox = sourceBox?.clone() ?? null;
      for (const [name, attribute] of Object.entries(source.attributes)) {
        const array = new attribute.array.constructor(vertexCapacity * attribute.itemSize);
        array.set(attribute.array);
        ownedGeometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized).setUsage(THREE.DynamicDrawUsage));
      }
      ownedGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexCapacity), 1).setUsage(THREE.DynamicDrawUsage));
      previous?.dispose();
    }
    for (const [name, output] of Object.entries(result.attributes)) {
      const attribute = ownedGeometry.getAttribute(name), originalLength = source.attributes[name].array.length;
      const appended = output.array.subarray ? output.array.subarray(originalLength) : output.array.slice(originalLength);
      attribute.array.set(appended, originalLength);
      attribute.clearUpdateRanges?.();
      attribute.addUpdateRange?.(originalLength, appended.length);
      attribute.needsUpdate = true;
    }
    const index = ownedGeometry.getIndex();
    index.array.set(result.index);
    index.clearUpdateRanges?.();
    index.addUpdateRange?.(0, requiredIndices);
    index.needsUpdate = true;
    ownedGeometry.setDrawRange(0, requiredIndices);
    body.geometry = ownedGeometry;
    anchorX = target.x;
    anchorZ = target.z;
    state.rebuilds++;
    state.lastBuildMs = buildMs;
    state.maximumBuildMs = Math.max(state.maximumBuildMs, buildMs);
    state.totalBuildMs += buildMs;
    state.lastCommitMs = now() - start;
    state.maximumCommitMs = Math.max(state.maximumCommitMs, state.lastCommitMs);
    state.anchorX = anchorX;
    state.anchorZ = anchorZ;
    state.geometry = Object.freeze({ ...result.stats });
  }
  function buildSynchronously(target) {
    const start = now(), result = clipOceanDomain(source, { ...domain, anchorX: target.x, anchorZ: target.z });
    commit(result, target, now() - start);
  }
  initializeWorker();
  function update(camera) {
    if (disposed) throw new Error("Ocean domain has been disposed");
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(cameraPosition);
    if (![cameraPosition.x, cameraPosition.z].every(finite)) throw new TypeError("Finite camera world position required");
    desired = { x: Math.round(cameraPosition.x / snap) * snap, z: Math.round(cameraPosition.z / snap) * snap };
    validateAnchor(desired);
    completed = null;
    if (!finite(anchorX)) buildSynchronously(desired);
    else if (desired.x !== anchorX || desired.z !== anchorZ) {
      const ready = built.get(keyOf(desired));
      if (ready) {
        built.delete(keyOf(desired));
        commit(ready.result, ready.target, ready.buildMs);
        state.readyCommits++;
        queued = null;
      } else {
        const lag = Math.hypot(anchorX - cameraPosition.x, anchorZ - cameraPosition.z);
        let best = null, bestLag = lag;
        if (lag > lagLimit) for (const entry of built.values()) {
          const l = Math.hypot(entry.target.x - cameraPosition.x, entry.target.z - cameraPosition.z);
          if (l <= lagLimit && l < bestLag) {
            best = entry;
            bestLag = l;
          }
        }
        if (best) {
          built.delete(keyOf(best.target));
          commit(best.result, best.target, best.buildMs);
          state.readyCommits++;
        }
        if (!best && (!worker || workerFailed || lag > lagLimit)) {
          if (worker && lag > lagLimit) {
            state.lagFallbacks++;
            if (!warnedLag) {
              warnedLag = true;
              console.warn("[OceanDomain] Worker anchor lag exceeded the finest mesh region; applying a bounded synchronous correction.");
            }
          }
          buildSynchronously(desired);
          queued = null;
        } else if (desired.x !== anchorX || desired.z !== anchorZ) {
          if (!inFlight) dispatch(desired);
          else queued = sameAnchor(inFlight, desired) ? null : { ...desired };
        }
      }
    } else queued = null;
    if (finite(lastCameraX)) {
      movedX = cameraPosition.x - lastCameraX || movedX;
      movedZ = cameraPosition.z - lastCameraZ || movedZ;
    }
    lastCameraX = cameraPosition.x;
    lastCameraZ = cameraPosition.z;
    if (worker && !workerFailed && !inFlight && !queued && finite(anchorX)) {
      const dx = cameraPosition.x - anchorX, dz = cameraPosition.z - anchorZ, ahead = snap / 4;
      const next = { x: anchorX + (dx > ahead && movedX > 0 ? snap : dx < -ahead && movedX < 0 ? -snap : 0), z: anchorZ + (dz > ahead && movedZ > 0 ? snap : dz < -ahead && movedZ < 0 ? -snap : 0) };
      if ((next.x !== anchorX || next.z !== anchorZ) && !built.has(keyOf(next))) {
        try {
          dispatch(next);
          state.prefetches++;
        } catch {
        }
      }
    }
    for (const [key, entry] of built) if (Math.abs(entry.target.x - desired.x) > 2 * snap || Math.abs(entry.target.z - desired.z) > 2 * snap) {
      built.delete(key);
      state.staleReplies++;
    }
    syncWorkerStats();
    group.position.set(anchorX - cameraPosition.x, 0, anchorZ - cameraPosition.z);
    group.updateMatrixWorld(true);
    state.updates++;
    state.cameraOffset = Math.hypot(group.position.x, group.position.z);
    state.anchorLagMeters = state.cameraOffset;
    state.maximumAnchorLagMeters = Math.max(state.maximumAnchorLagMeters, state.anchorLagMeters);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    worker?.terminate();
    worker = null;
    inFlight = null;
    queued = null;
    completed = null;
    built.clear();
    syncWorkerStats();
    state.worker.ready = false;
    body.geometry = originalGeometry;
    if (oldParent) oldParent.add(body);
    else group.remove(body);
    group.removeFromParent();
    ownedGeometry?.dispose();
    ownedGeometry = null;
  }
  return { group, update, dispose, get stats() {
    return Object.freeze({ ...state, worker: Object.freeze({ ...state.worker }), disposed });
  } };
}

export {
  clipOceanDomain,
  createOceanDomain
};
