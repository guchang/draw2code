import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { deflateSync } from 'node:zlib'
import {
  ProjectStore,
  SceneStore,
  draw2codeCreateTool,
  draw2codeGenerateTool,
  draw2codeReadTool,
  draw2codeUpdateTool,
  inspectPrototypeQuality,
  normalizeOpsArg,
} from '../dist/index.js'

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

function artifactHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii')
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  name.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length)
  return chunk
}

function pngImage(width, height) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc(height * (1 + width * 4))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function browserEvidence(root, board, pageTexts, { preserveExisting = false, writeOutput = true } = {}) {
  const pageNames = Object.keys(pageTexts)
  const artifactDir = join(root, 'artifacts')
  await mkdir(artifactDir, { recursive: true })
  const previewPath = join(root, 'draw2code-pages', board, 'index.html')
  await mkdir(dirname(previewPath), { recursive: true })
  if (writeOutput) {
    const pageBlocks = Object.entries(pageTexts).map(([page, texts]) => '<!-- d2c-page:' + page + ':start -->'
      + '<section>' + texts.join(' ') + '</section>'
      + '<!-- d2c-page:' + page + ':end -->').join('')
    await writeFile(previewPath, '<!doctype html><html><body>' + pageBlocks + '</body></html>', 'utf8')
  }
  const outputSha256 = artifactHash(await readFile(previewPath))
  const captureId = 'capture-' + outputSha256.slice(0, 16)
  const screenshots = []
  const domSnapshots = []
  for (const [index, page] of pageNames.entries()) {
    const imageBytes = pngImage(390, 844)
    const imagePath = join(artifactDir, 'page-' + index + '.png')
    await writeFile(imagePath, imageBytes)
    screenshots.push({
      page,
      viewport: '390x844',
      source: imagePath,
      sha256: artifactHash(imageBytes),
      captureId,
    })
    const domBytes = Buffer.from(pageTexts[page].join('\n'), 'utf8')
    const domPath = join(artifactDir, 'page-' + index + '.txt')
    await writeFile(domPath, domBytes)
    domSnapshots.push({
      page,
      source: domPath,
      sha256: artifactHash(domBytes),
      captureId,
    })
  }
  return {
    captureId,
    outputSha256,
    previewUrl: pathToFileURL(previewPath).href,
    viewports: [{ width: 390, height: 844 }],
    screenshots,
    domSnapshots,
    consoleErrors: [],
    consoleWarnings: [],
    domChecks: [
      { name: 'selected-pages', passed: true, details: '已检查：' + pageNames.join('、') },
      { name: 'mock-data', passed: true, details: '页面真实 mock 数据均可见' },
      ...(preserveExisting ? [{ name: 'unselected-pages-preserved', passed: true, details: '未选择页面仍可见且文案一致' }] : []),
    ],
    layoutChecks: [
      { name: 'no-horizontal-overflow', passed: true, details: 'scrollWidth 未超过 clientWidth' },
      { name: 'content-not-clipped', passed: true, details: '关键组件均在可视容器内' },
      { name: 'button-text-centered', passed: true, details: '按钮文字中心与按钮中心一致' },
      { name: 'bottom-navigation-complete', passed: true, details: '底部导航栏目完整且位置一致' },
    ],
    interactionChecks: [
      { name: 'core-flow', passed: true, details: '已实际点击并走通核心成功流程' },
      ...(pageNames.length > 1 ? [{ name: 'page-switching', passed: true, details: '已实际切换全部所选页面' }] : []),
    ],
  }
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

test('first-render Excalidraw metadata is ignored without hiding later z-order or geometry edits', () => {
  const base = [{ id: 'card', type: 'rectangle', x: 20, y: 40, width: 200, height: 80, version: 1, versionNonce: 11, updated: 100 }]
  const normalized = [{ ...base[0], index: 'a0', version: 2, versionNonce: 22, updated: 200 }]
  assert.equal(sync.isNormalizationOnlyEcho(base, normalized), true)
  assert.equal(sync.isNormalizationOnlyEcho(normalized, [{ ...normalized[0], index: 'a1', version: 3 }]), false)
  assert.equal(sync.isNormalizationOnlyEcho(normalized, [{ ...normalized[0], x: 28, version: 3 }]), false)
  const second = { id: 'second', type: 'text', text: '第二层', version: 1, versionNonce: 33, updated: 100 }
  assert.equal(sync.isNormalizationOnlyEcho([base[0], second], [
    { ...second, index: 'a0', version: 2 },
    { ...base[0], index: 'a1', version: 2 },
  ]), false)
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
      request: { id: 'reveal-abc-1', board: '登录流程', revision: 7, createdAt: 123 },
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

test('a stale save cannot resurrect a deleted board', async () => {
  const { root, store } = await makeStore()
  const created = await store.write(root, 'deleted-board', { elements: [{ id: 'old', type: 'text', text: '旧内容' }] }, 0)
  assert.equal(created.ok, true)
  assert.equal((await store.remove(root, 'deleted-board')).ok, true)

  const stale = await store.write(root, 'deleted-board', { elements: [{ id: 'late', type: 'text', text: '晚到保存' }] }, created.value.rev)
  assert.equal(stale.ok, false)
  assert.equal(stale.error.code, 'conflict')
  const read = await store.read(root, 'deleted-board')
  assert.equal(read.ok, false)
  assert.equal(read.error.code, 'not-found')
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

test('an explicit non-active update selects and reveals the target board', async () => {
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
  assert.equal(typeof result.revealRequestId, 'string')

  const active = await store.getActiveBoard(root)
  assert.equal(active.ok, true)
  assert.equal(active.value.name, 'prototype')

  const reveal = await store.getBoardReveal(root)
  assert.equal(reveal.ok, true)
  assert.equal(reveal.value.request.board, 'prototype')
  assert.equal(reveal.value.request.id, result.revealRequestId)
})

test('draw2code_update render exposes write, completion, quality, and reveal evidence', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const result = await tool.execute({
    root,
    name: '可见回归',
    ops: [{ op: 'upsert', element: { id: 'title', type: 'text', text: '任务列表' } }],
  }, {})

  const rendered = tool.output.render({}, result)
  assert.match(rendered[0].text, /verified=true/)
  assert.match(rendered[0].text, /writeVerified=true/)
  assert.match(rendered[0].text, /completionReady=false/)
  assert.match(rendered[0].text, /visualReviewRequired=false/)
  assert.match(rendered[0].text, new RegExp(`revealRequestId=${result.revealRequestId}`))
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

test('draw2code_update uses a rectangle page shell and rejects a new prototype frame', async () => {
  const { root, store } = await makeStore()
  const update = draw2codeUpdateTool(store)

  await assert.rejects(
    update.execute({
      root,
      name: 'no-frame-pages',
      ops: [{
        op: 'upsert',
        element: {
          id: 'legacy-shaped-new-page',
          type: 'frame',
          name: '任务列表',
          x: 0,
          y: 40,
          width: 390,
          height: 844,
          customData: { role: 'prototype-page', mockDataMin: 3 },
        },
      }],
    }, {}),
    /prototype-page-frame-deprecated/u,
  )

  const result = await update.execute({
    root,
    name: 'no-frame-pages',
    ops: [
      { op: 'upsert', element: { id: 'page-list', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务列表', mockDataMin: 3 } } },
      { op: 'upsert', element: { id: 'page-list-label', type: 'text', text: '任务列表', x: 0, y: 4, width: 180, height: 28, customData: { role: 'prototype-page-label', pageId: 'page-list' } } },
      { op: 'upsert', element: { id: 'task-a', type: 'text', text: '修复登录闪退 · 进行中', frameId: 'page-list', x: 24, y: 140, width: 320, height: 32, customData: { role: 'mock-data' } } },
      { op: 'upsert', element: { id: 'task-b', type: 'text', text: '评审需求文档 · 14:00', x: 24, y: 200, width: 320, height: 32, customData: { role: 'mock-data' } } },
      { op: 'upsert', element: { id: 'task-c', type: 'text', text: '整理回归用例 · 已完成', x: 24, y: 260, width: 320, height: 32, customData: { role: 'mock-data' } } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const board = await store.read(root, 'no-frame-pages')
  assert.equal(board.ok, true)
  assert.equal(board.value.scene.elements.some((element) => element.type === 'frame'), false)
  assert.equal(board.value.scene.elements.filter((element) => element.id.startsWith('task-')).every((element) => element.frameId === null), true)
})

test('draw2code_update applies mock-data quality gates to rectangle page shells', async () => {
  const { root, store } = await makeStore()
  const update = draw2codeUpdateTool(store)

  await assert.rejects(
    update.execute({
      root,
      name: 'page-shell-mock-gate',
      ops: [
        { op: 'upsert', element: { id: 'page', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '好友列表', mockDataMin: 3 } } },
        { op: 'upsert', element: { id: 'page-label', type: 'text', text: '好友列表', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'page' } } },
        { op: 'upsert', element: { id: 'only-row', type: 'text', text: '林小满 · 18:42 在线', x: 24, y: 140, width: 320, height: 32, customData: { role: 'mock-data' } } },
      ],
    }, {}),
    /mock-data-insufficient/u,
  )
})

test('draw2code_update rechecks a rectangle page when mock data is deleted or loses its role', async () => {
  const { root, store } = await makeStore()
  const update = draw2codeUpdateTool(store)
  const page = { id: 'page', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '好友列表', mockDataMin: 3 } }
  const pageLabel = { id: 'page-label', type: 'text', text: '好友列表', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'page' } }
  const records = [
    { id: 'friend-a', type: 'text', text: '林小满 · 18:42 在线', x: 24, y: 140, width: 320, height: 32, customData: { role: 'mock-data' } },
    { id: 'friend-b', type: 'text', text: '周可乐 · 14:20 已读', x: 24, y: 200, width: 320, height: 32, customData: { role: 'mock-data' } },
    { id: 'friend-c', type: 'text', text: '陈一川 · 昨天聊过', x: 24, y: 260, width: 320, height: 32, customData: { role: 'mock-data' } },
  ]
  assert.equal((await update.execute({
    root,
    name: 'page-shell-incremental-mock-gate',
    ops: [page, pageLabel, ...records].map((element) => ({ op: 'upsert', element })),
  }, {})).verified, true)

  await assert.rejects(
    update.execute({
      root,
      name: 'page-shell-incremental-mock-gate',
      ops: [{ op: 'delete', id: 'friend-c' }],
    }, {}),
    /mock-data-insufficient/u,
  )
  await assert.rejects(
    update.execute({
      root,
      name: 'page-shell-incremental-mock-gate',
      ops: [{ op: 'upsert', element: { ...records[2], customData: { role: 'helper-text' } } }],
    }, {}),
    /mock-data-insufficient/u,
  )

  const board = await store.read(root, 'page-shell-incremental-mock-gate')
  assert.equal(board.ok, true)
  assert.equal(board.value.scene.elements.find((element) => element.id === 'friend-c').customData.role, 'mock-data')
})

test('draw2code_update requires a mock-data minimum and one external label on each new page shell', async () => {
  const { root, store } = await makeStore()
  const update = draw2codeUpdateTool(store)
  await assert.rejects(
    update.execute({
      root,
      name: 'page-shell-contract',
      ops: [{ op: 'upsert', element: { id: 'page', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务列表' } } }],
    }, {}),
    /prototype-page-mock-min-missing[\s\S]*prototype-page-label-missing/u,
  )
})

test('draw2code_read exposes rectangle pages and cross-page relations without claiming the arrow', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'page-relations', {
    elements: [
      { id: 'page-list', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务列表' } },
      { id: 'page-list-label', type: 'text', text: '任务列表', x: 0, y: 4, width: 180, height: 28, customData: { role: 'prototype-page-label', pageId: 'page-list' } },
      { id: 'open-detail', type: 'rectangle', x: 286, y: 120, width: 80, height: 40, customData: { role: 'button' } },
      { id: 'list-filter', type: 'rectangle', x: 24, y: 120, width: 80, height: 40, customData: { role: 'button' } },
      { id: 'same-page-flow', type: 'arrow', x: -600, y: -200, width: 100, height: 0, points: [[0, 0], [100, 0]], startBinding: { elementId: 'list-filter', focus: 0, gap: 4 }, endBinding: { elementId: 'open-detail', focus: 0, gap: 4 } },
      { id: 'page-detail', type: 'rectangle', x: 480, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务详情' } },
      { id: 'page-detail-label', type: 'text', text: '任务详情', x: 480, y: 4, width: 180, height: 28, customData: { role: 'prototype-page-label', pageId: 'page-detail' } },
      {
        id: 'open-detail-flow',
        type: 'arrow',
        x: 366,
        y: 140,
        width: 114,
        height: 0,
        points: [[0, 0], [114, 0]],
        frameId: null,
        startBinding: { elementId: 'open-detail', focus: 0, gap: 4 },
        endBinding: { elementId: 'page-detail', focus: 0, gap: 4 },
      },
      { id: 'open-detail-flow-label', type: 'text', text: '查看详情', x: 400, y: 112, width: 72, height: 24, containerId: 'open-detail-flow' },
    ],
  })

  const read = await draw2codeReadTool(store).execute({ root, name: 'page-relations' }, {})
  assert.deepEqual(read.pageNames, ['任务列表', '任务详情'])
  assert.equal(read.pages[0].kind, 'page-shell')
  assert.equal(read.pages[0].elementIds.includes('open-detail'), true)
  assert.equal(read.pages[0].elementIds.includes('same-page-flow'), true)
  assert.equal(read.pages[0].elementIds.includes('open-detail-flow'), false)
  assert.equal(read.pages.every((page) => !page.elementIds.includes('open-detail-flow-label')), true)
  assert.deepEqual(read.pageRelations, [{
    id: 'open-detail-flow',
    sourcePage: '任务列表',
    targetPage: '任务详情',
    sourceElementId: 'open-detail',
    targetElementId: 'page-detail',
    label: '查看详情',
  }])
  assert.deepEqual(read.frameNames, ['任务列表', '任务详情'])
})

test('an existing binding target with no unique page does not fall back to endpoint coordinates', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'binding-priority', {
    elements: [
      { id: 'page-a', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '页面 A' } },
      { id: 'page-b', type: 'rectangle', x: 480, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '页面 B' } },
      { id: 'source', type: 'rectangle', x: 300, y: 120, width: 60, height: 40 },
      { id: 'outside-target', type: 'rectangle', x: 1000, y: 120, width: 60, height: 40 },
      { id: 'bound-arrow', type: 'arrow', x: 360, y: 140, width: 120, height: 0, points: [[0, 0], [120, 0]], startBinding: { elementId: 'source', focus: 0, gap: 4 }, endBinding: { elementId: 'outside-target', focus: 0, gap: 4 } },
    ],
  })

  const read = await draw2codeReadTool(store).execute({ root, name: 'binding-priority' }, {})
  assert.deepEqual(read.pageRelations, [])
})

test('draw2code_read supports mixed rectangle pages and legacy frames without migrating either', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'mixed-page-models', {
    elements: [
      { id: 'modern', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务列表' } },
      { id: 'modern-label', type: 'text', text: '任务列表', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'modern' } },
      { id: 'modern-title', type: 'text', text: '今天的任务', x: 24, y: 100, width: 240, height: 32 },
      { id: 'legacy', type: 'frame', name: '任务详情', x: 480, y: 40, width: 390, height: 844 },
      { id: 'legacy-title', type: 'text', text: '修复登录闪退', frameId: 'legacy', x: 504, y: 100, width: 240, height: 32 },
    ],
  })

  const read = await draw2codeReadTool(store).execute({ root, name: 'mixed-page-models' }, {})
  assert.deepEqual(read.pageNames, ['任务列表', '任务详情'])
  assert.deepEqual(read.frameNames, ['任务列表', '任务详情'])
  assert.deepEqual(read.pages.map((page) => page.kind), ['page-shell', 'legacy-frame'])

  const board = await store.read(root, 'mixed-page-models')
  assert.equal(board.ok, true)
  assert.equal(board.value.scene.elements.find((element) => element.id === 'modern').type, 'rectangle')
  assert.equal(board.value.scene.elements.find((element) => element.id === 'legacy').type, 'frame')
})

test('draw2code_update preserves a user-added cross-page arrow when adding another component', async () => {
  const { root, store } = await makeStore()
  const update = draw2codeUpdateTool(store)
  await update.execute({
    root,
    name: 'manual-arrow-preserved',
    ops: [
      { op: 'upsert', element: { id: 'page-one', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务列表', mockDataMin: 3 } } },
      { op: 'upsert', element: { id: 'page-one-label', type: 'text', text: '任务列表', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'page-one' } } },
      { op: 'upsert', element: { id: 'page-two', type: 'rectangle', x: 480, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务详情', mockDataMin: 3 } } },
      { op: 'upsert', element: { id: 'page-two-label', type: 'text', text: '任务详情', x: 480, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'page-two' } } },
      { op: 'upsert', element: { id: 'open-detail', type: 'rectangle', x: 286, y: 120, width: 80, height: 40, customData: { role: 'button' } } },
      { op: 'upsert', element: { id: 'list-task-a', type: 'text', text: '修复登录闪退 · 进行中', x: 24, y: 200, width: 300, height: 28, customData: { role: 'mock-data' } } },
      { op: 'upsert', element: { id: 'list-task-b', type: 'text', text: '评审需求文档 · 14:00', x: 24, y: 248, width: 300, height: 28, customData: { role: 'mock-data' } } },
      { op: 'upsert', element: { id: 'list-task-c', type: 'text', text: '整理回归用例 · 已完成', x: 24, y: 296, width: 300, height: 28, customData: { role: 'mock-data' } } },
      { op: 'upsert', element: { id: 'detail-item-a', type: 'text', text: '复现路径确认 · 已完成', x: 504, y: 200, width: 300, height: 28, customData: { role: 'mock-data' } } },
      { op: 'upsert', element: { id: 'detail-item-b', type: 'text', text: '竞态修复自测 · 已完成', x: 504, y: 248, width: 300, height: 28, customData: { role: 'mock-data' } } },
      { op: 'upsert', element: { id: 'detail-item-c', type: 'text', text: '回归用例补充 · 进行中', x: 504, y: 296, width: 300, height: 28, customData: { role: 'mock-data' } } },
    ],
  }, {})

  const beforeManualEdit = await store.read(root, 'manual-arrow-preserved')
  assert.equal(beforeManualEdit.ok, true)
  const manualArrow = {
    id: 'user-cross-page-arrow',
    type: 'arrow',
    x: 366,
    y: 140,
    width: 114,
    height: 0,
    points: [[0, 0], [114, 0]],
    frameId: null,
    startBinding: { elementId: 'open-detail', focus: 0, gap: 4 },
    endBinding: { elementId: 'page-two', focus: 0, gap: 4 },
  }
  assert.equal((await store.write(root, 'manual-arrow-preserved', {
    elements: [...beforeManualEdit.value.scene.elements, manualArrow],
  })).ok, true)

  const result = await update.execute({
    root,
    name: 'manual-arrow-preserved',
    ops: [{ op: 'upsert', element: { id: 'detail-owner', type: 'text', text: '负责人：陈舟', x: 504, y: 120, width: 240, height: 32 } }],
  }, {})
  assert.equal(result.verified, true)

  const board = await store.read(root, 'manual-arrow-preserved')
  assert.equal(board.ok, true)
  const preservedArrow = board.value.scene.elements.find((element) => element.id === 'user-cross-page-arrow')
  assert.equal(preservedArrow.frameId, null)
  assert.deepEqual(preservedArrow.points, manualArrow.points)
  assert.deepEqual(preservedArrow.startBinding, manualArrow.startBinding)
  assert.deepEqual(preservedArrow.endBinding, manualArrow.endBinding)
})

test('draw2code_read warns when overlapping page shells make ownership ambiguous', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'overlapping-pages', {
    elements: [
      { id: 'page-a', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '页面 A' } },
      { id: 'page-b', type: 'rectangle', x: 300, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '页面 B' } },
      { id: 'ambiguous', type: 'text', text: '无法唯一归属', x: 320, y: 120, width: 60, height: 28 },
    ],
  })

  const read = await draw2codeReadTool(store).execute({ root, name: 'overlapping-pages' }, {})
  assert.equal(read.layoutWarnings.some((warning) => warning.code === 'page-membership-ambiguous' && warning.id === 'ambiguous'), true)
})

test('duplicate page names are reported and block name-based generation', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'duplicate-page-names', {
    elements: [
      { id: 'page-a', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务详情' } },
      { id: 'page-b', type: 'frame', name: '任务详情', x: 480, y: 40, width: 390, height: 844 },
    ],
  })

  const read = await draw2codeReadTool(store).execute({ root, name: 'duplicate-page-names' }, {})
  assert.equal(read.layoutWarnings.some((warning) => warning.code === 'page-name-duplicate' && warning.id === 'page-b'), true)

  const generated = await draw2codeGenerateTool(store).execute({
    root,
    action: 'start',
    name: 'duplicate-page-names',
  }, {})
  assert.equal(generated.status, 'error')
  assert.equal(generated.error.code, 'page-name-duplicate')
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
    type: 'rectangle',
    customData: { role: 'prototype-page', pageName: '好友列表', mockDataMin: 3 },
    x: 0,
    y: 40,
    width: 420,
    height: 860,
  }
  const firstTwoFriends = [
    { id: 'friend-1', type: 'text', text: '林小满 · 周末一起去徒步吗？ · 18:42', customData: { role: 'mock-data' }, x: 24, y: 120, width: 360, height: 32 },
    { id: 'friend-2', type: 'text', text: '周可乐 · 碰一碰成功啦 · 14:20', customData: { role: 'mock-data' }, x: 24, y: 180, width: 360, height: 32 },
  ]
  const pageLabel = { id: 'friends-page-label', type: 'text', text: '好友列表', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'friends-page' } }

  await assert.rejects(
    tool.execute({
      root,
      name: 'mock-data-gate',
      ops: [page, pageLabel, ...firstTwoFriends].map((element) => ({ op: 'upsert', element })),
    }, {}),
    /layout-invalid[\s\S]*mock-data-insufficient[\s\S]*requires 3[\s\S]*found 2/i,
  )

  const result = await tool.execute({
    root,
    name: 'mock-data-gate',
    ops: [
      page,
      pageLabel,
      ...firstTwoFriends,
      { id: 'friend-3', type: 'text', text: '陈一川 · 下次一起喝咖啡 · 昨天', customData: { role: 'mock-data' }, x: 24, y: 240, width: 360, height: 32 },
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

test('host update adapter preserves ops delivered as a JSON string', () => {
  const ops = [{ op: 'upsert', element: { id: 'title', type: 'text', text: '任务清单' } }]

  assert.deepEqual(normalizeOpsArg(JSON.stringify(ops)), ops)
  assert.deepEqual(normalizeOpsArg(ops), ops)
  assert.throws(() => normalizeOpsArg('{broken json'), /ops is not valid JSON/)
  assert.throws(() => normalizeOpsArg({}), /ops must be an array/)
})

test('prototype quality explains sparse hierarchy and interaction problems separately from write verification', () => {
  const elements = [
    { id: 'page', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务详情', mockDataMin: 3 } },
    { id: 'page-label', type: 'text', text: '任务详情', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'page' } },
    { id: 'task-a', type: 'text', text: '修复登录闪退 · 进行中', x: 24, y: 140, width: 320, height: 30, fontSize: 16, customData: { role: 'mock-data' } },
    { id: 'task-b', type: 'text', text: '补充回归用例 · 待处理', x: 24, y: 190, width: 320, height: 30, fontSize: 16, customData: { role: 'mock-data' } },
    { id: 'task-c', type: 'text', text: '发布灰度版本 · 已逾期', x: 24, y: 240, width: 320, height: 30, fontSize: 16, customData: { role: 'mock-data' } },
    { id: 'save', type: 'rectangle', x: 24, y: 300, width: 120, height: 32, customData: { role: 'primary-action' } },
    { id: 'save-label', type: 'text', text: '保存', x: 24, y: 300, width: 120, height: 32, fontSize: 16, containerId: 'save', customData: { role: 'primary-action' } },
  ]

  const quality = inspectPrototypeQuality(elements)
  const codes = quality.warnings.map((warning) => warning.code)
  assert.equal(quality.layoutPassed, true)
  assert.equal(quality.contentPassed, false)
  assert.equal(quality.visualReviewRequired, true)
  assert.ok(codes.includes('page-content-too-sparse'))
  assert.ok(codes.includes('text-scale-flat'))
  assert.ok(codes.includes('tap-target-too-small'))
  assert.ok(codes.includes('status-emphasis-missing'))
  assert.ok(quality.qualityScore < 100)
})

test('draw2code_update separates write verification from prototype completion and accepts final visual review evidence', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const ops = [
    { id: 'quality-page', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务列表', mockDataMin: 3 } },
    { id: 'quality-page-label', type: 'text', text: '任务列表', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'quality-page' } },
    { id: 'quality-title', type: 'text', text: '今天要做什么', x: 24, y: 88, width: 320, height: 36, fontSize: 26, customData: { role: 'page-heading' } },
    { id: 'quality-a', type: 'text', text: '10:30 提交产品周报 · 进行中', x: 24, y: 150, width: 320, height: 30, customData: { role: 'mock-data', tone: 'warning' } },
    { id: 'quality-b', type: 'text', text: '14:00 修复登录闪退 · 高优先级', x: 24, y: 200, width: 320, height: 30, customData: { role: 'mock-data', tone: 'danger' } },
    { id: 'quality-c', type: 'text', text: '18:00 取快递 · 待处理', x: 24, y: 250, width: 320, height: 30, customData: { role: 'mock-data', tone: 'info' } },
    { id: 'quality-add', type: 'rectangle', x: 24, y: 310, width: 342, height: 48, customData: { role: 'primary-action', tone: 'primary' } },
    { id: 'quality-add-label', type: 'text', text: '新增任务', x: 24, y: 310, width: 342, height: 48, containerId: 'quality-add', customData: { role: 'primary-action' } },
    { id: 'quality-section', type: 'text', text: '稍后处理', x: 24, y: 410, width: 320, height: 30, fontSize: 20, customData: { role: 'section-heading' } },
    { id: 'quality-d', type: 'text', text: '周五前 完成阅读计划', x: 24, y: 470, width: 320, height: 30, customData: { role: 'supporting-text' } },
    { id: 'quality-e', type: 'text', text: '20:00 跑步 30 分钟', x: 24, y: 560, width: 320, height: 30, customData: { role: 'supporting-text' } },
    { id: 'quality-nav', type: 'rectangle', x: 0, y: 790, width: 390, height: 60, customData: { role: 'bottom-navigation' } },
    { id: 'quality-nav-today', type: 'text', text: '今天', x: 0, y: 790, width: 130, height: 60, customData: { role: 'bottom-navigation-item' } },
    { id: 'quality-nav-all', type: 'text', text: '全部', x: 130, y: 790, width: 130, height: 60, customData: { role: 'bottom-navigation-item' } },
    { id: 'quality-nav-me', type: 'text', text: '我的', x: 260, y: 790, width: 130, height: 60, customData: { role: 'bottom-navigation-item' } },
  ].map((element) => ({ op: 'upsert', element }))

  const written = await tool.execute({ root, name: 'quality-report', ops }, {})
  assert.equal(written.verified, true)
  assert.equal(written.writeVerified, true)
  assert.equal(written.completionReady, false)
  assert.equal(written.prototypeQuality.visualReviewRequired, true)
  assert.match(written.nextAction, /视觉|visual/i)

  const finalReview = {
    phase: 'final',
    passed: true,
    boardRevision: written.rev,
    revealRequestId: written.revealRequestId,
    inspectedPageIds: ['quality-page'],
    observations: ['标题层级清楚', '按钮和正文没有错位', '首屏任务可读'],
  }

  await assert.rejects(
    tool.execute({ root, name: 'quality-report', ops: [], visualReview: finalReview }, {}),
    /visual-review-not-visible/iu,
  )
  assert.equal((await store.ackBoardReveal(root, written.revealRequestId, 'quality-report')).ok, true)

  const reviewed = await tool.execute({
    root,
    name: 'quality-report',
    ops: [],
    visualReview: finalReview,
  }, {})
  assert.equal(reviewed.verified, true)
  assert.equal(reviewed.writeVerified, true)
  assert.equal(reviewed.completionReady, true)
  assert.equal(reviewed.prototypeQuality.visualReviewRequired, false)
  assert.equal(reviewed.prototypeQuality.contentPassed, true)

  await assert.rejects(
    tool.execute({ root, name: 'quality-report', ops: [], visualReview: finalReview }, {}),
    /visual-review-stale/iu,
  )
})

test('draw2code_update rejects final visual review when the same call still mutates the board', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const written = await tool.execute({
    root,
    name: 'final-review-write',
    ops: [{ op: 'upsert', element: { id: 'title', type: 'text', text: '任务详情' } }],
  }, {})
  assert.equal((await store.ackBoardReveal(root, written.revealRequestId, 'final-review-write')).ok, true)

  await assert.rejects(
    tool.execute({
      root,
      name: 'final-review-write',
      ops: [{ op: 'upsert', element: { id: 'late-change', type: 'text', text: '复核时新增' } }],
      visualReview: {
        phase: 'final',
        passed: true,
        boardRevision: written.rev,
        revealRequestId: written.revealRequestId,
        inspectedPageIds: [],
        observations: ['已检查'],
      },
    }, {}),
    /visual-review-final-requires-empty-ops/iu,
  )
  const scene = await store.read(root, 'final-review-write')
  assert.equal(scene.ok, true)
  assert.equal(scene.value.scene.elements.some((element) => element.id === 'late-change'), false)
})

test('draw2code_update requires one representative page before a first multi-page batch', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const ops = Array.from({ length: 3 }, (_, index) => ({
    op: 'upsert',
    element: {
      id: `page-${index}`,
      type: 'rectangle',
      x: index * 450,
      y: 40,
      width: 390,
      height: 844,
      customData: { role: 'prototype-page', pageName: `页面 ${index + 1}`, mockDataMin: 3 },
    },
  }))

  await assert.rejects(
    tool.execute({ root, name: 'phased-drawing', ops }, {}),
    /visual-review-required[\s\S]*representative|代表页/iu,
  )
})

test('draw2code_update cannot bypass representative review by drawing two pages and then one', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'phased-bypass', {
    elements: [
      { id: 'page-1', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '页面 1', mockDataMin: 3 } },
      { id: 'page-2', type: 'rectangle', x: 450, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '页面 2', mockDataMin: 3 } },
    ],
  })
  const tool = draw2codeUpdateTool(store)

  await assert.rejects(
    tool.execute({
      root,
      name: 'phased-bypass',
      ops: [{ op: 'upsert', element: { id: 'page-3', type: 'rectangle', x: 900, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '页面 3', mockDataMin: 3 } } }],
    }, {}),
    /visual-review-required[\s\S]*representative/iu,
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

