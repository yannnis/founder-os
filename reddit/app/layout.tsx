import type { Metadata } from "next";
import { Newsreader, Outfit } from "next/font/google";

import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "A subreddit, read against a product",
  description: "A subreddit, read against a product. Posts are flaired by Jev as they come in.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  );
}
