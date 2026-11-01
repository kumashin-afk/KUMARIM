import {
  KEYS,
  SEALED,
  clearGuestBoot,
  createLoadingAtlas,
  findRoom,
  normalizeResolution,
  playerName,
  sealedPage,
  setPlayerName,
  store,
  takeInvite,
  takeTitleSkip
} from "./chunk-D5HN32JZ.js";
import {
  LOADING_STAGES_UNDERGROUND,
  getStartupLoadingProgress,
  savedUnderground
} from "./chunk-3VPLHZQF.js";
import "./chunk-MLKGABMK.js";

// title-screen.js
var TITLE = Object.freeze({ save: "kumarim-survival-v1", seedKey: "kumarim-world-seed-v1", daySeconds: 960, fadeMs: 700 });
var defaults = () => ({ local: globalThis.localStorage, session: globalThis.sessionStorage });
function savedDay(local = globalThis.localStorage) {
  try {
    const s = JSON.parse(local?.getItem(TITLE.save) || "null");
    return s && s.version >= 1 && s.version <= 4 ? Math.floor((Number(s.clock) || 0) / TITLE.daySeconds) + 1 : null;
  } catch {
    return null;
  }
}
function newIsland(local = globalThis.localStorage, random = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0]) {
  let previous = null;
  try {
    previous = local.getItem(TITLE.seedKey);
  } catch {
  }
  let seed = random() >>> 0;
  if (String(seed) === previous) seed = seed + 1 >>> 0;
  try {
    local.setItem(TITLE.seedKey, String(seed));
    local.removeItem(TITLE.save);
  } catch {
    return null;
  }
  return seed;
}
function runTitle({ root = globalThis.document?.querySelector("#title"), version, storage = defaults(), location: location2 = globalThis.location, history = globalThis.history } = {}) {
  if (!root) return Promise.resolve({ mode: "continue" });
  const $ = (s) => root.querySelector(s);
  const vista = $(".title-vista"), img = vista?.querySelector("img"), shown = () => vista.classList.add("title-vista-ready");
  if (img?.complete && img.naturalWidth) shown();
  else img?.addEventListener("load", shown, { once: true });
  const day = savedDay(storage.local), under = day !== null && savedUnderground(storage.local), invite = takeInvite({ location: location2, history, storage });
  const views = { menu: $("#titleMenu"), confirm: $("#titleConfirm"), room: $("#titleRoom") };
  const cont = $("#titleContinue");
  cont.querySelector("span").textContent = day === null ? "はじめる" : `つづきから（${day}日目${under ? "・地下" : ""}）`;
  $("#titleConfirmText").textContent = `今の島の記録（${day}日目）は消えて、別の島の1日目から始まります。最長記録と設定は残ります。`;
  $("#titleHostNote").textContent = day === null ? "新しい島で部屋を作ります。" : `つづき（${day}日目）の島で部屋を作ります。`;
  const name = $("#titleName"), code = $("#titleCode"), status = $("#titleStatus");
  name.value = playerName(storage.local);
  $("#titleRoomNote").textContent = sealedPage(location2) ? SEALED : "部屋を作った人（ホスト）の島で、みんなで遊びます。4 人まで。";
  const note = store(storage.session, KEYS.note);
  if (note) {
    status.textContent = note;
    store(storage.session, KEYS.note, null);
  }
  let busy = false;
  const show = (view) => {
    for (const [k, el] of Object.entries(views)) el.hidden = k !== view;
    root.dataset.view = view;
    (view === "menu" ? cont : view === "confirm" ? $("#titleConfirmNo") : invite ? $("#titleJoin") : name).focus?.({ preventScroll: true });
  };
  if (invite) {
    if (invite.code) {
      code.value = invite.code;
      $("#titleJoin").textContent = `部屋 ${invite.code} に入る`;
      $("#titleRoomHeading").textContent = "招待された部屋";
    } else status.textContent = "招待リンクの部屋コードが読めなかった。";
    show("room");
    $("#titleHostBox").hidden = true;
  } else show("menu");
  for (const b of root.querySelectorAll("button")) b.disabled = false;
  root.classList.add("title-ready");
  return new Promise((resolve) => {
    const done = (mode) => {
      if (mode !== "guest") clearGuestBoot(storage.session);
      if (mode !== "host") store(storage.session, KEYS.host, null);
      busy = true;
      for (const b of root.querySelectorAll("button")) b.disabled = true;
      root.classList.add("title-leaving");
      root.setAttribute("aria-hidden", "true");
      setTimeout(() => {
        root.hidden = true;
      }, TITLE.fadeMs);
      resolve({ mode });
    };
    async function join() {
      if (busy) return;
      busy = true;
      const who = setPlayerName(name.value, storage.local);
      status.textContent = `部屋 ${code.value.trim().toUpperCase() || ""} をさがしている……`;
      for (const b of root.querySelectorAll("button")) b.disabled = true;
      const found = await findRoom({ version, code: code.value, name: who, storage });
      busy = false;
      for (const b of root.querySelectorAll("button")) b.disabled = false;
      if (found.error) {
        status.textContent = found.text;
        code.focus?.();
        return;
      }
      status.textContent = `${found.host || "ホスト"}の島を読み込みます。`;
      done("guest");
    }
    cont.onclick = () => {
      if (!busy) done("continue");
    };
    $("#titleNew").onclick = () => {
      if (busy) return;
      if (day === null) {
        newIsland(storage.local);
        done("new");
      } else show("confirm");
    };
    $("#titleConfirmYes").onclick = () => {
      if (busy) return;
      if (newIsland(storage.local) === null) {
        $("#titleConfirmText").textContent = "ブラウザに保存できなかったため、新しい島を作れませんでした。";
        return;
      }
      done("new");
    };
    $("#titleConfirmNo").onclick = () => show("menu");
    $("#titleTogether").onclick = () => {
      $("#titleHostBox").hidden = false;
      $("#titleJoin").textContent = "部屋に入る";
      $("#titleRoomHeading").textContent = "みんなで遊ぶ";
      show("room");
    };
    $("#titleBack").onclick = () => {
      status.textContent = "";
      show("menu");
    };
    $("#titleHost").onclick = () => {
      if (busy) return;
      setPlayerName(name.value, storage.local);
      store(storage.session, KEYS.host, "1");
      done("host");
    };
    $("#titleJoin").onclick = join;
    code.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        join();
      }
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && root.dataset.view !== "menu" && !busy) {
        e.preventDefault();
        show("menu");
      }
    });
  });
}

