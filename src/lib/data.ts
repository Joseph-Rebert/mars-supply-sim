// Every real-world number the sim uses lives here.
// Rule: each exported constant gets a `// Source:` comment (URL or document name);
// extrapolated or assumed values are marked `// ASSUMPTION:`.
// Primary reference is BVAD Rev2 (2022); values are not mixed with Rev1 (2018), which differs.

import type {
  ComponentKey,
  ComponentSpec,
  ConsumableKey,
  Destination,
  DestinationProfile,
  O2Source,
  ReadinessTier,
} from './types'

const BVAD = 'NASA BVAD Rev2, NASA/TP-2015-218570/REV2 (2022)'

// ---------- Crew consumption (per crew member per day) ----------

// Source: BVAD Rev2 Table 3-31 p.58, "Oxygen Consumed 0.895 kg/CM-d" (82 kg crew member, daily exercise).
export const O2_KG_PER_CREW_DAY = 0.895

// Source: BVAD Rev2 Table 3-31 p.58, "Carbon Dioxide Load 1.085 kg/CM-d".
export const CO2_KG_PER_CREW_DAY = 1.085

// Source: BVAD Rev2 Table 4-20 p.72, Early Planetary Base: 2.00 drinking + 0.50 food rehydration.
export const DRINKING_WATER_KG_PER_CREW_DAY = 2.5

// Source: BVAD Rev2 Table 4-20 p.72, Early Planetary Base "Total Hygiene" (incl. 1.08 shower).
export const HYGIENE_WATER_KG_PER_CREW_DAY = 1.98

// Source: BVAD Rev2 Table 4-20 p.72, Early Planetary Base "Total Water Consumption 4.48".
export const WATER_KG_PER_CREW_DAY = DRINKING_WATER_KG_PER_CREW_DAY + HYGIENE_WATER_KG_PER_CREW_DAY

// Source: BVAD Rev2 p.59: ship 2.39 kg/CM-d (Table 4-47, ISS max 6-month rate), of which 0.43 kg is packaging.
export const FOOD_SHIPPED_KG_PER_CREW_DAY = 2.39

// Source: BVAD Rev2 p.59, 2.39 kg shipped − 0.43 kg packaging = food mass per crew-day.
export const FOOD_KG_PER_CREW_DAY = 1.96

// Source: BVAD Rev2 Table 3-31 p.58, "Food Consumed; Energy Content 12.778 MJ/CM-d" (÷ 4.184 kJ/kcal).
export const FOOD_KCAL_PER_CREW_DAY = 3054

// Source: BVAD Rev2 (see the individual constants above). Stock units: kg of O₂, water, food.
export const CREW_NEEDS_KG_PER_CREW_DAY: Record<ConsumableKey, number> = {
  o2: O2_KG_PER_CREW_DAY,
  water: WATER_KG_PER_CREW_DAY,
  food: FOOD_KG_PER_CREW_DAY,
}

// ---------- ISS ECLSS performance ----------

// Source: NASA, "NASA Achieves Water Recovery Milestone on International Space Station" (2023-06-20),
// https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/
export const WATER_RECOVERY_RATE_ISS_2023 = 0.98

// Source: same NASA 2023 article: "Before the BPA, our total water recovery was between 93 and 94%".
export const WATER_RECOVERY_RATE_ISS_PRE_BPA = 0.93

// Source: Takada & Ghariani, ICES-2018-113, OGA design for exploration, p.3: "nominal rate of 5.4 kg/day … supports 4 crew",
// https://ntrs.nasa.gov/api/citations/20180006335/downloads/20180006335.pdf
export const OGA_O2_KG_PER_DAY_NOMINAL = 5.4

// Source: ICES-2018-113 p.3: "selectable rate between 2.3 and 9.2 kg/day".
export const OGA_O2_KG_PER_DAY_MAX = 9.2

// Source: electrolysis stoichiometry 2H₂O → 2H₂ + O₂; molar masses H₂O 18.015, O₂ 31.998 g/mol (IUPAC).
export const ELECTROLYSIS_WATER_KG_PER_KG_O2 = 18.015 / 15.999

