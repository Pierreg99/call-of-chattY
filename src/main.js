import * as THREE from "three";
import { Raycaster } from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { Sky } from "three/addons/objects/Sky.js";

import "./style.css";
import { PhysicsWorld, CapsuleController, ProjectileTracer } from "./systems/physics.js";
import { WeaponAnimator, animateEnemyRig } from "./systems/animation.js";
import { TacticalAudio } from "./systems/audio.js";
import { CombatDirector, scoreMultiplier, AI_STATES } from "./systems/director.js";
import { CombatVFX } from "./systems/vfx.js";
import { SpringDamper3D, WeaponKinetics } from "./systems/kinetics.js";
import { WeaponManager, buildWeaponMesh, WEAPON_CONFIGS, WEAPON_TYPES } from "./systems/weapons.js";
import { InputManager } from "./systems/input.js";
import { ClientPrediction } from "./net/netcode.js";
import { KillstreakManager, KILLSTREAK_TYPES } from "./systems/killstreaks.js";

const CFG = Object.freeze({
  world: 180,
  gravity: 24,
  walk: 8.5,
  sprint: 14.5,
  jump: 8.2,
  enemyCount: 16,
  maxFrame: 0.05,
});

const state = {
  running: false,
  paused: false,
  health: 100,
  stamina: 100,
  score: 0,
  streak: 0,
  wave: 1,
  shots: 0,
  hits: 0,
  elapsed: 0,
  damageFlash: 0,
  hitMarkerT: 0,
  nvg: false,
};

const clock = new THREE.Clock();
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// 1. WebGL Renderer with ACES Tone Mapping & PBR pipeline
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// SafeMode WebGL context restoration
renderer.domElement.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  state.paused = true;
});
renderer.domElement.addEventListener("webglcontextrestored", () => {
  state.paused = false;
});

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060c0d);
scene.fog = new THREE.FogExp2(0x091414, 0.0095);

const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 450);
camera.position.set(0, 2.2, 12);
scene.add(camera);

const controls = new PointerLockControls(camera, renderer.domElement);
controls.minPolarAngle = 0.2;
controls.maxPolarAngle = Math.PI - 0.2;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.24, 0.45, 0.82);
composer.addPass(bloom);

// 2. Client Prediction for Netcode Hardening
const clientPrediction = new ClientPrediction(128);

// 3. Procedural Sobel PBR Texturing (512x512 with Wet Reflections & AO)
function createProceduralSobelPBR() {
  const size = 512;
  const cvH = document.createElement("canvas");
  cvH.width = cvH.height = size;
  const ctxH = cvH.getContext("2d");
  ctxH.fillStyle = "#808080";
  ctxH.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 64) {
    for (let y = 0; y < size; y += 64) {
      ctxH.fillStyle = "#a8a8a8";
      ctxH.fillRect(x + 2, y + 2, 60, 60);
      ctxH.fillStyle = "#c0c0c0";
      ctxH.fillRect(x + 6, y + 6, 52, 52);
      ctxH.fillStyle = "#ffffff";
      ctxH.fillRect(x + 5, y + 5, 3, 3);
      ctxH.fillRect(x + 56, y + 5, 3, 3);
      ctxH.fillRect(x + 5, y + 56, 3, 3);
      ctxH.fillRect(x + 56, y + 56, 3, 3);
      ctxH.fillStyle = "#181818";
      ctxH.fillRect(x, y, size, 2);
      ctxH.fillRect(x, y, 2, size);
    }
  }

  const hImg = ctxH.getImageData(0, 0, size, size);
  const hData = hImg.data;
  for (let i = 0; i < hData.length; i += 4) {
    const noise = (Math.random() - 0.5) * 12;
    hData[i] = clamp(hData[i] + noise, 0, 255);
    hData[i + 1] = clamp(hData[i + 1] + noise, 0, 255);
    hData[i + 2] = clamp(hData[i + 2] + noise, 0, 255);
  }
  ctxH.putImageData(hImg, 0, 0);

  const cvN = document.createElement("canvas");
  cvN.width = cvN.height = size;
  const ctxN = cvN.getContext("2d");
  const nImg = ctxN.createImageData(size, size);
  const nData = nImg.data;
  const getH = (px, py) => hData[(((py + size) % size) * size + ((px + size) % size)) * 4] / 255.0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dX =
        getH(x + 1, y - 1) + 2 * getH(x + 1, y) + getH(x + 1, y + 1) -
        (getH(x - 1, y - 1) + 2 * getH(x - 1, y) + getH(x - 1, y + 1));
      const dY =
        getH(x - 1, y + 1) + 2 * getH(x, y + 1) + getH(x + 1, y + 1) -
        (getH(x - 1, y - 1) + 2 * getH(x, y - 1) + getH(x + 1, y - 1));

      const strength = 3.8;
      const nx = -dX * strength;
      const ny = -dY * strength;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      nData[idx] = Math.floor(((nx / len) * 0.5 + 0.5) * 255);
      nData[idx + 1] = Math.floor(((ny / len) * 0.5 + 0.5) * 255);
      nData[idx + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
      nData[idx + 3] = 255;
    }
  }
  ctxN.putImageData(nImg, 0, 0);

  const cvR = document.createElement("canvas");
  cvR.width = cvR.height = size;
  const ctxR = cvR.getContext("2d");
  ctxR.fillStyle = "#b8b8b8";
  ctxR.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 64) {
    ctxR.fillStyle = "#dedede";
    ctxR.fillRect(x, 0, 2, size);
    ctxR.fillRect(0, x, size, 2);
  }

  // Specular wet reflective puddle masks (roughness ~0.05)
  ctxR.fillStyle = "#0c0c0c";
  for (let p = 0; p < 7; p++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const pr = 22 + Math.random() * 40;
    ctxR.beginPath();
    ctxR.arc(px, py, pr, 0, Math.PI * 2);
    ctxR.fill();
  }

  const cvAO = document.createElement("canvas");
  cvAO.width = cvAO.height = size;
  const ctxAO = cvAO.getContext("2d");
  ctxAO.fillStyle = "#ffffff";
  ctxAO.fillRect(0, 0, size, size);
  ctxAO.fillStyle = "#484848";
  for (let x = 0; x < size; x += 64) {
    ctxAO.fillRect(x, 0, 2, size);
    ctxAO.fillRect(0, x, size, 2);
  }

  const cvD = document.createElement("canvas");
  cvD.width = cvD.height = size;
  const ctxD = cvD.getContext("2d");
  ctxD.fillStyle = "#1e282a";
  ctxD.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 64) {
    for (let y = 0; y < size; y += 64) {
      ctxD.fillStyle = "#253435";
      ctxD.fillRect(x + 2, y + 2, 60, 60);
      ctxD.strokeStyle = "rgba(34, 211, 238, 0.16)";
      ctxD.strokeRect(x + 2, y + 2, 60, 60);
    }
  }

  const diffTex = new THREE.CanvasTexture(cvD);
  const normalTex = new THREE.CanvasTexture(cvN);
  const roughnessTex = new THREE.CanvasTexture(cvR);
  const aoTex = new THREE.CanvasTexture(cvAO);
  [diffTex, normalTex, roughnessTex, aoTex].forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  });
  return { diffTex, normalTex, roughnessTex, aoTex };
}

