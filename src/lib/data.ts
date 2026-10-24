// Every real-world number the sim uses lives here.
// Rule: each exported constant gets a `// Source:` comment (URL or document name);
// extrapolated or assumed values are marked `// ASSUMPTION:`.
// Primary reference is BVAD Rev2 (2022); values are not mixed with Rev1 (2018), which differs.
// TODO(GEA-12): full Mars vs. Moon destination profiles (DESTINATION_FACTS is the display subset).

import type {
  ComponentKey,
  ComponentSpec,
  ConsumableKey,
  Destination,
  DestinationFacts,
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
// every ISS cargo run (BVAD Rev2 Table 4-4, NORS). Lunar regolith O₂ is concept (Paz et al. 2026), resolved in GEA-12.
export const O2_SOURCE_READINESS: Record<O2Source, ReadinessTier> = {
  electrolysis: 'flightProven',
  isru: 'demonstrated',
  tanks: 'flightProven',
}

// Source: KRUSTY ground test, March 2018 (Gibson et al., NTRS 20180005435); never flown.
export const KILOPOWER_READINESS: ReadinessTier = 'demonstrated'

// ---------- Destinations (display facts; GEA-12 builds full profiles) ----------

// Source: CODATA speed of light in vacuum, 299,792.458 km/s (exact by SI definition).
export const LIGHT_KM_PER_SEC = 299_792.458

// Source: NASA NSSDC Mars Fact Sheet, distance from Earth "Minimum (10^6 km) 54.6",
// https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
export const MARS_MIN_DISTANCE_KM = 54.6e6

// Source: NASA NSSDC Mars Fact Sheet, distance from Earth "Maximum (10^6 km) 401.3".
export const MARS_MAX_DISTANCE_KM = 401.3e6

// Source: NASA NSSDC Mars Fact Sheet, "Synodic period (days) 779.94" — one launch window per period.
export const MARS_SYNODIC_PERIOD_DAYS = 779.94

// Source: NASA NSSDC Moon Fact Sheet, "Semimajor axis (10^6 km) 0.3844",
// https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html
export const MOON_MEAN_DISTANCE_KM = 0.3844e6

// Source: light time from the distances above; ISRU readiness from MOXIE (JPL 2023) and CaRD (Paz et al. 2026).
// Moon resupply: no orbital-alignment window (launch any day).
export const DESTINATION_FACTS: Record<Destination, DestinationFacts> = {
  mars: {
    label: 'Mars',
    commsDelaySec: {
      min: MARS_MIN_DISTANCE_KM / LIGHT_KM_PER_SEC,
      max: MARS_MAX_DISTANCE_KM / LIGHT_KM_PER_SEC,
    },
    resupplyEveryDays: MARS_SYNODIC_PERIOD_DAYS,
    isru: { label: 'MOXIE, scaled up', readiness: 'demonstrated' },
  },
  moon: {
    label: 'Moon',
    commsDelaySec: {
      min: MOON_MEAN_DISTANCE_KM / LIGHT_KM_PER_SEC,
      max: MOON_MEAN_DISTANCE_KM / LIGHT_KM_PER_SEC,
    },
    resupplyEveryDays: 0,
    isru: { label: 'Regolith extraction', readiness: 'concept' },
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
    title: 'NASA NSSDC Mars Fact Sheet',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html',
  },
  {
    title: 'NASA NSSDC Moon Fact Sheet',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html',
  },
  {
    title: 'Jones, ISS ECLSS ORU reliability, ICES-2019-11',
    url: 'https://ntrs.nasa.gov/api/citations/20190028339/downloads/20190028339.pdf',
  },
  {
    title: 'Owens & de Weck, ISS operational experience, ICES-2018-198',
    url: 'https://ntrs.nasa.gov/api/citations/20200002558/downloads/20200002558.pdf',
  },
]
