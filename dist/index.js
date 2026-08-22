// src/project-store.ts
import { randomUUID } from "node:crypto";
import { mkdir as mkdir2, readFile as readFile2, readdir as readdir2, rename as rename2, stat as stat2, writeFile as writeFile2 } from "node:fs/promises";
import { realpath as realpath2 } from "node:fs/promises";
import { join as join2 } from "node:path";

// src/scene-store.ts
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
var SCENE_DIR = "draw2code";
var ACTIVE_BOARD_FILE = ".active-board.json";
var GENERATIONS_DIR = ".generations";
var GENERATE_SETTINGS_DIR = ".generate-settings";
var GENERATION_ID_RE = /^generation-[0-9a-f-]{36}$/;
var PAGES_DIR = "draw2code-pages";
var MAX_SCENE_BYTES = 512 * 1024;
var MAX_ELEMENTS = 2e3;
var MAX_ELEMENT_BYTES = 16 * 1024;
var MAX_TEXT_CHARS = 4e3;
var NAME_RE = /^[\w\u4e00-\u9fa5][\w\u4e00-\u9fa5 -]{0,63}$/;
var VERSIONS_DIR = ".versions";
var MAX_VERSIONS = 30;
var CLIENT_ARCHIVE_INTERVAL_MS = 10 * 6e4;
var ALLOWED_TYPES = /* @__PURE__ */ new Set([
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "image",
  "frame",
  "embeddable"
]);
var SEMANTIC_PALETTE = {
  primary: { stroke: "#4c6ef5", background: "#dbe4ff" },
  success: { stroke: "#40c057", background: "#d3f9d8" },
  warning: { stroke: "#fab005", background: "#fff3bf" },
  danger: { stroke: "#fa5252", background: "#ffe3e3" },
  info: { stroke: "#7950f2", background: "#e5dbff" },
  neutral: { stroke: "#868e96", background: "#f1f3f5" }
};
var SEMANTIC_COLOR_TYPES = /* @__PURE__ */ new Set(["rectangle", "diamond", "ellipse"]);
var CENTERED_TEXT_ROLES = /* @__PURE__ */ new Set([
  "button",
  "primary-button",
  "secondary-button",
  "danger-button",
  "destructive-button",
  "primary-action",
  "secondary-action",
  "chip",
  "filter-chip",
  "choice-chip",
  "tab",
  "tab-item",
  "navigation-item",
  "bottom-navigation-item",
  "bottom-nav-item",
  "segmented-control-item"
]);
var LEFT_MIDDLE_TEXT_ROLES = /* @__PURE__ */ new Set([
  "input",
  "text-input",
  "select",
  "dropdown",
  "search-input",
  "search-field"
]);
var BOTTOM_NAVIGATION_ROLES = /* @__PURE__ */ new Set(["bottom-navigation", "bottom-nav", "tabbar"]);
var BOTTOM_NAVIGATION_ITEM_ROLES = /* @__PURE__ */ new Set(["bottom-navigation-item", "bottom-nav-item"]);
function semanticTextAlignment(role) {
  if (CENTERED_TEXT_ROLES.has(role)) return { textAlign: "center", verticalAlign: "middle" };
  if (LEFT_MIDDLE_TEXT_ROLES.has(role)) return { textAlign: "left", verticalAlign: "middle" };
  return null;
}
function semanticRole(element) {
  if (typeof element?.customData !== "object" || element.customData === null) return "";
  const role = element.customData.role;
  return typeof role === "string" ? role.toLowerCase() : "";
}
function semanticTextGeometry(element, container, alignment) {
  if (container === void 0 || alignment.verticalAlign !== "middle") return { ...element, ...alignment };
  const fontSize = typeof element.fontSize === "number" && Number.isFinite(element.fontSize) ? element.fontSize : 20;
  const lineHeight = typeof element.lineHeight === "number" && Number.isFinite(element.lineHeight) ? element.lineHeight : 1.25;
  const text3 = typeof element.text === "string" ? element.text : "";
  const lines = text3 === "" ? 1 : text3.split("\n").length;
  const containerY = typeof container.y === "number" && Number.isFinite(container.y) ? container.y : 0;
  const containerHeight = typeof container.height === "number" && Number.isFinite(container.height) ? container.height : 0;
  const height = Math.min(containerHeight, lines * fontSize * lineHeight);
  return {
    ...element,
    ...alignment,
    y: containerY + (containerHeight - height) / 2,
    height
  };
}
var VERSION_FILE_RE = /^(\d{9,})-[0-9a-z]{1,8}\.json$/;
function versionStamp(entry) {
  const match = VERSION_FILE_RE.exec(entry);
  return match === null ? null : Number(match[1]);
}
function err(code, message) {
  return { ok: false, error: { code, message } };
}
function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31) + 1;
}
function normalizeForPrefix(value) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}
function isPathInside(root, child) {
  if (root === "" || child === "") return false;
  const normRoot = normalizeForPrefix(root);
  const normChild = normalizeForPrefix(child);
  if (normChild === normRoot) return true;
  return normChild.startsWith(`${normRoot}/`);
}
function containingFrameId(frames, el) {
  const x1 = Number(el.x ?? 0);
  const y1 = Number(el.y ?? 0);
  const x2 = x1 + Number(el.width ?? 0);
  const y2 = y1 + Number(el.height ?? 0);
  for (const frame of frames) {
    const fx1 = Number(frame.x ?? 0);
    const fy1 = Number(frame.y ?? 0);
    const fx2 = fx1 + Number(frame.width ?? 0);
    const fy2 = fy1 + Number(frame.height ?? 0);
    if (x1 >= fx1 - 2 && y1 >= fy1 - 2 && x2 <= fx2 + 2 && y2 <= fy2 + 2) {
      return String(frame.id);
    }
  }
  return null;
}
function normalizeElement(input) {
  if (typeof input !== "object" || input === null) throw new Error("element must be an object");
  const el = input;
  const type = typeof el.type === "string" ? el.type : "";
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error(`element type "${type}" is not allowed (use one of ${[...ALLOWED_TYPES].join(", ")})`);
  }
  const id = typeof el.id === "string" && el.id !== "" ? el.id : null;
  if (id === null || id.length > 64) throw new Error("element.id must be a non-empty string (<=64 chars)");
  const num3 = (v, d) => typeof v === "number" && Number.isFinite(v) ? v : d;
  const str3 = (v, d) => typeof v === "string" ? v : d;
  const text3 = str3(el.text, "").slice(0, MAX_TEXT_CHARS);
  const now2 = Date.now();
  const authoredCustomData = typeof el.customData === "object" && el.customData !== null ? el.customData : {};
  const role = str3(authoredCustomData.role, "").toLowerCase();
  const explicitTone = str3(authoredCustomData.tone, "").toLowerCase();
  const inferredTone = explicitTone !== "" ? explicitTone : role === "primary-action" || role === "primary-button" ? "primary" : role === "success" || role === "completed" ? "success" : role === "warning" ? "warning" : role === "danger" || role === "error" || role === "overdue" ? "danger" : "";
  const semanticColor = SEMANTIC_COLOR_TYPES.has(type) ? SEMANTIC_PALETTE[inferredTone] : void 0;
  const out = {
    id,
    type,
    x: num3(el.x, 0),
    y: num3(el.y, 0),
    width: num3(el.width, type === "text" ? 160 : 180),
    height: num3(el.height, type === "text" ? 80 : type === "frame" ? 320 : 80),
    angle: num3(el.angle, 0),
    strokeColor: str3(el.strokeColor, semanticColor?.stroke ?? "#1e1e1e"),
    backgroundColor: str3(el.backgroundColor, semanticColor?.background ?? "transparent"),
    fillStyle: str3(el.fillStyle, "solid"),
    strokeWidth: num3(el.strokeWidth, 1),
    strokeStyle: str3(el.strokeStyle, "solid"),
    roughness: num3(el.roughness, 1),
    opacity: num3(el.opacity, 100),
    groupIds: Array.isArray(el.groupIds) ? el.groupIds : [],
    frameId: el.frameId === void 0 || el.frameId === null ? null : el.frameId,
    roundness: el.roundness === void 0 || el.roundness === null ? type === "line" || type === "arrow" ? { type: 2 } : null : el.roundness,
    boundElements: Array.isArray(el.boundElements) ? el.boundElements : null,
    locked: el.locked === true,
    // Preserve links created by the user or authored by the agent. Invalid
    // values are discarded, but a valid Excalidraw link must survive a
    // client round-trip through normalizeScene().
    link: typeof el.link === "string" ? el.link : null,
    updated: now2,
    seed: num3(el.seed, randomSeed()),
    version: num3(el.version, 1),
    versionNonce: num3(el.versionNonce, randomSeed()),
    isDeleted: false
  };
  if (type === "text") {
    const fontSize = num3(el.fontSize, 20);
    const lines = text3 === "" ? 1 : text3.split("\n").length;
    out.text = text3;
    out.originalText = text3;
    out.fontSize = fontSize;
    out.fontFamily = num3(el.fontFamily, 1);
    out.textAlign = str3(el.textAlign, "left");
    out.verticalAlign = str3(el.verticalAlign, "top");
    out.containerId = el.containerId === void 0 || el.containerId === null ? null : el.containerId;
    out.lineHeight = num3(el.lineHeight, 1.25);
    if (el.width === void 0) out.width = num3(el.width, Math.min(360, fontSize * (text3.length || 8) * 0.62 + 16));
    if (el.height === void 0) out.height = num3(el.height, lines * fontSize * 1.25 + 8);
  }
  if (type === "line" || type === "arrow") {
    const points = Array.isArray(el.points) && el.points.length > 0 ? el.points : [[0, 0], [num3(el.width, 160) - num3(el.x, 0), 0]];
    out.points = points;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    out.width = num3(el.width, Math.max(...xs) - Math.min(...xs));
    out.height = num3(el.height, Math.max(...ys) - Math.min(...ys));
    out.lastCommittedPoint = Array.isArray(el.lastCommittedPoint) ? el.lastCommittedPoint : null;
    out.startBinding = typeof el.startBinding === "object" && el.startBinding !== null ? el.startBinding : null;
    out.endBinding = typeof el.endBinding === "object" && el.endBinding !== null ? el.endBinding : null;
    out.startArrowhead = el.startArrowhead === null || typeof el.startArrowhead === "string" ? el.startArrowhead : null;
    out.endArrowhead = el.endArrowhead === null || typeof el.endArrowhead === "string" ? el.endArrowhead : null;
  }
  if (type === "frame") {
    const frameName = str3(el.name, "").trim();
    out.name = frameName !== "" ? frameName : text3;
  }
  for (const [key, value] of Object.entries(el)) {
    if (!(key in out)) out[key] = value;
  }
  if (Buffer.byteLength(JSON.stringify(out), "utf8") > MAX_ELEMENT_BYTES) {
    throw new Error(`element ${id} exceeds ${MAX_ELEMENT_BYTES} bytes`);
  }
  return out;
}
function reconcileBoundTextBindings(elements, alignmentFocusIds) {
  const byId = new Map(elements.map((element) => [String(element.id ?? ""), element]));
  const textsByContainer = /* @__PURE__ */ new Map();
  const frameMembershipByText = /* @__PURE__ */ new Map();
  const detachedNavigationTextIds = /* @__PURE__ */ new Set();
  for (const element of elements) {
    if (element.type !== "text" || typeof element.containerId !== "string" || element.containerId === "") continue;
    const container = byId.get(element.containerId);
    const focused = alignmentFocusIds === void 0 || alignmentFocusIds.has(String(element.id ?? "")) || container !== void 0 && alignmentFocusIds.has(String(container.id ?? ""));
    if (focused && BOTTOM_NAVIGATION_ITEM_ROLES.has(semanticRole(element)) && BOTTOM_NAVIGATION_ROLES.has(semanticRole(container))) {
      detachedNavigationTextIds.add(String(element.id ?? ""));
    }
  }
  for (const element of elements) {
    if (element.type !== "text" || typeof element.containerId !== "string" || element.containerId === "") continue;
    if (detachedNavigationTextIds.has(String(element.id ?? ""))) continue;
    const container = byId.get(element.containerId);
    if (container === void 0) continue;
    if (container.type === "frame") {
      frameMembershipByText.set(String(element.id ?? ""), element.containerId);
      continue;
    }
    if (!SEMANTIC_COLOR_TYPES.has(String(container.type ?? ""))) continue;
    const texts = textsByContainer.get(element.containerId) ?? [];
    texts.push(element);
    textsByContainer.set(element.containerId, texts);
  }
  return elements.map((element) => {
    const frameMembership = frameMembershipByText.get(String(element.id ?? ""));
    if (frameMembership !== void 0) {
      return {
        ...element,
        containerId: null,
        frameId: typeof element.frameId === "string" && element.frameId !== "" ? element.frameId : frameMembership
      };
    }
    if (element.type === "text") {
      const container = typeof element.containerId === "string" ? byId.get(element.containerId) : void 0;
      const elementRole2 = semanticRole(element);
      const containerRole = semanticRole(container);
      const role = elementRole2 !== "" ? elementRole2 : containerRole;
      const isFocused2 = alignmentFocusIds === void 0 || alignmentFocusIds.has(String(element.id ?? "")) || container !== void 0 && alignmentFocusIds.has(String(container.id ?? ""));
      const alignment = semanticTextAlignment(role);
      if (isFocused2 && alignment !== null) {
        if (detachedNavigationTextIds.has(String(element.id ?? ""))) {
          return {
            ...semanticTextGeometry(element, container, alignment),
            containerId: null
          };
        }
        if (container !== void 0) return semanticTextGeometry(element, container, alignment);
        if (BOTTOM_NAVIGATION_ITEM_ROLES.has(role)) {
          const navigationShell = elements.find((candidate) => {
            if (!SEMANTIC_COLOR_TYPES.has(String(candidate.type ?? "")) || !BOTTOM_NAVIGATION_ROLES.has(semanticRole(candidate))) return false;
            const x = Number(element.x ?? 0);
            const y = Number(element.y ?? 0);
            const width = Number(element.width ?? 0);
            const height = Number(element.height ?? 0);
            const shellX = Number(candidate.x ?? 0);
            const shellY = Number(candidate.y ?? 0);
            return x >= shellX - 2 && y >= shellY - 2 && x + width <= shellX + Number(candidate.width ?? 0) + 2 && y + height <= shellY + Number(candidate.height ?? 0) + 2;
          });
          if (navigationShell !== void 0) return semanticTextGeometry(element, navigationShell, alignment);
        }
        return { ...element, ...alignment };
      }
      return element;
    }
    if (!SEMANTIC_COLOR_TYPES.has(String(element.type ?? ""))) return element;
    const containerId = String(element.id ?? "");
    const texts = textsByContainer.get(containerId) ?? [];
    if (texts.length !== 1) return element;
    const textId = String(texts[0].id ?? "");
    const existing = Array.isArray(element.boundElements) ? element.boundElements.filter((binding) => {
      if (typeof binding !== "object" || binding === null) return true;
      return binding.type !== "text";
    }) : [];
    return {
      ...element,
      boundElements: [...existing, { type: "text", id: textId }]
    };
  });
}
function normalizeScene(input) {
  if (typeof input !== "object" || input === null) throw new Error("scene must be an object");
  const raw = input;
  if (!Array.isArray(raw.elements)) throw new Error("scene.elements must be an array");
  if (raw.elements.length > MAX_ELEMENTS) throw new Error(`scene has more than ${MAX_ELEMENTS} elements`);
  const appState = typeof raw.appState === "object" && raw.appState !== null ? raw.appState : {};
  return {
    type: "excalidraw",
    version: 2,
    source: "dsh-draw2code",
    // Excalidraw deletions arrive as isDeleted tombstones kept in the
    // elements array. They MUST be dropped here (physical deletion):
    // normalizeElement defaults isDeleted to false, so letting a tombstone
    // through silently resurrects the element on disk — the user's deletion
    // vanishes, then resurfaces on the next poll, and re-deleting it is
    // swallowed by the client's echo guard (identical JSON). Filtering here
    // makes deletion physical and keeps client/server in agreement.
    elements: raw.elements.filter((el) => el.isDeleted !== true).map(normalizeElement),
    appState: {
      viewBackgroundColor: typeof appState.viewBackgroundColor === "string" ? appState.viewBackgroundColor : "#ffffff"
    }
  };
}
function emptyScene() {
  return {
    type: "excalidraw",
    version: 2,
    source: "dsh-draw2code",
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" }
  };
}
function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return `string(${value.length} chars)`;
  return typeof value;
}
function parseOps(input) {
  let source = input;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch (error2) {
      throw new Error(`ops is not valid JSON: ${error2 instanceof Error ? error2.message : String(error2)}. Send an array like [{"op":"upsert","element":{...}}] or a JSON string encoding it`);
    }
  }
  if (!Array.isArray(source)) {
    throw new Error(`ops must be an array, got ${typeName(source)}. Large payloads sometimes arrive as a JSON string (auto-parsed); if you still see this, check the ops argument is an array of op objects`);
  }
  if (source.length > MAX_ELEMENTS) throw new Error(`ops has ${source.length} entries (max ${MAX_ELEMENTS})`);
  return source.map((raw, index) => {
    const where = `ops[${index}]`;
    if (typeof raw !== "object" || raw === null) throw new Error(`${where} must be an object, got ${typeName(raw)}`);
    const op = raw;
    const kind = op.op;
    if (kind === "upsert") {
      if (typeof op.element !== "object" || op.element === null) {
        throw new Error(`${where} is "upsert" but missing its element: use {"op":"upsert","element":{"id":"x","type":"rectangle",...}}`);
      }
      const el = op.element;
      if (typeof el.id !== "string" || el.id === "") {
        throw new Error(`${where}.element.id missing or not a string: every element needs a unique non-empty id`);
      }
      if (typeof el.type !== "string") {
        throw new Error(`${where}.element.type missing: pick one of rectangle | diamond | ellipse | arrow | line | freedraw | text | frame`);
      }
      return { op: "upsert", element: el };
    }
    if (kind === "delete") {
      const id = typeof op.id === "string" ? op.id : typeof op.elementId === "string" ? op.elementId : "";
      if (id === "") throw new Error(`${where} is "delete" but missing its id: use {"op":"delete","id":"<element id>"}`);
      return { op: "delete", id };
    }
    if (kind === "clear") return { op: "clear" };
    if (kind === "replace") {
      if (typeof op.scene !== "object" || op.scene === null) {
        throw new Error(`${where} is "replace" but missing its scene: use {"op":"replace","scene":{"elements":[...]}}`);
      }
      return { op: "replace", scene: op.scene };
    }
    throw new Error(`${where}.op = "${String(kind)}" is invalid: must be one of upsert | delete | clear | replace. The most common mistake is forgetting the op field entirely`);
  });
}
var SceneStore = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  boardReveals = /* @__PURE__ */ new Map();
  writeQueues = /* @__PURE__ */ new Map();
  revealCounter = 0;
  /** Gate a requested root: must resolve on disk and sit inside a registered workspace. */
  async gate(root) {
    if (typeof root !== "string" || root === "") return err("workspace-unknown", "empty project root");
    let canonical;
    try {
      canonical = await realpath(root);
    } catch {
      return err("workspace-unknown", "path does not resolve on disk");
    }
    const workspaces = this.ctx.workspaceRegistry.list();
    for (const workspace of workspaces) {
      if (isPathInside(workspace.path, canonical)) return { ok: true, value: canonical };
    }
    return err("workspace-unknown", "path is not inside a registered workspace");
  }
  /** The draw2code directory for a gated root (created lazily on write). */
  dir(canonicalRoot) {
    return join(canonicalRoot, SCENE_DIR);
  }
  activeBoardPath(canonicalRoot) {
    return join(this.dir(canonicalRoot), ACTIVE_BOARD_FILE);
  }
  /** Validate a scene name. */
  checkName(name2) {
    const trimmed = typeof name2 === "string" ? name2.trim() : "";
    if (!NAME_RE.test(trimmed)) {
      return err("bad-name", `scene name "${name2}" is invalid (1-64 chars of letters/digits/_/-/space/CJK, no extension)`);
    }
    return { ok: true, value: trimmed };
  }
  async scenePath(canonicalRoot, name2) {
    return join(this.dir(canonicalRoot), `${name2}.excalidraw.json`);
  }
  async withWriteLock(path, task) {
    const previous = this.writeQueues.get(path) ?? Promise.resolve();
    let release = () => void 0;
    const current = new Promise((resolve2) => {
      release = resolve2;
    });
    const tail = previous.catch(() => void 0).then(() => current);
    this.writeQueues.set(path, tail);
    await previous.catch(() => void 0);
    try {
      return await task();
    } finally {
      release();
      if (this.writeQueues.get(path) === tail) this.writeQueues.delete(path);
    }
  }
  /** Read the board selected by the browser, without making it a scene. */
  async getActiveBoard(root) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    let raw;
    try {
      raw = await readFile(this.activeBoardPath(gated.value), "utf8");
    } catch {
      return { ok: true, value: { name: null } };
    }
    try {
      const parsed = JSON.parse(raw);
      const named = this.checkName(parsed.name);
      return named.ok ? { ok: true, value: { name: named.value } } : { ok: true, value: { name: null } };
    } catch {
      return { ok: true, value: { name: null } };
    }
  }
  /** Persist the browser's selected board for agent tools in this workspace. */
  async setActiveBoard(root, name2) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    await mkdir(this.dir(gated.value), { recursive: true });
    const path = this.activeBoardPath(gated.value);
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile(tmp, `${JSON.stringify({ name: named.value })}
`, "utf8");
    await rename(tmp, path);
    return { ok: true, value: { name: named.value } };
  }
  /** Publish the latest verified update for the browser-side auto-open loop. */
  async publishBoardReveal(root, name2) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    this.revealCounter += 1;
    const request = {
      id: `reveal-${Date.now().toString(36)}-${this.revealCounter.toString(36)}`,
      board: named.value,
      createdAt: Date.now()
    };
    this.boardReveals.set(gated.value, request);
    return { ok: true, value: request };
  }
  /** Read the latest reveal request; clients de-duplicate it by id. */
  async getBoardReveal(root) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    return { ok: true, value: { request: this.boardReveals.get(gated.value) ?? null } };
  }
  /** The versions directory of one board (inside draw2code/.versions/<name>). */
  versionsDir(canonicalRoot, name2) {
    return join(this.dir(canonicalRoot), VERSIONS_DIR, name2);
  }
  /**
   * Snapshot the CURRENT disk scene of a board before it gets overwritten.
   * Skipped when the scene file is absent, when the incoming content is
   * byte-identical, or (client throttling) when the newest snapshot of the
   * board is younger than CLIENT_ARCHIVE_INTERVAL_MS. Prunes to MAX_VERSIONS.
   */
  async archiveCurrent(canonicalRoot, name2, incomingJson, always) {
    const scenePath = await this.scenePath(canonicalRoot, name2);
    let raw;
    try {
      const info = await stat(scenePath);
      if (!info.isFile()) return;
      raw = await readFile(scenePath, "utf8");
    } catch {
      return;
    }
    const currentJson = JSON.stringify(JSON.parse(raw));
    if (currentJson === JSON.stringify(JSON.parse(incomingJson))) return;
    const dir = this.versionsDir(canonicalRoot, name2);
    let entries = [];
    try {
      entries = (await readdir(dir)).filter((entry) => versionStamp(entry) !== null);
    } catch {
    }
    if (!always && entries.length > 0) {
      const stamps = entries.map((entry) => versionStamp(entry) ?? 0);
      const newest = Math.max(...stamps);
      if (Date.now() - newest < CLIENT_ARCHIVE_INTERVAL_MS) return;
    }
    try {
      await mkdir(dir, { recursive: true });
      const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
      await writeFile(join(dir, `${Date.now()}-${suffix}.json`), `${raw}
`, "utf8");
      if (entries.length + 1 > MAX_VERSIONS) {
        const doomed = entries.map((entry) => ({ entry, stamp: versionStamp(entry) ?? 0 })).sort((a, b) => a.stamp - b.stamp).slice(0, entries.length + 1 - MAX_VERSIONS);
        await Promise.all(doomed.map(({ entry }) => rm(join(dir, entry), { force: true }).catch(() => void 0)));
      }
    } catch (error2) {
      this.ctx.logger.warn("draw2code version snapshot failed: %o", error2);
    }
  }
  /** List the archived versions of a board (newest first, empty when none). */
  async listVersions(root, name2) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    const dir = this.versionsDir(gated.value, named.value);
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return { ok: true, value: [] };
    }
    const versions = [];
    for (const entry of entries) {
      const stamp = versionStamp(entry);
      if (stamp === null) continue;
      try {
        const raw = await readFile(join(dir, entry), "utf8");
        const elements = JSON.parse(raw).elements;
        versions.push({
          id: entry.slice(0, -".json".length),
          ts: stamp,
          elementCount: Array.isArray(elements) ? elements.length : 0
        });
      } catch {
      }
    }
    versions.sort((a, b) => b.ts - a.ts);
    return { ok: true, value: versions };
  }
  /** Roll a board back to one archived version (snapshotting the current
   * state first, so the rollback itself is reversible). */
  async restoreVersion(root, name2, id) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    if (!/^\d{9,}-[0-9a-z]{1,8}$/.test(id)) return err("bad-version", `version id "${id}" is invalid`);
    let raw;
    try {
      raw = await readFile(join(this.versionsDir(gated.value, named.value), `${id}.json`), "utf8");
    } catch {
      return err("not-found", `version ${id} of scene "${named.value}" does not exist`);
    }
    let scene;
    try {
      scene = JSON.parse(raw);
    } catch {
      return err("corrupt", `version ${id} of scene "${named.value}" is not valid JSON`);
    }
    return this.write(root, named.value, scene, void 0, "agent");
  }
  /**
   * Inventory the generated-pages output directory of a board
   * (draw2code-pages/<board>/, empty when absent) — the style-continuation
   * basis for draw2code_generate.
   */
  async existingPages(root, name2) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    const dir = join(gated.value, PAGES_DIR, named.value);
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return { ok: true, value: [] };
    }
    const files = [];
    for (const entry of entries) {
      try {
        const info = await stat(join(dir, entry));
        if (info.isFile()) files.push(entry);
      } catch {
      }
    }
    files.sort();
    return { ok: true, value: files };
  }
  /** Read one resumable generate session kept beside, but separate from, scenes. */
  async readGeneration(root, sessionId) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    if (!GENERATION_ID_RE.test(sessionId)) return err("bad-generation-id", `generation id "${sessionId}" is invalid`);
    try {
      const raw = await readFile(join(this.dir(gated.value), GENERATIONS_DIR, `${sessionId}.json`), "utf8");
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return err("not-found", `generation "${sessionId}" does not exist`);
    }
  }
  /** Atomically persist one generate session so interruption never loses choices. */
  async writeGeneration(root, sessionId, draft) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    if (!GENERATION_ID_RE.test(sessionId)) return err("bad-generation-id", `generation id "${sessionId}" is invalid`);
    const dir = join(this.dir(gated.value), GENERATIONS_DIR);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${sessionId}.json`);
    const normalized = { ...draft, sessionId, updatedAt: Date.now() };
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile(tmp, `${JSON.stringify(normalized, null, 2)}
`, "utf8");
    await rename(tmp, path);
    return { ok: true, value: normalized };
  }
  /** Project-level visual direction inherited by later generate sessions. */
  async readGenerateSettings(root, name2) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    try {
      const raw = await readFile(join(this.dir(gated.value), GENERATE_SETTINGS_DIR, `${named.value}.json`), "utf8");
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return { ok: true, value: null };
    }
  }
  async writeGenerateSettings(root, name2, settings) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    const dir = join(this.dir(gated.value), GENERATE_SETTINGS_DIR);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${named.value}.json`);
    const normalized = { ...settings, board: named.value, updatedAt: Date.now() };
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile(tmp, `${JSON.stringify(normalized, null, 2)}
`, "utf8");
    await rename(tmp, path);
    return { ok: true, value: normalized };
  }
  /** List every scene under a root (empty list when the directory is absent). */
  async list(root) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    let entries;
    try {
      entries = await readdir(this.dir(gated.value));
    } catch {
      return { ok: true, value: [] };
    }
    const metas = [];
    for (const entry of entries) {
      if (!entry.endsWith(".excalidraw.json")) continue;
      const name2 = entry.slice(0, -".excalidraw.json".length);
      const path = join(this.dir(gated.value), entry);
      try {
        const info = await stat(path);
        if (!info.isFile()) continue;
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw);
        const elements = parsed.elements;
        metas.push({
          name: name2,
          rev: info.mtimeMs,
          updatedAt: info.mtimeMs,
          elementCount: Array.isArray(elements) ? elements.length : 0
        });
      } catch {
      }
    }
    metas.sort((a, b) => b.updatedAt - a.updatedAt);
    return { ok: true, value: metas };
  }
  /** Read one scene. */
  async read(root, name2) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    const path = await this.scenePath(gated.value, named.value);
    let raw;
    let rev;
    try {
      const info = await stat(path);
      rev = info.mtimeMs;
      raw = await readFile(path, "utf8");
    } catch {
      return err("not-found", `scene "${named.value}" does not exist`);
    }
    if (Buffer.byteLength(raw) > MAX_SCENE_BYTES * 4) {
      return err("too-large", `scene "${named.value}" exceeds the read cap`);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return err("corrupt", `scene "${named.value}" is not valid JSON`);
    }
    const elements = parsed.elements;
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "dsh-draw2code",
      elements: Array.isArray(elements) ? elements : [],
      appState: {
        viewBackgroundColor: typeof parsed.appState?.viewBackgroundColor === "string" ? parsed.appState.viewBackgroundColor : "#ffffff"
      }
    };
    return { ok: true, value: { rev, scene } };
  }
  /** Write a whole scene (validated). baseRev conflicts return 'conflict'. */
  async write(root, name2, sceneInput, baseRev, archive = "client") {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    let scene;
    try {
      scene = normalizeScene(sceneInput);
    } catch (error2) {
      return err("bad-scene", error2 instanceof Error ? error2.message : String(error2));
    }
    const json = JSON.stringify(scene, null, 2);
    if (Buffer.byteLength(json, "utf8") > MAX_SCENE_BYTES) {
      return err("too-large", `scene exceeds ${MAX_SCENE_BYTES} bytes`);
    }
    const path = await this.scenePath(gated.value, named.value);
    return this.withWriteLock(path, async () => {
      if (typeof baseRev === "number") {
        try {
          const info2 = await stat(path);
          if (Math.abs(info2.mtimeMs - baseRev) > 0.5) {
            return err("conflict", `scene changed on disk since rev ${baseRev}`);
          }
        } catch {
        }
      }
      await mkdir(this.dir(gated.value), { recursive: true });
      await this.archiveCurrent(gated.value, named.value, json, archive === "agent");
      const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await writeFile(tmp, json + "\n", "utf8");
      await rename(tmp, path);
      const info = await stat(path);
      return {
        ok: true,
        value: { name: named.value, rev: info.mtimeMs, updatedAt: info.mtimeMs, elementCount: scene.elements.length }
      };
    });
  }
  /** Create an empty scene (fails when it already exists). */
  async create(root, name2) {
    const read = await this.read(root, name2);
    if (read.ok) return err("exists", `scene "${name2}" already exists`);
    if (read.error.code !== "not-found") return read;
    const written = await this.write(root, name2, emptyScene(), 0);
    return !written.ok && written.error.code === "conflict" ? err("exists", `scene "${name2}" already exists`) : written;
  }
  /** Delete one scene. */
  async remove(root, name2) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    const path = await this.scenePath(gated.value, named.value);
    try {
      await rm(path);
    } catch {
      return err("not-found", `scene "${name2}" does not exist`);
    }
    await rm(this.versionsDir(gated.value, named.value), { recursive: true, force: true }).catch(() => void 0);
    const active = await this.getActiveBoard(root);
    if (active.ok && active.value.name === named.value) {
      await rm(this.activeBoardPath(gated.value), { force: true }).catch(() => void 0);
    }
    return { ok: true, value: { deleted: true } };
  }
  /**
   * Apply an ops array against a scene (auto-creating an empty scene when it
   * does not exist yet) — the agent-side mutation path. Upserts normalize
   * their element, so partial authored fields are filled.
   */
  async applyOps(root, name2, opsInput, baseRev) {
    let ops;
    try {
      ops = parseOps(opsInput);
    } catch (error2) {
      return err("bad-ops", error2 instanceof Error ? error2.message : String(error2));
    }
    const current = await this.read(root, name2);
    let scene;
    if (current.ok) {
      scene = current.value.scene;
    } else if (current.error.code === "not-found") {
      scene = emptyScene();
    } else {
      return current;
    }
    const expectedBaseRev = typeof baseRev === "number" ? baseRev : current.ok ? current.value.rev : 0;
    let applied = 0;
    const alignmentFocusIds = /* @__PURE__ */ new Set();
    let alignWholeScene = false;
    for (const op of ops) {
      if (op.op === "replace") {
        try {
          scene = normalizeScene(op.scene);
        } catch (error2) {
          return err("bad-scene", error2 instanceof Error ? error2.message : String(error2));
        }
        alignWholeScene = true;
        applied += 1;
        continue;
      }
      if (op.op === "clear") {
        scene = { ...scene, elements: [] };
        applied += 1;
        continue;
      }
      if (op.op === "delete") {
        const before = scene.elements.length;
        scene = { ...scene, elements: scene.elements.filter((el) => el.id !== op.id) };
        if (scene.elements.length !== before) applied += 1;
        continue;
      }
      alignmentFocusIds.add(String(op.element.id ?? ""));
      let normalized;
      try {
        normalized = normalizeElement(op.element);
      } catch (error2) {
        return err("bad-element", error2 instanceof Error ? error2.message : String(error2));
      }
      if (normalized.frameId === null || normalized.frameId === void 0) {
        const frames = scene.elements.filter((el) => el.type === "frame");
        normalized.frameId = containingFrameId(frames, normalized);
      }
      const index = scene.elements.findIndex((el) => el.id === normalized.id);
      if (index === -1) {
        scene = { ...scene, elements: [...scene.elements, normalized] };
      } else {
        const elements = scene.elements.slice();
        elements[index] = normalized;
        scene = { ...scene, elements };
      }
      applied += 1;
    }
    if (scene.elements.length > MAX_ELEMENTS) {
      return err("too-many", `scene would exceed ${MAX_ELEMENTS} elements`);
    }
    scene = {
      ...scene,
      elements: reconcileBoundTextBindings(
        scene.elements,
        alignWholeScene ? void 0 : alignmentFocusIds
      )
    };
    const written = await this.write(root, name2, scene, expectedBaseRev, "agent");
    if (!written.ok) return written;
    return { ok: true, value: { ...written.value, applied } };
  }
};

