import type { CoverageGraph } from './coverage.ts'
import { actionKey } from './coverage.ts'
import { pickMutatedCorpus } from './mutate.ts'
import { pickGuidedOrRandom } from './model.ts'
import { pickRandomAction, type PickContext } from './random.ts'
import type { RecordedAction } from '../types.ts'

export function pickAction(input: {
  ctx: PickContext
  graph: CoverageGraph
  triedEdges: Set<string>
  useModel: boolean
  useMutation: boolean
}): RecordedAction {
  const { ctx, useModel, useMutation } = input
  if (useModel) {
    const guided = pickGuidedOrRandom(ctx, input.triedEdges, ctx.rng)
    const widgetName = guided.type === 'click' || guided.type === 'type' || guided.type === 'contextmenu'
      ? guided.locator.strategy === 'role'
        ? guided.locator.name
        : guided.locator.strategy === 'aria'
          ? guided.locator.name
          : ''
      : ''
    if (widgetName) {
      ctx.tried.add(actionKey('any', widgetName, guided.type))
    }
    return guided
  }
  if (useMutation && ctx.rng.chance(0.15)) {
    const mutated = pickMutatedCorpus(ctx.rng)
    const first = mutated?.[0]
    if (first) {
      return first
    }
  }
  return pickRandomAction(ctx)
}
