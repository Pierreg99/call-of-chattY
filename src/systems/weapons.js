import * as THREE from "three";

/**
 * Call-of-ChattY Unified FPS Engine - Weapons Arsenal System.
 *
 * Implements 4 distinct tactical weapons:
 * 1. Assault Carbine (GROKY-16): 30 mag / 90 reserve, 650 RPM (92ms cooldown), 28 DMG,
 *    hip spread 0.012, ADS spread 0.0035, ADS FOV 48 deg, reload 1.65s, full-auto.
 * 2. Tactical Shotgun: 8 shells / 32 reserve, 75 RPM (800ms cooldown), 8 pellets x 14 DMG (112 total),
 *    spread 0.048, ADS spread 0.024, heavy kick.
 * 3. Precision Bolt-Action Sniper: 5 mag / 20 reserve, 45 RPM (1.33s bolt cycle), 95 body / 150 headshot DMG,
 *    ADS FOV 24 deg (telephoto), hip spread 0.065, ADS spread 0.0005.
 * 4. Frag / EMP Grenade: 3 capacity, thrown projectile arc (velocity 18 m/s), 2.5s timer detonation,
 *    120 splash DMG with linear falloff to 8m.
 *
 * Features:
 * - Dynamic raycast spread cones (hip vs ADS).
 * - 4-stage tactical reload state machine (mag-out, mag-in, bolt-rack, ready) with synchronized audio cues.
 * - Strict ammo conservation (reserve strictly decremented, never negative).
 * - Multi-weapon slot management with smooth procedural viewmodel rigging.
 */

export const WEAPON_TYPES = Object.freeze({
  CARBINE: "carbine",
  SHOTGUN: "shotgun",
  SNIPER: "sniper",
  GRENADE: "grenade",
});

export const RELOAD_STAGES = Object.freeze({
  NONE: "none",
  MAG_OUT: "mag-out",
  MAG_IN: "mag-in",
  BOLT_RACK: "bolt-rack",
  READY: "ready",
});

export const WEAPON_CONFIGS = Object.freeze([
  {
    id: WEAPON_TYPES.CARBINE,
    type: WEAPON_TYPES.CARBINE,
    name: "GROKY-16",
    slot: 1,
    fireMode: "auto",
    magSize: 30,
    reserve: 90,
    rpm: 650,
    cooldown: 60 / 650, // ~0.0923s (92ms)
    damage: 28,
    headshotMultiplier: 1.5,
    pellets: 1,
    spread: 0.012,
    adsSpread: 0.0035,
    hipFov: 74,
    adsFov: 48,
    reloadTime: 1.65,
    recoilPitch: 0.038,
    recoilYaw: 0.015,
    kickBack: 0.045,
    hipPos: new THREE.Vector3(0.28, -0.24, -0.52),
    adsPos: new THREE.Vector3(0.0, -0.165, -0.36),
    hasScope: false,
  },
  {
    id: WEAPON_TYPES.SHOTGUN,
    type: WEAPON_TYPES.SHOTGUN,
    name: "Tactical Shotgun",
    slot: 2,
    fireMode: "semi",
    magSize: 8,
    reserve: 32,
    rpm: 75,
    cooldown: 60 / 75, // 0.800s (800ms)
    damage: 14,
    pellets: 8,
    totalDamage: 112,
    headshotMultiplier: 1.4,
    spread: 0.048,
    adsSpread: 0.024,
    hipFov: 74,
    adsFov: 58,
    reloadTime: 2.2,
    recoilPitch: 0.12,
    recoilYaw: 0.035,
    kickBack: 0.11,
    hipPos: new THREE.Vector3(0.27, -0.26, -0.50),
    adsPos: new THREE.Vector3(0.0, -0.18, -0.38),
    hasScope: false,
  },
  {
    id: WEAPON_TYPES.SNIPER,
    type: WEAPON_TYPES.SNIPER,
    name: "Precision Bolt-Action Sniper",
    slot: 3,
    fireMode: "bolt",
    magSize: 5,
    reserve: 20,
    rpm: 45,
    cooldown: 60 / 45, // 1.333s (1.33s bolt cycle)
    damage: 95,
    headshotDamage: 150,
    headshotMultiplier: 150 / 95,
    pellets: 1,
    spread: 0.065,
    adsSpread: 0.0005,
    hipFov: 74,
    adsFov: 24,
    reloadTime: 2.5,
    recoilPitch: 0.16,
    recoilYaw: 0.025,
    kickBack: 0.15,
    hipPos: new THREE.Vector3(0.26, -0.28, -0.56),
    adsPos: new THREE.Vector3(0.0, -0.145, -0.24),
    hasScope: true,
  },
  {
    id: WEAPON_TYPES.GRENADE,
    type: WEAPON_TYPES.GRENADE,
    name: "Frag / EMP Grenade",
    slot: 4,
    fireMode: "throw",
    magSize: 3,
    reserve: 0,
    capacity: 3,
    rpm: 55,
    cooldown: 60 / 55,
    damage: 120,
    blastRadius: 8,
    throwVelocity: 18,
    fuseTime: 2.5,
    reloadTime: 1.0,
    pellets: 1,
    spread: 0.01,
    adsSpread: 0.01,
    hipFov: 74,
    adsFov: 68,
    recoilPitch: 0.03,
    recoilYaw: 0.01,
    kickBack: 0.02,
    hipPos: new THREE.Vector3(0.22, -0.32, -0.42),
    adsPos: new THREE.Vector3(0.08, -0.24, -0.36),
    hasScope: false,
  },
]);

