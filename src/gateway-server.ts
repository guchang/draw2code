import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { chmod, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { URL } from 'node:url'
import WebSocket, { WebSocketServer } from 'ws'
import { GATEWAY_BOOTSTRAP_TTL_MS, GATEWAY_SESSION_COOKIE, GATEWAY_SESSION_TTL_MS } from './gateway-contract.ts'
import { createDaemonDescriptor, type DaemonDescriptor, type HostContext } from './runtime.ts'
import { isPathInside, sceneRequestBodyLimitBytes } from './scene-store.ts'
import { WorkspaceRegistry, defaultWorkspaceRegistryPath, isWorkspacePickerCandidate } from './workspace-registry.ts'

const MAX_CONTROL_BODY_BYTES = 2 * 1024 * 1024
const LARGE_BODY_PATHS = new Set(['/api/draw2code/scene/write', '/api/draw2code/export'])

interface WorkerGrant {
  nonce: string
  token: string
  expiresAt: number
  root: string
}

interface BootstrapRequest {
  root: string
  board: string | null
  context: HostContext
  expiresAt: number
}

interface GatewaySession {
  root: string
  board: string | null
  context: HostContext
  allowedRoots: string[]
  csrfToken: string
  selectionUpdatedAt: number
  expiresAt: number
  workerGrant?: WorkerGrant
}

interface GatewaySelection {
  root: string
  board: string | null
  clientId: string
  updatedAt: number
}

export interface StartedGateway {
  descriptor: DaemonDescriptor
  url: string
  close(): Promise<void>
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url')
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}

function bearer(req: IncomingMessage): string | null {
  const value = req.headers.authorization
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : null
}

function loopbackSameOrigin(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try { hostUrl = new URL(`http://${host}`) } catch { return false }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === hostUrl.host } catch { return false }
}

function cookie(req: IncomingMessage, name: string): string | null {
  const header = req.headers.cookie
  if (typeof header !== 'string') return null
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=') || null
  }
  return null
}

