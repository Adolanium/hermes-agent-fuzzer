import { spawnSync } from 'node:child_process'

export function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim()
    throw new Error(`git ${args.join(' ')} failed: ${err}`)
  }
  return (result.stdout || '').trim()
}

export function gitOk(cwd: string, args: string[]): boolean {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return result.status === 0
}
