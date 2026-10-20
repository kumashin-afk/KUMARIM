// worldgen/det-math.js
var PI = 3.141592653589793;
var TAU = 6.283185307179586;
var HALF_PI = 1.5707963267948966;
var PIO2_HI = 1.5707963267341256;
var PIO2_LO = 6077100506506192e-26;
var INV_PIO2 = 0.6366197723675814;
function sinPoly(r) {
  const r2 = r * r;
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800 + r2 * (1 / 6227020800 - r2 / 1307674368e3)))))));
}
function cosPoly(r) {
  const r2 = r * r;
  return 1 + r2 * (-0.5 + r2 * (1 / 24 + r2 * (-1 / 720 + r2 * (1 / 40320 + r2 * (-1 / 3628800 + r2 * (1 / 479001600 - r2 / 87178291200))))));
}
function dsin(x) {
  const k = Math.round(x * INV_PIO2), r = x - k * PIO2_HI - k * PIO2_LO, q = (k % 4 + 4) % 4;
  return q === 0 ? sinPoly(r) : q === 1 ? cosPoly(r) : q === 2 ? -sinPoly(r) : -cosPoly(r);
}
function dcos(x) {
  const k = Math.round(x * INV_PIO2), r = x - k * PIO2_HI - k * PIO2_LO, q = (k % 4 + 4) % 4;
  return q === 0 ? cosPoly(r) : q === 1 ? -sinPoly(r) : q === 2 ? -cosPoly(r) : sinPoly(r);
}
var TAN_PI_12 = 0.2679491924311227;
var SQRT3 = 1.7320508075688772;
var PI_6 = 0.5235987755982988;
function atanSmall(u) {
  const u2 = u * u;
  return u * (1 + u2 * (-1 / 3 + u2 * (1 / 5 + u2 * (-1 / 7 + u2 * (1 / 9 + u2 * (-1 / 11 + u2 * (1 / 13 + u2 * (-1 / 15 + u2 * (1 / 17 - u2 / 19)))))))));
}
function datan(t) {
  const neg = t < 0;
  let a = neg ? -t : t, off = 0, inv = false;
  if (a > 1) {
    a = 1 / a;
    inv = true;
  }
  if (a > TAN_PI_12) {
    a = (a * SQRT3 - 1) / (a + SQRT3);
    off = PI_6;
  }
  let v = off + atanSmall(a);
  if (inv) v = HALF_PI - v;
  return neg ? -v : v;
}
function datan2(y, x) {
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
}
var dhypot = (x, y) => Math.sqrt(x * x + y * y);
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = clamp01(0.5 + 0.5 * (b - a) / k);
  return b + (a - b) * h - k * h * (1 - h);
}
function smax(a, b, k) {
  return -smin(-a, -b, k);
}
function mix32(h) {
  h = Math.imul(h ^ h >>> 16, 2146121005);
  h = Math.imul(h ^ h >>> 15, 2221713035);
  return (h ^ h >>> 16) >>> 0;
}
function hash3(seed, a, b, c) {
  return mix32((seed ^ Math.imul(a | 0, 73244475) ^ Math.imul(b | 0, 295559667) ^ Math.imul(c | 0, 668265261)) >>> 0);
}
var hashUnit = (seed, a, b, c) => hash3(seed, a, b, c) / 4294967296;
function createRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    // Unit direction without trigonometry (rejection sampling in the unit disc).
    direction: () => {
      for (; ; ) {
        const x = next() * 2 - 1, z = next() * 2 - 1, d = x * x + z * z;
        if (d > 0.04 && d <= 1) {
          const l = Math.sqrt(d);
          return { x: x / l, z: z / l };
        }
      }
    }
  };
}
var deriveSeed = (seed, salt) => hash3(seed >>> 0, salt | 0, 24301, 1821);

// worldgen/noise.js
var GX = new Float64Array([1, 0.9238795325112867, 0.7071067811865476, 0.3826834323650898, 0, -0.3826834323650898, -0.7071067811865476, -0.9238795325112867, -1, -0.9238795325112867, -0.7071067811865476, -0.3826834323650898, 0, 0.3826834323650898, 0.7071067811865476, 0.9238795325112867]);
var GZ = new Float64Array([0, 0.3826834323650898, 0.7071067811865476, 0.9238795325112867, 1, 0.9238795325112867, 0.7071067811865476, 0.3826834323650898, 0, -0.3826834323650898, -0.7071067811865476, -0.9238795325112867, -1, -0.9238795325112867, -0.7071067811865476, -0.3826834323650898]);
var fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function gnoise(seed, x, z, salt = 0) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const h00 = hash3(seed, ix, iz, salt) & 15, h10 = hash3(seed, ix + 1, iz, salt) & 15;
  const h01 = hash3(seed, ix, iz + 1, salt) & 15, h11 = hash3(seed, ix + 1, iz + 1, salt) & 15;
  const n00 = GX[h00] * fx + GZ[h00] * fz, n10 = GX[h10] * (fx - 1) + GZ[h10] * fz;
  const n01 = GX[h01] * fx + GZ[h01] * (fz - 1), n11 = GX[h11] * (fx - 1) + GZ[h11] * (fz - 1);
  const u = fade(fx), v = fade(fz);
  const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
  return (a + (b - a) * v) * 1.4142135623730951;
}
var RC = 0.8;
var RS = 0.6;
function fbm(seed, x, z, octaves = 4, salt = 0, lacunarity = 2, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, px = x, pz = z;
  for (let i = 0; i < octaves; i++) {
    sum += amp * gnoise(seed, px, pz, salt + i * 101);
    norm += amp;
    amp *= gain;
    const nx = (px * RC - pz * RS) * lacunarity + 17.31, nz = (px * RS + pz * RC) * lacunarity - 9.73;
    px = nx;
    pz = nz;
  }
  return sum / norm;
}
function ridged(seed, x, z, octaves = 4, salt = 0, lacunarity = 2.05, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, px = x, pz = z, weight = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(gnoise(seed, px, pz, salt + i * 131));
    n *= n;
    n *= weight;
    weight = n * 1.6;
    if (weight > 1) weight = 1;
    sum += amp * n;
    norm += amp;
    amp *= gain;
    const nx = (px * RC - pz * RS) * lacunarity + 31.7, nz = (px * RS + pz * RC) * lacunarity + 4.1;
    px = nx;
    pz = nz;
  }
  return sum / norm;
}

// worldgen/erosion.js
var SQRT2 = 1.4142135623730951;
var DX = [1, -1, 0, 0, 1, -1, 1, -1];
var DZ = [0, 0, 1, -1, 1, 1, -1, -1];
var DD = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];
function createFlowState(nx, nz) {
  const n = nx * nz;
  return {
    nx,
    nz,
    n,
    receiver: new Int32Array(n),
    rdist: new Float64Array(n),
    stack: new Int32Array(n),
    count: 0,
    donorCount: new Int32Array(n),
    donors: new Int32Array(n * 8),
    area: new Float64Array(n)
  };
}
function computeReceivers(state, h, fixed, cell, jitter = 0, jitterSeed = 0) {
  const { nx, nz, receiver, rdist } = state;
  const mixSeed = Math.imul(jitterSeed | 0, 739982445) ^ 695872825;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix;
    receiver[i] = i;
    rdist[i] = cell;
    if (fixed[i]) continue;
    let best = 0, bestJ = i, bestD = cell;
    const hi = h[i];
    for (let k = 0; k < 8; k++) {
      const jx = ix + DX[k], jz = iz + DZ[k];
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
      const j = jz * nx + jx, d = DD[k] * cell;
      let s = (hi - h[j]) / d;
      if (s <= 0) continue;
      if (jitter > 0) {
        let r = Math.imul((i << 3 | k) ^ mixSeed, 2654435761);
        r ^= r >>> 15;
        r = Math.imul(r, 2246822507);
        r ^= r >>> 13;
        s *= 1 - jitter + 2 * jitter * ((r >>> 8) / 16777216);
      }
      if (s > best) {
        best = s;
        bestJ = j;
        bestD = d;
      }
    }
    receiver[i] = bestJ;
    rdist[i] = bestD;
  }
}
function buildStack(state) {
  const { n, receiver, donorCount, donors, stack } = state;
  donorCount.fill(0);
  for (let i = 0; i < n; i++) {
    const r = receiver[i];
    if (r !== i) donors[r * 8 + donorCount[r]++] = i;
  }
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (receiver[i] !== i) continue;
    let head = count;
    stack[count++] = i;
    while (head < count) {
      const node = stack[head++], c = donorCount[node];
      for (let k = 0; k < c; k++) stack[count++] = donors[node * 8 + k];
    }
  }
  state.count = count;
  return count;
}
function accumulateArea(state, cellArea, weight = null) {
  const { area, stack, receiver, count } = state;
  if (weight) for (let i = 0; i < state.n; i++) area[i] = cellArea * weight[i];
  else area.fill(cellArea);
  for (let k = count - 1; k >= 0; k--) {
    const i = stack[k], r = receiver[i];
    if (r !== i) area[r] += area[i];
  }
}
function streamPowerStep(state, h, uplift, erodibility, dt, channel = null) {
  const { stack, receiver, rdist, area, count } = state;
  const a0 = channel ? channel.from : 0, span = channel ? channel.to - channel.from : 1, floor = channel ? channel.floor : 1;
  for (let k = 0; k < count; k++) {
    const i = stack[k], r = receiver[i];
    if (r === i) continue;
    let K = erodibility[i];
    if (channel) {
      let t = (area[i] - a0) / span;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      K *= floor + (1 - floor) * t * t * (3 - 2 * t);
    }
    const f = dt * K * Math.sqrt(area[i]) / rdist[i];
    h[i] = (h[i] + dt * uplift[i] + f * h[r]) / (1 + f);
  }
}
function diffuse(h, nx, nz, fixed, rate, passes, scratch) {
  const tmp = scratch || new Float64Array(h.length);
  for (let p = 0; p < passes; p++) {
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      if (fixed[i] || ix === 0 || iz === 0 || ix === nx - 1 || iz === nz - 1) {
        tmp[i] = h[i];
        continue;
      }
      const lap = h[i - 1] + h[i + 1] + h[i - nx] + h[i + nx] - 4 * h[i];
      tmp[i] = h[i] + rate * lap;
    }
    h.set(tmp);
  }
}
function relaxSlopes(h, nx, nz, fixed, cell, maxSlope, passes, fraction = 0.5) {
  for (let p = 0; p < passes; p++) {
    for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
      const i = iz * nx + ix;
      if (fixed[i]) continue;
      for (let k = 0; k < 8; k++) {
        const j = (iz + DZ[k]) * nx + ix + DX[k], limit = maxSlope * DD[k] * cell, diff = h[i] - h[j] - limit;
        if (diff > 0) {
          const move = diff * fraction * 0.5;
          h[i] -= move;
          if (!fixed[j]) h[j] += move;
        }
      }
    }
  }
}
function priorityFlood(h, nx, nz, fixed, out, epsilon = 1e-4, noiseSeed = 0) {
  const n = nx * nz, closed = new Uint8Array(n);
  const heap = new Int32Array(n);
  let size = 0;
  const less = (a, b) => out[a] < out[b] || out[a] === out[b] && a < b;
  const push = (i) => {
    let c = size++;
    heap[c] = i;
    while (c > 0) {
      const p = c - 1 >> 1;
      if (!less(heap[c], heap[p])) break;
      const t = heap[c];
      heap[c] = heap[p];
      heap[p] = t;
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--size];
    let c = 0;
    for (; ; ) {
      const l = 2 * c + 1, r = l + 1;
      let m = c;
      if (l < size && less(heap[l], heap[m])) m = l;
      if (r < size && less(heap[r], heap[m])) m = r;
      if (m === c) break;
      const t = heap[c];
      heap[c] = heap[m];
      heap[m] = t;
      c = m;
    }
    return top;
  };
  out.set(h);
  for (let i = 0; i < n; i++) {
    const ix = i % nx, iz = (i - ix) / nx, edge = ix === 0 || iz === 0 || ix === nx - 1 || iz === nz - 1;
    if (!fixed[i] && !edge) continue;
    closed[i] = 1;
    if (edge) {
      push(i);
      continue;
    }
    for (let k = 0; k < 8; k++) {
      const j = (iz + DZ[k]) * nx + ix + DX[k];
      if (!fixed[j]) {
        push(i);
        break;
      }
    }
  }
  while (size) {
    const i = pop(), ix = i % nx, iz = (i - ix) / nx;
    for (let k = 0; k < 8; k++) {
      const jx = ix + DX[k], jz = iz + DZ[k];
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
      const j = jz * nx + jx;
      if (closed[j]) continue;
      closed[j] = 1;
      let e = epsilon * DD[k];
      if (noiseSeed) {
        let r = Math.imul(j ^ noiseSeed, 2654435761);
        r ^= r >>> 15;
        r = Math.imul(r, 2246822507);
        r ^= r >>> 13;
        e *= 0.25 + 1.5 * ((r >>> 8) / 16777216);
      }
      const floor = out[i] + e;
      if (out[j] < floor) out[j] = floor;
      push(j);
    }
  }
  return out;
}
var NEIGHBOUR_DX = DX;
var NEIGHBOUR_DZ = DZ;