async function bodyBuffer(req: IncomingMessage, maxBytes = MAX_CONTROL_BODY_BYTES): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE') return undefined
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk as Uint8Array)
    size += buffer.length
    if (size > maxBytes) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function parsedBody(body: Buffer | undefined): Record<string, unknown> {
  if (body === undefined || body.length === 0) return {}
  const value: unknown = JSON.parse(body.toString('utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('request body must be an object')
  return value as Record<string, unknown>
}

function requestRoot(req: IncomingMessage, body: Record<string, unknown>): string | null {
  const queryRoot = new URL(req.url ?? '/', 'http://localhost').searchParams.get('root')
  if (queryRoot !== null) return queryRoot
  return typeof body.root === 'string' ? body.root : null
}

function emptyWorkspacePage(): string {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Draw2Code / 画码</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f6f8;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(420px,calc(100vw - 48px));padding:32px;border:1px solid #e5e7eb;border-radius:18px;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.08)}h1{margin:0 0 12px;font-size:24px}p{margin:0;color:#64748b;line-height:1.65}</style></head><body><main class="card"><h1>还没有画码工作区</h1><p>请先通过任一支持 Draw2Code 的本机工具登记工作区。登记后刷新此页即可直接进入。</p></main></body></html>'
}

function canvasHtml(source: string, session: GatewaySession): string {
  const config = JSON.stringify({
    root: session.root,
    board: session.board,
    viewId: session.context.clientId,
    csrfToken: session.csrfToken,
  }).replaceAll('<', '\\u003c')
  const script = `<script>window.__DRAW2CODE_BOOTSTRAP__=${config}</script>`
  return source.includes('<body>') ? source.replace('<body>', `<body>${script}`) : `${script}${source}`
}

export async function startGateway(options: {
  descriptorPath: string
  canvasHtmlPath: string
  ensureWorker: () => Promise<DaemonDescriptor>
  port: number
  sessionTtlMs?: number
  bootstrapTtlMs?: number
  workspaceRegistryPath?: string
  statePath?: string
}): Promise<StartedGateway> {
  const sessions = new Map<string, GatewaySession>()
  const bootstraps = new Map<string, BootstrapRequest>()
  const sessionTtlMs = options.sessionTtlMs ?? GATEWAY_SESSION_TTL_MS
  const bootstrapTtlMs = options.bootstrapTtlMs ?? GATEWAY_BOOTSTRAP_TTL_MS
  const maxSceneBodyBytes = sceneRequestBodyLimitBytes()
  const workspaceRegistryPath = options.workspaceRegistryPath ?? defaultWorkspaceRegistryPath()
  const workspaceRegistry = new WorkspaceRegistry(workspaceRegistryPath)
  const statePath = options.statePath ?? join(dirname(workspaceRegistryPath), 'gateway-state.json')
  let descriptor: DaemonDescriptor
  let closing = false

  const readSelection = async (): Promise<GatewaySelection | null> => {
    try {
      const value = JSON.parse(await readFile(statePath, 'utf8')) as Partial<GatewaySelection>
      if (typeof value.root !== 'string' || typeof value.clientId !== 'string') return null
      const root = await realpath(value.root)
      const registered = await workspaceRegistry.list()
      if (!registered.some((row) => row.path === root) || !isWorkspacePickerCandidate(root)) return null
      return {
        root,
        board: typeof value.board === 'string' ? value.board : null,
        clientId: value.clientId,
        updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : 0,
      }
    } catch { return null }
  }

  const writeSelection = async (selection: GatewaySelection): Promise<void> => {
    await mkdir(dirname(statePath), { recursive: true, mode: 0o700 })
    const temporary = `${statePath}.tmp-${process.pid}-${Date.now()}`
    await writeFile(temporary, `${JSON.stringify({ version: 1, ...selection }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, statePath)
    await chmod(statePath, 0o600)
  }

  const hasBoard = async (root: string): Promise<boolean> => {
    try { return (await readdir(join(root, 'draw2code'))).some((name) => name.endsWith('.excalidraw.json')) } catch { return false }
  }

  const fallbackSelection = async (): Promise<GatewaySelection | null> => {
    const rows = (await workspaceRegistry.list()).filter((row) => isWorkspacePickerCandidate(row.path))
    if (rows.length === 0) return null
    let temporaryRoot: string | null = null
    try { temporaryRoot = await realpath(tmpdir()) } catch { /* use registry order */ }
    const withBoards: typeof rows = []
    for (const row of rows) if (await hasBoard(row.path)) withBoards.push(row)
    const candidates = withBoards.length > 0 ? withBoards : rows
    const selected = candidates.find((row) => temporaryRoot === null || !isPathInside(temporaryRoot, row.path)) ?? candidates[0]
    const selection = {
      root: selected.path,
      board: null,
      clientId: `gateway-browser-${randomToken(12)}`,
      updatedAt: Date.now(),
    }
    await writeSelection(selection)
    return selection
  }

  const selectedWorkspace = async (): Promise<GatewaySelection | null> => await readSelection() ?? fallbackSelection()

  const workerFetch = async (worker: DaemonDescriptor, path: string, init: RequestInit = {}): Promise<Response> => await fetch(
    `http://127.0.0.1:${worker.port}${path}`,
    { ...init, headers: { ...Object.fromEntries(new Headers(init.headers).entries()), authorization: `Bearer ${worker.token}` } },
  )

  const issueWorkerGrant = async (session: GatewaySession): Promise<WorkerGrant> => {
    const worker = await options.ensureWorker()
    const response = await workerFetch(worker, '/canvas-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        root: session.root,
        board: session.board,
        context: { ...session.context, workspaceRoot: session.root },
      }),
    })
    const body = await response.json() as { ok?: boolean; token?: string; expiresAt?: number; error?: { message?: string } }
    if (!response.ok || body.ok !== true || body.token === undefined || body.expiresAt === undefined) {
      throw new Error(body.error?.message ?? 'worker did not issue a canvas grant')
    }
    const grant = { nonce: worker.nonce, token: body.token, expiresAt: body.expiresAt, root: session.root }
    session.workerGrant = grant
    return grant
  }

  const ensureWorkerGrant = async (session: GatewaySession): Promise<{ worker: DaemonDescriptor; grant: WorkerGrant }> => {
    const worker = await options.ensureWorker()
    const current = session.workerGrant
    if (current !== undefined && current.nonce === worker.nonce && current.root === session.root && current.expiresAt > Date.now()) {
      return { worker, grant: current }
    }
    return { worker, grant: await issueWorkerGrant(session) }
  }

  const refreshAllowedRoots = async (session: GatewaySession): Promise<void> => {
    const { worker, grant } = await ensureWorkerGrant(session)
    const response = await fetch(`http://127.0.0.1:${worker.port}/canvas-workspaces?root=${encodeURIComponent(session.root)}`, {
      headers: { authorization: `Bearer ${grant.token}` },
    })
    if (!response.ok) return
    const listed = await response.json() as { workspaces?: Array<{ root?: unknown }> }
    session.allowedRoots = (listed.workspaces ?? []).map((row) => row.root).filter((root): root is string => typeof root === 'string')
    if (!session.allowedRoots.includes(session.root)) session.allowedRoots.unshift(session.root)
  }

  const createSession = async (selection: GatewaySelection, context?: HostContext): Promise<GatewaySession> => {
    const session: GatewaySession = {
      root: selection.root,
      board: selection.board,
      context: context ?? {
        clientId: selection.clientId,
        host: 'mcp',
        workspaceRoot: selection.root,
        interactive: true,
        uiCapabilities: { mcpUi: false, externalBrowser: true },
      },
      allowedRoots: [selection.root],
      csrfToken: randomToken(24),
      selectionUpdatedAt: selection.updatedAt,
      expiresAt: Date.now() + sessionTtlMs,
    }
    await refreshAllowedRoots(session)
    return session
  }

  const sessionFor = (req: IncomingMessage): GatewaySession | null => {
    const id = cookie(req, GATEWAY_SESSION_COOKIE)
    if (id === null) return null
    const session = sessions.get(id)
    if (session === undefined || session.expiresAt < Date.now()) {
      sessions.delete(id)
      return null
    }
    session.expiresAt = Date.now() + sessionTtlMs
    return session
  }

  const csrfMatches = (req: IncomingMessage, session: GatewaySession): boolean => {
    const value = req.headers['x-draw2code-csrf']
    return typeof value === 'string' && safeEqual(value, session.csrfToken)
  }

  const canonicalRedirect = (req: IncomingMessage, url: URL): string | null => {
    const host = req.headers.host
    if (typeof host !== 'string') return null
    let parsed: URL
    try { parsed = new URL(`http://${host}`) } catch { return null }
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '[::1]') return null
    return new URL(`${url.pathname}${url.search}`, `http://127.0.0.1:${descriptor.port}`).toString()
  }

  const server = createServer(async (req, res) => {
    if (!loopbackSameOrigin(req)) {
      writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin loopback only' } })
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    const redirect = canonicalRedirect(req, url)
    if (redirect !== null) {
      res.writeHead(308, { location: redirect, 'cache-control': 'no-store' })
      res.end()
      return
    }

    if (url.pathname === '/gateway-health') {
      if (!safeEqual(bearer(req) ?? '', descriptor.token)) {
        writeJson(res, 401, { ok: false, error: { code: 'unauthorized', message: 'invalid bearer token' } })
        return
      }
      writeJson(res, 200, { ok: true, pid: process.pid, nonce: descriptor.nonce })
      return
    }

    if (url.pathname === '/bootstrap-code' && req.method === 'POST') {
      if (!safeEqual(bearer(req) ?? '', descriptor.token)) {
        writeJson(res, 401, { ok: false, error: { code: 'unauthorized', message: 'invalid bearer token' } })
        return
      }
      try {
        const body = parsedBody(await bodyBuffer(req))
        const context = body.context as HostContext
        const root = await realpath(String(body.root ?? ''))
        const workspaceRoot = await realpath(context?.workspaceRoot ?? '')
        if (!isPathInside(workspaceRoot, root) || typeof context?.clientId !== 'string') throw new Error('root is outside the host workspace')
        const code = randomToken()
        const expiresAt = Date.now() + bootstrapTtlMs
        bootstraps.set(code, { root, board: typeof body.board === 'string' ? body.board : null, context, expiresAt })
        const bootstrapUrl = `http://127.0.0.1:${descriptor.port}/bootstrap?code=${encodeURIComponent(code)}`
        writeJson(res, 200, { ok: true, url: bootstrapUrl, expiresAt })
      } catch {
        writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'workspace is invalid or outside the host workspace' } })
      }
      return
    }

    if (url.pathname === '/bootstrap' && req.method === 'GET') {
      const code = url.searchParams.get('code')
      const pending = code === null ? undefined : bootstraps.get(code)
      if (code !== null) bootstraps.delete(code)
      if (pending === undefined || pending.expiresAt < Date.now()) {
        writeJson(res, 410, { ok: false, error: { code: 'bootstrap-expired', message: 'connection link is invalid or already used' } })
        return
      }
      try {
        const selection = { root: pending.root, board: pending.board, clientId: pending.context.clientId, updatedAt: Date.now() }
        const session = await createSession(selection, pending.context)
        await writeSelection(selection)
        const id = randomToken(32)
        sessions.set(id, session)
        res.writeHead(302, {
          location: '/',
          'cache-control': 'no-store',
          'set-cookie': `${GATEWAY_SESSION_COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionTtlMs / 1000)}`,
        })
        res.end()
      } catch {
        writeJson(res, 503, { ok: false, error: { code: 'worker-unavailable', message: '画码后台尚未就绪，请稍后重试' } })
      }
      return
    }

    if (url.pathname === '/' && req.method === 'GET') {
      let session = sessionFor(req)
      let sessionId: string | null = null
      const selection = await selectedWorkspace()
      if (selection === null) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(emptyWorkspacePage())
        return
      }
      try {
        if (session === null || selection.updatedAt > session.selectionUpdatedAt) {
          session = await createSession(selection)
          sessionId = randomToken(32)
          sessions.set(sessionId, session)
        }
        await ensureWorkerGrant(session)
        const html = canvasHtml(await readFile(options.canvasHtmlPath, 'utf8'), session)
        session.board = null
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' ws:; img-src 'self' data: blob:",
          ...(sessionId === null ? {} : { 'set-cookie': `${GATEWAY_SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionTtlMs / 1000)}` }),
        })
        res.end(html)
      } catch {
        res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>画码正在连接</title><body><p>画码后台正在启动，请稍后刷新。</p></body></html>')
      }
      return
    }

    const session = sessionFor(req)
    if (session === null) {
      writeJson(res, 401, { ok: false, error: { code: 'unauthorized', message: '访问已过期，请刷新画码重新连接' } })
      return
    }

    if (url.pathname === '/canvas-workspace-token' && req.method === 'POST') {
      if (!csrfMatches(req, session)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'invalid same-origin request token' } })
        return
      }
      try {
        const body = parsedBody(await bodyBuffer(req))
        const root = await realpath(String(body.root ?? ''))
        const targetRoot = await realpath(String(body.targetRoot ?? ''))
        if (root !== session.root || !session.allowedRoots.includes(targetRoot)) {
          writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'target workspace is outside this session' } })
          return
        }
        const { worker, grant } = await ensureWorkerGrant(session)
        const switched = await fetch(`http://127.0.0.1:${worker.port}/canvas-workspace-token`, {
          method: 'POST',
          headers: { authorization: `Bearer ${grant.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ root, targetRoot }),
        })
        const result = await switched.json() as { ok?: boolean; token?: string; expiresAt?: number; error?: { code?: string; message?: string } }
        if (!switched.ok || result.ok !== true || result.token === undefined || result.expiresAt === undefined) {
          writeJson(res, switched.status, result)
          return
        }
        session.root = targetRoot
        session.board = null
        session.workerGrant = { nonce: worker.nonce, token: result.token, expiresAt: result.expiresAt, root: targetRoot }
        session.context = { ...session.context, workspaceRoot: targetRoot }
        session.selectionUpdatedAt = Date.now()
        await writeSelection({ root: targetRoot, board: null, clientId: session.context.clientId, updatedAt: session.selectionUpdatedAt })
        writeJson(res, 200, { ok: true, root: targetRoot, expiresAt: session.expiresAt, url: `http://127.0.0.1:${descriptor.port}/` })
      } catch {
        writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'workspace switch request is invalid' } })
      }
      return
    }

    if (url.pathname === '/canvas-workspaces' || url.pathname.startsWith('/api/draw2code/')) {
      let requestBody: Buffer | undefined
      let body: Record<string, unknown>
      let root: string | null
      try {
        requestBody = await bodyBuffer(req, LARGE_BODY_PATHS.has(url.pathname) ? maxSceneBodyBytes : MAX_CONTROL_BODY_BYTES)
        body = parsedBody(requestBody)
        root = requestRoot(req, body)
        if (root === null || await realpath(root) !== session.root) throw new Error('invalid workspace')
      } catch {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'workspace is invalid or outside this session' } })
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD' && !csrfMatches(req, session)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'invalid same-origin request token' } })
        return
      }
      try {
        const { worker, grant } = await ensureWorkerGrant(session)
        const upstream = await fetch(`http://127.0.0.1:${worker.port}${req.url ?? url.pathname}`, {
          method: req.method,
          headers: {
            authorization: `Bearer ${grant.token}`,
            ...(requestBody === undefined ? {} : { 'content-type': req.headers['content-type'] ?? 'application/json' }),
          },
          body: requestBody,
        })
        const responseBody = Buffer.from(await upstream.arrayBuffer())
        res.writeHead(upstream.status, {
          'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(responseBody)
      } catch {
        writeJson(res, 502, { ok: false, error: { code: 'worker-unavailable', message: '画码后台暂时不可用，请稍后重试' } })
      }
      return
    }

    writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'route not found' } })
  })

  const websocket = new WebSocketServer({ noServer: true })
  server.on('upgrade', async (req, socket, head) => {
    if (!loopbackSameOrigin(req)) { socket.destroy(); return }
    const url = new URL(req.url ?? '/', 'http://localhost')
    const session = sessionFor(req)
    if (url.pathname !== '/events' || session === null) { socket.destroy(); return }
    let root: string
    try { root = await realpath(url.searchParams.get('root') ?? '') } catch { socket.destroy(); return }
    if (root !== session.root) { socket.destroy(); return }
    try {
      const { worker, grant } = await ensureWorkerGrant(session)
      const upstreamUrl = new URL(`ws://127.0.0.1:${worker.port}/events`)
      upstreamUrl.searchParams.set('root', root)
      upstreamUrl.searchParams.set('token', grant.token)
      upstreamUrl.searchParams.set('clientId', session.context.clientId)
      const upstream = new WebSocket(upstreamUrl)
      websocket.handleUpgrade(req, socket, head, (browser) => {
        const pending: Array<string | Buffer> = []
        upstream.on('open', () => {
          for (const message of pending) upstream.send(message)
          pending.length = 0
        })
        browser.on('message', (message) => {
          const value = Buffer.from(message as Buffer)
          if (upstream.readyState === WebSocket.OPEN) upstream.send(value)
          else pending.push(value)
        })
        upstream.on('message', (message) => {
          if (browser.readyState === WebSocket.OPEN) browser.send(message)
        })
        const closeBoth = (): void => {
          if (browser.readyState === WebSocket.OPEN) browser.close()
          if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close()
        }
        browser.on('close', closeBoth)
        upstream.on('close', closeBoth)
        upstream.on('error', closeBoth)
      })
    } catch { socket.destroy() }
  })

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(options.port, '127.0.0.1', () => resolvePromise())
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('gateway did not bind a TCP port')
  descriptor = await createDaemonDescriptor(options.descriptorPath, { pid: process.pid, port: address.port })
  const url = `http://127.0.0.1:${descriptor.port}/`

  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [code, pending] of bootstraps) if (pending.expiresAt < now) bootstraps.delete(code)
    for (const [id, session] of sessions) if (session.expiresAt < now) sessions.delete(id)
  }, 60_000)
  cleanupTimer.unref()

  const close = async (): Promise<void> => {
    if (closing) return
    closing = true
    clearInterval(cleanupTimer)
    for (const client of websocket.clients) client.close()
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()))
    try {
      const current = JSON.parse(await readFile(options.descriptorPath, 'utf8')) as Partial<DaemonDescriptor>
      if (current.nonce === descriptor.nonce) await rm(options.descriptorPath, { force: true })
    } catch { /* already replaced or removed */ }
  }

  return { descriptor, url, close }
}
