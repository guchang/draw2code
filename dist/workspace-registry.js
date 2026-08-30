// src/workspace-registry.ts
import { chmod, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
function defaultWorkspaceRegistryPath() {
  return process.env.DRAW2CODE_WORKSPACE_REGISTRY_PATH ?? join(homedir(), ".draw2code", "workspaces.json");
}
function isWorkspacePickerCandidate(path) {
  return !/\/\.codex\/plugins\/cache(?:\/|$)/.test(path.replaceAll("\\", "/"));
}
var WorkspaceRegistry = class {
  constructor(path = defaultWorkspaceRegistryPath()) {
    this.path = path;
  }
  writeQueue = Promise.resolve();
  async read() {
    let value;
    try {
      value = JSON.parse(await readFile(this.path, "utf8"));
    } catch {
      return [];
    }
    if (typeof value !== "object" || value === null || !Array.isArray(value.workspaces)) return [];
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    for (const candidate of value.workspaces ?? []) {
      if (typeof candidate?.path !== "string") continue;
      let canonical;
      try {
        canonical = await realpath(candidate.path);
      } catch {
        continue;
      }
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      rows.push({
        path: canonical,
        registeredAt: Number.isFinite(candidate.registeredAt) ? candidate.registeredAt : Date.now(),
        lastUsedAt: Number.isFinite(candidate.lastUsedAt) ? candidate.lastUsedAt : Date.now()
      });
    }
    return rows;
  }
  async list() {
    return await this.read();
  }
  async register(path) {
    const canonical = await realpath(path);
    const task = this.writeQueue.then(async () => {
      const now = Date.now();
      const rows = await this.read();
      const existing = rows.find((row) => row.path === canonical);
      if (existing === void 0) rows.push({ path: canonical, registeredAt: now, lastUsedAt: now });
      else existing.lastUsedAt = now;
      rows.sort((left, right) => right.lastUsedAt - left.lastUsedAt);
      await mkdir(dirname(this.path), { recursive: true, mode: 448 });
      const temporary = `${this.path}.tmp-${process.pid}-${now}`;
      await writeFile(temporary, `${JSON.stringify({ version: 1, workspaces: rows }, null, 2)}
`, { encoding: "utf8", mode: 384 });
      await rename(temporary, this.path);
      await chmod(this.path, 384);
    });
    this.writeQueue = task.catch(() => void 0);
    await task;
    return canonical;
  }
};
export {
  WorkspaceRegistry,
  defaultWorkspaceRegistryPath,
  isWorkspacePickerCandidate
};
