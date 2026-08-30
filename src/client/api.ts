/**
 * Transport for the /api/draw2code/* routes — same-origin fetch, envelope
 * decode, never throws.
 * @module dsh-draw2code/client/api
 */

/** One route envelope: ok + payload, or ok:false + error. */
export type D2cResult<T> = ({ ok: true } & T) | { ok: false; error: { code: string; message: string } }

/** One listing row from the host. */
export interface SceneMetaRow {
  name: string
  rev: number
  elementCount: number
  updatedAt: number
}

/** A whole scene as the canvas consumes it. */
export interface ScenePayload {
  elements: Array<Record<string, unknown>>
  appState: { viewBackgroundColor: string }
}

/** One archived version of a board. */
export interface VersionRow {
  id: string
  ts: number
  elementCount: number
}

export interface WorkspaceMetaRow {
  root: string
  name: string
  boardCount: number
}

export interface BoardRevealRequest {
  id: string
  board: string
  revision: number
  createdAt: number
  consumedAt?: number
}

interface ExportPayload {
  exported?: boolean
  cancelled?: boolean
  path?: string
}

interface NativeExportResult extends ExportPayload {
  id: string
  ok: boolean
  error?: string
}

interface NativeExportBridge {
  postMessage: (message: unknown) => void
}

interface ElectronExportBridge {
  exportScene: (message: { scene: ScenePayload; filename: string }) => Promise<D2cResult<ExportPayload>>
}

interface DshWindow extends Window {
  __dshExportResult?: (result: NativeExportResult) => void
  dshElectron?: ElectronExportBridge
  webkit?: {
    messageHandlers?: {
      dshExport?: NativeExportBridge
    }
  }
}

interface FileSystemAccessWindow extends Window {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: Array<{ description?: string; accept: Record<string, string[]> }>
  }) => Promise<{
    name: string
    createWritable: () => Promise<{
      write: (data: string) => Promise<void>
      close: () => Promise<void>
    }>
  }>
}

const nativeExportWaiters = new Map<string, (result: D2cResult<ExportPayload>) => void>()

function electronExport(scene: ScenePayload, filename: string): Promise<D2cResult<ExportPayload>> | null {
  const bridge = (window as DshWindow).dshElectron
  if (bridge === undefined) return null
  return bridge.exportScene({ scene, filename })
}

function nativeExport(scene: ScenePayload, filename: string): Promise<D2cResult<ExportPayload>> | null {
  const dshWindow = window as DshWindow
  const bridge = dshWindow.webkit?.messageHandlers?.dshExport
  if (bridge === undefined) return null

  if (dshWindow.__dshExportResult === undefined) {
    dshWindow.__dshExportResult = (result) => {
      const resolve = nativeExportWaiters.get(result.id)
      if (resolve === undefined) return
      nativeExportWaiters.delete(result.id)
      resolve(result.ok
        ? { ok: true, exported: result.exported, cancelled: result.cancelled, path: result.path }
        : { ok: false, error: { code: 'export-failed', message: result.error ?? 'native export failed' } })
    }
  }

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return new Promise((resolve) => {
    nativeExportWaiters.set(id, resolve)
    try {
      bridge.postMessage({ id, filename, scene })
    } catch (error) {
      nativeExportWaiters.delete(id)
      resolve({ ok: false, error: { code: 'export-failed', message: error instanceof Error ? error.message : String(error) } })
    }
  })
}

async function fileSystemExport(scene: ScenePayload, filename: string): Promise<D2cResult<ExportPayload> | null> {
  const picker = (window as FileSystemAccessWindow).showSaveFilePicker
  if (picker === undefined) return null
  try {
    const handle = await picker({
      suggestedName: filename,
      types: [{ description: 'Excalidraw drawing', accept: { 'application/vnd.excalidraw+json': ['.excalidraw'] } }],
    })
    const writable = await handle.createWritable()
    await writable.write(`${JSON.stringify(scene, null, 2)}\n`)
    await writable.close()
    return { ok: true, exported: true, path: handle.name }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return { ok: true, cancelled: true }
    return { ok: false, error: { code: 'export-failed', message: error instanceof Error ? error.message : String(error) } }
  }
}

async function get<T>(path: string, token?: string): Promise<D2cResult<T>> {
  try {
    const response = await fetch(path, { method: 'GET', headers: token === undefined ? undefined : { authorization: `Bearer ${token}` } })
    return await response.json() as D2cResult<T>
  } catch {
    return { ok: false, error: { code: 'internal', message: 'route unavailable' } }
  }
}

async function send<T>(path: string, method: string, body?: unknown, token?: string): Promise<D2cResult<T>> {
  try {
    const response = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return await response.json() as D2cResult<T>
  } catch {
    return { ok: false, error: { code: 'internal', message: 'route unavailable' } }
  }
}

/** The host route client. */
export class D2cApi {
  constructor(private readonly options: { baseUrl?: string; token?: string } = {}) {}

  private path(path: string): string {
    return `${this.options.baseUrl?.replace(/\/$/, '') ?? ''}${path}`
  }

