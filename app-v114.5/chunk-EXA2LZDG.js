import {
  ACTIVE_WORLD_SEED
} from "./chunk-UWU2KGE2.js";
import {
  Vector2,
  Vector4,
  three_module_exports
} from "./chunk-UPROFF5E.js";
import {
  WORKER_NAMES,
  reportWorker
} from "./chunk-HGFZA34L.js";
import {
  ISLAND_FRAME,
  START,
  SWAMP,
  WORLD_DATA_VERSION,
  clamp,
  clamp01,
  datan2,
  dhypot,
  fbm,
  generateWorldData,
  gnoise,
  ridged,
  smoothstep,
  validWorldData
} from "./chunk-RO4SQODB.js";

// worldgen/world-cache.js
var DB_NAME = "kumarim-worldgen";
var STORE = "worlds";
var KEEP = 4;
var keyFor = (seed) => WORLD_DATA_VERSION + ":" + (seed >>> 0);
function openDatabase() {
  return new Promise((resolve, reject) => {
    const idb = globalThis.indexedDB;
    if (!idb) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = idb.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}
function finish(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
  });
}
async function readCached(seed) {
  let db;
  try {
    db = await openDatabase();
    const tx = db.transaction(STORE, "readonly"), request = tx.objectStore(STORE).get(keyFor(seed));
    const value = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return validWorldData(value?.data, seed) ? value.data : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
async function writeCached(seed, data) {
  let db;
  try {
    db = await openDatabase();
    const tx = db.transaction(STORE, "readwrite"), store = tx.objectStore(STORE);
    store.put({ savedAt: Date.now(), data }, keyFor(seed));
    const keys = await new Promise((resolve, reject) => {
      const r = store.getAllKeys();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const current = keys.filter((k) => String(k).startsWith(WORLD_DATA_VERSION + ":"));
    for (const k of keys) if (!String(k).startsWith(WORLD_DATA_VERSION + ":")) store.delete(k);
    if (current.length > KEEP) for (const k of current.filter((k2) => k2 !== keyFor(seed)).slice(0, current.length - KEEP)) store.delete(k);
    await finish(tx);
  } catch {
  } finally {
    db?.close();
  }
}
function generateInWorker(seed, onProgress) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("./world-worker-NTJTWIS5.js", import.meta.url), { type: "module" });
    } catch (error) {
      reportWorker(WORKER_NAMES.world, false, error?.message);
      reject(error);
      return;
    }
    worker.onmessage = ({ data }) => {
      if (data?.type === "progress") onProgress?.(data.value);
      else if (data?.type === "done") {
        reportWorker(WORKER_NAMES.world, true);
        worker.terminate();
        resolve(data.data);
      } else if (data?.type === "error") {
        worker.terminate();
        reject(new Error(data.message));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      reportWorker(WORKER_NAMES.world, false, event.message);
      worker.terminate();
      reject(new Error(event.message || "World generation worker failed"));
    };
    worker.postMessage({ type: "generate", seed: seed >>> 0 });
  });
}
async function loadWorldData(seed, { onProgress = null, useCache = true } = {}) {
  const started = performance.now();
  if (useCache) {
    const cached = await readCached(seed);
    if (cached) return { data: cached, source: "cache", ms: Math.round(performance.now() - started) };
  }
  let data = null, source = "worker";
  try {
    if (typeof Worker !== "function") throw null;
    data = await generateInWorker(seed, onProgress);
    if (!validWorldData(data, seed)) throw new Error("World generation worker returned another build's island");
  } catch (error) {
    if (error) console.warn("World generation worker unavailable; generating on the main thread", error);
    source = "main";
    await new Promise((resolve) => setTimeout(resolve, 30));
    data = generateWorldData(seed);
  }
  if (!validWorldData(data, seed)) throw new Error("Generated world data failed validation");
  if (useCache) writeCached(seed, data);
  return { data, source, ms: Math.round(performance.now() - started) };
}

// water-first-curves.js
var MAX_CONTROLS = 1024;
var MAX_SAMPLES = 32769;
var DEFAULT_STEP = 3;
function checkedPoints(points, { bankWidth = 8, valleyWidth = 48 } = {}) {
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_CONTROLS) {
    throw new RangeError("River needs 2–1024 control points");
  }
  return points.map((point, index) => {
    const p = {
      x: point?.x,
      z: point?.z,
      level: point?.level,
      halfWidth: point?.halfWidth,
      depth: point?.depth,
      bankWidth: point?.bankWidth ?? bankWidth,
      valleyWidth: point?.valleyWidth ?? valleyWidth
    };
    if (!Object.values(p).every(Number.isFinite) || p.halfWidth <= 0 || p.depth <= 0 || p.bankWidth < 0 || p.valleyWidth < 0) {
      throw new RangeError("Invalid river control point " + index);
    }
    if (index && p.x === points[index - 1].x && p.z === points[index - 1].z) {
      throw new RangeError("River controls need nonzero horizontal separation");
    }
    return p;
  });
}
function checkedStep(sampleStep = DEFAULT_STEP) {
  if (!Number.isFinite(sampleStep) || sampleStep <= 0) {
    throw new RangeError("River sampleStep must be finite and positive");
  }
  return sampleStep;
}
function renderOptions(points, step) {
  return {
    points: points.map((p) => [p.x, p.level, p.z]),
    width: points.map((p) => p.halfWidth * 2),
    segmentLength: step,
    crossSegments: 8,
    bankOverlap: 0
  };
}
function sampleWaterFirstRiver(THREE, renderPoints, options = {}) {
  if (typeof THREE?.Vector3 !== "function" || typeof THREE?.CatmullRomCurve3 !== "function") {
    throw new TypeError("The rendering THREE instance is required");
  }
  const controls = checkedPoints(renderPoints, options);
  const sampleStep = checkedStep(options.sampleStep);
  const vectors = controls.map((p) => new THREE.Vector3(p.x, p.level, p.z));
  const curve = new THREE.CatmullRomCurve3(vectors, false, "centripetal", 0.5);
  const total = curve.getLength();
  if (!Number.isFinite(total) || total <= 0) throw new RangeError("Invalid river arc length");
  const rows = Math.max(4, Math.ceil(total / sampleStep));
  if (rows + 1 > MAX_SAMPLES) throw new RangeError("River sample budget exceeded");
  const widths = controls.map((p) => p.halfWidth * 2);
  const lengths400 = curve.getLengths(400);
  const controlU = controls.map((_, i) => lengths400[Math.round(i / (controls.length - 1) * 400)] / total);
  const scalarAt = (values, u) => {
    for (let i = 0; i < controlU.length - 1; i++) {
      if (u <= controlU[i + 1]) {
        const t = (u - controlU[i]) / Math.max(1e-6, controlU[i + 1] - controlU[i]);
        return values[i] + (values[i + 1] - values[i]) * t;
      }
    }
    return values[values.length - 1];
  };
  const depths = controls.map((p) => p.depth), banks = controls.map((p) => p.bankWidth);
  const valleys = controls.map((p) => p.valleyWidth);
  const points = [], bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  const waterBounds = { ...bounds };
  const point = new THREE.Vector3(), tangent = new THREE.Vector3();
  let maxSampleRise = 0, maxUphillGrade = 0, maxDownhillGrade = 0;
  let maxSampledHorizontalStep = 0, minHalfWidth = Infinity, maxHalfWidth = 0;
  let minimumHorizontalTangent = Infinity;
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    curve.getPointAt(u, point);
    curve.getTangentAt(u, tangent);
    const horizontal = Math.hypot(tangent.x, tangent.z);
    const hl = horizontal || 1;
    const grade = Math.max(0, -tangent.y) / hl;
    const halfWidth = scalarAt(widths, u) / 2;
    const depth = scalarAt(depths, u), bankWidth = scalarAt(banks, u), valleyWidth = scalarAt(valleys, u);
    const p = {
      x: point.x,
      z: point.z,
      level: point.y,
      halfWidth,
      depth,
      bankWidth,
      valleyWidth,
      u,
      along: u * total,
      fx: tangent.x / hl,
      fz: tangent.z / hl,
      grade
    };
    if (!Object.values(p).every(Number.isFinite) || halfWidth <= 0 || depth <= 0 || bankWidth < 0 || valleyWidth < 0) {
      throw new RangeError("Invalid interpolated river sample " + i);
    }
    const previous = points[points.length - 1];
    if (previous) {
      maxSampleRise = Math.max(maxSampleRise, p.level - previous.level);
      maxSampledHorizontalStep = Math.max(maxSampledHorizontalStep, Math.hypot(p.x - previous.x, p.z - previous.z));
    }
    maxUphillGrade = Math.max(maxUphillGrade, tangent.y / hl);
    maxDownhillGrade = Math.max(maxDownhillGrade, grade);
    minimumHorizontalTangent = Math.min(minimumHorizontalTangent, horizontal);
    minHalfWidth = Math.min(minHalfWidth, halfWidth);
    maxHalfWidth = Math.max(maxHalfWidth, halfWidth);
    const pad = halfWidth + bankWidth + valleyWidth;
    bounds.minX = Math.min(bounds.minX, p.x - pad);
    bounds.maxX = Math.max(bounds.maxX, p.x + pad);
    bounds.minZ = Math.min(bounds.minZ, p.z - pad);
    bounds.maxZ = Math.max(bounds.maxZ, p.z + pad);
    waterBounds.minX = Math.min(waterBounds.minX, p.x - halfWidth);
    waterBounds.maxX = Math.max(waterBounds.maxX, p.x + halfWidth);
    waterBounds.minZ = Math.min(waterBounds.minZ, p.z - halfWidth);
    waterBounds.maxZ = Math.max(waterBounds.maxZ, p.z + halfWidth);
    points.push(p);
  }
  const tolerance = 1e-9;
  return { points, bounds, waterBounds, render: renderOptions(controls, sampleStep), proof: {
    version: "water-first-public-river-curves-v1",
    curveType: "centripetal",
    tension: 0.5,
    closed: false,
    controlCount: controls.length,
    sampleCount: points.length,
    rowCount: points.length,
    crossSegments: 8,
    sampleStep,
    segments: rows,
    totalLength: total,
    actualArcStep: total / rows,
    maxSampledHorizontalStep,
    arcLengthDivisions: curve.arcLengthDivisions,
    controlLengthDivisions: 400,
    totalLength400: lengths400[lengths400.length - 1],
    controlU,
    widthInterpolation: "vendor-full-width-linear-at-400-control-U-over-default-total",
    controlYMonotone: controls.every((p, i) => !i || p.level <= controls[i - 1].level),
    sampledYMonotone: maxSampleRise <= tolerance,
    maxSampleRise,
    monotonicityTolerance: tolerance,
    maxUphillGrade,
    maxDownhillGrade,
    minimumHorizontalTangent,
    minHalfWidth,
    maxHalfWidth,
    scope: "Samples and sampled tangent grades only; no continuous curve or terrain-triangle proof",
    boundsScope: "Sampled centerline padded by halfWidth + bankWidth + valleyWidth; not an analytic curve bound",
    deviations: [
      "No geometry, speed, rapids, UVs or GPU work",
      "Depth, bankWidth and valleyWidth use the vendor width interpolation as an app extension",
      "Public render options explicitly use bankOverlap=0 and segmentLength=sampleStep",
      "Never pass sampled points back as public controls: that would fit a different curve"
    ]
  } };
}

// worldgen/river-finish.js
var RIVER_FINISH = Object.freeze({
  ribbonMargin: 1.4,
  // the water ribbon reaches this far past the wet channel; banks hide it
  waterfallMinDrop: 5,
  waterfallsPerRiver: 2,
  waterfallsTotal: 18,
  waterfallSpacing: 120,
  cascadeGrade: 0.6,
  // other steps become cascades of at most this grade
  springStart: 18,
  // spring-fed water appears this far below the source
  // v92: the ground is carved for a spring-fed river only from about this far
  // below where its water appears (terrain-sampler.js riverCarve: springs
  // emerge gradually); no waterfall's lip lies closer (its sheet would fall
  // from uncut ground).
  springCarve: 44,
  controlStride: 3,
  // public controls every 3rd 3 m point (9 m)
  maxRise: 0.03,
  // tolerated upstream rise of the sampled curve (m)
  junctionDrop: 0.05
  // a tributary slips this far under its parent's surface
});
var ARRAYS = ["x", "z", "level", "width", "depth", "bank", "area", "floor"];
function copyRiver(r) {
  const out = { id: r.id, parent: r.parent, terminal: r.terminal, source: r.source };
  for (const key of ARRAYS) out[key] = Float64Array.from(r[key]);
  out.s = Float64Array.from(r.s);
  out.falls = r.falls.map((f2) => ({ ...f2 }));
  return out;
}
function spreadDrops(r, keep, grade) {
  const m = r.x.length, L = r.level, original = Float64Array.from(L);
  for (let k = 1; k < m; k++) {
    if (keep.has(k)) continue;
    const drop = original[k - 1] - original[k], ds = Math.max(0.5, r.s[k] - r.s[k - 1]);
    if (drop <= grade * ds) continue;
    const reach = drop / grade;
    for (let q = k - 1; q >= 0 && r.s[k] - r.s[q] <= reach && !keep.has(q + 1) || q === k - 1; q--) L[q] = Math.min(L[q], original[k] + grade * (r.s[k] - r.s[q]));
  }
  for (let k = 1; k < m; k++) if (L[k] > L[k - 1]) L[k] = L[k - 1];
}
function riverIndexAt(r, x, z) {
  let best = 0, bd = Infinity;
  for (let k = 0; k < r.x.length; k++) {
    const dx = r.x[k] - x, dz = r.z[k] - z, d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return { k: best, distance: Math.sqrt(bd) };
}
function controlIndices(r, level, a, b, stride) {
  const keep = /* @__PURE__ */ new Set([a, b]);
  for (let k = a; k < b; k += stride) keep.add(k);
  for (let k = a + 1; k < b; k++) {
    const g0 = (level[k - 1 - a] - level[k - a]) / Math.max(0.5, r.s[k] - r.s[k - 1]), g1 = (level[k - a] - level[k + 1 - a]) / Math.max(0.5, r.s[k + 1] - r.s[k]);
    if (Math.abs(g1 - g0) > 0.15) {
      keep.add(k - 1);
      keep.add(k);
      keep.add(k + 1);
    }
  }
  const list = [...keep].filter((k) => k >= a && k <= b).sort((p, q) => p - q);
  return list.filter((k, i) => !i || k === b || Math.hypot(r.x[k] - r.x[list[i - 1]], r.z[k] - r.z[list[i - 1]]) >= 1);
}
function smoothLevels(level, a, b, radius) {
  const out = new Float64Array(b - a + 1);
  for (let k = a; k <= b; k++) {
    let sum = 0, c = 0;
    for (let j = Math.max(a, k - radius); j <= Math.min(b, k + radius); j++) {
      sum += level[j];
      c++;
    }
    out[k - a] = Math.min(level[k], sum / c);
  }
  out[0] = level[a];
  out[out.length - 1] = level[b];
  for (let i = 1; i < out.length; i++) out[i] = Math.min(out[i], out[i - 1]);
  for (let i = out.length - 2; i >= 0; i--) out[i] = Math.max(out[i], out[i + 1]);
  return out;
}
function sampleRun(THREE, r, a, b, margin) {
  let result = null;
  for (const radius of [3, 5, 8]) {
    const level = smoothLevels(r.level, a, b, radius), indices = controlIndices(r, level, a, b, RIVER_FINISH.controlStride);
    const controls = indices.map((k) => ({
      x: r.x[k],
      z: r.z[k],
      level: level[k - a],
      halfWidth: r.width[k] * 0.5 + margin,
      depth: Math.max(0.05, r.depth[k]),
      bankWidth: 1.4 + 2.5 * r.bank[k],
      valleyWidth: 24
    }));
    const sampled = sampleWaterFirstRiver(THREE, controls, { sampleStep: 3 });
    const controlU = sampled.proof.controlU;
    let ci = 0;
    for (const p of sampled.points) {
      while (ci < controlU.length - 2 && p.u > controlU[ci + 1]) ci++;
      const t = clamp((p.u - controlU[ci]) / Math.max(1e-9, controlU[ci + 1] - controlU[ci]), 0, 1);
      p.source = indices[ci] + (indices[ci + 1] - indices[ci]) * t;
    }
    result = { controls, indices, sampled, rise: sampled.proof.maxSampleRise, radius };
    if (result.rise <= RIVER_FINISH.maxRise) break;
  }
  return result;
}
function interpolate(array, f2) {
  const i = Math.max(0, Math.min(array.length - 1, Math.floor(f2))), j = Math.min(array.length - 1, i + 1), t = f2 - i;
  return array[i] + (array[j] - array[i]) * t;
}
function finishRivers(THREE, shaped, { lakes = [], seaLevel = 0.62 } = {}) {
  const F = RIVER_FINISH, margin = F.ribbonMargin;
  const rivers = shaped.map(copyRiver);
  const candidates = [];
  for (const r of rivers) for (let k = 3; k < r.x.length - 3; k++) {
    const drop = r.level[k - 1] - r.level[k];
    if (drop >= F.waterfallMinDrop) candidates.push({ r, f: { k, top: r.level[k - 1], bottom: r.level[k], drop }, score: drop * Math.sqrt(Math.max(1, r.width[k])) });
  }
  candidates.sort((a, b) => b.score - a.score || a.r.id - b.r.id || a.f.k - b.f.k);
  const chosen = new Map(rivers.map((r) => [r, []]));
  let total = 0;
  for (const c of candidates) {
    if (total >= F.waterfallsTotal) break;
    const list = chosen.get(c.r);
    if (list.length >= F.waterfallsPerRiver || list.some((f2) => Math.abs(c.r.s[f2.k] - c.r.s[c.f.k]) < F.waterfallSpacing)) continue;
    list.push(c.f);
    total++;
  }
  const runs = [], waterfalls = [];
  for (const r of rivers) {
    const falls = chosen.get(r).sort((a, b) => a.k - b.k);
    const m = r.x.length;
    let start = 0;
    if (r.source.kind !== "lake") while (start < m - 3 && r.s[start] < F.springStart) start++;
    const used = [];
    {
      let a = start;
      for (const f2 of falls) {
        if (f2.k - 1 - a < 3 || f2.k > m - 4 || r.source.kind !== "lake" && r.s[f2.k - 1] - r.s[start] < F.springCarve) continue;
        used.push(f2);
        a = f2.k;
      }
    }
    spreadDrops(r, new Set(used.map((f2) => f2.k)), F.cascadeGrade);
    if (r.terminal.kind === "river") {
      const parent = rivers.find((p) => p.id === r.terminal.riverId && p.final);
      if (parent) {
        const m2 = r.x.length, end = riverIndexAt(parent.final, r.x[m2 - 1], r.z[m2 - 1]);
        const target = parent.final.level[end.k] - F.junctionDrop, reach = parent.final.width[end.k] * 0.5 + margin + 1;
        const after = used.length ? used[used.length - 1].k : 0, from = Math.max(after, m2 - 1 - Math.min(m2 - 1, 24));
        for (let k = from; k < m2; k++) {
          const t = smoothstep(from, m2 - 1, k);
          r.level[k] = r.level[k] * (1 - t) + target * t;
        }
        for (let k = after; k < m2; k++) if (Math.hypot(r.x[k] - r.x[m2 - 1], r.z[k] - r.z[m2 - 1]) <= reach) r.level[k] = Math.min(r.level[k], target);
        for (let k = 1; k < m2; k++) r.level[k] = Math.min(r.level[k], r.level[k - 1]);
      }
    }
    const bounds = [];
    {
      let a = start, feeding = null;
      for (const f2 of used) {
        bounds.push([a, f2.k - 1, feeding]);
        a = f2.k;
        feeding = f2;
      }
      bounds.push([a, m - 1, feeding]);
    }
    const finalParts = [];
    for (const [ra, rb, fall] of bounds) {
      if (rb - ra < 2) continue;
      const result = sampleRun(THREE, r, ra, rb, margin);
      if (!result) continue;
      const previous = finalParts[finalParts.length - 1];
      finalParts.push({ ra, rb, result, fallBefore: fall && previous && previous.rb === fall.k - 1 ? fall : null });
    }
    const stations = finalParts.flatMap((p) => p.result.sampled.points);
    const n = stations.length, fin = {
      x: new Float64Array(n),
      z: new Float64Array(n),
      fx: new Float64Array(n),
      fz: new Float64Array(n),
      s: new Float64Array(n),
      level: new Float64Array(n),
      width: new Float64Array(n),
      depth: new Float64Array(n),
      bank: new Float64Array(n),
      area: new Float64Array(n),
      floor: new Float64Array(n),
      curvature: new Float64Array(n),
      falls: []
    };
    let q = 0;
    for (const part of finalParts) {
      const first = q;
      for (const p of part.result.sampled.points) {
        fin.x[q] = p.x;
        fin.z[q] = p.z;
        fin.fx[q] = p.fx;
        fin.fz[q] = p.fz;
        fin.level[q] = p.level;
        fin.width[q] = Math.max(0.3, (p.halfWidth - margin) * 2);
        fin.depth[q] = p.depth;
        fin.bank[q] = Math.max(0, (p.bankWidth - 1.4) / 2.5);
        fin.area[q] = interpolate(r.area, p.source);
        fin.floor[q] = interpolate(r.floor, p.source);
        fin.s[q] = q ? fin.s[q - 1] + Math.hypot(fin.x[q] - fin.x[q - 1], fin.z[q] - fin.z[q - 1]) : r.s[start];
        q++;
      }
      part.first = first;
      part.last = q - 1;
      if (part.fallBefore && first > 0) {
        const lip = first - 1, base = first, dx = fin.x[base] - fin.x[lip], dz = fin.z[base] - fin.z[lip], l = Math.hypot(dx, dz) || 1;
        fin.falls.push({ k: base, top: fin.level[lip], bottom: fin.level[base], drop: fin.level[lip] - fin.level[base] });
        waterfalls.push({
          id: `river:${r.id}:fall:${fin.falls.length - 1}`,
          riverId: r.id,
          k: base,
          lip: { x: fin.x[lip], y: fin.level[lip], z: fin.z[lip] },
          base: { x: fin.x[base], y: fin.level[base], z: fin.z[base] },
          flow: { x: dx / l, z: dz / l },
          width: fin.width[lip],
          drop: fin.level[lip] - fin.level[base],
          runIndex: runs.length + finalParts.indexOf(part)
        });
      }
    }
    for (let k = 0; k < n; k++) {
      const a2 = Math.max(0, k - 2), b2 = Math.min(n - 1, k + 2);
      if (b2 - a2 < 2) continue;
      const ax = fin.x[k] - fin.x[a2], az = fin.z[k] - fin.z[a2], bx = fin.x[b2] - fin.x[k], bz = fin.z[b2] - fin.z[k];
      const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
      fin.curvature[k] = (ax * bz - az * bx) / (la * lb) / ((la + lb) * 0.5);
    }
    const smoothK = Float64Array.from(fin.curvature);
    for (let k = 0; k < n; k++) {
      let sum = 0, c = 0;
      for (let j = Math.max(0, k - 3); j <= Math.min(n - 1, k + 3); j++) {
        sum += fin.curvature[j];
        c++;
      }
      smoothK[k] = sum / c;
    }
    fin.curvature.set(smoothK);
    r.final = fin;
    for (const part of finalParts) runs.push({
      id: `river:${r.id}:run:${runs.filter((v) => v.riverId === r.id).length}`,
      riverId: r.id,
      first: part.first,
      last: part.last,
      controls: part.result.controls,
      stations: part.result.sampled.points,
      proof: part.result.sampled.proof,
      render: part.result.sampled.render,
      bounds: part.result.sampled.bounds,
      waterBounds: part.result.sampled.waterBounds,
      rise: part.result.rise,
      fallBefore: part.fallBefore ? waterfalls.find((w) => w.riverId === r.id && w.k === part.first)?.id ?? null : null,
      terminal: part === finalParts[finalParts.length - 1] ? r.terminal : null,
      sourceKind: part === finalParts[0] ? r.source.kind : "waterfall"
    });
  }
  const out = rivers.filter((r) => r.final && r.final.x.length >= 2).map((r) => ({
    id: r.id,
    parent: r.parent,
    terminal: r.terminal,
    source: r.source,
    length: r.final.s[r.final.s.length - 1],
    ...r.final
  }));
  return { rivers: out, runs, waterfalls, seaLevel, lakes };
}

// worldgen/lake-shapes.js
var STEP = 2;
var REACH = 6.5;
var OUTLET_REACH = 2.5;
var OUTLET_ZONE = 26;
var MAX_VERTICES = 200;
var CORE_MARGIN = 0.6;
function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
  return a * 0.5;
}
function douglasPeucker(ring, tolerance) {
  const n = ring.length;
  if (n <= 8) return ring.slice();
  let far = 0, best = -1;
  for (let i = 1; i < n; i++) {
    const ddx = ring[i].x - ring[0].x, ddz = ring[i].z - ring[0].z, d = ddx * ddx + ddz * ddz;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const stack = [[0, far], [far, n]];
  while (stack.length) {
    const [a, b] = stack.pop(), pa = ring[a], pb = ring[b % n], dx = pb.x - pa.x, dz = pb.z - pa.z, l2 = dx * dx + dz * dz;
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const p = ring[i], t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - pa.x) * dx + (p.z - pa.z) * dz) / l2)) : 0;
      const ex = pa.x + dx * t - p.x, ez = pa.z + dz * t - p.z, d = ex * ex + ez * ez;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at >= 0 && worst > tolerance * tolerance) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}
