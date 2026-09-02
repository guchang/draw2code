import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import test from 'node:test'

import { validateDaemonDescriptor } from '../dist/runtime.js'

function protocolClient(child, root, advertiseRoot = true, respondToRoots = true) {
  let buffer = ''
  const pending = new Map()
  let rootsRequested = 0
  let resolveRootsRequest
  const firstRootsRequest = new Promise((resolve) => { resolveRootsRequest = resolve })
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
        rootsRequested += 1
        resolveRootsRequest()
        if (!respondToRoots) continue
        const roots = advertiseRoot ? [{ uri: new URL(`file://${root}`).href, name: 'test workspace' }] : []
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { roots } })}\n`)
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
    rootsRequestCount() { return rootsRequested },
    async waitForRootsRequest() {
      await Promise.race([
        firstRootsRequest,
        new Promise((_, reject) => setTimeout(() => reject(new Error('roots/list was not requested')), 1000)),
      ])
    },
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
    env: { ...process.env, DRAW2CODE_WORKSPACE_ROOT: root, DRAW2CODE_DESCRIPTOR_PATH: descriptorPath, DRAW2CODE_WORKSPACE_REGISTRY_PATH: join(runtime, 'workspaces.json'), DRAW2CODE_HEADLESS: '1' },
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
  assert.equal(open._meta?.ui?.resourceUri, undefined)
  assert.equal(open._meta?.['openai/outputTemplate'], undefined)
  assert.deepEqual(open.annotations, {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  })
  const generate = listed.result.tools.find((tool) => tool.name === 'draw2code_generate')
  const read = listed.result.tools.find((tool) => tool.name === 'draw2code_read')
  const update = listed.result.tools.find((tool) => tool.name === 'draw2code_update')
  assert.deepEqual(read.inputSchema.properties.detail.enum, ['index', 'full'])
  assert.ok(read.inputSchema.properties.pageIds)
  assert.ok(read.inputSchema.properties.elementIds)
  assert.ok(read.inputSchema.properties.region)
  assert.ok(read.inputSchema.properties.changesSince)
  assert.deepEqual(update.inputSchema.properties.action.enum, ['write', 'review', 'commit_pending'])
  assert.ok(update.inputSchema.properties.reviewToken)
  assert.ok(update.inputSchema.properties.phase)
  assert.ok(update.inputSchema.properties.pendingUpdateId)
  assert.equal(update.inputSchema.required?.includes('ops') ?? false, false)
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
  const scopedRead = await client.request('tools/call', {
    name: 'draw2code_read',
    arguments: { root, board: '共享画板', elementIds: ['shared-title'] },
  })
  assert.equal(scopedRead.result.structuredContent.ok, true)
  assert.deepEqual(scopedRead.result.structuredContent.data.elements.map((element) => element.id), ['shared-title'])
  const listedFromWorkspace = await client.request('tools/call', { name: 'draw2code_list', arguments: { root } })
  assert.deepEqual(listedFromWorkspace.result.structuredContent.data.scenes.map((scene) => scene.name), ['共享画板'])

  const openedForHostSidebar = await client.request('tools/call', {
    name: 'draw2code_open',
    arguments: { root, board: '共享画板' },
  })
  assert.equal(openedForHostSidebar.result.structuredContent.ok, true)
  assert.equal(openedForHostSidebar.result.structuredContent.data.board, '共享画板')
  assert.equal(openedForHostSidebar.result.structuredContent.data.presentation, 'handoff')
  assert.equal(openedForHostSidebar.result.structuredContent.data.displayState, 'handoff-ready')
  assert.equal(openedForHostSidebar.result.structuredContent.data.opened, false)
  assert.equal(new URL(openedForHostSidebar.result.structuredContent.data.url).searchParams.get('board'), '共享画板')

  const openedFromLegacyInlineRequest = await client.request('tools/call', {
    name: 'draw2code_open',
    arguments: { root, board: '共享画板', presentation: 'inline' },
  })
  assert.equal(openedFromLegacyInlineRequest.result.structuredContent.data.presentation, 'handoff')
  assert.equal(openedFromLegacyInlineRequest.result.structuredContent.data.displayState, 'handoff-ready')
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
      DRAW2CODE_WORKSPACE_REGISTRY_PATH: join(runtime, 'workspaces.json'),
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

test('stdio MCP falls back to the requested root when the host advertises no roots', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'draw2code-mcp-requested-root-'))
  const runtime = await mkdtemp(join(tmpdir(), 'draw2code-mcp-requested-runtime-'))
  const pluginCwd = await mkdtemp(join(tmpdir(), 'draw2code-mcp-plugin-cwd-'))
  const descriptorPath = join(runtime, 'daemon.json')
  const child = spawn(process.execPath, [resolve('dist/draw2code-mcp.js')], {
    cwd: pluginCwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DRAW2CODE_WORKSPACE_ROOT: '',
      DRAW2CODE_DESCRIPTOR_PATH: descriptorPath,
      DRAW2CODE_WORKSPACE_REGISTRY_PATH: join(runtime, 'workspaces.json'),
      DRAW2CODE_HEADLESS: '1',
    },
  })
  t.after(async () => {
    child.kill('SIGTERM')
    const descriptor = await validateDaemonDescriptor(descriptorPath)
    if (descriptor !== null) try { process.kill(descriptor.pid, 'SIGTERM') } catch { /* already stopped */ }
  })
  const client = protocolClient(child, root, false)
  await client.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'draw2code-no-roots-test', version: '1.0.0' },
  })
  client.notify('notifications/initialized')

  const opened = await client.request('tools/call', {
    name: 'draw2code_open',
    arguments: { root, presentation: 'handoff' },
  })
  assert.equal(opened.result.structuredContent.ok, true)
  assert.equal(new URL(opened.result.structuredContent.data.url).searchParams.get('root'), await realpath(root))
})

test('stdio MCP opens a configured workspace when the host roots service is unavailable', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'draw2code-mcp-configured-root-'))
  const runtime = await mkdtemp(join(tmpdir(), 'draw2code-mcp-configured-runtime-'))
  const descriptorPath = join(runtime, 'daemon.json')
  const child = spawn(process.execPath, [resolve('dist/draw2code-mcp.js')], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DRAW2CODE_WORKSPACE_ROOT: root,
      DRAW2CODE_DESCRIPTOR_PATH: descriptorPath,
      DRAW2CODE_WORKSPACE_REGISTRY_PATH: join(runtime, 'workspaces.json'),
      DRAW2CODE_HEADLESS: '1',
    },
  })
  t.after(async () => {
    child.kill('SIGTERM')
    const descriptor = await validateDaemonDescriptor(descriptorPath)
    if (descriptor !== null) try { process.kill(descriptor.pid, 'SIGTERM') } catch { /* already stopped */ }
  })
  const client = protocolClient(child, root, true, false)
  await client.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'draw2code-unavailable-roots-test', version: '1.0.0' },
  })
  client.notify('notifications/initialized')

  const opened = await client.request('tools/call', {
    name: 'draw2code_open',
    arguments: { root, presentation: 'handoff' },
  })
  assert.equal(opened.result.structuredContent.ok, true)
  assert.equal(new URL(opened.result.structuredContent.data.url).searchParams.get('root'), await realpath(root))
})

test('stdio MCP prewarms advertised roots before the first tool call', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'draw2code-mcp-prewarm-root-'))
  const runtime = await mkdtemp(join(tmpdir(), 'draw2code-mcp-prewarm-runtime-'))
  const descriptorPath = join(runtime, 'daemon.json')
  const child = spawn(process.execPath, [resolve('dist/draw2code-mcp.js')], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DRAW2CODE_WORKSPACE_ROOT: '',
      DRAW2CODE_DESCRIPTOR_PATH: descriptorPath,
      DRAW2CODE_WORKSPACE_REGISTRY_PATH: join(runtime, 'workspaces.json'),
      DRAW2CODE_HEADLESS: '1',
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
    capabilities: { roots: {} },
    clientInfo: { name: 'draw2code-roots-prewarm-test', version: '1.0.0' },
  })
  client.notify('notifications/initialized')

  await client.waitForRootsRequest()
  assert.equal(client.rootsRequestCount(), 1)

  const daemon = await Promise.race([
    (async () => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const descriptor = await validateDaemonDescriptor(descriptorPath)
        if (descriptor !== null) return descriptor
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error('daemon was not prewarmed after MCP initialization')
    })(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('daemon prewarm timed out')), 2500)),
  ])
  assert.ok(daemon.port > 0)
  const health = await fetch(`http://127.0.0.1:${daemon.port}/health`, {
    headers: { authorization: `Bearer ${daemon.token}` },
  })
  assert.equal(health.ok, true)
  assert.equal((await health.json()).nonce, daemon.nonce)

  const opened = await client.request('tools/call', {
    name: 'draw2code_open',
    arguments: { root, presentation: 'handoff' },
  })
  assert.equal(opened.result.structuredContent.ok, true)
  assert.equal(client.rootsRequestCount(), 1)
})
