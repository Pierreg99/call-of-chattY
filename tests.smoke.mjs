import fs from "node:fs";
import assert from "node:assert/strict";

const required = [
  "index.html", "package.json", "src/main.js", "src/style.css", "README.md",
  "AGENTS.md", "QUALITY.md", "src/systems/physics.js", "src/systems/animation.js",
  "src/systems/audio.js", "src/systems/director.js", "src/systems/vfx.js",
  "src/net/netcode.js", "src/aaa-runtime.js", "server/netcode.mjs"
];
for (const file of required) assert.equal(fs.existsSync(file), true, `${file} missing`);

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
assert.equal(pkg.version, "0.3.0");
assert.equal(pkg.dependencies.three, "0.185.1");
assert.ok(pkg.dependencies.ws);

const main = fs.readFileSync("src/main.js", "utf8");
for (const token of [
  "WebGLRenderer", "PointerLockControls", "EffectComposer", "UnrealBloomPass",
  "Raycaster", "ACESFilmicToneMapping", "CapsuleController", "WeaponAnimator",
  "ProjectileTracer", "ClientPrediction"
]) assert.ok(main.includes(token), `core token missing: ${token}`);

for (const file of ["src/systems/audio.js", "src/systems/director.js", "src/systems/vfx.js", "src/aaa-runtime.js", "server/netcode.mjs"]) {
  assert.ok(fs.readFileSync(file, "utf8").length > 200, `${file} is unexpectedly small`);
}

const index = fs.readFileSync("index.html", "utf8");
assert.ok(index.includes("/src/aaa-runtime.js"), "AAA runtime is not loaded");

console.log("SMOKE PASS — rendering, combat, feedback, accessibility runtime and networking scaffolds are present.");
