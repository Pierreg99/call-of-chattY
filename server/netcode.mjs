import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8787);
const TICK_MS = 50;
const rooms = new Map([["cold-front", new Map()]]);
let nextId = 1;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function send(ws, packet) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ v: 1, ...packet }));
}
function broadcast(room, packet, except = null) {
  const payload = JSON.stringify({ v: 1, ...packet });
  for (const player of room.values()) if (player.ws !== except && player.ws.readyState === 1) player.ws.send(payload);
}
function snapshot(room) {
  return [...room.values()].map(({ ws, ...player }) => player);
}

const wss = new WebSocketServer({ port: PORT, maxPayload: 8192 });
wss.on("connection", (ws) => {
  const id = String(nextId++);
  const room = rooms.get("cold-front");
  const player = { id, ws, x: 0, y: 2.2, z: 8, yaw: 0, pitch: 0, sequence: 0, input: { x: 0, z: 0, sprint: false } };
  room.set(id, player);
  send(ws, { type: "welcome", id, roomId: "cold-front", tick: 20 });
  broadcast(room, { type: "player_join", id }, ws);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg?.v !== 1) return;
    if (msg.type === "input") {
      const sequence = Math.trunc(finite(msg.sequence, 0));
      if (sequence <= player.sequence) return;
      player.sequence = sequence;
      player.input.x = clamp(finite(msg.x), -1, 1);
      player.input.z = clamp(finite(msg.z), -1, 1);
      player.input.sprint = Boolean(msg.sprint);
    } else if (msg.type === "look") {
      player.yaw = clamp(finite(msg.yaw), -Math.PI * 4, Math.PI * 4);
      player.pitch = clamp(finite(msg.pitch), -Math.PI / 2, Math.PI / 2);
    } else if (msg.type === "fire") {
      broadcast(room, { type: "fire", id, sequence: player.sequence }, ws);
    }
  });

  ws.on("close", () => { room.delete(id); broadcast(room, { type: "player_leave", id }); });
});

setInterval(() => {
  for (const room of rooms.values()) {
    for (const player of room.values()) {
      const speed = player.input.sprint ? 9 : 5.5;
      const dt = TICK_MS / 1000;
      player.x = clamp(player.x + player.input.x * speed * dt, -88, 88);
      player.z = clamp(player.z + player.input.z * speed * dt, -88, 88);
    }
    if (room.size) broadcast(room, { type: "snapshot", serverTime: Date.now(), players: snapshot(room) });
  }
}, TICK_MS);

console.log(`Call of chattY netcode listening on ws://localhost:${PORT}`);
