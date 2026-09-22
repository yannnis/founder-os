/**
 * The live badge is worth-reading now. Refresh that with:
 *   npx tsx scripts/calibrate-worth.ts
 *
 * The older AI-slop answers stay in scripts/calibration-results.json and are
 * checked by lib/slop/policy.test.ts. This file used to overwrite them.
 */
console.log("AI-slop calibration is frozen. Run npx tsx scripts/calibrate-worth.ts for the live badge.");
