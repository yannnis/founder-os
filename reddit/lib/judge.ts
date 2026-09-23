import { createHash } from "node:crypto";

import { APIConnectionError, APIError, AuthenticationError, RateLimitError, TypeSafeClient, noul } from "@typesafe-ai/sdk";

import {
  REDDIT_QUESTIONS,
  SHORT_REASON,
  labelOf,
  reasonFor,
  type RedditFeatures,
  type RedditLabel,
} from "./qualify";

import { MODEL_ID } from "./model";

const CACHE_LIMIT = 500;
const MIN_CHARS = 15;

type CacheEntry = {
  features: RedditFeatures;
  model: string;
  latencyMs: number;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();
let client: TypeSafeClient | null = null;

export class MissingKeyError extends Error {
  constructor() {
    super("TYPESAFE_API_KEY is not set");
    this.name = "MissingKeyError";
  }
}

export type QualifyResult =
  | {
      ok: true;
      status: number;
      label: RedditLabel;
      reason: string;
      features: RedditFeatures;
      model: string;
      latencyMs: number;
      skipped: boolean;
    }
  | { ok: false; status: number; code: "bad_request" | "unauthorized" | "rate_limited" | "upstream"; error: string };

function getClient(): TypeSafeClient {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) throw new MissingKeyError();
  if (!client) {
    client = new TypeSafeClient({ apiKey, defaultModel: MODEL_ID, timeout: 20_000, logLevel: "warn" });
  }
  return client;
}

function questions() {
  return {
    lead: noul(REDDIT_QUESTIONS.lead.instructions, REDDIT_QUESTIONS.lead.criteria),
    switching: noul(REDDIT_QUESTIONS.switching.instructions, REDDIT_QUESTIONS.switching.criteria),
    competitor: noul(REDDIT_QUESTIONS.competitor.instructions, REDDIT_QUESTIONS.competitor.criteria),
    proof: noul(REDDIT_QUESTIONS.proof.instructions, REDDIT_QUESTIONS.proof.criteria),
    pain: noul(REDDIT_QUESTIONS.pain.instructions, REDDIT_QUESTIONS.pain.criteria),
    language: noul(REDDIT_QUESTIONS.language.instructions, REDDIT_QUESTIONS.language.criteria),
  };
}

export async function qualifyPost(input: { brief: unknown; title: unknown; text: unknown }): Promise<QualifyResult> {
  if (typeof input.brief !== "string" || typeof input.title !== "string" || typeof input.text !== "string") {
    return { ok: false, status: 400, code: "bad_request", error: "Send a product brief, a title, and post text." };
  }
  const brief = input.brief.replace(/\s+/g, " ").trim().slice(0, 2_000);
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 400);
  const text = input.text.replace(/\r\n/g, "\n").trim().slice(0, 8_000);
  if (brief.length < 40) {
    return { ok: false, status: 400, code: "bad_request", error: "The product description is too short to match against." };
  }
  if (`${title}\n${text}`.trim().length < MIN_CHARS) {
    return {
      ok: true,
      status: 200,
      label: "noise",
      reason: SHORT_REASON,
      features: { lead: 0, switching: 0, competitor: 0, proof: 0, pain: 0, language: 0 },
      model: MODEL_ID,
      latencyMs: 0,
      skipped: true,
    };
  }

  try {
    const entry = await ask(brief, title, text);
    const label = labelOf(entry.features);
    return {
      ok: true,
      status: 200,
      label,
      reason: reasonFor(label),
      features: entry.features,
      model: entry.model,
      latencyMs: entry.latencyMs,
      skipped: false,
    };
  } catch (error) {
    return fail(error);
  }
}

async function ask(brief: string, title: string, text: string): Promise<CacheEntry> {
  const key = createHash("sha256").update(`reddit1:${brief}\n${title}\n${text}`).digest("hex");
  const hit = cache.get(key);
  if (hit) return { ...hit, latencyMs: 0 };
  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const started = Date.now();
    const response = await getClient().systemOne({
      model: MODEL_ID,
      state: { product: { brief }, post: { title, text } },
      questions: questions(),
    });
    const answers = response.answers;
    const entry: CacheEntry = {
      features: {
        lead: answers.lead.noul,
        switching: answers.switching.noul,
        competitor: answers.competitor.noul,
        proof: answers.proof.noul,
        pain: answers.pain.noul,
        language: answers.language.noul,
      },
      model: response.model,
      latencyMs: Date.now() - started,
    };
    cache.set(key, entry);
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    console.info(
      JSON.stringify({
        event: "reddit.qualified",
        model: entry.model,
        latencyMs: entry.latencyMs,
        chars: title.length + text.length,
        label: labelOf(entry.features),
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
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

function fail(error: unknown): QualifyResult {
  if (error instanceof MissingKeyError) {
    return { ok: false, status: 401, code: "unauthorized", error: "TYPESAFE_API_KEY is not set on the server." };
  }
  if (error instanceof AuthenticationError) {
    return { ok: false, status: 401, code: "unauthorized", error: "Jev refused the API key." };
  }
  if (error instanceof RateLimitError || (error instanceof APIError && (error.status === 429 || error.status === 529))) {
    return { ok: false, status: 429, code: "rate_limited", error: "Jev is busy. The post will be asked again." };
  }
  if (error instanceof APIConnectionError) {
    return { ok: false, status: 502, code: "upstream", error: "Couldn't reach Jev." };
  }
  if (error instanceof APIError) {
    return { ok: false, status: 502, code: "upstream", error: error.message.replace(/\s+/g, " ").slice(0, 180) || "Jev failed." };
  }
  return { ok: false, status: 502, code: "upstream", error: "Jev didn't return a judgment." };
}
