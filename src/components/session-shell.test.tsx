import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (m: string) => toast(m) }));
vi.mock("./feedback-widget", () => ({ useFeedback: () => vi.fn() }));
import { isTyping, SessionShell } from "./session-shell";
afterEach(() => {
  cleanup();
  toast.mockClear();
});
beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes("1024"),
  })) as unknown as typeof window.matchMedia;
});

function shell(over: Partial<Parameters<typeof SessionShell>[0]> = {}) {
  const props = {
    title: "Multiple choice sprint · Inflation",
    position: 2,
    total: 8,
    answered: 3,
    saveState: "saved" as const,
    onRetry: vi.fn(),
    clock: { mode: "down" as const, seconds: 600 },
    onExit: vi.fn(),
    onFinish: vi.fn(),
    onMove: vi.fn(),
    booklet: <p>Booklet body</p>,
    children: <input aria-label="Answer" />,
    ...over,
  };
  return { props, ...render(<SessionShell {...props} />) };
}

it("shows position, progress and save state with a retry", () => {
  const { props } = shell({ saveState: "error" });
  expect(screen.getByText("Q 2 of 8")).toBeTruthy();
  expect(
    screen
      .getByRole("progressbar", { name: "Answered" })
      .getAttribute("aria-valuenow"),
  ).toBe("3");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(props.onRetry).toHaveBeenCalled();
});

it("colours the countdown, shows overtime and can hide the digits", () => {
  const { rerender, props } = shell({ clock: { mode: "down", seconds: 299 } });
  const t = screen.getByRole("button", { name: "Time remaining 4:59" });
  expect(t.className).toContain("text-warning");
  rerender(<SessionShell {...props} clock={{ mode: "down", seconds: 59 }} />);
  expect(
    screen.getByRole("button", { name: "Time remaining 0:59" }).className,
  ).toContain("text-destructive");
  expect(toast).toHaveBeenCalledWith("1 minute left");
  rerender(<SessionShell {...props} clock={{ mode: "down", seconds: -75 }} />);
  const over = screen.getByRole("button", { name: "1:15 over time" });
  expect(over.textContent).toBe("+1:15 over");
  fireEvent.click(over);
  expect(screen.getByRole("button", { name: "Show timer" })).toBeTruthy();
});

it("counts up muted in untimed mode", () => {
  shell({ clock: { mode: "up", seconds: 65 } });
  expect(
    screen.getByRole("button", { name: "Time used 1:05" }).className,
  ).toContain("text-muted-foreground");
});

it("moves with J/K and arrows but not while typing", () => {
  const { props } = shell();
  fireEvent.keyDown(window, { key: "k" });
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(vi.mocked(props.onMove).mock.calls).toEqual([[1], [-1]]);
  fireEvent.keyDown(screen.getByLabelText("Answer"), { key: "k" });
  expect(props.onMove).toHaveBeenCalledTimes(2);
});

it("toggles the booklet, calculator and shortcuts from the keyboard", async () => {
  shell();
  expect(screen.getByText("Booklet body")).toBeTruthy();
  act(() => void fireEvent.keyDown(window, { key: "b" }));
  expect(screen.queryByText("Booklet body")).toBeNull();
  act(() => void fireEvent.keyDown(window, { key: "c" }));
  expect(screen.getByRole("dialog", { name: "Calculator" })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole("dialog", { name: "Calculator" }), {
    key: "Escape",
  });
  expect(screen.queryByRole("dialog", { name: "Calculator" })).toBeNull();
  act(() => void fireEvent.keyDown(window, { key: "?" }));
  expect(await screen.findByText("Keyboard shortcuts")).toBeTruthy();
});

it("lets a handled key (an MC letter) win over the shell shortcut", () => {
  shell();
  const e = new KeyboardEvent("keydown", { key: "b", cancelable: true });
  e.preventDefault();
  window.dispatchEvent(e);
  expect(screen.getByText("Booklet body")).toBeTruthy();
});

it("treats text fields as typing but not radio cards", () => {
  const text = document.createElement("textarea");
  const radio = Object.assign(document.createElement("input"), {
    type: "radio",
  });
  expect(isTyping(text)).toBe(true);
  expect(isTyping(radio)).toBe(false);
});

it("shows flashcard position and known count without the sprint tools", () => {
  shell({
    flashcards: { known: 5, shortcuts: [["L", "List view"]] },
    position: 7,
    total: 20,
    answered: 6,
    clock: { mode: "up", seconds: 42 },
  });
  expect(screen.getByText("Card 7 of 20")).toBeVisible();
  expect(screen.getByText("Knew 5")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Booklet (B)" })).toBeNull();
  expect(screen.queryByText("Booklet body")).toBeNull();
  expect(screen.getByRole("button", { name: "Time used 0:42" })).toBeVisible();
});

it("ignores J/K in flashcards while preserving arrow navigation", () => {
  const { props } = shell({ flashcards: { known: 0, shortcuts: [] } });
  for (const key of ["j", "J", "k", "K"]) fireEvent.keyDown(window, { key });
  expect(props.onMove).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(props.onMove).toHaveBeenCalledWith(1);
});

it("warns papers at thirty minutes and keeps Finish visible", () => {
  const { rerender, props } = shell({
    clock: { mode: "down", seconds: 1801, paper: true },
  });
  rerender(
    <SessionShell
      {...props}
      clock={{ mode: "down", seconds: 1800, paper: true }}
    />,
  );
  expect(toast).toHaveBeenCalledWith("30 minutes left");
  expect(screen.getByRole("button", { name: "Finish" })).toBeVisible();
});

it("renders a read-only booklet without marking, saving or timer controls", () => {
  const onExit = vi.fn();
  render(
    <SessionShell
      readOnly
      title="Paper preview"
      onExit={onExit}
      booklet={<p>Sections</p>}
    >
      <p>Question text</p>
    </SessionShell>,
  );
  expect(screen.getByText("Question text")).toBeTruthy();
  for (const name of [
    "Finish",
    "Save and exit",
    "Calculator (C)",
    "Send feedback",
  ])
    expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  fireEvent.keyDown(window, { key: "c" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
  expect(onExit).toHaveBeenCalledOnce();
});
