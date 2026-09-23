"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";

import { LinkedInPost } from "@/components/linkedin-post";
import {
  JevChat,
  RoastSubscribe,
  auditBreakdown,
  findingsOf,
  flagsOf,
  jevLines,
  type ChatMessage,
} from "@/components/roast-summary";
import { COLORS, SlopDial } from "@/components/slop-dial";
import { Button } from "@/components/ui/button";
import { WorthBar, type ReadyReading } from "@/components/worth-bar";
import type { LinkedInProfile } from "@/lib/linkedin/url";
import type { PublicPost } from "@/lib/linkedin/posts";
import { LINKEDIN_PROFILE, PROFILE_PHOTO, SUBSTACK_PROFILE } from "@/lib/site/constants";
import { MODEL_ID } from "@/lib/slop/rubric";
import type { ClassifyResponse } from "@/lib/slop/types";
import { THIN_REASON, bandFor, bucketOf, postReason, tallyOf, type Contribution, type Tally, type WorthFeatures } from "@/lib/slop/worth";

type Phase = "idle" | "reading" | "thin" | "repost" | "error" | "ready";

type CardState = {
  phase: Phase;
  features?: WorthFeatures;
  model?: string;
  latencyMs?: number;
  message?: string;
};

type Scan = {
  profile: LinkedInProfile;
  posts: PublicPost[];
};

const SETTLED: Phase[] = ["thin", "repost", "error", "ready"];

