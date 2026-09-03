import React from 'react'
import { createRoot } from 'react-dom/client'
import { CanvasPanel } from './client/CanvasPanel.tsx'
import { D2cApi } from './client/api.ts'

interface GatewayBootstrapWindow extends Window {
  __DRAW2CODE_BOOTSTRAP__?: { root?: string; board?: string | null; viewId?: string; csrfToken?: string }
}

const params = new URLSearchParams(window.location.search)
const bootstrap = (window as GatewayBootstrapWindow).__DRAW2CODE_BOOTSTRAP__
const workspaceRoot = bootstrap?.root ?? params.get('root') ?? ''
const token = params.get('token') ?? undefined
const board = bootstrap?.board ?? params.get('board')
const viewId = bootstrap?.viewId ?? params.get('view') ?? 'standalone'

document.documentElement.style.height = '100%'
document.body.style.cssText = 'height:100%;margin:0;overflow:hidden;background:#f6f6f8'
const mount = document.getElementById('draw2code-root')
if (mount === null) throw new Error('missing #draw2code-root')
mount.style.cssText = 'position:fixed;inset:0'

createRoot(mount).render(
  <CanvasPanel
    cwd={workspaceRoot}
    visible
    initialBoard={board}
    viewId={viewId}
    api={new D2cApi({ baseUrl: window.location.origin, token, csrfToken: bootstrap?.csrfToken })}
    workspaceSwitching
  />,
)
