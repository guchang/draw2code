// src/daemon-client.ts
import { execFile, spawn } from "node:child_process";
import { open, mkdir as mkdir2, readFile as readFile2, rm, stat as stat2 } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// src/runtime.ts
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";

// src/scene-store.ts
var SCENE_DIR = "draw2code";
var MAX_SCENE_BYTES = 512 * 1024;
var MAX_ELEMENT_BYTES = 16 * 1024;
var CLIENT_ARCHIVE_INTERVAL_MS = 10 * 6e4;

// src/project-store.ts
var PROJECTS_DIR = `${SCENE_DIR}/.projects`;

// src/create-tool.ts
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/create-discovery.ts
var DISCOVERY_DIMENSION_IDS = [
  "trigger-context",
  "existing-alternative",
  "core-outcome",
  "unique-mechanism",
  "core-loop",
  "critical-risk",
  "scope-proof",
  "target-user",
  "target-platform",
  "product-architecture"
];
var DISCOVERY_DIMENSIONS = new Set(DISCOVERY_DIMENSION_IDS);

// src/tools.ts
import { defineTool as defineTool2 } from "@deepseek-ai/dsh-tools";

// src/layout.ts
var PRIMARY_ACTION_ROLES = /* @__PURE__ */ new Set(["primary-action", "primary-button"]);
var INTERACTIVE_ROLES = /* @__PURE__ */ new Set([
  ...PRIMARY_ACTION_ROLES,
  "button",
  "secondary-action",
  "secondary-button",
  "danger-button",
  "destructive-button",
  "chip",
  "filter-chip",
  "choice-chip",
  "tab",
  "tab-item",
  "bottom-navigation-item",
  "bottom-nav-item"
]);

// src/tools.ts
var MAX_ELEMENTS_JSON = 120 * 1024;

// src/runtime.ts
async function validateDaemonDescriptor(path) {
  try {
    const info = await stat(path);
    if ((info.mode & 63) !== 0) return null;
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!Number.isInteger(value.pid) || !Number.isInteger(value.port) || Number(value.port) <= 0 || Number(value.port) > 65535) return null;
    if (typeof value.nonce !== "string" || value.nonce.length < 16 || typeof value.token !== "string" || value.token.length < 32) return null;
    if (typeof value.startedAt !== "number") return null;
    return value;
  } catch {
    return null;
  }
}

// src/daemon-client.ts
function daemonRuntimeDir() {
  const uid = typeof process.getuid === "function" ? process.getuid() : "user";
  return join(tmpdir(), `draw2code-${uid}`);
}
function daemonDescriptorPath() {
  return process.env.DRAW2CODE_DESCRIPTOR_PATH ?? join(daemonRuntimeDir(), "daemon.json");
}
async function healthy(descriptor) {
  try {
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/health`, {
      headers: { authorization: `Bearer ${descriptor.token}` },
      signal: AbortSignal.timeout(800)
    });
    const body = await response.json();
    return response.ok && body.ok === true && body.nonce === descriptor.nonce;
  } catch {
    return false;
  }
}
async function waitForDescriptor(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const descriptor = await validateDaemonDescriptor(path);
    if (descriptor !== null && await healthy(descriptor)) return descriptor;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("draw2code daemon did not become healthy");
}
async function staleStartupLock(path) {
  try {
    const info = await stat2(path);
    let owner = {};
    try {
      owner = JSON.parse(await readFile2(path, "utf8"));
    } catch {
      return Date.now() - info.mtimeMs > 8e3;
    }
    if (Number.isInteger(owner.pid) && Number(owner.pid) > 0) {
      try {
        process.kill(Number(owner.pid), 0);
        return false;
      } catch (error) {
        if (error.code === "ESRCH") return true;
        return false;
      }
    }
    return Date.now() - info.mtimeMs > 8e3;
  } catch {
    return false;
  }
}
var Draw2CodeDaemonClient = class {
  constructor(daemonEntry, canvasHtmlPath, descriptorPath = daemonDescriptorPath()) {
    this.daemonEntry = daemonEntry;
    this.canvasHtmlPath = canvasHtmlPath;
    this.descriptorPath = descriptorPath;
  }
  async ensure() {
    const current = await validateDaemonDescriptor(this.descriptorPath);
    if (current !== null && await healthy(current)) return current;
    await mkdir2(dirname(this.descriptorPath), { recursive: true, mode: 448 });
    await rm(this.descriptorPath, { force: true });
    const lockPath = `${this.descriptorPath}.lock`;
    while (true) {
      let lock = null;
      try {
        lock = await open(lockPath, "wx", 384);
        await lock.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: Date.now() })}
`);
        const child = spawn(process.execPath, [this.daemonEntry], {
          detached: true,
          stdio: "ignore",
          env: {
            ...process.env,
            DRAW2CODE_DESCRIPTOR_PATH: this.descriptorPath,
            DRAW2CODE_CANVAS_HTML: this.canvasHtmlPath
          }
        });
        child.unref();
        return await waitForDescriptor(this.descriptorPath, 8e3);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (await staleStartupLock(lockPath)) {
          await rm(lockPath, { force: true });
          continue;
        }
      } finally {
        await lock?.close();
        if (lock !== null) await rm(lockPath, { force: true });
      }
      return waitForDescriptor(this.descriptorPath, 8e3);
    }
  }
  async execute(command, context) {
    const descriptor = await this.ensure();
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/rpc`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ command, context })
    });
    return await response.json();
  }
  async registerWorkspace(root, context) {
    const descriptor = await this.ensure();
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/register`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ root, context })
    });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error?.message ?? "failed to register workspace");
    }
  }
  async proxy(path, init) {
    const descriptor = await this.ensure();
    const response = await fetch(`http://127.0.0.1:${descriptor.port}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        ...init.body === void 0 ? {} : { "content-type": "application/json" }
      },
      body: init.body
    });
    return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
  }
  async canvas(root, board, context) {
    const descriptor = await this.ensure();
    const response = await fetch(`http://127.0.0.1:${descriptor.port}/canvas-token`, {
      method: "POST",
      headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
      body: JSON.stringify({ root, board, context })
    });
    const body = await response.json();
    if (!response.ok || body.ok !== true || body.url === void 0 || body.token === void 0 || body.expiresAt === void 0) {
      throw new Error(body.error?.message ?? "failed to create canvas URL");
    }
    return { url: body.url, token: body.token, expiresAt: body.expiresAt };
  }
  async openBrowser(url) {
    const launcher = process.platform === "darwin" ? { command: "/usr/bin/open", args: [url] } : process.platform === "linux" ? { command: "xdg-open", args: [url] } : process.platform === "win32" ? { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] } : null;
    if (launcher === null) return false;
    return await new Promise((resolve) => {
      execFile(launcher.command, launcher.args, (error) => resolve(error === null));
    });
  }
};
export {
  Draw2CodeDaemonClient,
  daemonDescriptorPath,
  daemonRuntimeDir
};
