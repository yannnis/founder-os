import { FEED, type FeedPost } from "./feed";

export type Profile = {
  id: string;
  name: string;
  headline: string;
  note: string;
  posts: FeedPost[];
};

function posts(ids: string[], author: { author: string; role: string }): FeedPost[] {
  return ids.map((id) => {
    const post = FEED.find((item) => item.id === id);
    if (!post) throw new Error(`Missing profile post ${id}`);
    return { ...post, author: author.author, role: author.role };
  });
}

export const PROFILES: Profile[] = [
  {
    id: "priya",
    name: "Priya Raman",
    headline: "Senior Director, Northwind",
    note: "A sample timeline of announcements, lesson lists, and asks. The extension reads a real activity page.",
    posts: posts(
      [
        "slop-announce",
        "slop-hustle",
        "slop-self-label",
        "slop-lessons",
        "slop-quiet",
        "slop-paragraph",
        "slop-gratitude",
        "too-short",
      ],
      { author: "Priya Raman", role: "Senior Director, Northwind" },
    ),
  },
  {
    id: "sam",
    name: "Sam Ortega",
    headline: "Office manager, Fieldnote",
    note: "A sample timeline of incidents, opinions, one short caption, and a repost. Reposts are not scored.",
    posts: posts(
      [
        "human-incident",
        "human-tech",
        "human-opinion",
        "human-job",
        "human-short",
        "mixed-polished",
        "mixed-linebreaks",
        "human-complaint",
        "too-short",
        "repost-skip",
      ],
      { author: "Sam Ortega", role: "Office manager, Fieldnote" },
    ),
  },
];
