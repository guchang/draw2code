import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { ProjectStore, SceneStore, draw2codeCreateTool, draw2codeGenerateTool, draw2codeReadTool, draw2codeUpdateTool } from '../dist/index.js'

const roots = []
let sync
let autoOpen

test.before(async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'dsh-draw2code-sync-'))
  const outputFile = join(outputDir, 'sync.mjs')
  await build({
    entryPoints: [resolve(dirname(fileURLToPath(import.meta.url)), '../src/client/sync.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: outputFile,
  })
  sync = await import(pathToFileURL(outputFile).href)

  const autoOpenFile = join(outputDir, 'auto-open.mjs')
  await build({
    entryPoints: [resolve(dirname(fileURLToPath(import.meta.url)), '../src/client/auto-open.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: autoOpenFile,
  })
  autoOpen = await import(pathToFileURL(autoOpenFile).href)
})

async function makeStore() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-draw2code-test-'))
  const canonicalRoot = await realpath(root)
  roots.push(root)
  const ctx = {
    workspaceRegistry: { list: () => [{ path: canonicalRoot }] },
    logger: { warn() {} },
  }
  return { root, canonicalRoot, store: new SceneStore(ctx), projects: new ProjectStore(ctx) }
}

test.afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop()
    await rm(root, { recursive: true, force: true })
  }
})

test('debounced edits keep the revision and merge base from the first edit', () => {
  const first = sync.capturePendingSave(
    null,
    'prototype',
    [{ id: 'deleted-later', type: 'rectangle' }],
    41,
    [{ id: 'deleted-later', type: 'rectangle' }],
  )
  const second = sync.capturePendingSave(
    first,
    'prototype',
    [{ id: 'new-local-page', type: 'frame' }],
    99,
    [{ id: 'agent-page', type: 'frame' }],
  )

  assert.equal(second.baseRev, 41)
  assert.deepEqual(second.baseElements, [{ id: 'deleted-later', type: 'rectangle' }])
  assert.deepEqual(second.elements, [{ id: 'new-local-page', type: 'frame' }])
})

test('the client reveals each successful board update exactly once', () => {
  const calls = []
  const values = new Map()
  const handledIds = new Map()
  const input = {
    root: '/workspace/demo',
    sessionId: 'session-1',
    result: {
      ok: true,
      request: { id: 'reveal-abc-1', board: '登录流程', createdAt: 123 },
    },
    handledIds,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
    },
    sidebar: {
      openTab: (seed, scope) => { calls.push({ seed, scope }) },
    },
  }

  assert.equal(autoOpen.consumeBoardReveal(input), true)
  assert.equal(autoOpen.consumeBoardReveal(input), false)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    seed: {
      type: 'draw2code:board',
      title: '画码',
      path: '/workspace/demo/draw2code/登录流程.excalidraw.json',
    },
    scope: { sessionId: 'session-1', cwd: '/workspace/demo' },
  })
})

test('the client ignores missing and failed board reveal requests', () => {
  const calls = []
  const common = {
    root: '/workspace/demo',
    sessionId: 'session-1',
    handledIds: new Map(),
    storage: { getItem: () => null, setItem: () => undefined },
    sidebar: { openTab: (...args) => { calls.push(args) } },
  }

  assert.equal(autoOpen.consumeBoardReveal({ ...common, result: { ok: true, request: null } }), false)
  assert.equal(autoOpen.consumeBoardReveal({ ...common, result: { ok: false, error: { code: 'internal', message: 'offline' } } }), false)
  assert.equal(calls.length, 0)
})

test('local deletion survives agent additions and repeated write conflicts', async () => {
  const base = [
    { id: 'keep', type: 'rectangle' },
    { id: 'deleted-by-user', type: 'rectangle' },
  ]
  const local = [
    { id: 'keep', type: 'rectangle' },
    { id: 'local-page', type: 'frame' },
  ]
  let writes = 0
  const attempts = []
  const result = await sync.saveWithConflictRetry({
    elements: local,
    baseElements: base,
    baseRev: 10,
    read: async () => writes === 1
      ? { ok: true, rev: 11, elements: [...base, { id: 'agent-page-1', type: 'frame' }] }
      : { ok: true, rev: 12, elements: [...base, { id: 'agent-page-1', type: 'frame' }, { id: 'agent-page-2', type: 'frame' }] },
    write: async (elements, rev) => {
      writes += 1
      attempts.push({ elements, rev })
      if (writes < 3) return { ok: false, error: { code: 'conflict', message: 'changed during write' } }
      return { ok: true, rev: 13 }
    },
  })

  assert.equal(result.result.ok, true)
  assert.equal(writes, 3)
  assert.deepEqual(attempts.at(-1).elements.map((element) => element.id).sort(), [
    'agent-page-1', 'agent-page-2', 'keep', 'local-page',
  ])
  assert.ok(!attempts.at(-1).elements.some((element) => element.id === 'deleted-by-user'))
})

test('a first save treats revision zero as an expected empty board', async () => {
  const writes = []
  const result = await sync.saveWithConflictRetry({
    elements: [{ id: 'user-drawn-page', type: 'frame' }],
    baseElements: [],
    baseRev: 0,
    read: async () => ({ ok: true, rev: 7, elements: [{ id: 'agent-drawn-page', type: 'frame' }] }),
    write: async (elements, rev) => {
      writes.push({ elements, rev })
      return writes.length === 1
        ? { ok: false, error: { code: 'conflict', message: 'agent created the board' } }
        : { ok: true, rev: 8 }
    },
  })

  assert.equal(writes[0].rev, 0)
  assert.equal(result.result.ok, true)
  assert.deepEqual(writes.at(-1).elements.map((element) => element.id).sort(), ['agent-drawn-page', 'user-drawn-page'])
})

test('draw2code_update replace preserves the submitted scene and verifies it', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  await tool.execute({
    root,
    name: 'replace-case',
    ops: [{ op: 'upsert', element: { id: 'old-card', type: 'rectangle', x: 0, y: 0 } }],
  }, {})

  const result = await tool.execute({
    root,
    name: 'replace-case',
    force: true,
    ops: [{
      op: 'replace',
      scene: { elements: [{ id: 'new-card', type: 'rectangle', x: 40, y: 40 }] },
    }],
  }, {})

  assert.equal(result.verified, true)
  assert.equal(result.elementCount, 1)
  const read = await store.read(root, 'replace-case')
  assert.equal(read.ok, true)
  assert.deepEqual(read.value.scene.elements.map((element) => element.id), ['new-card'])
})

test('scene writes preserve Excalidraw connector and link metadata', async () => {
  const { root, canonicalRoot, store } = await makeStore()
  const arrow = {
    id: 'flow-arrow',
    type: 'arrow',
    x: 20,
    y: 30,
    width: 120,
    height: 0,
    points: [[0, 0], [120, 0]],
    startArrowhead: 'arrow',
    endArrowhead: 'triangle',
    startBinding: { elementId: 'source-card', focus: 0.25, gap: 8 },
    endBinding: { elementId: 'target-card', focus: -0.25, gap: 8 },
    link: 'https://example.com/prototype',
  }

  const written = await store.write(root, 'metadata-case', { elements: [arrow] })
  assert.equal(written.ok, true)

  const raw = JSON.parse(await readFile(join(canonicalRoot, 'draw2code/metadata-case.excalidraw.json'), 'utf8'))
  const saved = raw.elements[0]
  assert.equal(saved.startArrowhead, 'arrow')
  assert.equal(saved.endArrowhead, 'triangle')
  assert.deepEqual(saved.startBinding, arrow.startBinding)
  assert.deepEqual(saved.endBinding, arrow.endBinding)
  assert.equal(saved.link, arrow.link)
})

