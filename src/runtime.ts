import { randomBytes } from 'node:crypto'
import { mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { ProjectStore } from './project-store.ts'
import { SceneStore, isPathInside } from './scene-store.ts'
import { storeContextFor } from './store-context.ts'
import { draw2codeCreateTool } from './create-tool.ts'
import { draw2codeGenerateTool, draw2codeListTool, draw2codeReadTool, draw2codeUpdateTool } from './tools.ts'

export type HostKind = 'dsh' | 'codex' | 'mcp' | 'cli'
export type Presentation = 'inline' | 'browser' | 'headless'

export interface HostContext {
  clientId: string
  host: HostKind
  workspaceRoot: string
  interactive: boolean
  uiCapabilities: { mcpUi: boolean; externalBrowser: boolean }
}

export type Draw2CodeCommand =
  | { type: 'list'; root: string }
  | { type: 'read'; root: string; board?: string }
  | { type: 'create'; root: string; input: Record<string, unknown> }
  | { type: 'update'; root: string; board?: string; ops: unknown[]; force?: boolean; safeMode?: boolean }
  | { type: 'generate'; root: string; input: Record<string, unknown> }
  | { type: 'open'; root: string; board?: string; presentation?: 'auto' | 'inline' | 'browser' }

export type Draw2CodeEvent =
  | { type: 'scene.updated'; root: string; board: string; revision: number; sourceClientId: string }
  | { type: 'active-board.changed'; root: string; board: string; sourceClientId: string }
  | { type: 'board.reveal-requested'; root: string; board: string; requestId: string; sourceClientId: string }
  | { type: 'board.deleted'; root: string; board: string; revision: number; sourceClientId: string }

export interface CanvasHandle {
  board: string | null
  revision: number
  presentation: Presentation
  resourceUri?: string
  url?: string
  opened: boolean
}

export type Draw2CodeResult =
  | { ok: true; command: Draw2CodeCommand['type']; data: Record<string, unknown> }
  | { ok: false; command: Draw2CodeCommand['type']; error: { code: string; message: string } }

export interface Draw2CodeRuntime {
  execute(command: Draw2CodeCommand, context: HostContext): Promise<Draw2CodeResult>
  subscribe(context: HostContext, listener: (event: Draw2CodeEvent) => void): () => void
}

export function choosePresentation(
  requested: 'auto' | 'inline' | 'browser' = 'auto',
  capabilities: HostContext['uiCapabilities'],
): Presentation {
  if (requested === 'inline') return capabilities.mcpUi ? 'inline' : capabilities.externalBrowser ? 'browser' : 'headless'
  if (requested === 'browser') return capabilities.externalBrowser ? 'browser' : 'headless'
  if (capabilities.mcpUi) return 'inline'
  if (capabilities.externalBrowser) return 'browser'
  return 'headless'
}

function errorCode(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error)
  const match = /^([a-z][a-z0-9_-]*):\s*(.*)$/is.exec(message)
  return match === null ? { code: 'internal', message } : { code: match[1], message: match[2] }
}

async function canonicalContext(command: Draw2CodeCommand, context: HostContext): Promise<{ root: string; workspaceRoot: string }> {
  let root: string
  let workspaceRoot: string
  try {
    ;[root, workspaceRoot] = await Promise.all([realpath(command.root), realpath(context.workspaceRoot)])
  } catch {
    throw new Error('workspace-unknown: path does not resolve on disk')
  }
  if (!isPathInside(workspaceRoot, root)) throw new Error('workspace-unknown: root is outside the host workspace')
  return { root, workspaceRoot }
}

export class Draw2CodeRuntimeImpl implements Draw2CodeRuntime {
  private readonly listeners = new Set<(event: Draw2CodeEvent) => void>()
  private readonly mutationQueues = new Map<string, Promise<void>>()

