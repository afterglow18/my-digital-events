/**
 * QuickAddSheet
 *
 * Upload flow — every photo (single or multi-select) goes through comparison:
 *   pick ──(files chosen)──► encoding ──► preview (bg removal runs in parallel)
 *        ──(user taps Save)──► [next photo or close]
 *
 * Background removal is on-device via @imgly/background-removal.
 * The model (~15 MB) downloads once from the imgly CDN then is permanently
 * cached by the browser / WKWebView.
 */
import React, { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Loader2, Check, RotateCcw } from "lucide-react";
import {
  useCreateClothingItem,
  getListClothingQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";
import {
  removeBackground,
  blobToDataUrl,
  dataUrlToBlob,
} from "@/lib/backgroundRemoval";

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = "outfits" | "beauty" | "toiletries" | "essentials";

const CATEGORY_LABELS: Record<Category, string> = {
  outfits:    "Outfits",
  beauty:     "Beauty",
  toiletries: "Toiletries",
  essentials: "Essentials",
};

type Phase =
  | "pick"      // two-button landing screen
  | "encoding"  // canvas resize — shown instantly after photo is picked
  | "preview"   // side-by-side Original | Cleaned comparison
  | "uploading"; // saving to IndexedDB

// ── Helpers (outside component so they don't re-create on render) ─────────────

/**
 * Resize + re-encode any image File/Blob to a JPEG Blob ≤ 2048 px.
 * Used as input for bg removal and the "original" preview.
 */
async function encodeForUpload(input: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(input);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX   = 2048;
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w     = Math.round(img.naturalWidth  * scale);
      const h     = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => (b && b.size > 1000 ? resolve(b) : reject(new Error("blank image"))),
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("failed to load image"));
    };
    img.src = objectUrl;
  });
}

/**
 * Compress a blob for DB storage (≤ 1200 px).
 * PNGs (transparent bg) stay PNG; everything else becomes JPEG.
 */
async function blobToStorageDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX   = 1200;
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w     = Math.round(img.naturalWidth  * scale);
      const h     = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const isPng   = blob.type === "image/png";
      const dataUrl = isPng
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", 0.82);
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to encode image for storage"));
    };
    img.src = url;
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  category:      Category;
  existingCount: number;
  onCreated?:    (item: import("@/lib/db").ClothingItem) => void;
}

const PHOTO_TIPS = [
  "Photograph individual products or bundle multiple items together.",
  "Lay everything flat on a plain background.",
  "Take the photo from directly above.",
  "Keep all items fully in frame.",
] as const;

const CATEGORY_EXAMPLES: Record<string, { emoji: string; items: string[] }> = {
  outfits:    { emoji: "👗", items: ["Tops", "Bottoms", "Shoes", "Swim", "Undergarments", "Dresses", "Accessories"] },
  beauty:     { emoji: "💄", items: ["Makeup", "Skincare", "Hair", "Jewelry", "Nail Polish"] },
  toiletries: { emoji: "🪥", items: ["Shower", "Dental", "Medicine", "Feminine Care", "First Aid"] },
  essentials: { emoji: "🧳", items: ["Travel Docs", "Tech", "Snacks", "Books", "Accessories"] },
};