test('concurrent writes from the same revision allow only one winner', async () => {
  const { root, store } = await makeStore()
  const initial = await store.write(root, 'concurrent-case', {
    elements: [{ id: 'base', type: 'rectangle' }],
  })
  assert.equal(initial.ok, true)

  const attempts = await Promise.all(Array.from({ length: 12 }, (_, index) => store.write(
    root,
    'concurrent-case',
    { elements: [{ id: `candidate-${index}`, type: 'rectangle' }] },
    initial.value.rev,
  )))

  assert.equal(attempts.filter((result) => result.ok).length, 1)
  assert.equal(attempts.filter((result) => !result.ok && result.error.code === 'conflict').length, 11)
})

test('concurrent creates of the same board allow only one winner', async () => {
  const { root, store } = await makeStore()
  const attempts = await Promise.all(Array.from({ length: 12 }, () => store.create(root, 'create-race')))

  assert.equal(attempts.filter((result) => result.ok).length, 1)
  assert.equal(attempts.filter((result) => !result.ok && result.error.code === 'exists').length, 11)
})

test('concurrent first updates do not overwrite each other silently', async () => {
  const { root, store } = await makeStore()
  const attempts = await Promise.all(Array.from({ length: 12 }, (_, index) => store.applyOps(
    root,
    'first-update-race',
    [{ op: 'upsert', element: { id: `candidate-${index}`, type: 'rectangle' } }],
  )))

  assert.equal(attempts.filter((result) => result.ok).length, 1)
  assert.equal(attempts.filter((result) => !result.ok && result.error.code === 'conflict').length, 11)
  const read = await store.read(root, 'first-update-race')
  assert.equal(read.ok, true)
  assert.equal(read.value.scene.elements.length, 1)
})

test('element byte limits include multibyte product copy', async () => {
  const { root, store } = await makeStore()
  const result = await store.write(root, 'element-byte-cap', {
    elements: [{
      id: 'oversized-copy',
      type: 'rectangle',
      customData: { mockData: '用户任务'.repeat(2300) },
    }],
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'bad-scene')
  assert.match(result.error.message, /exceeds 16384 bytes/)
})

test('scene byte limits include multibyte product copy', async () => {
  const { root, store } = await makeStore()
  const result = await store.write(root, 'scene-byte-cap', {
    elements: Array.from({ length: 45 }, (_, index) => ({
      id: `mock-card-${index}`,
      type: 'rectangle',
      customData: { mockData: '待办事项'.repeat(1000) },
    })),
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'too-large')
})

test('draw2code_update still asks for confirmation on a manual edit conflict', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  await tool.execute({
    root,
    name: 'conflict-case',
    ops: [{ op: 'upsert', element: { id: 'login-title', type: 'text', text: '登录' } }],
  }, {})

  const manual = await store.write(root, 'conflict-case', {
    elements: [{ id: 'login-title', type: 'text', text: '用户登录' }],
  })
  assert.equal(manual.ok, true)

  const result = await tool.execute({
    root,
    name: 'conflict-case',
    ops: [{ op: 'upsert', element: { id: 'login-title', type: 'text', text: '登录页' } }],
  }, {})

  assert.equal(result.pending, true)
  assert.equal(result.requiresConfirmation, true)
  const read = await store.read(root, 'conflict-case')
  assert.equal(read.ok, true)
  assert.equal(read.value.scene.elements[0].text, '用户登录')
})

test('draw2code_update without a board name targets the active visible board', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const active = await store.setActiveBoard(root, '顾客端')
  assert.equal(active.ok, true)

  const result = await tool.execute({
    root,
    ops: [{ op: 'upsert', element: { id: 'customer-home', type: 'frame', x: 0, y: 0 } }],
  }, {})

  assert.equal(result.targetBoard, '顾客端')
  assert.equal(result.activeBoard, '顾客端')
  const customer = await store.read(root, '顾客端')
  assert.equal(customer.ok, true)
  assert.equal(customer.value.scene.elements[0].id, 'customer-home')
  const prototype = await store.read(root, 'prototype')
  assert.equal(prototype.ok, false)
  assert.equal(prototype.error.code, 'not-found')
})

test('a successful update selects its target board and publishes one reveal request', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  assert.equal((await store.setActiveBoard(root, '顾客端')).ok, true)

  const result = await tool.execute({
    root,
    name: 'prototype',
    ops: [{ op: 'upsert', element: { id: 'prototype-only', type: 'frame', x: 0, y: 0 } }],
  }, {})

  assert.equal(result.verified, true)
  assert.equal(result.targetBoard, 'prototype')
  assert.equal(result.activeBoard, 'prototype')

  const active = await store.getActiveBoard(root)
  assert.equal(active.ok, true)
  assert.equal(active.value.name, 'prototype')

  const reveal = await store.getBoardReveal(root)
  assert.equal(reveal.ok, true)
  assert.equal(reveal.value.request.board, 'prototype')
  assert.match(reveal.value.request.id, /^reveal-/)
})

test('a pending update does not replace the last successful reveal request', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  await tool.execute({
    root,
    name: 'conflict-reveal',
    ops: [{ op: 'upsert', element: { id: 'title', type: 'text', text: '初始标题' } }],
  }, {})
  const before = await store.getBoardReveal(root)
  assert.equal(before.ok, true)

  assert.equal((await store.write(root, 'conflict-reveal', {
    elements: [{ id: 'title', type: 'text', text: '用户修改的标题' }],
  })).ok, true)
  const pending = await tool.execute({
    root,
    name: 'conflict-reveal',
    ops: [{ op: 'upsert', element: { id: 'title', type: 'text', text: 'Agent 修改的标题' } }],
  }, {})
  assert.equal(pending.pending, true)

  const after = await store.getBoardReveal(root)
  assert.equal(after.ok, true)
  assert.equal(after.value.request.id, before.value.request.id)
})

test('an existing element is protected when the host has no prior snapshot', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const written = await store.write(root, 'restart-case', {
    elements: [{ id: 'user-edited-card', type: 'text', text: '用户刚改过' }],
  })
  assert.equal(written.ok, true)

  const result = await tool.execute({
    root,
    name: 'restart-case',
    ops: [{ op: 'upsert', element: { id: 'user-edited-card', type: 'text', text: 'Agent新文案' } }],
  }, {})

  assert.equal(result.pending, true)
  assert.equal(result.requiresConfirmation, true)
  const read = await store.read(root, 'restart-case')
  assert.equal(read.ok, true)
  assert.equal(read.value.scene.elements[0].text, '用户刚改过')
})

test('frame text is accepted as a fallback frame name for agent-authored pages', async () => {
  const { root, store } = await makeStore()
  const written = await store.write(root, 'frame-name-case', {
    elements: [{ id: 'login-frame', type: 'frame', text: '用户登录页', x: 0, y: 0 }],
  })
  assert.equal(written.ok, true)
  const read = await store.read(root, 'frame-name-case')
  assert.equal(read.ok, true)
  assert.equal(read.value.scene.elements[0].name, '用户登录页')
})

test('draw2code_update accepts a direct element as unambiguous upsert shorthand', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'direct-element-shorthand',
    ops: [
      { id: 'page', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'direct-element-shorthand')
  assert.equal(read.ok, true)
  assert.equal(read.value.scene.elements[0].id, 'page')
})

test('draw2code_update accepts a nested element with an omitted upsert op', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'nested-element-shorthand',
    ops: [
      { element: { id: 'page', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'nested-element-shorthand')
  assert.equal(read.ok, true)
  assert.equal(read.value.scene.elements[0].id, 'page')
})

test('draw2code_update accepts a flat upsert as unambiguous shorthand', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'flat-upsert-shorthand',
    ops: [
      { op: 'upsert', id: 'page', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'flat-upsert-shorthand')
  assert.equal(read.ok, true)
  assert.equal(read.value.scene.elements[0].id, 'page')
})

test('draw2code_update accepts a nested delete id as unambiguous shorthand', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'nested-delete-shorthand', {
    elements: [{ id: 'obsolete-note', type: 'text', text: '待删除' }],
  })
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'nested-delete-shorthand',
    safeMode: false,
    ops: [{ op: 'delete', element: { id: 'obsolete-note' } }],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'nested-delete-shorthand')
  assert.equal(read.ok, true)
  assert.equal(read.value.scene.elements.some((element) => element.id === 'obsolete-note'), false)
})