// src/project-store.ts
var PROJECTS_DIR = `${SCENE_DIR}/.projects`;
var PROJECT_ID_RE = /^project-[0-9a-f-]{36}$/;
var PROJECT_FILE_RE = /^project-[0-9a-f-]{36}\.json$/;
var VERSION_FILE_RE2 = /^(\d{9,})-[0-9a-z]{1,8}\.json$/;
function error(code, message, current) {
  return { ok: false, error: { code, message, ...current === void 0 ? {} : { current } } };
}
function now() {
  return Date.now();
}
function validateProjectId(projectId) {
  return PROJECT_ID_RE.test(projectId) ? { ok: true, value: projectId } : error("bad-project-id", `project id "${projectId}" is invalid`);
}
function versionStamp2(entry) {
  const match = VERSION_FILE_RE2.exec(entry);
  return match === null ? null : Number(match[1]);
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function newProjectId() {
  return `project-${randomUUID()}`;
}
var ProjectStore = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  mutationQueues = /* @__PURE__ */ new Map();
  async withMutationLock(path, task) {
    const previous = this.mutationQueues.get(path) ?? Promise.resolve();
    let release = () => void 0;
    const current = new Promise((resolve2) => {
      release = resolve2;
    });
    const tail = previous.catch(() => void 0).then(() => current);
    this.mutationQueues.set(path, tail);
    await previous.catch(() => void 0);
    try {
      return await task();
    } finally {
      release();
      if (this.mutationQueues.get(path) === tail) this.mutationQueues.delete(path);
    }
  }
  async gate(root) {
    if (typeof root !== "string" || root === "") return error("workspace-unknown", "empty project root");
    let canonical;
    try {
      canonical = await realpath2(root);
    } catch {
      return error("workspace-unknown", "path does not resolve on disk");
    }
    const workspaces = this.ctx.workspaceRegistry.list();
    for (const workspace of workspaces) {
      if (isPathInside(workspace.path, canonical)) return { ok: true, value: canonical };
    }
    return error("workspace-unknown", "path is not inside a registered workspace");
  }
  projectDir(root) {
    return join2(root, PROJECTS_DIR);
  }
  projectPath(root, projectId) {
    return join2(this.projectDir(root), `${projectId}.json`);
  }
  versionsDir(root, projectId) {
    return join2(this.projectDir(root), ".versions", projectId);
  }
  fileName(projectId) {
    return `${PROJECTS_DIR}/${projectId}.json`;
  }
  async read(root, projectId) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const validId = validateProjectId(projectId);
    if (!validId.ok) return validId;
    let raw;
    try {
      raw = await readFile2(this.projectPath(gated.value, validId.value), "utf8");
    } catch {
      return error("not-found", `project "${projectId}" does not exist`);
    }
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return error("corrupt", `project "${projectId}" is not valid JSON`);
    }
  }
  async create(root, draft) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const validId = validateProjectId(draft.projectId);
    if (!validId.ok) return validId;
    const path = this.projectPath(gated.value, validId.value);
    try {
      await stat2(path);
      return error("exists", `project "${draft.projectId}" already exists`);
    } catch {
    }
    await mkdir2(this.projectDir(gated.value), { recursive: true });
    const written = await this.writeAtomic(gated.value, draft);
    return written;
  }
  async save(root, draft, expectedRevision) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const validId = validateProjectId(draft.projectId);
    if (!validId.ok) return validId;
    const path = this.projectPath(gated.value, validId.value);
    return this.withMutationLock(path, async () => {
      const current = await this.read(root, draft.projectId);
      if (!current.ok) return current;
      if (current.value.revision !== expectedRevision) {
        return error("stale_revision", `project changed since revision ${expectedRevision}`, current.value);
      }
      await this.archiveCurrent(gated.value, draft.projectId);
      return this.writeAtomic(gated.value, draft);
    });
  }
  async list(root) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    let entries;
    try {
      entries = await readdir2(this.projectDir(gated.value));
    } catch {
      return { ok: true, value: [] };
    }
    const drafts = [];
    for (const entry of entries) {
      if (!PROJECT_FILE_RE.test(entry)) continue;
      try {
        drafts.push(JSON.parse(await readFile2(join2(this.projectDir(gated.value), entry), "utf8")));
      } catch {
      }
    }
    drafts.sort((a, b) => b.updatedAt - a.updatedAt);
    return { ok: true, value: drafts };
  }
  async writeAtomic(root, draft) {
    const normalized = clone({ ...draft, updatedAt: now() });
    await mkdir2(this.projectDir(root), { recursive: true });
    const path = this.projectPath(root, draft.projectId);
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile2(tmp, `${JSON.stringify(normalized, null, 2)}
`, "utf8");
    await rename2(tmp, path);
    return { ok: true, value: normalized };
  }
  async archiveCurrent(root, projectId) {
    const path = this.projectPath(root, projectId);
    let raw;
    try {
      raw = await readFile2(path, "utf8");
    } catch {
      return;
    }
    const dir = this.versionsDir(root, projectId);
    await mkdir2(dir, { recursive: true });
    const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
    await writeFile2(join2(dir, `${Date.now()}-${suffix}.json`), `${raw}
`, "utf8");
    const entries = (await readdir2(dir)).filter((entry) => versionStamp2(entry) !== null);
    if (entries.length <= 30) return;
    const doomed = entries.map((entry) => ({ entry, stamp: versionStamp2(entry) ?? 0 })).sort((a, b) => a.stamp - b.stamp).slice(0, entries.length - 30);
    const { rm: rm2 } = await import("node:fs/promises");
    await Promise.all(doomed.map(({ entry }) => rm2(join2(dir, entry), { force: true })));
  }
};

// src/routes.ts
import { execFile } from "node:child_process";
import { writeFile as writeFile3 } from "node:fs/promises";
var MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
function runNative(command, args) {
  return new Promise((resolve2) => {
    execFile(command, args, { encoding: "utf8" }, (error2, stdout, stderr) => {
      if (error2 !== null) {
        resolve2({ stdout, stderr, code: error2.code });
        return;
      }
      resolve2({ stdout, stderr });
    });
  });
}
async function chooseExportPath(defaultName) {
  if (process.platform !== "darwin") throw new Error(`native export is unsupported on ${process.platform}`);
  const script = [
    "ObjC.import('Cocoa')",
    "function run(argv) {",
    "  const panel = $.NSSavePanel.savePanel",
    '  panel.title = "\u5BFC\u51FA\u753B\u677F"',
    '  panel.nameFieldStringValue = argv[0] || "prototype.excalidraw"',
    "  panel.canCreateDirectories = true",
    '  if (panel.runModal() !== $.NSModalResponseOK) return ""',
    "  return ObjC.unwrap(panel.URL.path)",
    "}"
  ].join("\n");
  const result = await runNative("/usr/bin/osascript", ["-l", "JavaScript", "-e", script, defaultName]);
  const output = result.stdout.trim();
  const cancelled = result.code === -128 || result.code === "-128" || /user canceled|用户(?:已)?取消/i.test(`${result.stderr} ${result.stdout}`);
  if (cancelled) return null;
  if (result.code !== void 0) {
    throw new Error(result.stderr.trim() || "native save dialog failed");
  }
  if (output === "") return null;
  return output;
}
function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress;
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}
function writeJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(json);
}
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error("request body must be a JSON object");
  return parsed;
}
function respond(res, result) {
  if (result.ok) {
    writeJson(res, 200, { ok: true, ...result.value });
  } else {
    const status = result.error.code === "conflict" ? 409 : result.error.code === "not-found" || result.error.code === "workspace-unknown" ? 404 : 400;
    writeJson(res, status, { ok: false, error: result.error });
  }
}
function makeRoutes(store) {
  const guard = (req, res, method) => {
    if (req.method !== method) {
      writeJson(res, 405, { ok: false, error: { code: "method", message: `method not allowed: ${req.method}` } });
      return false;
    }
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback-only" } });
      return false;
    }
    return true;
  };
  const query = (req, key) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const value = url.searchParams.get(key);
    return value === null ? void 0 : value;
  };
  return [
    // -------------------------------------------------- scenes (list)
    {
      kind: "exact",
      path: "/api/draw2code/scenes",
      handler: async (req, res) => {
        if (!guard(req, res, "GET")) return;
        const root = query(req, "root");
        if (root === void 0) {
          writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root" } });
          return;
        }
        const result = await store.list(root);
        if (result.ok) writeJson(res, 200, { ok: true, scenes: result.value });
        else respond(res, result);
      }
    },
    // --------------------------------------------- active board (shared UI state)
    {
      kind: "exact",
      path: "/api/draw2code/active-board",
      handler: async (req, res) => {
        const method = req.method ?? "";
        if (method === "GET") {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback-only" } });
            return;
          }
          const root = query(req, "root");
          if (root === void 0) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root" } });
            return;
          }
          respond(res, await store.getActiveBoard(root));
          return;
        }
        if (method === "PUT") {
          if (!guard(req, res, "PUT")) return;
          try {
            const body = await readJsonBody(req);
            respond(res, await store.setActiveBoard(String(body.root ?? ""), String(body.name ?? "")));
          } catch (error2) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
          }
          return;
        }
        writeJson(res, 405, { ok: false, error: { code: "method", message: `method not allowed: ${method}` } });
      }
    },
    // ---------------------------------------- verified update reveal request
    {
      kind: "exact",
      path: "/api/draw2code/reveal-request",
      handler: async (req, res) => {
        if (!guard(req, res, "GET")) return;
        const root = query(req, "root");
        if (root === void 0) {
          writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root" } });
          return;
        }
        respond(res, await store.getBoardReveal(root));
      }
    },
    // -------------------------------------------------- scene (read / create / delete)
    {
      kind: "exact",
      path: "/api/draw2code/scene",
      handler: async (req, res) => {
        const method = req.method ?? "";
        if (method === "GET") {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback-only" } });
            return;
          }
          const root = query(req, "root");
          const name2 = query(req, "name");
          if (root === void 0 || name2 === void 0) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root or name" } });
            return;
          }
          const result = await store.read(root, name2);
          if (result.ok) {
            writeJson(res, 200, { ok: true, rev: result.value.rev, scene: result.value.scene });
          } else {
            respond(res, result);
          }
          return;
        }
        if (method === "POST") {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback-only" } });
            return;
          }
          try {
            const body = await readJsonBody(req);
            respond(res, await store.create(String(body.root ?? ""), String(body.name ?? "")));
          } catch (error2) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
          }
          return;
        }
        if (method === "DELETE") {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback-only" } });
            return;
          }
          const root = query(req, "root");
          const name2 = query(req, "name");
          if (root === void 0 || name2 === void 0) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root or name" } });
            return;
          }
          respond(res, await store.remove(root, name2));
          return;
        }
        writeJson(res, 405, { ok: false, error: { code: "method", message: `method not allowed: ${method}` } });
      }
    },
    // -------------------------------------------------- scene (write whole)
    {
      kind: "exact",
      path: "/api/draw2code/scene/write",
      handler: async (req, res) => {
        if (!guard(req, res, "PUT")) return;
        try {
          const body = await readJsonBody(req);
          const baseRev = typeof body.baseRev === "number" ? body.baseRev : void 0;
          respond(res, await store.write(String(body.root ?? ""), String(body.name ?? ""), body.scene, baseRev));
        } catch (error2) {
          writeJson(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
        }
      }
    },
    // -------------------------------------------------- versions (list / restore)
    {
      kind: "exact",
      path: "/api/draw2code/versions",
      handler: async (req, res) => {
        if (!guard(req, res, "GET")) return;
        const root = query(req, "root");
        const name2 = query(req, "name");
        if (root === void 0 || name2 === void 0) {
          writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root or name" } });
          return;
        }
        const result = await store.listVersions(root, name2);
        if (result.ok) writeJson(res, 200, { ok: true, versions: result.value });
        else respond(res, result);
      }
    },
    {
      kind: "exact",
      path: "/api/draw2code/restore",
      handler: async (req, res) => {
        if (!guard(req, res, "POST")) return;
        try {
          const body = await readJsonBody(req);
          respond(res, await store.restoreVersion(String(body.root ?? ""), String(body.name ?? ""), String(body.id ?? "")));
        } catch (error2) {
          writeJson(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
        }
      }
    },
    // -------------------------------------------------- scene export
    {
      kind: "exact",
      path: "/api/draw2code/export",
      handler: async (req, res) => {
        if (!guard(req, res, "POST")) return;
        try {
          const body = await readJsonBody(req);
          if (typeof body.scene !== "object" || body.scene === null || !Array.isArray(body.scene.elements)) {
            writeJson(res, 400, { ok: false, error: { code: "bad-scene", message: "scene.elements must be an array" } });
            return;
          }
          const json = JSON.stringify(body.scene, null, 2);
          if (typeof json !== "string" || Buffer.byteLength(json) > MAX_JSON_BODY_BYTES) {
            writeJson(res, 400, { ok: false, error: { code: "too-large", message: "scene exceeds export size limit" } });
            return;
          }
          const defaultName = typeof body.filename === "string" && body.filename.trim() !== "" ? body.filename.trim() : "prototype.excalidraw";
          const selectedPath = await chooseExportPath(defaultName);
          if (selectedPath === null) {
            writeJson(res, 200, { ok: true, cancelled: true });
            return;
          }
          await writeFile3(selectedPath, `${json}
`, "utf8");
          writeJson(res, 200, { ok: true, exported: true, path: selectedPath });
        } catch (error2) {
          writeJson(res, 500, { ok: false, error: { code: "export-failed", message: error2 instanceof Error ? error2.message : String(error2) } });
        }
      }
    }
  ];
}

