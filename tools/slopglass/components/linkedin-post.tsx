import type { ReactNode } from "react";

import type { PostMedia, PublicPost, QuotedPost } from "@/lib/linkedin/posts";

export function LinkedInPost({
  post,
  name,
  compact,
}: {
  post: PublicPost;
  name: string;
  compact?: boolean;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return (
    <div className="overflow-hidden rounded-lg border border-[#e6e6e6] bg-white text-[#191919]">
      <header className="flex items-start gap-2 px-3 pt-3">
        {post.avatar ? (
          <img src={post.avatar} alt="" className="size-12 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#0a66c2] text-sm font-semibold text-white">
            {initials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          {post.headline ? <p className="truncate text-xs text-black/60">{post.headline}</p> : null}
          <p className="flex items-center gap-1 text-xs text-black/60">
            {post.time || "Public post"}
            <span aria-hidden>·</span>
            <Globe />
          </p>
        </div>
      </header>

      {post.text ? (
        <p className={`px-3 pt-2 text-sm leading-5 whitespace-pre-wrap ${compact ? "line-clamp-3" : ""}`}>{post.text}</p>
      ) : null}

      {post.quoted ? <Quoted quoted={post.quoted} compact={compact} /> : <Media media={post.media} compact={compact} />}

      <footer className="px-3 pt-2 pb-1">
        <p className="flex items-center gap-1 text-xs text-black/60">
          <ReactionDots />
          <span>{post.reactions.toLocaleString()}</span>
          <span className="ml-auto">
            {post.comments.toLocaleString()} comments · {post.reposts.toLocaleString()} reposts
          </span>
        </p>
        <div className="mt-1 grid grid-cols-4 border-t border-[#e6e6e6] py-1 text-[13px] font-semibold text-black/70" aria-hidden>
          <Action label="Like" icon={<LikeIcon />} />
          <Action label="Comment" icon={<CommentIcon />} />
          <Action label="Repost" icon={<RepostIcon />} />
          <Action label="Send" icon={<SendIcon />} />
        </div>
      </footer>
    </div>
  );
}

function Quoted({ quoted, compact }: { quoted: QuotedPost; compact?: boolean }) {
  return (
    <div className="mx-3 mt-2 overflow-hidden rounded-lg border border-[#e6e6e6]">
      <div className="px-3 py-2">
        <p className="truncate text-sm font-semibold">{quoted.name || "LinkedIn member"}</p>
        {quoted.headline ? <p className="truncate text-xs text-black/60">{quoted.headline}</p> : null}
        {quoted.text ? (
          <p className={`pt-1 text-sm leading-5 whitespace-pre-wrap ${compact ? "line-clamp-2" : "line-clamp-6"}`}>{quoted.text}</p>
        ) : null}
      </div>
      <Media media={quoted.media} compact={compact} />
    </div>
  );
}

function Media({ media, compact }: { media: PostMedia | null; compact?: boolean }) {
  if (!media) return null;
  if (media.kind === "image") {
    return (
      <div className="relative mt-2">
        <img
          src={media.url}
          alt=""
          referrerPolicy="no-referrer"
          className={`w-full object-cover ${compact ? "max-h-36" : "max-h-[440px]"}`}
        />
        {media.count > 1 ? (
          <span className="absolute right-2 bottom-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">1/{media.count}</span>
        ) : null}
      </div>
    );
  }
  if (media.kind === "video") {
    return (
      <div className={`relative mt-2 ${compact ? "max-h-36 overflow-hidden" : ""}`}>
        <img src={media.poster} alt="" referrerPolicy="no-referrer" className="w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-14 place-items-center rounded-full bg-black/70 text-white">
            <PlayIcon />
          </span>
        </span>
        {media.durationMs > 0 ? (
          <span className="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 text-xs text-white">
            {clock(media.durationMs)}
          </span>
        ) : null}
      </div>
    );
  }
  if (media.kind === "link") {
    return (
      <div className="mt-2 border-y border-[#e6e6e6] bg-[#f3f2ef]">
        {media.image ? (
          <img
            src={media.image}
            alt=""
            referrerPolicy="no-referrer"
            className={`w-full object-cover ${compact ? "max-h-28" : "max-h-56"}`}
          />
        ) : null}
        <div className="px-3 py-2">
          {media.domain ? <p className="text-xs text-black/60">{media.domain}</p> : null}
          <p className="text-sm font-semibold">{media.title}</p>
        </div>
      </div>
    );
  }
  if (media.kind === "document") {
    return (
      <div className="relative mt-2">
        {media.cover ? (
          <img
            src={media.cover}
            alt=""
            referrerPolicy="no-referrer"
            className={`w-full object-cover object-top ${compact ? "max-h-36" : "max-h-72"}`}
          />
        ) : null}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-2 text-white">
          <p className="text-sm font-semibold">{media.title || "Document"}</p>
          {media.pages > 0 ? <p className="text-xs">{media.pages} pages</p> : null}
        </div>
      </div>
    );
  }
  const top = Math.max(...media.options.map((option) => option.votes), 1);
  return (
    <div className="mx-3 mt-2 space-y-2">
      {media.question ? <p className="text-sm font-semibold">{media.question}</p> : null}
      {media.options.map((option) => (
        <div key={option.text} className="relative overflow-hidden rounded border border-[#0a66c2]/30 px-3 py-1.5 text-sm">
          <span className="absolute inset-y-0 left-0 bg-[#0a66c2]/10" style={{ width: `${(option.votes / top) * 100}%` }} />
          <span className="relative flex justify-between gap-3">
            <span>{option.text}</span>
            <span className="text-black/60">{option.votes.toLocaleString()}</span>
          </span>
        </div>
      ))}
      {media.voters > 0 ? <p className="text-xs text-black/60">{media.voters.toLocaleString()} votes · Poll closed</p> : null}
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function Action({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center gap-1.5 py-2">
      {icon}
      {label}
    </span>
  );
}

function ReactionDots() {
  return (
    <span className="inline-flex" aria-hidden>
      <span className="size-4 rounded-full bg-[#378fe9] ring-1 ring-white" />
      <span className="-ml-1 size-4 rounded-full bg-[#df704d] ring-1 ring-white" />
      <span className="-ml-1 size-4 rounded-full bg-[#6dae4f] ring-1 ring-white" />
    </span>
  );
}

function Globe() {
  return (
    <svg viewBox="0 0 16 16" className="size-3" aria-hidden>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="2.6" ry="6.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 8h12M3.2 5h9.6M3.2 11h9.6" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 translate-x-0.5" aria-hidden>
      <path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" />
    </svg>
  );
}

function LikeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        d="M7 11v9H4v-9h3zm3.2 9H19a2 2 0 0 0 2-1.7l1-6A2 2 0 0 0 20 10h-5.2l.7-3.4A2 2 0 0 0 13.6 4L8 10.2V20h2.2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path d="M5 6h14v9H8l-3 3V6z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function RepostIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path d="M7 7h9V4l4 4-4 4V9H7a3 3 0 0 0-3 3v1M17 17H8v3l-4-4 4-4v3h9a3 3 0 0 0 3-3v-1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path d="M4 12 20 4l-6 16-2.5-6.5L4 12z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