test('draw2code_generate selects rectangle pages through pages and keeps frames as a compatibility alias', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'generate-page-shells', {
    elements: [
      { id: 'list', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务列表', mockDataMin: 3 } },
      { id: 'list-label', type: 'text', text: '任务列表', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'list' } },
      { id: 'list-a', type: 'text', text: '修复登录闪退 · 进行中', x: 24, y: 140, width: 320, height: 32, customData: { role: 'mock-data' } },
      { id: 'list-b', type: 'text', text: '评审需求文档 · 14:00', x: 24, y: 200, width: 320, height: 32, customData: { role: 'mock-data' } },
      { id: 'list-c', type: 'text', text: '整理回归用例 · 已完成', x: 24, y: 260, width: 320, height: 32, customData: { role: 'mock-data' } },
      { id: 'detail', type: 'rectangle', x: 480, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务详情', mockDataMin: 3 } },
      { id: 'detail-label', type: 'text', text: '任务详情', x: 480, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'detail' } },
      { id: 'detail-a', type: 'text', text: '负责人：陈舟', x: 504, y: 140, width: 320, height: 32, customData: { role: 'mock-data' } },
      { id: 'detail-b', type: 'text', text: '截止：今天 18:00', x: 504, y: 200, width: 320, height: 32, customData: { role: 'mock-data' } },
      { id: 'detail-c', type: 'text', text: '优先级：高', x: 504, y: 260, width: 320, height: 32, customData: { role: 'mock-data' } },
      { id: 'list-detail', type: 'arrow', x: 390, y: 180, width: 90, height: 0, points: [[0, 0], [90, 0]] },
      { id: 'list-detail-label', type: 'text', text: '查看详情', x: 400, y: 148, width: 72, height: 24, containerId: 'list-detail' },
    ],
  })

  const tool = draw2codeGenerateTool(store)
  const started = await tool.execute({
    root,
    action: 'start',
    name: 'generate-page-shells',
    pages: ['任务列表'],
    styleNote: '简洁现代',
  }, {})

  assert.equal(started.status, 'question')
  assert.deepEqual(started.question.options.map((option) => option.valueLabel), ['任务列表', '任务详情'])
  assert.equal(started.question.options.find((option) => option.valueLabel === '任务列表').recommended, true)

  const ready = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'page-scope',
    values: ['任务列表'],
  }, {})
  assert.equal(ready.status, 'ready')

  const confirmed = await tool.execute({
    root,
    action: 'confirm',
    sessionId: ready.sessionId,
    revision: ready.revision,
  }, {})
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.scope, 'pages')
  assert.deepEqual(confirmed.pageNames, ['任务列表'])
  assert.deepEqual(confirmed.frameNames, ['任务列表'])
  assert.equal(confirmed.elements.some((element) => element.id === 'list'), true)
  assert.equal(confirmed.elements.some((element) => element.id === 'detail'), false)
  assert.equal(confirmed.unassignedElementCount, 0)
})

