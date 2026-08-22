/** Minimal host seam required by the persistent stores. */
export interface Draw2CodeStoreContext {
  workspaceRegistry: {
    list(): Array<{ path: string }>
  }
  logger: {
    warn(message: string, ...args: unknown[]): void
  }
}

export function storeContextFor(workspaceRoot: string): Draw2CodeStoreContext {
  return {
    workspaceRegistry: { list: () => [{ path: workspaceRoot }] },
    logger: { warn: (message, ...args) => console.warn(message, ...args) },
  }
}
