import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sprints moved to /student/sprint (§7); keep old links working.
  async redirects() {
    return [
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
