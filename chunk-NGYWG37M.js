// render-resolution.js
var RESOLUTION_PRESETS = Object.freeze([
  { value: "auto", label: "自動（最大2560 × 1440）" },
  { value: "720p", label: "1280 × 720以内（720p）" },
  { value: "1080p", label: "1920 ×1080以内（1080p）" },
  { value: "1440p", label: "2560 ×1440以内（1440p）" },
  { value: "2160p", label: "3840 ×2160以内（4K）" },
  { value: "window", label: "ウィンドウ等倍（1×）" },
  { value: "legacy", label: "画質連動（従来の設定）" }
].map(Object.freeze));
var PRESET_VALUES = new Set(RESOLUTION_PRESETS.map(({ value }) => value));
var BOUNDS = Object.freeze({
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "1440p": [2560, 1440],
  "2160p": [3840, 2160]
});
function normalizeResolution(value) {
  return PRESET_VALUES.has(value) ? value : "auto";
}
function positiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function calculateRenderResolution({
  width,
  height,
  devicePixelRatio = 1,
  quality = "high",
  preset = "auto",
  maxDimension = 16384
} = {}) {
  width = Math.max(1, Math.floor(positiveNumber(width, 1)));
  height = Math.max(1, Math.floor(positiveNumber(height, 1)));
  const limit = Math.max(1, Math.floor(positiveNumber(maxDimension, 16384)));
  const safeDPR = positiveNumber(devicePixelRatio, 1);
  preset = normalizeResolution(preset);
  const highQuality = quality === "high" || quality === "ultra";
  const supersample = quality === "ultra" ? 2 : quality === "high" ? 1.5 : 1;
  const legacyRatio = Math.min(safeDPR * supersample, highQuality ? 2 : 1);
  let pixelRatio;
  if (preset === "window") {
    pixelRatio = 1;
  } else if (preset === "legacy") {
    pixelRatio = legacyRatio;
  } else if (preset === "auto") {
    const autoRatio = quality === "ultra" ? legacyRatio : Math.min(safeDPR, highQuality ? 2 : 1);
    pixelRatio = Math.min(autoRatio, 2560 / width, 1440 / height);
  } else {
    const [boundWidth, boundHeight] = BOUNDS[preset];
    pixelRatio = Math.min(2, boundWidth / width, boundHeight / height);
  }
  pixelRatio = Math.min(pixelRatio, limit / width, limit / height);
  const bufferSize = (size) => Math.max(1, Math.min(limit, Math.floor(size * pixelRatio)));
  return {
    preset,
    width,
    height,
    pixelRatio,
    bufferWidth: bufferSize(width),
    bufferHeight: bufferSize(height)
  };
}

export {
  RESOLUTION_PRESETS,
  normalizeResolution,
  calculateRenderResolution
};
