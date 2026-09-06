# Gameplay

## Controls

- `WASD` — move.
- `Shift` — sprint.
- `Space` — jump.
- `LMB` — fire.
- `R` — reload.
- `Esc` — release pointer lock.

## Combat loop

Acquire target → aim → fire → hit feedback → threat response → reposition → reload → repeat.

## Weapon behavior

The carbine uses a finite magazine, reserve ammunition, reload timing and recoil. Misses spawn short-lived tracers/impact particles while hits update score and target state.

## Enemy behavior

Enemies have health and a reactive movement loop. Within threat range they pursue and strafe; at attack cadence they apply player damage. Dead enemies are removed from active simulation.

## Planned combat upgrades

- hit-location damage;
- recoil patterns per weapon;
- ADS/optic state;
- weapon switching;
- cover-aware navigation;
- squad roles and suppression;
- authoritative server hit validation.
