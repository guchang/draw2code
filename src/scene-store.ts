/**
 * The scene store: Excalidraw scenes persisted as real workspace files at
 * `<workspace>/draw2code/<name>.excalidraw.json`, workspace-gated like the
 * aionui-panel fs routes. Every mutation goes through here — the browser
 * canvas PUTs whole scenes, the agent tools apply ops — so the file on disk
 * is the single source of truth and both halves stay in sync through the
 * revision counter (file mtime).
 *
 * Element normalization: agents author minimal elements (id/type/x/y/w/h/
 * text/…); `normalizeElement` fills the Excalidraw field tail so the canvas
 * restores a valid scene (Excalidraw's own restore() covers the rest).
 * @module dsh-draw2code/host/scene-store
 */

import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'

/** Directory inside the workspace root that holds all scenes. */
export const SCENE_DIR = 'draw2code'

/** Shared browser/agent pointer to the board currently selected in the UI. */
const ACTIVE_BOARD_FILE = '.active-board.json'

/** Resumable draw2code_generate preparation and verification sessions. */
const GENERATIONS_DIR = '.generations'
const GENERATE_SETTINGS_DIR = '.generate-settings'
const GENERATION_ID_RE = /^generation-[0-9a-f-]{36}$/

/** Generated frontend pages land here, one subdirectory per board. */
export const PAGES_DIR = 'draw2code-pages'

/** Caps: scene JSON bytes, element count, per-element bytes, text length. */
const MAX_SCENE_BYTES = 512 * 1024
const MAX_ELEMENTS = 2000
const MAX_ELEMENT_BYTES = 16 * 1024
const MAX_TEXT_CHARS = 4000

/** Scene names: word chars plus CJK, may contain inner spaces/dashes. */
const NAME_RE = /^[\w\u4e00-\u9fa5][\w\u4e00-\u9fa5 -]{0,63}$/

/** Versions directory (inside the draw2code dir), one subdirectory per board. */
const VERSIONS_DIR = '.versions'
/** How many snapshots to keep per board (oldest pruned first). */
const MAX_VERSIONS = 30
/**
 * Client-side debounced saves arrive every ~1s while the user draws; within
 * one editing burst only the FIRST overwrite snapshots the pre-edit state.
 * Agent-side applyOps always snapshots (one version per update round).
 */
const CLIENT_ARCHIVE_INTERVAL_MS = 10 * 60_000

/** Element types agents may author (render-safe subset). */
const ALLOWED_TYPES = new Set([
  'rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw',
  'text', 'image', 'frame', 'embeddable',
])

/** Restrained Excalidraw-native colors for semantic low-fi distinctions. */
const SEMANTIC_PALETTE: Record<string, { stroke: string; background: string }> = {
  primary: { stroke: '#4c6ef5', background: '#dbe4ff' },
  success: { stroke: '#40c057', background: '#d3f9d8' },
  warning: { stroke: '#fab005', background: '#fff3bf' },
  danger: { stroke: '#fa5252', background: '#ffe3e3' },
  info: { stroke: '#7950f2', background: '#e5dbff' },
  neutral: { stroke: '#868e96', background: '#f1f3f5' },
}

const SEMANTIC_COLOR_TYPES = new Set(['rectangle', 'diamond', 'ellipse'])

const CENTERED_TEXT_ROLES = new Set([
  'button', 'primary-button', 'secondary-button', 'danger-button', 'destructive-button',
  'primary-action', 'secondary-action', 'chip', 'filter-chip', 'choice-chip',
  'tab', 'tab-item', 'navigation-item', 'bottom-navigation-item', 'bottom-nav-item',
  'segmented-control-item',
])

const LEFT_MIDDLE_TEXT_ROLES = new Set([
  'input', 'text-input', 'select', 'dropdown', 'search-input', 'search-field',
])

const BOTTOM_NAVIGATION_ROLES = new Set(['bottom-navigation', 'bottom-nav', 'tabbar'])
const BOTTOM_NAVIGATION_ITEM_ROLES = new Set(['bottom-navigation-item', 'bottom-nav-item'])

export function semanticTextAlignment(role: string): { textAlign: string; verticalAlign: string } | null {
  if (CENTERED_TEXT_ROLES.has(role)) return { textAlign: 'center', verticalAlign: 'middle' }
  if (LEFT_MIDDLE_TEXT_ROLES.has(role)) return { textAlign: 'left', verticalAlign: 'middle' }
  return null
}

function semanticRole(element: Record<string, unknown> | undefined): string {
  if (typeof element?.customData !== 'object' || element.customData === null) return ''
  const role = (element.customData as Record<string, unknown>).role
  return typeof role === 'string' ? role.toLowerCase() : ''
}

function semanticTextGeometry(
  element: Record<string, unknown>,
  container: Record<string, unknown> | undefined,
  alignment: { textAlign: string; verticalAlign: string },
): Record<string, unknown> {
  if (container === undefined || alignment.verticalAlign !== 'middle') return { ...element, ...alignment }
  const fontSize = typeof element.fontSize === 'number' && Number.isFinite(element.fontSize) ? element.fontSize : 20
  const lineHeight = typeof element.lineHeight === 'number' && Number.isFinite(element.lineHeight) ? element.lineHeight : 1.25
  const text = typeof element.text === 'string' ? element.text : ''
  const lines = text === '' ? 1 : text.split('\n').length
  const containerY = typeof container.y === 'number' && Number.isFinite(container.y) ? container.y : 0
  const containerHeight = typeof container.height === 'number' && Number.isFinite(container.height) ? container.height : 0
  const height = Math.min(containerHeight, lines * fontSize * lineHeight)
  return {
    ...element,
    ...alignment,
    y: containerY + (containerHeight - height) / 2,
    height,
  }
}

