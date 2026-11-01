import {
  ABYSS,
  LIP_SHEET,
  REGION_SHAPE,
  creaseSplit,
  decimateStages,
  fbm,
  fieldShading,
  hash2,
  hashString,
  lipBedLevel,
  meshFieldStages,
  randomSource,
  sharpenStages,
  valueNoise
} from "./chunk-2OXLF6NH.js";

// underworld-field.js
var clamp = (v, a, b) => v < a ? a : v > b ? b : v;
var mix = (a, b, t) => a + (b - a) * t;
var smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function smoothUnion(a, b, k) {
  const h = clamp(0.5 + 0.5 * (a - b) / k, 0, 1);
  return b + (a - b) * h + k * h * (1 - h);
}
var STEP = 5.5;
var TALUS = ABYSS.floor.talus;
var TALUS_REACH = ABYSS.floor.talusReach;
var WALK = Object.freeze({ rise: 1.6, step: 0.3 });
var ISLET = Object.freeze({ shore: 0.28, hill: 0.9, slope: 1.7 });
var OPEN_MARGIN = 7.2;
var CHASM = Object.freeze({ depth: 70 });
var LAVA_SINK = 0.45;
function createUnderworldField(data) {
  const g = data.grid, { x0, z0, cell: G, nx, nz } = g, sd = g.sd, floorG = g.floor, vaultG = g.vault;
  const seed = data.planSeed >>> 0, N = (x, z, c) => valueNoise(x, z, (seed ^ Math.imul(c + 1, 1013904223)) >>> 0);
  const S = (k) => (seed ^ Math.imul(k + 1, 625341585)) >>> 0;
  const regions = data.regions, rooms = data.sites, adits = data.adits || [];
  const arenas = (data.bosses || []).filter((b) => b.kind !== "serpent").map((b) => ({ x: b.x, z: b.z, r: Math.min(22, (b.arena || 30) * 0.55) }));
  const inArena = (x, z, margin = 0) => {
    for (const a of arenas) if ((x - a.x) ** 2 + (z - a.z) ** 2 < (a.r + margin) ** 2) return true;
    return false;
  };
  const bil = (grid, x, z) => {
    const gx = clamp((x - x0) / G, 0, nx - 1.0001), gz = clamp((z - z0) / G, 0, nz - 1.0001), i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j, k = j * nx + i;
    return (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + nx] * (1 - u) + grid[k + nx + 1] * u) * v;
  };
  const RW = ABYSS.regions.warp, REG = { a: 0, b: 0, w: 0, kindA: "stone", kindB: "stone" };
  const RG = data.regionGrid, RS = RG.spacing;
  function regionAt(x, z, out = REG) {
    const wx = x + (fbm(x / 520, z / 520, S(10), 3) - 0.5) * 2 * RW, wz = z + (fbm(x / 520 + 9.1, z / 520 - 3.7, S(11), 3) - 0.5) * 2 * RW;
    let a = null, da = Infinity, b = null, db = Infinity;
    const ci = Math.round((wx - RG.x0) / RS), cj = Math.round((wz - RG.z0) / RS);
    for (let j = Math.max(0, cj - 2); j <= Math.min(RG.nz - 1, cj + 2); j++) for (let i = Math.max(0, ci - 2); i <= Math.min(RG.nx - 1, ci + 2); i++) {
      const r = regions[j * RG.nx + i], d = (r.x - wx) * (r.x - wx) + (r.z - wz) * (r.z - wz);
      if (d < da) {
        b = a;
        db = da;
        a = r;
        da = d;
      } else if (d < db) {
        b = r;
        db = d;
      }
    }
    if (!a) {
      a = regions[0];
      da = 0;
    }
    if (!b) {
      b = a;
      db = da + 1e6;
    }
    out.a = a.id;
    out.b = b.id;
    out.kindA = a.kind;
    out.kindB = b.kind;
    out.w = 0.5 * (1 - smooth(0, 70, Math.sqrt(db) - Math.sqrt(da)));
    return out;
  }
  const SITE_CELL = 160, sx0 = Math.floor(data.bounds.minX / SITE_CELL) - 1, sz0 = Math.floor(data.bounds.minZ / SITE_CELL) - 1;
  const snx = Math.floor(data.bounds.maxX / SITE_CELL) + 2 - sx0, snz = Math.floor(data.bounds.maxZ / SITE_CELL) + 2 - sz0, siteCells = Array.from({ length: snx * snz }, () => null);
  rooms.forEach((r, i) => {
    const reach = r.r * 1.5 + 6;
    for (let j = Math.floor((r.z - reach) / SITE_CELL); j <= Math.floor((r.z + reach) / SITE_CELL); j++) for (let k = Math.floor((r.x - reach) / SITE_CELL); k <= Math.floor((r.x + reach) / SITE_CELL); k++) {
      const kk = k - sx0, jj = j - sz0;
      if (kk < 0 || jj < 0 || kk >= snx || jj >= snz) continue;
      (siteCells[jj * snx + kk] ||= []).push(i);
    }
  });
  const shafts = rooms.filter((r) => r.shaft), SITE = { room: null, s: -9, room2: null, s2: -9 };
  const WELL = Object.freeze({ cell: 128, meadow: 10, calm: [6, 24], reach: 26, deeper: 10 });
  const chasms = data.chasms || [], deepLayer = data.layer === "deep";
  const wells = (data.wells || []).map((w) => ({ ...w, top: bil(floorG, w.x, w.z) + bil(vaultG, w.x, w.z) + 34 + WELL.deeper }));
  const wellCells = /* @__PURE__ */ new Map();
  for (const w of wells) {
    const reach = w.radius + WELL.reach;
    for (let j = Math.floor((w.z - reach) / WELL.cell); j <= Math.floor((w.z + reach) / WELL.cell); j++) for (let k = Math.floor((w.x - reach) / WELL.cell); k <= Math.floor((w.x + reach) / WELL.cell); k++) {
      const key = k + "," + j;
      let l = wellCells.get(key);
      if (!l) wellCells.set(key, l = []);
      l.push(w);
    }
  }
  const WL = { w: null, d: Infinity };
  function wellAt(x, z) {
    if (!wells.length) return null;
    const list = wellCells.get(Math.floor(x / WELL.cell) + "," + Math.floor(z / WELL.cell));
    if (!list) return null;
    WL.w = null;
    WL.d = Infinity;
    for (const w of list) {
      const d = Math.hypot(x - w.x, z - w.z);
      if (d < w.radius + WELL.reach && d - w.radius < WL.d - (WL.w ? WL.w.radius : 0)) {
        WL.w = w;
        WL.d = d;
      }
    }
    return WL.w ? WL : null;
  }
  const wellCalm = (x, z) => {
    const wl = wellAt(x, z);
    return wl ? smooth(wl.w.radius + WELL.calm[0], wl.w.radius + WELL.calm[1], wl.d) : 1;
  };
  const skyShafts = [];
  function siteAt(x, z) {
    const kk = Math.floor(x / SITE_CELL) - sx0, jj = Math.floor(z / SITE_CELL) - sz0;
    const list = kk < 0 || jj < 0 || kk >= snx || jj >= snz ? null : siteCells[jj * snx + kk];
    if (!list) return null;
    let best = null, bs = -1e9, second = null, s2 = -1e9;
    for (let n = 0; n < list.length; n++) {
      const r = rooms[list[n]], s = 1 - Math.hypot(x - r.x, z - r.z) / r.r;
      if (s > bs) {
        second = best;
        s2 = bs;
        bs = s;
        best = r;
      } else if (s > s2) {
        second = r;
        s2 = s;
      }
    }
    if (!best) return null;
    SITE.room = best;
    SITE.s = bs;
    SITE.room2 = second;
    SITE.s2 = s2;
    return SITE;
  }
  const aditFrames = adits.map((a) => {
    const dx = a.mouth.x - a.end.x, dz = a.mouth.z - a.end.z, len = Math.hypot(dx, dz);
    return { a, ax: a.end.x - a.dir.x * 1.2, az: a.end.z - a.dir.z * 1.2, dx: a.dir.x, dz: a.dir.z, len: len + 1.2, r: a.radius, phase: a.index * 2.399 % 6.283, minX: Math.min(a.end.x, a.mouth.x) - 12, maxX: Math.max(a.end.x, a.mouth.x) + 12, minZ: Math.min(a.end.z, a.mouth.z) - 12, maxZ: Math.max(a.end.z, a.mouth.z) + 12 };
  });
  const AD = { f: null, q: 0, along: 0 };
  function aditAt(x, z) {
    AD.f = null;
    let bestQ = Infinity;
    for (const f of aditFrames) {
      if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
      const t = clamp((x - f.ax) * f.dx + (z - f.az) * f.dz, 0, f.len), px = x - f.ax - f.dx * t, pz = z - f.az - f.dz * t;
      const wander = (Math.sin(t * 0.23 + f.phase) * 1.1 + Math.sin(t * 0.61 + f.phase * 2.3) * 0.4) * smooth(0, 7, t) * smooth(0, 7, f.len - t);
      const q = Math.hypot(px * -f.dz + pz * f.dx - wander, px * f.dx + pz * f.dz);
      if (q < bestQ) {
        bestQ = q;
        AD.f = f;
        AD.q = q;
        AD.along = f.len - t;
      }
    }
    return AD.f ? AD : null;
  }
  function clearance(x, z) {
    let c = bil(sd, x, z);
    if (c > -40) {
      const plan = c;
      c += (N(x / 26, z / 26, 40) - 0.5) * 9 + (N(x / 9, z / 9, 41) - 0.5) * 3.2 + (N(x / 3, z / 3, 42) - 0.5) * 1.1;
      if (plan > 2.5 && plan < 14) c = Math.max(c, (plan - 2.5) * 0.9 * (1 - smooth(8, 14, plan)));
    }
    const ad = adits.length ? aditAt(x, z) : null;
    if (ad) c = smoothUnion(c, ad.f.r + (N(x / 3.4, z / 3.4, 43) - 0.5) * 1.5 + (N(x / 1.2, z / 1.2, 46) - 0.5) * 0.5 - ad.q, 1.4);
    return clamp(c, -60, 400);
  }
  function openness(x, z) {
    const c = bil(sd, x, z) + OPEN_MARGIN;
    if (c > 0 || !adits.length) return c;
    const ad = aditAt(x, z);
    return ad && ad.q < ad.f.r + 3 ? 1 : c;
  }
  const siteFloors = /* @__PURE__ */ new Map(), aditFloors = /* @__PURE__ */ new Map(), shaftTops = /* @__PURE__ */ new Map();
  function rawFloor(x, z, c, reg, gap = riverGap(x, z), calm = wellCalm(x, z)) {
    const A = REGION_SHAPE[reg.kindA], B = REGION_SHAPE[reg.kindB], w = reg.w;
    const terrace = mix(A.terrace, B.terrace, w), rough = mix(A.rough, B.rough, w);
    const broad = bil(floorG, x, z);
    let f = broad;
    const tm = terrace * smooth(0.38, 0.62, N(x / 95, z / 95, 31)) * (gap < RIVER.calm ? smooth(6, RIVER.calm, gap) : 1) * calm;
    if (tm > 1e-3) {
      const t = (broad + (N(x / 40, z / 40, 30) - 0.5) * 4) / STEP, fl = Math.floor(t), fr = t - fl;
      f = mix(f, (fl + smooth(0.8, 0.97, fr)) * STEP, tm);
    }
    const open = Math.max(0, c);
    f += TALUS * Math.exp(-open / TALUS_REACH) * (0.55 + 0.45 * N(x / 14, z / 14, 32));
    f += rough * (0.3 + 0.7 * calm) * ((1 - Math.abs(2 * N(x / 3.1, z / 3.1, 33) - 1)) * 0.42 + (N(x / 1.15, z / 1.15, 34) - 0.5) * 0.14);
    return f;
  }
  const waterLevels = /* @__PURE__ */ new Map();
  function waterLevel(room) {
    let l = waterLevels.get(room.id);
    if (l === void 0) {
      const p = room.water?.pool;
      l = p ? Math.min(siteFloor(room), rawFloor(p.x, p.z, clearance(p.x, p.z), regionAt(p.x, p.z, {}))) - 0.32 : siteFloor(room) - 0.32;
      waterLevels.set(room.id, l);
    }
    return l;
  }
  function siteFloor(room) {
    let f = siteFloors.get(room.id);
    if (f === void 0) {
      const reg = regionAt(room.x, room.z, {});
      f = rawFloor(room.x, room.z, clearance(room.x, room.z), reg);
      siteFloors.set(room.id, f);
    }
    return f;
  }
  function aditFloor(f) {
    let y = aditFloors.get(f.a.index);
    if (y === void 0) {
      const m = f.a.mouth, reg = regionAt(m.x, m.z, {});
      y = rawFloor(m.x, m.z, clearance(m.x, m.z), reg);
      aditFloors.set(f.a.index, y);
    }
    return y;
  }
  const RIVER = Object.freeze({ bank: 5, fade: 3, under: 0.45, fall: 1, calm: 22, ease: 24, stair: 12 }), rivers = [], riverFalls = [], riverPools = [];
  function lakeGround(room, site, ws, floor, lvl) {
    const shore = lvl + 0.35, wtr = room.water, bowl = ws > -0.2 ? shore - (0.32 + wtr.depth) * smooth(-0.04, 0.62, ws) : shore;
    const to = floor > bowl ? bowl : ws > -0.2 ? bowl : mix(floor, shore, smooth(-0.75, -0.42, ws));
    if (Math.abs(to - floor) < 1e-4) return floor;
    const e = Math.max(0, Math.min((site.s + 0.35) * room.r, site.room2 && site.room2 !== room && site.s2 > -0.35 ? (site.s - site.s2) * room.r * 0.5 : Infinity));
    const band = clamp(3 + 1.6 * Math.abs(floor - to), 4, 22);
    if (to < floor && !wtr.pool) return mix(floor, to, smooth(0, band, e));
    if (ws > -0.2) return to;
    const g2 = Math.max(0, (-0.32 - ws) * (wtr.pool ? wtr.pool.r : wtr.extent * room.r));
    return mix(floor, to, smooth(0, 1, e / Math.max(1e-3, Math.min(band, e + g2))));
  }
  function waterReach(room, site, x, z) {
    const wtr = room.water;
    return (wtr.pool ? 1 - Math.hypot(x - wtr.pool.x, z - wtr.pool.z) / wtr.pool.r : (site.s - (1 - wtr.extent)) / wtr.extent) + (N(x * 0.12, z * 0.12, 8) - 0.5) * 0.32;
  }
  function lakeWaterAt(lake, x, z) {
    const site = siteAt(x, z);
    if (!site || site.room !== lake || site.s <= -0.35) return false;
    const lvl = waterLevel(lake), ws = waterReach(lake, site, x, z);
    if (ws <= -0.2) return false;
    const shore = lvl + 0.35 - (0.32 + lake.water.depth) * smooth(-0.04, 0.62, ws);
    if (shore >= lvl) return false;
    if (lake.water.pool) return true;
    const e = Math.max(0, Math.min((site.s + 0.35) * lake.r, site.room2 && site.room2 !== lake && site.s2 > -0.35 ? (site.s - site.s2) * lake.r * 0.5 : Infinity));
    if (e >= 22) return true;
    const S3 = { s: site.s, s2: site.s2, room2: site.room2 };
    return lakeGround(lake, S3, ws, rawFloor(x, z, clearance(x, z), regionAt(x, z, {})), lvl) < lvl;
  }
  const RV_ = { d: 0, w: 0, level: 0, depth: 0, fx: 0, fz: 0, speed: 0, river: -1, region: null }, RG_ = { ...RV_ };
  const RB = 32, rbx0 = Math.floor(data.bounds.minX / RB) - 1, rbz0 = Math.floor(data.bounds.minZ / RB) - 1, rbnx = Math.floor(data.bounds.maxX / RB) + 2 - rbx0, rbnz = Math.floor(data.bounds.maxZ / RB) + 2 - rbz0;
  const bucket = (cells, x0_, x1, z0_, z1, value) => {
    for (let j = Math.floor(z0_ / RB); j <= Math.floor(z1 / RB); j++) for (let k = Math.floor(x0_ / RB); k <= Math.floor(x1 / RB); k++) {
      const kk = k - rbx0, jj = j - rbz0;
      if (kk >= 0 && jj >= 0 && kk < rbnx && jj < rbnz) (cells[jj * rbnx + kk] ||= []).push(value);
    }
  };
  for (const rv of data.rivers || []) {
    const P = rv.points, n = P.length / 2, w = new Float32Array(n), along = new Float32Array(n);
    for (let i = 1; i < n; i++) along[i] = along[i - 1] + Math.hypot(P[i * 2] - P[i * 2 - 2], P[i * 2 + 1] - P[i * 2 - 1]);
    for (let i = 0; i < n; i++) w[i] = mix(rv.width[0], rv.width[1], along[i] / Math.max(1, along[n - 1]));
    rivers.push({ id: rv.id, P, n, lv: null, w, along, depth: rv.depth, region: rv.region, plan: rv });
    if (rv.pool) riverPools.push({ river: rv.id, x: P[n * 2 - 2], z: P[n * 2 - 1], r: rv.pool.r, level: NaN, depth: rv.pool.depth, region: rv.region });
  }
  const fallBrinks = /* @__PURE__ */ new Map();
  function fallBrink(room) {
    let b = fallBrinks.get(room.id);
    if (b) return b;
    const f = room.falls, ix = -Math.cos(f.angle), iz = -Math.sin(f.angle);
    let wx = f.x + ix * 6, wz = f.z + iz * 6;
    for (let d = 6; d > -14; d -= 0.25) {
      const px = f.x + ix * d, pz = f.z + iz * d;
      if (clearance(px, pz) < 0.15) break;
      wx = px;
      wz = pz;
    }
    b = { x: wx, z: wz, ix, iz };
    fallBrinks.set(room.id, b);
    return b;
  }
  for (const room of rooms) {
    if (!room.falls) continue;
    const b = fallBrink(room), r = clamp(room.falls.width * 1.05 + 2.2, 3.4, 8), lx = b.x + b.ix * 1.6, lz = b.z + b.iz * 1.6, own = room.water?.pool;
    const inSite = Math.hypot(lx - room.x, lz - room.z) < room.r * 1.2;
    if (own && inSite) {
      const d = Math.hypot(lx - own.x, lz - own.z);
      if (d < own.r * 0.7) continue;
      if (d < own.r * 1.7) {
        own.r = d / 0.7;
        continue;
      }
    }
    riverPools.push({ river: "plunge:" + room.id, plunge: room, x: b.x + b.ix * r * 0.55, z: b.z + b.iz * r * 0.55, r, level: NaN, depth: 1.7, region: room.kind });
  }
  const riverCells = rivers.length ? Array.from({ length: rbnx * rbnz }, () => null) : null, poolCells = riverPools.length ? Array.from({ length: rbnx * rbnz }, () => null) : null;
  for (const r of rivers) for (let i = 0; i < r.n - 1; i++) {
    const reach = Math.max(r.w[i], r.w[i + 1]) / 2 + RIVER.calm + 1, ax = r.P[i * 2], az = r.P[i * 2 + 1], bx = r.P[i * 2 + 2], bz = r.P[i * 2 + 3];
    bucket(riverCells, Math.min(ax, bx) - reach, Math.max(ax, bx) + reach, Math.min(az, bz) - reach, Math.max(az, bz) + reach, r.id * 65536 + i);
  }
  riverPools.forEach((p, n) => {
    const reach = p.r * 1.25 + RIVER.calm;
    bucket(poolCells, p.x - reach, p.x + reach, p.z - reach, p.z + reach, n);
  });
  function poolAt(x, z) {
    const kk = Math.floor(x / RB) - rbx0, jj = Math.floor(z / RB) - rbz0;
    if (kk < 0 || jj < 0 || kk >= rbnx || jj >= rbnz) return null;
    const list = poolCells[jj * rbnx + kk];
    if (!list) return null;
    let best = null, bd = Infinity;
    for (const n of list) {
      const p = riverPools[n], d = Math.hypot(x - p.x, z - p.z) - p.r;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return bd < RIVER.calm + best.r * 0.25 ? best : null;
  }
  function riverGap(x, z) {
    let gap = Infinity;
    if (riverCells) {
      const rv = riverAt(x, z, RG_);
      if (rv) gap = rv.d - rv.w / 2;
    }
    if (poolCells) {
      const p = poolAt(x, z);
      if (p) gap = Math.min(gap, Math.hypot(x - p.x, z - p.z) - p.r);
    }
    return gap;
  }
  {
    const R0 = {};
    const bodyAt = (x, z) => {
      const site = siteAt(x, z);
      if (!site || site.s <= -0.35) return null;
      const room = site.room;
      return room.water && lakeWaterAt(room, x, z) ? room : null;
    };
    for (const r of rivers) {
      const rv = r.plan, P = r.P, n = r.n, lv = new Float32Array(n), body = new Int32Array(n).fill(-1), cut = new Float32Array(n).fill(0.5);
      for (let i = 0; i < n; i++) {
        const b = bodyAt(P[i * 2], P[i * 2 + 1]);
        if (b) body[i] = b.id;
      }
      const end = rv.join >= 0 && rivers[rv.join]?.lv ? riverLevelNear(rivers[rv.join], P[n * 2 - 2], P[n * 2 - 1]) : rv.lake >= 0 && rooms[rv.lake] ? siteFloor(rooms[rv.lake]) - 0.32 : -Infinity;
      let L = rv.kind === "falls" && rooms[rv.site]?.water ? waterLevel(rooms[rv.site]) : Infinity;
      for (let i = 0; i < n; i++) {
        if (body[i] >= 0) {
          L = waterLevel(rooms[body[i]]);
          lv[i] = L;
          continue;
        }
        const x = P[i * 2], z = P[i * 2 + 1];
        let f = rawFloor(x, z, clearance(x, z), regionAt(x, z, R0));
        const site = siteAt(x, z), room = site && site.s > -0.35 && site.room.water ? site.room : null;
        if (room) f = Math.min(f, lakeGround(room, site, waterReach(room, site, x, z), f, waterLevel(room)));
        L = Math.min(L, f - (i ? RIVER.under : 0.6));
        lv[i] = Math.max(L, end);
      }
      for (let i = 1; i < n; i++) {
        if (body[i] >= 0 || lv[i - 1] - lv[i] <= RIVER.fall) continue;
        let k = -1;
        for (let j = i + 1; j < n && r.along[j] - r.along[i] <= RIVER.stair; j++) if (lv[j - 1] - lv[j] > RIVER.fall) k = j;
        if (k < 0) continue;
        for (let j = i; j < k; j++) if (body[j] < 0) lv[j] = lv[k];
        i--;
      }
      for (let i = 0; i + 1 < n; i++) {
        if (body[i] >= 0 || body[i + 1] < 0) continue;
        const W = lv[i + 1], drop = lv[i] - W;
        if (drop > 0 && drop <= RIVER.fall * 1.3) for (let k = i; k >= 0 && body[k] < 0 && r.along[i] - r.along[k] < RIVER.ease; k--) lv[k] = Math.min(lv[k], W + drop * smooth(0, RIVER.ease, r.along[i] - r.along[k]));
      }
      for (let i = 1; i < n; i++) if (body[i] >= 0 !== body[i - 1] >= 0) {
        let lo = 0, hi = 1;
        const inA = body[i - 1] >= 0, ax = P[i * 2 - 2], az = P[i * 2 - 1], bx = P[i * 2], bz = P[i * 2 + 1];
        for (let k = 0; k < 7; k++) {
          const m2 = (lo + hi) / 2, inM = !!bodyAt(ax + (bx - ax) * m2, az + (bz - az) * m2);
          if (inM === inA) lo = m2;
          else hi = m2;
        }
        const seg = Math.hypot(bx - ax, bz - az) || 1, m = (lo + hi) / 2;
        cut[i - 1] = inA ? Math.min(0.95, m + 1.2 / seg) : Math.max(0.05, m - 1.2 / seg);
      }
      r.lv = lv;
      r.body = body;
      r.cut = cut;
      r.shore = -1;
      if (rv.lake >= 0) {
        let k = n - 1;
        while (k > 0 && body[k] === rv.lake) k--;
        if (k < n - 1) r.shore = k;
      }
      for (let i = 1; i < n; i++) if (lv[i - 1] - lv[i] > RIVER.fall) {
        const ax = P[i * 2 - 2], az = P[i * 2 - 1], bx = P[i * 2], bz = P[i * 2 + 1], l = Math.hypot(bx - ax, bz - az) || 1, t = cut[i - 1];
        riverFalls.push({ river: r.id, x: ax + (bx - ax) * t, z: az + (bz - az) * t, top: lv[i - 1], foot: lv[i], width: r.w[i], dx: (bx - ax) / l, dz: (bz - az) / l, i });
      }
    }
    for (const p of riverPools) if (!p.plunge) {
      const r = rivers[p.river];
      p.level = r.lv[r.n - 1];
    }
    for (const p of riverPools) if (p.plunge) p.level = waterLevel(p.plunge);
  }
  function riverLevelNear(r, x, z) {
    let best = Infinity, lv = -Infinity;
    for (let i = 0; i < r.n; i++) {
      const d = Math.hypot(r.P[i * 2] - x, r.P[i * 2 + 1] - z);
      if (d < best) {
        best = d;
        lv = r.lv[i];
      }
    }
    return lv;
  }
  function riverAt(x, z, out = RV_) {
    if (!riverCells) return null;
    const kk = Math.floor(x / RB) - rbx0, jj = Math.floor(z / RB) - rbz0;
    if (kk < 0 || jj < 0 || kk >= rbnx || jj >= rbnz) return null;
    const list = riverCells[jj * rbnx + kk];
    if (!list) return null;
    let best = Infinity, br = null, bi = 0, bt = 0, bd = 0;
    for (let n = 0; n < list.length; n++) {
      const r = rivers[list[n] >>> 16], i2 = list[n] & 65535, ax = r.P[i2 * 2], az = r.P[i2 * 2 + 1], ex2 = r.P[i2 * 2 + 2] - ax, ez2 = r.P[i2 * 2 + 3] - az, l2 = ex2 * ex2 + ez2 * ez2 || 1;
      const t2 = clamp(((x - ax) * ex2 + (z - az) * ez2) / l2, 0, 1), d = Math.hypot(x - ax - ex2 * t2, z - az - ez2 * t2), hw = mix(r.w[i2], r.w[i2 + 1], t2) / 2;
      if (d - hw < best) {
        best = d - hw;
        br = r;
        bi = i2;
        bt = t2;
        bd = d;
      }
    }
    if (!br || best > RIVER.calm) return null;
    const i = bi, t = bt, a = br.lv ? br.lv[i] : 0, b = br.lv ? br.lv[i + 1] : 0, ex = br.P[i * 2 + 2] - br.P[i * 2], ez = br.P[i * 2 + 3] - br.P[i * 2 + 1], l = Math.hypot(ex, ez) || 1;
    out.d = bd;
    out.w = mix(br.w[i], br.w[i + 1], t);
    out.level = a - b > RIVER.fall ? t < (br.cut ? br.cut[i] : 0.5) ? a : b : mix(a, b, t);
    out.depth = br.depth * (0.75 + 0.25 * Math.min(1, br.along[i] / 120));
    out.speed = clamp(0.28 + (a - b) / l * 5, 0.28, 1.1);
    out.fx = ex / l * out.speed;
    out.fz = ez / l * out.speed;
    out.river = br.id;
    out.region = br.region;
    return out;
  }
  const S_ = { floor: 0, base: 0, ceiling: 0, water: NaN, room: -1, s: -9, theme: null, c: 0, wet: 0, moss: 0, flow: 0, flowX: 0, flowZ: 0, river: Infinity, vault: 0, region: 0, regionB: 0, kind: "stone", kindB: "stone", blend: 0 };
  const R_ = { a: 0, b: 0, w: 0, kindA: "stone", kindB: "stone" };
  function surfaces(x, z, out = S_) {
    const c = clearance(x, z), reg = regionAt(x, z, R_), A = REGION_SHAPE[reg.kindA], B = REGION_SHAPE[reg.kindB];
    const rv = riverCells ? riverAt(x, z) : null, pool = poolCells ? poolAt(x, z) : null;
    const wl = wells.length ? wellAt(x, z) : null, well = wl ? wl.w : null, wd = wl ? wl.d : Infinity;
    let floor = rawFloor(x, z, c, reg, Math.min(rv ? rv.d - rv.w / 2 : Infinity, pool ? Math.hypot(x - pool.x, z - pool.z) - pool.r : Infinity), well ? smooth(well.radius + WELL.calm[0], well.radius + WELL.calm[1], wd) : 1);
    const base = floor;
    const open = Math.max(0, c), broad = bil(floorG, x, z);
    let ceiling = broad + bil(vaultG, x, z);
    const ribs = Math.pow(1 - Math.abs(2 * N(x / 11, z / 11, 35) - 1), 2.2) * 6.5 * smooth(3, 18, open);
    const masses = smooth(0.56, 0.86, N(x / 46, z / 46, 36)) * 16 * smooth(12, 46, open);
    ceiling += -ribs - masses + (N(x / 2.4, z / 2.4, 37) - 0.5) * 0.7 + (N(x / 7, z / 7, 38) - 0.5) * 1.6;
    const site = siteAt(x, z), room = site && site.s > -0.35 ? site.room : null, s = site ? site.s : -9;
    let water = NaN, wet = 0, moss = 0, holdY = -Infinity, holdLvl = Infinity;
    if (room) {
      const wtr = room.water;
      if (wtr) {
        const lvl = waterLevel(room);
        let ws = wtr.pool ? 1 - Math.hypot(x - wtr.pool.x, z - wtr.pool.z) / wtr.pool.r : (s - (1 - wtr.extent)) / wtr.extent;
        ws += (N(x * 0.12, z * 0.12, 8) - 0.5) * 0.32;
        floor = lakeGround(room, site, ws, Math.min(floor, base), lvl);
        if (ws <= -0.2 && ws > -0.8) {
          holdY = floor;
          holdLvl = lvl;
        }
        if (wtr.islets) for (const il of wtr.islets) {
          const d = Math.hypot(x - il.x, z - il.z), R = il.r * (1 + (N(x * 0.11, z * 0.11, 56) - 0.5) * 0.36);
          if (d > R * ISLET.slope + 2) continue;
          const q = d / R, top = q < 1 ? lvl + ISLET.shore + (ISLET.hill + 0.6 * N(x * 0.07, z * 0.07, 57)) * smooth(1, 0.3, q) + (N(x * 0.5, z * 0.5, 58) - 0.5) * 0.12 : lvl + ISLET.shore - (q - 1) / (ISLET.slope - 1) * (wtr.depth + 0.6);
          if (top > floor) floor = top;
          if (q < 1) moss = Math.max(moss, smooth(1, 0.55, q) * 0.75);
        }
        if (ws > -0.25 && floor < lvl) {
          water = lvl;
          wet = smooth(-0.25, 0.05, ws);
        }
      }
      if (room.shaft) {
        const d = Math.hypot(x - room.shaft.x, z - room.shaft.z);
        moss = smooth(room.shaft.radius + 22, room.shaft.radius + 3, d) * smooth(-0.1, 0.25, s);
      }
      if (room.theme === "skylight" || room.kind === "verdant") moss = Math.max(moss, smooth(-0.2, 0.5, s) * 0.6);
    }
    const room2 = site && site.s2 > -0.5 ? site.room2 : null;
    if (room2?.water && room2 !== room) {
      const w2 = room2.water, lvl2 = waterLevel(room2);
      if (floor < lvl2 + 0.35 && (Number.isNaN(water) || water < lvl2 - 0.02)) {
        let ws2 = w2.pool ? 1 - Math.hypot(x - w2.pool.x, z - w2.pool.z) / w2.pool.r : (site.s2 - (1 - w2.extent)) / w2.extent;
        ws2 += (N(x * 0.12, z * 0.12, 8) - 0.5) * 0.32;
        if (ws2 > -0.45) {
          floor = mix(floor, lvl2 + 0.35, smooth(-0.45, -0.12, ws2));
          if (floor > holdY) {
            holdY = floor;
            holdLvl = lvl2;
          }
          if (!Number.isNaN(water) && floor > water - 0.025) {
            water = NaN;
            wet = Math.max(wet, 0.6);
          }
        }
      }
    }
    let flowX = 0, flowZ = 0, flow = 0;
    if ((rv || pool) && Number.isNaN(water)) {
      if (rv && rv.d - rv.w / 2 < RIVER.bank + RIVER.fade) {
        const hw = rv.w / 2, d = rv.d, lv = rv.level;
        const shaped = d <= hw ? lv - 0.06 - rv.depth * (1 - d / hw * (d / hw)) : mix(lv + 0.1, Math.max(floor, lv + 0.35), smooth(hw, hw + RIVER.bank, d));
        floor = mix(shaped, floor, smooth(hw + RIVER.bank, hw + RIVER.bank + RIVER.fade, d));
        if (holdY > floor && lv < holdLvl - 0.05 && d > hw + 0.6) floor = mix(floor, holdY, smooth(hw + 0.6, hw + 2, d));
        if (d < hw + 1.5) {
          water = lv;
          flowX = rv.fx;
          flowZ = rv.fz;
          flow = rv.speed;
        }
        wet = Math.max(wet, smooth(hw + RIVER.bank + 1, hw, d));
      }
      if (pool) {
        const pr = pool.r * (1 + (N(x * 0.09, z * 0.09, 52) - 0.5) * 0.5), d = Math.hypot(x - pool.x, z - pool.z), lv = pool.level;
        if (d < pr + RIVER.bank + RIVER.fade) {
          const shaped = d <= pr ? lv - 0.06 - pool.depth * (1 - d / pr * (d / pr)) : mix(lv + 0.1, Math.max(floor, lv + 0.35), smooth(pr, pr + RIVER.bank, d));
          const rim = mix(lv + 0.12, lv + 0.4, smooth(pr, pr + 1.4, d)), own = rv && rv.river === pool.river && rv.d < rv.w / 2 + 2.5;
          if (d > pr && floor < rim && !own) floor = mix(floor, rim, smooth(pr + RIVER.bank + RIVER.fade, pr + 1.6, d));
          else floor = Math.min(floor, mix(shaped, floor, smooth(pr + RIVER.bank, pr + RIVER.bank + RIVER.fade, d)));
          if (d < pr + 1.5 && (Number.isNaN(water) || lv > water)) {
            water = lv;
            if (d < pr) {
              flowX *= 0.2;
              flowZ *= 0.2;
              flow *= 0.2;
            }
          }
          wet = Math.max(wet, smooth(pr + RIVER.bank + 1, pr, d));
        }
      }
    } else if (rv && !Number.isNaN(water) && Math.abs(rv.level - water) < 0.05 && rv.d < rv.w / 2) floor = Math.min(floor, rv.level - 0.06 - rv.depth * (1 - (rv.d / (rv.w / 2)) ** 2));
    const ad = adits.length ? aditAt(x, z) : null;
    if (ad) {
      const f = ad.f, along = ad.along, aw = smooth(f.r + 3.2, f.r - 0.3, ad.q) * smooth(-3, 5, along);
      if (aw > 0) {
        const y0 = aditFloor(f), t = clamp(along / f.len, 0, 1), y = y0 + 2.2 * smooth(0, 1, t) + (N(x / 1.3, z / 1.3, 44) - 0.5) * 0.18;
        floor = mix(floor, y, aw);
        ceiling = mix(ceiling, y + 4.6 + (N(x / 2.6, z / 2.6, 45) - 0.5) * 1.7 + (N(x / 0.9, z / 0.9, 47) - 0.5) * 0.4, aw);
      }
    }
    ceiling = Math.max(ceiling, floor + 3.2, Number.isNaN(water) ? -1e9 : water + 2.6);
    if (room && room.shaft) {
      const sh = room.shaft, d = Math.hypot(x - sh.x, z - sh.z), rr = sh.radius;
      if (d < rr + 2) {
        const top = shaftTop(room);
        ceiling = Math.max(ceiling, mix(ceiling, top + 1.5, smooth(rr + 1.1, rr - 0.4, d)));
      }
    }
    let meadow = 0;
    if (well) {
      const rr = well.radius;
      if (wd < rr + 2) ceiling = Math.max(ceiling, mix(ceiling, well.top + 1.5, smooth(rr + 1.1, rr - 0.4, wd)));
      const edge = rr + WELL.meadow * (0.75 + 0.5 * N(x / 9, z / 9, 48)) + (N(x / 3.5, z / 3.5, 49) - 0.5) * 3;
      meadow = smooth(edge, edge - 6, wd) * smooth(0.2, 1.4, c) * (Number.isNaN(water) ? 1 : smooth(0.3, -0.1, water - floor));
      moss = Math.max(moss, meadow);
    }
    let chasm = Infinity;
    for (let k = 0; k < chasms.length; k++) {
      const ch = chasms[k], d = Math.hypot(x - ch.x, z - ch.z);
      if (d > ch.r + 6) continue;
      const rr = ch.r + (N(x * 0.35, z * 0.35, 59) - 0.5) * 1.8;
      chasm = d - rr;
      if (d < rr + 0.2) {
        floor = mix(floor, floor - CHASM.depth, smooth(rr + 0.2, rr - 1.2, d));
        water = NaN;
        wet = 0;
        moss = 0;
      }
    }
    out.floor = floor;
    out.base = base;
    out.chasm = chasm;
    out.ceiling = ceiling;
    out.water = water;
    out.room = room ? room.id : -1;
    out.s = s;
    out.theme = room ? room.theme : null;
    out.c = c;
    out.wet = wet;
    out.moss = moss;
    out.flow = flow;
    out.flowX = flowX;
    out.flowZ = flowZ;
    out.meadow = meadow;
    out.well = well ? well.id : -1;
    out.river = rv ? rv.d - rv.w / 2 : Infinity;
    out.vault = room ? smooth(-0.25, 0.45, s) : 0;
    out.region = reg.a;
    out.regionB = reg.b;
    out.kind = reg.kindA;
    out.kindB = reg.kindB;
    out.blend = reg.w;
    return out;
  }
  function shaftTop(room) {
    let t = shaftTops.get(room.id);
    if (t === void 0) {
      const sh = room.shaft, reg = regionAt(sh.x, sh.z, {});
      t = bil(floorG, sh.x, sh.z) + bil(vaultG, sh.x, sh.z) + 34;
      shaftTops.set(room.id, t);
      void reg;
    }
    return t;
  }
  for (const r of shafts) r.shaft.top = shaftTop(r);
  for (const r of shafts) skyShafts.push({ x: r.shaft.x, z: r.shaft.z, radius: r.shaft.radius, top: r.shaft.top, room: r, well: null });
  for (const w of wells) skyShafts.push({ x: w.x, z: w.z, radius: w.radius, top: w.top, room: null, well: w });
  const S2 = {};
  const floorHeight = (x, z) => {
    const s = surfaces(x, z, S2);
    return deepLayer && s.water > s.floor ? Math.max(s.floor, s.water - LAVA_SINK) : s.floor;
  };
  const ceilingHeight = (x, z) => surfaces(x, z, S2).ceiling;
  function waterAt(x, z) {
    if (deepLayer) return null;
    const s = surfaces(x, z, S2);
    if (Number.isNaN(s.water) || s.water - s.floor < 0.025 || s.c < -0.2) return null;
    return { id: "underworld:" + (s.room >= 0 ? "room:" + s.room : "water"), kind: "pond", level: s.water, depth: s.water - s.floor };
  }
  function skyHole(x, z) {
    for (const r of shafts) {
      const d = Math.hypot(x - r.shaft.x, z - r.shaft.z);
      if (d < r.shaft.radius - 0.55) return r;
    }
    const wl = wellAt(x, z);
    return wl && wl.d < wl.w.radius - 0.55 ? wl.w : null;
  }
  const contains = (x, z, radius = 0.4) => clearance(x, z) >= radius;
  function segmentClear(a, b, radius = 0.5) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.65));
    for (let i = 0; i <= n; i++) if (!contains(mix(a.x, b.x, i / n), mix(a.z, b.z, i / n), radius)) return false;
    return true;
  }
  function resolveHorizontal(previous, desired, options = {}) {
    const radius = typeof options === "number" ? options : options.radius ?? 0.4;
    const feet = typeof options === "object" && Number.isFinite(options.feetY) ? options.feetY : null, stepUp = typeof options === "object" ? options.stepHeight ?? 0 : 0;
    const safe = Math.max(0.35, radius + 0.12), distance = Math.hypot(desired.x - previous.x, desired.z - previous.z);
    if (!Number.isFinite(distance)) return { x: previous.x, z: previous.z, blocked: true };
    const steps = Math.max(1, Math.ceil(distance / WALK.step));
    let x = previous.x, z = previous.z, blocked = false, y = floorHeight(x, z);
    const ok = (px, pz) => {
      if (!contains(px, pz, safe)) return false;
      const ny = floorHeight(px, pz);
      return ny - y <= WALK.rise * Math.max(0.05, Math.hypot(px - x, pz - z)) + 0.08 || feet !== null && ny <= feet + stepUp;
    };
    for (let i = 1; i <= steps; i++) {
      const nx2 = x + (desired.x - previous.x) / steps, nz2 = z + (desired.z - previous.z) / steps;
      if (ok(nx2, nz2)) {
        x = nx2;
        z = nz2;
        y = floorHeight(x, z);
        continue;
      }
      blocked = true;
      const h = 0.05, gx = clearance(x + h, z) - clearance(x - h, z), gz = clearance(x, z + h) - clearance(x, z - h);
      const l = Math.hypot(gx, gz), ix = l ? gx / l : 0, iz = l ? gz / l : 0, dx = nx2 - x, dz = nz2 - z, inward = dx * ix + dz * iz;
      const sx = nx2 - Math.min(0, inward) * ix, sz = nz2 - Math.min(0, inward) * iz;
      if (ok(sx, sz)) {
        x = sx;
        z = sz;
      } else if (ok(nx2, z)) x = nx2;
      else if (ok(x, nz2)) z = nz2;
      y = floorHeight(x, z);
    }
    return { x, z, blocked };
  }
  function findPath(from, to, radius = 0.6) {
    const ci = (x) => clamp(Math.round((x - x0) / G), 0, nx - 1), cj = (z) => clamp(Math.round((z - z0) / G), 0, nz - 1);
    if (clearance(from.x, from.z) < 0.25 || clearance(to.x, to.z) < 0.25) return [];
    if (segmentClear(from, to, radius)) return [{ x: to.x, z: to.z }];
    const need = radius + 2.5, si = ci(from.x), sj = cj(from.z), ti = ci(to.x), tj = cj(to.z);
    if (Math.abs(si - ti) + Math.abs(sj - tj) > 120) return [];
    const W = 140, ox = Math.min(si, ti) - 10, oz = Math.min(sj, tj) - 10, w = Math.max(si, ti) - ox + 11, h = Math.max(sj, tj) - oz + 11;
    if (w > W || h > W) return [];
    const cost = new Float32Array(w * h).fill(Infinity), prev = new Int32Array(w * h).fill(-1), open = [];
    const key = (i, j) => (j - oz) * w + (i - ox), passable = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && sd[j * nx + i] >= need;
    const push = (k, f) => {
      open.push([f, k]);
      let n = open.length - 1;
      while (n > 0) {
        const p = n - 1 >> 1;
        if (open[p][0] <= open[n][0]) break;
        [open[p], open[n]] = [open[n], open[p]];
        n = p;
      }
    };
    const pop = () => {
      const top = open[0], last = open.pop();
      if (open.length) {
        open[0] = last;
        let n = 0;
        for (; ; ) {
          const l = 2 * n + 1, r = l + 1;
          let m = n;
          if (l < open.length && open[l][0] < open[m][0]) m = l;
          if (r < open.length && open[r][0] < open[m][0]) m = r;
          if (m === n) break;
          [open[m], open[n]] = [open[n], open[m]];
          n = m;
        }
      }
      return top;
    };
    const start = key(si, sj);
    cost[start] = 0;
    push(start, 0);
    let end = -1, guard = 0;
    while (open.length && guard++ < 2e4) {
      const [, k] = pop(), i = k % w + ox, j = Math.floor(k / w) + oz;
      if (i === ti && j === tj) {
        end = k;
        break;
      }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < ox || jj < oz || ii >= ox + w || jj >= oz + h) continue;
        if (!passable(ii, jj) && !(ii === ti && jj === tj)) continue;
        const q = key(ii, jj), ng = cost[k] + (di && dj ? 1.414 : 1);
        if (ng < cost[q]) {
          cost[q] = ng;
          prev[q] = k;
          push(q, ng + Math.hypot(ti - ii, tj - jj));
        }
      }
    }
    if (end < 0) return [];
    const reverse = [{ x: to.x, z: to.z }];
    for (let k = prev[end]; k >= 0 && k !== start; k = prev[k]) reverse.push({ x: x0 + (k % w + ox) * G, z: z0 + (Math.floor(k / w) + oz) * G });
    reverse.reverse();
    const path = [];
    let anchor = from;
    for (let i = 0; i < reverse.length; ) {
      let next = i;
      while (next + 1 < reverse.length && segmentClear(anchor, reverse[next + 1], radius)) next++;
      path.push(reverse[next]);
      anchor = reverse[next];
      i = next + 1;
    }
    return path;
  }
  const noise = (x, z, channel = 0) => N(x, z, 20 + channel);
  const roomAt = (x, z) => {
    const s = siteAt(x, z);
    return s && s.s > -0.08 ? s.room : null;
  };
  function blockEmpty(bx0, bz0, size) {
    for (const f of aditFrames) if (f.maxX > bx0 && f.minX < bx0 + size && f.maxZ > bz0 && f.minZ < bz0 + size) return false;
    const i0 = clamp(Math.floor((bx0 - x0) / G) - 1, 0, nx - 1), i1 = clamp(Math.ceil((bx0 + size - x0) / G) + 1, 0, nx - 1), j0 = clamp(Math.floor((bz0 - z0) / G) - 1, 0, nz - 1), j1 = clamp(Math.ceil((bz0 + size - z0) / G) + 1, 0, nz - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (sd[j * nx + i] > -9) return false;
    return true;
  }
  return {
    data,
    rooms,
    chambers: rooms,
    tunnels: [],
    nodes: [],
    edges: [],
    bounds: data.bounds,
    entrances: adits.map(aditEntrance),
    adits,
    regions,
    pits: [],
    lavaAt(x, z) {
      if (!deepLayer) return null;
      const s = surfaces(x, z, S2);
      return Number.isNaN(s.water) || s.water - s.floor < 0.025 || s.c < -0.2 ? null : { level: s.water, depth: s.water - s.floor };
    },
    layer: deepLayer ? "deep" : "upper",
    chasms,
    point: (x, z) => ({ c: clearance(x, z) }),
    surfaces,
    clearance,
    openness,
    contains,
    floorHeight,
    ceilingHeight,
    waterAt,
    skyHole,
    segmentClear,
    resolveHorizontal,
    findPath,
    noise,
    roomAt,
    regionAt: (x, z) => regionAt(x, z, {}),
    nodesNear: () => [],
    elementsNear: (x, z) => bil(sd, x, z) > -12 ? 1 : 0,
    blockEmpty,
    siteFloor,
    waterLevel,
    rivers,
    riverFalls,
    riverPools,
    riverAt: (x, z) => riverAt(x, z, {}),
    fallBrink,
    arenas,
    inArena,
    wells,
    skyShafts,
    wellAt: (x, z) => {
      const wl = wellAt(x, z);
      return wl ? { well: wl.w, d: wl.d } : null;
    },
    stats: { ...data.stats }
  };
}
var ADIT_ALCOVE = 5.2;
function aditEntrance(a) {
  const u = ADIT_ALCOVE + 0.55;
  return { index: a.index, name: a.name, x: a.end.x - a.dir.x * u, z: a.end.z - a.dir.z * u, dir: { x: a.dir.x, z: a.dir.z }, alcove: ADIT_ALCOVE, width: 3.4, height: 4.4 };
}

