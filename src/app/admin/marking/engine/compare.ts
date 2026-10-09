import {
  evalAgreement,
  evalMarkDistance,
  type EvalItem,
} from "../accuracy/helpers";
import type { Row } from "@/lib/ai/eval/report";
import type { OfflineEvalRun } from "./summary";
import a1 from "@/lib/ai/eval/a1-eval-set.json";

export type CompareItem = EvalItem & {
  id: string;
  label?: string;
  feedback?: string | null;
  exampleId?: string;
  feedbackComments?: Row["feedbackComments"];
};
export type CompareRun = Omit<OfflineEvalRun, "items" | "meta"> & {
  meta: OfflineEvalRun["meta"] & {
    items?: number[] | null;
    limit?: number | null;
  };
  items: CompareItem[];
};
export const itemGroup = (item: CompareItem) =>
  JSON.stringify([item.section, item.id, item.label ?? ""]);
export function indexedItems(run: CompareRun) {
  const counts = new Map<string, number>();
  const sectionPositions = new Map<string, number>();
  // The CLI filters the full array in order, regardless of argument order or duplicates.
  const indices = run.meta.items
    ? [...new Set(run.meta.items)].sort((a, b) => a - b)
    : null;
  return run.items.map((item, index) => {
    const position = sectionPositions.get(item.section) ?? 0;
    sectionPositions.set(item.section, position + 1);
    // --limit takes a prefix of each section. Only Held-out matching needs
    // original indices; Claro uses its question id and fixture label.
    const limitedIndex =
      item.section === "A1"
        ? position
        : item.section === "Held-out"
          ? a1.length + position
          : undefined;
    const group = itemGroup(item);
    const occurrence = counts.get(group) ?? 0;
    counts.set(group, occurrence + 1);
    return {
      item,
      originalIndex: indices
        ? indices[index]
        : run.meta.limit == null
          ? index
          : limitedIndex,
      group,
      occurrence,
      key: JSON.stringify([group, occurrence]),
    };
  });
}
export function validRunIds(
  a: unknown,
  b: unknown,
  known: ReadonlySet<string>,
): a is string {
  const safe = (id: unknown): id is string =>
    typeof id === "string" && /^[a-zA-Z0-9-]+$/.test(id) && known.has(id);
  return safe(a) && safe(b) && a !== b;
}
export function itemResult(item: CompareItem) {
  const state = item.flags?.excluded
    ? "Excluded"
    : item.error
      ? "Errored"
      : item.mark == null || !Number.isFinite(item.mark)
        ? "Unmarked"
        : null;
  const distance = state ? null : evalMarkDistance(item);
  const low =
    typeof item.expected === "number" ? item.expected : item.expected[0];
  return {
    state,
    mark: state ? null : item.mark,
    delta:
      distance == null
        ? null
        : distance === 0
          ? 0
          : item.mark! < low
            ? -distance
            : distance,
    agrees:
      distance == null
        ? null
        : evalAgreement([item], "numeric").agreement === 1,
  };
}
export type CompareRow = ReturnType<typeof compareRuns>["rows"][number];
export function compareRuns(a: CompareRun, b: CompareRun) {
  const left = indexedItems(a),
    right = indexedItems(b);
  const used = new Set<string>();
  const pairs = left.flatMap((entry) => {
    const other = right.find((candidate) => {
      if (
        used.has(candidate.key) ||
        candidate.item.section !== entry.item.section
      )
        return false;
      if (entry.item.exampleId && candidate.item.exampleId)
        return entry.item.exampleId === candidate.item.exampleId;
      if (entry.group !== candidate.group) return false;
      if (
        entry.item.section === "Held-out" &&
        (a.meta.items != null || b.meta.items != null)
      )
        return (
          entry.originalIndex != null &&
          entry.originalIndex === candidate.originalIndex
        );
      return entry.occurrence === candidate.occurrence;
    });
    if (!other) return [];
    used.add(other.key);
    return [{ ...entry, other: other.item, keyB: other.key }];
  });
  const rows = pairs.map(({ item, other, key, keyB, occurrence }) => {
    const resultA = itemResult(item),
      resultB = itemResult(other);
    const equal =
      resultA.mark != null && resultB.mark != null
        ? resultA.mark === resultB.mark
        : null;
    return {
      key,
      keyB,
      exampleId: item.exampleId,
      id: item.id,
      section: item.section,
      label: item.label ?? "",
      occurrence,
      expected:
        typeof item.expected === "number"
          ? String(item.expected)
          : item.expected.join("–"),
      expectedB:
        typeof other.expected === "number"
          ? String(other.expected)
          : other.expected.join("–"),
      a: resultA,
      b: resultB,
      equal,
      differs:
        equal === false || (equal == null && resultA.state !== resultB.state),
    };
  });
  const metrics = (items: CompareItem[]) =>
    evalAgreement(
      items.filter((item) => !itemResult(item).state),
      "numeric",
    );
  return {
    rows,
    onlyA: left.length - pairs.length,
    onlyB: right.length - pairs.length,
    a: metrics(pairs.map((p) => p.item)),
    b: metrics(pairs.map((p) => p.other)),
    differing: rows.filter((r) => r.differs).length,
  };
}
export type CompareData = ReturnType<typeof compareRuns> & {
  idA: string;
  idB: string;
  labelA: string;
  labelB: string;
  rows: (CompareRow & { stem?: string })[];
};
export type CompareDetails = {
  answer?: string;
  answerA?: string;
  answerB?: string;
  answerWarningA?: string;
  answerWarningB?: string;
  commentsA?: Row["feedbackComments"];
  commentsB?: Row["feedbackComments"];
  markA?: number | null;
  markB?: number | null;
  marksA?: number;
  marksB?: number;
  notes?: string;
  feedbackA: string;
  feedbackB: string;
};
