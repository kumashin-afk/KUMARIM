// world-seed.js
var WORLD_SEED_KEY = "kumarim-world-seed-v1";
var DEFAULT_WORLD_SEED = 728194;
function parseWorldSeed(value) {
  if (typeof value === "string" && !/^\d{1,10}$/.test(value.trim())) return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) && seed >= 0 && seed <= 4294967295 ? seed : null;
}
function readWorldSeed() {
  if (Number.isSafeInteger(globalThis.__EW_WORLD_SEED) && globalThis.__EW_WORLD_SEED >= 0 && globalThis.__EW_WORLD_SEED <= 4294967295) return globalThis.__EW_WORLD_SEED;
  try {
    const boot = JSON.parse(globalThis.sessionStorage?.getItem("kumarim-mp-v1") || "null");
    if (boot?.role === "guest") {
      const seed = parseWorldSeed(boot.seed);
      if (seed !== null) return seed;
    }
  } catch {
  }
  try {
    const raw = globalThis.localStorage?.getItem(WORLD_SEED_KEY);
    if (raw !== null && raw !== void 0) {
      const seed = parseWorldSeed(raw);
      if (seed !== null) return seed;
    }
  } catch {
  }
  return DEFAULT_WORLD_SEED;
}
function randomWorldSeed(previous) {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0] === previous ? value[0] + 1 >>> 0 : value[0];
}
var ACTIVE_WORLD_SEED = readWorldSeed();

export {
  WORLD_SEED_KEY,
  parseWorldSeed,
  randomWorldSeed,
  ACTIVE_WORLD_SEED
};