// Source: El Sherif & Knox, SAE 2005-01-2892, "ISS CDRA Concepts and Advancements": "removes 6 person-equivalents",
// https://ntrs.nasa.gov/api/citations/20050210002/downloads/20050210002.pdf
export const CDRA_CREW_CAPACITY = 6

// Source: Green et al. (2017), NTRS 20170001404, p.1: Sabatier "overall theoretical oxygen recovery rate of 50%",
// https://ntrs.nasa.gov/api/citations/20170001404/downloads/20170001404.pdf
export const SABATIER_O2_RECOVERY_FRACTION_MAX = 0.5

// ---------- In-situ O₂ (MOXIE) ----------

// Source: Hecht et al. (2021), "Mars Oxygen ISRU Experiment (MOXIE)", Space Sci Rev 217:9: "at least 6 g/hr",
// https://hdl.handle.net/1721.1/131995
export const MOXIE_O2_G_PER_HR_NOMINAL = 6

// Source: NASA/JPL, "NASA's Oxygen-Generating Experiment MOXIE Completes Mars Mission" (2023-09-06): "12 grams of oxygen an hour",
// https://www.jpl.nasa.gov/news/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/
export const MOXIE_O2_G_PER_HR_PEAK = 12

// Source: same JPL 2023 article: "a total of 122 grams of oxygen" over 16 runs.
export const MOXIE_O2_TOTAL_G = 122

// Source: NASA Perseverance instruments page, MOXIE "Power: 300 watts",
// https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/
export const MOXIE_POWER_W = 300

// Source: Hoffman et al. (2022), Sci. Adv. 8:eabp8636: a MOXIE-like system scaled "several hundred times" makes
// "2 to 3 kg/hour", https://pmc.ncbi.nlm.nih.gov/articles/PMC9432831/
// ASSUMPTION: midpoint 2.5 kg/hr running 24 h/day; this is an extrapolation, never built.
export const MOXIE_SCALED_O2_KG_PER_DAY = 2.5 * 24

// Source: Paz et al., "Prototype Demonstration of Solar-Carbothermal System to Extract Oxygen from Regolith"
// (ASCEND 2026), pilot plant "1 metric ton of oxygen per year",
// https://ntrs.nasa.gov/api/citations/20260002864/downloads/CaRD_ASCEND%202026_rev1.pdf
// ASSUMPTION: concept-stage; Earth demo extracted only 0.195 g from lunar simulant.
export const LUNAR_REGOLITH_O2_KG_PER_DAY = 1000 / 365

// ---------- Greenhouse ----------

// Source: Massa et al., NTRS 20110015824: Veggie "provides 0.17 m² of crop growth area",
// https://ntrs.nasa.gov/api/citations/20110015824/downloads/20110015824.pdf
export const VEGGIE_AREA_M2 = 0.17

// Source: Romeyn et al., KSC NCERA-101 report (2017), Advanced Plant Habitat "(0.2 m2)",
// https://ntrs.nasa.gov/api/citations/20170003373/downloads/20170003373.pdf
export const APH_AREA_M2 = 0.2

// Source: R. Wheeler, "NASA's Contributions to Vertical Farming" (2020): "about 50 m2 would be required for food
// (dietary calories)" per person, https://ntrs.nasa.gov/citations/20205008832
export const GREENHOUSE_M2_PER_CREW_FOOD = 50

// Source: Wheeler (2020) 50 m²/person; BVAD Rev2 1.96 kg food/CM-d.
// ASSUMPTION: greenhouse output counted as kg of shipped-food equivalent, i.e. 1.96 kg ÷ 50 m².
export const GREENHOUSE_FOOD_KG_PER_M2_DAY = FOOD_KG_PER_CREW_DAY / GREENHOUSE_M2_PER_CREW_FOOD

// ---------- Power ----------

// Source: Gibson et al., "KRUSTY Nuclear Ground Test Results", NTRS 20180005435: completed March 21, 2018,
// 1 kWe test unit, design "scaled from 1 to 10 kWe", https://ntrs.nasa.gov/api/citations/20180005435/downloads/20180005435.pdf
export const KILOPOWER_KWE_MAX = 10

