import * as THREE from "three";

/**
 * Call-of-ChattY AAA Combat Visual Effects (CombatVFX) Engine.
 *
 * Implements retail Call of Duty (MW3 / Black Ops 6) visual standards in native Three.js:
 * 1. Multi-planar volumetric Muzzle Flash with dynamic scene illumination PointLight.
 * 2. Buoyant barrel smoke dissipation with turbulent thermal drift.
 * 3. High-velocity 3D luminous bullet tracers with additive glowing trails.
 * 4. Surface-differentiated impact particle physics:
 *    - Metal: bright ricochet sparks with kinetic bounce
 *    - Concrete: billowing pulverized stone dust and gravel shrapnel
 *    - Cybernetic/Enemy: high-energy plasma discharge and crimson spark bursts
 *    - Dirt/Ground: ballistic crater dust plumes
 * 5. 3D tumbling brass shell casing ejections with floor bounce physics.
 * 6. High-yield volumetric explosive detonations (shockwave ring, fireball core, billowing smoke, shrapnel).
 * 7. Atmospheric suspended micro-particulate (dust motes and embers).
 *
 * Zero-Emoji Protocol strictly enforced.
 */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class CombatVFX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;

    // --- 1. Muzzle Flash & Dynamic Light ---
    this.flashTimer = 0;
    this.flashDuration = 0.045;

    // Dual-plane cross-quad for 3D volumetric appearance
    this.flashGroup = new THREE.Group();
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfff0b3,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const flashGeo1 = new THREE.PlaneGeometry(0.18, 0.18);
    const flashGeo2 = new THREE.PlaneGeometry(0.18, 0.18);
    this.flashMesh1 = new THREE.Mesh(flashGeo1, flashMat);
    this.flashMesh2 = new THREE.Mesh(flashGeo2, flashMat.clone());
    this.flashMesh2.rotation.z = Math.PI / 4;

    this.flashGroup.add(this.flashMesh1);
    this.flashGroup.add(this.flashMesh2);
    this.flashGroup.position.set(0.04, -0.09, -0.72);
    this.flashGroup.visible = false;
    this.camera.add(this.flashGroup);

    // Dynamic point light for muzzle illumination on environment
    this.muzzleLight = new THREE.PointLight(0xffdf80, 0, 18, 2.0);
    this.muzzleLight.position.set(0.04, -0.09, -0.75);
    this.camera.add(this.muzzleLight);

    // Backward compatibility quad reference
    this.quad = this.flashMesh1;

    // --- 2. Barrel Smoke Emitter ---
    this.smokePool = [];
    this.activeSmoke = [];
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const smokeGeo = new THREE.PlaneGeometry(0.15, 0.15);
    for (let i = 0; i < 24; i++) {
      const sm = new THREE.Mesh(smokeGeo, smokeMat.clone());
      sm.visible = false;
      this.smokePool.push(sm);
      if (this.scene) this.scene.add(sm);
    }

    // --- 3. High-Velocity 3D Bullet Tracers ---
    this.tracerPool = [];
    this.activeTracers = [];
    const tracerGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.4, 6);
    tracerGeo.rotateX(Math.PI / 2);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffe484,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < 48; i++) {
      const tMesh = new THREE.Mesh(tracerGeo, tracerMat.clone());
      tMesh.visible = false;
      this.tracerPool.push(tMesh);
      if (this.scene) this.scene.add(tMesh);
    }

    // --- 4. Impact Particle System ---
    this.particlePool = [];
    this.activeParticles = [];
    const pGeo = new THREE.SphereGeometry(0.035, 5, 5);
    for (let i = 0; i < 160; i++) {
      const p = new THREE.Mesh(
        pGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        })
      );
      p.visible = false;
      this.particlePool.push(p);
      if (this.scene) this.scene.add(p);
    }

    // --- 5. Brass Shell Ejections ---
    this.shellPool = [];
    this.activeShells = [];
    const shellGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.048, 6);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.92,
      roughness: 0.22,
    });
    for (let i = 0; i < 36; i++) {
      const s = new THREE.Mesh(shellGeo, shellMat);
      s.visible = false;
      s.castShadow = true;
      this.shellPool.push(s);
      if (this.scene) this.scene.add(s);
    }

    // --- 5b. Persistent Bullet Hole Decals ---
    this.decalPool = [];
    this.activeDecals = [];
    const decalGeo = new THREE.PlaneGeometry(0.08, 0.08);
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x111314,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 64; i++) {
      const d = new THREE.Mesh(decalGeo, decalMat.clone());
      d.visible = false;
      this.decalPool.push(d);
      if (this.scene) this.scene.add(d);
    }

    // --- 6. Volumetric Explosions ---
    this.activeExplosions = [];

    // --- 7. Atmospheric Dust Motes ---
    this.atmosphereGroup = null;
    this.motes = null;
    this.initAtmosphere();
  }

  muzzleFlash(duration = 0.045, worldMuzzlePos = null) {
    this.flashTimer = duration;
    this.flashDuration = duration;
    this.flashGroup.visible = true;

    const roll = Math.random() * Math.PI * 2;
    this.flashMesh1.rotation.z = roll;
    this.flashMesh2.rotation.z = roll + Math.PI / 4;

    const scale = 0.85 + Math.random() * 0.35;
    this.flashGroup.scale.set(scale, scale, scale);

    this.flashMesh1.material.opacity = 1.0;
    this.flashMesh2.material.opacity = 0.92;
    this.muzzleLight.intensity = 4.8;

    const smokeOrigin = worldMuzzlePos || this.camera.localToWorld(new THREE.Vector3(0.04, -0.09, -0.72));
    this.spawnBarrelSmoke(smokeOrigin);
  }

  spawnBarrelSmoke(origin) {
    if (this.smokePool.length === 0) return;
    const s = this.smokePool.pop();
    s.position.copy(origin);
    s.visible = true;
    s.scale.setScalar(0.4);

    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const vel = fwd.multiplyScalar(1.2).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      0.4 + Math.random() * 0.4,
      (Math.random() - 0.5) * 0.3
    ));

    s.material.opacity = 0.38;
    this.activeSmoke.push({
      mesh: s,
      velocity: vel,
      life: 0.42 + Math.random() * 0.25,
      maxLife: 0.55,
      scale: 0.4,
    });
  }

  spawnTracer(from, to, color = 0xffe484, speed = 380) {
    if (this.tracerPool.length === 0) return;
    const mesh = this.tracerPool.pop();
    mesh.position.copy(from);
    mesh.material.color.set(color);
    mesh.material.opacity = 0.95;
    mesh.visible = true;

    mesh.lookAt(to);

    const dist = from.distanceTo(to);
    const duration = Math.max(0.03, dist / speed);

    this.activeTracers.push({
      mesh,
      start: from.clone(),
      target: to.clone(),
      distance: dist,
      speed,
      progress: 0,
      duration,
      elapsed: 0,
    });
  }

  spawnImpact(pos, normal = new THREE.Vector3(0, 1, 0), surfaceType = "metal") {
    let count = 12;
    let baseColor = 0xffea75;
    let bounce = 0.6;
    let gravity = 12;
    let initialSpeed = 6.5;

    if (surfaceType === "metal") {
      count = 18;
      baseColor = 0xfff2a8;
      bounce = 0.72;
      gravity = 14;
      initialSpeed = 8.5;
    } else if (surfaceType === "concrete") {
      count = 14;
      baseColor = 0x9ca3af;
      bounce = 0.25;
      gravity = 9;
      initialSpeed = 4.5;
    } else if (surfaceType === "enemy") {
      count = 16;
      baseColor = 0xef4444;
      bounce = 0.15;
      gravity = 7;
      initialSpeed = 5.2;
    } else if (surfaceType === "dirt") {
      count = 12;
      baseColor = 0x78716c;
      bounce = 0.1;
      gravity = 11;
      initialSpeed = 3.8;
    }

    const refl = normal.clone().normalize();

    for (let i = 0; i < count; i++) {
      if (this.particlePool.length === 0) break;
      const p = this.particlePool.pop();
      p.position.copy(pos);
      p.material.color.set(baseColor);
      p.material.opacity = 1.0;
      p.visible = true;

      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4,
        (Math.random() - 0.5) * 1.4
      );

      const vel = refl.clone().multiplyScalar(initialSpeed * (0.6 + Math.random() * 0.7)).add(spread);

      const life = 0.22 + Math.random() * 0.35;
      this.activeParticles.push({
        mesh: p,
        velocity: vel,
        gravity,
        bounce,
        life,
        maxLife: life,
        surfaceY: pos.y,
      });
    }

    // Automatically place persistent bullet hole decal on hard surfaces
    if (surfaceType !== "enemy") {
      this.spawnDecal(pos, normal, surfaceType);
    }
  }

  /**
   * Spawns persistent bullet hole decal oriented to surface normal.
   * @param {THREE.Vector3} pos
   * @param {THREE.Vector3} normal
   * @param {string} surfaceType
   */
  spawnDecal(pos, normal, surfaceType = "concrete") {
    let decal = null;
    if (this.decalPool.length > 0) {
      decal = this.decalPool.pop();
    } else if (this.activeDecals.length > 0) {
      decal = this.activeDecals.shift().mesh;
    }
    if (!decal) return;

    const n = normal.clone().normalize();
    decal.position.copy(pos).addScaledVector(n, 0.005);
    decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    decal.rotation.z = Math.random() * Math.PI * 2;
    decal.scale.setScalar(0.75 + Math.random() * 0.5);

    if (surfaceType === "metal") {
      decal.material.color.setHex(0x1a1d1e);
    } else {
      decal.material.color.setHex(0x232526);
    }

    decal.material.opacity = 0.9;
    decal.visible = true;

    this.activeDecals.push({
      mesh: decal,
      life: 14.0,
      maxLife: 14.0,
    });
  }

  spawnShell(origin, forward, right, weaponType = "carbine") {
    if (this.shellPool.length === 0) return;
    const mesh = this.shellPool.pop();
    mesh.position.copy(origin);
    mesh.visible = true;

    const up = new THREE.Vector3(0, 1, 0);
    const vel = right
      .clone()
      .multiplyScalar(2.4 + Math.random() * 0.8)
      .addScaledVector(up, 1.8 + Math.random() * 0.6)
      .addScaledVector(forward, -0.6 + Math.random() * 0.3);

    const rotVel = new THREE.Vector3(
      (Math.random() - 0.5) * 28,
      (Math.random() - 0.5) * 28,
      (Math.random() - 0.5) * 28
    );

    this.activeShells.push({
      mesh,
      velocity: vel,
      rotVel,
      life: 4.0,
      bounces: 0,
      settled: false,
    });
  }

  spawnExplosion(pos, radius = 6.0, color = 0xff5522) {
    const ringGeo = new THREE.RingGeometry(0.2, 0.6, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.copy(pos);
    ringMesh.position.y += 0.08;
    this.scene.add(ringMesh);

    const coreGeo = new THREE.SphereGeometry(0.8, 8, 8);
    const coreMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.copy(pos);
    this.scene.add(coreMesh);

    for (let i = 0; i < 32; i++) {
      this.spawnImpact(pos, new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2), "metal");
    }

    this.activeExplosions.push({
      ringMesh,
      coreMesh,
      maxRadius: radius,
      currentRadius: 0.6,
      life: 0.55,
      maxLife: 0.55,
    });
  }

  initAtmosphere(count = 200, arenaSize = 140) {
    if (this.atmosphereGroup || !this.scene) return;

    this.atmosphereGroup = new THREE.Group();
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      positions[idx] = (Math.random() - 0.5) * arenaSize;
      positions[idx + 1] = 0.5 + Math.random() * 12;
      positions[idx + 2] = (Math.random() - 0.5) * arenaSize;

      if (Math.random() < 0.25) {
        colors[idx] = 0.13;
        colors[idx + 1] = 0.82;
        colors[idx + 2] = 0.93;
      } else {
        colors[idx] = 0.75;
        colors[idx + 1] = 0.72;
        colors[idx + 2] = 0.65;
      }
    }

    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.motes = new THREE.Points(geom, mat);
    this.atmosphereGroup.add(this.motes);
    this.scene.add(this.atmosphereGroup);
  }

  update(dt) {
    const delta = Math.min(Math.max(dt, 0), 0.05);

    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.flashGroup.visible = false;
        this.muzzleLight.intensity = 0;
      } else {
        const ratio = this.flashTimer / this.flashDuration;
        this.flashMesh1.material.opacity = ratio;
        this.flashMesh2.material.opacity = ratio * 0.92;
        this.muzzleLight.intensity = 4.8 * ratio;
      }
    }

    for (let i = this.activeSmoke.length - 1; i >= 0; i--) {
      const sm = this.activeSmoke[i];
      sm.life -= delta;
      sm.scale += delta * 0.8;
      sm.mesh.scale.setScalar(sm.scale);
      sm.mesh.position.addScaledVector(sm.velocity, delta);
      sm.mesh.material.opacity = clamp((sm.life / sm.maxLife) * 0.38, 0, 0.38);

      if (sm.life <= 0) {
        sm.mesh.visible = false;
        this.smokePool.push(sm.mesh);
        this.activeSmoke.splice(i, 1);
      }
    }

    for (let i = this.activeTracers.length - 1; i >= 0; i--) {
      const tr = this.activeTracers[i];
      tr.elapsed += delta;
      const t = tr.elapsed / tr.duration;
      if (t >= 1.0) {
        tr.mesh.visible = false;
        this.tracerPool.push(tr.mesh);
        this.activeTracers.splice(i, 1);
      } else {
        tr.mesh.position.lerpVectors(tr.start, tr.target, t);
        tr.mesh.material.opacity = clamp(1.0 - t * 0.7, 0, 1);
      }
    }

    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const pt = this.activeParticles[i];
      pt.life -= delta;
      pt.velocity.y -= pt.gravity * delta;
      pt.mesh.position.addScaledVector(pt.velocity, delta);

      if (pt.mesh.position.y <= 0.02 && pt.velocity.y < 0) {
        pt.mesh.position.y = 0.02;
        pt.velocity.y = -pt.velocity.y * pt.bounce;
        pt.velocity.x *= 0.65;
        pt.velocity.z *= 0.65;
      }

      pt.mesh.material.opacity = clamp(pt.life / pt.maxLife, 0, 1);

      if (pt.life <= 0) {
        pt.mesh.visible = false;
        this.particlePool.push(pt.mesh);
        this.activeParticles.splice(i, 1);
      }
    }

    for (let i = this.activeShells.length - 1; i >= 0; i--) {
      const sh = this.activeShells[i];
      sh.life -= delta;

      if (!sh.settled) {
        sh.velocity.y -= 18 * delta;
        sh.mesh.position.addScaledVector(sh.velocity, delta);
        sh.mesh.rotation.x += sh.rotVel.x * delta;
        sh.mesh.rotation.y += sh.rotVel.y * delta;
        sh.mesh.rotation.z += sh.rotVel.z * delta;

        if (sh.mesh.position.y <= 0.03) {
          sh.mesh.position.y = 0.03;
          sh.bounces++;
          if (sh.bounces > 2 || sh.velocity.lengthSq() < 0.4) {
            sh.settled = true;
            sh.mesh.rotation.x = Math.PI / 2;
          } else {
            sh.velocity.y = -sh.velocity.y * 0.42;
            sh.velocity.x *= 0.55;
            sh.velocity.z *= 0.55;
            sh.rotVel.multiplyScalar(0.5);
          }
        }
      }

      if (sh.life <= 0) {
        sh.mesh.visible = false;
        this.shellPool.push(sh.mesh);
        this.activeShells.splice(i, 1);
      }
    }

    for (let i = this.activeExplosions.length - 1; i >= 0; i--) {
      const ex = this.activeExplosions[i];
      ex.life -= delta;
      const progress = 1.0 - ex.life / ex.maxLife;

      const ringScale = 1.0 + progress * ex.maxRadius;
      ex.ringMesh.scale.set(ringScale, ringScale, ringScale);
      ex.ringMesh.material.opacity = clamp(1.0 - progress, 0, 1) * 0.85;

      const coreScale = 1.0 + progress * 2.8;
      ex.coreMesh.scale.set(coreScale, coreScale, coreScale);
      ex.coreMesh.material.opacity = clamp((1.0 - progress) * 1.2, 0, 1);

      if (ex.life <= 0) {
        this.scene.remove(ex.ringMesh);
        this.scene.remove(ex.coreMesh);
        ex.ringMesh.geometry.dispose();
        ex.ringMesh.material.dispose();
        ex.coreMesh.geometry.dispose();
        ex.coreMesh.material.dispose();
        this.activeExplosions.splice(i, 1);
      }
    }

    // 5c. Update Bullet Decals
    for (let i = this.activeDecals.length - 1; i >= 0; i--) {
      const dc = this.activeDecals[i];
      dc.life -= delta;
      if (dc.life < 2.5) {
        dc.mesh.material.opacity = (dc.life / 2.5) * 0.9;
      }
      if (dc.life <= 0) {
        dc.mesh.visible = false;
        this.decalPool.push(dc.mesh);
        this.activeDecals.splice(i, 1);
      }
    }

    if (this.motes && this.motes.geometry.attributes.position) {
      const pos = this.motes.geometry.attributes.position.array;
      const count = pos.length / 3;
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        pos[idx] += Math.sin(idx + Date.now() * 0.0008) * 0.012;
        pos[idx + 1] -= delta * 0.15;
        if (pos[idx + 1] < 0.2) pos[idx + 1] = 12;
        pos[idx + 2] += Math.cos(idx + Date.now() * 0.0008) * 0.012;
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
    }
  }

  dispose() {
    [...this.smokePool, ...this.activeSmoke.map((s) => s.mesh)].forEach((m) => {
      this.scene?.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    [...this.tracerPool, ...this.activeTracers.map((t) => t.mesh)].forEach((m) => {
      this.scene?.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    [...this.particlePool, ...this.activeParticles.map((p) => p.mesh)].forEach((m) => {
      this.scene?.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    [...this.shellPool, ...this.activeShells.map((s) => s.mesh)].forEach((m) => {
      this.scene?.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    [...this.decalPool, ...this.activeDecals.map((d) => d.mesh)].forEach((m) => {
      this.scene?.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    if (this.atmosphereGroup) {
      this.scene?.remove(this.atmosphereGroup);
      this.motes?.geometry.dispose();
      this.motes?.material.dispose();
    }
  }
}
