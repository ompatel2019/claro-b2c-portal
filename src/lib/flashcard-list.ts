import { pageOf, tableParams } from "./admin";
import type { FlashcardRow } from "./admin-flashcards";
import { dateLabel, type Topic } from "./practice";

/** Filter all shared rows before sorting and paging, including SQL aggregate columns. */
export function flashcardPage(
  rows: FlashcardRow[],
  topics: Topic[],
  f: Record<string, string | undefined>,
) {
  const status = ["live", "draft", "retired"].includes(f.status ?? "")
    ? f.status!
    : "live";
  const names = new Map(topics.map((t) => [t.id, t.name]));
  const children = new Set(
    topics.filter((t) => t.parent_id === f.topic).map((t) => t.id),
  );
  const query = f.q?.trim().toLowerCase() ?? "";
  const filtered = rows.filter(
    (r) =>
      r.status === status &&
      (!f.kind || r.kind === f.kind) &&
      (!f.topic || r.topic_id === f.topic || children.has(r.topic_id)) &&
      (!f.origin || r.origin === f.origin) &&
      (!query ||
        [
          r.id,
          r.front,
          r.back,
          r.kind,
          names.get(r.topic_id),
          r.status,
          r.origin,
          r.reviews,
          r.knew_first == null ? "No reviews" : `${r.knew_first}%`,
          r.avg == null ? "No reviews" : `${r.avg}%`,
          dateLabel(r.updated_at, true),
        ].some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(query),
        )),
  );
  const keys: Record<string, (r: FlashcardRow) => string | number | null> = {
    front: (r) => r.front.toLowerCase(),
    back: (r) => r.back.toLowerCase(),
    kind: (r) => r.kind,
    topic: (r) => names.get(r.topic_id) ?? r.topic_id,
    status: (r) => r.status,
    origin: (r) => r.origin,
    reviews: (r) => r.reviews,
    knew: (r) => r.knew_first,
    avg: (r) => r.avg,
    updated: (r) => r.updated_at,
  };
  const fallback = { id: "updated", dir: "desc" as const };
  const { sort, page } = tableParams(f, fallback);
  return { ...pageOf(filtered, keys, sort, page, fallback), status };
}