/**
 * Builds stylized 3D weapon meshes using Three.js geometries and materials.
 */
export function buildWeaponMesh(id, materials = null) {
  const root = new THREE.Group();
  const defaultMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  const mats = materials || {
    dark: defaultMat,
    metal: defaultMat,
    rubber: defaultMat,
    concrete: defaultMat,
    glass: defaultMat,
    red: defaultMat,
    light: defaultMat,
  };

  if (id === WEAPON_TYPES.CARBINE || id === "carbine") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.68), mats.dark);
    body.castShadow = true;
    root.add(body);

    const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.48, 12), mats.metal);
    handguard.rotation.x = Math.PI / 2;
    handguard.position.z = -0.44;
    root.add(handguard);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.4, 12), mats.dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.84;
    root.add(barrel);

    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.035, 0.1, 12), mats.metal);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.z = -1.06;
    root.add(muzzle);

    const optic = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 14), mats.glass);
    optic.rotation.x = Math.PI / 2;
    optic.position.set(0, 0.16, -0.2);
    root.add(optic);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.14), mats.metal);
    mag.position.set(0, -0.16, -0.05);
    mag.rotation.x = 0.15;
    root.add(mag);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.32), mats.rubber);
    stock.position.z = 0.42;
    root.add(stock);
  } else if (id === WEAPON_TYPES.SHOTGUN || id === "shotgun") {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.62), mats.metal);
    receiver.castShadow = true;
    root.add(receiver);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.65, 12), mats.dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.04, -0.56);
    root.add(barrel);

    const magTube = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.58, 12), mats.metal);
    magTube.rotation.x = Math.PI / 2;
    magTube.position.set(0, -0.04, -0.52);
    root.add(magTube);

    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.24), mats.rubber);
    pump.position.set(0, -0.04, -0.48);
    root.add(pump);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.19, 0.38), mats.concrete || mats.dark);
    stock.position.set(0, -0.04, 0.44);
    root.add(stock);
  } else if (id === WEAPON_TYPES.SNIPER || id === "sniper") {
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 0.72), mats.metal);
    receiver.castShadow = true;
    root.add(receiver);

    const longBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.95, 14), mats.dark);
    longBarrel.rotation.x = Math.PI / 2;
    longBarrel.position.set(0, 0.02, -0.8);
    root.add(longBarrel);

    const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.14), mats.metal);
    muzzleBrake.position.set(0, 0.02, -1.32);
    root.add(muzzleBrake);

    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.4, 16), mats.dark);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.18, -0.22);
    root.add(scopeTube);

    const scopeLens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), mats.glass);
    scopeLens.rotation.x = Math.PI / 2;
    scopeLens.position.set(0, 0.18, -0.41);
    root.add(scopeLens);

    const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), mats.red);
    bolt.position.set(0.1, 0.08, 0.02);
    root.add(bolt);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.42), mats.rubber);
    stock.position.z = 0.5;
    root.add(stock);
  } else if (id === WEAPON_TYPES.GRENADE || id === "grenade") {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 16), mats.dark);
    root.add(can);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.04, 16), mats.red);
    collar.position.y = 0.05;
    root.add(collar);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 16), mats.light);
    ring.position.set(0.04, 0.12, 0);
    root.add(ring);
  }

  return root;
}

