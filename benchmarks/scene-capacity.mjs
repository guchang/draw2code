import { performance } from 'node:perf_hooks'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SceneStore,
  draw2codeReadTool,
  inspectPrototypeLayout,
  measureSceneCapacity,
} from '../dist/index.js'

function percentile(values, percentileValue) {
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * percentileValue) - 1)]
}

async function samples(count, fn) {
  const values = []
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now()
    await fn(index)
    values.push(performance.now() - startedAt)
  }
  return {
    p50: Math.round(percentile(values, 0.5) * 10) / 10,
    p95: Math.round(percentile(values, 0.95) * 10) / 10,
  }
}

function representativeScene(count) {
  return {
    elements: Array.from({ length: count }, (_, index) => ({
      id: `benchmark-card-${index}`,
      type: 'rectangle',
      x: (index % 40) * 340,
      y: Math.floor(index / 40) * 52,
      width: 320,
      height: 44,
      customData: {
        role: 'task-card',
        mockData: `任务 ${index} · ${'真实待办内容与状态'.repeat(8)}`,
      },
    })),
  }
}

const root = await mkdtemp(join(tmpdir(), 'draw2code-capacity-benchmark-'))
const canonicalRoot = await realpath(root)
const store = new SceneStore({
  workspaceRegistry: { list: () => [{ path: canonicalRoot }] },
  logger: { warn() {} },
})

try {
  const rows = []
  for (const count of [500, 2_000, 5_000, 10_000]) {
    const scene = representativeScene(count)
    const heapBefore = process.memoryUsage().heapUsed
    const capacityTiming = await samples(5, () => measureSceneCapacity(scene))
    const capacity = measureSceneCapacity(scene)
    const layoutTiming = await samples(5, () => inspectPrototypeLayout(scene.elements))
    const board = `benchmark-${count}`
    const initialWrite = await store.write(root, board, scene, 0, 'agent')
    if (!initialWrite.ok) throw new Error(`${initialWrite.error.code}: ${initialWrite.error.message}`)
    const loadTiming = await samples(5, async () => {
      const loaded = await store.read(root, board)
      if (!loaded.ok) throw new Error(`${loaded.error.code}: ${loaded.error.message}`)
    })
    const readTool = draw2codeReadTool(store)
    let responseBytes = 0
    const boundedReadTiming = await samples(3, async () => {
      const result = await readTool.execute({ root, name: board }, {})
      responseBytes = Buffer.byteLength(JSON.stringify(result), 'utf8')
    })
    let revision = initialWrite.value.rev
    const smallUpdateTiming = await samples(5, async (index) => {
      const result = await store.applyOps(root, board, [
        { op: 'upsert', element: { ...scene.elements[index], opacity: 95 - index } },
        { op: 'upsert', element: { ...scene.elements[index + 1], opacity: 90 - index } },
      ], revision)
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      revision = result.value.rev
    })
    rows.push({
      elements: count,
      canonicalMiB: Math.round(capacity.canonicalBytes / 1024 / 102.4) / 10,
      persistedMiB: Math.round(capacity.persistedBytes / 1024 / 102.4) / 10,
      status: capacity.status,
      capacityP95Ms: capacityTiming.p95,
      layoutP95Ms: layoutTiming.p95,
      loadP95Ms: loadTiming.p95,
      smallUpdateP50Ms: smallUpdateTiming.p50,
      smallUpdateP95Ms: smallUpdateTiming.p95,
      boundedReadP95Ms: boundedReadTiming.p95,
      mcpResponseKiB: Math.round(responseBytes / 102.4) / 10,
      heapDeltaMiB: Math.round((process.memoryUsage().heapUsed - heapBefore) / 1024 / 102.4) / 10,
    })
  }

  console.table(rows)
  const largest = rows.at(-1)
  if (largest.status === 'hard-cap-exceeded') throw new Error('representative 10,000-element scene exceeds the anomaly fuse')
  if (largest.mcpResponseKiB > 128) throw new Error(`default MCP read is not bounded: ${largest.mcpResponseKiB} KiB`)
  if (largest.smallUpdateP95Ms > 5_000) throw new Error(`two-element persistence update p95 is too slow: ${largest.smallUpdateP95Ms}ms`)
} finally {
  await rm(root, { recursive: true, force: true })
}
