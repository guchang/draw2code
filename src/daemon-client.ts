import { execFile, spawn } from 'node:child_process'
import { open, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

export class Draw2CodeDaemonClient {
  constructor(
    private readonly daemonEntry: string,
    private readonly canvasHtmlPath: string,
    private readonly descriptorPath = daemonDescriptorPath(),
  ) {}

  async ensure(): Promise<DaemonDescriptor> {
    const current = await validateDaemonDescriptor(this.descriptorPath)
    if (current !== null && await healthy(current)) return current
    await mkdir(daemonRuntimeDir(), { recursive: true, mode: 0o700 })
    await rm(this.descriptorPath, { force: true })
    const lockPath = `${this.descriptorPath}.lock`
    let lock: Awaited<ReturnType<typeof open>> | null = null
    try {
      lock = await open(lockPath, 'wx', 0o600)
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
    } finally {
      await lock?.close()
      if (lock !== null) await rm(lockPath, { force: true })
    }
    return waitForDescriptor(this.descriptorPath, 8_000)
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

  async openBrowser(url: string): Promise<void> {
    if (process.platform !== 'darwin') return
    await new Promise<void>((resolve, reject) => {
      execFile('/usr/bin/open', [url], (error) => error === null ? resolve() : reject(error))
    })
  }
}
