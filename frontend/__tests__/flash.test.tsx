import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WatchlistRow from "@/components/WatchlistRow";

function renderRow(price: number | undefined) {
  return (
    <table>
      <tbody>
        <WatchlistRow
          ticker="AAPL"
          price={price}
          baseline={100}
          points={[]}
          selected={false}
          onSelect={() => {}}
          onRemove={() => {}}
        />
      </tbody>
    </table>
  );
}

describe("price flash", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does not flash on the first price", () => {
    render(renderRow(100));
    const cell = screen.getByTestId("price-AAPL");
    expect(cell.className).not.toMatch(/flash-(up|down)/);
  });

  it("flashes green on an uptick, then clears", () => {
    const { rerender } = render(renderRow(100));
    rerender(renderRow(101));
    const cell = screen.getByTestId("price-AAPL");
    expect(cell).toHaveClass("flash-up");
    act(() => vi.advanceTimersByTime(600));
    expect(cell).not.toHaveClass("flash-up");
  });

  it("flashes red on a downtick", () => {
    const { rerender } = render(renderRow(100));
    rerender(renderRow(99));
    expect(screen.getByTestId("price-AAPL")).toHaveClass("flash-down");
  });

  it("shows Chg % against the baseline", () => {
    render(renderRow(105));
    expect(screen.getByTestId("change-AAPL")).toHaveTextContent("+5.00%");
  });
});
