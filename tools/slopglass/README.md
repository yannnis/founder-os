# Slopglass

Slopglass answers one question about LinkedIn: how much of this is worth reading.

Each post is **Read**, **Skim**, or **Skip**. The number on the dial is the share that was not worth it. A skip counts as a whole point, a skim counts as half, and a read counts as nothing. Reposts are skipped. A post shorter than 40 characters is a skim and is never sent to the model.

There are two totals:

- **Feed.** How much of the scroll in front of you is worth your time. Posts are judged as they reach the screen.
- **Profile.** How much of one person’s recent posts is worth reading. On yannnis.com this lives at `/linkedin-audit`. `/linkedin-audit/demo` still has two sample profiles.

The judgment comes from [Jev](https://docs.typesafe.ai), TypeSafe’s System One model. Jev answers six yes-or-no questions. The bucket is those answers, composed in code. It does not guess whether a model wrote the post, and likes do not move the score.

The dial runs green on the left to red on the right: Worth following (0–35), Actually decent (36–50), Mid (51–70), Slop (71–82), It’s over (83–100).

## Run it

```bash
npm install
cp .env.example .env.local
# put your TypeSafe key in TYPESAFE_API_KEY
# put a RapidAPI key in RAPIDAPI_KEY, subscribed to Professional Network Data (free Basic plan)
npm run dev
```

Open http://127.0.0.1:38471/linkedin-audit. It takes a public `linkedin.com/in/…` URL, loads the first 20 posts, and scores them one at a time. The fixture feed stays at `/linkedin-audit/demo`. Both keys stay in `.env.local`.

## Put it on LinkedIn

1. `npm run pack:extension` (a zip is also at `public/slopglass-extension.zip`)
2. Unzip it.
3. Open `chrome://extensions`, turn on Developer mode, and choose **Load unpacked** on the folder that contains `manifest.json`.
4. In the Slopglass popup, set the server to `http://127.0.0.1:38471` and save.
5. Open LinkedIn. The meter says “This profile” on a profile and “This scroll” on the feed. The popup can force either.

The API key stays in `.env.local`. The extension only sends post text to `/api/classify`.

## What Jev is asked

The questions and the bucket rules live in `lib/slop/worth.ts`.

| Question | What a yes means |
| --- | --- |
| Specific | A fact, name, place, or decision you could point at. |
| New | Something a generic post on the topic would not already say. |
| Begging | The post’s real job is to collect a reply. That is a pass. |
| Selling | A pitch, a launch, or a title announcement. |
| Empty words | It sounds wise and leaves nothing to take away. |
| Funny | A joke or a comic incident. That can be a read on its own. |

A genuine question about an incident (“who owns the sandbox that just emailed a customer”) is not begging. “Reply YES” and “what’s one rejection that redirected you” are.

`npm test` checks the bucket rules against the last recorded Jev answers, and checks that the LinkedIn extractor skips comments, keeps repost commentary separate, and treats a pure repost as skipped.

`npx tsx scripts/calibrate-worth.ts` re-asks Jev and rewrites `scripts/worth-calibration.json`.

An earlier AI-slop rubric is still in `lib/slop/rubric.ts`, with its own recorded answers in `scripts/calibration-results.json`. The live badge does not use it.
