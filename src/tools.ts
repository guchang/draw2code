/**
 * Agent tools: the model-side surface of the 画码 board. Three tools over
 * the same workspace-gated store the canvas uses, so a board drawn by the
 * agent is immediately visible in the right sidebar and vice versa.
 *
 * - draw2code_list:   scenes of a workspace
 * - draw2code_read:   one scene (summary + full elements)
 * - draw2code_update: ops (upsert / delete / clear / replace) against a scene
 * @module dsh-draw2code/host/tools
 */

import { createHash, randomUUID } from 'node:crypto'
import { open, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { formatLayoutIssues, inspectPrototypeLayout, inspectPrototypeQuality } from './layout.ts'
import { type ProjectStore } from './project-store.ts'
import {
  pageElementIds,
  pageForElement,
  pageMembershipWarnings,
  pageNameWarnings,
  prototypePageRelations,
  prototypePages,
  publicPrototypePages,
  type PrototypePage,
} from './prototype-page.ts'
import { normalizeElement, reconcileBoundTextBindings, semanticTextAlignment, type SceneStore } from './scene-store.ts'

function text(value: string): ContentBlock[] {
  return [{ type: 'text', text: value }]
}

/** Cap on the full-elements JSON payload handed back to the model. */
const MAX_ELEMENTS_JSON = 120 * 1024
const SNAPSHOT_CACHE_MAX = 40
const DEFAULT_BOARD = 'prototype'

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function customData(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return typeof value?.customData === 'object' && value.customData !== null
    ? value.customData as Record<string, unknown>
    : {}
}

interface ParsedOp {
  op: 'upsert' | 'delete' | 'clear' | 'replace'
  elementId?: string
  element?: Record<string, unknown>
  scene?: Record<string, unknown>
}

interface UpdateConflict {
  op: 'modify-existing' | 'delete-existing' | 'replace' | 'clear'
  reason: string
  elementId?: string
  before?: string
  after?: string
}

interface ChangeSummary {
  added: string[]
  removed: string[]
  modified: string[]
  [key: string]: JsonValue
}

interface DeltaIds {
  added: Set<string>
  removed: Set<string>
  modified: Set<string>
}

interface Snapshot {
  rev: number
  elements: Array<Record<string, unknown>>
}

const boardCache = new Map<string, Snapshot>()

async function resolveBoard(store: SceneStore, root: string, requested?: string): Promise<{ name: string; activeBoard?: string }> {
  const active = await store.getActiveBoard(root)
  const activeBoard = active.ok && active.value.name !== null ? active.value.name : undefined
  const requestedName = typeof requested === 'string' ? requested.trim() : ''
  return {
    name: requestedName !== '' ? requestedName : activeBoard ?? DEFAULT_BOARD,
    activeBoard,
  }
}

function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'string') return `string(${value.length} chars)`
  return typeof value
}

function parseUpdateOps(input: unknown): ParsedOp[] {
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
  return source.map((raw, index) => {
    const where = `ops[${index}]`
    if (typeof raw !== 'object' || raw === null) throw new Error(`${where} must be an object, got ${typeName(raw)}`)
    const op = raw as Record<string, unknown>
    const kind = str(op.op)
    if (kind === '' && typeof op.element === 'object' && op.element !== null) {
      const element = op.element as Record<string, unknown>
      const elementId = str(element.id)
      if (elementId === '') throw new Error(`${where}.element.id missing or not a string: every element needs a unique non-empty id`)
      return { op: 'upsert', elementId, element }
    }
    if (kind === '' && str(op.id) !== '' && str(op.type) !== '') {
      return { op: 'upsert', elementId: str(op.id), element: op }
    }
    if (kind === 'upsert') {
      if ((op.element === undefined || op.element === null) && str(op.id) !== '' && str(op.type) !== '') {
        const element = { ...op }
        delete element.op
        return { op: 'upsert', elementId: str(element.id), element }
      }
      if (typeof op.element !== 'object' || op.element === null) {
        throw new Error(`${where} is "upsert" but missing its element: use {"op":"upsert","element":{"id":"x","type":"rectangle",...}}`)
      }
      const element = op.element as Record<string, unknown>
      const elementId = str(element.id)
      if (elementId === '') throw new Error(`${where}.element.id missing or not a string: every element needs a unique non-empty id`)
      return { op: 'upsert', elementId, element }
    }
    if (kind === 'delete') {
      const nestedElement = typeof op.element === 'object' && op.element !== null
        ? op.element as Record<string, unknown>
        : undefined
      const elementId = str(op.id) || str(op.elementId) || str(nestedElement?.id)
      if (elementId === '') throw new Error(`${where} is "delete" but missing its id: use {"op":"delete","id":"<element id>"}`)
      return { op: 'delete', elementId }
    }
    if (kind === 'clear') return { op: 'clear' }
    if (kind === 'replace') {
      if (typeof op.scene !== 'object' || op.scene === null) {
        throw new Error(`${where} is "replace" but missing its scene: use {"op":"replace","scene":{"elements":[...]}}`)
      }
      return { op: 'replace', scene: op.scene as Record<string, unknown> }
    }
    throw new Error(`${where}.op = "${kind}" is invalid: must be one of upsert | delete | clear | replace. The most common mistake is forgetting the op field entirely`)
  })
}

function rejectNewPrototypeFrames(
  currentElements: Array<Record<string, unknown>>,
  ops: ParsedOp[],
): void {
  const existingIds = new Set(currentElements.map((element) => str(element.id)))
  const candidates = ops.flatMap((op) => {
    if (op.op === 'upsert' && op.element !== undefined) return [op.element]
    if (op.op === 'replace' && Array.isArray(op.scene?.elements)) {
      return op.scene.elements.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    }
    return []
  })
  const invalid = candidates.find((element) => {
    return str(element.type) === 'frame'
      && str(customData(element).role).trim().toLowerCase() === 'prototype-page'
      && !existingIds.has(str(element.id))
  })
  if (invalid !== undefined) {
    throw new Error(`prototype-page-frame-deprecated: ${str(invalid.id)} is a new prototype page using type=frame; use a rectangle with customData.role=prototype-page, customData.pageName, and an external prototype-page-label text instead`)
  }
}

/** Build the post-update element list without touching disk. */
function previewElements(currentElements: Array<Record<string, unknown>>, ops: ParsedOp[]): Array<Record<string, unknown>> {
  let elements = currentElements.slice()
  for (const op of ops) {
    if (op.op === 'replace') {
      const next = op.scene?.elements
      elements = Array.isArray(next) ? next.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : []
      continue
    }
    if (op.op === 'clear') {
      elements = []
      continue
    }
    if (op.op === 'delete' && op.elementId !== undefined) {
      elements = elements.filter((element) => str(element.id) !== op.elementId)
      continue
    }
    if (op.op === 'upsert' && op.elementId !== undefined && op.element !== undefined) {
      const index = elements.findIndex((element) => str(element.id) === op.elementId)
      if (index === -1) elements.push(op.element)
      else elements[index] = op.element
    }
  }
  return elements
}

function fitsInsideFrame(element: Record<string, unknown>, frame: Record<string, unknown>): boolean {
  const tolerance = 2
  const left = num(element.x)
  const top = num(element.y)
  const right = left + num(element.width)
  const bottom = top + num(element.height)
  const frameLeft = num(frame.x)
  const frameTop = num(frame.y)
  const frameRight = frameLeft + num(frame.width)
  const frameBottom = frameTop + num(frame.height)
  return left >= frameLeft - tolerance
    && top >= frameTop - tolerance
    && right <= frameRight + tolerance
    && bottom <= frameBottom + tolerance
}

/**
 * Agents often describe page children with coordinates relative to the frame.
 * Excalidraw stores canvas-absolute coordinates, so shift only when the authored
 * box cannot fit as absolute coordinates and the shifted box fits completely.
 */
function normalizeFrameLocalCoordinates(
  currentElements: Array<Record<string, unknown>>,
  ops: ParsedOp[],
): ParsedOp[] {
  const prospectiveElements = previewElements(currentElements, ops)
  const frames = new Map<string, Record<string, unknown>>()
  for (const candidate of prospectiveElements) {
    if (str(candidate.type) !== 'frame' || str(candidate.id) === '') continue
    frames.set(str(candidate.id), normalizeElement(candidate))
  }

  return ops.map((op) => {
    if (op.op !== 'upsert' || op.element === undefined || str(op.element.type) === 'frame') return op
    const frame = frames.get(str(op.element.frameId))
    if (frame === undefined) return op
    const element = normalizeElement(op.element)
    if (fitsInsideFrame(element, frame)) return op
    const shifted = normalizeElement({
      ...op.element,
      x: num(element.x) + num(frame.x),
      y: num(element.y) + num(frame.y),
    })
    if (!fitsInsideFrame(shifted, frame)) return op
    return { ...op, element: shifted }
  })
}

function layoutFocusIds(ops: ParsedOp[]): Set<string> | undefined {
  if (ops.some((op) => op.op === 'replace')) return undefined
  const ids = new Set<string>()
  for (const op of ops) {
    if (op.op === 'upsert' && op.elementId !== undefined) ids.add(op.elementId)
    if (op.op === 'delete' && op.elementId !== undefined) ids.add(op.elementId)
  }
  return ids.size > 0 ? ids : undefined
}

function layoutFocusIdsWithPages(
  ops: ParsedOp[],
  currentElements: Array<Record<string, unknown>>,
  prospectiveElements: Array<Record<string, unknown>>,
): Set<string> | undefined {
  const focusIds = layoutFocusIds(ops)
  if (focusIds === undefined) return undefined
  for (const elements of [currentElements, prospectiveElements]) {
    const pages = prototypePages(elements)
    for (const element of elements) {
      if (!focusIds.has(str(element.id))) continue
      const page = pageForElement(element, pages)
      if (page !== undefined) focusIds.add(page.id)
    }
  }
  return focusIds
}

function normalizeSemanticUpserts(
  currentElements: Array<Record<string, unknown>>,
  ops: ParsedOp[],
): ParsedOp[] {
  const reconciled = reconcileBoundTextBindings(
    previewElements(currentElements, ops),
    layoutFocusIds(ops),
  )
  const byId = new Map(reconciled.map((element) => [str(element.id), element]))
  return ops.map((op) => {
    if (op.op !== 'upsert' || op.elementId === undefined) return op
    const element = byId.get(op.elementId)
    return element === undefined ? op : { ...op, element }
  })
}

function normalizePageShellUpserts(
  currentElements: Array<Record<string, unknown>>,
  ops: ParsedOp[],
): ParsedOp[] {
  const prospective = previewElements(currentElements, ops)
  const pages = prototypePages(prospective)
  const pageShellById = new Map(pages
    .filter((page) => page.kind === 'page-shell')
    .map((page) => [page.id, page]))
  const byId = new Map(prospective.map((element) => [str(element.id), element]))
  const normalizeElementMembership = (element: Record<string, unknown>): Record<string, unknown> => {
    const referencedPageShell = pageShellById.get(str(element.frameId))
    const withoutFrame = { ...element, frameId: null }
    if (referencedPageShell !== undefined && pageForElement(withoutFrame, pages)?.id !== referencedPageShell.id) {
      throw new Error(`layout-invalid:\n- page-shell-child-coordinates-invalid [${str(element.id)}]: children of ${referencedPageShell.name} must use canvas-absolute x/y inside the rectangle page shell; frame-local coordinates are supported only for legacy Frames`)
    }
    const page = pageForElement(element, pages)
    return referencedPageShell !== undefined || page?.kind === 'page-shell' ? withoutFrame : element
  }
  return ops.map((op) => {
    if (op.op === 'replace' && Array.isArray(op.scene?.elements)) {
      return {
        ...op,
        scene: {
          ...op.scene,
          elements: op.scene.elements.map((element) => {
            return typeof element === 'object' && element !== null
              ? normalizeElementMembership(element as Record<string, unknown>)
              : element
          }),
        },
      }
    }
    if (op.op !== 'upsert' || op.elementId === undefined) return op
    const element = byId.get(op.elementId)
    if (element === undefined) return op
    return { ...op, element: normalizeElementMembership(element) }
  })
}

function validateNewPrototypePageContracts(
  currentElements: Array<Record<string, unknown>>,
  prospectiveElements: Array<Record<string, unknown>>,
): void {
  const existingIds = new Set(currentElements.map((element) => str(element.id)))
  const newPages = prototypePages(prospectiveElements).filter((page) => {
    return page.kind === 'page-shell' && !existingIds.has(page.id)
  })
  const errors: string[] = []
  for (const page of newPages) {
    const minimum = customData(page.element).mockDataMin
    if (typeof minimum !== 'number' || !Number.isFinite(minimum) || minimum < 1) {
      errors.push(`prototype-page-mock-min-missing [${page.id}]: ${page.name} must set customData.mockDataMin to a positive number`)
    }
    const labels = prospectiveElements.filter((element) => {
      return str(element.type) === 'text'
        && str(customData(element).role).trim().toLowerCase() === 'prototype-page-label'
        && str(customData(element).pageId) === page.id
    })
    if (labels.length !== 1) {
      errors.push(`prototype-page-label-${labels.length === 0 ? 'missing' : 'ambiguous'} [${page.id}]: ${page.name} needs exactly one external prototype-page-label text with customData.pageId=${page.id}`)
      continue
    }
    const label = labels[0]
    if (str(label.text).trim() === '' || num(label.y) + num(label.height) > page.bounds.y + 2) {
      errors.push(`prototype-page-label-invalid [${str(label.id)}]: ${page.name} label must contain readable text and sit above the rectangle page shell`)
    }
  }
  if (errors.length > 0) throw new Error(`layout-invalid:\n${errors.map((error) => `- ${error}`).join('\n')}`)
}

interface VisualReviewEvidence {
  phase: 'representative' | 'final'
  passed: boolean
  boardRevision: number
  revealRequestId: string
  inspectedPageIds: string[]
  observations: string[]
}

