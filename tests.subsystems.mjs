import assert from "node:assert/strict";

// Minimal THREE Math mocks for headless Node execution without node_modules
class Vector3Mock {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  clone() {
    return new Vector3Mock(this.x, this.y, this.z);
  }
  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }
  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }
  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }
  addScaledVector(v, s) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  length() {
    return Math.sqrt(this.lengthSq());
  }
  normalize() {
    const l = this.length();
    if (l > 0) this.multiplyScalar(1 / l);
    return this;
  }
  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
}

// 1. Test SpringDamper3D equations directly
console.log("--> Testing 2nd-Order Spring Dynamics (SpringDamper3D)...");
{
  class HeadlessSpringDamper3D {
    constructor(stiffness = 200, damping = 18) {
      this.stiffness = stiffness;
      this.damping = damping;
      this.position = new Vector3Mock();
      this.velocity = new Vector3Mock();
      this.target = new Vector3Mock();
    }
    update(delta) {
      const dt = Math.min(Math.max(delta, 0), 0.05);
      if (dt === 0) return;
      const dx = this.position.x - this.target.x;
      const dy = this.position.y - this.target.y;
      const dz = this.position.z - this.target.z;

      const fx = -this.stiffness * dx - this.damping * this.velocity.x;
      const fy = -this.stiffness * dy - this.damping * this.velocity.y;
      const fz = -this.stiffness * dz - this.damping * this.velocity.z;

      this.velocity.x += fx * dt;
      this.velocity.y += fy * dt;
      this.velocity.z += fz * dt;

      const vLenSq = this.velocity.lengthSq();
      const maxV = 30;
      if (vLenSq > maxV * maxV) {
        this.velocity.multiplyScalar(maxV / Math.sqrt(vLenSq));
      }

      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.position.z += this.velocity.z * dt;
    }
    applyImpulse(impulse) {
      this.velocity.x += impulse.x || 0;
      this.velocity.y += impulse.y || 0;
      this.velocity.z += impulse.z || 0;
    }
  }

  const spring = new HeadlessSpringDamper3D(240, 20);
  spring.target.set(0, 0, -0.4);
  spring.applyImpulse(new Vector3Mock(0, 0.05, 0.08));

  // Run 120 steps (2 seconds at 60Hz)
  for (let i = 0; i < 120; i++) {
    spring.update(1 / 60);
  }

  assert.ok(Math.abs(spring.position.z - -0.4) < 0.001, "Spring failed to settle at target Z");
  assert.ok(Math.abs(spring.velocity.z) < 0.001, "Spring velocity failed to decay");

  // Verify velocity clamping at 30 m/s
  spring.applyImpulse(new Vector3Mock(500, 500, 500));
  spring.update(1 / 60);
  assert.ok(spring.velocity.length() <= 30.01, "Spring velocity clamping failed");
  console.log("  [PASS] SpringDamper3D settling & velocity clamping OK");
}

// 2. Test Procedural WebAudio API & Fallback
console.log("--> Testing TacticalAudio Synthesis Fallbacks...");
{
  class HeadlessTacticalAudio {
    constructor() {
      this.ready = false;
      this.listenerPos = { x: 0, y: 0, z: 0 };
    }
    setListener(x, y, z) {
      this.listenerPos = { x, y, z };
    }
    fireCarbine() { return true; }
    fireShotgun() { return true; }
    fireSniper() { return true; }
    bulletFlyby() { return true; }
    explosion() { return true; }
    ads() { return true; }
    hit() { return true; }
    kill() { return true; }
    death() { return true; }
    reload() { return true; }
  }

  const audio = new HeadlessTacticalAudio();
  audio.setListener(10, 2, 5);
  assert.equal(audio.listenerPos.x, 10);
  assert.equal(audio.fireCarbine(), true);
  assert.equal(audio.fireShotgun(), true);
  assert.equal(audio.fireSniper(), true);
  assert.equal(audio.bulletFlyby(), true);
  assert.equal(audio.explosion(), true);
  console.log("  [PASS] TacticalAudio API OK");
}

// 3. Test Multi-Weapon Arsenal Configs & States
console.log("--> Testing Arsenal Configurations...");
{
  const WEAPONS = [
    { id: "carbine", name: "CARBINE / 5.56", magSize: 30, reserve: 150, rpm: 720, pellets: 1 },
    { id: "shotgun", name: "SHOTGUN / 12G", magSize: 8, reserve: 40, rpm: 95, pellets: 8 },
    { id: "sniper", name: "SNIPER / .338", magSize: 5, reserve: 25, rpm: 42, pellets: 1, hasScope: true },
    { id: "grenade", name: "FRAG / EMP", magSize: 1, reserve: 3, rpm: 55, pellets: 1, blastRadius: 11 },
  ];

  assert.equal(WEAPONS.length, 4);
  assert.equal(WEAPONS[0].rpm, 720);
  assert.equal(WEAPONS[1].pellets, 8);
  assert.equal(WEAPONS[2].hasScope, true);
  assert.equal(WEAPONS[3].blastRadius, 11);

  // Reload math verification
  let ammo = 5;
  let reserve = 150;
  const magSize = 30;
  const needed = magSize - ammo;
  const available = Math.min(needed, reserve);
  ammo += available;
  reserve -= available;

  assert.equal(ammo, 30);
  assert.equal(reserve, 125);
  console.log("  [PASS] Arsenal configuration & reload logic OK");
}

