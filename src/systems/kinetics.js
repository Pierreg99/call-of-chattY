import * as THREE from "three";

/**
 * 2nd-Order Continuous Damped Harmonic Oscillator (SpringDamper3D).
 * Governed by the differential equation:
 *   m * d2x/dt2 + c * dx/dt + k * (x - x_target) = F_ext
 * For unit mass (m = 1):
 *   a = -k * (x - x_target) - c * v
 *
 * Numerical integration via discrete Euler step with dt stability clamp
 * delta_t_eff = min(delta_t, 0.05s) and velocity clamp ||v|| <= 25 m/s.
 * Sourced from futuristic-call-of-shooty with zero-allocation performance optimization.
 */
export class SpringDamper3D {
  /**
   * @param {number} stiffness - Spring constant k (default 200)
   * @param {number} damping - Damping coefficient c (default 18)
   * @param {THREE.Vector3|null} initialPos - Initial position
   */
  constructor(stiffness = 200, damping = 18, initialPos = null) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.target = new THREE.Vector3();

    if (initialPos) {
      this.position.copy(initialPos);
      this.target.copy(initialPos);
    }
  }

  /**
   * Evaluates discrete Euler numerical integration step.
   * Stability clamp: delta_t_eff = min(max(delta, 0), 0.05s).
   * Velocity clamp: ||v|| <= 25 m/s.
   * Position step: x_{t+dt} = x_t + v_{t+dt} * delta_t_eff.
   * @param {number} delta - Frame delta time in seconds
   */
  update(delta) {
    const dt = Math.min(Math.max(delta, 0), 0.05);
    if (dt <= 0) return;

    // Acceleration a = -k * (x - x_target) - c * v
    const dx = this.position.x - this.target.x;
    const dy = this.position.y - this.target.y;
    const dz = this.position.z - this.target.z;

    const ax = -this.stiffness * dx - this.damping * this.velocity.x;
    const ay = -this.stiffness * dy - this.damping * this.velocity.y;
    const az = -this.stiffness * dz - this.damping * this.velocity.z;

    this.velocity.x += ax * dt;
    this.velocity.y += ay * dt;
    this.velocity.z += az * dt;

    // Velocity clamp ||v|| <= 25 m/s
    const vSq = this.velocity.x * this.velocity.x +
                this.velocity.y * this.velocity.y +
                this.velocity.z * this.velocity.z;
    const maxV = 25;
    if (vSq > maxV * maxV) {
      const scale = maxV / Math.sqrt(vSq);
      this.velocity.x *= scale;
      this.velocity.y *= scale;
      this.velocity.z *= scale;
    }

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;
  }

  /**
   * Injects an instantaneous velocity impulse into the oscillator.
   * @param {THREE.Vector3|{x?:number, y?:number, z?:number}} impulse
   */
  applyImpulse(impulse) {
    if (!impulse) return;
    this.velocity.x += impulse.x || 0;
    this.velocity.y += impulse.y || 0;
    this.velocity.z += impulse.z || 0;

    const vSq = this.velocity.lengthSq();
    const maxV = 25;
    if (vSq > maxV * maxV) {
      this.velocity.multiplyScalar(maxV / Math.sqrt(vSq));
    }
  }

  /**
   * Sets target equilibrium position.
   * @param {THREE.Vector3|{x?:number, y?:number, z?:number}} target
   */
  setTarget(target) {
    if (!target) return;
    if (target.x !== undefined) this.target.x = target.x;
    if (target.y !== undefined) this.target.y = target.y;
    if (target.z !== undefined) this.target.z = target.z;
  }

  /**
   * Sets current position.
   * @param {THREE.Vector3|{x?:number, y?:number, z?:number}} pos
   */
  setPosition(pos) {
    if (!pos) return;
    if (pos.x !== undefined) this.position.x = pos.x;
    if (pos.y !== undefined) this.position.y = pos.y;
    if (pos.z !== undefined) this.position.z = pos.z;
  }

  /**
   * Instantly snaps position to target and zeroes velocity.
   */
  snapToTarget() {
    this.position.copy(this.target);
    this.velocity.set(0, 0, 0);
  }

  /**
   * Resets position, target, and velocity.
   * @param {THREE.Vector3|null} pos
   */
  reset(pos = null) {
    if (pos) {
      this.position.copy(pos);
      this.target.copy(pos);
    } else {
      this.position.set(0, 0, 0);
      this.target.set(0, 0, 0);
    }
    this.velocity.set(0, 0, 0);
  }
}

/**
 * Calibrated spring default vectors and parameters:
 * - Recoil: k=240, c=20, impulse ((RND - 0.5) * 0.015, 0.045, 0.13), pitch rotation -y_recoil * 3.0
 * - Sway: k=140, c=15, impulse (-dx * 0.0004, dy * 0.0004, 0), yaw tilt +x_sway * 2.0
 * - ADS: k=170, c=16, targets x_hip = (0.22, -0.21, -0.40), x_ads = (0.00, -0.138, -0.30)
 */
