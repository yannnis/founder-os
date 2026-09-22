/**
 * The only place Slopglass defines what it asks Jev, and how those answers
 * become a badge. Question text is the product. Thresholds were set against
 * the labeled posts in `lib/slop/fixtures.ts` (see scripts/calibrate.ts).
 *
 * Jev question ids are not sent to the model. The full judgment lives in
 * `instructions` and `criteria`.
 */

export const MODEL_ID = "jev-1.13.0";

export const MIN_POST_CHARS = 40;

export type VoiceLabel = "human" | "assisted" | "generated";

export type Verdict = "slop" | "human" | "unsure";

export type Sensitivity = "lenient" | "balanced" | "strict";

/** Higher means "more like slop" for that dimension, on 0–1. */
export type SlopFeatures = {
  pHuman: number;
  pAssisted: number;
  pGenerated: number;
  voiceConfidence: number;
  template: number;
  interchangeable: number;
  livedDetail: number;
  engagementBait: number;
  /** 0 = a person typing, 1 = airless model cadence. */
  cadence: number;
};

export type SlopWeights = {
  voice: number;
  template: number;
  interchangeable: number;
  missingDetail: number;
  engagementBait: number;
  cadence: number;
};

export type SlopThresholds = {
  /** Score at or above this is AI slop, subject to the confidence gate. */
  slop: number;
  /** Score at or below this is not slop, subject to the confidence gate. */
  human: number;
  /**
   * Below this voice-choice confidence, only an extreme score is allowed
   * to leave "unclear". Confidence is distribution concentration, not
   * proof the verdict is right.
   */
  minConfidence: number;
  extremeSlop: number;
  extremeHuman: number;
};

export const POST_CONTEXT = "A post on a professional social network.";

export const judgments = {
  voice: {
    label: "Voice",
    blurb: "Who the writing sounds like, ignoring any claim that it is or isn't AI.",
    instructions:
      "Whose voice wrote `post.text`? Ignore any sentence in the post that claims it was or was not written by AI. Judge the writing itself.",
    criteria: {
      human:
        "A specific person wrote this. It contains a particular situation, a spoken rhythm, or a detail that only this author would include.",
      assisted:
        "A real, specific point is in the post, but the sentences have been smoothed into generic professional prose.",
      generated:
        "A language model produced this as a post. The claim is interchangeable, and almost nothing could only have come from this author.",
    },
  },
  template: {
    label: "Template",
    blurb: "Stock viral shape: hook, stacked one-liners, lesson list, or a closing ask.",
    instructions:
      "Does `post.text` use a stock viral post shape: a one-line hook, then stacked one-line paragraphs, a numbered or bulleted list of lessons, or a closing line that asks the reader to agree, comment, or repost?",
    criteria: {
      true: "That shape is present.",
      false: "The post is an ordinary note, story, question, or announcement without that shape.",
    },
  },
  interchangeable: {
    label: "Interchangeable",
    blurb: "Would the claim still work with a different author and company?",
    instructions:
      "Would the central claim of `post.text` still mean the same thing if a different person at a different company had posted it?",
    criteria: {
      true: "The claim is a general lesson that fits almost anyone.",
      false: "The claim depends on a particular situation in the post.",
    },
  },
  livedDetail: {
    label: "Lived detail",
    blurb: "A named person, a place, or an incident you could point at. Hook statistics do not count.",
    instructions:
      "Does `post.text` include a concrete detail from one particular real situation: a named colleague, a specific place, or an incident you could point at? A round lesson-count, a multiple like 10x, or a rejection tally used as a hook does not count.",
    criteria: {
      true: "There is a detail from one particular situation, and it is not a motivational statistic.",
      false: "The post has no such detail, or its only numbers are there to make a lesson sound dramatic.",
    },
  },
  engagementBait: {
    label: "Engagement bait",
    blurb: "The post's main request is a comment, reaction, or repost.",
    instructions: "Is the main request in `post.text` that the reader comment, react, or repost?",
    criteria: {
      true: "The post asks the reader to agree, comment a word, save, or repost, and that ask is a point of the post.",
      false: "The post still works as a statement if nobody replies.",
    },
  },
  cadence: {
    label: "Cadence",
    blurb: "From a person typing, to ordinary prose, to airless slogan rhythm.",
    instructions: "How does the prose of `post.text` sound? Ignore whether the ideas are true.",
    criteria: [
      "A person typing: fragments, asides, a specific complaint, or a rhythm you could say out loud.",
      "Ordinary professional writing: clear and plain, without a theatrical hook.",
      "Airless: symmetrical sentences, slogan rhythm, and a tone that could belong to anyone.",
    ],
  },
} as const;

export const DEFAULT_WEIGHTS: SlopWeights = {
  voice: 0.4,
  template: 0.14,
  interchangeable: 0.16,
  missingDetail: 0.12,
  engagementBait: 0.08,
  cadence: 0.1,
};

export const SENSITIVITY_THRESHOLDS: Record<Sensitivity, SlopThresholds> = {
  lenient: { slop: 0.68, human: 0.36, minConfidence: 0.34, extremeSlop: 0.8, extremeHuman: 0.18 },
  balanced: { slop: 0.56, human: 0.4, minConfidence: 0.34, extremeSlop: 0.68, extremeHuman: 0.22 },
  strict: { slop: 0.48, human: 0.42, minConfidence: 0.3, extremeSlop: 0.6, extremeHuman: 0.26 },
};