const sobelMaps = createProceduralSobelPBR();

function makeTex(base, accent = "") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) {
    const g = (Math.random() * 255) | 0;
    x.fillStyle = `rgba(${g},${g},${g},${0.04 + Math.random() * 0.1})`;
    x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 4, 1 + Math.random() * 4);
  }
  if (accent) {
    x.strokeStyle = accent;
    x.globalAlpha = 0.16;
    for (let y = 0; y < 128; y += 16) {
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(128, y + 8);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}

const texGround = makeTex("#2c3c37", "#a6bfb3");
const texMetal = makeTex("#1d2325", "#809a94");
const texConcrete = makeTex("#5d635c", "#9ea6a0");

function mat(color, rough = 0.72, metal = 0, map = null, normalMap = null, roughnessMap = null, aoMap = null) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    map,
    normalMap,
    normalScale: normalMap ? new THREE.Vector2(1.2, 1.2) : null,
    roughnessMap,
    aoMap,
    aoMapIntensity: aoMap ? 1.0 : 0,
  });
}

const mats = {
  ground: mat(0x56665d, 0.85, 0.05, texGround, null, sobelMaps.roughnessTex, sobelMaps.aoTex),
  concrete: mat(0x6f726a, 0.80, 0.1, texConcrete, null, sobelMaps.roughnessTex),
  metal: mat(0x283133, 0.45, 0.85, sobelMaps.diffTex, sobelMaps.normalTex, sobelMaps.roughnessTex, sobelMaps.aoTex),
  dark: mat(0x101517, 0.42, 0.88, sobelMaps.diffTex, sobelMaps.normalTex, sobelMaps.roughnessTex, sobelMaps.aoTex),
  rubber: mat(0x090b0c, 1, 0),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x7fb4ab,
    roughness: 0.08,
    metalness: 0.15,
    transmission: 0.35,
    transparent: true,
    opacity: 0.8,
  }),
  red: new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.4,
    metalness: 0.3,
    emissive: 0x881111,
    emissiveIntensity: 0.6,
  }),
  light: new THREE.MeshStandardMaterial({
    color: 0xe7f7ed,
    emissive: 0xb6ffe2,
    emissiveIntensity: 4.5,
  }),
};