/** The store's error shape (mirrors the route envelope error). */
export type SceneError = { code: string; message: string }
export type SceneResult<T> = { ok: true; value: T } | { ok: false; error: SceneError }

/** One scene listing row. */
export interface SceneMeta {
  name: string
  rev: number
  updatedAt: number
  elementCount: number
}

/** A whole Excalidraw scene as persisted. */
export interface SceneFile {
  type: 'excalidraw'
  version: 2
  source: string
  elements: Array<Record<string, unknown>>
  appState: { viewBackgroundColor: string }
}

/** Read one scene (rev = file mtime in ms). */
export type SceneRead = { rev: number; scene: SceneFile }

/** Latest verified agent update that the browser should reveal once. */
export interface BoardRevealRequest {
  id: string
  board: string
  createdAt: number
}

/** Snapshot file basenames: <ms-timestamp>-<random6>.json (unique within a
 * burst of same-millisecond writes; ts is parsed from the leading digits). */
const VERSION_FILE_RE = /^(\d{9,})-[0-9a-z]{1,8}\.json$/

function versionStamp(entry: string): number | null {
  const match = VERSION_FILE_RE.exec(entry)
  return match === null ? null : Number(match[1])
}

/** One archived version of a scene (id = snapshot file basename). */
export interface VersionMeta {
  id: string
  ts: number
  elementCount: number
}

function err(code: string, message: string): { ok: false; error: SceneError } {
  return { ok: false, error: { code, message } }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31) + 1
}

/** Normalize a path for prefix comparison (forward slashes, no trailing /). */
function normalizeForPrefix(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+$/, '')
}

/** Canonical containment check (child inside or equal to root). */
export function isPathInside(root: string, child: string): boolean {
  if (root === '' || child === '') return false
  const normRoot = normalizeForPrefix(root)
  const normChild = normalizeForPrefix(child)
  if (normChild === normRoot) return true
  return normChild.startsWith(`${normRoot}/`)
}

/**
 * Find the frame that fully contains the given element box (2px tolerance).
 * Elements spanning frames (e.g. arrows between pages) match nothing and stay
 * unbound, which is the correct behaviour for cross-page connectors.
 */
export function containingFrameId(
  frames: Array<Record<string, unknown>>,
  el: Record<string, unknown>,
): string | null {
  const x1 = Number(el.x ?? 0)
  const y1 = Number(el.y ?? 0)
  const x2 = x1 + Number(el.width ?? 0)
  const y2 = y1 + Number(el.height ?? 0)
  for (const frame of frames) {
    const fx1 = Number(frame.x ?? 0)
    const fy1 = Number(frame.y ?? 0)
    const fx2 = fx1 + Number(frame.width ?? 0)
    const fy2 = fy1 + Number(frame.height ?? 0)
    if (x1 >= fx1 - 2 && y1 >= fy1 - 2 && x2 <= fx2 + 2 && y2 <= fy2 + 2) {
      return String(frame.id)
    }
  }
  return null
}

/**
 * Fill an agent-authored minimal element into a render-safe Excalidraw
 * element. Unknown extra fields pass through (Excalidraw restore() filters);
 * missing core fields get defaults. Returns a new object, never mutates.
 */
