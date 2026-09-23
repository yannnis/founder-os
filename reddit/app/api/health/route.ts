import { MODEL_ID } from "../../../lib/model";

export function GET() {
  return Response.json({
    ok: true,
    key: Boolean(process.env.TYPESAFE_API_KEY?.trim()),
    model: MODEL_ID,
  });
}
