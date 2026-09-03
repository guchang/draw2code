import assert from 'node:assert/strict'
import { mkdtemp, realpath } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import WebSocket from 'ws'

import { Draw2CodeDaemonClient } from '../dist/daemon-client.js'
import { startGateway, validateDaemonDescriptor } from '../dist/index.js'

const daemonEntry = resolve('dist/draw2code-daemon.js')
const canvasHtmlPath = resolve('lib/canvas.html')

async function waitUntil(predicate, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 30))
  }
  throw new Error('condition timed out')
}

function canvasConfig(html) {
  const match = /window\.__DRAW2CODE_BOOTSTRAP__=([^<]+)<\/script>/.exec(html)
  assert.notEqual(match, null)
  return JSON.parse(match[1])
}

test('stable gateway opens directly on loopback and restores local access after restarts', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'draw2code-gateway-workspace-'))
  const secondRoot = await mkdtemp(join(tmpdir(), 'draw2code-gateway-second-workspace-'))
  const runtime = await mkdtemp(join(tmpdir(), 'draw2code-gateway-runtime-'))
  const workerDescriptorPath = join(runtime, 'daemon.json')
  const gatewayDescriptorPath = join(runtime, 'gateway.json')
  const registryPath = join(runtime, 'workspaces.json')
  const statePath = join(runtime, 'gateway-state.json')
  const previousRegistryPath = process.env.DRAW2CODE_WORKSPACE_REGISTRY_PATH
  process.env.DRAW2CODE_WORKSPACE_REGISTRY_PATH = registryPath
  t.after(() => {
    if (previousRegistryPath === undefined) delete process.env.DRAW2CODE_WORKSPACE_REGISTRY_PATH
    else process.env.DRAW2CODE_WORKSPACE_REGISTRY_PATH = previousRegistryPath
  })

  const worker = new Draw2CodeDaemonClient(daemonEntry, canvasHtmlPath, workerDescriptorPath)
  let gateway = await startGateway({
    descriptorPath: gatewayDescriptorPath,
    canvasHtmlPath,
    port: 0,
    ensureWorker: () => worker.ensure(),
    workspaceRegistryPath: registryPath,
    statePath,
  })
  t.after(async () => {
    await gateway.close()
    const descriptor = await validateDaemonDescriptor(workerDescriptorPath)
    if (descriptor !== null) try { process.kill(descriptor.pid, 'SIGTERM') } catch { /* already stopped */ }
  })

  const context = {
    clientId: 'gateway-test', host: 'codex', workspaceRoot: root, interactive: true,
    uiCapabilities: { mcpUi: false, externalBrowser: true },
  }
  assert.equal((await worker.execute({
    type: 'update', root: secondRoot, board: '第二工作区画板',
    ops: [{ op: 'upsert', element: { id: 'title-2', type: 'text', text: '跨工作区' } }],
  }, { ...context, clientId: 'gateway-test-second', workspaceRoot: secondRoot })).ok, true)
  assert.equal((await worker.execute({
    type: 'update', root, board: '任务画板',
    ops: [{ op: 'upsert', element: { id: 'title', type: 'text', text: '稳定入口' } }],
  }, context)).ok, true)

  const directRoot = await fetch(gateway.url)
  assert.equal(directRoot.status, 200)
  const directHtml = await directRoot.text()
  assert.match(directHtml, /draw2code-root/)
  assert.doesNotMatch(directHtml, /请从 Codex 打开画码/)
  const config = canvasConfig(directHtml)
  assert.equal(config.root, await realpath(root))
  assert.equal(config.board, null)
  assert.match(config.csrfToken, /^[A-Za-z0-9_-]+$/)
  const setCookie = directRoot.headers.get('set-cookie') ?? ''
  assert.match(setCookie, /^draw2code_session=[A-Za-z0-9_-]+;/)
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Strict/i)
  const cookie = setCookie.split(';', 1)[0]

  const canvas = await fetch(gateway.url, { headers: { cookie } })
  assert.equal(canvas.status, 200)
  assert.match(await canvas.text(), /draw2code-root/)
  assert.equal(canvas.url, gateway.url)

  const listed = await fetch(new URL(`/api/draw2code/scenes?root=${encodeURIComponent(root)}`, gateway.url), { headers: { cookie } })
  assert.equal(listed.status, 200)
  assert.deepEqual((await listed.json()).scenes.map((row) => row.name), ['任务画板'])
  const missingSession = await fetch(new URL(`/api/draw2code/scenes?root=${encodeURIComponent(root)}`, gateway.url))
  assert.equal(missingSession.status, 401)
  assert.doesNotMatch((await missingSession.json()).error.message, /Codex/)
  assert.equal((await fetch(new URL(`/api/draw2code/scenes?root=${encodeURIComponent(root)}`, gateway.url), {
    headers: { cookie, origin: 'https://malicious.example', 'sec-fetch-site': 'cross-site' },
  })).status, 403)

  const privateMissingPath = join(root, 'private-missing-workspace')
  const invalidWorkspace = await fetch(new URL(`/api/draw2code/scenes?root=${encodeURIComponent(privateMissingPath)}`, gateway.url), { headers: { cookie } })
  assert.equal(invalidWorkspace.status, 403)
  assert.doesNotMatch(await invalidWorkspace.text(), new RegExp(privateMissingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

  const forgedWrite = await fetch(new URL('/api/draw2code/scene', gateway.url), {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ root, name: '浏览器写入' }),
  })
  assert.equal(forgedWrite.status, 403)
  const protectedWrite = await fetch(new URL('/api/draw2code/scene', gateway.url), {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', 'x-draw2code-csrf': config.csrfToken },
    body: JSON.stringify({ root, name: '浏览器写入' }),
  })
  assert.equal(protectedWrite.status, 200)

  const eventsUrl = new URL(`/events?root=${encodeURIComponent(root)}`, gateway.url)
  eventsUrl.protocol = 'ws:'
  const events = new WebSocket(eventsUrl, { headers: { cookie } })
  const connected = await new Promise((resolvePromise, reject) => {
    const timer = setTimeout(() => reject(new Error('gateway WebSocket timed out')), 1_000)
    events.once('message', (message) => {
      clearTimeout(timer)
      resolvePromise(JSON.parse(String(message)))
    })
    events.once('error', reject)
  })
  assert.equal(connected.type, 'connected')
  events.close()

  const switched = await fetch(new URL('/canvas-workspace-token', gateway.url), {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', 'x-draw2code-csrf': config.csrfToken },
    body: JSON.stringify({ root, targetRoot: secondRoot }),
  })
  assert.equal(switched.status, 200)
  const switchResult = await switched.json()
  assert.equal(switchResult.url, gateway.url)
  assert.equal('token' in switchResult, false)
  const secondWorkspaceBoards = await fetch(new URL(`/api/draw2code/scenes?root=${encodeURIComponent(secondRoot)}`, gateway.url), { headers: { cookie } })
  assert.equal(secondWorkspaceBoards.status, 200)
  assert.deepEqual((await secondWorkspaceBoards.json()).scenes.map((row) => row.name), ['第二工作区画板'])

  const switchedBack = await fetch(new URL('/canvas-workspace-token', gateway.url), {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json', 'x-draw2code-csrf': config.csrfToken },
    body: JSON.stringify({ root: secondRoot, targetRoot: root }),
  })
  assert.equal(switchedBack.status, 200)

  const firstWorker = await validateDaemonDescriptor(workerDescriptorPath)
  assert.notEqual(firstWorker, null)
  process.kill(firstWorker.pid, 'SIGTERM')
  await waitUntil(async () => await validateDaemonDescriptor(workerDescriptorPath) === null)

  const afterRestart = await fetch(new URL(`/api/draw2code/scenes?root=${encodeURIComponent(root)}`, gateway.url), { headers: { cookie } })
  assert.equal(afterRestart.status, 200)
  assert.deepEqual((await afterRestart.json()).scenes.map((row) => row.name).sort(), ['任务画板', '浏览器写入'].sort())
  const secondWorker = await validateDaemonDescriptor(workerDescriptorPath)
  assert.notEqual(secondWorker, null)
  assert.notEqual(secondWorker.nonce, firstWorker.nonce)
  assert.equal(new URL(gateway.url).port, String(gateway.descriptor.port))

  await gateway.close()
  gateway = await startGateway({
    descriptorPath: gatewayDescriptorPath,
    canvasHtmlPath,
    port: 0,
    ensureWorker: () => worker.ensure(),
    workspaceRegistryPath: registryPath,
    statePath,
  })
  const restored = await fetch(gateway.url, { headers: { cookie } })
  assert.equal(restored.status, 200)
  const restoredHtml = await restored.text()
  assert.match(restoredHtml, /draw2code-root/)
  assert.equal(canvasConfig(restoredHtml).root, await realpath(root))
  assert.match(restored.headers.get('set-cookie') ?? '', /^draw2code_session=/)

  const localhostUrl = new URL(gateway.url)
  localhostUrl.hostname = 'localhost'
  const canonical = await fetch(localhostUrl, { redirect: 'manual' })
  assert.equal(canonical.status, 308)
  assert.equal(canonical.headers.get('location'), gateway.url)
})