export const DEFAULT_HIP_POS = Object.freeze(new THREE.Vector3(0.22, -0.21, -0.40));
export const DEFAULT_ADS_POS = Object.freeze(new THREE.Vector3(0.00, -0.138, -0.30));

export function createRecoilSpring() {
  return new SpringDamper3D(240, 20);
}

export function createSwaySpring() {
  return new SpringDamper3D(140, 15);
}

export function createAdsSpring(initialHip = DEFAULT_HIP_POS) {
  return new SpringDamper3D(170, 16, initialHip);
}

/**
 * Composite weapon kinetics pipeline coordinating recoil, look sway, ADS spring,
 * procedural bobbing, and camera screen trauma shake.
 */
export class WeaponKinetics {
  constructor({
    recoilStiffness = 240,
    recoilDamping = 20,
    swayStiffness = 140,
    swayDamping = 15,
    adsStiffness = 170,
    adsDamping = 16,
    hipPos = DEFAULT_HIP_POS,
    adsPos = DEFAULT_ADS_POS,
  } = {}) {
    this.recoilSpring = new SpringDamper3D(recoilStiffness, recoilDamping);
    this.swaySpring = new SpringDamper3D(swayStiffness, swayDamping);
    this.adsSpring = new SpringDamper3D(adsStiffness, adsDamping, hipPos);

    this.hipPos = new THREE.Vector3().copy(hipPos);
    this.adsPos = new THREE.Vector3().copy(adsPos);
    this.isAds = false;

    // Harmonic head bobbing state
    this.bobPhase = 0;
    this.bobOffset = new THREE.Vector3();
    this.prevSinBob = 0;

    // Camera trauma shake state
    this.trauma = 0;
    this.shakeRot = new THREE.Vector3();

    // Procedural modifiers
    this.sprintTilt = 0;
    this.tacSprintTilt = 0;
    this.slideTilt = 0;
    this.reloadRoll = 0;
    this.reloadPitch = 0;
    this.reloadOffset = new THREE.Vector3();

    // Tactical Weapon Inspection state
    this.inspectTimer = 0;
    this.inspectDuration = 2.4;
    this.inspectPitch = 0;
    this.inspectYaw = 0;
    this.inspectRoll = 0;
  }

  triggerInspect() {
    if (this.isAds) return false;
    this.inspectTimer = this.inspectDuration;
    return true;
  }

  setHipAndAds(hipPos, adsPos, isAds = false) {
    if (hipPos) this.hipPos.copy(hipPos);
    if (adsPos) this.adsPos.copy(adsPos);
    this.isAds = isAds;
    this.adsSpring.setTarget(isAds ? this.adsPos : this.hipPos);
    if (this.adsSpring.position.lengthSq() === 0) {
      this.adsSpring.position.copy(this.adsSpring.target);
    }
  }

  setADS(isAds) {
    this.isAds = !!isAds;
    this.adsSpring.setTarget(this.isAds ? this.adsPos : this.hipPos);
  }

  addRecoil(pitch = 0.045, yaw = 0.015, kickBack = 0.13) {
    // Calibrated recoil impulse: ((RND - 0.5) * 0.015, 0.045, 0.13)
    const yawSpread = yaw !== undefined ? yaw : 0.015;
    const pitchImpulse = pitch !== undefined ? pitch : 0.045;
    const kickImpulse = kickBack !== undefined ? kickBack : 0.13;

    this.recoilSpring.applyImpulse(
      new THREE.Vector3(
        (Math.random() - 0.5) * yawSpread,
        pitchImpulse,
        kickImpulse
      )
    );
  }

  addSway(dx, dy, factor = 0.0004) {
    // Calibrated sway impulse: (-dx * 0.0004, dy * 0.0004, 0)
    this.swaySpring.applyImpulse(
      new THREE.Vector3(-dx * factor, dy * factor, 0)
    );
  }

  addTrauma(amount = 0.28) {
    this.trauma = Math.min(1.0, Math.max(0, this.trauma + amount));
  }

