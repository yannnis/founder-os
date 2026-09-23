import { normalizeSubreddit } from "./parse";
import { PRODUCT_PROMPT, rejectedSource } from "./product-prompt";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1-mini";

export class WriterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriterError";
  }
}

export type ProductAnswer = {
  description: string;
  subreddit: string | null;
};

export function parseProductAnswer(raw: string): ProductAnswer {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new WriterError("The description didn't come back as text.");
  }
  if (!data || typeof data !== "object") throw new WriterError("The description didn't come back as text.");
  const record = data as { description?: unknown; subreddit?: unknown };
  const description = typeof record.description === "string" ? record.description.replace(/\s+/g, " ").trim() : "";
  const subreddit = typeof record.subreddit === "string" ? normalizeSubreddit(record.subreddit) : null;
  return { description, subreddit };
}

export async function askProduct(source: string): Promise<ProductAnswer> {
  const started = Date.now();
  const content = await complete(source);
  const answer = parseProductAnswer(content);
  console.info(
    JSON.stringify({
      event: "reddit.described",
      model: modelId(),
      latencyMs: Date.now() - started,
      chars: answer.description.length,
      subreddit: answer.subreddit,
    }),
  );
  return answer;
}

/** Ask again once when the named community is missing or not on Reddit. */
export async function askSubreddit(source: string, proposed: string | null): Promise<string | null> {
  if (proposed && (await subredditExists(proposed))) return proposed;
  const retrySource = proposed
    ? rejectedSource(source, proposed)
    : `${source}\n\nThe last reply named no subreddit. Name one real subreddit.`;
  const again = await askProduct(retrySource);
  if (again.subreddit && (await subredditExists(again.subreddit))) return again.subreddit;
  return again.subreddit;
}

function modelId(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

async function complete(source: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new WriterError("OPENAI_API_KEY is not set on the server.");
  let response: Response;
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId(),
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PRODUCT_PROMPT },
          { role: "user", content: source },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new WriterError("Couldn't reach OpenAI.");
  }
  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  } | null;
  if (response.status === 401) throw new WriterError("OpenAI refused the API key.");
  if (response.status === 429) throw new WriterError("OpenAI is busy. Try again in a moment.");
  if (!response.ok) {
    const message = payload?.error?.message?.replace(/sk-[A-Za-z0-9_-]+/g, "the API key").replace(/\s+/g, " ").slice(0, 180);
    throw new WriterError(message || "OpenAI didn't answer.");
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new WriterError("OpenAI didn't write a description.");
  return content;
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

async function subredditExists(name: string): Promise<boolean> {
  try {
    const response = await fetch(`https://www.reddit.com/r/${name}/new.rss?limit=1`, {
      headers: { "User-Agent": UA, Accept: "application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) return false;
    await response.body?.cancel();
    return true;
  } catch {
    return true;
  }
}
