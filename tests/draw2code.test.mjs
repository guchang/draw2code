import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { deflateSync } from 'node:zlib'
import {
  ProjectStore,
  SceneStore,
  draw2codeCreateTool as rawDraw2codeCreateTool,
  draw2codeGenerateTool as rawDraw2codeGenerateTool,
  draw2codeReadTool,
  draw2codeUpdateTool,
  inspectPrototypeLayout,
  inspectPrototypeQuality,
  normalizeOpsArg,
  normalizeVisualReviewArg,
} from '../dist/index.js'

const NATIVE_CREATE_CONTROLS = [
  { id: 'synthesize-now', label: '直接整理项目简报', description: '停止继续提问，基于当前事实与待验证假设生成完整简报。' },
  { id: 'unknown', label: '还没想好', description: '先记录为待验证假设，不把沉默理解为暂停或取消。' },
  { id: 'other', label: '其他', description: '保留用户自己的产品方向和补充说明。' },
]

function nativeCreateQuestion(value) {
  const wasString = typeof value === 'string'
  const question = wasString ? JSON.parse(value) : structuredClone(value)
  if (question !== null && typeof question === 'object') {
    if (typeof question.insight === 'string' && typeof question.text === 'string' && !question.text.startsWith('判断：')) {
      question.text = `判断：${question.insight}\n\n问题：${question.insight} 因此，${question.text}`
    }
    if (Array.isArray(question.options)) {
      for (const control of NATIVE_CREATE_CONTROLS) {
        if (!question.options.some((option) => option?.id === control.id)) question.options.push(control)
      }
    }
  }
  return wasString ? JSON.stringify(question) : question
}

function draw2codeCreateTool(...args) {
  const tool = rawDraw2codeCreateTool(...args)
  return {
    ...tool,
    execute(input, context) {
      const normalized = input.action === 'propose_question' && input.question !== undefined
        ? { ...input, question: nativeCreateQuestion(input.question) }
        : input
      return tool.execute(normalized, context)
    },
  }
}

function draw2codeGenerateTool(...args) {
  const tool = rawDraw2codeGenerateTool(...args)
  return {
    ...tool,
    execute(input, context) {
      const normalized = (input.action ?? 'start') === 'start' && input.referenceStyle === undefined
        ? { ...input, referenceStyle: 'none' }
        : input
      return tool.execute(normalized, context)
    },
  }
}

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

async function makeStore(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-draw2code-test-'))
  const canonicalRoot = await realpath(root)
  roots.push(root)
  const ctx = {
    workspaceRegistry: { list: () => [{ path: canonicalRoot }] },
    logger: { warn() {} },
  }
  return { root, canonicalRoot, store: new SceneStore(ctx, options), projects: new ProjectStore(ctx) }
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
    const domBytes = Buffer.from(
      '<!doctype html><html><body><section data-page="' + page + '">'
      + pageTexts[page].map((value) => '<p>' + value + '</p>').join('')
      + '</section></body></html>',
      'utf8',
    )
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

test('a failed pending save remains retryable', async () => {
  const pending = sync.capturePendingSave(
    null,
    'prototype',
    [{ id: 'unsaved-edit', type: 'text', text: '不能丢失' }],
    17,
    [{ id: 'old-edit', type: 'text', text: '旧内容' }],
  )
  const failed = await sync.flushCapturedSave(pending, async () => false)

  assert.equal(failed.ok, false)
  assert.deepEqual(failed.retry, pending)
})

test('the latest asynchronous board action wins even when an earlier flush settles later', async () => {
  const actions = new sync.LatestAsyncAction()
  let releaseFirst
  let markFirstStarted
  const firstFlush = new Promise((resolve) => { releaseFirst = resolve })
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve })
  let selected = 'prototype'

  const first = actions.run(async () => {
    markFirstStarted()
    await firstFlush
    return '画板 A'
  }, (name) => { selected = name })
  await firstStarted
  const second = actions.run(async () => '画板 B', (name) => { selected = name })
  releaseFirst()
  await Promise.all([first, second])

  assert.equal(selected, '画板 B')
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
  const { root, store } = await makeStore({ hardCapBytes: 512 * 1024 })
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

test('scene capacity separates canonical content from persisted formatting bytes', async () => {
  const { root, canonicalRoot, store } = await makeStore()
  const written = await store.write(root, 'capacity-metrics', {
    elements: Array.from({ length: 24 }, (_, index) => ({
      id: `metric-${index}`,
      type: 'rectangle',
      x: index * 20,
      y: index * 10,
      width: 16,
      height: 16,
    })),
  })
  assert.equal(written.ok, true)

  const raw = await readFile(join(canonicalRoot, 'draw2code/capacity-metrics.excalidraw.json'), 'utf8')
  const parsed = JSON.parse(raw)
  const canonicalBytes = Buffer.byteLength(JSON.stringify(parsed), 'utf8')
  const persistedBytes = Buffer.byteLength(raw, 'utf8')
  const result = await draw2codeReadTool(store).execute({ root, name: 'capacity-metrics' }, {})

  assert.equal(result.capacity.canonicalBytes, canonicalBytes)
  assert.equal(result.capacity.usedBytes, canonicalBytes)
  assert.equal(result.capacity.persistedBytes, persistedBytes)
  assert.equal(result.capacity.persistedBytes > result.capacity.canonicalBytes, true)
  assert.equal(result.capacity.assetBytes, 0)
  assert.equal(result.capacity.elementCount, 24)
})

test('ordinary scene is not rejected only because pretty JSON exceeds the legacy 512 KiB cap', async () => {
  const { root, canonicalRoot, store } = await makeStore()
  const result = await store.write(root, 'formatting-headroom', {
    elements: Array.from({ length: 850 }, (_, index) => ({
      id: `ordinary-${index}`,
      type: 'rectangle',
      x: (index % 25) * 24,
      y: Math.floor(index / 25) * 24,
      width: 16,
      height: 16,
    })),
  })

  assert.equal(result.ok, true)
  const raw = await readFile(join(canonicalRoot, 'draw2code/formatting-headroom.excalidraw.json'), 'utf8')
  assert.equal(Buffer.byteLength(raw, 'utf8') > 512 * 1024, true)
  assert.equal(Buffer.byteLength(JSON.stringify(JSON.parse(raw)), 'utf8') < 512 * 1024, true)
})

test('history snapshots are atomically gzip-compressed, observable, and restorable', async () => {
  const { root, canonicalRoot, store } = await makeStore()
  const first = await store.write(root, 'compressed-history', {
    elements: [{ id: 'title', type: 'text', text: '第一版' }],
  })
  assert.equal(first.ok, true)
  const second = await store.write(root, 'compressed-history', {
    elements: [{ id: 'title', type: 'text', text: '第二版' }],
  }, first.value.rev, 'agent')
  assert.equal(second.ok, true)

  const entries = await readdir(join(canonicalRoot, 'draw2code/.versions/compressed-history'))
  assert.equal(entries.length, 1)
  assert.match(entries[0], /\.json\.gz$/)
  const versions = await store.listVersions(root, 'compressed-history')
  assert.equal(versions.ok, true)
  assert.equal(versions.value[0].format, 'gzip-json')
  assert.equal(versions.value[0].storedBytes > 0, true)
  const storage = await store.versionStorage(root, 'compressed-history')
  assert.equal(storage.ok, true)
  assert.equal(storage.value.versionCount, 1)
  assert.equal(storage.value.storedBytes, versions.value[0].storedBytes)

  const archived = await store.readVersion(root, 'compressed-history', versions.value[0].id)
  assert.equal(archived.ok, true)
  assert.equal(archived.value.scene.elements[0].text, '第一版')
  const restored = await store.restoreVersion(root, 'compressed-history', versions.value[0].id)
  assert.equal(restored.ok, true)
  const current = await store.read(root, 'compressed-history')
  assert.equal(current.ok, true)
  assert.equal(current.value.scene.elements[0].text, '第一版')
})

test('history stores small changes as restorable deltas instead of duplicate full scenes', async () => {
  const { root, store } = await makeStore()
  const elements = Array.from({ length: 240 }, (_, index) => ({
    id: `history-card-${index}`,
    type: 'text',
    text: `任务 ${index} · 等待处理`,
    x: (index % 12) * 340,
    y: Math.floor(index / 12) * 40,
    width: 320,
    height: 28,
  }))
  const first = await store.write(root, 'delta-history', { elements })
  assert.equal(first.ok, true)
  const second = await store.applyOps(root, 'delta-history', [{
    op: 'upsert',
    element: { ...elements[12], text: '任务 12 · 处理中' },
  }], first.value.rev)
  assert.equal(second.ok, true)
  const third = await store.applyOps(root, 'delta-history', [{
    op: 'upsert',
    element: { ...elements[13], text: '任务 13 · 已完成' },
  }], second.value.rev)
  assert.equal(third.ok, true)

  const versions = await store.listVersions(root, 'delta-history')
  assert.equal(versions.ok, true)
  assert.equal(versions.value.length, 2)
  assert.equal(versions.value.some((version) => version.format === 'gzip-delta'), true)
  const secondVersion = versions.value[0]
  const archived = await store.readVersion(root, 'delta-history', secondVersion.id)
  assert.equal(archived.ok, true)
  assert.equal(archived.value.scene.elements.find((element) => element.id === 'history-card-12').text, '任务 12 · 处理中')
  assert.equal(archived.value.scene.elements.find((element) => element.id === 'history-card-13').text, '任务 13 · 等待处理')

  const restored = await store.restoreVersion(root, 'delta-history', secondVersion.id)
  assert.equal(restored.ok, true)
  const current = await store.read(root, 'delta-history')
  assert.equal(current.ok, true)
  assert.equal(current.value.scene.elements.find((element) => element.id === 'history-card-13').text, '任务 13 · 等待处理')
})

test('history pruning materializes the retained delta chain before removing its base', async () => {
  const { root, store } = await makeStore()
  const elements = Array.from({ length: 40 }, (_, index) => ({
    id: `prune-card-${index}`,
    type: 'text',
    text: `版本 0 · 任务 ${index}`,
  }))
  const first = await store.write(root, 'pruned-delta-history', { elements })
  assert.equal(first.ok, true)
  let revision = first.value.rev
  for (let version = 1; version <= 36; version += 1) {
    const result = await store.applyOps(root, 'pruned-delta-history', [{
      op: 'upsert',
      element: { ...elements[0], text: `版本 ${version} · 任务 0` },
    }], revision)
    assert.equal(result.ok, true)
    revision = result.value.rev
  }

  const versions = await store.listVersions(root, 'pruned-delta-history')
  assert.equal(versions.ok, true)
  assert.equal(versions.value.length, 30)
  assert.equal(versions.value.some((version) => version.format === 'gzip-delta'), true)
  for (const version of [versions.value[0], versions.value.at(-1)]) {
    const archived = await store.readVersion(root, 'pruned-delta-history', version.id)
    assert.equal(archived.ok, true)
    assert.equal(archived.value.scene.elements.length, 40)
  }
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
  assert.match(rendered[0].text, new RegExp(`boardRevision=${result.rev}`))
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

test('draw2code_update falls back to the container role when a label role only describes content', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'semantic-container-role-fallback',
    ops: [
      { op: 'upsert', element: { id: 'task-input', type: 'rectangle', customData: { role: 'input' }, x: 20, y: 80, width: 380, height: 48 } },
      { op: 'upsert', element: { id: 'task-value', type: 'text', text: '提交产品周报', fontSize: 15, lineHeight: 1.25, customData: { role: 'mock-data' }, x: 32, y: 80, width: 356, height: 48, containerId: 'task-input' } },
      { op: 'upsert', element: { id: 'quadrant-chip', type: 'rectangle', customData: { role: 'choice-chip' }, x: 20, y: 160, width: 180, height: 52 } },
      { op: 'upsert', element: { id: 'quadrant-label', type: 'text', text: '重要且紧急', fontSize: 14, lineHeight: 1.25, customData: { role: 'choice-label' }, x: 20, y: 160, width: 180, height: 52, containerId: 'quadrant-chip' } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'semantic-container-role-fallback')
  assert.equal(read.ok, true)
  const value = read.value.scene.elements.find((element) => element.id === 'task-value')
  assert.deepEqual(
    [value.textAlign, value.verticalAlign, value.y, value.height],
    ['left', 'middle', 94.625, 18.75],
  )
  const label = read.value.scene.elements.find((element) => element.id === 'quadrant-label')
  assert.deepEqual(
    [label.textAlign, label.verticalAlign, label.y, label.height],
    ['center', 'middle', 177.25, 17.5],
  )
})

test('draw2code_update defaults text autoResize on and preserves an explicit opt-out', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)

  const result = await tool.execute({
    root,
    name: 'text-auto-resize',
    ops: [
      { op: 'upsert', element: { id: 'default-text', type: 'text', text: '默认自适应', x: 20, y: 20, width: 120, height: 24 } },
      { op: 'upsert', element: { id: 'fixed-text', type: 'text', text: '固定文本框', autoResize: false, x: 20, y: 60, width: 120, height: 24 } },
    ],
  }, {})

  assert.equal(result.verified, true)
  const read = await store.read(root, 'text-auto-resize')
  assert.equal(read.ok, true)
  const byId = new Map(read.value.scene.elements.map((element) => [element.id, element]))
  assert.deepEqual(
    [byId.get('default-text').autoResize, byId.get('fixed-text').autoResize],
    [true, false],
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

test('draw2code_update limits layout validation to the page touched by a small update', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'page-local-layout', {
    elements: [
      { id: 'page-a', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '页面 A', mockDataMin: 1 } },
      { id: 'page-a-label', type: 'text', text: '页面 A', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'page-a' } },
      { id: 'task-a', type: 'text', text: '提交产品周报', x: 24, y: 120, width: 220, height: 30, customData: { role: 'mock-data' } },
      { id: 'page-b', type: 'rectangle', x: 480, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '页面 B', mockDataMin: 1 } },
      { id: 'page-b-label', type: 'text', text: '页面 B', x: 480, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'page-b' } },
      { id: 'broken-text', type: 'text', text: '这是一段会溢出的多行文字\n第二行\n第三行', x: 504, y: 120, width: 220, height: 12, customData: { role: 'mock-data' } },
    ],
  })
  const invalidBoard = await store.read(root, 'page-local-layout')
  assert.equal(invalidBoard.ok, true)
  assert.equal(inspectPrototypeLayout(invalidBoard.value.scene.elements).errors.some((error) => error.id === 'broken-text'), true)
  await draw2codeReadTool(store).execute({ root, name: 'page-local-layout' }, {})

  const result = await draw2codeUpdateTool(store).execute({
    root,
    name: 'page-local-layout',
    ops: [{ op: 'upsert', element: { id: 'task-a', type: 'text', text: '提交产品周报（今天 17:00）', x: 24, y: 120, width: 300, height: 30, customData: { role: 'mock-data' } } }],
  }, {})

  assert.equal(result.writeVerified, true)
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

