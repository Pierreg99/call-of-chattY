import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8787);
const TICK_MS = 50;
const MAX_PLAYERS = 24;
const MAX_MESSAGES_PER_SECOND = 120;
const FIRE_COOLDOWN_MS = 90;
const rooms = new Map([["cold-front", new Map()]]);
let nextId = 1;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const int = (value, fallback = 0) => Math.trunc(finite(value, fallback));

function packet(type, payload = {}) {
  return JSON.stringify({ v: 1, type, ...payload });
}

function send(ws, type, payload = {}) {
  if (ws.readyState === 1) ws.send(packet(type, payload));
}

function broadcast(room, type, payload = {}, except = null) {
  const data = packet(type, payload);
  for (const player of room.values()) {
    if (player.ws !== except && player.ws.readyState === 1) player.ws.send(data);
  }
}

function snapshot(room) {
  return [...room.values()].map(({ ws, rate, ...player }) => player);
}

function validInput(msg) {
  return msg && typeof msg === "object" && msg.v === 1 && typeof msg.type === "string";
}

function allowMessage(player) {
  const now = Date.now();
  if (now - player.rate.windowStart >= 1000) {
    player.rate.windowStart = now;
    player.rate.count = 0;
  }
  player.rate.count += 1;
  return player.rate.count <= MAX_MESSAGES_PER_SECOND;
}

const wss = new WebSocketServer({ port: PORT, maxPayload: 8192, perMessageDeflate: false });

wss.on("connection", (ws) => {
  const room = rooms.get("cold-front");
  if (room.size >= MAX_PLAYERS) {
    send(ws, "error", { code: "ROOM_FULL" });
    ws.close(1013, "Room full");
    return;
  }

  const id = String(nextId++);
  const player = {
    id,
    ws,
    x: 0,
    y: 2.2,
    z: 8,
    yaw: 0,
    pitch: 0,
    sequence: 0,
    input: { x: 0, z: 0, sprint: false },
    lastFireAt: 0,
    rate: { count: 0, windowStart: Date.now() },
  };
  room.set(id, player);

  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  send(ws, "welcome", { id, roomId: "cold-front", tick: 20 });
  broadcast(room, "player_join", { id }, ws);

  ws.on("message", (raw) => {
    if (!allowMessage(player)) {
      send(ws, "error", { code: "RATE_LIMIT" });
      return;
    }

    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!validInput(msg)) return;

    if (msg.type === "input") {
      const sequence = int(msg.sequence, 0);
      if (sequence <= player.sequence || sequence - player.sequence > MAX_MESSAGES_PER_SECOND) return;
      player.sequence = sequence;
      player.input.x = clamp(finite(msg.x), -1, 1);
      player.input.z = clamp(finite(msg.z), -1, 1);
      player.input.sprint = Boolean(msg.sprint);
    } else if (msg.type === "look") {
      player.yaw = clamp(finite(msg.yaw), -Math.PI * 4, Math.PI * 4);
      player.pitch = clamp(finite(msg.pitch), -Math.PI / 2, Math.PI / 2);
    } else if (msg.type === "fire") {
      const now = Date.now();
      if (now - player.lastFireAt < FIRE_COOLDOWN_MS) return;
      player.lastFireAt = now;
      broadcast(room, "fire", { id, sequence: player.sequence }, ws);
    } else if (msg.type === "ping") {
      send(ws, "pong", { t: int(msg.t, Date.now()) });
    }
  });

  ws.on("close", () => {
    room.delete(id);
    broadcast(room, "player_leave", { id });
  });
});

const heartbeat = setInterval(() => {
  for (const room of rooms.values()) {
    for (const player of room.values()) {
      if (player.ws.isAlive === false) {
        player.ws.terminate();
        continue;
      }
      player.ws.isAlive = false;
      player.ws.ping();
    }
  }
}, 30000);

const tick = setInterval(() => {
  for (const room of rooms.values()) {
    for (const player of room.values()) {
      const speed = player.input.sprint ? 9 : 5.5;
      const dt = TICK_MS / 1000;
      player.x = clamp(player.x + player.input.x * speed * dt, -88, 88);
      player.z = clamp(player.z + player.input.z * speed * dt, -88, 88);
    }
    if (room.size) broadcast(room, "snapshot", { serverTime: Date.now(), players: snapshot(room) });
  }
}, TICK_MS);

function shutdown() {
  clearInterval(heartbeat);
  clearInterval(tick);
  wss.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Call of chattY netcode listening on ws://localhost:${PORT} (max ${MAX_PLAYERS})`);
