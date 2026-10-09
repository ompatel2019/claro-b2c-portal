import { expect, it } from "vitest";
import { cardSchema, reviewImport } from "./flashcard-import";

it("extends the card validator with only admin ID and status fields", () => {
  const card = {
    id: null,
    status: "draft",
    front: "GDP",
    back: "Output",
    topic_id: "t3-growth",
    kind: "term",
  };
  for (const status of ["draft", "live", "retired"])
    expect(cardSchema.safeParse({ ...card, status }).success).toBe(true);
  expect(cardSchema.safeParse({ ...card, status: "new" }).success).toBe(false);
  expect(cardSchema.safeParse({ ...card, id: "" }).success).toBe(false);
});
it("dedupes shared fronts by kind, excluding invalid rows from the seen set", () => {
  const rows = reviewImport(
    [
      {
        front: "Inflation, CPI",
        back: "Prices",
        topic_id: "t3-inflation",
        kind: "term",
      },
      {
        front: "Inflation (CPI)!",
        back: "3%",
        topic_id: "t3-inflation",
        kind: "stat",
      },
      { front: "GDP", back: "", topic_id: "t3-growth", kind: "term" },
      { front: "GDP", back: "Output", topic_id: "t3-growth", kind: "term" },
      { front: "gdp", back: "Duplicate", topic_id: "t3-growth", kind: "term" },
      {
        front: "Cash rate",
        back: "4%",
        topic_id: "t3-inflation",
        kind: "other",
      },
    ],
    new Set(["term|inflation cpi"]),
  );
  expect(rows.map((r) => r.status)).toEqual([
    "duplicate",
    "ready",
    "invalid",
    "ready",
    "duplicate",
    "invalid",
  ]);
  expect(rows[0].reason).toBe("Already a Claro card");
  expect(rows[4].reason).toBe("Repeated in this file");
});
