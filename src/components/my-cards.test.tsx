import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  save: vi.fn(async (): Promise<{ ids?: string[]; error?: string }> => ({
    ids: ["new"],
  })),
  import: vi.fn(async () => ({ ids: ["imported"] })),
  remove: vi.fn(async () => ({ ids: ["a"] })),
}));
vi.mock("@/app/(app)/flashcards/my-card-actions", () => ({
  saveMyCard: mocks.save,
  importMyCards: mocks.import,
  deleteMyCards: mocks.remove,
  undoDeleteMyCards: vi.fn(async () => ({ ids: ["a"] })),
  moveMyCards: vi.fn(async () => ({ ids: ["a"] })),
  loadMyCardFronts: vi.fn(async () => ({ fronts: [] })),
  exportMyCards: vi.fn(async () => ({ csv: "Front,Back" })),
}));
vi.mock("@/app/(app)/flashcards/actions", () => ({
  startFlashcards: vi.fn(async () => ({})),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { MyCards } from "./my-cards";
import { CardEditor } from "./card-editor";
import { CardImportDialog } from "./card-import-dialog";
import { CARD_IMPORT_BYTE_LIMIT } from "@/lib/limits";
const topics = [
  { id: "t3-inflation", parent_id: "t3", name: "Inflation", sort: 1 },
];
const rows = [
  {
    id: "a",
    front: "My inflation",
    back: "Prices rise",
    topic_id: "t3-inflation",
    kind: "term" as const,
    updated_at: "2026-10-09T00:00:00Z",
    seen: 0,
    percent: null,
    due: null,
  },
];
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function table(total = 1, cardRows = rows, pageCount = 2) {
  return render(
    <MyCards
      rows={cardRows}
      topics={topics}
      total={total}
      page={1}
      pageCount={pageCount}
      params={{ q: "inflation" }}
    >
      <div />
    </MyCards>,
  );
}
async function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}
it("selects a row, requires an AlertDialog before bulk deletion and preserves URL pagination", async () => {
  table();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select My inflation" }),
  );
  expect(screen.getByText("1 selected")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Start deck from selected" }),
  ).toBeEnabled();
  expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
    "href",
    expect.stringContaining("q=inflation"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(mocks.remove).not.toHaveBeenCalled();
  const alert = screen.getByRole("alertdialog");
  expect(within(alert).getByText("Delete 1 card?")).toBeInTheDocument();
  fireEvent.click(within(alert).getByRole("button", { name: "Delete cards" }));
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(["a"]));
});
it("opens editing from the accessible front button", () => {
  table();
  fireEvent.click(screen.getByRole("button", { name: "My inflation" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByLabelText("Front")).toHaveValue("My inflation");
  expect(screen.getByRole("combobox", { name: "Topic" })).toHaveTextContent(
    "Inflation",
  );
});
it("requires a topic, then shows the server's duplicate verdict inline", async () => {
  mocks.save.mockResolvedValueOnce({ error: "You already have this card" });
  render(<CardEditor topics={topics} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Front"), {
    target: { value: " inflation " },
  });
  fireEvent.change(screen.getByLabelText("Back"), {
    target: { value: "answer" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Choose a subtopic");
  expect(mocks.save).not.toHaveBeenCalled();
  await choose("Topic", "Inflation");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You already have this card",
    ),
  );
  expect(mocks.save).toHaveBeenCalledWith(
    {
      front: "inflation",
      back: "answer",
      topic_id: "t3-inflation",
      kind: "term",
    },
    undefined,
  );
});
it("saves via command Enter, keeps the dialog open as Add card and then inserts", async () => {
  const close = vi.fn();
  render(<CardEditor card={rows[0]} topics={topics} onClose={close} />);
  fireEvent.keyDown(screen.getByLabelText("Back"), {
    key: "Enter",
    metaKey: true,
  });
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ front: "My inflation" }),
      "a",
    ),
  );
  await waitFor(() => expect(screen.getByLabelText("Front")).toHaveValue(""));
  expect(screen.getByRole("heading", { name: "Add card" })).toBeInTheDocument();
  expect(close).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Front"), {
    target: { value: "Another front" },
  });
  fireEvent.change(screen.getByLabelText("Back"), {
    target: { value: "Another back" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        front: "Another front",
        topic_id: "t3-inflation",
      }),
      undefined,
    ),
  );
});
it("reviews a CSV, skips duplicates and invalid rows and imports only included rows", async () => {
  render(
    <CardImportDialog
      topics={topics}
      ownFronts={["Existing"]}
      onClose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("Paste text"), {
    target: { value: "Front,Back\nExisting,answer\nFresh,answer\n,invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("combobox", { name: "Back column" }),
  ).toHaveTextContent("Column 2 · Back");
  await choose("Default topic", "Inflation");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByText("1 ready · 1 duplicates · 1 invalid"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("checkbox", { name: "Include row 1" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("checkbox", { name: "Include row 3" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Import 1 card" }));
  await waitFor(() =>
    expect(mocks.import).toHaveBeenCalledWith([
      { front: "Fresh", back: "answer", topic_id: topics[0].id, kind: "term" },
    ]),
  );
});
it("shows the cap and blocks add and import", () => {
  table(2000);
  expect(screen.getByRole("button", { name: "Add card" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "You've reached 2,000 cards",
  );
});
it("hides pagination for empty and single-page lists", () => {
  const view = table(0, [], 1);
  expect(screen.getByText("No cards yet")).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  view.unmount();
  table(1, rows, 1);
  expect(screen.getByRole("table", { name: "My cards" })).toBeInTheDocument();
  expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});
it("marks select-all indeterminate only for a partial page selection", () => {
  table(2, [rows[0], { ...rows[0], id: "b", front: "Second card" }]);
  const all = screen.getByRole<HTMLInputElement>("checkbox", {
    name: "Select all cards on this page",
  });
  expect(all.indeterminate).toBe(false);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select My inflation" }),
  );
  expect(all.indeterminate).toBe(true);
  expect(all).not.toBeChecked();
  fireEvent.click(all);
  expect(all.indeterminate).toBe(false);
  expect(all).toBeChecked();
  fireEvent.click(all);
  expect(all.indeterminate).toBe(false);
  expect(all).not.toBeChecked();
});
it("rejects oversized uploads before reading the file", () => {
  render(<CardImportDialog topics={topics} ownFronts={[]} onClose={vi.fn()} />);
  const read = vi.fn(async () => "Front,Back");
  fireEvent.change(screen.getByLabelText("Upload file"), {
    target: { files: [{ size: CARD_IMPORT_BYTE_LIMIT + 1, text: read }] },
  });
  expect(read).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Files must be 1 MB or smaller.",
  );
});
it("requires a separate Back mapping for a one-column paste", () => {
  render(<CardImportDialog topics={topics} ownFronts={[]} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Paste text"), {
    target: { value: "Front\nOnly a front" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("combobox", { name: "Back column" }),
  ).toHaveTextContent("Choose a column");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Map separate Front and Back columns.",
  );
  expect(screen.getByRole("heading")).toHaveTextContent("Step 2 of 3");
});
