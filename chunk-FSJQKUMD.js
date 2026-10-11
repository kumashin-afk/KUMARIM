// tree-sprays.js
var TREE_SPRAYS = { "pine": [{ "shape": "a", "center": [0.001979503780603409, 0.17954716086387634, -0.021088982000947], "right": [1, 0, 0], "up": [0, 1, 0], "normal": [0, 0, 1], "size": 0.3976170801743865, "uvMin": [0, 0.5], "uvMax": [0.5, 1] }, { "shape": "a", "center": [0.001979503780603409, 0.17954716086387634, -0.021088982000947], "right": [0, 1, 0], "up": [0, 0, 1], "normal": [1, 0, 0], "size": 0.3976170801743865, "uvMin": [0, 0], "uvMax": [0.5, 0.5] }, { "shape": "b", "center": [-0.005800366401672363, 0.1658625453710556, -0.021391622722148895], "right": [1, 0, 0], "up": [0, 1, 0], "normal": [0, 0, 1], "size": 0.3921792007610202, "uvMin": [0.5, 0.5], "uvMax": [1, 1] }, { "shape": "b", "center": [-0.005800366401672363, 0.1658625453710556, -0.021391622722148895], "right": [0, 1, 0], "up": [0, 0, 1], "normal": [1, 0, 0], "size": 0.3921792007610202, "uvMin": [0.5, 0], "uvMax": [1, 0.5] }], "broadleaf": [{ "shape": "a", "center": [-0.005044654011726379, 0.09350273758172989, -0.023000609129667282], "right": [1, 0, 0], "up": [0, 1, 0], "normal": [0, 0, 1], "size": 0.20379173033405096, "uvMin": [0, 0.5], "uvMax": [0.3333333333333333, 1] }, { "shape": "a", "center": [-0.005044654011726379, 0.09350273758172989, -0.023000609129667282], "right": [0, 1, 0], "up": [0, 0, 1], "normal": [1, 0, 0], "size": 0.20379173033405096, "uvMin": [0, 0], "uvMax": [0.3333333333333333, 0.5] }, { "shape": "b", "center": [0.008118648082017899, 0.11169348657131195, 0.022979136556386948], "right": [1, 0, 0], "up": [0, 1, 0], "normal": [0, 0, 1], "size": 0.23775799978582654, "uvMin": [0.3333333333333333, 0.5], "uvMax": [0.6666666666666666, 1] }, { "shape": "b", "center": [0.008118648082017899, 0.11169348657131195, 0.022979136556386948], "right": [0, 1, 0], "up": [0, 0, 1], "normal": [1, 0, 0], "size": 0.23775799978582654, "uvMin": [0.3333333333333333, 0], "uvMax": [0.6666666666666666, 0.5] }, { "shape": "c", "center": [0.03135611116886139, 0.1285075843334198, 0.010281726717948914], "right": [1, 0, 0], "up": [0, 1, 0], "normal": [0, 0, 1], "size": 0.2749823421915062, "uvMin": [0.6666666666666666, 0.5], "uvMax": [1, 1] }, { "shape": "c", "center": [0.03135611116886139, 0.1285075843334198, 0.010281726717948914], "right": [0, 1, 0], "up": [0, 0, 1], "normal": [1, 0, 0], "size": 0.2749823421915062, "uvMin": [0.6666666666666666, 0], "uvMax": [1, 0.5] }] };