function parseVisualReview(input: unknown): VisualReviewEvidence | null {
  if (typeof input !== 'object' || input === null) return null
  const value = input as Record<string, unknown>
  const phase = str(value.phase)
  if (phase !== 'representative' && phase !== 'final') return null
  const inspectedPageIds = Array.isArray(value.inspectedPageIds)
    ? value.inspectedPageIds.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : []
  const observations = Array.isArray(value.observations)
    ? value.observations.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : []
  return {
    phase,
    passed: value.passed === true,
    boardRevision: typeof value.boardRevision === 'number' && Number.isFinite(value.boardRevision) ? value.boardRevision : -1,
    revealRequestId: str(value.revealRequestId),
    inspectedPageIds,
    observations,
  }
}

async function validateVisualReviewEvidence(
  store: SceneStore,
  root: string,
  boardName: string,
  boardRevision: number | null,
  evidence: VisualReviewEvidence | null,
): Promise<void> {
  if (evidence === null) return
  if (boardRevision === null || Math.abs(evidence.boardRevision - boardRevision) > 0.5) {
    throw new Error(`visual-review-stale: evidence revision ${evidence.boardRevision} does not match current board revision ${boardRevision ?? 'missing'}; inspect the latest visible board before reviewing`)
  }
  const reveal = await store.getBoardReveal(root)
  if (!reveal.ok) throw new Error(`${reveal.error.code}: ${reveal.error.message}`)
  const request = reveal.value.request
  if (request === null || request.id !== evidence.revealRequestId || request.board !== boardName) {
    throw new Error('visual-review-stale: revealRequestId is missing, belongs to another board, or is no longer the latest visible-board reveal; use the rev and revealRequestId from the most recent successful update')
  }
  if (request.revision !== boardRevision) {
    throw new Error(`visual-review-stale: reveal request revision ${request.revision} does not match current board revision ${boardRevision ?? 'missing'}`)
  }
  if (typeof request.consumedAt !== 'number') {
    throw new Error('visual-review-not-visible: the browser has not acknowledged opening this reveal request; wait for 画码 to open before submitting visualReview')
  }
}

function validatePhasedDrawing(
  currentElements: Array<Record<string, unknown>>,
  prospectiveElements: Array<Record<string, unknown>>,
  visualReview: VisualReviewEvidence | null,
): void {
  const currentPages = prototypePages(currentElements)
  const currentPageIds = new Set(currentPages.map((page) => page.id))
  const newPages = prototypePages(prospectiveElements).filter((page) => !currentPageIds.has(page.id))
  if (currentPages.length === 0 && newPages.length >= 3) {
    throw new Error('visual-review-required: first draw one representative page, inspect it in the visible 画码 canvas, then add the remaining pages; do not author three or more unseen pages in the first batch')
  }
  if (currentPages.length > 0 && newPages.length > 0 && prototypePages(prospectiveElements).length >= 3) {
    const representativeReviewed = visualReview?.phase === 'representative'
      && visualReview.passed
      && visualReview.observations.length > 0
      && visualReview.inspectedPageIds.some((id) => currentPageIds.has(id))
    if (!representativeReviewed) {
      throw new Error('visual-review-required: before adding multiple remaining pages, submit visualReview={phase:"representative",passed:true,inspectedPageIds:["<existing page id>"],observations:["what was checked"]}')
    }
  }
}

function reviewedEveryPage(evidence: VisualReviewEvidence | null, pages: PrototypePage[]): boolean {
  if (pages.length === 0) return false
  if (evidence?.phase !== 'final' || !evidence.passed || evidence.observations.length === 0) return false
  const reviewed = new Set(evidence.inspectedPageIds)
  return pages.every((page) => reviewed.has(page.id))
}

function layoutWarnings(elements: Array<Record<string, unknown>>): JsonValue[] {
  const report = inspectPrototypeLayout(elements)
  return [...report.errors, ...report.warnings].map((item) => ({
    code: item.code,
    ...(item.id === undefined ? {} : { id: item.id }),
    message: item.message,
  })) as JsonValue[]
}

function prototypeQualitySummary(value: JsonValue | undefined): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ''
  const qualityScore = typeof value.qualityScore === 'number' ? value.qualityScore : 0
  const warnings = Array.isArray(value.warnings) ? value.warnings.length : 0
  return `prototype quality: ${qualityScore}/100 · warnings ${warnings}`
}

function makeKey(root: string, name: string): string {
  return `${root}::${name}`
}

function snapshotElementsById(elements: Array<Record<string, unknown>>): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>()
  for (const element of elements) {
    const id = str(element.id)
    if (id !== '') map.set(id, element)
  }
  return map
}

function diffSummaries(before: Array<Record<string, unknown>>, after: Array<Record<string, unknown>>): ChangeSummary {
  const beforeMap = snapshotElementsById(before)
  const afterMap = snapshotElementsById(after)
  const added: string[] = []
  const removed: string[] = []
  const modified: string[] = []

  for (const [id, afterElement] of afterMap.entries()) {
    const beforeElement = beforeMap.get(id)
    if (beforeElement === undefined) {
      added.push(elementSummary(afterElement))
      continue
    }
    if (JSON.stringify(beforeElement) !== JSON.stringify(afterElement)) {
      modified.push(`${elementSummary(beforeElement)} -> ${elementSummary(afterElement)}`)
    }
  }
  for (const [id, beforeElement] of beforeMap.entries()) {
    if (afterMap.has(id)) continue
    removed.push(elementSummary(beforeElement))
  }
  return { added, removed, modified }
}

function computeChangeIds(before: Array<Record<string, unknown>>, after: Array<Record<string, unknown>>): DeltaIds {
  const beforeMap = snapshotElementsById(before)
  const afterMap = snapshotElementsById(after)
  const added = new Set<string>()
  const removed = new Set<string>()
  const modified = new Set<string>()

  for (const [id, afterElement] of afterMap.entries()) {
    if (!beforeMap.has(id)) {
      added.add(id)
      continue
    }
    const beforeElement = beforeMap.get(id)
    if (beforeElement === undefined) continue
    if (JSON.stringify(beforeElement) !== JSON.stringify(afterElement)) modified.add(id)
  }
  for (const [id] of beforeMap.entries()) {
    if (!afterMap.has(id)) removed.add(id)
  }

  return { added, removed, modified }
}

function summarizePlan(ops: ParsedOp[], currentElements: Array<Record<string, unknown>>): ChangeSummary {
  const added: string[] = []
  const removed: string[] = []
  const modified: string[] = []
  const currentById = snapshotElementsById(currentElements)

  for (const op of ops) {
    if (op.op === 'replace') {
      added.push('replace 整页')
      continue
    }
    if (op.op === 'clear') {
      removed.push('clear 清空整页')
      continue
    }
    if (op.op === 'delete' && op.elementId !== undefined) {
      const before = currentById.get(op.elementId)
      removed.push(before === undefined ? `delete ${op.elementId}` : `delete ${elementSummary(before)}`)
      continue
    }
    if (op.op === 'upsert' && op.elementId !== undefined && op.element !== undefined) {
      if (currentById.has(op.elementId)) {
        const before = currentById.get(op.elementId) as Record<string, unknown>
        modified.push(`upsert ${elementSummary(before)} -> ${elementSummary(op.element)}`)
      } else {
        added.push(`upsert ${elementSummary(op.element)}`)
      }
    }
  }

  // 有冲突时突出展示；无冲突仍给用户一个短摘要。
  return { added, removed, modified }
}

function renderChangeSummary(title: string, summary: ChangeSummary): string {
  const chunks: string[] = []
  if (summary.added.length > 0) chunks.push(`新增: ${summary.added.slice(0, 6).join('；')}${summary.added.length > 6 ? '…' : ''}`)
  if (summary.removed.length > 0) chunks.push(`删除: ${summary.removed.slice(0, 6).join('；')}${summary.removed.length > 6 ? '…' : ''}`)
  if (summary.modified.length > 0) chunks.push(`修改: ${summary.modified.slice(0, 6).join('；')}${summary.modified.length > 6 ? '…' : ''}`)
  const body = chunks.length === 0 ? '无明显元素变化' : chunks.join('\n')
  return `${title}：${body}`
}

function buildPlanMessage(userChanges: ChangeSummary, plannedChanges: ChangeSummary, conflicts: UpdateConflict[]): string {
  const lines: string[] = []
  lines.push(renderChangeSummary('1) 上一轮你手工改动', userChanges))
  lines.push(renderChangeSummary('2) 这一轮拟改', plannedChanges))
  if (conflicts.length === 0) {
    lines.push('3) 冲突：无')
    return lines.join('\n')
  }
  lines.push('3) 冲突：有')
  for (const conflict of conflicts) {
    const target = conflict.elementId ? `（ID: ${conflict.elementId}）` : ''
    const before = conflict.before ? ` 旧:${conflict.before}` : ''
    const after = conflict.after ? ` 新:${conflict.after}` : ''
    lines.push(`- ${conflict.op}${target}: ${conflict.reason}${before}${after}`)
  }
  return lines.join('\n')
}

function elementSummary(element: Record<string, unknown>): string {
  const type = str(element.type)
  if (type === 'text') {
    const text = str(element.text)
    return `${type}#${str(element.id)} ${text.slice(0, 48)}`
  }
  return `${type}#${str(element.id)}`
}

function touchedByManualChange(userChanges: DeltaIds | null): Set<string> {
  if (userChanges === null) return new Set<string>()
  const touched = new Set<string>()
  for (const id of userChanges.added) touched.add(id)
  for (const id of userChanges.removed) touched.add(id)
  for (const id of userChanges.modified) touched.add(id)
  return touched
}

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}

function elementRole(element: Record<string, unknown>): string {
  if (typeof element.customData !== 'object' || element.customData === null) return ''
  return str((element.customData as Record<string, unknown>).role).toLowerCase()
}

function authoredElementMatches(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  elementsById: ReadonlyMap<string, Record<string, unknown>>,
): boolean {
  // These fields are generated by the store and must not be compared against
  // the model's input. All authored fields, including customData, are checked.
  const volatile = new Set(['updated', 'seed', 'versionNonce'])
  for (const [key, value] of Object.entries(expected)) {
    if (volatile.has(key)) continue
    if (expected.type === 'text' && (key === 'textAlign' || key === 'verticalAlign')) {
      const container = elementsById.get(str(actual.containerId))
      const role = container === undefined || elementRole(container) === '' ? elementRole(actual) : elementRole(container)
      const alignment = semanticTextAlignment(role)
      if (alignment !== null
        && actual.textAlign === alignment.textAlign
        && actual.verticalAlign === alignment.verticalAlign) continue
    }
    if (expected.type === 'text' && key === 'containerId' && typeof value === 'string'
      && actual.containerId === null && actual.frameId === value) {
      // A model sometimes uses containerId to mean "inside this page". The
      // store repairs that invalid frame binding to Excalidraw's frameId.
      continue
    }
    if (key === 'boundElements') {
      // The store may append the reciprocal text binding that Excalidraw
      // requires. Explicit bindings must survive, but generated additions
      // must not make an otherwise correct update fail read-back validation.
      if (value === null) continue
      if (!Array.isArray(value) || !Array.isArray(actual[key])) return false
      const actualBindings = actual[key] as unknown[]
      if (!value.every((binding) => actualBindings.some((candidate) => stableJson(candidate) === stableJson(binding)))) return false
      continue
    }
    if (stableJson(actual[key]) !== stableJson(value)) return false
  }
  if (expected.type === 'text') {
    if (stableJson(actual.text) !== stableJson(expected.text)) return false
    if (stableJson(actual.originalText) !== stableJson(expected.text)) return false
  }
  return true
}

function verifyAppliedOps(ops: ParsedOp[], elements: Array<Record<string, unknown>>): string | null {
  const byId = new Map(elements.map((element) => [str(element.id), element]))
  const finalOpById = new Map<string, ParsedOp>()
  for (const op of ops) {
    if (op.op === 'clear' || op.op === 'replace') {
      finalOpById.clear()
      continue
    }
    if (op.elementId !== undefined) finalOpById.set(op.elementId, op)
  }
  for (const op of finalOpById.values()) {
    if (op.op === 'upsert' && op.elementId !== undefined) {
      const actual = byId.get(op.elementId)
      if (actual === undefined) return `upsert target ${op.elementId} is missing after write`
      if (!authoredElementMatches(op.element as Record<string, unknown>, actual, byId)) {
        return `upsert target ${op.elementId} does not match the requested element after write`
      }
    }
    if (op.op === 'delete' && op.elementId !== undefined && byId.has(op.elementId)) {
      return `delete target ${op.elementId} is still present after write`
    }
  }
  return null
}

function buildUpdatePlan(
  currentElements: Array<Record<string, unknown>>,
  ops: ParsedOp[],
  safeMode: boolean,
  touchedManualIds: Set<string>,
  hasSnapshot: boolean,
): UpdateConflict[] {
  const currentById = new Map<string, Record<string, unknown>>()
  for (const el of currentElements) {
    const id = str(el.id)
    if (id !== '') currentById.set(id, el)
  }

  const conflicts: UpdateConflict[] = []
  for (const op of ops) {
    if (op.op === 'replace') {
      if (!safeMode) continue
      if (!hasSnapshot && currentById.size === 0) continue
      conflicts.push({ op: 'replace', reason: 'replace 为整页替换，可能覆盖用户最近改动' })
      continue
    }
    if (op.op === 'clear') {
      if (!safeMode) continue
      if (!hasSnapshot && currentById.size === 0) continue
      conflicts.push({ op: 'clear', reason: 'clear 会清空画板，可能清掉用户刚修改的内容' })
      continue
    }
    if (op.op === 'delete' && op.elementId !== undefined && currentById.has(op.elementId)) {
      if (!safeMode) continue
      if (touchedManualIds.size > 0 && !touchedManualIds.has(op.elementId)) continue
      const before = elementSummary(currentById.get(op.elementId) as Record<string, unknown>)
      conflicts.push({ op: 'delete-existing', reason: '要删除现有元素，可能冲突到用户手工修改或删除后的结果', elementId: op.elementId, before })
      continue
    }
    if (op.op === 'upsert' && op.elementId !== undefined && currentById.has(op.elementId)) {
      if (!safeMode) continue
      if (touchedManualIds.size > 0 && !touchedManualIds.has(op.elementId)) continue
      const before = elementSummary(currentById.get(op.elementId) as Record<string, unknown>)
      const after = elementSummary(op.element as Record<string, unknown>)
      conflicts.push({ op: 'modify-existing', reason: '要修改现有元素，可能覆盖用户刚改的内容', elementId: op.elementId, before, after })
    }
  }

  if (!hasSnapshot) return conflicts
  if (touchedManualIds.size > 0 || conflicts.some((item) => item.op === 'replace' || item.op === 'clear')) {
    return conflicts
  }
  return []
}