// src/create-tool.ts
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/create-flow.ts
var PLATFORM_OPTIONS = [
  { id: "web", label: "Web" },
  { id: "app", label: "App" },
  { id: "both", label: "Web + App" },
  { id: "mini-program", label: "\u5C0F\u7A0B\u5E8F" },
  { id: "unknown", label: "\u8FD8\u6CA1\u60F3\u597D" },
  { id: "other", label: "\u5176\u4ED6" }
];
var USER_OPTIONS = [
  { id: "consumer", label: "\u666E\u901A\u6D88\u8D39\u8005" },
  { id: "professional", label: "\u4E13\u4E1A\u7528\u6237" },
  { id: "team-member", label: "\u56E2\u961F\u6210\u5458" },
  { id: "administrator", label: "\u7BA1\u7406\u5458" },
  { id: "unknown", label: "\u8FD8\u6CA1\u60F3\u597D" },
  { id: "other", label: "\u5176\u4ED6" }
];
var GOAL_OPTIONS = [
  { id: "query", label: "\u67E5\u8BE2\u4FE1\u606F" },
  { id: "record", label: "\u8BB0\u5F55\u5185\u5BB9" },
  { id: "create", label: "\u521B\u5EFA\u5185\u5BB9" },
  { id: "compare", label: "\u6BD4\u8F83\u548C\u9009\u62E9" },
  { id: "transaction", label: "\u5B8C\u6210\u4EA4\u6613" },
  { id: "unknown", label: "\u8FD8\u6CA1\u60F3\u597D" },
  { id: "other", label: "\u5176\u4ED6" }
];
function includesIdea(idea, pattern) {
  return pattern.test(idea);
}
function isSocialIdea(idea) {
  return includesIdea(idea, /陌生人|社交|交友|附近的人|雷达|碰一碰|nfc|好友|聊天/iu);
}
function explicitAnswersFromIdea(idea) {
  const platforms = [];
  if (/小程序/iu.test(idea)) platforms.push("mini-program");
  if (/\bweb\b|网页|网站/iu.test(idea)) platforms.push("web");
  if (/\bapp\b|移动端|手机应用/iu.test(idea)) platforms.push("app");
  if (platforms.length !== 1) return {};
  return {
    "target-platform": {
      questionId: "target-platform",
      values: platforms,
      confirmed: true
    }
  };
}
function goalOptions(idea) {
  if (isSocialIdea(idea)) {
    return [
      { id: "discover-nearby", label: "\u53D1\u73B0\u9644\u8FD1\u7684\u4EBA\u5E76\u5EFA\u7ACB\u8054\u7CFB" },
      { id: "meet-verify", label: "\u7EBF\u4E0B\u89C1\u9762\u540E\u9A8C\u8BC1\u5E76\u6210\u4E3A\u597D\u53CB" },
      { id: "chat-network", label: "\u548C\u5DF2\u5EFA\u7ACB\u8054\u7CFB\u7684\u4EBA\u804A\u5929\u4E92\u52A8" },
      { id: "safety-control", label: "\u5B89\u5168\u5730\u63A7\u5236\u8C01\u53EF\u4EE5\u53D1\u73B0\u548C\u8054\u7CFB\u6211" },
      { id: "unknown", label: "\u8FD8\u6CA1\u60F3\u597D" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  return GOAL_OPTIONS;
}
function moduleOptions(idea) {
  if (isSocialIdea(idea)) {
    return [
      { id: "radar-home", label: "\u96F7\u8FBE\u9996\u9875\uFF08\u626B\u63CF\u9644\u8FD1\u7684\u4EBA\uFF09" },
      { id: "bump-connect", label: "\u78B0\u4E00\u78B0\u9A8C\u8BC1\u4E0E\u52A0\u597D\u53CB" },
      { id: "friends-chat", label: "\u597D\u53CB\u4E0E\u804A\u5929" },
      { id: "profile-history", label: "\u4E2A\u4EBA\u8D44\u6599\u3001\u96F7\u8FBE\u8DB3\u8FF9\u4E0E\u78B0\u4E00\u78B0\u5386\u53F2" },
      { id: "safety-privacy", label: "\u9690\u79C1\u4E0E\u5B89\u5168\u63A7\u5236" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  if (includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu)) {
    return [
      { id: "calendar", label: "\u4E07\u5E74\u5386 / \u65E5\u671F\u67E5\u8BE2" },
      { id: "weather", label: "\u5929\u6C14\u4FE1\u606F" },
      { id: "outfit", label: "\u7A7F\u642D\u63A8\u8350" },
      { id: "wardrobe", label: "\u4E2A\u4EBA\u8863\u6A71" },
      { id: "favorite", label: "\u6536\u85CF\u4E0E\u5206\u4EAB" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  if (includesIdea(idea, /电商|商城|购物|商品|购买/iu)) {
    return [
      { id: "catalog", label: "\u5546\u54C1\u6D4F\u89C8" },
      { id: "search-filter", label: "\u641C\u7D22\u4E0E\u7B5B\u9009" },
      { id: "detail", label: "\u5546\u54C1\u8BE6\u60C5" },
      { id: "cart", label: "\u8D2D\u7269\u8F66" },
      { id: "order", label: "\u8BA2\u5355\u4E0E\u652F\u4ED8" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  return [
    { id: "home", label: "\u9996\u9875 / \u603B\u89C8" },
    { id: "search-filter", label: "\u641C\u7D22\u4E0E\u7B5B\u9009" },
    { id: "create-edit", label: "\u521B\u5EFA\u4E0E\u7F16\u8F91" },
    { id: "detail", label: "\u8BE6\u60C5\u9875" },
    { id: "profile", label: "\u4E2A\u4EBA\u4E2D\u5FC3" },
    { id: "settings", label: "\u8BBE\u7F6E" },
    { id: "other", label: "\u5176\u4ED6" }
  ];
}
function pageOptions(idea) {
  if (isSocialIdea(idea)) {
    return [
      { id: "radar-home", label: "\u96F7\u8FBE\u9996\u9875" },
      { id: "nearby-profile", label: "\u9644\u8FD1\u7528\u6237\u8D44\u6599\u9875" },
      { id: "bump-confirm", label: "\u78B0\u4E00\u78B0\u9A8C\u8BC1\u9875" },
      { id: "friends-chat", label: "\u597D\u53CB\u4E0E\u804A\u5929\u9875" },
      { id: "profile-history", label: "\u4E2A\u4EBA\u4E2D\u5FC3\u4E0E\u8DB3\u8FF9\u9875" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  if (includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu)) {
    return [
      { id: "query", label: "\u65E5\u671F / \u57CE\u5E02\u67E5\u8BE2\u9875" },
      { id: "weather", label: "\u65E5\u671F\u4E0E\u5929\u6C14\u9875" },
      { id: "recommendation", label: "\u7A7F\u642D\u63A8\u8350\u7ED3\u679C\u9875" },
      { id: "outfit-detail", label: "\u7A7F\u642D\u8BE6\u60C5\u9875" },
      { id: "wardrobe", label: "\u4E2A\u4EBA\u8863\u6A71\u9875" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  return [
    { id: "home", label: "\u9996\u9875 / \u603B\u89C8" },
    { id: "core-action", label: "\u6838\u5FC3\u64CD\u4F5C\u9875" },
    { id: "result", label: "\u7ED3\u679C\u9875" },
    { id: "detail", label: "\u8BE6\u60C5\u9875" },
    { id: "profile", label: "\u4E2A\u4EBA\u4E2D\u5FC3" },
    { id: "other", label: "\u5176\u4ED6" }
  ];
}
function flowOptions(idea) {
  if (isSocialIdea(idea)) {
    return [
      { id: "radar-bump-chat", label: "\u96F7\u8FBE\u53D1\u73B0\u9644\u8FD1\u7684\u4EBA \u2192 \u89C1\u9762\u78B0\u4E00\u78B0 \u2192 \u6210\u4E3A\u597D\u53CB \u2192 \u804A\u5929" },
      { id: "radar-profile-meet", label: "\u626B\u63CF\u9644\u8FD1\u7684\u4EBA \u2192 \u67E5\u770B\u8D44\u6599 \u2192 \u51B3\u5B9A\u662F\u5426\u89C1\u9762" },
      { id: "friends-chat", label: "\u8FDB\u5165\u597D\u53CB\u5217\u8868 \u2192 \u9009\u62E9\u597D\u53CB \u2192 \u5F00\u59CB\u804A\u5929" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  if (includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu)) {
    return [
      { id: "daily-outfit", label: "\u9009\u62E9\u65E5\u671F / \u57CE\u5E02 \u2192 \u83B7\u53D6\u5929\u6C14 \u2192 \u67E5\u770B\u7A7F\u642D\u5EFA\u8BAE" },
      { id: "weather-recommendation", label: "\u67E5\u770B\u5929\u6C14 \u2192 \u76F4\u63A5\u83B7\u5F97\u7A7F\u642D\u5EFA\u8BAE" },
      { id: "wardrobe-match", label: "\u9009\u62E9\u8863\u7269 \u2192 \u751F\u6210\u9002\u5408\u5F53\u5929\u7684\u642D\u914D" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  return [
    { id: "browse-result", label: "\u8FDB\u5165\u9996\u9875 \u2192 \u6D4F\u89C8\u5185\u5BB9 \u2192 \u67E5\u770B\u7ED3\u679C" },
    { id: "input-result", label: "\u8F93\u5165\u6761\u4EF6 \u2192 \u63D0\u4EA4 \u2192 \u67E5\u770B\u7ED3\u679C" },
    { id: "create-save", label: "\u521B\u5EFA\u5185\u5BB9 \u2192 \u7F16\u8F91 \u2192 \u4FDD\u5B58" },
    { id: "search-detail", label: "\u641C\u7D22 / \u7B5B\u9009 \u2192 \u67E5\u770B\u8BE6\u60C5 \u2192 \u5B8C\u6210\u64CD\u4F5C" },
    { id: "other", label: "\u5176\u4ED6" }
  ];
}
function questionFor(idea, answers) {
  if (answers["target-platform"] === void 0) {
    return {
      id: "target-platform",
      kind: "choice",
      text: "\u4F60\u51C6\u5907\u5148\u505A\u54EA\u4E2A\u7AEF\uFF1F",
      selectionMode: "single",
      options: PLATFORM_OPTIONS,
      allowOther: true
    };
  }
  if (answers["core-user"] === void 0) {
    return {
      id: "core-user",
      kind: "choice",
      text: "\u8FD9\u4E2A\u5DE5\u5177\u4E3B\u8981\u670D\u52A1\u8C01\uFF1F",
      selectionMode: "single",
      options: USER_OPTIONS,
      allowOther: true
    };
  }
  if (answers["core-goal"] === void 0) {
    return {
      id: "core-goal",
      kind: "choice",
      text: "\u9996\u7248\u6700\u91CD\u8981\u7684\u662F\u5E2E\u52A9\u7528\u6237\u5B8C\u6210\u4EC0\u4E48\uFF1F",
      selectionMode: "single",
      options: goalOptions(idea),
      allowOther: true
    };
  }
  if (answers["core-flow"] === void 0) {
    return {
      id: "core-flow",
      kind: "choice",
      text: "\u7528\u6237\u6700\u91CD\u8981\u7684\u4E00\u6761\u4F7F\u7528\u6D41\u7A0B\u662F\u4EC0\u4E48\uFF1F",
      selectionMode: "single",
      options: flowOptions(idea),
      allowOther: true
    };
  }
  if (answers["core-modules"] === void 0) {
    return {
      id: "core-modules",
      kind: "choice",
      text: "\u7B2C\u4E00\u7248\u9700\u8981\u5305\u542B\u54EA\u4E9B\u6838\u5FC3\u6A21\u5757\uFF1F\u53EF\u4EE5\u591A\u9009\u3002",
      selectionMode: "multiple",
      options: moduleOptions(idea),
      allowOther: true,
      minSelections: 1,
      maxSelections: 5
    };
  }
  if (answers["core-pages"] === void 0) {
    return {
      id: "core-pages",
      kind: "choice",
      text: "\u9996\u8F6E\u539F\u578B\u8981\u753B\u54EA\u4E9B\u6838\u5FC3\u9875\u9762\uFF1F\u8BF7\u9009\u62E9 3\u20135 \u4E2A\u3002",
      selectionMode: "multiple",
      options: pageOptions(idea),
      allowOther: true,
      minSelections: 3,
      maxSelections: 5
    };
  }
  return null;
}
function questionById(idea, questionId) {
  const questions = [
    questionFor(idea, {}),
    questionFor(idea, { "target-platform": { questionId: "target-platform", values: ["web"], confirmed: true } }),
    questionFor(idea, {
      "target-platform": { questionId: "target-platform", values: ["web"], confirmed: true },
      "core-user": { questionId: "core-user", values: ["consumer"], confirmed: true }
    }),
    questionFor(idea, {
      "target-platform": { questionId: "target-platform", values: ["web"], confirmed: true },
      "core-user": { questionId: "core-user", values: ["consumer"], confirmed: true },
      "core-goal": { questionId: "core-goal", values: ["query"], confirmed: true }
    }),
    questionFor(idea, {
      "target-platform": { questionId: "target-platform", values: ["web"], confirmed: true },
      "core-user": { questionId: "core-user", values: ["consumer"], confirmed: true },
      "core-goal": { questionId: "core-goal", values: ["query"], confirmed: true },
      "core-flow": { questionId: "core-flow", values: ["browse-result"], confirmed: true }
    }),
    questionFor(idea, {
      "target-platform": { questionId: "target-platform", values: ["web"], confirmed: true },
      "core-user": { questionId: "core-user", values: ["consumer"], confirmed: true },
      "core-goal": { questionId: "core-goal", values: ["query"], confirmed: true },
      "core-flow": { questionId: "core-flow", values: ["browse-result"], confirmed: true },
      "core-modules": { questionId: "core-modules", values: ["home"], confirmed: true }
    })
  ];
  return questions.find((question) => question?.id === questionId) ?? null;
}
function selectedLabels(question, values) {
  return values.map((id) => question.options.find((option) => option.id === id)?.label ?? id);
}
function selectedAnswerLabels(question, answer) {
  if (answer === void 0) return [];
  const labels = selectedLabels(question, answer.values.filter((id) => id !== "other"));
  if (answer.values.includes("other") && answer.otherText?.trim()) labels.push(answer.otherText.trim());
  return labels;
}
function deriveComponents(idea, modules) {
  const labels = /* @__PURE__ */ new Map([
    ["calendar", "\u65E5\u671F\u9009\u62E9\u5668"],
    ["weather", "\u5929\u6C14\u4FE1\u606F\u5361"],
    ["outfit", "\u7A7F\u642D\u63A8\u8350\u5361"],
    ["wardrobe", "\u8863\u6A71\u5217\u8868"],
    ["favorite", "\u6536\u85CF / \u5206\u4EAB\u64CD\u4F5C"],
    ["catalog", "\u5546\u54C1\u5217\u8868"],
    ["search-filter", "\u641C\u7D22\u4E0E\u7B5B\u9009\u5668"],
    ["detail", "\u8BE6\u60C5\u5361\u7247"],
    ["cart", "\u8D2D\u7269\u8F66\u6458\u8981"],
    ["order", "\u8BA2\u5355\u4E0E\u652F\u4ED8\u64CD\u4F5C"],
    ["home", "\u9996\u9875\u603B\u89C8\u5361\u7247"],
    ["create-edit", "\u521B\u5EFA / \u7F16\u8F91\u8868\u5355"],
    ["profile", "\u7528\u6237\u8D44\u6599\u5361"],
    ["settings", "\u8BBE\u7F6E\u5217\u8868"],
    ["radar-home", "\u96F7\u8FBE\u626B\u63CF\u4E0E\u9644\u8FD1\u7528\u6237\u5206\u5E03"],
    ["bump-connect", "\u78B0\u4E00\u78B0\u9A8C\u8BC1\u4E0E\u52A0\u597D\u53CB\u64CD\u4F5C"],
    ["friends-chat", "\u597D\u53CB\u5217\u8868\u4E0E\u804A\u5929"],
    ["profile-history", "\u4E2A\u4EBA\u8D44\u6599\u3001\u96F7\u8FBE\u8DB3\u8FF9\u4E0E\u78B0\u4E00\u78B0\u5386\u53F2"],
    ["safety-privacy", "\u9690\u79C1\u4E0E\u5B89\u5168\u63A7\u5236"]
  ]);
  return modules.map((id) => ({
    type: id,
    label: labels.get(id) ?? `${id} \u6A21\u5757`
  })).concat(idea.trim() === "" ? [] : [{ type: "navigation", label: "\u9875\u9762\u5BFC\u822A\u4E0E\u4E3B\u6D41\u7A0B\u7BAD\u5934" }]);
}
var SOCIAL_PAGE_MOCK_DATA = {
  "radar-home": {
    minimumRecords: 3,
    requiredContent: ["\u5F53\u524D\u626B\u63CF\u72B6\u6001\u4E0E\u9644\u8FD1\u4EBA\u6570", "\u81F3\u5C11 3 \u4E2A\u9644\u8FD1\u7528\u6237\u7684\u6635\u79F0\u548C\u8DDD\u79BB", "\u4E3B\u64CD\u4F5C\u4E0E\u91CD\u65B0\u626B\u63CF\u64CD\u4F5C"],
    examples: ["\u6797\u5C0F\u6EE1 \xB7 300m", "\u5468\u53EF\u4E50 \xB7 500m", "\u9648\u4E00\u5DDD \xB7 800m"]
  },
  "nearby-profile": {
    minimumRecords: 3,
    requiredContent: ["\u7528\u6237\u6635\u79F0\u3001\u8DDD\u79BB\u548C\u5728\u7EBF\u72B6\u6001", "\u81F3\u5C11 3 \u9879\u4E2A\u4EBA\u8D44\u6599\u6216\u5174\u8DA3\u6807\u7B7E", "\u89C1\u9762\u6216\u8FD4\u56DE\u96F7\u8FBE\u64CD\u4F5C"],
    examples: ["\u6797\u5C0F\u6EE1 \xB7 \u8DDD\u4F60 300m", "\u6444\u5F71", "\u5468\u672B\u5F92\u6B65"]
  },
  "bump-confirm": {
    minimumRecords: 3,
    requiredContent: ["\u78B0\u4E00\u78B0\u5BF9\u8C61\u6635\u79F0", "\u7B49\u5F85\u3001\u8BC6\u522B\u4E0E\u6210\u529F\u7ED3\u679C\u4E2D\u7684\u81F3\u5C11 3 \u6761\u72B6\u6001\u4FE1\u606F", "\u5F00\u59CB\u804A\u5929\u4E0E\u7A0D\u540E\u518D\u804A\u64CD\u4F5C"],
    examples: ["\u6B63\u5728\u8BC6\u522B\u9644\u8FD1\u8BBE\u5907\u2026", "\u5DF2\u786E\u8BA4\uFF1A\u6797\u5C0F\u6EE1", "14:20 \u6210\u4E3A\u597D\u53CB"]
  },
  "friends-chat": {
    minimumRecords: 3,
    requiredContent: ["\u81F3\u5C11 3 \u4F4D\u597D\u53CB\u7684\u6635\u79F0\u3001\u6700\u8FD1\u6D88\u606F\u548C\u65F6\u95F4", "\u804A\u5929\u6807\u9898\u4E0E\u5728\u7EBF\u72B6\u6001", "\u81F3\u5C11 3 \u6761\u53EF\u8BFB\u7684\u53CC\u65B9\u5BF9\u8BDD\u548C\u6D88\u606F\u8F93\u5165\u64CD\u4F5C"],
    examples: ["\u6797\u5C0F\u6EE1 \xB7 \u5468\u672B\u4E00\u8D77\u53BB\u5F92\u6B65\u5417\uFF1F \xB7 18:42", "\u5468\u53EF\u4E50 \xB7 \u78B0\u4E00\u78B0\u6210\u529F\u5566 \xB7 14:20", "\u9648\u4E00\u5DDD \xB7 \u4E0B\u6B21\u4E00\u8D77\u559D\u5496\u5561 \xB7 \u6628\u5929"]
  },
  "profile-history": {
    minimumRecords: 3,
    requiredContent: ["\u7528\u6237\u6635\u79F0\u4E0E\u96F7\u8FBE ID", "\u597D\u53CB\u6570\u3001\u8DB3\u8FF9\u6570\u3001\u78B0\u4E00\u78B0\u6B21\u6570", "\u81F3\u5C11 3 \u6761\u8DB3\u8FF9\u6216\u78B0\u4E00\u78B0\u5386\u53F2\u8BB0\u5F55"],
    examples: ["\u597D\u53CB 12", "\u96F7\u8FBE\u8DB3\u8FF9 38 \u5904", "\u4ECA\u5929 14:20 \xB7 \u5496\u5561\u5E97 \xB7 \u6797\u5C0F\u6EE1"]
  }
};
var CALENDAR_PAGE_MOCK_DATA = {
  query: {
    minimumRecords: 3,
    requiredContent: ["\u5DF2\u9009\u57CE\u5E02\u548C\u65E5\u671F", "\u5B8C\u6574\u53EF\u8BFB\u7684\u5F53\u6708\u65E5\u671F\u7F51\u683C", "\u8282\u6C14\u3001\u8282\u5047\u65E5\u6216\u5B9C\u5FCC\u6458\u8981"],
    examples: ["\u676D\u5DDE", "2026 \u5E74 6 \u6708 21 \u65E5", "\u590F\u81F3 \xB7 \u5B9C\u51FA\u884C"]
  },
  weather: {
    minimumRecords: 3,
    requiredContent: ["\u65E5\u671F\u4E0E\u57CE\u5E02", "\u6E29\u5EA6\u548C\u5929\u6C14\u72B6\u6001", "\u98CE\u529B\u3001\u6E7F\u5EA6\u6216\u964D\u6C34\u7B49\u81F3\u5C11 3 \u9879\u5929\u6C14\u6307\u6807"],
    examples: ["\u676D\u5DDE \xB7 6 \u6708 21 \u65E5", "26\u201332\xB0C \xB7 \u591A\u4E91", "\u4E1C\u5357\u98CE 3 \u7EA7 \xB7 \u6E7F\u5EA6 68%"]
  },
  recommendation: {
    minimumRecords: 3,
    requiredContent: ["\u63A8\u8350\u7406\u7531", "\u81F3\u5C11 3 \u4EF6\u5177\u4F53\u670D\u9970\u6216\u914D\u4EF6", "\u6536\u85CF\u3001\u6362\u4E00\u5957\u6216\u67E5\u770B\u8BE6\u60C5\u64CD\u4F5C"],
    examples: ["\u4E9A\u9EBB\u77ED\u8896", "\u6D45\u8272\u4F11\u95F2\u88E4", "\u9632\u6652\u5E3D"]
  },
  "outfit-detail": {
    minimumRecords: 3,
    requiredContent: ["\u642D\u914D\u540D\u79F0\u4E0E\u9002\u7528\u573A\u666F", "\u81F3\u5C11 3 \u4EF6\u5355\u54C1\u53CA\u7A7F\u642D\u8BF4\u660E", "\u5929\u6C14\u9002\u914D\u6216\u6CE8\u610F\u4E8B\u9879"],
    examples: ["\u901A\u52E4\u6E05\u723D\u642D\u914D", "\u4E9A\u9EBB\u77ED\u8896 \xB7 \u900F\u6C14", "\u8F7B\u8584\u5916\u5957 \xB7 \u5E94\u5BF9\u7A7A\u8C03\u623F"]
  },
  wardrobe: {
    minimumRecords: 3,
    requiredContent: ["\u5206\u7C7B\u4E0E\u7B5B\u9009\u72B6\u6001", "\u81F3\u5C11 3 \u4EF6\u8863\u7269\u7684\u540D\u79F0\u3001\u7C7B\u522B\u548C\u72B6\u6001", "\u65B0\u589E\u8863\u7269\u6216\u9009\u62E9\u642D\u914D\u64CD\u4F5C"],
    examples: ["\u767D\u8272\u4E9A\u9EBB\u886C\u886B \xB7 \u4E0A\u88C5 \xB7 \u53EF\u7A7F", "\u5361\u5176\u4F11\u95F2\u88E4 \xB7 \u4E0B\u88C5 \xB7 \u53EF\u7A7F", "\u8F7B\u8584\u98CE\u8863 \xB7 \u5916\u5957 \xB7 \u5F85\u6E05\u6D17"]
  }
};
var GENERIC_PAGE_MOCK_DATA = {
  home: {
    minimumRecords: 3,
    requiredContent: ["\u5F53\u524D\u72B6\u6001\u6216\u6458\u8981", "\u81F3\u5C11 3 \u6761\u5177\u6709\u771F\u5B9E\u8BED\u4E49\u7684\u5185\u5BB9\u8BB0\u5F55", "\u6E05\u6670\u7684\u9996\u8981\u64CD\u4F5C"],
    examples: ["\u4ECA\u65E5\u65B0\u589E 6 \u6761", "\u5F85\u5904\u7406 3 \u6761", "\u6700\u8FD1\u66F4\u65B0\u4E8E 10:30"]
  },
  "core-action": {
    minimumRecords: 3,
    requiredContent: ["\u5F53\u524D\u64CD\u4F5C\u5BF9\u8C61", "\u81F3\u5C11 3 \u4E2A\u5DF2\u586B\u5199\u7684\u5173\u952E\u5B57\u6BB5\u6216\u6B65\u9AA4\u72B6\u6001", "\u63D0\u4EA4\u4E0E\u53D6\u6D88\u64CD\u4F5C"],
    examples: ["\u5F53\u524D\u5BF9\u8C61\uFF1A\u793A\u4F8B\u8BB0\u5F55", "\u6B65\u9AA4 2 / 3", "\u5DF2\u586B\u5199 4 \u9879"]
  },
  result: {
    minimumRecords: 3,
    requiredContent: ["\u7ED3\u679C\u6807\u9898\u4E0E\u6458\u8981", "\u81F3\u5C11 3 \u6761\u7ED3\u679C\u8BB0\u5F55\u6216\u6307\u6807", "\u7EE7\u7EED\u64CD\u4F5C\u6216\u8FD4\u56DE\u5165\u53E3"],
    examples: ["\u5171\u627E\u5230 12 \u6761\u7ED3\u679C", "\u63A8\u8350\u7ED3\u679C A \xB7 \u5339\u914D\u5EA6 92%", "\u63A8\u8350\u7ED3\u679C B \xB7 \u5339\u914D\u5EA6 87%"]
  },
  detail: {
    minimumRecords: 3,
    requiredContent: ["\u5BF9\u8C61\u540D\u79F0\u4E0E\u5F53\u524D\u72B6\u6001", "\u81F3\u5C11 3 \u9879\u5173\u952E\u5C5E\u6027\u6216\u8BB0\u5F55", "\u4E3B\u8981\u64CD\u4F5C\u4E0E\u8FD4\u56DE\u5165\u53E3"],
    examples: ["\u793A\u4F8B\u5BF9\u8C61 \xB7 \u8FDB\u884C\u4E2D", "\u521B\u5EFA\u4E8E 6 \u6708 21 \u65E5", "\u8D1F\u8D23\u4EBA\uFF1A\u6797\u5C0F\u6EE1"]
  },
  profile: {
    minimumRecords: 3,
    requiredContent: ["\u7528\u6237\u540D\u79F0\u4E0E\u8EAB\u4EFD\u4FE1\u606F", "\u81F3\u5C11 3 \u9879\u7EDF\u8BA1\u6216\u4E2A\u4EBA\u8D44\u6599", "\u8BBE\u7F6E\u6216\u9000\u51FA\u64CD\u4F5C"],
    examples: ["\u6797\u5C0F\u6EE1", "\u5DF2\u5B8C\u6210 28 \u9879", "\u8FDE\u7EED\u4F7F\u7528 7 \u5929"]
  }
};
function derivePageMockData(idea, pageIds) {
  const pageLabels = new Map(pageOptions(idea).map((option) => [option.id, option.label]));
  const domainSpecs = isSocialIdea(idea) ? SOCIAL_PAGE_MOCK_DATA : includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu) ? CALENDAR_PAGE_MOCK_DATA : GENERIC_PAGE_MOCK_DATA;
  return pageIds.map((pageId) => {
    const spec = domainSpecs[pageId] ?? GENERIC_PAGE_MOCK_DATA[pageId] ?? {
      minimumRecords: 3,
      requiredContent: ["\u9875\u9762\u76EE\u7684\u8BF4\u660E", "\u81F3\u5C11 3 \u6761\u5177\u6709\u771F\u5B9E\u8BED\u4E49\u7684\u793A\u4F8B\u8BB0\u5F55", "\u6E05\u6670\u7684\u4E3B\u8981\u64CD\u4F5C\u548C\u72B6\u6001\u53CD\u9988"],
      examples: ["\u793A\u4F8B\u8BB0\u5F55 1 \xB7 \u5DF2\u5B8C\u6210", "\u793A\u4F8B\u8BB0\u5F55 2 \xB7 \u8FDB\u884C\u4E2D", "\u793A\u4F8B\u8BB0\u5F55 3 \xB7 \u5F85\u5904\u7406"]
    };
    return {
      pageId,
      page: pageLabels.get(pageId) ?? pageId,
      ...spec
    };
  });
}
function buildBrief(idea, answers, deferredStyleNote) {
  const read = (id) => answers[id];
  const targetQuestion = questionFor(idea, {});
  const userQuestion = questionFor(idea, { "target-platform": read("target-platform") });
  const goalQuestion = questionFor(idea, {
    "target-platform": read("target-platform"),
    "core-user": read("core-user")
  });
  const flowQuestion = questionFor(idea, {
    "target-platform": read("target-platform"),
    "core-user": read("core-user"),
    "core-goal": read("core-goal")
  });
  const moduleQuestion = questionFor(idea, {
    "target-platform": read("target-platform"),
    "core-user": read("core-user"),
    "core-goal": read("core-goal"),
    "core-flow": read("core-flow")
  });
  const pageQuestion = questionFor(idea, {
    "target-platform": read("target-platform"),
    "core-user": read("core-user"),
    "core-goal": read("core-goal"),
    "core-flow": read("core-flow"),
    "core-modules": read("core-modules")
  });
  const modules = read("core-modules")?.values ?? [];
  const pages = read("core-pages")?.values ?? [];
  const pendingDecisions = [];
  const questionPairs = [
    [targetQuestion, read("target-platform")],
    [userQuestion, read("core-user")],
    [goalQuestion, read("core-goal")],
    [flowQuestion, read("core-flow")],
    [moduleQuestion, read("core-modules")],
    [pageQuestion, read("core-pages")]
  ];
  for (const [question, answer] of questionPairs) {
    if (answer?.values.includes("unknown")) pendingDecisions.push(`${question.text}\uFF08\u7528\u6237\u6682\u672A\u51B3\u5B9A\uFF09`);
    if (answer?.confirmed === false && answer.otherText !== void 0) pendingDecisions.push(`${question.text}\uFF08\u4FDD\u7559\u7528\u6237\u539F\u8BDD\uFF0C\u6682\u4E0D\u63A8\u65AD\uFF09`);
  }
  return {
    originalIdea: idea,
    targetPlatform: selectedAnswerLabels(targetQuestion, read("target-platform"))[0] ?? null,
    users: selectedAnswerLabels(userQuestion, read("core-user")),
    goal: selectedAnswerLabels(goalQuestion, read("core-goal"))[0] ?? null,
    coreFlow: {
      labels: selectedAnswerLabels(flowQuestion, read("core-flow")),
      userText: read("core-flow")?.otherText ?? read("core-flow")?.normalizedText ?? null
    },
    modules: selectedAnswerLabels(moduleQuestion, read("core-modules")),
    moduleIds: modules,
    pages: selectedAnswerLabels(pageQuestion, read("core-pages")),
    pageIds: pages,
    components: deriveComponents(idea, modules),
    mockDataPolicy: {
      rule: "\u5217\u8868\u3001\u804A\u5929\u3001\u56FE\u8868\u3001\u8BE6\u60C5\u548C\u72B6\u6001\u7EC4\u4EF6\u5FC5\u987B\u5C55\u793A\u771F\u5B9E\u793A\u4F8B\u5185\u5BB9\uFF0C\u4E0D\u80FD\u4F7F\u7528\u7A7A\u767D\u65B9\u6846\u3001Lorem ipsum\u3001\u7528\u6237A\u6216\u65E0\u542B\u4E49\u5360\u4F4D\u7B26\u4EE3\u66FF",
      minimumRecordsPerRepeatedComponent: 3,
      visibility: "mock \u6570\u636E\u5FC5\u987B\u4F7F\u7528\u9996\u6B21\u6E32\u67D3\u5373\u53EF\u89C1\u7684\u72EC\u7ACB text \u5143\u7D20\uFF1B\u5217\u8868\u884C\u9700\u540C\u65F6\u4F53\u73B0\u5BF9\u8C61\u3001\u72B6\u6001\u548C\u5173\u952E\u4E0A\u4E0B\u6587",
      updateContract: "\u5B8C\u6574\u9875\u9762 frame \u8BBE\u7F6E customData.role=prototype-page \u548C customData.mockDataMin\uFF1B\u6BCF\u6761\u793A\u4F8B\u5185\u5BB9\u7684 text \u8BBE\u7F6E customData.role=mock-data"
    },
    pageMockData: derivePageMockData(idea, pages),
    interactions: ["\u9875\u9762\u4E4B\u95F4\u7528 Arrow \u8868\u8FBE\u6838\u5FC3\u6210\u529F\u8DEF\u5F84", "\u9996\u8F6E\u53EA\u9A8C\u8BC1\u9ED8\u8BA4\u6210\u529F\u8DEF\u5F84"],
    assumptions: [
      "\u9996\u8F6E\u539F\u578B\u9650\u5236\u4E3A 3\u20135 \u4E2A\u6838\u5FC3\u9875\u9762",
      "\u9996\u8F6E\u53EA\u7ED8\u5236\u9ED8\u8BA4\u6210\u529F\u8DEF\u5F84\uFF0C\u4E0D\u5C55\u5F00\u52A0\u8F7D\u3001\u7A7A\u72B6\u6001\u548C\u9519\u8BEF\u72B6\u6001",
      "\u6BCF\u4E2A\u91CD\u590D\u5185\u5BB9\u7EC4\u4EF6\u81F3\u5C11\u586B\u5145 3 \u6761\u53EF\u8BFB mock \u6570\u636E\uFF1B\u4F4E\u4FDD\u771F\u964D\u4F4E\u89C6\u89C9\u7CBE\u5EA6\uFF0C\u4F46\u4E0D\u7701\u7565\u7406\u89E3\u4EA7\u54C1\u6240\u9700\u7684\u4FE1\u606F",
      "\u539F\u578B\u4F7F\u7528\u8BED\u4E49\u5316\u4F4E\u4FDD\u771F\uFF0C\u4E0D\u5904\u7406\u54C1\u724C\u8272\u3001\u5B57\u4F53\u548C\u89C6\u89C9\u98CE\u683C\uFF1B\u53EF\u7528\u514B\u5236\u7684\u8BED\u4E49\u8272\u533A\u5206\u7C7B\u522B\u3001\u72B6\u6001\u548C\u4E3B\u8981\u64CD\u4F5C",
      "\u89C6\u89C9\u98CE\u683C\u548C\u524D\u7AEF\u6280\u672F\u5B9E\u73B0\u5EF6\u8FDF\u5230 draw2code_generate \u9636\u6BB5",
      ...pendingDecisions.map((item) => `${item}\uFF1B\u9996\u7248\u91C7\u7528\u6700\u5C0F\u5408\u7406\u9ED8\u8BA4\u503C\uFF0C\u5E76\u5728\u540E\u7EED\u8FED\u4EE3\u4E2D\u8865\u5145`)
    ],
    pendingDecisions,
    deferredStyleNote,
    pendingQuestions: [
      "\u52A0\u8F7D\u3001\u7A7A\u72B6\u6001\u548C\u9519\u8BEF\u72B6\u6001\u5C06\u5728\u540E\u7EED\u539F\u578B\u8FED\u4EE3\u4E2D\u8865\u5145",
      "\u767B\u5F55\u3001\u4E2A\u4EBA\u4E2D\u5FC3\u548C\u7BA1\u7406\u540E\u53F0\u4E0D\u5C5E\u4E8E\u9996\u8F6E\u6838\u5FC3\u95ED\u73AF\uFF0C\u9664\u975E\u7528\u6237\u53E6\u884C\u786E\u8BA4"
    ]
  };
}
function interpretOther(question, text3) {
  const trimmed = text3.trim();
  if (question.id === "target-platform" && /小程序/iu.test(trimmed)) {
    return "\u9996\u7248\u4F18\u5148\u505A\u5C0F\u7A0B\u5E8F\uFF0CWeb \u4F5C\u4E3A\u540E\u7EED\u6269\u5C55\u7AEF";
  }
  if (question.id === "core-flow") return `\u6838\u5FC3\u6D41\u7A0B\u6309\u7528\u6237\u63CF\u8FF0\uFF1A${trimmed}`;
  return `\u6309\u7528\u6237\u63CF\u8FF0\u5904\u7406\uFF1A${trimmed}`;
}

// src/create-tool.ts
function text(value) {
  return [{ type: "text", text: value }];
}
function continuation(value) {
  return [
    "[draw2code_create continuation]",
    `sessionId=${value.sessionId ?? ""}`,
    `revision=${value.revision ?? ""}`
  ].join(" ");
}
function clone2(value) {
  return JSON.parse(JSON.stringify(value));
}
var PROJECT_NAME_MAX_LENGTH = 16;
var PROJECT_NAME_RE = /^[\w\u4e00-\u9fa5][\w\u4e00-\u9fa5 -]*$/u;
function normalizeProjectName(value) {
  return value.trim().replace(/\s+/gu, " ");
}
function projectNameValidationError(value, rawIdea) {
  if (value === "") return "projectName \u4E0D\u80FD\u4E3A\u7A7A";
  if (rawIdea !== void 0 && value === normalizeProjectName(rawIdea)) {
    return "projectName \u4E0D\u80FD\u76F4\u63A5\u590D\u5236\u5B8C\u6574 idea\uFF1B\u8BF7\u7406\u89E3\u5B8C\u6574\u9700\u6C42\u540E\u91CD\u65B0\u6982\u62EC\u4EA7\u54C1\u540D\u79F0";
  }
  if (value.length > PROJECT_NAME_MAX_LENGTH) {
    return `projectName \u6700\u591A ${PROJECT_NAME_MAX_LENGTH} \u4E2A\u5B57\u7B26\uFF1B\u8BF7\u57FA\u4E8E\u5B8C\u6574\u9700\u6C42\u91CD\u65B0\u6982\u62EC\uFF0C\u4E0D\u8981\u622A\u53D6\u539F\u8BDD\u524D ${PROJECT_NAME_MAX_LENGTH} \u4E2A\u5B57\u7B26`;
  }
  if (/(?:\s*-\s*)?原型$/u.test(value)) return "projectName \u53EA\u5199\u4EA7\u54C1\u540D\u79F0\uFF0C\u4E0D\u8981\u6DFB\u52A0\u201C\u539F\u578B\u201D\u540E\u7F00";
  if (!PROJECT_NAME_RE.test(value)) return "projectName \u53EA\u80FD\u5305\u542B\u4E2D\u82F1\u6587\u3001\u6570\u5B57\u3001\u7A7A\u683C\u3001\u8FDE\u5B57\u7B26\u548C\u4E0B\u5212\u7EBF";
  return null;
}
function boardNameFromProject(projectName, existing) {
  const base = projectName;
  if (!existing.has(base)) return base;
  for (let index = 2; index < 1e3; index += 1) {
    const candidate = `${base} ${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base} ${Date.now()}`;
}
function requestKey(args) {
  return JSON.stringify({
    action: args.action,
    sessionId: args.sessionId ?? null,
    revision: args.revision ?? null,
    questionId: args.questionId ?? null,
    values: args.values ?? [],
    otherText: args.otherText ?? null,
    projectName: args.projectName ?? null
  });
}
function draftStatus(draft) {
  if (draft.status === "draft") return draft.currentQuestion === null ? "ready" : "question";
  return draft.status;
}
function responseFor(projects, draft, extras = {}) {
  const response = {
    status: draftStatus(draft),
    sessionId: draft.projectId,
    projectId: draft.projectId,
    projectName: draft.projectName,
    projectFile: projects.fileName(draft.projectId),
    revision: draft.revision,
    ...draft.currentQuestion === null ? {} : { question: draft.currentQuestion },
    ...draft.brief === null ? {} : { brief: draft.brief, assumptions: draft.brief.assumptions ?? [] },
    ...draft.boardName === null ? {} : { boardName: draft.boardName },
    ...extras
  };
  return response;
}
function errorResponse(code, message, current) {
  return {
    status: "error",
    error: { code, message, recoverable: code !== "invalid_action" },
    ...current === void 0 ? {} : {
      current: {
        sessionId: current.projectId,
        revision: current.revision,
        status: draftStatus(current),
        question: current.currentQuestion
      }
    }
  };
}
function questionFromDraft(draft, questionId) {
  if (draft.currentQuestion !== null && draft.currentQuestion.id === questionId) {
    return draft.currentQuestion;
  }
  return questionById(draft.originalIdea, questionId);
}
function validateValues(question, values, otherText) {
  if (values.length === 0) return "\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u7B54\u6848";
  if (question.selectionMode === "single" && values.length !== 1) return "\u8FD9\u4E2A\u95EE\u9898\u53EA\u80FD\u9009\u62E9\u4E00\u4E2A\u7B54\u6848";
  if (question.minSelections !== void 0 && values.length < question.minSelections) return `\u81F3\u5C11\u9009\u62E9 ${question.minSelections} \u9879`;
  if (question.maxSelections !== void 0 && values.length > question.maxSelections) return `\u6700\u591A\u9009\u62E9 ${question.maxSelections} \u9879`;
  const allowed = new Set(question.options.map((option) => option.id));
  const invalid = values.find((value) => !allowed.has(value));
  if (invalid !== void 0) return `\u9009\u9879 "${invalid}" \u4E0D\u5728\u5F53\u524D\u95EE\u9898\u7684\u5019\u9009\u7B54\u6848\u4E2D`;
  if (values.includes("other") && (otherText === void 0 || otherText.trim() === "")) return "\u9009\u62E9\u201C\u5176\u4ED6\u201D\u65F6\u9700\u8981\u8865\u5145\u8BF4\u660E";
  return null;
}
function nextAfterAnswer(draft) {
  return questionFor(draft.originalIdea, draft.answers);
}
function addHistory(draft, action, questionId, values, otherText) {
  draft.history = [
    ...draft.history,
    {
      revision: draft.revision,
      action,
      at: Date.now(),
      ...questionId === void 0 ? {} : { questionId },
      ...values === void 0 ? {} : { values },
      ...otherText === void 0 ? {} : { otherText }
    }
  ].slice(-100);
}
function clearDownstreamAnswers(draft, questionId) {
  const order = ["target-platform", "core-user", "core-goal", "core-flow", "core-modules", "core-pages"];
  const index = order.indexOf(questionId);
  if (index < 0) return;
  for (const id of order.slice(index + 1)) delete draft.answers[id];
}
async function persistMutation(projects, root, draft, expectedRevision, key, response) {
  draft.revision = expectedRevision + 1;
  draft.lastRequestKey = key;
  response.revision = draft.revision;
  draft.lastResponse = response;
  const saved = await projects.save(root, draft, expectedRevision);
  if (!saved.ok) return errorResponse(saved.error.code, saved.error.message, saved.error.current);
  response.revision = saved.value.revision;
  response.projectName = saved.value.projectName;
  response.projectFile = projects.fileName(saved.value.projectId);
  return response;
}
async function loadSession(projects, root, sessionId) {
  if (sessionId === void 0 || sessionId.trim() === "") return null;
  const result = await projects.read(root, sessionId);
  return result.ok ? result.value : null;
}
function initialDraft(idea, projectName, styleNote, projectId) {
  const answers = explicitAnswersFromIdea(idea);
  return {
    projectId,
    projectName,
    originalIdea: idea.trim(),
    status: "draft",
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    boardName: null,
    deferredStyleNote: styleNote,
    answers,
    currentQuestion: questionFor(idea, answers),
    pendingInterpretation: null,
    brief: null,
    history: [{ revision: 1, action: "start", at: Date.now() }]
  };
}
function draw2codeCreateTool(projects, scenes) {
  return defineTool({
    name: "draw2code_create",
    description: "Create a new \u753B\u7801 project through a stateful, choice-first grilling flow. This is the mandatory entry point when the user says they want to create, build, or design a new product from scratch. Call action=start as soon as a new-project intent is clear, even when the idea is incomplete; pass the user's idea faithfully without speculative expansion, infer a concise semantic projectName from the entire idea, and do not call draw2code_update first. Never obtain projectName by copying or clipping the beginning of idea. Explicit App/Web/mini-program wording is prefilled and must not be asked again. After every question result, call the host ask_user_question interaction with exactly one question and every returned choice, including \u201C\u8FD8\u6CA1\u60F3\u597D\u201D and \u201C\u5176\u4ED6\u201D; never truncate or silently replace options, so the user can select instead of typing. Map the selected label back to its option id, then call this tool again; only use the numbered text fallback when ask_user_question is unavailable. Use action=answer for a choice, action=revise to change an earlier answer, action=rename to accept a project-name edit, action=resume to reopen a draft, action=list to show unfinished projects, and action=confirm only after the user confirms the ready brief. The tool stores product intent separately from scene files. It creates an isolated empty board only after confirmation and returns nextAction=draw2code_update; the model must then call draw2code_update with the returned boardName. projectName is required for action=start, should usually be 4\u201312 Chinese characters, and becomes the board name directly; never append \u201C\u539F\u578B\u201D or another workflow suffix. The tool validates this Agent-authored name but does not derive it from the raw idea. The prototype is semantic low-fi: do not ask for brand colors, fonts, 3D/2D, flat/skeuomorphic style here, but restrained semantic tones for categories, states, and primary actions are encouraged. If the user volunteers a style preference, pass it as styleNote so it is deferred to draw2code_generate. Options are structured for native choice cards when available; otherwise render them as numbered choices. \u201COther\u201D requires text and is stored directly; the ready brief is the single confirmation checkpoint, so never add a redundant per-answer paraphrase confirmation.",
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      action: {
        type: "string",
        required: true,
        enum: ["start", "answer", "revise", "rename", "resume", "list", "confirm", "abandon", "archive"],
        description: "State-machine action for draw2code_create."
      },
      idea: { type: "string", description: "The user\u2019s new-project idea. Required for action=start." },
      projectName: { type: "string", description: "Agent-inferred semantic product name. Required for action=start; usually 4\u201312 Chinese characters, never copied or clipped from the raw idea, and without an \u201C\u539F\u578B\u201D suffix. Also used as the replacement name for action=rename." },
      styleNote: { type: "string", description: "A style preference volunteered by the user; record for generate, never apply to the prototype." },
      sessionId: { type: "string", description: "Project session ID returned by a prior call." },
      revision: { type: "integer", description: "Expected draft revision for mutation actions." },
      questionId: { type: "string", description: "Question being answered or revised." },
      values: { type: "array", items: { type: "string" }, description: "Selected option IDs. Use one value for single-select questions." },
      otherText: { type: "string", description: "Free-text answer when the user selected \u201Cother\u201D." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: { type: "string", required: true },
          sessionId: { type: "string" },
          projectId: { type: "string" },
          projectName: { type: "string" },
          projectFile: { type: "string" },
          revision: { type: "integer" },
          question: { type: "json" },
          brief: { type: "json" },
          assumptions: { type: "json" },
          nameProposal: { type: "json" },
          boardName: { type: "string" },
          activeBoard: { type: "string" },
          nextAction: { type: "string" },
          error: { type: "json" },
          current: { type: "json" },
          drafts: { type: "json" },
          idempotent: { type: "boolean" }
        }
      },
      render: (_args, value) => {
        if (value.status === "question" && value.question !== void 0) {
          const question = value.question;
          const options = question.options.map((option, index) => `${index + 1}. ${option.id} \u2014 ${option.label}`).join("\n");
          return text(`${continuation(value)} status=question questionId=${question.id}
${question.text}
${options}${question.allowOther ? "\n\uFF08\u53EF\u9009\u201C\u5176\u4ED6\u201D\u5E76\u8865\u5145\u8BF4\u660E\uFF09" : ""}
\u4E0B\u4E00\u6B21\u8C03\u7528\u5FC5\u987B\u4F7F\u7528 action=answer\u3001\u4E0A\u9762\u7684 sessionId/revision/questionId\uFF0C\u5E76\u628A\u7528\u6237\u9009\u62E9\u7684 option id \u653E\u5165 values\u3002`);
        }
        if (value.status === "ready") return text(`${continuation(value)} status=ready
\u9700\u6C42\u5DF2\u6574\u7406\u5B8C\u6210\u3002brief.pageMockData \u662F\u9010\u9875\u5185\u5BB9\u84DD\u56FE\uFF0C\u5FC5\u987B\u968F brief \u4E00\u8D77\u5C55\u793A\u5E76\u5728\u7ED8\u5236\u65F6\u843D\u5B9E\uFF1B\u8BF7\u7B49\u5F85\u7528\u6237\u7EDF\u4E00\u786E\u8BA4\uFF0C\u786E\u8BA4\u540E\u8C03\u7528 action=confirm\uFF0C\u4F20\u5165\u540C\u4E00\u4E2A sessionId \u548C revision\u3002`);
        if (value.status === "confirmed") return text(`${continuation(value)} status=confirmed boardName=${value.boardName ?? ""} activeBoard=${value.activeBoard ?? ""} nextAction=${value.nextAction ?? "draw2code_update"}
\u9879\u76EE\u300C${value.projectName ?? ""}\u300D\u5DF2\u786E\u8BA4\uFF0C\u72EC\u7ACB\u753B\u677F\u5DF2\u521B\u5EFA\u3002\u4E0B\u4E00\u6B65\u5FC5\u987B\u6309 brief.pageMockData \u8C03\u7528 draw2code_update\uFF0C\u5E76\u660E\u786E\u4F20\u5165\u4E0A\u9762\u7684 boardName\uFF1B\u6BCF\u4E2A\u91CD\u590D\u5185\u5BB9\u7EC4\u4EF6\u81F3\u5C11\u63D0\u4F9B 3 \u6761\u53EF\u89C1 mock \u6570\u636E\uFF0C\u4E0D\u8981\u56DE\u5199\u65E7\u753B\u677F\u3002`);
        if (value.status === "drafts") {
          const drafts = value.drafts ?? [];
          const summary = drafts.map((draft) => `${draft.sessionId ?? ""} ${draft.projectName ?? ""} (${draft.status ?? ""})`).join("\n");
          return text(`\u627E\u5230 ${drafts.length} \u4E2A\u672A\u5B8C\u6210\u9879\u76EE\uFF0C\u8BF7\u8BA9\u7528\u6237\u9009\u62E9\u8981\u7EE7\u7EED\u7684\u9879\u76EE\u6216\u521B\u5EFA\u65B0\u9879\u76EE\u3002
${summary}`);
        }
        if (value.status === "error") {
          const current = value.current;
          return text(`draw2code_create \u53EF\u6062\u590D\u9519\u8BEF\uFF1A${value.error?.message ?? "unknown error"}${current === void 0 ? "" : `
\u8BF7\u4F7F\u7528 current.sessionId=${current.sessionId ?? ""}\u3001current.revision=${current.revision ?? ""} \u4FEE\u6B63\u540E\u91CD\u8BD5\u3002`}`);
        }
        return text(`${continuation(value)} status=${value.status} project=${value.projectName ?? ""}`);
      }
    },
    async execute(args) {
      if (args.action === "start") {
        const idea = typeof args.idea === "string" ? args.idea.trim() : "";
        if (idea === "") return errorResponse("invalid_action", "action=start requires a non-empty idea");
        if (typeof args.projectName !== "string" || args.projectName.trim() === "") {
          return errorResponse("project_name_required", "\u8BF7\u5148\u57FA\u4E8E\u5B8C\u6574\u9700\u6C42\u8BED\u4E49\u6982\u62EC\u4E00\u4E2A\u7B80\u77ED\u4EA7\u54C1\u540D\uFF0C\u518D\u7528 projectName \u91CD\u65B0\u8C03\u7528 action=start\uFF1B\u4E0D\u8981\u590D\u5236\u6216\u622A\u53D6\u539F\u8BDD");
        }
        const projectName = normalizeProjectName(args.projectName);
        const nameError = projectNameValidationError(projectName, idea);
        if (nameError !== null) return errorResponse("project_name_invalid", nameError);
        const projectId = newProjectId();
        const draft2 = initialDraft(idea, projectName, args.styleNote?.trim() || null, projectId);
        const created = await projects.create(args.root, draft2);
        if (!created.ok) return errorResponse(created.error.code, created.error.message);
        return {
          ...responseFor(projects, created.value),
          nameProposal: {
            suggestedName: projectName,
            choices: [
              { id: "use", label: "\u4F7F\u7528\u8FD9\u4E2A\u540D\u79F0" },
              { id: "edit", label: "\u4FEE\u6539\u540D\u79F0" },
              { id: "later", label: "\u7A0D\u540E\u518D\u547D\u540D" }
            ]
          }
        };
      }
      if (args.action === "list") {
        const listed = await projects.list(args.root);
        if (!listed.ok) return errorResponse(listed.error.code, listed.error.message);
        return {
          status: "drafts",
          drafts: listed.value.filter((item) => item.status !== "archived" && item.status !== "abandoned").map((item) => ({
            sessionId: item.projectId,
            projectName: item.projectName,
            idea: item.originalIdea,
            status: item.status,
            revision: item.revision,
            updatedAt: item.updatedAt,
            boardName: item.boardName
          }))
        };
      }
      const sessionId = args.sessionId;
      const draft = await loadSession(projects, args.root, sessionId);
      if (draft === null) return errorResponse("session_not_found", "\u627E\u4E0D\u5230\u8FD9\u4E2A\u9879\u76EE\u8349\u7A3F\uFF0C\u8BF7\u9009\u62E9\u6062\u590D\u5DF2\u6709\u9879\u76EE\u6216\u91CD\u65B0\u5F00\u59CB");
      const key = requestKey(args);
      if (draft.lastRequestKey === key && draft.lastResponse !== void 0) {
        return { ...clone2(draft.lastResponse), idempotent: true };
      }
      if (args.action === "resume") return responseFor(projects, draft);
      if (args.action === "abandon" || args.action === "archive") {
        if (typeof args.revision !== "number") return errorResponse("invalid_action", `${args.action} requires revision`, draft);
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        draft.status = args.action === "abandon" ? "abandoned" : "archived";
        draft.currentQuestion = null;
        addHistory(draft, args.action);
        const response = responseFor(projects, draft);
        return persistMutation(projects, args.root, draft, args.revision, key, response);
      }
      if (args.action === "rename") {
        if (typeof args.revision !== "number" || typeof args.projectName !== "string" || args.projectName.trim() === "") {
          return errorResponse("invalid_action", "action=rename requires projectName and revision", draft);
        }
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        const projectName = normalizeProjectName(args.projectName);
        const nameError = projectNameValidationError(projectName);
        if (nameError !== null) return errorResponse("project_name_invalid", nameError, draft);
        draft.projectName = projectName;
        addHistory(draft, "rename");
        const response = responseFor(projects, draft, {
          nameProposal: { suggestedName: draft.projectName, choices: [{ id: "use", label: "\u4F7F\u7528\u8FD9\u4E2A\u540D\u79F0" }] }
        });
        return persistMutation(projects, args.root, draft, args.revision, key, response);
      }
      if (args.action === "confirm") {
        if (typeof args.revision !== "number") return errorResponse("invalid_action", "action=confirm requires revision", draft);
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        if (draftStatus(draft) !== "ready") return errorResponse("not_ready", "\u9879\u76EE\u7B80\u62A5\u8FD8\u6CA1\u6709\u5B8C\u6210\uFF0C\u4E0D\u80FD\u786E\u8BA4\u7ED8\u5236", draft);
        const boards = await scenes.list(args.root);
        if (!boards.ok) return errorResponse(boards.error.code, boards.error.message, draft);
        const boardName = boardNameFromProject(draft.projectName, new Set(boards.value.map((board) => board.name)));
        const created = await scenes.create(args.root, boardName);
        if (!created.ok) return errorResponse(created.error.code, created.error.message, draft);
        const active = await scenes.setActiveBoard(args.root, boardName);
        if (!active.ok) {
          await scenes.remove(args.root, boardName);
          return errorResponse(active.error.code, active.error.message, draft);
        }
        draft.status = "confirmed";
        draft.boardName = boardName;
        draft.brief = buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote);
        addHistory(draft, "confirm");
        const response = responseFor(projects, draft, { activeBoard: active.value.name, nextAction: "draw2code_update" });
        const saved = await persistMutation(projects, args.root, draft, args.revision, key, response);
        if (saved.status === "error") await scenes.remove(args.root, boardName);
        return saved;
      }
      if (args.action !== "answer" && args.action !== "revise") return errorResponse("invalid_action", `unsupported action ${args.action}`, draft);
      if (typeof args.revision !== "number" || typeof args.questionId !== "string" || !Array.isArray(args.values)) {
        return errorResponse("invalid_action", `${args.action} requires revision, questionId and values`, draft);
      }
      if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
      const question = questionFromDraft(draft, args.questionId);
      if (question === null) return errorResponse("invalid_question", `question "${args.questionId}" is not valid for this project`, draft);
      const validation = validateValues(question, args.values, args.otherText);
      if (validation !== null) return errorResponse("invalid_option", validation, draft);
      if (question.kind === "interpretation") {
        const pending = draft.pendingInterpretation;
        if (pending === null) return errorResponse("invalid_state", "no free-text interpretation is waiting for confirmation", draft);
        const choice = args.values[0];
        if (choice === "edit") {
          draft.pendingInterpretation = null;
          draft.currentQuestion = pending.question;
          addHistory(draft, "interpretation-edit", pending.questionId);
          return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
        }
        const answer = {
          questionId: pending.questionId,
          values: pending.values,
          otherText: pending.otherText,
          ...choice === "confirm" ? { normalizedText: pending.normalizedText } : {},
          confirmed: choice === "confirm"
        };
        draft.answers[pending.questionId] = answer;
        draft.pendingInterpretation = null;
        draft.currentQuestion = nextAfterAnswer(draft);
        draft.status = draft.currentQuestion === null ? "ready" : "draft";
        draft.brief = draft.currentQuestion === null ? buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote) : null;
        addHistory(draft, `interpretation-${choice}`, pending.questionId, pending.values, pending.otherText);
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
      }
      if (args.action === "revise") clearDownstreamAnswers(draft, args.questionId);
      if (args.values.includes("other")) {
        const normalizedText = interpretOther(question, args.otherText ?? "");
        draft.answers[question.id] = {
          questionId: question.id,
          values: args.values,
          otherText: args.otherText?.trim() ?? "",
          normalizedText,
          confirmed: true
        };
        draft.pendingInterpretation = null;
        draft.currentQuestion = nextAfterAnswer(draft);
        draft.status = draft.currentQuestion === null ? "ready" : "draft";
        draft.brief = draft.currentQuestion === null ? buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote) : null;
        addHistory(draft, "answer-other", question.id, args.values, args.otherText);
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
      }
      draft.answers[question.id] = {
        questionId: question.id,
        values: args.values,
        confirmed: true
      };
      draft.currentQuestion = nextAfterAnswer(draft);
      draft.status = draft.currentQuestion === null ? "ready" : "draft";
      draft.brief = draft.currentQuestion === null ? buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote) : null;
      addHistory(draft, args.action, question.id, args.values);
      return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
    }
  });
}

// src/tools.ts
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
import { open, realpath as realpath3 } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { defineTool as defineTool2 } from "@deepseek-ai/dsh-tools";

// src/layout.ts
var SHAPE_TYPES = /* @__PURE__ */ new Set(["rectangle", "diamond", "ellipse"]);
var BOTTOM_NAV_MAX_GAP = 96;
var DEFAULT_MOCK_DATA_MIN = 3;
var BOTTOM_NAVIGATION_ITEM_ROLES2 = /* @__PURE__ */ new Set(["bottom-navigation-item", "bottom-nav-item"]);
function str(value) {
  return typeof value === "string" ? value : "";
}
function num(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function customData(element) {
  return typeof element.customData === "object" && element.customData !== null ? element.customData : {};
}
function isFocused(element, focusIds) {
  if (focusIds === void 0) return true;
  const id = str(element.id);
  const frameId = str(element.frameId);
  return focusIds.has(id) || frameId !== "" && focusIds.has(frameId);
}
function glyphUnits(value) {
  let units = 0;
  for (const char of value) {
    units += /[\u2e80-\u9fff\uff00-\uffef]/u.test(char) ? 1 : char === " " ? 0.35 : 0.55;
  }
  return units;
}
function estimatedLineCount(element) {
  const text3 = str(element.text);
  if (text3 === "") return 1;
  const width = Math.max(1, num(element.width, 160));
  const fontSize = Math.max(8, num(element.fontSize, 20));
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.62)));
  return text3.split(/\r?\n/u).reduce((count, line) => {
    return count + Math.max(1, Math.ceil(glyphUnits(line) / charsPerLine));
  }, 0);
}
function frameFor(element, frames) {
  const explicit = str(element.frameId);
  if (explicit !== "") return frames.find((frame) => str(frame.id) === explicit);
  const x1 = num(element.x);
  const y1 = num(element.y);
  const x2 = x1 + num(element.width);
  const y2 = y1 + num(element.height);
  return frames.find((frame) => {
    const fx = num(frame.x);
    const fy = num(frame.y);
    return x1 >= fx - 2 && y1 >= fy - 2 && x2 <= fx + num(frame.width) + 2 && y2 <= fy + num(frame.height) + 2;
  });
}
function isBottomNavigation(element) {
  const role = str(customData(element).role).toLowerCase();
  if (role === "bottom-navigation" || role === "bottom-nav" || role === "tabbar") return true;
  return /底部导航|底部选项卡|tabbar|bottom[ -]?navigation/iu.test(str(element.text));
}
function isPrototypePage(element) {
  return str(customData(element).role).toLowerCase() === "prototype-page";
}
function isVisibleMockData(element) {
  if (str(element.type) !== "text" || str(customData(element).role).toLowerCase() !== "mock-data") return false;
  const value = str(element.text).trim();
  if (value.length < 2) return false;
  return !/^(?:lorem ipsum|用户[a-c1-3]?|好友[a-c1-3]?|昵称|标题|内容|消息|示例|item\s*\d*|\.\.\.|…+)$/iu.test(value);
}
function issue(code, element, message) {
  const id = str(element.id);
  return { code, ...id !== "" ? { id } : {}, message };
}
function inspectPrototypeLayout(elements, options = {}) {
  const frames = elements.filter((element) => str(element.type) === "frame");
  const elementById = new Map(elements.map((element) => [str(element.id), element]));
  const bottomNavigationShells = elements.filter((element) => SHAPE_TYPES.has(str(element.type)) && isBottomNavigation(element));
  const errors = [];
  const warnings = [];
  for (const element of elements) {
    const type = str(element.type);
    if (type === "frame" || !isFocused(element, options.focusIds)) continue;
    const text3 = str(element.text);
    if (SHAPE_TYPES.has(type) && text3.trim() !== "") {
      errors.push(issue(
        "shape-text-not-visible",
        element,
        `${str(element.id)} is a ${type} with text, but shape text is not a visible label in Excalidraw; add a separate text element and optionally set containerId to ${str(element.id)}`
      ));
    }
    if (type === "text" && text3 !== "") {
      const containerId = str(element.containerId);
      const container = containerId === "" ? void 0 : elementById.get(containerId);
      const boundToShape = container !== void 0 && SHAPE_TYPES.has(str(container.type));
      const directlyFocused = options.focusIds === void 0 || options.focusIds.has(str(element.id)) || container !== void 0 && options.focusIds.has(str(container.id));
      const elementRole2 = str(customData(element).role).toLowerCase();
      const containerRole = str(customData(container ?? {}).role).toLowerCase();
      const componentRole = elementRole2 || containerRole;
      if (containerId !== "" && container === void 0 && directlyFocused) {
        errors.push(issue(
          "container-target-missing",
          element,
          `${str(element.id)} points to missing container ${containerId}; add the target shape or clear containerId so the label remains visible`
        ));
      }
      if (boundToShape && directlyFocused && componentRole === "") {
        errors.push(issue(
          "component-role-missing",
          element,
          `${str(element.id)} is bound to ${containerId} without a semantic customData.role; mark the component as button, primary-action, select, input, chip, card, or another explicit product role so draw2code_update can apply the correct text alignment`
        ));
      }
      const bottomNavigationShell = bottomNavigationShells.find((shell) => {
        return num(element.x) >= num(shell.x) - 2 && num(element.y) >= num(shell.y) - 2 && num(element.x) + num(element.width) <= num(shell.x) + num(shell.width) + 2 && num(element.y) + num(element.height) <= num(shell.y) + num(shell.height) + 2;
      });
      const navigationItemFocused = options.focusIds === void 0 || options.focusIds.has(str(element.id)) || bottomNavigationShell !== void 0 && options.focusIds.has(str(bottomNavigationShell.id));
      if (bottomNavigationShell !== void 0 && navigationItemFocused && !BOTTOM_NAVIGATION_ITEM_ROLES2.has(elementRole2)) {
        errors.push(issue(
          "bottom-navigation-item-role-missing",
          element,
          `${str(element.id)} is inside bottom navigation ${str(bottomNavigationShell.id)} without customData.role=bottom-navigation-item; add the item role so its label is centered within its navigation slot`
        ));
      }
      const lines = estimatedLineCount(element);
      const fontSize = Math.max(8, num(element.fontSize, 20));
      const lineHeight = Math.max(1, num(element.lineHeight, 1.25));
      const requiredHeight = Math.ceil(lines * fontSize * lineHeight + 8);
      const explicitHeight = typeof element.height === "number" && Number.isFinite(element.height);
      if (lines > 1 && explicitHeight && num(element.height) + 2 < requiredHeight) {
        errors.push(issue(
          "text-height-overflow",
          element,
          `${str(element.id)} text height ${Math.round(num(element.height))} cannot contain approximately ${lines} lines; use height >= ${requiredHeight} or split the component into separate text elements`
        ));
      }
    }
    const frame = frameFor(element, frames);
    if (frame !== void 0 && type !== "arrow" && type !== "line") {
      const x1 = num(element.x);
      const y1 = num(element.y);
      const x2 = x1 + num(element.width);
      const y2 = y1 + num(element.height);
      const fx = num(frame.x);
      const fy = num(frame.y);
      const right = fx + num(frame.width);
      const bottom = fy + num(frame.height);
      if (x1 < fx - 2 || y1 < fy - 2 || x2 > right + 2 || y2 > bottom + 2) {
        errors.push(issue(
          "frame-overflow",
          element,
          `${str(element.id)} extends outside frame ${str(frame.name) || str(frame.id)}; keep the complete component inside its page frame`
        ));
      }
    }
    if (isBottomNavigation(element)) {
      const navFrame = frameFor(element, frames);
      if (navFrame === void 0) {
        warnings.push(issue(
          "bottom-navigation-unframed",
          element,
          `${str(element.id)} is marked as bottom navigation but is not inside a page frame`
        ));
      } else {
        const frameBottom = num(navFrame.y) + num(navFrame.height);
        const navBottom = num(element.y) + num(element.height);
        const gap = frameBottom - navBottom;
        if (gap > BOTTOM_NAV_MAX_GAP) {
          errors.push(issue(
            "bottom-navigation-offset",
            element,
            `${str(element.id)} is ${Math.round(gap)}px above the frame bottom; place the bottom navigation in the bottom safe area (gap <= ${BOTTOM_NAV_MAX_GAP}px)`
          ));
        }
      }
      if (type === "text") {
        errors.push(issue(
          "bottom-navigation-needs-shell",
          element,
          `${str(element.id)} is a text-only bottom navigation; add a rectangle shell plus separate text labels so the component has a visible boundary and stable geometry`
        ));
      }
    }
  }
  for (const shell of bottomNavigationShells) {
    const items = elements.filter((element) => {
      if (str(element.type) !== "text" || !BOTTOM_NAVIGATION_ITEM_ROLES2.has(str(customData(element).role).toLowerCase())) return false;
      return num(element.x) >= num(shell.x) - 2 && num(element.y) >= num(shell.y) - 2 && num(element.x) + num(element.width) <= num(shell.x) + num(shell.width) + 2 && num(element.y) + num(element.height) <= num(shell.y) + num(shell.height) + 2;
    });
    const shellFocused = isFocused(shell, options.focusIds) || items.some((item) => isFocused(item, options.focusIds));
    if (!shellFocused) continue;
    if (items.length === 0) {
      errors.push(issue(
        "bottom-navigation-items-missing",
        shell,
        `${str(shell.id)} has no visible bottom-navigation-item labels; add separate text items inside the navigation shell`
      ));
      continue;
    }
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const left = items[leftIndex];
        const right = items[rightIndex];
        const overlaps = num(left.x) < num(right.x) + num(right.width) && num(left.x) + num(left.width) > num(right.x) && num(left.y) < num(right.y) + num(right.height) && num(left.y) + num(left.height) > num(right.y);
        if (!overlaps) continue;
        errors.push(issue(
          "bottom-navigation-item-overlap",
          shell,
          `${str(left.id)} overlaps ${str(right.id)} inside ${str(shell.id)}; give each navigation item its own non-overlapping slot`
        ));
      }
    }
  }
  for (const frame of frames) {
    if (!isPrototypePage(frame) || !isFocused(frame, options.focusIds)) continue;
    const configuredMinimum = num(customData(frame).mockDataMin, DEFAULT_MOCK_DATA_MIN);
    const minimum = Math.max(1, Math.floor(configuredMinimum));
    const records = new Set(
      elements.filter((element) => frameFor(element, frames) === frame && isVisibleMockData(element)).map((element) => str(element.text).trim())
    );
    if (records.size < minimum) {
      errors.push(issue(
        "mock-data-insufficient",
        frame,
        `${str(frame.name) || str(frame.id)} requires ${minimum} visible mock-data text records; found ${records.size}. Add realistic example names, values, statuses or messages instead of empty boxes and mark each text with customData.role=mock-data`
      ));
    }
  }
  return { errors, warnings };
}
function formatLayoutIssues(issues) {
  return issues.map((item) => {
    const value = typeof item === "object" && item !== null ? item : {};
    const code = str(value.code) || "layout-warning";
    const id = str(value.id);
    const message = str(value.message) || JSON.stringify(item);
    return `- ${code}${id === "" ? "" : ` [${id}]`}: ${message}`;
  }).join("\n");
}

// src/tools.ts
function text2(value) {
  return [{ type: "text", text: value }];
}
var MAX_ELEMENTS_JSON = 120 * 1024;
var SNAPSHOT_CACHE_MAX = 40;
var DEFAULT_BOARD = "prototype";
function str2(value) {
  return typeof value === "string" ? value : "";
}
function num2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
var boardCache = /* @__PURE__ */ new Map();
async function resolveBoard(store, root, requested) {
  const active = await store.getActiveBoard(root);
  const activeBoard = active.ok && active.value.name !== null ? active.value.name : void 0;
  const requestedName = typeof requested === "string" ? requested.trim() : "";
  return {
    name: requestedName !== "" ? requestedName : activeBoard ?? DEFAULT_BOARD,
    activeBoard
  };
}
function typeName2(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return `string(${value.length} chars)`;
  return typeof value;
}
function parseUpdateOps(input) {
  let source = input;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch (error2) {
      throw new Error(`ops is not valid JSON: ${error2 instanceof Error ? error2.message : String(error2)}. Send an array like [{"op":"upsert","element":{...}}] or a JSON string encoding it`);
    }
  }
  if (!Array.isArray(source)) {
    throw new Error(`ops must be an array, got ${typeName2(source)}. Large payloads sometimes arrive as a JSON string (auto-parsed); if you still see this, check the ops argument is an array of op objects`);
  }
  return source.map((raw, index) => {
    const where = `ops[${index}]`;
    if (typeof raw !== "object" || raw === null) throw new Error(`${where} must be an object, got ${typeName2(raw)}`);
    const op = raw;
    const kind = str2(op.op);
    if (kind === "" && typeof op.element === "object" && op.element !== null) {
      const element = op.element;
      const elementId = str2(element.id);
      if (elementId === "") throw new Error(`${where}.element.id missing or not a string: every element needs a unique non-empty id`);
      return { op: "upsert", elementId, element };
    }
    if (kind === "" && str2(op.id) !== "" && str2(op.type) !== "") {
      return { op: "upsert", elementId: str2(op.id), element: op };
    }
    if (kind === "upsert") {
      if ((op.element === void 0 || op.element === null) && str2(op.id) !== "" && str2(op.type) !== "") {
        const element2 = { ...op };
        delete element2.op;
        return { op: "upsert", elementId: str2(element2.id), element: element2 };
      }
      if (typeof op.element !== "object" || op.element === null) {
        throw new Error(`${where} is "upsert" but missing its element: use {"op":"upsert","element":{"id":"x","type":"rectangle",...}}`);
      }
      const element = op.element;
      const elementId = str2(element.id);
      if (elementId === "") throw new Error(`${where}.element.id missing or not a string: every element needs a unique non-empty id`);
      return { op: "upsert", elementId, element };
    }
    if (kind === "delete") {
      const nestedElement = typeof op.element === "object" && op.element !== null ? op.element : void 0;
      const elementId = str2(op.id) || str2(op.elementId) || str2(nestedElement?.id);
      if (elementId === "") throw new Error(`${where} is "delete" but missing its id: use {"op":"delete","id":"<element id>"}`);
      return { op: "delete", elementId };
    }
    if (kind === "clear") return { op: "clear" };
    if (kind === "replace") {
      if (typeof op.scene !== "object" || op.scene === null) {
        throw new Error(`${where} is "replace" but missing its scene: use {"op":"replace","scene":{"elements":[...]}}`);
      }
      return { op: "replace", scene: op.scene };
    }
    throw new Error(`${where}.op = "${kind}" is invalid: must be one of upsert | delete | clear | replace. The most common mistake is forgetting the op field entirely`);
  });
}
function previewElements(currentElements, ops) {
  let elements = currentElements.slice();
  for (const op of ops) {
    if (op.op === "replace") {
      const next = op.scene?.elements;
      elements = Array.isArray(next) ? next.filter((item) => typeof item === "object" && item !== null) : [];
      continue;
    }
    if (op.op === "clear") {
      elements = [];
      continue;
    }
    if (op.op === "delete" && op.elementId !== void 0) {
      elements = elements.filter((element) => str2(element.id) !== op.elementId);
      continue;
    }
    if (op.op === "upsert" && op.elementId !== void 0 && op.element !== void 0) {
      const index = elements.findIndex((element) => str2(element.id) === op.elementId);
      if (index === -1) elements.push(op.element);
      else elements[index] = op.element;
    }
  }
  return elements;
}
function fitsInsideFrame(element, frame) {
  const tolerance = 2;
  const left = num2(element.x);
  const top = num2(element.y);
  const right = left + num2(element.width);
  const bottom = top + num2(element.height);
  const frameLeft = num2(frame.x);
  const frameTop = num2(frame.y);
  const frameRight = frameLeft + num2(frame.width);
  const frameBottom = frameTop + num2(frame.height);
  return left >= frameLeft - tolerance && top >= frameTop - tolerance && right <= frameRight + tolerance && bottom <= frameBottom + tolerance;
}
function normalizeFrameLocalCoordinates(currentElements, ops) {
  const prospectiveElements = previewElements(currentElements, ops);
  const frames = /* @__PURE__ */ new Map();
  for (const candidate of prospectiveElements) {
    if (str2(candidate.type) !== "frame" || str2(candidate.id) === "") continue;
    frames.set(str2(candidate.id), normalizeElement(candidate));
  }
  return ops.map((op) => {
    if (op.op !== "upsert" || op.element === void 0 || str2(op.element.type) === "frame") return op;
    const frame = frames.get(str2(op.element.frameId));
    if (frame === void 0) return op;
    const element = normalizeElement(op.element);
    if (fitsInsideFrame(element, frame)) return op;
    const shifted = normalizeElement({
      ...op.element,
      x: num2(element.x) + num2(frame.x),
      y: num2(element.y) + num2(frame.y)
    });
    if (!fitsInsideFrame(shifted, frame)) return op;
    return { ...op, element: shifted };
  });
}
function layoutFocusIds(ops) {
  if (ops.some((op) => op.op === "replace")) return void 0;
  const ids = /* @__PURE__ */ new Set();
  for (const op of ops) {
    if (op.op === "upsert" && op.elementId !== void 0) ids.add(op.elementId);
    if (op.op === "delete" && op.elementId !== void 0) ids.add(op.elementId);
  }
  return ids.size > 0 ? ids : void 0;
}
function normalizeSemanticUpserts(currentElements, ops) {
  const reconciled = reconcileBoundTextBindings(
    previewElements(currentElements, ops),
    layoutFocusIds(ops)
  );
  const byId = new Map(reconciled.map((element) => [str2(element.id), element]));
  return ops.map((op) => {
    if (op.op !== "upsert" || op.elementId === void 0) return op;
    const element = byId.get(op.elementId);
    return element === void 0 ? op : { ...op, element };
  });
}
function layoutWarnings(elements) {
  const report = inspectPrototypeLayout(elements);
  return [...report.errors, ...report.warnings].map((item) => ({
    code: item.code,
    ...item.id === void 0 ? {} : { id: item.id },
    message: item.message
  }));
}
function makeKey(root, name2) {
  return `${root}::${name2}`;
}
function snapshotElementsById(elements) {
  const map = /* @__PURE__ */ new Map();
  for (const element of elements) {
    const id = str2(element.id);
    if (id !== "") map.set(id, element);
  }
  return map;
}
function diffSummaries(before, after) {
  const beforeMap = snapshotElementsById(before);
  const afterMap = snapshotElementsById(after);
  const added = [];
  const removed = [];
  const modified = [];
  for (const [id, afterElement] of afterMap.entries()) {
    const beforeElement = beforeMap.get(id);
    if (beforeElement === void 0) {
      added.push(elementSummary(afterElement));
      continue;
    }
    if (JSON.stringify(beforeElement) !== JSON.stringify(afterElement)) {
      modified.push(`${elementSummary(beforeElement)} -> ${elementSummary(afterElement)}`);
    }
  }
  for (const [id, beforeElement] of beforeMap.entries()) {
    if (afterMap.has(id)) continue;
    removed.push(elementSummary(beforeElement));
  }
  return { added, removed, modified };
}
function computeChangeIds(before, after) {
  const beforeMap = snapshotElementsById(before);
  const afterMap = snapshotElementsById(after);
  const added = /* @__PURE__ */ new Set();
  const removed = /* @__PURE__ */ new Set();
  const modified = /* @__PURE__ */ new Set();
  for (const [id, afterElement] of afterMap.entries()) {
    if (!beforeMap.has(id)) {
      added.add(id);
      continue;
    }
    const beforeElement = beforeMap.get(id);
    if (beforeElement === void 0) continue;
    if (JSON.stringify(beforeElement) !== JSON.stringify(afterElement)) modified.add(id);
  }
  for (const [id] of beforeMap.entries()) {
    if (!afterMap.has(id)) removed.add(id);
  }
  return { added, removed, modified };
}
function summarizePlan(ops, currentElements) {
  const added = [];
  const removed = [];
  const modified = [];
  const currentById = snapshotElementsById(currentElements);
  for (const op of ops) {
    if (op.op === "replace") {
      added.push("replace \u6574\u9875");
      continue;
    }
    if (op.op === "clear") {
      removed.push("clear \u6E05\u7A7A\u6574\u9875");
      continue;
    }
    if (op.op === "delete" && op.elementId !== void 0) {
      const before = currentById.get(op.elementId);
      removed.push(before === void 0 ? `delete ${op.elementId}` : `delete ${elementSummary(before)}`);
      continue;
    }
    if (op.op === "upsert" && op.elementId !== void 0 && op.element !== void 0) {
      if (currentById.has(op.elementId)) {
        const before = currentById.get(op.elementId);
        modified.push(`upsert ${elementSummary(before)} -> ${elementSummary(op.element)}`);
      } else {
        added.push(`upsert ${elementSummary(op.element)}`);
      }
    }
  }
  return { added, removed, modified };
}
function renderChangeSummary(title, summary) {
  const chunks = [];
  if (summary.added.length > 0) chunks.push(`\u65B0\u589E: ${summary.added.slice(0, 6).join("\uFF1B")}${summary.added.length > 6 ? "\u2026" : ""}`);
  if (summary.removed.length > 0) chunks.push(`\u5220\u9664: ${summary.removed.slice(0, 6).join("\uFF1B")}${summary.removed.length > 6 ? "\u2026" : ""}`);
  if (summary.modified.length > 0) chunks.push(`\u4FEE\u6539: ${summary.modified.slice(0, 6).join("\uFF1B")}${summary.modified.length > 6 ? "\u2026" : ""}`);
  const body = chunks.length === 0 ? "\u65E0\u660E\u663E\u5143\u7D20\u53D8\u5316" : chunks.join("\n");
  return `${title}\uFF1A${body}`;
}
function buildPlanMessage(userChanges, plannedChanges, conflicts) {
  const lines = [];
  lines.push(renderChangeSummary("1) \u4E0A\u4E00\u8F6E\u4F60\u624B\u5DE5\u6539\u52A8", userChanges));
  lines.push(renderChangeSummary("2) \u8FD9\u4E00\u8F6E\u62DF\u6539", plannedChanges));
  if (conflicts.length === 0) {
    lines.push("3) \u51B2\u7A81\uFF1A\u65E0");
    return lines.join("\n");
  }
  lines.push("3) \u51B2\u7A81\uFF1A\u6709");
  for (const conflict of conflicts) {
    const target = conflict.elementId ? `\uFF08ID: ${conflict.elementId}\uFF09` : "";
    const before = conflict.before ? ` \u65E7:${conflict.before}` : "";
    const after = conflict.after ? ` \u65B0:${conflict.after}` : "";
    lines.push(`- ${conflict.op}${target}: ${conflict.reason}${before}${after}`);
  }
  return lines.join("\n");
}
function elementSummary(element) {
  const type = str2(element.type);
  if (type === "text") {
    const text3 = str2(element.text);
    return `${type}#${str2(element.id)} ${text3.slice(0, 48)}`;
  }
  return `${type}#${str2(element.id)}`;
}
function touchedByManualChange(userChanges) {
  if (userChanges === null) return /* @__PURE__ */ new Set();
  const touched = /* @__PURE__ */ new Set();
  for (const id of userChanges.added) touched.add(id);
  for (const id of userChanges.removed) touched.add(id);
  for (const id of userChanges.modified) touched.add(id);
  return touched;
}
function stableJson(value) {
  return JSON.stringify(value);
}
function elementRole(element) {
  if (typeof element.customData !== "object" || element.customData === null) return "";
  return str2(element.customData.role).toLowerCase();
}
function authoredElementMatches(expected, actual, elementsById) {
  const volatile = /* @__PURE__ */ new Set(["updated", "seed", "versionNonce"]);
  for (const [key, value] of Object.entries(expected)) {
    if (volatile.has(key)) continue;
    if (expected.type === "text" && (key === "textAlign" || key === "verticalAlign")) {
      const container = elementsById.get(str2(actual.containerId));
      const role = container === void 0 || elementRole(container) === "" ? elementRole(actual) : elementRole(container);
      const alignment = semanticTextAlignment(role);
      if (alignment !== null && actual.textAlign === alignment.textAlign && actual.verticalAlign === alignment.verticalAlign) continue;
    }
    if (expected.type === "text" && key === "containerId" && typeof value === "string" && actual.containerId === null && actual.frameId === value) {
      continue;
    }
    if (key === "boundElements") {
      if (value === null) continue;
      if (!Array.isArray(value) || !Array.isArray(actual[key])) return false;
      const actualBindings = actual[key];
      if (!value.every((binding) => actualBindings.some((candidate) => stableJson(candidate) === stableJson(binding)))) return false;
      continue;
    }
    if (stableJson(actual[key]) !== stableJson(value)) return false;
  }
  if (expected.type === "text") {
    if (stableJson(actual.text) !== stableJson(expected.text)) return false;
    if (stableJson(actual.originalText) !== stableJson(expected.text)) return false;
  }
  return true;
}
function verifyAppliedOps(ops, elements) {
  const byId = new Map(elements.map((element) => [str2(element.id), element]));
  const finalOpById = /* @__PURE__ */ new Map();
  for (const op of ops) {
    if (op.op === "clear" || op.op === "replace") {
      finalOpById.clear();
      continue;
    }
    if (op.elementId !== void 0) finalOpById.set(op.elementId, op);
  }
  for (const op of finalOpById.values()) {
    if (op.op === "upsert" && op.elementId !== void 0) {
      const actual = byId.get(op.elementId);
      if (actual === void 0) return `upsert target ${op.elementId} is missing after write`;
      if (!authoredElementMatches(op.element, actual, byId)) {
        return `upsert target ${op.elementId} does not match the requested element after write`;
      }
    }
    if (op.op === "delete" && op.elementId !== void 0 && byId.has(op.elementId)) {
      return `delete target ${op.elementId} is still present after write`;
    }
  }
  return null;
}
function buildUpdatePlan(currentElements, ops, safeMode, touchedManualIds, hasSnapshot) {
  const currentById = /* @__PURE__ */ new Map();
  for (const el of currentElements) {
    const id = str2(el.id);
    if (id !== "") currentById.set(id, el);
  }
  const conflicts = [];
  for (const op of ops) {
    if (op.op === "replace") {
      if (!safeMode) continue;
      if (!hasSnapshot && currentById.size === 0) continue;
      conflicts.push({ op: "replace", reason: "replace \u4E3A\u6574\u9875\u66FF\u6362\uFF0C\u53EF\u80FD\u8986\u76D6\u7528\u6237\u6700\u8FD1\u6539\u52A8" });
      continue;
    }
    if (op.op === "clear") {
      if (!safeMode) continue;
      if (!hasSnapshot && currentById.size === 0) continue;
      conflicts.push({ op: "clear", reason: "clear \u4F1A\u6E05\u7A7A\u753B\u677F\uFF0C\u53EF\u80FD\u6E05\u6389\u7528\u6237\u521A\u4FEE\u6539\u7684\u5185\u5BB9" });
      continue;
    }
    if (op.op === "delete" && op.elementId !== void 0 && currentById.has(op.elementId)) {
      if (!safeMode) continue;
      if (touchedManualIds.size > 0 && !touchedManualIds.has(op.elementId)) continue;
      const before = elementSummary(currentById.get(op.elementId));
      conflicts.push({ op: "delete-existing", reason: "\u8981\u5220\u9664\u73B0\u6709\u5143\u7D20\uFF0C\u53EF\u80FD\u51B2\u7A81\u5230\u7528\u6237\u624B\u5DE5\u4FEE\u6539\u6216\u5220\u9664\u540E\u7684\u7ED3\u679C", elementId: op.elementId, before });
      continue;
    }
    if (op.op === "upsert" && op.elementId !== void 0 && currentById.has(op.elementId)) {
      if (!safeMode) continue;
      if (touchedManualIds.size > 0 && !touchedManualIds.has(op.elementId)) continue;
      const before = elementSummary(currentById.get(op.elementId));
      const after = elementSummary(op.element);
      conflicts.push({ op: "modify-existing", reason: "\u8981\u4FEE\u6539\u73B0\u6709\u5143\u7D20\uFF0C\u53EF\u80FD\u8986\u76D6\u7528\u6237\u521A\u6539\u7684\u5185\u5BB9", elementId: op.elementId, before, after });
    }
  }
  if (!hasSnapshot) return conflicts;
  if (touchedManualIds.size > 0 || conflicts.some((item) => item.op === "replace" || item.op === "clear")) {
    return conflicts;
  }
  return [];
}
function rememberSnapshot(key, snapshot) {
  boardCache.set(key, snapshot);
  while (boardCache.size > SNAPSHOT_CACHE_MAX) {
    const first = boardCache.keys().next();
    if (first.done) break;
    boardCache.delete(first.value);
  }
}
function describeElement(el) {
  const type = str2(el.type);
  const id = str2(el.id);
  const geom = `@${Math.round(num2(el.x))},${Math.round(num2(el.y))} ${Math.round(num2(el.width))}x${Math.round(num2(el.height))}`;
  if (type === "text") {
    const body = str2(el.text).replace(/\n/g, "\\n").slice(0, 60);
    return `${id} text ${geom} "${body}"`;
  }
  if (type === "frame") return `${id} frame ${geom} "${str2(el.name)}"`;
  return `${id} ${type} ${geom}`;
}
function draw2codeListTool(store) {
  return defineTool2({
    name: "draw2code_list",
    description: "List \u753B\u7801 (Draw2Code) prototype boards of one workspace (name, revision, element count, updated time). Triggers: \u753B\u677F / \u539F\u578B / draw2code / prototype board listing.",
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          activeBoard: { type: "string" },
          scenes: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string", required: true },
                rev: { type: "number", required: true },
                elementCount: { type: "integer", required: true },
                updatedAt: { type: "number", required: true }
              }
            }
          }
        }
      },
      render: (_args, value) => text2(
        (value.scenes ?? []).length === 0 ? "no boards yet (draw2code/ is empty or absent)" : [
          `\u5F53\u524D\u753B\u677F: ${value.activeBoard ?? "\uFF08\u672A\u8BB0\u5F55\uFF09"}`,
          "name | elements | updatedAt",
          "--- | --- | ---",
          ...(value.scenes ?? []).map((s) => `${s.name} | ${s.elementCount} | ${new Date(s.updatedAt).toISOString()}`)
        ].join("\n")
      )
    },
    async execute(args) {
      const result = await store.list(args.root);
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const active = await store.getActiveBoard(args.root);
      return active.ok && active.value.name !== null ? { scenes: result.value, activeBoard: active.value.name } : { scenes: result.value };
    }
  });
}
function draw2codeReadTool(store) {
  return defineTool2({
    name: "draw2code_read",
    description: "Read one \u753B\u7801 prototype board: a compact per-element summary plus the full elements JSON (needed before updating or before generating frontend pages from the board). Triggers: \u67E5\u770B\u753B\u677F / \u8BFB\u539F\u578B / board read.",
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      name: { type: "string", description: "Board name. Omit to use the board currently selected in the \u753B\u7801 UI." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          rev: { type: "number", required: true },
          board: { type: "string", required: true },
          activeBoard: { type: "string" },
          elementCount: { type: "integer", required: true },
          summary: { type: "string", required: true },
          layoutWarnings: { type: "array", items: { type: "json" }, required: true },
          file: { type: "string", required: true },
          elements: { type: "json", required: true }
        }
      },
      render: (_args, value) => text2(
        [
          `board: ${value.board ?? ""} \xB7 ${value.elementCount ?? 0} elements`,
          value.activeBoard !== void 0 && value.activeBoard !== value.board ? `\u5F53\u524D\u753B\u677F: ${value.activeBoard}\uFF08\u4E0E\u8BFB\u53D6\u76EE\u6807\u4E0D\u540C\uFF09` : "",
          (value.layoutWarnings ?? []).length > 0 ? `\u539F\u578B\u8D28\u91CF\u63D0\u9192\uFF1A
${formatLayoutIssues(value.layoutWarnings ?? [])}` : "",
          value.summary ?? "",
          value.file !== void 0 ? `file: ${value.file}` : ""
        ].filter(Boolean).join("\n")
      )
    },
    async execute(args) {
      const target = await resolveBoard(store, args.root, args.name);
      const result = await store.read(args.root, target.name);
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const { rev, scene } = result.value;
      const summary = scene.elements.map(describeElement).join("\n");
      const elementsJson = JSON.stringify(scene.elements);
      const elementsBytes = Buffer.byteLength(elementsJson, "utf8");
      const payload = elementsBytes <= MAX_ELEMENTS_JSON ? scene.elements : [{ id: "__too_large__", type: "text", text: `elements JSON is ${elementsBytes} UTF-8 bytes (> ${MAX_ELEMENTS_JSON}); read the file directly instead` }];
      return {
        rev,
        board: target.name,
        ...target.activeBoard !== void 0 ? { activeBoard: target.activeBoard } : {},
        elementCount: scene.elements.length,
        summary,
        layoutWarnings: layoutWarnings(scene.elements),
        file: `draw2code/${target.name}.excalidraw.json`,
        elements: payload
      };
    }
  });
}
function draw2codeUpdateTool(store) {
  return defineTool2({
    name: "draw2code_update",
    description: `Draw on / edit one \u753B\u7801 prototype board with ops \u2014 this is how you turn the user's idea into a visible prototype in the right sidebar. Canonical ops: {op:"upsert",element:{...}} (insert or replace by id), {op:"delete",id}, {op:"clear"}, {op:"replace",scene:{elements:[...]}}. Elements need id + type (rectangle|text|arrow|line|ellipse|diamond|frame) + x/y/width/height (+text for text); missing fields are defaulted. Unambiguous upsert shorthands are accepted: a direct {id,type,...} element, {element:{...}} without op, or flat {op:"upsert",id,type,...}. Delete also accepts elementId or element.id when op="delete". Canvas-absolute x/y are canonical. When an element has frameId and its box only fits after adding the frame x/y, frame-local coordinates are safely converted; ambiguous coordinates remain layout-invalid. The board is auto-created when absent. Triggers: \u753B\u539F\u578B / \u753B\u4E00\u4E0B / \u5728\u753B\u677F\u4E0A\u2026 / draw the prototype / update the board. Low-fi quality is checked before writing: multiline text needs enough height, shape text must be a separate text element, and bottom navigation must use a semantic shell in the frame bottom safe area. A completed page from draw2code_create must set frame customData.role=prototype-page plus customData.mockDataMin (normally 3), and mark each visible realistic example text with customData.role=mock-data; empty boxes and placeholder labels do not satisfy the content gate. Put page children in a frame with frameId; never use containerId for page membership. If a text containerId mistakenly points to a frame, the store repairs it to frameId so the text stays visible. For a one-label shape, set the text containerId to the rectangle/diamond/ellipse id and declare customData.role on the shape or label: button/primary-action/chip/tab labels become center/middle, while input/select/dropdown/search-field values stay left/middle. Missing component roles are rejected instead of silently defaulting labels to the top-left. The tool completes Excalidraw's reciprocal boundElements relation so the label is visible on first render. A bottom-navigation shell uses separate text labels with customData.role=bottom-navigation-item so each slot is centered. Use customData.tone=primary|success|warning|danger|info|neutral on category/status/action shapes for restrained semantic color; explicit strokeColor/backgroundColor always win. Invalid layout returns layout-invalid and is not written. Omit name to target the board currently selected in the \u753B\u7801 UI; only pass name when the user explicitly names another board. Never edit the scene file with Bash or another direct file-writing path; use this tool so conflicts and read-back verification are enforced.`,
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      name: { type: "string", description: "Board name. Omit to target the board currently selected in the \u753B\u7801 UI." },
      ops: { type: "json", required: true, description: 'Ops array (or a JSON string encoding it). Prefer [{"op":"upsert","element":{"id":"title","type":"text","frameId":"page","x":20,"y":80,"text":"\u6807\u9898"}}]. Direct elements, {element:{...}} without op, and flat upserts are also accepted when id+type make the intent unambiguous. Delete accepts id, elementId, or element.id. Canvas-absolute x/y are canonical; unambiguous frame-local child coordinates are converted automatically.' },
      force: { type: "boolean", description: "\u5DF2\u8BFB\u5230\u51B2\u7A81\u5E76\u4E14\u7528\u6237\u786E\u8BA4\u540E\u53EF\u8BBE\u7F6E\u4E3A true\uFF0C\u5F3A\u5236\u6267\u884C\u3002\u9ED8\u8BA4 false\u3002" },
      safeMode: { type: "boolean", description: "\u662F\u5426\u5728\u6709\u98CE\u9669\u6539\u52A8\u65F6\u8981\u6C42\u786E\u8BA4\uFF08\u9ED8\u8BA4 true\uFF09\u3002\u8BBE\u4E3A false \u4F1A\u76F4\u63A5\u6267\u884C\uFF0C\u53EF\u80FD\u8986\u76D6\u7528\u6237\u624B\u5DE5\u6539\u52A8\u3002" }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          rev: { type: "number", required: true },
          targetBoard: { type: "string", required: true },
          activeBoard: { type: "string" },
          elementCount: { type: "integer", required: true },
          applied: { type: "integer", required: true },
          verified: { type: "boolean", required: true },
          revealRequestId: { type: "string" },
          layoutWarnings: { type: "array", items: { type: "json" }, required: true },
          requiresConfirmation: { type: "boolean" },
          pending: { type: "boolean" },
          conflicts: { type: "array", items: { type: "json" } },
          planSummary: { type: "string" },
          userSummary: { type: "string" },
          summary: {
            type: "object",
            additionalProperties: false,
            properties: {
              userChanges: { type: "json" },
              plannedChanges: { type: "json" }
            }
          }
        }
      },
      render: (_args, value) => text2(
        value.pending === true ? `\u3010\u5F85\u786E\u8BA4\u3011\u68C0\u6D4B\u5230\u6F5C\u5728\u51B2\u7A81\uFF08${value.conflicts?.length ?? 0} \u6761\uFF09\uFF1A
${value.planSummary ?? ""}
\u8BF7\u5148\u786E\u8BA4\u540E\u518D\u91CD\u8BD5\uFF1A\u5728\u4F60\u786E\u8BA4\u4E86\u4E4B\u540E\uFF0C\u8BF7\u91CD\u65B0\u8C03\u7528 draw2code_update \u5E76\u8BBE\u7F6E force=true\u3002` : value.activeBoard !== void 0 && value.targetBoard !== value.activeBoard ? `board ${value.targetBoard ?? ""} updated and verified on disk, but the visible board is ${value.activeBoard}; switch the \u753B\u7801 board or retry without name to update what the user is viewing.` : `board ${value.targetBoard ?? ""} updated and verified: ${value.applied ?? 0} ops applied, ${value.elementCount ?? 0} elements on board. The \u753B\u7801 sidebar opens automatically on this board.${(value.layoutWarnings ?? []).length > 0 ? `
\u539F\u578B\u8D28\u91CF\u63D0\u9192\uFF1A
${formatLayoutIssues(value.layoutWarnings ?? [])}` : ""}`
      )
    },
    async execute(args) {
      const safeMode = args.safeMode !== false;
      const force = args.force === true;
      const parsedOps = parseUpdateOps(args.ops);
      const target = await resolveBoard(store, args.root, args.name);
      const board = await store.read(args.root, target.name);
      const key = makeKey(args.root, target.name);
      const cache = boardCache.get(key);
      const currentElements = board.ok ? board.value.scene.elements : [];
      const frameNormalizedOps = normalizeFrameLocalCoordinates(currentElements, parsedOps);
      const ops = normalizeSemanticUpserts(currentElements, frameNormalizedOps);
      const prospectiveElements = previewElements(currentElements, ops);
      const layoutReport = inspectPrototypeLayout(prospectiveElements, { focusIds: layoutFocusIds(ops) });
      if (layoutReport.errors.length > 0) {
        throw new Error(`layout-invalid:
${formatLayoutIssues(layoutReport.errors)}
\u8BF7\u4FEE\u6B63\u7EC4\u4EF6\u51E0\u4F55\u548C\u5185\u5BB9\u53EF\u8BFB\u6027\u540E\u518D\u8C03\u7528 draw2code_update\uFF1B\u4E0D\u8981\u628A\u591A\u884C\u5185\u5BB9\u538B\u8FDB\u5355\u884C text\u3001\u4E0D\u8981\u628A\u6309\u94AE\u6587\u6848\u5199\u8FDB rectangle.text\uFF0C\u4E5F\u4E0D\u8981\u7528\u7A7A\u767D\u65B9\u6846\u4EE3\u66FF mock \u6570\u636E\u3002`);
      }
      const hasSnapshot = cache !== void 0;
      const userChanges = cache !== void 0 ? diffSummaries(cache.elements, currentElements) : { added: [], removed: [], modified: [] };
      const userChangeIds = hasSnapshot ? computeChangeIds(cache.elements, currentElements) : null;
      const touchedManualIds = touchedByManualChange(userChangeIds);
      const plannedChanges = summarizePlan(ops, currentElements);
      const conflicts = board.ok ? buildUpdatePlan(currentElements, ops, safeMode, touchedManualIds, hasSnapshot) : [];
      const finalPlanSummary = buildPlanMessage(userChanges, plannedChanges, conflicts);
      if (board.ok) {
        rememberSnapshot(key, { rev: board.value.rev, elements: currentElements });
      }
      if (!board.ok && !force && board.error.code !== "not-found") {
        throw new Error(`${board.error.code}: ${board.error.message}`);
      }
      if (safeMode && !force && conflicts.length > 0) {
        const elementCount = currentElements.length;
        const conflictValues = conflicts;
        return {
          rev: board.ok ? board.value.rev : 0,
          targetBoard: target.name,
          ...target.activeBoard !== void 0 ? { activeBoard: target.activeBoard } : {},
          elementCount,
          applied: 0,
          verified: false,
          layoutWarnings: layoutWarnings(currentElements),
          requiresConfirmation: true,
          pending: true,
          conflicts: conflictValues,
          userSummary: finalPlanSummary,
          planSummary: finalPlanSummary,
          summary: {
            userChanges,
            plannedChanges
          }
        };
      }
      const result = await store.applyOps(args.root, target.name, ops, board.ok ? board.value.rev : void 0);
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const refreshed = await store.read(args.root, target.name);
      if (!refreshed.ok) throw new Error(`${refreshed.error.code}: ${refreshed.error.message}`);
      if (refreshed.value.scene.elements.length !== result.value.elementCount) {
        throw new Error("draw2code_update write verification failed: element count changed before read-back");
      }
      const verificationError = verifyAppliedOps(ops, refreshed.value.scene.elements);
      if (verificationError !== null) throw new Error(`draw2code_update write verification failed: ${verificationError}`);
      rememberSnapshot(key, { rev: refreshed.value.rev, elements: refreshed.value.scene.elements });
      const selected = await store.setActiveBoard(args.root, target.name);
      if (!selected.ok) throw new Error(`draw2code_update verified but could not select its board: ${selected.error.code}: ${selected.error.message}`);
      const revealed = await store.publishBoardReveal(args.root, target.name);
      if (!revealed.ok) throw new Error(`draw2code_update verified but could not queue its board reveal: ${revealed.error.code}: ${revealed.error.message}`);
      const qualityWarnings = layoutWarnings(refreshed.value.scene.elements);
      return {
        rev: result.value.rev,
        targetBoard: target.name,
        activeBoard: selected.value.name,
        elementCount: result.value.elementCount,
        applied: result.value.applied,
        verified: true,
        revealRequestId: revealed.value.id,
        layoutWarnings: qualityWarnings,
        requiresConfirmation: false,
        pending: false,
        userSummary: finalPlanSummary,
        planSummary: finalPlanSummary,
        summary: {
          userChanges,
          plannedChanges
        }
      };
    }
  });
}
function visualBriefFor(direction, device, frameNames) {
  const mobile = device === "mobile" || device === "\u79FB\u52A8\u7AEF H5";
  const focalPage = frameNames[0] ?? "\u6838\u5FC3\u9875\u9762";
  const darkTech = /未来|科技|深色|赛博/iu.test(direction);
  const warm = /温暖|友好|生活|亲切|轻松/iu.test(direction);
  const professional = /专业|数据|稳重|效率/iu.test(direction);
  const bold = /大胆|鲜明|活力|年轻/iu.test(direction);
  return {
    direction,
    tone: darkTech ? "\u6C89\u6D78\u3001\u7CBE\u786E\u3001\u6709\u660E\u786E\u9AD8\u4EAE\u7126\u70B9\uFF0C\u907F\u514D\u628A\u6240\u6709\u533A\u57DF\u90FD\u505A\u6210\u53D1\u5149\u9762\u677F" : warm ? "\u4EB2\u5207\u3001\u677E\u5F1B\u3001\u53EF\u4FE1\uFF0C\u4F7F\u7528\u514B\u5236\u88C5\u9970\u4FDD\u6301\u4EFB\u52A1\u6E05\u6670" : professional ? "\u9AD8\u6548\u3001\u53EF\u9760\u3001\u5C42\u7EA7\u6E05\u695A\uFF0C\u6570\u636E\u4E0E\u72B6\u6001\u4F18\u5148" : bold ? "\u8F7B\u5FEB\u3001\u4E3B\u52A8\u3001\u6709\u8BC6\u522B\u5EA6\uFF0C\u4EE5\u5C11\u91CF\u9AD8\u5BF9\u6BD4\u7126\u70B9\u5E26\u52A8\u9875\u9762" : "\u514B\u5236\u3001\u6E05\u6670\u3001\u6709\u660E\u786E\u89C6\u89C9\u91CD\u5FC3\uFF0C\u907F\u514D\u901A\u7528\u6A21\u677F\u611F",
    background: darkTech ? "\u6DF1\u8272\u4F4E\u566A\u58F0\u5E95\u8272\uFF0C\u5185\u5BB9\u533A\u4FDD\u6301\u8DB3\u591F\u5BF9\u6BD4\u5EA6" : "\u4F4E\u9971\u548C\u4E2D\u6027\u5E95\u8272\uFF0C\u5361\u7247\u4E0E\u4E3B\u5185\u5BB9\u5F62\u6210\u6E05\u695A\u5C42\u6B21",
    primaryAction: bold || darkTech ? "\u4E3B\u64CD\u4F5C\u4F7F\u7528\u5355\u4E00\u9AD8\u5BF9\u6BD4\u5F3A\u8C03\u8272\uFF0C\u6BCF\u9875\u53EA\u7A81\u51FA\u4E00\u4E2A\u9996\u8981\u52A8\u4F5C" : "\u4E3B\u64CD\u4F5C\u4F7F\u7528\u7A33\u5B9A\u5F3A\u8C03\u8272\uFF0C\u6B21\u8981\u64CD\u4F5C\u964D\u4F4E\u5BF9\u6BD4\u5EA6",
    semanticColors: "\u6210\u529F\u3001\u63D0\u9192\u3001\u5371\u9669\u3001\u4FE1\u606F\u72B6\u6001\u4F7F\u7528\u53EF\u533A\u5206\u7684\u8BED\u4E49\u8272\uFF1B\u4E0D\u80FD\u7528\u54C1\u724C\u8272\u4EE3\u66FF\u5168\u90E8\u72B6\u6001",
    density: professional ? "\u4FE1\u606F\u5BC6\u5EA6\u9002\u4E2D\u504F\u7D27\u51D1\uFF0C\u4F46\u4FDD\u8BC1\u89E6\u63A7\u9762\u79EF\u548C\u626B\u8BFB\u95F4\u8DDD" : "\u4FDD\u6301\u8212\u9002\u7559\u767D\uFF0C\u76F8\u5173\u5185\u5BB9\u7D27\u51D1\u6210\u7EC4\uFF0C\u4E0D\u5E73\u5747\u5206\u914D\u7A7A\u95F4",
    typeHierarchy: "\u81F3\u5C11\u5EFA\u7ACB\u9875\u9762\u6807\u9898\u3001\u533A\u5757\u6807\u9898\u3001\u6B63\u6587\u3001\u8F85\u52A9\u4FE1\u606F\u56DB\u7EA7\u5C42\u6B21\uFF0C\u7981\u6B62\u6240\u6709\u6587\u5B57\u540C\u5B57\u53F7\u540C\u5B57\u91CD",
    layoutStrategy: mobile ? "\u4EE5\u5185\u5BB9\u6D41\u3001CSS Grid/Flex \u548C\u54CD\u5E94\u5F0F\u7EA6\u675F\u91CD\u6392\uFF1B\u9002\u914D 320\u2013430px \u624B\u673A\u5BBD\u5EA6\uFF0C\u4E0D\u590D\u5236\u539F\u578B\u7EDD\u5BF9\u5750\u6807" : "\u4EE5\u5185\u5BB9\u6D41\u3001CSS Grid/Flex \u548C\u5BB9\u5668\u7EA6\u675F\u91CD\u6392\uFF1B\u968F\u89C6\u53E3\u54CD\u5E94\uFF0C\u4E0D\u590D\u5236\u539F\u578B\u7EDD\u5BF9\u5750\u6807",
    motion: "\u53EA\u4E3A\u9875\u9762\u5207\u6362\u3001\u72B6\u6001\u53D8\u5316\u548C\u64CD\u4F5C\u53CD\u9988\u4F7F\u7528\u77ED\u52A8\u6548\uFF0C\u5C0A\u91CD prefers-reduced-motion",
    focalPoint: "\u8BA9\u7528\u6237\u9996\u5148\u770B\u5230\u300C" + focalPage + "\u300D\u7684\u6838\u5FC3\u4EFB\u52A1\u6216\u5173\u952E\u72B6\u6001\uFF0C\u800C\u4E0D\u662F\u540C\u65F6\u5F3A\u8C03\u6240\u6709\u7EC4\u4EF6"
  };
}
function buildGenerateInstructions(board, frameNames, existingPages, visualBrief) {
  const lines = [
    "\u6309\u4EE5\u4E0B\u8981\u6C42\u751F\u6210\u524D\u7AEF\u9875\u9762\uFF1A",
    "1. \u753B\u677F\u539F\u578B\u662F\u4EA7\u54C1\u4E8B\u5B9E\u6765\u6E90\uFF1A\u5FC5\u987B\u4FDD\u7559" + (frameNames.length > 0 ? "\u300C" + frameNames.join("\u300D\u300C") + "\u300D\u8FD9\u4E9B\u8303\u56F4\u7684" : "\u6574\u5757\u753B\u677F\u7684") + "\u9875\u9762\u3001\u4FE1\u606F\u5C42\u7EA7\u3001\u6587\u6848\u3001mock \u6570\u636E\u3001\u7EC4\u4EF6\u8BED\u4E49\u548C\u4EA4\u4E92\u5173\u7CFB\uFF1B\u7981\u6B62\u6DFB\u52A0\u539F\u578B\u4E2D\u4E0D\u5B58\u5728\u7684\u6A21\u5757\u3001\u9875\u9762\u3001\u89D2\u8272\u3001\u6D41\u7A0B\u6216\u91CD\u5927\u4E1A\u52A1\u89C4\u5219\u3002",
    "2. \u539F\u578B\u4E0D\u662F\u50CF\u7D20\u6A21\u677F\u3002\u7981\u6B62\u7167\u642C Excalidraw \u7684\u7EDD\u5BF9\u5750\u6807\u3001\u65B9\u6846\u5C3A\u5BF8\u548C\u4F4E\u4FDD\u771F\u7A7A\u767D\uFF1B\u4F7F\u7528\u8BED\u4E49\u5316 HTML\u3001\u5185\u5BB9\u6D41\u3001CSS Grid\u3001Flex \u548C\u5BB9\u5668\u7EA6\u675F\u91CD\u65B0\u6392\u7248\u3002absolute/fixed \u53EA\u7528\u4E8E\u786E\u6709\u5FC5\u8981\u7684\u6D6E\u5C42\u3001\u88C5\u9970\u6216\u56FA\u5B9A\u5BFC\u822A\u3002",
    "3. \u82E5\u539F\u578B\u662F\u79FB\u52A8\u7AEF\u5E03\u5C40\uFF0C\u751F\u6210 H5 \u9875\u9762\u672C\u4F53\uFF0C\u4E0D\u8981\u5957\u624B\u673A\u8FB9\u6846\uFF1B\u81F3\u5C11\u9002\u914D 320\u2013430px \u624B\u673A\u5BBD\u5EA6\uFF0C\u5E76\u4FDD\u8BC1\u684C\u9762\u9884\u89C8\u65F6\u5185\u5BB9\u7A33\u5B9A\u5C45\u4E2D\u3001\u65E0\u6A2A\u5411\u6EA2\u51FA\u3002",
    "4. \u8F93\u51FA\u5230 draw2code-pages/" + board + "/index.html\uFF1A\u5355\u6587\u4EF6\u3001\u5185\u8054 CSS/JS\u3001\u53EF\u76F4\u63A5\u5728\u6D4F\u89C8\u5668\u6253\u5F00\uFF1B\u591A\u4E2A\u9875\u9762\u653E\u5728\u540C\u4E00\u6587\u4EF6\u5185\u5E76\u4E92\u76F8\u5BFC\u822A\u3002\u6BCF\u4E2A\u9875\u9762\u6839\u8282\u70B9\u524D\u540E\u5FC5\u987B\u4FDD\u7559 <!-- d2c-page:<\u9875\u9762\u539F\u540D>:start --> \u548C <!-- d2c-page:<\u9875\u9762\u539F\u540D>:end -->\uFF0C\u4F9B\u540E\u7EED\u91CD\u65B0\u751F\u6210\u65F6\u7CBE\u786E\u4FDD\u62A4\u672A\u9009\u9875\u9762\u3002",
    existingPages.length > 0 ? "5. draw2code-pages/" + board + "/ \u5DF2\u6709\u9875\u9762\uFF08" + existingPages.join("\u3001") + "\uFF09\uFF1A\u5148\u8BFB\u53D6\u73B0\u6709 index.html\uFF0C\u6CBF\u7528\u5176\u6280\u672F\u5B9E\u73B0\uFF0C\u53EA\u66F4\u65B0\u672C\u6B21\u8303\u56F4\u5185\u7684\u9875\u9762\uFF0C\u4FDD\u6301\u5176\u4F59\u9875\u9762\u4E0D\u53D8\u3002" : "5. draw2code-pages/" + board + "/ \u76EE\u524D\u4E3A\u7A7A\uFF1A\u4ECE\u96F6\u751F\u6210\uFF0C\u4F46\u4E0D\u80FD\u9000\u5316\u6210\u65E0\u5C42\u7EA7\u7684\u901A\u7528\u6A21\u677F\u3002",
    "6. \u4F7F\u7528\u4EE5\u4E0B\u7ED3\u6784\u5316\u89C6\u89C9\u7B80\u62A5\uFF0C\u800C\u4E0D\u662F\u53EA\u628A\u201C" + visualBrief.direction + "\u201D\u5F53\u4F5C\u7A7A\u6CDB\u5F62\u5BB9\u8BCD\uFF1A\n   - \u6C14\u8D28\uFF1A" + visualBrief.tone + "\n   - \u80CC\u666F\uFF1A" + visualBrief.background + "\n   - \u4E3B\u64CD\u4F5C\uFF1A" + visualBrief.primaryAction + "\n   - \u8BED\u4E49\u8272\uFF1A" + visualBrief.semanticColors + "\n   - \u5BC6\u5EA6\uFF1A" + visualBrief.density + "\n   - \u5B57\u4F53\u5C42\u7EA7\uFF1A" + visualBrief.typeHierarchy + "\n   - \u5E03\u5C40\u7B56\u7565\uFF1A" + visualBrief.layoutStrategy + "\n   - \u52A8\u6548\uFF1A" + visualBrief.motion + "\n   - \u89C6\u89C9\u7126\u70B9\uFF1A" + visualBrief.focalPoint,
    "7. \u9075\u5FAA\u4E13\u4E1A\u524D\u7AEF\u8BBE\u8BA1\u89C4\u8303\uFF1A\u5148\u5EFA\u7ACB CSS \u8BBE\u8BA1\u53D8\u91CF\uFF1B\u6BCF\u9875\u53EA\u7A81\u51FA\u4E00\u4E2A\u4E3B\u8981\u4EFB\u52A1\uFF1B\u907F\u514D\u65E0\u76EE\u7684\u6E10\u53D8\u3001\u8FC7\u5EA6\u5706\u89D2\u3001\u5E73\u5747\u7528\u529B\u548C\u5343\u7BC7\u4E00\u5F8B\u7684 AI \u6A21\u677F\u611F\uFF1B\u771F\u5B9E mock \u6570\u636E\u5FC5\u987B\u53C2\u4E0E\u6392\u7248\u3002",
    "8. \u82E5\u672C\u6B21\u7528\u6237\u6D88\u606F\u9644\u5E26\u4E86\u754C\u9762\u53C2\u8003\u56FE\uFF1A\u53C2\u8003\u5176\u914D\u8272\u3001\u5B57\u4F53\u611F\u89C9\u4E0E\u5E03\u5C40\u5BC6\u5EA6\uFF0C\u4F46\u9875\u9762\u5185\u5BB9\u4ECD\u4EE5\u753B\u677F\u539F\u578B\u4E3A\u51C6\u3002",
    "9. \u53EF\u4EE5\u8865\u5145\u5FC5\u586B\u6821\u9A8C\u3001\u52A0\u8F7D\u3001\u6210\u529F\u63D0\u793A\u548C\u9009\u4E2D\u6001\u7B49\u901A\u7528\u4EA4\u4E92\u53CD\u9988\uFF0C\u4F46\u4E0D\u5F97\u65B0\u589E\u4EA7\u54C1\u4E8B\u5B9E\u3002",
    "10. \u5199\u5165\u540E\u5FC5\u987B\u81EA\u52A8\u6253\u5F00\u771F\u5B9E\u6D4F\u89C8\u5668\u9884\u89C8\uFF0C\u9010\u9875\u622A\u56FE\u5E76\u5B9E\u9645\u9A8C\u8BC1\uFF1A\u6240\u9009\u9875\u9762\u548C mock \u6570\u636E\u53EF\u89C1\u3001\u9875\u9762\u5207\u6362\u4E0E\u6838\u5FC3\u6309\u94AE\u53EF\u7528\u3001\u6838\u5FC3\u6D41\u7A0B\u8D70\u901A\u3001\u63A7\u5236\u53F0\u65E0 error/warning\u3001\u65E0\u6A2A\u5411\u6EA2\u51FA\u6216\u5185\u5BB9\u88C1\u5207\u3001\u6309\u94AE\u6587\u6848\u5C45\u4E2D\u3001\u5E95\u90E8\u5BFC\u822A\u5B8C\u6574\u3002\u53D1\u73B0\u5B9E\u73B0\u95EE\u9898\u8981\u76F4\u63A5\u4FEE\u590D\u5E76\u91CD\u65B0\u9A8C\u8BC1\u3002",
    "11. \u8C03\u7528 action=complete \u65F6\u5FC5\u987B\u63D0\u4EA4 verificationEvidence\uFF1A\u672C\u6B21\u6D4F\u89C8\u5668\u9A8C\u6536\u552F\u4E00 captureId\u3001\u751F\u6210\u5165\u53E3 outputSha256\u3001previewUrl\u3001viewports\uFF1B\u8986\u76D6\u6BCF\u4E2A\u6240\u9009\u9875\u9762\u7684 screenshots[{page,viewport,source,sha256,captureId}]\uFF1B\u6D4F\u89C8\u5668\u5BFC\u51FA\u7684 domSnapshots[{page,source,sha256,captureId}]\uFF1BconsoleErrors\u3001consoleWarnings\u3001domChecks\u3001layoutChecks \u548C interactionChecks\u3002previewUrl \u5185\u5BB9\u54C8\u5E0C\u5FC5\u987B\u7B49\u4E8E outputSha256\uFF1B\u622A\u56FE\u548C DOM \u5FEB\u7167\u5FC5\u987B\u4FDD\u5B58\u5230 workspace \u5185\u3001\u5C5E\u4E8E\u540C\u4E00 captureId\uFF0Csha256 \u5FC5\u987B\u4E0E\u6587\u4EF6\u4E00\u81F4\uFF1B\u4E0D\u80FD\u518D\u7528\u51E0\u4E2A\u81EA\u62A5\u5E03\u5C14\u503C\u4EE3\u66FF\u8BC1\u636E\u3002",
    "12. \u53EA\u6709\u771F\u5B9E\u9884\u89C8\u8BC1\u636E\u901A\u8FC7\u5DE5\u5177\u95E8\u7981\u540E\uFF0C\u624D\u8C03\u7528 draw2code_generate action=complete\uFF1B\u5728 complete \u8FD4\u56DE completed \u4E4B\u524D\u4E0D\u5F97\u5411\u7528\u6237\u62A5\u544A\u751F\u6210\u5B8C\u6210\u3002"
  ];
  return lines.join("\n");
}
function generateError(code, message, draft) {
  return {
    status: "error",
    error: { code, message, recoverable: code !== "invalid-action" },
    ...draft === void 0 ? {} : {
      sessionId: draft.sessionId,
      revision: draft.revision,
      board: draft.board
    }
  };
}
function namedFrames(elements) {
  return elements.filter((element) => str2(element.type) === "frame" && str2(element.name).trim() !== "");
}
function pageScopeQuestion(frames, recommended, recommendationReasons = /* @__PURE__ */ new Map()) {
  const recommendedSet = new Set(recommended);
  const orderedFrames = [...frames].sort((left, right) => {
    const leftRecommended = recommendedSet.has(str2(left.name).trim()) ? 0 : 1;
    const rightRecommended = recommendedSet.has(str2(right.name).trim()) ? 0 : 1;
    return leftRecommended - rightRecommended;
  });
  return {
    id: "page-scope",
    text: "\u8FD9\u6B21\u8981\u628A\u54EA\u4E9B\u539F\u578B\u9875\u9762\u751F\u6210\u6210\u53EF\u4F53\u9A8C\u7684\u524D\u7AEF Demo\uFF1F",
    selectionMode: "multiple",
    minSelections: 1,
    allowOther: false,
    options: orderedFrames.map((frame) => {
      const name2 = str2(frame.name).trim();
      const isRecommended = recommendedSet.has(name2);
      const displayLabel = `${name2}${isRecommended ? "\uFF08\u63A8\u8350\uFF09" : ""}`;
      return {
        id: displayLabel,
        label: displayLabel,
        valueLabel: name2,
        description: isRecommended ? "\u5EFA\u8BAE\u7EB3\u5165\u672C\u6B21\u751F\u6210\u8303\u56F4\uFF1B\u5BBF\u4E3B\u6682\u4E0D\u652F\u6301\u81EA\u52A8\u9884\u52FE\u9009\uFF0C\u53EF\u76F4\u63A5\u53D6\u6D88\u6216\u6539\u9009" : "\u672C\u6B21\u53EF\u9009\u9875\u9762",
        ...isRecommended ? { recommended: true, reason: recommendationReasons.get(name2) ?? "\u5F53\u524D\u753B\u677F\u6838\u5FC3\u6D41\u7A0B\u9875\u9762" } : {}
      };
    }),
    recommendedValues: recommended.map((name2) => `${name2}\uFF08\u63A8\u8350\uFF09`)
  };
}
function directlyConnectedFrames(elements, requested) {
  if (requested.length === 0) return [];
  const frames = namedFrames(elements);
  const frameById = new Map(frames.map((frame) => [str2(frame.id), frame]));
  const elementById = new Map(elements.map((element) => [str2(element.id), element]));
  const ownerFrame = (element) => {
    if (element === void 0) return void 0;
    if (str2(element.type) === "frame") return element;
    const explicit = frameById.get(str2(element.frameId));
    if (explicit !== void 0) return explicit;
    const cx = num2(element.x) + num2(element.width) / 2;
    const cy = num2(element.y) + num2(element.height) / 2;
    return frames.find((frame) => cx >= num2(frame.x) && cx <= num2(frame.x) + num2(frame.width) && cy >= num2(frame.y) && cy <= num2(frame.y) + num2(frame.height));
  };
  const nearestFrame = (x, y) => frames.map((frame) => {
    const left = num2(frame.x);
    const top = num2(frame.y);
    const right = left + num2(frame.width);
    const bottom = top + num2(frame.height);
    const dx = x < left ? left - x : x > right ? x - right : 0;
    const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
    return { frame, distance: Math.hypot(dx, dy) };
  }).filter(({ distance }) => distance <= 48).sort((left, right) => left.distance - right.distance)[0]?.frame;
  const bindingFrame = (arrow, key) => {
    const binding = typeof arrow[key] === "object" && arrow[key] !== null ? arrow[key] : {};
    return ownerFrame(elementById.get(str2(binding.elementId)));
  };
  const connected = /* @__PURE__ */ new Set();
  for (const arrow of elements.filter((element) => str2(element.type) === "arrow")) {
    const points = Array.isArray(arrow.points) ? arrow.points : [];
    const first = Array.isArray(points[0]) ? points[0] : [0, 0];
    const last = Array.isArray(points.at(-1)) ? points.at(-1) : [num2(arrow.width), num2(arrow.height)];
    const start = bindingFrame(arrow, "startBinding") ?? nearestFrame(num2(arrow.x) + num2(first[0]), num2(arrow.y) + num2(first[1]));
    const end = bindingFrame(arrow, "endBinding") ?? nearestFrame(num2(arrow.x) + num2(last[0]), num2(arrow.y) + num2(last[1]));
    const startName = str2(start?.name).trim();
    const endName = str2(end?.name).trim();
    if (startName !== "" && endName !== "" && startName !== endName) {
      if (requested.includes(startName) && !requested.includes(endName)) connected.add(endName);
      if (requested.includes(endName) && !requested.includes(startName)) connected.add(startName);
    }
  }
  return [...connected];
}
function inferDevice(frames) {
  let mobile = 0;
  let desktop = 0;
  for (const frame of frames) {
    const width = num2(frame.width);
    const height = num2(frame.height);
    if (width <= 600 && height > width) mobile += 1;
    else if (width >= 760 || width > height * 1.15) desktop += 1;
  }
  if (mobile > 0 && desktop > 0) return "mixed";
  if (mobile > 0) return "mobile";
  if (desktop > 0) return "desktop";
  return "ambiguous";
}
function deviceQuestion() {
  return {
    id: "target-device",
    text: "\u6240\u9009\u9875\u9762\u540C\u65F6\u51FA\u73B0\u79FB\u52A8\u7AEF\u548C\u684C\u9762\u7AEF\u5C3A\u5BF8\uFF0C\u8FD9\u6B21\u4EE5\u54EA\u79CD\u7248\u672C\u4E3A\u4E3B\uFF1F",
    selectionMode: "single",
    minSelections: 1,
    allowOther: false,
    options: [
      { id: "mobile", label: "\u79FB\u52A8\u7AEF H5\uFF08\u63A8\u8350\uFF09", valueLabel: "\u79FB\u52A8\u7AEF H5", description: "\u4EE5\u624B\u673A\u9875\u9762\u4E3A\u4E3B\u751F\u6210", recommended: true, reason: "\u9002\u5408\u76F4\u63A5\u5728 DSH \u9884\u89C8\u4E2D\u4F53\u9A8C\u6838\u5FC3\u6D41\u7A0B" },
      { id: "desktop", label: "\u684C\u9762 Web", description: "\u4EE5\u684C\u9762\u9875\u9762\u4E3A\u4E3B\u751F\u6210" },
      { id: "separate", label: "\u5206\u522B\u751F\u6210", description: "\u5728\u540C\u4E00 HTML \u4E2D\u4FDD\u7559\u4E24\u5957\u539F\u578B\u5E03\u5C40" }
    ],
    recommendedValues: ["mobile"]
  };
}
function visualQuestion(elements) {
  const corpus = elements.map((element) => `${str2(element.name)} ${str2(element.text)}`).join(" ");
  const social = /社交|雷达|好友|聊天|附近|碰一碰/u.test(corpus);
  const dataTool = /统计|日历|万年历|图表|清单|任务|管理/u.test(corpus);
  const options = social ? [
    { id: "young-vibrant", label: "\u5E74\u8F7B\u6D3B\u529B\uFF08\u63A8\u8350\uFF09", valueLabel: "\u5E74\u8F7B\u6D3B\u529B", description: "\u6E05\u723D\u9AD8\u5BF9\u6BD4\u3001\u8F7B\u91CF\u52A8\u6548\uFF0C\u5F3A\u8C03\u53D1\u73B0\u4E0E\u8FDE\u63A5", recommended: true, reason: "\u9002\u5408\u793E\u4EA4\u4EA7\u54C1\u7684\u63A2\u7D22\u4E0E\u4E92\u52A8\u6C1B\u56F4" },
    { id: "future-tech", label: "\u672A\u6765\u79D1\u6280", description: "\u6DF1\u8272\u80CC\u666F\u3001\u96F7\u8FBE\u5149\u6548\u4E0E\u9AD8\u4EAE\u72B6\u6001" },
    { id: "warm-authentic", label: "\u6E29\u6696\u771F\u5B9E", description: "\u67D4\u548C\u8272\u5F69\u4E0E\u4EBA\u7269\u5185\u5BB9\u4F18\u5148" },
    { id: "minimal-light", label: "\u6781\u7B80\u8F7B\u91CF", description: "\u51CF\u5C11\u88C5\u9970\uFF0C\u7A81\u51FA\u6838\u5FC3\u64CD\u4F5C" },
    { id: "custom", label: "\u81EA\u5B9A\u4E49", description: "\u8865\u5145\u4E00\u4E2A\u6574\u4F53\u89C6\u89C9\u65B9\u5411" }
  ] : dataTool ? [
    { id: "clean-modern", label: "\u7B80\u6D01\u73B0\u4EE3\uFF08\u63A8\u8350\uFF09", valueLabel: "\u7B80\u6D01\u73B0\u4EE3", description: "\u6E05\u6670\u5C42\u7EA7\u3001\u514B\u5236\u914D\u8272\u4E0E\u8212\u9002\u7559\u767D", recommended: true, reason: "\u9002\u5408\u5DE5\u5177\u7C7B\u4EA7\u54C1\u9AD8\u9891\u9605\u8BFB\u548C\u64CD\u4F5C" },
    { id: "professional-tool", label: "\u4E13\u4E1A\u5DE5\u5177", description: "\u7D27\u51D1\u5E03\u5C40\u3001\u660E\u786E\u6570\u636E\u5C42\u7EA7" },
    { id: "data-clear", label: "\u6570\u636E\u6E05\u6670", description: "\u5F3A\u5316\u56FE\u8868\u3001\u6570\u5B57\u4E0E\u72B6\u6001\u5BF9\u6BD4" },
    { id: "relaxed-life", label: "\u8F7B\u677E\u751F\u6D3B", description: "\u67D4\u548C\u8272\u5F69\u4E0E\u66F4\u4EB2\u5207\u7684\u7EC4\u4EF6\u8868\u8FBE" },
    { id: "custom", label: "\u81EA\u5B9A\u4E49", description: "\u8865\u5145\u4E00\u4E2A\u6574\u4F53\u89C6\u89C9\u65B9\u5411" }
  ] : [
    { id: "clean-modern", label: "\u7B80\u6D01\u73B0\u4EE3\uFF08\u63A8\u8350\uFF09", valueLabel: "\u7B80\u6D01\u73B0\u4EE3", description: "\u6E05\u6670\u5C42\u7EA7\u3001\u514B\u5236\u914D\u8272\u4E0E\u8212\u9002\u7559\u767D", recommended: true, reason: "\u5BF9\u5F53\u524D\u539F\u578B\u6700\u7A33\u59A5\u7684\u9ED8\u8BA4\u65B9\u5411" },
    { id: "professional", label: "\u4E13\u4E1A\u7A33\u91CD", description: "\u7D27\u51D1\u3001\u53EF\u9760\u3001\u4FE1\u606F\u5BC6\u5EA6\u66F4\u9AD8" },
    { id: "friendly", label: "\u8F7B\u677E\u53CB\u597D", description: "\u67D4\u548C\u8272\u5F69\u4E0E\u4EB2\u5207\u53CD\u9988" },
    { id: "bold", label: "\u9C9C\u660E\u5927\u80C6", description: "\u66F4\u5F3A\u5BF9\u6BD4\u4E0E\u89C6\u89C9\u7126\u70B9" },
    { id: "custom", label: "\u81EA\u5B9A\u4E49", description: "\u8865\u5145\u4E00\u4E2A\u6574\u4F53\u89C6\u89C9\u65B9\u5411" }
  ];
  return {
    id: "visual-direction",
    text: "\u9996\u6B21\u751F\u6210\u60F3\u91C7\u7528\u54EA\u4E00\u79CD\u6574\u4F53\u89C6\u89C9\u65B9\u5411\uFF1F",
    selectionMode: "single",
    minSelections: 1,
    allowOther: true,
    options,
    recommendedValues: [options.find((option) => option.recommended)?.id ?? options[0].id]
  };
}
function elementsInFrames(elements, frameNames) {
  const selected = namedFrames(elements).filter((frame) => frameNames.includes(str2(frame.name).trim()));
  const ids = new Set(selected.map((frame) => str2(frame.id)));
  const inRect = (element, frame) => {
    const cx = num2(element.x) + num2(element.width) / 2;
    const cy = num2(element.y) + num2(element.height) / 2;
    return cx >= num2(frame.x) && cx <= num2(frame.x) + num2(frame.width) && cy >= num2(frame.y) && cy <= num2(frame.y) + num2(frame.height);
  };
  const scoped = [...selected];
  const claimed = new Set(ids);
  let unframedElementCount = 0;
  for (const element of elements) {
    if (claimed.has(str2(element.id))) continue;
    const frameId = str2(element.frameId);
    const owned = frameId !== "" && ids.has(frameId) || selected.some((frame) => inRect(element, frame));
    if (owned) {
      scoped.push(element);
      claimed.add(str2(element.id));
    } else if (str2(element.type) !== "frame" && frameId === "") {
      unframedElementCount += 1;
    }
  }
  return { frames: selected, elements: scoped, unframedElementCount };
}
function emptyFrameIssues(frames, elements) {
  return frames.flatMap((frame) => {
    const id = str2(frame.id);
    const meaningful = elements.some((element) => {
      if (element === frame || str2(element.type) !== "text" || str2(element.text).trim() === "") return false;
      if (str2(element.frameId) === id) return true;
      const cx = num2(element.x) + num2(element.width) / 2;
      const cy = num2(element.y) + num2(element.height) / 2;
      return cx >= num2(frame.x) && cx <= num2(frame.x) + num2(frame.width) && cy >= num2(frame.y) && cy <= num2(frame.y) + num2(frame.height);
    });
    return meaningful ? [] : [{ code: "page-content-missing", id, message: `${str2(frame.name)} \u53EA\u6709\u7A7A\u6846\uFF0C\u65E0\u6CD5\u5224\u65AD\u9875\u9762\u5185\u5BB9\u548C\u7528\u9014` }];
  });
}
function elementBelongsToFrame(element, frame) {
  if (str2(element.frameId) === str2(frame.id)) return true;
  const cx = num2(element.x) + num2(element.width) / 2;
  const cy = num2(element.y) + num2(element.height) / 2;
  return cx >= num2(frame.x) && cx <= num2(frame.x) + num2(frame.width) && cy >= num2(frame.y) && cy <= num2(frame.y) + num2(frame.height);
}
function semanticMockDataIssues(frames, elements) {
  const repeatedContentPage = /列表|好友|聊天|消息|清单|统计|图表|日历|万年历|雷达|推荐|记录|详情/u;
  const genericUiText = /^(?:首页|列表|好友|聊天|消息|清单|统计|日历|雷达|推荐|详情|返回|保存|提交|确认|取消|搜索|筛选|新增|添加|我的|设置|发送|请输入.*)$/u;
  return frames.flatMap((frame) => {
    const name2 = str2(frame.name).trim();
    if (!repeatedContentPage.test(name2)) return [];
    const texts = elements.filter((element) => element !== frame && str2(element.type) === "text" && elementBelongsToFrame(element, frame));
    let records = 0;
    for (const element of texts) {
      const value = str2(element.text).trim();
      if (value === "" || value === name2 || genericUiText.test(value)) continue;
      const role = str2((typeof element.customData === "object" && element.customData !== null ? element.customData : {}).role).toLowerCase();
      const lines = value.split(/\r?\n/u).filter((line) => line.trim().length >= 2).length;
      if (role === "mock-data" || /\d|·|：|:|公里|km|米|m\b|已|待|完成|进行中|昨天|今天|刚刚/u.test(value) || value.length >= 8) {
        records += Math.max(1, Math.min(3, lines));
      }
    }
    return records >= 3 ? [] : [{
      code: "mock-data-insufficient",
      id: str2(frame.id),
      message: `${name2} \u9700\u8981\u81F3\u5C11 3 \u6761\u53EF\u8BFB mock \u6570\u636E\u5E2E\u52A9\u7406\u89E3\u9875\u9762\uFF1B\u5F53\u524D\u8BC6\u522B\u5230 ${records} \u6761`
    }];
  });
}
function recordValue(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function recordArray(value) {
  return Array.isArray(value) && value.every((item) => recordValue(item) !== null) ? value : null;
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function pathIsInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}
async function workspaceFile(root, source) {
  const sourceText = str2(source).trim();
  if (sourceText === "") return { ok: false, reason: "source" };
  try {
    const canonicalRoot = await realpath3(root);
    const candidate = isAbsolute(sourceText) ? sourceText : resolve(canonicalRoot, sourceText);
    const canonicalPath = await realpath3(candidate);
    if (!pathIsInside(canonicalRoot, canonicalPath)) return { ok: false, reason: "outside-workspace" };
    const handle = await open(canonicalPath, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile()) return { ok: false, reason: "not-a-file" };
      if (info.size === 0) return { ok: false, reason: "empty-file" };
      if (info.size > 20 * 1024 * 1024) return { ok: false, reason: "file-too-large" };
      const bytes = await handle.readFile();
      return { ok: true, bytes, path: canonicalPath };
    } finally {
      await handle.close();
    }
  } catch {
    return { ok: false, reason: "file-unreadable" };
  }
}
async function workspaceArtifact(root, source, expectedHash) {
  const hashText = str2(expectedHash).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(hashText)) return { ok: false, reason: "sha256" };
  const file = await workspaceFile(root, source);
  if (!file.ok) return file;
  return sha256(file.bytes) === hashText ? file : { ok: false, reason: "sha256-mismatch" };
}
function pngDimensions(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const imageData = [];
  let ended = false;
  try {
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd + 4 > bytes.length) return null;
      const data = bytes.subarray(dataStart, dataEnd);
      if (type === "IHDR") {
        if (length !== 13) return null;
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        const bitDepth = data[8];
        const colorType = data[9];
        const interlace = data[12];
        channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
        if (width <= 0 || height <= 0 || width * height > 1e7 || bitDepth !== 8 || channels === 0 || interlace !== 0) return null;
      } else if (type === "IDAT") {
        imageData.push(data);
      } else if (type === "IEND") {
        ended = true;
        break;
      }
      offset = dataEnd + 4;
    }
    if (!ended || width === 0 || height === 0 || imageData.length === 0) return null;
    const expectedLength = height * (1 + width * channels);
    const inflated = inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedLength });
    if (inflated.length !== expectedLength) return null;
    return { width, height };
  } catch {
    return null;
  }
}
async function previewHtml(root, previewUrl) {
  try {
    const url = new URL(previewUrl);
    let html = "";
    if (url.protocol === "file:") {
      const file = await workspaceFile(root, fileURLToPath(url));
      if (!file.ok) return { ok: false, reason: file.reason };
      html = file.bytes.toString("utf8");
    } else if (url.protocol === "http:" || url.protocol === "https:") {
      if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) return { ok: false, reason: "preview-not-loopback" };
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(3e3) });
      if (!response.ok) return { ok: false, reason: "preview-http-" + response.status };
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > 2 * 1024 * 1024) return { ok: false, reason: "preview-too-large" };
      if (response.body === null) return { ok: false, reason: "preview-empty-body" };
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > 2 * 1024 * 1024) {
          await reader.cancel();
          return { ok: false, reason: "preview-too-large" };
        }
        chunks.push(next.value);
      }
      html = Buffer.concat(chunks).toString("utf8");
    } else {
      return { ok: false, reason: "preview-protocol" };
    }
    if (Buffer.byteLength(html, "utf8") > 2 * 1024 * 1024) return { ok: false, reason: "preview-too-large" };
    return /<!doctype html|<html[\s>]/iu.test(html) ? { ok: true, html } : { ok: false, reason: "preview-not-html" };
  } catch {
    return { ok: false, reason: "preview-unreachable" };
  }
}
function normalizedVisibleText(value) {
  return value.replace(/\s+/gu, " ").trim();
}
function expectedPageTexts(frames, elements) {
  return Object.fromEntries(frames.map((frame) => {
    const name2 = str2(frame.name).trim();
    const texts = elements.filter((element) => str2(element.type) === "text" && elementBelongsToFrame(element, frame)).flatMap((element) => str2(element.text).split(/\r?\n/gu)).map(normalizedVisibleText).filter((value) => value !== "");
    return [name2, [...new Set(texts)]];
  }));
}
function pageBlock(html, page) {
  const start = "<!-- d2c-page:" + page + ":start -->";
  const end = "<!-- d2c-page:" + page + ":end -->";
  const startAt = html.indexOf(start);
  if (startAt < 0) return null;
  const contentAt = startAt + start.length;
  const endAt = html.indexOf(end, contentAt);
  return endAt < 0 ? null : html.slice(contentAt, endAt);
}
async function preparePagePreservation(root, draft) {
  const allFrames = draft.allFrames ?? draft.selectedFrames;
  draft.unselectedFrames = allFrames.filter((name2) => !draft.selectedFrames.includes(name2));
  draft.preservedPageHashes = {};
  if (!draft.hadExistingIndex || draft.unselectedFrames.length === 0) return;
  const file = await workspaceFile(root, resolve(root, "draw2code-pages", draft.board, "index.html"));
  if (!file.ok) return;
  const html = file.bytes.toString("utf8");
  for (const page of draft.unselectedFrames) {
    const block = pageBlock(html, page);
    if (block !== null) draft.preservedPageHashes[page] = sha256(block);
  }
}
async function preservedPagesStillMatch(root, draft) {
  const hashes = draft.preservedPageHashes ?? {};
  if (Object.keys(hashes).length === 0) return [];
  const file = await workspaceFile(root, resolve(root, "draw2code-pages", draft.board, "index.html"));
  if (!file.ok) return Object.keys(hashes);
  const html = file.bytes.toString("utf8");
  return Object.entries(hashes).filter(([page, hash]) => {
    const block = pageBlock(html, page);
    return block === null || sha256(block) !== hash;
  }).map(([page]) => page);
}
async function verificationEvidenceFor(root, raw, draft, outputHash) {
  const evidence = recordValue(raw);
  if (evidence === null) {
    return {
      ok: false,
      code: "verification-evidence-missing",
      message: "\u7F3A\u5C11 verificationEvidence\uFF1B\u5FC5\u987B\u63D0\u4EA4\u771F\u5B9E\u6D4F\u89C8\u5668 URL\u3001\u89C6\u53E3\u3001\u9010\u9875\u622A\u56FE\u3001\u63A7\u5236\u53F0\u3001DOM\u3001\u5E03\u5C40\u548C\u6838\u5FC3\u4EA4\u4E92\u8BC1\u636E"
    };
  }
  const missing = [];
  const failures = [];
  const captureId = str2(evidence.captureId).trim();
  if (captureId === "") missing.push("captureId");
  if (str2(evidence.outputSha256).trim().toLowerCase() !== outputHash) failures.push("outputSha256");
  const previewUrl = str2(evidence.previewUrl).trim();
  if (!/^(?:https?|file):\/\//iu.test(previewUrl)) {
    missing.push("previewUrl");
  } else {
    const preview = await previewHtml(root, previewUrl);
    if (!preview.ok) failures.push("previewUrl:" + preview.reason);
    else if (sha256(preview.html) !== outputHash) failures.push("previewUrl:output-mismatch");
  }
  const viewportKeys = /* @__PURE__ */ new Set();
  const viewports = recordArray(evidence.viewports);
  if (viewports === null || viewports.length === 0) {
    missing.push("viewports");
  } else {
    const validViewports = viewports.filter((viewport) => num2(viewport.width) > 0 && num2(viewport.height) > 0);
    for (const viewport of validViewports) viewportKeys.add(num2(viewport.width) + "x" + num2(viewport.height));
    if (validViewports.length !== viewports.length) missing.push("viewports.width/height");
    if ((draft.device === "mobile" || draft.device === "\u79FB\u52A8\u7AEF H5") && !validViewports.some((viewport) => num2(viewport.width) >= 320 && num2(viewport.width) <= 430 && num2(viewport.height) > num2(viewport.width))) {
      missing.push("320-430px mobile viewport");
    }
    if (draft.device === "desktop" && !validViewports.some((viewport) => num2(viewport.width) >= 1024)) {
      missing.push("desktop viewport >= 1024px");
    }
    if (draft.device === "separate") {
      if (!validViewports.some((viewport) => num2(viewport.width) >= 320 && num2(viewport.width) <= 430)) missing.push("mobile viewport");
      if (!validViewports.some((viewport) => num2(viewport.width) >= 1024)) missing.push("desktop viewport");
    }
  }
  const unselectedEvidencePages = draft.hadExistingIndex ? draft.unselectedFrames ?? [] : [];
  const evidencePages = [.../* @__PURE__ */ new Set([...draft.selectedFrames, ...unselectedEvidencePages])];
  const screenshots = recordArray(evidence.screenshots);
  if (screenshots === null || screenshots.length === 0) {
    missing.push("screenshots");
  } else {
    for (const page of evidencePages) {
      const shot = screenshots.find((candidate) => str2(candidate.page).trim() === page);
      if (shot === void 0) {
        missing.push("screenshot:" + page);
        continue;
      }
      if (str2(shot.captureId).trim() !== captureId) failures.push("screenshot:" + page + ":captureId");
      const viewport = str2(shot.viewport).trim();
      if (!viewportKeys.has(viewport)) missing.push("screenshot-viewport:" + page);
      const artifact = await workspaceArtifact(root, shot.source, shot.sha256);
      if (!artifact.ok) {
        failures.push("screenshot:" + page + ":" + artifact.reason);
        continue;
      }
      const dimensions = pngDimensions(artifact.bytes);
      const match = /^(\d+)x(\d+)$/u.exec(viewport);
      if (dimensions === null || match === null || dimensions.width !== Number(match[1]) || dimensions.height !== Number(match[2])) {
        failures.push("screenshot:" + page + ":dimensions");
      }
    }
  }
  const domSnapshots = recordArray(evidence.domSnapshots);
  if (domSnapshots === null || domSnapshots.length === 0) {
    missing.push("domSnapshots");
  } else {
    for (const page of evidencePages) {
      const snapshot = domSnapshots.find((candidate) => str2(candidate.page).trim() === page);
      if (snapshot === void 0) {
        missing.push("domSnapshot:" + page);
        continue;
      }
      if (str2(snapshot.captureId).trim() !== captureId) failures.push("domSnapshot:" + page + ":captureId");
      const artifact = await workspaceArtifact(root, snapshot.source, snapshot.sha256);
      if (!artifact.ok) {
        failures.push("domSnapshot:" + page + ":" + artifact.reason);
        continue;
      }
      const bodyText = normalizedVisibleText(artifact.bytes.toString("utf8"));
      for (const expected of draft.expectedPageTexts?.[page] ?? []) {
        if (!bodyText.includes(normalizedVisibleText(expected))) {
          failures.push("domText:" + page + ":" + expected.slice(0, 24));
        }
      }
    }
  }
  if (!Array.isArray(evidence.consoleErrors)) {
    missing.push("consoleErrors");
  } else if (evidence.consoleErrors.length > 0) {
    failures.push("consoleErrors");
  }
  if (!Array.isArray(evidence.consoleWarnings)) {
    missing.push("consoleWarnings");
  } else if (evidence.consoleWarnings.length > 0) {
    failures.push("consoleWarnings");
  }
  const requiredChecks = [
    ["domChecks", ["selected-pages", "mock-data", ...unselectedEvidencePages.length > 0 ? ["unselected-pages-preserved"] : []]],
    ["layoutChecks", ["no-horizontal-overflow", "content-not-clipped", "button-text-centered", "bottom-navigation-complete"]],
    ["interactionChecks", ["core-flow", ...draft.selectedFrames.length > 1 ? ["page-switching"] : []]]
  ];
  for (const [field, requiredNames] of requiredChecks) {
    const checks = recordArray(evidence[field]);
    if (checks === null || checks.length === 0) {
      missing.push(field);
      continue;
    }
    for (const requiredName of requiredNames) {
      const check = checks.find((item) => str2(item.name) === requiredName);
      if (check === void 0 || str2(check.details).trim() === "") missing.push(field + ":" + requiredName);
      else if (check.passed !== true) failures.push(field + ":" + requiredName);
    }
    for (const check of checks) {
      if (check.passed !== true) failures.push(field + ":" + (str2(check.name) || "unnamed"));
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      code: "verification-evidence-incomplete",
      message: "\u771F\u5B9E\u9884\u89C8\u8BC1\u636E\u4E0D\u5B8C\u6574\uFF1A" + [...new Set(missing)].join("\u3001")
    };
  }
  if (failures.length > 0) {
    return {
      ok: false,
      code: "verification-evidence-failed",
      message: "\u771F\u5B9E\u9884\u89C8\u53D1\u73B0\u672A\u4FEE\u590D\u95EE\u9898\uFF1A" + [...new Set(failures)].join("\u3001") + "\uFF1B\u5148\u4FEE\u590D\u9875\u9762\u5E76\u91CD\u65B0\u9A8C\u6536"
    };
  }
  return { ok: true, value: { ...evidence, verified: true } };
}
function briefFor(draft, existingPages) {
  const visualBrief = visualBriefFor(draft.visualDirection ?? "\u7B80\u6D01\u73B0\u4EE3", draft.device, draft.selectedFrames);
  return {
    board: draft.board,
    selectedPages: draft.selectedFrames,
    relatedPageRecommendations: (draft.recommendedFrames ?? []).filter((name2) => !draft.selectedFrames.includes(name2)),
    pageChanges: existingPages.includes("index.html") ? "\u53EA\u66F4\u65B0\u6240\u9009\u9875\u9762\uFF0C\u672A\u9009\u62E9\u9875\u9762\u4FDD\u6301\u4E0D\u53D8" : "\u9996\u6B21\u751F\u6210\u6240\u9009\u9875\u9762",
    visualDirection: draft.visualDirection,
    visualBrief,
    device: draft.device,
    prototypeCheck: draft.blockers.length === 0 ? "\u901A\u8FC7" : "\u6709\u963B\u65AD\u95EE\u9898",
    warnings: draft.warnings,
    assumptions: ["\u8F93\u51FA\u4E3A\u7EDF\u4E00\u5165\u53E3\u7684\u5355\u6587\u4EF6 HTML Demo", "\u5141\u8BB8\u8865\u5145\u901A\u7528\u4EA4\u4E92\u53CD\u9988\uFF0C\u4E0D\u65B0\u589E\u4EA7\u54C1\u9875\u9762\u6216\u4E1A\u52A1\u6D41\u7A0B"],
    preservedContent: existingPages.includes("index.html") ? ["\u672A\u9009\u62E9\u9875\u9762", "\u4E0D\u4E0E\u539F\u578B\u51B2\u7A81\u7684\u5DF2\u6709\u589E\u5F3A"] : [],
    conflicts: existingPages.includes("index.html") ? ["\u751F\u6210 Agent \u5FC5\u987B\u5148\u8BFB\u53D6\u73B0\u6709 index.html\uFF0C\u6838\u5BF9\u6240\u9009\u9875\u9762\u5185\u53EF\u80FD\u88AB\u8986\u76D6\u7684\u624B\u5DE5\u4FEE\u6539"] : [],
    output: `draw2code-pages/${draft.board}/index.html`
  };
}
function hostQuestionFor(question) {
  return {
    questions: [{
      id: question.id,
      question: question.text,
      header: question.id === "page-scope" ? "\u9875\u9762\u8303\u56F4" : question.id === "visual-direction" ? "\u89C6\u89C9\u65B9\u5411" : "\u76EE\u6807\u8BBE\u5907",
      options: question.options.map((option) => ({ label: option.label, description: option.description })),
      multi_select: question.selectionMode === "multiple"
    }]
  };
}
function responseFromDraft(draft, extras = {}) {
  const confirmation = draft.status === "ready" ? {
    id: "generate-brief-confirm",
    question: "\u6309\u8FD9\u4EFD\u751F\u6210\u7B80\u62A5\u5F00\u59CB\u751F\u6210\u524D\u7AEF Demo \u5417\uFF1F",
    selectionMode: "single",
    options: [
      { id: "confirm", label: "\u786E\u8BA4\u751F\u6210\uFF08\u63A8\u8350\uFF09", description: "\u7ACB\u5373\u6309\u7B80\u62A5\u751F\u6210\u5355\u6587\u4EF6 HTML\uFF0C\u5E76\u8FDB\u5165\u771F\u5B9E\u9884\u89C8\u9A8C\u6536" },
      { id: "revise-scope", label: "\u4FEE\u6539\u9875\u9762\u8303\u56F4", description: "\u8FD4\u56DE\u9875\u9762\u591A\u9009\uFF0C\u4E0D\u91CD\u590D\u8BE2\u95EE\u5176\u4ED6\u5DF2\u5B8C\u6210\u9009\u62E9" },
      { id: "revise-visual", label: "\u4FEE\u6539\u89C6\u89C9\u65B9\u5411", description: "\u91CD\u65B0\u9009\u62E9\u6574\u4F53\u89C6\u89C9\u65B9\u5411\uFF0C\u4FDD\u7559\u9875\u9762\u8303\u56F4" }
    ],
    askUserQuestionArgs: {
      questions: [{
        id: "generate-brief-confirm",
        question: "\u6309\u8FD9\u4EFD\u751F\u6210\u7B80\u62A5\u5F00\u59CB\u751F\u6210\u524D\u7AEF Demo \u5417\uFF1F",
        header: "\u751F\u6210\u786E\u8BA4",
        options: [
          { label: "\u786E\u8BA4\u751F\u6210\uFF08\u63A8\u8350\uFF09", description: "\u7ACB\u5373\u6309\u7B80\u62A5\u751F\u6210\u5355\u6587\u4EF6 HTML\uFF0C\u5E76\u8FDB\u5165\u771F\u5B9E\u9884\u89C8\u9A8C\u6536" },
          { label: "\u4FEE\u6539\u9875\u9762\u8303\u56F4", description: "\u8FD4\u56DE\u9875\u9762\u591A\u9009\uFF0C\u4E0D\u91CD\u590D\u8BE2\u95EE\u5176\u4ED6\u5DF2\u5B8C\u6210\u9009\u62E9" },
          { label: "\u4FEE\u6539\u89C6\u89C9\u65B9\u5411", description: "\u91CD\u65B0\u9009\u62E9\u6574\u4F53\u89C6\u89C9\u65B9\u5411\uFF0C\u4FDD\u7559\u9875\u9762\u8303\u56F4" }
        ],
        multi_select: false
      }]
    }
  } : null;
  return {
    status: draft.status,
    sessionId: draft.sessionId,
    revision: draft.revision,
    board: draft.board,
    ...draft.activeBoard === void 0 ? {} : { activeBoard: draft.activeBoard },
    ...draft.currentQuestion === null ? {} : {
      question: {
        ...draft.currentQuestion,
        askUserQuestionArgs: hostQuestionFor(draft.currentQuestion)
      }
    },
    ...draft.blockers.length === 0 ? {} : { blockers: draft.blockers },
    ...draft.warnings.length === 0 ? {} : { warnings: draft.warnings },
    ...draft.brief === null ? {} : { brief: draft.brief },
    ...confirmation === null ? {} : { confirmation },
    ...extras
  };
}
async function persistGeneration(store, root, draft, bump = true) {
  if (bump) draft.revision += 1;
  draft.updatedAt = Date.now();
  const saved = await store.writeGeneration(root, draft.sessionId, draft);
  return saved.ok ? null : generateError(saved.error.code, saved.error.message, draft);
}
async function loadGeneration(store, root, sessionId) {
  if (sessionId === void 0 || sessionId.trim() === "") return null;
  const loaded = await store.readGeneration(root, sessionId);
  return loaded.ok ? loaded.value : null;
}
async function runGeneratePreflight(store, root, draft) {
  const board = await store.read(root, draft.board);
  if (!board.ok) return generateError(board.error.code, board.error.message, draft);
  const allFrames = namedFrames(board.value.scene.elements);
  draft.allFrames = allFrames.map((frame) => str2(frame.name).trim());
  draft.unselectedFrames = draft.allFrames.filter((name2) => !draft.selectedFrames.includes(name2));
  draft.expectedPageTexts = expectedPageTexts(allFrames, board.value.scene.elements);
  const scope = elementsInFrames(board.value.scene.elements, draft.selectedFrames);
  if (scope.frames.length !== draft.selectedFrames.length) {
    const found = new Set(scope.frames.map((frame) => str2(frame.name)));
    const missing = draft.selectedFrames.filter((name2) => !found.has(name2));
    draft.blockers = [{ code: "frame-not-found", message: `\u6240\u9009\u9875\u9762\u5DF2\u4E0D\u5728\u753B\u677F\u4E0A\uFF1A${missing.join("\u3001")}` }];
  } else {
    const report = inspectPrototypeLayout(scope.elements);
    draft.blockers = [
      ...report.errors,
      ...emptyFrameIssues(scope.frames, scope.elements),
      ...semanticMockDataIssues(scope.frames, scope.elements)
    ];
    draft.warnings = report.warnings;
  }
  const existing = await store.existingPages(root, draft.board);
  if (!existing.ok) return generateError(existing.error.code, existing.error.message, draft);
  draft.currentQuestion = null;
  draft.status = draft.blockers.length > 0 ? "blocked" : "ready";
  draft.brief = draft.status === "ready" ? briefFor(draft, existing.value) : null;
  const failed = await persistGeneration(store, root, draft);
  if (failed !== null) return failed;
  return responseFromDraft(draft, draft.status === "blocked" ? { nextAction: "\u5148\u7528 draw2code_update \u4FEE\u590D\u753B\u677F\uFF1B\u7528\u6237\u68C0\u67E5\u540E\u8C03\u7528 action=recheck\uFF0C\u4FDD\u7559\u5DF2\u9009\u9875\u9762\u548C\u89C6\u89C9\u65B9\u5411" } : { nextAction: "\u5411\u7528\u6237\u5C55\u793A\u4E00\u6B21\u6700\u7EC8\u751F\u6210\u7B80\u62A5\uFF1B\u786E\u8BA4\u540E\u8C03\u7528 action=confirm" });
}
async function generationPayload(store, root, draft) {
  const board = await store.read(root, draft.board);
  if (!board.ok) return generateError(board.error.code, board.error.message, draft);
  const scope = elementsInFrames(board.value.scene.elements, draft.selectedFrames);
  const existing = await store.existingPages(root, draft.board);
  if (!existing.ok) return generateError(existing.error.code, existing.error.message, draft);
  const summary = scope.elements.map(describeElement).join("\n");
  const elementsJson = JSON.stringify(scope.elements);
  const elementsBytes = Buffer.byteLength(elementsJson, "utf8");
  const payload = elementsBytes <= MAX_ELEMENTS_JSON ? scope.elements : [{ id: "__too_large__", type: "text", text: `scoped elements JSON is ${elementsBytes} UTF-8 bytes (> ${MAX_ELEMENTS_JSON}); draw2code_read the board instead` }];
  const quality = inspectPrototypeLayout(scope.elements);
  const layoutIssues = [...quality.errors, ...quality.warnings];
  const visualBrief = visualBriefFor(draft.visualDirection ?? "\u7B80\u6D01\u73B0\u4EE3", draft.device, draft.selectedFrames);
  const instructions = buildGenerateInstructions(draft.board, draft.selectedFrames, existing.value, visualBrief) + (layoutIssues.length > 0 ? `
13. \u539F\u578B\u975E\u963B\u65AD\u63D0\u9192\uFF1A
${formatLayoutIssues(layoutIssues)}` : "");
  return responseFromDraft(draft, {
    nextAction: "write-html-then-preview-and-validate",
    scope: "frames",
    frameNames: draft.selectedFrames,
    summary,
    elements: payload,
    unframedElementCount: scope.unframedElementCount,
    layoutWarnings: layoutIssues,
    existingPages: existing.value,
    outputDir: `draw2code-pages/${draft.board}/`,
    instructions
  });
}
function draw2codeGenerateTool(store, projects) {
  return defineTool2({
    name: "draw2code_generate",
    description: "Turn selected \u753B\u7801 frames into a verified, interactive, single-file HTML Demo through a resumable choice-first flow. On any explicit \u201C\u751F\u6210\u9875\u9762 / \u6839\u636E\u753B\u677F\u751F\u6210\u524D\u7AEF / \u91CD\u65B0\u751F\u6210\u201D request, call action=start immediately. The first result always asks the user to select pages from every frame; pass user-mentioned frames only as recommendations, never skip the choice. Use the host choice UI with all returned options. Then answer the returned visual/device question if present. When status=ready, show the brief once and immediately use the host choice UI with the returned confirmation options; never ask the user to type \u201C\u786E\u8BA4\u201D. Map confirm to action=confirm, revise-scope to action=revise questionId=page-scope, and revise-visual to action=revise questionId=visual-direction. The confirmed result carries elements and instructions for you to write index.html. After writing, automatically open the real preview, capture every selected page, inspect the console and DOM/layout, and exercise the core flow; fix implementation defects without asking. Call action=complete with structured verificationEvidence only after preview passes. Self-reported boolean flags are not accepted as evidence. Never report completion before status=completed. If status=blocked, repair the prototype through draw2code_update first, let the user inspect the board, then call action=recheck with the same sessionId/revision; do not repeat completed choices. action=resume restores interrupted work.",
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      action: { type: "string", enum: ["start", "answer", "revise", "resume", "recheck", "confirm", "complete", "abandon"], description: "Generate state-machine action. Omit only for legacy callers; omission behaves as start." },
      name: { type: "string", description: "Board name. Omit to use the board currently selected in the \u753B\u7801 UI." },
      frames: { type: "array", items: { type: "string" }, description: "User-mentioned frame names, used only as recommended defaults on action=start." },
      styleNote: { type: "string", description: "An explicit overall visual request; skips the first-time visual choice." },
      sessionId: { type: "string", description: "Generation session ID from a prior result." },
      revision: { type: "integer", description: "Expected generation revision for mutation actions." },
      questionId: { type: "string", description: "Current question ID for answer/revise." },
      values: { type: "array", items: { type: "string" }, description: "Selected option IDs." },
      otherText: { type: "string", description: "Custom overall visual direction when custom is selected." },
      verificationEvidence: {
        type: "json",
        description: "Required only for action=complete. Object with one captureId, outputSha256, reachable loopback/file previewUrl whose HTML hash matches the generated index, viewports[{width,height}], workspace PNG screenshots[{page,viewport,source,sha256,captureId}] and text domSnapshots[{page,source,sha256,captureId}] covering every related page, empty consoleErrors and consoleWarnings, DOM/layout/core-flow checks. Multiple pages also require page-switching. Every check needs passed=true and non-empty details. Unselected pages are verified by stored page-block hashes plus post-generation artifacts."
      },
      previewOpened: { type: "boolean", description: "Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence." },
      selectedPagesVisible: { type: "boolean", description: "Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence." },
      coreFlowPassed: { type: "boolean", description: "Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence." },
      mockDataVisible: { type: "boolean", description: "Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence." },
      unselectedPagesPreserved: { type: "boolean", description: "Deprecated compatibility field. Unselected pages are now checked through page markers and evidence artifacts." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: { type: "string", required: true },
          sessionId: { type: "string" },
          revision: { type: "integer" },
          board: { type: "string" },
          activeBoard: { type: "string" },
          question: { type: "json" },
          blockers: { type: "json" },
          warnings: { type: "json" },
          brief: { type: "json" },
          confirmation: { type: "json" },
          nextAction: { type: "string" },
          error: { type: "json" },
          scope: { type: "string" },
          frameNames: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          elements: { type: "json" },
          unframedElementCount: { type: "integer" },
          layoutWarnings: { type: "json" },
          existingPages: { type: "array", items: { type: "string" } },
          outputDir: { type: "string" },
          instructions: { type: "string" },
          validation: { type: "json" }
        }
      },
      render: (_args, value) => {
        if (value.status === "question") {
          const question = value.question;
          const options = question.options.map((option, index) => `${index + 1}. ${option.id} \u2014 ${option.label}${option.recommended ? `\uFF08\u63A8\u8350\uFF1A${option.reason ?? ""}\uFF09` : ""}`).join("\n");
          return text2(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ""} revision=${value.revision ?? ""} status=question questionId=${question.id}
${question.text}
${options}
\u8C03\u7528 ask_user_question \u65F6\u5FC5\u987B\u539F\u6837\u590D\u5236 question.askUserQuestionArgs\uFF1B\u7279\u522B\u662F page-scope \u5FC5\u987B\u8BBE\u7F6E multi_select=true\uFF0C\u5373\u4F7F\u7528\u6237\u53EA\u70B9\u540D\u4E86\u4E00\u4E2A\u9875\u9762\u4E5F\u4E0D\u80FD\u6539\u6210\u5355\u9009\u3002\u6536\u5230\u9009\u62E9\u540E\u8C03\u7528 action=answer\u3002`);
        }
        if (value.status === "blocked") return text2(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ""} revision=${value.revision ?? ""} status=blocked
\u539F\u578B\u5C1A\u4E0D\u53EF\u751F\u6210\u3002\u5148\u6309 blockers \u8C03\u7528 draw2code_update\uFF0C\u7528\u6237\u770B\u5230\u5E76\u68C0\u67E5\u540E\u8C03\u7528 action=recheck\uFF1B\u4E0D\u8981\u91CD\u590D\u8BE2\u95EE\u9875\u9762\u548C\u89C6\u89C9\u65B9\u5411\u3002`);
        if (value.status === "ready") return text2(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ""} revision=${value.revision ?? ""} status=ready
\u53EA\u5C55\u793A\u4E00\u6B21 brief\uFF0C\u5E76\u7ACB\u5373\u7528\u5BBF\u4E3B ask_user_question \u539F\u6837\u590D\u5236 confirmation.askUserQuestionArgs\uFF0C\u7981\u6B62\u8BA9\u7528\u6237\u624B\u52A8\u8F93\u5165\u201C\u786E\u8BA4\u201D\u3002\u9009\u62E9 confirm \u540E\u8C03\u7528 action=confirm\uFF1Brevise-scope \u8C03 action=revise questionId=page-scope\uFF1Brevise-visual \u8C03 action=revise questionId=visual-direction\u3002`);
        if (value.status === "confirmed") return text2(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ""} revision=${value.revision ?? ""} status=confirmed
\u6309 instructions \u5199\u5165\u5355\u6587\u4EF6 index.html\uFF0C\u7136\u540E\u81EA\u52A8\u6253\u5F00\u771F\u5B9E\u9884\u89C8\uFF0C\u9010\u9875\u622A\u56FE\uFF0C\u68C0\u67E5\u63A7\u5236\u53F0\u3001DOM\u3001\u5E03\u5C40\u548C\u6838\u5FC3\u6D41\u7A0B\uFF1B\u7528\u7ED3\u6784\u5316 verificationEvidence \u8C03\u7528 action=complete\uFF0C\u4E4B\u524D\u4E0D\u5F97\u62A5\u544A\u5B8C\u6210\u3002`);
        if (value.status === "completed") return text2(`draw2code_generate status=completed board=${value.board ?? ""}
\u771F\u5B9E\u9884\u89C8\u4E0E\u6838\u5FC3\u6D41\u7A0B\u5DF2\u9A8C\u6536\uFF0Cgenerate \u6D41\u7A0B\u7ED3\u675F\uFF1B\u540E\u7EED\u666E\u901A\u4FEE\u6539\u4E0D\u81EA\u52A8\u91CD\u65B0\u8FDB\u5165 generate\u3002`);
        if (value.status === "error") return text2(`draw2code_generate \u53EF\u6062\u590D\u9519\u8BEF\uFF1A${JSON.stringify(value.error)}${value.sessionId === void 0 ? "" : `
sessionId=${value.sessionId} revision=${value.revision ?? ""}`}`);
        return text2(`draw2code_generate status=${value.status} sessionId=${value.sessionId ?? ""} revision=${value.revision ?? ""}`);
      }
    },
    async execute(args) {
      const action = args.action ?? "start";
      if (action === "start") {
        const target = await resolveBoard(store, args.root, args.name);
        const board = await store.read(args.root, target.name);
        if (!board.ok) return generateError(board.error.code, board.error.message);
        const frames = namedFrames(board.value.scene.elements);
        if (frames.length === 0) return generateError("no-pages", `\u753B\u677F\u300C${target.name}\u300D\u6CA1\u6709\u5E26\u540D\u79F0\u7684 frame\uFF0C\u65E0\u6CD5\u9009\u62E9\u751F\u6210\u9875\u9762`);
        const allNames = frames.map((frame) => str2(frame.name).trim());
        const requested = [...new Set((args.frames ?? []).map((name2) => name2.trim()).filter((name2) => name2 !== ""))];
        const missing = requested.filter((name2) => !allNames.includes(name2));
        if (missing.length > 0) return generateError("frame-not-found", `\u753B\u677F\u4E0A\u6CA1\u6709\u8FD9\u4E9B\u9875\u9762\uFF1A${missing.join("\u3001")}\u3002\u73B0\u6709\u9875\u9762\uFF1A${allNames.join("\u3001")}`);
        const settings = await store.readGenerateSettings(args.root, target.name);
        if (!settings.ok) return generateError(settings.error.code, settings.error.message);
        const inherited = settings.value === null ? null : str2(settings.value.visualDirection).trim() || null;
        const projectList = projects === void 0 ? null : await projects.list(args.root);
        const project = projectList?.ok === true ? projectList.value.find((candidate) => candidate.boardName === target.name) : void 0;
        const projectBrief = project?.brief;
        const briefPages = Array.isArray(projectBrief?.pages) ? projectBrief.pages.filter((value) => typeof value === "string" && allNames.includes(value)) : [];
        const deferredStyle = str2(project?.deferredStyleNote).trim();
        const connected = directlyConnectedFrames(board.value.scene.elements, requested);
        const recommended = requested.length > 0 ? [...requested, ...connected] : briefPages.length > 0 ? briefPages : allNames.slice(0, Math.min(3, allNames.length));
        const recommendationReasons = /* @__PURE__ */ new Map();
        for (const name2 of requested) recommendationReasons.set(name2, "\u7528\u6237\u672C\u6B21\u660E\u786E\u70B9\u540D");
        for (const name2 of connected) recommendationReasons.set(name2, "\u4E0E\u7528\u6237\u70B9\u540D\u9875\u9762\u5B58\u5728\u76F4\u63A5 Arrow \u4EA4\u4E92\u5173\u7CFB");
        for (const name2 of briefPages) recommendationReasons.set(name2, "\u6765\u81EA\u5DF2\u786E\u8BA4 create \u7B80\u62A5\u7684\u6838\u5FC3\u9875\u9762");
        if (requested.length === 0 && briefPages.length === 0) {
          for (const name2 of recommended) recommendationReasons.set(name2, "\u4F4D\u4E8E\u5F53\u524D\u753B\u677F\u6838\u5FC3\u6D41\u7A0B\u7684\u524D\u5E8F\u4F4D\u7F6E");
        }
        const existing = await store.existingPages(args.root, target.name);
        if (!existing.ok) return generateError(existing.error.code, existing.error.message);
        const now2 = Date.now();
        const draft2 = {
          sessionId: `generation-${randomUUID2()}`,
          board: target.name,
          ...target.activeBoard === void 0 ? {} : { activeBoard: target.activeBoard },
          status: "question",
          revision: 1,
          createdAt: now2,
          updatedAt: now2,
          currentQuestion: pageScopeQuestion(frames, recommended, recommendationReasons),
          selectedFrames: [],
          allFrames: allNames,
          unselectedFrames: [],
          recommendedFrames: [...new Set(recommended)],
          expectedPageTexts: {},
          preservedPageHashes: {},
          visualDirection: args.styleNote?.trim() || deferredStyle || null,
          inheritedVisualDirection: inherited,
          device: null,
          styleNote: args.styleNote?.trim() || deferredStyle || null,
          blockers: [],
          warnings: [],
          brief: null,
          validation: null,
          hadExistingIndex: existing.value.includes("index.html")
        };
        const failed = await persistGeneration(store, args.root, draft2, false);
        return failed ?? responseFromDraft(draft2);
      }
      const draft = await loadGeneration(store, args.root, args.sessionId);
      if (draft === null) return generateError("not-found", "\u627E\u4E0D\u5230 generate \u4F1A\u8BDD\uFF1B\u8BF7\u4F20\u5165\u4E4B\u524D\u8FD4\u56DE\u7684 sessionId\uFF0C\u6216\u7528 action=start \u5F00\u59CB\u65B0\u4E00\u8F6E");
      if (action === "resume") return responseFromDraft(draft);
      if (draft.status === "completed" || draft.status === "abandoned") return generateError("closed-session", `\u8FD9\u4E2A generate \u4F1A\u8BDD\u5DF2\u7ECF\u662F ${draft.status}\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u4FEE\u6539`, draft);
      if (args.revision !== draft.revision) return generateError("stale-revision", `generate \u4F1A\u8BDD\u5DF2\u66F4\u65B0\uFF1B\u8BF7\u7528\u5F53\u524D revision=${draft.revision} \u7EE7\u7EED`, draft);
      if (action === "abandon") {
        draft.status = "abandoned";
        draft.currentQuestion = null;
        const failed = await persistGeneration(store, args.root, draft);
        return failed ?? responseFromDraft(draft);
      }
      if (action === "revise") {
        const board = await store.read(args.root, draft.board);
        if (!board.ok) return generateError(board.error.code, board.error.message, draft);
        if (args.questionId === "page-scope") draft.currentQuestion = pageScopeQuestion(namedFrames(board.value.scene.elements), draft.selectedFrames);
        else if (args.questionId === "visual-direction") draft.currentQuestion = visualQuestion(board.value.scene.elements);
        else return generateError("invalid-question", "\u53EA\u80FD\u4FEE\u6539 page-scope \u6216 visual-direction", draft);
        draft.status = "question";
        draft.brief = null;
        const failed = await persistGeneration(store, args.root, draft);
        return failed ?? responseFromDraft(draft);
      }
      if (action === "answer") {
        const question = draft.currentQuestion;
        if (draft.status !== "question" || question === null) return generateError("invalid-state", "\u5F53\u524D\u6CA1\u6709\u7B49\u5F85\u56DE\u7B54\u7684\u95EE\u9898", draft);
        if (args.questionId !== question.id) return generateError("wrong-question", `\u5F53\u524D\u95EE\u9898\u662F ${question.id}`, draft);
        const values = [...new Set(args.values ?? [])];
        if (values.length < question.minSelections) return generateError("invalid-option", `\u81F3\u5C11\u9009\u62E9 ${question.minSelections} \u9879`, draft);
        if (question.selectionMode === "single" && values.length !== 1) return generateError("invalid-option", "\u8FD9\u4E2A\u95EE\u9898\u53EA\u80FD\u9009\u62E9\u4E00\u9879", draft);
        const optionFor = (value) => question.options.find((option) => option.id === value || option.valueLabel === value);
        const invalid = values.find((value) => optionFor(value) === void 0);
        if (invalid !== void 0) return generateError("invalid-option", `\u9009\u9879\u300C${invalid}\u300D\u4E0D\u5728\u5F53\u524D\u95EE\u9898\u4E2D`, draft);
        const board = await store.read(args.root, draft.board);
        if (!board.ok) return generateError(board.error.code, board.error.message, draft);
        if (question.id === "page-scope") {
          const selectedFrames = values.map((value) => optionFor(value)?.valueLabel ?? value);
          draft.selectedFrames = selectedFrames;
          const scope = elementsInFrames(board.value.scene.elements, selectedFrames);
          const inferred = inferDevice(scope.frames);
          if (inferred === "mixed" || inferred === "ambiguous") {
            draft.currentQuestion = deviceQuestion();
            draft.status = "question";
            const failed = await persistGeneration(store, args.root, draft);
            return failed ?? responseFromDraft(draft);
          }
          draft.device = inferred;
        } else if (question.id === "target-device") {
          draft.device = values[0];
        } else {
          const selected = optionFor(values[0]);
          if (values[0] === "custom") {
            const custom = args.otherText?.trim() ?? "";
            if (custom === "") return generateError("custom-required", "\u9009\u62E9\u81EA\u5B9A\u4E49\u65F6\u9700\u8981\u8865\u5145\u6574\u4F53\u89C6\u89C9\u65B9\u5411", draft);
            draft.visualDirection = custom;
          } else {
            draft.visualDirection = selected?.valueLabel ?? selected?.label ?? values[0];
          }
        }
        if (draft.visualDirection === null) draft.visualDirection = draft.inheritedVisualDirection;
        if (draft.visualDirection === null) {
          draft.currentQuestion = visualQuestion(board.value.scene.elements);
          draft.status = "question";
          const failed = await persistGeneration(store, args.root, draft);
          return failed ?? responseFromDraft(draft);
        }
        return runGeneratePreflight(store, args.root, draft);
      }
      if (action === "recheck") {
        if (draft.status !== "blocked") return generateError("invalid-state", "\u53EA\u6709 blocked \u72B6\u6001\u9700\u8981 recheck", draft);
        return runGeneratePreflight(store, args.root, draft);
      }
      if (action === "confirm") {
        if (draft.status !== "ready") return generateError("invalid-state", "\u53EA\u6709\u7528\u6237\u786E\u8BA4 ready \u7B80\u62A5\u540E\u624D\u80FD\u751F\u6210", draft);
        const preflight = await runGeneratePreflight(store, args.root, draft);
        if (preflight.status !== "ready") return preflight;
        await preparePagePreservation(args.root, draft);
        draft.status = "confirmed";
        draft.currentQuestion = null;
        const failed = await persistGeneration(store, args.root, draft);
        if (failed !== null) return failed;
        return generationPayload(store, args.root, draft);
      }
      if (action === "complete") {
        if (draft.status !== "confirmed") return generateError("invalid-state", "\u53EA\u6709 confirmed \u4E14 HTML \u5DF2\u5199\u5165\u540E\u624D\u80FD\u63D0\u4EA4\u9A8C\u6536", draft);
        const outputFile = await workspaceFile(args.root, resolve(args.root, "draw2code-pages", draft.board, "index.html"));
        if (!outputFile.ok) return generateError("generated-index-missing", "\u751F\u6210\u5165\u53E3\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u8BFB\u53D6\uFF1A" + outputFile.reason, draft);
        const outputHtml = outputFile.bytes.toString("utf8");
        const missingMarkers = draft.selectedFrames.filter((page) => pageBlock(outputHtml, page) === null);
        if (missingMarkers.length > 0) {
          return generateError("generated-page-marker-missing", "\u751F\u6210\u9875\u9762\u7F3A\u5C11\u7A33\u5B9A\u8FB9\u754C\u6807\u8BB0\uFF1A" + missingMarkers.join("\u3001"), draft);
        }
        const changedPages = await preservedPagesStillMatch(args.root, draft);
        if (changedPages.length > 0) {
          return generateError("unselected-pages-changed", "\u672A\u9009\u62E9\u9875\u9762\u88AB\u4FEE\u6539\u6216\u4E22\u5931\uFF1A" + changedPages.join("\u3001") + "\uFF1B\u6062\u590D\u8FD9\u4E9B\u9875\u9762\u540E\u91CD\u65B0\u9A8C\u6536", draft);
        }
        const evidence = await verificationEvidenceFor(args.root, args.verificationEvidence, draft, sha256(outputFile.bytes));
        if (!evidence.ok) return generateError(evidence.code, evidence.message, draft);
        draft.validation = evidence.value;
        draft.status = "completed";
        const failed = await persistGeneration(store, args.root, draft);
        if (failed !== null) return failed;
        const settings = await store.writeGenerateSettings(args.root, draft.board, { visualDirection: draft.visualDirection });
        if (!settings.ok) return generateError(settings.error.code, settings.error.message, draft);
        return responseFromDraft(draft, { validation: evidence.value });
      }
      return generateError("invalid-action", `\u4E0D\u652F\u6301 action=${action}`, draft);
    }
  });
}

