// worker-status.js
var status = /* @__PURE__ */ new Map();
var WORKER_NAMES = Object.freeze({ ocean: "海", shatter: "岩", world: "島", trees: "木", paint: "絵" });
function reportWorker(name, ok, detail = "") {
  const known = status.get(name);
  if (known && !known.ok) return;
  if (known && known.ok === !!ok) return;
  status.set(name, { ok: !!ok, detail: String(detail || "").slice(0, 120) });
  if (!ok) console.warn(`[Workers] ${name} の作業をメインスレッドで行います（${detail || "worker unavailable"}）`);
}
function workerSummary() {
  if (!status.size) return "";
  return [...status].map(([name, s]) => name + (s.ok ? "○" : "×")).join(" ");
}

export {
  WORKER_NAMES,
  reportWorker,
  workerSummary
};
