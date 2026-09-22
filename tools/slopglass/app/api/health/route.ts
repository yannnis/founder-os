import { hasApiKey } from "@/lib/slop/classify";
import { MODEL_ID } from "@/lib/slop/rubric";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export function GET() {
  const key = hasApiKey();
  return Response.json({ ok: key, key, model: MODEL_ID }, { headers: cors });
}