  subscribe(_context: HostContext, listener: (event: Draw2CodeEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: Draw2CodeEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private async serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.mutationQueues.get(key) ?? Promise.resolve()
    let release = (): void => undefined
    const current = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.catch(() => undefined).then(() => current)
    this.mutationQueues.set(key, tail)
    await previous.catch(() => undefined)
    try { return await task() } finally {
      release()
      if (this.mutationQueues.get(key) === tail) this.mutationQueues.delete(key)
    }
  }

  async execute(command: Draw2CodeCommand, context: HostContext): Promise<Draw2CodeResult> {
    try {
      const canonical = await canonicalContext(command, context)
      const normalized = { ...command, root: canonical.root } as Draw2CodeCommand
      const mutating = normalized.type === 'create' || normalized.type === 'update' || normalized.type === 'generate'
      const task = () => this.executeCanonical(normalized, { ...context, workspaceRoot: canonical.workspaceRoot })
      // The store's module-wide, physical-file queues are the fine-grained
      // write seam shared with Canvas routes. This root queue also keeps
      // multi-file Create/Generate transitions ordered against each other.
      return mutating ? await this.serialize(canonical.root, task) : await task()
    } catch (error) {
      return { ok: false, command: command.type, error: errorCode(error) }
    }
  }

  private async executeCanonical(command: Draw2CodeCommand, context: HostContext): Promise<Draw2CodeResult> {
    const storeContext = storeContextFor(context.workspaceRoot)
    const scenes = new SceneStore(storeContext)
    const projects = new ProjectStore(storeContext)
    let data: Record<string, unknown>
    if (command.type === 'list') {
      data = await draw2codeListTool(scenes).execute({ root: command.root }, {} as never) as Record<string, unknown>
    } else if (command.type === 'read') {
      data = await draw2codeReadTool(scenes).execute({ root: command.root, ...(command.board === undefined ? {} : { name: command.board }) }, {} as never) as Record<string, unknown>
    } else if (command.type === 'create') {
      data = await draw2codeCreateTool(projects, scenes).execute({ ...command.input, root: command.root } as never, {} as never) as Record<string, unknown>
    } else if (command.type === 'update') {
      data = await draw2codeUpdateTool(scenes).execute({
        root: command.root,
        ...(command.board === undefined ? {} : { name: command.board }),
        ops: command.ops,
        ...(command.force === undefined ? {} : { force: command.force }),
        ...(command.safeMode === undefined ? {} : { safeMode: command.safeMode }),
      } as never, {} as never) as Record<string, unknown>
    } else if (command.type === 'generate') {
      data = await draw2codeGenerateTool(scenes, projects).execute({ ...command.input, root: command.root } as never, {} as never) as Record<string, unknown>
    } else {
      const active = command.board === undefined ? await scenes.getActiveBoard(command.root) : { ok: true as const, value: { name: command.board } }
      if (!active.ok) throw new Error(`${active.error.code}: ${active.error.message}`)
      const board = active.value.name
      let revision = 0
      if (board !== null) {
        const read = await scenes.read(command.root, board)
        if (!read.ok) throw new Error(`${read.error.code}: ${read.error.message}`)
        revision = read.value.rev
      }
      const presentation = choosePresentation(command.presentation, context.uiCapabilities)
      data = {
        board,
        revision,
        presentation,
        ...(presentation === 'inline' ? { resourceUri: 'ui://draw2code/canvas.html' } : {}),
        opened: false,
      } satisfies CanvasHandle as unknown as Record<string, unknown>
    }

    if (command.type === 'update' && data.verified === true) {
      const board = String(data.targetBoard ?? command.board ?? 'prototype')
      const revision = Number(data.rev ?? 0)
      this.emit({ type: 'scene.updated', root: command.root, board, revision, sourceClientId: context.clientId })
      if (data.activeBoard === board) {
        this.emit({ type: 'active-board.changed', root: command.root, board, sourceClientId: context.clientId })
      }
      if (typeof data.revealRequestId === 'string') {
        this.emit({ type: 'board.reveal-requested', root: command.root, board, requestId: data.revealRequestId, sourceClientId: context.clientId })
      }
    }
    if (command.type === 'create' && data.status === 'confirmed' && typeof data.boardName === 'string') {
      this.emit({ type: 'active-board.changed', root: command.root, board: data.boardName, sourceClientId: context.clientId })
    }
    return { ok: true, command: command.type, data }
  }
}

export interface DaemonDescriptor {
  pid: number
  port: number
  nonce: string
  token: string
  startedAt: number
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

export async function createDaemonDescriptor(
  path: string,
  input: Pick<DaemonDescriptor, 'pid' | 'port'>,
): Promise<DaemonDescriptor> {
  const descriptor: DaemonDescriptor = {
    ...input,
    nonce: randomToken(18),
    token: randomToken(32),
    startedAt: Date.now(),
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const tmp = `${path}.tmp-${process.pid}-${randomToken(6)}`
  await writeFile(tmp, `${JSON.stringify(descriptor)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(tmp, path)
  return descriptor
}

export async function validateDaemonDescriptor(path: string): Promise<DaemonDescriptor | null> {
  try {
    const info = await stat(path)
    if ((info.mode & 0o077) !== 0) return null
    const value = JSON.parse(await readFile(path, 'utf8')) as Partial<DaemonDescriptor>
    if (!Number.isInteger(value.pid) || !Number.isInteger(value.port) || Number(value.port) <= 0 || Number(value.port) > 65535) return null
    if (typeof value.nonce !== 'string' || value.nonce.length < 16 || typeof value.token !== 'string' || value.token.length < 32) return null
    if (typeof value.startedAt !== 'number') return null
    return value as DaemonDescriptor
  } catch {
    return null
  }
}
