# News source probe + coverage measurement — September 2026

**Measured 2026-09-04**, all sources probed server-side with `curl` and
re-parsed with the shipped parser before adoption. Re-run the coverage number
with `node scripts/dev/news-coverage.mjs` (no argument = the live published
feed; pass a path to measure a local `news.json`).

---

## 1. Re-verification of the build plan's §1 findings

`docs/build-plan-2026-09.md` §1 recorded these on 2026-09-04. Re-measured the
same day against the live published feed, they had already drifted:

| Finding | Build plan | Re-measured | Verdict |
|---|---|---|---|
| FantasyPros `player-news.php` | HTTP 404 | HTTP 404 | holds |
| Items naming a skill player | 24 / 100 | 25 / 100 | holds |
| My rostered players covered | 3 of 25 | **5 of 26** | holds (roster is 26 with taxi/IR) |
| Feed span | ~20h | 25.7h | holds |
| Items carrying `athleteIds` | 19 / 100 | 21 / 100 | holds |

The picture was intact: a 100-item feed, a day deep, three-quarters general
NFL content, touching a fifth of the roster.

`https://www.fantasypros.com/rss/player-news.xml` also answers **HTTP 200 with
an empty body** — there is no live FantasyPros player-news endpoint to
replace the dead one with. The source is dropped.

---

## 2. Source probe

Every candidate below was fetched and parsed. "Named" is the share of that
source's items naming an active skill player (Sleeper player DB, headline +
story).

### Adopted

| Source | URL | Items/pull | Named |
|---|---|---|---|
| ESPN API | `site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50` | 50 | carries `athleteIds` |
| RotoWire **page** | `rotowire.com/football/news.php` | 25 | **100%** |
| RotoWire RSS | `rotowire.com/rss/news.php?sport=NFL` | 5 | **100%** |
| Yardbarker | `yardbarker.com/rss/sport/2` | 20 | 45% |
| PFF | `pff.com/feed` | 25 | 40% |
| The Athletic | `nytimes.com/athletic/rss/nfl/` | 100 | 33% |
| ESPN RSS | `espn.com/espn/rss/nfl/news` | 33 | 33% |
| PFT | `nbcsports.com/profootballtalk.rss` | 30 | 30% |
| CBS | `cbssports.com/rss/headlines/nfl/` | 36 | 28% |
| Sporting News | `sportingnews.com/us/rss` | 20 | 20% |
| Yahoo | `sports.yahoo.com/nfl/rss/` | 50 | 8% — kept as general context |

Three of these needed a redirect followed to reach the real feed
(`profootballtalk.nbcsports.com/feed/` → `nbcsports.com/profootballtalk.rss`,
`sports.yahoo.com/nfl/rss.xml` → `/nfl/rss/`, `theathletic.com/nfl/?rss=1` →
`nytimes.com/athletic/rss/nfl/`).

**RotoWire's news page is the single best source and is scraped, not parsed
from RSS.** Their RSS is hard-capped at 5 items regardless of `count`,
`limit`, `numitems`, `team` or `pos` — all four were probed and all are
ignored. The page carries 25 of the same updates in structured
`news-update__*` markup, each with player, position, team, headline, body and
date. Every headline is literally `Player: Note`, which is the shape the app's
headline matcher wants. Scraping markup is more fragile than an RSS contract,
so it sits inside the same best-effort `try` as every other source: if
RotoWire restyles the page the source yields nothing and the feed carries on.

### Rejected

| Source | Why |
|---|---|
| FantasyPros `player-news.php`, `/nfl/rss/news.php`, `/rss/player-news.xml` | 404, 404, and 200-with-empty-body |
| **ESPN per-team RSS** (`/rss/nfl/team/news/_/name/{team}`) | Looks like 32 beat feeds; is the **identical national all-sports feed** for every team (kc and sf returned the same 42 items, incl. WNBA and World Cup). 5% named. |
| ESPN injuries RSS | Same national fallback feed. 5% named. |
| ESPN per-player news (`fantasy/v2/games/ffl/news/players`) | HTTP 403 server-side |
| ESPN fantasy RSS | 0% named — draft-guide columns |
| Yahoo fantasy RSS | 6% named, and multi-sport (fantasy baseball) |
| RotoBaller | 7% named, multi-sport (EPL DFS, UFC) |
| NFL.com, SI, Bleacher Report, USA Today, footballguys, draftsharks, fantasydata, numberFire, The Fantasy Footballers, NBC fantasy | no parseable RSS (404, or HTML with no `<item>`) |

---

## 3. The finding that reset the design: **`espn_id` is mostly null**

CLAUDE.md called ESPN athlete ids "the strongest join we have". They are — for
the minority of players that have one.

**Only 9 of the owner's 26 rostered spots carry an `espn_id` in Sleeper's
player DB.** Bo Nix, Brock Bowers, Rachaad White, Chase Brown, Josh Downs,
TreVeyon Henderson, Tank Dell, Luther Burden and nine others are all
`espn_id: null`. Those players could only ever be matched by their name
appearing in a **headline** — the story body was never searched, and no id
join could reach them.

Hence `playerIds`: the fetcher resolves every item against the whole player DB
(headline **and** story) and stamps the matched **Sleeper** ids on it. The
three client matchers (`usePlayerIntel`, `useLeagueNews`, `useNewsFeed`) read
that first, then `athleteIds`, then the headline name. `athleteIds` is still
enriched from name matches so nothing that predates `playerIds` breaks.