// worldgen/island-shape.js
var ISLAND_SHAPE = Object.freeze({
  version: "shape-v1",
  // Mainland area (m²): about the former elliptical island's.
  area: 92e5,
  // The camp's least distance to the sea (m), and the sea kept between the
  // land and the grid's edge (m) for the shelf and the shore shaping.
  campDepth: 380,
  margin: 460,
  // Raster used to size, place and measure the shape (m).
  raster: 32,
  // Islets: their least gap to the mainland and their size (m).
  isletGap: 70,
  isletRadius: Object.freeze([34, 150])
});
var bell = (t) => {
  if (t >= 1) return 0;
  const u = 1 - t * t;
  return u * u;
};
function shapeParams(seed, attempt) {
  const rng = createRng(deriveSeed(seed, 4100 + attempt * 17));
  const tame = 1 - Math.min(0.8, attempt * 0.25);
  const H = 900;
  const elong = Math.pow(rng.next(), 0.8) * tame;
  const length = elong * 3600;
  const bendPick = rng.next(), bendMag = bendPick < 0.42 ? rng.range(0, 0.18) : bendPick < 0.8 ? rng.range(0.18, 0.55) : rng.range(0.55, 0.95);
  const bend = (rng.chance(0.5) ? 1 : -1) * bendMag * PI * tame;
  const wiggle = rng.chance(0.35) ? rng.range(0.25, 0.9) * tame : rng.range(0, 0.15);
  const wigglePhase = rng.range(0, TAU);
  const taper = rng.range(-0.45, 0.45);
  const neck = rng.chance(0.3 * tame) ? rng.range(0.35, 0.72) : 0, neckAt = rng.range(0.32, 0.68);
  const widthSalt = rng.int(1, 1 << 20);
  const lobes = [];
  for (let k = pickCount(rng, [0.22, 0.4, 0.26, 0.12]); k > 0; k--) {
    lobes.push({ t: rng.range(0.08, 0.92), side: rng.chance(0.5) ? 1 : -1, offset: rng.range(0.45, 1), a: H * rng.range(0.32, 0.72), b: H * rng.range(0.24, 0.52), turn: rng.range(-1.2, 1.2) });
  }
  const peninsulas = [];
  for (let k = pickCount(rng, [0.42, 0.38, 0.15, 0.05]); k > 0; k--) {
    peninsulas.push({ t: rng.range(0.05, 0.95), side: rng.chance(0.5) ? 1 : -1, turn: rng.range(-0.65, 0.65), reach: rng.range(260, 1150), width: rng.range(110, 280), bend: rng.range(-0.5, 0.5) });
  }
  const inlets = [];
  for (let k = pickCount(rng, [0.28, 0.36, 0.24, 0.12]); k > 0; k--) {
    inlets.push({ t: rng.range(0.1, 0.9), side: rng.chance(0.5) ? 1 : -1, turn: rng.range(-0.55, 0.55), depth: rng.range(0.3, 0.95), width: rng.range(150, 380), bend: rng.range(-0.6, 0.6) });
  }
  return {
    H,
    elong,
    length,
    bend,
    wiggle,
    wigglePhase,
    taper,
    neck,
    neckAt,
    widthSalt,
    lobes,
    peninsulas,
    inlets,
    warp: { a1: rng.range(70, 230), l1: rng.range(620, 1100), a2: rng.range(22, 58), l2: rng.range(170, 290), salt: rng.int(1, 1 << 20) },
    rough: { a: rng.range(22, 56), l: rng.range(140, 260), b: rng.range(50, 130), m: rng.range(380, 620), salt: rng.int(1, 1 << 20) },
    islets: pickCount(rng, [0.14, 0.18, 0.2, 0.16, 0.12, 0.1, 0.06, 0.04]),
    isletSalt: rng.int(1, 1 << 20)
  };
}
function pickCount(rng, weights) {
  let r = rng.next();
  for (let k = 0; k < weights.length; k++) {
    if (r < weights[k]) return k;
    r -= weights[k];
  }
  return weights.length - 1;
}
function createField(seed, P) {
  const N = 28, spine = [], ds = P.length / N;
  let x = 0, z = 0;
  const heading = (t) => P.bend * (t - 0.5) + P.wiggle * dsin(TAU * t + P.wigglePhase);
  for (let i = 0; i <= N; i++) {
    spine.push({ x, z, t: i / N });
    if (i < N) {
      const a = heading((i + 0.5) / N);
      x += dcos(a) * ds;
      z += dsin(a) * ds;
    }
  }
  let cx = 0, cz = 0;
  for (const p of spine) {
    cx += p.x;
    cz += p.z;
  }
  cx /= spine.length;
  cz /= spine.length;
  for (const p of spine) {
    p.x -= cx;
    p.z -= cz;
  }
  const halfWidth = (t) => {
    let w = P.H * (1 + P.taper * (2 * t - 1));
    if (P.neck > 0) w *= 1 - P.neck * bell(Math.abs(t - P.neckAt) / 0.2);
    w *= 1 + 0.16 * gnoise(seed, t * 3.1 + 0.7, 2.3, P.widthSalt);
    return Math.max(P.H * 0.14, w);
  };
  const at = (t) => {
    const f = clamp(t, 0, 1) * N, i = Math.min(N - 1, Math.floor(f)), u = f - i, a = spine[i], b = spine[i + 1];
    let tx = b.x - a.x, tz = b.z - a.z;
    const l = dhypot(tx, tz);
    if (l > 1e-9) {
      tx /= l;
      tz /= l;
    } else {
      tx = 1;
      tz = 0;
    }
    return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, tx, tz, nx: -tz, nz: tx };
  };
  const lobes = P.lobes.map((L) => {
    const s = at(L.t), w = halfWidth(L.t), cx2 = s.x + s.nx * L.side * w * L.offset, cz2 = s.z + s.nz * L.side * w * L.offset;
    const c = dcos(L.turn), sn = dsin(L.turn), ax = s.tx * c - s.nx * sn, az = s.tz * c - s.nz * sn;
    return { x: cx2, z: cz2, ax, az, a: L.a, b: L.b };
  });
  const arm = (A, inward) => {
    const s = at(A.t), w = halfWidth(A.t);
    const sx = s.nx * A.side, sz = s.nz * A.side, c = dcos(A.turn), sn = dsin(A.turn);
    let dx = sx * c - sz * sn, dz = sx * sn + sz * c;
    const len = inward ? w * A.depth + 160 : w * 0.55 + A.reach;
    const start = inward ? { x: s.x + sx * (w + 160), z: s.z + sz * (w + 160) } : { x: s.x + sx * w * 0.45, z: s.z + sz * w * 0.45 };
    if (inward) {
      dx = -dx;
      dz = -dz;
    }
    const pts = [], M = 8;
    let px = start.x, pz = start.z, hx = dx, hz = dz;
    for (let k = 0; k <= M; k++) {
      pts.push({ x: px, z: pz, u: k / M });
      const a = A.bend / M, ca = dcos(a), sa = dsin(a), nhx = hx * ca - hz * sa, nhz = hx * sa + hz * ca;
      hx = nhx;
      hz = nhz;
      px += hx * len / M;
      pz += hz * len / M;
    }
    return { pts, width: A.width, inward };
  };
  const peninsulas = P.peninsulas.map((A) => arm(A, false)), inlets = P.inlets.map((A) => arm(A, true));
  const segDist = (px, pz, pts) => {
    let best = Infinity, bu = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      const s = l2 > 0 ? clamp01(((px - a.x) * dx + (pz - a.z) * dz) / l2) : 0, ex = px - a.x - dx * s, ez = pz - a.z - dz * s, d = ex * ex + ez * ez;
      if (d < best) {
        best = d;
        bu = a.u + (b.u - a.u) * s;
      }
    }
    return { d: Math.sqrt(best), u: bu };
  };
  const spineDist = (px, pz) => {
    let best = Infinity, bt = 0;
    for (let k = 0; k < N; k++) {
      const a = spine[k], b = spine[k + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      const s = l2 > 0 ? clamp01(((px - a.x) * dx + (pz - a.z) * dz) / l2) : 0, ex = px - a.x - dx * s, ez = pz - a.z - dz * s, d = ex * ex + ez * ez;
      if (d < best) {
        best = d;
        bt = a.t + (b.t - a.t) * s;
      }
    }
    return { d: Math.sqrt(best), t: bt };
  };
  const W = P.warp, R = P.rough;
  function value(x2, z2) {
    const wx = x2 + W.a1 * gnoise(seed, x2 / W.l1 + 3.1, z2 / W.l1 - 1.7, W.salt) + W.a2 * gnoise(seed, x2 / W.l2 - 5.3, z2 / W.l2 + 2.9, W.salt + 7);
    const wz = z2 + W.a1 * gnoise(seed, x2 / W.l1 - 8.2, z2 / W.l1 + 4.4, W.salt + 1) + W.a2 * gnoise(seed, x2 / W.l2 + 6.6, z2 / W.l2 - 3.8, W.salt + 8);
    const sp = spineDist(wx, wz);
    let f = halfWidth(sp.t) - sp.d;
    for (const L of lobes) {
      const dx = wx - L.x, dz = wz - L.z, u = (dx * L.ax + dz * L.az) / L.a, v = (-dx * L.az + dz * L.ax) / L.b;
      f = smax(f, (1 - Math.sqrt(u * u + v * v)) * Math.min(L.a, L.b), 140);
    }
    for (const A of peninsulas) {
      const q = segDist(wx, wz, A.pts);
      f = smax(f, A.width * (1 - 0.45 * q.u) - q.d, 90);
    }
    for (const A of inlets) {
      const q = segDist(wx, wz, A.pts);
      f = smin(f, q.d - A.width * (1.25 - 0.95 * q.u) * (1 - 0.35 * q.u), 80);
    }
    return f + R.b * fbm(seed, x2 / R.m - 2.3, z2 / R.m + 7.9, 2, R.salt + 3) + R.a * fbm(seed, x2 / R.l + 11.7, z2 / R.l - 4.1, 3, R.salt);
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const grow = (x2, z2, r) => {
    minX = Math.min(minX, x2 - r);
    maxX = Math.max(maxX, x2 + r);
    minZ = Math.min(minZ, z2 - r);
    maxZ = Math.max(maxZ, z2 + r);
  };
  for (const p of spine) grow(p.x, p.z, P.H * 1.6);
  for (const L of lobes) grow(L.x, L.z, Math.max(L.a, L.b) + 200);
  for (const A of peninsulas) for (const p of A.pts) grow(p.x, p.z, A.width + 200);
  const pad = W.a1 + W.a2 + R.a + R.b + 120;
  return { value, spine, bounds: { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad } };
}
function chamfer(seedMask, nx, nz, cell) {
  const d = new Float64Array(nx * nz), a = cell, b = cell * 1.4142135623730951;
  for (let i = 0; i < d.length; i++) d[i] = seedMask[i] ? 0 : 1e9;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix;
    let v = d[i];
    if (ix > 0) v = Math.min(v, d[i - 1] + a);
    if (iz > 0) {
      v = Math.min(v, d[i - nx] + a);
      if (ix > 0) v = Math.min(v, d[i - nx - 1] + b);
      if (ix < nx - 1) v = Math.min(v, d[i - nx + 1] + b);
    }
    d[i] = v;
  }
  for (let iz = nz - 1; iz >= 0; iz--) for (let ix = nx - 1; ix >= 0; ix--) {
    const i = iz * nx + ix;
    let v = d[i];
    if (ix < nx - 1) v = Math.min(v, d[i + 1] + a);
    if (iz < nz - 1) {
      v = Math.min(v, d[i + nx] + a);
      if (ix < nx - 1) v = Math.min(v, d[i + nx + 1] + b);
      if (ix > 0) v = Math.min(v, d[i + nx - 1] + b);
    }
    d[i] = v;
  }
  return d;
}
function place(seed, field, grid, camp, attempt) {
  const S = ISLAND_SHAPE, B = field.bounds;
  const c0 = 24, nx = Math.ceil((B.maxX - B.minX) / c0) + 1, nz = Math.ceil((B.maxZ - B.minZ) / c0) + 1;
  const raw = new Float32Array(nx * nz);
  let land = 0;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const v = field.value(B.minX + ix * c0, B.minZ + iz * c0);
    raw[iz * nx + ix] = v;
    if (v > 0) land++;
  }
  const comp = new Int32Array(nx * nz).fill(-1), sizes = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] <= 0 || comp[i] >= 0) continue;
    const id = sizes.length, stack = [i];
    comp[i] = id;
    let count = 0;
    while (stack.length) {
      const j = stack.pop();
      count++;
      const jx = j % nx, jz = (j - jx) / nx;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const kx = jx + dx, kz = jz + dz;
        if (kx < 0 || kz < 0 || kx >= nx || kz >= nz) continue;
        const k = kz * nx + kx;
        if (raw[k] > 0 && comp[k] < 0) {
          comp[k] = id;
          stack.push(k);
        }
      }
    }
    sizes.push(count);
  }
  let main = 0;
  for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[main]) main = k;
  const mainCells = sizes.length ? sizes[main] : 0;
  if (!mainCells) return null;
  const scale = Math.sqrt(S.area / (mainCells * c0 * c0)), cell = c0 * scale;
  const sea = new Uint8Array(nx * nz);
  for (let i = 0; i < sea.length; i++) sea[i] = comp[i] === main ? 0 : 1;
  const depth = chamfer(sea, nx, nz, cell);
  let maxDepth = 0;
  for (let i = 0; i < depth.length; i++) if (!sea[i] && depth[i] > maxDepth) maxDepth = depth[i];
  const need = Math.min(S.campDepth, maxDepth * 0.82);
  if (need < 240) return null;
  let mx = 0, mz = 0, mc = 0;
  const cells = [];
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix;
    if (sea[i]) continue;
    const px = B.minX + ix * c0, pz = B.minZ + iz * c0;
    cells.push(px, pz);
    mx += px;
    mz += pz;
    mc++;
  }
  mx /= mc;
  mz /= mc;
  const rng = createRng(deriveSeed(seed, 4200 + attempt));
  const candidates = [];
  for (let iz = 0; iz < nz; iz += 2) for (let ix = 0; ix < nx; ix += 2) {
    const i = iz * nx + ix;
    if (sea[i] || depth[i] < need) continue;
    const px = B.minX + ix * c0, pz = B.minZ + iz * c0;
    candidates.push({ x: px, z: pz, depth: depth[i], score: dhypot(px - mx, pz - mz) * (0.8 + 0.4 * rng.next()) });
  }
  candidates.sort((a, b) => a.score - b.score);
  const room = {
    minX: grid.x0 + S.margin - camp.x,
    maxX: grid.x0 + (grid.nx - 1) * grid.cell - S.margin - camp.x,
    minZ: grid.z0 + S.margin - camp.z,
    maxZ: grid.z0 + (grid.nz - 1) * grid.cell - S.margin - camp.z
  };
  const turn0 = rng.range(0, TAU);
  for (let c = 0; c < Math.min(40, candidates.length); c++) {
    const a = candidates[c];
    for (let r = 0; r < 12; r++) {
      const theta = turn0 + r * TAU / 12, ct = dcos(theta), st = dsin(theta);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let k = 0; k < cells.length; k += 2) {
        const lx = (cells[k] - a.x) * scale, lz = (cells[k + 1] - a.z) * scale, wx = lx * ct - lz * st, wz = lx * st + lz * ct;
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz;
        if (wz > maxZ) maxZ = wz;
      }
      const slack = 2 * cell;
      if (minX - slack >= room.minX && maxX + slack <= room.maxX && minZ - slack >= room.minZ && maxZ + slack <= room.maxZ)
        return { scale, theta, anchor: { x: a.x, z: a.z }, campDepth: a.depth, maxDepth, raster: { nx, nz, c0, B } };
    }
  }
  return null;
}
function placeIslets(seed, P, count, mainland, worldOf, grid) {
  const S = ISLAND_SHAPE, rng = createRng(deriveSeed(seed, 4300 + P.isletSalt % 997)), out = [];
  const { nx, nz, cell, x0, z0 } = grid, maxX = x0 + (nx - 1) * cell - S.margin, maxZ = z0 + (nz - 1) * cell - S.margin;
  for (let tries = 0; out.length < count && tries < count * 60; tries++) {
    const x = rng.range(x0 + S.margin, maxX), z = rng.range(z0 + S.margin, maxZ), f = mainland(x, z);
    if (f > -120 || f < -650) continue;
    const r = rng.range(S.isletRadius[0], S.isletRadius[1]) * (out.length === 0 ? 1 : rng.range(0.6, 1));
    if (f > -(r + S.isletGap)) continue;
    if (out.some((o) => dhypot(o.x - x, o.z - z) < o.r + r + 60)) continue;
    out.push({ x, z, r, a: rng.range(0, TAU), squash: rng.range(0.55, 1), salt: rng.int(1, 1 << 20) });
    if (rng.chance(0.35) && out.length < count) {
      const a = rng.range(0, TAU), d = r + rng.range(60, 160), r2 = r * rng.range(0.35, 0.7), x2 = x + dcos(a) * d, z2 = z + dsin(a) * d;
      if (mainland(x2, z2) < -(r2 + S.isletGap)) out.push({ x: x2, z: z2, r: r2, a: rng.range(0, TAU), squash: rng.range(0.55, 1), salt: rng.int(1, 1 << 20) });
    }
  }
  return out;
}
var isletValue = (seed, I, x, z) => {
  const dx = x - I.x, dz = z - I.z, c = dcos(I.a), s = dsin(I.a), u = dx * c + dz * s, v = (-dx * s + dz * c) / I.squash;
  const d = Math.sqrt(u * u + v * v);
  return I.r - d + I.r * 0.28 * gnoise(seed, x / 70, z / 70, I.salt);
};
function buildIslandShape(seed, grid, camp) {
  seed >>>= 0;
  let P = null, field = null, placed = null, attempt = 0;
  for (; attempt < 6 && !placed; attempt++) {
    P = shapeParams(seed, attempt);
    field = createField(seed, P);
    placed = place(seed, field, grid, camp, attempt);
  }
  if (!placed) throw new Error("No island shape fits for seed " + seed);
  const { scale, theta, anchor } = placed, ct = dcos(theta), st = dsin(theta);
  const toNominal = (x, z) => {
    const dx = x - camp.x, dz = z - camp.z;
    return { x: anchor.x + (dx * ct + dz * st) / scale, z: anchor.z + (-dx * st + dz * ct) / scale };
  };
  const worldOf = (px, pz) => {
    const lx2 = (px - anchor.x) * scale, lz2 = (pz - anchor.z) * scale;
    return { x: camp.x + lx2 * ct - lz2 * st, z: camp.z + lx2 * st + lz2 * ct };
  };
  const mainland = (x, z) => {
    const q = toNominal(x, z);
    return field.value(q.x, q.z) * scale;
  };
  const { nx, nz, cell, x0, z0 } = grid, n = nx * nz;
  const B = placed.raster.B, corners = [[B.minX, B.minZ], [B.maxX, B.minZ], [B.minX, B.maxZ], [B.maxX, B.maxZ]].map(([px, pz]) => worldOf(px, pz));
  const bx0 = Math.max(x0, Math.min(...corners.map((c) => c.x))), bx1 = Math.min(x0 + (nx - 1) * cell, Math.max(...corners.map((c) => c.x)));
  const bz0 = Math.max(z0, Math.min(...corners.map((c) => c.z))), bz1 = Math.min(z0 + (nz - 1) * cell, Math.max(...corners.map((c) => c.z)));
  const L = 16, lx = Math.ceil((bx1 - bx0) / L) + 2, lz = Math.ceil((bz1 - bz0) / L) + 2, lattice = new Float32Array(lx * lz);
  for (let iz = 0; iz < lz; iz++) for (let ix = 0; ix < lx; ix++) lattice[iz * lx + ix] = mainland(bx0 + ix * L, bz0 + iz * L);
  const value = new Float32Array(n).fill(-1e3);
  for (let iz = 0; iz < nz; iz++) {
    const z = z0 + iz * cell;
    if (z < bz0 || z > bz1) continue;
    const fz = (z - bz0) / L, jz = Math.min(lz - 2, Math.floor(fz)), v = fz - jz;
    for (let ix = 0; ix < nx; ix++) {
      const x = x0 + ix * cell;
      if (x < bx0 || x > bx1) continue;
      const fx = (x - bx0) / L, jx = Math.min(lx - 2, Math.floor(fx)), u = fx - jx, j = jz * lx + jx;
      const a = lattice[j] + (lattice[j + 1] - lattice[j]) * u, b = lattice[j + lx] + (lattice[j + lx + 1] - lattice[j + lx]) * u;
      value[iz * nx + ix] = a + (b - a) * v;
    }
  }
  const islets = placeIslets(seed, P, P.islets, mainland, worldOf, grid);
  for (const I of islets) {
    const r = I.r * 1.6, ix0 = Math.max(1, Math.floor((I.x - r - x0) / cell)), ix1 = Math.min(nx - 2, Math.ceil((I.x + r - x0) / cell));
    const iz0 = Math.max(1, Math.floor((I.z - r - z0) / cell)), iz1 = Math.min(nz - 2, Math.ceil((I.z + r - z0) / cell));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const i = iz * nx + ix, v = isletValue(seed, I, x0 + ix * cell, z0 + iz * cell);
      if (v > value[i]) value[i] = v;
    }
  }
  for (let ix = 0; ix < nx; ix++) {
    value[ix] = Math.min(value[ix], -50);
    value[(nz - 1) * nx + ix] = Math.min(value[(nz - 1) * nx + ix], -50);
  }
  for (let iz = 0; iz < nz; iz++) {
    value[iz * nx] = Math.min(value[iz * nx], -50);
    value[iz * nx + nx - 1] = Math.min(value[iz * nx + nx - 1], -50);
  }
  const landMask = new Uint8Array(n), seaMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (value[i] > 0) landMask[i] = 1;
    else seaMask[i] = 1;
  }
  const toSea = chamfer(seaMask, nx, nz, cell), toLand = chamfer(landMask, nx, nz, cell), distance = new Float32Array(n);
  let landCells = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    if (landMask[i]) {
      distance[i] = toSea[i] - cell * 0.5;
      landCells++;
      const x = x0 + i % nx * cell, z = z0 + Math.floor(i / nx) * cell;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    } else distance[i] = -(toLand[i] - cell * 0.5);
  }
  const spine = field.spine.map((p) => worldOf(p.x, p.z));
  const campIndex = Math.round((camp.z - z0) / cell) * nx + Math.round((camp.x - x0) / cell);
  return {
    version: ISLAND_SHAPE.version,
    value,
    distance,
    info: {
      attempt: attempt - 1,
      scale: +scale.toFixed(4),
      theta: +theta.toFixed(4),
      elong: +P.elong.toFixed(3),
      bend: +P.bend.toFixed(3),
      wiggle: +P.wiggle.toFixed(3),
      neck: +P.neck.toFixed(3),
      lobes: P.lobes.length,
      peninsulas: P.peninsulas.length,
      inlets: P.inlets.length,
      islets: islets.length,
      landArea: landCells * cell * cell,
      campDepth: +distance[campIndex].toFixed(1),
      bounds: { minX, maxX, minZ, maxZ }
    },
    spine: spine.map((p) => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1) })),
    islets: islets.map((I) => ({ x: +I.x.toFixed(1), z: +I.z.toFixed(1), r: +I.r.toFixed(1) }))
  };
}

