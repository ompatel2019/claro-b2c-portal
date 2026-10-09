import { describe, expect, it } from "vitest";
import { needsWelcome, welcomeProfileSchema } from "./welcome";

describe("first sign-in", () => {
  it("only welcomes students without a Year and with no sessions", () => {
    for (const sessionCount of [0, 1, 50, null]) {
      expect(
        needsWelcome({ role: "student", year_level: null }, sessionCount),
      ).toBe(sessionCount === 0);
      for (const year_level of [11, 12]) {
        expect(
          needsWelcome({ role: "student", year_level }, sessionCount),
        ).toBe(false);
      }
      expect(
        needsWelcome({ role: "admin", year_level: null }, sessionCount),
      ).toBe(false);
    }
  });

  it("requires Year 11 or Year 12 and normalises profile fields", () => {
    for (const year_level of ["11", "12"]) {
      expect(
        welcomeProfileSchema.parse({
          full_name: "  Student Name  ",
          year_level,
          school: "  School  ",
        }),
      ).toEqual({
        full_name: "Student Name",
        year_level: Number(year_level),
        school: "School",
      });
    }
    for (const year_level of ["", "10", "13", null, undefined]) {
      expect(
        welcomeProfileSchema.safeParse({
          full_name: "Student",
          year_level,
          school: "",
        }).success,
      ).toBe(false);
    }
  });

  it("enforces profile limits and allows no school", () => {
    const profile = { full_name: "Student", year_level: "11", school: "" };
    expect(welcomeProfileSchema.safeParse(profile).success).toBe(true);
    for (const full_name of [" ", "A", "A".repeat(81)]) {
      expect(
        welcomeProfileSchema.safeParse({ ...profile, full_name }).success,
      ).toBe(false);
    }
    expect(
      welcomeProfileSchema.safeParse({
        ...profile,
        full_name: "A".repeat(80),
        school: "S".repeat(120),
      }).success,
    ).toBe(true);
    expect(
      welcomeProfileSchema.safeParse({ ...profile, school: "S".repeat(121) })
        .success,
    ).toBe(false);
  });
});