The effect is measurable: before, the app resolved 2 fewer players than the
best available matcher could; after, **app-resolved coverage equals the
matching ceiling exactly** (10 = 10 below). Matching is no longer the
bottleneck — volume is.

---

## 4. Acceptance test

Pre-registered before the fetcher was touched (`docs/build-plan-2026-09.md`
§3): **≥ 12 of the owner's 25 rostered players mentioned in a fresh pull**,
against a baseline of 3 (re-measured as 5).

| | Baseline (live feed) | After (single cold pull) | After (simulated first production run) |
|---|---|---|---|
| Items | 100 | 204 | 207 |
| Feed span | 25.7h | 158.8h | 158.8h |
| Items naming a player | 25 (25%) | 108 (53%) | — |
| Items resolved to `playerIds` | n/a | 117 (57%) | 120 (58%) |
| **Rostered players the app resolves** | **5 / 26** | **10 / 26** | **10 / 26** |
| Payload | 41 KB | 90 KB | 97 KB |

### RESULT: MISS — 10 of 25, against a target of 12

Reported as measured. Three things are true about that number:

1. **It is double the baseline** (5 → 10) and the app now resolves every
   player the matcher can find — the ceiling and the achieved number are the
   same, so no further matching work can move it.
2. **The 15 misses are genuine absence, not matching failures.** Each was
   checked individually: all 15 are in the player index (active, on a team, at
   a skill position) and none of their names appear anywhere in the feed's
   text. There is no news about Jordan James or Jalen Royals in any of the
   eleven sources right now. One of the 16 uncovered spots is `KC` — the team
   defense, which player news can never cover and should not.
3. **The single-pull number is not the design.** The feed now accumulates
   across runs (§5), and a saturated 7-day window holds ~240 player items
   against the 127 a single cold pull produces. The measured per-source
   publish rates (ESPN ~15 player items/day, RotoWire ~30, Yardbarker ~39,
   CBS/PFF/PFT/Athletic ~5 each) put a full window well past the cap, so the
   cap — not source scarcity — will bind. This is early September; in-season
   injury and inactive reporting raises every one of those rates.

**Re-measure after the pipeline has run for a week**
(`node scripts/dev/news-coverage.mjs`) before deciding whether more sources
are needed. If a saturated window still sits under 12, the honest conclusion
is that free NFL news does not cover a 26-deep dynasty roster that includes
taxi-squad rookies, and the target should move rather than the sources.

---

## 5. Accumulation, verified

The feed was a snapshot of one fetch. It is now a merge of the previous
published feed with the current pull, retained 7 days for player items (240
max) and 48 hours for general items (80 max).

Verified by running the fetcher twice, seeding the second run's previous feed
with the first run's output plus three synthetic items:

- 204 / 204 items retained, 0 duplicate headlines
- a synthetic 9-day-old **player** item pruned (7d window)
- a synthetic 5-day-old **general** item pruned (48h window)
- a synthetic fresh item retained
- **0 retained items changed their `published` time** — first-seen timestamp
  wins, so an item cannot float back to the top by being re-listed, and an
  exact RSS timestamp is never overwritten by a date-only reprint of itself
  from the RotoWire page

Migration was verified too: the live 100-item feed (published before
`playerIds` existed) was fed in as the previous feed and every retained item
was re-enriched correctly.

### Timestamps

The RotoWire page gives a **date only** ("September 4, 2026"). Anchoring it at
local midday keeps a page item on the same calendar day as its exact-timestamped
RSS twin, but that anchor is in the *future* for most of the UTC day — and a
future timestamp sorts above real news while still rendering as "1m ago". Dates
we infer are therefore capped at the current moment (`notFuture`). A source's
own timestamp is never touched: ESPN's news API routinely publishes ~45 minutes
ahead of the clock, which `relativeTime` already floors at "1m ago", and
rewriting a publisher's stamp would be worse than displaying it.

### Rendered

Verified in the real app at 390px (`scripts/dev/screenshot-app.mjs --stub`
serving the new feed):

- **News tab** — RotoWire items resolve to their players with the correct
  position colors, and rostered players carry the red "You" chip.
- **The Edge › Headlines** — 5 items, every one attributed to a rostered
  player (Jaxson Dart, Tank Dell, Tua Tagovailoa, Mark Andrews, Jordan Love).
  Two of those five are matches the old pipeline could not have made: Tua from
  a Sporting News headline naming two quarterbacks, and Mark Andrews from a
  roundup column.

### Degradation contract

| Failure | Behavior |
|---|---|
| All 11 sources dead **and** the player DB dead, previous feed present | Publishes the retained window intact; all 117 player items keep their `playerIds`. Exit 0. |
| All sources dead **and** no previous feed | Exit 1, `news.json` not written, branch untouched, published feed preserved. |
| `news-prev.json` corrupt | Logged, starts fresh, publishes normally. |
| Player DB unreachable | Ranking falls back to recency; retained player items keep their ids; new items land in the general bucket. |
| Previous feed exists on the branch but can't be checked out | Workflow step fails **before** the publish step — nothing is force-pushed, the accumulated window survives, the next run self-heals. |

In every case the app's contract holds: the news section hides, it never
errors and never retry-loops.
