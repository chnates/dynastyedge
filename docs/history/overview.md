# History — What This App Is

> **Verbatim text of this CLAUDE.md section as it stood at `8c25d03` (2026-10-07), before CLEANUP-2 slimmed it.**
> Nothing here was edited. The live rules, contracts and traps are in CLAUDE.md; this file keeps the
> measurements, dated rulings and narratives that explain them. When the two disagree, CLAUDE.md is current.

## What This App Is

**DynastyEdge** is a personal dynasty fantasy football web app built for one user
(chnates / Nix Cage) playing in a 10-team Superflex Half PPR dynasty league on Sleeper.

It connects to two free public APIs — Sleeper and FantasyCalc — to deliver
competitive intelligence that isn’t available in the Sleeper app itself:
dynasty trade values layered onto live roster data, trade partner recommendations,
lineup optimization with matchup context, and a full league-wide competitive landscape.

**Target device:** iPhone Safari (390px width — iPhone 15 Pro)
**Hosting:** GitHub Pages (static site, no backend, no server)
**Live URL:** <https://chnates.github.io/dynastyedge/>

> **AMENDMENT (2026-09-19) — "no backend" now means "the APP has no backend".**
> The repo also contains **`mcp/`**, a Model Context Protocol server that lets
> the owner ask the same questions from the Claude apps. It is a real server
> process, so the old blanket phrasing above is no longer literally true and is
> corrected here rather than quietly contradicted.
>
> What is unchanged, and what the rule was always protecting:
> **the web app at the URL above is still a pure static site.** It has no
> backend, calls no server of ours, and the MCP server is not in its bundle
> (verified byte-identical, 995,441 bytes, when the SDK was added). Nothing in
> `src/` imports anything from `mcp/`; the dependency runs one way only.
>
> The constraint chain that produced the rule — one user, $0, zero ops,
> therefore static hosting, therefore free unauthenticated APIs and GitHub
> Actions as the "server" — still governs every decision inside `src/`. A
> feature may **not** grow a backend. See **The MCP Server** below.

-----


## Tech Stack

|Layer     |Tool            |Notes                              |
|----------|----------------|-----------------------------------|
|Framework |React (via Vite)|Functional components + hooks only |
|Styling   |Tailwind CSS    |Dark mode default, mobile-first    |
|Navigation|React Router v7 |Side drawer menu, 6 sections       |
|Build tool|Vite            |Outputs to `dist/` for GitHub Pages|
|Deployment|GitHub Pages    |Auto-deploys via GitHub Actions    |
|CI/CD     |GitHub Actions  |Every push to `main`: lint + test, then deploy|
|MCP server|`@modelcontextprotocol/sdk` (Node)|`mcp/`, stdio — **not** part of the web bundle|

### Non-negotiable rules

- Always use **functional React components with hooks**. Never class components.
- All API calls live in **custom hooks** (`/src/hooks/`) or utility files. Never call APIs directly inside a component render.
- **Mobile-first always.** Every component must look correct at 390px before anything else.
- **FantasyCalc data is fetched once per app load and cached in memory.** Never re-fetch on every render — it is a large response. The app silently refetches when the tab regains focus with data older than 30 minutes (stale-while-revalidate: cached data stays on screen during the refresh).
- **All fetches go through `src/utils/fetchJSON.js`** — it adds a hard timeout via AbortController so a hung API can never leave the app on a permanent spinner. Never call raw `fetch()` in a hook.
- **Sleeper's full player DB (`/players/nfl`, ~5–8MB) is fetched at most once per session** via the shared `usePlayerDB` hook. Never fetch it anywhere else — rookie detection, injury statuses, unranked-player names, and lineup history all read from that one cache.
- **Never hardcode player names, values, or roster data.** Everything comes live from APIs.
- **Dark mode is the default.** The app ships in dark mode. A toggle is available to switch to light mode — store the preference in `localStorage`.

-----


