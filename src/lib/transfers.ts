// Launch date → transit time and payload factor, per destination.
// Each destination's TransferModel (data.ts) says whether to read an offline-built table
// (scripts/build-transfers.ts) or use fixed values.

import marsTable from '../cache/transfers-mars.json'
import { DESTINATION_PROFILES } from './data'
import { addDays } from './dates'
import type { Destination, IsoDate, LaunchWindow, Transfer, TransferModel } from './types'

type TransferTable = { windows: LaunchWindow[]; transfers: Transfer[] }

// Tables built offline, for destinations whose TransferModel is 'table'.
const TABLES: Partial<Record<Destination, TransferTable>> = { mars: marsTable }

type TransferSchedule = {
  /** Launch dates the schedule covers (inclusive), or undefined when any date works. */
  range?: { first: IsoDate; last: IsoDate }
  windows: readonly LaunchWindow[]
  transferFor: (launchDate: IsoDate) => Transfer
}

function tableSchedule(destination: Destination): TransferSchedule {
  const table = TABLES[destination]
  if (!table) throw new Error(`No transfer table built for ${destination}`)
  const byDate = new Map(table.transfers.map((t) => [t.launchDate, t]))
  const range = { first: table.transfers[0].launchDate, last: table.transfers.at(-1)!.launchDate }
  return {
    range,
    windows: table.windows,
    transferFor: (launchDate) => {
      const t = byDate.get(launchDate)
      if (!t) {
        throw new RangeError(
          `No ${destination} transfer for ${launchDate}; table covers ${range.first} to ${range.last}`,
        )
      }
      return t
    },
  }
}

function fixedSchedule(model: Extract<TransferModel, { kind: 'fixed' }>): TransferSchedule {
  return {
    windows: [],
    transferFor: (launchDate) => ({
      launchDate,
      transitDays: model.transitDays,
      arrivalDate: addDays(launchDate, model.transitDays),
      c3: model.c3,
      vInfArrival: model.vInfArrival,
      payloadFactor: 1,
      distanceKmAtLaunch: model.distanceKm,
    }),
  }
}

const schedule = (destination: Destination): TransferSchedule => {
  const model = DESTINATION_PROFILES[destination].transfer
  return model.kind === 'table' ? tableSchedule(destination) : fixedSchedule(model)
}

const SCHEDULES: Record<Destination, TransferSchedule> = {
  mars: schedule('mars'),
  moon: schedule('moon'),
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
