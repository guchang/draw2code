import { resolve } from 'node:path'
import { startDaemon } from './daemon-server.ts'

const descriptorPath = process.env.DRAW2CODE_DESCRIPTOR_PATH
if (descriptorPath === undefined || descriptorPath === '') throw new Error('DRAW2CODE_DESCRIPTOR_PATH is required')
const canvasHtmlPath = process.env.DRAW2CODE_CANVAS_HTML ?? resolve(import.meta.dirname, '../lib/canvas.html')
const configuredTokenTtl = Number(process.env.DRAW2CODE_CANVAS_TOKEN_TTL_MS)
const canvasTokenTtlMs = Number.isFinite(configuredTokenTtl) && configuredTokenTtl > 0 ? configuredTokenTtl : undefined
const daemon = await startDaemon({ descriptorPath, canvasHtmlPath, ...(canvasTokenTtlMs === undefined ? {} : { canvasTokenTtlMs }) })

const shutdown = (): void => { void daemon.close().finally(() => process.exit(0)) }
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
