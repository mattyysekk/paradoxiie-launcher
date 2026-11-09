/* Updating a game by downloading only what changed.

   A release can carry, next to its installer or zip, a ".pack" (every distinct piece of the built game, each squeezed
   on its own, end to end) and a ".chunks.json" (each file as a list of pieces, and where each piece sits in the pack),
   made by .github/paradoxiie/pack.mjs in the game's releases repository. The pieces are cut where the content says,
   so a change in one place leaves the pieces before and after it alone.

   To update, the launcher cuts the copy you have the same way, keeps every piece it already has, and downloads only
   the missing ones (ranges of the pack). THE CUTTING HERE AND IN pack.mjs MUST MATCH. Every piece is checked against
   its hash before it is used, so a mismatch can only cost a full download, never a broken game. */
import { createHash, type Hash } from 'crypto'
import { closeSync, existsSync, mkdirSync, openSync, readSync, renameSync, rmSync, statSync, writeSync } from 'fs'
import { dirname, join } from 'path'
import { inflateRawSync } from 'zlib'

export interface Index {
  v: number
  files: { p: string; s: number; c: string[] }[]
  /** piece → [where in the pack, squeezed length, length] */
  chunks: Record<string, [number, number, number]>
}

const MIN = 16 * 1024
const MAX = 256 * 1024
const MASK = 0xffff0000
const GEAR = ((): Uint32Array => {
  const g = new Uint32Array(256)
  let x = 0x9e3779b9
  for (let i = 0; i < 256; i++) {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    g[i] = x
  }
  return g
})()
const hex = (h: Hash): string => h.digest('hex').slice(0, 32)
export const hashOf = (b: Uint8Array): string => hex(createHash('sha256').update(b))

/** a file of ours, cut into pieces: each piece's hash, where it starts and how long it is */
interface Cut {
  h: string
  off: number
  len: number
}
/** cut a file the way pack.mjs does, reading it a few MB at a time */
export function cutFile(file: string): Cut[] {
  const out: Cut[] = []
  const fd = openSync(file, 'r')
  try {
    const block = Buffer.alloc(4 << 20)
    let pos = 0
    let start = 0
    let h = 0
    let sha = createHash('sha256')
    for (;;) {
      const n = readSync(fd, block, 0, block.length, pos)
      if (n <= 0) break
      let seg = 0
      for (let i = 0; i < n; i++) {
        h = ((h << 1) + GEAR[block[i]]) >>> 0
        const len = pos + i + 1 - start
        if ((len >= MIN && (h & MASK) === 0) || len >= MAX) {
          sha.update(block.subarray(seg, i + 1))
          out.push({ h: hex(sha), off: start, len })
          start = pos + i + 1
          seg = i + 1
          h = 0
          sha = createHash('sha256')
        }
      }
      sha.update(block.subarray(seg, n))
      pos += n
    }
    if (start < pos) out.push({ h: hex(sha), off: start, len: pos - start })
  } finally {
    closeSync(fd)
  }
  return out
}

/** what we have: each piece, and one place it can be read from */
export interface Have {
  where: Map<string, { file: string; off: number; len: number }>
  /** each file's pieces in order (to tell which files didn't change at all) */
  files: Map<string, string[]>
}
export async function scan(dir: string, idx: Index, tick?: (done: number, total: number) => void | Promise<void>): Promise<Have> {
  const where: Have['where'] = new Map()
  const files: Have['files'] = new Map()
  const list = idx.files.filter((f) => existsSync(join(dir, f.p)))
  const total = list.reduce((s, f) => s + statSync(join(dir, f.p)).size, 0)
  let done = 0
  for (const f of list) {
    const file = join(dir, f.p)
    const cs = cutFile(file)
    for (const c of cs) if (!where.has(c.h)) where.set(c.h, { file, off: c.off, len: c.len })
    files.set(f.p, cs.map((c) => c.h))
    done += statSync(file).size
    await tick?.(done, total)
  }
  return { where, files }
}

