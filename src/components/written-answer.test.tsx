import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { WrittenAnswer } from "./written-answer";
import { type Attempt } from "@/lib/practice";
vi.mock("@/lib/auth-client", () => ({
  withAuthRetry: (_db: unknown, fn: () => unknown) => fn(),
  ensureSession: vi.fn(),
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));
const attempt = {
  id: "a",
  status: "pending",
  question: { type: "short", marks: 4 },
  answer_text: "Draft answer",
  transcript: null,
  image_paths: null,
} as Attempt;
function answer(paper = true, disabled = false) {
  return render(
    <WrittenAnswer
      paper={paper}
      disabled={disabled}
      attempt={attempt}
      userId="u"
      onBusy={vi.fn()}
      edit={vi.fn()}
      save={vi.fn()}
      flush={vi.fn()}
      local={vi.fn()}
    />,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("locks typing and photo upload together during reading", () => {
  answer(true, true);
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByLabelText("Take photo / Upload")).toBeDisabled();
});
it("allows paper drafts without offering early marking", () => {
  answer();
  expect(screen.getByRole("textbox")).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Submit answer" })).toBeNull();
});
it("rejects more than eight paper pages before any upload or transcription", async () => {
  answer();
  const files = Array.from(
    { length: 9 },
    (_, i) => new File(["photo"], `${i}.png`, { type: "image/png" }),
  );
  fireEvent.change(screen.getByLabelText("Take photo / Upload"), {
    target: { files },
  });
  fireEvent.click(await screen.findByRole("button", { name: "Use photo" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Upload up to 8 pages per question.",
  );
});

it("appends camera shots, flushes once per batch, and reads only on request", async () => {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const { createClient } = await import("@/utils/supabase/client");
  vi.mocked(createClient).mockReturnValue({
    storage: { from: () => ({ upload }) },
  } as never);
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      transcript: "Two pages",
      lines: ["Two pages"],
      notes: "",
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const flush = vi.fn().mockResolvedValue(undefined);
  const save = vi.fn().mockResolvedValue(undefined);
  const { useState } = await import("react");
  function Photos() {
    const [row, setRow] = useState({
      ...attempt,
      answer_text: null,
      image_paths: ["u/existing.png"],
    });
    return (
      <WrittenAnswer
        attempt={row}
        paper
        disabled={false}
        userId="u"
        onBusy={vi.fn()}
        edit={vi.fn()}
        save={save}
        flush={flush}
        local={(patch) => setRow((r) => ({ ...r, ...patch }) as typeof row)}
      />
    );
  }
  render(<Photos />);
  fireEvent.change(screen.getByLabelText("Take photo / Upload"), {
    target: {
      files: [
        new File(["photo"], "shot1.png", { type: "image/png" }),
        new File(["photo"], "shot2.png", { type: "image/png" }),
      ],
    },
  });
  expect(await screen.findByText("Page 3")).toBeVisible();
  expect(flush).toHaveBeenCalledTimes(1);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[0][0]).not.toBe(upload.mock.calls[1][0]);
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      image_paths: [
        "u/existing.png",
        upload.mock.calls[0][0],
        upload.mock.calls[1][0],
      ],
    }),
  );
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Read my handwriting" }));
  expect(
    await screen.findByRole("button", { name: "Confirm transcript" }),
  ).toBeVisible();
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    "/api/attempts/a/transcribe",
    { method: "POST" },
  );
});