// 4. Responsive Dual-Mode HUD DOM
document.querySelector("#app").innerHTML = `
<div id="hud">
  <div id="tactical-compass">
    <div id="compass-bearing">000° N</div>
    <div id="compass-tape-window">
      <div id="compass-needle"></div>
      <div id="compass-tape"></div>
    </div>
  </div>
  <div id="topbar">
    <div id="radar-panel">
      <div id="radar-sweep"></div>
      <div id="radar-center"></div>
      <div id="radar-blips"></div>
    </div>
    <div class="panel"><div class="kicker">OPERATION</div><div class="value">COLD FRONT</div></div>
    <div class="panel"><div class="kicker">WAVE / ENEMIES</div><div class="value" id="waveInfo">WAVE 1 (16)</div></div>
    <div class="panel"><div class="kicker">SCORE / STREAK</div><div class="value"><span id="score">000000</span> <span style="font-size:14px;color:#f59e0b" id="streakDisplay">x0</span></div></div>
    <div class="panel"><div class="kicker">TELEMETRY</div><div class="value" id="perf">— FPS</div></div>
  </div>
  <div id="reticle">
    <div class="reticle-dot"></div>
    <div class="reticle-bar reticle-top"></div>
    <div class="reticle-bar reticle-bottom"></div>
    <div class="reticle-bar reticle-left"></div>
    <div class="reticle-bar reticle-right"></div>
  </div>
  <div id="hitmarker"></div>
  <div id="sniper-scope"></div>
  <div id="nvg-overlay"></div>
  <div id="low-health-vignette"></div>
  <div id="damage-arcs"><div class="damage-arc" id="damage-arc"></div></div>
  <div id="killfeed"></div>
  <div id="crosshairHint">LMB / TOUCH FIRE · RMB / ADS · 1-6 WEAPONS · 7/U UAV · 8/J STRIKE · N NVG · I INSPECT · C SLIDE</div>
  <div id="vitals" class="panel">
    <div class="kicker">SYSTEMS / HEALTH</div>
    <div class="value"><span id="health">100</span>%</div>
    <div class="meter"><i id="healthbar"></i></div>
    <div class="meter stamina" style="margin-top:4px"><i id="staminabar"></i></div>
  </div>
  <div id="ammo" class="panel">
    <div class="kicker" id="weaponName">CARBINE / 5.56</div>
    <div><span class="value" id="ammoNow">30</span><span class="reserve" id="ammoReserve"> / 150</span></div>
    <div id="weapon-slots">
      <div class="slot active" id="slot-0">1 CARBINE</div>
      <div class="slot" id="slot-1">2 SHOTGUN</div>
      <div class="slot" id="slot-2">3 SNIPER</div>
      <div class="slot" id="slot-3">4 FRAG</div>
      <div class="slot" id="slot-4">5 AKIMBO</div>
      <div class="slot" id="slot-5">6 RPG-7</div>
    </div>
    <div id="killstreaks-hud">
      <div class="streak-badge" id="streak-uav">UAV [3]</div>
      <div class="streak-badge" id="streak-airstrike">STRIKE [5]</div>
      <div class="nvg-badge" id="badge-nvg">NVG [N]</div>
    </div>
  </div>
  <div id="damage"></div>
  <div id="prompt"></div>
  <div id="toast"></div>
  <div id="debug"></div>
  <!-- Mobile Touch Controls Layer -->
  <div id="touch-controls-layer">
    <div id="joystick-zone">
      <div id="joystick-thumb"></div>
    </div>
    <div id="touch-look-zone"></div>
    <div class="touch-btn-cluster">
      <button class="touch-action-btn" id="touch-btn-jump">JUMP</button>
      <button class="touch-action-btn" id="touch-btn-ads">ADS</button>
      <button class="touch-action-btn" id="touch-btn-inspect">INSP</button>
      <button class="touch-action-btn" id="touch-btn-slide">SLIDE</button>
      <button class="touch-action-btn btn-tactical" id="touch-btn-uav">UAV</button>
      <button class="touch-action-btn" id="touch-btn-sprint">SPRINT</button>
      <button class="touch-action-btn" id="touch-btn-reload">RELOAD</button>
      <button class="touch-action-btn" id="touch-btn-swap">SWAP</button>
      <button class="touch-action-btn btn-nvg" id="touch-btn-nvg">NVG</button>
      <button class="touch-action-btn btn-fire" id="touch-btn-fire">FIRE</button>
    </div>
  </div>
  <div id="start">
    <div class="card">
      <h1>Call of<br>chattY</h1>
      <p>Unified AAA WebGL tactical combat engine. Powered by Cannon-es 60Hz rigid body physics, 2nd-order harmonic spring kinetics, procedural WebAudio synth, multi-weapon arsenal, and adaptive mobile touch controls.</p>
      <button id="deploy">DEPLOY OPERATION</button>
      <div class="meta">
        <span>THREE.JS ${THREE.REVISION}</span>
        <span>CANNON-ES 60HZ</span>
        <span>SPRING KINETICS</span>
        <span>PROCEDURAL AUDIO</span>
      </div>
    </div>
  </div>
</div>`;

// 5. Cannon-es Physics World & Procedural Arena
const physicsWorld = new PhysicsWorld({ gravity: -24 });
physicsWorld.addGroundPlane();

const staticColliders = [];
function box(name, size, pos, material, cast = false, isDynamic = false) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  m.name = name;
  m.position.set(...pos);
  m.castShadow = cast;
  m.receiveShadow = true;
  scene.add(m);

  const s = new THREE.Vector3(...size);
  const p = new THREE.Vector3(...pos);
  if (isDynamic) {
    physicsWorld.addDynamicCoverBlock(m, s, p, 25);
  } else {
    physicsWorld.addStaticBox(m, s, p);
    staticColliders.push(m);
  }
  return m;
}

function buildWorld() {
  const floor = box("terrain", [CFG.world, 0.8, CFG.world], [0, -0.4, 0], mats.ground, false);
  floor.material.map.repeat.set(28, 28);

  // Procedural cover blocks and defensive structures
  for (let i = 0; i < 56; i++) {
    const x = (Math.random() - 0.5) * 150;
    const z = (Math.random() - 0.5) * 150;
    if (Math.hypot(x, z) < 16) {
      i--;
      continue;
    }
    const sx = 3 + Math.random() * 6;
    const sy = 1.6 + Math.random() * 3.5;
    const sz = 3 + Math.random() * 6;
    const isDyn = Math.random() < 0.28; // Dynamic rigid body cover
    if (Math.random() < 0.7) {
      box(`cover_${i}`, [sx, sy, sz], [x, sy / 2, z], Math.random() < 0.5 ? mats.concrete : mats.metal, true, isDyn);
    } else {
      const h = 5 + Math.random() * 8;
      box(`tower_${i}`, [sx * 0.75, h, sz * 0.75], [x, h / 2, z], mats.dark, true, false);
      box(`light_${i}`, [0.2, 0.2, 2], [x + 0.01, h * 0.75, z], mats.light, false, false);
    }
  }

  for (let i = 0; i < 12; i++) {
    const x = -62 + i * 11;
    box(`barrier_${i}`, [8, 0.8, 1], [x, 0.5, 14], mats.metal, true, false);
    box(`barrier2_${i}`, [8, 0.8, 1], [x, 0.5, -14], mats.metal, true, false);
  }
}
buildWorld();