test('draw2code_update verifies the final net effect of repeated ids in one batch', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'same-batch-net-effect',
    ops: [
      { op: 'upsert', element: { id: 'temp-note', type: 'text', text: '临时说明' } },
      { op: 'delete', element: { id: 'temp-note' } },
      { op: 'delete', id: 'final-note' },
      { op: 'upsert', element: { id: 'final-note', type: 'text', text: '最终说明' } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'same-batch-net-effect')
  assert.equal(read.ok, true)
  assert.equal(read.value.scene.elements.some((element) => element.id === 'temp-note'), false)
  assert.equal(read.value.scene.elements.find((element) => element.id === 'final-note')?.text, '最终说明')
})

test('draw2code_update safely converts unambiguous frame-local coordinates', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'frame-local-coordinates',
    ops: [
      { op: 'upsert', element: { id: 'page', type: 'frame', name: '详情页', x: 440, y: 100, width: 420, height: 860 } },
      { op: 'upsert', element: { id: 'title', type: 'text', text: '详情', frameId: 'page', x: 20, y: 80, width: 200, height: 32 } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'frame-local-coordinates')
  assert.equal(read.ok, true)
  const title = read.value.scene.elements.find((element) => element.id === 'title')
  assert.equal(title.x, 460)
  assert.equal(title.y, 180)
})

test('draw2code_update preserves already absolute frame child coordinates', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'absolute-frame-coordinates',
    ops: [
      { op: 'upsert', element: { id: 'page', type: 'frame', name: '详情页', x: 440, y: 100, width: 420, height: 860 } },
      { op: 'upsert', element: { id: 'title', type: 'text', text: '详情', frameId: 'page', x: 460, y: 180, width: 200, height: 32 } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'absolute-frame-coordinates')
  assert.equal(read.ok, true)
  const title = read.value.scene.elements.find((element) => element.id === 'title')
  assert.equal(title.x, 460)
  assert.equal(title.y, 180)
})

test('draw2code_update rejects ambiguous frame child coordinates instead of guessing', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  await assert.rejects(
    tool.execute({
      root,
      name: 'ambiguous-frame-coordinates',
      ops: [
        { op: 'upsert', element: { id: 'page', type: 'frame', name: '详情页', x: 440, y: 100, width: 420, height: 860 } },
        { op: 'upsert', element: { id: 'title', type: 'text', text: '详情', frameId: 'page', x: 460, y: 20, width: 200, height: 32 } },
      ],
    }, {}),
    /layout-invalid[\s\S]*frame-overflow[\s\S]*title/i,
  )

  const board = await store.read(root, 'ambiguous-frame-coordinates')
  assert.equal(board.ok, false)
})

test('draw2code_update rejects a text box that cannot contain its own lines', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  await assert.rejects(
    tool.execute({
      root,
      name: 'layout-text-overflow',
      ops: [
        { op: 'upsert', element: { id: 'page', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 } },
        { op: 'upsert', element: { id: 'calendar-grid', type: 'text', text: '一 二 三 四 五 六 日\n1 2 3 4 5 6 7\n8 9 10 11 12 13 14\n15 16 17 18 19 20 21\n22 23 24 25 26 27 28', x: 20, y: 120, width: 380, height: 24 } },
      ],
    }, {}),
    /layout-invalid[\s\S]*calendar-grid[\s\S]*height/i,
  )

  const board = await store.read(root, 'layout-text-overflow')
  assert.equal(board.ok, false)
  assert.equal(board.error.code, 'not-found')
})

test('draw2code_update rejects invisible labels placed on a shape', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  await assert.rejects(
    tool.execute({
      root,
      name: 'layout-shape-label',
      ops: [{ op: 'upsert', element: { id: 'submit-button', type: 'rectangle', text: '提交', x: 20, y: 500, width: 380, height: 48 } }],
    }, {}),
    /layout-invalid[\s\S]*submit-button[\s\S]*separate text/i,
  )
})

test('draw2code_update delete checks only the changed scope', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'delete-scope', {
    elements: [
      { id: 'legacy-invalid', type: 'rectangle', text: '旧画板里的不可见文字', x: 20, y: 20, width: 180, height: 60 },
      { id: 'remove-me', type: 'rectangle', x: 20, y: 120, width: 180, height: 60 },
    ],
  })

  const result = await draw2codeUpdateTool(store).execute({
    root,
    name: 'delete-scope',
    safeMode: false,
    ops: [{ op: 'delete', id: 'remove-me' }],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'delete-scope')
  assert.equal(read.ok, true)
  assert.deepEqual(read.value.scene.elements.map((element) => element.id), ['legacy-invalid'])
})

test('draw2code_update anchors a semantic bottom navigation to the frame safe area', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  await assert.rejects(
    tool.execute({
      root,
      name: 'layout-bottom-nav',
      ops: [
        { op: 'upsert', element: { id: 'page', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 } },
        { op: 'upsert', element: { id: 'bottom-nav', type: 'rectangle', customData: { role: 'bottom-navigation' }, x: 20, y: 660, width: 380, height: 48 } },
      ],
    }, {}),
    /layout-invalid[\s\S]*bottom-nav[\s\S]*bottom safe area/i,
  )
})

test('draw2code_update accepts a complete low-fi mobile page layout', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'layout-valid',
    ops: [
      { op: 'upsert', element: { id: 'page', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 } },
      { op: 'upsert', element: { id: 'calendar-grid', type: 'text', text: '一 二 三 四 五 六 日\n1 2 3 4 5 6 7\n8 9 10 11 12 13 14\n15 16 17 18 19 20 21\n22 23 24 25 26 27 28', x: 20, y: 120, width: 380, height: 140 } },
      { op: 'upsert', element: { id: 'submit-button', type: 'rectangle', customData: { role: 'primary-action' }, x: 20, y: 560, width: 380, height: 48 } },
      { op: 'upsert', element: { id: 'submit-label', type: 'text', text: '查看穿搭建议', x: 140, y: 572, width: 140, height: 24, containerId: 'submit-button' } },
      { op: 'upsert', element: { id: 'bottom-nav', type: 'rectangle', customData: { role: 'bottom-navigation' }, x: 20, y: 780, width: 380, height: 64 } },
      { op: 'upsert', element: { id: 'bottom-nav-label', type: 'text', text: '万年历   穿搭推荐   我的', customData: { role: 'bottom-navigation-item' }, x: 40, y: 800, width: 340, height: 24 } },
    ],
  }, {})

  assert.equal(result.verified, true)
  assert.equal(result.layoutWarnings.length, 0)
})

test('draw2code_update aligns semantic controls without centering form values', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'semantic-control-alignment',
    ops: [
      { op: 'upsert', element: { id: 'page', type: 'frame', name: '查询页', x: 0, y: 0, width: 420, height: 860 } },
      { op: 'upsert', element: { id: 'city-select', type: 'rectangle', customData: { role: 'select' }, x: 20, y: 80, width: 380, height: 44 } },
      { op: 'upsert', element: { id: 'city-select-label', type: 'text', text: '上海 ▾ 定位城市', x: 32, y: 90, width: 356, height: 24, containerId: 'city-select' } },
      { op: 'upsert', element: { id: 'generate-button', type: 'rectangle', customData: { role: 'primary-action', tone: 'primary' }, x: 20, y: 650, width: 380, height: 48 } },
      { op: 'upsert', element: { id: 'generate-button-label', type: 'text', text: '生成本日穿搭建议', x: 20, y: 662, width: 380, height: 24, containerId: 'generate-button' } },
      { op: 'upsert', element: { id: 'bottom-nav', type: 'rectangle', customData: { role: 'bottom-navigation' }, x: 20, y: 790, width: 380, height: 60 } },
      { op: 'upsert', element: { id: 'calendar-tab', type: 'text', text: '日历', customData: { role: 'bottom-navigation-item' }, x: 20, y: 808, width: 126, height: 24 } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'semantic-control-alignment')
  assert.equal(read.ok, true)
  const byId = new Map(read.value.scene.elements.map((element) => [element.id, element]))
  assert.deepEqual(
    [byId.get('generate-button-label').textAlign, byId.get('generate-button-label').verticalAlign],
    ['center', 'middle'],
  )
  assert.deepEqual(
    [byId.get('calendar-tab').textAlign, byId.get('calendar-tab').verticalAlign],
    ['center', 'middle'],
  )
  assert.deepEqual(
    [byId.get('city-select-label').textAlign, byId.get('city-select-label').verticalAlign],
    ['left', 'middle'],
  )
})