export function normalizeElement(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) throw new Error('element must be an object')
  const el = input as Record<string, unknown>
  const type = typeof el.type === 'string' ? el.type : ''
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error(`element type "${type}" is not allowed (use one of ${[...ALLOWED_TYPES].join(', ')})`)
  }
  const id = typeof el.id === 'string' && el.id !== '' ? el.id : null
  if (id === null || id.length > 64) throw new Error('element.id must be a non-empty string (<=64 chars)')

  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d)
  const text = str(el.text, '').slice(0, MAX_TEXT_CHARS)
  const now = Date.now()
  const authoredCustomData = typeof el.customData === 'object' && el.customData !== null
    ? el.customData as Record<string, unknown>
    : {}
  const role = str(authoredCustomData.role, '').toLowerCase()
  const explicitTone = str(authoredCustomData.tone, '').toLowerCase()
  const inferredTone = explicitTone !== ''
    ? explicitTone
    : role === 'primary-action' || role === 'primary-button'
      ? 'primary'
      : role === 'success' || role === 'completed'
        ? 'success'
        : role === 'warning'
          ? 'warning'
          : role === 'danger' || role === 'error' || role === 'overdue'
            ? 'danger'
            : ''
  const semanticColor = SEMANTIC_COLOR_TYPES.has(type) ? SEMANTIC_PALETTE[inferredTone] : undefined

  const out: Record<string, unknown> = {
    id,
    type,
    x: num(el.x, 0),
    y: num(el.y, 0),
    width: num(el.width, type === 'text' ? 160 : 180),
    height: num(el.height, type === 'text' ? 80 : type === 'frame' ? 320 : 80),
    angle: num(el.angle, 0),
    strokeColor: str(el.strokeColor, semanticColor?.stroke ?? '#1e1e1e'),
    backgroundColor: str(el.backgroundColor, semanticColor?.background ?? 'transparent'),
    fillStyle: str(el.fillStyle, 'solid'),
    strokeWidth: num(el.strokeWidth, 1),
    strokeStyle: str(el.strokeStyle, 'solid'),
    roughness: num(el.roughness, 1),
    opacity: num(el.opacity, 100),
    groupIds: Array.isArray(el.groupIds) ? el.groupIds : [],
    frameId: el.frameId === undefined || el.frameId === null ? null : el.frameId,
    roundness: el.roundness === undefined || el.roundness === null
      ? (type === 'line' || type === 'arrow' ? { type: 2 } : null)
      : el.roundness,
    boundElements: Array.isArray(el.boundElements) ? el.boundElements : null,
    locked: el.locked === true,
    // Preserve links created by the user or authored by the agent. Invalid
    // values are discarded, but a valid Excalidraw link must survive a
    // client round-trip through normalizeScene().
    link: typeof el.link === 'string' ? el.link : null,
    updated: now,
    seed: num(el.seed, randomSeed()),
    version: num(el.version, 1),
    versionNonce: num(el.versionNonce, randomSeed()),
    isDeleted: false,
  }

  if (type === 'text') {
    const fontSize = num(el.fontSize, 20)
    const lines = text === '' ? 1 : text.split('\n').length
    out.text = text
    out.originalText = text
    out.fontSize = fontSize
    out.fontFamily = num(el.fontFamily, 1)
    out.textAlign = str(el.textAlign, 'left')
    out.verticalAlign = str(el.verticalAlign, 'top')
    out.containerId = el.containerId === undefined || el.containerId === null ? null : el.containerId
    out.lineHeight = num(el.lineHeight, 1.25)
    if (el.width === undefined) out.width = num(el.width, Math.min(360, fontSize * (text.length || 8) * 0.62 + 16))
    if (el.height === undefined) out.height = num(el.height, lines * fontSize * 1.25 + 8)
  }

  if (type === 'line' || type === 'arrow') {
    const points = Array.isArray(el.points) && el.points.length > 0
      ? el.points
      : [[0, 0], [num(el.width, 160) - num(el.x, 0), 0]]
    out.points = points
    const xs = points.map((p: number[]) => p[0])
    const ys = points.map((p: number[]) => p[1])
    out.width = num(el.width, Math.max(...xs) - Math.min(...xs))
    out.height = num(el.height, Math.max(...ys) - Math.min(...ys))
    // These fields carry visible connector semantics and are present on
    // complete elements emitted by Excalidraw. Keep valid values when the
    // browser saves a scene; minimal agent-authored elements still receive
    // the same safe null defaults as before.
    out.lastCommittedPoint = Array.isArray(el.lastCommittedPoint) ? el.lastCommittedPoint : null
    out.startBinding = typeof el.startBinding === 'object' && el.startBinding !== null ? el.startBinding : null
    out.endBinding = typeof el.endBinding === 'object' && el.endBinding !== null ? el.endBinding : null
    out.startArrowhead = el.startArrowhead === null || typeof el.startArrowhead === 'string' ? el.startArrowhead : null
    out.endArrowhead = el.endArrowhead === null || typeof el.endArrowhead === 'string' ? el.endArrowhead : null
  }

  if (type === 'frame') {
    // Agents sometimes describe a page frame with `text` instead of the
    // Excalidraw-specific `name` field. Keep that authored label usable by
    // draw2code_generate, which selects pages by frame name.
    const frameName = str(el.name, '').trim()
    out.name = frameName !== '' ? frameName : text
  }

  // Pass through any remaining authored fields (customData, etc.).
  for (const [key, value] of Object.entries(el)) {
    if (!(key in out)) out[key] = value
  }

  if (Buffer.byteLength(JSON.stringify(out), 'utf8') > MAX_ELEMENT_BYTES) {
    throw new Error(`element ${id} exceeds ${MAX_ELEMENT_BYTES} bytes`)
  }
  return out
}

/**
 * Excalidraw bound text is a two-way relation: the text points to its shape
 * through `containerId`, and the shape points back through `boundElements`.
 * Agent ops often author only the first half. Excalidraw then repairs the
 * relation on double-click, which is why labels appear only after editing.
 * Complete unambiguous pairs before every agent update is persisted.
 */
