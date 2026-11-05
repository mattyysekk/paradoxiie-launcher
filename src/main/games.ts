/* Installing, updating, starting and removing games.

   Two kinds of game:
   - nsis: the release has a setup .exe (Hullbreak). The launcher runs it silently, and finds the installed copy
     through Windows' installed-apps list, so a copy installed before the launcher existed is found too.
   - zip: the release has a .zip (Enemy Skies, a Godot export). The launcher unpacks it into its own Games folder
     and remembers the version in a small file next to it. */
import { app } from 'electron'
import { execFile, spawn, type ChildProcess } from 'child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import extract from 'extract-zip'
import type { Busy, GameDef, GameView, Release } from '../shared/types'
import { download } from './download'
import { compare, latestRelease, NoRelease } from './releases'
import { log } from './log'

const WIN = process.platform === 'win32'
/** testing on Linux: let zip games install and run anyway */
const ANY_OS = !!process.env.PARADOXIIE_ANY_OS

export function gamesRoot(): string {
  if (process.env.PARADOXIIE_GAMES) return process.env.PARADOXIIE_GAMES
  // Local, not Roaming: games are big and belong to this PC
  if (WIN && process.env.LOCALAPPDATA) return join(process.env.LOCALAPPDATA, 'Paradoxiie Launcher', 'Games')
  return join(app.getPath('userData'), 'Games')
}

const expand = (p: string): string => p.replace(/%([^%]+)%/g, (_m, name: string) => process.env[name] ?? process.env[name.toUpperCase()] ?? '')

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 4 << 20 }, (_err, stdout) => resolve(String(stdout ?? '')))
  })
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const mb = (n: number): string => (n / 1048576).toFixed(n > 100 * 1048576 ? 0 : 1)

interface Found {
  dir: string
  version: string | null
  uninstall: string | null
}

/** nsis: where Windows says the game is installed (current user's apps) */
async function findInstalled(def: GameDef): Promise<Found | null> {
  if (WIN && def.installName) {
    const root = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
    const hits = await run('reg', ['query', root, '/s', '/f', def.installName, '/d'])
    const keys = hits.split(/\r?\n/).filter((l) => l.startsWith('HKEY_'))
    for (const key of keys) {
      const out = await run('reg', ['query', key])
      const val = (name: string): string | null => {
        const m = new RegExp(`^\\s+${name}\\s+REG_\\w+\\s+(.*)$`, 'mi').exec(out)
        return m ? m[1].trim() : null
      }
      const name = val('DisplayName') ?? ''
      if (!name.toLowerCase().startsWith(def.installName.toLowerCase())) continue
      // electron-builder doesn't write InstallLocation into this key: the icon and uninstaller paths say where it is
      const dir = val('InstallLocation') || folderOf(val('DisplayIcon')) || folderOf(val('UninstallString'))
      if (!dir || !existsSync(join(dir, def.exe ?? ''))) {
        log('detect', def.id, 'registry entry without a game folder', key, dir)
        continue
      }
      const found = { dir, version: val('DisplayVersion') ?? asarVersion(dir), uninstall: val('QuietUninstallString') ?? val('UninstallString') }
      log('detect', def.id, 'from the registry', found)
      return found
    }
  }
  if (def.defaultDir) {
    const dir = expand(def.defaultDir)
    if (dir && def.exe && existsSync(join(dir, def.exe))) {
      const found = { dir, version: asarVersion(dir), uninstall: null }
      log('detect', def.id, 'in the default folder', found)
      return found
    }
  }
  return null
}

/** "C:\\…\\Game.exe",0  /  "C:\\…\\Uninstall Game.exe" /currentuser  →  the folder holding it */
function folderOf(cmd: string | null): string | null {
  if (!cmd) return null
  const m = /^"([^"]+)"/.exec(cmd) ?? /^(.*?\.exe)\b/i.exec(cmd)
  return m ? dirname(m[1]) : null
}

/** An Electron game's version, from the package.json inside its app.asar.
 *  Read by hand with process.noAsar: going through Electron's own .asar support would keep app.asar open for as long
 *  as the launcher runs, and the game's installer then can't replace it (the "could not uninstall old files: 2" error). */
