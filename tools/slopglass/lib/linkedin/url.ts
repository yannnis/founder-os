const SLUG = /^[\p{L}\p{N}\-_%]{2,100}$/u;

export type LinkedInProfile = {
  url: string;
  slug: string;
  name: string;
};

export function linkedInProfile(input: string): LinkedInProfile | null {
  const raw = input.trim();
  if (!raw || raw.length > 300) return null;

  let candidate = raw;
  if (!/^https?:\/\//i.test(candidate)) {
    if (/^(www\.)?linkedin\.com\//i.test(candidate)) candidate = `https://${candidate}`;
    else if (!candidate.includes("/") && !candidate.includes(".")) {
      candidate = `https://www.linkedin.com/in/${candidate}`;
    } else return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "linkedin.com") return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts[0]?.toLowerCase() !== "in" || !parts[1]) return null;
  let slug = parts[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return null;
  }
  slug = slug.replace(/\/$/, "");
  if (!SLUG.test(slug)) return null;

  return {
    url: `https://www.linkedin.com/in/${encodeURIComponent(slug)}/`,
    slug,
    name: displayName(slug),
  };
}

function displayName(slug: string): string {
  const words = slug
    .replace(/%/g, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .slice(0, 4);
  if (words.length === 0) return slug;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