// Lighting & Sky Dome
const sky = new Sky();
sky.scale.setScalar(450);
scene.add(sky);
sky.material.uniforms.turbidity.value = 4.6;
sky.material.uniforms.rayleigh.value = 1.4;
sky.material.uniforms.mieCoefficient.value = 0.008;
sky.material.uniforms.mieDirectionalG.value = 0.84;
sky.material.uniforms.sunPosition.value.set(-70, 55, -70);

scene.add(new THREE.HemisphereLight(0xacc7bf, 0x111615, 0.62));
const keyLight = new THREE.DirectionalLight(0xd7eee4, 4.2);
keyLight.position.set(-48, 72, -36);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -85;
keyLight.shadow.camera.right = 85;
keyLight.shadow.camera.top = 85;
keyLight.shadow.camera.bottom = -85;
keyLight.shadow.bias = -0.00012;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x7ba4ff, 1.2);
rimLight.position.set(70, 24, 50);
scene.add(rimLight);

// 6. Subsystems Initialization
const audio = new TacticalAudio();
const kinetics = new WeaponKinetics();
const weaponManager = new WeaponManager(camera, mats, audio, kinetics);
const weaponAnimator = new WeaponAnimator(weaponManager.viewmodelRoot, kinetics);
const tracerPool = new ProjectileTracer(scene);
const combatVFX = new CombatVFX(scene, camera);

// Tactical Compass Ribbon Initialization
function initCompassTape() {
  const tape = $("compass-tape");
  if (!tape) return;
  const cardinals = {
    0: "N",
    45: "NE",
    90: "E",
    135: "SE",
    180: "S",
    225: "SW",
    270: "W",
    315: "NW",
  };
  let html = "";
  for (let cycle = -1; cycle <= 1; cycle++) {
    for (let deg = 0; deg < 360; deg += 15) {
      const isCard = cardinals[deg] !== undefined;
      const text = isCard ? cardinals[deg] : deg.toString();
      html += `<span class="compass-tick ${isCard ? "cardinal" : ""}">${text}</span>`;
    }
  }
  tape.innerHTML = html;
}
initCompassTape();

function updateCompass(yawRad) {
  const bearingEl = $("compass-bearing");
  const tape = $("compass-tape");
  if (!bearingEl || !tape) return;

  let deg = (-yawRad * (180 / Math.PI)) % 360;
  if (deg < 0) deg += 360;

  const cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const cardIndex = Math.round(deg / 45) % 8;
  bearingEl.textContent = `${Math.round(deg).toString().padStart(3, "0")}° ${cardinals[cardIndex]}`;

  const offsetPx = (deg * 2.4) + 864;
  tape.style.transform = `translateX(-${offsetPx}px)`;
}

function registerKillfeed(actor, weapon, target, isHeadshot = false) {
  const feed = $("killfeed");
  if (!feed) return;
  const entry = document.createElement("div");
  entry.className = `killfeed-entry ${isHeadshot ? "headshot" : ""}`;
  entry.innerHTML = `
    <span class="kf-actor">${actor}</span>
    <span class="kf-weapon">[${weapon}]</span>
    <span class="kf-target">${target}</span>
    ${isHeadshot ? '<span class="kf-crit">CRIT</span>' : ""}
  `;
  feed.appendChild(entry);
  while (feed.children.length > 5) {
    feed.removeChild(feed.firstChild);
  }
  setTimeout(() => {
    if (entry.parentNode === feed) {
      feed.removeChild(entry);
    }
  }, 4500);
}

let damageArcTimer = 0;
function showDamageArc(sourcePos) {
  const arc = $("damage-arc");
  if (!arc) return;

  const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  camFwd.y = 0;
  camFwd.normalize();

  const toSource = new THREE.Vector3().subVectors(sourcePos, camera.position);
  toSource.y = 0;
  toSource.normalize();

  const angle = Math.atan2(
    toSource.x * camFwd.z - toSource.z * camFwd.x,
    camFwd.x * toSource.x + camFwd.z * toSource.z
  );

  arc.style.transform = `rotate(${angle}rad)`;
  arc.style.opacity = "1";
  damageArcTimer = 0.55;
}

const killstreakManager = new KillstreakManager({
  audio,
  kinetics,
  onToast: (msg) => toast(msg),
  onStreakEarned: (type, streak) => {
    state.score += 250;
  },
  onAirstrikeImpact: (pos, radius) => {
    combatVFX.spawnExplosion(pos, radius || 8.0, 0xff3311);
    audio.explosion(pos);
    kinetics.addTrauma(0.85);
  },
});

function toggleNightVision(force = null) {
  state.nvg = force !== null ? force : !state.nvg;
  audio.playNightVisionToggle(state.nvg);

  const overlay = $("nvg-overlay");
  const canvas = renderer.domElement;

  if (state.nvg) {
    overlay?.classList.add("active");
    canvas?.classList.add("nvg-active");
    scene.fog.color.setHex(0x041810);
    scene.background.setHex(0x020d09);
    toast("NIGHT VISION OPTICS ENGAGED");
  } else {
    overlay?.classList.remove("active");
    canvas?.classList.remove("nvg-active");
    scene.fog.color.setHex(0x091414);
    scene.background.setHex(0x060c0d);
    toast("NIGHT VISION OPTICS DISENGAGED");
  }
}

const player = new CapsuleController(camera, {
  radius: 0.42,
  height: 1.8,
  eye: 2.2,
  gravity: CFG.gravity,
});
player.bindPhysics(physicsWorld);

const inputManager = new InputManager({
  domElement: renderer.domElement,
  controls,
  onWeaponSelect: (idx) => weaponManager.selectWeapon(idx),
});

