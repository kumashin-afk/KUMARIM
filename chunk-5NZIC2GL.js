// survival-pickable-atlas.js
var ATLAS_SIZE = 1024;
var ATLAS = Object.freeze({
  litter: [0, 0, 512, 512],
  frond: [512, 0, 256, 512],
  plume: [768, 0, 128, 256],
  petal: [896, 0, 128, 128],
  disc: [896, 128, 128, 128],
  leaf: [768, 256, 256, 256],
  capRed: [0, 512, 256, 256],
  capGreen: [256, 512, 256, 256],
  capBlue: [512, 512, 256, 256],
  gills: [768, 512, 256, 256],
  cloth: [0, 768, 256, 256],
  stem: [256, 768, 256, 256],
  bark: [512, 768, 256, 256],
  blade: [768, 768, 128, 256],
  wood: [896, 768, 128, 128],
  berry: [896, 896, 96, 96],
  white: [992, 992, 32, 32]
});
var CUTOUT = ["litter", "frond", "plume", "petal", "disc", "leaf"];
var clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
var mix = (a, b, t) => a + (b - a) * t;
var smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
var hex = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
var lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = s + 1831565813 >>> 0;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let h = x * 374761393 + y * 668265263 + s * 2147483647 | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function noise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return mix(mix(hash2(xi, yi, s), hash2(xi + 1, yi, s), u), mix(hash2(xi, yi + 1, s), hash2(xi + 1, yi + 1, s), u), v);
}
var fbm = (x, y, s = 0, octaves = 4) => {
  let a = 0, w = 0.5, f = 1, n = 0;
  for (let i = 0; i < octaves; i++) {
    a += noise(x * f, y * f, s + i * 17) * w;
    n += w;
    w *= 0.5;
    f *= 2.03;
  }
  return a / n;
};
function noiseWrap(x, y, period, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = (xi % period + period) % period, b = (a + 1) % period;
  return mix(mix(hash2(a, yi, s), hash2(b, yi, s), u), mix(hash2(a, yi + 1, s), hash2(b, yi + 1, s), u), v);
}
function canvas() {
  return new Float32Array(ATLAS_SIZE * ATLAS_SIZE * 4);
}
function put(img, region, x, y, rgb, a) {
  const r = ATLAS[region];
  if (x < 0 || y < 0 || x >= r[2] || y >= r[3] || a <= 0) return;
  const i = ((r[1] + y) * ATLAS_SIZE + r[0] + x) * 4, da = img[i + 3], oa = a + da * (1 - a);
  const k = a / oa, j = 1 - k;
  img[i] = rgb[0] * k + img[i] * j;
  img[i + 1] = rgb[1] * k + img[i + 1] * j;
  img[i + 2] = rgb[2] * k + img[i + 2] * j;
  img[i + 3] = oa;
}
function paint(img, region, f) {
  const r = ATLAS[region];
  for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) {
    const c = f(x + 0.5, y + 0.5, (x + 0.5) / r[2], (y + 0.5) / r[3]);
    const i = ((r[1] + y) * ATLAS_SIZE + r[0] + x) * 4;
    img[i] = c[0];
    img[i + 1] = c[1];
    img[i + 2] = c[2];
    img[i + 3] = c[3] ?? 1;
  }
}
function stampLeaf(img, region, base, tip, width, { shape, teeth = 0, toothCount = 18, petiole = 0, colour, vein = 0.1, veinCount = 7, midrib = 0.14, seed = 1 }) {
  const dx = tip[0] - base[0], dy = tip[1] - base[1], len2 = Math.hypot(dx, dy), ux = dx / len2, uy = dy / len2, px = -uy, py = ux;
  const x0 = Math.floor(Math.min(base[0], tip[0]) - width - 2), x1 = Math.ceil(Math.max(base[0], tip[0]) + width + 2);
  const y0 = Math.floor(Math.min(base[1], tip[1]) - width - 2), y1 = Math.ceil(Math.max(base[1], tip[1]) + width + 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const rx = x + 0.5 - base[0], ry = y + 0.5 - base[1], along = rx * ux + ry * uy, across = rx * px + ry * py;
    let t = along / len2;
    if (t < -0.02 || t > 1.01) continue;
    let half;
    if (petiole > 0 && t < petiole) half = Math.max(1.1, width * 0.045 * (1.4 - clamp(t / petiole) * 0.4));
    else {
      const tl = (t - petiole) / (1 - petiole);
      half = width * shape(clamp(tl));
      if (teeth) half *= 1 - teeth * Math.pow(Math.abs(Math.sin(tl * toothCount * Math.PI)), 0.5) * smooth(0.05, 0.25, tl) * (1 - smooth(0.88, 1, tl));
    }
    const edge = half - Math.abs(across), a = clamp(edge + 0.5) * clamp((1.005 - t) * len2 + 0.5);
    if (a <= 0) continue;
    const s = across / Math.max(half, 1e-3);
    let c = colour(clamp(t), s, edge);
    if (t >= petiole) {
      const tl = (t - petiole) / (1 - petiole);
      const mid = midrib > 0 ? clamp(1 - Math.abs(across) / Math.max(1.2, width * midrib * (1 - tl * 0.7))) : 0;
      const side = Math.abs(Math.sin((tl * veinCount - Math.abs(s) * 0.9) * Math.PI));
      const v = Math.max(mid * 0.9, Math.pow(clamp(1 - side * 4.5), 2) * vein * smooth(0.95, 0.2, Math.abs(s)));
      c = lerp3(c, [Math.min(1, c[0] * 1.35 + 0.05), Math.min(1, c[1] * 1.25 + 0.05), Math.min(1, c[2] * 1.2 + 0.03)], v);
      const n = fbm(x * 0.09, y * 0.09, seed) - 0.5;
      c = c.map((k) => clamp(k * (1 + n * 0.22)));
    } else c = colour(0, 0, 3).map((k) => k * 1.12);
    put(img, region, x, y, c, a);
  }
}
function stampCapsule(img, region, a, b, ra, rb, rgb, alpha = 1) {
  const x0 = Math.floor(Math.min(a[0], b[0]) - Math.max(ra, rb) - 2), x1 = Math.ceil(Math.max(a[0], b[0]) + Math.max(ra, rb) + 2);
  const y0 = Math.floor(Math.min(a[1], b[1]) - Math.max(ra, rb) - 2), y1 = Math.ceil(Math.max(a[1], b[1]) + Math.max(ra, rb) + 2);
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const qx = x + 0.5 - a[0], qy = y + 0.5 - a[1], t = clamp((qx * dx + qy * dy) / l2), d = Math.hypot(qx - dx * t, qy - dy * t), r = mix(ra, rb, t);
    const cov = clamp(r - d + 0.5);
    if (cov > 0) put(img, region, x, y, typeof rgb === "function" ? rgb(t, d / Math.max(r, 0.5) * Math.sign(qx * dy - qy * dx || 1)) : rgb, cov * alpha);
  }
}
function stampEllipse(img, region, cx, cy, rx, ry, angle, rgb, alpha = 1) {
  const c = Math.cos(angle), s = Math.sin(angle), m = Math.max(rx, ry) + 2;
  for (let y = Math.floor(cy - m); y <= Math.ceil(cy + m); y++) for (let x = Math.floor(cx - m); x <= Math.ceil(cx + m); x++) {
    const qx = x + 0.5 - cx, qy = y + 0.5 - cy, u = (qx * c + qy * s) / rx, v = (-qx * s + qy * c) / ry, d = Math.hypot(u, v);
    const cov = clamp((1 - d) * Math.min(rx, ry) + 0.5);
    if (cov > 0) put(img, region, x, y, typeof rgb === "function" ? rgb(u, v, d) : rgb, cov * alpha);
  }
}
var ovate = (t) => Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)), 0.72) * (1 - 0.32 * t) * (t > 0.86 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.86) / 0.15, 2)) * 0.8 + 0.2) : 1);
function paintLeaf(img) {
  const green = hex(4878898), light = hex(7312451), yellow = hex(10133578);
  stampLeaf(img, "leaf", [128, 250], [128, 8], 86, {
    shape: ovate,
    teeth: 0.055,
    toothCount: 22,
    petiole: 0.1,
    seed: 3,
    vein: 0.55,
    veinCount: 7,
    colour: (t, s, edge) => {
      let c = lerp3(green, light, 0.25 + 0.35 * Math.abs(s));
      c = lerp3(c, yellow, smooth(0.6, 1, t) * 0.12);
      return edge < 2.5 ? c.map((k) => k * 0.82) : c;
    }
  });
}
function paintLitter(img) {
  const rand = rng(77), browns = [11041098, 12094293, 9660734, 12885090, 10321240, 9071174, 11900008].map(hex);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, r = 40 + rand() * 170, cx = 256 + Math.cos(a) * r * 0.9, cy = 256 + Math.sin(a) * r * 0.9;
    stampCapsule(img, "litter", [cx, cy], [cx + Math.cos(a + 1.3) * (30 + rand() * 50), cy + Math.sin(a + 1.3) * (30 + rand() * 50)], 1.1, 0.8, hex(9204304), 0.9);
  }
  for (let i = 0; i < 15; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 175, cx = 256 + Math.cos(a) * r, cy = 256 + Math.sin(a) * r, dir = rand() * Math.PI * 2;
    const len2 = 70 + rand() * 75, w = len2 * (0.26 + rand() * 0.16), base = [cx - Math.cos(dir) * len2 / 2, cy - Math.sin(dir) * len2 / 2], tip = [cx + Math.cos(dir) * len2 / 2, cy + Math.sin(dir) * len2 / 2];
    const col = browns[Math.floor(rand() * browns.length)], dark = col.map((k) => k * 0.72), spots = rand() * 100;
    stampLeaf(img, "litter", base, tip, w, {
      shape: i % 4 === 0 ? (t) => Math.pow(Math.sin(Math.PI * t), 0.8) * (1 + 0.18 * Math.sin(t * 22)) : ovate,
      teeth: i % 3 === 0 ? 0.08 : 0,
      petiole: 0.08,
      seed: 30 + i,
      vein: 0.4,
      veinCount: 6,
      colour: (t, s, edge) => {
        let c = lerp3(col, dark, smooth(0.35, 0.9, fbm(t * 6 + spots, s * 2, i)) * 0.7);
        if (edge < 3) c = c.map((k) => k * 0.8);
        return c.map((k) => k * (0.9 + 0.2 * noise(t * 30, s * 6, i)));
      }
    });
  }
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 190, cx = 256 + Math.cos(a) * r, cy = 256 + Math.sin(a) * r, d = rand() * Math.PI;
    stampCapsule(img, "litter", [cx, cy], [cx + Math.cos(d) * 34, cy + Math.sin(d) * 34], 1.2, 0.7, hex(rand() < 0.5 ? 10582602 : 12556898), 0.95);
  }
}
function paintFrond(img) {
  const rand = rng(91), stalk = hex(7050306), dark = hex(4155946), mid = hex(5603898);
  const rachis = (t) => [128 + Math.sin(t * 2.4) * 10 * t, 506 - t * 496];
  for (let k = 0; k < 40; k++) stampCapsule(img, "frond", rachis(k / 40), rachis((k + 1) / 40), 3.2 - 2.4 * k / 40, 3.2 - 2.4 * (k + 1) / 40, stalk);
  for (let i = 0; i < 13; i++) {
    const t = 0.1 + i * 0.068, side = i % 2 ? 1 : -1, at = rachis(t), span = (1 - t) * 118 + 18, angle = -Math.PI / 2 + side * (0.95 - t * 0.3);
    const tip = [at[0] + Math.cos(angle) * span, at[1] + Math.sin(angle) * span];
    stampCapsule(img, "frond", at, tip, 1.7, 0.6, stalk);
    const lobes = Math.max(2, Math.round(span / 13));
    for (let j = 0; j < lobes; j++) {
      const f = (j + 0.6) / (lobes + 0.3), p = [mix(at[0], tip[0], f), mix(at[1], tip[1], f)], size = (1 - f * 0.55) * Math.min(22, span * 0.32) + 4;
      for (const s of [-1, 1]) {
        const a2 = angle + s * (1.05 + rand() * 0.2) - side * 0.15, q = [p[0] + Math.cos(a2) * size, p[1] + Math.sin(a2) * size];
        stampLeaf(img, "frond", p, q, size * 0.2 + 1.5, {
          shape: (t2) => Math.pow(Math.sin(Math.PI * Math.min(1, t2 * 0.9 + 0.1)), 0.6) * (1 + 0.35 * Math.sin(t2 * 9)),
          petiole: 0,
          seed: i * 7 + j,
          vein: 0,
          midrib: 0.25,
          colour: (t2, s2) => lerp3(dark, mid, 0.3 + 0.5 * t2 + 0.2 * rand())
        });
      }
      if (j === lobes - 1) stampLeaf(img, "frond", p, [tip[0] + Math.cos(angle) * 6, tip[1] + Math.sin(angle) * 6], 3.2, { shape: (t2) => Math.sin(Math.PI * Math.min(1, t2 + 0.1)), seed: 3, vein: 0, colour: () => mid });
    }
  }
  stampLeaf(img, "frond", rachis(0.93), [rachis(1)[0], 4], 7, { shape: (t2) => Math.sin(Math.PI * Math.min(1, t2 + 0.05)), seed: 9, vein: 0, colour: () => mid });
}
function paintPlume(img) {
  const rand = rng(23), straw = hex(14272670), pink = hex(12032655), pale = hex(15524548);
  const stalk = (t) => [64 + Math.sin(t * 2.2) * 6, 252 - t * 246];
  for (let k = 0; k < 24; k++) stampCapsule(img, "plume", stalk(k / 24), stalk((k + 1) / 24), 1.3, 1.1, hex(12167028));
  for (let i = 0; i < 150; i++) {
    const t = 0.04 + Math.pow(rand(), 0.8) * 0.94, at = stalk(t), side = rand() < 0.5 ? -1 : 1, spread = (1 - t) * 0.55 + 0.22, a = -Math.PI / 2 + side * (spread * (0.4 + rand() * 0.7));
    const len2 = (16 + rand() * 18) * (1 - Math.pow(t, 2) * 0.5), tip = [at[0] + Math.cos(a) * len2, at[1] + Math.sin(a) * len2];
    const c = lerp3(lerp3(straw, pink, rand() * 0.7), pale, rand() * 0.3);
    stampCapsule(img, "plume", at, tip, 0.55, 0.35, c.map((k) => k * 0.9), 0.85);
    stampEllipse(img, "plume", mix(at[0], tip[0], 0.75), mix(at[1], tip[1], 0.75), 1.6, 5.2, a + Math.PI / 2, c, 0.95);
    if (rand() < 0.6) stampCapsule(img, "plume", tip, [tip[0] + Math.cos(a - side * 0.3) * 7, tip[1] + Math.sin(a - side * 0.3) * 7], 0.3, 0.2, pale, 0.55);
  }
}
function paintPetal(img) {
  const shape = (t) => (0.22 + 0.78 * Math.pow(Math.sin(Math.PI * 0.5 * Math.min(1, t / 0.72)), 0.9)) * (t > 0.8 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.8) / 0.21, 2))) * 0.85 + 0.15 : 1);
  stampLeaf(img, "petal", [64, 125], [64, 5], 50, { shape, petiole: 0, seed: 5, vein: 0, midrib: 0, colour: (t, s, edge) => {
    const veins = 0.5 + 0.5 * Math.cos(Math.atan2(s * t, 1.4 - t) * 46);
    let c = lerp3([0.98, 0.97, 0.94], [0.88, 0.86, 0.82], veins * 0.55 * smooth(0.95, 0.2, t));
    c = lerp3(c, [0.93, 0.9, 0.62], smooth(0.22, 0, t) * 0.7);
    return edge < 2 ? c.map((k) => k * 0.93) : c;
  } });
}
function paintDisc(img) {
  paint(img, "disc", (x, y) => {
    const dx = x - 64, dy = y - 64, r = Math.hypot(dx, dy) / 60, a = clamp((1 - r) * 60 + 0.5);
    if (a <= 0) return [0.75, 0.55, 0.1, 0];
    const k = Math.round(r * r * 160), phi = k * 2.39996, cx = 64 + Math.sqrt(k / 160) * 60 * Math.cos(phi), cy = 64 + Math.sqrt(k / 160) * 60 * Math.sin(phi);
    const dot2 = clamp(1 - Math.hypot(x - cx, y - cy) / 4.2);
    let c = lerp3(hex(10118420), hex(14197542), smooth(0.15, 0.85, r));
    c = lerp3(c, hex(15979605), dot2 * smooth(0.25, 0.6, r));
    return [...c.map((v) => v * (0.9 + 0.2 * noise(x * 0.3, y * 0.3, 4))), a];
  });
}
function paintCap(img, region, { centre, middle, rim, edge, spots = null, streaks = 0, seed }) {
  const rand = rng(seed), list = [];
  if (spots) for (let i = 0; i < spots.count; i++) {
    const r = Math.sqrt(mix(spots.from ** 2, spots.to ** 2, rand())), a = rand() * Math.PI * 2;
    list.push([r * Math.cos(a), r * Math.sin(a), spots.size * (0.55 + rand() * 0.8), rand()]);
  }
  paint(img, region, (x, y, u, v) => {
    let c = v < 0.5 ? lerp3(centre, middle, smooth(0, 0.5, v)) : lerp3(middle, rim, smooth(0.5, 0.93, v));
    c = lerp3(c, edge, smooth(0.93, 1, v));
    const n = noiseWrap(u * 24, v * 10, 24, seed) - 0.5, fine = noiseWrap(u * 160, v * 4, 160, seed + 1) - 0.5;
    c = c.map((k) => k * (1 + n * 0.16 + fine * streaks * smooth(0.3, 1, v)));
    if (spots) {
      const px = v * Math.cos(u * Math.PI * 2), py = v * Math.sin(u * Math.PI * 2);
      for (const s of list) {
        const d = Math.hypot(px - s[0], py - s[1]) / s[2];
        if (d < 1.25) {
          const wobble = 1 + 0.25 * (noise(px * 60, py * 60, seed) - 0.5);
          c = lerp3(c, spots.colour.map((k) => k * (0.9 + 0.12 * s[3])), clamp((1 - d * wobble) * 6));
        }
      }
    }
    return [...c, 1];
  });
}
function paintGills(img) {
  paint(img, "gills", (x, y, u, v) => {
    const main = Math.pow(Math.abs(Math.cos(u * Math.PI * 72)), 6), short = Math.pow(Math.abs(Math.cos(u * Math.PI * 144 + Math.PI / 2)), 6) * smooth(0.45, 0.6, v);
    const shade = 0.74 + 0.26 * Math.max(main, short * 0.9), n = noiseWrap(u * 40, v * 6, 40, 8) - 0.5;
    const c = [0.97, 0.94, 0.87].map((k) => k * shade * (1 + n * 0.08) * mix(0.86, 1, smooth(0, 0.25, v)));
    return [...c, 1];
  });
}
function paintStem(img) {
  paint(img, "stem", (x, y, u, v) => {
    const fibres = noiseWrap(u * 64, v * 3, 64, 12), fine = noiseWrap(u * 160, v * 9, 160, 13);
    const c = [0.96, 0.93, 0.86].map((k) => k * (0.86 + 0.14 * fibres) * (0.95 + 0.05 * fine));
    return [...c, 1];
  });
}
function paintCloth(img) {
  paint(img, "cloth", (x, y, u, v) => {
    const n = 64, i = Math.floor(u * n), j = Math.floor(v * n), fu = u * n - i, fv = v * n - j;
    const warp = (i + j) % 2 === 0, across = warp ? fu : fv, along = warp ? fv : fu;
    const thread = Math.sin(Math.PI * across) * (0.75 + 0.25 * Math.sin(Math.PI * along));
    const gap = smooth(0.12, 0, Math.min(fu, 1 - fu)) * smooth(0.12, 0, Math.min(fv, 1 - fv));
    const slub = noise(warp ? i * 3.1 : v * 40, warp ? u * 40 : j * 3.1, warp ? 1 : 2);
    let c = lerp3(hex(9073488), hex(11047018), slub);
    const dirt = smooth(0.5, 0.85, fbm(u * 4, v * 4, 31));
    c = c.map((k) => k * (0.6 + 0.4 * thread) * (1 - gap * 0.5) * (1 - dirt * 0.22));
    return [...c, 1];
  });
}
function paintBark(img) {
  const rand = rng(41), lenticels = Array.from({ length: 90 }, () => [rand(), rand(), 3 + rand() * 5]);
  paint(img, "bark", (x, y, u, v) => {
    const fissure = Math.pow(1 - Math.abs(noiseWrap(u * 9, v * 2.2, 9, 41) * 2 - 1), 8);
    const grain = noiseWrap(u * 48, v * 6, 48, 42), blotch = fbm(u * 6, v * 3, 43);
    let c = lerp3(hex(5915441), hex(8414026), grain * 0.55 + blotch * 0.45);
    c = c.map((k) => k * (1 - fissure * 0.55));
    const lichen = smooth(0.62, 0.72, fbm(u * 8 + 3, v * 5, 44));
    c = lerp3(c, hex(9411182), lichen * 0.75);
    const moss = smooth(0.66, 0.78, fbm(u * 5 - 7, v * 3, 45));
    c = lerp3(c, hex(5662766), moss * 0.6);
    for (const l of lenticels) {
      const dx = Math.min(Math.abs(u - l[0]), 1 - Math.abs(u - l[0])) * 256, dy = Math.abs(v - l[1]) * 256;
      if (dx < l[2] && dy < 1.3) c = lerp3(c, hex(12101514), 0.7 * (1 - dx / l[2]));
    }
    return [...c, 1];
  });
}
function paintBlade(img) {
  paint(img, "blade", (x, y, u, v) => {
    const across = Math.abs(u - 0.5) * 2, veins = 0.9 + 0.1 * Math.cos(u * Math.PI * 14), mid = smooth(0.12, 0, across) * 0.12;
    const edge = smooth(0.82, 1, across) * 0.25, n = noise(u * 8, v * 90, 51);
    return [...[1, 1, 1].map((k) => k * (veins + mid - edge) * (0.94 + 0.1 * n)), 1];
  });
}
function paintBerry(img) {
  paint(img, "berry", (x, y) => {
    const cell = 9, row = Math.floor(y / (cell * 0.87)), off = row % 2 ? cell / 2 : 0, cx = Math.floor((x - off) / cell) * cell + off + cell / 2, cy = row * cell * 0.87 + cell * 0.43;
    const d = Math.hypot(x - cx, y - cy) / (cell * 0.55), dome = Math.sqrt(Math.max(0, 1 - d * d));
    const glint = Math.max(0, 1 - Math.hypot(x - cx + 1.4, y - cy + 1.6) / 1.7);
    let c = lerp3(hex(6162966), hex(12590387), dome);
    c = lerp3(c, hex(16167096), glint * 0.8);
    return [...c, 1];
  });
}
function paintWood(img) {
  paint(img, "wood", (x, y) => {
    const dx = x - 64, dy = y - 64, r = Math.hypot(dx, dy) / 62, wobble = (noise(dx * 0.05, dy * 0.05, 61) - 0.5) * 0.08;
    const rings = 0.5 + 0.5 * Math.cos((r + wobble) * Math.PI * 18), crack = Math.pow(1 - Math.abs(Math.sin(Math.atan2(dy, dx) * 2.5 + 1)), 30) * smooth(0.2, 0.8, r);
    let c = lerp3(hex(13217930), hex(11045474), rings * 0.55);
    c = lerp3(c, hex(6113846), smooth(0.86, 0.98, r));
    return [...c.map((k) => k * (1 - crack * 0.35) * (0.95 + 0.1 * noise(x * 0.2, y * 0.2, 62))), 1];
  });
}
function buildMips(rgba, size) {
  const levels = [{ data: rgba, width: size, height: size }], coverage = {};
  const regionCoverage = (data, w2, scale2, [rx, ry, rw, rh], s = 1) => {
    let n = 0, total = 0;
    for (let y = Math.floor(ry * scale2); y < Math.floor((ry + rh) * scale2); y++) for (let x = Math.floor(rx * scale2); x < Math.floor((rx + rw) * scale2); x++) {
      total++;
      if (Math.min(255, data[(y * w2 + x) * 4 + 3] * s) >= 128) n++;
    }
    return total ? n / total : 0;
  };
  for (const name of CUTOUT) coverage[name] = regionCoverage(rgba, size, 1, ATLAS[name]);
  let src = rgba, w = size;
  while (w > 1) {
    const h = w >> 1, dst = new Uint8Array(h * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i2 = ((y * 2 + oy) * w + x * 2 + ox) * 4, al = src[i2 + 3] / 255;
        r += src[i2] * al;
        g += src[i2 + 1] * al;
        b += src[i2 + 2] * al;
        a += al;
      }
      const i = (y * h + x) * 4;
      if (a > 0) {
        dst[i] = r / a;
        dst[i + 1] = g / a;
        dst[i + 2] = b / a;
      } else {
        const j = (y * 2 * w + x * 2) * 4;
        dst[i] = src[j];
        dst[i + 1] = src[j + 1];
        dst[i + 2] = src[j + 2];
      }
      dst[i + 3] = Math.round(a / 4 * 255);
    }
    const scale2 = h / size;
    if (h >= 8) for (const name of CUTOUT) {
      const target = coverage[name];
      let lo = 1, hi = 6;
      for (let k = 0; k < 10; k++) {
        const m = (lo + hi) / 2;
        if (regionCoverage(dst, h, scale2, ATLAS[name], m) < target) lo = m;
        else hi = m;
      }
      const s = (lo + hi) / 2, [rx, ry, rw, rh] = ATLAS[name];
      for (let y = Math.floor(ry * scale2); y < Math.floor((ry + rh) * scale2); y++) for (let x = Math.floor(rx * scale2); x < Math.floor((rx + rw) * scale2); x++) {
        const i = (y * h + x) * 4 + 3;
        dst[i] = Math.min(255, Math.round(dst[i] * s));
      }
    }
    levels.push({ data: dst, width: h, height: h });
    src = dst;
    w = h;
  }
  return levels;
}
var painted = null;
function paintPickableAtlas() {
  if (painted) return painted;
  const img = canvas();
  paintLitter(img);
  paintFrond(img);
  paintPlume(img);
  paintPetal(img);
  paintDisc(img);
  paintLeaf(img);
  paintCap(img, "capRed", {
    centre: hex(9180686),
    middle: hex(12722970),
    rim: hex(14436892),
    edge: hex(14983238),
    streaks: 0.5,
    seed: 71,
    spots: { count: 70, from: 0.1, to: 0.93, size: 0.045, colour: hex(15920608) }
  });
  paintCap(img, "capGreen", {
    centre: hex(1923670),
    middle: hex(2917496),
    rim: hex(7319192),
    edge: hex(14081224),
    streaks: 0.3,
    seed: 72,
    spots: { count: 46, from: 0.55, to: 0.98, size: 0.022, colour: hex(15264991) }
  });
  paintCap(img, "capBlue", { centre: hex(1055818), middle: hex(2378150), rim: hex(6002160), edge: hex(11129087), streaks: 1.4, seed: 73 });
  paintGills(img);
  paintStem(img);
  paintCloth(img);
  paintBark(img);
  paintBlade(img);
  paintWood(img);
  paintBerry(img);
  paint(img, "white", () => [1, 1, 1, 1]);
  for (const [name, [rx, ry, rw, rh]] of Object.entries(ATLAS)) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
      const i = (y * ATLAS_SIZE + x) * 4, a = img[i + 3];
      r += img[i] * a;
      g += img[i + 1] * a;
      b += img[i + 2] * a;
      n += a;
    }
    if (!n) continue;
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
      const i = (y * ATLAS_SIZE + x) * 4, a = img[i + 3];
      if (a < 1) {
        const k = a;
        img[i] = img[i] * k + r / n * (1 - k);
        img[i + 1] = img[i + 1] * k + g / n * (1 - k);
        img[i + 2] = img[i + 2] * k + b / n * (1 - k);
      }
    }
  }
  const bytes = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
  for (let y = 0; y < ATLAS_SIZE; y++) for (let x = 0; x < ATLAS_SIZE; x++) {
    const i = (y * ATLAS_SIZE + x) * 4, o = ((ATLAS_SIZE - 1 - y) * ATLAS_SIZE + x) * 4;
    for (let k = 0; k < 3; k++) bytes[o + k] = Math.round(clamp(img[i + k]) * 255);
    bytes[o + 3] = Math.round(clamp(img[i + 3]) * 255);
  }
  const flipped = new Uint8Array(bytes.length);
  for (let y = 0; y < ATLAS_SIZE; y++) flipped.set(bytes.subarray((ATLAS_SIZE - 1 - y) * ATLAS_SIZE * 4, (ATLAS_SIZE - y) * ATLAS_SIZE * 4), y * ATLAS_SIZE * 4);
  const levels = buildMips(flipped, ATLAS_SIZE).map((level) => {
    const out = new Uint8Array(level.data.length), w = level.width;
    for (let y = 0; y < w; y++) out.set(level.data.subarray((w - 1 - y) * w * 4, (w - y) * w * 4), y * w * 4);
    return { data: out, width: w, height: w };
  });
  painted = levels;
  return painted;
}

