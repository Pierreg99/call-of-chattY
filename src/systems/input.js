import * as THREE from "three";

/**
 * Universal Dual-Mode Input System for Call of ChattY.
 * Synthesizes architecture from futuristic-call-of-shooty and call-of-groky.
 *
 * Provides:
 * 1. Capability Auto-Detection (Touch vs Mouse/Keyboard).
 * 2. TouchControls:
 *    - Left floating virtual joystick with dynamic thumbstick anchoring,
 *      outer radius R=56px, deadzone 0.12, radial clamping,
 *      outer remapping [0.12, 1.0] -> [0, 1.0], and sprint threshold 0.85.
 *    - Right look drag surface with sub-pixel jitter filter (dx^2 + dy^2 < 0.25),
 *      hip sensitivity 0.004 rad/px, ADS sensitivity 0.002 rad/px,
 *      and pitch clamping [-1.496, 1.496] rad.
 *    - Floating action buttons: Fire, ADS (hybrid tap-toggle <=240ms / hold >240ms),
 *      Jump, Reload, Weapon Swap, Sprint.
 *    - Non-passive touch prevention with { passive: false }, e.preventDefault(),
 *      and CSS touch-action: none / user-select: none.
 * 3. DesktopControls:
 *    - PointerLock mouse look, WASD locomotion (normalized),
 *      Shift (sprint), Space (jump), R (reload), 1-4 (weapon selection),
 *      RMB (ADS), LMB (Fire), Wheel (weapon cycle).
 * 4. Unified InputManager exposing:
 *    - getState(): { move: { x, y }, look: { dx, dy }, fire, ads, jump, reload, sprint, weaponSlot }
 *    - poll(camera, kinetics): full runtime compatibility with src/main.js
 */

export const TOUCH_CONFIG = Object.freeze({
  joyRadius: 56,
  deadzone: 0.12,
  sprintThreshold: 0.85,
  hipSensitivity: 0.004,
  adsSensitivity: 0.002,
  jitterThresholdSq: 0.25,
  pitchMin: -1.496,
  pitchMax: 1.496,
  adsTapMs: 240,
});

export const DESKTOP_CONFIG = Object.freeze({
  hipSensitivity: 0.0022,
  adsSensitivity: 0.0011,
  pitchMin: -1.496,
  pitchMax: 1.496,
});

/**
 * Evaluates touch vs mouse capability auto-detection.
 * Checks ontouchstart, navigator.maxTouchPoints > 0, matchMedia('(pointer: coarse)'),
 * and URL search parameter ?touch=1|0.
 *
 * @returns {{ isTouch: boolean, isDesktop: boolean, pointerCoarse: boolean, forced: boolean }}
 */
export function detectCapabilities() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { isTouch: false, isDesktop: true, pointerCoarse: false, forced: false };
  }

  // 1. URL search override: ?touch=1|true or ?touch=0|false
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const touchParam = searchParams.get("touch");
    if (touchParam === "1" || touchParam === "true") {
      return { isTouch: true, isDesktop: false, pointerCoarse: true, forced: true };
    }
    if (touchParam === "0" || touchParam === "false") {
      return { isTouch: false, isDesktop: true, pointerCoarse: false, forced: true };
    }
  } catch (_) {
    // Ignore URL parse errors in non-browser environments
  }

  // 2. Hardware / Browser capability heuristics
  const ontouch = "ontouchstart" in window;
  const maxTouchPoints = typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;
  const pointerCoarse =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

  const isTouch = ontouch || maxTouchPoints > 0 || pointerCoarse;

  return {
    isTouch,
    isDesktop: !isTouch,
    pointerCoarse,
    forced: false,
  };
}

/**
 * Mobile Touch Controls Subsystem.
 * Manages floating virtual joystick, look drag surface, and circular action buttons.
 */
