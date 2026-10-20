import {
  WORLD_PHASES,
  createRenderDiagnostics
} from "./chunk-4CSLR7WU.js";
import {
  Box3,
  Color,
  Frustum,
  Matrix4,
  Plane,
  Sphere,
  Vector3,
  Vector4
} from "./chunk-UPROFF5E.js";
import "./chunk-MLKGABMK.js";

// gpu-debug-metrics.js
var GPU_DEBUG_WINDOW_MS = 1e3;
var GPU_DEBUG_SAMPLE_LIMIT = 1024;
var CPU_SCOPE = "Admitted game frame after audio update; render is outermost renderer.render CPU elapsed, update is the remainder. Events and workers excluded.";
function ring() {
  const items = new Array(GPU_DEBUG_SAMPLE_LIMIT);
  let cursor = 0, count = 0;
  return {
    add(item) {
      items[cursor] = item;
      cursor = (cursor + 1) % items.length;
      count = Math.min(count + 1, items.length);
    },
    each(callback) {
      for (let i = 0; i < count; i++) callback(items[i]);
    },
    clear() {
      items.fill(void 0);
      cursor = count = 0;
    }
  };
}
function stat() {
  return { sum: 0, max: 0, count: 0 };
}
function add(s, value) {
  if (Number.isFinite(value) && value >= 0) {
    s.sum += value;
    s.max = Math.max(s.max, value);
    s.count++;
  }
}
var mean = (s) => s.count ? s.sum / s.count : null;
var maximum = (s) => s.count ? s.max : null;
var safely = (fn) => {
  try {
    return fn();
  } catch {
    return void 0;
  }
};
function createGpuDebugMetrics({ renderer, now = () => performance.now(), getTag, onFrame, onGpu, page = globalThis.window, document: document2 = globalThis.document } = {}) {
  if (!renderer || typeof renderer.render !== "function") throw new TypeError("GPU debug metrics require a renderer");
  const frames = ring(), gpuFrames = ring(), listeners = /* @__PURE__ */ new Set(), meshes = /* @__PURE__ */ new Set();
  const originalRender = renderer.render, originalDirect = renderer.renderBufferDirect;
  let disposed = false, measuring = false, renderDepth = 0, renderStarted = 0, renderMs = 0, renderCalls = 0;
  let lastFrame = null, lastGpu = null;
  function publish(type, sample, callback) {
    if (typeof callback === "function") safely(() => callback(sample));
    if (listeners.size) {
      const event = { type, sample };
      for (const listener of listeners) safely(() => listener(event));
    }
  }
  function receiveFrame(sample) {
    if (disposed) return;
    const elapsed = Math.min(sample.cpuMs, Math.max(0, renderMs));
    const result = { ...sample, renderMs: elapsed, updateMs: Math.max(0, sample.cpuMs - elapsed), renderCalls, meshes: typeof originalDirect === "function" ? meshes.size : null };
    lastFrame = result;
    frames.add(result);
    publish("frame", result, onFrame);
  }
  function receiveGpu(sample) {
    if (disposed) return;
    if (sample.type === "sample") {
      gpuFrames.add(sample);
      if (!lastGpu || sample.at >= lastGpu.at) lastGpu = sample;
    } else {
      gpuFrames.clear();
      lastGpu = null;
      if (sample.reason === "context-lost" || sample.reason === "context-restored") {
        measuring = false;
        renderDepth = 0;
        frames.clear();
        meshes.clear();
        lastFrame = null;
      }
    }
    publish("gpu", sample, onGpu);
  }
  const diagnostics = createRenderDiagnostics(renderer, { enabled: true, now, page, document: document2, gpuScope: "frame", getTag, onFrame: receiveFrame, onGpu: receiveGpu });
  function countedRender() {
    if (!measuring || disposed) return originalRender.apply(this, arguments);
    renderCalls++;
    if (renderDepth++ === 0) renderStarted = now();
    try {
      return originalRender.apply(this, arguments);
    } finally {
      if (--renderDepth === 0) renderMs += Math.max(0, now() - renderStarted);
    }
  }
  function countedDirect(camera, scene, geometry, material, object) {
    if (!measuring || disposed || !object?.isMesh) return originalDirect.apply(this, arguments);
    const info = renderer.info, calls = info?.render?.calls;
    try {
      return originalDirect.apply(this, arguments);
    } finally {
      if (info?.render?.calls > calls) meshes.add(object);
    }
  }
  renderer.render = countedRender;
  if (typeof originalDirect === "function") renderer.renderBufferDirect = countedDirect;
  const beginFrame = diagnostics.beginFrame, endFrame = diagnostics.endFrame;
  const suspend = diagnostics.suspend, resetSamples = diagnostics.resetSamples, disposeDiagnostics = diagnostics.dispose;
  diagnostics.beginFrame = function(rafTime) {
    measuring = false;
    renderDepth = 0;
    renderMs = renderCalls = 0;
    meshes.clear();
    beginFrame(rafTime);
    measuring = !disposed;
  };
  diagnostics.endFrame = function() {
    try {
      endFrame();
    } finally {
      measuring = false;
      renderDepth = 0;
    }
  };
  diagnostics.suspend = function(reason) {
    measuring = false;
    renderDepth = 0;
    suspend(reason);
  };
  diagnostics.resetSamples = function(reason) {
    measuring = false;
    renderDepth = 0;
    frames.clear();
    gpuFrames.clear();
    lastFrame = lastGpu = null;
    resetSamples(reason);
  };
  diagnostics.dispose = dispose;
  function onPageHide(event) {
    if (event.persisted) measuring = false;
    else dispose();
  }
  function onHidden() {
    if (document2?.hidden) measuring = false;
  }
  page?.addEventListener("pagehide", onPageHide);
  document2?.addEventListener("visibilitychange", onHidden);
  function snapshot() {
    const at = now(), cutoff = at - GPU_DEBUG_WINDOW_MS, base = diagnostics.snapshot();
    const interval = stat(), total = stat(), update = stat(), render = stat(), invokes = stat(), mesh = stat();
    const calls = stat(), triangles = stat(), lines = stat(), points = stat(), elapsed = stat();
    let frameSamples = 0;
    frames.each((item) => {
      if (item.at <= cutoff || item.at > at) return;
      frameSamples++;
      add(interval, item.intervalMs);
      add(total, item.cpuMs);
      add(update, item.updateMs);
      add(render, item.renderMs);
      add(invokes, item.renderCalls);
      add(mesh, item.meshes);
      if (item.draws) {
        add(calls, item.draws.calls);
        add(triangles, item.draws.triangles);
        add(lines, item.draws.lines);
        add(points, item.draws.points);
      }
    });
    gpuFrames.each((item) => {
      if (item.at > cutoff && item.at <= at) add(elapsed, item.elapsedMs);
    });
    const avg = mean(interval);
    return {
      enabled: !disposed,
      windowMs: GPU_DEBUG_WINDOW_MS,
      sampleLimit: GPU_DEBUG_SAMPLE_LIMIT,
      state: base.state,
      fps: avg > 0 ? 1e3 / avg : null,
      frame: { avgMs: avg, maxMs: maximum(interval), samples: interval.count },
      cpu: { updateMs: mean(update), renderMs: mean(render), totalMs: mean(total), samples: total.count, scope: CPU_SCOPE },
      gpu: { ...base.gpu, elapsedMs: mean(elapsed), maxMs: maximum(elapsed), samples: elapsed.count, ageMs: lastGpu ? Math.max(0, at - lastGpu.at) : null, scope: "Full admitted frame from beginFrame through first-person rendering; asynchronous GPU elapsed." },
      render: { calls: mean(invokes), meshes: mean(mesh), samples: frameSamples, meshScope: "Unique submitted Mesh objects; instances are not separate meshes. Shadow draws count in draws, not extra renderer.render calls." },
      draws: { calls: mean(calls), triangles: mean(triangles), lines: mean(lines), points: mean(points), samples: calls.count },
      resources: { ...base.resources, programs: Array.isArray(renderer.info?.programs) ? renderer.info.programs.length : null },
      pixelRatio: base.pixelRatio,
      devicePixelRatio: Number.isFinite(page?.devicePixelRatio) ? page.devicePixelRatio : null,
      drawingBuffer: base.drawingBuffer,
      backend: base.backend,
      lastFrame
    };
  }
  function subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Expected metrics listener");
    if (disposed) return () => {
    };
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function dispose() {
    if (disposed) return;
    measuring = false;
    disposed = true;
    disposeDiagnostics();
    if (renderer.render === countedRender) renderer.render = originalRender;
    if (renderer.renderBufferDirect === countedDirect) renderer.renderBufferDirect = originalDirect;
    page?.removeEventListener("pagehide", onPageHide);
    document2?.removeEventListener("visibilitychange", onHidden);
    frames.clear();
    gpuFrames.clear();
    meshes.clear();
    listeners.clear();
    lastFrame = lastGpu = null;
  }
  return { diagnostics, snapshot, subscribe, dispose };
}

