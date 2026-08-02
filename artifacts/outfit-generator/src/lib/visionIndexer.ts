/**
 * visionIndexer — background photo-analysis indexer.
 *
 * Version scheme for visionVersion field:
 *   0   = not yet indexed
 *   1   = iOS-indexed OLD: only Vision labels, no canvas colours → re-index
 *   2   = iOS-indexed NEW: Vision labels + canvas colours (current target on native)
 *   4   = web-indexed: canvas colours only
 *   5   = web-skipped: no image or no colours found — don't retry
 *
 * On iOS (Capacitor native) we call the VisionPlugin Swift plugin for object
 * labels AND run canvas colour extraction IN PARALLEL, then merge both results.
 * That way colour names ("blue", "white") are always present even though Apple
 * Vision never outputs colour words.
 *
 * On web we only run the canvas extractor (web = 4).
 *
 * Items at version 1 (old iOS, colours missing) are re-indexed automatically
 * on the next app open because TARGET_VERSION === 2 > 1.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { getDB } from "./db";
import type { StoredClothingItem } from "./db";
import { extractColorsFromDataUrl } from "./visionWeb";

// ── Version constants ────────────────────────────────────────────────────────

const IOS_VERSION_OLD  = 1;   // labels only — needs re-indexing
const IOS_VERSION      = 2;   // labels + canvas colours ← current iOS target
const WEB_VERSION      = 4;   // canvas colours only
const WEB_SKIP_VERSION = 5;   // nothing found — don't retry

/** Items with visionVersion < TARGET_VERSION (and not SKIP) will be queued. */
const TARGET_VERSION = Capacitor.isNativePlatform() ? IOS_VERSION : WEB_VERSION;

// ── Native Vision plugin interface ────────────────────────────────────────────

interface VisionPluginDef {
  analyze(opts: { imageDataUrl: string }): Promise<{ labels: string[]; text: string[] }>;
}

// registerPlugin is safe to call on web — the call will throw at .analyze() time
// if the plugin isn't registered natively, which we catch below.
const NativeVision = registerPlugin<VisionPluginDef>("VisionPlugin");

// ── Status events (React components can listen to these) ──────────────────────

export const VISION_STATUS_EVENT = "vision-indexer-status" as const;

function emitStatus(status: "running" | "idle") {
  try {
    window.dispatchEvent(
      new CustomEvent(VISION_STATUS_EVENT, { detail: { status } })
    );
  } catch {
    // jsdom / SSR — no-op
  }
}

// ── Module-level queue ────────────────────────────────────────────────────────

const _pendingIds = new Set<number>();
let _running = false;

// ── Core analysis ─────────────────────────────────────────────────────────────

function needsIndexing(v: number | undefined): boolean {
  const version = v ?? 0;
  // Skip anything that hit the permanent "no image / no colours" marker
  if (version === WEB_SKIP_VERSION) return false;
  return version < TARGET_VERSION;
}

async function analyzeItem(
  item: StoredClothingItem & { id: number }
): Promise<{ visionLabels: string[]; visionText: string[]; visionVersion: number }> {
  if (!item.imageObjectPath) {
    return { visionLabels: [], visionText: [], visionVersion: WEB_SKIP_VERSION };
  }

  if (Capacitor.isNativePlatform()) {
    // Run native Vision AND canvas colour extraction IN PARALLEL so colours
    // are included even though Apple's VNClassifyImageRequest never returns
    // colour names — it returns object labels ("shoe", "high heel", etc.).
    const [nativeResult, canvasColors] = await Promise.allSettled([
      NativeVision.analyze({ imageDataUrl: item.imageObjectPath }),
      extractColorsFromDataUrl(item.imageObjectPath),
    ]);

    const nativeLabels: string[] =
      nativeResult.status === "fulfilled" ? (nativeResult.value.labels ?? []) : [];
    const nativeText: string[] =
      nativeResult.status === "fulfilled" ? (nativeResult.value.text ?? []) : [];
    const colors: string[] =
      canvasColors.status === "fulfilled" ? canvasColors.value : [];

    // Merge: deduplicate labels + colour names
    const mergedLabels = Array.from(new Set([...nativeLabels, ...colors]));

    if (nativeResult.status === "rejected") {
      // Plugin not available on this build — fall through with canvas colours only
      console.info("[visionIndexer] Native Vision unavailable, using canvas only");
    }

    return {
      visionLabels:  mergedLabels,
      visionText:    nativeText,
      visionVersion: IOS_VERSION,
    };
  }

  // Web path — canvas colour extractor only
  const colors = await extractColorsFromDataUrl(item.imageObjectPath);
  if (colors.length === 0) {
    return { visionLabels: [], visionText: [], visionVersion: WEB_SKIP_VERSION };
  }
  return { visionLabels: colors, visionText: [], visionVersion: WEB_VERSION };
}

// ── Indexer loop ──────────────────────────────────────────────────────────────

async function runIndexer() {
  if (_running) return;
  _running = true;
  emitStatus("running");

  try {
    const db = await getDB();

    while (true) {
      let itemId: number | undefined;

      // Drain pending queue first (recently added / updated items)
      if (_pendingIds.size > 0) {
        itemId = _pendingIds.values().next().value as number;
        _pendingIds.delete(itemId);
      }

      let item: (StoredClothingItem & { id: number }) | undefined;

      if (itemId !== undefined) {
        item = (await db.get("clothing_items", itemId)) as
          (StoredClothingItem & { id: number }) | undefined;
      } else {
        // Find oldest un-indexed / under-indexed item
        const all = (await db.getAll("clothing_items")) as
          (StoredClothingItem & { id: number })[];
        item = all.find((i) => needsIndexing(i.visionVersion));
      }

      if (!item?.id) break;

      try {
        const result = await analyzeItem(item);
        await db.put("clothing_items", { ...item, ...result });
      } catch (err) {
        console.warn("[visionIndexer] Failed to analyze item", item.id, err);
      }

      // Small yield between items to avoid hogging the main thread
      await new Promise<void>((r) => setTimeout(r, 350));
    }
  } finally {
    _running = false;
    emitStatus("idle");
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Call once from main.tsx (after RC init) to start the background indexer.
 * Deferred 2 s so the app has time to mount before CPU-intensive work begins.
 */
export function startVisionIndexer(): void {
  setTimeout(runIndexer, 2000);
}

/**
 * Call after creating or updating a clothing item so it gets re-indexed
 * promptly rather than waiting for the next full scan.
 */
export function queueItemForIndexing(id: number): void {
  _pendingIds.add(id);
  if (!_running) {
    setTimeout(runIndexer, 100);
  }
}

// Export OLD_VERSION so tests / migrations can reference it
export { IOS_VERSION_OLD };
