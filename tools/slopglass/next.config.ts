import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@typesafe-ai/sdk"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
