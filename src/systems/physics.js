import * as THREE from "three";
import * as CANNON from "cannon-es";

/**
 * Cannon-es Rigid Body Physics World.
 * Sourced and evolved from call-of-boty, call-of-groky & futuristic-call-of-shooty.
 * Manages rigid bodies, continuous contact materials, procedural cover blocks,
 * and physics-driven grenade projectiles with fixed 60Hz timestep and SAPBroadphase.
 */
export class PhysicsWorld {
  constructor({ gravity = -22, iterations = 10 } = {}) {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, gravity, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    if (this.world.solver) {
      this.world.solver.iterations = iterations;
    }

    // Default contact material (friction 0.35, restitution 0.02)
    this.world.defaultContactMaterial.friction = 0.35;
    this.world.defaultContactMaterial.restitution = 0.02;

    // Bouncy material for grenades (restitution 0.45, friction 0.4)
    this.bouncyMaterial = new CANNON.Material("bouncy");
    const bouncyContact = new CANNON.ContactMaterial(
      this.world.defaultMaterial,
      this.bouncyMaterial,
      {
        friction: 0.4,
        restitution: 0.45,
      }
    );
    this.world.addContactMaterial(bouncyContact);

    // Brass shell casing material (restitution -0.25, friction 0.6)
    this.shellMaterial = new CANNON.Material("shell");
    const shellContact = new CANNON.ContactMaterial(
      this.world.defaultMaterial,
      this.shellMaterial,
      {
        friction: 0.6,
        restitution: -0.25,
      }
    );
    this.world.addContactMaterial(shellContact);

    this.meshes = new Map(); // CANNON.Body -> THREE.Object3D
    this.dynamicCoverBlocks = [];
    this.activeGrenades = [];
  }

  addGroundPlane(elevation = 0) {
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Plane());
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    body.position.set(0, elevation, 0);
    this.world.addBody(body);
    return body;
  }

  addStaticBox(mesh, size, center, rotation = null) {
    const half = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(half),
      position: new CANNON.Vec3(center.x, center.y, center.z),
    });
    if (rotation) {
      if (rotation.isEuler) {
        body.quaternion.setFromEuler(rotation.x, rotation.y, rotation.z);
      } else if (rotation.isQuaternion) {
        body.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      }
    }
    this.world.addBody(body);
    if (mesh) this.meshes.set(body, mesh);
    return body;
  }

  addDynamicCoverBlock(mesh, size, center, mass = 25) {
    const half = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
    const body = new CANNON.Body({
      mass,
      shape: new CANNON.Box(half),
      position: new CANNON.Vec3(center.x, center.y, center.z),
      linearDamping: 0.25,
      angularDamping: 0.3,
    });
    this.world.addBody(body);
    if (mesh) this.meshes.set(body, mesh);
    this.dynamicCoverBlocks.push({ body, mesh, health: 100 });
    return body;
  }

  addPlayerBody(radius = 0.42, height = 1.8, pos = new THREE.Vector3(0, 2.2, 0)) {
    const body = new CANNON.Body({
      mass: 80,
      fixedRotation: true,
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      linearDamping: 0.12,
      angularDamping: 1.0,
    });
    // Standing cylinder representation for character controller (Z-aligned in cannon-es rotated to upright Y)
    const shape = new CANNON.Cylinder(radius, radius, height, 12);
    const q = new CANNON.Quaternion();
    q.setFromEuler(Math.PI / 2, 0, 0);
    body.addShape(shape, new CANNON.Vec3(0, 0, 0), q);
    body.collisionFilterGroup = 1;
    body.collisionFilterMask = 1;
    this.world.addBody(body);
    return body;
  }

  spawnPhysicsGrenade(pos, velocity, radius = 0.14) {
    const body = new CANNON.Body({
      mass: 0.4,
      material: this.bouncyMaterial,
      shape: new CANNON.Sphere(radius),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      velocity: new CANNON.Vec3(velocity.x, velocity.y, velocity.z),
      angularVelocity: new CANNON.Vec3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      ),
      linearDamping: 0.08,
      angularDamping: 0.1,
    });
    this.world.addBody(body);
    return body;
  }

  addBody(body) {
    if (!body) return;
    this.world.addBody(body);
    return body;
  }

  removeBody(body) {
    if (!body) return;
    this.world.removeBody(body);
    this.meshes.delete(body);
  }

  isGrounded(body, upThreshold = 0.45) {
    if (!body) return true;
    for (const contact of this.world.contacts) {
      let normalY = 0;
      if (contact.bi === body) {
        normalY = -contact.ni.y;
      } else if (contact.bj === body) {
        normalY = contact.ni.y;
      }
      if (normalY > upThreshold) return true;
    }

    // Downward raycast fallback
    const from = new CANNON.Vec3(body.position.x, body.position.y, body.position.z);
    const to = new CANNON.Vec3(body.position.x, body.position.y - 1.35, body.position.z);
    const res = new CANNON.RaycastResult();
    this.world.raycastClosest(from, to, { collisionFilterMask: 1, skipBackfaces: true }, res);
    return res.hasHit;
  }

  raycast(from, to, options = {}) {
    const p1 = new CANNON.Vec3(from.x, from.y, from.z);
    const p2 = new CANNON.Vec3(to.x, to.y, to.z);
    const result = new CANNON.RaycastResult();
    const opts = {
      collisionFilterMask: options.mask !== undefined ? options.mask : 1,
      skipBackfaces: true,
      ...options,
    };
    this.world.raycastClosest(p1, p2, opts, result);
    return {
      hasHit: result.hasHit,
      hitPoint: result.hasHit
        ? new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z)
        : null,
      hitNormal: result.hasHit
        ? new THREE.Vector3(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z)
        : null,
      distance: result.hasHit ? result.distance : Infinity,
      body: result.body,
    };
  }

  step(delta) {
    const dt = Math.max(0, delta || 0);
    const clamped = Math.min(dt, 1 / 30);
    if (clamped === 0) return;
    this.world.step(1 / 60, clamped, 3);
  }

  sync() {
    for (const [body, mesh] of this.meshes) {
      if (mesh && body) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(
          body.quaternion.x,
          body.quaternion.y,
          body.quaternion.z,
          body.quaternion.w
        );
      }
    }
  }
}

