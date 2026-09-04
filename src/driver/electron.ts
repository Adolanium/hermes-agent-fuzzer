import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import { _electron, type ElectronApplication, type Page } from 'playwright'

import { evalInPage } from './eval.ts'
import { logInfo } from '../log.ts'
import { findPackagedBinary, packagedBinaryPath, resolveElectronBinary } from '../target/electron-binary.ts'
import type { LaunchProfile, TargetInfo, WindowKind } from '../types.ts'

export type LaunchedApp = {
  app: ElectronApplication
  main: Page
  pages: Map<WindowKind, Page>
  pid: number
  stdout: string[]
  stderr: string[]
  pageErrors: string[]
  consoleErrors: string[]
  closed: boolean
}

export function classifyWindowUrl(url: string, alreadyHasMain: boolean): WindowKind {
  if (url.includes('win=hud')) {
    return 'hud'
  }
  if (url.includes('win=quick')) {
    return 'quick'
  }
  if (url.includes('win=overlay')) {
    return 'overlay'
  }
  if (url.includes('win=wake')) {
    return 'wake'
  }
  if (url.includes('peer=') || alreadyHasMain) {
    return 'unknown'
  }
  return 'main'
}

function attachPageWatchers(launched: LaunchedApp, page: Page): void {
  page.on('pageerror', (error) => {
    const text = error.stack || error.message
    if (text.includes('__name is not defined')) {
      return
    }
    launched.pageErrors.push(text)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      launched.consoleErrors.push(msg.text())
    }
  })
  page.on('crash', () => {
    launched.pageErrors.push('renderer crash')
  })
}

export async function launchDesktop(input: {
  target: TargetInfo
  profile: LaunchProfile
  env: Record<string, string>
}): Promise<LaunchedApp> {
  const stdout: string[] = []
  const stderr: string[] = []
  let executablePath: string
  let args: string[]
  let cwd: string | undefined

  if (input.profile === 'packaged') {
    executablePath = findPackagedBinary(input.target.desktopRoot) ?? packagedBinaryPath(input.target.desktopRoot)
    if (!fs.existsSync(executablePath)) {
      throw new Error(`Packaged binary missing: ${executablePath}. Run npm run pack in apps/desktop first.`)
    }
    args = ['--disable-gpu', '--no-sandbox']
    cwd = undefined
  } else {
    executablePath = resolveElectronBinary([input.target.desktopRoot, input.target.root])
    args = [input.target.desktopRoot, '--disable-gpu', '--no-sandbox']
    cwd = input.target.desktopRoot
  }

  const launchOpts: Parameters<typeof _electron.launch>[0] = {
    executablePath,
    args,
    env: input.env,
  }
  if (cwd) {
    launchOpts.cwd = cwd
  }
  const app = await _electron.launch(launchOpts)

  const child = app.process()
  const pid = child.pid ?? 0
  child.stdout?.on('data', (chunk: Buffer) => {
    stdout.push(chunk.toString('utf8'))
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr.push(chunk.toString('utf8'))
  })

  const main = await app.firstWindow()
  const launched: LaunchedApp = {
    app,
    main,
    pages: new Map([['main', main]]),
    pid,
    stdout,
    stderr,
    pageErrors: [],
    consoleErrors: [],
    closed: false,
  }
  attachPageWatchers(launched, main)

  app.on('window', (page) => {
    const kind = classifyWindowUrl(page.url(), launched.pages.has('main'))
    launched.pages.set(kind, page)
    attachPageWatchers(launched, page)
    logInfo('electron window opened', { kind, url: page.url() })
  })

  app.on('close', () => {
    launched.closed = true
  })

  return launched
}

export function pageFor(launched: LaunchedApp, window: WindowKind): Page {
  return launched.pages.get(window) ?? launched.main
}

export async function markOnboarded(page: Page): Promise<void> {
  await evalInPage(
    page,
    `try {
      localStorage.setItem('hermes-desktop-onboarded-v1', '1');
      localStorage.setItem('hermes-onboarding-skipped-v1', '1');
    } catch (e) {}`,
  )
}

