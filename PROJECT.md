# Project: Call-of-ChattY Unified FPS Engine

## Architecture
The Call-of-ChattY Unified FPS Engine synthesizes high-performance subsystems from `futuristic-call-of-shooty`, `call-of-boty`, and `call-of-groky` into a browser-native AAA tactical FPS running seamlessly on mobile touchscreens and desktop web.

```
+-----------------------------------------------------------------------------------+
|                                  src/main.js                                      |
|            (Three.js Scene, Render Loop, Entity Composition, Smoke Tokens)        |
+-------------------+--------------------+--------------------+---------------------+
                    |                    |                    |
       +------------v-----------+        |        +-----------v-----------+
       |   src/systems/input.js |        |        |   src/systems/physics.js
       | - TouchControls        |        |        | - PhysicsWorld (cannon-es)
       | - DesktopControls      |        |        | - CapsuleController (60Hz)
       | - Gesture Suppression  |        |        | - ProjectileTracer
       +------------------------+        |        | - Dynamic Rigid Bodies
                                         |        +-----------------------+
                    +--------------------+--------------------+
                    |                                         |
       +------------v-----------+                +------------v-----------+
       | src/systems/kinetics.js|                | src/systems/weapons.js |
       | - SpringDamper3D       |                | - 4-Weapon Arsenal     |
       | - WeaponAnimator       |                |   (Carbine, Shotgun,   |
       | - Sway, Recoil, ADS    |                |    Sniper, Grenade)    |
       +------------+-----------+                +------------+-----------+
                    |                                         |
                    +--------------------+--------------------+
                                         |
       +---------------------------------v----------------------------------+
       |                       src/systems/audio.js                         |
       | - TacticalAudio: 100% Procedural WebAudio Synth (Zero Audio Files) |
       | - Noise Bursts, Oscillator Sweeps, Spatial Audio Listener, Safe Init|
       +---------------------------------+----------------------------------+
                                         |
       +---------------------------------v----------------------------------+
       |                       src/net/netcode.js                           |
       | - LocalMultiplayerTransport, SnapshotBuffer, ClientPrediction      |
       +--------------------------------------------------------------------+
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F-INP-01 | Universal Capability Detection | Auto-detects touch vs mouse/pointerlock with query param override | M1 | Spec §2.3 |
| F-INP-02 | Left Floating Virtual Joystick | Dynamic thumbstick for WASD locomotion with deadzone and sprint threshold | M1 | shooty:2228 / groky:257 |
| F-INP-03 | Right Touch Look Zone | Drag-to-look touch surface with jitter filter and ADS sensitivity scaling | M1 | shooty:2272 / groky:312 |
| F-INP-04 | Touch Action Buttons | Circular floating action buttons for Fire, ADS, Jump, Reload, Weapon Swap | M1 | groky:43 |
| F-INP-05 | ADS Tap/Hold Hybrid Mode | Tap (<=240ms) toggles ADS; hold (>240ms) enters hold-to-ADS | M1 | groky:187 |
| F-INP-06 | Mobile Gesture Suppression | `touch-action: none` and `{ passive: false }` with `preventDefault()` | M1 | shooty:31,2234 / groky:861 |
| F-INP-07 | Desktop PointerLock & KBM | PointerLock mouse look, WASD, Shift, Space, R, 1-4, Right-Click ADS | M1 | shooty:2364 / chattY:45 |
| F-PHY-01 | cannon-es 60Hz Physics World | Fixed 60Hz timestep simulation with SAPBroadphase, 10 iterations, contact friction | M2 | boty:8 / Spec §2.1 |
| F-PHY-02 | Kinematic Capsule Controller | 80kg capsule cylinder (r=0.42m, h=1.8m), fixed rotation, walk/sprint speeds | M2 | boty:33 / chattY:physics |
| F-PHY-03 | Ground Raycast & Slope Detection | Downward raycast + upward contact normal check (ny > 0.45, <=60 deg slope) | M2 | shooty:835 / boty:57 |
| F-PHY-04 | Rigid Body Grenades & Crates | Dynamic spherical bodies (m=0.4kg, restitution 0.45) with fuse explosion | M2 | Spec §2.1 / boty:materials |
| F-PHY-05 | Ejected Shell Casings | Dynamic brass casing tumbling, floor bounce (restitution -0.25), despawn | M2 | groky:171,306 |
| F-PHY-06 | ProjectileTracer & CCD | Visual raycast tracers with lifetime decay and continuous collision detection | M2 | tests.smoke.mjs / boty:level |
| F-KIN-01 | 2nd-Order SpringDamper3D | Damped harmonic oscillator a = -k(x - x_tgt) - cv with dt clamp <=0.05, vel <=25 | M3 | shooty:842 |
| F-KIN-02 | Weapon Recoil Spring | Kinetic kick impulse and settling oscillation (k=240, c=20, pitch rise -y*3) | M3 | shooty:864,1938 |
| F-KIN-03 | Weapon Sway Spring | Camera look delta lag impulse into sway spring (k=140, c=15, yaw tilt x*2) | M3 | shooty:865,2295 |
| F-KIN-04 | Smooth ADS Positional Glide | Spring-driven sightline glide between hip and ADS coordinates (k=170, c=16) | M3 | shooty:866,2313 |
| F-KIN-05 | Harmonic Head Bobbing | Sinusoidal head bob with footstep audio triggers at trough sin(phi) < -0.88 | M3 | shooty:2483 |
| F-KIN-06 | Non-Linear Trauma Screen-Shake | Quadratic camera shake tau^2 with linear decay rate 1.35/s | M3 | shooty:2501 |
| F-WEP-01 | Assault Carbine (GROKY-16) | 30 mag / 90 reserve, 650 RPM, 28 DMG, 1.65s reload, full-auto | M4 | groky:405 |
| F-WEP-02 | Tactical Shotgun | 8 shells / 32 reserve, 75 RPM, 8 pellets x 14 DMG, wide cone, heavy kick | M4 | Spec §2.2 |
| F-WEP-03 | Precision Sniper Rifle | 5 mag / 20 reserve, 45 RPM, 95/150 DMG, ADS FOV 24 deg, high zoom | M4 | Spec §2.2 |
| F-WEP-04 | Frag / EMP Grenade Ordnance | Thrown trajectory arc, 2.5s fuse timer, 120 DMG splash, blast impulse | M4 | Spec §2.2 |
| F-WEP-05 | Multi-Stage Tactical Reload | 4-phase reload sequence with synchronized mechanical sound cues | M4 | shooty:2531 / groky:550 |
| F-AUD-01 | Safe AudioContext Lifecycle | Starts in suspended state, awakens unconditionally on first touch/click | M4 | groky:15 / shooty:1777 |
| F-AUD-02 | Procedural Gunshot Synth | Layered white noise bursts + exponential pitch sweep oscillators (zero MP3/WAV) | M4 | groky:61,128 |
| F-AUD-03 | Multi-Stage Reload SFX | Distinct procedural frequency ramps for mag-out, mag-in, and bolt-rack | M4 | shooty:1822 / groky:83 |
| F-AUD-04 | Spatial Audio & Supersonic Snap | 3D distance attenuation, stereo panning, near-miss flyby snap sound | M4 | boty:21 / shooty:1860 |
| F-NET-01 | Resilient WebSocket Relay Client | Packet validation, exponential reconnect backoff, RTT telemetry | M5 | chattY:src/net/netcode.js |
| F-NET-02 | SnapshotBuffer & Interpolation | Ring buffer interpolating remote player transforms at t_render - 100ms | M5 | chattY:src/net/netcode.js |
| F-NET-03 | ClientPrediction & Reconciliation | Instant client movement simulation with server sequence ACK reconciliation | M5 | chattY:src/net/netcode.js |
| F-HUD-01 | Responsive Cross-Platform HUD | Dynamic reticle, ammo counter, health bar, weapon indicator, touch SVG overlay | M5 | chattY:main.js / groky:touch |
| F-HUD-02 | Directional Damage Vignette | Perimeter pulse on damage with continuous decay rate, hitmarker expansion | M5 | chattY:main.js / QUALITY.md |
| F-REN-01 | Three.js PBR & Sobel Normals | 3x3 Sobel operator procedural normal map generation with strength S=4.0 | M5 | shooty:1034 |
| F-REN-02 | PMREM HDR Environment | Procedural canvas skyline converted to specular PMREM envMap for reflections | M5 | shooty:1120 |
| F-E2E-01 | Opaque-Box E2E Test Suite | Automated CLI verification across Tiers 1-4 with zero internal mock coupling | M6 | TEST_INFRA.md |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Universal Dual Controls | `src/systems/input.js`: TouchControls (joysticks, buttons, non-passive listeners), DesktopControls (PointerLock, WASD), gesture suppression CSS | none | PLANNED |
| M2 | Rigid Body Physics & Character Controller | `src/systems/physics.js`, `package.json`: cannon-es 60Hz world, capsule controller, slope/grounding, dynamic rigid bodies, ProjectileTracer | none | PLANNED |
| M3 | 2nd-Order Spring Weapon Kinetics | `src/systems/kinetics.js`, `src/systems/animation.js`: SpringDamper3D, recoil, sway, ADS glide, bobbing, trauma shake, WeaponAnimator | none | PLANNED |
| M4 | Multi-Weapon Arsenal & Procedural WebAudio Synth | `src/systems/weapons.js`, `src/systems/audio.js`: 4 weapons (Carbine, Shotgun, Sniper, Grenade), procedural WebAudio synth, zero audio files, autoplay safe init | none | PLANNED |
| M5 | Resilient Netcode, HUD & Engine Integration | `src/systems/renderer.js`, `src/style.css`, `src/main.js`, `index.html`: wire all systems, remote player rendering, Sobel PBR, PMREM HDR, responsive HUD, smoke tokens (CapsuleController, WeaponAnimator, ProjectileTracer, ClientPrediction) | M1, M2, M3, M4 | PLANNED |
| M6 | Final Verification & Adversarial Hardening | E2E Test Suite Pass (Tiers 1-4) + Tier 5 Adversarial Coverage Hardening (`npm run check`, `npm test`, `npm run build`) | M5, TEST_READY | PLANNED |

## Interface Contracts

### `src/systems/input.js`
```javascript
export class InputManager {
  constructor(canvas, options = {})
  update(delta)
  getState() // returns { move: { x, y }, look: { dx, dy }, fire: bool, ads: bool, jump: bool, reload: bool, sprint: bool, weaponSlot: number }
  destroy()
}
```

### `src/systems/physics.js`
```javascript
export class PhysicsWorld {
  constructor(options = {})
  step(delta)
  addBody(body)
  removeBody(body)
  addStaticBox(mesh, size, position)
  raycast(from, to)
}

