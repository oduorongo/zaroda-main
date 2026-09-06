'use client';
// Prompts a visitor to install ZARODA SMS as an app (PWA). Registers the service
// worker (required before Chrome/Edge/Android will ever fire beforeinstallprompt),
// then shows a small dismissible banner — either the native "Install" button on
// Chromium browsers, or manual Add-to-Home-Screen steps on iOS Safari, which has
// no install-prompt API at all.
import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

const DISMISS_KEY = 'zaroda-install-prompt-dismissed';
const DISMISS_DAYS = 14; // re-offer after this many days, in case they change their mind

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true; // iOS Safari's own flag
}

function isIos() {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function wasDismissedRecently() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const days = (Date.now() - Number(raw)) / 86400000;
  return days < DISMISS_DAYS;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return;

    const onBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS Safari never fires beforeinstallprompt — show manual instructions instead,
    // but only once the visitor is a bit into the app, not on their very first load.
    if (isIos()) {
      const t = setTimeout(() => { setShowIosHint(true); setVisible(true); }, 15000);
      return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', onBeforeInstall); };
    }
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[100] bg-[#1a2e5a] text-white rounded-2xl shadow-2xl p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
        {showIosHint ? <Share size={18} className="text-[#d4af37]"/> : <Download size={18} className="text-[#d4af37]"/>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm">Install ZARODA SMS</p>
        {showIosHint ? (
          <p className="text-xs text-white/70 mt-0.5">Tap the Share icon, then "Add to Home Screen" — for one-tap access, offline-friendly loading, and no browser bar.</p>
        ) : (
          <p className="text-xs text-white/70 mt-0.5">Add it to your home screen for one-tap access, like a native app.</p>
        )}
        {!showIosHint && (
          <button onClick={install} className="mt-2 text-xs font-bold bg-[#d4af37] text-[#0f1c38] px-3 py-1.5 rounded-lg">
            Install
          </button>
        )}
      </div>
      <button onClick={dismiss} className="text-white/50 hover:text-white flex-shrink-0"><X size={16}/></button>
    </div>
  );
}
