export type LeadBand = {
  id: "quiet" | "start" | "worth" | "strong" | "hot";
  label: string;
  min: number;
  max: number;
};

/** Left is quiet, right is a hot pocket of leads. */
export const LEAD_BANDS: LeadBand[] = [
  { id: "quiet", label: "Quiet", min: 0, max: 24 },
  { id: "start", label: "A start", min: 25, max: 49 },
  { id: "worth", label: "Worth staying", min: 50, max: 69 },
  { id: "strong", label: "Strong", min: 70, max: 84 },
  { id: "hot", label: "Hot", min: 85, max: 100 },
];

export const BAND_COLOR: Record<LeadBand["id"], string> = {
  quiet: "#c23b2e",
  start: "#d86a3a",
  worth: "#c4922a",
  strong: "#3e8f62",
  hot: "#1f6b45",
};

/** One lead in every ten scored posts lands on Worth staying. */
export function leadScore(leads: number, judged: number): number | null {
  if (judged <= 0) return null;
  const perTen = (leads / judged) * 10;
  return Math.round(Math.min(96, 6 + perTen * 56));
}

export function jevLines(leads: number, judged: number, pending: number): string[] {
  if (judged <= 0) return [];
  const lines = [`${leads} of ${judged} ${judged === 1 ? "post is a lead" : "posts are leads"}.`];
  if (pending > 0) lines.push(`${pending} still reading.`);
  else if (leads === 0) lines.push("Nobody in this batch is asking for the product.");
  else lines.push("One lead in every ten posts is worth staying.");
  return lines;
}

export function bandFor(score: number): LeadBand {
  const rounded = Math.round(score);
  for (const band of LEAD_BANDS) {
    if (rounded <= band.max) return band;
  }
  return LEAD_BANDS[LEAD_BANDS.length - 1];
}