export class TouchControls {
  /**
   * @param {HTMLElement|null} container - Parent container for touch controls
   * @param {Object} options - Configuration overrides & callbacks
   */
  constructor(container = null, options = {}) {
    this.container = container || (typeof document !== "undefined" ? document.body : null);
    this.options = { ...TOUCH_CONFIG, ...options };

    this.visible = false;
    this.disposed = false;

    // Movement state
    this.move = { x: 0, y: 0 };
    this.joyActive = false;
    this.joyTouchId = null;
    this.joyAnchorX = 0;
    this.joyAnchorY = 0;
    this.joySprint = false;

    // Look state
    this.lookTouchId = null;
    this.lastLookX = 0;
    this.lastLookY = 0;
    this.lookDelta = { dx: 0, dy: 0 };
    this.pixelLookDelta = { dx: 0, dy: 0 };
    this.pitch = 0;

    // Action button states
    this.fire = false;
    this.ads = false;
    this.jump = false;
    this.reload = false;
    this.btnSprintToggled = false;
    this.weaponSlot = 0;
    this.requestedSlot = null;
    this.killstreakUav = false;
    this.killstreakAirstrike = false;
    this.toggleNightVision = false;

    // Hybrid ADS state machine: 'off' | 'hold' | 'toggle'
    this.adsMode = "off";
    this.adsDownTime = 0;
    this.adsWasToggle = false;

    // DOM references
    this.elements = {
      layer: null,
      joystickZone: null,
      joystickThumb: null,
      lookZone: null,
      btnFire: null,
      btnAds: null,
      btnJump: null,
      btnReload: null,
      btnSprint: null,
      btnSwap: null,
    };

    this.listeners = [];
    this.#initDOM();
    this.#applyNonPassivePrevention();
    this.#bindEvents();
  }

  #initDOM() {
    if (typeof document === "undefined") return;

    // Search for existing DOM elements from index.html / src/main.js
    let layer = document.getElementById("touch-controls-layer");
    if (!layer && this.container) {
      layer = document.createElement("div");
      layer.id = "touch-controls-layer";
      layer.style.position = "fixed";
      layer.style.inset = "0";
      layer.style.zIndex = "20";
      layer.style.pointerEvents = "none";
      layer.style.display = "none";
      this.container.appendChild(layer);
    }
    this.elements.layer = layer;

    if (!layer) return;

    // Joystick zone & thumb
    let joyZone = document.getElementById("joystick-zone");
    let joyThumb = document.getElementById("joystick-thumb");
    if (!joyZone) {
      joyZone = document.createElement("div");
      joyZone.id = "joystick-zone";
      joyZone.style.position = "absolute";
      joyZone.style.bottom = "24px";
      joyZone.style.left = "24px";
      joyZone.style.width = "140px";
      joyZone.style.height = "140px";
      joyZone.style.borderRadius = "50%";
      joyZone.style.pointerEvents = "auto";
      joyZone.style.display = "flex";
      joyZone.style.alignItems = "center";
      joyZone.style.justifyContent = "center";
      layer.appendChild(joyZone);
    }
    if (!joyThumb) {
      joyThumb = document.createElement("div");
      joyThumb.id = "joystick-thumb";
      joyThumb.style.width = "50px";
      joyThumb.style.height = "50px";
      joyThumb.style.borderRadius = "50%";
      joyThumb.style.pointerEvents = "none";
      joyThumb.style.transform = "translate(0px, 0px)";
      joyZone.appendChild(joyThumb);
    }
    this.elements.joystickZone = joyZone;
    this.elements.joystickThumb = joyThumb;

    // Look zone
    let lookZone = document.getElementById("touch-look-zone");
    if (!lookZone) {
      lookZone = document.createElement("div");
      lookZone.id = "touch-look-zone";
      lookZone.style.position = "absolute";
      lookZone.style.top = "60px";
      lookZone.style.right = "0";
      lookZone.style.bottom = "120px";
      lookZone.style.left = "45%";
      lookZone.style.pointerEvents = "auto";
      layer.appendChild(lookZone);
    }
    this.elements.lookZone = lookZone;