test('draw2code_generate rejects conflicting pages and frames instead of guessing', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'generate-scope-conflict', {
    elements: [
      { id: 'list', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务列表' } },
      { id: 'detail', type: 'frame', name: '任务详情', x: 480, y: 40, width: 390, height: 844 },
    ],
  })

  const result = await draw2codeGenerateTool(store).execute({
    root,
    action: 'start',
    name: 'generate-scope-conflict',
    pages: ['任务列表'],
    frames: ['任务详情'],
  }, {})

  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'page-scope-conflict')
})

test('draw2code_generate keeps unselected connected pages in the final brief', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'generate-related-pages', {
    elements: [
      { id: 'login', type: 'frame', name: '登录页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'login-title', type: 'text', text: '手机号登录', frameId: 'login', x: 24, y: 80, width: 200, height: 32 },
      { id: 'register', type: 'frame', name: '注册页', x: 460, y: 0, width: 420, height: 860 },
      { id: 'register-title', type: 'text', text: '创建账号', frameId: 'register', x: 484, y: 80, width: 200, height: 32 },
      { id: 'login-to-register', type: 'arrow', x: 420, y: 400, width: 40, height: 0, points: [[0, 0], [40, 0]] },
    ],
  })

  const tool = draw2codeGenerateTool(store)
  const started = await tool.execute({
    root,
    action: 'start',
    name: 'generate-related-pages',
    frames: ['登录页'],
    styleNote: '简洁现代',
  }, {})
  const ready = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'page-scope',
    values: ['登录页'],
  }, {})

  assert.equal(ready.status, 'ready')
  assert.deepEqual(ready.brief.relatedPageRecommendations, ['注册页'])
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
  assert.doesNotMatch(confirmed.instructions, /严格按.*布局/)
  assert.match(confirmed.instructions, /禁止照搬 Excalidraw.*绝对坐标/)
  assert.match(confirmed.instructions, /CSS Grid.*Flex/)
  assert.match(confirmed.instructions, /结构化视觉简报/)
  assert.equal(confirmed.brief.visualBrief.direction, '年轻活力')
  assert.match(confirmed.brief.visualBrief.layoutStrategy, /响应式/)

  await browserEvidence(root, 'generate-flow', { 首页: ['附近的人'] })
  const premature = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    previewOpened: true,
    selectedPagesVisible: true,
    coreFlowPassed: true,
    mockDataVisible: true,
  }, {})
  assert.equal(premature.status, 'error')
  assert.equal(premature.error.code, 'verification-evidence-missing')

  const missingArtifact = await browserEvidence(root, 'generate-flow', { 首页: ['附近的人'] })
  missingArtifact.screenshots[0].source = join(root, 'artifacts/missing.png')
  const artifactRejected = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    verificationEvidence: missingArtifact,
  }, {})
  assert.equal(artifactRejected.status, 'error')
  assert.equal(artifactRejected.error.code, 'verification-evidence-failed')
  assert.match(artifactRejected.error.message, /screenshot:首页:file-unreadable/)

  const wrongDom = await browserEvidence(root, 'generate-flow', { 首页: ['错误的页面文案'] })
  const domRejected = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    verificationEvidence: wrongDom,
  }, {})
  assert.equal(domRejected.status, 'error')
  assert.equal(domRejected.error.code, 'verification-evidence-failed')
  assert.match(domRejected.error.message, /domText:首页:附近的人/)

  const failedEvidence = await browserEvidence(root, 'generate-flow', { 首页: ['附近的人'] })
  failedEvidence.consoleErrors.push('TypeError: navigation target is missing')
  failedEvidence.consoleWarnings.push('A form control has no accessible label')
  failedEvidence.layoutChecks.find((check) => check.name === 'button-text-centered').passed = false
  const rejected = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    verificationEvidence: failedEvidence,
  }, {})
  assert.equal(rejected.status, 'error')
  assert.equal(rejected.error.code, 'verification-evidence-failed')
  assert.match(rejected.error.message, /consoleErrors/)
  assert.match(rejected.error.message, /consoleWarnings/)
  assert.match(rejected.error.message, /button-text-centered/)

  const completed = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    verificationEvidence: await browserEvidence(root, 'generate-flow', { 首页: ['附近的人'] }),
  }, {})
  assert.equal(completed.status, 'completed')
  assert.equal(completed.validation.verified, true)
  assert.match(completed.validation.previewUrl, /^file:/)
  assert.equal(completed.validation.screenshots.length, 1)
  assert.equal(completed.validation.consoleErrors.length, 0)
  assert.equal(completed.validation.consoleWarnings.length, 0)

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

