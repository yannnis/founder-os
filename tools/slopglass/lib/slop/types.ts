import type { Bucket, WorthFeatures } from "./worth";

export type SlopReading = {
  bucket: Bucket;
  label: string;
  hint: string;
  reason: string;
  features: WorthFeatures;
  model: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
};

export type ClassifyResponse =
  | { ok: true; cached: boolean; reading: SlopReading }
  | { ok: true; skipped: true; reason: "empty" | "too_short" }
  | { ok: false; error: string; code: "unauthorized" | "rate_limited" | "upstream" | "bad_request" };