    // Action buttons
    this.elements.btnFire = document.getElementById("touch-btn-fire");
    this.elements.btnAds = document.getElementById("touch-btn-ads");
    this.elements.btnJump = document.getElementById("touch-btn-jump");
    this.elements.btnReload = document.getElementById("touch-btn-reload");
    this.elements.btnSprint = document.getElementById("touch-btn-sprint");
    this.elements.btnSwap = document.getElementById("touch-btn-swap");
  }

  #applyNonPassivePrevention() {
    if (typeof document === "undefined") return;

    // Mandatory CSS gesture suppression styles
    const suppressProps = {
      touchAction: "none",
      userSelect: "none",
      webkitUserSelect: "none",
      webkitTouchCallout: "none",
    };

    const targetElements = [
      this.elements.layer,
      this.elements.joystickZone,
      this.elements.joystickThumb,
      this.elements.lookZone,
      this.elements.btnFire,
      this.elements.btnAds,
      this.elements.btnJump,
      this.elements.btnReload,
      this.elements.btnSprint,
      this.elements.btnSwap,
    ];

    for (const el of targetElements) {
      if (!el || !el.style) continue;
      for (const [prop, val] of Object.entries(suppressProps)) {
        el.style[prop] = val;
      }
    }
  }

  #addListener(target, type, handler, options = { passive: false }) {
    if (!target || typeof target.addEventListener !== "function") return;
    target.addEventListener(type, handler, options);
    this.listeners.push({ target, type, handler, options });
  }

  #bindEvents() {
    if (typeof window === "undefined") return;

    const { joystickZone, joystickThumb, lookZone } = this.elements;

    // 1. Left floating virtual joystick with dynamic thumbstick anchoring
    if (joystickZone) {
      const onJoyStart = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.joyActive || e.changedTouches.length === 0) return;

        const touch = e.changedTouches[0];
        this.joyTouchId = touch.identifier;
        this.joyActive = true;

        // Dynamic thumbstick anchoring on touch:
        // Center the anchor exactly where the player pressed
        this.joyAnchorX = touch.clientX;
        this.joyAnchorY = touch.clientY;

        // Reposition base visually to anchor point
        joystickZone.style.left = `${touch.clientX}px`;
        joystickZone.style.top = `${touch.clientY}px`;
        joystickZone.style.bottom = "auto";
        joystickZone.style.transform = "translate(-50%, -50%)";

        if (joystickThumb) {
          joystickThumb.style.transform = "translate(0px, 0px)";
        }

        this.move.x = 0;
        this.move.y = 0;
        this.joySprint = false;
        if (typeof this.options.onMove === "function") this.options.onMove(0, 0);
      };

      const onJoyMove = (e) => {
        if (!this.joyActive) return;

        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier !== this.joyTouchId) continue;

          e.preventDefault();
          e.stopPropagation();

          const dx = touch.clientX - this.joyAnchorX;
          const dy = touch.clientY - this.joyAnchorY;
          const dist = Math.hypot(dx, dy);
          const R = this.options.joyRadius; // 56px

          // Radial clamping to outer radius R
          const clampedDist = Math.min(dist, R);
          const clampedX = dist > 0 ? (dx / dist) * clampedDist : 0;
          const clampedY = dist > 0 ? (dy / dist) * clampedDist : 0;

          if (joystickThumb) {
            joystickThumb.style.transform = `translate(${clampedX}px, ${clampedY}px)`;
          }

          // Normalized magnitude
          const mag = dist / R;

          if (mag < this.options.deadzone) {
            // Deadzone 0.12
            this.move.x = 0;
            this.move.y = 0;
          } else {
            // Outer remapping [0.12, 1.0] -> [0, 1.0]
            const remapped = (Math.min(mag, 1.0) - this.options.deadzone) / (1.0 - this.options.deadzone);
            this.move.x = (dx / dist) * remapped;
            // Upward drag on screen has dy < 0, forward is positive y
            this.move.y = -(dy / dist) * remapped;
          }

          // Sprint threshold 0.85 (engaged when forward stick displacement exceeds 85%)
          this.joySprint = this.move.y >= this.options.sprintThreshold;

          if (typeof this.options.onMove === "function") {
            this.options.onMove(this.move.x, this.move.y);
          }
          break;
        }
      };

      const onJoyEnd = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === this.joyTouchId) {
            e.preventDefault();
            this.joyTouchId = null;
            this.joyActive = false;
            this.move.x = 0;
            this.move.y = 0;
            this.joySprint = false;

            // Restore default docking style
            joystickZone.style.left = "24px";
            joystickZone.style.bottom = "24px";
            joystickZone.style.top = "auto";
            joystickZone.style.transform = "none";

            if (joystickThumb) {
              joystickThumb.style.transform = "translate(0px, 0px)";
            }
            if (typeof this.options.onMove === "function") {
              this.options.onMove(0, 0);
            }
            break;
          }
        }
      };

      this.#addListener(joystickZone, "touchstart", onJoyStart, { passive: false });
      this.#addListener(window, "touchmove", onJoyMove, { passive: false });
      this.#addListener(joystickZone, "touchend", onJoyEnd, { passive: false });
      this.#addListener(joystickZone, "touchcancel", onJoyEnd, { passive: false });
    }

    // 2. Right look drag surface with sub-pixel jitter filter & pitch clamping
    if (lookZone) {
      const onLookStart = (e) => {
        if (this.lookTouchId !== null) return;
        const touch = e.changedTouches[0];
        if (!touch) return;

        // Skip if touch was on an action button
        const target = e.target;
        if (target && target.closest && target.closest(".touch-action-btn, .touch-btn-cluster, .touch-actions")) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        this.lookTouchId = touch.identifier;
        this.lastLookX = touch.clientX;
        this.lastLookY = touch.clientY;
      };

      const onLookMove = (e) => {
        if (this.lookTouchId === null) return;

        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier !== this.lookTouchId) continue;

          e.preventDefault();
          e.stopPropagation();

          const dx = touch.clientX - this.lastLookX;
          const dy = touch.clientY - this.lastLookY;
          this.lastLookX = touch.clientX;
          this.lastLookY = touch.clientY;

          // Sub-pixel jitter filter: dx^2 + dy^2 < 0.25
          if (dx * dx + dy * dy < this.options.jitterThresholdSq) return;

          // Sensitivity scaling: hip 0.004 rad/px vs ADS 0.002 rad/px
          const sens = this.ads ? this.options.adsSensitivity : this.options.hipSensitivity;
          const yawDelta = -dx * sens;
          const pitchDelta = -dy * sens;

          // Pitch clamping: [-1.496, 1.496] rad
          this.pitch = Math.max(
            this.options.pitchMin,
            Math.min(this.options.pitchMax, this.pitch + pitchDelta)
          );

          this.lookDelta.dx += yawDelta;
          this.lookDelta.dy += pitchDelta;
          this.pixelLookDelta.dx += dx;
          this.pixelLookDelta.dy += dy;

          if (typeof this.options.onLook === "function") {
            this.options.onLook(yawDelta, pitchDelta);
          }
          break;
        }
      };

      const onLookEnd = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.lookTouchId) {
            e.preventDefault();
            this.lookTouchId = null;
            break;
          }
        }
      };

      this.#addListener(lookZone, "touchstart", onLookStart, { passive: false });
      this.#addListener(window, "touchmove", onLookMove, { passive: false });
      this.#addListener(lookZone, "touchend", onLookEnd, { passive: false });
      this.#addListener(lookZone, "touchcancel", onLookEnd, { passive: false });
    }

    // 3. Floating circular action buttons
    this.#bindButton(this.elements.btnFire, {
      onDown: () => {
        this.fire = true;
        if (typeof this.options.onFire === "function") this.options.onFire(true);
      },
      onUp: () => {
        this.fire = false;
        if (typeof this.options.onFire === "function") this.options.onFire(false);
      },
    });

    // ADS button: hybrid tap-toggle (<=240ms) vs hold (>240ms)
    this.#bindAdsButton(this.elements.btnAds);

    this.#bindButton(this.elements.btnJump, {
      onDown: () => {
        this.jump = true;
        if (typeof this.options.onJump === "function") this.options.onJump();
      },
    });

    this.#bindButton(this.elements.btnReload, {
      onDown: () => {
        this.reload = true;
        if (typeof this.options.onReload === "function") this.options.onReload();
      },
    });

    this.#bindButton(this.elements.btnSprint, {
      onDown: () => {
        this.btnSprintToggled = !this.btnSprintToggled;
        this.elements.btnSprint?.classList.toggle("active", this.btnSprintToggled);
        if (typeof this.options.onSprint === "function") {
          this.options.onSprint(this.btnSprintToggled || this.joySprint);
        }
      },
    });

    this.#bindButton(this.elements.btnSwap, {
      onDown: () => {
        this.weaponSlot = (this.weaponSlot + 1) % 4;
        this.requestedSlot = "next";
        if (typeof this.options.onWeaponSelect === "function") {
          this.options.onWeaponSelect(this.weaponSlot);
        }
      },
    });

    // Prevent context menu gesture
    this.#addListener(window, "contextmenu", (e) => e.preventDefault(), { passive: false });
  }

  #bindButton(btn, { onDown = null, onUp = null }) {
    if (!btn) return;

    this.#addListener(
      btn,
      "touchstart",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add("active");
        if (onDown) onDown();
      },
      { passive: false }
    );

    const handleUp = (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.remove("active");
      if (onUp) onUp();
    };

    this.#addListener(btn, "touchend", handleUp, { passive: false });
    this.#addListener(btn, "touchcancel", handleUp, { passive: false });
  }

  #bindAdsButton(btn) {
    if (!btn) return;

    const onTouchStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.adsDownTime = performance.now();
      this.adsWasToggle = this.adsMode === "toggle";

      if (this.adsMode !== "toggle") {
        this.adsMode = "hold";
        this.ads = true;
        if (typeof this.options.onAds === "function") this.options.onAds(true);
      }
      btn.classList.add("active");
    };

    const onTouchEnd = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dur = performance.now() - this.adsDownTime;

      if (dur <= this.options.adsTapMs) {
        // Tap (<=240ms): sticky toggle
        if (this.adsWasToggle) {
          this.adsMode = "off";
          this.ads = false;
          btn.classList.remove("active", "toggled");
          if (typeof this.options.onAds === "function") this.options.onAds(false);
        } else {
          this.adsMode = "toggle";
          this.ads = true;
          btn.classList.add("active", "toggled");
          if (typeof this.options.onAds === "function") this.options.onAds(true);
        }
      } else {
        // Hold (>240ms): releasing clears ADS unless already locked in toggle
        if (this.adsWasToggle) {
          this.adsMode = "toggle";
          this.ads = true;
          btn.classList.add("active", "toggled");
        } else {
          this.adsMode = "off";
          this.ads = false;
          btn.classList.remove("active", "toggled");
          if (typeof this.options.onAds === "function") this.options.onAds(false);
        }
      }
    };

    const onTouchCancel = (e) => {
      e.preventDefault();
      if (this.adsMode === "hold") {
        this.adsMode = "off";
        this.ads = false;
        btn.classList.remove("active", "toggled");
        if (typeof this.options.onAds === "function") this.options.onAds(false);
      }
    };

    this.#addListener(btn, "touchstart", onTouchStart, { passive: false });
    this.#addListener(btn, "touchend", onTouchEnd, { passive: false });
    this.#addListener(btn, "touchcancel", onTouchCancel, { passive: false });
  }

  show() {
    this.visible = true;
    if (this.elements.layer) {
      this.elements.layer.style.display = "block";
    }
  }

  hide() {
    this.visible = false;
    if (this.elements.layer) {
      this.elements.layer.style.display = "none";
    }
    this.reset();
  }

  reset() {
    this.move.x = 0;
    this.move.y = 0;
    this.joyActive = false;
    this.joyTouchId = null;
    this.joySprint = false;
    this.lookTouchId = null;
    this.lookDelta.dx = 0;
    this.lookDelta.dy = 0;
    this.pixelLookDelta.dx = 0;
    this.pixelLookDelta.dy = 0;
    this.fire = false;
    this.ads = false;
    this.adsMode = "off";
    this.jump = false;
    this.reload = false;
    this.btnSprintToggled = false;

    if (this.elements.joystickThumb) {
      this.elements.joystickThumb.style.transform = "translate(0px, 0px)";
    }
    if (this.elements.btnFire) this.elements.btnFire.classList.remove("active");
    if (this.elements.btnAds) this.elements.btnAds.classList.remove("active", "toggled");
    if (this.elements.btnSprint) this.elements.btnSprint.classList.remove("active");
  }

  update(_delta) {
    // State is continuously maintained via non-passive touch events
  }

  getState() {
    const jump = this.jump;
    this.jump = false;

    const reload = this.reload;
    this.reload = false;

    const look = { dx: this.lookDelta.dx, dy: this.lookDelta.dy };
    this.lookDelta.dx = 0;
    this.lookDelta.dy = 0;

    const sprint = this.joySprint || this.btnSprintToggled;

    return {
      move: { x: this.move.x, y: this.move.y },
      look,
      fire: this.fire,
      ads: this.ads,
      jump,
      reload,
      sprint,
      weaponSlot: this.weaponSlot,
    };
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    for (const { target, type, handler, options } of this.listeners) {
      if (target && typeof target.removeEventListener === "function") {
        target.removeEventListener(type, handler, options);
      }
    }
    this.listeners = [];
    this.reset();
  }
}

