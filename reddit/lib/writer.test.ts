import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCT_PROMPT } from "./product-prompt";
import { parseProductAnswer } from "./writer";

test("a product answer keeps the description and one subreddit", () => {
  const answer = parseProductAnswer('{"description":"Software for dental practices that fills empty chairs.","subreddit":"r/dentistry"}');
  assert.equal(answer.description, "Software for dental practices that fills empty chairs.");
  assert.equal(answer.subreddit, "dentistry");
});

test("a fenced answer still parses", () => {
  const answer = parseProductAnswer('```json\n{"description":"A ledger for freelancers who lose invoices.","subreddit":"freelance"}\n```');
  assert.match(answer.description, /freelancers/);
  assert.equal(answer.subreddit, "freelance");
});

test("a name that is not a subreddit is dropped", () => {
  const answer = parseProductAnswer('{"description":"A tool.","subreddit":"not a real / community"}');
  assert.equal(answer.subreddit, null);
});

test("the description and the subreddit share one prompt", () => {
  assert.match(PRODUCT_PROMPT, /description/);
  assert.match(PRODUCT_PROMPT, /subreddit/);
});
