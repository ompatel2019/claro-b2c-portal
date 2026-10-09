/// <reference types="vite/client" />
import { expect, it } from "vitest";
import { pageMetadata } from "./page-metadata";

it.each(["Profile", "Questions", "Flashcards", "Papers"])(
  "leaves %s for the root title template",
  (title) => {
    expect(pageMetadata(title)).toEqual({ title });
  },
);

it.each(["Profile · Claro", "Profile · Claro · Claro", " Profile · Claro "])(
  "removes template suffixes from %s",
  (title) => {
    expect(pageMetadata(title)).toEqual({ title: "Profile" });
  },
);

// Read routes without executing their server components or database imports.
const pages = import.meta.glob("../app/**/page.tsx", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

it.each(
  Object.entries(pages).filter(([path]) => !path.includes("/admin/marking/")),
)("%s declares an unbranded page title", (_, source) => {
  const title = source.match(
    /export const metadata(?:: Metadata)? = (?:pageMetadata\("([^"]+)"\)|\{ title: "([^"]+)" \})/,
  );
  expect(title).not.toBeNull();
  const label = title![1] ?? title![2];
  expect(label).not.toMatch(/·\s*Claro/);
  expect(pageMetadata(label).title).toBe(label);
});
