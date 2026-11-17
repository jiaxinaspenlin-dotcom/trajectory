// Server HTML is final: nothing the server renders waits on scripts to become
// visible. Entrance motion only applies after hydration, and never to what the
// server already rendered.
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import Landing from "@/app/page";
import { CountUp, Meter } from "@/components/ui";
import { markHydrated } from "@/lib/motion";

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("server HTML", () => {
  it("only animates entrances after hydration, and never what the server rendered", () => {
    const rules = [...css.matchAll(/([^{}]*\.animate-(?:rise|fade|page)[^{}]*)\{([^}]*)\}/g)].filter(([, , body]) => /animation\s*:\s*(?!none)/.test(body));
    expect(rules.length).toBe(3);
    for (const [, selector] of rules) {
      expect(selector.trim()).toMatch(/^html\[data-motion\] \.animate-\w+$/);
    }
  });

  it("renders the landing hero, bars and counts in their final state", () => {
    const html = renderToString(<><Landing /><Meter value={0.5} /><CountUp value={31} /></>);
    expect(html).toContain("Find, Screen, and Decide on Founders");
    expect(html).not.toMatch(/opacity:\s*0[;"]/);
    expect(html).toContain("scaleX(0.5)");
    expect(html).toMatch(/aria-hidden="true">31</);
  });

  it("finishes the entrances of what the server rendered, without touching the DOM", () => {
    document.body.innerHTML = `<h1 class="animate-rise">Hero</h1><div class="skeleton">Loading</div>`;
    const hero = { effect: { target: document.querySelector("h1") }, finish: vi.fn() };
    const pulse = { effect: { target: document.querySelector(".skeleton") }, finish: vi.fn() };
    const before = document.body.innerHTML;
    (document as { getAnimations?: () => unknown[] }).getAnimations = () => [hero, pulse];
    markHydrated();
    expect(document.documentElement).toHaveAttribute("data-motion");
    expect(hero.finish).toHaveBeenCalled();
    expect(pulse.finish).not.toHaveBeenCalled();
    expect(document.body.innerHTML).toBe(before);
    delete (document as { getAnimations?: unknown }).getAnimations;
    document.body.innerHTML = "";
  });
});
