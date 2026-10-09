import { cleanup, render, screen, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarkingProgress } from "./marking-progress";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("announces mixed progress and completion, stopping when only failures remain", () => {
  vi.useFakeTimers();
  const { rerender } = render(
    <MarkingProgress done={18} total={21} marking={1} attention={2} />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "18 of 21 marked · 2 need attention. 1 still marking.",
  );
  act(() => vi.advanceTimersByTime(1500));
  expect(refresh).toHaveBeenCalledTimes(1);
  rerender(<MarkingProgress done={19} total={21} marking={0} attention={2} />);
  expect(screen.getByRole("status")).toHaveTextContent("Marking complete.");
  act(() => vi.advanceTimersByTime(10000));
  expect(refresh).toHaveBeenCalledTimes(1);
});
it("does not poll a settled sit", () => {
  vi.useFakeTimers();
  render(<MarkingProgress done={18} total={20} marking={0} attention={2} />);
  act(() => vi.advanceTimersByTime(10000));
  expect(refresh).not.toHaveBeenCalled();
});
it("backs off after 30 seconds and cancels polling on unmount", () => {
  vi.useFakeTimers();
  const { unmount } = render(
    <MarkingProgress done={1} total={3} marking={2} attention={0} />,
  );
  act(() => vi.advanceTimersByTime(33000));
  const calls = refresh.mock.calls.length;
  act(() => vi.advanceTimersByTime(4000));
  expect(refresh).toHaveBeenCalledTimes(calls + 1);
  unmount();
  act(() => vi.advanceTimersByTime(10000));
  expect(refresh).toHaveBeenCalledTimes(calls + 1);
});
