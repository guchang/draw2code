/**
 * dsh-draw2code — host half. Mounts the workspace-gated scene store
 * (draw2code/*.excalidraw.json), the /api/draw2code/* route family, the
 * agent tools (draw2code_list / draw2code_read / draw2code_create /
 * draw2code_update / draw2code_generate), and the
 * system-prompt announcement. The browser half (./client) renders the
 * right-sidebar Excalidraw canvas (Codex-style layout: chat left, board
 * right). No dsh source changes — hot-pluggable via a profile bundle.
 */

import type { Context } from '@deepseek-ai/cordis'
import { resolve } from 'node:path'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import { ProjectStore } from './project-store.ts'
import { SceneStore } from './scene-store.ts'
import { makeRoutes } from './routes.ts'
import { draw2codeCreateTool } from './create-tool.ts'
import { draw2codeGenerateTool, draw2codeListTool, draw2codeReadTool, draw2codeUpdateTool } from './tools.ts'
import { DRAW2CODE_GUIDANCE, SECTION_ORDER } from './guidance.ts'
import { Draw2CodeDaemonClient } from './daemon-client.ts'
import { daemonTool, makeDaemonProxyRoutes } from './daemon-adapter.ts'

// Re-exported for tests and downstream tooling (the cordis loader only reads
// name/inject/apply/Config, extra exports are ignored).
export { ProjectStore } from './project-store.ts'
export { SceneStore, normalizeElement, emptyScene, isPathInside } from './scene-store.ts'
export { inspectPrototypeLayout, formatLayoutIssues } from './layout.ts'
export { makeRoutes } from './routes.ts'
export { draw2codeCreateTool } from './create-tool.ts'
export { draw2codeGenerateTool, draw2codeListTool, draw2codeReadTool, draw2codeUpdateTool } from './tools.ts'
export { Draw2CodeRuntimeImpl, choosePresentation, createDaemonDescriptor, validateDaemonDescriptor } from './runtime.ts'
export type { Draw2CodeCommand, Draw2CodeEvent, Draw2CodeResult, Draw2CodeRuntime, HostContext, CanvasHandle } from './runtime.ts'

/** Stable cordis plugin name. */
export const name = 'draw2code'

/** Services required before the 画码 surfaces can mount. */
export const inject = ['webServer', 'tools', 'systemPrompt', 'workspaceRegistry']

/**
 * Mount the scene store, routes, tools, and announcement.
 * @param ctx - host plugin context carrying webServer/tools/systemPrompt/workspaceRegistry.
 */
export function apply(ctx: Context): void {
  const projects = new ProjectStore(ctx)
  const store = new SceneStore(ctx)
  const client = new Draw2CodeDaemonClient(
    resolve(import.meta.dirname, 'draw2code-daemon.js'),
    resolve(import.meta.dirname, '../lib/canvas.html'),
  )
  const routes = makeDaemonProxyRoutes(ctx, client)
  const localTools = [draw2codeListTool(store), draw2codeReadTool(store), draw2codeCreateTool(projects, store), draw2codeUpdateTool(store), draw2codeGenerateTool(store, projects)]
  const tools = [
    daemonTool(ctx, client, localTools[0], (args) => ({ type: 'list', root: String(args.root ?? '') })),
    daemonTool(ctx, client, localTools[1], (args) => ({ type: 'read', root: String(args.root ?? ''), ...(typeof args.name === 'string' ? { board: args.name } : {}) })),
    daemonTool(ctx, client, localTools[2], (args) => { const { root, ...input } = args; return { type: 'create', root: String(root ?? ''), input } }),
    daemonTool(ctx, client, localTools[3], (args) => ({
      type: 'update', root: String(args.root ?? ''), ops: Array.isArray(args.ops) ? args.ops : [],
      ...(typeof args.name === 'string' ? { board: args.name } : {}),
      ...(typeof args.force === 'boolean' ? { force: args.force } : {}),
      ...(typeof args.safeMode === 'boolean' ? { safeMode: args.safeMode } : {}),
    })),
    daemonTool(ctx, client, localTools[4], (args) => { const { root, ...input } = args; return { type: 'generate', root: String(root ?? ''), input } }),
  ]

  ctx.effect(() => {
    const disposers = routes.map((route) => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-draw2code: routes')

  ctx.effect(() => {
    const disposers = tools.map((tool) => ctx.tools.register(tool))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-draw2code: tools')

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:draw2code',
    order: SECTION_ORDER,
    text: DRAW2CODE_GUIDANCE,
  }), 'dsh-draw2code: prompt section')
}
