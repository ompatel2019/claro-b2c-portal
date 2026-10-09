import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Calendar } from "./calendar";
afterEach(cleanup);
it("picks a labelled day and navigates across years", () => {
  const onChange = vi.fn();
  render(
    <Calendar
      label="Start date"
      value="2026-12-31"
      today="2026-10-09"
      onChange={onChange}
    />,
  );
  expect(screen.getByRole("button", { name: "2026-12-31" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Next month" }));
  expect(screen.getByText("January 2027")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "2027-01-02" }));
  expect(onChange).toHaveBeenCalledWith("2027-01-02");
});
