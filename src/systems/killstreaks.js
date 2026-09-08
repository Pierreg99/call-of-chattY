import * as THREE from "three";

/**
 * Call-of-ChattY Unified FPS Engine - Killstreak System.
 *
 * Implements iconic Call of Duty killstreak rewards:
 * - 3 Kills: UAV Recon Radar (sweeping radar line revealing enemy coordinates on HUD mini-radar for 25s).
 * - 5 Kills: Precision Airstrike (supersonic jet flyby, 3-stage cluster bomb strike with camera trauma shake and lethal AoE).
 *
 * Features:
 * - Consecutive kill tracking with death reset.
 * - Ready state and activation triggers for both Desktop keybinds and Mobile touch HUD.
 * - Procedural audio coordination with TacticalAudio.
 * - Strict Zero-Emoji compliance.
 */

export const KILLSTREAK_TYPES = Object.freeze({
  UAV: "uav",
  AIRSTRIKE: "airstrike",
});

export const KILLSTREAK_CONFIGS = Object.freeze({
  [KILLSTREAK_TYPES.UAV]: {
    name: "UAV Recon",
    killsRequired: 3,
    duration: 25.0, // active for 25 seconds
    sweepSpeed: 3.2, // radians per second
  },
  [KILLSTREAK_TYPES.AIRSTRIKE]: {
    name: "Precision Airstrike",
    killsRequired: 5,
    delayBeforeStrike: 1.25,
    bombsCount: 3,
    bombInterval: 0.45,
    damage: 260,
    radius: 18.0,
    trauma: 0.9,
  },
});

export class KillstreakManager {
  constructor({
    audio = null,
    kinetics = null,
    onToast = () => {},
    onStreakEarned = () => {},
    onAirstrikeImpact = () => {},
  } = {}) {
    this.audio = audio;
    this.kinetics = kinetics;
    this.onToast = onToast;
    this.onStreakEarned = onStreakEarned;
    this.onAirstrikeImpact = onAirstrikeImpact;

    this.streak = 0;
    this.uavReady = false;
    this.uavActive = false;
    this.uavTimer = 0;
    this.uavSweepAngle = 0;
    this.lastSweepPing = 0;

    this.airstrikeReady = false;
    this.airstrikeActive = false;
    this.airstrikeTimer = 0;
    this.airstrikeTarget = null;
    this.airstrikeBombsRemaining = 0;
    this.airstrikeNextBombTimer = 0;
  }

  /**
   * Registers an enemy kill.
   * Checks streak thresholds to unlock tactical rewards.
   */
  registerKill() {
    this.streak++;

    // 3 Kills: UAV Reconnaissance
    if (this.streak === KILLSTREAK_CONFIGS[KILLSTREAK_TYPES.UAV].killsRequired) {
      this.uavReady = true;
      this.audio?.playKillstreakEarned?.("UAV RECON");
      this.onToast("KILLSTREAK READY: UAV RECON [PRESS 7 / U]");
      this.onStreakEarned(KILLSTREAK_TYPES.UAV, this.streak);
    }

    // 5 Kills: Precision Airstrike
    if (this.streak === KILLSTREAK_CONFIGS[KILLSTREAK_TYPES.AIRSTRIKE].killsRequired) {
      this.airstrikeReady = true;
      this.audio?.playKillstreakEarned?.("PRECISION AIRSTRIKE");
      this.onToast("KILLSTREAK READY: PRECISION AIRSTRIKE [PRESS 8 / J]");
      this.onStreakEarned(KILLSTREAK_TYPES.AIRSTRIKE, this.streak);
    }

    return this.streak;
  }

  /**
   * Resets killstreak on player death.
   */
  resetOnDeath() {
    this.streak = 0;
    this.uavReady = false;
    this.airstrikeReady = false;
  }

  /**
   * Triggers the UAV Recon Radar sweep.
   */
  activateUav() {
    if (!this.uavReady && !this.uavActive) return false;

    this.uavReady = false;
    this.uavActive = true;
    this.uavTimer = KILLSTREAK_CONFIGS[KILLSTREAK_TYPES.UAV].duration;
    this.uavSweepAngle = 0;
    this.lastSweepPing = 0;

    this.audio?.playUavPing?.();
    this.onToast("UAV RECON ACTIVE — RADAR SWEEPING");
    return true;
  }

  /**
   * Calls in the Precision Airstrike on a designated world coordinate.
   */
  activateAirstrike(targetPosition) {
    if (!this.airstrikeReady) return false;
    if (!targetPosition) return false;

    this.airstrikeReady = false;
    this.airstrikeActive = true;
    this.airstrikeTarget = targetPosition.clone();
    this.airstrikeTimer = KILLSTREAK_CONFIGS[KILLSTREAK_TYPES.AIRSTRIKE].delayBeforeStrike;
    this.airstrikeBombsRemaining = KILLSTREAK_CONFIGS[KILLSTREAK_TYPES.AIRSTRIKE].bombsCount;
    this.airstrikeNextBombTimer = 0;

    // Supersonic jet flyby procedural audio
    this.audio?.playJetFlyby?.();
    this.onToast("PRECISION AIRSTRIKE INBOUND — TAKE COVER");
    return true;
  }

