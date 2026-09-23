import assert from "node:assert/strict";
import test from "node:test";

import { bodyFromContent, fromArchive, normalizeSubreddit, parseAtom } from "./parse";
import { SUBREDDIT_CHOICES } from "./subreddits";

const ATOM = `<?xml version="1.0"?><feed>
<entry>
  <author><name>/u/Ada</name></author>
  <content type="html">&lt;div class="md"&gt;&lt;p&gt;I&amp;#39;m leaving Salesforce.&lt;/p&gt;&lt;/div&gt; submitted by</content>
  <id>t3_abc</id>
  <link href="https://www.reddit.com/r/SaaS/comments/abc/leaving/" />
  <updated>2026-09-22T16:00:00+00:00</updated>
  <title>Leaving a CRM</title>
</entry>
<entry>
  <author><name>/u/Link</name></author>
  <content type="html">&amp;#32; submitted by &amp;#32; &lt;a href="https://www.reddit.com/user/Link"&gt; /u/Link &lt;/a&gt;</content>
  <id>t3_def</id>
  <link href="https://www.reddit.com/r/SaaS/comments/def/url/" />
  <updated>2026-09-22T15:00:00+00:00</updated>
  <title>Just a link</title>
</entry>
</feed>`;

test("atom keeps self-post text and drops posts with no body", () => {
  const posts = parseAtom(ATOM, "SaaS");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].author, "Ada");
  assert.equal(posts[0].text, "I'm leaving Salesforce.");
  assert.equal(posts[0].id, "t3_abc");
  assert.equal(posts[0].createdUtc, Date.parse("2026-09-22T16:00:00+00:00") / 1000);
});

test("subreddit names", () => {
  assert.equal(normalizeSubreddit("r/saas"), "saas");
  assert.equal(normalizeSubreddit("/r/SaaS/"), "SaaS");
  assert.equal(normalizeSubreddit("bad name"), null);
  assert.equal(normalizeSubreddit("a"), null);
  for (const name of Object.keys(SUBREDDIT_CHOICES)) {
    assert.equal(normalizeSubreddit(name), name);
  }
});

test("archive rows become posts", () => {
  const post = fromArchive(
    {
      id: "xyz",
      title: "Older",
      author: "Bea",
      selftext: "hello",
      created_utc: 1_700_000_000,
      permalink: "/r/jobs/comments/xyz/older/",
      subreddit: "jobs",
    },
    "jobs",
  );
  assert.equal(post?.id, "t3_xyz");
  assert.equal(post?.permalink, "https://www.reddit.com/r/jobs/comments/xyz/older/");
  assert.equal(post?.text, "hello");
});

test("removed, deleted, locked, and empty posts are left out", () => {
  const removed = fromArchive(
    { id: "rm", title: "Gone", author: "Ada", selftext: "[removed]", created_utc: 10, subreddit: "SaaS" },
    "SaaS",
  );
  const deleted = fromArchive(
    { id: "dl", title: "Gone", author: "Ada", selftext: "  [deleted]  ", created_utc: 10, subreddit: "SaaS" },
    "SaaS",
  );
  const locked = fromArchive(
    { id: "lk", title: "Closed", author: "Ada", selftext: "still here", created_utc: 10, locked: true, subreddit: "SaaS" },
    "SaaS",
  );
  const blocked = fromArchive(
    {
      id: "bl",
      title: "Held",
      author: "Ada",
      selftext: "still here",
      created_utc: 10,
      removed_by_category: "moderator",
      subreddit: "SaaS",
    },
    "SaaS",
  );
  const empty = fromArchive(
    { id: "em", title: "No body", author: "Ada", selftext: "   ", created_utc: 10, subreddit: "SaaS" },
    "SaaS",
  );
  assert.equal(removed, null);
  assert.equal(deleted, null);
  assert.equal(locked, null);
  assert.equal(blocked, null);
  assert.equal(empty, null);
});

test("body extractor ignores a missing markdown div and a removed marker", () => {
  assert.equal(bodyFromContent("&amp;#32; submitted by"), "");
  assert.equal(bodyFromContent('&lt;div class="md"&gt;&lt;p&gt;[removed]&lt;/p&gt;&lt;/div&gt;'), "");
});
