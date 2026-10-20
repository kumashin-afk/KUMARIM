import {
  WORKER_NAMES,
  reportWorker
} from "./chunk-HGFZA34L.js";

// rock-fracture-geometry.js
var MAX_FRACTURE_TRIANGLES = 8e3;
function splitRockGeometry(THREE, geometry, plane) {
  const p = geometry?.attributes?.position, n = geometry?.attributes?.normal, uv = geometry?.attributes?.uv, index = geometry?.index, count = index?.count ?? p?.count ?? 0;
  if (!p || !n || count % 3 || count / 3 > MAX_FRACTURE_TRIANGLES || !plane?.normal?.every(Number.isFinite) || !Number.isFinite(plane.constant)) return null;
  const len = Math.hypot(...plane.normal);
  if (Math.abs(len - 1) > 1e-5) return null;
  const N = plane.normal, D = plane.constant, epsilon = 1e-7, outputs = [[], []], segments = [], read = (i) => {
    const j = index ? index.getX(i) : i;
    return [p.getX(j), p.getY(j), p.getZ(j), n.getX(j), n.getY(j), n.getZ(j), uv?.getX(j) || 0, uv?.getY(j) || 0, j];
  };
  const dist = (v2) => {
    const q = v2[0] * N[0] + v2[1] * N[1] + v2[2] * N[2] - D;
    return Math.abs(q) < epsilon ? 0 : q;
  }, mix = (a, b, t) => {
    const r = Array.from({ length: 8 }, (_, i) => a[i] + (b[i] - a[i]) * t), l = Math.hypot(r[3], r[4], r[5]) || 1;
    r[8] = "e:" + Math.min(a[8], b[8]) + "," + Math.max(a[8], b[8]);
    r[3] /= l;
    r[4] /= l;
    r[5] /= l;
    return r;
  };
  const key = (v2) => v2.slice(0, 3).map((x) => Math.round(x / epsilon)).join(","), append = (out, a, b, c) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], area = Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]);
    if (area > 1e-18) out.push(a, b, c);
  };
  for (let i = 0; i < count; i += 3) {
    const vs = [read(i), read(i + 1), read(i + 2)], ds = vs.map(dist), cut = /* @__PURE__ */ new Map();
    if (vs.some((v2) => v2.slice(0, 8).some((x) => !Number.isFinite(x)))) return null;
    for (let j = 0; j < 3; j++) {
      const k = (j + 1) % 3;
      if (ds[j] === 0) cut.set(key(vs[j]), vs[j]);
      if (ds[j] * ds[k] < 0) {
        const v2 = mix(vs[j], vs[k], ds[j] / (ds[j] - ds[k]));
        cut.set(key(v2), v2);
      }
    }
    if (cut.size === 2) segments.push([...cut.values()]);
    else if (cut.size > 2) return null;
    for (let side = 0; side < 2; side++) {
      const sign = side ? 1 : -1, polygon = [];
      let a = vs[2], da = ds[2];
      for (let j = 0; j < 3; j++) {
        const b = vs[j], db = ds[j];
        if (da * db < 0) polygon.push(mix(a, b, da / (da - db)));
        if (db * sign >= 0) polygon.push(b);
        a = b;
        da = db;
      }
      for (let j = 1; j + 1 < polygon.length; j++) append(outputs[side], polygon[0], polygon[j], polygon[j + 1]);
    }
  }
  if (!segments.length || !outputs[0].length || !outputs[1].length) return null;
  const vertices = /* @__PURE__ */ new Map(), edges = /* @__PURE__ */ new Map();
  for (const [a, b] of segments) {
    const ka = key(a), kb = key(b);
    if (ka === kb) continue;
    vertices.set(ka, a);
    vertices.set(kb, b);
    for (const [u2, v2] of [[ka, kb], [kb, ka]]) {
      let list = edges.get(u2);
      if (!list) edges.set(u2, list = []);
      if (!list.includes(v2)) list.push(v2);
    }
  }
  if ([...edges.values()].some((a) => a.length !== 2)) return null;
  const axis = Math.abs(N[0]) < 0.7 ? [1, 0, 0] : [0, 1, 0], u = new THREE.Vector3(...axis).cross(new THREE.Vector3(...N)).normalize(), v = new THREE.Vector3(...N).cross(u), loops = [], visited = /* @__PURE__ */ new Set();
  for (const start of edges.keys()) if (!visited.has(start)) {
    const loop = [];
    let previous = null, current = start;
    do {
      if (visited.has(current)) return null;
      visited.add(current);
      loop.push(vertices.get(current));
      const next = edges.get(current).find((x) => x !== previous);
      previous = current;
      current = next;
    } while (current !== start && loop.length <= edges.size);
    if (current !== start || loop.length < 3) return null;
    loops.push(loop);
  }
  const project = (a) => new THREE.Vector2(a[0] * u.x + a[1] * u.y + a[2] * u.z, a[0] * v.x + a[1] * v.y + a[2] * v.z), polys = loops.map((l) => l.map(project)), inside = (p2, poly) => {
    let yes = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a.y > p2.y !== b.y > p2.y && p2.x < (b.x - a.x) * (p2.y - a.y) / (b.y - a.y) + a.x) yes = !yes;
    }
    return yes;
  }, depth = polys.map((p2, i) => polys.reduce((s, q, j) => s + (i !== j && inside(p2[0], q) ? 1 : 0), 0));
  let capTriangles = 0;
  for (let i = 0; i < loops.length; i++) {
    if (depth[i] % 2) continue;
    const holes = loops.map((l, j) => j).filter((j) => depth[j] === depth[i] + 1 && inside(polys[j][0], polys[i])), all = [...loops[i], ...holes.flatMap((j) => loops[j])], coords = [...polys[i], ...holes.flatMap((j) => polys[j])], triangles = THREE.ShapeUtils.triangulateShape(polys[i], holes.map((j) => polys[j]));
    const used = new Set(triangles.flat()), unused = coords.map((q, k) => k).filter((k) => !used.has(k)), refined = [];
    const pending = triangles.slice();
    while (pending.length) {
      const tri = pending.pop();
      let divided = false;
      for (let e = 0; e < 3 && !divided; e++) {
        const a = tri[e], b = tri[(e + 1) % 3], c = tri[(e + 2) % 3], dx = coords[b].x - coords[a].x, dy = coords[b].y - coords[a].y, length = dx * dx + dy * dy, mids = [];
        for (const k of unused) {
          const px = coords[k].x - coords[a].x, py = coords[k].y - coords[a].y, t = (px * dx + py * dy) / length;
          if (t > 1e-10 && t < 1 - 1e-10 && Math.abs(px * dy - py * dx) < 1e-9 * Math.sqrt(length)) mids.push({ k, t });
        }
        if (mids.length) {
          mids.sort((x, y) => x.t - y.t);
          const chain = [a, ...mids.map((q) => q.k), b];
          for (let j = 0; j + 1 < chain.length; j++) pending.push([chain[j], chain[j + 1], c]);
          divided = true;
        }
      }
      if (!divided) refined.push(tri);
      if (refined.length + pending.length > MAX_FRACTURE_TRIANGLES) return null;
    }
    for (const ids of refined) {
      let [a, b, c] = ids;
      const area = (coords[b].x - coords[a].x) * (coords[c].y - coords[a].y) - (coords[b].y - coords[a].y) * (coords[c].x - coords[a].x);
      if (area < 0) [b, c] = [c, b];
      for (let side = 0; side < 2; side++) {
        const sign = side ? -1 : 1, order = side ? [a, c, b] : [a, b, c], cap = order.map((k) => [...all[k].slice(0, 3), N[0] * sign, N[1] * sign, N[2] * sign, 0, 0, "c:" + key(all[k])]);
        append(outputs[side], ...cap);
      }
      capTriangles++;
    }
  }
  if (!capTriangles || outputs.some((a) => a.length / 3 > MAX_FRACTURE_TRIANGLES)) return null;
  function build(values) {
    const positions = [], normals = [], uvs = [], indices = [], unique = /* @__PURE__ */ new Map();
    let volume = 0;
    for (const a of values) {
      let i = unique.get(a[8]);
      if (i === void 0) {
        i = positions.length / 3;
        unique.set(a[8], i);
        positions.push(a[0], a[1], a[2]);
        normals.push(a[3], a[4], a[5]);
        uvs.push(a[6], a[7]);
      }
      indices.push(i);
    }
    for (let i = 0; i < values.length; i += 3) {
      const a = values[i], b = values[i + 1], c = values[i + 2];
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData = { fracturedRock: true, volume, capTriangles };
    return g;
  }
  const remaining = build(outputs[0]), detached = build(outputs[1]);
  if (remaining.userData.volume <= 1e-6 || detached.userData.volume <= 1e-6) {
    remaining.dispose();
    detached.dispose();
    return null;
  }
  return { remaining, detached, plane: { normal: [...N], constant: D }, triangles: count / 3, capTriangles, loops: loops.length };
}