test('draw2code_generate requires an exercised page switch when multiple pages are selected', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'generate-page-switch', {
    elements: [
      { id: 'home', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'home-title', type: 'text', text: '今日重点任务', frameId: 'home', x: 24, y: 80, width: 200, height: 32 },
      { id: 'settings', type: 'frame', name: '设置页', x: 460, y: 0, width: 420, height: 860 },
      { id: 'settings-title', type: 'text', text: '通知与隐私设置', frameId: 'settings', x: 484, y: 80, width: 220, height: 32 },
    ],
  })
  const tool = draw2codeGenerateTool(store)
  const started = await tool.execute({ root, action: 'start', name: 'generate-page-switch', styleNote: '简洁现代' }, {})
  const ready = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'page-scope',
    values: ['首页', '设置页'],
  }, {})
  const confirmed = await tool.execute({
    root,
    action: 'confirm',
    sessionId: ready.sessionId,
    revision: ready.revision,
  }, {})
  const pageSwitchEvidence = {
    首页: ['今日重点任务'],
    设置页: ['通知与隐私设置'],
  }
  const incompleteEvidence = await browserEvidence(root, 'generate-page-switch', pageSwitchEvidence)
  incompleteEvidence.interactionChecks = incompleteEvidence.interactionChecks.filter((check) => check.name !== 'page-switching')
  const incomplete = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    verificationEvidence: incompleteEvidence,
  }, {})

  assert.equal(incomplete.status, 'error')
  assert.equal(incomplete.error.code, 'verification-evidence-incomplete')
  assert.match(incomplete.error.message, /page-switching/)

  const completed = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    verificationEvidence: await browserEvidence(root, 'generate-page-switch', pageSwitchEvidence),
  }, {})
  assert.equal(completed.status, 'completed')
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
      { id: 'home', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'home-data', type: 'text', text: '今日重点 3 项', frameId: 'home', x: 24, y: 100, width: 280, height: 32 },
      { id: 'list', type: 'frame', name: '清单页', x: 460, y: 0, width: 420, height: 860 },
      { id: 'list-data', type: 'text', text: '工作清单 6 项', frameId: 'list', x: 484, y: 100, width: 280, height: 32 },
      { id: 'stats', type: 'frame', name: '统计页', x: 920, y: 0, width: 420, height: 860 },
      { id: 'stats-data', type: 'text', text: '本周完成 18 项\n完成率 78%\n连续打卡 7 天', frameId: 'stats', x: 944, y: 100, width: 280, height: 100 },
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
    verificationEvidence: await browserEvidence(root, 'generate-existing', {
      统计页: ['本周完成 18 项', '完成率 78%', '连续打卡 7 天'],
    }),
  }, {})
  assert.equal(incomplete.status, 'error')
  assert.equal(incomplete.error.code, 'verification-evidence-incomplete')
  assert.match(incomplete.error.message, /首页/)

  const completed = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    verificationEvidence: await browserEvidence(root, 'generate-existing', {
      首页: ['今日重点 3 项'],
      清单页: ['工作清单 6 项'],
      统计页: ['本周完成 18 项', '完成率 78%', '连续打卡 7 天'],
    }, { preserveExisting: true }),
  }, {})
  assert.equal(completed.status, 'completed')
})