// worldgen/island-gen.js
var WORLDGEN_VERSION = "worldgen-v92-shape-1";
var ISLAND_FRAME = Object.freeze({ centerX: 0, centerZ: -128, radiusX: 1800, radiusZ: 1920, seaLevel: 0.62, keepRadius: 0.68 });
var START = Object.freeze({ spawn: Object.freeze({ x: -4, z: 20 }), camp: Object.freeze({ x: -6, z: 11 }) });
var COARSE = Object.freeze({ cell: 8, x0: -3600, z0: -3600, nx: 901, nz: 901 });
function segmentDistance(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az, len2 = vx * vx + vz * vz;
  const t = len2 > 0 ? clamp01((wx * vx + wz * vz) / len2) : 0, dx = wx - vx * t, dz = wz - vz * t;
  return { d: Math.sqrt(dx * dx + dz * dz), t };
}
function polylineDistance(px, pz, points) {
  let best = Infinity, total = 0, bestAlong = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1], seg = dhypot(b.x - a.x, b.z - a.z), r = segmentDistance(px, pz, a.x, a.z, b.x, b.z);
    if (r.d < best) {
      best = r.d;
      bestAlong = total + r.t * seg;
    }
    total += seg;
  }
  return { d: best, along: total > 0 ? bestAlong / total : 0, length: total };
}
var bell2 = (t) => {
  if (t >= 1) return 0;
  const u = 1 - t * t;
  return u * u;
};
function shapeQueries(shape, grid) {
  const { nx, nz, cell, x0, z0 } = grid, D = shape.distance;
  const depthAt = (x, z) => {
    let fx = (x - x0) / cell, fz = (z - z0) / cell;
    if (fx < 0 || fz < 0 || fx > nx - 1.001 || fz > nz - 1.001) return -1e3;
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, i = iz * nx + ix;
    const a = D[i] + (D[i + 1] - D[i]) * u, b = D[i + nx] + (D[i + nx + 1] - D[i + nx]) * u;
    return a + (b - a) * v;
  };
  const ray = (x, z, dx, dz, max) => {
    for (let d = 16; d <= max; d += 16) if (depthAt(x + dx * d, z + dz * d) <= 0) return d;
    return max;
  };
  const axisAt = (x, z) => {
    const gx = depthAt(x + 48, z) - depthAt(x - 48, z), gz = depthAt(x, z + 48) - depthAt(x, z - 48), l = dhypot(gx, gz);
    return l > 1e-6 ? { x: -gz / l, z: gx / l } : { x: 1, z: 0 };
  };
  return { depthAt, ray, axisAt };
}
function planIslandLayout(seed, shape, grid = COARSE) {
  seed >>>= 0;
  const rng = createRng(deriveSeed(seed, 11));
  const spawn = START.spawn, Q = shapeQueries(shape, grid);
  const { nx, nz, cell, x0, z0 } = grid;
  const b = shape.info.bounds;
  const landPoint = (depth, tries = 400) => {
    for (let k = 0; k < tries; k++) {
      const x = rng.range(b.minX, b.maxX), z = rng.range(b.minZ, b.maxZ);
      if (Q.depthAt(x, z) >= depth) return { x, z };
    }
    return null;
  };
  let flow = null, bestScore = -Infinity, upRoom = 0;
  const turn0 = rng.range(0, TAU);
  for (let k = 0; k < 32; k++) {
    const a = turn0 + k * TAU / 32, dx = dcos(a), dz = dsin(a);
    const down = Q.ray(spawn.x, spawn.z, dx, dz, 3200), up2 = Q.ray(spawn.x, spawn.z, -dx, -dz, 3200);
    const score = 1.6 * smoothstep(300, 1500, up2) + (down < 320 ? -1 : down > 2800 ? 0.4 : 1) + 0.45 * rng.next();
    if (score > bestScore) {
      bestScore = score;
      flow = { x: dx, z: dz };
      upRoom = up2;
    }
  }
  const side = rng.chance(0.5) ? 1 : -1, nrm = { x: -flow.z * side, z: flow.x * side };
  const offset = rng.range(75, 115);
  const passX = spawn.x + nrm.x * offset, passZ = spawn.z + nrm.z * offset;
  const trough = [];
  for (let s = -1100; s <= 1500; s += 50) {
    const far = smoothstep(120, 700, Math.abs(s));
    const bend = (230 * gnoise(seed, s / 700, 3.7, 71) + 70 * gnoise(seed, s / 260, -1.9, 72)) * (0.12 + 0.88 * far);
    trough.push({ x: passX + flow.x * s + nrm.x * bend, z: passZ + flow.z * s + nrm.z * bend, s });
  }
  const ranges = [];
  const makeRange = (cx, cz, dir, segments, segLen, width, strength) => {
    let hx = dir.x, hz = dir.z, x = cx - hx * segLen * segments * 0.5, z = cz - hz * segLen * segments * 0.5;
    const nodes = [{ x, z }];
    for (let i = 0; i < segments; i++) {
      const turn = rng.range(-0.5, 0.5), tx = hx - hz * turn, tz = hz + hx * turn, l = dhypot(tx, tz);
      hx = tx / l;
      hz = tz / l;
      const ax = Q.axisAt(x, z), narrow = 1 - smoothstep(250, 700, Q.depthAt(x, z)), dot = ax.x * hx + ax.z * hz, sgn = dot < 0 ? -1 : 1;
      hx += (ax.x * sgn - hx) * narrow * 0.6;
      hz += (ax.z * sgn - hz) * narrow * 0.6;
      const l2 = dhypot(hx, hz) || 1;
      hx /= l2;
      hz /= l2;
      const step = segLen * rng.range(0.8, 1.2);
      x += hx * step;
      z += hz * step;
      nodes.push({ x, z });
    }
    ranges.push({ nodes, width, strength, salt: ranges.length });
  };
  const passUp = Q.ray(passX, passZ, -flow.x, -flow.z, 3200);
  const up = Math.max(420, Math.min(rng.range(950, 1250), passUp - 380));
  let upstream = { x: passX - flow.x * up, z: passZ - flow.z * up };
  if (Q.depthAt(upstream.x, upstream.z) < 220) upstream = landPoint(380) || landPoint(200) || upstream;
  {
    const depth = Math.max(160, Q.depthAt(upstream.x, upstream.z)), axis = Q.axisAt(upstream.x, upstream.z), narrow = 1 - smoothstep(380, 900, depth);
    let ax = nrm.x + flow.x * rng.range(-0.55, 0.55), az = nrm.z + flow.z * rng.range(-0.55, 0.55);
    const dot = ax * axis.x + az * axis.z, sgn = dot < 0 ? -1 : 1;
    ax += (axis.x * sgn - ax) * narrow;
    az += (axis.z * sgn - az) * narrow;
    const al = dhypot(ax, az) || 1;
    const width = Math.min(rng.range(360, 460), depth * 1.15 + 140);
    makeRange(upstream.x - flow.x * 220 * (1 - narrow), upstream.z - flow.z * 220 * (1 - narrow), { x: ax / al, z: az / al }, rng.int(3, 5), rng.range(250, 340), width, rng.range(1.7, 2));
  }
  const extra = rng.int(1, 2);
  for (let k = 0; k < extra; k++) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const p = landPoint(300, 40);
      if (!p) continue;
      if (dhypot(p.x - spawn.x, p.z - spawn.z) < 700) continue;
      if (polylineDistance(p.x, p.z, trough).d < 420) continue;
      if (ranges.some((g) => polylineDistance(p.x, p.z, g.nodes).d < 700)) continue;
      const axis = Q.axisAt(p.x, p.z), t = rng.range(-0.6, 0.6), dir = { x: axis.x * dcos(t) - axis.z * dsin(t), z: axis.x * dsin(t) + axis.z * dcos(t) };
      const depth = Q.depthAt(p.x, p.z);
      makeRange(p.x, p.z, dir, rng.int(2, 4), rng.range(220, 320), Math.min(rng.range(260, 380), depth * 1.05 + 80), rng.range(0.7, 1.1));
      break;
    }
  }
  let volcano = null;
  for (let attempt = 0; attempt < 160 && !volcano; attempt++) {
    const p = landPoint(300, 40);
    if (!p) continue;
    if (dhypot(p.x - spawn.x, p.z - spawn.z) < 800) continue;
    if (polylineDistance(p.x, p.z, trough).d < 480) continue;
    if (ranges.some((g) => polylineDistance(p.x, p.z, g.nodes).d < 560)) continue;
    const depth = Q.depthAt(p.x, p.z);
    volcano = { x: p.x, z: p.z, radius: Math.min(rng.range(360, 460), depth * 1.15 + 60), strength: rng.range(0.95, 1.2), craterRadius: rng.range(55, 80) };
  }
  if (!volcano) {
    let best = null, bd = -1;
    for (let iz = 0; iz < nz; iz += 4) for (let ix = 0; ix < nx; ix += 4) {
      const x = x0 + ix * cell, z = z0 + iz * cell, d = shape.distance[iz * nx + ix];
      if (d > bd && dhypot(x - spawn.x, z - spawn.z) > 650) {
        bd = d;
        best = { x, z };
      }
    }
    best = best || { x: spawn.x - flow.x * 900, z: spawn.z - flow.z * 900 };
    volcano = { x: best.x, z: best.z, radius: Math.max(220, Math.min(360, bd * 1.1)), strength: 1, craterRadius: 60 };
  }
  return {
    seed,
    flow,
    side,
    offset,
    normal: nrm,
    pass: { x: passX, z: passZ },
    trough,
    ranges,
    volcano,
    shape: { version: shape.version, ...shape.info, spine: shape.spine, islets: shape.islets }
  };
}
function upliftAt(layout, x, z, land) {
  const { seed, ranges, volcano, trough } = layout, spawn = START.spawn;
  const ramp = 0.03 + 0.2 * smoothstep(-0.35, 0.45, fbm(seed, x / 650, z / 650, 2, 603));
  const inland = smoothstep(0, ramp, land);
  const regional = fbm(seed, x / 1e3, z / 1e3, 3, 601) * 0.5 + 0.5;
  const dome = smoothstep(0.05, 0.55, land);
  let u = 4 + 6 * dome + 3 * (fbm(seed, x / 260, z / 260, 3, 604) * 0.5 + 0.5) + 15 * smoothstep(0.3, 0.9, regional) * (0.65 + 0.35 * (fbm(seed, x / 330, z / 330, 3, 602) * 0.5 + 0.5));
  for (const g of ranges) {
    const q = polylineDistance(x, z, g.nodes);
    const along = 0.7 + 0.3 * dsin(q.along * 6.5 + g.salt * 2.1);
    const warp = 1 + 0.28 * gnoise(seed, x / 280, z / 280, 610 + g.salt);
    u += 58 * g.strength * bell2(q.d / (g.width * warp)) * along * (0.8 + 0.2 * (fbm(seed, x / 220, z / 220, 3, 620 + g.salt) * 0.5 + 0.5));
  }
  const dv = dhypot(x - volcano.x, z - volcano.z) / volcano.radius;
  if (dv < 1) {
    const t = 1 - dv;
    u += 40 * volcano.strength * t * Math.sqrt(t);
  }
  const tq = polylineDistance(x, z, trough), ts = -1100 + tq.along * 2600;
  u *= 1 - 0.5 * bell2(tq.d / 220) * (1 - smoothstep(500, 1300, Math.abs(ts)));
  const ds = dhypot(x - spawn.x, z - spawn.z);
  u *= 0.7 + 0.3 * smoothstep(120, 600, ds);
  u += 7 * bell2(ds / 150);
  return u * inland;
}
function erodibilityAt(layout, x, z) {
  const { seed, volcano } = layout;
  const rock = fbm(seed, x / 700, z / 700, 3, 701) * 0.5 + 0.5;
  let k = 0.7 + 0.6 * rock;
  const dv = dhypot(x - volcano.x, z - volcano.z) / volcano.radius;
  if (dv < 1.1) k *= 0.55 + 0.45 * smoothstep(0.6, 1.1, dv);
  return k;
}
function smoothHillslopes(h, area, nx, nz, fixed, aLow, aHigh, passes) {
  const tmp = new Float64Array(h.length);
  for (let p = 0; p < passes; p++) {
    for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const i = iz * nx + ix;
      if (fixed[i] || ix === 0 || iz === 0 || ix === nx - 1 || iz === nz - 1) {
        tmp[i] = h[i];
        continue;
      }
      const avg = (h[i - 1] + h[i + 1] + h[i - nx] + h[i + nx]) * 0.15 + (h[i - nx - 1] + h[i - nx + 1] + h[i + nx - 1] + h[i + nx + 1]) * 0.1;
      const w = 1 - smoothstep(aLow, aHigh, area[i]);
      tmp[i] = h[i] + (avg - h[i]) * w * 0.85;
    }
    h.set(tmp);
  }
}
var EROSION_SETTINGS = Object.freeze({
  iterations: 24,
  dt: 4,
  diffuseRate: 0.24,
  diffusePasses: 8,
  relaxSlope: 0.75,
  relaxPasses: 2,
  relaxFraction: 0.5,
  smoothPasses: 24,
  smoothFrom: 2e4,
  smoothTo: 15e4,
  finalRelaxSlope: 0.7,
  finalRelaxPasses: 4,
  upliftScale: 0.7,
  channel: null
});
function generateMacroTerrain(seed, { onProgress = null, settings = {} } = {}) {
  const S = { ...EROSION_SETTINGS, ...settings }, { iterations, dt } = S;
  const shape = buildIslandShape(seed, COARSE, START.spawn);
  const layout = planIslandLayout(seed, shape);
  const { cell, x0, z0, nx, nz } = COARSE, n = nx * nz;
  const land = new Float64Array(n), fixed = new Uint8Array(n), uplift = new Float64Array(n), erodibility = new Float64Array(n);
  const h = new Float64Array(n), filled = new Float64Array(n);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix, x = x0 + ix * cell, z = z0 + iz * cell, c = shape.distance[i] > 0 ? shape.distance[i] / 2e3 : -1;
    land[i] = c;
    if (c <= 0) {
      fixed[i] = 1;
      h[i] = 0;
      continue;
    }
    uplift[i] = upliftAt(layout, x, z, c) * S.upliftScale;
    erodibility[i] = erodibilityAt(layout, x, z);
    h[i] = 0.5 + 6 * smoothstep(0, 0.3, c) * (0.5 + 0.5 * (fbm(seed, x / 300, z / 300, 3, 801) * 0.5 + 0.5)) + 3 * (fbm(seed, x / 120, z / 120, 2, 802) * 0.5 + 0.5);
  }
  const flow = createFlowState(nx, nz), cellArea = cell * cell, scratch = new Float64Array(n);
  const jitterSeed = deriveSeed(seed, 77);
  const floodSeed = deriveSeed(seed, 78) | 1;
  for (let it = 0; it < iterations; it++) {
    priorityFlood(h, nx, nz, fixed, filled, 1e-3, floodSeed + it);
    computeReceivers(flow, filled, fixed, cell, 0.35, jitterSeed + it);
    buildStack(flow);
    accumulateArea(flow, cellArea);
    streamPowerStep(flow, h, uplift, erodibility, dt, S.channel);
    diffuse(h, nx, nz, fixed, S.diffuseRate, S.diffusePasses, scratch);
    relaxSlopes(h, nx, nz, fixed, cell, S.relaxSlope, S.relaxPasses, S.relaxFraction);
    if (onProgress) onProgress((it + 1) / iterations);
  }
  smoothHillslopes(h, flow.area, nx, nz, fixed, S.smoothFrom, S.smoothTo, S.smoothPasses);
  relaxSlopes(h, nx, nz, fixed, cell, S.finalRelaxSlope, S.finalRelaxPasses, 0.5);
  const coastDist = chamferDistance(fixed, nx, nz, cell, 1);
  const routed = new Float64Array(n);
  {
    const shelfDist = chamferDistance(fixed, nx, nz, cell, 0);
    for (let i = 0; i < n; i++) {
      if (fixed[i]) {
        const x = x0 + i % nx * cell, z = z0 + Math.floor(i / nx) * cell, d = shelfDist[i];
        routed[i] = ISLAND_FRAME.seaLevel - Math.min(75, 1.2 + 0.05 * d + 4e-5 * d * d + 2.5 * (fbm(seed, x / 400, z / 400, 3, 811) * 0.5 + 0.5));
      } else routed[i] = h[i] + ISLAND_FRAME.seaLevel;
    }
    priorityFlood(routed, nx, nz, fixed, filled, 1e-3, floodSeed + 999);
    computeReceivers(flow, filled, fixed, cell, 0.35, jitterSeed + 999);
    buildStack(flow);
    accumulateArea(flow, cellArea);
  }
  const coast = shapeCoast(layout, COARSE, h, fixed, flow.area);
  const seaDist = chamferDistance(fixed, nx, nz, cell, 0);
  for (let i = 0; i < n; i++) h[i] = fixed[i] ? ISLAND_FRAME.seaLevel - coast.depth[i] : h[i] + ISLAND_FRAME.seaLevel;
  if (coast.stats.lagoons.length) {
    const near = (mask, r) => {
      const out = new Uint8Array(n);
      for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
        if (!mask(iz * nx + ix)) continue;
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          const jx = ix + dx, jz = iz + dz;
          if (jx >= 0 && jz >= 0 && jx < nx && jz < nz) out[jz * nx + jx] = 1;
        }
      }
      return out;
    };
    const shore = near((i) => coast.lagoon[i] === 1, 2), inlet = near((i) => coast.lagoon[i] === 2, 1), soft = new Uint8Array(n);
    for (let i = 0; i < n; i++) soft[i] = shore[i] && !inlet[i] ? 1 : 0;
    const field = Float32Array.from(h);
    blurMarked(field, 1, soft, nx, nz, 2);
    for (let i = 0; i < n; i++) if (soft[i]) h[i] = field[i];
  }
  return { layout, grid: COARSE, land, fixed, uplift, erodibility, height: h, routeHeight: routed, filled, flow, coastDistance: coastDist, seaDistance: seaDist, coast };
}
function chamferDistance(fixed, nx, nz, cell, toFixed) {
  const n = nx * nz, d = new Float64Array(n), a = cell, b = cell * 1.4142135623730951;
  for (let i = 0; i < n; i++) d[i] = (fixed[i] ? 1 : 0) === toFixed ? 0 : 1e9;
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix;
    let v = d[i];
    if (ix > 0) v = Math.min(v, d[i - 1] + a);
    if (iz > 0) {
      v = Math.min(v, d[i - nx] + a);
      if (ix > 0) v = Math.min(v, d[i - nx - 1] + b);
      if (ix < nx - 1) v = Math.min(v, d[i - nx + 1] + b);
    }
    d[i] = v;
  }
  for (let iz = nz - 1; iz >= 0; iz--) for (let ix = nx - 1; ix >= 0; ix--) {
    const i = iz * nx + ix;
    let v = d[i];
    if (ix < nx - 1) v = Math.min(v, d[i + 1] + a);
    if (iz < nz - 1) {
      v = Math.min(v, d[i + nx] + a);
      if (ix < nx - 1) v = Math.min(v, d[i + nx + 1] + b);
      if (ix > 0) v = Math.min(v, d[i + nx - 1] + b);
    }
    d[i] = v;
  }
  return d;
}
var COAST = Object.freeze({
  version: "coast-v1",
  // Headland sectors raise low cliffs to at least this height (m, by noise).
  cliffBoost: Object.freeze([9, 22]),
  // Cliff fills stop at drainage paths (m² upslope): valleys keep their mouths.
  cliffDrainage: Object.freeze([3e3, 12e3]),
  // Widths (m) of the bands of land and of sea the kinds shape.
  bandLand: 200,
  bandSea: 360,
  // Half-width (m) of the ravine a stream keeps through cliffs: small to large.
  ravine: Object.freeze([16, 40]),
  // Drainage (m²) over which a river mouth becomes an estuary.
  mouthArea: Object.freeze([9e4, 26e4]),
  maxStacks: 40,
  maxLagoons: 3
});
function coastalSector(layout, x, z, jut = 0) {
  const { seed } = layout;
  const s = smoothstep(0.08, 0.36, fbm(seed, x / 1100, z / 1100, 2, 931));
  return Math.max(s, jut);
}
function gridBilinear(field, grid, x, z) {
  const { cell, x0, z0, nx, nz } = grid;
  let fx = (x - x0) / cell, fz = (z - z0) / cell;
  fx = fx < 0 ? 0 : fx > nx - 1.000001 ? nx - 1.000001 : fx;
  fz = fz < 0 ? 0 : fz > nz - 1.000001 ? nz - 1.000001 : fz;
  const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, i = iz * nx + ix;
  const a = field[i] + (field[i + 1] - field[i]) * u, b = field[i + nx] + (field[i + nx + 1] - field[i + nx]) * u;
  return a + (b - a) * v;
}
function nearestSeed(isSeed, nx, nz, cell) {
  const n = nx * nz, d = new Float64Array(n), src = new Int32Array(n).fill(-1), a = cell, b = cell * 1.4142135623730951;
  for (let i = 0; i < n; i++) if (isSeed[i]) {
    src[i] = i;
  } else d[i] = 1e9;
  const relax = (i, j, w) => {
    if (d[j] + w < d[i]) {
      d[i] = d[j] + w;
      src[i] = src[j];
    }
  };
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix;
    if (ix > 0) relax(i, i - 1, a);
    if (iz > 0) {
      relax(i, i - nx, a);
      if (ix > 0) relax(i, i - nx - 1, b);
      if (ix < nx - 1) relax(i, i - nx + 1, b);
    }
  }
  for (let iz = nz - 1; iz >= 0; iz--) for (let ix = nx - 1; ix >= 0; ix--) {
    const i = iz * nx + ix;
    if (ix < nx - 1) relax(i, i + 1, a);
    if (iz < nz - 1) {
      relax(i, i + nx, a);
      if (ix < nx - 1) relax(i, i + nx + 1, b);
      if (ix > 0) relax(i, i + nx - 1, b);
    }
  }
  return { d, src };
}
function blurMarked(field, F, mark, nx, nz, passes) {
  const tmp = new Float32Array(field.length);
  for (let p = 0; p < passes; p++) {
    tmp.set(field);
    for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
      const i = iz * nx + ix;
      if (!mark[i]) continue;
      let w = 0;
      for (let c = 0; c < F; c++) tmp[i * F + c] = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const j = i + dz * nx + dx;
        if (!mark[j]) continue;
        w++;
        for (let c = 0; c < F; c++) tmp[i * F + c] += field[j * F + c];
      }
      for (let c = 0; c < F; c++) tmp[i * F + c] /= w;
    }
    field.set(tmp);
  }
}
function boxBlurMarked(field, F, mark, nx, nz, radius, passes) {
  const m = Math.max(nx, nz), pre = new Float64Array(m * F), preCount = new Float64Array(m), line = new Float32Array(m * F), at = new Int32Array(m);
  const run = (count) => {
    let c = 0;
    for (let a = 0; a < count; a++) {
      const i = at[a], w = mark[i] ? 1 : 0;
      c += w;
      preCount[a] = c;
      for (let k = 0; k < F; k++) pre[a * F + k] = (a ? pre[(a - 1) * F + k] : 0) + (w ? field[i * F + k] : 0);
    }
    for (let a = 0; a < count; a++) {
      if (!mark[at[a]]) continue;
      const lo = a - radius - 1, hi = Math.min(count - 1, a + radius), n = preCount[hi] - (lo >= 0 ? preCount[lo] : 0);
      for (let k = 0; k < F; k++) line[a * F + k] = (pre[hi * F + k] - (lo >= 0 ? pre[lo * F + k] : 0)) / n;
    }
    for (let a = 0; a < count; a++) {
      const i = at[a];
      if (mark[i]) for (let k = 0; k < F; k++) field[i * F + k] = line[a * F + k];
    }
  };
  for (let p = 0; p < passes; p++) {
    for (let iz = 0; iz < nz; iz++) {
      for (let a = 0; a < nx; a++) at[a] = iz * nx + a;
      run(nx);
    }
    for (let ix = 0; ix < nx; ix++) {
      for (let a = 0; a < nz; a++) at[a] = a * nx + ix;
      run(nz);
    }
  }
}
function shapeCoast(layout, grid, h, fixed, area) {
  const { seed } = layout, { cell, x0, z0, nx, nz } = grid, n = nx * nz, C = COAST;
  const X = (i) => x0 + i % nx * cell, Z = (i) => z0 + Math.floor(i / nx) * cell;
  const coastDist = chamferDistance(fixed, nx, nz, cell, 1);
  const isShore = new Uint8Array(n), shore = [];
  for (let iz = 1; iz < nz - 1; iz++) for (let ix = 1; ix < nx - 1; ix++) {
    const i = iz * nx + ix;
    if (fixed[i] || !(fixed[i - 1] || fixed[i + 1] || fixed[i - nx] || fixed[i + nx])) continue;
    isShore[i] = 1;
    shore.push(i);
  }
  const W = nx + 1, sat = new Float64Array(W * (nz + 1));
  for (let iz = 0; iz < nz; iz++) {
    let row = 0;
    for (let ix = 0; ix < nx; ix++) {
      row += fixed[iz * nx + ix] ? 0 : 1;
      sat[(iz + 1) * W + ix + 1] = sat[iz * W + ix + 1] + row;
    }
  }
  const landFrac = (ix, iz, r) => {
    const a = Math.max(0, ix - r), b = Math.min(nx - 1, ix + r), c = Math.max(0, iz - r), d = Math.min(nz - 1, iz + r);
    return (sat[(d + 1) * W + b + 1] - sat[c * W + b + 1] - sat[(d + 1) * W + a] + sat[c * W + a]) / ((b - a + 1) * (d - c + 1));
  };
  const S = shore.length, K = 7, wk = new Float64Array(S * K), mouth = new Float64Array(S), normal = new Float64Array(S * 2);
  for (let k = 0; k < S; k++) {
    const i = shore[k], ix = i % nx, iz = (i - ix) / nx, x = X(i), z = Z(i);
    let gx = coastDist[i + 1] - coastDist[i - 1], gz = coastDist[i + nx] - coastDist[i - nx], gl = Math.sqrt(gx * gx + gz * gz);
    if (gl < 1e-6) {
      gx = (fixed[i - 1] ? 1 : 0) - (fixed[i + 1] ? 1 : 0);
      gz = (fixed[i - nx] ? 1 : 0) - (fixed[i + nx] ? 1 : 0);
      gl = Math.sqrt(gx * gx + gz * gz) || 1;
    }
    const ux = gx / gl, uz = gz / gl;
    normal[k * 2] = ux;
    normal[k * 2 + 1] = uz;
    let T = 0;
    for (let d = 16; d <= 128; d += 16) {
      const v = gridBilinear(h, grid, x + ux * d, z + uz * d);
      if (v > T) T = v;
    }
    let A = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const j = i + dz * nx + dx;
      if (j >= 0 && j < n && !fixed[j] && area[j] > A) A = area[j];
    }
    mouth[k] = A;
    const conv = landFrac(ix, iz, 12), sector = coastalSector(layout, x, z, smoothstep(0.46, 0.3, landFrac(ix, iz, 40)));
    const n1 = fbm(seed, x / 650, z / 650, 2, 951), n2 = fbm(seed, x / 300, z / 300, 2, 952), n3 = fbm(seed, x / 800, z / 800, 2, 953);
    const estuary = smoothstep(C.mouthArea[0], C.mouthArea[1], A);
    const Tc = T >= 4 ? Math.max(T, sector * (C.cliffBoost[0] + C.cliffBoost[1] * (fbm(seed, x / 420, z / 420, 2, 933) * 0.5 + 0.5))) : T;
    const cliff = Math.max(sector, smoothstep(16, 26, T) * smoothstep(-0.1, 0.25, n1)) * smoothstep(7, 13, Tc) * (1 - estuary);
    const rocky = (1 - cliff) * (1 - estuary) * smoothstep(0.02, 0.32, n1 + (0.5 - conv) * 0.8);
    const pebble = (1 - cliff) * (1 - estuary) * (1 - rocky) * smoothstep(0.02, 0.26, n2 + (conv - 0.5) * 1.2);
    const o = k * K;
    wk[o] = cliff;
    wk[o + 1] = rocky;
    wk[o + 2] = pebble;
    wk[o + 3] = Math.max(0, 1 - cliff - rocky - pebble - estuary);
    wk[o + 4] = estuary;
    wk[o + 5] = smoothstep(-0.22, 0.12, n3) * (1 - smoothstep(9, 17, T));
    wk[o + 6] = Math.min(40, Tc);
  }
  const shoreIndex = new Int32Array(n).fill(-1);
  for (let k = 0; k < S; k++) shoreIndex[shore[k]] = k;
  {
    const tmp = new Float64Array(S * K);
    for (let pass = 0; pass < 6; pass++) {
      for (let k = 0; k < S; k++) {
        const i = shore[k], o = k * K;
        let w = 1;
        for (let c = 0; c < K; c++) tmp[o + c] = wk[o + c];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const j = shoreIndex[i + dz * nx + dx];
          if (j < 0) continue;
          w++;
          for (let c = 0; c < K; c++) tmp[o + c] += wk[j * K + c];
        }
        for (let c = 0; c < K; c++) tmp[o + c] /= w;
      }
      wk.set(tmp);
    }
  }
  const { d: seedDist, src } = nearestSeed(isShore, nx, nz, cell), F = K, field = new Float32Array(n * F), inBand = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const s = src[i];
    if (s < 0 || seedDist[i] > (fixed[i] ? C.bandSea : C.bandLand)) continue;
    const k = shoreIndex[s];
    inBand[i] = 1;
    for (let c = 0; c < F; c++) field[i * F + c] = wk[k * K + c];
  }
  blurMarked(field, F, inBand, nx, nz, 3);
  const lagoon = new Uint8Array(n), channel = new Uint8Array(n), depth = new Float32Array(n);
  const ravine = new Float32Array(n).fill(1), keep = (A) => smoothstep(C.cliffDrainage[0] * 0.5, C.cliffDrainage[0] * 2, A);
  const fillTarget = (i) => field[i * F] * field[i * F + 6] * smoothstep(2, 16, coastDist[i]) * (1 - smoothstep(110, 190, coastDist[i]));
  const isChannel = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (fixed[i] || !inBand[i] || area[i] < C.cliffDrainage[0] * 0.5) continue;
    const raise = fillTarget(i) - h[i];
    if (raise <= 0.5) continue;
    isChannel[i] = 1;
    const k = keep(area[i]), W2 = Math.max(C.ravine[0] + (C.ravine[1] - C.ravine[0]) * smoothstep(C.cliffDrainage[1], 6e4, area[i]), 3 * raise);
    const r = Math.ceil(W2 / cell), ix = i % nx, iz = (i - ix) / nx;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
      const dist = Math.sqrt(dx * dx + dz * dz) * cell;
      if (dist >= W2) continue;
      const j = jz * nx + jx, v = 1 - k * (1 - smoothstep(0.35 * W2, W2, dist));
      if (v < ravine[j]) ravine[j] = v;
    }
  }
  blurMarked(ravine, 1, inBand, nx, nz, 2);
  for (let i = 0; i < n; i++) if (isChannel[i]) ravine[i] = Math.min(ravine[i], 1 - keep(area[i]));
  for (let i = 0; i < n; i++) {
    if (fixed[i] || !inBand[i]) continue;
    const d = coastDist[i], c = field[i * F], p = field[i * F + 2], e = field[i * F + 4];
    if (c > 0.02 && d <= 190) {
      const target = field[i * F + 6] * smoothstep(2, 16, d) * (1 - smoothstep(110, 190, d));
      const f = c * ravine[i];
      if (h[i] < target) h[i] += (target - h[i]) * f;
    }
    if (p > 0.01 && d <= 36) {
      const target = 1.1 * smoothstep(0, 12, d) + 0.8 * bell2(Math.abs(d - 15) / 9);
      if (h[i] < target) h[i] += (target - h[i]) * p;
    }
    if (e > 0.01 && d <= 190 && h[i] < 5) {
      const target = 0.14 + 0.3 * smoothstep(70, 190, d), f = e * (1 - smoothstep(2.5, 5, h[i])) * (1 - smoothstep(130, 190, d));
      h[i] += (target - h[i]) * f;
    }
  }
  const lagoons = [], mouths = [];
  for (let k = 0; k < S; k++) if (wk[k * K + 4] > 0.55) mouths.push(k);
  mouths.sort((a, b) => mouth[b] - mouth[a] || shore[a] - shore[b]);
  for (const k of mouths) {
    const i = shore[k], x = X(i), z = Z(i), ux = normal[k * 2], uz = normal[k * 2 + 1];
    if (lagoons.some((l) => dhypot(l.mx - x, l.mz - z) < 900)) continue;
    let low = 0, count = 0;
    for (let d = 30; d <= 210; d += 30) for (let s = -120; s <= 120; s += 40) {
      count++;
      if (gridBilinear(h, grid, x + ux * d - uz * s, z + uz * d + ux * s) < 3.2) low++;
    }
    if (lagoons.length >= C.maxLagoons || low / count < 0.7 || hashUnit(seed, i, 971, 0) > 0.75) continue;
    const R = 70 + 70 * hashUnit(seed, i, 972, 0);
    lagoons.push({ mx: x, mz: z, x: x + ux * (R + 34), z: z + uz * (R + 34), R, ux, uz, nodes: 0 });
  }
  for (const L of lagoons) {
    const r0 = Math.ceil(L.R * 1.4 / cell), ci = Math.round((L.x - x0) / cell), cj = Math.round((L.z - z0) / cell);
    for (let dj = -r0; dj <= r0; dj++) for (let di = -r0; di <= r0; di++) {
      const ix = ci + di, iz = cj + dj;
      if (ix < 1 || iz < 1 || ix >= nx - 1 || iz >= nz - 1) continue;
      const i = iz * nx + ix, x = X(i), z = Z(i), dx = x - L.x, dz = z - L.z;
      const along = (dx * -L.uz + dz * L.ux) / (L.R * 1.25), across = (dx * L.ux + dz * L.uz) / (L.R * 0.75);
      const q = Math.sqrt(along * along + across * across) * (1 + 0.18 * gnoise(seed, x / 60, z / 60, 973));
      if (q >= 1 || fixed[i] || coastDist[i] < 26 || h[i] > 4.5) continue;
      const deep = 0.5 + 1.7 * bell2(q);
      h[i] = -deep;
      fixed[i] = 1;
      lagoon[i] = 1;
      depth[i] = deep;
      L.nodes++;
    }
    let inside = 0;
    for (let s = -48; s <= L.R + 34 && inside < 3; s += cell * 0.5) {
      let deep = false;
      for (let w = -1; w <= 1; w++) {
        const x = L.mx + L.ux * s - L.uz * w * cell * 0.6, z = L.mz + L.uz * s + L.ux * w * cell * 0.6;
        const ix = Math.round((x - x0) / cell), iz = Math.round((z - z0) / cell), i = iz * nx + ix;
        if (ix < 1 || iz < 1 || ix >= nx - 1 || iz >= nz - 1) continue;
        if (lagoon[i] === 1) {
          channel[i] = 1;
          if (depth[i] > 1.6) deep = true;
          continue;
        }
        if (!fixed[i] || lagoon[i] === 2 || s < 0) {
          h[i] = -1.1;
          fixed[i] = 1;
          lagoon[i] = 2;
          depth[i] = 1.1;
        }
      }
      if (deep) inside++;
    }
  }
  if (lagoons.length) {
    for (let i = 0; i < n; i++) if (!fixed[i] && inBand[i] && field[i * F + 4] > 0.3 && coastDist[i] < 30 && h[i] < 0.7) h[i] = 0.7 + 0.5 * (gnoise(seed, X(i) / 30, Z(i) / 30, 974) * 0.5 + 0.5);
  }
  const seaDist = chamferDistance(fixed, nx, nz, cell, 0), floorKinds = field.slice();
  boxBlurMarked(floorKinds, F, inBand, nx, nz, 10, 2);
  for (let i = 0; i < n; i++) {
    if (!fixed[i] || lagoon[i] === 1) continue;
    const d = seaDist[i], x = X(i), z = Z(i);
    const shelf = 1.2 + 0.05 * d + 4e-5 * d * d + 2.5 * (fbm(seed, x / 400, z / 400, 3, 811) * 0.5 + 0.5);
    let D = shelf;
    if (inBand[i]) {
      const o = i * F, wc = floorKinds[o], wr = floorKinds[o + 1], wp = floorKinds[o + 2], ws = floorKinds[o + 3], we = floorKinds[o + 4];
      const bar = 58 + 34 * (fbm(seed, x / 500, z / 500, 2, 981) * 0.5 + 0.5);
      const sand = Math.max(0.3, 0.35 + 0.024 * d + 3e-5 * d * d - 1.1 * bell2(Math.abs(d - bar) / 17) - 0.7 * bell2(Math.abs(d - bar - 75) / 24));
      const P = 9 + 22 * (fbm(seed, x / 260, z / 260, 2, 982) * 0.5 + 0.5);
      const cliff = d < P ? 0.3 + 0.3 * d / P : Math.max(Math.min(0.6 + (d - P) * 0.45, 15 + 0.04 * (d - P)), sand);
      const rocky = Math.max(0.2, 0.5 + 0.035 * d + 1.3 * (ridged(seed, x / 24, z / 24, 2, 983) - 0.42));
      const pebble = Math.max(Math.min(0.7 + 0.17 * d, 9), sand);
      const estuary = 0.15 + 0.012 * d + 2e-5 * d * d;
      const sum = wc + wr + wp + ws + we || 1, near = (wc * cliff + wr * rocky + wp * pebble + ws * sand + we * estuary) / sum;
      D = near + (shelf - near) * smoothstep(150, C.bandSea, d);
    }
    depth[i] = lagoon[i] === 2 ? Math.max(depth[i], Math.min(75, D)) : Math.min(75, D);
  }
  const stacks = [], cliffShore = [];
  for (let k = 0; k < S; k++) if (wk[k * K] > 0.55) cliffShore.push(k);
  cliffShore.sort((a, b) => hash3(seed, shore[a], 990, 0) - hash3(seed, shore[b], 990, 0));
  for (const k of cliffShore) {
    if (stacks.filter((s) => !s.companion).length >= C.maxStacks) break;
    const i = shore[k];
    if (hashUnit(seed, i, 991, 0) > 0.08) continue;
    const off = 30 + 80 * hashUnit(seed, i, 992, 0), x = X(i) - normal[k * 2] * off, z = Z(i) - normal[k * 2 + 1] * off;
    const ix = Math.round((x - x0) / cell), iz = Math.round((z - z0) / cell), j = iz * nx + ix;
    if (ix < 1 || iz < 1 || ix >= nx - 1 || iz >= nz - 1 || !fixed[j] || lagoon[j] || depth[j] < 2.5) continue;
    if (stacks.some((s) => dhypot(s.x - x, s.z - z) < 70)) continue;
    const T = wk[k * K + 6], islet = hashUnit(seed, i, 1002, 0) < 0.35;
    const r = islet ? 8 + 9 * hashUnit(seed, i, 993, 0) : 5 + 8.5 * hashUnit(seed, i, 993, 0);
    const top2 = islet ? 3 + 4 * hashUnit(seed, i, 994, 0) : Math.min(36, Math.max(7, T * (0.45 + 0.5 * hashUnit(seed, i, 994, 0))));
    stacks.push({ x, z, r, top: top2, seed: hash3(seed, i, 995, 0) & 65535 });
    if (hashUnit(seed, i, 996, 0) < 0.55) {
      const a = hashUnit(seed, i, 997, 0) * 6.283185307179586, o = r + 8 + 18 * hashUnit(seed, i, 998, 0);
      const cx = x + o * dcos(a), cz = z + o * dsin(a), ci = Math.round((cx - x0) / cell), cj = Math.round((cz - z0) / cell), c = cj * nx + ci;
      if (ci >= 1 && cj >= 1 && ci < nx - 1 && cj < nz - 1 && fixed[c] && !lagoon[c] && depth[c] >= 1.5)
        stacks.push({ x: cx, z: cz, r: r * (0.4 + 0.3 * hashUnit(seed, i, 999, 0)), top: Math.max(5, top2 * (0.5 + 0.35 * hashUnit(seed, i, 1e3, 0))), seed: hash3(seed, i, 1001, 0) & 65535, companion: true });
    }
  }
  const weights = new Uint8Array(n * 4), cliffWeight = new Uint8Array(n), top = new Float32Array(n), shoreDistance = new Float32Array(n);
  const landDist = chamferDistance(fixed, nx, nz, cell, 1), byte = (v) => Math.round(255 * clamp01(v));
  const lagoonDist = lagoons.length ? chamferDistance(lagoon, nx, nz, cell, 1) : null;
  const kinds = { cliff: 0, rocky: 0, pebble: 0, sand: 0, estuary: 0, dunes: 0 };
  for (let k = 0; k < S; k++) {
    const o = k * K;
    let best = 0;
    for (let c = 1; c < 5; c++) if (wk[o + c] > wk[o + best]) best = c;
    kinds[["cliff", "rocky", "pebble", "sand", "estuary"][best]]++;
    if (best === 3 && wk[o + 5] > 0.5) kinds.dunes++;
  }
  for (let i = 0; i < n; i++) {
    const land = !fixed[i], d = land ? landDist[i] : seaDist[i];
    shoreDistance[i] = land ? d : -d;
    if (lagoon[i]) {
      weights[i * 4 + 3] = lagoon[i] === 2 ? 0 : 255;
      continue;
    }
    if (!inBand[i]) continue;
    const o = i * F, wc = field[o], wr = field[o + 1], wp = field[o + 2], ws = field[o + 3], we = field[o + 4], wd = field[o + 5];
    weights[i * 4] = byte((wc + wr) * (land ? 1 - smoothstep(26, 46, d) : 1 - smoothstep(40, 70, d)));
    weights[i * 4 + 1] = byte(wp * (land ? 1 - smoothstep(26, 40, d) : 1 - smoothstep(14, 26, d)));
    weights[i * 4 + 2] = byte(ws * wd * (land ? smoothstep(8, 26, d) * (1 - smoothstep(120, 170, d)) : 0));
    weights[i * 4 + 3] = byte(we * (land ? 1 - smoothstep(150, 200, d) : 1 - smoothstep(60, 120, d)));
    if (land && lagoonDist && lagoonDist[i] <= d + 4) {
      const L = lagoonDist[i];
      weights[i * 4] = 0;
      weights[i * 4 + 1] = 0;
      weights[i * 4 + 2] = byte(weights[i * 4 + 2] / 255 * smoothstep(40, 90, L));
      weights[i * 4 + 3] = Math.max(weights[i * 4 + 3], byte(1 - smoothstep(25, 70, L)));
      cliffWeight[i] = 0;
      top[i] = field[o + 6];
      continue;
    }
    cliffWeight[i] = byte(wc * (land ? (1 - smoothstep(110, 160, d)) * ravine[i] : 1 - smoothstep(60, 90, d)));
    top[i] = field[o + 6];
  }
  {
    const soft = new Float32Array(n * 4), near = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 4; c++) soft[i * 4 + c] = weights[i * 4 + c];
      near[i] = inBand[i] || lagoon[i] ? 1 : 0;
    }
    blurMarked(soft, 4, near, nx, nz, 2);
    for (let i = 0; i < n; i++) if (near[i]) for (let c = 0; c < 4; c++) weights[i * 4 + c] = Math.round(soft[i * 4 + c]);
    for (let i = 0; i < n; i++) if (lagoon[i] === 2 || channel[i]) weights[i * 4] = weights[i * 4 + 1] = weights[i * 4 + 3] = 0;
  }
  const stackData = new Float64Array(stacks.length * 5);
  stacks.forEach((s, k) => stackData.set([s.x, s.z, s.r, s.top, s.seed], k * 5));
  return {
    depth,
    weights,
    cliff: cliffWeight,
    top,
    shore: shoreDistance,
    stacks: stackData,
    lagoon,
    stats: { shoreNodes: S, kinds, lagoons: lagoons.map((l) => ({ x: Math.round(l.x), z: Math.round(l.z), R: Math.round(l.R), nodes: l.nodes })), stacks: stacks.length }
  };
}
var SKY_VIEW = Object.freeze({ version: "sky-view-v2", steps: Object.freeze([1, 2, 3, 4, 6, 8, 11, 15, 20, 27, 36, 48]), skipBelowSea: 40 });
var SKY_DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
function closeHeights(h, nx, nz) {
  const a = new Float64Array(h.length), b = new Float64Array(h.length);
  const pass = (src, dst, along, take) => {
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const i = z * nx + x;
      let v = src[i];
      if (along) {
        if (x > 0) v = take(v, src[i - 1]);
        if (x < nx - 1) v = take(v, src[i + 1]);
      } else {
        if (z > 0) v = take(v, src[i - nx]);
        if (z < nz - 1) v = take(v, src[i + nx]);
      }
      dst[i] = v;
    }
  };
  pass(h, a, true, Math.max);
  pass(a, b, false, Math.max);
  pass(b, a, true, Math.min);
  pass(a, b, false, Math.min);
  return b;
}
function computeSkyView(grid, heights, seaLevel = ISLAND_FRAME.seaLevel) {
  const { nx, nz, cell } = grid, n = nx * nz, steps = SKY_VIEW.steps, K = steps.length, floor = seaLevel - SKY_VIEW.skipBelowSea;
  const h = closeHeights(heights, nx, nz);
  const view = new Float32Array(n), inv = new Float64Array(8 * K), offset = new Int32Array(8 * K), dx = new Int32Array(8 * K), dz = new Int32Array(8 * K);
  for (let d = 0; d < 8; d++) {
    const [ex, ez] = SKY_DIRS[d], length = cell * Math.hypot(ex, ez);
    for (let k = 0; k < K; k++) {
      const j = d * K + k;
      inv[j] = 1 / (steps[k] * length);
      dx[j] = ex * steps[k];
      dz[j] = ez * steps[k];
      offset[j] = dz[j] * nx + dx[j];
    }
  }
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const i = z * nx + x, h0 = h[i];
    if (!(h0 >= floor)) {
      view[i] = 1;
      continue;
    }
    let sum = 0;
    for (let d = 0; d < 8; d++) {
      const [ex, ez] = SKY_DIRS[d], length = cell * (ex && ez ? Math.SQRT2 : 1);
      const xa = x + ex, za = z + ez, xb = x - ex, zb = z - ez;
      const ahead = xa >= 0 && xa < nx && za >= 0 && za < nz ? (h[i + ez * nx + ex] - h0) / length : NaN;
      const behind = xb >= 0 && xb < nx && zb >= 0 && zb < nz ? (h0 - h[i - ez * nx - ex]) / length : NaN;
      const own = Number.isNaN(ahead) ? behind : Number.isNaN(behind) ? ahead : Math.min(ahead, behind);
      const ref = Math.max(0, Number.isNaN(own) ? 0 : own);
      let best = ref;
      for (let k = 0, j = d * K; k < K; k++, j++) {
        const sx = x + dx[j], sz = z + dz[j];
        if (sx < 0 || sx >= nx || sz < 0 || sz >= nz) break;
        const e = (h[i + offset[j]] - h0) * inv[j];
        if (e > best) best = e;
      }
      sum += 1 - (best / Math.sqrt(1 + best * best) - ref / Math.sqrt(1 + ref * ref));
    }
    view[i] = sum / 8;
  }
  const out = new Uint8Array(n);
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    let total = 0, weight = 0;
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      const sx = x + ox, sz = z + oz;
      if (sx < 0 || sx >= nx || sz < 0 || sz >= nz) continue;
      const w = (ox ? 1 : 2) * (oz ? 1 : 2);
      total += view[sz * nx + sx] * w;
      weight += w;
    }
    out[z * nx + x] = Math.round(Math.max(0, Math.min(1, total / weight)) * 255);
  }
  return out;
}

