// underworld-noise.js
function hashString(text, seed = 2166136261) {
  let n = seed >>> 0;
  for (const c of String(text)) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
  return n >>> 0;
}
function randomSource(seed) {
  let n = seed >>> 0;
  return () => {
    n = n + 1831565813 >>> 0;
    let t = n;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(x, z, seed) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
}
function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// underworld-abyss.js
var ABYSS = Object.freeze({
  revision: "abyss-v110-r1",
  // The caverns' own seed (v105: the sites changed, the caverns did not: the same rock as v102's).
  layout: "abyss-v102-r3",
  cell: 8,
  // Rock round the edge of the world (m).
  margin: 110,
  open: Object.freeze({ warp: 170, warpScale: 1 / 760, scale: 1 / 420, ridgeScale: 1 / 300, share: 0.44, ridgeShare: 0.07 }),
  // Pockets smaller than this (cells) are filled; larger ones are joined by a way `corridor` cells either side.
  minPocket: 60,
  corridor: 2,
  regions: Object.freeze({ spacing: 760, jitter: 0.78, warp: 120 }),
  floor: Object.freeze({ broad: 110, broadScale: 1 / 980, rolling: 26, rollingScale: 1 / 230, talus: 7, talusReach: 9 }),
  sites: Object.freeze({ spacing: 150, clear: 18, radius: [22, 40] }),
  adit: Object.freeze({ length: 30, radius: 2.8, behind: 46, spacing: 260, search: 900 }),
  // v106: rivers - kept `clear` m from the rock (the plan's), springs on a lattice of `spring` m,
  // a fall of at least `minDrop` m to their lake, over no rise of more than `maxRise` m on the way.
  rivers: Object.freeze({
    clear: 11,
    spring: 230,
    minDrop: 3,
    maxRise: 2.5,
    basin: 1.2,
    minCells: 12,
    maxCells: 210,
    max: 40,
    step: 4,
    springs: Object.freeze({ verdant: 0.55, glowcap: 0.5, sapphire: 0.45, abyss: 0.6, stone: 0.3, ruins: 0.3, ember: 0.15 })
  }),
  // v107: the great light wells (the user: the light from the vaults all of a size - now and then a far greater
  // one, the island's own plants under it). One a lattice cell of `spacing` m at most (the most open of a few
  // tries), `radius` m across the opening, `clear` m of open floor beyond it all round, under a vault at least
  // `headroom` m up; kept off the ways in, the sites, the rivers and each other; by region `chance`.
  // v109: the great lake (its hall's radius, the lake's depth; at least `away` m from the main way in, about `ideal`),
  // the bosses' lairs about `lairDistance` m from the main way in.
  greatLake: Object.freeze({
    radius: 135,
    depth: 11,
    away: 900,
    ideal: 1500,
    lairDistance: 1400,
    // v110: its islets (radius m: the heart's, the other's; how far out the other lies, of the lake's radius).
    islets: Object.freeze({ heart: [12, 15], small: [6.5, 8.5], out: 0.3 })
  }),
  wells: Object.freeze({
    spacing: 330,
    tries: 7,
    radius: Object.freeze([11, 17]),
    clear: 9,
    headroom: 26,
    adit: 80,
    site: 12,
    river: 14,
    apart: 400,
    chance: Object.freeze({ verdant: 0.8, glowcap: 0.55, stone: 0.6, ruins: 0.5, sapphire: 0.5, abyss: 0.4, ember: 0.35 })
  })
});
var REGIONS = Object.freeze({
  verdant: Object.freeze({ name: "翠の大洞", en: "VERDANT HOLLOW", lit: true, sites: ["skylight", "falls", "skylight", "lake", "grotto"] }),
  glowcap: Object.freeze({ name: "光茸の森", en: "GLOWCAP FOREST", lit: true, sites: ["mushroom", "mushroom", "lake", "mushroom", "falls"] }),
  sapphire: Object.freeze({ name: "蒼晶の谷", en: "SAPPHIRE VALE", lit: true, sites: ["crystal", "crystal", "karst", "lake"] }),
  ember: Object.freeze({ name: "紅晶の淵", en: "EMBER DEEP", lit: true, sites: ["ember", "ember", "hall"] }),
  abyss: Object.freeze({ name: "深淵の湖", en: "ABYSSAL LAKES", lit: false, sites: ["lake", "lake", "falls", "grotto"] }),
  ruins: Object.freeze({ name: "古の都", en: "SUNKEN CITY", lit: false, sites: ["ruins", "ruins", "hall"] }),
  stone: Object.freeze({ name: "石の大洞", en: "STONE HALLS", lit: false, sites: ["karst", "hall", "grotto", "karst", "falls"] })
});
var REGION_IDS = Object.freeze(Object.keys(REGIONS));
var DEEP = Object.freeze({
  deck: Object.freeze(["ember", "ember", "stone", "abyss", "ruins", "ember", "stone"]),
  names: Object.freeze({
    ember: Object.freeze({ name: "溶岩の河", en: "RIVERS OF FIRE" }),
    stone: Object.freeze({ name: "骨の谷", en: "VALLEY OF BONES" }),
    abyss: Object.freeze({ name: "黒曜の淵", en: "OBSIDIAN DEEP" }),
    ruins: Object.freeze({ name: "奈落の都", en: "CITY OF THE PIT" })
  }),
  sites: Object.freeze({ ember: Object.freeze(["ember", "lake", "ember", "hall"]), stone: Object.freeze(["bones", "hall", "bones", "karst"]), abyss: Object.freeze(["lake", "grotto", "crystal", "bones"]), ruins: Object.freeze(["ruins", "bones", "hall"]) }),
  // (Its lakes are of lava: named so.)
  themes: Object.freeze({ lake: Object.freeze({ name: "溶岩の湖", en: "LAKE OF FIRE" }) }),
  springs: Object.freeze({ ember: 0.95, stone: 0.35, abyss: 0.5, ruins: 0.3 }),
  spring: 105,
  minDrop: 1.5,
  // The open ground carved about each rope's foot (m), the layer's size about the chasms (m beyond them each way).
  landing: 30,
  around: 1e3
});
var CHASMS = Object.freeze({ radius: 6.5, count: 2, near: 650, far: 1900, apart: 500, clear: 26, kinds: Object.freeze(["abyss", "ruins", "stone", "ember"]) });
var BOSS_LAIRS = Object.freeze([["spiderQueen", "ruins", ["hall", "ruins"]], ["emberWyrm", "ember", ["hall", "ember"]], ["batKing", "stone", ["hall", "karst", "grotto"]], ["colossus", "sapphire", ["crystal", "karst"]]]);
var REGION_SHAPE = Object.freeze({
  verdant: Object.freeze({ wall: 16, vault: 62, dome: 95, terrace: 0.15, rough: 0.35 }),
  glowcap: Object.freeze({ wall: 13, vault: 40, dome: 75, terrace: 0.1, rough: 0.45 }),
  sapphire: Object.freeze({ wall: 14, vault: 36, dome: 65, terrace: 0.55, rough: 0.6 }),
  ember: Object.freeze({ wall: 15, vault: 44, dome: 70, terrace: 0.65, rough: 0.75 }),
  abyss: Object.freeze({ wall: 12, vault: 34, dome: 70, terrace: 0.2, rough: 0.4 }),
  ruins: Object.freeze({ wall: 14, vault: 42, dome: 85, terrace: 0.3, rough: 0.35 }),
  stone: Object.freeze({ wall: 13, vault: 38, dome: 65, terrace: 0.45, rough: 0.55 })
});
var THEMES = Object.freeze({
  karst: Object.freeze({ name: "鍾乳洞", en: "LIMESTONE HALL", light: false }),
  lake: Object.freeze({ name: "地底湖", en: "UNDERGROUND LAKE", light: true }),
  falls: Object.freeze({ name: "地底の滝", en: "HIDDEN FALLS", light: true }),
  skylight: Object.freeze({ name: "光の庭", en: "SUNLIT GARDEN", light: true }),
  crystal: Object.freeze({ name: "水晶の間", en: "CRYSTAL HALL", light: true }),
  ember: Object.freeze({ name: "紅晶の間", en: "EMBER HALL", light: true }),
  mushroom: Object.freeze({ name: "光茸の群", en: "GLOWCAP GROVE", light: true }),
  ruins: Object.freeze({ name: "古の回廊", en: "SUNKEN RUINS", light: false }),
  roots: Object.freeze({ name: "根の間", en: "ROOT HALL", light: false }),
  hall: Object.freeze({ name: "大空洞", en: "GREAT HOLLOW", light: false }),
  grotto: Object.freeze({ name: "岩屋", en: "GROTTO", light: false }),
  // v110: the deep layer's (the bones of things far greater than the dragon).
  bones: Object.freeze({ name: "巨骨の墓場", en: "GRAVEYARD OF GIANTS", light: false })
});
var THEME_IDS = Object.freeze(Object.keys(THEMES));
var TAU = Math.PI * 2;
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var mix = (a, b, t) => a + (b - a) * t;
var smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function fbm(x, z, seed, octaves = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let o = 0; o < octaves; o++) {
    s += a * valueNoise(x * f, z * f, seed + Math.imul(o + 1, 2654435761) >>> 0);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
function quantile(values, q) {
  const a = Float32Array.from(values).sort();
  return a[clamp(Math.floor(q * (a.length - 1)), 0, a.length - 1)];
}
function distanceTransform(nx, nz, feature) {
  const INF = 1e12, f = new Float64Array(Math.max(nx, nz)), d = new Float64Array(Math.max(nx, nz)), v = new Int32Array(Math.max(nx, nz)), zz = new Float64Array(Math.max(nx, nz) + 1);
  const grid = new Float64Array(nx * nz);
  for (let i = 0; i < nx * nz; i++) grid[i] = feature[i] ? 0 : INF;
  const pass = (n, get, set) => {
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0;
    v[0] = 0;
    zz[0] = -Infinity;
    zz[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= zz[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      zz[k] = s;
      zz[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (zz[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
    for (let q = 0; q < n; q++) set(q, d[q]);
  };
  for (let j = 0; j < nz; j++) pass(nx, (i) => grid[j * nx + i], (i, val) => {
    grid[j * nx + i] = val;
  });
  for (let i = 0; i < nx; i++) pass(nz, (j) => grid[j * nx + i], (j, val) => {
    grid[j * nx + i] = val;
  });
  return grid;
}
function generateAbyss({ seed, planSeed, bounds, entrances = [], layer = "upper", ropes = [] }) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const deep = layer === "deep";
  const A = ABYSS, G = A.cell, s0 = hashString(A.layout + (deep ? ":deep:" : ":") + seed, planSeed >>> 0);
  const S = (k) => (s0 ^ Math.imul(k + 1, 625341585)) >>> 0;
  const x0 = Math.floor(bounds.minX / G) * G, z0 = Math.floor(bounds.minZ / G) * G;
  const nx = Math.ceil((bounds.maxX - x0) / G) + 1, nz = Math.ceil((bounds.maxZ - z0) / G) + 1, N = nx * nz;
  const cx = (i) => x0 + i * G, cz = (j) => z0 + j * G;
  const R = A.regions, regions = [], rng = randomSource(S(9));
  const rx0 = bounds.minX - R.spacing * 0.5, rz0 = bounds.minZ - R.spacing * 0.5;
  const rnx = Math.ceil((bounds.maxX + R.spacing - rx0) / R.spacing), rnz = Math.ceil((bounds.maxZ + R.spacing - rz0) / R.spacing);
  for (let j = 0; j < rnz; j++) for (let i = 0; i < rnx; i++) {
    regions.push({ id: regions.length, x: rx0 + i * R.spacing + (rng() - 0.5) * R.spacing * R.jitter, z: rz0 + j * R.spacing + (rng() - 0.5) * R.spacing * R.jitter, kind: null });
  }
  const regionGridMeta = { x0: rx0, z0: rz0, spacing: R.spacing, nx: rnx, nz: rnz };
  const deck = [], kindsFor = deep ? DEEP.deck : REGION_IDS;
  for (let k = 0; k < regions.length; k++) deck.push(kindsFor[k % kindsFor.length]);
  for (let k = deck.length - 1; k > 0; k--) {
    const q = Math.floor(rng() * (k + 1));
    [deck[k], deck[q]] = [deck[q], deck[k]];
  }
  regions.forEach((r, k) => {
    r.kind = deck[k];
  });
  const regionWarp = (x, z) => [x + (fbm(x / 520, z / 520, S(10), 3) - 0.5) * 2 * R.warp, z + (fbm(x / 520 + 9.1, z / 520 - 3.7, S(11), 3) - 0.5) * 2 * R.warp];
  const regionOf = (x, z) => {
    const [wx, wz] = regionWarp(x, z), ci = Math.round((wx - rx0) / R.spacing), cj = Math.round((wz - rz0) / R.spacing);
    let best = 0, bd = Infinity;
    for (let j = Math.max(0, cj - 2); j <= Math.min(rnz - 1, cj + 2); j++) for (let i = Math.max(0, ci - 2); i <= Math.min(rnx - 1, ci + 2); i++) {
      const r = regions[j * rnx + i], d = (r.x - wx) ** 2 + (r.z - wz) ** 2;
      if (d < bd) {
        bd = d;
        best = r.id;
      }
    }
    return best;
  };
  const regionGrid = new Uint8Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) regionGrid[j * nx + i] = regionOf(cx(i), cz(j));
  const O = A.open, base = new Float32Array(N), ridge = new Float32Array(N), edge = new Float32Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = cx(i), z = cz(j), k = j * nx + i;
    const wx = x + (fbm(x * O.warpScale, z * O.warpScale, S(1), 3) - 0.5) * 2 * O.warp, wz = z + (fbm(x * O.warpScale + 37.1, z * O.warpScale - 11.3, S(2), 3) - 0.5) * 2 * O.warp;
    base[k] = fbm(wx * O.scale, wz * O.scale, S(3), 4);
    ridge[k] = 1 - Math.abs(2 * fbm(wx * O.ridgeScale + 5.7, wz * O.ridgeScale - 2.9, S(4), 3) - 1);
    edge[k] = Math.min(x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z);
  }
  const sample = [], rsample = [];
  for (let k = 0; k < N; k += 7) if (edge[k] > A.margin) {
    sample.push(base[k]);
    rsample.push(ridge[k]);
  }
  const tBase = quantile(sample, 1 - O.share), tRidge = quantile(rsample, 1 - O.ridgeShare);
  const open = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    if (edge[k] < A.margin) continue;
    const fade = smooth(A.margin, A.margin * 2.2, edge[k]);
    if (base[k] - (1 - fade) * 0.08 > tBase || ridge[k] - (1 - fade) * 0.2 > tRidge) open[k] = 1;
  }
  const GL = A.greatLake;
  let greatLake = null;
  const ropeCells = [];
  if (deep) for (const rp of ropes) {
    const reach = Math.ceil(DEEP.landing * 1.4 / G), ci = Math.round((rp.x - x0) / G), cj = Math.round((rp.z - z0) / G);
    for (let j = Math.max(2, cj - reach); j <= Math.min(nz - 3, cj + reach); j++) for (let i = Math.max(2, ci - reach); i <= Math.min(nx - 3, ci + reach); i++) {
      const x = cx(i), z = cz(j), a = Math.atan2(z - rp.z, x - rp.x), rag = DEEP.landing * (1 + (fbm(Math.cos(a) * 1.5 + rp.x * 0.01, Math.sin(a) * 1.5, S(61), 3) - 0.5) * 0.5);
      if (Math.hypot(x - rp.x, z - rp.z) < rag) {
        open[j * nx + i] = 1;
        ropeCells.push(j * nx + i);
      }
    }
  }
  if (!deep) {
    const e0 = entrances[0], inside = (x, z, pad) => x > bounds.minX + pad && x < bounds.maxX - pad && z > bounds.minZ + pad && z < bounds.maxZ - pad;
    let best = null, bs = -Infinity;
    for (const r of regions) {
      if (r.kind !== "abyss" || !inside(r.x, r.z, A.margin + GL.radius + 60)) continue;
      const d = e0 ? Math.hypot(r.x - e0.x, r.z - e0.z) : 2e3;
      if (d < GL.away) continue;
      const score = -Math.abs(d - GL.ideal);
      if (score > bs) {
        bs = score;
        best = r;
      }
    }
    if (best) {
      greatLake = { x: best.x, z: best.z, radius: GL.radius, region: best.id };
      const reach = Math.ceil(GL.radius * 1.3 / G), ci = Math.round((best.x - x0) / G), cj = Math.round((best.z - z0) / G);
      for (let j = Math.max(2, cj - reach); j <= Math.min(nz - 3, cj + reach); j++) for (let i = Math.max(2, ci - reach); i <= Math.min(nx - 3, ci + reach); i++) {
        const x = cx(i), z = cz(j), a = Math.atan2(z - best.z, x - best.x), rag = GL.radius * (1 + (fbm(Math.cos(a) * 1.7 + 3, Math.sin(a) * 1.7 - 2, S(60), 3) - 0.5) * 0.5);
        if (Math.hypot(x - best.x, z - best.z) < rag) open[j * nx + i] = 1;
      }
    }
  }
  const label = new Int32Array(N).fill(-1), sizes = [], queue = new Int32Array(N);
  for (let k = 0; k < N; k++) {
    if (!open[k] || label[k] >= 0) continue;
    const id = sizes.length;
    let head = 0, tail = 0;
    queue[tail++] = k;
    label[k] = id;
    let n = 0;
    while (head < tail) {
      const c = queue[head++];
      n++;
      const i = c % nx, j = (c - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const q = jj * nx + ii;
        if (open[q] && label[q] < 0) {
          label[q] = id;
          queue[tail++] = q;
        }
      }
    }
    sizes.push(n);
  }
  if (!sizes.length) throw new Error("The abyss has no open rock (seed " + seed + ")");
  let main = 0;
  for (let id = 1; id < sizes.length; id++) if (sizes[id] > sizes[main]) main = id;
  const carve = (k, r) => {
    const i = k % nx, j = (k - i) / nx;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (di * di + dj * dj > r * r + r) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 2 || jj < 2 || ii >= nx - 2 || jj >= nz - 2) continue;
      const q = jj * nx + ii;
      if (edge[q] < A.margin * 0.6) continue;
      open[q] = 1;
      label[q] = main;
    }
  };
  let joined = 0, filled = 0;
  const order = sizes.map((n, id) => [n, id]).filter(([, id]) => id !== main).sort((p, q) => q[0] - p[0]);
  const landingPocket = new Set(ropeCells.map((k) => label[k]));
  for (const [n, id] of order) {
    if (n < A.minPocket && !landingPocket.has(id)) {
      for (let k = 0; k < N; k++) if (label[k] === id) {
        open[k] = 0;
        label[k] = -1;
      }
      filled++;
      continue;
    }
    const from = new Int32Array(N).fill(-2);
    let head = 0, tail = 0;
    for (let k = 0; k < N; k++) if (label[k] === id) {
      from[k] = -1;
      queue[tail++] = k;
    }
    let hit = -1;
    while (head < tail && hit < 0) {
      const c = queue[head++], i = c % nx, j = (c - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 1 || jj < 1 || ii >= nx - 1 || jj >= nz - 1) continue;
        const q = jj * nx + ii;
        if (from[q] !== -2) continue;
        from[q] = c;
        if (label[q] === main) {
          hit = q;
          break;
        }
        if (edge[q] > A.margin * 0.6) queue[tail++] = q;
      }
    }
    if (hit < 0) {
      for (let k = 0; k < N; k++) if (label[k] === id) {
        open[k] = 0;
        label[k] = -1;
      }
      filled++;
      continue;
    }
    for (let c = hit; c >= 0; c = from[c]) carve(c, A.corridor);
    for (let k = 0; k < N; k++) if (label[k] === id) label[k] = main;
    joined++;
  }
  const rockD = distanceTransform(nx, nz, Array.from(open, (v) => !v)), openD = distanceTransform(nx, nz, open);
  const sd = new Float32Array(N);
  for (let k = 0; k < N; k++) sd[k] = open[k] ? (Math.sqrt(rockD[k]) - 0.5) * G : -(Math.sqrt(openD[k]) - 0.5) * G;
  const F = A.floor, floor = new Float32Array(N), vault = new Float32Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = cx(i), z = cz(j), k = j * nx + i, shape = REGION_SHAPE[regions[regionGrid[k]].kind];
    floor[k] = (fbm(x * F.broadScale, z * F.broadScale, S(12), 3) - 0.5) * F.broad + (fbm(x * F.rollingScale, z * F.rollingScale, S(13), 3) - 0.5) * F.rolling;
    const open_ = Math.max(0, sd[k]);
    vault[k] = shape.wall + shape.vault * Math.pow(clamp(open_ / shape.dome, 0, 1), 0.62) * (0.75 + 0.5 * fbm(x / 160, z / 160, S(14), 2));
  }
  const blur = (src, passes) => {
    let a = src, b = new Float32Array(N);
    for (let p = 0; p < passes; p++) {
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        let s = 0, n = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = clamp(i + di, 0, nx - 1), jj = clamp(j + dj, 0, nz - 1);
          s += a[jj * nx + ii];
          n++;
        }
        b[j * nx + i] = s / n;
      }
      [a, b] = [b, a];
    }
    return a;
  };
  const vaultSmooth = blur(vault, 3);
  const at = (grid, x, z) => {
    const gx = clamp((x - x0) / G, 0, nx - 1.001), gz = clamp((z - z0) / G, 0, nz - 1.001), i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j, k = j * nx + i;
    return (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + nx] * (1 - u) + grid[k + nx + 1] * u) * v;
  };
  const cellAt = (x, z) => clamp(Math.round((z - z0) / G), 0, nz - 1) * nx + clamp(Math.round((x - x0) / G), 0, nx - 1);
  const D = A.adit, adits = [];
  const gradient = (x, z) => {
    const h = G;
    const gx = at(sd, x + h, z) - at(sd, x - h, z), gz = at(sd, x, z + h) - at(sd, x, z - h), l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  };
  const aditFits = (x, z) => {
    const c = at(sd, x, z);
    if (c < 3 || c > 14) return null;
    const [gx, gz] = gradient(x, z);
    const wx = x - gx * c, wz = z - gz * c;
    for (let d = 4; d <= D.behind; d += 4) if (at(sd, wx - gx * d, wz - gz * d) > -Math.min(d * 0.6, 10)) return null;
    for (const s of [-1, 1]) for (let d = 6; d <= D.length; d += 6) {
      const px = wx - gx * d - gz * s * 7, pz = wz - gz * d + gx * s * 7;
      if (at(sd, px, pz) > -3) return null;
    }
    for (const [d, need] of [[8, 6], [16, 10], [26, 14]]) if (at(sd, wx + gx * d, wz + gz * d) < need) return null;
    return { wx, wz, gx, gz, c };
  };
  const candidates = [];
  for (let j = 2; j < nz - 2; j += 2) for (let i = 2; i < nx - 2; i += 2) {
    const k = j * nx + i;
    if (!open[k] || sd[k] < 3 || sd[k] > 14) continue;
    candidates.push(k);
  }
  for (const e of entrances) {
    let best = null, bd = Infinity;
    for (const k of candidates) {
      const x = cx(k % nx), z = cz(Math.floor(k / nx)), d = Math.hypot(x - e.x, z - e.z);
      if (d > D.search || d >= bd) continue;
      if (adits.some((a) => Math.hypot(a.wx - x, a.wz - z) < D.spacing)) continue;
      const fit = aditFits(x, z);
      if (!fit) continue;
      best = fit;
      bd = d;
    }
    if (!best) for (const k of candidates) {
      const x = cx(k % nx), z = cz(Math.floor(k / nx));
      if (adits.some((a) => Math.hypot(a.wx - x, a.wz - z) < D.spacing * 0.5)) continue;
      const fit = aditFits(x, z);
      if (fit) {
        best = fit;
        break;
      }
    }
    if (!best) throw new Error("No wall for the way in " + e.index + " (seed " + seed + ")");
    const dir = { x: best.gx, z: best.gz }, end = { x: best.wx - best.gx * D.length, z: best.wz - best.gz * D.length };
    adits.push({ index: e.index, name: e.name, wx: best.wx, wz: best.wz, dir, end, mouth: { x: best.wx + best.gx * 4, z: best.wz + best.gz * 4 }, radius: D.radius });
  }
  if (adits.length && !deep) {
    const r = regions[regionGrid[cellAt(adits[0].wx, adits[0].wz)]];
    const other = regions.find((q) => q.kind === "verdant" && q !== r);
    if (other) other.kind = r.kind;
    r.kind = "verdant";
  }
  const P = A.sites, sites = [], srng = randomSource(S(20));
  for (let z = bounds.minZ + A.margin; z < bounds.maxZ - A.margin; z += P.spacing) for (let x = bounds.minX + A.margin; x < bounds.maxX - A.margin; x += P.spacing) {
    const px = x + (srng() - 0.5) * P.spacing * 0.8, pz = z + (srng() - 0.5) * P.spacing * 0.8, c = at(sd, px, pz);
    if (c < P.clear) continue;
    if (adits.some((a) => Math.hypot(a.mouth.x - px, a.mouth.z - pz) < 34)) continue;
    if (greatLake && Math.hypot(px - greatLake.x, pz - greatLake.z) < greatLake.radius + 40) continue;
    if (deep && ropes.some((rp) => Math.hypot(rp.x - px, rp.z - pz) < DEEP.landing + 24)) continue;
    const region = regions[regionGrid[cellAt(px, pz)]], list = deep ? DEEP.sites[region.kind] || DEEP.sites.stone : REGIONS[region.kind].sites, theme = list[Math.floor(srng() * list.length) % list.length];
    const r = clamp(c * 0.8, P.radius[0], P.radius[1]) * (0.85 + srng() * 0.3);
    sites.push({ id: sites.length, theme, x: px, z: pz, r, region: region.id, kind: region.kind, seed: hashString("site:" + sites.length, s0) });
  }
  const bosses = [];
  if (greatLake) {
    const id = sites.length, gl = greatLake;
    sites.push({ id, theme: "lake", x: gl.x, z: gl.z, r: gl.radius * 0.97, region: gl.region, kind: "abyss", seed: hashString("site:" + id, s0), great: true, boss: "serpent" });
    bosses.push({ kind: "serpent", site: id, x: gl.x, z: gl.z, arena: gl.radius });
  }
  if (!deep) {
    const e0 = adits[0]?.mouth || entrances[0] || { x: 0, z: 0 };
    for (const [kind, region, themes] of BOSS_LAIRS) {
      let best = null, bs = -Infinity;
      for (const site of sites) {
        if (site.kind !== region || !themes.includes(site.theme) || site.boss) continue;
        const c = at(sd, site.x, site.z), d = Math.hypot(site.x - e0.x, site.z - e0.z), roof = at(vaultSmooth, site.x, site.z);
        if (c < 26 || d < 500 || roof < 22) continue;
        const score = Math.min(c, 70) - Math.abs(d - GL.lairDistance) * 0.012;
        if (score > bs) {
          bs = score;
          best = site;
        }
      }
      if (!best) for (const site of sites) {
        if (site.kind !== region || site.theme === "lake" || site.boss) continue;
        const c = at(sd, site.x, site.z);
        if (c >= 26 && (!best || c > at(sd, best.x, best.z))) best = site;
      }
      if (!best) continue;
      best.boss = kind;
      best.r = Math.max(best.r, Math.min(46, at(sd, best.x, best.z) * 0.8));
      bosses.push({ kind, site: best.id, x: best.x, z: best.z, arena: clamp(at(sd, best.x, best.z) * 0.9, 26, 60) });
    }
  }
  for (const site of sites) {
    const r = randomSource(site.seed ^ 16962);
    if (site.theme === "lake" && site.great) {
      site.water = { depth: A.greatLake.depth, extent: 0.9, glow: true };
      const a = r() * TAU;
      site.cascade = { x: site.x + Math.cos(a) * site.r * 0.55, z: site.z + Math.sin(a) * site.r * 0.55, width: 7 + r() * 3 };
      const GI = A.greatLake.islets, isl = [{ x: site.x + (r() - 0.5) * 6, z: site.z + (r() - 0.5) * 6, r: GI.heart[0] + r() * (GI.heart[1] - GI.heart[0]), heart: true }];
      for (let k = 0; k < 24 && isl.length < 2; k++) {
        const b = r() * TAU, d = site.r * GI.out, x = site.x + Math.cos(b) * d, z = site.z + Math.sin(b) * d;
        if (Math.hypot(x - site.cascade.x, z - site.cascade.z) < 34) continue;
        isl.push({ x, z, r: GI.small[0] + r() * (GI.small[1] - GI.small[0]) });
      }
      site.water.islets = isl;
    } else if (site.theme === "lake") {
      site.water = { depth: 3.2 + r() * 2.8, extent: 0.78 + r() * 0.14, glow: site.kind === "abyss" || site.kind === "glowcap" || site.kind === "sapphire" };
      if (r() < 0.5) {
        const a = r() * TAU, d = site.r * (0.15 + r() * 0.3);
        site.cascade = { x: site.x + Math.cos(a) * d, z: site.z + Math.sin(a) * d, width: 3 + r() * 4 };
      }
    } else if (site.theme === "falls") {
      const [gx, gz] = gradient(site.x, site.z), c = at(sd, site.x, site.z), a = Math.atan2(-gz, -gx);
      const depth = 2.6 + r() * 1.4, width = 2.6 + r() * 3.2;
      if (0.55 * (c - 0.6) > site.r * 0.85) {
        site.water = { depth, extent: 0.5, pool: { x: site.x, z: site.z, r: site.r * 0.45 } };
        site.cascade = { x: site.x + (r() - 0.5) * site.r * 0.2, z: site.z + (r() - 0.5) * site.r * 0.2, width: width + 1 };
      } else {
        const wx = site.x - gx * (c - 0.6), wz = site.z - gz * (c - 0.6);
        site.water = { depth, extent: 0.5, pool: { x: mix(site.x, wx, 0.55), z: mix(site.z, wz, 0.55), r: Math.min(site.r * 0.55, c * 0.45) } };
        site.falls = { x: wx, z: wz, angle: a, drop: clamp(at(vaultSmooth, wx, wz) - 4, 6, 16 + r() * 18), width };
      }
    } else if (site.theme === "skylight" && r() < 0.55) {
      const a = r() * TAU;
      site.water = { depth: 1.6, extent: 0.5, pool: { x: site.x + Math.cos(a) * site.r * 0.4, z: site.z + Math.sin(a) * site.r * 0.4, r: site.r * 0.28 } };
    }
    if (site.theme === "skylight") {
      const a = r() * TAU, d = site.r * 0.15 * r();
      site.shaft = { x: site.x + Math.cos(a) * d, z: site.z + Math.sin(a) * d, radius: 5 + r() * 3 };
    }
  }
  const rivers = planRivers();
  const wells = deep ? [] : planWells();
  const chasms = deep ? [] : planChasms();
  function planChasms() {
    const C = CHASMS, cr = randomSource(S(70)), e0 = adits[0]?.mouth || entrances[0] || { x: 0, z: 0 }, out = [], tries = [];
    const riverNear = (x, z, d) => {
      for (const r of rivers) {
        const P2 = r.points;
        for (let k = 0; k < P2.length; k += 2) {
          const dx = P2[k] - x, dz = P2[k + 1] - z;
          if (dx * dx + dz * dz < (d + r.width[1]) ** 2) return true;
        }
      }
      return false;
    };
    for (let j = 4; j < nz - 4; j += 3) for (let i = 4; i < nx - 4; i += 3) {
      const k = j * nx + i, x = cx(i) + (cr() - 0.5) * G * 2, z = cz(j) + (cr() - 0.5) * G * 2, c = at(sd, x, z);
      if (c < C.clear || !C.kinds.includes(regions[regionGrid[cellAt(x, z)]].kind)) continue;
      const d = Math.hypot(x - e0.x, z - e0.z);
      if (d < C.near || d > C.far) continue;
      tries.push({ x, z, c, score: Math.min(c, 45) + cr() * 20 });
    }
    tries.sort((p, q) => q.score - p.score);
    for (const t of tries) {
      if (out.length >= C.count) break;
      if (out.some((o) => Math.hypot(o.x - t.x, o.z - t.z) < C.apart)) continue;
      if (sites.some((s2) => Math.hypot(s2.x - t.x, s2.z - t.z) < s2.r + 28) || wells.some((w) => Math.hypot(w.x - t.x, w.z - t.z) < w.radius + 40) || riverNear(t.x, t.z, 18)) continue;
      if (greatLake && Math.hypot(t.x - greatLake.x, t.z - greatLake.z) < greatLake.radius + 60) continue;
      out.push({ index: out.length, x: t.x, z: t.z, r: C.radius, seed: hashString("chasm:" + out.length, s0) });
    }
    return out;
  }
  function planWells() {
    const W = A.wells, wr = randomSource(S(40)), out = [];
    const riverNear = (x, z, d) => {
      for (const r of rivers) {
        const P2 = r.points;
        for (let k = 0; k < P2.length; k += 2) {
          const dx = P2[k] - x, dz = P2[k + 1] - z;
          if (dx * dx + dz * dz < (d + r.width[1]) ** 2) return true;
        }
      }
      return false;
    };
    for (let z = bounds.minZ + A.margin; z < bounds.maxZ - A.margin; z += W.spacing) for (let x = bounds.minX + A.margin; x < bounds.maxX - A.margin; x += W.spacing) {
      let best = null;
      for (let t = 0; t < W.tries; t++) {
        const px = x + (wr() - 0.5) * W.spacing * 0.8, pz = z + (wr() - 0.5) * W.spacing * 0.8, c = at(sd, px, pz);
        if (!best || c > best.c) best = { x: px, z: pz, c };
      }
      const radius = W.radius[0] + wr() * (W.radius[1] - W.radius[0]), roll = wr();
      if (best.c < radius + W.clear) continue;
      const kind = regions[regionGrid[cellAt(best.x, best.z)]].kind;
      if (roll > (W.chance[kind] ?? 0.4) || at(vaultSmooth, best.x, best.z) < W.headroom) continue;
      if (adits.some((a) => Math.hypot(a.mouth.x - best.x, a.mouth.z - best.z) < W.adit)) continue;
      if (sites.some((s) => Math.hypot(s.x - best.x, s.z - best.z) < s.r + radius + W.site)) continue;
      if (out.some((o) => Math.hypot(o.x - best.x, o.z - best.z) < W.apart) || riverNear(best.x, best.z, radius + W.river)) continue;
      out.push({ id: out.length, x: best.x, z: best.z, radius, kind, seed: hashString("well:" + out.length, s0) });
    }
    return out;
  }
  function planRivers() {
    const RV = A.rivers, rr = randomSource(S(30));
    const landing = new Uint8Array(N);
    if (deep) for (const rp of ropes) {
      const R2 = Math.ceil((DEEP.landing + 14) / G), ci = Math.round((rp.x - x0) / G), cj = Math.round((rp.z - z0) / G);
      for (let j = Math.max(0, cj - R2); j <= Math.min(nz - 1, cj + R2); j++) for (let i = Math.max(0, ci - R2); i <= Math.min(nx - 1, ci + R2); i++) if (Math.hypot(i - ci, j - cj) * G < DEEP.landing + 14) landing[j * nx + i] = 1;
    }
    const pass = (k) => open[k] === 1 && sd[k] >= RV.clear && !landing[k];
    const level = new Float32Array(N).fill(Infinity), pri = new Float32Array(N).fill(Infinity), parent = new Int32Array(N).fill(-1), lakeOf = new Int32Array(N).fill(-1);
    const heap2 = [];
    const push = (k) => {
      heap2.push(k);
      let n = heap2.length - 1;
      while (n > 0) {
        const p = n - 1 >> 1;
        if (pri[heap2[p]] <= pri[heap2[n]]) break;
        [heap2[p], heap2[n]] = [heap2[n], heap2[p]];
        n = p;
      }
    };
    const pop = () => {
      const top = heap2[0], last = heap2.pop();
      if (heap2.length) {
        heap2[0] = last;
        let n = 0;
        for (; ; ) {
          const l = 2 * n + 1, r = l + 1;
          let m = n;
          if (l < heap2.length && pri[heap2[l]] < pri[heap2[m]]) m = l;
          if (r < heap2.length && pri[heap2[r]] < pri[heap2[m]]) m = r;
          if (m === n) break;
          [heap2[m], heap2[n]] = [heap2[n], heap2[m]];
          n = m;
        }
      }
      return top;
    };
    const steps = new Float32Array(N);
    for (const s of sites) {
      if (s.theme !== "lake") continue;
      const reach = s.r * 0.5, i0 = Math.round((s.x - x0) / G), j0 = Math.round((s.z - z0) / G), R2 = Math.ceil(reach / G), lake = at(floor, s.x, s.z);
      for (let dj = -R2; dj <= R2; dj++) for (let di = -R2; di <= R2; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 1 || j < 1 || i >= nx - 1 || j >= nz - 1 || Math.hypot(di, dj) * G > reach) continue;
        const k = j * nx + i;
        if (!open[k]) continue;
        level[k] = lake;
        pri[k] = lake;
        parent[k] = -2;
        lakeOf[k] = s.id;
        push(k);
      }
    }
    const done = new Uint8Array(N);
    while (heap2.length) {
      const k = pop();
      if (done[k]) continue;
      done[k] = 1;
      const i = k % nx, j = (k - i) / nx;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 1 || jj < 1 || ii >= nx - 1 || jj >= nz - 1) continue;
        const q = jj * nx + ii;
        if (done[q] || !pass(q)) continue;
        const lv = Math.max(floor[q], level[k]), st = steps[k] + (di && dj ? 1.414 : 1), p = lv + st * 0.02;
        if (p < pri[q]) {
          level[q] = lv;
          pri[q] = p;
          steps[q] = st;
          parent[q] = k;
          lakeOf[q] = lakeOf[k];
          push(q);
        }
      }
    }
    const sources = [];
    for (const s of sites) if (s.theme === "falls" && s.water?.pool) sources.push({ kind: "falls", site: s.id, x: s.water.pool.x, z: s.water.pool.z });
    const SP = deep ? DEEP.spring : RV.spring;
    for (let z = bounds.minZ + A.margin; z < bounds.maxZ - A.margin; z += SP) for (let x = bounds.minX + A.margin; x < bounds.maxX - A.margin; x += SP) {
      const px = x + (rr() - 0.5) * SP * 0.8, pz = z + (rr() - 0.5) * SP * 0.8, r1 = rr(), k = cellAt(px, pz);
      if (!pass(k) || sd[k] < RV.clear + 6 || r1 > ((deep ? DEEP.springs : RV.springs)[regions[regionGrid[k]].kind] ?? 0)) continue;
      if (deep && ropes.some((rp) => Math.hypot(rp.x - px, rp.z - pz) < DEEP.landing + 20)) continue;
      if (sites.some((s) => Math.hypot(s.x - px, s.z - pz) < s.r + 12)) continue;
      sources.push({ kind: "spring", site: -1, x: px, z: pz });
    }
    const ways = [];
    for (const src of sources) {
      const k0 = cellAt(src.x, src.z);
      if (lakeOf[k0] < 0 || level[k0] - floor[k0] > RV.maxRise) continue;
      const cells = [];
      for (let k = k0; k >= 0 && cells.length <= RV.maxCells; k = parent[k]) cells.push(k);
      if (cells.length > RV.maxCells) continue;
      let end = "lake";
      for (let m = 1; m < cells.length; m++) if (level[cells[m]] - floor[cells[m]] > RV.basin) {
        cells.length = m;
        end = "pool";
        break;
      }
      if (cells.length < RV.minCells || floor[k0] - floor[cells[cells.length - 1]] < (deep ? DEEP.minDrop : RV.minDrop)) continue;
      ways.push({ src, cells, lake: end === "lake" ? lakeOf[k0] : -1, end });
    }
    ways.sort((a, b) => b.cells.length - a.cells.length);
    const claimed = new Int32Array(N).fill(-1), near = new Int32Array(N).fill(-1), out = [];
    for (const w of ways) {
      if (out.length >= RV.max) break;
      const id = out.length, own = [];
      let join = -1, joinCell = -1;
      for (const k of w.cells) {
        if (claimed[k] >= 0) {
          join = claimed[k];
          joinCell = k;
          break;
        }
        if (near[k] >= 0) {
          join = near[k];
          const i = k % nx, j = (k - i) / nx;
          let best = -1, bd = Infinity;
          for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
            const q = (j + dj) * nx + i + di;
            if (claimed[q] === join && di * di + dj * dj < bd) {
              bd = di * di + dj * dj;
              best = q;
            }
          }
          own.push(k);
          joinCell = best;
          break;
        }
        own.push(k);
      }
      if (own.length < RV.minCells) continue;
      for (const k of own) {
        claimed[k] = id;
        const i = k % nx, j = (k - i) / nx;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const q = (j + dj) * nx + i + di;
          if (q >= 0 && q < N && near[q] < 0) near[q] = id;
        }
      }
      let pts = own.map((k) => [cx(k % nx), cz((k - k % nx) / nx)]);
      if (w.src.kind === "falls") pts[0] = [w.src.x, w.src.z];
      if (joinCell >= 0) pts.push([cx(joinCell % nx), cz((joinCell - joinCell % nx) / nx)]);
      for (let it = 0; it < 3; it++) {
        const sm = [pts[0]];
        for (let n = 0; n < pts.length - 1; n++) {
          const [ax, az] = pts[n], [bx, bz] = pts[n + 1];
          sm.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
        }
        sm.push(pts[pts.length - 1]);
        pts = sm;
      }
      const course = [], seedW = S(40 + id);
      let along = 0, carry = 0;
      course.push(pts[0][0], pts[0][1]);
      for (let n = 1; n < pts.length; n++) {
        const [ax, az] = pts[n - 1], [bx, bz] = pts[n], len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-6) continue;
        let t = RV.step - carry;
        for (; t <= len; t += RV.step) {
          course.push(ax + (bx - ax) * t / len, az + (bz - az) * t / len);
        }
        carry = len - (t - RV.step);
        along += len;
      }
      {
        const lx = pts[pts.length - 1][0], lz = pts[pts.length - 1][1], m = course.length;
        if (Math.hypot(course[m - 2] - lx, course[m - 1] - lz) > 0.5) course.push(lx, lz);
      }
      const n2 = course.length / 2, bent = course.slice();
      for (let n = 1; n < n2 - 1; n++) {
        const tx = course[n * 2 + 2] - course[n * 2 - 2], tz = course[n * 2 + 3] - course[n * 2 - 1], l = Math.hypot(tx, tz) || 1, px = -tz / l, pz = tx / l;
        const ends = smooth(0, 6, n) * smooth(0, 6, n2 - 1 - n), off = (fbm(n * RV.step / 70, id * 3.1, seedW, 2) - 0.5) * 2 * 6 * ends;
        let o = off;
        for (let k = 0; k < 4; k++) {
          if (at(sd, course[n * 2] + px * o, course[n * 2 + 1] + pz * o) >= RV.clear - 3) break;
          o *= 0.5;
        }
        bent[n * 2] = course[n * 2] + px * o;
        bent[n * 2 + 1] = course[n * 2 + 1] + pz * o;
      }
      const wide = w.src.kind === "falls" ? 4.2 + rr() * 1.6 : 3 + rr() * 1.6, last = own[own.length - 1], end = join >= 0 ? "join" : w.end;
      out.push({
        id,
        kind: w.src.kind,
        site: w.src.site,
        lake: end === "lake" ? w.lake : -1,
        join,
        end,
        points: Float32Array.from(bent),
        width: [wide, wide * (1.45 + rr() * 0.4)],
        depth: 1 + rr() * 0.7,
        region: regions[regionGrid[last]].kind,
        pool: end === "pool" ? { r: wide * 2.2 + 4 + rr() * 5, depth: 1.8 + rr() * 1.2 } : null
      });
    }
    return out;
  }
  const counts = {};
  for (const s of sites) counts[s.theme] = (counts[s.theme] || 0) + 1;
  const kinds = {};
  for (const r of regions) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  let openCells = 0;
  for (let k = 0; k < N; k++) openCells += open[k];
  return {
    revision: A.revision,
    layout: A.layout,
    seed,
    planSeed: s0,
    bounds: { ...bounds },
    grid: { x0, z0, cell: G, nx, nz, sd, floor, vault: vaultSmooth, region: regionGrid },
    regions,
    regionGrid: regionGridMeta,
    sites,
    adits,
    rivers,
    wells,
    bosses,
    greatLake,
    layer: deep ? "deep" : "upper",
    chasms,
    ropes: deep ? ropes.map((r) => ({ ...r })) : [],
    stats: {
      cells: N,
      openShare: +(openCells / N).toFixed(3),
      openKm2: +(openCells * G * G / 1e6).toFixed(2),
      joined,
      filled,
      regions: kinds,
      sites: counts,
      adits: adits.length,
      rivers: rivers.length,
      wells: wells.length,
      riverKm: +(rivers.reduce((t, r) => t + (r.points.length / 2 - 1) * A.rivers.step, 0) / 1e3).toFixed(1),
      chasms: chasms.length,
      milliseconds: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - started)
    }
  };
}

