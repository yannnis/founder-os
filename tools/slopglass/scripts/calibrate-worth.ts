import { writeFileSync } from "node:fs";

import { classifyPost } from "../lib/slop/classify";
import { FEED_EXTRAS, FIXTURES } from "../lib/slop/fixtures";
import { bucketOf } from "../lib/slop/worth";

const EXPECT: Record<string, "read" | "skim" | "pass"> = {
  "slop-announce": "pass",
  "slop-hustle": "pass",
  "slop-self-label": "pass",
  "slop-lessons": "pass",
  "slop-quiet": "pass",
  "slop-paragraph": "pass",
  "slop-gratitude": "pass",
  "human-incident": "read",
  "human-tech": "read",
  "human-opinion": "read",
  "human-job": "read",
  "human-short": "read",
  "mixed-polished": "read",
  "mixed-linebreaks": "read",
  "human-complaint": "read",
};

async function main() {
  const posts = [...FIXTURES, ...FEED_EXTRAS].filter((post) => post.id !== "too-short");
  const rows = [];
  for (const post of posts) {
    const result = await classifyPost({ text: post.text });
    if (!result.ok || !("reading" in result)) {
      console.log(post.id, result);
      throw new Error(`No reading for ${post.id}`);
    }
    const features = result.reading.features;
    const bucket = bucketOf(features);
    const expect = EXPECT[post.id];
    console.log(
      `${bucket === expect ? "ok" : "DIFF"} ${post.id} ${bucket} (want ${expect}) ` +
        `spec=${features.specific.toFixed(2)} fresh=${features.fresh.toFixed(2)} bait=${features.bait.toFixed(2)} ` +
        `promo=${features.promo.toFixed(2)} empty=${features.empty.toFixed(2)} funny=${features.funny.toFixed(2)} ` +
        `${result.reading.latencyMs}ms`,
    );
    rows.push({ id: post.id, expect, bucket, features, model: result.reading.model });
  }
  writeFileSync(
    new URL("./worth-calibration.json", import.meta.url),
    JSON.stringify({ posts: rows }, null, 2) + "\n",
  );
  const missed = rows.filter((row) => row.bucket !== row.expect);
  console.log(`${rows.length - missed.length}/${rows.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
