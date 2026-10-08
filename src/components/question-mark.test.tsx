import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { QuestionMark } from "./question-mark";
afterEach(cleanup);

async function ask(note: string) {
  render(<QuestionMark attemptId="a1" />);
  fireEvent.click(screen.getByRole("button", { name: "Question this mark" }));
  const box = await screen.findByRole("textbox", {
    name: "What do you think we missed?",
  });
  fireEvent.change(box, { target: { value: note } });
  return screen.getByRole("button", { name: "Submit" });
}

it("needs 10 characters, then posts the note and refreshes", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(Response.json({ ok: true }));
  expect((await ask("too short")).hasAttribute("disabled")).toBe(true);
  cleanup();
  fireEvent.click(await ask("I named the CPI figure."));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(fetch).toHaveBeenCalledWith(
    "/api/attempts/a1/dispute",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ note: "I named the CPI figure." }),
    }),
  );
});

it("shows the server's limit message", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(
      { error: "You have 3 marks being checked." },
      { status: 409 },
    ),
  );
  fireEvent.click(await ask("Please check this again."));
  await screen.findByText("You have 3 marks being checked.");
});
