import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  Draw2CodeRuntimeImpl,
  choosePresentation,
  createDaemonDescriptor,
  validateDaemonDescriptor,
} from '../dist/runtime.js'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'draw2code-runtime-'))
  const context = {
    clientId: 'codex-test',
    host: 'codex',
    workspaceRoot: root,
    interactive: true,
    uiCapabilities: { mcpUi: false, externalBrowser: false },
  }
  return { root, context, runtime: new Draw2CodeRuntimeImpl() }
}

test('runtime lists and reads an old-format workspace without writing', async () => {
  const { root, context, runtime } = await fixture()
  const before = await stat(root)
  const listed = await runtime.execute({ type: 'list', root }, context)
  assert.deepEqual(listed, { ok: true, command: 'list', data: { scenes: [] } })
  const after = await stat(root)
  assert.equal(after.mtimeMs, before.mtimeMs)
})

test('runtime rejects roots outside the host workspace', async () => {
  const { context, runtime } = await fixture()
  const outside = await mkdtemp(join(tmpdir(), 'draw2code-outside-'))
  const result = await runtime.execute({ type: 'list', root: outside }, context)
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'workspace-unknown')
})

test('runtime open restores active board and never creates one', async () => {
  const { root, context, runtime } = await fixture()
  const empty = await runtime.execute({ type: 'open', root }, context)
  assert.equal(empty.ok, true)
  assert.equal(empty.data.board, null)
  assert.equal(empty.data.presentation, 'headless')

  await runtime.execute({ type: 'update', root, ops: [{ op: 'upsert', element: { id: 'title', type: 'text', text: '首页' } }] }, context)
  const opened = await runtime.execute({ type: 'open', root }, context)
  assert.equal(opened.ok, true)
  assert.equal(opened.data.board, 'prototype')
  assert.equal(opened.data.opened, false)
})

test('presentation uses capability detection instead of host names', () => {
  assert.equal(choosePresentation('auto', { mcpUi: true, externalBrowser: true }), 'inline')
  assert.equal(choosePresentation('auto', { mcpUi: false, externalBrowser: true }), 'browser')
  assert.equal(choosePresentation('auto', { mcpUi: false, externalBrowser: false }), 'headless')
  assert.equal(choosePresentation('browser', { mcpUi: true, externalBrowser: false }), 'headless')
})

test('daemon descriptor is private, nonce-bound and rejects permissive files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'draw2code-descriptor-'))
  const path = join(dir, 'daemon.json')
  const descriptor = await createDaemonDescriptor(path, { pid: process.pid, port: 43123 })
  assert.match(descriptor.token, /^[A-Za-z0-9_-]{32,}$/)
  assert.match(descriptor.nonce, /^[A-Za-z0-9_-]{16,}$/)
  assert.equal((await stat(path)).mode & 0o777, 0o600)
  assert.deepEqual(await validateDaemonDescriptor(path), descriptor)
  await chmod(path, 0o644)
  assert.equal(await validateDaemonDescriptor(path), null)
  const raw = await readFile(path, 'utf8')
  assert.doesNotThrow(() => JSON.parse(raw))
})

test('runtime emits shared scene and active-board events after mutation', async () => {
  const { root, context, runtime } = await fixture()
  const events = []
  const dispose = runtime.subscribe(context, (event) => events.push(event))
  const result = await runtime.execute({
    type: 'update',
    root,
    ops: [{ op: 'upsert', element: { id: 'title', type: 'text', text: '首页' } }],
  }, context)
  dispose()
  assert.equal(result.ok, true)
  assert.deepEqual(events.map((event) => event.type), [
    'scene.updated',
    'active-board.changed',
    'board.reveal-requested',
  ])
  assert.ok(events.every((event) => event.sourceClientId === 'codex-test'))
})

test('explicit update of a non-active board selects and reveals the target board', async () => {
  const { root, context, runtime } = await fixture()
  await runtime.execute({
    type: 'update', root,
    ops: [{ op: 'upsert', element: { id: 'active-title', type: 'text', text: '当前画板' } }],
  }, context)
  const events = []
  const dispose = runtime.subscribe(context, (event) => events.push(event))
  const updated = await runtime.execute({
    type: 'update', root, board: '后台画板',
    ops: [{ op: 'upsert', element: { id: 'other-title', type: 'text', text: '后台更新' } }],
  }, context)
  dispose()
  assert.equal(updated.ok, true)
  assert.equal(updated.data.targetBoard, '后台画板')
  assert.equal(updated.data.activeBoard, '后台画板')
  assert.equal(typeof updated.data.revealRequestId, 'string')
  assert.deepEqual(events.map((event) => event.type), [
    'scene.updated',
    'active-board.changed',
    'board.reveal-requested',
  ])
  const opened = await runtime.execute({ type: 'open', root }, context)
  assert.equal(opened.data.board, '后台画板')
})
