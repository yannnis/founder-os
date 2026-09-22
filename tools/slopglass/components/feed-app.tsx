"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { InstallDialog } from "@/components/install-dialog";
import { SlopDial } from "@/components/slop-dial";
import { Button } from "@/components/ui/button";
import { WorthBar, type ReadyReading } from "@/components/worth-bar";
import { FEED, type FeedPost } from "@/lib/slop/feed";
import { PROFILES, type Profile } from "@/lib/slop/profiles";
import { MODEL_ID } from "@/lib/slop/rubric";
import type { ClassifyResponse } from "@/lib/slop/types";
import {
  WORTH_QUESTIONS,
  bucketOf,
  tallyOf,
  type Bucket,
  type Contribution,
  type WorthFeatures,
} from "@/lib/slop/worth";

type Phase = "idle" | "reading" | "thin" | "repost" | "error" | "ready";

type CardState = {
  phase: Phase;
  features?: WorthFeatures;
  model?: string;
  latencyMs?: number;
  message?: string;
};

const INITIAL: Record<string, CardState> = Object.fromEntries(
  FEED.map((post) => [post.id, { phase: post.repost ? ("repost" as const) : ("idle" as const) }]),
);

export function FeedApp() {
  const [mode, setMode] = useState<"feed" | "profile">("feed");
  const [profileId, setProfileId] = useState(PROFILES[0].id);
  const [cards, setCards] = useState<Record<string, CardState>>(INITIAL);
  const [filter, setFilter] = useState<"all" | Bucket>("all");
  const [health, setHealth] = useState<"unknown" | "ready" | "nokey" | "down">("unknown");
  const phases = useRef<Record<string, Phase>>({});
  const running = useRef(0);
  const queue = useRef<Array<() => void>>([]);

  const profile = PROFILES.find((item) => item.id === profileId) ?? PROFILES[0];
  const posts = mode === "profile" ? profile.posts : FEED;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => response.json())
      .then((body: { ok?: boolean }) => {
        if (!cancelled) setHealth(body.ok ? "ready" : "nokey");
      })
      .catch(() => {
        if (!cancelled) setHealth("down");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enqueue = useCallback((task: () => Promise<void>) => {
    const run = () => {
      running.current += 1;
      task().finally(() => {
        running.current -= 1;
        const next = queue.current.shift();
        if (next) next();
      });
    };
    if (running.current < 6) run();
    else queue.current.push(run);
  }, []);

  const request = useCallback(
    (id: string, text: string, repost?: boolean) => {
      if (repost || !text.trim()) {
        phases.current[id] = "repost";
        setCards((current) => ({ ...current, [id]: { phase: "repost" } }));
        return;
      }
      const phase = phases.current[id];
      if (phase === "reading" || phase === "ready" || phase === "thin" || phase === "repost") return;
      phases.current[id] = "reading";
      setCards((current) => ({ ...current, [id]: { phase: "reading" } }));
      enqueue(async () => {
        try {
          const response = await fetch("/api/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          const body = (await response.json()) as ClassifyResponse;
          if (body.ok && "skipped" in body) {
            const next = body.reason === "too_short" ? "thin" : "repost";
            phases.current[id] = next;
            setCards((current) => ({ ...current, [id]: { phase: next } }));
            return;
          }
          if (!body.ok || !("reading" in body)) {
            phases.current[id] = "error";
            setCards((current) => ({
              ...current,
              [id]: { phase: "error", message: body.ok ? "No judgment came back." : body.error },
            }));
            return;
          }
          phases.current[id] = "ready";
          setCards((current) => ({
            ...current,
            [id]: {
              phase: "ready",
              features: body.reading.features,
              model: body.reading.model,
              latencyMs: body.reading.latencyMs,
            },
          }));
        } catch {
          phases.current[id] = "error";
          setCards((current) => ({
            ...current,
            [id]: { phase: "error", message: "The request never made it back." },
          }));
        }
      });
    },
    [enqueue],
  );

  const seen = useRef(new WeakSet<Element>());

  useEffect(() => {
    if (mode !== "feed") return;
    const consider = (node: Element) => {
      if (seen.current.has(node)) return;
      const id = (node as HTMLElement).dataset.postId;
      const post = FEED.find((item) => item.id === id);
      if (!post) return;
      seen.current.add(node);
      request(post.id, post.text, post.repost);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) consider(entry.target);
        }
      },
      { rootMargin: "960px 0px" },
    );

    const scan = () => {
      document.querySelectorAll("article[data-post-id]").forEach((node) => {
        const rect = node.getBoundingClientRect();
        const near = rect.top < window.innerHeight + 960 && rect.bottom > -960;
        if (near) consider(node);
        else io.observe(node);
      });
    };

    scan();
    const onScroll = () => scan();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [request, filter, mode]);

  useEffect(() => {
    if (mode !== "profile") return;
    const timer = window.setTimeout(() => {
      for (const post of profile.posts) request(post.id, post.text, post.repost);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode, profile, request]);

  const tally = useMemo(() => {
    const items: Contribution[] = [];
    let pending = 0;
    for (const post of posts) {
      const card = cards[post.id];
      const item = contribution(post, card);
      if (item) items.push(item);
      else if (!card || card.phase === "idle" || card.phase === "reading") pending += 1;
    }
    return { ...tallyOf(items), pending, total: posts.length };
  }, [cards, posts]);

  return (
    <div className="stage min-h-full text-[#1c1915]">
      <header>
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4 py-6 sm:px-6">
          <div>
            <p className="text-[11px] tracking-[0.22em] text-[#6f685e] uppercase">Worth reading</p>
            <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">Slopglass</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#5c564c]">
              A label lands on each post as it nears the screen. Feed mode scores this scroll. Profile mode scores one
              person. The number is the share that was not worth your time.
            </p>
          </div>
          <InstallDialog />
        </div>
      </header>

      {health === "nokey" && (
        <p className="mx-auto mt-4 max-w-6xl px-4 text-sm text-[#8d2a16] sm:px-6">
          The server has no TYPESAFE_API_KEY, so Jev can&apos;t be asked. Add it to <code>.env.local</code> and restart.
        </p>
      )}
      {health === "down" && (
        <p className="mx-auto mt-4 max-w-6xl px-4 text-sm text-[#8d2a16] sm:px-6">
          The classifier didn&apos;t answer. Reload once the server is up.
        </p>
      )}

      <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,680px)_340px]">
        <section className="order-2 lg:order-1">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full bg-[#1c1915]/8 p-1">
              <ModeButton active={mode === "feed"} onClick={() => setMode("feed")}>
                Feed
              </ModeButton>
              <ModeButton active={mode === "profile"} onClick={() => setMode("profile")}>
                Profile
              </ModeButton>
            </div>
            <div className="inline-flex gap-1">
              {(
                [
                  ["all", "All"],
                  ["read", "Read"],
                  ["skim", "Skim"],
                  ["pass", "Pass"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded-full px-3 py-1 text-sm ${filter === id ? "bg-[#1c1915] text-[#f6f1e6]" : "text-[#5c564c] hover:bg-white/70"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "profile" && <ProfileIntro profile={profile} onPick={setProfileId} />}

          <div className="space-y-3">
            {posts.map((post) => {
              const card = cards[post.id] ?? { phase: "idle" as const };
              if (!visible(post, card, filter)) return null;
              const reading: ReadyReading | undefined =
                card.phase === "ready" && card.features && card.model && card.latencyMs !== undefined
                  ? { features: card.features, model: card.model, latencyMs: card.latencyMs }
                  : undefined;
              return (
                <PostCard
                  key={`${mode}-${post.id}`}
                  post={post}
                  card={card}
                  reading={reading}
                  onRetry={() => {
                    phases.current[post.id] = "idle";
                    request(post.id, post.text, post.repost);
                  }}
                />
              );
            })}
          </div>
        </section>

        <aside className="order-1 lg:sticky lg:top-4 lg:order-2 lg:self-start">
          <section className="rounded-[28px] bg-[#fffdf8]/90 p-5 shadow-[0_24px_60px_rgba(28,25,21,0.08)] ring-1 ring-[#e7dfd2] backdrop-blur-md">
            <p className="text-[11px] tracking-[0.22em] text-[#6f685e] uppercase">
              {mode === "profile" ? "This profile" : "This scroll"}
            </p>
            <SlopDial
              score={tally.score}
              band={tally.band}
              judged={tally.judged}
              total={tally.total}
              pending={tally.pending}
              read={tally.read}
              skim={tally.skim}
              pass={tally.pass}
            />
            {tally.skipped > 0 ? (
              <p className="mt-3 text-center text-xs text-[#6f685e]">{tally.skipped} reposts left out</p>
            ) : null}
            <p className="font-heading mt-4 text-center text-lg leading-7 italic">{tally.roast}</p>
            <p className="mt-3 text-center text-xs leading-5 text-[#6f685e]">
              Pass counts whole, skim counts half. Not likes, not followers. {MODEL_ID}.
            </p>
            <details className="mt-4 border-t border-[#efe6d8] pt-3">
              <summary className="cursor-pointer text-xs tracking-[0.14em] text-[#6f685e] uppercase">Six questions</summary>
              <ul className="mt-3 space-y-2">
                {Object.entries(WORTH_QUESTIONS).map(([id, question]) => (
                  <li key={id}>
                    <p className="text-sm font-medium">{question.label}</p>
                    <p className="text-xs leading-5 text-[#5c564c]">{question.blurb}</p>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </aside>
      </main>
    </div>
  );
}

function contribution(post: FeedPost, card: CardState | undefined): Contribution | null {
  if (post.repost || card?.phase === "repost") return { kind: "skip", reason: "repost" };
  if (card?.phase === "thin") return { kind: "thin" };
  if (card?.phase === "ready" && card.features) {
    return { kind: "judged", bucket: bucketOf(card.features), features: card.features };
  }
  return null;
}

function visible(post: FeedPost, card: CardState, filter: "all" | Bucket): boolean {
  if (filter === "all") return true;
  if (post.repost || card.phase === "repost") return false;
  if (card.phase === "thin") return filter === "skim";
  if (card.phase === "ready" && card.features) return bucketOf(card.features) === filter;
  return true;
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-4 py-1.5 text-sm ${active ? "bg-[#1c1915] text-[#f6f1e6] shadow-sm" : "text-[#5c564c]"}`}
    >
      {children}
    </button>
  );
}

function ProfileIntro({ profile, onPick }: { profile: Profile; onPick: (id: string) => void }) {
  return (
    <div className="mb-4 rounded-[28px] bg-[#fffdf8]/90 px-5 py-5 shadow-[0_16px_40px_rgba(28,25,21,0.06)] ring-1 ring-[#e7dfd2]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-heading text-3xl tracking-tight">{profile.name}</p>
          <p className="text-sm text-[#5c564c]">{profile.headline}</p>
        </div>
        <div className="inline-flex rounded-full bg-[#1c1915]/8 p-1">
          {PROFILES.map((item) => (
            <ModeButton key={item.id} active={item.id === profile.id} onClick={() => onPick(item.id)}>
              {item.name.split(" ")[0]}
            </ModeButton>
          ))}
        </div>
      </div>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[#6f685e]">{profile.note}</p>
    </div>
  );
}

function PostCard({
  post,
  card,
  reading,
  onRetry,
}: {
  post: FeedPost;
  card: CardState;
  reading?: ReadyReading;
  onRetry: () => void;
}) {
  const initials = post.author
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <article
      data-post-id={post.id}
      className="rounded-[28px] bg-[#fffdf8] px-4 py-4 shadow-[0_16px_40px_rgba(28,25,21,0.05)] ring-1 ring-[#e7dfd2] sm:px-5"
    >
      <header className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-full bg-[#24362c] font-heading text-sm text-[#f6f1e6]"
            aria-hidden
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{post.author}</p>
            <p className="truncate text-xs text-[#6f685e]">
              {post.role} · {post.time}
            </p>
          </div>
        </div>
        <WorthBar phase={card.phase} message={card.message} reading={reading} />
      </header>
      {card.phase === "error" && (
        <Button size="sm" variant="outline" className="mb-3" onClick={onRetry}>
          Ask Jev again
        </Button>
      )}
      {post.repost ? (
        <p className="border-l-2 border-[#e7dfd2] pl-3 text-[15px] leading-7 text-[#6f685e]">{post.quoted}</p>
      ) : (
        <p className="text-[15px] leading-7 whitespace-pre-wrap">{post.text}</p>
      )}
      <p className="mt-3 text-xs text-[#8a8175]">{post.reactions}</p>
    </article>
  );
}