export function reconcileBoundTextBindings(
  elements: Array<Record<string, unknown>>,
  alignmentFocusIds?: ReadonlySet<string>,
): Array<Record<string, unknown>> {
  const byId = new Map(elements.map((element) => [String(element.id ?? ''), element]))
  const textsByContainer = new Map<string, Array<Record<string, unknown>>>()
  const frameMembershipByText = new Map<string, string>()
  const detachedNavigationTextIds = new Set<string>()

  for (const element of elements) {
    if (element.type !== 'text' || typeof element.containerId !== 'string' || element.containerId === '') continue
    const container = byId.get(element.containerId)
    const focused = alignmentFocusIds === undefined
      || alignmentFocusIds.has(String(element.id ?? ''))
      || (container !== undefined && alignmentFocusIds.has(String(container.id ?? '')))
    if (focused
      && BOTTOM_NAVIGATION_ITEM_ROLES.has(semanticRole(element))
      && BOTTOM_NAVIGATION_ROLES.has(semanticRole(container))) {
      detachedNavigationTextIds.add(String(element.id ?? ''))
    }
  }

  for (const element of elements) {
    if (element.type !== 'text' || typeof element.containerId !== 'string' || element.containerId === '') continue
    if (detachedNavigationTextIds.has(String(element.id ?? ''))) continue
    const container = byId.get(element.containerId)
    if (container === undefined) continue
    if (container.type === 'frame') {
      frameMembershipByText.set(String(element.id ?? ''), element.containerId)
      continue
    }
    if (!SEMANTIC_COLOR_TYPES.has(String(container.type ?? ''))) continue
    const texts = textsByContainer.get(element.containerId) ?? []
    texts.push(element)
    textsByContainer.set(element.containerId, texts)
  }

  return elements.map((element) => {
    const frameMembership = frameMembershipByText.get(String(element.id ?? ''))
    if (frameMembership !== undefined) {
      return {
        ...element,
        containerId: null,
        frameId: typeof element.frameId === 'string' && element.frameId !== '' ? element.frameId : frameMembership,
      }
    }
    if (element.type === 'text') {
      const container = typeof element.containerId === 'string' ? byId.get(element.containerId) : undefined
      const elementRole = semanticRole(element)
      const containerRole = semanticRole(container)
      const role = elementRole !== '' ? elementRole : containerRole
      const isFocused = alignmentFocusIds === undefined
        || alignmentFocusIds.has(String(element.id ?? ''))
        || (container !== undefined && alignmentFocusIds.has(String(container.id ?? '')))
      const alignment = semanticTextAlignment(role)
      if (isFocused && alignment !== null) {
        if (detachedNavigationTextIds.has(String(element.id ?? ''))) {
          return {
            ...semanticTextGeometry(element, container, alignment),
            containerId: null,
          }
        }
        if (container !== undefined) return semanticTextGeometry(element, container, alignment)
        if (BOTTOM_NAVIGATION_ITEM_ROLES.has(role)) {
          const navigationShell = elements.find((candidate) => {
            if (!SEMANTIC_COLOR_TYPES.has(String(candidate.type ?? ''))
              || !BOTTOM_NAVIGATION_ROLES.has(semanticRole(candidate))) return false
            const x = Number(element.x ?? 0)
            const y = Number(element.y ?? 0)
            const width = Number(element.width ?? 0)
            const height = Number(element.height ?? 0)
            const shellX = Number(candidate.x ?? 0)
            const shellY = Number(candidate.y ?? 0)
            return x >= shellX - 2 && y >= shellY - 2
              && x + width <= shellX + Number(candidate.width ?? 0) + 2
              && y + height <= shellY + Number(candidate.height ?? 0) + 2
          })
          if (navigationShell !== undefined) return semanticTextGeometry(element, navigationShell, alignment)
        }
        return { ...element, ...alignment }
      }
      return element
    }
    if (!SEMANTIC_COLOR_TYPES.has(String(element.type ?? ''))) return element
    const containerId = String(element.id ?? '')
    const texts = textsByContainer.get(containerId) ?? []
    // A shape supports one bound text. Ambiguous scenes are left untouched
    // instead of silently choosing one label and changing the user's layout.
    if (texts.length !== 1) return element

    const textId = String(texts[0].id ?? '')
    const existing = Array.isArray(element.boundElements)
      ? element.boundElements.filter((binding) => {
        if (typeof binding !== 'object' || binding === null) return true
        return (binding as Record<string, unknown>).type !== 'text'
      })
      : []
    return {
      ...element,
      boundElements: [...existing, { type: 'text', id: textId }],
    }
  })
}

/** Validate and normalize a whole scene object. */
function normalizeScene(input: unknown): SceneFile {
  if (typeof input !== 'object' || input === null) throw new Error('scene must be an object')
  const raw = input as Record<string, unknown>
  if (!Array.isArray(raw.elements)) throw new Error('scene.elements must be an array')
  if (raw.elements.length > MAX_ELEMENTS) throw new Error(`scene has more than ${MAX_ELEMENTS} elements`)
  const appState = (typeof raw.appState === 'object' && raw.appState !== null ? raw.appState : {}) as Record<string, unknown>
  return {
    type: 'excalidraw',
    version: 2,
    source: 'dsh-draw2code',
    // Excalidraw deletions arrive as isDeleted tombstones kept in the
    // elements array. They MUST be dropped here (physical deletion):
    // normalizeElement defaults isDeleted to false, so letting a tombstone
    // through silently resurrects the element on disk — the user's deletion
    // vanishes, then resurfaces on the next poll, and re-deleting it is
    // swallowed by the client's echo guard (identical JSON). Filtering here
    // makes deletion physical and keeps client/server in agreement.
    elements: raw.elements
      .filter((el) => (el as Record<string, unknown>).isDeleted !== true)
      .map(normalizeElement),
    appState: {
      viewBackgroundColor: typeof appState.viewBackgroundColor === 'string'
        ? appState.viewBackgroundColor
        : '#ffffff',
    },
  }
}

/** An empty scene. */
export function emptyScene(): SceneFile {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'dsh-draw2code',
    elements: [],
    appState: { viewBackgroundColor: '#ffffff' },
  }
}

/** One agent op against a scene. */
export type SceneOp =
  | { op: 'upsert'; element: Record<string, unknown> }
  | { op: 'delete'; id: string }
  | { op: 'clear' }
  | { op: 'replace'; scene: unknown }

/** A short human-readable type name for error messages. */
function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'string') return `string(${value.length} chars)`
  return typeof value
}

/** Parse and validate an untrusted ops array (also accepts a JSON-encoded
 * string — some harness transports deliver json-typed args as text). Every
 * error is indexed and actionable so the agent can self-correct in one
 * retry. */
