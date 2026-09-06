# Multiplayer

## Current protocol

Protocol version: `1`.

Core messages:

- `welcome`
- `player_join`
- `player_leave`
- `input`
- `fire`
- `snapshot`

## Client model

`SnapshotBuffer` stores recent snapshots for interpolation. `ClientPrediction` sequences local inputs and removes acknowledged entries. `LocalMultiplayerTransport` provides WebSocket connectivity.

## Server model

The relay maintains player transforms and emits snapshots at a fixed 20 Hz cadence. Current validation rejects malformed JSON, unsupported protocol versions, oversized payloads and invalid numeric ranges.

## Production gap

The current relay is not a complete authoritative game server. A production service needs authoritative movement, hit validation, lag compensation, rate limiting, matchmaking, authentication, persistence, metrics and abuse mitigation.
