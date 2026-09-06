import * as THREE from "three";

export class WeaponAnimator {
  constructor(root) { this.root = root; this.time = 0; this.bob = 0; this.sway = new THREE.Vector2(); }
  update(dt, { moving = false, sprinting = false, recoil = 0, reloading = false } = {}) {
    this.time += dt;
    const speed = sprinting ? 13 : 8;
    const amp = moving ? (sprinting ? 0.055 : 0.026) : 0.008;
    this.bob = THREE.MathUtils.damp(this.bob, moving ? 1 : 0, 10, dt);
    this.root.position.x = THREE.MathUtils.damp(this.root.position.x, 0.31 + Math.sin(this.time * speed) * amp, 16, dt);
    this.root.position.y = THREE.MathUtils.damp(this.root.position.y, -0.26 + Math.abs(Math.cos(this.time * speed)) * amp * 0.55, 16, dt);
    this.root.rotation.x = THREE.MathUtils.damp(this.root.rotation.x, -0.04 - recoil * 0.12 + (reloading ? Math.sin(this.time * 12) * 0.12 : 0), 20, dt);
    this.root.rotation.z = THREE.MathUtils.damp(this.root.rotation.z, sprinting ? -0.13 : 0, 12, dt);
  }
}

export function animateEnemyRig(group, time, seed, intensity = 1) {
  const body = group.children[0];
  const head = group.children[2];
  if (body) body.rotation.z = Math.sin(time * 6 + seed) * 0.015 * intensity;
  if (head) head.rotation.y = Math.sin(time * 1.8 + seed) * 0.08 * intensity;
}