test('draw2code_generate hashes marked unselected pages and does not require preservation when every page is selected', async () => {
  const { root, canonicalRoot, store } = await makeStore()
  await store.write(root, 'generate-marked-pages', {
    elements: [
      { id: 'home', type: 'frame', name: '首页', x: 0, y: 0, width: 420, height: 860 },
      { id: 'home-data', type: 'text', text: '今日重点 3 项', frameId: 'home', x: 24, y: 100, width: 280, height: 32 },
      { id: 'stats', type: 'frame', name: '统计页', x: 460, y: 0, width: 420, height: 860 },
      { id: 'stats-data', type: 'text', text: '本周完成 18 项\n完成率 78%\n连续打卡 7 天', frameId: 'stats', x: 484, y: 100, width: 280, height: 100 },
    ],
  })
  const outputDir = join(canonicalRoot, 'draw2code-pages/generate-marked-pages')
  await mkdir(outputDir, { recursive: true })
  const original = '<!doctype html><html><body>'
    + '<!-- d2c-page:首页:start --><section>今日重点 3 项</section><!-- d2c-page:首页:end -->'
    + '<!-- d2c-page:统计页:start --><section>本周完成 18 项 完成率 78% 连续打卡 7 天</section><!-- d2c-page:统计页:end -->'
    + '</body></html>'
  await writeFile(join(outputDir, 'index.html'), original, 'utf8')
  const tool = draw2codeGenerateTool(store)
  const started = await tool.execute({ root, action: 'start', name: 'generate-marked-pages', styleNote: '数据清晰' }, {})
  const ready = await tool.execute({
    root,
    action: 'answer',
    sessionId: started.sessionId,
    revision: started.revision,
    questionId: 'page-scope',
    values: ['统计页'],
  }, {})
  const confirmed = await tool.execute({ root, action: 'confirm', sessionId: ready.sessionId, revision: ready.revision }, {})
  await writeFile(join(outputDir, 'index.html'), original.replace('今日重点 3 项', '首页被错误覆盖'), 'utf8')
  const changed = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    verificationEvidence: await browserEvidence(root, 'generate-marked-pages', {
      统计页: ['本周完成 18 项', '完成率 78%', '连续打卡 7 天'],
    }, { writeOutput: false }),
  }, {})
  assert.equal(changed.status, 'error')
  assert.equal(changed.error.code, 'unselected-pages-changed')
  assert.match(changed.error.message, /首页/)

  await writeFile(join(outputDir, 'index.html'), original, 'utf8')
  const allStarted = await tool.execute({ root, action: 'start', name: 'generate-marked-pages', styleNote: '数据清晰' }, {})
  const allReady = await tool.execute({
    root,
    action: 'answer',
    sessionId: allStarted.sessionId,
    revision: allStarted.revision,
    questionId: 'page-scope',
    values: ['首页', '统计页'],
  }, {})
  const allConfirmed = await tool.execute({ root, action: 'confirm', sessionId: allReady.sessionId, revision: allReady.revision }, {})
  const completed = await tool.execute({
    root,
    action: 'complete',
    sessionId: allConfirmed.sessionId,
    revision: allConfirmed.revision,
    verificationEvidence: await browserEvidence(root, 'generate-marked-pages', {
      首页: ['今日重点 3 项'],
      统计页: ['本周完成 18 项', '完成率 78%', '连续打卡 7 天'],
    }),
  }, {})
  assert.equal(completed.status, 'completed')
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

