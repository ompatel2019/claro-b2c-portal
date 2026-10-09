import type { Metadata } from "next";

/** The root layout adds the brand to every page title. */
export function pageMetadata(title: string): Metadata {
  return {
    title: title
      .trim()
      .replace(/(?:\s*·\s*Claro)+$/u, "")
      .trim(),
  };
}
