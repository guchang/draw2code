import { execFile, spawn } from 'node:child_process'
import { open, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { validateDaemonDescriptor, type DaemonDescriptor, type Draw2CodeCommand, type Draw2CodeResult, type HostContext } from './runtime.ts'

export function daemonRuntimeDir(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'user'
  return join(tmpdir(), `draw2code-${uid}`)
}

export function daemonDescriptorPath(): string {
  return process.env.DRAW2CODE_DESCRIPTOR_PATH ?? join(daemonRuntimeDir(), 'daemon.json')
}

async function healthy(descriptor: DaemonDescriptor): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/health`, {
      headers: { authorization: `Bearer ${descriptor.token}` },
      signal: AbortSignal.timeout(800),
    })
    const body = await response.json() as { ok?: boolean; nonce?: string }
    return response.ok && body.ok === true && body.nonce === descriptor.nonce
  } catch { return false }
}

async function waitForDescriptor(path: string, timeoutMs: number): Promise<DaemonDescriptor> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const descriptor = await validateDaemonDescriptor(path)
    if (descriptor !== null && await healthy(descriptor)) return descriptor
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('draw2code daemon did not become healthy')
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

export class Draw2CodeDaemonClient {
  constructor(
    private readonly daemonEntry: string,
    private readonly canvasHtmlPath: string,
    private readonly descriptorPath = daemonDescriptorPath(),
  ) {}

  async ensure(): Promise<DaemonDescriptor> {
    const current = await validateDaemonDescriptor(this.descriptorPath)
    if (current !== null && await healthy(current)) return current
    await mkdir(dirname(this.descriptorPath), { recursive: true, mode: 0o700 })
    await rm(this.descriptorPath, { force: true })
    const lockPath = `${this.descriptorPath}.lock`
    while (true) {
      let lock: Awaited<ReturnType<typeof open>> | null = null
      try {
        lock = await open(lockPath, 'wx', 0o600)
        await lock.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: Date.now() })}\n`)
        const child = spawn(process.execPath, [this.daemonEntry], {
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            DRAW2CODE_DESCRIPTOR_PATH: this.descriptorPath,
            DRAW2CODE_CANVAS_HTML: this.canvasHtmlPath,
          },
        })
        child.unref()
        return await waitForDescriptor(this.descriptorPath, 8_000)
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
      return waitForDescriptor(this.descriptorPath, 8_000)
    }
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
