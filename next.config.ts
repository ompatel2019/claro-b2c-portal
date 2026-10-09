import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
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
