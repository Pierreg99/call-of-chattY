/**
 * Call-of-ChattY Unified FPS Engine - Procedural WebAudio Synthesizer.
 *
 * 100% procedural sound synthesis with ZERO external MP3/WAV/OGG dependencies.
 *
 * Sourced & synthesized from call-of-groky and futuristic-call-of-shooty:
 * - Autoplay safe lifecycle: starts suspended, awakens unconditionally on first user interaction.
 * - Layered gunshot transients: filtered white/pink noise buffer cascade + 3-oscillator pitch sweeps.
 * - Distinct weapon soundscapes: Assault Carbine, Tactical Shotgun, Precision Sniper, EMP/Frag Grenade.
 * - 4-stage tactical reload sound cues (mag-out, mag-in, bolt-rack, ready).
 * - Dry-fire click (800Hz square tone, 0.03s) and hit marker (sine 2200->3400Hz, 0.07s).
 * - Supersonic bullet flyby snap tone on near-miss (<1.5m).
 * - Brass shell drop clinks (3800Hz / 4400Hz).
 * - 3D spatial audio listener orientation and distance attenuation: gain = 1 / (1 + 0.12 * d).
 */

export class TacticalAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ready = false;

    // 3D Spatial Listener state
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.listenerForward = { x: 0, y: 0, z: -1 };
    this.listenerUp = { x: 0, y: 1, z: 0 };

    this.footstepTimer = 0;
    this.cachedNoiseBuffer = null;
    this.lastShellFreq = 3800;

    // Autoplay safe lifecycle: listen for first user interaction to awaken
    this.#setupAutoplayAwakening();
  }

  /**
   * Registers non-intrusive one-time event listeners across interaction types
   * to awaken AudioContext on first user gesture without console warnings.
   */
  #setupAutoplayAwakening() {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const awakenHandler = () => {
      this.ensure();
      this.resume();
    };

    const events = ["click", "mousedown", "keydown", "touchstart", "pointerdown"];
    for (const evt of events) {
      window.addEventListener(evt, awakenHandler, { passive: true, once: true });
    }
  }

  /**
   * Initializes AudioContext in suspended state and creates master routing bus.
   */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    const AudioCtx =
      globalThis.AudioContext ||
      globalThis.webkitAudioContext ||
      (typeof window !== "undefined"
        ? window.AudioContext || window.webkitAudioContext
        : null);

    if (!AudioCtx) return null;

    try {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.36;
      this.master.connect(this.ctx.destination);
      this.ready = true;
      this.#precomputeNoiseBuffer();
    } catch {
      this.ready = false;
    }

    return this.ctx;
  }

  /**
   * Alias for ensure() matching existing engine initialization patterns.
   */
  init() {
    return this.ensure();
  }

  /**
   * Unconditionally resumes suspended audio context.
   */
  resume() {
    if (this.ctx?.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Precomputes organic pink-weighted noise buffer for transient generation.
   */
  #precomputeNoiseBuffer() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate || 44100;
    const duration = 1.0;
    const length = Math.floor(sampleRate * duration);

    this.cachedNoiseBuffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = this.cachedNoiseBuffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2.0 - 1.0;
      // Spectral low-pass weighting for gunpowder acoustic transients
      const rollOff = 1.0 - (i / length) * 0.35;
      data[i] = white * rollOff;
    }
  }

  /**
   * Configures 3D spatial audio listener position and orientation.
   * Supports both (x, y, z) and (posVector, forwardVector, upVector) signatures.
   */
  setListener(pos, forward = null, up = null) {
    if (typeof pos === "number") {
      this.listenerPos.x = pos;
      this.listenerPos.y = forward || 0;
      this.listenerPos.z = up || 0;
    } else if (pos) {
      this.listenerPos.x = pos.x || 0;
      this.listenerPos.y = pos.y || 0;
      this.listenerPos.z = pos.z || 0;

      if (forward) {
        this.listenerForward.x = forward.x || 0;
        this.listenerForward.y = forward.y || 0;
        this.listenerForward.z = forward.z || -1;
      }
      if (up) {
        this.listenerUp.x = up.x || 0;
        this.listenerUp.y = up.y || 1;
        this.listenerUp.z = up.z || 0;
      }
    }

    if (!this.ctx?.listener) return;

    const l = this.ctx.listener;
    const t = this.ctx.currentTime || 0;

    // Modern WebAudio AudioParam orientation
    if (l.positionX) {
      l.positionX.setValueAtTime(this.listenerPos.x, t);
      l.positionY.setValueAtTime(this.listenerPos.y, t);
      l.positionZ.setValueAtTime(this.listenerPos.z, t);
    } else if (typeof l.setPosition === "function") {
      l.setPosition(this.listenerPos.x, this.listenerPos.y, this.listenerPos.z);
    }

    if (l.forwardX) {
      l.forwardX.setValueAtTime(this.listenerForward.x, t);
      l.forwardY.setValueAtTime(this.listenerForward.y, t);
      l.forwardZ.setValueAtTime(this.listenerForward.z, t);
      l.upX.setValueAtTime(this.listenerUp.x, t);
      l.upY.setValueAtTime(this.listenerUp.y, t);
      l.upZ.setValueAtTime(this.listenerUp.z, t);
    } else if (typeof l.setOrientation === "function") {
      l.setOrientation(
        this.listenerForward.x,
        this.listenerForward.y,
        this.listenerForward.z,
        this.listenerUp.x,
        this.listenerUp.y,
        this.listenerUp.z
      );
    }
  }

  /**
   * Creates a 3D spatial audio bus with distance attenuation gain = 1 / (1 + 0.12 * d)
   * and stereo horizontal panning.
   */
  #createSpatialBus(worldPos) {
    if (!this.ready || !this.ctx) {
      this.ensure();
      if (!this.ready || !this.ctx) return null;
    }

    if (!worldPos) {
      return this.master;
    }

    const wx = worldPos.x || 0;
    const wy = worldPos.y || 0;
    const wz = worldPos.z || 0;

    const dx = wx - this.listenerPos.x;
    const dy = wy - this.listenerPos.y;
    const dz = wz - this.listenerPos.z;
    const distance = Math.hypot(dx, dy, dz);

    // Distance attenuation formula: 1 / (1 + 0.12 * d)
    const distGain = Math.max(0.04, Math.min(1.0, 1 / (1 + 0.12 * distance)));

    // Stereo panning across horizontal axis
    const pan = Math.max(-1.0, Math.min(1.0, dx / Math.max(1.0, distance)));

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = distGain;

    if (typeof this.ctx.createStereoPanner === "function") {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      gainNode.connect(panner);
      panner.connect(this.master);
    } else {
      gainNode.connect(this.master);
    }

    return gainNode;
  }

  /**
   * Procedural filtered noise burst with exponential decay.
   */
  #noiseBurst(dest, t, duration, cutoff, gain = 0.3, type = "bandpass", q = 0.85) {
    if (!this.ready || !this.ctx) return;
    if (!this.cachedNoiseBuffer) this.#precomputeNoiseBuffer();
    if (!this.cachedNoiseBuffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = this.cachedNoiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(cutoff, t);
    filter.Q.setValueAtTime(q, t);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(Math.max(0.0001, gain), t);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(dest || this.master);

    src.start(t);
    src.stop(t + duration + 0.02);
  }

  /**
   * Procedural frequency-swept oscillator tone with exponential decay.
   */
  tone({
    frequency = 440,
    sweepFreq = null,
    sweep = 0,
    duration = 0.08,
    type = "sine",
    volume = 0.2,
    dest = null,
    startTime = null,
  } = {}) {
    if (!this.ready || !this.ctx) {
      this.ensure();
      if (!this.ready || !this.ctx) return;
    }

    const t = startTime !== null ? startTime : this.ctx.currentTime;
    const target = dest || this.master;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(10, frequency), t);

    // Exponential frequency sweep
    let endFreq = frequency;
    if (sweepFreq !== null) {
      endFreq = sweepFreq;
    } else if (sweep !== 0) {
      endFreq = Math.max(10, frequency + sweep);
    }

    if (endFreq !== frequency) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), t + duration);
    }

    gainNode.gain.setValueAtTime(Math.max(0.0001, volume), t);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.connect(gainNode);
    gainNode.connect(target);

    osc.start(t);
    osc.stop(t + duration + 0.015);
  }

  // ==========================================
  // WEAPON SOUND SYNTHESIZERS
  // ==========================================

  /**
   * Unified weapon shot dispatcher routing to distinct procedural synthesizers.
   */
  shot(weaponType, worldPosition = null, extra = null) {
    const type = String(weaponType || "").toLowerCase();
    switch (type) {
      case "shotgun":
        return this.fireShotgun(worldPosition);
      case "sniper":
        return this.fireSniper(worldPosition);
      case "grenade":
        return this.explosion(worldPosition);
      case "akimbo":
        return this.fireAkimbo(worldPosition, extra?.isLeft);
      case "rpg":
      case "rocket":
        return this.fireRocket(worldPosition);
      case "carbine":
      default:
        return this.fireCarbine(worldPosition);
    }
  }

  /**
   * Assault Carbine (GROKY-16) - Rapid crack transient:
   * Layered white noise burst with bandpass/lowpass cascade +
   * exponential sweeps: square 220->120Hz, sawtooth 360->45Hz, sine 55->40Hz sub-bass.
   */
  fireCarbine(worldPos = null) {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const bus = this.#createSpatialBus(worldPos);
    if (!bus) return;
    const now = this.ctx.currentTime;

    // Filter cascade noise transients
    this.#noiseBurst(bus, now, 0.065, 1400, 0.55, "bandpass", 0.85);
    this.#noiseBurst(bus, now, 0.09, 1960, 0.38, "lowpass", 0.75);

    // Layered exponential frequency sweep oscillators
    // 1. Square wave 220 -> 120Hz (mechanical punch)
    this.tone({
      frequency: 220,
      sweepFreq: 120,
      duration: 0.045,
      type: "square",
      volume: 0.22,
      dest: bus,
      startTime: now,
    });

    // 2. Sawtooth wave 360 -> 45Hz (acoustic body crack)
    this.tone({
      frequency: 360,
      sweepFreq: 45,
      duration: 0.09,
      type: "sawtooth",
      volume: 0.25,
      dest: bus,
      startTime: now,
    });

    // 3. Sine wave 55 -> 40Hz (sub-bass thump)
    this.tone({
      frequency: 55,
      sweepFreq: 40,
      duration: 0.12,
      type: "sine",
      volume: 0.26,
      dest: bus,
      startTime: now,
    });
  }

  /**
   * Tactical Shotgun - Heavy explosive blast with deep bass and wide acoustic bloom.
   */
  fireShotgun(worldPos = null) {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const bus = this.#createSpatialBus(worldPos);
    if (!bus) return;
    const now = this.ctx.currentTime;

    // Massive noise explosions
    this.#noiseBurst(bus, now, 0.14, 900, 0.72, "bandpass", 0.9);
    this.#noiseBurst(bus, now, 0.2, 320, 0.6, "lowpass", 0.8);

    // Heavy mechanical body punch
    this.tone({
      frequency: 160,
      sweepFreq: 65,
      duration: 0.09,
      type: "square",
      volume: 0.32,
      dest: bus,
      startTime: now,
    });

    // Wide concussive blast
    this.tone({
      frequency: 240,
      sweepFreq: 35,
      duration: 0.16,
      type: "sawtooth",
      volume: 0.38,
      dest: bus,
      startTime: now,
    });

    // Massive sub-bass kick
    this.tone({
      frequency: 45,
      sweepFreq: 22,
      duration: 0.24,
      type: "sine",
      volume: 0.48,
      dest: bus,
      startTime: now,
    });
  }

  /**
   * Precision Bolt-Action Sniper - Supersonic sonic boom and reverberant muzzle whip.
   */
  fireSniper(worldPos = null) {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const bus = this.#createSpatialBus(worldPos);
    if (!bus) return;
    const now = this.ctx.currentTime;

    // High velocity supersonic muzzle whip
    this.#noiseBurst(bus, now, 0.08, 3400, 0.65, "highpass", 0.85);
    this.#noiseBurst(bus, now, 0.25, 600, 0.58, "bandpass", 0.7);

    // Hard punch
    this.tone({
      frequency: 380,
      sweepFreq: 90,
      duration: 0.08,
      type: "square",
      volume: 0.35,
      dest: bus,
      startTime: now,
    });

    // Sustained cannon rumble
    this.tone({
      frequency: 360,
      sweepFreq: 35,
      duration: 0.28,
      type: "sawtooth",
      volume: 0.42,
      dest: bus,
      startTime: now,
    });

    // Deep sub-bass sonic boom
    this.tone({
      frequency: 48,
      sweepFreq: 20,
      duration: 0.45,
      type: "sine",
      volume: 0.58,
      dest: bus,
      startTime: now,
    });
  }

  /**
   * Frag / EMP Grenade - Heavy concussive explosion with sub-bass shockwave.
   */
  explosion(worldPos = null) {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const bus = this.#createSpatialBus(worldPos);
    if (!bus) return;
    const now = this.ctx.currentTime;

    // Concussive shockwave blast
    this.#noiseBurst(bus, now, 0.45, 420, 0.82, "lowpass", 0.8);
    this.#noiseBurst(bus, now, 0.18, 1600, 0.48, "bandpass", 0.7);

    // Deep destructive rumble
    this.tone({
      frequency: 180,
      sweepFreq: 32,
      duration: 0.38,
      type: "sawtooth",
      volume: 0.5,
      dest: bus,
      startTime: now,
    });

    // Sub-bass crater detonation
    this.tone({
      frequency: 36,
      sweepFreq: 15,
      duration: 0.6,
      type: "sine",
      volume: 0.65,
      dest: bus,
      startTime: now,
    });
  }

  /**
   * Akimbo Tactical Pistols - Snappy dual-wield pistol report with mechanical slide snap.
   * Alternates stereo panning left / right when firing from hip.
   */
  fireAkimbo(worldPos = null, isLeft = false) {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    let bus = this.#createSpatialBus(worldPos);
    if (!worldPos && typeof this.ctx.createStereoPanner === "function") {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = isLeft ? -0.28 : 0.28;
      panner.connect(this.master);
      bus = panner;
    }

    const now = this.ctx.currentTime;

    // Crisp mechanical pistol crack
    this.#noiseBurst(bus, now, 0.045, 2200, 0.45, "highpass", 0.7);
    this.#noiseBurst(bus, now, 0.07, 1600, 0.4, "bandpass", 0.8);

    // Slide kick transient
    this.tone({
      frequency: 310,
      sweepFreq: 110,
      duration: 0.05,
      type: "square",
      volume: 0.22,
      dest: bus,
      startTime: now,
    });

    // Caliber punch
    this.tone({
      frequency: 85,
      sweepFreq: 45,
      duration: 0.08,
      type: "sine",
      volume: 0.24,
      dest: bus,
      startTime: now,
    });
  }

  /**
   * Heavy RPG-7 Launcher - Rocket motor whoosh and concussive exhaust blast.
   */
  fireRocket(worldPos = null) {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const bus = this.#createSpatialBus(worldPos);
    if (!bus) return;
    const now = this.ctx.currentTime;

    // Motor whoosh noise ramp
    this.#noiseBurst(bus, now, 0.35, 680, 0.65, "bandpass", 1.2);

    // Motor thrust ignition tone
    this.tone({
      frequency: 180,
      sweepFreq: 45,
      duration: 0.22,
      type: "sawtooth",
      volume: 0.45,
      dest: bus,
      startTime: now,
    });

    // Sub-bass exhaust pop
    this.tone({
      frequency: 62,
      sweepFreq: 28,
      duration: 0.28,
      type: "sine",
      volume: 0.5,
      dest: bus,
      startTime: now,
    });
  }

  playRocketLaunch(worldPos = null) {
    this.fireRocket(worldPos);
  }

  /**
   * Massive RPG / Airstrike high-yield detonation shockwave with long sub-bass rumble.
   */
  playRocketExplosion(worldPos = null) {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const bus = this.#createSpatialBus(worldPos);
    if (!bus) return;
    const now = this.ctx.currentTime;

    // Massive concussive shockwave
    this.#noiseBurst(bus, now, 0.65, 340, 0.95, "lowpass", 0.85);
    this.#noiseBurst(bus, now, 0.28, 1400, 0.6, "bandpass", 0.7);

    // Concussive punch
    this.tone({
      frequency: 160,
      sweepFreq: 24,
      duration: 0.45,
      type: "sawtooth",
      volume: 0.6,
      dest: bus,
      startTime: now,
    });

    // Deep sub-bass crater rumble
    this.tone({
      frequency: 44,
      sweepFreq: 14,
      duration: 0.9,
      type: "sine",
      volume: 0.75,
      dest: bus,
      startTime: now,
    });
  }

  /**
   * High-tech electronic tactical UAV radar sweep chime.
   */
  playUavPing() {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const now = this.ctx.currentTime;
    this.tone({
      frequency: 1650,
      sweepFreq: 2150,
      duration: 0.08,
      type: "sine",
      volume: 0.2,
      startTime: now,
    });
    this.tone({
      frequency: 1850,
      sweepFreq: 1450,
      duration: 0.12,
      type: "triangle",
      volume: 0.12,
      startTime: now + 0.06,
    });
  }

  /**
   * Precision Airstrike supersonic jet flyby with Doppler shift and turbine roar.
   */
  playJetFlyby() {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const now = this.ctx.currentTime;
    const duration = 2.2;

    this.tone({
      frequency: 2400,
      sweepFreq: 380,
      duration,
      type: "sine",
      volume: 0.28,
      startTime: now,
    });

    if (this.cachedNoiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.cachedNoiseBuffer;
      src.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(3200, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + duration);
      filter.Q.setValueAtTime(1.8, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.55, now + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      src.start(now);
      src.stop(now + duration + 0.05);
    }
  }

  /**
   * Night Vision goggles phosphor tube activation whine and relay click.
   */
  playNightVisionToggle(enabled = true) {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const now = this.ctx.currentTime;
    this.tone({
      frequency: enabled ? 3600 : 4800,
      sweepFreq: enabled ? 5200 : 2800,
      duration: 0.055,
      type: "sine",
      volume: 0.16,
      startTime: now,
    });
    this.tone({
      frequency: 950,
      duration: 0.02,
      type: "square",
      volume: 0.1,
      startTime: now + 0.03,
    });
  }

  /**
   * Tactical radio announcement chime when a killstreak reward is unlocked.
   */
  playKillstreakEarned(name = "") {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const now = this.ctx.currentTime;
    this.#noiseBurst(this.master, now, 0.04, 3200, 0.15, "bandpass");
    this.tone({
      frequency: 580,
      duration: 0.06,
      type: "triangle",
      volume: 0.22,
      startTime: now + 0.02,
    });
    this.tone({
      frequency: 880,
      duration: 0.09,
      type: "triangle",
      volume: 0.25,
      startTime: now + 0.09,
    });
  }

  // ==========================================
  // TACTICAL SFX: CLICKS, RELOADS, FLYBYS, SHELLS
  // ==========================================

  /**
   * Dry fire click on empty magazine: 800Hz square tone, 0.03s duration.
   */
  dryClick() {
    this.tone({
      frequency: 800,
      duration: 0.03,
      type: "square",
      volume: 0.12,
    });
  }

  /**
   * Hit marker confirmation: sine 2200 -> 3400Hz sweep, 0.07s duration.
   */
  hitMarker() {
    this.tone({
      frequency: 2200,
      sweepFreq: 3400,
      duration: 0.07,
      type: "sine",
      volume: 0.22,
    });
  }

  /**
   * Backward-compatible alias for hitMarker.
   */
  hit() {
    this.hitMarker();
  }

  /**
   * 4-Stage tactical reload sound cues:
   * Phase 0 (mag-out): triangle 420 -> 160Hz
   * Phase 1 (mag-in): square 320 -> 680Hz
   * Phase 2 (bolt-rack): sawtooth 540 -> 240Hz
   * Phase 3 (ready): subtle mechanical click
   */
  reloadPhase(phaseIndex) {
    let phase = phaseIndex;
    if (typeof phase === "string") {
      switch (phase.toLowerCase()) {
        case "mag-out":
        case "magout":
          phase = 0;
          break;
        case "mag-in":
        case "magin":
          phase = 1;
          break;
        case "bolt-rack":
        case "boltrack":
          phase = 2;
          break;
        case "ready":
          phase = 3;
          break;
        default:
          phase = 0;
      }
    }

    switch (phase) {
      case 0:
        // Mag-out: triangle 420 -> 160Hz, 0.10s
        this.tone({
          frequency: 420,
          sweepFreq: 160,
          duration: 0.1,
          type: "triangle",
          volume: 0.2,
        });
        break;
      case 1:
        // Mag-in: square 320 -> 680Hz, 0.08s
        this.tone({
          frequency: 320,
          sweepFreq: 680,
          duration: 0.08,
          type: "square",
          volume: 0.25,
        });
        break;
      case 2:
        // Bolt-rack: sawtooth 540 -> 240Hz, 0.12s
        this.tone({
          frequency: 540,
          sweepFreq: 240,
          duration: 0.12,
          type: "sawtooth",
          volume: 0.28,
        });
        break;
      case 3:
      default:
        // Ready: subtle high mechanical click
        this.tone({
          frequency: 720,
          sweepFreq: 840,
          duration: 0.04,
          type: "sine",
          volume: 0.15,
        });
        break;
    }
  }

  /**
   * Supersonic bullet flyby snap tone on near-miss (<1.5m).
   * Supports either numeric distance or world position object.
   */
  bulletFlyby(distanceOrPos = 0.8) {
    let dist = 0.8;
    let worldPos = null;

    if (typeof distanceOrPos === "number") {
      dist = distanceOrPos;
    } else if (distanceOrPos) {
      worldPos = distanceOrPos;
      const dx = (worldPos.x || 0) - this.listenerPos.x;
      const dy = (worldPos.y || 0) - this.listenerPos.y;
      const dz = (worldPos.z || 0) - this.listenerPos.z;
      dist = Math.hypot(dx, dy, dz);
    }

    // Only near-misses (<1.5m) trigger supersonic crack
    if (dist > 1.5) return;

    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const bus = this.#createSpatialBus(worldPos);
    const now = this.ctx.currentTime;

    // High-frequency transient snap
    this.#noiseBurst(bus, now, 0.025, 3800, 0.4, "highpass");

    // Supersonic Doppler whip tone
    this.tone({
      frequency: 2800,
      sweepFreq: 600,
      duration: 0.065,
      type: "sine",
      volume: 0.24,
      dest: bus,
      startTime: now,
    });
  }

  /**
   * Alias for bulletFlyby.
   */
  flyby(distanceOrPos) {
    this.bulletFlyby(distanceOrPos);
  }

  /**
   * Brass shell drop clinks: metallic resonant tones at 3800Hz / 4400Hz.
   */
  shellDrop(worldPosition = null) {
    if (!this.ready || !this.ctx) this.ensure();
    if (!this.ready || !this.ctx) return;

    const bus = this.#createSpatialBus(worldPosition);
    const now = this.ctx.currentTime;

    // Alternate between 3800Hz and 4400Hz resonant harmonics
    const freq = this.lastShellFreq === 3800 ? 4400 : 3800;
    this.lastShellFreq = freq;

    // Metallic ping tone
    this.tone({
      frequency: freq,
      sweepFreq: freq - 220,
      duration: 0.045,
      type: "triangle",
      volume: 0.14,
      dest: bus,
      startTime: now,
    });

    // High clink transient
    this.#noiseBurst(bus, now, 0.015, 4000, 0.1, "highpass");
  }

  // ==========================================
  // LOCOMOTION & AMBIENT PROCEDURAL CUES
  // ==========================================

  updateFootsteps(dt, moving, sprinting, grounded) {
    if (!moving || !grounded || !this.ready || !this.ctx) {
      this.footstepTimer = Math.max(0, this.footstepTimer - dt);
      return;
    }

    this.footstepTimer -= dt;
    const interval = sprinting ? 0.28 : 0.42;

    if (this.footstepTimer <= 0) {
      this.footstepTimer = interval;
      const now = this.ctx.currentTime;
      this.#noiseBurst(
        this.master,
        now,
        0.032,
        380,
        sprinting ? 0.22 : 0.14,
        "lowpass"
      );
      this.tone({
        frequency: 62,
        sweepFreq: 42,
        duration: 0.035,
        type: "sine",
        volume: 0.1,
      });
    }
  }

  ads(aimingIn = true) {
    this.tone({
      frequency: aimingIn ? 640 : 420,
      sweepFreq: aimingIn ? 780 : 280,
      duration: 0.04,
      type: "sine",
      volume: 0.12,
    });
  }

  kill() {
    this.tone({
      frequency: 520,
      duration: 0.065,
      type: "square",
      volume: 0.18,
    });
    setTimeout(() => {
      this.tone({
        frequency: 820,
        duration: 0.09,
        type: "triangle",
        volume: 0.22,
      });
    }, 45);
  }

  damage() {
    this.tone({
      frequency: 110,
      sweepFreq: 55,
      duration: 0.14,
      type: "sine",
      volume: 0.18,
    });
  }

  death() {
    this.tone({
      frequency: 210,
      sweepFreq: 70,
      duration: 0.22,
      type: "sawtooth",
      volume: 0.22,
    });
    this.tone({
      frequency: 85,
      sweepFreq: 50,
      duration: 0.32,
      type: "sine",
      volume: 0.26,
    });
  }

  ui() {
    this.tone({
      frequency: 760,
      sweepFreq: 820,
      duration: 0.035,
      type: "triangle",
      volume: 0.08,
    });
  }

  fire() {
    this.fireCarbine();
  }

  reload() {
    this.reloadPhase(0);
    setTimeout(() => this.reloadPhase(1), 120);
    setTimeout(() => this.reloadPhase(2), 550);
  }
}