// game-bootstrap.js
var bootVersion = () => {
  const m = String(import.meta.url).match(/app-(v[\d.]+)/);
  if (m) return m[1];
  const note = (document.querySelector(".development-note")?.textContent || "").match(/v\d+(?:\.\d+)*/);
  return note ? note[0] : "";
};
if (takeTitleSkip() || new URLSearchParams(location.search).get("title") === "0") document.querySelector("#title")?.setAttribute("hidden", "");
else await runTitle({ version: bootVersion() });
var { ACTIVE_WORLD_SEED } = await import("./chunk-RPEDW3IW.js");
var touchDevice = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
var loadingPreferences = { quality: touchDevice ? "balanced" : "high", resolution: "auto" };
try {
  const stored = JSON.parse(localStorage.getItem("kumarim-settings-v1") || "{}");
  loadingPreferences = { ...loadingPreferences, ...stored };
} catch {
}
var loadingProfile = ["startup-v4-generated", ACTIVE_WORLD_SEED, loadingPreferences.quality, normalizeResolution(loadingPreferences.resolution), innerWidth, innerHeight, devicePixelRatio || 1].join(":");
var underground = savedUnderground();
var atlas = createLoadingAtlas(document.querySelector("#loading"));
var startupProgress = getStartupLoadingProgress({ profile: loadingProfile + (underground ? ":underground" : ""), groups: [["terrain", "assets"], ["nearby", "poi"], ["distant"], ["shaders"]], onSnapshot: (s) => {
  try {
    atlas?.progress(s);
  } catch (e) {
    console.warn("[atlas]", e);
  }
}, ...underground ? { stages: LOADING_STAGES_UNDERGROUND } : {} });
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
  if (globalThis.KUMARIM_MODEL_PACK) await import("./chunk-QTN5EYW7.js");
  await import("./chunk-EFMS7AMX.js");
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
