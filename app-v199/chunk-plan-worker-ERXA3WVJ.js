// chunk-plan-worker.js
var core = null;
var queue = [];
var scheduled = false;
function next() {
  scheduled = false;
  let at = 0;
  for (let i = 1; i < queue.length; i++) if ((queue[i].priority || 0) < (queue[at].priority || 0)) at = i;
  const msg = queue.splice(at, 1)[0];
  if (!msg) return;
  const t0 = performance.now();
  try {
    const { result, transfer } = core.planChunk(msg);
    self.postMessage({ type: "result", id: msg.id, result, ms: performance.now() - t0 }, transfer);
  } catch (error) {
    self.postMessage({ type: "result", id: msg.id, error: String(error?.stack || error).slice(0, 2e3) });
  }
  schedule();
}
function schedule() {
  if (!scheduled && queue.length) {
    scheduled = true;
    setTimeout(next, 0);
  }
}
self.onmessage = async ({ data: msg }) => {
  if (msg?.type === "init") {
    try {
      globalThis.__EW_WORLD_SEED = msg.seed;
      globalThis.__EW_WORLD_DATA = msg.data;
      const t0 = performance.now();
      core = await import("./chunk-DEOERZKE.js");
      globalThis.__EW_WORLD_DATA = void 0;
      self.postMessage({ type: "ready", ms: performance.now() - t0 });
    } catch (error) {
      self.postMessage({ type: "failed", error: String(error?.stack || error).slice(0, 2e3) });
    }
    return;
  }
  if (msg?.type === "cancel") {
    const i = queue.findIndex((q) => q.id === msg.id);
    if (i >= 0) {
      queue.splice(i, 1);
      self.postMessage({ type: "result", id: msg.id, cancelled: true });
    }
    return;
  }
  if (msg?.type === "priority") {
    const q = queue.find((q2) => q2.id === msg.id);
    if (q) q.priority = msg.priority;
    return;
  }
  if (msg?.type === "plan") {
    if (!core) {
      self.postMessage({ type: "result", id: msg.id, error: "not ready" });
      return;
    }
    try {
      core.keep(msg);
    } catch {
    }
    queue.push(msg);
    schedule();
  }
};
