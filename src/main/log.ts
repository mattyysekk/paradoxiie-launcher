import { app } from 'electron'
import { appendFileSync, mkdirSync, statSync, renameSync } from 'fs'
import { join } from 'path'

let file: string | null = null

/** A small log in the launcher's data folder (logs/launcher.log), for when something goes wrong on someone's PC. */
export function log(...parts: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${parts.map((p) => (p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`
  try {
    if (!file) {
      const dir = join(app.getPath('userData'), 'logs')
      mkdirSync(dir, { recursive: true })
      file = join(dir, 'launcher.log')
      try {
        if (statSync(file).size > 1_000_000) renameSync(file, file + '.old')
      } catch {
        /* no log yet */
      }
    }
    appendFileSync(file, line)
  } catch {
    /* logging never breaks anything */
  }
  if (!app.isPackaged) process.stdout.write(line)
}
