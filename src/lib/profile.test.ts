import { expect, it } from "vitest";
import {
  passwordSchema,
  profileSchema,
  reviewHref,
  reviewOutcome,
} from "./profile";
const details = { full_name: "Om", school: "", year_level: "11" };
it("accepts only the editable columns and trims optional school", () => {
  expect(
    profileSchema.parse({
      ...details,
      full_name: " Om ",
      school: " School ",
      role: "admin",
      email: "other@example.com",
    }),
  ).toEqual({ full_name: "Om", school: "School", year_level: 11 });
  expect(
    profileSchema.parse({ ...details, year_level: "" }).year_level,
  ).toBeNull();
  expect(profileSchema.parse({ ...details, year_level: "12" }).year_level).toBe(
    12,
  );
});
it("enforces name and school boundaries", () => {
  for (const full_name of ["", " ", "A", "A".repeat(81)])
    expect(profileSchema.safeParse({ ...details, full_name }).success).toBe(
      false,
    );
  expect(
    profileSchema.safeParse({
      ...details,
      full_name: "A".repeat(80),
      school: "S".repeat(120),
    }).success,
  ).toBe(true);
  expect(
    profileSchema.safeParse({ ...details, school: "S".repeat(121) }).success,
  ).toBe(false);
  expect(
    profileSchema.safeParse({ ...details, year_level: "10" }).success,
  ).toBe(false);
});
it("validates password length, confirmation and a different password with exact copy", () => {
  const valid = {
    current_password: "old-password",
    password: "12345678",
    confirm: "12345678",
  };
  expect(passwordSchema.safeParse(valid).success).toBe(true);
  for (const [fields, copy] of [
    [{ password: "short", confirm: "short" }, "Use at least 8 characters"],
    [{ confirm: "different" }, "Passwords don't match"],
    [
      { password: "old-password", confirm: "old-password" },
      "Choose a different password",
    ],
  ] as const) {
    const result = passwordSchema.safeParse({ ...valid, ...fields });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe(copy);
  }
});
it("shows pending, unchanged and changed review outcomes including zero", () => {
  expect(reviewOutcome({ status: "open", ai_mark: 3, final_mark: null })).toBe(
    "Being checked",
  );
  expect(reviewOutcome({ status: "resolved", ai_mark: 3, final_mark: 4 })).toBe(
    "Changed 3 → 4",
  );
  expect(reviewOutcome({ status: "resolved", ai_mark: 0, final_mark: 0 })).toBe(
    "Unchanged",
  );
  expect(reviewOutcome({ status: "resolved", ai_mark: 3, final_mark: 0 })).toBe(
    "Changed 3 → 0",
  );
  expect(
    reviewOutcome({ status: "resolved", ai_mark: null, final_mark: 4 }),
  ).toBe("Changed to 4");
  expect(
    reviewOutcome({ status: "resolved", ai_mark: 3, final_mark: null }),
  ).toBe("Being checked");
});
it.each([
  ["sprint", "/student/sprint/sit/results#q-2"],
  ["paper", "/student/papers/sit/results#q-2"],
  ["single", "/student/activity/sit#q-2"],
])("links %s reviews to the question in their report", (kind, href) => {
  expect(reviewHref({ kind, id: "sit" }, 2)).toBe(href);
});
