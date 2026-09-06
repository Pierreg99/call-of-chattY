# Product Plan

## North star

Build a polished, browser-native tactical FPS vertical slice in Three.js with responsive combat, cinematic presentation and an extensible multiplayer foundation.

## Milestones

| Phase | Scope | Exit gate | Status |
|---|---|---|---|
| 0 | Repository + build | `npm run check`, smoke test | Done |
| 1 | FPS core | pointer lock, movement, weapon, enemies | Done |
| 2 | Visual baseline | sky, fog, materials, shadows, bloom, HUD | Done |
| 3 | Systems pass | physics, animation, audio, VFX, director | Done |
| 4 | Multiplayer foundation | protocol, prediction primitives, relay | Done |
| 5 | Hardening | payload validation, bounds, sequencing, CI | In progress |
| 6 | Authored content | original models, textures, animations, audio | Planned |
| 7 | Advanced combat | navmesh, cover selection, squads, weapon handling | Planned |
| 8 | Production multiplayer | authoritative hit validation, lobbies, persistence, anti-cheat | Planned |
| 9 | Device optimization | mobile/desktop profiles, frame pacing, memory budgets | Planned |
| 10 | Release | automated deployment, observability, release candidate | Planned |

## Next highest-impact work

1. Replace procedural placeholders with licensed/original production assets.
2. Upgrade collision from boundary-only movement to environment-aware character physics.
3. Replace simple enemy steering with navigation, cover and squad tactics.
4. Move damage/hit validation to an authoritative server model.
5. Add visual regression captures and fixed benchmark scenes.
