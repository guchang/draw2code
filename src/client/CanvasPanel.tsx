/**
 * The 画码 board component — an Excalidraw canvas rendered inside a
 * better-sidebar tab, with a slim board-management toolbar above it:
 *
 * - the board persists as `<workspace>/draw2code/<name>.excalidraw.json`;
 * - the toolbar lists / creates / deletes boards (host /api/draw2code/*);
 *   the active board is remembered per workspace (localStorage);
 * - local edits debounce-save (gated until the first pull settles, so the
 *   mount-time onChange echo can never hit the disk); pending saves are
 *   flushed under the OLD board name before any board switch;
 * - while the tab is visible, a 2.5s poll pulls agent-side updates
 *   (rev = file mtime) whenever the user has been idle for 4s, and a 5s
 *   poll refreshes the board list.
 *
 * @module dsh-draw2code/client/CanvasPanel
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import excalidrawCss from '@excalidraw/excalidraw/index.css'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import type { LibraryItems_anyVersion } from '@excalidraw/excalidraw/types'
import { D2cApi, type SceneMetaRow, type VersionRow, type WorkspaceMetaRow } from './api.ts'
import { capturePendingSave, flushCapturedSave, isNormalizationOnlyEcho, LatestAsyncAction, saveWithConflictRetry, type PendingSave } from './sync.ts'
import basicUxLibrary from './library-assets/basic-ux-wireframing-elements.json'
import loFiWireframingLibrary from './library-assets/lo-fi-wireframing-kit.json'
import dataVizLibrary from './library-assets/data-viz.json'
import webKitLibrary from './library-assets/web-kit.json'
import mobileKitLibrary from './library-assets/mobile-kit.json'
import appleDevicesFramesLibrary from './library-assets/apple-devices-frames.json'

/** The default board the tab shows before the user picks another. */
const DEFAULT_BOARD = 'prototype'

/** How long after the last local edit saves flush. */
const SAVE_DEBOUNCE_MS = 1000
/** Poll cadence for remote (agent) updates while visible. */
const POLL_MS = 2500
/** Poll cadence for the board list while visible. */
const LIST_POLL_MS = 5000
/** The user counts as idle after this much time without local edits. */
const IDLE_MS = 4000
/** Ignore onChange for a short period after applying remote scenes from disk. */
const REMOTE_SYNC_IGNORE_MS = 350
/** localStorage key prefix for the per-workspace active board. */
const BOARD_PREFX = 'dsh.draw2code.board.'

interface RawLibraryFile {
  libraryItems?: unknown[]
  library?: unknown[]
}

const BUILT_IN_LIBRARIES = [
  basicUxLibrary,
  loFiWireframingLibrary,
  dataVizLibrary,
  webKitLibrary,
  mobileKitLibrary,
  appleDevicesFramesLibrary,
] as RawLibraryFile[]

/**
 * The directory's older libraries use `library` with bare element arrays;
 * Excalidraw accepts both versions through `initialData.libraryItems`, but
 * legacy arrays need stable item identities for the current session.
 */
const BUILT_IN_LIBRARY_ITEMS = BUILT_IN_LIBRARIES.flatMap((library, libraryIndex) => {
  const items = library.libraryItems ?? library.library ?? []
  return items.map((item, itemIndex) => {
    if (Array.isArray(item)) {
      return {
        id: `dsh-built-in-${libraryIndex}-${itemIndex}`,
        status: 'published' as const,
        created: 0,
        elements: item,
      }
    }
    return item
  })
}) as LibraryItems_anyVersion

interface Props {
  /** The session's working directory (workspace root of the board). */
  cwd: string
  /** Whether this tab is the active one AND the panel is open. */
  visible: boolean
  /** Optional transport for standalone/MCP-hosted canvases. */
  api?: D2cApi
  /** Board requested by draw2code_open. */
  initialBoard?: string | null
  /** Standalone canvas can switch between explicitly registered workspaces. */
  workspaceSwitching?: boolean
}

interface LooseExcalidrawApi {
  updateScene: (scene: { elements?: unknown[] }) => void
}

function ExportIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 14v6h14v-6" />
    </svg>
  )
}

function ChevronIcon({ up }: { up?: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: up ? 'rotate(180deg)' : undefined }}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  )
}

function TrashIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.6 8.5h6.8l.6-8.5M6.6 7v4M9.4 7v4" />
    </svg>
  )
}

function ClockIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3l2 1.4" />
    </svg>
  )
}

function UndoIcon(): JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6.5h6a3.5 3.5 0 1 1 0 7H6" />
      <path d="M5.5 4L3 6.5 5.5 9" />
    </svg>
  )
}

/** Load the remembered active board for a workspace (sanitized, best-effort). */
function rememberedBoard(cwd: string): string {
  if (cwd === '') return DEFAULT_BOARD
  try {
    const value = window.localStorage.getItem(BOARD_PREFX + cwd)
    if (typeof value === 'string' && value.trim() !== '') return value
  } catch { /* storage unavailable */ }
  return DEFAULT_BOARD
}

function rememberBoard(cwd: string, name: string): void {
  try {
    window.localStorage.setItem(BOARD_PREFX + cwd, name)
  } catch { /* storage unavailable */ }
}