// hand-tool-textures.js
var clamp2 = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
var mix2 = (a, b, t) => a + (b - a) * t;
var smooth2 = (a, b, x) => {
  const t = clamp2((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
var hex2 = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255];
var lerp32 = (a, b, t) => [mix2(a[0], b[0], t), mix2(a[1], b[1], t), mix2(a[2], b[2], t)];
function hash22(x, y, s) {
  let h = x * 374761393 + y * 668265263 + s * 2147483647 | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function noise2(x, y, period, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = (xi % period + period) % period, b = (a + 1) % period;
  return mix2(mix2(hash22(a, yi, s), hash22(b, yi, s), u), mix2(hash22(a, yi + 1, s), hash22(b, yi + 1, s), u), v);
}
var fbm2 = (x, y, period, s) => noise2(x, y, period, s) * 0.5 + noise2(x * 2, y * 2, period * 2, s + 7) * 0.3 + noise2(x * 4, y * 4, period * 4, s + 13) * 0.2;
function surface(width, height, paint2) {
  const rgba = new Uint8Array(width * height * 4), relief = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [c, h] = paint2((x + 0.5) / width, (y + 0.5) / height, x, y), i = (y * width + x) * 4;
    rgba[i] = Math.round(clamp2(c[0]) * 255);
    rgba[i + 1] = Math.round(clamp2(c[1]) * 255);
    rgba[i + 2] = Math.round(clamp2(c[2]) * 255);
    rgba[i + 3] = 255;
    relief[y * width + x] = h;
  }
  return { rgba, relief, width, height };
}
function normals({ relief, width, height }, strength, wrapY = false) {
  const out = new Uint8Array(width * height * 4);
  const at = (x, y) => {
    x = (x + width) % width;
    y = wrapY ? (y + height) % height : clamp2(y, 0, height - 1);
    return relief[y * width + x];
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * width + x) * 4;
    out[i] = Math.round((-dx / l * 0.5 + 0.5) * 255);
    out[i + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);
    out[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
    out[i + 3] = 255;
  }
  return out;
}
var HAFT_V = Object.freeze({ end: [0, 0.25], shaft: [0.25, 1] });
function paintHaft() {
  const W = 256, H = 1024, knots = [[0.12, 0.42, 0.045], [0.63, 0.66, 0.035], [0.35, 0.83, 0.03]];
  const bareWood = hex2(11770484), darkWood = hex2(9073235), grip = hex2(7297601), bark = hex2(5061936), barkLight = hex2(7692620);
  return surface(W, H, (u, vTop) => {
    const v = 1 - vTop;
    if (v < 0.25) {
      const px = (u - 0.5) * 2, py = (v / 0.25 - 0.5) * 2, r = Math.hypot(px - 0.05, py + 0.03), a = Math.atan2(py, px);
      const rings = 0.5 + 0.5 * Math.cos((r + (noise2(a * 3 + 9, r * 3, 64, 5) - 0.5) * 0.06) * 46), check = Math.pow(1 - Math.abs(Math.sin(a * 2.5 + 0.7)), 40) * smooth2(0.15, 0.8, r);
      let c2 = lerp32(hex2(13152134), hex2(10782304), rings * 0.6);
      c2 = lerp32(c2, bark, smooth2(0.88, 0.98, r));
      return [c2.map((k) => k * (1 - check * 0.4)), rings * 0.3 - check * 0.8 - smooth2(0.88, 0.98, r) * 0.5];
    }
    const s = (v - 0.25) / 0.75;
    const grain = fbm2(u * 24, s * 5, 24, 1), streak = noise2(u * 64, s * 2.5, 64, 2), line = Math.pow(Math.abs(Math.sin((u * 64 + grain * 3) * Math.PI)), 18);
    let c = lerp32(bareWood, darkWood, grain * 0.55 + streak * 0.25);
    c = c.map((k) => k * (1 - line * 0.13));
    let h = -line * 0.32 + grain * 0.45;
    for (const [ku, kv, kr] of knots) {
      const du = Math.min(Math.abs(u - ku), 1 - Math.abs(u - ku)) * 4.2, dv = s - kv, d = Math.hypot(du, dv) / kr;
      if (d < 2.6) {
        c = lerp32(c, hex2(5981232), smooth2(1.1, 0.5, d));
        c = c.map((k) => k * (1 - 0.12 * smooth2(2.6, 1.2, d) * (0.5 + 0.5 * Math.sin(d * 9))));
        h += smooth2(1.4, 0.3, d) * 1.4;
      }
    }
    const gripBand = smooth2(0.03, 0.14, s) * smooth2(0.48, 0.36, s);
    c = lerp32(c, grip, gripBand * 0.55);
    h *= 1 - gripBand * 0.5;
    const barkMask = Math.max(smooth2(0.16, 0.05, s), smooth2(0.86, 0.97, s), smooth2(0.66, 0.74, fbm2(u * 5, s * 2, 5, 3)) * smooth2(0.5, 0.7, s));
    if (barkMask > 0) {
      const fissure = Math.pow(1 - Math.abs(noise2(u * 10, s * 14, 10, 4) * 2 - 1), 6), edge = smooth2(0, 0.2, barkMask) * (1 - smooth2(0.2, 0.45, barkMask));
      const bc = lerp32(bark, barkLight, noise2(u * 40, s * 30, 40, 6)).map((k) => k * (1 - fissure * 0.5));
      c = lerp32(c, bc, smooth2(0.35, 0.55, barkMask + (noise2(u * 30, s * 40, 30, 8) - 0.5) * 0.3));
      h += smooth2(0.35, 0.55, barkMask) * (1.2 - fissure * 1.6) - edge * 0.6;
    }
    return [c, h];
  });
}
function paintCord() {
  return surface(128, 256, (u, v) => {
    const t = (u + v * 4) * 2, strand = t - Math.floor(t), dome = Math.sin(Math.PI * strand), fibre = 0.5 + 0.5 * Math.sin((u * 6 - v * 30 + strand * 3) * Math.PI * 4);
    const n = noise2(u * 16, v * 32, 16, 21);
    const c = lerp32(hex2(7232062), hex2(11572842), dome * 0.75 + n * 0.25).map((k) => k * (0.9 + fibre * 0.1));
    return [c, dome * 1.2 + fibre * 0.15];
  });
}
function paintStraw() {
  return surface(256, 512, (u, v) => {
    const cols = 48, i = Math.floor(u * cols), f = u * cols - i, wobble = (hash22(i, 0, 31) - 0.5) * 0.4;
    const shade = Math.sin(Math.PI * clamp2(f + wobble * (v - 0.5) * 0.3)), tone = hash22(i, 1, 32), node = smooth2(0.92, 1, Math.abs(Math.sin((v * 3 + hash22(i, 2, 33)) * Math.PI)));
    let c = lerp32(hex2(10192481), hex2(13482125), tone).map((k) => k * (0.62 + 0.38 * shade) * (1 - node * 0.18));
    c = c.map((k) => k * (0.9 + 0.2 * noise2(u * 48, v * 6, 48, 34)));
    return [c, shade - node * 0.3];
  });
}
var painted2 = null;
function paintHandToolTextures() {
  if (painted2) return painted2;
  const haft = paintHaft(), cord = paintCord(), straw = paintStraw();
  painted2 = { haft: { ...haft, normal: normals(haft, 2.2) }, cord: { ...cord, normal: normals(cord, 3, true) }, straw: { ...straw, normal: normals(straw, 2.5, true) } };
  return painted2;
}

// bare-hand-mesh.js
var TAU = Math.PI * 2;
var DEG = Math.PI / 180;
var clamp3 = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
var mix3 = (a, b, t) => a + (b - a) * t;
var smoothstep = (a, b, x) => {
  const t = clamp3((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
var add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
var sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
var scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
var len = (a) => Math.hypot(a[0], a[1], a[2]);
var norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
function turn(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), k = dot(axis, v) * (1 - c), x = cross(axis, v);
  return [v[0] * c + x[0] * s + axis[0] * k, v[1] * c + x[1] * s + axis[1] * k, v[2] * c + x[2] * s + axis[2] * k];
}
var hexRgb = (h) => [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255].map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
var FINGERS = [
  { name: "index", mcp: [0.0255, 0.089, 5e-4], base: [0.0165, 0.022, -2e-3], spread: 6, length: [0.04, 0.0245, 0.019], radius: [96e-4, 87e-4, 85e-4, 77e-4, 75e-4, 63e-4], meta: 98e-4 },
  { name: "middle", mcp: [65e-4, 0.0925, -5e-4], base: [45e-4, 0.024, -3e-3], spread: 1, length: [0.0435, 0.027, 0.02], radius: [99e-4, 91e-4, 89e-4, 8e-3, 78e-4, 65e-4], meta: 0.0101 },
  { name: "ring", mcp: [-0.0115, 0.0885, 5e-4], base: [-75e-4, 0.022, -2e-3], spread: -5, length: [0.041, 0.026, 0.0195], radius: [93e-4, 84e-4, 82e-4, 75e-4, 72e-4, 6e-3], meta: 94e-4 },
  { name: "little", mcp: [-0.0275, 0.0805, 25e-4], base: [-0.0175, 0.018, -1e-3], spread: -12, length: [0.0315, 0.019, 0.0175], radius: [82e-4, 75e-4, 72e-4, 66e-4, 64e-4, 54e-4], meta: 86e-4 }
];
var THUMB = { cmc: [0.0185, 0.017, 75e-4], length: [0.042, 0.031, 0.0255], radius: [0.0127, 0.0112, 0.0108, 0.01, 98e-4, 77e-4] };
var POSES = {
  open: { fingers: [[9, 12, 6, 0.55], [10, 13, 6, 0.55], [11, 14, 7, 0.55], [13, 15, 8, 0.55]], thumb: [-5, 12, 25, 6, 10] },
  relaxed: { fingers: [[58, 86, 48, 0.2], [64, 90, 50, 0.2], [70, 92, 50, 0.2], [74, 90, 48, 0.2]], thumb: null },
  grip: { fingers: null, thumb: null }
};
var HAFT = { radius: 0.0215, angle: 24 * DEG, centre: [0, 0.0705, 0.038] };
function chain(o, X, Y, Z, lengths, radii, flexions) {
  const segments = [];
  let p = o;
  for (let i = 0; i < lengths.length; i++) {
    const f = flexions[i] * DEG;
    Y = turn(Y, X, f);
    Z = turn(Z, X, f);
    const b = add(p, scale(Y, lengths[i]));
    segments.push({ a: p, b, ra: radii[i * 2], rb: radii[i * 2 + 1], X, Y, Z, length: lengths[i] });
    p = b;
  }
  return segments;
}
function fingerFrame(finger, spreadScale) {
  const Z = [0, 0, 1], Y = turn([0, 1, 0], Z, -finger.spread * spreadScale * DEG), X = cross(Y, Z);
  return { X, Y, Z };
}
function thumbChain([flexion, abduction, roll, mcp, ip]) {
  let Y = norm([0.42, 0.86, 0.29]), Z = norm(sub([-0.6, 0, 0.8], scale(Y, dot([-0.6, 0, 0.8], Y))));
  const along = norm(sub(FINGERS[0].mcp, FINGERS[0].base));
  Y = turn(Y, along, -abduction * DEG);
  Z = turn(Z, along, -abduction * DEG);
  Y = turn(Y, [0, 0, 1], flexion * DEG);
  Z = turn(Z, [0, 0, 1], flexion * DEG);
  Z = turn(Z, Y, roll * DEG);
  const X = cross(Y, Z);
  return chain(THUMB.cmc, X, Y, Z, THUMB.length, THUMB.radius, [0, mcp, ip]);
}
var CONE = 0;
var ELLIPSOID = 1;
var SQUASHED = 2;
var SPHERE = 3;
var STRIDE = 20;
var roundCone = (a, b, ra, rb) => ({ type: CONE, a, b, ra, rb, centre: scale(add(a, b), 0.5), reach: len(sub(b, a)) / 2 + Math.max(ra, rb) });
var squashedCone = (a, b, ra, rb, dir, factor) => ({ type: SQUASHED, a, b, ra, rb, dir, factor, centre: scale(add(a, b), 0.5), reach: len(sub(b, a)) / 2 + Math.max(ra, rb) });
var ellipsoid = (c, radii, axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) => ({ type: ELLIPSOID, c, radii, axes, centre: c, reach: Math.max(...radii) });
var sphere = (c, r) => ({ type: SPHERE, c, r, centre: c, reach: r });
function pack(list) {
  const data = new Float64Array(list.length * STRIDE);
  list.forEach((p, i) => {
    const o = i * STRIDE;
    p.offset = o;
    data[o] = p.type;
    if (p.type === CONE || p.type === SQUASHED) {
      const ba = sub(p.b, p.a), l2 = dot(ba, ba), rr = p.ra - p.rb;
      data.set([...p.a, ...p.b, p.ra, p.rb, l2, rr, l2 - rr * rr, 1 / l2], o + 1);
      if (p.type === SQUASHED) {
        const axis = norm(ba), thin = norm(sub(p.dir, scale(axis, dot(p.dir, axis))));
        data.set([...thin, p.factor], o + 13);
      }
    } else if (p.type === ELLIPSOID) data.set([...p.c, ...p.axes[0], ...p.axes[1], ...p.axes[2], ...p.radii], o + 1);
    else data.set([...p.c, p.r], o + 1);
  });
  return data;
}
function cone(P, o, px, py, pz) {
  const ax = P[o + 1], ay = P[o + 2], az = P[o + 3], bax = P[o + 4] - ax, bay = P[o + 5] - ay, baz = P[o + 6] - az;
  const ra = P[o + 7], rb = P[o + 8], l2 = P[o + 9], rr = P[o + 10], a2 = P[o + 11], il2 = P[o + 12];
  const pax = px - ax, pay = py - ay, paz = pz - az, y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y, x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2, z2 = z * z * l2, k = (rr > 0 ? 1 : rr < 0 ? -1 : 0) * rr * rr * x2;
  if ((z > 0 ? 1 : z < 0 ? -1 : 0) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
  if ((y > 0 ? 1 : y < 0 ? -1 : 0) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}
function prim(P, o, x, y, z) {
  const type = P[o];
  if (type === CONE) return cone(P, o, x, y, z);
  if (type === SPHERE) {
    const dx2 = x - P[o + 1], dy2 = y - P[o + 2], dz2 = z - P[o + 3];
    return Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2) - P[o + 4];
  }
  if (type === SQUASHED) {
    const tx = P[o + 13], ty = P[o + 14], tz = P[o + 15], f = P[o + 16], t = ((x - P[o + 1]) * tx + (y - P[o + 2]) * ty + (z - P[o + 3]) * tz) * (1 / f - 1);
    return cone(P, o, x + tx * t, y + ty * t, z + tz * t) * f;
  }
  const dx = x - P[o + 1], dy = y - P[o + 2], dz = z - P[o + 3], rx = P[o + 13], ry = P[o + 14], rz = P[o + 15];
  const lx = dx * P[o + 4] + dy * P[o + 5] + dz * P[o + 6], ly = dx * P[o + 7] + dy * P[o + 8] + dz * P[o + 9], lz = dx * P[o + 10] + dy * P[o + 11] + dz * P[o + 12];
  const ax = lx / rx, ay = ly / ry, az = lz / rz, bx = ax / rx, by = ay / ry, bz = az / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 > 1e-12 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
var smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
};
function poseSkeleton(pose) {
  const def = POSES[pose];
  if (!def) throw new Error("Unknown hand pose " + pose);
  const cup = pose === "open" ? 0 : 1;
  const fingers = FINGERS.map((finger, i) => {
    const mcp = add(finger.mcp, [0, -cup * [0, 0, 15e-4, 3e-3][i], cup * [0, 8e-4, 3e-3, 65e-4][i]]);
    return { ...finger, mcp };
  });
  const angles = def.fingers ?? gripAngles(fingers);
  const digits = fingers.map((finger, i) => {
    const [mcpFlex, pip, dip, spread] = angles[i], { X, Y, Z } = fingerFrame(finger, spread);
    return { name: finger.name, segments: chain(finger.mcp, X, Y, Z, finger.length, finger.radius, [mcpFlex, pip, dip]), finger };
  });
  const thumbAngles = def.thumb ?? closedThumb(digits, pose === "grip" ? haftLine() : null);
  const thumb = { name: "thumb", segments: thumbChain(thumbAngles) };
  return { fingers: digits, thumb, cup, angles, thumbAngles };
}
function haftLine() {
  const d = [Math.cos(HAFT.angle), Math.sin(HAFT.angle), 0];
  return { point: HAFT.centre, direction: d, radius: HAFT.radius };
}
function lineDistance(p, line) {
  const o = sub(p, line.point), t = dot(o, line.direction);
  return len(sub(o, scale(line.direction, t)));
}
function gripAngles(fingers) {
  const line = haftLine();
  return fingers.map((finger) => {
    const { X, Y, Z } = fingerFrame(finger, 0.25);
    let best = null;
    for (let m = 20; m <= 85; m += 1.5) for (let p = 30; p <= 105; p += 1.5) {
      const d = p * 0.62, segments = chain(finger.mcp, X, Y, Z, finger.length, finger.radius, [m, p, d]);
      let energy = 0;
      for (const s of segments) for (let k = 0; k <= 4; k++) {
        const t = k / 4, c = add(s.a, scale(sub(s.b, s.a), t)), r = mix3(s.ra, s.rb, t), gap = lineDistance(c, line) - r - HAFT.radius;
        energy += gap < 0 ? 60 * gap * gap : gap * gap;
      }
      energy += (p - 70) * (p - 70) * 1e-9;
      if (!best || energy < best.energy) best = { energy, angles: [m, p, d, 0.25] };
    }
    return best.angles;
  });
}
function closedThumb(digits, haft) {
  const index = digits[0].segments[1], dorsal = scale(index.Z, -1), tr = THUMB.radius[5] * 1.2;
  const target = add(scale(add(index.a, index.b), 0.5), scale(dorsal, mix3(index.ra, index.rb, 0.5) + tr * 0.9));
  const segs = digits.flatMap((d) => d.segments);
  const segDistance = (p, s) => {
    const ab = sub(s.b, s.a), t = clamp3(dot(sub(p, s.a), ab) / dot(ab, ab));
    return { d: len(sub(p, add(s.a, scale(ab, t)))), r: mix3(s.ra, s.rb, t) };
  };
  const ways = haft ? [[0.036, 0.045, 0.032], [0.032, 0.066, 0.062], [0.016, 0.08, 0.076]] : null;
  const energy = (angles) => {
    const chainSegs = thumbChain(angles), distal = chainSegs[2], prox = chainSegs[1];
    let e = 0;
    if (ways) e += (len(sub(chainSegs[0].b, ways[0])) ** 2 + len(sub(prox.b, ways[1])) ** 2 + len(sub(distal.b, ways[2])) ** 2 * 1.5) * 400;
    else {
      const pad = add(distal.a, scale(sub(distal.b, distal.a), 0.55));
      e += len(sub(pad, target)) ** 2 * 60 + (1 + dot(distal.Z, dorsal)) ** 2 * 4e-3;
    }
    for (const [s, weight] of [[prox, 0.6], [distal, 1.4]]) for (let k = 0; k <= 4; k++) {
      const t = k / 4, c = add(s.a, scale(sub(s.b, s.a), t)), r = mix3(s.ra, s.rb, t);
      const gh = haft ? lineDistance(c, haft) - r - haft.radius : Infinity;
      let gf = Infinity;
      for (const f of segs) {
        const { d, r: rf } = segDistance(c, f);
        gf = Math.min(gf, d - r - rf * 0.92);
      }
      if (gh < 0) e += gh * gh * 4e3;
      if (gf < 0) e += gf * gf * 2500;
      if (!ways) {
        const contact = Math.min(Math.max(gh, 0), Math.max(gf, 0));
        e += contact * contact * 30 * weight;
      }
    }
    const [fl, ab, ro, mc, ip] = angles;
    e += ((fl - 35) ** 2 + (ab - 30) ** 2 + (ro - 60) ** 2 + (mc - 20) ** 2 + (ip - 20) ** 2) * 2e-7;
    return e;
  };
  const lo = [-20, 0, 0, 0, 0], hi = [85, 75, 120, 55, 70];
  let best = null, bestE = Infinity;
  for (let fl = 0; fl <= 80; fl += 10) for (let ab = 10; ab <= 70; ab += 10) for (const ro of [40, 70, 100]) for (const mc of [10, 30]) for (const ip of [10, 35]) {
    const angles = [fl, ab, ro, mc, ip], e = energy(angles);
    if (e < bestE) {
      bestE = e;
      best = angles;
    }
  }
  for (const step of [6, 3, 1.5, 0.75]) {
    let improved = true;
    for (let pass = 0; pass < 12 && improved; pass++) {
      improved = false;
      for (let k = 0; k < 5; k++) for (const sign of [-1, 1]) {
        const trial = best.slice();
        trial[k] = clamp3(trial[k] + sign * step, lo[k], hi[k]);
        const e = energy(trial);
        if (e < bestE) {
          bestE = e;
          best = trial;
          improved = true;
        }
      }
    }
  }
  return best;
}
function buildPrimitives(skeleton, pose) {
  const palm = [], digits = [];
  palm.push(squashedCone([0, -0.085, -1e-3], [0, -4e-3, 5e-4], 0.0305, 0.0262, [0, 0, 1], 0.74));
  palm.push(ellipsoid([5e-4, 0.014, 1e-3], [0.0272, 0.0205, 0.0172]));
  for (const f of skeleton.fingers) {
    const head = f.segments[0].a;
    palm.push(roundCone(f.finger.base, head, f.finger.meta * 0.92, f.finger.meta));
  }
  const cup = skeleton.cup;
  palm.push(ellipsoid([-2e-3, 0.058, 75e-4 + cup * 1e-3], [0.031, 0.027, 0.0102]));
  palm.push(ellipsoid([0.0195, 0.0335, 0.0105], [0.015, 0.0235, 0.0118], [norm([0.88, -0.45, 0]), norm([0.45, 0.88, 0]), [0, 0, 1]]));
  palm.push(ellipsoid([-0.0215, 0.04, 85e-4 + cup * 35e-4], [0.0105, 0.0285, 0.0102], [norm([0.97, 0.22, 0]), norm([-0.22, 0.97, 0]), [0, 0, 1]]));
  const t0 = skeleton.thumb.segments[0];
  palm.push(roundCone(t0.a, t0.b, t0.ra, t0.rb));
  for (const f of [...skeleton.fingers, { name: "thumb", segments: skeleton.thumb.segments.slice(1) }]) {
    const prims = [];
    for (const s of f.segments) prims.push(roundCone(s.a, s.b, s.ra, s.rb));
    if (f.name !== "thumb") for (let i = 1; i < f.segments.length; i++) {
      const s = f.segments[i];
      prims.push(sphere(add(s.a, scale(s.Z, -s.ra * 0.42)), s.ra * 0.66));
    }
    digits.push({ name: f.name, prims, k: f.name === "thumb" ? 85e-4 : 68e-4, kSelf: 28e-4 });
  }
  const data = pack([...palm, ...digits.flatMap((d) => d.prims)]);
  return { data, palm, digits, kPalm: 0.0105 };
}
function evaluate(P, lists, kPalm, x, y, z) {
  const palmList = lists.palm;
  let palm = 1e3;
  for (let i = 0; i < palmList.length; i++) palm = smin(palm, prim(P, palmList[i], x, y, z), kPalm);
  let best = palm;
  const digits = lists.digits;
  for (let g = 0; g < digits.length; g++) {
    const list = digits[g].offsets;
    if (!list.length) continue;
    const kSelf = digits[g].kSelf;
    let d = 1e3;
    for (let i = 0; i < list.length; i++) d = smin(d, prim(P, list[i], x, y, z), kSelf);
    const blended = smin(palm, d, digits[g].k);
    if (blended < best) best = blended;
  }
  return best;
}
function buildBareHand(pose = "grip", { voxel = 24e-4 } = {}) {
  const now = () => (typeof performance !== "undefined" ? performance : Date).now(), started = now();
  const skeleton = poseSkeleton(pose), prims = buildPrimitives(skeleton, pose), P = prims.data, kPalm = prims.kPalm;
  const all = [...prims.palm, ...prims.digits.flatMap((d) => d.prims)];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of all) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], p.centre[k] - p.reach - 4e-3);
    max[k] = Math.max(max[k], p.centre[k] + p.reach + 4e-3);
  }
  min[1] = Math.max(min[1], -0.075);
  const B = 4, h = voxel, n = [0, 1, 2].map((k) => Math.ceil((max[k] - min[k]) / h / B) * B + 1), nb = n.map((c2) => (c2 - 1) / B);
  const at = (i, j, k) => (k * n[1] + j) * n[0] + i;
  const field = new Float32Array(n[0] * n[1] * n[2]).fill(NaN);
  const blocks = new Array(nb[0] * nb[1] * nb[2]);
  const half = B * h * Math.sqrt(3) / 2, kmax = 0.011;
  let evaluations = 0, activeBlocks = 0;
  const offsets = (list) => Int32Array.from(list.map((p) => p.offset));
  const full = { palm: offsets(prims.palm), digits: prims.digits.map((d) => ({ offsets: offsets(d.prims), k: d.k, kSelf: d.kSelf })) };
  for (let bk = 0; bk < nb[2]; bk++) for (let bj = 0; bj < nb[1]; bj++) for (let bi = 0; bi < nb[0]; bi++) {
    const cx = min[0] + (bi + 0.5) * B * h, cy = min[1] + (bj + 0.5) * B * h, cz = min[2] + (bk + 0.5) * B * h;
    const d = evaluate(P, full, kPalm, cx, cy, cz);
    evaluations++;
    if (Math.abs(d) > half * 1.06 + 6e-4) continue;
    const near = (p) => Math.hypot(p.centre[0] - cx, p.centre[1] - cy, p.centre[2] - cz) - p.reach < half + kmax + 3e-3;
    blocks[(bk * nb[1] + bj) * nb[0] + bi] = { palm: offsets(prims.palm.filter(near)), digits: prims.digits.map((g) => ({ offsets: offsets(g.prims.filter(near)), k: g.k, kSelf: g.kSelf })) };
    activeBlocks++;
  }
  for (let id = 0; id < blocks.length; id++) {
    const lists = blocks[id];
    if (!lists) continue;
    const bi = id % nb[0], bj = Math.floor(id / nb[0]) % nb[1], bk = Math.floor(id / (nb[0] * nb[1]));
    for (let k = bk * B; k <= bk * B + B; k++) for (let j = bj * B; j <= bj * B + B; j++) for (let i = bi * B; i <= bi * B + B; i++) {
      const index2 = at(i, j, k);
      if (!Number.isNaN(field[index2])) continue;
      field[index2] = evaluate(P, lists, kPalm, min[0] + i * h, min[1] + j * h, min[2] + k * h);
      evaluations++;
    }
  }
  const tField = now();
  const cellIndex = new Int32Array((n[0] - 1) * (n[1] - 1) * (n[2] - 1)).fill(-1), cellAt = (i, j, k) => (k * (n[1] - 1) + j) * (n[0] - 1) + i;
  const positions = [], cells = [];
  const CX = [0, 1, 0, 1, 0, 1, 0, 1], CY = [0, 0, 1, 1, 0, 0, 1, 1], CZ = [0, 0, 0, 0, 1, 1, 1, 1];
  const EA = [0, 2, 4, 6, 0, 1, 4, 5, 0, 1, 2, 3], EB = [1, 3, 5, 7, 2, 3, 6, 7, 4, 5, 6, 7];
  const step = [0, 1, n[0], n[0] + 1, n[0] * n[1], n[0] * n[1] + 1, n[0] * n[1] + n[0], n[0] * n[1] + n[0] + 1];
  const values = new Float64Array(8);
  for (let id = 0; id < blocks.length; id++) {
    if (!blocks[id]) continue;
    const bi = id % nb[0], bj = Math.floor(id / nb[0]) % nb[1], bk = Math.floor(id / (nb[0] * nb[1]));
    for (let k = bk * B; k < bk * B + B; k++) for (let j = bj * B; j < bj * B + B; j++) for (let i = bi * B; i < bi * B + B; i++) {
      const base = at(i, j, k);
      let inside = 0, ok = true;
      for (let c2 = 0; c2 < 8; c2++) {
        const v = field[base + step[c2]];
        if (v !== v) {
          ok = false;
          break;
        }
        values[c2] = v;
        if (v < 0) inside++;
      }
      if (!ok || inside === 0 || inside === 8) continue;
      let sx = 0, sy = 0, sz = 0, count2 = 0;
      for (let e2 = 0; e2 < 12; e2++) {
        const a = EA[e2], b = EB[e2], va = values[a], vb = values[b];
        if (va < 0 === vb < 0) continue;
        const t = va / (va - vb);
        sx += CX[a] + (CX[b] - CX[a]) * t;
        sy += CY[a] + (CY[b] - CY[a]) * t;
        sz += CZ[a] + (CZ[b] - CZ[a]) * t;
        count2++;
      }
      cellIndex[cellAt(i, j, k)] = positions.length / 3;
      positions.push(min[0] + (i + sx / count2) * h, min[1] + (j + sy / count2) * h, min[2] + (k + sz / count2) * h);
      cells.push(id);
    }
  }
  const tCells = now();
  const index = [];
  const quad = (a, b, c2, d, flip) => {
    if (a < 0 || b < 0 || c2 < 0 || d < 0) return;
    const d2 = (u, v) => {
      const x = positions[u * 3] - positions[v * 3], y = positions[u * 3 + 1] - positions[v * 3 + 1], z = positions[u * 3 + 2] - positions[v * 3 + 2];
      return x * x + y * y + z * z;
    };
    const diagonal = d2(a, c2) <= d2(b, d);
    const tris = diagonal ? [[a, b, c2], [a, c2, d]] : [[a, b, d], [b, c2, d]];
    for (const t of tris) flip ? index.push(t[0], t[2], t[1]) : index.push(t[0], t[1], t[2]);
  };
  for (let k = 0; k < n[2] - 1; k++) for (let j = 0; j < n[1] - 1; j++) for (let i = 0; i < n[0] - 1; i++) {
    if (cellIndex[cellAt(i, j, k)] < 0) continue;
    const v0 = field[at(i + 1, j + 1, k + 1)];
    const ex = field[at(i, j + 1, k + 1)], ey = field[at(i + 1, j, k + 1)], ez = field[at(i + 1, j + 1, k)];
    if (!Number.isNaN(v0) && !Number.isNaN(ex) && v0 < 0 !== ex < 0 && j + 1 < n[1] - 1 && k + 1 < n[2] - 1)
      quad(cellIndex[cellAt(i, j, k)], cellIndex[cellAt(i, j + 1, k)], cellIndex[cellAt(i, j + 1, k + 1)], cellIndex[cellAt(i, j, k + 1)], v0 < 0);
    if (!Number.isNaN(v0) && !Number.isNaN(ey) && v0 < 0 !== ey < 0 && i + 1 < n[0] - 1 && k + 1 < n[2] - 1)
      quad(cellIndex[cellAt(i, j, k)], cellIndex[cellAt(i, j, k + 1)], cellIndex[cellAt(i + 1, j, k + 1)], cellIndex[cellAt(i + 1, j, k)], v0 < 0);
    if (!Number.isNaN(v0) && !Number.isNaN(ez) && v0 < 0 !== ez < 0 && i + 1 < n[0] - 1 && j + 1 < n[1] - 1)
      quad(cellIndex[cellAt(i, j, k)], cellIndex[cellAt(i + 1, j, k)], cellIndex[cellAt(i + 1, j + 1, k)], cellIndex[cellAt(i, j + 1, k)], v0 < 0);
  }
  const tQuads = now();
  const count = positions.length / 3, normal = new Float32Array(count * 3), e = h * 0.35;
  const field3 = (x, y, z, id) => {
    evaluations++;
    return evaluate(P, blocks[id], kPalm, x, y, z);
  };
  for (let v = 0; v < count; v++) {
    const id = cells[v];
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    let gx = 0, gy = 0, gz = 0;
    for (let iteration = 0; iteration < 2; iteration++) {
      const a = field3(x + e, y - e, z - e, id), b = field3(x - e, y - e, z + e, id), c2 = field3(x - e, y + e, z - e, id), d = field3(x + e, y + e, z + e, id);
      gx = a - b - c2 + d;
      gy = -a - b + c2 + d;
      gz = -a + b - c2 + d;
      const g2 = gx * gx + gy * gy + gz * gz || 1, value = (a + b + c2 + d) * 0.25, s = value / g2 * 4 * e;
      if (iteration === 0) {
        const step2 = Math.max(-h * 0.6, Math.min(h * 0.6, s));
        x -= gx * step2;
        y -= gy * step2;
        z -= gz * step2;
      }
    }
    const l = Math.hypot(gx, gy, gz) || 1;
    normal[v * 3] = gx / l;
    normal[v * 3 + 1] = gy / l;
    normal[v * 3 + 2] = gz / l;
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
  }
  const position = new Float32Array(positions), tProject = now();
  const haft = pose === "grip" ? haftLine() : null;
  const ao = new Float32Array(count), color = new Float32Array(count * 3), nail = new Float32Array(count * 4);
  const tone = { back: hexRgb(12094060), palm: hexRgb(13606790), knuckle: hexRgb(11565667), tip: hexRgb(13407874), crease: hexRgb(10251352) };
  const digitsAll = [...skeleton.fingers, skeleton.thumb], segs = [];
  for (const digit of digitsAll) digit.segments.forEach((sg, si) => {
    if (digit === skeleton.thumb && si === 0) return;
    const ab = sub(sg.b, sg.a);
    segs.push({ ax: sg.a[0], ay: sg.a[1], az: sg.a[2], bx: ab[0], by: ab[1], bz: ab[2], inv: 1 / dot(ab, ab), ra: sg.ra, rb: sg.rb, Z: sg.Z, X: sg.X, Y: sg.Y, length: sg.length, si, thumb: digit === skeleton.thumb, end: si === digit.segments.length - 1 });
  });
  const ends = segs.filter((sg) => sg.end), heads = skeleton.fingers.map((f) => f.segments[0].a);
  const hx = haft ? haft.point : [0, 0, 0], hd = haft ? haft.direction : [0, 1, 0], hr = haft ? haft.radius : 0;
  const c = [0, 0, 0];
  for (let v = 0; v < count; v++) {
    const id = cells[v], px = position[v * 3], py = position[v * 3 + 1], pz = position[v * 3 + 2], nx = normal[v * 3], ny = normal[v * 3 + 1], nz = normal[v * 3 + 2];
    let occlusion = 0;
    for (let k = 1; k <= 3; k++) {
      const d = 42e-4 * k, qx = px + nx * d, qy = py + ny * d, qz = pz + nz * d;
      let f = evaluate(P, blocks[id], kPalm, qx, qy, qz);
      evaluations++;
      if (haft) {
        const ox = qx - hx[0], oy = qy - hx[1], oz = qz - hx[2], t = ox * hd[0] + oy * hd[1] + oz * hd[2], rx = ox - hd[0] * t, ry = oy - hd[1] * t, rz = oz - hd[2] * t;
        f = Math.min(f, Math.sqrt(rx * rx + ry * ry + rz * rz) - hr);
      }
      occlusion += Math.max(0, d - f) / d / (1 << k);
    }
    const occ = clamp3(1 - occlusion * 1.25, 0.18, 1);
    ao[v] = occ;
    let best = null, bestD = Infinity, bestT = 0;
    for (const sg of segs) {
      const ox = px - sg.ax, oy = py - sg.ay, oz = pz - sg.az, t = clamp3((ox * sg.bx + oy * sg.by + oz * sg.bz) * sg.inv), dx = ox - sg.bx * t, dy = oy - sg.by * t, dz = oz - sg.bz * t;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - (sg.ra + (sg.rb - sg.ra) * t);
      if (d < bestD) {
        bestD = d;
        best = sg;
        bestT = t;
      }
    }
    const onDigit = bestD < 4e-3, palmar = onDigit ? nx * best.Z[0] + ny * best.Z[1] + nz * best.Z[2] : nz;
    const w = palmar > 0 ? smoothstep(-0.1, 0.55, palmar) : 0;
    for (let k = 0; k < 3; k++) c[k] = mix3(tone.back[k], tone.palm[k], w);
    if (onDigit) {
      const along = bestT * best.length, joint = Math.min(along, best.length - along);
      const knuckle = (1 - smoothstep(2e-3, 9e-3, joint)) * smoothstep(0.1, 0.7, -palmar) * (best.si === 0 && !best.thumb ? 0.6 : 1);
      for (let k = 0; k < 3; k++) c[k] = mix3(c[k], tone.knuckle[k], knuckle * 0.55);
      if (best.end) {
        const tip = smoothstep(0.45, 1, bestT) * 0.5 * smoothstep(-0.3, 0.6, palmar);
        for (let k = 0; k < 3; k++) c[k] = mix3(c[k], tone.tip[k], tip);
      }
    } else {
      const back = smoothstep(0.2, 0.8, -nz) * 0.4;
      if (back > 0) for (const head of heads) {
        const dx = px - head[0], dy = py - head[1], dz = pz - head[2], k = (1 - smoothstep(6e-3, 0.014, Math.sqrt(dx * dx + dy * dy + dz * dz))) * back;
        for (let j = 0; j < 3; j++) c[j] = mix3(c[j], tone.knuckle[j], k);
      }
    }
    const crease = clamp3((1 - occ) * 1.1) * 0.45;
    for (let k = 0; k < 3; k++) c[k] = mix3(c[k], tone.crease[k], crease);
    color[v * 3] = c[0];
    color[v * 3 + 1] = c[1];
    color[v * 3 + 2] = c[2];
    let nX = 9, nA = 9, nD = 9, nK = 0, score = Infinity;
    for (const sg of ends) {
      const ox = px - sg.ax, oy = py - sg.ay, oz = pz - sg.az, along = (ox * sg.Y[0] + oy * sg.Y[1] + oz * sg.Y[2]) / sg.length;
      if (along < -0.3 || along > 1.6) continue;
      const r = sg.ra + (sg.rb - sg.ra) * clamp3(along), x = (ox * sg.X[0] + oy * sg.X[1] + oz * sg.X[2]) / r, depth = (ox * sg.Z[0] + oy * sg.Z[1] + oz * sg.Z[2]) / r;
      const q = x * x + depth * depth;
      if (q > 4.84 || q >= score) continue;
      score = q;
      nX = x;
      nA = along;
      nD = depth;
      nK = sg.thumb ? 2 : 1;
    }
    nail[v * 4] = nX;
    nail[v * 4 + 1] = nA;
    nail[v * 4 + 2] = nD;
    nail[v * 4 + 3] = nK;
  }
  const elapsed = now() - started, phases = { field: Math.round(tField - started), cells: Math.round(tCells - tField), quads: Math.round(tQuads - tCells), project: Math.round(tProject - tQuads), shade: Math.round(now() - tProject) };
  return {
    position,
    normal,
    color,
    ao,
    nail,
    index: count > 65535 ? new Uint32Array(index) : new Uint16Array(index),
    haft,
    skeleton: { fingers: skeleton.fingers.map((f) => ({ name: f.name, joints: [f.segments[0].a, ...f.segments.map((s) => s.b)] })), thumb: [skeleton.thumb.segments[0].a, ...skeleton.thumb.segments.map((s) => s.b)], angles: skeleton.angles, thumbAngles: skeleton.thumbAngles },
    stats: { pose, voxel, vertices: count, triangles: index.length / 3, evaluations, activeBlocks, milliseconds: Math.round(elapsed), phases }
  };
}
function buildSleeve(path, { reference = [1, 0, 0], radius = (t) => mix3(0.037, 0.052, smoothstep(0, 0.7, t)), flatten = 0.86, elbowAt = 0.55, sides = 24, rings = 36, seed = 1, cloth = 6116420 } = {}) {
  const lengths = [0];
  for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + len(sub(path[i], path[i - 1])));
  const total = lengths.at(-1);
  const sample = (s) => {
    let i = 1;
    while (i < path.length - 1 && lengths[i] < s) i++;
    const t = (s - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
    return add(path[i - 1], scale(sub(path[i], path[i - 1]), t));
  };
  let pts = [];
  for (let i = 0; i <= rings; i++) pts.push(sample(total * i / rings));
  for (let pass = 0; pass < 4; pass++) pts = pts.map((p, i) => i === 0 || i === rings ? p : scale(add(add(pts[i - 1], pts[i + 1]), scale(p, 2)), 0.25));
  const tangents = pts.map((p, i) => norm(sub(pts[Math.min(rings, i + 1)], pts[Math.max(0, i - 1)])));
  let ref = norm(sub(reference, scale(tangents[0], dot(reference, tangents[0]))));
  const frames = [];
  for (let i = 0; i <= rings; i++) {
    if (i) {
      const axis = cross(tangents[i - 1], tangents[i]), sn = len(axis);
      if (sn > 1e-6) ref = turn(ref, scale(axis, 1 / sn), Math.asin(Math.min(1, sn)));
    }
    ref = norm(sub(ref, scale(tangents[i], dot(ref, tangents[i]))));
    frames.push({ n: ref, b: cross(tangents[i], ref) });
  }
  const position = [], normal = [], uv = [], color = [], index = [];
  const base = hexRgb(cloth), phase = seed * 1.913;
  const fold = (a, t) => {
    const bunch = Math.exp(-(((t - 0.1) / 0.06) ** 2)) * 0.75 + Math.exp(-(((t - elbowAt) / 0.09) ** 2));
    return 1 + 0.03 * Math.sin(a * 3 + t * 9 + phase) + 0.02 * Math.sin(a * 5 - t * 13 + phase * 2) + 0.055 * bunch * Math.sin(t * total * 210 + Math.cos(a * 2 + phase) * 1.7);
  };
  const point = (i, a, inset = 0, t = i / rings) => {
    const f = frames[i], dir = add(scale(f.n, Math.cos(a)), scale(f.b, Math.sin(a) * flatten));
    return { p: add(pts[i], scale(norm(dir), len(dir) * radius(t) * fold(a, t) - inset)), dir: norm(add(scale(f.n, Math.cos(a) * flatten), scale(f.b, Math.sin(a)))) };
  };
  const rows = [];
  for (let i = 0; i <= rings; i++) {
    rows.push(position.length / 3);
    const t = i / rings;
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * TAU, { p, dir } = point(i, a);
      const q = point(i, a + 0.02).p, r = point(i, a - 0.02).p, tangent = norm(sub(q, r)), nn = norm(cross(tangent, tangents[i]));
      position.push(...p);
      normal.push(...dot(nn, dir) < 0 ? scale(nn, -1) : nn);
      uv.push(j / sides, t * total / 0.02);
      const shade = 1 - 0.12 * (fold(a, t) - 1) / 0.055 * 0.5;
      color.push(base[0] * shade, base[1] * shade, base[2] * shade);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < sides; j++) {
    const a = rows[i] + j, b = rows[i + 1] + j;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const lip = position.length / 3;
  for (let j = 0; j <= sides; j++) {
    const a = j / sides * TAU, { p, dir } = point(0, a, 21e-4);
    position.push(...add(p, scale(tangents[0], -24e-4)));
    normal.push(...norm(add(scale(tangents[0], -1), scale(dir, 0.4))));
    uv.push(j / sides, 0);
    color.push(...base.map((c) => c * 0.9));
  }
  const inner = position.length / 3, deep = Math.min(rings, 3);
  for (let j = 0; j <= sides; j++) {
    const a = j / sides * TAU, { p, dir } = point(deep, a, 42e-4);
    position.push(...p);
    normal.push(...scale(dir, -1));
    uv.push(j / sides, 0.1);
    color.push(...base.map((c) => c * 0.4));
  }
  for (let j = 0; j < sides; j++) {
    const o = rows[0] + j, l = lip + j, n = inner + j;
    index.push(o, l, o + 1, o + 1, l, l + 1);
    index.push(l, n, l + 1, l + 1, n, n + 1);
  }
  return { position: new Float32Array(position), normal: new Float32Array(normal), uv: new Float32Array(uv), color: new Float32Array(color), index: new Uint16Array(index), length: total };
}
function mirrorHand(data) {
  const position = data.position.slice(), normal = data.normal.slice(), nail = data.nail.slice(), index = data.index.slice();
  for (let i = 0; i < position.length; i += 3) {
    position[i] = -position[i];
    normal[i] = -normal[i];
  }
  for (let i = 0; i < nail.length; i += 4) nail[i] = -nail[i];
  for (let i = 0; i < index.length; i += 3) {
    const t = index[i + 1];
    index[i + 1] = index[i + 2];
    index[i + 2] = t;
  }
  return { ...data, position, normal, nail, index };
}
var BARE_HAND = Object.freeze({ haft: HAFT, poses: Object.keys(POSES) });
function buildHandMeshes(voxel = 24e-4) {
  const out = {}, buffers = [];
  for (const pose of ["grip", "relaxed", "open"]) {
    const mesh = buildBareHand(pose, { voxel });
    out[pose] = mesh;
    buffers.push(mesh.position.buffer, mesh.normal.buffer, mesh.color.buffer, mesh.ao.buffer, mesh.nail.buffer, mesh.index.buffer);
  }
  out.stats = {
    voxel,
    milliseconds: out.grip.stats.milliseconds + out.relaxed.stats.milliseconds + out.open.stats.milliseconds,
    triangles: { grip: out.grip.stats.triangles, relaxed: out.relaxed.stats.triangles, open: out.open.stats.triangles }
  };
  return { meshes: out, buffers };
}

export {
  ATLAS_SIZE,
  ATLAS,
  paintPickableAtlas,
  paintHandToolTextures,
  buildSleeve,
  mirrorHand,
  buildHandMeshes
};