function dilate(ring, distance) {
  const n = ring.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i + n - 1) % n], q = ring[i], r = ring[(i + 1) % n];
    let ax = q.x - p.x, az = q.z - p.z, bx = r.x - q.x, bz = r.z - q.z;
    const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
    const n1x = az / la, n1z = -ax / la, n2x = bz / lb, n2z = -bx / lb;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const scale = distance / Math.max(0.45, mx * n1x + mz * n1z);
    out.push({ x: q.x + mx * scale, z: q.z + mz * scale });
  }
  return out;
}
function lakeOutline(lake, grid) {
  const { nx, cell, x0, z0 } = grid;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const i of lake.nodes) {
    const x = x0 + i % nx * cell, z = z0 + Math.floor(i / nx) * cell;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (!Number.isFinite(minX)) return null;
  const pad = REACH + 2 * STEP, ox = minX - pad, oz = minZ - pad, W = Math.ceil((maxX - minX + 2 * pad) / STEP) + 1, H = Math.ceil((maxZ - minZ + 2 * pad) / STEP) + 1;
  const mask = new Uint8Array(W * H), r = Math.ceil(REACH / STEP) + 1;
  const outlet = lake.outlet, core = cell / 2 + CORE_MARGIN;
  for (const i of lake.nodes) {
    const x = x0 + i % nx * cell, z = z0 + Math.floor(i / nx) * cell, cx = (x - ox) / STEP, cz = (z - oz) / STEP;
    const reach = outlet && Math.hypot(x - outlet.x, z - outlet.z) < OUTLET_ZONE ? OUTLET_REACH : REACH;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const gx = Math.round(cx) + dx, gz = Math.round(cz) + dz;
      if (gx < 1 || gz < 1 || gx >= W - 1 || gz >= H - 1) continue;
      const px = ox + gx * STEP, pz = oz + gz * STEP;
      if (Math.max(Math.abs(px - x), Math.abs(pz - z)) <= core || Math.hypot(px - x, pz - z) <= reach) mask[gz * W + gx] = 1;
    }
  }
  const next = /* @__PURE__ */ new Map(), key = (a, b) => a * 65536 + b;
  for (let gz = 0; gz < H; gz++) for (let gx = 0; gx < W; gx++) {
    if (!mask[gz * W + gx]) continue;
    const c = [[2 * gx - 1, 2 * gz - 1], [2 * gx + 1, 2 * gz - 1], [2 * gx + 1, 2 * gz + 1], [2 * gx - 1, 2 * gz + 1]];
    const out = [gz > 0 ? !mask[(gz - 1) * W + gx] : true, gx < W - 1 ? !mask[gz * W + gx + 1] : true, gz < H - 1 ? !mask[(gz + 1) * W + gx] : true, gx > 0 ? !mask[gz * W + gx - 1] : true];
    for (let e = 0; e < 4; e++) if (out[e]) {
      const a = c[e], b = c[(e + 1) % 4];
      next.set(key(a[0] + 2, a[1] + 2), [b[0] + 2, b[1] + 2]);
    }
  }
  let loop = [];
  const used = /* @__PURE__ */ new Set();
  for (const k0 of next.keys()) {
    if (used.has(k0)) continue;
    const current = [];
    let k = k0, guard = 0;
    while (!used.has(k) && next.has(k) && guard++ < 1e6) {
      used.add(k);
      current.push([Math.floor(k / 65536), k % 65536]);
      const b = next.get(k);
      k = key(b[0], b[1]);
    }
    if (current.length > loop.length) loop = current;
  }
  if (loop.length < 4) return null;
  let ring = loop.map(([a, b]) => ({ x: ox + (a - 2) * STEP / 2, z: oz + (b - 2) * STEP / 2 }));
  if (signedArea(ring) < 0) ring.reverse();
  const smooth5 = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    smooth5.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
  }
  let tolerance = 0.4, simple = douglasPeucker(smooth5, tolerance);
  while (simple.length > MAX_VERTICES && tolerance < 6) {
    tolerance *= 1.25;
    simple = douglasPeucker(smooth5, tolerance);
  }
  while (simple.length > MAX_VERTICES) simple = simple.filter((_, i) => i % 2 === 0);
  if (signedArea(simple) < 0) simple.reverse();
  return { polygon: dilate(simple, Math.min(1.5, tolerance * 0.5 + 0.25)), tolerance };
}
function buildLakeShapes(data) {
  const { grid, height } = data, lakes = [];
  for (const lake of data.lakes) {
    const outline = lakeOutline(lake, grid);
    if (!outline) continue;
    let deepest = Infinity, sx = 0, sz = 0;
    for (const i of lake.nodes) {
      deepest = Math.min(deepest, height[i]);
      sx += grid.x0 + i % grid.nx * grid.cell;
      sz += grid.z0 + Math.floor(i / grid.nx) * grid.cell;
    }
    const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of outline.polygon) {
      bounds.minX = Math.min(bounds.minX, p.x);
      bounds.maxX = Math.max(bounds.maxX, p.x);
      bounds.minZ = Math.min(bounds.minZ, p.z);
      bounds.maxZ = Math.max(bounds.maxZ, p.z);
    }
    lakes.push({
      id: lake.id,
      lakeKind: lake.kind,
      level: lake.level,
      depth: Math.max(0.5, lake.level - deepest),
      area: lake.area,
      center: { x: sx / lake.nodes.length, z: sz / lake.nodes.length },
      outlet: lake.outlet,
      polygon: outline.polygon,
      bounds,
      tolerance: outline.tolerance
    });
  }
  return lakes;
}

// worldgen/geography.js
function ellipseAround(points, pad, minorRadius) {
  let cx = 0, cz = 0;
  for (const p of points) {
    cx += p.x;
    cz += p.z;
  }
  cx /= points.length;
  cz /= points.length;
  const a = points[0], b = points[points.length - 1], dx = b.x - a.x, dz = b.z - a.z, len = dhypot(dx, dz) || 1;
  return { center: { x: cx, z: cz }, radiusX: len * 0.5 + pad, radiusZ: minorRadius, yaw: datan2(dz, dx) };
}
function findFens(data, avoid) {
  const { grid: { nx, nz, cell, x0, z0 }, height, fixed, area, coastDistance, lakeId } = data, n = nx * nz;
  const slopeAt = (i) => {
    const gx = (height[i + 1] - height[i - 1]) / (2 * cell), gz = (height[i + nx] - height[i - nx]) / (2 * cell);
    return dhypot(gx, gz);
  };
  const scores = [];
  for (let iz = 3; iz < nz - 3; iz += 2) for (let ix = 3; ix < nx - 3; ix += 2) {
    const i = iz * nx + ix;
    if (fixed[i] || lakeId[i] >= 0 || height[i] > 45 || coastDistance[i] < 110 || coastDistance[i] > 1100) continue;
    const x = x0 + ix * cell, z = z0 + iz * cell;
    if (dhypot(x - START.spawn.x, z - START.spawn.z) < 380 || avoid.some((e) => dhypot(x - e.x, z - e.z) < e.r)) continue;
    let flat = 0, wet = 0, count = 0;
    for (let dz = -6; dz <= 6; dz += 3) for (let dx = -6; dx <= 6; dx += 3) {
      const j = (iz + dz) * nx + ix + dx;
      if (fixed[j]) continue;
      count++;
      if (slopeAt(j) < 0.03) flat++;
      wet = Math.max(wet, area[j]);
    }
    if (count < 20 || flat < count * 0.7 || wet < 25e4) continue;
    scores.push({ x, z, i, score: flat / count + 0.25 * smoothstep(25e4, 2e6, wet) - height[i] / 200 });
  }
  scores.sort((a, b) => b.score - a.score || a.i - b.i);
  const fens = [];
  for (const c of scores) {
    if (fens.length >= 2) break;
    if (fens.some((f2) => dhypot(c.x - f2.center.x, c.z - f2.center.z) < 700)) continue;
    let sxx = 0, szz = 0, sxz = 0, mx = 0, mz = 0, hsum = 0, k = 0;
    const cix = Math.round((c.x - x0) / cell), ciz = Math.round((c.z - z0) / cell);
    for (let dz = -28; dz <= 28; dz += 2) for (let dx = -28; dx <= 28; dx += 2) {
      const ix = cix + dx, iz = ciz + dz;
      if (ix < 2 || iz < 2 || ix >= nx - 2 || iz >= nz - 2) continue;
      const j = iz * nx + ix;
      if (fixed[j] || lakeId[j] >= 0 || slopeAt(j) > 0.035 || Math.abs(height[j] - height[c.i]) > 6) continue;
      const px = dx * cell, pz = dz * cell;
      mx += px;
      mz += pz;
      sxx += px * px;
      szz += pz * pz;
      sxz += px * pz;
      hsum += height[j];
      k++;
    }
    if (k < 30) continue;
    mx /= k;
    mz /= k;
    sxx = sxx / k - mx * mx;
    szz = szz / k - mz * mz;
    sxz = sxz / k - mx * mz;
    const yaw = 0.5 * datan2(2 * sxz, sxx - szz), tr = sxx + szz, det = sxx * szz - sxz * sxz, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const major = Math.sqrt(Math.max(1, tr / 2 + disc)), minor = Math.sqrt(Math.max(1, tr / 2 - disc));
    const radiusX = Math.max(130, Math.min(300, major * 1.6)), radiusZ = Math.max(100, Math.min(220, minor * 1.6));
    fens.push({ center: { x: c.x + mx, z: c.z + mz }, radiusX, radiusZ, yaw, level: hsum / k });
  }
  return fens;
}
function deriveGeography(data) {
  const { layout, height, fixed } = data, lands = [];
  for (let i = 0; i < height.length; i += 3) if (!fixed[i]) lands.push(height[i]);
  lands.sort((a, b) => a - b);
  const q = (p) => lands[Math.min(lands.length - 1, Math.floor(lands.length * p))];
  const snowLine = Math.max(300, Math.min(380, q(0.99) - 30));
  const mountains = layout.ranges.map((g, k) => ({ id: k ? "range-" + k : "main-range", ...ellipseAround(g.nodes, g.width * 0.55, g.width * 0.95) }));
  const v = layout.volcano;
  mountains.push({ id: "volcano", center: { x: v.x, z: v.z }, radiusX: v.radius * 1.05, radiusZ: v.radius * 1.05, yaw: 0 });
  const main = mountains[0];
  const ashland = { id: "ashen-basin", center: { x: v.x, z: v.z }, radiusX: v.radius * 1.15, radiusZ: v.radius * 1, yaw: datan2(layout.flow.z, layout.flow.x) };
  const avoid = [{ x: v.x, z: v.z, r: v.radius * 1.3 }, ...layout.ranges.flatMap((g) => g.nodes.map((p) => ({ x: p.x, z: p.z, r: g.width * 0.9 })))];
  let fens = Array.isArray(data.swamps) ? data.swamps.map((m) => ({ center: { x: m.x, z: m.z }, radiusX: m.radiusX, radiusZ: m.radiusZ, yaw: m.yaw, level: m.level, swampId: m.id, name: m.name })) : findFens(data, avoid);
  while (fens.length < 2) fens.push({ center: { x: 9e3 + fens.length * 2e3, z: 9e3 }, radiusX: 40, radiusZ: 40, yaw: 0, level: 0, placeholder: true });
  return { seed: data.seed, snowLine, peak: lands[lands.length - 1], mountains, mainMountain: main, ashland, fens: fens.map((f2, k) => ({ id: k ? "southern-reedfen" : "elderfen", ...f2 })) };
}

