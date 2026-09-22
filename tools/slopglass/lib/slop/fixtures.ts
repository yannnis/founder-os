export type ExpectedVerdict = "slop" | "human" | "unsure";

export type FixturePost = {
  id: string;
  expect: ExpectedVerdict;
  author: string;
  role: string;
  text: string;
};

/**
 * Labeled posts used to set thresholds. Expectations are the product call
 * a person would make, not a claim that Jev must match them on every run.
 */
export const FIXTURES: FixturePost[] = [
  {
    id: "slop-announce",
    expect: "slop",
    author: "Priya Raman",
    role: "Senior Director, Northwind",
    text: `I'm thrilled to announce that I've stepped into a new chapter as Senior Director of Synergy at Northwind.

This isn't just a role. It's a responsibility.

Over the past few years, I've learned that leadership isn't about titles. It's about people. It's about showing up. It's about listening.

Here are 3 lessons I'm carrying forward:

1. Lead with empathy
2. Stay curious
3. Never stop learning

If you're on a similar journey, I'd love to connect. The best is yet to come.

Agree?`,
  },
  {
    id: "slop-hustle",
    expect: "slop",
    author: "Marcus Hale",
    role: "Founder, FocusLab",
    text: `Unpopular opinion:

Most people aren't tired. They're unfocused.

I used to wake up at 5am and still feel behind. Then I changed one thing.

I stopped consuming and started creating.

No more scrolling. No more excuses. Just deep work.

The results?
→ 10x output
→ Better sleep
→ A calmer mind

You don't need a new planner. You need a decision.

Drop a "YES" if you're choosing focus this week.`,
  },
  {
    id: "slop-self-label",
    expect: "slop",
    author: "Elena Voss",
    role: "Leadership coach",
    text: `I wrote this myself. No AI. Just me and my thoughts.

Success isn't about working harder. It's about working smarter.

In today's fast-paced world, the leaders who win are the ones who embrace change, empower their teams, and put customers at the center of everything.

Remember: your network is your net worth.

If this resonated, repost it so someone else in your circle can see it today.`,
  },
  {
    id: "slop-lessons",
    expect: "slop",
    author: "Daniel Cho",
    role: "Career storyteller",
    text: `I was rejected from 47 jobs.

Then I got the offer that changed my life.

Here's what I wish I knew earlier:

• Your resume isn't the problem. Your story is.
• Confidence is a skill.
• The right opportunity doesn't feel like forcing it.

Failure is feedback.

Save this for the next time you want to quit.

What's one rejection that redirected you?`,
  },
  {
    id: "slop-quiet",
    expect: "slop",
    author: "Taylor Nguyen",
    role: "People leader",
    text: `Leadership is a privilege.

The best leaders don't create followers. They create more leaders.

They listen more than they speak. They give credit freely. They take responsibility quickly.

In a world obsessed with speed, consistency is the real advantage.

Build people. The results will follow.`,
  },
  {
    id: "slop-paragraph",
    expect: "slop",
    author: "Jordan Ellis",
    role: "VP, Customer Outcomes",
    text: `Reflecting on an incredible quarter with my team. We embraced challenges as opportunities, fostered a culture of innovation, and delivered impact that exceeded expectations. I am incredibly grateful for the trust of our partners and the dedication of every colleague who showed up with passion and purpose. Here's to the next chapter of growth, learning, and shared success. Onward and upward.`,
  },
  {
    id: "human-incident",
    expect: "human",
    author: "Sam Ortega",
    role: "Office manager, Fieldnote",
    text: `The espresso machine at the 4th street office has been down since Tuesday and I am not handling it well. Facilities put a handwritten sign on it that just says "ask Derek" and Derek is in Lisbon until the 19th. I made coffee in a mug with a fork. It was bad. If you have a kettle on 3, I will trade you a mostly full bag of Counter Culture Big Trouble.`,
  },
  {
    id: "human-tech",
    expect: "human",
    author: "Aisha Rahman",
    role: "Engineer, checkout",
    text: `Spent the morning chasing a bug that only showed up for customers on the old checkout. Turned out a feature flag named "checkout_v2" defaulted to true in staging and false in prod, except for the EU cluster, where someone had flipped it during the March incident and never flipped it back. The null pointer was in tax calculation when the flag was false AND the cart had a gift card. Fixed in #18442. Please stop naming flags after the thing they replace.`,
  },
  {
    id: "human-opinion",
    expect: "human",
    author: "Chris Papadopoulos",
    role: "Product, Harbor",
    text: `Hot take I will probably regret: our all-hands should be 20 minutes and then we should leave. Today's ran 78 minutes, 40 of which was a roadmap recap that is already in the Monday email. I like the team. I do not like being read a doc.`,
  },
  {
    id: "human-job",
    expect: "human",
    author: "Nora Blake",
    role: "Leaving Fieldnote",
    text: `Last day at Fieldnote. I joined when we were 11 people in a room that smelled like the dumpling place downstairs, and I'm leaving a team of 40 that somehow still argues about the same billing edge case. Grateful to Mei for hiring me when my portfolio was three Notion pages and a broken prototype. Next week I start at Harbor, working on the claims queue. If you want the real story of why I left, buy me a beer, I'm not putting it here.`,
  },
  {
    id: "human-short",
    expect: "human",
    author: "Jules Hart",
    role: "RevOps",
    text: `Does anyone know who owns the Salesforce sandbox that emails customers from "test-noreply"? We just did it to a real clinic in Bozeman. I am so sorry. Looking at you, whoever exported the prod list into the sandbox in July.`,
  },
  {
    id: "mixed-polished",
    expect: "human",
    author: "Lena Ortiz",
    role: "Ops, Reno warehouse",
    text: `We shipped the warehouse scanner update on Thursday and the Saturday overnight crew in Reno found a bug we missed: if a pallet label is torn so the last two digits are gone, the app loops on "scan again" instead of letting you type the code. I sat on a call with Luis at 6:10am while he talked me through it from the floor. Patch went out at 8:40. Thank you to that crew for not just working around it.`,
  },
  {
    id: "mixed-linebreaks",
    expect: "human",
    author: "Owen Park",
    role: "Hiring manager",
    text: `I almost didn't post this.

Yesterday a candidate told me she bombed our system design round because she froze when I asked about queue backpressure.

She knew the material. I had rushed the prompt.

I rewrote the question, we ran it back for 15 minutes, and she did fine.

Interviewers are part of the measurement. I'm going to slow down.`,
  },
];

export const FEED_EXTRAS: FixturePost[] = [
  {
    id: "too-short",
    expect: "unsure",
    author: "Mina Sol",
    role: "Design",
    text: "Team offsite photo soon.",
  },
  {
    id: "human-complaint",
    expect: "human",
    author: "Riley Cho",
    role: "Support lead",
    text: `The status page says "all systems operational" while the webhook retries from this morning are still sitting in the dead letter queue. I checked ticket 4419. Three customers in Dublin got duplicate "your invoice is late" emails because the job ran twice after the 2:14 deploy. Taking the page down until that's actually true.`,
  },
  {
    id: "slop-gratitude",
    expect: "slop",
    author: "Cameron Blake",
    role: "Chief Inspiration Officer",
    text: `Grateful. Humbled. Excited.

Every setback was a setup. Every no was a not yet. Every challenge was a chance to grow.

I don't take this journey for granted.

To everyone who believed in me when I didn't believe in myself: this one's for you.

Like this if you've ever started over. Comment your word for this season.

Mine is "rise."`,
  },
];
