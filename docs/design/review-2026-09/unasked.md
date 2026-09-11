# What you didn't ask about

You asked about looks and navigation. These are the things I'd raise anyway,
ranked by what they cost you.

---

## 1. The biggest number on your home screen is the least actionable one. [MEASURED — screenshot]

`edge-dark.png`: **87,397** — team value — is set at 46px, roughly 3× the size
of anything else on the screen. Directly beneath it, at 13.5px, sits *"5 QBs
rostered — convert the surplus into a position you need"*, which is the actual
instruction.

Team value is a slow-moving vanity metric. It moved **−141 (−0.2%)** in thirty
days. You cannot act on it, and by the time it moves enough to notice, the
thing that moved it already happened. The action item is the thing you can do
something about today, and it is rendered as supporting text.

This is a hierarchy inversion at the top of the app, and it's upstream of the
visual problem: no palette fixes a screen whose loudest element is the wrong
one. Every direction in the mock keeps the big number because you're used to
it — but I'd argue the hero should lead with **the decision**, and team value
should be a stat-strip cell like rank and FAAB.

## 2. This is a single-user app that behaves like a multi-user product. [JUDGMENT]

You are the only person who will ever use this. It knows your roster, your
window, your odds, and the fact that it's Week 1. It could be far more
opinionated than it is:

- **Draft holds a top-level section year-round.** Its own briefing links only
  fire during draft season. Outside that window it could collapse into My Team
  or disappear from primary navigation entirely, and reappear when
  `selectTrackedDraft` finds an upcoming draft. Same for the Tracker sub-tab.
- **Season Review is a January view** occupying a permanent My Team tab.
- Nothing is ever hidden or reordered based on what's true this week, even
  though the app already computes everything it would need to.

"A feature should not have a permanent home" is a conclusion you invited, and
Draft is my candidate.

## 3. Eight identical spinners, and the loading state is the wrong shape. [MEASURED]

10 `animate-spin`/`animate-pulse` usages, 8 of them the shared `LoadingSpinner`.
A spinner says "something is happening"; it doesn't say *what is arriving*.
Every one of these screens knows the shape of what's loading — a roster is 26
rows, the odds page is 10 — so they could render that structure immediately and
fill it. That's not decoration: it removes a full layout shift on every screen
and makes the app feel materially faster without being faster.

This is the single biggest motion opportunity in the app and it's currently
spent on a rotating circle.

## 4. Your error states are good and your empty states are better than you think. [MEASURED]

Worth saying because it's rare: the degradation contracts are genuinely
well-built. News hides rather than erroring. Sparklines hide below 4 points.
`recommendFreeAgents` returning nothing renders a reason, not a blank. Rule 7
(`—`, never drop a rostered player) is honored everywhere I looked. The
all-buckets-failed → `ErrorState` + retry pattern is correct in both
`transactions` and `matchupWeeks`.

I found no empty-state bugs. Don't let a redesign regress them — they're
load-bearing and they're invisible when they work.

## 5. Two truncations are eating real information. [MEASURED]

Beyond B3 (the trade price): `lineup-dark.png` renders **"TreVeyon He…"** on the
bench. The pattern is `truncate min-w-0` applied to flex children whose content
is genuinely variable-length. It is the right CSS for the wrong fields — a
player's name and a trade's price are the two things that must never elide.
Worth a sweep independent of any direction.

## 6. The thing I'd measure before the next redesign. [JUDGMENT]

You have a strong measurement culture for models — back-tests, pre-registered
hypotheses, disconfirmed results recorded as such. None of that rigor is
applied to the interface, which is why Phase 3 could ship a design law that
produces a generic outcome and no instrument caught it.

The cheapest fix: **before and after, time yourself on three real tasks** —
"what should I do today", "is this trade fair", "who should I call about a WR".
Three trials each, on the phone. That's twenty minutes and it would have caught
Phase 3.
