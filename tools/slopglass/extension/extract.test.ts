import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { JSDOM } from "jsdom";

const source = readFileSync(new URL("./extract.js", import.meta.url), "utf8");
const sandbox: { SlopglassExtract?: ExtractApi } = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const api = sandbox.SlopglassExtract;
if (!api) throw new Error("extract.js did not export SlopglassExtract");

type ExtractApi = {
  findPostRoots: (doc: Document) => Element[];
  readPost: (root: Element) => { text: string; author: string; urn: string } | null;
  isNested: (root: Element) => boolean;
  isRepost: (root: Element) => boolean;
};

const html = readFileSync(new URL("./fixture.html", import.meta.url), "utf8");
const dom = new JSDOM(html);
const roots = api.findPostRoots(dom.window.document);

test("fixture yields the feed posts and skips the loose comment", () => {
  assert.equal(roots.length, 5);
  assert.deepEqual(
    Array.from(roots, (root) => String(root.getAttribute("data-urn") || root.getAttribute("data-id"))),
    ["urn:li:activity:1", "urn:li:activity:2", "urn:li:activity:3", "urn:li:activity:4", "urn:li:activity:5"],
  );
});

test("a post's own text is read, not the comment underneath it", () => {
  const post = api.readPost(roots[0]);
  assert.ok(post);
  assert.match(post.text, /espresso machine/);
  assert.doesNotMatch(post.text, /this comment/);
  assert.match(post.author, /Sam Ortega/);
  assert.equal(post.urn, "urn:li:activity:1");
});

test("a pure repost is skipped and a quoted original is nested", () => {
  const commentary = roots.find((root) => root.getAttribute("data-urn") === "urn:li:activity:2");
  const quoted = roots.find((root) => root.getAttribute("data-urn") === "urn:li:activity:3");
  const pure = roots.find((root) => root.getAttribute("data-urn") === "urn:li:activity:4");
  const insidePure = roots.find((root) => root.getAttribute("data-urn") === "urn:li:activity:5");
  assert.ok(commentary && quoted && pure && insidePure);
  assert.equal(api.isNested(commentary), false);
  assert.equal(api.isRepost(commentary), false);
  assert.equal(api.isNested(quoted), true);
  assert.equal(api.isRepost(pure), true);
  assert.equal(api.isNested(insidePure), true);
  assert.equal(api.isRepost(roots[0]), false);
});

test("a repost keeps the outer commentary separate from the nested original", () => {
  const outer = api.readPost(roots[1]);
  const inner = api.readPost(roots[2]);
  assert.ok(outer);
  assert.ok(inner);
  assert.match(outer.text, /This part is mine/);
  assert.doesNotMatch(outer.text, /Original announcement/);
  assert.match(inner.text, /Original announcement/);
  assert.equal((inner.text.match(/Original announcement/g) || []).length, 1);
  assert.match(inner.author, /Priya Raman/);
});