/**
 * Desktop Web Controls Subsystem.
 * Manages PointerLock mouse look, WASD locomotion, Shift sprint, Space jump, R reload,
 * 1-4 weapon selection, and RMB ADS.
 */
export class DesktopControls {
  /**
   * @param {HTMLElement|null} domElement - Target DOM element for mouse events
   * @param {Object} options - Configuration overrides
   */
  constructor(domElement = null, options = {}) {
    this.domElement = domElement || (typeof document !== "undefined" ? document.body : null);
    this.options = { ...DESKTOP_CONFIG, ...options };
    this.controls = options.controls || null;

    this.keys = new Set();
    this.fire = false;
    this.ads = false;
    this.jump = false;
    this.reload = false;
    this.weaponSlot = 0;
    this.requestedSlot = null;
    this.killstreakUav = false;
    this.killstreakAirstrike = false;
    this.toggleNightVision = false;

    this.lookDelta = { dx: 0, dy: 0 };
    this.rawMouseDelta = { dx: 0, dy: 0 };
    this.pitch = 0;
    this.isLocked = false;
    this.disposed = false;

    this.listeners = [];
    this.#bindEvents();
  }

  #addListener(target, type, handler, options = false) {
    if (!target || typeof target.addEventListener !== "function") return;
    target.addEventListener(type, handler, options);
    this.listeners.push({ target, type, handler, options });
  }

  #bindEvents() {
    if (typeof window === "undefined") return;

    // Keyboard bindings: WASD, Shift, Space, R, 1-4
    const onKeyDown = (e) => {
      this.keys.add(e.code);

      if (e.code === "Space") {
        e.preventDefault();
        this.jump = true;
      }
      if (e.code === "KeyR") {
        this.reload = true;
      }
      if (e.code === "Digit1") {
        this.weaponSlot = 0;
        this.requestedSlot = 0;
        if (typeof this.options.onWeaponSelect === "function") this.options.onWeaponSelect(0);
      }
      if (e.code === "Digit2") {
        this.weaponSlot = 1;
        this.requestedSlot = 1;
        if (typeof this.options.onWeaponSelect === "function") this.options.onWeaponSelect(1);
      }
      if (e.code === "Digit3") {
        this.weaponSlot = 2;
        this.requestedSlot = 2;
        if (typeof this.options.onWeaponSelect === "function") this.options.onWeaponSelect(2);
      }
      if (e.code === "Digit4") {
        this.weaponSlot = 3;
        this.requestedSlot = 3;
        if (typeof this.options.onWeaponSelect === "function") this.options.onWeaponSelect(3);
      }
      if (e.code === "Digit5") {
        this.weaponSlot = 4;
        this.requestedSlot = 4;
        if (typeof this.options.onWeaponSelect === "function") this.options.onWeaponSelect(4);
      }
      if (e.code === "Digit6") {
        this.weaponSlot = 5;
        this.requestedSlot = 5;
        if (typeof this.options.onWeaponSelect === "function") this.options.onWeaponSelect(5);
      }
      if (e.code === "Digit7" || e.code === "KeyU") {
        this.killstreakUav = true;
      }
      if (e.code === "Digit8" || e.code === "KeyJ") {
        this.killstreakAirstrike = true;
      }
      if (e.code === "KeyN") {
        this.toggleNightVision = true;
      }
    };

    const onKeyUp = (e) => {
      this.keys.delete(e.code);
    };

    // Mouse buttons: LMB (fire), RMB (ADS toggle)
    const onMouseDown = (e) => {
      if (e.button === 0) {
        this.fire = true;
      }
      if (e.button === 2) {
        e.preventDefault();
        this.ads = !this.ads;
      }
    };

    const onMouseUp = (e) => {
      if (e.button === 0) {
        this.fire = false;
      }
    };

    // PointerLock mouse look
    const onMouseMove = (e) => {
      const isPointerLocked =
        typeof document !== "undefined" &&
        (document.pointerLockElement === this.domElement ||
          document.pointerLockElement === document.body ||
          this.controls?.isLocked);

      if (!isPointerLocked) return;

      const movementX = e.movementX || 0;
      const movementY = e.movementY || 0;

      const sens = this.ads ? this.options.adsSensitivity : this.options.hipSensitivity;
      const yawDelta = -movementX * sens;
      const pitchDelta = -movementY * sens;

      this.pitch = Math.max(
        this.options.pitchMin,
        Math.min(this.options.pitchMax, this.pitch + pitchDelta)
      );

      this.lookDelta.dx += yawDelta;
      this.lookDelta.dy += pitchDelta;
      this.rawMouseDelta.dx += movementX;
      this.rawMouseDelta.dy += movementY;
    };

    // Wheel weapon cycling
    const onWheel = (e) => {
      if (e.deltaY > 0) {
        this.weaponSlot = (this.weaponSlot + 1) % 4;
        this.requestedSlot = "next";
        if (typeof this.options.onWeaponSelect === "function") this.options.onWeaponSelect(this.weaponSlot);
      } else if (e.deltaY < 0) {
        this.weaponSlot = (this.weaponSlot - 1 + 4) % 4;
        this.requestedSlot = "prev";
        if (typeof this.options.onWeaponSelect === "function") this.options.onWeaponSelect(this.weaponSlot);
      }
    };

    const onLockChange = () => {
      this.isLocked =
        typeof document !== "undefined" &&
        (document.pointerLockElement === this.domElement ||
          document.pointerLockElement === document.body);
    };

    this.#addListener(window, "keydown", onKeyDown);
    this.#addListener(window, "keyup", onKeyUp);
    if (this.domElement) {
      this.#addListener(this.domElement, "mousedown", onMouseDown);
      this.#addListener(window, "mouseup", onMouseUp);
      this.#addListener(window, "mousemove", onMouseMove);
      this.#addListener(this.domElement, "wheel", onWheel, { passive: true });
    }
    this.#addListener(document, "pointerlockchange", onLockChange);
    this.#addListener(window, "contextmenu", (e) => e.preventDefault());
  }

  lock() {
    if (this.controls && typeof this.controls.lock === "function") {
      this.controls.lock();
    } else if (this.domElement && typeof this.domElement.requestPointerLock === "function") {
      this.domElement.requestPointerLock();
    }
  }

  unlock() {
    if (this.controls && typeof this.controls.unlock === "function") {
      this.controls.unlock();
    } else if (typeof document !== "undefined" && typeof document.exitPointerLock === "function") {
      document.exitPointerLock();
    }
  }

  update(_delta) {}

  getState() {
    let mx = 0;
    let my = 0;

    if (this.keys.has("KeyD")) mx += 1;
    if (this.keys.has("KeyA")) mx -= 1;
    if (this.keys.has("KeyW")) my += 1;
    if (this.keys.has("KeyS")) my -= 1;

    // Normalize diagonal movement
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }

    const sprint = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && len > 0.01;

    const jump = this.jump;
    this.jump = false;

    const reload = this.reload;
    this.reload = false;

    const look = { dx: this.lookDelta.dx, dy: this.lookDelta.dy };
    this.lookDelta.dx = 0;
    this.lookDelta.dy = 0;

    return {
      move: { x: mx, y: my },
      look,
      fire: this.fire,
      ads: this.ads,
      jump,
      reload,
      sprint,
      weaponSlot: this.weaponSlot,
    };
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    for (const { target, type, handler, options } of this.listeners) {
      if (target && typeof target.removeEventListener === "function") {
        target.removeEventListener(type, handler, options);
      }
    }
    this.listeners = [];
    this.keys.clear();
  }
}