export function QuickAddSheet({ open, onOpenChange, category, existingCount, onCreated }: Props) {
  const [phase,    setPhase]    = useState<Phase>("pick");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Multi-photo queue ─────────────────────────────────────────────────────
  // All selected files are queued; each goes through the comparison flow in turn.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [photoIndex,   setPhotoIndex]   = useState(0);

  // ── Background-removal state ──────────────────────────────────────────────
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalUrl,  setOriginalUrl]  = useState<string | null>(null);
  const [cleanedBlob,  setCleanedBlob]  = useState<Blob | null>(null);
  const [cleanedUrl,   setCleanedUrl]   = useState<string | null>(null);
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgFailed,     setBgFailed]     = useState(false);
  const [selected,     setSelected]     = useState<"original" | "cleaned">("original");
  // Each photo bumps this counter. Every async step checks it before writing state —
  // prevents a slow first photo from clobbering a fast second one.
  const bgGenRef = useRef(0);

  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const createItem  = useCreateClothingItem();
  const queryClient = useQueryClient();

  // ── Full reset ────────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    bgGenRef.current += 1;  // cancels any in-flight removal
    setBgProcessing(false); // MUST reset — close can happen mid-removal
    setPhase("pick");
    setErrorMsg(null);
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setSelected("original");
    setPendingFiles([]);
    setPhotoIndex(0);
    onOpenChange(false);
  }, [onOpenChange]);

  // ── Persist one blob to the DB ────────────────────────────────────────────
  const saveChosenBlob = useCallback(async (blob: Blob, itemIndex: number): Promise<boolean> => {
    try {
      const path     = await blobToStorageDataUrl(blob);
      const label    = CATEGORY_LABELS[category];
      const n        = itemIndex + 1;
      const autoName = n === 1 ? label : `${label} ${n}`;
      await new Promise<void>((resolve, reject) => {
        createItem.mutate(
          { data: { name: autoName, category, imageObjectPath: path } },
          {
            onSuccess: (createdItem) => {
              queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
              queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
              if (onCreated) onCreated(createdItem);
              resolve();
            },
            onError: reject,
          },
        );
      });
      return true;
    } catch (err) {
      console.error("Upload / create failed:", err);
      return false;
    }
  }, [category, createItem, queryClient, onCreated]);

  // ── Single-photo comparison flow ──────────────────────────────────────────
  // Called for every photo — including each one in a multi-photo batch.
  const handleFile = useCallback(async (file: File | Blob) => {
    setErrorMsg(null);
    // Switch to "encoding" BEFORE any await so the spinner appears instantly.
    const myGen = ++bgGenRef.current;
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setBgProcessing(false);
    setSelected("original");
    setPhase("encoding");

    let jpeg: Blob;
    try {
      jpeg = await encodeForUpload(file);
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      setErrorMsg(`Could not read the photo: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("pick");
      return;
    }
    if (bgGenRef.current !== myGen) return;

    setOriginalBlob(jpeg);
    setOriginalUrl(URL.createObjectURL(jpeg));
    setPhase("preview");

    setBgProcessing(true);
    try {
      const dataUrl   = await blobToDataUrl(jpeg);
      if (bgGenRef.current !== myGen) return;
      const resultUrl = await removeBackground(dataUrl);
      if (bgGenRef.current !== myGen) return;
      const resultBlob   = await dataUrlToBlob(resultUrl);
      const resultObjUrl = URL.createObjectURL(resultBlob);
      if (bgGenRef.current !== myGen) { URL.revokeObjectURL(resultObjUrl); return; }
      setCleanedBlob(resultBlob);
      setCleanedUrl(resultObjUrl);
      setSelected("cleaned");
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      console.warn("Background removal failed:", err);
      setBgFailed(true);
    } finally {
      if (bgGenRef.current === myGen) setBgProcessing(false);
    }
  }, []);

  // ── Save chosen version, then advance to next photo or close ─────────────
  const handleSave = useCallback(async (currentIndex: number, queue: File[]) => {
    const blob = selected === "cleaned" && cleanedBlob ? cleanedBlob : originalBlob;
    if (!blob) return;
    setPhase("uploading");
    const ok = await saveChosenBlob(blob, existingCount + currentIndex);
    if (!ok) {
      setErrorMsg("Save failed — please try again.");
      setPhase("preview");
      return;
    }
    // Advance to next photo in queue
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) {
      setPhotoIndex(nextIndex);
      handleFile(queue[nextIndex]);
    } else {
      handleClose();
    }
  }, [selected, cleanedBlob, originalBlob, saveChosenBlob, existingCount, handleFile, handleClose]);

  // ── Kick off the queue when files are picked ──────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPendingFiles(files);
    setPhotoIndex(0);
    handleFile(files[0]);
    e.target.value = "";
  };

  if (!open) return null;

  const label       = CATEGORY_LABELS[category];
  const isMulti     = pendingFiles.length > 1;
  const displayIdx  = photoIndex + 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[70] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}>
        <div className="flex items-center gap-2">
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">
            {phase === "preview" ? "Choose Version" : `Add ${label}`}
          </h2>
          {phase === "preview" && isMulti && (
            <span className="text-xs font-bold text-black/40 border border-black/20 rounded-full px-2 py-0.5">
              {displayIdx} / {pendingFiles.length}
            </span>
          )}
        </div>
        {phase === "pick" && (
          <button
            onClick={handleClose}
            className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                       bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body — plain conditional divs, NO AnimatePresence (prevents blank-screen flashes) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>

        {/* ── PICK ── */}
        {phase === "pick" && (
          <div className="flex flex-col p-5 gap-5">
            {errorMsg && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                {errorMsg}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                           border-4 border-black rounded-2xl bg-primary
                           shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-1 active:translate-y-1 active:shadow-none
                           transition-all"
              >
                <span className="text-4xl leading-none">📷</span>
                <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight">
                  Take<br />Photo
                </span>
              </button>

              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                           border-4 border-black rounded-2xl bg-white
                           shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-1 active:translate-y-1 active:shadow-none
                           transition-all"
              >
                <span className="text-4xl leading-none">🖼️</span>
                <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight">
                  Upload<br />Photo
                </span>
              </button>
            </div>

            {CATEGORY_EXAMPLES[category] && (
              <div className="border-2 border-black rounded-2xl bg-white p-4
                              shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <p className="font-display font-bold text-sm uppercase tracking-tight mb-2 flex items-center gap-2">
                  <span>{CATEGORY_EXAMPLES[category].emoji}</span> WHAT TO ADD
                </p>
                <p className="text-sm text-black/70 leading-snug">
                  {CATEGORY_EXAMPLES[category].items.join(", ")}
                </p>
              </div>
            )}

            <div className="border-2 border-black rounded-2xl bg-white p-4
                            shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
              <p className="font-display font-bold text-sm uppercase tracking-tight mb-3 flex items-center gap-2">
                <span>📸</span> PHOTO TIPS
              </p>
              <ul className="flex flex-col gap-2">
                {PHOTO_TIPS.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-sm text-black/70 leading-snug">
                    <span className="mt-0.5 w-4 h-4 border-2 border-black rounded-sm bg-primary
                                     flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5" strokeWidth={3} />
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── ENCODING — full-screen spinner shown instantly after photo is picked ── */}
        {phase === "encoding" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
            <div className="w-28 h-28 border-4 border-black rounded-3xl bg-white
                            flex items-center justify-center
                            shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <Loader2 className="w-12 h-12 animate-spin" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-2xl uppercase tracking-tight">Processing…</p>
              <p className="text-sm text-muted-foreground mt-1">Getting your photo ready.</p>
            </div>
          </div>
        )}

        {/* ── PREVIEW — side-by-side comparison ── */}
        {phase === "preview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 20 }}>
            {errorMsg && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                {errorMsg}
              </p>
            )}

            <p style={{ textAlign: "center", fontWeight: "bold", fontSize: 11,
                        textTransform: "uppercase", letterSpacing: 2, opacity: 0.4, margin: 0 }}>
              {bgProcessing
                ? "Removing background… this may take a moment"
                : bgFailed
                ? "Background removal unavailable"
                : "Tap to choose"}
            </p>

            <div style={{ display: "flex", gap: 12 }}>
              {/* Original */}
              <button
                onClick={() => setSelected("original")}
                style={{
                  flex: 1, opacity: selected === "original" ? 1 : 0.55,
                  border: selected === "original" ? "4px solid black" : "4px solid rgba(0,0,0,0.15)",
                  borderRadius: 16, overflow: "hidden", background: "none", padding: 0,
                  cursor: "pointer", transition: "opacity 0.15s, border-color 0.15s",
                }}
              >
                <div style={{ background: "#111", minHeight: 176, position: "relative" }}>
                  <img src={originalUrl!} alt="Original"
                       style={{ width: "100%", objectFit: "contain", maxHeight: 176, display: "block" }} />
                  {selected === "original" && (
                    <div style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22,
                                  borderRadius: "50%", background: "black",
                                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Check size={13} color="white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p style={{ textAlign: "center", fontWeight: 800, fontSize: 11,
                            textTransform: "uppercase", padding: "7px 0", margin: 0, letterSpacing: 1 }}>
                  Original
                </p>
              </button>

              {/* Cleaned */}
              <button
                onClick={() => cleanedUrl && setSelected("cleaned")}
                disabled={!cleanedUrl}
                style={{
                  flex: 1,
                  opacity: selected === "cleaned" && cleanedUrl ? 1 : 0.55,
                  border: selected === "cleaned" && cleanedUrl ? "4px solid black" : "4px solid rgba(0,0,0,0.15)",
                  borderRadius: 16, overflow: "hidden", background: "none", padding: 0,
                  cursor: cleanedUrl ? "pointer" : "default",
                  transition: "opacity 0.15s, border-color 0.15s",
                }}
              >
                <div style={{
                  background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 12px 12px",
                  minHeight: 176, position: "relative",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {cleanedUrl ? (
                    <>
                      <img src={cleanedUrl} alt="Background removed"
                           style={{ width: "100%", objectFit: "contain", maxHeight: 176, display: "block" }} />
                      {selected === "cleaned" && (
                        <div style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22,
                                      borderRadius: "50%", background: "black",
                                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Check size={13} color="white" strokeWidth={3} />
                        </div>
                      )}
                    </>
                  ) : bgFailed ? (
                    <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                                opacity: 0.4, textAlign: "center", padding: "0 12px", margin: 0 }}>
                      Could not remove background
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                      <Loader2 size={32} style={{ opacity: 0.45 }} className="animate-spin" />
                      <p style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase",
                                  opacity: 0.45, margin: 0, letterSpacing: 1 }}>Processing</p>
                    </div>
                  )}
                </div>
                <p style={{ textAlign: "center", fontWeight: 800, fontSize: 11,
                            textTransform: "uppercase", padding: "7px 0", margin: 0, letterSpacing: 1 }}>
                  Cleaned ✨
                </p>
              </button>
            </div>

            {/* Action row */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  // If there are queued photos, abandon this batch and return to pick
                  bgGenRef.current += 1;
                  setBgProcessing(false);
                  setPendingFiles([]);
                  setPhotoIndex(0);
                  setPhase("pick");
                }}
                className="flex items-center justify-center gap-2 border-2 border-black rounded-xl
                           bg-white font-bold text-sm uppercase tracking-wide px-4 py-3
                           shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                Retake
              </button>

              <button
                onClick={() => handleSave(photoIndex, pendingFiles)}
                disabled={bgProcessing}
                className="flex-1 flex items-center justify-center gap-2 border-2 border-black rounded-xl
                           bg-primary font-bold text-sm uppercase tracking-wide px-4 py-3
                           shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all
                           disabled:opacity-40 disabled:cursor-not-allowed
                           disabled:active:translate-x-0 disabled:active:translate-y-0
                           disabled:active:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
              >
                {bgProcessing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                ) : isMulti && photoIndex + 1 < pendingFiles.length ? (
                  <><Check className="w-4 h-4" /> Save &amp; Next</>
                ) : (
                  <><Check className="w-4 h-4" /> Save to Wardrobe</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── UPLOADING ── */}
        {phase === "uploading" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
            <div className="w-28 h-28 border-4 border-black rounded-3xl bg-white
                            flex items-center justify-center
                            shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <Loader2 className="w-12 h-12 animate-spin" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-2xl uppercase tracking-tight">Saving…</p>
              {isMulti && (
                <p className="text-sm text-muted-foreground mt-1">
                  Photo {displayIdx} of {pendingFiles.length}
                </p>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
             className="hidden" onChange={handleInputChange} />
      <input ref={galleryInputRef} type="file" accept="image/*" multiple
             className="hidden" onChange={handleInputChange} />
    </motion.div>
  );
}
