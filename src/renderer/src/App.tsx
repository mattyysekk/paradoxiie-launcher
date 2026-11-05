import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react'
import type { GameView, Snapshot, Toast } from '../../shared/types'
import { Art } from './art'
import { Markdown } from './md'

const newer = (a: string, b: string): boolean => {
  const p = (v: string): number[] => v.replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0)
  const x = p(a)
  const y = p(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}
const hasUpdate = (g: GameView): boolean => g.installed && !!g.latest && !!g.version && newer(g.latest.version, g.version)
const mb = (n: number): string => `${Math.max(1, Math.round(n / 1048576))} MB`
const day = (iso: string): string => {
  const d = new Date(iso)
  return isNaN(+d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** a release's notes without the download instructions under the last "---" (meant for the GitHub page) */
const notesOf = (body: string): string => {
  const parts = body.replace(/\r/g, '').split(/\n-{3,}\n/)
  return (parts.length > 1 ? parts.slice(0, -1).join('\n---\n') : body).trim()
}

/** the short line under each game in the library */
function status(g: GameView): { text: string; tone?: 'hot' | 'bad' | 'dim' } {
  if (g.unsupported) return { text: 'Windows only', tone: 'dim' }
  if (g.busy) return { text: g.busy.pct != null ? `${g.busy.text.split(':')[0]} ${Math.floor(g.busy.pct)}%` : g.busy.text, tone: 'hot' }
  if (g.running) return { text: 'Playing now', tone: 'hot' }
  if (hasUpdate(g)) return { text: `Update: ${g.latest!.version}`, tone: 'hot' }
  if (g.installed) return { text: `${g.version} · up to date` }
  if (g.checked && !g.latest && !g.error) return { text: 'Coming soon', tone: 'dim' }
  if (g.error && !g.latest) return { text: 'Not installed', tone: 'dim' }
  return { text: 'Not installed', tone: 'dim' }
}

function Toasts({ list, drop }: { list: (Toast & { id: number })[]; drop: (id: number) => void }): JSX.Element {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <button key={t.id} className={`toast ${t.tone}`} onClick={() => drop(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  )
}

function Switch({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }): JSX.Element {
  return (
    <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => set(!on)}>
      <span className="track">
        <span className="knob" />
      </span>
      {label}
    </button>
  )
}

function Confirm({ text, yes, onYes, onNo }: { text: string; yes: string; onYes: () => void; onNo: () => void }): JSX.Element {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <div className="scrim" onClick={onNo} onKeyDown={(e) => e.key === 'Escape' && onNo()}>
      <div className="dialog" role="alertdialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <p>{text}</p>
        <div className="row">
          <button className="btn ghost" ref={ref} onClick={onNo}>
            Keep it
          </button>
          <button className="btn danger" onClick={onYes}>
            {yes}
          </button>
        </div>
      </div>
    </div>
  )
}

function Game({ g, onRemove }: { g: GameView; onRemove: () => void }): JSX.Element {
  const [menu, setMenu] = useState(false)
  const id = g.def.id
  const upd = hasUpdate(g)
  const b = g.busy

  let primary: JSX.Element
  if (g.unsupported) primary = <button className="btn big" disabled>Windows only</button>
  else if (b)
    primary = (
      <button className="btn big" disabled>
        {b.what === 'download' ? 'Downloading…' : b.what === 'install' ? (g.installed ? 'Updating…' : 'Installing…') : 'Removing…'}
      </button>
    )
  else if (g.running) primary = <button className="btn big" disabled>Playing</button>
  else if (upd)
    primary = (
      <button className="btn big" onClick={() => void window.api.install(id)}>
        Update to {g.latest!.version}
      </button>
    )
  else if (g.installed)
    primary = (
      <button className="btn big" onClick={() => void window.api.play(id)}>
        Play
      </button>
    )
  else if (g.latest)
    primary = (
      <button className="btn big" onClick={() => void window.api.install(id)}>
        Install{g.latest.size ? <span className="size">{mb(g.latest.size)}</span> : null}
      </button>
    )
  else
    primary = (
      <button className="btn big" disabled>
        {g.checking || !g.checked ? 'Checking…' : g.error ? 'Offline' : 'Coming soon'}
      </button>
    )

  return (
    <section className="game" aria-label={g.def.name}>
      <div className="hero">
        <Art art={g.def.art} />
        <div className="title">
          <h1>{g.def.name}</h1>
          <p>{g.def.tagline}</p>
        </div>
      </div>

      <div className="actions">
        {primary}
        {upd && !b && !g.running && (
          <button className="btn ghost" onClick={() => void window.api.play(id)}>
            Play {g.version}
          </button>
        )}
        <div className="facts">
          {g.installed ? (
            <span>
              Installed <b>{g.version}</b>
            </span>
          ) : null}
          {g.latest && !(g.installed && g.version === g.latest.version) ? (
            <span>
              Newest <b>{g.latest.version}</b>
            </span>
          ) : g.installed && g.latest ? (
            <span>Up to date</span>
          ) : null}
          {g.error ? <span className="bad">{g.error}</span> : null}
        </div>
        <div className="spacer" />
        {!g.unsupported && <Switch on={g.auto} set={(v) => void window.api.setAuto(id, v)} label="Update by itself" />}
        <div className="more">
          <button className="btn icon" aria-label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            ···
          </button>
          {menu && (
            <div className="menu" onMouseLeave={() => setMenu(false)}>
              <button
                onClick={() => {
                  setMenu(false)
                  void window.api.check()
                }}
              >
                Check for updates
              </button>
              {g.installed && (
                <button
                  onClick={() => {
                    setMenu(false)
                    void window.api.folder(id)
                  }}
                >
                  Open game folder
                </button>
              )}
              {g.latest && (
                <button
                  onClick={() => {
                    setMenu(false)
                    void window.api.open(g.latest!.url)
                  }}
                >
                  Release page on GitHub
                </button>
              )}
              {g.installed && !g.running && !b && (
                <button
                  className="danger"
                  onClick={() => {
                    setMenu(false)
                    onRemove()
                  }}
                >
                  Uninstall…
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`progress ${b ? 'show' : ''}`}>
        {b && (
          <>
            <div className={`bar ${b.pct == null ? 'busy' : ''}`}>
              <i style={{ width: b.pct == null ? undefined : `${b.pct}%` }} />
            </div>
            <div className="ptext">
              <span>{b.text}</span>
              {b.what === 'download' && (
                <button className="link" onClick={() => void window.api.cancel(id)}>
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="notes">
        {g.latest ? (
          <>
            <h2>
              What&rsquo;s new in {g.latest.version}
              {g.latest.date && <span className="date">{day(g.latest.date)}</span>}
            </h2>
            {notesOf(g.latest.notes) ? (
              <Markdown text={notesOf(g.latest.notes)} />
            ) : (
              <p className="dim">This version came without notes.</p>
            )}
          </>
        ) : (
          <p className="dim">{g.checked ? (g.error ? 'Release notes appear here once GitHub can be reached.' : `${g.def.name} hasn’t been released yet. It shows up here the moment it is.`) : 'Looking for the newest version…'}</p>
        )}
      </div>
    </section>
  )
}

function SettingsPanel({ s, close }: { s: Snapshot; close: () => void }): JSX.Element {
  const u = s.launcher.update
  return (
    <section className="settings" aria-label="Settings">
      <h1>Settings</h1>
      <div className="setting">
        <Switch on={s.settings.hideWhilePlaying} set={(v) => void window.api.settings({ hideWhilePlaying: v })} label="Minimise the launcher while a game is running" />
      </div>
      <div className="setting">
        <div className="label">Games folder</div>
        <div className="path">{s.launcher.gamesDir}</div>
        <button className="btn ghost" onClick={() => void window.api.gamesFolder()}>
          Open folder
        </button>
        <p className="dim">Hullbreak installs where its own installer puts it, so it stays the same copy you already had.</p>
      </div>
      <div className="setting">
        <div className="label">Updates for each game</div>
        {s.games
          .filter((g) => !g.unsupported)
          .map((g) => (
            <Switch key={g.def.id} on={g.auto} set={(v) => void window.api.setAuto(g.def.id, v)} label={`${g.def.name} updates by itself`} />
          ))}
      </div>
      <div className="setting">
        <div className="label">Paradoxiie Launcher {s.launcher.version}</div>
        <p className="dim">
          {u.state === 'ready'
            ? `Version ${u.version} is downloaded and installs when you restart.`
            : u.state === 'downloading'
              ? `Downloading version ${u.version}…`
              : u.state === 'error'
                ? 'The last launcher update failed. It tries again later.'
                : 'The launcher keeps itself up to date.'}
        </p>
        <button className="btn ghost" onClick={() => void window.api.check()}>
          Check for updates now
        </button>
      </div>
      <button className="btn" onClick={close}>
        Done
      </button>
    </section>
  )
}

export function App(): JSX.Element {
  const [s, setS] = useState<Snapshot | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [settings, setSettings] = useState(false)
  const [toasts, setToasts] = useState<(Toast & { id: number })[]>([])
  const [remove, setRemove] = useState<GameView | null>(null)
  const nextId = useRef(1)

  useEffect(() => {
    void window.api.state().then(setS)
    const off1 = window.api.onState(setS)
    const off2 = window.api.onToast((t) => {
      const id = nextId.current++
      setToasts((l) => [...l.slice(-3), { ...t, id }])
      setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), t.tone === 'bad' ? 9000 : 5000)
    })
    return () => {
      off1()
      off2()
    }
  }, [])

  const game = useMemo(() => {
    if (!s) return null
    const id = sel ?? s.settings.selected
    return s.games.find((g) => g.def.id === id) ?? s.games[0] ?? null
  }, [s, sel])

  const pick = (id: string): void => {
    setSel(id)
    setSettings(false)
    void window.api.settings({ selected: id })
  }

  if (!s) return <div className="app" />
  const u = s.launcher.update
  const accent = game?.def.accent ?? '#ffb000'

  return (
    <div className="app" style={{ '--p': accent } as CSSProperties}>
      <header className="titlebar">
        <span className="word">Paradoxiie</span>
        <span className="sub">launcher</span>
        {u.state === 'ready' && (
          <button className="ready" onClick={() => void window.api.restart()}>
            Launcher {u.version} is ready. Restart to update
          </button>
        )}
      </header>

      <nav className="rail" aria-label="Library">
        <div className="rail-head">Library</div>
        {s.games.map((g) => {
          const st = status(g)
          const on = !settings && game?.def.id === g.def.id
          return (
            <button key={g.def.id} className={`entry ${on ? 'on' : ''}`} style={{ '--g': g.def.accent } as CSSProperties} aria-current={on} onClick={() => pick(g.def.id)}>
              <span className="name">{g.def.name}</span>
              <span className={`st ${st.tone ?? ''}`}>
                {hasUpdate(g) && !g.busy && <i className="dot" />}
                {st.text}
              </span>
            </button>
          )
        })}
        <div className="spacer" />
        <button className={`entry small ${settings ? 'on' : ''}`} onClick={() => setSettings(!settings)}>
          <span className="name">Settings</span>
        </button>
        <div className="ver">v{s.launcher.version}</div>
      </nav>

      <main className="main">{settings ? <SettingsPanel s={s} close={() => setSettings(false)} /> : game ? <Game key={game.def.id} g={game} onRemove={() => setRemove(game)} /> : <p className="empty">No games in the library yet.</p>}</main>

      <Toasts list={toasts} drop={(id) => setToasts((l) => l.filter((x) => x.id !== id))} />
      {remove && (
        <Confirm
          text={`Remove ${remove.def.name} from this PC? Your saves stay; you can install it again any time.`}
          yes="Uninstall"
          onNo={() => setRemove(null)}
          onYes={() => {
            void window.api.uninstall(remove.def.id)
            setRemove(null)
          }}
        />
      )}
    </div>
  )
}
