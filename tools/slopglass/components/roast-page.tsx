"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";

import { LinkedInPost } from "@/components/linkedin-post";
import { SlopDial } from "@/components/slop-dial";
import { Button } from "@/components/ui/button";
import { WorthBar, type ReadyReading } from "@/components/worth-bar";
import type { LinkedInProfile } from "@/lib/linkedin/url";
import type { PublicPost } from "@/lib/linkedin/posts";
import { MODEL_ID } from "@/lib/slop/rubric";
import type { ClassifyResponse } from "@/lib/slop/types";
import { THIN_REASON, bandFor, bucketOf, postReason, tallyOf, type Contribution, type WorthFeatures } from "@/lib/slop/worth";

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
  const [otherProfile, setOtherProfile] = useState(false);
  const [mineHint, setMineHint] = useState(false);
  const profileInput = useRef<HTMLInputElement>(null);
  const phases = useRef<Record<string, Phase>>({});
  const scanId = useRef(0);
  const focusNode = useRef<HTMLElement | null>(null);

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
    if (!scan || !current) return;
    if (!currentPhase || currentPhase === "idle") {
      request(current.id, current.text, current.repost, scanId.current);
      return;
    }
    if (currentPhase === "reading") return;
    if (focus >= posts.length - 1) return;
    const dwell = currentPhase === "ready" ? 1400 : currentPhase === "error" ? 4000 : 800;
    const timer = window.setTimeout(() => setFocus((index) => index + 1), dwell);
    return () => window.clearTimeout(timer);
  }, [current, currentPhase, focus, posts.length, request, scan]);

  useEffect(() => {
    focusNode.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus, scan]);

  function openMine() {
    if (url.trim()) {
      profileInput.current?.form?.requestSubmit();
      return;
    }
    window.open("https://www.linkedin.com/in/me/", "_blank", "noopener,noreferrer");
    setOtherProfile(true);
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
    let pending = 0;
    for (const post of posts) {
      const card = cards[post.id];
      const item = contribution(post, card);
      if (item) items.push(item);
      else pending += 1;
    }
    return { ...tallyOf(items), pending, total: posts.length };
  }, [cards, posts]);

  const ahead = posts.slice(focus + 1, focus + 3);
  const done = focus >= posts.length - 1 && currentPhase !== undefined && SETTLED.includes(currentPhase);

  return (
    <div className="stage min-h-full pb-28 text-[#1c1915]">
      <header className={`mx-auto max-w-6xl px-4 sm:px-6 ${scan ? "pt-5" : "pt-10"}`}>
        {scan ? (
          <div className="mb-4">
            <p className="text-[11px] tracking-[0.22em] text-[#6f685e] uppercase">linkedin.com/in/{scan.profile.slug}</p>
            <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">{scan.profile.name}</h1>
          </div>
        ) : (
          <>
            <p className="text-[11px] tracking-[0.22em] text-[#6f685e] uppercase">LinkedIn</p>
            <h1 className="font-heading max-w-3xl text-5xl tracking-tight sm:text-6xl">How cooked is my LinkedIn?</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#5c564c]">
              The first 20 public posts, read one at a time. Nothing to install, and no LinkedIn login on this site.
            </p>
          </>
        )}

        {scan ? (
          <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-3 sm:flex-row">
            <ProfileField inputRef={profileInput} url={url} onChange={setUrl} placeholder="linkedin.com/in/your-name" />
            <button
              type="submit"
              disabled={loading || url.trim().length === 0}
              className="h-12 rounded-full bg-[#1c1915] px-6 text-sm text-[#f6f1e6] disabled:opacity-50"
            >
              {loading ? "Pulling posts…" : "Read another"}
            </button>
          </form>
        ) : otherProfile || mineHint ? (
          <form onSubmit={onSubmit} className="mt-6 max-w-xl">
            <div className="flex flex-col gap-3 sm:flex-row">
              <ProfileField
                inputRef={profileInput}
                url={url}
                onChange={setUrl}
                placeholder={mineHint ? "Paste the profile LinkedIn just opened" : "linkedin.com/in/their-name"}
              />
              <button
                type="submit"
                disabled={loading || url.trim().length === 0}
                className="h-12 rounded-full bg-[#1c1915] px-6 text-sm text-[#f6f1e6] disabled:opacity-50"
              >
                {loading ? "Pulling posts…" : "Run it"}
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#6f685e]">
              {mineHint
                ? "LinkedIn opened your profile. Paste that address."
                : "A public linkedin.com/in/… link. Reposts stay out of the score."}{" "}
              <button
                type="button"
                onClick={mineHint ? () => { setMineHint(false); setOtherProfile(true); } : openMine}
                className="underline underline-offset-2"
              >
                {mineHint ? "A different profile" : "Run it for me instead"}
              </button>
            </p>
          </form>
        ) : (
          <div className="mt-6 flex flex-col items-start gap-3">
            <button
              type="button"
              onClick={openMine}
              className="h-12 rounded-full bg-[#1c1915] px-6 text-sm text-[#f6f1e6]"
            >
              Run it for me
            </button>
            <button
              type="button"
              onClick={() => {
                setOtherProfile(true);
                setMineHint(false);
                window.setTimeout(() => profileInput.current?.focus(), 0);
              }}
              className="text-sm text-[#6f685e] underline underline-offset-2"
            >
              A different profile
            </button>
          </div>
        )}
      </header>

      {!scan && <ResultPreview />}

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
        <main className="mx-auto mt-8 grid max-w-6xl gap-8 px-4 pb-28 sm:px-6 md:grid-cols-[minmax(0,680px)_300px]">
          <section className="order-2 space-y-3 md:order-1">
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

          <aside className="order-1 md:sticky md:top-4 md:order-2 md:self-start">
            <section className="rounded-[28px] bg-[#fffdf8]/90 p-5 shadow-[0_24px_60px_rgba(28,25,21,0.08)] ring-1 ring-[#e7dfd2] backdrop-blur-md">
              <p className="text-[11px] tracking-[0.22em] text-[#6f685e] uppercase">
                {done ? `All ${posts.length}` : `Post ${focus + 1} of ${posts.length}`}
              </p>
              <SlopDial
                score={tally.score}
                band={tally.band}
                judged={tally.judged}
                total={tally.total}
                pending={currentPhase === "reading" ? 1 : 0}
                read={tally.read}
                skim={tally.skim}
                pass={tally.pass}
              />
              {tally.skipped > 0 ? (
                <p className="mt-3 text-center text-xs text-[#6f685e]">{tally.skipped} reposts left out</p>
              ) : null}
              <p className="font-heading mt-4 text-center text-lg leading-7 italic">{tally.roast}</p>
              <p className="mt-3 text-center text-xs leading-5 text-[#6f685e]">
                Pass counts whole, skim counts half. {MODEL_ID}.
              </p>
            </section>
          </aside>
        </main>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-black/8 bg-[#eceae4]/90 py-1.5 pr-4 pl-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-md">
          <img src="/yannnis-substack.jpg" alt="" width={34} height={34} className="size-[34px] shrink-0 rounded-full object-cover" />
          <span className="flex items-center gap-2 text-sm text-[#111110]">
            <a
              href="https://www.linkedin.com/in/yannis-psarras-7542104"
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
              href="https://yannnis.substack.com/"
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

const PREVIEW_POSTS: PublicPost[] = [
  {
    id: "preview-1",
    text: "A public post lands here. A short note sits under it, then the next post comes into focus.",
    repost: false,
    time: "2d",
    headline: "What you do",
    avatar: null,
    reactions: 18,
    comments: 3,
    reposts: 1,
    media: null,
    quoted: null,
  },
  {
    id: "preview-2",
    text: "The one after it stays soft until the first note is done.",
    repost: false,
    time: "5d",
    headline: "What you do",
    avatar: null,
    reactions: 4,
    comments: 0,
    reposts: 0,
    media: null,
    quoted: null,
  },
];

function ResultPreview() {
  const band = bandFor(64);
  return (
    <section className="mx-auto mt-10 max-w-6xl px-4 pb-8 sm:px-6" aria-label="Preview of a finished read">
      <p className="mb-3 inline-flex rounded-full border border-[#e7dfd2] bg-[#fffdf8] px-3 py-1 text-[11px] tracking-[0.16em] text-[#6f685e] uppercase">
        Preview
      </p>
      <div className="pointer-events-none grid gap-8 blur-[3px] select-none md:grid-cols-[minmax(0,680px)_300px]" aria-hidden="true">
        <div className="space-y-3">
          <LinkedInPost post={PREVIEW_POSTS[0]} name="Your name" />
          <div className="opacity-50">
            <LinkedInPost post={PREVIEW_POSTS[1]} name="Your name" compact />
          </div>
        </div>
        <aside className="h-fit rounded-[28px] bg-[#fffdf8]/90 p-5 ring-1 ring-[#e7dfd2]">
          <p className="text-[11px] tracking-[0.22em] text-[#6f685e] uppercase">Post 2 of 20</p>
          <SlopDial score={64} band={band} judged={2} total={20} pending={1} read={1} skim={1} pass={0} />
          <p className="font-heading mt-4 text-center text-lg leading-7 italic">The score moves as each post lands.</p>
        </aside>
      </div>
    </section>
  );
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
