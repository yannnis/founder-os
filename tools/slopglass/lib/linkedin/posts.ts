const HOST = "professional-network-data.p.rapidapi.com";
const MAX_POSTS = 20;
const SUBSCRIBE =
  "This RapidAPI account is not subscribed to Professional Network Data. The Basic plan is free: https://rapidapi.com/pnd-team-pnd-team/api/professional-network-data/pricing";

export type PostMedia =
  | { kind: "image"; url: string; count: number }
  | { kind: "video"; poster: string; durationMs: number }
  | { kind: "link"; title: string; domain: string; image: string | null }
  | { kind: "document"; title: string; cover: string | null; pages: number }
  | { kind: "poll"; question: string; options: { text: string; votes: number }[]; voters: number };

export type QuotedPost = {
  name: string;
  headline: string;
  text: string;
  media: PostMedia | null;
};

export type PublicPost = {
  id: string;
  text: string;
  repost: boolean;
  time: string;
  headline: string;
  avatar: string | null;
  reactions: number;
  comments: number;
  reposts: number;
  media: PostMedia | null;
  quoted: QuotedPost | null;
};

export class LinkedInPostsError extends Error {
  constructor(
    readonly status: number,
    readonly code: "unauthorized" | "not_found" | "empty" | "rate_limited" | "upstream" | "bad_request",
    message: string,
  ) {
    super(message);
    this.name = "LinkedInPostsError";
  }
}

type RawAuthor = {
  firstName?: unknown;
  lastName?: unknown;
  username?: unknown;
  headline?: unknown;
  profilePictures?: unknown;
};

type RawPost = {
  text?: unknown;
  reshared?: unknown;
  resharedPost?: unknown;
  reposted?: unknown;
  time?: unknown;
  postedAt?: unknown;
  urn?: unknown;
  author?: RawAuthor;
  contentType?: unknown;
  image?: unknown;
  images?: unknown;
  video?: unknown;
  article?: unknown;
  document?: unknown;
  poll?: unknown;
  totalReactionCount?: unknown;
  commentsCount?: unknown;
  repostsCount?: unknown;
};

export type PublicPosts = {
  posts: PublicPost[];
  name: string | null;
};

export async function fetchPublicPosts(username: string): Promise<PublicPosts> {
  const key = process.env.RAPIDAPI_KEY?.trim();
  if (!key) {
    throw new LinkedInPostsError(
      503,
      "unauthorized",
      "RAPIDAPI_KEY is not set on the Slopglass server.",
    );
  }

  const endpoint = new URL(`https://${HOST}/get-profile-posts`);
  endpoint.searchParams.set("username", username);
  endpoint.searchParams.set("start", "0");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        "x-rapidapi-key": key,
        "x-rapidapi-host": HOST,
      },
      cache: "no-store",
    });
  } catch {
    throw new LinkedInPostsError(502, "upstream", "Couldn't reach the LinkedIn posts API.");
  }

  const body = (await response.json().catch(() => null)) as { data?: unknown; message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message : "";

  if (/not subscribed/i.test(message)) {
    throw new LinkedInPostsError(403, "unauthorized", SUBSCRIBE);
  }
  if (response.status === 404 || /not found/i.test(message)) {
    throw new LinkedInPostsError(404, "not_found", "That LinkedIn profile wasn't found.");
  }
  if (response.status === 400) {
    throw new LinkedInPostsError(400, "bad_request", "That doesn't look like a LinkedIn profile URL.");
  }
  if (response.status === 429) {
    throw new LinkedInPostsError(429, "rate_limited", "The posts API is busy. Try again in a minute.");
  }
  if (!response.ok || !body || !Array.isArray(body.data)) {
    throw new LinkedInPostsError(502, "upstream", message || "The posts API didn't return a profile.");
  }

  const posts = body.data
    .map((raw, index) => toPost(raw, index, username))
    .filter((post): post is PublicPost => post !== null)
    .slice(0, MAX_POSTS);

  if (posts.length === 0) {
    throw new LinkedInPostsError(
      404,
      "empty",
      "LinkedIn didn't show any public posts for that profile.",
    );
  }
  return { posts, name: authorName(body.data) };
}

function toPost(raw: unknown, index: number, username: string): PublicPost | null {
  if (!raw || typeof raw !== "object") return null;
  const post = raw as RawPost;
  const text = typeof post.text === "string" ? post.text.trim() : "";
  const author = typeof post.author?.username === "string" ? post.author.username : "";
  const quoted = quoteOf(post.resharedPost);
  const media = mediaOf(post);
  const repost =
    post.reshared === true ||
    post.reposted === true ||
    quoted !== null ||
    (author !== "" && author.toLowerCase() !== username.toLowerCase());
  if (!text && !repost && !media) return null;
  const urn = typeof post.urn === "string" && post.urn ? post.urn : String(index);
  const time =
    typeof post.postedAt === "string" && post.postedAt
      ? post.postedAt
      : typeof post.time === "string" && post.time
        ? post.time
        : "";
  return {
    id: urn,
    text,
    repost,
    time,
    headline: typeof post.author?.headline === "string" ? post.author.headline : "",
    avatar: pickImage(post.author?.profilePictures, 200),
    reactions: count(post.totalReactionCount),
    comments: count(post.commentsCount),
    reposts: count(post.repostsCount),
    media,
    quoted,
  };
}

