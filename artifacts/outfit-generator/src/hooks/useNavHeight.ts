import { useEffect, useState } from "react";

/**
 * Returns the bottom-nav height (px) that full-bleed pages (wardrobe, generate)
 * should subtract from 100dvh to leave room for the navigation.
 *
 * On tablet / iPad (≥ 768 px) the nav becomes a sidebar, so bottom clearance is 0.
 * On phone (< 768 px) the bottom nav is 90 px tall.
 */
export function useNavHeight(): number {
  const [tablet, setTablet] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setTablet(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return tablet ? 0 : 90;
}
