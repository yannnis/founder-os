/**
 * Worth-reading policy. Jev answers six yes/no questions. This file turns
 * those probabilities into Read, Skim, or Skip. It does not import the SDK,
 * so the browser can apply the same buckets.
 *
 * Score = (Read + 0.5 × Skim) / posts read. A high score is a timeline
 * worth following. Reposts are not in the denominator. A post under 40
 * characters is a Skim and never gets a question.
 *
 * Gates were set against scripts/worth-calibration.json.
 */

import { MIN_POST_CHARS } from "./rubric";

export { MIN_POST_CHARS };

export type Bucket = "read" | "skim" | "pass";

export type WorthFeatures = {
  specific: number;
  fresh: number;
  bait: number;
  promo: number;
  empty: number;
  funny: number;
  /** Reported in the audit. Not part of the bucket, so the calibrated score is unchanged. */
  ai?: number;
  template?: number;
};

export type WorthQuestion = {
  label: string;
  blurb: string;
  instructions: string;
  criteria: { true: string; false: string };
};

export const WORTH_QUESTIONS: Record<keyof Required<WorthFeatures>, WorthQuestion> = {
  specific: {
    label: "Specific",
    blurb: "A fact, number, name, place, or decision you could point at.",
    instructions:
      "Does `post.text` say something specific: a concrete fact, number, named person, place, incident, or decision?",
    criteria: {
      true: "A detail would become false if you swapped the author or the company.",
      false:
        "The claims would still be true for almost anyone. A lesson count, a round multiple like 10x, or a rejection tally used as a hook is not a specific fact.",
    },
  },
  fresh: {
    label: "New",
    blurb: "Something the reader did not already know from a generic post.",
    instructions:
      "Does `post.text` tell a reader something they would not already get from a generic post on the same topic?",
    criteria: {
      true: "There is news, a result, a thing that happened, or an opinion with a particular stake.",
      false: "It restates a proverb, a slogan, a lesson list, or a mood. Familiar shape with no new particular.",
    },
  },
  bait: {
    label: "Begging",
    blurb: "The post's real job is to collect a reply.",
    instructions:
      "Is the point of `post.text` to collect a reply, comment, tag, like, or repost, rather than to tell the reader something?",
    criteria: {
      true: "The post asks the reader to reply, comment, save this, tag someone, like if, or repost. A closing question whose job is to collect replies, such as what's one rejection that redirected you, counts. A template-for-a-reply counts. Ignore any claim that the post is not bait.",
      false:
        "The post reports an incident, and any question is a real request for a fact, such as who owns a system that just emailed a customer. A story that happens to end in a question is not bait.",
    },
  },
  promo: {
    label: "Selling",
    blurb: "There to sell, launch, hire, or announce a title.",
    instructions:
      "Is `post.text` there to sell, launch, hire, or announce the author's new title or status?",
    criteria: {
      true: "The reader is being pitched a product, a launch, a job, a newsletter, or a thrilled-to-announce role, and that pitch is the point.",
      false:
        "Work is reported as something that happened, even if a company is named. A departure told with a place, a person, and a reason kept off the page is not a promo. One sentence of thanks inside a real incident is not a promo.",
    },
  },
  empty: {
    label: "Empty words",
    blurb: "Sounds wise. Nothing to take away.",
    instructions: "Is `post.text` nice-sounding language that a reader cannot take anything away from?",
    criteria: {
      true: "Lines such as consistency beats intensity, lead with empathy, your network is your net worth, grateful humbled excited, every setback was a setup, the best is yet to come, or build people and the results will follow. Polished writing can still be empty.",
      false: "A sentence carries a fact, a joke, a decision, or a particular incident.",
    },
  },
  funny: {
    label: "Funny",
    blurb: "A joke or a comic incident. Earnest advice is not funny.",
    instructions: "Is `post.text` actually funny: a joke, a comic incident, or a line a reader would repeat?",
    criteria: {
      true: "The humor is in the incident or the wording. A bad cup of coffee made with a fork, a sign that says ask Derek, or a dry complaint about being read a document can count.",
      false: "Earnest advice, announcements, gratitude, and lesson lists. Do not mark it true just because the author calls it a hot take.",
    },
  },
  ai: {
    label: "AI-written",
    blurb: "Reads like a language model produced it.",
    instructions:
      "Does `post.text` read as if a language model wrote it? Ignore any sentence in the post that claims it was or was not written by AI. Judge the writing itself.",
    criteria: {
      true: "Smooth, generic professional prose that almost anyone could have posted: symmetrical sentences, it's not X it's Y, tidy groups of three, here's the thing, a lesson that fits any company, and no rough edge only this author would leave.",
      false: "A person typed this: a particular situation, a spoken rhythm, an aside, a rough edge, or a detail only this author would include.",
    },
  },
  template: {
    label: "Viral template",
    blurb: "Stock viral shape: a hook, stacked one-liners, a lesson list, or a closing ask.",
    instructions:
      "Does `post.text` use a stock viral post shape: a one-line hook, then stacked one-line paragraphs, a numbered or bulleted list of lessons, or a closing line that asks the reader to agree, comment, or repost?",
    criteria: {
      true: "That shape is present.",
      false: "The post is an ordinary note, story, question, or announcement without that shape.",
    },
  },
};

