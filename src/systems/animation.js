import * as THREE from "three";
import { SpringDamper3D, WeaponKinetics, DEFAULT_HIP_POS, DEFAULT_ADS_POS } from "./kinetics.js";

export const WEAPON_STATES = Object.freeze({
  IDLE: "idle",
  FIRE: "fire",
  RELOAD: "reload",
  ADS: "ADS glide",
  SPRINT: "sprint down",
});

/**
 * Procedural Viewmodel Weapon Animator.
 * Integrates 3 second-order damped harmonic oscillators (recoil, sway, ADS glide)
 * into viewmodel transforms, manages tactical weapon states, harmonic head bobbing,
 * and non-linear camera trauma screen shake.
 */
export class WeaponAnimator {
  /**
   * @param {THREE.Object3D|object|null} rootOrOptions - Viewmodel root Object3D or options object
   * @param {WeaponKinetics|null} maybeKinetics - WeaponKinetics instance (optional)
   * @param {object} options - Optional configuration parameters
   */
  constructor(rootOrOptions = null, maybeKinetics = null, options = {}) {
    let root = null;
    let config = options;

    if (rootOrOptions && (rootOrOptions.isObject3D || rootOrOptions.position)) {
      root = rootOrOptions;
    } else if (rootOrOptions && typeof rootOrOptions === "object") {
      config = { ...rootOrOptions, ...options };
      if (config.root) root = config.root;
    }

    this.root = root;
    this.kinetics = maybeKinetics || (config.kinetics ? config.kinetics : new WeaponKinetics(config));

    // Direct access to calibrated spring dampers
    this.recoilSpring = this.kinetics.recoilSpring;
    this.swaySpring = this.kinetics.swaySpring;
    this.adsSpring = this.kinetics.adsSpring;

    // Tactical weapon states: 'idle' | 'fire' | 'reload' | 'ADS glide' | 'sprint down'
    this.state = WEAPON_STATES.IDLE;
    this.isAds = false;
    this.isSprinting = false;
    this.isMoving = false;

    // Multi-phase procedural reload sequencer
    this.reloadTime = 0;
    this.reloadDuration = 1.6;
    this.reloadPhase = 0;
    this.onReloadComplete = null;

    // Fire state transient timer
    this.fireStateTimer = 0;

    // Harmonic head bobbing state
    this.bobPhase = 0;
    this.bobOffset = new THREE.Vector3();
    this.prevSinBob = 0;
    this.onFootstep = config.onFootstep || null;

    // Camera trauma shake state
    this.trauma = 0;
    this.shakeRotation = new THREE.Vector3();

    // Internal time accumulator
    this.time = 0;
  }

  setKinetics(kinetics) {
    if (!kinetics) return;
    this.kinetics = kinetics;
    this.recoilSpring = kinetics.recoilSpring;
    this.swaySpring = kinetics.swaySpring;
    this.adsSpring = kinetics.adsSpring;
  }

  setRoot(root) {
    this.root = root;
  }

  getState() {
    return this.state;
  }

  setState(newState) {
    this.state = newState;
  }

  /**
   * Applies recoil kick impulse to the recoil spring damper and triggers camera trauma.
   * Calibrated recoil impulse: ((RND - 0.5) * 0.015, 0.045, 0.13)
   * Pitch rotation rise: -y_recoil * 3.0
   * @param {THREE.Vector3|{x?:number, y?:number, z?:number}|null} recoilImpulseVector
   */
  triggerRecoil(recoilImpulseVector = null) {
    const impulse = recoilImpulseVector || new THREE.Vector3(
      (Math.random() - 0.5) * 0.015,
      0.045,
      0.13
    );

    this.recoilSpring.applyImpulse(impulse);
    this.addTrauma(this.isAds ? 0.12 : 0.28);

    if (this.state !== WEAPON_STATES.RELOAD) {
      this.state = WEAPON_STATES.FIRE;
      this.fireStateTimer = 0.08;
    }
  }

  /**
   * Injects mouse / touch look delta lag into the sway spring damper.
   * Calibrated sway impulse: (-dx * 0.0004, dy * 0.0004, 0)
   * Yaw tilt rotation: +x_sway * 2.0
   * @param {number} deltaX
   * @param {number} deltaY
   * @param {number} factor
   */
  applyLookSway(deltaX, deltaY, factor = 0.0004) {
    this.swaySpring.applyImpulse(
      new THREE.Vector3(-deltaX * factor, deltaY * factor, 0)
    );
  }

  /**
   * Toggles Aim-Down-Sights (ADS) glide between hip-fire and ADS target coordinates.
   * Hip target: (0.22, -0.21, -0.40)
   * ADS target: (0.00, -0.138, -0.30)
   * @param {boolean} isADS
   */
  setADS(isADS) {
    this.isAds = !!isADS;
    this.kinetics.setADS(this.isAds);
    if (this.state !== WEAPON_STATES.RELOAD) {
      this.state = this.isAds ? WEAPON_STATES.ADS : (this.isSprinting ? WEAPON_STATES.SPRINT : WEAPON_STATES.IDLE);
    }
  }

