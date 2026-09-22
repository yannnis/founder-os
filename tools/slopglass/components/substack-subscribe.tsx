"use client";

import { useState, type FormEvent } from "react";

import { SUBSTACK_PROFILE } from "@/lib/site/constants";

export function SubstackSubscribe({
  title = "Subscribe on Substack",
  description = "Building products, SaaS, growth, and AI from the trenches. Free.",
}: {
  title?: string;
  description?: string;
}) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("Free. Confirm in your inbox if Substack asks.");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;

    setLoading(true);
    try {
      const response = await fetch("/api/v1/free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: value,
          first_url: window.location.href,
          first_referrer: document.referrer || "",
        }),
      });
      if (response.ok) {
        setEmail("");
        setNote("Check your inbox to confirm the subscription.");
        setLoading(false);
        return;
      }
    } catch {
      // fall through to Substack
    }

    window.open(`${SUBSTACK_PROFILE}subscribe?email=${encodeURIComponent(value)}`, "_blank", "noopener,noreferrer");
    setNote("Substack opened in a new tab to finish signing up.");
    setLoading(false);
  }

  return (
    <div className="rounded-[20px] bg-[#f6f1e6] px-4 py-4 ring-1 ring-[#e7dfd2]">
      <p className="font-heading text-lg tracking-tight text-[#1c1915]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-[#5c564c]">{description}</p>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="substack-email">
          Email address
        </label>
        <input
          id="substack-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@email.com"
          autoComplete="email"
          required
          className="h-11 min-w-0 flex-1 rounded-full border border-[#e7dfd2] bg-[#fffdf8] px-4 text-sm outline-none ring-[#1c1915]/15 focus:ring-3"
        />
        <button
          type="submit"
          disabled={loading || email.trim().length === 0}
          className="h-11 shrink-0 rounded-full bg-[#1c1915] px-5 text-sm text-[#f6f1e6] disabled:opacity-50"
        >
          {loading ? "Sending…" : "Subscribe"}
        </button>
      </form>
      <p className="mt-2 text-xs leading-5 text-[#6f685e]">{note}</p>
    </div>
  );
}
