import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  role: "student",
  own: [] as { id: string; front: string }[],
  count: 0,
  shared: false,
  missingEdit: false,
  queries: [] as {
    table: string;
    op: string;
    calls: [string, unknown[]][];
    payload?: unknown;
  }[],
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireProfile: vi.fn(async () => ({ id: "me", role: state.role })),
}));
vi.mock("@/lib/flashcard-data", () => ({
  pages: async (
    query: (from: number, to: number) => PromiseLike<{ data: unknown[] }>,
  ) => (await query(0, 499)).data,
}));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const record = {
        table,
        op: "read",
        calls: [] as [string, unknown[]][],
        payload: undefined as unknown,
      };
      state.queries.push(record);
      const query: Record<string, unknown> = {};
      for (const method of [
        "select",
        "overrideTypes",
        "eq",
        "not",
        "gt",
        "lt",
        "lte",
        "is",
        "in",
        "or",
        "order",
        "range",
        "limit",
        "maybeSingle",
        "throwOnError",
        "insert",
        "update",
        "delete",
      ])
        query[method] = (...args: unknown[]) => {
          record.calls.push([method, args]);
          if (["insert", "update", "delete"].includes(method)) {
            record.op = method;
            record.payload = args[0];
          }
          return query;
        };
      query.then = (resolve: (result: unknown) => unknown) =>
        Promise.resolve(
          resolve(
            table === "topics"
              ? { data: [{ id: "t3-inflation" }] }
              : record.op !== "read"
                ? {
                    data:
                      record.op === "update" && state.missingEdit
                        ? []
                        : [{ id: "saved" }],
                  }
                : record.calls.some(
                      ([method, args]) =>
                        method === "select" &&
                        (args[1] as { head?: boolean })?.head,
                    )
                  ? { data: null, count: state.count }
                  : record.calls.some(([method]) => method === "or")
                    ? {
                        data: [
                          ...state.own.map((c) => ({ ...c, owner_id: "me" })),
                          ...(state.shared
                            ? [{ id: "shared", owner_id: null }]
                            : []),
                        ],
                      }
                    : { data: state.own },
          ),
        );
      return query;
    },
  }),
}));
import {
  saveMyCard,
  importMyCards,
  deleteMyCards,
  undoDeleteMyCards,
  moveMyCards,
  exportMyCards,
} from "./my-card-actions";
const card = {
  front: "New front",
  back: "New back",
  topic_id: "t3-inflation",
  kind: "term" as const,
};
beforeEach(() => {
  state.role = "student";
  state.own = [];
  state.count = 0;
  state.shared = false;
  state.missingEdit = false;
  state.queries = [];
});
it("enforces the server cap for create and import before inserting", async () => {
  state.count = 2000;
  expect(await saveMyCard(card)).toEqual({
    error: "You've reached 2,000 cards. Delete some to add more.",
  });
  state.count = 1999;
  expect(
    (await importMyCards([card, { ...card, front: "Second" }])).error,
  ).toContain("2,000");
  expect(state.queries.some((q) => q.op === "insert")).toBe(false);
});
it("blocks normalised duplicates both in the existing bank and within a batch", async () => {
  state.own = [{ id: "old", front: "NEW--FRONT!" }];
  expect((await saveMyCard(card)).error).toBe("You already have this card");
  state.own = [];
  expect(
    (await importMyCards([card, { ...card, front: "NEW-front" }])).error,
  ).toBe("You already have this card");
  expect(state.queries.some((q) => q.op === "insert")).toBe(false);
});
it("allows shared duplicates with a warning and uses student ownership", async () => {
  state.shared = true;
  const result = await saveMyCard(card);
  expect(result.ids).toEqual(["saved"]);
  expect(result.warning).toContain("Claro");
  const inserted = state.queries.find((q) => q.op === "insert");
  expect(inserted?.payload).toEqual([
    expect.objectContaining({
      ...card,
      owner_id: "me",
      origin: "student",
      status: "live",
    }),
  ]);
});
it("refuses editing another students card, and excludes the current front during editing", async () => {
  state.missingEdit = true;
  expect((await saveMyCard(card, "other")).error).toBe("Card not found.");
  state.missingEdit = false;
  state.queries = [];
  state.count = 2000;
  state.own = [{ id: "mine", front: "New front" }];
  expect((await saveMyCard(card, "mine")).ids).toEqual(["saved"]);
  const update = state.queries.find((q) => q.op === "update");
  expect(update?.calls).toContainEqual(["eq", ["owner_id", "me"]]);
  expect(update?.calls).toContainEqual(["eq", ["id", "mine"]]);
  expect(update?.payload).toEqual({ ...card, updated_at: expect.any(String) });
  expect(
    state.queries.some((q) =>
      q.calls.some(
        ([method, args]) =>
          method === "select" && (args[1] as { head?: boolean })?.head,
      ),
    ),
  ).toBe(false);
});
it("rejects invalid subtopics and oversized imports", async () => {
  expect((await saveMyCard({ ...card, topic_id: "t3" })).error).toBe(
    "Choose a valid subtopic",
  );
  expect(
    (await importMyCards(Array.from({ length: 501 }, () => card))).error,
  ).toBeTruthy();
  expect(state.queries.some((q) => q.op === "insert")).toBe(false);
});
it("retires, relives and moves only the owner's student cards; never hard-deletes", async () => {
  await deleteMyCards(["mine"]);
  await undoDeleteMyCards(["mine"]);
  await moveMyCards(["mine"], "t3-inflation");
  const writes = state.queries.filter((q) => q.op !== "read");
  expect(writes.map((q) => q.op)).toEqual(["update", "update", "update"]);
  for (const q of writes) {
    expect(q.calls).toContainEqual(["eq", ["owner_id", "me"]]);
    // Ownership alone scopes the write (owner_id is set only on student cards, by a table check),
    // and students cannot read the origin column.
    expect(q.calls).not.toContainEqual(["eq", ["origin", "student"]]);
    expect(q.calls).toContainEqual(["in", ["id", ["mine"]]]);
  }
  expect(writes.map((q) => (q.payload as { status?: string }).status)).toEqual([
    "retired",
    "live",
    undefined,
  ]);
  expect(writes[1].calls).toContainEqual(["eq", ["status", "retired"]]);
  expect((writes[2].payload as { topic_id: string }).topic_id).toBe(
    "t3-inflation",
  );
});
it("lets admins write only their own student cards", async () => {
  state.role = "admin";
  expect((await saveMyCard(card)).error).toBeUndefined();
  expect((await deleteMyCards(["mine"])).error).toBeUndefined();
  const inserted = state.queries.find((q) => q.op === "insert");
  expect(inserted?.payload).toEqual(
    expect.arrayContaining([expect.objectContaining({ owner_id: "me" })]),
  );
  const retired = state.queries.find((q) => q.op === "update");
  expect(retired?.calls).toContainEqual(["eq", ["owner_id", "me"]]);
});
it("exports on demand with owner, live, topic, kind and literal-search filters", async () => {
  const result = await exportMyCards({
    q: 'a,b_%"',
    topic: "t3-inflation",
    kind: "term",
  });
  expect(result.csv).toContain('"Front","Back","Topic","Kind"');
  const query = state.queries.find((q) => q.table === "flashcards");
  expect(query?.calls).toContainEqual(["eq", ["owner_id", "me"]]);
  expect(query?.calls).toContainEqual(["eq", ["status", "live"]]);
  expect(query?.calls).toContainEqual(["eq", ["topic_id", "t3-inflation"]]);
  expect(query?.calls).toContainEqual(["eq", ["kind", "term"]]);
  const value = JSON.stringify('%a,b\\_\\%"%');
  expect(query?.calls).toContainEqual([
    "or",
    [`front.ilike.${value},back.ilike.${value}`],
  ]);
});
it("scopes an admin's student export to their own cards", async () => {
  state.role = "admin";
  expect((await exportMyCards({})).error).toBeUndefined();
  const query = state.queries.find((q) => q.table === "flashcards");
  expect(query?.calls).toContainEqual(["eq", ["owner_id", "me"]]);
});
it.each(["new", "due", "known", "learning"])(
  "exports with a student-scoped %s progress join",
  async (progress) => {
    await exportMyCards({ progress });
    const query = state.queries.find((q) => q.table === "flashcards");
    expect(query?.calls).toContainEqual([
      "eq",
      ["flashcard_progress.user_id", "me"],
    ]);
    const select = query?.calls.find(([method]) => method === "select")?.[1][0];
    expect(select).toContain(
      progress === "new"
        ? "flashcard_progress(due_on,reviews)"
        : "flashcard_progress!inner(due_on,reviews)",
    );
    if (progress === "new")
      expect(query?.calls).toContainEqual(["is", ["flashcard_progress", null]]);
    if (progress === "learning")
      expect(query?.calls).toContainEqual([
        "lt",
        ["flashcard_progress.last_mark", 1],
      ]);
  },
);
