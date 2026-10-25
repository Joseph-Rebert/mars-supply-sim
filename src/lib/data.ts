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
  EquipmentKey,
  EquipmentSpec,
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
// Paired with FOOD_KG_PER_CREW_DAY this sets the food energy density used for per-person food mass.
export const FOOD_KCAL_PER_CREW_DAY = 3054

// Source: BVAD Rev2 (see the individual constants above). Stock units: kg of O₂, water, food.
export const CREW_NEEDS_KG_PER_CREW_DAY: Record<ConsumableKey, number> = {
  o2: O2_KG_PER_CREW_DAY,
  water: WATER_KG_PER_CREW_DAY,
  food: FOOD_KG_PER_CREW_DAY,
}

// ---------- Per-person needs (Crew Diet & Health) ----------

// Source: BVAD Rev2 Equation 3-2 p.45 (from NASA HIDH 2014), male > 19 y, kcal/day:
// 622 − 9.53 × age + 1.25 × (15.9 × mass + 539.6 × height). The 1.25 is the activity factor (see below).
// p.107 states this gives 12.707 MJ/CM-d for the mean astronaut (82.4 kg, 1.786 m, 45 y); crew.test checks it.
export const EER_MALE = { base: 622, perYear: 9.53, perKg: 15.9, perM: 539.6 }

// Source: BVAD Rev2 Equation 3-3 p.45 (from NASA HIDH 2014), female > 19 y, kcal/day:
// 354 − 6.91 × age + 1.25 × (9.36 × mass + 726 × height).
export const EER_FEMALE = { base: 354, perYear: 6.91, perKg: 9.36, perM: 726 }

// Source: Institute of Medicine, "Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids,
// Cholesterol, Protein, and Amino Acids" (2005), ch. 5, physical-activity coefficients (low active 1.11,
// active 1.25, very active 1.48), https://nap.nationalacademies.org/catalog/10490
// ASSUMPTION: 'moderate' = NASA's 1.25 (BVAD applies it to both sexes), so we use the IOM male values for both.
export const ACTIVITY_FACTOR = { light: 1.11, moderate: 1.25, heavy: 1.48 } as const

// Source: BVAD Rev2 Table 4-59 p.125, protein goal "12 – 15" % of dietary energy; we use the minimum.
export const PROTEIN_ENERGY_FRACTION_MIN = 0.12

// Source: Atwater general factor, 4 kcal per gram of protein (USDA, Agriculture Handbook No. 74, 1973).
export const KCAL_PER_G_PROTEIN = 4

// Source: BVAD Rev2 Table 4-57 p.123, "NASA Goal" column: vitamin C 100 mg/CM-d.
export const VITAMIN_C_MG_PER_DAY = 100

// Source: BVAD Rev2 Table 4-57 p.123, NASA Goal 400 IU/CM-d; footnote 125: 1 IU = 1/40 µg → 10 µg.
export const VITAMIN_D_UG_PER_DAY = 400 / 40

// Source: BVAD Rev2 Table 4-57 p.123, NASA Goal: calcium 1,000 mg/CM-d.
export const CALCIUM_MG_PER_DAY = 1000

// Source: BVAD Rev2 Table 4-57 p.123, NASA Goal: potassium 3,500 mg/CM-d.
export const POTASSIUM_MG_PER_DAY = 3500

// Source: BVAD Rev2 Table 3-21 p.44, crewmember mass limits: 5th-percentile female 53.69 kg to
// 95th-percentile male 99.16 kg (NASA HIDH 2014).
export const CREW_MASS_KG_RANGE = { min: 53.69, max: 99.16 }

// Source: lower bound BVAD Rev2 Table 4-57 reference-diet (RDA goal) 2,000 kcal = 8.37 MJ/CM-d, used as a
// sanity floor (BVAD publishes no minimum); upper bound p.44, an exceptionally active
// 82 kg male "could be as high as 18 MJ/CM-d" (Muller and Tobin, 1980).
export const CREW_ENERGY_MJ_RANGE = { min: 8.37, max: 18 }

// Source: thermochemical calorie, 4.184 kJ/kcal (NIST SP 811).
export const KJ_PER_KCAL = 4.184

// ---------- Stored-food nutrient loss (first-order decay, per day of shelf age) ----------

