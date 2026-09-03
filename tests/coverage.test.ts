import { describe, expect, it } from 'vitest'

import { actionKey, emptyGraph, hashState, visitState } from '../src/explorer/coverage.ts'
import type { UiSnapshot } from '../src/types.ts'

function snap(route: string, extras: Partial<UiSnapshot> = {}): UiSnapshot {
  return {
    window: 'main',
    url: `hermes://app#${route}`,
    title: 'Hermes',
    route,
    view: route === '/settings' ? 'settings' : 'chat',
    dialogTitle: null,
    bootPhase: 'ready',
    bodyPreview: '',
    widgets: [],
    roleNames: ['button:New session'],
    ...extras,
  }
}

describe('state coverage', () => {
  it('hashes route plus visible widgets', () => {
    expect(hashState(snap('/'))).not.toBe(hashState(snap('/settings')))
    expect(hashState(snap('/settings'))).not.toBe(hashState(snap('/settings?tab=about')))
    expect(hashState(snap('/'))).toBe(hashState(snap('/')))
  })

  it('counts visits and tried actions', () => {
    const graph = emptyGraph()
    const id = hashState(snap('/'))
    visitState(graph, id, actionKey('button', 'New session', 'click'))
    visitState(graph, id, actionKey('button', 'New session', 'click'))
    expect(graph.nodes[id]?.visits).toBe(2)
    expect(graph.nodes[id]?.actionsTried).toHaveLength(1)
  })
})
