import { WARMUP_ROUTES, type RecordedAction, type UiSnapshot, type Widget, type WindowKind } from '../types.ts'
import type { SeededRng } from '../rng.ts'
import { actionKey } from './coverage.ts'
import { pickPayload } from './payloads.ts'

export type PickContext = {
  snapshots: UiSnapshot[]
  rng: SeededRng
  tried: Set<string>
  now: number
}

function allWidgets(snapshots: UiSnapshot[]): Widget[] {
  return snapshots.flatMap((snap) => snap.widgets)
}

function pickWindow(snapshots: UiSnapshot[], rng: SeededRng): WindowKind {
  const windows = snapshots.map((s) => s.window)
  return windows.length === 0 ? 'main' : rng.pick(windows)
}

function unseen(widgets: Widget[], tried: Set<string>): Widget[] {
  return widgets.filter((w) => !tried.has(actionKey(w.role, w.name, 'click')))
}

export function pickRandomAction(ctx: PickContext): RecordedAction {
  const widgets = allWidgets(ctx.snapshots)
  const seedStep = ctx.rng.step
  const t = ctx.now

  if (ctx.rng.chance(0.2)) {
    return pickChaos(ctx)
  }

  const pool = unseen(widgets, ctx.tried)
  const candidates = pool.length > 0 ? pool : widgets
  if (candidates.length === 0) {
    return { type: 'press', t, seedStep, key: 'Escape', window: pickWindow(ctx.snapshots, ctx.rng) }
  }

  const widget = ctx.rng.pick(candidates)
  const point = { x: widget.x, y: widget.y }
  if (widget.editable && ctx.rng.chance(0.7)) {
    return {
      type: 'type',
      t,
      seedStep,
      locator: widget.locator,
      value: pickPayload(ctx.rng),
      point,
    }
  }
  if (ctx.rng.chance(0.08)) {
    return { type: 'contextmenu', t, seedStep, locator: widget.locator, point }
  }
  return { type: 'click', t, seedStep, locator: widget.locator, point }
}

function pickChaos(ctx: PickContext): RecordedAction {
  const t = ctx.now
  const seedStep = ctx.rng.step
  const window = pickWindow(ctx.snapshots, ctx.rng)
  const widgets = allWidgets(ctx.snapshots)
  const roll = ctx.rng.next()

  if (roll < 0.2) {
    return { type: 'press', t, seedStep, key: 'Escape', window }
  }
  if (roll < 0.35) {
    return { type: 'press', t, seedStep, key: 'Control+K', window }
  }
  if (roll < 0.45) {
    return { type: 'press', t, seedStep, key: 'Tab', window }
  }
  if (roll < 0.55) {
    return {
      type: 'resize',
      t,
      seedStep,
      width: 800 + ctx.rng.int(800),
      height: 600 + ctx.rng.int(400),
      window,
    }
  }
  if (roll < 0.7) {
    return { type: 'navigate', t, seedStep, hash: ctx.rng.pick(WARMUP_ROUTES), window }
  }
  if (roll < 0.8) {
    return { type: 'wait', t, seedStep, ms: 200 + ctx.rng.int(800) }
  }
  const editable = widgets.filter((w) => w.editable)
  if (editable.length > 0) {
    const field = ctx.rng.pick(editable)
    return {
      type: 'type',
      t,
      seedStep,
      locator: field.locator,
      value: pickPayload(ctx.rng),
      point: { x: field.x, y: field.y },
    }
  }
  if (widgets.length > 0) {
    const target = ctx.rng.pick(widgets)
    return { type: 'click', t, seedStep, locator: target.locator, point: { x: target.x, y: target.y } }
  }
  return { type: 'press', t, seedStep, key: 'F5', window }
}
