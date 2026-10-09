import { describe, it, expect } from "vitest";
import {
  cardSchema,
  parseCards,
  detectSeparator,
  normaliseFront,
  reviewImport,
  exportCards,
  type CardInput,
} from "./card-import";
const topics = [{ id: "t3-inflation", name: "Inflation" }];
const defaults = { topic_id: "t3-inflation", kind: "term" as const };
const mapping = { front: 0, back: 1, topic: 2, kind: 3 };
const card: CardInput = {
  ...defaults,
  front: "Inflation?",
  back: "A rise in prices",
};
describe("delimited parsing", () => {
  it.each(["\t", ",", ";"] as const)("detects and parses %s", (separator) => {
    const text = `Front${separator}Back\r\nA${separator}B`;
    expect(detectSeparator(text)).toBe(separator);
    expect(parseCards(text, separator)).toEqual([
      ["Front", "Back"],
      ["A", "B"],
    ]);
  });
  it("handles comma quoting, escaped quotes, BOM and multiline cells", () => {
    expect(parseCards('﻿"A, B","Say ""yes""\nagain"\r\nC,D', ",")).toEqual([
      ["A, B", 'Say "yes"\nagain'],
      ["C", "D"],
    ]);
  });
  it("detects separators outside quoted fields", () => {
    expect(detectSeparator('"A,B,C";answer\n"D,E,F";answer')).toBe(";");
  });
  it("keeps empty columns and skips blank rows", () => {
    expect(parseCards("a\tb\t\n\n\t\t\nx\t\ty\n", "\t")).toEqual([
      ["a", "b", ""],
      ["x", "", "y"],
    ]);
  });
  it.each(['"unclosed,answer', '"a"junk,b'])(
    "rejects malformed quoting: %s",
    (text) => {
      expect(() => parseCards(text, ",")).toThrow(/quot/i);
    },
  );
  it("accepts literal quotes in pasted unquoted cells", () => {
    expect(parseCards('a"b,c', ",")).toEqual([['a"b', "c"]]);
    const text = 'Invisible hand\tthe "invisible hand"';
    expect(detectSeparator(text)).toBe("\t");
    expect(parseCards(text, "\t")).toEqual([
      ["Invisible hand", 'the "invisible hand"'],
    ]);
  });
  it("bounds file bytes including multibyte text", () => {
    expect(() => parseCards("é".repeat(524289), ",")).toThrow("1 MB");
  });
  it("allows 500 rows plus header, rejects additional rows", () => {
    expect(parseCards("f,b\n".repeat(501), ",")).toHaveLength(501);
    expect(() => parseCards("f,b\n".repeat(502), ",")).toThrow("500");
  });
  it("supports an explicit separator override", () => {
    expect(parseCards("a;b,c", ",")).toEqual([["a;b", "c"]]);
  });
});
describe("mapping and validation", () => {
  it("normalises exactly like SQL dedupe_norm, including punctuation and non-ASCII", () => {
    expect(normaliseFront("  INFLATION?! / Rate  ")).toBe("inflation rate");
    expect(normaliseFront("é—ABC")).toBe("abc");
  });
  it("maps names/ids, kinds and defaults, ignoring extra columns", () => {
    const result = reviewImport(
      [
        [" A ", " B ", "inflation", "STAT", "ignored"],
        ["C", "D"],
      ],
      mapping,
      defaults,
      topics,
      [],
    );
    expect(result.map((r) => r.card)).toEqual([
      { front: "A", back: "B", topic_id: "t3-inflation", kind: "stat" },
      { front: "C", back: "D", ...defaults },
    ]);
    expect(result.every((r) => r.status === "Ready")).toBe(true);
  });
  it("skips own duplicates and duplicates within the file, naming the source", () => {
    const result = reviewImport(
      [
        ["Inflation!", "a"],
        ["New card", "b"],
        ["NEW--CARD", "c"],
      ],
      mapping,
      defaults,
      topics,
      ["inflation"],
    );
    expect(result.map((r) => r.status)).toEqual([
      "Duplicate",
      "Ready",
      "Duplicate",
    ]);
    expect(result.map((r) => r.error)).toEqual([
      "Already in your cards",
      null,
      "Repeated in this file",
    ]);
  });
  it("an invalid row does not poison a later valid front", () => {
    expect(
      reviewImport(
        [
          ["A", ""],
          ["A", "B"],
        ],
        mapping,
        defaults,
        topics,
        [],
      ).map((r) => r.status),
    ).toEqual(["Invalid", "Ready"]);
  });
  it.each([
    [{ front: "" }, "Front is empty"],
    [{ front: "x".repeat(201) }, "Front over 200 characters"],
    [{ back: "" }, "Back is empty"],
    [{ back: "x".repeat(1001) }, "Back over 1,000 characters"],
    [{ topic_id: "" }, "Choose a subtopic"],
    [{ kind: "other" }, "Kind must be Term or Stat"],
  ])("reports %s", (patch, error) => {
    expect(
      cardSchema.safeParse({ ...card, ...patch }).error?.issues[0].message,
    ).toBe(error);
  });
  it("accepts boundary lengths and flags an unknown subtopic", () => {
    expect(
      cardSchema.safeParse({
        ...card,
        front: "x".repeat(200),
        back: "y".repeat(1000),
      }).success,
    ).toBe(true);
    expect(
      reviewImport([["A", "B", "Nowhere"]], mapping, defaults, topics, [])[0]
        .error,
    ).toBe("Choose a valid subtopic");
  });
  it("rejects a missing or overlapping required mapping", () => {
    for (const m of [
      { ...mapping, front: -1 },
      { ...mapping, back: 0 },
    ])
      expect(() => reviewImport([["A", "B"]], m, defaults, topics, [])).toThrow(
        "separate",
      );
  });
  it("enforces 500 data rows even without a header", () => {
    expect(() =>
      reviewImport(
        Array.from({ length: 501 }, () => ["A", "B"]),
        mapping,
        defaults,
        topics,
        [],
      ),
    ).toThrow("500");
  });
  it("roundtrips CSV export with commas, quotes and newlines", () => {
    const cards = [{ ...card, front: 'A, "B"', back: "line 1\nline 2" }];
    const rows = parseCards(exportCards(cards, topics), ",");
    expect(rows[0]).toEqual(["Front", "Back", "Topic", "Kind"]);
    expect(
      reviewImport(rows.slice(1), mapping, defaults, topics, [])[0].card,
    ).toEqual(cards[0]);
  });
  it.each(["=SUM(A1:A2)", "+1", "-1", "@value", "\tformula", "\rformula"])(
    "exports %j as text rather than a formula",
    (front) => {
      const rows = parseCards(
        exportCards(
          [{ ...card, front, back: front }],
          [{ ...topics[0], name: front }],
        ),
        ",",
      );
      expect(rows[1].slice(0, 3)).toEqual([
        "'" + front,
        "'" + front,
        "'" + front,
      ]);
    },
  );
});
