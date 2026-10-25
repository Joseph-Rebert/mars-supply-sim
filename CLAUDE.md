# CLAUDE.md

Instructions for Claude Code working in this repo. Read this file in full before starting any task.

## What we're building

**Res-Supply Chain: Mission Survival Planner.** A hackathon project (Geaux Hack) that treats off-Earth life support as a supply chain. It is a **mission-planning decision tool, not a game.**

It answers one question: **"Will this crew survive, and what should we change so they do?"**

Core loop (this is the demo):

1. **Set up a mission:** crew, duration, Mars or Moon, life support systems, a cargo manifest for each launch window under a mass limit
2. **Run:** 1,000 Monte Carlo simulations, day by day: consumption, recycling, local production, resupply, random equipment failures (MTBF + spares)
3. **Verdict:** a large survival % plus resource timelines with P10–P90 bands
4. **Weakest link:** what kills the crew and when ("water recycler spares run out around month 19")
5. **Fix and compare:** apply the suggested fix, rerun, and compare plans side by side

Demo story for an 8-minute presentation: a reasonable-looking plan survives about 60% → reveal why → apply the fix live → above 90%.

Judges weight **impact/usefulness** and **presentation/design** most. Real, sourced data is our credibility.

**Out of scope:** 3D graphics, user accounts, any backend or database, live API calls at runtime, more than about 5 resources.

## Stack

- Vite + React 19 + TypeScript
- ECharts for all charts. Use the wrapper `src/components/EChart.tsx` and register new chart types there
- Plain CSS with custom properties in `src/styles/theme.css`. No CSS frameworks
- Vitest, Prettier, oxlint
- Vercel auto-deploys `main` to https://mars-supply-sim.vercel.app/; each PR gets a preview URL
- Everything runs client-side

## Commands

```bash
npm install
npm run dev           # http://localhost:5173
npm test              # vitest run
npm run lint          # oxlint
npm run format        # prettier --write .
npm run format:check
npm run build         # tsc -b && vite build (this is also the typecheck)
```

**Checks to run before every push**, all of which must pass:

```bash
npm run format && npm run lint && npm test && npm run build
```

## Project layout

```
src/
  lib/            # pure TypeScript: NO React, NO DOM, NO fetch. Runs in Node/Vitest.
    types.ts      # shared data contract (MissionPlan, SimResult, …), see GEA-9
    data.ts       # every real-world number, each with a source comment
    sim.ts        # daily model, failures, resupply, Monte Carlo runner
    analysis.ts   # weakest link, suggested fix, plan comparison, ship-vs-make
    rng.ts        # seedable PRNG (mulberry32)
    *.test.ts     # Vitest tests, next to the code they test
  components/     # React components (UI only; calls into lib/)
  styles/         # theme.css: all color/spacing/type tokens
  cache/          # API data fetched once by scripts/ and committed as JSON
scripts/          # one-off fetch scripts (DONKI, TechPort, USDA FDC), run with `npx tsx`
```

## Architecture rules

1. **`src/lib/` is pure.** It never imports React, never touches `window` or `document`, and never makes network calls. Inputs → outputs, so the sim can be tested from the console and Vitest.
2. **`types.ts` is the contract.** Extend types freely, but don't rename or remove fields others depend on without telling the team (mention it in the PR description).
3. **All randomness goes through `rng.ts`.** Never call `Math.random()` in sim code. The same seed must give identical results so demo numbers are stable.
4. **No runtime API calls.** External data (NASA DONKI, TechPort, USDA FoodData Central) is fetched by `scripts/`, saved to `src/cache/*.json`, and committed. The app imports the JSON.
5. **Mars vs. Moon is data, not code.** The sim reads a `DestinationProfile`; don't write `if (destination === 'mars')` branches in sim logic.
6. **UI never re-implements sim math.** Components call `lib/` functions and render the results.
7. **No hard-coded colors in components.** Use CSS variables from `theme.css`. For ECharts, read them with `getComputedStyle` or use the shared resource color constants.
8. **Performance budget:** 1,000 runs of a 900-day mission in under 1 s. If the UI stutters, move the sim into a Web Worker (GEA-31); don't cut the run count.

