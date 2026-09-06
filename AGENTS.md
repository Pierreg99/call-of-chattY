# Agent Orchestration / Ultracode

## Mission

Improve the vertical slice toward a production-grade first-person shooter while keeping the Three.js implementation deterministic, inspectable and testable.

## Parallel workstreams

Run each workstream independently, then perform an integration pass:

1. **Rendering critic** — lighting, materials, shadow quality, tone mapping, fog, post-processing, temporal stability.
2. **Environment critic** — composition, cover readability, traversal lanes, density, silhouette hierarchy, occlusion.
3. **Weapon critic** — first-person readability, recoil, reload cadence, muzzle response, hit feedback.
4. **Combat/AI critic** — navigation, threat selection, reaction time, target readability, fairness.
5. **Animation/feel critic** — acceleration, camera motion, weapon sway, impact timing.
6. **Audio critic** — weapon layers, footsteps, UI cues, spatialization and dynamic mixing.
7. **Performance critic** — draw calls, triangles, texture memory, frame pacing, device-pixel-ratio scaling.
8. **Accessibility critic** — input rebinding, motion reduction, contrast, readable HUD, reduced flashes.
9. **QA critic** — smoke tests, deterministic repro steps, boundary tests, regression checks.
10. **Security/maintenance critic** — dependency hygiene, asset licensing, unsafe eval/use, CI integrity.

## /loop protocol

For every workstream:

- Inspect the current implementation.
- Identify the single highest-impact deficiency.
- Implement the smallest coherent improvement.
- Run the automated checks.
- Re-review the same criterion from a hostile QA perspective.
- Record remaining gaps.
- Repeat until the criterion is either passing or blocked by missing production assets/tooling.

Never call the project “AAA parity” solely because a visual impression improved. Use measurable evidence.

## “Blind comparison” rule

A true blind comparison against a commercial game requires controlled screenshots/video captured from both systems at the same camera, field of view, exposure and scene intent. Do not fabricate that evidence. When no reference capture is available, compare against the internal visual acceptance rubric in `QUALITY.md`.
