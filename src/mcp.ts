import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { Draw2CodeDaemonClient } from './daemon-client.ts'
import type { Draw2CodeCommand, Draw2CodeResult, HostContext } from './runtime.ts'
import workflowContract from '../references/workflow-contract.md'
import { CREATE_ACTIONS } from './create-contract.ts'

const here = resolve(fileURLToPath(import.meta.url), '..')
const daemonEntry = process.env.DRAW2CODE_DAEMON_ENTRY ?? resolve(here, 'draw2code-daemon.js')
const canvasHtml = process.env.DRAW2CODE_CANVAS_HTML ?? resolve(here, '../lib/canvas.html')
const client = new Draw2CodeDaemonClient(daemonEntry, canvasHtml)
const openedWorkspaces = new Set<string>()
const configuredWorkspaceRoot = process.env.DRAW2CODE_WORKSPACE_ROOT?.trim() || undefined
let advertisedRootsPromise: Promise<string[]> | undefined

interface McpRequestExtra {
  _meta?: Record<string, unknown>
  taskId?: string
}

const instructions = workflowContract

const server = new McpServer(
  { name: 'draw2code', title: 'Draw2Code / 画码', version: '0.5.0' },
  { capabilities: { tools: {} }, instructions },
)

function advertisedRoots(): Promise<string[]> {
  advertisedRootsPromise ??= server.server.listRoots()
    .then((response) => response.roots
      .filter((item) => item.uri.startsWith('file:'))
      .map((item) => fileURLToPath(item.uri)))
    .catch(() => [])
  return advertisedRootsPromise
}

function requestClientId(extra?: McpRequestExtra): string {
  const relatedTask = extra?._meta?.['io.modelcontextprotocol/related-task']
  const relatedTaskId = relatedTask !== null && typeof relatedTask === 'object'
    ? (relatedTask as Record<string, unknown>).taskId
    : undefined
  const taskId = typeof relatedTaskId === 'string' && relatedTaskId.trim() !== ''
    ? relatedTaskId
    : extra?.taskId
  if (typeof taskId !== 'string' || taskId.trim() === '') return `mcp-${process.pid}`
  const digest = createHash('sha256').update(taskId).digest('hex').slice(0, 24)
  return `mcp-task-${digest}`
}

async function contextFor(root: string, extra?: McpRequestExtra): Promise<HostContext> {
  let workspaceRoot = configuredWorkspaceRoot ?? root
  if (configuredWorkspaceRoot === undefined) {
    const roots = await advertisedRoots()
    const advertisedRoot = roots.find((candidate) => root === candidate || root.startsWith(`${candidate}/`))
    if (advertisedRoot !== undefined) workspaceRoot = advertisedRoot
    else if (roots.length > 0) workspaceRoot = process.cwd()
  }
  return {
    clientId: requestClientId(extra),
    host: 'mcp',
    workspaceRoot,
    interactive: process.env.DRAW2CODE_HEADLESS !== '1',
    uiCapabilities: {
      mcpUi: false,
      externalBrowser: process.env.DRAW2CODE_HEADLESS !== '1' && process.env.CI !== 'true',
    },
  }
}

function toolResult(result: Draw2CodeResult) {
  return {
    structuredContent: result,
    content: [{ type: 'text' as const, text: result.ok ? JSON.stringify(result.data) : `${result.error.code}: ${result.error.message}` }],
    ...(result.ok ? {} : { isError: true }),
  }
}

async function execute(command: Draw2CodeCommand, extra?: McpRequestExtra): Promise<ReturnType<typeof toolResult>> {
  const context = await contextFor(command.root, extra)
  // MCP clients may run the tool from a nested repository while advertising
  // a broader workspace root. Boards are workspace-scoped, so normalize every
  // command to the advertised root; otherwise the browser and DSH silently
  // create separate board inventories for parent and child directories.
  const normalized = { ...command, root: context.workspaceRoot } as Draw2CodeCommand
  return toolResult(await client.execute(normalized, context))
}

const root = z.string().min(1).describe('Absolute path inside the current workspace. The registered workspace root is the shared Draw2Code storage scope.')

server.registerTool('draw2code_list', {
  title: 'List Draw2Code boards',
  description: 'List boards and the shared active board without writing files.',
  inputSchema: { root },
}, async ({ root }, extra) => execute({ type: 'list', root }, extra))

server.registerTool('draw2code_read', {
  title: 'Read Draw2Code board',
  description: 'Read bounded board metadata by default, or select elements by page, ids, region, or recent revision.',
  inputSchema: {
    root,
    board: z.string().optional(),
    detail: z.enum(['index', 'full']).optional(),
    pageIds: z.array(z.string()).optional(),
    elementIds: z.array(z.string()).optional(),
    region: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() }).optional(),
    changesSince: z.number().optional(),
    cursor: z.string().optional(),
    limit: z.number().int().positive().max(250).optional(),
  },
}, async ({ root, board, ...scope }, extra) => execute({ type: 'read', root, ...scope, ...(board === undefined ? {} : { board }) }, extra))

server.registerTool('draw2code_create', {
  title: 'Create Draw2Code project',
  description: 'Run the resumable Create state machine. Preserve structured question fields for native host choices.',
  inputSchema: {
    root,
    action: z.enum(CREATE_ACTIONS),
    idea: z.string().optional(),
    projectName: z.string().optional(),
    styleNote: z.string().optional(),
    sessionId: z.string().optional(),
    revision: z.number().int().optional(),
    questionId: z.string().optional(),
    values: z.array(z.string()).optional(),
    otherText: z.string().optional(),
    question: z.record(z.unknown()).optional(),
    brief: z.record(z.unknown()).optional(),
    stopReason: z.string().optional(),
  },
}, async ({ root, ...input }, extra) => execute({ type: 'create', root, input }, extra))

