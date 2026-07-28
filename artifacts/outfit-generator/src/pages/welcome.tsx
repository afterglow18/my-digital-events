/**
 * WelcomePage — 5-6 huge gold/white/teal balloons fill the screen.
 * Tap "Open Events ✨" → they all float upward → hero is revealed → enter app.
 */

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

// ── Palette: gold, white, teal only ───────────────────────────────────────────
const GOLD  = "#D4A843";
const GOLD2 = "#C49235";
const WHITE = "#F4F0E8";
const TEAL  = "#2CC4B0";
const TEAL2 = "#1FA898";

// ── 9 huge overlapping balloons — cover entire screen incl. button area ───────
// sizeVw = balloon WIDTH as % of viewport width — scales on every device.
// x / y are % of the viewport — negatives let balloons bleed off the edge.
const BALLOONS = [
  // ── Top band ─────────────────────────────────────────────────────────────
  { id: 0, x: -20, y:  -8, sizeVw: 78, color: GOLD,  floatDelay: 0.00 },
  { id: 1, x:  22, y: -12, sizeVw: 75, color: TEAL,  floatDelay: 0.12 },
  { id: 2, x:  60, y:  -6, sizeVw: 72, color: WHITE, floatDelay: 0.06 },
  // ── Middle band ───────────────────────────────────────────────────────────
  { id: 3, x: -12, y:  28, sizeVw: 76, color: TEAL2, floatDelay: 0.18 },
  { id: 4, x:  26, y:  22, sizeVw: 74, color: GOLD2, floatDelay: 0.08 },
  { id: 5, x:  62, y:  26, sizeVw: 72, color: GOLD,  floatDelay: 0.15 },
  // ── Lower band — covers CTA area ─────────────────────────────────────────
  { id: 6, x: -10, y:  52, sizeVw: 78, color: WHITE, floatDelay: 0.22 },
  { id: 7, x:  30, y:  48, sizeVw: 76, color: TEAL,  floatDelay: 0.05 },
  // ── Bottom-right corner ───────────────────────────────────────────────────
  { id: 8, x:  62, y:  58, sizeVw: 72, color: WHITE, floatDelay: 0.14 },
];

// ── SVG balloon component ─────────────────────────────────────────────────────
// sizeVw = balloon WIDTH as a % of viewport width (e.g. 75 → 75vw).
// The SVG uses a fixed viewBox so it scales cleanly at any resolution.
const VB_W = 65;   // viewBox width  (aspect ratio w:h = 65:100)
const VB_H = 100;  // viewBox height

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
      {/* Soft drop shadow beneath knot */}
      <ellipse cx={cx} cy={knotY + 8} rx={bRx * 0.55} ry={5} fill={shadowColor} />

      {/* Body */}
      <ellipse cx={cx} cy={bCy} rx={bRx} ry={bRy} fill={color} />

      {/* Inner highlight */}
      <ellipse
        cx={cx + bRx * 0.04}
        cy={bCy - bRy * 0.08}
        rx={bRx * 0.60}
        ry={bRy * 0.55}
        fill={isWhite ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.10)"}
      />

      {/* Knot */}
      <path
        d={`M ${cx - VB_W * 0.055} ${knotY - 2} Q ${cx} ${knotY + knotH} ${cx + VB_W * 0.055} ${knotY - 2}`}
        fill={color}
      />

      {/* String */}
      <path
        d={`M ${cx} ${knotY + knotH} Q ${cx + VB_W * 0.20} ${knotY + knotH + (strBot - knotY) * 0.45} ${cx - VB_W * 0.06} ${strBot}`}
        stroke={isWhite ? "rgba(120,100,70,0.35)" : "rgba(255,255,255,0.35)"}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />

      {/* Main shine */}
      <ellipse
        cx={cx - bRx * 0.30}
        cy={bCy - bRy * 0.35}
        rx={bRx * 0.25}
        ry={bRy * 0.30}
        fill={`rgba(255,255,255,${shineOpacity})`}
        transform={`rotate(-20 ${cx - bRx * 0.30} ${bCy - bRy * 0.35})`}
      />

      {/* Secondary shine */}
      <ellipse
        cx={cx - bRx * 0.48}
        cy={bCy - bRy * 0.55}
        rx={bRx * 0.10}
        ry={bRy * 0.12}
        fill={`rgba(255,255,255,${shineOpacity * 0.6})`}
        transform={`rotate(-20 ${cx - bRx * 0.48} ${bCy - bRy * 0.55})`}
      />
    </svg>
  );
}

