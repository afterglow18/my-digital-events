---
name: Wardrobe layout strategy
description: Background image sizing, landmark fractions, ClosetRow contract, and hanger overlay technique for the My Digital Closet app.
---

## Background image

**Current file:** `artifacts/outfit-generator/public/closet-bg.png`
**Dimensions:** 1023×1537 px (aspect ratio 0.6657 — wider than tall relative to portrait phones)

**Rendering:** `object-fit: contain` inside `min(calc(100dvh - 90px), calc(100vw * 1.5025))`.
- On portrait phones (e.g. 390×844): image fills width (390×586 px), container exactly matches → no letterbox.
- On wide screens: image fills height with small side letterbox.
- Container background `#F0C030` (door yellow) blends with the yellow doors.
- `useImageRect`: if `cR > iR` → fill height, side letterbox (`rT=0`); else → fill width, `rT=0` (image anchored to top).

## Landmark fractions (1023×1537 image)

All fractions are of the **image's own width/height**, applied via `pX/pY/pW/pH` helpers in `wardrobe.tsx`.

```
doorL: 0.127  (x≈130)
doorR: 0.865  (x≈885)

rows[0] TOPS:
  btnCY:     0.202   rod centre y≈310
  boxY:      0.217   hanger overlay top — just below rod (y≈333)
  boxBot:    0.558   ClosetRow bottom — before BOTTOMS rod (y≈857)
  hangerTop: 0.217   hanger overlay top = boxY
  hangerBot: 0.393   photo area top — below centre hanger arms (y≈604)

rows[1] BOTTOMS:
  btnCY:     0.567   rod y≈871
  boxY:      0.576   hanger overlay top (y≈885)
  boxBot:    0.773   ClosetRow bottom — before SHOES rod (y≈1188)
  hangerTop: 0.576
  hangerBot: 0.632   photo area top — below BOTTOMS hanger arms (y≈971)

rows[2] SHOES:
  btnCY:     0.781   rod y≈1200
  boxY:      0.790   photo area top — below SHOES rod (y≈1214)
  boxBot:    0.896   photo area bottom — above SAVE bar (y≈1377)
  hangerTop: 0.790   (not used — no shoe hanger overlay)
  hangerBot: 0.800   (not used)

barY:     0.898
barBot:   0.973
hangerCX: 0.140
saveBtnL: 0.228
saveBtnR: 0.772
manneCX:  0.860
```

## ClosetRow photo positioning

**TOPS / BOTTOMS** — photos start at `lm.hangerBot` (below hanger arms):
- carTop = pY(ir, lm.hangerBot), carH = pH(ir, lm.boxBot - lm.hangerBot)
- Visible photo heights at 390px: TOPS≈97px, BOTTOMS≈83px
- Card is 3:4 (96×128px); bottom ~31–45px clips at container edge (acceptable)

**SHOES** — photos sit on the shelf (no hangers):
- carTop = pY(ir, lm.boxY), carH = pH(ir, lm.boxBot - lm.boxY)
- Visible height ≈62px; same card width as other rows

## ClosetRow card spec

- **Size:** `cardW = slotW`, `cardH = slotW * 4/3` (strict 3:4 portrait)
- **Image:** `objectFit: cover`, `objectPosition: center`
- **Selection indicator:** pink center hanger baked into the background image — NO border or shadow on the card itself, ever
- `isCenter` still drives `aria-pressed` and cursor, but no visual styling

## Hanger overlay technique (z=20)

Gold/pink hangers are baked into the background image. To keep them above clothing photos, each TOPS/BOTTOMS row renders a second `<div>` at z=20 re-drawing the background-image crop. SHOES row skips the overlay entirely (`!isShoes`).

```
backgroundImage:    url('/closet-bg.png')
backgroundSize:     `${ir.width}px ${ir.height}px`
backgroundPosition: `${-pW(ir, LM.doorL)}px ${-pH(ir, lm.hangerTop)}px`
backgroundRepeat:   no-repeat
pointerEvents:      none
```

**Why it works:** The div's CSS origin is at `(pX(ir, doorL), pY(ir, hangerTop))`.
Applying `backgroundPosition = (-pW(doorL), -pH(hangerTop))` shifts the background so its
apparent origin lands at `(ir.left, ir.top)` — matching the main `<img>` layer pixel-for-pixel.

## carRight formula

`right: ir.left + pW(ir, 1 - LM.doorR)` — valid for both symmetric letterbox and full-width modes because the formula is algebraically equivalent to `(cW - ir.left - ir.width) + pW(ir, 1-doorR)` when the letterbox is symmetric (ir.left = right_letterbox).
