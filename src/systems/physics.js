import * as THREE from "three";

export class CapsuleController {
  constructor(camera, { radius = 0.42, height = 1.8, eye = 2.2, gravity = 26 } = {}) {
    this.camera = camera;
    this.radius = radius;
    this.height = height;
    this.eye = eye;
    this.gravity = gravity;
    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.colliders = [];
  }
  setColliders(objects) { this.colliders = objects.filter(Boolean); }
  step(dt, desiredVelocity, jump = false) {
    const v = desiredVelocity.clone();
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, v.x, 14, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, v.z, 14, dt);
    if (jump && this.grounded) { this.velocity.y = 8.2; this.grounded = false; }
    this.velocity.y -= this.gravity * dt;
    const next = this.camera.position.clone().addScaledVector(this.velocity, dt);
    next.y = Math.max(this.eye, next.y);
    if (next.y === this.eye) { this.velocity.y = 0; this.grounded = true; }
    this.camera.position.copy(next);
    this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -88, 88);
    this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -88, 88);
  }
}

export class ProjectileTracer {
  constructor(scene) { this.scene = scene; this.lines = new Set(); }
  spawn(from, to, material) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geometry, material);
    line.userData.life = 0.055;
    this.scene.add(line); this.lines.add(line); return line;
  }
  update(dt) {
    for (const line of this.lines) { line.userData.life -= dt; if (line.userData.life <= 0) { this.scene.remove(line); line.geometry.dispose(); line.material.dispose(); this.lines.delete(line); } }
  }
}