test('daemon client reports a fixed gateway port conflict without silently changing ports', async (t) => {
  const runtime = await mkdtemp(join(tmpdir(), 'draw2code-gateway-conflict-'))
  const occupied = createServer((_req, res) => { res.writeHead(200); res.end('occupied') })
  await new Promise((resolvePromise, reject) => {
    occupied.once('error', reject)
    occupied.listen(0, '127.0.0.1', () => resolvePromise())
  })
  t.after(() => new Promise((resolvePromise) => occupied.close(() => resolvePromise())))
  const address = occupied.address()
  assert.notEqual(address, null)
  assert.equal(typeof address, 'object')

  const previousPort = process.env.DRAW2CODE_GATEWAY_PORT
  process.env.DRAW2CODE_GATEWAY_PORT = String(address.port)
  t.after(() => {
    if (previousPort === undefined) delete process.env.DRAW2CODE_GATEWAY_PORT
    else process.env.DRAW2CODE_GATEWAY_PORT = previousPort
  })
  const client = new Draw2CodeDaemonClient(
    daemonEntry,
    canvasHtmlPath,
    join(runtime, 'daemon.json'),
    resolve('dist/draw2code-gateway.js'),
    join(runtime, 'gateway.json'),
  )
  await assert.rejects(client.ensureGateway(), /gateway port .* is already in use/)
})