// worldgen/hydro-network.js
var HYDRO = Object.freeze({ channelArea: 6e4, headwaterArea: 12e3, coastalStreamArea: 16e4, lakeMinArea: 12e3, lakeMaxArea: 32e4, minRiverLength: 90, damReach: 8 });
function catchmentOf(flow, root) {
  const { donorCount, donors } = flow, out = [root];
  for (let k = 0; k < out.length; k++) {
    const node = out[k], c = donorCount[node];
    for (let j = 0; j < c; j++) out.push(donors[node * 8 + j]);
  }
  return out;
}
function floodBehindSill(model, d, level, inCatch) {
  const { grid: { nx, nz }, filled, fixed } = model, lake = [];
  const members = catchmentOf(model.flow, d);
  for (const i of members) inCatch[i] = 1;
  for (const i of members) if (i !== d && filled[i] < level) lake.push(i);
  const dx = d % nx, dz = (d - dx) / nx, dam = [];
  let leak = false;
  for (const i of lake) {
    const ix = i % nx, iz = (i - ix) / nx;
    for (let k = 0; k < 8 && !leak; k++) {
      const jx = ix + NEIGHBOUR_DX[k], jz = iz + NEIGHBOUR_DZ[k];
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) {
        leak = true;
        break;
      }
      const j = jz * nx + jx;
      if (inCatch[j] || j === d) continue;
      if (fixed[j]) {
        leak = true;
        break;
      }
      if (filled[j] < level + 0.5) {
        if (Math.max(Math.abs(jx - dx), Math.abs(jz - dz)) <= HYDRO.damReach) dam.push(j);
        else leak = true;
      }
    }
    if (leak) break;
  }
  for (const i of members) inCatch[i] = 0;
  return leak ? null : { lake, dam };
}
function bestFlood(model, d, rng, inCatch) {
  let best = null;
  for (const sill of [5, 7, 9, 11, 13]) {
    const s = sill * rng.range(0.85, 1.1), level = model.filled[d] + s;
    const r = floodBehindSill(model, d, level, inCatch);
    if (!r) break;
    const area = r.lake.length * model.grid.cell * model.grid.cell;
    if (area > HYDRO.lakeMaxArea) break;
    if (area >= HYDRO.lakeMinArea) best = { ...r, sill: s, level, area };
  }
  return best;
}
function placeValleyLakes(model, rng, coastDist, maxLakes) {
  const { grid: { nx, cell, x0, z0 }, flow, height, filled, fixed } = model;
  const n = height.length, inCatch = new Uint8Array(n), lakeId = new Int16Array(n).fill(-1), lakes = [];
  const candidates = [];
  for (let i = 0; i < n; i++) {
    if (fixed[i]) continue;
    const a = flow.area[i];
    if (a < 15e4 || a > 26e5) continue;
    const x = x0 + i % nx * cell, z = z0 + Math.floor(i / nx) * cell;
    if (coastDist[i] < 260 || height[i] < 6.5 || height[i] > 320) continue;
    if (dhypot(x - START.spawn.x, z - START.spawn.z) < 420) continue;
    candidates.push(i);
  }
  for (let k = candidates.length - 1; k > 0; k--) {
    const j = Math.floor(rng.next() * (k + 1));
    const t = candidates[k];
    candidates[k] = candidates[j];
    candidates[j] = t;
  }
  let tries = 0;
  for (const d of candidates) {
    if (lakes.length >= maxLakes || tries > 220) break;
    const x = x0 + d % nx * cell, z = z0 + Math.floor(d / nx) * cell;
    if (lakes.some((l) => dhypot(x - l.outlet.x, z - l.outlet.z) < 700)) continue;
    let near = false;
    for (let r = -6; r <= 6 && !near; r++) for (let c = -6; c <= 6; c++) {
      const j = d + r * nx + c;
      if (j >= 0 && j < n && lakeId[j] >= 0) {
        near = true;
        break;
      }
    }
    if (near) continue;
    tries++;
    const result = bestFlood(model, d, rng, inCatch);
    if (!result || result.area < HYDRO.lakeMinArea * 2.5) continue;
    const { sill, level, area } = result;
    if (result.lake.some((i) => lakeId[i] >= 0 || coastDist[i] < 120)) continue;
    let tooClose = false;
    for (const i of result.lake) {
      const lx = x0 + i % nx * cell, lz = z0 + Math.floor(i / nx) * cell;
      if (dhypot(lx - START.spawn.x, lz - START.spawn.z) < 260) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    const id = lakes.length;
    for (const i of result.lake) lakeId[i] = id;
    const freeboard = rng.range(2, 4), R = 5.5, dx0 = d % nx, dz0 = (d - dx0) / nx;
    for (let oz = -6; oz <= 6; oz++) for (let ox = -6; ox <= 6; ox++) {
      const j = d + oz * nx + ox, t = Math.sqrt(ox * ox + oz * oz) / R;
      if (t >= 1 || j < 0 || j >= n || lakeId[j] >= 0 || result.lake.includes(j)) continue;
      const u = 1 - t * t;
      height[j] = Math.max(height[j], level + freeboard * u * u - 0.5 * (1 - u * u));
    }
    const blend = (j, crest, t, inner) => {
      const w = smoothstep(inner, 1, t);
      height[j] = Math.max(height[j], crest + (height[j] - crest) * w);
    };
    const BAR = 5;
    for (const k of result.dam) {
      const kx = k % nx, kz = (k - kx) / nx;
      if (Math.hypot(kx - dx0, kz - dz0) <= 3) continue;
      for (let oz = -BAR; oz <= BAR; oz++) for (let ox = -BAR; ox <= BAR; ox++) {
        const j = k + oz * nx + ox, t = Math.sqrt(ox * ox + oz * oz) / BAR;
        if (t >= 1 || j < 0 || j >= n || j === d || lakeId[j] >= 0 || result.lake.includes(j)) continue;
        blend(j, level + 0.6 + freeboard * 0.4, t, 0.15);
      }
    }
    for (const j of result.dam) height[j] = Math.max(height[j], level + 0.6);
    height[d] = level;
    lakes.push({ id, kind: "valley", level, sill, outletNode: d, outlet: { x, z }, nodes: result.lake, area });
  }
  return { lakes, lakeId };
}
var RING_X = [1, 0.9238795325112867, 0.7071067811865476, 0.3826834323650898, 0, -0.3826834323650898, -0.7071067811865476, -0.9238795325112867, -1, -0.9238795325112867, -0.7071067811865476, -0.3826834323650898, 0, 0.3826834323650898, 0.7071067811865476, 0.9238795325112867];
var RING_Z = [0, 0.3826834323650898, 0.7071067811865476, 0.9238795325112867, 1, 0.9238795325112867, 0.7071067811865476, 0.3826834323650898, 0, -0.3826834323650898, -0.7071067811865476, -0.9238795325112867, -1, -0.9238795325112867, -0.7071067811865476, -0.3826834323650898];
function addCraterLake(model, lakes, lakeId, rng) {
  const { grid: { nx, nz, cell, x0, z0 }, height, layout: { volcano } } = model;
  const cx = (volcano.x - x0) / cell, cz = (volcano.z - z0) / cell, rCells = volcano.craterRadius / cell;
  let rim = 0;
  for (let k = 0; k < 16; k++) {
    const px = Math.round(cx + rCells * 1.15 * RING_X[k]), pz = Math.round(cz + rCells * 1.15 * RING_Z[k]);
    if (px > 0 && pz > 0 && px < nx && pz < nz) rim = Math.max(rim, height[pz * nx + px]);
  }
  if (rim < 60) return;
  const depth = rng.range(18, 30), drop = rng.range(6, 10), inside = [];
  const r0 = Math.ceil(rCells * 1.6);
  let wallLow = Infinity;
  for (let dz = -r0; dz <= r0; dz++) for (let dx = -r0; dx <= r0; dx++) {
    const ix = Math.round(cx) + dx, iz = Math.round(cz) + dz;
    if (ix < 1 || iz < 1 || ix >= nx - 1 || iz >= nz - 1) continue;
    const i = iz * nx + ix, r = dhypot(ix - cx, iz - cz) / rCells;
    if (r > 1.55) continue;
    const rimLift = 6 * smoothstep(1.55, 1.05, r) * smoothstep(0.6, 1.05, r);
    const bowl = rim - depth * (1 - smoothstep(0.15, 1.05, r));
    height[i] = r < 1.05 ? Math.min(height[i] + rimLift, bowl) : height[i] + rimLift;
    if (r < 1.05) inside.push(i);
    else if (r <= 1.35) wallLow = Math.min(wallLow, height[i]);
  }
  const level = Math.min(rim - drop, wallLow - 1.5), nodes = inside.filter((i) => height[i] < level);
  if (nodes.length < 4) return;
  const id = lakes.length;
  for (const i of nodes) lakeId[i] = id;
  lakes.push({ id, kind: "crater", level, sill: 0, outletNode: -1, outlet: null, nodes, area: nodes.length * cell * cell, closed: true });
}
function buildHydroNetwork(model, { maxLakes } = {}) {
  const { grid: { nx, nz, cell, x0, z0 }, height, fixed, flow, layout } = model;
  const rng = createRng(deriveSeed(layout.seed, 31));
  const coastDist = model.coastDistance;
  const want = maxLakes ?? rng.int(1, 3), before = model.routeHeight ? Float64Array.from(height) : null;
  const { lakes, lakeId } = placeValleyLakes(model, rng, coastDist, want);
  addCraterLake(model, lakes, lakeId, rng);
  const floodSeed = deriveSeed(layout.seed, 79) | 1;
  let route = height;
  if (before) {
    route = Float64Array.from(model.routeHeight);
    for (let i = 0; i < route.length; i++) if (height[i] !== before[i]) route[i] = height[i];
  }
  priorityFlood(route, nx, nz, fixed, model.filled, 1e-3, floodSeed);
  computeReceivers(flow, model.filled, fixed, cell, 0.35, deriveSeed(layout.seed, 80));
  buildStack(flow);
  accumulateArea(flow, cell * cell);
  const { receiver, donorCount, donors, area } = flow;
  const n = nx * nz, channel = new Uint8Array(n);
  for (let i = 0; i < n; i++) channel[i] = !fixed[i] && lakeId[i] < 0 && area[i] >= HYDRO.channelArea ? 1 : 0;
  const mainDonor = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = -1, bestA = -1;
    const c = donorCount[i];
    for (let k = 0; k < c; k++) {
      const j = donors[i * 8 + k];
      if (channel[j] && (area[j] > bestA || area[j] === bestA && j < best)) {
        best = j;
        bestA = area[j];
      }
    }
    mainDonor[i] = best;
  }
  const rivers = [], owner = new Int32Array(n).fill(-1);
  const pending = [];
  for (let i = 0; i < n; i++) {
    if (!channel[i]) continue;
    const r = receiver[i];
    if (fixed[r]) pending.push({ mouth: i, terminal: { kind: "ocean", node: r } });
    else if (lakeId[r] >= 0) pending.push({ mouth: i, terminal: { kind: "lake", node: r, lakeId: lakeId[r] } });
  }
  pending.sort((a, b) => area[b.mouth] - area[a.mouth] || a.mouth - b.mouth);
  const queue = pending.map((p) => ({ ...p, parent: -1 }));
  for (let q = 0; q < queue.length; q++) {
    const job = queue[q], nodes = [];
    let node = job.mouth;
    while (node >= 0 && owner[node] < 0) {
      nodes.push(node);
      node = mainDonor[node];
    }
    if (!nodes.length) continue;
    const id = rivers.length;
    for (const v of nodes) owner[v] = id;
    nodes.reverse();
    const sourceNode = nodes[0], up = flow.donorCount[sourceNode];
    let source = { kind: "spring" };
    for (let k = 0; k < up; k++) {
      const j = donors[sourceNode * 8 + k];
      if (lakeId[j] >= 0) {
        source = { kind: "lake", lakeId: lakeId[j] };
        break;
      }
    }
    const river = { id, nodes, terminal: job.terminal, parent: job.parent, source };
    rivers.push(river);
    for (let k = nodes.length - 1; k >= 0; k--) {
      const v = nodes[k], c = donorCount[v];
      for (let j = 0; j < c; j++) {
        const t = donors[v * 8 + j];
        if (channel[t] && t !== mainDonor[v] && owner[t] < 0) queue.push({ mouth: t, terminal: { kind: "river", node: v, riverId: id }, parent: id });
      }
    }
  }
  const keep = rivers.map((r) => {
    if (rivers.some((c) => c.parent === r.id)) return true;
    if (r.nodes.length * cell < HYDRO.minRiverLength) return false;
    if (r.terminal.kind === "ocean" && area[r.nodes[r.nodes.length - 1]] < (model.coast?.lagoon?.[r.terminal.node] ? HYDRO.channelArea : HYDRO.coastalStreamArea)) return false;
    return true;
  });
  const finalRivers = [];
  const remap = /* @__PURE__ */ new Map();
  for (const r of rivers) if (keep[r.id]) {
    remap.set(r.id, finalRivers.length);
    finalRivers.push(r);
  }
  for (const r of finalRivers) {
    r.id = remap.get(r.id);
    if (r.parent >= 0) r.parent = remap.get(r.parent) ?? -1;
    if (r.terminal.kind === "river") r.terminal.riverId = remap.get(r.terminal.riverId) ?? -1;
  }
  const valid = finalRivers.filter((r) => r.terminal.kind !== "river" || r.terminal.riverId >= 0);
  const taken = new Uint8Array(n);
  for (const r of valid) for (const v of r.nodes) taken[v] = 1;
  for (const r of valid) {
    if (r.source.kind !== "spring") continue;
    const head = [];
    let node = r.nodes[0];
    for (let guard = 0; guard < 400; guard++) {
      let best = -1, bestA = -1;
      const c = donorCount[node];
      for (let k = 0; k < c; k++) {
        const j = donors[node * 8 + k];
        if (!taken[j] && lakeId[j] < 0 && area[j] > bestA) {
          best = j;
          bestA = area[j];
        }
      }
      if (best < 0 || bestA < HYDRO.headwaterArea) break;
      head.push(best);
      taken[best] = 1;
      node = best;
    }
    if (head.length) {
      head.reverse();
      r.nodes = head.concat(r.nodes);
    }
  }
  return { lakes, lakeId, rivers: valid, channel, coastDistance: coastDist };
}

