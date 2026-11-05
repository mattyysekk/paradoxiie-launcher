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
