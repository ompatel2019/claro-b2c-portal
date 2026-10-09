import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  query: "range=90&kind=sprint",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/student/progress",
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
import { ProgressControls } from "./progress-controls";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = "range=90&kind=sprint";
});
afterEach(cleanup);
it("reflects history filters in the URL while preserving the range", () => {
  render(<ProgressControls range="90" filters />);
  fireEvent.click(screen.getByRole("button", { name: "MC" }));
  expect(mocks.replace).toHaveBeenCalledWith(
    "/student/progress?range=90&kind=sprint&type=mcq",
    { scroll: false },
  );
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  expect(mocks.replace).toHaveBeenLastCalledWith("/student/progress?range=90", {
    scroll: false,
  });
});
it("uses the page range selector to refresh all range-scoped cards", async () => {
  render(<ProgressControls range="90" />);
  fireEvent.click(screen.getByRole("combobox", { name: "Progress range" }));
  const option = await screen.findByRole("option", { name: "This year" });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
  expect(mocks.replace).toHaveBeenCalledWith(
    "/student/progress?range=year&kind=sprint",
    { scroll: false },
  );
});

it("clears active chart filters while preserving the range and table sorting", () => {
  mocks.query = "range=year&kind=sprint&type=short&topicsSort=pct%3Adesc";
  render(<ProgressControls range="year" filters />);
  fireEvent.click(screen.getByRole("button", { name: "Clear (2)" }));
  expect(mocks.replace).toHaveBeenCalledWith(
    "/student/progress?range=year&topicsSort=pct%3Adesc",
    { scroll: false },
  );
});