// worldgen/river-shape.js
var RIVER_SHAPE = Object.freeze({ step: 3, bankMin: 0.35, ribbonMargin: 1.4 });
function channelWidth(area) {
  const a = Math.sqrt(area / 1e6);
  return 1 + 11 * a;
}
function channelDepth(area) {
  const a = Math.sqrt(area / 1e6);
  return 0.18 + 1.4 * a / (1 + 0.3 * a);
}
function bankHeight(area) {
  return RIVER_SHAPE.bankMin + 0.42 * channelDepth(area);
}
function sampleGrid(model, field, x, z) {
  const { cell, x0, z0, nx, nz } = model.grid;
  let fx = (x - x0) / cell, fz = (z - z0) / cell;
  fx = clamp(fx, 0, nx - 1.000001);
  fz = clamp(fz, 0, nz - 1.000001);
  const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, i = iz * nx + ix;
  const a = field[i] + (field[i + 1] - field[i]) * u, b = field[i + nx] + (field[i + nx + 1] - field[i + nx]) * u;
  return a + (b - a) * v;
}
function chaikin(points, iterations) {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) break;
    const out = [pts[0]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25, t: a.t * 0.75 + b.t * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75, t: a.t * 0.25 + b.t * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}
function resample(points, step) {
  const out = [];
  let acc = 0;
  out.push({ ...points[0], s: 0 });
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1], len = dhypot(b.x - a.x, b.z - a.z);
    let pos = step - acc;
    while (pos <= len) {
      const f = pos / len;
      out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, t: a.t + (b.t - a.t) * f, s: total + pos });
      pos += step;
    }
    acc = (acc + len) % step;
    total += len;
  }
  const last = points[points.length - 1];
  if (total - out[out.length - 1].s > step * 0.35) out.push({ ...last, s: total });
  else {
    out[out.length - 1] = { ...last, s: total };
  }
  return out;
}
function movingAverage(values, radius) {
  const n = values.length, out = new Float64Array(n), prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + values[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius), b = Math.min(n - 1, i + radius);
    out[i] = (prefix[b + 1] - prefix[a]) / (b - a + 1);
  }
  return out;
}
function nodePoint(model, i) {
  const { nx, cell, x0, z0 } = model.grid;
  return { x: x0 + i % nx * cell, z: z0 + Math.floor(i / nx) * cell };
}
function valleyRoom(model, x, z, nxDir, nzDir, floor, need) {
  const room = [0, 0];
  for (let side = 0; side < 2; side++) {
    const sgn = side ? -1 : 1;
    let w = 0;
    for (let o = 6; o <= 150; o += 6) {
      const h = sampleGrid(model, model.height, x + nxDir * o * sgn, z + nzDir * o * sgn);
      if (h > floor + need) break;
      w = o;
    }
    room[side] = w;
  }
  return room;
}
function shapeRivers(model, hydro) {
  const seed = model.layout.seed, sea = ISLAND_FRAME.seaLevel, shaped = [];
  const area = model.flow.area, step = RIVER_SHAPE.step;
  for (const river of hydro.rivers) {
    const pts = river.nodes.map((i, k) => ({ ...nodePoint(model, i), t: k }));
    const last = river.nodes.length - 1;
    const tp = nodePoint(model, river.terminal.node);
    if (river.terminal.kind === "ocean") {
      const a = pts[Math.max(0, last - 3)], dx = tp.x - a.x, dz = tp.z - a.z, l = dhypot(dx, dz) || 1;
      pts.push({ x: tp.x, z: tp.z, t: last + 1 }, { x: tp.x + dx / l * 36, z: tp.z + dz / l * 36, t: last + 2 });
    } else pts.push({ x: tp.x, z: tp.z, t: last + 1 });
    if (river.source.kind === "lake") {
      const lake = hydro.lakes[river.source.lakeId], s0 = pts[0], s1 = pts[Math.min(2, pts.length - 1)];
      const dx = s0.x - s1.x, dz = s0.z - s1.z, l = dhypot(dx, dz) || 1;
      pts.unshift({ x: s0.x + dx / l * 14, z: s0.z + dz / l * 14, t: -1 });
      river.sourceLevel = lake.level;
    }
    const base = resample(chaikin(pts, 3), 4);
    const n = base.length;
    if (n < 4) continue;
    const A = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const ti = clamp(Math.round(base[k].t), 0, last);
      A[k] = area[river.nodes[ti]];
      if (k) A[k] = Math.max(A[k], A[k - 1]);
    }
    const raw = new Float64Array(n);
    for (let k = 0; k < n; k++) raw[k] = sampleGrid(model, model.height, base[k].x, base[k].z);
    if (river.source.kind === "lake") for (let k = 0; k < n && base[k].t <= 0.5; k++) raw[k] = river.sourceLevel + bankHeight(A[k]);
    for (let k = 1; k < n; k++) raw[k] = Math.min(raw[k], raw[k - 1]);
    const falls = [];
    for (let k = 1; k < n - 2; k++) {
      const local = (raw[k] - raw[Math.min(n - 1, k + 2)]) / Math.max(1, base[Math.min(n - 1, k + 2)].s - base[k].s);
      if (local < 0.18) continue;
      let end = k + 1;
      while (end < n - 1 && base[end].s - base[k].s < 40) {
        const g = (raw[end] - raw[Math.min(n - 1, end + 2)]) / Math.max(1, base[Math.min(n - 1, end + 2)].s - base[end].s);
        if (g < 0.08) break;
        end++;
      }
      const drop = Math.min(raw[k] - raw[end], 15);
      if (drop >= 4 && (!falls.length || k - falls[falls.length - 1].k > 10)) {
        const foot = raw[k] - drop;
        for (let q = k + 1; q <= end; q++) raw[q] = Math.min(raw[q], foot);
        for (let q = end + 1; q < n; q++) raw[q] = Math.min(raw[q], raw[q - 1]);
        falls.push({ k: k + 1, s: base[k + 1].s, drop });
        k = end;
      }
    }
    const floor = new Float64Array(n);
    {
      let start = 0;
      for (const cut of [...falls.map((f) => f.k), n]) {
        const part = movingAverage(raw.subarray(start, cut), 6);
        floor.set(part, start);
        start = cut;
      }
    }
    for (let k = 1; k < n; k++) floor[k] = Math.min(floor[k], floor[k - 1]);
    let endLevel = null;
    if (river.terminal.kind === "ocean") endLevel = sea;
    else if (river.terminal.kind === "lake") endLevel = hydro.lakes[river.terminal.lakeId].level;
    else {
      const parent = shaped.find((p) => p.id === river.terminal.riverId);
      if (parent) endLevel = parent.levelAt(tp.x, tp.z);
    }
    const width = new Float64Array(n), depth = new Float64Array(n), bank = new Float64Array(n), level = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const noiseW = 1 + 0.12 * gnoise(seed, base[k].s / 90, river.id * 7.1, 1101);
      width[k] = channelWidth(A[k]) * noiseW;
      depth[k] = channelDepth(A[k]);
      bank[k] = bankHeight(A[k]);
      level[k] = floor[k] - bank[k];
    }
    if (endLevel !== null) {
      const blend = Math.min(n - 1, 30);
      for (let k = n - 1 - blend; k < n; k++) {
        const t = smoothstep(n - 1 - blend, n - 1, k);
        level[k] = Math.max(level[k] * (1 - t) + endLevel * t, endLevel);
      }
      if (river.terminal.kind === "ocean") {
        for (let k = 0; k < n; k++) level[k] = Math.max(level[k], sea);
      }
    }
    if (river.source.kind === "lake") for (let k = 0; k < n && base[k].t <= 0.5; k++) level[k] = river.sourceLevel;
    for (let k = 1; k < n; k++) level[k] = Math.min(level[k], level[k - 1]);
    const slope = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 7), b = Math.min(n - 1, k + 7);
      slope[k] = (level[a] - level[b]) / Math.max(1, base[b].s - base[a].s);
    }
    const fx = movingAverage(Float64Array.from(base, (p) => p.x), 10), fz = movingAverage(Float64Array.from(base, (p) => p.z), 10);
    const nrmX = new Float64Array(n), nrmZ = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const a = Math.max(0, k - 2), b = Math.min(n - 1, k + 2), tx = fx[b] - fx[a], tz = fz[b] - fz[a], l = dhypot(tx, tz) || 1;
      nrmX[k] = -tz / l;
      nrmZ[k] = tx / l;
    }
    const amp = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const gentle = 1 - smoothstep(4e-3, 0.032, slope[k]);
      const room = valleyRoom(model, base[k].x, base[k].z, nrmX[k], nrmZ[k], floor[k], Math.max(2.5, bank[k] + 1.6));
      const allow = Math.max(0, Math.min(room[0], room[1]) - width[k] * 0.5 - 2) * 1.15;
      const want = gentle * width[k] * (1.5 + 0.9 * (gnoise(seed, base[k].s / 260, river.id * 3.3, 1102) * 0.5 + 0.5));
      amp[k] = Math.min(want, allow);
    }
    const ampS = movingAverage(amp, 12), total = base[n - 1].s;
    for (let k = 0; k < n; k++) {
      const s = base[k].s, endTaper = river.terminal.kind === "river" ? smoothstep(0, 60, total - s) : smoothstep(0, 25, total - s);
      ampS[k] *= smoothstep(0, 40, s) * endTaper;
    }
    let phase = gnoise(seed, river.id * 1.7, 0.3, 1103) * 3;
    const course = [];
    for (let k = 0; k < n; k++) {
      if (k) {
        const lambda = Math.max(26, width[k] * (10.5 + 3.5 * gnoise(seed, base[k].s / 310, river.id * 5.9, 1104)));
        phase += 6.283185307179586 * (base[k].s - base[k - 1].s) / lambda;
      }
      const y = ampS[k] * (dsin(phase) + 0.24 * dsin(3 * phase - 0.6));
      course.push({ x: base[k].x + nrmX[k] * y, z: base[k].z + nrmZ[k] * y, t: k });
    }
    const camp = START.spawn, keep = 48;
    for (const p of course) {
      const dx = p.x - camp.x, dz = p.z - camp.z, d = dhypot(dx, dz);
      if (d < keep && d > 1e-6) {
        p.x = camp.x + dx / d * keep;
        p.z = camp.z + dz / d * keep;
      }
    }
    const fine = resample(course, step);
    const m = fine.length, out = {
      id: river.id,
      parent: river.parent,
      terminal: river.terminal,
      source: river.source,
      length: fine[m - 1].s,
      x: new Float64Array(m),
      z: new Float64Array(m),
      s: new Float64Array(m),
      level: new Float64Array(m),
      width: new Float64Array(m),
      depth: new Float64Array(m),
      bank: new Float64Array(m),
      floor: new Float64Array(m),
      area: new Float64Array(m),
      curvature: new Float64Array(m),
      falls: []
    };
    for (let k = 0; k < m; k++) {
      const p = fine[k], t = clamp(p.t, 0, n - 1), i0 = Math.floor(t), i1 = Math.min(n - 1, i0 + 1), f = t - i0;
      out.x[k] = p.x;
      out.z[k] = p.z;
      out.s[k] = p.s;
      out.level[k] = level[i0] + (level[i1] - level[i0]) * f;
      out.width[k] = width[i0] + (width[i1] - width[i0]) * f;
      out.depth[k] = depth[i0] + (depth[i1] - depth[i0]) * f;
      out.bank[k] = bank[i0] + (bank[i1] - bank[i0]) * f;
      out.floor[k] = floor[i0] + (floor[i1] - floor[i0]) * f;
      out.area[k] = A[i0] + (A[i1] - A[i0]) * f;
    }
    for (let k = 1; k < m; k++) out.level[k] = Math.min(out.level[k], out.level[k - 1]);
    for (const fall of falls) {
      let best = 1;
      for (let k = 1; k < m; k++) if (Math.abs(fine[k].t - fall.k) < Math.abs(fine[best].t - fall.k)) best = k;
      const top = out.level[best - 1], bottom = out.level[Math.min(m - 1, best)];
      if (top - bottom > 2.5) out.falls.push({ k: best, top, bottom, drop: top - bottom });
    }
    out.step = new Uint8Array(m);
    {
      const smooth = Float64Array.from(out.level);
      let k = 0;
      while (k < m - 1) {
        const a = Math.max(0, k - 4), b = Math.min(m - 1, k + 4), grad = (smooth[a] - smooth[b]) / Math.max(1, out.s[b] - out.s[a]);
        if (grad < 0.035 || k < 3 || out.falls.some((f) => Math.abs(f.k - k) < 6)) {
          k++;
          continue;
        }
        const poolLen = clamp(2.2 * out.width[k] + 6 + 4 * gnoise(seed, out.s[k] / 30, river.id * 4.1, 1105), 7, 20);
        let j = k;
        while (j < m - 1 && out.s[j] - out.s[k] < poolLen) j++;
        const pool = smooth[j];
        for (let q = k; q < j; q++) out.level[q] = Math.min(out.level[q], pool);
        out.step[k - 1] = 1;
        k = j;
      }
      for (let q = 1; q < m; q++) out.level[q] = Math.min(out.level[q], out.level[q - 1]);
    }
    for (let k = 0; k < m; k++) {
      const a = Math.max(0, k - 2), b = Math.min(m - 1, k + 2);
      if (b - a < 2) continue;
      const ax = out.x[k] - out.x[a], az = out.z[k] - out.z[a], bx = out.x[b] - out.x[k], bz = out.z[b] - out.z[k];
      const la = dhypot(ax, az) || 1, lb = dhypot(bx, bz) || 1, cross = (ax * bz - az * bx) / (la * lb), dist = (la + lb) * 0.5;
      out.curvature[k] = cross / dist;
    }
    const kc = movingAverage(out.curvature, 3);
    out.curvature.set(kc);
    out.levelAt = (x, z) => {
      let best = 0, bd = Infinity;
      for (let k = 0; k < m; k++) {
        const dx = out.x[k] - x, dz = out.z[k] - z, d = dx * dx + dz * dz;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      return out.level[best];
    };
    shaped.push(out);
  }
  return shaped;
}