server.registerTool('draw2code_update', {
  title: 'Update Draw2Code board',
  description: 'Write conflict-safe Excalidraw operations or record a visible review without mutating the board. Omit board to use the active visible board.',
  inputSchema: {
    root,
    board: z.string().optional(),
    action: z.enum(['write', 'review', 'commit_pending']).optional(),
    ops: z.array(z.record(z.unknown())).optional(),
    force: z.boolean().optional(),
    safeMode: z.boolean().optional(),
    reviewToken: z.string().optional(),
    phase: z.enum(['representative', 'final']).optional(),
    passed: z.boolean().optional(),
    inspectedPageIds: z.array(z.string()).optional(),
    observations: z.array(z.string()).optional(),
    pendingUpdateId: z.string().optional(),
    visualReview: z.record(z.unknown()).optional(),
  },
}, async ({ root, board, action, ops, force, safeMode, reviewToken, phase, passed, inspectedPageIds, observations, pendingUpdateId, visualReview }, extra) => execute({
  type: 'update', root,
  ...(board === undefined ? {} : { board }),
  ...(action === undefined ? {} : { action }),
  ...(ops === undefined ? {} : { ops }),
  ...(force === undefined ? {} : { force }),
  ...(safeMode === undefined ? {} : { safeMode }),
  ...(reviewToken === undefined ? {} : { reviewToken }),
  ...(phase === undefined ? {} : { phase }),
  ...(passed === undefined ? {} : { passed }),
  ...(inspectedPageIds === undefined ? {} : { inspectedPageIds }),
  ...(observations === undefined ? {} : { observations }),
  ...(pendingUpdateId === undefined ? {} : { pendingUpdateId }),
  ...(visualReview === undefined ? {} : { visualReview }),
}, extra))

server.registerTool('draw2code_generate', {
  title: 'Generate frontend from Draw2Code',
  description: 'Run the resumable Generate and evidence-verification state machine.',
  inputSchema: {
    root,
    action: z.enum(['start', 'answer', 'revise', 'resume', 'recheck', 'confirm', 'complete', 'abandon']).optional(),
    board: z.string().optional(),
    pages: z.array(z.string()).optional(),
    frames: z.array(z.string()).optional(),
    styleNote: z.string().optional(),
    referenceStyle: z.string().optional(),
    sessionId: z.string().optional(),
    revision: z.number().int().optional(),
    questionId: z.string().optional(),
    values: z.array(z.string()).optional(),
    otherText: z.string().optional(),
    verificationEvidence: z.union([z.record(z.unknown()), z.string()]).optional(),
    previewOpened: z.boolean().optional(),
    selectedPagesVisible: z.boolean().optional(),
    coreFlowPassed: z.boolean().optional(),
    mockDataVisible: z.boolean().optional(),
    unselectedPagesPreserved: z.boolean().optional(),
  },
}, async ({ root, board, ...input }, extra) => execute({
  type: 'generate',
  root,
  input: { ...input, ...(board === undefined ? {} : { name: board }) },
}, extra))

server.registerTool('draw2code_open', {
  title: 'Open Draw2Code canvas',
  description: 'Open a requested workspace and board through the stable local Draw2Code gateway. Direct loopback access initializes itself; task-targeted handoff links remain isolated and redirect immediately to the clean fixed root URL. Never creates a project.',
  inputSchema: {
    root,
    board: z.string().optional(),
    presentation: z.enum(['auto', 'inline', 'browser', 'handoff']).optional()
      .describe('Defaults to handoff. auto and inline are compatibility aliases for handoff; browser explicitly launches an external browser.'),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
}, async ({ root, board, presentation }, extra) => {
  const context = await contextFor(root, extra)
  const workspaceRoot = context.workspaceRoot
  const requestedPresentation = presentation === 'browser' ? 'browser' : 'handoff'
  const opened = await client.execute({
    type: 'open', root: workspaceRoot,
    ...(board === undefined ? {} : { board }),
    presentation: requestedPresentation,
  }, context)
  if (!opened.ok) return toolResult(opened)
  const selectedBoard = typeof opened.data.board === 'string' ? opened.data.board : null
  const canvas = await client.stableCanvas(workspaceRoot, selectedBoard, context)
  const actualPresentation = String(opened.data.presentation)
  let didOpen = false
  if (actualPresentation === 'browser' && !openedWorkspaces.has(workspaceRoot)) {
    didOpen = await client.openBrowser(canvas.url)
    if (didOpen) openedWorkspaces.add(workspaceRoot)
  }
  const displayState = didOpen
    ? 'external-browser-opened'
    : actualPresentation === 'inline'
      ? 'inline-requested'
      : actualPresentation === 'handoff'
        ? 'handoff-ready'
        : 'url-ready'
  const result: Draw2CodeResult = {
    ok: true,
    command: 'open',
    data: { ...opened.data, ...canvas, opened: didOpen, displayState },
  }
  return toolResult(result)
})

server.server.oninitialized = () => {
  if (configuredWorkspaceRoot === undefined) void advertisedRoots()
  // Opening the canvas is an explicit UI action. Prewarm the stable gateway and
  // dynamic worker so the first open call only needs to mint a one-time code.
  void Promise.all([client.ensure(), client.ensureGateway()]).catch(() => undefined)
}

await server.connect(new StdioServerTransport())