// Source: Cooper, Perchonok & Douglas, "Initial assessment of the nutritional quality of the space food system
// over three years of ambient storage", npj Microgravity 3:17 (2017), Fig. 2: "The vitamin C content in most
// fruit products degraded between 32 and 83% after 3 years of storage" (21 °C, ISS temperature),
// https://pmc.ncbi.nlm.nih.gov/articles/PMC5466603/
// ASSUMPTION: first-order decay fitted to the midpoint (57.5% lost → 42.5% left after 1,095 days):
// k = −ln(0.425) / 1095 ≈ 7.8e-4 per day (≈ 25% per year). Range below spans the 32–83% losses.
export const VITAMIN_C_DECAY_PER_DAY = -Math.log(0.425) / 1095

// Source: same Cooper et al. (2017) range: 68% left (k ≈ 3.5e-4/day) to 17% left (k ≈ 1.6e-3/day) after 3 years.
export const VITAMIN_C_DECAY_PER_DAY_RANGE = {
  min: -Math.log(0.68) / 1095,
  max: -Math.log(0.17) / 1095,
}

// ASSUMPTION: 0. No stored-food vitamin D loss rate was found; Cooper et al. (2017) report food vitamin D is
// already below needs after processing and that ISS crews take a vitamin D supplement.
export const VITAMIN_D_DECAY_PER_DAY = 0

// ASSUMPTION: 0. Calcium and potassium are elements and cannot degrade chemically; Cooper et al. (2017) list only
// "vitamins A, C, B1, and B6" as decreasing during storage.
export const MINERAL_DECAY_PER_DAY = 0

// Source: BVAD Rev2 p.122 footnote 123 (French & Perchonok 2006): "Vitamin D supplements are currently provided
// for the ISS crewmembers' daily use"; Cooper et al. (2017): food vitamin D is below needs after processing.
// ASSUMPTION: the supplement dose equals the 10 µg/day NASA goal (no dose is given in either source).
export const VITAMIN_D_SUPPLEMENT_UG_PER_DAY = 10

// Source: the NASA vitamin C requirement above (VITAMIN_C_MG_PER_DAY, 100 mg/day).
// ASSUMPTION: an optional daily tablet covers the full requirement. ISS crews get vitamin D this way, not C
// (BVAD Rev2 p.122), so this is a planning option the fix search can suggest, off by default.
export const VITAMIN_C_SUPPLEMENT_MG_PER_DAY = VITAMIN_C_MG_PER_DAY

// ASSUMPTION: shipped tablet mass is twice the ascorbic acid it contains (binder, coating, bottle); no space-food
// figure was found. 100 mg/day × 4 crew × 900 days ≈ 0.7 kg.
export const VITAMIN_C_SUPPLEMENT_KG_PER_MG = 2e-6

// ---------- Body health (GEA-23) ----------

// Source: LeBlanc et al., "Bone mineral and lean tissue loss after long duration space flight", J Musculoskelet
// Neuronal Interact 1:157–160 (2000), Table 1: lumbar spine −1.06 ± 0.63 %/month on Mir (no effective
// countermeasures), https://jmni.hylonome.net/published/2/leblanc.pdf (÷ 30.4375 days/month).
export const BONE_LOSS_PCT_PER_DAY_0G = 1.06 / 30.4375

// Source: Smith et al., J Bone Miner Res 27:1896 (2012): with ARED resistance exercise, adequate energy and
// vitamin D, hip BMD was "unchanged from preflight"; Sibonga et al., Bone 128:112037 (2019): ARED "partially
// attenuated declines". ASSUMPTION: full exercise keeps 25% of the unmitigated loss rate.
export const BONE_LOSS_WITH_EXERCISE_FRACTION = 0.25

// ASSUMPTION: 90 min/day counts as the full ISS exercise countermeasure; less scales linearly toward none.
export const EXERCISE_FULL_COUNTERMEASURE_MIN = 90

// ASSUMPTION: days without enough vitamin D, or with calcium below CALCIUM_SEVERE_SHORT_FRACTION of need, double
// the bone-loss rate. Smith et al. (2012) credit vitamin D and energy for protecting bone; no dose–response exists.
export const BONE_LOSS_NUTRIENT_SHORT_MULTIPLIER = 2