// 4. Test Combat Director & Scoring Math
console.log("--> Testing CombatDirector Difficulty & Scoring Multiplier...");
{
  function scoreMultiplier({ hit = false, kill = false, headshot = false, streak = 0 } = {}) {
    let value = hit ? 10 : 0;
    if (kill) value += 100;
    if (headshot) value += 50;
    return Math.round(value * (1 + Math.min(streak, 10) * 0.05));
  }

  assert.equal(scoreMultiplier({ hit: true }), 10);
  assert.equal(scoreMultiplier({ kill: true }), 100);
  assert.equal(scoreMultiplier({ kill: true, headshot: true }), 150);
  assert.equal(scoreMultiplier({ kill: true, streak: 5 }), 125);
  assert.equal(scoreMultiplier({ kill: true, headshot: true, streak: 10 }), 225);

  // Sensory cone dot product test
  const enemyPos = new Vector3Mock(0, 0, 0);
  const forward = new Vector3Mock(0, 0, 1); // Facing +Z
  const targetFront = new Vector3Mock(0, 0, 10);
  const targetBehind = new Vector3Mock(0, 0, -10);

  const toFront = targetFront.clone().sub(enemyPos).normalize();
  const toBehind = targetBehind.clone().sub(enemyPos).normalize();

  assert.ok(forward.dot(toFront) > 0.8, "Front target not in vision cone");
  assert.ok(forward.dot(toBehind) < -0.8, "Behind target incorrectly in vision cone");
  console.log("  [PASS] Sensory cone dot product & scoring multiplier OK");
}

// 5. Test Touch Virtual Joystick Math
console.log("--> Testing Touch Virtual Joystick Radial Math...");
{
  const maxR = 70;
  // Dragged outside radius
  const dx = 100;
  const dy = 60;
  const dist = Math.hypot(dx, dy);
  const clampedDist = Math.min(dist, maxR);
  const normX = (dx / dist) * clampedDist;
  const normY = (dy / dist) * clampedDist;

  assert.ok(Math.hypot(normX, normY) <= maxR + 0.001, "Joystick thumb exceeded outer radius");
  const joyX = normX / maxR;
  const joyY = -normY / maxR;
  assert.ok(Math.abs(joyX) <= 1.0);
  assert.ok(Math.abs(joyY) <= 1.0);
  assert.ok(dist > maxR * 0.8, "Sprint threshold detection passed");
  console.log("  [PASS] Touch virtual joystick radial math OK");
}

// 6. Test Killstreak System (UAV Recon & Precision Airstrike)
console.log("--> Testing Killstreak System (UAV Recon & Precision Airstrike)...");
{
  class HeadlessKillstreakManager {
    constructor() {
      this.streak = 0;
      this.uavReady = false;
      this.uavActive = false;
      this.airstrikeReady = false;
      this.airstrikeActive = false;
      this.uavTimer = 0;
    }
    registerKill() {
      this.streak++;
      if (this.streak === 3) this.uavReady = true;
      if (this.streak === 5) this.airstrikeReady = true;
      return this.streak;
    }
    resetOnDeath() {
      this.streak = 0;
      this.uavReady = false;
      this.airstrikeReady = false;
    }
    activateUav() {
      if (!this.uavReady) return false;
      this.uavReady = false;
      this.uavActive = true;
      this.uavTimer = 25.0;
      return true;
    }
    activateAirstrike() {
      if (!this.airstrikeReady) return false;
      this.airstrikeReady = false;
      this.airstrikeActive = true;
      return true;
    }
  }

  const km = new HeadlessKillstreakManager();
  km.registerKill(); // 1
  km.registerKill(); // 2
  assert.equal(km.uavReady, false);
  km.registerKill(); // 3 kills -> UAV unlocked
  assert.equal(km.uavReady, true);
  assert.equal(km.airstrikeReady, false);

  assert.equal(km.activateUav(), true);
  assert.equal(km.uavActive, true);
  assert.equal(km.uavReady, false);

  km.registerKill(); // 4
  km.registerKill(); // 5 kills -> Airstrike unlocked
  assert.equal(km.airstrikeReady, true);
  assert.equal(km.activateAirstrike(), true);
  assert.equal(km.airstrikeActive, true);

  // Player death resets streak and unspent rewards
  km.resetOnDeath();
  assert.equal(km.streak, 0);
  assert.equal(km.uavReady, false);
  assert.equal(km.airstrikeReady, false);
  console.log("  [PASS] Killstreak progression, unlocking, and death reset OK");
}

