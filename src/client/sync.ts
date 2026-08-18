/**
 * Pure client/server scene-sync primitives.
 *
 * Keeping the merge and retry policy outside React makes the dangerous
 * debounce/conflict boundary testable without mounting Excalidraw.
 * @module dsh-draw2code/client/sync
 */

export type Element = Record<string, unknown>

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