// worldgen/swamps.js
var SWAMP = Object.freeze({
  version: "swamp-v3",
  // Candidate centres: height above the sea (m), distance from the coast and
  // from the camp (m), relief within +-40 m (m), the drainage that makes it wet (m²).
  height: Object.freeze([1, 32]),
  coast: 130,
  camp: 480,
  relief: 8,
  wet: Object.freeze([1e4, 3e5]),
  // The basin: half-lengths (m), lobes, the warp of its outline (m) and its
  // scale (m), and the small wobble of the edge (m).
  radiusA: Object.freeze([165, 245]),
  radiusB: Object.freeze([110, 160]),
  lobes: Object.freeze([0, 2]),
  warp: Object.freeze([24, 44]),
  warpScale: Object.freeze([110, 180]),
  wobble: 12,
  // Footprint: its area (m²) and the least distance from the coast and from
  // the camp (m); see passes for the share of the drawn basin that must be
  // usable and the spread of the ground inside it (m, 10th..90th percentile).
  area: Object.freeze([45e3, 15e4]),
  coastMin: 55,
  campMin: 380,
  // Rivers: the margin kept clear beside a channel (m) and how far the marsh
  // lies above a river beside it (m).
  riverMargin: 24,
  aboveRiver: 0.45,
  // Level: this quantile of the ground inside (cut and fill about balance),
  // at least this far above the sea (m); the floor stays above the sea (m).
  quantile: 0.42,
  aboveSea: 1.2,
  floorAboveSea: 0.25,
  // Ground: the floor's mean below the level (m) and its swing (m) - half of
  // it lies under water - and the rim above the level (m); the rim is level
  // to a little inside the water's outline.
  floor: 0.06,
  swing: 0.42,
  rim: 0.42,
  // The levee outside: its flat crest (m), then its grade, out to this band (m);
  // the largest step left at the band's edge (m).
  crest: 12,
  grade: 0.12,
  band: 48,
  maxStep: 0.8,
  // The water's outline lies this far inside the basin's edge (m), on the rim.
  outline: 11,
  // A second marsh: its least distance from the first (m), its chance, and the
  // share of the best score it must reach.
  second: 950,
  secondChance: 0.6,
  secondScore: 0.62,
  // Candidates tried per marsh, and the spacing between tried centres (m).
  tries: 160,
  spacing: 70,
  // Ever looser passes until a marsh fits (every island has one): the spread
  // allowed, the usable share, the least area (share of area[0]), whether the
  // levee's step counts, and the basin's scale.
  passes: Object.freeze([
    Object.freeze({ spread: 6.5, share: 0.66, area: 1, step: true, scale: 1 }),
    Object.freeze({ spread: 10, share: 0.55, area: 0.85, step: true, scale: 0.9 }),
    Object.freeze({ spread: 16, share: 0.45, area: 0.6, step: false, scale: 0.75 })
  ])
});
var NAMES = Object.freeze(["霧葦の沼地", "朽ち木の沼地"]);
var SWAMP_DISTANCE_RANGE = 127;
function nearestSeed2(isSeed, nx, nz, cell) {
  const n = nx * nz, d = new Float64Array(n), src = new Int32Array(n).fill(-1), a = cell, b = cell * 1.4142135623730951;
  for (let i = 0; i < n; i++) if (isSeed[i]) src[i] = i;
  else d[i] = 1e9;
  const relax = (i, j, w) => {
    if (d[j] + w < d[i]) {
      d[i] = d[j] + w;
      src[i] = src[j];
    }
  };
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = iz * nx + ix;
    if (ix > 0) relax(i, i - 1, a);
    if (iz > 0) {
      relax(i, i - nx, a);
      if (ix > 0) relax(i, i - nx - 1, b);
      if (ix < nx - 1) relax(i, i - nx + 1, b);
    }
  }
  for (let iz = nz - 1; iz >= 0; iz--) for (let ix = nx - 1; ix >= 0; ix--) {
    const i = iz * nx + ix;
    if (ix < nx - 1) relax(i, i + 1, a);
    if (iz < nz - 1) {
      relax(i, i + nx, a);
      if (ix < nx - 1) relax(i, i + nx + 1, b);
      if (ix > 0) relax(i, i + nx - 1, b);
    }
  }
  return { d, src };
}
function distanceToSeeds(isSeed, nx, nz, cell) {
  const INF = 1e20, f = new Float64Array(Math.max(nx, nz)), dt = new Float64Array(Math.max(nx, nz)), v = new Int32Array(Math.max(nx, nz)), zz = new Float64Array(Math.max(nx, nz) + 1);
  const g = new Float64Array(nx * nz);
  const pass = (len) => {
    let k = 0;
    v[0] = 0;
    zz[0] = -INF;
    zz[1] = INF;
    for (let q = 1; q < len; q++) {
      let s;
      for (; ; ) {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s <= zz[k] && k > 0) k--;
        else break;
      }
      if (s <= zz[k]) {
        v[0] = q;
        zz[0] = -INF;
        zz[1] = INF;
        k = 0;
        continue;
      }
      k++;
      v[k] = q;
      zz[k] = s;
      zz[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (zz[k + 1] < q) k++;
      const p = v[k];
      dt[q] = (q - p) * (q - p) + f[p];
    }
  };
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) f[iz] = isSeed[iz * nx + ix] ? 0 : INF;
    pass(nz);
    for (let iz = 0; iz < nz; iz++) g[iz * nx + ix] = dt[iz];
  }
  const d = new Float64Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) f[ix] = g[iz * nx + ix];
    pass(nx);
    for (let ix = 0; ix < nx; ix++) d[iz * nx + ix] = Math.sqrt(Math.min(dt[ix], 1e18)) * cell;
  }
  return d;
}
function chaikin2(ring, rounds) {
  let r = ring;
  for (let k = 0; k < rounds; k++) {
    const out = [];
    for (let i = 0; i < r.length; i++) {
      const p = r[i], q = r[(i + 1) % r.length];
      out.push({ x: p.x * 0.75 + q.x * 0.25, z: p.z * 0.75 + q.z * 0.25 }, { x: p.x * 0.25 + q.x * 0.75, z: p.z * 0.25 + q.z * 0.75 });
    }
    r = out;
  }
  return r;
}
var EDGE_CORNERS = [[0, 1], [1, 2], [3, 2], [0, 3]];
var CASE_PAIRS = { 1: [[0, 3]], 2: [[0, 1]], 3: [[1, 3]], 4: [[1, 2]], 6: [[0, 2]], 7: [[2, 3]], 8: [[2, 3]], 9: [[0, 2]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] };
function contourRings(values, nx, nz, cell, x0, z0, box) {
  const point = /* @__PURE__ */ new Map(), link = /* @__PURE__ */ new Map();
  for (let iz = box.z0; iz < box.z1; iz++) for (let ix = box.x0; ix < box.x1; ix++) {
    const i = iz * nx + ix, v = [values[i], values[i + 1], values[i + nx + 1], values[i + nx]];
    const code = (v[0] > 0 ? 1 : 0) | (v[1] > 0 ? 2 : 0) | (v[2] > 0 ? 4 : 0) | (v[3] > 0 ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const cx = [ix, ix + 1, ix + 1, ix], cz = [iz, iz, iz + 1, iz + 1], edgeId = [2 * i, 2 * (i + 1) + 1, 2 * (i + nx), 2 * i + 1];
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
      const p = crossing(e1), q = crossing(e2), shared = EDGE_CORNERS[e1].find((c) => EDGE_CORNERS[e2].includes(c)), corner = shared ?? 0;
      const kx = x0 + cx[corner] * cell, kz = z0 + cz[corner] * cell, cross = (q.x - p.x) * (kz - p.z) - (q.z - p.z) * (kx - p.x);
      if (cross > 0 === v[corner] > 0) link.set(edgeId[e1], edgeId[e2]);
      else link.set(edgeId[e2], edgeId[e1]);
    }
  }
  const rings = [], used = /* @__PURE__ */ new Set();
  for (const start of link.keys()) {
    if (used.has(start)) continue;
    const ring = [];
    let id = start, guard = 0;
    while (id !== void 0 && !used.has(id) && guard++ < 1e6) {
      used.add(id);
      const q = point.get(id);
      ring.push({ x: q.x, z: q.z });
      id = link.get(id);
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}
var ringArea = (r) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].z - r[i].x * r[j].z;
  return a * 0.5;
};
function simplifyRing(ring, tolerance) {
  const n = ring.length;
  if (n <= 8) return ring;
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < n; i += Math.max(1, n >> 6)) for (let j = i + 1; j < n; j += Math.max(1, n >> 6)) {
    const d = (ring[i].x - ring[j].x) ** 2 + (ring[i].z - ring[j].z) ** 2;
    if (d > best) {
      best = d;
      a = i;
      b = j;
    }
  }
  const keep = new Uint8Array(n);
  keep[a] = keep[b] = 1;
  const stack = [[a, b], [b, a + n]];
  while (stack.length) {
    const [s, e] = stack.pop();
    if (e - s < 2) continue;
    const p = ring[s % n], q = ring[e % n], dx = q.x - p.x, dz = q.z - p.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
    let far = -1, fd = 0;
    for (let k = s + 1; k < e; k++) {
      const r = ring[k % n], d = Math.abs((r.x - p.x) * dz - (r.z - p.z) * dx) / l;
      if (d > fd) {
        fd = d;
        far = k;
      }
    }
    if (fd > tolerance) {
      keep[far % n] = 1;
      stack.push([s, far], [far, e]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}
function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}
function selfIntersects(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segmentsCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
  }
  return false;
}
function pointInPolygon(polygon, x, z) {
  let inside = false;
  for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) {
    const pa = polygon[a], pb = polygon[b];
    if (pa.z > z !== pb.z > z && x < (pb.x - pa.x) * (z - pa.z) / (pb.z - pa.z) + pa.x) inside = !inside;
  }
  return inside;
}
function quantile(sorted, q) {
  const t = (sorted.length - 1) * q, k = Math.floor(t);
  return sorted[k] + (sorted[Math.min(sorted.length - 1, k + 1)] - sorted[k]) * (t - k);
}
function planSwamps(model, rivers, lakeId) {
  const { grid: { nx, nz, cell, x0, z0 }, height: H, fixed, layout } = model, n = nx * nz, seed = layout.seed, sea = ISLAND_FRAME.seaLevel;
  const area = model.flow.area, coast = model.coastDistance, S = SWAMP, rng = createRng(deriveSeed(seed, 5100));
  const X = (i) => x0 + i % nx * cell, Z = (i) => z0 + Math.floor(i / nx) * cell;
  const corridor = new Uint8Array(n), rlevel = new Float32Array(n);
  for (const r of rivers) {
    const m = r.x.length;
    for (let k = 0; k < m; k += 2) {
      const rad = r.width[k] * 0.5 + (r.bank ? r.bank[k] : 2) + S.riverMargin, cx = r.x[k], cz = r.z[k];
      const ix0 = Math.max(0, Math.floor((cx - rad - x0) / cell)), ix1 = Math.min(nx - 1, Math.ceil((cx + rad - x0) / cell));
      const iz0 = Math.max(0, Math.floor((cz - rad - z0) / cell)), iz1 = Math.min(nz - 1, Math.ceil((cz + rad - z0) / cell));
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        const i = iz * nx + ix;
        if (dhypot(X(i) - cx, Z(i) - cz) > rad) continue;
        if (!corridor[i] || r.level[k] > rlevel[i]) rlevel[i] = r.level[k];
        corridor[i] = 1;
      }
    }
  }
  const { d: riverDist, src: riverSrc } = nearestSeed2(corridor, nx, nz, cell);
  const riverLevelAt = (i) => riverSrc[i] >= 0 ? rlevel[riverSrc[i]] : -Infinity;
  const spawn = START.spawn, campP = START.camp, ranges = layout.ranges, volcano = layout.volcano;
  const campDistance = (x, z) => Math.min(dhypot(x - spawn.x, z - spawn.z), dhypot(x - campP.x, z - campP.z));
  const nearRange = (x, z) => ranges.some((g) => g.nodes.some((p) => dhypot(p.x - x, p.z - z) < g.width * 0.9)) || dhypot(volcano.x - x, volcano.z - z) < volcano.radius * 1.1;
  const scoreAll = (A, relaxed) => {
    const list = [], hMax = A.height[1], relief = A.relief;
    for (let iz = 6; iz < nz - 6; iz += 2) for (let ix = 6; ix < nx - 6; ix += 2) {
      const i = iz * nx + ix;
      if (fixed[i] || lakeId[i] >= 0 || corridor[i]) continue;
      const above = H[i] - sea;
      if (above < A.height[0] || above > hMax) continue;
      if (coast[i] < A.coast) continue;
      const x = X(i), z = Z(i);
      if (campDistance(x, z) < A.camp) continue;
      let lo = Infinity, hi = -Infinity, bad = false;
      for (let dz = -5; dz <= 5 && !bad; dz++) for (let dx = -5; dx <= 5; dx++) {
        const j = i + dz * nx + dx;
        if (fixed[j]) {
          bad = true;
          break;
        }
        const v = H[j];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (bad || hi - lo > relief) continue;
      if (nearRange(x, z)) continue;
      let blo = Infinity, bhi = -Infinity;
      for (let dz = -20; dz <= 20; dz += 4) for (let dx = -20; dx <= 20; dx += 4) {
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
        const v = H[jz * nx + jx];
        if (v < blo) blo = v;
        if (v > bhi) bhi = v;
      }
      const gx = (H[i + 12] - H[i - 12]) / (24 * cell), gz = (H[i + 12 * nx] - H[i - 12 * nx]) / (24 * cell);
      const wet = smoothstep(Math.log(S.wet[0]), Math.log(S.wet[1]), Math.log(Math.max(1, area[i]))), rd = riverDist[i];
      const score = 1.2 * (1 - above / hMax) + 1 * (1 - (hi - lo) / relief) + 0.9 * (1 - Math.min(1, (bhi - blo) / 18)) + 0.7 * wet + 0.5 * (rd > 40 && rd < 320 ? 1 : 0.35) + 0.3 * rng.next();
      list.push({ i, x, z, score, relaxed, slope: dhypot(gx, gz), downhill: datan2(gz, gx) });
    }
    return list.sort((a, b) => b.score - a.score || a.i - b.i);
  };
  let candidates = scoreAll(S, false);
  if (candidates.length < 8) candidates = candidates.concat(scoreAll({ ...S, height: [0.6, 60], relief: 16, coast: 90, camp: 420 }, true));
  if (candidates.length < 8) candidates = candidates.concat(scoreAll({ ...S, height: [0.4, 140], relief: 34, coast: 60, camp: 400 }, true));
  const makeBasin = (c, scale) => {
    const r = createRng(deriveSeed(seed, 5200 + c.i)), a = scale * r.range(S.radiusA[0], S.radiusA[1]), b = Math.min(a * 0.9, scale * r.range(S.radiusB[0], S.radiusB[1]));
    const free = r.next() * TAU, jitter = (r.next() - 0.5) * 0.7, along = c.downhill + Math.PI / 2 + jitter;
    const yaw = c.slope > 6e-3 ? along : free, cos = dcos(yaw), sin = dsin(yaw), lobes = [];
    for (let k = r.int(S.lobes[0], S.lobes[1]); k > 0; k--) {
      const t = r.next() * TAU, along2 = r.range(0.5, 0.82), ex = dcos(t) * a * along2, ez = dsin(t) * b * along2;
      lobes.push({ x: c.x + ex * cos - ez * sin, z: c.z + ex * sin + ez * cos, r: r.range(0.42, 0.62) * b });
    }
    return {
      x: c.x,
      z: c.z,
      a,
      b,
      yaw,
      cos,
      sin,
      lobes,
      ab: Math.sqrt(a * b),
      warp: r.range(S.warp[0], S.warp[1]),
      wl: r.range(S.warpScale[0], S.warpScale[1]),
      salt: 5300 + c.i % 9973 * 3,
      reach: a + S.warp[1] + S.wobble + 40
    };
  };
  const basinField = (B, x, z) => {
    const wx = x + B.warp * gnoise(seed, x / B.wl + 7.1, z / B.wl - 3.9, B.salt), wz = z + B.warp * gnoise(seed, x / B.wl - 5.3, z / B.wl + 8.7, B.salt + 1);
    const dx = wx - B.x, dz = wz - B.z, u = (dx * B.cos + dz * B.sin) / B.a, v = (-dx * B.sin + dz * B.cos) / B.b;
    let f = (1 - Math.sqrt(u * u + v * v)) * B.ab;
    for (const l of B.lobes) f = smax(f, l.r - dhypot(wx - l.x, wz - l.z), 30);
    return f + S.wobble * fbm(seed, x / 64 + 1.7, z / 64 - 2.3, 2, B.salt + 2);
  };
  const swamps = [], swampIndex = new Uint8Array(n), swampDistance = new Int8Array(n).fill(-SWAMP_DISTANCE_RANGE);
  const claimed = new Uint8Array(n), inF = new Uint8Array(n), seen = new Int32Array(n);
  let seenId = 0;
  const box = (x, z, reach) => ({
    x0: Math.max(2, Math.floor((x - reach - x0) / cell)),
    x1: Math.min(nx - 3, Math.ceil((x + reach - x0) / cell)),
    z0: Math.max(2, Math.floor((z - reach - z0) / cell)),
    z1: Math.min(nz - 3, Math.ceil((z + reach - z0) / cell))
  });
  const why = {};
  const no = (r) => {
    why[r] = (why[r] || 0) + 1;
    return null;
  };
  const tryMarsh = (c, P) => {
    const B = makeBasin(c, P.scale), bb = box(c.x, c.z, B.reach), usable = [];
    let drawn = 0;
    seenId++;
    for (let iz = bb.z0; iz <= bb.z1; iz++) for (let ix = bb.x0; ix <= bb.x1; ix++) {
      const i = iz * nx + ix, x = X(i), z = Z(i);
      if (basinField(B, x, z) <= 0) continue;
      drawn++;
      if (fixed[i] || lakeId[i] >= 0 || corridor[i] || claimed[i] || coast[i] < S.coastMin || campDistance(x, z) < S.campMin) continue;
      seen[i] = seenId;
      usable.push(i);
    }
    if (usable.length * cell * cell < S.area[0] * P.area) return no("usable");
    const comp = new Int32Array(usable.length).fill(-1), index = new Map(usable.map((i, k) => [i, k])), parts = [];
    for (let k = 0; k < usable.length; k++) {
      if (comp[k] >= 0) continue;
      const list = [usable[k]], id = parts.length;
      comp[k] = id;
      for (let h2 = 0; h2 < list.length; h2++) {
        const i = list[h2], ix = i % nx, iz = (i - ix) / nx;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const j = (iz + dz) * nx + ix + dx;
          if (seen[j] !== seenId) continue;
          const kk = index.get(j);
          if (comp[kk] >= 0) continue;
          comp[kk] = id;
          list.push(j);
        }
      }
      parts.push(list);
    }
    const ci = Math.round((c.z - z0) / cell) * nx + Math.round((c.x - x0) / cell);
    let nodes = index.has(ci) ? parts[comp[index.get(ci)]] : null;
    if (!nodes) nodes = parts.reduce((best, p) => p.length > best.length ? p : best, []);
    const m2 = nodes.length * cell * cell;
    if (m2 < S.area[0] * P.area) return no("small");
    if (m2 > S.area[1]) return no("big");
    if (nodes.length < drawn * P.share) return no("share");
    const hs = Float64Array.from(nodes, (i) => H[i]).sort();
    const spread = quantile(hs, 0.9) - quantile(hs, 0.1);
    if (spread > P.spread) return no("spread");
    let L = Math.max(quantile(hs, S.quantile), sea + S.aboveSea);
    let rl = -Infinity;
    for (const i of nodes) if (riverDist[i] <= 40) rl = Math.max(rl, riverLevelAt(i));
    if (rl + S.aboveRiver > L) {
      if (rl + S.aboveRiver > quantile(hs, 0.8) && P.step) return no("river");
      L = rl + S.aboveRiver;
    }
    for (const i of nodes) inF[i] = 1;
    let step = 0;
    const ob = box(c.x, c.z, B.reach + S.band + 2 * cell), w = ob.x1 - ob.x0 + 1, h = ob.z1 - ob.z0 + 1, seedsIn = new Uint8Array(w * h);
    for (let iz = ob.z0; iz <= ob.z1; iz++) for (let ix = ob.x0; ix <= ob.x1; ix++) seedsIn[(iz - ob.z0) * w + ix - ob.x0] = inF[iz * nx + ix];
    const dout = distanceToSeeds(seedsIn, w, h, cell);
    for (let iz = ob.z0; iz <= ob.z1; iz++) for (let ix = ob.x0; ix <= ob.x1; ix++) {
      const i = iz * nx + ix, d = dout[(iz - ob.z0) * w + ix - ob.x0];
      if (inF[i] || d > S.band || d < S.band - cell * 1.5 || fixed[i] || corridor[i] || lakeId[i] >= 0 || coast[i] < 30) continue;
      step = Math.max(step, L + S.rim - Math.max(0, S.band - S.crest) * S.grade - H[i]);
    }
    if (step > S.maxStep && P.step) {
      for (const i of nodes) inF[i] = 0;
      return no("step");
    }
    return { B, L, nodes, spread, step, ob, dout, w };
  };
  const accept = (c, made, P) => {
    const { L, nodes, ob, dout, w } = made, k = swamps.length + 1, salt = 5400 + k * 31;
    const hgt = ob.z1 - ob.z0 + 1, outsideSeeds = new Uint8Array(w * hgt);
    for (let iz = ob.z0; iz <= ob.z1; iz++) for (let ix = ob.x0; ix <= ob.x1; ix++) outsideSeeds[(iz - ob.z0) * w + ix - ob.x0] = inF[iz * nx + ix] ? 0 : 1;
    const din = distanceToSeeds(outsideSeeds, w, hgt, cell), at = (i) => (Math.floor(i / nx) - ob.z0) * w + i % nx - ob.x0;
    let sumX = 0, sumZ = 0, sxx = 0, szz = 0, sxz = 0;
    for (const i of nodes) {
      const x = X(i), z = Z(i), d = din[at(i)], natural = H[i];
      const floor = L - S.floor + S.swing * (1.45 * fbm(seed, x / 48 + 3.3, z / 48 - 1.2, 2, salt) + 0.55 * gnoise(seed, x / 19 - 4.1, z / 19 + 2.6, salt + 7));
      const edge = smoothstep(4, 30, d), rimBand = 1 - smoothstep(S.outline + 2, S.outline + 15, d);
      let hh = natural > floor ? natural + (floor - natural) * edge : floor;
      if (rimBand > 0) hh = Math.max(hh, (L + S.rim) * rimBand + hh * (1 - rimBand));
      H[i] = Math.max(hh, sea + S.floorAboveSea);
      sumX += x;
      sumZ += z;
    }
    for (let iz = ob.z0; iz <= ob.z1; iz++) for (let ix = ob.x0; ix <= ob.x1; ix++) {
      const i = iz * nx + ix, d = dout[at(i)];
      if (inF[i] || d > S.band || fixed[i] || corridor[i] || lakeId[i] >= 0 || coast[i] < 30) continue;
      const target = L + S.rim - Math.max(0, d - S.crest) * S.grade;
      if (target > H[i] - 0.6) H[i] = smax(H[i], target, 0.6);
    }
    const cx = sumX / nodes.length, cz = sumZ / nodes.length;
    for (const i of nodes) {
      const dx = X(i) - cx, dz = Z(i) - cz;
      sxx += dx * dx;
      szz += dz * dz;
      sxz += dx * dz;
    }
    sxx /= nodes.length;
    szz /= nodes.length;
    sxz /= nodes.length;
    const yaw = 0.5 * datan2(2 * sxz, sxx - szz), tr = sxx + szz, det = sxx * szz - sxz * sxz, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const radiusX = Math.max(60, 2 * Math.sqrt(Math.max(1, tr / 2 + disc))), radiusZ = Math.max(50, 2 * Math.sqrt(Math.max(1, tr / 2 - disc)));
    const field = new Float32Array(n), cbox = { x0: ob.x0, x1: ob.x1, z0: ob.z0, z1: ob.z1 };
    for (let iz = ob.z0; iz <= ob.z1; iz++) for (let ix = ob.x0; ix <= ob.x1; ix++) {
      const i = iz * nx + ix;
      field[i] = inF[i] ? din[at(i)] - S.outline : -S.outline;
    }
    const rings = contourRings(field, nx, nz, cell, x0, z0, cbox).map((r) => ({ r, a: ringArea(r) })).filter((o) => o.a > 0).sort((a, b) => b.a - a.a);
    let polygon = null;
    if (rings.length) {
      for (const tol of [2.5, 1.5, 0.8, 0.4]) {
        const p = simplifyRing(chaikin2(simplifyRing(rings[0].r, tol), 2), 0.35);
        if (p.length >= 3 && p.length <= 480 && !selfIntersects(p)) {
          polygon = p;
          break;
        }
      }
      polygon = polygon || rings[0].r;
      if (ringArea(polygon) < 0) polygon.reverse();
      polygon = polygon.filter((p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        return dhypot(p.x - q.x, p.z - q.z) > 0.05;
      });
    }
    if (polygon) {
      for (const i of nodes) if (!pointInPolygon(polygon, X(i), Z(i)) && H[i] < L + S.rim) H[i] = Math.max(H[i], L + S.rim * 0.8);
    }
    for (let iz = ob.z0; iz <= ob.z1; iz++) for (let ix = ob.x0; ix <= ob.x1; ix++) {
      const i = iz * nx + ix, d = inF[i] ? din[at(i)] : -dout[at(i)];
      const q = Math.max(-SWAMP_DISTANCE_RANGE, Math.min(SWAMP_DISTANCE_RANGE, Math.round(d)));
      if (q > swampDistance[i]) {
        swampDistance[i] = q;
        swampIndex[i] = q > -SWAMP_DISTANCE_RANGE ? k : 0;
      }
      if (d > -S.band - 60) claimed[i] = 1;
    }
    for (const i of nodes) inF[i] = 0;
    let bounds = null;
    if (polygon) {
      bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
      for (const p of polygon) {
        bounds.minX = Math.min(bounds.minX, p.x);
        bounds.maxX = Math.max(bounds.maxX, p.x);
        bounds.minZ = Math.min(bounds.minZ, p.z);
        bounds.maxZ = Math.max(bounds.maxZ, p.z);
      }
    }
    swamps.push({
      id: k === 1 ? "elderfen" : "southern-reedfen",
      index: k,
      name: NAMES[k - 1] || NAMES[0],
      level: L,
      x: cx,
      z: cz,
      seed: { x: c.x, z: c.z },
      radiusX,
      radiusZ,
      yaw,
      area: nodes.length * cell * cell,
      spread: +made.spread.toFixed(2),
      step: +Math.max(0, made.step).toFixed(2),
      pass: S.passes.indexOf(P),
      relaxed: !!c.relaxed,
      polygon: polygon ? polygon.map((p) => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) })) : null,
      bounds
    });
  };
  const place2 = (filter, P) => {
    const tried = [];
    let count = 0;
    for (const c of candidates) {
      if (count >= S.tries) break;
      if (!filter(c) || tried.some((t) => dhypot(t.x - c.x, t.z - c.z) < S.spacing)) continue;
      tried.push(c);
      count++;
      const made = tryMarsh(c, P);
      if (made) {
        accept(c, made, P);
        return true;
      }
    }
    return false;
  };
  for (const P of S.passes) if (place2(() => true, P)) break;
  if (swamps.length === 1 && rng.chance(S.secondChance)) {
    const first = swamps[0], best = candidates[0]?.score ?? 0, far = (c) => !c.relaxed && c.score >= best * S.secondScore && dhypot(c.x - first.x, c.z - first.z) >= S.second;
    for (const P of S.passes.slice(0, 2)) if (place2(far, P)) break;
  }
  return { swamps, swampIndex, swampDistance, version: S.version, rejections: why };
}

