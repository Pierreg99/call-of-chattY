import fs from "node:fs";
import assert from "node:assert/strict";

const required = [
  "index.html", "package.json", "src/main.js", "src/style.css", "README.md",
  "AGENTS.md", "QUALITY.md", "src/systems/physics.js", "src/systems/animation.js",
  "src/systems/audio.js", "src/systems/director.js", "src/systems/vfx.js",
  "src/systems/performance.js", "src/net/netcode.js", "src/aaa-runtime.js", "server/netcode.mjs"
];
for (const file of required) assert.equal(fs.existsSync(file), true, `${file} missing`);

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert.equal(pkg.version, "0.3.1");
assert.equal(pkg.dependencies.three, "0.185.1");
assert.ok(pkg.dependencies.ws);
assert.ok(pkg.scripts.check.includes("src/systems/performance.js"));

const main = fs.readFileSync("src/main.js", "utf8");
for (const token of [
  "WebGLRenderer", "PointerLockControls", "EffectComposer", "UnrealBloomPass",
  "Raycaster", "ACESFilmicToneMapping", "CapsuleController", "WeaponAnimator",
  "ProjectileTracer", "ClientPrediction"
]) assert.ok(main.includes(token), `core token missing: ${token}`);

const perf = fs.readFileSync("src/systems/performance.js", "utf8");
for (const token of ["PerformanceTelemetry", "PerformanceObserver", "p95FrameMs", "droppedFrameRatio"]) {
  assert.ok(perf.includes(token), `telemetry token missing: ${token}`);
}

const clientNet = fs.readFileSync("src/net/netcode.js", "utf8");
for (const token of ["MAX_SERVER_MESSAGE_BYTES", "reconnect", "rttMs", "protocol_error"]) {
  assert.ok(clientNet.includes(token), `network hardening token missing: ${token}`);
}

const serverNet = fs.readFileSync("server/netcode.mjs", "utf8");
for (const token of ["MAX_PLAYERS", "MAX_MESSAGES_PER_SECOND", "FIRE_COOLDOWN_MS", "ROOM_FULL", "RATE_LIMIT"]) {
  assert.ok(serverNet.includes(token), `server hardening token missing: ${token}`);
}

for (const file of ["src/systems/audio.js", "src/systems/director.js", "src/systems/vfx.js", "src/aaa-runtime.js", "server/netcode.mjs"]) {
  assert.ok(fs.readFileSync(file, "utf8").length > 200, `${file} is unexpectedly small`);
}

const index = fs.readFileSync("index.html", "utf8");
assert.ok(index.includes("/src/aaa-runtime.js"), "AAA runtime is not loaded");

const gitmodules = fs.readFileSync(".gitmodules", "utf8");
for (const repo of ["call-of-groky", "call-of-boty", "futuristic-call-of-shooty"]) {
  assert.ok(gitmodules.includes(repo), `${repo} submodule missing`);
}

console.log("SMOKE PASS — runtime telemetry, network hardening, rendering, combat and merged-source wiring are present.");