function rememberSnapshot(key: string, snapshot: Snapshot) {
  boardCache.set(key, snapshot)
  while (boardCache.size > SNAPSHOT_CACHE_MAX) {
    const first = boardCache.keys().next()
    if (first.done) break
    boardCache.delete(first.value)
  }
}

/** Human-readable one-line summary of one element. */
function describeElement(el: Record<string, unknown>): string {
  const type = str(el.type)
  const id = str(el.id)
  const geom = `@${Math.round(num(el.x))},${Math.round(num(el.y))} ${Math.round(num(el.width))}x${Math.round(num(el.height))}`
  if (type === 'text') {
    const body = str(el.text).replace(/\n/g, '\\n').slice(0, 60)
    return `${id} text ${geom} "${body}"`
  }
  if (type === 'frame') return `${id} frame ${geom} "${str(el.name)}"`
  return `${id} ${type} ${geom}`
}

/** The list tool. */
export function draw2codeListTool(store: SceneStore) {
  return defineTool({
    name: 'draw2code_list',
    description: 'List 画码 (Draw2Code) prototype boards of one workspace (name, revision, element count, updated time). '
      + 'Triggers: 画板 / 原型 / draw2code / prototype board listing.',
    parameters: {
      root: { type: 'string', required: true, description: 'Workspace root (the session working directory).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          activeBoard: { type: 'string' },
          scenes: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                rev: { type: 'number', required: true },
                elementCount: { type: 'integer', required: true },
                updatedAt: { type: 'number', required: true },
              },
            },
          },
        },
      },
      render: (_args, value: { activeBoard?: string; scenes?: Array<{ name: string; elementCount: number; updatedAt: number }> }) => text(
        (value.scenes ?? []).length === 0
          ? 'no boards yet (draw2code/ is empty or absent)'
          : [`当前画板: ${value.activeBoard ?? '（未记录）'}`, 'name | elements | updatedAt', '--- | --- | ---',
            ...(value.scenes ?? []).map(s => `${s.name} | ${s.elementCount} | ${new Date(s.updatedAt).toISOString()}`)].join('\n'),
      ),
    },
    async execute(args) {
      const result = await store.list(args.root)
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      const active = await store.getActiveBoard(args.root)
      return active.ok && active.value.name !== null
        ? { scenes: result.value, activeBoard: active.value.name }
        : { scenes: result.value }
    },
  })
}

/** The read tool. */
export function draw2codeReadTool(store: SceneStore) {
  return defineTool({
    name: 'draw2code_read',
    description: 'Read one 画码 prototype board: a compact per-element summary plus the full elements JSON (needed before '
      + 'updating or before generating frontend pages from the board). Triggers: 查看画板 / 读原型 / board read.',
    parameters: {
      root: { type: 'string', required: true, description: 'Workspace root (the session working directory).' },
      name: { type: 'string', description: 'Board name. Omit to use the board currently selected in the 画码 UI.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rev: { type: 'number', required: true },
          board: { type: 'string', required: true },
          activeBoard: { type: 'string' },
          elementCount: { type: 'integer', required: true },
          summary: { type: 'string', required: true },
          layoutWarnings: { type: 'array', items: { type: 'json' }, required: true },
          prototypeQuality: { type: 'json', required: true },
          pageNames: { type: 'array', items: { type: 'string' }, required: true },
          pages: { type: 'array', items: { type: 'json' }, required: true },
          pageRelations: { type: 'array', items: { type: 'json' }, required: true },
          frameNames: { type: 'array', items: { type: 'string' }, required: true },
          file: { type: 'string', required: true },
          elements: { type: 'json', required: true },
        },
      },
      render: (_args, value: { board?: string; activeBoard?: string; elementCount?: number; pageNames?: string[]; pageRelations?: JsonValue[]; summary?: string; layoutWarnings?: JsonValue[]; prototypeQuality?: JsonValue; file?: string }) => text(
        [
          `board: ${value.board ?? ''} · ${value.elementCount ?? 0} elements`,
          `pages: ${(value.pageNames ?? []).join('、') || '（未识别）'} · relations: ${value.pageRelations?.length ?? 0}`,
          value.activeBoard !== undefined && value.activeBoard !== value.board ? `当前画板: ${value.activeBoard}（与读取目标不同）` : '',
          (value.layoutWarnings ?? []).length > 0 ? `原型质量提醒：\n${formatLayoutIssues(value.layoutWarnings ?? [])}` : '',
          prototypeQualitySummary(value.prototypeQuality),
          value.summary ?? '',
          value.file !== undefined ? `file: ${value.file}` : '',
        ].filter(Boolean).join('\n'),
      ),
    },
    async execute(args: { root: string; name?: string }) {
      const target = await resolveBoard(store, args.root, args.name)
      const result = await store.read(args.root, target.name)
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      const { rev, scene } = result.value
      const pages = prototypePages(scene.elements)
      const relations = prototypePageRelations(scene.elements, pages)
      const qualityWarnings = [
        ...layoutWarnings(scene.elements),
        ...pageMembershipWarnings(scene.elements, pages),
      ].filter((warning, index, all) => all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(warning)) === index)
      const prototypeQuality = inspectPrototypeQuality(scene.elements)
      const summary = scene.elements.map(describeElement).join('\n')
      const elementsJson = JSON.stringify(scene.elements)
      const elementsBytes = Buffer.byteLength(elementsJson, 'utf8')
      const payload: unknown = elementsBytes <= MAX_ELEMENTS_JSON
        ? scene.elements
        : [{ id: '__too_large__', type: 'text', text: `elements JSON is ${elementsBytes} UTF-8 bytes (> ${MAX_ELEMENTS_JSON}); read the file directly instead` }]
      return {
        rev,
        board: target.name,
        ...(target.activeBoard !== undefined ? { activeBoard: target.activeBoard } : {}),
        elementCount: scene.elements.length,
        pageNames: pages.map((page) => page.name),
        pages: publicPrototypePages(scene.elements, pages) as never,
        pageRelations: relations as never,
        frameNames: pages.map((page) => page.name),
        summary,
        layoutWarnings: qualityWarnings as unknown as JsonValue[],
        prototypeQuality: prototypeQuality as unknown as JsonValue,
        file: `draw2code/${target.name}.excalidraw.json`,
        elements: payload as never,
      }
    },
  })
}

