import * as THREE from "three";

/**
 * AI Combat Director & Robotic Sensory State Machine.
 * Sourced from futuristic-call-of-shooty & call-of-groky.
 * Implements 4-state tactical FSM (PATROL -> ALERT -> ENGAGE -> COVER),
 * sensory vision cone with line-of-sight raycasting, and dynamic difficulty pacing.
 */

export const AI_STATES = Object.freeze({
  PATROL: "PATROL",
  ALERT: "ALERT",
  ENGAGE: "ENGAGE",
  COVER: "COVER",
});

export class CombatDirector {
  constructor({
    enemies = [],
    coverObjects = [],
    onWave = () => {},
    onVictory = () => {},
    onEnemyFire = () => {},
  } = {}) {
    this.enemies = enemies;
    this.coverObjects = coverObjects;
    this.onWave = onWave;
    this.onVictory = onVictory;
    this.onEnemyFire = onEnemyFire;

    this.wave = 1;
    this.completed = false;
    this.cooldown = 0;
    this.difficulty = 1.0; // 0.8 to 1.6 dynamic multiplier
    this.raycaster = new THREE.Raycaster();
  }

  setEnemies(enemies) {
    this.enemies = enemies || [];
  }

  setCoverObjects(objects) {
    this.coverObjects = objects || [];
  }

  /**
   * Evaluates player combat performance to dynamically tune combat pressure.
   */
  adaptPacing(playerHealth, accuracy = 0.5) {
    let diff = 1.0 + (this.wave - 1) * 0.15;
    if (accuracy > 0.45 && playerHealth > 70) {
      diff += 0.25; // Player is dominating: tighten enemy flank and burst cadence
    } else if (playerHealth < 35) {
      diff -= 0.2; // Player in danger: provide brief tactical breathing room
    }
    this.difficulty = THREE.MathUtils.clamp(diff, 0.75, 2.2);
  }

  /**
   * Sensory vision cone check (angle + distance + line-of-sight raycast).
   */
  hasLineOfSight(enemy, targetPos) {
    const toTarget = new THREE.Vector3().subVectors(targetPos, enemy.group.position);
    const dist = toTarget.length();
    if (dist > 45) return false;

    toTarget.normalize();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(enemy.group.quaternion);
    const dot = forward.dot(toTarget);

    // 120-degree field of view vision cone
    if (dot < 0.2) return false;

    // Obstacle raycasting against static cover blocks
    if (this.coverObjects.length > 0) {
      const rayOrigin = enemy.group.position.clone();
      rayOrigin.y += 1.2;
      this.raycaster.set(rayOrigin, toTarget);
      this.raycaster.far = dist;
      const hits = this.raycaster.intersectObjects(this.coverObjects, false);
      if (hits.length > 0 && hits[0].distance < dist - 0.5) {
        return false; // Vision blocked by cover
      }
    }

    return true;
  }

  /**
   * Main director tick updating tactical state machines for all active combatants.
   */
  update(dt, playerPos = null, playerHealth = 100, accuracy = 0.5) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.adaptPacing(playerHealth, accuracy);

    const activeEnemies = this.enemies.filter((e) => e.alive);

    if (
      !this.completed &&
      this.enemies.length > 0 &&
      activeEnemies.length === 0 &&
      this.cooldown === 0
    ) {
      this.completed = true;
      this.onVictory(this.wave);
      return;
    }

    if (!playerPos) return;