test('host update adapter preserves ops and visual review delivered as JSON strings', () => {
  const ops = [{ op: 'upsert', element: { id: 'title', type: 'text', text: '任务清单' } }]
  const visualReview = {
    phase: 'representative',
    passed: true,
    boardRevision: 1,
    revealRequestId: 'reveal-1',
    inspectedPageIds: ['page-today'],
    observations: ['代表页内容完整'],
  }

  assert.deepEqual(normalizeOpsArg(JSON.stringify(ops)), ops)
  assert.deepEqual(normalizeOpsArg(ops), ops)
  assert.deepEqual(normalizeVisualReviewArg(JSON.stringify(visualReview)), visualReview)
  assert.deepEqual(normalizeVisualReviewArg(visualReview), visualReview)
  assert.throws(() => normalizeOpsArg('{broken json'), /ops is not valid JSON/)
  assert.throws(() => normalizeOpsArg({}), /ops must be an array/)
  assert.throws(() => normalizeVisualReviewArg('{broken json'), /visualReview is not valid JSON/)
  assert.throws(() => normalizeVisualReviewArg([]), /visualReview must be an object/)
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

test('prototype quality distinguishes a two-column grid from inconsistent wide-content margins', () => {
  const page = { id: 'page', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '今天' } }
  const pageLabel = { id: 'page-label', type: 'text', text: '今天', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'page' } }

  const twoColumnQuality = inspectPrototypeQuality([
    page,
    pageLabel,
    { id: 'heading', type: 'text', text: '今天', x: 24, y: 88, width: 342, height: 36, fontSize: 26 },
    { id: 'q1', type: 'rectangle', x: 24, y: 144, width: 163, height: 220, customData: { role: 'quadrant-card' } },
    { id: 'q2', type: 'rectangle', x: 203, y: 144, width: 163, height: 220, customData: { role: 'quadrant-card' } },
    { id: 'q3', type: 'rectangle', x: 24, y: 380, width: 163, height: 220, customData: { role: 'quadrant-card' } },
    { id: 'q4', type: 'rectangle', x: 203, y: 380, width: 163, height: 220, customData: { role: 'quadrant-card' } },
  ])
  assert.equal(twoColumnQuality.warnings.some((warning) => warning.code === 'page-margin-inconsistent'), false)

  const inconsistentWideRows = inspectPrototypeQuality([
    page,
    pageLabel,
    { id: 'row-a', type: 'rectangle', x: 24, y: 120, width: 310, height: 72 },
    { id: 'row-b', type: 'rectangle', x: 56, y: 208, width: 310, height: 72 },
    { id: 'row-c', type: 'rectangle', x: 24, y: 296, width: 310, height: 72 },
    { id: 'row-d', type: 'rectangle', x: 56, y: 384, width: 310, height: 72 },
  ])
  assert.equal(inconsistentWideRows.warnings.some((warning) => warning.code === 'page-margin-inconsistent'), true)
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
  assert.equal(reviewed.writeVerified, false)
  assert.equal(reviewed.reviewVerified, true)
  assert.equal(reviewed.completionReady, true)
  assert.equal(reviewed.prototypeQuality.visualReviewRequired, false)
  assert.equal(reviewed.prototypeQuality.contentPassed, true)

  const repeated = await tool.execute({ root, name: 'quality-report', ops: [], visualReview: finalReview }, {})
  assert.equal(repeated.rev, written.rev)
  assert.equal(repeated.reviewVerified, true)
  assert.equal(repeated.completionReady, true)
})

test('draw2code_update review action is pure and idempotent', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const written = await tool.execute({
    root,
    name: 'pure-review',
    ops: [
      { op: 'upsert', element: { id: 'page', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '任务列表', mockDataMin: 3 } } },
      { op: 'upsert', element: { id: 'page-label', type: 'text', text: '任务列表', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'page' } } },
      { op: 'upsert', element: { id: 'mock-a', type: 'text', text: '10:30 提交产品周报', x: 24, y: 120, width: 320, height: 30, customData: { role: 'mock-data' } } },
      { op: 'upsert', element: { id: 'mock-b', type: 'text', text: '14:00 修复登录闪退', x: 24, y: 170, width: 320, height: 30, customData: { role: 'mock-data' } } },
      { op: 'upsert', element: { id: 'mock-c', type: 'text', text: '18:00 取快递', x: 24, y: 220, width: 320, height: 30, customData: { role: 'mock-data' } } },
    ],
  }, {})
  assert.equal(typeof written.reviewToken, 'string')
  assert.equal((await store.ackBoardReveal(root, written.revealRequestId, 'pure-review')).ok, true)

  const input = {
    root,
    name: 'pure-review',
    action: 'review',
    reviewToken: written.reviewToken,
    phase: 'representative',
    passed: true,
    inspectedPageIds: ['page'],
    observations: ['页面首次渲染可见', '任务数据可读'],
  }
  const reviewed = await tool.execute(input, {})
  const revealAfterReview = await store.getBoardReveal(root)

  assert.equal(reviewed.rev, written.rev)
  assert.equal(reviewed.applied, 0)
  assert.equal(reviewed.writeVerified, false)
  assert.equal(reviewed.reviewVerified, true)
  assert.equal(reviewed.completionReady, false)
  assert.equal(reviewed.nextActionCode, 'write_remaining_pages')
  assert.equal(revealAfterReview.ok, true)
  assert.equal(revealAfterReview.value.request.id, written.revealRequestId)

  const repeated = await tool.execute(input, {})
  assert.equal(repeated.rev, written.rev)
  assert.equal(repeated.reviewVerified, true)
  assert.equal(repeated.completionReady, false)
})

test('draw2code_update accepts a stored representative review before writing remaining pages', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const pageOps = (id, name, x) => [
    { op: 'upsert', element: { id, type: 'rectangle', x, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: name, mockDataMin: 3 } } },
    { op: 'upsert', element: { id: `${id}-label`, type: 'text', text: name, x, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: id } } },
    { op: 'upsert', element: { id: `${id}-mock-a`, type: 'text', text: `${name}示例一`, x: x + 24, y: 120, width: 320, height: 30, customData: { role: 'mock-data' } } },
    { op: 'upsert', element: { id: `${id}-mock-b`, type: 'text', text: `${name}示例二`, x: x + 24, y: 170, width: 320, height: 30, customData: { role: 'mock-data' } } },
    { op: 'upsert', element: { id: `${id}-mock-c`, type: 'text', text: `${name}示例三`, x: x + 24, y: 220, width: 320, height: 30, customData: { role: 'mock-data' } } },
  ]
  const representative = await tool.execute({ root, name: 'stored-representative-review', ops: pageOps('page-a', '今天', 0) }, {})
  assert.equal((await store.ackBoardReveal(root, representative.revealRequestId, 'stored-representative-review')).ok, true)
  const reviewed = await tool.execute({
    root,
    name: 'stored-representative-review',
    action: 'review',
    reviewToken: representative.reviewToken,
    phase: 'representative',
    passed: true,
    inspectedPageIds: ['page-a'],
    observations: ['代表页层级和对齐正常'],
  }, {})
  assert.equal(reviewed.nextActionCode, 'write_remaining_pages')

  const completedWrite = await tool.execute({
    root,
    name: 'stored-representative-review',
    ops: [...pageOps('page-b', '全部任务', 450), ...pageOps('page-c', '编辑任务', 900)],
  }, {})
  assert.equal(completedWrite.writeVerified, true)
  assert.equal(completedWrite.prototypeQuality.pages.length, 3)
})