/** The update tool — the drawing hand of the agent. */
export function draw2codeUpdateTool(store: SceneStore) {
  return defineTool({
    name: 'draw2code_update',
    description: 'Draw on / edit one 画码 prototype board with ops — this is how you turn the user\'s idea into a visible '
      + 'prototype in the right sidebar. Canonical ops: {op:"upsert",element:{...}} (insert or replace by id), {op:"delete",id}, '
      + '{op:"clear"}, {op:"replace",scene:{elements:[...]}}. Elements need id + type (rectangle|text|arrow|line|ellipse|'
      + 'diamond|frame) + x/y/width/height (+text for text); missing fields are defaulted. Unambiguous upsert shorthands are accepted: a direct {id,type,...} element, {element:{...}} without op, or flat {op:"upsert",id,type,...}. Delete also accepts elementId or element.id when op="delete". Canvas-absolute x/y are canonical. New prototype pages use an ordinary rectangle with customData.role=prototype-page, customData.pageName, and customData.mockDataMin; add a separate text above it with role=prototype-page-label and pageId. Keep all new-page children frameId=null so user-drawn cross-page arrows cannot be clipped. Existing named Frames remain supported; their unambiguous frame-local coordinates are still converted for compatibility. The board is auto-created when '
      + 'absent. Triggers: 画原型 / 画一下 / 在画板上… / '
      + 'draw the prototype / update the board. Low-fi quality is checked before writing: multiline text needs enough height, shape text must be a separate text element, and bottom navigation must use a semantic shell in the page bottom safe area. A completed page from draw2code_create must use a rectangle page shell with role=prototype-page, pageName, and mockDataMin (normally 3), plus an external prototype-page-label; mark each visible realistic example text with role=mock-data. Empty boxes and placeholder labels do not satisfy the content gate. Use semantic roles as a component API: page-heading/page-header for headers, content-card/task-card/stat-card/category-card for information blocks, input/select/search-field for form fields, chip/filter-chip for choices, bottom-navigation plus bottom-navigation-item for global navigation, and exactly one primary-action for the page\'s main task. Page membership is inferred from canvas geometry; containerId is only for one visible label bound to a rectangle/diamond/ellipse. New page children must keep frameId=null. Existing legacy Frame pages and their frameId children remain supported and are never migrated implicitly. For a one-label shape, set the text containerId to the shape id and declare customData.role on the shape or label: button/primary-action/chip/tab labels become center/middle, while input/select/dropdown/search-field values stay left/middle. Missing component roles are rejected instead of silently defaulting labels to the top-left. The tool completes Excalidraw\'s reciprocal boundElements relation so the label is visible on first render. A bottom-navigation shell uses separate text labels with customData.role=bottom-navigation-item so each slot is centered. Use customData.tone=primary|success|warning|danger|info|neutral on category/status/action shapes for restrained semantic color; explicit strokeColor/backgroundColor always win. Invalid layout returns layout-invalid and is not written. Three or more first-batch pages are rejected: draw one representative page, inspect it visibly, then add the rest with representative visualReview evidence. verified/writeVerified only prove persistence; report completion only when completionReady=true after final visualReview covers every page. Omit name to target the board currently selected in the 画码 UI; only pass name when the user explicitly names another board. Never edit the scene file with Bash or another direct file-writing path; use this tool so conflicts and read-back verification are enforced.',
    parameters: {
      root: { type: 'string', required: true, description: 'Workspace root (the session working directory).' },
      name: { type: 'string', description: 'Board name. Omit to target the board currently selected in the 画码 UI.' },
      ops: { type: 'json', required: true, description: 'Ops array (or a JSON string encoding it). For a new page, first upsert {id:"page",type:"rectangle",customData:{role:"prototype-page",pageName:"首页",mockDataMin:3},x,y,width,height}, then an external prototype-page-label text and page children with canvas-absolute coordinates and frameId=null. Direct elements, {element:{...}} without op, and flat upserts are accepted when id+type make the intent unambiguous. Delete accepts id, elementId, or element.id. Legacy named Frames remain compatible, including unambiguous frame-local child coordinate conversion.' },
      force: { type: 'boolean', description: '已读到冲突并且用户确认后可设置为 true，强制执行。默认 false。' },
      safeMode: { type: 'boolean', description: '是否在有风险改动时要求确认（默认 true）。设为 false 会直接执行，可能覆盖用户手工改动。' },
      visualReview: { type: 'json', description: 'Visible-canvas review evidence tied to the latest successful update: {phase:"representative"|"final",passed:true,boardRevision:<returned rev>,revealRequestId:"<returned revealRequestId>",inspectedPageIds:[...],observations:[...]}. Final review includes every page id and must be sent with empty ops after inspecting the updated board.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rev: { type: 'number', required: true },
          targetBoard: { type: 'string', required: true },
          activeBoard: { type: 'string' },
          elementCount: { type: 'integer', required: true },
          applied: { type: 'integer', required: true },
          verified: { type: 'boolean', required: true },
          writeVerified: { type: 'boolean', required: true },
          completionReady: { type: 'boolean', required: true },
          nextAction: { type: 'string', required: true },
          prototypeQuality: { type: 'json', required: true },
          revealRequestId: { type: 'string' },
          layoutWarnings: { type: 'array', items: { type: 'json' }, required: true },
          requiresConfirmation: { type: 'boolean' },
          pending: { type: 'boolean' },
          conflicts: { type: 'array', items: { type: 'json' } },
          planSummary: { type: 'string' },
          userSummary: { type: 'string' },
          summary: {
            type: 'object',
            additionalProperties: false,
            properties: {
              userChanges: { type: 'json' },
              plannedChanges: { type: 'json' },
            },
          },
        },
      },
      render: (_args, value: { rev?: number; targetBoard?: string; activeBoard?: string; pending?: boolean; elementCount?: number; applied?: number; verified?: boolean; writeVerified?: boolean; completionReady?: boolean; nextAction?: string; prototypeQuality?: JsonValue; revealRequestId?: string; layoutWarnings?: JsonValue[]; conflicts?: unknown[]; planSummary?: string }) => text(
        value.pending === true
          ? `【待确认】检测到潜在冲突（${value.conflicts?.length ?? 0} 条）：\n${value.planSummary ?? ''}\n请先确认后再重试：在你确认了之后，请重新调用 draw2code_update 并设置 force=true。`
          : `board ${value.targetBoard ?? ''} updated and selected. verified=${value.verified === true}; writeVerified=${value.writeVerified === true}; completionReady=${value.completionReady === true}; visualReviewRequired=${value.prototypeQuality !== null && typeof value.prototypeQuality === 'object' && (value.prototypeQuality as Record<string, JsonValue>).visualReviewRequired === true}; boardRevision=${value.rev ?? 'missing'}; revealRequestId=${value.revealRequestId ?? 'missing'}. ${value.applied ?? 0} ops applied, ${value.elementCount ?? 0} elements on board. ${value.nextAction ?? ''} The 画码 sidebar opens automatically on this board.${(value.layoutWarnings ?? []).length > 0 ? `\n结构与布局提醒：\n${formatLayoutIssues(value.layoutWarnings ?? [])}` : ''}`,
      ),
    },
    async execute(args: { root: string; name?: string; ops: unknown; force?: boolean; safeMode?: boolean; visualReview?: unknown }) {
      const safeMode = args.safeMode !== false
      const force = args.force === true
      const visualReview = parseVisualReview(args.visualReview)
      const parsedOps = parseUpdateOps(args.ops)
      if (visualReview?.phase === 'final' && parsedOps.length > 0) {
        throw new Error('visual-review-final-requires-empty-ops: final visualReview must be submitted after all writes in a separate call with ops=[]')
      }
      const target = await resolveBoard(store, args.root, args.name)
      const board = await store.read(args.root, target.name)
      await validateVisualReviewEvidence(store, args.root, target.name, board.ok ? board.value.rev : null, visualReview)
      const key = makeKey(args.root, target.name)
      const cache = boardCache.get(key)
      const currentElements = board.ok ? board.value.scene.elements : []
      rejectNewPrototypeFrames(currentElements, parsedOps)
      const frameNormalizedOps = normalizeFrameLocalCoordinates(currentElements, parsedOps)
      const semanticOps = normalizeSemanticUpserts(currentElements, frameNormalizedOps)
      const ops = normalizePageShellUpserts(currentElements, semanticOps)
      const prospectiveElements = previewElements(currentElements, ops)
      validatePhasedDrawing(currentElements, prospectiveElements, visualReview)
      validateNewPrototypePageContracts(currentElements, prospectiveElements)
      const layoutReport = inspectPrototypeLayout(prospectiveElements, {
        focusIds: layoutFocusIdsWithPages(ops, currentElements, prospectiveElements),
      })
      if (layoutReport.errors.length > 0) {
        throw new Error(`layout-invalid:\n${formatLayoutIssues(layoutReport.errors)}\n请修正组件几何和内容可读性后再调用 draw2code_update；不要把多行内容压进单行 text、不要把按钮文案写进 rectangle.text，也不要用空白方框代替 mock 数据。`)
      }
      const hasSnapshot = cache !== undefined
      const userChanges = cache !== undefined
        ? diffSummaries(cache.elements, currentElements)
        : { added: [], removed: [], modified: [] }
      const userChangeIds = hasSnapshot ? computeChangeIds(cache.elements, currentElements) : null
      const touchedManualIds = touchedByManualChange(userChangeIds)
      const plannedChanges = summarizePlan(ops, currentElements)
      const conflicts = board.ok
        ? buildUpdatePlan(currentElements, ops, safeMode, touchedManualIds, hasSnapshot)
        : []
      const finalPlanSummary = buildPlanMessage(userChanges, plannedChanges, conflicts)
      if (board.ok) {
        rememberSnapshot(key, { rev: board.value.rev, elements: currentElements })
      }
      if (!board.ok && !force && board.error.code !== 'not-found') {
        throw new Error(`${board.error.code}: ${board.error.message}`)
      }
      if (safeMode && !force && conflicts.length > 0) {
        const elementCount = currentElements.length
        const conflictValues = conflicts as unknown as JsonValue[]
        const prototypeQuality = inspectPrototypeQuality(currentElements)
        return {
          rev: board.ok ? board.value.rev : 0,
          targetBoard: target.name,
          ...(target.activeBoard !== undefined ? { activeBoard: target.activeBoard } : {}),
          elementCount,
          applied: 0,
          verified: false,
          writeVerified: false,
          completionReady: false,
          nextAction: '先确认冲突；本轮尚未写入，也不能进入视觉完成验收',
          prototypeQuality: prototypeQuality as unknown as JsonValue,
          layoutWarnings: layoutWarnings(currentElements),
          requiresConfirmation: true,
          pending: true,
          conflicts: conflictValues,
          userSummary: finalPlanSummary,
          planSummary: finalPlanSummary,
          summary: {
            userChanges: userChanges as JsonValue,
            plannedChanges: plannedChanges as JsonValue,
          },
        }
      }

      const result = await store.applyOps(args.root, target.name, ops, board.ok ? board.value.rev : undefined)
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      const refreshed = await store.read(args.root, target.name)
      if (!refreshed.ok) throw new Error(`${refreshed.error.code}: ${refreshed.error.message}`)
      if (refreshed.value.scene.elements.length !== result.value.elementCount) {
        throw new Error('draw2code_update write verification failed: element count changed before read-back')
      }
      const verificationError = verifyAppliedOps(ops, refreshed.value.scene.elements)
      if (verificationError !== null) throw new Error(`draw2code_update write verification failed: ${verificationError}`)
      rememberSnapshot(key, { rev: refreshed.value.rev, elements: refreshed.value.scene.elements })
      const selected = await store.setActiveBoard(args.root, target.name)
      if (!selected.ok) throw new Error(`draw2code_update verified but could not select its board: ${selected.error.code}: ${selected.error.message}`)
      const revealed = await store.publishBoardReveal(args.root, target.name, refreshed.value.rev)
      if (!revealed.ok) throw new Error(`draw2code_update verified but could not queue its board reveal: ${revealed.error.code}: ${revealed.error.message}`)
      const qualityWarnings = layoutWarnings(refreshed.value.scene.elements)
      const pages = prototypePages(refreshed.value.scene.elements)
      const prototypeQuality = inspectPrototypeQuality(refreshed.value.scene.elements)
      const completionReady = ops.length === 0
        && reviewedEveryPage(visualReview, pages)
        && prototypeQuality.structurePassed
        && prototypeQuality.contentPassed
        && prototypeQuality.layoutPassed
        && prototypeQuality.warnings.length === 0
      prototypeQuality.visualReviewRequired = !completionReady && pages.length > 0
      const nextAction = completionReady
        ? '视觉复核已覆盖全部页面；可以根据 prototypeQuality 的剩余 warnings 决定是否继续打磨'
        : pages.length === 0
          ? '当前画板没有可识别页面；先创建 prototype-page'
          : !prototypeQuality.structurePassed || !prototypeQuality.contentPassed || !prototypeQuality.layoutPassed || prototypeQuality.warnings.length > 0
            ? '先按 prototypeQuality.warnings 修复结构、首屏内容和布局；全部通过后在真实画板逐页检查，再用空 ops 提交 phase=final visualReview'
            : ops.length > 0 && visualReview?.phase === 'final'
              ? '本轮仍写入了元素，不能同时证明写入后的视觉结果；请查看真实画板后，用空 ops 单独提交 phase=final visualReview'
              : '在真实可见画板逐页检查首屏任务、层级、对齐、mock 数据和导航，再用空 ops 提交覆盖全部 page id 的 phase=final visualReview'
      return {
        rev: result.value.rev,
        targetBoard: target.name,
        activeBoard: selected.value.name,
        elementCount: result.value.elementCount,
        applied: result.value.applied,
        verified: true,
        writeVerified: true,
        completionReady,
        nextAction,
        prototypeQuality: prototypeQuality as unknown as JsonValue,
        revealRequestId: revealed.value.id,
        layoutWarnings: qualityWarnings,
        requiresConfirmation: false,
        pending: false,
        userSummary: finalPlanSummary,
        planSummary: finalPlanSummary,
        summary: {
          userChanges: userChanges as JsonValue,
          plannedChanges: plannedChanges as JsonValue,
        },
      }
    },
  })
}

interface GenerateVisualBrief {
  direction: string
  tone: string
  background: string
  primaryAction: string
  semanticColors: string
  density: string
  typeHierarchy: string
  layoutStrategy: string
  motion: string
  focalPoint: string
}

function visualBriefFor(direction: string, device: string | null, frameNames: string[]): GenerateVisualBrief {
  const mobile = device === 'mobile' || device === '移动端 H5'
  const focalPage = frameNames[0] ?? '核心页面'
  const darkTech = /未来|科技|深色|赛博/iu.test(direction)
  const warm = /温暖|友好|生活|亲切|轻松/iu.test(direction)
  const professional = /专业|数据|稳重|效率/iu.test(direction)
  const bold = /大胆|鲜明|活力|年轻/iu.test(direction)
  return {
    direction,
    tone: darkTech
      ? '沉浸、精确、有明确高亮焦点，避免把所有区域都做成发光面板'
      : warm
        ? '亲切、松弛、可信，使用克制装饰保持任务清晰'
        : professional
          ? '高效、可靠、层级清楚，数据与状态优先'
          : bold
            ? '轻快、主动、有识别度，以少量高对比焦点带动页面'
            : '克制、清晰、有明确视觉重心，避免通用模板感',
    background: darkTech ? '深色低噪声底色，内容区保持足够对比度' : '低饱和中性底色，卡片与主内容形成清楚层次',
    primaryAction: bold || darkTech ? '主操作使用单一高对比强调色，每页只突出一个首要动作' : '主操作使用稳定强调色，次要操作降低对比度',
    semanticColors: '成功、提醒、危险、信息状态使用可区分的语义色；不能用品牌色代替全部状态',
    density: professional ? '信息密度适中偏紧凑，但保证触控面积和扫读间距' : '保持舒适留白，相关内容紧凑成组，不平均分配空间',
    typeHierarchy: '至少建立页面标题、区块标题、正文、辅助信息四级层次，禁止所有文字同字号同字重',
    layoutStrategy: mobile
      ? '以内容流、CSS Grid/Flex 和响应式约束重排；适配 320–430px 手机宽度，不复制原型绝对坐标'
      : '以内容流、CSS Grid/Flex 和容器约束重排；随视口响应，不复制原型绝对坐标',
    motion: '只为页面切换、状态变化和操作反馈使用短动效，尊重 prefers-reduced-motion',
    focalPoint: '让用户首先看到「' + focalPage + '」的核心任务或关键状态，而不是同时强调所有组件',
  }
}

/**
 * The fixed constraint checklist returned with every draw2code_generate
 * result. Riding the tool result (not the system prompt) guarantees the
 * model has it in hand at the exact moment it starts writing pages.
 */
function buildGenerateInstructions(
  board: string,
  frameNames: string[],
  existingPages: string[],
  visualBrief: GenerateVisualBrief,
  referenceStyle: string | null,
): string {
  const lines: string[] = [
    '按以下要求生成前端页面：',
    '1. 画板原型是产品事实来源：必须保留'
      + (frameNames.length > 0 ? '「' + frameNames.join('」「') + '」这些范围的' : '整块画板的')
      + '页面、信息层级、文案、mock 数据、组件语义和交互关系；禁止添加原型中不存在的模块、页面、角色、流程或重大业务规则。',
    '2. 原型不是像素模板。禁止照搬 Excalidraw 的绝对坐标、方框尺寸和低保真空白；使用语义化 HTML、内容流、CSS Grid、Flex 和容器约束重新排版。absolute/fixed 只用于确有必要的浮层、装饰或固定导航。',
    '3. 若原型是移动端布局，生成 H5 页面本体，不要套手机边框；至少适配 320–430px 手机宽度，并保证桌面预览时内容稳定居中、无横向溢出。',
    '4. 输出到 draw2code-pages/' + board + '/index.html：单文件、内联 CSS/JS、可直接在浏览器打开；多个页面放在同一文件内并互相导航。每个页面根节点前后必须保留 <!-- d2c-page:<页面原名>:start --> 和 <!-- d2c-page:<页面原名>:end -->，供后续重新生成时精确保护未选页面。',
    existingPages.length > 0
      ? '5. draw2code-pages/' + board + '/ 已有页面（' + existingPages.join('、') + '）：先读取现有 index.html，沿用其技术实现，只更新本次范围内的页面，保持其余页面不变。'
      : '5. draw2code-pages/' + board + '/ 目前为空：从零生成，但不能退化成无层级的通用模板。',
    '6. 使用以下结构化视觉简报，而不是只把“' + visualBrief.direction + '”当作空泛形容词：\n'
      + '   - 气质：' + visualBrief.tone + '\n'
      + '   - 背景：' + visualBrief.background + '\n'
      + '   - 主操作：' + visualBrief.primaryAction + '\n'
      + '   - 语义色：' + visualBrief.semanticColors + '\n'
      + '   - 密度：' + visualBrief.density + '\n'
      + '   - 字体层级：' + visualBrief.typeHierarchy + '\n'
      + '   - 布局策略：' + visualBrief.layoutStrategy + '\n'
      + '   - 动效：' + visualBrief.motion + '\n'
      + '   - 视觉焦点：' + visualBrief.focalPoint,
    '7. 遵循专业前端设计规范：先建立 CSS 设计变量；每页只突出一个主要任务；避免无目的渐变、过度圆角、平均用力和千篇一律的 AI 模板感；真实 mock 数据必须参与排版。',
    referenceStyle === null
      ? '8. 用户本次未提供参考风格图；以结构化视觉简报为准，不得退化为无差别的通用模板。'
      : '8. 用户提供的参考风格信息是：' + referenceStyle + '。提取其配色关系、字体感觉、留白、布局密度和组件气质，但页面内容与流程仍以画板原型为准，禁止像素照抄。',
    '9. 可以补充必填校验、加载、成功提示和选中态等通用交互反馈，但不得新增产品事实。',
    '10. 写入后必须自动打开真实浏览器预览，逐页截图并实际验证：所选页面和 mock 数据可见、页面切换与核心按钮可用、核心流程走通、控制台无 error/warning、无横向溢出或内容裁切、按钮文案居中、底部导航完整。发现实现问题要直接修复并重新验证。',
    '11. 调用 action=complete 时必须提交 verificationEvidence：本次浏览器验收唯一 captureId、生成入口 outputSha256、previewUrl、viewports；覆盖每个所选页面的 screenshots[{page,viewport,source,sha256,captureId}]；浏览器导出的 domSnapshots[{page,source,sha256,captureId}]；consoleErrors、consoleWarnings、domChecks、layoutChecks 和 interactionChecks。previewUrl 内容哈希必须等于 outputSha256；截图和 DOM 快照必须保存到 workspace 内、属于同一 captureId，sha256 必须与文件一致；不能再用几个自报布尔值代替证据。',
    '12. 只有真实预览证据通过工具门禁后，才调用 draw2code_generate action=complete；在 complete 返回 completed 之前不得向用户报告生成完成。',
  ]
  return lines.join('\n')
}

