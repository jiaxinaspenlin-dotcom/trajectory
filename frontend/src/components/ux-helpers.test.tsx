import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { nextActionHref, shortlistOf } from "@/lib/pipeline";
import { ToastProvider, useToast } from "./Toast";

describe("next action links", () => {
  it("sends each next action to where it's done", () => {
    expect(nextActionHref(7, "review_recommendation")).toBe("/vc/opportunities/7#decision");
    expect(nextActionHref(7, "resolve_diligence")).toBe("/vc/opportunities/7/diligence");
    expect(nextActionHref(7, "generate_memo")).toBe("/vc/opportunities/7#arena");
    expect(nextActionHref(7, "run_analysis")).toBe("/vc/opportunities/7#next-step");
    expect(nextActionHref(7, "review_application")).toBe("/vc/opportunities/7#next-step");
    expect(nextActionHref(7, null)).toBe("/vc/opportunities/7#next-step");
  });
});

describe("shortlist vs stage", () => {
  it("is this browser's choice first, a shortlist status on the record second, never a stage", () => {
    expect(shortlistOf({ status: "prospect" }, "monitoring")).toBe("monitoring");
    expect(shortlistOf({ status: "saved" }, null)).toBe("saved");
    expect(shortlistOf({ status: "applied" }, null)).toBeNull();
    expect(shortlistOf({ status: "prospect" }, null)).toBeNull();
  });
});

function Fire() {
  const notify = useToast();
  return <button onClick={() => notify({ message: "Moved to Screening.", href: "/vc/pipeline", linkLabel: "View in Pipeline" })}>go</button>;
}

describe("toast", () => {
  it("announces what happened with a link to the result, and can be dismissed", () => {
    render(<ToastProvider><Fire /></ToastProvider>);
    fireEvent.click(screen.getByText("go"));
    const t = screen.getByTestId("toast");
    expect(t).toHaveTextContent("Moved to Screening.");
    expect(screen.getByRole("link", { name: "View in Pipeline" })).toHaveAttribute("href", "/vc/pipeline");
    expect(t.closest("[role=status]")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });
});