## Data rules (judges will ask where numbers come from)

- Every real-world constant in `data.ts` has a `// Source:` comment with a URL or document name (NASA BVAD, ISS ECLSS, MOXIE, Veggie/APH, Kilopower, TechPort, etc.).
- Extrapolated or assumed values are marked `// ASSUMPTION:` with a one-line reason. Example: bone loss under partial gravity (0.38 g / 0.16 g) has never been measured, so it is extrapolated from ISS data.
- Never invent a number and present it as sourced. If you can't find a source, use a clearly labeled `ASSUMPTION` and say so in the PR.
- Units go in names or comments (`o2KgPerCrewDay`, `massKg`, `mtbfDays`).

## Code style

- Prettier settings: no semicolons, single quotes, trailing commas, 100-character lines. Run `npm run format`; don't hand-format.
- TypeScript strict. Avoid `any`; use `unknown` and narrow it.
- Function components and hooks only. Keep state in the nearest common parent; no state library unless the team agrees.
- Name files after what they export (`CrewCard.tsx`, `weakestLink` in `analysis.ts`).
- Comments explain _why_ or cite a source; don't narrate _what_ the code does.
- Tests: any non-trivial logic in `src/lib/` gets a Vitest test. Prefer hand-calculated expected values.
- Don't add npm dependencies without a clear reason, and mention them in the PR.

## Linear

Tickets live in Linear, team **Geaux Hack** (key `GEA`), and are read and updated through the Linear MCP server.

| Project            | What's in it                                                         |
| ------------------ | -------------------------------------------------------------------- |
| Infra & Deploy     | Repo, Vercel                                                         |
| Data & Sources     | `data.ts`, Mars/Moon profiles, fetch scripts                         |
| Simulation Engine  | Types, daily model, failures, resupply, Monte Carlo, tests           |
| Analysis & Fixes   | Weakest link, suggested fix, comparison, ship-vs-make                |
| Mission UI         | Theme, setup form, manifest, results, callout                        |
| Crew Diet & Health | Nutrition, body health, crew cards (start after the core loop works) |
| Polish & Pitch     | Presets, deck, polish, rehearsal                                     |

- **Priority:** Urgent = needed for the demo, High = should-have, Low = stretch (in Backlog).
- **Labels:** `infra`, `data`, `sim`, `analysis`, `ui`, `diet`, `pitch`.
- **Statuses:** Backlog → Todo → In Progress → Done.
- Each ticket has **Goal / Scope / Acceptance criteria / Notes**. The acceptance criteria are the definition of done.
- Blocking relations are set in Linear. **Never start a ticket whose blockers aren't Done.**

## Workflow: how to pick up and ship a ticket

Follow these steps in order. If the user names a specific ticket (e.g. "do GEA-14"), skip to step 3 but still check its blockers.

### 1. Sync

```bash
git checkout main
git pull
git status          # must be clean; if not, stop and ask the user
npm install         # in case dependencies changed
```

### 2. Pick a ticket from Linear

Use the Linear MCP tools (named `list_issues`, `get_issue`, `save_issue`, `save_comment`, possibly with a server prefix such as `mcp__claude_ai_Linear__` or `mcp__linear__`):

1. List team `GEA` issues with status **Todo**.
2. For each candidate, check its blockers with `get_issue`. Only keep tickets where **every blocker is Done**.
3. Skip anything **In Progress** or assigned to someone else, because a teammate is working on it.
4. Rank what's left by: **priority** (Urgent > High > Low) → **how many tickets it unblocks** → **lowest GEA number**.
5. Don't pick Crew Diet & Health tickets until the core loop (GEA-22, GEA-25, GEA-27, GEA-30) is Done, unless the user asks.
6. **Show the user the top 1–3 options with a one-line reason each, and wait for their choice.** Never claim a ticket without confirmation.

