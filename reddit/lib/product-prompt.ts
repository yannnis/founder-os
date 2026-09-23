/** One reading of a business. The description and the subreddit both come from this. */
export const PRODUCT_PROMPT = `You read a source about a company and answer two things from that source alone.

description: what the business actually is. Who it is for, the job it does, and the problem it solves. Two to four plain sentences a founder could hand to someone who has never seen the site. Use only facts in the source. No slogan, no "welcome", no feature list, no invented prices or customers.

subreddit: the single real subreddit where people who have that problem talk and might ask for a tool. The name only, without r/. The closest buyers, not the largest general community.

Reply with JSON: {"description":"...","subreddit":"..."}`;

export function pageSource(page: { url: string; title: string; description: string; text: string }): string {
  return [`Website: ${page.url}`, `Title: ${page.title}`, `Description: ${page.description}`, "", page.text]
    .filter((line) => line !== undefined)
    .join("\n")
    .slice(0, 8_000);
}

export function briefSource(brief: string): string {
  return `The product, in the founder's words:\n\n${brief.trim()}`;
}

export function rejectedSource(source: string, rejected: string): string {
  return `${source}\n\nr/${rejected} is not a subreddit. Name a different one that exists.`;
}