test('draw2code_update centers a button label by geometry, not alignment metadata alone', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'button-label-geometry',
    ops: [
      { op: 'upsert', element: { id: 'save-button', type: 'rectangle', customData: { role: 'primary-action' }, x: 20, y: 640, width: 180, height: 52 } },
      { op: 'upsert', element: { id: 'save-label', type: 'text', text: '保存搭配', fontSize: 16, lineHeight: 1.25, textAlign: 'left', verticalAlign: 'top', x: 20, y: 640, width: 180, height: 52, containerId: 'save-button' } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'button-label-geometry')
  assert.equal(read.ok, true)
  const label = read.value.scene.elements.find((element) => element.id === 'save-label')
  assert.deepEqual(
    [label.textAlign, label.verticalAlign, label.y, label.height],
    ['center', 'middle', 656, 20],
  )
})

test('draw2code_update turns bottom navigation labels into independent centered items', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'bottom-nav-independent-items',
    ops: [
      { op: 'upsert', element: { id: 'page', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 } },
      { op: 'upsert', element: { id: 'bottom-nav', type: 'rectangle', customData: { role: 'bottom-navigation' }, x: 15, y: 790, width: 390, height: 60 } },
      { op: 'upsert', element: { id: 'nav-calendar', type: 'text', text: '日历', fontSize: 16, customData: { role: 'bottom-navigation-item' }, frameId: 'page', containerId: 'bottom-nav', textAlign: 'left', verticalAlign: 'top', x: 15, y: 790, width: 130, height: 60 } },
      { op: 'upsert', element: { id: 'nav-outfit', type: 'text', text: '衣橱', fontSize: 16, customData: { role: 'bottom-navigation-item' }, frameId: 'page', containerId: 'bottom-nav', textAlign: 'left', verticalAlign: 'top', x: 145, y: 790, width: 130, height: 60 } },
      { op: 'upsert', element: { id: 'nav-profile', type: 'text', text: '我的', fontSize: 16, customData: { role: 'bottom-navigation-item' }, frameId: 'page', containerId: 'bottom-nav', textAlign: 'left', verticalAlign: 'top', x: 275, y: 790, width: 130, height: 60 } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'bottom-nav-independent-items')
  assert.equal(read.ok, true)
  const byId = new Map(read.value.scene.elements.map((element) => [element.id, element]))
  for (const id of ['nav-calendar', 'nav-outfit', 'nav-profile']) {
    const item = byId.get(id)
    assert.deepEqual(
      [item.containerId, item.textAlign, item.verticalAlign, item.y, item.height],
      [null, 'center', 'middle', 810, 20],
    )
  }
  assert.equal(byId.get('bottom-nav').boundElements, null)
})

test('draw2code_update rejects an empty bottom navigation shell', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  await assert.rejects(
    tool.execute({
      root,
      name: 'empty-bottom-nav',
      ops: [
        { op: 'upsert', element: { id: 'page', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 } },
        { op: 'upsert', element: { id: 'bottom-nav', type: 'rectangle', customData: { role: 'bottom-navigation' }, x: 20, y: 790, width: 380, height: 60 } },
      ],
    }, {}),
    /layout-invalid[\s\S]*bottom-navigation-items-missing[\s\S]*bottom-nav/i,
  )
})

test('draw2code_update rejects overlapping bottom navigation items', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  await assert.rejects(
    tool.execute({
      root,
      name: 'overlapping-bottom-nav-items',
      ops: [
        { op: 'upsert', element: { id: 'page', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 } },
        { op: 'upsert', element: { id: 'bottom-nav', type: 'rectangle', customData: { role: 'bottom-navigation' }, x: 15, y: 790, width: 390, height: 60 } },
        { op: 'upsert', element: { id: 'nav-a', type: 'text', text: '日历', customData: { role: 'bottom-navigation-item' }, frameId: 'page', x: 15, y: 808, width: 130, height: 24 } },
        { op: 'upsert', element: { id: 'nav-b', type: 'text', text: '衣橱', customData: { role: 'bottom-navigation-item' }, frameId: 'page', x: 25, y: 808, width: 130, height: 24 } },
      ],
    }, {}),
    /layout-invalid[\s\S]*bottom-navigation-item-overlap[\s\S]*nav-a[\s\S]*nav-b/i,
  )
})

test('draw2code_update verifies semantic alignment repairs instead of retrying a successful write', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'semantic-alignment-verification',
    ops: [
      { op: 'upsert', element: { id: 'status-chip', type: 'rectangle', customData: { role: 'chip', tone: 'info' }, x: 20, y: 80, width: 100, height: 36 } },
      { op: 'upsert', element: { id: 'status-chip-label', type: 'text', text: '进行中', textAlign: 'left', verticalAlign: 'top', x: 20, y: 86, width: 100, height: 24, containerId: 'status-chip' } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'semantic-alignment-verification')
  assert.equal(read.ok, true)
  const label = read.value.scene.elements.find((element) => element.id === 'status-chip-label')
  assert.deepEqual([label.textAlign, label.verticalAlign], ['center', 'middle'])
})

test('draw2code_update does not realign an untouched component edited by the user', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'manual-alignment-preserved', {
    elements: [
      { id: 'manual-button', type: 'rectangle', customData: { role: 'primary-action' }, x: 20, y: 80, width: 220, height: 48, boundElements: [{ type: 'text', id: 'manual-label' }] },
      { id: 'manual-label', type: 'text', text: '用户手工左对齐', textAlign: 'left', verticalAlign: 'top', x: 20, y: 92, width: 220, height: 24, containerId: 'manual-button' },
    ],
  })
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'manual-alignment-preserved',
    ops: [
      { op: 'upsert', element: { id: 'unrelated-note', type: 'text', text: '只更新这一条说明', x: 20, y: 160, width: 220, height: 24 } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'manual-alignment-preserved')
  assert.equal(read.ok, true)
  const manualLabel = read.value.scene.elements.find((element) => element.id === 'manual-label')
  assert.deepEqual([manualLabel.textAlign, manualLabel.verticalAlign], ['left', 'top'])
})

test('draw2code_update rejects a newly bound component without a semantic role', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  await assert.rejects(
    tool.execute({
      root,
      name: 'missing-component-role',
      ops: [
        { op: 'upsert', element: { id: 'generate-button', type: 'rectangle', customData: { tone: 'primary' }, x: 20, y: 120, width: 380, height: 48 } },
        { op: 'upsert', element: { id: 'generate-button-label', type: 'text', text: '生成本日穿搭建议', x: 20, y: 132, width: 380, height: 24, containerId: 'generate-button' } },
      ],
    }, {}),
    /layout-invalid[\s\S]*component-role-missing[\s\S]*generate-button-label/i,
  )

  const board = await store.read(root, 'missing-component-role')
  assert.equal(board.ok, false)
})

