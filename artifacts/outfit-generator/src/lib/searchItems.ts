/**
 * searchItems — full-text search across wardrobe items and outfit groups.
 *
 * Scoring weights:
 *   name / brand           10
 *   category / color /
 *   size / season /
 *   occasion                5
 *   notes / price / date    3
 *   group name / notes      4
 *   visionLabels             2
 *   visionText               1
 *
 * All query tokens must match somewhere in the item/group for it to appear in
 * results (AND semantics). Matching is case-insensitive substring.
 */

import type { ClothingItem, SavedOutfit } from "./db";

export interface ItemSearchResult {
  kind:  "item";
  item:  ClothingItem;
  score: number;
}

export interface GroupSearchResult {
  kind:   "group";
  outfit: SavedOutfit;
  score:  number;
}

export type SearchResult = ItemSearchResult | GroupSearchResult;

// ── Helpers ───────────────────────────────────────────────────────────────────

function tokenize(query: string): string[] {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function textOf(v: string | null | undefined): string {
  return (v ?? "").toLowerCase();
}

function arrayText(arr: string[] | undefined): string {
  return (arr ?? []).join(" ").toLowerCase();
}

// ── Item scoring ──────────────────────────────────────────────────────────────

function scoreItem(item: ClothingItem, tokens: string[]): number {
  // All tokens must appear somewhere in the combined item text
  const fullText = [
    item.name, item.brand, item.category, item.color,
    item.size, item.season, item.occasion,
    item.notes, item.purchasePrice, item.purchaseDate,
    arrayText(item.visionLabels),
    arrayText(item.visionText),
  ].map(textOf).join(" ");

  if (!tokens.every((t) => fullText.includes(t))) return 0;

  let score = 0;

  const weighted: Array<[string, number]> = [
    [textOf(item.name),          10],
    [textOf(item.brand),         10],
    [textOf(item.category),       5],
    [textOf(item.color),          5],
    [textOf(item.size),           5],
    [textOf(item.season),         5],
    [textOf(item.occasion),       5],
    [textOf(item.notes),          3],
    [textOf(item.purchasePrice),  3],
    [textOf(item.purchaseDate),   3],
    [arrayText(item.visionLabels), 2],
    [arrayText(item.visionText),   1],
  ];

  for (const [fieldText, weight] of weighted) {
    if (tokens.some((t) => fieldText.includes(t))) {
      score += weight;
    }
  }

  return score;
}

// ── Group scoring ─────────────────────────────────────────────────────────────

function scoreGroup(outfit: SavedOutfit, tokens: string[]): number {
  const nameText  = textOf(outfit.name);
  const notesText = textOf(outfit.notes);
  const groupText = `${nameText} ${notesText}`;

  const directMatch = tokens.every((t) => groupText.includes(t));
  const memberMaxScore = outfit.items.reduce(
    (max, item) => Math.max(max, scoreItem(item, tokens)),
    0
  );

  if (!directMatch && memberMaxScore === 0) return 0;

  let score = 0;
  if (directMatch) {
    if (tokens.some((t) => nameText.includes(t)))  score += 4;
    if (tokens.some((t) => notesText.includes(t))) score += 2;
  }

  // Boost groups whose members match (so they surface alongside item results)
  if (memberMaxScore > 0) {
    score += memberMaxScore + 1;
  }

  return score;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function searchItems(
  query: string,
  items:   ClothingItem[],
  outfits: SavedOutfit[],
): { items: ItemSearchResult[]; groups: GroupSearchResult[] } {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { items: [], groups: [] };

  const itemResults: ItemSearchResult[] = items
    .map((item) => ({ kind: "item" as const, item, score: scoreItem(item, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const groupResults: GroupSearchResult[] = outfits
    .map((outfit) => ({ kind: "group" as const, outfit, score: scoreGroup(outfit, tokens) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return { items: itemResults, groups: groupResults };
}
