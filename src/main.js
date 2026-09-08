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
import { WeaponManager, buildWeaponMesh, WEAPON_CONFIGS } from "./systems/weapons.js";
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

// 3. Procedural Sobel PBR Texturing (3x3 Sobel Operator)
function createProceduralSobelPBR() {
  const size = 256;
  const cvH = document.createElement("canvas");
  cvH.width = cvH.height = size;
  const ctxH = cvH.getContext("2d");
  ctxH.fillStyle = "#808080";
  ctxH.fillRect(0, 0, size, size);

  for (let x = 0; x < size; x += 32) {
    for (let y = 0; y < size; y += 32) {
      ctxH.fillStyle = "#aaaaaa";
      ctxH.fillRect(x + 1, y + 1, 30, 30);
      ctxH.fillStyle = "#ffffff";
      ctxH.fillRect(x + 3, y + 3, 2, 2);
      ctxH.fillRect(x + 27, y + 3, 2, 2);
      ctxH.fillStyle = "#101010";
      ctxH.fillRect(x, y, size, 1);
      ctxH.fillRect(x, y, 1, size);
    }
  }
  const hData = ctxH.getImageData(0, 0, size, size).data;

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

      const strength = 3.5;
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

  const cvD = document.createElement("canvas");
  cvD.width = cvD.height = size;
  const ctxD = cvD.getContext("2d");
  ctxD.fillStyle = "#1e282a";
  ctxD.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 32) {
    for (let y = 0; y < size; y += 32) {
      ctxD.fillStyle = "#253435";
      ctxD.fillRect(x + 1, y + 1, 30, 30);
      ctxD.strokeStyle = "rgba(34, 211, 238, 0.18)";
      ctxD.strokeRect(x + 1, y + 1, 30, 30);
    }
  }

  const diffTex = new THREE.CanvasTexture(cvD);
  const normalTex = new THREE.CanvasTexture(cvN);
  [diffTex, normalTex].forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  });
  return { diffTex, normalTex };
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

function mat(color, rough = 0.72, metal = 0, map = null, normalMap = null) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    map,
    normalMap,
    normalScale: normalMap ? new THREE.Vector2(1.2, 1.2) : null,
  });
}

const mats = {
  ground: mat(0x56665d, 0.94, 0.05, texGround),
  concrete: mat(0x6f726a, 0.82, 0.1, texConcrete),
  metal: mat(0x283133, 0.45, 0.85, sobelMaps.diffTex, sobelMaps.normalTex),
  dark: mat(0x101517, 0.42, 0.88, sobelMaps.diffTex, sobelMaps.normalTex),
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
  <div id="reticle"></div>
  <div id="hitmarker"></div>
  <div id="sniper-scope"></div>
  <div id="nvg-overlay"></div>
  <div id="crosshairHint">LMB / TOUCH FIRE · RMB / ADS · 1-6 WEAPONS · 7/U UAV · 8/J STRIKE · N NVG</div>
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
  const grid = new THREE.GridHelper(CFG.world, 90, 0x68877b, 0x30443f);
  grid.position.y = 0.015;
  grid.material.opacity = 0.16;
  grid.material.transparent = true;
  scene.add(grid);

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

const killstreakManager = new KillstreakManager({
  audio,
  kinetics,
  onToast: (msg) => toast(msg),
  onStreakEarned: (type, streak) => {
    state.score += 250;
  },
  onAirstrikeImpact: (pos, radius) => {
    spawnParticles(pos, 0xff4422, 50);
    spawnParticles(pos, 0xffcc33, 35);
    spawnParticles(pos, 0x555555, 30);
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

  takeDamage(d, hitPoint) {
    if (!this.alive) return;
    this.hp -= d;
    state.hits++;
    state.hitMarkerT = 0.14;
    audio.hit();

    if (hitPoint) {
      spawnParticles(hitPoint, 0xffe484, 8);
    }

    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
      state.streak++;
      killstreakManager.registerKill();
      const gained = scoreMultiplier({ kill: true, streak: state.streak });
      state.score += gained;
      audio.kill();
      spawnParticles(this.group.position, 0xb6fff0, 24);
      toast(`KILL CONFIRMED +${gained}`);
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
    tracerPool.spawn(muzzle, playerPos, new THREE.LineBasicMaterial({ color: 0xff4444 }));
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
      // Detonate grenade
      const blastPos = new THREE.Vector3(g.body.position.x, g.body.position.y, g.body.position.z);
      audio.explosion(blastPos);
      kinetics.addTrauma(0.65);
      spawnParticles(blastPos, 0xff5533, 40);
      spawnParticles(blastPos, 0xffe484, 25);

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
      spawnParticles(currentPos, 0xff4422, 60);
      spawnParticles(currentPos, 0xffcc33, 40);
      spawnParticles(currentPos, 0x555555, 30);

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

  if (intersects.length > 0) {
    const hit = intersects[0];
    tracerPool.spawn(muzzlePos, hit.point);

    let enemyOwner = hit.object.parent;
    while (enemyOwner && !enemyOwner.userData.enemy) {
      enemyOwner = enemyOwner.parent;
    }
    const enemy = enemies.find((e) => e.group === enemyOwner);
    if (enemy) {
      enemy.takeDamage(damage, hit.point);
      return { hit: true, target: "enemy" };
    } else {
      spawnParticles(hit.point, 0x8be4d8, 5);
      return { hit: true, target: "environment" };
    }
  } else {
    const farPoint = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 80);
    tracerPool.spawn(muzzlePos, farPoint);
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

      const playerEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
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

    // 3. Movement & Stamina
    const speed = input.sprinting && state.stamina > 0 ? CFG.sprint : CFG.walk;
    if (input.sprinting) {
      state.stamina = clamp(state.stamina - dt * 18, 0, 100);
    } else {
      state.stamina = clamp(state.stamina + dt * 16, 0, 100);
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

    // 5. Weapon Fire & ADS
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
    }

    weaponManager.update(dt, {
      moving: input.moving,
      sprinting: input.sprinting,
    });

    // 6. Camera FOV smoothly interpolated
    const currWeapon = weaponManager.getCurrentWeapon();
    const targetFov = weaponManager.isAds ? currWeapon.adsFov : currWeapon.hipFov;
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