// src/guidance.ts
var SECTION_ORDER = 220;
var DRAW2CODE_GUIDANCE = [
  "\u65B0\u9879\u76EE\u547D\u540D\u5951\u7EA6\uFF1A\u8C03\u7528 draw2code_create action=start \u524D\uFF0CAgent \u5FC5\u987B\u7406\u89E3\u5B8C\u6574 idea\uFF0C\u5E76\u76F4\u63A5\u6982\u62EC\u4E00\u4E2A\u901A\u5E38\u4E3A 4\u201312 \u4E2A\u4E2D\u6587\u5B57\u7B26\u7684\u8BED\u4E49\u5316 projectName\uFF1B\u540D\u79F0\u5E94\u8BA9\u7528\u6237\u4E00\u773C\u77E5\u9053\u4EA7\u54C1\u662F\u4EC0\u4E48\uFF0C\u4E0D\u80FD\u590D\u5236\u539F\u8BDD\u3001\u622A\u53D6\u524D N \u4E2A\u5B57\u7B26\u6216\u4F9D\u8D56\u5173\u952E\u8BCD\u62FC\u63A5\u89C4\u5219\u3002idea \u4ECD\u5B8C\u6574\u4FDD\u7559\uFF0CprojectName \u5FC5\u987B\u4F5C\u4E3A\u72EC\u7ACB\u53C2\u6570\u663E\u5F0F\u4F20\u5165\u3002\u5DE5\u5177\u53EA\u6821\u9A8C\u540D\u79F0\u662F\u5426\u5408\u6CD5\uFF0C\u4E0D\u8D1F\u8D23\u4ECE idea \u751F\u6210\u540D\u79F0\uFF1B\u786E\u8BA4\u540E\u753B\u677F\u540D\u76F4\u63A5\u4F7F\u7528 projectName\uFF0C\u4E0D\u8FFD\u52A0\u201C\u539F\u578B\u201D\u201C\u8349\u7A3F\u201D\u7B49\u6D41\u7A0B\u540E\u7F00\u3002",
  'draw2code_update \u8C03\u7528\u5951\u7EA6\uFF1A\u63A8\u8350\u628A\u6BCF\u4E2A\u5143\u7D20\u5199\u6210 {op:"upsert",element:{id,type,x,y,...}}\uFF1B\u5DE5\u5177\u4E5F\u517C\u5BB9\u4E09\u79CD\u65E0\u6B67\u4E49 upsert \u7B80\u5199\u2014\u2014\u76F4\u63A5\u5143\u7D20 {id,type,...}\u3001\u7701\u7565 op \u7684 {element:{...}}\u3001\u4EE5\u53CA {op:"upsert",id,type,...}\u3002delete \u63A8\u8350 {op:"delete",id}\uFF0C\u540C\u65F6\u517C\u5BB9 id \u5199\u5728 elementId \u6216 element.id\u3002\u9875\u9762 frame \u4F7F\u7528\u753B\u5E03\u7EDD\u5BF9\u5750\u6807\uFF1B\u5E26 frameId \u7684\u9875\u9762\u5B50\u5143\u7D20\u4F18\u5148\u4E5F\u4F7F\u7528\u753B\u5E03\u7EDD\u5BF9\u5750\u6807\u3002\u82E5\u5B50\u5143\u7D20\u539F\u5750\u6807\u65E0\u6CD5\u653E\u8FDB frame\u3001\u4F46\u6309 frame \u5DE6\u4E0A\u89D2\u5E73\u79FB\u540E\u80FD\u5B8C\u6574\u653E\u5165\uFF0C\u5DE5\u5177\u4F1A\u628A\u5B83\u89C6\u4E3A frame \u5C40\u90E8\u5750\u6807\u5E76\u5B89\u5168\u6362\u7B97\uFF1B\u4E24\u79CD\u89E3\u91CA\u90FD\u4E0D\u6210\u7ACB\u65F6\u4ECD\u8FD4\u56DE layout-invalid\uFF0C\u4E0D\u8981\u731C\u6D4B\u6216\u53CD\u590D\u6539\u5199\u6574\u6279\u53C2\u6570\u3002',
  '\u672C\u673A\u5DF2\u5B89\u88C5 dsh-draw2code \u63D2\u4EF6\uFF08\u753B\u7801 \xB7 Draw2Code\uFF09\uFF1ADSH Web GUI \u53F3\u4FA7 better-sidebar \u8FB9\u680F\u91CC\u7684\u300C\u753B\u7801\u300D\u6807\u7B7E\u9875\uFF08Excalidraw \u753B\u677F\uFF0C\u4ECE + \u83DC\u5355\u6216\u6807\u7B7E\u680F\u6253\u5F00\uFF09\u3002\u65B0\u9879\u76EE\u5DE5\u4F5C\u6D41\uFF1A\u7528\u6237\u8868\u8FBE\u201C\u6211\u60F3\u505A/\u521B\u5EFA/\u5F00\u53D1\u4E00\u4E2A\u65B0\u7684\u2026\u2026\u201D\u65F6\uFF0C\u5148\u8C03\u7528 draw2code_create action=start \u8FDB\u5165 choice-first grilling\uFF0C\u4E0D\u80FD\u76F4\u63A5\u8C03\u7528 draw2code_update\uFF1Bidea \u5FC5\u987B\u5FE0\u5B9E\u4F20\u5165\u7528\u6237\u539F\u8BDD\uFF0C\u4E0D\u8981\u5148\u66FF\u7528\u6237\u6269\u5199\u9700\u6C42\u3002\u6BCF\u6B21\u8FD4\u56DE question \u65F6\uFF0C\u4F18\u5148\u8C03\u7528\u5BBF\u4E3B ask_user_question\uFF0C\u4EE5\u4E00\u4E2A\u95EE\u9898\u548C\u5168\u90E8\u7ED3\u6784\u5316 options \u8BA9\u7528\u6237\u76F4\u63A5\u9009\u62E9\uFF0C\u5FC5\u987B\u4FDD\u7559\u201C\u8FD8\u6CA1\u60F3\u597D\u201D\u548C\u201C\u5176\u4ED6\u201D\u7B49\u9009\u9879\uFF0C\u7981\u6B62\u622A\u65AD\u9009\u9879\u6216\u53EA\u8BA9\u7528\u6237\u5728\u8F93\u5165\u6846\u91CC\u624B\u52A8\u8F93\u5165\uFF1B\u6536\u5230\u9009\u62E9\u540E\u628A label \u6620\u5C04\u56DE option id\uFF0C\u518D\u8C03\u7528 draw2code_create action=answer\u3002\u53EA\u6709\u5BBF\u4E3B\u6CA1\u6709 ask_user_question \u65F6\uFF0C\u624D\u9000\u5316\u4E3A\u7F16\u53F7\u6587\u672C\u3002\u7528\u6237\u8BF4\u201C\u7EE7\u7EED\u4E4B\u524D\u7684\u9879\u76EE\u201D\u4F46\u6CA1\u6709\u660E\u786E\u9879\u76EE\u65F6\uFF0C\u5148\u8C03\u7528 draw2code_create action=list\uFF0C\u8BA9\u7528\u6237\u9009\u62E9\u8349\u7A3F\uFF1B\u660E\u786E\u9879\u76EE\u540E\u7528 action=resume\u3002\u7528\u6237\u786E\u8BA4 ready \u7684\u9879\u76EE\u7B80\u62A5\u540E\uFF0C\u8C03\u7528 draw2code_create action=confirm\uFF1B\u53EA\u6709\u62FF\u5230 nextAction=draw2code_update \u548C boardName \u540E\uFF0C\u624D\u8C03\u7528 draw2code_update \u628A\u7B2C\u4E00\u8F6E\u6838\u5FC3\u539F\u578B\u753B\u5230\u8FD9\u4E2A\u65B0\u753B\u677F\u3002\u5DF2\u6709\u9879\u76EE\u5DE5\u4F5C\u6D41\uFF1A\u7528\u6237\u76F4\u63A5\u5728\u753B\u677F\u4E0A\u62D6\u6539\u3001\u5220\u6A21\u5757\u3001\u52A0\u6587\u6848\uFF1B\u4F60\u5148\u7528 draw2code_read \u8BFB\u53D6\u6700\u65B0\u753B\u677F\uFF0C\u518D\u7EE7\u7EED draw2code_update \u8FED\u4EE3\uFF1B\u6253\u78E8\u597D\u540E\u7528\u6237\u8BF4"\u6839\u636E\u753B\u677F\u751F\u6210\u9875\u9762"\uFF0C\u4F60\u8C03\u7528 draw2code_generate \u62FF\u5230\u8303\u56F4\u4E0E\u7EA6\u675F\u540E\u751F\u6210\u524D\u7AEF\u9875\u9762\u3002',
  "draw2code_create \u7684 grilling SOP\uFF1A\u4F9D\u6B21\u8865\u9F50\u76EE\u6807\u7AEF\u3001\u6838\u5FC3\u7528\u6237\u3001\u6838\u5FC3\u76EE\u6807\u3001\u6700\u91CD\u8981\u7684\u7528\u6237\u6D41\u7A0B\u3001\u9996\u7248\u6838\u5FC3\u6A21\u5757\u3001\u9996\u8F6E\u6838\u5FC3\u9875\u9762\uFF1B\u7528\u6237\u539F\u8BDD\u5DF2\u7ECF\u660E\u786E App/Web/\u5C0F\u7A0B\u5E8F\u65F6\u5DE5\u5177\u4F1A\u9884\u586B\u5E76\u8DF3\u8FC7\u76EE\u6807\u7AEF\uFF0C\u7981\u6B62\u91CD\u590D\u8FFD\u95EE\u3002\u5E73\u53F0/\u7528\u6237/\u76EE\u6807/\u6D41\u7A0B\u9ED8\u8BA4\u5355\u9009\uFF0C\u6A21\u5757\u548C\u9875\u9762\u53EF\u591A\u9009\u3002\u5019\u9009\u9009\u9879\u662F\u5E2E\u52A9\u601D\u8003\u7684\u811A\u624B\u67B6\uFF0C\u4E0D\u9650\u5236\u7528\u6237\uFF1A\u7528\u6237\u53EF\u4EE5\u9009\u201C\u5176\u4ED6\u201D\u5E76\u8865\u5145\u6587\u5B57\uFF1B\u81EA\u7531\u6587\u5B57\u7531\u5DE5\u5177\u76F4\u63A5\u8BB0\u5F55\uFF0Cready \u7B80\u62A5\u662F\u552F\u4E00\u7EDF\u4E00\u786E\u8BA4\u70B9\uFF0C\u4E0D\u8981\u9010\u9879\u590D\u8FF0\u539F\u8BDD\u518D\u95EE\u201C\u8FD9\u6837\u7406\u89E3\u5BF9\u5417\u201D\u3002\u201C\u8FD8\u6CA1\u60F3\u597D\u201D\u53EF\u4EE5\u8DF3\u8FC7\uFF0C\u4F46\u8981\u4F5C\u4E3A\u663E\u5F0F\u5F85\u5B9A\u9879\u6216\u9ED8\u8BA4\u5047\u8BBE\u8BB0\u5F55\u3002\u9879\u76EE\u540D\u53EA\u4FDD\u7559\u6838\u5FC3\u4EA7\u54C1\u540D\uFF0C\u4E0D\u8981\u628A\u201C\u7C7B\u4F3C\u3001\u98CE\u683C\u3001\u901A\u8FC7\u3001\u529F\u80FD\u63CF\u8FF0\u201D\u7B49\u6574\u53E5\u585E\u8FDB\u9879\u76EE\u540D\u6216\u753B\u677F\u540D\uFF1BAPP/Web/\u5C0F\u7A0B\u5E8F/\u5E73\u53F0/\u7CFB\u7EDF\u7B49\u5B8C\u6574\u4EA7\u54C1\u7C7B\u578B\u4E0D\u80FD\u518D\u8FFD\u52A0\u201C\u5DE5\u5177\u201D\u3002draw2code_update \u7ED8\u5236\u65F6\uFF0C\u9875\u9762\u5FC5\u987B\u4F7F\u7528 frame\uFF0C\u7EC4\u4EF6\u5FC5\u987B\u6709\u6E05\u6670\u7684 text \u6807\u7B7E\u6216\u8BED\u4E49 customData\uFF1B\u4E0D\u8981\u628A\u6240\u6709\u63A7\u4EF6\u753B\u6210\u65E0\u6807\u7B7E\u7684\u65B9\u6846\u3002\u5FC5\u987B\u9010\u9875\u843D\u5B9E brief.pageMockData\uFF1A\u5217\u8868\u3001\u96F7\u8FBE\u3001\u804A\u5929\u3001\u56FE\u8868\u3001\u8BE6\u60C5\u548C\u72B6\u6001\u7EC4\u4EF6\u81F3\u5C11\u653E\u5165 3 \u6761\u5177\u6709\u771F\u5B9E\u8BED\u4E49\u7684\u793A\u4F8B\u5185\u5BB9\uFF0C\u5305\u542B\u7406\u89E3\u4EA7\u54C1\u6240\u9700\u7684\u5BF9\u8C61\u3001\u6570\u503C\u3001\u72B6\u6001\u3001\u65F6\u95F4\u6216\u6D88\u606F\uFF1B\u7981\u6B62\u7528\u7A7A\u767D\u65B9\u6846\u3001Lorem ipsum\u3001\u201C\u7528\u6237A\u201D\u201C\u6807\u9898\u201D\u201C\u5185\u5BB9\u201D\u7B49\u65E0\u610F\u4E49\u5360\u4F4D\u7B26\u4EE3\u66FF\u3002\u5B8C\u6574\u9875\u9762 frame \u8BBE\u7F6E customData.role=prototype-page \u548C customData.mockDataMin\uFF08\u901A\u5E38\u4E3A 3\uFF09\uFF0C\u6BCF\u6761\u627F\u8F7D mock \u6570\u636E\u7684\u53EF\u89C1 text \u8BBE\u7F6E customData.role=mock-data\uFF1Bdraw2code_update \u4F1A\u636E\u6B64\u6267\u884C\u5185\u5BB9\u53EF\u8BFB\u6027\u95E8\u7981\u3002\u4F18\u5148\u8868\u8FBE\u6309\u94AE\u3001\u8F93\u5165\u6846\u3001Tab\u3001\u5217\u8868\u3001\u5361\u7247\u3001\u5BFC\u822A\u548C\u7BAD\u5934\u7B49\u4EA7\u54C1\u8BED\u4E49\uFF0C\u4F4E\u4FDD\u771F\u53EA\u964D\u4F4E\u89C6\u89C9\u7CBE\u5EA6\uFF0C\u4E0D\u964D\u4F4E\u4FE1\u606F\u53EF\u8BFB\u6027\u3002\u5177\u4F53\u51E0\u4F55\u89C4\u5219\uFF1A\u9875\u9762\u5185\u5143\u7D20\u7528 frameId \u6307\u5411\u9875\u9762 frame\uFF0C\u7EDD\u4E0D\u80FD\u7528 containerId \u8868\u793A\u9875\u9762\u5F52\u5C5E\uFF1BcontainerId \u53EA\u7528\u4E8E\u7ED1\u5B9A rectangle/diamond/ellipse \u7684\u552F\u4E00\u6587\u5B57\u6807\u7B7E\u3002\u82E5 Agent \u8BEF\u628A text.containerId \u6307\u5411 frame\uFF0Cdraw2code_update \u4F1A\u81EA\u52A8\u4FEE\u590D\u4E3A frameId\uFF0C\u907F\u514D mock \u6570\u636E\u5199\u8FDB JSON \u5374\u5728\u753B\u5E03\u4E0A\u4E0D\u53EF\u89C1\u3002\u591A\u884C\u6216\u9884\u8BA1\u6362\u884C\u7684 text \u5FC5\u987B\u7ED9\u8DB3 height\uFF1B\u6309\u94AE\u3001\u5361\u7247\u548C\u8F93\u5165\u6846\u7684\u5916\u6846\u4E0D\u80FD\u643A\u5E26 text\uFF0C\u5FC5\u987B\u7528\u72EC\u7ACB text \u5B50\u5143\u7D20\uFF1B\u4E00\u4E2A\u5916\u6846\u53EA\u6709\u4E00\u4E2A\u6807\u7B7E\u65F6\u7ED9 text \u8BBE\u7F6E containerId\uFF0C\u5E76\u5728\u5916\u6846\u6216\u6587\u5B57\u7684 customData.role \u58F0\u660E button/primary-action/select/input/chip/card \u7B49\u7EC4\u4EF6\u8BED\u4E49\uFF0C\u7F3A\u5931 role \u4F1A\u88AB\u62D2\u7EDD\u3002draw2code_update \u4F1A\u8865\u9F50\u5916\u6846\u7684 boundElements\uFF1Bbutton/primary-action/chip/tab \u6587\u6848\u4F1A\u89C4\u8303\u4E3A center/middle\uFF0C\u5E76\u628A\u6587\u5B57\u76D2\u7F29\u81F3\u771F\u5B9E\u884C\u9AD8\u540E\u6309\u5916\u6846\u51E0\u4F55\u5782\u76F4\u5C45\u4E2D\uFF1Binput/select/dropdown/search-field \u6587\u6848\u89C4\u8303\u4E3A left/middle\u3002\u4E00\u4E2A\u5916\u6846\u6709\u591A\u4E2A\u6807\u7B7E\uFF08\u4F8B\u5982\u5E95\u90E8\u5BFC\u822A\uFF09\u65F6\u4E0D\u8981\u628A\u591A\u4E2A text \u7ED1\u5B9A\u5230\u540C\u4E00 containerId\uFF0C\u53EF\u7528\u76F8\u540C groupIds \u8868\u8FBE\u5206\u7EC4\u3002\u79FB\u52A8\u7AEF frame \u5148\u9884\u7559\u5E95\u90E8\u5B89\u5168\u533A\uFF0C\u5E95\u90E8\u5BFC\u822A\u7528 customData.role=bottom-navigation \u7684\u77E9\u5F62 shell \u52A0\u72EC\u7ACB\u6807\u7B7E\uFF0C\u6BCF\u4E2A\u6807\u7B7E\u8BBE\u7F6E customData.role=bottom-navigation-item\uFF1B\u5373\u4F7F\u8BEF\u7ED1 shell\uFF0C\u5DE5\u5177\u4E5F\u4F1A\u62C6\u4E3A\u72EC\u7ACB\u680F\u76EE\u5E76\u5C45\u4E2D\u3002\u5BFC\u822A\u8D34\u8FD1 frame \u5E95\u90E8\uFF0C\u680F\u76EE\u69FD\u4F4D\u4E0D\u5F97\u91CD\u53E0\uFF0C\u4E0D\u80FD\u53EA\u6709\u7A7A shell\uFF0C\u4E5F\u4E0D\u8981\u7528\u4E00\u884C\u666E\u901A\u6587\u5B57\u4EE3\u66FF\u3002\u7EC4\u4EF6\u4E0D\u8981\u88AB frame \u8FB9\u754C\u622A\u65AD\u3002draw2code_update \u4F1A\u5728\u5199\u76D8\u524D\u6267\u884C layout-invalid \u9884\u68C0\uFF0C\u5931\u8D25\u65F6\u6309\u9519\u8BEF\u4FE1\u606F\u4FEE\u6B63\u5E76\u91CD\u8BD5\uFF0C\u4E0D\u8981\u628A\u5931\u8D25\u7ED3\u679C\u62A5\u544A\u4E3A\u5DF2\u753B\u597D\u3002\u539F\u578B\u9636\u6BB5\u4E0D\u8BE2\u95EE\u54C1\u724C\u8272\u3001\u5B57\u4F53\u3001\u5706\u89D2\u3001\u9634\u5F71\u30013D/2D\u3001\u6241\u5E73/\u62DF\u7269\u7B49\u89C6\u89C9\u98CE\u683C\uFF1B\u4F46\u539F\u578B\u4E5F\u4E0D\u80FD\u53EA\u6709\u9ED1\u767D\u7A7A\u6846\uFF0C\u5E94\u4F7F\u7528\u514B\u5236\u7684\u8BED\u4E49\u8272\u5E2E\u52A9\u626B\u8BFB\uFF1A\u4E3B\u8981\u64CD\u4F5C/\u9009\u4E2D\u6001\u7528 primary\uFF0C\u5B8C\u6210/\u6B63\u5411\u72B6\u6001\u7528 success\uFF0C\u63D0\u9192\u7528 warning\uFF0C\u903E\u671F/\u9519\u8BEF\u7528 danger\uFF0C\u6B21\u7EA7\u5206\u7C7B\u53EF\u7528 info\uFF0C\u5F31\u4FE1\u606F\u7528 neutral\u3002\u901A\u8FC7\u5F62\u72B6 customData.tone=primary|success|warning|danger|info|neutral \u83B7\u53D6\u6D45\u5E95\u8272\u548C\u5BF9\u5E94\u63CF\u8FB9\uFF1B\u6BCF\u9875\u53EA\u5728\u7C7B\u522B\u3001\u72B6\u6001\u3001\u4E3B\u8981\u64CD\u4F5C\u7B49\u6709\u610F\u4E49\u7684\u4F4D\u7F6E\u4F7F\u7528\uFF0C\u6B63\u6587\u548C\u5927\u9762\u79EF\u5BB9\u5668\u4FDD\u6301\u4E2D\u6027\u3002\u7528\u6237\u4E3B\u52A8\u63D0\u5230\u7684\u54C1\u724C\u6216\u89C6\u89C9\u98CE\u683C\u53EA\u4F5C\u4E3A styleNote \u5EF6\u8FDF\u7ED9 draw2code_generate\u3002\u4E13\u4E1A\u7528\u6237\u56DE\u7B54\u5177\u4F53\u65F6\u51CF\u5C11\u8FFD\u95EE\uFF0C\u975E\u4E13\u4E1A\u7528\u6237\u6A21\u7CCA\u65F6\u7528\u4F8B\u5B50\u548C\u9009\u9879\u5F15\u5BFC\u3002",
  "\u8981\u70B9\uFF1A\u753B\u677F\u6587\u4EF6\u662F\u5DE5\u4F5C\u533A\u91CC\u7684 draw2code/<name>.excalidraw.json\uFF08\u7528\u6237\u53EF\u5728\u753B\u677F\u5DE5\u5177\u680F\u5207\u6362/\u65B0\u5EFA\u591A\u5757\u753B\u677F\uFF0C\u5982 prototype / \u987E\u5BA2\u7AEF / \u5E97\u5BB6\u7AEF\uFF09\uFF1B\u753B\u677F\u4F1A\u628A\u5F53\u524D\u9009\u4E2D\u7684\u540D\u5B57\u540C\u6B65\u5230\u5DE5\u4F5C\u533A\uFF0CAgent \u5DE5\u5177\u7701\u7565 name \u65F6\u5FC5\u987B\u66F4\u65B0\u7528\u6237\u5F53\u524D\u6B63\u5728\u770B\u7684\u753B\u677F\uFF0C\u53EA\u6709\u7528\u6237\u660E\u786E\u70B9\u540D\u53E6\u4E00\u5757\u753B\u677F\u65F6\u624D\u4F20 name\u3002draw2code_list \u4F1A\u8FD4\u56DE\u5F53\u524D\u753B\u677F\u3002\u5DE5\u5177 root \u53C2\u6570\u586B\u4F1A\u8BDD\u5DE5\u4F5C\u76EE\u5F55\u3002draw2code_update \u7528 ops \u6279\u91CF upsert/delete\uFF08\u6309 id \u5E42\u7B49\uFF09\uFF0C\u5143\u7D20\u5750\u6807\u4E3A\u753B\u5E03\u50CF\u7D20\uFF08y \u5411\u4E0B\uFF09\uFF0Ctext \u5143\u7D20\u9700\u7ED9 text \u5B57\u6BB5\uFF0C\u6A21\u5757\u5206\u7EC4\u7528 frame\uFF0C\u6D41\u7A0B\u7528 arrow\uFF08points \u76F8\u5BF9\u5750\u6807 [[0,0],[dx,dy]]\uFF09\u3002\u4E25\u7981\u7528 Bash\u3001\u811A\u672C\u6216\u76F4\u63A5\u6587\u4EF6\u5199\u5165\u4FEE\u6539 .excalidraw.json\uFF0C\u5FC5\u987B\u8D70 draw2code_update\uFF0C\u5426\u5219\u65E0\u6CD5\u8FDB\u884C\u51B2\u7A81\u548C\u5199\u5165\u9A8C\u8BC1\u3002\u753B\u5B8C\u539F\u578B\u4E3B\u52A8\u63D0\u793A\u7528\u6237\uFF1A\u53EF\u4EE5\u5728\u53F3\u4FA7\u753B\u677F\u4E0A\u76F4\u63A5\u62D6\u6539\u3001\u5220\u6539\u6216\u8865\u5145\u6587\u6848\u3002",
  "\u751F\u6210\u9875\u9762\uFF1A\u7528\u6237\u660E\u786E\u8BF4\u300C\u751F\u6210\u9875\u9762 / \u751F\u6210XX\u9875\u9762 / \u6839\u636E\u753B\u677F\u751F\u6210\u524D\u7AEF / \u6309\u6700\u65B0\u753B\u677F\u91CD\u65B0\u751F\u6210\u300D\u65F6\uFF0C\u5FC5\u987B\u8C03\u7528 draw2code_generate action=start\uFF0C\u4E0D\u80FD\u51ED\u8BB0\u5FC6\u624B\u5199\uFF0C\u4E5F\u4E0D\u80FD\u628A\u7528\u6237\u70B9\u540D\u7684\u9875\u9762\u76F4\u63A5\u5F53\u6210\u5DF2\u786E\u8BA4\u8303\u56F4\u3002frames \u53EA\u4F20\u7528\u6237\u672C\u6B21\u70B9\u540D\u7684 frame\uFF0C\u4F5C\u4E3A\u9875\u9762\u591A\u9009\u9898\u7684\u63A8\u8350\u4F9D\u636E\uFF1B\u5DE5\u5177\u59CB\u7EC8\u8FD4\u56DE\u753B\u677F\u5168\u90E8 frame\uFF0C\u5FC5\u987B\u7528\u5BBF\u4E3B ask_user_question \u5C55\u793A\u5168\u90E8 options\uFF0C\u8BA9\u7528\u6237\u76F4\u63A5\u9009\u62E9\u3002\u6BCF\u4E2A question \u90FD\u9644\u5E26 askUserQuestionArgs\uFF0C\u8C03\u7528\u5BBF\u4E3B\u65F6\u5FC5\u987B\u539F\u6837\u590D\u5236\uFF1Bpage-scope \u7684 multi_select \u6C38\u8FDC\u4E3A true\uFF0C\u5373\u4F7F\u7528\u6237\u53EA\u70B9\u540D\u4E86\u4E00\u4E2A\u9875\u9762\u4E5F\u7981\u6B62\u6539\u6210\u5355\u9009\u3002\u63A8\u8350\u9879\u5DF2\u88AB\u5DE5\u5177\u7F6E\u9876\u5E76\u5728 label \u4E2D\u6807\u8BB0\u201C\u63A8\u8350\u201D\uFF0Cdescription \u542B\u539F\u56E0\uFF0C\u4E0D\u80FD\u81EA\u884C\u5220\u6389\uFF1B\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u9884\u52FE\u9009\uFF0C\u56E0\u6B64\u4E0D\u8981\u58F0\u79F0\u63A8\u8350\u9879\u5DF2\u7ECF\u9009\u4E2D\u3002\u968F\u540E\u6309 question \u7EE7\u7EED action=answer\uFF1B\u9996\u6B21\u751F\u6210\u53EA\u9009\u62E9\u4E00\u4E2A\u6574\u4F53\u89C6\u89C9\u65B9\u5411\uFF0C\u4E0D\u9010\u9879\u8FFD\u95EE\u989C\u8272\u3001\u5B57\u4F53\u3001\u5706\u89D2\u548C\u6280\u672F\u6808\uFF0C\u540E\u7EED\u751F\u6210\u9ED8\u8BA4\u7EE7\u627F\uFF1B\u5DE5\u5177\u4F1A\u628A\u8FD9\u4E00\u9009\u62E9\u5C55\u5F00\u4E3A\u7ED3\u6784\u5316\u89C6\u89C9\u7B80\u62A5\uFF0C\u4E0D\u8981\u518D\u5411\u7528\u6237\u9010\u9879\u786E\u8BA4\u3002status=blocked \u65F6\u5148\u6309 blockers \u7528 draw2code_update \u628A\u7ED3\u6784\u3001\u6587\u6848\u3001mock \u6570\u636E\u6216\u4EA4\u4E92\u4E8B\u5B9E\u8865\u56DE\u753B\u677F\uFF0C\u7528\u6237\u770B\u5230\u5E76\u68C0\u67E5\u540E\u7528\u540C\u4E00 sessionId/revision \u8C03 action=recheck\uFF0C\u7981\u6B62\u91CD\u590D\u9875\u9762\u548C\u89C6\u89C9\u95EE\u9898\u3002status=ready \u65F6\u53EA\u5C55\u793A\u4E00\u6B21 brief\uFF0C\u5E76\u7ACB\u5373\u7528\u5BBF\u4E3B ask_user_question \u539F\u6837\u5C55\u793A confirmation \u7684\u201C\u786E\u8BA4\u751F\u6210 / \u4FEE\u6539\u9875\u9762\u8303\u56F4 / \u4FEE\u6539\u89C6\u89C9\u65B9\u5411\u201D\u4E09\u4E2A\u9009\u9879\uFF0C\u7981\u6B62\u8BA9\u7528\u6237\u5728\u8F93\u5165\u6846\u91CC\u624B\u52A8\u8F93\u5165\u201C\u786E\u8BA4\u201D\uFF1B\u9009\u62E9\u540E\u5206\u522B\u8C03\u7528 action=confirm\uFF0C\u6216 action=revise + \u5BF9\u5E94 questionId\u3002\u53EA\u6709 confirmed \u7ED3\u679C\u624D\u5305\u542B elements \u4E0E instructions\uFF0C\u53EF\u5F00\u59CB\u5199 draw2code-pages/<board>/index.html\u3002\u4E25\u683C\u751F\u6210\u5355\u6587\u4EF6\u5185\u8054 HTML\uFF0C\u53EA\u66F4\u65B0\u6240\u9009\u9875\u9762\u5E76\u4FDD\u7559\u672A\u9009\u9875\u9762\uFF1B\u753B\u677F\u662F\u9875\u9762\u3001\u4FE1\u606F\u5C42\u7EA7\u3001\u6587\u6848\u3001mock \u6570\u636E\u3001\u7EC4\u4EF6\u8BED\u4E49\u548C\u4EA4\u4E92\u5173\u7CFB\u7684\u4E8B\u5B9E\u6765\u6E90\uFF0C\u4E0D\u662F\u50CF\u7D20\u6A21\u677F\u3002\u6700\u7EC8\u9875\u9762\u5FC5\u987B\u4F7F\u7528\u5185\u5BB9\u6D41\u3001CSS Grid/Flex \u548C\u54CD\u5E94\u5F0F\u7EA6\u675F\u91CD\u65B0\u6392\u7248\uFF0C\u7981\u6B62\u7167\u642C Excalidraw \u7EDD\u5BF9\u5750\u6807\uFF1B\u53C2\u8003\u56FE\u53EA\u51B3\u5B9A\u89C6\u89C9\u8868\u73B0\uFF0C\u5185\u5BB9\u548C\u6D41\u7A0B\u4ECD\u4EE5\u539F\u578B\u4E3A\u51C6\u3002\u5199\u5165\u6587\u4EF6\u4E0D\u7B49\u4E8E\u5B8C\u6210\uFF1A\u5FC5\u987B\u81EA\u52A8\u6253\u5F00\u771F\u5B9E\u6D4F\u89C8\u5668\u9884\u89C8\uFF0C\u9010\u9875\u622A\u56FE\uFF0C\u68C0\u67E5\u76EE\u6807\u89C6\u53E3\u3001\u63A7\u5236\u53F0\u3001DOM\u3001\u6A2A\u5411\u6EA2\u51FA\u3001\u5185\u5BB9\u88C1\u5207\u3001\u6309\u94AE\u6587\u6848\u5C45\u4E2D\u548C\u5E95\u90E8\u5BFC\u822A\uFF0C\u5E76\u8D70\u901A\u6838\u5FC3\u6D41\u7A0B\uFF1B\u5B9E\u73B0\u95EE\u9898\u81EA\u52A8\u4FEE\u590D\u5E76\u91CD\u9A8C\u3002\u5168\u90E8\u901A\u8FC7\u540E\u63D0\u4EA4\u5305\u542B previewUrl\u3001viewports\u3001\u9010\u9875 screenshots\u3001consoleErrors\u3001domChecks\u3001layoutChecks \u548C interactionChecks \u7684 verificationEvidence\uFF0C\u518D\u8C03\u7528 action=complete\uFF1B\u51E0\u4E2A\u81EA\u62A5\u5E03\u5C14\u503C\u4E0D\u80FD\u66FF\u4EE3\u8BC1\u636E\u3002\u53EA\u6709\u8FD4\u56DE status=completed \u624D\u80FD\u5411\u7528\u6237\u62A5\u544A\u5B8C\u6210\u3002\u4E2D\u65AD\u65F6 action=resume \u4ECE\u5F53\u524D\u9636\u6BB5\u7EE7\u7EED\uFF1B\u666E\u901A\u540E\u7EED\u6539\u6837\u5F0F\u6216\u6587\u6848\u4E0D\u81EA\u52A8\u91CD\u8FDB generate\uFF0C\u53EA\u6709\u7528\u6237\u518D\u6B21\u660E\u786E\u8981\u6C42\u91CD\u65B0\u751F\u6210\u624D action=start\u3002",
  "generate \u8BC1\u636E\u4E0E\u9875\u9762\u4FDD\u62A4\u8865\u5145\uFF1A\u6BCF\u4E2A\u9875\u9762\u5FC5\u987B\u7528 <!-- d2c-page:<\u9875\u9762\u539F\u540D>:start/end --> \u6CE8\u91CA\u5305\u4F4F\uFF0C\u91CD\u65B0\u751F\u6210\u65F6\u5DE5\u5177\u4F1A\u76F4\u63A5\u6BD4\u8F83\u672A\u9009\u9875\u9762\u5757\u7684\u54C8\u5E0C\u3002verificationEvidence \u5FC5\u987B\u5E26\u672C\u6B21\u9A8C\u6536\u552F\u4E00 captureId \u548C\u5F53\u524D\u751F\u6210\u5165\u53E3 outputSha256\uFF1BpreviewUrl \u8FD4\u56DE\u5185\u5BB9\u7684\u54C8\u5E0C\u5FC5\u987B\u7B49\u4E8E outputSha256\u3002screenshots \u548C domSnapshots \u90FD\u5FC5\u987B\u4FDD\u5B58\u4E3A workspace \u5185\u771F\u5B9E\u6587\u4EF6\uFF0C\u643A\u5E26\u540C\u4E00\u4E2A captureId \u4E0E\u5404\u81EA sha256\uFF1B\u622A\u56FE\u5FC5\u987B\u662F\u4E0E viewport \u5C3A\u5BF8\u4E00\u81F4\u7684\u53EF\u89E3\u538B PNG\uFF0CDOM \u5FEB\u7167\u5FC5\u987B\u5305\u542B\u539F\u578B\u4E2D\u7684\u5173\u952E\u6587\u6848\u548C mock \u6570\u636E\u3002consoleErrors \u4E0E consoleWarnings \u90FD\u5FC5\u987B\u662F\u7A7A\u6570\u7EC4\uFF1B\u591A\u9875\u9762\u751F\u6210\u8FD8\u5FC5\u987B\u63D0\u4EA4 page-switching \u68C0\u67E5\u3002\u65E7\u7684 previewOpened\u3001selectedPagesVisible\u3001coreFlowPassed\u3001mockDataVisible \u548C unselectedPagesPreserved \u53EA\u4FDD\u7559\u53C2\u6570\u517C\u5BB9\uFF0C\u4E0D\u518D\u80FD\u5355\u72EC\u5B8C\u6210\u9A8C\u6536\u3002",
  "\u753B\u7F16\u8F91\u534F\u4F5C\u89C4\u5219\uFF1A\u6BCF\u6B21 draw2code_update \u90FD\u5E94\u5148\u8F93\u51FA\u4E00\u6BB5\u201C\u66F4\u65B0\u6458\u8981\u201D\uFF08\u4E0D\u662F\u6A21\u677F\u5316\u63D0\u95EE\uFF09\uFF1A1) \u4E0A\u4E00\u8F6E\u7528\u6237\u624B\u5DE5\u6539\u52A8\uFF1B2) \u8FD9\u4E00\u8F6E\u8BA1\u5212\u6539\u52A8\uFF1B3) \u51B2\u7A81\u68C0\u67E5\uFF08\u662F\u5426\u89E6\u53CA\u624B\u5DE5\u6539\u52A8\u6216\u66FF\u6362/\u6E05\u7A7A\uFF09\u3002\u53EA\u6709\u201C\u51B2\u7A81\u201D\u65F6\u624D\u8981\u6C42\u786E\u8BA4\uFF0C\u8FD4\u56DE pending \u540E\u8BF7\u53EA\u8BE2\u95EE\u76F8\u5173\u53D8\u66F4\u662F\u5426\u8986\u76D6\uFF1B\u6CA1\u51B2\u7A81\u5219\u76F4\u63A5\u6267\u884C\u5E76\u6C47\u62A5\u7ED3\u679C\uFF08\u4E0D\u6253\u65AD\u7528\u6237\uFF09\u3002\u5DE5\u5177\u8FD4\u56DE\u524D\u4F1A\u91CD\u65B0\u8BFB\u53D6\u540C\u4E00\u753B\u677F\u9A8C\u8BC1\u5199\u5165\uFF1B\u53EA\u6709\u8FD4\u56DE verified=true \u4E14 targetBoard \u4E0E activeBoard \u76F8\u540C\uFF0C\u624D\u80FD\u8BF4\u201C\u7528\u6237\u5F53\u524D\u753B\u677F\u5DF2\u753B\u597D\u201D\uFF1B\u82E5 verified=true \u4F46\u4E24\u8005\u4E0D\u540C\uFF0C\u5FC5\u987B\u660E\u786E\u8BF4\u201C\u76EE\u6807\u753B\u677F\u5DF2\u5199\u5165\u3001\u5F53\u524D\u754C\u9762\u4E0D\u53EF\u89C1\u201D\uFF0C\u4E0D\u80FD\u58F0\u79F0\u7528\u6237\u5DF2\u770B\u5230\u3002\u82E5\u68C0\u6D4B\u5230\u624B\u5DE5\u6539\u52A8\u4E0E\u672C\u8F6E upsert/delete \u540C id\u3001\u6216\u6267\u884C clear/replace \u4E14\u9762\u677F\u975E\u7A7A\uFF0C\u5C31\u5E94\u8FDB\u5165\u786E\u8BA4\u6D41\u7A0B\uFF1B\u786E\u8BA4\u540E\u91CD\u65B0\u8C03\u7528 draw2code_update \u5E76\u8BBE\u7F6E force=true\u3002",
  "\u9650\u5236\uFF1A\u5355\u753B\u677F \u22642000 \u5143\u7D20\u3001\u2264512KB\uFF1B\u751F\u6210\u524D\u7AEF\u9875\u9762\u524D\u5FC5\u987B\u5148 draw2code_read \u6700\u65B0\u753B\u677F\uFF0C\u4E0D\u8981\u51ED\u8BB0\u5FC6\u753B\u7ED3\u6784\u3002\u753B\u677F\u5E26\u81EA\u52A8\u7248\u672C\u5B58\u6863\uFF1A\u4F60\u7684\u6BCF\u6B21 draw2code_update \u90FD\u4F1A\u5148\u5FEB\u7167\u65E7\u72B6\u6001\uFF08\u7528\u6237\u53EF\u5728\u300C\u5386\u53F2\u300D\u83DC\u5355\u56DE\u6EDA\u4EFB\u610F\u7248\u672C\uFF09\uFF0C\u56E0\u6B64\u5927\u6539\u4E0D\u5FC5\u72B9\u8C6B\u3002\u7528\u6237\u63D0\u5230\u300C\u753B\u677F / \u539F\u578B / \u753B\u4E00\u4E0B / draw2code / \u753B\u7801\u300D\u65F6\u5373\u6307\u672C\u63D2\u4EF6\uFF0C\u8BF7\u636E\u6B64\u534F\u4F5C\u3002"
].join("\n\n");

