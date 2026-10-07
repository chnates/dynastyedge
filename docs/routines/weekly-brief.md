# The weekly brief — routine setup and prompt

**What this is:** the instructions for the scheduled Claude routine that sends
the Tuesday waiver brief (and the trade-deadline section in deadline weeks).
Decided in `docs/analysis/proactive-delivery-2026-10.md` §6; built as
`docs/open-items.md` §0 #9. The routine lives in your claude.ai account, not in
this repo. This file is the copy of record: **if you change the routine's
prompt, change it here too.**

## Setup (owner, once — about two minutes)

Do this only **after** the server change has deployed and you've reconnected
the connector (step 0).

0. **Reconnect the connector.** Claude app → Settings → Connectors →
   DynastyEdge → connect, and sign in with GitHub. About two hours later, check
   it still shows as connected. That's the proof the new 30-day sign-in
   renewal works; before this change it dropped after one hour.
1. Open **claude.ai/code/routines** → **New routine** → **Cloud**.
2. **Name:** `DynastyEdge weekly brief`
3. **Prompt:** paste everything inside the box below.
4. **Repositories:** none. The brief doesn't need the code, and a routine with
   no repository can't be skipped by a GitHub disconnect.
5. **Environment:** Default.
6. **Trigger:** Schedule → Weekly → **Tuesday, 7:53 pm**, your local time
   (Eastern). Off the hour on purpose: on-the-hour runs can start late.
7. **Connectors:** remove everything except **DynastyEdge**. A routine can use
   every tool of every included connector without asking.
8. **Notifications:** Push **on**, Email off.
9. **Create**, then tap **Run now** once to see a brief today.

## The prompt

```
You are my fantasy football assistant GM. Write my weekly DynastyEdge brief using ONLY the DynastyEdge connector's tools. My league is a 10-team Superflex half-PPR dynasty league on Sleeper; I am the configured team (Nix Cage).

STEP 0: Check the connector. If no DynastyEdge tools are available, or the first tool call fails with an authorization or connection error, STOP. Send one push notification: "DynastyEdge brief failed: the connector isn't signed in. Reconnect DynastyEdge in Claude Settings > Connectors." Then end. Never write a brief from general knowledge.

STEP 1: Call get_roster with no arguments. Note the week, my record, my FAAB remaining, and calendar.tradeDeadline. If league.isOffseason is true, send "DynastyEdge: offseason, no brief this week" and stop.

STEP 2 (waivers, every week): Call recommend_free_agents with no arguments. Take the top picks with their faabBid. Waivers process at noon Eastern every day, and Wednesday noon is the big run, so say the bids must be in Sleeper before Wednesday 12:00 pm ET.

STEP 3: Call find_sell_high. Call get_playoff_odds. Call get_player_news for my roster and keep only my starters with an injury status.

STEP 4 (deadline weeks only): If calendar.tradeDeadline.inWindow is true, call find_trade_targets with no arguments and add a "Trade deadline" section: the deadline week (calendar.tradeDeadline.week), how many weeks are left, my buyer/seller stance from get_playoff_odds, and the top 3 targets with what they'd cost. If inWindow is false, skip this step entirely.

Write the brief as your final reply, plain English, short:
- Waivers: up to 4 pickups as "Player (POS, team): bid $X - one-line reason". If none are worth a bid, say so.
- Sell-high: the move and the partner, or "nothing to sell this week".
- Playoff odds: my % and stance in one line.
- Injuries: my hurt starters, one line each, or "none".
- Trade deadline: only in deadline weeks.
- Data as of: quote asOf.oldestSourceAt from get_roster, and say if any tool reported stale data.

Rules: Sleeper is read-only, so you cannot place claims or trades; never imply you did. Use the bids exactly as the tools give them, never your own. If a tool fails, say which one in the brief and keep going with the rest. Do not open, edit or create anything in any repository or service.

FINALLY: send exactly ONE push notification, under 200 characters, leading with the action, e.g. "Bid $110 Player X, $23 Player Y by Wed noon ET. No sell-high. 58% playoff odds." Always send it, even when the answer is "no moves this week".
```

## What can go wrong, and how you'd know

- **Connector signed out** (more than 30 days with no runs, 180 days since
  your last GitHub sign-in, or the GitHub secret was rotated): you get the
  "brief failed" notification. Reconnect it.
- **No notification at all on a Tuesday:** the run may have failed before it
  started (usage limit reached, subscription paused). Open
  claude.ai/code/routines and look at the run list. A green status there only
  means the session started; open the run to see what it did.
- **Numbers disagree with the app:** the brief and League › Free Agents use the
  same code, so a mismatch means stale data (check "Data as of") or a bug.
  Report it.
