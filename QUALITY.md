# AAA Quality Gate

This is the hard-critic checklist for iterative review. A feature is not “done” because it exists.

## Gate A — Visual

Score each category 0–5:

| Category | 0 | 3 | 5 |
|---|---|---|---|
| Composition | placeholder | readable | deliberate focal hierarchy |
| Materials | flat | physically plausible | varied micro/detail response |
| Lighting | basic | intentional | cinematic key/fill/rim with stable shadows |
| Environment | empty | populated | layered, authored-feeling density |
| VFX | absent | reactive | timed, restrained, readable |
| HUD | default | clean | cohesive, readable, information-efficient |

Passing target: no category below 4; mean >= 4.5.

## Gate B — Feel

- Movement response has no obvious acceleration hitch.
- Camera and weapon motion support firing without obscuring targets.
- Hits produce instant, spatially consistent feedback.
- Reloads have predictable timings.
- Enemy reactions remain readable at combat distance.

## Gate C — Performance

Collect measurements at a representative combat scene:

- FPS and frame-time stability.
- renderer draw calls and triangle count.
- pixel-ratio scaling on high-DPI screens.
- shadow-map cost.
- particle lifetime/cleanup.
- scene object count.

Do not optimize solely for peak FPS; prioritize frame pacing.

## Gate D — Robustness

- Resize without camera distortion.
- Pointer lock can be released and reacquired.
- Empty ammo cannot produce negative reserve.
- Reload cannot overfill magazine.
- Dead enemies stop updating and rendering.
- Player stays inside world bounds.
- Background tab pauses simulation safely.

## Gate E — Evidence

For each /loop pass, preserve:

1. criterion reviewed;
2. defect found;
3. change made;
4. automated checks;
5. critic verdict;
6. next highest-impact gap.

A commercial-game comparison is only valid when a synchronized reference capture is available.