type GenerateAction = 'start' | 'answer' | 'revise' | 'resume' | 'recheck' | 'confirm' | 'complete' | 'abandon'
type GenerateStatus = 'question' | 'blocked' | 'ready' | 'confirmed' | 'completed' | 'abandoned'

interface GenerateOption {
  id: string
  label: string
  valueLabel?: string
  description: string
  recommended?: boolean
  reason?: string
}

interface GenerateQuestion {
  id: 'page-scope' | 'target-device' | 'visual-direction'
  text: string
  selectionMode: 'single' | 'multiple'
  minSelections: number
  allowOther: boolean
  options: GenerateOption[]
  recommendedValues: string[]
}

interface GenerateDraft {
  sessionId: string
  board: string
  activeBoard?: string
  status: GenerateStatus
  revision: number
  createdAt: number
  updatedAt: number
  currentQuestion: GenerateQuestion | null
  selectedFrames: string[]
  allFrames?: string[]
  unselectedFrames?: string[]
  recommendedFrames?: string[]
  expectedPageTexts?: Record<string, string[]>
  preservedPageHashes?: Record<string, string>
  visualDirection: string | null
  inheritedVisualDirection: string | null
  device: string | null
  styleNote: string | null
  referenceStyle: string | null
  blockers: Array<Record<string, unknown>>
  warnings: Array<Record<string, unknown>>
  brief: Record<string, unknown> | null
  validation: Record<string, unknown> | null
  hadExistingIndex: boolean
}

interface GenerateArgs {
  root: string
  action?: GenerateAction
  name?: string
  pages?: string[]
  frames?: string[]
  styleNote?: string
  referenceStyle?: string
  sessionId?: string
  revision?: number
  questionId?: string
  values?: string[]
  otherText?: string
  verificationEvidence?: unknown
  previewOpened?: boolean
  selectedPagesVisible?: boolean
  coreFlowPassed?: boolean
  mockDataVisible?: boolean
  unselectedPagesPreserved?: boolean
}

interface GenerateResponse {
  status: string
  sessionId?: string
  revision?: number
  board?: string
  activeBoard?: string
  question?: JsonValue
  blockers?: JsonValue
  warnings?: JsonValue
  brief?: JsonValue
  confirmation?: JsonValue
  nextAction?: string
  error?: JsonValue
  scope?: string
  pageNames?: string[]
  frameNames?: string[]
  summary?: string
  elements?: JsonValue
  pageRelations?: JsonValue
  unassignedElementCount?: number
  unframedElementCount?: number
  layoutWarnings?: JsonValue
  existingPages?: string[]
  outputDir?: string
  instructions?: string
  validation?: JsonValue
  prompt?: string
}

const REFERENCE_STYLE_PROMPT = '生成前想确认一下：你有没有参考风格的图片？有的话直接发图即可；没有也没关系，我会结合原型智能推荐视觉方向。'

function normalizeReferenceStyle(value: string): string | null {
  const normalized = value.trim()
  return /^(?:none|no|没有|无|不需要|暂无)$/iu.test(normalized) ? null : normalized
}

function generateError(code: string, message: string, draft?: GenerateDraft): GenerateResponse {
  return {
    status: 'error',
    error: { code, message, recoverable: code !== 'invalid-action' },
    ...(draft === undefined ? {} : {
      sessionId: draft.sessionId,
      revision: draft.revision,
      board: draft.board,
    }),
  }
}

function pageScopeQuestion(
  pages: PrototypePage[],
  recommended: string[],
  recommendationReasons: Map<string, string> = new Map(),
): GenerateQuestion {
  const recommendedSet = new Set(recommended)
  const orderedPages = [...pages].sort((left, right) => {
    const leftRecommended = recommendedSet.has(left.name) ? 0 : 1
    const rightRecommended = recommendedSet.has(right.name) ? 0 : 1
    return leftRecommended - rightRecommended
  })
  return {
    id: 'page-scope',
    text: '这次要把哪些原型页面生成成可体验的前端 Demo？',
    selectionMode: 'multiple',
    minSelections: 1,
    allowOther: false,
    options: orderedPages.map((page) => {
      const name = page.name
      const isRecommended = recommendedSet.has(name)
      const displayLabel = `${name}${isRecommended ? '（推荐）' : ''}`
      return {
        id: displayLabel,
        label: displayLabel,
        valueLabel: name,
        description: isRecommended ? '建议纳入本次生成范围；宿主暂不支持自动预勾选，可直接取消或改选' : '本次可选页面',
        ...(isRecommended ? { recommended: true, reason: recommendationReasons.get(name) ?? '当前画板核心流程页面' } : {}),
      }
    }),
    recommendedValues: recommended.map((name) => `${name}（推荐）`),
  }
}

function directlyConnectedPages(elements: Array<Record<string, unknown>>, requested: string[]): string[] {
  if (requested.length === 0) return []
  const relations = prototypePageRelations(elements)
  const connected = new Set<string>()
  for (const relation of relations) {
    if (requested.includes(relation.sourcePage) && !requested.includes(relation.targetPage)) connected.add(relation.targetPage)
    if (requested.includes(relation.targetPage) && !requested.includes(relation.sourcePage)) connected.add(relation.sourcePage)
  }
  return [...connected]
}

function inferDevice(pages: PrototypePage[]): 'mobile' | 'desktop' | 'mixed' | 'ambiguous' {
  let mobile = 0
  let desktop = 0
  for (const page of pages) {
    const width = page.bounds.width
    const height = page.bounds.height
    if (width <= 600 && height > width) mobile += 1
    else if (width >= 760 || width > height * 1.15) desktop += 1
  }
  if (mobile > 0 && desktop > 0) return 'mixed'
  if (mobile > 0) return 'mobile'
  if (desktop > 0) return 'desktop'
  return 'ambiguous'
}

function deviceQuestion(): GenerateQuestion {
  return {
    id: 'target-device',
    text: '所选页面同时出现移动端和桌面端尺寸，这次以哪种版本为主？',
    selectionMode: 'single',
    minSelections: 1,
    allowOther: false,
    options: [
      { id: 'mobile', label: '移动端 H5（推荐）', valueLabel: '移动端 H5', description: '以手机页面为主生成', recommended: true, reason: '适合直接在 DSH 预览中体验核心流程' },
      { id: 'desktop', label: '桌面 Web', description: '以桌面页面为主生成' },
      { id: 'separate', label: '分别生成', description: '在同一 HTML 中保留两套原型布局' },
    ],
    recommendedValues: ['mobile'],
  }
}

function visualQuestion(elements: Array<Record<string, unknown>>, referenceStyle: string | null = null): GenerateQuestion {
  const corpus = elements.map((element) => `${str(element.name)} ${str(element.text)}`).join(' ')
  const social = /社交|雷达|好友|聊天|附近|碰一碰/u.test(corpus)
  const dataTool = /统计|日历|万年历|图表|清单|任务|管理/u.test(corpus)
  const options: GenerateOption[] = social
    ? [
        { id: 'young-vibrant', label: '年轻活力（推荐）', valueLabel: '年轻活力', description: '清爽高对比、轻量动效，强调发现与连接', recommended: true, reason: '适合社交产品的探索与互动氛围' },
        { id: 'future-tech', label: '未来科技', description: '深色背景、雷达光效与高亮状态' },
        { id: 'warm-authentic', label: '温暖真实', description: '柔和色彩与人物内容优先' },
        { id: 'minimal-light', label: '极简轻量', description: '减少装饰，突出核心操作' },
        { id: 'custom', label: '自定义', description: '补充一个整体视觉方向' },
      ]
    : dataTool
      ? [
          { id: 'clean-modern', label: '简洁现代（推荐）', valueLabel: '简洁现代', description: '清晰层级、克制配色与舒适留白', recommended: true, reason: '适合工具类产品高频阅读和操作' },
          { id: 'professional-tool', label: '专业工具', description: '紧凑布局、明确数据层级' },
          { id: 'data-clear', label: '数据清晰', description: '强化图表、数字与状态对比' },
          { id: 'relaxed-life', label: '轻松生活', description: '柔和色彩与更亲切的组件表达' },
          { id: 'custom', label: '自定义', description: '补充一个整体视觉方向' },
        ]
      : [
          { id: 'clean-modern', label: '简洁现代（推荐）', valueLabel: '简洁现代', description: '清晰层级、克制配色与舒适留白', recommended: true, reason: '对当前原型最稳妥的默认方向' },
          { id: 'professional', label: '专业稳重', description: '紧凑、可靠、信息密度更高' },
          { id: 'friendly', label: '轻松友好', description: '柔和色彩与亲切反馈' },
          { id: 'bold', label: '鲜明大胆', description: '更强对比与视觉焦点' },
          { id: 'custom', label: '自定义', description: '补充一个整体视觉方向' },
        ]
  const referenceOption: GenerateOption | null = referenceStyle === null ? null : {
    id: 'reference-image',
    label: '沿用参考图（推荐）',
    valueLabel: `参考图风格：${referenceStyle}`,
    description: '提取参考图的视觉语言，页面内容和交互仍以原型为准',
    recommended: true,
    reason: '用户已经提供了明确的视觉参考',
  }
  const normalizedOptions = referenceOption === null
    ? options
    : [referenceOption, ...options.map((option) => ({ ...option, recommended: false, reason: undefined }))]
  return {
    id: 'visual-direction',
    text: '首次生成想采用哪一种整体视觉方向？',
    selectionMode: 'single',
    minSelections: 1,
    allowOther: true,
    options: normalizedOptions,
    recommendedValues: [normalizedOptions.find((option) => option.recommended)?.id ?? normalizedOptions[0].id],
  }
}

function elementsInPages(
  elements: Array<Record<string, unknown>>,
  pageNames: string[],
): { pages: PrototypePage[]; elements: Array<Record<string, unknown>>; unassignedElementCount: number; relations: ReturnType<typeof prototypePageRelations> } {
  const allPages = prototypePages(elements)
  const selected = allPages.filter((page) => pageNames.includes(page.name))
  const selectedIds = new Set(selected.map((page) => page.id))
  const elementIds = new Set(selected.flatMap((page) => pageElementIds(page, elements, allPages)))
  const scoped = elements.filter((element) => selectedIds.has(str(element.id)) || elementIds.has(str(element.id)))
  const assigned = new Set(allPages.flatMap((page) => [page.id, ...pageElementIds(page, elements, allPages)]))
  const allRelations = prototypePageRelations(elements, allPages)
  const relations = allRelations.filter((relation) => {
    return pageNames.includes(relation.sourcePage) || pageNames.includes(relation.targetPage)
  })
  const relationIds = new Set(allRelations.map((relation) => relation.id))
  const relationLabelIds = new Set(elements.flatMap((element) => {
    return str(element.type) === 'text' && relationIds.has(str(element.containerId)) ? [str(element.id)] : []
  }))
  const pageLabelIds = new Set(elements.flatMap((element) => {
    return str(customData(element).role).toLowerCase() === 'prototype-page-label' ? [str(element.id)] : []
  }))
  const unassignedElementCount = elements.filter((element) => {
    const id = str(element.id)
    return !assigned.has(id) && !relationIds.has(id) && !relationLabelIds.has(id) && !pageLabelIds.has(id)
  }).length
  return { pages: selected, elements: scoped, unassignedElementCount, relations }
}

function emptyPageIssues(pages: PrototypePage[], elements: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const allPages = prototypePages(elements)
  return pages.flatMap((page) => {
    const meaningful = elements.some((element) => {
      if (element === page.element || str(element.type) !== 'text' || str(element.text).trim() === '') return false
      return pageForElement(element, allPages)?.id === page.id
    })
    return meaningful ? [] : [{ code: 'page-content-missing', id: page.id, message: `${page.name} 只有空框，无法判断页面内容和用途` }]
  })
}

function elementBelongsToPage(element: Record<string, unknown>, page: PrototypePage, pages: PrototypePage[]): boolean {
  return pageForElement(element, pages)?.id === page.id
}

/** Imported or hand-drawn boards may not carry prototype-page customData, so
 * generate also performs a conservative semantic mock-data check. */
