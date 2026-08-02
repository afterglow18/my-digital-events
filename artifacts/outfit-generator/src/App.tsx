import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Redirect, Router as WouterRouter } from 'wouter';
import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLayout } from './components/layout/AppLayout';
import WardrobePage from './pages/wardrobe';
import GeneratePage from './pages/generate';
import SavedPage from './pages/saved';
import FavoritesPage from './pages/favorites';
import AccountPage from './pages/account';
import WelcomePage from './pages/welcome';
import { SubscriptionProvider } from '@/lib/revenuecat';
import { queryClient } from '@/lib/queryClient';
import { BiometricLockProvider } from '@/context/BiometricLockContext';
import { VISION_STATUS_EVENT } from '@/lib/visionIndexer';

// ── First-launch welcome ──────────────────────────────────────────────────────
const ENTERED_KEY = "events-entered";

function hasEntered(): boolean {
  try {
    return (
      sessionStorage.getItem(ENTERED_KEY) === "1" ||
      new URLSearchParams(window.location.search).get("preview") === "1"
    );
  } catch {
    return false;
  }
}

function markEntered() {
  try { sessionStorage.setItem(ENTERED_KEY, "1"); } catch {}
}

// ── Vision indexer toast ──────────────────────────────────────────────────────
// Pill at top-center: spinner appears first, text pushes in 600 ms later.
function VisionToast() {
  const [visible,  setVisible]  = useState(false);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    let textTimer: ReturnType<typeof setTimeout>;
    const onStatus = (e: Event) => {
      const { status } = (e as CustomEvent<{ status: "running" | "idle" }>).detail;
      if (status === "running") {
        setVisible(true);
        textTimer = setTimeout(() => setShowText(true), 600);
      } else {
        setShowText(false);
        setVisible(false);
      }
    };
    window.addEventListener(VISION_STATUS_EVENT, onStatus);
    return () => {
      window.removeEventListener(VISION_STATUS_EVENT, onStatus);
      clearTimeout(textTimer);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="vision-toast"
          initial={{ opacity: 0, y: -32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -32 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-[200] pointer-events-none
                     flex items-center gap-2 overflow-hidden
                     bg-white shadow-md border border-black/10 rounded-b-2xl
                     px-4 py-2.5"
          style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
        >
          {/* Spinner — always visible while toast is open */}
          <div className="w-3.5 h-3.5 rounded-full border-2 border-black/20 border-t-black/70 animate-spin flex-shrink-0" />

          {/* Text — pushed in 600 ms after spinner appears */}
          <AnimatePresence>
            {showText && (
              <motion.span
                key="vision-toast-text"
                initial={{ opacity: 0, maxWidth: 0 }}
                animate={{ opacity: 1, maxWidth: 220 }}
                exit={{ opacity: 0, maxWidth: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="text-[11px] font-bold uppercase tracking-widest text-black/70
                           whitespace-nowrap overflow-hidden"
              >
                Preparing photo search…
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────
function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/"         component={WardrobePage}  />
        <Route path="/generate" component={GeneratePage}  />
        <Route path="/saved"    component={SavedPage}     />
        <Route path="/favorites" component={FavoritesPage} />
        <Route path="/account"  component={AccountPage}   />
        <Redirect to="/" />
      </Switch>
    </AppLayout>
  );
}

// ── App shell — shows welcome on first session, then the app ─────────────────
function AppShell() {
  const [entered, setEntered] = useState<boolean>(hasEntered);

  const handleEnter = useCallback(() => {
    markEntered();
    setEntered(true);
  }, []);

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      {/* Router always rendered so wardrobe is ready when welcome unmounts */}
      <Router />
      {!entered && <WelcomePage onEnter={handleEnter} />}
      <VisionToast />
    </WouterRouter>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SubscriptionProvider>
        <BiometricLockProvider>
          <AppShell />
        </BiometricLockProvider>
      </SubscriptionProvider>
    </QueryClientProvider>
  );
}

export default App;