function parseOps(input: unknown): SceneOp[] {
  let source: unknown = input
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source)
    } catch (error) {
      throw new Error(`ops is not valid JSON: ${error instanceof Error ? error.message : String(error)}. Send an array like [{"op":"upsert","element":{...}}] or a JSON string encoding it`)
    }
  }
  if (!Array.isArray(source)) {
    throw new Error(`ops must be an array, got ${typeName(source)}. Large payloads sometimes arrive as a JSON string (auto-parsed); if you still see this, check the ops argument is an array of op objects`)
  }
  if (source.length > MAX_ELEMENTS) throw new Error(`ops has ${source.length} entries (max ${MAX_ELEMENTS})`)
  return source.map((raw, index) => {
    const where = `ops[${index}]`
    if (typeof raw !== 'object' || raw === null) throw new Error(`${where} must be an object, got ${typeName(raw)}`)
    const op = raw as Record<string, unknown>
    const kind = op.op
    if (kind === 'upsert') {
      if (typeof op.element !== 'object' || op.element === null) {
        throw new Error(`${where} is "upsert" but missing its element: use {"op":"upsert","element":{"id":"x","type":"rectangle",...}}`)
      }
      const el = op.element as Record<string, unknown>
      if (typeof el.id !== 'string' || el.id === '') {
        throw new Error(`${where}.element.id missing or not a string: every element needs a unique non-empty id`)
      }
      if (typeof el.type !== 'string') {
        throw new Error(`${where}.element.type missing: pick one of rectangle | diamond | ellipse | arrow | line | freedraw | text | frame`)
      }
      return { op: 'upsert' as const, element: el }
    }
    if (kind === 'delete') {
      // Accept both the raw authored shape {op:'delete', id} and the
      // already-parsed ParsedOp shape {op:'delete', elementId}.
      const id = typeof op.id === 'string' ? op.id : (typeof op.elementId === 'string' ? op.elementId : '')
      if (id === '') throw new Error(`${where} is "delete" but missing its id: use {"op":"delete","id":"<element id>"}`)
      return { op: 'delete' as const, id }
    }
    if (kind === 'clear') return { op: 'clear' as const }
    if (kind === 'replace') {
      if (typeof op.scene !== 'object' || op.scene === null) {
        throw new Error(`${where} is "replace" but missing its scene: use {"op":"replace","scene":{"elements":[...]}}`)
      }
      return { op: 'replace' as const, scene: op.scene }
    }
    throw new Error(`${where}.op = "${String(kind)}" is invalid: must be one of upsert | delete | clear | replace. The most common mistake is forgetting the op field entirely`)
  })
}

/**
 * The workspace-gated scene store.
 */
export class SceneStore {
  private readonly boardReveals = new Map<string, BoardRevealRequest>()
  private readonly writeQueues = new Map<string, Promise<void>>()
  private revealCounter = 0

  constructor(private readonly ctx: Context) {}

  /** Gate a requested root: must resolve on disk and sit inside a registered workspace. */
  private async gate(root: string): Promise<SceneResult<string>> {
    if (typeof root !== 'string' || root === '') return err('workspace-unknown', 'empty project root')
    let canonical: string
    try {
      canonical = await realpath(root)
    } catch {
      return err('workspace-unknown', 'path does not resolve on disk')
    }
    const workspaces = this.ctx.workspaceRegistry.list()
    for (const workspace of workspaces) {
      if (isPathInside(workspace.path, canonical)) return { ok: true, value: canonical }
    }
    return err('workspace-unknown', 'path is not inside a registered workspace')
  }

  /** The draw2code directory for a gated root (created lazily on write). */
  private dir(canonicalRoot: string): string {
    return join(canonicalRoot, SCENE_DIR)
  }

  private activeBoardPath(canonicalRoot: string): string {
    return join(this.dir(canonicalRoot), ACTIVE_BOARD_FILE)
  }

