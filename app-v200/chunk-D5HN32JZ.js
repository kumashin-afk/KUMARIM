// render-resolution.js
var RESOLUTION_PRESETS = Object.freeze([
  { value: "auto", label: "自動（最大2560 × 1440）" },
  // v114.3: Ultra's former auto (up to 2× the window, within 2560 × 1440): the user's choice to keep it.
  { value: "auto-fine", label: "自動・精細（v114.2 までの自動：最高画質では画面より細かく）" },
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
  } else if (preset === "auto" || preset === "auto-fine") {
    const autoRatio = quality === "ultra" && preset === "auto-fine" ? legacyRatio : Math.min(safeDPR, highQuality ? 2 : 1);
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

// net-session.js
var NET = Object.freeze({
  maxPlayers: 4,
  rate: 20,
  heartbeat: 1,
  timeout: 15,
  hello: 1,
  joinWait: 8,
  colors: Object.freeze([14263361, 6269139, 9421930, 13856607]),
  codeChars: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
});
function roomCode(random = Math.random) {
  let s = "";
  for (let i = 0; i < 6; i++) s += NET.codeChars[Math.floor(random() * NET.codeChars.length) % NET.codeChars.length];
  return s;
}
function normalizeRoomCode(text) {
  const s = String(text ?? "").toUpperCase().replace(/[\s-]/g, "");
  return s.length === 6 && [...s].every((c) => NET.codeChars.includes(c)) ? s : null;
}
function cleanName(text, fallback = "旅人") {
  const s = String(text ?? "").replace(/[\u0000-\u001f<>&"'`\\]/g, "").trim().slice(0, 12);
  return s || fallback;
}
var randomId = (random) => Array.from({ length: 12 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36) % 36]).join("");
function createNetSession({ version, transport, now = () => performance.now() / 1e3, random = Math.random, selfId = randomId(random) } = {}) {
  let role = "off", code = null, link = null, hostId = null, self = null, welcomeWith = null, beat = -Infinity, joining = null, hostSeen = 0, joinKey = "";
  const peers = /* @__PURE__ */ new Map(), listeners = /* @__PURE__ */ new Map();
  const emit = (event, ...args) => {
    for (const fn of [...listeners.get(event) ?? []]) {
      try {
        fn(...args);
      } catch (e) {
        console.error("[net]", e);
      }
    }
  };
  const on = (event, fn) => {
    if (!listeners.has(event)) listeners.set(event, /* @__PURE__ */ new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  };
  const info = (p) => ({ id: p.id, name: p.name, slot: p.slot, color: p.color });
  const roster = () => [self, ...peers.values()].filter(Boolean).filter((p) => p.slot >= 0).map(info).sort((a, b) => a.slot - b.slot);
  function host({ name, code: wanted = null, welcome = null } = {}) {
    leave(true);
    code = normalizeRoomCode(wanted) ?? roomCode(random);
    link = transport(code, selfId);
    if (!link) {
      code = null;
      return null;
    }
    role = "host";
    hostId = selfId;
    welcomeWith = welcome;
    self = { id: selfId, name: cleanName(name), slot: 0, color: NET.colors[0] };
    link.onMessage(atHost);
    beat = -Infinity;
    emit("roster", roster());
    return code;
  }
  function freeSlot() {
    for (let s = 1; s < NET.maxPlayers; s++) if (![...peers.values()].some((p) => p.slot === s)) return s;
    return -1;
  }
  function atHost(from, m) {
    if (!m || typeof m !== "object" || role !== "host") return;
    if (m.t === "hello") {
      if (m.version !== version) {
        link.send(from, { t: "reject", reason: "version", version });
        return;
      }
      if (m.peek && !peers.has(from)) {
        if (freeSlot() < 0) {
          link.send(from, { t: "reject", reason: "full" });
          return;
        }
        let extra2 = {};
        try {
          extra2 = welcomeWith?.({ id: from, name: cleanName(m.name), slot: -1, peek: true }, m) ?? {};
        } catch (e) {
          console.error("[net]", e);
        }
        link.send(from, { ...extra2, t: "welcome", id: from, slot: -1, color: 16777215, host: info(self), players: roster(), peek: 1 });
        return;
      }
      let p2 = peers.get(from);
      if (!p2) {
        const slot = freeSlot();
        if (slot < 0) {
          link.send(from, { t: "reject", reason: "full" });
          return;
        }
        p2 = { id: from, key: String(m.key ?? "").slice(0, 40), name: cleanName(m.name), slot, color: NET.colors[slot], seen: now(), state: null };
        peers.set(from, p2);
        emit("join", p2);
      }
      p2.seen = now();
      let extra = {};
      try {
        extra = welcomeWith?.(p2, m) ?? {};
      } catch (e) {
        console.error("[net]", e);
      }
      link.send(from, { ...extra, t: "welcome", id: from, slot: p2.slot, color: p2.color, host: info(self), players: roster() });
      sendRoster();
      return;
    }
    const p = peers.get(from);
    if (!p) {
      if (m.t !== "bye") link.send(from, { t: "gone" });
      return;
    }
    p.seen = now();
    if (m.t === "s") {
      p.state = m.s;
      emit("state", p, m.s);
      if (!m.d) {
        for (const q of peers.values()) if (q.id !== from) link.send(q.id, { t: "s", id: from, s: m.s });
      }
    } else if (m.t === "bye") drop(from, "left");
    else if (m.t !== "hb") emit("message", p, m);
  }
  function sendRoster() {
    if (role === "host") link.send("*", { t: "roster", players: roster() });
    emit("roster", roster());
  }
  function drop(id, reason) {
    const p = peers.get(id);
    if (!p) return;
    peers.delete(id);
    emit("leave", p, reason);
    if (role === "host") sendRoster();
  }
  function join(wanted, { name, key = "", wait = NET.joinWait, peek = false } = {}) {
    leave(true);
    code = normalizeRoomCode(wanted);
    if (!code) return Promise.resolve({ rejected: "code" });
    link = transport(code, selfId);
    if (!link) {
      code = null;
      return Promise.resolve({ rejected: "unsupported" });
    }
    role = "joining";
    self = { id: selfId, name: cleanName(name), slot: -1, color: 16777215 };
    joinKey = String(key).slice(0, 40);
    link.onMessage(atGuest);
    return new Promise((resolve) => {
      const hello = () => link?.send("*", { t: "hello", version, name: self.name, key: String(key).slice(0, 40), ...peek ? { peek: 1 } : {} });
      joining = { resolve, hello, started: now(), wait, next: now() + NET.hello };
      hello();
    });
  }
  function finishJoin(result) {
    const j = joining;
    joining = null;
    j?.resolve(result);
  }
  function atGuest(from, m) {
    if (!m || typeof m !== "object") return;
    if (role === "joining") {
      if (m.t === "welcome" && m.id === selfId) {
        role = "guest";
        hostId = from;
        self = { ...self, slot: m.slot, color: m.color };
        hostSeen = now();
        beat = -Infinity;
        setRoster(m.players);
        finishJoin(m);
      } else if (m.t === "reject") {
        finishJoin({ rejected: m.reason, version: m.version });
        leave(true);
      }
      return;
    }
    if (role === "guest" && m.t === "s" && m.d && from !== hostId) {
      const p = peers.get(from);
      if (p) {
        p.state = m.s;
        emit("state", p, m.s);
      }
      return;
    }
    if (role !== "guest" || from !== hostId) return;
    hostSeen = now();
    if (m.t === "gone") {
      link.send(hostId, { t: "hello", version, name: self.name, key: joinKey });
      return;
    }
    if (m.t === "welcome") {
      if (m.id === selfId) {
        self = { ...self, slot: m.slot, color: m.color };
        setRoster(m.players);
      }
      return;
    }
    if (m.t === "s") {
      const p = peers.get(m.id ?? from);
      if (p) {
        p.state = m.s;
        emit("state", p, m.s);
      }
    } else if (m.t === "roster") setRoster(m.players);
    else if (m.t === "clock") emit("clock", m);
    else if (m.t === "end") {
      const reason = m.reason || "closed";
      leave(true);
      emit("end", reason);
    } else if (m.t !== "hb") emit("message", peers.get(hostId), m);
  }
  function setRoster(list) {
    const ids = /* @__PURE__ */ new Set();
    for (const r of Array.isArray(list) ? list : []) {
      if (!r || !r.id || r.id === selfId) continue;
      ids.add(r.id);
      let p = peers.get(r.id);
      if (!p) {
        p = { id: r.id, name: cleanName(r.name), slot: r.slot | 0, color: r.color | 0, state: null, seen: now() };
        peers.set(r.id, p);
        emit("join", p);
      } else {
        p.name = cleanName(r.name);
        p.slot = r.slot | 0;
        p.color = r.color | 0;
      }
    }
    for (const id of [...peers.keys()]) if (!ids.has(id)) drop(id, "left");
    emit("roster", roster());
  }
  let lastTick = -Infinity;
  function update() {
    const t = now();
    if (t - lastTick > 2 && Number.isFinite(lastTick)) {
      hostSeen = Math.max(hostSeen, t);
      for (const p of peers.values()) p.seen = Math.max(p.seen, t);
    }
    lastTick = t;
    if (role === "joining" && joining) {
      if (t - joining.started > joining.wait) {
        finishJoin({ rejected: "none" });
        leave(true);
      } else if (t >= joining.next) {
        joining.next = t + NET.hello;
        joining.hello();
      }
      return;
    }
    if (role !== "host" && role !== "guest") return;
    if (t - beat >= NET.heartbeat) {
      beat = t;
      link.send(role === "host" ? "*" : hostId, { t: "hb" });
    }
    if (role === "host") {
      for (const p of [...peers.values()]) if (t - p.seen > NET.timeout) drop(p.id, "timeout");
    } else if (t - hostSeen > NET.timeout) {
      leave(true);
      emit("end", "lost");
    }
  }
  function sendState(s) {
    if (role === "host") link.send("*", { t: "s", id: selfId, s });
    else if (role === "guest") link.send("*", { t: "s", s, d: 1 });
  }
  function sendClock(m) {
    if (role === "host") link.send("*", { ...m, t: "clock" });
  }
  function send(m, to = "*") {
    if (role === "host") link.send(to, m);
    else if (role === "guest") link.send(hostId, m);
  }
  function leave(quiet = false, reason = "closed") {
    if (link) {
      if (!quiet) {
        if (role === "host") link.send("*", { t: "end", reason });
        else if (role === "guest") link.send(hostId, { t: "bye" });
      }
      link.close();
    }
    const was = [...peers.values()];
    link = null;
    peers.clear();
    role = "off";
    code = null;
    hostId = null;
    welcomeWith = null;
    if (joining) finishJoin({ rejected: "cancelled" });
    for (const p of was) emit("leave", p, "closed");
    if (was.length) emit("roster", roster());
  }
  return {
    host,
    join,
    leave,
    update,
    sendState,
    sendClock,
    send,
    on,
    players: roster,
    peers: () => [...peers.values()],
    get role() {
      return role;
    },
    get code() {
      return code;
    },
    get selfId() {
      return selfId;
    },
    get hostId() {
      return hostId;
    },
    get self() {
      return self;
    },
    get active() {
      return role === "host" || role === "guest";
    }
  };
}

// net-transport.js
function createLocalTransport(room, selfId, { Channel = globalThis.BroadcastChannel } = {}) {
  if (typeof Channel !== "function") return null;
  const channel = new Channel("kumarim-room:" + room);
  let handler = null, closed = false;
  channel.onmessage = (event) => {
    const m = event?.data;
    if (closed || !m || m.from === selfId || m.to !== "*" && m.to !== selfId) return;
    try {
      handler?.(m.from, m.d);
    } catch (error) {
      console.error("[net]", error);
    }
  };
  return {
    kind: "local",
    send(to, d) {
      if (!closed) channel.postMessage({ from: selfId, to, d });
    },
    onMessage(fn) {
      handler = fn;
    },
    close() {
      if (closed) return;
      closed = true;
      channel.onmessage = null;
      channel.close();
    }
  };
}
var RELAY = Object.freeze({ chunk: 12e4, queue: 600, retry: Object.freeze([500, 8e3]) });
function normalizeServer(text) {
  try {
    const u = new URL(String(text ?? "").trim());
    if (u.protocol === "https:") u.protocol = "wss:";
    else if (u.protocol === "http:") u.protocol = "ws:";
    if (u.protocol !== "wss:" && u.protocol !== "ws:") return null;
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}
function createRelayTransport(server, { WebSocketImpl = globalThis.WebSocket, onStatus = null } = {}) {
  const base = normalizeServer(server);
  if (!base || typeof WebSocketImpl !== "function") return null;
  return (room, selfId) => {
    let socket = null, handler = null, closed = false, queue = [], tries = 0, timer = null, serial = 0;
    const pieces = /* @__PURE__ */ new Map(), url = `${base}/room/${room}?id=${encodeURIComponent(selfId)}`;
    const status = (s, detail) => {
      try {
        onStatus?.(s, detail);
      } catch {
      }
    };
    function connect() {
      if (closed) return;
      const ws = socket = new WebSocketImpl(url);
      status("connecting");
      ws.onopen = () => {
        if (socket !== ws) return;
        tries = 0;
        status("open");
        const q = queue;
        queue = [];
        for (const line2 of q) ws.send(line2);
      };
      ws.onmessage = (event) => {
        const text = typeof event.data === "string" ? event.data : "", cut = text.indexOf("\n");
        if (cut < 1) return;
        let d;
        try {
          d = JSON.parse(text.slice(cut + 1));
        } catch {
          return;
        }
        receive(text.slice(0, cut), d);
      };
      ws.onclose = (event) => {
        if (socket !== ws) return;
        socket = null;
        if (closed) return;
        status("lost", event?.code);
        if (event?.code === 4e3) return;
        const wait = Math.min(RELAY.retry[1], RELAY.retry[0] * 2 ** tries++);
        timer = setTimeout(connect, wait);
      };
      ws.onerror = () => {
      };
    }
    function receive(from, d) {
      if (d && d.t === "~") {
        const key = from + ":" + d.id;
        let p = pieces.get(key);
        if (!p) {
          if (!(d.n > 1 && d.n < 200)) return;
          p = { n: d.n, got: 0, s: [] };
          pieces.set(key, p);
        }
        if (p.s[d.i] === void 0 && d.i >= 0 && d.i < p.n) {
          p.s[d.i] = String(d.s);
          p.got++;
        }
        if (p.got < p.n) return;
        pieces.delete(key);
        try {
          d = JSON.parse(p.s.join(""));
        } catch {
          return;
        }
      }
      try {
        handler?.(from, d);
      } catch (error) {
        console.error("[net]", error);
      }
    }
    function line(to, text) {
      const l = to + "\n" + text;
      if (socket?.readyState === 1) socket.send(l);
      else if (queue.length < RELAY.queue) queue.push(l);
    }
    connect();
    return {
      kind: "relay",
      send(to, d) {
        if (closed) return;
        const text = JSON.stringify(d);
        if (text.length <= RELAY.chunk) {
          line(to, text);
          return;
        }
        const id = ++serial, n = Math.ceil(text.length / RELAY.chunk);
        for (let i = 0; i < n; i++) line(to, JSON.stringify({ t: "~", id, i, n, s: text.slice(i * RELAY.chunk, (i + 1) * RELAY.chunk) }));
      },
      onMessage(fn) {
        handler = fn;
      },
      close() {
        closed = true;
        clearTimeout(timer);
        const ws = socket;
        socket = null;
        queue = [];
        try {
          ws?.close(1e3, "bye");
        } catch {
        }
      },
      get open() {
        return socket?.readyState === 1;
      }
    };
  };
}

// net-config.js
var ROOM_SERVER = "https://kumarim-room.nyantarou0606.workers.dev";

// room-join.js
var KEYS = Object.freeze({
  boot: "kumarim-mp-v1",
  name: "kumarim-player-name",
  key: "kumarim-player-key",
  server: "kumarim-room-server",
  note: "kumarim-mp-note",
  // (v200) the host's room opened once the island is ready (the title's 「部屋を作る」); the title passed by once (the page
  // loaded again from play: a new island, back home, onto a host's island).
  host: "kumarim-mp-host",
  skip: "kumarim-title-skip"
});
var store = (s, k, v) => {
  try {
    if (v === void 0) return s?.getItem(k) ?? null;
    if (v === null) s?.removeItem(k);
    else s?.setItem(k, v);
  } catch {
  }
  return null;
};
var defaults = () => ({ local: globalThis.localStorage, session: globalThis.sessionStorage });
var sealedPage = (location = globalThis.location) => /(^|\.)(claude\.ai|claudeusercontent\.com|anthropic\.com)$/.test(location?.hostname || "");
var SEALED = "このページ（claude.ai）からは外のサーバーにつなげないので、ここでは同じブラウザの窓どうしだけでつながります。別のパソコンとは GitHub Pages の KUMARIM で遊んでください。";
function roomServer(local = globalThis.localStorage) {
  return normalizeServer(store(local, KEYS.server)) ?? normalizeServer(ROOM_SERVER);
}
function transportFor(server, onStatus = null) {
  return server ? createRelayTransport(server, { onStatus }) : createLocalTransport;
}
function playerName(local = globalThis.localStorage) {
  return cleanName(store(local, KEYS.name));
}
function setPlayerName(text, local = globalThis.localStorage) {
  const n = cleanName(text);
  store(local, KEYS.name, n);
  return n;
}
function playerKey(local = globalThis.localStorage) {
  let k = store(local, KEYS.key);
  if (!k) {
    k = Math.random().toString(36).slice(2, 12);
    store(local, KEYS.key, k);
  }
  return k;
}
function readGuestBoot(session = globalThis.sessionStorage) {
  try {
    const b = JSON.parse(store(session, KEYS.boot));
    return b && b.role === "guest" && normalizeRoomCode(b.code) && Number.isSafeInteger(b.seed) ? b : null;
  } catch {
    return null;
  }
}
function clearGuestBoot(session = globalThis.sessionStorage) {
  store(session, KEYS.boot, null);
}
function writeGuestBoot(session, { code, welcome: w, name, server }) {
  store(session, KEYS.boot, JSON.stringify({ role: "guest", code, seed: w.seed, world: w.world || {}, pos: w.pos || null, host: w.host?.name || "", name, server: server || null }));
}
function rejectReason(w, server, link) {
  if (w.rejected === "version") return `ホストのゲームの版（${w.version}）が違う。同じ版で入ろう。`;
  if (w.rejected === "full") return `部屋がいっぱい（${NET.maxPlayers} 人まで）。`;
  if (w.rejected === "none" && server && link !== "open") return sealedPage() ? "このページ（claude.ai）からは、つなぎ先のサーバーにつなげない。GitHub Pages の KUMARIM で入ろう。" : "つなぎ先のサーバーにつながらなかった。つなぎ先とネットの接続を確かめよう。";
  if (w.rejected === "none") return server ? "部屋が見つからなかった。部屋コードを確かめよう（ホストが部屋を作ってから入ろう）。" : "部屋が見つからなかった（つなぎ先が決まっていないので、同じブラウザの窓どうしだけ）。";
  if (w.rejected === "code") return "部屋コードは 6 文字（英字と数字）。";
  if (w.rejected === "seed") return "部屋の島を受け取れなかった。";
  return "部屋に入れなかった。";
}
async function findRoom({ version, code: text, name, server, storage = defaults() }) {
  const code = normalizeRoomCode(text);
  if (!code) return { error: "code", text: rejectReason({ rejected: "code" }) };
  const where = sealedPage() ? null : server === void 0 ? roomServer(storage.local) : normalizeServer(server);
  let link = "idle";
  const session = createNetSession({ version, transport: transportFor(where, (s) => {
    link = s;
  }) });
  const timer = setInterval(() => session.update(), 250);
  const who = name === void 0 ? playerName(storage.local) : setPlayerName(name, storage.local);
  let w;
  try {
    w = await session.join(code, { name: who, key: playerKey(storage.local), peek: true });
  } finally {
    clearInterval(timer);
    session.leave(true);
  }
  if (!w.rejected && !Number.isSafeInteger(w.seed)) w = { rejected: "seed" };
  if (w.rejected) return { error: w.rejected, text: rejectReason(w, where, link) };
  writeGuestBoot(storage.session, { code, welcome: w, name: who, server: where });
  return { code, host: w.host?.name || "", seed: w.seed };
}
function takeInvite({ location = globalThis.location, history = globalThis.history, storage = defaults() } = {}) {
  const params = new URLSearchParams(location?.search || "");
  if (!params.has("join")) return null;
  const code = normalizeRoomCode(params.get("join")), server = normalizeServer(params.get("server"));
  if (server && !sealedPage(location)) store(storage.local, KEYS.server, server);
  params.delete("join");
  params.delete("server");
  const rest = params.toString();
  try {
    history?.replaceState?.(null, "", location.pathname + (rest ? "?" + rest : "") + (location.hash || ""));
  } catch {
  }
  return { code, server };
}
function skipTitleOnce(session = globalThis.sessionStorage) {
  store(session, KEYS.skip, "1");
}
function takeTitleSkip(session = globalThis.sessionStorage) {
  const skip = store(session, KEYS.skip) === "1";
  store(session, KEYS.skip, null);
  return skip;
}

// canvas-2d.js
var CANVAS_2D = { cpu: true };
var canvas2dOptions = () => CANVAS_2D.cpu ? { willReadFrequently: true } : void 0;
function context2d(canvas) {
  const options = canvas2dOptions();
  return options ? canvas.getContext("2d", options) : canvas.getContext("2d");
}

// loading-atlas.js
var ATLAS = Object.freeze({
  width: 240,
  // Trees a land pixel (by biome: forest, meadow, mountains, ash, fen) - the forest's dots.
  trees: Object.freeze([0.62, 0.1, 0.05, 0.07, 0.34]),
  colors: Object.freeze([[113, 128, 94], [157, 151, 105], [213, 210, 187], [157, 126, 97], [100, 124, 105]]),
  // (map-raster.js's)
  tree: Object.freeze([[38, 64, 47], [74, 88, 56], [70, 92, 88], [86, 72, 54], [54, 78, 60]]),
  ink: Object.freeze([86, 64, 40]),
  paper: Object.freeze([226, 214, 182]),
  water: Object.freeze([73, 123, 128]),
  icons: Object.freeze({ camp: "♨", cave: "⌂", pit: "◎", shrine: "◇", boss: "♜", base: "⚑" })
});
var COAST = Object.freeze([188, 177, 134]);
var CAPTIONS = Object.freeze({
  chart: "島の形を測っています",
  coast: "海岸線と起伏を描いています",
  water: "川と湖を描いています",
  nearby: "降り立つ場所のまわりを描いています",
  places: "見つけた場所を書き込んでいます",
  forest: "森を描き込んでいます",
  color: "色を塗っています",
  done: "島の地図ができました"
});
var current = null;
var getLoadingAtlas = () => current;
function createLoadingAtlas(root) {
  const box = root?.querySelector(".loading-atlas");
  if (!box) return null;
  const $ = (s) => box.querySelector(s), caption = $(".la-caption"), ring = $(".la-ring"), marks = $(".la-marks");
  const layers = { sketch: $(".la-sketch"), color: $(".la-color"), water: $(".la-water"), forest: $(".la-forest") };
  let map = null, step = "chart", forestDrawn = 0, placesShown = false;
  const steps = ["chart", "coast", "water", "nearby", "places", "forest", "color", "done"];
  function to(next) {
    if (steps.indexOf(next) <= steps.indexOf(step)) return;
    step = next;
    box.dataset.step = next;
    for (const s of steps.slice(1, steps.indexOf(next) + 1)) box.classList.add("at-" + s);
    if (caption) caption.textContent = CAPTIONS[next];
  }
  box.dataset.step = step;
  if (caption) caption.textContent = CAPTIONS.chart;
  function island({ island: island2, heightAt, biomeAt, waterAt, rivers = [], start = null }) {
    if (map) return map;
    const t0 = performance.now(), b = island2.landBounds, W = ATLAS.width, H = Math.round(W * (b.maxZ - b.minZ) / (b.maxX - b.minX));
    const dx = (b.maxX - b.minX) / W, dz = (b.maxZ - b.minZ) / H, n = W * H;
    const alt = new Float32Array(n), kind = new Uint8Array(n), biome = new Uint8Array(n);
    for (let i = 0, py = 0; py < H; py++) for (let px = 0; px < W; px++, i++) {
      const x = b.minX + (px + 0.5) * dx, z = b.minZ + (py + 0.5) * dz;
      if (!island2.isLandExtent(x, z)) continue;
      const y = heightAt(x, z), w = waterAt(x, z, y);
      if (w && w.kind === "ocean") continue;
      alt[i] = y;
      kind[i] = w ? 2 : 1;
      biome[i] = biomeAt(x, z, y) | 0;
    }
    const water = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (kind[i] === 2) water[i] = 255;
    for (const river of rivers) for (const reach of river.reaches || []) {
      const pts = reach.points || [];
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], c = pts[k + 1], len = Math.hypot(c.x - a.x, c.z - a.z), parts = Math.max(1, Math.ceil(len / (dx * 0.5)));
        for (let s = 0; s <= parts; s++) {
          const f = s / parts, x = a.x + (c.x - a.x) * f, z = a.z + (c.z - a.z) * f, r = Math.max(0.55, ((a.halfWidth || 3) * (1 - f) + (c.halfWidth || 3) * f) / dx);
          const cx = (x - b.minX) / dx - 0.5, cz = (z - b.minZ) / dz - 0.5;
          for (let yy = Math.floor(cz - r - 1); yy <= Math.ceil(cz + r + 1); yy++) for (let xx = Math.floor(cx - r - 1); xx <= Math.ceil(cx + r + 1); xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const d = Math.hypot(xx - cx, yy - cz), v = Math.max(0, Math.min(1, r + 0.5 - d)) * 255, j = yy * W + xx;
            if (kind[j] && v > water[j]) water[j] = v;
          }
        }
      }
    }
    const light = new Float32Array(n), coast = new Uint8Array(n), contour = new Uint8Array(n);
    for (let i = 0, py = 0; py < H; py++) for (let px = 0; px < W; px++, i++) {
      if (!kind[i]) continue;
      const l = px > 0 ? i - 1 : i, r = px < W - 1 ? i + 1 : i, u = py > 0 ? i - W : i, d = py < H - 1 ? i + W : i;
      coast[i] = !kind[l] || !kind[r] || !kind[u] || !kind[d] ? 1 : 0;
      const sx = ((kind[r] ? alt[r] : alt[i]) - (kind[l] ? alt[l] : alt[i])) / (2 * dx), sz = ((kind[d] ? alt[d] : alt[i]) - (kind[u] ? alt[u] : alt[i])) / (2 * dz);
      light[i] = Math.max(0.5, Math.min(1.25, 0.84 + (-sx - sz) * 0.5 / Math.sqrt(1 + sx * sx + sz * sz)));
      contour[i] = kind[r] && Math.floor(alt[i] / 40) !== Math.floor(alt[r] / 40) || kind[d] && Math.floor(alt[i] / 40) !== Math.floor(alt[d] / 40) ? 1 : 0;
    }
    const sketch = new ImageData(W, H), color = new ImageData(W, H), wet = new ImageData(W, H), S = sketch.data, C = color.data, Q = wet.data;
    const [pr, pg, pb] = ATLAS.paper, [wr, wg, wb] = ATLAS.water;
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      if (water[i]) {
        Q[o] = wr;
        Q[o + 1] = wg;
        Q[o + 2] = wb;
        Q[o + 3] = water[i];
      }
      if (!kind[i]) continue;
      const g = ((Math.imul(i + 1, 374761393) >>> 9) % 15 - 7) * 0.6, l = light[i];
      const ink = coast[i] ? 0.55 : contour[i] ? 0.8 : 1, k = l * ink;
      S[o] = pr * k + g;
      S[o + 1] = pg * k + g;
      S[o + 2] = pb * k * 0.96 + g;
      S[o + 3] = 255;
      const c = coast[i] ? COAST : ATLAS.colors[biome[i]] || ATLAS.colors[0], m = l * (contour[i] ? 0.88 : 1);
      C[o] = c[0] * m + g;
      C[o + 1] = c[1] * m + g;
      C[o + 2] = c[2] * m + g;
      C[o + 3] = 255;
    }
    for (const [canvas, img] of [[layers.sketch, sketch], [layers.color, color], [layers.water, wet]]) {
      canvas.width = W;
      canvas.height = H;
      context2d(canvas).putImageData(img, 0, 0);
    }
    const sx0 = start ? (start.x - b.minX) / dx : W / 2, sz0 = start ? (start.z - b.minZ) / dz : H / 2, trees = [];
    for (let i = 0, py = 0; py < H; py++) for (let px = 0; px < W; px++, i++) {
      if (kind[i] !== 1 || water[i] > 90) continue;
      const h = (Math.imul(i + 7, 2654435761) >>> 0) / 4294967296;
      if (h < ATLAS.trees[biome[i]]) trees.push([px, py, biome[i], Math.hypot(px - sx0, py - sz0)]);
    }
    trees.sort((p, q) => p[3] - q[3]);
    layers.forest.width = W * 2;
    layers.forest.height = H * 2;
    const forestImage = new ImageData(W * 2, H * 2), forestCtx = context2d(layers.forest);
    map = { W, H, trees, forestImage, forestCtx, ms: Math.round(performance.now() - t0), drawnAt: performance.now() };
    if (start && ring) {
      ring.style.left = sx0 / W * 100 + "%";
      ring.style.top = sz0 / H * 100 + "%";
    }
    map.at = (x, z) => [(x - b.minX) / dx / W * 100, (z - b.minZ) / dz / H * 100];
    box.style.setProperty("--atlas-aspect", `${W} / ${H}`);
    to("coast");
    return map;
  }
  function forest(share) {
    if (!map) return;
    const want = Math.floor(map.trees.length * Math.max(0, Math.min(1, share)));
    if (want <= forestDrawn) return;
    const W2 = map.W * 2, px = map.forestImage.data;
    for (let k = forestDrawn; k < want; k++) {
      const [x, y, b] = map.trees[k], c = ATLAS.tree[b] || ATLAS.tree[0], j = (k * 2654435761 >>> 0) / 4294967296;
      const ox = x * 2 + (j < 0.5 ? 0 : 1), oy = y * 2 + (j * 7 % 1 < 0.5 ? 0 : 1);
      for (const [ax, ay, a] of [[0, 0, 230], [1, 0, 150], [0, 1, 150], [-1, 0, 90], [0, -1, 90]]) {
        const X = ox + ax, Y = oy + ay;
        if (X < 0 || Y < 0 || X >= W2 || Y >= map.H * 2) continue;
        const o = (Y * W2 + X) * 4;
        if (px[o + 3] >= a) continue;
        px[o] = c[0];
        px[o + 1] = c[1];
        px[o + 2] = c[2];
        px[o + 3] = a;
      }
    }
    forestDrawn = want;
    map.forestCtx.putImageData(map.forestImage, 0, 0);
  }
  function places(list) {
    if (!map || placesShown || !marks) return;
    placesShown = true;
    let k = 0;
    for (const p of list || []) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      const [l, t] = map.at(p.x, p.z), el = document.createElement("i");
      el.className = "la-place";
      el.textContent = ATLAS.icons[p.kind] || "◇";
      el.title = p.name || "";
      el.style.left = l + "%";
      el.style.top = t + "%";
      el.style.animationDelay = (k++ * 0.12).toFixed(2) + "s";
      marks.append(el);
    }
    to("places");
  }
  function progress(s) {
    const st = (id) => s?.stages?.find((x) => x.id === id);
    const near = st("nearby"), poi = st("poi"), far = st("distant"), draw = st("shaders");
    if (!map) return;
    if (step === "coast" && performance.now() - map.drawnAt > 1400) to("water");
    if (near && near.status !== "waiting") {
      to("nearby");
      const share = near.status === "done" ? 1 : near.total ? near.completed / near.total : 0.2;
      ring?.style.setProperty("--ring", (0.35 + 0.65 * share).toFixed(3));
    }
    if (poi?.status === "done") to("places");
    if (far && far.status !== "waiting") {
      to("forest");
      forest(far.status === "done" ? 1 : far.total ? far.completed / far.total : 0.15);
    }
    if (draw && draw.status !== "waiting") {
      forest(1);
      to("color");
    }
    if (s.status === "done") to("done");
  }
  current = { island, places, progress, forest, get step() {
    return step;
  }, get map() {
    return map;
  } };
  return current;
}

export {
  RESOLUTION_PRESETS,
  normalizeResolution,
  calculateRenderResolution,
  NET,
  normalizeRoomCode,
  cleanName,
  createNetSession,
  normalizeServer,
  KEYS,
  store,
  sealedPage,
  SEALED,
  roomServer,
  transportFor,
  playerName,
  setPlayerName,
  playerKey,
  readGuestBoot,
  clearGuestBoot,
  rejectReason,
  findRoom,
  takeInvite,
  skipTitleOnce,
  takeTitleSkip,
  context2d,
  getLoadingAtlas,
  createLoadingAtlas
};