// src/index.ts
var name = "draw2code";
var inject = ["webServer", "tools", "systemPrompt", "workspaceRegistry"];
function apply(ctx) {
  const projects = new ProjectStore(ctx);
  const store = new SceneStore(ctx);
  const routes = makeRoutes(store);
  const tools = [draw2codeListTool(store), draw2codeReadTool(store), draw2codeCreateTool(projects, store), draw2codeUpdateTool(store), draw2codeGenerateTool(store, projects)];
  ctx.effect(() => {
    const disposers = routes.map((route) => ctx.webServer.register(route));
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, "dsh-draw2code: routes");
  ctx.effect(() => {
    const disposers = tools.map((tool) => ctx.tools.register(tool));
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, "dsh-draw2code: tools");
  ctx.effect(() => ctx.systemPrompt.section({
    name: "plugin:draw2code",
    order: SECTION_ORDER,
    text: DRAW2CODE_GUIDANCE
  }), "dsh-draw2code: prompt section");
}
export {
  ProjectStore,
  SceneStore,
  apply,
  draw2codeCreateTool,
  draw2codeGenerateTool,
  draw2codeListTool,
  draw2codeReadTool,
  draw2codeUpdateTool,
  emptyScene,
  formatLayoutIssues,
  inject,
  inspectPrototypeLayout,
  isPathInside,
  makeRoutes,
  name,
  normalizeElement
};
