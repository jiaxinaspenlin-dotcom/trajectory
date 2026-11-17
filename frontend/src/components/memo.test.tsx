// Memo: stored values in prose are shown readably, and sections with nothing
// yet are listed once instead of repeating a placeholder.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoView } from "./MemoView";
import { memoText } from "@/lib/memo";

describe("memo", () => {
  it("never shows a raw stored status", () => {
    expect(memoText("The company has 850 monthly active users. (status: founder_reported, trust 42).")).toBe(
      "The company has 850 monthly active users. (Founder-Reported, trust 42)."
    );
    expect(memoText("Revenue claim (status: verified).")).toBe("Revenue claim (Verified).");
  });

  it("shows covered sections as a document and names the rest once", () => {
    render(<MemoView memo={{
      id: 1, version: 1, generated_by: "demo", recommended_action: "Monitor", confidence: 0.65,
      sections: [
        { key: "snapshot", title: "Company Snapshot", body: "Payments API.", evidence_ids: [12], unavailable_label: null },
        { key: "traction", title: "Traction & KPIs", body: "850 users. (status: founder_reported, trust 42)", evidence_ids: [5], unavailable_label: null },
      ],
    } as never} />);
    expect(screen.getByRole("heading", { name: "Company Snapshot" })).toBeInTheDocument();
    expect(screen.getByText("850 users. (Founder-Reported, trust 42)")).toBeInTheDocument();
    expect(screen.queryByText(/status: founder_reported/)).toBeNull();
    const missing = screen.getByTestId("memo-missing");
    expect(missing).toHaveTextContent("Team & History");
    expect(missing).toHaveTextContent("Exit Perspective");
    // the placeholder sentence appears once, not per section
    expect(screen.getAllByText(/Regenerate the memo to populate/)).toHaveLength(1);
  });
});