// underworld-props.js
var TAU = Math.PI * 2;
function composeMatrix(out, o, px, py, pz, ex, ey, ez, sx, sy, sz) {
  const c1 = Math.cos(ex / 2), c2 = Math.cos(ey / 2), c3 = Math.cos(ez / 2), s1 = Math.sin(ex / 2), s2 = Math.sin(ey / 2), s3 = Math.sin(ez / 2);
  const x = s1 * c2 * c3 + c1 * s2 * s3, y = c1 * s2 * c3 - s1 * c2 * s3, z = c1 * c2 * s3 + s1 * s2 * c3, w = c1 * c2 * c3 - s1 * s2 * s3;
  const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  out[o] = (1 - (yy + zz)) * sx;
  out[o + 1] = (xy + wz) * sx;
  out[o + 2] = (xz - wy) * sx;
  out[o + 3] = 0;
  out[o + 4] = (xy - wz) * sy;
  out[o + 5] = (1 - (xx + zz)) * sy;
  out[o + 6] = (yz + wx) * sy;
  out[o + 7] = 0;
  out[o + 8] = (xz + wy) * sz;
  out[o + 9] = (yz - wx) * sz;
  out[o + 10] = (1 - (xx + yy)) * sz;
  out[o + 11] = 0;
  out[o + 12] = px;
  out[o + 13] = py;
  out[o + 14] = pz;
  out[o + 15] = 1;
}
function placeInRoom(field, room, salt, test, count, gap = 3) {
  const r = randomSource(hashString("things:" + salt, room.seed)), out = [];
  for (let k = 0; k < count * 14 && out.length < count; k++) {
    const a = r() * TAU, d = room.r * Math.sqrt(r()) * 0.95, x = room.x + Math.cos(a) * d, z = room.z + Math.sin(a) * d, s = field.surfaces(x, z);
    if (!test(s, x, z)) continue;
    if (field.inArena?.(x, z, 3)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < gap)) continue;
    out.push({ x, z, y: s.floor, s: { ...s } });
  }
  return out;
}
function giantMushrooms(field, room) {
  const r = randomSource(room.seed ^ 24301), count = Math.max(5, Math.min(12, Math.round(room.r / 4.2)));
  const spots = placeInRoom(field, room, "mush-giants", (s) => s.c > 1.6 && s.ceiling - s.floor > 3.4 && Number.isNaN(s.water), count, 5.5);
  const stems = [], caps = [[], []], glows = [];
  for (const spot of spots) {
    const blue = r() < 0.4, n = 1 + Math.floor(r() * 3.6);
    for (let k = 0; k < n; k++) {
      const a = r() * TAU, d = k ? 1.3 + r() * 2 : 0, x = spot.x + Math.cos(a) * d, z = spot.z + Math.sin(a) * d, s = field.surfaces(x, z);
      if (s.c < 1.1 || !Number.isNaN(s.water)) continue;
      const big = k ? 0.38 + r() * 0.42 : 0.8 + r() * 0.2, H = Math.min(s.ceiling - s.floor - 1.3, (2.4 + r() * 4.2) * big);
      if (H < 0.9) continue;
      const cap = (0.9 + H * 0.34 + r() * 1) * (k ? 0.85 : 1), flat = 0.3 + r() * 0.42, lean = 0.05 + r() * 0.2, la = r() * TAU, spin = r() * TAU, stem = 0.13 + H * 0.05;
      const m = new Float32Array(16);
      composeMatrix(m, 0, x, s.floor - 0.2, z, Math.cos(la) * lean, spin, Math.sin(la) * lean, stem, H + 0.2, stem);
      stems.push(m);
      const tx = m[4] + m[12], ty = m[5] + m[13], tz = m[6] + m[14];
      const c = new Float32Array(16);
      composeMatrix(c, 0, tx, ty - 0.06, tz, Math.cos(la) * lean * 0.7, spin, Math.sin(la) * lean * 0.7, cap, cap * flat, cap);
      caps[blue ? 1 : 0].push(c);
      glows.push({ x: tx, y: ty - 0.5, z: tz, color: blue ? 7314687 : 4186312, intensity: (k ? 18 : 40) + cap * (k ? 6 : 10), cap, kind: "mushroom" });
    }
  }
  return { kind: "mushroom", stems, caps, glows };
}
function giantCrystals(field, room) {
  const red = room.theme === "ember", r = randomSource(room.seed ^ 10794), spots = placeInRoom(field, room, "giants", (s) => s.c > 0.2 && (s.c < 1.6 || s.s < 0.4) && Number.isNaN(s.water), red ? 9 : 7);
  const prisms = [[], []], glows = [];
  for (const spot of spots) {
    const n = 3 + Math.floor(r() * 4), gx = field.clearance(spot.x + 0.3, spot.z) - field.clearance(spot.x - 0.3, spot.z), gz = field.clearance(spot.x, spot.z + 0.3) - field.clearance(spot.x, spot.z - 0.3), out = Math.atan2(gx, gz);
    for (let k = 0; k < n; k++) {
      const L = k ? 1.2 + r() * 2.2 : 2.6 + r() * 3.4, rad = L * (0.12 + r() * 0.06), lean = 0.25 + r() * 0.55, a = out + (r() - 0.5) * 1.4;
      const m = new Float32Array(16);
      composeMatrix(m, 0, spot.x + (r() - 0.5) * 0.8, spot.y - 0.3, spot.z + (r() - 0.5) * 0.8, Math.cos(a) * lean, r() * TAU, Math.sin(a) * lean, rad, L, rad);
      prisms[r() < 0.14 ? 1 : 0].push(m);
    }
    glows.push({ x: spot.x, y: spot.y + 1.6, z: spot.z, color: red ? 16738858 : 5813503, intensity: 85, kind: "crystal" });
  }
  return { kind: red ? "ember" : "crystal", prisms, glows, red };
}
var cache = /* @__PURE__ */ new WeakMap();
function roomProps(field, room) {
  if (room.theme !== "mushroom" && room.theme !== "crystal" && room.theme !== "ember") return null;
  let rooms = cache.get(field);
  if (!rooms) cache.set(field, rooms = /* @__PURE__ */ new Map());
  let p = rooms.get(room.id);
  if (!p) rooms.set(room.id, p = room.theme === "mushroom" ? giantMushrooms(field, room) : giantCrystals(field, room));
  return p;
}

