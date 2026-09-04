import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'
import { replayActionsOnFreshApp } from '../src/campaign/episode.ts'
import { ddmin } from '../src/reduce/ddmin.ts'
import type { Failure, RecordedAction } from '../src/types.ts'

// Opt in with an installed Electron executable. The fixture never opens a visible window.
const binary = process.env.FUZZ_TEST_ELECTRON
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuzz-electron-integration-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe.skipIf(!binary)('real Electron replay and reduction', () => {
  it('reproduces and minimizes an injected renderer crash, rejects a different fault, and reports missing windows', async () => {
    const electronPackage = path.join(dir, 'node_modules', 'electron')
    fs.mkdirSync(electronPackage, { recursive: true })
    fs.writeFileSync(path.join(electronPackage, 'index.js'), `module.exports = ${JSON.stringify(binary)}`)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fuzzer-fixture', main: 'main.cjs' }))
    fs.writeFileSync(path.join(dir, 'main.cjs'), `
      const { app, BrowserWindow, ipcMain } = require('electron');
      app.setPath('userData', process.env.HERMES_DESKTOP_USER_DATA_DIR);
      app.whenReady().then(() => {
        const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
        ipcMain.on('crash', event => event.sender.forcefullyCrashRenderer());
        win.loadFile('index.html');
      });
    `)
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><div id="root">New session
      <button>Harmless</button><textarea></textarea></div><script>
      window.addEventListener('keydown', event => {
        if (event.key === 'F8') require('electron').ipcRenderer.send('crash');
        if (event.key === 'F9') throw new Error('Different injected fault');
      });</script>`)
    const config = loadConfig(path.join(dir, 'absent.json'))
    config.campaign.bootMs = 5000
    config.campaign.hangMs = 1000
    config.campaign.replayTimeoutMs = 500
    const expected: Failure = { class: 'crash', severity: 'hard', message: 'renderer crash', stack: 'renderer crash', route: '/' }
    const press = (key: string): RecordedAction => ({ type: 'press', key, window: 'main', t: 1, seedStep: 0 })
    const replay = (actions: RecordedAction[]) => replayActionsOnFreshApp({ config, profile: 'ui-only', mutant: 'sane',
      target: { root: dir, desktopRoot: dir, remote: 'fixture', branch: 'main', sha: 'a'.repeat(40), dirty: false },
      expected, actions, unsafeSurfaces: false, windows: [] })
    const actions = [press('a'), press('F8')]
    expect(await replay(actions)).toMatchObject({ status: 'matched', step: 2 })
    const minimized = await ddmin(actions, async (candidate) => (await replay(candidate)).status === 'matched')
    expect(minimized).toEqual([press('F8')])
    expect((await replay([press('F9')])).status).toBe('different-failure')
    expect(await replay([{ ...press('a'), window: 'unknown' }])).toMatchObject({ status: 'diverged', step: 1 })
  }, 90_000)
})
