import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifyPost } from "./classify";
import { bandFor, bucketOf, tallyOf, type WorthFeatures } from "./worth";

const calibration = JSON.parse(
  readFileSync(new URL("../../scripts/worth-calibration.json", import.meta.url), "utf8"),
) as {
  posts: Array<{ id: string; expect: "read" | "skim" | "pass"; bucket: string; features: WorthFeatures }>;
};

test("recorded Jev answers still fall in the labeled bucket", () => {
  assert.equal(calibration.posts.length, 15);
  for (const post of calibration.posts) {
    assert.equal(bucketOf(post.features), post.expect, post.id);
    assert.equal(post.bucket, post.expect, post.id);
  }
});

test("bait is a pass even when the post is also specific and funny", () => {
  assert.equal(
    bucketOf({ specific: 0.99, fresh: 0.99, bait: 0.9, promo: 0, empty: 0, funny: 0.9 }),
    "pass",
  );
});

test("a joke with nothing else to it is still a read", () => {
  assert.equal(
    bucketOf({ specific: 0.2, fresh: 0.2, bait: 0.1, promo: 0.05, empty: 0.2, funny: 0.8 }),
    "read",
  );
});

test("a thin observation that is not bait or empty is a skim", () => {
  assert.equal(
    bucketOf({ specific: 0.4, fresh: 0.3, bait: 0.1, promo: 0.2, empty: 0.3, funny: 0.1 }),
    "skim",
  );
});

test("dial bands sit on the published edges", () => {
  assert.equal(bandFor(0).label, "Worth following");
  assert.equal(bandFor(35).label, "Worth following");
  assert.equal(bandFor(35.4).label, "Worth following");
  assert.equal(bandFor(36).label, "Actually decent");
  assert.equal(bandFor(50).label, "Actually decent");
  assert.equal(bandFor(51).label, "Mid");
  assert.equal(bandFor(70).label, "Mid");
  assert.equal(bandFor(71).label, "Slop");
  assert.equal(bandFor(82).label, "Slop");
  assert.equal(bandFor(83).label, "It's over");
  assert.equal(bandFor(100).label, "It's over");
});

test("score counts a pass as whole and a skim as half", () => {
  const tally = tallyOf([
    { kind: "judged", bucket: "pass", features: { specific: 0, fresh: 0, bait: 0.9, promo: 0, empty: 0, funny: 0 } },
    { kind: "judged", bucket: "skim", features: { specific: 0.3, fresh: 0.3, bait: 0.1, promo: 0.1, empty: 0.2, funny: 0 } },
    { kind: "judged", bucket: "read", features: { specific: 0.9, fresh: 0.9, bait: 0, promo: 0, empty: 0, funny: 0.2 } },
    { kind: "judged", bucket: "read", features: { specific: 0.9, fresh: 0.9, bait: 0, promo: 0, empty: 0, funny: 0.2 } },
    { kind: "thin" },
    { kind: "skip", reason: "repost" },
  ]);
  assert.equal(tally.judged, 5);
  assert.equal(tally.skipped, 1);
  assert.equal(tally.pass, 1);
  assert.equal(tally.skim, 2);
  assert.equal(tally.read, 2);
  assert.equal(tally.score, 40);
  assert.equal(tally.band?.label, "Actually decent");
});

test("a short post never reaches Jev", async () => {
  const result = await classifyPost({ text: "Team offsite photo soon." });
  assert.equal(result.ok && "skipped" in result && result.reason, "too_short");
});

test("an empty post is not scored", async () => {
  const result = await classifyPost({ text: "   " });
  assert.equal(result.ok && "skipped" in result && result.reason, "empty");
});