/**
 * WeaponArsenal - Manages weapon slots, firing cooldowns, dynamic raycast spread cones,
 * 4-stage tactical reload state machine, and strictly conserved ammunition.
 */
export class WeaponArsenal {
  constructor(arg1, arg2, arg3, arg4, arg5, arg6) {
    // Detect constructor calling convention:
    // Pattern A: new WeaponArsenal(camera, materials, audio, kinetics, physicsWorld, scene)
    // Pattern B: new WeaponArsenal(audioSystem, physicsWorld, scene)
    const isCameraCalling = arg1 && (arg1.isCamera || arg1.isObject3D || arg1.quaternion !== undefined);

    if (isCameraCalling) {
      this.camera = arg1;
      this.materials = arg2 || null;
      this.audio = arg3 || null;
      this.kinetics = arg4 || null;
      this.physicsWorld = arg5 || null;
      this.scene = arg6 || null;
    } else {
      this.camera = null;
      this.materials = null;
      this.audio = arg1 || null;
      this.physicsWorld = arg2 || null;
      this.scene = arg3 || null;
      this.kinetics = null;
    }

    // Initialize weapon instances from immutable configs
    this.weapons = WEAPON_CONFIGS.map((cfg) => {
      const viewmodel = buildWeaponMesh(cfg.id, this.materials);
      return {
        ...cfg,
        ammo: cfg.magSize,
        reserve: cfg.reserve,
        viewmodel,
      };
    });

    this.currentIndex = 0;
    this.current = this.weapons[0];
    this.isAds = false;

    // FSM State: 'idle' | 'firing' | 'reloading' | 'switching'
    this.state = "idle";
    this.reloadPhase = RELOAD_STAGES.NONE;
    this.reloadTimer = 0;
    this.reloadTotalTime = 0;
    this.fireTimer = 0;
    this.switchTimer = 0;
    this.recoil = 0;
    this.lastReloadPhaseReported = -1;

    // Viewmodel root group
    this.viewmodelRoot = new THREE.Group();
    if (this.camera && typeof this.camera.add === "function") {
      this.camera.add(this.viewmodelRoot);
    }

    // Attach all viewmodel meshes
    this.weapons.forEach((w) => {
      w.viewmodel.visible = false;
      this.viewmodelRoot.add(w.viewmodel);
    });
    this.current.viewmodel.visible = true;

    if (this.kinetics?.setHipAndAds) {
      this.kinetics.setHipAndAds(this.current.hipPos, this.current.adsPos, false);
    }
  }

  getCurrentWeapon() {
    return {
      type: this.current.type,
      id: this.current.id,
      name: this.current.name,
      slot: this.current.slot,
      mag: this.current.ammo,
      ammo: this.current.ammo,
      magSize: this.current.magSize,
      reserve: this.current.reserve,
      isReloading: this.state === "reloading",
      reloadPhase: this.reloadPhase,
      isADS: this.isAds,
      damage: this.current.damage,
      rpm: this.current.rpm,
      cooldown: this.current.cooldown,
      spread: this.current.spread,
      adsSpread: this.current.adsSpread,
      adsFov: this.current.adsFov,
      hipFov: this.current.hipFov,
      hasScope: this.current.hasScope,
      viewmodel: this.current.viewmodel,
      hipPos: this.current.hipPos,
      adsPos: this.current.adsPos,
    };
  }

  selectWeapon(slotIndex) {
    let targetIndex = slotIndex;

    // Handle 1-based indexing (e.g. slots 1-4) or string weapon id
    if (typeof targetIndex === "string") {
      targetIndex = this.weapons.findIndex(
        (w) => w.id === slotIndex || w.type === slotIndex
      );
    } else if (typeof targetIndex === "number") {
      if (targetIndex >= 1 && targetIndex <= 4 && !this.weapons[targetIndex]) {
        targetIndex = targetIndex - 1;
      }
    }

    if (
      targetIndex < 0 ||
      targetIndex >= this.weapons.length ||
      targetIndex === this.currentIndex
    ) {
      return false;
    }

    // Cannot switch while mid-switch
    if (this.state === "switching") return false;

    // Interrupt reload if switching
    if (this.state === "reloading") {
      this.cancelReload();
    }

    this.state = "switching";
    this.switchTimer = 0.28;
    this.setAds(false);

    // Swap viewmodel mesh visibility
    this.current.viewmodel.visible = false;
    this.currentIndex = targetIndex;
    this.current = this.weapons[this.currentIndex];
    this.current.viewmodel.visible = true;

    if (this.kinetics?.setHipAndAds) {
      this.kinetics.setHipAndAds(this.current.hipPos, this.current.adsPos, false);
    }

    this.audio?.ui?.();
    return true;
  }