// Source: Briggs, Gibson & Sanzi, NASA/TM-2018-219702: "specific power ranging from 2.5 to 6.5 W/kg",
// https://ntrs.nasa.gov/api/citations/20180001487/downloads/20180001487.pdf
export const KILOPOWER_W_PER_KG_BEST = 6.5

// Source: 10 kWe ÷ 6.5 W/kg (Briggs et al. 2018).
// ASSUMPTION: derived, not a published unit mass.
export const KILOPOWER_10KWE_MASS_KG = (KILOPOWER_KWE_MAX * 1000) / KILOPOWER_W_PER_KG_BEST

// ---------- Component reliability ----------
// MTBF = 1 / Σ(1 / ORU MTBF) over the ORUs listed by H.W. Jones, "Cost-Effective High Reliability for Space Life
// Support Requires Using Storage", ICES-2019-11, Appendix A (from ISS MADS 2015 pre-flight estimates),
// https://ntrs.nasa.gov/api/citations/20190028339/downloads/20190028339.pdf
// Spare mass = failure-rate-weighted mean ORU mass (the spare you most likely need next).
// Caveat for the pitch: on-orbit, the UPA FCPA failed ~7.8× more often than its MADS estimate
// (Owens & de Weck, ICES-2018-198), so these MTBFs are optimistic.

// Source: Jones ICES-2019-11 Tables A.3–A.4 (UPA + WPA, 8 ORUs): MTBF 154.8 d, weighted spare 46.2 kg.
// ASSUMPTION: repair takes 1 day (ORU swap is hours of crew time; no published per-ORU repair time found).
const WATER_RECYCLER: ComponentSpec = {
  label: 'Water recycler',
  mtbfDays: 154.8,
  spareMassKg: 46.2,
  repairDays: 1,
  readiness: 'flightProven',
}

// Source: Jones ICES-2019-11 Table A.1 (OGA, 4 ORUs): MTBF 444.3 d, weighted spare 70.2 kg.
// ASSUMPTION: repair takes 1 day, as above.
const O2_GENERATOR: ComponentSpec = {
  label: 'O₂ generator',
  mtbfDays: 444.3,
  spareMassKg: 70.2,
  repairDays: 1,
  readiness: 'flightProven',
}

// Source: Jones ICES-2019-11 Table A.2 (CDRA, 4 ORUs): MTBF 987.4 d, weighted spare 27.8 kg.
// ASSUMPTION: repair takes 1 day, as above.
const CO2_SCRUBBER: ComponentSpec = {
  label: 'CO₂ scrubber',
  mtbfDays: 987.4,
  spareMassKg: 27.8,
  repairDays: 1,
  readiness: 'flightProven',
}

// ASSUMPTION: no flight reliability data exists for a food-producing greenhouse (concept-stage). MTBF 365 d,
// 20 kg spare (LED panel + nutrient pump), 2-day repair are placeholders in the range of the ECLSS ORUs above.
const GREENHOUSE: ComponentSpec = {
  label: 'Greenhouse',
  mtbfDays: 365,
  spareMassKg: 20,
  repairDays: 2,
  readiness: 'concept',
}

// Source: see the per-component comments above (Jones ICES-2019-11; greenhouse is an ASSUMPTION).
export const COMPONENTS: Record<ComponentKey, ComponentSpec> = {
  waterRecycler: WATER_RECYCLER,
  o2Generator: O2_GENERATOR,
  co2Scrubber: CO2_SCRUBBER,
  greenhouse: GREENHOUSE,
}

// ---------- Shipping overhead (container mass per kg of cargo) ----------

// Source: BVAD Rev2 p.59, 0.43 kg packaging per 1.96 kg food.
export const FOOD_PACKAGING_KG_PER_KG = 0.43 / 1.96

// Source: BVAD Rev2 Table 4-4 p.65, "Pressure Vessel (based on NORS tanks) … Oxygen 1.45" (Cook 2018).
export const O2_TANK_KG_PER_KG = 1.45