/**
 * Kinematic character capsule / cylinder controller (mass 80kg, r=0.42m, h=1.8m, fixedRotation=true, linearDamping 0.12).
 * Sourced and evolved from call-of-boty & call-of-groky.
 * Upward contact normal grounding detection (contact.ni.y > 0.45),
 * slope handling (<=60 deg), step-climbing, jump impulse (7.2 - 8.2 m/s),
 * walk/sprint velocities with exponential acceleration.
 */
export class CapsuleController {
  constructor(targetOrWorld, options = {}) {
    // Accommodate both (world, options) and (camera, options) signatures
    if (targetOrWorld && (targetOrWorld.world || targetOrWorld.addPlayerBody)) {
      this.physicsWorld = targetOrWorld;
      this.camera = options.camera || null;
    } else {
      this.camera = targetOrWorld;
      this.physicsWorld = options.physicsWorld || options.world || null;
    }

    this.radius = options.radius ?? 0.42;
    this.height = options.height ?? 1.8;
    this.mass = options.mass ?? 80;
    this.eye = options.eye ?? 2.2;
    this.gravity = options.gravity ?? 24;
    this.jumpImpulse = options.jumpImpulse ?? 8.2;
    this.stepHeight = options.stepHeight ?? 0.35;
    this.maxSlopeNormalY = Math.cos(((options.maxSlopeDeg ?? 60) * Math.PI) / 180); // ~0.50 (normal.y > 0.45)
    this.bounds = options.bounds ?? 88;

    this.velocity = new THREE.Vector3();
    this.grounded = true;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.body = null;
    this.colliders = [];
    this.jumpQueued = false;

    if (this.physicsWorld) {
      this.bindPhysics(this.physicsWorld);
    }
  }

