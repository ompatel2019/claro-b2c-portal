import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  undo: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/app/admin/students/actions", () => ({
  updateStudentFeedback: mocks.save,
}));
vi.mock("@/app/admin/feedback/actions", () => ({ undoFeedback: mocks.undo }));
vi.mock("sonner", () => ({ toast: { success: mocks.toast } }));
vi.mock("./student-actions", () => ({ SpotCheck: () => null }));
import { FeedbackDetail } from "./feedback-detail";

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const row = {
  id: "feedback",
  user_id: "student",
  message: "Please fix this",
  status: "new" as const,
  admin_note: null,
  page_path: null,
  user_agent: null,
  question_id: null,
  session_id: null,
};

it("keeps reply B and its status when undo A is rejected", async () => {
  mocks.save
    .mockResolvedValueOnce({ undo: "A" })
    .mockResolvedValueOnce({ undo: "B" });
  mocks.undo.mockResolvedValue({
    error: "Changed since — nothing was undone.",
  });
  render(<FeedbackDetail row={row} photos={[]} />);
  const reply = screen.getByLabelText("Reply to student");
  const status = screen.getByLabelText("Status");
  fireEvent.change(reply, { target: { value: "Reply A" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
  const undoA = mocks.toast.mock.calls[0][1].action.onClick;
  fireEvent.change(reply, { target: { value: "Reply B" } });
  fireEvent.change(status, { target: { value: "triaged" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(2));
  await act(async () => undoA());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Changed since — nothing was undone.",
  );
  expect(reply).toHaveValue("Reply B");
  expect(status).toHaveValue("triaged");
  expect(mocks.undo).toHaveBeenCalledWith("A");
  expect(mocks.toast).toHaveBeenCalledTimes(2);
});

it("uses the server's restored snapshot after successful undo", async () => {
  mocks.save.mockResolvedValue({ undo: "B" });
  mocks.undo.mockResolvedValue({
    ok: true,
    restored: [
      {
        id: row.id,
        status: "triaged",
        admin_note: "Reply A",
        resolved_at: null,
      },
    ],
  });
  render(<FeedbackDetail row={row} photos={[]} />);
  fireEvent.change(screen.getByLabelText("Reply to student"), {
    target: { value: "Reply B" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
  await act(async () => mocks.toast.mock.calls[0][1].action.onClick());
  await waitFor(() =>
    expect(screen.getByLabelText("Reply to student")).toHaveValue("Reply A"),
  );
  expect(screen.getByLabelText("Status")).toHaveValue("triaged");
  expect(mocks.toast).toHaveBeenLastCalledWith("Feedback change undone");
});
