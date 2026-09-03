import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { coveragePath, ensureDir } from '../paths.ts'
import type { CoverageNode, StateId, UiSnapshot } from '../types.ts'

export function hashState(snapshot: UiSnapshot): StateId {
  const key = [
    snapshot.route,
    snapshot.view,
    snapshot.dialogTitle ?? '',
    snapshot.bootPhase,
    snapshot.window,
    snapshot.roleNames.join('|'),
  ].join('::')
  const digest = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)
  return digest as StateId
}

export type CoverageGraph = {
  nodes: Record<string, CoverageNode>
}

export function emptyGraph(): CoverageGraph {
  return { nodes: {} }
}

export function visitState(graph: CoverageGraph, stateId: StateId, actionKey?: string): CoverageNode {
  const existing = graph.nodes[stateId]
  if (existing) {
    existing.visits += 1
    if (actionKey && !existing.actionsTried.includes(actionKey)) {
      existing.actionsTried.push(actionKey)
    }
    return existing
  }
  const node: CoverageNode = {
    stateId,
    visits: 1,
    actionsTried: actionKey ? [actionKey] : [],
    findings: 0,
  }
  graph.nodes[stateId] = node
  return node
}

export function actionKey(role: string, name: string, type: string): string {
  return `${type}:${role}:${name}`
}

export function loadGraph(): CoverageGraph {
  const file = coveragePath()
  if (!fs.existsSync(file)) {
    return emptyGraph()
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (typeof parsed === 'object' && parsed !== null && 'nodes' in parsed) {
      return parsed as CoverageGraph
    }
  } catch {
    // start fresh
  }
  return emptyGraph()
}

export function saveGraph(graph: CoverageGraph): void {
  ensureDir(path.dirname(coveragePath()))
  fs.writeFileSync(coveragePath(), JSON.stringify(graph, null, 2), 'utf8')
}

export function coverageSummary(graph: CoverageGraph): { states: number; visits: number } {
  let visits = 0
  for (const node of Object.values(graph.nodes)) {
    visits += node.visits
  }
  return { states: Object.keys(graph.nodes).length, visits }
}