test('draw2code_update preserves remaining page ops while representative review is pending', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const pageOps = (id, name, x) => [
    { op: 'upsert', element: { id, type: 'rectangle', x, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: name, mockDataMin: 3 } } },
    { op: 'upsert', element: { id: `${id}-label`, type: 'text', text: name, x, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: id } } },
    { op: 'upsert', element: { id: `${id}-mock-a`, type: 'text', text: `${name}示例一`, x: x + 24, y: 120, width: 320, height: 30, customData: { role: 'mock-data' } } },
    { op: 'upsert', element: { id: `${id}-mock-b`, type: 'text', text: `${name}示例二`, x: x + 24, y: 170, width: 320, height: 30, customData: { role: 'mock-data' } } },
    { op: 'upsert', element: { id: `${id}-mock-c`, type: 'text', text: `${name}示例三`, x: x + 24, y: 220, width: 320, height: 30, customData: { role: 'mock-data' } } },
  ]
  const representative = await tool.execute({ root, name: 'deferred-pages', ops: pageOps('page-a', '今天', 0) }, {})
  const deferred = await tool.execute({
    root,
    name: 'deferred-pages',
    ops: [...pageOps('page-b', '全部任务', 450), ...pageOps('page-c', '编辑任务', 900)],
  }, {})
  assert.equal(deferred.writeVerified, false)
  assert.equal(deferred.nextActionCode, 'review_representative')
  assert.equal(typeof deferred.pendingUpdateId, 'string')

  assert.equal((await store.ackBoardReveal(root, representative.revealRequestId, 'deferred-pages')).ok, true)
  const reviewed = await tool.execute({
    root,
    name: 'deferred-pages',
    action: 'review',
    reviewToken: representative.reviewToken,
    phase: 'representative',
    passed: true,
    inspectedPageIds: ['page-a'],
    observations: ['代表页首屏可见'],
  }, {})
  assert.equal(reviewed.nextActionCode, 'commit_pending_write')
  assert.equal(reviewed.pendingUpdateId, deferred.pendingUpdateId)

  const committed = await tool.execute({
    root,
    name: 'deferred-pages',
    action: 'commit_pending',
    pendingUpdateId: deferred.pendingUpdateId,
  }, {})
  assert.equal(committed.writeVerified, true)
  assert.equal(committed.prototypeQuality.pages.length, 3)
})

test('draw2code_update rejects a preserved batch after the board changes', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const pageOps = (id, name, x) => [
    { op: 'upsert', element: { id, type: 'rectangle', x, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: name, mockDataMin: 1 } } },
    { op: 'upsert', element: { id: `${id}-label`, type: 'text', text: name, x, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: id } } },
    { op: 'upsert', element: { id: `${id}-mock`, type: 'text', text: `${name}真实任务`, x: x + 24, y: 120, width: 320, height: 30, customData: { role: 'mock-data' } } },
  ]
  await tool.execute({ root, name: 'stale-pending-pages', ops: pageOps('page-a', '今天', 0) }, {})
  const deferred = await tool.execute({
    root,
    name: 'stale-pending-pages',
    ops: [...pageOps('page-b', '全部任务', 450), ...pageOps('page-c', '编辑任务', 900)],
  }, {})
  assert.equal(typeof deferred.pendingUpdateId, 'string')
  const current = await store.read(root, 'stale-pending-pages')
  assert.equal(current.ok, true)
  assert.equal((await store.write(root, 'stale-pending-pages', {
    ...current.value.scene,
    elements: [...current.value.scene.elements, { id: 'manual-note', type: 'text', text: '用户手工补充', x: 24, y: 280, width: 200, height: 30 }],
  }, current.value.rev)).ok, true)

  await assert.rejects(
    () => tool.execute({ root, name: 'stale-pending-pages', action: 'commit_pending', pendingUpdateId: deferred.pendingUpdateId }, {}),
    /pending-update-stale: board changed/,
  )
})

test('draw2code_update rejects a review token after the user changes the visible board revision', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const written = await tool.execute({
    root,
    name: 'stale-review-token',
    ops: [
      { op: 'upsert', element: { id: 'page', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '首页', mockDataMin: 1 } } },
      { op: 'upsert', element: { id: 'page-label', type: 'text', text: '首页', x: 0, y: 4, width: 120, height: 28, customData: { role: 'prototype-page-label', pageId: 'page' } } },
      { op: 'upsert', element: { id: 'mock', type: 'text', text: '提交产品周报', x: 24, y: 120, width: 320, height: 30, customData: { role: 'mock-data' } } },
    ],
  }, {})
  assert.equal((await store.ackBoardReveal(root, written.revealRequestId, 'stale-review-token')).ok, true)
  const current = await store.read(root, 'stale-review-token')
  assert.equal(current.ok, true)
  const changed = await store.write(root, 'stale-review-token', {
    ...current.value.scene,
    elements: [...current.value.scene.elements, { id: 'user-note', type: 'text', text: '用户刚刚补充' }],
  }, current.value.rev)
  assert.equal(changed.ok, true)

  await assert.rejects(
    tool.execute({
      root,
      name: 'stale-review-token',
      action: 'review',
      reviewToken: written.reviewToken,
      phase: 'representative',
      passed: true,
      inspectedPageIds: ['page'],
      observations: ['查看了旧版本'],
    }, {}),
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

test('draw2code_update does not block an independent page added to an established multi-page board', async () => {
  const { root, store } = await makeStore()
  const existingPages = Array.from({ length: 3 }, (_, index) => {
    const x = index * 450
    const id = `existing-page-${index + 1}`
    return [
      { id, type: 'rectangle', x, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: `已有页面 ${index + 1}`, mockDataMin: 1 } },
      { id: `${id}-label`, type: 'text', text: `已有页面 ${index + 1}`, x, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: id } },
      { id: `${id}-mock`, type: 'text', text: `已有任务 ${index + 1}`, x: x + 24, y: 120, width: 320, height: 30, customData: { role: 'mock-data' } },
    ]
  }).flat()
  const filler = Array.from({ length: 480 }, (_, index) => ({
    id: `existing-element-${index}`,
    type: 'rectangle',
    x: 2000 + (index % 24) * 20,
    y: 1200 + Math.floor(index / 24) * 20,
    width: 16,
    height: 16,
  }))
  const written = await store.write(root, 'established-board', { elements: [...existingPages, ...filler] })
  assert.equal(written.ok, true)
  assert.equal((await store.publishBoardReveal(root, 'established-board', written.value.rev)).ok, true)

  const result = await draw2codeUpdateTool(store).execute({
    root,
    name: 'established-board',
    ops: [
      { op: 'upsert', element: { id: 'independent-page', type: 'rectangle', x: 1350, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '独立新增页', mockDataMin: 1 } } },
      { op: 'upsert', element: { id: 'independent-page-label', type: 'text', text: '独立新增页', x: 1350, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'independent-page' } } },
      { op: 'upsert', element: { id: 'independent-page-mock', type: 'text', text: '提交产品周报', x: 1374, y: 120, width: 320, height: 30, customData: { role: 'mock-data' } } },
    ],
  }, {})

  assert.equal(result.writeVerified, true)
  assert.equal(result.applied, 3)
  assert.equal(result.pendingUpdateId, undefined)
  assert.equal(result.prototypeQuality.pages.length, 4)
  assert.equal(result.elementCount, 492)
  assert.equal(result.timings.scope, 'tool-execution')
  assert.equal(typeof result.timings.totalMs, 'number')
  assert.equal(typeof result.timings.timeToFirstEffectiveWriteMs, 'number')
})

test('draw2code_read exposes exact capacity and pending continuation without history lookup', async () => {
  const { root, store } = await makeStore()
  const tool = draw2codeUpdateTool(store)
  const pageOps = (id, name, x) => [
    { op: 'upsert', element: { id, type: 'rectangle', x, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: name, mockDataMin: 1 } } },
    { op: 'upsert', element: { id: `${id}-label`, type: 'text', text: name, x, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: id } } },
    { op: 'upsert', element: { id: `${id}-mock`, type: 'text', text: `${name}真实任务`, x: x + 24, y: 120, width: 320, height: 30, customData: { role: 'mock-data' } } },
  ]
  const representative = await tool.execute({ root, name: 'continuation-board', ops: pageOps('page-a', '今天', 0) }, {})
  const pending = await tool.execute({
    root,
    name: 'continuation-board',
    ops: [...pageOps('page-b', '全部任务', 450), ...pageOps('page-c', '编辑任务', 900)],
  }, {})
  assert.equal(pending.nextActionCode, 'review_representative')

  const read = await draw2codeReadTool(store).execute({ root, name: 'continuation-board' }, {})

  assert.equal(read.capacity.maxBytes, 256 * 1024 * 1024)
  assert.equal(read.capacity.hardCapBytes, read.capacity.maxBytes)
  assert.equal(read.capacity.canonicalBytes, read.capacity.usedBytes)
  assert.equal(read.capacity.persistedBytes > read.capacity.canonicalBytes, true)
  assert.equal(read.capacity.remainingBytes, read.capacity.maxBytes - read.capacity.usedBytes)
  assert.equal(read.capacity.usedBytes > 0, true)
  assert.equal(read.continuation.status, 'review_representative')
  assert.equal(read.continuation.pendingUpdateId, pending.pendingUpdateId)
  assert.deepEqual(read.continuation.nextAction, {
    tool: 'draw2code_update',
    arguments: {
      root,
      name: 'continuation-board',
      action: 'review',
      reviewToken: representative.reviewToken,
      phase: 'representative',
    },
  })

  assert.equal((await store.ackBoardReveal(root, representative.revealRequestId, 'continuation-board')).ok, true)
  await tool.execute({
    root,
    name: 'continuation-board',
    action: 'review',
    reviewToken: representative.reviewToken,
    phase: 'representative',
    passed: true,
    inspectedPageIds: ['page-a'],
    observations: ['代表页首屏可见'],
  }, {})
  const reviewed = await draw2codeReadTool(store).execute({ root, name: 'continuation-board' }, {})
  assert.equal(reviewed.continuation.status, 'commit_pending_write')
  assert.deepEqual(reviewed.continuation.nextAction, {
    tool: 'draw2code_update',
    arguments: {
      root,
      name: 'continuation-board',
      action: 'commit_pending',
      pendingUpdateId: pending.pendingUpdateId,
    },
  })
})

