"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from "react";

import { JevSummary, LeadScore } from "./score";
import { jevLines } from "../lib/score";
import { FLAIR, type RedditLabel } from "../lib/qualify";
import type { RedditPost } from "../lib/parse";
import { normalizeSubreddit } from "../lib/parse";

type Filter = "all" | RedditLabel;
type Step = "product" | "heard" | "subs" | "feed";

type Row = RedditPost & {
  phase: "queued" | "judging" | "done" | "error";
  label?: RedditLabel;
  reason?: string;
  error?: string;
};

async function ask(productBrief: string, post: RedditPost, generation: { current: number }, gen: number) {
  const body = JSON.stringify({ brief: productBrief, title: post.title, text: post.text });
  let lastError = "Couldn't reach Jev.";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (generation.current !== gen) return null;
    try {
      const response = await fetch("/api/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        label?: RedditLabel;
        reason?: string;
        error?: string;
      };
      if (response.ok && payload.ok && payload.label && payload.reason) return payload;
      lastError = payload.error || (response.status === 429 ? "Jev is busy. The post will be asked again." : "Couldn't reach Jev.");
      if (response.status !== 429 && response.status < 500) return { ok: false, error: lastError };
    } catch {
      lastError = "Couldn't reach Jev.";
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return { ok: false, error: lastError };
}

const FILTERS: Array<{ id: Filter; name: string }> = [
  { id: "all", name: "All" },
  { id: "lead", name: "Lead" },
  { id: "switching", name: "Switching" },
  { id: "competitor", name: "Competitor" },
  { id: "proof", name: "Proof" },
  { id: "pain", name: "Pain" },
  { id: "language", name: "Language" },
  { id: "noise", name: "Noise" },
];

export function RedditFeed() {
  const [step, setStep] = useState<Step>("product");
  const [productMode, setProductMode] = useState<"site" | "words">("site");
  const [subInput, setSubInput] = useState("");
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState("");
  const [url, setUrl] = useState("");
  const [brief, setBrief] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [briefError, setBriefError] = useState("");
  const [readingSite, setReadingSite] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [feedError, setFeedError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [health, setHealth] = useState<"unknown" | "ready" | "nokey" | "down">("unknown");
  const loadGeneration = useRef(0);
  const qualifyGeneration = useRef(0);
  const siteRead = useRef(0);
  const suggestGeneration = useRef(0);
  const described = useRef("");
  const describedSub = useRef("");
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const focusable = useCallback((node: HTMLInputElement | HTMLTextAreaElement | null) => {
    fieldRef.current = node;
  }, []);
  const rowsRef = useRef(rows);
  const briefRef = useRef(brief);
  const focusNode = useRef<HTMLElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const following = useRef(false);
  rowsRef.current = rows;
  briefRef.current = brief;

  useEffect(() => {
    fieldRef.current?.focus();
  }, [step, productMode]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((response) => response.json())
      .then((body: { key?: boolean }) => {
        if (!cancelled) setHealth(body.key ? "ready" : "nokey");
      })
      .catch(() => {
        if (!cancelled) setHealth("down");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function visible(list: Row[]): Row[] {
    if (filter === "all") return list;
    return list.filter((row) => row.label === filter);
  }

  function count(id: Filter): number {
    if (id === "all") return rows.length;
    return rows.filter((row) => row.label === id).length;
  }

  async function readSite(event: FormEvent) {
    event.preventDefault();
    setBriefError("");
    setReadingSite(true);
    const requestId = ++siteRead.current;
    const snapshot = briefRef.current;
    try {
      const response = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        brief?: string;
        title?: string;
        subreddit?: string | null;
        error?: string;
      };
      if (requestId !== siteRead.current) return;
      if (!response.ok || !payload.ok || !payload.brief) {
        setBriefError(payload.error || "Couldn't read that page.");
        return;
      }
      setPageTitle(payload.title || "");
      if (briefRef.current !== snapshot && snapshot.trim().length > 0) return;
      setBrief(payload.brief);
      briefRef.current = payload.brief;
      described.current = payload.brief;
      describedSub.current = payload.subreddit || "";
      setStep("heard");
    } catch {
      if (requestId === siteRead.current) setBriefError("Couldn't read that page.");
    } finally {
      if (requestId === siteRead.current) setReadingSite(false);
    }
  }

  function onBriefChange(value: string) {
    setBrief(value);
    briefRef.current = value;
    setBriefError("");
  }

  function acceptProduct(event: FormEvent) {
    event.preventDefault();
    if (brief.trim().length < 40) {
      setBriefError("Say a little more. A title, who it's for, and the problem are enough.");
      return;
    }
    setBriefError("");
    if (rowsRef.current.length > 0) requalify(brief);
    setStep("subs");
    if (brief === described.current && describedSub.current) {
      setSuggestion(describedSub.current);
      setFeedError("");
      return;
    }
    void loadSuggestion(brief);
  }

  async function loadSuggestion(text: string) {
    const requestId = ++suggestGeneration.current;
    setSuggestion("");
    setFeedError("");
    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: text }),
      });
      const payload = (await response.json()) as { ok?: boolean; subreddit?: string; error?: string };
      if (requestId !== suggestGeneration.current) return;
      if (response.ok && payload.ok && payload.subreddit) {
        setSuggestion(payload.subreddit);
        return;
      }
      setFeedError(payload.error || "Couldn't suggest a subreddit.");
    } catch {
      if (requestId === suggestGeneration.current) setFeedError("Couldn't suggest a subreddit.");
    }
  }

  function requalify(nextBrief: string) {
    const gen = ++qualifyGeneration.current;
    setRows((current) => current.map((row) => ({ ...row, phase: "queued", label: undefined, reason: undefined, error: undefined })));
    const pending = rowsRef.current.map((row) => ({ ...row, phase: "queued" as const, label: undefined, reason: undefined, error: undefined }));
    void qualify(pending, nextBrief, gen);
  }

  function addSubredditName(name: string) {
    setFeedError("");
    setSubreddits((current) => includeSubreddit(name, current));
  }

  function includeSubreddit(name: string, list: string[]): string[] {
    if (list.some((item) => item.toLowerCase() === name.toLowerCase())) return list;
    return [...list, name];
  }

  function addSubreddit(event: FormEvent) {
    event.preventDefault();
    const name = normalizeSubreddit(subInput);
    if (!name) {
      if (subInput.trim()) setFeedError("That isn't a subreddit name.");
      return;
    }
    setFeedError("");
    setSubreddits((current) => includeSubreddit(name, current));
    setSubInput("");
  }

  function runNow() {
    const typed = subInput.trim();
    let next = subreddits;
    if (typed) {
      const name = normalizeSubreddit(typed);
      if (!name) {
        setFeedError("That isn't a subreddit name.");
        return;
      }
      next = includeSubreddit(name, next);
      setSubreddits(next);
      setSubInput("");
    }
    if (next.length === 0) return;
    setFeedError("");
    void runFeed(next);
  }

  function removeSubreddit(name: string) {
    setSubreddits((current) => current.filter((item) => item !== name));
  }

  async function runFeed(names: string[]) {
    if (names.length === 0 || briefRef.current.trim().length < 40) return;
    setStep("feed");
    following.current = false;
    document.title = pageTitle || names.map((name) => `r/${name}`).join(", ");
    const gen = ++loadGeneration.current;
    qualifyGeneration.current += 1;
    setLoading(true);
    setRows([]);
    rowsRef.current = [];
    setFeedError("");
    const incoming: Row[] = [];
    const problems: string[] = [];
    for (const name of names) {
      try {
        const response = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subreddit: name }),
        });
        const payload = (await response.json()) as { ok?: boolean; posts?: RedditPost[]; error?: string };
        if (gen !== loadGeneration.current) return;
        if (!response.ok || !payload.ok || !payload.posts) {
          problems.push(payload.error || `Couldn't load r/${name}.`);
          continue;
        }
        for (const post of payload.posts) {
          if (!incoming.some((row) => row.id === post.id)) incoming.push({ ...post, phase: "queued" });
        }
      } catch {
        if (gen !== loadGeneration.current) return;
        problems.push(`Couldn't load r/${name}.`);
      }
    }
    if (gen !== loadGeneration.current) return;
    setRows(incoming);
    rowsRef.current = incoming;
    setFeedError(problems.join(" "));
    setLoading(false);
    void qualify(incoming, briefRef.current, qualifyGeneration.current);
  }

  async function loadEarlier() {
    const gen = loadGeneration.current;
    setLoadingMore(true);
    setFeedError("");
    const added: Row[] = [];
    const problems: string[] = [];
    for (const name of subreddits) {
      const mine = rowsRef.current.filter((row) => row.subreddit.toLowerCase() === name.toLowerCase());
      const cursor = mine.reduce((min, row) => Math.min(min, row.createdUtc), Number.POSITIVE_INFINITY);
      if (!Number.isFinite(cursor)) continue;
      try {
        const response = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subreddit: name, before: cursor }),
        });
        const payload = (await response.json()) as { ok?: boolean; posts?: RedditPost[]; error?: string };
        if (gen !== loadGeneration.current) return;
        if (!response.ok || !payload.ok || !payload.posts) {
          problems.push(payload.error || `Couldn't load earlier posts from r/${name}.`);
          continue;
        }
        for (const post of payload.posts) {
          if (rowsRef.current.some((row) => row.id === post.id) || added.some((row) => row.id === post.id)) continue;
          added.push({ ...post, phase: "queued" });
        }
      } catch {
        if (gen !== loadGeneration.current) return;
        problems.push(`Couldn't load earlier posts from r/${name}.`);
      }
    }
    if (gen !== loadGeneration.current) return;
    const next = [...rowsRef.current, ...added];
    setRows(next);
    rowsRef.current = next;
    setFeedError(problems.join(" "));
    setLoadingMore(false);
    void qualify(added, briefRef.current, qualifyGeneration.current);
  }

  async function qualify(pending: Row[], productBrief: string, gen: number) {
    if (productBrief.trim().length < 40 || pending.length === 0) return;
    let cursor = 0;
    const workers = Array.from({ length: 4 }, async () => {
      while (cursor < pending.length) {
        const index = cursor;
        cursor += 1;
        const post = pending[index];
        if (gen !== qualifyGeneration.current) return;
        mark(post.id, { phase: "judging" });
        const payload = await ask(productBrief, post, qualifyGeneration, gen);
        if (gen !== qualifyGeneration.current || !payload) return;
        if (!payload.ok || !payload.label || !payload.reason) {
          mark(post.id, { phase: "error", error: payload.error || "Couldn't reach Jev." });
          continue;
        }
        mark(post.id, { phase: "done", label: payload.label, reason: payload.reason });
      }
    });
    await Promise.all(workers);
  }

  function retry(row: Row) {
    const gen = qualifyGeneration.current;
    const next = { ...row, phase: "queued" as const, label: undefined, reason: undefined, error: undefined };
    mark(row.id, { phase: "queued", label: undefined, reason: undefined, error: undefined });
    void qualify([next], briefRef.current, gen);
  }

  function mark(id: string, patch: Partial<Row>) {
    setRows((current) => {
      const next = current.map((row) => (row.id === id ? { ...row, ...patch } : row));
      rowsRef.current = next;
      return next;
    });
  }

  const shown = visible(rows);
  const readingId =
    step === "feed" ? (shown.find((row) => row.phase === "judging" || row.phase === "queued")?.id ?? null) : null;
  const progress = step === "subs" ? 2 : step === "feed" ? 3 : 1;

  useEffect(() => {
    if (!readingId || !following.current) return;
    focusNode.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [readingId]);

  useEffect(() => {
    const node = resultsRef.current;
    if (step !== "feed" || !node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        following.current = entry.intersectionRatio < 0.35;
      },
      { threshold: [0, 0.35, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [step, shown.length]);
  const suggestionReady = suggestion !== "" && !subreddits.some((name) => name.toLowerCase() === suggestion.toLowerCase());

  if (step !== "feed") {
    return (
      <div className="stage">
        <div className="ask">
          <div className="progress" aria-hidden="true">
            {[1, 2, 3].map((mark) => (
              <i key={mark} data-on={mark <= progress ? "true" : "false"} />
            ))}
          </div>
          <div className="ask-step" key={`${step}-${productMode}`}>
            {step === "product" && productMode === "site" ? (
              <form onSubmit={readSite}>
                <p className="eyebrow">1 · The product</p>
                <h1>What&apos;s the product?</h1>
                <p className="lede">Paste the website. I&apos;ll read it and tell you what it is.</p>
                <div className="row">
                  <label className="sr" htmlFor="website">
                    Website
                  </label>
                  <input
                    ref={focusable}
                    id="website"
                    className="pill"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button className="btn" type="submit" disabled={readingSite || url.trim().length === 0}>
                    {readingSite ? "Reading…" : "OK"}
                  </button>
                </div>
                <button
                  className="back"
                  type="button"
                  onClick={() => {
                    setBriefError("");
                    described.current = "";
                    describedSub.current = "";
                    setProductMode("words");
                  }}
                >
                  I&apos;ll describe it instead
                </button>
              </form>
            ) : null}

            {step === "product" && productMode === "words" ? (
              <form onSubmit={acceptProduct}>
                <p className="eyebrow">1 · The product</p>
                <h1>Describe the product.</h1>
                <p className="lede">Title, who it&apos;s for, and the problem are enough.</p>
                <label className="field">
                  <span className="sr">Product</span>
                  <textarea
                    ref={focusable}
                    className="area"
                    value={brief}
                    onChange={(event) => onBriefChange(event.target.value)}
                    onKeyDown={submitOnEnter}
                    placeholder="A tool for founders who want to see the posts where buyers describe the job."
                  />
                </label>
                <div className="row">
                  <button className="btn" type="submit" disabled={brief.trim().length < 40}>
                    OK
                  </button>
                </div>
                <button
                  className="back"
                  type="button"
                  onClick={() => {
                    setBriefError("");
                    setProductMode("site");
                  }}
                >
                  Use a website instead
                </button>
              </form>
            ) : null}

            {step === "heard" ? (
              <form onSubmit={acceptProduct}>
                <p className="eyebrow">1 · The product</p>
                <h1>{pageTitle || "Here's what it does."}</h1>
                <p className="lede">Written from the site. Change it if the business is wrong. The same reading names one subreddit, and these words are what each post is matched against.</p>
                <label className="field">
                  <span className="sr">What the product is</span>
                  <textarea
                    ref={focusable}
                    className="area"
                    value={brief}
                    onChange={(event) => onBriefChange(event.target.value)}
                    onKeyDown={submitOnEnter}
                  />
                </label>
                <div className="row">
                  <button className="btn" type="submit" disabled={brief.trim().length < 40}>
                    That&apos;s it
                  </button>
                </div>
                <button className="back" type="button" onClick={() => setStep("product")}>
                  Use a different page
                </button>
              </form>
            ) : null}

            {step === "subs" ? (
              <form onSubmit={addSubreddit}>
                <p className="eyebrow">2 · Subreddits</p>
                <h1>Which subreddits should I read?</h1>
                <p className="lede">
                  Name the ones you want checked. I&apos;ll flair the posts that matter and leave the irrelevant ones out.
                </p>
                {suggestionReady ? (
                  <button className="suggest" type="button" onClick={() => addSubredditName(suggestion)}>
                    r/{suggestion}
                  </button>
                ) : null}
                <div className="row">
                  <label className="sr" htmlFor="subreddit">
                    Subreddit
                  </label>
                  <input
                    ref={focusable}
                    id="subreddit"
                    className="pill"
                    placeholder="r/subreddit"
                    value={subInput}
                    onChange={(event) => setSubInput(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button className="btn" type="submit" disabled={subInput.trim().length === 0}>
                    Add
                  </button>
                  <button className="btn" type="button" disabled={subreddits.length === 0 && subInput.trim().length === 0} onClick={runNow}>
                    Run it
                  </button>
                </div>
                {subreddits.length > 0 ? (
                  <ul className="picks">
                    {subreddits.map((name) => (
                      <li key={name}>
                        <button type="button" onClick={() => removeSubreddit(name)}>
                          r/{name}
                          <span aria-hidden="true">×</span>
                          <span className="sr">Remove r/{name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button className="back" type="button" onClick={() => setStep(brief.trim() ? "heard" : "product")}>
                  Change the product
                </button>
              </form>
            ) : null}

            {health === "nokey" ? (
              <p className="alert">The server has no TYPESAFE_API_KEY, so Jev can&apos;t be asked. Add it to .env and restart.</p>
            ) : null}
            {health === "down" ? <p className="alert">The classifier didn&apos;t answer. Reload once the server is up.</p> : null}
            {briefError ? <p className="alert">{briefError}</p> : null}
            {feedError ? <p className="alert">{feedError}</p> : null}
          </div>
        </div>
        <SitePill />
      </div>
    );
  }

  return (
    <div className="stage">
      <header className="wrap hero">
        <p className="eyebrow">{subreddits.map((name) => `r/${name}`).join("  ·  ")}</p>
        <h1>{pageTitle || "The posts"}</h1>
        <p className="lede">Jev reads the latest posts and scores how many of them are leads.</p>
        <ul className="segment">
          {FILTERS.map((item) => (
            <li key={item.id}>
              <button type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                {item.name} {count(item.id)}
              </button>
            </li>
          ))}
        </ul>
        <button className="back" type="button" onClick={() => setStep("subs")}>
          Change subreddits
        </button>
        {feedError ? <p className="alert">{feedError}</p> : null}
      </header>
      <main ref={resultsRef} className="wrap results">
        <aside className="results-side">
          <LeadScore
            leads={rows.filter((row) => row.label === "lead").length}
            relevant={rows.filter((row) => row.phase === "done" && row.label && row.label !== "lead" && row.label !== "noise").length}
            noise={rows.filter((row) => row.label === "noise").length}
            judged={rows.filter((row) => row.phase === "done").length}
            total={rows.length}
            pending={rows.filter((row) => row.phase === "queued" || row.phase === "judging").length}
          />
          <JevSummary
            lines={jevLines(
              rows.filter((row) => row.label === "lead").length,
              rows.filter((row) => row.phase === "done").length,
              rows.filter((row) => row.phase === "queued" || row.phase === "judging").length,
            )}
            pills={
              rows.some((row) => row.phase === "done")
                ? [
                    { label: `${rows.filter((row) => row.label === "lead").length} lead`, tone: "good" as const },
                    {
                      label: `${rows.filter((row) => row.phase === "done" && row.label && row.label !== "lead" && row.label !== "noise").length} relevant`,
                      tone: "mid" as const,
                    },
                    { label: `${rows.filter((row) => row.label === "noise").length} noise`, tone: "bad" as const },
                  ]
                : []
            }
            reading={
              rows.some((row) => row.phase === "queued" || row.phase === "judging")
                ? `Reading ${rows.filter((row) => row.phase === "done").length + 1} of ${rows.length}…`
                : undefined
            }
          />
        </aside>
        <section>
          <p className="eyebrow">The posts</p>
          <div className="stack">
            {loading ? (
              <>
                <div className="skel" />
                <div className="skel" />
                <div className="skel" />
              </>
            ) : null}
            {!loading && shown.length === 0 && !feedError ? (
              <div className="empty">
                <strong>There&apos;s nothing with this flair yet</strong>
                Posts show up as Jev reads them. All keeps every post, noise included.
              </div>
            ) : null}
            {shown.map((row) => (
              <PostCard
                key={row.id}
                row={row}
                matching={brief.trim().length >= 40}
                onRetry={() => retry(row)}
                nodeRef={row.id === readingId ? focusNode : undefined}
              />
            ))}
          </div>
          {!loading && rows.length > 0 ? (
            <div className="more">
              <button className="btn" type="button" disabled={loadingMore} onClick={() => void loadEarlier()}>
                {loadingMore ? "Pulling posts…" : "Earlier posts"}
              </button>
            </div>
          ) : null}
        </section>
      </main>
      <SitePill />
    </div>
  );
}

function SitePill() {
  return (
    <div className="site-pill">
      <div className="site-pill-inner">
        <img src="/yannnis-substack.jpg" alt="" width={34} height={34} />
        <span>
          <a href="https://www.linkedin.com/in/yannis-psarras" target="_blank" rel="noopener noreferrer">
            LinkedIn
          </a>
          <span aria-hidden="true">|</span>
          <a href="https://yannnis.substack.com/" target="_blank" rel="noopener noreferrer">
            Substack
          </a>
        </span>
      </div>
    </div>
  );
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }
}

function PostCard({
  row,
  matching,
  onRetry,
  nodeRef,
}: {
  row: Row;
  matching: boolean;
  onRetry: () => void;
  nodeRef?: Ref<HTMLElement>;
}) {
  const waiting = matching && (row.phase === "queued" || row.phase === "judging");
  const flair = row.phase === "done" && row.label ? FLAIR[row.label] : row.phase === "error" ? "Missed" : waiting ? "Reading" : "";
  const label = row.phase === "done" && row.label ? row.label : row.phase === "error" ? "error" : "reading";
  const why = row.phase === "done" ? row.reason : row.phase === "error" ? row.error : waiting ? "Jev is reading this post." : "";
  const live = waiting || row.phase === "error";
  return (
    <article ref={nodeRef} className="card" data-mode={live ? "focus" : "settled"}>
      <div className="card-top">
        <p className="meta">
          <strong>r/{row.subreddit}</strong>
          {" · "}
          u/{row.author || "unknown"}
          {" · "}
          {ago(row.createdUtc)}
        </p>
        {flair ? <FlairChip label={label} name={flair} detail={row.phase === "done" ? "" : why || ""} pulse={waiting} /> : null}
      </div>
      <h3 className="title">
        <a href={row.permalink} target="_blank" rel="noreferrer">
          {row.title}
        </a>
      </h3>
      {row.phase === "error" ? (
        <button className="btn-outline" type="button" onClick={onRetry}>
          Ask Jev again
        </button>
      ) : null}
      {row.text ? <p className="excerpt">{row.text}</p> : null}
      {why && row.phase === "done" ? <p className="reason">{why}</p> : null}
      <a className="thread" href={row.permalink} target="_blank" rel="noreferrer">
        Open thread
      </a>
    </article>
  );
}

function FlairChip({ label, name, detail, pulse }: { label: string; name: string; detail: string; pulse?: boolean }) {
  return (
    <span className="chip" data-label={label}>
      <span className={pulse ? "dot pulse" : "dot"} />
      <b>{name}</b>
      {detail ? <em>{detail}</em> : null}
    </span>
  );
}

function ago(unix: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min. ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr. ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo. ago`;
  const years = Math.floor(days / 365);
  return `${years} yr. ago`;
}