  update(dt, { moving = false, sprinting = false, tacSprinting = false, sliding = false, isAds = undefined, hipPos = null, adsPos = null, speed = null, maxSpeed = null, onFootstep = null } = {}) {
    const delta = Math.min(Math.max(dt, 0), 0.05);

    if (hipPos) this.hipPos.copy(hipPos);
    if (adsPos) this.adsPos.copy(adsPos);
    if (isAds !== undefined) this.isAds = !!isAds;

    this.adsSpring.setTarget(this.isAds ? this.adsPos : this.hipPos);

    // Update 3 second-order springs
    this.recoilSpring.update(delta);
    this.swaySpring.update(delta);
    this.adsSpring.update(delta);

    // Harmonic head bobbing:
    if (moving) {
      const velRatio = (speed !== null && maxSpeed) ? Math.min(1, Math.max(0, speed / maxSpeed)) : 1.0;
      const bobFreq = ((tacSprinting ? 20 : (sprinting ? 15 : 10))) * velRatio;
      this.bobPhase += delta * bobFreq;

      const curSin = Math.sin(this.bobPhase);
      this.bobOffset.y = curSin * (tacSprinting ? 0.048 : 0.035);
      this.bobOffset.x = Math.cos(this.bobPhase * 0.5) * (tacSprinting ? 0.028 : 0.020);

      if (curSin < -0.88 && this.prevSinBob >= -0.88) {
        if (typeof onFootstep === "function") {
          onFootstep();
        }
      }
      this.prevSinBob = curSin;
    } else {
      this.bobOffset.multiplyScalar(Math.max(0, 1 - delta * 10));
      this.prevSinBob = 0;
    }

    // Camera trauma non-linear decay:
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 1.35 * delta);
      const shake = this.trauma * this.trauma;
      this.shakeRot.set(
        (Math.random() - 0.5) * 0.05 * shake,
        (Math.random() - 0.5) * 0.05 * shake,
        (Math.random() - 0.5) * 0.03 * shake
      );
    } else {
      this.shakeRot.set(0, 0, 0);
    }

    // Sprint & Tac-Sprint down/up angles
    const targetSprint = (sprinting && !tacSprinting && !this.isAds) ? 1.0 : 0.0;
    this.sprintTilt += (targetSprint - this.sprintTilt) * Math.min(1, delta * 12);

    const targetTacSprint = (tacSprinting && !this.isAds) ? 1.0 : 0.0;
    this.tacSprintTilt += (targetTacSprint - this.tacSprintTilt) * Math.min(1, delta * 14);

    const targetSlide = (sliding && !this.isAds) ? 1.0 : 0.0;
    this.slideTilt += (targetSlide - this.slideTilt) * Math.min(1, delta * 15);

    // Tactical Weapon Inspection calculation
    if (this.inspectTimer > 0) {
      if (this.isAds || sprinting || tacSprinting) {
        this.inspectTimer = 0;
        this.inspectPitch = 0;
        this.inspectYaw = 0;
        this.inspectRoll = 0;
      } else {
        this.inspectTimer -= delta;
        const progress = 1.0 - Math.max(0, this.inspectTimer / this.inspectDuration);

        if (progress < 0.38) {
          // Phase 1: Rotate right to inspect chamber & receiver markings
          const t = progress / 0.38;
          const ease = Math.sin(t * Math.PI * 0.5);
          this.inspectPitch = -0.22 * ease;
          this.inspectYaw = 0.65 * ease;
          this.inspectRoll = -0.48 * ease;
        } else if (progress < 0.72) {
          // Phase 2: Roll left to inspect optic & left bolt catch
          const t = (progress - 0.38) / 0.34;
          const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);
          this.inspectPitch = -0.22 * (1 - ease) + 0.14 * ease;
          this.inspectYaw = 0.65 * (1 - ease) - 0.35 * ease;
          this.inspectRoll = -0.48 * (1 - ease) + 0.32 * ease;
        } else {
          // Phase 3: Settle back smoothly to hipfire
          const t = (progress - 0.72) / 0.28;
          const ease = 1 - Math.sin(t * Math.PI * 0.5);
          this.inspectPitch = 0.14 * ease;
          this.inspectYaw = -0.35 * ease;
          this.inspectRoll = 0.32 * ease;
        }
      }
    } else {
      this.inspectPitch = 0;
      this.inspectYaw = 0;
      this.inspectRoll = 0;
    }
  }

  applyToViewmodel(viewmodelGroup) {
    if (!viewmodelGroup) return;

    const bobFactor = this.isAds ? 0.2 : 1.0;
    const sprintX = 0.03 * this.sprintTilt + 0.06 * this.tacSprintTilt;
    const sprintY = -0.06 * this.sprintTilt - 0.08 * this.tacSprintTilt - 0.04 * this.slideTilt;
    const sprintZ = -0.12 * this.tacSprintTilt;

    viewmodelGroup.position.set(
      this.adsSpring.position.x + this.swaySpring.position.x + this.bobOffset.x * bobFactor + sprintX + this.reloadOffset.x,
      this.adsSpring.position.y + this.swaySpring.position.y + this.bobOffset.y * bobFactor + sprintY + this.reloadOffset.y,
      this.adsSpring.position.z + this.recoilSpring.position.z + sprintZ + this.reloadOffset.z
    );

    // Pitch: -y_recoil * 3.0
    // Yaw: +x_sway * 2.0
    const pitch = -this.recoilSpring.position.y * 3.0 + (this.bobOffset.y * 0.5 * bobFactor) - 0.12 * this.sprintTilt - 0.68 * this.tacSprintTilt + 0.08 * this.slideTilt + this.reloadPitch + this.inspectPitch;
    const yaw = this.swaySpring.position.x * 2.0 + (this.bobOffset.x * 0.5 * bobFactor) + 0.10 * this.sprintTilt + 0.26 * this.tacSprintTilt + this.inspectYaw;
    const roll = this.reloadRoll - 0.25 * this.sprintTilt - 0.20 * this.tacSprintTilt - 0.28 * this.slideTilt + this.inspectRoll;

    viewmodelGroup.rotation.set(pitch, yaw, roll);
  }
}
