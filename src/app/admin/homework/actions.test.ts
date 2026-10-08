// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireProfile: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { createHomework, updateHomework } from "./actions";
const id = "75f2a40b-3e20-4a56-9e14-1b237cfc8396";
function query(data: unknown = null, count = 0) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    throwOnError: vi.fn().mockResolvedValue({ data, count }),
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve({ data, count, error: null }).then(resolve),
  };
  for (const name of [
    "select",
    "eq",
    "is",
    "in",
    "order",
    "single",
    "maybeSingle",
    "insert",
    "update",
    "delete",
  ] as const)
    chain[name].mockReturnValue(chain);
  return chain;
}
function client(...responses: ReturnType<typeof query>[]) {
  const db = {
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  for (const response of responses) db.from.mockReturnValueOnce(response);
  vi.mocked(createClient).mockResolvedValue(db as never);
  return db;
}
const set = {
  id,
  title: "Growth",
  published_at: null,
  due_at: "2099-10-12T06:00:00Z",
};
function form(operation = "save") {
  const f = new FormData();
  f.set("id", id);
  f.set("operation", operation);
  f.set("title", "Growth");
  f.set("due", "2099-10-12T17:00");
  f.set("topic", "t3-growth");
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireProfile).mockResolvedValue({
    id: "admin",
    role: "admin",
  } as never);
});
it("requires an admin for both server actions", async () => {
  vi.mocked(requireProfile).mockResolvedValue({ role: "student" } as never);
  await expect(createHomework({}, form())).rejects.toThrow("redirect:/");
  await expect(updateHomework({}, form())).rejects.toThrow("redirect:/");
  expect(createClient).not.toHaveBeenCalled();
});
it("validates title and Sydney due time before creating a draft", async () => {
  const db = client();
  const f = form();
  f.set("title", "");
  expect((await createHomework({}, f)).error).toMatch(/title/);
  f.set("title", "Growth");
  f.set("due", "2026-10-04T02:30");
  expect((await createHomework({}, f)).error).toMatch(/Sydney/);
  expect(db.from).not.toHaveBeenCalled();
});
it.each([
  [0, "2099-10-12T06:00:00Z"],
  [1, "2020-10-12T06:00:00Z"],
])("rejects publishing empty or overdue drafts %#", async (count, due) => {
  const db = client(
    query({ ...set, due_at: due }),
    query(null, 0),
    query(null, count),
  );
  expect((await updateHomework({}, form("publish"))).error).toMatch(
    /at least one item/,
  );
  expect(db.from).toHaveBeenCalledTimes(3);
});
it.each(["unpublish", "delete"])(
  "blocks %s after any student starts",
  async (operation) => {
    const db = client(query(set), query(null, 1));
    expect((await updateHomework({}, form(operation))).error).toMatch(
      /student|started/,
    );
    expect(db.from).toHaveBeenCalledTimes(2);
  },
);
it.each([
  [true, 0],
  [false, 1],
])(
  "locks item edits while published or started %#",
  async (published, started) => {
    const db = client(
      query({ ...set, published_at: published ? "2026-10-01" : null }),
      query(null, started),
      query([{ position: 1, flashcard_id: "old", question_id: null }]),
    );
    const f = form();
    f.append("cards", "new");
    expect((await updateHomework({}, f)).error).toMatch(/Items are locked/);
    expect(db.from).toHaveBeenCalledTimes(3);
  },
);
it("rewrites selected items as contiguous positions with flashcards first", async () => {
  const metadata = query();
  const db = client(
    query(set),
    query(null, 0),
    query([]),
    query([{ id: "c1" }, { id: "c2" }]),
    query([{ id: "q" }]),
    metadata,
  );
  const f = form();
  f.append("cards", "c1");
  f.append("cards", "c2");
  f.append("cards", "c1");
  f.append("questions", "q");
  await expect(updateHomework({}, f)).rejects.toThrow(
    `redirect:/admin/homework/${id}?saved=1`,
  );
  expect(db.rpc).toHaveBeenCalledWith("rewrite_homework_items", {
    p_set: id,
    p_flashcard_ids: ["c1", "c2"],
    p_question_ids: ["q"],
  });
  expect(metadata.update).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Growth", topic_id: "t3-growth" }),
  );
});
