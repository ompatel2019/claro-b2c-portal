import { z } from "zod";

export const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Use 2–80 characters for your name")
    .max(80, "Use 2–80 characters for your name"),
  year_level: z.enum(["11", "12", ""]).transform((v) => (v ? Number(v) : null)),
  school: z.string().trim().max(120, "Use no more than 120 characters"),
});
export const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.confirm)
      ctx.addIssue({
        code: "custom",
        path: ["confirm"],
        message: "Passwords don't match",
      });
    if (v.password === v.current_password)
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Choose a different password",
      });
  });
export function reviewOutcome(review: {
  status: string;
  ai_mark: number | null;
  final_mark: number | null;
}) {
  if (review.status === "open" || review.final_mark === null)
    return "Being checked";
  if (review.ai_mark === review.final_mark) return "Unchanged";
  return review.ai_mark === null
    ? `Changed to ${review.final_mark}`
    : `Changed ${review.ai_mark} → ${review.final_mark}`;
}
export function reviewHref(
  session: { id: string; kind: string },
  position: number,
) {
  const path =
    session.kind === "sprint"
      ? `sprint/${session.id}/results`
      : session.kind === "paper"
        ? `papers/${session.id}/results`
        : `activity/${session.id}`;
  return `/student/${path}#q-${position}`;
}
