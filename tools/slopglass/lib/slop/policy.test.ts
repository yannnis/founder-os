import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifyPost } from "./classify";
import {
  DEFAULT_WEIGHTS,
  SENSITIVITY_THRESHOLDS,
  judge,
  normalizePost,
  slopScore,
  voiceSlop,
  type SlopFeatures,
} from "./rubric";

type Row = { id: string; expect: "slop" | "human" | "unsure"; features: SlopFeatures };

const calibration = JSON.parse(
  readFileSync(new URL("../../scripts/calibration-results.json", import.meta.url), "utf8"),
) as { rows: Row[] };

test("default weights sum to 1", () => {
  const sum = Object.values(DEFAULT_WEIGHTS).reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("balanced preset matches the labeled calibration set", () => {
  const thresholds = SENSITIVITY_THRESHOLDS.balanced;
  for (const row of calibration.rows) {
    const judged = judge(row.features, thresholds);
    assert.equal(judged.verdict, row.expect, row.id);
  }
});

test("human scores and slop scores do not overlap", () => {
  const human = calibration.rows.filter((row) => row.expect === "human").map((row) => slopScore(row.features));
  const slop = calibration.rows.filter((row) => row.expect === "slop").map((row) => slopScore(row.features));
  assert.ok(Math.max(...human) < 0.4);
  assert.ok(Math.min(...slop) > 0.68);
});

test("a low-confidence voice does not block an extreme slop score", () => {
  const features: SlopFeatures = {
    pHuman: 0.25,
    pAssisted: 0.25,
    pGenerated: 0.5,
    voiceConfidence: 0.2,
    template: 0.95,
    interchangeable: 0.9,
    livedDetail: 0.1,
    engagementBait: 0.8,
    cadence: 0.9,
  };
  assert.ok(slopScore(features) > SENSITIVITY_THRESHOLDS.balanced.extremeSlop);
  assert.equal(judge(features, SENSITIVITY_THRESHOLDS.balanced).verdict, "slop");
});

test("a middling score with a split voice stays unclear", () => {
  const features: SlopFeatures = {
    pHuman: 0.34,
    pAssisted: 0.33,
    pGenerated: 0.33,
    voiceConfidence: 0.1,
    template: 0.5,
    interchangeable: 0.5,
    livedDetail: 0.5,
    engagementBait: 0.2,
    cadence: 0.5,
  };
  assert.equal(judge(features, SENSITIVITY_THRESHOLDS.balanced).verdict, "unsure");
});

test("assisted voice counts as partial slop and pure human voice does not", () => {
  assert.ok(voiceSlop({ pGenerated: 0, pAssisted: 1 }) > 0.4);
  assert.equal(voiceSlop({ pGenerated: 0, pAssisted: 0 }), 0);
});

test("normalizePost keeps paragraph breaks and trims lines", () => {
  assert.equal(normalizePost("  Agree?  \r\n\r\n\r\n  Drop a YES  "), "Agree?\n\nDrop a YES");
});

test("short and empty posts never call Jev", async () => {
  const empty = await classifyPost({ text: "   " });
  assert.equal(empty.status, 200);
  assert.equal(empty.ok && "skipped" in empty && empty.reason, "empty");

  const short = await classifyPost({ text: "Team offsite photo soon." });
  assert.equal(short.ok && "skipped" in short && short.reason, "too_short");

  const bad = await classifyPost({ text: 12 });
  assert.equal(bad.status, 400);
});