// worldgen/world-data.js
var WORLD_DATA_VERSION = WORLDGEN_VERSION + ":data-5:" + SKY_VIEW.version + ":" + SWAMP.version;
var RIVER_ARRAYS = ["x", "z", "s", "level", "width", "depth", "bank", "floor", "area", "curvature"];
function generateWorldData(seed, { onProgress = null } = {}) {
  seed >>>= 0;
  const started = performance.now();
  const model = generateMacroTerrain(seed, { onProgress: onProgress ? (p) => onProgress({ stage: "erosion", value: p }) : null });
  onProgress?.({ stage: "rivers", value: 0 });
  const hydro = buildHydroNetwork(model);
  const shaped = shapeRivers(model, hydro);
  const marsh = planSwamps(model, shaped, hydro.lakeId);
  onProgress?.({ stage: "rivers", value: 1 });
  const rivers = shaped.map((r) => {
    const out = {
      id: r.id,
      parent: r.parent,
      terminal: { ...r.terminal },
      source: { ...r.source },
      length: r.length,
      falls: r.falls.map((f) => ({ k: f.k, top: f.top, bottom: f.bottom, drop: f.drop })),
      step: r.step
    };
    for (const key of RIVER_ARRAYS) out[key] = r[key];
    return out;
  });
  const lakes = hydro.lakes.map((l) => ({
    id: l.id,
    kind: l.kind,
    level: l.level,
    sill: l.sill,
    outletNode: l.outletNode,
    outlet: l.outlet ? { x: l.outlet.x, z: l.outlet.z } : null,
    nodes: Int32Array.from(l.nodes),
    area: l.area,
    closed: !!l.closed
  }));
  const skyView = computeSkyView(model.grid, model.height);
  const n = model.height.length, area = new Float32Array(n), coast = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    area[i] = model.flow.area[i];
    coast[i] = model.coastDistance[i];
  }
  return {
    version: WORLD_DATA_VERSION,
    seed,
    generationMs: Math.round(performance.now() - started),
    layout: JSON.parse(JSON.stringify(model.layout)),
    grid: { ...model.grid },
    height: model.height,
    fixed: model.fixed,
    area,
    coastDistance: coast,
    lakes,
    lakeId: hydro.lakeId,
    rivers,
    // Kinds of shore (island-gen.js shapeCoast): bytes rock, pebble, dune
    // sand, mud; the cliff weight; cliff tops (m); signed distance to the
    // shore (m); sea stacks (x, z, radius, top, seed).
    coastWeights: model.coast.weights,
    coastCliff: model.coast.cliff,
    coastTop: model.coast.top,
    coastShore: model.coast.shore,
    coastStacks: model.coast.stacks,
    coastStats: model.coast.stats,
    // Sky view per node (island-gen.js computeSkyView): bytes, 255 open sky.
    skyView,
    // Marshes (swamps.js): their descriptors and, per node, the nearest marsh
    // (1, 2; 0 none) and the signed distance to its edge (m, positive inside).
    swamps: marsh.swamps,
    swampIndex: marsh.swampIndex,
    swampDistance: marsh.swampDistance
  };
}
function worldDataTransfers(data) {
  const list = [
    data.height.buffer,
    data.fixed.buffer,
    data.area.buffer,
    data.coastDistance.buffer,
    data.lakeId.buffer,
    data.coastWeights.buffer,
    data.coastCliff.buffer,
    data.coastTop.buffer,
    data.coastShore.buffer,
    data.coastStacks.buffer,
    data.skyView.buffer,
    data.swampIndex.buffer,
    data.swampDistance.buffer
  ];
  for (const l of data.lakes) list.push(l.nodes.buffer);
  for (const r of data.rivers) {
    list.push(r.step.buffer);
    for (const key of RIVER_ARRAYS) list.push(r[key].buffer);
  }
  return [...new Set(list)];
}
function validWorldData(data, seed) {
  if (!data || data.version !== WORLD_DATA_VERSION || data.seed !== seed >>> 0) return false;
  const { grid } = data, n = grid?.nx * grid?.nz;
  if (!Number.isInteger(n) || !(data.height instanceof Float64Array) || data.height.length !== n || !(data.fixed instanceof Uint8Array) || data.fixed.length !== n) return false;
  if (!(data.area instanceof Float32Array) || data.area.length !== n || !(data.coastDistance instanceof Float32Array) || data.coastDistance.length !== n) return false;
  if (!(data.lakeId instanceof Int16Array) || data.lakeId.length !== n || !Array.isArray(data.lakes) || !Array.isArray(data.rivers)) return false;
  if (!(data.coastWeights instanceof Uint8Array) || data.coastWeights.length !== n * 4 || !(data.coastCliff instanceof Uint8Array) || data.coastCliff.length !== n) return false;
  if (!(data.coastTop instanceof Float32Array) || data.coastTop.length !== n || !(data.coastShore instanceof Float32Array) || data.coastShore.length !== n) return false;
  if (!(data.coastStacks instanceof Float64Array) || data.coastStacks.length % 5) return false;
  if (!(data.skyView instanceof Uint8Array) || data.skyView.length !== n) return false;
  if (!Array.isArray(data.swamps) || !(data.swampIndex instanceof Uint8Array) || data.swampIndex.length !== n || !(data.swampDistance instanceof Int8Array) || data.swampDistance.length !== n) return false;
  for (const r of data.rivers) {
    const m = r.x?.length;
    if (!(m >= 2) || !(r.step instanceof Uint8Array) || r.step.length !== m) return false;
    for (const key of RIVER_ARRAYS) if (!(r[key] instanceof Float64Array) || r[key].length !== m) return false;
  }
  return true;
}

export {
  datan2,
  dhypot,
  clamp,
  clamp01,
  smoothstep,
  gnoise,
  fbm,
  ridged,
  ISLAND_FRAME,
  START,
  SWAMP,
  WORLD_DATA_VERSION,
  generateWorldData,
  worldDataTransfers,
  validWorldData
};
