import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, realpath, rm } from 'node:fs/promises'
import { URL } from 'node:url'
import { WebSocketServer, type WebSocket } from 'ws'
import { makeRoutes } from './routes.ts'
import { SceneStore } from './scene-store.ts'
import { Draw2CodeRuntimeImpl, createDaemonDescriptor, type DaemonDescriptor, type Draw2CodeCommand, type HostContext } from './runtime.ts'
import type { Draw2CodeStoreContext } from './store-context.ts'

const MAX_BODY_BYTES = 2 * 1024 * 1024
const CANVAS_TOKEN_TTL_MS = 15 * 60_000

interface CanvasGrant { root: string; expiresAt: number }
type Authorized = { ok: true; grant?: CanvasGrant } | { ok: false }

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk as Uint8Array)
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buffer)
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof value !== 'object' || value === null) throw new Error('request body must be an object')
  return value as Record<string, unknown>
}

function loopback(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function bearer(req: IncomingMessage): string | null {
  const value = req.headers.authorization
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : null
}

function requestRoot(req: IncomingMessage, body?: Record<string, unknown>): string | null {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const queryRoot = url.searchParams.get('root')
  if (queryRoot !== null) return queryRoot
  return typeof body?.root === 'string' ? body.root : null
}

function safeEqual(left: string, right: string): boolean {
  return createHash('sha256').update(left).digest('hex') === createHash('sha256').update(right).digest('hex')
}

export interface StartedDaemon {
  descriptor: DaemonDescriptor
  close(): Promise<void>
}

export async function startDaemon(options: {
  descriptorPath: string
  canvasHtmlPath: string
  idleMs?: number
  canvasTokenTtlMs?: number
}): Promise<StartedDaemon> {
  const runtime = new Draw2CodeRuntimeImpl()
  const roots = new Set<string>()
  const grants = new Map<string, CanvasGrant>()
  const sockets = new Map<WebSocket, string>()
  let descriptor: DaemonDescriptor
  let lastActivity = Date.now()
  const canvasTokenTtlMs = options.canvasTokenTtlMs ?? CANVAS_TOKEN_TTL_MS
  const storeContext: Draw2CodeStoreContext = {
    workspaceRegistry: { list: () => [...roots].map((path) => ({ path })) },
    logger: { warn: (message, ...args) => console.warn(message, ...args) },
  }
  const sceneRoutes = makeRoutes(new SceneStore(storeContext))

  const authorize = async (req: IncomingMessage, root: string | null): Promise<Authorized> => {
    const token = bearer(req) ?? new URL(req.url ?? '/', 'http://localhost').searchParams.get('token')
    if (token !== null && safeEqual(token, descriptor.token)) return { ok: true }
    if (token === null || root === null) return { ok: false }
    const grant = grants.get(token)
    if (grant === undefined || grant.expiresAt < Date.now()) {
      grants.delete(token)
      return { ok: false }
    }
    try {
      if (await realpath(root) !== grant.root) return { ok: false }
      // The token expires after inactivity, not while an open canvas is still
      // polling or connected. This keeps long editing sessions usable without
      // widening the grant beyond its exact workspace root.
      grant.expiresAt = Date.now() + canvasTokenTtlMs
      return { ok: true, grant }
    } catch { return { ok: false } }
  }

  const boardForRequest = (url: URL, body: Record<string, unknown> | undefined): string | null => (
    typeof body?.name === 'string' ? body.name : url.searchParams.get('name')
  )

  const broadcast = async (root: string, event: Record<string, unknown>): Promise<void> => {
    let canonicalRoot: string
    try { canonicalRoot = await realpath(root) } catch { return }
    const payload = JSON.stringify(event)
    for (const [socket, socketRoot] of sockets) {
      if (socketRoot === canonicalRoot && socket.readyState === socket.OPEN) socket.send(payload)
    }
  }

  const server = createServer(async (req, res) => {
    lastActivity = Date.now()
    if (!loopback(req)) {
      writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'loopback-only' } })
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/health') {
      if (!safeEqual(bearer(req) ?? '', descriptor.token)) {
        writeJson(res, 401, { ok: false, error: { code: 'unauthorized', message: 'invalid bearer token' } })
        return
      }
      writeJson(res, 200, { ok: true, pid: process.pid, nonce: descriptor.nonce })
      return
    }
    if (url.pathname === '/rpc' && req.method === 'POST') {
      if (!safeEqual(bearer(req) ?? '', descriptor.token)) {
        writeJson(res, 401, { ok: false, error: { code: 'unauthorized', message: 'invalid bearer token' } })
        return
      }
      try {
        const body = await readJson(req)
        const context = body.context as HostContext
        const command = body.command as Draw2CodeCommand
        if (typeof context?.workspaceRoot !== 'string' || typeof command?.root !== 'string') throw new Error('invalid command or context')
        const canonicalWorkspace = await realpath(context.workspaceRoot)
        roots.add(canonicalWorkspace)
        const result = await runtime.execute(command, { ...context, workspaceRoot: canonicalWorkspace })
        writeJson(res, result.ok ? 200 : result.error.code === 'workspace-unknown' ? 403 : 400, result)
      } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: error instanceof Error ? error.message : String(error) } })
      }
      return
    }
    if (url.pathname === '/register' && req.method === 'POST') {
      if (!safeEqual(bearer(req) ?? '', descriptor.token)) {
        writeJson(res, 401, { ok: false, error: { code: 'unauthorized', message: 'invalid bearer token' } })
        return
      }
      try {
        const body = await readJson(req)
        const context = body.context as HostContext
        const root = await realpath(String(body.root ?? ''))
        const workspace = await realpath(context.workspaceRoot)
        if (root !== workspace && !root.startsWith(`${workspace}/`)) throw new Error('root is outside the host workspace')
        roots.add(workspace)
        writeJson(res, 200, { ok: true, root, workspaceRoot: workspace })
      } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: error instanceof Error ? error.message : String(error) } })
      }
      return
    }
    if (url.pathname === '/canvas-token' && req.method === 'POST') {
      if (!safeEqual(bearer(req) ?? '', descriptor.token)) {
        writeJson(res, 401, { ok: false, error: { code: 'unauthorized', message: 'invalid bearer token' } })
        return
      }
      try {
        const body = await readJson(req)
        const context = body.context as HostContext
        const root = await realpath(String(body.root ?? ''))
        const workspace = await realpath(context.workspaceRoot)
        if (root !== workspace && !root.startsWith(`${workspace}/`)) throw new Error('root is outside the host workspace')
        roots.add(workspace)
        const token = randomBytes(24).toString('base64url')
        const board = typeof body.board === 'string' ? body.board : null
        grants.set(token, { root, expiresAt: Date.now() + canvasTokenTtlMs })
        const query = new URLSearchParams({ root, token, ...(board === null ? {} : { board }) })
        writeJson(res, 200, { ok: true, token, expiresAt: grants.get(token)?.expiresAt, url: `http://127.0.0.1:${descriptor.port}/canvas?${query}` })
      } catch (error) {
        writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: error instanceof Error ? error.message : String(error) } })
      }
      return
    }
    if (url.pathname === '/canvas' && req.method === 'GET') {
      const root = url.searchParams.get('root')
      if (!(await authorize(req, root)).ok) {
        writeJson(res, 401, { ok: false, error: { code: 'unauthorized', message: 'invalid or expired canvas token' } })
        return
      }
      try {
        const html = await readFile(options.canvasHtmlPath, 'utf8')
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' ws:; img-src 'self' data: blob:",
        })
        res.end(html)
      } catch {
        writeJson(res, 503, { ok: false, error: { code: 'canvas-unavailable', message: 'canvas bundle is missing' } })
      }
      return
    }
    if (url.pathname.startsWith('/api/draw2code/')) {
      let body: Record<string, unknown> | undefined
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        try {
          body = await readJson(req)
          const encoded = Buffer.from(JSON.stringify(body))
          ;(req as IncomingMessage & { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] = async function* () { yield encoded }
        } catch (error) {
          writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: error instanceof Error ? error.message : String(error) } })
          return
        }
      }
      const root = requestRoot(req, body)
      const authorized = await authorize(req, root)
      if (!authorized.ok) {
        writeJson(res, 401, { ok: false, error: { code: 'unauthorized', message: 'invalid bearer or scoped token' } })
        return
      }
      const board = boardForRequest(url, body)
      const route = sceneRoutes.find((candidate) => candidate.path === url.pathname)
      if (route === undefined) {
        writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'route not found' } })
        return
      }
      await route.handler(req, res)
      if (root !== null && board !== null && (req.method === 'PUT' || req.method === 'POST')) {
        const latest = await new SceneStore(storeContext).read(root, board)
        if (latest.ok) {
          await broadcast(root, { type: 'scene.updated', root, board, revision: latest.value.rev, sourceClientId: 'canvas' })
        }
      }
      if (root !== null && board !== null && req.method === 'DELETE') {
        await broadcast(root, { type: 'board.deleted', root, board, revision: Date.now(), sourceClientId: 'canvas' })
      }
      if (root !== null && url.pathname === '/api/draw2code/active-board' && req.method === 'PUT' && typeof body?.name === 'string') {
        await broadcast(root, { type: 'active-board.changed', root, board: body.name, sourceClientId: 'canvas' })
      }
      return
    }
    writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'route not found' } })
  })

  const websocket = new WebSocketServer({ noServer: true })
  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const root = url.searchParams.get('root')
    const authorized = await authorize(req, root)
    if (url.pathname !== '/events' || !loopback(req) || !authorized.ok || root === null) {
      socket.destroy()
      return
    }
    let canonicalRoot: string
    try { canonicalRoot = await realpath(root) } catch { socket.destroy(); return }
    websocket.handleUpgrade(req, socket, head, (client) => {
      sockets.set(client, canonicalRoot)
      client.once('close', () => sockets.delete(client))
      client.send(JSON.stringify({ type: 'connected', root: canonicalRoot }))
    })
  })
  runtime.subscribe({} as HostContext, (event) => {
    void broadcast(event.root, event)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('daemon did not bind a TCP port')
  descriptor = await createDaemonDescriptor(options.descriptorPath, { pid: process.pid, port: address.port })

  const idleTimer = setInterval(() => {
    for (const [token, grant] of grants) if (grant.expiresAt < Date.now()) grants.delete(token)
    const idleMs = options.idleMs ?? 10 * 60_000
    if (sockets.size === 0 && Date.now() - lastActivity > idleMs) void close()
  }, 30_000)
  idleTimer.unref()

  const close = async (): Promise<void> => {
    clearInterval(idleTimer)
    for (const socket of sockets.keys()) socket.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    try {
      const current = JSON.parse(await readFile(options.descriptorPath, 'utf8')) as Partial<DaemonDescriptor>
      if (current.nonce === descriptor.nonce) await rm(options.descriptorPath, { force: true })
    } catch { /* already replaced or removed */ }
  }

  return { descriptor, close }
}
