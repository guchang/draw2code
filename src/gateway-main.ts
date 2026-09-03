import { resolve } from 'node:path'
import { ensureDaemonProcess } from './daemon-client.ts'
import { DEFAULT_GATEWAY_PORT } from './gateway-contract.ts'
import { startGateway } from './gateway-server.ts'

const descriptorPath = process.env.DRAW2CODE_GATEWAY_DESCRIPTOR_PATH
const workerDescriptorPath = process.env.DRAW2CODE_DESCRIPTOR_PATH
const daemonEntry = process.env.DRAW2CODE_DAEMON_ENTRY
if (descriptorPath === undefined || descriptorPath === '') throw new Error('DRAW2CODE_GATEWAY_DESCRIPTOR_PATH is required')
if (workerDescriptorPath === undefined || workerDescriptorPath === '') throw new Error('DRAW2CODE_DESCRIPTOR_PATH is required')
if (daemonEntry === undefined || daemonEntry === '') throw new Error('DRAW2CODE_DAEMON_ENTRY is required')
const canvasHtmlPath = process.env.DRAW2CODE_CANVAS_HTML ?? resolve(import.meta.dirname, '../lib/canvas.html')
const configuredPort = Number(process.env.DRAW2CODE_GATEWAY_PORT)
const port = Number.isInteger(configuredPort) && configuredPort >= 0 && configuredPort <= 65_535 ? configuredPort : DEFAULT_GATEWAY_PORT
const gateway = await startGateway({
  descriptorPath,
  canvasHtmlPath,
  port,
  ensureWorker: () => ensureDaemonProcess(daemonEntry, canvasHtmlPath, workerDescriptorPath),
})

const shutdown = (): void => { void gateway.close().finally(() => process.exit(0)) }
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
