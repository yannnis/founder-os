export type RedditPost = {
  id: string;
  title: string;
  author: string;
  text: string;
  createdUtc: number;
  permalink: string;
  subreddit: string;
};

const SUBREDDIT = /^[A-Za-z0-9_]{2,21}$/;

export function normalizeSubreddit(raw: string): string | null {
  const name = raw.trim().replace(/^\/?r\//i, "").replace(/\/+$/, "");
  if (!SUBREDDIT.test(name)) return null;
  return name;
}

export function parseAtom(xml: string, subreddit: string): RedditPost[] {
  const posts: RedditPost[] = [];
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  for (const entry of entries) {
    const title = textOf(entry, "title");
    const id = textOf(entry, "id");
    const href = entry.match(/<link\b[^>]*\bhref="([^"]+)"/i)?.[1] ?? "";
    const updated = textOf(entry, "updated") || textOf(entry, "published");
    const author = authorOf(textOf(entry, "name"));
    const createdUtc = Date.parse(updated);
    if (!title || !id || !href || !Number.isFinite(createdUtc)) continue;
    posts.push({
      id,
      title: decodeXml(title).trim(),
      author,
      text: bodyFromContent(innerOf(entry, "content")),
      createdUtc: Math.floor(createdUtc / 1000),
      permalink: decodeXml(href),
      subreddit,
    });
  }
  return posts;
}

type ArchiveRow = {
  id?: unknown;
  title?: unknown;
  author?: unknown;
  selftext?: unknown;
  created_utc?: unknown;
  permalink?: unknown;
  subreddit?: unknown;
};

export function fromArchive(row: ArchiveRow, fallbackSubreddit: string): RedditPost | null {
  if (typeof row.title !== "string" || typeof row.id !== "string") return null;
  const created = typeof row.created_utc === "number" ? row.created_utc : Number(row.created_utc);
  if (!Number.isFinite(created)) return null;
  const subreddit = typeof row.subreddit === "string" && row.subreddit ? row.subreddit : fallbackSubreddit;
  const permalink = permalinkOf(row.permalink, subreddit, row.id);
  return {
    id: row.id.startsWith("t3_") ? row.id : `t3_${row.id}`,
    title: row.title.trim(),
    author: authorOf(typeof row.author === "string" ? row.author : ""),
    text: archiveText(row.selftext),
    createdUtc: Math.floor(created),
    permalink,
    subreddit,
  };
}

/** Removed and deleted bodies are placeholders. Match the title instead of the marker. */
export function archiveText(selftext: unknown): string {
  if (typeof selftext !== "string") return "";
  const text = selftext.trim();
  if (text === "[removed]" || text === "[deleted]") return "";
  return text.slice(0, 8_000);
}

function permalinkOf(permalink: unknown, subreddit: string, id: string): string {
  if (typeof permalink === "string" && permalink.startsWith("http")) return permalink;
  if (typeof permalink === "string" && permalink.startsWith("/")) return `https://www.reddit.com${permalink}`;
  return `https://www.reddit.com/r/${subreddit}/comments/${id.replace(/^t3_/, "")}/`;
}

function authorOf(name: string): string {
  return name.replace(/^\/?u\//i, "").trim();
}

function textOf(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function innerOf(xml: string, tag: string): string {
  return textOf(xml, tag);
}

/** Self posts carry the body in div.md. Link posts are only the "submitted by" footer. */
export function bodyFromContent(contentXml: string): string {
  const html = decodeXml(contentXml);
  const md = html.match(/<div class="md">([\s\S]*?)<\/div>/i);
  if (!md) return "";
  return htmlToText(md[1]).slice(0, 8_000);
}

export function htmlToText(html: string): string {
  return decodeXml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function decodeXml(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    const next = current
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n: string) => safeChar(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => safeChar(parseInt(n, 16)));
    if (next === current) break;
    current = next;
  }
  return current;
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}
