// src/daemon-client.ts
import { execFile, spawn } from "node:child_process";
import { open, mkdir as mkdir2, readFile as readFile2, rm, stat as stat2 } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// src/gateway-contract.ts
var DEFAULT_GATEWAY_PORT = 64775;
var GATEWAY_SESSION_TTL_MS = 30 * 24 * 60 * 6e4;

// src/runtime.ts
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";

// src/scene-store.ts
var SCENE_DIR = "draw2code";
var DEFAULT_MAX_SCENE_BYTES = 256 * 1024 * 1024;
var DEFAULT_SOFT_SCENE_BYTES = 32 * 1024 * 1024;
var DEFAULT_MAX_OPS_BYTES = 512 * 1024;
var DEFAULT_MAX_VERSION_STORAGE_BYTES = 512 * 1024 * 1024;
var SCENE_REQUEST_ENVELOPE_BYTES = 1024 * 1024;
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
var PENDING_REVIEW_WRITE_TTL_MS = 10 * 6e4;

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
function gatewayDescriptorPath() {
  return process.env.DRAW2CODE_GATEWAY_DESCRIPTOR_PATH ?? join(daemonRuntimeDir(), "gateway.json");
}
async function healthyAt(descriptor, path) {
  try {
    const response = await fetch(`http://127.0.0.1:${descriptor.port}${path}`, {
      headers: { authorization: `Bearer ${descriptor.token}` },
      signal: AbortSignal.timeout(800)
    });
    const body = await response.json();
    return response.ok && body.ok === true && body.nonce === descriptor.nonce;
  } catch {
    return false;
  }
}
async function portIsOccupied(port) {
  return await new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (occupied) => {
      socket.destroy();
      resolve(occupied);
    };
    socket.setTimeout(300);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
async function waitForDescriptor(path, timeoutMs, healthPath) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const descriptor = await validateDaemonDescriptor(path);
    if (descriptor !== null && await healthyAt(descriptor, healthPath)) return descriptor;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`draw2code ${healthPath === "/health" ? "daemon" : "gateway"} did not become healthy`);
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
async function ensureDetachedProcess(options) {
  const current = await validateDaemonDescriptor(options.descriptorPath);
  if (current !== null && await healthyAt(current, options.healthPath)) return current;
  await mkdir2(dirname(options.descriptorPath), { recursive: true, mode: 448 });
  await rm(options.descriptorPath, { force: true });
  const lockPath = `${options.descriptorPath}.lock`;
  while (true) {
    let lock = null;
    try {
      lock = await open(lockPath, "wx", 384);
      await lock.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: Date.now() })}
`);
      const child = spawn(process.execPath, [options.entry], {
        detached: true,
        stdio: "ignore",
        env: options.env
      });
      child.unref();
      return await waitForDescriptor(options.descriptorPath, 8e3, options.healthPath);
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
    return waitForDescriptor(options.descriptorPath, 8e3, options.healthPath);
  }
}
async function ensureDaemonProcess(daemonEntry, canvasHtmlPath, descriptorPath = daemonDescriptorPath()) {
  return await ensureDetachedProcess({
    descriptorPath,
    healthPath: "/health",
    entry: daemonEntry,
    env: {
      ...process.env,
      DRAW2CODE_DESCRIPTOR_PATH: descriptorPath,
      DRAW2CODE_CANVAS_HTML: canvasHtmlPath
    }
  });
}
var Draw2CodeDaemonClient = class {
  constructor(daemonEntry, canvasHtmlPath, descriptorPath = daemonDescriptorPath(), gatewayEntry = join(dirname(daemonEntry), "draw2code-gateway.js"), gatewayPath = gatewayDescriptorPath()) {
    this.daemonEntry = daemonEntry;
    this.canvasHtmlPath = canvasHtmlPath;
    this.descriptorPath = descriptorPath;
    this.gatewayEntry = gatewayEntry;
    this.gatewayPath = gatewayPath;
  }
  async ensure() {
    return await ensureDaemonProcess(this.daemonEntry, this.canvasHtmlPath, this.descriptorPath);
  }
  async ensureGateway() {
    const configuredPort = Number(process.env.DRAW2CODE_GATEWAY_PORT);
    const port = Number.isInteger(configuredPort) && configuredPort >= 0 && configuredPort <= 65535 ? configuredPort : DEFAULT_GATEWAY_PORT;
    const current = await validateDaemonDescriptor(this.gatewayPath);
    if (current !== null && await healthyAt(current, "/gateway-health")) return current;
    if (port > 0 && await portIsOccupied(port)) {
      throw new Error(`draw2code gateway port ${port} is already in use; stop the conflicting service or set DRAW2CODE_GATEWAY_PORT`);
    }
    return await ensureDetachedProcess({
      descriptorPath: this.gatewayPath,
      healthPath: "/gateway-health",
      entry: this.gatewayEntry,
      env: {
        ...process.env,
        DRAW2CODE_GATEWAY_DESCRIPTOR_PATH: this.gatewayPath,
        DRAW2CODE_GATEWAY_PORT: String(port),
        DRAW2CODE_DESCRIPTOR_PATH: this.descriptorPath,
        DRAW2CODE_DAEMON_ENTRY: this.daemonEntry,
        DRAW2CODE_CANVAS_HTML: this.canvasHtmlPath
      }
    });
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
  async stableCanvas(root, board, context) {
    await this.ensure();
    const gateway = await this.ensureGateway();
    const response = await fetch(`http://127.0.0.1:${gateway.port}/bootstrap-code`, {
      method: "POST",
      headers: { authorization: `Bearer ${gateway.token}`, "content-type": "application/json" },
      body: JSON.stringify({ root, board, context })
    });
    const body = await response.json();
    if (!response.ok || body.ok !== true || body.url === void 0 || body.expiresAt === void 0) {
      throw new Error(body.error?.message ?? "failed to create stable canvas URL");
    }
    return { url: body.url, expiresAt: body.expiresAt };
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
  daemonRuntimeDir,
  ensureDaemonProcess,
  gatewayDescriptorPath
};
