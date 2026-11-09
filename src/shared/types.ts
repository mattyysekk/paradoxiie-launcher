/** One game in the launcher's library (games.json). */
export interface GameDef {
  id: string
  name: string
  tagline: string
  /** the colour the launcher takes on while this game is selected */
  accent: string
  /** built-in line art ('hullbreak', 'skies') or an image URL */
  art?: string
  /** public GitHub repository whose Releases hold the builds (owner/name) */
  repo: string
  /** nsis: the release has a setup .exe that installs itself; zip: the launcher unpacks a .zip into its own folder */
  kind: 'nsis' | 'zip'
  /** which release file to download (a regular expression on its name) */
  asset: string
  /** the program to start. zip: path inside the unpacked folder (blank: the first .exe found) */
  exe?: string
  /** nsis: the installer's name in Windows' installed apps list */
  installName?: string
  /** nsis: where it installs when the registry doesn't say (%VARS% expand) */
  defaultDir?: string
  /** extra environment variables when the launcher starts the game */
  env?: Record<string, string>
}

export interface Release {
  version: string
  tag: string
  notes: string
  date: string
  url: string
  assetUrl: string | null
  assetName: string | null
  size: number
  /** pieces for updating by downloading only what changed (see src/main/delta.ts), when the release has them */
  packUrl: string | null
  indexUrl: string | null
}

export interface Busy {
  what: 'download' | 'install' | 'uninstall'
  /** 0-100, or null while there's nothing to measure */
  pct: number | null
  text: string
}

export interface GameView {
  def: GameDef
  installed: boolean
  version: string | null
  dir: string | null
  latest: Release | null
  /** true once the release check has answered (even "nothing released yet") */
  checked: boolean
  checking: boolean
  error: string | null
  busy: Busy | null
  running: boolean
  auto: boolean
  /** this platform can't run it (only Windows builds exist) */
  unsupported: boolean
}

export interface Settings {
  /** per game: update by itself */
  auto: Record<string, boolean>
  /** minimise the launcher while a game runs */
  hideWhilePlaying: boolean
  /** the game selected last time */
  selected: string | null
}

export interface LauncherInfo {
  version: string
  /** the launcher's own update */
  update: { state: 'none' | 'downloading' | 'ready' | 'error'; version?: string; pct?: number }
  gamesDir: string
}

export interface Snapshot {
  games: GameView[]
  settings: Settings
  launcher: LauncherInfo
}

export interface Toast {
  text: string
  tone: 'ok' | 'bad' | 'info'
}
