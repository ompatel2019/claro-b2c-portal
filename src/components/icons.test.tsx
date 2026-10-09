import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import * as icons from "./icons";

const glyphs = Object.entries(icons) as [string, icons.Icon][];

it("draws every icon in the one Claro style", () => {
  for (const [name, Glyph] of glyphs) {
    const svg = render(<Glyph className="size-4" />).container.querySelector(
      "svg",
    )!;
    expect(svg.getAttribute("viewBox"), name).toBe("0 0 24 24");
    expect(svg.getAttribute("stroke"), name).toBe("currentColor");
    expect(svg.getAttribute("stroke-width"), name).toBe("1.75");
    expect(svg.getAttribute("stroke-linecap"), name).toBe("round");
    expect(svg.getAttribute("aria-hidden"), name).toBe("true");
    expect(svg.getAttribute("class"), name).toBe("size-4");
  }
});

it("keeps only icons that are used, and no stock icon library", () => {
  const files = execSync("grep -rlF '@/components/icons' src --include=*.tsx")
    .toString()
    .split("\n")
    .filter((f) => f && !f.endsWith(".test.tsx"));
  const src = files
    .flatMap((f) => [
      ...readFileSync(f, "utf8").matchAll(
        /import [^;]*?from "@\/components\/icons"/g,
      ),
    ])
    .join("\n");
  for (const [name] of glyphs)
    expect(src, `${name} is unused`).toMatch(new RegExp(`\\b${name}\\b`));
  expect(
    execSync(
      "grep -rl --exclude=icons.test.tsx lucide src package.json || true",
    ).toString(),
  ).toBe("");
});
