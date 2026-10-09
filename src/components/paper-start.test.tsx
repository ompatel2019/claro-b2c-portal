import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { PaperStart } from "./paper-start";
import { startPaper } from "@/app/(focus)/student/papers/[id]/actions";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(focus)/student/papers/[id]/actions", () => ({
  startPaper: vi.fn(),
}));
const paper = {
  id: "p",
  title: "Mock paper",
  source: "HSC",
  year: 2024,
  time_limit_min: 180,
  total_marks: 100,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(startPaper).mockResolvedValue({ id: "sit" });
});
it("defaults reading on and displays rules and sections", () => {
  render(
    <PaperStart
      paper={paper}
      sections={[
        {
          name: "Section III",
          types: ["extended"],
          total: 1,
          questions: 2,
          aboutMin: 35,
          answered: 0,
          marks: 20,
          units: [{ positions: [24, 25], marks: 20, answered: false }],
        },
      ]}
    />,
  );
  expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText(/Photo answers up to 8/)).toBeVisible();
  expect(screen.getByText(/answer 1 of 2/)).toBeVisible();
});
it("starts only after confirmation, with the reading preference", async () => {
  render(<PaperStart paper={paper} sections={[]} />);
  fireEvent.click(screen.getByRole("switch"));
  fireEvent.click(screen.getByRole("button", { name: "Start paper" }));
  expect(startPaper).not.toHaveBeenCalled();
  expect(await screen.findByRole("alertdialog")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /^Start$/ }));
  await waitFor(() => expect(startPaper).toHaveBeenCalledWith("p", false));
});
it("retains an inline error for a failed start", async () => {
  vi.mocked(startPaper).mockResolvedValue({
    error: "Could not start your paper. Try again.",
  });
  render(<PaperStart paper={paper} sections={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Start paper" }));
  fireEvent.click(await screen.findByRole("button", { name: /^Start$/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not start your paper. Try again.",
  );
  expect(screen.getAllByRole("alert")).toHaveLength(1);
});

afterEach(() => cleanup());