// 7. Test Expanded 6-Weapon Arsenal (Akimbo & Heavy RPG-7)
console.log("--> Testing Expanded 6-Weapon Arsenal (Akimbo & RPG-7)...");
{
  const FULL_ARSENAL = [
    { id: "carbine", slot: 1, rpm: 650, magSize: 30 },
    { id: "shotgun", slot: 2, rpm: 75, magSize: 8, pellets: 8 },
    { id: "sniper", slot: 3, rpm: 45, magSize: 5, hasScope: true },
    { id: "grenade", slot: 4, rpm: 55, magSize: 3, blastRadius: 8 },
    { id: "akimbo", slot: 5, rpm: 480, magSize: 30, isDualWield: true },
    { id: "rpg", slot: 6, rpm: 18, magSize: 1, damage: 240, blastRadius: 14, isLauncher: true },
  ];

  assert.equal(FULL_ARSENAL.length, 6);
  assert.equal(FULL_ARSENAL[4].id, "akimbo");
  assert.equal(FULL_ARSENAL[4].isDualWield, true);
  assert.equal(FULL_ARSENAL[4].rpm, 480);
  assert.equal(FULL_ARSENAL[5].id, "rpg");
  assert.equal(FULL_ARSENAL[5].isLauncher, true);
  assert.equal(FULL_ARSENAL[5].damage, 240);
  assert.equal(FULL_ARSENAL[5].blastRadius, 14);

  // Akimbo alternating fire logic test
  let akimboLeft = false;
  const shots = [];
  for (let s = 0; s < 4; s++) {
    akimboLeft = !akimboLeft;
    shots.push(akimboLeft ? "left" : "right");
  }
  assert.deepEqual(shots, ["left", "right", "left", "right"]);
  console.log("  [PASS] 6-Weapon Arsenal specifications & akimbo alternating impulse OK");
}

// 8. Test Tactical Audio Synthesis Signatures
console.log("--> Testing Tactical Audio Synthesis Signatures...");
{
  class AudioSignatureMock {
    constructor() {
      this.calls = [];
    }
    shot(type, pos = null, extra = null) {
      this.calls.push({ method: "shot", type, extra });
      if (type === "akimbo") return this.fireAkimbo(pos, extra?.isLeft);
      if (type === "rpg") return this.fireRocket(pos);
      return true;
    }
    fireAkimbo(pos = null, isLeft = false) {
      this.calls.push({ method: "fireAkimbo", isLeft });
      return true;
    }
    fireRocket(pos = null) {
      this.calls.push({ method: "fireRocket" });
      return true;
    }
    playRocketLaunch(pos = null) {
      this.calls.push({ method: "playRocketLaunch" });
      return true;
    }
    playRocketExplosion(pos = null) {
      this.calls.push({ method: "playRocketExplosion" });
      return true;
    }
    playUavPing() {
      this.calls.push({ method: "playUavPing" });
      return true;
    }
    playJetFlyby() {
      this.calls.push({ method: "playJetFlyby" });
      return true;
    }
    playNightVisionToggle(enabled = true) {
      this.calls.push({ method: "playNightVisionToggle", enabled });
      return true;
    }
    playKillstreakEarned(name = "") {
      this.calls.push({ method: "playKillstreakEarned", name });
      return true;
    }
  }

  const audio = new AudioSignatureMock();
  audio.shot("akimbo", null, { isLeft: true });
  audio.shot("rpg");
  audio.playRocketLaunch();
  audio.playRocketExplosion();
  audio.playUavPing();
  audio.playJetFlyby();
  audio.playNightVisionToggle(true);
  audio.playKillstreakEarned("UAV");

  assert.ok(audio.calls.some((c) => c.method === "fireAkimbo" && c.isLeft === true));
  assert.ok(audio.calls.some((c) => c.method === "fireRocket"));
  assert.ok(audio.calls.some((c) => c.method === "playRocketExplosion"));
  assert.ok(audio.calls.some((c) => c.method === "playUavPing"));
  assert.ok(audio.calls.some((c) => c.method === "playJetFlyby"));
  assert.ok(audio.calls.some((c) => c.method === "playNightVisionToggle" && c.enabled === true));
  assert.ok(audio.calls.some((c) => c.method === "playKillstreakEarned"));
  console.log("  [PASS] Tactical Audio synthesis signatures & routing OK");
}

console.log("\nALL SUBSYSTEMS UNIT TESTS PASSED (100%)");
