# Changelog

All notable project changes are recorded here.

## 0.3.1 — 2026-09-06

### Added

- Frame-pacing telemetry with p95 frame time, dropped-frame ratio, Long Tasks and optional heap usage.
- Client WebSocket packet validation, bounded reconnect and RTT measurement.
- Server capacity limits, message rate limiting, fire throttling and connection heartbeat.
- Graceful relay shutdown and stronger smoke-test coverage.
- Deep-research engineering report with prioritized next gaps.

### Changed

- Runtime now exposes performance telemetry through `window.chattYRuntime.perf`.
- Runtime closes telemetry and networking cleanly on `pagehide`.
- Project documentation now records the distinction between prototype hardening and production-grade authoritative networking.

## 0.3.0 — 2026-09-06

### Added

- AAA-oriented agent/critic orchestration documentation.
- Physics and procedural animation systems.
- Procedural tactical audio system.
- Combat director and VFX primitives.
- Runtime integration layer with reduced-motion detection.
- Snapshot/prediction networking primitives.
- WebSocket multiplayer relay with input validation and fixed-rate snapshots.
- Expanded smoke-test coverage and CI quality gate.
- Documentation foundation and release/QA process.

### Changed

- README now documents scope, asset policy and quality methodology.
- Package scripts now cover client checks, tests and relay startup.

## 0.2.0 — 2026-09-06

### Added

- Capsule movement controller.
- Weapon/enemy animation module.
- Multiplayer protocol foundation.
- WebSocket relay.
- Extended smoke tests.

## 0.1.0 — 2026-09-06

### Added

- Initial Three.js FPS vertical slice.
- Procedural combat environment.
- Hitscan weapon and reactive enemies.
- Cinematic rendering baseline.
- HUD and performance diagnostics.