// ASSUMPTION: 50%. ISS crews ate ~20% below the calcium target (Cooper et al. 2017) yet kept hip BMD with ARED and
// vitamin D (Smith et al. 2012), so only a severe calcium shortfall is treated as speeding bone loss.
export const CALCIUM_SEVERE_SHORT_FRACTION = 0.5

// ASSUMPTION: bone and muscle loss scale with (1 − gravity in g): no human partial-gravity data exists. Rodent
// studies show graded loss with unloading (Ko et al., npj Microgravity 6:15, 2020), so this may be optimistic.
export const UNLOADING_EXPONENT = 1

// Source: NASA-STD-3001 Vol 1 [V1 4027] via OCHMO-TB-030 "Bone Loss": countermeasures "shall maintain bone mineral
// density of the hip and spine at or above 95% of pre-mission values", https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-030-bone-loss.pdf
export const NASA_BONE_LOSS_LIMIT_PCT = 5

// ASSUMPTION: twice NASA's limit (10% loss, roughly the drop from the T −1.0 entry standard to the T −2.0 floor in
// the same brief) makes a crew member medically unfit; NASA's 5% is a countermeasure target, not incapacity.
export const BONE_LOSS_UNFIT_PCT = 2 * NASA_BONE_LOSS_LIMIT_PCT

// Source: Trappe et al., J Appl Physiol 106:1159 (2009): ISS crews exercising lost calf muscle volume
// "13 ± 2%" over ~6 months (÷ 180 days ≈ 0.07 %/day).
export const MUSCLE_LOSS_PCT_PER_DAY_EXERCISING = 13 / 180

// Source: Alkner & Tesch, Eur J Appl Physiol (2004), 90-day bed rest without exercise: knee extensor volume
// decreased 18% (÷ 90 days = 0.2 %/day).
export const MUSCLE_LOSS_PCT_PER_DAY_NO_EXERCISE = 18 / 90

// ASSUMPTION: muscle loss levels off with a 180-day time constant (loss → rate × 180 d). The measured rates come
// from ≤ 6-month missions (Trappe 2009) and 90-day bed rest; extending them linearly to 30 months would predict
// >40% loss, far beyond any observation.
export const MUSCLE_LOSS_LEVEL_OFF_DAYS = 180

// ASSUMPTION: days short of protein multiply muscle loss by 1.5 (no spaceflight dose–response found).
export const MUSCLE_LOSS_PROTEIN_SHORT_MULTIPLIER = 1.5

// Source: Hall, "What is the required energy deficit per unit weight loss?", Int J Obes 32:573 (2008):
// "3500 kcal … per pound … or equivalently 32.2 MJ kg⁻¹" ≈ 7,700 kcal per kg.
export const KCAL_PER_KG_BODY_MASS = 32_200 / 4.184

// ASSUMPTION: losing more than 15% of starting body mass makes a crew member medically unfit.
export const BODY_MASS_LOSS_UNFIT_PCT = 15

// Source: UK Department of Health, "Dietary Reference Values", Report 41 (1991), ch. 17 p.117: "about 2.7 per cent
// of the exchangeable body pool … is degraded each day … a first-order rate",
// https://www.mv.helsinki.fi/home/hemila/experts/DH_1991.pdf
export const VITAMIN_C_POOL_TURNOVER_PER_DAY = 0.027

// ASSUMPTION: a well-nourished crew starts at a saturated ~1,500 mg pool (secondary sources only); the pool can't
// exceed it, as extra intake is excreted.
export const VITAMIN_C_POOL_MAX_MG = 1500

// Source: Institute of Medicine, DRI for Vitamin C (2000), p.100: "A total body pool of less than 300 mg is
// associated with scurvy symptoms (Baker et al., 1971)", https://nap.nationalacademies.org/catalog/9810
export const VITAMIN_C_SCURVY_POOL_MG = 300

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
  label: 'Oxygen maker',
  mtbfDays: 444.3,
  spareMassKg: 70.2,
  repairDays: 1,
  readiness: 'flightProven',
}

