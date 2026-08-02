/**
 * visionWeb — canvas-based dominant-colour extractor for web builds.
 *
 * Algorithm:
 *  1. Draw the image at 48×48.
 *  2. Sample 4×4-pixel patches in each corner (64 pixels total) → average = background colour.
 *  3. For every remaining non-transparent, non-background pixel find the
 *     closest of 15 named colours (Euclidean RGB distance).
 *  4. Keep colours whose foreground pixel share ≥ 10 %.
 *
 * Returns an array of colour names e.g. ["blue", "white"].
 * Returns [] if the canvas API is unavailable or the image fails to load.
 */

interface NamedColor {
  name: string;
  r: number;
  g: number;
  b: number;
}

const NAMED_COLORS: NamedColor[] = [
  { name: "red",    r: 220, g:  50, b:  50 },
  { name: "orange", r: 235, g: 130, b:  30 },
  { name: "yellow", r: 240, g: 220, b:  40 },
  { name: "green",  r:  50, g: 160, b:  60 },
  { name: "blue",   r:  40, g:  80, b: 200 },
  { name: "purple", r: 130, g:  50, b: 170 },
  { name: "pink",   r: 240, g: 120, b: 160 },
  { name: "white",  r: 245, g: 245, b: 245 },
  { name: "black",  r:  20, g:  20, b:  20 },
  { name: "gray",   r: 150, g: 150, b: 150 },
  { name: "brown",  r: 140, g:  80, b:  40 },
  { name: "beige",  r: 220, g: 200, b: 165 },
  { name: "navy",   r:  20, g:  30, b: 100 },
  { name: "teal",   r:  30, g: 150, b: 145 },
  { name: "cream",  r: 250, g: 240, b: 210 },
];

function closestNamedColor(r: number, g: number, b: number): string {
  let bestName = NAMED_COLORS[0].name;
  let bestDist = Infinity;
  for (const c of NAMED_COLORS) {
    const d = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2;
    if (d < bestDist) { bestDist = d; bestName = c.name; }
  }
  return bestName;
}

export async function extractColorsFromDataUrl(dataUrl: string): Promise<string[]> {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return [];

  return new Promise<string[]>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const SIZE = 48;
        const canvas = document.createElement("canvas");
        canvas.width  = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve([]); return; }

        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

        // ── Step 1: Detect background colour from corner patches ────────────
        let bgSumR = 0, bgSumG = 0, bgSumB = 0, bgCount = 0;
        const PATCH = 4; // 4×4 pixels per corner
        for (let cy = 0; cy < PATCH; cy++) {
          for (let cx = 0; cx < PATCH; cx++) {
            const corners = [
              [cx,          cy],
              [SIZE-1 - cx, cy],
              [cx,          SIZE-1 - cy],
              [SIZE-1 - cx, SIZE-1 - cy],
            ];
            for (const [px, py] of corners) {
              const i = (py * SIZE + px) * 4;
              if (data[i + 3] < 128) continue; // transparent pixel
              bgSumR += data[i];
              bgSumG += data[i + 1];
              bgSumB += data[i + 2];
              bgCount++;
            }
          }
        }

        const bgR = bgCount > 0 ? bgSumR / bgCount : 255;
        const bgG = bgCount > 0 ? bgSumG / bgCount : 255;
        const bgB = bgCount > 0 ? bgSumB / bgCount : 255;

        // Background similarity threshold (squared Euclidean, ~38 in linear space)
        const BG_THRESHOLD_SQ = 1500;

        // ── Step 2: Count foreground pixels per named colour ────────────────
        const counts: Record<string, number> = {};
        let fgTotal = 0;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue; // transparent
          const r = data[i], g = data[i + 1], b = data[i + 2];

          const distToBg =
            (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2;
          if (distToBg < BG_THRESHOLD_SQ) continue; // too close to background

          fgTotal++;
          const name = closestNamedColor(r, g, b);
          counts[name] = (counts[name] ?? 0) + 1;
        }

        // ── Step 3: Keep colours with ≥ 10 % foreground coverage ────────────
        if (fgTotal === 0) { resolve([]); return; }
        const threshold = fgTotal * 0.10;

        const result = Object.entries(counts)
          .filter(([, count]) => count >= threshold)
          .sort((a, b) => b[1] - a[1])
          .map(([name]) => name);

        resolve(result);
      } catch (err) {
        console.warn("[visionWeb] Canvas extraction failed:", err);
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = dataUrl;
  });
}