test('draw2code_update rejects bottom navigation labels without item semantics', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  await assert.rejects(
    tool.execute({
      root,
      name: 'missing-bottom-nav-item-role',
      ops: [
        { op: 'upsert', element: { id: 'page', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 } },
        { op: 'upsert', element: { id: 'bottom-nav', type: 'rectangle', customData: { role: 'bottom-navigation' }, x: 20, y: 790, width: 380, height: 60 } },
        { op: 'upsert', element: { id: 'calendar-tab', type: 'text', text: '日历', x: 20, y: 808, width: 126, height: 24 } },
      ],
    }, {}),
    /layout-invalid[\s\S]*bottom-navigation-item-role-missing[\s\S]*calendar-tab/i,
  )
})

test('draw2code_update rejects a completed prototype page without enough visible mock data', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const page = {
    id: 'friends-page',
    type: 'frame',
    name: '好友列表',
    customData: { role: 'prototype-page', mockDataMin: 3 },
    x: 0,
    y: 0,
    width: 420,
    height: 860,
  }
  const firstTwoFriends = [
    { id: 'friend-1', type: 'text', text: '林小满 · 周末一起去徒步吗？ · 18:42', customData: { role: 'mock-data' }, frameId: 'friends-page', x: 24, y: 120, width: 360, height: 32 },
    { id: 'friend-2', type: 'text', text: '周可乐 · 碰一碰成功啦 · 14:20', customData: { role: 'mock-data' }, frameId: 'friends-page', x: 24, y: 180, width: 360, height: 32 },
  ]

  await assert.rejects(
    tool.execute({
      root,
      name: 'mock-data-gate',
      ops: [page, ...firstTwoFriends].map((element) => ({ op: 'upsert', element })),
    }, {}),
    /layout-invalid[\s\S]*mock-data-insufficient[\s\S]*requires 3[\s\S]*found 2/i,
  )

  const result = await tool.execute({
    root,
    name: 'mock-data-gate',
    ops: [
      page,
      ...firstTwoFriends,
      { id: 'friend-3', type: 'text', text: '陈一川 · 下次一起喝咖啡 · 昨天', customData: { role: 'mock-data' }, frameId: 'friends-page', x: 24, y: 240, width: 360, height: 32 },
    ].map((element) => ({ op: 'upsert', element })),
  }, {})

  assert.equal(result.verified, true)
  assert.equal(result.layoutWarnings.length, 0)
})

test('draw2code_update persists reciprocal bindings for visible component labels', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'bound-label-visible',
    ops: [
      { op: 'upsert', element: { id: 'category-chip', type: 'rectangle', customData: { role: 'chip' }, x: 20, y: 80, width: 96, height: 36, boundElements: [] } },
      { op: 'upsert', element: { id: 'category-chip-label', type: 'text', text: '搬家', x: 42, y: 88, width: 52, height: 24, containerId: 'category-chip' } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'bound-label-visible')
  assert.equal(read.ok, true)
  const chip = read.value.scene.elements.find((element) => element.id === 'category-chip')
  assert.deepEqual(chip.boundElements, [{ type: 'text', id: 'category-chip-label' }])
})

test('draw2code_update repairs text containerId pointing at a frame into visible frame membership', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'frame-membership-repair',
    ops: [
      { op: 'upsert', element: { id: 'radar-page', type: 'frame', name: '雷达首页', x: 0, y: 0, width: 420, height: 860 } },
      { op: 'upsert', element: { id: 'nearby-user', type: 'text', text: '林小满 · 300m', x: 40, y: 120, width: 180, height: 32, containerId: 'radar-page' } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'frame-membership-repair')
  assert.equal(read.ok, true)
  const nearbyUser = read.value.scene.elements.find((element) => element.id === 'nearby-user')
  assert.equal(nearbyUser.containerId, null)
  assert.equal(nearbyUser.frameId, 'radar-page')
})

test('ordinary scene writes do not silently repair an existing diagnostic board', async () => {
  const { root, store } = await makeStore()
  const written = await store.write(root, 'diagnostic-sample', {
    elements: [
      { id: 'category-chip', type: 'rectangle', x: 20, y: 80, width: 96, height: 36, boundElements: [] },
      { id: 'category-chip-label', type: 'text', text: '搬家', x: 42, y: 88, width: 52, height: 24, containerId: 'category-chip' },
    ],
  })
  assert.equal(written.ok, true)

  const read = await store.read(root, 'diagnostic-sample')
  assert.equal(read.ok, true)
  const chip = read.value.scene.elements.find((element) => element.id === 'category-chip')
  assert.deepEqual(chip.boundElements, [])
})

test('draw2code_update applies restrained semantic colors without overriding explicit colors', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'semantic-colors',
    ops: [
      { op: 'upsert', element: { id: 'work-list', type: 'rectangle', customData: { role: 'category-card', tone: 'primary' }, x: 20, y: 80, width: 240, height: 72 } },
      { op: 'upsert', element: { id: 'life-list', type: 'rectangle', customData: { role: 'category-card', tone: 'success' }, x: 20, y: 168, width: 240, height: 72 } },
      { op: 'upsert', element: { id: 'custom-list', type: 'rectangle', customData: { role: 'category-card', tone: 'warning' }, strokeColor: '#123456', backgroundColor: '#abcdef', x: 20, y: 256, width: 240, height: 72 } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'semantic-colors')
  assert.equal(read.ok, true)
  const byId = new Map(read.value.scene.elements.map((element) => [element.id, element]))
  assert.deepEqual(
    [byId.get('work-list').strokeColor, byId.get('work-list').backgroundColor],
    ['#4c6ef5', '#dbe4ff'],
  )
  assert.deepEqual(
    [byId.get('life-list').strokeColor, byId.get('life-list').backgroundColor],
    ['#40c057', '#d3f9d8'],
  )
  assert.deepEqual(
    [byId.get('custom-list').strokeColor, byId.get('custom-list').backgroundColor],
    ['#123456', '#abcdef'],
  )
})

test('draw2code_read caps multibyte element payloads by UTF-8 bytes', async () => {
  const { root, store } = await makeStore()
  const written = await store.write(root, 'read-payload-cap', {
    elements: Array.from({ length: 14 }, (_, index) => ({
      id: `card-${index}`,
      type: 'rectangle',
      customData: { mockData: '用户任务'.repeat(750) },
    })),
  })
  assert.equal(written.ok, true)

  const result = await draw2codeReadTool(store).execute({ root, name: 'read-payload-cap' }, {})

  assert.equal(result.elementCount, 14)
  assert.equal(result.elements.length, 1)
  assert.equal(result.elements[0].id, '__too_large__')
  assert.match(result.elements[0].text, /UTF-8 bytes/)
})

test('draw2code_generate carries existing prototype quality warnings forward', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'generate-quality', {
    elements: [
      { id: 'page', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'calendar-grid', type: 'text', text: '一 二 三 四 五 六 日\n1 2 3 4 5 6 7\n8 9 10 11 12 13 14\n15 16 17 18 19 20 21\n22 23 24 25 26 27 28', x: 20, y: 120, width: 380, height: 24 },
    ],
  })

  const tool = draw2codeGenerateTool(store)
  const started = await tool.execute({ root, action: 'start', name: 'generate-quality', styleNote: '简洁现代' }, {})
  const result = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'page-scope',
    values: ['首页'],
  }, {})

  assert.equal(result.status, 'blocked')
  assert.ok(result.blockers.some((warning) => warning.code === 'text-height-overflow'))
  assert.match(result.nextAction, /draw2code_update/)
})