  bindPhysics(physicsWorld) {
    this.physicsWorld = physicsWorld;
    const initialPos = this.camera ? this.camera.position : new THREE.Vector3(0, 2.2, 0);
    this.body = physicsWorld.addPlayerBody(this.radius, this.height, initialPos);
  }

  setColliders(objects) {
    this.colliders = (objects || []).filter(Boolean);
  }

  getPosition() {
    if (this.body) {
      return { x: this.body.position.x, y: this.body.position.y, z: this.body.position.z };
    }
    if (this.camera) {
      return { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    }
    return { x: 0, y: 0, z: 0 };
  }

  isGrounded() {
    return Boolean(this.grounded);
  }

  step(dt, desiredVelocity, jump = false) {
    const v = desiredVelocity ? desiredVelocity.clone() : new THREE.Vector3();

    if (this.body && this.physicsWorld) {
      // 1. Upward contact normal grounding & slope detection
      let bestNormalY = 0;
      const groundNormal = new THREE.Vector3(0, 1, 0);

      for (const contact of this.physicsWorld.world.contacts) {
        let nY = 0;
        let cNormal = null;
        if (contact.bi === this.body) {
          nY = -contact.ni.y;
          cNormal = new THREE.Vector3(-contact.ni.x, -contact.ni.y, -contact.ni.z);
        } else if (contact.bj === this.body) {
          nY = contact.ni.y;
          cNormal = new THREE.Vector3(contact.ni.x, contact.ni.y, contact.ni.z);
        }
        if (nY > 0.45 && nY > bestNormalY) {
          bestNormalY = nY;
          groundNormal.copy(cNormal).normalize();
        }
      }

      const contactGrounded = bestNormalY > 0.45;
      const rayGrounded = this.physicsWorld.isGrounded(this.body, 0.45);
      this.grounded = contactGrounded || rayGrounded;
      this.groundNormal.copy(groundNormal);

      // 2. Slope Handling (<= 60 deg)
      // When walking on sloped surface, align wish velocity tangent to slope
      let moveWish = v.clone();
      if (this.grounded && bestNormalY > 0.45 && bestNormalY < 0.999) {
        const dot = moveWish.dot(this.groundNormal);
        // Project onto slope plane: v_slope = v - (v . n) * n
        moveWish.sub(this.groundNormal.clone().multiplyScalar(dot));
      }

      // 3. Step Climbing
      // Detect low obstacles (up to stepHeight) in the movement direction
      const horizontalSpeed = Math.hypot(moveWish.x, moveWish.z);
      if (this.grounded && horizontalSpeed > 0.1) {
        const moveDir = new THREE.Vector3(moveWish.x, 0, moveWish.z).normalize();
        const footY = this.body.position.y - this.height / 2 + 0.05;
        const fromFoot = new THREE.Vector3(
          this.body.position.x,
          footY,
          this.body.position.z
        );
        const toFoot = fromFoot.clone().addScaledVector(moveDir, this.radius + 0.25);
        const footHit = this.physicsWorld.raycast(fromFoot, toFoot);

        if (footHit.hasHit) {
          const stepCheckY = footY + this.stepHeight;
          const fromWaist = new THREE.Vector3(
            this.body.position.x,
            stepCheckY,
            this.body.position.z
          );
          const toWaist = fromWaist.clone().addScaledVector(moveDir, this.radius + 0.25);
          const waistHit = this.physicsWorld.raycast(fromWaist, toWaist);

          // If low obstacle exists but clearance at stepHeight, step up smoothly
          if (!waistHit.hasHit) {
            this.body.position.y += Math.min(this.stepHeight * dt * 8, 0.12);
            if (this.body.velocity.y < 0) this.body.velocity.y = 0;
          }
        }
      }

      // 4. Exponential lateral acceleration & deceleration
      if (horizontalSpeed > 0.001) {
        const accelBlend = 1 - Math.exp(-12 * dt);
        this.body.velocity.x = THREE.MathUtils.lerp(this.body.velocity.x, moveWish.x, accelBlend);
        this.body.velocity.z = THREE.MathUtils.lerp(this.body.velocity.z, moveWish.z, accelBlend);
        if (moveWish.y > 0 && this.grounded) {
          this.body.velocity.y = THREE.MathUtils.lerp(this.body.velocity.y, moveWish.y, accelBlend);
        }
      } else {
        const decel = Math.exp(-8 * dt);
        this.body.velocity.x *= decel;
        this.body.velocity.z *= decel;
        // Prevent sliding down walkable slopes when stationary
        if (this.grounded && bestNormalY > 0.45) {
          this.body.velocity.y = Math.max(this.body.velocity.y, 0);
        }
      }

      // 5. Jump Impulse (7.2 - 8.2 m/s)
      if (jump && this.grounded) {
        this.body.velocity.y = this.jumpImpulse;
        this.grounded = false;
      }

      // 6. Camera Sync & Bounds Clamping
      this.body.position.x = THREE.MathUtils.clamp(this.body.position.x, -this.bounds, this.bounds);
      this.body.position.z = THREE.MathUtils.clamp(this.body.position.z, -this.bounds, this.bounds);

      if (this.camera) {
        this.camera.position.x = this.body.position.x;
        this.camera.position.y = this.body.position.y + (this.eye - this.height / 2);
        this.camera.position.z = this.body.position.z;
      }
      this.velocity.set(this.body.velocity.x, this.body.velocity.y, this.body.velocity.z);
    } else {
      // Kinematic fallback when physics world is unbound
      const blend = 1 - Math.exp(-12 * dt);
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, v.x, blend);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, v.z, blend);

      if (jump && this.grounded) {
        this.velocity.y = this.jumpImpulse;
        this.grounded = false;
      }

      this.velocity.y -= this.gravity * dt;
      if (this.camera) {
        const next = this.camera.position.clone().addScaledVector(this.velocity, dt);
        next.y = Math.max(this.eye, next.y);
        if (next.y === this.eye) {
          this.velocity.y = 0;
          this.grounded = true;
        }
        next.x = THREE.MathUtils.clamp(next.x, -this.bounds, this.bounds);
        next.z = THREE.MathUtils.clamp(next.z, -this.bounds, this.bounds);
        this.camera.position.copy(next);
      }
    }
  }

  update(delta, inputState, cameraYaw = 0) {
    const input = inputState || {};
    const wish = new THREE.Vector3();

    if (input.move) {
      wish.x = input.move.x || 0;
      wish.z = -(input.move.y || 0);
    } else if (input.moveDir) {
      wish.copy(input.moveDir);
    } else {
      if (input.forward) wish.z -= 1;
      if (input.back) wish.z += 1;
      if (input.left) wish.x -= 1;
      if (input.right) wish.x += 1;
    }

    if (wish.lengthSq() > 0) {
      wish.normalize();
    }

    const yaw = typeof cameraYaw === "number" ? cameraYaw : (this.camera ? this.camera.rotation.y : 0);
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const move = new THREE.Vector3()
      .addScaledVector(forward, -wish.z)
      .addScaledVector(right, wish.x);

    const speed = input.sprint && !input.ads ? 9.5 : input.ads ? 4.2 : 6.8;
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
    }

    this.step(delta, move, Boolean(input.jump));
  }
}

