import { SETTINGS_HASHES, SKILLS_HASHES, type ModelView, type RecordedAction, type UiSnapshot } from '../types.ts'
import type { SeededRng } from '../rng.ts'
import { pickRandomAction, type PickContext } from './random.ts'

export type ModelEdge = {
  from: ModelView
  to: ModelView
  via: 'navigate' | 'press' | 'click-name'
  hash?: string
  key?: string
  name?: string
}

const EDGES: ModelEdge[] = [
  { from: 'chat', to: 'settings', via: 'navigate', hash: '/settings' },
  { from: 'chat', to: 'skills', via: 'navigate', hash: '/skills' },
  { from: 'chat', to: 'artifacts', via: 'navigate', hash: '/artifacts' },
  { from: 'chat', to: 'cron', via: 'navigate', hash: '/cron' },
  { from: 'chat', to: 'profiles', via: 'navigate', hash: '/profiles' },
  { from: 'chat', to: 'agents', via: 'navigate', hash: '/agents' },
  { from: 'chat', to: 'starmap', via: 'navigate', hash: '/starmap' },
  { from: 'chat', to: 'command-center', via: 'navigate', hash: '/command-center' },
  { from: 'chat', to: 'messaging', via: 'navigate', hash: '/messaging' },
  { from: 'chat', to: 'webhooks', via: 'navigate', hash: '/webhooks' },
  { from: 'chat', to: 'palette', via: 'press', key: 'Control+K' },
  { from: 'settings', to: 'chat', via: 'press', key: 'Escape' },
  { from: 'skills', to: 'chat', via: 'navigate', hash: '/' },
  { from: 'palette', to: 'chat', via: 'press', key: 'Escape' },
  { from: 'dialog', to: 'chat', via: 'press', key: 'Escape' },
  { from: 'onboard', to: 'onboard', via: 'click-name', name: 'Skip' },
  ...SETTINGS_HASHES.map((hash) => ({ from: 'settings' as const, to: 'settings' as const, via: 'navigate' as const, hash })),
  ...SKILLS_HASHES.map((hash) => ({ from: 'skills' as const, to: 'skills' as const, via: 'navigate' as const, hash })),
]

export function currentView(snapshots: UiSnapshot[]): ModelView {
  const main = snapshots.find((s) => s.window === 'main') ?? snapshots[0]
  return main?.view ?? 'unknown'
}

function edgeKey(edge: ModelEdge): string {
  return `${edge.from}->${edge.to}:${edge.via}:${edge.hash ?? edge.key ?? edge.name ?? ''}`
}

export function pickModelAction(ctx: PickContext, triedEdges: Set<string>): RecordedAction | null {
  const view = currentView(ctx.snapshots)
  const unused = EDGES.filter((edge) => edge.from === view && !triedEdges.has(edgeKey(edge)))
  if (unused.length === 0) {
    return null
  }
  const edge = ctx.rng.pick(unused)
  triedEdges.add(edgeKey(edge))
  const t = ctx.now
  const seedStep = ctx.rng.step
  const window = ctx.snapshots[0]?.window ?? 'main'

  if (edge.via === 'navigate' && edge.hash) {
    return { type: 'navigate', t, seedStep, hash: edge.hash, window }
  }
  if (edge.via === 'press' && edge.key) {
    return { type: 'press', t, seedStep, key: edge.key, window }
  }
  if (edge.via === 'click-name' && edge.name) {
    const widget = ctx.snapshots.flatMap((s) => s.widgets).find((w) => w.name.toLowerCase().includes(edge.name!.toLowerCase()))
    if (widget) {
      return { type: 'click', t, seedStep, locator: widget.locator, point: { x: widget.x, y: widget.y } }
    }
  }
  return null
}

export function pickGuidedOrRandom(ctx: PickContext, triedEdges: Set<string>, rng: SeededRng): RecordedAction {
  if (rng.chance(0.45)) {
    const guided = pickModelAction(ctx, triedEdges)
    if (guided) {
      return guided
    }
  }
  return pickRandomAction(ctx)
}
