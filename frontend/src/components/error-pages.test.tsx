// The custom 404 and error pages: what happened, one way forward, Title Case labels.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { titleCase } from "@/lib/format";
import NotFound from "@/app/not-found";
import RootError from "@/app/error";
import VcError from "@/app/vc/error";

const labels = () => [...document.querySelectorAll("h1, a, button")].map((el) => el.textContent ?? "");

describe("404 and error pages", () => {
  it("404 says what happened and offers one primary way back", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Page Not Found" })).toBeInTheDocument();
    const primary = document.querySelectorAll(".btn-primary");
    expect(primary).toHaveLength(1);
    expect(primary[0]).toHaveAttribute("href", "/");
    for (const l of labels()) expect(l).toBe(titleCase(l));
  });

  it("error pages offer Try Again, which resets", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const Page of [RootError, VcError]) {
      const reset = vi.fn();
      const { unmount } = render(<Page error={new Error("boom")} reset={reset} />);
      expect(screen.getByRole("heading", { name: "Something Went Wrong" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
      expect(reset).toHaveBeenCalled();
      for (const l of labels()) expect(l).toBe(titleCase(l));
      unmount();
    }
  });
});
