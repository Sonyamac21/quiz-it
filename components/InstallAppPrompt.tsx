"use client";

import { useEffect, useState } from "react";

// Add to Home Screen is how Quiz-It gets out of the browser - launching from
// that home-screen icon hides the address bar entirely (manifest.json's
// "display": "standalone" already handles this), but nobody finds that
// setting on their own, and the steps differ by platform. This surfaces it
// once, in plain language, and stays out of the way once installed or
// dismissed.
//
// Detected via a BeforeInstallPromptEvent type that isn't in the standard
// lib.dom.d.ts yet.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "quizit:install-prompt-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ reports as a Mac in the user agent but is touch-capable and
  // has no install-prompt event support, so it needs the same manual
  // Share-sheet instructions as iPhone.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function InstallAppPrompt({ label = "team" }: { label?: string }) {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "other">("other");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // Already installed - nothing to offer.
    if (typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === "1") return;
    setPlatform(isIOS() ? "ios" : "other");
    setVisible(true);
    // Chrome/Android/Edge fire this instead of navigating away immediately,
    // which is what makes a real one-tap "Install" button possible there.
    // Safari/iOS never fires it - that path always falls back to the
    // Share-sheet instructions below.
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    function onInstalled() { dismiss(); }
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    setVisible(false);
    try { window.localStorage.setItem(DISMISS_KEY, "1"); } catch { /* best-effort */ }
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setInstalling(false);
      setDeferredPrompt(null);
      dismiss();
    }
  }

  if (!visible) return null;

  return (
    <div className="qi-install-prompt" role="note">
      <div className="qi-install-prompt__text">
        <strong>Keep {label} on your home screen</strong>
        <span>
          {platform === "ios"
            ? "No browser bar, no re-typing the code next time. Tap the Share icon below, then “Add to Home Screen”."
            : deferredPrompt
            ? "No browser bar, no re-typing the code next time. Install it like an app - takes one tap."
            : "No browser bar, no re-typing the code next time. Open your browser menu and choose “Add to Home Screen” or “Install app”."}
        </span>
      </div>
      <div className="qi-install-prompt__actions">
        {deferredPrompt && platform !== "ios" && (
          <button type="button" onClick={handleInstallClick} disabled={installing} className="qi-install-prompt__install">
            {installing ? "Installing…" : "Install"}
          </button>
        )}
        <button type="button" onClick={dismiss} className="qi-install-prompt__dismiss" aria-label="Dismiss">
          {"×"}
        </button>
      </div>
    </div>
  );
}
