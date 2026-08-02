/**
 * LookbookPickerSheet — lets the user add/remove the current item
 * from any of their saved lookbook groups.
 *
 * Each row shows up to 3 item thumbnails for the group, the group name,
 * and a filled/empty circle that indicates membership.
 * Tapping a row immediately optimistically toggles and fires the DB mutation.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, PartyPopper } from "lucide-react";
import {
  useListOutfits,
  useAddItemToOutfit,
  useRemoveItemFromOutfit,
  getListOutfitsQueryKey,
} from "@/hooks/useLocalDB";
import type { ClothingItem, SavedOutfit } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";

// ── Thumbnail strip ───────────────────────────────────────────────────────────

function OutfitThumbs({ outfit }: { outfit: SavedOutfit }) {
  const thumbs = outfit.items.slice(0, 3);
  if (thumbs.length === 0) {
    return (
      <div className="h-10 w-10 border border-black/20 rounded bg-black/5
                       flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] text-black/25">—</span>
      </div>
    );
  }
  return (
    <div className="flex gap-0.5 flex-shrink-0">
      {thumbs.map((i) => (
        <div
          key={i.id}
          className="h-10 w-10 border border-black/20 rounded overflow-hidden"
          style={{ background: "#F5EDD8" }}
        >
          {i.imageObjectPath ? (
            <img
              src={getImageUrl(i.imageObjectPath)!}
              alt={i.name}
              className="w-full h-full object-contain"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  item:    ClothingItem;
  onClose: () => void;
}

export function LookbookPickerSheet({ item, onClose }: Props) {
  const { data: outfits = [], isLoading } = useListOutfits();
  const addItem    = useAddItemToOutfit();
  const removeItem = useRemoveItemFromOutfit();
  const qc         = useQueryClient();

  // Optimistic local membership map { outfitId → isIn }
  const [localState, setLocalState] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(outfits.map((o) => [o.id, o.items.some((i) => i.id === item.id)]))
  );

  // Sync once outfits finish loading (they may arrive after useState init)
  const [synced, setSynced] = useState(false);
  if (!synced && outfits.length > 0) {
    setLocalState(
      Object.fromEntries(outfits.map((o) => [o.id, o.items.some((i) => i.id === item.id)]))
    );
    setSynced(true);
  }

  const toggle = (outfit: SavedOutfit) => {
    const isIn = localState[outfit.id] ?? outfit.items.some((i) => i.id === item.id);
    // Optimistic flip
    setLocalState((prev) => ({ ...prev, [outfit.id]: !isIn }));

    const invalidate = () => qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() });

    if (isIn) {
      removeItem.mutate({ id: outfit.id, itemId: item.id }, { onSuccess: invalidate });
    } else {
      addItem.mutate({ id: outfit.id, data: { itemId: item.id } }, { onSuccess: invalidate });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 bg-[#f9f4ee]
                   border-b border-[#3A2210]/15 flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <h2 className="font-display font-bold text-xl uppercase tracking-tight text-[#1a0800]">
          Add to Lookbook
        </h2>
        <button
          onClick={onClose}
          className="w-9 h-9 border border-[#3A2210]/25 rounded-full flex items-center
                     justify-center bg-white/70 shadow-sm active:opacity-60 transition-all"
        >
          <X className="w-4 h-4 text-[#3A2210]" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {isLoading ? (
          /* Skeleton */
          [1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-black/5 animate-pulse" />
          ))
        ) : outfits.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center flex-1 text-center py-16">
            <PartyPopper className="w-10 h-10 text-black/20 mb-3" />
            <p className="text-sm font-bold uppercase tracking-wide text-black/40">
              No lookbook groups yet
            </p>
            <p className="text-xs text-black/25 mt-1 leading-snug">
              Save a look on the Lookbook tab to create your first group.
            </p>
          </div>
        ) : (
          outfits.map((outfit) => {
            const isIn = localState[outfit.id] ?? outfit.items.some((i) => i.id === item.id);
            return (
              <button
                key={outfit.id}
                onClick={() => toggle(outfit)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl border-2 border-black
                           bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-left
                           active:translate-y-0.5 active:translate-x-0.5 active:shadow-none
                           transition-all"
              >
                <OutfitThumbs outfit={outfit} />
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-sm uppercase tracking-tight truncate">
                    {outfit.name}
                  </p>
                  <p className="text-[10px] text-black/40 mt-0.5">
                    {outfit.items.length} item{outfit.items.length !== 1 ? "s" : ""}
                  </p>
                </div>
                {/* Membership toggle circle */}
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center
                              flex-shrink-0 transition-colors
                              ${isIn ? "bg-black border-black" : "bg-white border-black/30"}`}
                >
                  {isIn && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                </div>
              </button>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