// rock-mesh.js
var CORNERS = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
var TETRA = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
var TET_EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
function growable(Type, size = 4096) {
  let data = new Type(size), length = 0;
  return {
    push(...values) {
      if (length + values.length > data.length) {
        const next = new Type(Math.max(data.length * 2, length + values.length));
        next.set(data);
        data = next;
      }
      for (const v of values) data[length++] = v;
    },
    get length() {
      return length;
    },
    get data() {
      return data;
    },
    view() {
      return data.subarray(0, length);
    }
  };
}
function* meshFieldStages(field, { min, cell, dims, refine = 6 }) {
  const [nx, ny, nz] = dims, px = nx + 1, py = ny + 1, pz = nz + 1, N = px * py * pz;
  const values = new Float32Array(N);
  for (let z = 0; z < pz; z++) {
    for (let y = 0; y < py; y++) for (let x = 0; x < px; x++) {
      const v = field(min[0] + x * cell, min[1] + y * cell, min[2] + z * cell);
      values[(z * py + y) * px + x] = v;
      if (v <= 0 && (!x || !y || !z || x === nx || y === ny || z === nz)) throw new Error("Rock field touched mesh domain boundary");
    }
    yield { phase: "field", slice: z };
  }
  const positions = growable(Float64Array), indices = growable(Uint32Array), cache = /* @__PURE__ */ new Map(), weld = /* @__PURE__ */ new Map();
  const at = (i, out) => {
    const x = i % px, y = Math.floor(i / px) % py, z = Math.floor(i / (px * py));
    out[0] = min[0] + x * cell;
    out[1] = min[1] + y * cell;
    out[2] = min[2] + z * cell;
    return out;
  };
  const A = [0, 0, 0], B = [0, 0, 0], P = [0, 0, 0];
  function crossing(ia, ib) {
    const key = ia < ib ? ia * N + ib : ib * N + ia;
    let index = cache.get(key);
    if (index !== void 0) return index;
    let inside = ia, outside = ib;
    if (values[ia] >= 0) {
      inside = ib;
      outside = ia;
    }
    at(inside, A);
    at(outside, B);
    let fa = values[inside], fb = values[outside];
    for (let j = 0; j < refine; j++) {
      P[0] = (A[0] + B[0]) * 0.5;
      P[1] = (A[1] + B[1]) * 0.5;
      P[2] = (A[2] + B[2]) * 0.5;
      const f = field(P[0], P[1], P[2]);
      if (f < 0) {
        A[0] = P[0];
        A[1] = P[1];
        A[2] = P[2];
        fa = f;
      } else {
        B[0] = P[0];
        B[1] = P[1];
        B[2] = P[2];
        fb = f;
      }
    }
    if (values[outside] === 0) {
      index = weld.get(outside);
      if (index !== void 0) {
        cache.set(key, index);
        return index;
      }
    }
    const t = Math.min(1, Math.max(0, fa / (fa - fb))), x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t, z = A[2] + (B[2] - A[2]) * t;
    index = positions.length / 3;
    positions.push(x, y, z);
    if (values[outside] === 0) weld.set(outside, index);
    cache.set(key, index);
    return index;
  }
  const p = positions;
  function triangle(a, b, c, ox, oy, oz) {
    if (a === b || b === c || a === c) return;
    const d = p.data, ax = d[a * 3], ay = d[a * 3 + 1], az = d[a * 3 + 2];
    const ux = d[b * 3] - ax, uy = d[b * 3 + 1] - ay, uz = d[b * 3 + 2] - az, vx = d[c * 3] - ax, vy = d[c * 3 + 1] - ay, vz = d[c * 3 + 2] - az;
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx === 0 && cy === 0 && cz === 0) return;
    if (cx * ox + cy * oy + cz * oz >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  }
  const cube = new Int32Array(8), ids = new Int32Array(4), inner = [0, 0, 0], outer = [0, 0, 0];
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      let any = 0, all = 0;
      for (let k = 0; k < 8; k++) {
        const c = CORNERS[k], i = ((z + c[2]) * py + y + c[1]) * px + x + c[0];
        cube[k] = i;
        if (values[i] < 0) any++;
      }
      all = any;
      if (any === 0 || all === 8) continue;
      for (const tet of TETRA) {
        let inside = 0;
        for (let k = 0; k < 4; k++) {
          ids[k] = cube[tet[k]];
          if (values[ids[k]] < 0) inside++;
        }
        if (inside === 0 || inside === 4) continue;
        inner[0] = inner[1] = inner[2] = outer[0] = outer[1] = outer[2] = 0;
        for (let k = 0; k < 4; k++) {
          at(ids[k], P);
          const o = values[ids[k]] < 0 ? inner : outer;
          o[0] += P[0];
          o[1] += P[1];
          o[2] += P[2];
        }
        const ox = outer[0] / (4 - inside) - inner[0] / inside, oy = outer[1] / (4 - inside) - inner[1] / inside, oz = outer[2] / (4 - inside) - inner[2] / inside;
        if (inside === 1 || inside === 3) {
          const poly = [];
          for (const [a, b] of TET_EDGES) if (values[ids[a]] < 0 !== values[ids[b]] < 0) poly.push(crossing(ids[a], ids[b]));
          triangle(poly[0], poly[1], poly[2], ox, oy, oz);
        } else {
          const ins = [], outs = [];
          for (let k = 0; k < 4; k++) (values[ids[k]] < 0 ? ins : outs).push(ids[k]);
          const q = [crossing(ins[0], outs[0]), crossing(ins[0], outs[1]), crossing(ins[1], outs[1]), crossing(ins[1], outs[0])];
          const d = p.data, dist = (i, j) => (d[i * 3] - d[j * 3]) ** 2 + (d[i * 3 + 1] - d[j * 3 + 1]) ** 2 + (d[i * 3 + 2] - d[j * 3 + 2]) ** 2;
          if (dist(q[0], q[2]) <= dist(q[1], q[3])) {
            triangle(q[0], q[1], q[2], ox, oy, oz);
            triangle(q[0], q[2], q[3], ox, oy, oz);
          } else {
            triangle(q[0], q[1], q[3], ox, oy, oz);
            triangle(q[1], q[2], q[3], ox, oy, oz);
          }
        }
      }
    }
    yield { phase: "mesh", slice: z };
  }
  return { positions: Float64Array.from(positions.view()), indices: Uint32Array.from(indices.view()) };
}
function* sharpenStages(field, mesh, { cell, reach = 0.6, rounds = 1 }) {
  const P = mesh.positions, I = mesh.indices, V = P.length / 3, h = cell * 0.05;
  const ring = Array.from({ length: V }, () => []);
  for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = I[i + k], b = I[i + (k + 1) % 3];
    ring[a].push(b);
  }
  const N = new Float64Array(V * 3), next = new Float64Array(V * 3), faceN = new Float64Array(I.length);
  const faceNormal = (pos, t, out, o) => {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    out[o] = uy * vz - uz * vy;
    out[o + 1] = uz * vx - ux * vz;
    out[o + 2] = ux * vy - uy * vx;
  };
  for (let round = 0; round < rounds; round++) {
    for (let v = 0; v < V; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const a = field(x + h, y - h, z - h), b = field(x - h, y - h, z + h), c = field(x - h, y + h, z - h), d = field(x + h, y + h, z + h);
      let nx = a - b - c + d, ny = -a - b + c + d, nz = -a + b - c + d;
      const l = Math.hypot(nx, ny, nz) || 1;
      N[v * 3] = nx / l;
      N[v * 3 + 1] = ny / l;
      N[v * 3 + 2] = nz / l;
      if ((v & 1023) === 1023) yield { phase: "sharpen" };
    }
    for (let t = 0; t < I.length; t += 3) faceNormal(P, t, faceN, t);
    for (let v = 0; v < V; v++) {
      const x0 = P[v * 3], y0 = P[v * 3 + 1], z0 = P[v * 3 + 2], w0 = 0.08;
      let a11 = w0, a12 = 0, a13 = 0, a22 = w0, a23 = 0, a33 = w0, b1 = 0, b2 = 0, b3 = 0;
      const add = (j) => {
        const nx = N[j * 3], ny = N[j * 3 + 1], nz = N[j * 3 + 2], d = nx * (P[j * 3] - x0) + ny * (P[j * 3 + 1] - y0) + nz * (P[j * 3 + 2] - z0);
        a11 += nx * nx;
        a12 += nx * ny;
        a13 += nx * nz;
        a22 += ny * ny;
        a23 += ny * nz;
        a33 += nz * nz;
        b1 += nx * d;
        b2 += ny * d;
        b3 += nz * d;
      };
      add(v);
      for (const j of ring[v]) add(j);
      const det = a11 * (a22 * a33 - a23 * a23) - a12 * (a12 * a33 - a23 * a13) + a13 * (a12 * a23 - a22 * a13);
      let dx = (b1 * (a22 * a33 - a23 * a23) - a12 * (b2 * a33 - a23 * b3) + a13 * (b2 * a23 - a22 * b3)) / det;
      let dy = (a11 * (b2 * a33 - a23 * b3) - b1 * (a12 * a33 - a23 * a13) + a13 * (a12 * b3 - b2 * a13)) / det;
      let dz = (a11 * (a22 * b3 - b2 * a23) - a12 * (a12 * b3 - b2 * a13) + b1 * (a12 * a23 - a22 * a13)) / det;
      const m = Math.hypot(dx, dy, dz), limit = cell * reach;
      if (!(m < 1e9)) {
        dx = dy = dz = 0;
      } else if (m > limit) {
        dx *= limit / m;
        dy *= limit / m;
        dz *= limit / m;
      }
      next[v * 3] = x0 + dx;
      next[v * 3 + 1] = y0 + dy;
      next[v * 3 + 2] = z0 + dz;
    }
    const moved = new Uint8Array(V).fill(1), tmp = [0, 0, 0];
    for (let pass = 0; pass < 6; pass++) {
      let undone = 0;
      for (let t = 0; t < I.length; t += 3) {
        faceNormal(next, t, tmp, 0);
        const ox = faceN[t], oy = faceN[t + 1], oz = faceN[t + 2], dot = ox * tmp[0] + oy * tmp[1] + oz * tmp[2];
        if (dot > 0.2 * Math.hypot(ox, oy, oz) * Math.hypot(tmp[0], tmp[1], tmp[2])) continue;
        for (let k = 0; k < 3; k++) {
          const v = I[t + k];
          if (moved[v]) {
            moved[v] = 0;
            next[v * 3] = P[v * 3];
            next[v * 3 + 1] = P[v * 3 + 1];
            next[v * 3 + 2] = P[v * 3 + 2];
            undone++;
          }
        }
      }
      if (!undone) break;
    }
    P.set(next);
    yield { phase: "sharpen", round };
  }
  return mesh;
}
function signedVolume(positions, indices) {
  let v = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3, p = positions;
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) + p[a + 1] * (p[b + 2] * p[c] - p[b] * p[c + 2]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}
function heap() {
  let cap = 1 << 14, cost = new Float64Array(cap), ab = new Int32Array(cap * 2), st = new Uint32Array(cap * 2), xyz = new Float64Array(cap * 3), order = new Int32Array(cap), free = [], used = 0, n = 0;
  function grow() {
    const c = cap * 2, nc = new Float64Array(c), nab = new Int32Array(c * 2), nst = new Uint32Array(c * 2), nxyz = new Float64Array(c * 3), no = new Int32Array(c);
    nc.set(cost);
    nab.set(ab);
    nst.set(st);
    nxyz.set(xyz);
    no.set(order);
    cost = nc;
    ab = nab;
    st = nst;
    xyz = nxyz;
    order = no;
    cap = c;
  }
  return {
    get size() {
      return n;
    },
    push(c, a, b, sa, sb, x, y, z) {
      let slot = free.length ? free.pop() : used++;
      if (slot >= cap) grow();
      cost[slot] = c;
      ab[slot * 2] = a;
      ab[slot * 2 + 1] = b;
      st[slot * 2] = sa;
      st[slot * 2 + 1] = sb;
      xyz[slot * 3] = x;
      xyz[slot * 3 + 1] = y;
      xyz[slot * 3 + 2] = z;
      let i = n++;
      if (n > cap) grow();
      while (i > 0) {
        const parent = i - 1 >> 1, ps = order[parent];
        if (cost[ps] <= c) break;
        order[i] = ps;
        i = parent;
      }
      order[i] = slot;
    },
    pop(out) {
      const slot = order[0];
      out.cost = cost[slot];
      out.a = ab[slot * 2];
      out.b = ab[slot * 2 + 1];
      out.va = st[slot * 2];
      out.vb = st[slot * 2 + 1];
      out.x = xyz[slot * 3];
      out.y = xyz[slot * 3 + 1];
      out.z = xyz[slot * 3 + 2];
      free.push(slot);
      n--;
      if (n > 0) {
        const last = order[n], c = cost[last];
        let i = 0;
        for (; ; ) {
          const l = i * 2 + 1, r = l + 1;
          let m = -1, mc = c;
          if (l < n && cost[order[l]] < mc) {
            m = l;
            mc = cost[order[l]];
          }
          if (r < n && cost[order[r]] < mc) m = r;
          if (m < 0) break;
          order[i] = order[m];
          i = m;
        }
        order[i] = last;
      }
      return out;
    },
    clear() {
      n = 0;
      used = 0;
      free.length = 0;
    }
  };
}
var EASING = [[0.12, 0.45], [0.05, 0.25]];
function* decimateStages(mesh, targets) {
  const P = Float64Array.from(mesh.positions), V = P.length / 3, T = mesh.indices.length / 3;
  const tri = Int32Array.from(mesh.indices), alive = new Uint8Array(T).fill(1), valive = new Uint8Array(V).fill(1), stamp = new Uint32Array(V), mark = new Uint32Array(V);
  const Q = new Float64Array(V * 10), areaOf = new Float64Array(V), faces = Array.from({ length: V }, () => []);
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) faces[tri[t * 3 + k]].push(t);
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (!len) continue;
    const area = len * 0.5;
    nx /= len;
    ny /= len;
    nz /= len;
    const d = -(nx * P[a] + ny * P[a + 1] + nz * P[a + 2]);
    const q2 = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d];
    for (const v of [a / 3, b / 3, c / 3]) {
      for (let k = 0; k < 10; k++) Q[v * 10 + k] += q2[k] * area;
      areaOf[v] += area;
    }
  }
  let triangles = T, marker = 0, minQuality = EASING[0][0], maxTurn = EASING[0][1];
  const results = [], E = heap(), entry = {}, q = new Float64Array(10), best = [0, 0, 0];
  const qerr = (x, y, z) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  function evaluate(a, b) {
    for (let k = 0; k < 10; k++) q[k] = Q[a * 10 + k] + Q[b * 10 + k];
    const a11 = q[0], a12 = q[1], a13 = q[2], a22 = q[4], a23 = q[5], a33 = q[7], b1 = -q[3], b2 = -q[6], b3 = -q[8];
    const det = a11 * (a22 * a33 - a23 * a23) - a12 * (a12 * a33 - a23 * a13) + a13 * (a12 * a23 - a22 * a13);
    const scale = Math.abs(a11) + Math.abs(a22) + Math.abs(a33);
    let cost = Infinity;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
    if (Math.abs(det) > 1e-9 * scale * scale * scale) {
      const x = (b1 * (a22 * a33 - a23 * a23) - a12 * (b2 * a33 - a23 * b3) + a13 * (b2 * a23 - a22 * b3)) / det;
      const y = (a11 * (b2 * a33 - a23 * b3) - b1 * (a12 * a33 - a23 * a13) + a13 * (a12 * b3 - b2 * a13)) / det;
      const z = (a11 * (a22 * b3 - b2 * a23) - a12 * (a12 * b3 - b2 * a13) + b1 * (a12 * a23 - a22 * a13)) / det;
      const half = Math.hypot(ax - bx, ay - by, az - bz);
      if (Math.hypot(x - (ax + bx) / 2, y - (ay + by) / 2, z - (az + bz) / 2) <= half * 4) {
        cost = qerr(x, y, z);
        best[0] = x;
        best[1] = y;
        best[2] = z;
      }
    }
    for (let s = 0; s <= 1; s += 0.5) {
      const x = ax + (bx - ax) * s, y = ay + (by - ay) * s, z = az + (bz - az) * s, c = qerr(x, y, z);
      if (c < cost) {
        cost = c;
        best[0] = x;
        best[1] = y;
        best[2] = z;
      }
    }
    return Math.max(0, cost) / Math.max(1e-30, areaOf[a] + areaOf[b]);
  }
  const push = (a, b) => {
    const c = evaluate(a, b);
    E.push(c, a, b, stamp[a], stamp[b], best[0], best[1], best[2]);
  };
  function pushAll() {
    for (let t = 0; t < T; t++) if (alive[t]) for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k], b = tri[t * 3 + (k + 1) % 3];
      if (a < b) push(a, b);
    }
  }
  function markRing(v) {
    const id = ++marker;
    for (const t of faces[v]) for (let k = 0; k < 3; k++) {
      const w = tri[t * 3 + k];
      if (w !== v) mark[w] = id;
    }
    return id;
  }
  function quality(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const l = ux * ux + uy * uy + uz * uz + vx * vx + vy * vy + vz * vz + (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2;
    return l > 0 ? 2 * Math.sqrt(3) * area2 / l : 0;
  }
  function valid(a, b, x, y, z) {
    const id = markRing(a);
    let shared = 0, seen = ++marker;
    for (const t of faces[b]) for (let k = 0; k < 3; k++) {
      const w = tri[t * 3 + k];
      if (w !== b && mark[w] === id) {
        mark[w] = seen;
        shared++;
      }
    }
    if (shared !== 2) return false;
    for (let pass = 0; pass < 2; pass++) {
      const v = pass ? b : a;
      for (const t of faces[v]) {
        const i0 = tri[t * 3], i1 = tri[t * 3 + 1], i2 = tri[t * 3 + 2];
        if ((i0 === a || i1 === a || i2 === a) && (i0 === b || i1 === b || i2 === b)) continue;
        const o0x = P[i0 * 3], o0y = P[i0 * 3 + 1], o0z = P[i0 * 3 + 2], o1x = P[i1 * 3], o1y = P[i1 * 3 + 1], o1z = P[i1 * 3 + 2], o2x = P[i2 * 3], o2y = P[i2 * 3 + 1], o2z = P[i2 * 3 + 2];
        const n0x = o0x === void 0 ? 0 : 0;
        let p0x = o0x, p0y = o0y, p0z = o0z, p1x = o1x, p1y = o1y, p1z = o1z, p2x = o2x, p2y = o2y, p2z = o2z;
        if (i0 === v) {
          p0x = x;
          p0y = y;
          p0z = z;
        } else if (i1 === v) {
          p1x = x;
          p1y = y;
          p1z = z;
        } else {
          p2x = x;
          p2y = y;
          p2z = z;
        }
        let ux = o1x - o0x, uy = o1y - o0y, uz = o1z - o0z, vx = o2x - o0x, vy = o2y - o0y, vz = o2z - o0z;
        const ax = uy * vz - uz * vy, ay = uz * vx - ux * vz, az = ux * vy - uy * vx;
        ux = p1x - p0x;
        uy = p1y - p0y;
        uz = p1z - p0z;
        vx = p2x - p0x;
        vy = p2y - p0y;
        vz = p2z - p0z;
        const bx = uy * vz - uz * vy, by = uz * vx - ux * vz, bz = ux * vy - uy * vx;
        const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz);
        if (lb < 1e-14) return false;
        if (la > 1e-14 && (ax * bx + ay * by + az * bz) / (la * lb) < maxTurn) return false;
        const q1 = quality(p0x, p0y, p0z, p1x, p1y, p1z, p2x, p2y, p2z);
        if (q1 < minQuality && q1 < quality(o0x, o0y, o0z, o1x, o1y, o1z, o2x, o2y, o2z) + n0x) return false;
      }
    }
    return true;
  }
  let worst = 0, steps = 0;
  function snapshot(error) {
    const map = new Int32Array(V).fill(-1), positions = [], indices = [];
    for (let t = 0; t < T; t++) if (alive[t]) for (let k = 0; k < 3; k++) {
      const v = tri[t * 3 + k];
      if (map[v] < 0) {
        map[v] = positions.length / 3;
        positions.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      }
      indices.push(map[v]);
    }
    return { positions: Float64Array.from(positions), indices: Uint32Array.from(indices), error };
  }
  pushAll();
  let level = 0, sinceRebuild = 0;
  for (const { triangles: target, maxError = Infinity } of targets) {
    let capped = false;
    while (triangles > target && !capped) {
      if (!E.size) {
        if (!sinceRebuild) {
          if (++level >= EASING.length) break;
          [minQuality, maxTurn] = EASING[level];
        }
        sinceRebuild = 0;
        E.clear();
        pushAll();
        continue;
      }
      E.pop(entry);
      const { a, b } = entry;
      if (!valive[a] || !valive[b] || stamp[a] !== entry.va || stamp[b] !== entry.vb) continue;
      if (Math.sqrt(entry.cost) > maxError) {
        capped = true;
        E.push(entry.cost, a, b, entry.va, entry.vb, entry.x, entry.y, entry.z);
        break;
      }
      if (!valid(a, b, entry.x, entry.y, entry.z)) continue;
      P[a * 3] = entry.x;
      P[a * 3 + 1] = entry.y;
      P[a * 3 + 2] = entry.z;
      for (let k = 0; k < 10; k++) Q[a * 10 + k] += Q[b * 10 + k];
      areaOf[a] += areaOf[b];
      const keep = [];
      for (const t of faces[a]) {
        const i0 = tri[t * 3], i1 = tri[t * 3 + 1], i2 = tri[t * 3 + 2];
        if (i0 === b || i1 === b || i2 === b) {
          alive[t] = 0;
          triangles--;
          for (const w of [i0, i1, i2]) if (w !== a && w !== b) {
            const list = faces[w], at = list.indexOf(t);
            list[at] = list[list.length - 1];
            list.pop();
          }
        } else keep.push(t);
      }
      for (const t of faces[b]) if (alive[t]) {
        for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === b) tri[t * 3 + k] = a;
        keep.push(t);
      }
      faces[a] = keep;
      faces[b] = [];
      valive[b] = 0;
      stamp[a]++;
      stamp[b]++;
      sinceRebuild++;
      worst = Math.max(worst, Math.sqrt(entry.cost));
      const id = markRing(a);
      for (const t of faces[a]) for (let k = 0; k < 3; k++) {
        const w = tri[t * 3 + k];
        if (w !== a && mark[w] === id) {
          mark[w] = 0;
          push(a, w);
        }
      }
      if ((++steps & 255) === 0) yield { phase: "decimate", triangles };
    }
    results.push(snapshot(worst));
  }
  return results;
}
function restoreVolume(mesh, volume) {
  const P = mesh.positions, I = mesh.indices, V = P.length / 3, N = new Float64Array(V * 3);
  let area = 0;
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    area += Math.hypot(nx, ny, nz) / 2;
    for (const v of [a, b, c]) {
      N[v] += nx;
      N[v + 1] += ny;
      N[v + 2] += nz;
    }
  }
  const delta = (volume - signedVolume(P, I)) / Math.max(1e-9, area);
  if (!(delta > 0)) return 0;
  for (let v = 0; v < V; v++) {
    const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1;
    P[v * 3] += N[v * 3] / l * delta;
    P[v * 3 + 1] += N[v * 3 + 1] / l * delta;
    P[v * 3 + 2] += N[v * 3 + 2] / l * delta;
  }
  return delta;
}
function creaseSplit(mesh, crease) {
  const { positions: P, indices: I } = mesh, V = P.length / 3, T = I.length / 3, cos = Math.cos(crease);
  const fn = new Float64Array(T * 3), fa = new Float64Array(T * 3), around = Array.from({ length: V }, () => []);
  for (let t = 0; t < T; t++) {
    const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    const p = ids.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2], vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    fn[t * 3] = nx / l;
    fn[t * 3 + 1] = ny / l;
    fn[t * 3 + 2] = nz / l;
    for (let k = 0; k < 3; k++) {
      const o = p[k], e1 = p[(k + 1) % 3], e2 = p[(k + 2) % 3];
      const ax = e1[0] - o[0], ay = e1[1] - o[1], az = e1[2] - o[2], bx = e2[0] - o[0], by = e2[1] - o[1], bz = e2[2] - o[2];
      fa[t * 3 + k] = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz) || 1))));
      around[ids[k]].push(t * 3 + k);
    }
  }
  const smoothOf = new Float64Array(V * 3);
  for (let v = 0; v < V; v++) {
    let x = 0, y = 0, z = 0;
    for (const c of around[v]) {
      const t = c / 3 | 0, w = fa[c];
      x += fn[t * 3] * w;
      y += fn[t * 3 + 1] * w;
      z += fn[t * 3 + 2] * w;
    }
    const l = Math.hypot(x, y, z) || 1;
    smoothOf[v * 3] = x / l;
    smoothOf[v * 3 + 1] = y / l;
    smoothOf[v * 3 + 2] = z / l;
  }
  const positions = [], normals = [], smooth2 = [], source = [], indices = new Uint32Array(I.length);
  for (let v = 0; v < V; v++) {
    const corners = around[v], n = corners.length, parent = corners.map((_, i) => i);
    const find = (i) => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]];
      return i;
    };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const ti = corners[i] / 3 | 0, tj = corners[j] / 3 | 0;
      let shared = 0;
      for (let k = 0; k < 3; k++) {
        const w = I[ti * 3 + k];
        if (w !== v && (I[tj * 3] === w || I[tj * 3 + 1] === w || I[tj * 3 + 2] === w)) shared++;
      }
      if (shared && fn[ti * 3] * fn[tj * 3] + fn[ti * 3 + 1] * fn[tj * 3 + 1] + fn[ti * 3 + 2] * fn[tj * 3 + 2] >= cos) parent[find(i)] = find(j);
    }
    const groups = /* @__PURE__ */ new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let g = groups.get(r);
      if (!g) groups.set(r, g = []);
      g.push(corners[i]);
    }
    for (const g of groups.values()) {
      let x = 0, y = 0, z = 0;
      for (const c of g) {
        const t = c / 3 | 0, w = fa[c];
        x += fn[t * 3] * w;
        y += fn[t * 3 + 1] * w;
        z += fn[t * 3 + 2] * w;
      }
      const l = Math.hypot(x, y, z) || 1, index = positions.length / 3;
      positions.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      normals.push(x / l, y / l, z / l);
      smooth2.push(smoothOf[v * 3], smoothOf[v * 3 + 1], smoothOf[v * 3 + 2]);
      source.push(v);
      for (const c of g) indices[c] = index;
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), smooth: Float32Array.from(smooth2), source: Uint32Array.from(source), indices };
}
function fieldShading(field, positions, normals, { reach, out = new Float32Array(positions.length / 3 * 2) }) {
  const n = positions.length / 3;
  const dirs = [[0, 1, 0], [0.8, 0.55, 0], [-0.4, 0.55, 0.7], [-0.4, 0.55, -0.7]];
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2], nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
    let tx = -nz, ty = 0, tz = nx;
    if (Math.abs(ny) > 0.9) {
      tx = 1;
      ty = 0;
      tz = 0;
    }
    let l = Math.hypot(tx, ty, tz);
    tx /= l;
    ty /= l;
    tz /= l;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    let occlusion = 0, weight = 0;
    for (const d of dirs) {
      const dx = tx * d[0] + nx * d[1] + bx * d[2], dy = ty * d[0] + ny * d[1] + by * d[2], dz = tz * d[0] + nz * d[1] + bz * d[2];
      for (let s = 1; s <= 3; s++) {
        const r = reach * s / 3, f = field(x + dx * r, y + dy * r, z + dz * r), w = 1 / s;
        occlusion += Math.max(0, Math.min(1, (r - f) / r)) * w;
        weight += w;
      }
    }
    const cavity = Math.max(0, Math.min(1, (occlusion / weight - 0.32) / 0.45));
    const e = reach * 0.35, cx = x + nx * e * 0.2, cy = y + ny * e * 0.2, cz = z + nz * e * 0.2;
    let rise = 0;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2, ux = tx * Math.cos(a) + bx * Math.sin(a), uy = ty * Math.cos(a) + by * Math.sin(a), uz = tz * Math.cos(a) + bz * Math.sin(a);
      rise += field(cx + ux * e, cy + uy * e, cz + uz * e);
    }
    const centre = field(cx, cy, cz), curvature = (rise / 4 - centre) / e;
    out[i * 2] = cavity;
    out[i * 2 + 1] = Math.max(0, Math.min(1, (curvature - 0.08) / 0.5));
  }
  return out;
}

