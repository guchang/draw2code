const STYLE_ID = 'dsh-draw2code-sidebar-polish'

/**
 * Keep the collapsed application rail visually consistent across the built-in
 * sidebar controls and the small plugin entries. This is intentionally scoped
 * to the collapsed rail so the expanded sidebar keeps its native layout.
 */
const STYLE = `
[data-dsh-frame][data-sidebar-collapsed] .hHd-Xa_iconButton,
[data-dsh-frame][data-sidebar-collapsed] .hHd-Xa_newSession,
[data-dsh-frame][data-sidebar-collapsed] .qDHVXG_searchButton,
[data-dsh-frame][data-sidebar-collapsed] .qDHVXG_iconButton,
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-cockpit-entry],
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-taskboard-entry],
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-ssh-entry] {
  box-sizing: border-box !important;
  width: 36px !important;
  min-width: 36px !important;
  height: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  margin: 0 0 8px !important;
  padding: 0 !important;
  border-radius: 10px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0 !important;
  line-height: 1 !important;
  transition: background-color .14s ease, color .14s ease, transform .12s ease !important;
}

[data-dsh-frame][data-sidebar-collapsed] .hHd-Xa_iconButton:hover,
[data-dsh-frame][data-sidebar-collapsed] .hHd-Xa_newSession:hover,
[data-dsh-frame][data-sidebar-collapsed] .qDHVXG_searchButton:hover,
[data-dsh-frame][data-sidebar-collapsed] .qDHVXG_iconButton:hover,
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-cockpit-entry]:hover,
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-taskboard-entry]:hover,
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-ssh-entry]:hover {
  background: var(--dsw-alias-interactive-bg-hover) !important;
  color: var(--dsw-alias-label-primary) !important;
}

[data-dsh-frame][data-sidebar-collapsed] .hHd-Xa_iconButton:active,
[data-dsh-frame][data-sidebar-collapsed] .hHd-Xa_newSession:active,
[data-dsh-frame][data-sidebar-collapsed] .qDHVXG_searchButton:active,
[data-dsh-frame][data-sidebar-collapsed] .qDHVXG_iconButton:active,
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-cockpit-entry]:active,
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-taskboard-entry]:active,
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-ssh-entry]:active {
  transform: translateY(1px) !important;
}

[data-dsh-frame][data-sidebar-collapsed] [data-dsh-cockpit-entry][data-active],
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-taskboard-entry][data-active],
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-ssh-entry][data-active] {
  background: var(--dsw-alias-interactive-bg-active) !important;
  color: var(--dsw-alias-label-primary) !important;
}

[data-dsh-frame][data-sidebar-collapsed] .hHd-Xa_iconButton svg,
[data-dsh-frame][data-sidebar-collapsed] .hHd-Xa_newSession svg,
[data-dsh-frame][data-sidebar-collapsed] .qDHVXG_searchButton svg,
[data-dsh-frame][data-sidebar-collapsed] .qDHVXG_iconButton svg,
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-cockpit-entry] svg,
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-taskboard-entry] svg,
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-ssh-entry] svg {
  width: 16px !important;
  height: 16px !important;
  flex: 0 0 16px !important;
  stroke-width: 1.5 !important;
}
`

export function installSidebarPolish(): () => void {
  document.getElementById(STYLE_ID)?.remove()

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLE
  document.head.appendChild(style)

  return () => style.remove()
}