/**
 * Universal Dual-Mode Input Manager.
 * Seamlessly integrates TouchControls and DesktopControls with auto-detection.
 */
export class InputManager {
  /**
   * Supports either (canvas, options) or ({ domElement, controls, onWeaponSelect, ... })
   *
   * @param {HTMLElement|Object} canvasOrOptions
   * @param {Object} options
   */
  constructor(canvasOrOptions = {}, options = {}) {
    let opts = {};
    let domElement = null;

    if (
      canvasOrOptions &&
      typeof canvasOrOptions === "object" &&
      !(typeof Element !== "undefined" && canvasOrOptions instanceof Element)
    ) {
      opts = { ...canvasOrOptions };
      domElement = opts.domElement || null;
    } else {
      domElement = canvasOrOptions;
      opts = { ...options };
    }

    this.domElement =
      domElement || opts.domElement || (typeof document !== "undefined" ? document.body : null);
    this.controls = opts.controls || null;
    this.onWeaponSelect = opts.onWeaponSelect || null;
    this.options = opts;

    // Capability auto-detection
    const caps = detectCapabilities();
    this.isTouch = opts.forceTouch !== undefined ? Boolean(opts.forceTouch) : caps.isTouch;

    // Subsystems
    this.touchControls = new TouchControls(this.domElement, {
      ...opts,
      onWeaponSelect: (slot) => {
        if (typeof this.onWeaponSelect === "function") this.onWeaponSelect(slot);
      },
    });

    this.desktopControls = new DesktopControls(this.domElement, {
      ...opts,
      controls: this.controls,
      onWeaponSelect: (slot) => {
        if (typeof this.onWeaponSelect === "function") this.onWeaponSelect(slot);
      },
    });

    if (this.isTouch) {
      this.touchControls.show();
    } else {
      this.touchControls.hide();
    }
  }

