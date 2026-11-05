/* The library: which games the launcher shows. games.json in the launcher's repository is read on every
   start, so a new game appears for everyone without a launcher update; the last copy is kept for offline
   starts, and the one built into the launcher is the fallback. */
import { app, net } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import builtIn from '../../games.json'
import type { GameDef } from '../shared/types'
import { log } from './log'

const REMOTE = process.env.PARADOXIIE_CATALOG || 'https://raw.githubusercontent.com/mattyysekk/paradoxiie-launcher/main/games.json'
const cacheFile = (): string => join(app.getPath('userData'), 'games.json')

function valid(list: unknown): GameDef[] | null {
  if (!list || typeof list !== 'object' || !Array.isArray((list as { games?: unknown }).games)) return null
  const games = (list as { games: GameDef[] }).games.filter(
    (g) => g && typeof g.id === 'string' && typeof g.name === 'string' && typeof g.repo === 'string' && (g.kind === 'nsis' || g.kind === 'zip') && typeof g.asset === 'string'
  )
  return games.length ? games : null
}

/** What we have right now without the network: the last downloaded list, or the built-in one. */
export function localCatalog(): GameDef[] {
  try {
    const cached = valid(JSON.parse(readFileSync(cacheFile(), 'utf8')))
    if (cached) return cached
  } catch {
    /* none yet */
  }
  return valid(builtIn) ?? []
}

/** The current list from GitHub (null when it can't be reached). */
export async function remoteCatalog(): Promise<GameDef[] | null> {
  try {
    if (REMOTE.startsWith('file:') || !/^https?:/.test(REMOTE)) {
      return valid(JSON.parse(readFileSync(REMOTE.replace(/^file:\/\//, ''), 'utf8')))
    }
    const res = await net.fetch(REMOTE + (REMOTE.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const games = valid(JSON.parse(text))
    if (games) writeFileSync(cacheFile(), text)
    return games
  } catch (err) {
    log('catalog: could not load the online list', String(err))
    return null
  }
}
