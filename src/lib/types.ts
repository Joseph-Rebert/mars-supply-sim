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

// ---------- Mission plan (inputs) ----------

export type CrewMember = {
  id: string
  name: string
  sex: 'female' | 'male'
  ageYears: number
  massKg: number
  activity: ActivityLevel
  exerciseMinPerDay: number
  /** Standing height. With it the crew member has a full profile and gets personal daily needs. */
  heightM?: number
}

export type ActivityLevel = 'light' | 'moderate' | 'heavy'

/** One crew member's daily requirements (Crew Diet & Health). */
export type DailyNeeds = {
  energyKcal: number
  proteinG: number
  vitaminCMg: number
  vitaminDUg: number
  calciumMg: number
  potassiumMg: number
  /** Food mass that supplies energyKcal at the BVAD food energy density (no packaging). */
  foodKg: number
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
  /** Override component reliability (tests, what-ifs). Defaults to COMPONENTS in data.ts. */
  components?: Record<ComponentKey, ComponentSpec>
}

// ---------- Destination (GEA-12) ----------

/**
 * How cargo gets there. 'table': read the offline-built transfer table for this destination (Mars);
 * 'fixed': same transit and payload any day (Moon).
 */
export type TransferModel =
  | { kind: 'table' }
  | {
      kind: 'fixed'
      transitDays: number
      c3: number
      vInfArrival: number
      distanceKm: number
      /** Days between default cargo flights; there are no windows to snap to. */
      resupplyCadenceDays: number
    }

/** Everything that differs between Mars and the Moon. The sim reads this; it never checks the name. */
export type DestinationProfile = {
  label: string
  transfer: TransferModel
  /** Default MissionPlan.baseVehiclePayloadKg: payload at a best-window launch. */
  baseVehiclePayloadKg: number
  /** Max O₂ the local 'isru' source makes per day; production is capped here, not just sized to demand. */
  isruO2KgPerDay: number
  isruLabel: string
  isruReadiness: ReadinessTier
  /** Surface gravity in Earth g (body health model). */
  gravityG: number
  /** One-way light time to Earth, seconds. Display only. */
  commsDelaySeconds: { min: number; max: number }
  /** Share of nominal greenhouse output achieved, 0–1 (e.g. lunar night without power to light crops). */
  greenhouseOutputFactor: number
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
      /** Component that supplies this resource and was offline when the stock ran out, if any. */
      offlineComponent?: ComponentKey
      /** True when that component was waiting for a spare (none in stock), not just mid-repair. */
      awaitingSpare?: boolean
    }
  | {
      /** A component with no stock to drain (the CO₂ scrubber) stayed down past its grace period. */
      kind: 'systemDown'
      component: ComponentKey
      day: number
    }
  | {
      kind: 'crewUnfit'
      day: number
      crewId: string
      /** Main driver: 'boneLoss', 'scurvy' or 'bodyMass' (GEA-23); GEA-32 may add nutrition drivers. */
      driver?: string
    }

export type ComponentEvent = {
  day: number
  component: ComponentKey
  type: 'failed' | 'repaired'
  /** For 'failed': whether a spare was available to start the repair. */
  spareUsed?: boolean
}

/** Nutrients compared against each crew member's DailyNeeds (Crew Diet & Health). */
export type NutrientKey =
  'energyKcal' | 'proteinG' | 'vitaminCMg' | 'vitaminDUg' | 'calciumMg' | 'potassiumMg'
export const NUTRIENT_KEYS: readonly NutrientKey[] = [
  'energyKcal',
  'proteinG',
  'vitaminCMg',
  'vitaminDUg',
  'calciumMg',
  'potassiumMg',
]

/** One crew member's shortfall for one nutrient over a run. */
export type NutrientTally = {
  /** Sum of daily (need − intake) on short days, in the nutrient's unit. */
  deficit: number
  daysShort: number
  firstShortDay: number | null
}

/** Result of one simulated mission (runOnce). */
export type RunResult = {
  survived: boolean
  failure?: FailureCause
  /** Stock level per day, index = day. kg for consumables, count for spares. */
  stocks: Record<ResourceKey, number[]>
  componentEvents: ComponentEvent[]
  /** Per crew member id; present when every crew member has a full profile (GEA-17). */
  nutrition?: Record<string, Record<NutrientKey, NutrientTally>>
  /** Health score 0–100 per crew member id, one value every HEALTH_BAND_STEP_DAYS days (sim.ts). */
  healthScore?: Record<string, Float64Array>
  /** Body state at the end of the run (or at failure) per crew member id. */
  body?: Record<string, BodyState>
}

/** One crew member's body at a point in the mission (GEA-23). */
export type BodyState = {
  /** Hip/spine bone mineral density lost, % of pre-mission. */
  boneLossPct: number
  muscleLossPct: number
  massLossPct: number
  vitaminCPoolMg: number
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
