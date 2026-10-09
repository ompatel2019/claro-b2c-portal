import { expect, it } from "vitest";
import { flashcardPage } from "./flashcard-list";
import type { FlashcardRow } from "./admin-flashcards";
const topics = [
  { id: "parent", parent_id: null, name: "Parent", sort: 1 },
  { id: "child", parent_id: "parent", name: "Inflation", sort: 2 },
];
const rows: FlashcardRow[] = Array.from({ length: 1205 }, (_, i) => ({
  id: String(i).padStart(4, "0"),
  front: `Front ${i}`,
  back: "Back",
  kind: "term",
  topic_id: "child",
  status: "live",
  origin: "claro",
  updated_at: "2026-10-09T00:00:00Z",
  reviews: i,
  knew_first: i ? 50 : null,
  avg: i ? 75 : null,
}));
it("paginates beyond 1000 rows and sorts SQL aggregate values globally", () => {
  const page = flashcardPage(rows, topics, {
    sort: "reviews",
    dir: "desc",
    page: "2",
  });
  expect(page.pager).toMatchObject({ total: 1205, pages: 25, page: 2 });
  expect(page.rows).toHaveLength(50);
  expect(page.rows[0].reviews).toBe(1154);
  expect(
    flashcardPage(rows, topics, { sort: "__proto__", page: "999" }).pager,
  ).toMatchObject({ page: 25, sort: { id: "updated", dir: "desc" } });
});
it("uses topic relationships, searches rendered names and treats query punctuation literally", () => {
  expect(
    flashcardPage(rows, topics, { topic: "parent", q: "inflation" }).pager
      .total,
  ).toBe(1205);
  expect(flashcardPage(rows, topics, { q: "Front 1204" }).rows[0].id).toBe(
    "1204",
  );
  expect(flashcardPage(rows, topics, { q: "%,()" }).rows).toEqual([]);
  expect(flashcardPage(rows, topics, { status: "draft" }).rows).toEqual([]);
});
