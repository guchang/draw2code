/**
 * The /api/draw2code/* route family: scene list / read / write / create /
 * delete for the browser canvas. Every route carries the loopback-only trust
 * fence (plus browser same-origin markers) — scene files are real workspace
 * files, so LAN-exposed dsh web deployments must not serve these.
 * @module dsh-draw2code/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { SceneStore } from './scene-store.ts'

/** Cap on JSON request bodies (whole scenes are under it). */
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024

/** Run one native command without a shell and capture its output. */
function runNative(command: string, args: string[]): Promise<{ stdout: string; stderr: string; code?: string | number }> {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error !== null) {
        resolve({ stdout, stderr, code: (error as NodeJS.ErrnoException).code })
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

/** Open the host's native save dialog and return the selected absolute path. */
async function chooseExportPath(defaultName: string): Promise<string | null> {
  if (process.platform !== 'darwin') throw new Error(`native export is unsupported on ${process.platform}`)
  const script = [
    "ObjC.import('Cocoa')",
    'function run(argv) {',
    '  const panel = $.NSSavePanel.savePanel',
    '  panel.title = "导出画板"',
    '  panel.nameFieldStringValue = argv[0] || "prototype.excalidraw"',
    '  panel.canCreateDirectories = true',
    '  if (panel.runModal() !== $.NSModalResponseOK) return ""',
    '  return ObjC.unwrap(panel.URL.path)',
    '}',
  ].join('\n')
  const result = await runNative('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, defaultName])
  const output = result.stdout.trim()
  const cancelled = result.code === -128 || result.code === '-128' || /user canceled|用户(?:已)?取消/i.test(`${result.stderr} ${result.stdout}`)
  if (cancelled) return null
  if (result.code !== undefined) {
    throw new Error(result.stderr.trim() || 'native save dialog failed')
  }
  if (output === '') return null
  return output
}

/** Loopback literal check plus browser same-origin markers. */
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

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(json)
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_JSON_BODY_BYTES) throw new Error('request body too large')
    chunks.push(chunk as Buffer)
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof parsed !== 'object' || parsed === null) throw new Error('request body must be a JSON object')
  return parsed as Record<string, unknown>
}

/** Render a store result into the response envelope. */
function respond<T>(res: ServerResponse, result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): void {
  if (result.ok) {
    writeJson(res, 200, { ok: true, ...result.value })
  } else {
    const status = result.error.code === 'conflict' ? 409
      : result.error.code === 'not-found' || result.error.code === 'workspace-unknown' ? 404
      : 400
    writeJson(res, status, { ok: false, error: result.error })
  }
}

/**
 * Build the route family against one scene store.
 * @param store - the workspace-gated scene store.
 * @returns the WebRoute array to register on the shared webserver.
 */
