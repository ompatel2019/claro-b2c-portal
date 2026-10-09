import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Home and sprints moved under /student (§3, §7); keep old links working.
  async redirects() {
    return [
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