// ── Single balloon ────────────────────────────────────────────────────────────
interface BalloonProps {
  x: number; y: number; sizeVw: number; color: string;
  floatDelay: number;
  floating: boolean;
}

function Balloon({ x, y, sizeVw, color, floatDelay, floating }: BalloonProps) {
  return (
    <motion.div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        zIndex: 5,
        pointerEvents: "none",
      }}
      animate={floating ? { y: "-115vh" } : { y: 0 }}
      transition={floating
        ? { duration: 1.1, delay: floatDelay, ease: [0.15, 0, 0.45, 1.1] }
        : { duration: 0 }
      }
    >
      <BalloonSvg color={color} sizeVw={sizeVw} />
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Phase = "idle" | "floating" | "exiting";

export default function WelcomePage({ onEnter }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const calledRef = useRef(false);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  const handleEnter = () => {
    if (phase !== "idle") return;
    setPhase("floating");
    setTimeout(() => setPhase("exiting"), 1800);
    setTimeout(finish, 2450);
  };

  const isFloating = phase !== "idle";
  const isExiting  = phase === "exiting";

  return (
    <motion.div
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.65, ease: "easeIn" }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        overflow: "hidden",
        background: "#0c0c14",
      }}
    >
      {/* ── Hero image — sits behind balloons, revealed when they fly ── */}
      <img
        src="/hero-welcome.png"
        alt="My Digital Events"
        draggable={false}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          objectPosition: "center top",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 1,
        }}
      />

      {/* ── Dark overlay — fades as balloons clear ── */}
      <motion.div
        style={{ position: "absolute", inset: 0, zIndex: 2, background: "#0c0c14" }}
        animate={{ opacity: isFloating ? 0 : 0.78 }}
        transition={{ duration: isFloating ? 1.2 : 0, delay: isFloating ? 0.5 : 0, ease: "easeOut" }}
      />

      {/* ── Balloons ── */}
      {BALLOONS.map(b => (
        <Balloon key={b.id} {...b} floating={isFloating} />
      ))}

      {/* ── Subtle ambient glow behind balloons — gold tint ── */}
      <div
        style={{
          position: "absolute", inset: 0, zIndex: 4,
          background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(212,168,67,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Bottom CTA ── */}
      <div
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          zIndex: 20,
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 14,
          padding: "20px 32px",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 52px)",
          background: "linear-gradient(to bottom, transparent, rgba(12,12,20,0.90) 40%)",
        }}
      >
        <motion.p
          animate={{ opacity: isFloating ? 0 : 1 }}
          transition={{ duration: 0.25 }}
          style={{
            fontSize: 11, fontWeight: 500,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "#000000",
            margin: 0, textAlign: "center",
          }}
        >
          your event collection
        </motion.p>

        <motion.button
          onClick={handleEnter}
          animate={{ opacity: isFloating ? 0 : 1, y: isFloating ? 10 : 0 }}
          transition={{ duration: 0.22 }}
          style={{
            fontFamily: "var(--font-display, sans-serif)",
            fontWeight: 800, fontSize: 15,
            letterSpacing: "0.03em",
            color: "#3A2210",
            background: "linear-gradient(to bottom, #E8D4A0, #B8894E)",
            border: "1.5px solid #B8894E",
            borderRadius: 100,
            padding: "13px 48px",
            cursor: "pointer",
            boxShadow: "0 4px 24px rgba(120,80,40,0.50), 0 1px 0 rgba(255,255,255,0.15) inset",
            whiteSpace: "nowrap",
            pointerEvents: phase === "idle" ? "auto" : "none",
          }}
        >
          Open Events ✨
        </motion.button>
      </div>

      {/* ── Footer links ── */}
      <div style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom) + 10px)",
        left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        zIndex: 30,
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
    </motion.div>
  );
}
