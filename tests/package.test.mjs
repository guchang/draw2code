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