test('draw2code_generate starts with an explicit page-scope choice instead of generating immediately', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'generate-scope', {
    elements: [
      { id: 'home', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'friends', type: 'frame', name: '好友列表', x: 460, y: 0, width: 420, height: 860 },
      { id: 'profile', type: 'frame', name: '个人中心', x: 920, y: 0, width: 420, height: 860 },
      { id: 'home-to-friends', type: 'arrow', x: 420, y: 400, width: 40, height: 0, points: [[0, 0], [40, 0]] },
    ],
  })

  const result = await draw2codeGenerateTool(store).execute({
    root,
    action: 'start',
    name: 'generate-scope',
    frames: ['首页'],
  }, {})

  assert.equal(result.status, 'question')
  assert.match(result.sessionId, /^generation-/)
  assert.equal(result.question.id, 'page-scope')
  assert.equal(result.question.selectionMode, 'multiple')
  assert.equal(result.question.askUserQuestionArgs.questions[0].multi_select, true)
  assert.deepEqual(result.question.options.map((option) => option.id), ['首页（推荐）', '好友列表（推荐）', '个人中心'])
  assert.deepEqual(result.question.options.map((option) => option.label), ['首页（推荐）', '好友列表（推荐）', '个人中心'])
  assert.deepEqual(result.question.recommendedValues, ['首页（推荐）', '好友列表（推荐）'])
  assert.equal(result.question.options.find((option) => option.valueLabel === '首页').reason, '用户本次明确点名')
  assert.equal(result.question.options.find((option) => option.valueLabel === '好友列表').reason, '与用户点名页面存在直接 Arrow 交互关系')
  assert.equal(result.outputDir, undefined)
  assert.equal(result.instructions, undefined)
})

test('draw2code_generate resumes choices, confirms once, and refuses completion without real preview evidence', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'generate-flow', {
    elements: [
      { id: 'home', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'home-title', type: 'text', text: '附近的人', frameId: 'home', x: 24, y: 80, width: 160, height: 32 },
      { id: 'friends', type: 'frame', name: '好友列表', x: 460, y: 0, width: 420, height: 860 },
      { id: 'friends-title', type: 'text', text: '好友消息', frameId: 'friends', x: 484, y: 80, width: 160, height: 32 },
      { id: 'friend-1', type: 'text', text: '林小满 · 刚刚在线', frameId: 'friends', x: 484, y: 140, width: 240, height: 32 },
      { id: 'friend-2', type: 'text', text: '周可乐 · 2分钟前', frameId: 'friends', x: 484, y: 190, width: 240, height: 32 },
      { id: 'friend-3', type: 'text', text: '陈一川 · 昨天聊过', frameId: 'friends', x: 484, y: 240, width: 240, height: 32 },
    ],
  })
  const tool = draw2codeGenerateTool(store)

  const started = await tool.execute({ root, action: 'start', name: 'generate-flow', frames: ['首页'] }, {})
  const visual = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'page-scope',
    values: ['首页'],
  }, {})
  assert.equal(visual.status, 'question')
  assert.equal(visual.question.id, 'visual-direction')
  assert.equal(visual.question.options.length, 5)

  const ready = await tool.execute({
    root,
    action: 'answer',
    sessionId: visual.sessionId,
    revision: visual.revision,
    questionId: 'visual-direction',
    values: ['young-vibrant'],
  }, {})
  assert.equal(ready.status, 'ready')
  assert.deepEqual(ready.brief.selectedPages, ['首页'])
  assert.equal(ready.brief.visualDirection, '年轻活力')
  assert.deepEqual(ready.confirmation.options.map((option) => option.id), ['confirm', 'revise-scope', 'revise-visual'])

  const resumed = await tool.execute({ root, action: 'resume', sessionId: ready.sessionId }, {})
  assert.equal(resumed.status, 'ready')
  assert.equal(resumed.question, undefined)
  assert.deepEqual(resumed.brief, ready.brief)

  const confirmed = await tool.execute({
    root,
    action: 'confirm',
    sessionId: ready.sessionId,
    revision: ready.revision,
  }, {})
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.outputDir, 'draw2code-pages/generate-flow/')
  assert.match(confirmed.instructions, /单文件/)
  assert.match(confirmed.instructions, /action=complete/)

  const premature = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    previewOpened: true,
    selectedPagesVisible: true,
    coreFlowPassed: false,
    mockDataVisible: true,
  }, {})
  assert.equal(premature.status, 'error')
  assert.equal(premature.error.code, 'verification-incomplete')

  const completed = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    previewOpened: true,
    selectedPagesVisible: true,
    coreFlowPassed: true,
    mockDataVisible: true,
  }, {})
  assert.equal(completed.status, 'completed')
  assert.deepEqual(completed.validation, {
    previewOpened: true,
    selectedPagesVisible: true,
    coreFlowPassed: true,
    mockDataVisible: true,
  })

  const regenerated = await tool.execute({ root, action: 'start', name: 'generate-flow' }, {})
  const inherited = await tool.execute({
    root,
    action: 'answer',
    sessionId: regenerated.sessionId,
    revision: regenerated.revision,
    questionId: 'page-scope',
    values: ['好友列表'],
  }, {})
  assert.equal(inherited.status, 'ready')
  assert.equal(inherited.brief.visualDirection, '年轻活力')
})

test('draw2code_generate rechecks a repaired prototype without repeating completed choices', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'generate-recheck', {
    elements: [
      { id: 'page', type: 'frame', name: '日历页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'calendar', type: 'text', text: '一 二 三 四 五 六 日\n1 2 3 4 5 6 7\n8 9 10 11 12 13 14', frameId: 'page', x: 20, y: 120, width: 380, height: 24 },
    ],
  })
  const tool = draw2codeGenerateTool(store)
  const started = await tool.execute({ root, action: 'start', name: 'generate-recheck', styleNote: '数据清晰' }, {})
  const blocked = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'page-scope',
    values: ['日历页'],
  }, {})
  assert.equal(blocked.status, 'blocked')

  await store.write(root, 'generate-recheck', {
    elements: [
      { id: 'page', type: 'frame', name: '日历页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'calendar', type: 'text', text: '一 二 三 四 五 六 日\n1 2 3 4 5 6 7\n8 9 10 11 12 13 14', frameId: 'page', x: 20, y: 120, width: 380, height: 120 },
    ],
  })
  const ready = await tool.execute({
    root,
    action: 'recheck',
    sessionId: blocked.sessionId,
    revision: blocked.revision,
  }, {})
  assert.equal(ready.status, 'ready')
  assert.equal(ready.question, undefined)
  assert.deepEqual(ready.brief.selectedPages, ['日历页'])
  assert.equal(ready.brief.visualDirection, '数据清晰')
})

test('draw2code_generate blocks a hand-drawn repeated-content page without readable mock data', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'generate-mock-data', {
    elements: [
      { id: 'friends', type: 'frame', name: '好友列表', x: 0, y: 0, width: 420, height: 860 },
      { id: 'title', type: 'text', text: '好友列表', frameId: 'friends', x: 24, y: 60, width: 180, height: 32 },
      { id: 'empty-row', type: 'rectangle', frameId: 'friends', x: 24, y: 120, width: 372, height: 64 },
    ],
  })
  const tool = draw2codeGenerateTool(store)
  const started = await tool.execute({ root, action: 'start', name: 'generate-mock-data', styleNote: '年轻活力' }, {})
  const blocked = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'page-scope',
    values: ['好友列表'],
  }, {})

  assert.equal(blocked.status, 'blocked')
  assert.ok(blocked.blockers.some((issue) => issue.code === 'mock-data-insufficient'))
})

test('draw2code_generate asks for a main device only when selected frames mix mobile and desktop', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'generate-device', {
    elements: [
      { id: 'mobile', type: 'frame', name: '移动首页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'mobile-title', type: 'text', text: '移动端首页内容', frameId: 'mobile', x: 24, y: 80, width: 200, height: 32 },
      { id: 'desktop', type: 'frame', name: '桌面首页', x: 460, y: 0, width: 1280, height: 800 },
      { id: 'desktop-title', type: 'text', text: '桌面端首页内容', frameId: 'desktop', x: 484, y: 80, width: 200, height: 32 },
    ],
  })
  const tool = draw2codeGenerateTool(store)
  const started = await tool.execute({ root, action: 'start', name: 'generate-device' }, {})
  const device = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'page-scope',
    values: ['移动首页', '桌面首页'],
  }, {})

  assert.equal(device.status, 'question')
  assert.equal(device.question.id, 'target-device')
  assert.deepEqual(device.question.options.map((option) => option.id), ['mobile', 'desktop', 'separate'])
})

