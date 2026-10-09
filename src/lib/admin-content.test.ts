import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/env/server", () => ({
  serverEnv: () => ({ SUPABASE_SECRET_KEY: "test-only-key" }),
}));
import { contentUndoToken, readContentUndoToken } from "./admin-content";
afterEach(() => vi.useRealTimers());
it("binds Undo to the original snapshot, operation and admin", () => {
  const saved = { previous: [{ id: "p", status: "live" }], version: "v" };
  const token = contentUndoToken("questions", "admin-a", saved);
  expect(readContentUndoToken("questions", "admin-a", token)).toEqual(saved);
  expect(() => readContentUndoToken("questions", "admin-b", token)).toThrow();
  expect(() => readContentUndoToken("flashcards", "admin-a", token)).toThrow();
  const [payload, signature] = token.split(".");
  const tampered = Buffer.from(
    JSON.stringify({
      scope: "questions",
      user: "admin-a",
      data: { previous: [] },
      expires: Date.now() + 60000,
    }),
  ).toString("base64url");
  expect(tampered).not.toBe(payload);
  expect(() =>
    readContentUndoToken("questions", "admin-a", `${tampered}.${signature}`),
  ).toThrow();
});
it("expires Undo instead of accepting old browser snapshots", () => {
  vi.useFakeTimers();
  const token = contentUndoToken("questions", "admin-a", {});
  vi.advanceTimersByTime(60001);
  expect(() => readContentUndoToken("questions", "admin-a", token)).toThrow(
    "Undo expired",
  );
});
