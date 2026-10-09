import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DailyChart } from "./daily-chart";

afterEach(cleanup);
it("stacks model spend with a text legend, Sydney titles and a keyboard day control", () => {
  const { container } = render(
    <DailyChart
      title="Spend per day"
      hero="$3.00"
      kind="bars"
      points={[
        { day: "2026-10-01", value: 3, models: { Alpha: 1, Beta: 2 } },
        { day: "2026-10-02", value: 0, models: {} },
      ]}
    />,
  );
  expect(screen.getByRole("img")).toHaveAccessibleName(
    "Spend per day, Sydney dates, stacked by model",
  );
  expect(screen.getByRole("list", { name: "Models" })).toHaveTextContent(
    "AlphaBeta",
  );
  const bars = container.querySelectorAll("rect");
  expect(bars).toHaveLength(4);
  expect(bars[0].querySelector("title")).toHaveTextContent(
    "1 Oct 2026 (Sydney) · Alpha: $1.00",
  );
  // Stacked segments touch and together reach the day's total.
  expect(
    Number(bars[1].getAttribute("y")) + Number(bars[1].getAttribute("height")),
  ).toBeCloseTo(Number(bars[0].getAttribute("y")));
  fireEvent.change(
    screen.getByRole("combobox", { name: "Spend per day day" }),
    { target: { value: "2026-10-01" } },
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "$3.00Alpha: $1.00Beta: $2.00",
  );
  fireEvent.mouseEnter(bars[2].parentElement!);
  expect(screen.getByRole("status")).toHaveTextContent(
    "$0.00Alpha: $0.00Beta: $0.00",
  );
});
it("keeps dashboard area and unstacked spend charts working", () => {
  const { container } = render(
    <DailyChart
      title="Sessions per day"
      hero="3"
      kind="area"
      points={[
        { day: "2026-10-01", value: 1 },
        { day: "2026-10-02", value: 2 },
      ]}
    />,
  );
  expect(container.querySelectorAll("path")).toHaveLength(2);
  expect(screen.queryByRole("list")).toBeNull();
  cleanup();
  render(
    <DailyChart
      title="AI spend per day"
      hero="$1.00"
      kind="bars"
      points={[{ day: "2026-10-01", value: 1 }]}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("$1.00");
});
