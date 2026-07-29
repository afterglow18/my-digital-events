import React from "react";
import { Link, useLocation } from "wouter";
import { Sparkles, Bookmark, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetWardrobeStats } from "@/hooks/useLocalDB";

// Balloon icon — matches lucide's w/h + strokeWidth prop contract
function BalloonIcon({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Balloon body */}
      <ellipse cx="12" cy="9" rx="6" ry="7" />
      {/* Knot */}
      <path d="M10.5 16 Q12 17.5 13.5 16" />
      {/* String */}
      <path d="M12 17.5 Q13.5 19.5 11 22" />
      {/* Shine */}
      <ellipse cx="9.5" cy="6.5" rx="1.2" ry="1.8" opacity="0.4" fill="currentColor" stroke="none" transform="rotate(-20 9.5 6.5)" />
    </svg>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { data: stats } = useGetWardrobeStats();

  const wardrobeCount = stats?.byCategory
    ? stats.byCategory
        .filter((c: { category: string }) =>
          ["outfits", "beauty", "toiletries", "essentials"].includes(c.category),
        )
        .reduce((sum: number, c: { count: number }) => sum + c.count, 0)
    : undefined;

  const navItems = [
    { href: "/",         label: "Events",   icon: BalloonIcon, badge: wardrobeCount },
    { href: "/generate", label: "Generate", icon: Sparkles  },
    { href: "/saved",    label: "Saved",    icon: Bookmark  },
    { href: "/account",  label: "Settings", icon: Settings  },
  ];

  return (
    <div className="min-h-[100dvh] w-full flex bg-background">

      {/* ── Sidebar — iPad / tablet (md+) only ──────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col w-[200px] shrink-0 bg-white border-r-[3px] border-black h-[100dvh] sticky top-0 z-50"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* App wordmark */}
        <div className="px-5 py-5 border-b-[3px] border-black">
          <p className="font-display font-bold text-lg uppercase tracking-tighter leading-tight">
            My Digital<br />Events
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 flex flex-col gap-1 p-3 pt-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl border-2 transition-all font-bold text-sm uppercase tracking-wide relative select-none",
                  isActive
                    ? "bg-primary border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-x-px -translate-y-px"
                    : "border-transparent hover:bg-muted hover:border-black/20 active:scale-[0.97]",
                )}
              >
                <Icon
                  className="w-5 h-5 shrink-0"
                  strokeWidth={isActive ? 2.5 : 2}
                />
                <span>{item.label}</span>

                {/* Badge */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-auto bg-secondary text-black text-[10px] font-bold border-2 border-black min-w-[1.25rem] h-5 flex items-center justify-center rounded-full px-1 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content column ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col h-[100dvh] relative overflow-hidden">

        {/* Scrollable content — pb clears the bottom nav on mobile */}
        <main className="flex-1 overflow-y-auto pb-[90px] md:pb-0 relative">
          {children}
        </main>

        {/* Bottom nav — phone only ──────────────────────────────────────────── */}
        <nav className="md:hidden absolute bottom-0 left-0 right-0 bg-white border-t-[3px] border-black p-3 pb-safe z-[40]">
          <ul className="flex items-center justify-around">
            {navItems.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href} className="relative">
                  <Link href={item.href} className="flex flex-col items-center gap-1 group">
                    <div
                      className={cn(
                        "p-2.5 rounded-full border-2 transition-all duration-200 ease-spring relative",
                        isActive
                          ? "bg-primary border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] -translate-y-1"
                          : "bg-transparent border-transparent group-hover:bg-muted group-active:scale-95",
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-6 h-6",
                          isActive ? "text-black" : "text-muted-foreground",
                          item.href === "/generate" && isActive ? "animate-pulse" : "",
                        )}
                        strokeWidth={isActive ? 2.5 : 2}
                      />

                      {/* Badge */}
                      {item.badge !== undefined && item.badge > 0 && (
                        <div className="absolute -top-2 -right-2 bg-secondary text-black text-[10px] font-bold border-2 border-black w-5 h-5 flex items-center justify-center rounded-full shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                          {item.badge > 99 ? "99+" : item.badge}
                        </div>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider transition-colors",
                        isActive ? "text-black" : "text-muted-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
