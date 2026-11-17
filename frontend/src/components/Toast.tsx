"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePresence } from "@/lib/motion";
import { CheckIcon, CloseIcon } from "./icons";

// "What happened" feedback after an action: one message at a time, announced
// politely to screen readers, with an optional link to where the result lives.
export interface ToastMessage {
  message: string;
  tone?: "success" | "error";
  href?: string;
  linkLabel?: string;
}

const ToastContext = createContext<(t: ToastMessage) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<(ToastMessage & { id: number }) | null>(null);
  // the last toast stays rendered while it animates out
  const [shown, setShown] = useState<(ToastMessage & { id: number }) | null>(null);
  useEffect(() => { if (toast) setShown(toast); }, [toast]);
  const { mounted, state } = usePresence(!!toast, 200);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const notify = useCallback((t: ToastMessage) => setToast({ ...t, id: Date.now() }), []);

  useEffect(() => {
    if (!toast) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), toast.href ? 9000 : 6000);
    return () => clearTimeout(timer.current);
  }, [toast]);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div data-print-hide className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4" role="status" aria-live="polite">
        {mounted && shown && (
          <div
            key={shown.id}
            data-testid="toast"
            className={`toast-${state} pointer-events-auto flex max-w-xl items-center gap-3 rounded-xl px-4 py-3 text-[15px] shadow-overlay ${
              shown.tone === "error" ? "bg-negative text-white" : "bg-ink text-white"
            }`}
          >
            {shown.tone !== "error" && (
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-positive text-white" aria-hidden>
                <CheckIcon size={14} className="check-draw" />
              </span>
            )}
            <span>{shown.message}</span>
            {shown.href && (
              <Link href={shown.href} onClick={() => setToast(null)} className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline">
                {shown.linkLabel ?? "Open"}
              </Link>
            )}
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="icon-btn -mr-1 h-8 w-8 text-white/70 hover:bg-white/10 hover:text-white">
              <CloseIcon size={14} />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