export function RoastPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [focus, setFocus] = useState(0);
  const [health, setHealth] = useState<"unknown" | "ready" | "nokey" | "down">("unknown");
  const [mineHint, setMineHint] = useState(false);
  const profileInput = useRef<HTMLInputElement>(null);
  const phases = useRef<Record<string, Phase>>({});
  const scanId = useRef(0);
  const focusNode = useRef<HTMLElement | null>(null);
  const topBlock = useRef<HTMLDivElement>(null);
  const following = useRef(false);
  const [mini, setMini] = useState(false);

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

  const request = useCallback((id: string, text: string, repost: boolean, token: number) => {
    const phase = phases.current[id];
    if (phase === "reading" || phase === "ready" || phase === "thin" || phase === "repost") return;
    if (repost || !text.trim()) {
      phases.current[id] = "repost";
      setCards((current) => ({ ...current, [id]: { phase: "repost" } }));
      return;
    }
    phases.current[id] = "reading";
    setCards((current) => ({ ...current, [id]: { phase: "reading" } }));
    void (async () => {
      if (token !== scanId.current) return;
      try {
        const response = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const body = (await response.json()) as ClassifyResponse;
        if (token !== scanId.current) return;
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
        if (token !== scanId.current) return;
        phases.current[id] = "error";
        setCards((current) => ({
          ...current,
          [id]: { phase: "error", message: "The request never made it back." },
        }));
      }
    })();
  }, []);

  const posts = scan?.posts ?? [];
  const current = posts[focus];
  const currentPhase = current ? cards[current.id]?.phase : undefined;

  useEffect(() => {
    if (!scan) return;
    const token = scanId.current;
    const end = Math.min(posts.length, focus + 3);
    for (let index = focus; index < end; index += 1) {
      const post = posts[index];
      request(post.id, post.text, post.repost, token);
    }
  }, [focus, posts, request, scan]);

  useEffect(() => {
    if (!scan || !current) return;
    if (!currentPhase || currentPhase === "idle" || currentPhase === "reading") return;
    if (focus >= posts.length - 1) return;
    const dwell = currentPhase === "ready" ? 550 : currentPhase === "error" ? 1600 : 280;
    const timer = window.setTimeout(() => setFocus((index) => index + 1), dwell);
    return () => window.clearTimeout(timer);
  }, [current, currentPhase, focus, posts.length, scan]);

  useEffect(() => {
    if (following.current) focusNode.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focus, scan]);

  useEffect(() => {
    const node = topBlock.current;
    if (!scan || !node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const away = entry.intersectionRatio < 0.35;
        following.current = away;
        setMini(away);
      },
      { threshold: [0, 0.35, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [scan]);

  function openMine() {
    window.open("https://www.linkedin.com/in/me/", "_blank", "noopener,noreferrer");
    setMineHint(true);
    window.setTimeout(() => profileInput.current?.focus(), 0);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const token = scanId.current + 1;
    scanId.current = token;
    phases.current = {};
    setLoading(true);
    setError(null);
    setScan(null);
    setCards({});
    setFocus(0);
    setMini(false);
    following.current = false;

    try {
      const response = await fetch("/api/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = (await response.json()) as
        | { ok: true; profile: LinkedInProfile; posts: PublicPost[] }
        | { ok: false; error?: string };
      if (token !== scanId.current) return;
      if (!body.ok || !("posts" in body)) {
        setError(body.ok ? "No posts came back." : body.error || "Couldn't load that profile.");
        return;
      }
      setScan({ profile: body.profile, posts: body.posts });
    } catch {
      if (token !== scanId.current) return;
      setError("The request never made it back.");
    } finally {
      if (token === scanId.current) setLoading(false);
    }
  }

  const tally = useMemo(() => {
    const items: Contribution[] = [];
    for (const post of posts) {
      const card = cards[post.id];
      const item = contribution(post, card);
      if (item) items.push(item);
    }
    return { ...tallyOf(items), pending: 0, total: posts.length };
  }, [cards, posts]);

  const breakdown = useMemo(() => auditBreakdown(posts, cards), [cards, posts]);

  const ahead = posts.slice(focus + 1, focus + 3);
  const done = focus >= posts.length - 1 && currentPhase !== undefined && SETTLED.includes(currentPhase);
  const pending = posts.filter((post) => cards[post.id]?.phase === "reading").length;

  const messages = useMemo<ChatMessage[]>(() => {
    if (!scan) return [];
    const list: ChatMessage[] = [
      { id: "intro", text: `Pulled ${scan.posts.length} public posts from ${scan.profile.name}. Reading them one at a time.` },
    ];
    scan.posts.slice(0, focus + 1).forEach((post, index) => {
      const message = messageFor(post, cards[post.id], index);
      if (message) list.push(message);
    });
    return list;
  }, [cards, focus, scan]);

  const typing =
    scan && !done && current && (!currentPhase || currentPhase === "idle" || currentPhase === "reading")
      ? `Reading post ${focus + 1} of ${posts.length}…`
      : undefined;
  const lines = jevLines(tally, breakdown);
  const findings = tally.judged > 0 ? findingsOf(tally, breakdown) : null;

  return (
    <div className="stage min-h-full pb-28 text-[#1c1915]">
      {scan && (
      <header className="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
          <div className="mb-4">
            <p className="text-[11px] tracking-[0.22em] text-[#6f685e] uppercase">linkedin.com/in/{scan.profile.slug}</p>
            <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">{scan.profile.name}</h1>
          </div>
          <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-3 sm:flex-row">
            <ProfileField inputRef={profileInput} url={url} onChange={setUrl} placeholder="linkedin.com/in/your-name" />
            <button
              type="submit"
              disabled={loading || url.trim().length === 0}
              className="h-12 cursor-pointer rounded-full bg-[#1c1915] px-6 text-sm text-[#f6f1e6] disabled:cursor-default disabled:opacity-50"
            >
              {loading ? "Pulling posts…" : "Read another"}
            </button>
          </form>
      </header>
      )}

      {!scan && (
        <ResultPreview
          url={url}
          onChange={setUrl}
          inputRef={profileInput}
          loading={loading}
          mineHint={mineHint}
          onSubmit={onSubmit}
          onMine={openMine}
        />
      )}

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
      {error && (
        <p className="mx-auto mt-4 max-w-6xl px-4 text-sm text-[#8d2a16] sm:px-6" role="alert">
          {error}
        </p>
      )}

      {scan && (
        <main className="mx-auto mt-6 max-w-6xl px-4 pb-28 sm:px-6">
          <div ref={topBlock} className="grid items-start gap-6 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
              <ScorePanel
                label={done ? `All ${posts.length}` : `Post ${focus + 1} of ${posts.length}`}
                tally={tally}
                pending={done ? 0 : pending}
              />
              <JevChat side typing={typing} lines={lines} findings={findings} total={tally.total} />
            </div>
            <div>
              <p className="mb-3 text-[11px] tracking-[0.22em] text-[#6f685e] uppercase">The posts</p>
              <section className="space-y-3">
            {posts.slice(0, focus).map((post) => (
              <PostCard
                key={post.id}
                post={post}
                name={scan.profile.name}
                card={cards[post.id] ?? { phase: "idle" }}
                mode="settled"
                onRetry={() => {
                  phases.current[post.id] = "idle";
                  request(post.id, post.text, false, scanId.current);
                }}
              />
            ))}

            {current && (
              <PostCard
                key={current.id}
                post={current}
                name={scan.profile.name}
                card={cards[current.id] ?? { phase: "idle" }}
                mode="focus"
                index={focus}
                total={posts.length}
                nodeRef={focusNode}
                onRetry={() => {
                  phases.current[current.id] = "idle";
                  setCards((existing) => ({ ...existing, [current.id]: { phase: "idle" } }));
                }}
              />
            )}

            {ahead.map((post) => (
              <PostCard key={post.id} post={post} name={scan.profile.name} card={{ phase: "idle" }} mode="ahead" />
            ))}

            {!done && posts.length - focus - 1 > ahead.length && (
              <p className="text-center text-xs tracking-[0.14em] text-[#8a8175] uppercase">
                {posts.length - focus - 1 - ahead.length} still out of focus
              </p>
            )}
              </section>
              <div className="mt-8">
                <RoastSubscribe />
              </div>
            </div>
          </div>
          {mini && (
            <div className="lg:hidden">
              <MiniScore tally={tally} latest={lines[0] ?? messages[messages.length - 1]?.text} />
            </div>
          )}
        </main>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-black/8 bg-[#eceae4]/90 py-1.5 pr-4 pl-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-md">
          <img
            src={PROFILE_PHOTO}
            alt=""
            width={34}
            height={34}
            className="size-[34px] shrink-0 rounded-full object-cover bg-[#ddd8cf]"
          />
          <span className="flex items-center gap-2 text-sm text-[#111110]">
            <a
              href={LINKEDIN_PROFILE}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              LinkedIn
            </a>
            <span aria-hidden="true" className="text-black/30">
              |
            </span>
            <a
              href={SUBSTACK_PROFILE}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Substack
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}

function ScorePanel({
  label,
  tally,
  pending,
  roast,
  fill,
}: {
  label: string;
  tally: Tally & { total: number };
  pending: number;
  roast?: string;
  fill?: boolean;
}) {
  return (
    <section className={`${fill ? "h-full" : "shrink-0"} rounded-[28px] bg-[#fffdf8]/90 p-5 shadow-[0_24px_60px_rgba(28,25,21,0.08)] ring-1 ring-[#e7dfd2] backdrop-blur-md`}>
      <p className="text-[11px] tracking-[0.22em] text-[#6f685e] uppercase">{label}</p>
      <SlopDial
        score={tally.score}
        band={tally.band}
        judged={tally.judged}
        total={tally.total}
        pending={pending}
        read={tally.read}
        skim={tally.skim}
        pass={tally.pass}
      />
      {tally.skipped > 0 ? (
        <p className="mt-3 text-center text-xs text-[#6f685e]">{tally.skipped} reposts left out</p>
      ) : null}
      {roast ? <p className="font-heading mt-4 text-center text-lg leading-7 italic">{roast}</p> : null}
      <p className="mt-3 text-center text-xs leading-5 text-[#6f685e]">Read counts whole, skim counts half. {MODEL_ID}.</p>
    </section>
  );
}

function ProfileField({
  inputRef,
  url,
  onChange,
  placeholder,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  url: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <label className="sr-only" htmlFor="profile-url">
        LinkedIn profile URL
      </label>
      <input
        ref={inputRef}
        id="profile-url"
        value={url}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-12 min-w-0 flex-1 rounded-full border border-[#e7dfd2] bg-[#fffdf8] px-5 text-sm outline-none ring-[#1c1915]/15 focus:ring-3"
      />
    </>
  );
}

function ResultPreview({
  url,
  onChange,
  inputRef,
  loading,
  mineHint,
  onSubmit,
  onMine,
}: {
  url: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  mineHint: boolean;
  onSubmit: (event: FormEvent) => void;
  onMine: () => void;
}) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-12 pb-16 sm:px-6">
      <h1 className="font-heading max-w-2xl text-5xl tracking-tight sm:text-6xl">How cooked is my LinkedIn?</h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#5c564c]">
        We read your first 20 public posts, one at a time, and rate each one with Jev AI.
      </p>
      <form onSubmit={onSubmit} className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center">
          <ProfileField
            inputRef={inputRef}
            url={url}
            onChange={onChange}
            placeholder="Your name, or linkedin.com/in/your-name"
          />
          <button
            type="submit"
            disabled={loading || url.trim().length === 0}
            className="h-12 shrink-0 cursor-pointer rounded-full bg-[#1c1915] px-6 text-sm text-[#f6f1e6] disabled:cursor-default disabled:opacity-50"
          >
            {loading ? "Pulling posts…" : "Run it"}
          </button>
      </form>
      <p className="mt-3 text-sm leading-6 text-[#5c564c]">
        Don&apos;t know the link?{" "}
        <button type="button" onClick={onMine} className="cursor-pointer text-[#1c1915] underline underline-offset-4">
          Open the page where LinkedIn shows it
        </button>
        . Copy the link from the address bar. Or just type your name.
      </p>
      {mineHint && (
        <p className="mt-1 text-sm leading-6 text-[#1f6b45]">
          LinkedIn opened your profile. Copy the linkedin.com/in link from the address bar and paste it here.
        </p>
      )}

      <div className={`mt-14 transition-opacity duration-500 ${loading ? "opacity-40" : "opacity-100"}`} aria-label="Preview">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <ScorePanel label="Preview" tally={PREVIEW_TALLY} pending={0} />
            <JevChat side empty="Jev's summary of the profile will show up here." lines={[]} findings={null} total={0} />
          </div>
          <div>
            <p className="mb-3 text-[11px] tracking-[0.22em] text-[#6f685e] uppercase">The posts</p>
            <p className="mb-4 text-sm leading-6 text-[#5c564c]">Your post performance will show up here.</p>
            <div className="space-y-3">
              {SAMPLE_POSTS.map((post, index) => (
                <div
                  key={post.id}
                  aria-hidden={index > 0 ? true : undefined}
                  className={
                    index === 0
                      ? undefined
                      : index === 1
                        ? "pointer-events-none opacity-45 select-none"
                        : "pointer-events-none max-h-36 overflow-hidden opacity-20 select-none"
                  }
                >
                  <LinkedInPost post={post} name="Your name" compact />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const PREVIEW_TALLY: Tally & { total: number } = {
  read: 14,
  skim: 4,
  pass: 2,
  judged: 20,
  skipped: 0,
  score: 80,
  band: bandFor(80),
  roast: "",
  total: 20,
};

const SAMPLE_POSTS: PublicPost[] = [
  {
    id: "sample-1",
    text: "We lost our biggest customer on a Tuesday. The postmortem was one page. The lesson was shorter: we had no second buyer.",
    repost: false,
    time: "2d",
    headline: "Founder",
    avatar: null,
    reactions: 128,
    comments: 24,
    reposts: 3,
    media: null,
    quoted: null,
  },
  {
    id: "sample-2",
    text: "Investors used to hate usage-based pricing. Now they are the ones asking for it in the board meeting.",
    repost: false,
    time: "4d",
    headline: "Founder",
    avatar: null,
    reactions: 86,
    comments: 11,
    reposts: 2,
    media: null,
    quoted: null,
  },
  {
    id: "sample-3",
    text: "Last year the launch post went viral for the wrong reason. The product page is what actually moved.",
    repost: false,
    time: "1w",
    headline: "Founder",
    avatar: null,
    reactions: 54,
    comments: 7,
    reposts: 1,
    media: null,
    quoted: null,
  },
];

function MiniScore({ tally, latest }: { tally: Tally & { total: number }; latest?: string }) {
  const shown = tally.score === null ? null : Math.round(tally.score);
  const tone = tally.band ? COLORS[tally.band.id] : "#8a8175";
  return (
    <div className="fixed inset-x-0 top-0 z-30 border-b border-[#e7dfd2] bg-[#f3eee4]/92 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <SlopDial
          score={tally.score}
          band={tally.band}
          judged={tally.judged}
          total={tally.total}
          pending={0}
          read={tally.read}
          skim={tally.skim}
          pass={tally.pass}
          mini
        />
        <p className="font-heading text-3xl leading-none tabular-nums" style={{ color: tone }}>
          {shown === null ? "—" : shown}
        </p>
        <div className="min-w-0">
          <p className="font-heading text-base leading-5 italic">{tally.band ? tally.band.label : "Waiting on the first post"}</p>
          <p className="text-xs text-[#6f685e]">
            {tally.read} read · {tally.skim} skim · {tally.pass} skip
          </p>
        </div>
        {latest && (
          <p className="ml-auto hidden max-w-md truncate rounded-full bg-[#fffdf8] px-4 py-1.5 text-sm text-[#1c1915] ring-1 ring-[#e7dfd2] md:block">
            <span className="font-heading text-[#c4922a]">Jev:</span> {latest}
          </p>
        )}
      </div>
    </div>
  );
}

function snippet(text: string, max = 44): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max).trimEnd()}…` : line;
}

function messageFor(post: PublicPost, card: CardState | undefined, index: number): ChatMessage | null {
  const lead = post.text.trim() ? `Post ${index + 1}, “${snippet(post.text)}”` : `Post ${index + 1}`;
  if (post.repost || card?.phase === "repost") {
    return { id: post.id, bucket: "repost", text: `${lead}: someone else is talking. Not scored.` };
  }
  if (!card) return null;
  if (card.phase === "thin") return { id: post.id, bucket: "thin", text: `${lead}: ${THIN_REASON}` };
  if (card.phase === "error") return { id: post.id, bucket: "error", text: `${lead}: ${card.message || "Couldn't read this."}` };
  if (card.phase === "ready" && card.features) {
    const bucket = bucketOf(card.features);
    return { id: post.id, bucket, text: `${lead}: ${postReason(card.features, bucket)}`, tags: flagsOf(card.features) };
  }
  return null;
}

function contribution(post: PublicPost, card: CardState | undefined): Contribution | null {
  if (post.repost || card?.phase === "repost") return { kind: "skip", reason: "repost" };
  if (card?.phase === "thin") return { kind: "thin" };
  if (card?.phase === "ready" && card.features) {
    return { kind: "judged", bucket: bucketOf(card.features), features: card.features };
  }
  return null;
}

function noteFor(post: PublicPost, card: CardState): string | null {
  if (card.phase === "thin") return THIN_REASON;
  if (card.phase === "repost" || post.repost) return "Skipped. Someone else is talking.";
  if (card.phase === "error") return card.message || "Couldn't read this.";
  if (card.phase === "ready" && card.features) return postReason(card.features, bucketOf(card.features));
  return null;
}

function PostCard({
  post,
  name,
  card,
  mode,
  index,
  total,
  nodeRef,
  onRetry,
}: {
  post: PublicPost;
  name: string;
  card: CardState;
  mode: "settled" | "focus" | "ahead";
  index?: number;
  total?: number;
  nodeRef?: { current: HTMLElement | null };
  onRetry?: () => void;
}) {
  const reading: ReadyReading | undefined =
    card.phase === "ready" && card.features && card.model && card.latencyMs !== undefined
      ? { features: card.features, model: card.model, latencyMs: card.latencyMs }
      : undefined;
  const note = mode === "focus" ? noteFor(post, card) : null;

  return (
    <article
      ref={mode === "focus" ? nodeRef : undefined}
      aria-hidden={mode === "ahead" ? true : undefined}
      className={
        mode === "focus"
          ? "scroll-mt-24 rounded-[28px] bg-[#fffdf8] px-5 py-5 shadow-[0_24px_60px_rgba(28,25,21,0.1)] ring-1 ring-[#1c1915]/15"
          : mode === "ahead"
            ? "pointer-events-none max-h-64 overflow-hidden rounded-[28px] bg-[#fffdf8]/70 px-5 py-4 opacity-70 blur-[5px] ring-1 ring-[#e7dfd2] select-none"
            : "rounded-[28px] bg-[#fffdf8]/80 px-4 py-3 ring-1 ring-[#e7dfd2]"
      }
    >
      {mode !== "ahead" && (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs tracking-[0.14em] text-[#6f685e] uppercase">
            {mode === "focus" && index !== undefined && total !== undefined ? `Post ${index + 1} of ${total}` : ""}
          </p>
          <WorthBar phase={card.phase} message={card.message} reading={reading} />
        </div>
      )}
      {mode === "focus" && card.phase === "error" && onRetry && (
        <Button size="sm" variant="outline" className="mb-3" onClick={onRetry}>
          Ask Jev again
        </Button>
      )}
      <LinkedInPost post={post} name={name} compact={mode !== "focus"} />
      {note && <p className="font-heading mt-4 text-xl leading-7 italic">{note}</p>}
    </article>
  );
}
