import { execFile, spawn } from 'node:child_process'
import { open, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_GATEWAY_PORT } from './gateway-contract.ts'
import { validateDaemonDescriptor, type DaemonDescriptor, type Draw2CodeCommand, type Draw2CodeResult, type HostContext } from './runtime.ts'

export function daemonRuntimeDir(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'user'
  return join(tmpdir(), `draw2code-${uid}`)
}

export function daemonDescriptorPath(): string {
  return process.env.DRAW2CODE_DESCRIPTOR_PATH ?? join(daemonRuntimeDir(), 'daemon.json')
}

export function gatewayDescriptorPath(): string {
  return process.env.DRAW2CODE_GATEWAY_DESCRIPTOR_PATH ?? join(daemonRuntimeDir(), 'gateway.json')
}

async function healthyAt(descriptor: DaemonDescriptor, path: string): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${descriptor.port}${path}`, {
      headers: { authorization: `Bearer ${descriptor.token}` },
      signal: AbortSignal.timeout(800),
    })
    const body = await response.json() as { ok?: boolean; nonce?: string }
    return response.ok && body.ok === true && body.nonce === descriptor.nonce
  } catch { return false }
}

async function portIsOccupied(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (occupied: boolean) => {
      socket.destroy()
      resolve(occupied)
    }
    socket.setTimeout(300)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
  })
}

async function waitForDescriptor(path: string, timeoutMs: number, healthPath: string): Promise<DaemonDescriptor> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const descriptor = await validateDaemonDescriptor(path)
    if (descriptor !== null && await healthyAt(descriptor, healthPath)) return descriptor
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`draw2code ${healthPath === '/health' ? 'daemon' : 'gateway'} did not become healthy`)
}

async function staleStartupLock(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    let owner: { pid?: unknown } = {}
    try {
      owner = JSON.parse(await readFile(path, 'utf8')) as { pid?: unknown }
    } catch {
      return Date.now() - info.mtimeMs > 8_000
    }
    if (Number.isInteger(owner.pid) && Number(owner.pid) > 0) {
      try {
        process.kill(Number(owner.pid), 0)
        return false
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true
        return false
      }
    }
    return Date.now() - info.mtimeMs > 8_000
  } catch {
    return false
  }
}

async function ensureDetachedProcess(options: {
  descriptorPath: string
  healthPath: string
  entry: string
  env: NodeJS.ProcessEnv
}): Promise<DaemonDescriptor> {
  const current = await validateDaemonDescriptor(options.descriptorPath)
  if (current !== null && await healthyAt(current, options.healthPath)) return current
  await mkdir(dirname(options.descriptorPath), { recursive: true, mode: 0o700 })
  await rm(options.descriptorPath, { force: true })
  const lockPath = `${options.descriptorPath}.lock`
  while (true) {
    let lock: Awaited<ReturnType<typeof open>> | null = null
    try {
      lock = await open(lockPath, 'wx', 0o600)
      await lock.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: Date.now() })}\n`)
      const child = spawn(process.execPath, [options.entry], {
        detached: true,
        stdio: 'ignore',
        env: options.env,
      })
      child.unref()
      return await waitForDescriptor(options.descriptorPath, 8_000, options.healthPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (await staleStartupLock(lockPath)) {
        await rm(lockPath, { force: true })
        continue
      }
    } finally {
      await lock?.close()
      if (lock !== null) await rm(lockPath, { force: true })
    }
    return waitForDescriptor(options.descriptorPath, 8_000, options.healthPath)
  }
}

export async function ensureDaemonProcess(
  daemonEntry: string,
  canvasHtmlPath: string,
  descriptorPath = daemonDescriptorPath(),
): Promise<DaemonDescriptor> {
  return await ensureDetachedProcess({
    descriptorPath,
    healthPath: '/health',
    entry: daemonEntry,
    env: {
      ...process.env,
      DRAW2CODE_DESCRIPTOR_PATH: descriptorPath,
      DRAW2CODE_CANVAS_HTML: canvasHtmlPath,
    },
  })
}

export class Draw2CodeDaemonClient {
  constructor(
    private readonly daemonEntry: string,
    private readonly canvasHtmlPath: string,
    private readonly descriptorPath = daemonDescriptorPath(),
    private readonly gatewayEntry = join(dirname(daemonEntry), 'draw2code-gateway.js'),
    private readonly gatewayPath = gatewayDescriptorPath(),
  ) {}

