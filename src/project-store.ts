/**
 * Workspace-gated storage for draw2code_create project drafts.
 *
 * Project drafts deliberately live beside, but not inside, Excalidraw scene
 * files. A draft records product intent and grilling state; a scene records
 * what is currently visible on the canvas.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { isPathInside, SCENE_DIR } from './scene-store.ts'
import type { Draw2CodeStoreContext } from './store-context.ts'

export const PROJECTS_DIR = `${SCENE_DIR}/.projects`

const PROJECT_ID_RE = /^project-[0-9a-f-]{36}$/
const PROJECT_FILE_RE = /^project-[0-9a-f-]{36}\.json$/
const VERSION_FILE_RE = /^(\d{9,})-[0-9a-z]{1,8}\.json$/

export type ProjectStatus = 'draft' | 'ready' | 'confirmed' | 'completed' | 'abandoned' | 'archived'

export interface ProjectHistoryEntry {
  revision: number
  action: string
  at: number
  questionId?: string
  values?: string[]
  otherText?: string
}

export interface ProjectDraft {
  flowVersion?: number
  projectId: string
  projectName: string
  originalIdea: string
  status: ProjectStatus
  revision: number
  createdAt: number
  updatedAt: number
  boardName: string | null
  deferredStyleNote: string | null
  answers: Record<string, {
    questionId: string
    values: string[]
    otherText?: string
    normalizedText?: string
    confirmed: boolean
  }>
  currentQuestion: unknown
  discovery?: unknown
  briefMarkdown?: string | null
  pendingInterpretation: {
    questionId: string
    values: string[]
    otherText: string
    normalizedText: string
    question: unknown
  } | null
  brief: unknown | null
  history: ProjectHistoryEntry[]
  lastRequestKey?: string
  lastResponse?: unknown
}

export type ProjectResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string; current?: ProjectDraft } }

function error(code: string, message: string, current?: ProjectDraft): ProjectResult<never> {
  return { ok: false, error: { code, message, ...(current === undefined ? {} : { current }) } }
}

function now(): number {
  return Date.now()
}

function validateProjectId(projectId: string): ProjectResult<string> {
  return PROJECT_ID_RE.test(projectId)
    ? { ok: true, value: projectId }
    : error('bad-project-id', `project id "${projectId}" is invalid`)
}

function versionStamp(entry: string): number | null {
  const match = VERSION_FILE_RE.exec(entry)
  return match === null ? null : Number(match[1])
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function newProjectId(): string {
  return `project-${randomUUID()}`
}

// Runtime and route adapters construct independent store objects inside one
// daemon. Keep project mutations coordinated across all of those instances.
const PROJECT_MUTATION_QUEUES = new Map<string, Promise<void>>()

export class ProjectStore {
  constructor(private readonly ctx: Draw2CodeStoreContext) {}

  private async withMutationLock<T>(path: string, task: () => Promise<T>): Promise<T> {
    const previous = PROJECT_MUTATION_QUEUES.get(path) ?? Promise.resolve()
    let release = (): void => undefined
    const current = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.catch(() => undefined).then(() => current)
    PROJECT_MUTATION_QUEUES.set(path, tail)
    await previous.catch(() => undefined)
    try {
      return await task()
    } finally {
      release()
      if (PROJECT_MUTATION_QUEUES.get(path) === tail) PROJECT_MUTATION_QUEUES.delete(path)
    }
  }

  private async gate(root: string): Promise<ProjectResult<string>> {
    if (typeof root !== 'string' || root === '') return error('workspace-unknown', 'empty project root')
    let canonical: string
    try {
      canonical = await realpath(root)
    } catch {
      return error('workspace-unknown', 'path does not resolve on disk')
    }
    const workspaces = this.ctx.workspaceRegistry.list()
    for (const workspace of workspaces) {
      if (isPathInside(workspace.path, canonical)) return { ok: true, value: canonical }
    }
    return error('workspace-unknown', 'path is not inside a registered workspace')
  }

  private projectDir(root: string): string {
    return join(root, PROJECTS_DIR)
  }

  private projectPath(root: string, projectId: string): string {
    return join(this.projectDir(root), `${projectId}.json`)
  }

  private versionsDir(root: string, projectId: string): string {
    return join(this.projectDir(root), '.versions', projectId)
  }

  fileName(projectId: string): string {
    return `${PROJECTS_DIR}/${projectId}.json`
  }

  async read(root: string, projectId: string): Promise<ProjectResult<ProjectDraft>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const validId = validateProjectId(projectId)
    if (!validId.ok) return validId
    let raw: string
    try {
      raw = await readFile(this.projectPath(gated.value, validId.value), 'utf8')
    } catch {
      return error('not-found', `project "${projectId}" does not exist`)
    }
    try {
      return { ok: true, value: JSON.parse(raw) as ProjectDraft }
    } catch {
      return error('corrupt', `project "${projectId}" is not valid JSON`)
    }
  }

  async create(root: string, draft: ProjectDraft): Promise<ProjectResult<ProjectDraft>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const validId = validateProjectId(draft.projectId)
    if (!validId.ok) return validId
    const path = this.projectPath(gated.value, validId.value)
    try {
      await stat(path)
      return error('exists', `project "${draft.projectId}" already exists`)
    } catch {
      // Expected: this is a new project draft.
    }
    await mkdir(this.projectDir(gated.value), { recursive: true })
    const written = await this.writeAtomic(gated.value, draft)
    return written
  }

  async save(root: string, draft: ProjectDraft, expectedRevision: number): Promise<ProjectResult<ProjectDraft>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    const validId = validateProjectId(draft.projectId)
    if (!validId.ok) return validId
    const path = this.projectPath(gated.value, validId.value)
    return this.withMutationLock(path, async () => {
      const current = await this.read(root, draft.projectId)
      if (!current.ok) return current
      if (current.value.revision !== expectedRevision) {
        return error('stale_revision', `project changed since revision ${expectedRevision}`, current.value)
      }
      await this.archiveCurrent(gated.value, draft.projectId)
      return this.writeAtomic(gated.value, draft)
    })
  }

  async list(root: string): Promise<ProjectResult<ProjectDraft[]>> {
    const gated = await this.gate(root)
    if (!gated.ok) return gated
    let entries: string[]
    try {
      entries = await readdir(this.projectDir(gated.value))
    } catch {
      return { ok: true, value: [] }
    }
    const drafts: ProjectDraft[] = []
    for (const entry of entries) {
      if (!PROJECT_FILE_RE.test(entry)) continue
      try {
        drafts.push(JSON.parse(await readFile(join(this.projectDir(gated.value), entry), 'utf8')) as ProjectDraft)
      } catch {
        // An unreadable draft must not prevent the rest from being resumed.
      }
    }
    drafts.sort((a, b) => b.updatedAt - a.updatedAt)
    return { ok: true, value: drafts }
  }

  private async writeAtomic(root: string, draft: ProjectDraft): Promise<ProjectResult<ProjectDraft>> {
    const normalized = clone({ ...draft, updatedAt: now() })
    await mkdir(this.projectDir(root), { recursive: true })
    const path = this.projectPath(root, draft.projectId)
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await writeFile(tmp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
    await rename(tmp, path)
    return { ok: true, value: normalized }
  }

  private async archiveCurrent(root: string, projectId: string): Promise<void> {
    const path = this.projectPath(root, projectId)
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch {
      return
    }
    const dir = this.versionsDir(root, projectId)
    await mkdir(dir, { recursive: true })
    const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
    await writeFile(join(dir, `${Date.now()}-${suffix}.json`), `${raw}\n`, 'utf8')
    const entries = (await readdir(dir)).filter((entry) => versionStamp(entry) !== null)
    if (entries.length <= 30) return
    const doomed = entries
      .map((entry) => ({ entry, stamp: versionStamp(entry) ?? 0 }))
      .sort((a, b) => a.stamp - b.stamp)
      .slice(0, entries.length - 30)
    const { rm } = await import('node:fs/promises')
    await Promise.all(doomed.map(({ entry }) => rm(join(dir, entry), { force: true })))
  }
}
