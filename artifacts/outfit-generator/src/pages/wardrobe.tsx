/**
 * WardrobePage
 *
 * Background: /closet-bg.jpg (853×1713 JPEG)
 * Strategy:   object-fit CONTAIN — full image always visible, no cropping.
 *             Minimal side letterboxing (~7 px) on standard iPhone 390.
 *
 * Overlay layers (z-index):
 *   10 – SwipeRow carousels (clothing photos replacing the image's placeholder cards)
 *   12 – Transparent "+ ADD" tap zones (image provides the visual button)
 *   14 – Transparent SAVE / shuffle / mannequin tap zones
 *   20 – Save-outfit name-input popup
 *   30 – Modals (QuickAddSheet, ItemDetailsSheet, etc.)
 *
 * Empty state: image placeholder cards show through (SwipeRow not rendered).
 * Items exist: SwipeRow with cream bg overlays image placeholders; shows real photos.
 */

import React, {
  useRef, useState, useCallback, useEffect, RefObject,
} from "react";
import {
  useListClothing, getListClothingQueryKey,
  useSaveOutfit, useListOutfits, getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SwipeRow, SwipeRowHandle } from "@/components/SwipeRow";
import { QuickAddSheet } from "@/components/clothing/QuickAddSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { MannequinView } from "@/components/MannequinView";
import { UpgradeSheet, UpgradeReason } from "@/components/paywall/UpgradeSheet";
import { PremiumSheet } from "@/components/paywall/PremiumSheet";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT, FREE_OUTFIT_LIMIT } from "@/lib/entitlements";

// ── Types ─────────────────────────────────────────────────────────────────────
type RowKey   = "tops" | "bottoms" | "shoes";
type Category = "tops" | "bottoms" | "shoes" | "accessories" | "outerwear" | "dresses";

// ── Config ────────────────────────────────────────────────────────────────────
const ROWS: { key: RowKey; addLabel: string; btnLabel: string }[] = [
  { key: "tops",    addLabel: "Add Top",    btnLabel: "+ ADD TOPS"    },
  { key: "bottoms", addLabel: "Add Bottom", btnLabel: "+ ADD BOTTOMS" },
  { key: "shoes",   addLabel: "Add Shoes",  btnLabel: "+ ADD SHOES"   },
];

const NAV_H = 90;   // AppLayout bottom-nav height (px)

// ── Source image natural size ─────────────────────────────────────────────────
const IMG_W = 853;
const IMG_H = 1713;

// ── Landmark fractions — measured from the 853×1713 image ────────────────────
// All values are fractions of image width (x) or image height (y), 0 → 1.
const LM = {
  // Inner closet edges (just inside the yellow doors)
  doorL: 0.123,
  doorR: 0.877,

  // Per-row: button tap zone (y centre), carousel top, carousel bottom
  // The button tap zone covers the image's baked-in "+ ADD" pill button on the rod.
  rows: [
    { btnCY: 0.304, carY: 0.324, carBot: 0.473 }, // TOPS
    { btnCY: 0.504, carY: 0.524, carBot: 0.668 }, // BOTTOMS
    { btnCY: 0.697, carY: 0.717, carBot: 0.862 }, // SHOES
  ],

  // Bottom action bar (baked into image)
  barY:     0.887,   // top of bar zone
  barBot:   0.958,   // bottom of bar zone
  hangerCX: 0.152,   // shuffle icon x-centre
  saveBtnL: 0.235,   // save button left edge x
  saveBtnR: 0.768,   // save button right edge x
  manneCX:  0.847,   // mannequin icon x-centre
};

// ── ImgRect — pixel rect of the rendered image inside the container ───────────
interface ImgRect { top: number; left: number; width: number; height: number }

// object-fit: CONTAIN with objectPosition "center top"
// Because the image ratio (853/1713 ≈ 0.498) is less than every iPhone's
// width/height ratio (~0.51+), the image always fills the container HEIGHT
// and has a small side letterbox.
function useImageRect(containerRef: RefObject<HTMLDivElement>): ImgRect {
  const [rect, setRect] = useState<ImgRect>({ top: 0, left: 0, width: 0, height: 0 });
  useEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const cW = c.clientWidth, cH = c.clientHeight;
      const iR = IMG_W / IMG_H;
      const cR = cW / cH;
      let rW: number, rH: number, rL: number, rT: number;
      if (cR > iR) {
        // Container wider: image fills height (side letterbox)
        rH = cH; rW = cH * iR; rT = 0; rL = (cW - rW) / 2;
      } else {
        // Container taller: image fills width (top-pinned)
        rW = cW; rH = cW / iR; rL = 0; rT = 0;
      }
      setRect({ top: rT, left: rL, width: rW, height: rH });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [containerRef]);
  return rect;
}

