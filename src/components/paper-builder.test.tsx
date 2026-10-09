import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { savePaper, refresh } = vi.hoisted(() => ({
  savePaper: vi.fn().mockResolvedValue({ ok: true, total: 4 }),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/admin/content/papers/actions", () => ({
  savePaper,
  searchBank: vi.fn(),
  undoRetirePapers: vi.fn(),
}));
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "admin" } }, error: null }),
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { PaperBuilder } from "./paper-builder";
const loaded = {
  paper: {
    id: "paper",
    title: "Trial",
    year: 2026,
    source: "Trial",
    time_limit_min: 180,
    origin: "claro",
    total_marks: 4,
    section_names: ["Section I"],
    ranks_enabled: false,
    status: "draft",
    updated_at: "2026-10-09T01:00:00Z",
  },
  adminId: "admin",
  started: 0,
  firstSits: 0,
  sections: [
    {
      name: "Section I",
      questions: [
        {
          question_id: "q1",
          source: "Q1",
          type: "short" as const,
          marks: 4,
          topic_id: "t1",
          status: "live" as const,
          choice_group: null,
        },
      ],
    },
  ],
  stems: { q1: { stem: "Explain inflation.", stimulus: null, options: null } },
};
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});
it("requires confirmation before publishing and cancelling writes nothing", () => {
  render(<PaperBuilder loaded={loaded} topics={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  expect(screen.getByRole("alertdialog")).toBeTruthy();
  expect(
    screen.getByText("Publishing hides these 1 question from Topic Sprints."),
  ).toBeTruthy();
  expect(savePaper).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep as is" }));
  expect(savePaper).not.toHaveBeenCalled();
});
it("keeps ordinary Save a draft and forwards the version guard", async () => {
  render(<PaperBuilder loaded={loaded} topics={[]} />);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(savePaper).toHaveBeenCalledWith(
      "paper",
      expect.objectContaining({ title: "Trial" }),
      "draft",
      false,
      loaded.paper.updated_at,
    ),
  );
});
it("blocks structure and timing edits once a live paper has sits", () => {
  render(
    <PaperBuilder
      loaded={{
        ...loaded,
        paper: { ...loaded.paper, status: "live" },
        started: 1,
      }}
      topics={[]}
    />,
  );
  expect(screen.getByLabelText("Time limit")).toBeDisabled();
  expect(screen.getByLabelText("Year")).toBeDisabled();
  expect(screen.getByLabelText("Source label")).toBeDisabled();
  expect(screen.getByLabelText("Section 1 name")).toBeDisabled();
  expect(screen.getByLabelText("Title")).not.toBeDisabled();
  expect(
    screen.getByRole("switch", { name: "Show ranks to students" }),
  ).not.toBeDisabled();
  expect(screen.queryByRole("button", { name: "Add questions" })).toBeNull();
});
