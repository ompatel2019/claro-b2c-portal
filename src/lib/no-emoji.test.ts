import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Student and admin UI uses Claro's own icons (icons.tsx), never emoji glyphs.
it("renders no emoji in components or pages", () => {
  const files = execSync(
    "find src/components src/app -name '*.tsx' -not -name '*.test.tsx'",
  )
    .toString()
    .split("\n")
    .filter(Boolean);
  const offenders = files.filter((f) =>
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(readFileSync(f, "utf8")),
  );
  expect(offenders).toEqual([]);
});
