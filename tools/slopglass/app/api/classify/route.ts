import { classifyPost } from "@/lib/slop/classify";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const hits: number[] = [];
const LIMIT = 120;

function overLimit(): boolean {
  const now = Date.now();
  while (hits.length > 0 && hits[0] < now - 60_000) hits.shift();
  if (hits.length >= LIMIT) return true;
  hits.push(now);
  return false;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  if (overLimit()) {
    return Response.json(
      { ok: false, code: "rate_limited", error: "Slopglass is judging too many posts at once. Give it a second." },
      { status: 429, headers: cors },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: "bad_request", error: "Send a JSON body." }, { status: 400, headers: cors });
  }

  const text = body && typeof body === "object" && "text" in body ? body.text : undefined;
  const result = await classifyPost({ text });
  const { status, ...payload } = result;
  return Response.json(payload, { status, headers: cors });
}
