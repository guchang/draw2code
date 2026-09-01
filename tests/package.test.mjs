import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('package declares every DSH host integration as a peer dependency', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
  const requiredPeers = [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-workspace',
    'dsh-better-sidebar',
    'react',
    'react-dom',
  ]

  for (const name of requiredPeers) {
    assert.equal(typeof pkg.peerDependencies?.[name], 'string', `${name} must be a peer dependency`)
  }
})

test('bundle patch mounts only Draw2Code and leaves the sidebar in its own bundle layer', async () => {
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8')

  assert.match(patch, /id:\s*ui-draw2code/)
  assert.doesNotMatch(patch, /id:\s*better-sidebar/)
})

test('Codex full workflow handles a user-completed drawing', async () => {
  const skill = await readFile(new URL('skills/draw2code/SKILL.md', root), 'utf8')
  assert.match(skill, /我画好了/)
  assert.match(skill, /draw2code_read/)
})

test('Codex exposes a focused fast path for opening Draw2Code', async () => {
  const skill = await readFile(new URL('skills/draw2code-open/SKILL.md', root), 'utf8')
  const metadata = await readFile(new URL('skills/draw2code-open/agents/openai.yaml', root), 'utf8')
  const manifest = JSON.parse(await readFile(new URL('.codex-plugin/plugin.json', root), 'utf8'))

  assert.match(skill, /只调用一次 `draw2code_open`/)
  assert.match(skill, /presentation=handoff/)
  assert.match(skill, /不要.*workflow contract/)
  assert.doesNotMatch(skill, /draw2code_(?:create|read|update|generate)/)
  assert.match(metadata, /allow_implicit_invocation:\s*true/)
  assert.ok(manifest.interface.defaultPrompt.some((prompt) => prompt.includes('$draw2code-open')))
})
