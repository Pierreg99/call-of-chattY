export const NET_PROTOCOL = 1;
export const MAX_SERVER_MESSAGE_BYTES = 8192;

const VALID_TYPES = new Set(["welcome", "player_join", "player_leave", "snapshot", "fire", "pong"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafePacket(packet) {
  return isRecord(packet)
    && packet.v === NET_PROTOCOL
    && typeof packet.type === "string"
    && VALID_TYPES.has(packet.type);
}

export class SnapshotBuffer {
  constructor(max = 32) {
    this.max = Math.max(2, Math.trunc(max));
    this.items = [];
  }

  push(snapshot) {
    if (!snapshot || !Number.isFinite(snapshot.t)) return false;
    this.items.push(snapshot);
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
    return true;
  }

  sample(renderTime) {
    if (!this.items.length) return null;
    let a = this.items[0];
    let b = this.items[this.items.length - 1];
    for (let i = 0; i < this.items.length - 1; i += 1) {
      if (this.items[i].t <= renderTime && this.items[i + 1].t >= renderTime) {
        a = this.items[i];
        b = this.items[i + 1];
        break;
      }
    }
    const span = Math.max(0.0001, b.t - a.t);
    const alpha = Math.min(1, Math.max(0, (renderTime - a.t) / span));
    return { a, b, alpha };
  }
}

export class ClientPrediction {
  constructor(maxPending = 256) {
    this.sequence = 0;
    this.maxPending = Math.max(32, Math.trunc(maxPending));
    this.pending = [];
  }

  input(payload = {}) {
    const input = { sequence: ++this.sequence, ...payload };
    this.pending.push(input);
    if (this.pending.length > this.maxPending) this.pending.shift();
    return input;
  }

  acknowledge(sequence) {
    if (!Number.isFinite(sequence)) return;
    this.pending = this.pending.filter((x) => x.sequence > sequence);
  }
}

export class LocalMultiplayerTransport {
  constructor({ reconnect = true, maxMessageBytes = MAX_SERVER_MESSAGE_BYTES } = {}) {
    this.socket = null;
    this.connected = false;
    this.handlers = new Map();
    this.reconnect = reconnect;
    this.maxMessageBytes = maxMessageBytes;
    this.url = null;
    this.attempt = 0;
    this.timer = null;
    this.closedByUser = false;
    this.rttMs = null;
    this.lastPing = 0;
  }

  connect(url) {
    if (!url || !globalThis.WebSocket) return false;
    this.url = url;
    this.closedByUser = false;
    this.#open();
    return true;
  }

  on(type, fn) {
    if (typeof fn !== "function") return () => {};
    const set = this.handlers.get(type) ?? new Set();
    set.add(fn);
    this.handlers.set(type, set);
    return () => set.delete(fn);
  }

  emit(type, payload) {
    for (const fn of this.handlers.get(type) ?? []) {
      try { fn(payload); } catch (error) { console.error("[net] handler failed", error); }
    }
  }

  send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    const packet = JSON.stringify({ v: NET_PROTOCOL, type, ...payload });
    if (packet.length > this.maxMessageBytes) return false;
    this.socket.send(packet);
    return true;
  }

  close() {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
  }

  ping() {
    this.lastPing = performance.now();
    return this.send("ping", { t: Date.now() });
  }

  #open() {
    if (!this.url || this.closedByUser) return;
    this.socket?.close();
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.connected = true;
      this.emit("open");
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.connected = false;
      this.emit("close");
      this.#scheduleReconnect();
    };
    socket.onerror = () => this.emit("error");
    socket.onmessage = (event) => {
      if (typeof event.data !== "string" || event.data.length > this.maxMessageBytes) return;
      try {
        const msg = JSON.parse(event.data);
        if (!isSafePacket(msg)) return;
        if (msg.type === "pong" && this.lastPing) {
          this.rttMs = Math.max(0, performance.now() - this.lastPing);
          this.emit("rtt", this.rttMs);
        }
        this.emit(msg.type, msg);
      } catch {
        this.emit("protocol_error");
      }
    };
  }

  #scheduleReconnect() {
    if (!this.reconnect || this.closedByUser || this.timer || !this.url) return;
    const delay = Math.min(10000, 500 * (2 ** Math.min(this.attempt, 5)));
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.#open();
    }, delay);
  }
}
