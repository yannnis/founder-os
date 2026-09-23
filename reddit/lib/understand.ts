import { pageSource } from "./product-prompt";
import type { ProductBrief, ReadPage } from "./brief";
import { askProduct, askSubreddit, WriterError } from "./writer";

export type Explained = ProductBrief & { subreddit: string | null };

/** A language model writes the business, then names one subreddit from that same reading. */
export async function explainProduct(page: ReadPage): Promise<Explained> {
  const source = pageSource(page);
  const answer = await askProduct(source);
  if (answer.description.length < 40) throw new WriterError("The page didn't produce a description. Paste one instead.");
  const subreddit = await askSubreddit(source, answer.subreddit);
  const description = answer.description.slice(0, 2_000);
  return {
    title: page.title.slice(0, 180),
    description: description.slice(0, 300),
    brief: description,
    subreddit,
  };
}

export function explainFailure(error: unknown): string {
  if (error instanceof WriterError) return error.message;
  return "The description didn't come back.";
}
