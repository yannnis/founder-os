"use client";

import type { ReactNode } from "react";

import { SubstackSubscribe } from "@/components/substack-subscribe";
import { MODEL_ID } from "@/lib/slop/rubric";
import { GATES, type Tally } from "@/lib/slop/worth";

type CardState = {
  phase: "idle" | "reading" | "thin" | "repost" | "error" | "ready";
  features?: {
    bait: number;
    empty: number;
    promo: number;
  };
};

type Post = {
  id: string;
  repost: boolean;
};

export type AuditBreakdown = {
  bait: number;
  empty: number;
  promo: number;
  thin: number;
  reposts: number;
};

export function auditBreakdown(posts: Post[], cards: Record<string, CardState>): AuditBreakdown {
  let bait = 0;
  let empty = 0;
  let promo = 0;
  let thin = 0;
  let reposts = 0;

  for (const post of posts) {
    const card = cards[post.id];
    if (card?.phase === "repost" || post.repost) {
      reposts += 1;
      continue;
    }
    if (card?.phase === "thin") {
      thin += 1;
      continue;
    }
    if (card?.phase === "ready" && card.features) {
      if (card.features.bait >= GATES.baitPass) bait += 1;
      else if (card.features.empty >= GATES.emptyPass) empty += 1;
      else if (card.features.promo >= GATES.promoPass) promo += 1;
    }
  }

  return { bait, empty, promo, thin, reposts };
}

function jevLines(tally: Tally, breakdown: AuditBreakdown): string[] {
  const lines: string[] = [];
  const { judged, read, band } = tally;
  if (judged === 0) return lines;

  const opener =
    read === judged
      ? `${read} of ${judged} posts were worth reading. Who writes these for you?`
      : `${read} of ${judged} posts were worth reading.`;

  lines.push(opener);

  if (band?.id === "back" || band?.id === "decent") {
    lines.push("I went looking for junk. I could not find much. I am suspicious.");
  } else if (breakdown.bait > 0) {
    lines.push("The posts that fail are collecting replies. Stop asking and start saying.");
  } else if (breakdown.empty > 0) {
    lines.push("A lot of this sounds like advice and names nothing that happened.");
  } else if (breakdown.promo > 0) {
    lines.push("Announcements piled up. One is a person with a job. This many is a billboard.");
  } else if (band?.id === "over" || band?.id === "slop") {
    lines.push("You can skip most of these and miss nothing.");
  }

  return lines.slice(0, 2);
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-[#e7dfd2] bg-[#fffdf8] px-3 py-1 text-sm text-[#1c1915]">
      {children}
    </span>
  );
}

export function RoastSummary({
  tally,
  breakdown,
  total,
}: {
  tally: Tally;
  breakdown: AuditBreakdown;
  total: number;
}) {
  const lines = jevLines(tally, breakdown);
  const pills: string[] = [
    `${tally.read} Read`,
    `${tally.skim} Skim`,
    `${tally.pass} Pass`,
  ];
  if (breakdown.bait > 0) pills.push(`${breakdown.bait} asked for replies`);
  if (breakdown.empty > 0) pills.push(`${breakdown.empty} empty words`);
  if (breakdown.promo > 0) pills.push(`${breakdown.promo} promos`);
  if (breakdown.thin > 0) pills.push(`${breakdown.thin} too short`);
  if (breakdown.reposts > 0) pills.push(`${breakdown.reposts} reposts skipped`);
  pills.push(`${total} posts · ${MODEL_ID}`);

  return (
    <section className="rounded-[28px] bg-[#fffdf8] p-5 shadow-[0_24px_60px_rgba(28,25,21,0.08)] ring-1 ring-[#e7dfd2]">
      <div className="space-y-3">
        {lines.map((line) => (
          <p key={line} className="rounded-[18px] bg-[#f6f1e6] px-4 py-3 text-sm leading-6 text-[#1c1915]">
            <span className="font-heading text-[#c4922a]">Jev:</span> {line}
          </p>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {pills.map((pill) => (
          <Pill key={pill}>{pill}</Pill>
        ))}
      </div>

      <div className="mt-5">
        <SubstackSubscribe
          title="Get posts worth reading"
          description="Stories from building and selling Moosend, plus what I am learning about SaaS, growth, and AI. One email when I publish."
        />
      </div>
    </section>
  );
}
