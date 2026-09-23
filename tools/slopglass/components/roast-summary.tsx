"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { SubstackSubscribe } from "@/components/substack-subscribe";
import { MODEL_ID } from "@/lib/slop/rubric";
import { GATES, type Bucket, type Tally, type WorthFeatures } from "@/lib/slop/worth";

type CardState = {
  phase: "idle" | "reading" | "thin" | "repost" | "error" | "ready";
  features?: WorthFeatures;
};

type Post = {
  id: string;
  repost: boolean;
};

export type AuditBreakdown = {
  ai: number;
  template: number;
  bait: number;
  empty: number;
  promo: number;
  vague: number;
  funny: number;
  thin: number;
  reposts: number;
};

export function flagsOf(features: WorthFeatures): string[] {
  const flags: string[] = [];
  if ((features.ai ?? 0) >= GATES.aiFlag) flags.push("Sounds AI-written");
  if ((features.template ?? 0) >= GATES.templateFlag) flags.push("Viral template");
  if (features.bait >= GATES.baitPass) flags.push("Asks for replies");
  if (features.empty >= GATES.emptyPass) flags.push("Empty words");
  if (features.promo >= GATES.promoPass) flags.push("Selling");
  if (features.specific < GATES.specificYes) flags.push("Nothing specific");
  if (features.funny >= GATES.funnyRead) flags.push("Funny");
  return flags;
}

export function auditBreakdown(posts: Post[], cards: Record<string, CardState>): AuditBreakdown {
  const counts: AuditBreakdown = { ai: 0, template: 0, bait: 0, empty: 0, promo: 0, vague: 0, funny: 0, thin: 0, reposts: 0 };

  for (const post of posts) {
    const card = cards[post.id];
    if (card?.phase === "repost" || post.repost) {
      counts.reposts += 1;
      continue;
    }
    if (card?.phase === "thin") {
      counts.thin += 1;
      continue;
    }
    if (card?.phase !== "ready" || !card.features) continue;
    const f = card.features;
    if ((f.ai ?? 0) >= GATES.aiFlag) counts.ai += 1;
    if ((f.template ?? 0) >= GATES.templateFlag) counts.template += 1;
    if (f.bait >= GATES.baitPass) counts.bait += 1;
    if (f.empty >= GATES.emptyPass) counts.empty += 1;
    if (f.promo >= GATES.promoPass) counts.promo += 1;
    if (f.specific < GATES.specificYes) counts.vague += 1;
    if (f.funny >= GATES.funnyRead) counts.funny += 1;
  }

  return counts;
}

export function jevLines(tally: Tally, breakdown: AuditBreakdown): string[] {
  const lines: string[] = [];
  const { judged, read, band } = tally;
  if (judged === 0) return lines;

  lines.push(
    read === judged
      ? `${read} of ${judged} posts were worth reading. Who writes these for you?`
      : `${read} of ${judged} posts were worth reading.`,
  );

  if (breakdown.ai > 0) {
    lines.push(
      breakdown.ai === 1
        ? "One of them sounds like a model wrote it."
        : `${breakdown.ai} of them sound like a model wrote them.`,
    );
  }

  if (breakdown.bait > 0) {
    lines.push("The ones that fail are collecting replies. Stop asking and start saying.");
  } else if (breakdown.empty > 0) {
    lines.push("Some of this sounds like advice and names nothing that happened.");
  } else if (breakdown.promo > 1) {
    lines.push("Announcements piled up. One is a person with a job. This many is a billboard.");
  } else if (band?.id === "back" || band?.id === "decent") {
    lines.push("I went looking for junk. I could not find much. I am suspicious.");
  } else if (band?.id === "over" || band?.id === "slop") {
    lines.push("You can skip most of these and miss nothing.");
  }

  return lines;
}

export type Finding = { label: string; count: number; tone: "good" | "bad" | "plain" };

