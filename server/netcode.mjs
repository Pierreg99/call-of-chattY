import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port });
const clients = new Map();
let nextId = 1;

function broadcast(packet, except) {
  const data = JSON.stringify(packet);
  for (const client of clients.values()) if (client.ws !== except && client.ws.readyState === 1) client.ws.send(data);
}

wss.on("connection", ws => {
  const id = String(nextId++);
  clients.set(id, { ws, x: 0, y: 2.2, z: 0, yaw: 0, pitch: 0, sequence: 0 });
  ws.send(JSON.stringify({ v: 1, type: "welcome", id }));
  broadcast({ v: 1, type: "player_join", id }, ws);

  ws.on("message", raw => {
    try {
      const msg = JSON.parse(raw.toString());
      const client = clients.get(id);
      if (!client || msg.v !== 1) return;
      if (msg.type === "input") {
        client.sequence = Number(msg.sequence) || client.sequence;
        client.x = Number(msg.x) || 0;
        client.y = Number(msg.y) || 2.2;
        client.z = Number(msg.z) || 0;
        client.yaw = Number(msg.yaw) || 0;
        client.pitch = Number(msg.pitch) || 0;
      }
      if (msg.type === "fire") broadcast({ v: 1, type: "fire", id, sequence: client.sequence }, ws);
    } catch {}
  });

  ws.on("close", () => { clients.delete(id); broadcast({ v: 1, type: "player_leave", id }); });
});

setInterval(() => {
  const players = [...clients.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, sequence: p.sequence }));
  broadcast({ v: 1, type: "snapshot", t: Date.now(), players });
}, 50);

console.log(`Call of chattY authoritative relay listening on ws://localhost:${port}`);