function asarVersion(dir: string): string | null {
  const file = join(dir, 'resources', 'app.asar')
  const before = process.noAsar
  process.noAsar = true
  let fd = -1
  try {
    fd = openSync(file, 'r')
    const head = Buffer.alloc(16)
    readSync(fd, head, 0, 16, 0)
    const headerSize = head.readUInt32LE(4)
    const jsonSize = head.readUInt32LE(12)
    if (jsonSize > 64 << 20) return null
    const json = Buffer.alloc(jsonSize)
    readSync(fd, json, 0, jsonSize, 16)
    const pkg = JSON.parse(json.toString('utf8')).files?.['package.json'] as { size: number; offset: string; unpacked?: boolean } | undefined
    if (!pkg || pkg.unpacked || pkg.size > 1 << 20) return null
    const body = Buffer.alloc(pkg.size)
    readSync(fd, body, 0, pkg.size, 8 + headerSize + Number(pkg.offset))
    return JSON.parse(body.toString('utf8')).version ?? null
  } catch {
    return null
  } finally {
    if (fd >= 0) closeSync(fd)
    process.noAsar = before
  }
}

const MARK = '.paradoxiie.json'

/** zip: the program inside the unpacked folder */
function zipExe(def: GameDef, dir: string): string | null {
  if (def.exe) return existsSync(join(dir, def.exe)) ? join(dir, def.exe) : null
  let files: string[] = []
  try {
    files = readdirSync(dir)
  } catch {
    return null
  }
  // Godot debug exports come with a ".console.exe" next to the game: start the game itself
  const exe = files.find((f) => /\.exe$/i.test(f) && !/\.console\.exe$/i.test(f))
  if (exe) return join(dir, exe)
  if (ANY_OS) {
    const other = files.find((f) => /\.(x86_64|sh)$/i.test(f))
    if (other) return join(dir, other)
  }
  return null
}

interface Entry {
  def: GameDef
  view: GameView
  found: Found | null
  child: ChildProcess | null
  abort: AbortController | null
  /** update when the game closes (auto-update found one while it was running) */
  afterExit: boolean
}

export interface Events {
  changed: () => void
  toast: (text: string, tone: 'ok' | 'bad' | 'info') => void
  playing: (any: boolean) => void
}

export class Games {
  private list: Entry[] = []

  constructor(
    private ev: Events,
    private autoOf: (id: string) => boolean
  ) {}

  views(): GameView[] {
    return this.list.map((e) => ({ ...e.view, auto: this.autoOf(e.def.id) }))
  }

  /** replace the library (keeps what's known about games that stay) */
  setCatalog(defs: GameDef[]): void {
    const old = new Map(this.list.map((e) => [e.def.id, e]))
    this.list = defs.map((def) => {
      const e = old.get(def.id)
      if (e) {
        e.def = def
        e.view.def = def
        return e
      }
      const unsupported = !WIN && !ANY_OS
      return {
        def,
        found: null,
        child: null,
        abort: null,
        afterExit: false,
        view: { def, installed: false, version: null, dir: null, latest: null, checked: false, checking: false, error: null, busy: null, running: false, auto: true, unsupported }
      }
    })
    this.ev.changed()
  }

  private get(id: string): Entry {
    const e = this.list.find((x) => x.def.id === id)
    if (!e) throw new Error(`No game called ${id}.`)
    return e
  }

  private set(e: Entry, patch: Partial<GameView>): void {
    Object.assign(e.view, patch)
    this.ev.changed()
  }

  private busy(e: Entry, b: Busy | null): void {
    this.set(e, { busy: b })
  }

  /** look at what's on this PC */
  async detect(e: Entry): Promise<void> {
    if (e.def.kind === 'nsis') {
      e.found = await findInstalled(e.def)
      this.set(e, { installed: !!e.found, version: e.found?.version ?? null, dir: e.found?.dir ?? null })
      return
    }
    const dir = join(gamesRoot(), e.def.id)
    let version: string | null = null
    try {
      version = JSON.parse(readFileSync(join(dir, MARK), 'utf8')).version ?? null
    } catch {
      /* not installed */
    }
    const ok = !!version && !!zipExe(e.def, dir)
    e.found = ok ? { dir, version, uninstall: null } : null
    this.set(e, { installed: ok, version: ok ? version : null, dir: ok ? dir : null })
  }

  async detectAll(): Promise<void> {
    await Promise.all(this.list.map((e) => this.detect(e).catch((err) => log('detect', e.def.id, err))))
  }

  /** ask GitHub for each game's newest release */
  async checkAll(): Promise<void> {
    await Promise.all(this.list.map((e) => this.check(e)))
  }

