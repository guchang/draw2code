/**
 * Browser-half entry for dsh-draw2code — registers the 画码 board as a tab
 * of the dsh-better-sidebar right sidebar (VSCode-like panel). The board
 * component itself is an unmodified Excalidraw canvas synced to
 * `<workspace>/draw2code/prototype.excalidraw.json`.
 *
 * Failure policy: registration problems are logged, never thrown — the web
 * shell fails the whole boot when a plugin apply throws.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the official Cordis context augmentation.
import type {} from 'dsh-better-sidebar'
import type { BetterSidebarService, TabComponentProps, TabDescriptor } from 'dsh-better-sidebar/client/service'
import { CanvasPanel } from './CanvasPanel.tsx'
import { installBoardRevealWatcher } from './auto-open.ts'
import { installSidebarPolish } from './sidebar-polish.ts'

/** Required services: the better-sidebar tab registry. */
export const inject = ['betterSidebar', 'sessions']

/** The tab id (also the SidebarTab.type value). */
const TAB_ID = 'draw2code:board'

function boardFromPath(path: string | undefined): string | null {
  if (path === undefined || !path.endsWith('.excalidraw.json')) return null
  const filename = path.slice(path.lastIndexOf('/') + 1)
  return filename.slice(0, -'.excalidraw.json'.length) || null
}

/** Apply the browser half: one 画码 tab in the right sidebar. */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => installSidebarPolish(),
    'dsh-draw2code: collapsed sidebar polish',
  )

  ctx.effect(() => {
    const sidebar: BetterSidebarService = ctx.betterSidebar
    if (sidebar.getTab(TAB_ID) !== undefined) return () => undefined
    const descriptor: TabDescriptor = {
      id: TAB_ID,
      title: '画码',
      order: 55,
      single: true,
      icon: (size: number) => (
        <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 13.5l.9-3.2 7.1-7.1a1.6 1.6 0 0 1 2.3 2.3l-7.1 7.1-3.2.9z" />
          <path d="M9.5 4.5l2 2" />
        </svg>
      ),
      component: (props: TabComponentProps) => (
        <CanvasPanel
          cwd={props.scope.cwd ?? ''}
          visible={props.visible}
          initialBoard={boardFromPath(props.tab.path)}
          viewId={props.scope.sessionId}
        />
      ),
    }
    return sidebar.registerTab(descriptor)
  }, 'dsh-draw2code: better-sidebar tab')

  ctx.effect(
    () => installBoardRevealWatcher(ctx, ctx.betterSidebar),
    'dsh-draw2code: reveal verified updates',
  )
}
