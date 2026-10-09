import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  bulk: vi.fn(),
  save: vi.fn(),
  undo: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
  usePathname: () => "/admin/content/flashcards",
  useSearchParams: () => new URLSearchParams("status=draft"),
}));
vi.mock("@/app/admin/content/flashcards/actions", () => ({
  bulkFlashcards: mocks.bulk,
  saveCard: mocks.save,
  undoFlashcards: mocks.undo,
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toast, error: mocks.toast },
}));
import { FlashcardsTable } from "./flashcards-table";
const topics = [
  { id: "parent", parent_id: null, name: "Economics", sort: 1 },
  { id: "child", parent_id: "parent", name: "Inflation", sort: 2 },
];
function table() {
  render(
    <FlashcardsTable
      topics={topics}
      status="draft"
      rows={[
        {
          id: "card",
          front: "GDP",
          back: "Output",
          kind: "term",
          topic_id: "child",
          status: "draft",
          origin: "claro",
          updated_at: "2026-10-09T00:00:00Z",
          reviews: 0,
          knew_first: null,
          avg: null,
        },
      ]}
      pager={{
        page: 1,
        pages: 1,
        total: 1,
        sort: { id: "updated", dir: "desc" },
      }}
    />,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.bulk.mockResolvedValue({
    ok: true,
    done: 1,
    previous: [{ id: "card", status: "draft", topic_id: "child" }],
    version: "2026-10-09T00:00:00Z",
  });
});
afterEach(cleanup);
it("requires confirmation before retiring selected cards and offers Undo", async () => {
  table();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select all rows on this page" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Retire" }));
  let dialog = await screen.findByRole("alertdialog");
  expect(mocks.bulk).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(mocks.bulk).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retire" }));
  dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Retire" }));
  await waitFor(() =>
    expect(mocks.bulk).toHaveBeenCalledExactlyOnceWith(["card"], {
      kind: "retire",
    }),
  );
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith(
      "1 retired",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      }),
    ),
  );
});
it("provides an edit button and stable names for selects and counted fields", async () => {
  table();
  const edit = screen.getByRole("button", { name: "Edit GDP" });
  edit.focus();
  expect(edit).toHaveFocus();
  fireEvent.click(edit);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("combobox", { name: "Kind" })).toHaveValue(
    "term",
  );
  expect(within(dialog).getByRole("combobox", { name: "Topic" })).toHaveValue(
    "child",
  );
  expect(within(dialog).getByRole("textbox", { name: "Front" })).toHaveValue(
    "GDP",
  );
  fireEvent.change(within(dialog).getByRole("combobox", { name: "Status" }), {
    target: { value: "retired" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await screen.findByRole("alertdialog");
  expect(mocks.save).not.toHaveBeenCalled();
});