// worldgen/terrain-sampler.js
var INDEX_CELL = 24;
var LIP_BANK = Object.freeze({ length: 14, fade: 6, edge: -0.1, widen: 0.1, top: 0.3, rise: Object.freeze([0.9, 1.8]), out: 0.5, slope: 0.3, round: 3, reach: Object.freeze([6, 12]), soft: 0.15, plane: Object.freeze([-0.15, 0.1]) });
var RIVER_HOLD = Object.freeze({ tests: Object.freeze([Object.freeze([0, 0.12]), Object.freeze([0.4, 0.12]), Object.freeze([-0.3, 0])]), gap: 0.02, max: 1, band: Object.freeze([-1, 1.3]), inward: 1.2, reach: 0.9, fade: Object.freeze([0.22, 2.5, 9]), ends: 2, spread: 2, end: 12, pool: 20, junction: 8, cell: 16, lattice: 4 / 3 });
var STREAK_DIRS = [1, 0, 0.7071067811865476, 0.7071067811865476, 0, 1, -0.7071067811865476, 0.7071067811865476];
function softRamp(e, flood, soft, side = 0.68) {
  if (e <= 0) return 0;
  const a = Math.max(0, flood - soft), span = flood + soft - a, x = e - a;
  return 0.02 * e + (x <= 0 ? 0 : x >= span ? side * (x - span * 0.5) : side * x * x / (2 * span));
}
function shoulder(e, start, soft) {
  const x = e - start;
  return x <= 0 ? 0 : x >= soft ? x - soft * 0.5 : x * x / (2 * soft);
}
function segmentDist(r, k, x, z) {
  const ax = r.x[k], az = r.z[k], vx = r.x[k + 1] - ax, vz = r.z[k + 1] - az, len2 = vx * vx + vz * vz;
  let t = len2 > 0 ? ((x - ax) * vx + (z - az) * vz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + vx * t - x, pz = az + vz * t - z;
  return Math.sqrt(px * px + pz * pz);
}
function smin(a, b, k) {
  const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k));
  return b + (a - b) * h - k * h * (1 - h);
}
function smax(a, b, k) {
  return -smin(-a, -b, k);
}
function cubic(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}
function bicubicSampler(field, grid) {
  const { cell, x0, z0, nx, nz } = grid;
  return (x, z) => {
    let fx = (x - x0) / cell, fz = (z - z0) / cell;
    fx = clamp(fx, 1, nx - 2.000001);
    fz = clamp(fz, 1, nz - 2.000001);
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
    let r0 = 0, r1 = 0, r2 = 0, r3 = 0;
    for (let k = -1; k <= 2; k++) {
      const row = (iz + k) * nx + ix;
      const val = cubic(field[row - 1], field[row], field[row + 1], field[row + 2], u);
      if (k === -1) r0 = val;
      else if (k === 0) r1 = val;
      else if (k === 1) r2 = val;
      else r3 = val;
    }
    return cubic(r0, r1, r2, r3, v);
  };
}
function bilinear(field, grid, x, z) {
  const { cell, x0, z0, nx, nz } = grid;
  let fx = clamp((x - x0) / cell, 0, nx - 1.000001), fz = clamp((z - z0) / cell, 0, nz - 1.000001);
  const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, i = iz * nx + ix;
  const a = field[i] + (field[i + 1] - field[i]) * u, b = field[i + nx] + (field[i + nx + 1] - field[i + nx]) * u;
  return a + (b - a) * v;
}
function smoothStations(a, radius) {
  const m = a.length, out = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    let sum = 0, wsum = 0;
    for (let j = Math.max(0, k - radius); j <= Math.min(m - 1, k + radius); j++) {
      const w = radius + 1 - Math.abs(j - k);
      sum += a[j] * w;
      wsum += w;
    }
    out[k] = sum / wsum;
  }
  return out;
}
function prepareRiver(r) {
  const m = r.x.length;
  r.corridor = new Float64Array(m);
  r.flood = new Float64Array(m);
  r.side = new Float64Array(m);
  r.nx = new Float64Array(m);
  r.nz = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    const b = Math.min(m - 1, k + 1), a = Math.max(0, k - 1), tx = r.x[b] - r.x[a], tz = r.z[b] - r.z[a], l = dhypot(tx, tz) || 1;
    r.nx[k] = -tz / l;
    r.nz[k] = tx / l;
    const k0 = Math.max(0, k - 8), k1 = Math.min(m - 1, k + 8), grad = (r.level[k0] - r.level[k1]) / Math.max(1, r.s[k1] - r.s[k0]);
    const gentle = 1 - smoothstep(6e-3, 0.05, grad), w = r.width[k];
    const vary = 0.65 + 0.7 * (gnoise(r.seed, r.s[k] / 170, r.id * 2.7, 1203) * 0.5 + 0.5);
    r.flood[k] = gentle * (1.5 + (3 + 1.3 * w) * vary);
    r.side[k] = 0.68 + 0.8 * smoothstep(0.02, 0.09, grad);
  }
  r.flood = smoothStations(r.flood, 6);
  r.side = smoothStations(r.side, 6);
  r.bankS = smoothStations(r.bank, 4);
  r.kappaS = smoothStations(r.curvature, 3);
  for (let k = 0; k < m; k++) r.corridor[k] = r.width[k] * 0.5 + r.flood[k] + 1.4 + 2.5 * r.bankS[k] + 18;
}
function createTerrainSampler(model, hydro, rivers) {
  const { grid, layout } = model, seed = layout.seed, sea = ISLAND_FRAME.seaLevel;
  const macro = bicubicSampler(model.height, grid);
  const { nx, nz, cell } = grid, n = nx * nz, rough = new Float64Array(n), lakeMask = new Float64Array(n), lakeLevel = new Float64Array(n);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix;
    if (model.fixed[i]) {
      rough[i] = 0.25;
      continue;
    }
    const h = model.height[i], hx = model.height[Math.min(nx - 1, ix + 1) + iz * nx] - model.height[Math.max(0, ix - 1) + iz * nx], hz = model.height[ix + Math.min(nz - 1, iz + 1) * nx] - model.height[ix + Math.max(0, iz - 1) * nx];
    const slope = dhypot(hx, hz) / (2 * cell);
    rough[i] = clamp(0.35 + 3.2 * slope + h / 160, 0.3, 5);
  }
  for (let i = 0; i < n; i++) {
    const id = hydro.lakeId[i];
    if (id >= 0) {
      lakeMask[i] = 1;
      lakeLevel[i] = hydro.lakes[id].level;
    }
  }
  const swampList = model.swamps || [], marshD = new Float32Array(n).fill(-127), marshLevel = new Float32Array(n);
  if (model.swampDistance) for (let i = 0; i < n; i++) {
    const k = model.swampIndex[i];
    if (!k) continue;
    marshD[i] = model.swampDistance[i];
    marshLevel[i] = swampList[k - 1]?.level ?? 0;
  }
  const marshOutline = SWAMP.outline;
  const gradX = new Float64Array(n), gradZ = new Float64Array(n);
  for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
    const i = iz * nx + ix;
    gradX[i] = (model.height[i + 1] - model.height[i - 1]) / (2 * cell);
    gradZ[i] = (model.height[i + nx] - model.height[i - nx]) / (2 * cell);
  }
  for (let pass = 0; pass < 3; pass++) {
    const previous = lakeLevel.slice();
    for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
      const i = iz * nx + ix;
      if (previous[i]) continue;
      const level = Math.max(previous[i - 1], previous[i + 1], previous[i - nx], previous[i + nx]);
      if (level) lakeLevel[i] = level;
    }
  }
  const coast = model.coast, coastBand = new Uint8Array(n), coastRock = new Float32Array(n), coastPebble = new Float32Array(n), coastDune = new Float32Array(n);
  const coastMud = new Float32Array(n), coastCliff = new Float32Array(n), coastTop = coast ? coast.top : new Float32Array(n), coastShore = coast ? coast.shore : new Float32Array(n);
  if (coast) {
    for (let i = 0; i < n; i++) {
      const w = coast.weights;
      coastRock[i] = w[i * 4] / 255;
      coastPebble[i] = w[i * 4 + 1] / 255;
      coastDune[i] = w[i * 4 + 2] / 255;
      coastMud[i] = w[i * 4 + 3] / 255;
      coastCliff[i] = coast.cliff[i] / 255;
    }
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      if (!(coastRock[i] + coastPebble[i] + coastDune[i] + coastMud[i] + coastCliff[i] > 0)) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx, jz = iz + dz;
        if (jx >= 0 && jz >= 0 && jx < nx && jz < nz) coastBand[jz * nx + jx] = 1;
      }
    }
  }
  const STACK_CELL = 64, STACK_REACH = 2.1, stackBuckets = /* @__PURE__ */ new Map(), stacks = coast?.stacks ?? new Float64Array(0);
  for (let k = 0; k < stacks.length; k += 5) {
    const reach = stacks[k + 2] * STACK_REACH + 8;
    for (let bz = Math.floor((stacks[k + 1] - reach) / STACK_CELL); bz <= Math.floor((stacks[k + 1] + reach) / STACK_CELL); bz++)
      for (let bx = Math.floor((stacks[k] - reach) / STACK_CELL); bx <= Math.floor((stacks[k] + reach) / STACK_CELL); bx++) {
        const key = bx * 65536 + bz;
        let list = stackBuckets.get(key);
        if (!list) stackBuckets.set(key, list = []);
        list.push(k);
      }
  }
  const ix0 = grid.x0, iz0 = grid.z0, inx = Math.ceil(grid.nx * cell / INDEX_CELL) + 1, inz = Math.ceil(grid.nz * cell / INDEX_CELL) + 1;
  const buckets = /* @__PURE__ */ new Map();
  for (const r of rivers) {
    r.seed = seed;
    prepareRiver(r);
    for (let k = 0; k + 1 < r.x.length; k++) {
      const reach = Math.max(r.corridor[k], r.corridor[k + 1]) + 2;
      const minX = Math.min(r.x[k], r.x[k + 1]) - reach, maxX = Math.max(r.x[k], r.x[k + 1]) + reach;
      const minZ = Math.min(r.z[k], r.z[k + 1]) - reach, maxZ = Math.max(r.z[k], r.z[k + 1]) + reach;
      for (let bz = Math.floor((minZ - iz0) / INDEX_CELL); bz <= Math.floor((maxZ - iz0) / INDEX_CELL); bz++)
        for (let bx = Math.floor((minX - ix0) / INDEX_CELL); bx <= Math.floor((maxX - ix0) / INDEX_CELL); bx++) {
          if (bx < 0 || bz < 0 || bx >= inx || bz >= inz) continue;
          const key = bz * inx + bx;
          let list = buckets.get(key);
          if (!list) buckets.set(key, list = []);
          list.push(r, k);
        }
    }
  }
  const camp = START.spawn;
  const campHeight = macro(camp.x, camp.z);
  for (const r of rivers) {
    const m = r.x.length;
    r.bendS = new Float64Array(m);
    r.outer = new Float64Array(m);
    r.dt = new Float64Array(m);
    for (let k = 0; k < m; k++) {
      const w = r.width[k], bend = clamp01(Math.abs(r.curvature[k]) * w * 2.6);
      const riffle = 0.5 + 0.5 * gnoise(seed, r.s[k] / (w * 3.2 + 8), r.id * 1.31, 1201);
      r.bendS[k] = bend;
      r.outer[k] = r.curvature[k] > 0 ? -1 : 1;
      r.dt[k] = r.depth[k] * (1 + 0.5 * bend) * (1 - 0.3 * (1 - bend) * riffle);
    }
    r.fallSeg = new Uint8Array(m);
    r.fallSegs = [];
    for (const f2 of r.falls || []) {
      if (!(f2.k >= 1 && f2.k < m)) continue;
      r.fallSeg[f2.k - 1] = 1;
      const fs = f2.k - 1, dx = r.x[f2.k] - r.x[fs], dz = r.z[f2.k] - r.z[fs], run = Math.hypot(dx, dz) || 1;
      r.fallSegs.push({ fs, x: r.x[fs], z: r.z[fs], ux: dx / run, uz: dz / run, run, half: Math.max(0.8, 0.92 * r.width[fs]) / 2 });
      const pool = Math.min(3, 0.12 * Math.max(0, f2.drop));
      for (let j = 0; j < 3 && f2.k + j < m; j++) r.dt[f2.k + j] += pool * [1, 0.55, 0.2][j];
    }
  }
  let scratchD = new Float64Array(256), scratchT = new Float64Array(256), scratchU = new Float64Array(256);
  const foot = { k: 0, t: 0, dist: 0, sign: 1 };
  let footBest = Infinity;
  function footRoot(j, tt, wx, wz, vx, vz, n0x, n0z, dnx, dnz) {
    if (!(tt >= 0 && tt <= 1)) return;
    const ex = wx - vx * tt, ez = wz - vz * tt, dd = Math.sqrt(ex * ex + ez * ez);
    if (dd < footBest) {
      footBest = dd;
      foot.k = j;
      foot.t = tt;
      foot.dist = dd;
      foot.sign = ex * (n0x + dnx * tt) + ez * (n0z + dnz * tt) >= 0 ? 1 : -1;
    }
  }
  function smoothFoot(r, k, x, z) {
    const m1 = r.x.length - 1;
    footBest = Infinity;
    for (let j = Math.max(0, k - 1); j <= Math.min(m1 - 1, k + 1); j++) {
      const ax = r.x[j], az = r.z[j], vx = r.x[j + 1] - ax, vz = r.z[j + 1] - az, n0x = r.nx[j], n0z = r.nz[j], dnx = r.nx[j + 1] - n0x, dnz = r.nz[j + 1] - n0z;
      const wx = x - ax, wz = z - az;
      const A = -(vx * dnz - vz * dnx), B = wx * dnz - wz * dnx - (vx * n0z - vz * n0x), C = wx * n0z - wz * n0x;
      if (Math.abs(A) < 1e-12) {
        if (Math.abs(B) > 1e-12) footRoot(j, -C / B, wx, wz, vx, vz, n0x, n0z, dnx, dnz);
      } else {
        const disc = B * B - 4 * A * C;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          footRoot(j, (-B - sq) / (2 * A), wx, wz, vx, vz, n0x, n0z, dnx, dnz);
          footRoot(j, (-B + sq) / (2 * A), wx, wz, vx, vz, n0x, n0z, dnx, dnz);
        }
      }
    }
    return footBest < Infinity;
  }
  function groundLevel(r, k, t) {
    const L = r.level, k1 = k + 1;
    if (r.fallSeg[k]) return L[k] + (L[k1] - L[k]) * smoothstep(0, 0.4, t);
    const k0 = k > 0 ? k - 1 : k, k2 = k1 < L.length - 1 ? k1 + 1 : k1;
    if (r.fallSeg[k0] || r.fallSeg[k1]) return L[k] + (L[k1] - L[k]) * t;
    return cubic(L[k0], L[k], L[k1], L[k2], t);
  }
  const sectionOut = { upper: 0, lower: 0 };
  function profile(L, w, bank, Dt, flood, side, kappa, bend, dist, lat) {
    const outer = kappa > 0 ? -1 : 1;
    const shift = bend * 0.27 * w, halfOut = w * 0.5 * (1 + 0.08 * bend), halfIn = w * 0.5 * (1 - 0.45 * bend);
    const rel = lat - outer * shift, outerSide = rel * outer >= 0;
    const span = outerSide ? Math.max(0.3, halfOut - shift) : halfIn + shift, q = Math.abs(rel) / span;
    const bank0 = 1.4 + 2.5 * bank;
    let upper, lower = -Infinity;
    if (q <= 1) {
      const quad = 1 - q * q, quart = 1 - q * q * q * q;
      upper = L - Dt * (outerSide ? quad + (quart - quad) * bend : quad);
    } else {
      const beyond = Math.abs(rel) - span;
      const barReach = Math.min(bank / 0.05, 0.6 / Math.max(Math.abs(kappa), 1e-4));
      const reach = outerSide ? bank0 + (1.8 + 1.2 * bank - bank0) * bend : bank0 + (Math.max(bank0, barReach) - bank0) * bend;
      upper = L + bank * smoothstep(0, reach, beyond) + softRamp(dist - w * 0.5 - bank0, flood, 4, side);
      lower = L + 0.12 - 0.6 * shoulder(beyond, 1.5, 2.5);
    }
    sectionOut.upper = upper;
    sectionOut.lower = lower;
    return sectionOut;
  }
  function lipSupport(r, kn, tn, x, z) {
    const falls = r.fallSegs;
    if (!falls || !falls.length) return 0;
    let support = 0;
    for (let i = 0; i < falls.length; i++) {
      const f2 = falls[i];
      if (kn > f2.fs) continue;
      const ds = kn === f2.fs ? 0 : Math.max(0, r.s[f2.fs] - (r.s[kn] + (r.s[kn + 1] - r.s[kn]) * tn)), past = ((x - f2.x) * f2.ux + (z - f2.z) * f2.uz) / f2.run;
      support = Math.max(support, (1 - smoothstep(10, 18, ds)) * (1 - smoothstep(-0.05, 0.08, past)));
    }
    return support;
  }
  const lipB = new Float64Array(8), lipW = new Float64Array(8);
  let lipN = 0;
  function lipBanks(r, s, water, w, dist, x, z) {
    const B = LIP_BANK;
    for (let i = 0; i < r.fallSegs.length && lipN < lipB.length; i++) {
      const f2 = r.fallSegs[i], ds = r.s[f2.fs] - s;
      if (ds >= B.length + B.fade || ds < -f2.run) continue;
      const along = (x - f2.x) * f2.ux + (z - f2.z) * f2.uz, plane = 1 - smoothstep(B.plane[0], B.plane[1], along);
      if (plane <= 0) continue;
      const d = Math.max(0, ds), along01 = smoothstep(0, B.length, d), edge = f2.half + B.edge, hw = edge + (w * 0.5 + B.widen - edge) * along01;
      const e = dist - hw, outer = w * 0.5 + RIVER_FINISH.ribbonMargin + B.out - hw, rise = B.rise[0] + (B.rise[1] - B.rise[0]) * along01;
      let p;
      if (e <= 0) p = 2 * B.top / rise * e;
      else if (e < rise) {
        const u = 1 - e / rise;
        p = B.top * (1 - u * u);
      } else p = B.top - B.slope * shoulder(e, Math.max(rise, outer), B.round);
      const weight = (1 - smoothstep(B.length, B.length + B.fade, d)) * plane * (1 - smoothstep(outer + B.reach[0], outer + B.reach[1], e));
      if (weight <= 0) continue;
      lipB[lipN] = water + p;
      lipW[lipN] = weight;
      lipN++;
    }
  }
  function riverCarve(x, z, natural, out) {
    const key = Math.floor((z - iz0) / INDEX_CELL) * inx + Math.floor((x - ix0) / INDEX_CELL), list = buckets.get(key);
    out.weight = 0;
    out.height = natural;
    out.wet = 0;
    out.floodplain = 0;
    out.level = null;
    out.river = -1;
    out.edge = Infinity;
    out.half = 0;
    lipN = 0;
    if (!list) return out;
    const count = list.length >> 1;
    if (count > scratchD.length) {
      scratchD = new Float64Array(count * 2);
      scratchT = new Float64Array(count * 2);
      scratchU = new Float64Array(count * 2);
    }
    for (let q = 0, e = 0; q < list.length; q += 2, e++) {
      const r = list[q], k = list[q + 1], ax = r.x[k], az = r.z[k], vx = r.x[k + 1] - ax, vz = r.z[k + 1] - az, len2 = vx * vx + vz * vz;
      const u = len2 > 0 ? ((x - ax) * vx + (z - az) * vz) / len2 : 0, t = u < 0 ? 0 : u > 1 ? 1 : u;
      const px = ax + vx * t - x, pz = az + vz * t - z;
      scratchD[e] = Math.sqrt(px * px + pz * pz);
      scratchT[e] = t;
      scratchU[e] = u;
    }
    let cut = Infinity, fill = -Infinity;
    for (let e0 = 0; e0 < count; ) {
      const r = list[e0 * 2];
      let e1 = e0 + 1, ne = e0;
      for (; e1 < count && list[e1 * 2] === r; e1++) if (scratchD[e1] < scratchD[ne]) ne = e1;
      const dmin = scratchD[ne], kn = list[ne * 2 + 1], tn = scratchT[ne];
      if (dmin < Math.max(r.corridor[kn], r.corridor[kn + 1])) {
        let k = kn, t = tn, dist = dmin, sign;
        if (smoothFoot(r, kn, x, z)) {
          k = foot.k;
          t = foot.t;
          dist = foot.dist;
          sign = foot.sign;
        } else {
          const k12 = kn + 1, px = r.x[kn] + (r.x[k12] - r.x[kn]) * tn - x, pz = r.z[kn] + (r.z[k12] - r.z[kn]) * tn - z;
          sign = -(px * (r.nx[kn] + (r.nx[k12] - r.nx[kn]) * tn) + pz * (r.nz[kn] + (r.nz[k12] - r.nz[kn]) * tn)) >= 0 ? 1 : -1;
        }
        const k1 = k + 1;
        const water = r.level[k] + (r.level[k1] - r.level[k]) * (r.fallSeg[k] ? smoothstep(0, 0.4, t) : t);
        let L = groundLevel(r, k, t), w = r.width[k] + (r.width[k1] - r.width[k]) * t;
        let bank = r.bankS[k] + (r.bankS[k1] - r.bankS[k]) * t, flood = r.flood[k] + (r.flood[k1] - r.flood[k]) * t, side = r.side[k] + (r.side[k1] - r.side[k]) * t;
        const Dt = r.dt[k] + (r.dt[k1] - r.dt[k]) * t, s = r.s[k] + (r.s[k1] - r.s[k]) * t, corridor = r.corridor[k] + (r.corridor[k1] - r.corridor[k]) * t;
        const kappa = r.kappaS[k] + (r.kappaS[k1] - r.kappaS[k]) * t;
        if (r.fallSegs.length) lipBanks(r, s, water, w, dist, x, z);
        if (dist < w * 0.5 + 3 && (out.level === null || water < out.level)) {
          out.level = water;
          out.river = r.id;
        }
        if (dist - w * 0.5 < out.edge) {
          out.edge = dist - w * 0.5;
          out.half = w * 0.5;
        }
        const wet = 1 - smoothstep(w * 0.5, w * 0.5 + 4, dist);
        if (wet > out.wet) out.wet = wet;
        const endCap = t === 0 && k === 0 || t === 1 && k1 === r.x.length - 1;
        const far = smoothstep(w * 0.5 + 1, w * 0.5 + 6.4 + 2.5 * bank, dist);
        const bend = endCap ? 0 : clamp01(Math.abs(kappa) * w * 2.6) * (1 - far);
        if (far > 0) {
          let sw = 0, aL = 0, aW = 0, aB = 0, aF = 0, aS = 0;
          for (let e = e0; e < e1; e++) {
            const de = scratchD[e] - dmin;
            if (de > 28) continue;
            const j = list[e * 2 + 1], j1 = j + 1, reachJ = Math.max(r.corridor[j], r.corridor[j1]) + 2;
            const wt = Math.exp(-de / 4) * (1 - smoothstep(reachJ - 8, reachJ - 1, scratchD[e]));
            if (wt <= 0) continue;
            const u = scratchT[e], Lj = r.level[j] + (r.level[j1] - r.level[j]) * (r.fallSeg[j] ? smoothstep(0, 0.4, u) : scratchU[e]);
            aL += wt * (L + 1.5 * Math.tanh((Lj - L) / 1.5));
            aW += wt * (r.width[j] + (r.width[j1] - r.width[j]) * u);
            aB += wt * (r.bankS[j] + (r.bankS[j1] - r.bankS[j]) * u);
            aF += wt * (r.flood[j] + (r.flood[j1] - r.flood[j]) * u);
            aS += wt * (r.side[j] + (r.side[j1] - r.side[j]) * u);
            sw += wt;
          }
          const g = far / sw;
          L += (aL - L * sw) * g;
          w += (aW - w * sw) * g;
          bank += (aB - bank * sw) * g;
          flood += (aF - flood * sw) * g;
          side += (aS - side * sw) * g;
        }
        const sec = profile(L, w, bank, Dt, flood, side, kappa, bend, dist, sign * dist);
        const keep = (r.source.kind !== "lake" ? smoothstep(0, 40, s) : 1) * (1 - smoothstep(corridor - 12, corridor, dist));
        const up = natural + 30 + (sec.upper - natural - 30) * keep;
        cut = cut === Infinity ? up : smin(cut, up, 0.8);
        const falls = r.fallSegs;
        for (let i = 0; i < falls.length; i++) {
          const fall = falls[i], fs = fall.fs;
          if (fs < k || r.s[fs] - s > 40) continue;
          const s0 = r.s[fs], gate = Math.max(smoothstep(s0, s0 + 0.4 * (r.s[fs + 1] - s0), s), smoothstep(0, 0.15, ((x - fall.x) * fall.ux + (z - fall.z) * fall.uz) / fall.run));
          if (gate <= 0) continue;
          for (let e = e0; e < e1; e++) {
            const j = list[e * 2 + 1];
            if (j <= fs || j > fs + 4) continue;
            const u = scratchT[e], j1 = j + 1, d = scratchD[e], bj = r.bankS[j] + (r.bankS[j1] - r.bankS[j]) * u;
            const below = Math.max(r.level[j] + (r.level[j1] - r.level[j]) * u, r.level[fs + 1]) + bj + softRamp(
              d - (r.width[j] + (r.width[j1] - r.width[j]) * u) * 0.5 - (1.4 + 2.5 * bj),
              r.flood[j] + (r.flood[j1] - r.flood[j]) * u,
              4,
              r.side[j] + (r.side[j1] - r.side[j]) * u
            );
            const fade = gate * keep * (1 - smoothstep(dmin + 8, dmin + 24, d));
            cut = smin(cut, natural + 30 + (below - natural - 30) * fade, 0.8);
          }
        }
        if (sec.lower > -Infinity) {
          if (!r.fallSeg[k]) {
            const lo = natural - 30 + (sec.lower - natural + 30) * keep;
            if (lo > fill) fill = lo;
          }
        } else {
          const ledge = lipSupport(r, k, t, x, z);
          if (ledge > 0) {
            const lo = natural + (sec.upper - natural) * ledge * keep;
            if (lo > fill) fill = lo;
          }
        }
      }
      e0 = e1;
    }
    if (cut < Infinity) {
      const ground = fill > -Infinity ? smax(natural, fill, 0.6) : natural;
      out.height = smin(ground, cut, 1.2 + 1.8 * smoothstep(4, 10, out.edge));
      out.weight = 1;
      for (let i = 0; i < lipN; i++) {
        const raise = lipB[i] - out.height, k = LIP_BANK.soft;
        if (raise > -k) out.height += (raise >= k ? raise : (raise + k) * (raise + k) / (4 * k)) * lipW[i];
      }
    }
    return out;
  }
  const coastState = { rock: 0, pebble: 0, dune: 0, mud: 0, cliff: 0, top: 0, shore: 0 };
  function coastSample(x, z, out, withShore = true) {
    const fx = clamp((x - grid.x0) / cell, 0, nx - 1.000001), fz = clamp((z - grid.z0) / cell, 0, nz - 1.000001), ix = Math.floor(fx), iz = Math.floor(fz), i = iz * nx + ix;
    if (!coastBand[i]) {
      out.rock = out.pebble = out.dune = out.mud = out.cliff = 0;
      out.top = 0;
      out.shore = withShore ? bilinear(coastShore, grid, x, z) : 0;
      return false;
    }
    const u = fx - ix, v = fz - iz, a = (1 - u) * (1 - v), b = u * (1 - v), c = (1 - u) * v, d = u * v, j = i + nx;
    out.rock = coastRock[i] * a + coastRock[i + 1] * b + coastRock[j] * c + coastRock[j + 1] * d;
    out.pebble = coastPebble[i] * a + coastPebble[i + 1] * b + coastPebble[j] * c + coastPebble[j + 1] * d;
    out.dune = coastDune[i] * a + coastDune[i + 1] * b + coastDune[j] * c + coastDune[j + 1] * d;
    out.mud = coastMud[i] * a + coastMud[i + 1] * b + coastMud[j] * c + coastMud[j + 1] * d;
    out.cliff = coastCliff[i] * a + coastCliff[i + 1] * b + coastCliff[j] * c + coastCliff[j + 1] * d;
    out.top = coastTop[i] * a + coastTop[i + 1] * b + coastTop[j] * c + coastTop[j + 1] * d;
    out.shore = coastShore[i] * a + coastShore[i + 1] * b + coastShore[j] * c + coastShore[j + 1] * d;
    return true;
  }
  function coastFine(x, z, base, h, detail) {
    const c = coastState;
    if (!coastSample(x, z, c, false)) return h;
    {
      const above = base - sea;
      if (c.cliff > 0.01 && c.top > 3 && above > -1.6 && above < c.top + 3 && c.shore < 60) {
        const T = c.top, u = above / T + 0.03 * gnoise(seed, x / 9, z / 9, 1401) + 0.012 * gnoise(seed, x / 3.3, z / 3.3, 1402), a = 0.05, b = 0.17;
        if (u < 1.05) {
          let S;
          if (u <= a) S = Math.max(u, -0.1) * 0.3;
          else if (u < b) {
            const t = (u - a) / (b - a);
            S = a * 0.3 + (0.86 - a * 0.3) * t * t * (3 - 2 * t);
          } else S = 0.86 + 0.14 * Math.min(1, (u - b) / (1 - b));
          const face = smoothstep(a - 0.02, a + 0.02, u) * (1 - smoothstep(b - 0.03, b + 0.04, u));
          const ledge = face * 0.9 * (ridged(seed, x / 6, (sea + T * S) / 3.2, 2, 1403) - 0.45);
          const hc = sea + T * S + detail * (0.7 + 0.9 * face) + ledge;
          const k = c.cliff * smoothstep(1.05, 0.95, u) * smoothstep(-1.6, -0.7, above) * smoothstep(3, 5, T) * (1 - smoothstep(30, 60, c.shore));
          h += (hc - h) * k;
        }
      }
      if (c.cliff > 0.01 && above > -1.75 && above < 1.05) {
        const plat = sea - 0.1 + 0.5 * (ridged(seed, x / 7, z / 7, 2, 1441) - 0.45) - 0.5 * smoothstep(0.55, 0.8, gnoise(seed, x / 5, z / 5, 1442) * 0.5 + 0.5);
        h += (plat - h) * c.cliff * (1 - smoothstep(0.5, 1.4, Math.abs(above + 0.35)));
      }
      const rocky = c.rock - c.cliff;
      if (rocky > 0.02) {
        const band = 1 - smoothstep(1.5, 4.5, Math.abs(above - 0.3));
        if (band > 0) h += rocky * band * ((ridged(seed, x / 9, z / 9, 3, 1411) - 0.42) * 3 + gnoise(seed, x / 23, z / 23, 1412) * 0.6);
      }
      if (c.pebble > 0.02 && Math.abs(above) < 2.5) h += c.pebble * 0.22 * gnoise(seed, x / 7, z / 7, 1415) * (1 - smoothstep(1.5, 2.5, Math.abs(above)));
      const nearMarsh = 1 - smoothstep(-45, -5, bilinear(marshD, grid, x, z));
      if (c.dune > 0.02 && c.shore > 6 && c.shore < 175 && nearMarsh > 0) {
        const phase2 = c.shore / 34 + 1.6 * fbm(seed, x / 120, z / 120, 2, 1424) + 0.3 * gnoise(seed, x / 37, z / 37, 1425);
        const t = phase2 - Math.floor(phase2), tri = 1 - Math.abs(2 * t - 1), crest = tri * tri * (3 - 2 * tri);
        const rows = smoothstep(-0.3, 0.3, fbm(seed, x / 60, z / 60, 2, 1421)), mound = fbm(seed, x / 34, z / 34, 2, 1422) * 0.5 + 0.5;
        const A = 2.8 + 4.4 * (fbm(seed, x / 160, z / 160, 2, 1423) * 0.5 + 0.5);
        const dh = nearMarsh * smoothstep(0.15, 0.6, c.dune) * smoothstep(6, 26, c.shore) * (1 - smoothstep(110, 165, c.shore)) * A * (0.8 * crest * rows + 0.45 * mound - 0.4);
        h = dh >= 0 ? h + dh : Math.max(h + dh, Math.min(h, sea + 0.35));
      }
      if (c.mud > 0.02 && above > -2 && above < 2 && nearMarsh > 0) {
        const creek = 1 - smoothstep(0.02, 0.09, Math.abs(gnoise(seed, x / 55 + 0.3 * gnoise(seed, x / 20, z / 20, 1433), z / 55, 1432)));
        const flat = sea + 0.06 + 0.1 * gnoise(seed, x / 16, z / 16, 1431) - 0.55 * creek;
        h += (flat - h) * c.mud * nearMarsh * (1 - smoothstep(1, 2, Math.abs(above)));
      }
    }
    const list = stackBuckets.get(Math.floor(x / STACK_CELL) * 65536 + Math.floor(z / STACK_CELL));
    if (list) for (const k of list) {
      const sx = stacks[k], sz = stacks[k + 1], r = stacks[k + 2], dx = x - sx, dz = z - sz, d = Math.sqrt(dx * dx + dz * dz);
      if (d > r * STACK_REACH + 7) continue;
      const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0, salt = stacks[k + 4];
      const R = r * (1 + 0.2 * gnoise(seed, ux * 1.3 + salt * 0.37, uz * 1.3, 1451) + 0.09 * gnoise(seed, ux * 3.1, uz * 3.1 + salt * 0.11, 1452) + 0.16 * (ridged(seed, ux * 5.5 + salt * 0.21, uz * 5.5, 2, 1456) - 0.5));
      const foot2 = R * 1.2, taper = 0.45, top = stacks[k + 3], f2 = Math.min(1, Math.max(0, (1 - d / foot2) / taper));
      let H;
      if (f2 >= 1) H = sea + top + 1.2 * gnoise(seed, x / 5, z / 5, 1453) - 1.6 * smoothstep(0.3, 1, d / Math.max(foot2 * (1 - taper), 1e-6));
      else if (f2 > 0) {
        let y = top * f2;
        const step = 3.1, t0 = Math.floor(y / step) * step;
        y += 0.55 * (t0 + step * smoothstep(0.3, 0.95, (y - t0) / step) - y);
        H = sea + y + 0.9 * (ridged(seed, x / 3.5, z / 3.5 + salt * 0.013, 2, 1454) - 0.45) * smoothstep(0, 2, y);
      } else H = base + (sea - 0.4 - base) * smoothstep(foot2 * 1.35, foot2, d);
      const skirt = (1 - smoothstep(foot2, foot2 * 1.35 + 6, d)) * (0.4 + 1.4 * ridged(seed, x / 2.6, z / 2.6, 2, 1455));
      h = Math.max(h, H, base + skirt * (base < sea ? 1 : 0.4));
    }
    return h;
  }
  function coastAt(x, z, out = {}) {
    coastSample(x, z, coastState);
    out.rock = coastState.rock;
    out.pebble = coastState.pebble;
    out.dune = coastState.dune;
    out.mud = coastState.mud;
    out.cliff = coastState.cliff;
    out.top = coastState.top;
    out.shore = coastState.shore;
    return out;
  }
  const carve = { weight: 0, height: 0, wet: 0, floodplain: 0, level: null, river: -1, edge: Infinity, half: 0 };
  function height(x, z) {
    const base = macro(x, z);
    const rgh = bilinear(rough, grid, x, z), lake = bilinear(lakeMask, grid, x, z);
    const detailFade = 1 - smoothstep(0.02, 0.4, lake);
    let detail = rgh * (0.62 * fbm(seed, x / 41, z / 41, 4, 1301) + 0.28 * fbm(seed, x / 12.5, z / 12.5, 2, 1302));
    if (rgh > 1.5) detail += (rgh - 1.5) * 1.1 * (ridged(seed, x / 70, z / 70, 3, 1303) - 0.45);
    if (rgh > 1.1) {
      const gx = bilinear(gradX, grid, x, z), gz = bilinear(gradZ, grid, x, z), gl = Math.sqrt(gx * gx + gz * gz);
      if (gl > 0.15) {
        const ux = gx / gl, uz = gz / gl;
        let sum = 0, wsum = 0;
        for (let k = 0; k < 4; k++) {
          const dx = STREAK_DIRS[k * 2], dz = STREAK_DIRS[k * 2 + 1], c = ux * dx + uz * dz, w = c * c * c * c;
          if (w < 0.02) continue;
          sum += w * ridged(seed, (x * -dz + z * dx) / 16, (x * dx + z * dz) / 38, 3, 1310 + k);
          wsum += w;
        }
        detail += (rgh - 1.1) * 1.1 * (sum / wsum - 0.42) * smoothstep(0.15, 0.5, gl);
        detail += (rgh - 1.1) * 0.6 * (ridged(seed, x / 23, z / 23, 2, 1320) - 0.45);
      }
    }
    const md = bilinear(marshD, grid, x, z), marsh = smoothstep(12.8, 35.2, md);
    if (md > -20) detail *= 1 - 0.6 * smoothstep(-20, -4, md) * (1 - marsh);
    if (marsh > 0) {
      const tussock = 0.3 * fbm(seed, x / 7.5, z / 7.5, 2, 1351) + 0.13 * gnoise(seed, x / 2.4, z / 2.4, 1352) + 0.1 * fbm(seed, x / 19, z / 19, 2, 1353);
      detail += (tussock - detail) * marsh;
    }
    const aboveSea = base - sea;
    if (aboveSea > -1 && aboveSea < 3) detail *= 0.3 + 0.7 * smoothstep(0.5, 3, Math.abs(aboveSea));
    let h = coastFine(x, z, base, base + detail * detailFade, detail * detailFade);
    if (aboveSea > 0.4 && h < sea + 0.08) h += (sea + 0.08 - h) * smoothstep(0.4, 0.8, aboveSea) * (1 - smoothstep(0.2, 0.4, coastState.rock));
    riverCarve(x, z, h, carve);
    if (carve.weight > 0) h = carve.height;
    if (holdReady) {
      const lift = holdLift(x, z);
      if (lift > 0) h += lift * (carve.weight > 0 && carve.edge < 0 ? smoothstep(-0.65 * carve.half, -0.25 * carve.half, carve.edge) : 1);
    }
    const L = bilinear(lakeLevel, grid, x, z);
    if (L && lake < 0.45) {
      const lift = smoothstep(0, 0.12, lake) * (1 - smoothstep(0.3, 0.45, lake)) * (carve.weight > 0 ? 1 - smoothstep(0.35, 0.75, carve.wet) : 1);
      h = Math.max(h, h + Math.min(L + 0.2 - h, 15) * lift);
    }
    const dc = dhypot(x - camp.x, z - camp.z);
    if (dc < 40) h += (campHeight - h) * (1 - smoothstep(10, 40, dc)) * 0.85;
    return h;
  }
  const probe = { weight: 0, height: 0, wet: 0, floodplain: 0, level: null, river: -1, edge: Infinity };
  function waterAt(x, z) {
    riverCarve(x, z, macro(x, z), probe);
    if (probe.level !== null) return { kind: "river", level: probe.level, id: probe.river };
    const lake = bilinear(lakeMask, grid, x, z);
    if (lake > 0.3) {
      const L = bilinear(lakeLevel, grid, x, z) / Math.max(lake, 1e-6) * lake;
      return { kind: "lake", level: L };
    }
    if (bilinear(marshD, grid, x, z) > marshOutline - 1) {
      const L = bilinear(marshLevel, grid, x, z);
      if (height(x, z) < L) return { kind: "marsh", level: L };
    }
    return null;
  }
  const marshDistance = (x, z) => bilinear(marshD, grid, x, z);
  const marshLevelAt = (x, z) => bilinear(marshLevel, grid, x, z);
  const wetProbe = { weight: 0, height: 0, wet: 0, floodplain: 0, level: null, river: -1, edge: Infinity };
  function wetAt(x, z) {
    riverCarve(x, z, 0, wetProbe);
    return wetProbe.wet;
  }
  const holdSegments = [], holdCells = /* @__PURE__ */ new Map();
  let holdReady = false;
  function holdLift(x, z) {
    const list = holdCells.get(Math.floor(x / RIVER_HOLD.cell) * 65536 + Math.floor(z / RIVER_HOLD.cell));
    if (!list) return 0;
    const H = RIVER_HOLD;
    let best = 0;
    for (let i = 0; i < list.length; i++) {
      const g = list[i], dx = g.x1 - g.x0, dz = g.z1 - g.z0, len2 = dx * dx + dz * dz;
      let u = len2 > 0 ? ((x - g.x0) * dx + (z - g.z0) * dz) / len2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const D = g.d0 + (g.d1 - g.d0) * u;
      if (D <= best) continue;
      let nx2 = g.n0x + (g.n1x - g.n0x) * u, nz2 = g.n0z + (g.n1z - g.n0z) * u;
      const nl = Math.sqrt(nx2 * nx2 + nz2 * nz2) || 1;
      nx2 /= nl;
      nz2 /= nl;
      const qx = x - (g.x0 + dx * u), qz = z - (g.z0 + dz * u), o = qx * nx2 + qz * nz2, along = Math.sqrt(Math.max(0, qx * qx + qz * qz - o * o));
      const F = Math.min(H.fade[2], Math.max(H.fade[1], D / H.fade[0]));
      const across = o > H.band[1] ? 1 - smoothstep(H.band[1], H.band[1] + F, o) : o < H.band[0] ? 1 - smoothstep(0, H.inward, H.band[0] - o) : 1;
      const lift = D * across * (1 - smoothstep(0, H.ends, along));
      if (lift > best) best = lift;
    }
    return best;
  }
  function prepareHolds() {
    const H = RIVER_HOLD, M = RIVER_FINISH.ribbonMargin, started = typeof performance !== "undefined" ? performance.now() : 0;
    let samples = 0, lifted = 0;
    const corners = /* @__PURE__ */ new Map(), G = H.lattice;
    const corner = (i, j) => {
      const key = i * 65536 + j;
      let v = corners.get(key);
      if (v === void 0) {
        v = height(i * G, j * G);
        corners.set(key, v);
        samples++;
      }
      return v;
    };
    const drawn = (x, z) => {
      const gx = x / G, gz = z / G, i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j, a = corner(i, j), b = corner(i + 1, j), c = corner(i, j + 1), d = corner(i + 1, j + 1);
      return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
    };
    const normalX = (r, k) => r.fx ? -r.fz[k] : r.nx[k], normalZ = (r, k) => r.fx ? r.fx[k] : r.nz[k];
    const otherWater = (r, x, z) => {
      if (bilinear(lakeMask, grid, x, z) > 0.2 || bilinear(marshD, grid, x, z) > marshOutline - 1) return true;
      const list = buckets.get(Math.floor((z - iz0) / INDEX_CELL) * inx + Math.floor((x - ix0) / INDEX_CELL));
      if (list) for (let q = 0; q < list.length; q += 2) {
        const o = list[q], j = list[q + 1];
        if (o !== r && segmentDist(o, j, x, z) < Math.max(o.width[j], o.width[j + 1]) * 0.5 + M + H.junction) return true;
      }
      return false;
    };
    for (const r of rivers) {
      const m = r.x.length, raw = new Float32Array(m * 2), end = r.s[m - 1];
      for (let k = 0; k < m; k++) {
        if (end - r.s[k] < H.end) continue;
        let fall = false;
        for (const f2 of r.fallSegs) {
          const before = r.s[f2.fs] - r.s[k], after = r.s[k] - r.s[f2.fs + 1];
          if (before >= -1 && before < LIP_BANK.length + LIP_BANK.fade || after >= -1 && after < H.pool) {
            fall = true;
            break;
          }
        }
        if (fall) continue;
        for (let side = 0; side < 2; side++) {
          const sg = side ? 1 : -1, half = r.width[k] * 0.5 + M, level = r.level[k], nx2 = normalX(r, k) * sg, nz2 = normalZ(r, k) * sg;
          let gap = -Infinity, need = 0, skip = false;
          if (k + 1 < m) {
            const h1 = r.width[k + 1] * 0.5 + M, x = (r.x[k] + nx2 * half + r.x[k + 1] + normalX(r, k + 1) * sg * h1) / 2, z = (r.z[k] + nz2 * half + r.z[k + 1] + normalZ(r, k + 1) * sg * h1) / 2, g = drawn(x, z);
            if (g >= sea - 0.05 && !otherWater(r, x, z)) {
              gap = Math.max(gap, (level + r.level[k + 1]) / 2 - g);
              need = Math.max(need, (level + r.level[k + 1]) / 2 + H.tests[0][1] - g);
            }
          }
          for (let i = 0; i < H.tests.length; i++) {
            const [de, clear] = H.tests[i];
            if (de < 0 && gap <= H.gap) break;
            const x = r.x[k] + nx2 * (half + de), z = r.z[k] + nz2 * (half + de);
            if (otherWater(r, x, z)) {
              skip = true;
              break;
            }
            const g = drawn(x, z);
            if (g < sea - 0.05) continue;
            if (de === 0) gap = Math.max(gap, level - g);
            need = Math.max(need, level + clear - g);
          }
          if (skip || gap <= H.gap) continue;
          raw[k * 2 + side] = Math.min(H.max, need / H.reach);
          lifted++;
        }
      }
      if (!raw.some((v) => v > 0)) continue;
      const most = new Float32Array(m * 2), hold = new Float32Array(m * 2), S = H.spread;
      for (let k = 0; k < m; k++) for (let side = 0; side < 2; side++) {
        let v = 0;
        for (let j = Math.max(0, k - S); j <= Math.min(m - 1, k + S); j++) v = Math.max(v, raw[j * 2 + side]);
        most[k * 2 + side] = v;
      }
      for (let k = 0; k < m; k++) for (let side = 0; side < 2; side++) {
        let sum = 0, wsum = 0;
        for (let j = Math.max(0, k - S); j <= Math.min(m - 1, k + S); j++) {
          const wt = S + 1 - Math.abs(j - k);
          sum += most[j * 2 + side] * wt;
          wsum += wt;
        }
        hold[k * 2 + side] = sum / wsum;
      }
      for (let side = 0; side < 2; side++) {
        const sg = side ? 1 : -1;
        for (let k = 0; k + 1 < m; k++) {
          const d0 = hold[k * 2 + side], d1 = hold[(k + 1) * 2 + side];
          if (!(d0 > 5e-3 || d1 > 5e-3)) continue;
          const h0 = r.width[k] * 0.5 + M, h1 = r.width[k + 1] * 0.5 + M, n0x = normalX(r, k) * sg, n0z = normalZ(r, k) * sg, n1x = normalX(r, k + 1) * sg, n1z = normalZ(r, k + 1) * sg;
          const g = { x0: r.x[k] + n0x * h0, z0: r.z[k] + n0z * h0, x1: r.x[k + 1] + n1x * h1, z1: r.z[k + 1] + n1z * h1, n0x, n0z, n1x, n1z, d0, d1 };
          holdSegments.push(g);
          const reach = Math.max(H.band[1] + H.fade[2], -H.band[0] + H.inward) + H.ends + 1;
          const cx0 = Math.floor((Math.min(g.x0, g.x1) - reach) / H.cell), cx1 = Math.floor((Math.max(g.x0, g.x1) + reach) / H.cell);
          const cz0 = Math.floor((Math.min(g.z0, g.z1) - reach) / H.cell), cz1 = Math.floor((Math.max(g.z0, g.z1) + reach) / H.cell);
          for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
            const key = cx * 65536 + cz;
            let list = holdCells.get(key);
            if (!list) holdCells.set(key, list = []);
            list.push(g);
          }
        }
      }
    }
    holdReady = true;
    return { samples, lifted, segments: holdSegments.length, cells: holdCells.size, ms: typeof performance !== "undefined" ? Math.round(performance.now() - started) : 0 };
  }
  const holds = prepareHolds();
  return { height, macro, waterAt, wetAt, marshDistance, marshLevelAt, coastAt, rivers, hydro, model, swamps: swampList, holds };
}

