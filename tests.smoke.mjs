import fs from "node:fs";
import assert from "node:assert/strict";

const required = ["index.html","package.json","src/main.js","src/style.css","README.md","AGENTS.md","QUALITY.md"];
for (const file of required) assert.equal(fs.existsSync(file), true, `${file} missing`);
const pkg = JSON.parse(fs.readFileSync("package.json","utf8"));
assert.equal(pkg.dependencies.three, "0.185.1");
const main = fs.readFileSync("src/main.js","utf8");
for (const token of ["WebGLRenderer","PointerLockControls","EffectComposer","UnrealBloomPass","Raycaster","ACESFilmicToneMapping"]) {
  assert.ok(main.includes(token), `renderer/game token missing: ${token}`);
}
console.log("SMOKE PASS — repository scaffold and core Three.js systems are present.");
