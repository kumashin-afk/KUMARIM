// loading-progress.js
var LOADING_STAGES = Object.freeze([
  Object.freeze({ id: "terrain", label: "島全体の基礎地形", unit: "地点" }),
  Object.freeze({ id: "assets", label: "基本画像・モデル", unit: "件" }),
  Object.freeze({ id: "nearby", label: "周辺の地形・植生", unit: "区画" }),
  Object.freeze({ id: "poi", label: "探索場所", unit: "か所" }),
  Object.freeze({ id: "distant", label: "遠景の森", unit: "区画" }),
  Object.freeze({ id: "shaders", label: "描画", unit: "描画パス" })
]);
var finite = (n) => Number.isFinite(n) && n >= 0;
var clock = () => globalThis.performance?.now?.() ?? Date.now();
var defaultStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};
function createLoadingProgressModel({ stages = LOADING_STAGES, now = clock, storage = defaultStorage(), historyKey = "kumarim-load-timing-v1", profile = "startup-v1", sequential = false, groups = null } = {}) {
  const records = /* @__PURE__ */ new Map(), order = [], key = historyKey + ":" + profile;
  let history = {}, current = null, status = "running", failure = "";
  for (const input of stages) {
    if (!input?.id || records.has(input.id)) throw new TypeError("Unique loading stage IDs required");
    const record2 = { ...input, status: "waiting", completed: 0, total: null, detail: "", started: null, ended: null, lastSample: null, samples: 0, sampleUnits: 0, sampleMilliseconds: 0 };
    records.set(input.id, record2);
    order.push(record2);
  }
  if (!order.length) throw new TypeError("Loading stages required");
  if (groups) {
    const ids = groups.flat();
    if (ids.length !== order.length || new Set(ids).size !== order.length || ids.some((id) => !records.has(id)) || groups.some((group) => !group.length)) throw new TypeError("Loading groups must contain each stage exactly once");
  }
  try {
    const saved = JSON.parse(storage?.getItem(key) || "null");
    if (saved?.version === 1) {
      for (const [id, h] of Object.entries(saved.stages || {})) if (records.has(id) && finite(h.durationMs) && h.durationMs > 0 && h.durationMs < 36e5 && (h.units === null || finite(h.units)) && h.unit === records.get(id).unit) history[id] = h;
    }
  } catch {
  }
  const record = (id) => {
    const value = records.get(id);
    if (!value) throw new RangeError("Unknown loading stage: " + id);
    return value;
  };
  const running = () => {
    if (status !== "running") throw new Error("Loading is already " + status);
  };
  function apply(r, { completed = r.completed, total = r.total, detail = r.detail, unit = r.unit } = {}) {
    if (!Number.isInteger(completed) || completed < r.completed) throw new RangeError("Completed loading units cannot decrease");
    if (total !== null && (!Number.isInteger(total) || total < completed)) throw new RangeError("Total units must cover completed units");
    if (typeof detail !== "string" || typeof unit !== "string") throw new TypeError("Loading detail/unit must be text");
    const t = now(), delta = completed - r.completed;
    if (delta > 0) {
      const elapsed = Math.max(0, t - (r.lastSample ?? r.started ?? t));
      r.sampleUnits += delta;
      r.sampleMilliseconds += elapsed;
      if (elapsed >= 1) r.samples++;
      r.lastSample = t;
    }
    r.completed = completed;
    r.total = total;
    r.detail = detail;
    r.unit = unit;
  }
  function begin(id, values = {}) {
    running();
    const r = record(id);
    if (r.status === "done") throw new Error("Cannot reopen completed loading stage");
    if (r.status === "waiting") {
      r.status = "running";
      r.started = now();
      r.lastSample = r.started;
    }
    current = id;
    apply(r, values);
    return snapshot();
  }
  function report(id, values) {
    running();
    const r = record(id);
    if (r.status !== "running") throw new Error("Begin a loading stage before reporting");
    apply(r, values);
    return true;
  }
  function remember(r) {
    const measured = r.ended - r.started;
    if (!finite(measured)) return;
    const elapsed = measured === 0 ? 1 : measured;
    const old = history[r.id], units = r.total ?? (r.completed || null), durationMs = old ? old.units > 0 && units > 0 ? old.durationMs / old.units * units * 0.6 + elapsed * 0.4 : old.durationMs * 0.6 + elapsed * 0.4 : elapsed;
    history[r.id] = { durationMs, units, unit: r.unit, runs: Math.min(100, (old?.runs || 0) + 1) };
    try {
      storage?.setItem(key, JSON.stringify({ version: 1, stages: history }));
    } catch {
    }
  }
  function end(id, detail) {
    running();
    const r = record(id);
    if (r.status !== "running") throw new Error("Cannot finish a stage that is not running");
    if (detail !== void 0) r.detail = String(detail);
    if (r.total !== null) r.completed = r.total;
    r.ended = now();
    r.status = "done";
    remember(r);
    if (current === id) current = order.find((s) => s.status === "running")?.id ?? order.find((s) => s.status === "waiting")?.id ?? id;
    if (order.every((s) => s.status === "done")) status = "done";
    return snapshot();
  }
  function estimate(r, t) {
    if (r.status === "done") return { ms: 0, source: "complete" };
    if (r.status === "running" && r.total !== null && r.completed < r.total && r.samples >= 3 && r.sampleMilliseconds >= 1e3 && r.sampleUnits > 0) {
      const unitMs = r.sampleMilliseconds / r.sampleUnits;
      if (t - r.lastSample <= Math.max(2e3, unitMs * 3)) return { ms: unitMs * (r.total - r.completed), source: "current-units" };
    }
    const h = history[r.id];
    if (h && h.unit === r.unit) {
      const projected = r.total !== null && h.units > 0 ? h.durationMs * r.total / h.units : h.durationMs;
      if (r.status === "waiting") return { ms: projected, source: "previous-run" };
      if (r.total !== null && h.units > 0 && r.completed < r.total && t - (r.lastSample ?? r.started) <= Math.max(2e3, h.durationMs / h.units * 3)) return { ms: h.durationMs / h.units * (r.total - r.completed), source: "previous-units" };
      const remaining = projected - (t - r.started);
      if (remaining > 0) return { ms: remaining, source: "previous-run" };
    }
    return null;
  }
  function snapshot() {
    const t = now(), r = current ? record(current) : order[0], remaining = order.filter((s) => s.status !== "done");
    let etaRecord = r, stageEstimate = status === "running" ? estimate(r, t) : status === "done" ? { ms: 0, source: "complete" } : null, overall = null;
    if (status === "running" && !stageEstimate) {
      for (const candidate of order) if (candidate.status === "running") {
        const value = estimate(candidate, t);
        if (value) {
          etaRecord = candidate;
          stageEstimate = value;
          break;
        }
      }
    }
    if (status === "done") overall = { ms: 0, source: "complete" };
    else if (status === "running" && (groups || sequential || remaining.length === 1)) {
      const estimates = remaining.map((s) => estimate(s, t));
      if (estimates.every(Boolean)) {
        const timeById = new Map(remaining.map((s, i) => [s.id, estimates[i].ms])), ms = groups ? groups.reduce((sum, group) => sum + Math.max(...group.map((id) => timeById.get(id) || 0)), 0) : estimates.reduce((sum, e) => sum + e.ms, 0);
        overall = { ms, source: estimates.some((e) => e.source.startsWith("previous")) ? "includes-previous-run" : "current-units" };
      }
    }
    return { status, error: failure, current: r.id, label: r.label, detail: r.detail, unit: r.unit, completed: r.completed, total: r.total, finishedStages: order.filter((s) => s.status === "done").length, totalStages: order.length, stageEtaId: etaRecord.id, stageEtaLabel: etaRecord.label, stageEtaSeconds: stageEstimate ? Math.ceil(stageEstimate.ms / 1e3) : null, overallEtaSeconds: overall ? Math.ceil(overall.ms / 1e3) : null, estimateSource: overall?.source ?? stageEstimate?.source ?? null, stages: order.map((s) => ({ id: s.id, label: s.label, status: s.status, completed: s.completed, total: s.total, unit: s.unit })) };
  }
  function error(message) {
    if (status === "done") return snapshot();
    status = "error";
    failure = String(message || "準備を完了できませんでした。");
    return snapshot();
  }
  return { begin, report, end, error, snapshot };
}
function createLoadingProgress(root, { now = clock, schedule = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id), render, onSnapshot, ...options } = {}) {
  const model = createLoadingProgressModel({ ...options, now });
  let timer = null, lastWrite = -Infinity, disposed = false;
  const elements = root ? { stage: root.querySelector("#loadText"), detail: root.querySelector("#loadDetail"), counts: root.querySelector("#loadCounts"), eta: root.querySelector("#loadEta"), bar: root.querySelector("#loadProgress"), steps: root.querySelector("#loadStages") } : null;
  const stepNodes = /* @__PURE__ */ new Map();
  if (root) {
    if (Object.values(elements).some((node) => !node)) throw new Error("Loading progress markup is incomplete");
    root.setAttribute("aria-busy", "true");
    for (const stage of options.stages || LOADING_STAGES) {
      const li = root.ownerDocument.createElement("li");
      li.textContent = stage.label;
      li.dataset.stage = stage.id;
      elements.steps.append(li);
      stepNodes.set(stage.id, li);
    }
  }
  const put = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };
  function draw(state) {
    if (render) render(state);
    if (!elements) return;
    put(elements.stage, state.status === "done" ? "旅の準備ができました" : state.status === "error" ? "読み込みを完了できませんでした" : state.label + "を準備しています");
    put(elements.detail, state.status === "error" ? state.error : state.detail || "必要な処理を確認しています");
    const units = state.total === null ? `${state.completed} ${state.unit} 準備済み · 総数を確認中` : `${state.completed} / ${state.total} ${state.unit}`;
    put(elements.counts, `完了した工程 ${state.finishedStages} / ${state.totalStages} · ${units}`);
    let eta = state.status === "done" ? "準備完了" : state.status === "error" ? "処理を停止しました" : state.overallEtaSeconds !== null ? `全体の残り 約${Math.max(1, state.overallEtaSeconds)}秒` : state.stageEtaSeconds !== null ? `全体の残りは計算中 · ${state.stageEtaId === state.current ? "この工程" : state.stageEtaLabel}は約${Math.max(1, state.stageEtaSeconds)}秒` : "残り時間を計算中";
    if (state.status === "running" && state.estimateSource?.includes("previous")) eta += "（前回の計測を含む目安）";
    put(elements.eta, eta);
    elements.bar.max = state.totalStages;
    elements.bar.value = state.finishedStages;
    elements.bar.setAttribute("aria-valuetext", `全${state.totalStages}工程のうち${state.finishedStages}工程が完了`);
    root.setAttribute("aria-busy", String(state.status === "running"));
    for (const stage of state.stages) {
      const node = stepNodes.get(stage.id);
      node.dataset.status = stage.status;
      put(node, stage.label + (stage.status === "running" ? ` ${stage.completed}/${stage.total ?? "?"} ${stage.unit}` : ""));
      node.setAttribute("aria-label", node.textContent + "・" + { waiting: "未開始", running: "準備中", done: "完了" }[stage.status]);
    }
  }
  function flush() {
    timer = null;
    if (disposed) return;
    const elapsed = now() - lastWrite;
    if (elapsed < 250) {
      timer = schedule(flush, 250 - elapsed);
      return;
    }
    const state = model.snapshot();
    lastWrite = now();
    draw(state);
    onSnapshot?.(state);
    if (state.status === "running" && timer === null) timer = schedule(flush, 250);
  }
  function request() {
    if (disposed) return;
    if (timer === null) {
      const elapsed = now() - lastWrite;
      if (elapsed >= 250) flush();
      else timer = schedule(flush, 250 - elapsed);
    }
  }
  const action = (name, ...args) => {
    if (disposed) return false;
    const result = model[name](...args);
    request();
    return result;
  };
  request();
  return { begin: (id, v) => action("begin", id, v), report: (id, v) => action("report", id, v), end: (id, detail) => action("end", id, detail), error: (message) => action("error", message), snapshot: model.snapshot, dispose() {
    if (disposed) return;
    disposed = true;
    if (timer !== null) cancel(timer);
    timer = null;
  }, get disposed() {
    return disposed;
  } };
}
var startup = null;
function getStartupLoadingProgress(options = {}) {
  if (!startup) startup = createLoadingProgress(globalThis.document?.querySelector("#loading"), options);
  return startup;
}

export {
  LOADING_STAGES,
  createLoadingProgressModel,
  createLoadingProgress,
  getStartupLoadingProgress
};