// coastal-face-detail.js
var COASTAL_FACE_DETAIL = Object.freeze({ revision: "coastal-face-joints-v61-r1", start: 7, full: 12, fadeStart: 46, end: 94, maxFraction: 0.35, maxDepth: 6.5 });
var smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
function coastalFaceIncision(strike, distance, relief, field) {
  const p = COASTAL_FACE_DETAIL;
  if (distance <= p.start || distance >= p.end || relief <= 0) return 0;
  const support = smooth(p.start, p.full, distance) * (1 - smooth(p.fadeStart, p.end, distance));
  const a = field(strike / 15 + distance / 31, distance / 19 - strike / 57, 91);
  const b = field(strike / 37 - distance / 41, distance / 29 + strike / 83, 92);
  const main = 1 - smooth(0.06, 0.4, Math.abs(2 * a - 1));
  const cross = (1 - smooth(0.04, 0.3, Math.abs(2 * b - 1))) * 0.46;
  const joint = Math.max(main, cross);
  return support * Math.min(relief * p.maxFraction, p.maxDepth * (0.45 + 0.55 * b)) * joint;
}

// island-terrain.js
var ISLAND_PARAMS = Object.freeze({ centerX: 0, centerZ: -128, radiusX: 1800, radiusZ: 1920, shoreVariation: 0.08, keepRadius: 0.68, seaLevel: 0.62, seabedMinimum: -75.38, sampleStep: 4 / 3, samplingPad: Math.SQRT2 * 4 / 3 });
var clamp2 = (v) => Math.max(0, Math.min(1, v));
var smooth2 = (a, b, v) => {
  const t = clamp2((v - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var mix = (a, b, t) => a + (b - a) * t;
function phase(seed, salt) {
  let h = (seed ^ Math.imul(salt, 2654435761)) >>> 0;
  h = Math.imul(h ^ h >>> 16, 2146121005);
  h = Math.imul(h ^ h >>> 15, 2221713035);
  return ((h ^ h >>> 16) >>> 0) / 4294967296 * Math.PI * 2;
}
function createIslandTerrain({ seed = 728194 } = {}) {
  const p = ISLAND_PARAMS, a = phase(seed, 1), b = phase(seed, 2), c = phase(seed, 3), d = phase(seed, 4), outer = 1 + p.shoreVariation;
  const landBounds = Object.freeze({ minX: p.centerX - p.radiusX * outer, maxX: p.centerX + p.radiusX * outer, minZ: p.centerZ - p.radiusZ * outer, maxZ: p.centerZ + p.radiusZ * outer });
  const boundaryZones = Object.freeze([
    Object.freeze({ id: "north-escarpment", name: "北壁の連峰", kind: "escarpment", x: 0, z: -1720, angle: -Math.PI / 2 }),
    Object.freeze({ id: "east-sea-cliffs", name: "砕潮の断崖", kind: "cliff-coast", x: 1510, z: -280, angle: -0.04 })
  ]);
  const tau = Math.PI * 2, mainSteps = 512, isletSteps = 48, isletCount = 3, segmentCount = mainSteps + isletSteps * isletCount;
  const pointU = new Float64Array(segmentCount), pointV = new Float64Array(segmentCount), segments = new Float64Array(segmentCount * 4), segmentPart = new Uint8Array(segmentCount);
  const bayAngles = new Float64Array(3), bayWidths = new Float64Array(3), bayRadii = new Float64Array(3), islets = [];
  for (let i = 0; i < 3; i++) {
    bayAngles[i] = a + i * tau / 3 + 0.17 * Math.sin(b + i * 2.7);
    bayWidths[i] = 0.4 + 0.15 * phase(seed, 21 + i) / tau;
    bayRadii[i] = 0.827 + 0.018 * phase(seed, 31 + i) / tau;
  }
  function macroRadiusAt(angle) {
    let radius = 0.946 + 0.039 * Math.sin(angle * 2 + a) + 0.025 * Math.sin(angle * 5 + b) + 0.012 * Math.sin(angle * 9 + c);
    for (let i = 0; i < 3; i++) radius = mix(radius, bayRadii[i], smooth2(Math.cos(bayWidths[i]), 1, Math.cos(angle - bayAngles[i])));
    return radius + 8e-3 * Math.sin(angle * 17 + d) + 3e-3 * Math.sin(angle * 37 + b);
  }
  function buildRing(start, count, cu, cv, size, shapePhase, part) {
    for (let i = 0; i < count; i++) {
      const angle = i * tau / count, radius = part === 0 ? macroRadiusAt(angle) : size * (0.88 + 0.073 * Math.sin(angle * 3 + shapePhase) + 0.037 * Math.sin(angle * 5 - shapePhase));
      pointU[start + i] = cu + Math.cos(angle) * radius;
      pointV[start + i] = cv + Math.sin(angle) * radius;
    }
    for (let i = 0; i < count; i++) {
      const k = start + i, j = start + (i + 1) % count, o = k * 4;
      segments[o] = p.centerX + pointU[k] * p.radiusX;
      segments[o + 1] = p.centerZ + pointV[k] * p.radiusZ;
      segments[o + 2] = p.centerX + pointU[j] * p.radiusX;
      segments[o + 3] = p.centerZ + pointV[j] * p.radiusZ;
      segmentPart[k] = part;
    }
  }
  buildRing(0, mainSteps, 0, 0, 0, 0, 0);
  function ringRadiusAt(angle, start, count, cu = 0, cv = 0) {
    const wrapped = (angle % tau + tau) % tau, i = Math.min(count - 1, Math.floor(wrapped * count / tau)), k = start + i, j = start + (i + 1) % count;
    const au = pointU[k] - cu, av = pointV[k] - cv, bu = pointU[j] - cu, bv = pointV[j] - cv;
    return (au * bv - av * bu) / (Math.cos(angle) * (bv - av) - Math.sin(angle) * (bu - au));
  }
  function radiusAt(angle) {
    return ringRadiusAt(angle, 0, mainSteps);
  }
  for (let i = 0; i < isletCount; i++) {
    const angle = bayAngles[i] + 0.025 * Math.sin(c + i), size = 0.025 + 8e-3 * phase(seed, 41 + i) / tau;
    const r = Math.min(outer - size - 0.014, radiusAt(angle) + 0.105 + 0.022 * phase(seed, 51 + i) / tau), u = Math.cos(angle) * r, v = Math.sin(angle) * r, start = mainSteps + i * isletSteps;
    const shapePhase = phase(seed, 61 + i), feature = Object.freeze({ id: "coastal-islet-" + (i + 1), u, v, radius: size, shapePhase, start, count: isletSteps });
    islets.push(feature);
    buildRing(start, isletSteps, u, v, size, shapePhase, i + 1);
  }
  const nodes = [], order = Array.from({ length: segmentCount }, (_, i) => i);
  let maxTreeDepth = 0;
  function buildNode(start, end, depth) {
    const node = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, start, end, left: -1, right: -1 }, index = nodes.length;
    nodes.push(node);
    maxTreeDepth = Math.max(maxTreeDepth, depth);
    for (let i = start; i < end; i++) {
      const o = order[i] * 4;
      node.minX = Math.min(node.minX, segments[o], segments[o + 2]);
      node.maxX = Math.max(node.maxX, segments[o], segments[o + 2]);
      node.minZ = Math.min(node.minZ, segments[o + 1], segments[o + 3]);
      node.maxZ = Math.max(node.maxZ, segments[o + 1], segments[o + 3]);
    }
    if (end - start > 8) {
      const axis = node.maxX - node.minX >= node.maxZ - node.minZ ? 0 : 1, sorted = order.slice(start, end).sort((i, j) => segments[i * 4 + axis] + segments[i * 4 + axis + 2] - segments[j * 4 + axis] - segments[j * 4 + axis + 2]);
      for (let i = 0; i < sorted.length; i++) order[start + i] = sorted[i];
      const middle = start + end >> 1;
      node.left = buildNode(start, middle, depth + 1);
      node.right = buildNode(middle, end, depth + 1);
    }
    return index;
  }
  buildNode(0, segmentCount, 1);
  const coastGeometry = Object.freeze({ revision: 2, mainlandSegments: mainSteps, isletCount, shoreSegments: segmentCount, nearestTreeDepth: maxTreeDepth, maxLeafSegments: 8, detailPhase: d, bays: Object.freeze(Array.from(bayAngles, (angle, i) => Object.freeze({ angle, width: bayWidths[i], radius: bayRadii[i] }))), islets: Object.freeze(islets) });
  function boxDistanceSquared(node, x, z) {
    const dx = Math.max(node.minX - x, 0, x - node.maxX), dz = Math.max(node.minZ - z, 0, z - node.maxZ);
    return dx * dx + dz * dz;
  }
  function nearestSquared(index, x, z, best, out) {
    const node = nodes[index];
    if (boxDistanceSquared(node, x, z) > best) return best;
    if (node.left < 0) {
      for (let i = node.start; i < node.end; i++) {
        const k = order[i], o = k * 4, ax = segments[o], az = segments[o + 1], dx = segments[o + 2] - ax, dz = segments[o + 3] - az, lengthSquared = dx * dx + dz * dz, t = clamp2(((x - ax) * dx + (z - az) * dz) / lengthSquared), sx = ax + t * dx, sz = az + t * dz, ex = x - sx, ez = z - sz, distanceSquared = ex * ex + ez * ez;
        if (distanceSquared < best) {
          best = distanceSquared;
          if (out) {
            const length = Math.sqrt(lengthSquared);
            out.shoreX = sx;
            out.shoreZ = sz;
            out.shoreNormalX = dz / length;
            out.shoreNormalZ = -dx / length;
            out.shoreFeature = segmentPart[k] === 0 ? "mainland" : islets[segmentPart[k] - 1].id;
          }
        }
      }
      return best;
    }
    const dl = boxDistanceSquared(nodes[node.left], x, z), dr = boxDistanceSquared(nodes[node.right], x, z);
    if (dl < dr) {
      if (dl <= best) best = nearestSquared(node.left, x, z, best, out);
      if (dr <= best) best = nearestSquared(node.right, x, z, best, out);
    } else {
      if (dr <= best) best = nearestSquared(node.right, x, z, best, out);
      if (dl <= best) best = nearestSquared(node.left, x, z, best, out);
    }
    return best;
  }
  function nearestDistance(x, z, out) {
    return Math.sqrt(nearestSquared(0, x, z, Infinity, out));
  }
  function landPart(u, v, r, angle, shore) {
    if (r <= shore) return 0;
    if (r > outer) return -1;
    for (let i = 0; i < islets.length; i++) {
      const island = islets[i], du = u - island.u, dv = v - island.v, r2 = du * du + dv * dv;
      if (r2 > island.radius * island.radius) continue;
      if (r2 === 0 || Math.sqrt(r2) <= ringRadiusAt(Math.atan2(dv, du), island.start, island.count, island.u, island.v)) return i + 1;
    }
    return -1;
  }
  function shoreDistance(x, z) {
    const u = (x - p.centerX) / p.radiusX, v = (z - p.centerZ) / p.radiusZ, r = Math.hypot(u, v), angle = Math.atan2(v, u), part = landPart(u, v, r, angle, radiusAt(angle));
    return nearestDistance(x, z) * (part < 0 ? -1 : 1);
  }
  function seabedAt(angle, distance) {
    const steep = smooth2(0.72, 0.95, boundaryStrengthAt(angle) * cliffAt(angle)), shelf = mix(105 + 42 * Math.sin(angle * 3 + b), 15, steep), slopeEnd = mix(shelf + 500 + 150 * Math.sin(angle * 2 + c), 95, steep);
    const fraction = 0.04 * (1 - Math.exp(-distance / (shelf * 0.5))) + 0.66 * smooth2(shelf, slopeEnd, distance) + 0.3 * smooth2(slopeEnd + 80, slopeEnd + 1500, distance);
    return p.seaLevel - (p.seaLevel - p.seabedMinimum) * fraction;
  }
  function cliffAt(angle) {
    return smooth2(-0.22, 0.57, 0.72 * Math.sin(angle * 2 + d) + 0.28 * Math.sin(angle * 5 + b));
  }
  function boundaryStrengthAt(angle) {
    return Math.max(smooth2(Math.cos(1.08), Math.cos(0.59), Math.cos(angle + Math.PI / 2)), smooth2(Math.cos(0.84), Math.cos(0.43), Math.cos(angle + 0.04)));
  }
  function wallFrontAt(angle) {
    return 296 + 31 * Math.sin(angle * 7 + a) + 17 * Math.sin(angle * 17 + b) + 4 * Math.sin(angle * 53 + c);
  }
  function slabHash(cell, salt) {
    let h = (seed ^ Math.imul(cell, 73244475) ^ Math.imul(salt, 668265261)) >>> 0;
    h = Math.imul(h ^ h >>> 16, 2146121005);
    h = Math.imul(h ^ h >>> 15, 2221713035);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function slabField(t, salt) {
    const cell = Math.floor(t), f2 = t - cell;
    return mix(slabHash(cell, salt), slabHash(cell + 1, salt), smooth2(0.32, 0.68, f2));
  }
  function fractureHash(x, z, salt) {
    let h = (seed ^ Math.imul(x, 73244475) ^ Math.imul(z, 295559667) ^ Math.imul(salt, 668265261)) >>> 0;
    h = Math.imul(h ^ h >>> 16, 2146121005);
    h = Math.imul(h ^ h >>> 15, 2221713035);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function fractureField(x, z, salt) {
    const ix = Math.floor(x), iz = Math.floor(z), u = x - ix, v = z - iz, a2 = fractureHash(ix, iz, salt), b2 = fractureHash(ix + 1, iz, salt), c2 = fractureHash(ix, iz + 1, salt), d2 = fractureHash(ix + 1, iz + 1, salt);
    return u + v <= 1 ? a2 + (b2 - a2) * u + (c2 - a2) * v : d2 + (c2 - d2) * (1 - u) + (b2 - d2) * (1 - v);
  }
  function upperRange(strike, depth) {
    if (depth <= 0) return 0;
    const warp = (fractureField(strike / 260, depth / 230, 71) - 0.5) * 48;
    const s = strike + warp, d2 = depth + (fractureField(strike / 190, depth / 180, 72) - 0.5) * 28;
    const regional = fractureField(s / 185 + d2 / 250, d2 / 132 - s / 330, 73);
    const joint = fractureField(s / 83 - d2 / 143, d2 / 71 + s / 230, 74);
    const rib = 1 - Math.abs(2 * fractureField(s / 51 + d2 / 97, d2 / 67 - s / 173, 75) - 1);
    const ridge = 1 - Math.abs(2 * regional - 1);
    const top = 43 + 142 * ridge * ridge + 37 * joint + 18 * rib;
    const ravine = Math.abs(2 * fractureField(s / 117 + d2 / 211, d2 / 157 - s / 285, 76) - 1);
    const setback = (joint - 0.5) * 54 * smooth2(0, 42, depth);
    const face = (depth + setback) * (2.9 + 0.8 * ravine) + (rib - 0.5) * 19 * smooth2(0, 14, depth);
    return Math.max(0, Math.min(face, top - 37 * ravine * ravine));
  }
  function normalizedRadius(x, z) {
    return Math.hypot((x - p.centerX) / p.radiusX, (z - p.centerZ) / p.radiusZ);
  }
  function isLandExtent(x, z) {
    const u = (x - p.centerX) / p.radiusX, v = (z - p.centerZ) / p.radiusZ, r2 = u * u + v * v;
    if (r2 > outer * outer) return false;
    if (r2 <= p.keepRadius * p.keepRadius) return true;
    const r = Math.sqrt(r2), angle = Math.atan2(v, u);
    return landPart(u, v, r, angle, radiusAt(angle)) >= 0;
  }
  function intersectsLandBounds(bounds, pad = p.samplingPad) {
    if (!bounds || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.minZ) || !Number.isFinite(bounds.maxZ) || bounds.minZ > bounds.maxZ || bounds.minX > bounds.maxX || !Number.isFinite(pad) || pad < 0) return true;
    const x = Math.max(bounds.minX - pad, Math.min(p.centerX, bounds.maxX + pad)), z = Math.max(bounds.minZ - pad, Math.min(p.centerZ, bounds.maxZ + pad));
    return normalizedRadius(x, z) <= outer;
  }
  function mask(x, z) {
    const u = (x - p.centerX) / p.radiusX, v = (z - p.centerZ) / p.radiusZ, r2 = u * u + v * v;
    if (r2 <= p.keepRadius * p.keepRadius) return 1;
    if (r2 >= outer * outer) return 0;
    const r = Math.sqrt(r2), angle = Math.atan2(v, u), shore = radiusAt(angle), part = landPart(u, v, r, angle, shore);
    if (part < 0) return 0;
    if (part === 0) return 1 - smooth2(p.keepRadius, shore, r);
    return smooth2(0, islets[part - 1].radius * Math.min(p.radiusX, p.radiusZ) * 0.65, nearestDistance(x, z));
  }
  function cliffRelief(angle, r, distance) {
    if (distance <= 0) return 0;
    const strength = boundaryStrengthAt(angle) * smooth2(0.7, 0.74, r);
    if (strength === 0) return 0;
    const front = wallFrontAt(angle);
    if (distance >= front + 105) return 0;
    const joint = 3.8 * Math.sin(angle * 37 + d) + 2.2 * Math.sin(angle * 71 + b);
    const talus = 28 * (1 - smooth2(front + 20, front + 100, distance));
    const strike = angle * 1650;
    const broad = slabField(strike / 37, 11), chips = slabField(strike / 13, 12), h1 = 10 + 5 * broad, edge1 = front + 10 + joint - 1.9 * broad - 1.1 * chips;
    const basal = h1 * (1 - smooth2(edge1 - 2.7, edge1, distance));
    const fractureScale = 0.9 + 0.09 * Math.sin(angle * 11 + a) + 0.07 * Math.sin(angle * 23 + d);
    const seaFace = smooth2(7, 23 + joint * 0.5, distance);
    const depth = edge1 - 2.7 - distance;
    if (depth <= 0) return strength * fractureScale * (talus + basal) * seaFace;
    const erodedProfile = talus + basal + upperRange(strike, depth);
    const baseline = strength * fractureScale * erodedProfile * seaFace;
    const incision = coastalFaceIncision(strike, distance, baseline, fractureField);
    return incision > 0 ? baseline - incision : baseline;
  }
  function height(x, z, baseHeight) {
    const u = (x - p.centerX) / p.radiusX, v = (z - p.centerZ) / p.radiusZ, r2 = u * u + v * v;
    if (r2 <= p.keepRadius * p.keepRadius) return baseHeight(x, z);
    const r = Math.sqrt(r2), angle = Math.atan2(v, u), shore = radiusAt(angle), part = landPart(u, v, r, angle, shore), distance = nearestDistance(x, z);
    if (part < 0) return seabedAt(angle, distance);
    if (part > 0) return p.seaLevel + distance * (0.15 + 0.13 * fractureField(x / 83, z / 67, 81)) + 7 * fractureField(x / 47, z / 59, 82) * smooth2(8, 44, distance);
    const coast = p.seaLevel + 0.11 * distance + 50 * cliffAt(angle) * smooth2(0, 52, distance);
    const blend = smooth2(p.keepRadius, Math.min(shore - 0.1, p.keepRadius + 0.2), r), ground = blend === 1 ? coast : mix(baseHeight(x, z), coast, blend);
    return ground + cliffRelief(angle, r, distance);
  }
  function isCliffRegion(x, z) {
    const u = (x - p.centerX) / p.radiusX, v = (z - p.centerZ) / p.radiusZ, r2 = u * u + v * v;
    if (r2 < 0.7 * 0.7 || r2 > outer * outer) return false;
    const r = Math.sqrt(r2), angle = Math.atan2(v, u);
    if (r > radiusAt(angle) || boundaryStrengthAt(angle) <= 0.02) return false;
    const distance = nearestDistance(x, z);
    return distance > 0 && distance < wallFrontAt(angle) + 105;
  }
  function sample(x, z) {
    const u = (x - p.centerX) / p.radiusX, v = (z - p.centerZ) / p.radiusZ, r = Math.hypot(u, v), angle = Math.atan2(v, u), shore = radiusAt(angle), part = landPart(u, v, r, angle, shore), boundaryStrength = part === 0 ? boundaryStrengthAt(angle) * smooth2(0.7, 0.74, r) : 0;
    const result = { normalizedRadius: r, shoreRadius: shore, shoreDistance: 0, shoreX: 0, shoreZ: 0, shoreNormalX: 0, shoreNormalZ: 0, shoreFeature: "mainland", cliffBlend: part === 0 ? cliffAt(angle) : 0, preserved: r <= p.keepRadius, withinExtent: part >= 0, boundaryKind: "ocean", boundaryStrength, relief: 0 };
    const distance = nearestDistance(x, z, result) * (part < 0 ? -1 : 1), inCliffs = part === 0 && distance > 0 && distance < wallFrontAt(angle) + 105 && boundaryStrength > 0.02;
    result.shoreDistance = distance;
    result.boundaryKind = part < 0 ? "ocean" : inCliffs ? distance < 90 ? "cliff-coast" : "escarpment" : distance < 90 ? "beach" : "inland";
    result.relief = part === 0 ? cliffRelief(angle, r, distance) : 0;
    return result;
  }
  return Object.freeze({ params: p, seed, coastPhases: Object.freeze([a, b, c]), coastGeometry, landBounds, boundaryZones, normalizedRadius, isLandExtent, intersectsLandBounds, mask, height, sample, shoreDistance, boundaryAt: sample, isCliffRegion });
}

// generated-island.js
var clamp012 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
var smooth3 = (a, b, v) => {
  const t = clamp012((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
var EDGE_CORNERS = [[0, 1], [1, 2], [3, 2], [0, 3]];
var CASE_PAIRS = { 1: [[0, 3]], 2: [[0, 1]], 3: [[1, 3]], 4: [[1, 2]], 6: [[0, 2]], 7: [[2, 3]], 8: [[2, 3]], 9: [[0, 2]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] };
function contourRings(values, nx, nz, cell, x0, z0) {
  const point = /* @__PURE__ */ new Map(), link = /* @__PURE__ */ new Map();
  for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
    const i = iz * nx + ix, v = [values[i], values[i + 1], values[i + nx + 1], values[i + nx]];
    const code = (v[0] > 0 ? 1 : 0) | (v[1] > 0 ? 2 : 0) | (v[2] > 0 ? 4 : 0) | (v[3] > 0 ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const cx = [ix, ix + 1, ix + 1, ix], cz = [iz, iz, iz + 1, iz + 1];
    const edgeId = [2 * i, 2 * (i + 1) + 1, 2 * (i + nx), 2 * i + 1];
    const crossing = (e) => {
      const id = edgeId[e];
      let q = point.get(id);
      if (!q) {
        const [p0, p1] = EDGE_CORNERS[e], t = v[p0] / (v[p0] - v[p1]);
        q = { x: x0 + (cx[p0] + (cx[p1] - cx[p0]) * t) * cell, z: z0 + (cz[p0] + (cz[p1] - cz[p0]) * t) * cell };
        point.set(id, q);
      }
      return q;
    };
    let pairs = CASE_PAIRS[code];
    if (!pairs) {
      const centre = (v[0] + v[1] + v[2] + v[3]) * 0.25 > 0;
      pairs = code === 5 ? centre ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]] : centre ? [[0, 3], [1, 2]] : [[0, 1], [2, 3]];
    }
    for (const [e1, e2] of pairs) {
      const p = crossing(e1), q = crossing(e2);
      const shared = EDGE_CORNERS[e1].find((c) => EDGE_CORNERS[e2].includes(c)), corner = shared ?? 0;
      const kx = x0 + cx[corner] * cell, kz = z0 + cz[corner] * cell, cross = (q.x - p.x) * (kz - p.z) - (q.z - p.z) * (kx - p.x);
      const wantLeft = v[corner] > 0;
      if (cross > 0 === wantLeft) link.set(edgeId[e1], edgeId[e2]);
      else link.set(edgeId[e2], edgeId[e1]);
    }
  }
  const rings = [], used = /* @__PURE__ */ new Set();
  for (const start of link.keys()) {
    if (used.has(start)) continue;
    const ring = [];
    let id = start, guard = 0;
    while (id !== void 0 && !used.has(id) && guard++ < 1e7) {
      used.add(id);
      const q = point.get(id);
      ring.push({ x: q.x, z: q.z });
      id = link.get(id);
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j].x * ring[i].z - ring[i].x * ring[j].z;
  return a * 0.5;
}
function createGeneratedIsland({ seed, grid, height, seaLevel = ISLAND_PARAMS.seaLevel }) {
  const p = ISLAND_PARAMS, { nx, nz, cell, x0, z0 } = grid, n = nx * nz;
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = height[i] - seaLevel;
  const slope = new Float32Array(n);
  for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
    const i = iz * nx + ix, gx = (height[i + 1] - height[i - 1]) / (2 * cell), gz = (height[i + nx] - height[i - nx]) / (2 * cell);
    slope[i] = Math.sqrt(gx * gx + gz * gz);
  }
  const steep = new Uint8Array(n);
  for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
    let s = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) s = Math.max(s, slope[(iz + dz) * nx + ix + dx]);
    steep[iz * nx + ix] = s > 0.75 ? 1 : 0;
  }
  const bilinear2 = (field, x, z) => {
    let fx = (x - x0) / cell, fz = (z - z0) / cell;
    if (fx < 0) fx = 0;
    else if (fx > nx - 1.000001) fx = nx - 1.000001;
    if (fz < 0) fz = 0;
    else if (fz > nz - 1.000001) fz = nz - 1.000001;
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, i = iz * nx + ix;
    const a = field[i] + (field[i + 1] - field[i]) * u, b = field[i + nx] + (field[i + nx + 1] - field[i + nx]) * u;
    return a + (b - a) * v;
  };
  const rings = contourRings(values, nx, nz, cell, x0, z0).map((ring) => ({ ring, area: ringArea(ring) })).sort((a, b) => b.area - a.area);
  let segmentCount = 0;
  for (const r of rings) segmentCount += r.ring.length;
  const segments = new Float64Array(segmentCount * 4), segmentPart = new Uint16Array(segmentCount), islets = [];
  let o = 0, isletIndex = 0;
  for (let r = 0; r < rings.length; r++) {
    const { ring, area } = rings[r];
    let part = 0;
    if (r > 0) {
      if (area > 0) {
        isletIndex++;
        let cx = 0, cz = 0;
        for (const q of ring) {
          cx += q.x;
          cz += q.z;
        }
        cx /= ring.length;
        cz /= ring.length;
        islets.push(Object.freeze({ id: "islet-" + isletIndex, u: (cx - p.centerX) / p.radiusX, v: (cz - p.centerZ) / p.radiusZ, radius: Math.sqrt(area / Math.PI) / Math.min(p.radiusX, p.radiusZ), area, shapePhase: 0, start: o / 4, count: ring.length }));
        part = Math.min(65535, isletIndex);
      } else part = 0;
    }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      segments[o] = a.x;
      segments[o + 1] = a.z;
      segments[o + 2] = b.x;
      segments[o + 3] = b.z;
      segmentPart[o / 4] = part;
      o += 4;
    }
  }
  const nodes = [], order = Array.from({ length: segmentCount }, (_, i) => i);
  let maxTreeDepth = 0;
  function buildNode(start, end, depth) {
    const node = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, start, end, left: -1, right: -1 }, index = nodes.length;
    nodes.push(node);
    maxTreeDepth = Math.max(maxTreeDepth, depth);
    for (let i = start; i < end; i++) {
      const q = order[i] * 4;
      node.minX = Math.min(node.minX, segments[q], segments[q + 2]);
      node.maxX = Math.max(node.maxX, segments[q], segments[q + 2]);
      node.minZ = Math.min(node.minZ, segments[q + 1], segments[q + 3]);
      node.maxZ = Math.max(node.maxZ, segments[q + 1], segments[q + 3]);
    }
    if (end - start > 8) {
      const axis = node.maxX - node.minX >= node.maxZ - node.minZ ? 0 : 1, sorted = order.slice(start, end).sort((i, j) => segments[i * 4 + axis] + segments[i * 4 + axis + 2] - segments[j * 4 + axis] - segments[j * 4 + axis + 2]);
      for (let i = 0; i < sorted.length; i++) order[start + i] = sorted[i];
      const middle = start + end >> 1;
      node.left = buildNode(start, middle, depth + 1);
      node.right = buildNode(middle, end, depth + 1);
    }
    return index;
  }
  if (segmentCount) buildNode(0, segmentCount, 1);
  const boxDistanceSquared = (node, x, z) => {
    const dx = Math.max(node.minX - x, 0, x - node.maxX), dz = Math.max(node.minZ - z, 0, z - node.maxZ);
    return dx * dx + dz * dz;
  };
  function nearestSquared(index, x, z, best, out) {
    const node = nodes[index];
    if (boxDistanceSquared(node, x, z) > best) return best;
    if (node.left < 0) {
      for (let i = node.start; i < node.end; i++) {
        const k = order[i], q = k * 4, ax = segments[q], az = segments[q + 1], dx = segments[q + 2] - ax, dz = segments[q + 3] - az, l2 = dx * dx + dz * dz;
        const t = l2 > 0 ? clamp012(((x - ax) * dx + (z - az) * dz) / l2) : 0, sx = ax + t * dx, sz = az + t * dz, ex = x - sx, ez = z - sz, d2 = ex * ex + ez * ez;
        if (d2 < best) {
          best = d2;
          if (out) {
            const l = Math.sqrt(l2) || 1;
            out.shoreX = sx;
            out.shoreZ = sz;
            out.shoreNormalX = dz / l;
            out.shoreNormalZ = -dx / l;
            out.shoreFeature = segmentPart[k] === 0 ? "mainland" : "islet-" + segmentPart[k];
          }
        }
      }
      return best;
    }
    const dl = boxDistanceSquared(nodes[node.left], x, z), dr = boxDistanceSquared(nodes[node.right], x, z);
    if (dl < dr) {
      if (dl <= best) best = nearestSquared(node.left, x, z, best, out);
      if (dr <= best) best = nearestSquared(node.right, x, z, best, out);
    } else {
      if (dr <= best) best = nearestSquared(node.right, x, z, best, out);
      if (dl <= best) best = nearestSquared(node.left, x, z, best, out);
    }
    return best;
  }
  const nearestDistance = (x, z, out) => segmentCount ? Math.sqrt(nearestSquared(0, x, z, Infinity, out)) : 1e6;
  function landValue(x, z) {
    return bilinear2(values, x, z);
  }
  function isLandExtent(x, z) {
    return landValue(x, z) > 0;
  }
  function shoreDistance(x, z) {
    return nearestDistance(x, z) * (isLandExtent(x, z) ? 1 : -1);
  }
  const coastBound = new Float32Array(n);
  {
    const big = 1e9;
    for (let i = 0; i < n; i++) coastBound[i] = values[i] > 0 ? big : 0;
    const a = cell, b = cell * Math.SQRT2;
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      let v = coastBound[i];
      if (ix > 0) v = Math.min(v, coastBound[i - 1] + a);
      if (iz > 0) {
        v = Math.min(v, coastBound[i - nx] + a);
        if (ix > 0) v = Math.min(v, coastBound[i - nx - 1] + b);
        if (ix < nx - 1) v = Math.min(v, coastBound[i - nx + 1] + b);
      }
      coastBound[i] = v;
    }
    for (let iz = nz - 1; iz >= 0; iz--) for (let ix = nx - 1; ix >= 0; ix--) {
      const i = iz * nx + ix;
      let v = coastBound[i];
      if (ix < nx - 1) v = Math.min(v, coastBound[i + 1] + a);
      if (iz < nz - 1) {
        v = Math.min(v, coastBound[i + nx] + a);
        if (ix < nx - 1) v = Math.min(v, coastBound[i + nx + 1] + b);
        if (ix > 0) v = Math.min(v, coastBound[i + nx - 1] + b);
      }
      coastBound[i] = v;
    }
  }
  let lx0 = Infinity, lx1 = -Infinity, lz0 = Infinity, lz1 = -Infinity, deepest = -1, deepX = 0, deepZ = 0;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix;
    if (values[i] <= 0) continue;
    const x = x0 + ix * cell, z = z0 + iz * cell;
    if (x < lx0) lx0 = x;
    if (x > lx1) lx1 = x;
    if (z < lz0) lz0 = z;
    if (z > lz1) lz1 = z;
    if (coastBound[i] > deepest) {
      deepest = coastBound[i];
      deepX = x;
      deepZ = z;
    }
  }
  const SHELF = 420, landBounds = Object.freeze({ minX: lx0 - SHELF, maxX: lx1 + SHELF, minZ: lz0 - SHELF, maxZ: lz1 + SHELF });
  const keep = Object.freeze({ x: deepX, z: deepZ, r: Math.max(0, deepest - 160) });
  const halfX = Math.max(1, (lx1 - lx0) / 2), halfZ = Math.max(1, (lz1 - lz0) / 2);
  const params = Object.freeze({ ...p, centerX: (lx0 + lx1) / 2, centerZ: (lz0 + lz1) / 2, radiusX: halfX, radiusZ: halfZ, keepRadius: keep.r / Math.max(halfX, halfZ), shoreVariation: 0 });
  function normalizedRadius(x, z) {
    const u = (x - params.centerX) / halfX, v = (z - params.centerZ) / halfZ;
    return Math.sqrt(u * u + v * v);
  }
  function inKeep(x, z) {
    return keep.r > 0 && (x - keep.x) ** 2 + (z - keep.z) ** 2 <= keep.r * keep.r;
  }
  const T = 64, tnx = Math.ceil((landBounds.maxX - landBounds.minX) / T) + 1, tnz = Math.ceil((landBounds.maxZ - landBounds.minZ) / T) + 1, tiles = new Uint8Array(tnx * tnz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    if (values[iz * nx + ix] <= 0) continue;
    const tx = Math.floor((x0 + ix * cell - landBounds.minX) / T), tz = Math.floor((z0 + iz * cell - landBounds.minZ) / T);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const a = tx + dx, b = tz + dz;
      if (a >= 0 && b >= 0 && a < tnx && b < tnz) tiles[b * tnx + a] = 1;
    }
  }
  function intersectsLandBounds(bounds, pad = p.samplingPad) {
    if (!bounds || ![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, pad].every(Number.isFinite) || bounds.minZ > bounds.maxZ || bounds.minX > bounds.maxX || pad < 0) return true;
    const a0 = Math.max(0, Math.floor((bounds.minX - pad - landBounds.minX) / T)), a1 = Math.min(tnx - 1, Math.floor((bounds.maxX + pad - landBounds.minX) / T));
    const b0 = Math.max(0, Math.floor((bounds.minZ - pad - landBounds.minZ) / T)), b1 = Math.min(tnz - 1, Math.floor((bounds.maxZ + pad - landBounds.minZ) / T));
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) if (tiles[b * tnx + a]) return true;
    return false;
  }
  const toLand = new Float32Array(n);
  {
    const big = 1e9;
    for (let i = 0; i < n; i++) toLand[i] = values[i] > 0 ? 0 : big;
    const a = cell, b = cell * Math.SQRT2;
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      let v = toLand[i];
      if (ix > 0) v = Math.min(v, toLand[i - 1] + a);
      if (iz > 0) {
        v = Math.min(v, toLand[i - nx] + a);
        if (ix > 0) v = Math.min(v, toLand[i - nx - 1] + b);
        if (ix < nx - 1) v = Math.min(v, toLand[i - nx + 1] + b);
      }
      toLand[i] = v;
    }
    for (let iz = nz - 1; iz >= 0; iz--) for (let ix = nx - 1; ix >= 0; ix--) {
      const i = iz * nx + ix;
      let v = toLand[i];
      if (ix < nx - 1) v = Math.min(v, toLand[i + 1] + a);
      if (iz < nz - 1) {
        v = Math.min(v, toLand[i + nx] + a);
        if (ix < nx - 1) v = Math.min(v, toLand[i + nx + 1] + b);
        if (ix > 0) v = Math.min(v, toLand[i + nx - 1] + b);
      }
      toLand[i] = v;
    }
  }
  const shoreField = new Float32Array(n);
  for (let i = 0; i < n; i++) shoreField[i] = values[i] > 0 ? Math.max(0, coastBound[i] - cell * 0.5) : -Math.max(0, toLand[i] - cell * 0.5);
  function shoreBeyond(x, z, distance) {
    const fx = Math.round((x - x0) / cell), fz = Math.round((z - z0) / cell);
    if (fx < 0 || fz < 0 || fx >= nx || fz >= nz) return false;
    return coastBound[fz * nx + fx] - 2 * cell > distance;
  }
  function mask(x, z) {
    return isLandExtent(x, z) ? smooth3(0, 1.5, landValue(x, z)) : 0;
  }
  function cliffBlendAt(x, z) {
    return smooth3(0.3, 0.9, bilinear2(slope, x, z));
  }
  function sample(x, z) {
    const r = normalizedRadius(x, z), land = isLandExtent(x, z);
    const result = {
      normalizedRadius: r,
      shoreRadius: 1,
      shoreDistance: 0,
      shoreX: 0,
      shoreZ: 0,
      shoreNormalX: 0,
      shoreNormalZ: 0,
      shoreFeature: "mainland",
      cliffBlend: 0,
      preserved: inKeep(x, z),
      withinExtent: land,
      boundaryKind: "ocean",
      boundaryStrength: 0,
      relief: 0
    };
    const distance = nearestDistance(x, z, result) * (land ? 1 : -1);
    result.shoreDistance = distance;
    result.shoreRadius = normalizedRadius(result.shoreX, result.shoreZ);
    const cliff = cliffBlendAt(result.shoreX, result.shoreZ);
    result.cliffBlend = land ? cliff : 0;
    if (land) {
      const steepHere = bilinear2(slope, x, z) > 0.75;
      result.boundaryKind = distance < 90 ? cliff > 0.5 ? "cliff-coast" : "beach" : steepHere ? "escarpment" : "inland";
      result.boundaryStrength = distance < 90 ? cliff : steepHere ? 0.5 : 0;
    }
    return result;
  }
  function isCliffRegion(x, z) {
    let fx = Math.round((x - x0) / cell), fz = Math.round((z - z0) / cell);
    if (fx < 0 || fz < 0 || fx >= nx || fz >= nz) return false;
    return steep[fz * nx + fx] === 1;
  }
  let seaInsideKeep = 0;
  for (let iz = 0; iz < nz; iz += 2) for (let ix = 0; ix < nx; ix += 2) {
    const i = iz * nx + ix, x = x0 + ix * cell, z = z0 + iz * cell;
    if (values[i] <= 0 && inKeep(x, z)) seaInsideKeep++;
  }
  const coastGeometry = Object.freeze({
    revision: 4,
    generated: true,
    rings: rings.length,
    mainlandSegments: rings[0]?.ring.length ?? 0,
    isletCount: islets.length,
    shoreSegments: segmentCount,
    nearestTreeDepth: maxTreeDepth,
    maxLeafSegments: 8,
    detailPhase: 0,
    bays: Object.freeze([]),
    islets: Object.freeze(islets),
    seaInsideKeep
  });
  return Object.freeze({
    params,
    seed,
    generated: true,
    coastPhases: Object.freeze([0, 0, 0]),
    coastGeometry,
    landBounds,
    boundaryZones: Object.freeze([]),
    keep,
    inKeep,
    shoreField,
    normalizedRadius,
    isLandExtent,
    intersectsLandBounds,
    mask,
    height: (x, z, baseHeight) => baseHeight(x, z),
    sample,
    shoreDistance,
    shoreBeyond,
    boundaryAt: sample,
    isCliffRegion,
    landValue
  });
}

