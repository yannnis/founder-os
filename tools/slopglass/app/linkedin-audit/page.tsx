import type { Metadata } from "next";

import { RoastPage } from "@/components/roast-page";

export const metadata: Metadata = {
  title: "How cooked is my LinkedIn?",
  description: "Run the first 20 public LinkedIn posts, one at a time.",
};

export default function LinkedInAuditPage() {
  return <RoastPage />;
}