// gpu-debug-scene.js
var DEFAULT_FLAGS = Object.freeze({
  shadows: true,
  waterSurface: true,
  sky: true,
  post: true,
  fog: true,
  trees: true,
  rocks: true,
  grass: true,
  transparent: true,
  terrainDistance: 1,
  pixelRatio: "current"
});
var CATEGORIES = ["terrain", "waterSurface", "sky", "trees", "rocks", "grass", "transparent", "other"];
var MAX_VISITED = 65536;
var installed = /* @__PURE__ */ new WeakMap();
var positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
var materialsOf = (object) => Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
var renderable = (object) => object.isMesh || object.isPoints || object.isLine || object.isSprite;
function validateFlags(flags, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new TypeError("GPU flags must be an object");
  const next = { ...flags };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULT_FLAGS, key)) throw new RangeError(`Unknown GPU flag: ${key}`);
    if (key === "terrainDistance") {
      if (![1, 0.5, 0.25].includes(value)) throw new RangeError("terrainDistance must be 1, .5, or .25");
    } else if (key === "pixelRatio") {
      if (!["current", 1, 1.5, "device"].includes(value)) throw new RangeError("pixelRatio must be current, 1, 1.5, or device");
    } else if (typeof value !== "boolean") throw new TypeError(`${key} must be boolean`);
    next[key] = value;
  }
  return next;
}
function wrapMethod(owner, key, makeWrapper, disposers) {
  if (!owner || typeof owner[key] !== "function") return false;
  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
  const original = owner[key], wrapper = makeWrapper(original);
  owner[key] = wrapper;
  disposers.push(() => {
    if (owner[key] !== wrapper) return;
    if (descriptor) Object.defineProperty(owner, key, descriptor);
    else delete owner[key];
  });
  return true;
}
function classify(object, inherited, references, world) {
  const names = new Set(inherited);
  const ref = references.get(object);
  if (ref) names.add(ref);
  const name = object.name || "", geometry = object.geometry?.name || "", data = object.userData || {};
  if (object === world.sky?.skyMesh || name === "DynamicSky.mesh") names.add("sky");
  if (data.isWater || /^(realistic-water-owned-bodies|pond-stream-surface|fall-sheet-and-plunge|impact-spray|physical-main-river-fallback)$/.test(name)) names.add("waterSurface");
  if (/^(procedural-tree-pools|tree-pool:|distant-tree-proxies|forest-logs|nature:fallen_log)/.test(name) || /^(pine|pine_lod|broadleaf|broadleaf_lod|fallen_log)$/.test(data.natureType || "") || /^(root-stump-bark|root-stump-broken-end|forked-ground-branch|branch-exposed-ends)$/.test(geometry)) names.add("trees");
  if (/^(procedural-rock-pools|rock-pool:|local-pebbles|ecology-gravel|shoreline-cobbles-|shoreline-pebble-bars)/.test(name) || /^rock-[134]$/.test(data.natureType || "") || geometry === "fractured-scree-pocket") names.add("rocks");
  if (data.proceduralGrassPool || data.proceduralGrassSource || /^(procedural-grass-near-|local-meadow|forest-fern|ecology-fern-|shoreline-reeds|woody-understorey-pools|woody-shrub-pool-)/.test(name) || /^(meadow|grass|grass_tall|shrub|fern)$/.test(data.natureType || "") || /^(woodland-fungi-cluster|flowering-woodland-clump)$/.test(geometry)) names.add("grass");
  if (name === "whole-island-backdrop") names.add("terrain");
  return names;
}
function installGpuDebugScene({ world } = {}) {
  if (!world?.renderer || typeof world.renderer.render !== "function") throw new TypeError("GPU isolation requires world.renderer");
  if (installed.has(world)) return installed.get(world);
  const renderer = world.renderer, dayNight = world.dayNight, atmosphere = world.atmosphere;
  const disposers = [];
  let registry = /* @__PURE__ */ new WeakMap(), localBounds = /* @__PURE__ */ new WeakMap();
  let flags = { ...DEFAULT_FLAGS }, disposed = false, linearFog = false;
  let updateDepth = 0, renderDepth = 0, frame = 0, counts = emptyCounts(), sceneCounts = emptyCount();
  const stats = { renders: 0, scans: 0, visited: 0, scanTruncated: false, postBypasses: 0, skySkipped: 0 };
  const flatBackground = new Color(4740189);
  const scratchBox = new Box3(), scratchSphere = new Sphere();
  const scratchMatrix = new Matrix4(), frustum = new Frustum();
  const clipping = [new Plane(new Vector3(1, 0, 0)), new Plane(new Vector3(-1, 0, 0)), new Plane(new Vector3(0, 0, 1)), new Plane(new Vector3(0, 0, -1))];
  const references = /* @__PURE__ */ new Map();
  const terrain = { baseDistance: 1, cutoffDistance: 1, metric: "horizontal-square-half-extent", mode: "material-clipping-and-whole-mesh-rejection", vertexWorkReduced: false };
  const capabilities = Object.freeze({
    shadows: !!renderer.shadowMap,
    waterSurface: true,
    sky: !!dayNight?.renderSky,
    post: !!atmosphere?.render,
    fog: true,
    trees: true,
    rocks: true,
    grass: true,
    transparent: true,
    terrainDistance: true,
    pixelRatio: typeof world.resize === "function" && typeof renderer.setDrawingBufferSize === "function",
    individualPostPasses: false,
    gpuTiming: false
  });
  const limitations = Object.freeze([
    "Draw masks only: hidden water still simulates and schedules its SDK captures; category update/culling CPU work continues.",
    "Post is one fused AA/AO/glow/grade pass; individual effects cannot be isolated by this helper.",
    "Sky off freezes DynamicSky lighting/environment updates and hides only its sky mesh; existing child lights remain.",
    "Fog off removes scene fog during world/cave/capture draws; water absorption and dedicated weather mist remain independent.",
    "Transparent includes all transparent renderables and decals except water and sky; alpha-tested foliage is in its vegetation category.",
    "Terrain distance is a horizontal square fragment clip plus whole-mesh rejection, relative to the main camera and extent captured at activation. Large intersecting meshes still submit all vertices.",
    "Terrain materials with intersecting local clipping, custom depth/distance materials, or sharing with nonterrain are skipped to preserve their semantics.",
    "Scene totals count unique Mesh objects before debug masks, excluding Points/Line/Sprite. Category totals overlap and include those renderables. Instances and draw calls are not mesh objects; frustum counts are unknown for instanced/skinned/unbounded objects.",
    "First use of fog, shadow, and clipping alternatives can compile shader variants; compare only after warmup.",
    `Scene classification is bounded to ${MAX_VISITED} objects once per world frame, or per independent renderer call; counts can be truncated.`
  ]);
  function emptyCount() {
    return { meshes: 0, visible: 0, frustumIntersecting: 0, frustumUnknown: 0 };
  }
  function emptyCounts() {
    return Object.fromEntries(CATEGORIES.map((key) => [key, emptyCount()]));
  }
  function refreshReferences() {
    references.clear();
    if (world.distant) references.set(world.distant, "terrain");
    if (world.islandBackdrop?.mesh) references.set(world.islandBackdrop.mesh, "terrain");
    for (const chunk of world.chunks?.values?.() || []) {
      for (const [key, category] of [["ground", "terrain"], ["trunk", "trees"], ["leaves", "trees"], ["rockMesh", "rocks"], ["grass", "grass"], ["ferns", "grass"]]) {
        if (chunk[key]) references.set(chunk[key], category);
      }
    }
  }
  function boundsFor(object) {
    if (!object.geometry || object.isInstancedMesh || object.isSkinnedMesh) return null;
    const geometry = object.geometry, position = geometry.attributes?.position;
    if (!position) return null;
    const cached = localBounds.get(geometry);
    if (cached && cached.position === position && cached.version === position.version) return cached.box;
    const box = new Box3();
    if (geometry.boundingBox) box.copy(geometry.boundingBox);
    else box.setFromBufferAttribute(position);
    localBounds.set(geometry, { position, version: position.version, box });
    return box;
  }
  function captureTerrainExtent() {
    refreshReferences();
    const origin = world.camera?.position || { x: 0, z: 0 };
    let extent = 0;
    for (const [object, category] of references) {
      if (category !== "terrain") continue;
      const box = boundsFor(object);
      if (!box || box.isEmpty()) continue;
      object.updateWorldMatrix?.(true, false);
      scratchBox.copy(box).applyMatrix4(object.matrixWorld);
      extent = Math.max(extent, Math.abs(scratchBox.min.x - origin.x), Math.abs(scratchBox.max.x - origin.x), Math.abs(scratchBox.min.z - origin.z), Math.abs(scratchBox.max.z - origin.z));
    }
    terrain.baseDistance = positive(extent, 1024);
    terrain.cutoffDistance = terrain.baseDistance;
  }
  function scan(scene) {
    refreshReferences();
    const entries = [], lights = [], stack = [[scene, /* @__PURE__ */ new Set()]], materialUsers = /* @__PURE__ */ new Map();
    let visited = 0;
    while (stack.length && visited < MAX_VISITED) {
      const [object, inherited] = stack.pop();
      visited++;
      const categories = classify(object, inherited, references, world);
      if (object.isLight) lights.push(object);
      if (renderable(object)) {
        if (!categories.has("waterSurface") && !categories.has("sky") && materialsOf(object).some((material) => material.transparent)) categories.add("transparent");
        if (!categories.size) categories.add("other");
        entries.push({ object, categories });
        for (const material of materialsOf(object)) {
          let users = materialUsers.get(material);
          if (!users) materialUsers.set(material, users = { terrain: false, other: false });
          users[categories.has("terrain") ? "terrain" : "other"] = true;
        }
      }
      const descend = new Set(categories);
      descend.delete("transparent");
      descend.delete("other");
      for (let i = (object.children?.length || 0) - 1; i >= 0; i--) stack.push([object.children[i], descend]);
    }
    stats.scans++;
    stats.visited = visited;
    stats.scanTruncated = !!stack.length;
    const result = { frame, entries, lights, materialUsers };
    registry.set(scene, result);
    return result;
  }
  function visibleInHierarchy(object, scene) {
    for (let parent = object; parent; parent = parent.parent) {
      if (!parent.visible) return false;
      if (parent === scene) return true;
    }
    return false;
  }
  function updateCounts(data, scene, camera) {
    counts = emptyCounts();
    sceneCounts = emptyCount();
    const reliableCamera = camera?.projectionMatrix && camera?.matrixWorldInverse;
    if (reliableCamera) frustum.setFromProjectionMatrix(scratchMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const { object, categories } of data.entries) {
      const visible = visibleInHierarchy(object, scene) && (!camera?.layers || object.layers.test(camera.layers));
      let inFrustum = null;
      if (visible && reliableCamera && object.frustumCulled && !object.isInstancedMesh && !object.isSkinnedMesh && object.geometry?.boundingSphere) {
        scratchSphere.copy(object.geometry.boundingSphere).applyMatrix4(object.matrixWorld);
        inFrustum = frustum.intersectsSphere(scratchSphere);
      }
      if (object.isMesh) {
        sceneCounts.meshes++;
        if (visible) {
          sceneCounts.visible++;
          if (inFrustum === null) sceneCounts.frustumUnknown++;
          else if (inFrustum) sceneCounts.frustumIntersecting++;
        }
      }
      for (const category of categories) {
        const count = counts[category];
        count.meshes++;
        if (visible) {
          count.visible++;
          if (inFrustum === null) count.frustumUnknown++;
          else if (inFrustum) count.frustumIntersecting++;
        }
      }
    }
  }
  function requestShadowRefresh() {
    if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
    world.lastShadow = null;
    world.needsFrame = true;
  }
  function resumeSky() {
    if (typeof world.sky?.setTime === "function") world.sky.setTime(world.sky.time);
    requestShadowRefresh();
  }
  function drawScope(original, receiver, args) {
    if (disposed) return original.apply(receiver, args);
    const [scene, camera] = args;
    if (!scene || !(scene === world.scene || scene === world.outdoor || scene === world.dungeon)) return original.apply(receiver, args);
    if (!updateDepth && !renderDepth) frame++;
    renderDepth++;
    stats.renders++;
    const restore = [], currentFlags = { ...flags };
    const set = (object, key, value) => {
      if (object[key] === value) return;
      const descriptor = Object.getOwnPropertyDescriptor(object, key), previous = object[key];
      restore.push(() => {
        if (descriptor) object[key] = previous;
        else delete object[key];
      });
      object[key] = value;
    };
    try {
      const cached = registry.get(scene), data = !cached || cached.frame !== frame || renderDepth > 1 ? scan(scene) : cached;
      if (renderDepth === 1) updateCounts(data, scene, camera);
      if (!currentFlags.shadows && renderer.shadowMap) {
        set(renderer.shadowMap, "enabled", false);
        for (const light of data.lights) set(light, "castShadow", false);
      }
      if (!currentFlags.fog) set(scene, "fog", null);
      if (!currentFlags.sky && scene !== world.dungeon && world.sky?.skyMesh && visibleInHierarchy(world.sky.skyMesh, scene)) set(scene, "background", flatBackground);
      const distance = terrain.baseDistance * currentFlags.terrainDistance;
      terrain.cutoffDistance = distance;
      const center = world.camera?.position || { x: 0, z: 0 }, terrainMaterials = /* @__PURE__ */ new Set();
      if (currentFlags.terrainDistance < 1) {
        const constants = clipping.map((plane) => plane.constant);
        restore.push(() => {
          for (let i = 0; i < clipping.length; i++) clipping[i].constant = constants[i];
        });
        clipping[0].constant = distance - center.x;
        clipping[1].constant = distance + center.x;
        clipping[2].constant = distance - center.z;
        clipping[3].constant = distance + center.z;
      }
      for (const { object, categories } of data.entries) {
        for (const category of categories) {
          if (Object.hasOwn(currentFlags, category) && currentFlags[category] === false) {
            set(object, "visible", false);
            break;
          }
        }
        if (!categories.has("terrain") || currentFlags.terrainDistance === 1) continue;
        const box = boundsFor(object);
        if (box) {
          scratchBox.copy(box).applyMatrix4(object.matrixWorld);
          if (scratchBox.max.x < center.x - distance || scratchBox.min.x > center.x + distance || scratchBox.max.z < center.z - distance || scratchBox.min.z > center.z + distance) set(object, "visible", false);
        }
        if (object.customDepthMaterial || object.customDistanceMaterial) continue;
        for (const material of materialsOf(object)) {
          if (terrainMaterials.has(material) || material.clipIntersection || data.materialUsers.get(material)?.other) continue;
          terrainMaterials.add(material);
          const prior = (material.clippingPlanes || []).filter((plane) => !clipping.includes(plane));
          set(material, "clippingPlanes", [...prior, ...clipping]);
          set(material, "clipShadows", true);
          set(renderer, "localClippingEnabled", true);
        }
      }
      return original.apply(receiver, args);
    } finally {
      for (let i = restore.length - 1; i >= 0; i--) restore[i]();
      renderDepth--;
    }
  }
  function resizeWithOverride(original, receiver, args) {
    if (disposed || flags.pixelRatio === "current") return original.apply(receiver, args);
    const method = renderer.setDrawingBufferSize, descriptor = Object.getOwnPropertyDescriptor(renderer, "setDrawingBufferSize");
    let applied = null;
    const override = function(width, height) {
      const cssWidth = Math.max(1, Math.floor(positive(globalThis.innerWidth, width)));
      const cssHeight = Math.max(1, Math.floor(positive(globalThis.innerHeight, height)));
      const limit = positive(world.renderMaxDimension, 16384);
      const requested = flags.pixelRatio === "device" ? positive(globalThis.devicePixelRatio, 1) : flags.pixelRatio;
      const ratio = Math.min(requested, limit / cssWidth, limit / cssHeight);
      applied = { width: cssWidth, height: cssHeight, pixelRatio: ratio, bufferWidth: Math.max(1, Math.floor(cssWidth * ratio)), bufferHeight: Math.max(1, Math.floor(cssHeight * ratio)) };
      if (Math.floor(cssWidth * ratio) < 1 || Math.floor(cssHeight * ratio) < 1) return method.call(this, applied.bufferWidth, applied.bufferHeight, 1);
      return method.call(this, cssWidth, cssHeight, ratio);
    };
    renderer.setDrawingBufferSize = override;
    try {
      const result = original.apply(receiver, args);
      if (applied) {
        world.renderSize = { ...world.renderSize, ...applied };
        world.renderDiagnostics?.resetSamples?.("gpu-debug-resolution");
        if (typeof globalThis.CustomEvent === "function") renderer.domElement?.dispatchEvent?.(new CustomEvent("renderresolutionchange"));
      }
      return result;
    } finally {
      if (renderer.setDrawingBufferSize === override) {
        if (descriptor) Object.defineProperty(renderer, "setDrawingBufferSize", descriptor);
        else delete renderer.setDrawingBufferSize;
      }
    }
  }
  function bypassPost(original, receiver, args) {
    if (disposed || flags.post) return original.apply(receiver, args);
    const [scene] = args, wasLinear = linearFog;
    const target = renderer.getRenderTarget?.() ?? null;
    const face = renderer.getActiveCubeFace?.() ?? 0, mip = renderer.getActiveMipmapLevel?.() ?? 0;
    const viewport = renderer.getViewport?.(new Vector4()), scissor = renderer.getScissor?.(new Vector4());
    const scissorTest = renderer.getScissorTest?.();
    let ended = false;
    try {
      if (wasLinear) {
        dayNight.endLinearFog();
        ended = true;
      }
      renderer.setRenderTarget(null);
      const result = renderer.render(scene, receiver.camera || world.camera);
      receiver.metrics = { calls: renderer.info?.render?.calls || 0, triangles: renderer.info?.render?.triangles || 0 };
      stats.postBypasses++;
      return result;
    } finally {
      try {
        renderer.setRenderTarget(target, face, mip);
        if (viewport) renderer.setViewport?.(viewport);
        if (scissor) renderer.setScissor?.(scissor);
        if (scissorTest !== void 0) renderer.setScissorTest?.(scissorTest);
      } finally {
        if (ended) dayNight.beginLinearFog();
      }
    }
  }
  function snapshot() {
    return {
      enabled: !disposed,
      disposed,
      flags: { ...flags },
      capabilities,
      limitations,
      terrain: { ...terrain, cutoffDistance: terrain.baseDistance * flags.terrainDistance },
      scene: { ...sceneCounts },
      counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, { ...value }])),
      stats: { ...stats },
      pixelRatio: { requested: flags.pixelRatio, actual: renderer.getPixelRatio?.() ?? world.renderSize?.pixelRatio ?? null }
    };
  }
  function setFlags(patch) {
    if (disposed) throw new Error("GPU scene isolation is disposed");
    const previous = flags, next = validateFlags(flags, patch);
    if (next.pixelRatio !== "current" && !capabilities.pixelRatio) throw new Error("World resize path unavailable");
    flags = next;
    try {
      if (previous.pixelRatio !== next.pixelRatio) world.resize();
    } catch (error) {
      flags = previous;
      try {
        world.resize();
      } catch {
      }
      throw error;
    }
    if (!previous.sky && next.sky) resumeSky();
    if (!previous.shadows && next.shadows) requestShadowRefresh();
    world.needsFrame = true;
    return snapshot();
  }
  function dispose() {
    if (disposed) return;
    const old = flags;
    flags = { ...DEFAULT_FLAGS };
    disposed = true;
    try {
      if (old.pixelRatio !== "current") world.resize();
    } finally {
      try {
        if (!old.sky) resumeSky();
        else if (!old.shadows) requestShadowRefresh();
      } finally {
        for (let i = disposers.length - 1; i >= 0; i--) disposers[i]();
        disposers.length = 0;
        references.clear();
        registry = /* @__PURE__ */ new WeakMap();
        localBounds = /* @__PURE__ */ new WeakMap();
        installed.delete(world);
      }
    }
  }
  captureTerrainExtent();
  try {
    wrapMethod(world, "update", (original) => function(...args) {
      if (disposed) return original.apply(this, args);
      if (!updateDepth) frame++;
      updateDepth++;
      try {
        return original.apply(this, args);
      } finally {
        updateDepth--;
      }
    }, disposers);
    wrapMethod(renderer, "render", (original) => function(...args) {
      return drawScope(original, this, args);
    }, disposers);
    wrapMethod(world, "resize", (original) => function(...args) {
      return resizeWithOverride(original, this, args);
    }, disposers);
    wrapMethod(dayNight, "beginLinearFog", (original) => function(...args) {
      const result = original.apply(this, args);
      if (!disposed) linearFog = true;
      return result;
    }, disposers);
    wrapMethod(dayNight, "endLinearFog", (original) => function(...args) {
      const result = original.apply(this, args);
      if (!disposed) linearFog = false;
      return result;
    }, disposers);
    wrapMethod(dayNight, "renderSky", (original) => function(...args) {
      if (!disposed && !flags.sky) {
        stats.skySkipped++;
        return;
      }
      return original.apply(this, args);
    }, disposers);
    wrapMethod(atmosphere, "render", (original) => function(...args) {
      return bypassPost(original, this, args);
    }, disposers);
  } catch (error) {
    disposed = true;
    for (let i = disposers.length - 1; i >= 0; i--) disposers[i]();
    throw error;
  }
  const api = Object.freeze({ setFlags, snapshot, dispose, capabilities, limitations });
  installed.set(world, api);
  return api;
}

