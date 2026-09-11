# The AI-slop checklist (researched 2026-09-11)

Sourced live, not from memory. Round-1 directions A and C are scored against it
honestly at the bottom — both fail.

Sources: [dev.to — fixing the AI-generated look](https://dev.to/alanwest/how-to-fix-the-ai-generated-look-in-your-frontend-1ahh) ·
[Sailop — AI Slop Encyclopedia](https://www.sailop.com/blog/ai-slop-encyclopedia) ·
[925 Studios — AI slop design tells](https://www.925studios.co/blog/ai-slop-design-tells) ·
[Why your AI keeps building the same purple gradient website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)

## The markers, by category

**Color**
- Tailwind `blue-600` / `indigo-500` / violet as the accent (~34% of AI sites use #2563EB)
- Blue-to-purple gradients, `bg-gradient-to-r` default direction
- A single accent doing every job; no secondary hue 60°+ away
- Grays at zero saturation; `bg-white` everywhere; pure #000 text
- Beige/tinted ground + sans-serif — named specifically as a Claude Design giveaway
- No `::selection` styling

**Typography**
- **Inter** (in ~47% of sites), Roboto, Poppins, Space Grotesk as the "safe" face
- One typeface throughout; only weights 400 and 700
- Tailwind's default type scale; default line-height and letter-spacing
- No italic, ever; no `text-wrap: balance`

**Layout**
- Vertically stacked, full-width, centered sections
- `grid-cols-3`; three feature cards in a row; symmetrical grids only
- Uniform `py-20`/`py-24`; `gap-6` everywhere; `px-4` on every container
- Strict 4px grid with no optical/off-grid values
- Div soup instead of semantic tags

**Components**
- `rounded-2xl` / `rounded-3xl` on everything; `shadow-lg` on all cards
- **A thin colored accent rail down the left edge of a container** — called out as
  "one of the most specific visual tells in AI-generated interfaces"
- Identical cards in the icon + title + one-line-description pattern
- `rounded-full` pill buttons everywhere
- Orphaned stats rows
- **Lucide icons throughout**; thin-line generic icon sets

**Animation**
- Fade-up entrance on everything
- Linear stagger delays (0 / 100 / 200ms)
- `duration-300` universally; `ease-in-out` on everything
- `animate-pulse` for loading; no custom `@keyframes`
- `backdrop-blur-md` sticky nav
- No `:active` feedback; `transition-all`

**Copy**
- Em-dash overuse; "Empower / Unlock / Transform / Seamless"; lists of exactly five
- "Get Started" CTAs; abstract feature titles

## Round 1, scored honestly

| Marker | Direction A | Direction C | **The shipped app** |
|---|---|---|---|
| Rounded cards + shadow on everything | ❌ 14px + shadow | ❌ 20–26px glass | ✅ `rounded-none` |
| Thin colored left accent rail | ❌ briefing cards | — | ❌ `Card`'s `accent` prop, Action Items, briefing items |
| Lucide / thin-line icon set | ❌ | ❌ | ❌ ships lucide |
| Blue-purple gradient | — | ❌ teal→violet field | ✅ |
| Single accent on neutral | ❌ cyan | ❌ | ❌ silver |
| Fade-up entrance | ❌ | ❌ | ❌ `edge-rise` |
| Linear stagger | ❌ 52ms linear | ❌ 62ms linear | — |
| `backdrop-blur` sticky nav | ❌ | ❌ | ❌ header (pre-2026-07) |
| Identical icon+title+one-liner cards | ❌ | ❌ | ❌ briefing items |
| Inter / Space Grotesk | ✅ Archivo | ❌ Space Grotesk | ✅ |
| No italic, no `text-wrap: balance` | ❌ | ❌ | ❌ |
| Styled `::selection` | ❌ | ❌ | ❌ |

**Verdict:** A failed 10 of 12, C failed 11 of 12. The owner's read was correct.
Round-1 B failed 2 (no `::selection`, some linear stagger) — which is why it was
the one that didn't read as generated.

**Note on the shipped app:** it fails 8 of 12. The left-edge accent rail — the
single most-cited tell — is a *documented primitive* in the design system
(`Card`'s `accent` prop) and appears on Action Items, Edge briefing items and the
Roster Analysis shortcut.

## Round-2 rules (applied to all three new directions)

1. Radius `0` throughout; separation by rule, border and contrast — never shadow.
2. No icon rails, no medallions, no lucide. Navigation is **text**.
3. Two faces minimum, neither on the default list; weights 300–800; italic used;
   `text-wrap: balance`; custom scale on a 1.25 ratio.
4. Asymmetric grids (marginalia rails, 2fr/1fr splits) — never a centered stack of
   equal cards.
5. Varied density: dense tables where there are 26 rows, open space where there
   is one decision.
6. Custom easing `cubic-bezier(.16,1,.3,1)`, duration scaled to element size,
   **jittered** stagger, entrances that are clip/wipe/set — never fade-up.
7. Two hues minimum, the secondary 60°+ from the primary; grays carry the
   ground's hue; `::selection` styled.
8. Semantic `<nav> <header> <main> <article> <aside>`; visible `:focus-visible`.