function formatUpdatedAt(ts: number): string {
  const delta = Date.now() - ts
  if (delta < 60_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

function operationErrorMessage(error: { code: string; message: string }): string {
  if (error.code === 'unauthorized') return '访问已过期，请重新打开画码'
  if (error.code === 'board-forbidden' || error.code === 'forbidden') return '当前浏览器没有操作这个画板的权限'
  return `操作失败：${error.message}`
}

/**
 * The board component.
 */
export function CanvasPanel({ cwd, visible, api, initialBoard, workspaceSwitching = false }: Props): JSX.Element {
  const apiRef = useRef<D2cApi>(api ?? new D2cApi())
  const excalidrawRef = useRef<LooseExcalidrawApi | null>(null)
  const lastLocalEditRef = useRef(0)
  const revRef = useRef(0)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Save gate: closed until the first pull settles. */
  const readyRef = useRef(false)
  const remoteApplyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isRemoteApplyingRef = useRef(false)
  /** A historical preview is read-only and must never enter the save path. */
  const isPreviewingRef = useRef(false)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** JSON echo of the last server pull (updateScene re-fires onChange). */
  const lastPulledJsonRef = useRef<string | null>(null)
  /**
   * A stale onChange can arrive after updateScene has applied a remote scene.
   * Keep the pre-pull scene so that delayed Excalidraw echoes are ignored
   * instead of being mistaken for a user edit and saved back over the server.
   */
  const staleEchoJsonRef = useRef<string | null>(null)
  /** Last server scene used as the base for three-way conflict merges. */
  const serverElementsRef = useRef<Array<Record<string, unknown>>>([])
  const elementsRef = useRef<Array<Record<string, unknown>>>([])
  /** Pending debounced save (board name + elements), flushable on switch. */
  const pendingSaveRef = useRef<PendingSave | null>(null)
  /** The board currently loaded in the canvas (source of truth for saves). */
  const boardRef = useRef(DEFAULT_BOARD)
  /** Avoid an active-board poll racing a user's own board selection. */
  const lastLocalBoardChangeRef = useRef(0)
  /** Saves already handed to the host, keyed by board for delete barriers. */
  const inFlightSavesRef = useRef(new Map<string, Promise<boolean>>())
  /** Board selections are serialized; only the latest requested target commits. */
  const boardSwitchActionsRef = useRef(new LatestAsyncAction())
  /** Prevent a delete from being followed by a late debounced save. */
  const deletingBoardsRef = useRef(new Set<string>())

  const [dark, setDark] = useState(false)
  const [boardName, setBoardName] = useState(() => initialBoard ?? rememberedBoard(cwd))
  const [boards, setBoards] = useState<SceneMetaRow[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceMetaRow[]>([])
  const [switchingWorkspace, setSwitchingWorkspace] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [previewVersion, setPreviewVersion] = useState<VersionRow | null>(null)
  const [notice, setNotice] = useState<{ message: string; tone: 'info' | 'error' } | null>(null)
  const [remoteEpoch, setRemoteEpoch] = useState(0)
  const [activeBoardEpoch, setActiveBoardEpoch] = useState(0)
  /** Fixed position of the combined menu portal (anchored to the button). */
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const menuAnchorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    boardRef.current = boardName
  }, [boardName])

  // A URL selected by draw2code_open is authoritative for the first load.
  // Fall back to browser memory only when the host did not request a board.
  useEffect(() => {
    const selected = initialBoard ?? rememberedBoard(cwd)
    if (selected !== boardRef.current) {
      boardRef.current = selected
      setBoardName(selected)
    }
  }, [cwd, initialBoard])

  // ---- board-host styles (injected once; see comment below) -------------
  useEffect(() => {
    if (document.querySelector('style[data-d2c-board]') !== null) return
    const style = document.createElement('style')
    style.dataset.d2cBoard = ''
    // The .excalidraw root must be absolutely anchored inside this definite-
    // size wrapper: left auto-sized (static root), its canvas height:100%
    // feeds back into the root's content height and runs away to the bitmap
    // cap (observed 33554432px inside every host without this rule).
    style.textContent = '.d2c-board-host{position:relative;width:100%;height:100%;min-height:0;overflow:hidden}'
      // The .excalidraw root must be absolutely anchored inside this definite-
      // size wrapper: left auto-sized (static root), its canvas height:100%
      // feeds back into the root's content height and runs away to the bitmap
      // cap (observed 33554432px inside every host without this rule).
      // NOTE: the root sits below the 30px toolbar. Its height MUST be
      // calc(100% - 30px) — not 100%. With height:100% the root overflows the
      // host by 30px, and when a text edit focuses its textarea the browser
      // programmatically scrolls the host (overflow:hidden does not prevent
      // focus scrolling), which shifts the canvas without Excalidraw knowing,
      // so every pointer event afterwards lands offset and elements can no
      // longer be selected.
      + '.d2c-board-host .excalidraw{position:absolute;top:30px;left:0;right:0;bottom:auto;height:calc(100% - 30px) !important}'
      + '.d2c-board-host .d2c-toolbar{position:absolute;top:0;left:0;right:0;z-index:4;display:flex;align-items:center;gap:6px;padding:5px 8px;}'
      + '.d2c-toolbar-fade{position:absolute;top:30px;left:0;right:0;height:14px;z-index:3;pointer-events:none;}'
      + excalidrawCss
    document.head.appendChild(style)
  }, [])

  // ---- dark theme follows the shell marker -----------------------------
  useEffect(() => {
    const probe = (): void => { setDark(document.body.hasAttribute('data-ds-dark-theme')) }
    probe()
    const observer = new MutationObserver(probe)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => { observer.disconnect() }
  }, [])

  const applyRemoteScene = useCallback((elements: Array<Record<string, unknown>>): void => {
    if (remoteApplyTimerRef.current !== undefined) clearTimeout(remoteApplyTimerRef.current)
    const nextJson = JSON.stringify(elements)
    staleEchoJsonRef.current = JSON.stringify(elementsRef.current)
    isRemoteApplyingRef.current = true
    remoteApplyTimerRef.current = setTimeout(() => {
      isRemoteApplyingRef.current = false
    }, REMOTE_SYNC_IGNORE_MS)
    lastPulledJsonRef.current = nextJson
    serverElementsRef.current = elements
    elementsRef.current = elements
    excalidrawRef.current?.updateScene({ elements })
  }, [])

  const showNotice = useCallback((message: string, tone: 'info' | 'error' = 'info'): void => {
    if (noticeTimerRef.current !== undefined) clearTimeout(noticeTimerRef.current)
    setNotice({ message, tone })
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = undefined
      setNotice(null)
    }, 4_500)
  }, [])

  /** Write one scene to disk, three-way merging on revision conflicts. */
  const persistScene = useCallback((name: string, elements: Array<Record<string, unknown>>, baseRev: number, baseElements: Array<Record<string, unknown>>): Promise<boolean> => {
    const scene = {
      type: 'excalidraw' as const,
      version: 2 as const,
      source: 'dsh-draw2code',
      elements,
      appState: { viewBackgroundColor: '#ffffff' },
    }
    const save = async (): Promise<boolean> => {
      // A delete action owns the board from this point until the host confirms
      // removal. A queued debounce must never recreate the deleted file.
      if (deletingBoardsRef.current.has(name)) return true
      const saved = await saveWithConflictRetry({
        elements,
        baseElements,
        baseRev,
        read: async () => {
          const latest = await apiRef.current.read(cwd, name)
          return latest.ok
            ? { ok: true, rev: latest.rev, elements: latest.scene.elements }
            : { ok: false, error: latest.error }
        },
        write: async (candidate, candidateBaseRev) => {
          const result = await apiRef.current.write(cwd, name, { ...scene, elements: candidate }, candidateBaseRev)
          return result.ok
            ? { ok: true, rev: result.rev }
            : { ok: false, error: result.error }
        },
      })
      const result = saved.result
      const savedElements = saved.savedElements
      if (!result.ok) {
        if (boardRef.current === name) showNotice(operationErrorMessage(result.error), 'error')
        return false
      }
      // A late settlement for a board we already left must not touch refs.
      if (boardRef.current !== name) return true
      // A successful local save becomes the new merge base immediately.
      // Without this, the next remote update compares against the scene
      // before the user's deletion and may resurrect deleted elements.
      // Tombstones are dropped to mirror the server's normalizeScene
      // (physical deletion) — otherwise this cached base still contains
      // tombstones, and a later identical delete JSON gets swallowed by
      // the echo guard instead of being saved.
      const settled = savedElements.filter((el) => el.isDeleted !== true)
      revRef.current = result.rev
      elementsRef.current = settled
      serverElementsRef.current = settled
      lastPulledJsonRef.current = JSON.stringify(settled)
      staleEchoJsonRef.current = null
      // When a conflict merge changed the outcome (agent additions kept,
      // or concurrent edits folded in), the user's canvas still shows the
      // pre-merge local scene. Without resyncing it here, the very next
      // local edit saves the stale canvas verbatim — now with a matching
      // baseRev, so it blind-overwrites the merged result and silently
      // wipes everything the merge had preserved (e.g. agent-drawn pages).
      if (JSON.stringify(settled) !== JSON.stringify(elements)) {
        applyRemoteScene(settled)
      }
      return true
    }
    const previous = inFlightSavesRef.current.get(name)
    const task = (previous ?? Promise.resolve()).catch(() => false).then(save)
    inFlightSavesRef.current.set(name, task)
    void task.finally(() => {
      if (inFlightSavesRef.current.get(name) === task) inFlightSavesRef.current.delete(name)
    }).catch(() => undefined)
    return task
  }, [cwd, applyRemoteScene, showNotice])

  const landCapturedSave = useCallback(async (pending: PendingSave): Promise<boolean> => {
    const flushed = await flushCapturedSave(pending, async (captured) => {
      return persistScene(captured.name, captured.elements, captured.baseRev, captured.baseElements)
    })
    if (!flushed.ok && pendingSaveRef.current === null) pendingSaveRef.current = flushed.retry
    return flushed.ok
  }, [persistScene])

  /** Immediately write any debounced-but-unflushed edit (board switches). */
  const flushPendingSave = useCallback(async (): Promise<boolean> => {
    if (saveTimerRef.current !== undefined) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = undefined
    }
    const pending = pendingSaveRef.current
    pendingSaveRef.current = null
    if (pending !== null) return landCapturedSave(pending)
    const inFlight = inFlightSavesRef.current.get(boardRef.current)
    return inFlight === undefined ? true : await inFlight
  }, [landCapturedSave])

  // ---- load + poll the board (while visible) ----------------------------
  useEffect(() => {
    if (cwd === '') {
      excalidrawRef.current?.updateScene({ elements: [] })
      // Reset the revision cache: a later non-empty cwd must always reload
      // the board from disk. Without this, the rev-equality fast path below
      // (`result.rev === revRef.current`) skips the pull forever and the
      // canvas stays blank even though the scene file is intact.
      revRef.current = 0
      lastPulledJsonRef.current = null
      serverElementsRef.current = []
      elementsRef.current = []
      return
    }
    let cancelled = false
    readyRef.current = false

    const acknowledgeRenderedReveal = async (revision: number): Promise<void> => {
      const reveal = await apiRef.current.getBoardReveal(cwd)
      if (cancelled || !reveal.ok || reveal.request === null || reveal.request.consumedAt !== undefined) return
      if (reveal.request.board !== boardName || reveal.request.revision !== revision) return
      // Let Excalidraw commit the pulled scene before reporting it visible.
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())))
      if (cancelled || boardRef.current !== boardName || revRef.current !== revision || !readyRef.current) return
      const acknowledged = await apiRef.current.ackBoardReveal(cwd, reveal.request.id, boardName)
      if (!acknowledged.ok) console.warn('[dsh-draw2code] reveal acknowledgement failed:', acknowledged.error.message)
    }

    const pull = async (): Promise<void> => {
      if (!visible) return
      if (isPreviewingRef.current) return
      const result = await apiRef.current.read(cwd, boardName)
      if (cancelled || !result.ok) {
        if (!result.ok && result.error.code === 'unauthorized') showNotice(operationErrorMessage(result.error), 'error')
        if (!result.ok && result.error.code === 'not-found') {
          excalidrawRef.current?.updateScene({ elements: [] })
          revRef.current = 0
          serverElementsRef.current = []
          elementsRef.current = []
          staleEchoJsonRef.current = null
          readyRef.current = true
        }
        return
      }
      // The user is mid-edit: never yank the board under their pointer.
      if (Date.now() - lastLocalEditRef.current < IDLE_MS && revRef.current !== 0) {
        // Edit-protection skip: the scene is already loaded, so keep the save
        // gate open. Without this, a visible/cwd toggle resets readyRef below
        // and this early return leaves it closed — every later local edit
        // (deletions included) is silently dropped, so deleted elements stay
        // in the scene file and resurface on the next remote sync.
        readyRef.current = true
        return
      }
      if (result.rev === revRef.current) {
        // Same revision: scene already current. Keep the save gate open so
        // local edits persist while the poll skips the reload.
        readyRef.current = true
        void acknowledgeRenderedReveal(result.rev)
        return
      }
      revRef.current = result.rev
      readyRef.current = true
      lastPulledJsonRef.current = JSON.stringify(result.scene.elements)
      applyRemoteScene(result.scene.elements)
      void acknowledgeRenderedReveal(result.rev)
    }

    void pull()
    const timer = setInterval(() => { void pull() }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [cwd, boardName, visible, applyRemoteScene, remoteEpoch, showNotice])

  useEffect(() => apiRef.current.subscribe(cwd, (event) => {
    if (event.type === 'scene.updated' || event.type === 'active-board.changed' || event.type === 'board.deleted') {
      setRemoteEpoch((value) => value + 1)
    }
    if (event.type === 'active-board.changed' || event.type === 'board.deleted') {
      setActiveBoardEpoch((value) => value + 1)
    }
  }), [cwd])

  useEffect(() => {
    if (!workspaceSwitching || cwd === '' || !visible) return
    let cancelled = false
    void apiRef.current.listWorkspaces(cwd).then((result) => {
      if (cancelled) return
      if (result.ok) setWorkspaces(result.workspaces)
      else showNotice(operationErrorMessage(result.error), 'error')
    })
    return () => { cancelled = true }
  }, [cwd, visible, workspaceSwitching, showNotice])

  // ---- poll the board list (while visible) ------------------------------
  useEffect(() => {
    if (cwd === '' || !visible) return
    let cancelled = false
    const refresh = async (): Promise<void> => {
      const result = await apiRef.current.list(cwd)
      if (cancelled) return
      if (!result.ok) {
        if (result.error.code === 'unauthorized') showNotice(operationErrorMessage(result.error), 'error')
        return
      }
      setBoards(result.scenes)
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, LIST_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [cwd, visible, showNotice])

  // ---- debounced save of local edits ------------------------------------
  const scheduleSave = useCallback((elements: Array<Record<string, unknown>>): void => {
    if (cwd === '') return
    if (isPreviewingRef.current) return
    if (!readyRef.current) return
    if (deletingBoardsRef.current.has(boardRef.current)) return
    if (elements.length === 0 && revRef.current === 0) return
    pendingSaveRef.current = capturePendingSave(
      pendingSaveRef.current,
      boardRef.current,
      elements,
      revRef.current,
      serverElementsRef.current,
    )
    if (saveTimerRef.current !== undefined) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined
      const pending = pendingSaveRef.current
      pendingSaveRef.current = null
      if (pending !== null) void landCapturedSave(pending)
    }, SAVE_DEBOUNCE_MS)
  }, [cwd, landCapturedSave])

  // ---- flush pending save on unmount ------------------------------------
  useEffect(() => () => {
    if (saveTimerRef.current !== undefined) clearTimeout(saveTimerRef.current)
    if (remoteApplyTimerRef.current !== undefined) clearTimeout(remoteApplyTimerRef.current)
    if (noticeTimerRef.current !== undefined) clearTimeout(noticeTimerRef.current)
    const pending = pendingSaveRef.current
    if (pending !== null) persistScene(pending.name, pending.elements, pending.baseRev, pending.baseElements)
  }, [persistScene])

  const onChange = useCallback((elements: unknown): void => {
    if (isPreviewingRef.current) return
    if (isRemoteApplyingRef.current) return
    const list = (Array.isArray(elements) ? elements : []) as Array<Record<string, unknown>>
    const json = JSON.stringify(list)
    if (lastPulledJsonRef.current !== null && json === lastPulledJsonRef.current) return
    if (isNormalizationOnlyEcho(serverElementsRef.current, list)) {
      // Excalidraw assigns index/version metadata on first render. Adopt that
      // local baseline without rewriting an otherwise identical board and
      // invalidating the revision tied to the visible-review request.
      elementsRef.current = list
      serverElementsRef.current = list
      lastPulledJsonRef.current = json
      return
    }
    if (staleEchoJsonRef.current !== null) {
      if (json === staleEchoJsonRef.current) return
      staleEchoJsonRef.current = null
    }
    elementsRef.current = list
    lastLocalEditRef.current = Date.now()
    scheduleSave(list)
  }, [scheduleSave])

  const exportScene = useCallback((): void => {
    const scene = {
      type: 'excalidraw' as const,
      version: 2 as const,
      source: 'dsh-draw2code',
      elements: elementsRef.current,
      appState: { viewBackgroundColor: dark ? '#121212' : '#ffffff' },
    }
    void apiRef.current.exportScene(scene, `${boardName}.excalidraw`).then((result) => {
      if (!result.ok) console.warn('[dsh-draw2code] export failed:', result.error.message)
    })
  }, [dark, boardName])

  // ---- board management actions ------------------------------------------
  const switchBoard = useCallback((name: string, force = false): void => {
    if (!force && name === boardRef.current) return
    lastLocalBoardChangeRef.current = Date.now()
    void boardSwitchActionsRef.current.run(async (isCurrent) => {
      if (!await flushPendingSave() || !isCurrent()) return false
      if (cwd !== '') {
        const selected = await apiRef.current.setActiveBoard(cwd, name)
        if (!selected.ok) {
          if (isCurrent()) showNotice(operationErrorMessage(selected.error), 'error')
          return false
        }
      }
      return true
    }, (ready) => {
      if (!ready) return
      isPreviewingRef.current = false
      setPreviewVersion(null)
      setConfirmRestore(null)
      // Reset the local merge base before the first read of the newly
      // selected board. The workspace-scoped token already permits it.
      revRef.current = 0
      readyRef.current = false
      lastPulledJsonRef.current = null
      staleEchoJsonRef.current = null
      serverElementsRef.current = []
      elementsRef.current = []
      lastLocalEditRef.current = 0
      boardRef.current = name
      setBoardName(name)
      rememberBoard(cwd, name)
      setMenuOpen(false)
    }).catch((error) => showNotice(`操作失败：${error instanceof Error ? error.message : String(error)}`, 'error'))
  }, [cwd, flushPendingSave, showNotice])

  // The host can create and select an isolated board during
  // draw2code_create. Follow the shared active-board pointer so the board
  // that the agent just confirmed becomes visible in the current sidebar;
  // without this, the tool could truthfully create a board while the user
  // continued looking at the old one.
  useEffect(() => {
    if (cwd === '' || !visible) return
    let cancelled = false
    const syncActiveBoard = async (): Promise<void> => {
      const result = await apiRef.current.getActiveBoard(cwd)
      if (cancelled || !result.ok || result.name === null || result.name === boardRef.current) return
      if (Date.now() - lastLocalBoardChangeRef.current < 1500) return
      switchBoard(result.name, true)
    }
    void syncActiveBoard()
    const timer = setInterval(() => { void syncActiveBoard() }, LIST_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [cwd, visible, switchBoard, activeBoardEpoch])

  const createBoard = useCallback(async (): Promise<void> => {
    const name = newName.trim()
    if (name === '') {
      setCreateError('请输入画板名')
      return
    }
    const result = await apiRef.current.create(cwd, name)
    if (!result.ok) {
      setCreateError(result.error.code === 'exists' ? '同名画板已存在' : result.error.message)
      if (result.error.code === 'unauthorized') showNotice(operationErrorMessage(result.error), 'error')
      return
    }
    const listed = await apiRef.current.list(cwd)
    if (listed.ok) setBoards(listed.scenes)
    setCreating(false)
    setNewName('')
    setCreateError('')
    switchBoard(name)
  }, [cwd, newName, switchBoard, showNotice])

  const switchWorkspace = useCallback(async (targetRoot: string): Promise<void> => {
    if (targetRoot === cwd || switchingWorkspace !== null) return
    setSwitchingWorkspace(targetRoot)
    try {
      if (!await flushPendingSave()) return
      const result = await apiRef.current.switchWorkspace(cwd, targetRoot)
      if (!result.ok) {
        showNotice(operationErrorMessage(result.error), 'error')
        return
      }
      window.location.assign(result.url)
    } finally {
      setSwitchingWorkspace(null)
    }
  }, [cwd, switchingWorkspace, flushPendingSave, showNotice])

  const deleteBoard = useCallback(async (name: string): Promise<void> => {
    deletingBoardsRef.current.add(name)
    // Cancel a not-yet-started debounce for this board. Any save already sent
    // to the host is awaited below before DELETE, so it cannot recreate the
    // file after the deletion completes.
    if (pendingSaveRef.current?.name === name) {
      pendingSaveRef.current = null
      if (saveTimerRef.current !== undefined) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = undefined
      }
    }
    try {
      const inFlight = inFlightSavesRef.current.get(name)
      if (inFlight !== undefined) await inFlight.catch(() => undefined)
      const result = await apiRef.current.remove(cwd, name)
      if (!result.ok) {
        showNotice(operationErrorMessage(result.error), 'error')
        return
      }
      const listed = await apiRef.current.list(cwd)
      const remaining = listed.ok ? listed.scenes : []
      setBoards(remaining)
      setConfirmDelete(null)
      if (name === boardRef.current) {
        const fallback = remaining.find((row) => row.name !== name)?.name ?? DEFAULT_BOARD
        // If there is no remaining board, force-reset even when the fallback
        // name equals the just-deleted active board (usually prototype).
        switchBoard(fallback, remaining.length === 0)
      }
    } finally {
      deletingBoardsRef.current.delete(name)
    }
  }, [cwd, switchBoard, showNotice])

  // ---- version history -----------------------------------------------------
  const refreshVersions = useCallback(async (): Promise<void> => {
    const result = await apiRef.current.listVersions(cwd, boardRef.current)
    if (result.ok) setVersions(result.versions)
    else showNotice(operationErrorMessage(result.error), 'error')
  }, [cwd, showNotice])

  const previewHistoryVersion = useCallback(async (row: VersionRow): Promise<boolean> => {
    if (!await flushPendingSave()) return false
    const result = await apiRef.current.readVersion(cwd, boardRef.current, row.id)
    if (!result.ok) {
      showNotice(operationErrorMessage(result.error), 'error')
      return false
    }
    isPreviewingRef.current = true
    setPreviewVersion(row)
    setConfirmRestore(null)
    excalidrawRef.current?.updateScene({ elements: result.scene.elements })
    return true
  }, [cwd, flushPendingSave, showNotice])

  const leaveHistoryPreview = useCallback(async (): Promise<void> => {
    const result = await apiRef.current.read(cwd, boardRef.current)
    if (!result.ok) {
      showNotice(operationErrorMessage(result.error), 'error')
      return
    }
    isPreviewingRef.current = false
    setPreviewVersion(null)
    setConfirmRestore(null)
    revRef.current = result.rev
    readyRef.current = true
    applyRemoteScene(result.scene.elements)
  }, [cwd, applyRemoteScene, showNotice])

  const requestRestore = useCallback(async (row: VersionRow): Promise<void> => {
    if (previewVersion?.id !== row.id && !await previewHistoryVersion(row)) return
    setConfirmRestore(row.id)
  }, [previewVersion, previewHistoryVersion])

  const restoreVersion = useCallback(async (id: string): Promise<void> => {
    // Land any un-flushed local edit first so the rollback archives the
    // user's latest state (rollback itself stays reversible).
    if (!await flushPendingSave()) return
    const result = await apiRef.current.restoreVersion(cwd, boardRef.current, id)
    if (!result.ok) {
      showNotice(operationErrorMessage(result.error), 'error')
      return
    }
    const restored = await apiRef.current.read(cwd, boardRef.current)
    if (!restored.ok) {
      showNotice(`回滚已完成，但画布刷新失败：${operationErrorMessage(restored.error)}`, 'error')
      return
    }
    isPreviewingRef.current = false
    setPreviewVersion(null)
    setConfirmRestore(null)
    revRef.current = restored.rev
    readyRef.current = true
    applyRemoteScene(restored.scene.elements)
    await refreshVersions()
    showNotice('已回滚到所选历史版本')
  }, [cwd, flushPendingSave, refreshVersions, applyRemoteScene, showNotice])

  // Refresh the version list whenever the combined menu opens (and whenever
  // the active board changes while it is open).
  useEffect(() => {
    if (!menuOpen) return
    void refreshVersions()
  }, [menuOpen, boardName, refreshVersions])

  // ---- close the menu on outside click / Escape ---------------------------
  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null
      if (target !== null && target.closest('.d2c-board-menu-wrap') === null
        && target.closest('.d2c-menu-portal') === null) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  // ---- render -------------------------------------------------------------
  if (cwd === '') {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9aa0', fontSize: 13, textAlign: 'center', padding: 24 }}>
        打开一个项目会话后，这里就是你的 Excalidraw 画板：<br />
        在对话里说出想法，我来画；你也可以直接在这里涂涂画画。
      </div>
    )
  }

  const palette = dark
    ? { bar: '#1e1e22', text: '#d7d7dc', sub: '#8f8f96', border: '#33333a', hover: '#2a2a31', active: '#31313a', danger: '#e5788a' }
    : { bar: '#f6f6f8', text: '#2e2e33', sub: '#8a8a92', border: '#e3e3e8', hover: '#ececf1', active: '#e2e2ea', danger: '#c4384d' }

  const openMenu = (startCreating: boolean): void => {
    const rect = menuAnchorRef.current?.getBoundingClientRect()
    if (rect !== undefined) {
      // Clamp so the fixed 264px panel never overflows the window's right edge.
      setMenuPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 272)) })
    }
    setCreating(startCreating)
    setNewName('')
    setCreateError('')
    setMenuOpen(true)
  }

  const menuPanel = menuOpen && menuPos !== null
    ? createPortal(
      <div
        className="d2c-menu-portal"
        style={{
          position: 'fixed', top: menuPos.top, left: menuPos.left, width: 264, zIndex: 2147483000,
          borderRadius: 10, border: `1px solid ${palette.border}`,
          background: dark ? '#232329' : '#ffffff',
          boxShadow: dark ? '0 8px 24px rgba(0,0,0,.45)' : '0 8px 24px rgba(20,20,40,.12)',
          padding: 4, color: palette.text, fontSize: 12,
        }}
      >
        <div title={cwd} style={{ padding: '4px 8px 3px', color: palette.sub, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          工作区 · {cwd.split('/').filter(Boolean).at(-1) ?? cwd}
        </div>
        {workspaceSwitching && workspaces.length > 1 && (
          <>
            <div style={{ padding: '5px 8px 3px', color: palette.sub, fontSize: 11 }}>切换工作区（{workspaces.length}）</div>
            <div style={{ maxHeight: 132, overflowY: 'auto' }}>
              {workspaces.map((workspace) => {
                const active = workspace.root === cwd
                const switching = switchingWorkspace === workspace.root
                return (
                  <button
                    key={workspace.root}
                    type="button"
                    title={workspace.root}
                    disabled={active || switchingWorkspace !== null}
                    onClick={() => { void switchWorkspace(workspace.root) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 8px', border: 'none', borderRadius: 6,
                      background: active ? palette.active : 'transparent', color: palette.text, textAlign: 'left', cursor: active ? 'default' : 'pointer', fontSize: 12,
                      opacity: switchingWorkspace !== null && !switching ? 0.55 : 1,
                    }}
                  >
                    <span style={{ width: 14, flexShrink: 0, color: active ? '#4656e0' : palette.sub }}>{active ? '✓' : '⌂'}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: active ? 600 : 400 }}>{workspace.name}</span>
                      <span style={{ display: 'block', color: palette.sub, fontSize: 11 }}>{switching ? '正在切换…' : `${workspace.boardCount} 个画板`}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div style={{ borderTop: `1px solid ${palette.border}`, margin: '4px 2px' }} />
          </>
        )}
        {creating ? (
          <div style={{ padding: '6px 6px 2px' }}>
            <input
              autoFocus
              value={newName}
              placeholder="画板名，如：顾客端"
              onChange={(event) => { setNewName(event.target.value); setCreateError('') }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createBoard()
                if (event.key === 'Escape') { setCreating(false); setNewName(''); setCreateError('') }
              }}
              style={{
                width: '100%', boxSizing: 'border-box', height: 28, padding: '0 8px',
                borderRadius: 6, border: `1px solid ${createError !== '' ? palette.danger : palette.border}`,
                background: dark ? '#1b1b20' : '#fafafb', color: palette.text, fontSize: 12, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 4 }}>
              <button
                type="button"
                onClick={() => { void createBoard() }}
                style={{ height: 24, padding: '0 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#4656e0', color: '#fff', fontSize: 12 }}
              >创建</button>
              <button
                type="button"
                onClick={() => { setCreating(false); setNewName(''); setCreateError('') }}
                style={{ height: 24, padding: '0 10px', borderRadius: 6, border: `1px solid ${palette.border}`, cursor: 'pointer', background: 'transparent', color: palette.sub, fontSize: 12 }}
              >取消</button>
              {createError !== '' && <span style={{ color: palette.danger, fontSize: 11 }}>{createError}</span>}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', padding: '5px 8px 3px', color: palette.sub, fontSize: 11 }}>
              <span>画板（{boards.length}）</span>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {boards.length === 0 && (
                <div style={{ padding: '10px 8px', color: palette.sub }}>还没有画板文件，点右上「新画板」创建一块。</div>
              )}
              {[...boards]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((row) => {
                  const active = row.name === boardName
                  return (
                    <div
                      key={row.name}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 8px',
                        borderRadius: 6, cursor: 'pointer',
                        background: active ? palette.active : 'transparent',
                      }}
                      onMouseEnter={(event) => { if (!active) event.currentTarget.style.background = palette.hover }}
                      onMouseLeave={(event) => { if (!active) event.currentTarget.style.background = 'transparent' }}
                      onClick={() => { if (confirmDelete === row.name) return; switchBoard(row.name) }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: active ? 600 : 400 }}>{row.name}</div>
                        <div style={{ color: palette.sub, fontSize: 11 }}>{row.elementCount} 个元素 · {formatUpdatedAt(row.updatedAt)}</div>
                      </div>
                      {confirmDelete === row.name
                        ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(event) => event.stopPropagation()}>
                            <button type="button" onClick={() => { void deleteBoard(row.name) }}
                              style={{ height: 22, padding: '0 7px', borderRadius: 5, border: 'none', cursor: 'pointer', background: palette.danger, color: '#fff', fontSize: 11 }}>删除</button>
                            <button type="button" onClick={() => setConfirmDelete(null)}
                              style={{ height: 22, padding: '0 7px', borderRadius: 5, border: `1px solid ${palette.border}`, cursor: 'pointer', background: 'transparent', color: palette.sub, fontSize: 11 }}>取消</button>
                          </div>
                          )
                        : (
                          <button
                            type="button"
                            title="删除画板"
                            onClick={(event) => { event.stopPropagation(); setConfirmDelete(row.name) }}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 5, border: 'none', cursor: 'pointer', background: 'transparent', color: palette.sub, opacity: active ? 0.9 : 0.45 }}
                            onMouseEnter={(event) => { event.currentTarget.style.color = palette.danger; event.currentTarget.style.opacity = '1' }}
                            onMouseLeave={(event) => { event.currentTarget.style.color = palette.sub; event.currentTarget.style.opacity = active ? '0.9' : '0.45' }}
                          >
                            <TrashIcon />
                          </button>
                          )}
                    </div>
                  )
                })}
              {boards.length > 0 && !boards.some((row) => row.name === boardName) && (
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 8px', borderRadius: 6, cursor: 'pointer', background: palette.active }}
                  onClick={() => switchBoard(boardName)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{boardName}</div>
                    <div style={{ color: palette.sub, fontSize: 11 }}>尚未保存 · 当前画板</div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ borderTop: `1px solid ${palette.border}`, margin: '4px 2px' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px 3px', color: palette.sub, fontSize: 11 }}>
              <ClockIcon />
              <span>「{boardName}」的历史版本</span>
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {versions.length === 0 && (
                <div style={{ padding: '6px 8px 8px', color: palette.sub }}>
                  还没有历史版本：每次 AI 修改画板会自动存档一版，你自己编辑也会定期存档。
                </div>
              )}
              {versions.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 8px',
                    borderRadius: 6, cursor: 'default',
                    background: previewVersion?.id === row.id ? palette.active : 'transparent',
                  }}
                  onMouseEnter={(event) => { if (previewVersion?.id !== row.id) event.currentTarget.style.background = palette.hover }}
                  onMouseLeave={(event) => { event.currentTarget.style.background = previewVersion?.id === row.id ? palette.active : 'transparent' }}
                >
                  <button
                    type="button"
                    title="预览此版本"
                    onClick={() => { void previewHistoryVersion(row) }}
                    style={{ flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', fontSize: 12 }}
                  >
                    <div>{formatUpdatedAt(row.ts)} 存档</div>
                    <div style={{ color: palette.sub, fontSize: 11 }}>{row.elementCount} 个元素 · {previewVersion?.id === row.id ? '正在预览' : '点击预览'}</div>
                  </button>
                  {confirmRestore === row.id
                    ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button type="button" onClick={() => { void restoreVersion(row.id) }}
                          style={{ height: 22, padding: '0 7px', borderRadius: 5, border: 'none', cursor: 'pointer', background: '#4656e0', color: '#fff', fontSize: 11 }}>确定</button>
                        <button type="button" onClick={() => setConfirmRestore(null)}
                          style={{ height: 22, padding: '0 7px', borderRadius: 5, border: `1px solid ${palette.border}`, cursor: 'pointer', background: 'transparent', color: palette.sub, fontSize: 11 }}>取消</button>
                      </div>
                      )
                    : (
                      <button
                        type="button"
                        title="回滚到此版本"
                        onClick={() => { void requestRestore(row) }}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 22, padding: '0 7px', borderRadius: 5, border: `1px solid ${palette.border}`, cursor: 'pointer', background: 'transparent', color: palette.sub, fontSize: 11 }}
                        onMouseEnter={(event) => { event.currentTarget.style.color = palette.text; event.currentTarget.style.background = palette.active }}
                        onMouseLeave={(event) => { event.currentTarget.style.color = palette.sub; event.currentTarget.style.background = 'transparent' }}
                      ><UndoIcon />回滚</button>
                      )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>,
      document.body,
    )
    : null

  return (
    <div className="d2c-board-host" style={{ background: dark ? '#121212' : '#ffffff' }}>
      <div className="d2c-toolbar" style={{ background: palette.bar, borderBottom: `1px solid ${palette.border}` }}>
        <div ref={menuAnchorRef} className="d2c-board-menu-wrap" style={{ display: 'flex', alignItems: 'center', minWidth: 0, flexShrink: 1 }}>
          <button
            type="button"
            onClick={() => { if (menuOpen) setMenuOpen(false); else openMenu(false) }}
            title="画板与历史版本"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
              height: 24, padding: '0 8px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${palette.border}`, background: dark ? '#26262c' : '#ffffff',
              color: palette.text, fontSize: 12,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{boardName}</span>
            <span style={{ color: palette.sub, flexShrink: 0 }}><ChevronIcon up={menuOpen} /></span>
          </button>
          <div style={{ width: 4, flexShrink: 0 }} />
          <button
            type="button"
            title="新建画板"
            onClick={() => { openMenu(true) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 8px',
              borderRadius: 6, cursor: 'pointer', border: `1px solid ${palette.border}`,
              background: 'transparent', color: palette.sub, fontSize: 12, flexShrink: 0,
            }}
            onMouseEnter={(event) => { event.currentTarget.style.background = palette.hover; event.currentTarget.style.color = palette.text }}
            onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; event.currentTarget.style.color = palette.sub }}
          ><PlusIcon />新画板</button>
        </div>
        {previewVersion !== null && (
          <div
            role="status"
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, minWidth: 0,
              height: 24, padding: '0 7px', borderRadius: 6,
              background: dark ? '#302b18' : '#fff7d6', color: dark ? '#f3d97b' : '#735c00', fontSize: 11,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              正在预览 {formatUpdatedAt(previewVersion.ts)}版本
            </span>
            <button
              type="button"
              onClick={() => { void leaveHistoryPreview() }}
              style={{ height: 20, padding: '0 6px', borderRadius: 4, border: `1px solid ${dark ? '#6a5a28' : '#d9c36a'}`, background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
            >返回当前版本</button>
          </div>
        )}
        {notice !== null && (
          <div
            role="status"
            style={{
              marginLeft: previewVersion === null ? 'auto' : 4, maxWidth: '46%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              height: 24, lineHeight: '24px', padding: '0 8px', borderRadius: 6,
              background: notice.tone === 'error' ? (dark ? '#4a2228' : '#ffe3e3') : (dark ? '#203829' : '#d3f9d8'),
              color: notice.tone === 'error' ? (dark ? '#ffadb8' : '#a61e2b') : (dark ? '#9be9b2' : '#237a3b'), fontSize: 11,
            }}
            title={notice.message}
          >{notice.message}</div>
        )}
      </div>
      {menuPanel}
      <div className="d2c-toolbar-fade" style={{ background: `linear-gradient(${palette.bar}, transparent)` }} />
      <Excalidraw
        excalidrawAPI={(api) => { excalidrawRef.current = api as unknown as LooseExcalidrawApi }}
        onChange={(elements) => { onChange(elements as unknown as Array<Record<string, unknown>>) }}
        viewModeEnabled={previewVersion !== null}
        theme={dark ? 'dark' : 'light'}
        langCode="zh-CN"
        UIOptions={{
          canvasActions: {
            // The Excalidraw default export uses browser-fs-access and can
            // navigate to a blob URL in the DSH WebView. The custom menu item
            // below uses the host save bridge instead, so hide the default one.
            export: false,
          },
        }}
        initialData={{
          elements: [],
          appState: { viewBackgroundColor: '#ffffff' },
          libraryItems: BUILT_IN_LIBRARY_ITEMS,
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.Item icon={<ExportIcon />} onSelect={exportScene}>
            导出画板
          </MainMenu.Item>
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.Group title="Excalidraw links">
            <MainMenu.DefaultItems.Socials />
          </MainMenu.Group>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ToggleTheme />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
    </div>
  )
}
