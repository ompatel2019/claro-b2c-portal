import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const insert = vi.fn();
const upload = vi.fn();
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ insert }),
    storage: { from: () => ({ upload }) },
  }),
}));
const success = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (m: string) => success(m) } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/flashcards/11111111-2222-3333-4444-555555555555",
}));
import { FeedbackWidget, ReportProblem } from "./feedback-widget";

afterEach(cleanup);
beforeEach(() => {
  insert.mockReset().mockResolvedValue({ error: null });
  upload.mockReset().mockResolvedValue({ error: null });
  success.mockReset();
});

const png = (size = 10) =>
  new File([new Uint8Array(size)], "shot.png", { type: "image/png" });
const setup = () =>
  render(
    <FeedbackWidget userId="u1">
      <ReportProblem
        questionId="q22"
        sessionId="s1"
        label="Linked: 2023 HSC Q22(b)"
      />
    </FeedbackWidget>,
  );

it("sends a typed message with the page's session and a screenshot", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
  fireEvent.click(await screen.findByRole("button", { name: "Bug" }));
  const box = screen.getByRole("textbox", { name: "Message" });
  expect(box.getAttribute("placeholder")).toBe(
    "What happened, and what did you expect?",
  );
  screen.getByText("This session");
  fireEvent.change(box, { target: { value: "The timer froze." } });
  screen.getByText("16/4000");
  fireEvent.change(screen.getByLabelText("Add screenshots"), {
    target: { files: [png()] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() =>
    expect(success).toHaveBeenCalledWith("Thanks. We read every message."),
  );
  expect(upload.mock.calls[0][0]).toMatch(/^u1\/.+\.png$/);
  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "bug",
      message: "The timer froze.",
      session_id: "11111111-2222-3333-4444-555555555555",
      question_id: null,
      screenshots: [upload.mock.calls[0][0]],
    }),
  );
});

it("rejects wrong types, big files and a sixth screenshot", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
  const pick = await screen.findByLabelText("Add screenshots");
  fireEvent.change(pick, {
    target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] },
  });
  screen.getByText("Screenshots must be PNG, JPEG or WebP.");
  fireEvent.change(pick, { target: { files: [png(5 * 1024 * 1024 + 1)] } });
  screen.getByText("Each screenshot must be 5 MB or less.");
  fireEvent.change(pick, {
    target: { files: Array.from({ length: 6 }, () => png()) },
  });
  screen.getByText("You can add up to 5 screenshots.");
  expect(
    screen.getAllByRole("button", { name: /^Remove shot\.png/ }),
  ).toHaveLength(5);
});

it("keeps the draft when sending fails", async () => {
  insert.mockResolvedValue({ error: { message: "nope" } });
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Message" }), {
    target: { value: "Hello there" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("button", { name: "Try again" });
  expect(
    (screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Hello there");
  expect(success).not.toHaveBeenCalled();
});

it("reports a question as a linked content error; the link can be removed", async () => {
  setup();
  fireEvent.click(
    screen.getByRole("button", { name: "Report a problem with this question" }),
  );
  await screen.findByText("Linked: 2023 HSC Q22(b)");
  expect(
    screen
      .getByRole("button", { name: "Content error" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "Option C is also right." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(insert).toHaveBeenCalled());
  expect(insert.mock.calls[0][0]).toMatchObject({
    kind: "content",
    question_id: "q22",
    session_id: "s1",
  });
  insert.mockClear();
  fireEvent.click(
    screen.getByRole("button", { name: "Report a problem with this question" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Remove link" }));
  expect(screen.queryByText("Linked: 2023 HSC Q22(b)")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: "General note." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(insert).toHaveBeenCalled());
  expect(insert.mock.calls[0][0]).toMatchObject({
    question_id: null,
    session_id: null,
  });
});

it("keeps Send disabled until there is a message or a screenshot", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
  const send = await screen.findByRole("button", { name: "Send" });
  expect((send as HTMLButtonElement).disabled).toBe(true);
  const box = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(box, { target: { value: "  hi " } });
  expect((send as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(box, { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Add screenshots"), {
    target: { files: [png()] },
  });
  expect((send as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(send);
  await waitFor(() => expect(insert).toHaveBeenCalled());
  expect(insert.mock.calls[0][0]).toMatchObject({
    message: "Screenshot attached.",
  });
});
