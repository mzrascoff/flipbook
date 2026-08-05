import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The parent directory holds an unrelated package.json, which Turbopack would
  // otherwise treat as the workspace root.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
