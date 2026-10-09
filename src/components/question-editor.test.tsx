import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({ save: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: vi.fn() }),
}));
vi.mock("@/app/admin/content/questions/actions", () => ({
  saveQuestion: mocks.save,
}));
vi.mock("./question-view", () => ({
  QuestionView: () => null,
  QuestionKey: () => null,
}));
vi.mock("./annotated-feedback", () => ({ AnnotatedFeedback: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { QuestionEditor } from "./question-editor";
const topics = [
  { id: "parent", parent_id: null, name: "Economics", sort: 1 },
  { id: "child", parent_id: "parent", name: "Inflation", sort: 2 },
];
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);
const mount = () => render(<QuestionEditor loaded={null} topics={topics} />);
it("keeps a pristine question unsaved and hides validation until a save attempt", () => {
  mount();
  expect(screen.getByText("Not saved yet · ⌘S")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Stem"), {
    target: { value: "Explain inflation" },
  });
  expect(screen.getByText("Unsaved changes · ⌘S")).toBeInTheDocument();
  expect(screen.queryByText("Add at least one band.")).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: "s", metaKey: true });
  expect(screen.getByText("Add at least one band.")).toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalled();
});
it("shows band validation after editing criteria and clears it when corrected", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Add band" }));
  expect(screen.getByLabelText("Band 1 descriptor")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  fireEvent.change(screen.getByLabelText("Band 1 min"), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByLabelText("Band 1 descriptor"), {
    target: { value: "Explains inflation" },
  });
  expect(screen.getByLabelText("Band 1 descriptor")).toHaveAttribute(
    "aria-invalid",
    "false",
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove band 1" }));
  expect(screen.getByText("Add at least one band.")).toBeInTheDocument();
});
it("only shows Saved after a successful save, allowing retry after failure", async () => {
  mocks.save
    .mockResolvedValueOnce({ error: "Couldn’t save. Try again." })
    .mockResolvedValueOnce({
      id: "new-question",
      updated_at: "2026-10-10T00:00:00Z",
    });
  mount();
  fireEvent.change(screen.getByLabelText("ID"), {
    target: { value: "new-question" },
  });
  fireEvent.change(screen.getByLabelText("Source label"), {
    target: { value: "Claro" },
  });
  fireEvent.change(screen.getByLabelText("Stem"), {
    target: { value: "Explain inflation" },
  });
  fireEvent.click(screen.getByRole("combobox", { name: "Topic" }));
  {
    const option = await screen.findByRole("option", {
      name: "Economics · Inflation",
    });
    fireEvent.mouseMove(option);
    fireEvent.mouseUp(option);
    fireEvent.click(option);
  }
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  await screen.findByText("Couldn’t save. Try again.");
  expect(screen.queryByText("Saved · ⌘S")).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: /^Save$/ }));
  await waitFor(() =>
    expect(screen.getByText("Saved · ⌘S")).toBeInTheDocument(),
  );
  expect(mocks.replace).toHaveBeenCalledWith(
    "/admin/content/questions/new-question",
  );
});

it("prevents an open dropdown from editing the question during a keyboard save", async () => {
  let finishSave!: (result: { id: string; updated_at: string }) => void;
  mocks.save.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      }),
  );
  mount();
  fireEvent.change(screen.getByLabelText("ID"), {
    target: { value: "new-question" },
  });
  fireEvent.change(screen.getByLabelText("Source label"), {
    target: { value: "Claro" },
  });
  fireEvent.change(screen.getByLabelText("Stem"), {
    target: { value: "Explain inflation" },
  });
  fireEvent.click(screen.getByRole("combobox", { name: "Topic" }));
  const topic = await screen.findByRole("option", {
    name: "Economics · Inflation",
  });
  fireEvent.pointerDown(topic, { pointerType: "mouse" });
  fireEvent.click(topic);
  fireEvent.click(screen.getByRole("combobox", { name: "Status" }));
  const live = await screen.findByRole("option", { name: "Live" });
  fireEvent.keyDown(window, { key: "s", metaKey: true });
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
  fireEvent.pointerDown(live, { pointerType: "mouse" });
  fireEvent.click(live);
  finishSave({ id: "new-question", updated_at: "2026-10-10T00:00:00Z" });
  await screen.findByText("Saved · ⌘S");
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent(
    "Draft",
  );
});