// gpu-debug-benchmark.js
var GPU_DEBUG_BOOLEAN_KEYS = Object.freeze(["shadows", "waterReflection", "waterRefraction", "waterSurface", "sky", "post", "fog", "trees", "rocks", "grass", "transparent"]);
var GPU_DEBUG_DEFAULT_FLAGS = Object.freeze(Object.fromEntries([...GPU_DEBUG_BOOLEAN_KEYS.map((key) => [key, true]), ["terrainDistance", 1], ["pixelRatio", "current"]]));
var GPU_DEBUG_LABELS = Object.freeze({ shadows: "影", waterReflection: "水の反射（SSR 含む）", waterRefraction: "水の屈折用キャプチャ", waterSurface: "水面メッシュ", sky: "空のシェーダー", post: "統合ポスト処理（AA・AO・光・色）", fog: "地形・物体の霧", trees: "木", rocks: "岩", grass: "草", transparent: "透明物・パーティクル", terrainDistance: "地形の表示距離", pixelRatio: "描画ピクセル比" });
function normalizeGpuDebugFlags(value = {}) {
  const flags = { ...GPU_DEBUG_DEFAULT_FLAGS };
  for (const key of GPU_DEBUG_BOOLEAN_KEYS) if (typeof value?.[key] === "boolean") flags[key] = value[key];
  if ([1, 0.5, 0.25].includes(value?.terrainDistance)) flags.terrainDistance = value.terrainDistance;
  if (["current", 1, 1.5, "device"].includes(value?.pixelRatio)) flags.pixelRatio = value.pixelRatio;
  return flags;
}
var GPU_BENCHMARK_REBUILDS = Object.freeze(["shadows-off", "post-off", "fog-off", "terrain-half", "terrain-quarter", "waterReflection-off", "waterRefraction-off"]);
function benchmarkPlan(states) {
  const plan = states.filter((s) => !GPU_BENCHMARK_REBUILDS.includes(s.id)), base = plan.find((s) => s.id === "baseline");
  return base ? [...plan, { ...base, id: "baseline-end", label: "基準（最後にもう一度）", notes: [...base.notes || [], "最初の基準と同じ状態です。最初の基準との差は、測っている間に起きた変化です。"] }] : plan;
}
function makeGpuBenchmarkStates(capabilities = {}) {
  const baseline = { id: "baseline", label: "基準：すべて有効・現在の解像度", flags: { ...GPU_DEBUG_DEFAULT_FLAGS }, available: true, effective: true, notes: ["現在の画質で利用できる機能が基準です。画質設定は変更しません。"] };
  const make = (id, key, value, label) => {
    const cap = capabilities[key];
    return { id, label, flags: { ...GPU_DEBUG_DEFAULT_FLAGS, [key]: value }, available: cap !== false && cap?.available !== false, effective: cap !== false && cap?.available !== false && cap?.effective !== false, notes: cap?.notes ? [...cap.notes] : cap?.reason ? [String(cap.reason)] : [] };
  };
  return [baseline, ...GPU_DEBUG_BOOLEAN_KEYS.map((key) => make(`${key}-off`, key, false, `${GPU_DEBUG_LABELS[key]}：無効`)), make("terrain-half", "terrainDistance", 0.5, "地形の表示距離：50%"), make("terrain-quarter", "terrainDistance", 0.25, "地形の表示距離：25%"), make("pixels-1", "pixelRatio", 1, "描画ピクセル比：1"), make("pixels-1.5", "pixelRatio", 1.5, "描画ピクセル比：1.5"), make("pixels-device", "pixelRatio", "device", "描画ピクセル比：端末の値")];
}
var stat2 = () => ({ sum: 0, max: 0, count: 0 });
function add2(target, value) {
  if (Number.isFinite(value) && value >= 0) {
    target.sum += value;
    target.max = Math.max(target.max, value);
    target.count++;
  }
}
var mean2 = (s) => s.count ? s.sum / s.count : null;
var maximum2 = (s) => s.count ? s.max : null;
var nextRun = 0;
function createGpuDebugBenchmark({ states = makeGpuBenchmarkStates(), applyState, freeze = () => void 0, restore = () => {
}, setTag = () => {
}, onProgress = () => {
}, onResults = () => {
}, now = () => performance.now(), durationMs = 5e3, warmupMs = 1e3, tailMs = 2e3, metadata = {} } = {}) {
  if (typeof applyState !== "function") throw new TypeError("GPU benchmark requires applyState");
  const plan = states.map((s) => ({ ...s, flags: normalizeGpuDebugFlags(s.flags), notes: [...s.notes || []] }));
  if (!plan.length) throw new TypeError("GPU benchmark requires at least one state");
  const duration = Math.max(5e3, Number.isFinite(durationMs) ? durationMs : 5e3), warmup = Math.max(1e3, Number.isFinite(warmupMs) ? warmupMs : 1e3), tail = Math.max(0, Math.min(5e3, Number.isFinite(tailMs) ? tailMs : 2e3));
  let phase = "idle", active = false, index = -1, runId = "", startedAt = 0, phaseAt = 0, warmFrames = 0, token, transition = null, finishRequest = null, restoring = false, completion = null, resolveCompletion, report = null, errorText = null;
  let rows = [], rowByTag = /* @__PURE__ */ new Map(), pending = /* @__PURE__ */ new Map(), earlyGpu = /* @__PURE__ */ new Map(), retiredFrames = 0, currentTag = null;
  function tag(value) {
    currentTag = value;
    setTag(value);
  }
  function snapshot() {
    const elapsed = active ? Math.max(0, now() - phaseAt) : 0;
    return { active, phase, index, total: plan.length, stateId: plan[index]?.id || null, label: plan[index]?.label || "", elapsedMs: elapsed, warmupMs: warmup, durationMs: duration, remainingMs: phase === "warmup" ? Math.max(0, warmup - elapsed) : phase === "measure" ? Math.max(0, duration - elapsed) : phase === "drain" ? Math.max(0, tail - elapsed) : 0, completedRows: rows.filter((r) => r.finished).length, tag: currentTag, error: errorText };
  }
  function progress() {
    try {
      onProgress(snapshot());
    } catch (error) {
      requestFinish("error", error);
    }
  }
  function serializeRow(r) {
    return { id: r.id, label: r.label, flags: { ...r.flags }, effectiveFlags: r.effectiveFlags ? { ...r.effectiveFlags } : null, available: r.available !== false, effective: r.effective !== false, notes: [...r.notes], metadata: r.metadata || null, startedAt: r.start, finishedAt: r.end, durationMs: r.start === null ? 0 : Math.max(0, (r.end ?? now()) - r.start), warmupMs: r.warmupElapsed, samples: r.samples, complete: r.finished, frame: { avgMs: mean2(r.frame), maxMs: maximum2(r.frame), samples: r.frame.count, fps: mean2(r.frame) > 0 ? 1e3 / mean2(r.frame) : null }, cpu: { updateMs: mean2(r.update), renderMs: mean2(r.render), totalMs: mean2(r.cpu) }, gpu: { elapsedMs: r.invalid ? null : mean2(r.gpu), maxMs: r.invalid ? null : maximum2(r.gpu), samples: r.invalid ? 0 : r.gpu.count, discardedSamples: r.invalid ? r.gpu.count : 0, status: r.invalid ? "disjoint" : r.gpu.count ? r.reasons.size ? "partial" : "measured" : [...r.reasons].at(-1) || "unavailable", unmeasuredFrames: Math.max(0, r.samples - (r.invalid ? 0 : r.gpu.count)), reasons: [...r.reasons] }, draws: { calls: mean2(r.calls), triangles: mean2(r.triangles) }, render: { calls: mean2(r.invokes), meshes: mean2(r.meshes) } };
  }
  function results() {
    return report;
  }
  async function finalize() {
    if (restoring || !active || !finishRequest) return;
    restoring = true;
    const finish = finishRequest;
    try {
      tag(null);
    } catch (error) {
      errorText = String(error?.message || error);
    }
    try {
      await restore(token);
    } catch (error) {
      errorText = String(error?.message || error);
      finish.status = "error";
    } finally {
      active = false;
      restoring = false;
      phase = finish.status === "complete" ? "complete" : finish.status === "cancelled" ? "cancelled" : "error";
      report = { version: 1, status: phase, error: errorText, reason: finish.reason || null, startedAt, finishedAt: now(), durationMs: Math.max(0, now() - startedAt), measurementMs: duration, warmupMs: warmup, gpuTailMs: tail, metadata, conditions: "Camera and input held; simulation, time and weather continue. Frame cap and current quality are retained. GPU elapsed is not utilization.", rows: rows.map(serializeRow), retiredFrameAssociations: retiredFrames };
      pending.clear();
      earlyGpu.clear();
      try {
        onResults(report);
      } catch (error) {
        report.callbackError = String(error?.message || error);
      }
      try {
        onProgress(snapshot());
      } catch {
      }
      resolveCompletion?.(report);
    }
  }
  function requestFinish(status, error, reason) {
    if (!active) return completion || Promise.resolve(report);
    if (!finishRequest) {
      const last = rows[index];
      if (last?.start !== null && last?.start !== void 0 && !last.finished) last.end = now();
      finishRequest = { status, reason };
      if (error) errorText = String(error?.message || error);
      phase = status === "cancelled" ? "cancelling" : "finishing";
      try {
        tag(null);
      } catch (tagError) {
        errorText = String(tagError?.message || tagError);
        finishRequest.status = "error";
      }
    }
    if (!transition) void finalize();
    return completion;
  }
  function schedule(work) {
    const promise = Promise.resolve().then(work).catch((error) => {
      requestFinish("error", error);
    }).finally(() => {
      if (transition === promise) transition = null;
      if (finishRequest) void finalize();
    });
    transition = promise;
    return promise;
  }
  async function enterState(next) {
    if (finishRequest) return;
    index = next;
    phase = "applying";
    tag(`${runId}:${index}:apply`);
    progress();
    if (finishRequest) return;
    const state = plan[index];
    const applied = await applyState({ ...state.flags }, state);
    if (finishRequest) return;
    const row = { ...state, flags: { ...state.flags }, effectiveFlags: applied?.effectiveFlags || state.effectiveFlags || null, available: applied?.available ?? state.available, effective: applied?.effective ?? state.effective, notes: [...state.notes, ...applied?.notes || []], metadata: applied?.metadata || null, start: null, end: null, warmupElapsed: 0, samples: 0, finished: false, invalid: false, reasons: /* @__PURE__ */ new Set(), frame: stat2(), cpu: stat2(), update: stat2(), render: stat2(), calls: stat2(), triangles: stat2(), invokes: stat2(), meshes: stat2(), gpu: stat2() };
    rows.push(row);
    phase = "warmup";
    phaseAt = now();
    warmFrames = 0;
    tag(`${runId}:${index}:warmup`);
    progress();
  }
  async function start() {
    if (active) return false;
    active = true;
    phase = "preparing";
    index = -1;
    runId = `gpu-benchmark-${++nextRun}`;
    startedAt = phaseAt = now();
    rows = [];
    rowByTag = /* @__PURE__ */ new Map();
    pending = /* @__PURE__ */ new Map();
    earlyGpu = /* @__PURE__ */ new Map();
    retiredFrames = 0;
    finishRequest = null;
    report = null;
    errorText = null;
    token = void 0;
    restoring = false;
    currentTag = null;
    completion = new Promise((resolve) => {
      resolveCompletion = resolve;
    });
    await schedule(async () => {
      token = await freeze();
      if (!finishRequest) await enterState(0);
    });
    return !finishRequest;
  }
  function cancel(reason = "user") {
    return requestFinish("cancelled", null, reason);
  }
  function prune(at) {
    for (const [key, item] of pending) {
      if (pending.size <= 4096 && at - item.at <= 6e3) break;
      pending.delete(key);
      retiredFrames++;
    }
    for (const [key, item] of earlyGpu) if (earlyGpu.size > 256 || at - item.completedAt > 6e3) earlyGpu.delete(key);
  }
  const keyFor = (frameId, frameTag) => `${frameTag}|${frameId}`;
  function onFrame(sample) {
    if (!active || finishRequest || transition) return;
    try {
      const at = now();
      prune(at);
      if (phase === "warmup") {
        if (sample?.tag !== currentTag) return;
        warmFrames++;
        if (at - phaseAt >= warmup && warmFrames >= 3) {
          const row2 = rows[index];
          row2.warmupElapsed = at - phaseAt;
          row2.start = at;
          phase = "measure";
          phaseAt = at;
          tag(`${runId}:${index}:measure`);
          rowByTag.set(currentTag, row2);
          progress();
        }
        return;
      }
      if (phase === "drain") {
        if (at - phaseAt >= tail) requestFinish("complete");
        return;
      }
      if (phase !== "measure" || sample?.tag !== currentTag) return;
      const row = rows[index];
      row.samples++;
      if (row.samples > 1) add2(row.frame, sample.intervalMs);
      add2(row.cpu, sample.cpuMs);
      add2(row.update, sample.updateMs);
      add2(row.render, sample.renderMs);
      add2(row.invokes, sample.renderCalls);
      add2(row.meshes, sample.meshes);
      add2(row.calls, sample.draws?.calls);
      add2(row.triangles, sample.draws?.triangles);
      if (sample.frameId !== void 0) {
        const key = keyFor(sample.frameId, sample.tag);
        pending.set(key, { row, at: Number.isFinite(sample.at) ? sample.at : at });
        const waiting = earlyGpu.get(key);
        if (waiting) {
          earlyGpu.delete(key);
          onGpu(waiting);
        }
      }
      if (at - phaseAt >= duration) {
        row.end = at;
        row.finished = true;
        progress();
        if (finishRequest) return;
        if (index + 1 < plan.length) void schedule(() => enterState(index + 1));
        else {
          phase = "drain";
          phaseAt = at;
          tag(`${runId}:drain`);
          progress();
          if (tail === 0) requestFinish("complete");
        }
      }
    } catch (error) {
      requestFinish("error", error);
    }
  }
  function onGpu(event) {
    if (!active || finishRequest || !event) return;
    if (event.type === "reset") {
      const reason = String(event.reason || "reset"), at = Number.isFinite(event.at) ? event.at : now(), affected = /* @__PURE__ */ new Set();
      for (const item of pending.values()) if (at - item.at <= 6e3) affected.add(item.row);
      if (phase === "measure" && rows[index]) affected.add(rows[index]);
      if (reason === "disjoint") {
        for (const row2 of rows) if (row2.samples) affected.add(row2);
      }
      for (const row2 of affected) {
        row2.reasons.add(reason);
        if (reason === "disjoint") row2.invalid = true;
      }
      pending.clear();
      earlyGpu.clear();
      return;
    }
    if (event.type !== "sample" || !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0) return;
    const row = rowByTag.get(event.tag);
    if (!row) return;
    const key = keyFor(event.frameId, event.tag), match = pending.get(key);
    if (match) {
      pending.delete(key);
      if (!row.invalid) add2(row.gpu, event.elapsedMs);
    } else if (!row.finished) {
      earlyGpu.set(key, event);
      prune(now());
    }
  }
  return { start, cancel, onFrame, onGpu, snapshot, results };
}
function formatGpuBenchmarkReport(report, format = "json") {
  if (format !== "csv") return JSON.stringify(report, null, 2);
  const cell = (value) => {
    let text = value == null ? "" : String(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const columns = ["state", "label", "complete", "duration_ms", "frames", "frame_avg_ms", "frame_max_ms", "cpu_update_avg_ms", "cpu_render_avg_ms", "gpu_avg_ms", "gpu_samples", "gpu_status", "draw_calls_avg", "triangles_avg", "renderer_render_avg", "notes"];
  const rows = (report?.rows || []).map((row) => [row.id, row.label, row.complete, row.durationMs, row.samples, row.frame?.avgMs, row.frame?.maxMs, row.cpu?.updateMs, row.cpu?.renderMs, row.gpu?.elapsedMs, row.gpu?.samples, row.gpu?.status, row.draws?.calls, row.draws?.triangles, row.render?.calls, (row.notes || []).join(" | ")]);
  return [columns, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

// gpu-debug-ui.js
var numeric = (value, digits = 2) => Number.isFinite(value) ? value.toLocaleString("ja-JP", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "未測定";
var ms = (value) => Number.isFinite(value) ? `${numeric(value)} ms` : "未測定";
var phaseLabel = { idle: "待機中", preparing: "視点を固定中", applying: "設定を適用中", warmup: "描画を準備中", measure: "計測中", drain: "遅れて届く GPU 計測を回収中", finishing: "元の状態へ復元中", cancelling: "中止して復元中", complete: "計測完了", cancelled: "計測を中止しました", error: "計測を中止しました（エラー）" };
function createGpuDebugUI({ onFlags = () => {
}, onBenchmark = () => {
}, onCancel = () => {
}, onCopy = () => false, onClose = () => {
}, onBreakdown = null } = {}) {
  const panel = node("section");
  panel.className = "gpu-debug-panel";
  panel.dataset.gpuDebug = "panel";
  panel.setAttribute("aria-label", "GPU 計測と描画の切り分け");
  Object.assign(panel.style, { position: "fixed", top: "12px", left: "12px", zIndex: "10000", width: "430px", maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100vh - 24px)", overflow: "auto", padding: "15px", background: "rgba(8,14,20,.96)", color: "#e7eced", border: "1px solid #81949b", borderRadius: "6px", font: "12px/1.55 system-ui,sans-serif", boxShadow: "0 8px 32px #0008", pointerEvents: "auto", colorScheme: "dark" });
  const heading = node("div");
  Object.assign(heading.style, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" });
  const title = node("strong", "GPU 計測・切り分け");
  title.style.fontSize = "15px";
  const close = button("閉じる（F3）", onClose);
  close.dataset.gpuDebug = "close";
  heading.append(title, close);
  panel.append(heading);
  const note = node("p", "直近 1 秒の平均。GPU は描画経過時間で、使用率ではありません。CPU の更新・描画呼出も使用率ではありません。F4 でカーソル操作と見回しを切り替えます。");
  note.style.color = "#aebfc5";
  panel.append(note);
  const metricsBox = node("dl");
  Object.assign(metricsBox.style, { display: "grid", gridTemplateColumns: "minmax(140px,1fr) auto", columnGap: "12px", rowGap: "3px", margin: "10px 0" });
  const values = /* @__PURE__ */ new Map();
  for (const [key, label] of [["fps", "FPS"], ["frame", "フレーム 平均 / 最大"], ["cpuTotal", "CPU 合計（フレーム内）"], ["cpu", "CPU 更新 / 描画呼出"], ["gpu", "GPU 経過時間"], ["draws", "Draw calls / 三角形"], ["resources", "形状 / テクスチャ / Program"], ["render", "render() 呼出 / 描画 Mesh"], ["scene", "シーン Mesh / 表示 / 視錐台"], ["pixels", "描画解像度 / ピクセル比"]]) {
    const term = node("dt", label), value = node("dd", "未測定");
    value.dataset.gpuMetric = key;
    Object.assign(value.style, { margin: "0", textAlign: "right", fontVariantNumeric: "tabular-nums" });
    metricsBox.append(term, value);
    values.set(key, value);
  }
  panel.append(metricsBox);
  const gpuNote = node("p");
  gpuNote.dataset.gpuDebug = "gpu-status";
  Object.assign(gpuNote.style, { color: "#aebfc5", margin: "5px 0", overflowWrap: "anywhere" });
  panel.append(gpuNote);
  const controlsDetails = node("details");
  const controlSummary = node("summary", "個別に表示・処理を切り替える");
  controlSummary.style.cursor = "pointer";
  controlsDetails.append(controlSummary);
  const controls = /* @__PURE__ */ new Map(), controlNotes = /* @__PURE__ */ new Map();
  let flags = { ...GPU_DEBUG_DEFAULT_FLAGS }, capabilities = {}, benchmark = {}, results = null, renderedReport = null, destroyed = false, breakdownBusy = false;
  for (const key of GPU_DEBUG_BOOLEAN_KEYS) {
    const line = node("label");
    Object.assign(line.style, { display: "block", padding: "5px 0", borderBottom: "1px solid #ffffff18" });
    const input = node("input");
    input.type = "checkbox";
    input.checked = true;
    input.dataset.gpuFlag = key;
    input.style.marginRight = "8px";
    const label = node("span", GPU_DEBUG_LABELS[key]);
    line.append(input, label);
    const detail = node("small");
    Object.assign(detail.style, { display: "block", marginLeft: "24px", color: "#adbdc4" });
    line.append(detail);
    controlNotes.set(key, detail);
    input.addEventListener("change", () => changeFlag(key, input.checked));
    controls.set(key, input);
    controlsDetails.append(line);
  }
  select("terrainDistance", [["1", "100%"], ["0.5", "50%"], ["0.25", "25%"]]);
  select("pixelRatio", [["current", "現在の設定"], ["1", "1"], ["1.5", "1.5"], ["device", "端末の値"]]);
  const distanceNote = node("p", "地形の距離制限は描画だけに適用します。遠景メッシュの頂点処理は残るため、距離に比例して軽くなるとは限りません。");
  distanceNote.style.color = "#adbdc4";
  controlsDetails.append(distanceNote);
  panel.append(controlsDetails);
  const actions = node("div");
  Object.assign(actions.style, { display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "12px" });
  const start = button("計測を開始（各 5 秒）", () => invoke(onBenchmark));
  start.dataset.gpuDebug = "start";
  const cancel = button("中止", () => invoke(onCancel));
  cancel.dataset.gpuDebug = "cancel";
  cancel.disabled = true;
  const copy = button("結果をコピー", async () => {
    try {
      const copied = await onCopy(results);
      if (copied === false) showCopyFallback(formatGpuBenchmarkReport(results));
    } catch {
      showCopyFallback(formatGpuBenchmarkReport(results));
    }
  });
  copy.dataset.gpuDebug = "copy";
  copy.disabled = true;
  actions.append(start, cancel, copy);
  const split = typeof onBreakdown === "function" ? button("GPU の内訳（約 7 秒）", () => invoke(onBreakdown)) : null;
  if (split) {
    split.dataset.gpuDebug = "breakdown";
    actions.append(split);
  }
  panel.append(actions);
  const conditions = node("p", "視点と操作を固定し、基準から 1 設定ずつ切り替えます。時刻・天候・水の動きは続きます。各条件で準備後に 5 秒以上計測し、終了・中止時に元へ戻します。全 17 条件で約 2 分が目安です。最後に GPU の内訳（約 7 秒）も測ります。");
  conditions.style.color = "#adbdc4";
  panel.append(conditions);
  const status = node("p", "待機中");
  status.dataset.gpuDebug = "progress";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  panel.append(status);
  const breakdownText = node("pre");
  breakdownText.hidden = true;
  breakdownText.dataset.gpuDebug = "breakdown-text";
  Object.assign(breakdownText.style, { whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "11px/1.5 ui-monospace,monospace", color: "#d6e2e6", margin: "8px 0" });
  panel.append(breakdownText);
  const resultDetails = node("details");
  resultDetails.hidden = true;
  resultDetails.append(node("summary", "計測結果"));
  const tableScroll = node("div");
  tableScroll.style.overflowX = "auto";
  const resultTable = node("table");
  resultTable.dataset.gpuDebug = "results-table";
  Object.assign(resultTable.style, { width: "100%", borderCollapse: "collapse", fontSize: "11px" });
  resultTable.append(node("caption", "各条件の平均値（GPU は取得できたサンプルのみ）"));
  const tableHead = node("thead"), headerRow = node("tr");
  for (const text of ["条件", "Frame 平均", "GPU 平均", "Draw calls", "三角形"]) {
    const cell = tableCell("th", text);
    cell.scope = "col";
    headerRow.append(cell);
  }
  tableHead.append(headerRow);
  const tableBody = node("tbody");
  resultTable.append(tableHead, tableBody);
  tableScroll.append(resultTable);
  resultDetails.append(tableScroll);
  panel.append(resultDetails);
  const fallback = node("div");
  fallback.hidden = true;
  const fallbackLabel = node("label", "自動コピーを利用できません。以下を選択してコピーしてください。");
  const fallbackText = node("textarea");
  fallbackText.readOnly = true;
  fallbackText.rows = 8;
  fallbackText.dataset.gpuDebug = "copy-text";
  fallbackText.setAttribute("aria-label", "コピーする GPU 計測結果");
  Object.assign(fallbackText.style, { display: "block", width: "100%", font: "11px ui-monospace,monospace", boxSizing: "border-box" });
  fallbackLabel.append(fallbackText);
  fallback.append(fallbackLabel);
  panel.append(fallback);
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "wheel", "touchstart", "touchmove", "touchend"]) panel.addEventListener(type, (event) => event.stopPropagation());
  panel.addEventListener("keydown", (event) => {
    if (event.key === "F3" || event.key === "F4") return;
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  });
  panel.addEventListener("keyup", (event) => {
    if (event.key !== "F3" && event.key !== "F4") event.stopPropagation();
  });
  document.body.append(panel);
  return { update, showCopyFallback, destroy, showBreakdown, setBreakdownBusy };
  function showBreakdown(text) {
    if (destroyed) return;
    breakdownText.textContent = text || "";
    breakdownText.hidden = !text;
  }
  function setBreakdownBusy(busy) {
    breakdownBusy = !!busy;
    if (destroyed || !split) return;
    split.disabled = breakdownBusy || !!benchmark.active;
    split.textContent = busy ? "GPU の内訳を計測中…" : "GPU の内訳（約 7 秒）";
  }
  function select(key, options) {
    const line = node("label");
    Object.assign(line.style, { display: "flex", gap: "8px", alignItems: "center", justifyContent: "space-between", padding: "7px 0" });
    line.append(node("span", GPU_DEBUG_LABELS[key]));
    const input = node("select");
    input.dataset.gpuFlag = key;
    for (const [value, text] of options) {
      const option = node("option", text);
      option.value = value;
      input.append(option);
    }
    input.value = String(flags[key]);
    input.addEventListener("change", () => changeFlag(key, ["current", "device"].includes(input.value) ? input.value : Number(input.value)));
    line.append(input);
    controls.set(key, input);
    controlsDetails.append(line);
  }
  function invoke(callback) {
    try {
      const promise = callback();
      if (promise?.catch) promise.catch((error) => {
        if (!destroyed) status.textContent = `操作できませんでした：${String(error?.message || error)}`;
      });
    } catch (error) {
      status.textContent = `操作できませんでした：${String(error?.message || error)}`;
    }
  }
  function changeFlag(key, value) {
    if (benchmark.active || destroyed || flags[key] === value) return;
    flags = normalizeGpuDebugFlags({ ...flags, [key]: value });
    invoke(() => onFlags({ ...flags }));
  }
  function update(data = {}) {
    if (destroyed) return;
    if (data.flags) flags = normalizeGpuDebugFlags(data.flags);
    if (data.capabilities) capabilities = data.capabilities;
    if (data.benchmark) benchmark = data.benchmark;
    if (Object.hasOwn(data, "results")) results = data.results;
    const m = data.metrics;
    if (m) {
      values.get("fps").textContent = numeric(m.fps, 1);
      values.get("frame").textContent = `${ms(m.frame?.avgMs)} / ${ms(m.frame?.maxMs)}`;
      values.get("cpuTotal").textContent = ms(m.cpu?.totalMs);
      values.get("cpu").textContent = `${ms(m.cpu?.updateMs)} / ${ms(m.cpu?.renderMs)}`;
      values.get("gpu").textContent = Number.isFinite(m.gpu?.elapsedMs) ? ms(m.gpu.elapsedMs) : ["unsupported", "unavailable"].includes(m.gpu?.status) ? "計測不可" : m.gpu?.status === "disjoint" ? "計測無効" : "未測定";
      values.get("draws").textContent = `${numeric(m.draws?.calls, 1)} / ${numeric(m.draws?.triangles, 0)}`;
      values.get("resources").textContent = `${numeric(m.resources?.geometries, 0)} / ${numeric(m.resources?.textures, 0)} / ${numeric(m.resources?.programs, 0)}`;
      values.get("render").textContent = `${numeric(m.render?.calls, 1)} / ${numeric(m.render?.meshes, 1)}`;
      values.get("scene").textContent = `${numeric(m.scene?.meshes, 0)} / ${numeric(m.scene?.visible, 0)} / ${numeric(m.scene?.frustumIntersecting, 0)}`;
      values.get("pixels").textContent = `${numeric(m.drawingBuffer?.width, 0)} × ${numeric(m.drawingBuffer?.height, 0)} / ${numeric(m.pixelRatio, 2)}`;
      gpuNote.textContent = `GPU：${gpuStatus(m.gpu?.status)}・有効 ${m.gpu?.samples ?? 0} 件${Number.isFinite(m.gpu?.ageMs) ? `・最終計測 ${numeric(m.gpu.ageMs, 0)} ms 前` : ""}。描画 Mesh は実際に描画へ渡した固有 Mesh 数です。シーン集計は除外前・インスタンス数を含まず、視錐台の未判定は ${numeric(m.scene?.frustumUnknown, 0)} 件です。`;
    }
    for (const [key, input] of controls) {
      const cap = capabilities[key];
      input.disabled = !!benchmark.active || cap === false || cap?.available === false;
      if (input.type === "checkbox") input.checked = flags[key];
      else input.value = String(flags[key]);
      const note2 = controlNotes.get(key);
      if (note2) {
        note2.textContent = [cap === false || cap?.available === false ? "現在は利用不可" : cap?.effective === false ? "現在の画質・場所では変化なし" : "", ...cap?.notes || [], cap?.reason || ""].filter(Boolean).join(" / ");
      }
    }
    start.disabled = !!benchmark.active;
    cancel.disabled = !benchmark.active;
    if (split) split.disabled = !!benchmark.active || breakdownBusy;
    copy.disabled = !results;
    status.textContent = `${phaseLabel[benchmark.phase] || "待機中"}${benchmark.active && benchmark.index >= 0 ? ` ${benchmark.index + 1}/${benchmark.total}：${benchmark.label || ""}` : ""}${benchmark.active && Number.isFinite(benchmark.remainingMs) && benchmark.remainingMs > 0 ? `（この段階はあと ${Math.ceil(benchmark.remainingMs / 1e3)} 秒）` : ""}${benchmark.error ? `：${benchmark.error}` : ""}`;
    if (!results) {
      resultDetails.hidden = true;
      tableBody.replaceChildren();
      renderedReport = null;
      fallback.hidden = true;
      fallbackText.value = "";
    } else if (results !== renderedReport) {
      renderedReport = results;
      resultDetails.hidden = false;
      tableBody.replaceChildren();
      for (const row of results.rows || []) {
        const tr = node("tr"), condition = tableCell("th", row.label);
        condition.scope = "row";
        condition.style.textAlign = "left";
        condition.style.minWidth = "110px";
        const detail = node("small", `${row.complete ? "完了" : "未完了"}・${numeric(row.durationMs / 1e3, 2)} 秒・${row.samples} フレーム`);
        detail.style.display = "block";
        detail.style.fontWeight = "normal";
        condition.append(detail);
        const gpu = tableCell("td", Number.isFinite(row.gpu?.elapsedMs) ? ms(row.gpu.elapsedMs) : row.gpu?.status === "disjoint" ? "計測無効" : "計測不可");
        const gpuCount = node("small", `${row.gpu?.samples ?? 0} 件 / ${gpuStatus(row.gpu?.status)}`);
        gpuCount.style.display = "block";
        gpu.append(gpuCount);
        tr.append(condition, tableCell("td", ms(row.frame?.avgMs)), gpu, tableCell("td", numeric(row.draws?.calls, 1)), tableCell("td", numeric(row.draws?.triangles, 0)));
        tableBody.append(tr);
        if (row.notes?.length) {
          const noteRow = node("tr"), notes = tableCell("td", row.notes.join(" / "));
          notes.colSpan = 5;
          notes.style.color = "#adbdc4";
          notes.style.textAlign = "left";
          noteRow.append(notes);
          tableBody.append(noteRow);
        }
      }
    }
  }
  function showCopyFallback(text) {
    if (destroyed) return;
    fallback.hidden = false;
    fallbackText.value = String(text ?? "");
    fallbackText.focus();
    fallbackText.select();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    panel.remove();
  }
}
function node(tag, text) {
  const result = document.createElement(tag);
  if (text !== void 0) result.textContent = text;
  return result;
}
function button(text, callback) {
  const result = node("button", text);
  result.type = "button";
  Object.assign(result.style, { padding: "5px 8px", background: "#263740", color: "#e7eced", border: "1px solid #778a92", borderRadius: "3px", cursor: "pointer", font: "inherit" });
  result.addEventListener("click", callback);
  return result;
}
function gpuStatus(value) {
  return { available: "対応", ready: "対応", measured: "計測中", pending: "計測待ち", unavailable: "未測定・非対応", unsupported: "非対応", disjoint: "GPU 計測無効", timeout: "計測待ちが時間切れ", "context-lost": "WebGL 接続が切断" }[value] || String(value || "未測定");
}
function tableCell(tag, text) {
  const cell = node(tag, text);
  Object.assign(cell.style, { padding: "6px 5px", borderBottom: "1px solid #ffffff24", textAlign: "right", verticalAlign: "top", fontVariantNumeric: "tabular-nums" });
  return cell;
}

// gpu-breakdown.js
var GPU_BREAKDOWN = Object.freeze({
  // Frames measured, at most this long (ms); the last results are waited for
  // at most `drainMs`; a frame's timers at most `maxSegments`.
  frames: 240,
  maxMs: 9e3,
  drainMs: 3e3,
  maxSegments: 700
});
var STUB = Object.freeze({ enabled: false, beginFrame() {
}, beginRender() {
}, endFrame() {
}, suspend() {
}, resetSamples() {
}, dispose() {
}, appendSettings() {
}, refreshSettings() {
}, note() {
}, snapshot: () => ({ enabled: false }) });
var shortName = (name) => String(name || "").replace(/[:\-_ ]?\d.*$/, "").replace(/:.*$/, "").slice(0, 32);
function breakdownCategory(object, world, cache = null) {
  if (!object) return "?";
  let c = cache?.get(object);
  if (c !== void 0) return c;
  const name = object.name || "", data = object.userData || {};
  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  if (object === world?.sky?.skyMesh || name === "DynamicSky.mesh") c = "sky";
  else if (world?.terrainMaterial && (material === world.terrainMaterial || Array.isArray(object.material) && object.material.includes(world.terrainMaterial))) c = "terrain";
  else if (world?.distant?.material && material === world.distant.material) c = "terrain-far";
  else if (name.startsWith("tree-pool-shadow:")) c = "tree-shadow:" + (name.split(":")[4] === "1" ? "leaves" : "wood");
  else if (name.startsWith("tree-pool-prepass:")) c = "tree-" + (name.split(":")[3] || "?") + ":leaves-depth-first";
  else if (name.startsWith("tree-pool:")) {
    const parts = name.split(":");
    c = "tree-" + (parts[3] || "?") + ":" + (parts[4] === "1" ? "leaves" : "wood");
  } else if (name.startsWith("rock-pool-shadow:")) c = "rock-shadow";
  else if (name.startsWith("rock-pool:")) c = "rock";
  else if (data.isWater) c = "water:" + (shortName(name) || shortName(object.parent?.name) || "body");
  else if (name.startsWith("forest-understory:")) c = "understory:" + (name.split(":")[1] || "?");
  else if (name) c = shortName(name) || name.slice(0, 32);
  else {
    let o = object.parent;
    while (o && !o.name) o = o.parent;
    c = "^" + (shortName(o?.name) || o?.type || "?");
  }
  if (object.isPoints) c += "(points)";
  cache?.set(object, c);
  return c;
}
function runGpuBreakdown(world, { frames = GPU_BREAKDOWN.frames, maxMs = GPU_BREAKDOWN.maxMs, drainMs = GPU_BREAKDOWN.drainMs, maxSegments = GPU_BREAKDOWN.maxSegments, now = () => performance.now(), onProgress = null, onBeginRender = null, variants = null, setVariant = null } = {}) {
  const renderer = world?.renderer, gl = renderer?.getContext?.();
  let ext = null;
  try {
    ext = gl?.getExtension?.("EXT_disjoint_timer_query_webgl2") || null;
  } catch {
  }
  if (!renderer || !gl || !ext || typeof world.update !== "function") return Promise.resolve({ version: 1, status: "unsupported", frames: 0, segments: [], passes: [] });
  const T = ext.TIME_ELAPSED_EXT, info = renderer.info, shadowMap = renderer.shadowMap;
  const cache = /* @__PURE__ */ new WeakMap(), pool = [], pending = [], totals = /* @__PURE__ */ new Map();
  const atmosphere = world.atmosphere, postNames = /* @__PURE__ */ new Map();
  for (const [key, label2] of [["material", "final"], ["bloomPrefilter", "bloom"], ["bloomDown", "bloom"], ["bloomUp", "bloom"], ["shaftMask", "sun-shafts"], ["shaftBlur", "sun-shafts"], ["volumetricMarch", "light-through-trees"], ["volumetricBlur", "light-through-trees"]]) if (atmosphere?.[key]) postNames.set(atmosphere[key], label2);
  const originals = { update: world.update, render: renderer.render, direct: renderer.renderBufferDirect, shadow: shadowMap?.render }, ownUpdate = Object.prototype.hasOwnProperty.call(world, "update");
  const previous = world.renderDiagnostics;
  const stub = { ...STUB, beginRender() {
    try {
      onBeginRender?.();
    } catch {
    }
  } };
  let running = true, measuring = true, measured = 0, used = 0, discarded = 0, overflowFrames = 0, started = now(), drainStarted = 0;
  let segs = null, counts = null, label = null, pass = null, overflow = false, finished = false, resolveReport, cpuAt = 0, frameCpu = 0;
  const phaseTotals = /* @__PURE__ */ new Map(), phaseRunning = /* @__PURE__ */ new Set(), phaseWraps = [], variantTotals = /* @__PURE__ */ new Map(), ways = Array.isArray(variants) && variants.length ? variants.slice() : null;
  const stack = [];
  const passOf = (scene, camera) => {
    if (scene === world.scene) return camera === world.camera ? "main" : "capture";
    if (atmosphere && scene === atmosphere.scene) return "post:" + (postNames.get(atmosphere.quad?.material) || "other");
    if (world.dungeon && scene === world.dungeon) return "cave";
    const target = renderer.getRenderTarget?.(), name = target?.texture?.name;
    if (name) return "aux:" + name.slice(0, 28);
    return "aux:" + (shortName(scene?.name) || scene?.type || "?") + (target ? `@${target.width}x${target.height}` : "@canvas");
  };
  const begin = (next) => {
    if (!segs || next === label) return;
    if (overflow) return;
    const at = now();
    if (label !== null) cpu(label, at - cpuAt);
    cpuAt = at;
    try {
      if (label !== null) gl.endQuery(T);
      if (segs.length >= maxSegments) {
        overflow = true;
        next = "overflow";
      }
      const query = pool.pop() || gl.createQuery();
      gl.beginQuery(T, query);
      segs.push({ label: next, query });
      label = next;
    } catch {
      segs = null;
      label = null;
    }
  };
  const end = () => {
    if (label !== null) {
      cpu(label, now() - cpuAt);
      try {
        gl.endQuery(T);
      } catch {
      }
      label = null;
    }
  };
  const count = (key, draws, tris) => {
    let c = counts.get(key);
    if (!c) counts.set(key, c = { draws: 0, tris: 0, cpu: 0 });
    c.draws += draws;
    c.tris += tris;
  };
  const cpu = (key, ms2) => {
    if (!counts) return;
    let c = counts.get(key);
    if (!c) counts.set(key, c = { draws: 0, tris: 0, cpu: 0 });
    c.cpu += ms2;
  };
  function poll() {
    let disjoint = false;
    try {
      disjoint = !!gl.getParameter(ext.GPU_DISJOINT_EXT);
    } catch {
      disjoint = true;
    }
    if (disjoint) {
      for (const frame of pending.splice(0)) {
        discarded++;
        for (const s of frame.segs) recycle(s.query);
      }
      return;
    }
    while (pending.length) {
      const frame = pending[0], last = frame.segs[frame.segs.length - 1];
      if (last && !gl.getQueryParameter(last.query, gl.QUERY_RESULT_AVAILABLE)) break;
      let ok = true;
      const times = [];
      for (const s of frame.segs) {
        if (!gl.getQueryParameter(s.query, gl.QUERY_RESULT_AVAILABLE)) {
          ok = false;
          break;
        }
        times.push(gl.getQueryParameter(s.query, gl.QUERY_RESULT) / 1e6);
      }
      if (!ok) break;
      pending.shift();
      if (frame.variant != null) {
        let v = variantTotals.get(frame.variant);
        if (!v) variantTotals.set(frame.variant, v = { frames: 0, ms: 0, cpu: 0, labels: /* @__PURE__ */ new Map() });
        v.frames++;
        v.cpu += frame.cpu;
        frame.segs.forEach((s, i) => {
          v.ms += times[i];
          v.labels.set(s.label, (v.labels.get(s.label) || 0) + times[i]);
        });
      }
      frame.segs.forEach((s, i) => {
        const t = totals.get(s.label) || { ms: 0, draws: 0, tris: 0, cpu: 0 };
        t.ms += times[i];
        totals.set(s.label, t);
        recycle(s.query);
      });
      for (const [key, c] of frame.counts) {
        const t = totals.get(key) || { ms: 0, draws: 0, tris: 0, cpu: 0 };
        t.draws += c.draws;
        t.tris += c.tris;
        t.cpu += c.cpu;
        totals.set(key, t);
      }
      frameCpu += frame.cpu;
      for (const [k, v] of frame.phases) phaseTotals.set(k, (phaseTotals.get(k) || 0) + v);
      used++;
    }
  }
  function recycle(query) {
    if (pool.length < 2048) pool.push(query);
    else {
      try {
        gl.deleteQuery(query);
      } catch {
      }
    }
  }
  const update = function(...args) {
    if (!running) return originals.update.apply(this, args);
    try {
      poll();
    } catch {
    }
    if (!measuring) {
      if (!pending.length || now() - drainStarted > drainMs) finish();
      return originals.update.apply(this, args);
    }
    segs = [];
    counts = /* @__PURE__ */ new Map();
    label = null;
    pass = null;
    overflow = false;
    stack.length = 0;
    phases = /* @__PURE__ */ new Map();
    const variant = ways ? ways[measured % ways.length] : null;
    if (variant !== null) {
      try {
        setVariant?.(variant);
      } catch {
      }
    }
    const frameStart = now();
    begin("frame:-");
    try {
      return originals.update.apply(this, args);
    } finally {
      end();
      if (segs?.length) {
        pending.push({ segs, counts, cpu: now() - frameStart, phases, variant });
        measured++;
        if (overflow) overflowFrames++;
      }
      segs = null;
      counts = null;
      if (measured >= frames || now() - started > maxMs) {
        measuring = false;
        drainStarted = now();
        if (ways) {
          try {
            setVariant?.(null);
          } catch {
          }
        }
      }
      try {
        onProgress?.({ measured, frames, used });
      } catch {
      }
    }
  };
  const render = function(scene, camera) {
    if (!running || !segs) return originals.render.apply(this, arguments);
    stack.push(pass);
    pass = passOf(scene, camera);
    begin(pass + ":-");
    try {
      return originals.render.apply(this, arguments);
    } finally {
      pass = stack.pop();
      if (segs) begin(pass ? pass + ":-" : "frame:-");
    }
  };
  let shadowInner = originals.shadow;
  const shadow = function() {
    if (!running || !segs) return shadowInner.apply(this, arguments);
    stack.push(pass);
    pass = pass === "main" || pass === null ? "shadow" : pass + "-shadow";
    begin(pass + ":-");
    try {
      return shadowInner.apply(this, arguments);
    } finally {
      pass = stack.pop();
      if (segs) begin(pass ? pass + ":-" : "frame:-");
    }
  };
  const direct = function(camera, scene, geometry, material, object) {
    if (!running || !segs) return originals.direct.apply(this, arguments);
    const p = pass || "frame", detailed = p === "main" || p === "shadow" || p === "capture" || p === "cave";
    const key = detailed ? p + ":" + (material?.transparent && p !== "shadow" ? "see-through:" : "") + breakdownCategory(object, world, cache) : p + ":-";
    begin(key);
    const calls = info.render.calls, tris = info.render.triangles;
    const result = originals.direct.apply(this, arguments);
    if (counts) count(label ?? key, Math.max(0, info.render.calls - calls), Math.max(0, info.render.triangles - tris));
    return result;
  };
  function restore() {
    running = false;
    if (ways) {
      try {
        setVariant?.(null);
      } catch {
      }
    }
    if (world.update === update) {
      if (ownUpdate) world.update = originals.update;
      else delete world.update;
    }
    if (renderer.render === render) renderer.render = originals.render;
    if (renderer.renderBufferDirect === direct) renderer.renderBufferDirect = originals.direct;
    if (shadowMap && shadowMap.render === shadow) shadowMap.render = shadowInner;
    for (const [owner, key, wrapper, original] of phaseWraps.reverse()) if (owner[key] === wrapper) owner[key] = original;
    if (world.renderDiagnostics === stub) world.renderDiagnostics = previous;
    for (const frame of pending.splice(0)) for (const s of frame.segs) recycle(s.query);
    for (const query of pool.splice(0)) {
      try {
        gl.deleteQuery(query);
      } catch {
      }
    }
  }
  function report(status) {
    const n = Math.max(1, used), segments = [], passes = /* @__PURE__ */ new Map();
    let total = 0;
    for (const [key, t] of totals) {
      const ms2 = t.ms / n;
      total += ms2;
      segments.push({ label: key, ms: +ms2.toFixed(3), cpu: +((t.cpu || 0) / n).toFixed(3), draws: +(t.draws / n).toFixed(1), tris: Math.round(t.tris / n) });
      const p = key.slice(0, key.indexOf(":") < 0 ? key.length : key.indexOf(":"));
      const q = passes.get(p) || { pass: p, ms: 0, cpu: 0, draws: 0, tris: 0 };
      q.ms += ms2;
      q.cpu += (t.cpu || 0) / n;
      q.draws += t.draws / n;
      q.tris += t.tris / n;
      passes.set(p, q);
    }
    segments.sort((a, b) => b.ms - a.ms);
    const passList = [...passes.values()].map((q) => ({ pass: q.pass, ms: +q.ms.toFixed(3), cpu: +q.cpu.toFixed(3), draws: +q.draws.toFixed(1), tris: Math.round(q.tris) })).sort((a, b) => b.ms - a.ms);
    const phaseList = [...phaseTotals].map(([phase, ms2]) => ({ phase, cpu: +(ms2 / n).toFixed(3) })).sort((a, b) => b.cpu - a.cpu);
    const variantList = ways ? ways.map((name) => {
      const v = variantTotals.get(name) || { frames: 0, ms: 0, cpu: 0, labels: /* @__PURE__ */ new Map() }, m = Math.max(1, v.frames);
      const parts = [...v.labels].map(([label2, ms2]) => ({ label: label2, ms: +(ms2 / m).toFixed(3) })).sort((a, b) => b.ms - a.ms), byPass = /* @__PURE__ */ new Map();
      for (const { label: label2, ms: ms2 } of parts) {
        const p = label2.slice(0, label2.indexOf(":") < 0 ? label2.length : label2.indexOf(":"));
        byPass.set(p, (byPass.get(p) || 0) + ms2);
      }
      return {
        name,
        frames: v.frames,
        totalMs: +(v.ms / m).toFixed(3),
        cpuMs: +(v.cpu / m).toFixed(3),
        passes: [...byPass].map(([pass2, ms2]) => ({ pass: pass2, ms: +ms2.toFixed(3) })).sort((a, b) => b.ms - a.ms),
        segments: parts.slice(0, 60)
      };
    }) : void 0;
    return {
      version: 1,
      status,
      frames: measured,
      usedFrames: used,
      discardedFrames: discarded,
      overflowFrames,
      durationMs: Math.round(now() - started),
      totalMs: +total.toFixed(3),
      scope: "GPU elapsed per frame inside world.update (shadow, main view, captures, finishing, sky and water passes), split where the kind of work changes. Timer boundaries cost a little GPU time of their own.",
      cpuFrameMs: +(frameCpu / n).toFixed(3),
      cpuScope: "CPU per frame: world.update as a whole; each part, the time between its boundaries (its draws' submission); the world's steps (nested steps counted in their own and their caller's).",
      passes: passList,
      segments,
      phases: phaseList,
      ...variantList ? { variants: variantList } : {}
    };
  }
  function finish() {
    if (finished) return;
    finished = true;
    restore();
    resolveReport(report(used ? "complete" : "no-results"));
  }
  let phases = /* @__PURE__ */ new Map();
  for (const [path, phaseLabel2] of WORLD_PHASES) {
    const parts = path.split("."), key = parts.pop();
    let owner = world;
    for (const part of parts) {
      owner = owner?.[part];
      if (!owner) break;
    }
    const original = owner?.[key];
    if (typeof original !== "function") continue;
    const wrapper = function() {
      if (!running || phaseRunning.has(phaseLabel2)) return original.apply(this, arguments);
      phaseRunning.add(phaseLabel2);
      const t0 = now();
      try {
        return original.apply(this, arguments);
      } finally {
        phaseRunning.delete(phaseLabel2);
        if (phases) phases.set(phaseLabel2, (phases.get(phaseLabel2) || 0) + now() - t0);
      }
    };
    try {
      owner[key] = wrapper;
      phaseWraps.push([owner, key, wrapper, original]);
    } catch {
    }
  }
  try {
    previous?.suspend?.("gpu-breakdown");
  } catch {
  }
  world.renderDiagnostics = stub;
  world.update = update;
  renderer.render = render;
  renderer.renderBufferDirect = direct;
  if (shadowMap && typeof originals.shadow === "function") {
    shadowInner = shadowMap.render;
    shadowMap.render = shadow;
  }
  const promise = new Promise((resolve) => {
    resolveReport = resolve;
  });
  const guard = setTimeout(() => {
    if (!finished) {
      finished = true;
      restore();
      resolveReport(report(used ? "partial" : "timeout"));
    }
  }, maxMs + drainMs + 4e3);
  promise.finally(() => clearTimeout(guard));
  return Object.assign(promise, { cancel() {
    if (!finished) {
      finished = true;
      restore();
      resolveReport(report("cancelled"));
    }
  } });
}
var LEAF_LABELS = /^main:tree-(near|far):leaves/;
var LEAF_DEPTH_NAMES = Object.freeze({ equal: "先に描く（奥行きが同じ所だけ塗る・今の設定）", write: "先に描く（塗る時も奥行きを書く）", off: "先に描かない（v97.7 まで）" });
function leafDepthSummary(report) {
  if (!report?.variants) return null;
  const sum = (v, test) => +v.segments.filter((s) => test(s.label)).reduce((a, s) => a + s.ms, 0).toFixed(3);
  return {
    status: report.status,
    frames: report.usedFrames,
    durationMs: report.durationMs,
    variants: report.variants.map((v) => ({ name: v.name, frames: v.frames, totalMs: v.totalMs, cpuMs: v.cpuMs, mainMs: v.passes.find((p) => p.pass === "main")?.ms ?? 0, leavesMs: sum(v, (l) => LEAF_LABELS.test(l)), depthFirstMs: sum(v, (l) => /^main:tree-(near|far):leaves-depth-first/.test(l)) }))
  };
}
function formatGpuBreakdown(report, top = 14) {
  if (!report || report.status === "unsupported") return "この環境では GPU の時間を測れません（EXT_disjoint_timer_query_webgl2 がありません）。";
  const cpu = (v) => Number.isFinite(v) ? v.toFixed(2) : "-";
  const lines = [`GPU の内訳（${report.usedFrames} フレームの平均・GPU 合計 ${report.totalMs.toFixed(2)} ms・CPU ${cpu(report.cpuFrameMs)} ms）`];
  lines.push("— 段階（GPU / CPU）—");
  for (const p of report.passes.slice(0, 8)) lines.push(`${p.ms.toFixed(2).padStart(6)} / ${cpu(p.cpu).padStart(5)} ms  ${p.pass}  （描画 ${p.draws.toFixed(0)}・三角形 ${(p.tris / 1e3).toFixed(0)}k）`);
  lines.push("— GPU の重い順（GPU / CPU）—");
  for (const s of report.segments.slice(0, top)) lines.push(`${s.ms.toFixed(2).padStart(6)} / ${cpu(s.cpu).padStart(5)} ms  ${s.label}  （描画 ${s.draws.toFixed(0)}・三角形 ${(s.tris / 1e3).toFixed(0)}k）`);
  if (report.phases?.length) {
    lines.push("— CPU：世界の処理 —");
    for (const p of report.phases.slice(0, 10)) lines.push(`${cpu(p.cpu).padStart(6)} ms  ${p.phase}`);
  }
  const ab = report.leafDepthAB;
  if (ab?.variants?.length) {
    lines.push(`— 木の葉の奥行きを先に描く（${ab.variants.length} 通りを 1 フレームずつ交互に・GPU 合計 / 画面 / 近い木と中くらいの木の葉）—`);
    for (const v of ab.variants) lines.push(`${v.totalMs.toFixed(2).padStart(6)} / ${v.mainMs.toFixed(2).padStart(5)} / ${v.leavesMs.toFixed(2).padStart(5)} ms  ${LEAF_DEPTH_NAMES[v.name] || v.name}（${v.frames} フレーム）`);
  }
  return lines.join("\n");
}

// gpu-debug-runtime.js
function createGpuDebugRuntime({ world, host = {}, onClose = () => {
}, now = () => performance.now(), page = globalThis.window, document: document2 = globalThis.document, factories = {} } = {}) {
  if (!world?.renderer) throw new TypeError("GPU debug requires an initialized world");
  const makeMetrics = factories.metrics || createGpuDebugMetrics, makeScene = factories.scene || installGpuDebugScene, makeUI = factories.ui || createGpuDebugUI;
  const previousDiagnostics = world.renderDiagnostics;
  let metrics, scene, ui, benchmark, tag = null, flags = { ...GPU_DEBUG_DEFAULT_FLAGS }, cameraToken = null;
  let disposed = false, closing = false, closePromise = null, lastUI = -Infinity, held = false, lastError = null;
  let breakdownRun = null, lastBreakdown = null;
  async function breakdown({ auto = false } = {}) {
    if (disposed || closing || breakdownRun) return null;
    if (!auto && benchmark?.snapshot().active) return null;
    if (!auto && typeof host.isActive === "function" && !host.isActive()) {
      lastError = "ゲームが操作可能な状態で計測を開始してください";
      refresh(true);
      return null;
    }
    ui?.setBreakdownBusy?.(true);
    const run = factories.breakdown || runGpuBreakdown, onBeginRender = () => {
      if (held) host.holdCamera?.(cameraToken);
    };
    let restoreMode = null;
    const modes = world.leafDepthFirstModes;
    try {
      breakdownRun = run(world, { onBeginRender });
      const report = await breakdownRun;
      if (report?.status === "complete" && Array.isArray(modes) && modes.length > 1 && !disposed && !closing) {
        const was = world.leafDepthFirst;
        restoreMode = { was };
        breakdownRun = run(world, { frames: 50 * modes.length, maxMs: 4500, drainMs: 2e3, variants: modes, setVariant: (v) => {
          world.leafDepthFirst = v ?? was;
        }, onBeginRender });
        const ab = await breakdownRun;
        const summary = leafDepthSummary(ab);
        if (summary) report.leafDepthAB = summary;
      }
      ui?.showBreakdown?.(formatGpuBreakdown(report));
      if (!auto && report?.status === "complete") try {
        host.onBreakdown?.(report);
      } catch {
      }
      return report;
    } finally {
      if (restoreMode) world.leafDepthFirst = restoreMode.was;
      breakdownRun = null;
      ui?.setBreakdownBusy?.(false);
      refresh(true);
    }
  }
  const removers = [];
  const water = () => world.realisticWater;
  const waterState = () => water()?.snapshot?.()?.debug || null;
  function capabilities() {
    const caps = { ...scene.capabilities }, ws = waterState(), available = typeof water()?.setDebugOptions === "function";
    caps.waterReflection = { available, effective: ws?.effective?.waterActive !== false, notes: ["SSR と水面の環境反射を無効化。空の反射マップ生成・太陽の照り返し・水中の反射は残ります。"] };
    caps.waterRefraction = { available, effective: ws?.effective?.waterActive !== false && world.quality !== "low", notes: ["屈折用の景色の撮影を停止。共有画像がなくなるため SSR も停止します。低画質では元から撮影しません。"] };
    caps.shadows = { available: !!scene.capabilities.shadows, effective: world.renderer.shadowMap?.enabled !== false, notes: ["内部の影描画は Draw calls に含まれ、render() 呼出回数とは別です。"] };
    caps.post = { available: !!scene.capabilities.post, effective: world.quality !== "low", notes: ["AA・AO・光・色補正は一つの統合パスです。パス全体を切り替えます。"] };
    caps.sky = { available: !!scene.capabilities.sky, effective: !world.inDungeon, notes: ["単色背景にして空の更新を停止。既存の照明と環境マップは固定します。"] };
    caps.waterSurface = { available: true, notes: ["水のメッシュだけを非表示にします。波の計算・景色の撮影は続きます。"] };
    caps.fog = { available: true, notes: ["地形・物体の霧。水中の吸収や独立した気象のもやは対象外です。"] };
    return caps;
  }
  function metadata() {
    return { capturedAt: (/* @__PURE__ */ new Date()).toISOString(), ...host.metadata?.(), quality: world.quality, inDungeon: !!world.inDungeon, capabilities: capabilities(), limitations: [...scene.limitations], water: waterState(), measurement: metrics.snapshot(), note: "Diagnostic overhead is present in every condition. Software rendering is not a hardware GPU benchmark. Time/weather continue; frame cap is retained." };
  }
  function refresh(force = false) {
    if (disposed || !ui || !metrics || !scene || !benchmark) return;
    if (!force && now() - lastUI < 250) return;
    lastUI = now();
    const measured = metrics.snapshot();
    measured.scene = scene.snapshot().scene;
    const progress = benchmark.snapshot();
    if (lastError && !progress.error) progress.error = lastError;
    ui.update({ metrics: measured, flags, capabilities: capabilities(), benchmark: progress, results: benchmark.results() });
  }
  function apply(next) {
    const before = flags, normalized = normalizeGpuDebugFlags(next);
    const sceneFlags = { ...normalized };
    delete sceneFlags.waterReflection;
    delete sceneFlags.waterRefraction;
    try {
      water()?.setDebugOptions?.({ reflection: normalized.waterReflection, refraction: normalized.waterRefraction });
      scene.setFlags(sceneFlags);
      flags = normalized;
      lastError = null;
    } catch (error) {
      const failures = [], details = [];
      try {
        water()?.setDebugOptions?.({ reflection: before.waterReflection, refraction: before.waterRefraction });
      } catch (restoreError) {
        failures.push(restoreError);
        details.push(`水の復元：${restoreError.message || restoreError}`);
      }
      const oldScene = { ...before };
      delete oldScene.waterReflection;
      delete oldScene.waterRefraction;
      try {
        scene.setFlags(oldScene);
      } catch (restoreError) {
        failures.push(restoreError);
        details.push(`描画の復元：${restoreError.message || restoreError}`);
      }
      lastError = [String(error.message || error), ...details].join(" / ");
      if (failures.length) throw new AggregateError([error, ...failures], lastError, { cause: error });
      throw error;
    } finally {
      refresh(true);
    }
    return { effectiveFlags: { ...flags, water: waterState()?.effective || null }, notes: [], metadata: { water: waterState(), terrain: scene.snapshot().terrain, pixelRatio: world.renderer.getPixelRatio?.() } };
  }
  function setFlags(next) {
    if (closing || disposed) throw new Error("GPU debug is closing");
    if (benchmark.snapshot().active) throw new Error("計測中は個別設定を変更できません");
    return apply({ ...flags, ...next });
  }
  function event(target, name, callback) {
    target?.addEventListener(name, callback);
    removers.push(() => target?.removeEventListener(name, callback));
  }
  function cancel(reason = "user") {
    return benchmark?.cancel(reason);
  }
  function releaseCamera(token) {
    cameraToken = null;
    held = false;
    try {
      if (token !== void 0 && token !== null) host.restoreCamera?.(token);
    } finally {
      try {
        host.setBenchmarkActive?.(false);
      } finally {
        host.clearInput?.();
      }
    }
  }
  previousDiagnostics?.suspend?.("gpu-debug");
  try {
    let makeBenchmark = function() {
      return createGpuDebugBenchmark({
        now,
        states: benchmarkPlan(makeGpuBenchmarkStates(capabilities())),
        applyState: (next) => apply(next),
        setTag: (value) => {
          tag = value;
        },
        freeze: () => {
          const token = { flags: { ...flags }, camera: null, quality: world.quality, inDungeon: !!world.inDungeon };
          host.clearInput?.();
          host.setBenchmarkActive?.(true);
          try {
            token.camera = host.freezeCamera?.();
            cameraToken = token.camera;
            held = true;
            return token;
          } catch (error) {
            releaseCamera(token.camera);
            throw error;
          }
        },
        restore: async (token) => {
          try {
            if (token?.flags) apply(token.flags);
            if (benchmark?.snapshot().phase === "finishing" && !disposed && !closing) lastBreakdown = await breakdown({ auto: true }).catch(() => null);
          } finally {
            releaseCamera(token?.camera);
          }
        },
        onProgress: () => refresh(true),
        onResults: (report) => {
          if (lastBreakdown && report?.status === "complete") report.breakdown = lastBreakdown;
          lastBreakdown = null;
          refresh(true);
          try {
            host.onResults?.(report);
          } catch {
          }
        },
        metadata: metadata()
      });
    };
    metrics = makeMetrics({
      renderer: world.renderer,
      now,
      page,
      document: document2,
      getTag: () => tag,
      onFrame: (sample) => {
        if (disposed) return;
        benchmark?.onFrame(sample);
        refresh();
      },
      onGpu: (sample) => {
        if (disposed) return;
        benchmark?.onGpu(sample);
      }
    });
    world.renderDiagnostics = metrics.diagnostics;
    scene = makeScene({ world });
    const beginRender = metrics.diagnostics.beginRender;
    metrics.diagnostics.beginRender = function(...args) {
      if (held) host.holdCamera?.(cameraToken);
      return beginRender.apply(this, args);
    };
    removers.push(() => {
      metrics.diagnostics.beginRender = beginRender;
    });
    benchmark = makeBenchmark();
    const beginFrame = metrics.diagnostics.beginFrame;
    let runQuality, runDungeon;
    metrics.diagnostics.beginFrame = function(...args) {
      if (benchmark.snapshot().active) {
        if (typeof host.isActive === "function" && !host.isActive()) void cancel("game-inactive");
        else if (runQuality !== world.quality || runDungeon !== !!world.inDungeon) void cancel("scene-or-quality-changed");
      }
      return beginFrame.apply(this, args);
    };
    removers.push(() => {
      metrics.diagnostics.beginFrame = beginFrame;
    });
    const suspend = metrics.diagnostics.suspend;
    metrics.diagnostics.suspend = function(...args) {
      if (benchmark.snapshot().active) void cancel(args[0] || "game-suspended");
      return suspend.apply(this, args);
    };
    removers.push(() => {
      metrics.diagnostics.suspend = suspend;
    });
    async function startBenchmark() {
      if (disposed || closing) return false;
      if (benchmark.snapshot().active) return false;
      if (typeof host.isActive === "function" && !host.isActive()) {
        lastError = "ゲームが操作可能な状態で計測を開始してください";
        refresh(true);
        return false;
      }
      runQuality = world.quality;
      runDungeon = !!world.inDungeon;
      benchmark = makeBenchmark();
      return benchmark.start();
    }
    ui = makeUI({
      onFlags: setFlags,
      onBenchmark: startBenchmark,
      onCancel: () => cancel("user"),
      onClose,
      onBreakdown: () => breakdown(),
      onCopy: async (report) => {
        if (!report) return false;
        const text = formatGpuBenchmarkReport(report);
        if (!page?.navigator?.clipboard?.writeText) return false;
        await page.navigator.clipboard.writeText(text);
        return true;
      }
    });
    event(page, "blur", () => {
      void cancel("window-blurred");
    });
    event(page, "resize", () => {
      void cancel("viewport-resized");
    });
    event(document2, "visibilitychange", () => {
      if (document2.hidden) void cancel("page-hidden");
    });
    event(world.renderer.domElement, "webglcontextlost", () => {
      void cancel("context-lost");
    });
    event(page, "pagehide", () => {
      void dispose();
    });
    refresh(true);
    return { snapshot, setFlags, startBenchmark, cancelBenchmark: cancel, dispose };
  } catch (error) {
    disposed = true;
    const failures = [], attempt = (callback) => {
      try {
        callback();
      } catch (failure) {
        failures.push(failure);
      }
    };
    for (const remove of removers.reverse()) attempt(remove);
    attempt(() => ui?.destroy());
    attempt(() => scene?.dispose());
    attempt(() => metrics?.dispose());
    if (world.renderDiagnostics === metrics?.diagnostics) world.renderDiagnostics = previousDiagnostics;
    attempt(() => releaseCamera(cameraToken));
    if (failures.length) throw new AggregateError([error, ...failures], `${error?.message || error}; GPU debug cleanup also failed`, { cause: error });
    throw error;
  }
  function snapshot() {
    return { enabled: !disposed, closing, flags: { ...flags }, metrics: metrics.snapshot(), scene: scene.snapshot(), water: waterState(), benchmark: benchmark.snapshot(), results: benchmark.results(), error: lastError };
  }
  function dispose() {
    if (closePromise) return closePromise;
    closing = true;
    try {
      breakdownRun?.cancel?.();
    } catch {
    }
    closePromise = (async () => {
      let failure;
      try {
        await cancel("debug-closed");
      } catch (error) {
        failure = error;
      }
      try {
        water()?.setDebugOptions?.(null);
      } catch (error) {
        failure ||= error;
      }
      disposed = true;
      for (const remove of removers.reverse()) try {
        remove();
      } catch (error) {
        failure ||= error;
      }
      try {
        scene?.dispose();
      } catch (error) {
        failure ||= error;
      }
      try {
        ui?.destroy();
      } catch (error) {
        failure ||= error;
      }
      try {
        metrics?.dispose();
      } catch (error) {
        failure ||= error;
      }
      if (world.renderDiagnostics === metrics?.diagnostics) world.renderDiagnostics = previousDiagnostics;
      try {
        releaseCamera(cameraToken);
      } catch (error) {
        failure ||= error;
      }
      world.needsFrame = true;
      if (failure) {
        lastError = String(failure.message || failure);
        throw failure;
      }
    })();
    return closePromise;
  }
}
export {
  createGpuDebugRuntime
};