export function makeRoutes(store: SceneStore): WebRoute[] {
  const guard = (req: IncomingMessage, res: ServerResponse, method: string): boolean => {
    if (req.method !== method) {
      writeJson(res, 405, { ok: false, error: { code: 'method', message: `method not allowed: ${req.method}` } })
      return false
    }
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'loopback-only' } })
      return false
    }
    return true
  }

  const query = (req: IncomingMessage, key: string): string | undefined => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const value = url.searchParams.get(key)
    return value === null ? undefined : value
  }

  return [
    // -------------------------------------------------- scenes (list)
    {
      kind: 'exact',
      path: '/api/draw2code/scenes',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const root = query(req, 'root')
        if (root === undefined) {
          writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'missing root' } })
          return
        }
        const result = await store.list(root)
        // The store value is a bare array — respond() spreads objects, so the
        // list envelope is shaped here explicitly.
        if (result.ok) writeJson(res, 200, { ok: true, scenes: result.value })
        else respond(res, result)
      },
    },
    // --------------------------------------------- active board (shared UI state)
    {
      kind: 'exact',
      path: '/api/draw2code/active-board',
      handler: async (req, res) => {
        const method = req.method ?? ''
        if (method === 'GET') {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'loopback-only' } })
            return
          }
          const root = query(req, 'root')
          if (root === undefined) {
            writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'missing root' } })
            return
          }
          respond(res, await store.getActiveBoard(root))
          return
        }
        if (method === 'PUT') {
          if (!guard(req, res, 'PUT')) return
          try {
            const body = await readJsonBody(req)
            respond(res, await store.setActiveBoard(String(body.root ?? ''), String(body.name ?? '')))
          } catch (error) {
            writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: error instanceof Error ? error.message : String(error) } })
          }
          return
        }
        writeJson(res, 405, { ok: false, error: { code: 'method', message: `method not allowed: ${method}` } })
      },
    },
    // ---------------------------------------- verified update reveal request
    {
      kind: 'exact',
      path: '/api/draw2code/reveal-request',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const root = query(req, 'root')
        if (root === undefined) {
          writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'missing root' } })
          return
        }
        respond(res, await store.getBoardReveal(root))
      },
    },
    // -------------------------------------------------- scene (read / create / delete)
    {
      kind: 'exact',
      path: '/api/draw2code/scene',
      handler: async (req, res) => {
        const method = req.method ?? ''
        if (method === 'GET') {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'loopback-only' } })
            return
          }
          const root = query(req, 'root')
          const name = query(req, 'name')
          if (root === undefined || name === undefined) {
            writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'missing root or name' } })
            return
          }
          const result = await store.read(root, name)
          if (result.ok) {
            writeJson(res, 200, { ok: true, rev: result.value.rev, scene: result.value.scene })
          } else {
            respond(res, result)
          }
          return
        }
        if (method === 'POST') {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'loopback-only' } })
            return
          }
          try {
            const body = await readJsonBody(req)
            respond(res, await store.create(String(body.root ?? ''), String(body.name ?? '')))
          } catch (error) {
            writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: error instanceof Error ? error.message : String(error) } })
          }
          return
        }
        if (method === 'DELETE') {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'loopback-only' } })
            return
          }
          const root = query(req, 'root')
          const name = query(req, 'name')
          if (root === undefined || name === undefined) {
            writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'missing root or name' } })
            return
          }
          respond(res, await store.remove(root, name))
          return
        }
        writeJson(res, 405, { ok: false, error: { code: 'method', message: `method not allowed: ${method}` } })
      },
    },
    // -------------------------------------------------- scene (write whole)
    {
      kind: 'exact',
      path: '/api/draw2code/scene/write',
      handler: async (req, res) => {
        if (!guard(req, res, 'PUT')) return
        try {
          const body = await readJsonBody(req)
          const baseRev = typeof body.baseRev === 'number' ? body.baseRev : undefined
          respond(res, await store.write(String(body.root ?? ''), String(body.name ?? ''), body.scene, baseRev))
        } catch (error) {
          writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: error instanceof Error ? error.message : String(error) } })
        }
      },
    },
    // -------------------------------------------------- versions (list / restore)
    {
      kind: 'exact',
      path: '/api/draw2code/versions',
      handler: async (req, res) => {
        if (!guard(req, res, 'GET')) return
        const root = query(req, 'root')
        const name = query(req, 'name')
        if (root === undefined || name === undefined) {
          writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: 'missing root or name' } })
          return
        }
        const result = await store.listVersions(root, name)
        if (result.ok) writeJson(res, 200, { ok: true, versions: result.value })
        else respond(res, result)
      },
    },
    {
      kind: 'exact',
      path: '/api/draw2code/restore',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        try {
          const body = await readJsonBody(req)
          respond(res, await store.restoreVersion(String(body.root ?? ''), String(body.name ?? ''), String(body.id ?? '')))
        } catch (error) {
          writeJson(res, 400, { ok: false, error: { code: 'bad-request', message: error instanceof Error ? error.message : String(error) } })
        }
      },
    },
    // -------------------------------------------------- scene export
    {
      kind: 'exact',
      path: '/api/draw2code/export',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        try {
          const body = await readJsonBody(req)
          if (typeof body.scene !== 'object' || body.scene === null || !Array.isArray((body.scene as { elements?: unknown }).elements)) {
            writeJson(res, 400, { ok: false, error: { code: 'bad-scene', message: 'scene.elements must be an array' } })
            return
          }
          const json = JSON.stringify(body.scene, null, 2)
          if (typeof json !== 'string' || Buffer.byteLength(json) > MAX_JSON_BODY_BYTES) {
            writeJson(res, 400, { ok: false, error: { code: 'too-large', message: 'scene exceeds export size limit' } })
            return
          }
          const defaultName = typeof body.filename === 'string' && body.filename.trim() !== ''
            ? body.filename.trim()
            : 'prototype.excalidraw'
          const selectedPath = await chooseExportPath(defaultName)
          if (selectedPath === null) {
            writeJson(res, 200, { ok: true, cancelled: true })
            return
          }
          await writeFile(selectedPath, `${json}\n`, 'utf8')
          writeJson(res, 200, { ok: true, exported: true, path: selectedPath })
        } catch (error) {
          writeJson(res, 500, { ok: false, error: { code: 'export-failed', message: error instanceof Error ? error.message : String(error) } })
        }
      },
    },
  ]
}