/** the pieces to download, as few ranges of the pack as makes sense */
export interface Plan {
  ranges: { start: number; end: number; pieces: string[] }[]
  /** bytes to download, and what the whole pack would be */
  bytes: number
  whole: number
}
export function plan(idx: Index, have: Have): Plan {
  // the pieces the new version uses that we don't have, in pack order
  const used = new Set(idx.files.flatMap((f) => f.c))
  const list = [...used].filter((h) => !have.where.has(h)).sort((a, b) => idx.chunks[a][0] - idx.chunks[b][0])
  const ranges: Plan['ranges'] = []
  const GAP = 64 * 1024
  for (const h of list) {
    const [off, z] = idx.chunks[h]
    const last = ranges[ranges.length - 1]
    if (last && off - last.end <= GAP) {
      last.end = Math.max(last.end, off + z)
      last.pieces.push(h)
    } else ranges.push({ start: off, end: off + z, pieces: [h] })
  }
  const whole = Object.values(idx.chunks).reduce((s, [, z]) => s + z, 0)
  return { ranges, bytes: ranges.reduce((s, r) => s + r.end - r.start, 0), whole }
}

/** one range of a file on the web; must answer with exactly those bytes (HTTP 206) */
export type GetRange = (url: string, start: number, end: number, signal?: AbortSignal) => Promise<Buffer>

/** download the missing pieces, unsqueezed and checked */
export async function fetchPieces(url: string, idx: Index, p: Plan, get: GetRange, progress: (got: number, total: number) => void, signal?: AbortSignal): Promise<Map<string, Buffer>> {
  const got = new Map<string, Buffer>()
  let n = 0
  // a few at a time
  const queue = [...p.ranges]
  const worker = async (): Promise<void> => {
    for (;;) {
      const r = queue.shift()
      if (!r) return
      const buf = await get(url, r.start, r.end - 1, signal)
      if (buf.length !== r.end - r.start) throw new Error(`a piece of the update came back the wrong size (${buf.length} / ${r.end - r.start})`)
      for (const h of r.pieces) {
        const [off, z, len] = idx.chunks[h]
        const piece = inflateRawSync(buf.subarray(off - r.start, off - r.start + z))
        if (piece.length !== len || hashOf(piece) !== h) throw new Error('a piece of the update did not check out')
        got.set(h, piece)
      }
      n += buf.length
      progress(n, p.bytes)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return got
}

/** read a piece we already have (and check it: the file could have changed since it was scanned) */
function readHave(have: Have, h: string): Buffer {
  const w = have.where.get(h)!
  const fd = openSync(w.file, 'r')
  try {
    const b = Buffer.alloc(w.len)
    readSync(fd, b, 0, w.len, w.off)
    if (hashOf(b) !== h) throw new Error('a file of the game changed while it was being updated')
    return b
  } finally {
    closeSync(fd)
  }
}

function writeFile(path: string, f: Index['files'][number], have: Have, got: Map<string, Buffer>): void {
  mkdirSync(dirname(path), { recursive: true })
  const fd = openSync(path, 'w')
  let size = 0
  try {
    for (const h of f.c) {
      const b = got.get(h) ?? readHave(have, h)
      writeSync(fd, b)
      size += b.length
    }
  } finally {
    closeSync(fd)
  }
  if (size !== f.s) throw new Error(`${f.p} came out the wrong size`)
}

const same = (a: string[] | undefined, b: string[]): boolean => !!a && a.length === b.length && a.every((x, i) => x === b[i])

/** the whole new version into an empty folder (a zip game: the folder is then swapped in) */
export function buildInto(out: string, idx: Index, have: Have, got: Map<string, Buffer>): void {
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  for (const f of idx.files) writeFile(join(out, f.p), f, have, got)
}

/** only the files that changed, each written beside the old one and then put in its place (an installed game:
 *  its uninstaller and anything else the installer put there stay). Returns how many files changed. */
export function patchInPlace(dir: string, idx: Index, have: Have, got: Map<string, Buffer>): number {
  const changed = idx.files.filter((f) => !same(have.files.get(f.p), f.c))
  const temp = (p: string): string => join(dir, p) + '.paradoxiie-new'
  try {
    // everything written first, so a failure part-way leaves the game as it was
    for (const f of changed) writeFile(temp(f.p), f, have, got)
  } catch (err) {
    for (const f of changed) rmSync(temp(f.p), { force: true })
    throw err
  }
  for (const f of changed) renameSync(temp(f.p), join(dir, f.p))
  return changed.length
}