// worldgen/build-model.js
var WORLD_MODEL_VERSION = "generated-island-v92-shape-1";
async function buildWorldModel(seed, { onProgress = null, useCache = true } = {}) {
  const started = performance.now();
  const loaded = await loadWorldData(seed, { onProgress, useCache });
  const data = loaded.data, t1 = performance.now();
  const finished = finishRivers(three_module_exports, data.rivers, { seaLevel: ISLAND_FRAME.seaLevel });
  const lakes = buildLakeShapes(data);
  const geography = deriveGeography(data);
  const island = createGeneratedIsland({ seed: data.seed, grid: data.grid, height: data.height, seaLevel: ISLAND_FRAME.seaLevel });
  const model = {
    layout: data.layout,
    grid: data.grid,
    height: data.height,
    fixed: data.fixed,
    coast: { weights: data.coastWeights, cliff: data.coastCliff, top: data.coastTop, shore: data.coastShore, stacks: data.coastStacks },
    swamps: data.swamps,
    swampIndex: data.swampIndex,
    swampDistance: data.swampDistance
  };
  const hydro = { lakeId: data.lakeId, lakes: data.lakes };
  const sampler = createTerrainSampler(model, hydro, finished.rivers);
  const t2 = performance.now();
  return Object.freeze({
    version: WORLD_MODEL_VERSION,
    seed: data.seed,
    data,
    rivers: finished.rivers,
    runs: finished.runs,
    waterfalls: finished.waterfalls,
    lakes,
    swamps: data.swamps,
    geography,
    island,
    sampler,
    start: START,
    seaLevel: ISLAND_FRAME.seaLevel,
    timings: Object.freeze({ source: loaded.source, loadMs: loaded.ms, buildMs: Math.round(t2 - t1), totalMs: Math.round(t2 - started), generationMs: data.generationMs })
  });
}