  /**
   * Initiates multi-stage tactical reload cycle with procedural weapon tilt.
   * @param {number} duration - Reload duration in seconds (default 1.6s)
   * @param {function|null} onComplete - Callback invoked upon reload completion
   */
  startReload(duration = 1.6, onComplete = null) {
    this.state = WEAPON_STATES.RELOAD;
    this.reloadDuration = duration;
    this.reloadTime = 0;
    this.reloadPhase = 0;
    this.onReloadComplete = onComplete;
  }

  /**
   * Adds non-linear camera screen trauma shake.
   * @param {number} amount - Trauma increment [0..1]
   */
  addTrauma(amount = 0.28) {
    this.trauma = Math.min(1.0, Math.max(0, this.trauma + amount));
    this.kinetics.addTrauma(amount);
  }

  getShakeRotation() {
    return this.shakeRotation;
  }

  getBobOffset() {
    return this.bobOffset;
  }

  /**
   * Main animation step integrating spring dampers, head bob, trauma shake,
   * and tactical weapon state transformations into viewmodel transform.
   *
   * Supports both function signatures:
   * 1. update(delta, isMoving, isSprinting, velocityRatio, onFootstep)
   * 2. update(delta, { moving, sprinting, isAds, hipPos, adsPos, speed, maxSpeed, onFootstep })
   */
  update(delta, arg2, arg3, arg4, arg5) {
    const dt = Math.min(Math.max(delta, 0), 0.05);
    this.time += dt;

    let moving = false;
    let sprinting = false;
    let isAds = this.isAds;
    let hipPos = this.kinetics.hipPos;
    let adsPos = this.kinetics.adsPos;
    let velocityRatio = 1.0;
    let onFootstep = this.onFootstep;

    if (arg2 && typeof arg2 === "object") {
      moving = !!arg2.moving;
      sprinting = !!arg2.sprinting;
      if (arg2.isAds !== undefined) isAds = !!arg2.isAds;
      if (arg2.hipPos) hipPos = arg2.hipPos;
      if (arg2.adsPos) adsPos = arg2.adsPos;
      if (arg2.velocityRatio !== undefined) velocityRatio = arg2.velocityRatio;
      else if (arg2.speed !== undefined && arg2.maxSpeed) velocityRatio = Math.min(1, Math.max(0, arg2.speed / arg2.maxSpeed));
      if (arg2.onFootstep) onFootstep = arg2.onFootstep;
    } else {
      moving = !!arg2;
      sprinting = !!arg3;
      if (typeof arg4 === "number") velocityRatio = arg4;
      if (typeof arg5 === "function") onFootstep = arg5;
    }

    this.isMoving = moving;
    this.isSprinting = sprinting;
    this.isAds = isAds;

    // Synchronize kinetics targets
    this.kinetics.setHipAndAds(hipPos, adsPos, this.isAds);

    // 1. Update 2nd-order spring dampers
    this.recoilSpring.update(dt);
    this.swaySpring.update(dt);
    this.adsSpring.update(dt);

    // 2. Fire state transient timer
    if (this.state === WEAPON_STATES.FIRE) {
      this.fireStateTimer -= dt;
      if (this.fireStateTimer <= 0) {
        this.state = this.isAds ? WEAPON_STATES.ADS : (this.isSprinting ? WEAPON_STATES.SPRINT : WEAPON_STATES.IDLE);
      }
    }

    // 3. Procedural multi-stage reload sequence
    const reloadOffset = new THREE.Vector3();
    let reloadRotZ = 0;
    let reloadPitch = 0;

    if (this.state === WEAPON_STATES.RELOAD) {
      this.reloadTime += dt;
      const progress = this.reloadTime / this.reloadDuration;

      if (progress < 0.25) {
        // Phase 0: Drop magazine downwards and roll viewmodel
        this.reloadPhase = 0;
        reloadOffset.set(0.04, -0.08, 0.03);
        reloadRotZ = -0.35;
        reloadPitch = -0.10;
      } else if (progress < 0.65) {
        // Phase 1: Reach for fresh magazine
        this.reloadPhase = 1;
        reloadOffset.set(0.02, -0.10, 0.05);
        reloadRotZ = -0.45;
        reloadPitch = -0.14;
      } else if (progress < 1.0) {
        // Phase 2: Insert magazine with mechanical impulse
        if (this.reloadPhase === 1) {
          this.reloadPhase = 2;
          this.recoilSpring.applyImpulse(new THREE.Vector3(0, 0.02, -0.04));
        }
        const t = (progress - 0.65) / 0.35;
        reloadOffset.set(0.02 * (1 - t), -0.05 * (1 - t), 0.02 * (1 - t));
        reloadRotZ = -0.20 * (1 - t);
        reloadPitch = -0.06 * (1 - t);
      } else {
        // Reload completed
        this.state = this.isAds ? WEAPON_STATES.ADS : (this.isSprinting ? WEAPON_STATES.SPRINT : WEAPON_STATES.IDLE);
        if (typeof this.onReloadComplete === "function") {
          this.onReloadComplete();
          this.onReloadComplete = null;
        }
      }
    } else if (this.state !== WEAPON_STATES.FIRE) {
      if (this.isAds) {
        this.state = WEAPON_STATES.ADS;
      } else if (this.isSprinting && this.isMoving) {
        this.state = WEAPON_STATES.SPRINT;
      } else {
        this.state = WEAPON_STATES.IDLE;
      }
    }

    // 4. Harmonic head bobbing:
    // phi_{t+dt} = phi_t + dt * (isSprinting ? 15 : 10) * (v_xz / v_max)
    // bob_y = sin(phi) * 0.035
    // bob_x = cos(0.5 * phi) * 0.020
    // Footstep callback at trough sin(phi) < -0.88
    if (this.isMoving) {
      const bobRate = (this.isSprinting ? 15 : 10) * Math.max(0.2, velocityRatio);
      this.bobPhase += dt * bobRate;

      const sinVal = Math.sin(this.bobPhase);
      this.bobOffset.y = sinVal * 0.035;
      this.bobOffset.x = Math.cos(this.bobPhase * 0.5) * 0.020;

      if (sinVal < -0.88 && this.prevSinBob >= -0.88) {
        if (typeof onFootstep === "function") {
          onFootstep();
        }
      }
      this.prevSinBob = sinVal;
    } else {
      this.bobOffset.multiplyScalar(Math.max(0, 1 - dt * 10));
      this.prevSinBob = 0;
    }

    // Keep kinetics bobOffset in sync
    this.kinetics.bobOffset.copy(this.bobOffset);

    // 5. Non-linear camera trauma shake:
    // tau_{t+dt} = max(0, tau_t - 1.35 * dt)
    // shake = tau^2
    // rotational perturbation +/- 0.05 * tau^2
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 1.35 * dt);
      const shake = this.trauma * this.trauma;
      this.shakeRotation.set(
        (Math.random() - 0.5) * 0.05 * shake,
        (Math.random() - 0.5) * 0.05 * shake,
        (Math.random() - 0.5) * 0.03 * shake
      );
    } else {
      this.shakeRotation.set(0, 0, 0);
    }
    this.kinetics.trauma = this.trauma;
    this.kinetics.shakeRot.copy(this.shakeRotation);

    // 6. Tactical sprint down pose
    const isSprintDown = (this.state === WEAPON_STATES.SPRINT);
    const sprintFactor = isSprintDown ? 1.0 : 0.0;
    const sprintOffset = new THREE.Vector3(
      0.03 * sprintFactor,
      -0.07 * sprintFactor,
      0.02 * sprintFactor
    );
    const sprintPitch = -0.15 * sprintFactor;
    const sprintYaw = 0.12 * sprintFactor;
    const sprintRoll = -0.32 * sprintFactor;

    // 7. Apply combined transformation to viewmodelRoot if present
    if (this.root) {
      const bobFactor = this.isAds ? 0.2 : 1.0;

      // Position: adsSpring + swaySpring + bobOffset + reloadOffset + sprintOffset
      this.root.position.set(
        this.adsSpring.position.x + this.swaySpring.position.x + this.bobOffset.x * bobFactor + reloadOffset.x + sprintOffset.x,
        this.adsSpring.position.y + this.swaySpring.position.y + this.bobOffset.y * bobFactor + reloadOffset.y + sprintOffset.y,
        this.adsSpring.position.z + this.recoilSpring.position.z + reloadOffset.z + sprintOffset.z
      );

      // Rotation:
      // Pitch: -y_recoil * 3.0 + reloadPitch + sprintPitch + bobPitch
      // Yaw: +x_sway * 2.0 + sprintYaw + bobYaw
      // Roll: reloadRotZ + sprintRoll
      const pitch = -this.recoilSpring.position.y * 3.0 + reloadPitch + sprintPitch + (this.bobOffset.y * 0.5 * bobFactor);
      const yaw = this.swaySpring.position.x * 2.0 + sprintYaw + (this.bobOffset.x * 0.5 * bobFactor);
      const roll = reloadRotZ + sprintRoll;

      this.root.rotation.set(pitch, yaw, roll);
    }
  }
}

/**
 * Animates robotic enemy torso and sensory head components.
 * Retained for enemy character meshes and backward compatibility.
 * @param {THREE.Group} group
 * @param {number} time
 * @param {number} seed
 * @param {number} intensity
 */
export function animateEnemyRig(group, time, seed, intensity = 1) {
  if (!group || !group.children) return;
  const body = group.children[0];
  const head = group.children[2];
  if (body) body.rotation.z = Math.sin(time * 6 + seed) * 0.015 * intensity;
  if (head) head.rotation.y = Math.sin(time * 1.8 + seed) * 0.08 * intensity;
}