export async function waitReady(
  page: Page,
  bootMs: number,
  opts?: { leaveOnboarding?: boolean },
): Promise<void> {
  await page.waitForSelector('#root', { state: 'attached', timeout: bootMs })
  if (!opts?.leaveOnboarding) {
    await markOnboarded(page)
  }
  const readyBody = `() => {
      var root = document.getElementById('root');
      var text = ((root && root.textContent) || '').trim();
      if (!text) return false;
      if (/something broke|no queryclient/i.test(text)) return true;
      if (document.querySelector('[data-slot="composer-rich-input"], textarea, [contenteditable="true"]')) return true;
      if (/sign in|choose a provider|no inference provider|let'?s get you setup|starting hermes|i'?ll choose a provider later/i.test(text)) return true;
      if (/new session|start chatting/i.test(text)) return true;
      return false;
    }`
  const onboardBody = `() => {
      var root = document.getElementById('root');
      var text = ((root && root.textContent) || '').trim();
      if (!text) return false;
      return /sign in|choose a provider|no inference provider|let'?s get you setup|starting hermes|i'?ll choose a provider later|connect a model provider/i.test(text);
    }`
  if (opts?.leaveOnboarding) {
    try {
      await page.waitForFunction(onboardBody, undefined, { timeout: Math.min(bootMs, 20_000) })
    } catch {
      await page.waitForFunction(readyBody, undefined, { timeout: Math.min(bootMs, 15_000) })
    }
  } else {
    await page.waitForFunction(readyBody, undefined, { timeout: bootMs })
  }
  if (!opts?.leaveOnboarding) {
    const skip = page.getByRole('button', { name: /skip|start chatting|continue without/i }).first()
    if (await skip.isVisible().catch(() => false)) {
      await skip.click({ timeout: 1000 }).catch(() => undefined)
    }
  }
}

export async function openAuxWindows(launched: LaunchedApp, kinds: readonly WindowKind[]): Promise<void> {
  const page = launched.main
  if (kinds.includes('hud')) {
    await evalInPage(
      page,
      `var d = window.hermesDesktop;
       if (d && d.hud && d.hud.open) return d.hud.open({ sessionId: null });`,
    )
  }
  if (kinds.includes('quick')) {
    await openRendererWin(launched, 'quick', 520, 240)
  }
  if (kinds.includes('overlay')) {
    await evalInPage(
      page,
      `var d = window.hermesDesktop;
       if (d && d.petOverlay && d.petOverlay.open) {
         return d.petOverlay.open({ bounds: { x: 80, y: 80, width: 240, height: 260 }, screen: true });
       }`,
    )
  }
  if (kinds.includes('wake')) {
    await evalInPage(
      page,
      `var d = window.hermesDesktop;
       if (d && d.wakeIndicator && d.wakeIndicator.setState) {
         d.wakeIndicator.setState({ visible: true, listening: true });
       }`,
    )
    await new Promise((resolve) => setTimeout(resolve, 400))
    if (!launched.pages.has('wake')) {
      await openRendererWin(launched, 'wake', 280, 80)
    }
  }
}

async function openRendererWin(
  launched: LaunchedApp,
  win: 'quick' | 'wake',
  width: number,
  height: number,
): Promise<void> {
  const open = new Function(
    'mods',
    `var BrowserWindow = mods.BrowserWindow;
     var src = BrowserWindow.getAllWindows()[0];
     if (!src) return;
     var raw = src.webContents.getURL();
     var base = raw.split('#')[0].split('?')[0];
     var child = new BrowserWindow({ width: ${width}, height: ${height}, webPreferences: { preload: src.webContents.getLastWebPreferences ? src.webContents.getLastWebPreferences().preload : undefined, contextIsolation: true, sandbox: true, nodeIntegration: false } });
     child.loadURL(base + '?win=${win}#/');`,
  )
  await launched.app.evaluate(open as never)
}

export async function closeApp(launched: LaunchedApp): Promise<void> {
  try {
    await launched.app.close()
  } catch {
    // Already gone.
  }
  launched.closed = true
  if (launched.pid > 0) {
    killTree(launched.pid)
  }
}

export function killTree(pid: number): void {
  if (pid <= 0) {
    return
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' })
    return
  }
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // gone
    }
  }
}