/**
 * Continuous Projectile Tracer with high-speed bullet raycasting,
 * continuous collision detection (CCD), and line segment visual tracers
 * with lifetime decay and pool recycling.
 */
export class ProjectileTracer {
  constructor(scene, maxTracers = 64) {
    this.scene = scene;
    this.maxTracers = maxTracers;
    this.activeTracers = new Set();
    this.pool = [];

    // Pre-allocate pool instances for zero GC stutter
    const poolSize = Math.min(maxTracers, 32);
    for (let i = 0; i < poolSize; i++) {
      const line = this._createTracerLine();
      line.visible = false;
      this.pool.push(line);
      if (this.scene) this.scene.add(line);
    }
  }

  _createTracerLine(material = null) {
    const points = [new THREE.Vector3(), new THREE.Vector3()];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat =
      material ||
      new THREE.LineBasicMaterial({
        color: 0x9bf8ea,
        transparent: true,
        opacity: 0.9,
      });
    const line = new THREE.Line(geometry, lineMat);
    line.userData = { life: 0.055, maxLife: 0.055 };
    return line;
  }

  spawn(from, to, materialOrColor = null) {
    const p1 = from.clone ? from.clone() : new THREE.Vector3(from.x, from.y, from.z);
    const p2 = to.clone ? to.clone() : new THREE.Vector3(to.x, to.y, to.z);

    let line = null;
    if (this.pool.length > 0) {
      line = this.pool.pop();
    } else if (this.activeTracers.size < this.maxTracers) {
      line = this._createTracerLine();
      if (this.scene) this.scene.add(line);
    } else {
      // LRU recycle oldest tracer from active pool
      line = this.activeTracers.values().next().value;
      if (line) {
        this.activeTracers.delete(line);
      } else {
        line = this._createTracerLine();
        if (this.scene) this.scene.add(line);
      }
    }

    // Update geometry coordinates without re-allocating BufferAttribute
    const posAttr = line.geometry.attributes.position;
    posAttr.setXYZ(0, p1.x, p1.y, p1.z);
    posAttr.setXYZ(1, p2.x, p2.y, p2.z);
    posAttr.needsUpdate = true;
    line.geometry.computeBoundingSphere();

    if (materialOrColor) {
      if (materialOrColor.isMaterial) {
        line.material = materialOrColor;
      } else if (typeof materialOrColor === "number" || typeof materialOrColor === "string") {
        line.material.color.set(materialOrColor);
      }
    }

    line.visible = true;
    line.userData.life = 0.055;
    line.userData.maxLife = 0.055;
    this.activeTracers.add(line);
    return line;
  }