// underworld-light.js
var GLOW = Object.freeze({ reach: 11, skyReach: 32, wellReach: 150 });
var clamp2 = (v, a, b) => v < a ? a : v > b ? b : v;
var smooth2 = (a, b, v) => {
  const t = clamp2((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function linearColor(hex) {
  const f = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [f(hex >> 16 & 255), f(hex >> 8 & 255), f(hex & 255)];
}
function latticeHash(seed) {
  return (i, j, c) => hash2(Math.floor(i), Math.floor(j), seed ^ Math.imul(c + 9, 625341585));
}
function lattice(h, cell, salt, xa, xb, za, zb, f) {
  for (let j = Math.ceil(za / cell); j * cell < zb; j++) for (let i = Math.ceil(xa / cell); i * cell < xb; i++)
    f((i + h(i, j, salt)) * cell, (j + h(j, i, salt + 1)) * cell, h(i + 7, j - 3, salt + 2), h(i - 5, j + 11, salt + 3), i, j);
}
function kindsIn(field, xa, xb, za, zb) {
  const out = /* @__PURE__ */ new Set(), R = {};
  for (let j = 0; j <= 3; j++) for (let i = 0; i <= 3; i++) {
    const r = field.regionAt(xa + (xb - xa) * i / 3, za + (zb - za) * j / 3, R);
    out.add(r.kindA);
    if (r.w > 0.02) out.add(r.kindB);
  }
  return out;
}
var THINGS = Object.freeze({ cell: 1.9, salt: 6 });
var dry = (s) => Number.isNaN(s.water) || s.water < s.floor - 0.05;
function glowThing(s, r1, r3 = 0) {
  if (s.c < 0.2 || r1 >= 0.55 || s.meadow > 0.2) return null;
  const site = s.vault > 0.3 ? s.theme : null, kind = r3 < s.blend ? s.kindB : s.kind;
  const rim = smooth2(0.55, 0.05, s.s);
  if (site === "crystal" && (s.c < 2.6 || r1 < 0.04 + 0.3 * rim)) return "crystal";
  if (site === "ember" && (s.c < 2.6 ? r1 < 0.5 : r1 < 0.04 + 0.28 * rim)) return "ember";
  if (site === "mushroom" && (s.c < 2.4 ? r1 < 0.5 : r1 < 0.06 + 0.3 * rim) && dry(s)) return "caps";
  if (kind === "sapphire" && s.c < 2.2 && r1 < 0.16) return "crystal";
  if (kind === "ember" && s.c < 2.2 && r1 < 0.15) return "ember";
  if (kind === "glowcap" && (s.c < 2.4 ? r1 < 0.3 : r1 < 0.05) && dry(s)) return "caps";
  if (kind === "verdant" && s.c > 0.4 && (s.c < 3 ? r1 < 0.13 : r1 < 0.022) && dry(s)) return "bulb";
  return null;
}
var THING_GLOW = { crystal: [0.75, 13, 8], ember: [0.75, 14, 8], caps: [0.35, 4, 3], bulb: [1, 5, 3] };
var VAULT_CRYSTALS = Object.freeze({ cell: 5.5, salt: 56 });
var vaultPatch = (seed, x, z) => valueNoise(x / 34, z / 34, seed ^ 1511506142);
function vaultCrystal(s, r1, r2, patch = 1) {
  if (s.c < 1.2) return null;
  const theme = s.vault > 0.35 ? s.theme : null, kind = s.kind, red = theme === "ember" || theme !== "crystal" && kind === "ember";
  const gather = smooth2(0.54, 0.76, patch);
  const p = theme === "crystal" || theme === "ember" ? 0.12 + 0.3 * gather : kind === "sapphire" ? 0.3 * gather : kind === "ember" ? 0.3 * gather : 0;
  const room = s.ceiling - s.floor;
  if (r1 > p || room < 6) return null;
  return { red, big: room > 18 && r2 > 0.55 };
}
var SPIRES = Object.freeze({ cell: 24, salt: 62 });
function crystalSpire(s, r1, r2) {
  if (s.c < 6 || s.meadow > 0) return null;
  const kind = s.kind, theme = s.vault > 0.35 ? s.theme : null, dry2 = Number.isNaN(s.water) || s.water < s.floor - 0.05;
  if (!(kind === "sapphire" || kind === "ember") || theme === "lake" || theme === "falls" || !dry2) return null;
  if (r1 > (kind === "sapphire" ? 0.38 : 0.28)) return null;
  const tall = Math.min((s.ceiling - s.floor) * 0.72, 6 + r2 * 17);
  if (tall < 4) return null;
  return { red: kind === "ember", tall };
}
var WORMS = Object.freeze({ cell: 3.2, salt: 23 });
var wormLight = (s, r1) => s.c > 0.3 && (s.vault > 0.5 && (s.theme === "lake" || s.theme === "falls") && r1 < 0.75 || s.kind === "abyss" && r1 < 0.3);
var wormRoom = (theme) => theme === "lake" || theme === "falls";
var LAVA_GLOW = Object.freeze({ cell: 9, salt: 91, intensity: Object.freeze([40, 22]) });
function createGlowBaker(field, seed) {
  const h = latticeHash(seed), S = {};
  function emitters(xa, xb, za, zb) {
    const out = [];
    const push = (x, y, z, hex, intensity) => {
      const c = linearColor(hex), k = intensity / Math.PI;
      out.push(x, y, z, c[0] * k, c[1] * k, c[2] * k, Math.min(GLOW.reach, Math.sqrt(intensity / 0.02)));
    };
    const kinds = kindsIn(field, xa, xb, za, zb);
    const near = field.rooms.filter((r) => r.x + r.r * 1.4 + 3 > xa && r.x - r.r * 1.4 - 3 < xb && r.z + r.r * 1.4 + 3 > za && r.z - r.r * 1.4 - 3 < zb);
    const things = kinds.has("sapphire") || kinds.has("ember") || kinds.has("glowcap") || kinds.has("verdant") || near.some((r) => r.theme === "crystal" || r.theme === "ember" || r.theme === "mushroom");
    if (things) lattice(h, THINGS.cell, THINGS.salt, xa - THINGS.cell, xb + THINGS.cell, za - THINGS.cell, zb + THINGS.cell, (x, z, r1, r2, i, j) => {
      if (r1 >= 0.55) return;
      const s = field.surfaces(x, z, S), t = glowThing(s, r1, h(i + 3, j + 5, THINGS.salt + 4));
      if (!t) return;
      const [up, base, more] = THING_GLOW[t];
      push(x, s.floor + up, z, t === "crystal" ? r2 < 0.8 ? 6273279 : 10127103 : t === "ember" ? 16738858 : t === "caps" ? 4186312 : 6094746, base + r2 * more);
    });
    if (kinds.has("sapphire") || kinds.has("ember") || near.some((r) => r.theme === "crystal" || r.theme === "ember")) {
      const V = VAULT_CRYSTALS, P = SPIRES;
      lattice(h, V.cell, V.salt, xa - V.cell, xb + V.cell, za - V.cell, zb + V.cell, (x, z, r1, r2) => {
        if (r1 > 0.6) return;
        const s = field.surfaces(x, z, S), v = vaultCrystal(s, r1, r2, vaultPatch(seed, x, z));
        if (!v) return;
        push(x, s.ceiling - (v.big ? 3 : 1.2), z, v.red ? 16738858 : 6273279, v.big ? 30 : 12);
      });
      lattice(h, P.cell, P.salt, xa - P.cell, xb + P.cell, za - P.cell, zb + P.cell, (x, z, r1, r2) => {
        if (r1 > 0.38) return;
        const s = field.surfaces(x, z, S), v = crystalSpire(s, r1, r2);
        if (!v) return;
        push(x, s.floor + Math.min(v.tall * 0.4, 8), z, v.red ? 16738858 : 7322879, 70);
      });
    }
    if (field.layer === "deep") lattice(h, LAVA_GLOW.cell, LAVA_GLOW.salt, xa - LAVA_GLOW.cell, xb + LAVA_GLOW.cell, za - LAVA_GLOW.cell, zb + LAVA_GLOW.cell, (x, z, r1) => {
      const s = field.surfaces(x, z, S);
      if (Number.isNaN(s.water) || s.water - s.floor < 0.05) return;
      push(x, s.water + 1.4, z, 16733208, LAVA_GLOW.intensity[0] + r1 * LAVA_GLOW.intensity[1]);
    });
    for (const room of near) for (const il of room.water?.islets || []) for (let q = 0; q < (il.heart ? 3 : 2); q++) {
      const a = room.seed % 89 * 0.51 + q * 2.1 + 1, cx = il.x + Math.cos(a) * il.r * 0.48, cz = il.z + Math.sin(a) * il.r * 0.48;
      push(cx, field.floorHeight(cx, cz) + 1.6, cz, 6273279, il.heart ? 95 : 70);
    }
    if (kinds.has("abyss") || field.layer !== "deep" && near.some((r) => wormRoom(r.theme))) lattice(h, WORMS.cell, WORMS.salt, xa - WORMS.cell, xb + WORMS.cell, za - WORMS.cell, zb + WORMS.cell, (x, z, r1) => {
      if (r1 >= 0.75) return;
      const s = field.surfaces(x, z, S);
      if (wormLight(s, r1)) push(x, s.ceiling - 2.6, z, 5822152, 9);
    });
    for (const room of near) {
      const p = roomProps(field, room);
      if (!p) continue;
      for (const g of p.glows) if (g.x > xa - GLOW.reach && g.x < xb + GLOW.reach && g.z > za - GLOW.reach && g.z < zb + GLOW.reach) push(g.x, g.y, g.z, g.color, g.intensity);
    }
    return out.length ? Float32Array.from(out) : null;
  }
  function skies(xa, xb, za, zb) {
    const out = [], R = GLOW.skyReach;
    for (const s of field.skyShafts || field.rooms.filter((r) => r.shaft).map((r) => ({ ...r.shaft, room: r, well: null }))) {
      const room = s.room, well = s.well;
      const cx = room ? room.x : s.x, cz = room ? room.z : s.z, r = room ? room.r : s.radius + 10, reach = r + 6;
      if (cx > xa - reach && cx < xb + reach && cz > za - reach && cz < zb + reach) out.push({ kind: "ambient", x: cx, z: cz, r, k: well ? 0.16 : 0.07 });
      const SR = well ? GLOW.wellReach : R;
      if (s.x < xa - SR || s.x > xb + SR || s.z < za - SR || s.z > zb + SR) continue;
      let foot = Infinity;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        foot = Math.min(foot, field.surfaces(s.x + Math.cos(a) * (s.radius + 1.6), s.z + Math.sin(a) * (s.radius + 1.6), S).ceiling);
      }
      out.push({ kind: "shaft", x: s.x, z: s.z, top: s.top + 1.5, foot, hole: s.radius - 0.55, tube: s.radius + 0.2, reach: SR });
      out.push({ kind: "bounce", x: s.x, y: field.surfaces(s.x, s.z, S).floor + 0.3, z: s.z, radius: (s.radius - 0.55) * 3, k: 0.8, reach: SR });
    }
    for (const e of field.entrances || []) {
      const u = e.alcove + 0.55, x = e.x + e.dir.x * u, z = e.z + e.dir.z * u;
      if (x < xa - R || x > xb + R || z < za - R || z > zb + R) continue;
      out.push({ kind: "mouth", x, y: field.surfaces(x, z, S).floor + e.height * 0.45, z, nx: e.dir.x, nz: e.dir.z, radius: Math.min(e.width, e.height * 0.5) });
    }
    return out;
  }
  function clearanceGrid(xa, za, w, d) {
    const nx = Math.ceil(w) + 2, nz = Math.ceil(d) + 2, g = new Float32Array(nx * nz).fill(NaN);
    const at = (i, j) => {
      if (i < 0 || j < 0 || i >= nx || j >= nz) return field.clearance(xa + i, za + j);
      const k = j * nx + i;
      let v = g[k];
      if (v !== v) v = g[k] = field.clearance(xa + i, za + j);
      return v;
    };
    return (x, z) => {
      const fx = x - xa, fz = z - za, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
    };
  }
  function openness(clear, ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = d < 2.5 ? 1 : d < 7 ? 2 : d < 14 ? 3 : 5;
    let o = 1;
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      o *= smooth2(-0.75, 0.1, clear(ax + (bx - ax) * t, az + (bz - az) * t));
      if (o < 0.02) return 0;
    }
    return o;
  }
  function prepare(xa, xb, za, zb) {
    const E = emitters(xa - GLOW.reach, xb + GLOW.reach, za - GLOW.reach, zb + GLOW.reach), ways = skies(xa, xb, za, zb);
    if (!E && !ways.length) return null;
    let buckets = null, bx0 = 0, bz0 = 0, bnx = 0, bnz = 0;
    if (E) {
      bx0 = xa - GLOW.reach;
      bz0 = za - GLOW.reach;
      bnx = Math.ceil((xb - xa + 2 * GLOW.reach) / 6) + 1;
      bnz = Math.ceil((zb - za + 2 * GLOW.reach) / 6) + 1;
      buckets = Array.from({ length: bnx * bnz }, () => []);
      for (let k = 0; k < E.length; k += 7) {
        const i = clamp2(Math.floor((E[k] - bx0) / 6), 0, bnx - 1), j = clamp2(Math.floor((E[k + 2] - bz0) / 6), 0, bnz - 1);
        buckets[j * bnx + i].push(k);
      }
    }
    const m = GLOW.skyReach * 0.8, clear = clearanceGrid(xa - m, za - m, xb - xa + 2 * m, zb - za + 2 * m), SR2 = GLOW.skyReach * GLOW.skyReach;
    function at(px, py, pz, nx, ny, nz, out, o) {
      let r = 0, g = 0, b = 0, share = 0;
      const directional = nx !== void 0;
      if (buckets) {
        const i0 = clamp2(Math.floor((px - GLOW.reach - bx0) / 6), 0, bnx - 1), i1 = clamp2(Math.floor((px + GLOW.reach - bx0) / 6), 0, bnx - 1), j0 = clamp2(Math.floor((pz - GLOW.reach - bz0) / 6), 0, bnz - 1), j1 = clamp2(Math.floor((pz + GLOW.reach - bz0) / 6), 0, bnz - 1);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const k of buckets[j * bnx + i]) {
          const dx = E[k] - px, dy = E[k + 1] - py, dz = E[k + 2] - pz, d2 = dx * dx + dy * dy + dz * dz, R = E[k + 6];
          if (d2 > R * R) continue;
          const d = Math.sqrt(d2) || 1e-3;
          let w = 0.7;
          if (directional) {
            w = ((nx * dx + ny * dy + nz * dz) / d + 0.12) / 1.12;
            if (w <= 0) continue;
          }
          const q = d2 / (R * R), win = (1 - q * q) * (1 - q * q);
          const open = d > 1.4 ? openness(clear, px, pz, E[k], E[k + 2]) : 1;
          if (open <= 0) continue;
          const f = w * win * open / Math.max(d2, 1.1);
          r += E[k + 3] * f;
          g += E[k + 4] * f;
          b += E[k + 5] * f;
        }
      }
      for (const s of ways) {
        if (s.kind === "shaft") {
          const dx = s.x - px, dz = s.z - pz, dy = s.top - py;
          if (dy < 0.3) continue;
          const d2 = dx * dx + dy * dy + dz * dz, SR22 = s.reach * s.reach;
          if (d2 > SR22) continue;
          const d = Math.sqrt(d2), cosV = directional ? (nx * dx + ny * dy + nz * dz) / d : 0.8;
          if (cosV <= 0) continue;
          const rho = Math.hypot(dx, dz), ub = py >= s.foot ? 0 : (s.foot - py) / dy, vis = smooth2(s.tube + 0.5, s.tube - 1.6, (1 - ub) * rho);
          if (vis <= 0) continue;
          const open = rho > 1.5 ? openness(clear, px, pz, s.x, s.z) : 1, q = d2 / SR22, A = s.hole * s.hole * 3.6;
          share += A * cosV * (dy / d) / (d2 + A) * vis * open * (1 - q * q);
        } else if (s.kind === "ambient") {
          share += s.k * smooth2(s.r + 6, s.r * 0.4, Math.hypot(px - s.x, pz - s.z));
        } else if (s.kind === "bounce") {
          const dx = s.x - px, dy = s.y - py, dz = s.z - pz, d2 = dx * dx + dy * dy + dz * dz, SR22 = s.reach * s.reach;
          if (d2 > SR22 || dy > -0.2) continue;
          const d = Math.sqrt(d2), cosV = directional ? (nx * dx + ny * dy + nz * dz) / d : 0.8;
          if (cosV <= 0) continue;
          const rho = Math.hypot(dx, dz), open = rho > 1.5 ? openness(clear, px, pz, s.x, s.z) : 1, q = d2 / SR22, A = s.radius * s.radius;
          share += s.k * A * cosV * (-dy / d) / (d2 + A) * open * (1 - q * q);
        } else {
          const dx = px - s.x, dy = py - s.y, dz = pz - s.z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > SR2) continue;
          const d = Math.sqrt(d2) || 1e-3, cosM = (dx * s.nx + dz * s.nz) / d;
          if (cosM <= 0) continue;
          const cosV = directional ? -(nx * dx + ny * dy + nz * dz) / d : 0.8;
          if (cosV <= 0) continue;
          const open = d > 1.5 ? openness(clear, px, pz, s.x, s.z) : 1, q = d2 / SR2;
          share += s.radius * s.radius * cosV * cosM / (d2 + s.radius * s.radius) * open * (1 - q * q);
        }
      }
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = Math.min(1, share);
    }
    return { at, emitters: E ? E.length / 7 : 0, skies: ways.length };
  }
  return { prepare, emitters, skies };
}
function packGlow(out, o, r, g, b, sky) {
  out[o] = Math.min(255.99, r) + 256 * Math.round(clamp2(sky, 0, 1) * 255);
  out[o + 1] = g;
  out[o + 2] = b;
}