test('draw2code_generate requires proof that unselected pages survived regeneration', async () => {
  const { root, canonicalRoot, store } = await makeStore()
  await store.write(root, 'generate-existing', {
    elements: [
      { id: 'stats', type: 'frame', name: '统计页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'stats-data', type: 'text', text: '本周完成 18 项\n完成率 78%\n连续打卡 7 天', frameId: 'stats', x: 24, y: 100, width: 280, height: 100 },
    ],
  })
  await mkdir(join(canonicalRoot, 'draw2code-pages/generate-existing'), { recursive: true })
  await writeFile(join(canonicalRoot, 'draw2code-pages/generate-existing/index.html'), '<main>首页、清单页、统计页</main>', 'utf8')
  const tool = draw2codeGenerateTool(store)
  const started = await tool.execute({ root, action: 'start', name: 'generate-existing', styleNote: '数据清晰' }, {})
  const ready = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'page-scope',
    values: ['统计页'],
  }, {})
  assert.equal(ready.status, 'ready')
  assert.match(ready.brief.pageChanges, /未选择页面保持不变/)

  const confirmed = await tool.execute({ root, action: 'confirm', sessionId: ready.sessionId, revision: ready.revision }, {})
  const incomplete = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    previewOpened: true,
    selectedPagesVisible: true,
    coreFlowPassed: true,
    mockDataVisible: true,
  }, {})
  assert.equal(incomplete.status, 'error')
  assert.match(incomplete.error.message, /unselectedPagesPreserved/)
})

test('draw2code_generate inherits create brief page recommendations and deferred visual intent', async () => {
  const { root, store, projects } = await makeStore()
  await store.write(root, 'brief-board', {
    elements: [
      { id: 'home', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'home-content', type: 'text', text: '发现附近的人', frameId: 'home', x: 24, y: 80, width: 200, height: 32 },
      { id: 'profile', type: 'frame', name: '个人中心', x: 460, y: 0, width: 420, height: 860 },
      { id: 'profile-content', type: 'text', text: '林小满 · 已完成资料 80%', frameId: 'profile', x: 484, y: 80, width: 260, height: 32 },
    ],
  })
  const created = await projects.create(root, {
    projectId: 'project-00000000-0000-4000-8000-000000000001',
    projectName: '雷达社交APP',
    originalIdea: '类似龙珠雷达的陌生人社交APP',
    status: 'confirmed',
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    boardName: 'brief-board',
    deferredStyleNote: '未来科技',
    answers: {},
    currentQuestion: null,
    pendingInterpretation: null,
    brief: { pages: ['首页'] },
    history: [],
  })
  assert.equal(created.ok, true)

  const tool = draw2codeGenerateTool(store, projects)
  const started = await tool.execute({ root, action: 'start', name: 'brief-board' }, {})
  assert.deepEqual(started.question.recommendedValues, ['首页（推荐）'])
  const ready = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'page-scope',
    values: ['首页'],
  }, {})
  assert.equal(ready.status, 'ready')
  assert.equal(ready.brief.visualDirection, '未来科技')
})

test('draw2code_create starts a choice-first draft without touching the board', async () => {
  const { root, canonicalRoot, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)

  const result = await tool.execute({
    root,
    action: 'start',
    idea: '万年历穿搭工具',
    projectName: '万年历穿搭',
  }, {})

  assert.equal(result.status, 'question')
  assert.equal(result.question.id, 'target-platform')
  assert.equal(result.question.selectionMode, 'single')
  assert.ok(result.question.options.some((option) => option.id === 'web'))
  assert.equal(result.question.allowOther, true)
  assert.equal(result.nameProposal.suggestedName, '万年历穿搭')
  assert.match(result.projectFile, /^draw2code\/\.projects\/project-[^/]+\.json$/)
  const rendered = tool.output.render({ root, action: 'start', idea: '万年历穿搭工具' }, result)
  assert.match(rendered[0].text, /sessionId=project-/)
  assert.match(rendered[0].text, /revision=1/)
  assert.match(rendered[0].text, /questionId=target-platform/)
  assert.match(rendered[0].text, /web — Web/)

  const boards = await store.list(root)
  assert.equal(boards.ok, true)
  assert.deepEqual(boards.value, [])
  const draft = JSON.parse(await readFile(join(canonicalRoot, result.projectFile), 'utf8'))
  assert.equal(draft.status, 'draft')
  assert.equal(draft.revision, 1)
  assert.equal(draft.originalIdea, '万年历穿搭工具')
})

test('draw2code_create requires the agent to infer a project name instead of clipping the idea', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)

  const result = await tool.execute({
    root,
    action: 'start',
    idea: '根据万年历和我衣柜里衣服的APP',
  }, {})

  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'project_name_required')
  assert.match(result.error.message, /完整需求.*概括.*projectName/)
  const boards = await store.list(root)
  assert.equal(boards.ok, true)
  assert.deepEqual(boards.value, [])
})

test('draw2code_create rejects a copied raw idea instead of treating it as an inferred name', async () => {
  const { root, projects, store } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)

  const result = await tool.execute({
    root,
    action: 'start',
    idea: '根据万年历和我衣柜里衣服的APP',
    projectName: '根据万年历和我衣柜里衣服的APP',
  }, {})

  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'project_name_invalid')
  assert.match(result.error.message, /不能直接复制完整 idea.*重新概括/)
})

test('draw2code_create uses the agent-inferred name without an 原型 suffix', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)

  const result = await tool.execute({
    root,
    action: 'start',
    idea: '根据万年历和我衣柜里衣服的APP',
    projectName: '衣历穿搭',
  }, {})

  assert.equal(result.status, 'question')
  assert.equal(result.nameProposal.suggestedName, '衣历穿搭')

  let state = result
  const answers = [
    ['target-platform', ['web']],
    ['core-user', ['consumer']],
    ['core-goal', ['query']],
    ['core-flow', ['daily-outfit']],
    ['core-modules', ['calendar']],
    ['core-pages', ['query', 'weather', 'recommendation']],
  ]
  for (const [questionId, values] of answers) {
    state = await tool.execute({
      root,
      action: 'answer',
      sessionId: state.sessionId,
      revision: state.revision,
      questionId,
      values,
    }, {})
  }
  assert.equal(state.status, 'ready')
  const confirmed = await tool.execute({
    root,
    action: 'confirm',
    sessionId: state.sessionId,
    revision: state.revision,
  }, {})
  assert.equal(confirmed.boardName, '衣历穿搭')
})

test('draw2code_create persists answers, returns one next question, and is idempotent', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '万年历穿搭工具', projectName: '万年历穿搭' }, {})

  const answerArgs = {
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'target-platform',
    values: ['web'],
  }
  const answered = await tool.execute(answerArgs, {})
  assert.equal(answered.status, 'question')
  assert.equal(answered.question.id, 'core-user')
  assert.equal(answered.revision, started.revision + 1)

  const duplicate = await tool.execute(answerArgs, {})
  assert.equal(duplicate.idempotent, true)
  const { idempotent: _idempotent, ...duplicateWithoutMarker } = duplicate
  assert.deepEqual(duplicateWithoutMarker, answered)
})

test('draw2code_create stores free text directly and uses the final brief as the single confirmation', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '一个生活工具', projectName: '生活助手' }, {})

  const answered = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'target-platform',
    values: ['other'],
    otherText: '先做小程序，后面再扩展到 Web',
  }, {})

  assert.equal(answered.status, 'question')
  assert.equal(answered.question.id, 'core-user')
  assert.equal(answered.question.kind, 'choice')
  assert.equal(answered.revision, started.revision + 1)
})

