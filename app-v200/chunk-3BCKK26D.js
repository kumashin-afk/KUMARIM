import "./chunk-MLKGABMK.js";

// display-probe.js
var DISPLAY_PROBE = Object.freeze({
  // Before the first step, and after the look is made plain or given back: the page left to settle (ms).
  settleMs: 2500,
  // Each change watched this long (ms): the next frame's wait, the GPU and the long frames.
  holdMs: 1500,
  // The rounds: as the game shows it twice, then plain once.
  rounds: Object.freeze([Object.freeze({ plain: false, label: "そのまま" }), Object.freeze({ plain: false, label: "2 回目" }), Object.freeze({ plain: true, label: "飾りなし" })]),
  // A frame this much later than the one before counts as a stop (ms).
  stopMs: 100,
  // The longest the end waits for the last fences (ms).
  drainMs: 3e3,
  plainClass: "probe-plain",
  hideClass: "probe-hide-play"
});
function displayProbeStyle({ plainClass = DISPLAY_PROBE.plainClass, hideClass = DISPLAY_PROBE.hideClass } = {}) {
  const plain = `html.${plainClass} *,html.${plainClass} *::before,html.${plainClass} *::after,html.${plainClass} dialog::backdrop`;
  return `${plain}{text-shadow:none!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;filter:none!important;mask-image:none!important;-webkit-mask-image:none!important}html.${hideClass} body.playing .play-ui,html.${hideClass} #survivalHud{opacity:0!important;visibility:hidden!important}`;
}
function displayProbeSteps({ doc = globalThis.document, panel = null, hideClass = DISPLAY_PROBE.hideClass } = {}) {
  const $ = (s) => doc.querySelector(s);
  const copy = (source, change) => {
    const el = source.cloneNode(true);
    el.removeAttribute("id");
    for (const c of el.querySelectorAll("[id]")) c.removeAttribute("id");
    el.dataset.displayProbe = "1";
    change?.(el);
    source.parentNode.insertBefore(el, source.nextSibling);
    return el;
  };
  const steps = [];
  const add = (id, label, apply, { on = "出す", off = "消す" } = {}) => steps.push({ id, label, on, off, apply });
  add("idle", "何も変えない（くらべる用）", () => () => {
  }, { on: "1 回目", off: "2 回目" });
  const toasts = $("#toasts");
  if (toasts) add("toast", "お知らせ（右の帯）", () => {
    const el = doc.createElement("div");
    el.className = "toast";
    el.dataset.displayProbe = "1";
    const small = doc.createElement("small");
    small.textContent = "表示の確認";
    const text = doc.createElement("div");
    text.textContent = "画面の上の表示を 1 つずつ確かめています。";
    el.append(small, text);
    toasts.append(el);
    return () => {
      el.style.opacity = 0;
      el.style.transition = "opacity .4s";
      setTimeout(() => el.remove(), 450);
    };
  });
  const interaction = $("#interaction");
  if (interaction) add("interaction", "操作の案内（「E で拾う」など）", () => {
    const el = copy(interaction, (e) => {
      e.classList.remove("hidden");
      const kbd = e.querySelector("kbd");
      if (kbd) kbd.textContent = "E";
      const small = e.querySelector("small");
      if (small) small.textContent = "拾う";
      const strong = e.querySelector("strong");
      if (strong) strong.textContent = "小枝";
    });
    return () => el.remove();
  });
  const aim = $("#aim");
  if (aim) add("aim", "照準が物に合った時の形", () => {
    const had = aim.classList.contains("targeted");
    aim.classList.toggle("targeted", !had);
    return () => aim.classList.toggle("targeted", had);
  });
  const slots = [...doc.querySelectorAll(".sv-slot")];
  if (slots.length > 1) add("slot", "持ち物の選び替え", () => {
    const at = Math.max(0, slots.findIndex((s) => s.classList.contains("selected"))), next = (at + 1) % slots.length, was = slots.map((s) => s.classList.contains("selected"));
    slots[at].classList.remove("selected");
    slots[next].classList.add("selected");
    return () => slots.forEach((s, i) => s.classList.toggle("selected", was[i]));
  }, { on: "隣へ", off: "戻す" });
  add("hud", "遊ぶ画面の表示（スタートの時と同じ出方）", () => {
    const root = doc.documentElement;
    root.classList.add(hideClass);
    return () => root.classList.remove(hideClass);
  }, { on: "隠す", off: "出す（スタートの時と同じ）" });
  const perf = $("#performanceHUD");
  if (perf) add("perf", "性能の表示（右上の数字）", () => {
    const el = copy(perf, (e) => {
      e.hidden = false;
      if (!e.textContent.trim()) e.textContent = "FPS 120  CPU 8.0 ms  GPU 9.0 ms";
    });
    return () => el.remove();
  });
  const discovery = $("#discovery");
  if (discovery) add("discovery", "場所の発見（大きな文字とぼかした影）", () => {
    const el = copy(discovery, (e) => {
      e.classList.remove("show");
      const h = e.querySelector("h2");
      if (h) h.textContent = "表示の確認";
    });
    requestAnimationFrame(() => el.classList.add("show"));
    return () => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 1100);
    };
  });
  const flash = $("#damageFlash");
  if (flash) add("damage", "傷を負った時の赤い縁（大きくぼかした影）", () => {
    const was = flash.style.opacity;
    flash.style.opacity = ".7";
    return () => {
      flash.style.opacity = was;
    };
  });
  if (typeof doc.createElement("dialog").showModal === "function") add("dialog", "メニューの窓（後ろをぼかす窓）", () => {
    const el = doc.createElement("dialog");
    el.dataset.displayProbe = "1";
    const header = doc.createElement("div");
    header.className = "panel-header";
    const wrap = doc.createElement("div"), eyebrow = doc.createElement("p"), h2 = doc.createElement("h2");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "表示の確認";
    h2.textContent = "メニューの窓";
    wrap.append(eyebrow, h2);
    header.append(wrap);
    const copyText = doc.createElement("p");
    copyText.className = "panel-copy";
    copyText.textContent = "窓を開いた時に止まるかを確かめています。すぐに閉じます。";
    el.append(header, copyText);
    doc.body.append(el);
    try {
      el.showModal();
    } catch {
      el.show?.();
    }
    return () => {
      try {
        el.close();
      } catch {
      }
      el.remove();
    };
  });
  if (panel) add("f3", "この計測の窓（F3 の窓）", () => {
    const was = panel.style.visibility;
    panel.style.visibility = "";
    return () => {
      panel.style.visibility = was;
    };
  });
  return steps;
}
async function watch({ gl, ms, frame, now, fences }) {
  const start = now();
  let last = start, frames = 0, maxGap = 0, stops = 0, stopMs = 0, gpuMax = 0;
  const check = (t) => {
    for (let i = fences.length - 1; i >= 0; i--) {
      const f = fences[i];
      let done = false;
      try {
        done = gl.getSyncParameter(f.sync, gl.SYNC_STATUS) === gl.SIGNALED;
      } catch {
        done = true;
      }
      if (done) {
        if (f.owner) f.owner.gpuMax = Math.max(f.owner.gpuMax, t - f.at);
        try {
          gl.deleteSync(f.sync);
        } catch {
        }
        fences.splice(i, 1);
      }
    }
  };
  const self = { gpuMax: 0 };
  while (now() - start < ms) {
    await frame();
    const t = now(), gap = t - last;
    last = t;
    frames++;
    if (gap > maxGap) maxGap = gap;
    if (gap >= DISPLAY_PROBE.stopMs) {
      stops++;
      stopMs += gap;
    }
    check(t);
    let sync = null;
    try {
      sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    } catch {
    }
    if (sync) fences.push({ sync, at: t, owner: self });
  }
  const end = now();
  for (const f of fences) if (f.owner === self) self.gpuMax = Math.max(self.gpuMax, end - f.at);
  gpuMax = self.gpuMax;
  return { frames, maxGap: Math.round(maxGap), stops, stopMs: Math.round(stopMs), gpuMax: Math.round(gpuMax), start, end };
}
function lafFor(entries, start, end) {
  let n = 0, ms = 0, blocking = 0, script = 0, render = 0;
  for (const e of entries) {
    if (e.startTime + e.duration < start || e.startTime > end) continue;
    n++;
    ms += e.duration;
    blocking += e.blockingDuration || 0;
    for (const s of e.scripts || []) script += s.duration || 0;
    if (Number.isFinite(e.renderStart) && Number.isFinite(e.styleAndLayoutStart)) render += Math.max(0, e.startTime + e.duration - e.renderStart);
  }
  return n ? { n, ms: Math.round(ms), blocking: Math.round(blocking), script: Math.round(script), render: Math.round(render) } : null;
}
async function runDisplayProbe({
  gl,
  steps,
  doc = globalThis.document,
  frame = () => new Promise((resolve) => requestAnimationFrame(resolve)),
  now = () => performance.now(),
  onStep = () => {
  },
  cancelled = () => false,
  note = () => {
  },
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  settings = DISPLAY_PROBE,
  observe = globalThis.PerformanceObserver
} = {}) {
  const fences = [], entries = [], root = doc.documentElement;
  let observer = null;
  try {
    if (observe && (observe.supportedEntryTypes || []).includes("long-animation-frame")) {
      observer = new observe((list) => {
        for (const e of list.getEntries()) entries.push(e);
      });
      observer.observe({ type: "long-animation-frame", buffered: false });
    }
  } catch {
    observer = null;
  }
  const style = doc.createElement("style");
  style.dataset.displayProbe = "1";
  style.textContent = displayProbeStyle(settings);
  doc.head.append(style);
  const rounds = [], total = settings.rounds.length * steps.length * 2;
  let done = 0, stopped = false;
  const env = { ua: globalThis.navigator?.userAgent || "", dpr: globalThis.devicePixelRatio || 1, canvas: gl?.canvas ? `${gl.canvas.width}x${gl.canvas.height}` : null, laf: !!observer };
  try {
    for (const round of settings.rounds) {
      if (cancelled()) {
        stopped = true;
        break;
      }
      root.classList.toggle(settings.plainClass, !!round.plain);
      onStep({ done, total, label: `${round.label}: 落ち着くのを待っています` });
      note(`表示の確認: ${round.label}`);
      await wait(settings.settleMs);
      const results = [];
      for (const step of steps) {
        if (cancelled()) {
          stopped = true;
          break;
        }
        let undo = null;
        for (const phase of ["on", "off"]) {
          if (cancelled()) {
            stopped = true;
            break;
          }
          const phaseLabel = step[phase];
          onStep({ done, total, label: `${round.label}: ${step.label} - ${phaseLabel}` });
          note(`表示の確認: ${step.id} ${phase === "on" ? "出す" : "消す"}`);
          try {
            if (phase === "on") undo = step.apply();
            else {
              undo?.();
              undo = null;
            }
          } catch (error) {
            results.push({ id: step.id, label: step.label, phase, phaseLabel, error: String(error?.message || error).slice(0, 200) });
            continue;
          }
          const r = await watch({ gl, ms: settings.holdMs, frame, now, fences });
          results.push({ id: step.id, label: step.label, phase, phaseLabel, ...r });
          done++;
        }
        try {
          undo?.();
        } catch {
        }
        if (stopped) break;
      }
      rounds.push({ label: round.label, plain: !!round.plain, results });
      if (stopped) break;
    }
  } finally {
    root.classList.remove(settings.plainClass, settings.hideClass);
    const until = now() + settings.drainMs;
    while (fences.length && now() < until) {
      await frame();
      for (let i = fences.length - 1; i >= 0; i--) {
        let s = false;
        try {
          s = gl.getSyncParameter(fences[i].sync, gl.SYNC_STATUS) === gl.SIGNALED;
        } catch {
          s = true;
        }
        if (s) {
          try {
            gl.deleteSync(fences[i].sync);
          } catch {
          }
          fences.splice(i, 1);
        }
      }
    }
    for (const f of fences) try {
      gl.deleteSync(f.sync);
    } catch {
    }
    fences.length = 0;
    if (observer) {
      await wait(300);
      try {
        for (const e of observer.takeRecords?.() || []) entries.push(e);
        observer.disconnect();
      } catch {
      }
    }
    style.remove();
    for (const el of doc.querySelectorAll("[data-display-probe]")) if (el.tagName !== "STYLE") {
      try {
        el.close?.();
      } catch {
      }
      el.remove();
    }
  }
  for (const round of rounds) for (const r of round.results) if (Number.isFinite(r.start)) {
    r.laf = lafFor(entries, r.start, r.end);
    delete r.start;
    delete r.end;
  }
  return { env, rounds, cancelled: stopped };
}
function displayProbeText({ env, rounds = [], cancelled } = {}) {
  const lines = [`表示の確認（${env?.canvas || "?"}${env?.laf ? "" : "・ブラウザの長いフレームの記録なし"}）${cancelled ? "（途中で中止）" : ""}`, "各段：出した後 / 消した後 の、次のフレームまでの最長（GPU の遅れ）。! は 0.1 秒以上の止まり"];
  const steps = /* @__PURE__ */ new Map();
  for (const round of rounds) for (const r of round.results) {
    if (!steps.has(r.id)) steps.set(r.id, { label: r.label, rounds: /* @__PURE__ */ new Map() });
    const s = steps.get(r.id);
    if (!s.rounds.has(round.label)) s.rounds.set(round.label, {});
    s.rounds.get(round.label)[r.phase] = r;
  }
  const cell = (r) => !r ? "-" : r.error ? "失敗" : `${r.maxGap >= DISPLAY_PROBE.stopMs ? "!" : ""}${r.maxGap}${r.gpuMax > r.maxGap + 30 ? `（GPU ${r.gpuMax}）` : ""}`;
  for (const [, s] of steps) lines.push(`${s.label}: ` + [...s.rounds].map(([label, p]) => `${label} ${cell(p.on)} / ${cell(p.off)}`).join("・") + " ms");
  return lines.join("\n");
}
export {
  DISPLAY_PROBE,
  displayProbeSteps,
  displayProbeStyle,
  displayProbeText,
  runDisplayProbe
};