// underworld-mesh.js
var clamp3 = (v, a, b) => v < a ? a : v > b ? b : v;
var mix2 = (a, b, t) => a + (b - a) * t;
var smooth3 = (a, b, v) => {
  const t = clamp3((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
var TAU2 = Math.PI * 2;
var BED_GLOW = Object.freeze({ abyss: [0.08, 0.62, 0.55], glowcap: [0.12, 0.5, 0.85], sapphire: [0.22, 0.34, 0.95], verdant: [0.16, 0.7, 0.32], ember: [0.8, 0.3, 0.06] });
var ARENA_CLEAR = /* @__PURE__ */ new Set(["boulder", "oreCopper", "oreIron", "stalagmite", "crystalA", "crystalB", "crystalR", "mushStem", "mushCap", "flowstone", "column"]);
var GIANT_HANG = Object.freeze({
  cell: 34,
  salt: 61,
  room: 30,
  clear: 8,
  shortest: 14,
  longest: 44,
  themes: Object.freeze({ karst: 0.34, hall: 0.34, lake: 0.25, falls: 0.25, grotto: 0.25, crystal: 0.12, ruins: 0.12, ember: 0.12, skylight: 0.04, mushroom: 0.04, roots: 0.04 }),
  kinds: Object.freeze({ stone: 0.26, abyss: 0.2, ruins: 0.13, ember: 0.11, sapphire: 0.1, glowcap: 0.06, verdant: 0.04 })
});
var SELF_LIT = /* @__PURE__ */ new Set(["crystalA", "crystalB", "crystalR", "mushSmall", "bulb", "glowFern", "strand", "reed", "tuftGlow", "crystalFlower", "emberFern"]);
var MEADOW_KINDS = Object.freeze({ fern: "iFern", trees: Object.freeze(Array.from({ length: 10 }, (_, i) => "iTree" + i)) });
var META_KINDS = /* @__PURE__ */ new Set([MEADOW_KINDS.fern, ...MEADOW_KINDS.trees]);
var FERN_TINTS = Object.freeze([[0.846, 0.905, 0.708], [1, 1, 0.913], [0.97, 0.99, 0.86]]);
var TREE_TINTS = Object.freeze({ broadleaf: [1.08, 1.12, 0.88], pine: [1, 1.04, 0.96], thicket: [0.9, 1, 0.84] });
var ORE = Object.freeze({ cell: 7.5, copper: 0.07, iron: 0.085 });
var LAVA = Object.freeze({ lightCell: 22 });
var ORE_DARK = Object.freeze({ abyss: 1, stone: 0.85, ruins: 1, ember: 0.6, bones: 1 });
var BLOCK = Object.freeze({ size: 64, step: 1, walls: 9, apron: 1 });
var REGION_LOOK = Object.freeze({
  verdant: Object.freeze({ rock: [0.9, 1.04, 0.88], vault: [0.82, 0.95, 0.84], lichen: [0.14, 0.95, 0.42], amount: 0.34, vein: 0 }),
  glowcap: Object.freeze({ rock: [0.84, 0.9, 1.02], vault: [0.78, 0.86, 1], lichen: [0.1, 0.72, 1], amount: 0.28, vein: 0 }),
  sapphire: Object.freeze({ rock: [0.8, 0.88, 1.14], vault: [0.74, 0.84, 1.12], lichen: [0.22, 0.48, 1.3], amount: 0.2, vein: 0.5 }),
  ember: Object.freeze({ rock: [1.14, 0.82, 0.72], vault: [1, 0.76, 0.7], lichen: [1.45, 0.36, 0.07], amount: 0.38, vein: 1 }),
  abyss: Object.freeze({ rock: [0.72, 0.8, 0.92], vault: [0.68, 0.76, 0.9], lichen: [0.18, 0.6, 0.95], amount: 0.08, vein: 0 }),
  ruins: Object.freeze({ rock: [1.08, 1.03, 0.95], vault: [1, 0.97, 0.92], lichen: [0.85, 0.78, 0.32], amount: 0.06, vein: 0 }),
  stone: Object.freeze({ rock: [1.28, 1.18, 1.03], vault: [1.16, 1.08, 0.97], lichen: [0.45, 0.82, 0.7], amount: 0.04, vein: 0 })
});
var SITE_TINT = {
  karst: [1.2, 1.12, 1],
  lake: [0.86, 0.95, 1.02],
  falls: [0.9, 1, 1.03],
  skylight: [1.02, 1, 0.9],
  crystal: [0.8, 0.86, 1.12],
  ember: [1.08, 0.82, 0.74],
  mushroom: [0.96, 0.88, 1.02],
  ruins: [1.06, 1.02, 0.97],
  roots: [0.98, 0.86, 0.72],
  hall: [1.02, 0.99, 0.95],
  grotto: [0.9, 0.9, 0.93]
};
var SITE_LICHEN = { mushroom: 0.35, skylight: 0.2, lake: 0.12, crystal: 0.1, ember: 0.2 };
function growF(size = 4096) {
  let a = new Float32Array(size), n = 0;
  return { push(...v) {
    if (n + v.length > a.length) {
      const b = new Float32Array(Math.max(a.length * 2, n + v.length));
      b.set(a);
      a = b;
    }
    for (const x of v) a[n++] = x;
  }, get length() {
    return n;
  }, view() {
    return a.subarray(0, n);
  }, at(i) {
    return a[i];
  }, set(i, v) {
    a[i] = v;
  } };
}
function growU(size = 4096) {
  let a = new Uint32Array(size), n = 0;
  return { push(...v) {
    if (n + v.length > a.length) {
      const b = new Uint32Array(Math.max(a.length * 2, n + v.length));
      b.set(a);
      a = b;
    }
    for (const x of v) a[n++] = x;
  }, get length() {
    return n;
  }, view() {
    return a.subarray(0, n);
  } };
}
var bakers = /* @__PURE__ */ new WeakMap();
function bakerOf(field) {
  let b = bakers.get(field);
  if (!b) bakers.set(field, b = createGlowBaker(field, field.data.planSeed >>> 0));
  return b;
}
function buildUnderworldBlock(field, bx, bz, options = {}) {
  const size = options.size ?? BLOCK.size, step = options.step ?? BLOCK.step, walls = options.walls ?? BLOCK.walls, A = BLOCK.apron;
  const started = typeof performance !== "undefined" ? performance.now() : 0;
  const n = Math.round(size / step), W = n + 2 * A + 1, x0 = bx * size, z0 = bz * size;
  const out = { key: bx + "," + bz, bx, bz, empty: true, shell: null, water: null, inst: {}, lights: [], sounds: [], glow: null, stats: {} };
  if (field.blockEmpty(x0 - 4, z0 - 4, size + 8)) return out;
  const seed = field.data.planSeed >>> 0, N = (x, z, c) => valueNoise(x, z, seed ^ Math.imul(c + 101, 1013904223));
  const gxOf = (i) => x0 + (i - A) * step, gzOf = (j) => z0 + (j - A) * step;
  const C = new Float32Array(W * W);
  let any = false;
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const c = field.clearance(gxOf(i), gzOf(j));
    C[j * W + i] = c;
    if (c >= 0) any = true;
  }
  if (!any) return out;
  out.empty = false;
  const kinds = kindsIn(field, x0 - 6, x0 + size + 6, z0 - 6, z0 + size + 6);
  const vx = growF(), vz = growF(), vfy = growF(), vcy = growF(), vcol = growF(), vccol = growF(), vtint = growF(), vlich = growF(), vfe = growF(), vce = growF();
  const pointId = new Int32Array(W * W).fill(-1), edgeId = new Int32Array(W * W * 3).fill(-1);
  const S = {};
  function makeVertex(x, z) {
    const s = field.surfaces(x, z, S), id = vx.length;
    vx.push(x);
    vz.push(z);
    vfy.push(s.floor - 0.012);
    vcy.push(s.ceiling);
    const la = REGION_LOOK[s.kind] || REGION_LOOK.stone, lb = REGION_LOOK[s.kindB] || la, wB = s.blend;
    const theme = s.theme && s.vault > 0.02 ? s.theme : null, st = SITE_TINT[theme] || null, w = theme ? Math.min(1, s.vault * 1.2) : 0;
    let tr = mix2(la.rock[0], lb.rock[0], wB), tg = mix2(la.rock[1], lb.rock[1], wB), tb = mix2(la.rock[2], lb.rock[2], wB);
    if (st) {
      tr = mix2(tr, tr * st[0], w);
      tg = mix2(tg, tg * st[1], w);
      tb = mix2(tb, tb * st[2], w);
    }
    const c = Math.max(0, s.c), shade = 0.5 + 0.5 * smooth3(0, 2.6, c), n1 = N(x * 0.35, z * 0.35, 13);
    let r = tr * shade * (0.9 + n1 * 0.14), g = tg * shade * (0.9 + n1 * 0.12), b = tb * shade * (0.9 + n1 * 0.1);
    const wet = Math.max(s.wet, Number.isNaN(s.water) ? 0 : smooth3(0.6, -0.2, s.floor - s.water));
    r *= 1 - 0.35 * wet;
    g *= 1 - 0.3 * wet;
    b *= 1 - 0.22 * wet;
    const verdant = (s.kind === "verdant" ? 1 - wB : 0) + (s.kindB === "verdant" ? wB : 0);
    const moss = Math.max(s.moss, verdant * 0.55 * smooth3(0.35, 0.7, N(x * 0.09, z * 0.09, 18)));
    if (moss > 0) {
      const m = Math.min(1, moss * (0.55 + 0.7 * smooth3(0.25, 0.6, N(x * 0.4, z * 0.4, 14) * 0.6 + moss * 0.5)));
      r = mix2(r, 0.48, m);
      g = mix2(g, 1.02, m);
      b = mix2(b, 0.34, m);
    }
    if (s.meadow > 0) {
      const m = smooth3(0, 0.6, s.meadow), straw = smooth3(0.35, 0.75, N(x / 5, z / 5, 24)) * 0.5, n2 = 0.85 + 0.3 * N(x * 0.7, z * 0.7, 25);
      r = mix2(r, mix2(0.5, 0.95, straw) * n2, m);
      g = mix2(g, mix2(0.95, 0.9, straw) * n2, m);
      b = mix2(b, mix2(0.26, 0.36, straw) * n2, m);
    }
    if (theme === "mushroom") {
      const m = w * smooth3(0.55, 0.75, N(x * 0.3, z * 0.3, 15));
      r = mix2(r, 1.25, m * 0.6);
      g = mix2(g, 1.18, m * 0.6);
      b = mix2(b, 1.1, m * 0.6);
    }
    vcol.push(r, g, b);
    const vr = mix2(la.vault[0], lb.vault[0], wB), vg = mix2(la.vault[1], lb.vault[1], wB), vb = mix2(la.vault[2], lb.vault[2], wB);
    const cs = 0.62 + 0.3 * N(x * 0.5, z * 0.5, 16), lift = theme === "lake" && s.vault > 0.3 ? 0.85 : 1;
    vccol.push(vr * cs * lift, vg * cs * lift, vb * cs * lift);
    vtint.push(tr, tg, tb, wet);
    const amount = mix2(la.amount, lb.amount, wB) + (theme ? (SITE_LICHEN[theme] || 0) * w : 0);
    const patch = smooth3(0.38, 0.72, N(x / 7.5, z / 7.5, 19)) * (0.55 + 0.45 * N(x / 2.2, z / 2.2, 20));
    const L = amount * patch, lr = mix2(la.lichen[0], lb.lichen[0], wB) * L, lg = mix2(la.lichen[1], lb.lichen[1], wB) * L, lb2 = mix2(la.lichen[2], lb.lichen[2], wB) * L, vein = mix2(la.vein, lb.vein, wB);
    vlich.push(lr, lg, lb2, vein);
    const dry2 = Number.isNaN(s.water) ? 1 : smooth3(0.05, 0.5, s.floor - s.water);
    const ff = (0.05 + 0.95 * smooth3(4, 0.5, c) + moss * 0.1) * dry2 * (vein > 0.5 ? 0.55 : 1);
    const bed = Number.isNaN(s.water) ? null : BED_GLOW[s.kind], deep = bed ? smooth3(0.15, 1.4, s.water - s.floor) : 0;
    if (deep > 0) {
      const k = deep * (0.25 + 0.75 * smooth3(0.35, 0.7, N(x / 4.5, z / 4.5, 22))) * (0.6 + 0.4 * N(x * 0.7, z * 0.7, 23));
      vfe.push(lr * ff + bed[0] * k, lg * ff + bed[1] * k, lb2 * ff + bed[2] * k, 0);
    } else vfe.push(lr * ff, lg * ff, lb2 * ff, vein);
    const cf = (0.3 + 0.5 * verdant) * (0.4 + 0.6 * smooth3(0.3, 0.7, N(x / 11, z / 11, 21)));
    vce.push(lr * cf, lg * cf, lb2 * cf, vein);
    return id;
  }
  function gridVertex(p) {
    if (pointId[p] < 0) pointId[p] = makeVertex(gxOf(p % W), gzOf(Math.floor(p / W)));
    return pointId[p];
  }
  function edgeVertex(p, q) {
    if (p > q) {
      const t2 = p;
      p = q;
      q = t2;
    }
    const d = q - p, dir = d === 1 ? 0 : d === W ? 1 : 2, key = p * 3 + dir;
    if (edgeId[key] >= 0) return edgeId[key];
    let pa = p, pb = q;
    if (C[pa] < 0) {
      pa = q;
      pb = p;
    }
    let ax = gxOf(pa % W), az = gzOf(Math.floor(pa / W)), bxx = gxOf(pb % W), bzz = gzOf(Math.floor(pb / W)), fa = C[pa], fb = C[pb];
    for (let k = 0; k < 3; k++) {
      const mx = (ax + bxx) / 2, mz = (az + bzz) / 2, f = field.clearance(mx, mz);
      if (f >= 0) {
        ax = mx;
        az = mz;
        fa = f;
      } else {
        bxx = mx;
        bzz = mz;
        fb = f;
      }
    }
    const t = fa / (fa - fb), id = makeVertex(mix2(ax, bxx, t), mix2(az, bzz, t));
    edgeId[key] = id;
    return id;
  }
  const floorTris = growU(), floorInner = [], boundary = [];
  function clipTriangle(ids, inner2) {
    const poly = [];
    let entering = -1, leaving = -1;
    for (let k = 0; k < 3; k++) {
      const a = ids[k], b = ids[(k + 1) % 3], ai = C[a] >= 0, bi = C[b] >= 0;
      if (ai) poly.push(gridVertex(a));
      if (ai !== bi) {
        const v = edgeVertex(a, b);
        poly.push(v);
        if (ai) leaving = v;
        else entering = v;
      }
    }
    for (let k = 1; k < poly.length - 1; k++) {
      floorTris.push(poly[0], poly[k], poly[k + 1]);
      floorInner.push(inner2);
    }
    if (entering >= 0 && leaving >= 0) boundary.push([entering, leaving, inner2]);
  }
  for (let j = 0; j < W - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    if (C[a] < 0 && C[b] < 0 && C[c] < 0 && C[d] < 0) continue;
    const inner2 = i >= A && i < A + n && j >= A && j < A + n ? 1 : 0;
    clipTriangle([a, c, b], inner2);
    clipTriangle([b, c, d], inner2);
  }
  const V = vx.length;
  const frames = /* @__PURE__ */ new Map();
  function rockNoise(x, y, z, ch) {
    const iy = Math.floor(y), fy = y - iy, t = fy * fy * (3 - 2 * fy), sa = seed ^ Math.imul(ch + 71, 1013904223);
    return mix2(valueNoise(x, z, sa ^ Math.imul(iy, 73244475)), valueNoise(x, z, sa ^ Math.imul(iy + 1, 73244475)), t);
  }
  function frame(v) {
    let f = frames.get(v);
    if (f) return f;
    const x = vx.at(v), z = vz.at(v), h2 = 0.09;
    const grad = (px, pz) => {
      const gx = field.clearance(px + h2, pz) - field.clearance(px - h2, pz), gz = field.clearance(px, pz + h2) - field.clearance(px, pz - h2), l = Math.hypot(gx, gz) || 1;
      return [gx / l, gz / l];
    };
    const g = grad(x, z), tx = -g[1], tz = g[0], e = 0.2, gp = grad(x + tx * e, z + tz * e), gm = grad(x - tx * e, z - tz * e);
    const curvature = ((gp[0] - gm[0]) * tx + (gp[1] - gm[1]) * tz) / (2 * e);
    let reach = 2.6, prev = field.clearance(x, z);
    for (let d = 0.2; d <= 2.6; d += 0.2) {
      const c = field.clearance(x - g[0] * d, z - g[1] * d);
      if (c > prev - 0.04) {
        reach = Math.max(0, d - 0.2) * 0.45;
        break;
      }
      prev = c;
    }
    const levels = [0];
    let hsum = 0;
    for (let k = 0; k < walls; k++) {
      hsum += 0.45 + rockNoise(x * 0.31, k * 0.71, z * 0.31, 0) * 1.4;
      levels.push(hsum);
    }
    const skew = (N(x * 0.16, z * 0.16, 78) - 0.5) * 1.5;
    for (let k = 1; k < walls; k++) {
      const t = levels[k] / hsum;
      levels[k] = t + skew * t * (1 - t);
    }
    levels[walls] = 1;
    f = { nx: g[0], nz: g[1], levels, relief: Math.min(reach, curvature > 1e-3 ? 0.3 / curvature : Infinity, 1.35) };
    frames.set(v, f);
    return f;
  }
  const wx = growF(), wy = growF(), wz = growF(), wcol = growF(), wemit = growF(), wallIds = /* @__PURE__ */ new Map(), wallTris = growU(), wallInner = [];
  function wallVertex(v, level) {
    if (level === 0) return v;
    if (level === walls) return V + v;
    const key = v * 16 + level;
    let id = wallIds.get(key);
    if (id !== void 0) return id;
    const f = frame(v), x = vx.at(v), z = vz.at(v), fy = vfy.at(v), cy2 = vcy.at(v), t = f.levels[level], y = mix2(fy, cy2, t);
    const mass = rockNoise(x * 0.21, y * 0.2, z * 0.21, 1), knob = rockNoise(x * 0.63, y * 0.58, z * 0.63, 3), joints = rockNoise(x * 0.83 + y * 0.13, y * 0.78, z * 0.83 - y * 0.09, 2);
    const shape = 0.12 + mass * 0.62 + knob * 0.2 + joints * 0.12;
    const relief = 4 * t * (1 - t) * Math.min(f.relief, f.relief * shape + 0.05);
    id = 2 * V + wx.length;
    wx.push(x - f.nx * relief);
    wy.push(y);
    wz.push(z - f.nz * relief);
    const sh = 0.5 + Math.sin(t * Math.PI) * 0.26, nn = N(x * 0.26 + t, z * 0.26 - t, 17), k4 = v * 4, wet = vtint.at(k4 + 3) * (1 - smooth3(0.05, 0.4, t));
    const dark = (1 - 0.35 * wet) * sh * (0.86 + nn * 0.16) * (0.9 + 0.2 * knob);
    wcol.push(vtint.at(k4) * dark, vtint.at(k4 + 1) * dark * (1 + 0.04 * wet), vtint.at(k4 + 2) * dark * (1 + 0.08 * wet));
    const lf = (0.5 + 0.7 * smooth3(0.35, 0, t) + 0.4 * smooth3(0.6, 0.1, shape)) * (1 - 0.55 * smooth3(0.5, 0.95, t));
    wemit.push(vlich.at(k4) * lf, vlich.at(k4 + 1) * lf, vlich.at(k4 + 2) * lf, vlich.at(k4 + 3));
    wallIds.set(key, id);
    return id;
  }
  for (const [a, b, inner2] of boundary) for (let level = 0; level < walls; level++) {
    const aa = wallVertex(a, level), ab = wallVertex(b, level), ba = wallVertex(a, level + 1), bb = wallVertex(b, level + 1);
    wallTris.push(aa, ab, ba, ab, bb, ba);
    wallInner.push(inner2, inner2);
  }
  const holes = [];
  for (const sh of field.skyShafts || (field.rooms || []).map((room) => room.shaft).filter(Boolean)) {
    if (sh.x > x0 - sh.radius - 2 && sh.x < x0 + size + sh.radius + 2 && sh.z > z0 - sh.radius - 2 && sh.z < z0 + size + sh.radius + 2) holes.push(sh);
  }
  const holeD = (x, z) => {
    let d = Infinity;
    for (const sh of holes) d = Math.min(d, Math.hypot(x - sh.x, z - sh.z) - (sh.radius - 0.55));
    return d;
  };
  const cutBase = 2 * V + wx.length, cx = growF(), cy = growF(), cz = growF(), ccol = growF(), cemit = growF(), cuts = /* @__PURE__ */ new Map();
  function cutVertex(a, b) {
    const key = a < b ? a * 1048576 + b : b * 1048576 + a;
    let id = cuts.get(key);
    if (id !== void 0) return id;
    const ax = vx.at(a), az = vz.at(a), bxx = vx.at(b), bzz = vz.at(b), outside = holeD(ax, az) >= 0;
    let ta = 0, tb = 1;
    for (let k = 0; k < 12; k++) {
      const t2 = (ta + tb) / 2;
      if (holeD(mix2(ax, bxx, t2), mix2(az, bzz, t2)) >= 0 === outside) ta = t2;
      else tb = t2;
    }
    const t = (ta + tb) / 2, x = mix2(ax, bxx, t), z = mix2(az, bzz, t);
    id = cutBase + cx.length;
    cx.push(x);
    cy.push(field.surfaces(x, z, S).ceiling);
    cz.push(z);
    for (let c = 0; c < 3; c++) ccol.push(mix2(vccol.at(a * 3 + c), vccol.at(b * 3 + c), t));
    for (let c = 0; c < 4; c++) cemit.push(mix2(vce.at(a * 4 + c), vce.at(b * 4 + c), t));
    cuts.set(key, id);
    return id;
  }
  const tris = [], inner = [];
  function vault(ids, inn) {
    if (!holes.length) {
      tris.push(V + ids[0], V + ids[1], V + ids[2]);
      inner.push(inn);
      return;
    }
    const d = ids.map((v) => holeD(vx.at(v), vz.at(v)));
    if (d[0] < 0 && d[1] < 0 && d[2] < 0) return;
    if (d[0] >= 0 && d[1] >= 0 && d[2] >= 0) {
      tris.push(V + ids[0], V + ids[1], V + ids[2]);
      inner.push(inn);
      return;
    }
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const a = ids[k], b = ids[(k + 1) % 3], ia = d[k] >= 0, ib = d[(k + 1) % 3] >= 0;
      if (ia) poly.push(V + a);
      if (ia !== ib) poly.push(cutVertex(a, b));
    }
    for (let k = 1; k < poly.length - 1; k++) {
      tris.push(poly[0], poly[k], poly[k + 1]);
      inner.push(inn);
    }
  }
  const ft = floorTris.view();
  for (let k = 0; k < ft.length; k += 3) {
    tris.push(ft[k], ft[k + 1], ft[k + 2]);
    inner.push(floorInner[k / 3]);
    vault([ft[k], ft[k + 2], ft[k + 1]], floorInner[k / 3]);
  }
  const wt = wallTris.view();
  for (let k = 0; k < wt.length; k += 3) {
    tris.push(wt[k], wt[k + 1], wt[k + 2]);
    inner.push(wallInner[k / 3]);
  }
  const total = cutBase + cx.length, pos = new Float32Array(total * 3), col = new Float32Array(total * 3), emit = new Float32Array(total * 4);
  for (let v = 0; v < V; v++) {
    pos[v * 3] = vx.at(v);
    pos[v * 3 + 1] = vfy.at(v);
    pos[v * 3 + 2] = vz.at(v);
    pos[(V + v) * 3] = vx.at(v);
    pos[(V + v) * 3 + 1] = vcy.at(v);
    pos[(V + v) * 3 + 2] = vz.at(v);
    for (let c = 0; c < 3; c++) {
      col[v * 3 + c] = vcol.at(v * 3 + c);
      col[(V + v) * 3 + c] = vccol.at(v * 3 + c);
    }
    for (let c = 0; c < 4; c++) {
      emit[v * 4 + c] = vfe.at(v * 4 + c);
      emit[(V + v) * 4 + c] = vce.at(v * 4 + c);
    }
  }
  for (let k = 0; k < wx.length; k++) {
    const v = 2 * V + k, o = v * 3;
    pos[o] = wx.at(k);
    pos[o + 1] = wy.at(k);
    pos[o + 2] = wz.at(k);
    for (let c = 0; c < 3; c++) col[o + c] = wcol.at(k * 3 + c);
    for (let c = 0; c < 4; c++) emit[v * 4 + c] = wemit.at(k * 4 + c);
  }
  for (let k = 0; k < cx.length; k++) {
    const v = cutBase + k, o = v * 3;
    pos[o] = cx.at(k);
    pos[o + 1] = cy.at(k);
    pos[o + 2] = cz.at(k);
    for (let c = 0; c < 3; c++) col[o + c] = ccol.at(k * 3 + c);
    for (let c = 0; c < 4; c++) emit[v * 4 + c] = cemit.at(k * 4 + c);
  }
  const nor = new Float32Array(total * 3);
  for (let k = 0; k < tris.length; k += 3) {
    const a = tris[k] * 3, b = tris[k + 1] * 3, c = tris[k + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], wx2 = pos[c] - pos[a], wy2 = pos[c + 1] - pos[a + 1], wz2 = pos[c + 2] - pos[a + 2];
    const nx = uy * wz2 - uz * wy2, ny = uz * wx2 - ux * wz2, nz = ux * wy2 - uy * wx2;
    for (const o of [a, b, c]) {
      nor[o] += nx;
      nor[o + 1] += ny;
      nor[o + 2] += nz;
    }
  }
  const used = new Int32Array(total).fill(-1);
  let count = 0;
  const index = growU();
  for (let k = 0; k < tris.length; k += 3) {
    if (!inner[k / 3]) continue;
    for (let q = 0; q < 3; q++) {
      const v = tris[k + q];
      if (used[v] < 0) used[v] = count++;
      index.push(used[v]);
    }
  }
  if (!index.length) {
    out.empty = true;
    return out;
  }
  const P = new Float32Array(count * 3), Nn = new Float32Array(count * 3), Cc = new Float32Array(count * 3), Em = new Float32Array(count * 4);
  for (let v = 0; v < total; v++) {
    const u = used[v];
    if (u < 0) continue;
    P[u * 3] = pos[v * 3];
    P[u * 3 + 1] = pos[v * 3 + 1];
    P[u * 3 + 2] = pos[v * 3 + 2];
    const l = Math.hypot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]) || 1;
    Nn[u * 3] = nor[v * 3] / l;
    Nn[u * 3 + 1] = nor[v * 3 + 1] / l;
    Nn[u * 3 + 2] = nor[v * 3 + 2] / l;
    Cc[u * 3] = col[v * 3];
    Cc[u * 3 + 1] = col[v * 3 + 1];
    Cc[u * 3 + 2] = col[v * 3 + 2];
    Em[u * 4] = emit[v * 4];
    Em[u * 4 + 1] = emit[v * 4 + 1];
    Em[u * 4 + 2] = emit[v * 4 + 2];
    Em[u * 4 + 3] = emit[v * 4 + 3];
  }
  out.shell = { position: P, normal: Nn, color: Cc, emit: Em, index: Uint32Array.from(index.view()) };
  const light = bakerOf(field).prepare(x0, x0 + size, z0, z0 + size);
  if (light) {
    const Gl = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) light.at(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], Nn[v * 3], Nn[v * 3 + 1], Nn[v * 3 + 2], Gl, v * 4);
    out.shell.glow = Gl;
  }
  let minY = Infinity, maxY = -Infinity;
  for (let k = 1; k < P.length; k += 3) {
    minY = Math.min(minY, P[k]);
    maxY = Math.max(maxY, P[k]);
  }
  out.bounds = { minX: x0, maxX: x0 + size, minZ: z0, maxZ: z0 + size, minY, maxY };
  const arena = field.arenas?.some((a) => a.x + a.r > x0 - 4 && a.x - a.r < x0 + size + 4 && a.z + a.r > z0 - 4 && a.z - a.r < z0 + size + 4);
  const inst = {}, put = (kind, px, py, pz, ex, ey, ez, sx, sy, sz) => {
    if (arena && ARENA_CLEAR.has(kind) && Math.max(sx, sy, sz) > 1 && field.inArena(px, pz, 1.5) && py < field.floorHeight(px, pz) + 2) return false;
    (inst[kind] ||= []).push([px, py, pz, ex, ey, ez, sx, sy, sz]);
    return true;
  };
  const meta = {}, putMeta = (kind, m, px, py, pz, ex, ey, ez, sx, sy, sz) => {
    if (put(kind, px, py, pz, ex, ey, ez, sx, sy, sz)) (meta[kind] ||= []).push(m[0], m[1], m[2]);
  };
  const h = latticeHash(seed);
  const lights = out.lights, sounds = out.sounds, glow = [], glowWater = [];
  const WR = 14, WG = 2;
  let wrDist = null, wrN = 0;
  function waterReach(x, z) {
    if (!wrDist) {
      wrN = Math.ceil((size + 2 * WR) / WG) + 1;
      const cls = new Float64Array(wrN * wrN), S2W = {};
      for (let j2 = 0; j2 < wrN; j2++) for (let i2 = 0; i2 < wrN; i2++) {
        const w = field.surfaces(x0 - WR + i2 * WG, z0 - WR + j2 * WG, S2W);
        cls[j2 * wrN + i2] = Number.isNaN(w.water) || w.water < w.floor + 0.02 ? NaN : Math.round(w.water / 0.05);
      }
      wrDist = new Float32Array(wrN * wrN);
      for (let j2 = 0; j2 < wrN; j2++) for (let i2 = 0; i2 < wrN; i2++) {
        const k = j2 * wrN + i2, c = cls[k];
        if (Number.isNaN(c)) {
          wrDist[k] = 0;
          continue;
        }
        const diff = (ii, jj) => ii < 0 || jj < 0 || ii >= wrN || jj >= wrN ? false : cls[jj * wrN + ii] !== c;
        wrDist[k] = diff(i2 - 1, j2) || diff(i2 + 1, j2) || diff(i2, j2 - 1) || diff(i2, j2 + 1) ? 0.5 : 1e9;
      }
      const D = Math.SQRT2;
      for (let j2 = 0; j2 < wrN; j2++) for (let i2 = 0; i2 < wrN; i2++) {
        const k = j2 * wrN + i2;
        let d = wrDist[k];
        if (i2) d = Math.min(d, wrDist[k - 1] + 1);
        if (j2) {
          d = Math.min(d, wrDist[k - wrN] + 1);
          if (i2) d = Math.min(d, wrDist[k - wrN - 1] + D);
          if (i2 < wrN - 1) d = Math.min(d, wrDist[k - wrN + 1] + D);
        }
        wrDist[k] = d;
      }
      for (let j2 = wrN - 1; j2 >= 0; j2--) for (let i2 = wrN - 1; i2 >= 0; i2--) {
        const k = j2 * wrN + i2;
        let d = wrDist[k];
        if (i2 < wrN - 1) d = Math.min(d, wrDist[k + 1] + 1);
        if (j2 < wrN - 1) {
          d = Math.min(d, wrDist[k + wrN] + 1);
          if (i2 < wrN - 1) d = Math.min(d, wrDist[k + wrN + 1] + D);
          if (i2) d = Math.min(d, wrDist[k + wrN - 1] + D);
        }
        wrDist[k] = d;
      }
    }
    const i = Math.round((x - x0 + WR) / WG), j = Math.round((z - z0 + WR) / WG);
    if (i < 0 || j < 0 || i >= wrN || j >= wrN) return 0.5;
    return Math.min(WR, wrDist[j * wrN + i] * WG - WG * 0.5);
  }
  const dryAt = (s) => Number.isNaN(s.water) || s.water < s.floor - 0.05;
  function each(cell, salt, f) {
    lattice(h, cell, salt, x0, x0 + size, z0, z0 + size, f);
  }
  each(1.6, 1, (x, z, r1, r2) => {
    const c = field.clearance(x, z);
    if (c < 0.25) return;
    if (!(c < 2.2 ? r1 < 0.5 : r1 < 0.07)) return;
    const s = field.surfaces(x, z, S);
    if (!dryAt(s)) return;
    const k = 0.05 + r2 * r2 * 0.32;
    put("pebble", x, s.floor - k * 0.18, z, r1 * 2, r2 * TAU2, r1, k * (1 + r2 * 0.4), k * (0.32 + r1 * 0.3), k);
  });
  each(4.2, 41, (x, z, r1, r2, i, j) => {
    const c = field.clearance(x, z);
    if (c < 0.6) return;
    if (!(c < 5 ? r1 < 0.42 : c < 14 ? r1 < 0.1 : r1 < 0.035)) return;
    const s = field.surfaces(x, z, S);
    if (!dryAt(s) || s.ceiling - s.floor < 7) return;
    const big = c < 5 ? 0.5 + r2 * 1.5 : 0.45 + r2 * r2 * 2.2, r3 = h(i + 13, j - 7, 44);
    const k = Math.min(big, s.ceiling - s.floor - 2.5, c * 0.9 + 0.3);
    if (k < 0.3) return;
    put("boulder", x, s.floor - k * (0.25 + r3 * 0.15), z, (r3 - 0.5) * 0.6, r1 * TAU2 * 7, (r2 - 0.5) * 0.5, k * (1.1 + r3 * 0.5), k * (0.62 + r1 * 0.4), k * (0.9 + r2 * 0.4));
    if (c < 5 && r3 < 0.45) {
      const a = r2 * TAU2, kk = k * (0.3 + r3 * 0.4);
      put("boulder", x + Math.cos(a) * k * 1.2, s.floor - kk * 0.2, z + Math.sin(a) * k * 1.2, r3 * 3, a, r1, kk * 1.2, kk * 0.7, kk);
    }
  });
  each(22, 47, (x, z, r1, r2, i, j) => {
    if (r1 > 0.2) return;
    const c = field.clearance(x, z);
    if (c < 7) return;
    const s = field.surfaces(x, z, S);
    if (!dryAt(s) || s.ceiling - s.floor < 14 || s.well >= 0 || s.room >= 0 || s.river < 6 || s.wet > 0.3) return;
    const r3 = h(i + 5, j + 11, 48), k = Math.min(2.3 + r2 * 3.4, (s.ceiling - s.floor) * 0.2, c * 0.55);
    if (k < 1.6) return;
    put("boulder", x, s.floor - k * (0.28 + r3 * 0.1), z, (r3 - 0.5) * 0.35, r1 * TAU2 * 13, (r2 - 0.5) * 0.25, k * (1.05 + r3 * 0.35), k * (0.68 + r1 * 0.5), k * (0.95 + r2 * 0.3));
    for (let q = 0; q < 3; q++) {
      const a = r3 * TAU2 + q * 2.1, d = k * (1.25 + q * 0.35), kk = k * (0.18 + h(i + q, j - q, 49) * 0.22), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, ps = field.surfaces(px, pz, S);
      if (ps.c < 1 || !dryAt(ps)) continue;
      put("boulder", px, ps.floor - kk * 0.25, pz, q, a, r1, kk * 1.2, kk * 0.75, kk);
    }
  });
  {
    const DARK = ORE_DARK, deepLayer = field.data.layer === "deep";
    each(ORE.cell, 61, (x, z, r1, r2, i, j) => {
      const c = field.clearance(x, z);
      if (c < 0.7 || c > 4.5) return;
      const s = field.surfaces(x, z, S);
      if (!dryAt(s) || s.ceiling - s.floor < 4.5 || s.well >= 0 || s.meadow > 0.2) return;
      const dark = DARK[s.kind] || 0, r3 = h(i + 31, j - 17, 62);
      const pIron = dark * ORE.iron * (deepLayer ? 2 : 1), pCopper = ORE.copper * (1 - dark * 0.45) * (deepLayer ? 1.5 : 1);
      const kind = r1 < pIron ? "oreIron" : r1 < pIron + pCopper ? "oreCopper" : null;
      if (!kind) return;
      const k = Math.min(0.72 + r2 * 0.8, (s.ceiling - s.floor) * 0.25, c * 0.8 + 0.4);
      if (k < 0.7) return;
      put(kind, x, s.floor - k * (0.3 + r3 * 0.1), z, (r3 - 0.5) * 0.5, r2 * TAU2 * 5, (r1 - 0.5) * 0.4, k * (1.05 + r3 * 0.3), k * (0.78 + r2 * 0.3), k * (0.95 + r3 * 0.2));
      for (let q = 0, n2 = 2 + Math.floor(r3 * 3); q < n2; q++) {
        const a = r3 * TAU2 + q * 2.4, d = k * (1.15 + q * 0.3), kk = 0.1 + h(i - q, j + q, 63) * 0.18, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, ps = field.surfaces(px, pz, S);
        if (ps.c < 0.15 || !dryAt(ps)) continue;
        put(kind, px, ps.floor - kk * 0.3, pz, q * 1.3, a, r1 * 2, kk * 1.2, kk * 0.8, kk);
      }
    });
    for (const room of field.rooms) for (const il of room.water?.islets || []) for (let q = 0; q < (il.heart ? 3 : 2); q++) {
      const a = room.seed % 89 * 0.51 + q * 2.1 + 1, cx2 = il.x + Math.cos(a) * il.r * 0.48, cz2 = il.z + Math.sin(a) * il.r * 0.48;
      if (cx2 < x0 || cx2 >= x0 + size || cz2 < z0 || cz2 >= z0 + size) continue;
      const s = field.surfaces(cx2, cz2, S);
      if (!dryAt(s)) continue;
      for (let k = 0; k < 5; k++) {
        const b = a * 7 + k * 1.26, lean = 0.18 + h(q, k, 68) * 0.3, L = (il.heart ? 2.6 : 1.8) * (k ? 0.45 + h(k, q, 69) * 0.5 : 1), rr = 0.22 + L * 0.08;
        put("crystalA", cx2 + Math.cos(b) * k * 0.22, s.floor - 0.2, cz2 + Math.sin(b) * k * 0.22, Math.cos(b) * lean * (k ? 1 : 0.2), h(k, q, 70) * TAU2, Math.sin(b) * lean * (k ? 1 : 0.2), rr, L, rr);
      }
    }
    for (const room of field.rooms) for (const il of room.water?.islets || []) for (let q = 0; q < 2; q++) {
      const a = room.seed % 97 * 0.37 + q * 2.6, x = il.x + Math.cos(a) * il.r * 0.55, z = il.z + Math.sin(a) * il.r * 0.55;
      if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
      const s = field.surfaces(x, z, S);
      if (!dryAt(s)) continue;
      const k = 1 + q * 0.15;
      put("oreIron", x, s.floor - k * 0.32, z, 0.2 * q, a * 3, -0.1, k * 1.15, k * 0.8, k);
    }
  }
  const PENDANT = { stone: 0.4, abyss: 0.2, ruins: 0.18, sapphire: 0.14, ember: 0.08, glowcap: 0.06, verdant: 0.04 };
  each(2.6, 2, (x, z, r1, r2) => {
    const s = field.surfaces(x, z, S);
    if (s.c < 0.7) return;
    const theme = s.vault > 0.35 ? s.theme : null;
    const p = theme === "karst" ? 0.78 : theme === "hall" || theme === "lake" || theme === "falls" ? 0.45 : theme === "grotto" ? 0.5 : theme === "crystal" || theme === "ruins" || theme === "ember" ? 0.12 : theme === "skylight" || theme === "mushroom" || theme === "roots" ? 0.06 : PENDANT[s.kind] ?? 0.2;
    const room2 = s.ceiling - s.floor;
    if (r1 > p * (room2 > 30 ? 0.55 : 1)) return;
    if (field.skyHole && field.skyHole(x, z)) return;
    const length = Math.min(room2 - 3.3, 0.5 + r2 * r2 * (theme === "karst" || theme === "hall" || s.kind === "stone" ? 6 : 2.4) * (room2 > 25 ? 1.8 : 1));
    if (length < 0.3) return;
    const cluster = 1 + (r2 > 0.55 ? 2 : 0) + (r1 < p * 0.3 ? 1 : 0);
    for (let k = 0; k < cluster; k++) {
      const a = r2 * TAU2 + k * 2.2, d = k ? 0.35 + r1 * 0.6 : 0, cx2 = x + Math.cos(a) * d, cz2 = z + Math.sin(a) * d, cs = field.surfaces(cx2, cz2, S);
      if (cs.c < 0.4) continue;
      const L = length * (k ? 0.45 + r1 * 0.4 : 1), rad = 0.09 + L * 0.07 + r2 * 0.05;
      put("stalactite", cx2, cs.ceiling + 0.12, cz2, Math.PI + (r1 - 0.5) * 0.12, a, (r2 - 0.5) * 0.12, rad, L + 0.12, rad);
      if (!k && (theme === "karst" || theme === "hall" || theme === "grotto" || s.kind === "stone" || s.kind === "abyss") && cs.c < 3.2 && r2 > 0.3 && Number.isNaN(cs.water)) {
        const G = Math.min(cs.ceiling - cs.floor - 2.4, 0.4 + r1 * 2.6 * (theme === "karst" || s.kind === "stone" ? 1 : 0.6)), gr = 0.16 + G * 0.12;
        if (G > 0.25) put("stalagmite", cx2 + (r1 - 0.5) * 0.3, cs.floor - 0.1, cz2 + (r2 - 0.5) * 0.3, (r2 - 0.5) * 0.1, a + 1, (r1 - 0.5) * 0.1, gr, G + 0.1, gr * (0.9 + r1 * 0.2));
      }
    }
  });
  each(3.1, 3, (x, z, r1, r2) => {
    const s = field.surfaces(x, z, S), theme = s.vault > 0.4 ? s.theme : null;
    if (!(theme === "karst" || theme === "hall" || theme === "falls" || s.kind === "stone") || s.c < 0.25 || s.c > 2.2 || r1 > 0.5 || !Number.isNaN(s.water)) return;
    const n2 = 1 + Math.floor(r2 * 3);
    for (let k = 0; k < n2; k++) {
      const a = r1 * 40 + k * 2.4, cx2 = x + Math.cos(a) * k * 0.45, cz2 = z + Math.sin(a) * k * 0.45, cs = field.surfaces(cx2, cz2, S);
      if (cs.c < 0.15) continue;
      const G = Math.min(cs.ceiling - cs.floor - 2.4, (0.35 + r2 * 1.9) * (k ? 0.6 : 1)), gr = 0.14 + G * 0.15;
      if (G > 0.2) put("stalagmite", cx2, cs.floor - 0.1, cz2, 0, a, 0, gr, G + 0.1, gr * (0.85 + r1 * 0.3));
    }
  });
  let along = 0;
  for (const [a, b, inn] of boundary) {
    if (!inn) continue;
    const ax = vx.at(a), az = vz.at(a), bxx = vx.at(b), bzz = vz.at(b), len = Math.hypot(bxx - ax, bzz - az);
    along += len;
    const r1 = h(ax * 3.1, az * 3.1, 4), spacing = 3.2 + r1 * 3.5;
    if (along < spacing) continue;
    along = 0;
    const f = frame(a), s = field.surfaces(ax, az, S), theme = s.vault > 0.35 ? s.theme : null, r2 = h(az * 2.3, ax * 1.7, 5);
    const kind = theme === "karst" || theme === "falls" || theme === "lake" || s.kind === "stone" ? r2 < 0.55 ? "flowstone" : "ledge" : theme === "crystal" ? "ledge" : r2 < 0.25 ? "flowstone" : "ledge";
    const yaw = Math.atan2(f.nx, f.nz) + (r1 - 0.5) * 0.9;
    const sx = kind === "ledge" ? 1.1 + r1 * 1.3 : 0.5 + r1 * 0.5, sy = kind === "ledge" ? 0.35 + r2 * 0.6 : 0.8 + r2 * 0.9, sz = kind === "ledge" ? 0.5 + r2 * 0.35 : 0.45 + r1 * 0.3;
    put(kind, ax - f.nx * 0.5, s.floor - 0.1, az - f.nz * 0.5, 0, yaw, 0, sx, sy, sz);
  }
  each(THINGS.cell, THINGS.salt, (x, z, r1, r2, i, j) => {
    const s = field.surfaces(x, z, S);
    if (s.c < 0.2) return;
    const r3 = h(i + 3, j + 5, THINGS.salt + 4), thing = glowThing(s, r1, r3);
    const theme = s.vault > 0.3 ? s.theme : null;
    if (thing === "crystal" || thing === "ember") {
      const n2 = 3 + Math.floor(r2 * 5), yaw = r2 * TAU2, red = thing === "ember";
      for (let k = 0; k < n2; k++) {
        const a = yaw + k * 1.7, lean = 0.25 + h(x * 7 + k, z * 5, 7) * 0.6, L = (0.4 + h(x + k, z - k, 8) * 1.6) * (k ? 0.7 : 1.25), rr = L * (0.13 + h(z + k, x, 9) * 0.07);
        put(red ? "crystalR" : h(x * 3 + k, z, 15) < 0.16 ? "crystalB" : "crystalA", x + Math.cos(a) * k * 0.12, s.floor - 0.15, z + Math.sin(a) * k * 0.12, Math.cos(a) * lean, h(k, x, 10) * TAU2, Math.sin(a) * lean, rr, L, rr);
      }
      lights.push({ x, y: s.floor + 1.3, z, color: red ? 16738858 : r2 < 0.8 ? 6273279 : 10127103, intensity: 16 + r2 * 9, range: 22, kind: "crystal" });
    } else if (thing === "caps") {
      const n2 = 2 + Math.floor(r2 * 6);
      for (let k = 0; k < n2; k++) {
        const a = r2 * 9 + k * 2.1, d = k * 0.14, sc = 0.07 + h(x + k, z, 11) * 0.16;
        put("mushSmall", x + Math.cos(a) * d, s.floor - 0.01, z + Math.sin(a) * d, (h(k, z, 12) - 0.5) * 0.4, a, (h(x, k, 13) - 0.5) * 0.4, sc, sc * (1 + h(z, k, 14)), sc);
      }
      if (r2 > 0.8) lights.push({ x, y: s.floor + 0.8, z, color: 4186312, intensity: 8, range: 16, kind: "caps" });
    } else if (thing === "bulb") {
      const n2 = 1 + Math.floor(r2 * 3);
      for (let k = 0; k < n2; k++) {
        const a = r2 * 11 + k * 2.4, d = k ? 0.5 + h(x, z + k, 16) * 0.8 : 0, sc = 0.7 + h(x - k, z, 17) * 0.8;
        put("bulb", x + Math.cos(a) * d, s.floor - 0.05, z + Math.sin(a) * d, (h(k, x, 18) - 0.5) * 0.25, a, (h(z, k, 19) - 0.5) * 0.25, sc, sc * (0.8 + h(k, z, 20) * 0.7), sc);
      }
      const fa = r1 * 30;
      put("glowFern", x + Math.cos(fa) * 1.1, s.floor - 0.03, z + Math.sin(fa) * 1.1, 0, fa, 0, 0.9 + r2 * 0.5, 0.8 + r1 * 0.6, 0.9 + r2 * 0.5);
      if (r2 > 0.55) lights.push({ x, y: s.floor + 1.2, z, color: 6094746, intensity: 7, range: 14, kind: "bulb" });
    } else if ((theme === "skylight" || s.kind === "verdant" && s.moss > 0.3) && s.moss > 0.12 && !(s.meadow > 0.2) && r1 < (0.25 + s.moss * 0.75) * Math.min(1, smooth3(0.3, 0.62, N(x / 6.5, z / 6.5, 81) * 0.7 + N(x / 2.3, z / 2.3, 82) * 0.3) * 1.3 + 0.1) && dryAt(s)) {
      const sc = 0.8 + r2 * 0.9 * s.moss, kind = r2 < 0.45 ? "fern" : r2 < 0.93 ? "tuft" : "flower";
      put(kind, x, s.floor - 0.03, z, (r1 - 0.5) * 0.2, r2 * TAU2 * 3, (r2 - 0.5) * 0.2, kind === "tuft" ? sc * 1.3 : sc, sc * (0.8 + r1 * 0.5), kind === "tuft" ? sc * 1.3 : sc);
      if (kind === "tuft") put("tuft", x + 0.6, s.floor - 0.03, z - 0.4, 0, r1 * TAU2, 0, sc, sc * 0.9, sc);
    } else if (theme === "roots" && r1 < 0.2 && s.ceiling - s.floor > 3) {
      const L = Math.min(s.ceiling - s.floor - 0.4, 1.5 + r2 * 5.5), yaw = r2 * TAU2;
      put("root", x, s.ceiling + 0.3, z, Math.PI + (r1 - 0.1) * 0.5, yaw, (r2 - 0.5) * 0.4, 0.5 + r1 * 0.7, L, 0.5 + r2 * 0.6);
    }
  });
  if (kinds.has("verdant")) each(2.4, 26, (x, z, r1, r2) => {
    if (r1 > 0.3) return;
    const s = field.surfaces(x, z, S);
    if (s.c < 0.3 || s.c > 4 || s.kind !== "verdant" && !(s.kindB === "verdant" && r2 < s.blend)) return;
    const room = s.ceiling - s.floor;
    if (room < 4) return;
    const L = Math.min(room - 2.2, 2 + r2 * Math.min(14, room * 0.5));
    put("vine", x, s.ceiling - 0.1, z, (r1 - 0.15) * 0.2, r2 * TAU2 * 5, (r2 - 0.5) * 0.2, 1.4 + r1 * 2, L, 1.4 + r2 * 2);
  });
  const GREAT = { stone: 0.55, abyss: 0.38, ruins: 0.32, ember: 0.22, sapphire: 0.16, glowcap: 0.12, verdant: 0.08 }, S2 = {};
  each(9, 51, (x, z, r1, r2, i, j) => {
    const s = field.surfaces(x, z, S);
    if (s.c < 2.5) return;
    const room = s.ceiling - s.floor, theme = s.vault > 0.35 ? s.theme : null, kind = s.kind, ceil = s.ceiling, floor = s.floor, dry2 = dryAt(s);
    if (room < 13) return;
    const p = theme === "karst" || theme === "hall" ? 0.75 : theme === "lake" || theme === "falls" || theme === "grotto" ? 0.5 : theme === "skylight" || theme === "mushroom" ? 0.08 : GREAT[kind] ?? 0.2;
    if (r1 > p || field.skyHole && field.skyHole(x, z)) return;
    const r3 = h(i + 31, j - 17, 52);
    if (room < 24 && r3 < 0.3 && dry2) {
      const rad2 = 1.1 + r2 * 1.5;
      put("stalactite", x, ceil + 0.4, z, Math.PI, r2 * TAU2, 0, rad2, room * 0.66, rad2);
      put("stalagmite", x, floor - 0.3, z, 0, r1 * TAU2, 0, rad2 * 1.3, room * 0.52, rad2 * 1.3);
      return;
    }
    const L = Math.min(room * (0.16 + r2 * 0.26), 4 + r2 * 15), rad = 0.32 + L * 0.085;
    put("stalactite", x, ceil + 0.25, z, Math.PI + (r3 - 0.5) * 0.08, r2 * TAU2, (r1 - 0.5) * 0.08, rad, L, rad);
    for (let k = 0; k < 4; k++) {
      const a = r2 * 9 + k * 1.7, d = rad * 2.2 + h(x + k, z, 53) * 3.5, cx2 = x + Math.cos(a) * d, cz2 = z + Math.sin(a) * d, cs = field.surfaces(cx2, cz2, S);
      if (cs.c < 1) continue;
      const l = L * (0.2 + h(z, x + k, 54) * 0.4), rr = 0.1 + l * 0.08;
      put("stalactite", cx2, cs.ceiling + 0.15, cz2, Math.PI + (h(k, x, 55) - 0.5) * 0.1, a, 0, rr, l, rr);
    }
  });
  each(GIANT_HANG.cell, GIANT_HANG.salt, (x, z, r1, r2, i, j) => {
    const s = field.surfaces(x, z, S);
    if (s.c < 6) return;
    const room = s.ceiling - s.floor;
    if (room < GIANT_HANG.room) return;
    const theme = s.vault > 0.35 ? s.theme : null, p = GIANT_HANG.themes[theme] ?? GIANT_HANG.kinds[s.kind] ?? 0.09;
    if (r1 > p || field.skyHole && field.skyHole(x, z)) return;
    const ceil = s.ceiling, L = Math.min(room - GIANT_HANG.clear, room * (0.42 + r2 * 0.3), GIANT_HANG.longest);
    if (L < GIANT_HANG.shortest) return;
    const rad = 1.6 + L * 0.085 + h(i - 7, j + 3, 62) * 1.2;
    let top = ceil;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU2, cs = field.surfaces(x + Math.cos(a) * rad * 1.3, z + Math.sin(a) * rad * 1.3, S2);
      if (cs.c > 0 && cs.ceiling > top && cs.ceiling < ceil + rad * 2) top = cs.ceiling;
    }
    put("stalactiteGiant", x, top + 0.6, z, Math.PI + (r1 - 0.5) * 0.05, r2 * TAU2, (h(i, j, 63) - 0.5) * 0.05, rad, L + (top - ceil) + 0.6, rad);
    for (let k = 0; k < 6; k++) {
      const a = r2 * 11 + k * 1.05, d = rad * (1.5 + h(x - k, z, 64) * 1.6), cx2 = x + Math.cos(a) * d, cz2 = z + Math.sin(a) * d, cs = field.surfaces(cx2, cz2, S2);
      if (cs.c < 1) continue;
      const l = Math.min(cs.ceiling - cs.floor - GIANT_HANG.clear, L * (0.12 + h(z + k, x, 65) * 0.3));
      if (l < 1) continue;
      const rr = 0.18 + l * 0.085;
      put("stalactite", cx2, cs.ceiling + 0.2, cz2, Math.PI + (h(k, z, 66) - 0.5) * 0.1, a, 0, rr, l, rr);
    }
  });
  each(VAULT_CRYSTALS.cell, VAULT_CRYSTALS.salt, (x, z, r1, r2, i, j) => {
    if (r1 > 0.6) return;
    const s = field.surfaces(x, z, S), v = vaultCrystal(s, r1, r2, vaultPatch(seed, x, z));
    if (!v) return;
    const ceil = s.ceiling, floor = s.floor, red = v.red, big = v.big, n2 = 4 + Math.floor(r2 * 6);
    for (let k = 0; k < n2; k++) {
      const a = r2 * TAU2 + k * 1.9, lean = k ? 0.12 + h(x + k, z * 3, 57) * 0.3 : 0.03 + h(x, z * 3, 57) * 0.1, L = (big ? 2.4 + h(x * 2 + k, z, 58) * 6.5 : 0.6 + h(x + k, z + k, 58) * 1.9) * (k ? 0.62 : 1), rr = L * (0.12 + h(z + k, x, 59) * 0.06);
      const cx2 = x + Math.cos(a) * k * (big ? 0.45 : 0.2), cz2 = z + Math.sin(a) * k * (big ? 0.45 : 0.2), cc = k ? field.surfaces(cx2, cz2, S2) : null;
      if (cc && cc.c < 0.4) continue;
      put(red ? "crystalR" : h(x * 5 + k, z, 60) < 0.2 ? "crystalB" : "crystalA", cx2, (cc ? cc.ceiling : ceil) + 0.25, cz2, Math.PI + Math.cos(a) * lean, h(k, z, 61) * TAU2, Math.sin(a) * lean, rr, L, rr);
    }
    lights.push({ x, y: Math.max(floor + 2, ceil - (big ? 4 : 2)), z, color: red ? 16738858 : 6273279, intensity: big ? 32 : 14, range: big ? 36 : 20, kind: "crystal" });
  });
  if (kinds.has("sapphire") || kinds.has("ember")) each(SPIRES.cell, SPIRES.salt, (x, z, r1, r2, i, j) => {
    if (r1 > 0.38) return;
    const s = field.surfaces(x, z, S), v = crystalSpire(s, r1, r2);
    if (!v) return;
    const red = v.red, floor = s.floor, tall = v.tall, n2 = 4 + Math.floor(r2 * 5);
    for (let k = 0; k < n2; k++) {
      const a = r2 * TAU2 + k * 1.3, lean = k ? 0.22 + h(x + k, z, 63) * 0.45 : 0.04 + r1 * 0.12, L = tall * (k ? 0.28 + h(z + k, x, 64) * 0.45 : 1), rr = L * (0.1 + h(x, z + k, 65) * 0.05);
      const cx2 = x + Math.cos(a) * k * (0.6 + tall * 0.04), cz2 = z + Math.sin(a) * k * (0.6 + tall * 0.04), cf = k ? field.surfaces(cx2, cz2, S2) : null;
      if (cf && (cf.c < 0.5 || !dryAt(cf))) continue;
      put(red ? "crystalR" : h(x + k * 3, z, 66) < 0.22 ? "crystalB" : "crystalA", cx2, (cf ? cf.floor : floor) - 0.4, cz2, Math.cos(a) * lean, h(k, x, 67) * TAU2, Math.sin(a) * lean, rr, L, rr);
    }
    lights.push({ x, y: floor + Math.min(tall * 0.45, 9), z, color: red ? 16738858 : 7322879, intensity: 70, range: 50, kind: "crystal" });
  });
  each(3.4, 68, (x, z, r1, r2, i, j) => {
    const s = field.surfaces(x, z, S);
    if (s.c < 0.8) return;
    const theme = s.vault > 0.4 ? s.theme : null, kind = s.kind;
    const lava = field.layer === "deep" && (theme === "lake" || theme === "falls" || !Number.isNaN(s.water) || s.river < 6);
    const p = lava ? 0 : theme === "lake" || theme === "falls" ? 0.14 : theme === "mushroom" ? 0.12 : kind === "glowcap" ? 0.07 : kind === "abyss" ? 0.07 : 0;
    if (r1 > p) return;
    const room = s.ceiling - s.floor;
    if (room < 5) return;
    const ceil = s.ceiling, n2 = 1 + Math.floor(r2 * 3);
    for (let k = 0; k < n2; k++) {
      const a = r2 * 13 + k * 2.3, d = k * 0.35, cx2 = x + Math.cos(a) * d, cz2 = z + Math.sin(a) * d, cc = k ? field.surfaces(cx2, cz2, S2) : null;
      if (cc && cc.c < 0.3) continue;
      const L = Math.min(room - 2.5, 1.2 + h(x + k, z, 69) * Math.min(6, room * 0.3)), w = 0.07 + h(z, x + k, 70) * 0.05;
      if (L < 0.6) continue;
      put("strand", cx2, (cc ? cc.ceiling : ceil) - 0.05, cz2, 0, a, 0, w, L, w);
    }
  });
  if (kinds.has("glowcap")) each(2.8, 71, (x, z, r1, r2) => {
    const s = field.surfaces(x, z, S);
    if (s.c < 0.3) return;
    const theme = s.vault > 0.35 ? s.theme : null;
    if (!(s.kind === "glowcap" || theme === "mushroom")) return;
    const room = s.ceiling - s.floor;
    if (room < 4 || r1 > (s.c < 4 ? 0.2 : 0.04)) return;
    const ceil = s.ceiling, n2 = 2 + Math.floor(r2 * 3);
    for (let k = 0; k < n2; k++) {
      const a = r2 * 9 + k * 2.1, d = k * 0.16, cx2 = x + Math.cos(a) * d, cz2 = z + Math.sin(a) * d, cc = k ? field.surfaces(cx2, cz2, S2) : null, sc = 0.08 + h(x + k, z, 72) * 0.18;
      put("mushSmall", cx2, (cc ? cc.ceiling : ceil) + 0.02, cz2, Math.PI + (h(k, z, 73) - 0.5) * 0.5, a, (h(x, k, 74) - 0.5) * 0.5, sc, sc * (1 + h(z, k, 75)), sc);
    }
  });
  each(3.1, 76, (x, z, r1, r2) => {
    if (r1 > 0.2) return;
    const s = field.surfaces(x, z, S);
    const theme = s.vault > 0.35 ? s.theme : null;
    if (s.c < 0.3 || !(theme === "skylight" || theme === "mushroom" || s.kind === "glowcap" && s.c < 5)) return;
    const room = s.ceiling - s.floor;
    if (room < 4) return;
    const L = Math.min(room - 2.2, 2 + r2 * Math.min(12, room * 0.45)), ceil = s.ceiling;
    put("vine", x, ceil - 0.1, z, (r1 - 0.1) * 0.2, r2 * TAU2 * 5, (r2 - 0.5) * 0.2, 1.3 + r1 * 2, L, 1.3 + r2 * 2);
  });
  const reedClump = (x, z) => smooth3(0.38, 0.62, N(x / 5.5, z / 5.5, 83) * 0.75 + N(x / 1.9, z / 1.9, 84) * 0.25) * 1.5;
  each(1.5, 77, (x, z, r1, r2, i, j) => {
    const c = field.clearance(x, z);
    if (c < 0.6) return;
    const s = field.surfaces(x, z, S), kind = r2 < s.blend ? s.kindB : s.kind, theme = s.vault > 0.35 ? s.theme : null, floor = s.floor, water = s.water;
    if (!Number.isNaN(water) && water > floor - 0.05 || s.meadow > 0.25) return;
    const patch = N(x / 48, z / 48, 78), fine = N(x / 9, z / 9, 79), r3 = h(i + 5, j + 9, 80);
    if (s.river > -0.4 && s.river < 2.4 && kind !== "verdant" && theme !== "skylight") {
      if (r1 > 0.42 * reedClump(x, z) || field.layer === "deep") return;
      const sc = 0.75 + r3 * 0.6;
      put("reed", x, floor - 0.05, z, (r3 - 0.5) * 0.1, r1 * TAU2 * 7, 0, sc, sc * (0.8 + r3 * 0.5), sc);
      return;
    }
    if (kind === "verdant" || theme === "skylight") {
      const clump = smooth3(0.3, 0.62, N(x / 6.5, z / 6.5, 81) * 0.7 + N(x / 2.3, z / 2.3, 82) * 0.3);
      const m = (theme === "skylight" ? Math.max(0.75, smooth3(0.38, 0.58, patch)) : smooth3(0.4, 0.6, patch) * smooth3(1.5, 4, c)) * Math.min(1, clump * 1.3 + 0.08);
      if (r1 > m * (0.55 + 0.45 * fine)) return;
      const sc = 0.8 + r3 * 0.7, sort = r2 * 0.7 + fine * 0.3;
      if (sort < 0.7) {
        put("tuft", x, floor - 0.03, z, (r3 - 0.5) * 0.15, r1 * TAU2 * 7, 0, sc * 1.4, sc * (1 + r3 * 0.6), sc * 1.4);
        put("tuft", x + 0.55, floor - 0.03, z - 0.35, 0, r3 * TAU2, 0, sc * 1.2, sc * 0.9, sc * 1.2);
      } else if (sort < 0.8) put("fern", x, floor - 0.03, z, 0, r1 * TAU2 * 5, 0, sc, sc * (0.9 + r3 * 0.5), sc);
      else if (sort < 0.9) put("flower", x, floor - 0.03, z, 0, r1 * TAU2 * 3, 0, sc * 1.2, sc, sc * 1.2);
      else put("glowFern", x, floor - 0.03, z, 0, r1 * TAU2 * 3, 0, sc * 0.9, sc * 0.8, sc * 0.9);
    } else if (kind === "glowcap") {
      if (r1 > smooth3(0.45, 0.65, patch) * 0.7) return;
      const sc = 0.7 + r3 * 0.6;
      put("tuftGlow", x, floor - 0.03, z, 0, r1 * TAU2 * 7, 0, sc * 1.3, sc * (0.6 + r3 * 0.4), sc * 1.3);
    } else if (kind === "sapphire") {
      if (r1 > smooth3(0.44, 0.62, patch) * 0.6 || c > 14) return;
      const sc = 0.9 + r3 * 0.7;
      put("crystalFlower", x, floor - 0.02, z, 0, r1 * TAU2 * 5, 0, sc * 1.3, sc, sc * 1.3);
    } else if (kind === "ember") {
      if (r1 > smooth3(0.5, 0.7, patch) * 0.2) return;
      const sc = 0.8 + r3 * 0.8;
      put("emberFern", x, floor - 0.03, z, 0, r1 * TAU2 * 5, 0, sc, sc * (0.8 + r3 * 0.5), sc);
    } else if ((s.theme === "lake" || s.theme === "falls") && s.s > -0.25 && s.s < 0.12) {
      if (r1 > (kind === "abyss" ? 0.6 : 0.35) * reedClump(x, z) || field.layer === "deep") return;
      const sc = 0.8 + r3 * 0.6;
      put("reed", x, floor - 0.05, z, (r3 - 0.5) * 0.1, r1 * TAU2 * 7, 0, sc, sc * (0.8 + r3 * 0.5), sc);
    }
  });
  const wellsHere = (field.wells || []).filter((w) => w.x + w.radius + 26 > x0 && w.x - w.radius - 26 < x0 + size && w.z + w.radius + 26 > z0 && w.z - w.radius - 26 < z0 + size);
  if (wellsHere.length) {
    each(1.05, 92, (x, z, r1, r2, i, j) => {
      const s = field.surfaces(x, z, S), m = s.meadow;
      if (!(m > 0.05) || s.c < 0.4 || !dryAt(s)) return;
      if (r1 > m * (0.55 + 0.45 * m)) return;
      const r3 = h(i + 7, j - 3, 93), patch = N(x / 6.5, z / 6.5, 94);
      if (patch > 0.6 && r3 < 0.55 * m) {
        const sc2 = 0.75 + r2 * 0.55;
        put("flower", x, s.floor - 0.03, z, 0, r1 * TAU2 * 3, 0, sc2 * 1.2, sc2 * (0.85 + r3 * 0.45), sc2 * 1.2);
        return;
      }
      const sc = (0.75 + r2 * 0.55) * (0.6 + 0.4 * m);
      put("tuft", x, s.floor - 0.03, z, (r3 - 0.5) * 0.12, r1 * TAU2 * 7, 0, sc * 1.35, sc * (0.9 + r3 * 0.6), sc * 1.35);
    });
    each(1.7, 95, (x, z, r1, r2, i, j) => {
      const s = field.surfaces(x, z, S), m = s.meadow;
      if (!(m > 0.05) || s.c < 0.5 || !dryAt(s)) return;
      const band = smooth3(0.04, 0.3, m) * smooth3(1, 0.6, m) + 0.3 * smooth3(5, 1.2, s.c) * smooth3(0, 0.2, m);
      if (r1 > band * 0.6) return;
      const r3 = h(i - 9, j + 4, 96), size2 = 0.62 + r2 * 0.62, ratio = 0.74 + r3 * 0.32;
      putMeta(MEADOW_KINDS.fern, FERN_TINTS[r3 < 0.25 ? 0 : r3 < 0.8 ? 1 : 2], x, s.floor - 0.02, z, (r3 - 0.5) * 0.12, r1 * TAU2 * 5, (r2 - 0.5) * 0.06, size2, size2 * ratio, size2 * (0.82 + r1 * 0.3));
    });
    each(4.4, 97, (x, z, r1, r2, i, j) => {
      const s = field.surfaces(x, z, S), m = s.meadow;
      if (!(m > 0.3) || s.c < 2.2 || !dryAt(s)) return;
      const edge = smooth3(0.95, 0.45, m);
      if (r1 > 0.14 + 0.42 * edge) return;
      const r3 = h(i + 2, j + 11, 98), r4 = h(i - 13, j + 6, 99), thicket = r3 < 0.28 + 0.3 * edge, pine = !thicket && r3 > 0.9;
      const shape = thicket ? 7 + Math.floor(r2 * 3) : pine ? 4 + Math.floor(r2 * 3) : Math.floor(r2 * 4);
      const sc = thicket ? 0.9 + r4 * 0.45 : (0.95 + r4 * 0.4) * (edge < 0.4 && r4 > 0.6 ? 1.55 : 1);
      const t = TREE_TINTS[thicket ? "thicket" : pine ? "pine" : "broadleaf"], tone = 0.9 + 0.2 * r1;
      putMeta(MEADOW_KINDS.trees[shape], [t[0] * tone * 0.94, t[1] * tone, t[2] * tone * 0.9], x, s.floor - 0.04, z, (r4 - 0.5) * 0.1, r2 * TAU2 * 3, (r1 - 0.5) * 0.1, sc, sc, sc);
    });
  }
  const rays = [];
  each(70, 81, (x, z, r1, r2) => {
    if (field.layer === "deep") return;
    const s = field.surfaces(x, z, S);
    if (s.c < 7 || s.well >= 0) return;
    const room = s.ceiling - s.floor, kind = s.kind, theme = s.vault > 0.35 ? s.theme : null;
    const p = theme === "skylight" ? 0 : kind === "verdant" ? 0.55 : kind === "glowcap" || kind === "sapphire" || kind === "stone" ? 0.32 : kind === "ruins" ? 0.25 : 0.12;
    if (room < 22 || r1 > p) return;
    const ceil = s.ceiling, floor = Number.isNaN(s.water) ? s.floor : Math.max(s.floor, s.water), radius = 0.7 + Math.pow(r2, 1.7) * 4.3;
    rays.push(x, z, ceil, floor, radius);
    lights.push({ x, y: floor + Math.min(8, room * 0.3), z, color: 14214896, intensity: 0, range: 34 + radius * 4, kind: "sky", sky: true });
  });
  if (rays.length) out.rays = Float32Array.from(rays);
  if (kinds.has("abyss") || field.rooms.some((r) => field.layer !== "deep" && (r.theme === "lake" || r.theme === "falls") && Math.abs(r.x - x0 - size / 2) < r.r * 1.4 + size && Math.abs(r.z - z0 - size / 2) < r.r * 1.4 + size)) each(0.9, 21, (x, z, r1, r2) => {
    if (r1 > 0.62) return;
    const s = field.surfaces(x, z, S);
    if (s.c < 0.3) return;
    const site = field.layer !== "deep" && s.vault >= 0.45 && (s.theme === "lake" || s.theme === "falls"), region = s.kind === "abyss" && r1 < 0.22 + 0.2 * smooth3(0.4, 0.7, N(x / 9, z / 9, 22));
    if (!site && !region && !(s.vault >= 0.45 && (s.theme === "karst" || s.theme === "hall" || s.theme === "grotto") && r1 < 0.05)) return;
    const gx = x + (r2 - 0.5) * 0.4, gy = s.ceiling - 0.05 - r2 * 0.2;
    glow.push(gx, gy, z, r2);
    if (!Number.isNaN(s.water) && s.water > s.floor + 0.05) glowWater.push(gx, gy, z, r2, s.water, Math.max(0.5, waterReach(gx, z)));
  });
  if (glow.length) out.glow = Float32Array.from(glow);
  if (glowWater.length) out.glowWater = Float32Array.from(glowWater);
  for (const r of field.rivers || []) for (let i = 0; i < r.n; i += 5) {
    const x = r.P[i * 2], z = r.P[i * 2 + 1];
    if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size) continue;
    const big = r.w[i] > 6;
    out.sounds.push({ kind: big ? "river" : "stream", x, y: r.lv[i] + 0.3, z, range: big ? 40 : 26, gain: big ? 0.3 : 0.24 });
  }
  for (const f of field.riverFalls || []) if (f.x >= x0 && f.x < x0 + size && f.z >= z0 && f.z < z0 + size) out.sounds.push({ kind: "waterfall", x: f.x, y: (f.top + f.foot) / 2, z: f.z, range: 45, gain: 0.5 });
  if (field.layer === "deep") {
    each(LAVA.lightCell, 83, (x, z, r1) => {
      const s = field.surfaces(x, z, S);
      if (Number.isNaN(s.water) || s.water - s.floor < 0.05 || s.c < 0.5) return;
      if (r1 < 0.7) lights.push({ x, y: s.water + 1.6, z, color: 16738852, intensity: 70 + r1 * 40, range: 30, kind: "fire", flicker: r1 * 6 });
      if (r1 < 0.35) sounds.push({ kind: "fire", x, y: s.water, z, range: 24, gain: 0.9 });
    });
    placeBones();
  }
  for (const ch of field.chasms || []) {
    if (ch.x + ch.r + 6 < x0 || ch.x - ch.r - 6 > x0 + size || ch.z + ch.r + 6 < z0 || ch.z - ch.r - 6 > z0 + size) continue;
    const n2 = Math.ceil(TAU2 * (ch.r + 0.9) / 0.8);
    for (let k = 0; k < n2; k++) {
      const a = k / n2 * TAU2 + (h(k, ch.index, 61) - 0.5) * 0.12, group = N(Math.cos(a) * 2.2 + ch.index * 7, Math.sin(a) * 2.2, 62);
      if (group < 0.3 && h(k, ch.index, 63) < 0.7) continue;
      const big = group > 0.62 ? 1 + h(k, ch.index + 9, 67) * 0.9 : 0.55 + h(k, ch.index + 9, 67) * 0.5;
      const rr = ch.r + 0.55 + big * 0.35 + h(k, ch.index, 64) * 0.5 + (h(k, ch.index, 68) < 0.18 ? 1.2 + h(k, 5, 69) * 1.6 : 0), px = ch.x + Math.cos(a) * rr, pz = ch.z + Math.sin(a) * rr;
      if (px < x0 || px >= x0 + size || pz < z0 || pz >= z0 + size) continue;
      const ps = field.surfaces(px + Math.cos(a) * 1.2, pz + Math.sin(a) * 1.2, S), kk = (0.42 + h(k, ch.index + 3, 65) * 0.3) * big;
      put("rimStone", px, ps.floor - kk * 0.3, pz, (h(k, 1, 66) - 0.5) * 0.6, a * 3 + k, (h(k, 2, 66) - 0.5) * 0.5, kk * (1 + h(k, 6, 66) * 0.4), kk * (0.6 + h(k, 4, 66) * 0.6), kk * (0.85 + h(k, 7, 66) * 0.3));
    }
  }
  function placeBones() {
    for (const room of field.rooms) {
      if (room.theme !== "bones" || room.x + room.r < x0 - 40 || room.x - room.r > x0 + size + 40 || room.z + room.r < z0 - 40 || room.z - room.r > z0 + size + 40) continue;
      const rr = h(room.id, 7, 70), count2 = 1 + (rr > 0.55 ? 1 : 0);
      for (let q = 0; q < count2; q++) {
        const yaw = h(room.id, q, 71) * TAU2, len = room.r * (0.9 + h(room.id, q, 72) * 0.5), off = q ? room.r * 0.45 : 0, ox = room.x + Math.cos(yaw + 1.7) * off, oz = room.z + Math.sin(yaw + 1.7) * off;
        const dx = Math.sin(yaw), dz = Math.cos(yaw), size2 = 4.5 + h(room.id, q, 73) * 3.5;
        for (let t = -len / 2; t <= len / 2; t += size2 * 0.42) {
          const u = (t + len / 2) / len, sx = ox + dx * t, sz = oz + dz * t;
          if (sx < x0 - 6 || sx >= x0 + size + 6 || sz < z0 - 6 || sz >= z0 + size + 6) continue;
          const ss = field.surfaces(sx, sz, S);
          if (ss.c < 1.5) continue;
          const girth = Math.sin(Math.min(1, u * 1.25) * Math.PI) * (u < 0.75 ? 1 : 1 - (u - 0.75) * 2.6), sc = size2 * (0.35 + 0.65 * Math.max(0, girth));
          const inX = sx >= x0 && sx < x0 + size && sz >= z0 && sz < z0 + size;
          const ribbed = smooth3(0.08, 0.16, u) * smooth3(0.84, 0.76, u);
          if (inX) put("vertebra", sx, ss.floor + sc * (0.32 + 1.3 * ribbed), sz, (h(t, q, 74) - 0.5) * 0.3, yaw, (h(t, q, 75) - 0.5) * 0.4, sc * 0.32, sc * 0.26, sc * 0.38);
          if (girth > 0.25 && u > 0.12 && u < 0.8) for (const side of [-1, 1]) {
            const bx2 = sx + dz * side * sc * 0.78, bz2 = sz - dx * side * sc * 0.78;
            if (bx2 < x0 || bx2 >= x0 + size || bz2 < z0 || bz2 >= z0 + size) continue;
            const bs = field.surfaces(bx2, bz2, S);
            if (bs.c < 0.5 || !dryAt(bs)) continue;
            const broken = h(t * 3, side, 76) < 0.22;
            put("rib", bx2, bs.floor - 0.15, bz2, broken ? 0.9 : (h(t, side, 77) - 0.5) * 0.12, yaw + (side > 0 ? 0 : Math.PI), broken ? 1.2 : 0, sc * 0.8, sc * (broken ? 0.5 : 0.95), sc * 0.8);
          }
        }
        const hx = ox - dx * (len / 2 + size2 * 0.6), hz = oz - dz * (len / 2 + size2 * 0.6);
        if (hx >= x0 && hx < x0 + size && hz >= z0 && hz < z0 + size) {
          const hs = field.surfaces(hx, hz, S);
          if (hs.c > 1) put("skull", hx, hs.floor - size2 * 0.12, hz, (h(q, 9, 78) - 0.5) * 0.4, yaw + Math.PI + (h(q, 7, 78) - 0.5) * 0.8, (h(q, 8, 78) - 0.5) * 0.6, size2 * 0.62, size2 * 0.62, size2 * 0.62);
        }
      }
    }
    each(5.5, 79, (x, z, r1, r2, i, j) => {
      const s = field.surfaces(x, z, S);
      if (s.c < 0.6 || !dryAt(s)) return;
      const yard = s.theme === "bones" && s.vault > 0.2, valley = s.kind === "stone";
      if (!(yard ? r1 < 0.5 : valley ? r1 < 0.16 : r1 < 0.03)) return;
      const k = 0.5 + r2 * r2 * 1.6, r3 = h(i + 7, j - 3, 80);
      if (r3 < 0.18) put("skull", x, s.floor - k * 0.15, z, (r2 - 0.5) * 1.4, r1 * TAU2 * 9, (r3 - 0.5) * 2, k * 0.5, k * 0.5, k * 0.5);
      else put("bone", x, s.floor + k * 0.06, z, Math.PI / 2 + (r3 - 0.5) * 0.3, r2 * TAU2 * 7, (r1 - 0.5) * 0.3, k * 0.45, k * 1.6, k * 0.45);
    });
  }
  each(WORMS.cell * 2.5, 31, (x, z, r1) => {
    const s = field.surfaces(x, z, S);
    if (s.c < 0.8) return;
    if (wormLight(s, r1) && r1 < 0.5) lights.push({ x, y: Math.min(s.ceiling - 1.5, s.floor + 14), z, color: 5822152, intensity: 10, range: 30, kind: "glow" });
    if (!Number.isNaN(s.water) && r1 < 0.3) sounds.push({ kind: "cave", x, y: s.water, z, range: 26, gain: 0.6 });
    else if (r1 < 0.1) sounds.push({ kind: "cave", x, y: s.floor, z, range: 22, gain: 0.5 });
  });
  {
    const kept = [];
    for (const l of lights.sort((p, q) => q.intensity - p.intensity)) if (!kept.some((k) => Math.hypot(k.x - l.x, k.z - l.z) < 7)) kept.push(l);
    out.lights = kept;
  }
  const lit = [0, 0, 0, 0];
  for (const [kind, list] of Object.entries(inst)) {
    const m = new Float32Array(list.length * 16);
    list.forEach((p, i) => composeMatrix(m, i * 16, ...p));
    out.inst[kind] = m;
    if (META_KINDS.has(kind)) {
      (out.instGlow ||= {})[kind] = Float32Array.from(meta[kind]);
      continue;
    }
    if (!light || SELF_LIT.has(kind)) continue;
    const c = new Float32Array(list.length * 3);
    list.forEach((p, i) => {
      const hang = Math.abs(p[3]) > 1.5;
      light.at(p[0], p[1] + (hang ? -p[7] * 0.5 : p[7] * 0.4), p[2], void 0, void 0, void 0, lit, 0);
      packGlow(c, i * 3, lit[0], lit[1], lit[2], lit[3]);
    });
    (out.instGlow ||= {})[kind] = c;
  }
  out.kinds = [...kinds];
  out.stats = {
    vertices: count,
    triangles: index.length / 3,
    water: out.water ? out.water.index.length / 3 : 0,
    walls: boundary.length,
    instances: Object.fromEntries(Object.entries(inst).map(([k, v]) => [k, v.length])),
    glow: glow.length / 4,
    ms: typeof performance !== "undefined" ? +(performance.now() - started).toFixed(2) : 0
  };
  return out;
}
function blockTransfers(block) {
  const list = [];
  for (const part of [block.shell, block.water]) if (part) {
    for (const v of Object.values(part)) if (v?.buffer) list.push(v.buffer);
  }
  for (const v of Object.values(block.inst)) list.push(v.buffer);
  for (const v of Object.values(block.instGlow || {})) list.push(v.buffer);
  if (block.glow) list.push(block.glow.buffer);
  if (block.glowWater) list.push(block.glowWater.buffer);
  if (block.rays) list.push(block.rays.buffer);
  return list;
}

