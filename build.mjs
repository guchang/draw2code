/**
 * Build for dsh-draw2code — two outputs:
 *
 *  - dist/index.js  the host half (cordis plugin: scene store, routes, tools).
 *    Bundled with all package imports external (the profile's hoisted
 *    node_modules resolves them at runtime), local .ts inlined.
 *
 *  - lib/client.js  the browser half, wrapped in the DSH module-loader
 *    envelope `window.__ModuleLoader__.load({ id, factory })` — the same
 *    contract every shipped client plugin uses. react / react-dom stay
 *    external (platform seed words the loader provides); everything else,
 *    including @excalidraw/excalidraw, is bundled in.
 */
import esbuild from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'

const args = new Set(process.argv.slice(2))
const watch = args.has('--watch')

mkdirSync('dist', { recursive: true })
mkdirSync('lib', { recursive: true })

/** Host half: ESM, package imports kept external. */
const hostOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: 'dist/index.js',
  sourcemap: false,
  logLevel: 'info',
  loader: { '.md': 'text' },
}

/** Plugin hook: wrap the client CJS body in the module-loader envelope. */
const envelopePlugin = {
  name: 'd2c-envelope',
  setup(build) {
    build.onEnd((result) => {
      if (result.outputFiles !== undefined && result.outputFiles.length > 0) {
        writeFileSync('lib/client.js', envelope('dsh-draw2code', result.outputFiles[0].text).replace(/[ \t]+$/gm, ''))
        process.stdout.write('[dsh-draw2code] lib/client.js written (module-loader envelope)\n')
      }
    })
  },
}

/** Browser half: CJS body for the module-loader factory, react seeded. */
const clientOptions = {
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  external: [
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.IS_PREACT': 'false',
    global: 'window',
  },
  conditions: ['production'],
  loader: {
    '.css': 'text',
  },
  jsx: 'automatic',
  minify: true,
  sourcemap: false,
  write: false,
  logLevel: 'info',
  plugins: [envelopePlugin],
}

/** Wrap one CJS bundle body in the DSH module-loader envelope. */
function envelope(moduleId, code) {
  return (
    `window.__ModuleLoader__.load({ id: ${JSON.stringify(moduleId)}, factory: (require) => {\n` +
    `var module = { exports: {} };\nvar exports = module.exports;\n` +
    code +
    `\nreturn module.exports;\n} });\n`
  )
}

async function main() {
  // Both halves: the host to dist/, the client through the envelope plugin.
  await esbuild.build(hostOptions)
  await esbuild.build({
    entryPoints: ['src/runtime.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: 'dist/runtime.js',
    sourcemap: false,
    logLevel: 'info',
    loader: { '.md': 'text' },
  })
  await esbuild.build({
    entryPoints: ['src/daemon-main.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: 'dist/draw2code-daemon.js',
    banner: { js: '#!/usr/bin/env node\nimport { createRequire as __d2cCreateRequire } from "node:module"; const require = __d2cCreateRequire(import.meta.url);' },
    sourcemap: false,
    logLevel: 'info',
    loader: { '.md': 'text' },
  })
  await esbuild.build({
    entryPoints: ['src/daemon-client.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    outfile: 'dist/daemon-client.js',
    sourcemap: false,
    logLevel: 'info',
  })
  await esbuild.build({
    entryPoints: ['src/mcp.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: 'dist/draw2code-mcp.js',
    banner: { js: '#!/usr/bin/env node\nimport { createRequire as __d2cCreateRequire } from "node:module"; const require = __d2cCreateRequire(import.meta.url);' },
    sourcemap: false,
    logLevel: 'info',
    loader: { '.md': 'text' },
  })
  const canvas = await esbuild.build({
    entryPoints: ['src/canvas.tsx'],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.IS_PREACT': 'false',
      global: 'window',
    },
    conditions: ['production'],
    loader: { '.css': 'text' },
    jsx: 'automatic',
    minify: true,
    write: false,
    logLevel: 'info',
  })
  const canvasCode = canvas.outputFiles[0].text.replace(/[ \t]+$/gm, '')
  writeFileSync('lib/canvas.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Draw2Code / 画码</title></head><body><div id="draw2code-root"></div><script>${canvasCode}</script></body></html>`)
  await esbuild.build(clientOptions)
}

if (watch) {
  const host = await esbuild.context(hostOptions)
  const client = await esbuild.context(clientOptions)
  await Promise.all([host.watch(), client.watch()])
} else {
  await main()
}
