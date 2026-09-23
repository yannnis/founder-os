"use client";

import { useState } from "react";

import { BUCKET_COPY, SIGNAL_ROWS, THIN_REASON, bucketOf, postReason, type Bucket, type WorthFeatures } from "@/lib/slop/worth";

const TONE: Record<Bucket | "reading" | "skip" | "error", string> = {
  read: "bg-[#e7f6ee] text-[#145236] shadow-[0_8px_18px_rgba(20,82,54,0.12)]",
  skim: "bg-[#fbf3df] text-[#6d4708] shadow-[0_8px_18px_rgba(109,71,8,0.1)]",
  pass: "bg-[#fde8e2] text-[#8d2a16] shadow-[0_8px_18px_rgba(141,42,22,0.12)]",
  reading: "bg-white/90 text-[#5c564c] shadow-[0_8px_18px_rgba(28,25,21,0.08)]",
  skip: "bg-white/90 text-[#5c564c] shadow-[0_8px_18px_rgba(28,25,21,0.08)]",
  error: "bg-white/90 text-[#8d2a16] shadow-[0_8px_18px_rgba(28,25,21,0.08)]",
};

export type ReadyReading = {
  features: WorthFeatures;
  model: string;
  latencyMs: number;
};

export function WorthBar({
  phase,
  message,
  reading,
}: {
  phase: "idle" | "reading" | "thin" | "repost" | "error" | "ready";
  message?: string;
  reading?: ReadyReading;
}) {
  const [open, setOpen] = useState(false);

  if (phase === "idle") return null;

  if (phase === "reading") {
    return (
      <span className={`worth-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${TONE.reading}`}>
        <span className="worth-pulse size-2 rounded-full bg-current" />
        Reading
      </span>
    );
  }

  if (phase === "thin") {
    return <Chip tone="skim" label="Skim" detail={THIN_REASON} />;
  }

  if (phase === "repost") {
    return <Chip tone="skip" label="Repost" detail="Skipped. Someone else is talking." />;
  }

  if (phase === "error" || !reading) {
    return <Chip tone="error" label="Missed" detail={message || "Couldn't read this."} />;
  }

  const bucket = bucketOf(reading.features);
  const copy = BUCKET_COPY[bucket];
  const reason = postReason(reading.features, bucket);

  return (
    <span
      className="relative inline-flex flex-col items-end"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`worth-chip inline-flex max-w-full items-center gap-2 rounded-full py-1.5 pr-3 pl-2.5 text-left text-sm ${TONE[bucket]}`}
      >
        <span className="size-2 shrink-0 rounded-full bg-current" />
        <span className="font-heading text-base leading-none italic">{copy.label}</span>
        <span className="max-w-[220px] truncate text-[13px] opacity-80 sm:max-w-[280px]">{reason}</span>
      </button>
      {open && (
        <div className="absolute top-full right-0 z-30 w-[280px] pt-2">
        <div className="rounded-2xl border border-[#e7dfd2] bg-[#fffdf8] px-3 py-3 text-left shadow-[0_18px_40px_rgba(28,25,21,0.16)]">
          <p className="text-[11px] tracking-[0.08em] text-[#6f685e] uppercase">
            {reading.model} · {reading.latencyMs}ms{reading.latencyMs === 0 ? " · cached" : ""}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#5c564c]">{copy.hint}</p>
          <ul className="mt-3 space-y-1.5">
            {SIGNAL_ROWS.map((row) => {
              const value = reading.features[row.key] ?? 0;
              return (
                <li key={row.key} className="grid grid-cols-[88px_1fr_28px] items-center gap-2 text-xs">
                  <span>{row.label}</span>
                  <span className="h-1 overflow-hidden rounded-full bg-[#eee7db]">
                    <span className="block h-full bg-[#1c1915]" style={{ width: `${Math.round(value * 100)}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-[#5c564c]">{Math.round(value * 100)}</span>
                </li>
              );
            })}
          </ul>
        </div>
        </div>
      )}
    </span>
  );
}

function Chip({ tone, label, detail }: { tone: Bucket | "skip" | "error"; label: string; detail: string }) {
  return (
    <span className={`worth-chip inline-flex max-w-full items-center gap-2 rounded-full py-1.5 pr-3 pl-2.5 text-sm ${TONE[tone]}`}>
      <span className="size-2 shrink-0 rounded-full bg-current" />
      <span className="font-heading text-base leading-none italic">{label}</span>
      <span className="max-w-[220px] truncate text-[13px] opacity-80 sm:max-w-[280px]">{detail}</span>
    </span>
  );
}