function semanticMockDataIssues(pages: PrototypePage[], elements: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const repeatedContentPage = /列表|好友|聊天|消息|清单|统计|图表|日历|万年历|雷达|推荐|记录|详情/u
  const genericUiText = /^(?:首页|列表|好友|聊天|消息|清单|统计|日历|雷达|推荐|详情|返回|保存|提交|确认|取消|搜索|筛选|新增|添加|我的|设置|发送|请输入.*)$/u
  return pages.flatMap((page) => {
    const name = page.name
    if (!repeatedContentPage.test(name)) return []
    const texts = elements.filter((element) => element !== page.element
      && str(element.type) === 'text'
      && elementBelongsToPage(element, page, pages))
    let records = 0
    for (const element of texts) {
      const value = str(element.text).trim()
      if (value === '' || value === name || genericUiText.test(value)) continue
      const role = str((typeof element.customData === 'object' && element.customData !== null
        ? element.customData as Record<string, unknown>
        : {}).role).toLowerCase()
      const lines = value.split(/\r?\n/u).filter((line) => line.trim().length >= 2).length
      if (role === 'mock-data' || /\d|·|：|:|公里|km|米|m\b|已|待|完成|进行中|昨天|今天|刚刚/u.test(value) || value.length >= 8) {
        records += Math.max(1, Math.min(3, lines))
      }
    }
    return records >= 3 ? [] : [{
      code: 'mock-data-insufficient',
      id: page.id,
      message: `${name} 需要至少 3 条可读 mock 数据帮助理解页面；当前识别到 ${records} 条`,
    }]
  })
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function jsonRecordValue(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return recordValue(value)
  try {
    return recordValue(JSON.parse(value) as unknown)
  } catch {
    return null
  }
}

function recordArray(value: unknown): Array<Record<string, unknown>> | null {
  return Array.isArray(value) && value.every((item) => recordValue(item) !== null)
    ? value as Array<Record<string, unknown>>
    : null
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function pathIsInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function workspaceFile(
  root: string,
  source: unknown,
): Promise<{ ok: true; bytes: Buffer; path: string } | { ok: false; reason: string }> {
  const sourceText = str(source).trim()
  if (sourceText === '') return { ok: false, reason: 'source' }
  try {
    const canonicalRoot = await realpath(root)
    const candidate = isAbsolute(sourceText) ? sourceText : resolve(canonicalRoot, sourceText)
    const canonicalPath = await realpath(candidate)
    if (!pathIsInside(canonicalRoot, canonicalPath)) return { ok: false, reason: 'outside-workspace' }
    const handle = await open(canonicalPath, 'r')
    try {
      const info = await handle.stat()
      if (!info.isFile()) return { ok: false, reason: 'not-a-file' }
      if (info.size === 0) return { ok: false, reason: 'empty-file' }
      if (info.size > 20 * 1024 * 1024) return { ok: false, reason: 'file-too-large' }
      const bytes = await handle.readFile()
      return { ok: true, bytes, path: canonicalPath }
    } finally {
      await handle.close()
    }
  } catch {
    return { ok: false, reason: 'file-unreadable' }
  }
}

async function workspaceArtifact(
  root: string,
  source: unknown,
  expectedHash: unknown,
): Promise<{ ok: true; bytes: Buffer; path: string } | { ok: false; reason: string }> {
  const hashText = str(expectedHash).trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/u.test(hashText)) return { ok: false, reason: 'sha256' }
  const file = await workspaceFile(root, source)
  if (!file.ok) return file
  return sha256(file.bytes) === hashText ? file : { ok: false, reason: 'sha256-mismatch' }
}

function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) return null
  let offset = 8
  let width = 0
  let height = 0
  let channels = 0
  const imageData: Buffer[] = []
  let ended = false
  try {
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset)
      const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
      const dataStart = offset + 8
      const dataEnd = dataStart + length
      if (dataEnd + 4 > bytes.length) return null
      const data = bytes.subarray(dataStart, dataEnd)
      if (type === 'IHDR') {
        if (length !== 13) return null
        width = data.readUInt32BE(0)
        height = data.readUInt32BE(4)
        const bitDepth = data[8]
        const colorType = data[9]
        const interlace = data[12]
        channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
        if (width <= 0 || height <= 0 || width * height > 10_000_000 || bitDepth !== 8 || channels === 0 || interlace !== 0) return null
      } else if (type === 'IDAT') {
        imageData.push(data)
      } else if (type === 'IEND') {
        ended = true
        break
      }
      offset = dataEnd + 4
    }
    if (!ended || width === 0 || height === 0 || imageData.length === 0) return null
    const expectedLength = height * (1 + width * channels)
    const inflated = inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedLength })
    if (inflated.length !== expectedLength) return null
    return { width, height }
  } catch {
    return null
  }
}

async function previewHtml(root: string, previewUrl: string): Promise<{ ok: true; html: string } | { ok: false; reason: string }> {
  try {
    const url = new URL(previewUrl)
    let html = ''
    if (url.protocol === 'file:') {
      const file = await workspaceFile(root, fileURLToPath(url))
      if (!file.ok) return { ok: false, reason: file.reason }
      html = file.bytes.toString('utf8')
    } else if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) return { ok: false, reason: 'preview-not-loopback' }
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(3_000) })
      if (!response.ok) return { ok: false, reason: 'preview-http-' + response.status }
      const declaredLength = Number(response.headers.get('content-length') ?? 0)
      if (declaredLength > 2 * 1024 * 1024) return { ok: false, reason: 'preview-too-large' }
      if (response.body === null) return { ok: false, reason: 'preview-empty-body' }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      while (true) {
        const next = await reader.read()
        if (next.done) break
        total += next.value.byteLength
        if (total > 2 * 1024 * 1024) {
          await reader.cancel()
          return { ok: false, reason: 'preview-too-large' }
        }
        chunks.push(next.value)
      }
      html = Buffer.concat(chunks).toString('utf8')
    } else {
      return { ok: false, reason: 'preview-protocol' }
    }
    if (Buffer.byteLength(html, 'utf8') > 2 * 1024 * 1024) return { ok: false, reason: 'preview-too-large' }
    return /<!doctype html|<html[\s>]/iu.test(html)
      ? { ok: true, html }
      : { ok: false, reason: 'preview-not-html' }
  } catch {
    return { ok: false, reason: 'preview-unreachable' }
  }
}

function normalizedVisibleText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

function expectedPageTexts(
  pages: PrototypePage[],
  elements: Array<Record<string, unknown>>,
): Record<string, string[]> {
  return Object.fromEntries(pages.map((page) => {
    const name = page.name
    const texts = elements
      .filter((element) => str(element.type) === 'text' && elementBelongsToPage(element, page, pages))
      .flatMap((element) => str(element.text).split(/\r?\n/gu))
      .map(normalizedVisibleText)
      .filter((value) => value !== '')
    return [name, [...new Set(texts)]]
  }))
}

function pageBlock(html: string, page: string): string | null {
  const start = '<!-- d2c-page:' + page + ':start -->'
  const end = '<!-- d2c-page:' + page + ':end -->'
  const startAt = html.indexOf(start)
  if (startAt < 0) return null
  const contentAt = startAt + start.length
  const endAt = html.indexOf(end, contentAt)
  return endAt < 0 ? null : html.slice(contentAt, endAt)
}

async function preparePagePreservation(root: string, draft: GenerateDraft): Promise<void> {
  const allFrames = draft.allFrames ?? draft.selectedFrames
  draft.unselectedFrames = allFrames.filter((name) => !draft.selectedFrames.includes(name))
  draft.preservedPageHashes = {}
  if (!draft.hadExistingIndex || draft.unselectedFrames.length === 0) return
  const file = await workspaceFile(root, resolve(root, 'draw2code-pages', draft.board, 'index.html'))
  if (!file.ok) return
  const html = file.bytes.toString('utf8')
  for (const page of draft.unselectedFrames) {
    const block = pageBlock(html, page)
    if (block !== null) draft.preservedPageHashes[page] = sha256(block)
  }
}

async function preservedPagesStillMatch(root: string, draft: GenerateDraft): Promise<string[]> {
  const hashes = draft.preservedPageHashes ?? {}
  if (Object.keys(hashes).length === 0) return []
  const file = await workspaceFile(root, resolve(root, 'draw2code-pages', draft.board, 'index.html'))
  if (!file.ok) return Object.keys(hashes)
  const html = file.bytes.toString('utf8')
  return Object.entries(hashes)
    .filter(([page, hash]) => {
      const block = pageBlock(html, page)
      return block === null || sha256(block) !== hash
    })
    .map(([page]) => page)
}

async function verificationEvidenceFor(
  root: string,
  raw: unknown,
  draft: GenerateDraft,
  outputHash: string,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; code: string; message: string }> {
  const evidence = jsonRecordValue(raw)
  if (evidence === null) {
    return {
      ok: false,
      code: 'verification-evidence-missing',
      message: '缺少 verificationEvidence；必须提交真实浏览器 URL、视口、逐页截图、控制台、DOM、布局和核心交互证据',
    }
  }

  const missing: string[] = []
  const failures: string[] = []
  const captureId = str(evidence.captureId).trim()
  if (captureId === '') missing.push('captureId')
  if (str(evidence.outputSha256).trim().toLowerCase() !== outputHash) failures.push('outputSha256')
  const previewUrl = str(evidence.previewUrl).trim()
  if (!/^(?:https?|file):\/\//iu.test(previewUrl)) {
    missing.push('previewUrl')
  } else {
    const preview = await previewHtml(root, previewUrl)
    if (!preview.ok) failures.push('previewUrl:' + preview.reason)
    else if (sha256(preview.html) !== outputHash) failures.push('previewUrl:output-mismatch')
  }

  const viewportKeys = new Set<string>()
  const viewports = recordArray(evidence.viewports)
  if (viewports === null || viewports.length === 0) {
    missing.push('viewports')
  } else {
    const validViewports = viewports.filter((viewport) => num(viewport.width) > 0 && num(viewport.height) > 0)
    for (const viewport of validViewports) viewportKeys.add(num(viewport.width) + 'x' + num(viewport.height))
    if (validViewports.length !== viewports.length) missing.push('viewports.width/height')
    if ((draft.device === 'mobile' || draft.device === '移动端 H5')
      && !validViewports.some((viewport) => num(viewport.width) >= 320 && num(viewport.width) <= 430 && num(viewport.height) > num(viewport.width))) {
      missing.push('320-430px mobile viewport')
    }
    if (draft.device === 'desktop' && !validViewports.some((viewport) => num(viewport.width) >= 1024)) {
      missing.push('desktop viewport >= 1024px')
    }
    if (draft.device === 'separate') {
      if (!validViewports.some((viewport) => num(viewport.width) >= 320 && num(viewport.width) <= 430)) missing.push('mobile viewport')
      if (!validViewports.some((viewport) => num(viewport.width) >= 1024)) missing.push('desktop viewport')
    }
  }

  const unselectedEvidencePages = draft.hadExistingIndex
    ? (draft.unselectedFrames ?? [])
    : []
  const evidencePages = [...new Set([...draft.selectedFrames, ...unselectedEvidencePages])]
  const screenshots = recordArray(evidence.screenshots)
  if (screenshots === null || screenshots.length === 0) {
    missing.push('screenshots')
  } else {
    for (const page of evidencePages) {
      const shot = screenshots.find((candidate) => str(candidate.page).trim() === page)
      if (shot === undefined) {
        missing.push('screenshot:' + page)
        continue
      }
      if (str(shot.captureId).trim() !== captureId) failures.push('screenshot:' + page + ':captureId')
      const viewport = str(shot.viewport).trim()
      if (!viewportKeys.has(viewport)) missing.push('screenshot-viewport:' + page)
      const artifact = await workspaceArtifact(root, shot.source, shot.sha256)
      if (!artifact.ok) {
        failures.push('screenshot:' + page + ':' + artifact.reason)
        continue
      }
      const dimensions = pngDimensions(artifact.bytes)
      const match = /^(\d+)x(\d+)$/u.exec(viewport)
      if (dimensions === null || match === null
        || dimensions.width !== Number(match[1]) || dimensions.height !== Number(match[2])) {
        failures.push('screenshot:' + page + ':dimensions')
      }
    }
  }

  const domSnapshots = recordArray(evidence.domSnapshots)
  if (domSnapshots === null || domSnapshots.length === 0) {
    missing.push('domSnapshots')
  } else {
    for (const page of evidencePages) {
      const snapshot = domSnapshots.find((candidate) => str(candidate.page).trim() === page)
      if (snapshot === undefined) {
        missing.push('domSnapshot:' + page)
        continue
      }
      if (str(snapshot.captureId).trim() !== captureId) failures.push('domSnapshot:' + page + ':captureId')
      const artifact = await workspaceArtifact(root, snapshot.source, snapshot.sha256)
      if (!artifact.ok) {
        failures.push('domSnapshot:' + page + ':' + artifact.reason)
        continue
      }
      const domHtml = artifact.bytes.toString('utf8')
      if (!/<html(?:\s|>)/iu.test(domHtml) || !/<body(?:\s|>)/iu.test(domHtml)) {
        failures.push('domSnapshot:' + page + ':not-browser-dom')
        continue
      }
      const bodyText = normalizedVisibleText(domHtml)
      for (const expected of draft.expectedPageTexts?.[page] ?? []) {
        if (!bodyText.includes(normalizedVisibleText(expected))) {
          failures.push('domText:' + page + ':' + expected.slice(0, 24))
        }
      }
    }
  }

  if (!Array.isArray(evidence.consoleErrors)) {
    missing.push('consoleErrors')
  } else if (evidence.consoleErrors.length > 0) {
    failures.push('consoleErrors')
  }
  if (!Array.isArray(evidence.consoleWarnings)) {
    missing.push('consoleWarnings')
  } else if (evidence.consoleWarnings.length > 0) {
    failures.push('consoleWarnings')
  }

  const requiredChecks: Array<[string, string[]]> = [
    ['domChecks', ['selected-pages', 'mock-data', ...(unselectedEvidencePages.length > 0 ? ['unselected-pages-preserved'] : [])]],
    ['layoutChecks', ['no-horizontal-overflow', 'content-not-clipped', 'button-text-centered', 'bottom-navigation-complete']],
    ['interactionChecks', ['core-flow', ...(draft.selectedFrames.length > 1 ? ['page-switching'] : [])]],
  ]
  for (const [field, requiredNames] of requiredChecks) {
    const checks = recordArray(evidence[field])
    if (checks === null || checks.length === 0) {
      missing.push(field)
      continue
    }
    for (const requiredName of requiredNames) {
      const check = checks.find((item) => str(item.name) === requiredName)
      if (check === undefined || str(check.details).trim() === '') missing.push(field + ':' + requiredName)
      else if (check.passed !== true) failures.push(field + ':' + requiredName)
    }
    for (const check of checks) {
      if (check.passed !== true) failures.push(field + ':' + (str(check.name) || 'unnamed'))
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      code: 'verification-evidence-incomplete',
      message: '真实预览证据不完整：' + [...new Set(missing)].join('、'),
    }
  }
  if (failures.length > 0) {
    return {
      ok: false,
      code: 'verification-evidence-failed',
      message: '真实预览发现未修复问题：' + [...new Set(failures)].join('、') + '；先修复页面并重新验收',
    }
  }
  return { ok: true, value: { ...evidence, verified: true } }
}