  async check(e: Entry): Promise<Release | null> {
    if (e.view.checking) return e.view.latest
    this.set(e, { checking: true })
    try {
      const latest = await latestRelease(e.def)
      this.set(e, { latest, checked: true, checking: false, error: null })
      return latest
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (err instanceof NoRelease) this.set(e, { latest: null, checked: true, checking: false, error: null })
      else this.set(e, { checking: false, checked: true, error: msg.includes('fetch') || msg.includes('ERR_') ? 'Offline: could not reach GitHub.' : msg })
      log('check', e.def.id, msg)
      return null
    }
  }

  hasUpdate(id: string): boolean {
    const v = this.get(id).view
    return v.installed && !!v.latest && !!v.version && compare(v.latest.version, v.version) > 0
  }

  /** auto-update: every installed game with a newer release and auto on (a running game updates when it closes) */
  async autoUpdate(): Promise<void> {
    for (const e of this.list) {
      if (!this.autoOf(e.def.id) || !this.hasUpdate(e.def.id) || e.view.busy || e.view.unsupported) continue
      if (e.view.running) {
        e.afterExit = true
        continue
      }
      await this.install(e.def.id, true).catch(() => undefined)
    }
  }

  cancel(id: string): void {
    this.get(id).abort?.abort()
  }

  /** install, or update to the newest release */
  async install(id: string, auto = false): Promise<void> {
    const e = this.get(id)
    if (e.view.busy) return
    if (e.view.running) throw new Error(`Close ${e.def.name} first.`)
    if (e.view.unsupported) throw new Error(`${e.def.name} only runs on Windows.`)
    const updating = e.view.installed
    const latest = e.view.latest ?? (await this.check(e))
    if (!latest) {
      this.ev.toast(e.view.error ?? `${e.def.name} has no release yet.`, 'bad')
      return
    }
    if (!latest.assetUrl || !latest.assetName) {
      this.ev.toast(`The ${latest.version} release of ${e.def.name} has no download yet. Try again in a few minutes.`, 'bad')
      return
    }
    const file = join(tmpdir(), 'paradoxiie-launcher', latest.assetName)
    const ctl = new AbortController()
    e.abort = ctl
    try {
      this.busy(e, { what: 'download', pct: 0, text: `Downloading ${latest.version}…` })
      await download(
        latest.assetUrl,
        file,
        (got, total) => {
          const t = total || latest.size
          this.busy(e, { what: 'download', pct: t ? (got / t) * 100 : null, text: t ? `Downloading ${latest.version}: ${mb(got)} / ${mb(t)} MB` : `Downloading ${latest.version}: ${mb(got)} MB` })
        },
        ctl.signal
      )
      e.abort = null
      this.busy(e, { what: 'install', pct: null, text: updating ? `Updating to ${latest.version}…` : `Installing ${latest.version}…` })
      if (e.def.kind === 'nsis') await this.runSetup(e, file, latest.version)
      else await this.unpack(e, file, latest.version)
      rmSync(file, { force: true })
      await this.detect(e)
      if (!e.view.installed) throw new Error('The installer finished, but the game is not where it should be.')
      log('installed', id, latest.version)
      this.ev.toast(updating ? `${e.def.name} updated to ${latest.version}${auto ? ' automatically' : ''}.` : `${e.def.name} ${latest.version} is installed.`, 'ok')
    } catch (err) {
      const aborted = ctl.signal.aborted
      log('install failed', id, err)
      this.ev.toast(aborted ? 'Download cancelled.' : `${e.def.name}: ${err instanceof Error ? err.message : String(err)}`, aborted ? 'info' : 'bad')
      rmSync(file, { force: true })
    } finally {
      e.abort = null
      this.busy(e, null)
    }
  }

  private async runSetup(e: Entry, file: string, version: string): Promise<void> {
    // one-click per-user installer: /S installs silently in place (an older copy is replaced)
    const code = await new Promise<number>((resolve, reject) => {
      const p = spawn(file, ['/S'], { windowsHide: true })
      p.on('error', reject)
      p.on('exit', (c) => resolve(c ?? 0))
    })
    if (code === 2)
      throw new Error(`Windows wouldn't let the installer replace the old files: something still has one of them open. Close the game (and anything opened from its folder) and try again. If it keeps happening, restart the PC first.`)
    if (code !== 0) throw new Error(`The installer stopped with code ${code}. Is the game still open?`)
    // the installed-apps entry can trail the installer by a moment
    for (let i = 0; i < 20; i++) {
      await this.detect(e)
      if (e.view.installed && e.view.version && compare(e.view.version, version) >= 0) return
      await wait(500)
    }
  }