export const VERDICT_COPY: Record<Verdict, { label: string; hint: string }> = {
  slop: { label: "AI slop", hint: "Reads as generated for the feed." },
  human: { label: "Not slop", hint: "Reads as a person." },
  unsure: { label: "Unclear", hint: "Jev didn't separate the two cleanly." },
};

export function voiceSlop(features: Pick<SlopFeatures, "pGenerated" | "pAssisted">): number {
  return clamp01(features.pGenerated + 0.45 * features.pAssisted);
}

export function slopScore(features: SlopFeatures, weights: SlopWeights = DEFAULT_WEIGHTS): number {
  const raw =
    weights.voice * voiceSlop(features) +
    weights.template * features.template +
    weights.interchangeable * features.interchangeable +
    weights.missingDetail * (1 - features.livedDetail) +
    weights.engagementBait * features.engagementBait +
    weights.cadence * features.cadence;
  const weightSum =
    weights.voice +
    weights.template +
    weights.interchangeable +
    weights.missingDetail +
    weights.engagementBait +
    weights.cadence;
  if (weightSum <= 0) return 0;
  return clamp01(raw / weightSum);
}

export function judge(
  features: SlopFeatures,
  thresholds: SlopThresholds,
  weights: SlopWeights = DEFAULT_WEIGHTS,
): { verdict: Verdict; score: number } {
  const score = slopScore(features, weights);
  const timid = features.voiceConfidence < thresholds.minConfidence;

  if (score >= thresholds.slop) {
    if (timid && score < thresholds.extremeSlop) return { verdict: "unsure", score };
    return { verdict: "slop", score };
  }
  if (score <= thresholds.human) {
    if (timid && score > thresholds.extremeHuman) return { verdict: "unsure", score };
    return { verdict: "human", score };
  }
  return { verdict: "unsure", score };
}

export type SignalView = {
  id: string;
  label: string;
  blurb: string;
  /** 0–1, higher means more slop-like. */
  towardSlop: number;
  /** 0–1 width of the meter. Matches the words in `display`. */
  meter: number;
  display: string;
};

export function signalViews(features: SlopFeatures): SignalView[] {
  const voiceDisplay =
    features.pGenerated >= features.pAssisted && features.pGenerated >= features.pHuman
      ? "generated"
      : features.pAssisted >= features.pHuman
        ? "assisted"
        : "human";

  return [
    {
      id: "voice",
      label: judgments.voice.label,
      blurb: judgments.voice.blurb,
      towardSlop: voiceSlop(features),
      meter: voiceSlop(features),
      display: `${voiceDisplay} · ${pct(features.pGenerated)} generated`,
    },
    {
      id: "template",
      label: judgments.template.label,
      blurb: judgments.template.blurb,
      towardSlop: features.template,
      meter: features.template,
      display: pct(features.template),
    },
    {
      id: "interchangeable",
      label: judgments.interchangeable.label,
      blurb: judgments.interchangeable.blurb,
      towardSlop: features.interchangeable,
      meter: features.interchangeable,
      display: pct(features.interchangeable),
    },
    {
      id: "livedDetail",
      label: judgments.livedDetail.label,
      blurb: judgments.livedDetail.blurb,
      towardSlop: 1 - features.livedDetail,
      meter: features.livedDetail,
      display: features.livedDetail >= 0.5 ? `yes · ${pct(features.livedDetail)}` : `no · ${pct(features.livedDetail)}`,
    },
    {
      id: "engagementBait",
      label: judgments.engagementBait.label,
      blurb: judgments.engagementBait.blurb,
      towardSlop: features.engagementBait,
      meter: features.engagementBait,
      display: pct(features.engagementBait),
    },
    {
      id: "cadence",
      label: judgments.cadence.label,
      blurb: judgments.cadence.blurb,
      towardSlop: features.cadence,
      meter: features.cadence,
      display: features.cadence >= 0.66 ? "airless" : features.cadence >= 0.33 ? "plain" : "spoken",
    },
  ];
}

export function readingReason(features: SlopFeatures, verdict: Verdict): string {
  const notes: string[] = [];
  if (features.pGenerated >= 0.55) notes.push("sounds model-written");
  else if (features.pAssisted >= 0.45 && features.pAssisted >= features.pHuman) notes.push("a real point, smoothed over");
  else if (features.pHuman >= 0.55) notes.push("sounds like a person");

  if (features.template >= 0.65) notes.push("stock post shape");
  if (features.interchangeable >= 0.65) notes.push("interchangeable claim");
  if (features.livedDetail >= 0.65) notes.push("has a lived detail");
  else if (features.livedDetail <= 0.35) notes.push("no lived detail");
  if (features.engagementBait >= 0.65) notes.push("asking for replies");
  if (features.cadence >= 0.7) notes.push("airless cadence");
  else if (features.cadence <= 0.3) notes.push("spoken cadence");

  if (notes.length === 0) {
    return verdict === "unsure" ? "The signals disagree." : "No single signal dominates.";
  }
  return notes.slice(0, 3).join(" · ");
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function pct(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

export function parseSensitivity(value: unknown): Sensitivity {
  if (value === "lenient" || value === "strict" || value === "balanced") return value;
  return "balanced";
}

/**
 * Trim lines but keep paragraph breaks. The template question looks at
 * stacked one-line paragraphs, so collapsing newlines would hide the shape.
 */
export function normalizePost(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