function briefFor(draft: GenerateDraft, existingPages: string[]): Record<string, unknown> {
  const visualBrief = visualBriefFor(draft.visualDirection ?? '简洁现代', draft.device, draft.selectedFrames)
  return {
    board: draft.board,
    selectedPages: draft.selectedFrames,
    relatedPageRecommendations: (draft.recommendedFrames ?? []).filter((name) => !draft.selectedFrames.includes(name)),
    pageChanges: existingPages.includes('index.html') ? '只更新所选页面，未选择页面保持不变' : '首次生成所选页面',
    visualDirection: draft.visualDirection,
    referenceStyle: draft.referenceStyle ?? null,
    visualBrief,
    device: draft.device,
    prototypeCheck: draft.blockers.length === 0 ? '通过' : '有阻断问题',
    warnings: draft.warnings,
    assumptions: ['输出为统一入口的单文件 HTML Demo', '允许补充通用交互反馈，不新增产品页面或业务流程'],
    preservedContent: existingPages.includes('index.html') ? ['未选择页面', '不与原型冲突的已有增强'] : [],
    conflicts: existingPages.includes('index.html')
      ? ['生成 Agent 必须先读取现有 index.html，核对所选页面内可能被覆盖的手工修改']
      : [],
    output: `draw2code-pages/${draft.board}/index.html`,
  }
}

function hostQuestionFor(question: GenerateQuestion): Record<string, unknown> {
  return {
    questions: [{
      id: question.id,
      question: question.text,
      header: question.id === 'page-scope' ? '页面范围' : question.id === 'visual-direction' ? '视觉方向' : '目标设备',
      options: question.options.map((option) => ({ label: option.label, description: option.description })),
      multi_select: question.selectionMode === 'multiple',
    }],
  }
}

function responseFromDraft(draft: GenerateDraft, extras: Partial<GenerateResponse> = {}): GenerateResponse {
  const confirmation = draft.status === 'ready' ? {
    id: 'generate-brief-confirm',
    question: '按这份生成简报开始生成前端 Demo 吗？',
    selectionMode: 'single',
    options: [
      { id: 'confirm', label: '确认生成（推荐）', description: '立即按简报生成单文件 HTML，并进入真实预览验收' },
      { id: 'revise-scope', label: '修改页面范围', description: '返回页面多选，不重复询问其他已完成选择' },
      { id: 'revise-visual', label: '修改视觉方向', description: '重新选择整体视觉方向，保留页面范围' },
    ],
    askUserQuestionArgs: {
      questions: [{
        id: 'generate-brief-confirm',
        question: '按这份生成简报开始生成前端 Demo 吗？',
        header: '生成确认',
        options: [
          { label: '确认生成（推荐）', description: '立即按简报生成单文件 HTML，并进入真实预览验收' },
          { label: '修改页面范围', description: '返回页面多选，不重复询问其他已完成选择' },
          { label: '修改视觉方向', description: '重新选择整体视觉方向，保留页面范围' },
        ],
        multi_select: false,
      }],
    },
  } : null
  return {
    status: draft.status,
    sessionId: draft.sessionId,
    revision: draft.revision,
    board: draft.board,
    ...(draft.activeBoard === undefined ? {} : { activeBoard: draft.activeBoard }),
    ...(draft.currentQuestion === null ? {} : {
      question: {
        ...draft.currentQuestion,
        askUserQuestionArgs: hostQuestionFor(draft.currentQuestion),
      } as unknown as JsonValue,
    }),
    ...(draft.blockers.length === 0 ? {} : { blockers: draft.blockers as JsonValue }),
    ...(draft.warnings.length === 0 ? {} : { warnings: draft.warnings as JsonValue }),
    ...(draft.brief === null ? {} : { brief: draft.brief as JsonValue }),
    ...(confirmation === null ? {} : { confirmation: confirmation as JsonValue }),
    ...extras,
  }
}

async function persistGeneration(store: SceneStore, root: string, draft: GenerateDraft, bump = true): Promise<GenerateResponse | null> {
  if (bump) draft.revision += 1
  draft.updatedAt = Date.now()
  const saved = await store.writeGeneration(root, draft.sessionId, draft as unknown as Record<string, unknown>)
  return saved.ok ? null : generateError(saved.error.code, saved.error.message, draft)
}

async function loadGeneration(store: SceneStore, root: string, sessionId: string | undefined): Promise<GenerateDraft | null> {
  if (sessionId === undefined || sessionId.trim() === '') return null
  const loaded = await store.readGeneration(root, sessionId)
  return loaded.ok ? loaded.value as unknown as GenerateDraft : null
}

async function runGeneratePreflight(store: SceneStore, root: string, draft: GenerateDraft): Promise<GenerateResponse> {
  const board = await store.read(root, draft.board)
  if (!board.ok) return generateError(board.error.code, board.error.message, draft)
  const allPages = prototypePages(board.value.scene.elements)
  draft.allFrames = allPages.map((page) => page.name)
  draft.unselectedFrames = draft.allFrames.filter((name) => !draft.selectedFrames.includes(name))
  draft.expectedPageTexts = expectedPageTexts(allPages, board.value.scene.elements)
  const scope = elementsInPages(board.value.scene.elements, draft.selectedFrames)
  if (scope.pages.length !== draft.selectedFrames.length) {
    const found = new Set(scope.pages.map((page) => page.name))
    const missing = draft.selectedFrames.filter((name) => !found.has(name))
    draft.blockers = [{ code: 'page-not-found', message: `所选页面已不在画板上：${missing.join('、')}` }]
  } else {
    const report = inspectPrototypeLayout(scope.elements)
    draft.blockers = [
      ...report.errors,
      ...emptyPageIssues(scope.pages, scope.elements),
      ...semanticMockDataIssues(scope.pages, scope.elements),
    ] as unknown as Array<Record<string, unknown>>
    draft.warnings = [
      ...report.warnings,
      ...pageMembershipWarnings(board.value.scene.elements, allPages),
    ].filter((warning, index, all) => all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(warning)) === index) as unknown as Array<Record<string, unknown>>
  }
  const existing = await store.existingPages(root, draft.board)
  if (!existing.ok) return generateError(existing.error.code, existing.error.message, draft)
  draft.currentQuestion = null
  draft.status = draft.blockers.length > 0 ? 'blocked' : 'ready'
  draft.brief = draft.status === 'ready' ? briefFor(draft, existing.value) : null
  const failed = await persistGeneration(store, root, draft)
  if (failed !== null) return failed
  return responseFromDraft(draft, draft.status === 'blocked'
    ? { nextAction: '先用 draw2code_update 修复画板；用户检查后调用 action=recheck，保留已选页面和视觉方向' }
    : { nextAction: '向用户展示一次最终生成简报；确认后调用 action=confirm' })
}

async function generationPayload(store: SceneStore, root: string, draft: GenerateDraft): Promise<GenerateResponse> {
  const board = await store.read(root, draft.board)
  if (!board.ok) return generateError(board.error.code, board.error.message, draft)
  const scope = elementsInPages(board.value.scene.elements, draft.selectedFrames)
  const existing = await store.existingPages(root, draft.board)
  if (!existing.ok) return generateError(existing.error.code, existing.error.message, draft)
  const summary = scope.elements.map(describeElement).join('\n')
  const elementsJson = JSON.stringify(scope.elements)
  const elementsBytes = Buffer.byteLength(elementsJson, 'utf8')
  const payload: unknown = elementsBytes <= MAX_ELEMENTS_JSON
    ? scope.elements
    : [{ id: '__too_large__', type: 'text', text: `scoped elements JSON is ${elementsBytes} UTF-8 bytes (> ${MAX_ELEMENTS_JSON}); draw2code_read the board instead` }]
  const quality = inspectPrototypeLayout(scope.elements)
  const layoutIssues = [...quality.errors, ...quality.warnings]
  const visualBrief = visualBriefFor(draft.visualDirection ?? '简洁现代', draft.device, draft.selectedFrames)
  const instructions = buildGenerateInstructions(draft.board, draft.selectedFrames, existing.value, visualBrief, draft.referenceStyle ?? null)
    + (layoutIssues.length > 0 ? `\n13. 原型非阻断提醒：\n${formatLayoutIssues(layoutIssues)}` : '')
  return responseFromDraft(draft, {
    nextAction: 'write-html-then-preview-and-validate',
    scope: 'pages',
    pageNames: draft.selectedFrames,
    frameNames: draft.selectedFrames,
    summary,
    elements: payload as JsonValue,
    pageRelations: scope.relations as unknown as JsonValue,
    unassignedElementCount: scope.unassignedElementCount,
    unframedElementCount: scope.unassignedElementCount,
    layoutWarnings: layoutIssues as unknown as JsonValue,
    existingPages: existing.value,
    outputDir: `draw2code-pages/${draft.board}/`,
    instructions,
  })
}

