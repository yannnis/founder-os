import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@typesafe-ai/sdk"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // This app sits next to another Next.js project. Keep Turbopack on this folder.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