test('draw2code_update rejects an oversized operation batch before layout or write work', async () => {
  const { root, store } = await makeStore()
  const result = await draw2codeUpdateTool(store).execute({
    root,
    name: 'capacity-preflight',
    ops: Array.from({ length: 220 }, (_, index) => ({
      op: 'upsert',
      element: {
        id: `large-${index}`,
        type: 'text',
        text: `任务 ${index} ${'内容'.repeat(1000)}`,
        x: index * 4,
        y: index * 4,
        width: 320,
        height: 30,
      },
    })),
  }, {})

  assert.equal(result.writeVerified, false)
  assert.equal(result.nextActionCode, 'reduce_batch_size')
  assert.equal(result.operationBudget.bytes > result.operationBudget.maxBytes, true)
  assert.equal(result.capacity.status, 'normal')
  assert.equal(result.applied, 0)
  assert.equal(result.timings.timeToFirstEffectiveWriteMs, null)
})

test('draw2code_update distinguishes final board exhaustion from an oversized batch', async () => {
  const { root, store } = await makeStore({ hardCapBytes: 64 * 1024, maxBatchBytes: 512 * 1024 })
  const result = await draw2codeUpdateTool(store).execute({
    root,
    name: 'full-board',
    ops: Array.from({ length: 22 }, (_, index) => ({
      op: 'upsert',
      element: {
        id: `large-${index}`,
        type: 'text',
        text: `任务 ${index} ${'内容'.repeat(700)}`,
        x: index * 4,
        y: index * 4,
        width: 320,
        height: 30,
      },
    })),
  }, {})

  assert.equal(result.writeVerified, false)
  assert.equal(result.nextActionCode, 'archive_or_split_board')
  assert.equal(result.capacity.projectedCanonicalBytes > result.capacity.hardCapBytes, true)
  assert.equal(result.capacity.excessBytes, result.capacity.projectedCanonicalBytes - result.capacity.hardCapBytes)
  assert.equal(result.applied, 0)
  assert.equal(result.timings.timeToFirstEffectiveWriteMs, null)
})

test('draw2code_read is bounded by default and paginates explicit full reads by UTF-8 bytes', async () => {
  const { root, store } = await makeStore()
  const written = await store.write(root, 'read-payload-cap', {
    elements: Array.from({ length: 14 }, (_, index) => ({
      id: `card-${index}`,
      type: 'rectangle',
      customData: { mockData: '用户任务'.repeat(750) },
    })),
  })
  assert.equal(written.ok, true)

  const index = await draw2codeReadTool(store).execute({ root, name: 'read-payload-cap' }, {})
  assert.equal(index.elementCount, 14)
  assert.deepEqual(index.elements, [])
  assert.equal(index.selection.detail, 'index')
  assert.equal(index.selection.returnedElementCount, 0)

  const first = await draw2codeReadTool(store).execute({ root, name: 'read-payload-cap', detail: 'full' }, {})
  assert.equal(first.elements.length > 1, true)
  assert.equal(first.elements.length < 14, true)
  assert.equal(first.selection.returnedBytes <= first.selection.maxReturnedBytes, true)
  assert.equal(typeof first.nextCursor, 'string')

  const second = await draw2codeReadTool(store).execute({ root, name: 'read-payload-cap', detail: 'full', cursor: first.nextCursor }, {})
  assert.equal(first.elements.length + second.elements.length, 14)
  assert.equal(second.nextCursor, undefined)
})

test('draw2code_read bounds quality diagnostics on a large malformed board', async () => {
  const { root, store } = await makeStore()
  const written = await store.write(root, 'bounded-diagnostics', {
    elements: Array.from({ length: 600 }, (_, index) => ({
      id: `overflow-${index}`,
      type: 'text',
      text: `第 ${index} 条任务\n第二行说明\n第三行状态`,
      x: (index % 20) * 340,
      y: Math.floor(index / 20) * 24,
      width: 320,
      height: 1,
    })),
  })
  assert.equal(written.ok, true)

  const result = await draw2codeReadTool(store).execute({ root, name: 'bounded-diagnostics' }, {})
  const responseBytes = Buffer.byteLength(JSON.stringify(result), 'utf8')

  assert.equal(result.elementCount, 600)
  assert.equal(result.layoutWarnings.length <= 20, true)
  assert.equal(result.selection.diagnostics.totalWarnings >= 600, true)
  assert.equal(result.selection.diagnostics.truncated, true)
  assert.equal(responseBytes < 128 * 1024, true)
})