// rock-contact-fracture.js
function weldPositions(positions) {
  const cells = /* @__PURE__ */ new Map(), epsilon = 2e-6, cellSize = epsilon * 2;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2], cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize), cz = Math.floor(z / cellSize);
    let found = -1;
    for (let a = -1; a <= 1 && found < 0; a++) for (let b = -1; b <= 1 && found < 0; b++) for (let c = -1; c <= 1 && found < 0; c++) {
      const list = cells.get(cx + a + "," + (cy + b) + "," + (cz + c));
      if (!list) continue;
      for (const j of list) if (Math.hypot(positions[j] - x, positions[j + 1] - y, positions[j + 2] - z) < epsilon) {
        found = j;
        break;
      }
    }
    if (found >= 0) {
      positions[i] = positions[found];
      positions[i + 1] = positions[found + 1];
      positions[i + 2] = positions[found + 2];
    } else {
      const key = cx + "," + cy + "," + cz;
      let list = cells.get(key);
      if (!list) cells.set(key, list = []);
      list.push(i);
    }
  }
}
function stitchPartitionEdges(positions, normals, uvs, indices) {
  const count = positions.length / 3 + 1, canonical = /* @__PURE__ */ new Map(), ids = [], representatives = [], edges = /* @__PURE__ */ new Map();
  for (let i = 0; i < positions.length / 3; i++) {
    const key = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]].map((x) => Math.round(x * 1e5)).join(",");
    let id = canonical.get(key);
    if (id === void 0) {
      id = representatives.length;
      canonical.set(key, id);
      representatives.push(i);
    }
    ids.push(id);
  }
  const edgeKey = (a, b) => a < b ? a * count + b : b * count + a;
  for (let i = 0; i < indices.length; i += 3) {
    const a = ids[indices[i]], b = ids[indices[i + 1]], c = ids[indices[i + 2]];
    if (a === b || b === c || a === c) continue;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(u, v);
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  const boundary = /* @__PURE__ */ new Set();
  for (const [key, n] of edges) if (n === 1) {
    boundary.add(Math.floor(key / count));
    boundary.add(key % count);
  }
  const candidates = [...boundary].map((id) => representatives[id]), out = [];
  for (let i = 0; i < indices.length; i += 3) {
    const queue = [indices.slice(i, i + 3)];
    while (queue.length) {
      const tri = queue.pop();
      let split = false;
      for (let e = 0; e < 3 && !split; e++) {
        const a = tri[e], b = tri[(e + 1) % 3], c = tri[(e + 2) % 3], aid = ids[a], bid = ids[b];
        if (edges.get(edgeKey(aid, bid)) !== 1) continue;
        const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2], dx = positions[b * 3] - ax, dy = positions[b * 3 + 1] - ay, dz = positions[b * 3 + 2] - az, length = dx * dx + dy * dy + dz * dz, mids = [];
        for (const j of candidates) {
          const px = positions[j * 3] - ax, py = positions[j * 3 + 1] - ay, pz = positions[j * 3 + 2] - az, t = (px * dx + py * dy + pz * dz) / length;
          if (t <= 1e-6 || t >= 1 - 1e-6) continue;
          const error = Math.hypot(px - t * dx, py - t * dy, pz - t * dz);
          if (error > 2e-5 || error > 2e-6 && (edges.get(edgeKey(aid, ids[j])) !== 1 || edges.get(edgeKey(ids[j], bid)) !== 1)) continue;
          mids.push({ j, t });
        }
        if (!mids.length) continue;
        mids.sort((x, y) => x.t - y.t);
        const chain = [a];
        let prior = -1;
        for (const { j, t } of mids) {
          if (t - prior < 1e-6) continue;
          prior = t;
          const at = positions.length / 3;
          positions.push(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
          ids.push(ids[j]);
          let nx = normals[a * 3] + (normals[b * 3] - normals[a * 3]) * t, ny = normals[a * 3 + 1] + (normals[b * 3 + 1] - normals[a * 3 + 1]) * t, nz = normals[a * 3 + 2] + (normals[b * 3 + 2] - normals[a * 3 + 2]) * t, l = Math.hypot(nx, ny, nz) || 1;
          normals.push(nx / l, ny / l, nz / l);
          uvs.push(uvs[a * 2] + (uvs[b * 2] - uvs[a * 2]) * t, uvs[a * 2 + 1] + (uvs[b * 2 + 1] - uvs[a * 2 + 1]) * t);
          chain.push(at);
        }
        chain.push(b);
        for (let j = 0; j + 1 < chain.length; j++) queue.push([chain[j], chain[j + 1], c]);
        split = true;
      }
      if (!split) out.push(...tri);
      if (out.length / 3 + queue.length > MAX_FRACTURE_TRIANGLES) return null;
    }
  }
  return out;
}
function closedSolid(geometry) {
  const p = geometry.attributes.position, ix = geometry.index, keys = Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)].map((x) => Math.round(x * 1e5)).join(",")), edges = /* @__PURE__ */ new Map();
  for (let i = 0; i < ix.count; i += 3) {
    const tri = [keys[ix.getX(i)], keys[ix.getX(i + 1)], keys[ix.getX(i + 2)]];
    if (new Set(tri).size < 3) continue;
    for (let j = 0; j < 3; j++) {
      const a = tri[j], b = tri[(j + 1) % 3], key = a < b ? a + "|" + b : b + "|" + a;
      let edge = edges.get(key);
      if (!edge) edges.set(key, edge = [0, 0]);
      edge[0]++;
      edge[1] += a < b ? 1 : -1;
    }
  }
  for (const edge of edges.values()) if (edge[0] !== 2 || edge[1] !== 0) return false;
  return true;
}
function splitContactRock(THREE, geometry, matrix, point, normal, { spin = 0.37 } = {}) {
  const n = normal.clone().normalize(), u = new THREE.Vector3(Math.abs(n.y) < 0.8 ? 0 : 1, Math.abs(n.y) < 0.8 ? 1 : 0, 0).cross(n).normalize(), v = n.clone().cross(u), inverse = matrix.clone().invert(), planes = [];
  function plane(wn, d) {
    const p = new THREE.Plane(wn, -d).applyMatrix4(inverse);
    return { normal: p.normal.toArray(), constant: -p.constant };
  }
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3 + spin, radial = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle)), wn = n.clone().multiplyScalar(0.65).addScaledVector(radial, -1).normalize();
    planes.push(plane(wn, wn.dot(point) - 0.22 / Math.hypot(1, 0.65)));
  }
  planes.push(plane(n, n.dot(point) - 0.13));
  planes.push(plane(n.clone().negate(), -n.dot(point) - 0.18));
  let current = geometry, owned = false;
  const outside = [];
  const dispose = () => {
    if (owned) current.dispose();
    for (const g of outside) g.dispose();
  };
  for (const cut of planes) {
    const p = current.attributes.position;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const d = p.getX(i) * cut.normal[0] + p.getY(i) * cut.normal[1] + p.getZ(i) * cut.normal[2] - cut.constant;
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    if (lo >= -1e-7) continue;
    if (hi <= 1e-7) {
      dispose();
      return null;
    }
    let split = splitRockGeometry(THREE, current, cut);
    for (let retry = 1; !split && retry <= 6; retry++) {
      cut.constant += retry * 137e-7;
      split = splitRockGeometry(THREE, current, cut);
    }
    if (!split) {
      dispose();
      return null;
    }
    if (owned) current.dispose();
    outside.push(split.remaining);
    current = split.detached;
    owned = true;
  }
  if (!owned || !outside.length) {
    dispose();
    return null;
  }
  const positions = [], normals = [], uvs = [], indices = [], geometryIndices = /* @__PURE__ */ new Map();
  let triangles = 0, volume = 0;
  const onCut = (g, a, b, c) => planes.some((cut) => [a, b, c].every((i) => Math.abs(g.attributes.normal.getX(i) * cut.normal[0] + g.attributes.normal.getY(i) * cut.normal[1] + g.attributes.normal.getZ(i) * cut.normal[2]) > 0.999999 && Math.abs(g.attributes.position.getX(i) * cut.normal[0] + g.attributes.position.getY(i) * cut.normal[1] + g.attributes.position.getZ(i) * cut.normal[2] - cut.constant) < 2e-6));
  function append(g, a, b, c, flip = false) {
    const p = g.attributes.position, n2 = g.attributes.normal, uv = g.attributes.uv;
    if (flip) [b, c] = [c, b];
    for (const i of [a, b, c]) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n2.getX(i) * (flip ? -1 : 1), ny = n2.getY(i) * (flip ? -1 : 1), nz = n2.getZ(i) * (flip ? -1 : 1), s = uv?.getX(i) || 0, t = uv?.getY(i) || 0, key = i * 2 + (flip ? 1 : 0);
      let unique = geometryIndices.get(g);
      if (!unique) geometryIndices.set(g, unique = /* @__PURE__ */ new Map());
      let index = unique.get(key);
      if (index === void 0) {
        index = positions.length / 3;
        unique.set(key, index);
        positions.push(x, y, z);
        normals.push(nx, ny, nz);
        uvs.push(s, t);
      }
      indices.push(index);
    }
    volume += (p.getX(a) * (p.getY(b) * p.getZ(c) - p.getZ(b) * p.getY(c)) + p.getY(a) * (p.getZ(b) * p.getX(c) - p.getX(b) * p.getZ(c)) + p.getZ(a) * (p.getX(b) * p.getY(c) - p.getY(b) * p.getX(c))) / 6;
    triangles++;
  }
  for (const g of outside) {
    const ix2 = g.index;
    for (let i = 0; i < ix2.count; i += 3) {
      const a = ix2.getX(i), b = ix2.getX(i + 1), c = ix2.getX(i + 2);
      if (!onCut(g, a, b, c)) append(g, a, b, c);
    }
  }
  const ix = current.index;
  for (let i = 0; i < ix.count; i += 3) {
    const a = ix.getX(i), b = ix.getX(i + 1), c = ix.getX(i + 2);
    if (onCut(current, a, b, c)) append(current, a, b, c, true);
  }
  weldPositions(positions);
  let stitched = stitchPartitionEdges(positions, normals, uvs, indices);
  if (stitched) stitched = stitchPartitionEdges(positions, normals, uvs, stitched);
  weldPositions(current.attributes.position.array);
  if (!stitched || stitched.length / 3 > MAX_FRACTURE_TRIANGLES || volume <= 1e-6) {
    dispose();
    return null;
  }
  for (const g of outside) g.dispose();
  const remaining = new THREE.BufferGeometry();
  remaining.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  remaining.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  remaining.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  remaining.setIndex(stitched);
  remaining.computeBoundingBox();
  remaining.computeBoundingSphere();
  remaining.userData = { fracturedRock: true, volume, contactLocal: true };
  if (!closedSolid(remaining) || !closedSolid(current)) {
    remaining.dispose();
    current.dispose();
    return null;
  }
  return { remaining, detached: current, plane: planes[3], triangles: (geometry.index?.count ?? geometry.attributes.position.count) / 3, contactLocal: true };
}
function trimBuriedRock(THREE, geometry, matrix, height) {
  const p = geometry.attributes.position, w = new THREE.Vector3(), center = geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(matrix), e = 0.15, h = height(center.x, center.z), normal = new THREE.Vector3((height(center.x - e, center.z) - height(center.x + e, center.z)) / (2 * e), 1, (height(center.x, center.z - e) - height(center.x, center.z + e)) / (2 * e)).normalize();
  let constant = normal.x * center.x + normal.y * h + normal.z * center.z, minGap = Infinity;
  for (let i = 0; i < p.count; i++) {
    w.fromBufferAttribute(p, i).applyMatrix4(matrix);
    const ground = height(w.x, w.z);
    minGap = Math.min(minGap, w.y - ground);
    constant = Math.max(constant, normal.x * w.x + normal.y * ground + normal.z * w.z);
  }
  if (minGap >= 2e-3) return geometry;
  const cut = new THREE.Plane(normal, -constant - 4e-3).applyMatrix4(matrix.clone().invert()), split = splitRockGeometry(THREE, geometry, { normal: cut.normal.toArray(), constant: -cut.constant });
  if (!split) {
    geometry.dispose();
    return null;
  }
  geometry.dispose();
  split.remaining.dispose();
  return split.detached;
}

