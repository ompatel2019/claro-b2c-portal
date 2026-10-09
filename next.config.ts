import type { NextConfig } from "next";
import { docCommitDates } from "./src/lib/ai/docs/commit-dates.mjs";

const nextConfig: NextConfig = {
  // The 1 MiB CSV limit needs room for JSON escaping (up to 6×) and Action metadata.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  env: { ENGINE_DOC_COMMIT_DATES: docCommitDates() },
  outputFileTracingIncludes: {
    "/admin/marking/engine": [
      "./src/lib/ai/docs/*.md",
      "./src/lib/ai/eval/results/*.json",
    ],
    "/admin/marking/accuracy": ["./src/lib/ai/eval/results/*.json"],
  },
  // Home and sprints moved under /student (§3, §7); keep old links working.
  async redirects() {
    return [
      {
        source: "/flashcards/:id/results",
        destination: "/student/flashcards/:id",
        permanent: false,
      },
      {
        source: "/flashcards/:id",
        destination: "/student/flashcards/:id",
        permanent: false,
      },
      {
        source: "/flashcards",
        destination: "/student/flashcards",
        permanent: false,
      },
      { source: "/", destination: "/student", permanent: false },
      { source: "/practice", destination: "/student/sprint", permanent: false },
      {
        source: "/practice/:id/results",
        destination: "/student/sprint/:id/results",
        permanent: false,
      },
      {
        source: "/practice/:id",
        destination: "/student/sprint/:id",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
