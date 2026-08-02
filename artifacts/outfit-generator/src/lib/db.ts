/**
 * Local IndexedDB database for My Digital Events.
 *
 * Works in both the browser (Replit preview) and in the Capacitor iOS WebView —
 * IndexedDB is natively available in both environments and persists to the
 * app's sandboxed storage on-device.
 *
 * Schema v1:
 *   clothing_items  — wardrobe items with embedded image data URLs
 *   saved_outfits   — named outfit collections
 *   outfit_items    — junction: outfit ↔ clothing item
 *   settings        — key/value store for app preferences
 *
 * Schema v2 (additive):
 *   clothing_items  — adds visionLabels, visionText, visionVersion (no new stores/indexes)
 */

import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME    = "my-digital-events";
export const DB_VERSION = 2;

// ── Stored types (IndexedDB records) ─────────────────────────────────────────

export interface StoredClothingItem {
  id?:            number;        // auto-incremented
  name:           string;
  category:       string;        // "outfits" | "beauty" | "toiletries" | "essentials"
  imageObjectPath: string | null; // JPEG data URL  (e.g. "data:image/jpeg;base64,...")
  isFavorite:     boolean;
  timesWorn:      number;
  color?:         string | null;
  brand?:         string | null;
  size?:          string | null;
  season?:        string | null;
  occasion?:      string | null;
  purchasePrice?: string | null;
  purchaseDate?:  string | null;
  notes?:         string | null;
  createdAt:      string;
  updatedAt:      string;
  // Vision search fields (v2) — may be absent on records written before v2
  visionLabels?:  string[];
  visionText?:    string[];
  visionVersion?: number;
}

export interface StoredOutfit {
  id?:       number;
  name:      string;
  notes?:    string | null;
  createdAt: string;
}

export interface StoredOutfitItem {
  id?:             number;
  outfitId:        number;
  clothingItemId:  number;
}

export interface StoredSetting {
  key:   string;
  value: string;
}

// ── Public types (consumed by hooks and pages) ────────────────────────────────

export interface ClothingItem extends Required<StoredClothingItem> {
  id: number;
  // Override vision fields to ensure they're always non-optional at call sites
  // (normalizeItem fills them in when reading old records)
  visionLabels: string[];
  visionText:   string[];
  visionVersion: number;
}

export interface SavedOutfit {
  id:        number;
  name:      string;
  notes?:    string | null;
  createdAt: string;
  items:     ClothingItem[];
}

// ── Singleton DB connection ───────────────────────────────────────────────────

let _db: IDBPDatabase | null = null;

export async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;

  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // v1 → create all stores if they don't exist yet
      if (!db.objectStoreNames.contains("clothing_items")) {
        const store = db.createObjectStore("clothing_items", {
          keyPath:       "id",
          autoIncrement: true,
        });
        store.createIndex("by_category", "category");
        store.createIndex("by_favorite", "isFavorite");
      }

      if (!db.objectStoreNames.contains("saved_outfits")) {
        db.createObjectStore("saved_outfits", {
          keyPath:       "id",
          autoIncrement: true,
        });
      }

      if (!db.objectStoreNames.contains("outfit_items")) {
        const store = db.createObjectStore("outfit_items", {
          keyPath:       "id",
          autoIncrement: true,
        });
        store.createIndex("by_outfit", "outfitId");
        store.createIndex("by_item",   "clothingItemId");
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }

      // v2 → no new stores/indexes needed; vision fields are schemaless JSON
      // Existing records will have visionVersion = undefined → treated as 0 by normalizeItem
      if (oldVersion < 2) {
        console.info("[DB] Upgraded to v2 (vision search fields added)");
      }
    },

    blocked() {
      console.warn("[DB] Upgrade blocked — close other tabs");
    },

    blocking() {
      _db?.close();
      _db = null;
    },
  });

  return _db;
}
