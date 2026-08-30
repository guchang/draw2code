import { chmod, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

interface RegistryFile {
  version: 1
  workspaces: WorkspaceRecord[]
}

export interface WorkspaceRecord {
  path: string
  registeredAt: number
  lastUsedAt: number
}

export function defaultWorkspaceRegistryPath(): string {
  return process.env.DRAW2CODE_WORKSPACE_REGISTRY_PATH ?? join(homedir(), '.draw2code', 'workspaces.json')
}

export function isWorkspacePickerCandidate(path: string): boolean {
  return !/\/\.codex\/plugins\/cache(?:\/|$)/.test(path.replaceAll('\\', '/'))
}

export class WorkspaceRegistry {
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly path = defaultWorkspaceRegistryPath()) {}

  private async read(): Promise<WorkspaceRecord[]> {
    let value: unknown
    try {
      value = JSON.parse(await readFile(this.path, 'utf8'))
    } catch {
      return []
    }
    if (typeof value !== 'object' || value === null || !Array.isArray((value as Partial<RegistryFile>).workspaces)) return []
    const rows: WorkspaceRecord[] = []
    const seen = new Set<string>()
    for (const candidate of (value as Partial<RegistryFile>).workspaces ?? []) {
      if (typeof candidate?.path !== 'string') continue
      let canonical: string
      try { canonical = await realpath(candidate.path) } catch { continue }
      if (seen.has(canonical)) continue
      seen.add(canonical)
      rows.push({
        path: canonical,
        registeredAt: Number.isFinite(candidate.registeredAt) ? candidate.registeredAt : Date.now(),
        lastUsedAt: Number.isFinite(candidate.lastUsedAt) ? candidate.lastUsedAt : Date.now(),
      })
    }
    return rows
  }

  async list(): Promise<WorkspaceRecord[]> {
    return await this.read()
  }

  async register(path: string): Promise<string> {
    const canonical = await realpath(path)
    const task = this.writeQueue.then(async () => {
      const now = Date.now()
      const rows = await this.read()
      const existing = rows.find((row) => row.path === canonical)
      if (existing === undefined) rows.push({ path: canonical, registeredAt: now, lastUsedAt: now })
      else existing.lastUsedAt = now
      rows.sort((left, right) => right.lastUsedAt - left.lastUsedAt)
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
      const temporary = `${this.path}.tmp-${process.pid}-${now}`
      await writeFile(temporary, `${JSON.stringify({ version: 1, workspaces: rows } satisfies RegistryFile, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, this.path)
      await chmod(this.path, 0o600)
    })
    this.writeQueue = task.catch(() => undefined)
    await task
    return canonical
  }
}
