import { contextBridge, ipcRenderer } from 'electron'
import type { Settings, Snapshot, Toast } from '../shared/types'

const api = {
  state: (): Promise<Snapshot> => ipcRenderer.invoke('state'),
  onState: (fn: (s: Snapshot) => void): (() => void) => {
    const h = (_e: unknown, s: Snapshot): void => fn(s)
    ipcRenderer.on('state', h)
    return () => ipcRenderer.removeListener('state', h)
  },
  onToast: (fn: (t: Toast) => void): (() => void) => {
    const h = (_e: unknown, t: Toast): void => fn(t)
    ipcRenderer.on('toast', h)
    return () => ipcRenderer.removeListener('toast', h)
  },
  install: (id: string): Promise<void> => ipcRenderer.invoke('game:install', id),
  cancel: (id: string): Promise<void> => ipcRenderer.invoke('game:cancel', id),
  play: (id: string): Promise<void> => ipcRenderer.invoke('game:play', id),
  uninstall: (id: string): Promise<void> => ipcRenderer.invoke('game:uninstall', id),
  folder: (id: string): Promise<void> => ipcRenderer.invoke('game:folder', id),
  setAuto: (id: string, on: boolean): Promise<void> => ipcRenderer.invoke('game:auto', id, on),
  check: (): Promise<void> => ipcRenderer.invoke('check'),
  settings: (patch: Partial<Settings>): Promise<void> => ipcRenderer.invoke('settings', patch),
  open: (url: string): Promise<void> => ipcRenderer.invoke('open', url),
  gamesFolder: (): Promise<void> => ipcRenderer.invoke('games-folder'),
  restart: (): Promise<void> => ipcRenderer.invoke('restart')
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
