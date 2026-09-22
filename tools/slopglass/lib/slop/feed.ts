import { FEED_EXTRAS, FIXTURES, type FixturePost } from "./fixtures";

export type FeedPost = FixturePost & {
  time: string;
  reactions: string;
  /** Someone else's post with no commentary of your own. Not scored. */
  repost?: boolean;
  quoted?: string;
};

const ORDER: Array<{ id: string; time: string; reactions: string }> = [
  { id: "human-opinion", time: "32m", reactions: "18 reactions" },
  { id: "slop-announce", time: "1h", reactions: "246 reactions" },
  { id: "human-tech", time: "2h", reactions: "41 reactions" },
  { id: "slop-hustle", time: "2h", reactions: "1,204 reactions" },
  { id: "mixed-polished", time: "3h", reactions: "63 reactions" },
  { id: "slop-quiet", time: "3h", reactions: "512 reactions" },
  { id: "human-incident", time: "4h", reactions: "27 reactions" },
  { id: "slop-self-label", time: "5h", reactions: "88 reactions" },
  { id: "human-job", time: "5h", reactions: "154 reactions" },
  { id: "slop-lessons", time: "6h", reactions: "3,401 reactions" },
  { id: "human-short", time: "6h", reactions: "9 reactions" },
  { id: "slop-paragraph", time: "8h", reactions: "73 reactions" },
  { id: "mixed-linebreaks", time: "9h", reactions: "36 reactions" },
  { id: "slop-gratitude", time: "11h", reactions: "890 reactions" },
  { id: "human-complaint", time: "12h", reactions: "22 reactions" },
  { id: "too-short", time: "1d", reactions: "4 reactions" },
  { id: "repost-skip", time: "1d", reactions: "Repost" },
];

const BY_ID = new Map<string, FixturePost>([...FIXTURES, ...FEED_EXTRAS].map((post) => [post.id, post]));

const REPOST: FeedPost = {
  id: "repost-skip",
  expect: "unsure",
  author: "Sam Ortega",
  role: "Office manager, Fieldnote",
  text: "",
  time: "1d",
  reactions: "Repost",
  repost: true,
  quoted: "Thrilled to announce a new chapter. Leadership is about people. Agree?",
};

export const FEED: FeedPost[] = ORDER.map((item) => {
  if (item.id === REPOST.id) return { ...REPOST, time: item.time, reactions: item.reactions };
  const post = BY_ID.get(item.id);
  if (!post) throw new Error(`Missing feed post ${item.id}`);
  return { ...post, time: item.time, reactions: item.reactions };
});
