import * as THREE from "three";

/**
 * Universal Dual-Mode Input Controller.
 * Sourced from futuristic-call-of-shooty & call-of-groky.
 * Automatically adapts between Mobile Touch (floating joystick + action buttons)
 * and Desktop Web (PointerLock + KBM).
 */
export class InputManager {
  constructor({ domElement = document.body, controls = null, onWeaponSelect = null } = {}) {
    this.domElement = domElement;
    this.controls = controls;
    this.onWeaponSelect = onWeaponSelect;

    this.isTouch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window ||
        navigator.maxTouchPoints > 0 ||
        window.matchMedia?.("(pointer: coarse)")?.matches);

    this.keys = new Set();
    this.fireHeld = false;
    this.jumpTriggered = false;
    this.reloadTriggered = false;
    this.adsToggled = false;
    this.requestedSlot = null;

    // Mobile touch tracking
    this.touchMove = { x: 0, y: 0 };
    this.joyTouchId = null;
    this.joyCenter = { x: 0, y: 0 };
    this.lookTouchId = null;
    this.lastLook = { x: 0, y: 0 };
    this.touchLookDelta = { x: 0, y: 0 };
    this.touchSprint = false;

    this.mouseSensitivity = 0.0022;
    this.touchSensitivity = 0.004;