  /**
   * Computes radar blip relative coordinates for HUD mini-map.
   * Returns list of { x: [-1, 1], y: [-1, 1], dist } blips relative to player forward.
   */
  getRadarBlips(playerPos, playerYaw, enemies = [], maxRange = 65.0) {
    if (!playerPos) {
      return { active: this.uavActive, sweepAngle: this.uavSweepAngle, blips: [] };
    }

    const blips = [];
    const cosYaw = Math.cos(-playerYaw);
    const sinYaw = Math.sin(-playerYaw);

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.group.position.x - playerPos.x;
      const dz = enemy.group.position.z - playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > maxRange) continue;

      // Rotate world offsets relative to player's view yaw
      const rx = dx * cosYaw - dz * sinYaw;
      const rz = dx * sinYaw + dz * cosYaw;

      // Normalize into [-1, 1] radar space where (0, 1) is forward
      blips.push({
        x: rx / maxRange,
        y: -rz / maxRange,
        dist,
      });
    }

    return {
      active: this.uavActive,
      sweepAngle: this.uavSweepAngle,
      blips,
    };
  }

  /**
   * Main per-frame update driving radar sweeps, timers, and cluster bomb drops.
   */
  update(dt, { enemies = [], playerPos = null } = {}) {
    const delta = Math.max(0, dt);

    // 1. UAV Radar Updates
    if (this.uavActive) {
      this.uavTimer -= delta;
      const prevAngle = this.uavSweepAngle;
      this.uavSweepAngle =
        (this.uavSweepAngle + delta * KILLSTREAK_CONFIGS[KILLSTREAV_TYPES_SAFE].sweepSpeed) %
        (Math.PI * 2);

      // Ping sound on each completed radar rotation (360 degrees)
      if (this.uavSweepAngle < prevAngle) {
        this.audio?.playUavPing?.();
      }

      if (this.uavTimer <= 0) {
        this.uavActive = false;
        this.onToast("UAV RECON DEPARTED");
      }
    }

    // 2. Precision Airstrike Bombardment Updates
    if (this.airstrikeActive) {
      if (this.airstrikeTimer > 0) {
        this.airstrikeTimer -= delta;
      } else {
        this.airstrikeNextBombTimer -= delta;
        if (this.airstrikeNextBombTimer <= 0 && this.airstrikeBombsRemaining > 0) {
          this.airstrikeBombsRemaining--;
          this.airstrikeNextBombTimer =
            KILLSTREAK_CONFIGS[KILLSTREAK_TYPES.AIRSTRIKE].bombInterval;

          // Compute cluster strike dispersion around target
          const spreadRadius = (3 - this.airstrikeBombsRemaining) * 3.5;
          const randomAngle = Math.random() * Math.PI * 2;
          const impactPos = this.airstrikeTarget.clone();
          impactPos.x += Math.cos(randomAngle) * spreadRadius;
          impactPos.z += Math.sin(randomAngle) * spreadRadius;

          this.#detonateAirstrikeBomb(impactPos, enemies, playerPos);

          if (this.airstrikeBombsRemaining <= 0) {
            this.airstrikeActive = false;
            this.airstrikeTarget = null;
          }
        }
      }
    }
  }

  /**
   * Detonates a single cluster bomb with trauma shake, AoE blast, and procedural explosion audio.
   */
  #detonateAirstrikeBomb(impactPos, enemies, playerPos) {
    const cfg = KILLSTREAK_CONFIGS[KILLSTREAK_TYPES.AIRSTRIKE];

    // Play heavy procedural explosion audio
    this.audio?.playRocketExplosion?.(impactPos);

    // Camera trauma shake based on proximity to player
    if (this.kinetics && playerPos) {
      const distToPlayer = impactPos.distanceTo(playerPos);
      const traumaAmount = Math.max(0, 1 - distToPlayer / 45) * cfg.trauma;
      this.kinetics.addTrauma?.(traumaAmount);
    }

    // AoE damage to active enemies within blast radius
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const d = enemy.group.position.distanceTo(impactPos);
      if (d <= cfg.radius) {
        const falloff = 1 - d / cfg.radius;
        const damage = Math.round(cfg.damage * falloff);
        enemy.takeDamage?.(damage, impactPos);
      }
    }

    // Notify callback for visual crater / explosion particles
    this.onAirstrikeImpact(impactPos, cfg.radius);
  }

  /**
   * Returns serializable telemetry status for HUD and unit tests.
   */
  getStatus() {
    return {
      streak: this.streak,
      uavReady: this.uavReady,
      uavActive: this.uavActive,
      uavTimeRemaining: Math.max(0, this.uavTimer),
      airstrikeReady: this.airstrikeReady,
      airstrikeActive: this.airstrikeActive,
    };
  }
}

const KILLSTREAV_TYPES_SAFE = KILLSTREAK_TYPES.UAV;
