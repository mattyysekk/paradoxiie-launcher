import { net } from 'electron'
import { createWriteStream, mkdirSync, rmSync } from 'fs'
import { dirname } from 'path'

/** Download `url` to `file`, reporting progress (bytes so far, total or 0). Throws on failure, leaving no part file. */
export async function download(url: string, file: string, progress: (got: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  mkdirSync(dirname(file), { recursive: true })
  const res = await net.fetch(url, { headers: { 'User-Agent': 'Paradoxiie-Launcher' }, signal })
  if (!res.ok || !res.body) throw new Error(`The download failed (HTTP ${res.status}).`)
  const total = Number(res.headers.get('content-length')) || 0
  const out = createWriteStream(file)
  let got = 0
  let last = 0
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      got += value.byteLength
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      const now = Date.now()
      if (now - last > 120) {
        last = now
        progress(got, total)
      }
    }
    progress(got, total)
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
    if (total && got !== total) throw new Error('The download was cut off. Try again.')
  } catch (err) {
    out.destroy()
    rmSync(file, { force: true })
    throw err
  }
}

/** one range of a file (bytes start..end, both included); the server must answer with just that part */
export async function getRange(url: string, start: number, end: number, signal?: AbortSignal): Promise<Buffer> {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'Paradoxiie-Launcher', Range: `bytes=${start}-${end}` }, signal })
  if (res.status !== 206) {
    await res.body?.cancel().catch(() => undefined)
    throw new Error(`the server would not send part of the file (HTTP ${res.status})`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** a small JSON file */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'Paradoxiie-Launcher' }, signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}
