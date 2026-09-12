# The news feed's retention window collapsed — diagnosis, fix, re-measurement

**Date:** 2026-09-12 · **Trigger:** NEWS-1's re-measure date fired
(`docs/open-items.md`) · **Status:** fix landed, acceptance re-measure pending
accumulation (see §7)

-----

## 1 — The regression

NEWS-1 asked for the acceptance metric to be re-run after ~7 days of
accumulation. It is a **miss, and worse than the cold-feed measurement the item
was opened on**:

|                     | 2026-09-04 (cold) | 2026-09-12 (accumulated) |
|---------------------|-------------------|--------------------------|
| items               | 207               | 320                      |
| span                | 159h              | **27.5h**                |
| rostered resolved   | 10 of 26          | **6 of 30**              |

More items, less time depth, fewer of the owner's players. A shipped feature
(News, The Edge's Headlines, the profile drawer's Latest News) is quietly
degraded.

The pipeline is **not** broken: the workflow runs on schedule, the feed is
fresh (`updatedAt` 2026-09-12T16:21Z), and every source is reporting. This is a
retention-policy failure, not an outage.

## 2 — Root cause: the ITEM CAP binds, and the TIME window is dead letter

`scripts/fetch-news.mjs` retained player items for 7 days with a 240-item cap,
evicting by **recency only**:

```js
const players = all.filter(i => i.isPlayerNews && ageOf(i) <= PLAYER_MAX_AGE_MS)
                   .sort(byRecency)
const items = [...players.slice(0, PLAYER_MAX), ...general.slice(0, GENERAL_MAX)]
```

Measured on the live feed:

- `playerItems` is **240 — exactly `PLAYER_MAX`**. The bucket is saturated.
- The oldest retained player item is **29.7h** old, against a window that
  allows 168h.
- Player items arrive at **8.1/h**. A true 7-day window would need **~1357
  items**.

So source volume grew until 240 items is ~30 hours of news. **The 7-day
retention has never once bound; every run evicts purely by recency at the
30-hour mark.** The 159h → 27.5h collapse and the coverage drop are the same
fact. CLAUDE.md's "player items 7 days (240 max)" was describing behaviour the
pipeline did not have.

## 3 — Two things in the original framing that the live data disconfirms

Recorded because both would have led to a fix that makes coverage *worse*.

**a) The buckets are independent, so a general-interest source cannot crowd
out a player source.** `players.slice(0, 240)` and `general.slice(0, 80)` are
separate. The Athletic's 100-item pull and Yahoo's 50 can only consume the
player window with items that *are* player news. General items are in fact
capped far harder — 80 items spanning only **7.4h** against their 48h window.

**b) The per-source density numbers in `news-sources-2026-09.md` are stale, and
Yahoo is now the feed's single largest contributor of player news.** That study
measured in the **preseason**, on **headlines only**. Live, with the season
under way and `enrich()` matching headline *and* story:

| source | study | retained density | player items | **players only it covers** |
|---|---|---|---|---|
| Yahoo | 8% | **57%** | **62** | **16** |
| RotoWire | 100% | 100% | 48 | 7 |
| ESPN | 33% | 94% | 30 | 6 |
| PFT | 30% | 97% | 31 | 2 |
| The Athletic | 33% | 100% | 6 | 3 |

Dropping Yahoo — the "stop admitting low-density sources" option — would
**lose 16 rostered-eligible players no other source covers**. Rejected on
measurement, not taste.

## 4 — The actual waste: the cap is spent on REDUNDANCY, not breadth

The acceptance metric counts **distinct players resolved**, so what matters is
how many players a byte budget covers. Measured on the live window:

- 240 player items resolve to only **97 distinct players** — **3.14 items per
  player**, and one player carries **23**.
- 17 players hold 5+ items each; 41 hold exactly one.

Capping items **per player** and re-running the same window:

| per-player cap k | items kept | distinct players | slots freed |
|---|---|---|---|
| 1 | 79 | **97** | 161 |
| 2 | 123 | **97** | 117 |
| **3** | **152** | **97** | **88** |
| 4 | 168 | **97** | 72 |
| ∞ (shipped) | 240 | 97 | 0 |

**At k=3 the same 97 players cost 152 items instead of 240 — 37% of the cap is
pure redundancy, freeable at zero cost in breadth.** Those freed slots are
spent on *older items about other players*, which is exactly the time depth
that collapsed.

## 5 — The byte budget is ~4× more generous than assumed

CLAUDE.md and NEWS-1 both size the feed at "~100KB / 130KB, pulled once per
session". That is the **raw** size. `raw.githubusercontent.com` serves the feed
**gzipped**, and gzip is what crosses the wire:

```
raw:  141,671 B      wire (content-encoding: gzip):  37,049 B
```

**320 items cost 37KB on the wire**, ~114 B/item gzipped. Raising the cap is
therefore far cheaper than the prior sizing implied.

## 6 — The fix

Two changes in `scripts/fetch-news.mjs`, no workflow change (the publish
contract is untouched).

1. **`PER_PLAYER_MAX = 3` — diversity-aware eviction.** Walking newest-first,
   an item is admitted while **any** player it names is still under quota. An
   item naming nobody new is dropped *before* an older item about an uncovered
   player. Items that resolve to no Sleeper id (ESPN-athlete-id matches only,
   3 of 240) ride on recency as before, so no item type is newly droppable.
2. **`PLAYER_MAX` 240 → 400.** Wire cost **37KB → ~55KB** gzipped
   (480 items × ~114 B), still trivial for a once-per-session pull.

Rejected options, with the measurement that rejected each:

| option | verdict |
|---|---|
| raise `PLAYER_MAX` alone | insufficient — 7 days needs ~1357 items (~155KB wire) and still spends 3.14 items per player |
| cap per source | **counter-productive** — buckets are already independent (§3a) and the highest-volume source is the top *unique* contributor (§3b) |
| preference-aware eviction | **adopted** — §4 |
| drop low-density sources | **rejected** — would lose 16 uniquely-covered players (§3b) |

## 7 — Pre-registration, and why today's number cannot be the verdict

**Metric:** `node scripts/dev/news-coverage.mjs` against the live published
feed. **Acceptance number:** "resolved by the app", of the owner's rostered
players. **Baseline:** 6 / 30 (2026-09-12). **Standing target:** ≥ 12.

**Stated before implementing: the acceptance metric CANNOT move today, and a
run that showed it moving would be evidence of a measurement error, not a
fix.** The discarded history is gone — 27.5h of news is all that exists. This
change stops the eviction; it cannot retroactively recover depth. The window
re-deepens only as future runs decline to evict, at wall-clock rate, reaching
7 days after ~7 days of runs.

So the honest verification splits in two:

- **Today (structural, falsifiable now):** after a real run, the player bucket
  must no longer be pinned at its cap, and no player may hold more than 3
  items. That is direct proof recency-eviction has stopped binding.
- **On/after 2026-09-19 (the acceptance number):** re-run the metric against
  the accumulated feed. Tracked as **NEWS-3**.

## 8 — Result (observed 2026-09-12, one run)

See §8 of this file as updated after the pipeline run — structural gates only.
