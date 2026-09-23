import { qualifyPost } from "../../../lib/judge";

const hits: number[] = [];
const LIMIT = 120;

function overLimit(): boolean {
  const now = Date.now();
  while (hits.length > 0 && hits[0] < now - 60_000) hits.shift();
  if (hits.length >= LIMIT) return true;
  hits.push(now);
  return false;
}

export async function POST(request: Request) {
  if (overLimit()) {
    return Response.json({ ok: false, code: "rate_limited", error: "Too many posts at once. Give it a second." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Send a JSON body." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? body : {};
  const brief = "brief" in record ? record.brief : undefined;
  const title = "title" in record ? record.title : undefined;
  const text = "text" in record ? record.text : undefined;
  const result = await qualifyPost({ brief, title, text });
  const { status, ...payload } = result;
  return Response.json(payload, { status });
}
