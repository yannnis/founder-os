import assert from "node:assert/strict";
import test from "node:test";

import { briefFromHtml, composeBrief, isBlockedIp, parsePublicUrl, passagesFromHtml, readCappedBody } from "./brief";

const HTML = `<!doctype html><html><head>
<title>Acme — collect borrower paperwork</title>
<meta name="description" content="Shops of one to five people stop chasing documents by email.">
<meta property="og:description" content="Document collection for small business lenders.">
</head><body>
<nav>Home Pricing</nav>
<h1>Document collection for lenders</h1>
<p>Equipment finance shops still chase PDFs in their inbox.</p>
<footer>Copyright</footer>
</body></html>`;

test("a page becomes a brief from its own words", () => {
  const brief = briefFromHtml(HTML);
  assert.match(brief.title, /Acme/);
  assert.match(brief.description, /Document collection/);
  assert.match(brief.brief, /Equipment finance shops/);
  assert.doesNotMatch(brief.brief, /Home Pricing/);
  assert.doesNotMatch(brief.brief, /Copyright/);
  const passages = passagesFromHtml(HTML);
  assert.ok(passages.some((passage) => /Equipment finance shops/.test(passage)));
  assert.ok(passages.every((passage) => !/Home Pricing|Copyright/.test(passage)));
  const composed = composeBrief(
    "Acme",
    "Equipment finance shops still chase PDFs in their inbox.",
    "Shops of one to five people stop chasing documents by email.",
  );
  assert.match(composed.brief, /Equipment finance shops/);
  assert.match(composed.brief, /Shops of one to five people/);
});

test("a domain without a scheme is still a website", () => {
  assert.equal(parsePublicUrl("example.com/pricing").href, "https://example.com/pricing");
  assert.equal(parsePublicUrl("  www.example.com ").protocol, "https:");
  assert.equal(parsePublicUrl("htps://example.com/docs").href, "https://example.com/docs");
  assert.equal(parsePublicUrl("htp://example.com").protocol, "https:");
  assert.equal(parsePublicUrl("https://example.com/pricing").href, "https://example.com/pricing");
});

test("private and local addresses are refused", () => {
  assert.throws(() => parsePublicUrl("http://127.0.0.1/admin"), /public website/);
  assert.throws(() => parsePublicUrl("http://169.254.169.254/latest"), /public website/);
  assert.throws(() => parsePublicUrl("http://10.1.1.1/"), /public website/);
  assert.throws(() => parsePublicUrl("http://localhost:38471/"), /public website/);
  assert.throws(() => parsePublicUrl("file:///etc/passwd"), /http or https/);
  assert.equal(parsePublicUrl("https://example.com/pricing").hostname, "example.com");
  assert.throws(() => parsePublicUrl("http://[::1]/"), /public website/);
  assert.throws(() => parsePublicUrl("http://[::ffff:127.0.0.1]/"), /public website/);
  assert.throws(() => parsePublicUrl("http://[::ffff:7f00:1]/"), /public website/);
  assert.throws(() => parsePublicUrl("http://[::ffff:a9fe:a9fe]/"), /public website/);
  assert.throws(() => parsePublicUrl("http://[::ffff:a01:101]/"), /public website/);
  assert.throws(() => parsePublicUrl("http://[fe80::1]/"), /public website/);
  assert.throws(() => parsePublicUrl("http://[fe90::1]/"), /public website/);
  assert.throws(() => parsePublicUrl("http://[fd00::1]/"), /public website/);
  assert.throws(() => parsePublicUrl("http://[2002:7f00:1::]/"), /public website/);
  assert.throws(() => parsePublicUrl("http://[64:ff9b::7f00:1]/"), /public website/);
  assert.throws(() => parsePublicUrl("http://[64:ff9b:1::1]/"), /public website/);
  assert.equal(parsePublicUrl("http://[2606:4700:4700::1111]/").protocol, "http:");
  assert.equal(parsePublicUrl("http://[2002:808:808::]/").protocol, "http:");
  assert.equal(parsePublicUrl("http://[64:ff9b::101:101]/").protocol, "http:");
  assert.equal(isBlockedIp("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIp("::ffff:8.8.8.8"), false);
});

test("a download stops once the page passes the size cap", async () => {
  const chunk = new Uint8Array(1000);
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 20; i += 1) controller.enqueue(chunk);
      controller.close();
    },
  });
  const capped = await readCappedBody(new Response(stream), 5_000);
  assert.equal(capped.byteLength, 5_000);
  const small = await readCappedBody(new Response(new Uint8Array([1, 2, 3])), 5_000);
  assert.equal(small.byteLength, 3);
});
