# Res-Supply Chain: Mission Survival Planner

> Will this crew survive, and what should we change so they do?

A mission-planning tool that treats off-Earth life support as a supply chain. Pick a Mars or Moon mission, and Res-Supply Chain runs 1,000 day-by-day simulations with real NASA numbers. It tells you how likely the crew is to survive, then finds the cheapest change that gets them to safety and applies it in one click.

Built for Geaux Hack. Tickets live in Linear (team **GEA**).

**Live:** https://mars-supply-sim.vercel.app/

## What's on the page

| Section                  | What it shows                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Fix it** button        | The best fix found for this plan, e.g. "57% → 99.5% survive". One click applies it and reruns            |
| **Trip**                 | Earth, Mars and every cargo rocket on its real transfer path, with a date slider and Play                |
| **Supplies graph**       | Water, oxygen, food, spare parts and rover fuel over the mission: a typical run and an unlucky one       |
| **Shipments**            | One card per rocket: dates, how full it is, what's on it, and a tag if it lands too late or is too heavy |
| **Cost breakdown**       | Launch cost split across what each rocket carries, plus equipment prices                                 |
| **Mission setup**        | Destination, crew, duration, water recycling, oxygen source, greenhouse                                  |
| **Stats strip** (bottom) | Survival %, launch mass, launches, launch cost, destination, comms delay, duration, runs                 |

**Start new mission** opens a wizard that asks who's going, where, and for how long, then packs the cheapest plan that reaches the survival target. The **Mission** menu switches between the example missions and ones you've saved.

## How it works

- **Daily model:** each day the crew uses oxygen, water and food (NASA BVAD rates), the recycler and oxygen maker recover what they can (ISS ECLSS, MOXIE), and a greenhouse can grow food.
- **Failures:** every machine can break at random based on its MTBF. A spare part fixes it; with none left, that supply starts running down.
- **Resupply:** each rocket follows a real Earth→Mars transfer computed from NASA/JPL Horizons planet positions, and its cargo lands on the day it arrives.
- **Monte Carlo:** 1,000 runs with a seeded random generator, so the same plan always gives the same numbers on stage.
- **Best fix:** a search (in a Web Worker, so the page stays responsive) tries more spares, earlier rockets, extra supplies or an extra launch, and picks the cheapest combination that reaches 90% survival. Each launch costs $178M.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command                | What it does                                            |
| ---------------------- | ------------------------------------------------------- |
| `npm run dev`          | Dev server with hot reload                              |
| `npm run build`        | Typecheck + production build to `dist/`                 |
| `npm test`             | Run Vitest once (`npm run test:watch` to watch)         |
| `npm run test:sanity`  | Sim sanity checks + perf (the numbers we show on stage) |
| `npm run lint`         | oxlint                                                  |
| `npm run format`       | Prettier, writes changes                                |
| `npm run format:check` | Prettier, checks only                                   |

Before every push: `npm run format && npm run lint && npm test && npm run build`.

## Stack

- **Vite + React 19 + TypeScript**
- **ECharts** for charts (tree-shaken, see `src/components/EChart.tsx`); the trip view is a plain canvas
- **Plain CSS** with custom properties (`src/styles/theme.css`)
- **Vitest**, **Prettier**, **oxlint**
- **Vercel** hosting, auto-deploying `main`; every PR gets a preview URL. Everything runs client-side, with no backend.

## Project layout

```
src/
  lib/              # pure TypeScript, no React or DOM; testable in Node
    types.ts        # shared data contract (MissionPlan, SimResult, …)
    data.ts         # every real-world number, each with a // Source: or // ASSUMPTION: comment
    sim.ts          # daily model, failures, resupply, Monte Carlo runner
    analysis.ts     # weakest link and suggested fixes
    optimize.ts     # cheapest plan that reaches a survival target (the wizard)
    supplyChain.ts  # rocket pipeline, order schedule, costs
    manifest.ts     # what's on each rocket and how full it is
    orbit.ts        # planet positions and transfer arcs for the trip view
    lambert.ts      # Lambert solver for Earth→Mars transfers
    transfers.ts    # precomputed launch windows and transit times
    diet.ts, health.ts, crew.ts  # nutrition and crew health
    presets.ts      # the example missions
    rng.ts          # seedable PRNG so demo numbers are reproducible
  workers/          # bestFix.worker.ts: the fix search, off the main thread
  components/       # React components (UI only; they call into lib/)
  styles/           # theme tokens + global CSS
  cache/            # API data fetched once by scripts/ and committed as JSON
scripts/            # one-off data builds, run with `npx tsx`
```

**Rule:** `src/lib/` never imports React or touches the DOM. UI code calls the sim; the sim never calls the UI.

## Refreshing the cached data

The app never calls an API at runtime. These scripts fetch data once and commit it to `src/cache/`:

| Script                       | Produces                   | Source                                 |
| ---------------------------- | -------------------------- | -------------------------------------- |
| `scripts/fetch-horizons.ts`  | `horizons-earth-mars.json` | NASA/JPL Horizons (daily Earth & Mars) |
| `scripts/build-transfers.ts` | `transfers-mars.json`      | Lambert solves on the Horizons data    |
| `scripts/fetch-usda.ts`      | `usda-foods.json`          | USDA FoodData Central                  |

Only `fetch-usda.ts` needs a key: copy `.env.example` to `.env` and add a free key from [api.nasa.gov](https://api.nasa.gov) (it works for FoodData Central too).

## Team workflow

Full workflow and rules (also read by Claude Code): see [CLAUDE.md](CLAUDE.md).

- Branch per ticket, using Linear's branch name (e.g. `josephrebert05/gea-14-daily-resource-model`)
- Open a PR into `main`; Vercel posts a preview URL on every PR
- Merging to `main` deploys to production

## Data sources

Every number lives in `src/lib/data.ts` with its citation. The main sources are:

- **NASA BVAD** (Baseline Values and Assumptions Document): crew oxygen, water and food use
- **ISS ECLSS**: water recovery and oxygen generation
- **MOXIE** (Perseverance): making oxygen on Mars
- **ISS Veggie / Advanced Plant Habitat**: greenhouse yields
- **Kilopower**: the power plant
- **NASA/JPL Horizons**: Earth and Mars positions
- **NASA Launch Services Program**: Falcon Heavy payload curve and launch price
- **USDA FoodData Central**: nutrients in the food mix

Values that have never been measured, such as bone loss in Mars gravity, are marked `ASSUMPTION` with the reason.
