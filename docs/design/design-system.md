# NEXUS PRIVÉ v6.0 Tactical HUD Design System: Call of ChattY

**Standard**: NEXUS PRIVÉ v6.0  
**Project**: Call of ChattY (AAA Call of Duty-Parity FPS)  
**Target Resolution**: Responsive Mobile (390×844) to Desktop UltraWide (3440×1440)  
**Zero-Emoji Protocol**: Strict compliance  

---

## 1. Visual Hierarchy & HUD Architecture

```
┌──────────────────────────────────────────────────────────┐
│ [TOPBAR: COMPASS / TIME / SCORE / TELEMETRY]             │
│                                                          │
│                     ┌──────────┐                         │
│                     │ RETICLE  │                         │
│                     │  + TICK  │                         │
│                     └──────────┘                         │
│                                                          │
│ [DAMAGE VIGNETTE OVERLAY]                                │
│                                                          │
│ [LEFT: VITALS / HEALTH]         [RIGHT: WEAPON / AMMO]   │
│ [MOBILE: JOYSTICK ZONE]         [MOBILE: ACTION CLUSTER] │
└──────────────────────────────────────────────────────────┘
```

### 1.1 Reticle System
- **Hipfire Reticle**: 4-quadrant dynamic crosshair with gap expansion proportional to velocity and continuous fire spread:
  $$\text{gap} = \text{baseGap} + (\text{speed} \cdot 1.8) + (\text{recoil} \cdot 24)$$
- **ADS Reticle**: Dot or holographic crosshair with scope outer vignette and peripheral depth-of-field blur.
- **Hitmarker Subsystem**: Diagonal 4-tick flash upon confirmed projectile/raycast hit (`var(--c-gold-300)`). High-contrast red flash (`var(--c-danger-500)`) on headshot or elimination accompanied by 2.4kHz procedural audio tick.

### 1.2 Mobile Touch Controls Layer
- **Left Virtual Joystick**:
  - Base ring: 130px diameter (`rgba(255,255,255,0.08)` border with frosted glass).
  - Thumb knob: 50px diameter with spring-return centering.
  - Sprint Gate: When pushed beyond 80% radius along +Y axis, activates tactical sprint.
- **Right Look Zone**:
  - Full right-half viewport touch surface for 1:1 camera aim delta tracking.
- **Tactical Action Cluster**:
  - `FIRE` Button: 72×72px prominent button in lower-right quadrant.
  - `ADS` Button: 56×56px toggle button positioned above Fire.
  - `JUMP` & `RELOAD` Buttons: 52×52px ergonomic arc cluster.
  - Minimum touch target >= 44×44px (WCAG 2.5.5).

### 1.3 Color Tokens & Contrast
- **Backgrounds**: Obsidian `#05070a` with backdrop blur (14px).
- **Text & High Contrast Elements**: `#eef5f4` (Contrast ratio 16.2:1 against Obsidian, exceeding WCAG AAA standard).
- **Accents**: Cryo Cyan `#22d3ee` and Amber Gold `#f59e0b`.