// ASSUMPTION: 0.10 kg per kg. Water ships unpressurized in soft bags; no tank fraction found in BVAD Rev1/Rev2.
export const WATER_CONTAINER_KG_PER_KG = 0.1

// Source: the three shipping constants above.
export const SHIPPING_OVERHEAD_KG_PER_KG: Record<ConsumableKey, number> = {
  o2: O2_TANK_KG_PER_KG,
  water: WATER_CONTAINER_KG_PER_KG,
  food: FOOD_PACKAGING_KG_PER_KG,
}

// ---------- Readiness tiers ----------

// Source: OGA electrolysis flies on ISS (ICES-2018-113); MOXIE demonstrated on Mars (JPL 2023); tanks fly on
// every ISS cargo run (BVAD Rev2 Table 4-4, NORS). 'isru' readiness per destination is in DESTINATION_PROFILES
// (lunar regolith O₂ is concept, Paz et al. 2026); this is the best case, Mars MOXIE.
export const O2_SOURCE_READINESS: Record<O2Source, ReadinessTier> = {
  electrolysis: 'flightProven',
  isru: 'demonstrated',
  tanks: 'flightProven',
}

// Source: KRUSTY ground test, March 2018 (Gibson et al., NTRS 20180005435); never flown.
export const KILOPOWER_READINESS: ReadinessTier = 'demonstrated'

// ---------- Launch & transfer (GEA-39) ----------

// Source: JPL Solar System Dynamics, Astrodynamic Parameters, GM of the Sun 1.32712440041e11 km³/s² (DE440),
// https://ssd.jpl.nasa.gov/astro_par.html
export const MU_SUN_KM3_PER_S2 = 1.32712440041e11

// Source: NASA Launch Services Program, Launch Vehicle Performance Planning Assessment, Falcon Heavy
// (Expendable), KSC, High Energy, 2020-03-28 (elvperf.ksc.nasa.gov). Table 1 gives 14,935 kg at C3 0.264;
// the other points are read off Figure 1 (±~150 kg). Cross-checks: 10,000 kg @ C3 20.6, 6,000 @ 44.5, 4,000 @ 61.0.
// Pairs are [C3 km²/s², separated spacecraft mass kg], ascending C3.
export const FALCON_HEAVY_EXPENDABLE_PAYLOAD_KG_BY_C3: readonly (readonly [number, number])[] = [
  [-2, 15500],
  [0.264, 14935],
  [5, 13600],
  [10, 12350],
  [15, 11150],
  [20, 10100],
  [25, 9100],
  [30, 8200],
  [35, 7400],
  [40, 6650],
  [45, 5900],
  [50, 5250],
  [60, 4100],
  [70, 3050],
  [80, 2200],
  [90, 1400],
  [100, 750],
]

// ASSUMPTION: Mars arrival v∞ ≤ 7 km/s. Upper end of entry speeds an aerocapture/EDL system is designed for;
// faster transfers are discarded even if their C3 is lower.
export const MARS_ARRIVAL_VINF_CAP_KM_S = 7

// ASSUMPTION: a launch window is any run of dates with payload factor ≥ 0.8 (tunable, per GEA-39).
export const LAUNCH_WINDOW_PAYLOAD_FACTOR_MIN = 0.8

// Source: NASA Moon Fact Sheet, semimajor axis 384,400 km, https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html
export const EARTH_MOON_DISTANCE_KM = 384_400

// Source: NASA Apollo 11 mission overview: launch July 16, lunar orbit insertion July 19, 1969 (~3 days),
// https://www.nasa.gov/mission/apollo-11/
export const MOON_TRANSIT_DAYS = 3

// ASSUMPTION: −2 km²/s², typical C3 of a direct trans-lunar injection (Earth escape is C3 = 0; the Moon is
// just short of it). Only shown for display; Moon payload factor is fixed at 1.
export const MOON_TRANSFER_C3_KM2_S2 = -2

// ASSUMPTION: 0.9 km/s arrival speed relative to the Moon, approximated by Apollo 11's lunar orbit insertion
// burn (LOI-1 Δv ≈ 889 m/s, Apollo 11 Mission Report, NASA MSC-00171). Display only.
export const MOON_ARRIVAL_VINF_KM_S = 0.9

