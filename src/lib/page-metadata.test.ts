/// <reference types="vite/client" />
import { expect, it } from "vitest";
import { pageMetadata } from "./page-metadata";

it.each(["Profile", "Questions", "Flashcards"])(
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
  const title =
    source.match(
      /export const metadata(?:: Metadata)? = (?:pageMetadata\("([^"]+)"\)|\{ title: "([^"]+)" \})/,
    ) ??
    // Pages titled by their data fall back to a plain label through the same helper.
    source.match(
      /export async function generateMetadata[\s\S]*?return pageMetadata\([^;]*?\?\? "([^"]+)"\)/,
    );
  expect(title).not.toBeNull();
  const label = title![1] ?? title![2];
  expect(label).not.toMatch(/·\s*Claro/);
  expect(pageMetadata(label).title).toBe(label);
});

it("has no student Papers pages or links from student pages", () => {
  const studentPages = Object.entries(pages).filter(([path]) =>
    path.includes("/student/"),
  );
  for (const [path, source] of studentPages) {
    expect(path).not.toContain("/student/papers/");
    expect(source).not.toContain("/student/papers");
  }
});

it("has no admin Papers routes or links and retains Questions", () => {
  for (const [path, source] of Object.entries(pages)) {
    expect(path).not.toContain("/admin/content/papers/");
    expect(source).not.toContain("/admin/content/papers");
  }
  const questions = pages["../app/admin/content/questions/page.tsx"];
  expect(questions).toContain('pageMetadata("Questions")');
  expect(questions).toContain("<QuestionsTable");
  expect(questions).toContain("<ImportReview");
});