test('draw2code_read selects by page, ids, region, and recent revision without returning the whole board', async () => {
  const { root, store } = await makeStore()
  const firstWrite = await store.write(root, 'scoped-read', {
    elements: [
      { id: 'page-a', type: 'rectangle', x: 0, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '页面 A', mockDataMin: 1 } },
      { id: 'page-a-label', type: 'text', text: '页面 A', x: 0, y: 4, width: 160, height: 28, customData: { role: 'prototype-page-label', pageId: 'page-a' } },
      { id: 'task-a', type: 'text', text: '提交产品周报', x: 24, y: 120, width: 220, height: 30, customData: { role: 'mock-data' } },
      { id: 'page-b', type: 'rectangle', x: 480, y: 40, width: 390, height: 844, customData: { role: 'prototype-page', pageName: '页面 B', mockDataMin: 1 } },
      { id: 'task-b', type: 'text', text: '预约牙医', x: 504, y: 120, width: 220, height: 30, customData: { role: 'mock-data' } },
    ],
  })
  assert.equal(firstWrite.ok, true)
  await draw2codeReadTool(store).execute({ root, name: 'scoped-read' }, {})

  const pageRead = await draw2codeReadTool(store).execute({ root, name: 'scoped-read', pageIds: ['page-a'] }, {})
  assert.deepEqual(new Set(pageRead.elements.map((element) => element.id)), new Set(['page-a', 'page-a-label', 'task-a']))
  assert.equal(pageRead.elements.some((element) => element.id === 'task-b'), false)

  const regionRead = await draw2codeReadTool(store).execute({ root, name: 'scoped-read', region: { x: 480, y: 100, width: 300, height: 100 } }, {})
  assert.deepEqual(regionRead.elements.map((element) => element.id), ['page-b', 'task-b'])

  const idRead = await draw2codeReadTool(store).execute({ root, name: 'scoped-read', elementIds: ['task-b'] }, {})
  assert.deepEqual(idRead.elements.map((element) => element.id), ['task-b'])

  const beforeChange = await store.read(root, 'scoped-read')
  assert.equal(beforeChange.ok, true)
  const secondWrite = await store.write(root, 'scoped-read', {
    elements: [
      ...beforeChange.value.scene.elements
        .filter((element) => element.id !== 'task-b')
        .map((element) => element.id === 'task-a'
          ? { ...element, text: '提交产品周报（已修改）', originalText: '提交产品周报（已修改）' }
          : element),
      { id: 'task-c', type: 'text', text: '准备周会材料', x: 504, y: 180, width: 220, height: 30, customData: { role: 'mock-data' } },
    ],
  }, firstWrite.value.rev)
  assert.equal(secondWrite.ok, true)

  const changes = await draw2codeReadTool(store).execute({ root, name: 'scoped-read', changesSince: firstWrite.value.rev }, {})
  assert.deepEqual(new Set(changes.elements.map((element) => element.id)), new Set(['task-a', 'task-c']))
  assert.deepEqual(changes.deletedElementIds, ['task-b'])
  assert.equal(changes.selection.changeTracking.status, 'available')
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

test('draw2code_generate asks about a reference-style image in ordinary chat before creating a session', async () => {
  const { root, store } = await makeStore()
  const tool = rawDraw2codeGenerateTool(store)
  const result = await tool.execute({ root, action: 'start' }, {})

  assert.equal(result.status, 'reference-style-prompt')
  assert.match(result.prompt, /有没有参考风格的图片/)
  assert.equal(result.nextAction, 'ask-reference-style-then-start')
  assert.equal(result.sessionId, undefined)
  assert.equal(result.question, undefined)
  const rendered = tool.output.render({ root, action: 'start' }, result)
  assert.match(rendered[0].text, /普通对话询问/)
  assert.doesNotMatch(rendered[0].text, /askUserQuestionArgs/)
})

test('draw2code_generate recommends an inspected reference image without changing the page-scope step', async () => {
  const { root, store } = await makeStore()
  await store.write(root, 'generate-reference', {
    elements: [
      { id: 'home', type: 'frame', name: '首页', x: 0, y: 0, width: 390, height: 844 },
      { id: 'home-title', type: 'text', text: '今日重点任务', frameId: 'home', x: 24, y: 80, width: 220, height: 32 },
    ],
  })
  const tool = rawDraw2codeGenerateTool(store)
  const started = await tool.execute({
    root,
    action: 'start',
    name: 'generate-reference',
    referenceStyle: '已查看：暖白底、编辑杂志式留白、克制蓝色强调',
  }, {})

  assert.equal(started.status, 'question')
  assert.equal(started.question.id, 'page-scope')
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
  assert.equal(visual.question.options[0].id, 'reference-image')
  assert.equal(visual.question.options[0].recommended, true)
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

  const summaryEvidence = await browserEvidence(root, 'generate-flow', { 首页: ['附近的人'] })
  const summaryBytes = Buffer.from('页面=首页\n附近的人', 'utf8')
  await writeFile(summaryEvidence.domSnapshots[0].source, summaryBytes)
  summaryEvidence.domSnapshots[0].sha256 = artifactHash(summaryBytes)
  const summaryRejected = await tool.execute({
    root,
    action: 'complete',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    verificationEvidence: summaryEvidence,
  }, {})
  assert.equal(summaryRejected.status, 'error')
  assert.equal(summaryRejected.error.code, 'verification-evidence-failed')
  assert.match(summaryRejected.error.message, /domSnapshot:首页:not-browser-dom/)

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
    verificationEvidence: JSON.stringify(await browserEvidence(root, 'generate-flow', { 首页: ['附近的人'] })),
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
    brief: { pages: [{ id: 'home', name: '首页' }] },
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

test('draw2code_create resumes an unfinished legacy questionnaire as v2 discovery without re-asking saved facts', async () => {
  const { root, store, projects } = await makeStore()
  const created = await projects.create(root, {
    projectId: 'project-00000000-0000-4000-8000-000000000099',
    projectName: '旧版雷达社交',
    originalIdea: '一个陌生人雷达社交 App',
    status: 'draft',
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    boardName: null,
    deferredStyleNote: null,
    answers: {
      'target-platform': { questionId: 'target-platform', values: ['app'], confirmed: true },
    },
    currentQuestion: {
      id: 'core-user', kind: 'choice', text: '这个工具主要服务谁？', selectionMode: 'single',
      options: [{ id: 'consumer', label: '普通消费者' }], allowOther: true,
    },
    pendingInterpretation: null,
    brief: null,
    history: [{ revision: 1, action: 'start', at: Date.now() }],
  })
  assert.equal(created.ok, true)

  const tool = draw2codeCreateTool(projects, store)
  const resumed = await tool.execute({ root, action: 'resume', sessionId: created.value.projectId }, {})
  assert.equal(resumed.status, 'discovery')
  assert.equal(resumed.flowVersion, 2)
  assert.equal(resumed.revision, 2)
  assert.equal(resumed.question, undefined)
  assert.ok(resumed.discovery.explicitFacts.some((fact) => /App/.test(fact)))
  assert.ok(resumed.discovery.resolvedDecisions.some((fact) => /产品端.*App/i.test(fact)))
  assert.ok(!resumed.discovery.openDimensions.includes('target-platform'))

  const reread = await projects.read(root, created.value.projectId)
  assert.equal(reread.ok, true)
  assert.equal(reread.value.flowVersion, 2)
  assert.equal(reread.value.currentQuestion, null)
})

test('draw2code_create starts adaptive discovery without touching the board', async () => {
  const { root, canonicalRoot, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)

  const result = await tool.execute({
    root,
    action: 'start',
    idea: '万年历穿搭工具',
    projectName: '万年历穿搭',
  }, {})

  assert.equal(result.status, 'discovery')
  assert.equal(result.flowVersion, 2)
  assert.equal(result.discovery.questionCount, 0)
  assert.equal(result.discovery.maxQuestions, 10)
  assert.equal(result.discovery.remainingQuestions, 10)
  assert.equal(result.discovery.nextAction, 'propose_question')
  assert.deepEqual(result.discovery.recommendedDimensions.slice(0, 2), ['unique-mechanism', 'trigger-context'])
  assert.ok(result.briefContract.page.some((field) => /mockDataGroups/.test(field)))
  assert.ok(result.discovery.openDimensions.includes('target-platform'))
  assert.equal(result.question, undefined)
  assert.equal(result.nameProposal.suggestedName, '万年历穿搭')
  assert.match(result.projectFile, /^draw2code\/\.projects\/project-[^/]+\.json$/)
  const rendered = tool.output.render({ root, action: 'start', idea: '万年历穿搭工具' }, result)
  assert.match(rendered[0].text, /sessionId=project-/)
  assert.match(rendered[0].text, /revision=1/)
  assert.match(rendered[0].text, /status=discovery/)
  assert.match(rendered[0].text, /action=propose_question/)
  assert.match(rendered[0].text, /allowedDimensions=.*trigger-context.*unique-mechanism/)

  const boards = await store.list(root)
  assert.equal(boards.ok, true)
  assert.deepEqual(boards.value, [])
  const draft = JSON.parse(await readFile(join(canonicalRoot, result.projectFile), 'utf8'))
  assert.equal(draft.status, 'draft')
  assert.equal(draft.flowVersion, 2)
  assert.equal(draft.revision, 1)
  assert.equal(draft.originalIdea, '万年历穿搭工具')
})

test('draw2code_create accepts one grounded product question and renders its insight before the choices', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({
    root,
    action: 'start',
    idea: '我想做一个类似龙珠雷达的陌生人社交APP。',
    projectName: '龙珠雷达社交',
  }, {})

  const proposed = await tool.execute({
    root,
    action: 'propose_question',
    sessionId: started.sessionId,
    revision: started.revision,
    question: {
      id: 'q1-trust-mechanism',
      dimension: 'unique-mechanism',
      insight: '真正的难点不是看见附近的人，而是让陌生人有一个自然且安全的理由建立联系。',
      text: '双方第一次建立关系，需要经过什么门槛？',
      decisionImpact: '决定关系建立流程、信任强度和雷达首页的主要操作。',
      recommendedOptionId: 'bump',
      dependsOn: [],
      options: [
        { id: 'bump', label: '线下碰一碰', description: '信任强且有辨识度，但使用门槛较高。' },
        { id: 'mutual-like', label: '双方表达兴趣', description: '增长更容易，但会更像普通交友产品。' },
        { id: 'shared-place', label: '共同地点触发', description: '联系理由自然，但依赖地点密度。' },
      ],
    },
  }, {})

  assert.equal(proposed.status, 'question')
  assert.equal(proposed.question.dimension, 'unique-mechanism')
  assert.match(proposed.question.insight, /陌生人.*安全/)
  assert.match(proposed.question.text, /^判断：.*陌生人.*安全.*问题：/s)
  assert.equal(proposed.question.recommendedOptionId, 'bump')
  assert.ok(proposed.question.options.some((option) => option.id === 'unknown'))
  assert.ok(proposed.question.options.some((option) => option.id === 'other'))
  assert.ok(proposed.question.options.some((option) => option.id === 'synthesize-now'))
  assert.match(proposed.question.askUserQuestionArgs.questions[0].question, /判断：.*陌生人.*安全.*问题：/s)
  assert.equal(proposed.question.askUserQuestionArgs.questions[0].multi_select, false)
  assert.ok(proposed.question.askUserQuestionArgs.questions[0].options.some((option) => option.label === '直接整理项目简报'))
  assert.equal(proposed.discovery.questionCount, 1)
  assert.equal(proposed.discovery.remainingQuestions, 9)

  const rendered = tool.output.render({ root, action: 'propose_question' }, proposed)
  assert.match(rendered[0].text, /判断：真正的难点/)
  assert.match(rendered[0].text, /推荐：线下碰一碰/)
  assert.match(rendered[0].text, /决定关系建立流程/)

  const answered = await tool.execute({
    root,
    action: 'answer',
    sessionId: proposed.sessionId,
    revision: proposed.revision,
    questionId: proposed.question.id,
    values: ['bump'],
  }, {})
  assert.equal(answered.status, 'discovery')
  assert.equal(answered.question, undefined)
  assert.ok(answered.discovery.resolvedDecisions.some((item) => /线下碰一碰/.test(item)))
  assert.ok(!answered.discovery.openDimensions.includes('unique-mechanism'))
  assert.equal(answered.discovery.nextAction, 'propose_question')
})

test('draw2code_create rejects a native question payload that could drop its insight or user controls', async () => {
  const { root, store, projects } = await makeStore()
  const tool = rawDraw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '个人待办清单 App', projectName: '个人待办' }, {})
  const result = await tool.execute({
    root,
    action: 'propose_question',
    sessionId: started.sessionId,
    revision: started.revision,
    question: {
      id: 'q1-trigger',
      dimension: 'trigger-context',
      insight: '普通待办的替代产品很多，首版必须先找到用户仍然无法决定先做什么的具体时刻。',
      text: '用户最需要产品介入的是哪个任务决策时刻？',
      decisionImpact: '决定首页采用四象限、时间线还是单一聚焦任务。',
      recommendedOptionId: 'morning',
      dependsOn: [],
      options: [
        { id: 'morning', label: '每天开始工作时', description: '触发稳定，适合先判断当天优先事项。' },
        { id: 'change', label: '计划突然变化时', description: '决策压力更强，需要突出快速重新排序。' },
      ],
    },
  }, {})
  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'question_presentation_invalid')
  assert.match(result.error.message, /判断：.*问题：|原生问题卡片/s)

  const insight = '普通待办的替代产品很多，首版必须先找到用户仍然无法决定先做什么的具体时刻。'
  const escapedNewlines = await tool.execute({
    root,
    action: 'propose_question',
    sessionId: started.sessionId,
    revision: started.revision,
    question: {
      id: 'q1-trigger',
      dimension: 'trigger-context',
      insight,
      text: `判断：${insight}\\n\\n问题：普通待办仍然无法帮用户决定先做什么，因此用户最需要产品介入的是哪个任务决策时刻？`,
      decisionImpact: '决定首页采用四象限、时间线还是单一聚焦任务。',
      recommendedOptionId: 'morning',
      dependsOn: [],
      options: [
        { id: 'morning', label: '每天开始工作时', description: '触发稳定，适合先判断当天优先事项。' },
        { id: 'change', label: '计划突然变化时', description: '决策压力更强，需要突出快速重新排序。' },
        ...NATIVE_CREATE_CONTROLS,
      ],
    },
  }, {})
  assert.equal(escapedNewlines.status, 'question')
})

test('draw2code_create accepts structured question and brief payloads serialized by the DSH host', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '个人四象限待办清单 App', projectName: '四象限待办' }, {})
  const question = {
    id: 'q1-trigger', dimension: 'trigger-context', dependsOn: [],
    insight: '普通待办产品已经很多，首版必须找到用户仍然无法判断下一步的具体任务决策时刻。',
    text: '用户最需要待办产品介入的是哪个任务决策时刻？',
    decisionImpact: '决定首页采用四象限、时间线还是聚焦单一任务。',
    recommendedOptionId: 'morning',
    options: [
      { id: 'morning', label: '每天开始工作时', description: '触发稳定，适合用优先级组织当天任务。' },
      { id: 'change', label: '计划突然变化时', description: '决策压力更强，但需要突出重新排序能力。' },
    ],
  }
  const proposed = await tool.execute({
    root, action: 'propose_question', sessionId: started.sessionId, revision: started.revision,
    question: JSON.stringify(question),
  }, {})
  assert.equal(proposed.status, 'question')
  const answered = await tool.execute({
    root, action: 'answer', sessionId: proposed.sessionId, revision: proposed.revision,
    questionId: question.id, values: ['morning'],
  }, {})
  const ready = await tool.execute({
    root, action: 'synthesize', sessionId: answered.sessionId, revision: answered.revision,
    stopReason: '宿主字符串载荷回归。', brief: JSON.stringify(quadrantPrototypeBrief()),
  }, {})
  assert.equal(ready.status, 'ready')
  assert.match(ready.briefMarkdown, /# 个人四象限待办清单原型/)
})

