# Proactive delivery — how a brief reaches the phone without the app growing a backend (2026-10)

**Open item:** `docs/open-items.md` §0 #8 · `dynastyedge-research-frontier` Item 5
**Kind:** a feasibility note. Nothing in the app, the MCP server, a workflow or a CLAUDE.md rule changed in this PR. Building is §0 #9, and only on the owner's yes.
**Evidence gathered:** 2026-10-07 (2026 Week 5), from the live league, the live MCP server, the Claude routines documentation, and one dry-run routine created, fired and deleted in the same session (§3.4).

---

## 1. In plain English

**The question.** Can a weekly waiver brief ("bid $X on these players before
Wednesday noon") and a trade-deadline brief reach your phone without you
opening the app — and without giving the app a server?

**The answer: yes, and the best way is a scheduled Claude routine (option E)
that asks the DynastyEdge connector the questions and sends you a phone
notification — but it does not work today, and the reason is fixable.**

What I found, in order of importance:

1. **The connector cannot stay signed in on its own.** When you connect
   DynastyEdge in the Claude app, our server hands Claude a pass that expires
   after **one hour**, and it never hands out the "renew without asking"
   ticket (a *refresh token*) that lets an app stay signed in for weeks. So a
   routine that runs on a Tuesday night finds an expired pass and nobody there
   to sign in again. Your connector shows **"needs reconnect" right now**,
   which is what that looks like. This is a gap in *our* server, not in Claude,
   and closing it is a small change to the MCP server (not to the app).
2. **A routine that can't reach the connector still reports "succeeded".**
   I created a test routine, ran it, and it had no DynastyEdge tools at all —
   and the run was marked **SUCCEEDED**. So a broken brief fails *silently*
   unless the routine is told to say so out loud. That is easy to fix in the
   routine's instructions (§5).
3. **The notification part works.** A scheduled run has the phone-notification
   tool, and a routine can be set to push, email, both, or neither. You can
   switch either off at any time, or pause the routine.
4. **It costs nothing extra in money.** Runs come out of your Claude
   subscription's usage, like a chat does. No new account, no new secret, no
   new npm package, and no code in the app.
5. **Timing is better than anything GitHub can do.** GitHub's scheduler
   delivers our news job hours late (we measured 4–6 hours). Claude routines
   start within minutes of the scheduled time.

**The fallback**, if you don't want to touch the server's sign-in: a GitHub
workflow that writes the brief into a GitHub issue, which GitHub emails you
(option B). Zero secrets, zero cost — but it arrives hours late, it's an email
from GitHub, and it can't use Claude's judgment or the news.

---

## 2. When each brief should fire (read from league settings, not assumed)

**Waivers.** League settings today: `waiver_type 2` (FAAB), `daily_waivers 1`,
`waiver_day_of_week 2`, `daily_waivers_hour 9`, `waiver_clear_days 1`,
`waiver_budget 1000`. Sleeper doesn't document how those numbers map to
clock times, so I measured when claims actually processed instead: of the 49
waiver transactions so far this season (weeks 1–5), **27 processed Wednesday
at 12:00–12:09 ET**, the rest at 12:00 ET on Thursday–Sunday. So waivers run
**every day at noon Eastern, and the big run is Wednesday noon** (the first
one after Monday night's games).
→ **Waiver brief: Tuesday evening, ET** (e.g. 7:53 pm). That's after Monday
Night Football has settled, and leaves a full evening plus Wednesday morning
to place bids before the noon run.

**Trade deadline.** `trade_deadline 13`. The season started 2026-09-09, so
Week 12 begins about Tuesday 2026-11-24 and Week 13 about Tuesday 2026-12-01.
→ **Deadline briefs: the Tuesday of Week 12 ("one week left") and of Week 13
("this week").** Not measured: exactly when inside Week 13 Sleeper stops
accepting trades — the brief must say "deadline week", not quote an hour.

**A gap this exposes:** no MCP tool returns the trade deadline or the waiver
schedule today. A routine could only learn it from a date typed into its
prompt — which is "assumed", not "read". Fixing that is a small, additive
field on an existing tool (part of §0 #9).

---

## 3. Option E — a scheduled Claude routine that calls the DynastyEdge connector

**What you'd get.** Tuesday evening, a phone notification from the Claude app
with a one-line summary ("Bid $110 on X, $23 on Y; nothing to sell"), and/or an
email. Tapping it opens the run, which holds the full brief: top pickups with
their FAAB bids (`recommend_free_agents` — the same bid the app shows), the
sell-high move with a named partner (`find_sell_high`), playoff odds and your
buyer/seller stance (`get_playoff_odds`), injury news on your starters
(`get_player_news`). In Weeks 12–13, the deadline section adds trade targets
(`find_trade_targets`).

### 3.1 Can a routine use a custom connector? — **Yes, with one catch on who creates it**

- Docs: *"Connectors are the claude.ai integrations on your account"* and
  *"When you create a routine, all of your currently connected connectors are
  included by default."* Connector traffic *"is routed through Anthropic's
  servers"*, so the routine's network rules don't need changing.
  (code.claude.com/docs/en/routines, "Connectors" and "Environments".)
- **The catch, measured:** from this coding session, the routine tool refused
  to attach one — `"the connectors parameter is not available for this
  organization"` — and the routine it did create came back with
  `"warning: this trigger stores no MCP connectors"`. **So the routine has to
  be created by you in the Claude app / claude.ai/code/routines**, where the
  connector picker lives. That's a two-minute form, not a blocker.

### 3.2 Does the connector stay signed in between runs? — **No, not today**

Measured on the live server, 2026-10-07:

- `/.well-known/oauth-authorization-server` → `"grant_types_supported":
  ["authorization_code"]` — no `refresh_token` grant.
- `POST /api/oauth/token` with `grant_type=refresh_token` →
  `{"error":"unsupported_grant_type"}`.
- `mcp/oauth.js`: `ACCESS_TOKEN_TTL_S = 60 * 60` — the pass lasts one hour, by
  design, *"because unrevocable"* (a signed pass can't be cancelled early).
- Your connector's state in this account: **`installState: "needs_reconnect"`,
  `connected: false`.**

Put together: claude.ai gets a one-hour pass and nothing to renew it with, so
after an hour it needs a human to sign in again — and a routine has no human.
**This is an inference from those four facts, not an end-to-end observation**
(I can't sign in from a sandbox); the confirming test is the first step of
§0 #9.

**The fix and what it costs** (a change to `mcp/`, not to the app): teach the
server to issue a refresh token. Because our server deliberately keeps no
database, a refresh token would be signed-not-stored like everything else, so
it **cannot be cancelled individually either** — the only "revoke" stays
"rotate the GitHub secret", which signs everything out at once. Sensible
shape: a 30-day refresh token that is re-issued on every use (weekly runs keep
it alive; a 30-day idle gap, like the offseason, needs one re-connect), with
the GitHub-account allowlist re-checked on every renewal, exactly as it is on
every request today. Weighing the risk: what the lock guards is read-only
analysis of **league data that Sleeper already publishes without a login**;
the realistic harm of a stolen token is someone else running up our Vercel
usage for up to 30 days. CLAUDE.md is explicit that *"the OAuth gate is the
only lock — any change to it is a change to the only lock"*, so this is your
call, not mine.

### 3.3 Notifications — which exist, and can you opt out? — **Push and email, each switchable**

- The routine tool's schema: `notifications: { push, email }` — *"push sends to
  the owner's phone when a run finishes with something noteworthy; email sends
  the same summary to their inbox … Pass {} to opt out of all channels. Only
  fresh-session-per-fire Routines take this."* My dry run stored
  `"notifications":{"channel":{"push":false,"email":false}}`, confirming the
  off switch round-trips.
- The routines form calls it *"Notify me when this routine finishes — Claude
  will send you a one-line summary when each run completes"*, with Push
  Notification and Email checkboxes.
- Other off switches: the routine's on/off toggle (pause), or delete it.
- **Known risk:** a June 2026 public bug report says routine runs sometimes
  lacked the notification tool. My fired dry run (2026-10-07, Claude Code
  2.1.293) **did** have `PushNotification` in its tool list. Whether a push
  actually lands on your phone I did **not** test — that would have notified
  you, and you asked me not to without asking.

### 3.4 What happens when a run fails? — **Silent, unless the prompt makes it loud**

The dry run (created, fired, read and deleted in this session; notifications
off; no repository attached):

| | Observed |
|---|---|
| Connectors stored | `"mcp_connections": []` (see §3.1) |
| Session's MCP servers | `"mcp_servers": []` |
| Its answer | *"No tools have "DynastyEdge" … in their name … There is no DynastyEdge get_roster tool"* |
| Run status | **`ROUTINE_RUN_STATUS_SUCCEEDED`**, `is_error: false` |
| `PushNotification` tool | present |

The docs say the same in general: *"A green status in the run list means the
session started and exited without an infrastructure error. It does not mean
the task in your prompt succeeded … missing connector tools … surface there
rather than in the status indicator."* So the routine's prompt must treat
"tools missing or erroring" as news worth notifying: *"Brief failed — the
DynastyEdge connector isn't signed in; reconnect it in Settings → Connectors."*
With that line, a failure is visible on the phone the same evening.

Other documented failure modes: if your subscription usage window is
exhausted, a run is *"rejected until your usage window resets"*; a paused
subscription holds routines. A routine with **no repository attached** (this
one needs none) is immune to the documented GitHub-disconnect skip.

### 3.5 What a run costs

- **Money: nothing beyond the subscription** — *"Routines draw down
  subscription usage the same way interactive sessions do."* Limits: 100
  scheduled runs/hour; we'd use about 20 runs a season.
- **Measured size:** the trivial dry run read ~37k tokens (almost all of it
  the session's own setup) and reported a list-price equivalent of
  **$0.053**. A real brief makes ~4–6 tool calls whose answers are 8–36KB each
  (measured per tool in MCP-CARRY), so expect several times that — **estimate
  $0.25–0.75 list-equivalent per run, ~20 runs a season**, drawn from your plan
  rather than billed. Measure on the first real run at claude.ai/settings/usage.
- **Secrets: none new.** **Upkeep:** reconnect after any 30-day idle gap (with
  the §3.2 fix), plus the existing "re-check the connector on the phone after a
  tool deploys".

### 3.6 Which CLAUDE.md rules it touches

- *"A feature may not grow a backend"* — **untouched.** Nothing in `src/`
  changes; the routine is Anthropic-hosted and the MCP server already exists.
- *No new dependency without approval* — **none needed.**
- *Sleeper is read-only* — **respected, and the brief must say so**: it tells
  you what to bid; it cannot place the claim.
- *"The OAuth gate is the only lock"* — **touched by the §3.2 fix.** Your decision.
- *"Every response carries an as-of timestamp"* — keep it: the brief quotes
  each tool's `asOf`, so a stale answer looks stale.

---

## 4. Options A–D, re-scored against today's repo

The 2026-07-05 table predates the MCP server, the `marketTrend.js` /
`faabBid.js` extractions, and the resolver hook that lets Actions scripts
import `src/utils` (`node --import ./scripts/register.mjs`). Two facts help
all four: **`computeEdgeSignals` and `buildBriefing` are pure** and import only
`src/utils`, and **`buildLeagueState`, `recommendFreeAgents` and
`recommendFaabBid` already run under Node** (the MCP server calls them). Two
facts limit all four: a server-side brief is **watchlist-blind and last-visit-
blind** (both live in the phone's storage), and GitHub's cron runs **hours
late** (NEWS-5: ~4–6h behind the requested time on both scheduled workflows).

| | What you receive, when | Cost: money · secrets · upkeep | How it fails | Rules touched |
|---|---|---|---|---|
| **A. `briefing.json` on a data branch** | Nothing on the phone. The Today screen shows a brief computed hours earlier, instantly on open | $0 · none · a fourth pipeline to watch (the keepalive in `values-history.yml` already covers every cron) | Silent cron death or lateness — the existing source-health alarm pattern would cover it | None. Still **pull**, so it doesn't answer the question on its own; it's the substrate for B/C/D |
| **B. GitHub issue → GitHub email** | An email (or GitHub-app push) from GitHub, **hours after the scheduled time**; rich text, the same numbers the app shows, no news judgment | $0 · **none** (built-in `GITHUB_TOKEN`, `issues: write`) · one workflow + one script | Cron lateness; a dead cron is silent unless alarmed. Spam risk if it fires on nothing — needs an "only if there's a move" rule | Workflow change (change-control's pipeline class). The source-health alarm already relies on GitHub emails reaching you, so the channel is proven |
| **C. Email via SMTP from Actions** | A normal email, hours late | $0 with a personal mail account · **one repo secret** (an SMTP app password) · secret rotation | Same as B, plus a dead password | Repo secret — CLAUDE.md bans a backend and client secrets, not Actions secrets, but it is a policy call. Adds nothing B doesn't, except the sender |
| **D. iOS Web Push to the home-screen app** | A real phone push from DynastyEdge itself, hours late | $0 · a VAPID key secret · **a stored push subscription** (no backend means committing it to the repo) and Web Push encryption without a new package | **Still speculative — not proven here.** Every clause from 2026-07 stands unverified for this PWA. Your account's routine history suggests another project of yours already sends a morning digest with stored push subscriptions — on a backend with a database, which is exactly what `src/` may not have | Bends "no backend" (the subscription store) and very likely "no new dependency" (`web-push`) |
| **E. Scheduled Claude routine + connector** | A Claude-app push and/or email **within minutes of the time you pick**, opening a full brief with Claude's read of the news | $0 extra (subscription usage, est. $0.25–0.75 list-equivalent/run) · **no secrets** · reconnect after 30 idle days | **Broken today** (§3.2). Once fixed: silent "succeeded" unless the prompt reports failures (§3.4) | No backend, no dependency; **touches the OAuth lock** (§3.2) |

---

## 5. Recommendation

**Build option E, as §0 #9, in this order — and stop if step 1 says the
inference in §3.2 was wrong:**

1. **MCP server: issue refresh tokens** (30-day, re-issued on each use,
   allowlist re-checked on every renewal; tests written as attacks like the
   rest of `tests/mcpOauth.test.mjs`; bundle rebuilt). Then reconnect the
   connector on the phone and confirm it is still connected two hours later —
   the end-to-end proof §3.2 lacks.
2. **MCP server: add the league calendar to an existing tool** — trade
   deadline week, waiver budget, and the waiver schedule as Sleeper reports it
   — so the routine reads the deadline instead of having it typed in. Declared
   in the zod schema and verified over the real transport (the closed-object
   trap).
3. **You create one routine** at claude.ai/code/routines: no repository,
   DynastyEdge connector only, **Tuesday ~7:53 pm ET weekly**, Push on (Email
   your choice). I write its prompt: one brief, the deadline section only in
   the trade-deadline week and the week before, *always* notify — including
   "brief failed, reconnect the connector" when the tools are missing or
   erroring — and never imply it can place a claim.
4. **Grade it like everything else:** the first three Tuesdays, you confirm the
   push landed and its numbers match League › Free Agents.

Why E over B: it is the only option that reaches the phone **on time** for a
noon-Wednesday waiver run, carries the news, needs no secret, and puts zero
code in the app. B is the fallback if you decline step 1.

## 6. Decisions I need from you

1. **The lock (§3.2):** may the MCP server issue 30-day refresh tokens that,
   like everything it issues, can only be cancelled by rotating the GitHub
   secret? **Yes → E. No → B.**
2. **Channel:** push only, or push + email?
3. **Time:** Tuesday ~7:53 pm ET for the waiver brief — or Wednesday morning?
4. **Approve §0 #9** on these terms (steps 1–4 above).

---

## 7. Noticed along the way (not fixed — this PR changes no code)

- `mcp/oauth.js`'s header comment says *"NO DYNAMIC CLIENT REGISTRATION"*, but
  the server does register clients (`/api/oauth/register`, as CLAUDE.md
  documents). The comment is stale; worth correcting in the §0 #9 commit that
  touches that file anyway.
- Your connector is in **needs-reconnect** state now, so §0 #3 (the phone
  re-check of all 13 tools) will start with a sign-in.

## Evidence and how to re-check it

- Live league settings and the waiver-processing times: `GET
  /v1/league/1313933520715907072` and `/transactions/{1..5}`, `type ===
  'waiver'`, `status_updated` in America/New_York.
- Server grants: `curl -s https://dynastyedge-mcp.vercel.app/.well-known/oauth-authorization-server`
  and `curl -s -X POST https://dynastyedge-mcp.vercel.app/api/oauth/token -d
  grant_type=refresh_token&refresh_token=x`.
- Routines: code.claude.com/docs/en/routines (connectors, usage and limits,
  "green status" note); the routine tool's own `notifications` schema; the
  June 2026 public report "Routine doesn't have access to PushNotification
  tool".
- Dry-run routine `trig_017VyE9DHWLCj25F6zehXGvV`: created 18:25:16Z with
  notifications off, fired 18:25:19Z (session `cse_01FAXzfEYL8RtTxVHeXvsbBr`),
  read, **deleted** the same minute. Nothing notified you.