  async ensure(): Promise<DaemonDescriptor> {
    return await ensureDaemonProcess(this.daemonEntry, this.canvasHtmlPath, this.descriptorPath)
  }

  async ensureGateway(): Promise<DaemonDescriptor> {
    const configuredPort = Number(process.env.DRAW2CODE_GATEWAY_PORT)
    const port = Number.isInteger(configuredPort) && configuredPort >= 0 && configuredPort <= 65_535 ? configuredPort : DEFAULT_GATEWAY_PORT
    const current = await validateDaemonDescriptor(this.gatewayPath)
    if (current !== null && await healthyAt(current, '/gateway-health')) return current
    if (port > 0 && await portIsOccupied(port)) {
      throw new Error(`draw2code gateway port ${port} is already in use; stop the conflicting service or set DRAW2CODE_GATEWAY_PORT`)
    }
    return await ensureDetachedProcess({
      descriptorPath: this.gatewayPath,
      healthPath: '/gateway-health',
      entry: this.gatewayEntry,
      env: {
        ...process.env,
        DRAW2CODE_GATEWAY_DESCRIPTOR_PATH: this.gatewayPath,
        DRAW2CODE_GATEWAY_PORT: String(port),
        DRAW2CODE_DESCRIPTOR_PATH: this.descriptorPath,
        DRAW2CODE_DAEMON_ENTRY: this.daemonEntry,
        DRAW2CODE_CANVAS_HTML: this.canvasHtmlPath,
      },
    })
  }

  async execute(command: Draw2CodeCommand, context: HostContext): Promise<Draw2CodeResult> {
    const descriptor = await this.ensure()
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/rpc`, {
      method: 'POST',
      headers: { authorization: `Bearer ${descriptor.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ command, context }),
    })
    return await response.json() as Draw2CodeResult
  }

  async registerWorkspace(root: string, context: HostContext): Promise<void> {
    const descriptor = await this.ensure()
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/register`, {
      method: 'POST',
      headers: { authorization: `Bearer ${descriptor.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ root, context }),
    })
    if (!response.ok) {
      const body = await response.json() as { error?: { message?: string } }
      throw new Error(body.error?.message ?? 'failed to register workspace')
    }
  }

  async proxy(path: string, init: { method: string; body?: Buffer }): Promise<{ status: number; headers: Headers; body: Buffer }> {
    const descriptor = await this.ensure()
    const response = await fetch(`http://127.0.0.1:${descriptor.port}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: init.body,
    })
    return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) }
  }

  async canvas(root: string, board: string | null, context: HostContext): Promise<{ url: string; token: string; expiresAt: number }> {
    const descriptor = await this.ensure()
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/canvas-token`, {
      method: 'POST',
      headers: { authorization: `Bearer ${descriptor.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ root, board, context }),
    })
    const body = await response.json() as { ok?: boolean; url?: string; token?: string; expiresAt?: number; error?: { message?: string } }
    if (!response.ok || body.ok !== true || body.url === undefined || body.token === undefined || body.expiresAt === undefined) {
      throw new Error(body.error?.message ?? 'failed to create canvas URL')
    }
    return { url: body.url, token: body.token, expiresAt: body.expiresAt }
  }

  async stableCanvas(root: string, board: string | null, context: HostContext): Promise<{ url: string; expiresAt: number }> {
    await this.ensure()
    const gateway = await this.ensureGateway()
    const response = await fetch(`http://127.0.0.1:${gateway.port}/bootstrap-code`, {
      method: 'POST',
      headers: { authorization: `Bearer ${gateway.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ root, board, context }),
    })
    const body = await response.json() as { ok?: boolean; url?: string; expiresAt?: number; error?: { message?: string } }
    if (!response.ok || body.ok !== true || body.url === undefined || body.expiresAt === undefined) {
      throw new Error(body.error?.message ?? 'failed to create stable canvas URL')
    }
    return { url: body.url, expiresAt: body.expiresAt }
  }

  async openBrowser(url: string): Promise<boolean> {
    const launcher = process.platform === 'darwin'
      ? { command: '/usr/bin/open', args: [url] }
      : process.platform === 'linux'
        ? { command: 'xdg-open', args: [url] }
        : process.platform === 'win32'
          ? { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] }
          : null
    if (launcher === null) return false
    return await new Promise<boolean>((resolve) => {
      execFile(launcher.command, launcher.args, (error) => resolve(error === null))
    })
  }
}
