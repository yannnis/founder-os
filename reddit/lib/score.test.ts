import assert from "node:assert/strict";
import test from "node:test";

import { bandFor, jevLines, leadScore } from "./score";

test("no judged posts has no score", () => {
  assert.equal(leadScore(0, 0), null);
});

test("one lead in ten is worth staying", () => {
  const score = leadScore(4, 40);
  assert.ok(score !== null);
  assert.equal(bandFor(score).id, "worth");
});

test("no leads is quiet", () => {
  const score = leadScore(0, 40);
  assert.ok(score !== null);
  assert.equal(bandFor(score).label, "Quiet");
});

test("the summary counts leads while posts are still being read", () => {
  assert.deepEqual(jevLines(1, 4, 6), ["1 of 4 posts are leads.", "6 still reading."]);
});

test("a dense pocket is hot", () => {
  const score = leadScore(8, 40);
  assert.ok(score !== null);
  assert.equal(bandFor(score).id, "hot");
});
