// hitch-recorder.js
var HITCH = Object.freeze({
  // Gaps between frames this long or longer count as a stop (ms).
  threshold: 150,
  // Stops kept, and long animation frames kept for matching.
  keep: 80,
  frames: 80,
  // Notes (actions) older than this are not tied to a stop (ms).
  noteAge: 3e3,
  // A stop's record completes this long after it (the browser's account of
  // the long frame arrives a moment later) (ms).
  settleMs: 1500,
  // v130 (the user: the menus' time out of the stop records): on a menu, the title or the fallen screen the game waits,
  // drawing nothing (and a window hidden or covered draws nothing either). A long gap there whose own frames the page
  // spent idle (scripts and blocking each under `idle` ms) is that waiting, not a stop: left out. One with the page's
  // own work in it (a map being drawn, say) is kept. (Without the browser's account of long frames: kept, as before.)
  idle: 50,
  menu: /^(画面:|タイトル画面|倒れた画面)/,
  // Frame gaps counted by length (ms): how often play stutters at all.
  buckets: Object.freeze([50, 100, 150, 250, 500, 1e3])
});
var PERF = Object.freeze({
  // Play time in each summary (ms), and the summaries kept (the latest).
  bucketMs: 3e4,
  keep: 60,
  // Frame times kept for the percentiles (a half minute at 400 a second).
  maxFrames: 12e3
});
var GL_TIMED = Object.freeze({
  tex: Object.freeze(["texImage2D", "texSubImage2D", "texStorage2D", "compressedTexImage2D", "compressedTexSubImage2D", "texImage3D", "texSubImage3D", "texStorage3D", "compressedTexImage3D", "compressedTexSubImage3D", "generateMipmap", "copyTexSubImage2D"]),
  buf: Object.freeze(["bufferData", "bufferSubData"]),
  shader: Object.freeze(["shaderSource", "compileShader", "linkProgram", "getProgramParameter", "getShaderParameter", "getProgramInfoLog", "getShaderInfoLog", "getActiveUniform", "getActiveAttrib", "getUniformLocation", "getAttribLocation"]),
  // v97.5: and the framebuffer check (a GPU helper's first draw waited there for its shader).
  sync: Object.freeze(["readPixels", "finish", "getError", "clientWaitSync", "getBufferSubData", "checkFramebufferStatus"])
});
var WORLD_PHASES = Object.freeze([
  ["proceduralTrees.update", "木"],
  ["distantTrees.update", "遠くの木"],
  ["proceduralRockRuntime.update", "岩"],
  ["hydrologyWater.update", "川"],
  ["outdoorGrounding.update", "接地の陰"],
  ["realisticWater.update", "水"],
  ["atmosphere.render", "画面の描画"],
  ["dayNight.renderSky", "空"],
  ["weather.update", "天気"],
  ["localLights.update", "灯り"],
  ["meadowGrass.update", "草原"],
  ["canopyShadow.update", "木陰"],
  ["updateShadowCadence", "影の予定"],
  ["renderer.shadowMap.render", "影の描画"],
  ["commitChunk", "区画の追加"],
  ["programSweep.update", "シェーダー先読み"],
  ["shaderGate.update", "シェーダー待ち"],
  ["textureWarmup.update", "テクスチャ先送り"],
  ["smallLandmarks.distant.update", "遠くの目印"],
  ["occlusion.beginFrame", "遮蔽"],
  ["underwaterView.update", "水中"],
  ["toolHarvesting.update", "採取"],
  ["colossalCreatures.updateDrawability", "巨獣"],
  ["bridgeRuntime.update", "橋"],
  // v97.9: the rest of the world's frame, for the F3 breakdown's CPU (a third
  // of it was not told apart).
  ["scene.updateMatrixWorld", "シーンの行列"],
  ["forestFloor.update", "林床"],
  ["forestUnderstory.update", "下草"],
  ["forestLife.update", "小さな生き物"],
  ["birdFlocks.update", "鳥"],
  ["ambientParticles.update", "舞う粒"],
  ["stories.update", "物語"],
  ["content.updateEffects", "効果"],
  ["dayNight.update", "昼夜"],
  ["fantasy.update", "幻想"],
  ["shadowView.update", "影の範囲"],
  ["updateCrownLight", "樹冠の光"],
  ["updateSunShafts", "光の筋"],
  ["updateIslandHaze", "かすみ"],
  ["updateVolumetricLight", "木漏れ日"],
  ["bursts.update", "火花"]
]);
var PHASE = /* @__PURE__ */ Symbol("hitchPhase");
var short = (url) => {
  if (typeof url !== "string" || !url) return "";
  const i = url.lastIndexOf("/");
  return (i >= 0 ? url.slice(i + 1) : url).replace(/\?.*$/, "").slice(0, 48);
};
var round1 = (v) => Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
var safely = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};
function bufferBytes(name, args) {
  const data = args[name === "bufferData" ? 1 : 2];
  if (typeof data === "number") return data;
  if (!data || !Number.isFinite(data.byteLength)) return 0;
  const per = data.BYTES_PER_ELEMENT || 1, offset = +args[3] || 0, length = +args[4] || 0;
  return length > 0 ? length * per : Math.max(0, data.byteLength - offset * per);
}
var texBytes = (args) => {
  const last = args[args.length - 1];
  if (last && Number.isFinite(last.byteLength)) return last.byteLength;
  const w = last?.naturalWidth || last?.videoWidth || last?.displayWidth || last?.width, h = last?.naturalHeight || last?.videoHeight || last?.displayHeight || last?.height;
  return Number.isFinite(w) && Number.isFinite(h) ? w * h * 4 : 0;
};
function createHitchRecorder(renderer, { now = () => performance.now(), page = globalThis.window, context = null, sample = null, threshold = HITCH.threshold, later = (fn, ms) => globalThis.setTimeout(fn, ms), timing = true, bucketMs = PERF.bucketMs, gpuFrames = null } = {}) {
  const hitches = [], frames = [], notes = [], listeners = /* @__PURE__ */ new Set(), restores = [], perfList = [], perfListeners = /* @__PURE__ */ new Set();
  const stats = { frames: 0, playMs: 0, stops: 0, over: HITCH.buckets.map(() => 0) };
  let started = now(), serial = 0, disposed = false;
  let lastScreen = null, acc = newAccumulator(), prev = newAccumulator(), lastRaf = null, frameStart = null, lapAt = null, renderStart = null, lastUpdateMs = null, lastRenderMs = null;
  let lastPrograms = programCount(), lastTextures = textureCount(), lastHeap = heap(), observer = null;
  let bucket = newBucket();
  function newBucket() {
    return { frames: 0, ms: 0, gaps: [], upd: 0, nUpd: 0, ren: 0, nRen: 0, phases: /* @__PURE__ */ new Map() };
  }
  function perfFrame(gap) {
    const b = bucket;
    b.frames++;
    b.ms += gap;
    if (b.gaps.length < PERF.maxFrames) b.gaps.push(gap);
    if (Number.isFinite(lastUpdateMs)) {
      b.upd += lastUpdateMs;
      b.nUpd++;
    }
    if (Number.isFinite(lastRenderMs)) {
      b.ren += lastRenderMs;
      b.nRen++;
    }
    for (const [k, v] of acc.phases) b.phases.set(k, (b.phases.get(k) || 0) + v);
    if (b.ms >= bucketMs) closeBucket();
  }
  function closeBucket() {
    const b = bucket;
    bucket = newBucket();
    if (!b.frames) return;
    const g = Float64Array.from(b.gaps).sort(), q = (p) => round1(g[Math.min(g.length - 1, Math.floor(p * g.length))]);
    const round2 = (v) => Math.round(v * 100) / 100;
    const entry = {
      t: round1((now() - started) / 1e3),
      fps: round1(b.frames / (b.ms / 1e3)),
      ms: [q(0.5), q(0.9), q(0.99), round1(g[g.length - 1])],
      upd: b.nUpd ? round2(b.upd / b.nUpd) : null,
      ren: b.nRen ? round2(b.ren / b.nRen) : null,
      ph: [...b.phases].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => [k, round2(v / b.frames)])
    };
    const more = typeof sample === "function" ? safely(sample) : null;
    if (more) Object.assign(entry, more);
    perfList.push(entry);
    if (perfList.length > PERF.keep) perfList.shift();
    for (const fn of perfListeners) safely(() => fn(entry));
  }
  function newAccumulator() {
    return {
      phases: /* @__PURE__ */ new Map(),
      renders: [],
      tex: [0, 0, 0],
      buf: [0, 0, 0],
      shader: [0, 0],
      sync: [0, 0],
      links: 0,
      first: 0,
      firstNames: [],
      firstTarget: 0,
      firstTargetNames: [],
      /* v134 */
      geo: [0, 0, 0],
      geoNames: []
    };
  }
  function programCount() {
    return renderer?.info?.programs?.length ?? 0;
  }
  function textureCount() {
    return renderer?.info?.memory?.textures ?? 0;
  }
  function heap() {
    const m = page?.performance?.memory;
    return m && Number.isFinite(m.usedJSHeapSize) ? m.usedJSHeapSize / 1048576 : null;
  }
  function addPhase(label, ms) {
    if (ms > 0) acc.phases.set(label, (acc.phases.get(label) || 0) + ms);
  }
  function replace(obj, name, wrapper) {
    const own = Object.prototype.hasOwnProperty.call(obj, name), original = obj[name];
    obj[name] = wrapper;
    restores.push(() => {
      if (obj[name] !== wrapper) return;
      if (own) obj[name] = original;
      else delete obj[name];
    });
  }
  const gl = timing ? safely(() => renderer?.getContext?.()) : null;
  const glTotals = { tex: [0, 0, 0], buf: [0, 0, 0], shader: [0, 0], sync: [0, 0] };
  if (gl) for (const [kind, names] of Object.entries(GL_TIMED)) for (const name of names) {
    const original = gl[name];
    if (typeof original !== "function") continue;
    const counts = name === "linkProgram" ? 1 : 0, buffer = kind === "buf", image = kind === "tex" && /Image/.test(name);
    safely(() => replace(gl, name, function() {
      const t0 = now();
      try {
        return original.apply(this, arguments);
      } finally {
        const a = acc[kind], ms = now() - t0, g = glTotals[kind];
        a[0]++;
        a[1] += ms;
        g[0]++;
        g[1] += ms;
        if (buffer) {
          const b = bufferBytes(name, arguments);
          a[2] += b;
          g[2] += b;
        } else if (image) {
          const b = texBytes(arguments);
          a[2] += b;
          g[2] += b;
        }
        if (counts) acc.links++;
      }
    }));
  }
  const fences = [], passed = [];
  let fencePoll = null, pollToken = 0;
  const schedulePoll = () => {
    const token = ++pollToken;
    fencePoll = safely(() => later(() => pollFences(token), 50));
  };
  function pollFences(token) {
    if (token !== void 0 && token !== pollToken) return;
    fencePoll = null;
    if (disposed || !gl) return;
    const t = now();
    while (fences.length) {
      const f = fences[0];
      let done = true;
      try {
        done = gl.getSyncParameter(f.sync, gl.SYNC_STATUS) === gl.SIGNALED;
      } catch {
      }
      if (!done) break;
      fences.shift();
      f.doneAt = t;
      try {
        gl.deleteSync(f.sync);
      } catch {
      }
      f.sync = null;
      passed.push(f);
      if (passed.length > 8) passed.shift();
    }
    if (fences.length) schedulePoll();
    else pollToken++;
  }
  function fenceFrame() {
    if (!gl || typeof gl.fenceSync !== "function" || fences.length >= 12) return;
    const sync = safely(() => gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0));
    if (!sync) return;
    fences.push({ sync, at: now(), doneAt: null });
    if (fencePoll === null) schedulePoll();
  }
  function gpuAccount(begin) {
    let last = null;
    for (const f of [...passed, ...fences]) if (f.at <= begin && (!last || f.at > last.at)) last = f;
    if (!last) return null;
    return { done: last.doneAt === null ? null : Math.round(last.doneAt - begin), pending: fences.length };
  }
  if (timing && typeof renderer?.render === "function") {
    const render = renderer.render;
    safely(() => replace(renderer, "render", function(scene) {
      const t0 = now();
      try {
        return render.apply(this, arguments);
      } finally {
        const ms = now() - t0;
        if (ms >= 1) {
          const target = safely(() => this.getRenderTarget?.()), size = target ? `${target.width}x${target.height}` : "canvas";
          const list = acc.renders;
          list.push([`${String(scene?.name || scene?.type || "?").slice(0, 24)}→${size}`, ms]);
          if (list.length > 3) {
            list.sort((a, b) => b[1] - a[1]);
            list.length = 3;
          }
        }
      }
    }));
  }
  const layoutIds = /* @__PURE__ */ new WeakMap(), signatures = /* @__PURE__ */ new Map(), pairs = /* @__PURE__ */ new Set();
  const targetKinds = /* @__PURE__ */ new Map(), targetPairs = /* @__PURE__ */ new Set();
  const recentFirst = [];
  const drawnGeometries = /* @__PURE__ */ new WeakSet();
  const converted = (geometry) => {
    for (const a of Object.values(geometry.attributes || {})) {
      const array = a.isInterleavedBufferAttribute ? a.data.array : a.array;
      if (a.itemSize === 3 && !(array instanceof Float32Array)) return true;
    }
    return false;
  };
  function noteGeometry(geometry, object, material) {
    if (drawnGeometries.has(geometry)) return;
    drawnGeometries.add(geometry);
    const verts = (geometry.attributes?.position?.count || 0) * (object?.isInstancedMesh ? Math.max(1, object.count) : 1);
    acc.geo[0]++;
    acc.geo[1] += verts;
    if (converted(geometry)) acc.geo[2] += verts;
    const list = acc.geoNames;
    if (list.length < 6 || verts > list[list.length - 1][1]) {
      list.push([String(object?.name || material?.name || material?.type || "?").slice(0, 32), verts]);
      list.sort((x, y) => y[1] - x[1]);
      if (list.length > 6) list.length = 6;
    }
  }
  const noteFirst = (name) => {
    recentFirst.push({ at: now(), name });
    if (recentFirst.length > 48) recentFirst.shift();
  };
  const targetIds = /* @__PURE__ */ new WeakMap();
  function targetKind(renderer2, scene) {
    if (scene === null) return 1;
    let t = null;
    try {
      t = renderer2.getRenderTarget?.() ?? null;
    } catch {
    }
    if (t === null) {
      let id2 = targetKinds.get("canvas");
      if (id2 === void 0) {
        id2 = targetKinds.size + 2;
        targetKinds.set("canvas", id2);
      }
      return id2;
    }
    let id = targetIds.get(t);
    if (id === void 0) {
      const sig = `${t.samples || 0}:${t.texture?.format}:${t.texture?.type}:${t.texture?.colorSpace || ""}:${t.textures?.length || 1}:${t.depthBuffer ? 1 : 0}:${t.isWebGLCubeRenderTarget ? "c" : ""}${t.isWebGL3DRenderTarget || t.isWebGLArrayRenderTarget ? "a" : ""}`;
      id = targetKinds.get(sig);
      if (id === void 0) {
        id = targetKinds.size + 2;
        targetKinds.set(sig, id);
      }
      targetIds.set(t, id);
    }
    return id;
  }
  function layoutId(geometry) {
    let id = layoutIds.get(geometry);
    if (id === void 0) {
      const parts = [];
      for (const [name, a] of Object.entries(geometry?.attributes || {})) parts.push(name + ":" + (a.array?.constructor?.name || "?") + (a.normalized ? "n" : "") + a.itemSize + (a.isInstancedBufferAttribute ? "i" : ""));
      const sig = parts.sort().join(",");
      id = signatures.get(sig);
      if (id === void 0) {
        id = signatures.size + 1;
        signatures.set(sig, id);
      }
      layoutIds.set(geometry, id);
    }
    return id;
  }
  const props = renderer?.properties;
  if (props && typeof renderer.renderBufferDirect === "function") {
    const draw = renderer.renderBufferDirect;
    safely(() => replace(renderer, "renderBufferDirect", function(camera, scene, geometry, material, object) {
      const result = draw.apply(this, arguments);
      if (disposed) return result;
      try {
        const program = props.get(material)?.currentProgram;
        if (program && geometry && !(object?.isInstancedMesh && object.count === 0)) {
          noteGeometry(geometry, object, material);
          const flags = (object?.isInstancedMesh ? 1 : 0) + (object?.instanceColor ? 2 : 0) + (object?.isSkinnedMesh ? 4 : 0);
          const key = (program.id * 8192 + layoutId(geometry)) * 8 + flags;
          if (!pairs.has(key)) {
            pairs.add(key);
            acc.first++;
            const name = String(object?.name || material?.name || material?.type || "?").slice(0, 40);
            if (acc.firstNames.length < 8 && !acc.firstNames.includes(name)) acc.firstNames.push(name);
            noteFirst(name);
          }
          const kind = targetKind(this, scene), targetKey = program.id * 4096 + kind;
          if (!targetPairs.has(targetKey)) {
            targetPairs.add(targetKey);
            acc.firstTarget++;
            if (acc.firstTargetNames.length < 8) {
              const t = kind === 1 ? null : safely(() => this.getRenderTarget?.());
              const name = String(object?.name || material?.name || material?.type || "?").slice(0, 32) + "→" + (kind === 1 ? "影" : t ? (t.texture?.name || `${t.width}x${t.height}`).slice(0, 24) : "画面");
              if (!acc.firstTargetNames.includes(name)) acc.firstTargetNames.push(name);
            }
          }
        }
      } catch {
      }
      return result;
    }));
  }
  try {
    const PO = page?.PerformanceObserver;
    if (PO && (PO.supportedEntryTypes || []).includes("long-animation-frame")) {
      observer = new PO((list) => {
        for (const e of list.getEntries()) {
          const scripts = (e.scripts || []).filter((s) => s.duration >= 20).sort((a, b) => b.duration - a.duration).slice(0, 4).map((s) => ({ ms: Math.round(s.duration), invoker: String(s.invoker || s.invokerType || "").slice(0, 60), fn: String(s.sourceFunctionName || "").slice(0, 40), file: short(s.sourceURL), at: s.sourceCharPosition ?? -1 }));
          const end = e.startTime + e.duration, style = e.styleAndLayoutStart > 0 ? Math.round(end - e.styleAndLayoutStart) : 0, render = e.renderStart > 0 ? Math.round((e.styleAndLayoutStart > 0 ? e.styleAndLayoutStart : end) - e.renderStart) : 0;
          let scriptEnd = e.startTime, scriptMs = 0;
          for (const s of e.scripts || []) {
            scriptEnd = Math.max(scriptEnd, (s.startTime || 0) + (s.duration || 0));
            scriptMs += s.duration || 0;
          }
          const wait = e.renderStart > 0 ? Math.max(0, Math.round(e.renderStart - scriptEnd)) : null;
          frames.push({ start: e.startTime, end, ms: Math.round(e.duration), blocking: Math.round(e.blockingDuration || 0), scripts, style, render, wait, scriptMs: Math.round(scriptMs) });
          if (frames.length > HITCH.frames) frames.shift();
        }
      });
      observer.observe({ type: "long-animation-frame", buffered: false });
    }
  } catch {
    observer = null;
  }
  const pageChanges = [];
  let pageObserver = null;
  try {
    const MO = page?.MutationObserver, body = page?.document?.body;
    if (MO && body) {
      const label = (n) => n && n.nodeType === 1 ? n.id ? "#" + n.id : n.classList?.length ? "." + n.classList[0] : String(n.tagName || "").toLowerCase() : null;
      pageObserver = new MO((records) => {
        const at = now();
        let shown = 0;
        for (const r of records) {
          let text = null;
          if (r.type === "childList") {
            const added = [...r.addedNodes].find((x) => x.nodeType === 1), n = added || [...r.removedNodes].find((x) => x.nodeType === 1);
            if (n) text = (added ? "+" : "-") + label(n) + " in " + (label(r.target) || "?");
          } else if (r.type === "attributes") text = "~" + label(r.target) + " " + r.attributeName + (r.attributeName === "class" ? "=" + String(r.target.className || "").slice(0, 30) : "");
          if (!text) continue;
          text = text.slice(0, 60);
          const same = pageChanges.find((c) => c.text === text && at - c.at < 1e3);
          if (same) {
            same.at = at;
            same.more++;
            continue;
          }
          if (shown++ >= 4) {
            const last = pageChanges.at(-1);
            if (last && last.at === at) last.more++;
            continue;
          }
          pageChanges.push({ at, text, more: 0 });
          if (pageChanges.length > 60) pageChanges.shift();
        }
      });
      pageObserver.observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "open", "hidden"] });
    }
  } catch {
    pageObserver = null;
  }
  const running = /* @__PURE__ */ new Set();
  function watch(root, table = WORLD_PHASES) {
    if (disposed || !root) return 0;
    let n = 0;
    for (const [path, label] of table) {
      const parts = path.split("."), name = parts.pop();
      let obj = root;
      for (const p of parts) {
        obj = obj?.[p];
        if (!obj) break;
      }
      const fn = obj?.[name];
      if (typeof fn !== "function" || fn[PHASE]) continue;
      const timed = function() {
        if (running.has(label)) return fn.apply(this, arguments);
        running.add(label);
        const t0 = now();
        try {
          return fn.apply(this, arguments);
        } finally {
          running.delete(label);
          addPhase(label, now() - t0);
        }
      };
      timed[PHASE] = label;
      safely(() => {
        replace(obj, name, timed);
        n++;
      });
    }
    return n;
  }
  function note(label) {
    notes.push({ at: now(), label: String(label).slice(0, 48) });
    if (notes.length > 24) notes.shift();
  }
  function frame(rafTime, screen = null) {
    if (disposed) return;
    const at = now(), programs = programCount(), textures = textureCount(), mb = heap();
    const gap = lastRaf !== null && Number.isFinite(rafTime) && rafTime > lastRaf ? rafTime - lastRaf : null;
    if (gap !== null && gap >= threshold) pollFences();
    if (gap !== null) {
      if (screen === null) {
        stats.frames++;
        stats.playMs += gap;
        HITCH.buckets.forEach((b, i) => {
          if (gap >= b) stats.over[i]++;
        });
      }
      if (gap >= threshold) record(gap, at, programs, textures, mb, screen ?? lastScreen);
      if (screen === null) perfFrame(gap);
    }
    lastScreen = screen;
    lastPrograms = programs;
    lastTextures = textures;
    lastHeap = mb;
    lastRaf = Number.isFinite(rafTime) ? rafTime : null;
    prev = acc;
    acc = newAccumulator();
    frameStart = lapAt = at;
    renderStart = null;
  }
  function lap(label) {
    if (lapAt === null || disposed) return;
    const t = now();
    addPhase(label, t - lapAt);
    lapAt = t;
  }
  function renderBegins() {
    if (frameStart === null) return;
    lap("世界の更新");
    renderStart = now();
  }
  function frameEnd() {
    if (frameStart === null) return;
    lap("描画");
    const end = now();
    fenceFrame();
    lastUpdateMs = (renderStart ?? end) - frameStart;
    lastRenderMs = renderStart !== null ? end - renderStart : null;
    lapAt = null;
  }
  function suspend() {
    lastRaf = null;
    frameStart = lapAt = renderStart = null;
  }
  function glOf(a) {
    return { tex: [a.tex[0], round1(a.tex[1]), Math.round(a.tex[2] / 1024)], buf: [a.buf[0], round1(a.buf[1]), Math.round(a.buf[2] / 1024)], shader: [a.shader[0], round1(a.shader[1])], sync: [a.sync[0], round1(a.sync[1])] };
  }
  function record(gap, at, programs, textures, mb, screen = null) {
    const begin = at - gap, a = acc;
    const action = [...notes].reverse().find((n) => n.at >= begin - HITCH.noteAge && n.at <= at);
    const list = renderer?.info?.programs || [], made = Math.max(0, programs - lastPrograms), programNames = [];
    for (let i = Math.max(0, list.length - Math.min(made, 6)); i < list.length; i++) programNames.push(String(list[i]?.name || (list[i]?.type ? "(" + list[i].type + ")" : "?")).slice(0, 40));
    const firstRecent = [];
    for (const e of recentFirst) if (e.at >= begin - 3e3 && e.at <= at && firstRecent.length < 10) firstRecent.push(`${e.name} ${Math.round(at - e.at)}ms前`);
    const firstNames = [...a.firstNames];
    for (const n of prev.firstNames) if (firstNames.length < 8 && !firstNames.includes(n)) firstNames.push(n);
    const h = {
      n: ++serial,
      at,
      begin,
      t: round1((at - started) / 1e3),
      ms: Math.round(gap),
      upd: round1(lastUpdateMs),
      ren: round1(lastRenderMs),
      phases: [...a.phases].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => [k, round1(v)]),
      renders: a.renders.sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, round1(v)]),
      gl: glOf(a),
      glPrev: glOf(prev),
      links: a.links,
      programs: made,
      programNames,
      first: a.first,
      firstPrev: prev.first,
      firstNames,
      firstRecent,
      // v134: the geometries first drawn in its frame and the one before ([count, vertices, converted vertices], the largest).
      geo: a.geo.slice(),
      geoPrev: prev.geo.slice(),
      geoNames: [...a.geoNames, ...prev.geoNames].sort((x, y) => y[1] - x[1]).slice(0, 6),
      firstTarget: a.firstTarget,
      firstTargetPrev: prev.firstTarget,
      firstTargetNames: [...a.firstTargetNames, ...prev.firstTargetNames.filter((n) => !a.firstTargetNames.includes(n))].slice(0, 8),
      textures: textures - lastTextures,
      heapMB: mb !== null && lastHeap !== null ? Math.round(mb - lastHeap) : null,
      action: action ? action.label : null,
      context: typeof context === "function" ? safely(context) : null,
      visibility: page?.document?.visibilityState ?? null,
      scripts: null,
      laf: null,
      settled: false,
      gpu: gpuAccount(begin),
      screen
    };
    hitches.push(h);
    stats.stops++;
    if (hitches.length > HITCH.keep) hitches.shift();
    const settle = () => {
      if (disposed || h.settled) return;
      const matched = framesFor(h);
      h.scripts = matched.flatMap((f) => f.scripts).sort((x, y) => y.ms - x.ms).slice(0, 5).map((s) => [s.ms, s.invoker, s.fn, s.file + (s.at >= 0 ? ":" + s.at : "")]);
      h.scriptMs = matched.reduce((n, f) => n + f.scripts.reduce((m, s) => m + s.ms, 0), 0);
      h.laf = matched.length ? [matched.reduce((n, f) => n + f.ms, 0), matched.reduce((n, f) => n + f.blocking, 0), matched.length] : null;
      h.lafRender = matched.length ? [matched.reduce((n, f) => n + (f.style || 0), 0), matched.reduce((n, f) => n + (f.render || 0), 0)] : null;
      h.lafFrames = matched.length ? matched.slice(0, 4).map((f) => [Math.round(f.start - h.begin), f.ms, f.blocking, f.scriptMs ?? null, f.wait ?? null, f.style || 0, f.render || 0]) : null;
      h.gpuFrames = typeof gpuFrames === "function" ? safely(() => (gpuFrames() || []).filter((g) => g.at >= h.begin - 250 && g.at <= h.at + 30).slice(-4).map((g) => [Math.round(g.at - h.begin), g.ms === null ? g.kind : Math.round(g.ms)])) : null;
      h.pageChanges = pageChanges.filter((c) => c.at >= h.begin - 2e3 && c.at <= h.at).slice(-8).map((c) => [Math.round(h.at - c.at), c.text + (c.more ? " (+" + c.more + ")" : "")]);
      h.settled = true;
      const gpuBusy = !!h.gpu && (h.gpu.done === null || h.gpu.done > HITCH.idle);
      if (observer && HITCH.menu.test(h.screen || "") && (h.laf ? h.laf[1] < HITCH.idle : true) && (h.scriptMs ?? 0) < HITCH.idle && !gpuBusy) {
        const i = hitches.indexOf(h);
        if (i >= 0) hitches.splice(i, 1);
        stats.stops = Math.max(0, stats.stops - 1);
        stats.menuWaits = (stats.menuWaits || 0) + 1;
        h.dropped = true;
        return;
      }
      for (const fn of listeners) safely(() => fn(h));
    };
    if (safely(() => later(settle, HITCH.settleMs)) === null) settle();
  }
  function framesFor(h) {
    return frames.filter((f) => f.end >= h.begin - 50 && f.start <= h.at + 50);
  }
  function cause(h) {
    const parts = [], g = h.gl || {}, ms = (v) => Math.round(v);
    if (h.links || h.programs) parts.push(`シェーダー作成 ${Math.max(h.links || 0, h.programs || 0)}件` + (g.shader?.[1] >= 5 ? `（${ms(g.shader[1])} ms）` : ""));
    else if (g.shader?.[1] >= 5) parts.push(`シェーダー確認 ${ms(g.shader[1])} ms`);
    if (g.tex?.[1] >= 5) parts.push(`テクスチャ転送 ${g.tex[0]}回 ${ms(g.tex[1])} ms`);
    if (g.buf?.[1] >= 5) parts.push(`形の転送 ${g.buf[2]} KB ${ms(g.buf[1])} ms`);
    if (g.sync?.[1] >= 5) parts.push(`GPU待ち ${ms(g.sync[1])} ms`);
    if (h.first || h.firstPrev) parts.push(`初めての描画 ${h.first + (h.firstPrev || 0)}件`);
    if (h.firstTarget || h.firstTargetPrev) parts.push(`初めての描き先 ${(h.firstTarget || 0) + (h.firstTargetPrev || 0)}件`);
    const heavy = (h.phases || []).filter(([, v]) => v >= Math.max(15, h.ms * 0.2)).slice(0, 3);
    if (heavy.length) parts.push("重い処理: " + heavy.map(([k, v]) => `${k} ${ms(v)} ms`).join("・"));
    if (h.gpu) parts.push(h.gpu.done === null ? "GPU は止まっている間ずっと作業中" : h.gpu.done > h.ms * 0.6 ? `GPU が前のフレームを終えたのは ${h.gpu.done} ms 後` : `GPU は ${Math.max(0, h.gpu.done)} ms で前のフレームを終えていた`);
    if (h.settled && observer) {
      const script = h.scriptMs || 0, top = h.scripts?.[0];
      if (script >= h.ms * 0.4) parts.push(`スクリプト ${script} ms` + (top ? `（${top[2] || top[1] || "?"} ${top[3]}）` : ""));
      else if (h.laf) parts.push(`ブラウザ ${h.laf[0]} ms（スクリプト ${script} ms）`);
      else if (!parts.length) parts.push("GPU・ブラウザ待ち（スクリプトなし）");
      if (script < 20 && h.ms >= 950 && h.ms <= 1100) parts.push("1秒ごとの間引きの可能性（画面が隠れている時など）");
    }
    if (h.gpuFrames?.length) {
      const long = h.gpuFrames.filter(([, v]) => typeof v === "number").reduce((m, [, v]) => Math.max(m, v), 0), lost = h.gpuFrames.some(([, v]) => typeof v === "string");
      parts.push(long >= h.ms * 0.5 ? `ゲームの描画の GPU 時間 ${long} ms（描画の中で止まった）` : lost && !long ? "ゲームの描画の GPU 時間は取れず" : `ゲームの描画の GPU 時間は ${long} ms（止まったのは描画の外）`);
    }
    if (h.pageChanges?.length) parts.push("直前のページの変化: " + h.pageChanges.slice(-3).map(([ms2, t]) => `${t} ${ms2}ms前`).join("・"));
    if (h.heapMB !== null && h.heapMB <= -64) parts.push(`メモリ片付け ${-h.heapMB} MB`);
    if (h.textures > 0) parts.push(`テクスチャ +${h.textures}`);
    return parts.join(" / ") || (h.settled || !observer ? "内訳なし" : "ブラウザの記録を待っています");
  }
  function latest(windowMs = 6e4) {
    const at = now();
    let best = null;
    for (const h of hitches) if (at - h.at <= windowMs && (!best || h.ms > best.ms)) best = h;
    if (!best) return null;
    return { ms: best.ms, agoSeconds: Math.round((at - best.at) / 1e3), action: best.action, cause: cause(best) };
  }
  function place(c) {
    if (!c) return "";
    const bits = [];
    if (Number.isFinite(c.x) && Number.isFinite(c.z)) bits.push(`(${c.x}, ${c.z})`);
    if (c.biome) bits.push(c.biome);
    if (c.dungeon) bits.push("洞窟");
    if (Number.isFinite(c.day)) bits.push(`${c.day}日目${c.clock ? " " + c.clock : ""}`);
    if (c.weather) bits.push(c.weather);
    if (c.hand) bits.push("手: " + c.hand);
    return bits.join(" ");
  }
  function stopLines(h) {
    const lines = [`・${h.t}秒: ${h.ms} ms（直前のフレーム 更新 ${h.upd ?? "—"} / 描画 ${h.ren ?? "—"} ms）${h.action ? " 直前の操作: " + h.action : ""}`];
    lines.push("   " + cause(h));
    const where = place(h.context);
    if (where) lines.push("   場所: " + where);
    if (h.phases?.length) lines.push("   処理: " + h.phases.map(([k, v]) => `${k} ${v}`).join(" / "));
    if (h.renders?.length) lines.push("   描画: " + h.renders.map(([k, v]) => `${k} ${v}`).join(" / "));
    const g = h.gl;
    if (g) lines.push(`   GL: テクスチャ ${g.tex[0]}回 ${g.tex[1]} ms / 形 ${g.buf[0]}回 ${g.buf[1]} ms ${g.buf[2]} KB / シェーダー ${g.shader[0]}回 ${g.shader[1]} ms / 待ち ${g.sync[0]}回 ${g.sync[1]} ms`);
    if (h.programNames?.length) lines.push("   シェーダー: " + h.programNames.join(", "));
    if (h.firstNames?.length) lines.push(`   初めての描画（${h.first} + 前のフレーム ${h.firstPrev}）: ` + h.firstNames.join(", "));
    if (h.firstTargetNames?.length) lines.push(`   初めての描き先（${h.firstTarget} + 前のフレーム ${h.firstTargetPrev}）: ` + h.firstTargetNames.join(", "));
    if (h.geo?.[0] || h.geoPrev?.[0]) lines.push(`   初めて描いた形 ${h.geo?.[0] ?? 0} + 前のフレーム ${h.geoPrev?.[0] ?? 0}（頂点 ${(h.geo?.[1] ?? 0) + (h.geoPrev?.[1] ?? 0)}、うち変換 ${(h.geo?.[2] ?? 0) + (h.geoPrev?.[2] ?? 0)}）: ` + (h.geoNames || []).map(([n, v]) => `${n} ${v}`).join(", "));
    for (const s of h.scripts || []) lines.push(`   ${s[0]} ms ${s[1]} ${s[2]} ${s[3]}`);
    return lines;
  }
  function summary() {
    const s = stats, minutes = s.playMs / 6e4;
    return `プレイ ${minutes.toFixed(1)} 分・${s.frames} フレーム / 長いフレーム: ` + HITCH.buckets.map((b, i) => `${b} ms以上 ${s.over[i]}`).join("、");
  }
  function report({ header = [], limit = HITCH.keep } = {}) {
    const lines = [...header, summary()];
    if (!hitches.length) lines.push(`止まった記録: なし（${threshold} ms 以上の間隔はありません）`);
    else {
      lines.push(`止まった記録（${threshold} ms 以上、新しい順。開始からの秒数）`);
      for (const h of [...hitches].reverse().slice(0, limit)) lines.push(...stopLines(h));
    }
    if (!observer) lines.push("（このブラウザは長いフレームの内訳 Long Animation Frames に対応していません）");
    return lines.join("\n");
  }
  function onHitch(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function onPerf(fn) {
    perfListeners.add(fn);
    return () => perfListeners.delete(fn);
  }
  function snapshotStats() {
    return { frames: stats.frames, playSeconds: Math.round(stats.playMs / 1e3), stops: stats.stops, menuWaits: stats.menuWaits || 0, over: Object.fromEntries(HITCH.buckets.map((b, i) => [b, stats.over[i]])) };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    try {
      observer?.disconnect();
    } catch {
    }
    observer = null;
    try {
      pageObserver?.disconnect();
    } catch {
    }
    pageObserver = null;
    for (const f of fences) if (f.sync) safely(() => gl.deleteSync(f.sync));
    fences.length = 0;
    for (const restore of restores.reverse()) safely(restore);
    restores.length = 0;
    listeners.clear();
    perfListeners.clear();
  }
  const since = (at = now()) => round1((at - started) / 1e3);
  return {
    note,
    frame,
    lap,
    renderBegins,
    frameEnd,
    suspend,
    watch,
    latest,
    report,
    cause,
    onHitch,
    onPerf,
    dispose,
    since,
    /* v138 */
    glTotals: () => ({ bufCalls: glTotals.buf[0], bufMs: glTotals.buf[1], bufKB: glTotals.buf[2] / 1024, texCalls: glTotals.tex[0], texMs: glTotals.tex[1], texKB: glTotals.tex[2] / 1024, shaderCalls: glTotals.shader[0], syncCalls: glTotals.sync[0], syncMs: glTotals.sync[1] }),
    hitches,
    frames,
    entries: () => hitches,
    perf: () => perfList,
    stats: snapshotStats,
    summary,
    get threshold() {
      return threshold;
    }
  };
}

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
function createRenderDiagnostics(renderer, { enabled = false, now = () => performance.now(), page = globalThis.window, document = globalThis.document, gpuScope = "render", onFrame, onGpu, getTag, hitches: sharedHitches = null } = {}) {
  if (!enabled) return { enabled: false, gpuFrames: () => [], beginFrame() {
  }, beginRender() {
  }, endFrame() {
  }, suspend() {
  }, resetSamples() {
  }, dispose() {
  }, appendSettings() {
  }, refreshSettings() {
  }, note() {
  }, snapshot: () => ({ enabled: false }) };
  const canvas = renderer.domElement, gl = renderer.getContext(), update = series(), submission = series(), interval = series(), gpu = series(), framePeak = peak(), updatePeak = peak(), submissionPeak = peak();
  const recentGpu = [], noteGpu = (at, ms, kind = "ok") => {
    recentGpu.push({ at, ms, kind });
    if (recentGpu.length > 32) recentGpu.shift();
  };
  let disposed = false, lost = false, ext, backend = null, frame = null, active = null, pending = [], lastRaf = null, lastCpuAt = null, lastGpuAt = null, state = "waiting", gpuState = "waiting", completed = 0, skipped = 0;
  const ownHitches = !sharedHitches, hitches = sharedHitches || createHitchRecorder(renderer, { now, page, timing: false });
  const observeFrame = typeof onFrame === "function", observeGpu = typeof onGpu === "function", tagged = observeFrame || observeGpu;
  let nextFrameId = 0;
  function emitGpuReset(reason) {
    if (observeGpu) safely2(() => onGpu({ type: "reset", reason, at: now() }));
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
  const safely2 = (fn) => {
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
    const name = safely2(() => gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    const vendor = safely2(() => gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR));
    backend = { classification: classifyRenderer(name), renderer: typeof name === "string" ? name : null, vendor: typeof vendor === "string" ? vendor : null, unmasked: !!debug };
    return { ...backend };
  }
  function clearQueries(invalidContext = false) {
    if (active) {
      if (!invalidContext && (gpuScope !== "frame" || safely2(() => gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) === active.query)) safely2(() => gl.endQuery(ext.TIME_ELAPSED_EXT));
      if (!invalidContext) safely2(() => gl.deleteQuery(active.query));
      active = null;
    }
    if (!invalidContext) for (const item of pending) safely2(() => gl.deleteQuery(item.query));
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
      ext = safely2(() => gl.getExtension("EXT_disjoint_timer_query_webgl2"));
      if (ext && !(safely2(() => gl.getQuery(ext.TIME_ELAPSED_EXT, ext.QUERY_COUNTER_BITS_EXT)) > 0)) ext = null;
      gpuState = ext ? "pending" : "unsupported";
    }
    if (!ext) return false;
    try {
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        for (const item of pending) noteGpu(item.at, null, "disjoint");
        resetGpu("disjoint");
        return false;
      }
      for (let i = pending.length - 1; i >= 0; i--) {
        const item = pending[i];
        if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) {
          if (at - item.at > QUERY_TIMEOUT_MS) {
            gl.deleteQuery(item.query);
            pending.splice(i, 1);
            noteGpu(item.at, null, "timeout");
            gpuState = "timeout";
            gpu.clear();
            lastGpuAt = null;
            emitGpuReset("timeout");
            if (disposed || lost) return false;
          }
          continue;
        }
        const ns = gl.getQueryParameter(item.query, gl.QUERY_RESULT);
        gl.deleteQuery(item.query);
        pending.splice(i, 1);
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          noteGpu(item.at, null, "disjoint");
          for (const p of pending) noteGpu(p.at, null, "disjoint");
          resetGpu("disjoint");
          return false;
        }
        if (Number.isFinite(ns) && ns >= 0) {
          noteGpu(item.at, ns / 1e6);
          if (ns < 1e9) gpu.add(ns / 1e6);
          lastGpuAt = Math.max(lastGpuAt ?? -Infinity, item.at);
          gpuState = "ready";
          if (observeGpu) safely2(() => onGpu({ type: "sample", frameId: item.frameId, tag: item.tag, at: item.at, completedAt: at, elapsedMs: ns / 1e6 }));
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
    if (ownHitches) safely2(() => hitches.frame(rafTime));
    lastRaf = Number.isFinite(rafTime) ? rafTime : null;
    frame = { start: now(), renderStart: null, canTime, draws: { calls: 0, triangles: 0, lines: 0, points: 0 } };
    if (tagged) {
      frame.frameId = ++nextFrameId;
      frame.tag = typeof getTag === "function" ? safely2(getTag) : null;
      frame.rafTime = lastRaf;
      frame.intervalMs = intervalMs;
    }
    if (gpuScope === "frame") beginQuery(frame.start);
  }
  function beginQuery(at) {
    if (frame.canTime && pending.length + (active ? 1 : 0) < QUERY_LIMIT) {
      if (safely2(() => gl.getParameter(ext.GPU_DISJOINT_EXT))) {
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
    if (ownHitches) safely2(() => hitches.renderBegins());
    if (gpuScope !== "frame") beginQuery(at);
  }
  function endFrame() {
    if (!frame || disposed || lost) return;
    const end = now();
    if (ownHitches) safely2(() => hitches.frameEnd());
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
      safely2(() => onFrame({ frameId: item.frameId, tag: item.tag, at: end, rafTime: item.rafTime, intervalMs: item.intervalMs, cpuMs: Math.max(0, end - item.start), updateMs: item.renderStart === null ? null : Math.max(0, item.renderStart - item.start), renderSubmissionMs: item.renderStart === null ? null : Math.max(0, end - item.renderStart), draws: typeof originalInfoUpdate === "function" ? item.draws : null }));
    }
    frame = null;
  }
  function suspend(reason = "paused") {
    if (disposed) return;
    clearQueries(lost);
    frame = null;
    lastRaf = null;
    state = reason;
    if (ownHitches) safely2(() => hitches.suspend());
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
    if (ownHitches) hitches.dispose();
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
    return { enabled: true, state, backend: identity(), fps: ms !== null && ms > 0 ? 1e3 / ms : null, peak: { frameMs: framePeak.get(at), updateMs: updatePeak.get(at), renderSubmissionMs: submissionPeak.get(at) }, cpu: { updateMs: update.mean(), renderSubmissionMs: submission.mean(), samples: update.count(), ageMs: lastCpuAt === null ? null : Math.max(0, at - lastCpuAt) }, gpu: { elapsedMs: gpu.mean(), status: gpuState, samples: gpu.count(), ageMs: lastGpuAt === null ? null : Math.max(0, at - lastGpuAt), pendingQueries: pending.length, activeQuery: !!active, liveQueries: pending.length + (active ? 1 : 0), skippedQueries: skipped, maxQueries: QUERY_LIMIT }, completedFrames: completed, hitch: safely2(() => hitches.latest()), draws: lastDraws ? { ...lastDraws } : null, resources: info?.memory ? { geometries: info.memory.geometries, textures: info.memory.textures } : null, pixelRatio: renderer.getPixelRatio(), drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } };
  }
  function appendSettings(parent) {
    const doc = parent.ownerDocument, box = doc.createElement("section"), title = doc.createElement("h3"), text = doc.createElement("pre"), copy = doc.createElement("button");
    box.className = "panel-copy render-diagnostics";
    text.className = "render-diagnostics-readout";
    title.textContent = "描画診断（直前のプレイ）";
    text.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 monospace;user-select:text";
    text.tabIndex = 0;
    text.textContent = formatRenderDiagnostics(snapshot(), hitches.report());
    copy.className = "outline-button";
    copy.textContent = "診断をコピー";
    copy.onclick = async () => {
      text.textContent = formatRenderDiagnostics(snapshot(), hitches.report());
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
    if (text) text.textContent = formatRenderDiagnostics(snapshot(), hitches.report());
  }
  return { enabled: true, gpuFrames: () => recentGpu.slice(), beginFrame, beginRender, endFrame, suspend, resetSamples, dispose, snapshot, appendSettings, refreshSettings, note: (label) => safely2(() => hitches.note(label)), hitchReport: () => hitches.report() };
}
function formatRenderDiagnostics(s, hitchReport = "") {
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
ブラウザの画面更新同期や待機で使用率が低くなる場合もあり、この数値だけでCPUが原因とは判定できません。` + (hitchReport ? "\n\n" + hitchReport : "");
}

export {
  WORLD_PHASES,
  createHitchRecorder,
  createRenderDiagnostics
};
