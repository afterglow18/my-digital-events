/**
 * WelcomePage — Balloon reveal splash screen.
 *
 * IDLE    : ~20 colourful balloons bob gently over the dimmed hero image.
 * FLOATING: "Open Events ✨" tapped → balloons fly upward (staggered),
 *           dark overlay fades, hero image is fully revealed.
 * EXITING : whole page fades out → onEnter() called.
 */

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

// ── Balloon data ──────────────────────────────────────────────────────────────
// All positions are deterministic so the screen looks the same every launch.
// x / y are % offsets for the top-left corner of each balloon div.
// floatDelay staggers the fly-up; swayDur / swayDelay vary the idle bob.

const PALETTE = [
  "#FF6B9D","#A855F7","#4ECDC4","#FFD93D","#FF8E53",
  "#6BCB77","#F97316","#EC4899","#3B82F6","#EAB308",
  "#F43F5E","#10B981",
];

const BALLOONS = [
  // ── Row 1 — near top ──────────────────────────────────────────────────────
  { id:  0, x:  3, y: -2, size: 78, color: PALETTE[0],  floatDelay: 0.00, swayDur: 2.8, swayDelay: 0.0 },
  { id:  1, x: 21, y: -5, size: 86, color: PALETTE[1],  floatDelay: 0.12, swayDur: 3.2, swayDelay: 0.5 },
  { id:  2, x: 42, y: -3, size: 82, color: PALETTE[2],  floatDelay: 0.24, swayDur: 2.6, swayDelay: 0.9 },
  { id:  3, x: 62, y: -4, size: 84, color: PALETTE[3],  floatDelay: 0.06, swayDur: 3.0, swayDelay: 1.3 },
  { id:  4, x: 80, y: -1, size: 76, color: PALETTE[4],  floatDelay: 0.18, swayDur: 2.9, swayDelay: 0.3 },
  // ── Row 2 ─────────────────────────────────────────────────────────────────
  { id:  5, x: -1, y: 14, size: 84, color: PALETTE[5],  floatDelay: 0.30, swayDur: 3.1, swayDelay: 0.7 },
  { id:  6, x: 15, y: 12, size: 90, color: PALETTE[6],  floatDelay: 0.04, swayDur: 2.7, swayDelay: 1.1 },
  { id:  7, x: 36, y: 10, size: 86, color: PALETTE[7],  floatDelay: 0.16, swayDur: 3.3, swayDelay: 0.4 },
  { id:  8, x: 57, y: 13, size: 88, color: PALETTE[8],  floatDelay: 0.08, swayDur: 2.5, swayDelay: 0.8 },
  { id:  9, x: 76, y: 11, size: 82, color: PALETTE[9],  floatDelay: 0.26, swayDur: 3.0, swayDelay: 1.2 },
  { id: 10, x: 91, y: 17, size: 78, color: PALETTE[10], floatDelay: 0.14, swayDur: 2.8, swayDelay: 0.2 },
  // ── Row 3 ─────────────────────────────────────────────────────────────────
  { id: 11, x:  5, y: 30, size: 86, color: PALETTE[11], floatDelay: 0.20, swayDur: 3.2, swayDelay: 1.0 },
  { id: 12, x: 26, y: 27, size: 88, color: PALETTE[0],  floatDelay: 0.02, swayDur: 2.6, swayDelay: 0.6 },
  { id: 13, x: 48, y: 25, size: 84, color: PALETTE[1],  floatDelay: 0.28, swayDur: 3.1, swayDelay: 0.1 },
  { id: 14, x: 70, y: 28, size: 82, color: PALETTE[2],  floatDelay: 0.10, swayDur: 2.9, swayDelay: 0.5 },
  // ── Row 4 — lower ─────────────────────────────────────────────────────────
  { id: 15, x: 12, y: 43, size: 80, color: PALETTE[3],  floatDelay: 0.34, swayDur: 3.0, swayDelay: 0.2 },
  { id: 16, x: 38, y: 40, size: 86, color: PALETTE[4],  floatDelay: 0.08, swayDur: 2.7, swayDelay: 0.8 },
  { id: 17, x: 64, y: 43, size: 82, color: PALETTE[5],  floatDelay: 0.22, swayDur: 3.2, swayDelay: 0.4 },
  { id: 18, x: 88, y: 40, size: 78, color: PALETTE[6],  floatDelay: 0.16, swayDur: 2.8, swayDelay: 1.0 },
];

