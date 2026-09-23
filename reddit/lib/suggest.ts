import { briefSource } from "./product-prompt";
import { askProduct, askSubreddit } from "./writer";

/** The same product prompt, pointed at the description, names one subreddit. */
export async function suggestSubreddit(brief: string): Promise<string | null> {
  const source = briefSource(brief);
  const answer = await askProduct(source);
  return askSubreddit(source, answer.subreddit);
}