  raycast(world, origin, direction, maxDistance = 300, filterMask = 1) {
    const dir = direction.clone ? direction.clone().normalize() : new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const from = origin.clone ? origin.clone() : new THREE.Vector3(origin.x, origin.y, origin.z);
    const to = from.clone().addScaledVector(dir, maxDistance);

    if (world && typeof world.raycast === "function") {
      return world.raycast(from, to, { mask: filterMask });
    }

    if (world && world.raycastClosest) {
      const p1 = new CANNON.Vec3(from.x, from.y, from.z);
      const p2 = new CANNON.Vec3(to.x, to.y, to.z);
      const result = new CANNON.RaycastResult();
      world.raycastClosest(p1, p2, { collisionFilterMask: filterMask, skipBackfaces: true }, result);
      return {
        hasHit: result.hasHit,
        hitPoint: result.hasHit ? new THREE.Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z) : null,
        hitNormal: result.hasHit ? new THREE.Vector3(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z) : null,
        distance: result.hasHit ? result.distance : Infinity,
        body: result.body,
      };
    }

    return { hasHit: false, hitPoint: null, hitNormal: null, distance: Infinity, body: null };
  }

  update(dt) {
    for (const line of this.activeTracers) {
      line.userData.life -= dt;
      if (line.userData.life <= 0) {
        line.visible = false;
        this.activeTracers.delete(line);
        if (this.pool.length < this.maxTracers) {
          this.pool.push(line);
        }
      }
    }
  }
}

/**
 * RigidBodyManager:
 * Dynamic rigid bodies for grenades (mass 0.4kg, radius 0.14m, restitution 0.45, friction 0.4,
 * tumbling rotation, timed fuse 2.5s) and brass shell casings with floor bounce
 * (restitution -0.25, friction 0.6) and despawn.
 * Static box colliders for cover crates, walls, and ramps.
 */
