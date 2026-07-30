/**
 * WelcomePage — 3-phase splash (shown once per cold-launch session):
 *
 *  Phase 1 "hero"     — full-screen hero image, 2.5 s auto-advance
 *  Phase 2 "idle"     — balloon animation + "Welcome to / My Digital Events"
 *                       branding + "Open Events" button
 *  Phase 3 "floating" — balloons fly up → hero revealed → app entered (~750 ms)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props { onEnter: () => void; }

// ── Palette ───────────────────────────────────────────────────────────────────
const GOLD  = "#D4A843";
const GOLD2 = "#C49235";
const WHITE = "#F4F0E8";
const TEAL  = "#2CC4B0";
const TEAL2 = "#1FA898";

// ── 9 huge overlapping balloons — cover entire screen incl. button area ───────
const BALLOONS = [
  { id: 0, x: -20, y:  -8, sizeVw: 78, color: GOLD,  floatDelay: 0.00 },
  { id: 1, x:  22, y: -12, sizeVw: 75, color: TEAL,  floatDelay: 0.12 },
  { id: 2, x:  60, y:  -6, sizeVw: 72, color: WHITE, floatDelay: 0.06 },
  { id: 3, x: -12, y:  28, sizeVw: 76, color: TEAL2, floatDelay: 0.18 },
  { id: 4, x:  26, y:  22, sizeVw: 74, color: GOLD2, floatDelay: 0.08 },
  { id: 5, x:  62, y:  26, sizeVw: 72, color: GOLD,  floatDelay: 0.15 },
  { id: 6, x: -10, y:  52, sizeVw: 78, color: WHITE, floatDelay: 0.22 },
  { id: 7, x:  30, y:  48, sizeVw: 76, color: TEAL,  floatDelay: 0.05 },
  { id: 8, x:  62, y:  58, sizeVw: 72, color: WHITE, floatDelay: 0.14 },
];

// ── SVG balloon ───────────────────────────────────────────────────────────────
const VB_W = 65;
const VB_H = 100;

function BalloonSvg({ color, sizeVw }: { color: string; sizeVw: number }) {
  const cx   = VB_W / 2;
  const bRx  = VB_W * 0.47;
  const bRy  = VB_H * 0.32;
  const bCy  = VB_H * 0.33;
  const knotY  = bCy + bRy;
  const knotH  = VB_H * 0.065;
  const strBot = VB_H * 0.97;

  const isWhite = color.startsWith("#F4") || color.startsWith("#F8") || color === "#FFFFFF";
  const shadowColor  = isWhite ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.22)";
  const shineOpacity = isWhite ? 0.55 : 0.42;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      style={{ width: `${sizeVw}vw`, height: "auto", overflow: "visible", display: "block" }}
    >
      <ellipse cx={cx} cy={knotY + 8} rx={bRx * 0.55} ry={5} fill={shadowColor} />
      <ellipse cx={cx} cy={bCy} rx={bRx} ry={bRy} fill={color} />
      <ellipse
        cx={cx + bRx * 0.04} cy={bCy - bRy * 0.08}
        rx={bRx * 0.60} ry={bRy * 0.55}
        fill={isWhite ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)"}
      />
      <path
        d={`M ${cx - VB_W * 0.055} ${knotY - 2} Q ${cx} ${knotY + knotH} ${cx + VB_W * 0.055} ${knotY - 2}`}
        fill={color}
      />
      <path
        d={`M ${cx} ${knotY + knotH} Q ${cx + VB_W * 0.20} ${knotY + knotH + (strBot - knotY) * 0.45} ${cx - VB_W * 0.06} ${strBot}`}
        stroke={isWhite ? "rgba(120,100,70,0.35)" : "rgba(255,255,255,0.35)"}
        strokeWidth="1.8" fill="none" strokeLinecap="round"
      />
      <ellipse
        cx={cx - bRx * 0.30} cy={bCy - bRy * 0.35}
        rx={bRx * 0.25} ry={bRy * 0.30}
        fill={`rgba(255,255,255,${shineOpacity})`}
        transform={`rotate(-20 ${cx - bRx * 0.30} ${bCy - bRy * 0.35})`}
      />
      <ellipse
        cx={cx - bRx * 0.48} cy={bCy - bRy * 0.55}
        rx={bRx * 0.10} ry={bRy * 0.12}
        fill={`rgba(255,255,255,${shineOpacity * 0.6})`}
        transform={`rotate(-20 ${cx - bRx * 0.48} ${bCy - bRy * 0.55})`}
      />
    </svg>
  );
}

interface BalloonProps {
  x: number; y: number; sizeVw: number; color: string;
  floatDelay: number; floating: boolean;
}

function Balloon({ x, y, sizeVw, color, floatDelay, floating }: BalloonProps) {
  return (
    <motion.div
      style={{ position: "absolute", left: `${x}%`, top: `${y}%`, zIndex: 5, pointerEvents: "none" }}
      animate={floating ? { y: "-115vh" } : { y: 0 }}
      transition={floating
        ? { duration: 1.0, delay: floatDelay, ease: [0.15, 0, 0.45, 1.1] }
        : { duration: 0 }
      }
    >
      <BalloonSvg color={color} sizeVw={sizeVw} />
    </motion.div>
  );
}

// ── Shared branding block ─────────────────────────────────────────────────────
// Used in both Phase 1 and Phase 2 so sizing is identical.
function Branding({ dark = false }: { dark?: boolean }) {
  return (
    <>
      <p style={{
        fontFamily: "var(--font-display, sans-serif)",
        fontSize: 11, fontWeight: 900,
        letterSpacing: "0.24em", textTransform: "uppercase",
        color: dark ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.50)",
        margin: 0, textAlign: "center",
      }}>
        Welcome to
      </p>
      <p style={{
        fontFamily: "var(--app-font-cursive, cursive)",
        fontSize: 34, fontWeight: 400,
        letterSpacing: "0.02em",
        color: "#ffffff",
        margin: 0, textAlign: "center",
        textShadow: "0 2px 14px rgba(0,0,0,0.55)",
        lineHeight: 1.1, whiteSpace: "nowrap",
      }}>
        My Digital Events
      </p>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Phase = "hero" | "idle" | "floating";

export default function WelcomePage({ onEnter }: Props) {
  const [phase, setPhase] = useState<Phase>("hero");
  const calledRef = useRef(false);

  // Phase 1 → Phase 2: auto-advance after 2.5 s
  useEffect(() => {
    const t = setTimeout(() => setPhase(p => p === "hero" ? "idle" : p), 2500);
    return () => clearTimeout(t);
  }, []);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  // Phase 2 → Phase 3: user taps button
  const handleEnter = () => {
    if (phase !== "idle") return;
    setPhase("floating");
    setTimeout(finish, 750);
  };

  const isFloating = phase === "floating";

  return (
    <motion.div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        overflow: "hidden",
        background: "#0c0c14",
      }}
    >
      {/* ── Hero image — always behind everything ── */}
      <img
        src="/hero-welcome.png"
        alt="My Digital Events"
        draggable={false}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover", objectPosition: "center top",
          pointerEvents: "none", userSelect: "none",
          zIndex: 1,
        }}
      />

      {/* ── Dark overlay — present during balloon phase, fades out on exit ── */}
      <motion.div
        style={{ position: "absolute", inset: 0, zIndex: 2, background: "#0c0c14" }}
        animate={{ opacity: isFloating ? 0 : 0.78 }}
        transition={{
          duration: isFloating ? 1.2 : 0.5,
          delay: isFloating ? 0.4 : 0,
          ease: "easeOut",
        }}
      />

      {/* ── Balloons ── */}
      {BALLOONS.map(b => (
        <Balloon key={b.id} {...b} floating={isFloating} />
      ))}

      {/* ── Subtle ambient glow behind balloons ── */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 4,
        background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(212,168,67,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* ── Phase 2/3 Bottom CTA — branding + button ── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        zIndex: 20,
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 12,
        padding: "24px 32px",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 56px)",
        background: "linear-gradient(to bottom, transparent, rgba(12,12,20,0.92) 40%)",
      }}>
        <motion.div
          animate={{ opacity: isFloating ? 0 : 1 }}
          transition={{ duration: 0.25 }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
        >
          <Branding />
        </motion.div>

        <motion.button
          onClick={handleEnter}
          animate={{ opacity: isFloating ? 0 : 1, y: isFloating ? 10 : 0 }}
          transition={{ duration: 0.22 }}
          style={{
            marginTop: 4,
            fontFamily: "var(--font-display, sans-serif)",
            fontWeight: 900, fontSize: 15,
            letterSpacing: "0.08em", textTransform: "uppercase",
            color: "#D4B896",
            background: "linear-gradient(to bottom, #4E8880, #3A6B64)",
            border: "1.5px solid #3A6B64",
            borderRadius: 100,
            padding: "13px 48px",
            cursor: "pointer",
            boxShadow: "0 4px 24px rgba(30,90,80,0.45), 0 1px 0 rgba(255,255,255,0.10) inset",
            whiteSpace: "nowrap",
            pointerEvents: phase === "idle" ? "auto" : "none",
          }}
        >
          Open Events ✨
        </motion.button>
      </div>

      {/* ── Footer links (Phase 2) ── */}
      <div style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom) + 10px)",
        left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        zIndex: 30,
        pointerEvents: phase === "idle" ? "auto" : "none",
      }}>
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.22)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Privacy Policy</a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.22)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Support</a>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Phase 1 Hero Overlay — sits above everything at z:50.
          Fades out after 2.5 s, revealing the balloon screen beneath.
      ══════════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {phase === "hero" && (
          <motion.div
            key="hero-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeInOut" }}
            style={{
              position: "absolute", inset: 0,
              zIndex: 50, overflow: "hidden",
            }}
          >
            {/* Hero image — full-screen, clean */}
            <img
              src="/hero-welcome.png"
              alt=""
              draggable={false}
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover", objectPosition: "center top",
                pointerEvents: "none", userSelect: "none",
              }}
            />

            {/* Bottom gradient for text readability */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              height: "50%",
              background: "linear-gradient(to bottom, transparent, rgba(6,3,1,0.88) 65%)",
              pointerEvents: "none",
            }} />

            {/* Branding text */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 10,
              padding: "24px 32px",
              paddingBottom: "calc(env(safe-area-inset-bottom) + 80px)",
              zIndex: 2,
            }}>
              <Branding dark />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
