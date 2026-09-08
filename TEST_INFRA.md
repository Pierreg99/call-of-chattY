# E2E Test Infra: Call-of-ChattY Unified FPS Engine

## Test Philosophy
- **Opaque-Box & Requirement-Driven**: Tests derive strictly from `ORIGINAL_REQUEST.md` and user specifications, evaluating external inputs and observable outcomes without mocking internal system logic.
- **Progressive Verification**: Tests execute against pure ES module exports and runtime contracts using standard Node.js test runners with zero external test framework bloat.
- **Zero Asset Dependency**: Asserts that audio, materials, physics, and gameplay run 100% procedurally with zero external WAV/MP3/binary asset requirements.

## Feature Inventory & Test Coverage Mapping
| # | Feature | Requirement | Tier 1 (Unit/Feature >=5) | Tier 2 (Boundary >=5) | Tier 3 (Pairwise) |
|---|---------|-------------|:-------------------------:|:---------------------:|:-----------------:|
| F-INP-01 | Universal Capability Detection | R1 | 5 tests | 5 tests | ✓ |
| F-INP-02 | Virtual Floating Joystick | R1 | 5 tests | 5 tests | ✓ |
| F-INP-03 | Right Touch Look Zone | R1 | 5 tests | 5 tests | ✓ |
| F-INP-04 | Touch Action Buttons | R1 | 5 tests | 5 tests | ✓ |
| F-INP-06 | Non-Passive Touch Suppression | R1 | 5 tests | 5 tests | ✓ |
| F-INP-07 | Desktop PointerLock & KBM | R1 | 5 tests | 5 tests | ✓ |
| F-PHY-01 | cannon-es 60Hz Physics World | R2 | 5 tests | 5 tests | ✓ |
| F-PHY-02 | Kinematic Capsule Controller | R2 | 5 tests | 5 tests | ✓ |
| F-PHY-03 | Ground Raycast & Slope Detection | R2 | 5 tests | 5 tests | ✓ |
| F-PHY-04 | Rigid Body Grenades & Crates | R2 | 5 tests | 5 tests | ✓ |
| F-KIN-01 | 2nd-Order SpringDamper3D | R3 | 5 tests | 5 tests | ✓ |
| F-KIN-02 | Spring Recoil Kinetics | R3 | 5 tests | 5 tests | ✓ |
| F-KIN-03 | Spring Look Sway | R3 | 5 tests | 5 tests | ✓ |
| F-KIN-04 | ADS Positional Glide | R3 | 5 tests | 5 tests | ✓ |
| F-WEP-01 | Assault Carbine Mechanics | R4 | 5 tests | 5 tests | ✓ |
| F-WEP-02 | Tactical Shotgun Multi-Pellet | R4 | 5 tests | 5 tests | ✓ |
| F-WEP-03 | Precision Bolt-Action Sniper | R4 | 5 tests | 5 tests | ✓ |
| F-WEP-04 | Frag / EMP Grenade Ordnance | R4 | 5 tests | 5 tests | ✓ |
| F-AUD-01 | Safe AudioContext Lifecycle | R4 | 5 tests | 5 tests | ✓ |
| F-AUD-02 | Procedural Gunshot Synthesis | R4 | 5 tests | 5 tests | ✓ |
| F-AUD-04 | Spatial Audio & Supersonic Snap | R4 | 5 tests | 5 tests | ✓ |
| F-NET-01 | Netcode Packet & Reconnect | R5 | 5 tests | 5 tests | ✓ |
| F-NET-02 | SnapshotBuffer Interpolation | R5 | 5 tests | 5 tests | ✓ |
| F-NET-03 | ClientPrediction & Recon | R5 | 5 tests | 5 tests | ✓ |

## Test Architecture
- **Location**: `/data/data/com.termux/files/home/storage/downloads/projects/call-of-chattY/tests/`
- **Runner**: `node tests/e2e-runner.mjs`
- **Exit Semantics**: Code 0 on all tests passing; non-zero with detailed failure assertion and stack trace.
- **Suite Files**:
  - `tests/tier1-feature-coverage.test.mjs`: Tests each feature in isolation (>=120 test cases).
  - `tests/tier2-boundaries-corners.test.mjs`: Tests limits, zero/negative inputs, large delta times, NaN guards (>=120 test cases).
  - `tests/tier3-cross-combinations.test.mjs`: Tests pairwise cross-feature interactions (movement + sprint + ADS + fire + reload + physics tick).
  - `tests/tier4-application-scenarios.test.mjs`: Realistic multi-step end-to-end combat scenarios.
- **Smoke Compatibility**: Integrates with existing root `tests.smoke.mjs` so `npm test` runs both smoke checks and the full E2E test suite.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Mobile Touch Sprint-Slide-ADS Shot | F-INP-02, F-INP-05, F-KIN-04, F-WEP-01, F-AUD-02 | High |
| 2 | High-Speed Grenade Bounce & Blast Wave | F-PHY-01, F-PHY-04, F-KIN-06, F-AUD-02, F-HUD-02 | High |
| 3 | Close-Quarters Shotgun Blast & Shell Ejection | F-WEP-02, F-PHY-05, F-KIN-02, F-AUD-02, F-HUD-02 | Medium |
| 4 | Sniper Telephoto ADS & Recoil Recovery | F-WEP-03, F-KIN-02, F-KIN-04, F-INP-07, F-AUD-02 | High |
| 5 | Network Desync Recovery & Prediction Reconciliation | F-NET-01, F-NET-02, F-NET-03, F-PHY-02 | High |
| 6 | 60Hz Physics Stress Under Multi-Crate Collisions | F-PHY-01, F-PHY-02, F-PHY-06, F-INP-02 | High |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: >= 120 tests (covering all 24 core capabilities with >= 5 cases each)
- **Tier 2 (Boundary & Corner Cases)**: >= 120 tests (testing delta spikes, deadzone limits, ammo bounds, zero reserves, numerical stability)
- **Tier 3 (Cross-Feature Combinations)**: >= 25 pairwise integration tests
- **Tier 4 (Real-World Scenarios)**: >= 6 realistic multi-step tactical FPS battle scenarios
- **Total Minimum Test Count**: >= 271 automated assertions
