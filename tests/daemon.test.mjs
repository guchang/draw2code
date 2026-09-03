import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import WebSocket from 'ws'

import { Draw2CodeDaemonClient } from '../dist/daemon-client.js'
import { validateDaemonDescriptor } from '../dist/runtime.js'

const daemonEntry = resolve('dist/draw2code-daemon.js')
const canvasHtml = resolve('lib/canvas.html')

async function waitUntil(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  throw new Error('condition timed out')
}

test('daemon is a token-gated single writer with workspace-scoped canvas access and WebSocket events', async (t) => {
  const previousTokenTtl = process.env.DRAW2CODE_CANVAS_TOKEN_TTL_MS
  const previousRegistryPath = process.env.DRAW2CODE_WORKSPACE_REGISTRY_PATH
  const previousMaxSceneBytes = process.env.DRAW2CODE_MAX_SCENE_BYTES
  process.env.DRAW2CODE_CANVAS_TOKEN_TTL_MS = '1000'
  process.env.DRAW2CODE_MAX_SCENE_BYTES = String(6 * 1024 * 1024)
  t.after(() => {
    if (previousTokenTtl === undefined) delete process.env.DRAW2CODE_CANVAS_TOKEN_TTL_MS
    else process.env.DRAW2CODE_CANVAS_TOKEN_TTL_MS = previousTokenTtl
    if (previousRegistryPath === undefined) delete process.env.DRAW2CODE_WORKSPACE_REGISTRY_PATH
    else process.env.DRAW2CODE_WORKSPACE_REGISTRY_PATH = previousRegistryPath
    if (previousMaxSceneBytes === undefined) delete process.env.DRAW2CODE_MAX_SCENE_BYTES
    else process.env.DRAW2CODE_MAX_SCENE_BYTES = previousMaxSceneBytes
  })
  const root = await mkdtemp(join(tmpdir(), 'draw2code-daemon-workspace-'))
  const secondRoot = await mkdtemp(join(tmpdir(), 'draw2code-daemon-workspace-'))
  const outside = await mkdtemp(join(tmpdir(), 'draw2code-daemon-outside-'))
  const runtime = await mkdtemp(join(tmpdir(), 'draw2code-daemon-runtime-'))
  const pluginCacheRoot = join(runtime, '.codex', 'plugins', 'cache', 'personal', 'draw2code')
  await mkdir(pluginCacheRoot, { recursive: true })
  const descriptorPath = join(runtime, 'daemon.json')
  process.env.DRAW2CODE_WORKSPACE_REGISTRY_PATH = join(runtime, 'workspaces.json')
  const client = new Draw2CodeDaemonClient(daemonEntry, canvasHtml, descriptorPath)
  const concurrentClient = new Draw2CodeDaemonClient(daemonEntry, canvasHtml, descriptorPath)
  const context = {
    clientId: 'daemon-test', host: 'codex', workspaceRoot: root, interactive: false,
    uiCapabilities: { mcpUi: false, externalBrowser: false },
  }
  const secondContext = { ...context, clientId: 'daemon-test-second', workspaceRoot: secondRoot }
  const pluginCacheContext = { ...context, clientId: 'daemon-test-cache', workspaceRoot: pluginCacheRoot }
  const [descriptor, concurrentDescriptor] = await Promise.all([client.ensure(), concurrentClient.ensure()])
  assert.equal(concurrentDescriptor.pid, descriptor.pid)
  assert.equal(concurrentDescriptor.nonce, descriptor.nonce)
  t.after(async () => {
    try { process.kill(descriptor.pid, 'SIGTERM') } catch { /* already stopped */ }
    await waitUntil(async () => await validateDaemonDescriptor(descriptorPath) === null).catch(() => undefined)
  })

  const unauthenticated = await fetch(`http://127.0.0.1:${descriptor.port}/health`)
  assert.equal(unauthenticated.status, 401)

  const listed = await client.execute({ type: 'list', root }, context)
  assert.deepEqual(listed, { ok: true, command: 'list', data: { scenes: [] } })
  const escaped = await client.execute({ type: 'list', root: outside }, context)
  assert.equal(escaped.ok, false)
  assert.equal(escaped.error.code, 'workspace-unknown')

  const seededSecondWorkspace = await client.execute({
    type: 'update', root: secondRoot, board: '第二工作区画板',
    ops: [{ op: 'upsert', element: { id: 'second-workspace-title', type: 'text', text: '第二工作区' } }],
  }, secondContext)
  assert.equal(seededSecondWorkspace.ok, true)
  const seededPluginCache = await client.execute({
    type: 'update', root: pluginCacheRoot, board: '缓存误写画板',
    ops: [{ op: 'upsert', element: { id: 'cache-title', type: 'text', text: '不应出现在工作区菜单' } }],
  }, pluginCacheContext)
  assert.equal(seededPluginCache.ok, true)
  const canvas = await client.canvas(root, null, context)
  assert.ok(canvas.expiresAt - Date.now() < 2_000)
  const html = await fetch(canvas.url)
  assert.equal(html.status, 200)
  assert.match(await html.text(), /draw2code-root/)
  const escapedCanvasUrl = new URL(canvas.url)
  escapedCanvasUrl.searchParams.set('root', outside)
  assert.equal((await fetch(escapedCanvasUrl)).status, 401)

  await new Promise((resolve) => setTimeout(resolve, 600))
  const keepAlive = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scenes?root=${encodeURIComponent(root)}`, {
    headers: { authorization: `Bearer ${canvas.token}` },
  })
  assert.equal(keepAlive.status, 200)
  await new Promise((resolve) => setTimeout(resolve, 600))
  const afterOriginalExpiry = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scenes?root=${encodeURIComponent(root)}`, {
    headers: { authorization: `Bearer ${canvas.token}` },
  })
  assert.equal(afterOriginalExpiry.status, 200)

  const events = []
  const wsUrl = new URL(canvas.url)
  wsUrl.protocol = 'ws:'
  wsUrl.pathname = '/events'
  const socket = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  socket.on('message', (message) => events.push(JSON.parse(String(message))))

  const peerContext = { ...context, clientId: 'daemon-test-peer' }
  const peerCanvas = await client.canvas(root, null, peerContext)
  const peerEvents = []
  const peerWsUrl = new URL(peerCanvas.url)
  peerWsUrl.protocol = 'ws:'
  peerWsUrl.pathname = '/events'
  const peerSocket = new WebSocket(peerWsUrl)
  await new Promise((resolve, reject) => {
    peerSocket.once('open', resolve)
    peerSocket.once('error', reject)
  })
  peerSocket.on('message', (message) => peerEvents.push(JSON.parse(String(message))))

  await client.execute({ type: 'list', root: secondRoot }, secondContext)
  const secondCanvas = await client.canvas(secondRoot, null, secondContext)
  const workspaces = await fetch(`http://127.0.0.1:${descriptor.port}/canvas-workspaces?root=${encodeURIComponent(root)}`, {
    headers: { authorization: `Bearer ${canvas.token}` },
  })
  assert.equal(workspaces.status, 200)
  const workspaceList = await workspaces.json()
  assert.deepEqual(workspaceList.workspaces.map((row) => row.root).sort(), [await realpath(root), await realpath(secondRoot)].sort())

  const crossRootRead = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scenes?root=${encodeURIComponent(secondRoot)}`, {
    headers: { authorization: `Bearer ${canvas.token}` },
  })
  assert.equal(crossRootRead.status, 401)

  const switched = await fetch(`http://127.0.0.1:${descriptor.port}/canvas-workspace-token`, {
    method: 'POST',
    headers: { authorization: `Bearer ${canvas.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ root, targetRoot: secondRoot }),
  })
  assert.equal(switched.status, 200)
  const switchedBody = await switched.json()
  assert.equal(new URL(switchedBody.url).searchParams.get('root'), await realpath(secondRoot))
  const switchedRead = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scenes?root=${encodeURIComponent(secondRoot)}`, {
    headers: { authorization: `Bearer ${switchedBody.token}` },
  })
  assert.equal(switchedRead.status, 200)

  const escapedSwitch = await fetch(`http://127.0.0.1:${descriptor.port}/canvas-workspace-token`, {
    method: 'POST',
    headers: { authorization: `Bearer ${canvas.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ root, targetRoot: outside }),
  })
  assert.equal(escapedSwitch.status, 403)
  const secondEvents = []
  const secondWsUrl = new URL(secondCanvas.url)
  secondWsUrl.protocol = 'ws:'
  secondWsUrl.pathname = '/events'
  const secondSocket = new WebSocket(secondWsUrl)
  await new Promise((resolve, reject) => {
    secondSocket.once('open', resolve)
    secondSocket.once('error', reject)
  })
  secondSocket.on('message', (message) => secondEvents.push(JSON.parse(String(message))))

  const updated = await client.execute({
    type: 'update', root,
    ops: [{ op: 'upsert', element: { id: 'daemon-title', type: 'text', text: '共享首页' } }],
  }, context)
  assert.equal(updated.ok, true)
  await waitUntil(() => events.some((event) => event.type === 'scene.updated'))
  await waitUntil(() => peerEvents.some((event) => event.type === 'scene.updated'))
  assert.ok(events.some((event) => event.type === 'active-board.changed'))
  assert.ok(events.some((event) => event.type === 'board.reveal-requested'))
  assert.equal(peerEvents.some((event) => event.type === 'active-board.changed'), false)
  assert.equal(peerEvents.some((event) => event.type === 'board.reveal-requested'), false)
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(secondEvents.some((event) => event.type === 'scene.updated'), false)
  socket.close()
  peerSocket.close()
  secondSocket.close()

  const create = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scene`, {
    method: 'POST',
    headers: { authorization: `Bearer ${canvas.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ root, name: '第二画板' }),
  })
  assert.equal(create.status, 200)
  const created = await create.json()
  assert.equal(created.ok, true)

  const firstWrite = await client.execute({
    type: 'update', root, board: '第二画板',
    ops: [{ op: 'upsert', element: { id: 'version-title', type: 'text', text: '第一版' } }],
  }, context)
  assert.equal(firstWrite.ok, true)

  const secondWrite = await client.execute({
    type: 'update', root, board: '第二画板',
    ops: [{ op: 'upsert', element: { id: 'version-title', type: 'text', text: '第二版' } }],
  }, context)
  assert.equal(secondWrite.ok, true)

  const versions = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/versions?root=${encodeURIComponent(root)}&name=${encodeURIComponent('第二画板')}`, {
    headers: { authorization: `Bearer ${canvas.token}` },
  })
  assert.equal(versions.status, 200)
  const versionList = await versions.json()
  assert.ok(versionList.versions.length >= 1)
  const preview = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/version?root=${encodeURIComponent(root)}&name=${encodeURIComponent('第二画板')}&id=${encodeURIComponent(versionList.versions[0].id)}`, {
    headers: { authorization: `Bearer ${canvas.token}` },
  })
  assert.equal(preview.status, 200)
  const previewBody = await preview.json()
  assert.equal(previewBody.scene.elements[0].text, '第一版')

  const scopedRead = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scene?root=${encodeURIComponent(root)}&name=${encodeURIComponent('第二画板')}`, {
    headers: { authorization: `Bearer ${canvas.token}` },
  })
  assert.equal(scopedRead.status, 200)

  const switchBoard = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/active-board`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${canvas.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ root, name: 'prototype' }),
  })
  assert.equal(switchBoard.status, 200)
  assert.equal((await switchBoard.json()).name, 'prototype')

  const createThird = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scene`, {
    method: 'POST',
    headers: { authorization: `Bearer ${canvas.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ root, name: '第三画板' }),
  })
  assert.equal(createThird.status, 200)
  assert.equal((await createThird.json()).ok, true)

  const largeScene = {
    type: 'excalidraw',
    version: 2,
    source: 'dsh-draw2code',
    elements: Array.from({ length: 560 }, (_, index) => ({
      id: `large-text-${index}`,
      type: 'text',
      text: 'x'.repeat(4_000),
    })),
    appState: { viewBackgroundColor: '#ffffff' },
  }
  const largeWriteBody = JSON.stringify({ root, name: '大画板', scene: largeScene, baseRev: 0 })
  assert.ok(Buffer.byteLength(largeWriteBody) > 2 * 1024 * 1024)
  const largeWrite = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scene/write`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${canvas.token}`, 'content-type': 'application/json' },
    body: largeWriteBody,
  })
  assert.equal(largeWrite.status, 200, await largeWrite.text())

  const oversizedScene = {
    ...largeScene,
    elements: Array.from({ length: 780 }, (_, index) => ({
      id: `oversized-text-${index}`,
      type: 'text',
      text: 'x'.repeat(4_000),
    })),
  }
  const oversizedWriteBody = JSON.stringify({ root, name: '超限画板', scene: oversizedScene, baseRev: 0 })
  assert.ok(Buffer.byteLength(oversizedWriteBody) < 7 * 1024 * 1024)
  const oversizedWrite = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scene/write`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${canvas.token}`, 'content-type': 'application/json' },
    body: oversizedWriteBody,
  })
  assert.equal(oversizedWrite.status, 400)
  const oversizedResult = await oversizedWrite.json()
  assert.equal(oversizedResult.error.code, 'too-large')
  assert.match(oversizedResult.error.message, /6291456-byte hard cap/)
})

test('daemon client recovers a stale startup lock left by a crashed process', async (t) => {
  const runtime = await mkdtemp(join(tmpdir(), 'draw2code-daemon-stale-lock-'))
  const descriptorPath = join(runtime, 'daemon.json')
  const lockPath = `${descriptorPath}.lock`
  await writeFile(lockPath, '')
  const staleAt = new Date(Date.now() - 60_000)
  await utimes(lockPath, staleAt, staleAt)

  const client = new Draw2CodeDaemonClient(daemonEntry, canvasHtml, descriptorPath)
  const descriptor = await client.ensure()
  t.after(async () => {
    try { process.kill(descriptor.pid, 'SIGTERM') } catch { /* already stopped */ }
    await waitUntil(async () => await validateDaemonDescriptor(descriptorPath) === null).catch(() => undefined)
  })

  assert.ok(descriptor.pid > 0)
  assert.deepEqual(await validateDaemonDescriptor(descriptorPath), descriptor)
})
