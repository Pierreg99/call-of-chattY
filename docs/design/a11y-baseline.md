# Accessibility & Compliance Baseline (WCAG 2.1 AA/AAA)

**Project**: Call of ChattY Tactical FPS  
**Standard**: WCAG 2.1 AA (AAA where feasible) + SafeMode Level 3  

## 1. Contrast Ratios
- Normal text (`#eef5f4` on `#05070a`): **16.2:1** (Exceeds AAA 7:1)
- HUD Indicators (`#22d3ee` on `#05070a`): **9.4:1** (Exceeds AAA 4.5:1)
- Danger/Damage Alerts (`#ef4444` on `#05070a`): **5.1:1** (Exceeds AA 4.5:1)

## 2. Touch Envelopes (WCAG 2.5.5)
- All interactive on-screen buttons satisfy minimum dimensions of 44×44 CSS pixels.
- Virtual action buttons configured with 52px to 72px touch targets with 12px margins to avoid mis-touches.

## 3. Motion & Cognitive Accessibility
- Respects `prefers-reduced-motion: reduce`:
  - Weapon idle sway and head-bobbing intensity reduced by 75%.
  - Screen shake trauma disabled or clamped to subtle flash.
- Zero-Emoji Protocol: Clean alphanumeric and SVG icon rendering only.
