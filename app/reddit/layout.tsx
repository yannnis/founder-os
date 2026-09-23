import type { ReactNode } from "react";

export const metadata = {
  title: "A subreddit, read against a product",
  description: "A subreddit, read against a product. Posts are flaired by Jev as they come in.",
};

export default function RedditLayout({ children }: { children: ReactNode }) {
  return children;
}
