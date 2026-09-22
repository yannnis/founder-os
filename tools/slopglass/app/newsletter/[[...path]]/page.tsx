import type { Metadata } from "next";

import { NewsletterFrame } from "@/components/newsletter-frame";

export const metadata: Metadata = {
  title: "Newsletter",
};

export default async function NewsletterPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const suffix = path?.length ? `/${path.map((part) => encodeURIComponent(part)).join("/")}` : "/";
  return <NewsletterFrame src={`${suffix}?ss=1`} />;
}
