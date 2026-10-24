# Ares Supply: Mission Survival Planner

> Will this crew survive, and what should we change so they do?

A mission-planning tool that treats off-Earth life support as a supply chain. Set up a Mars or Moon mission (crew, life support, cargo manifests for each launch window), run 1,000 Monte Carlo simulations with real NASA numbers, and get a survival percentage, the weakest link, and a suggested fix.

Built for Geaux Hack. Tickets live in Linear (team **GEA**).

**Live:** https://mars-supply-sim.vercel.app/

## Stack

- **Vite + React 19 + TypeScript**
- **ECharts** (tree-shaken, see `src/components/EChart.tsx`)
- **Plain CSS** with custom properties (`src/styles/theme.css`)
- **Vitest** for sim tests, **Prettier** for formatting, **oxlint** for linting
- **Vercel** for hosting, auto-deploying from `main`. Everything runs client-side with no backend.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command          | What it does                                    |
| ---------------- | ----------------------------------------------- |
| `npm run dev`    | Dev server with hot reload                      |
| `npm run build`  | Typecheck + production build to `dist/`         |
| `npm test`       | Run Vitest once (`npm run test:watch` to watch) |
| `npm run lint`   | oxlint                                          |
| `npm run format` | Prettier, writes changes                        |

## Project layout

```
src/
  lib/            # pure TypeScript, no React or DOM; testable in Node
    types.ts      # shared data contract (MissionPlan, SimResult, …)
    data.ts       # every real-world number, each with a // Source: comment
    sim.ts        # simulation engine + Monte Carlo runner
    analysis.ts   # weakest link, suggested fix, plan comparison
    rng.ts        # seedable PRNG so demo numbers are reproducible
  components/     # React components
  styles/         # theme tokens + global CSS
  cache/          # API data fetched once by scripts/ and committed as JSON
scripts/          # one-off fetch scripts (NASA DONKI, TechPort, USDA FDC)
```

**Rule:** `src/lib/` never imports React or touches the DOM. UI code calls the sim; the sim never calls the UI.

## API keys

Only the fetch scripts in `scripts/` use API keys; the app itself never calls an API at runtime. Copy `.env.example` to `.env` and add a free key from [api.nasa.gov](https://api.nasa.gov). The same key works for USDA FoodData Central.

## Team workflow

Full workflow and rules (also read by Claude Code): see [CLAUDE.md](CLAUDE.md).

- Branch per ticket: use Linear's branch name (e.g. `josephrebert05/gea-14-daily-resource-model`)
- Open a PR into `main`. Vercel posts a preview URL on every PR
- Merging to `main` deploys to production

## Data sources

See comments in `src/lib/data.ts`. Main sources: NASA BVAD, ISS ECLSS, MOXIE (Perseverance), ISS Veggie/APH, Kilopower, NASA TechPort, NASA DONKI, USDA FoodData Central.
