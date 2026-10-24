// Launch date → transit time and payload factor, per destination.
// Mars reads the offline-built table (scripts/build-transfers.ts); the Moon is constant.

import table from '../cache/transfers-mars.json'
import {
  EARTH_MOON_DISTANCE_KM,
  MOON_ARRIVAL_VINF_KM_S,
  MOON_TRANSFER_C3_KM2_S2,
  MOON_TRANSIT_DAYS,
} from './data'
import { addDays } from './dates'
import type { Destination, IsoDate, LaunchWindow, Transfer } from './types'

type TransferSchedule = {
  /** Launch dates the schedule covers (inclusive), or undefined when any date works. */
  range?: { first: IsoDate; last: IsoDate }
  windows: readonly LaunchWindow[]
  transferFor: (launchDate: IsoDate) => Transfer
}

const marsByDate = new Map<IsoDate, Transfer>(table.transfers.map((t) => [t.launchDate, t]))
const marsRange = { first: table.transfers[0].launchDate, last: table.transfers.at(-1)!.launchDate }

const SCHEDULES: Record<Destination, TransferSchedule> = {
  mars: {
    range: marsRange,
    windows: table.windows,
    transferFor: (launchDate) => {
      const t = marsByDate.get(launchDate)
      if (!t) {
        throw new RangeError(
          `No Mars transfer for ${launchDate}; table covers ${marsRange.first} to ${marsRange.last}`,
        )
      }
      return t
    },
  },
  moon: {
    windows: [],
    transferFor: (launchDate) => ({
      launchDate,
      transitDays: MOON_TRANSIT_DAYS,
      arrivalDate: addDays(launchDate, MOON_TRANSIT_DAYS),
      c3: MOON_TRANSFER_C3_KM2_S2,
      vInfArrival: MOON_ARRIVAL_VINF_KM_S,
      payloadFactor: 1,
      distanceKmAtLaunch: EARTH_MOON_DISTANCE_KM,
    }),
  },
}

/** Transfer for cargo launched on `launchDate`. Throws RangeError outside the destination's table. */
export function transferFor(destination: Destination, launchDate: IsoDate): Transfer {
  return SCHEDULES[destination].transferFor(launchDate)
}

/** Launch windows (payload factor ≥ LAUNCH_WINDOW_PAYLOAD_FACTOR_MIN); empty when any date works. */
export function launchWindows(destination: Destination): readonly LaunchWindow[] {
  return SCHEDULES[destination].windows
}

/** First and last supported launch dates, or undefined when any date works. */
export function launchDateRange(
  destination: Destination,
): { first: IsoDate; last: IsoDate } | undefined {
  return SCHEDULES[destination].range
}
