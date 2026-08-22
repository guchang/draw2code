import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
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

test('daemon is a token-gated single writer with scoped canvas access and WebSocket events', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'draw2code-daemon-workspace-'))
  const secondRoot = await mkdtemp(join(tmpdir(), 'draw2code-daemon-workspace-'))
  const outside = await mkdtemp(join(tmpdir(), 'draw2code-daemon-outside-'))
  const runtime = await mkdtemp(join(tmpdir(), 'draw2code-daemon-runtime-'))
  const descriptorPath = join(runtime, 'daemon.json')
  const client = new Draw2CodeDaemonClient(daemonEntry, canvasHtml, descriptorPath)
  const concurrentClient = new Draw2CodeDaemonClient(daemonEntry, canvasHtml, descriptorPath)
  const context = {
    clientId: 'daemon-test', host: 'codex', workspaceRoot: root, interactive: false,
    uiCapabilities: { mcpUi: false, externalBrowser: false },
  }
  const secondContext = { ...context, clientId: 'daemon-test-second', workspaceRoot: secondRoot }
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

  const canvas = await client.canvas(root, null, context)
  const html = await fetch(canvas.url)
  assert.equal(html.status, 200)
  assert.match(await html.text(), /draw2code-root/)
  const escapedCanvasUrl = new URL(canvas.url)
  escapedCanvasUrl.searchParams.set('root', outside)
  assert.equal((await fetch(escapedCanvasUrl)).status, 401)

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

  await client.execute({ type: 'list', root: secondRoot }, secondContext)
  const secondCanvas = await client.canvas(secondRoot, null, secondContext)
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
  assert.ok(events.some((event) => event.type === 'active-board.changed'))
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(secondEvents.some((event) => event.type === 'scene.updated'), false)
  socket.close()
  secondSocket.close()

  const create = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scene`, {
    method: 'POST',
    headers: { authorization: `Bearer ${canvas.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ root, name: '第二画板' }),
  })
  assert.equal(create.status, 200)
  assert.equal((await create.json()).ok, true)

  const forbiddenDelete = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scene?root=${encodeURIComponent(root)}&name=prototype`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${canvas.token}` },
  })
  assert.equal(forbiddenDelete.status, 403)

  const scopedRead = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scene?root=${encodeURIComponent(root)}&name=${encodeURIComponent('第二画板')}`, {
    headers: { authorization: `Bearer ${canvas.token}` },
  })
  assert.equal(scopedRead.status, 200)

  const forbiddenSwitch = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/active-board`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${canvas.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ root, name: 'prototype' }),
  })
  assert.equal(forbiddenSwitch.status, 403)

  const forbiddenCreate = await fetch(`http://127.0.0.1:${descriptor.port}/api/draw2code/scene`, {
    method: 'POST',
    headers: { authorization: `Bearer ${canvas.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ root, name: '第三画板' }),
  })
  assert.equal(forbiddenCreate.status, 403)
})
