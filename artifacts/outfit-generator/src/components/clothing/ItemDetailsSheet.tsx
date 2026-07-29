/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 * Every field is optional and editable. A "Save" button appears only when
 * the form is dirty. Delete is always available.
 *
 * "Clean Up Photo" flow:
 *   1. User taps button → spinner inline while model runs on-device
 *   2. BgCompareOverlay slides up: Original (left) | Cleaned (right)
 *   3. User taps to select (pink ring + checkmark), confirms
 *   4. displayImagePath is updated immediately in local state (no flash)
 *   5. DB write fires in the background; queries invalidated on success
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Heart, Trash2, Save, ChevronDown, Loader2, Sparkles, Check,
} from "lucide-react";
import { removeBackground, compressPng } from "@/lib/backgroundRemoval";
import {
  type ClothingItem,
  type ClothingItemUpdateCategory,
  useUpdateClothingItem,
  useDeleteClothingItem,
  getListClothingQueryKey,
  getListOutfitsQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEASON_OPTIONS    = ["", "Spring", "Summer", "Fall", "Winter", "All Season"];
const OCCASION_OPTIONS  = ["", "Casual", "Work", "Formal", "Sport", "Special Event"];
const CATEGORY_OPTIONS  = ["outfits", "beauty", "toiletries", "essentials"];
const CATEGORY_LABELS: Record<string, string> = {
  outfits:    "Outfits",
  beauty:     "Decor",
  toiletries: "Supplies",
  essentials: "Memories",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-[#3A2210]/50">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full border border-[#3A2210]/25 rounded-xl px-3 py-2 text-sm font-medium
                   bg-white/70 focus:outline-none focus:ring-2 focus:ring-[#B8894E]/40
                   placeholder:font-normal placeholder:text-[#3A2210]/30"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-[#3A2210]/50">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none border border-[#3A2210]/25 rounded-xl px-3 py-2 pr-8
                     text-sm font-medium bg-white/70 focus:outline-none focus:ring-2 focus:ring-[#B8894E]/40
                     cursor-pointer"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o || `— ${label} —`}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[#3A2210]/40" />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ItemDetailsSheetProps {
  item: ClothingItem | null;
  onClose: () => void;
  onDeleted?: () => void;
}

interface FormState {
  name: string;
  brand: string;
  color: string;
  size: string;
  season: string;
  occasion: string;
  purchasePrice: string;
  purchaseDate: string;
  notes: string;
  isFavorite: boolean;
  category: string;
}

function toForm(item: ClothingItem): FormState {
  return {
    name:          item.name          ?? "",
    brand:         item.brand         ?? "",
    color:         item.color         ?? "",
    size:          item.size          ?? "",
    season:        item.season        ?? "",
    occasion:      item.occasion      ?? "",
    purchasePrice: item.purchasePrice ?? "",
    purchaseDate:  item.purchaseDate  ?? "",
    notes:         item.notes         ?? "",
    isFavorite:    item.isFavorite    ?? false,
    category:      item.category      ?? "",
  };
}

function isDirty(form: FormState, item: ClothingItem): boolean {
  return (
    form.name          !== (item.name          ?? "") ||
    form.brand         !== (item.brand         ?? "") ||
    form.color         !== (item.color         ?? "") ||
    form.size          !== (item.size          ?? "") ||
    form.season        !== (item.season        ?? "") ||
    form.occasion      !== (item.occasion      ?? "") ||
    form.purchasePrice !== (item.purchasePrice ?? "") ||
    form.purchaseDate  !== (item.purchaseDate  ?? "") ||
    form.notes         !== (item.notes         ?? "") ||
    form.isFavorite    !== (item.isFavorite    ?? false) ||
    form.category      !== (item.category      ?? "")
  );
}

/** Samples a PNG data-URL and returns true if any pixel has alpha < 255. */
async function detectTransparency(dataUrl: string): Promise<boolean> {
  // Non-PNG formats have no alpha channel — always opaque
  if (!dataUrl.startsWith("data:image/png")) return false;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        // Sample a downscaled version for speed (max 64×64)
        const scale = Math.min(1, 64 / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width  = Math.max(1, Math.round(img.naturalWidth  * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // data is [R, G, B, A, R, G, B, A, …]
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 255) { resolve(true); return; }
        }
        resolve(false);
      } catch {
        // Canvas tainted or other error — assume opaque so button stays available
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}

export function ItemDetailsSheet({ item, onClose, onDeleted }: ItemDetailsSheetProps) {
  const [form, setForm]           = useState<FormState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── "Clean Up Photo" state ────────────────────────────────────────────────
  // displayImagePath starts as item.imageObjectPath, then is updated locally
  // the instant the user confirms — before the DB write completes.
  const [displayImagePath, setDisplayImagePath] = useState<string | null>(null);
  // null = unknown (checking), true = has transparency (already cleaned), false = opaque
  const [imageHasTransparency, setImageHasTransparency] = useState<boolean | null>(null);
  const [compareOpen,    setCompareOpen]    = useState(false);
  const [cleanedLoading, setCleanedLoading] = useState(false);  // removal in-flight
  const [cleanedUrl,     setCleanedUrl]     = useState<string | null>(null);
  const [bgError,        setBgError]        = useState<string | null>(null);
  const [compareSelected, setCompareSelected] = useState<"original" | "cleaned">("original");
  const bgGenRef = useRef(0);  // guards stale async results

  const updateItem  = useUpdateClothingItem();
  const deleteItem  = useDeleteClothingItem();
  const queryClient = useQueryClient();

  // Reset form and bg state whenever the item changes
  useEffect(() => {
    if (item) {
      setForm(toForm(item));
      setDisplayImagePath(item.imageObjectPath ?? null);
      setImageHasTransparency(null);  // will be re-detected below
    }
    setShowDeleteConfirm(false);
    setCompareOpen(false);
    setCleanedLoading(false);
    setCleanedUrl(null);
    setBgError(null);
    setCompareSelected("original");
    bgGenRef.current += 1;
  }, [item?.id]);

  // Detect transparency whenever the displayed image changes
  useEffect(() => {
    if (!displayImagePath) return;
    setImageHasTransparency(null);
    let cancelled = false;
    detectTransparency(displayImagePath).then((result) => {
      if (!cancelled) setImageHasTransparency(result);
    });
    return () => { cancelled = true; };
  }, [displayImagePath]);

  // Open the overlay immediately, then run removal in the background.
  // The user can pick "Original" and confirm at any point without waiting.
  const handleCleanUpPhoto = useCallback(async () => {
    if (!displayImagePath || compareOpen) return;
    const myGen = ++bgGenRef.current;
    // Open overlay right away with Original pre-selected
    setCompareOpen(true);
    setCleanedUrl(null);
    setBgError(null);
    setCompareSelected("original");
    setCleanedLoading(true);
    try {
      const rawDataUrl        = await removeBackground(displayImagePath);
      if (bgGenRef.current !== myGen) return;
      const compressedDataUrl = await compressPng(rawDataUrl);
      if (bgGenRef.current !== myGen) return;
      setCleanedUrl(compressedDataUrl);
      // Auto-switch selection to Cleaned so the user sees the result
      setCompareSelected("cleaned");
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      console.warn("Background removal failed:", err);
      setBgError("Could not remove background — please try again.");
    } finally {
      if (bgGenRef.current === myGen) setCleanedLoading(false);
    }
  }, [displayImagePath, compareOpen]);

  const handleCancelCompare = useCallback(() => {
    bgGenRef.current += 1;   // abort any in-flight removal
    setCompareOpen(false);
    setCleanedLoading(false);
    setCleanedUrl(null);
    setBgError(null);
    setCompareSelected("original");
  }, []);

  // Confirm selection from the compare overlay.
  // ① Update displayImagePath immediately (no DB-write delay → no photo flash).
  // ② Fire DB write in the background.
  const handleConfirmChoice = useCallback((chosen: "original" | "cleaned") => {
    const chosenUrl = chosen === "cleaned" && cleanedUrl ? cleanedUrl : displayImagePath;
    if (!chosenUrl || !item) return;

    bgGenRef.current += 1;   // abort any still-running removal
    setCleanedLoading(false);

    // ① Instant local update
    setDisplayImagePath(chosenUrl);
    // If user chose cleaned, the new PNG has transparency → hide button immediately.
    // If user chose original, keep the current transparency state (re-detection fires
    // via the displayImagePath useEffect, but result will be the same as before).
    if (chosen === "cleaned") setImageHasTransparency(true);
    setCompareOpen(false);
    setCleanedUrl(null);
    setCompareSelected("original");

    // ② Background DB write
    updateItem.mutate(
      { id: item.id, data: { imageObjectPath: chosenUrl } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
        },
      },
    );
  }, [cleanedUrl, displayImagePath, item, updateItem, queryClient]);

  if (!item || !form) return null;

  const dirty = isDirty(form, item);

  const patch = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  const handleSave = () => {
    updateItem.mutate(
      {
        id: item.id,
        data: {
          // Always send every editable field so the backend can clear it when empty.
          // Backend converts "" → null in DB.
          name:          form.name.trim() || item.name,
          brand:         form.brand.trim(),
          color:         form.color.trim(),
          size:          form.size.trim(),
          season:        form.season,
          occasion:      form.occasion,
          purchasePrice: form.purchasePrice.trim(),
          purchaseDate:  form.purchaseDate.trim(),
          notes:         form.notes.trim(),
          isFavorite:    form.isFavorite,
          category:      (form.category || item.category) as ClothingItemUpdateCategory,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          onClose();
        },
      }
    );
  };

  const handleDelete = () => {
    deleteItem.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          onDeleted?.();
          onClose();
        },
      }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[65] flex flex-col max-w-md mx-auto bg-[#f9f4ee] overflow-y-auto"
    >
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4
                      bg-[#f9f4ee] border-b border-[#3A2210]/15 flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}>
        <h2 className="font-display font-bold text-xl uppercase tracking-tight text-[#1a0800]">
          Item Details
        </h2>
        <div className="flex items-center gap-2">
          {/* Favourite toggle — saves instantly */}
          <button
            onClick={() => {
              const next = !form.isFavorite;
              patch("isFavorite")(next);
              updateItem.mutate(
                { id: item.id, data: { isFavorite: next } },
                {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
                  },
                }
              );
            }}
            className={`w-9 h-9 border rounded-full flex items-center justify-center transition-all
                        ${form.isFavorite
                          ? "bg-red-400 border-red-300 shadow-sm"
                          : "bg-white/70 border-[#3A2210]/25 shadow-sm"}`}
            title="Favourite"
          >
            <Heart
              className="w-4 h-4"
              fill={form.isFavorite ? "white" : "none"}
              stroke={form.isFavorite ? "white" : "#3A2210"}
            />
          </button>
          {/* Close */}
          <button
            onClick={onClose}
            className="w-9 h-9 border border-[#3A2210]/25 rounded-full flex items-center justify-center
                       bg-white/70 shadow-sm active:opacity-60 transition-all"
          >
            <X className="w-4 h-4 text-[#3A2210]" />
          </button>
        </div>
      </div>

      {/* ── Photo ── */}
      {displayImagePath && (
        <div className="flex-shrink-0 border-b border-[#3A2210]/15">
          {/* Image preview — uses displayImagePath so it updates before the DB write finishes */}
          <div
            className="w-full h-52"
            style={{
              backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
              backgroundSize: "16px 16px",
            }}
          >
            <img
              src={getImageUrl(displayImagePath)!}
              alt={item.name}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Remove Background button — shown when image has no transparency yet.
              imageHasTransparency === null means still detecting; hide while unknown. */}
          {imageHasTransparency === false && (
            <div className="px-4 py-3 bg-[#f9f4ee] border-t border-[#3A2210]/10 flex flex-col gap-1.5">
              <button
                onClick={handleCleanUpPhoto}
                disabled={compareOpen || cleanedLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4
                           border border-[#B8894E] rounded-xl font-bold text-sm uppercase tracking-wide
                           bg-gradient-to-b from-[#E8D4A0] to-[#B8894E] text-[#3A2210]
                           shadow-sm active:opacity-80
                           transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {cleanedLoading && !compareOpen
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Sparkles className="w-4 h-4" />}
                Remove Background
              </button>
              <p className="text-[10px] text-center text-black/35 leading-snug">
                First run downloads ~15 MB model · processed on-device
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── BgCompareOverlay — slides up above the detail sheet ── */}
      <AnimatePresence>
        {compareOpen && displayImagePath && (
          <BgCompareOverlay
            originalUrl={displayImagePath}
            cleanedUrl={cleanedUrl}
            cleanedLoading={cleanedLoading}
            bgError={bgError}
            selected={compareSelected}
            onSelect={setCompareSelected}
            onConfirm={handleConfirmChoice}
            onCancel={handleCancelCompare}
          />
        )}
      </AnimatePresence>

      {/* ── Form ── */}
      <div className="flex-1 px-4 py-5 flex flex-col gap-4">

        {/* Name */}
        <Field
          label="Item Name"
          value={form.name}
          onChange={patch("name") as (v: string) => void}
          placeholder="e.g. White Linen Shirt"
        />

        {/* Brand + Color */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand"  value={form.brand} onChange={patch("brand") as (v: string) => void} placeholder="Nike, Zara…" />
          <Field label="Color"  value={form.color} onChange={patch("color") as (v: string) => void} placeholder="Navy Blue" />
        </div>

        {/* Size */}
        <Field label="Size / Volume" value={form.size} onChange={patch("size") as (v: string) => void} placeholder="30ml, 50ml, Full Size…" />

        {/* Season + Occasion */}
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Season"   value={form.season}   onChange={patch("season") as (v: string) => void}   options={SEASON_OPTIONS} />
          <SelectField label="Occasion" value={form.occasion} onChange={patch("occasion") as (v: string) => void} options={OCCASION_OPTIONS} />
        </div>

        {/* Price + Date */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase Price" value={form.purchasePrice} onChange={patch("purchasePrice") as (v: string) => void} placeholder="$49.99" />
          <Field label="Purchase Date"  value={form.purchaseDate}  onChange={patch("purchaseDate") as (v: string) => void}  type="date" />
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-[#3A2210]/50">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => patch("notes")(e.target.value)}
            placeholder="Anything worth remembering…"
            rows={3}
            className="w-full border border-[#3A2210]/25 rounded-xl px-3 py-2 text-sm font-medium
                       bg-white/70 focus:outline-none focus:ring-2 focus:ring-[#B8894E]/40 resize-none
                       placeholder:font-normal placeholder:text-[#3A2210]/30"
          />
        </div>

        {/* Category (editable) + Times Worn (read-only) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#3A2210]/50">Category</label>
            <div className="relative">
              <select
                value={form.category}
                onChange={(e) => (patch("category") as (v: string) => void)(e.target.value)}
                className="w-full appearance-none border border-[#3A2210]/25 rounded-xl px-3 py-2 pr-8
                           text-sm font-medium bg-white/70 focus:outline-none focus:ring-2 focus:ring-[#B8894E]/40 cursor-pointer"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o ? (CATEGORY_LABELS[o] ?? o) : `— Category —`}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[#3A2210]/40" />
            </div>
          </div>
          <div className="flex flex-col gap-1 opacity-50 pointer-events-none">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#3A2210]/50">Times Worn</span>
            <div className="border border-[#3A2210]/15 rounded-xl px-3 py-2 text-sm font-medium bg-white/50">
              {item.timesWorn ?? 0}
            </div>
          </div>
        </div>

      </div>

      {/* ── Footer actions ── */}
      <div className="sticky bottom-0 px-4 py-4 bg-[#f9f4ee] border-t border-[#3A2210]/15 flex-shrink-0 flex flex-col gap-2">

        {/* Save (only when dirty) */}
        <AnimatePresence>
          {dirty && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={handleSave}
              disabled={updateItem.isPending}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm
                         font-display font-bold uppercase tracking-wide text-[#3A2210]
                         bg-gradient-to-b from-[#E8D4A0] to-[#B8894E] border border-[#B8894E]
                         shadow-sm active:opacity-80 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {updateItem.isPending ? "Saving…" : "Save Changes"}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Delete */}
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm
                       font-bold uppercase border border-[#3A2210]/20 text-[#3A2210]/40
                       hover:border-red-400 hover:text-red-500 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Delete from Wardrobe Forever
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-3 rounded-xl text-sm font-bold uppercase
                         border border-[#3A2210]/25 bg-white/70 text-[#3A2210]
                         active:opacity-70 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteItem.isPending}
              className="flex-1 py-3 rounded-xl text-sm font-bold uppercase
                         border border-red-400 bg-red-500 text-white
                         shadow-sm active:opacity-80 transition-all disabled:opacity-50"
            >
              {deleteItem.isPending ? "Deleting…" : "Yes, Delete Forever"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── BgCompareOverlay ──────────────────────────────────────────────────────────
// Full-screen overlay that slides up above ItemDetailsSheet (z-[75]).
// Shows Original | Cleaned side-by-side. User taps to select, then confirms.

interface BgCompareOverlayProps {
  originalUrl:    string;
  cleanedUrl:     string | null;   // null while removal is still running
  cleanedLoading: boolean;
  bgError:        string | null;
  selected:       "original" | "cleaned";
  onSelect:       (v: "original" | "cleaned") => void;
  onConfirm:      (chosen: "original" | "cleaned") => void;
  onCancel:       () => void;
}

function BgCompareOverlay({
  originalUrl, cleanedUrl, cleanedLoading, bgError,
  selected, onSelect, onConfirm, onCancel,
}: BgCompareOverlayProps) {
  const PRIMARY = "hsl(340, 82%, 64%)";

  // "Cleaned" can only be selected once the result is ready
  const canSelectCleaned = !cleanedLoading && !!cleanedUrl;

  // Confirm is always available — if Cleaned isn't ready yet, confirm saves Original
  const effectiveSelected: "original" | "cleaned" =
    selected === "cleaned" && !canSelectCleaned ? "original" : selected;

  const hint = cleanedLoading
    ? "Removing background… select Original to skip"
    : bgError
    ? bgError
    : "Tap a version to select it";

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[75] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 bg-[#f9f4ee] border-b border-[#3A2210]/15 flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <h2 className="font-display font-bold text-xl uppercase tracking-tight text-[#1a0800]">
          Clean Up Photo
        </h2>
        <button
          onClick={onCancel}
          className="w-9 h-9 border border-[#3A2210]/25 rounded-full flex items-center justify-center
                     bg-white/70 shadow-sm active:opacity-60 transition-all"
        >
          <X className="w-4 h-4 text-[#3A2210]" />
        </button>
      </div>

      {/* Hint line */}
      <p
        className="text-center text-[11px] font-bold uppercase tracking-widest pt-5 pb-1 px-4"
        style={{ color: bgError ? "#dc2626" : "rgba(0,0,0,0.4)" }}
      >
        {hint}
      </p>

      {/* Side-by-side comparison */}
      <div className="flex gap-3 px-4 flex-1 overflow-hidden" style={{ paddingBottom: 8 }}>

        {/* ── Original ── always ready and tappable */}
        <button
          onClick={() => onSelect("original")}
          className="flex-1 flex flex-col rounded-2xl overflow-hidden border-4 transition-all"
          style={{
            borderColor: effectiveSelected === "original" ? PRIMARY : "rgba(0,0,0,0.12)",
            background: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <div
            className="relative flex-1 bg-[#111] flex items-center justify-center overflow-hidden"
            style={{ minHeight: 0 }}
          >
            <img
              src={originalUrl}
              alt="Original"
              className="w-full h-full object-contain"
              style={{ maxHeight: "100%" }}
            />
            {effectiveSelected === "original" && (
              <div
                className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: PRIMARY }}
              >
                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
              </div>
            )}
          </div>
          <div
            className="py-2.5 text-center font-bold text-[11px] uppercase tracking-widest
                       bg-white border-t-2 border-black/10 flex-shrink-0"
            style={{ color: effectiveSelected === "original" ? PRIMARY : "rgba(0,0,0,0.45)" }}
          >
            Original
          </div>
        </button>

        {/* ── Cleaned — spinner until ready; tappable once ready ── */}
        <button
          onClick={() => canSelectCleaned && onSelect("cleaned")}
          className="flex-1 flex flex-col rounded-2xl overflow-hidden border-4 transition-all"
          style={{
            borderColor: effectiveSelected === "cleaned" ? PRIMARY : "rgba(0,0,0,0.12)",
            background: "none",
            padding: 0,
            cursor: canSelectCleaned ? "pointer" : "default",
            opacity: bgError ? 0.45 : 1,
          }}
        >
          <div
            className="relative flex-1 flex items-center justify-center overflow-hidden"
            style={{
              minHeight: 0,
              background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 14px 14px",
            }}
          >
            {cleanedUrl ? (
              <>
                <img
                  src={cleanedUrl}
                  alt="Background removed"
                  className="w-full h-full object-contain"
                  style={{ maxHeight: "100%" }}
                />
                {effectiveSelected === "cleaned" && (
                  <div
                    className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: PRIMARY }}
                  >
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  </div>
                )}
              </>
            ) : bgError ? (
              <p className="text-[10px] font-bold uppercase text-center text-black/40 px-2">
                Failed
              </p>
            ) : (
              /* Loading spinner — shown while removal runs in background */
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 animate-spin" style={{ opacity: 0.35 }} />
                <p className="text-[9px] font-bold uppercase tracking-widest text-center"
                   style={{ opacity: 0.35 }}>
                  Processing…
                </p>
              </div>
            )}
          </div>
          <div
            className="py-2.5 text-center font-bold text-[11px] uppercase tracking-widest
                       bg-white border-t-2 border-black/10 flex-shrink-0"
            style={{ color: effectiveSelected === "cleaned" ? PRIMARY : "rgba(0,0,0,0.45)" }}
          >
            {cleanedLoading ? "Working…" : "Cleaned ✨"}
          </div>
        </button>

      </div>

      {/* Footer */}
      <div
        className="px-4 py-4 bg-white border-t-2 border-black flex-shrink-0 flex flex-col gap-2"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={() => onConfirm(effectiveSelected)}
          className="w-full py-3.5 rounded-xl border-2 border-black font-bold text-sm uppercase
                     tracking-wide shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
                     active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all
                     flex items-center justify-center gap-2"
          style={{ background: PRIMARY, color: "white" }}
        >
          <Check className="w-4 h-4" />
          {effectiveSelected === "cleaned" ? "Save Cleaned Version" : "Keep Original"}
        </button>

        <button
          onClick={onCancel}
          className="w-full py-3 rounded-xl border-2 border-black/20 font-bold text-sm uppercase
                     tracking-wide text-black/45 transition-all
                     active:border-black/40 active:text-black/60"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}
