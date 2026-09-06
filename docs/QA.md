# QA Matrix

## Automated gates

```bash
npm run check
npm test
npm run build
```

## Functional matrix

| Test | Expected |
|---|---|
| Start game | pointer lock and HUD initialize |
| Move | acceleration/damping feel stable |
| Jump | player returns to ground without tunneling |
| Sprint | stamina changes and speed increases |
| Fire | ammo decreases, recoil and tracer feedback occur |
| Reload | magazine refills only from reserve |
| Enemy death | enemy stops updating/rendering |
| Bounds | player remains inside world |
| Resize | camera aspect and renderer update |
| Network | malformed packets are ignored |
| Reduced motion | visual motion can be reduced |

## /loop review

For every quality pass record: criterion, observed defect, change, automated result, critic verdict and remaining highest-impact gap.

## Visual evidence

Use fixed camera poses, exposure, FOV, resolution and scene seed for comparable screenshots. Do not claim blind commercial parity without synchronized reference captures.
