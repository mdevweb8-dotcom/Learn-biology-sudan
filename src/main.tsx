import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // autoUpdate reloads automatically on activation without disrupting active study
    },
    onOfflineReady() {
      // App shell and biology curriculum assets are cached locally for 100% offline use
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
