import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('standalone canvas exposes safe history preview and visible session errors', async () => {
  const source = await readFile(new URL('../src/client/CanvasPanel.tsx', import.meta.url), 'utf8')
  assert.match(source, /预览此版本/)
  assert.match(source, /正在预览/)
  assert.match(source, /返回当前版本/)
  assert.match(source, /访问已过期/)
  assert.match(source, />确定<\/button>/)
  assert.doesNotMatch(source, />恢复<\/button>/)
})

test('an explicitly requested board wins over remembered browser state on first load', async () => {
  const source = await readFile(new URL('../src/client/CanvasPanel.tsx', import.meta.url), 'utf8')
  assert.match(source, /const selected = initialBoard \?\? rememberedBoard\(cwd\)/)
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*?setBoardName\(selected\)[\s\S]*?\}, \[cwd, initialBoard\]\)/)
})

test('standalone canvas offers registered workspace switching without widening one token', async () => {
  const canvas = await readFile(new URL('../src/canvas.tsx', import.meta.url), 'utf8')
  const panel = await readFile(new URL('../src/client/CanvasPanel.tsx', import.meta.url), 'utf8')
  const api = await readFile(new URL('../src/client/api.ts', import.meta.url), 'utf8')

  assert.match(canvas, /workspaceSwitching/)
  assert.match(panel, /工作区/)
  assert.match(panel, /切换工作区/)
  assert.match(panel, /listWorkspaces/)
  assert.match(api, /canvas-workspaces/)
  assert.match(api, /canvas-workspace-token/)
})