// world-model.js
async function startupProgress() {
  if (!globalThis.document) return null;
  try {
    const { getStartupLoadingProgress } = await import("./chunk-EEGTPTU2.js");
    return getStartupLoadingProgress();
  } catch {
    return null;
  }
}
var progress = await startupProgress();
progress?.report("terrain", { detail: "島の地形を生成しています" });
var worldModel = await buildWorldModel(ACTIVE_WORLD_SEED, { onProgress: (value) => {
  progress?.report("terrain", { detail: `島の地形を生成しています（侵食と川の計算 ${Math.round(value * 100)}%）` });
} });
progress?.report("terrain", { detail: worldModel.timings.source === "cache" ? "保存済みの島の地形を読み込みました" : "島の地形を生成しました" });

// island-biomes.js
var ISLAND_BIOME_SEED = ACTIVE_WORLD_SEED;
var BIOME_IDS = Object.freeze({ forest: 0, meadow: 1, snow: 2, ash: 3, swamp: 4 });
var MEADOW_TREES = Object.freeze({ lone: 0.028, grove: 0.32, from: 0.66, to: 0.82 });
var clamp3 = (v) => Math.max(0, Math.min(1, v));
var smooth4 = (a, b, x) => {
  const t = clamp3((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var mix2 = (a, b, t) => a + (b - a) * t;
function hash(seed, x, z = 0, salt = 0) {
  let h = (seed ^ Math.imul(x, 73244475) ^ Math.imul(z, 295559667) ^ Math.imul(salt, 668265261)) >>> 0;
  h = Math.imul(h ^ h >>> 16, 2146121005);
  h = Math.imul(h ^ h >>> 15, 2221713035);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function noise(seed, x, z, salt) {
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth4(0, 1, x - ix), v = smooth4(0, 1, z - iz);
  return mix2(mix2(hash(seed, ix, iz, salt), hash(seed, ix + 1, iz, salt), u), mix2(hash(seed, ix, iz + 1, salt), hash(seed, ix + 1, iz + 1, salt), u), v);
}
function wetlandRadius(p, x, z) {
  const dx = x - p.center.x, dz = z - p.center.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw), u = (dx * c + dz * s) / p.radiusX, v = (-dx * s + dz * c) / p.radiusZ;
  return Math.hypot(u, v);
}
var ellipseRadius = (e, x, z) => {
  const dx = x - e.center.x, dz = z - e.center.z;
  return Math.hypot((dx * e.cos + dz * e.sin) / e.radiusX, (-dx * e.sin + dz * e.cos) / e.radiusZ);
};
var freezeEllipse = (e) => Object.freeze({ ...e, center: Object.freeze({ x: e.center.x, z: e.center.z }), cos: Math.cos(e.yaw), sin: Math.sin(e.yaw) });
function createIslandBiomes({ seed = ISLAND_BIOME_SEED, geography = worldModel.geography, island = worldModel.island } = {}) {
  seed = seed >>> 0;
  const mountains = Object.freeze(geography.mountains.slice(0, 4).map(freezeEllipse));
  const snowLine = geography.snowLine;
  const main = mountains[0];
  const mountain = Object.freeze({ id: "frostbound-massif", name: "白銀の連峰", center: main.center, radiusX: main.radiusX, radiusZ: main.radiusZ, yaw: main.yaw, snowLine });
  const ashland = freezeEllipse({ ...geography.ashland });
  const wetlands = Object.freeze(geography.fens.map((f2, i) => {
    const extent = Math.hypot(f2.radiusX, f2.radiusZ) * 1.18;
    return Object.freeze({
      id: f2.id,
      name: f2.name || "霧葦の沼地",
      center: Object.freeze({ ...f2.center }),
      radiusX: f2.radiusX,
      radiusZ: f2.radiusZ,
      yaw: f2.yaw,
      level: f2.level,
      phase: hash(seed, 20 + i * 10 + 4, 0, 909) * Math.PI * 2,
      placeholder: !!f2.placeholder,
      bounds: Object.freeze({ minX: f2.center.x - extent, maxX: f2.center.x + extent, minZ: f2.center.z - extent, maxZ: f2.center.z + extent })
    });
  }));
  function mountainMask(x, z) {
    let m = 0;
    for (const e of mountains) m = Math.max(m, 1 - smooth4(0.6, 1.13, ellipseRadius(e, x, z)));
    return m;
  }
  function ashMask(x, z) {
    const ox = x - ashland.center.x, oz = z - ashland.center.z, dx = (ox * ashland.cos + oz * ashland.sin) / ashland.radiusX, dz = (-ox * ashland.sin + oz * ashland.cos) / ashland.radiusZ;
    if (Math.abs(dx) >= 1.17 || Math.abs(dz) >= 1.17) return 0;
    const warp = (noise(seed, x / 280, z / 280, 205) - 0.5) * 0.18;
    return 1 - smooth4(0.58, 1.08, Math.hypot(dx, dz) + warp);
  }
  function swampMask(x, z) {
    let weight = 0;
    for (let i = 0; i < wetlands.length; i++) weight = Math.max(weight, 1 - smooth4(0.74, 1.18, wetlandRadius(wetlands[i], x, z)));
    return weight;
  }
  function meadowTrees(x, z) {
    const grove = noise(seed, x / 95 + 5.3, z / 85 - 2.9, 407) * 0.7 + noise(seed, x / 37 - 1.7, z / 33 + 6.1, 408) * 0.3;
    return MEADOW_TREES.lone + MEADOW_TREES.grove * smooth4(MEADOW_TREES.from, MEADOW_TREES.to, grove);
  }
  function wetlandAt(x, z, out = {}) {
    let best = null, weight = 0, radius = Infinity;
    for (let i = 0; i < wetlands.length; i++) {
      const p = wetlands[i], r = wetlandRadius(p, x, z), w = 1 - smooth4(0.62, 1.18, r);
      if (w > weight) {
        best = p;
        weight = w;
        radius = r;
      }
    }
    if (!best) return null;
    out.descriptor = best;
    out.id = best.id;
    out.weight = weight;
    out.radius = radius;
    out.level = best.level;
    return out;
  }
  const terrainHeight = (x, z, original) => original, mountainRelief = () => 0;
  const climateQuantiles = [];
  const landBox = island?.generated ? island.landBounds : null;
  for (let iz = 0; iz < 32; iz++) for (let ix = 0; ix < 32; ix++) {
    let x, z;
    if (landBox) {
      x = landBox.minX + (ix + 0.5) / 32 * (landBox.maxX - landBox.minX);
      z = landBox.minZ + (iz + 0.5) / 32 * (landBox.maxZ - landBox.minZ);
      if (!island.isLandExtent(x, z)) continue;
    } else {
      const u = (ix + 0.5) / 16 - 1, v = (iz + 0.5) / 16 - 1;
      if (u * u + v * v >= 1) continue;
      x = u * 1800;
      z = -128 + v * 1920;
    }
    climateQuantiles.push(noise(seed, x / 420 + 13, z / 410 - 11, 405) * 0.72 + noise(seed, x / 170 - 3, z / 160 + 7, 406) * 0.28);
  }
  climateQuantiles.sort((a, b) => a - b);
  const meadowThreshold = climateQuantiles[Math.floor(climateQuantiles.length * 0.71)];
  function sample(x, z, altitude, out = {}) {
    const mt = mountainMask(x, z), h = Number.isFinite(altitude) ? altitude : snowLine - 120, line = snowLine + (mt > 0 ? (noise(seed, x / 240, z / 220, 403) - 0.5) * 34 : 0);
    const snow = mt * smooth4(line - 35, line + 52, h), ashBase = ashMask(x, z), swampBase = swampMask(x, z), ash = ashBase * (1 - snow), swamp = swampBase * (1 - snow) * (1 - ashBase);
    const openNoise = noise(seed, x / 420 + 13, z / 410 - 11, 405) * 0.72 + noise(seed, x / 170 - 3, z / 160 + 7, 406) * 0.28;
    const meadowCover = smooth4(meadowThreshold - 0.085, meadowThreshold + 0.085, openNoise), remaining = (1 - snow) * (1 - ashBase) * (1 - swampBase);
    const meadow = remaining * meadowCover, forest = remaining * (1 - meadowCover);
    let id = 0, best = forest;
    if (meadow > best) {
      id = 1;
      best = meadow;
    }
    if (snow > best) {
      id = 2;
      best = snow;
    }
    if (ash > best) {
      id = 3;
      best = ash;
    }
    if (swamp > best) id = 4;
    out.id = id;
    out.forest = forest;
    out.meadow = meadow;
    out.snow = snow;
    out.ash = ash;
    out.swamp = swamp;
    out.mountain = mt;
    out.snowLine = line;
    const treeline = 1 - mt * smooth4(snowLine - 110, snowLine + 60, h);
    out.meadowTrees = meadow > 0 ? meadowTrees(x, z) : MEADOW_TREES.lone;
    out.treeDensity = clamp3((forest * 0.92 + meadow * out.meadowTrees + snow * 0.025 + swamp * 0.28 + ash * 0.025) * treeline);
    out.swampRegionId = null;
    if (swamp > 0) {
      for (let i = 0; i < wetlands.length; i++) if (wetlandRadius(wetlands[i], x, z) < 1.18) {
        out.swampRegionId = wetlands[i].id;
        break;
      }
    }
    return out;
  }
  const scalarScratch = {};
  function biomeId(x, z, altitude) {
    return sample(x, z, altitude, scalarScratch).id;
  }
  return Object.freeze({
    seed,
    generated: true,
    meadowThreshold,
    snowLine,
    mountain,
    mountains,
    ashland,
    wetlands,
    ridges: Object.freeze([]),
    upperCatchments: Object.freeze([]),
    massifStructure: null,
    sample,
    biomeId,
    terrainHeight,
    mountainRelief,
    mountainMask,
    ashMask,
    swampMask,
    wetlandAt,
    meadowTrees
  });
}
var islandBiomes = createIslandBiomes();
function sampleIslandBiome(x, z, altitude, out) {
  return islandBiomes.sample(x, z, altitude, out);
}
function createIslandBiomeGLSL(geography = islandBiomes) {
  const f2 = (n) => Number(n).toFixed(9), a = geography.ashland;
  const mountainTerms = geography.mountains.map((e) => `islandEllipse(p,vec2(${f2(e.center.x)},${f2(e.center.z)}),vec2(${f2(e.radiusX)},${f2(e.radiusZ)}),${f2(Math.cos(e.yaw))},${f2(Math.sin(e.yaw))})`);
  const mountainExpr = mountainTerms.reduce((acc, t) => acc === null ? t : `max(${acc},${t})`, null) || "0.0";
  const wetlands = geography.wetlands.map((p) => `islandFenMask(p,vec2(${f2(p.center.x)},${f2(p.center.z)}),vec2(${f2(p.radiusX)},${f2(p.radiusZ)}),${f2(p.yaw)})`);
  const swampExpr = wetlands.reduce((acc, t) => acc === null ? t : `max(${acc},${t})`, null) || "0.0";
  return `
 #ifndef ISLAND_BIOMES_V31
 #define ISLAND_BIOMES_V31
 float islandSmooth(float a,float b,float x){float t=clamp((x-a)/(b-a),0.0,1.0);return t*t*t*(t*(t*6.0-15.0)+10.0);}
 float islandHash(ivec2 p,uint salt){uint h=${geography.seed}u ^ uint(p.x)*0x45d9f3bu ^ uint(p.y)*0x119de1f3u ^ salt*0x27d4eb2du;h=(h^(h>>16u))*0x7feb352du;h=(h^(h>>15u))*0x846ca68bu;return float(h^(h>>16u))/4294967296.0;}
 float islandNoise(vec2 p,uint salt){ivec2 i=ivec2(floor(p));vec2 q=fract(p);vec2 u=vec2(islandSmooth(0.0,1.0,q.x),islandSmooth(0.0,1.0,q.y));return mix(mix(islandHash(i,salt),islandHash(i+ivec2(1,0),salt),u.x),mix(islandHash(i+ivec2(0,1),salt),islandHash(i+ivec2(1,1),salt),u.x),u.y);}
 float islandEllipse(vec2 p,vec2 center,vec2 radius,float c,float s){vec2 d=p-center;return 1.0-islandSmooth(.60,1.13,length(vec2(d.x*c+d.y*s,-d.x*s+d.y*c)/radius));}
 float islandMountainAt(vec2 p){return ${mountainExpr};}
 float islandSnowAt(vec2 p,float altitude){float mt=islandMountainAt(p);if(mt<=0.0)return 0.0;float line=${f2(geography.snowLine)}+(islandNoise(p/vec2(240.0,220.0),403u)-.5)*34.0;return mt*islandSmooth(line-35.0,line+52.0,altitude);}
 float islandSnow(vec3 p){return islandSnowAt(p.xz,p.y);}
 float islandAshAt(vec2 p){vec2 q=p-vec2(${f2(a.center.x)},${f2(a.center.z)});float c=${f2(Math.cos(a.yaw))},s=${f2(Math.sin(a.yaw))};vec2 d=vec2(q.x*c+q.y*s,-q.x*s+q.y*c)/vec2(${f2(a.radiusX)},${f2(a.radiusZ)});if(abs(d.x)>=1.17||abs(d.y)>=1.17)return 0.0;float warp=(islandNoise(p/280.0,205u)-.5)*.18;return 1.0-islandSmooth(.58,1.08,length(d)+warp);}
 float islandFenMask(vec2 p,vec2 center,vec2 radius,float yaw){vec2 d=p-center;float c=cos(yaw),s=sin(yaw);return 1.0-islandSmooth(.74,1.18,length(vec2(d.x*c+d.y*s,-d.x*s+d.y*c)/radius));}
 float islandSwampAt(vec2 p){return ${swampExpr};}
 struct IslandClimate{float forest;float meadow;float snow;float ash;float swamp;float mountain;};
 float islandMeadowTrees(vec2 p){float grove=islandNoise(p/vec2(95.0,85.0)+vec2(5.3,-2.9),407u)*.7+islandNoise(p/vec2(37.0,33.0)+vec2(-1.7,6.1),408u)*.3;return ${f2(MEADOW_TREES.lone)}+${f2(MEADOW_TREES.grove)}*islandSmooth(${f2(MEADOW_TREES.from)},${f2(MEADOW_TREES.to)},grove);}
 IslandClimate islandClimate(vec3 p){float snow=islandSnow(p),a=islandAshAt(p.xz),s=islandSwampAt(p.xz),n=islandNoise(p.xz/vec2(420.0,410.0)+vec2(13.0,-11.0),405u)*.72+islandNoise(p.xz/vec2(170.0,160.0)+vec2(-3.0,7.0),406u)*.28;float meadow=islandSmooth(${f2(geography.meadowThreshold - 0.085)},${f2(geography.meadowThreshold + 0.085)},n),rest=(1.0-snow)*(1.0-a)*(1.0-s);return IslandClimate(rest*(1.0-meadow),rest*meadow,snow,a*(1.0-snow),s*(1.0-snow)*(1.0-a),islandMountainAt(p.xz));}
 #endif
 `;
}
var islandBiomeGLSL = createIslandBiomeGLSL();
var ISLAND_BIOME_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 0, name: "エルダーウッドの森", en: "ELDERWOOD FOREST", color: 5005888, tree: 2444088, weather: "木漏れ日" }),
  Object.freeze({ id: 1, name: "黄金の草原", en: "GOLDEN MEADOWS", color: 9078097, tree: 5530432, weather: "そよ風" }),
  Object.freeze({ id: 2, name: "白銀の連峰", en: "FROSTBOUND MOUNTAINS", color: 12765637, tree: 5400935, weather: "雪" }),
  Object.freeze({ id: 3, name: "灰燼の荒野", en: "ASHEN BASIN", color: 9201232, tree: 6508605, weather: "乾いた風" }),
  Object.freeze({ id: 4, name: "霧葦の沼地", en: "MISTREED FEN", color: 4611142, tree: 4216645, weather: "湿った風" })
]);

