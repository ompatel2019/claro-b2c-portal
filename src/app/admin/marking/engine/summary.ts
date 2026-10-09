import {
  evalAgreement,
  evalMarkDistance,
  type EvalItem,
} from "../accuracy/helpers";

export type OfflineEvalRun = {
  meta: {
    stamp: string;
    label: string;
    items?: unknown;
    limit?: number | null;
    marker: {
      model: string;
      effort?: string | { grade?: string; check?: string; reconcile?: string };
    };
  };
  items: (EvalItem & {
    usd?: number;
    judgeUsd?: number;
    seconds?: number;
    check?: unknown;
  })[];
};
const finite = (value: number | undefined) =>
  Number.isFinite(value) ? value! : 0;

/** Return aggregate fields only: no answers, feedback or item identifiers. */
export function summariseRun(run: OfflineEvalRun, id = run.meta.stamp) {
  const items = run.items ?? [];
  const summary = evalAgreement(items, "numeric");
  const deltas = items.map(evalMarkDistance).filter((delta) => delta != null);
  const totalDelta = deltas.reduce((sum, delta) => sum + delta, 0);
  const effort = run.meta.marker.effort;
  const levels =
    typeof effort === "object" && effort
      ? [effort.grade, effort.check, effort.reconcile]
      : [];
  const thinking: string | undefined =
    typeof effort === "string"
      ? effort
      : levels.some((level) => level != null)
        ? new Set(levels).size === 1
          ? levels[0]
          : levels.map((level) => level ?? "Not recorded").join("/")
        : undefined;
  return {
    id,
    stamp: run.meta.stamp,
    label: run.meta.label,
    model: run.meta.marker.model,
    thinking,
    passes: items.some((item) => item.check != null)
      ? "With blind check"
      : "Single",
    subset: run.meta.items != null || run.meta.limit != null,
    items: items.length,
    ...summary,
    meanDelta: deltas.length ? totalDelta / deltas.length : null,
    totalDelta: deltas.length ? totalDelta : null,
    cost: items.reduce(
      (sum, item) => sum + finite(item.usd) + finite(item.judgeUsd),
      0,
    ),
    seconds: items.reduce((sum, item) => sum + finite(item.seconds), 0),
    by: "CLI",
  };
}
export type RunSummary = ReturnType<typeof summariseRun>;

// run.mts stamps are already Sydney wall time, not UTC timestamps.
export function runDateLabel(stamp: string) {
  const match = /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/.exec(stamp);
  if (!match) return stamp;
  return `${new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" }).format(new Date(`${match[1]}T00:00:00+10:00`))}, ${match[2]}:${match[3]}`;
}
export function durationLabel(seconds: number) {
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${total % 60}s`;
  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m ${total % 60}s`;
}
