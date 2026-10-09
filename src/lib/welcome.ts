import { z } from "zod";

/** A missing year alone does not make an existing account a first visit. */
export function needsWelcome(
  profile: { role: string; year_level: number | null },
  sessionCount: number | null,
) {
  return (
    profile.role === "student" &&
    profile.year_level === null &&
    sessionCount === 0
  );
}

/** Welcome uses the same profile write path, with Year required. */
export const welcomeProfileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Use 2–80 characters.")
    .max(80, "Use 2–80 characters."),
  year_level: z
    .enum(["11", "12"], { error: "Choose your year." })
    .transform(Number),
  school: z.string().trim().max(120, "Use at most 120 characters."),
});