// meadow-field.js
var MEADOW_AFAR = Object.freeze({ near: 60, far: 380, brightness: 0.58, saturation: 0.78, tint: Object.freeze([0.92, 1, 0.84]), sheen: 0.5, strength: 1 });
var MEADOW_FIELD = Object.freeze({
  revision: "meadow-field-v4-afar",
  // Climate meadow value over which the sward takes over from forest grass.
  climate: [0.12, 0.62],
  // Gust bands: along-wind and across-wind sizes (m) of two octaves. The
  // along-wind travel wraps after `period` metres (both octaves repeat there).
  gust: Object.freeze({ along: [13, 41], across: [29, 67] }),
  period: 13 * 41 * 256,
  // Wind travel speed (m/s) at strength 0 and 1.
  speed: [2.2, 7.5]
});
var meadowUniforms = {
  // x, y: unit direction (world x, z) the wind blows towards; z: strength
  // 0..1; w: distance the gusts have travelled (m, wrapped at MEADOW_FIELD.period).
  meadowWind: { value: new Vector4(0.8, 0.6, 0.35, 0) },
  meadowTime: { value: 0 },
  // Blade field: x = radius (0 when off), y = blade density scale.
  meadowRange: { value: new Vector2(0, 1) },
  // Baked field around the player (meadow-grass.js): R climate weight of the
  // blades (cards hide there), G gold, B tall grass, A flowers.
  meadowField: { value: null },
  // Field origin x, z; 1 / size; 1 once baked.
  meadowFieldRect: { value: new Vector4(0, 0, 1, 0) }
};
var f = (v) => Number(v).toFixed(6);
var MEADOW_GUST_GLSL = `
 #ifndef MEADOW_GUST_V1
 #define MEADOW_GUST_V1
 // Periodic value noise (256 cells) for the travelling gusts.
 float meadowHash(ivec2 p){p=p&255;uint h=uint(p.x)*0x45d9f3bu^uint(p.y)*0x119de1f3u^0x5bd1e995u;h=(h^(h>>16u))*0x7feb352du;h=(h^(h>>15u))*0x846ca68bu;return float(h^(h>>16u))/4294967296.;}
 float meadowNoise(vec2 p){vec2 i=floor(p),q=fract(p);vec2 u=q*q*(3.-2.*q);ivec2 c=ivec2(i);
  return mix(mix(meadowHash(c),meadowHash(c+ivec2(1,0)),u.x),mix(meadowHash(c+ivec2(0,1)),meadowHash(c+ivec2(1,1)),u.x),u.y);}
 // Gust strength 0..1: bands of stronger wind, long across the wind,
 // travelling downwind.
 float meadowGust(vec2 xz,vec4 wind){
  vec2 q=vec2(dot(xz,wind.xy)-wind.w,dot(xz,vec2(-wind.y,wind.x)));
  float g=meadowNoise(q*vec2(${f(1 / MEADOW_FIELD.gust.along[0])},${f(1 / MEADOW_FIELD.gust.across[0])}))*.62
   +meadowNoise(q*vec2(${f(1 / MEADOW_FIELD.gust.along[1])},${f(1 / MEADOW_FIELD.gust.across[1])})+vec2(17.3,5.1))*.38;
  float t=clamp((g-.30)/.50,0.,1.);return t*t*t*(t*(t*6.-15.)+10.);
 }
 // World x, z sway of a plant rooted at root, per metre the plant bends:
 // downwind lean with the wind and its gusts plus a swing of period seconds
 // (whole divisors of the hour the time wraps at), up to about 1.2 in the
 // strongest gusts of a storm.
 vec2 meadowSway(vec2 root,float phase,float period,vec4 wind,float time){
  float gust=meadowGust(root,wind),lean=wind.z*(.2+.8*gust);
  float swing=sin(time*${f(2 * Math.PI)}/period+phase)*(.12+.3*wind.z)*(.5+.5*gust);
  return wind.xy*(lean+swing)+vec2(-wind.y,wind.x)*swing*.35;
 }
 #endif
`;
var MEADOW_FIELD_GLSL = `
 #ifndef MEADOW_FIELD_V2
 #define MEADOW_FIELD_V2
 ${MEADOW_GUST_GLSL}
 float meadowWeight(float meadow){return islandSmooth(${f(MEADOW_FIELD.climate[0])},${f(MEADOW_FIELD.climate[1])},meadow);}
 // 0 fresh green .. 1 ripe gold. Open dry meadow ripens; the sward stays
 // green towards the forest edge and where the ground holds water.
 float meadowGolden(vec2 xz,float meadow,float moisture){
  float broad=islandNoise(xz/vec2(310.,270.)+vec2(31.7,-12.4),611u),patchy=islandNoise(xz/vec2(47.,41.)+vec2(-7.1,19.3),612u);
  float g=mix(.42,1.,islandSmooth(.22,.78,broad*.62+patchy*.38));
  g*=islandSmooth(.20,.90,meadow);
  return g*(1.-.88*islandSmooth(.16,.62,moisture));
 }
 // Tall grass stands (a few metres across).
 float meadowTall(vec2 xz){
  return islandSmooth(.54,.80,islandNoise(xz/vec2(7.3,6.1)+vec2(3.7,-8.2),613u)*.64+islandNoise(xz/vec2(23.,19.)+vec2(-2.9,4.4),614u)*.36);
 }
 // Flower patches (about ten metres) ...
 float meadowFlowers(vec2 xz){
  return islandSmooth(.61,.79,islandNoise(xz/vec2(9.,11.)+vec2(5.1,2.3),615u)*.56+islandNoise(xz/vec2(31.,27.)+vec2(-6.6,9.2),616u)*.44);
 }
 // ... and which flower grows there: daisy, buttercup, clover, cranesbill.
 vec3 meadowFlowerColor(vec2 xz){
  float s=islandNoise(xz/vec2(43.,37.)+vec2(1.3,-4.7),617u);
  vec3 c=s<.38?vec3(.78,.78,.72):s<.56?vec3(.86,.60,.05):s<.72?vec3(.62,.20,.33):vec3(.30,.17,.60);
  return c;
 }
 // Linear albedo of a blade's tip and base for a gold value; v varies a blade.
 vec3 meadowTipColor(float golden,float v){
  vec3 c=mix(vec3(.085,.160,.040),vec3(.165,.190,.055),islandSmooth(0.,.45,golden));
  c=mix(c,vec3(.50,.345,.085),islandSmooth(.38,.86,golden));
  return mix(c,vec3(.62,.50,.22),islandSmooth(.72,1.,golden)*v*.75);
 }
 vec3 meadowBaseColor(float golden){return mix(vec3(.030,.055,.016),vec3(.068,.058,.022),golden);}
 // How much of the from-afar settling applies at d metres (v93), and the colour after it.
 float meadowAfarWeight(float d){return ${f(MEADOW_AFAR.strength)}*islandSmooth(${f(MEADOW_AFAR.near)},${f(MEADOW_AFAR.far)},d);}
 vec3 meadowAfar(vec3 c,float k){float l=dot(c,vec3(.2126,.7152,.0722));return mix(c,mix(vec3(l),c,${f(MEADOW_AFAR.saturation)})*${f(MEADOW_AFAR.brightness)}*vec3(${MEADOW_AFAR.tint.map(f).join(",")}),k);}
 // Patches of the sward, a few metres to twenty across with ragged edges:
 // x where it grows denser and darker (-1) or finer and paler (1), y where its
 // grasses lean blue-green (-1) or yellow-green (1). The finer half fades out
 // once a pixel covers it (foot: metres per pixel; 0 for the blades).
 vec2 meadowPatch(vec2 xz,float foot){
  vec2 warp=vec2(islandNoise(xz/vec2(21.,17.)+vec2(4.1,-2.2),631u),islandNoise(xz/vec2(17.,21.)+vec2(-6.3,3.7),632u))-.5;
  vec2 p=xz+warp*4.5;
  float fine=1.-islandSmooth(.25,.6,foot/3.),d=.5,s=.5;
  if(fine>0.){d=mix(.5,islandNoise(p/vec2(3.3,2.9)+vec2(-2.4,.8),634u),fine);s=mix(.5,islandNoise(p/vec2(6.4,5.6)+vec2(3.3,-7.7),636u),fine);}
  d=islandNoise(p/vec2(9.1,7.7)+vec2(1.7,5.9),633u)*.64+d*.36;
  s=islandNoise(p/vec2(19.,15.)+vec2(-5.2,2.6),635u)*.72+s*.28;
  return vec2(islandSmooth(.33,.67,d),islandSmooth(.36,.64,s))*2.-1.;
 }
 // Broad tone over fifty to a hundred and fifty metres, apart from the gold:
 // lusher and darker (0) or thinner and lighter (1).
 float meadowTone(vec2 xz){
  return islandNoise(xz/vec2(137.,117.)+vec2(-3.3,6.6),637u)*.6+islandNoise(xz/vec2(51.,57.)+vec2(5.5,-1.4),638u)*.4;
 }
 // Colour factor of the patches and the tone on a sward of this gold: denser
 // patches darker and greener, finer ones paler, the grasses' hue and the
 // broad tone; each about 1 on average, so the sward keeps its colour.
 vec3 meadowPatchTint(vec2 kind,float tone,float golden){
  return 1.+kind.x*vec3(.18,.12,.18)+kind.y*vec3(.06,.02,-.06)*(1.-.5*golden)+(islandSmooth(.2,.8,tone)*2.-1.)*vec3(.08,.06,.04);
 }
 #endif
`;
function meadowFieldSource() {
  return islandBiomeGLSL + MEADOW_FIELD_GLSL;
}
var quintic = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var weightScratch = {};
function meadowChunkWeights(world, chunk) {
  if (chunk.meadowWeights) return chunk.meadowWeights;
  const f2 = world.terrainFunctions, weights = new Float32Array(81);
  for (let iz = 0; iz <= 8; iz++) for (let ix = 0; ix <= 8; ix++) {
    const x = chunk.cx * 64 + ix * 8, z = chunk.cz * 64 + iz * 8, climate = f2?.climate?.(x, z, f2.height(x, z), weightScratch);
    weights[iz * 9 + ix] = climate ? quintic(MEADOW_FIELD.climate[0], MEADOW_FIELD.climate[1], climate.meadow) : 0;
  }
  return chunk.meadowWeights = weights;
}
function grassCleared(world, x, z) {
  const list = world.grassClearings;
  if (!list?.length) return false;
  for (const c of list) if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < c.r * c.r) return true;
  return false;
}
function meadowCardFilter(world, chunk) {
  const radius = meadowUniforms.meadowRange.value.x * 0.8;
  if (!(radius > 0) || meadowUniforms.meadowFieldRect.value.w < 0.5 || world.inDungeon || !chunk) return null;
  const weights = meadowChunkWeights(world, chunk), x0 = chunk.cx * 64, z0 = chunk.cz * 64;
  let any = false;
  for (const w of weights) if (w > 0) {
    any = true;
    break;
  }
  if (!any) return null;
  return (x, z, phase2, distance) => {
    if (!(distance < radius)) return false;
    const gx = Math.min(7.999, Math.max(0, (x - x0) / 8)), gz = Math.min(7.999, Math.max(0, (z - z0) / 8)), ix = gx | 0, iz = gz | 0, u = gx - ix, v = gz - iz, i = iz * 9 + ix;
    const w = (weights[i] * (1 - u) + weights[i + 1] * u) * (1 - v) + (weights[i + 9] * (1 - u) + weights[i + 10] * u) * v;
    const p = phase2 * 7.13 + 0.31;
    return p - Math.floor(p) < w;
  };
}
var sharedWind = null;
function stepMeadowWind(time, weather) {
  (sharedWind ??= createMeadowWind())(time, weather);
}
function createMeadowWind() {
  let travel = 0, dirX = 0.8, dirZ = 0.6, strength = 0.35, last = null;
  return function update(time, weather) {
    const dt = last === null ? 0 : Math.min(0.25, Math.max(0, time - last));
    last = time;
    const targetX = Number.isFinite(weather?.windX) ? weather.windX : 0.8, targetZ = Number.isFinite(weather?.windZ) ? weather.windZ : 0.6;
    const targetStrength = Math.min(1, Math.max(0.08, Number.isFinite(weather?.wind) ? 0.12 + weather.wind * 0.95 : 0.35));
    const k = 1 - Math.exp(-dt / 2.5);
    dirX += (targetX - dirX) * k;
    dirZ += (targetZ - dirZ) * k;
    strength += (targetStrength - strength) * k;
    const l = Math.hypot(dirX, dirZ) || 1;
    travel = (travel + dt * (MEADOW_FIELD.speed[0] + (MEADOW_FIELD.speed[1] - MEADOW_FIELD.speed[0]) * strength)) % MEADOW_FIELD.period;
    meadowUniforms.meadowWind.value.set(dirX / l, dirZ / l, strength, travel);
    meadowUniforms.meadowTime.value = time % 3600;
  };
}

export {
  createIslandTerrain,
  worldModel,
  ISLAND_BIOME_SEED,
  islandBiomes,
  sampleIslandBiome,
  islandBiomeGLSL,
  ISLAND_BIOME_DEFINITIONS,
  MEADOW_AFAR,
  MEADOW_FIELD,
  meadowUniforms,
  MEADOW_GUST_GLSL,
  MEADOW_FIELD_GLSL,
  meadowFieldSource,
  meadowChunkWeights,
  grassCleared,
  meadowCardFilter,
  stepMeadowWind,
  createMeadowWind
};