  /**
   * Switches input mode to touch overlay dynamically.
   */
  enableTouch() {
    this.isTouch = true;
    this.touchControls.show();
  }

  /**
   * Switches input mode to desktop PointerLock dynamically.
   */
  enableDesktop() {
    this.isTouch = false;
    this.touchControls.hide();
  }

  /**
   * Fixed frame update for physics / kinetics pipelines.
   * @param {number} delta
   */
  update(delta) {
    this.touchControls.update(delta);
    this.desktopControls.update(delta);
  }

  /**
   * Unified standard interface contract.
   * @returns {{ move: { x: number, y: number }, look: { dx: number, dy: number }, fire: boolean, ads: boolean, jump: boolean, reload: boolean, sprint: boolean, weaponSlot: number }}
   */
  getState() {
    const touchState = this.touchControls.getState();
    const desktopState = this.desktopControls.getState();

    if (this.isTouch) {
      // Prioritize touch, allow desktop keys for hybrid/testing
      const hasDesktopMove = desktopState.move.x !== 0 || desktopState.move.y !== 0;
      const move = hasDesktopMove ? desktopState.move : touchState.move;
      const sprint = touchState.sprint || desktopState.sprint;
      const fire = touchState.fire || desktopState.fire;
      const ads = touchState.ads || desktopState.ads;
      const jump = touchState.jump || desktopState.jump;
      const reload = touchState.reload || desktopState.reload;
      const look = {
        dx: touchState.look.dx + desktopState.look.dx,
        dy: touchState.look.dy + desktopState.look.dy,
      };
      const weaponSlot = touchState.weaponSlot || desktopState.weaponSlot;

      return { move, look, fire, ads, jump, reload, sprint, weaponSlot };
    }

    return desktopState;
  }