// Source: Jones ICES-2019-11 Table A.2 (CDRA, 4 ORUs): MTBF 987.4 d, weighted spare 27.8 kg.
// ASSUMPTION: repair takes 1 day, as above.
const CO2_SCRUBBER: ComponentSpec = {
  label: 'Air filter',
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

// ASSUMPTION: 3 days. With the CO₂ scrubber down, cabin CO₂ climbs within hours; we assume emergency
// lithium-hydroxide canisters (as carried on Apollo and the ISS) hold it safe for ~3 days. No sourced capacity yet.
export const CO2_SCRUBBER_GRACE_DAYS = 3

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
export const C_KM_S = 299_792.458

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
    isruLabel: 'Pulls oxygen out of the Mars air, like NASA’s MOXIE',
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
    isruLabel: 'Pulls oxygen out of Moon soil',
    isruReadiness: 'concept',
    gravityG: MOON_GRAVITY_G,
    commsDelaySeconds: { min: MOON_COMMS_DELAY_S, max: MOON_COMMS_DELAY_S },
    greenhouseOutputFactor: MOON_GREENHOUSE_OUTPUT_FACTOR,
  },
}

// ---------- Launch cost (GEA-42) ----------

// Source: NASA, "NASA Awards Launch Services Contract for Europa Clipper Mission" (July 2021): Falcon Heavy, "The total
// contract award amount for launch services is approximately $178 million"; NASA OIG IG-24-001 (2023) gives the same
// $178M. https://www.nasa.gov/news-release/nasa-awards-launch-services-contract-for-europa-clipper-mission/
// ASSUMPTION: every cargo flight costs one expendable Falcon Heavy at that price (the payload curve we use).
export const LAUNCH_COST_USD = 178e6

// ---------- Supply chain: order lead time and the orbit view ----------

// ASSUMPTION: 18 months (548 days) from placing a cargo order to the cargo being ready to launch (build, test,
// integrate, freeze the manifest). No sourced figure yet; the Assumptions drawer lets the user change it.
export const ORDER_LEAD_TIME_DAYS = 548

// Source: IAU 2012 Resolution B2, the astronomical unit is exactly 149,597,870.7 km.
export const AU_KM = 149_597_870.7

// Source: NASA Earth Fact Sheet, sidereal orbit period 365.256 days, https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html
export const EARTH_ORBIT_PERIOD_DAYS = 365.256

// Source: NASA Mars Fact Sheet, sidereal orbit period 686.980 days, https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html
export const MARS_ORBIT_PERIOD_DAYS = 686.98

// ---------- Rover fuel ----------

// ASSUMPTION: 10 kW while driving, for a small pressurized rover like DRA 5.0's (NASA SP-2009-566). NASA's Mars
// power studies size mission loads from 4 to 120 kWe (Withrow & Morales, NASA TM-106753 / NTRS 19950012155); the
// rover's own figure couldn't be checked in the scanned report, so this is a planning value.
export const ROVER_POWER_KW = 10

// Source: Engineering ToolBox, "Fuels - Higher and Lower Calorific Values": methane LHV 50.0 MJ/kg,
// https://www.engineeringtoolbox.com/fuels-higher-calorific-values-d_169.html
export const METHANE_LHV_MJ_PER_KG = 50

// Source: CH₄ + 2 O₂ → CO₂ + 2 H₂O, so 2 × 32 g of O₂ per 16 g of CH₄ = 4 kg of oxygen per kg of methane.
export const O2_PER_METHANE_KG = 4

// ASSUMPTION: 50% from fuel energy to electricity for a methane–oxygen solid oxide fuel cell; NASA JSC has
// tested such cells for Mars (LOx/LCH₄ SOFC), but no flight efficiency is published.
export const FUEL_CELL_EFFICIENCY = 0.5

// ASSUMPTION: one 2-hour drive a week on average. A planning value, not sourced; raise it to see fuel run out.
export const ROVER_DRIVE_HOURS_PER_WEEK = 2

// Source: derived from the five values above: kWh needed a day ÷ kWh of electricity per kg of fuel
// (methane plus its oxygen) = (10 kW × 2 h ÷ 7) ÷ (50 MJ ÷ 5 kg ÷ 3.6 × 0.5) ≈ 2.06 kg a day.
export const FUEL_KG_PER_ROVER_DAY =
  (ROVER_POWER_KW * ROVER_DRIVE_HOURS_PER_WEEK) /
  7 /
  ((METHANE_LHV_MJ_PER_KG / (1 + O2_PER_METHANE_KG) / 3.6) * FUEL_CELL_EFFICIENCY)

