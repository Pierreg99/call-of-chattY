import fs from "node:fs";
import assert from "node:assert/strict";

const required = [
  "index.html", "package.json", "src/main.js", "src/style.css", "README.md",
  "AGENTS.md", "QUALITY.md", "src/systems/physics.js", "src/systems/animation.js",
  "src/net/netcode.js", "server/netcode.mjs"
];
for (const file of required) assert.equal(fs.existsSync(file), true, `${file} missing`);
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert.equal(pkg.dependencies.three, "0.185.1");
assert.ok(pkg.dependencies.ws);
const main = fs.readFileSync("src/main.js", "utf8");
for (const token of [
  "WebGLRenderer", "PointerLockControls", "EffectComposer", "UnrealBloomPass",
  "Raycaster", "ACESFilmicToneMapping", "CapsuleController", "WeaponAnimator",
  "ProjectileTracer", "ClientPrediction"
]) assert.ok(main.includes(token), `core token missing: ${token}`);
const net = fs.readFileSync("src/net/netcode.js", "utf8");
for (const token of ["SnapshotBuffer", "ClientPrediction", "LocalMultiplayerTransport"]) assert.ok(net.includes(token));
console.log("SMOKE PASS — AAA slice, physics/animation systems and multiplayer foundation are present.");