  nextWeapon() {
    const nextIdx = (this.currentIndex + 1) % this.weapons.length;
    return this.selectWeapon(nextIdx);
  }

  prevWeapon() {
    const prevIdx =
      (this.currentIndex - 1 + this.weapons.length) % this.weapons.length;
    return this.selectWeapon(prevIdx);
  }

  setAds(active) {
    const next = Boolean(active);
    if (this.isAds === next) return this.isAds;
    this.isAds = next;
    this.audio?.ads?.(this.isAds);
    if (this.kinetics?.setHipAndAds) {
      this.kinetics.setHipAndAds(
        this.current.hipPos,
        this.current.adsPos,
        this.isAds
      );
    }
    return this.isAds;
  }

  toggleAds() {
    return this.setAds(!this.isAds);
  }

  canFire() {
    return (
      this.state !== "reloading" &&
      this.state !== "switching" &&
      this.fireTimer <= 0 &&
      this.current.ammo > 0
    );
  }

  reload() {
    return this.startReload();
  }

  startReload() {
    // Guards: already reloading, switching, full mag, or empty reserve
    if (
      this.state === "reloading" ||
      this.state === "switching" ||
      this.current.ammo >= this.current.magSize ||
      this.current.reserve <= 0
    ) {
      return false;
    }

    this.state = "reloading";
    this.reloadTotalTime = this.current.reloadTime;
    this.reloadTimer = 0;
    this.setAds(false);

    // Enter Stage 0: mag-out
    this.reloadPhase = RELOAD_STAGES.MAG_OUT;
    this.lastReloadPhaseReported = 0;
    this.audio?.reloadPhase?.(0);

    return true;
  }

  cancelReload() {
    if (this.state !== "reloading") return;
    this.state = "idle";
    this.reloadPhase = RELOAD_STAGES.NONE;
    this.reloadTimer = 0;
    this.reloadTotalTime = 0;
    this.lastReloadPhaseReported = -1;
  }

  /**
   * Fires the current weapon in the specified direction.
   * Computes dynamic spread cone based on hip vs ADS stance.
   * Strictly tracks ammunition and fire cooldowns.
   */
  fire(origin = null, direction = null, isADS = null) {
    const ads = isADS !== null ? isADS : this.isAds;

    if (this.current.ammo <= 0) {
      this.audio?.dryClick?.();
      this.startReload();
      return { fired: false, reason: "empty" };
    }

    if (!this.canFire()) {
      return { fired: false, reason: "cooldown" };
    }

    // Consume 1 round
    this.current.ammo--;
    this.fireTimer = this.current.cooldown;
    this.recoil = 1.0;

    const fireOrigin =
      origin ||
      (this.camera ? this.camera.position.clone() : new THREE.Vector3(0, 0, 0));

    let baseDir;
    if (direction) {
      baseDir = direction.clone().normalize();
    } else if (this.camera) {
      baseDir = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(this.camera.quaternion)
        .normalize();
    } else {
      baseDir = new THREE.Vector3(0, 0, -1);
    }

    // Play weapon fire sound via TacticalAudio
    this.#playWeaponSound(fireOrigin);

    // Apply kinetic kick if kinetics system is attached
    if (this.kinetics) {
      const pitchMul = ads ? 0.6 : 1.0;
      const yawMul = ads ? 0.5 : 1.0;
      const kickMul = ads ? 0.55 : 1.0;
      this.kinetics.addRecoil?.(
        this.current.recoilPitch * pitchMul,
        this.current.recoilYaw * yawMul,
        this.current.kickBack * kickMul
      );
    }

    // Grenade projectile throw arc
    if (this.current.type === WEAPON_TYPES.GRENADE) {
      const throwDir = baseDir.clone();
      throwDir.y += 0.15;
      throwDir.normalize();
      const velocity = throwDir.clone().multiplyScalar(this.current.throwVelocity || 18);

      if (this.physicsWorld?.spawnGrenade) {
        this.physicsWorld.spawnGrenade(
          fireOrigin,
          velocity,
          this.current.damage,
          this.current.blastRadius,
          this.current.fuseTime
        );
      }

      return {
        fired: true,
        weapon: this.getCurrentWeapon(),
        grenade: {
          origin: fireOrigin,
          velocity,
          damage: this.current.damage,
          radius: this.current.blastRadius,
          fuse: this.current.fuseTime,
        },
        hits: [],
      };
    }

    // Dynamic raycast spread cone
    const hits = [];
    const pellets = this.current.pellets || 1;
    const baseSpread = ads ? this.current.adsSpread : this.current.spread;

    for (let p = 0; p < pellets; p++) {
      const spreadDir = baseDir.clone();
      // Orthogonal perturbation vector
      const spreadX = (Math.random() - 0.5) * baseSpread;
      const spreadY = (Math.random() - 0.5) * baseSpread;
      const spreadZ = (Math.random() - 0.5) * baseSpread;

      spreadDir.x += spreadX;
      spreadDir.y += spreadY;
      spreadDir.z += spreadZ;
      spreadDir.normalize();

      if (this.physicsWorld?.raycast) {
        const to = fireOrigin.clone().addScaledVector(spreadDir, 300);
        const hit = this.physicsWorld.raycast(fireOrigin, to);
        if (hit) hits.push(hit);
      }
    }

    return {
      fired: true,
      weapon: this.getCurrentWeapon(),
      hits,
      spread: baseSpread,
      pellets,
    };
  }