    for (const enemy of activeEnemies) {
      this.updateEnemyAI(enemy, dt, playerPos);
    }
  }

  updateEnemyAI(enemy, dt, playerPos) {
    if (!enemy.alive) return;

    enemy.fsmState = enemy.fsmState || AI_STATES.PATROL;
    enemy.fireCooldown = Math.max(0, (enemy.fireCooldown || 0) - dt);
    enemy.stateTimer = (enemy.stateTimer || 0) + dt;

    const toPlayer = new THREE.Vector3().subVectors(playerPos, enemy.group.position);
    const dist = toPlayer.length();

    // 4-Stage Sensory FSM Transitions
    const hasSight = this.hasLineOfSight(enemy, playerPos);

    if (enemy.hp < 35 && enemy.fsmState !== AI_STATES.COVER) {
      enemy.fsmState = AI_STATES.COVER;
      enemy.stateTimer = 0;
    } else if (hasSight && dist < 36) {
      enemy.fsmState = AI_STATES.ENGAGE;
    } else if (dist < 48 && (hasSight || enemy.fsmState === AI_STATES.ENGAGE)) {
      enemy.fsmState = AI_STATES.ALERT;
    } else if (enemy.stateTimer > 6.0 && enemy.fsmState !== AI_STATES.PATROL) {
      enemy.fsmState = AI_STATES.PATROL;
    }

    // State Executions
    if (enemy.fsmState === AI_STATES.PATROL) {
      // Gentle patrol wandering
      const angle = (enemy.seed || 0) + enemy.stateTimer * 0.4;
      enemy.group.position.x += Math.cos(angle) * dt * 1.2;
      enemy.group.position.z += Math.sin(angle) * dt * 1.2;
    } else if (enemy.fsmState === AI_STATES.ALERT) {
      // Turning towards noise / suspected position
      enemy.group.lookAt(playerPos.x, enemy.group.position.y + 1.1, playerPos.z);
      const moveDir = toPlayer.clone();
      moveDir.y = 0;
      moveDir.normalize();
      enemy.group.position.addScaledVector(moveDir, dt * 2.0);
    } else if (enemy.fsmState === AI_STATES.ENGAGE) {
      // Tactical flank and fire bursts
      enemy.group.lookAt(playerPos.x, enemy.group.position.y + 1.1, playerPos.z);
      toPlayer.y = 0;
      toPlayer.normalize();

      const strafe = Math.sin((enemy.seed || 0) + enemy.stateTimer * 1.8) * 0.85;
      const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      const moveDir = toPlayer.clone().multiplyScalar(dist > 12 ? 0.35 : -0.2).add(side.multiplyScalar(strafe)).normalize();

      enemy.group.position.addScaledVector(moveDir, dt * 2.6);

      // Fire weapon burst with difficulty-paced cooldown
      if (enemy.fireCooldown <= 0 && dist < 32 && Math.random() < dt * 1.4 * this.difficulty) {
        enemy.fireCooldown = (1.4 + Math.random() * 1.2) / this.difficulty;
        this.onEnemyFire(enemy, playerPos);
      }
    } else if (enemy.fsmState === AI_STATES.COVER) {
      // Seek cover: retreat away from player or strafe into obstruction
      enemy.group.lookAt(playerPos.x, enemy.group.position.y + 1.1, playerPos.z);
      const awayDir = new THREE.Vector3().subVectors(enemy.group.position, playerPos);
      awayDir.y = 0;
      awayDir.normalize();
      enemy.group.position.addScaledVector(awayDir, dt * 3.2);

      // Slowly regenerate or recover after 4 seconds
      if (enemy.stateTimer > 4.0) {
        enemy.fsmState = AI_STATES.ALERT;
        enemy.stateTimer = 0;
      }
    }

    // World boundary clamp
    enemy.group.position.x = THREE.MathUtils.clamp(enemy.group.position.x, -84, 84);
    enemy.group.position.z = THREE.MathUtils.clamp(enemy.group.position.z, -84, 84);
  }

  nextWave(spawnFn) {
    this.wave += 1;
    this.completed = false;
    this.cooldown = 1.5;
    if (spawnFn) spawnFn(this.wave);
    this.onWave(this.wave);
  }
}

export function scoreMultiplier({
  hit = false,
  kill = false,
  headshot = false,
  streak = 0,
} = {}) {
  let value = hit ? 10 : 0;
  if (kill) value += 100;
  if (headshot) value += 50;
  return Math.round(value * (1 + Math.min(streak, 10) * 0.05));
}
