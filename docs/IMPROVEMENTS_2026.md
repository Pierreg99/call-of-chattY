# Deep Research Improvements — 2026-09-06

## Implemented in 0.3.1

### Runtime performance telemetry

`src/systems/performance.js` now measures rolling frame time, p95 frame time, dropped-frame ratio, Long Tasks and optional Chromium JS heap usage. The runtime exposes the telemetry through `window.chattYRuntime.perf` and mirrors status into `data-*` attributes for diagnostics.

This follows the Three.js guidance to use `renderer.info` for render diagnostics and to explicitly dispose GPU resources when lifetimes end. The current telemetry is renderer-agnostic so it can ship safely before renderer ownership is centralized.

### Network resilience and validation

The browser transport now:

- rejects oversized/non-string packets;
- validates protocol version and packet type;
- supports multiple listeners per event with unsubscribe functions;
- reconnects with bounded exponential backoff;
- measures round-trip time with protocol-level ping/pong;
- closes cleanly on `pagehide`.

The relay now adds:

- 24-player room capacity;
- per-connection message rate limiting;
- fire-event cooldown enforcement;
- sequence-gap rejection;
- WebSocket heartbeat/termination;
- graceful SIGINT/SIGTERM shutdown.

These are hardening layers, not authoritative anti-cheat. Full competitive networking still requires authenticated sessions, server-authoritative gameplay, lag compensation, replay/audit tooling and abuse detection.

### QA gate

The smoke test now verifies the telemetry and networking hardening tokens, and `npm run check` syntax-checks the new module.

## Research basis

- Three.js manual: resource disposal and GPU memory lifetime management.
- Three.js renderer info: draw/render/memory diagnostics.
- MDN: OffscreenCanvas is broadly available and can move canvas work into a Worker, but it is a later-stage optimization because this project still couples rendering and DOM HUD work.
- `cannon-es` remains at 0.20.0 upstream; no speculative dependency bump is made here.

## Next highest-impact work

1. Split simulation, rendering and HUD ownership so renderer diagnostics can be tied directly to `renderer.info` and adaptive quality.
2. Add authoritative server reconciliation with lag compensation and snapshot interpolation tests.
3. Replace procedural scene duplication with shared geometry/material pools and explicit disposal at level transitions.
4. Add browser E2E coverage for pointer lock, touch controls, reload, death/redeploy and multiplayer reconnect.
