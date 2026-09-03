import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

export type ToolInvocation = {
  command: string
  prefix: string[]
}

export function npmCliPath(nodeDir: string = path.dirname(process.execPath)): string {
  return path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')
}

export function npmInvocation(): ToolInvocation {
  const cli = npmCliPath()
  if (fs.existsSync(cli)) {
    return { command: process.execPath, prefix: [cli] }
  }
  if (process.platform === 'win32') {
    return { command: 'cmd.exe', prefix: ['/d', '/s', '/c', 'npm'] }
  }
  return { command: 'npm', prefix: [] }
}

export function uvExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'uv.exe' : 'uv'
}

export function quoteWinArg(value: string): string {
  if (/[\s"]/u.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`
  }
  return value
}

export function readNpmVersion(cwd: string): string {
  const npm = npmInvocation()
  const result = spawnSync(npm.command, [...npm.prefix, '--version'], { cwd, encoding: 'utf8' })
  return (result.stdout || '').trim()
}

export function npmEngineBlocked(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!match) {
    return false
  }
  const major = Number(match[1])
  const minor = Number(match[2])
  if (major !== 11) {
    return false
  }
  return minor >= 10 && minor < 17
}

function failMessage(command: string, args: string[], cwd: string, result: ReturnType<typeof spawnSync>): string {
  const spawnError = result.error instanceof Error ? result.error.message : ''
  const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : ''
  const parts = [`${command} ${args.join(' ')} failed in ${cwd}`]
  if (result.status !== null) {
    parts.push(`status=${result.status}`)
  }
  if (spawnError) {
    parts.push(spawnError)
  }
  if (stderr) {
    parts.push(stderr.slice(0, 800))
  }
  return parts.join(': ')
}

export function runTool(cwd: string, command: string, args: string[], extraEnv: Record<string, string> = {}): void {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  })
  if (result.status !== 0) {
    throw new Error(failMessage(command, args, cwd, result))
  }
}

export function runNpm(cwd: string, args: string[], extraEnv: Record<string, string> = {}): void {
  const npm = npmInvocation()
  if (npm.command === 'cmd.exe') {
    const line = ['npm', ...args].map(quoteWinArg).join(' ')
    runTool(cwd, 'cmd.exe', ['/d', '/s', '/c', line], extraEnv)
    return
  }
  runTool(cwd, npm.command, [...npm.prefix, ...args], extraEnv)
}

export function commandExists(command: string): boolean {
  const probe = process.platform === 'win32' ? 'where.exe' : 'which'
  const result = spawnSync(probe, [command], { encoding: 'utf8' })
  return result.status === 0
}