// ASSUMPTION: fuel ships in pressure tanks like the O₂ ones (BVAD's 1.45 kg of tank per kg); cryogenic methane and
// oxygen tanks would differ, but no better figure was found.
export const FUEL_TANK_KG_PER_KG = O2_TANK_KG_PER_KG

// ---------- Base-building equipment ----------

// Source: NASA, SpaceX CRS-8 mission overview (2016): BEAM expandable module, mass 1,413 kg, 16 m³ pressurized.
// ASSUMPTION: a BEAM-class expandable module stands in for the surface living space; a full Mars habitat for
// four would be several times heavier.
export const HABITAT_MODULE_MASS_KG = 1413

// Source: NASA NSSDC, "The Apollo Lunar Roving Vehicle": mass 210 kg,
// https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html
export const ROVER_MASS_KG = 210

// Source: NASA–Bigelow BEAM contract, $17.8 million firm-fixed-price, signed Dec 2012 (SpaceNews; NASA release
// "NASA to Test Bigelow Expandable Module on Space Station", Jan 2013), https://www.nasa.gov/?p=50953
// ASSUMPTION: 2012 dollars, not inflation-adjusted; it covered building and operating the module.
export const HABITAT_MODULE_PRICE_USD = 17.8e6

// Source: KRUSTY Kilopower test, NASA and NNSA, "less than $20 million" (GeekWire, May 2018),
// https://www.geekwire.com/2018/kilopower-project-nuclear-reactor-space/
// ASSUMPTION: a ground test unit's cost stands in for a flight reactor's price; 2015–2018 dollars.
export const POWER_PLANT_PRICE_USD = 20e6

// Source: Boeing's Lunar Roving Vehicle contract, final cost $38 million for four rovers (NASA NSSDC, "The Apollo
// Lunar Roving Vehicle"), https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html
// ASSUMPTION: a quarter of it per rover, in 1971 dollars, not inflation-adjusted.
export const ROVER_PRICE_USD = 38e6 / 4

// ASSUMPTION: needed-by dates are planning rules, not sourced: the habitat and power plant must be down
// before the crew lands (day 0); the rover by the end of month 3, when work away from the base would start.
// Masses: the two constants above, and KILOPOWER_10KWE_MASS_KG for the 10 kW reactor.
export const EQUIPMENT: Record<EquipmentKey, EquipmentSpec> = {
  habitat: {
    label: 'Habitat module',
    massKg: HABITAT_MODULE_MASS_KG,
    neededByDay: 0,
    readiness: 'flightProven',
    priceUsd: HABITAT_MODULE_PRICE_USD,
  },
  power: {
    label: 'Power plant (10 kW reactor)',
    massKg: KILOPOWER_10KWE_MASS_KG,
    neededByDay: 0,
    readiness: KILOPOWER_READINESS,
    priceUsd: POWER_PLANT_PRICE_USD,
  },
  rover: {
    label: 'Rover',
    massKg: ROVER_MASS_KG,
    neededByDay: 91,
    readiness: 'flightProven',
    priceUsd: ROVER_PRICE_USD,
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
    title:
      'Cooper, Perchonok & Douglas, space food nutrition over 3 years of storage, npj Microgravity (2017)',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5466603/',
  },
  {
    title: 'Lane et al., Changes in Space Food over the Last 45 Years (NASA JSC)',
    url: 'https://ntrs.nasa.gov/api/citations/20060049069/downloads/20060049069.pdf',
  },
  {
    title: 'USDA FoodData Central, SR Legacy',
    url: 'https://fdc.nal.usda.gov/',
  },
  {
    title: 'NASA: Europa Clipper launch services contract, Falcon Heavy, ~$178M (2021)',
    url: 'https://www.nasa.gov/news-release/nasa-awards-launch-services-contract-for-europa-clipper-mission/',
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
    title: 'NASA: SpaceX CRS-8 mission overview (BEAM, 1,413 kg)',
    url: 'https://en.wikipedia.org/wiki/Bigelow_Expandable_Activity_Module',
  },
  {
    title: 'NASA NSSDC: The Apollo Lunar Roving Vehicle (210 kg)',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html',
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