  private async unpack(e: Entry, file: string, version: string): Promise<void> {
    const dir = join(gamesRoot(), e.def.id)
    const fresh = dir + '.new'
    const old = dir + '.old'
    rmSync(fresh, { recursive: true, force: true })
    rmSync(old, { recursive: true, force: true })
    mkdirSync(fresh, { recursive: true })
    await extract(file, { dir: fresh })
    // a zip holding one folder: use what's inside it
    let root = fresh
    const top = readdirSync(fresh)
    if (top.length === 1 && statSync(join(fresh, top[0])).isDirectory()) root = join(fresh, top[0])
    if (!zipExe(e.def, root)) throw new Error('The download has no game program in it.')
    writeFileSync(join(root, MARK), JSON.stringify({ version, installed: new Date().toISOString() }))
    if (existsSync(dir)) renameSync(dir, old)
    try {
      renameSync(root, dir)
    } catch (err) {
      if (existsSync(old) && !existsSync(dir)) renameSync(old, dir)
      throw err
    }
    rmSync(fresh, { recursive: true, force: true })
    rmSync(old, { recursive: true, force: true })
  }

  async uninstall(id: string): Promise<void> {
    const e = this.get(id)
    if (e.view.busy || !e.view.installed) return
    if (e.view.running) throw new Error(`Close ${e.def.name} first.`)
    this.busy(e, { what: 'uninstall', pct: null, text: 'Removing…' })
    try {
      if (e.def.kind === 'nsis') {
        const cmd = e.found?.uninstall
        if (!cmd) throw new Error('Windows does not list an uninstaller for it. Remove it from Settings → Apps.')
        const m = /^"([^"]+)"\s*(.*)$/.exec(cmd) ?? /^(\S+)\s*(.*)$/.exec(cmd)
        if (!m) throw new Error('Could not read the uninstaller.')
        const args = m[2] ? m[2].split(/\s+/).filter(Boolean) : []
        if (!args.includes('/S')) args.push('/S')
        await new Promise<void>((resolve, reject) => {
          const p = spawn(m[1], args, { windowsHide: true })
          p.on('error', reject)
          p.on('exit', () => resolve())
        })
        // the uninstaller copies itself away and returns at once: wait for the game to go
        for (let i = 0; i < 60 && existsSync(join(e.found!.dir, e.def.exe ?? '')); i++) await wait(500)
      } else {
        rmSync(join(gamesRoot(), e.def.id), { recursive: true, force: true })
      }
      await this.detect(e)
      this.ev.toast(e.view.installed ? `${e.def.name} could not be fully removed.` : `${e.def.name} was removed.`, e.view.installed ? 'bad' : 'info')
    } catch (err) {
      this.ev.toast(err instanceof Error ? err.message : String(err), 'bad')
    } finally {
      this.busy(e, null)
    }
  }

  play(id: string): void {
    const e = this.get(id)
    if (!e.view.installed || e.view.running || e.view.busy) return
    const exe = e.def.kind === 'nsis' ? join(e.found!.dir, e.def.exe ?? '') : zipExe(e.def, e.found!.dir)
    if (!exe || !existsSync(exe)) {
      this.ev.toast(`Could not find ${e.def.name}'s program. Try installing it again.`, 'bad')
      void this.detect(e)
      return
    }
    log('play', id, exe)
    const child = spawn(exe, [], { cwd: dirname(exe), detached: true, stdio: 'ignore', env: { ...process.env, ...(e.def.env ?? {}) } })
    e.child = child
    this.set(e, { running: true })
    this.ev.playing(true)
    child.on('error', (err) => {
      log('play failed', id, err)
      this.ev.toast(`${e.def.name} would not start: ${err.message}`, 'bad')
    })
    child.on('exit', () => {
      e.child = null
      this.set(e, { running: false })
      this.ev.playing(this.list.some((x) => x.view.running))
      if (e.afterExit) {
        e.afterExit = false
        void this.install(id, true)
      }
    })
    child.unref()
  }

  anyBusy(): boolean {
    return this.list.some((e) => !!e.view.busy)
  }

  folder(id: string): string | null {
    return this.get(id).view.dir
  }
}
