# Release Checklist

## Pre-release

- `npm run check` passes.
- `npm test` passes.
- `npm run build` passes.
- README and changelog updated.
- No proprietary assets committed.
- No secrets committed.
- Production host configured.
- Multiplayer endpoint configured separately when enabled.

## Release candidate

Tag the validated commit, publish the static build, smoke test the public URL, and record the deployed commit SHA.

## Rollback

Redeploy the previous validated commit, verify startup and combat, then document the reason and corrective action.