export function findingsOf(tally: Tally, breakdown: AuditBreakdown): Finding[] {
  const all: Finding[] = [
    { label: "worth reading", count: tally.read, tone: "good" },
    { label: "sound AI-written", count: breakdown.ai, tone: "bad" },
    { label: "viral template", count: breakdown.template, tone: "bad" },
    { label: "asked for replies", count: breakdown.bait, tone: "bad" },
    { label: "empty words", count: breakdown.empty, tone: "bad" },
    { label: "selling", count: breakdown.promo, tone: "bad" },
    { label: "nothing specific", count: breakdown.vague, tone: "bad" },
    { label: "funny", count: breakdown.funny, tone: "good" },
    { label: "too short", count: breakdown.thin, tone: "plain" },
    { label: "reposts skipped", count: breakdown.reposts, tone: "plain" },
  ];
  return all.filter((item) => item.count > 0 || item.label === "worth reading" || item.label === "sound AI-written");
}

export type ChatMessage = {
  id: string;
  text: string;
  bucket?: Bucket | "thin" | "repost" | "error";
  tags?: string[];
};

const BUCKET_TONE: Record<NonNullable<ChatMessage["bucket"]>, { label: string; className: string }> = {
  read: { label: "Read", className: "bg-[#e7f6ee] text-[#145236]" },
  skim: { label: "Skim", className: "bg-[#fbf3df] text-[#6d4708]" },
  pass: { label: "Skip", className: "bg-[#fde8e2] text-[#8d2a16]" },
  thin: { label: "Skim", className: "bg-[#fbf3df] text-[#6d4708]" },
  repost: { label: "Repost", className: "bg-[#eee7db] text-[#5c564c]" },
  error: { label: "Missed", className: "bg-[#eee7db] text-[#8d2a16]" },
};

const FINDING_TONE: Record<Finding["tone"], string> = {
  good: "border-[#cfe8da] bg-[#eef8f2] text-[#145236]",
  bad: "border-[#f2d3ca] bg-[#fdf0ec] text-[#8d2a16]",
  plain: "border-[#e7dfd2] bg-[#fffdf8] text-[#1c1915]",
};

function Pill({ children, className }: { children: ReactNode; className: string }) {
  return <span className={`inline-flex rounded-full border px-3 py-1 text-sm ${className}`}>{children}</span>;
}

export function JevChat({
  messages,
  typing,
  lines,
  findings,
  total,
}: {
  messages: ChatMessage[];
  typing?: string;
  lines: string[];
  findings: Finding[] | null;
  total: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages.length, typing, findings, lines.length]);

  return (
    <section className="relative min-h-[490px] rounded-[28px] bg-[#fffdf8] shadow-[0_24px_60px_rgba(28,25,21,0.08)] ring-1 ring-[#e7dfd2]">
      <div className="absolute inset-0 flex flex-col p-5">
        <p className="text-[11px] tracking-[0.22em] text-[#6f685e] uppercase">Jev</p>
        <div ref={scroller} className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {messages.map((message) => (
            <div key={message.id} className="rounded-[18px] bg-[#f6f1e6] px-4 py-2.5 text-sm leading-6 text-[#1c1915]">
              {message.bucket && (
                <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs ${BUCKET_TONE[message.bucket].className}`}>
                  {BUCKET_TONE[message.bucket].label}
                </span>
              )}
              {message.text}
              {message.tags && message.tags.length > 0 && (
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {message.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-[#e7dfd2] bg-[#fffdf8] px-2 py-0.5 text-xs text-[#5c564c]">
                      {tag}
                    </span>
                  ))}
                </span>
              )}
            </div>
          ))}
          {typing && (
            <div className="flex items-center gap-2 px-1 py-1 text-sm text-[#6f685e]">
              <span className="worth-pulse size-2 rounded-full bg-[#c4922a]" />
              {typing}
            </div>
          )}
          {lines.map((line) => (
            <p key={line} className="rounded-[18px] bg-[#1c1915] px-4 py-2.5 text-sm leading-6 text-[#f6f1e6]">
              <span className="font-heading text-[#e0b35a]">Jev:</span> {line}
            </p>
          ))}
          {findings && (
            <div className="flex flex-wrap gap-2 pt-2">
              {findings.map((item) => (
                <Pill key={item.label} className={FINDING_TONE[item.tone]}>
                  {item.count} {item.label}
                </Pill>
              ))}
              <Pill className={FINDING_TONE.plain}>
                {total} posts · {MODEL_ID}
              </Pill>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function RoastSubscribe() {
  return (
    <SubstackSubscribe
      title="Get posts worth reading"
      description="Stories from building and selling Moosend, plus what I am learning about SaaS, growth, and AI. One email when I publish."
    />
  );
}
