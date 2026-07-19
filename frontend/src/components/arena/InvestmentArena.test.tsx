import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InvestmentArena } from "./InvestmentArena";
import { debate } from "@/test/fixtures";

describe("InvestmentArena", () => {
  it("renders bull, bear, referee and the recommendation", () => {
    render(<InvestmentArena debate={debate} />);
    expect(screen.getByTestId("arena-bull")).toBeInTheDocument();
    expect(screen.getByTestId("arena-bear")).toBeInTheDocument();
    expect(screen.getByTestId("arena-referee")).toBeInTheDocument();
    expect(screen.getByText("Continue Diligence")).toBeInTheDocument();
  });

  it("shows the bull speech bubble on hover", () => {
    render(<InvestmentArena debate={debate} />);
    fireEvent.mouseEnter(screen.getByTestId("arena-bull"));
    expect(screen.getByText("Momentum looks strong.")).toBeInTheDocument();
  });

  it("shows the speech bubble on keyboard focus (not hover-only)", () => {
    render(<InvestmentArena debate={debate} />);
    fireEvent.focus(screen.getByTestId("arena-bear"));
    expect(screen.getByText("Key claims unverified.")).toBeInTheDocument();
  });

  it("pins detailed analysis on click", () => {
    render(<InvestmentArena debate={debate} />);
    fireEvent.click(screen.getByTestId("arena-referee"));
    expect(screen.getByText("Referee Assessment")).toBeInTheDocument();
    expect(screen.getByText(/Independent traction data/)).toBeInTheDocument();
  });

  it("marks unverified points that lack evidence ids", () => {
    render(<InvestmentArena debate={debate} />);
    fireEvent.click(screen.getByTestId("arena-bear"));
    expect(screen.getByText("unverified")).toBeInTheDocument();
  });

  it("renders the empty state when the debate is missing", () => {
    render(<InvestmentArena debate={null} />);
    expect(screen.getByTestId("arena-empty")).toBeInTheDocument();
  });
});
