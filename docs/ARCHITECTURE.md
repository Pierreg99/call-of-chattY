# Architecture

## Client

`src/main.js` owns the current game scene, camera, weapon, enemies, HUD and render loop.

Supporting systems:

- `src/systems/physics.js` — player controller and projectile tracer lifecycle.
- `src/systems/animation.js` — weapon and enemy procedural motion.
- `src/systems/audio.js` — browser-safe tactical sound synthesis.
- `src/systems/director.js` — waves and scoring rules.
- `src/systems/vfx.js` — visual effects primitives.
- `src/net/netcode.js` — protocol constants, snapshot buffering, prediction and WebSocket transport.
- `src/aaa-runtime.js` — runtime integration for audio, network state and reduced-motion preferences.

## Server

`server/netcode.mjs` provides the WebSocket relay and periodic snapshots. The protocol is versioned and inputs are validated before being applied.

## Rendering pipeline

Scene → `RenderPass` → `UnrealBloomPass` → display.

The baseline uses `WebGLRenderer`, ACES filmic tone mapping, soft shadows, atmospheric sky/fog and constrained device pixel ratio.

## Design principles

- Keep systems small and inspectable.
- Prefer deterministic state transitions over hidden global side effects.
- Reject malformed network input early.
- Keep external/proprietary assets out of the repository.
- Treat QA criteria as executable gates where practical.