  /** Validate a scene name. */
  private checkName(name: unknown): SceneResult<string> {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!NAME_RE.test(trimmed)) {
      return err('bad-name', `scene name "${name}" is invalid (1-64 chars of letters/digits/_/-/space/CJK, no extension)`)
    }
    return { ok: true, value: trimmed }
  }

  private async scenePath(canonicalRoot: string, name: string): Promise<string> {
    return join(this.dir(canonicalRoot), `${name}.excalidraw.json`)
  }

  private async withWriteLock<T>(path: string, task: () => Promise<T>): Promise<T> {
    const previous = this.writeQueues.get(path) ?? Promise.resolve()
    let release = (): void => undefined
    const current = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.catch(() => undefined).then(() => current)
    this.writeQueues.set(path, tail)
    await previous.catch(() => undefined)
    try {
      return await task()
    } finally {
      release()
      if (this.writeQueues.get(path) === tail) this.writeQueues.delete(path)
    }
  }

  /** Read the board selected by the browser, without making it a scene. */
  async getActiveBoard(root: string): Promise<SceneResult<{ name: string | null }>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    let raw: string
    try {
      raw = await readFile(this.activeBoardPath(gated.value), 'utf8')
    } catch {
      return { ok: true, value: { name: null } }
    }
    try {
      const parsed = JSON.parse(raw) as { name?: unknown }
      const named = this.checkName(parsed.name)
      return named.ok ? { ok: true, value: { name: named.value } } : { ok: true, value: { name: null } }
    } catch {
      return { ok: true, value: { name: null } }
    }
  }

  /** Persist the browser's selected board for agent tools in this workspace. */
  async setActiveBoard(root: string, name: string): Promise<SceneResult<{ name: string }>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const named = this.checkName(name)
    if (!named.ok) return named
    await mkdir(this.dir(gated.value), { recursive: true })
    const path = this.activeBoardPath(gated.value)
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await writeFile(tmp, `${JSON.stringify({ name: named.value })}\n`, 'utf8')
    await rename(tmp, path)
    return { ok: true, value: { name: named.value } }
  }

  /** Publish the latest verified update for the browser-side auto-open loop. */
  async publishBoardReveal(root: string, name: string): Promise<SceneResult<BoardRevealRequest>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const named = this.checkName(name)
    if (!named.ok) return named
    this.revealCounter += 1
    const request = {
      id: `reveal-${Date.now().toString(36)}-${this.revealCounter.toString(36)}`,
      board: named.value,
      createdAt: Date.now(),
    }
    this.boardReveals.set(gated.value, request)
    return { ok: true, value: request }
  }

  /** Read the latest reveal request; clients de-duplicate it by id. */
  async getBoardReveal(root: string): Promise<SceneResult<{ request: BoardRevealRequest | null }>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    return { ok: true, value: { request: this.boardReveals.get(gated.value) ?? null } }
  }

  /** The versions directory of one board (inside draw2code/.versions/<name>). */
  private versionsDir(canonicalRoot: string, name: string): string {
    return join(this.dir(canonicalRoot), VERSIONS_DIR, name)
  }

  /**
   * Snapshot the CURRENT disk scene of a board before it gets overwritten.
   * Skipped when the scene file is absent, when the incoming content is
   * byte-identical, or (client throttling) when the newest snapshot of the
   * board is younger than CLIENT_ARCHIVE_INTERVAL_MS. Prunes to MAX_VERSIONS.
   */
  private async archiveCurrent(canonicalRoot: string, name: string, incomingJson: string, always: boolean): Promise<void> {
    const scenePath = await this.scenePath(canonicalRoot, name)
    let raw: string
    try {
      const info = await stat(scenePath)
      if (!info.isFile()) return
      raw = await readFile(scenePath, 'utf8')
    } catch {
      return // absent: nothing to snapshot
    }
    const currentJson = JSON.stringify(JSON.parse(raw))
    if (currentJson === JSON.stringify(JSON.parse(incomingJson))) return
    const dir = this.versionsDir(canonicalRoot, name)
    let entries: string[] = []
    try {
      entries = (await readdir(dir)).filter((entry) => versionStamp(entry) !== null)
    } catch { /* absent: no throttle check needed */ }
    if (!always && entries.length > 0) {
      const stamps = entries.map((entry) => versionStamp(entry) ?? 0)
      const newest = Math.max(...stamps)
      if (Date.now() - newest < CLIENT_ARCHIVE_INTERVAL_MS) return
    }
    try {
      await mkdir(dir, { recursive: true })
      const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
      await writeFile(join(dir, `${Date.now()}-${suffix}.json`), `${raw}\n`, 'utf8')
      if (entries.length + 1 > MAX_VERSIONS) {
        const doomed = entries
          .map((entry) => ({ entry, stamp: versionStamp(entry) ?? 0 }))
          .sort((a, b) => a.stamp - b.stamp)
          .slice(0, entries.length + 1 - MAX_VERSIONS)
        await Promise.all(doomed.map(({ entry }) => rm(join(dir, entry), { force: true }).catch(() => undefined)))
      }
    } catch (error) {
      this.ctx.logger.warn('draw2code version snapshot failed: %o', error)
    }
  }

  /** List the archived versions of a board (newest first, empty when none). */
  async listVersions(root: string, name: string): Promise<SceneResult<VersionMeta[]>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const named = this.checkName(name)
    if (!named.ok) return named
    const dir = this.versionsDir(gated.value, named.value)
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return { ok: true, value: [] }
    }
    const versions: VersionMeta[] = []
    for (const entry of entries) {
      const stamp = versionStamp(entry)
      if (stamp === null) continue
      try {
        const raw = await readFile(join(dir, entry), 'utf8')
        const elements = (JSON.parse(raw) as { elements?: unknown }).elements
        versions.push({
          id: entry.slice(0, -'.json'.length),
          ts: stamp,
          elementCount: Array.isArray(elements) ? elements.length : 0,
        })
      } catch {
        // Unreadable snapshots are skipped, never fatal.
      }
    }
    versions.sort((a, b) => b.ts - a.ts)
    return { ok: true, value: versions }
  }

  /** Roll a board back to one archived version (snapshotting the current
   * state first, so the rollback itself is reversible). */
  async restoreVersion(root: string, name: string, id: string): Promise<SceneResult<SceneMeta>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const named = this.checkName(name)
    if (!named.ok) return named
    if (!/^\d{9,}-[0-9a-z]{1,8}$/.test(id)) return err('bad-version', `version id "${id}" is invalid`)
    let raw: string
    try {
      raw = await readFile(join(this.versionsDir(gated.value, named.value), `${id}.json`), 'utf8')
    } catch {
      return err('not-found', `version ${id} of scene "${named.value}" does not exist`)
    }
    let scene: unknown
    try {
      scene = JSON.parse(raw)
    } catch {
      return err('corrupt', `version ${id} of scene "${named.value}" is not valid JSON`)
    }
    // 'agent' here means "always snapshot": the state being rolled back from
    // must be archived so the rollback itself is reversible.
    return this.write(root, named.value, scene, undefined, 'agent')
  }

  /**
   * Inventory the generated-pages output directory of a board
   * (draw2code-pages/<board>/, empty when absent) — the style-continuation
   * basis for draw2code_generate.
   */
  async existingPages(root: string, name: string): Promise<SceneResult<string[]>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const named = this.checkName(name)
    if (!named.ok) return named
    const dir = join(gated.value, PAGES_DIR, named.value)
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return { ok: true, value: [] }
    }
    const files: string[] = []
    for (const entry of entries) {
      try {
        const info = await stat(join(dir, entry))
        if (info.isFile()) files.push(entry)
      } catch {
        // unreadable entries are skipped
      }
    }
    files.sort()
    return { ok: true, value: files }
  }

  /** Read one resumable generate session kept beside, but separate from, scenes. */
  async readGeneration(root: string, sessionId: string): Promise<SceneResult<Record<string, unknown>>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    if (!GENERATION_ID_RE.test(sessionId)) return err('bad-generation-id', `generation id "${sessionId}" is invalid`)
    try {
      const raw = await readFile(join(this.dir(gated.value), GENERATIONS_DIR, `${sessionId}.json`), 'utf8')
      return { ok: true, value: JSON.parse(raw) as Record<string, unknown> }
    } catch {
      return err('not-found', `generation "${sessionId}" does not exist`)
    }
  }

  /** Atomically persist one generate session so interruption never loses choices. */
  async writeGeneration(root: string, sessionId: string, draft: Record<string, unknown>): Promise<SceneResult<Record<string, unknown>>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    if (!GENERATION_ID_RE.test(sessionId)) return err('bad-generation-id', `generation id "${sessionId}" is invalid`)
    const dir = join(this.dir(gated.value), GENERATIONS_DIR)
    await mkdir(dir, { recursive: true })
    const path = join(dir, `${sessionId}.json`)
    const normalized = { ...draft, sessionId, updatedAt: Date.now() }
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await writeFile(tmp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
    await rename(tmp, path)
    return { ok: true, value: normalized }
  }

  /** Project-level visual direction inherited by later generate sessions. */
  async readGenerateSettings(root: string, name: string): Promise<SceneResult<Record<string, unknown> | null>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const named = this.checkName(name)
    if (!named.ok) return named
    try {
      const raw = await readFile(join(this.dir(gated.value), GENERATE_SETTINGS_DIR, `${named.value}.json`), 'utf8')
      return { ok: true, value: JSON.parse(raw) as Record<string, unknown> }
    } catch {
      return { ok: true, value: null }
    }
  }

  async writeGenerateSettings(root: string, name: string, settings: Record<string, unknown>): Promise<SceneResult<Record<string, unknown>>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const named = this.checkName(name)
    if (!named.ok) return named
    const dir = join(this.dir(gated.value), GENERATE_SETTINGS_DIR)
    await mkdir(dir, { recursive: true })
    const path = join(dir, `${named.value}.json`)
    const normalized = { ...settings, board: named.value, updatedAt: Date.now() }
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await writeFile(tmp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
    await rename(tmp, path)
    return { ok: true, value: normalized }
  }

  /** List every scene under a root (empty list when the directory is absent). */
  async list(root: string): Promise<SceneResult<SceneMeta[]>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    let entries: string[]
    try {
      entries = await readdir(this.dir(gated.value))
    } catch {
      return { ok: true, value: [] }
    }
    const metas: SceneMeta[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.excalidraw.json')) continue
      const name = entry.slice(0, -'.excalidraw.json'.length)
      const path = join(this.dir(gated.value), entry)
      try {
        const info = await stat(path)
        if (!info.isFile()) continue
        const raw = await readFile(path, 'utf8')
        const parsed: unknown = JSON.parse(raw)
        const elements = (parsed as { elements?: unknown[] }).elements
        metas.push({
          name,
          rev: info.mtimeMs,
          updatedAt: info.mtimeMs,
          elementCount: Array.isArray(elements) ? elements.length : 0,
        })
      } catch {
        // Unreadable rows are skipped, never fatal.
      }
    }
    metas.sort((a, b) => b.updatedAt - a.updatedAt)
    return { ok: true, value: metas }
  }

  /** Read one scene. */
  async read(root: string, name: string): Promise<SceneResult<SceneRead>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const named = this.checkName(name)
    if (!named.ok) return named
    const path = await this.scenePath(gated.value, named.value)
    let raw: string
    let rev: number
    try {
      const info = await stat(path)
      rev = info.mtimeMs
      raw = await readFile(path, 'utf8')
    } catch {
      return err('not-found', `scene "${named.value}" does not exist`)
    }
    if (Buffer.byteLength(raw) > MAX_SCENE_BYTES * 4) {
      return err('too-large', `scene "${named.value}" exceeds the read cap`)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return err('corrupt', `scene "${named.value}" is not valid JSON`)
    }
    const elements = (parsed as { elements?: unknown }).elements
    const scene: SceneFile = {
      type: 'excalidraw',
      version: 2,
      source: 'dsh-draw2code',
      elements: Array.isArray(elements) ? elements as Array<Record<string, unknown>> : [],
      appState: {
        viewBackgroundColor:
          typeof (parsed as { appState?: { viewBackgroundColor?: unknown } }).appState?.viewBackgroundColor === 'string'
            ? (parsed as { appState: { viewBackgroundColor: string } }).appState.viewBackgroundColor
            : '#ffffff',
      },
    }
    return { ok: true, value: { rev, scene } }
  }

  /** Write a whole scene (validated). baseRev conflicts return 'conflict'. */
  async write(root: string, name: string, sceneInput: unknown, baseRev?: number, archive: 'client' | 'agent' = 'client'): Promise<SceneResult<SceneMeta>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const named = this.checkName(name)
    if (!named.ok) return named
    let scene: SceneFile
    try {
      scene = normalizeScene(sceneInput)
    } catch (error) {
      return err('bad-scene', error instanceof Error ? error.message : String(error))
    }
    const json = JSON.stringify(scene, null, 2)
    if (Buffer.byteLength(json, 'utf8') > MAX_SCENE_BYTES) {
      return err('too-large', `scene exceeds ${MAX_SCENE_BYTES} bytes`)
    }
    const path = await this.scenePath(gated.value, named.value)
    return this.withWriteLock(path, async () => {
      if (typeof baseRev === 'number') {
        try {
          const info = await stat(path)
          if (Math.abs(info.mtimeMs - baseRev) > 0.5) {
            return err('conflict', `scene changed on disk since rev ${baseRev}`)
          }
        } catch {
          // Absent file: creating, no conflict.
        }
      }
      await mkdir(this.dir(gated.value), { recursive: true })
      // Snapshot the state being replaced (throttled for client saves, always
      // for agent updates) so every meaningful change is rollback-able.
      await this.archiveCurrent(gated.value, named.value, json, archive === 'agent')
      // Atomic write (tmp + rename): concurrent writers — the agent's applyOps
      // and the browser's debounced save both reach this — must never interleave
      // inside the scene file. Plain writeFile truncates then streams, so two
      // overlapping writes splice their tails into one corrupt JSON file.
      // rename() over the destination is atomic within one filesystem.
      const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await writeFile(tmp, json + '\n', 'utf8')
      await rename(tmp, path)
      const info = await stat(path)
      return {
        ok: true,
        value: { name: named.value, rev: info.mtimeMs, updatedAt: info.mtimeMs, elementCount: scene.elements.length },
      }
    })
  }

  /** Create an empty scene (fails when it already exists). */
  async create(root: string, name: string): Promise<SceneResult<SceneMeta>> {
    const read = await this.read(root, name)
    if (read.ok) return err('exists', `scene "${name}" already exists`)
    if (read.error.code !== 'not-found') return read
    return this.write(root, name, emptyScene())
  }

  /** Delete one scene. */
  async remove(root: string, name: string): Promise<SceneResult<{ deleted: true }>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const named = this.checkName(name)
    if (!named.ok) return named
    const path = await this.scenePath(gated.value, named.value)
    try {
      await rm(path)
    } catch {
      return err('not-found', `scene "${name}" does not exist`)
    }
    // Also drop this board's snapshots — they are meaningless without it.
    await rm(this.versionsDir(gated.value, named.value), { recursive: true, force: true }).catch(() => undefined)
    const active = await this.getActiveBoard(root)
    if (active.ok && active.value.name === named.value) {
      await rm(this.activeBoardPath(gated.value), { force: true }).catch(() => undefined)
    }
    return { ok: true, value: { deleted: true } }
  }

  /**
   * Apply an ops array against a scene (auto-creating an empty scene when it
   * does not exist yet) — the agent-side mutation path. Upserts normalize
   * their element, so partial authored fields are filled.
   */
  async applyOps(root: string, name: string, opsInput: unknown, baseRev?: number): Promise<SceneResult<SceneMeta & { applied: number }>> {
    let ops: SceneOp[]
    try {
      ops = parseOps(opsInput)
    } catch (error) {
      return err('bad-ops', error instanceof Error ? error.message : String(error))
    }
    const current = await this.read(root, name)
    let scene: SceneFile
    if (current.ok) {
      scene = current.value.scene
    } else if (current.error.code === 'not-found') {
      scene = emptyScene()
    } else {
      return current
    }

    let applied = 0
    const alignmentFocusIds = new Set<string>()
    let alignWholeScene = false
    for (const op of ops) {
      if (op.op === 'replace') {
        try {
          scene = normalizeScene(op.scene)
        } catch (error) {
          return err('bad-scene', error instanceof Error ? error.message : String(error))
        }
        alignWholeScene = true
        applied += 1
        continue
      }
      if (op.op === 'clear') {
        scene = { ...scene, elements: [] }
        applied += 1
        continue
      }
      if (op.op === 'delete') {
        const before = scene.elements.length
        scene = { ...scene, elements: scene.elements.filter((el) => el.id !== op.id) }
        if (scene.elements.length !== before) applied += 1
        continue
      }
      // upsert
      alignmentFocusIds.add(String(op.element.id ?? ''))
      let normalized: Record<string, unknown>
      try {
        normalized = normalizeElement(op.element)
      } catch (error) {
        return err('bad-element', error instanceof Error ? error.message : String(error))
      }
      // Auto-bind the element to the frame that fully contains it, so
      // agent-drawn components follow their frame when the user drags it.
      // An explicit frameId in the op is respected as-is; elements that fit
      // no frame (or span several, like cross-page arrows) stay unbound.
      if (normalized.frameId === null || normalized.frameId === undefined) {
        const frames = scene.elements.filter((el) => el.type === 'frame')
        normalized.frameId = containingFrameId(frames, normalized)
      }
      const index = scene.elements.findIndex((el) => el.id === normalized.id)
      if (index === -1) {
        scene = { ...scene, elements: [...scene.elements, normalized] }
      } else {
        const elements = scene.elements.slice()
        elements[index] = normalized
        scene = { ...scene, elements }
      }
      applied += 1
    }

    if (scene.elements.length > MAX_ELEMENTS) {
      return err('too-many', `scene would exceed ${MAX_ELEMENTS} elements`)
    }
    // Complete Excalidraw's two-way text binding only on the agent mutation
    // path. Reads and ordinary client writes remain non-mutating; existing
    // diagnostic boards are not silently repaired merely by opening them.
    scene = {
      ...scene,
      elements: reconcileBoundTextBindings(
        scene.elements,
        alignWholeScene ? undefined : alignmentFocusIds,
      ),
    }
    const written = await this.write(root, name, scene, baseRev, 'agent')
    if (!written.ok) return written
    return { ok: true, value: { ...written.value, applied } }
  }
}