  /**
   * Compatibility method for main game loop.
   * Bridges camera raycasting, screen burst VFX, and physics grenades.
   */
  executeFire({ onRaycastHit, onSpawnGrenade, enemies = [] } = {}) {
    if (this.current.ammo <= 0) {
      this.audio?.dryClick?.();
      this.startReload();
      return { fired: false, reason: "empty" };
    }

    if (!this.canFire()) {
      return { fired: false, reason: "cooldown" };
    }

    this.current.ammo--;
    this.fireTimer = this.current.cooldown;
    this.recoil = 1.0;

    const fireOrigin = this.camera ? this.camera.position.clone() : new THREE.Vector3();

    // Kinetic recoil
    if (this.kinetics) {
      const recoilPitch = this.current.recoilPitch * (this.isAds ? 0.6 : 1.0);
      const recoilYaw = this.current.recoilYaw * (this.isAds ? 0.5 : 1.0);
      const kickBack = this.current.kickBack * (this.isAds ? 0.55 : 1.0);
      this.kinetics.addRecoil(recoilPitch, recoilYaw, kickBack);
    }

    this.#playWeaponSound(fireOrigin);

    // Grenade projectile throw vs raycast fire
    if (this.current.type === WEAPON_TYPES.GRENADE) {
      if (onSpawnGrenade && this.camera) {
        const throwDir = new THREE.Vector3(0, 0, -1).applyQuaternion(
          this.camera.quaternion
        );
        throwDir.y += 0.15;
        throwDir.normalize();
        const spawnPos = this.camera.position.clone().addScaledVector(throwDir, 0.8);
        const velocity = throwDir.multiplyScalar(this.current.throwVelocity || 18);
        onSpawnGrenade(
          spawnPos,
          velocity,
          this.current.damage,
          this.current.blastRadius,
          this.current.fuseTime
        );
      }
      return { fired: true, weapon: this.getCurrentWeapon(), hits: [] };
    }

    // Raycast hitscan with multi-pellet spread cone
    const hits = [];
    const pellets = this.current.pellets || 1;
    const baseSpread = this.isAds ? this.current.adsSpread : this.current.spread;

    for (let p = 0; p < pellets; p++) {
      const spreadX = (Math.random() - 0.5) * baseSpread;
      const spreadY = (Math.random() - 0.5) * baseSpread;

      let raycaster;
      if (this.camera) {
        raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), this.camera);
      }

