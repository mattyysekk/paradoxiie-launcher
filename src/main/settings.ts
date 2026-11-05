import { app } from 'electron'
import { readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import type { Settings } from '../shared/types'

const file = (): string => join(app.getPath('userData'), 'settings.json')

const DEFAULTS: Settings = { auto: {}, hideWhilePlaying: true, selected: null }

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8'))
    return { ...DEFAULTS, ...raw, auto: { ...(raw.auto ?? {}) } }
  } catch {
    return { ...DEFAULTS, auto: {} }
  }
}

export function saveSettings(s: Settings): void {
  try {
    const tmp = file() + '.tmp'
    writeFileSync(tmp, JSON.stringify(s, null, 2))
    renameSync(tmp, file())
  } catch {
    /* not fatal */
  }
}
