// render-diagnostics.js
var SAMPLE_LIMIT = 60;
var QUERY_LIMIT = 4;
var QUERY_TIMEOUT_MS = 5e3;
var PEAK_HOLD_MS = 4e3;
function peak() {
  let value = null, at = -Infinity;
  return { add(v, t) {
    if (!Number.isFinite(v) || v < 0) return;
    if (value === null || v >= value || t - at > PEAK_HOLD_MS) {
      value = v;
      at = t;
    }
  }, get(t) {
    return value !== null && t - at <= PEAK_HOLD_MS ? value : null;
  }, clear() {
    value = null;
    at = -Infinity;
  } };
}
function series() {
  const values = [];
  let cursor = 0, sum = 0;
  return { add(v) {
    if (!Number.isFinite(v) || v < 0) return;
    if (values.length < SAMPLE_LIMIT) values.push(v);
    else {
      sum -= values[cursor];
      values[cursor] = v;
      cursor = (cursor + 1) % SAMPLE_LIMIT;
    }
    sum += v;
  }, mean() {
    return values.length ? sum / values.length : null;
  }, count() {
    return values.length;
  }, clear() {
    values.length = 0;
    cursor = 0;
    sum = 0;
  } };
}
function classifyRenderer(name) {
  if (/swiftshader|llvmpipe|softpipe|software|microsoft basic render|\bWARP\b/i.test(name || "")) return "software";
  if (/NVIDIA|GeForce|Radeon|\bAMD\b|\bIntel\b|Apple (?:M\d|GPU)|Adreno|Mali|PowerVR/i.test(name || "")) return "hardware-reported";
  return "unknown";
}
function createRenderDiagnostics(renderer, { enabled = false, now = () => performance.now(), page = globalThis.window, document = globalThis.document, gpuScope = "render", onFrame, onGpu, getTag } = {}) {
  if (!enabled) return { enabled: false, beginFrame() {
  }, beginRender() {
  }, endFrame() {
  }, suspend() {
  }, resetSamples() {
  }, dispose() {
  }, appendSettings() {
  }, refreshSettings() {
  }, snapshot: () => ({ enabled: false }) };
  const canvas = renderer.domElement, gl = renderer.getContext(), update = series(), submission = series(), interval = series(), gpu = series(), framePeak = peak(), updatePeak = peak(), submissionPeak = peak();
  let disposed = false, lost = false, ext, backend = null, frame = null, active = null, pending = [], lastRaf = null, lastCpuAt = null, lastGpuAt = null, state = "waiting", gpuState = "waiting", completed = 0, skipped = 0;
  const observeFrame = typeof onFrame === "function", observeGpu = typeof onGpu === "function", tagged = observeFrame || observeGpu;
  let nextFrameId = 0;
  function emitGpuReset(reason) {
    if (observeGpu) safely(() => onGpu({ type: "reset", reason, at: now() }));
  }
  let info, originalInfoUpdate;
  let lastDraws = null;
  function countDraw() {
    const r = info.render, calls = r.calls, triangles = r.triangles, lines = r.lines, points = r.points;
    const result = originalInfoUpdate.apply(this, arguments);
    if (frame) {
      frame.draws.calls += r.calls - calls;
      frame.draws.triangles += r.triangles - triangles;
      frame.draws.lines += r.lines - lines;
      frame.draws.points += r.points - points;
    }
    return result;
  }
  function attachDrawCounter() {
    if (info?.update === countDraw) info.update = originalInfoUpdate;
    info = renderer.info;
    originalInfoUpdate = info?.update;
    if (typeof originalInfoUpdate === "function") info.update = countDraw;
  }
  attachDrawCounter();
  const safely = (fn) => {
    try {
      return fn();
    } catch {
      return null;
    }
  };
  function identity() {
    if (lost || disposed) return { classification: "unknown", renderer: null, vendor: null, unmasked: false };
    if (backend) return { ...backend };
    const debug = null;
    const name = safely(() => gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    const vendor = safely(() => gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR));
    backend = { classification: classifyRenderer(name), renderer: typeof name === "string" ? name : null, vendor: typeof vendor === "string" ? vendor : null, unmasked: !!debug };
    return { ...backend };
  }
  function clearQueries(invalidContext = false) {
    if (active) {
      if (!invalidContext && (gpuScope !== "frame" || safely(() => gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) === active.query)) safely(() => gl.endQuery(ext.TIME_ELAPSED_EXT));
      if (!invalidContext) safely(() => gl.deleteQuery(active.query));
      active = null;
    }
    if (!invalidContext) for (const item of pending) safely(() => gl.deleteQuery(item.query));
    pending = [];
  }
  function resetGpu(status) {
    clearQueries(lost);
    gpu.clear();
    lastGpuAt = null;
    gpuState = status;
    emitGpuReset(status);
  }
  function poll(at) {
    if (lost) return false;
    if (ext === void 0) {
      ext = safely(() => gl.getExtension("EXT_disjoint_timer_query_webgl2"));
      if (ext && !(safely(() => gl.getQuery(ext.TIME_ELAPSED_EXT, ext.QUERY_COUNTER_BITS_EXT)) > 0)) ext = null;
      gpuState = ext ? "pending" : "unsupported";
    }
    if (!ext) return false;
    try {
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        resetGpu("disjoint");
        return false;
      }
      for (let i = pending.length - 1; i >= 0; i--) {
        const item = pending[i];
        if (at - item.at > QUERY_TIMEOUT_MS) {
          gl.deleteQuery(item.query);
          pending.splice(i, 1);
          gpuState = "timeout";
          gpu.clear();
          lastGpuAt = null;
          emitGpuReset("timeout");
          if (disposed || lost) return false;
          continue;
        }
        if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) continue;
        const ns = gl.getQueryParameter(item.query, gl.QUERY_RESULT);
        gl.deleteQuery(item.query);
        pending.splice(i, 1);
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          resetGpu("disjoint");
          return false;
        }
        if (Number.isFinite(ns) && ns >= 0) {
          gpu.add(ns / 1e6);
          lastGpuAt = Math.max(lastGpuAt ?? -Infinity, item.at);
          gpuState = "ready";
          if (observeGpu) safely(() => onGpu({ type: "sample", frameId: item.frameId, tag: item.tag, at: item.at, completedAt: at, elapsedMs: ns / 1e6 }));
        } else {
          gpu.clear();
          lastGpuAt = null;
          gpuState = "unavailable";
          emitGpuReset("unavailable");
        }
        if (disposed || lost) return false;
      }
      return true;
    } catch {
      resetGpu("unavailable");
      return false;
    }
  }
  function beginFrame(rafTime) {
    if (disposed || lost) return;
    if (frame) {
      clearQueries();
      frame = null;
    }
    const at = now(), canTime = poll(at);
    if (disposed || lost) return;
    state = "running";
    const intervalMs = lastRaf !== null && Number.isFinite(rafTime) && rafTime > lastRaf ? rafTime - lastRaf : null;
    if (intervalMs !== null) {
      interval.add(intervalMs);
      framePeak.add(intervalMs, at);
    }
    lastRaf = Number.isFinite(rafTime) ? rafTime : null;
    frame = { start: now(), renderStart: null, canTime, draws: { calls: 0, triangles: 0, lines: 0, points: 0 } };
    if (tagged) {
      frame.frameId = ++nextFrameId;
      frame.tag = typeof getTag === "function" ? safely(getTag) : null;
      frame.rafTime = lastRaf;
      frame.intervalMs = intervalMs;
    }
    if (gpuScope === "frame") beginQuery(frame.start);
  }
  function beginQuery(at) {
    if (frame.canTime && pending.length + (active ? 1 : 0) < QUERY_LIMIT) {
      if (safely(() => gl.getParameter(ext.GPU_DISJOINT_EXT))) {
        resetGpu("disjoint");
        return;
      }
      try {
        if (!gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
          const query = gl.createQuery();
          if (query) {
            active = { query, at };
            if (observeGpu) {
              active.frameId = frame.frameId;
              active.tag = frame.tag;
            }
            gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
            if (!gpu.count()) gpuState = "pending";
          } else gpuState = "unavailable";
        } else skipped++;
      } catch {
        resetGpu("unavailable");
      }
    } else if (frame.canTime) skipped++;
  }
  function beginRender() {
    if (!frame || frame.renderStart !== null) return;
    const at = now();
    frame.renderStart = at;
    if (gpuScope !== "frame") beginQuery(at);
  }
  function endFrame() {
    if (!frame || disposed || lost) return;
    const end = now();
    if (frame.renderStart !== null) {
      update.add(frame.renderStart - frame.start);
      submission.add(end - frame.renderStart);
      updatePeak.add(frame.renderStart - frame.start, end);
      submissionPeak.add(end - frame.renderStart, end);
      lastCpuAt = end;
      completed++;
      lastDraws = typeof originalInfoUpdate === "function" ? frame.draws : null;
    }
    if (active) {
      try {
        if (gpuScope === "frame" && gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY) !== active.query) resetGpu("unavailable");
        else {
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          pending.push(active);
          active = null;
        }
      } catch {
        resetGpu("unavailable");
      }
    }
    if (observeFrame && frame && !disposed && !lost) {
      const item = frame;
      safely(() => onFrame({ frameId: item.frameId, tag: item.tag, at: end, rafTime: item.rafTime, intervalMs: item.intervalMs, cpuMs: Math.max(0, end - item.start), updateMs: item.renderStart === null ? null : Math.max(0, item.renderStart - item.start), renderSubmissionMs: item.renderStart === null ? null : Math.max(0, end - item.renderStart), draws: typeof originalInfoUpdate === "function" ? item.draws : null }));
    }
    frame = null;
  }
  function suspend(reason = "paused") {
    if (disposed) return;
    clearQueries(lost);
    frame = null;
    lastRaf = null;
    state = reason;
    if (ext && !gpu.count() && !lost) gpuState = "paused";
  }
  function resetSamples(reason = "settings-changed") {
    if (disposed) return;
    suspend(reason);
    update.clear();
    submission.clear();
    interval.clear();
    gpu.clear();
    framePeak.clear();
    updatePeak.clear();
    submissionPeak.clear();
    lastCpuAt = lastGpuAt = null;
    lastDraws = null;
    gpuState = lost ? "context-lost" : ext === null ? "unsupported" : "waiting";
    emitGpuReset(reason);
  }
  function onLost() {
    lost = true;
    suspend("context-lost");
    gpu.clear();
    lastGpuAt = null;
    lastDraws = null;
    backend = null;
    gpuState = "context-lost";
    emitGpuReset("context-lost");
  }
  function onRestored() {
    if (disposed) return;
    attachDrawCounter();
    lastDraws = null;
    lost = false;
    ext = void 0;
    backend = null;
    update.clear();
    submission.clear();
    interval.clear();
    gpu.clear();
    lastCpuAt = lastGpuAt = null;
    state = "waiting";
    gpuState = "waiting";
    emitGpuReset("context-restored");
  }
  function onHidden() {
    if (document?.hidden) suspend("hidden");
  }
  function onPageHide(event) {
    if (event.persisted) suspend("page-cache");
    else dispose();
  }
  function dispose() {
    if (disposed) return;
    suspend("disposed");
    disposed = true;
    if (info?.update === countDraw) info.update = originalInfoUpdate;
    canvas?.removeEventListener("webglcontextlost", onLost);
    canvas?.removeEventListener("webglcontextrestored", onRestored);
    document?.removeEventListener("visibilitychange", onHidden);
    page?.removeEventListener("pagehide", onPageHide);
    gpu.clear();
    lastGpuAt = null;
    lastDraws = null;
    gpuState = "disposed";
  }
  canvas?.addEventListener("webglcontextlost", onLost);
  canvas?.addEventListener("webglcontextrestored", onRestored);
  document?.addEventListener("visibilitychange", onHidden);
  page?.addEventListener("pagehide", onPageHide);
  function snapshot() {
    const at = now(), ms = interval.mean();
    return { enabled: true, state, backend: identity(), fps: ms !== null && ms > 0 ? 1e3 / ms : null, peak: { frameMs: framePeak.get(at), updateMs: updatePeak.get(at), renderSubmissionMs: submissionPeak.get(at) }, cpu: { updateMs: update.mean(), renderSubmissionMs: submission.mean(), samples: update.count(), ageMs: lastCpuAt === null ? null : Math.max(0, at - lastCpuAt) }, gpu: { elapsedMs: gpu.mean(), status: gpuState, samples: gpu.count(), ageMs: lastGpuAt === null ? null : Math.max(0, at - lastGpuAt), pendingQueries: pending.length, activeQuery: !!active, liveQueries: pending.length + (active ? 1 : 0), skippedQueries: skipped, maxQueries: QUERY_LIMIT }, completedFrames: completed, draws: lastDraws ? { ...lastDraws } : null, resources: info?.memory ? { geometries: info.memory.geometries, textures: info.memory.textures } : null, pixelRatio: renderer.getPixelRatio(), drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } };
  }
  function appendSettings(parent) {
    const doc = parent.ownerDocument, box = doc.createElement("section"), title = doc.createElement("h3"), text = doc.createElement("pre"), copy = doc.createElement("button");
    box.className = "panel-copy render-diagnostics";
    text.className = "render-diagnostics-readout";
    title.textContent = "描画診断（直前のプレイ）";
    text.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 monospace;user-select:text";
    text.tabIndex = 0;
    text.textContent = formatRenderDiagnostics(snapshot());
    copy.className = "outline-button";
    copy.textContent = "診断をコピー";
    copy.onclick = async () => {
      text.textContent = formatRenderDiagnostics(snapshot());
      try {
        await globalThis.navigator.clipboard.writeText(text.textContent);
        copy.textContent = "コピーしました";
      } catch {
        copy.textContent = "上のテキストを選択してコピーしてください";
      }
    };
    box.append(title, text, copy);
    parent.append(box);
  }
  function refreshSettings(parent) {
    const text = parent?.querySelector(".render-diagnostics-readout");
    if (text) text.textContent = formatRenderDiagnostics(snapshot());
  }
  return { enabled: true, beginFrame, beginRender, endFrame, suspend, resetSamples, dispose, snapshot, appendSettings, refreshSettings };
}
function formatRenderDiagnostics(s) {
  if (!s.enabled) return "描画診断は無効です。";
  const value = (v, unit = " ms") => v === null ? "未測定" : v.toFixed(2) + unit, classification = { software: "ソフトウェア描画（報告文字列）", "hardware-reported": "GPU名の報告あり（使用率は不明）", unknown: "不明（ブラウザが情報を制限している場合もあります）" };
  const status = { waiting: "測定待ち", pending: "結果待ち", paused: "一時停止", unsupported: "非対応", disjoint: "無効な計測を破棄", timeout: "結果待ち期限切れ", unavailable: "取得不可", ready: "取得済み", "context-lost": "描画コンテキスト喪失", disposed: "終了" }, age = (v) => v === null ? "なし" : value(v) + "前";
  const reportedNameNote = /or similar/i.test(s.backend.renderer || "") ? "\nGPU名の「or similar」は機種名が代表名に置き換えられた表示です。実際のGPU型番や使用率は、この表示だけでは確認できません。" : "";
  const drawText = s.draws ? `
Draw calls: ${s.draws.calls} / Triangles: ${s.draws.triangles}（直前の1フレーム・影／反射／後処理／武器を含む）` : "";
  const resourceText = s.resources ? `
Geometries: ${s.resources.geometries} / Textures: ${s.resources.textures}（renderer.info・個数）` : "";
  return `描画経路: ${classification[s.backend.classification]}${reportedNameNote}
Renderer（ブラウザ報告）: ${s.backend.renderer || "不明"}
Vendor: ${s.backend.vendor || "不明"}
描画解像度: ${s.drawingBuffer.width}×${s.drawingBuffer.height} / 比率 ${s.pixelRatio}${drawText}${resourceText}
直近のFPS: ${value(s.fps, "")}
CPU 更新: ${value(s.cpu.updateMs)}
CPU 描画呼び出し: ${value(s.cpu.renderSubmissionMs)}
GPU描画区間の経過時間: ${value(s.gpu.elapsedMs)}（${status[s.gpu.status] || "不明"}）
CPU ${s.cpu.samples}件 / GPU ${s.gpu.samples}件（各直近60件）
最終CPU計測: ${age(s.cpu.ageMs)} / GPU: ${age(s.gpu.ageMs)}

設定画面では通常の描画が止まるため、開く直前の計測です。閉じて数秒プレイし、再度開いてください。
CPUはJSとドライバー待ちを含む経過時間です。更新側にも事前描画が含まれる場合があります。音声更新・イベント処理・ワーカー処理は含みません。
GPUタイマーは通常の描画から主観武器までの区間です。この区間より前の事前描画は除き、区間内の影・水面反射・後処理は含みます。命令待ちを含む場合もあります。
GPU値は非同期の経過時間で、GPU使用率ではありません。未測定や非対応は0を意味しません。
ブラウザの画面更新同期や待機で使用率が低くなる場合もあり、この数値だけでCPUが原因とは判定できません。`;
}

export {
  createRenderDiagnostics
};