// tree-generator.js
var TREE_GENERATOR_VERSION = 2;
var TREE_HEIGHTS = { pine: 20.39948081970215, broadleaf: 21.005704879760742 };
var TREE_LIMITS = { pine: { near: 13756, far: 4679, far2: 1600 }, broadleaf: { near: 9e3, far: 3e3, far2: 1600 } };
var FAR2_ANCHOR_STRIDE = 3;
var FAR2_CARD_SCALE = Math.sqrt(FAR2_ANCHOR_STRIDE);
var TAU = Math.PI * 2;
var add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
var sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
var mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
var length = (a) => Math.hypot(...a);
var unit = (a) => mul(a, 1 / Math.max(1e-12, length(a)));
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function treeHash(...keys) {
  let h = 2166136261;
  for (const c of keys.join("|")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 2146121005);
  h ^= h >>> 15;
  h = Math.imul(h, 2221713035);
  return (h ^ h >>> 16) >>> 0;
}
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function curvePoint(e, t) {
  const s = 1 - t;
  return add(add(mul(e.p[0], s * s * s), mul(e.p[1], 3 * s * s * t)), add(mul(e.p[2], 3 * s * t * t), mul(e.p[3], t * t * t)));
}
function curveTangent(e, t) {
  const s = 1 - t;
  return unit(add(add(mul(sub(e.p[1], e.p[0]), 3 * s * s), mul(sub(e.p[2], e.p[1]), 6 * s * t)), mul(sub(e.p[3], e.p[2]), 3 * t * t)));
}
function arcTable(e) {
  const a = [0];
  let p = e.p[0];
  for (let i = 1; i <= 64; i++) {
    const q = curvePoint(e, i / 64);
    a.push(a[i - 1] + length(sub(q, p)));
    p = q;
  }
  return a;
}
function edge(graph, id, parent, p, r0, r1, detail, options = {}) {
  const e = { id, parent, p, r0, r1, detail, ...options };
  e.arc = arcTable(e);
  graph.push(e);
  return e;
}
function trunkPine(r, H) {
  const az = r() * TAU, amp = 0.45 + r() * 0.8;
  return [[0, 0, 0], [0, H * 0.28, 0], [Math.cos(az) * amp, H * 0.7, Math.sin(az) * amp * 0.8], [Math.cos(az + 0.4) * amp * 1.25, H - 0.65, Math.sin(az + 0.4) * amp]];
}
function frames(dir, roll = 0) {
  const ref = Math.abs(dir[1]) > 0.93 ? [1, 0, 0] : [0, 1, 0];
  let right = unit(cross(dir, ref)), up = unit(cross(right, dir));
  const c = Math.cos(roll), s = Math.sin(roll);
  return { right: add(mul(right, c), mul(up, s)), up: add(mul(up, c), mul(right, -s)), dir };
}
function local(f, v) {
  return add(add(mul(f.right, v[0]), mul(f.dir, v[1])), mul(f.up, v[2]));
}
function pineGraph(r, H) {
  const graph = [], anchors = [], roots = [];
  const main = edge(graph, 0, -1, trunkPine(r, H), 0.285 + r() * 0.025, 0.016, "trunk", { rootLobes: 5, phase: r() * TAU });
  const start = 6.2 + r() * 2.8, tiers = 11 + Math.floor(r() * 2.6), crownRadius = 2.35 + r() * 0.75, phase = r() * TAU;
  for (let level = 0; level < tiers; level++) {
    const u = level / (tiers - 1), y = start + (H - 1.5 - start) * u, t = clamp(y / (H - 0.65), 0, 1), branchCount = level > tiers - 3 ? 3 : 4 + Math.floor(r() * 2), radius = crownRadius * Math.pow(1 - u, 0.6) * (0.7 + 0.7 * Math.sin(u * Math.PI)) + 0.2;
    for (let j = 0; j < branchCount; j++) {
      if (level < 2 && r() < 0.2) continue;
      const branchT = clamp(t + Math.sin(j * 2.7 + level * 1.33 + phase) * 0.035 * (1 - u * 0.45), 0, 0.995), base = curvePoint(main, branchT), az = phase + level * 2.13 + j * TAU / branchCount + (r() - 0.5) * 0.45, dir = [Math.cos(az), 0, Math.sin(az)], span = radius * (0.72 + r() * 0.42), rise = (-0.4 + r() * 0.58) * span + 0.16;
      const end = add(base, [dir[0] * span, rise, dir[2] * span]);
      const primary = edge(graph, graph.length, main.id, [base, add(base, [dir[0] * span * 0.31, -0.2 * (1 - u), dir[2] * span * 0.31]), add(base, [dir[0] * span * 0.76, -0.5 * (1 - u) + rise * 0.2, dir[2] * span * 0.76]), end], (0.065 + r() * 0.025) * (1 - u * 0.7), 8e-3, "primary", { parentT: branchT });
      const shoots = 5 + Math.floor(span * 1.4), pf = frames(unit(sub(end, base)));
      for (let k = 0; k < shoots; k++) {
        const v = 0.12 + (k + 0.25 + r() * 0.5) / shoots * 0.84, p = curvePoint(primary, v), sign = k % 2 ? 1 : -1;
        const sd = unit(add(add(mul(dir, 0.35 + r() * 0.3), mul(pf.right, sign * (0.5 + r() * 0.45))), [0, -0.55 + r() * 1.2, 0]));
        const sl = (0.85 + r() * 0.75) * (1 - u * 0.5), tip = add(p, mul(sd, sl));
        const twig = edge(graph, graph.length, primary.id, [p, add(p, mul(sd, sl * 0.32)), add(p, add(mul(sd, sl * 0.78), [0, -0.09, 0])), tip], 0.012 * (1 - u * 0.4), 3e-3, k % 4 === 1 ? "twig" : "virtual", { parentT: v });
        for (let leaf = 0; leaf < 3; leaf++) {
          const lt = 0.04 + leaf * 0.31, ap = curvePoint(twig, lt), ad = curveTangent(twig, lt);
          anchors.push({ id: anchors.length, parent: twig.id, t: lt, p: ap, d: ad, scale: (1.32 + r() * 0.65) * (1 - u * 0.27), roll: (r() - 0.5) * 0.65, shape: r() < 0.5 ? "a" : "b" });
        }
      }
      for (let k = 0; k < 2; k++) anchors.push({ id: anchors.length, parent: primary.id, t: k ? 0.93 : 0.16, p: curvePoint(primary, k ? 0.93 : 0.16), d: unit(add(curveTangent(primary, 0.9), [0, 0.2, 0])), scale: (1.15 + r() * 0.5) * (1 - u * 0.22), roll: r() * TAU, shape: j % 2 ? "a" : "b" });
    }
  }
  for (let j = 0; j < 12; j++) {
    const t = 0.94 + j * 5e-3;
    anchors.push({ id: anchors.length, parent: main.id, t, p: curvePoint(main, t), d: unit([Math.cos(j * 2.4) * 0.3, 0.9, Math.sin(j * 2.4) * 0.3]), scale: 1 + r() * 0.3, roll: r() * TAU, shape: j % 2 ? "a" : "b" });
  }
  for (let i = 0; i < 5; i++) {
    const a = main.phase + i * TAU / 5;
    roots.push([Math.cos(a) * 0.58, 0, Math.sin(a) * 0.58]);
  }
  return { graph, anchors, roots };
}
function crownPlanes(points) {
  let a = 0, b = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] < points[a][0]) a = i;
    if (points[i][0] > points[b][0]) b = i;
  }
  let c = -1, best = -1;
  const axis = sub(points[b], points[a]);
  for (let i = 0; i < points.length; i++) {
    const d2 = length(cross(sub(points[i], points[a]), axis));
    if (d2 > best) {
      best = d2;
      c = i;
    }
  }
  const normal = unit(cross(sub(points[b], points[a]), sub(points[c], points[a])));
  let d = -1;
  best = -1;
  for (let i = 0; i < points.length; i++) {
    const distance = Math.abs(dot(normal, sub(points[i], points[a])));
    if (distance > best) {
      best = distance;
      d = i;
    }
  }
  if (best < 1e-8) return null;
  const inside = mul(add(add(points[a], points[b]), add(points[c], points[d])), 0.25);
  function face(a2, b2, c2) {
    let n = cross(sub(points[b2], points[a2]), sub(points[c2], points[a2]));
    if (length(n) < 1e-12) return null;
    n = unit(n);
    if (dot(n, sub(inside, points[a2])) > 0) {
      [b2, c2] = [c2, b2];
      n = mul(n, -1);
    }
    return { a: a2, b: b2, c: c2, n, d: -dot(n, points[a2]) };
  }
  let faces = [[a, b, c], [a, d, b], [a, c, d], [b, d, c]].map((v) => face(...v));
  for (let i = 0; i < points.length; i++) {
    const visible = faces.filter((f) => dot(f.n, points[i]) + f.d > 1e-9);
    if (!visible.length) continue;
    const boundary = /* @__PURE__ */ new Map();
    for (const f of visible) for (const [a2, b2] of [[f.a, f.b], [f.b, f.c], [f.c, f.a]]) {
      const key = a2 < b2 ? a2 + ":" + b2 : b2 + ":" + a2;
      if (boundary.has(key)) boundary.delete(key);
      else boundary.set(key, [a2, b2]);
    }
    const removed = new Set(visible);
    faces = faces.filter((f) => !removed.has(f));
    for (const edge2 of boundary.values()) {
      const f = face(edge2[0], edge2[1], i);
      if (f) faces.push(f);
    }
    if (faces.length > 512) return null;
  }
  const edges = /* @__PURE__ */ new Map();
  for (const f of faces) for (const [a2, b2] of [[f.a, f.b], [f.b, f.c], [f.c, f.a]]) {
    const key = a2 < b2 ? a2 + ":" + b2 : b2 + ":" + a2;
    edges.set(key, (edges.get(key) || 0) + 1);
  }
  if ([...edges.values()].some((n) => n !== 2)) return null;
  return faces;
}
function crownContainsShoots(anchors, planes, nearHeight, stats) {
  const points = [], min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const lod of [false, true]) {
    const mesh = emptyMesh();
    foliage(mesh, anchors, "pine", lod, true);
    for (let i = 0; i < mesh.position.length; i += 3) {
      if (!lod && mesh.position[i + 1] > nearHeight) return false;
      for (let k = 0; k < 3; k++) {
        const v = mesh.position[i + k];
        points.push(v);
        min[k] = Math.min(min[k], v);
        max[k] = Math.max(max[k], v);
      }
    }
  }
  for (const f of planes) {
    if (stats) stats.broadTests++;
    const support = f.n[0] * (f.n[0] >= 0 ? max[0] : min[0]) + f.n[1] * (f.n[1] >= 0 ? max[1] : min[1]) + f.n[2] * (f.n[2] >= 0 ? max[2] : min[2]) + f.d;
    if (support < -1e-8) continue;
    for (let i = 0; i < points.length; i += 3) {
      if (stats) stats.pointTests++;
      if (f.n[0] * points[i] + f.n[1] * points[i + 1] + f.n[2] * points[i + 2] + f.d > 1e-9) return false;
    }
  }
  return true;
}
function drapePineShoots(data, seedKey) {
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const original = [], heightOwners = /* @__PURE__ */ new Set();
  let originalNearHeight = -Infinity;
  for (const lod of [false, true]) {
    const mesh = emptyMesh();
    foliage(mesh, data.anchors, "pine", lod, true);
    for (let i = 0; i < mesh.position.length; i += 3) original.push(mesh.position.slice(i, i + 3));
    if (!lod) {
      for (let i = 1; i < mesh.position.length; i += 3) originalNearHeight = Math.max(originalNearHeight, mesh.position[i]);
      for (let i = 1; i < mesh.position.length; i += 3) if (mesh.position[i] >= originalNearHeight - 1e-8) heightOwners.add(data.anchors[Math.floor(i / 36)].parent);
    }
  }
  const planes = crownPlanes(original);
  if (!planes) {
    data.pineDrape = { proposed: 0, accepted: 0, minimumTipDrop: 0, maximumTipDrop: 0, guardPlanes: 0 };
    return;
  }
  const byEdge = /* @__PURE__ */ new Map();
  for (const a of data.anchors) {
    let list = byEdge.get(a.parent);
    if (!list) {
      list = [];
      byEdge.set(a.parent, list);
    }
    list.push(a);
  }
  let proposed = 0, accepted = 0, minimumDrop = Infinity, maximumDrop = 0;
  for (const e of data.graph) {
    const parent = data.graph[e.parent];
    if (parent?.detail !== "primary" || e.detail !== "virtual" || heightOwners.has(e.id)) continue;
    const mature = 1 - smooth(0.72, 0.94, parent.parentT), strength = 0.3 + treeHash(seedKey, "drape", parent.id) / 4294967296 * 0.25;
    const drop = mature * strength * (0.6 + 0.4 * e.parentT);
    if (drop < 0.02) continue;
    proposed++;
    const p = e.p.map((v, k) => k ? add(v, [0, -drop * (k / 3) ** 2, 0]) : v), test = { ...e, p };
    const anchors = (byEdge.get(e.id) || []).map((a) => ({ ...a, p: curvePoint(test, a.t), d: curveTangent(test, a.t) }));
    if (!crownContainsShoots(anchors, planes, originalNearHeight)) continue;
    e.p = p;
    e.arc = arcTable(e);
    for (let i = 0; i < anchors.length; i++) {
      const a = byEdge.get(e.id)[i];
      a.p = anchors[i].p;
      a.d = anchors[i].d;
    }
    accepted++;
    minimumDrop = Math.min(minimumDrop, drop);
    maximumDrop = Math.max(maximumDrop, drop);
  }
  data.pineDrape = { proposed, accepted, minimumTipDrop: accepted ? minimumDrop : 0, maximumTipDrop: maximumDrop, guardPlanes: planes.length };
  const boughForms = /* @__PURE__ */ new Map(), formGuard = { broadTests: 0, pointTests: 0 };
  let formProposed = 0, formAccepted = 0, maxDisplacement = 0;
  for (const e of data.graph) {
    const parent = data.graph[e.parent];
    if (parent?.detail !== "primary" || e.detail !== "virtual" || heightOwners.has(e.id)) continue;
    let form = boughForms.get(parent.id);
    if (!form) {
      const h = treeHash(seedKey, "bough-form", parent.id) / 4294967296, mature = 1 - smooth(0.62, 0.92, parent.parentT);
      form = { side: 1 - mature * (h < 0.42 ? 0.3 + 0.18 * h / 0.42 : h < 0.72 ? 0.12 : 0), drop: mature * (h < 0.42 ? 0.38 + 0.42 * h / 0.42 : h < 0.72 ? 0.12 : 0) };
      boughForms.set(parent.id, form);
    }
    if (form.drop < 0.04) continue;
    formProposed++;
    const radial = curveTangent(parent, e.parentT), xz = Math.hypot(radial[0], radial[2]), side = xz > 1e-8 ? [-radial[2] / xz, 0, radial[0] / xz] : [1, 0, 0], base = e.p[0];
    const p = e.p.map((v, k) => {
      if (!k) return v;
      const offset = sub(v, base), across = dot(offset, side);
      return add(v, add(mul(side, across * (form.side - 1)), [0, -form.drop * (k / 3) ** 2, 0]));
    }), test = { ...e, p };
    const anchors = (byEdge.get(e.id) || []).map((a) => ({ ...a, p: curvePoint(test, a.t), d: curveTangent(test, a.t) }));
    if (!crownContainsShoots(anchors, planes, originalNearHeight, formGuard)) continue;
    for (let k = 1; k < 4; k++) maxDisplacement = Math.max(maxDisplacement, length(sub(p[k], e.p[k])));
    e.p = p;
    e.arc = arcTable(e);
    for (let i = 0; i < anchors.length; i++) {
      const a = byEdge.get(e.id)[i];
      a.p = anchors[i].p;
      a.d = anchors[i].d;
    }
    formAccepted++;
  }
  data.pineBoughForm = { proposed: formProposed, accepted: formAccepted, boughs: boughForms.size, maxControlPointDisplacement: maxDisplacement, guardBroadPhaseTests: formGuard.broadTests, guardPointTests: formGuard.pointTests, extraHullSearches: 0 };
}
function treeRadiusAt(e, t) {
  let radius = e.r1 + (e.r0 - e.r1) * Math.pow(Math.max(0, 1 - t), e.taper ?? 0.9);
  for (const split of e.splits || []) {
    const u = clamp((t - split.t - 8e-3) / (e.detail === "trunk" ? 0.2 : 0.075), 0, 1), smooth = u * u * (3 - 2 * u);
    radius *= Math.sqrt(1 - split.fraction * smooth);
  }
  return radius;
}
function solveBroadRadii(graph) {
  const children = graph.map(() => []);
  for (const e of graph) if (e.parent >= 0) children[e.parent].push(e);
  function visit(e) {
    e.splits = [];
    e.taper = e.detail === "trunk" ? 1.04 : e.detail === "primary" ? 1.26 : 1.18;
    const sorted = children[e.id].sort((a, b) => a.parentT - b.parentT || a.id - b.id);
    for (const child of sorted) {
      const parentRadius = treeRadiusAt(e, child.parentT), ratio = child.pipeRatio ?? (child.detail === "secondary" ? 0.33 : child.detail === "twig" ? 0.22 : 0.13);
      child.r0 = parentRadius * ratio;
      child.r1 = child.r0 * (child.detail === "primary" ? 0.07 : 0.12);
      child.parentRadiusAtBirth = parentRadius;
      child.pipeRatio = ratio;
      if (child.detail === "primary" || child.detail === "secondary") e.splits.push({ t: child.parentT, fraction: ratio * ratio, child: child.id });
    }
    for (const child of sorted) visit(child);
  }
  visit(graph[0]);
}
function tAtHeight(e, y) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (curvePoint(e, mid)[1] < y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function toEnvelope(p, d, c, rx, ry) {
  const o = [(p[0] - c[0]) / rx, (p[1] - c[1]) / ry, (p[2] - c[2]) / rx], v = [d[0] / rx, d[1] / ry, d[2] / rx], a = dot(v, v), b = 2 * dot(o, v), k = dot(o, o) - 1, disc = b * b - 4 * a * k;
  return disc < 0 ? 0 : Math.max(0, (-b + Math.sqrt(disc)) / (2 * a));
}
function broadleafGraph(r, H) {
  const graph = [], anchors = [], roots = [], phase = r() * TAU;
  function leafyTwigs(parent, count, low = false) {
    for (let k = 0; k < count; k++) {
      const tt = 0.3 + k * 0.2, tp = curvePoint(parent, tt), pd = curveTangent(parent, tt), frame = frames(pd), side = k % 2 ? 1 : -1;
      const td = unit(add(add(mul(pd, 0.56), mul(frame.right, side * (0.55 + r() * 0.35))), [0, low ? -0.25 : 0.25 + r() * 0.3, 0])), tl = 1 + r() * 0.6;
      const twig = edge(graph, graph.length, parent.id, [tp, add(tp, mul(td, tl * 0.33)), add(tp, add(mul(td, tl * 0.78), [0, low ? -0.2 : 0.1, 0])), add(tp, mul(td, tl))], 0.027, 5e-3, "twig", { parentT: tt });
      const basis = frames(td);
      for (let q = 0; q < 3; q++) {
        const qt = 0.14 + q * 0.29, qp = curvePoint(twig, qt), qd = unit(add(add(mul(td, 0.5), mul(basis.right, q % 2 ? -0.8 : 0.8)), [0, low ? -0.3 : -0.06, 0])), ql = 0.78 + r() * 0.6;
        const twiglet = edge(graph, graph.length, twig.id, [qp, add(qp, mul(qd, ql * 0.3)), add(qp, add(mul(qd, ql * 0.76), [0, low ? -0.25 : -0.12, 0])), add(qp, mul(qd, ql))], 6e-3, 1e-3, "virtual", { parentT: qt });
        for (let l = 0; l < 3; l++) {
          const v = 0.02 + l * 0.31;
          anchors.push({ id: anchors.length, parent: twiglet.id, t: v, p: curvePoint(twiglet, v), d: curveTangent(twiglet, v), scale: (2.75 + r() * 1.05) * 1.78, roll: (r() - 0.5) * 1.15, shape: "abc"[(q + k + graph.length) % 3] });
        }
      }
    }
  }
  const fork = 3 + r() * 1.5, top = 14.2 + r() * 0.9, phaseUp = r() * TAU, lean = 0.15 + r() * 0.4, ld = [Math.cos(phaseUp), 0, Math.sin(phaseUp)];
  const crown = { c: [ld[0] * lean, fork + (top - fork) * 0.5, ld[2] * lean], rx: 5.3 + r() * 1.5, ry: (top - fork) * 0.6 };
  const sweep = 1.3 + r() * 1.1, leaderTop = [ld[0] * sweep, fork + (top - fork) * (0.62 + r() * 0.08), ld[2] * sweep];
  const main = edge(graph, 0, -1, [[0, 0, 0], [ld[0] * lean * 0.1, fork * 0.7, ld[2] * lean * 0.1], [ld[0] * sweep * 0.25, fork + (leaderTop[1] - fork) * 0.4, ld[2] * sweep * 0.25], leaderTop], 0.47 + r() * 0.07, 0.03, "trunk", { rootLobes: 5, phase, knots: [] });
  function limb(parent, t, dir, { reach = 0.9, pipeRatio = 0.5, detail = "primary", droop = 0, minLength = 1, maxLength = 99, lift = 0.1, follow = 0.5 }) {
    const base = curvePoint(parent, t), pd = curveTangent(parent, t), flat = unit([dir[0], 0, dir[2]]), side = [-flat[2], 0, flat[0]];
    const length2 = clamp(toEnvelope(base, dir, crown.c, crown.rx, crown.ry) * reach * (0.92 + r() * 0.16), minLength, maxLength), bend = (r() - 0.5) * 0.36;
    const p1 = add(base, mul(unit(add(mul(pd, follow), mul(dir, 1 - follow))), length2 * 0.34));
    const p2 = add(add(base, mul(dir, length2 * 0.68)), add(mul(side, bend * length2), [0, -droop * length2 * 0.06, 0]));
    const end = add(add(base, mul(dir, length2)), [0, (droop ? -droop * 0.18 : lift) * length2, 0]);
    const e = edge(graph, graph.length, parent.id, [base, p1, p2, end], 0.3, 0.02, detail, { parentT: t, pipeRatio, phase: Math.atan2(flat[2], flat[0]) });
    if (parent.detail === "trunk") (parent.knots ??= []).push({ t, angle: e.phase });
    return e;
  }
  const toward = (az, fromVertical) => [Math.cos(az) * Math.sin(fromVertical), Math.cos(fromVertical), Math.sin(az) * Math.sin(fromVertical)];
  function secondaries(primary, count, { low = false, from = 0.3 } = {}) {
    const az0 = primary.phase;
    for (let j = 0; j < count; j++) {
      const st = clamp(from + j * ((0.92 - from) / Math.max(1, count - 1)) + (r() - 0.5) * 0.06, 0.18, 0.95), side = j % 2 ? 1 : -1, az = az0 + side * (0.55 + r() * 0.6);
      const pd = curveTangent(primary, st), fromVertical = low ? 1.35 + r() * 0.25 : clamp(Math.acos(clamp(pd[1], -1, 1)) * 0.5 + 0.62 + r() * 0.35, 0.5, 1.4);
      const secondary = limb(primary, st, toward(az, fromVertical), { reach: 0.86, pipeRatio: 0.5 - 0.12 * st, detail: "secondary", droop: low ? 0.6 : 0, minLength: 1.1, maxLength: low ? 2.6 : 3.4, lift: 0.14 });
      leafyTwigs(secondary, anchors.length > 740 ? 2 : secondary.arc.at(-1) > 1.9 ? 4 : 3, low);
    }
  }
  const tf = tAtHeight(main, fork), stems = 1 + (r() < 0.55 ? 1 : 0);
  for (let k = 0; k < stems; k++) {
    const az = phaseUp + Math.PI + (k ? 1 : -1) * (stems > 1 ? 0.75 + r() * 0.35 : (r() - 0.5) * 0.6);
    const stem = limb(main, tf + k * 0.025, toward(az, 0.62 + r() * 0.22), { pipeRatio: k ? 0.66 : 0.78, reach: 0.95, minLength: 5 });
    secondaries(stem, stem.arc.at(-1) > 7.5 ? 5 : 4, { from: 0.32 });
  }
  const yTop = leaderTop[1], limbs = 3 + (r() < 0.35 ? 1 : 0);
  for (let i = 0; i < limbs; i++) {
    const u = (i + 0.5) / limbs, t = tAtHeight(main, fork + (yTop - fork) * (0.12 + u * 0.62)), az = phaseUp + Math.PI * 0.5 + i * 2.39996 + (r() - 0.5) * 0.5;
    const primary = limb(main, t, toward(az, 1.18 - u * 0.4 + (r() - 0.5) * 0.15), { pipeRatio: 0.52 - u * 0.12, reach: 0.92, minLength: 2.4 });
    secondaries(primary, primary.arc.at(-1) > 4 ? 3 : 2);
  }
  for (let k = 0; k < 3; k++) {
    const shoot = limb(main, 0.8 + k * 0.09, toward(phaseUp + Math.PI + k * 2.1 + (r() - 0.5) * 0.6, 0.5 + r() * 0.35), { pipeRatio: 0.55 - k * 0.08, detail: "secondary", reach: 0.92, minLength: 1.6, maxLength: 4, lift: 0.14 });
    leafyTwigs(shoot, anchors.length > 730 ? 2 : 3);
  }
  solveBroadRadii(graph);
  for (let i = 0; i < 5; i++) {
    const az = main.phase + i * TAU / 5 + (r() - 0.5) * 0.45;
    roots.push([Math.cos(az) * (0.85 + r() * 0.3), 0, Math.sin(az) * (0.85 + r() * 0.3)]);
  }
  return { graph, anchors, roots };
}
function emptyMesh() {
  return { position: [], normal: [], uv: [], index: [], tubeRanges: [], normalGroups: [] };
}
function pushVertex(mesh, p, n, u, v) {
  mesh.position.push(...p);
  mesh.normal.push(...n);
  mesh.uv.push(u, v);
  return mesh.position.length / 3 - 1;
}
function trunkSurfaceRadius(e, t, theta, species, y = curvePoint(e, t)[1]) {
  let rr = treeRadiusAt(e, t);
  const pine = species === "pine", root = Math.exp(-Math.max(0, y) / (pine ? 0.46 : 0.62)), lobe = Math.pow(0.5 + 0.5 * Math.cos(theta * e.rootLobes + e.phase + Math.sin(theta * 2) * 0.3), 3);
  rr *= 1 + root * (pine ? 0.95 : 0.85) * lobe;
  rr *= 1 + (pine ? 0.035 * Math.sin(theta * 3 + e.phase + Math.sin(t * 9)) : 0.06 * Math.sin(theta * 3 + e.phase + Math.sin(t * 9)) + 0.03 * Math.sin(theta * 5 - e.phase + t * 11)) * Math.sin(Math.PI * t);
  if (!pine) for (const knot of e.knots || []) rr *= 1 + 0.12 * Math.exp(-Math.pow((t - knot.t) / 0.04, 2)) * (0.65 + 0.35 * Math.cos(theta - knot.angle));
  return rr;
}
function tubeRingT(e, i, steps) {
  return e.detail === "trunk" ? Math.pow(i / steps, 1.45) : i / steps;
}
var TUBES = Object.freeze({
  pine: Object.freeze({ trunk: [16, 10, 10, 7], primary: [4, 5, 3, 3], twig: [2, 3, 0, 0] }),
  broadleaf: Object.freeze({ trunk: [16, 14, 9, 9], primary: [7, 8, 4, 5], secondary: [4, 6, 2, 4], twig: [2, 3, 0, 0] })
});
function tube(mesh, e, lod, species) {
  if (e.detail === "virtual" || lod && e.detail === "twig") return;
  let steps, sides;
  if (lod === 2) {
    const reduced = species === "pine" ? { trunk: [8, 6] } : { trunk: [8, 6], primary: [2, 3] }, d = reduced[e.detail];
    if (!d) return;
    [steps, sides] = d;
  } else {
    const d = TUBES[species][e.detail];
    if (!d) return;
    steps = d[lod ? 2 : 0];
    sides = d[lod ? 3 : 1];
  }
  if (!steps) return;
  const start = mesh.position.length / 3, ts = Array.from({ length: steps + 1 }, (_, i) => tubeRingT(e, i, steps));
  mesh.tubeRanges.push({ start, edgeId: e.id, steps, sides, ts, cap: e.detail !== "twig" });
  const repeats = Math.max(1, Math.round(TAU * e.r0 / (species === "broadleaf" ? 1 : 0.75))), total = e.arc.at(-1);
  let right;
  for (let i = 0; i <= steps; i++) {
    const t = ts[i], center = curvePoint(e, t), tangent = curveTangent(e, t);
    if (!right) right = frames(tangent).right;
    else right = unit(sub(right, mul(tangent, dot(right, tangent))));
    const side = unit(cross(tangent, right));
    const radius = treeRadiusAt(e, t), nextRadius = treeRadiusAt(e, Math.min(1, t + 1e-3)), dr = (nextRadius - radius) / Math.max(1e-3, total * 1e-3);
    for (let j = 0; j <= sides; j++) {
      const theta = j / sides * TAU, radial = add(mul(right, Math.cos(theta)), mul(side, Math.sin(theta)));
      let rr = radius;
      if (e.detail === "trunk") rr = trunkSurfaceRadius(e, t, theta, species, center[1]);
      else if (i < 2 && species === "pine") {
        rr *= 1 + 0.22 * Math.pow(1 - i / 2, 2);
      } else if (species === "broadleaf") rr *= 1 + 0.08 * Math.sin(theta * 3 + (e.phase || 0) + t * 6) * Math.sin(Math.PI * t);
      if (species === "broadleaf" && e.detail !== "trunk" && i === 0) rr *= 0.78;
      let n = unit(sub(radial, mul(tangent, dr)));
      if (e.detail === "trunk" && center[1] < 0.6) n = unit(add(n, [0, 0.55 * Math.exp(-center[1] / 0.4), 0]));
      const arcIndex = t * 64, k = Math.floor(arcIndex), arc = e.arc[k] + ((e.arc[Math.min(64, k + 1)] ?? e.arc[k]) - e.arc[k]) * (arcIndex - k);
      pushVertex(mesh, add(center, mul(radial, rr)), n, j / sides * repeats, arc / 1.35);
    }
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < sides; j++) {
    const a = start + i * (sides + 1) + j, b = a + sides + 1;
    mesh.index.push(a, a + 1, b, a + 1, b + 1, b);
  }
  if (e.detail !== "twig") {
    const cap = pushVertex(mesh, e.p[3], curveTangent(e, 1), 0.5, e.arc.at(-1) / 1.35), last = start + steps * (sides + 1);
    for (let j = 0; j < sides; j++) mesh.index.push(last + j, last + j + 1, cap);
  }
  if (e.detail === "trunk") {
    const normal = mul(curveTangent(e, 0), -1), ring = [];
    for (let j = 0; j < sides; j++) {
      const v = start + j, id = pushVertex(mesh, mesh.position.slice(v * 3, v * 3 + 3), normal, mesh.uv[v * 2], 0);
      mesh.normalGroups[id] = 1;
      ring.push(id);
    }
    const cap = pushVertex(mesh, e.p[0], normal, 0.5, 0);
    mesh.normalGroups[cap] = 1;
    for (let j = 0; j < sides; j++) mesh.index.push(ring[(j + 1) % sides], ring[j], cap);
  }
}
function foliage(mesh, anchors, species, lod, positionsOnly = false) {
  const all = TREE_SPRAYS[species], lodScale = lod === 2 ? 1.28 * FAR2_CARD_SCALE : lod ? 1.28 : 1;
  for (const a of anchors) {
    const views = all.filter((v) => v.shape === a.shape), used = lod ? [[views[a.id % 2], 0]] : species === "pine" ? [[views[0], 0], [views[1], 0], [views[0], Math.PI / 3]] : [[views[0], 0], [views[1], 0]];
    for (const [view, extraRoll] of used) {
      const f = frames(a.d, a.roll + extraRoll), s = a.scale * (species === "pine" ? 1.57 : 1) * lodScale, start = mesh.position.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const p = add(view.center, add(mul(view.right, (u - 0.5) * view.size), mul(view.up, (v - 0.5) * view.size)));
        p[2] += 0.018 * Math.sin(p[1] / view.size * Math.PI) * (u - 0.5);
        const position = add(a.p, mul(local(f, p), s));
        if (positionsOnly) mesh.position.push(...position);
        else {
          const n = unit(add(mul(view.normal, 0.78), add(mul(view.right, (u - 0.5) * 0.8), mul(view.up, (v - 0.5) * 0.35))));
          pushVertex(mesh, position, unit(local(f, n)), view.uvMin[0] + (view.uvMax[0] - view.uvMin[0]) * u, 1 - (view.uvMin[1] + (view.uvMax[1] - view.uvMin[1]) * v));
        }
      }
      if (!positionsOnly) mesh.index.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  }
}
function bounds(meshes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) for (let i = 0; i < m.position.length; i++) {
    const k = i % 3;
    min[k] = Math.min(min[k], m.position[i]);
    max[k] = Math.max(max[k], m.position[i]);
  }
  return { min, max };
}
function surfaceNormals(mesh) {
  const sums = new Float64Array(mesh.position.length), point = (i) => mesh.position.slice(i * 3, i * 3 + 3);
  for (let i = 0; i < mesh.index.length; i += 3) {
    const a = mesh.index[i], b = mesh.index[i + 1], c = mesh.index[i + 2], n = cross(sub(point(b), point(a)), sub(point(c), point(a)));
    for (const id of [a, b, c]) for (let k = 0; k < 3; k++) sums[id * 3 + k] += n[k];
  }
  const seams = /* @__PURE__ */ new Map();
  for (let i = 0; i < mesh.position.length / 3; i++) {
    const key = point(i).map((v) => v.toFixed(6)).join(",") + ":" + (mesh.normalGroups[i] || 0);
    let group = seams.get(key);
    if (!group) {
      group = [];
      seams.set(key, group);
    }
    group.push(i);
  }
  for (const group of seams.values()) {
    let n = [0, 0, 0];
    for (const i of group) for (let k = 0; k < 3; k++) n[k] += sums[i * 3 + k];
    n = unit(n);
    for (const i of group) for (let k = 0; k < 3; k++) mesh.normal[i * 3 + k] = n[k];
  }
}
function finish(m) {
  return { position: new Float32Array(m.position), normal: new Float32Array(m.normal), uv: new Float32Array(m.uv), index: m.position.length / 3 < 65536 ? new Uint16Array(m.index) : new Uint32Array(m.index) };
}
function generateTreeFamily({ seed, species, familyIndex = 0, version = TREE_GENERATOR_VERSION }) {
  if (!Number.isInteger(seed) || !TREE_HEIGHTS[species] || !Number.isInteger(familyIndex) || familyIndex < 0 || familyIndex >= 8) throw Error("Explicit integer seed, known species and familyIndex0..7 required");
  for (let attempt = 0; ; attempt++) {
    try {
      return buildTreeFamily(seed, species, familyIndex, version, attempt);
    } catch (error) {
      if (!error.treeBudget || attempt >= 5) throw error;
    }
  }
}
function buildTreeFamily(seed, species, familyIndex, version, attempt) {
  const H = TREE_HEIGHTS[species], seedKey = [seed, version, species, familyIndex].join(":") + (attempt ? ":" + attempt : ""), r = random(treeHash(seedKey)), data = species === "pine" ? pineGraph(r, H) : broadleafGraph(r, H), near = { wood: emptyMesh(), leaf: emptyMesh() }, far = { wood: emptyMesh(), leaf: emptyMesh() }, far2 = { wood: emptyMesh(), leaf: emptyMesh() };
  if (species === "pine") drapePineShoots(data, seedKey);
  for (const e of data.graph) {
    tube(near.wood, e, false, species);
    tube(far.wood, e, true, species);
  }
  foliage(near.leaf, data.anchors, species, false);
  foliage(far.leaf, data.anchors, species, true);
  for (const e of data.graph) tube(far2.wood, e, 2, species);
  foliage(far2.leaf, data.anchors.filter((a, i) => i % FAR2_ANCHOR_STRIDE === 0), species, 2);
  const b = bounds([near.wood, near.leaf]), sy = H / b.max[1];
  for (const m of [near.wood, near.leaf, far.wood, far.leaf, far2.wood, far2.leaf]) for (let i = 0; i < m.position.length; i += 3) {
    m.position[i + 1] *= sy;
    const n = unit([m.normal[i], m.normal[i + 1] / sy, m.normal[i + 2]]);
    m.normal[i] = n[0];
    m.normal[i + 1] = n[1];
    m.normal[i + 2] = n[2];
  }
  const scaledPoints = /* @__PURE__ */ new Set();
  for (const e of data.graph) for (const p of e.p) {
    if (!scaledPoints.has(p)) {
      p[1] *= sy;
      scaledPoints.add(p);
    }
  }
  for (const e of data.graph) e.arc = arcTable(e);
  for (const e of data.graph) if (e.detail !== "virtual") {
    const repeats = Math.max(1, Math.round(TAU * e.r0 / (species === "broadleaf" ? 1 : 0.75))), v = [0];
    for (let k = 1; k <= 64; k++) {
      const radius = (treeRadiusAt(e, (k - 1) / 64) + treeRadiusAt(e, k / 64)) * 0.5, width = Math.max(8e-3, TAU * radius / repeats);
      v.push(v.at(-1) + (e.arc[k] - e.arc[k - 1]) / width);
    }
    e.barkV = v;
  }
  for (const mesh of [near.wood, far.wood, far2.wood]) for (const range of mesh.tubeRanges) {
    const e = data.graph[range.edgeId], values = e.barkV;
    for (let i = 0; i <= range.steps; i++) {
      const u = (range.ts ? range.ts[i] : i / range.steps) * 64, k = Math.floor(u), value = values[k] + (values[Math.min(64, k + 1)] - values[k]) * (u - k), v = value;
      for (let j = 0; j <= range.sides; j++) mesh.uv[(range.start + i * (range.sides + 1) + j) * 2 + 1] = v;
    }
    if (range.cap) mesh.uv[(range.start + (range.steps + 1) * (range.sides + 1)) * 2 + 1] = values.at(-1);
  }
  for (const a of data.anchors) {
    a.p[1] *= sy;
    a.d = unit([a.d[0], a.d[1] * sy, a.d[2]]);
  }
  surfaceNormals(near.wood);
  surfaceNormals(far.wood);
  surfaceNormals(far2.wood);
  const nearBounds = bounds([near.wood, near.leaf]), farBounds = bounds([far.wood, far.leaf]), far2Bounds = bounds([far2.wood, far2.leaf]);
  const metrics = { seed, version, species, familyIndex, seedKey, height: H, nearTriangles: (near.wood.index.length + near.leaf.index.length) / 3, farTriangles: (far.wood.index.length + far.leaf.index.length) / 3, far2Triangles: (far2.wood.index.length + far2.leaf.index.length) / 3, woodTriangles: [near.wood.index.length / 3, far.wood.index.length / 3], leafAnchors: data.anchors.length, branchEdges: data.graph.length, nearBounds, farBounds, verticalNormalization: sy };
  if (data.pineDrape) metrics.pineDrape = data.pineDrape;
  if (data.pineBoughForm) metrics.pineBoughForm = data.pineBoughForm;
  if (metrics.nearTriangles > TREE_LIMITS[species].near || metrics.farTriangles > TREE_LIMITS[species].far || metrics.far2Triangles > TREE_LIMITS[species].far2) throw Object.assign(Error(`${seedKey} exceeds budget: ${metrics.nearTriangles}/${metrics.farTriangles}/${metrics.far2Triangles}`), { treeBudget: true });
  const trunkRange = near.wood.tubeRanges.find((range) => range.edgeId === 0), trunkRings = { steps: trunkRange.steps, sides: trunkRange.sides, ts: Float32Array.from(trunkRange.ts), start: trunkRange.start };
  return { species, index: familyIndex, seedKey, height: H, trunkRings, near: { wood: finish(near.wood), leaf: finish(near.leaf) }, far: { wood: finish(far.wood), leaf: finish(far.leaf) }, far2: { wood: finish(far2.wood), leaf: finish(far2.leaf) }, skeleton: data.graph, anchors: data.anchors, rootAnchors: data.roots, bounds: { min: nearBounds.min.map((v, k) => Math.min(v, farBounds.min[k])), max: nearBounds.max.map((v, k) => Math.max(v, farBounds.max[k])) }, far2Bounds, metadata: metrics };
}

