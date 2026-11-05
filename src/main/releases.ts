/* The newest release of a game, from its public GitHub repository (no sign-in needed). */
import { net } from 'electron'
import type { GameDef, Release } from '../shared/types'

const API = process.env.PARADOXIIE_API || 'https://api.github.com'

export class NoRelease extends Error {}

/** "v1.40.0" / "1.40.0" → "1.40.0" */
export const clean = (v: string): string => v.trim().replace(/^v/i, '')

/** -1, 0 or 1, comparing 1.9.0 < 1.10.0; anything after a "-" (1.2.0-beta) sorts before the plain version */
export function compare(a: string, b: string): number {
  const split = (v: string): [number[], string] => {
    const [main, pre = ''] = clean(v).split('-', 2)
    return [main.split('.').map((n) => parseInt(n, 10) || 0), pre]
  }
  const [x, xp] = split(a)
  const [y, yp] = split(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  if (xp === yp) return 0
  if (!xp) return 1
  if (!yp) return -1
  return xp > yp ? 1 : -1
}

export async function latestRelease(game: GameDef): Promise<Release> {
  const res = await net.fetch(`${API}/repos/${game.repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Paradoxiie-Launcher' },
    cache: 'no-store'
  })
  if (res.status === 404) throw new NoRelease('Nothing released yet.')
  if (res.status === 403 || res.status === 429) throw new Error('GitHub asked us to slow down. Trying again later.')
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`)
  const r = (await res.json()) as {
    tag_name: string
    name?: string
    body?: string
    published_at?: string
    html_url: string
    assets: { name: string; browser_download_url: string; size: number }[]
  }
  const re = new RegExp(game.asset, 'i')
  const asset = r.assets.find((a) => re.test(a.name)) ?? null
  return {
    version: clean(r.tag_name),
    tag: r.tag_name,
    notes: r.body ?? '',
    date: r.published_at ?? '',
    url: r.html_url,
    assetUrl: asset?.browser_download_url ?? null,
    assetName: asset?.name ?? null,
    size: asset?.size ?? 0
  }
}