function quadrantPrototypeBrief() {
  return {
    title: '个人四象限待办清单',
    productDefinition: '为个人用户设计一款移动端待办清单，让用户每天打开应用后立即看清今天最应该优先完成什么。首版采用四象限组织任务，只验证查看、调整优先级、完成和编辑任务这条核心流程。',
    target: '需要每天安排个人任务、但经常无法判断优先顺序的个人用户。',
    coreScenario: '用户在一天开始或计划发生变化时打开应用，快速判断下一项应该处理的任务。',
    coreOutcome: '用户在 5 秒内识别最高优先级任务，并能立即完成、调整或编辑。',
    uniqueMechanism: ['使用重要性与紧急性组成的四象限直接表达行动优先级。'],
    firstVersionFlow: ['查看今天任务', '调整任务象限', '完成任务', '查看其他日期任务', '添加或编辑任务'],
    includedScope: ['今日任务', '全部任务', '四象限调整', '完成任务', '添加和编辑任务'],
    excludedScope: ['团队协作', '统计报表', '复杂重复规则', '多级子任务'],
    prototypeLayout: {
      platform: '移动端 App',
      viewport: { width: 390, height: 844 },
      arrangement: '3 个页面横向排列，页面之间保留足够间距。',
      connectionStyle: '核心流程使用带文字说明的画布级箭头连接。',
      representativePageId: 'today',
      comprehensionGoal: '普通缩放下，用户能在 5 秒内识别今天最优先的任务。',
    },
    pages: [
      {
        id: 'today',
        name: '今日四象限',
        goal: '用户在 5 秒内看懂今天最应该做什么。',
        size: { width: 390, height: 844 },
        structure: ['顶部标题：今天', '日期：8 月 21 日 · 星期五', '完成进度：已完成 3 / 9', '四个 2 × 2 象限卡片', '底部导航：今天 / 全部 / 我的'],
        primaryAction: '新增任务',
        secondaryActions: ['勾选完成', '点击任务进入编辑'],
        mockDataGroups: [
          { name: '重要且紧急', items: ['10:30 提交产品周报', '14:00 修复登录页闪退', '已逾期 预约牙医'] },
          { name: '重要不紧急', items: ['周五前 完成阅读计划', '20:00 跑步 30 分钟'] },
          { name: '紧急不重要', items: ['11:00 回复物业电话', '18:00 取快递'] },
          { name: '不紧急不重要', items: ['整理手机相册', '查看收藏的文章'] },
        ],
        states: ['今天为底部导航选中项', '临近到期使用橙色提示', '已逾期使用红色提示'],
        navigation: ['今天（选中）', '全部', '我的'],
        annotations: ['长按任务可拖到其他象限'],
        acceptanceCriteria: ['四个象限均有可读标题、语义色和真实任务。'],
      },
      {
        id: 'all',
        name: '全部任务',
        goal: '查看今天以外的任务，并快速搜索、筛选或进入编辑。',
        size: { width: 390, height: 844 },
        structure: ['顶部标题：全部任务', '搜索框：搜索任务', '筛选项：全部 / 今天 / 未来 / 已完成', '任务按日期分组', '底部导航中全部为选中状态'],
        primaryAction: '新增任务',
        secondaryActions: ['搜索任务', '切换筛选', '打开任务'],
        mockDataGroups: [
          { name: '今天', items: ['提交产品周报 · 重要紧急 · 10:30', '回复物业电话 · 紧急不重要 · 11:00', '跑步 30 分钟 · 重要不紧急 · 20:00'] },
          { name: '明天', items: ['准备周会材料 · 重要紧急 · 09:30', '购买洗衣液 · 不紧急不重要'] },
        ],
        states: ['全部为当前筛选项和底部导航选中项'],
        navigation: ['今天', '全部（选中）', '我的'],
        annotations: [],
        acceptanceCriteria: ['任务标题、象限、日期和提醒状态完整可见。'],
      },
      {
        id: 'edit',
        name: '添加／编辑任务',
        goal: '以较低录入成本创建或修改一条任务。',
        size: { width: 390, height: 844 },
        structure: ['页面标题：编辑任务', '任务标题输入', '日期选择', '四象限选择器', '基础提醒开关与提醒时间', '主按钮：保存任务'],
        primaryAction: '保存任务',
        secondaryActions: ['取消', '删除任务'],
        mockDataGroups: [
          { name: '真实编辑案例', items: ['任务标题：提交产品周报', '日期：2026 年 8 月 21 日', '当前象限：重要紧急', '提醒时间：10:00'] },
        ],
        states: ['重要紧急为当前选中项', '基础提醒已开启'],
        navigation: [],
        annotations: [],
        acceptanceCriteria: ['编辑案例的标题、日期、象限和提醒时间均可读。'],
      },
    ],
    pageRelations: [
      { fromPageId: 'today', toPageId: 'edit', trigger: '点击新增按钮或任务卡片', result: '进入新增或编辑状态', arrowStyle: 'solid', label: '新增／编辑' },
      { fromPageId: 'today', toPageId: 'all', trigger: '点击底部全部', result: '查看其他日期任务', arrowStyle: 'solid', label: '查看全部' },
      { fromPageId: 'edit', toPageId: 'today', trigger: '保存任务', result: '返回并更新对应象限', arrowStyle: 'solid', label: '保存返回' },
      { fromPageId: 'today', toPageId: 'today', trigger: '长按并拖拽任务', result: '任务移动到另一个象限', arrowStyle: 'dashed', label: '拖拽换象限' },
    ],
    prototypePrinciples: ['采用语义化低保真', '使用真实标题、状态和任务内容', '每页只突出一个主要操作', '按钮文字水平、垂直居中', '底部导航文字完整可见'],
    acceptanceCriteria: ['3 个移动端页面完整出现且没有内容裁切', '所有标题、任务和状态文字首次渲染可见', '按钮文案水平、垂直居中', '底部导航对齐且内容完整', '页面关系箭头不遮挡正文', '新增、编辑、切换全部和拖拽换象限流程表达清楚'],
    assumptions: ['原型仅面向手机 App', '无需登录、注册或云同步', '我的只作为导航占位', '首版使用固定 mock 数据', '视觉风格和技术实现延迟到 generate 阶段'],
    pendingDecisions: [],
  }
}

test('draw2code_create synthesizes one executable brief and renders the complete Markdown document', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '我想做一个个人四象限待办清单 App', projectName: '四象限待办' }, {})

  const ready = await tool.execute({
    root,
    action: 'synthesize',
    sessionId: started.sessionId,
    revision: started.revision,
    stopReason: '核心场景、独特机制、首版流程和范围已经明确。',
    brief: quadrantPrototypeBrief(),
  }, {})

  assert.equal(ready.status, 'ready')
  assert.equal(ready.brief.title, '个人四象限待办清单')
  assert.equal(ready.brief.pages.length, 3)
  assert.equal(ready.brief.pageBlueprints.length, 3)
  assert.equal(ready.brief.pageMockData[0].examples.length, 9)
  assert.match(ready.briefMarkdown, /^# 个人四象限待办清单原型/m)
  assert.match(ready.briefMarkdown, /## 产品定义/)
  assert.match(ready.briefMarkdown, /### 页面一：今日四象限/)
  assert.match(ready.briefMarkdown, /真实 mock 数据：/)
  assert.match(ready.briefMarkdown, /10:30 提交产品周报/)
  assert.match(ready.briefMarkdown, /## 页面关系与交互表达/)
  assert.match(ready.briefMarkdown, /## 原型表达原则/)
  assert.match(ready.briefMarkdown, /## 验收方式/)
  assert.match(ready.briefMarkdown, /## 默认假设/)

  const rendered = tool.output.render({ root, action: 'synthesize' }, ready)
  assert.match(rendered[0].text, /# 个人四象限待办清单原型/)
  assert.match(rendered[0].text, /调整产品方向/)
  assert.match(rendered[0].text, /调整页面范围/)
  assert.deepEqual(ready.confirmation.pageNames, ['今日四象限', '全部任务', '添加／编辑任务'])
  assert.match(ready.confirmation.question, /3 个页面：今日四象限、全部任务、添加／编辑任务/)
  assert.equal(ready.confirmation.askUserQuestionArgs.questions[0].header, '页面确认')
  assert.deepEqual(
    ready.confirmation.askUserQuestionArgs.questions[0].options.map((option) => option.label),
    ['确认这些页面并绘制', '调整页面范围', '调整产品方向'],
  )

  const confirmed = await tool.execute({
    root,
    action: 'confirm',
    sessionId: ready.sessionId,
    revision: ready.revision,
  }, {})
  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.brief.briefSchemaVersion, 2)
  assert.equal(confirmed.brief.title, '个人四象限待办清单')
  assert.equal(confirmed.briefMarkdown, ready.briefMarkdown)
  assert.equal(confirmed.nextAction, 'draw2code_update')
  assert.equal(confirmed.drawingPlan.nextActionCode, 'write_representative')
  assert.deepEqual(confirmed.drawingPlan.allowedPageIds, ['today'])
  assert.deepEqual(confirmed.drawingPlan.remainingPageIds, ['all', 'edit'])
})

test('draw2code_create refuses a brief whose page structure is still generic placeholder language', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '个人四象限待办清单 App', projectName: '四象限待办' }, {})
  const brief = quadrantPrototypeBrief()
  brief.pages[0].structure = ['顶部区域', '内容卡片', '若干按钮']

  const result = await tool.execute({
    root,
    action: 'synthesize',
    sessionId: started.sessionId,
    revision: started.revision,
    stopReason: '尝试直接整理简报。',
    brief,
  }, {})
  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'brief_quality_invalid')
  assert.match(result.error.message, /可直接绘制|泛化|顶部区域/)
})

test('draw2code_create reports the exact mockDataGroups contract instead of forcing schema guesses', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '个人四象限待办清单 App', projectName: '四象限待办' }, {})
  const brief = quadrantPrototypeBrief()
  brief.pages[0].mockData = brief.pages[0].mockDataGroups.flatMap((group) => group.items)
  delete brief.pages[0].mockDataGroups
  const result = await tool.execute({
    root,
    action: 'synthesize',
    sessionId: started.sessionId,
    revision: started.revision,
    stopReason: '验证 schema 错误提示。',
    brief,
  }, {})
  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'brief_quality_invalid')
  assert.match(result.error.message, /mockDataGroups.*\[\{ name, items: string\[\] \}\].*不要使用 mockData/s)
})