function mediaOf(post: RawPost): PostMedia | null {
  const kind = typeof post.contentType === "string" ? post.contentType : "";
  if (kind === "linkedInVideo") {
    const clip = Array.isArray(post.video) ? post.video[0] : null;
    if (clip && typeof clip === "object" && "poster" in clip && typeof clip.poster === "string" && clip.poster) {
      const durationMs = "duration" in clip && typeof clip.duration === "number" ? clip.duration : 0;
      return { kind: "video", poster: clip.poster, durationMs };
    }
  }
  if (kind === "image" || kind === "post") {
    const photos = photoGroups(post.images ?? post.image);
    if (photos.length > 0) return { kind: "image", url: photos[0], count: photos.length };
  }
  if (kind === "document" && post.document && typeof post.document === "object") {
    const document = post.document as { title?: unknown; totalPageCount?: unknown; coverPages?: unknown };
    const coverPage = Array.isArray(document.coverPages) ? document.coverPages[0] : null;
    const cover =
      coverPage && typeof coverPage === "object" && "imageUrls" in coverPage && Array.isArray(coverPage.imageUrls)
        ? coverPage.imageUrls.find((url: unknown) => typeof url === "string")
        : null;
    const title = typeof document.title === "string" ? document.title : "";
    if (title || cover) {
      return {
        kind: "document",
        title,
        cover: typeof cover === "string" ? cover : null,
        pages: count(document.totalPageCount),
      };
    }
  }
  if (kind === "article" && post.article && typeof post.article === "object" && "title" in post.article) {
    const article = post.article as { title?: unknown; subtitle?: unknown; image?: unknown };
    const title = typeof article.title === "string" ? article.title : "";
    if (title) {
      return {
        kind: "link",
        title,
        domain: typeof article.subtitle === "string" ? article.subtitle : "",
        image: pickImage(article.image, 800),
      };
    }
  }
  if (kind === "poll" && post.poll && typeof post.poll === "object") {
    const poll = post.poll as { title?: unknown; uniqueVotersCount?: unknown; options?: unknown };
    const options = Array.isArray(poll.options)
      ? poll.options.flatMap((option) => {
          if (!option || typeof option !== "object") return [];
          const text = "text" in option && typeof option.text === "string" ? option.text : "";
          const votes = "voteCount" in option ? count(option.voteCount) : 0;
          return text ? [{ text, votes }] : [];
        })
      : [];
    if (options.length > 0) {
      return {
        kind: "poll",
        question: typeof poll.title === "string" ? poll.title : "",
        options: options.slice(0, 5),
        voters: count(poll.uniqueVotersCount),
      };
    }
  }
  return null;
}

function quoteOf(raw: unknown): QuotedPost | null {
  if (!raw || typeof raw !== "object") return null;
  const post = raw as RawPost;
  const text = typeof post.text === "string" ? post.text.trim() : "";
  const media = mediaOf(post);
  const name = personName(post.author);
  if (!text && !media && !name) return null;
  return {
    name,
    headline: typeof post.author?.headline === "string" ? post.author.headline : "",
    text,
    media,
  };
}

function personName(author: RawAuthor | undefined): string {
  const first = typeof author?.firstName === "string" ? author.firstName.trim() : "";
  const last = typeof author?.lastName === "string" ? author.lastName.trim() : "";
  return `${first} ${last}`.trim();
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function photoGroups(value: unknown): string[] {
  const images = sizedImages(value);
  const groups = new Map<string, { url: string; width: number }[]>();
  for (const image of images) {
    const id = image.url.match(/\/(D[0-9A-Z]{8,})\//)?.[1] ?? image.url;
    const list = groups.get(id) ?? [];
    list.push(image);
    groups.set(id, list);
  }
  return [...groups.values()].flatMap((group) => {
    const url = choose(group, 800);
    return url ? [url] : [];
  });
}

function pickImage(value: unknown, target: number): string | null {
  return choose(sizedImages(value), target);
}

function sizedImages(value: unknown): { url: string; width: number }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || !("url" in item) || typeof item.url !== "string" || !item.url) return [];
    const width = "width" in item && typeof item.width === "number" ? item.width : 0;
    return [{ url: item.url, width }];
  });
}

function choose(images: { url: string; width: number }[], target: number): string | null {
  if (images.length === 0) return null;
  return [...images].sort((a, b) => Math.abs((a.width || target) - target) - Math.abs((b.width || target) - target))[0].url;
}

function authorName(data: unknown[]): string | null {
  for (const raw of data) {
    if (!raw || typeof raw !== "object" || !("author" in raw)) continue;
    const author = (raw as RawPost).author;
    if (!author) continue;
    const first = typeof author.firstName === "string" ? author.firstName.trim() : "";
    const last = typeof author.lastName === "string" ? author.lastName.trim() : "";
    const name = `${first} ${last}`.trim();
    if (name) return name;
  }
  return null;
}
