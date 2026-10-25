// Runs bestFix off the main thread: it re-simulates dozens of candidate plans (several seconds), and
// the page should stay usable meanwhile. In: { plan, result }. Out: the SuggestedFix.

import { bestFix } from '../lib/analysis'
import type { MissionPlan, SimResult } from '../lib/types'

type Request = { plan: MissionPlan; result: SimResult }

const worker = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null
  postMessage: (message: unknown) => void
}

worker.onmessage = (e) => {
  worker.postMessage(bestFix(e.data.plan, e.data.result))
}