  /** WebSocket-first scene notifications; callers keep polling as fallback. */
  subscribe(root: string, listener: (event: Record<string, unknown>) => void): () => void {
    if (typeof WebSocket === 'undefined') return () => undefined
    let socket: WebSocket | null = null
    let cancelled = false
    const connect = async (): Promise<void> => {
      let url: URL
      if (this.options.baseUrl === undefined) {
        const response = await get<{ url: string }>(`/api/draw2code/events-config?root=${encodeURIComponent(root)}`)
        if (!response.ok) return
        url = new URL(response.url)
      } else {
        url = new URL(this.path('/events'))
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
        url.searchParams.set('root', root)
        if (this.options.token !== undefined) url.searchParams.set('token', this.options.token)
      }
      if (cancelled) return
      socket = new WebSocket(url)
      socket.addEventListener('message', (message) => {
        try {
          const event = JSON.parse(String(message.data)) as Record<string, unknown>
          if (event.root === undefined || event.root === root) listener(event)
        } catch { /* ignore malformed notifications; polling remains active */ }
      })
    }
    void connect().catch(() => undefined)
    return () => {
      cancelled = true
      socket?.close()
    }
  }

  list(root: string): Promise<D2cResult<{ scenes: SceneMetaRow[] }>> {
    return get(this.path(`/api/draw2code/scenes?root=${encodeURIComponent(root)}`), this.options.token)
  }

  listWorkspaces(root: string): Promise<D2cResult<{ workspaces: WorkspaceMetaRow[] }>> {
    return get(this.path(`/canvas-workspaces?root=${encodeURIComponent(root)}`), this.options.token)
  }

  switchWorkspace(root: string, targetRoot: string): Promise<D2cResult<{ root: string; token: string; expiresAt: number; url: string }>> {
    return send(this.path('/canvas-workspace-token'), 'POST', { root, targetRoot }, this.options.token)
  }

  getActiveBoard(root: string): Promise<D2cResult<{ name: string | null }>> {
    return get(this.path(`/api/draw2code/active-board?root=${encodeURIComponent(root)}`), this.options.token)
  }

  setActiveBoard(root: string, name: string): Promise<D2cResult<{ name: string }>> {
    return send(this.path('/api/draw2code/active-board'), 'PUT', { root, name }, this.options.token)
  }

  getBoardReveal(root: string): Promise<D2cResult<{ request: BoardRevealRequest | null }>> {
    return get(this.path(`/api/draw2code/reveal-request?root=${encodeURIComponent(root)}`), this.options.token)
  }

  ackBoardReveal(root: string, id: string, board: string): Promise<D2cResult<BoardRevealRequest>> {
    return send(this.path('/api/draw2code/reveal-request'), 'PUT', { root, id, board }, this.options.token)
  }

  read(root: string, name: string): Promise<D2cResult<{ rev: number; scene: ScenePayload }>> {
    return get(this.path(`/api/draw2code/scene?root=${encodeURIComponent(root)}&name=${encodeURIComponent(name)}`), this.options.token)
  }

  create(root: string, name: string): Promise<D2cResult<{ rev: number; elementCount: number }>> {
    return send(this.path('/api/draw2code/scene'), 'POST', { root, name }, this.options.token)
  }

  write(root: string, name: string, scene: ScenePayload, baseRev?: number): Promise<D2cResult<{ rev: number; elementCount: number }>> {
    return send(this.path('/api/draw2code/scene/write'), 'PUT', { root, name, scene, baseRev }, this.options.token)
  }

  remove(root: string, name: string): Promise<D2cResult<{ deleted: true }>> {
    return send(this.path(`/api/draw2code/scene?root=${encodeURIComponent(root)}&name=${encodeURIComponent(name)}`), 'DELETE', undefined, this.options.token)
  }

  listVersions(root: string, name: string): Promise<D2cResult<{ versions: VersionRow[] }>> {
    return get(this.path(`/api/draw2code/versions?root=${encodeURIComponent(root)}&name=${encodeURIComponent(name)}`), this.options.token)
  }

  readVersion(root: string, name: string, id: string): Promise<D2cResult<VersionRow & { scene: ScenePayload }>> {
    return get(this.path(`/api/draw2code/version?root=${encodeURIComponent(root)}&name=${encodeURIComponent(name)}&id=${encodeURIComponent(id)}`), this.options.token)
  }

  restoreVersion(root: string, name: string, id: string): Promise<D2cResult<{ rev: number; elementCount: number }>> {
    return send(this.path('/api/draw2code/restore'), 'POST', { root, name, id }, this.options.token)
  }

  async exportScene(scene: ScenePayload, filename = 'prototype.excalidraw'): Promise<D2cResult<ExportPayload>> {
    const electronResult = electronExport(scene, filename)
    if (electronResult !== null) return electronResult
    const nativeResult = nativeExport(scene, filename)
    if (nativeResult !== null) return nativeResult
    const filePickerResult = await fileSystemExport(scene, filename)
    if (filePickerResult !== null) return filePickerResult
    return send(this.path('/api/draw2code/export'), 'POST', { scene, filename }, this.options.token)
  }
}
