import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThreeAxes } from "./ThreeAxes";
import { MomentumChart } from "./MomentumChart";
import { GuidedTour, DASHBOARD_TOUR } from "./GuidedTour";
import { assessment, momentum } from "@/test/fixtures";

vi.mock("@/lib/api", () => ({ api: { put: vi.fn().mockResolvedValue({}) } }));

describe("ThreeAxes", () => {
  it("renders all three axes independently without averaging", () => {
    render(<ThreeAxes assessment={assessment} />);
    expect(screen.getByText("Founder")).toBeInTheDocument();
    expect(screen.getByText("Market")).toBeInTheDocument();
    expect(screen.getByText("Idea vs Market")).toBeInTheDocument();
    // three distinct display scores present
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText(/not averaged/i)).toBeInTheDocument();
  });
});

describe("MomentumChart", () => {
  it("shows current score, 30-day change and trajectory label", () => {
    render(<MomentumChart momentum={momentum} />);
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("+15")).toBeInTheDocument();
    expect(screen.getByText("Accelerating")).toBeInTheDocument();
    expect(screen.getByText(/release frequency increased/i)).toBeInTheDocument();
  });
});

describe("GuidedTour", () => {
  it("progresses Next → Back and shows step counter", () => {
    const n = DASHBOARD_TOUR.length;
    render(<GuidedTour steps={DASHBOARD_TOUR} open onClose={() => {}} />);
    expect(screen.getByText(`1 / ${n}`)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("tour-next"));
    expect(screen.getByText(`2 / ${n}`)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("tour-back"));
    expect(screen.getByText(`1 / ${n}`)).toBeInTheDocument();
  });

  it("calls onClose when skipped", () => {
    const onClose = vi.fn();
    render(<GuidedTour steps={DASHBOARD_TOUR} open onClose={onClose} />);
    fireEvent.click(screen.getByTestId("tour-skip"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not render when closed", () => {
    render(<GuidedTour steps={DASHBOARD_TOUR} open={false} onClose={() => {}} />);
    expect(screen.queryByTestId("tour-card")).not.toBeInTheDocument();
  });
});
