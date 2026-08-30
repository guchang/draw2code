import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { WorkspaceRegistry } from '../dist/workspace-registry.js'

test('workspace registry persists canonical roots without duplicates', async () => {
  const runtime = await mkdtemp(join(tmpdir(), 'draw2code-workspace-registry-'))
  const first = await mkdtemp(join(tmpdir(), 'draw2code-workspace-'))
  const second = await mkdtemp(join(tmpdir(), 'draw2code-workspace-'))
  const path = join(runtime, 'workspaces.json')

  const registry = new WorkspaceRegistry(path)
  await registry.register(first)
  await registry.register(second)
  await registry.register(first)

  const reloaded = new WorkspaceRegistry(path)
  assert.deepEqual((await reloaded.list()).map((row) => row.path).sort(), [await realpath(first), await realpath(second)].sort())
  assert.equal((await readFile(path, 'utf8')).endsWith('\n'), true)
})