// water-fall-edges.js
var FALL_EDGES = Object.freeze({ version: "fall-edges-v1", match: 0.05, columns: 8 });
var finite = Number.isFinite;
var validFall = (f) => !!f && [f.lip?.x, f.lip?.z, f.base?.x, f.base?.z, f.flow?.x, f.flow?.z, f.width].every(finite) && f.width > 0 && Math.abs(Math.hypot(f.flow.x, f.flow.z) - 1) < 1e-3;
function fallAtStart(reach) {
  const p = reach?.points?.[0];
  return (reach?.falls || []).find((f) => validFall(f) && p && Math.hypot(f.base.x - p.x, f.base.z - p.z) < FALL_EDGES.match) || null;
}
function fallAtEnd(reach, next) {
  const p = reach?.points?.at(-1);
  return (next?.falls || []).find((f) => validFall(f) && p && Math.hypot(f.lip.x - p.x, f.lip.z - p.z) < FALL_EDGES.match) || null;
}
var fallEdge = (f) => Object.freeze({ id: f.id, lip: Object.freeze({ x: f.lip.x, z: f.lip.z }), flow: Object.freeze({ x: f.flow.x, z: f.flow.z }), width: f.width });
function lipRowPoint(fall, k, back = 0, columns = FALL_EDGES.columns) {
  const off = (k / columns - 0.5) * fall.width;
  return { x: fall.lip.x - fall.flow.x * back - fall.flow.z * off, z: fall.lip.z - fall.flow.z * back + fall.flow.x * off, off };
}
var LIP_SHEET = Object.freeze({ back: 0.55, fade: 0.45, drop: 0.1, depth: 0.24, maxDepth: 1, sheetDepth: 0.5, ref: 1.45, bedSlope: 0.15, crown: 0.06 });
function lipSetback() {
  return LIP_SHEET.back;
}
function lipBedLevel(g0, g1, a) {
  const L = LIP_SHEET;
  return Math.max(-L.maxDepth, Math.min(-L.depth, g1 + Math.max(-L.bedSlope, Math.min(0, (g1 - g0) / (2.5 - L.ref))) * Math.max(0, a + L.ref)));
}
function lipDepth(fall, height) {
  if (typeof height !== "function") return LIP_SHEET.depth;
  const at = (a) => height(fall.lip.x + fall.flow.x * a, fall.lip.z + fall.flow.z * a) - fall.lip.y, g0 = at(-2.5), g1 = at(-LIP_SHEET.ref);
  return [g0, g1].every(finite) ? -lipBedLevel(g0, g1, 0) : LIP_SHEET.depth;
}
function lipSheet(fall = null, height = null) {
  const L = LIP_SHEET, depth = Math.min(L.sheetDepth, fall ? lipDepth(fall, height) : L.depth), lip = (drop, d) => ({ length: L.back + L.fade, fade: L.fade, drop, depth: d, crown: Math.min(drop, L.crown) });
  return [lip(L.drop, depth), lip(L.drop * 0.6, Math.min(depth, 0.4)), lip(L.drop * 0.5, L.depth), lip(0, L.depth), lip(0, 0)];
}
function approachPoint(fall, p) {
  const t = (p.x - fall.lip.x) * fall.flow.x + (p.z - fall.lip.z) * fall.flow.z;
  return { x: p.x - fall.flow.x * t, z: p.z - fall.flow.z * t, back: t };
}
function shapeLipRow(body, fall, back = 0) {
  const g = body?.geometry, P = g?.attributes?.position, uv = g?.attributes?.uv, C = FALL_EDGES.columns + 1;
  if (!P || P.count % C || P.count < 2 * C) return false;
  const last = P.count - C;
  for (let k = 0; k < C; k++) {
    const q = lipRowPoint(fall, k, back);
    P.setX(last + k, q.x);
    P.setZ(last + k, q.z);
    if (uv) uv.setX(last + k, q.off);
  }
  P.needsUpdate = true;
  if (uv) uv.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return true;
}
function fitApproach(body, lower, fall) {
  const g = body?.geometry, h = lower?.geometry, C = FALL_EDGES.columns + 1;
  const names = ["position", "uv", "flow", "riverInfo", "aSlope"];
  if (!g || !h || names.some((n) => !g.attributes[n] || !h.attributes[n])) return false;
  const rows = g.attributes.position.count / C;
  if (!Number.isInteger(rows) || rows < 2 || h.attributes.position.count % C) return false;
  const P0 = h.attributes.position, centre = { x: (P0.getX(0) + P0.getX(C - 1)) / 2, z: (P0.getZ(0) + P0.getZ(C - 1)) / 2 };
  const length = Math.max(0, approachPoint(fall, centre).back);
  for (let k = 0; k < C; k++) {
    const far = {}, near = {};
    for (const n of names) {
      const A = h.attributes[n], size = A.itemSize;
      near[n] = Array.from({ length: size }, (_, c) => A.array[k * size + c]);
      far[n] = near[n].slice();
    }
    const back = approachPoint(fall, { x: near.position[0], z: near.position[2] });
    far.position[0] = back.x;
    far.position[2] = back.z;
    far.uv[1] = near.uv[1] - length;
    far.riverInfo[1] = 0;
    far.riverInfo[2] = near.riverInfo[2] - length;
    far.aSlope[0] = far.aSlope[1] = 0;
    for (let r = 0; r < rows; r++) {
      const t = r / (rows - 1), i = r * C + k;
      for (const n of names) {
        const A = g.attributes[n], size = A.itemSize;
        for (let c = 0; c < size; c++) A.array[i * size + c] = far[n][c] + (near[n][c] - far[n][c]) * t;
      }
    }
  }
  for (const n of names) g.attributes[n].needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return true;
}

export {
  hashString,
  randomSource,
  hash2,
  valueNoise,
  ABYSS,
  REGIONS,
  DEEP,
  REGION_SHAPE,
  THEMES,
  fbm,
  generateAbyss,
  meshFieldStages,
  sharpenStages,
  signedVolume,
  decimateStages,
  restoreVolume,
  creaseSplit,
  fieldShading,
  fallAtStart,
  fallAtEnd,
  fallEdge,
  lipRowPoint,
  LIP_SHEET,
  lipSetback,
  lipBedLevel,
  lipSheet,
  approachPoint,
  shapeLipRow,
  fitApproach
};
