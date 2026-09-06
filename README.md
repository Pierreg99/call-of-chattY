# call-of-chattY

A Three.js first-person tactical sandbox engineered as an extensible AAA-style vertical slice.

## Current vertical slice

- First-person pointer-lock controls with acceleration, sprint stamina, jumping and boundary clamping.
- Hitscan 5.56-style carbine with recoil, reload timing, reserve ammo, hit feedback and procedural weapon geometry.
- Procedural combat space with layered cover, towers, runway markings, industrial silhouettes, physical materials, shadow casting and fog.
- Reactive combatants with simple pursuit/strafe behavior, health, damage, death state and impact particles.
- Cinematic rendering baseline: ACES tone mapping, soft shadows, atmospheric sky/fog, bloom and high-performance WebGL rendering.
- Procedural texture generation with CanvasTexture, avoiding external art dependencies.
- Performance HUD exposing FPS, draw calls, triangle count, enemy count, shots and hits.
- A built-in QA architecture is documented in `QUALITY.md`; the repository is structured so future agent passes can be run independently.

## Run

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

## Controls

`WASD` move · `Shift` sprint · `Space` jump · `LMB` fire · `R` reload · `Esc` release mouse.

## Rendering note

The project targets Three.js `0.185.1`. The current Three.js documentation describes `WebGPURenderer` as the modern renderer with a WebGL 2 fallback; this slice intentionally uses `WebGLRenderer` first because the post-processing stack here relies on `EffectComposer`/`UnrealBloomPass` and keeps the baseline broadly compatible.

## Scope boundary

This is a playable technical foundation, not a claim of parity with a shipped Call of Duty title. AAA parity requires original high-resolution authored assets, mocap/animation systems, advanced audio, networked gameplay, production-level level design, extensive QA and substantial engineering/production resources.
