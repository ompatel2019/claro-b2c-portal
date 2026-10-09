import type { FeedbackComment } from "@/lib/feedback";

export const reasons = {
  check_disagreed: "Checker disagreed",
  student_dispute: "Student dispute",
  spot_check: "Spot check",
};
export function ageLabel(created: string) {
  const hours = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(created)) / 3_600_000),
  );
  return hours < 1
    ? "<1 h"
    : hours < 24
      ? `${hours} h`
      : `${Math.floor(hours / 24)} days`;
}

export function commentChanged(
  before: FeedbackComment,
  after: FeedbackComment,
) {
  return (["quote", "start", "kind", "tag", "body", "next_mark"] as const).some(
    (key) => before[key] !== after[key],
  );
}
export function concurrentMessage(resolvedAt: string | null | undefined) {
  const minutes = resolvedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(resolvedAt)) / 60000))
    : 0;
  return `Resolved by another admin ${minutes} min ago`;
}
