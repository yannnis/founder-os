import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const localEnv = path.join(process.cwd(), "tools", "slopglass", ".env.local");
const redditEnv = path.join(process.cwd(), "reddit", ".env");
for (const file of [localEnv, redditEnv]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["@typesafe-ai/sdk"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