// cave-mouth-mesh.js
var clamp4 = (v, a, b) => v < a ? a : v > b ? b : v;
var smooth4 = (a, b, v) => {
  const t = clamp4((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
var smax = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
};
function hash3(x, y, z, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ seed;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
function noise3(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let u = x - ix, v = y - iy, w = z - iz;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  w = w * w * (3 - 2 * w);
  const a = hash3(ix, iy, iz, seed), b = hash3(ix + 1, iy, iz, seed), c = hash3(ix, iy + 1, iz, seed), d = hash3(ix + 1, iy + 1, iz, seed);
  const e = hash3(ix, iy, iz + 1, seed), f = hash3(ix + 1, iy, iz + 1, seed), g = hash3(ix, iy + 1, iz + 1, seed), h = hash3(ix + 1, iy + 1, iz + 1, seed);
  const ab = a + (b - a) * u, cd = c + (d - c) * u, ef = e + (f - e) * u, gh = g + (h - g) * u, lo = ab + (cd - ab) * v, hi = ef + (gh - ef) * v;
  return lo + (hi - lo) * w;
}
function sampleLocalGrid(g, a, b) {
  const fa = clamp4((a - g.a0) / g.step, 0, g.na - 1.001), fb = clamp4((b - g.b0) / g.step, 0, g.nb - 1.001), i = Math.floor(fa), j = Math.floor(fb), u = fa - i, v = fb - j, d = g.data, k = j * g.na + i;
  return d[k] + (d[k + 1] - d[k]) * u + (d[k + g.na] - d[k]) * v + (d[k] - d[k + 1] - d[k + g.na] + d[k + g.na + 1]) * u * v;
}
function pitGroundSpec(p) {
  const R = p.radius + 9;
  return { a0: -R, b0: -R, step: 1, na: Math.ceil(2 * R) + 1, nb: Math.ceil(2 * R) + 1 };
}
function pitField(p, ground) {
  const seed = p.seed >>> 0, R = p.radius, nat = (x, z) => sampleLocalGrid(ground, x, z), depth = 11.5;
  return function field(x, y, z) {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const n1 = noise3(x * 0.4, y * 0.4, z * 0.4, seed) - 0.5, n2 = noise3(x * 1.1 + 5, y * 1.1, z * 1.1, seed ^ 119) - 0.5;
    const inner = R + n1 * 0.55 + n2 * 0.18 + 0.25 * Math.sin(a * 3 + seed % 7), outer = R + 4.6 + n1 * 0.5;
    const lip = 1 - smooth4(R + 2.2, R + 3.7, r + n2 * 0.6), patch = noise3(x * 0.33 + 3, 0, z * 0.33 - 7, seed ^ 20817);
    const blocks = smooth4(0.46, 0.6, patch) * (0.35 + Math.max(0, n1 + 0.15) * 1.7 + Math.max(0, n2) * 0.4);
    const top = nat(x, z) - p.top + lip * (0.07 + n1 * 0.26 + blocks * 0.35) + (1 - lip) * (blocks - 0.55) - 0.8 * smooth4(R + 3.9, R + 4.6, r);
    const ring = Math.max(inner - r, r - outer);
    return smax(smax(ring, y - top, 0.45), -depth - y, 0.3);
  };
}
function closed(field, min, max, inset) {
  return (x, y, z) => Math.max(field(x, y, z), min[0] + inset - x, x - (max[0] - inset), min[1] + inset - y, y - (max[1] - inset), min[2] + inset - z, z - (max[2] - inset));
}
function meshDomain(field, min, max, cell) {
  const dims = [0, 1, 2].map((i) => Math.max(2, Math.ceil((max[i] - min[i]) / cell)));
  const it = meshFieldStages(field, { min, cell, dims });
  let r;
  do
    r = it.next();
  while (!r.done);
  return { mesh: r.value, cell };
}
function finish(field, mesh, cell, targets, toWorld, interior) {
  {
    const it2 = sharpenStages(field, mesh, { cell });
    let r2;
    do
      r2 = it2.next();
    while (!r2.done);
  }
  const it = decimateStages(mesh, targets.map((t) => ({ triangles: t })));
  let r;
  do
    r = it.next();
  while (!r.done);
  return r.value.map((lod) => {
    const split = creaseSplit(lod, 42 * Math.PI / 180), shade = fieldShading(field, split.positions, split.smooth, { reach: 0.3 });
    const p = split.positions, n = split.normals, count = p.length / 3, P = new Float32Array(p.length), N = new Float32Array(p.length);
    for (let i = 0; i < count; i++) {
      const o = i * 3, w = toWorld(p[o], p[o + 1], p[o + 2], n[o], n[o + 1], n[o + 2]);
      P[o] = w[0];
      P[o + 1] = w[1];
      P[o + 2] = w[2];
      N[o] = w[3];
      N[o + 1] = w[4];
      N[o + 2] = w[5];
      if (interior) shade[i * 2] = Math.max(shade[i * 2], interior(p[o], p[o + 1], p[o + 2]));
    }
    return { position: P, normal: N, uv: shade, index: Uint32Array.from(split.indices) };
  });
}
function meshRock(field, { min, max, cell, triangles, toWorld, interior = null }) {
  const closedField = closed(field, min, max, cell * 1.5), { mesh, cell: c } = meshDomain(closedField, min, max, cell);
  return { lods: finish(closedField, mesh, c, triangles, toWorld, interior), base: mesh.indices.length / 3 };
}
function buildPitRock(p, ground, { cell = 0.4, triangles = [5200, 1400] } = {}) {
  const started = typeof performance !== "undefined" ? performance.now() : 0;
  const R = p.radius + 5.4;
  let topMax = 0;
  for (let i = 0; i < ground.data.length; i++) topMax = Math.max(topMax, ground.data[i] - p.top);
  const min = [-R, -13.2, -R], max = [R, topMax + 2.5, R], field = closed(pitField(p, ground), min, max, cell * 1.5);
  const { mesh, cell: c } = meshDomain(field, min, max, cell);
  const toWorld = (x, y, z, nx, ny, nz) => [x, y, z, nx, ny, nz];
  const interior = (x, y, z) => Math.hypot(x, z) < p.radius + 0.6 ? smooth4(-0.5, -7, y) : 0;
  const lods = finish(field, mesh, c, triangles, toWorld, interior);
  return { lods, stats: { base: mesh.indices.length / 3, near: lods[0].index.length / 3, ms: typeof performance !== "undefined" ? Math.round(performance.now() - started) : 0 } };
}
function rockTransfers(result) {
  const out = [];
  for (const l of result.lods) for (const v of Object.values(l)) out.push(v.buffer);
  return out;
}

// fall-lip-rock.js
var LIP_ROCK = Object.freeze({
  version: "lip-rock-v5",
  // v99.6: the ground round it changed (worldgen/terrain-sampler.js LIP_BANK)
  back: 3.4,
  // m upstream of where the drawn river stops (it narrows over its last 3 m)
  margin: 2.4,
  // m out from the sheet's sides
  notch: LIP_SHEET.depth,
  // the water's least depth over the lip (v99.5: the river's bed, water-fall-edges.js lipBedLevel)
  under: 0.12,
  // the notch's floor under the drawn bed (v99.5 .08; v99.6: the narrowed channel's bed is drawn on 4/3 m triangles, and the rock's 0.5 m samples of it stood a few cm over its true middle)
  wall: 0.55,
  // the notch's sides rise over this (m): out of the water at the sheet's edges
  above: 0.16,
  // the rock beside the notch over the water (m)
  face: 1.3,
  // the face's least depth (m; v99.4 2.5)
  cell: 0.3,
  triangles: Object.freeze([8e3, 1800]),
  round: 0.3
  // the edges' rounding (m)
});
var clamp5 = (v, a, b) => v < a ? a : v > b ? b : v;
var hash01 = (n, seed) => {
  let h = Math.imul((n | 0) ^ seed, 2654435761) >>> 0;
  h = Math.imul(h ^ h >>> 16, 2246822507) >>> 0;
  h = Math.imul(h ^ h >>> 13, 3266489909) >>> 0;
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
};
var smooth5 = (a, b, v) => {
  const t = clamp5((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function lipRockSpec(fall, setback) {
  const W2 = fall.width / 2, length = LIP_ROCK.back + setback, height = Math.max(2, fall.lip.y - fall.base.y);
  let seed = 2166136261;
  for (const c of String(fall.id)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  return { id: fall.id, x: fall.lip.x, y: fall.lip.y, z: fall.lip.z, flow: { x: fall.flow.x, z: fall.flow.z }, halfWidth: W2, reach: W2 + LIP_ROCK.margin, length, height, seed };
}
function lipGroundSpec(spec) {
  const V = spec.reach + 1.5;
  return { a0: -(spec.length + 2), b0: -V, step: 0.5, na: Math.ceil((spec.length + 4) / 0.5) + 1, nb: Math.ceil(2 * V / 0.5) + 1 };
}
var lipWorld = (spec, a, v) => ({ x: spec.x + spec.flow.x * a - spec.flow.z * v, z: spec.z + spec.flow.z * a + spec.flow.x * v });
function lipReservation(spec) {
  const P = [[-(spec.length + 0.8), -spec.reach], [0.6, -spec.reach], [0.6, spec.reach], [-(spec.length + 0.8), spec.reach]].map(([a, v]) => lipWorld(spec, a, v));
  return {
    id: "fall-lip:" + spec.id,
    ownerId: "fall-lip",
    shape: "polygon",
    points: P,
    layers: ["trees", "treeCrowns", "rocks", "decor", "groundcover"],
    bounds: { minX: Math.min(...P.map((p) => p.x)), maxX: Math.max(...P.map((p) => p.x)), minZ: Math.min(...P.map((p) => p.z)), maxZ: Math.max(...P.map((p) => p.z)) }
  };
}
function lipTop(spec, ground, a, v) {
  const W2 = spec.halfWidth, av = Math.abs(v), nat = (aa, vv) => sampleLocalGrid(ground, aa, vv);
  const bank = nat(-spec.length, v);
  const floor = Math.max(nat(a, v), lipBedLevel(nat(-2.5, v), nat(-LIP_SHEET.ref, v), a)) - LIP_ROCK.under;
  const wander = (noise3(a * 0.7 + 11, 0, v > 0 ? 3.1 : -3.1, spec.seed >>> 0) - 0.5) * 0.36;
  let top = floor + (LIP_ROCK.above - floor) * smooth5(W2 - 0.35 + wander, W2 - 0.35 + wander + LIP_ROCK.wall, av);
  if (av > W2) top = Math.max(top, Math.min(bank - 0.04, LIP_ROCK.above + 0.9 * (1 - Math.exp(-(av - W2) / 0.9))));
  const g = nat(a, v);
  top += (Math.min(top, g) - 0.4 - top) * smooth5(-spec.length + 1.7, -spec.length, a);
  top += (Math.min(top, g) - 0.4 - top) * smooth5(spec.reach - 1.3, spec.reach, av);
  return top;
}
var faceAt = (spec, av) => 0.04 - 1.9 * smooth5(spec.reach - 1.7, spec.reach, av);
function lipRockField(spec, ground) {
  const seed = spec.seed >>> 0, nat = (a, v) => sampleLocalGrid(ground, a, v), H = spec.height;
  return function field(a, y, v) {
    const av = Math.abs(v);
    const n1 = noise3(a * 0.55, y * 0.35, v * 0.55, seed) - 0.5, n2 = noise3(a * 1.7 + 5, y * 1.7, v * 1.7 - 3, seed ^ 23130) - 0.5;
    const n3 = noise3(a * 4.1 - 7, y * 4.1 + 2, v * 4.1, seed ^ 15420) - 0.5;
    const bedding = 0.1 * Math.abs(Math.sin(y * 2.4 + n1 * 2.2 + seed % 5)), joints = 0.09 * Math.abs(Math.sin(v * 1.15 + seed % 7 + n2 * 1.6)) ** 8;
    const rough = smooth5(spec.halfWidth + 0.3, spec.halfWidth + 1.4, av);
    const shelf = smooth5(spec.halfWidth + 0.45, spec.halfWidth + 1.1, av), blockAt = (a + 40 + n1 * 0.9) / 1.35, k = Math.floor(blockAt), f = blockAt - k;
    const kk = k * 2 + (v > 0 ? 1 : 0), step = hash01(kk, seed) - 0.5, tilt = hash01(kk + 101, seed) - 0.5;
    const crack = 0.16 * (1 - smooth5(0, 0.07, Math.min(f, 1 - f)));
    const blocks = shelf * (step * 0.26 + tilt * 0.16 * (av - spec.halfWidth - 1.2) - crack);
    const top = lipTop(spec, ground, a, v) + blocks + (av > spec.halfWidth - 0.1 ? n1 * (0.04 + 0.14 * rough) + n2 * (0.02 + 0.05 * rough) : n1 * 0.025);
    const detail = n1 * 0.28 + n2 * 0.08 - bedding - joints, open = smooth5(spec.halfWidth + 0.6, spec.halfWidth + 1.6, av);
    const front = faceAt(spec, av) + Math.max(detail, 0) * 0.6 * (1 - open) + (detail + step * 0.34) * open;
    const bottom = Math.max(-(H + 0.5), Math.min(-LIP_ROCK.face, top - 0.9, nat(Math.max(front, 0.05) + 0.1, v) - 0.35));
    const body = smax(Math.max(-(spec.length + 0.8) - a, a - front, bottom - y), av - spec.reach - n1 * 0.5, 0.9);
    return smax(body, y - top, LIP_ROCK.round) + n2 * 0.03 + n3 * 0.012;
  };
}
function buildLipRock(spec, ground, { cell = LIP_ROCK.cell, triangles = LIP_ROCK.triangles } = {}) {
  const started = typeof performance !== "undefined" ? performance.now() : 0;
  const field = lipRockField(spec, ground);
  let low = 0;
  for (let i = 0; i < ground.data.length; i++) low = Math.min(low, ground.data[i]);
  const min = [-(spec.length + 1.6), Math.max(-(spec.height + 1.4), low - 1.2), -(spec.reach + 0.9)], max = [1.4, 1.6, spec.reach + 0.9];
  const fx = spec.flow.x, fz = spec.flow.z;
  const toWorld = (a, y, v, na, ny, nv) => [a * fx - v * fz, y, a * fz + v * fx, na * fx - nv * fz, ny, na * fz + nv * fx];
  const { lods, base } = meshRock(field, { min, max, cell, triangles, toWorld });
  return { lods, stats: { base, near: lods[0].index.length / 3, far: lods[1]?.index.length / 3, ms: typeof performance !== "undefined" ? Math.round(performance.now() - started) : 0 } };
}
function lipColliders(spec, ground, owner) {
  const yaw = Math.atan2(spec.flow.z, spec.flow.x), tris = [], P = (a, v) => {
    const w = lipWorld(spec, a, v);
    return [w.x, spec.y + lipTop(spec, ground, a, v) + 0.02, w.z];
  };
  let step = 0.5;
  while ((Math.ceil((spec.length + 0.64) / step) + 1) * (Math.ceil(2 * spec.reach / step) + 1) * 2 > 500) step *= 1.1;
  const as = [], vs = [];
  for (let a = -spec.length - 0.6; a < 0.04; a += step) as.push(a);
  as.push(0.04);
  for (let v = -spec.reach; v < spec.reach; v += step) vs.push(v);
  vs.push(spec.reach);
  let topMax = -Infinity;
  for (let i = 0; i < as.length - 1; i++) for (let j = 0; j < vs.length - 1; j++) {
    const p = P(as[i], vs[j]), q = P(as[i + 1], vs[j]), r = P(as[i], vs[j + 1]), s = P(as[i + 1], vs[j + 1]);
    for (const t of [[...p, ...r, ...q], [...q, ...r, ...s]]) {
      const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2], vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2];
      let ny = uz * vx - ux * vz;
      const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
      if (ny < 0) {
        t.splice(0, 9, ...t.slice(0, 3), ...t.slice(6, 9), ...t.slice(3, 6));
        ny = -ny;
      }
      if (ny / Math.hypot(nx, ny, nz) <= 0.46) continue;
      tris.push(t);
      topMax = Math.max(topMax, t[1], t[4], t[7]);
    }
  }
  const mid = lipWorld(spec, (-spec.length - 0.6 + 0.04) / 2, 0);
  return [{
    id: owner + "/lip",
    shape: "obb",
    x: mid.x,
    z: mid.z,
    yaw,
    halfX: (spec.length + 0.64) / 2,
    halfZ: spec.reach,
    minY: spec.y - Math.min(spec.height, 12),
    maxY: topMax + 0.05,
    type: "Stone",
    support: true,
    ceiling: false,
    solid: true,
    supportTriangles: tris,
    supportGroup: owner + "/lip"
  }];
}

export {
  createUnderworldField,
  placeInRoom,
  roomProps,
  linearColor,
  packGlow,
  SELF_LIT,
  MEADOW_KINDS,
  BLOCK,
  buildUnderworldBlock,
  blockTransfers,
  noise3,
  pitGroundSpec,
  buildPitRock,
  rockTransfers,
  LIP_ROCK,
  lipRockSpec,
  lipGroundSpec,
  lipWorld,
  lipReservation,
  buildLipRock,
  lipColliders
};
