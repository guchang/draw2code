/**
 * Browser-side bridge from verified draw2code_update events to the
 * dsh-better-sidebar tab service. The listener lives outside CanvasPanel so
 * it can open 画码 even when the tab has never been mounted.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { BetterSidebarService } from 'dsh-better-sidebar/client/service'
import { D2cApi, type D2cResult } from './api.ts'

const TAB_ID = 'draw2code:board'
const POLL_MS = 800

export interface BoardRevealRequest {
  id: string
  board: string
  createdAt: number
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface RevealConsumerInput {
  root: string
  sessionId: string
  result: D2cResult<{ request: BoardRevealRequest | null }>
  handledIds: Map<string, string>
  storage: StorageLike
  sidebar: Pick<BetterSidebarService, 'openTab'>
}

interface SessionListSnapshot {
  current: string | undefined
  byId: Record<string, { cwd?: string }>
}

interface SessionListFeed {
  getSnapshot(): SessionListSnapshot
  subscribe(fn: () => void): () => void
}

/**
 * Adapt the actual browser runtime service at its package-version boundary.
 * Some installed DSH declarations still describe the host-side list()
 * method, so validate the client feed instead of trusting that stale type.
 */
function sessionListFeed(ctx: ClientContext): SessionListFeed | null {
  const sessions: unknown = ctx.sessions
  if (typeof sessions !== 'object' || sessions === null) return null
  const list: unknown = (sessions as { list?: unknown }).list
  if (typeof list !== 'object' || list === null) return null
  const candidate = list as { getSnapshot?: unknown; subscribe?: unknown }
  if (typeof candidate.getSnapshot !== 'function' || typeof candidate.subscribe !== 'function') return null
  return list as SessionListFeed
}

function storageKey(root: string): string {
  return `dsh.draw2code.reveal.${encodeURIComponent(root)}`
}

function scenePath(root: string, board: string): string {
  const separator = root.endsWith('/') ? '' : '/'
  return `${root}${separator}draw2code/${board}.excalidraw.json`
}

/** Consume a successful reveal response once and bring its board into sight. */
export function consumeBoardReveal(input: RevealConsumerInput): boolean {
  if (!input.result.ok || input.result.request === null) return false
  const request = input.result.request
  if (input.handledIds.get(input.root) === request.id) return false
  try {
    if (input.storage.getItem(storageKey(input.root)) === request.id) {
      input.handledIds.set(input.root, request.id)
      return false
    }
  } catch {
    // In-memory de-duplication still protects this browser lifetime.
  }

  input.handledIds.set(input.root, request.id)
  try {
    input.storage.setItem(storageKey(input.root), request.id)
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
  input.sidebar.openTab({
    type: TAB_ID,
    title: '画码',
    // better-sidebar expands a collapsed panel for content opens. The board
    // path is real content associated with this otherwise type-only tab.
    path: scenePath(input.root, request.board),
  }, { sessionId: input.sessionId, cwd: input.root })
  return true
}

/** Watch the currently selected DSH session for verified update events. */
export function installBoardRevealWatcher(
  ctx: ClientContext,
  sidebar: BetterSidebarService,
  api = new D2cApi(),
): () => void {
  const sessions = sessionListFeed(ctx)
  if (sessions === null) {
    console.warn('[dsh-draw2code] session list feed unavailable; verified updates cannot auto-open')
    return () => undefined
  }
  const handledIds = new Map<string, string>()
  let disposed = false
  let inFlight = false

  const poll = async (): Promise<void> => {
    if (disposed || inFlight) return
    const snapshot = sessions.getSnapshot()
    const sessionId = snapshot.current
    const root = sessionId === undefined ? undefined : snapshot.byId[sessionId]?.cwd
    if (sessionId === undefined || root === undefined || root === '') return
    inFlight = true
    try {
      const result = await api.getBoardReveal(root)
      if (disposed) return
      const latest = sessions.getSnapshot()
      if (latest.current !== sessionId || latest.byId[sessionId]?.cwd !== root) return
      consumeBoardReveal({
        root,
        sessionId,
        result,
        handledIds,
        storage: window.localStorage,
        sidebar,
      })
    } finally {
      inFlight = false
    }
  }

  const unsubscribe = sessions.subscribe(() => { void poll() })
  const timer = window.setInterval(() => { void poll() }, POLL_MS)
  void poll()
  return () => {
    disposed = true
    window.clearInterval(timer)
    unsubscribe()
  }
}
