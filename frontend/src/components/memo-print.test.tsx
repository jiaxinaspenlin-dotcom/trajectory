// Memo print: sections still waiting for their scroll reveal must print fully
// visible, and the controls around the memo must not print. jsdom does not
// evaluate @media, so the print block of globals.css is applied as if printing.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "2" }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/vc/opportunities/2/memo" }));
const fetched: Record<string, unknown> = {
  "/api/opportunities/2": { id: 2, company: { id: 2, name: "PayMesh", one_liner: "Payments API." }, founder: null, debate: null },
  "/api/opportunities/2/memo": {
    id: 1, version: 1, generated_by: "demo", recommended_action: "Monitor", confidence: 0.6,
    sections: [
      { key: "snapshot", title: "Company Snapshot", body: "Payments API.", evidence_ids: [], unavailable_label: null },
      { key: "traction", title: "Traction & KPIs", body: "850 users.", evidence_ids: [], unavailable_label: null },
      { key: "financials", title: "Financials & Round Structure", body: "Raising a seed round.", evidence_ids: [], unavailable_label: null },
    ],
  },
};
vi.mock("@/lib/useFetch", () => ({ useFetch: (url: string) => ({ data: fetched[url] ?? null, loading: false, error: null, reload: () => {} }) }));

// the stylesheet as a printer sees it: the screen rule for waiting reveals, then the print block
function printCss(): string {
  const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
  const start = css.indexOf("@media print {");
  let depth = 0, end = start;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) { end = i; break; }
  }
  const screenRule = css.match(/\.reveal-wait \{[^}]*\}/)![0];
  return `${screenRule}\n${css.slice(css.indexOf("{", start) + 1, end)}`;
}

const realRect = Element.prototype.getBoundingClientRect;
beforeAll(() => {
  // nothing has scrolled yet: every block sits below the fold and the observer never fires
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } } as never;
  Element.prototype.getBoundingClientRect = () => ({ top: 5000, bottom: 5400, left: 0, right: 800, width: 800, height: 400, x: 0, y: 5000, toJSON() {} }) as DOMRect;
});
afterAll(() => {
  delete (window as { IntersectionObserver?: unknown }).IntersectionObserver;
  Element.prototype.getBoundingClientRect = realRect;
});

describe("Memo print", () => {
  it("prints every section, including ones waiting for their reveal, without the controls", async () => {
    const style = document.createElement("style");
    style.textContent = printCss();
    document.head.appendChild(style);
    const { default: MemoPage } = await import("@/app/vc/opportunities/[id]/memo/page");
    render(<MemoPage />);

    const titles = ["Company Snapshot", "Traction & KPIs", "Financials & Round Structure", "Bull, Bear & Referee"];
    for (const t of titles) {
      const section = screen.getByRole("heading", { name: t }).closest("section")!;
      expect(section.className).toContain("reveal-wait"); // still waiting on screen
      const cs = getComputedStyle(section);
      expect(cs.opacity, t).toBe("1");
      expect(cs.transform, t).toBe("none");
      expect(cs.display, t).not.toBe("none");
    }
    // the page header's actions and its condensed copy
    for (const el of [...screen.getAllByText("Print / PDF"), ...screen.getAllByText("Regenerate Memo").map((e) => e.closest("button")!)]) {
      let hidden = false;
      for (let e: Element | null = el; e; e = e.parentElement) if (getComputedStyle(e).display === "none") hidden = true;
      expect(hidden).toBe(true);
    }
    style.remove();
  });
});