// ── SVG balloon ───────────────────────────────────────────────────────────────
function BalloonSvg({ color, size }: { color: string; size: number }) {
  const w   = size * 0.72;
  const h   = size;
  const cx  = w / 2;
  // Body occupies top 62 % of the SVG; knot + string fill the rest.
  const bRx = w * 0.46;
  const bRy = h * 0.31;
  const bCy = h * 0.32;
  const knotY  = bCy + bRy;            // bottom of body ellipse
  const knotH  = h * 0.07;
  const strBot = h * 0.98;

  return (
    <svg
      width={w} height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ overflow: "visible", display: "block" }}
    >
      {/* Soft drop shadow */}
      <ellipse cx={cx} cy={knotY + 6} rx={bRx * 0.6} ry={4} fill="rgba(0,0,0,0.18)" />

      {/* Body */}
      <ellipse cx={cx} cy={bCy} rx={bRx} ry={bRy} fill={color} />

      {/* Knot — small teardrop below body */}
      <path
        d={`M ${cx - w * 0.055} ${knotY - 2} Q ${cx} ${knotY + knotH} ${cx + w * 0.055} ${knotY - 2}`}
        fill={color}
      />

      {/* String — slight curve for life */}
      <path
        d={`M ${cx} ${knotY + knotH} Q ${cx + w * 0.18} ${knotY + knotH + (strBot - knotY) * 0.45} ${cx - w * 0.06} ${strBot}`}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />

      {/* Shine highlight */}
      <ellipse
        cx={cx - bRx * 0.30}
        cy={bCy - bRy * 0.32}
        rx={bRx * 0.22}
        ry={bRy * 0.28}
        fill="rgba(255,255,255,0.38)"
        transform={`rotate(-22 ${cx - bRx * 0.30} ${bCy - bRy * 0.32})`}
      />
    </svg>
  );
}

// ── Single balloon with idle bob + triggered float-up ─────────────────────────
interface BalloonProps {
  x: number; y: number; size: number; color: string;
  floatDelay: number; swayDur: number; swayDelay: number;
  floating: boolean;
}

function Balloon({ x, y, size, color, floatDelay, swayDur, swayDelay, floating }: BalloonProps) {
  // Outer div handles vertical translation (bob when idle, fly-up when triggered).
  // Inner div handles rotation (sway around the string bottom).
  return (
    <motion.div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        zIndex: 5,
        pointerEvents: "none",
      }}
      animate={floating
        ? { y: "-110vh" }
        : { y: ["0px", "-12px", "2px", "-8px", "0px"] }
      }
      transition={floating
        ? { duration: 0.95, delay: floatDelay, ease: [0.18, 0, 0.5, 1.15] }
        : { duration: swayDur, repeat: Infinity, ease: "easeInOut",
            repeatType: "loop", delay: swayDelay }
      }
    >
      <motion.div
        animate={floating
          ? { rotate: 0 }
          : { rotate: [-4, 4, -3, 5, -4] }
        }
        transition={floating
          ? { duration: 0.3 }
          : { duration: swayDur * 0.9, repeat: Infinity, ease: "easeInOut",
              repeatType: "loop", delay: swayDelay + 0.2 }
        }
        style={{ transformOrigin: "50% 100%" }}  // pivot at string bottom
      >
        <BalloonSvg color={color} size={size} />
      </motion.div>
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
    // After balloons clear + brief hero reveal → fade out → enter app
    setTimeout(() => setPhase("exiting"), 1700);
    setTimeout(finish, 2350);
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
        background: "#0e0a06",
      }}
    >
      {/* ── Hero image — always visible behind everything ── */}
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

      {/* ── Dark overlay — dims hero during balloon phase, fades when balloons fly ── */}
      <motion.div
        style={{ position: "absolute", inset: 0, zIndex: 2, background: "#0e0a06" }}
        animate={{ opacity: isFloating ? 0 : 0.72 }}
        transition={{ duration: isFloating ? 1.1 : 0, delay: isFloating ? 0.4 : 0, ease: "easeOut" }}
      />

      {/* ── Balloons ── */}
      {BALLOONS.map(b => (
        <Balloon key={b.id} {...b} floating={isFloating} />
      ))}

      {/* ── Bottom UI — subtitle + button, always above balloons ── */}
      <div
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          zIndex: 20,
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 14,
          padding: "20px 32px",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 52px)",
          background: "linear-gradient(to bottom, transparent, rgba(14,10,6,0.88) 38%)",
        }}
      >
        <motion.p
          animate={{ opacity: isFloating ? 0 : 1 }}
          transition={{ duration: 0.25 }}
          style={{
            fontSize: 11, fontWeight: 500,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "rgba(232,212,176,0.50)",
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
            background: "linear-gradient(to bottom, #E8D4B0, #B8894E)",
            border: "1.5px solid #B8894E",
            borderRadius: 100,
            padding: "13px 48px",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(120,80,40,0.45), 2px 2px 0 rgba(0,0,0,0.7)",
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
