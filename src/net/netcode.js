export const NET_PROTOCOL = 1;

export class SnapshotBuffer {
  constructor(max = 32) { this.max = max; this.items = []; }
  push(snapshot) { this.items.push(snapshot); if (this.items.length > this.max) this.items.shift(); }
  sample(renderTime) {
    if (!this.items.length) return null;
    let a = this.items[0], b = this.items[this.items.length - 1];
    for (let i = 0; i < this.items.length - 1; i++) if (this.items[i].t <= renderTime && this.items[i + 1].t >= renderTime) { a = this.items[i]; b = this.items[i + 1]; break; }
    const span = Math.max(0.0001, b.t - a.t), alpha = Math.min(1, Math.max(0, (renderTime - a.t) / span));
    return { a, b, alpha };
  }
}

export class ClientPrediction {
  constructor() { this.sequence = 0; this.pending = []; }
  input(payload) { const input = { sequence: ++this.sequence, ...payload }; this.pending.push(input); return input; }
  acknowledge(sequence) { this.pending = this.pending.filter(x => x.sequence > sequence); }
}

export class LocalMultiplayerTransport {
  constructor() { this.socket = null; this.connected = false; this.handlers = new Map(); }
  connect(url) {
    if (!url || !globalThis.WebSocket) return false;
    this.socket = new WebSocket(url);
    this.socket.onopen = () => { this.connected = true; this.emit("open"); };
    this.socket.onclose = () => { this.connected = false; this.emit("close"); };
    this.socket.onmessage = e => { try { const msg = JSON.parse(e.data); this.emit(msg.type, msg); } catch {} };
    return true;
  }
  on(type, fn) { this.handlers.set(type, fn); }
  emit(type, payload) { this.handlers.get(type)?.(payload); }
  send(type, payload = {}) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ v: NET_PROTOCOL, type, ...payload })); }
}