// ASSUMPTION: one Moon cargo flight every 180 days for default manifests. The Moon has no launch windows and no
// published surface-base resupply schedule exists, so this is a planning placeholder, not a constraint.
export const MOON_RESUPPLY_CADENCE_DAYS = 180

// ---------- Destination profiles (GEA-12) ----------

// Source: standard gravity 9.80665 m/s² (BIPM SI Brochure, 9th ed.).
const G0_M_S2 = 9.80665

// Source: speed of light 299,792.458 km/s (BIPM SI Brochure, 9th ed., exact).
const C_KM_S = 299_792.458

// Source: NASA Mars Fact Sheet, surface gravity 3.71 m/s², https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
export const MARS_GRAVITY_G = 3.71 / G0_M_S2

// Source: NASA Moon Fact Sheet, surface gravity 1.62 m/s², https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html
export const MOON_GRAVITY_G = 1.62 / G0_M_S2

// Source: light time over the 2026–2042 JPL Horizons Earth–Mars distances in src/cache/horizons-earth-mars.json
// (min 56.9 M km on 2035-09-12, max 400.2 M km on 2034-08-20) ÷ c.
export const MARS_COMMS_DELAY_S = { min: 56.9e6 / C_KM_S, max: 400.2e6 / C_KM_S }

// Source: Earth–Moon semimajor axis 384,400 km (NASA Moon Fact Sheet) ÷ c ≈ 1.28 s.
export const MOON_COMMS_DELAY_S = EARTH_MOON_DISTANCE_KM / C_KM_S

// Source: NASA LSP Falcon Heavy (Expendable) curve above at C3 9 km²/s², the median best-window C3 in
// src/cache/transfers-mars.json (7.7–18.8): 13,600 − 1,250 × 4/5 = 12,600 kg. Checked in data.test.ts.
export const MARS_BASE_PAYLOAD_KG = 12_600

// Source: NASA LSP Falcon Heavy (Expendable) curve above at C3 −2 km²/s² (trans-lunar injection) = 15,500 kg.
// Same vehicle and curve as Mars so the comparison is like for like.
export const MOON_BASE_PAYLOAD_KG = 15_500

// Source: NASA lunar synodic month 29.53 d, ~14.77 d of night at a non-polar site (NASA Moon Fact Sheet).
// ASSUMPTION: a solar-lit greenhouse can't grow through the lunar night (batteries can't bridge 14 days),
// so output scales by the daylight fraction, 0.5. Mars sols (24.6 h) are short enough to buffer, so 1.
export const MOON_GREENHOUSE_OUTPUT_FACTOR = 0.5

// Source: the constants above; transfer and ISRU sources in their own sections.
export const DESTINATION_PROFILES: Record<Destination, DestinationProfile> = {
  mars: {
    label: 'Mars',
    transfer: { kind: 'table' },
    baseVehiclePayloadKg: MARS_BASE_PAYLOAD_KG,
    isruO2KgPerDay: MOXIE_SCALED_O2_KG_PER_DAY,
    isruLabel: 'MOXIE-style CO₂ electrolysis',
    isruReadiness: 'demonstrated',
    gravityG: MARS_GRAVITY_G,
    commsDelaySeconds: MARS_COMMS_DELAY_S,
    greenhouseOutputFactor: 1,
  },
  moon: {
    label: 'Moon',
    transfer: {
      kind: 'fixed',
      transitDays: MOON_TRANSIT_DAYS,
      c3: MOON_TRANSFER_C3_KM2_S2,
      vInfArrival: MOON_ARRIVAL_VINF_KM_S,
      distanceKm: EARTH_MOON_DISTANCE_KM,
      resupplyCadenceDays: MOON_RESUPPLY_CADENCE_DAYS,
    },
    baseVehiclePayloadKg: MOON_BASE_PAYLOAD_KG,
    isruO2KgPerDay: LUNAR_REGOLITH_O2_KG_PER_DAY,
    isruLabel: 'Regolith oxygen extraction',
    isruReadiness: 'concept',
    gravityG: MOON_GRAVITY_G,
    commsDelaySeconds: { min: MOON_COMMS_DELAY_S, max: MOON_COMMS_DELAY_S },
    greenhouseOutputFactor: MOON_GREENHOUSE_OUTPUT_FACTOR,
  },
}