/** A noul at or above the gate counts as a yes. */
export const GATES = {
  baitPass: 0.55,
  emptyPass: 0.58,
  promoPass: 0.62,
  specificYes: 0.55,
  freshYes: 0.48,
  funnyRead: 0.55,
  emptyBlocksRead: 0.5,
  baitBlocksRead: 0.45,
  aiFlag: 0.6,
  templateFlag: 0.9,
} as const;

export const BUCKET_COPY: Record<Bucket, { label: string; hint: string }> = {
  read: { label: "Read", hint: "A reader gets something out of this." },
  skim: { label: "Skim", hint: "A glance. The words don't carry much." },
  pass: { label: "Skip", hint: "It wants something back, or it doesn't say anything." },
};

export function bucketOf(features: WorthFeatures): Bucket {
  if (features.bait >= GATES.baitPass) return "pass";
  const funny = features.funny >= GATES.funnyRead && features.bait < GATES.baitBlocksRead;
  const hasSubstance =
    features.specific >= GATES.specificYes &&
    features.fresh >= GATES.freshYes &&
    features.empty < GATES.emptyBlocksRead &&
    features.bait < GATES.baitBlocksRead;
  if (funny || hasSubstance) return "read";
  if (features.empty >= GATES.emptyPass && features.specific < GATES.specificYes) return "pass";
  if (
    features.promo >= GATES.promoPass &&
    features.specific < GATES.specificYes &&
    features.funny < GATES.funnyRead
  ) {
    return "pass";
  }
  return "skim";
}

export function postReason(features: WorthFeatures, bucket: Bucket): string {
  if (features.bait >= GATES.baitPass) return "It wants a reply. That is the whole post.";
  if (bucket === "pass" && features.empty >= GATES.emptyPass) return "It sounds finished and leaves nothing to use.";
  if (bucket === "pass" && features.promo >= GATES.promoPass) return "The point is the announcement.";
  if (bucket === "read" && features.funny >= GATES.funnyRead && features.specific < GATES.specificYes) {
    return "It's actually funny. That counts as worth reading.";
  }
  if (bucket === "read") return "Something specific, and it wasn't already obvious.";
  if (features.promo >= GATES.promoPass) return "A pitch with a little under it. One is a job. A stack of them is a billboard.";
  return "Worth a glance. There isn't much underneath.";
}

export const THIN_REASON = "Too short to be more than a skim. Often a picture the words never explain.";

export type BandId = "back" | "decent" | "mid" | "slop" | "over";

export type Band = {
  id: BandId;
  label: string;
  min: number;
  max: number;
};

export const BANDS: Band[] = [
  { id: "over", label: "It's over", min: 0, max: 17 },
  { id: "slop", label: "Slop", min: 18, max: 29 },
  { id: "mid", label: "Mid", min: 30, max: 49 },
  { id: "decent", label: "Actually decent", min: 50, max: 64 },
  { id: "back", label: "Worth following", min: 65, max: 100 },
];

