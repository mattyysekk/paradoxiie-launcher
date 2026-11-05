import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import type { LauncherInfo, Settings, Snapshot, Toast } from '../shared/types'
import { localCatalog, remoteCatalog } from './catalog'
import { Games, gamesRoot } from './games'
import { loadSettings, saveSettings } from './settings'
import { log } from './log'

const CHECK_EVERY = 30 * 60 * 1000

let win: BrowserWindow | null = null
let quitting = false
let settings: Settings = loadSettings()
const launcher: LauncherInfo = { version: app.getVersion(), update: { state: 'none' }, gamesDir: '' }

const single = app.requestSingleInstanceLock()
if (!single) app.quit()
app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

// a new game is on by default; the toggle in the launcher turns it off
const autoOf = (id: string): boolean => settings.auto[id] ?? true

let pushTimer: NodeJS.Timeout | null = null
function push(): void {
  // many small changes (download progress) arrive together: send them at most every 80 ms
  if (pushTimer) return
  pushTimer = setTimeout(() => {
    pushTimer = null
    win?.webContents.send('state', snapshot())
  }, 80)
}
function toast(text: string, tone: Toast['tone']): void {
  win?.webContents.send('toast', { text, tone } satisfies Toast)
}

const games = new Games(
  {
    changed: push,
    toast,
    playing: (any) => {
      if (!win || !settings.hideWhilePlaying) return
      if (any) win.minimize()
      else {
        win.restore()
        win.focus()
      }
    }
  },
  autoOf
)

function snapshot(): Snapshot {
  return { games: games.views(), settings, launcher }
}

let lastCheck = 0
async function checkEverything(): Promise<void> {
  lastCheck = Date.now()
  const remote = await remoteCatalog()
  if (remote) {
    games.setCatalog(remote)
    await games.detectAll()
  }
  await games.checkAll()
  await games.autoUpdate()
}

function setupSelfUpdate(): void {
  if (!app.isPackaged || process.env.PARADOXIIE_NO_SELF_UPDATE) return
  autoUpdater.logger = { info: (m: unknown) => log('self-update', m), warn: (m: unknown) => log('self-update warn', m), error: (m: unknown) => log('self-update error', m), debug: () => undefined }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  const set = (u: LauncherInfo['update']): void => {
    launcher.update = u
    push()
  }
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, pct: 0 }))
  autoUpdater.on('download-progress', (p) => set({ ...launcher.update, state: 'downloading', pct: p.percent }))
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }))
  autoUpdater.on('error', (err) => {
    log('self-update failed', err)
    if (launcher.update.state === 'downloading') set({ state: 'error' })
  })
  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => log('self-update check threw', err))
  }
  check()
  setInterval(check, CHECK_EVERY)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1120,
    height: 700,
    minWidth: 880,
    minHeight: 560,
    show: false,
    title: 'Paradoxiie Launcher',
    backgroundColor: '#000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000000', symbolColor: '#ffb000', height: 38 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.once('ready-to-show', () => win?.show())
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) win.show()
  }, 1500)
  // links in release notes open in the browser, never inside the launcher
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    }
  })
  // coming back to the launcher after a while: look again
  win.on('focus', () => {
    if (Date.now() - lastCheck > 10 * 60 * 1000) void checkEverything()
  })
  win.on('close', (e) => {
    if (games.anyBusy() && !quitting) {
      e.preventDefault()
      toast('Wait for the download to finish (or cancel it) before closing.', 'info')
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function wire(): void {
  const guard =
    <A extends unknown[]>(fn: (...a: A) => Promise<void> | void) =>
    async (_e: unknown, ...a: A): Promise<void> => {
      try {
        await fn(...a)
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'bad')
      }
    }
  ipcMain.handle('state', () => snapshot())
  ipcMain.handle('game:install', guard((id: string) => games.install(id)))
  ipcMain.handle('game:cancel', guard((id: string) => games.cancel(id)))
  ipcMain.handle('game:play', guard((id: string) => games.play(id)))
  ipcMain.handle('game:uninstall', guard((id: string) => games.uninstall(id)))
  ipcMain.handle(
    'game:folder',
    guard((id: string) => {
      const dir = games.folder(id)
      if (dir) void shell.openPath(dir)
    })
  )
  ipcMain.handle(
    'game:auto',
    guard(async (id: string, on: boolean) => {
      settings = { ...settings, auto: { ...settings.auto, [id]: on } }
      saveSettings(settings)
      push()
      if (on) await games.autoUpdate()
    })
  )
  ipcMain.handle('check', guard(() => checkEverything()))
  ipcMain.handle(
    'settings',
    guard((patch: Partial<Settings>) => {
      settings = { ...settings, ...patch, auto: { ...settings.auto, ...(patch.auto ?? {}) } }
      saveSettings(settings)
      push()
    })
  )
  ipcMain.handle('open', guard((url: string) => (/^https?:\/\//.test(url) ? shell.openExternal(url) : undefined)))
  ipcMain.handle(
    'games-folder',
    guard(() => {
      void shell.openPath(gamesRoot())
    })
  )
  ipcMain.handle(
    'restart',
    guard(() => {
      if (launcher.update.state !== 'ready') return
      quitting = true
      autoUpdater.quitAndInstall(true, true)
    })
  )
}

app.whenReady().then(async () => {
  if (!single) return
  log('ready', app.getVersion())
  Menu.setApplicationMenu(null)
  app.setAppUserModelId('com.matt.paradoxiie')
  launcher.gamesDir = gamesRoot()
  games.setCatalog(localCatalog())
  wire()
  createWindow()
  await games.detectAll()
  void checkEverything()
  setInterval(() => void checkEverything(), CHECK_EVERY)
  setupSelfUpdate()
})

app.on('before-quit', () => {
  quitting = true
})
app.on('window-all-closed', () => app.quit())
