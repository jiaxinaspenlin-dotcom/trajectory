"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CloseIcon } from "./icons";

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
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4" role="status" aria-live="polite">
        {toast && (
          <div
            key={toast.id}
            data-testid="toast"
            className={`pointer-events-auto flex max-w-xl items-center gap-3 rounded-lg px-4 py-3 text-[15px] shadow-overlay ${
              toast.tone === "error" ? "bg-negative text-white" : "bg-ink text-white"
            }`}
          >
            <span>{toast.message}</span>
            {toast.href && (
              <Link href={toast.href} onClick={() => setToast(null)} className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline">
                {toast.linkLabel ?? "Open"}
              </Link>
            )}
            <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded text-white/70 hover:text-white">
              <CloseIcon size={14} />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
