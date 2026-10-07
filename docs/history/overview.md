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