### 3. Claim it

Using `save_issue`: set the status to **In Progress** and the assignee to `me`. This tells teammates (and their Claude sessions) it's taken.

### 4. Branch

Use the ticket's `gitBranchName` from Linear exactly, so Linear links the branch and PR automatically:

```bash
git checkout -b <gitBranchName>    # e.g. josephrebert05/gea-14-daily-resource-model-consume-recycle-produce
```

### 5. Build it

- Read the whole ticket first: Goal, Scope, **Acceptance criteria**, Notes. Also read the tickets it blocks, so the interface you build fits what comes next.
- Stay in scope. If you find needed work outside the ticket, note it for the user (and suggest a new Linear ticket); don't silently expand the change.
- Commit in small logical steps. Message format: `GEA-14: Add daily O₂/water/food consumption`.
- If something is unclear or the ticket seems wrong, **ask the user**; don't guess on things that change the demo numbers.

### 6. Verify, and do not push until this passes

```bash
npm run format && npm run lint && npm test && npm run build
```

- All four must pass. If any fails, fix the cause and rerun. **Never** skip or delete tests, add `.skip`, use `--no-verify`, or loosen types to make checks pass.
- Add or update tests for any new `src/lib/` logic.
- For UI changes, run `npm run dev` and check the change works in the browser (including at 1280×720).
- Go through every acceptance-criteria checkbox and confirm each one is met. Report any you couldn't meet.

### 7. Push and open a PR

```bash
git push -u origin HEAD
gh pr create --title "GEA-14: <ticket title>" --body "<body>"
```

PR body:

```markdown
Fixes GEA-14

## What changed

- …

## Acceptance criteria

- [x] …
- [ ] … (explain if not met)

## Notes for teammates

- Type changes, new dependencies, assumptions made, follow-up tickets suggested
```

`Fixes GEA-14` lets Linear move the ticket to Done when the PR merges.

### 8. Update Linear and hand off

- Comment on the ticket (`save_comment`) with the PR link and a two-line summary.
- Tell the user: the PR URL, the Vercel preview URL once it appears, what you verified, and anything left open.
- **Don't merge the PR yourself unless the user tells you to.** When they do: `gh pr merge --squash --delete-branch`, then `git checkout main && git pull`.

### If the work runs long

Hackathon branches should live for hours, not days. If `main` has moved on, run `git fetch && git merge origin/main` (not a rebase) on your branch, rerun the step 6 checks, and push.

## Never

- Push directly to `main` (except a one-line hotfix the user explicitly asks for)
- Force-push a shared branch
- Commit `.env`, API keys, or tokens. Keys go in `.env`, which is ignored by git; see `.env.example`
- Add a backend, a database, auth, or runtime API calls
- Change ticket scope, priority, or other people's tickets in Linear without asking
- Mark a ticket Done when acceptance criteria aren't met

## Demo freeze

About **2 hours before presenting**, `main` freezes: only demo-critical fixes, each confirmed with the team. The Vercel URL we rehearse on is the one we present.

## Setup for new teammates

1. Get added as a collaborator on `github.com/Joseph-Rebert/res-supply-chain` and accept the invite.
2. `gh auth login`, then `git clone https://github.com/Joseph-Rebert/res-supply-chain.git && cd res-supply-chain && npm install`
3. Connect Linear in Claude Code. Either:
   - enable the **Linear** connector in your claude.ai account settings and run `/mcp` in Claude Code to authenticate, or
   - `claude mcp add --transport http linear https://mcp.linear.app/mcp`, then `/mcp` to log in.

   You need to be a member of the **Geaux Hack** Linear workspace.

4. Optional (for fetch scripts only): `cp .env.example .env` and add a free key from https://api.nasa.gov.
5. Start Claude Code in the repo and say **"pick up the next ticket"**.
