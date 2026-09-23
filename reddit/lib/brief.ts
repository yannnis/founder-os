import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 500_000;
const BRIEF_CHARS = 2_000;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export type ProductBrief = {
  title: string;
  description: string;
  brief: string;
};

export type ReadPage = ProductBrief & {
  url: string;
  passages: string[];
  text: string;
};

export class BriefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BriefError";
  }
}

export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(withWebScheme(raw));
  } catch {
    throw new BriefError("That doesn't look like a web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BriefError("Use an http or https address.");
  }
  if (url.username || url.password) {
    throw new BriefError("Take the username and password out of the address.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new BriefError("That address isn't a public website.");
  }
  if (isIP(host) && isBlockedIp(host)) {
    throw new BriefError("That address isn't a public website.");
  }
  return url;
}

export async function readProductPage(raw: string): Promise<ReadPage> {
  let current = parsePublicUrl(raw);
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicHost(current.hostname);
    // Check again immediately before connecting. A name can flip to a private address between lookups.
    await assertPublicHost(current.hostname);
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new BriefError("The site redirected without a destination.");
      current = parsePublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new BriefError(`The site returned ${response.status}.`);
    }
    const bytes = await readCappedBody(response, MAX_BYTES);
    const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const brief = briefFromHtml(html);
    const passages = passagesFromHtml(html);
    const text = visibleText(html, 6_000);
    if (brief.brief.trim().length < 40 && passages.join(" ").trim().length < 40) {
      throw new BriefError("The page didn't include enough text. Paste a description instead.");
    }
    return { ...brief, url: current.toString(), passages, text };
  }
  throw new BriefError("The site redirected too many times.");
}

export async function readCappedBody(response: Response, max: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > max ? bytes.slice(0, max) : bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < max) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const room = max - total;
      if (value.byteLength > room) {
        chunks.push(value.slice(0, room));
        total = max;
        await reader.cancel();
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function briefFromHtml(html: string): ProductBrief {
  const title = metaContent(html, "og:title") || tagText(html, "title");
  const description =
    metaContent(html, "og:description") || metaContent(html, "description") || "";
  const heading = tagText(html, "h1");
  const text = visibleText(html);
  const parts = [title, description, heading && heading !== title ? heading : "", text].filter(Boolean);
  const brief = parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, BRIEF_CHARS);
  return { title: title.slice(0, 180), description: description.slice(0, 300), brief };
}

export function passagesFromHtml(html: string): string[] {
  const title = metaContent(html, "og:title") || tagText(html, "title");
  const description = metaContent(html, "og:description") || metaContent(html, "description");
  const headings = [...html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].map((match) =>
    match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  );
  const sentences = visibleText(html, 6_000)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.replace(/\s+/g, " ").trim());
  const seen = new Set<string>();
  const passages: string[] = [];
  for (const part of [title, description, ...headings, ...sentences]) {
    const text = part.replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (text.length < 24 || text.length > 280 || seen.has(key)) continue;
    seen.add(key);
    passages.push(text);
    if (passages.length === 12) break;
  }
  return passages;
}

export function composeBrief(title: string, about: string, audience: string): ProductBrief {
  const name = title.replace(/\s+/g, " ").trim();
  const does = about.replace(/\s+/g, " ").trim();
  const who = audience.replace(/\s+/g, " ").trim();
  const lines = [name, does];
  if (who && who.toLowerCase() !== does.toLowerCase() && who.toLowerCase() !== name.toLowerCase()) lines.push(who);
  const brief = lines.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, BRIEF_CHARS);
  return { title: name.slice(0, 180), description: does.slice(0, 300), brief };
}

function withWebScheme(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^htps?:\/\//i.test(trimmed)) return trimmed.replace(/^htps?:\/\//i, "https://");
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

export function visibleText(html: string, limit = 1_200): string {
  const without = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  return without
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

function tagText(html: string, tag: string): string {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return "";
  return match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function metaContent(html: string, name: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const needle = name.toLowerCase();
  for (const tag of tags) {
    const key = (attr(tag, "property") || attr(tag, "name")).toLowerCase();
    if (key !== needle) continue;
    return decodeBasic(attr(tag, "content")).replace(/\s+/g, " ").trim();
  }
  return "";
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return match ? match[2] ?? match[3] ?? "" : "";
}

function decodeBasic(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new BriefError("That address isn't a public website.");
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BriefError("Couldn't find that website.");
  }
  if (addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new BriefError("That address isn't a public website.");
  }
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return blockedV4(ip);
  if (version === 6) return blockedV6(ip.toLowerCase());
  return true;
}

function blockedV4(ip: string): boolean {
  const [a, b] = ip.split(".").map((part) => Number(part));
  if ([a, b].some((part) => !Number.isFinite(part))) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function blockedV6(ip: string): boolean {
  const hextets = ipv6Hextets(ip);
  if (!hextets) return true;
  const prefix = hextets.slice(0, 5).every((part) => part === 0);
  if (prefix && (hextets[5] === 0 || hextets[5] === 0xffff)) {
    return blockedV4(ipv4FromHextets(hextets[6], hextets[7]));
  }
  if ((hextets[0] & 0xffc0) === 0xfe80) return true;
  if ((hextets[0] & 0xfe00) === 0xfc00) return true;
  if ((hextets[0] & 0xff00) === 0xff00) return true;
  if (hextets[0] === 0x0100 && hextets.slice(1).every((part) => part === 0)) return true;
  // 6to4 embeds an IPv4 address in the next 32 bits.
  if (hextets[0] === 0x2002) return blockedV4(ipv4FromHextets(hextets[1], hextets[2]));
  // Well-known NAT64 prefix. Only the embedded IPv4 can point at a private host.
  if (hextets[0] === 0x0064 && hextets[1] === 0xff9b && hextets.slice(2, 6).every((part) => part === 0)) {
    return blockedV4(ipv4FromHextets(hextets[6], hextets[7]));
  }
  // Local-use NAT64 is not a public website.
  if (hextets[0] === 0x0064 && hextets[1] === 0xff9b && hextets[2] === 0x0001) return true;
  return false;
}

function ipv4FromHextets(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function ipv6Hextets(ip: string): number[] | null {
  const v4tail = ip.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  let head = ip;
  const tail: number[] = [];
  if (v4tail) {
    const parts = v4tail[2].split(".").map((part) => Number(part));
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    head = v4tail[1].replace(/:$/, "");
    tail.push((parts[0] << 8) | parts[1], (parts[2] << 8) | parts[3]);
  }
  const halves = head.split("::");
  if (halves.length > 2) return null;
  const parseSide = (side: string): number[] | null => {
    if (side === "") return [];
    const groups = side.split(":");
    const parsed: number[] = [];
    for (const group of groups) {
      if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
      parsed.push(parseInt(group, 16));
    }
    return parsed;
  };
  const left = parseSide(halves[0]);
  if (!left) return null;
  if (halves.length === 1) {
    const all = [...left, ...tail];
    return all.length === 8 ? all : null;
  }
  const right = parseSide(halves[1]);
  if (!right) return null;
  const rest = [...right, ...tail];
  const missing = 8 - left.length - rest.length;
  if (missing < 1) return null;
  return [...left, ...Array(missing).fill(0), ...rest];
}