/** Stateful generate tool: scope → visual direction → preflight → one brief → verified completion. */
export function draw2codeGenerateTool(store: SceneStore, projects?: ProjectStore) {
  return defineTool({
    name: 'draw2code_generate',
    description: 'Turn selected 画码 prototype pages into a verified, interactive, single-file HTML Demo through a resumable choice-first flow. New pages use ordinary rectangle page shells; named Excalidraw Frames remain supported as legacy pages. '
      + 'On any explicit “生成页面 / 根据画板生成前端 / 重新生成” request, first ask once in ordinary chat whether the user has a reference-style image; do not use ask_user_question for that sentence. If the request already includes a reference image, do not ask again. Then call action=start with referenceStyle set to “none” or a concise description/path of the inspected reference. Calls missing referenceStyle return a non-native reference-style-prompt instead of creating a session. The first structured question always asks the user to select pages from every recognized page boundary; pass user-mentioned pages only as recommendations, never skip the choice. Use the host choice UI with all returned options. '
      + 'Then answer the returned visual/device question if present. When status=ready, show the brief once and immediately use the host choice UI with the returned confirmation options; never ask the user to type “确认”. Map confirm to action=confirm, revise-scope to action=revise questionId=page-scope, and revise-visual to action=revise questionId=visual-direction. The confirmed result carries elements and instructions for you to write index.html. '
      + 'After writing, automatically open the real preview, capture every selected page, inspect the console and DOM/layout, and exercise the core flow; fix implementation defects without asking. Call action=complete with structured verificationEvidence only after preview passes. Self-reported boolean flags are not accepted as evidence. Never report completion before status=completed. '
      + 'If status=blocked, repair the prototype through draw2code_update first, let the user inspect the board, then call action=recheck with the same sessionId/revision; do not repeat completed choices. action=resume restores interrupted work.',
    parameters: {
      root: { type: 'string', required: true, description: 'Workspace root (the session working directory).' },
      action: { type: 'string', enum: ['start', 'answer', 'revise', 'resume', 'recheck', 'confirm', 'complete', 'abandon'], description: 'Generate state-machine action. Omit only for legacy callers; omission behaves as start.' },
      name: { type: 'string', description: 'Board name. Omit to use the board currently selected in the 画码 UI.' },
      pages: { type: 'array', items: { type: 'string' }, description: 'User-mentioned prototype page names, used only as recommended defaults on action=start.' },
      frames: { type: 'array', items: { type: 'string' }, description: 'Deprecated compatibility alias for pages. If both are supplied they must contain the same names.' },
      styleNote: { type: 'string', description: 'An explicit overall visual request; skips the first-time visual choice.' },
      referenceStyle: { type: 'string', description: 'Required for action=start after the ordinary-chat reference-image prompt. Use “none” when the user has no reference; otherwise pass a concise inspected-image description or local reference path. This prompt must not use ask_user_question.' },
      sessionId: { type: 'string', description: 'Generation session ID from a prior result.' },
      revision: { type: 'integer', description: 'Expected generation revision for mutation actions.' },
      questionId: { type: 'string', description: 'Current question ID for answer/revise.' },
      values: { type: 'array', items: { type: 'string' }, description: 'Selected option IDs.' },
      otherText: { type: 'string', description: 'Custom overall visual direction when custom is selected.' },
      verificationEvidence: {
        type: 'json',
        description: 'Required only for action=complete. Object with one captureId, outputSha256, reachable loopback/file previewUrl whose HTML hash matches the generated index, viewports[{width,height}], workspace PNG screenshots[{page,viewport,source,sha256,captureId}] and text domSnapshots[{page,source,sha256,captureId}] covering every related page, empty consoleErrors and consoleWarnings, DOM/layout/core-flow checks. Multiple pages also require page-switching. Every check needs passed=true and non-empty details. Unselected pages are verified by stored page-block hashes plus post-generation artifacts.',
      },
      previewOpened: { type: 'boolean', description: 'Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence.' },
      selectedPagesVisible: { type: 'boolean', description: 'Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence.' },
      coreFlowPassed: { type: 'boolean', description: 'Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence.' },
      mockDataVisible: { type: 'boolean', description: 'Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence.' },
      unselectedPagesPreserved: { type: 'boolean', description: 'Deprecated compatibility field. Unselected pages are now checked through page markers and evidence artifacts.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true },
          sessionId: { type: 'string' },
          revision: { type: 'integer' },
          board: { type: 'string' },
          activeBoard: { type: 'string' },
          question: { type: 'json' },
          blockers: { type: 'json' },
          warnings: { type: 'json' },
          brief: { type: 'json' },
          confirmation: { type: 'json' },
          nextAction: { type: 'string' },
          error: { type: 'json' },
          scope: { type: 'string' },
          pageNames: { type: 'array', items: { type: 'string' } },
          frameNames: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
          elements: { type: 'json' },
          pageRelations: { type: 'json' },
          unassignedElementCount: { type: 'integer' },
          unframedElementCount: { type: 'integer' },
          layoutWarnings: { type: 'json' },
          existingPages: { type: 'array', items: { type: 'string' } },
          outputDir: { type: 'string' },
          instructions: { type: 'string' },
          validation: { type: 'json' },
          prompt: { type: 'string' },
        },
      },
      render: (_args, value: GenerateResponse) => {
        if (value.status === 'reference-style-prompt') {
          return text(`${value.prompt ?? REFERENCE_STYLE_PROMPT}\n这是一句普通对话询问，不得调用 ask_user_question。用户回答后，用 referenceStyle=none 或参考图摘要重新调用 action=start。`)
        }
        if (value.status === 'question') {
          const question = value.question as unknown as GenerateQuestion
          const options = question.options.map((option, index) => `${index + 1}. ${option.id} — ${option.label}${option.recommended ? `（推荐：${option.reason ?? ''}）` : ''}`).join('\n')
          return text(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ''} revision=${value.revision ?? ''} status=question questionId=${question.id}\n${question.text}\n${options}\n调用 ask_user_question 时必须原样复制 question.askUserQuestionArgs；特别是 page-scope 必须设置 multi_select=true，即使用户只点名了一个页面也不能改成单选。收到选择后调用 action=answer。`)
        }
        if (value.status === 'blocked') return text(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ''} revision=${value.revision ?? ''} status=blocked\n原型尚不可生成。先按 blockers 调用 draw2code_update，用户看到并检查后调用 action=recheck；不要重复询问页面和视觉方向。`)
        if (value.status === 'ready') return text(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ''} revision=${value.revision ?? ''} status=ready\n只展示一次 brief，并立即用宿主 ask_user_question 原样复制 confirmation.askUserQuestionArgs，禁止让用户手动输入“确认”。选择 confirm 后调用 action=confirm；revise-scope 调 action=revise questionId=page-scope；revise-visual 调 action=revise questionId=visual-direction。`)
        if (value.status === 'confirmed') return text(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ''} revision=${value.revision ?? ''} status=confirmed\n按 instructions 写入单文件 index.html，然后自动打开真实预览，逐页截图，检查控制台、DOM、布局和核心流程；用结构化 verificationEvidence 调用 action=complete，之前不得报告完成。`)
        if (value.status === 'completed') return text(`draw2code_generate status=completed board=${value.board ?? ''}\n真实预览与核心流程已验收，generate 流程结束；后续普通修改不自动重新进入 generate。`)
        if (value.status === 'error') return text(`draw2code_generate 可恢复错误：${JSON.stringify(value.error)}${value.sessionId === undefined ? '' : `\nsessionId=${value.sessionId} revision=${value.revision ?? ''}`}`)
        return text(`draw2code_generate status=${value.status} sessionId=${value.sessionId ?? ''} revision=${value.revision ?? ''}`)
      },
    },
    async execute(args: GenerateArgs): Promise<GenerateResponse> {
      const action = args.action ?? 'start'
      if (action === 'start') {
        if (typeof args.referenceStyle !== 'string' || args.referenceStyle.trim() === '') {
          return {
            status: 'reference-style-prompt',
            prompt: REFERENCE_STYLE_PROMPT,
            nextAction: 'ask-reference-style-then-start',
          }
        }
        const referenceStyle = normalizeReferenceStyle(args.referenceStyle)
        const target = await resolveBoard(store, args.root, args.name)
        const board = await store.read(args.root, target.name)
        if (!board.ok) return generateError(board.error.code, board.error.message)
        const duplicatePageNames = pageNameWarnings(board.value.scene.elements)
        if (duplicatePageNames.length > 0) {
          return generateError('page-name-duplicate', duplicatePageNames.map((warning) => warning.message).join('；'))
        }
        const pages = prototypePages(board.value.scene.elements)
        if (pages.length === 0) return generateError('no-pages', `画板「${target.name}」没有可识别的原型页面；新页面应使用 rectangle + customData.role=prototype-page + customData.pageName，旧命名 Frame 仍兼容`)
        const allNames = pages.map((page) => page.name)
        const requestedPages = [...new Set((args.pages ?? []).map((name) => name.trim()).filter((name) => name !== ''))]
        const requestedFrames = [...new Set((args.frames ?? []).map((name) => name.trim()).filter((name) => name !== ''))]
        if (requestedPages.length > 0 && requestedFrames.length > 0
          && JSON.stringify([...requestedPages].sort()) !== JSON.stringify([...requestedFrames].sort())) {
          return generateError('page-scope-conflict', 'pages 与 deprecated frames 指定了不同页面；请只传 pages，或确保两者内容完全一致')
        }
        const requested = requestedPages.length > 0 ? requestedPages : requestedFrames
        const missing = requested.filter((name) => !allNames.includes(name))
        if (missing.length > 0) return generateError('page-not-found', `画板上没有这些页面：${missing.join('、')}。现有页面：${allNames.join('、')}`)
        const settings = await store.readGenerateSettings(args.root, target.name)
        if (!settings.ok) return generateError(settings.error.code, settings.error.message)
        const inherited = settings.value === null ? null : str(settings.value.visualDirection).trim() || null
        const projectList = projects === undefined ? null : await projects.list(args.root)
        const project = projectList?.ok === true
          ? projectList.value.find((candidate) => candidate.boardName === target.name)
          : undefined
        const projectBrief = project?.brief as { pages?: unknown; deferredStyleNote?: unknown } | null | undefined
        const briefPages = Array.isArray(projectBrief?.pages)
          ? projectBrief.pages.flatMap((value) => {
              if (typeof value === 'string') return allNames.includes(value) ? [value] : []
              if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
              const name = str((value as Record<string, unknown>).name).trim()
              return name !== '' && allNames.includes(name) ? [name] : []
            })
          : []
        const deferredStyle = str(project?.deferredStyleNote).trim()
        const connected = directlyConnectedPages(board.value.scene.elements, requested)
        const recommended = requested.length > 0
          ? [...requested, ...connected]
          : briefPages.length > 0
            ? briefPages
            : allNames.slice(0, Math.min(3, allNames.length))
        const recommendationReasons = new Map<string, string>()
        for (const name of requested) recommendationReasons.set(name, '用户本次明确点名')
        for (const name of connected) recommendationReasons.set(name, '与用户点名页面存在直接 Arrow 交互关系')
        for (const name of briefPages) recommendationReasons.set(name, '来自已确认 create 简报的核心页面')
        if (requested.length === 0 && briefPages.length === 0) {
          for (const name of recommended) recommendationReasons.set(name, '位于当前画板核心流程的前序位置')
        }
        const existing = await store.existingPages(args.root, target.name)
        if (!existing.ok) return generateError(existing.error.code, existing.error.message)
        const now = Date.now()
        const draft: GenerateDraft = {
          sessionId: `generation-${randomUUID()}`,
          board: target.name,
          ...(target.activeBoard === undefined ? {} : { activeBoard: target.activeBoard }),
          status: 'question',
          revision: 1,
          createdAt: now,
          updatedAt: now,
          currentQuestion: pageScopeQuestion(pages, recommended, recommendationReasons),
          selectedFrames: [],
          allFrames: allNames,
          unselectedFrames: [],
          recommendedFrames: [...new Set(recommended)],
          expectedPageTexts: {},
          preservedPageHashes: {},
          visualDirection: args.styleNote?.trim() || deferredStyle || null,
          inheritedVisualDirection: inherited,
          device: null,
          styleNote: args.styleNote?.trim() || deferredStyle || null,
          referenceStyle,
          blockers: [],
          warnings: [],
          brief: null,
          validation: null,
          hadExistingIndex: existing.value.includes('index.html'),
        }
        const failed = await persistGeneration(store, args.root, draft, false)
        return failed ?? responseFromDraft(draft)
      }

      const draft = await loadGeneration(store, args.root, args.sessionId)
      if (draft === null) return generateError('not-found', '找不到 generate 会话；请传入之前返回的 sessionId，或用 action=start 开始新一轮')
      if (action === 'resume') return responseFromDraft(draft)
      if (draft.status === 'completed' || draft.status === 'abandoned') return generateError('closed-session', `这个 generate 会话已经是 ${draft.status}，不能继续修改`, draft)
      if (args.revision !== draft.revision) return generateError('stale-revision', `generate 会话已更新；请用当前 revision=${draft.revision} 继续`, draft)

      if (action === 'abandon') {
        draft.status = 'abandoned'
        draft.currentQuestion = null
        const failed = await persistGeneration(store, args.root, draft)
        return failed ?? responseFromDraft(draft)
      }

      if (action === 'revise') {
        const board = await store.read(args.root, draft.board)
        if (!board.ok) return generateError(board.error.code, board.error.message, draft)
        if (args.questionId === 'page-scope') draft.currentQuestion = pageScopeQuestion(prototypePages(board.value.scene.elements), draft.selectedFrames)
        else if (args.questionId === 'visual-direction') draft.currentQuestion = visualQuestion(board.value.scene.elements, draft.referenceStyle ?? null)
        else return generateError('invalid-question', '只能修改 page-scope 或 visual-direction', draft)
        draft.status = 'question'
        draft.brief = null
        const failed = await persistGeneration(store, args.root, draft)
        return failed ?? responseFromDraft(draft)
      }

      if (action === 'answer') {
        const question = draft.currentQuestion
        if (draft.status !== 'question' || question === null) return generateError('invalid-state', '当前没有等待回答的问题', draft)
        if (args.questionId !== question.id) return generateError('wrong-question', `当前问题是 ${question.id}`, draft)
        const values = [...new Set(args.values ?? [])]
        if (values.length < question.minSelections) return generateError('invalid-option', `至少选择 ${question.minSelections} 项`, draft)
        if (question.selectionMode === 'single' && values.length !== 1) return generateError('invalid-option', '这个问题只能选择一项', draft)
        const optionFor = (value: string): GenerateOption | undefined => question.options.find((option) => option.id === value || option.valueLabel === value)
        const invalid = values.find((value) => optionFor(value) === undefined)
        if (invalid !== undefined) return generateError('invalid-option', `选项「${invalid}」不在当前问题中`, draft)
        const board = await store.read(args.root, draft.board)
        if (!board.ok) return generateError(board.error.code, board.error.message, draft)

        if (question.id === 'page-scope') {
          const selectedFrames = values.map((value) => optionFor(value)?.valueLabel ?? value)
          draft.selectedFrames = selectedFrames
          const scope = elementsInPages(board.value.scene.elements, selectedFrames)
          const inferred = inferDevice(scope.pages)
          if (inferred === 'mixed' || inferred === 'ambiguous') {
            draft.currentQuestion = deviceQuestion()
            draft.status = 'question'
            const failed = await persistGeneration(store, args.root, draft)
            return failed ?? responseFromDraft(draft)
          }
          draft.device = inferred
        } else if (question.id === 'target-device') {
          draft.device = values[0]
        } else {
          const selected = optionFor(values[0])
          if (values[0] === 'custom') {
            const custom = args.otherText?.trim() ?? ''
            if (custom === '') return generateError('custom-required', '选择自定义时需要补充整体视觉方向', draft)
            draft.visualDirection = custom
          } else {
            draft.visualDirection = selected?.valueLabel ?? selected?.label ?? values[0]
          }
        }

        if (draft.visualDirection === null) draft.visualDirection = draft.inheritedVisualDirection
        if (draft.visualDirection === null) {
          draft.currentQuestion = visualQuestion(board.value.scene.elements, draft.referenceStyle ?? null)
          draft.status = 'question'
          const failed = await persistGeneration(store, args.root, draft)
          return failed ?? responseFromDraft(draft)
        }
        return runGeneratePreflight(store, args.root, draft)
      }

      if (action === 'recheck') {
        if (draft.status !== 'blocked') return generateError('invalid-state', '只有 blocked 状态需要 recheck', draft)
        return runGeneratePreflight(store, args.root, draft)
      }

      if (action === 'confirm') {
        if (draft.status !== 'ready') return generateError('invalid-state', '只有用户确认 ready 简报后才能生成', draft)
        const preflight = await runGeneratePreflight(store, args.root, draft)
        if (preflight.status !== 'ready') return preflight
        await preparePagePreservation(args.root, draft)
        draft.status = 'confirmed'
        draft.currentQuestion = null
        const failed = await persistGeneration(store, args.root, draft)
        if (failed !== null) return failed
        return generationPayload(store, args.root, draft)
      }

      if (action === 'complete') {
        if (draft.status !== 'confirmed') return generateError('invalid-state', '只有 confirmed 且 HTML 已写入后才能提交验收', draft)
        const outputFile = await workspaceFile(args.root, resolve(args.root, 'draw2code-pages', draft.board, 'index.html'))
        if (!outputFile.ok) return generateError('generated-index-missing', '生成入口不存在或不可读取：' + outputFile.reason, draft)
        const outputHtml = outputFile.bytes.toString('utf8')
        const missingMarkers = draft.selectedFrames.filter((page) => pageBlock(outputHtml, page) === null)
        if (missingMarkers.length > 0) {
          return generateError('generated-page-marker-missing', '生成页面缺少稳定边界标记：' + missingMarkers.join('、'), draft)
        }
        const changedPages = await preservedPagesStillMatch(args.root, draft)
        if (changedPages.length > 0) {
          return generateError('unselected-pages-changed', '未选择页面被修改或丢失：' + changedPages.join('、') + '；恢复这些页面后重新验收', draft)
        }
        const evidence = await verificationEvidenceFor(args.root, args.verificationEvidence, draft, sha256(outputFile.bytes))
        if (!evidence.ok) return generateError(evidence.code, evidence.message, draft)
        draft.validation = evidence.value
        draft.status = 'completed'
        const failed = await persistGeneration(store, args.root, draft)
        if (failed !== null) return failed
        const settings = await store.writeGenerateSettings(args.root, draft.board, { visualDirection: draft.visualDirection })
        if (!settings.ok) return generateError(settings.error.code, settings.error.message, draft)
        return responseFromDraft(draft, { validation: evidence.value as unknown as JsonValue })
      }

      return generateError('invalid-action', `不支持 action=${action}`, draft)
    },
  })
}
