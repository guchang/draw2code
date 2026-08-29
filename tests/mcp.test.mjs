import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

import { validateDaemonDescriptor } from '../dist/runtime.js'

function protocolClient(child, root) {
  let buffer = ''
  const pending = new Map()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line.trim() === '') continue
      const message = JSON.parse(line)
      if (message.method === 'roots/list' && message.id !== undefined) {
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { roots: [{ uri: new URL(`file://${root}`).href, name: 'test workspace' }] } })}\n`)
        continue
      }
      if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)(message)
        pending.delete(message.id)
      }
    }
  })
  let id = 0
  return {
    notify(method, params = {}) { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`) },
    request(method, params = {}) {
      const requestId = ++id
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`)
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${method} timed out`)) }, 5000)
        pending.set(requestId, (message) => { clearTimeout(timer); resolve(message) })
      })
    },
  }
}

test('stdio MCP advertises six stable tools and calls the shared daemon', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'draw2code-mcp-workspace-'))
  const runtime = await mkdtemp(join(tmpdir(), 'draw2code-mcp-runtime-'))
  const descriptorPath = join(runtime, 'daemon.json')
  const child = spawn(process.execPath, [resolve('dist/draw2code-mcp.js')], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DRAW2CODE_WORKSPACE_ROOT: root, DRAW2CODE_DESCRIPTOR_PATH: descriptorPath, DRAW2CODE_HEADLESS: '1' },
  })
  t.after(async () => {
    child.kill('SIGTERM')
    const descriptor = await validateDaemonDescriptor(descriptorPath)
    if (descriptor !== null) try { process.kill(descriptor.pid, 'SIGTERM') } catch { /* already stopped */ }
  })
  const client = protocolClient(child, root)
  const initialized = await client.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'draw2code-test', version: '1.0.0' },
  })
  assert.equal(initialized.result.serverInfo.name, 'draw2code')
  client.notify('notifications/initialized')

  const listed = await client.request('tools/list')
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    'draw2code_list',
    'draw2code_read',
    'draw2code_create',
    'draw2code_update',
    'draw2code_generate',
    'draw2code_open',
  ])
  const open = listed.result.tools.find((tool) => tool.name === 'draw2code_open')
  assert.equal(open._meta.ui.resourceUri, 'ui://draw2code/canvas.html')
  const generate = listed.result.tools.find((tool) => tool.name === 'draw2code_generate')
  assert.ok(generate.inputSchema.properties.pages)
  assert.ok(generate.inputSchema.properties.frames)
  assert.ok(generate.inputSchema.properties.styleNote)
  assert.ok(generate.inputSchema.properties.referenceStyle)
  assert.ok(generate.inputSchema.properties.board)
  assert.equal(generate.inputSchema.properties.name, undefined)
  assert.deepEqual(generate.inputSchema.properties.action.enum, [
    'start', 'answer', 'revise', 'resume', 'recheck', 'confirm', 'complete', 'abandon',
  ])

  const called = await client.request('tools/call', { name: 'draw2code_list', arguments: { root } })
  assert.equal(called.result.structuredContent.ok, true)
  assert.deepEqual(called.result.structuredContent.data.scenes, [])

  const nested = join(root, 'nested-repository')
  await mkdir(nested)
  const updatedFromNested = await client.request('tools/call', {
    name: 'draw2code_update',
    arguments: {
      root: nested,
      board: '共享画板',
      ops: [{ op: 'upsert', element: { id: 'shared-title', type: 'text', text: '跨宿主共享' } }],
    },
  })
  assert.equal(updatedFromNested.result.structuredContent.ok, true)
  const listedFromWorkspace = await client.request('tools/call', { name: 'draw2code_list', arguments: { root } })
  assert.deepEqual(listedFromWorkspace.result.structuredContent.data.scenes.map((scene) => scene.name), ['共享画板'])

  const openedForHostSidebar = await client.request('tools/call', {
    name: 'draw2code_open',
    arguments: { root, board: '共享画板', presentation: 'handoff' },
  })
  assert.equal(openedForHostSidebar.result.structuredContent.ok, true)
  assert.equal(openedForHostSidebar.result.structuredContent.data.board, '共享画板')
  assert.equal(openedForHostSidebar.result.structuredContent.data.presentation, 'handoff')
  assert.equal(openedForHostSidebar.result.structuredContent.data.displayState, 'handoff-ready')
  assert.equal(openedForHostSidebar.result.structuredContent.data.opened, false)
  assert.equal(new URL(openedForHostSidebar.result.structuredContent.data.url).searchParams.get('board'), '共享画板')
})

test('stdio MCP does not report a canvas opened when no browser launcher exists', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'draw2code-mcp-browser-workspace-'))
  const runtime = await mkdtemp(join(tmpdir(), 'draw2code-mcp-browser-runtime-'))
  const descriptorPath = join(runtime, 'daemon.json')
  const preload = join(runtime, 'unsupported-platform.cjs')
  await writeFile(preload, "Object.defineProperty(process, 'platform', { value: 'aix' })\n")
  const child = spawn(process.execPath, [resolve('dist/draw2code-mcp.js')], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${preload}`.trim(),
      DRAW2CODE_WORKSPACE_ROOT: root,
      DRAW2CODE_DESCRIPTOR_PATH: descriptorPath,
      DRAW2CODE_HEADLESS: '0',
    },
  })
  t.after(async () => {
    child.kill('SIGTERM')
    const descriptor = await validateDaemonDescriptor(descriptorPath)
    if (descriptor !== null) try { process.kill(descriptor.pid, 'SIGTERM') } catch { /* already stopped */ }
  })
  const client = protocolClient(child, root)
  await client.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'draw2code-browser-test', version: '1.0.0' },
  })
  client.notify('notifications/initialized')

  const opened = await client.request('tools/call', {
    name: 'draw2code_open',
    arguments: { root, presentation: 'browser' },
  })
  assert.equal(opened.result.structuredContent.ok, true)
  assert.equal(opened.result.structuredContent.data.opened, false)
  assert.equal(opened.result.structuredContent.data.displayState, 'url-ready')
})