test('concurrent project saves from one revision allow only one answer', async () => {
  const { root, projects } = await makeStore()
  const created = await projects.create(root, {
    projectId: 'project-00000000-0000-4000-8000-000000000002',
    projectName: '并发需求',
    originalIdea: '验证并发回答不会互相覆盖',
    status: 'draft',
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    boardName: null,
    deferredStyleNote: null,
    answers: {},
    currentQuestion: null,
    pendingInterpretation: null,
    brief: null,
    history: [],
  })
  assert.equal(created.ok, true)

  const attempts = await Promise.all(Array.from({ length: 12 }, (_, index) => projects.save(root, {
    ...created.value,
    projectName: `并发需求 ${index}`,
    revision: 2,
  }, 1)))

  assert.equal(attempts.filter((result) => result.ok).length, 1)
  assert.equal(attempts.filter((result) => !result.ok && result.error.code === 'stale_revision').length, 11)
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
  const radarBlueprint = state.brief.pageBlueprints.find((page) => page.pageId === 'radar-home')
  assert.match(radarBlueprint.coreTask, /附近|扫描/)
  assert.ok(radarBlueprint.aboveFold.some((item) => /附近|雷达|扫描/.test(item)))
  assert.match(radarBlueprint.primaryAction, /扫描|碰一碰/)
  assert.ok(radarBlueprint.semanticComponents.some((component) => component.kind === 'page-header'))
  assert.ok(radarBlueprint.semanticComponents.some((component) => component.kind === 'primary-action'))
  const chatBlueprint = state.brief.pageBlueprints.find((page) => page.pageId === 'friends-chat')
  assert.ok(chatBlueprint.semanticComponents.some((component) => component.kind === 'conversation-list'))
  assert.ok(!chatBlueprint.semanticComponents.some((component) => component.kind === 'task-card'))
  assert.ok(state.brief.semanticComponentCatalog.some((component) => component.kind === 'bottom-navigation'))
  assert.match(state.brief.prototypeQualityPolicy.completionRule, /writeVerified|视觉复核/)

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
  assert.match(state.brief.mockDataPolicy.updateContract, /rectangle/u)
  assert.match(state.brief.mockDataPolicy.updateContract, /pageName/u)
  assert.doesNotMatch(state.brief.mockDataPolicy.updateContract, /页面 frame/u)

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
      { op: 'upsert', element: { id: 'page-query', type: 'rectangle', x: 0, y: 40, width: 420, height: 720, customData: { role: 'prototype-page', pageName: '日期查询', mockDataMin: 3 } } },
      { op: 'upsert', element: { id: 'page-query-label', type: 'text', text: '日期查询', x: 0, y: 4, width: 180, height: 28, customData: { role: 'prototype-page-label', pageId: 'page-query' } } },
      { op: 'upsert', element: { id: 'query-title', type: 'text', text: '选择日期和城市', x: 24, y: 64, width: 300, height: 40 } },
      { op: 'upsert', element: { id: 'query-city', type: 'text', text: '北京 · 朝阳区', x: 24, y: 110, width: 300, height: 32, customData: { role: 'mock-data' } } },
      { op: 'upsert', element: { id: 'query-date', type: 'text', text: '2026 年 8 月 22 日', x: 24, y: 160, width: 300, height: 32, customData: { role: 'mock-data' } } },
      { op: 'upsert', element: { id: 'query-weather', type: 'text', text: '晴 · 18–28℃', x: 24, y: 210, width: 300, height: 32, customData: { role: 'mock-data' } } },
    ],
  }, {})
  assert.equal(drawn.verified, true)
  assert.equal(drawn.targetBoard, confirmed.boardName)
  assert.equal(drawn.activeBoard, confirmed.boardName)
})