test('draw2code_create rejects canned questions and enforces the ten-question budget', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  let state = await tool.execute({ root, action: 'start', idea: '我想做一个个人待办清单 App', projectName: '个人待办' }, {})

  const generic = await tool.execute({
    root,
    action: 'propose_question',
    sessionId: state.sessionId,
    revision: state.revision,
    question: {
      id: 'q-generic',
      dimension: 'product-architecture',
      insight: '目前还没有明确首版页面，因此需要继续补齐常见的产品结构信息。',
      text: '第一版需要包含哪些核心模块？',
      decisionImpact: '决定首版产品的信息结构和页面数量。',
      recommendedOptionId: 'home',
      dependsOn: [],
      options: [
        { id: 'home', label: '首页', description: '提供产品总览，但没有体现当前产品的独特场景。' },
        { id: 'profile', label: '个人中心', description: '提供个人信息，但未必属于首版核心闭环。' },
      ],
    },
  }, {})
  assert.equal(generic.status, 'error')
  assert.equal(generic.error.code, 'question_quality_invalid')
  assert.match(generic.error.message, /固定.*模块.*页面问卷|结合当前产品场景/)

  const prematureArchitecture = await tool.execute({
    root,
    action: 'propose_question',
    sessionId: state.sessionId,
    revision: state.revision,
    question: {
      id: 'q-premature-architecture',
      dimension: 'product-architecture',
      insight: '个人待办的组织方式会影响首页，但在不知道用户何时仍无法决定先做什么之前就选结构，容易把现有产品重新画一遍。',
      text: '任务应采用哪种可视化组织模型？',
      decisionImpact: '决定首页是时间线、优先级矩阵还是普通列表。',
      recommendedOptionId: 'timeline',
      dependsOn: [],
      options: [
        { id: 'timeline', label: '时间线', description: '强调先后顺序，但不直接解决任务取舍。' },
        { id: 'matrix', label: '优先级矩阵', description: '突出取舍，但需要用户理解分类规则。' },
      ],
    },
  }, {})
  assert.equal(prematureArchitecture.status, 'error')
  assert.equal(prematureArchitecture.error.code, 'question_priority_invalid')
  assert.match(prematureArchitecture.error.message, /trigger-context.*existing-alternative/)

  const dimensions = ['trigger-context', 'existing-alternative', 'core-outcome', 'unique-mechanism', 'core-loop', 'critical-risk', 'scope-proof', 'target-user', 'target-platform', 'product-architecture']
  for (const [index, dimension] of dimensions.entries()) {
    state = await tool.execute({
      root,
      action: 'propose_question',
      sessionId: state.sessionId,
      revision: state.revision,
      question: {
        id: `q${index + 1}-${dimension}`,
        dimension,
        insight: `针对这个个人待办产品，第 ${index + 1} 个仍未解决的决策会直接改变用户每天安排任务的方式。`,
        text: `关于每天安排任务的第 ${index + 1} 个关键取舍，首版应该优先验证哪种方向？`,
        decisionImpact: `这个答案将决定第 ${index + 1} 项核心流程和对应的原型表达。`,
        recommendedOptionId: 'focused',
        dependsOn: [],
        options: [
          { id: 'focused', label: `聚焦方向 ${index + 1}`, description: '更容易验证核心价值，但会主动舍弃一部分边缘场景。' },
          { id: 'broad', label: `完整方向 ${index + 1}`, description: '覆盖场景更多，但首版范围和理解成本都会明显增加。' },
        ],
      },
    }, {})
    assert.equal(state.status, 'question')
    state = await tool.execute({
      root,
      action: 'answer',
      sessionId: state.sessionId,
      revision: state.revision,
      questionId: state.question.id,
      values: ['focused'],
    }, {})
  }

  assert.equal(state.status, 'discovery')
  assert.equal(state.discovery.questionCount, 10)
  assert.equal(state.discovery.remainingQuestions, 0)
  assert.equal(state.discovery.nextAction, 'synthesize')

  const overLimit = await tool.execute({
    root,
    action: 'propose_question',
    sessionId: state.sessionId,
    revision: state.revision,
    question: {
      id: 'q11-more',
      dimension: 'core-outcome',
      insight: '虽然前面已经完成十个问题，但这里仍试图继续增加新的产品决策问题。',
      text: '是否继续增加第十一个产品问题？',
      decisionImpact: '这会突破已经约定的问题预算并拖慢用户进入原型。',
      recommendedOptionId: 'stop',
      dependsOn: ['q3-core-outcome'],
      options: [
        { id: 'stop', label: '停止提问', description: '按照约定进入项目简报，避免无限追问。' },
        { id: 'continue', label: '继续提问', description: '获得更多信息，但违反最多十题的明确约束。' },
      ],
    },
  }, {})
  assert.equal(overLimit.status, 'error')
  assert.equal(overLimit.error.code, 'question_limit_reached')

  const readyAtLimit = await tool.execute({
    root,
    action: 'synthesize',
    sessionId: state.sessionId,
    revision: state.revision,
    stopReason: '已达到十题上限。',
    brief: quadrantPrototypeBrief(),
  }, {})
  assert.equal(readyAtLimit.status, 'ready')
  const adjustedAtLimit = await tool.execute({
    root,
    action: 'propose_question',
    sessionId: readyAtLimit.sessionId,
    revision: readyAtLimit.revision,
    question: {
      id: 'q-adjust-after-limit',
      dimension: 'scope-proof',
      insight: '用户已经看过完整待办简报并主动要求调整范围，此时只需重新确认首版验证边界，不应重开整套问卷。',
      text: '首版验证是否仍需保留全部任务页？',
      decisionImpact: '决定首轮原型是否保留跨日期查找任务的完整流程。',
      recommendedOptionId: 'keep',
      dependsOn: ['q7-scope-proof'],
      options: [
        { id: 'keep', label: '保留全部任务', description: '核心闭环更完整，但首轮页面和状态会更多。' },
        { id: 'remove', label: '只做今日任务', description: '验证更聚焦，但无法覆盖跨日期管理场景。' },
      ],
    },
  }, {})
  assert.equal(adjustedAtLimit.status, 'question')
  assert.equal(adjustedAtLimit.discovery.questionCount, 10)
  assert.deepEqual(adjustedAtLimit.discovery.adjustmentQuestionIds, ['q-adjust-after-limit'])
})

test('draw2code_create revising one decision invalidates only questions that depend on it', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  let state = await tool.execute({ root, action: 'start', idea: '陌生人雷达社交 App', projectName: '雷达社交' }, {})
  const questions = [
    {
      id: 'q1-connection', dimension: 'unique-mechanism', dependsOn: [],
      insight: '陌生人社交的第一道产品决策，是用什么现实理由让双方愿意安全地建立联系。',
      text: '双方第一次建立联系，首版采用哪种门槛？',
      decisionImpact: '决定关系建立流程、信任强度和雷达首页的主要操作。',
      recommendedOptionId: 'bump',
      options: [
        { id: 'bump', label: '线下碰一碰', description: '信任更强且有产品辨识度，但要求双方真实见面。' },
        { id: 'mutual', label: '双向表达兴趣', description: '连接效率更高，但产品会更接近常见交友应用。' },
      ],
    },
    {
      id: 'q2-privacy', dimension: 'critical-risk', dependsOn: ['q1-connection'],
      insight: '如果线下碰一碰才能建立关系，隐私控制应该围绕见面前后的可见范围设计。',
      text: '碰一碰之前，陌生人可以看到多少个人信息？',
      decisionImpact: '决定雷达点位、个人资料页和碰一碰确认页展示的信息。',
      recommendedOptionId: 'limited',
      options: [
        { id: 'limited', label: '只显示少量线索', description: '优先保护隐私，同时保留判断是否见面的基本依据。' },
        { id: 'profile', label: '显示完整资料', description: '方便快速判断，但会增加被识别和骚扰的风险。' },
      ],
    },
  ]
  for (const question of questions) {
    state = await tool.execute({ root, action: 'propose_question', sessionId: state.sessionId, revision: state.revision, question }, {})
    state = await tool.execute({ root, action: 'answer', sessionId: state.sessionId, revision: state.revision, questionId: question.id, values: [question.recommendedOptionId] }, {})
  }
  assert.equal(state.discovery.questionCount, 2)

  const revised = await tool.execute({
    root,
    action: 'revise',
    sessionId: state.sessionId,
    revision: state.revision,
    questionId: 'q1-connection',
    values: ['mutual'],
  }, {})
  assert.equal(revised.status, 'discovery')
  assert.equal(revised.discovery.questionCount, 2)
  assert.deepEqual(revised.discovery.questions.map((question) => question.id), ['q1-connection', 'q2-privacy'])
  assert.deepEqual(revised.discovery.invalidatedQuestionIds, ['q2-privacy'])
  assert.ok(revised.discovery.resolvedDecisions.some((item) => /双向表达兴趣/.test(item)))
  assert.ok(!revised.discovery.resolvedDecisions.some((item) => /q2-privacy/.test(item)))

  const bypass = await tool.execute({
    root,
    action: 'answer',
    sessionId: revised.sessionId,
    revision: revised.revision,
    questionId: 'q1-connection',
    values: ['bump'],
  }, {})
  assert.equal(bypass.status, 'error')
  assert.equal(bypass.error.code, 'historical_answer_requires_revise')
})

test('draw2code_create can skip a pending question or synthesize immediately without getting stuck', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '个人待办清单 App', projectName: '个人待办' }, {})
  const question = {
    id: 'q1-trigger', dimension: 'trigger-context', dependsOn: [],
    insight: '普通待办产品的替代品很多，首版必须先找到用户仍然无法决定先做什么的具体时刻。',
    text: '用户最需要产品介入的是哪个任务决策时刻？',
    decisionImpact: '决定首页组织方式采用四象限、时间线还是聚焦单一任务。',
    recommendedOptionId: 'morning',
    options: [
      { id: 'morning', label: '每天开始工作时', description: '触发稳定，适合用优先级组织当天任务。' },
      { id: 'change', label: '计划突然变化时', description: '决策压力更强，但需要突出重新排序能力。' },
    ],
  }
  const proposed = await tool.execute({ root, action: 'propose_question', sessionId: started.sessionId, revision: started.revision, question }, {})

  const skipped = await tool.execute({
    root, action: 'skip', sessionId: proposed.sessionId, revision: proposed.revision, questionId: question.id,
  }, {})
  assert.equal(skipped.status, 'discovery')
  assert.equal(skipped.question, undefined)
  assert.ok(skipped.discovery.assumptions.some((item) => /跳过|待验证/.test(item)))
  assert.ok(skipped.discovery.openDimensions.includes('trigger-context'))

  const another = await tool.execute({
    root, action: 'propose_question', sessionId: skipped.sessionId, revision: skipped.revision,
    question: { ...question, id: 'q2-risk', dimension: 'critical-risk', text: '如果优先级推荐错误，首版最应该避免哪一种用户损失？' },
  }, {})
  const ready = await tool.execute({
    root, action: 'synthesize', sessionId: another.sessionId, revision: another.revision,
    stopReason: '用户选择直接整理项目简报。', brief: quadrantPrototypeBrief(),
  }, {})
  assert.equal(ready.status, 'ready')
  assert.equal(ready.question, undefined)
  assert.ok(ready.discovery.assumptions.some((item) => /直接整理.*未回答/.test(item)))
  assert.ok(ready.brief.pendingDecisions.some((item) => /当前问题未回答/.test(item)))
  assert.match(ready.briefMarkdown, /尚待决定：[\s\S]*当前问题未回答/)
})

test('draw2code_create turns the native direct-brief choice into an explicit synthesize handoff', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '万年历穿搭 App', projectName: '衣历穿搭' }, {})
  const proposed = await tool.execute({
    root, action: 'propose_question', sessionId: started.sessionId, revision: started.revision,
    question: {
      id: 'q1-signal', dimension: 'unique-mechanism', dependsOn: [],
      insight: '万年历穿搭的独特价值取决于推荐是只看天气，还是结合用户真实衣橱减少选择困难。',
      text: '首版穿搭推荐主要依据哪类信号？',
      decisionImpact: '决定推荐页解释方式、衣橱录入成本和首版页面范围。',
      recommendedOptionId: 'weather-wardrobe',
      options: [
        { id: 'weather-wardrobe', label: '天气与真实衣橱', description: '推荐更可信，但需要降低衣物录入成本。' },
        { id: 'weather-only', label: '只依据天气', description: '首版更轻，但推荐容易变成通用穿搭内容。' },
      ],
    },
  }, {})
  const handoff = await tool.execute({
    root, action: 'answer', sessionId: proposed.sessionId, revision: proposed.revision,
    questionId: proposed.question.id, values: ['synthesize-now'],
  }, {})
  assert.equal(handoff.status, 'discovery')
  assert.equal(handoff.question, undefined)
  assert.equal(handoff.discovery.nextAction, 'synthesize')
  assert.match(handoff.discovery.stopReason, /用户.*直接整理/)
  const rendered = tool.output.render({ root, action: 'answer' }, handoff)
  assert.match(rendered[0].text, /必须立即调用 action=synthesize/)
  assert.doesNotMatch(rendered[0].text, /信息不足时调用 action=propose_question/)
})

