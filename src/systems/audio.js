/**
 * TacticalAudio - 100% Procedural WebAudio Sound Synthesizer.
 * Sourced & evolved from call-of-groky and futuristic-call-of-shooty.
 * Zero external WAV/MP3 downloads required.
 * Synthesizes multi-weapon gunfire, bullet supersonic snaps, grenade detonations,
 * footstep cadences, and 3D spatialized stereo cues.
 */
export class TacticalAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ready = false;
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.footstepTimer = 0;
    this.cachedNoiseBuffer = null;
  }

  init() {
    if (this.ready) return;
    const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
    this.ready = true;
    this.#precomputeNoise();
  }

  resume() {
    if (this.ctx?.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  #precomputeNoise() {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    this.cachedNoiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.cachedNoiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // Pink-weighted spectrum for organic acoustic transients
      data[i] = white * (1 - (i / len) * 0.3);
    }
  }

  setListener(x, y, z) {
    this.listenerPos.x = x;
    this.listenerPos.y = y;
    this.listenerPos.z = z;
  }

  #createSpatialBus(worldPos) {
    if (!this.ready || !this.ctx) return null;
    let distGain = 1;
    let pan = 0;

    if (worldPos) {
      const dx = worldPos.x - this.listenerPos.x;
      const dy = worldPos.y - this.listenerPos.y;
      const dz = worldPos.z - this.listenerPos.z;
      const dist = Math.hypot(dx, dy, dz);
      distGain = Math.max(0.04, 1 / (1 + dist * 0.08));
      pan = Math.max(-1, Math.min(1, dx / Math.max(1, dist)));
    }

    const out = this.ctx.createGain();
    out.gain.value = distGain;

    if (this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      out.connect(panner);
      panner.connect(this.master);
    } else {
      out.connect(this.master);
    }

    return out;
  }

  #noiseBurst(dest, t, dur, cutoff, gain = 0.3, type = "bandpass") {
    if (!this.ready || !this.ctx || !this.cachedNoiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.cachedNoiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = 0.85;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(filter);
    filter.connect(g);
    g.connect(dest);

    src.start(t);
    src.stop(t + dur + 0.02);
  }

  tone({
    frequency = 440,
    duration = 0.08,
    type = "sine",
    volume = 0.2,
    sweep = 0,
    dest = null,
  } = {}) {
    if (!this.ready || !this.ctx) return;
    const now = this.ctx.currentTime;
    const target = dest || this.master;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (sweep) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, frequency + sweep),
        now + duration
      );
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  // Multi-weapon synthesizers
  fireCarbine(worldPos = null) {
    if (!this.ready || !this.ctx) return;
    const bus = this.#createSpatialBus(worldPos);
    if (!bus) return;
    const now = this.ctx.currentTime;

    // Fast initial crack + punchy body sweep + sub-thump
    this.#noiseBurst(bus, now, 0.065, 1600, 0.52);
    this.#noiseBurst(bus, now, 0.11, 480, 0.36, "lowpass");
    this.tone({ frequency: 240, duration: 0.045, type: "square", volume: 0.22, sweep: -160, dest: bus });
    this.tone({ frequency: 95, duration: 0.1, type: "sawtooth", volume: 0.16, sweep: 80, dest: bus });
    this.tone({ frequency: 55, duration: 0.12, type: "sine", volume: 0.22, sweep: -25, dest: bus });
  }

  fireShotgun(worldPos = null) {
    if (!this.ready || !this.ctx) return;
    const bus = this.#createSpatialBus(worldPos);
    if (!bus) return;
    const now = this.ctx.currentTime;

    // Massive wide explosive acoustic blast
    this.#noiseBurst(bus, now, 0.14, 900, 0.72);
    this.#noiseBurst(bus, now, 0.18, 320, 0.55, "lowpass");
    this.tone({ frequency: 160, duration: 0.09, type: "sawtooth", volume: 0.35, sweep: -110, dest: bus });
    this.tone({ frequency: 72, duration: 0.16, type: "square", volume: 0.28, sweep: -40, dest: bus });
    this.tone({ frequency: 42, duration: 0.24, type: "sine", volume: 0.45, sweep: -20, dest: bus });
  }

  fireSniper(worldPos = null) {
    if (!this.ready || !this.ctx) return;
    const bus = this.#createSpatialBus(worldPos);
    if (!bus) return;
    const now = this.ctx.currentTime;

    // High velocity supersonic muzzle whip + deep sustained cannon boom
    this.#noiseBurst(bus, now, 0.08, 3400, 0.65, "highpass");
    this.#noiseBurst(bus, now, 0.22, 600, 0.58, "bandpass");
    this.tone({ frequency: 380, duration: 0.07, type: "square", volume: 0.35, sweep: -280, dest: bus });
    this.tone({ frequency: 120, duration: 0.3, type: "sawtooth", volume: 0.4, sweep: -85, dest: bus });
    this.tone({ frequency: 38, duration: 0.45, type: "sine", volume: 0.55, sweep: -15, dest: bus });
  }

  bulletFlyby(worldPos = null) {
    if (!this.ready || !this.ctx) return;
    const bus = this.#createSpatialBus(worldPos);
    if (!bus) return;
    const now = this.ctx.currentTime;

    // Supersonic snap (sharp high-frequency transient) + Doppler whip
    this.#noiseBurst(bus, now, 0.02, 3800, 0.38, "highpass");
    this.tone({ frequency: 2800, duration: 0.08, type: "sine", volume: 0.18, sweep: -2100, dest: bus });
  }

  explosion(worldPos = null) {
    if (!this.ready || !this.ctx) return;
    const bus = this.#createSpatialBus(worldPos);
    if (!bus) return;
    const now = this.ctx.currentTime;

    // Heavy concussive explosion
    this.#noiseBurst(bus, now, 0.4, 450, 0.8, "lowpass");
    this.#noiseBurst(bus, now, 0.15, 1800, 0.45, "bandpass");
    this.tone({ frequency: 180, duration: 0.35, type: "sawtooth", volume: 0.45, sweep: -145, dest: bus });
    this.tone({ frequency: 34, duration: 0.55, type: "sine", volume: 0.6, sweep: -16, dest: bus });
  }

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
      this.#noiseBurst(this.master, now, 0.032, 380, sprinting ? 0.22 : 0.14, "lowpass");
      this.tone({ frequency: 62, duration: 0.035, type: "sine", volume: 0.1, sweep: -20 });
    }
  }

  ads(aimingIn = true) {
    this.tone({
      frequency: aimingIn ? 640 : 420,
      duration: 0.04,
      type: "sine",
      volume: 0.12,
      sweep: aimingIn ? 140 : -140,
    });
  }

  kill() {
    const now = this.ctx?.currentTime || 0;
    this.tone({ frequency: 520, duration: 0.065, type: "square", volume: 0.18 });
    setTimeout(() => {
      this.tone({ frequency: 820, duration: 0.09, type: "triangle", volume: 0.22 });
    }, 45);
  }

  // Backward-compatible API
  fire() {
    this.fireCarbine();
  }

  hit() {
    this.tone({ frequency: 1800, duration: 0.045, type: "triangle", volume: 0.18, sweep: -600 });
  }

  death() {
    this.tone({ frequency: 210, duration: 0.22, type: "sawtooth", volume: 0.22, sweep: -140 });
    this.tone({ frequency: 85, duration: 0.32, type: "sine", volume: 0.26, sweep: -35 });
  }

  reload() {
    this.tone({ frequency: 540, duration: 0.06, type: "triangle", volume: 0.12, sweep: -120 });
    setTimeout(() => {
      this.tone({ frequency: 260, duration: 0.09, type: "triangle", volume: 0.11, sweep: 140 });
    }, 120);
    setTimeout(() => {
      this.tone({ frequency: 720, duration: 0.05, type: "sine", volume: 0.14, sweep: -60 });
    }, 550);
  }

  damage() {
    this.tone({ frequency: 110, duration: 0.14, type: "sine", volume: 0.18, sweep: -55 });
  }

  ui() {
    this.tone({ frequency: 760, duration: 0.035, type: "triangle", volume: 0.08, sweep: 60 });
  }
}
