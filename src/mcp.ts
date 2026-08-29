import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { Draw2CodeDaemonClient } from './daemon-client.ts'
import { DRAW2CODE_UI_HTML, DRAW2CODE_UI_URI } from './mcp-ui.ts'
import type { Draw2CodeCommand, Draw2CodeResult, HostContext } from './runtime.ts'
import workflowContract from '../references/workflow-contract.md'
import { CREATE_ACTIONS } from './create-contract.ts'

const here = resolve(fileURLToPath(import.meta.url), '..')
const daemonEntry = process.env.DRAW2CODE_DAEMON_ENTRY ?? resolve(here, 'draw2code-daemon.js')
const canvasHtml = process.env.DRAW2CODE_CANVAS_HTML ?? resolve(here, '../lib/canvas.html')
const client = new Draw2CodeDaemonClient(daemonEntry, canvasHtml)
const openedWorkspaces = new Set<string>()

const instructions = workflowContract

const server = new McpServer(
  { name: 'draw2code', title: 'Draw2Code / 画码', version: '0.5.0' },
  { capabilities: { tools: {}, resources: {} }, instructions },
)

server.registerResource('draw2code-canvas', DRAW2CODE_UI_URI, {
  title: 'Draw2Code Canvas',
  description: 'Editable Draw2Code Excalidraw canvas.',
  mimeType: 'text/html;profile=mcp-app',
}, async () => ({
  contents: [{
    uri: DRAW2CODE_UI_URI,
    mimeType: 'text/html;profile=mcp-app',
    text: DRAW2CODE_UI_HTML,
    _meta: {
      ui: {
        prefersBorder: false,
        csp: { frameDomains: ['http://127.0.0.1', 'http://localhost'] },
      },
      'openai/widgetPrefersBorder': false,
    },
  }],
}))

function uiSupported(): boolean {
  const capabilities = server.server.getClientCapabilities() as { extensions?: Record<string, unknown> } | undefined
  const extensions = capabilities?.extensions ?? {}
  return Object.keys(extensions).some((key) => /(?:mcp.*(?:apps|ui)|apps.*ui)/i.test(key))
}

async function contextFor(root: string): Promise<HostContext> {
  let workspaceRoot = process.env.DRAW2CODE_WORKSPACE_ROOT ?? process.cwd()
  try {
    const response = await server.server.listRoots()
    const roots = response.roots
      .filter((item) => item.uri.startsWith('file:'))
      .map((item) => fileURLToPath(item.uri))
    workspaceRoot = roots.find((candidate) => root === candidate || root.startsWith(`${candidate}/`)) ?? workspaceRoot
  } catch { /* roots are optional; Codex starts local stdio servers in task cwd */ }
  return {
    clientId: `mcp-${process.pid}`,
    host: 'mcp',
    workspaceRoot,
    interactive: process.env.DRAW2CODE_HEADLESS !== '1',
    uiCapabilities: {
      mcpUi: uiSupported(),
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

async function execute(command: Draw2CodeCommand): Promise<ReturnType<typeof toolResult>> {
  const context = await contextFor(command.root)
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
}, async ({ root }) => execute({ type: 'list', root }))

server.registerTool('draw2code_read', {
  title: 'Read Draw2Code board',
  description: 'Read a board. Omit board to use the user-visible active board.',
  inputSchema: { root, board: z.string().optional() },
}, async ({ root, board }) => execute({ type: 'read', root, ...(board === undefined ? {} : { board }) }))

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
}, async ({ root, ...input }) => execute({ type: 'create', root, input }))

server.registerTool('draw2code_update', {
  title: 'Update Draw2Code board',
  description: 'Apply conflict-safe normalized Excalidraw operations. Omit board to use the active visible board.',
  inputSchema: {
    root,
    board: z.string().optional(),
    ops: z.array(z.record(z.unknown())),
    force: z.boolean().optional(),
    safeMode: z.boolean().optional(),
    visualReview: z.record(z.unknown()).optional(),
  },
}, async ({ root, board, ops, force, safeMode, visualReview }) => execute({
  type: 'update', root, ops,
  ...(board === undefined ? {} : { board }),
  ...(force === undefined ? {} : { force }),
  ...(safeMode === undefined ? {} : { safeMode }),
  ...(visualReview === undefined ? {} : { visualReview }),
}))

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
}, async ({ root, board, ...input }) => execute({
  type: 'generate',
  root,
  input: { ...input, ...(board === undefined ? {} : { name: board }) },
}))

server.registerTool('draw2code_open', {
  title: 'Open Draw2Code canvas',
  description: 'Restore and display the active board, or the empty board picker when none exists. Never creates a project.',
  inputSchema: {
    root,
    board: z.string().optional(),
    presentation: z.enum(['auto', 'inline', 'browser', 'handoff']).optional()
      .describe('Use handoff when the host will open the returned URL in its own sidebar browser.'),
  },
  _meta: {
    ui: { resourceUri: DRAW2CODE_UI_URI },
    'openai/outputTemplate': DRAW2CODE_UI_URI,
    'openai/toolInvocation/invoking': '正在打开画码…',
    'openai/toolInvocation/invoked': '画码已就绪',
  },
}, async ({ root, board, presentation }) => {
  const context = await contextFor(root)
  const workspaceRoot = context.workspaceRoot
  const opened = await client.execute({
    type: 'open', root: workspaceRoot,
    ...(board === undefined ? {} : { board }),
    ...(presentation === undefined ? {} : { presentation }),
  }, context)
  if (!opened.ok) return toolResult(opened)
  const selectedBoard = typeof opened.data.board === 'string' ? opened.data.board : null
  const canvas = await client.canvas(workspaceRoot, selectedBoard, context)
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

await server.connect(new StdioServerTransport())
