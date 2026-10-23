// world-seed.js
var WORLD_SEED_KEY = "kumarim-world-seed-v1";
var DEFAULT_WORLD_SEED = 728194;
function parseWorldSeed(value) {
  if (typeof value === "string" && !/^\d{1,10}$/.test(value.trim())) return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) && seed >= 0 && seed <= 4294967295 ? seed : null;
}
function readWorldSeed() {
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
