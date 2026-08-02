import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeRevenueCat } from './lib/revenuecat';
import { startVisionIndexer } from './lib/visionIndexer';

// Kick off RC initialisation before React mounts so the SDK is ready
// by the time any component calls useSubscription().
initializeRevenueCat()
  .catch((err) => console.warn("[RevenueCat] Init error (non-fatal):", err))
  .finally(() => {
    // Start the background vision indexer after RC is done (or has failed).
    // Runs canvas colour extraction on every wardrobe photo that hasn't been
    // indexed yet, so search-by-colour works offline with no backend required.
    startVisionIndexer();
  });

createRoot(document.getElementById('root')!).render(<App />);