// rock-shatter.js
var ROCK_SHATTER = Object.freeze({ minPieces: 5, maxPieces: 12, minPieceSize: 0.2, cutTries: 3 });
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function signedVolume(geometry) {
  const p = geometry.attributes.position, index = geometry.index, count = index ? index.count : p.count;
  let volume = 0;
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
    const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a), bx = p.getX(b), by = p.getY(b), bz = p.getZ(b), cx = p.getX(c), cy = p.getY(c), cz = p.getZ(c);
    volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return volume;
}
function bounds(geometry) {
  const p = geometry.attributes.position;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
    sx += x;
    sy += y;
    sz += z;
  }
  return { size: Math.max(x1 - x0, y1 - y0, z1 - z0), centre: [sx / p.count, sy / p.count, sz / p.count], minY: y0 };
}
function shatterRockGeometry(THREE, geometry, { pieces = 8, seed = 1, ground = null, minPieceSize = ROCK_SHATTER.minPieceSize, impact = null } = {}) {
  const random = mulberry(seed), wanted = Math.max(1, Math.min(ROCK_SHATTER.maxPieces, Math.round(pieces)));
  const owned = /* @__PURE__ */ new Set();
  let list = [{ geometry, volume: Math.abs(geometry.userData?.volume ?? signedVolume(geometry)), stuck: 0 }];
  let cuts = 0, failures = 0;
  while (list.length < wanted) {
    list.sort((a, b) => b.volume - a.volume);
    const target = list.find((item) => item.stuck < ROCK_SHATTER.cutTries);
    if (!target) break;
    const box = bounds(target.geometry);
    if (box.size < minPieceSize * 2) {
      target.stuck = ROCK_SHATTER.cutTries;
      continue;
    }
    const normal = new THREE.Vector3(random() - 0.5, (random() - 0.5) * 0.7, random() - 0.5);
    if (cuts === 0 && impact) normal.set(impact[0], impact[1] * 0.5, impact[2]).add(new THREE.Vector3(-impact[2], 0, impact[0]).multiplyScalar(random() - 0.5));
    if (normal.lengthSq() < 1e-6) normal.set(1, 0, 0);
    normal.normalize();
    const constant = normal.x * box.centre[0] + normal.y * box.centre[1] + normal.z * box.centre[2] + (random() - 0.5) * 0.22 * box.size;
    const split = splitRockGeometry(THREE, target.geometry, { normal: normal.toArray(), constant });
    cuts++;
    if (!split) {
      target.stuck++;
      failures++;
      continue;
    }
    if (owned.has(target.geometry)) {
      target.geometry.dispose();
      owned.delete(target.geometry);
    }
    list.splice(list.indexOf(target), 1);
    for (const part of [split.remaining, split.detached]) {
      owned.add(part);
      list.push({ geometry: part, volume: Math.abs(part.userData.volume), stuck: 0 });
    }
  }
  const out = [];
  for (const item of list) {
    let g = item.geometry;
    if (ground) {
      const p = g.attributes.position, n = ground.normal;
      let lowest = Infinity;
      for (let i = 0; i < p.count; i++) lowest = Math.min(lowest, p.getX(i) * n[0] + p.getY(i) * n[1] + p.getZ(i) * n[2] - ground.constant);
      if (lowest < -4e-3) {
        const split = splitRockGeometry(THREE, g, { normal: [...n], constant: ground.constant + 4e-3 });
        if (owned.has(g)) g.dispose();
        if (!split) continue;
        split.remaining.dispose();
        g = split.detached;
        owned.add(g);
        if (Math.abs(g.userData.volume) < 2e-4) {
          g.dispose();
          continue;
        }
      }
    }
    out.push(g);
  }
  return { pieces: out, cuts, failures };
}
function createRockShatter(THREE, { workerUrl = new URL("./rock-shatter-worker-D667JCJT.js", import.meta.url), onBite = null } = {}) {
  let worker = null, sequence = 0, disposed = false, failed = false;
  const waiting = /* @__PURE__ */ new Map(), rocks = /* @__PURE__ */ new Map();
  const decode = (piece) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(piece.position, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(piece.normal, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(piece.uv, 2));
    g.setIndex(new THREE.BufferAttribute(piece.index, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.userData = { fracturedRock: true, volume: piece.volume, ...piece.contactLocal ? { contactLocal: true } : {} };
    return g;
  };
  function ensureWorker() {
    if (worker || failed || disposed) return worker;
    try {
      worker = new Worker(workerUrl, { type: "module" });
      worker.onmessage = ({ data }) => {
        reportWorker(WORKER_NAMES.shatter, true);
        const wait = waiting.get(data.sequence);
        if (wait) {
          waiting.delete(data.sequence);
          wait(data);
        }
      };
      worker.onerror = (event) => {
        failed = true;
        reportWorker(WORKER_NAMES.shatter, false, event?.message || "worker failed");
        for (const wait of waiting.values()) wait({ ok: false, error: "worker failed" });
        waiting.clear();
      };
    } catch (error) {
      failed = true;
      worker = null;
      reportWorker(WORKER_NAMES.shatter, false, error?.message);
    }
    return worker;
  }
  const arrays = (geometry) => {
    const index = geometry.index ? Uint32Array.from(geometry.index.array) : null, position = geometry.attributes.position.array.slice(), normal = geometry.attributes.normal.array.slice();
    const uv = (geometry.attributes.uv?.array ?? new Float32Array(position.length / 3 * 2)).slice();
    return { message: { position, normal, uv, index }, transfer: [position.buffer, normal.buffer, uv.buffer, ...index ? [index.buffer] : []] };
  };
  function queue(id, geometry, matrix, { bite = null, options = {} } = {}) {
    if (disposed || !ensureWorker()) return null;
    let rock = rocks.get(id);
    if (!rock) rocks.set(id, rock = { chain: Promise.resolve(null), latest: null, pending: 0 });
    rock.pending++;
    const elements = matrix.elements.slice();
    rock.chain = rock.chain.then((previous) => new Promise((resolve) => {
      if (disposed || failed) {
        resolve(previous);
        return;
      }
      const base = previous?.remaining ?? geometry, { message, transfer } = arrays(base), mine = ++sequence;
      waiting.set(mine, (data) => {
        if (!data.ok) {
          resolve(previous);
          return;
        }
        const remaining = data.remaining ? decode(data.remaining) : null;
        previous?.pieces?.forEach((g) => g.dispose());
        const result = { remaining: remaining ?? previous?.remaining ?? null, plane: data.plane ?? null, pieces: data.pieces.map(decode), bitten: !!remaining };
        if (remaining) onBite?.(id, result);
        resolve(result);
      });
      worker.postMessage({ sequence: mine, ...message, matrix: elements, bite, options }, transfer);
    })).then((result) => {
      rock.pending--;
      rock.latest = result;
      return result;
    });
    return rock.chain;
  }
  function take(id) {
    const rock = rocks.get(id);
    if (!rock || rock.pending || !rock.latest?.pieces?.length) return null;
    const pieces = rock.latest.pieces;
    rock.latest.pieces = null;
    return pieces;
  }
  const ready = (id) => rocks.get(id)?.chain ?? null;
  const pending = (id) => rocks.get(id)?.pending ?? 0;
  function forget(id) {
    const rock = rocks.get(id);
    rock?.latest?.pieces?.forEach((g) => g.dispose());
    rocks.delete(id);
  }
  function dispose() {
    disposed = true;
    worker?.terminate();
    worker = null;
    for (const wait of waiting.values()) wait({ ok: false });
    waiting.clear();
    for (const id of [...rocks.keys()]) forget(id);
  }
  return { queue, take, ready, pending, forget, dispose, stats: () => ({ rocks: rocks.size, waiting: waiting.size, failed, workerStarted: !!worker }) };
}
var ROCK_DUST = Object.freeze({ capacity: 96 });
function createRockDust(THREE, { parent, camera }) {
  const N = ROCK_DUST.capacity;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("dustAlpha", alpha);
  const material = new THREE.MeshLambertMaterial({ color: 16777215, transparent: true, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "attribute float dustAlpha;varying float vDustAlpha;varying vec2 vDustUv;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvDustAlpha=dustAlpha;vDustUv=uv;");
    shader.fragmentShader = "varying float vDustAlpha;varying vec2 vDustUv;\n" + shader.fragmentShader.replace("#include <alphatest_fragment>", `
     vec2 dustP=vDustUv*2.-1.;
     float dustR=length(dustP);
     // A lumpy, soft-edged puff rather than a disc.
     float dustLump=.82+.18*sin(atan(dustP.y,dustP.x)*5.+vDustAlpha*31.)*sin(dustR*9.);
     diffuseColor.a*=vDustAlpha*(1.-smoothstep(.15,1.,dustR*(1.1-.1*dustLump)));
     if(diffuseColor.a<.004)discard;
     #include <alphatest_fragment>`);
  };
  material.customProgramCacheKey = () => "rock-dust-v1";
  const mesh = new THREE.InstancedMesh(geometry, material, N);
  mesh.name = "mining-dust";
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.renderOrder = 3;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.visible = false;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  parent.add(mesh);
  const puffs = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), color = new THREE.Color();
  let seed = 1;
  const random = () => (seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296;
  function burst(point, { count = 8, size = 0.35, speed = 1.2, rise = 0.6, life = 1.6, tint = 10129280, direction = null, spread = 0.25 } = {}) {
    color.set(tint);
    for (let i = 0; i < count; i++) {
      if (puffs.length >= N) puffs.shift();
      const a = random() * Math.PI * 2, r = random(), v = speed * (0.35 + 0.65 * random());
      const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
      puffs.push({
        x: point.x + dx * spread,
        y: point.y + (random() - 0.3) * spread,
        z: point.z + dz * spread,
        vx: dx * v + (direction?.x || 0) * v * 0.8,
        vy: rise * (0.4 + random()),
        vz: dz * v + (direction?.z || 0) * v * 0.8,
        size: size * (0.6 + 0.7 * random()),
        grow: size * (1.2 + random()),
        age: 0,
        life: life * (0.65 + 0.6 * random()),
        r: color.r * (0.85 + 0.2 * random()),
        g: color.g * (0.85 + 0.2 * random()),
        b: color.b * (0.85 + 0.2 * random()),
        alpha: 0.32 + 0.3 * random(),
        seed: random()
      });
    }
    mesh.visible = true;
  }
  function update(dt) {
    if (!puffs.length) {
      if (mesh.visible) {
        mesh.visible = false;
        mesh.count = 0;
      }
      return;
    }
    dt = Math.min(0.1, Math.max(0, dt));
    camera.getWorldQuaternion(q);
    let n = 0;
    for (let i = puffs.length - 1; i >= 0; i--) {
      const d = puffs[i];
      d.age += dt;
      if (d.age >= d.life) {
        puffs.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-dt * 2.6);
      d.vx *= drag;
      d.vz *= drag;
      d.vy = d.vy * drag + dt * 0.12;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
    }
    for (const d of puffs) {
      const t = d.age / d.life, size = d.size + d.grow * (1 - Math.exp(-t * 3));
      s.setScalar(size);
      p.set(d.x, d.y, d.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(n, m);
      mesh.instanceColor.setXYZ(n, d.r, d.g, d.b);
      alpha.setX(n, d.alpha * Math.min(1, t * 8) * (1 - t) * (1 - t) + d.seed * 1e-4);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    alpha.needsUpdate = true;
  }
  function dispose() {
    parent.remove(mesh);
    geometry.dispose();
    material.dispose();
    puffs.length = 0;
  }
  return { burst, update, dispose, stats: () => ({ puffs: puffs.length, capacity: N }) };
}

export {
  splitContactRock,
  trimBuriedRock,
  shatterRockGeometry,
  createRockShatter,
  createRockDust
};