// ---------- Sources list (for the pitch deck and an in-app credits panel) ----------

// Source: this file's citations, collected.
export const SOURCES: readonly { title: string; url: string }[] = [
  {
    title: BVAD,
    url: 'https://ntrs.nasa.gov/api/citations/20210024855/downloads/BVAD_2.15.22-final.pdf',
  },
  {
    title: 'NASA: ISS achieves 98% water recovery (2023)',
    url: 'https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/',
  },
  {
    title: 'Takada & Ghariani, ISS Oxygen Generation Assembly, ICES-2018-113',
    url: 'https://ntrs.nasa.gov/api/citations/20180006335/downloads/20180006335.pdf',
  },
  {
    title: 'El Sherif & Knox, ISS CDRA, SAE 2005-01-2892',
    url: 'https://ntrs.nasa.gov/api/citations/20050210002/downloads/20050210002.pdf',
  },
  {
    title: 'Green et al., Sabatier O₂ recovery (2017)',
    url: 'https://ntrs.nasa.gov/api/citations/20170001404/downloads/20170001404.pdf',
  },
  {
    title: 'Hecht et al., MOXIE, Space Sci Rev 217:9 (2021)',
    url: 'https://hdl.handle.net/1721.1/131995',
  },
  {
    title: 'NASA/JPL: MOXIE completes Mars mission (2023)',
    url: 'https://www.jpl.nasa.gov/news/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/',
  },
  {
    title: 'Hoffman et al., MOXIE scale-up, Sci. Adv. 8:eabp8636 (2022)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9432831/',
  },
  {
    title: 'Paz et al., Carbothermal regolith O₂ demo, ASCEND 2026',
    url: 'https://ntrs.nasa.gov/api/citations/20260002864/downloads/CaRD_ASCEND%202026_rev1.pdf',
  },
  {
    title: 'Massa et al., Veggie plant growth hardware',
    url: 'https://ntrs.nasa.gov/api/citations/20110015824/downloads/20110015824.pdf',
  },
  {
    title: 'Romeyn et al., Advanced Plant Habitat, KSC (2017)',
    url: 'https://ntrs.nasa.gov/api/citations/20170003373/downloads/20170003373.pdf',
  },
  {
    title: "Wheeler, NASA's Contributions to Vertical Farming (2020)",
    url: 'https://ntrs.nasa.gov/citations/20205008832',
  },
  {
    title: 'Gibson et al., KRUSTY nuclear ground test results (2018)',
    url: 'https://ntrs.nasa.gov/api/citations/20180005435/downloads/20180005435.pdf',
  },
  {
    title: 'Briggs, Gibson & Sanzi, Kilopower, NASA/TM-2018-219702',
    url: 'https://ntrs.nasa.gov/api/citations/20180001487/downloads/20180001487.pdf',
  },
  {
    title: 'Jones, ISS ECLSS ORU reliability, ICES-2019-11',
    url: 'https://ntrs.nasa.gov/api/citations/20190028339/downloads/20190028339.pdf',
  },
  {
    title: 'NASA Mars Fact Sheet',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html',
  },
  {
    title: 'NASA Moon Fact Sheet',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html',
  },
  {
    title: 'NASA/JPL Horizons System (Earth & Mars ephemerides)',
    url: 'https://ssd.jpl.nasa.gov/horizons/',
  },
  {
    title: 'JPL Astrodynamic Parameters (GM of the Sun)',
    url: 'https://ssd.jpl.nasa.gov/astro_par.html',
  },
  {
    title: 'NASA LSP, Falcon Heavy Performance Planning Assessment (2020)',
    url: 'https://elvperf.ksc.nasa.gov',
  },
  {
    title: 'Owens & de Weck, ISS operational experience, ICES-2018-198',
    url: 'https://ntrs.nasa.gov/api/citations/20200002558/downloads/20200002558.pdf',
  },
]