export class RigidBodyManager {
  constructor(world, scene) {
    this.physicsWorld = world && world.world ? world : null;
    this.world = world && world.world ? world.world : world;
    this.scene = scene;

    this.grenades = [];
    this.shells = [];
    this.staticColliders = [];

    // Shared materials
    this.grenadeMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.4,
      metalness: 0.3,
      emissive: 0x881111,
      emissiveIntensity: 0.5,
    });
    this.shellMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.28,
      metalness: 0.92,
    });
  }

  /**
   * Spawns a dynamic rigid-body grenade with realistic tumbling, bouncing, and timed fuse.
   */
  spawnGrenade(origin, direction, force = 18, options = {}) {
    const radius = options.radius ?? 0.14;
    const mass = options.mass ?? 0.4;
    const fuseTime = options.fuse ?? 2.5;
    const damage = options.damage ?? 120;
    const blastRadius = options.blastRadius ?? 8.0;

    const dir = direction.clone ? direction.clone().normalize() : new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const pos = origin.clone ? origin.clone() : new THREE.Vector3(origin.x, origin.y, origin.z);

    // Dynamic CANNON body
    const mat = this.physicsWorld ? this.physicsWorld.bouncyMaterial : new CANNON.Material("grenade");
    const body = new CANNON.Body({
      mass,
      material: mat,
      shape: new CANNON.Sphere(radius),
      position: new CANNON.Vec3(pos.x, pos.y, pos.z),
      velocity: new CANNON.Vec3(
        dir.x * force,
        dir.y * force + 3.5,
        dir.z * force
      ),
      angularVelocity: new CANNON.Vec3(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16
      ),
      linearDamping: 0.08,
      angularDamping: 0.12,
    });

    if (this.world) {
      this.world.addBody(body);
    }

    // Visual Mesh
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 10),
      options.material || this.grenadeMat
    );
    mesh.position.copy(pos);
    mesh.castShadow = true;
    if (this.scene) {
      this.scene.add(mesh);
    }

    if (this.physicsWorld) {
      this.physicsWorld.meshes.set(body, mesh);
    }

    const grenadeEntry = {
      body,
      mesh,
      fuse: fuseTime,
      damage,
      blastRadius,
      onExplode: options.onExplode || null,
    };
    this.grenades.push(grenadeEntry);
    return grenadeEntry;
  }

  /**
   * Spawns an ejected brass shell casing with gravity, tumbling angular spin,
   * floor bounce (restitution -0.25, friction 0.6) and automatic despawn.
   */
  spawnShell(origin, right, forward, options = {}) {
    const pos = origin.clone ? origin.clone() : new THREE.Vector3(origin.x, origin.y, origin.z);
    const r = right.clone ? right.clone().normalize() : new THREE.Vector3(right.x, right.y, right.z).normalize();
    const f = forward.clone ? forward.clone().normalize() : new THREE.Vector3(forward.x, forward.y, forward.z).normalize();

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.04, 6),
      options.material || this.shellMat
    );
    mesh.position.copy(pos);
    mesh.castShadow = false;
    if (this.scene) {
      this.scene.add(mesh);
    }

    const vel = new THREE.Vector3()
      .copy(r)
      .multiplyScalar(2.2 + Math.random() * 1.2)
      .addScaledVector(f, -0.4 + Math.random() * 0.3)
      .add(new THREE.Vector3(0, 2.5 + Math.random() * 1.2, 0));

    const ang = new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20
    );

    const shellEntry = {
      mesh,
      vel,
      ang,
      life: options.life ?? 1.4,
      floorY: options.floorY ?? 0.03,
      bounces: 0,
    };
    this.shells.push(shellEntry);
    return shellEntry;
  }

  /**
   * Adds a static box collider for tactical cover crates.
   */
  addCoverCrate(position, size = new THREE.Vector3(1.4, 1.2, 1.4), options = {}) {
    const half = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(half),
      position: new CANNON.Vec3(position.x, position.y, position.z),
    });
    if (this.world) this.world.addBody(body);

    let mesh = options.mesh || null;
    if (!mesh && this.scene) {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        options.material || new THREE.MeshStandardMaterial({ color: 0x555e60, roughness: 0.8, metalness: 0.2 })
      );
      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    if (mesh && this.physicsWorld) {
      this.physicsWorld.meshes.set(body, mesh);
    }
    this.staticColliders.push({ body, mesh });
    return body;
  }

  /**
   * Adds a static wall collider.
   */
  addWall(position, size, options = {}) {
    return this.addCoverCrate(position, size, options);
  }

  /**
   * Adds a static ramp box collider with specified slope inclination.
   */
  addRamp(position, size, rotationEuler = new THREE.Euler(-0.35, 0, 0), options = {}) {
    const half = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(half),
      position: new CANNON.Vec3(position.x, position.y, position.z),
    });
    body.quaternion.setFromEuler(rotationEuler.x, rotationEuler.y, rotationEuler.z);
    if (this.world) this.world.addBody(body);

    let mesh = options.mesh || null;
    if (!mesh && this.scene) {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size.x, size.y, size.z),
        options.material || new THREE.MeshStandardMaterial({ color: 0x4a5450, roughness: 0.75 })
      );
      mesh.position.copy(position);
      mesh.rotation.copy(rotationEuler);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    if (mesh && this.physicsWorld) {
      this.physicsWorld.meshes.set(body, mesh);
    }
    this.staticColliders.push({ body, mesh });
    return body;
  }

  /**
   * Adds a generic static box.
   */
  addStaticBox(mesh, size, position, rotation = null) {
    if (this.physicsWorld) {
      return this.physicsWorld.addStaticBox(mesh, size, position, rotation);
    }
    return this.addCoverCrate(position, size, { mesh });
  }

  update(delta) {
    const dt = Math.min(Math.max(delta, 0), 0.05);

    // 1. Update grenades & fuse countdown
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;

      // Sync visual mesh to Cannon body
      if (g.mesh && g.body) {
        g.mesh.position.set(g.body.position.x, g.body.position.y, g.body.position.z);
        g.mesh.quaternion.set(
          g.body.quaternion.x,
          g.body.quaternion.y,
          g.body.quaternion.z,
          g.body.quaternion.w
        );
      }

      if (g.fuse <= 0) {
        const blastPos = new THREE.Vector3(g.body.position.x, g.body.position.y, g.body.position.z);

        // Radial explosion blast impulse on dynamic bodies
        if (this.world) {
          for (const otherBody of this.world.bodies) {
            if (otherBody !== g.body && otherBody.mass > 0) {
              const dx = otherBody.position.x - blastPos.x;
              const dy = otherBody.position.y - blastPos.y;
              const dz = otherBody.position.z - blastPos.z;
              const dist = Math.hypot(dx, dy, dz);
              if (dist < g.blastRadius && dist > 0.01) {
                const forceMag = (1 - dist / g.blastRadius) * 22;
                otherBody.velocity.x += (dx / dist) * forceMag;
                otherBody.velocity.y += (dy / dist) * forceMag + 2.0;
                otherBody.velocity.z += (dz / dist) * forceMag;
              }
            }
          }
        }

        if (typeof g.onExplode === "function") {
          g.onExplode({
            position: blastPos,
            radius: g.blastRadius,
            damage: g.damage,
          });
        }

        if (this.physicsWorld) {
          this.physicsWorld.removeBody(g.body);
        } else if (this.world) {
          this.world.removeBody(g.body);
        }

        if (g.mesh && this.scene) {
          this.scene.remove(g.mesh);
          g.mesh.geometry.dispose();
        }
        this.grenades.splice(i, 1);
      }
    }

    // 2. Update brass shell casings
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      s.vel.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.ang.x * dt;
      s.mesh.rotation.y += s.ang.y * dt;
      s.mesh.rotation.z += s.ang.z * dt;

      // Floor bounce (restitution -0.25, friction 0.6)
      if (s.mesh.position.y < s.floorY) {
        s.mesh.position.y = s.floorY;
        s.vel.y *= -0.25;
        s.vel.x *= 0.6;
        s.vel.z *= 0.6;
        s.ang.multiplyScalar(0.5);
        s.bounces++;
      }

      // Despawn after lifetime
      if (s.life <= 0) {
        if (this.scene) {
          this.scene.remove(s.mesh);
        }
        s.mesh.geometry.dispose();
        this.shells.splice(i, 1);
      }
    }
  }
}