      if (onRaycastHit && raycaster) {
        const result = onRaycastHit(raycaster, this.current.damage, p);
        if (result) hits.push(result);
      }
    }

    return { fired: true, weapon: this.getCurrentWeapon(), hits };
  }

  #playWeaponSound(worldPos = null) {
    if (!this.audio) return;

    if (typeof this.audio.shot === "function") {
      this.audio.shot(this.current.type, worldPos);
      return;
    }

    // Fallback to individual method signatures
    switch (this.current.type) {
      case WEAPON_TYPES.CARBINE:
        this.audio.fireCarbine?.(worldPos) || this.audio.fire?.(worldPos);
        break;
      case WEAPON_TYPES.SHOTGUN:
        this.audio.fireShotgun?.(worldPos) || this.audio.fire?.(worldPos);
        break;
      case WEAPON_TYPES.SNIPER:
        this.audio.fireSniper?.(worldPos) || this.audio.fire?.(worldPos);
        break;
      case WEAPON_TYPES.GRENADE:
        this.audio.explosion?.(worldPos) || this.audio.fire?.(worldPos);
        break;
      default:
        this.audio.fire?.(worldPos);
    }
  }

  /**
   * Frame update driving cooldown timers, 4-stage tactical reload, and viewmodel kinetics.
   */
  update(dt, { moving = false, sprinting = false } = {}) {
    const delta = Math.max(0, dt);

    // Fire cooldown tick
    this.fireTimer = Math.max(0, this.fireTimer - delta);

    // Switching timer tick
    if (this.state === "switching") {
      this.switchTimer -= delta;
      if (this.switchTimer <= 0) {
        this.state = "idle";
      }
    }

    // 4-Stage Tactical Reload State Machine
    if (this.state === "reloading") {
      this.reloadTimer += delta;
      const progress = Math.min(1.0, this.reloadTimer / this.reloadTotalTime);

      // Phase 0: 0.00 -> 0.35 [mag-out]
      // Phase 1: 0.35 -> 0.70 [mag-in]
      // Phase 2: 0.70 -> 0.95 [bolt-rack]
      // Phase 3: 0.95 -> 1.00 [ready]
      if (progress < 0.35) {
        if (this.lastReloadPhaseReported !== 0) {
          this.reloadPhase = RELOAD_STAGES.MAG_OUT;
          this.lastReloadPhaseReported = 0;
          this.audio?.reloadPhase?.(0);
        }
      } else if (progress < 0.7) {
        if (this.lastReloadPhaseReported !== 1) {
          this.reloadPhase = RELOAD_STAGES.MAG_IN;
          this.lastReloadPhaseReported = 1;
          this.audio?.reloadPhase?.(1);
        }
      } else if (progress < 0.95) {
        if (this.lastReloadPhaseReported !== 2) {
          this.reloadPhase = RELOAD_STAGES.BOLT_RACK;
          this.lastReloadPhaseReported = 2;
          this.audio?.reloadPhase?.(2);
        }
      } else {
        if (this.lastReloadPhaseReported !== 3) {
          this.reloadPhase = RELOAD_STAGES.READY;
          this.lastReloadPhaseReported = 3;
          this.audio?.reloadPhase?.(3);
        }
      }

      // Reload completion and strict ammo conservation
      if (progress >= 1.0) {
        const needed = this.current.magSize - this.current.ammo;
        const available = Math.min(needed, Math.max(0, this.current.reserve));
        this.current.ammo += available;
        this.current.reserve -= available;
        this.current.reserve = Math.max(0, this.current.reserve);

        this.state = "idle";
        this.reloadPhase = RELOAD_STAGES.NONE;
        this.reloadTimer = 0;
        this.reloadTotalTime = 0;
        this.lastReloadPhaseReported = -1;
      }
    }

    // Update kinetic springs and apply to viewmodel group
    if (this.kinetics) {
      this.kinetics.update(delta, {
        moving,
        sprinting,
        isAds: this.isAds,
        hipPos: this.current.hipPos,
        adsPos: this.current.adsPos,
      });
      this.kinetics.applyToViewmodel?.(this.viewmodelRoot);
    }

    // Hide viewmodel under sniper optic ADS for unobstructed scope overlay
    if (this.current.hasScope && this.isAds) {
      this.current.viewmodel.visible = false;
    } else {
      this.current.viewmodel.visible = true;
    }
  }
}

/**
 * Backward compatibility alias for existing codebase imports.
 */
export const WeaponManager = WeaponArsenal;