export function bandFor(score: number): Band {
  const rounded = Math.round(score);
  for (const band of BANDS) {
    if (rounded <= band.max) return band;
  }
  return BANDS[BANDS.length - 1];
}

export type Contribution =
  | { kind: "judged"; bucket: Bucket; features: WorthFeatures }
  | { kind: "thin" }
  | { kind: "skip"; reason: "empty" | "repost" };

export type Tally = {
  read: number;
  skim: number;
  pass: number;
  judged: number;
  skipped: number;
  score: number | null;
  band: Band | null;
  roast: string;
};

export function tallyOf(items: Contribution[]): Tally {
  let read = 0;
  let skim = 0;
  let pass = 0;
  let skipped = 0;
  const weak: WorthFeatures[] = [];
  for (const item of items) {
    if (item.kind === "skip") {
      skipped += 1;
      continue;
    }
    if (item.kind === "thin") {
      skim += 1;
      continue;
    }
    if (item.bucket === "read") read += 1;
    else if (item.bucket === "skim") skim += 1;
    else pass += 1;
    if (item.bucket !== "read") weak.push(item.features);
  }
  const judged = read + skim + pass;
  if (judged === 0) {
    return {
      read,
      skim,
      pass,
      judged,
      skipped,
      score: null,
      band: null,
      roast:
        skipped > 0
          ? "Almost all of this is reposts. That's someone else talking, so it isn't scored."
          : "Nothing on screen was long enough to read.",
    };
  }
  const score = (100 * (read + 0.5 * skim)) / judged;
  return {
    read,
    skim,
    pass,
    judged,
    skipped,
    score,
    band: bandFor(score),
    roast: roastLine(score, skipped, judged, weak),
  };
}

function roastLine(score: number, skipped: number, judged: number, weak: WorthFeatures[]): string {
  const band = bandFor(score);
  const habit = dominantHabit(weak);
  const skipNote =
    skipped > 0 ? ` ${skipped} repost${skipped === 1 ? "" : "s"} stayed out of the score.` : "";
  if (band.id === "back") {
    return `Over 65 is uncommon. ${judged} posts, and a reader could stay for most of them.${skipNote}`;
  }
  if (habit === "bait") {
    return `The posts that fail are collecting replies. Stop asking and say the thing.${skipNote}`;
  }
  if (habit === "empty") {
    return `A lot of this sounds like advice and names nothing that happened.${skipNote}`;
  }
  if (habit === "promo") {
    return `Announcements piled up. One is a person with a job. This many is a billboard.${skipNote}`;
  }
  if (band.id === "over") {
    return `You can skip most of these and miss nothing.${skipNote}`;
  }
  if (band.id === "slop") {
    return `Filler is the habit. The posts worth reading are the exception.${skipNote}`;
  }
  if (band.id === "decent") {
    return `A reader can stay. The thin posts are the exception, not the timeline.${skipNote}`;
  }
  return `About half of this is filler you would scroll past.${skipNote}`;
}

function dominantHabit(weak: WorthFeatures[]): "bait" | "empty" | "promo" | "thin" {
  let bait = 0;
  let empty = 0;
  let promo = 0;
  let thin = 0;
  for (const features of weak) {
    if (features.bait >= GATES.baitPass) bait += 1;
    else if (features.empty >= GATES.emptyPass) empty += 1;
    else if (features.promo >= GATES.promoPass) promo += 1;
    else thin += 1;
  }
  const ranked: Array<["bait" | "empty" | "promo" | "thin", number]> = [
    ["bait", bait],
    ["empty", empty],
    ["promo", promo],
    ["thin", thin],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : "thin";
}

export const SIGNAL_ROWS: Array<{ key: keyof WorthFeatures; label: string }> = [
  { key: "specific", label: "Specific" },
  { key: "fresh", label: "New" },
  { key: "funny", label: "Funny" },
  { key: "bait", label: "Begging" },
  { key: "promo", label: "Selling" },
  { key: "empty", label: "Empty words" },
  { key: "ai", label: "AI-written" },
  { key: "template", label: "Template" },
];