// 7. Robotic AI Combatants & Director
const enemies = [];
class RoboticCombatant {
  constructor(pos, id) {
    this.id = id;
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.hp = 100;
    this.alive = true;
    this.seed = Math.random() * 100;
    this.fsmState = AI_STATES.PATROL;
    this.group.userData.enemy = true;

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.0, 5, 10), mat(0x283032, 0.85, 0.1));
    body.position.y = 1.1;
    body.castShadow = true;
    this.group.add(body);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.16), mats.metal);
    plate.position.set(0, 1.28, 0.35);
    plate.castShadow = true;
    this.group.add(plate);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mats.dark);
    head.position.y = 2.05;
    head.castShadow = true;
    this.group.add(head);

    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.04), mats.red);
    eye.position.set(0, 2.07, 0.26);
    this.group.add(eye);

    scene.add(this.group);
  }

  takeDamage(d, hitPoint, isHeadshot = false) {
    if (!this.alive) return;
    this.hp -= d;
    state.hits++;
    state.hitMarkerT = 0.16;

    const hm = $("hitmarker");
    if (hm) {
      hm.className = isHeadshot ? "hit-headshot show" : "show";
    }

    if (isHeadshot) {
      audio.hit();
    } else {
      audio.hit();
    }

    if (hitPoint) {
      spawnParticles(hitPoint, isHeadshot ? 0xf59e0b : 0xffe484, 10);
    }

    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
      state.streak++;
      killstreakManager.registerKill();
      const gained = scoreMultiplier({ kill: true, streak: state.streak });
      state.score += gained;
      audio.kill();
      if (hm) {
        hm.className = "hit-kill show";
      }
      combatVFX.spawnExplosion(this.group.position, 2.5, 0xef4444);
      registerKillfeed("OPERATOR", weaponManager.getCurrentWeapon().name, `ROBOT-${this.id + 1}`, isHeadshot);
      toast(`KILL CONFIRMED +${gained}${isHeadshot ? " (HEADSHOT)" : ""}`);
    }
  }

  update(dt) {
    if (!this.alive) return;
    animateEnemyRig(this.group, state.elapsed, this.seed);
  }
}

function spawnWave(waveNum) {
  enemies.forEach((e) => scene.remove(e.group));
  enemies.length = 0;
  const count = CFG.enemyCount + (waveNum - 1) * 4;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 32 + Math.random() * 45;
    enemies.push(new RoboticCombatant(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), i));
  }
  director.setEnemies(enemies);
  toast(`WAVE ${waveNum} ENGAGED`);
}

const director = new CombatDirector({
  enemies,
  coverObjects: staticColliders,
  onWave: (w) => {
    state.wave = w;
  },
  onVictory: (w) => {
    toast(`WAVE ${w} CLEARED! PREPARE FOR NEXT WAVE`);
    setTimeout(() => director.nextWave(spawnWave), 2500);
  },
  onEnemyFire: (enemy, playerPos) => {
    // Enemy weapon discharge towards player
    const muzzle = enemy.group.position.clone();
    muzzle.y += 1.3;
    combatVFX.spawnTracer(muzzle, playerPos, 0xef4444, 320);
    audio.fireCarbine(muzzle);

    // Near-miss flyby check
    const toPlayer = new THREE.Vector3().subVectors(playerPos, muzzle);
    if (toPlayer.length() < 35 && Math.random() < 0.45) {
      audio.bulletFlyby(playerPos);
    }

    // Hit probability based on director difficulty
    if (Math.random() < 0.28 * director.difficulty) {
      const dmg = Math.round(6 + Math.random() * 8);
      state.health = clamp(state.health - dmg, 0, 100);
      state.damageFlash = 0.65;
      audio.damage();
      kinetics.addTrauma(0.24);
      showDamageArc(enemy.group.position);
      combatVFX.spawnImpact(playerPos, new THREE.Vector3(0, 1, 0), "enemy");
      if (state.health <= 0) {
        state.streak = 0;
        killstreakManager.resetOnDeath();
        audio.death();
        toast("OPERATOR DOWN");
      }
    }
  },
});
spawnWave(1);

// 8. Particles & Grenades Simulation
const particles = [];
function spawnParticles(pos, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.025 + Math.random() * 0.045, 6, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    p.position.copy(pos);
    p.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      Math.random() * 7,
      (Math.random() - 0.5) * 8
    );
    p.life = 0.25 + Math.random() * 0.45;
    p.max = p.life;
    scene.add(p);
    particles.push(p);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.velocity.y -= 14 * dt;
    p.position.addScaledVector(p.velocity, dt);
    p.material.opacity = clamp(p.life / p.max, 0, 1);
    if (p.life <= 0) {
      scene.remove(p);
      p.material.dispose();
      particles.splice(i, 1);
    }
  }
}

const activeGrenades = [];
function spawnGrenade(pos, velocity, damage, radius) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mats.red);
  mesh.position.copy(pos);
  scene.add(mesh);

  const body = physicsWorld.spawnPhysicsGrenade(pos, velocity, 0.12);
  physicsWorld.meshes.set(body, mesh);

  activeGrenades.push({
    mesh,
    body,
    timer: 1.8,
    damage,
    radius,
  });
}

function updateGrenades(dt) {
  for (let i = activeGrenades.length - 1; i >= 0; i--) {
    const g = activeGrenades[i];
    g.timer -= dt;
    if (g.timer <= 0) {
      // Detonate grenade with volumetric explosion
      const blastPos = new THREE.Vector3(g.body.position.x, g.body.position.y, g.body.position.z);
      audio.explosion(blastPos);
      kinetics.addTrauma(0.65);
      combatVFX.spawnExplosion(blastPos, g.radius, 0xff5533);

      // AoE damage check against enemies
      enemies.forEach((e) => {
        if (!e.alive) return;
        const d = blastPos.distanceTo(e.group.position);
        if (d <= g.radius) {
          const falloff = 1 - d / g.radius;
          e.takeDamage(Math.round(g.damage * falloff), blastPos);
        }
      });

      // Cleanup
      physicsWorld.removeBody(g.body);
      scene.remove(g.mesh);
      g.mesh.geometry.dispose();
      activeGrenades.splice(i, 1);
    }
  }
}

