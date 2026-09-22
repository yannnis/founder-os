import { createHash } from "node:crypto";

import { APIConnectionError, APIError, AuthenticationError, RateLimitError, TypeSafeClient, noul } from "@typesafe-ai/sdk";

import { MIN_POST_CHARS, MODEL_ID, POST_CONTEXT, normalizePost } from "./rubric";
import type { ClassifyResponse, SlopReading } from "./types";
import { BUCKET_COPY, WORTH_QUESTIONS, bucketOf, postReason, type WorthFeatures } from "./worth";

const CACHE_LIMIT = 500;
const CACHE_PREFIX = "worth1:";

type CacheEntry = {
  features: WorthFeatures;
  model: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

let client: TypeSafeClient | null = null;

function getClient(): TypeSafeClient {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingKeyError();
  }
  if (!client) {
    client = new TypeSafeClient({
      apiKey,
      defaultModel: MODEL_ID,
      timeout: 20_000,
      logLevel: "warn",
    });
  }
  return client;
}

export class MissingKeyError extends Error {
  constructor() {
    super("TYPESAFE_API_KEY is not set");
    this.name = "MissingKeyError";
  }
}

export function hasApiKey(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}

function cacheKey(text: string): string {
  return CACHE_PREFIX + createHash("sha256").update(text).digest("hex");
}

function remember(key: string, entry: CacheEntry) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, entry);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

function questions() {
  return {
    specific: noul(WORTH_QUESTIONS.specific.instructions, WORTH_QUESTIONS.specific.criteria),
    fresh: noul(WORTH_QUESTIONS.fresh.instructions, WORTH_QUESTIONS.fresh.criteria),
    bait: noul(WORTH_QUESTIONS.bait.instructions, WORTH_QUESTIONS.bait.criteria),
    promo: noul(WORTH_QUESTIONS.promo.instructions, WORTH_QUESTIONS.promo.criteria),
    empty: noul(WORTH_QUESTIONS.empty.instructions, WORTH_QUESTIONS.empty.criteria),
    funny: noul(WORTH_QUESTIONS.funny.instructions, WORTH_QUESTIONS.funny.criteria),
  };
}

async function askJev(text: string): Promise<CacheEntry> {
  const key = cacheKey(text);
  const hit = cache.get(key);
  if (hit) return { ...hit, latencyMs: 0 };

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const started = Date.now();
    const response = await getClient().systemOne({
      model: MODEL_ID,
      state: { post: { text, context: POST_CONTEXT } },
      questions: questions(),
    });
    const latencyMs = Date.now() - started;
    const answers = response.answers;
    const features: WorthFeatures = {
      specific: answers.specific.noul,
      fresh: answers.fresh.noul,
      bait: answers.bait.noul,
      promo: answers.promo.noul,
      empty: answers.empty.noul,
      funny: answers.funny.noul,
    };
    const entry: CacheEntry = {
      features,
      model: response.model,
      latencyMs,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
    remember(key, entry);
    console.info(
      JSON.stringify({
        event: "slopglass.judged",
        model: response.model,
        latencyMs,
        chars: text.length,
        bucket: bucketOf(features),
        inputTokens: entry.usage.inputTokens,
        outputTokens: entry.usage.outputTokens,
      }),
    );
    return entry;
  })();

  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}

function toReading(entry: CacheEntry, cached: boolean): SlopReading {
  const bucket = bucketOf(entry.features);
  const copy = BUCKET_COPY[bucket];
  return {
    bucket,
    label: copy.label,
    hint: copy.hint,
    reason: postReason(entry.features, bucket),
    features: entry.features,
    model: entry.model,
    latencyMs: cached ? 0 : entry.latencyMs,
    usage: entry.usage,
  };
}

export async function classifyPost(input: { text: unknown }): Promise<ClassifyResponse & { status: number }> {
  if (typeof input.text !== "string") {
    return { status: 400, ok: false, code: "bad_request", error: "Post text has to be a string." };
  }

  const text = normalizePost(input.text);
  if (!text) {
    return { status: 200, ok: true, skipped: true, reason: "empty" };
  }
  if (text.length < MIN_POST_CHARS) {
    return { status: 200, ok: true, skipped: true, reason: "too_short" };
  }
  if (text.length > 12_000) {
    return { status: 400, ok: false, code: "bad_request", error: "That post is past the 12,000 character limit." };
  }

  const key = cacheKey(text);
  const cached = cache.has(key);

  try {
    const entry = await askJev(text);
    const reading = toReading(entry, cached || entry.latencyMs === 0);
    return { status: 200, ok: true, cached: cached || entry.latencyMs === 0, reading };
  } catch (error) {
    return { status: statusFor(error), ...errorBody(error) };
  }
}

function statusFor(error: unknown): number {
  if (error instanceof MissingKeyError || error instanceof AuthenticationError) return 401;
  if (error instanceof RateLimitError) return 429;
  if (error instanceof APIError && (error.status === 429 || error.status === 529)) return 429;
  if (error instanceof APIError) return error.status >= 400 && error.status <= 599 ? error.status : 502;
  return 502;
}

function errorBody(error: unknown): Extract<ClassifyResponse, { ok: false }> {
  if (error instanceof MissingKeyError) {
    return {
      ok: false,
      code: "unauthorized",
      error: "TYPESAFE_API_KEY is not set on the Slopglass server.",
    };
  }
  if (error instanceof AuthenticationError) {
    return {
      ok: false,
      code: "unauthorized",
      error: "Jev refused the API key. Set TYPESAFE_API_KEY on the Slopglass server.",
    };
  }
  if (error instanceof RateLimitError || (error instanceof APIError && (error.status === 429 || error.status === 529))) {
    return {
      ok: false,
      code: "rate_limited",
      error: "Jev is busy. Scroll that post back into view and Slopglass will ask again.",
    };
  }
  if (error instanceof APIConnectionError) {
    return { ok: false, code: "upstream", error: "Couldn't reach Jev. Check the network and try again." };
  }
  if (error instanceof APIError) {
    const detail = error.message.replace(/\s+/g, " ").slice(0, 180);
    return { ok: false, code: "upstream", error: detail || `Jev returned ${error.status}.` };
  }
  return { ok: false, code: "upstream", error: "Jev didn't return a judgment." };
}
