import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Topic Sprint setup moved to /student/sprint (§7); keep old links working.
  async redirects() {
    return [
      { source: "/practice", destination: "/student/sprint", permanent: false },
    ];
  },
};

export default nextConfig;