const activeRockets = [];
function spawnRocket(pos, velocity, damage, radius) {
  const rocketGroup = new THREE.Group();
  const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 8), mats.red);
  warhead.rotation.x = -Math.PI / 2;
  rocketGroup.add(warhead);
  const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.35, 8), mats.dark);
  bodyMesh.rotation.x = Math.PI / 2;
  bodyMesh.position.z = 0.22;
  rocketGroup.add(bodyMesh);

  rocketGroup.position.copy(pos);
  rocketGroup.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, -1),
    velocity.clone().normalize()
  );
  scene.add(rocketGroup);

  const body = physicsWorld.spawnPhysicsGrenade(pos, velocity, 0.08);
  body.linearDamping = 0.0;
  physicsWorld.meshes.set(body, rocketGroup);

  activeRockets.push({
    mesh: rocketGroup,
    body,
    timer: 3.5,
    damage,
    radius,
  });
  audio.playRocketLaunch(pos);
}

function updateRockets(dt) {
  for (let i = activeRockets.length - 1; i >= 0; i--) {
    const r = activeRockets[i];
    r.timer -= dt;

    const currentPos = new THREE.Vector3(r.body.position.x, r.body.position.y, r.body.position.z);
    if (Math.random() < 0.6) {
      spawnParticles(currentPos, 0x999999, 2);
      spawnParticles(currentPos, 0xffaa33, 1);
    }

    let collided = false;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (currentPos.distanceTo(e.group.position) < 1.4) {
        collided = true;
        break;
      }
    }

    if (currentPos.y <= 0.2 || r.timer <= 0 || collided) {
      audio.playRocketExplosion(currentPos);
      kinetics.addTrauma(0.85);
      combatVFX.spawnExplosion(currentPos, r.radius, 0xff4422);

      enemies.forEach((e) => {
        if (!e.alive) return;
        const d = currentPos.distanceTo(e.group.position);
        if (d <= r.radius) {
          const falloff = 1 - d / r.radius;
          e.takeDamage(Math.round(r.damage * falloff), currentPos);
        }
      });

      physicsWorld.removeBody(r.body);
      scene.remove(r.mesh);
      activeRockets.splice(i, 1);
    }
  }
}

// 9. Combat Execution
function handleRaycastShot(raycaster, damage, pelletIndex) {
  state.shots++;
  const hitCandidates = [];
  enemies.forEach((e) => {
    if (e.alive) hitCandidates.push(...e.group.children);
  });
  staticColliders.forEach((c) => hitCandidates.push(c));

  const intersects = raycaster.intersectObjects(hitCandidates, false);
  const muzzlePos = camera.position.clone().add(new THREE.Vector3(0.2, -0.2, -0.4).applyQuaternion(camera.quaternion));
  const currWeapon = weaponManager.getCurrentWeapon();

  let tracerColor = 0xffe484;
  if (currWeapon.id === WEAPON_TYPES.SHOTGUN) tracerColor = 0x22d3ee;
  else if (currWeapon.id === WEAPON_TYPES.SNIPER) tracerColor = 0xc084fc;
  else if (currWeapon.id === WEAPON_TYPES.AKIMBO) tracerColor = 0xf59e0b;

  if (intersects.length > 0) {
    const hit = intersects[0];
    combatVFX.spawnTracer(muzzlePos, hit.point, tracerColor);

    let enemyOwner = hit.object.parent;
    while (enemyOwner && !enemyOwner.userData.enemy) {
      enemyOwner = enemyOwner.parent;
    }
    const enemy = enemies.find((e) => e.group === enemyOwner);
    const hitNormal = hit.face ? hit.face.normal.clone().applyQuaternion(hit.object.quaternion) : new THREE.Vector3(0, 1, 0);

    if (enemy) {
      const isHeadshot = hit.point.y > enemy.group.position.y + 1.85;
      const actualDmg = isHeadshot ? Math.round(damage * (currWeapon.headshotMultiplier || 1.5)) : damage;
      enemy.takeDamage(actualDmg, hit.point, isHeadshot);
      combatVFX.spawnImpact(hit.point, hitNormal, "enemy");
      return { hit: true, target: "enemy", headshot: isHeadshot };
    } else {
      const isMetal = hit.object.name && (hit.object.name.includes("barrier") || hit.object.name.includes("tower"));
      combatVFX.spawnImpact(hit.point, hitNormal, isMetal ? "metal" : "concrete");
      return { hit: true, target: "environment" };
    }
  } else {
    const farPoint = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 80);
    combatVFX.spawnTracer(muzzlePos, farPoint, tracerColor);
    return null;
  }
}