  /**
   * Main game loop polling method used by src/main.js.
   *
   * @param {THREE.Camera|null} camera
   * @param {Object|null} kinetics
   * @returns {Object} Polled input frame state
   */
  poll(camera, kinetics = null) {
    const state = this.getState();

    // In Three.js: -Z is camera forward, +X is right
    // state.move.x is right (+1), state.move.y is forward (+1)
    const wish = new THREE.Vector3(state.move.x, 0, -state.move.y);
    const moving = wish.lengthSq() > 0.001;
    if (moving && wish.lengthSq() > 1) {
      wish.normalize();
    }

    // Handle touch camera look rotation
    let yawDelta = 0;
    let pitchDelta = 0;

    if (this.isTouch) {
      yawDelta = state.look.dx;
      pitchDelta = state.look.dy;

      const targetCam = this.controls?.camera || camera;
      if (targetCam) {
        targetCam.rotation.y += yawDelta;
        targetCam.rotation.x = Math.max(
          TOUCH_CONFIG.pitchMin,
          Math.min(TOUCH_CONFIG.pitchMax, targetCam.rotation.x + pitchDelta)
        );
      }

      if (kinetics && typeof kinetics.addSway === "function") {
        kinetics.addSway(
          this.touchControls.pixelLookDelta.dx,
          this.touchControls.pixelLookDelta.dy,
          0.0004
        );
      }
      this.touchControls.pixelLookDelta.dx = 0;
      this.touchControls.pixelLookDelta.dy = 0;
    } else {
      // Desktop camera sway
      if (kinetics && typeof kinetics.addSway === "function") {
        kinetics.addSway(
          this.desktopControls.rawMouseDelta.dx,
          this.desktopControls.rawMouseDelta.dy,
          0.0004
        );
      }
      this.desktopControls.rawMouseDelta.dx = 0;
      this.desktopControls.rawMouseDelta.dy = 0;
    }

    // Slot switching request (number, 'next', 'prev', or null)
    const selectedSlot =
      this.touchControls.requestedSlot !== null
        ? this.touchControls.requestedSlot
        : this.desktopControls.requestedSlot;
    this.touchControls.requestedSlot = null;
    this.desktopControls.requestedSlot = null;

    // Tactical killstreak and night vision triggers
    const killstreakUav = this.touchControls.killstreakUav || this.desktopControls.killstreakUav;
    const killstreakAirstrike =
      this.touchControls.killstreakAirstrike || this.desktopControls.killstreakAirstrike;
    const toggleNightVision =
      this.touchControls.toggleNightVision || this.desktopControls.toggleNightVision;

    this.touchControls.killstreakUav = false;
    this.desktopControls.killstreakUav = false;
    this.touchControls.killstreakAirstrike = false;
    this.desktopControls.killstreakAirstrike = false;
    this.touchControls.toggleNightVision = false;
    this.desktopControls.toggleNightVision = false;

    return {
      moveDir: wish,
      moving,
      sprinting: state.sprint,
      jump: state.jump,
      fire: state.fire,
      ads: state.ads,
      reload: state.reload,
      selectedSlot,
      killstreakUav,
      killstreakAirstrike,
      toggleNightVision,
      isTouch: this.isTouch,
      yawDelta,
      pitchDelta,
    };
  }

  destroy() {
    this.touchControls.destroy();
    this.desktopControls.destroy();
  }
}
