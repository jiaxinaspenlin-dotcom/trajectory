"use client";

// Motion hooks shared by every page (the CSS half lives in app/globals.css).
// Each one degrades to "show the final state now" when the browser lacks
// IntersectionObserver (tests, old browsers) or the user prefers reduced motion.

import { RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

// useLayoutEffect on the client, nothing on the server (no SSR warning)
export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const canObserve = () => typeof window !== "undefined" && "IntersectionObserver" in window;

// Server HTML is final: whatever the server rendered shows fully, without waiting
// for scripts. Entrance motion switches on once the first page has hydrated
// (MotionReady sets data-motion on <html>), and only for content that mounts after
// that: data arriving, a page navigated to, a panel opened.
let hydrated = false;
export const isHydrated = () => hydrated;
export const ENTRANCE = ".animate-rise, .animate-fade, .animate-page";
export function markHydrated() {
  document.documentElement.setAttribute("data-motion", "");
  // What the server rendered has already arrived: its entrances (which start now)
  // finish at once, before the next paint. Nothing in the DOM is touched, so parts
  // of the page that hydrate later (Suspense) still match the server HTML.
  for (const a of document.getAnimations?.() ?? []) {
    const target = (a.effect as KeyframeEffect | null)?.target;
    if (target instanceof Element && target.matches(ENTRANCE)) a.finish();
  }
  hydrated = true;
}

// Reveal an element the first time it scrolls into view, once. Elements already
// on screen when they mount are left alone (no flash); those below the fold are
// hidden until they arrive, then fade and rise.
export function useReveal<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !canObserve() || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return;
    el.classList.add("reveal-wait");
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      el.classList.replace("reveal-wait", "reveal-in");
      io.disconnect();
    }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

// True once the element has been on screen (stays true). Starts true, as the
// server renders it; only something mounted after hydration starts empty and fills
// in when seen.
export function useSeen<T extends HTMLElement>(): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(true);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !canObserve() || !isHydrated() || prefersReducedMotion()) return;
    setSeen(false);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { rootMargin: "0px 0px -5% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen];
}

// A number that counts up from zero the first time it is seen. The final value is
// what renders on the server, in tests and under reduced motion, and stays put for
// numbers already in the server HTML.
export function useCountUp(value: number, ms = 500): [RefObject<HTMLSpanElement>, number] {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const done = useRef(false);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (done.current || !el || !canObserve() || !isHydrated() || prefersReducedMotion() || !Number.isFinite(value) || value === 0) {
      setShown(value);
      return;
    }
    setShown(0);
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(value * eased);
        if (t < 1) raf = requestAnimationFrame(tick);
        else done.current = true;
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); setShown(value); };
  }, [value, ms]);
  return [ref, shown];
}

// Keep an overlay mounted while it animates out. `state` drives the CSS class:
// "enter" while open, "exit" for `ms` after closing, then unmounted.
export function usePresence(open: boolean, ms = 200): { mounted: boolean; state: "enter" | "exit" } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    if (!mounted) return;
    if (prefersReducedMotion()) { setMounted(false); return; }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, mounted, ms]);
  return { mounted: open || mounted, state: open ? "enter" : "exit" };
}

// True once the page has scrolled past `offset` px (sticky header condenses).
export function useScrolled(offset = 8): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setScrolled(window.scrollY > offset)); };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, [offset]);
  return scrolled;
}

// A short-lived flag for success moments ("Saved" with a check, then back).
export function useFlash(ms = 1800): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  return [on, () => { clearTimeout(timer.current); setOn(true); timer.current = setTimeout(() => setOn(false), ms); }];
}

// Position of the selected item in a row of items (sliding tab or nav indicator).
// Returns a transform for a 1px-wide bar, so only transform animates.
export function useIndicator(container: RefObject<HTMLElement>, selector: string, deps: unknown[]): { x: number; w: number; y: number; h: number } | null {
  const [box, setBox] = useState<{ x: number; w: number; y: number; h: number } | null>(null);
  useIsoLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el) { setBox(null); return; }
      // relative to the container itself (offsetLeft/Top would be relative to the
      // nearest positioned ancestor, which may be the item's own wrapper)
      const c = root.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setBox({ x: r.left - c.left + root.scrollLeft, w: el.offsetWidth, y: r.top - c.top + root.scrollTop, h: el.offsetHeight });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return box;
}
