import { BriefError, readProductPage } from "../../../lib/brief";
import { explainFailure, explainProduct } from "../../../lib/understand";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Send a website address." }, { status: 400 });
  }
  const url = body && typeof body === "object" && "url" in body ? body.url : undefined;
  if (typeof url !== "string") {
    return Response.json({ ok: false, error: "Send a website address." }, { status: 400 });
  }
  try {
    const page = await readProductPage(url);
    const brief = await explainProduct(page);
    return Response.json({
      ok: true,
      title: brief.title,
      description: brief.description,
      brief: brief.brief,
      subreddit: brief.subreddit,
    });
  } catch (error) {
    if (error instanceof BriefError) {
      return Response.json({ ok: false, error: error.message }, { status: 400 });
    }
    const message = explainFailure(error);
    console.info(JSON.stringify({ event: "reddit.understand_failed", error: message }));
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
