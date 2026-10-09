import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/spend",
  useSearchParams: () => new URLSearchParams("tab=x&range=all&from=old&to=old"),
}));
import { RangeSelect } from "./range-select";

afterEach(() => {
  cleanup();
  push.mockClear();
});
async function choose(label: string) {
  fireEvent.click(screen.getByRole("combobox", { name: "Date range" }));
  const option = await screen.findByRole("option", {
    name: label,
  });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}
it("presets clear stale dates, preserve other params and omit the month default", async () => {
  render(<RangeSelect range="all" />);
  expect(screen.getByRole("combobox")).toHaveTextContent("All time");
  for (const [label, url] of [
    ["Last 30 days", "/admin/spend?tab=x&range=30"],
    ["This month", "/admin/spend?tab=x"],
    ["All time", "/admin/spend?tab=x&range=all"],
  ]) {
    await choose(label);
    expect(push).toHaveBeenLastCalledWith(url);
  }
});
it("custom dates use labelled native inputs and navigate only when applied", async () => {
  render(<RangeSelect range="month" />);
  await choose("Custom");
  expect(push).not.toHaveBeenCalled();
  const from = screen.getByLabelText("From"),
    to = screen.getByLabelText("To");
  expect(from).toHaveAttribute("type", "date");
  expect(from).toBeRequired();
  fireEvent.change(from, { target: { value: "2026-10-01" } });
  fireEvent.change(to, { target: { value: "2026-10-09" } });
  expect(from).toHaveAttribute("max", "2026-10-09");
  expect(to).toHaveAttribute("min", "2026-10-01");
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(push).toHaveBeenCalledWith(
    "/admin/spend?tab=x&range=custom&from=2026-10-01&to=2026-10-09",
  );
});
it("reflects custom URL dates on arrival", () => {
  render(<RangeSelect range={{ from: "2026-09-01", to: "2026-09-30" }} />);
  expect(screen.getByRole("combobox")).toHaveTextContent("Custom");
  expect(screen.getByLabelText("From")).toHaveValue("2026-09-01");
  expect(screen.getByLabelText("To")).toHaveValue("2026-09-30");
});
