// Landing "How It Works": the pinned heading, the stage bar and the lit card
// always name the same step, decided by where the cards are now — including a
// jump straight to the end, where no card crosses the middle of the screen.
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import Landing from "@/app/page";

let tops = [0, 0, 0];
const realRect = Element.prototype.getBoundingClientRect;
afterEach(() => { cleanup(); Element.prototype.getBoundingClientRect = realRect; });

function placeCards(next: number[]) {
  tops = next;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const step = this.getAttribute("data-step");
    const top = step === null ? 0 : tops[Number(step)];
    return { top, bottom: top + 300, left: 0, right: 600, width: 600, height: 300, x: 0, y: top, toJSON() {} } as DOMRect;
  };
}

async function scrollTo(next: number[]) {
  placeCards(next);
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

function shown() {
  const section = screen.getByRole("heading", { name: "How It Works" }).closest("section")!;
  const heading = section.querySelector("p.text-title")!.textContent;
  const bar = [...section.querySelectorAll("ol[aria-hidden] li")].map((li) => (li.querySelector(".font-semibold") ? 1 : 0)).join("");
  const lit = [...section.querySelectorAll("li[data-step]")].findIndex((li) => li.firstElementChild!.className.includes("bg-brand-wash"));
  return { heading, bar, lit };
}

describe("Landing How It Works", () => {
  it("keeps the heading, the bar and the lit card on the same step", async () => {
    // innerHeight is 768 in jsdom: the middle is 384
    placeCards([900, 1400, 1900]);
    render(<Landing />);
    await scrollTo([900, 1400, 1900]);
    expect(shown()).toEqual({ heading: "01Sourcing", bar: "1000", lit: 0 });
    await scrollTo([-200, 300, 800]);
    expect(shown()).toEqual({ heading: "02Screening & Diligence", bar: "0110", lit: 1 });
    // the end of the page: card 3 is on screen above the middle, card 2 long gone
    await scrollTo([-1028, -546, -64]);
    expect(shown()).toEqual({ heading: "03Decision", bar: "0001", lit: 2 });
    // and straight back to the top
    await scrollTo([900, 1400, 1900]);
    expect(shown()).toEqual({ heading: "01Sourcing", bar: "1000", lit: 0 });
  });
});
