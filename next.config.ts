import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile lives one level up).
  turbopack: { root: path.join(__dirname) },
  // Produces the minimal server bundle copied by the production Dockerfile.
  output: "standalone",
};

export default nextConfig;
