"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "jnv-install-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Registers the service worker and offers "Install app" (Android/desktop) or the Add-to-Home-Screen hint (iOS). */
export default function PwaInstall() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone || readDismissed()) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (isIos) {
      setIos(true);
      setHidden(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
      setHidden(false);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  async function install() {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    setEvt(null);
    if (outcome === "accepted") setHidden(true);
    else dismiss();
  }

  if (hidden || (!evt && !ios)) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-brand-900 p-3 pr-2 text-white shadow-2xl ring-1 ring-white/20" role="dialog" aria-label="Install app">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-500">
        {ios ? <Share className="h-5 w-5" /> : <Download className="h-5 w-5" />}
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug">
        {ios ? (
          <>Install this app: tap <b>Share</b>, then <b>Add to Home Screen</b>.</>
        ) : (
          <>Install <b>JNV Portal</b> on your phone for quick access.</>
        )}
      </p>
      {!ios && (
        <button onClick={install} className="shrink-0 rounded-lg bg-gold-500 px-3 py-2 text-sm font-bold transition active:scale-95">
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded-lg p-2 text-brand-200 hover:bg-white/10">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
