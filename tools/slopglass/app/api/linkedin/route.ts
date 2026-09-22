import { linkedInProfile } from "@/lib/linkedin/url";
import { fetchPublicPosts, LinkedInPostsError } from "@/lib/linkedin/posts";

const hits: number[] = [];
const LIMIT = 12;

function overLimit(): boolean {
  const now = Date.now();
  while (hits.length > 0 && hits[0] < now - 60_000) hits.shift();
  if (hits.length >= LIMIT) return true;
  hits.push(now);
  return false;
}

export async function POST(request: Request) {
  if (overLimit()) {
    return Response.json(
      { ok: false, code: "rate_limited", error: "Too many profiles at once. Give it a minute." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: "bad_request", error: "Send a JSON body." }, { status: 400 });
  }

  const input = body && typeof body === "object" && "url" in body ? body.url : undefined;
  if (typeof input !== "string") {
    return Response.json({ ok: false, code: "bad_request", error: "Paste a LinkedIn profile URL." }, { status: 400 });
  }

  const profile = linkedInProfile(input);
  if (!profile) {
    return Response.json(
      { ok: false, code: "bad_request", error: "Use a personal profile, like linkedin.com/in/your-name." },
      { status: 400 },
    );
  }

  try {
    const result = await fetchPublicPosts(profile.slug);
    const named = result.name ? { ...profile, name: result.name } : profile;
    return Response.json({ ok: true, profile: named, posts: result.posts });
  } catch (error) {
    if (error instanceof LinkedInPostsError) {
      return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
    }
    return Response.json({ ok: false, code: "upstream", error: "Couldn't load that profile." }, { status: 502 });
  }
}