    this.#initDesktopListeners();
    if (this.isTouch) {
      this.#initTouchListeners();
    }
  }

  #initDesktopListeners() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "Space") {
        e.preventDefault();
        this.jumpTriggered = true;
      }
      if (e.code === "KeyR") this.reloadTriggered = true;
      if (e.code === "Digit1") this.requestedSlot = 0;
      if (e.code === "Digit2") this.requestedSlot = 1;
      if (e.code === "Digit3") this.requestedSlot = 2;
      if (e.code === "Digit4") this.requestedSlot = 3;
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });

    this.domElement.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.fireHeld = true;
      if (e.button === 2) {
        e.preventDefault();
        this.adsToggled = !this.adsToggled;
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.fireHeld = false;
    });

    window.addEventListener("wheel", (e) => {
      if (e.deltaY > 0) this.requestedSlot = "next";
      else if (e.deltaY < 0) this.requestedSlot = "prev";
    }, { passive: true });

    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  #initTouchListeners() {
    const layer = document.getElementById("touch-controls-layer");
    if (layer) layer.style.display = "block";

    const joyZone = document.getElementById("joystick-zone");
    const joyThumb = document.getElementById("joystick-thumb");

    if (joyZone) {
      joyZone.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          const t = e.changedTouches[0];
          this.joyTouchId = t.identifier;
          const rect = joyZone.getBoundingClientRect();
          this.joyCenter = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        },
        { passive: false }
      );

      window.addEventListener(
        "touchmove",
        (e) => {
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === this.joyTouchId && joyZone) {
              e.preventDefault();
              const dx = t.clientX - this.joyCenter.x;
              const dy = t.clientY - this.joyCenter.y;
              const dist = Math.hypot(dx, dy);
              const maxR = joyZone.offsetWidth / 2;

              const clampedDist = Math.min(dist, maxR);
              const normX = dist > 0 ? (dx / dist) * clampedDist : 0;
              const normY = dist > 0 ? (dy / dist) * clampedDist : 0;

              if (joyThumb) {
                joyThumb.style.transform = `translate(${normX}px, ${normY}px)`;
              }

              this.touchMove.x = normX / maxR;
              this.touchMove.y = -normY / maxR;
              // Push past 80% to engage sprint automatically on mobile
              this.touchSprint = dist > maxR * 0.8;
            } else if (t.identifier === this.lookTouchId) {
              e.preventDefault();
              const ldx = t.clientX - this.lastLook.x;
              const ldy = t.clientY - this.lastLook.y;
              this.lastLook.x = t.clientX;
              this.lastLook.y = t.clientY;
              this.touchLookDelta.x += ldx;
              this.touchLookDelta.y += ldy;
            }
          }
        },
        { passive: false }
      );

      const resetJoy = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.joyTouchId) {
            this.joyTouchId = null;
            this.touchMove.x = 0;
            this.touchMove.y = 0;
            this.touchSprint = false;
            if (joyThumb) joyThumb.style.transform = "translate(0px, 0px)";
          }
        }
      };
      joyZone.addEventListener("touchend", resetJoy, { passive: false });
      joyZone.addEventListener("touchcancel", resetJoy, { passive: false });
    }

    const lookZone = document.getElementById("touch-look-zone");
    if (lookZone) {
      lookZone.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          const t = e.changedTouches[0];
          this.lookTouchId = t.identifier;
          this.lastLook.x = t.clientX;
          this.lastLook.y = t.clientY;
        },
        { passive: false }
      );

      const resetLook = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.lookTouchId) {
            this.lookTouchId = null;
          }
        }
      };
      lookZone.addEventListener("touchend", resetLook, { passive: false });
      lookZone.addEventListener("touchcancel", resetLook, { passive: false });
    }

    // Touch Action Buttons
    this.#bindTouchBtn("touch-btn-fire", (down) => {
      this.fireHeld = down;
    });
    this.#bindTouchBtn("touch-btn-ads", (down) => {
      if (down) this.adsToggled = !this.adsToggled;
    });
    this.#bindTouchBtn("touch-btn-jump", (down) => {
      if (down) this.jumpTriggered = true;
    });
    this.#bindTouchBtn("touch-btn-reload", (down) => {
      if (down) this.reloadTriggered = true;
    });
    this.#bindTouchBtn("touch-btn-sprint", (down) => {
      if (down) this.touchSprint = !this.touchSprint;
    });
    this.#bindTouchBtn("touch-btn-swap", (down) => {
      if (down) this.requestedSlot = "next";
    });
  }

  #bindTouchBtn(id, callback) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        callback(true);
        el.classList.add("active");
      },
      { passive: false }
    );
    el.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        callback(false);
        el.classList.remove("active");
      },
      { passive: false }
    );
  }

  poll(camera, kinetics = null) {
    // Movement calculation
    let mx = 0;
    let mz = 0;

    if (this.keys.has("KeyD")) mx += 1;
    if (this.keys.has("KeyA")) mx -= 1;
    if (this.keys.has("KeyS")) mz += 1;
    if (this.keys.has("KeyW")) mz -= 1;

    if (this.touchMove.x !== 0 || this.touchMove.y !== 0) {
      mx = this.touchMove.x;
      mz = -this.touchMove.y;
    }

    const wish = new THREE.Vector3(mx, 0, mz);
    const moving = wish.lengthSq() > 0.01;
    if (moving && wish.lengthSq() > 1) wish.normalize();

    const keyboardSprint =
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const sprinting = moving && (keyboardSprint || this.touchSprint);

    // Camera rotation from touch look zone
    let yawDelta = 0;
    let pitchDelta = 0;
    if (this.touchLookDelta.x !== 0 || this.touchLookDelta.y !== 0) {
      yawDelta = -this.touchLookDelta.x * this.touchSensitivity;
      pitchDelta = -this.touchLookDelta.y * this.touchSensitivity;

      if (this.controls?.camera) {
        this.controls.camera.rotation.y += yawDelta;
        this.controls.camera.rotation.x = THREE.MathUtils.clamp(
          this.controls.camera.rotation.x + pitchDelta,
          -1.45,
          1.45
        );
      }
      if (kinetics) {
        kinetics.addSway(this.touchLookDelta.x, this.touchLookDelta.y, 0.0004);
      }

      this.touchLookDelta.x = 0;
      this.touchLookDelta.y = 0;
    }

    // Capture one-shot states
    const jump = this.jumpTriggered;
    this.jumpTriggered = false;

    const reload = this.reloadTriggered;
    this.reloadTriggered = false;

    const slot = this.requestedSlot;
    this.requestedSlot = null;

    return {
      moveDir: wish,
      moving,
      sprinting,
      jump,
      fire: this.fireHeld,
      ads: this.adsToggled,
      reload,
      selectedSlot: slot,
      isTouch: this.isTouch,
      yawDelta,
      pitchDelta,
    };
  }
}
