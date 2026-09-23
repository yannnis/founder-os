import { suggestSubreddit } from "../../../lib/suggest";
import { WriterError } from "../../../lib/writer";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Send a JSON body." }, { status: 400 });
  }
  const brief = body && typeof body === "object" && "brief" in body ? body.brief : undefined;
  if (typeof brief !== "string" || brief.trim().length < 40) {
    return Response.json({ ok: false, error: "The product description is too short." }, { status: 400 });
  }
  try {
    const subreddit = await suggestSubreddit(brief);
    if (!subreddit) return Response.json({ ok: false, error: "No subreddit came back." }, { status: 502 });
    return Response.json({ ok: true, subreddit });
  } catch (error) {
    const message = error instanceof WriterError ? error.message : "Couldn't suggest a subreddit.";
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