// tree-crown-light.js
var CROWN_LIGHT = Object.freeze({
  revision: "crown-light-v1",
  // Leaf density grid: cell size (m) and the light stopped per square metre
  // of leaf card in a cubic metre (the cards' leaf share, the leaves' mean
  // projection and their overlap; set so a crown's heart keeps about a fifth
  // of the light and its sunny face most of it).
  cell: 0.75,
  extinction: 0.042,
  // Broadleaf crowns hold their leaves in a wider, thinner shell of fewer
  // cards: denser per card, so they shade like the pines.
  density: Object.freeze({ pine: 1, broadleaf: 1.5 }),
  // Rays per point (evenly over the sphere: leaves, wood); march step in cells.
  rays: 24,
  woodRays: 12,
  step: 1,
  // A leaf on the crown's surface sees about this much of the sky (the crown
  // hides the rest): the sky light is measured against it.
  openSky: 0.7,
  // Ground shadow patterns (m per texel, at the shape's own height) and the
  // lowest sun they are made for (below it the field and the clouds have it).
  patternTexel: 0.5,
  patternMinSun: 0.14
});
var C = CROWN_LIGHT;
var crownLightUniforms = Object.freeze({
  treeCrownSun: { value: { x: 0, y: 1, z: 0, w: 0 } },
  treeCrownTune: { value: { x: 0, y: 0, z: 0, w: 1 } }
});
var CROWN_LIGHT_STRENGTH = Object.freeze({ sky: 0.85, sun: 0.9 });
function crownDirections(count = C.rays) {
  const out = new Float32Array(count * 3), golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i + 0.5) * 2 / count, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * golden;
    out[i * 3] = Math.cos(a) * r;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = Math.sin(a) * r;
  }
  return out;
}
var DIRECTIONS = crownDirections();
var WOOD_DIRECTIONS = crownDirections(C.woodRays);
function crownGrid(leaf, cell = C.cell, density = 1) {
  const p = leaf.position, cards = Math.floor(p.length / 12);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]);
    maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]);
    maxY = Math.max(maxY, p[i + 1]);
    minZ = Math.min(minZ, p[i + 2]);
    maxZ = Math.max(maxZ, p[i + 2]);
  }
  if (!cards || !Number.isFinite(minX)) return null;
  const x0 = minX - cell, y0 = minY - cell, z0 = minZ - cell;
  const nx = Math.ceil((maxX - x0) / cell) + 2, ny = Math.ceil((maxY - y0) / cell) + 2, nz = Math.ceil((maxZ - z0) / cell) + 2;
  const data = new Float32Array(nx * ny * nz), k = C.extinction * density / (cell * cell * cell);
  for (let c = 0; c < cards; c++) {
    const o = c * 12;
    const ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2], bx = p[o + 9] - p[o], by = p[o + 10] - p[o + 1], bz = p[o + 11] - p[o + 2];
    const area = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    const cx = (p[o] + p[o + 3] + p[o + 6] + p[o + 9]) / 4, cy = (p[o + 1] + p[o + 4] + p[o + 7] + p[o + 10]) / 4, cz = (p[o + 2] + p[o + 5] + p[o + 8] + p[o + 11]) / 4;
    const gx = (cx - x0) / cell - 0.5, gy = (cy - y0) / cell - 0.5, gz = (cz - z0) / cell - 0.5;
    const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz), fx = gx - ix, fy = gy - iy, fz = gz - iz;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const x = ix + dx, y = iy + dy, z = iz + dz;
      if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
      data[(z * ny + y) * nx + x] += area * k * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
    }
  }
  return { x0, y0, z0, cell, nx, ny, nz, data };
}
function crownTransmittance(g, px, py, pz, dx, dy, dz) {
  const step = g.cell * C.step, inv = 1 / g.cell;
  let near = 0, far = Infinity;
  for (const [p, d, lo, n] of [[px, dx, g.x0, g.nx], [py, dy, g.y0, g.ny], [pz, dz, g.z0, g.nz]]) {
    const hi = lo + n * g.cell;
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return 1;
      continue;
    }
    const a = (lo - p) / d, b = (hi - p) / d;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  if (!(far > near)) return 1;
  let tau = 0;
  for (let t = near + step * 0.5; t < far; t += step) {
    const x = Math.floor((px + dx * t - g.x0) * inv), y = Math.floor((py + dy * t - g.y0) * inv), z = Math.floor((pz + dz * t - g.z0) * inv);
    if (x < 0 || y < 0 || z < 0 || x >= g.nx || y >= g.ny || z >= g.nz) continue;
    tau += g.data[(z * g.ny + y) * g.nx + x];
  }
  return Math.exp(-tau * step);
}
function lightAt(g, x, y, z, out, o, directions = DIRECTIONS) {
  let a = 0, bx = 0, by = 0, bz = 0;
  const n = directions.length / 3;
  for (let i = 0; i < n; i++) {
    const dx = directions[i * 3], dy = directions[i * 3 + 1], dz = directions[i * 3 + 2], t = crownTransmittance(g, x, y, z, dx, dy, dz);
    a += t;
    bx += t * dx;
    by += t * dy;
    bz += t * dz;
  }
  out[o] = 3 * bx / n;
  out[o + 1] = 3 * by / n;
  out[o + 2] = 3 * bz / n;
  out[o + 3] = a / n;
}
function crownLight(g, mesh, leaf) {
  const p = mesh.position, count = p.length / 3, out = new Float32Array(count * 4);
  if (leaf) {
    for (let v = 0; v + 3 < count; v += 4) {
      const o = v * 3;
      lightAt(g, (p[o] + p[o + 3] + p[o + 6] + p[o + 9]) / 4, (p[o + 1] + p[o + 4] + p[o + 7] + p[o + 10]) / 4, (p[o + 2] + p[o + 5] + p[o + 8] + p[o + 11]) / 4, out, v * 4);
      for (let k = 1; k < 4; k++) out.copyWithin((v + k) * 4, v * 4, v * 4 + 4);
    }
  } else for (let v = 0; v < count; v++) lightAt(g, p[v * 3], p[v * 3 + 1], p[v * 3 + 2], out, v * 4, WOOD_DIRECTIONS);
  return out;
}
function bakeCrownLight(family) {
  const g = crownGrid(family.near.leaf, C.cell, C.density[family.species] ?? 1);
  if (!g) return family;
  for (const lod of [family.near, family.far, family.far2]) if (lod) {
    lod.leaf.crownLight = crownLight(g, lod.leaf, true);
    lod.wood.crownLight = crownLight(g, lod.wood, false);
  }
  family.crownGrid = g;
  return family;
}
function crownShadowPattern(g, sy, texel = C.patternTexel) {
  const s = Math.max(C.patternMinSun, Math.min(1, sy)), c = Math.sqrt(1 - s * s), tan = s / Math.max(c, 1e-4);
  const top = g.y0 + g.ny * g.cell, reach = c > 1e-4 ? Math.max(0, top) / tan : 0;
  const minX = g.x0 - reach, maxX = g.x0 + g.nx * g.cell, minZ = g.z0, maxZ = g.z0 + g.nz * g.cell;
  const width = Math.max(2, Math.ceil((maxX - minX) / texel)), depth = Math.max(2, Math.ceil((maxZ - minZ) / texel));
  const data = new Float32Array(width * depth);
  for (let j = 0; j < depth; j++) {
    const z = minZ + (j + 0.5) * texel;
    for (let i = 0; i < width; i++) {
      const x = minX + (i + 0.5) * texel;
      data[j * width + i] = crownTransmittance(g, x, 0, z, c, s, 0);
    }
  }
  return { width, depth, texel, minX, minZ, data, sun: s };
}

export {
  TREE_SPRAYS,
  TREE_HEIGHTS,
  curvePoint,
  treeRadiusAt,
  generateTreeFamily,
  CROWN_LIGHT,
  crownLightUniforms,
  CROWN_LIGHT_STRENGTH,
  bakeCrownLight,
  crownShadowPattern
};
