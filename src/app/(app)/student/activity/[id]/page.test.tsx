import { expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ kind: "paper", from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
    from: mocks.from,
  }),
}));
vi.mock("@/lib/single-check-data", () => ({
  bankQuestions: vi.fn(),
  remainingChecks: vi.fn(),
}));
vi.mock("@/components/mark-my-answer", () => ({ MarkMyAnswer: () => null }));
import Page from "./page";
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(() => ({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle: async () => ({ data: { kind: mocks.kind }, error: null }),
  }));
});
it("returns not found for an existing paper row without reading its attempts", async () => {
  mocks.kind = "paper";
  await expect(Page({ params: Promise.resolve({ id }) })).rejects.toThrow(
    "404",
  );
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("sessions");
});
it.each([
  ["sprint", `/student/sprint/${id}/results`],
  ["flashcards", `/student/flashcards/${id}`],
])("preserves %s report redirects", async (kind, url) => {
  mocks.kind = kind;
  await expect(Page({ params: Promise.resolve({ id }) })).rejects.toThrow(
    `redirect:${url}`,
  );
});
