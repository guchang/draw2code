/**
 * Pure client/server scene-sync primitives.
 *
 * Keeping the merge and retry policy outside React makes the dangerous
 * debounce/conflict boundary testable without mounting Excalidraw.
 * @module dsh-draw2code/client/sync
 */

export type Element = Record<string, unknown>

const EXCALIDRAW_RENDER_FIELDS = new Set(['updated', 'version', 'versionNonce'])

function comparableElement(element: Element, ignoreIndex: boolean): Element {
  return Object.fromEntries(Object.entries(element).filter(([key]) => {
    if (EXCALIDRAW_RENDER_FIELDS.has(key)) return false
    return !(ignoreIndex && key === 'index')
  }))
}

/** Detect Excalidraw's first-render metadata normalization without hiding edits. */
export function isNormalizationOnlyEcho(base: Element[], candidate: Element[]): boolean {
  if (base.length !== candidate.length) return false
  if (base.some((element, index) => String(element.id ?? '') !== String(candidate[index]?.id ?? ''))) return false
  const candidateById = new Map(candidate.map((element) => [String(element.id ?? ''), element]))
  return base.every((element) => {
    const peer = candidateById.get(String(element.id ?? ''))
    if (peer === undefined) return false
    const ignoreIndex = element.index === undefined
    return JSON.stringify(comparableElement(element, ignoreIndex)) === JSON.stringify(comparableElement(peer, ignoreIndex))
  })
}

export interface PendingSave {
  name: string
  elements: Element[]
  /** Revision and scene that existed when the first edit in this burst began. */
  baseRev: number
  baseElements: Element[]
}

export interface SyncWriteSuccess {
  ok: true
  rev: number
}

export interface SyncWriteFailure {
  ok: false
  error: { code: string; message: string }
}

export type SyncWriteResult = SyncWriteSuccess | SyncWriteFailure

export interface SyncReadSuccess {
  ok: true
  rev: number
  elements: Element[]
}

export interface SyncReadFailure {
  ok: false
  error: { code: string; message: string }
}

export type SyncReadResult = SyncReadSuccess | SyncReadFailure

function cloneElements(elements: Element[]): Element[] {
  return elements.map((element) => ({ ...element }))
}

export function capturePendingSave(
  previous: PendingSave | null,
  name: string,
  elements: Element[],
  baseRev: number,
  baseElements: Element[],
): PendingSave {
  // A debounce burst can contain many pointer events. The later events change
  // the candidate scene, but they must not move its compare-and-swap base.
  if (previous !== null && previous.name === name) {
    return { ...previous, elements }
  }
  return { name, elements, baseRev, baseElements: cloneElements(baseElements) }
}

export async function flushCapturedSave(
  pending: PendingSave | null,
  persist: (pending: PendingSave) => Promise<boolean>,
): Promise<{ ok: true; retry: null } | { ok: false; retry: PendingSave }> {
  if (pending === null) return { ok: true, retry: null }
  return await persist(pending)
    ? { ok: true, retry: null }
    : { ok: false, retry: pending }
}

/** Serialize asynchronous UI actions and commit only the latest request. */
export class LatestAsyncAction {
  private latest = 0
  private tail: Promise<void> = Promise.resolve()

  run<T>(
    prepare: (isCurrent: () => boolean) => Promise<T>,
    commit: (value: T) => void,
  ): Promise<boolean> {
    const request = ++this.latest
    const isCurrent = (): boolean => request === this.latest
    const task = this.tail.catch(() => undefined).then(async () => {
      if (!isCurrent()) return false
      const value = await prepare(isCurrent)
      if (!isCurrent()) return false
      commit(value)
      return true
    })
    this.tail = task.then(() => undefined, () => undefined)
    return task
  }
}

function sameElement(left: Element | undefined, right: Element | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Three-way merge by element id. A local deletion is a real local change and
 * therefore wins when the remote side only added unrelated elements.
 */
export function mergeConcurrentElements(base: Element[], local: Element[], remote: Element[]): Element[] {
  const baseById = new Map(base.map((element) => [String(element.id), element]))
  const localById = new Map(local.map((element) => [String(element.id), element]))
  const remoteById = new Map(remote.map((element) => [String(element.id), element]))
  const orderedIds = [...remote, ...local]
    .map((element) => String(element.id))
    .filter((id, index, ids) => id !== '' && ids.indexOf(id) === index)
  const merged: Element[] = []

  for (const id of orderedIds) {
    const before = baseById.get(id)
    const localElement = localById.get(id)
    const remoteElement = remoteById.get(id)
    const localChanged = !sameElement(localElement, before)
    const remoteChanged = !sameElement(remoteElement, before)
    const chosen = localChanged && !remoteChanged ? localElement
      : remoteChanged && !localChanged ? remoteElement
        : localChanged ? localElement : remoteElement
    if (chosen !== undefined && chosen.isDeleted !== true) merged.push(chosen)
  }
  return merged
}

export async function saveWithConflictRetry(args: {
  elements: Element[]
  baseElements: Element[]
  baseRev: number
  read: () => Promise<SyncReadResult>
  write: (elements: Element[], baseRev?: number) => Promise<SyncWriteResult>
  /** Number of conflict reads/retries after the initial write. */
  maxRetries?: number
}): Promise<{ result: SyncWriteResult; savedElements: Element[] }> {
  let candidate = args.elements
  let mergeBase = args.baseElements
  let revision = args.baseRev
  // Pass 0 through for a first save. SceneStore treats it as "the file must
  // still be absent"; turning it into undefined would make a new-board save
  // blind-write over an agent-created scene during the same debounce window.
  let result = await args.write(candidate, revision)

  for (let attempt = 0; !result.ok && result.error.code === 'conflict' && attempt < (args.maxRetries ?? 3); attempt += 1) {
    const latest = await args.read()
    if (!latest.ok) break
    candidate = mergeConcurrentElements(mergeBase, candidate, latest.elements)
    mergeBase = latest.elements
    revision = latest.rev
    result = await args.write(candidate, revision)
  }

  return { result, savedElements: candidate }
}
