/** Admin extension of the shared §3.7 card validator and importer. */
import { z } from "zod";
import {
  cardSchema as baseSchema,
  reviewImport as reviewCards,
} from "./card-import";
export const cardSchema = baseSchema.extend({
  id: z.string().min(1).max(200).nullable(),
  status: z.enum(["draft", "live", "retired"]),
});
export type CardInput = z.infer<typeof cardSchema>;
export type ImportRecord = {
  front: string;
  back: string;
  topic_id: string;
  kind: string;
};
export type ReviewedRecord = ImportRecord & {
  status: "ready" | "duplicate" | "invalid";
  reason: string;
};
/** Shared cards dedupe by kind + normalised front; students retain their existing front-only rule. */
export function reviewImport(
  records: ImportRecord[],
  existing: Set<string>,
): ReviewedRecord[] {
  return reviewCards(
    records.map((r) => [r.front, r.back, r.topic_id, r.kind]),
    { front: 0, back: 1, topic: 2, kind: 3 },
    { topic_id: "", kind: "term" },
    records
      .filter((r) => r.topic_id)
      .map((r) => ({ id: r.topic_id, name: r.topic_id })),
    [],
    { sharedFrontKeys: existing },
  ).map((r) => ({
    ...r.card,
    status: r.status.toLowerCase() as ReviewedRecord["status"],
    reason: r.error ?? "",
  }));
}
