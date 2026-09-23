import { fromArchive, normalizeSubreddit, parseAtom, type RedditPost } from "../../../lib/parse";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Send a JSON body." }, { status: 400 });
  }
  const rawSub = body && typeof body === "object" && "subreddit" in body ? body.subreddit : undefined;
  const before = body && typeof body === "object" && "before" in body ? body.before : undefined;
  if (typeof rawSub !== "string") {
    return Response.json({ ok: false, error: "Send a subreddit." }, { status: 400 });
  }
  const subreddit = normalizeSubreddit(rawSub);
  if (!subreddit) {
    return Response.json({ ok: false, error: "That isn't a subreddit name." }, { status: 400 });
  }
  if (before !== undefined && (typeof before !== "number" || !Number.isFinite(before))) {
    return Response.json({ ok: false, error: "The earlier-posts cursor has to be a time." }, { status: 400 });
  }

  try {
    const posts = before === undefined ? await firstBatch(subreddit) : await fromEarlier(subreddit, before);
    return Response.json({ ok: true, subreddit, source: before === undefined ? "rss" : "archive", posts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't load posts.";
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}

const FIRST_BATCH = 40;

class PostsError extends Error {
  constructor(
    message: string,
    readonly missing = false,
  ) {
    super(message);
    this.name = "PostsError";
  }
}

async function firstBatch(subreddit: string): Promise<RedditPost[]> {
  let posts: RedditPost[] = [];
  try {
    posts = await fromRss(subreddit);
  } catch (error) {
    if (error instanceof PostsError && error.missing) throw error;
    posts = await fromArchivePage(subreddit);
  }
  for (let page = 0; posts.length < FIRST_BATCH && page < 3; page += 1) {
    const oldest = posts.reduce((min, post) => Math.min(min, post.createdUtc), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(oldest)) break;
    let more: RedditPost[] = [];
    try {
      more = await fromArchivePage(subreddit, oldest);
    } catch {
      break;
    }
    const seen = new Set(posts.map((post) => post.id));
    const fresh = more.filter((post) => !seen.has(post.id));
    if (fresh.length === 0) break;
    posts = posts.concat(fresh);
  }
  if (posts.length === 0) throw new PostsError(`Couldn't load posts from r/${subreddit}.`);
  return posts.slice(0, FIRST_BATCH);
}

async function fromRss(subreddit: string): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/new.rss?limit=25`;
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/atom+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 404) throw new PostsError(`r/${subreddit} isn't there.`, true);
  if (!response.ok) throw new PostsError(`Reddit returned ${response.status} for r/${subreddit}.`);
  const xml = await response.text();
  return parseAtom(xml, subreddit);
}

async function fromEarlier(subreddit: string, before: number): Promise<RedditPost[]> {
  return fromArchivePage(subreddit, before);
}

async function fromArchivePage(subreddit: string, before?: number): Promise<RedditPost[]> {
  const url = new URL("https://arctic-shift.photon-reddit.com/api/posts/search");
  url.searchParams.set("subreddit", subreddit);
  url.searchParams.set("limit", String(FIRST_BATCH));
  url.searchParams.set("sort", "desc");
  if (before !== undefined) url.searchParams.set("before", String(Math.floor(before)));
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new PostsError(`Couldn't load posts from r/${subreddit}.`);
  const payload = (await response.json()) as { data?: unknown };
  if (!Array.isArray(payload.data)) throw new PostsError(`Couldn't load posts from r/${subreddit}.`);
  const posts: RedditPost[] = [];
  for (const row of payload.data) {
    if (!row || typeof row !== "object") continue;
    const post = fromArchive(row, subreddit);
    if (post && (before === undefined || post.createdUtc < before)) posts.push(post);
  }
  return posts;
}
