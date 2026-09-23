import assert from "node:assert/strict";
import test from "node:test";

import { labelOf, reasonFor, type RedditFeatures } from "./qualify";

const zeros: RedditFeatures = { lead: 0, switching: 0, competitor: 0, proof: 0, pain: 0, language: 0 };

test("lead wins over every other yes", () => {
  const features: RedditFeatures = { ...zeros, lead: 0.8, switching: 0.9, language: 0.99 };
  assert.equal(labelOf(features), "lead");
  assert.match(reasonFor("lead"), /asking for help/);
});

test("switching beats competitor", () => {
  assert.equal(labelOf({ ...zeros, switching: 0.55, competitor: 0.9 }), "switching");
});

test("language is the last relevant flair", () => {
  assert.equal(labelOf({ ...zeros, language: 0.55 }), "language");
});

test("below the gate is noise", () => {
  assert.equal(labelOf({ ...zeros, lead: 0.54, language: 0.2 }), "noise");
  assert.match(reasonFor("noise", true), /Not enough text/);
});
