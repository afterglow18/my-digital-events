import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeRevenueCat } from './lib/revenuecat';

// Kick off RC initialisation before React mounts so the SDK is ready
// by the time any component calls useSubscription().
initializeRevenueCat().catch((err) =>
  console.warn("[RevenueCat] Init error (non-fatal):", err)
);

createRoot(document.getElementById('root')!).render(<App />);
