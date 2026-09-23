import assert from "node:assert/strict";
import test from "node:test";

import { linkedInProfile } from "./url";

test("accepts a public profile URL and a bare slug", () => {
  assert.deepEqual(linkedInProfile("https://www.linkedin.com/in/satya-nadella/?trk=public"), {
    url: "https://www.linkedin.com/in/satya-nadella/",
    slug: "satya-nadella",
    name: "Satya Nadella",
  });
  assert.equal(linkedInProfile("  satyanadella ")?.url, "https://www.linkedin.com/in/satyanadella/");
  assert.equal(linkedInProfile("linkedin.com/in/ada/")?.slug, "ada");
  assert.equal(linkedInProfile("Satya Nadella")?.slug, "satya-nadella");
  assert.equal(linkedInProfile("https://ca.linkedin.com/in/ada")?.slug, "ada");
});

test("rejects anything that is not a personal profile", () => {
  assert.equal(linkedInProfile(""), null);
  assert.equal(linkedInProfile("https://www.linkedin.com/company/microsoft"), null);
  assert.equal(linkedInProfile("https://example.com/in/ada"), null);
  assert.equal(linkedInProfile("javascript:alert(1)"), null);
});