test('draw2code_create finishes a radar social app brief in five useful questions plus one final confirmation', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  let state = await tool.execute({
    root,
    action: 'start',
    idea: '我想做一个类似龙珠雷达的陌生人社交APP。',
    projectName: '龙珠雷达社交',
  }, {})

  assert.equal(state.nameProposal.suggestedName, '龙珠雷达社交')
  const questionIds = [state.question.id]
  assert.equal(state.question.id, 'core-user')

  state = await tool.execute({
    root,
    action: 'answer',
    sessionId: state.sessionId,
    revision: state.revision,
    questionId: 'core-user',
    values: ['consumer'],
  }, {})
  questionIds.push(state.question.id)
  assert.equal(state.question.id, 'core-goal')
  assert.ok(state.question.options.some((option) => option.id === 'discover-nearby'))

  state = await tool.execute({
    root,
    action: 'answer',
    sessionId: state.sessionId,
    revision: state.revision,
    questionId: 'core-goal',
    values: ['other'],
    otherText: '发现附近的陌生人，见面碰一碰后才能成为好友',
  }, {})
  questionIds.push(state.question.id)
  assert.equal(state.question.id, 'core-flow')
  assert.equal(state.question.kind, 'choice')
  assert.ok(state.question.options.some((option) => option.id === 'radar-bump-chat'))

  state = await tool.execute({
    root,
    action: 'answer',
    sessionId: state.sessionId,
    revision: state.revision,
    questionId: 'core-flow',
    values: ['radar-bump-chat'],
  }, {})
  questionIds.push(state.question.id)
  assert.equal(state.question.id, 'core-modules')
  assert.ok(state.question.options.some((option) => option.id === 'radar-home'))
  assert.ok(state.question.options.some((option) => option.id === 'friends-chat'))

  state = await tool.execute({
    root,
    action: 'answer',
    sessionId: state.sessionId,
    revision: state.revision,
    questionId: 'core-modules',
    values: ['radar-home', 'bump-connect', 'friends-chat', 'profile-history'],
  }, {})
  questionIds.push(state.question.id)
  assert.equal(state.question.id, 'core-pages')
  assert.ok(state.question.options.some((option) => option.id === 'bump-confirm'))

  state = await tool.execute({
    root,
    action: 'answer',
    sessionId: state.sessionId,
    revision: state.revision,
    questionId: 'core-pages',
    values: ['radar-home', 'bump-confirm', 'friends-chat'],
  }, {})

  assert.deepEqual(questionIds, ['core-user', 'core-goal', 'core-flow', 'core-modules', 'core-pages'])
  assert.equal(state.status, 'ready')
  assert.equal(state.revision, 6)
  assert.equal(state.brief.targetPlatform, 'App')
  assert.equal(state.brief.goal, '发现附近的陌生人，见面碰一碰后才能成为好友')
  assert.ok(state.brief.modules.includes('雷达首页（扫描附近的人）'))
  assert.equal(state.brief.mockDataPolicy.minimumRecordsPerRepeatedComponent, 3)
  assert.match(state.brief.mockDataPolicy.rule, /不能使用空白方框|真实示例内容/)
  const radarMock = state.brief.pageMockData.find((page) => page.pageId === 'radar-home')
  assert.deepEqual(radarMock.examples, ['林小满 · 300m', '周可乐 · 500m', '陈一川 · 800m'])
  const friendsChatMock = state.brief.pageMockData.find((page) => page.pageId === 'friends-chat')
  assert.equal(friendsChatMock.minimumRecords, 3)
  assert.ok(friendsChatMock.requiredContent.some((item) => /最近消息和时间/.test(item)))
  assert.ok(friendsChatMock.requiredContent.some((item) => /双方对话/.test(item)))

  const confirmed = await tool.execute({
    root,
    action: 'confirm',
    sessionId: state.sessionId,
    revision: state.revision,
  }, {})
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.revision, 7)
  assert.equal(confirmed.boardName, '龙珠雷达社交')
})

test('draw2code_create rejects stale answers without overwriting the draft', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '万年历穿搭工具', projectName: '万年历穿搭' }, {})

  const stale = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision + 99,
    questionId: 'target-platform',
    values: ['app'],
  }, {})

  assert.equal(stale.status, 'error')
  assert.equal(stale.error.code, 'stale_revision')
  assert.equal(stale.error.recoverable, true)
  assert.equal(stale.current.revision, started.revision)
})

test('draw2code_create lists and resumes drafts without guessing from silence', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '一个未完成的新工具', projectName: '新工具' }, {})

  const listed = await tool.execute({ root, action: 'list' }, {})
  assert.equal(listed.status, 'drafts')
  assert.equal(listed.drafts[0].sessionId, started.sessionId)
  assert.equal(listed.drafts[0].status, 'draft')

  const resumed = await tool.execute({ root, action: 'resume', sessionId: started.sessionId }, {})
  assert.equal(resumed.status, 'question')
  assert.equal(resumed.question.id, 'target-platform')

  const abandoned = await tool.execute({
    root,
    action: 'abandon',
    sessionId: started.sessionId,
    revision: resumed.revision,
  }, {})
  assert.equal(abandoned.status, 'abandoned')
  const listedAfter = await tool.execute({ root, action: 'list' }, {})
  assert.equal(listedAfter.drafts.length, 0)
})

test('draw2code_create confirms an isolated board and hands off to update', async () => {
  const { root, store, projects } = await makeStore()
  const create = draw2codeCreateTool(projects, store)
  const update = draw2codeUpdateTool(store)

  await store.setActiveBoard(root, 'prototype')
  await store.write(root, 'prototype', {
    elements: [{ id: 'old-user-content', type: 'text', text: '用户保留内容' }],
  })

  let state = await create.execute({ root, action: 'start', idea: '万年历穿搭工具', projectName: '万年历穿搭' }, {})
  const answers = [
    ['target-platform', ['web']],
    ['core-user', ['consumer']],
    ['core-goal', ['query']],
    ['core-flow', ['daily-outfit']],
    ['core-modules', ['calendar', 'weather', 'outfit']],
    ['core-pages', ['query', 'weather', 'recommendation']],
  ]
  for (const [questionId, values] of answers) {
    state = await create.execute({
      root,
      action: 'answer',
      sessionId: state.sessionId,
      revision: state.revision,
      questionId,
      values,
    }, {})
  }

  assert.equal(state.status, 'ready')
  assert.equal(state.brief.pages.length, 3)
  assert.equal(state.brief.deferredStyleNote, null)

  const confirmed = await create.execute({
    root,
    action: 'confirm',
    sessionId: state.sessionId,
    revision: state.revision,
  }, {})

  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.nextAction, 'draw2code_update')
  assert.equal(confirmed.boardName, '万年历穿搭')
  assert.equal(confirmed.activeBoard, confirmed.boardName)

  const oldBoard = await store.read(root, 'prototype')
  assert.equal(oldBoard.ok, true)
  assert.equal(oldBoard.value.scene.elements[0].id, 'old-user-content')
  const newBoard = await store.read(root, confirmed.boardName)
  assert.equal(newBoard.ok, true)
  assert.deepEqual(newBoard.value.scene.elements, [])

  const drawn = await update.execute({
    root,
    name: confirmed.boardName,
    ops: [
      { op: 'upsert', element: { id: 'page-query', type: 'frame', name: '日期查询', x: 0, y: 0, width: 420, height: 720 } },
      { op: 'upsert', element: { id: 'query-title', type: 'text', text: '选择日期和城市', x: 24, y: 32, width: 300, height: 40 } },
    ],
  }, {})
  assert.equal(drawn.verified, true)
  assert.equal(drawn.targetBoard, confirmed.boardName)
  assert.equal(drawn.activeBoard, confirmed.boardName)
})