// ── Pixel helpers ─────────────────────────────────────────────────────────────
const pH = (ir: ImgRect, f: number) => ir.height * f;
const pW = (ir: ImgRect, f: number) => ir.width  * f;
const pX = (ir: ImgRect, f: number) => ir.left   + ir.width  * f;
const pY = (ir: ImgRect, f: number) => ir.top    + ir.height * f;

// ── Closet interior background colour (used to fill the SwipeRow overlay) ─────
const INTERIOR_BG = "rgba(252, 245, 233, 0.94)"; // warm cream matching the image interior
const GOLD        = "#C49B2A";

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WardrobePage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir = useImageRect(containerRef);

  const rowRefs: Record<RowKey, RefObject<SwipeRowHandle | null>> = {
    tops:    useRef<SwipeRowHandle | null>(null),
    bottoms: useRef<SwipeRowHandle | null>(null),
    shoes:   useRef<SwipeRowHandle | null>(null),
  };

  const [centred,       setCentred]       = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [addCategory,   setAddCategory]   = useState<Category | null>(null);
  const [detailsItem,   setDetailsItem]   = useState<ClothingItem | null>(null);
  const [showMannequin, setShowMannequin] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const [showPremium,   setShowPremium]   = useState(false);
  const [isSaveOpen,    setIsSaveOpen]    = useState(false);
  const [saveName,      setSaveName]      = useState("");

  const { data: tops    = [] } = useListClothing({ category: "tops"    }, { query: { queryKey: getListClothingQueryKey({ category: "tops"    }) } });
  const { data: bottoms = [] } = useListClothing({ category: "bottoms" }, { query: { queryKey: getListClothingQueryKey({ category: "bottoms" }) } });
  const { data: shoes   = [] } = useListClothing({ category: "shoes"   }, { query: { queryKey: getListClothingQueryKey({ category: "shoes"   }) } });
  const { data: outfits = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { tops, bottoms, shoes };
  const totalItems = tops.length + bottoms.length + shoes.length;

  const saveOutfit  = useSaveOutfit();
  const queryClient = useQueryClient();
  const { tier, caps, canAddItem, canSaveOutfit } = useEntitlements();

  // ── Stable per-row callbacks ───────────────────────────────────────────────
  const setCentredTops    = useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, tops:    item ?? undefined })), []);
  const setCentredBottoms = useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, bottoms: item ?? undefined })), []);
  const setCentredShoes   = useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, shoes:   item ?? undefined })), []);
  const centredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    tops: setCentredTops, bottoms: setCentredBottoms, shoes: setCentredShoes,
  };

  const handleAddClick = useCallback((cat: Category) => {
    if (canAddItem(totalItems)) setAddCategory(cat); else setUpgradeReason("items");
  }, [canAddItem, totalItems]);

  const handleAddTops    = useCallback(() => handleAddClick("tops"),    [handleAddClick]);
  const handleAddBottoms = useCallback(() => handleAddClick("bottoms"), [handleAddClick]);
  const handleAddShoes   = useCallback(() => handleAddClick("shoes"),   [handleAddClick]);
  const addHandlers: Record<RowKey, () => void> = {
    tops: handleAddTops, bottoms: handleAddBottoms, shoes: handleAddShoes,
  };

  const handleItemTap = useCallback((item: ClothingItem) => setDetailsItem(item), []);

  const handleSaveClick = useCallback(() => {
    if (canSaveOutfit(outfits.length)) setIsSaveOpen(true); else setUpgradeReason("outfits");
  }, [canSaveOutfit, outfits.length]);

  const handleMannequinClick = useCallback(() => {
    if (caps.mannequin) setShowMannequin(true); else setShowPremium(true);
  }, [caps.mannequin]);

  const handleShuffle = useCallback(() => {
    ROWS.forEach(({ key }, i) => {
      const data = rowData[key];
      if (data.length < 2) return;
      const ref = rowRefs[key].current;
      if (!ref) return;
      const idx = Math.floor(Math.random() * data.length);
      setTimeout(() => {
        ref.scrollToIndex(data.length - 1, false);
        setTimeout(() => ref.scrollToIndex(idx, true), 60);
      }, i * 80);
    });
  }, [rowData]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    if (!saveName.trim()) return;
    if (!canSaveOutfit(outfits.length)) {
      setIsSaveOpen(false); setSaveName(""); setUpgradeReason("outfits"); return;
    }
    const itemIds = Object.values(centred)
      .filter((i): i is ClothingItem => i != null)
      .map(i => i.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      { onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
        setIsSaveOpen(false); setSaveName("");
      }},
    );
  };

  const canSave = ROWS.every(({ key }) => !!centred[key]);
  const isFree  = tier === "free";
  const itemsLeft = isFree ? Math.max(0, FREE_ITEM_LIMIT - totalItems) : null;
  const ready   = ir.width > 0;

  // Per-row computed card sizes
  const rowSizes = LM.rows.map(lm => {
    const carH  = pH(ir, lm.carBot - lm.carY);
    const hH    = Math.min(18, Math.max(8, Math.round(carH * 0.140)));
    const cardH = Math.max(0, carH - hH);
    const cardW = Math.round(Math.max(36, cardH) * 0.82);
    return { carH, hH, cardH, cardW };
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: `calc(100dvh - ${NAV_H}px)`,
        overflow: "hidden",
        background: "#F0C238",   // warm gold fallback matching the yellow doors in the image
      }}
    >
      {/* ── Background image — object-fit:contain, never cropped ── */}
      <img
        src="/closet-bg.jpg"
        alt="My Digital Closet"
        style={{
          position: "absolute",
          top: ready ? ir.top : 0,
          left: ready ? ir.left : 0,
          width: ready ? ir.width : "100%",
          height: ready ? ir.height : "auto",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      />

      {/* ── All interactive overlays ── */}
      {ready && (
        <>
          {/* ── Item count badge (live) — transparent tap zone ── */}
          {/* The image has a static badge rendered; we overlay an invisible tap zone  */}
          <button
            onClick={() => setUpgradeReason("items")}
            data-testid="badge-item-count"
            aria-label={`${totalItems} of ${FREE_ITEM_LIMIT} items`}
            style={{
              position: "absolute",
              // Badge is not visible in the new image; show a subtle pill only when full
              display: itemsLeft === 0 ? "flex" : "none",
              top: pY(ir, 0.290), left: "50%", transform: "translateX(-50%)",
              zIndex: 12,
              padding: "3px 14px", borderRadius: 20, border: "none",
              background: "rgba(200,40,40,0.14)",
              boxShadow: "0 0 0 2px rgba(200,40,40,0.40)",
              color: "#aa0000", fontWeight: 700, fontSize: 11,
              letterSpacing: "0.08em", textTransform: "uppercase",
              whiteSpace: "nowrap", cursor: "pointer",
            }}
          >
            WARDROBE FULL
          </button>

          {/* ── Three rows ── */}
          {ROWS.map(({ key, addLabel, btnLabel }, rowIdx) => {
            const lm    = LM.rows[rowIdx];
            const items = rowData[key];
            const { carH, hH, cardH, cardW } = rowSizes[rowIdx];

            const btnTapTop = pY(ir, lm.btnCY) - pH(ir, 0.028);
            const btnTapH   = pH(ir, 0.056);
            const carTop    = pY(ir, lm.carY);
            const innerL    = pX(ir, LM.doorL);
            const innerR    = pX(ir, LM.doorR);

            return (
              <React.Fragment key={key}>
                {/* Transparent tap zone covering the image's "+ ADD TOPS/BOTTOMS/SHOES" pill */}
                <button
                  onClick={addHandlers[key]}
                  aria-label={btnLabel}
                  data-testid={`add-btn-${key}`}
                  style={{
                    position: "absolute",
                    top: btnTapTop,
                    left: innerL,
                    width: innerR - innerL,
                    height: Math.max(36, btnTapH),
                    zIndex: 12,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 20,
                  }}
                />

                {/* Clothing carousel — only rendered when items exist */}
                {items.length > 0 && (
                  <div
                    data-testid={`row-${key}`}
                    style={{
                      position: "absolute",
                      top: carTop,
                      left: 0, right: 0,
                      height: carH,
                      zIndex: 10,
                      // Cream overlay covers the image's placeholder cards
                      background: INTERIOR_BG,
                    }}
                  >
                    {/* Pink swipe chevrons */}
                    <div style={{ position:"absolute", left: innerL - 6, top:"50%", transform:"translateY(-50%)", fontSize: Math.max(18, Math.round(carH * 0.42)), color:"#e8a0bc", fontWeight:300, lineHeight:1, pointerEvents:"none", userSelect:"none", opacity:0.9, zIndex:13 }}>‹</div>
                    <div style={{ position:"absolute", right: ir.left + pW(ir, 1 - LM.doorR) - 6, top:"50%", transform:"translateY(-50%)", fontSize: Math.max(18, Math.round(carH * 0.42)), color:"#e8a0bc", fontWeight:300, lineHeight:1, pointerEvents:"none", userSelect:"none", opacity:0.9, zIndex:13 }}>›</div>

                    <SwipeRow
                      ref={rowRefs[key]}
                      items={items}
                      addLabel={addLabel}
                      onCenteredItem={centredHandlers[key]}
                      onAddClick={addHandlers[key]}
                      onItemTap={handleItemTap}
                      closetStyle
                      closetItemW={cardW}
                      closetItemH={cardH}
                      closetHangerH={hH}
                    />
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {/* ── Bottom action bar tap zones (image provides the visual) ── */}
          {/* Shuffle (hanger icon) */}
          <button
            onClick={handleShuffle}
            data-testid="button-shuffle"
            title="Shuffle outfit"
            style={{
              position: "absolute",
              top: pY(ir, LM.barY),
              left: pX(ir, LM.hangerCX) - 24,
              width: 48, height: pH(ir, LM.barBot - LM.barY),
              zIndex: 14,
              background: "transparent", border: "none", cursor: "pointer",
            }}
          />

          {/* Save Outfit — centre tap zone OR name input popup */}
          <AnimatePresence mode="wait">
            {isSaveOpen ? (
              <motion.div
                key="input"
                initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:6 }}
                style={{
                  position: "absolute",
                  bottom: `calc(100% - ${pY(ir, LM.barY)}px + 8px)`,
                  left: pX(ir, LM.saveBtnL),
                  right: ir.left + pW(ir, 1 - LM.saveBtnR),
                  display: "flex", gap: 6, zIndex: 20,
                }}
              >
                <input
                  autoFocus type="text"
                  placeholder="Name this outfit…"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                  data-testid="input-outfit-name"
                  style={{ flex:1, height:38, borderRadius:20, padding:"0 14px", fontSize:13, fontWeight:600, color:"#3a2400", background:"rgba(255,252,245,0.98)", border:"1.5px solid rgba(196,155,42,0.50)", boxShadow:"0 3px 12px rgba(0,0,0,0.14)", outline:"none" }}
                />
                <button
                  onClick={() => { setIsSaveOpen(false); setSaveName(""); }}
                  style={{ width:38, height:38, borderRadius:"50%", flexShrink:0, background:"rgba(255,250,240,0.97)", border:"1.5px solid rgba(196,155,42,0.36)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}
                >
                  <X style={{ width:14, height:14, color:GOLD }} />
                </button>
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim() || saveOutfit.isPending}
                  data-testid="button-save-outfit-confirm"
                  style={{ padding:"0 16px", height:38, borderRadius:20, flexShrink:0, background:"linear-gradient(to bottom,#f5d840,#c89018)", color:"#3a2400", fontWeight:700, fontSize:13, border:"none", boxShadow:"0 3px 10px rgba(200,168,24,0.32)", opacity:(!saveName.trim()||saveOutfit.isPending)?0.42:1, cursor:"pointer" }}
                >
                  {saveOutfit.isPending ? "…" : "Save ♡"}
                </button>
              </motion.div>
            ) : (
              <button
                key="save-zone"
                onClick={handleSaveClick}
                data-testid="button-save-outfit"
                aria-label="Save Outfit"
                style={{
                  position: "absolute",
                  top: pY(ir, LM.barY),
                  left: pX(ir, LM.saveBtnL),
                  right: ir.left + pW(ir, 1 - LM.saveBtnR),
                  height: pH(ir, LM.barBot - LM.barY),
                  zIndex: 14,
                  background: "transparent", border: "none", cursor: "pointer",
                  // Subtle glow ring when a full outfit is ready
                  borderRadius: 20,
                  boxShadow: canSave ? "0 0 0 2px rgba(196,155,42,0.45), 0 3px 12px rgba(200,168,24,0.22)" : "none",
                }}
              />
            )}
          </AnimatePresence>

          {/* Mannequin (dress form) icon */}
          <button
            onClick={handleMannequinClick}
            disabled={!canSave}
            data-testid="button-view-mannequin"
            title="View on mannequin"
            style={{
              position: "absolute",
              top: pY(ir, LM.barY),
              left: pX(ir, LM.manneCX) - 24,
              width: 48, height: pH(ir, LM.barBot - LM.barY),
              zIndex: 14,
              background: "transparent", border: "none",
              cursor: canSave ? "pointer" : "default",
              opacity: canSave ? 1 : 0.30,
            }}
          />
        </>
      )}

      {/* ── Modals ── */}
      <AnimatePresence>
        {showMannequin && (
          <MannequinView
            top={centred.tops} bottom={centred.bottoms} shoes={centred.shoes}
            onClose={() => setShowMannequin(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {upgradeReason && <UpgradeSheet reason={upgradeReason} onClose={() => setUpgradeReason(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showPremium && <PremiumSheet onClose={() => setShowPremium(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {addCategory && (
          <QuickAddSheet
            key={addCategory}
            open={!!addCategory}
            onOpenChange={open => !open && setAddCategory(null)}
            category={addCategory}
            existingCount={rowData[addCategory as RowKey]?.length ?? 0}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {detailsItem && (
          <ItemDetailsSheet
            key={detailsItem.id}
            item={detailsItem}
            onClose={() => setDetailsItem(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
