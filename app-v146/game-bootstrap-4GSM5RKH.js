import {
  normalizeResolution
} from "./chunk-TYFAO7B2.js";
import {
  ACTIVE_WORLD_SEED
} from "./chunk-UWU2KGE2.js";
import {
  LOADING_STAGES_UNDERGROUND,
  getStartupLoadingProgress,
  savedUnderground
} from "./chunk-3VPLHZQF.js";
import "./chunk-MLKGABMK.js";

// game-bootstrap.js
var touchDevice = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
var loadingPreferences = { quality: touchDevice ? "balanced" : "high", resolution: "auto" };
try {
  const stored = JSON.parse(localStorage.getItem("kumarim-settings-v1") || "{}");
  loadingPreferences = { ...loadingPreferences, ...stored };
} catch {
}
var loadingProfile = ["startup-v4-generated", ACTIVE_WORLD_SEED, loadingPreferences.quality, normalizeResolution(loadingPreferences.resolution), innerWidth, innerHeight, devicePixelRatio || 1].join(":");
var underground = savedUnderground();
var startupProgress = getStartupLoadingProgress({ profile: loadingProfile + (underground ? ":underground" : ""), groups: [["terrain", "assets"], ["nearby", "poi"], ["distant"], ["shaders"]], ...underground ? { stages: LOADING_STAGES_UNDERGROUND } : {} });
startupProgress.begin("terrain", { detail: "島全体の地形データを準備しています" });
var startup = { status: "loading", error: null, build: globalThis.KUMARIM_BUILD ?? null };
var RETRY_KEY = "kumarim-startup-retry";
var session = { get() {
  try {
    return sessionStorage.getItem(RETRY_KEY);
  } catch {
    return null;
  }
}, set(value) {
  try {
    if (value === null) sessionStorage.removeItem(RETRY_KEY);
    else sessionStorage.setItem(RETRY_KEY, value);
  } catch {
  }
} };
try {
  if (!document.hidden) await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  if (globalThis.KUMARIM_MODEL_PACK) await import("./chunk-G7NEXZIQ.js");
  await import("./chunk-LIMHMWHV.js");
  startup.status = "loaded";
  session.set(null);
} catch (error) {
  console.error("KUMARIM startup failed", error);
  const reason = String(error?.message || error || "").replace(/\s+/g, " ").trim().slice(0, 240);
  startup.status = "failed";
  startup.error = reason;
  if (session.get() !== String(startup.build)) {
    session.set(String(startup.build));
    startupProgress.error("読み込みに失敗したため、もう一度読み込みます…");
    setTimeout(() => location.reload(), 600);
  } else {
    const loading = document.querySelector("#loading");
    const message = "世界を読み込めませんでした。通信を確認して、再読み込みしてください。" + (reason ? `（原因: ${reason}${startup.build ? " · " + startup.build : ""}）` : "");
    startupProgress.error(message);
    if (loading && !loading.querySelector("button")) {
      const retry = document.createElement("button");
      retry.className = "outline-button";
      retry.textContent = "再読み込み";
      retry.addEventListener("click", () => {
        session.set(null);
        location.reload();
      }, { once: true });
      loading.append(retry);
    }
    startup.missing = await unreachableModules();
    if (startup.missing.length) startupProgress.error(message + ` 読み込めないファイル: ${startup.missing.slice(0, 6).join(", ")}${startup.missing.length > 6 ? " ほか" : ""}`);
  }
}
async function unreachableModules() {
  let urls = [];
  try {
    urls = [...new Set(Object.values(JSON.parse(document.querySelector('script[type="importmap"]')?.textContent || "{}").imports || {}))];
  } catch {
  }
  const missing = [], name = (url) => url.replace(/^\.\//, "").replace(/\?.*$/, "");
  let next = 0;
  const check = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (!response.ok) missing.push(name(url) + " " + response.status);
      } catch {
        missing.push(name(url));
      }
    }
  };
  await Promise.race([Promise.all(Array.from({ length: 8 }, check)), new Promise((resolve) => setTimeout(resolve, 2e4))]);
  return missing;
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) startupProgress.dispose();
});
