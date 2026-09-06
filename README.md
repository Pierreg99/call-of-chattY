# call-of-chattY

A Three.js first-person tactical FPS vertical slice with a modular AAA-oriented architecture.

## Systems

- First-person pointer-lock movement, sprint stamina, jump and bounds.
- Procedural environment, layered cover, industrial silhouettes, soft shadows, atmospheric sky/fog and bloom.
- Hitscan carbine, recoil, reload timing, tracers, particles and hit feedback.
- Reactive AI combatants plus a combat director/scoring layer.
- Procedural weapon/enemy animation.
- Procedural Web Audio tactical feedback with browser-safe initialization.
- Client snapshot/prediction primitives and an optional WebSocket multiplayer relay.
- Resilient multiplayer transport with packet validation, bounded reconnects, RTT measurement and clean page shutdown.
- Runtime performance telemetry for frame pacing, p95 frame time, dropped-frame ratio, Long Tasks and optional heap data.
- Automated smoke checks and GitHub Actions quality gate.

## Run

```bash
npm install
npm run dev
```

For the relay server:

```bash
npm run server
```

Quality:

```bash
npm run check
npm test
npm run build
```

## Controls

`WASD` move · `Shift` sprint · `Space` jump · `LMB` fire · `R` reload · `Esc` release mouse.

## Multiplayer hardening

The client rejects malformed or oversized packets and reconnects with bounded exponential backoff. The relay limits room size and message rate, validates input ranges and sequence progression, throttles fire events, removes dead connections with heartbeat checks, and shuts down cleanly on process termination.

This is a prototype hardening layer, not a finished competitive anti-cheat or authoritative netcode implementation.

## Performance diagnostics

Open the browser console and inspect `window.chattYRuntime.perf` for rolling frame-pacing data and `window.chattYRuntime.net.rttMs` for the latest transport round-trip measurement. DOM diagnostics are also mirrored into `#debug` `data-*` attributes.

See [`docs/IMPROVEMENTS_2026.md`](docs/IMPROVEMENTS_2026.md) for the research basis and next engineering priorities.

## Asset policy

The repository uses procedural/engine-native content and does not bundle proprietary Call of Duty assets. Shipped AAA parity would additionally require original authored assets, mocap, advanced audio, full level production, authoritative networking and extensive device testing.

## Quality / agent loop

`AGENTS.md` defines independent rendering, environment, weapon, AI, animation, audio, performance, accessibility, QA and maintenance critics. `QUALITY.md` defines evidence-based acceptance criteria and explicitly disallows fabricated blind-comparison results.
