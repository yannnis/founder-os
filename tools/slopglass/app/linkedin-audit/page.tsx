import type { Metadata } from "next";

import { RoastPage } from "@/components/roast-page";

export const metadata: Metadata = {
  title: "Audit",
  description: "Paste a public LinkedIn profile. The first 20 posts are read one at a time.",
};

export default function LinkedInAuditPage() {
  return <RoastPage />;
}