export class CapsuleController {
  constructor(world, options = {})
  update(delta, inputState, cameraYaw)
  getPosition() // returns { x, y, z }
  isGrounded() // returns boolean
}

export class ProjectileTracer {
  constructor(scene, maxTracers = 64)
  spawn(from, to, color)
  update(delta)
}

export class RigidBodyManager {
  constructor(world, scene)
  spawnGrenade(origin, direction, force = 18)
  update(delta)
}
```

### `src/systems/kinetics.js` & `src/systems/animation.js`
```javascript
export class SpringDamper3D {
  constructor(stiffness = 200, damping = 18)
  update(delta)
  applyImpulse(impulseVector3)
  setTarget(targetVector3)
}

export class WeaponAnimator {
  constructor(options = {})
  triggerRecoil(recoilImpulseVector)
  applyLookSway(deltaX, deltaY)
  setADS(isADS)
  update(delta, isMoving, isSprinting) // updates viewmodel position & rotation
}
```

### `src/systems/weapons.js`
```javascript
export const WEAPON_TYPES = {
  CARBINE: 'carbine',
  SHOTGUN: 'shotgun',
  SNIPER: 'sniper',
  GRENADE: 'grenade'
};

export class WeaponArsenal {
  constructor(audioSystem, physicsWorld, scene)
  selectWeapon(slotIndex)
  fire(origin, direction, isADS)
  reload()
  update(delta)
  getCurrentWeapon() // returns { type, name, mag, reserve, isReloading, isADS }
}
```

### `src/systems/audio.js`
```javascript
export class TacticalAudio {
  constructor()
  ensure() // awaken AudioContext on user interaction
  shot(weaponType, worldPosition = null)
  hitMarker()
  reloadPhase(phaseIndex)
  bulletFlyby(distance)
  shellDrop(worldPosition = null)
  setListener(position, forward, up)
}
```

## Code Layout & Write Ownership
| Module File | Owner Milestone | Description |
|---|---|---|
| `src/systems/input.js` | M1 | Dual touch joysticks, action buttons, PointerLock, gesture suppression |
| `src/systems/physics.js` | M2 | cannon-es 60Hz physics, CapsuleController, ProjectileTracer, rigid bodies |
| `package.json` | M2 | Manifest declaring cannon-es dependency and verify scripts |
| `src/systems/kinetics.js` | M3 | 2nd-order SpringDamper3D, harmonic recoil, sway, ADS spring glide |
| `src/systems/animation.js` | M3 | WeaponAnimator wrapping spring kinetics, camera head bob, trauma shake |
| `src/systems/weapons.js` | M4 | 4-weapon arsenal definitions, firing logic, ammo models, reload states |
| `src/systems/audio.js` | M4 | 100% procedural WebAudio synth, zero audio files, autoplay safe init |
| `src/systems/renderer.js` | M5 | Sobel PBR normal generator, PMREM HDR environment, post-processing |
| `src/style.css` | M5 | Responsive HUD styles, touch joystick styling, damage vignette |
| `src/main.js` | M5 | Main game loop, scene integration, remote player proxy, smoke test tokens |
| `index.html` | M5 | Shell markup for HUD, canvas, touch layer |
| `tests/` | E2E Testing Track | Requirement-driven opaque-box test suite (Tiers 1-4) & test runner |
