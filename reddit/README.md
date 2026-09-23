# Reddit

A subreddit feed that looks like Reddit. You give it a product, it flairs each post for why it matters.

Put in a website or a short description, then a subreddit. The first posts come from that subreddit’s RSS feed. **Earlier posts** loads the next batch from Arctic Shift, so the feed can keep going past the RSS window.

Jev qualifies each post as it arrives. The product text it matches against is the page’s own title, description, and opening lines. Edit that box if the page got it wrong. A pasted description is used as-is. Jev answers yes or no. The flair and the one-line reason are composed in code.

Flair, first match wins: Lead, Switching, Competitor, Proof, Pain, Language. Anything else is Noise and stays out of All relevant.

## Run it

```bash
cd reddit
npm install
cp env.example .env.local
# put the TypeSafe key in TYPESAFE_API_KEY
npm run dev
```

Open http://127.0.0.1:47213.

`npm test` checks the flair rules, the RSS parser, and that private addresses are refused when reading a website.

## Deploy

This folder is its own Next.js app. On Vercel, set the root directory to `reddit` and add `TYPESAFE_API_KEY`. The key is not in git.
