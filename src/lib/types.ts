// Shared data contract between sim, analysis and UI.
// Extend freely; renaming or removing fields breaks teammates — flag it in your PR.
// Units live in field names (Kg, Days, Km). Sim time is a day index from mission start (day 0).

/** Calendar date as 'YYYY-MM-DD' (UTC). See dates.ts for helpers. */
export type IsoDate = string

export type Destination = 'mars' | 'moon'

/** Resources tracked per day. 'spares' is the total spare-part count across all components. */
export type ResourceKey = 'o2' | 'water' | 'food' | 'spares'
export const RESOURCE_KEYS: readonly ResourceKey[] = ['o2', 'water', 'food', 'spares']

/** Resources measured in kg that the crew consumes; running out of one ends the mission. */
export type ConsumableKey = Exclude<ResourceKey, 'spares'>
export const CONSUMABLE_KEYS: readonly ConsumableKey[] = ['o2', 'water', 'food']

/** Life-support hardware that can fail (MTBF) and needs spares to repair. */
export type ComponentKey = 'waterRecycler' | 'o2Generator' | 'co2Scrubber' | 'greenhouse'
export const COMPONENT_KEYS: readonly ComponentKey[] = [
  'waterRecycler',
  'o2Generator',
  'co2Scrubber',
  'greenhouse',
]

/** How real a technology is today; shown as a badge so judges see what's proven. */
export type ReadinessTier = 'flightProven' | 'demonstrated' | 'concept'

/** Reliability and logistics for one life-support component (values in data.ts). */
export type ComponentSpec = {
  label: string
  /** Mean time between failures. Daily failure probability = 1 / mtbfDays. */
  mtbfDays: number
  /** Launch mass of one spare (the ORUs most likely to fail). */
  spareMassKg: number
  /** Days the component is offline while a crew swaps in a spare. */
  repairDays: number
  readiness: ReadinessTier
}

/** Display facts for the destination toggle. GEA-12 folds these into a full DestinationProfile. */
export type DestinationFacts = {
  label: string
  /** One-way Earth ↔ destination light time, seconds (closest and farthest). */
  commsDelaySec: { min: number; max: number }
  /** Days between cargo launch opportunities; 0 means any day. */
  resupplyEveryDays: number
  /** What 'isru' means at this destination, and how proven it is. */
  isru: { label: string; readiness: ReadinessTier }
}

// ---------- Mission plan (inputs) ----------

export type CrewMember = {
  id: string
  name: string
  sex: 'female' | 'male'
  ageYears: number
  massKg: number
  activity: 'light' | 'moderate' | 'heavy'
  exerciseMinPerDay: number
}

/**
 * 'electrolysis' splits recycled water; 'isru' makes O₂ locally (MOXIE-style on Mars,
 * regolith extraction on the Moon — resolved by the destination profile); 'tanks' = shipped only.
 */
export type O2Source = 'electrolysis' | 'isru' | 'tanks'

export type LifeSupportConfig = {
  /** Fraction of used water recovered, 0–1 (ISS achieved ~0.98 in 2023). */
  waterRecoveryRate: number
  o2Source: O2Source
  greenhouse: { enabled: boolean; areaM2: number }
}

/**
 * One cargo launch. Arrival date and capacity are derived from the transfer table
 * (transferFor(destination, launchDate)), never stored here.
 * Flights arriving on or before the mission start date form the initial stock.
 */
export type CargoFlight = {
  id: string
  label: string
  launchDate: IsoDate
  consumablesKg: Record<ConsumableKey, number>
  spares: Record<ComponentKey, number>
}

export type MissionPlan = {
  name: string
  destination: Destination
  /** Day 0: crew arrives and the clock starts. */
  startDate: IsoDate
  durationDays: number
  crew: CrewMember[]
  lifeSupport: LifeSupportConfig
  flights: CargoFlight[]
  /** Vehicle payload at the best launch date; a flight's limit = this × its payloadFactor. */
  baseVehiclePayloadKg: number
}

export type RunOptions = {
  runs: number
  seed: number
}

// ---------- Launch timing (GEA-38 / GEA-39) ----------

export type Transfer = {
  launchDate: IsoDate
  transitDays: number
  arrivalDate: IsoDate
  /** Launch energy, km²/s². */
  c3: number
  /** Hyperbolic excess speed at arrival, km/s (what aerocapture/EDL must absorb). */
  vInfArrival: number
  /** Share of baseVehiclePayloadKg deliverable when launching on this date, 0–1. */
  payloadFactor: number
  distanceKmAtLaunch: number
}

export type LaunchWindow = {
  open: IsoDate
  close: IsoDate
  bestDate: IsoDate
}

// ---------- Simulation output ----------

/** Why a run failed. The root cause names the offline component when one was involved. */
export type FailureCause =
  | {
      kind: 'stockout'
      resource: ConsumableKey
      day: number
      /** Component that was offline with no spares when the stock ran out, if any. */
      offlineComponent?: ComponentKey
    }
  | {
      kind: 'crewUnfit'
      day: number
      crewId: string
      /** Main driver, e.g. 'vitaminC' or 'boneDensity' (Crew Diet & Health). */
      driver?: string
    }

export type ComponentEvent = {
  day: number
  component: ComponentKey
  type: 'failed' | 'repaired'
  /** For 'failed': whether a spare was available to start the repair. */
  spareUsed?: boolean
}

/** Result of one simulated mission (runOnce). */
export type RunResult = {
  survived: boolean
  failure?: FailureCause
  /** Stock level per day, index = day. kg for consumables, count for spares. */
  stocks: Record<ResourceKey, number[]>
  componentEvents: ComponentEvent[]
}

/** Percentiles across runs, index = day. */
export type Band = {
  p10: number[]
  p50: number[]
  p90: number[]
}

export type CargoArrival = {
  flightId: string
  launchDate: IsoDate
  arrivalDate: IsoDate
  /** Day index relative to mission start; ≤ 0 means part of the initial stock. */
  arrivalDay: number
}

/** Aggregate of many runs (runMission). */
export type SimResult = {
  runs: number
  seed: number
  /** Fraction of runs where the crew survived, 0–1. */
  survivalRate: number
  durationDays: number
  bands: Record<ResourceKey, Band>
  /** One entry per failed run. */
  failures: FailureCause[]
  arrivals: CargoArrival[]
  totalLaunchMassKg: number
  /** Health score (0–100) band per crew member id. Present once Crew Diet & Health lands. */
  crewHealth?: Record<string, Band>
}