test('draw2code_create reopens a ready brief for one affected adjustment and regenerates the full brief', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '个人四象限待办清单 App', projectName: '四象限待办' }, {})
  const ready = await tool.execute({
    root, action: 'synthesize', sessionId: started.sessionId, revision: started.revision,
    stopReason: '首版信息已经足够。', brief: quadrantPrototypeBrief(),
  }, {})
  const adjusted = await tool.execute({
    root, action: 'propose_question', sessionId: ready.sessionId, revision: ready.revision,
    question: {
      id: 'q-adjust-scope', dimension: 'scope-proof', dependsOn: [],
      insight: '用户选择调整首版范围，当前最需要确认的是“全部任务”是否属于验证四象限价值的必要闭环。',
      text: '首版是否保留“全部任务”页？',
      decisionImpact: '决定首轮页面数量、跨日期流程和后续完整简报的页面关系。',
      recommendedOptionId: 'keep',
      options: [
        { id: 'keep', label: '保留全部任务', description: '闭环更完整，但首版需要多维护一个列表页面。' },
        { id: 'remove', label: '只做今日与编辑', description: '验证更聚焦，但无法查看今天以外的任务。' },
      ],
    },
  }, {})
  assert.equal(adjusted.status, 'question')
  assert.equal(adjusted.brief, undefined)
  assert.equal(adjusted.briefMarkdown, undefined)
})

test('draw2code_create rejects a polished but ungrounded question from another product', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '万年历穿搭 App', projectName: '衣历穿搭' }, {})
  const result = await tool.execute({
    root, action: 'propose_question', sessionId: started.sessionId, revision: started.revision,
    question: {
      id: 'q-unrelated', dimension: 'critical-risk', dependsOn: [],
      insight: '陌生人建立关系之前最难的是兼顾附近发现效率和首次联系时的隐私安全感。',
      text: '双方第一次建立联系需要经过什么信任门槛？',
      decisionImpact: '决定雷达首页、附近用户资料和聊天解锁流程。',
      recommendedOptionId: 'bump',
      options: [
        { id: 'bump', label: '线下碰一碰', description: '信任较强，但要求双方真实见面。' },
        { id: 'mutual', label: '双向表达兴趣', description: '连接更容易，但会接近普通交友产品。' },
      ],
    },
  }, {})
  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'question_not_grounded')
})

test('draw2code_create brief gate rejects duplicate names, missing relations, and visual or technical implementation details', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '个人四象限待办清单 App', projectName: '四象限待办' }, {})

  const duplicateNames = quadrantPrototypeBrief()
  duplicateNames.pages[1].name = duplicateNames.pages[0].name
  let result = await tool.execute({
    root, action: 'synthesize', sessionId: started.sessionId, revision: started.revision,
    stopReason: '测试简报门禁。', brief: duplicateNames,
  }, {})
  assert.equal(result.error.code, 'brief_quality_invalid')
  assert.match(result.error.message, /页面名称.*重复/)

  const missingRelations = quadrantPrototypeBrief()
  missingRelations.pageRelations = []
  result = await tool.execute({
    root, action: 'synthesize', sessionId: started.sessionId, revision: started.revision,
    stopReason: '测试简报门禁。', brief: missingRelations,
  }, {})
  assert.equal(result.error.code, 'brief_quality_invalid')
  assert.match(result.error.message, /多页面.*关系/)

  const implementationDetails = quadrantPrototypeBrief()
  implementationDetails.prototypePrinciples.push('使用 React 和 Tailwind 实现，并规定 16px 圆角与品牌字体。')
  result = await tool.execute({
    root, action: 'synthesize', sessionId: started.sessionId, revision: started.revision,
    stopReason: '测试简报门禁。', brief: implementationDetails,
  }, {})
  assert.equal(result.error.code, 'brief_quality_invalid')
  assert.match(result.error.message, /视觉|技术实现|Generate/)

  const contradictoryAssumption = quadrantPrototypeBrief()
  contradictoryAssumption.assumptions.push('首版包含团队协作，允许把任务分派给同事。')
  result = await tool.execute({
    root, action: 'synthesize', sessionId: started.sessionId, revision: started.revision,
    stopReason: '测试简报门禁。', brief: contradictoryAssumption,
  }, {})
  assert.equal(result.error.code, 'brief_quality_invalid')
  assert.match(result.error.message, /默认假设.*明确排除.*矛盾/)
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

  assert.equal(result.status, 'discovery')
  assert.equal(result.nameProposal.suggestedName, '衣历穿搭')
  assert.equal(result.projectName, '衣历穿搭')
})

test('draw2code_create persists one proposed question and is idempotent', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '万年历穿搭工具', projectName: '万年历穿搭' }, {})

  const proposeArgs = {
    root,
    action: 'propose_question',
    sessionId: started.sessionId,
    revision: started.revision,
    question: {
      id: 'q1-recommendation-input', dimension: 'unique-mechanism', dependsOn: [],
      insight: '穿搭产品的差异不在天气展示，而在推荐是否真正使用用户拥有的衣物。',
      text: '首版穿搭推荐主要依据什么信息？',
      decisionImpact: '决定推荐流程、衣橱录入成本和首轮原型页面。',
      recommendedOptionId: 'wardrobe-weather',
      options: [
        { id: 'wardrobe-weather', label: '衣橱与天气', description: '推荐更可信，但需要先解决衣物录入成本。' },
        { id: 'weather-only', label: '仅使用天气', description: '启动更轻，但推荐容易变成泛化穿搭文章。' },
      ],
    },
  }
  const proposed = await tool.execute(proposeArgs, {})
  assert.equal(proposed.status, 'question')
  assert.equal(proposed.question.id, 'q1-recommendation-input')
  assert.equal(proposed.revision, started.revision + 1)

  const duplicate = await tool.execute(proposeArgs, {})
  assert.equal(duplicate.idempotent, true)
  const { idempotent: _idempotent, ...duplicateWithoutMarker } = duplicate
  assert.deepEqual(duplicateWithoutMarker, proposed)

  const stringDuplicate = await tool.execute({ ...proposeArgs, question: JSON.stringify(proposeArgs.question) }, {})
  assert.equal(stringDuplicate.idempotent, true)
  const { idempotent: _stringIdempotent, ...stringDuplicateWithoutMarker } = stringDuplicate
  assert.deepEqual(stringDuplicateWithoutMarker, proposed)
})

test('draw2code_create stores free text directly and uses the final brief as the single confirmation', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const started = await tool.execute({ root, action: 'start', idea: '一个生活工具', projectName: '生活助手' }, {})

  const proposed = await tool.execute({
    root,
    action: 'propose_question',
    sessionId: started.sessionId,
    revision: started.revision,
    question: {
      id: 'q1-context', dimension: 'trigger-context', dependsOn: [],
      insight: '生活工具只有绑定一个高频且具体的触发时刻，才不会变成用户想不起来打开的功能集合。',
      text: '用户最需要这个生活助手的具体时刻是什么？',
      decisionImpact: '决定首页首屏内容、主要操作和首版需要舍弃的功能。',
      recommendedOptionId: 'morning',
      options: [
        { id: 'morning', label: '早晨安排一天', description: '使用频率稳定，适合聚焦今日信息和快速行动。' },
        { id: 'before-going-out', label: '出门前做决定', description: '场景更紧迫，但产品能力需要围绕即时信息收缩。' },
      ],
    },
  }, {})
  const answered = await tool.execute({
    root, action: 'answer', sessionId: proposed.sessionId, revision: proposed.revision,
    questionId: proposed.question.id, values: ['other'], otherText: '每天下班后规划第二天',
  }, {})
  assert.equal(answered.status, 'discovery')
  assert.ok(answered.discovery.resolvedDecisions.some((item) => /每天下班后规划第二天/.test(item)))
  assert.equal(answered.question, undefined)
})

test('draw2code_create keeps radar discovery product-specific instead of returning a fixed module and page sequence', async () => {
  const { root, store, projects } = await makeStore()
  const tool = draw2codeCreateTool(projects, store)
  const state = await tool.execute({
    root,
    action: 'start',
    idea: '我想做一个类似龙珠雷达的陌生人社交APP。',
    projectName: '龙珠雷达社交',
  }, {})

  assert.equal(state.nameProposal.suggestedName, '龙珠雷达社交')
  assert.equal(state.status, 'discovery')
  assert.ok(state.discovery.explicitFacts.some((fact) => /App/.test(fact)))
  assert.ok(state.discovery.explicitFacts.some((fact) => /陌生人社交/.test(fact)))
  assert.equal(state.question, undefined)
  assert.ok(!state.discovery.questions.some((question) => /核心模块|核心页面/.test(question.text)))
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
  assert.equal(resumed.status, 'discovery')
  assert.equal(resumed.question, undefined)
  assert.equal(resumed.discovery.nextAction, 'propose_question')

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

  let state = await create.execute({ root, action: 'start', idea: '个人四象限待办清单 App', projectName: '四象限待办' }, {})
  state = await create.execute({
    root,
    action: 'synthesize',
    sessionId: state.sessionId,
    revision: state.revision,
    stopReason: '核心场景、四象限机制、首版流程和范围已经明确。',
    brief: quadrantPrototypeBrief(),
  }, {})

  assert.equal(state.status, 'ready')
  assert.equal(state.brief.pages.length, 3)
  assert.equal(state.brief.deferredStyleNote, null)
  assert.equal(state.brief.briefSchemaVersion, 2)
  assert.equal(state.brief.pageBlueprints[0].pageId, 'today')

  const confirmed = await create.execute({
    root,
    action: 'confirm',
    sessionId: state.sessionId,
    revision: state.revision,
  }, {})

  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.nextAction, 'draw2code_update')
  assert.equal(confirmed.boardName, '四象限待办')
  assert.equal(confirmed.activeBoard, confirmed.boardName)

  const mutateConfirmed = await create.execute({
    root,
    action: 'synthesize',
    sessionId: confirmed.sessionId,
    revision: confirmed.revision,
    stopReason: '不应允许修改终态项目。',
    brief: quadrantPrototypeBrief(),
  }, {})
  assert.equal(mutateConfirmed.status, 'error')
  assert.equal(mutateConfirmed.error.code, 'project_not_editable')

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