// 10. Frame Tick & Game Loop
function updateUI(dt) {
  $("score").textContent = String(state.score).padStart(6, "0");
  $("health").textContent = Math.round(state.health);
  $("healthbar").style.width = `${state.health}%`;
  $("staminabar").style.width = `${state.stamina}%`;

  const curr = weaponManager.getCurrentWeapon();
  $("weaponName").textContent = curr.name;
  $("ammoNow").textContent = curr.ammo;
  $("ammoReserve").textContent = ` / ${curr.reserve}`;
  $("damage").style.opacity = state.damageFlash.toFixed(2);
  $("waveInfo").textContent = `WAVE ${state.wave} (${enemies.filter((e) => e.alive).length})`;

  // Tactical Compass Update
  const playerEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
  updateCompass(playerEuler.y);

  // Directional Damage Arc Fade
  if (damageArcTimer > 0) {
    damageArcTimer = Math.max(0, damageArcTimer - dt);
    if (damageArcTimer <= 0) {
      const arc = $("damage-arc");
      if (arc) arc.style.opacity = "0";
    }
  }

  // Low-Health Distress Screen Vignette
  const vignette = $("low-health-vignette");
  if (vignette) {
    if (state.health < 35 && state.health > 0) {
      vignette.classList.add("pulsing");
    } else {
      vignette.classList.remove("pulsing");
    }
  }

  // Dynamic Reticle Bloom Gap
  const reticle = $("reticle");
  if (reticle) {
    const recoilMag = kinetics.recoilSpring.position.length();
    const speedEst = (player.body && player.body.velocity) ? player.body.velocity.length() : 0;
    const gap = Math.round(8 + speedEst * 1.8 + recoilMag * 45);
    reticle.style.setProperty("--reticle-gap", `${gap}px`);
  }

  // Update weapon slot indicator (0 to 5)
  for (let s = 0; s < 6; s++) {
    const slotEl = $(`slot-${s}`);
    if (slotEl) {
      slotEl.className = s === weaponManager.currentIndex ? "slot active" : "slot";
    }
  }

  // Update streak counter in topbar
  const streakEl = $("streakDisplay");
  if (streakEl) streakEl.textContent = `x${state.streak}`;

  // Update Killstreak HUD badges
  const uavBadge = $("streak-uav");
  if (uavBadge) {
    if (killstreakManager.uavActive) {
      uavBadge.className = "streak-badge active";
      uavBadge.textContent = `UAV [${Math.ceil(killstreakManager.uavTimer)}s]`;
    } else if (killstreakManager.uavReady) {
      uavBadge.className = "streak-badge ready";
      uavBadge.textContent = "UAV [7/U READY]";
    } else {
      uavBadge.className = "streak-badge";
      uavBadge.textContent = "UAV [3]";
    }
  }

  const strikeBadge = $("streak-airstrike");
  if (strikeBadge) {
    if (killstreakManager.airstrikeActive) {
      strikeBadge.className = "streak-badge active";
      strikeBadge.textContent = "STRIKE ACTIVE";
    } else if (killstreakManager.airstrikeReady) {
      strikeBadge.className = "streak-badge ready";
      strikeBadge.textContent = "STRIKE [8/J READY]";
    } else {
      strikeBadge.className = "streak-badge";
      strikeBadge.textContent = "STRIKE [5]";
    }
  }

  const nvgBadge = $("badge-nvg");
  if (nvgBadge) {
    nvgBadge.className = state.nvg ? "nvg-badge active" : "nvg-badge";
  }

  // Radar Mini-Map Update
  const radarPanel = $("radar-panel");
  const radarSweep = $("radar-sweep");
  const radarBlips = $("radar-blips");
  if (radarPanel && radarSweep && radarBlips) {
    if (killstreakManager.uavActive) {
      radarPanel.classList.add("uav-active");
      const deg = (killstreakManager.uavSweepAngle * 180) / Math.PI;
      radarSweep.style.transform = `rotate(${deg}deg)`;

      const radarData = killstreakManager.getRadarBlips(camera.position, playerEuler.y, enemies, 65.0);
      let blipsHtml = "";
      for (const blip of radarData.blips) {
        const leftPct = Math.round(50 + blip.x * 42);
        const topPct = Math.round(50 - blip.y * 42);
        blipsHtml += `<div class="radar-blip" style="left:${leftPct}%;top:${topPct}%"></div>`;
      }
      radarBlips.innerHTML = blipsHtml;
    } else {
      radarPanel.classList.remove("uav-active");
      radarBlips.innerHTML = "";
    }
  }

  // Hitmarker indicator
  state.hitMarkerT = Math.max(0, state.hitMarkerT - dt);
  if (state.hitMarkerT > 0) {
    $("hitmarker").classList.add("show");
  } else {
    $("hitmarker").classList.remove("show");
  }

  // Sniper optic scope overlay
  if (curr.hasScope && weaponManager.isAds) {
    $("sniper-scope").classList.add("active");
    $("reticle").style.display = "none";
  } else {
    $("sniper-scope").classList.remove("active");
    $("reticle").style.display = "block";
  }

  state.damageFlash = Math.max(0, state.damageFlash - dt * 3.6);
}

function toast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("show");
  void t.offsetWidth;
  t.classList.add("show");
}

