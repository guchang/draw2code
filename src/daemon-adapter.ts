import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { Draw2CodeDaemonClient } from './daemon-client.ts'
import { isPathInside } from './scene-store.ts'
import type { Draw2CodeCommand, Draw2CodeResult, HostContext } from './runtime.ts'

const ROUTES = [
  '/api/draw2code/scenes',
  '/api/draw2code/active-board',
  '/api/draw2code/reveal-request',
  '/api/draw2code/scene',
  '/api/draw2code/scene/write',
  '/api/draw2code/versions',
  '/api/draw2code/restore',
  '/api/draw2code/export',
]
const MAX_BODY_BYTES = 2 * 1024 * 1024

function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

async function bodyBuffer(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'DELETE') return undefined
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk as Uint8Array)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function rootFrom(req: IncomingMessage, body: Buffer | undefined): string | null {
  const query = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root')
  if (query !== null) return query
  if (body === undefined) return null
  try {
    const parsed = JSON.parse(body.toString('utf8')) as { root?: unknown }
    return typeof parsed.root === 'string' ? parsed.root : null
  } catch { return null }
}

export function dshContext(ctx: Context, root: string): HostContext {
  const workspace = ctx.workspaceRegistry.list().find((candidate) => isPathInside(candidate.path, root))
  return {
    clientId: `dsh-${process.pid}`,
    host: 'dsh',
    workspaceRoot: workspace?.path ?? '',
    interactive: true,
    uiCapabilities: { mcpUi: false, externalBrowser: false },
  }
}

export function makeDaemonProxyRoutes(ctx: Context, client: Draw2CodeDaemonClient): WebRoute[] {
  const routes = ROUTES.map((path) => ({
    kind: 'exact' as const,
    path,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (!isLoopbackRequest(req)) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: { code: 'forbidden', message: 'loopback-only' } }))
        return
      }
      try {
        const body = await bodyBuffer(req)
        const root = rootFrom(req, body)
        if (root !== null) await client.registerWorkspace(root, dshContext(ctx, root))
        const upstream = await client.proxy(req.url ?? path, { method: req.method ?? 'GET', body })
        res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8' })
        res.end(upstream.body)
      } catch (error) {
        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: { code: 'daemon-unavailable', message: error instanceof Error ? error.message : String(error) } }))
      }
    },
  }))
  routes.push({
    kind: 'exact' as const,
    path: '/api/draw2code/events-config',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (!isLoopbackRequest(req) || req.method !== 'GET') {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: { code: 'forbidden', message: 'same-origin loopback only' } }))
        return
      }
      try {
        const root = rootFrom(req, undefined)
        if (root === null) throw new Error('missing root')
        const context = dshContext(ctx, root)
        await client.registerWorkspace(root, context)
        const canvas = await client.canvas(root, null, context)
        const url = new URL(canvas.url)
        url.protocol = 'ws:'
        url.pathname = '/events'
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok: true, url: url.toString(), expiresAt: canvas.expiresAt }))
      } catch (error) {
        res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: { code: 'daemon-unavailable', message: error instanceof Error ? error.message : String(error) } }))
      }
    },
  })
  return routes
}

export function daemonTool(
  ctx: Context,
  client: Draw2CodeDaemonClient,
  base: ToolDefinition,
  commandFor: (args: Record<string, unknown>) => Draw2CodeCommand,
): ToolDefinition {
  return {
    ...base,
    async execute(args, exec) {
      const command = commandFor(args as Record<string, unknown>)
      const result: Draw2CodeResult = await client.execute(command, dshContext(ctx, command.root))
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      return result.data as never
    },
  }
}
