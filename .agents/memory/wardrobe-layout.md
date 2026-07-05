---
name: Wardrobe image layout strategy
description: How the closet background image is sized and overlays are positioned on the wardrobe page
---

## Current image

`/closet-bg.jpg` — 853×1713 JPEG (the designer-provided closet reference).
The old `closet-bg.png` (853×1844) is no longer used.

## Sizing strategy

`object-fit: CONTAIN` — the image is never cropped; the full closet is always visible.

`useImageRect` uses contain math:
- Image ratio (853/1713 ≈ 0.498) < any iPhone width/height ratio → container is always WIDER → image fills container HEIGHT with small side letterboxing.
- iPhone 390 → rW ≈ 375 px, rL ≈ 7.5 px (nearly edge-to-edge)
- iPhone SE  → rW ≈ 287 px, rL ≈ 44 px (noticeable side letterbox)
- iPhone Pro Max 430 → rW ≈ 419 px, rL ≈ 5.5 px

Container background: `#F0C238` (matches yellow door colour visible in letterbox area).

## Overlay philosophy

The JPEG already has all visual UI baked in (section labels, "+ ADD" buttons, rods, SAVE OUTFIT bar, chevrons). HTML provides only:
- **Transparent tap zones** over the baked-in buttons (no visible HTML buttons)
- **SwipeRow** (cream `rgba(252,245,233,0.94)` background) rendered on top of placeholder cards **only when items exist**
- **Empty state**: image's own placeholder card graphics show through — no SwipeRow rendered

## Landmark fractions (853×1713 image, fractions 0→1)

```
doorL:   0.123   // inner left edge
doorR:   0.877   // inner right edge

rows[0]: { btnCY: 0.304, carY: 0.324, carBot: 0.473 }  // TOPS
rows[1]: { btnCY: 0.504, carY: 0.524, carBot: 0.668 }  // BOTTOMS
rows[2]: { btnCY: 0.697, carY: 0.717, carBot: 0.862 }  // SHOES

barY:     0.887   // top of SAVE OUTFIT bar
barBot:   0.958
hangerCX: 0.152
saveBtnL: 0.235
saveBtnR: 0.768
manneCX:  0.847
```

## Bottom bar

The image's SAVE OUTFIT bar is fully visible at the bottom of the contain-scaled image (bar top at 887% = ~669px, container ~754px). No HTML bar background needed. Only transparent tap zones overlay it.

Save-outfit name input popup appears ABOVE the bar via `bottom: calc(100% - <barY_px> + 8px)`.

**Why contain over cover:** user explicitly requested "without cropping" and "full closet visible". The image's near-2:1 aspect ratio means only small side letterboxing on modern iPhones.