let fpsFrames = 0;
let fpsTimer = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), CFG.maxFrame);
  state.elapsed += dt;

  if (state.running && !state.paused) {
    // 1. Poll Inputs
    const input = inputManager.poll(camera, kinetics);

    // 1b. Tactical Weapon Inspection
    if (input.inspect) {
      weaponManager.inspectWeapon();
      toast("INSPECTING OPERATOR WEAPON");
    }

    // 2. Weapon Slot Switching
    if (input.selectedSlot !== null) {
      if (typeof input.selectedSlot === "number") {
        weaponManager.selectWeapon(input.selectedSlot);
      } else if (input.selectedSlot === "next") {
        weaponManager.nextWeapon();
      } else if (input.selectedSlot === "prev") {
        weaponManager.prevWeapon();
      }
    }

    // 2b. Tactical Killstreaks & Night Vision
    if (input.toggleNightVision) {
      toggleNightVision();
    }
    if (input.killstreakUav) {
      killstreakManager.activateUav();
    }
    if (input.killstreakAirstrike) {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const targetPos = camera.position.clone().addScaledVector(forward, 28);
      targetPos.y = 0;
      killstreakManager.activateAirstrike(targetPos);
    }

    // 3. Movement, Tac-Sprint & Power Slide
    const isTacSprint = input.tacSprinting && state.stamina > 10;
    const isSlide = input.sliding && (input.sprinting || isTacSprint || player.grounded);

    let speed = CFG.walk;
    if (isTacSprint) {
      speed = 17.5;
      state.stamina = clamp(state.stamina - dt * 26, 0, 100);
    } else if (input.sprinting && state.stamina > 0) {
      speed = CFG.sprint;
      state.stamina = clamp(state.stamina - dt * 16, 0, 100);
    } else {
      state.stamina = clamp(state.stamina + dt * 18, 0, 100);
    }

    if (isSlide) {
      speed = Math.max(speed, 15.5);
    }

    const moveWish = input.moveDir.clone();
    if (moveWish.lengthSq() > 0) {
      moveWish.applyQuaternion(camera.quaternion);
      moveWish.y = 0;
      if (moveWish.lengthSq() > 0) moveWish.normalize();
    }
    const desiredVelocity = moveWish.multiplyScalar(speed);

    // 4. Step Physics & Character Controller
    player.step(dt, desiredVelocity, input.jump);
    physicsWorld.step(dt);
    physicsWorld.sync();

    // 5. Weapon Fire, Shell Ejection & ADS
    weaponManager.setAds(input.ads);
    if (input.reload) {
      weaponManager.startReload();
    }
    if (input.fire) {
      weaponManager.executeFire({
        onRaycastHit: handleRaycastShot,
        onSpawnGrenade: spawnGrenade,
        onSpawnRocket: spawnRocket,
        enemies,
      });
      combatVFX.muzzleFlash(0.045);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const shellPos = camera.position.clone()
        .addScaledVector(fwd, 0.28)
        .addScaledVector(right, 0.14);
      shellPos.y -= 0.12;
      combatVFX.spawnShell(shellPos, fwd, right, weaponManager.getCurrentWeapon().id);
    }

    weaponManager.update(dt, {
      moving: input.moving,
      sprinting: input.sprinting,
      tacSprinting: isTacSprint,
      sliding: isSlide,
    });

    // 6. Camera FOV smoothly interpolated with Tac-Sprint boost
    const currWeapon = weaponManager.getCurrentWeapon();
    let targetFov = weaponManager.isAds ? currWeapon.adsFov : currWeapon.hipFov;
    if (!weaponManager.isAds) {
      if (isTacSprint) targetFov += 10;
      else if (input.sprinting) targetFov += 4;
    }
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-12 * dt));
    camera.updateProjectionMatrix();

    // Apply trauma screen shake to camera
    if (kinetics.trauma > 0) {
      camera.rotation.x += kinetics.shakeRot.x;
      camera.rotation.y += kinetics.shakeRot.y;
      camera.rotation.z += kinetics.shakeRot.z;
    }

    // 7. Update Audio & Positional Listener
    audio.setListener(camera.position.x, camera.position.y, camera.position.z);
    audio.updateFootsteps(dt, input.moving, input.sprinting, player.grounded);

    // 8. Combat Director & Entities
    const acc = state.shots > 0 ? state.hits / state.shots : 0.5;
    director.update(dt, camera.position, state.health, acc);
    killstreakManager.update(dt, { enemies, playerPos: camera.position });
    enemies.forEach((e) => e.update(dt));

    // 9. VFX, Projectiles & Grenades
    tracerPool.update(dt);
    combatVFX.update(dt);
    updateParticles(dt);
    updateGrenades(dt);
    updateRockets(dt);

    // 10. Client Prediction Tick
    clientPrediction.input({
      t: Date.now(),
      pos: [camera.position.x, camera.position.y, camera.position.z],
    });

    updateUI(dt);
  }

  // Render Scene
  composer.render(scene, camera);

  // FPS Telemetry
  fpsFrames++;
  fpsTimer += dt;
  if (fpsTimer >= 0.5) {
    const fps = Math.round(fpsFrames / fpsTimer);
    fpsFrames = 0;
    fpsTimer = 0;
    $("perf").textContent = `${fps} FPS`;
  }
}
requestAnimationFrame(tick);

// Deploy & Pause Handling
$("deploy").addEventListener("click", () => {
  state.running = true;
  audio.init();
  audio.resume();
  controls.lock();
  $("start").style.display = "none";
  toast("OPERATION STARTED — GOOD HUNTING");
});

controls.addEventListener("lock", () => {
  $("start").style.display = "none";
  state.paused = false;
});

controls.addEventListener("unlock", () => {
  if (state.running && !inputManager.isTouch) {
    state.paused = true;
    $("prompt").textContent = "CLICK TO RESUME";
    $("prompt").classList.add("show");
    $("start").style.display = "grid";
  }
});

// Click and Touch Handlers for Killstreak Badges & NVG
$("streak-uav")?.addEventListener("click", () => killstreakManager.activateUav());
$("streak-airstrike")?.addEventListener("click", () => {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const targetPos = camera.position.clone().addScaledVector(forward, 28);
  targetPos.y = 0;
  killstreakManager.activateAirstrike(targetPos);
});
$("badge-nvg")?.addEventListener("click", () => toggleNightVision());

$("touch-btn-uav")?.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    killstreakManager.activateUav();
  },
  { passive: false }
);

$("touch-btn-nvg")?.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    toggleNightVision();
  },
  { passive: false }
);

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
});

document.addEventListener("visibilitychange", () => {
  state.paused = document.hidden;
});
