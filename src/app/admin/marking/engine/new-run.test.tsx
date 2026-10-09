import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PRICES } from "@/lib/ai/prices";
import { NewRun } from "./new-run";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  start: vi.fn(),
  step: vi.fn(),
  dialogData: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("./actions", () => ({
  startEvalRun: mocks.start,
  stepEvalRun: mocks.step,
  cancelEvalRun: vi.fn(),
  evalRunDialogData: mocks.dialogData,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const data = {
  spent: 1,
  remaining: 79,
  defaultModel: "anthropic/claude-sonnet-5.5" as const,
  running: false,
  estimates: Object.fromEntries(
    Object.keys(PRICES).map((model) => [
      model,
      { average: 0.01, total: 0.18, basis: "Past results" },
    ]),
  ) as Parameters<typeof NewRun>[0]["data"]["estimates"],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.dialogData.mockResolvedValue(data);
});
afterEach(cleanup);

it("opens with the default label and server budget while refreshing, with mobile scrolling and overlay", async () => {
  render(<NewRun data={data} />);
  fireEvent.click(screen.getByRole("button", { name: "New run" }));
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByRole("combobox", { name: "Model" }),
  ).toHaveTextContent("Claude Sonnet 5.5");
  expect(
    within(dialog).getByText(/Estimated cost: \$0.1800/),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByText(/Spent: \$1.0000. Remaining budget: \$79.0000/),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Run" })).toBeEnabled();
  expect(mocks.dialogData).toHaveBeenCalledOnce();
  expect(dialog).toHaveClass(
    "bg-background",
    "max-w-full",
    "max-h-[90dvh]",
    "overflow-y-auto",
  );
  expect(
    document.querySelector('[data-slot="dialog-overlay"]'),
  ).toBeInTheDocument();
  expect(dialog.querySelector('[data-slot="dialog-footer"]')).toHaveClass(
    "sticky",
    "bg-background",
  );
});

it("refreshes after completion and uses updated server budget on reopening", async () => {
  mocks.start.mockResolvedValue({ id: "run", done: 18, status: "completed" });
  const view = render(<NewRun data={data} />);
  fireEvent.click(screen.getByRole("button", { name: "New run" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.start).toHaveBeenCalledWith({
    model: data.defaultModel,
    effort: "low",
    blind: true,
  });
  mocks.dialogData.mockResolvedValue({ ...data, spent: 80, remaining: 0 });
  view.rerender(<NewRun data={{ ...data, spent: 80, remaining: 0 }} />);
  fireEvent.click(
    within(
      dialog.querySelector('[data-slot="dialog-footer"]') as HTMLElement,
    ).getByRole("button", { name: "Close" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "New run" }));
  const reopened = await screen.findByRole("dialog");
  expect(
    within(reopened).getByText(/Remaining budget: \$0.0000/),
  ).toBeInTheDocument();
  expect(within(reopened).getByRole("button", { name: "Run" })).toBeDisabled();
});

it("shows loaded values immediately then refreshes running state, spend and estimates", async () => {
  let finish!: (value: typeof data) => void;
  mocks.dialogData.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<NewRun data={data} />);
  fireEvent.click(screen.getByRole("button", { name: "New run" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Spent: \$1.0000/)).toBeInTheDocument();
  finish({
    ...data,
    running: true,
    spent: 5,
    remaining: 75,
    estimates: {
      ...data.estimates,
      [data.defaultModel]: {
        average: 0.02,
        total: 0.36,
        basis: "Fresh results",
      },
    },
  });
  await waitFor(() =>
    expect(within(dialog).getByText(/Spent: \$5.0000/)).toBeInTheDocument(),
  );
  expect(
    within(dialog).getByText(/Estimated cost: \$0.3600/),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByText("An eval run is already running."),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Run" })).toBeDisabled();
});
