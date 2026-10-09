import { z } from "zod";
import {
  CARD_IMPORT_BYTE_LIMIT,
  CARD_IMPORT_ROW_LIMIT,
  CARD_FRONT_LIMIT,
  CARD_BACK_LIMIT,
} from "./limits";
export const cardSchema = z.object({
  front: z
    .string()
    .trim()
    .min(1, "Front is empty")
    .max(CARD_FRONT_LIMIT, "Front over 200 characters"),
  back: z
    .string()
    .trim()
    .min(1, "Back is empty")
    .max(CARD_BACK_LIMIT, "Back over 1,000 characters"),
  topic_id: z.string().min(1, "Choose a subtopic").max(200),
  kind: z.enum(["term", "stat"], { error: "Kind must be Term or Stat" }),
});
export type CardInput = z.infer<typeof cardSchema>;
export type Separator = "\t" | "," | ";";
/** Matches SQL dedupe_norm: lower case, punctuation and space runs collapsed. */
export const normaliseFront = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Quoted delimiters, escaped quotes, CRLF and multiline cells follow CSV rules. */
export function parseCards(text: string, separator: Separator): string[][] {
  if (new TextEncoder().encode(text).length > CARD_IMPORT_BYTE_LIMIT)
    throw new Error("Files must be 1 MB or smaller.");
  text = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  const endCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((v) => v.trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === separator) endCell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else if (c === '"' && !cell && !closed) quoted = true;
    else {
      if (closed) throw new Error("Invalid CSV quoting.");
      cell += c;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  endRow();
  if (rows.length > CARD_IMPORT_ROW_LIMIT + 1)
    throw new Error("Import at most 500 rows.");
  return rows;
}
export function detectSeparator(text: string): Separator {
  let best: Separator = "\t";
  let score = -1;
  for (const separator of ["\t", ",", ";"] as const) {
    try {
      const rows = parseCards(text, separator).slice(0, 20);
      const width = rows[0]?.length ?? 0;
      const value =
        width > 1
          ? rows.filter((r) => r.length === width).length * 100 + width
          : 0;
      if (value > score) {
        score = value;
        best = separator;
      }
    } catch {
      /* Another delimiter may be valid. */
    }
  }
  return best;
}
export type Mapping = {
  front: number;
  back: number;
  topic: number;
  kind: number;
};
export function reviewImport(
  rows: string[][],
  mapping: Mapping,
  defaults: Pick<CardInput, "topic_id" | "kind">,
  topics: { id: string; name: string }[],
  ownFronts: string[],
  options?: { sharedFrontKeys: Set<string> },
) {
  if (rows.length > CARD_IMPORT_ROW_LIMIT)
    throw new Error("Import at most 500 rows.");
  if (mapping.front < 0 || mapping.back < 0 || mapping.front === mapping.back)
    throw new Error("Map separate Front and Back columns.");
  const own =
    options?.sharedFrontKeys ?? new Set(ownFronts.map(normaliseFront));
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const topic = row[mapping.topic]?.trim();
    const card = {
      front: row[mapping.front]?.trim() ?? "",
      back: row[mapping.back]?.trim() ?? "",
      topic_id: topic
        ? (topics.find(
            (t) =>
              t.id === topic || t.name.toLowerCase() === topic.toLowerCase(),
          )?.id ?? topic)
        : defaults.topic_id,
      kind: row[mapping.kind]?.trim().toLowerCase() || defaults.kind,
    } as CardInput;
    const error =
      cardSchema.safeParse(card).error?.issues[0].message ??
      (topics.some((t) => t.id === card.topic_id)
        ? null
        : "Choose a valid subtopic");
    const key = options
      ? `${card.kind}|${normaliseFront(card.front)}`
      : normaliseFront(card.front);
    const duplicate = own.has(key)
      ? options
        ? "Already a Claro card"
        : "Already in your cards"
      : seen.has(key)
        ? "Repeated in this file"
        : null;
    const status = error ? "Invalid" : duplicate ? "Duplicate" : "Ready";
    if (!error) seen.add(key);
    return { index, card, status, error: error ?? duplicate };
  });
}
/** Cells starting like a formula are prefixed with ' so spreadsheets keep them as text. */
export function exportCards(
  cards: CardInput[],
  topics: { id: string; name: string }[],
) {
  const quote = (s: string) =>
    `"${(/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
  return [
    ["Front", "Back", "Topic", "Kind"],
    ...cards.map((c) => [
      c.front,
      c.back,
      topics.find((t) => t.id === c.topic_id)?.name ?? c.topic_id,
      c.kind,
    ]),
  ]
    .map((r) => r.map(quote).join(","))
    .join("\r\n");
}
