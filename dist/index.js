// src/index.ts
import { resolve as resolve2 } from "node:path";

// src/project-store.ts
import { randomUUID } from "node:crypto";
import { mkdir as mkdir2, readFile as readFile2, readdir as readdir2, rename as rename2, stat as stat2, writeFile as writeFile2 } from "node:fs/promises";
import { realpath as realpath2 } from "node:fs/promises";
import { join as join2 } from "node:path";

// src/scene-store.ts
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
var SCENE_DIR = "draw2code";
var ACTIVE_BOARD_FILE = ".active-board.json";
var GENERATIONS_DIR = ".generations";
var GENERATE_SETTINGS_DIR = ".generate-settings";
var GENERATION_ID_RE = /^generation-[0-9a-f-]{36}$/;
var PAGES_DIR = "draw2code-pages";
var DEFAULT_MAX_SCENE_BYTES = 256 * 1024 * 1024;
var DEFAULT_SOFT_SCENE_BYTES = 32 * 1024 * 1024;
var DEFAULT_MAX_OPS_BYTES = 512 * 1024;
var DEFAULT_MAX_OPS = 500;
var DEFAULT_MAX_VERSION_STORAGE_BYTES = 512 * 1024 * 1024;
var DEFAULT_MAX_ELEMENTS = 5e4;
var MAX_ELEMENT_BYTES = 16 * 1024;
var MAX_TEXT_CHARS = 4e3;
var NAME_RE = /^[\w\u4e00-\u9fa5][\w\u4e00-\u9fa5 -]{0,63}$/;
var VERSIONS_DIR = ".versions";
var MAX_VERSIONS = 30;
var CLIENT_ARCHIVE_INTERVAL_MS = 10 * 6e4;
var WRITE_QUEUES = /* @__PURE__ */ new Map();
var BOARD_REVEALS = /* @__PURE__ */ new Map();
var BOARD_REVIEWS = /* @__PURE__ */ new Map();
var revealCounter = 0;
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
function semanticTextAlignment(role2) {
  if (CENTERED_TEXT_ROLES.has(role2)) return { textAlign: "center", verticalAlign: "middle" };
  if (LEFT_MIDDLE_TEXT_ROLES.has(role2)) return { textAlign: "left", verticalAlign: "middle" };
  return null;
}
function semanticRole(element) {
  if (typeof element?.customData !== "object" || element.customData === null) return "";
  const role2 = element.customData.role;
  return typeof role2 === "string" ? role2.toLowerCase() : "";
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
var VERSION_FILE_RE = /^(\d{9,})-[0-9a-z]{1,8}\.json(?:\.gz)?$/;
function versionStamp(entry) {
  const match = VERSION_FILE_RE.exec(entry);
  return match === null ? null : Number(match[1]);
}
function versionId(entry) {
  return entry.replace(/\.json(?:\.gz)?$/, "");
}
function decodeVersion(entry, bytes, maxOutputLength) {
  return entry.endsWith(".gz") ? gunzipSync(bytes, { maxOutputLength }).toString("utf8") : bytes.toString("utf8");
}
function isDeltaVersionPayload(value) {
  if (typeof value !== "object" || value === null) return false;
  const payload = value;
  return payload.schema === "draw2code-version-v1" && payload.kind === "delta" && typeof payload.baseId === "string" && Number.isSafeInteger(payload.depth) && Array.isArray(payload.deletedIds) && Array.isArray(payload.upserts) && (payload.elementOrder === void 0 || Array.isArray(payload.elementOrder));
}
function buildVersionDelta(baseId, depth, before, after) {
  const beforeById = new Map(before.elements.map((element) => [String(element.id ?? ""), element]));
  const afterById = new Map(after.elements.map((element) => [String(element.id ?? ""), element]));
  const deletedIds = [...beforeById.keys()].filter((id) => !afterById.has(id));
  const upserts = after.elements.filter((element) => {
    const id = String(element.id ?? "");
    const previous = beforeById.get(id);
    return previous === void 0 || JSON.stringify(previous) !== JSON.stringify(element);
  });
  const beforeOrder = before.elements.map((element) => String(element.id ?? ""));
  const afterOrder = after.elements.map((element) => String(element.id ?? ""));
  return {
    schema: "draw2code-version-v1",
    kind: "delta",
    baseId,
    depth,
    elementCount: after.elements.length,
    deletedIds,
    upserts,
    ...JSON.stringify(beforeOrder) === JSON.stringify(afterOrder) ? {} : { elementOrder: afterOrder },
    appState: after.appState
  };
}
function applyVersionDelta(base, delta) {
  const byId = new Map(base.elements.map((element) => [String(element.id ?? ""), element]));
  for (const id of delta.deletedIds) byId.delete(id);
  for (const element of delta.upserts) byId.set(String(element.id ?? ""), element);
  const elementOrder = delta.elementOrder ?? base.elements.map((element) => String(element.id ?? "")).filter((id) => !delta.deletedIds.includes(id));
  return {
    type: "excalidraw",
    version: 2,
    source: "dsh-draw2code",
    elements: elementOrder.flatMap((id) => {
      const element = byId.get(id);
      return element === void 0 ? [] : [element];
    }),
    appState: delta.appState
  };
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
  const num4 = (v, d) => typeof v === "number" && Number.isFinite(v) ? v : d;
  const str4 = (v, d) => typeof v === "string" ? v : d;
  const text3 = str4(el.text, "").slice(0, MAX_TEXT_CHARS);
  const now2 = Date.now();
  const authoredCustomData = typeof el.customData === "object" && el.customData !== null ? el.customData : {};
  const role2 = str4(authoredCustomData.role, "").toLowerCase();
  const explicitTone = str4(authoredCustomData.tone, "").toLowerCase();
  const inferredTone = explicitTone !== "" ? explicitTone : role2 === "primary-action" || role2 === "primary-button" ? "primary" : role2 === "success" || role2 === "completed" ? "success" : role2 === "warning" ? "warning" : role2 === "danger" || role2 === "error" || role2 === "overdue" ? "danger" : "";
  const semanticColor = SEMANTIC_COLOR_TYPES.has(type) ? SEMANTIC_PALETTE[inferredTone] : void 0;
  const out = {
    id,
    type,
    x: num4(el.x, 0),
    y: num4(el.y, 0),
    width: num4(el.width, type === "text" ? 160 : 180),
    height: num4(el.height, type === "text" ? 80 : type === "frame" ? 320 : 80),
    angle: num4(el.angle, 0),
    strokeColor: str4(el.strokeColor, semanticColor?.stroke ?? "#1e1e1e"),
    backgroundColor: str4(el.backgroundColor, semanticColor?.background ?? "transparent"),
    fillStyle: str4(el.fillStyle, "solid"),
    strokeWidth: num4(el.strokeWidth, 1),
    strokeStyle: str4(el.strokeStyle, "solid"),
    roughness: num4(el.roughness, 1),
    opacity: num4(el.opacity, 100),
    groupIds: Array.isArray(el.groupIds) ? el.groupIds : [],
    frameId: el.frameId === void 0 || el.frameId === null ? null : el.frameId,
    roundness: el.roundness === void 0 || el.roundness === null ? type === "line" || type === "arrow" ? { type: 2 } : null : el.roundness,
    boundElements: Array.isArray(el.boundElements) ? el.boundElements : null,
    locked: el.locked === true,
    // Preserve links created by the user or authored by the agent. Invalid
    // values are discarded, but a valid Excalidraw link must survive a
    // client round-trip through normalizeScene().
    link: typeof el.link === "string" ? el.link : null,
    updated: num4(el.updated, now2),
    seed: num4(el.seed, randomSeed()),
    version: num4(el.version, 1),
    versionNonce: num4(el.versionNonce, randomSeed()),
    isDeleted: false
  };
  if (type === "text") {
    const fontSize = num4(el.fontSize, 20);
    const lines = text3 === "" ? 1 : text3.split("\n").length;
    out.text = text3;
    out.originalText = text3;
    out.fontSize = fontSize;
    out.fontFamily = num4(el.fontFamily, 1);
    out.textAlign = str4(el.textAlign, "left");
    out.verticalAlign = str4(el.verticalAlign, "top");
    out.containerId = el.containerId === void 0 || el.containerId === null ? null : el.containerId;
    out.lineHeight = num4(el.lineHeight, 1.25);
    out.autoResize = el.autoResize !== false;
    if (el.width === void 0) out.width = num4(el.width, Math.min(360, fontSize * (text3.length || 8) * 0.62 + 16));
    if (el.height === void 0) out.height = num4(el.height, lines * fontSize * 1.25 + 8);
  }
  if (type === "line" || type === "arrow") {
    const points = Array.isArray(el.points) && el.points.length > 0 ? el.points : [[0, 0], [num4(el.width, 160) - num4(el.x, 0), 0]];
    out.points = points;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    out.width = num4(el.width, Math.max(...xs) - Math.min(...xs));
    out.height = num4(el.height, Math.max(...ys) - Math.min(...ys));
    out.lastCommittedPoint = Array.isArray(el.lastCommittedPoint) ? el.lastCommittedPoint : null;
    out.startBinding = typeof el.startBinding === "object" && el.startBinding !== null ? el.startBinding : null;
    out.endBinding = typeof el.endBinding === "object" && el.endBinding !== null ? el.endBinding : null;
    out.startArrowhead = el.startArrowhead === null || typeof el.startArrowhead === "string" ? el.startArrowhead : null;
    out.endArrowhead = el.endArrowhead === null || typeof el.endArrowhead === "string" ? el.endArrowhead : null;
  }
  if (type === "frame") {
    const frameName = str4(el.name, "").trim();
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
      const elementRole3 = semanticRole(element);
      const containerRole = semanticRole(container);
      const elementAlignment = semanticTextAlignment(elementRole3);
      const containerAlignment = semanticTextAlignment(containerRole);
      const role2 = elementAlignment !== null ? elementRole3 : containerRole;
      const isFocused2 = alignmentFocusIds === void 0 || alignmentFocusIds.has(String(element.id ?? "")) || container !== void 0 && alignmentFocusIds.has(String(container.id ?? ""));
      const alignment = elementAlignment ?? containerAlignment;
      if (isFocused2 && alignment !== null) {
        if (detachedNavigationTextIds.has(String(element.id ?? ""))) {
          return {
            ...semanticTextGeometry(element, container, alignment),
            containerId: null
          };
        }
        if (container !== void 0) return semanticTextGeometry(element, container, alignment);
        if (BOTTOM_NAVIGATION_ITEM_ROLES.has(role2)) {
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
function normalizeScene(input, maxElements = DEFAULT_MAX_ELEMENTS) {
  if (typeof input !== "object" || input === null) throw new Error("scene must be an object");
  const raw = input;
  if (!Array.isArray(raw.elements)) throw new Error("scene.elements must be an array");
  if (raw.elements.length > maxElements) throw new Error(`scene has more than ${maxElements} elements`);
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
function positiveInteger(value, fallback) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function resolvedCapacityLimits(options = {}) {
  const hardCapBytes = positiveInteger(
    options.hardCapBytes ?? process.env.DRAW2CODE_MAX_SCENE_BYTES,
    DEFAULT_MAX_SCENE_BYTES
  );
  const softDefault = Math.min(DEFAULT_SOFT_SCENE_BYTES, Math.max(1, Math.floor(hardCapBytes * 0.8)));
  const requestedSoft = positiveInteger(options.softCapBytes ?? process.env.DRAW2CODE_SOFT_SCENE_BYTES, softDefault);
  return {
    hardCapBytes,
    softCapBytes: Math.min(requestedSoft, hardCapBytes),
    maxElements: positiveInteger(options.maxElements ?? process.env.DRAW2CODE_MAX_ELEMENTS, DEFAULT_MAX_ELEMENTS),
    maxBatchBytes: positiveInteger(options.maxBatchBytes ?? process.env.DRAW2CODE_MAX_OPS_BYTES, DEFAULT_MAX_OPS_BYTES),
    maxBatchOps: positiveInteger(options.maxBatchOps ?? process.env.DRAW2CODE_MAX_OPS, DEFAULT_MAX_OPS),
    maxVersionStorageBytes: positiveInteger(
      options.maxVersionStorageBytes ?? process.env.DRAW2CODE_MAX_VERSION_STORAGE_BYTES,
      DEFAULT_MAX_VERSION_STORAGE_BYTES
    )
  };
}
function inlineAssetBytes(value, seen = /* @__PURE__ */ new Set()) {
  if (typeof value === "string") return value.startsWith("data:") ? Buffer.byteLength(value, "utf8") : 0;
  if (typeof value !== "object" || value === null || seen.has(value)) return 0;
  seen.add(value);
  if (Array.isArray(value)) return value.reduce((total, item) => total + inlineAssetBytes(item, seen), 0);
  return Object.values(value).reduce((total, item) => total + inlineAssetBytes(item, seen), 0);
}
function capacityForNormalizedScene(scene, limits) {
  const canonicalBytes = Buffer.byteLength(JSON.stringify(scene), "utf8");
  const persistedBytes = Buffer.byteLength(`${JSON.stringify(scene, null, 2)}
`, "utf8");
  const assetBytes = inlineAssetBytes(scene.elements);
  return {
    maxBytes: limits.hardCapBytes,
    hardCapBytes: limits.hardCapBytes,
    softCapBytes: limits.softCapBytes,
    usedBytes: canonicalBytes,
    canonicalBytes,
    persistedBytes,
    persistedOverheadBytes: persistedBytes - canonicalBytes,
    assetBytes,
    elementCount: scene.elements.length,
    maxElements: limits.maxElements,
    remainingBytes: limits.hardCapBytes - canonicalBytes,
    utilizationPercent: Math.round(canonicalBytes / limits.hardCapBytes * 1e3) / 10,
    status: canonicalBytes > limits.hardCapBytes ? "hard-cap-exceeded" : canonicalBytes >= limits.softCapBytes ? "large" : "normal"
  };
}
function measureSceneCapacity(input, options = {}) {
  const limits = resolvedCapacityLimits(options);
  return capacityForNormalizedScene(normalizeScene(input, limits.maxElements), limits);
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
function parseOps(input, maxEntries = DEFAULT_MAX_ELEMENTS) {
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
  if (source.length > maxEntries) throw new Error(`ops has ${source.length} entries (max ${maxEntries})`);
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
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.limits = resolvedCapacityLimits(options);
  }
  limits;
  capacityLimits() {
    return { ...this.limits };
  }
  measureCapacity(input) {
    return capacityForNormalizedScene(normalizeScene(input, this.limits.maxElements), this.limits);
  }
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
    const previous = WRITE_QUEUES.get(path) ?? Promise.resolve();
    let release = () => void 0;
    const current = new Promise((resolve3) => {
      release = resolve3;
    });
    const tail = previous.catch(() => void 0).then(() => current);
    WRITE_QUEUES.set(path, tail);
    await previous.catch(() => void 0);
    try {
      return await task();
    } finally {
      release();
      if (WRITE_QUEUES.get(path) === tail) WRITE_QUEUES.delete(path);
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
    return this.withWriteLock(path, async () => {
      const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await writeFile(tmp, `${JSON.stringify({ name: named.value })}
`, "utf8");
      await rename(tmp, path);
      return { ok: true, value: { name: named.value } };
    });
  }
  /** Publish the latest verified update for the browser-side auto-open loop. */
  async publishBoardReveal(root, name2, revision) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    revealCounter += 1;
    const request = {
      id: `reveal-${Date.now().toString(36)}-${revealCounter.toString(36)}`,
      board: named.value,
      revision,
      createdAt: Date.now()
    };
    BOARD_REVEALS.set(gated.value, request);
    return { ok: true, value: request };
  }
  /** Read the latest reveal request; clients de-duplicate it by id. */
  async getBoardReveal(root) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    return { ok: true, value: { request: BOARD_REVEALS.get(gated.value) ?? null } };
  }
  /** Record that the browser consumed the latest reveal and opened its tab. */
  async ackBoardReveal(root, id, board) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const current = BOARD_REVEALS.get(gated.value);
    if (current === void 0 || current.id !== id || current.board !== board) {
      return err("stale-reveal", "reveal acknowledgement does not match the latest request");
    }
    const acknowledged = { ...current, consumedAt: current.consumedAt ?? Date.now() };
    BOARD_REVEALS.set(gated.value, acknowledged);
    return { ok: true, value: acknowledged };
  }
  /** Record a visible review of the latest reveal without writing the board. */
  async recordBoardReview(root, input) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(input.board);
    if (!named.ok) return named;
    const current = BOARD_REVEALS.get(gated.value);
    if (current === void 0 || current.id !== input.token || current.board !== named.value) {
      return err("visual-review-stale", "review token does not match the latest visible-board reveal");
    }
    if (Math.abs(current.revision - input.boardRevision) > 0.5) {
      return err("visual-review-stale", `review token revision ${current.revision} does not match current board revision ${input.boardRevision}`);
    }
    if (typeof current.consumedAt !== "number") {
      return err("visual-review-not-visible", "the canvas has not acknowledged opening this review token");
    }
    const key = `${gated.value}\0${named.value}\0${input.phase}`;
    const existing = BOARD_REVIEWS.get(key);
    if (existing?.token === input.token) return { ok: true, value: existing };
    const { boardRevision, ...reviewInput } = input;
    const receipt = {
      ...reviewInput,
      board: named.value,
      revision: boardRevision,
      inspectedPageIds: [...input.inspectedPageIds],
      observations: [...input.observations],
      reviewedAt: Date.now()
    };
    BOARD_REVIEWS.set(key, receipt);
    return { ok: true, value: receipt };
  }
  /** Read the latest stored review for one board and phase. */
  async getBoardReview(root, board, phase) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(board);
    if (!named.ok) return named;
    const key = `${gated.value}\0${named.value}\0${phase}`;
    return { ok: true, value: { receipt: BOARD_REVIEWS.get(key) ?? null } };
  }
  /** The versions directory of one board (inside draw2code/.versions/<name>). */
  versionsDir(canonicalRoot, name2) {
    return join(this.dir(canonicalRoot), VERSIONS_DIR, name2);
  }
  async readVersionEntry(dir, id, seen = /* @__PURE__ */ new Set()) {
    if (seen.has(id) || seen.size >= 16) throw new Error(`version delta chain is cyclic or too deep at ${id}`);
    seen.add(id);
    let entry = "";
    let bytes;
    for (const candidate of [`${id}.json.gz`, `${id}.json`]) {
      try {
        bytes = await readFile(join(dir, candidate));
        entry = candidate;
        break;
      } catch {
      }
    }
    if (bytes === void 0) throw new Error(`version ${id} does not exist`);
    if (bytes.byteLength > this.limits.hardCapBytes * 4) throw new Error(`version ${id} exceeds the compressed read cap`);
    const raw = decodeVersion(entry, bytes, this.limits.hardCapBytes * 4);
    if (Buffer.byteLength(raw, "utf8") > this.limits.hardCapBytes * 4) throw new Error(`version ${id} exceeds the read cap`);
    const parsed = JSON.parse(raw);
    if (isDeltaVersionPayload(parsed)) {
      const base = await this.readVersionEntry(dir, parsed.baseId, seen);
      return {
        scene: normalizeScene(applyVersionDelta(base.scene, parsed), this.limits.maxElements),
        storedBytes: bytes.byteLength,
        format: "gzip-delta",
        depth: parsed.depth
      };
    }
    return {
      scene: normalizeScene(parsed, this.limits.maxElements),
      storedBytes: bytes.byteLength,
      format: entry.endsWith(".gz") ? "gzip-json" : "json",
      depth: 0
    };
  }
  async writeCompressedVersion(dir, entry, json) {
    const target = join(dir, entry);
    const temp = `${target}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    const compressed = gzipSync(Buffer.from(json, "utf8"), { level: 6 });
    await writeFile(temp, compressed);
    await rename(temp, target);
    return compressed.byteLength;
  }
  async materializeDependentVersion(dir, removedEntry, nextEntry) {
    if (nextEntry === void 0) return;
    const removedId = versionId(removedEntry);
    const nextId = versionId(nextEntry);
    let raw;
    try {
      raw = decodeVersion(nextEntry, await readFile(join(dir, nextEntry)), this.limits.hardCapBytes * 4);
    } catch {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isDeltaVersionPayload(parsed) || parsed.baseId !== removedId) return;
    const resolved = await this.readVersionEntry(dir, nextId);
    await this.writeCompressedVersion(dir, `${nextId}.json.gz`, JSON.stringify(resolved.scene));
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
      const orderedEntries = [...entries].sort((a, b) => (versionStamp(a) ?? 0) - (versionStamp(b) ?? 0));
      const latestStamp = versionStamp(orderedEntries.at(-1) ?? "") ?? 0;
      const entry = `${Math.max(Date.now(), latestStamp + 1)}-${suffix}.json.gz`;
      const latestEntry = orderedEntries.at(-1);
      const currentScene = normalizeScene(JSON.parse(currentJson), this.limits.maxElements);
      const fullCompressed = gzipSync(Buffer.from(currentJson, "utf8"), { level: 6 });
      let snapshotJson = currentJson;
      if (latestEntry !== void 0) {
        try {
          const latest = await this.readVersionEntry(dir, versionId(latestEntry));
          if (latest.depth < 8) {
            const delta = buildVersionDelta(versionId(latestEntry), latest.depth + 1, latest.scene, currentScene);
            const deltaJson = JSON.stringify(delta);
            const deltaCompressed = gzipSync(Buffer.from(deltaJson, "utf8"), { level: 6 });
            if (deltaCompressed.byteLength < fullCompressed.byteLength * 0.9) snapshotJson = deltaJson;
          }
        } catch {
        }
      }
      await this.writeCompressedVersion(dir, entry, snapshotJson);
      const stored = await Promise.all([...entries, entry].map(async (candidate) => ({
        entry: candidate,
        stamp: versionStamp(candidate) ?? 0,
        bytes: (await stat(join(dir, candidate))).size
      })));
      stored.sort((a, b) => a.stamp - b.stamp);
      let totalBytes = stored.reduce((total, candidate) => total + candidate.bytes, 0);
      while (stored.length > MAX_VERSIONS || totalBytes > this.limits.maxVersionStorageBytes) {
        const doomed = stored.shift();
        if (doomed === void 0) break;
        const next = stored[0];
        await this.materializeDependentVersion(dir, doomed.entry, next?.entry);
        if (next !== void 0) {
          const rewrittenBytes = (await stat(join(dir, next.entry))).size;
          totalBytes += rewrittenBytes - next.bytes;
          next.bytes = rewrittenBytes;
        }
        totalBytes -= doomed.bytes;
        await rm(join(dir, doomed.entry), { force: true }).catch(() => void 0);
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
        const resolved = await this.readVersionEntry(dir, versionId(entry));
        versions.push({
          id: versionId(entry),
          ts: stamp,
          elementCount: resolved.scene.elements.length,
          storedBytes: resolved.storedBytes,
          format: resolved.format
        });
      } catch {
      }
    }
    versions.sort((a, b) => b.ts - a.ts);
    return { ok: true, value: versions };
  }
  /** Independent history-storage budget and current compressed usage. */
  async versionStorage(root, name2) {
    const versions = await this.listVersions(root, name2);
    if (!versions.ok) return versions;
    return {
      ok: true,
      value: {
        versionCount: versions.value.length,
        storedBytes: versions.value.reduce((total, version) => total + version.storedBytes, 0),
        maxStoredBytes: this.limits.maxVersionStorageBytes,
        maxVersions: MAX_VERSIONS
      }
    };
  }
  /** Read one archived version without changing the current board. */
  async readVersion(root, name2, id) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name2);
    if (!named.ok) return named;
    if (!/^\d{9,}-[0-9a-z]{1,8}$/.test(id)) return err("bad-version", `version id "${id}" is invalid`);
    try {
      const resolved = await this.readVersionEntry(this.versionsDir(gated.value, named.value), id);
      return {
        ok: true,
        value: {
          id,
          ts: Number(id.split("-", 1)[0]),
          elementCount: resolved.scene.elements.length,
          storedBytes: resolved.storedBytes,
          format: resolved.format,
          scene: resolved.scene
        }
      };
    } catch (error2) {
      const message = error2 instanceof Error ? error2.message : String(error2);
      if (message.includes("does not exist")) return err("not-found", `version ${id} of scene "${named.value}" does not exist`);
      return err("corrupt", `version ${id} of scene "${named.value}" cannot be restored: ${message}`);
    }
  }
  /** Roll a board back to one archived version (snapshotting the current
   * state first, so the rollback itself is reversible). */
  async restoreVersion(root, name2, id) {
    const version = await this.readVersion(root, name2, id);
    if (!version.ok) return version;
    return this.write(root, name2, version.value.scene, void 0, "agent");
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
    if (Buffer.byteLength(raw) > this.limits.hardCapBytes * 4) {
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
      scene = normalizeScene(sceneInput, this.limits.maxElements);
    } catch (error2) {
      return err("bad-scene", error2 instanceof Error ? error2.message : String(error2));
    }
    const capacity = this.measureCapacity(scene);
    if (capacity.canonicalBytes > capacity.hardCapBytes) {
      return err("too-large", `scene canonical content is ${capacity.canonicalBytes} bytes and exceeds the ${capacity.hardCapBytes}-byte hard cap`);
    }
    const json = JSON.stringify(scene, null, 2);
    const path = await this.scenePath(gated.value, named.value);
    return this.withWriteLock(path, async () => {
      if (typeof baseRev === "number") {
        try {
          const info2 = await stat(path);
          if (Math.abs(info2.mtimeMs - baseRev) > 0.5) {
            return err("conflict", `scene changed on disk since rev ${baseRev}`);
          }
        } catch {
          if (baseRev !== 0) return err("conflict", `scene was deleted since rev ${baseRev}`);
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
    return this.withWriteLock(path, async () => {
      try {
        await rm(path);
      } catch {
        return err("not-found", `scene "${name2}" does not exist`);
      }
      await rm(this.versionsDir(gated.value, named.value), { recursive: true, force: true }).catch(() => void 0);
      const active = await this.getActiveBoard(root);
      if (active.ok && active.value.name === named.value) {
        const activePath = this.activeBoardPath(gated.value);
        await this.withWriteLock(activePath, async () => {
          const latest = await this.getActiveBoard(root);
          if (latest.ok && latest.value.name === named.value) await rm(activePath, { force: true });
        });
      }
      BOARD_REVEALS.delete(gated.value);
      BOARD_REVIEWS.delete(`${gated.value}\0${named.value}\0representative`);
      BOARD_REVIEWS.delete(`${gated.value}\0${named.value}\0final`);
      return { ok: true, value: { deleted: true } };
    });
  }
  /**
   * Apply an ops array against a scene (auto-creating an empty scene when it
   * does not exist yet) — the agent-side mutation path. Upserts normalize
   * their element, so partial authored fields are filled.
   */
  async applyOps(root, name2, opsInput, baseRev) {
    let ops;
    try {
      ops = parseOps(opsInput, this.limits.maxElements);
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
          scene = normalizeScene(op.scene, this.limits.maxElements);
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
    if (scene.elements.length > this.limits.maxElements) {
      return err("too-many", `scene would exceed ${this.limits.maxElements} elements`);
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
var PROJECT_MUTATION_QUEUES = /* @__PURE__ */ new Map();
var ProjectStore = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  async withMutationLock(path, task) {
    const previous = PROJECT_MUTATION_QUEUES.get(path) ?? Promise.resolve();
    let release = () => void 0;
    const current = new Promise((resolve3) => {
      release = resolve3;
    });
    const tail = previous.catch(() => void 0).then(() => current);
    PROJECT_MUTATION_QUEUES.set(path, tail);
    await previous.catch(() => void 0);
    try {
      return await task();
    } finally {
      release();
      if (PROJECT_MUTATION_QUEUES.get(path) === tail) PROJECT_MUTATION_QUEUES.delete(path);
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
    const { rm: rm3 } = await import("node:fs/promises");
    await Promise.all(doomed.map(({ entry }) => rm3(join2(dir, entry), { force: true })));
  }
};

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
var SEMANTIC_COMPONENT_CATALOG = [
  { kind: "page-header", role: "page-heading", purpose: "\u8BF4\u660E\u9875\u9762\u8EAB\u4EFD\u4E0E\u5F53\u524D\u4E0A\u4E0B\u6587", requiredParts: ["\u53EF\u8BFB\u9875\u9762\u6807\u9898", "\u5FC5\u8981\u7684\u8FD4\u56DE\u3001\u65E5\u671F\u6216\u72B6\u6001\u4E0A\u4E0B\u6587"] },
  { kind: "task-card", role: "content-card", purpose: "\u627F\u8F7D\u4E00\u6761\u53EF\u64CD\u4F5C\u7684\u771F\u5B9E\u8BB0\u5F55", requiredParts: ["\u5BF9\u8C61\u6807\u9898", "\u72B6\u6001\u6216\u65F6\u95F4", "\u5FC5\u8981\u7684\u6B21\u7EA7\u4FE1\u606F"] },
  { kind: "form-field", role: "input", purpose: "\u4F4E\u6210\u672C\u5F55\u5165\u6216\u4FEE\u6539\u4FE1\u606F", requiredParts: ["\u5B57\u6BB5\u6807\u7B7E", "\u771F\u5B9E\u503C\u6216\u53EF\u7406\u89E3\u63D0\u793A", "\u8F93\u5165\u8FB9\u754C"] },
  { kind: "chip-group", role: "chip", purpose: "\u8868\u8FBE\u5C11\u91CF\u4E92\u65A5\u6216\u7B5B\u9009\u9009\u62E9", requiredParts: ["\u5B8C\u6574\u9009\u9879\u6587\u5B57", "\u6E05\u695A\u7684\u5F53\u524D\u9009\u4E2D\u9879"] },
  { kind: "stat-card", role: "stat-card", purpose: "\u7A81\u51FA\u4E00\u4E2A\u53EF\u6BD4\u8F83\u7684\u5173\u952E\u6307\u6807", requiredParts: ["\u6307\u6807\u540D", "\u6570\u503C\u4E0E\u5355\u4F4D", "\u5FC5\u8981\u7684\u72B6\u6001\u8BF4\u660E"] },
  { kind: "quadrant-grid", role: "category-card", purpose: "\u5E76\u5217\u5448\u73B0\u56DB\u7C7B\u4F18\u5148\u7EA7\u6216\u72B6\u6001", requiredParts: ["\u56DB\u4E2A\u8BED\u4E49\u6807\u9898", "\u514B\u5236\u7684\u8BED\u4E49\u8272", "\u6BCF\u7C7B\u771F\u5B9E\u5185\u5BB9"] },
  { kind: "radar-map", role: "radar-map", purpose: "\u8868\u8FBE\u9644\u8FD1\u5BF9\u8C61\u76F8\u5BF9\u4F4D\u7F6E\u4E0E\u626B\u63CF\u72B6\u6001", requiredParts: ["\u626B\u63CF\u4E2D\u5FC3", "\u81F3\u5C11 3 \u4E2A\u771F\u5B9E\u5BF9\u8C61\u70B9", "\u8DDD\u79BB\u6216\u5728\u7EBF\u72B6\u6001"] },
  { kind: "conversation-list", role: "message-list", purpose: "\u627F\u8F7D\u8054\u7CFB\u4EBA\u4E0E\u53CC\u65B9\u5BF9\u8BDD", requiredParts: ["\u8054\u7CFB\u4EBA\u6635\u79F0\u4E0E\u65F6\u95F4", "\u6700\u8FD1\u6D88\u606F", "\u53EF\u8BFB\u7684\u53CC\u65B9\u6D88\u606F\u6C14\u6CE1"] },
  { kind: "calendar-grid", role: "calendar-grid", purpose: "\u8868\u8FBE\u5B8C\u6574\u65E5\u671F\u7ED3\u6784\u4E0E\u5F53\u524D\u9009\u62E9", requiredParts: ["\u661F\u671F\u6807\u9898", "\u5B8C\u6574\u65E5\u671F\u7F51\u683C", "\u660E\u786E\u7684\u9009\u4E2D\u65E5\u671F"] },
  { kind: "outfit-card", role: "recommendation-card", purpose: "\u8868\u8FBE\u4E00\u5957\u53EF\u7406\u89E3\u7684\u7A7F\u642D\u65B9\u6848", requiredParts: ["\u642D\u914D\u540D\u79F0", "\u81F3\u5C11 3 \u4EF6\u5177\u4F53\u5355\u54C1", "\u63A8\u8350\u7406\u7531\u548C\u9002\u7528\u6761\u4EF6"] },
  { kind: "bottom-navigation", role: "bottom-navigation", purpose: "\u7A33\u5B9A\u8868\u8FBE\u4E00\u7EA7\u9875\u9762\u5207\u6362", requiredParts: ["\u5BFC\u822A shell", "\u72EC\u7ACB\u4E14\u5B8C\u6574\u7684\u680F\u76EE\u6807\u7B7E", "\u660E\u786E\u7684\u5F53\u524D\u9879"] },
  { kind: "primary-action", role: "primary-action", purpose: "\u63A8\u8FDB\u5F53\u524D\u9875\u9762\u7684\u552F\u4E00\u6838\u5FC3\u4EFB\u52A1", requiredParts: ["\u660E\u786E\u52A8\u8BCD\u6587\u6848", "\u81F3\u5C11 44\xD744px \u70B9\u51FB\u533A\u57DF", "\u4E0E\u6B21\u8981\u64CD\u4F5C\u6709\u5C42\u7EA7\u5DEE"] }
];
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
function pageIntent(pageId, pageName, requiredContent) {
  const intents = {
    "radar-home": { coreTask: "\u7ACB\u5373\u770B\u89C1\u9644\u8FD1\u53EF\u53D1\u73B0\u7684\u4EBA\uFF0C\u5E76\u51B3\u5B9A\u7EE7\u7EED\u626B\u63CF\u6216\u53D1\u8D77\u78B0\u4E00\u78B0", primaryAction: "\u5F00\u59CB\u626B\u63CF / \u91CD\u65B0\u626B\u63CF" },
    "nearby-profile": { coreTask: "\u5FEB\u901F\u5224\u65AD\u662F\u5426\u613F\u610F\u8FDB\u4E00\u6B65\u8BA4\u8BC6\u5F53\u524D\u7528\u6237", primaryAction: "\u53D1\u8D77\u89C1\u9762 / \u78B0\u4E00\u78B0" },
    "bump-confirm": { coreTask: "\u786E\u8BA4\u7EBF\u4E0B\u78B0\u4E00\u78B0\u5BF9\u8C61\u5E76\u5EFA\u7ACB\u597D\u53CB\u5173\u7CFB", primaryAction: "\u786E\u8BA4\u5E76\u5F00\u59CB\u804A\u5929" },
    "friends-chat": { coreTask: "\u627E\u5230\u6700\u8FD1\u8054\u7CFB\u4EBA\u5E76\u7EE7\u7EED\u4E00\u6BB5\u771F\u5B9E\u5BF9\u8BDD", primaryAction: "\u53D1\u9001\u6D88\u606F" },
    "profile-history": { coreTask: "\u67E5\u770B\u81EA\u5DF1\u7684\u793E\u4EA4\u8EAB\u4EFD\u3001\u5173\u7CFB\u6570\u636E\u548C\u6700\u8FD1\u8DB3\u8FF9", primaryAction: "\u7F16\u8F91\u4E2A\u4EBA\u8D44\u6599" },
    query: { coreTask: "\u9009\u62E9\u65E5\u671F\u548C\u57CE\u5E02\u5E76\u83B7\u5F97\u53EF\u7406\u89E3\u7684\u65E5\u5386\u7ED3\u679C", primaryAction: "\u67E5\u8BE2\u5F53\u5929\u4FE1\u606F" },
    weather: { coreTask: "\u770B\u61C2\u76EE\u6807\u65E5\u671F\u7684\u5929\u6C14\u6761\u4EF6\u4E0E\u51FA\u884C\u5F71\u54CD", primaryAction: "\u67E5\u770B\u7A7F\u642D\u5EFA\u8BAE" },
    recommendation: { coreTask: "\u5728\u51E0\u79D2\u5185\u7406\u89E3\u5F53\u5929\u63A8\u8350\u7A7F\u642D\u5E76\u9009\u5B9A\u4E00\u5957", primaryAction: "\u91C7\u7528\u8FD9\u5957\u642D\u914D" },
    "outfit-detail": { coreTask: "\u770B\u61C2\u4E00\u5957\u642D\u914D\u7684\u5355\u54C1\u7EC4\u6210\u3001\u7406\u7531\u548C\u9002\u7528\u573A\u666F", primaryAction: "\u6536\u85CF\u642D\u914D" },
    wardrobe: { coreTask: "\u6D4F\u89C8\u81EA\u5DF1\u7684\u8863\u7269\u72B6\u6001\u5E76\u9009\u62E9\u53EF\u7528\u5355\u54C1", primaryAction: "\u65B0\u589E\u8863\u7269" },
    home: { coreTask: "\u4ECE\u603B\u89C8\u4E2D\u8BC6\u522B\u5F53\u524D\u6700\u91CD\u8981\u7684\u4FE1\u606F\u548C\u4E0B\u4E00\u6B65", primaryAction: "\u8FDB\u5165\u5F53\u524D\u6700\u91CD\u8981\u7684\u4EFB\u52A1" },
    "core-action": { coreTask: "\u4EE5\u6700\u4F4E\u64CD\u4F5C\u6210\u672C\u5B8C\u6210\u6838\u5FC3\u5F55\u5165\u6216\u7F16\u8F91", primaryAction: "\u4FDD\u5B58\u5E76\u7EE7\u7EED" },
    result: { coreTask: "\u6BD4\u8F83\u5173\u952E\u7ED3\u679C\u5E76\u9009\u62E9\u4E0B\u4E00\u6B65", primaryAction: "\u91C7\u7528\u63A8\u8350\u7ED3\u679C" },
    detail: { coreTask: "\u7406\u89E3\u5F53\u524D\u5BF9\u8C61\u7684\u72B6\u6001\u3001\u5173\u952E\u4FE1\u606F\u548C\u53EF\u6267\u884C\u64CD\u4F5C", primaryAction: "\u5B8C\u6210\u5F53\u524D\u4E3B\u8981\u64CD\u4F5C" },
    profile: { coreTask: "\u67E5\u770B\u4E2A\u4EBA\u72B6\u6001\u5E76\u8FDB\u5165\u6700\u5E38\u7528\u7684\u8D26\u6237\u64CD\u4F5C", primaryAction: "\u7F16\u8F91\u4E2A\u4EBA\u8D44\u6599" }
  };
  return intents[pageId] ?? {
    coreTask: `\u5728\u300C${pageName}\u300D\u9996\u5C4F\u5B8C\u6210\uFF1A${requiredContent[0] ?? "\u7406\u89E3\u5F53\u524D\u5BF9\u8C61\u548C\u72B6\u6001"}`,
    primaryAction: `\u5B8C\u6210${pageName}\u7684\u4E3B\u8981\u64CD\u4F5C`
  };
}
var BOTTOM_NAVIGATION_PAGE_IDS = /* @__PURE__ */ new Set([
  "home",
  "result",
  "profile",
  "radar-home",
  "friends-chat",
  "profile-history",
  "query",
  "weather",
  "recommendation",
  "wardrobe"
]);
function componentKindsFor(pageId, requiredContent) {
  const kinds = ["page-header"];
  const content = requiredContent.join(" ");
  if (pageId === "radar-home") kinds.push("radar-map");
  if (pageId === "friends-chat") kinds.push("conversation-list");
  if (pageId === "query" || pageId === "weather") kinds.push("calendar-grid");
  if (pageId === "recommendation" || pageId === "outfit-detail") kinds.push("outfit-card");
  if (/输入|填写|选择|筛选|搜索|字段|步骤/iu.test(content) || /action|confirm|edit|query/iu.test(pageId)) kinds.push("form-field", "chip-group");
  if (/指标|统计|数量|状态|摘要|天气|完成率/iu.test(content) || /home|result|profile|weather|recommendation/iu.test(pageId)) kinds.push("stat-card");
  if (pageId !== "friends-chat" && /列表|记录|单品|内容|用户|好友|至少 3/iu.test(content)) kinds.push("task-card");
  if (BOTTOM_NAVIGATION_PAGE_IDS.has(pageId)) kinds.push("bottom-navigation");
  kinds.push("primary-action");
  return kinds;
}
function derivePageBlueprints(idea, pageIds) {
  const mockByPage = new Map(derivePageMockData(idea, pageIds).map((item) => [item.pageId, item]));
  return pageIds.map((pageId) => {
    const mock = mockByPage.get(pageId);
    const intent = pageIntent(pageId, mock.page, mock.requiredContent);
    const kinds = new Set(componentKindsFor(pageId, mock.requiredContent));
    return {
      pageId,
      page: mock.page,
      ...intent,
      aboveFold: [
        `\u9875\u9762\u6807\u9898\u4E0E\u5F53\u524D\u4E0A\u4E0B\u6587\uFF1A${mock.page}`,
        ...mock.requiredContent.slice(0, 2),
        `\u552F\u4E00\u4E3B\u8981\u64CD\u4F5C\uFF1A${intent.primaryAction}`
      ],
      semanticComponents: SEMANTIC_COMPONENT_CATALOG.filter((component) => kinds.has(component.kind))
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
      updateContract: "\u5B8C\u6574\u9875\u9762\u4F7F\u7528 rectangle \u5916\u6846\u5E76\u8BBE\u7F6E customData.role=prototype-page\u3001customData.pageName \u548C customData.mockDataMin\uFF1B\u9875\u9762\u540D\u4F7F\u7528\u5916\u6846\u4E0A\u65B9\u72EC\u7ACB text\uFF0C\u8BBE\u7F6E customData.role=prototype-page-label \u548C customData.pageId\uFF1B\u9875\u9762\u5B50\u5143\u7D20\u4F7F\u7528\u753B\u5E03\u7EDD\u5BF9\u5750\u6807\u5E76\u4FDD\u6301 frameId=null\uFF1B\u6BCF\u6761\u793A\u4F8B\u5185\u5BB9\u7684 text \u8BBE\u7F6E customData.role=mock-data"
    },
    pageMockData: derivePageMockData(idea, pages),
    pageBlueprints: derivePageBlueprints(idea, pages),
    semanticComponentCatalog: SEMANTIC_COMPONENT_CATALOG,
    prototypeQualityPolicy: {
      firstScreen: "\u7528\u6237\u5E94\u5728 5 \u79D2\u5185\u770B\u61C2\u9875\u9762\u6838\u5FC3\u4EFB\u52A1\u3001\u5F53\u524D\u72B6\u6001\u3001\u5173\u952E\u5185\u5BB9\u548C\u4E0B\u4E00\u6B65\uFF1B\u4E0D\u80FD\u4F9D\u8D56\u7A7A\u767D\u65B9\u6846\u6216 Agent \u53E3\u5934\u89E3\u91CA",
      hierarchy: "\u6BCF\u9875\u53EA\u6709\u4E00\u4E2A primary-action\uFF1B\u6807\u9898\u3001\u6B63\u6587\u548C\u8F85\u52A9\u4FE1\u606F\u81F3\u5C11\u5F62\u6210\u4E09\u7EA7\u53EF\u8FA8\u5C42\u7EA7\uFF1B\u91CD\u590D\u63A7\u4EF6\u9075\u5FAA\u4E00\u81F4\u7684\u8FB9\u8DDD\u3001\u9AD8\u5EA6\u548C\u95F4\u8DDD\u8282\u594F",
      phasedDrawing: "\u9996\u6279 3 \u4E2A\u53CA\u4EE5\u4E0A\u9875\u9762\u65F6\uFF0C\u5148\u7ED8\u5236\u4E00\u4E2A\u4EE3\u8868\u9875\u5E76\u68C0\u67E5\u771F\u5B9E\u753B\u677F\uFF0C\u518D\u94FA\u5F00\u5176\u4F59\u9875\u9762\uFF0C\u6700\u540E\u9010\u9875\u505A\u4E00\u81F4\u6027\u590D\u6838",
      completionRule: "writeVerified=true \u53EA\u4EE3\u8868\u5199\u5165\u548C\u56DE\u8BFB\u4E00\u81F4\uFF1B\u53EA\u6709\u63D0\u4EA4\u89C6\u89C9\u590D\u6838\u8BC1\u636E\u5E76\u83B7\u5F97 completionReady=true\uFF0CAgent \u624D\u80FD\u5411\u7528\u6237\u5BA3\u5E03\u539F\u578B\u5B8C\u6210"
    },
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

// src/create-discovery.ts
var CREATE_FLOW_VERSION = 2;
var MAX_DISCOVERY_QUESTIONS = 10;
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
var GENERIC_QUESTION_RE = /^(?:这个工具主要服务谁|你的核心目标是什么|首版最重要的是帮助用户完成什么|用户最重要的一条使用流程是什么|第一版需要包含哪些核心模块|首轮原型要画哪些核心页面)[？?]?$/u;
var ARCHITECTURE_LIST_RE = /(?:需要哪些|选择哪些|包含哪些).*(?:模块|页面)|(?:核心模块|核心页面).*请选择/iu;
function platformFact(answers) {
  const platform = answers["target-platform"]?.values[0];
  if (platform === "app") return "\u4EA7\u54C1\u7AEF\uFF1AApp";
  if (platform === "web") return "\u4EA7\u54C1\u7AEF\uFF1AWeb";
  if (platform === "mini-program") return "\u4EA7\u54C1\u7AEF\uFF1A\u5C0F\u7A0B\u5E8F";
  return null;
}
function domainFacts(idea) {
  const facts = [];
  if (/陌生人|社交|交友|附近的人|雷达|碰一碰|好友|聊天/iu.test(idea)) facts.push("\u4EA7\u54C1\u65B9\u5411\uFF1A\u9644\u8FD1\u53D1\u73B0\u4E0E\u964C\u751F\u4EBA\u793E\u4EA4");
  if (/万年历|穿搭|天气|衣橱|服饰/iu.test(idea)) facts.push("\u4EA7\u54C1\u65B9\u5411\uFF1A\u65E5\u671F\u3001\u5929\u6C14\u4E0E\u7A7F\u642D\u5EFA\u8BAE");
  if (/待办|任务|清单|todo/iu.test(idea)) facts.push("\u4EA7\u54C1\u65B9\u5411\uFF1A\u4EFB\u52A1\u4E0E\u5F85\u529E\u7BA1\u7406");
  return facts;
}
function recommendedDimensions(idea) {
  if (/陌生人|社交|交友|附近的人|雷达|碰一碰|好友|聊天/iu.test(idea)) return ["unique-mechanism", "critical-risk", "core-loop"];
  if (/万年历|穿搭|天气|衣橱|服饰/iu.test(idea)) return ["unique-mechanism", "trigger-context", "critical-risk"];
  if (/待办|任务|清单|todo/iu.test(idea)) return ["trigger-context", "existing-alternative", "core-outcome"];
  return ["trigger-context", "core-outcome", "existing-alternative"];
}
function initialDiscovery(idea, answers) {
  const fact = platformFact(answers);
  const explicitFacts = [`\u7528\u6237\u539F\u8BDD\uFF1A${idea.trim()}`, ...fact === null ? [] : [fact], ...domainFacts(idea)];
  const openDimensions = DISCOVERY_DIMENSION_IDS.filter((dimension) => dimension !== "target-platform" || fact === null);
  return {
    explicitFacts,
    assumptions: [],
    resolvedDecisions: [],
    openDimensions,
    recommendedDimensions: recommendedDimensions(idea).filter((dimension) => openDimensions.includes(dimension)),
    questions: [],
    invalidatedQuestionIds: [],
    adjustmentQuestionIds: [],
    questionCount: 0,
    maxQuestions: MAX_DISCOVERY_QUESTIONS,
    remainingQuestions: MAX_DISCOVERY_QUESTIONS,
    nextAction: "propose_question",
    stopReason: null
  };
}
function refreshDiscovery(state) {
  const adjustmentQuestionIds = new Set(state.adjustmentQuestionIds ?? []);
  const questionCount = state.questions.filter((question) => !adjustmentQuestionIds.has(question.id)).length;
  const remainingQuestions = Math.max(0, state.maxQuestions - questionCount);
  return {
    ...state,
    questionCount,
    remainingQuestions,
    nextAction: remainingQuestions === 0 ? "synthesize" : "propose_question"
  };
}
function removeDependentQuestions(state, questionId) {
  const removed = /* @__PURE__ */ new Set();
  const alreadyInvalidated = new Set(state.invalidatedQuestionIds ?? []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const question of state.questions) {
      if (question.id === questionId || removed.has(question.id) || alreadyInvalidated.has(question.id)) continue;
      if ((question.dependsOn ?? []).some((dependency) => dependency === questionId || removed.has(dependency))) {
        removed.add(question.id);
        changed = true;
      }
    }
  }
  const prefixes = [...removed].map((id) => `${id}\uFF1A`);
  const removedDimensions = state.questions.filter((question) => removed.has(question.id)).map((question) => question.dimension);
  return {
    discovery: refreshDiscovery({
      ...state,
      invalidatedQuestionIds: [.../* @__PURE__ */ new Set([...alreadyInvalidated, ...removed])],
      openDimensions: [.../* @__PURE__ */ new Set([...state.openDimensions, ...removedDimensions])],
      resolvedDecisions: state.resolvedDecisions.filter((item) => !prefixes.some((prefix) => item.startsWith(prefix))),
      assumptions: state.assumptions.filter((item) => !prefixes.some((prefix) => item.startsWith(prefix)))
    }),
    removedIds: [...removed]
  };
}
function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}
function objectValue(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function normalizedQuestionText(value) {
  return value.toLowerCase().replace(/[\s，。！？、,.!?：:；;（）()]/gu, "");
}
var GROUNDING_STOP_WORDS = /* @__PURE__ */ new Set([
  "\u4E00\u4E2A",
  "\u4E00\u6B3E",
  "\u8FD9\u4E2A",
  "\u7528\u6237",
  "\u4EA7\u54C1",
  "\u5DE5\u5177",
  "\u5E94\u7528",
  "\u9996\u7248",
  "\u6838\u5FC3",
  "\u9875\u9762",
  "\u529F\u80FD",
  "\u65B9\u5411",
  "\u95EE\u9898",
  "\u9700\u8981",
  "\u5E94\u8BE5",
  "\u4EC0\u4E48",
  "app",
  "web"
]);
function groundingTokens(values) {
  const tokens = /* @__PURE__ */ new Set();
  for (const value of values) {
    const segments = value.toLowerCase().replace(/(?:用户原话|产品方向|产品端)：/gu, " ").split(/[^\p{Script=Han}a-z0-9]+|(?:我想|我要|希望|做|一个|一款|类似|用于|帮助|里面|里的|这个|那个)/giu).filter((segment) => segment.length >= 2);
    for (const segment of segments) {
      if (/^[a-z0-9-]+$/u.test(segment)) {
        if (!GROUNDING_STOP_WORDS.has(segment)) tokens.add(segment);
        continue;
      }
      const maxSize = Math.min(6, segment.length);
      for (let size = 2; size <= maxSize; size += 1) {
        for (let index = 0; index <= segment.length - size; index += 1) {
          const token = segment.slice(index, index + size);
          if (!GROUNDING_STOP_WORDS.has(token)) tokens.add(token);
        }
      }
    }
  }
  return tokens;
}
function validateAdaptiveQuestion(value, discovery, validationOptions = {}) {
  if (discovery.questionCount >= discovery.maxQuestions && validationOptions.allowAdjustment !== true) {
    return { ok: false, code: "question_limit_reached", message: `\u5DF2\u7ECF\u8FBE\u5230 ${discovery.maxQuestions} \u4E2A\u95EE\u9898\uFF0C\u5FC5\u987B\u8C03\u7528 action=synthesize \u6574\u7406\u9879\u76EE\u7B80\u62A5` };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, code: "question_quality_invalid", message: "question \u5FC5\u987B\u662F\u7ED3\u6784\u5316\u5BF9\u8C61" };
  }
  const input = value;
  if (!nonEmptyString(input.id) || !/^q[0-9a-z_-]+$/iu.test(input.id)) {
    return { ok: false, code: "question_quality_invalid", message: "question.id \u5FC5\u987B\u662F\u4EE5 q \u5F00\u5934\u7684\u7A33\u5B9A\u6807\u8BC6\u7B26" };
  }
  if (!nonEmptyString(input.dimension) || !DISCOVERY_DIMENSIONS.has(input.dimension)) {
    return { ok: false, code: "question_quality_invalid", message: `question.dimension \u4E0D\u662F\u5141\u8BB8\u7684\u4EA7\u54C1\u51B3\u7B56\u7EF4\u5EA6\uFF1B\u5FC5\u987B\u4F7F\u7528\u4EE5\u4E0B\u7A33\u5B9A ID \u4E4B\u4E00\uFF1A${DISCOVERY_DIMENSION_IDS.join(", ")}` };
  }
  if (!nonEmptyString(input.insight) || input.insight.trim().length < 18) {
    return { ok: false, code: "question_quality_invalid", message: "\u6BCF\u9053\u9898\u5FC5\u987B\u5148\u63D0\u4F9B\u57FA\u4E8E\u5F53\u524D\u4EA7\u54C1\u7684\u5177\u4F53\u5224\u65AD\uFF0C\u4E0D\u80FD\u53EA\u8865\u9F50\u5B57\u6BB5" };
  }
  if (!nonEmptyString(input.text)) {
    return { ok: false, code: "question_quality_invalid", message: "question.text \u5FC5\u987B\u5305\u542B\u201C\u5224\u65AD\uFF1A...\n\n\u95EE\u9898\uFF1A...\u201D\u5E76\u53EF\u76F4\u63A5\u7528\u4E8E\u539F\u751F\u95EE\u9898\u5361\u7247" };
  }
  const presentationText = input.text.trim().replace(/\\n/gu, "\n");
  const presentationMatch = /^判断：([\s\S]+?)\s*问题：([\s\S]+)$/u.exec(presentationText);
  if (presentationMatch === null || !normalizedQuestionText(presentationMatch[1]).includes(normalizedQuestionText(input.insight.trim()))) {
    return { ok: false, code: "question_presentation_invalid", message: "question.text \u5FC5\u987B\u5B8C\u6574\u5305\u542B\u5F53\u524D insight\uFF0C\u683C\u5F0F\u4E3A\u201C\u5224\u65AD\uFF1A{insight}\n\n\u95EE\u9898\uFF1A{decision question}\u201D\uFF0C\u7981\u6B62\u5728\u5C55\u793A\u5361\u7247\u65F6\u4E22\u6389\u4EA7\u54C1\u5224\u65AD" };
  }
  const questionText = presentationMatch[2].trim();
  if (questionText.length < 6) {
    return { ok: false, code: "question_quality_invalid", message: "question.text \u4E2D\u7684\u51B3\u7B56\u95EE\u9898\u5FC5\u987B\u660E\u786E\u4E14\u53EF\u56DE\u7B54" };
  }
  const insightTokens = groundingTokens([input.insight.trim()]);
  const selfContainedQuestionTokens = groundingTokens([questionText]);
  if (![...insightTokens].some((token) => token.length >= 4 && selfContainedQuestionTokens.has(token))) {
    return { ok: false, code: "question_presentation_invalid", message: "\u201C\u95EE\u9898\uFF1A\u201D\u540E\u7684\u6587\u5B57\u4E5F\u5FC5\u987B\u81EA\u5305\u542B\u5730\u91CD\u8FF0\u5F53\u524D\u4EA7\u54C1\u5224\u65AD\u518D\u63D0\u51FA\u51B3\u7B56\uFF08\u5141\u8BB8\u540C\u4E49\u6539\u5199\uFF09\uFF0C\u907F\u514D Agent \u53EA\u622A\u53D6\u95EE\u9898\u90E8\u5206\u65F6\u4E22\u6389 insight" };
  }
  if (GENERIC_QUESTION_RE.test(questionText) || ARCHITECTURE_LIST_RE.test(questionText)) {
    return { ok: false, code: "question_quality_invalid", message: "\u4E0D\u80FD\u4F7F\u7528\u56FA\u5B9A\u7684\u7528\u6237\u3001\u76EE\u6807\u3001\u6A21\u5757\u6216\u9875\u9762\u95EE\u5377\uFF1B\u8BF7\u7ED3\u5408\u5F53\u524D\u4EA7\u54C1\u573A\u666F\u63D0\u51FA\u6709\u53D6\u820D\u7684\u95EE\u9898" };
  }
  if (!nonEmptyString(input.decisionImpact) || input.decisionImpact.trim().length < 10) {
    return { ok: false, code: "question_quality_invalid", message: "question.decisionImpact \u5FC5\u987B\u8BF4\u660E\u7B54\u6848\u4F1A\u6539\u53D8\u54EA\u9879\u4EA7\u54C1\u51B3\u7B56" };
  }
  const questionId = input.id.trim();
  const dimension = input.dimension.trim();
  const insight = input.insight.trim();
  const decisionImpact = input.decisionImpact.trim();
  const dependsOn = Array.isArray(input.dependsOn) && input.dependsOn.every(nonEmptyString) ? [...new Set(input.dependsOn.map((item) => item.trim()))] : [];
  const invalidatedQuestionIds = new Set(discovery.invalidatedQuestionIds ?? []);
  const knownQuestionIds = new Set(discovery.questions.filter((question) => !invalidatedQuestionIds.has(question.id)).map((question) => question.id));
  const unknownDependency = dependsOn.find((id) => !knownQuestionIds.has(id));
  if (unknownDependency !== void 0) {
    return { ok: false, code: "question_quality_invalid", message: `dependsOn \u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u95EE\u9898 ${unknownDependency}` };
  }
  if (discovery.questions.some((question) => question.id === questionId)) {
    return { ok: false, code: "question_duplicate", message: `\u95EE\u9898 ${questionId} \u5DF2\u7ECF\u95EE\u8FC7` };
  }
  const fingerprint = normalizedQuestionText(questionText);
  if (discovery.questions.some((question) => normalizedQuestionText(question.text) === fingerprint)) {
    return { ok: false, code: "question_duplicate", message: "\u8FD9\u4E2A\u95EE\u9898\u4E0E\u5386\u53F2\u95EE\u9898\u91CD\u590D\uFF0C\u8BF7\u5BFB\u627E\u5C1A\u672A\u89E3\u51B3\u7684\u4EA7\u54C1\u51B3\u7B56" };
  }
  const sameDimension = discovery.questions.find((question) => question.dimension === dimension && !invalidatedQuestionIds.has(question.id));
  if (sameDimension !== void 0 && !dependsOn.includes(sameDimension.id)) {
    return { ok: false, code: "question_duplicate", message: `\u7EF4\u5EA6 ${input.dimension} \u5DF2\u7ECF\u8BE2\u95EE\u8FC7\uFF1B\u5982\u9700\u6DF1\u6316\uFF0C\u5FC5\u987B\u901A\u8FC7 dependsOn \u8BF4\u660E\u4F9D\u8D56` };
  }
  if (!Array.isArray(input.options)) {
    return { ok: false, code: "question_quality_invalid", message: "question.options \u5FC5\u987B\u63D0\u4F9B 2\u20134 \u4E2A\u5177\u6709\u771F\u5B9E\u53D6\u820D\u7684\u65B9\u5411\u548C\u4E09\u4E2A\u56FA\u5B9A\u63A7\u5236\u9009\u9879" };
  }
  const requiredControls = [
    ["synthesize-now", "\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5"],
    ["unknown", "\u8FD8\u6CA1\u60F3\u597D"],
    ["other", "\u5176\u4ED6"]
  ];
  for (const [id, label] of requiredControls) {
    const option = input.options.find((item) => objectValue(item)?.id === id);
    const object = objectValue(option);
    if (object?.label !== label || !nonEmptyString(object.description)) {
      return { ok: false, code: "question_presentation_invalid", message: `question.options \u5FC5\u987B\u663E\u5F0F\u5305\u542B ${id} / ${label} \u53CA\u8BF4\u660E\uFF0C\u4FDD\u8BC1\u539F\u751F\u95EE\u9898\u5361\u7247\u4E0D\u4F1A\u5220\u6389\u7528\u6237\u63A7\u5236\u9879` };
    }
  }
  const meaningful = input.options.filter((option) => {
    if (typeof option !== "object" || option === null || Array.isArray(option)) return false;
    const candidate = option;
    return candidate.id !== "unknown" && candidate.id !== "other" && candidate.id !== "synthesize-now";
  });
  if (meaningful.length < 2 || meaningful.length > 4) {
    return { ok: false, code: "question_quality_invalid", message: "\u6BCF\u9053\u9898\u5FC5\u987B\u63D0\u4F9B 2\u20134 \u4E2A\u4EA7\u54C1\u4E13\u5C5E\u65B9\u5411\uFF0C\u518D\u7531\u5DE5\u5177\u8865\u5145\u201C\u8FD8\u6CA1\u60F3\u597D\u201D\u548C\u201C\u5176\u4ED6\u201D" };
  }
  const options = [];
  const optionIds = /* @__PURE__ */ new Set();
  for (const item of meaningful) {
    const option = item;
    if (!nonEmptyString(option.id) || !nonEmptyString(option.label) || !nonEmptyString(option.description) || option.description.trim().length < 8) {
      return { ok: false, code: "question_quality_invalid", message: "\u6BCF\u4E2A\u9009\u9879\u90FD\u5FC5\u987B\u5305\u542B id\u3001label\uFF0C\u4EE5\u53CA\u8BF4\u660E\u4EF7\u503C\u3001\u6210\u672C\u6216\u9002\u7528\u6761\u4EF6\u7684 description" };
    }
    if (optionIds.has(option.id.trim())) return { ok: false, code: "question_quality_invalid", message: `\u9009\u9879 ${option.id.trim()} \u91CD\u590D` };
    optionIds.add(option.id.trim());
    options.push({ id: option.id.trim(), label: option.label.trim(), description: option.description.trim() });
  }
  if (!nonEmptyString(input.recommendedOptionId) || !optionIds.has(input.recommendedOptionId.trim())) {
    return { ok: false, code: "question_quality_invalid", message: "recommendedOptionId \u5FC5\u987B\u6307\u5411\u4E00\u4E2A\u771F\u5B9E\u5019\u9009\u65B9\u5411" };
  }
  const factTokens = groundingTokens([
    ...discovery.explicitFacts,
    ...discovery.resolvedDecisions,
    ...discovery.assumptions
  ]);
  const questionTokens = groundingTokens([
    insight,
    questionText,
    decisionImpact,
    ...options.flatMap((option) => [option.label, option.description ?? ""])
  ]);
  if (![...factTokens].some((token) => questionTokens.has(token))) {
    return {
      ok: false,
      code: "question_not_grounded",
      message: "\u95EE\u9898\u6CA1\u6709\u5F15\u7528\u5F53\u524D\u4EA7\u54C1\u4E8B\u5B9E\u3001\u5DF2\u6709\u7B54\u6848\u6216\u660E\u786E\u98CE\u9669\uFF1B\u8BF7\u5148\u57FA\u4E8E discovery \u4E2D\u7684\u4E8B\u5B9E\u91CD\u65B0\u63D0\u51FA\u4EA7\u54C1\u4E13\u5C5E\u95EE\u9898"
    };
  }
  if (discovery.questionCount === 0 && validationOptions.allowAdjustment !== true) {
    const highestValue = discovery.recommendedDimensions.slice(0, 2);
    if (highestValue.length > 0 && !highestValue.includes(dimension)) {
      return {
        ok: false,
        code: "question_priority_invalid",
        message: `\u7B2C\u4E00\u9898\u5E94\u5148\u6DF1\u6316\u5F53\u524D\u4EA7\u54C1\u6700\u5173\u952E\u7684 ${highestValue.join(" \u6216 ")}\uFF0C\u4E0D\u8981\u5148\u8BA9\u7528\u6237\u9009\u62E9\u6A21\u5757\u3001\u9875\u9762\u6216\u901A\u7528\u4FE1\u606F\u67B6\u6784`
      };
    }
  }
  options.push(
    { id: "synthesize-now", label: "\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5", description: "\u505C\u6B62\u7EE7\u7EED\u63D0\u95EE\uFF0C\u57FA\u4E8E\u5F53\u524D\u4E8B\u5B9E\u4E0E\u5F85\u9A8C\u8BC1\u5047\u8BBE\u751F\u6210\u5B8C\u6574\u7B80\u62A5\u3002" },
    { id: "unknown", label: "\u8FD8\u6CA1\u60F3\u597D", description: "\u5148\u8BB0\u5F55\u4E3A\u5F85\u9A8C\u8BC1\u5047\u8BBE\uFF0C\u4E0D\u628A\u6C89\u9ED8\u7406\u89E3\u4E3A\u6682\u505C\u6216\u53D6\u6D88\u3002" },
    { id: "other", label: "\u5176\u4ED6", description: "\u4FDD\u7559\u7528\u6237\u81EA\u5DF1\u7684\u4EA7\u54C1\u65B9\u5411\u548C\u8865\u5145\u8BF4\u660E\u3002" }
  );
  return {
    ok: true,
    question: {
      id: questionId,
      kind: "choice",
      dimension,
      insight,
      text: questionText,
      decisionImpact,
      recommendedOptionId: input.recommendedOptionId.trim(),
      dependsOn,
      selectionMode: "single",
      options,
      allowOther: true
    }
  };
}

// src/prototype-brief.ts
function objectValue2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function textValue(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
function stringList(value) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim() !== "")) return null;
  return value.map((item) => item.trim());
}
function viewportValue(value) {
  const object = objectValue2(value);
  if (object === null || typeof object.width !== "number" || typeof object.height !== "number") return null;
  if (!Number.isFinite(object.width) || !Number.isFinite(object.height) || object.width < 240 || object.height < 240) return null;
  return { width: object.width, height: object.height };
}
function hasGenericMock(value) {
  return /^(?:用户\s*[A-ZＡ-Ｚ]|标题|内容|示例任务|Lorem ipsum|待填|占位)$/iu.test(value.trim());
}
function hasGenericStructure(value) {
  return /^(?:顶部区域|底部区域|内容区域|内容卡片|信息模块|列表内容|若干按钮|若干卡片|按钮|卡片|列表)$/u.test(value.trim());
}
var VISUAL_OR_TECH_IMPLEMENTATION_RE = /(?:React|Vue|Svelte|Angular|Next\.?js|Tailwind|TypeScript|技术栈|前端框架|数据库实现|API\s*接口|品牌色|品牌字体|字体(?:风格|家族)|圆角(?:体系|半径|\s*\d+\s*px)|3D|拟物|扁平风)/iu;
var POSITIVE_SCOPE_RE = /(?:包含|支持|提供|接入|启用|加入|允许)/u;
function normalizedScopeConcept(value) {
  return value.replace(/(?:首版|第一版|本轮|原型|功能|能力|页面|明确|不加入|不包含|无需|暂不|推迟|延迟)/gu, "").replace(/[\s，。！？、,.!?：:；;（）()／/\-]/gu, "");
}
function parsePage(value, index, issues) {
  const object = objectValue2(value);
  if (object === null) {
    issues.push(`pages[${index}] \u5FC5\u987B\u662F\u5BF9\u8C61`);
    return null;
  }
  const id = textValue(object.id);
  const name2 = textValue(object.name);
  const goal = textValue(object.goal);
  const size = viewportValue(object.size);
  const structure = stringList(object.structure);
  const primaryAction = textValue(object.primaryAction);
  const secondaryActions = stringList(object.secondaryActions);
  const states = stringList(object.states);
  const navigation = stringList(object.navigation);
  const annotations = stringList(object.annotations);
  const acceptanceCriteria = stringList(object.acceptanceCriteria);
  if (id === null) issues.push(`pages[${index}].id \u4E0D\u80FD\u4E3A\u7A7A`);
  if (name2 === null) issues.push(`pages[${index}].name \u4E0D\u80FD\u4E3A\u7A7A`);
  if (goal === null || goal.length < 8) issues.push(`pages[${index}].goal \u5FC5\u987B\u8BF4\u660E\u7528\u6237\u6765\u5230\u9875\u9762\u540E\u7684\u6838\u5FC3\u4EFB\u52A1`);
  if (size === null) issues.push(`pages[${index}].size \u5FC5\u987B\u63D0\u4F9B\u6709\u6548\u9875\u9762\u5C3A\u5BF8`);
  if (structure === null || structure.length < 3) issues.push(`pages[${index}].structure \u81F3\u5C11\u5305\u542B 3 \u6761\u53EF\u76F4\u63A5\u7ED8\u5236\u7684\u5177\u4F53\u5185\u5BB9`);
  else {
    const generic = structure.find(hasGenericStructure);
    if (generic !== void 0) issues.push(`pages[${index}].structure \u5305\u542B\u6CDB\u5316\u5360\u4F4D\u201C${generic}\u201D\uFF0C\u5FC5\u987B\u6539\u6210\u53EF\u76F4\u63A5\u7ED8\u5236\u7684\u6807\u9898\u3001\u63A7\u4EF6\u6587\u6848\u6216\u5185\u5BB9\u7ED3\u6784`);
  }
  if (primaryAction === null) issues.push(`pages[${index}].primaryAction \u4E0D\u80FD\u4E3A\u7A7A`);
  if (secondaryActions === null) issues.push(`pages[${index}].secondaryActions \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  if (states === null) issues.push(`pages[${index}].states \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  if (navigation === null) issues.push(`pages[${index}].navigation \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  if (annotations === null) issues.push(`pages[${index}].annotations \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  if (acceptanceCriteria === null || acceptanceCriteria.length === 0) issues.push(`pages[${index}].acceptanceCriteria \u81F3\u5C11\u5305\u542B\u4E00\u9879\u9875\u9762\u4E13\u9879\u9A8C\u6536`);
  const rawGroups = Array.isArray(object.mockDataGroups) ? object.mockDataGroups : [];
  if (!Array.isArray(object.mockDataGroups)) {
    issues.push(`pages[${index}].mockDataGroups \u5FC5\u987B\u662F [{ name, items: string[] }]\uFF0C\u4E0D\u8981\u4F7F\u7528 mockData\u3001mockDataItems \u6216\u5BF9\u8C61\u8BB0\u5F55\u522B\u540D`);
  }
  const mockDataGroups = [];
  for (const [groupIndex, rawGroup] of rawGroups.entries()) {
    const group = objectValue2(rawGroup);
    const groupName = textValue(group?.name);
    const items = stringList(group?.items);
    if (groupName === null || items === null || items.length === 0) {
      issues.push(`pages[${index}].mockDataGroups[${groupIndex}] \u5FC5\u987B\u5305\u542B\u540D\u79F0\u548C\u771F\u5B9E\u6570\u636E`);
      continue;
    }
    if (items.some(hasGenericMock)) issues.push(`pages[${index}].mockDataGroups[${groupIndex}] \u5305\u542B\u65E0\u610F\u4E49\u5360\u4F4D\u5185\u5BB9`);
    mockDataGroups.push({ name: groupName, items });
  }
  const mockCount = mockDataGroups.reduce((sum, group) => sum + group.items.length, 0);
  if (mockCount < 3) issues.push(`pages[${index}] \u81F3\u5C11\u9700\u8981 3 \u6761\u9996\u6B21\u6E32\u67D3\u53EF\u89C1\u7684\u771F\u5B9E mock \u6570\u636E\u6216\u8868\u5355\u5B57\u6BB5`);
  if ([id, name2, goal, size, structure, primaryAction, secondaryActions, states, navigation, annotations, acceptanceCriteria].some((item) => item === null)) return null;
  return {
    id,
    name: name2,
    goal,
    size,
    structure,
    primaryAction,
    secondaryActions,
    mockDataGroups,
    states,
    navigation,
    annotations,
    acceptanceCriteria
  };
}
function parseRelation(value, index, issues) {
  const object = objectValue2(value);
  if (object === null) {
    issues.push(`pageRelations[${index}] \u5FC5\u987B\u662F\u5BF9\u8C61`);
    return null;
  }
  const fromPageId = textValue(object.fromPageId);
  const toPageId = textValue(object.toPageId);
  const trigger = textValue(object.trigger);
  const result = textValue(object.result);
  const label = textValue(object.label);
  const arrowStyle = object.arrowStyle === "solid" || object.arrowStyle === "dashed" ? object.arrowStyle : null;
  if (fromPageId === null || toPageId === null || trigger === null || result === null || label === null || arrowStyle === null) {
    issues.push(`pageRelations[${index}] \u5FC5\u987B\u5B8C\u6574\u8BF4\u660E\u6765\u6E90\u3001\u76EE\u6807\u3001\u89E6\u53D1\u52A8\u4F5C\u3001\u7ED3\u679C\u3001\u7BAD\u5934\u6837\u5F0F\u548C\u6807\u7B7E`);
    return null;
  }
  return { fromPageId, toPageId, trigger, result, label, arrowStyle };
}
function semanticComponents(page) {
  const components = [
    { kind: "page-header", role: "page-heading", purpose: "\u8BF4\u660E\u9875\u9762\u8EAB\u4EFD\u4E0E\u5F53\u524D\u4E0A\u4E0B\u6587", requiredParts: ["\u53EF\u8BFB\u9875\u9762\u6807\u9898", "\u5FC5\u8981\u7684\u65E5\u671F\u6216\u72B6\u6001\u4E0A\u4E0B\u6587"] },
    { kind: "primary-action", role: "primary-action", purpose: "\u7A81\u51FA\u9875\u9762\u552F\u4E00\u4E3B\u8981\u64CD\u4F5C", requiredParts: [page.primaryAction, "\u5C45\u4E2D\u7684\u53EF\u8BFB\u6309\u94AE\u6587\u5B57"] }
  ];
  if (page.mockDataGroups.length > 0) components.push({ kind: "content-card", role: "content-card", purpose: "\u627F\u8F7D\u771F\u5B9E\u4E1A\u52A1\u5185\u5BB9", requiredParts: ["\u5BF9\u8C61\u6807\u9898", "\u72B6\u6001\u3001\u65F6\u95F4\u6216\u5173\u952E\u4E0A\u4E0B\u6587", "\u9996\u6B21\u6E32\u67D3\u53EF\u89C1\u7684 mock \u6570\u636E"] });
  if (page.navigation.length > 0) components.push({ kind: "bottom-navigation", role: "bottom-navigation", purpose: "\u8868\u8FBE\u5168\u5C40\u9875\u9762\u5207\u6362", requiredParts: ["\u5B8C\u6574\u680F\u76EE\u6587\u5B57", "\u6E05\u695A\u7684\u5F53\u524D\u9009\u4E2D\u9879", "\u5E95\u90E8\u5B89\u5168\u533A\u5185\u5BF9\u9F50"] });
  return components;
}
function chineseNumber(index) {
  return ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u4E03", "\u516B", "\u4E5D", "\u5341"][index] ?? String(index + 1);
}
function bullets(items) {
  return items.map((item) => `- ${item}`).join("\n");
}
function renderPrototypeBriefMarkdown(brief) {
  const layout = brief.prototypeLayout;
  const pages = brief.pages.map((page, index) => {
    const mock = page.mockDataGroups.map((group) => `- ${group.name}
${group.items.map((item) => `  - \`${item}\``).join("\n")}`).join("\n");
    const interactions = [
      `\u4E3B\u64CD\u4F5C\uFF1A${page.primaryAction}`,
      ...page.secondaryActions.map((item) => `\u6B21\u8981\u64CD\u4F5C\uFF1A${item}`),
      ...page.states,
      ...page.navigation.map((item) => `\u5BFC\u822A\uFF1A${item}`),
      ...page.annotations.map((item) => `\u4EA4\u4E92\u6807\u6CE8\uFF1A${item}`)
    ];
    return [
      `### \u9875\u9762${chineseNumber(index)}\uFF1A${page.name}`,
      "",
      `\u9875\u9762\u76EE\u6807\uFF1A${page.goal}`,
      "",
      "\u9875\u9762\u7ED3\u6784\uFF1A",
      "",
      bullets(page.structure),
      "",
      "\u771F\u5B9E mock \u6570\u636E\uFF1A",
      "",
      mock,
      "",
      "\u5173\u952E\u72B6\u6001\u4E0E\u4EA4\u4E92\uFF1A",
      "",
      bullets(interactions),
      "",
      "\u9875\u9762\u4E13\u9879\u9A8C\u6536\uFF1A",
      "",
      bullets(page.acceptanceCriteria)
    ].join("\n");
  }).join("\n\n");
  const relations = brief.pageRelations.map((relation) => {
    const from = brief.pages.find((page) => page.id === relation.fromPageId)?.name ?? relation.fromPageId;
    const to = brief.pages.find((page) => page.id === relation.toPageId)?.name ?? relation.toPageId;
    const style = relation.arrowStyle === "dashed" ? "\u865A\u7EBF\u7BAD\u5934" : "\u5B9E\u7EBF\u7BAD\u5934";
    return `${from} \u2192 ${to}\uFF1A${relation.trigger}\uFF1B${relation.result}\uFF08${style}\uFF1A${relation.label}\uFF09`;
  });
  return [
    `# ${brief.title.replace(/原型$/u, "")}\u539F\u578B`,
    "",
    "## \u4EA7\u54C1\u5B9A\u4E49",
    "",
    brief.productDefinition,
    "",
    `\u6838\u5FC3\u7528\u6237\uFF1A${brief.target}`,
    "",
    `\u6838\u5FC3\u4F7F\u7528\u573A\u666F\uFF1A${brief.coreScenario}`,
    "",
    `\u6838\u5FC3\u7ED3\u679C\uFF1A${brief.coreOutcome}`,
    "",
    "\u6838\u5FC3\u4EAE\u70B9\u4E0E\u72EC\u7279\u673A\u5236\uFF1A",
    "",
    bullets(brief.uniqueMechanism),
    "",
    "\u9996\u7248\u6838\u5FC3\u6D41\u7A0B\uFF1A",
    "",
    bullets(brief.firstVersionFlow),
    "",
    "\u9996\u7248\u5305\u542B\uFF1A",
    "",
    bullets(brief.includedScope),
    "",
    "\u9996\u7248\u660E\u786E\u4E0D\u5305\u542B\uFF1A",
    "",
    bullets(brief.excludedScope),
    "",
    "## \u539F\u578B\u7ED3\u6784",
    "",
    `\u5728\u5F53\u524D\u753B\u677F\u4E2D\u6309\u7167${layout.arrangement}\u7ED8\u5236 ${brief.pages.length} \u4E2A \`${layout.viewport.width} \xD7 ${layout.viewport.height}\` \u7684${layout.platform}\u9875\u9762\u3002${layout.connectionStyle}${layout.comprehensionGoal}`,
    "",
    pages,
    "",
    "## \u9875\u9762\u5173\u7CFB\u4E0E\u4EA4\u4E92\u8868\u8FBE",
    "",
    bullets(relations),
    "",
    "## \u539F\u578B\u8868\u8FBE\u539F\u5219",
    "",
    bullets(brief.prototypePrinciples),
    "",
    "## \u9A8C\u6536\u65B9\u5F0F",
    "",
    bullets(brief.acceptanceCriteria),
    "",
    "## \u9ED8\u8BA4\u5047\u8BBE",
    "",
    bullets(brief.assumptions),
    ...brief.pendingDecisions.length === 0 ? [] : ["", "\u5C1A\u5F85\u51B3\u5B9A\uFF1A", "", bullets(brief.pendingDecisions)]
  ].join("\n");
}
function validatePrototypeBrief(value, deferredStyleNote) {
  const issues = [];
  const object = objectValue2(value);
  if (object === null) return { ok: false, code: "brief_quality_invalid", message: "PrototypeBrief \u5FC5\u987B\u662F\u7ED3\u6784\u5316\u5BF9\u8C61", issues: ["brief \u4E0D\u662F\u5BF9\u8C61"] };
  const title = textValue(object.title);
  const productDefinition = textValue(object.productDefinition);
  const target = textValue(object.target);
  const coreScenario = textValue(object.coreScenario);
  const coreOutcome = textValue(object.coreOutcome);
  const uniqueMechanism = stringList(object.uniqueMechanism);
  const firstVersionFlow = stringList(object.firstVersionFlow);
  const includedScope = stringList(object.includedScope);
  const excludedScope = stringList(object.excludedScope);
  const prototypePrinciples = stringList(object.prototypePrinciples);
  const acceptanceCriteria = stringList(object.acceptanceCriteria);
  const assumptions = stringList(object.assumptions);
  const pendingDecisions = stringList(object.pendingDecisions);
  if (title === null) issues.push("title \u4E0D\u80FD\u4E3A\u7A7A");
  if (productDefinition === null || productDefinition.length < 30) issues.push("productDefinition \u5FC5\u987B\u7528\u5B8C\u6574\u81EA\u7136\u8BED\u8A00\u5B9A\u4E49\u4EA7\u54C1\u3001\u6838\u5FC3\u6D41\u7A0B\u548C\u9996\u7248\u53D6\u820D");
  if (target === null) issues.push("target \u4E0D\u80FD\u4E3A\u7A7A");
  if (coreScenario === null) issues.push("coreScenario \u4E0D\u80FD\u4E3A\u7A7A");
  if (coreOutcome === null) issues.push("coreOutcome \u4E0D\u80FD\u4E3A\u7A7A");
  if (uniqueMechanism === null || uniqueMechanism.length === 0) issues.push("uniqueMechanism \u81F3\u5C11\u5305\u542B\u4E00\u4E2A\u4EA7\u54C1\u4EAE\u70B9\uFF0C\u6216\u660E\u786E\u8BF4\u660E\u9996\u7248\u5C1A\u672A\u5F62\u6210\u5DEE\u5F02\u5316");
  if (firstVersionFlow === null || firstVersionFlow.length < 2) issues.push("firstVersionFlow \u81F3\u5C11\u5305\u542B\u4E24\u4E2A\u8FDE\u7EED\u6B65\u9AA4");
  if (includedScope === null || includedScope.length === 0) issues.push("includedScope \u4E0D\u80FD\u4E3A\u7A7A");
  if (excludedScope === null || excludedScope.length === 0) issues.push("excludedScope \u4E0D\u80FD\u4E3A\u7A7A");
  if (prototypePrinciples === null || prototypePrinciples.length < 3) issues.push("prototypePrinciples \u81F3\u5C11\u5305\u542B 3 \u6761\u539F\u578B\u8868\u8FBE\u539F\u5219");
  if (acceptanceCriteria === null || acceptanceCriteria.length < 5) issues.push("acceptanceCriteria \u81F3\u5C11\u5305\u542B 5 \u6761\u53EF\u9A8C\u8BC1\u6807\u51C6");
  if (assumptions === null || assumptions.length === 0) issues.push("assumptions \u4E0D\u80FD\u4E3A\u7A7A");
  if (pendingDecisions === null) issues.push("pendingDecisions \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4");
  const layoutObject = objectValue2(object.prototypeLayout);
  const viewport = viewportValue(layoutObject?.viewport);
  const platform = textValue(layoutObject?.platform);
  const arrangement = textValue(layoutObject?.arrangement);
  const connectionStyle = textValue(layoutObject?.connectionStyle);
  const representativePageId = textValue(layoutObject?.representativePageId);
  const comprehensionGoal = textValue(layoutObject?.comprehensionGoal);
  if (layoutObject === null || viewport === null || platform === null || arrangement === null || connectionStyle === null || representativePageId === null || comprehensionGoal === null) {
    issues.push("prototypeLayout \u5FC5\u987B\u5B8C\u6574\u8BF4\u660E\u5E73\u53F0\u3001\u5C3A\u5BF8\u3001\u6392\u5217\u3001\u8FDE\u7EBF\u3001\u4EE3\u8868\u9875\u548C 5 \u79D2\u7406\u89E3\u76EE\u6807");
  }
  const rawPages = Array.isArray(object.pages) ? object.pages : [];
  if (rawPages.length === 0) issues.push("pages \u81F3\u5C11\u5305\u542B\u4E00\u4E2A\u9875\u9762");
  const pages = rawPages.map((page, index) => parsePage(page, index, issues)).filter((page) => page !== null);
  const pageIds = /* @__PURE__ */ new Set();
  const pageNames = /* @__PURE__ */ new Set();
  for (const page of pages) {
    if (pageIds.has(page.id)) issues.push(`\u9875\u9762 id ${page.id} \u91CD\u590D`);
    pageIds.add(page.id);
    if (pageNames.has(page.name)) issues.push(`\u9875\u9762\u540D\u79F0 ${page.name} \u91CD\u590D`);
    pageNames.add(page.name);
  }
  if (representativePageId !== null && !pageIds.has(representativePageId)) issues.push("prototypeLayout.representativePageId \u5FC5\u987B\u5F15\u7528\u771F\u5B9E\u9875\u9762");
  const rawRelations = Array.isArray(object.pageRelations) ? object.pageRelations : [];
  const pageRelations = rawRelations.map((relation, index) => parseRelation(relation, index, issues)).filter((relation) => relation !== null);
  if (pages.length > 1 && pageRelations.length === 0) issues.push("\u591A\u9875\u9762\u539F\u578B\u5FC5\u987B\u81F3\u5C11\u63D0\u4F9B\u4E00\u6761\u660E\u786E\u7684\u9875\u9762\u5173\u7CFB");
  for (const relation of pageRelations) {
    if (!pageIds.has(relation.fromPageId) || !pageIds.has(relation.toPageId)) issues.push(`\u9875\u9762\u5173\u7CFB ${relation.label} \u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u9875\u9762`);
  }
  if (acceptanceCriteria !== null) {
    const corpus = acceptanceCriteria.join("\uFF1B");
    const required = [
      [/可见|文字/u, "\u6587\u5B57\u9996\u6B21\u6E32\u67D3\u53EF\u89C1"],
      [/裁切|越界/u, "\u9875\u9762\u548C\u7EC4\u4EF6\u65E0\u88C1\u5207\u6216\u8D8A\u754C"],
      [/按钮.*居中|居中.*按钮/u, "\u6309\u94AE\u6587\u6848\u5C45\u4E2D"],
      [/导航/u, "\u5E95\u90E8\u5BFC\u822A\u5B8C\u6574\u5BF9\u9F50"],
      [/流程|交互|箭头/u, "\u6838\u5FC3\u6D41\u7A0B\u6216\u4EA4\u4E92\u5173\u7CFB"]
    ];
    for (const [pattern, label] of required) if (!pattern.test(corpus)) issues.push(`acceptanceCriteria \u7F3A\u5C11\u201C${label}\u201D\u9A8C\u6536`);
  }
  const implementationCorpus = [
    productDefinition ?? "",
    ...uniqueMechanism ?? [],
    ...firstVersionFlow ?? [],
    ...includedScope ?? [],
    ...prototypePrinciples ?? [],
    ...pages.flatMap((page) => [...page.structure, ...page.states, ...page.navigation, ...page.annotations])
  ].join("\uFF1B");
  if (VISUAL_OR_TECH_IMPLEMENTATION_RE.test(implementationCorpus)) {
    issues.push("\u539F\u578B\u7B80\u62A5\u4E0D\u80FD\u89C4\u5B9A\u54C1\u724C\u89C6\u89C9\u6216\u524D\u7AEF\u6280\u672F\u5B9E\u73B0\uFF1B\u8BF7\u628A\u989C\u8272\u4F53\u7CFB\u3001\u5B57\u4F53\u3001\u5706\u89D2\u548C\u6280\u672F\u6808\u63A8\u8FDF\u5230 Generate");
  }
  if (excludedScope !== null && assumptions !== null) {
    const contradiction = assumptions.find((assumption) => {
      if (!POSITIVE_SCOPE_RE.test(assumption)) return false;
      const normalizedAssumption = normalizedScopeConcept(assumption);
      return excludedScope.some((excluded) => {
        const concept = normalizedScopeConcept(excluded);
        return concept.length >= 2 && normalizedAssumption.includes(concept);
      });
    });
    if (contradiction !== void 0) issues.push(`\u9ED8\u8BA4\u5047\u8BBE\u201C${contradiction}\u201D\u4E0E\u9996\u7248\u660E\u786E\u6392\u9664\u8303\u56F4\u77DB\u76FE`);
  }
  if (issues.length > 0 || title === null || productDefinition === null || target === null || coreScenario === null || coreOutcome === null || uniqueMechanism === null || firstVersionFlow === null || includedScope === null || excludedScope === null || viewport === null || platform === null || arrangement === null || connectionStyle === null || representativePageId === null || comprehensionGoal === null || prototypePrinciples === null || acceptanceCriteria === null || assumptions === null || pendingDecisions === null) {
    return { ok: false, code: "brief_quality_invalid", message: `\u9879\u76EE\u7B80\u62A5\u672A\u901A\u8FC7\u8D28\u91CF\u95E8\u7981\uFF1A${issues.join("\uFF1B")}`, issues };
  }
  const canonical = {
    title,
    productDefinition,
    target,
    coreScenario,
    coreOutcome,
    uniqueMechanism,
    firstVersionFlow,
    includedScope,
    excludedScope,
    prototypeLayout: { platform, viewport, arrangement, connectionStyle, representativePageId, comprehensionGoal },
    pages,
    pageRelations,
    prototypePrinciples,
    acceptanceCriteria,
    assumptions,
    pendingDecisions
  };
  const brief = {
    ...canonical,
    briefSchemaVersion: 2,
    pageBlueprints: pages.map((page) => ({
      pageId: page.id,
      page: page.name,
      coreTask: page.goal,
      primaryAction: page.primaryAction,
      aboveFold: [...page.structure.slice(0, 3), `\u552F\u4E00\u4E3B\u8981\u64CD\u4F5C\uFF1A${page.primaryAction}`],
      semanticComponents: semanticComponents(page)
    })),
    pageMockData: pages.map((page) => ({
      pageId: page.id,
      page: page.name,
      minimumRecords: 3,
      requiredContent: page.structure,
      examples: page.mockDataGroups.flatMap((group) => group.items)
    })),
    mockDataPolicy: {
      rule: "\u5217\u8868\u3001\u804A\u5929\u3001\u56FE\u8868\u3001\u8BE6\u60C5\u548C\u72B6\u6001\u7EC4\u4EF6\u5FC5\u987B\u5C55\u793A\u771F\u5B9E\u793A\u4F8B\u5185\u5BB9\uFF0C\u4E0D\u80FD\u4F7F\u7528\u7A7A\u767D\u65B9\u6846\u3001Lorem ipsum\u3001\u7528\u6237A\u6216\u65E0\u542B\u4E49\u5360\u4F4D\u7B26\u4EE3\u66FF",
      minimumRecordsPerRepeatedComponent: 3,
      visibility: "mock \u6570\u636E\u5FC5\u987B\u4F7F\u7528\u9996\u6B21\u6E32\u67D3\u5373\u53EF\u89C1\u7684\u72EC\u7ACB text \u5143\u7D20"
    },
    prototypeQualityPolicy: {
      firstScreen: canonical.prototypeLayout.comprehensionGoal,
      hierarchy: "\u6BCF\u9875\u53EA\u6709\u4E00\u4E2A primary-action\uFF1B\u6807\u9898\u3001\u6B63\u6587\u548C\u8F85\u52A9\u4FE1\u606F\u5F62\u6210\u6E05\u695A\u5C42\u7EA7",
      completionRule: "writeVerified=true \u53EA\u4EE3\u8868\u5199\u5165\u4E00\u81F4\uFF1B\u9010\u6761\u901A\u8FC7\u672C\u7B80\u62A5 acceptanceCriteria \u540E\u624D\u80FD\u5BA3\u5E03\u5B8C\u6210"
    },
    interactions: pageRelations.map((relation) => `${relation.fromPageId} \u2192 ${relation.toPageId}\uFF1A${relation.trigger}\uFF1B${relation.result}`),
    deferredStyleNote
  };
  return { ok: true, brief, markdown: renderPrototypeBriefMarkdown(canonical) };
}

// src/create-contract.ts
var CREATE_ACTIONS = [
  "start",
  "propose_question",
  "synthesize",
  "answer",
  "skip",
  "revise",
  "rename",
  "resume",
  "list",
  "confirm",
  "abandon",
  "archive"
];

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
function normalizeStructuredArg(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonicalValue(entry)]));
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
  return JSON.stringify(canonicalValue({
    action: args.action,
    sessionId: args.sessionId ?? null,
    revision: args.revision ?? null,
    questionId: args.questionId ?? null,
    values: args.values ?? [],
    otherText: args.otherText ?? null,
    projectName: args.projectName ?? null,
    question: normalizeStructuredArg(args.question) ?? null,
    brief: normalizeStructuredArg(args.brief) ?? null,
    stopReason: args.stopReason ?? null
  }));
}
function draftStatus(draft) {
  if (draft.status === "draft") {
    if (draft.currentQuestion !== null) return "question";
    if (draft.brief !== null) return "ready";
    if (draft.flowVersion === CREATE_FLOW_VERSION) return "discovery";
    return "ready";
  }
  return draft.status;
}
var CREATE_DIMENSION_HEADERS = {
  "trigger-context": "\u6838\u5FC3\u573A\u666F",
  "existing-alternative": "\u73B0\u6709\u66FF\u4EE3",
  "core-outcome": "\u6838\u5FC3\u7ED3\u679C",
  "unique-mechanism": "\u72EC\u7279\u673A\u5236",
  "core-loop": "\u4F7F\u7528\u95ED\u73AF",
  "critical-risk": "\u5173\u952E\u98CE\u9669",
  "scope-proof": "\u9996\u7248\u9A8C\u8BC1",
  "target-user": "\u6838\u5FC3\u7528\u6237",
  "target-platform": "\u4EA7\u54C1\u7AEF",
  "product-architecture": "\u4EA7\u54C1\u7ED3\u6784"
};
function hostQuestionFor(question) {
  const prompt = question.insight === void 0 ? question.text : `\u5224\u65AD\uFF1A${question.insight}

\u95EE\u9898\uFF1A${question.text}`;
  return {
    questions: [{
      id: question.id,
      question: prompt,
      header: CREATE_DIMENSION_HEADERS[question.dimension ?? ""] ?? "\u4EA7\u54C1\u51B3\u7B56",
      options: question.options.map((option) => ({ label: option.label, description: option.description ?? "" })),
      multi_select: question.selectionMode === "multiple"
    }]
  };
}
function displayedQuestionText(question) {
  return question.insight === void 0 ? question.text : `\u5224\u65AD\uFF1A${question.insight}

\u95EE\u9898\uFF1A${question.text}`;
}
function readyPageNames(brief) {
  if (typeof brief !== "object" || brief === null || Array.isArray(brief)) return [];
  const pages = brief.pages;
  if (!Array.isArray(pages)) return [];
  return pages.flatMap((page) => {
    if (typeof page !== "object" || page === null || Array.isArray(page)) return [];
    const name2 = page.name;
    return typeof name2 === "string" && name2.trim() !== "" ? [name2.trim()] : [];
  });
}
function createConfirmation(brief) {
  const pageNames = readyPageNames(brief);
  const pageSummary = pageNames.length === 0 ? "\u9879\u76EE\u7B80\u62A5\u4E2D\u7684\u9875\u9762\u8303\u56F4" : `${pageNames.length} \u4E2A\u9875\u9762\uFF1A${pageNames.join("\u3001")}`;
  const question = `\u8BA1\u5212\u7ED8\u5236${pageSummary}\u3002\u8FD9\u4E9B\u5C31\u662F\u9996\u7248\u539F\u578B\u9700\u8981\u751F\u6210\u7684\u9875\u9762\u5417\uFF1F`;
  return {
    id: "create-brief-confirm",
    pageNames,
    question,
    options: [
      { id: "confirm", label: "\u786E\u8BA4\u8FD9\u4E9B\u9875\u9762\u5E76\u7ED8\u5236", description: "\u4F7F\u7528\u521A\u521A\u5C55\u793A\u7684\u540C\u4E00\u4EFD\u9879\u76EE\u7B80\u62A5\u548C\u9875\u9762\u8303\u56F4\u521B\u5EFA\u72EC\u7ACB\u753B\u677F\u3002" },
      { id: "adjust-pages", label: "\u8C03\u6574\u9875\u9762\u8303\u56F4", description: "\u589E\u5220\u3001\u5408\u5E76\u6216\u62C6\u5206\u9875\u9762\uFF0C\u518D\u91CD\u65B0\u751F\u6210\u5B8C\u6574\u9879\u76EE\u7B80\u62A5\u3002" },
      { id: "adjust-direction", label: "\u8C03\u6574\u4EA7\u54C1\u65B9\u5411", description: "\u53EA\u8FFD\u95EE\u53D7\u5F71\u54CD\u7684\u4EA7\u54C1\u51B3\u7B56\uFF0C\u518D\u91CD\u65B0\u751F\u6210\u5B8C\u6574\u7B80\u62A5\u3002" }
    ],
    askUserQuestionArgs: {
      questions: [{
        id: "create-brief-confirm",
        question,
        header: "\u9875\u9762\u786E\u8BA4",
        options: [
          { label: "\u786E\u8BA4\u8FD9\u4E9B\u9875\u9762\u5E76\u7ED8\u5236", description: "\u4F7F\u7528\u521A\u521A\u5C55\u793A\u7684\u540C\u4E00\u4EFD\u9879\u76EE\u7B80\u62A5\u548C\u9875\u9762\u8303\u56F4\u521B\u5EFA\u72EC\u7ACB\u753B\u677F\u3002" },
          { label: "\u8C03\u6574\u9875\u9762\u8303\u56F4", description: "\u589E\u5220\u3001\u5408\u5E76\u6216\u62C6\u5206\u9875\u9762\uFF0C\u518D\u91CD\u65B0\u751F\u6210\u5B8C\u6574\u9879\u76EE\u7B80\u62A5\u3002" },
          { label: "\u8C03\u6574\u4EA7\u54C1\u65B9\u5411", description: "\u53EA\u8FFD\u95EE\u53D7\u5F71\u54CD\u7684\u4EA7\u54C1\u51B3\u7B56\uFF0C\u518D\u91CD\u65B0\u751F\u6210\u5B8C\u6574\u7B80\u62A5\u3002" }
        ],
        multi_select: false
      }]
    }
  };
}
function createDrawingPlan(brief) {
  if (typeof brief !== "object" || brief === null || Array.isArray(brief)) {
    return { mode: "single-batch", nextActionCode: "write_pages", allowedPageIds: [], remainingPageIds: [] };
  }
  const value = brief;
  const pageIds = Array.isArray(value.pages) ? value.pages.flatMap((page) => {
    if (typeof page !== "object" || page === null || Array.isArray(page)) return [];
    const id = page.id;
    return typeof id === "string" && id.trim() !== "" ? [id.trim()] : [];
  }) : [];
  const layout = typeof value.prototypeLayout === "object" && value.prototypeLayout !== null && !Array.isArray(value.prototypeLayout) ? value.prototypeLayout : {};
  const requestedRepresentative = typeof layout.representativePageId === "string" ? layout.representativePageId : "";
  const representativePageId = pageIds.includes(requestedRepresentative) ? requestedRepresentative : pageIds[0];
  const phased = pageIds.length >= 3 && representativePageId !== void 0;
  return {
    mode: phased ? "representative-first" : "single-batch",
    nextActionCode: phased ? "write_representative" : "write_pages",
    ...representativePageId === void 0 ? {} : { representativePageId },
    allowedPageIds: phased ? [representativePageId] : pageIds,
    remainingPageIds: phased ? pageIds.filter((id) => id !== representativePageId) : []
  };
}
function prototypeBriefContract() {
  return {
    requiredTopLevel: [
      "title",
      "productDefinition",
      "target",
      "coreScenario",
      "coreOutcome",
      "uniqueMechanism",
      "firstVersionFlow",
      "includedScope",
      "excludedScope",
      "prototypeLayout",
      "pages",
      "pageRelations",
      "prototypePrinciples",
      "acceptanceCriteria",
      "assumptions",
      "pendingDecisions"
    ],
    prototypeLayout: ["platform", "viewport: { width, height }", "arrangement", "connectionStyle", "representativePageId", "comprehensionGoal"],
    page: [
      "id",
      "name",
      "goal",
      "size: { width, height }",
      "structure: string[]",
      "primaryAction",
      "secondaryActions: string[]",
      "mockDataGroups: Array<{ name: string, items: string[] }>",
      "states: string[]",
      "navigation: string[]",
      "annotations: string[]",
      "acceptanceCriteria: string[]"
    ],
    pageRelation: ["fromPageId", "toPageId", "trigger", "result", "arrowStyle: solid|dashed", "label"],
    rules: [
      "structure \u53EA\u80FD\u653E\u53EF\u76F4\u63A5\u7ED8\u5236\u7684\u5177\u4F53\u5B57\u7B26\u4E32\uFF0C\u4E0D\u653E\u7EC4\u4EF6\u5BF9\u8C61",
      "\u6BCF\u9875\u901A\u8FC7 mockDataGroups \u63D0\u4F9B\u81F3\u5C11 3 \u6761\u771F\u5B9E\u53EF\u89C1\u6570\u636E\u6216\u5B8C\u6574\u8868\u5355\u5B57\u6BB5",
      "\u591A\u9875\u9762\u81F3\u5C11\u4E00\u6761 pageRelations\uFF0C\u4E14\u9875\u9762 ID \u5FC5\u987B\u5B58\u5728",
      "\u539F\u578B\u9636\u6BB5\u4E0D\u5199\u54C1\u724C\u8272\u3001\u5B57\u4F53\u3001\u5706\u89D2\u30013D \u6216\u524D\u7AEF\u6280\u672F\u6808"
    ]
  };
}
function responseFor(projects, draft, extras = {}) {
  const status = draftStatus(draft);
  const response = {
    status,
    ...draft.flowVersion === void 0 ? {} : { flowVersion: draft.flowVersion },
    sessionId: draft.projectId,
    projectId: draft.projectId,
    projectName: draft.projectName,
    projectFile: projects.fileName(draft.projectId),
    revision: draft.revision,
    ...draft.currentQuestion === null ? {} : {
      question: {
        ...draft.currentQuestion,
        text: displayedQuestionText(draft.currentQuestion),
        askUserQuestionArgs: hostQuestionFor(draft.currentQuestion)
      }
    },
    ...draft.discovery === void 0 ? {} : { discovery: draft.discovery },
    ...draft.brief === null ? {} : { brief: draft.brief, assumptions: draft.brief.assumptions ?? [] },
    ...draft.briefMarkdown === void 0 || draft.briefMarkdown === null ? {} : { briefMarkdown: draft.briefMarkdown },
    ...draft.flowVersion === CREATE_FLOW_VERSION && draft.status === "draft" ? { briefContract: prototypeBriefContract() } : {},
    ...status === "ready" ? { confirmation: createConfirmation(draft.brief) } : {},
    ...status === "confirmed" && draft.brief !== null ? { drawingPlan: createDrawingPlan(draft.brief) } : {},
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
  if (draft.flowVersion === CREATE_FLOW_VERSION && draft.discovery !== void 0) {
    const discovery = draft.discovery;
    if ((discovery.invalidatedQuestionIds ?? []).includes(questionId)) return null;
    return discovery.questions.find((question) => question.id === questionId) ?? null;
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
    flowVersion: CREATE_FLOW_VERSION,
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
    currentQuestion: null,
    discovery: initialDiscovery(idea, answers),
    briefMarkdown: null,
    pendingInterpretation: null,
    brief: null,
    history: [{ revision: 1, action: "start", at: Date.now() }]
  };
}
function migrateLegacyDraft(draft) {
  const discovery = initialDiscovery(draft.originalIdea, draft.answers);
  const legacyDimensionByQuestion = {
    "target-platform": "target-platform",
    "core-user": "target-user",
    "core-goal": "core-outcome",
    "core-flow": "core-loop",
    "core-modules": "product-architecture",
    "core-pages": "product-architecture"
  };
  const legacyLabelByQuestion = {
    "target-platform": "\u4EA7\u54C1\u7AEF",
    "core-user": "\u6838\u5FC3\u7528\u6237",
    "core-goal": "\u6838\u5FC3\u7ED3\u679C",
    "core-flow": "\u6838\u5FC3\u6D41\u7A0B",
    "core-modules": "\u4EA7\u54C1\u7ED3\u6784",
    "core-pages": "\u9875\u9762\u7ED3\u6784"
  };
  discovery.resolvedDecisions = Object.entries(draft.answers).map(([questionId, answer]) => {
    const legacyQuestion = questionById(draft.originalIdea, questionId);
    const semanticValues = answer.values.map((value2) => legacyQuestion?.options.find((option) => option.id === value2)?.label ?? value2);
    const value = answer.normalizedText ?? answer.otherText ?? semanticValues.join("\u3001");
    return `${legacyLabelByQuestion[questionId] ?? questionId}\uFF1A${value}`;
  });
  const resolvedDimensions = new Set(Object.keys(draft.answers).map((questionId) => legacyDimensionByQuestion[questionId]).filter(Boolean));
  discovery.openDimensions = discovery.openDimensions.filter((dimension) => !resolvedDimensions.has(dimension));
  draft.flowVersion = CREATE_FLOW_VERSION;
  draft.currentQuestion = null;
  draft.pendingInterpretation = null;
  draft.discovery = refreshDiscovery(discovery);
  draft.briefMarkdown = null;
  addHistory(draft, "migrate-create-v2");
}
function draw2codeCreateTool(projects, scenes) {
  return defineTool({
    name: "draw2code_create",
    description: "Create a new \u753B\u7801 project through adaptive product discovery and one executable prototype brief. This is the mandatory entry point when the user says they want to create, build, or design a new product from scratch. Call action=start as soon as a new-project intent is clear; pass the user's idea faithfully, infer a concise semantic projectName from the entire idea, and never call draw2code_update first. Explicit facts returned in discovery must not be asked again. A discovery result means the Agent must choose the single highest-impact unresolved product decision. If information is insufficient, call action=propose_question with a product-specific insight, one decision question, 2\u20134 tradeoff-rich options, a recommendation, decisionImpact and dependencies. To make the native card lossless, question.text itself must be \u201C\u5224\u65AD\uFF1A{insight}\\n\\n\u95EE\u9898\uFF1A{self-contained insight + decision question}\u201D; the text after \u201C\u95EE\u9898\uFF1A\u201D must repeat the product judgment so it remains meaningful even if an Agent extracts only that part. question.options must already include synthesize-now/\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5, unknown/\u8FD8\u6CA1\u60F3\u597D and other/\u5176\u4ED6 in addition to the product directions. question.dimension must use one returned openDimensions ID exactly: trigger-context, existing-alternative, core-outcome, unique-mechanism, core-loop, critical-risk, scope-proof, target-user, target-platform, or product-architecture. Never invent shorter aliases such as mechanism or risk. Never use the old fixed platform/user/goal/flow/modules/pages sequence, and never ask modules and pages as separate checklist questions. After every question result, call the host ask_user_question interaction with exactly one question and every returned choice, including \u201C\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5\u201D, \u201C\u8FD8\u6CA1\u60F3\u597D\u201D and \u201C\u5176\u4ED6\u201D; never truncate or silently replace options. Map the selected label back to its option id and call action=answer. The synthesize-now choice returns discovery.nextAction=synthesize. When the core scenario, outcome, unique mechanism, first-version flow and scope are clear\u2014or the user asks to stop\u2014call action=synthesize with stopReason and a complete PrototypeBrief. Discovery may stop early and must stop after ten questions. The tool validates PrototypeBrief, derives pageBlueprints/pageMockData, and deterministically renders briefMarkdown. When status=ready, show the complete briefMarkdown verbatim, then show one explicit page-range confirmation card listing every page: \u201C\u786E\u8BA4\u8FD9\u4E9B\u9875\u9762\u5E76\u7ED8\u5236 / \u8C03\u6574\u9875\u9762\u8303\u56F4 / \u8C03\u6574\u4EA7\u54C1\u65B9\u5411\u201D; do not summarize it. Use action=answer for a choice, action=skip when the user skips the pending question, action=revise to change an earlier answer and invalidate only dependent questions, action=rename to edit the project name, action=resume to reopen a draft, action=list to show unfinished projects, and action=confirm only after the user confirms the ready brief. The tool stores product intent separately from scene files. It creates an isolated empty board only after confirmation and returns nextAction=draw2code_update plus a machine-readable drawingPlan. For three or more pages, drawingPlan allows only the representative page first; the model must not generate the remaining page ops until action=review returns nextActionCode=write_remaining_pages. The model must call draw2code_update with the returned boardName and drawingPlan. projectName is required for action=start, should usually be 4\u201312 Chinese characters, and becomes the board name directly; never append \u201C\u539F\u578B\u201D or another workflow suffix. The tool validates this Agent-authored name but does not derive it from the raw idea. The prototype is semantic low-fi: do not ask for brand colors, fonts, 3D/2D, flat/skeuomorphic style here, but restrained semantic tones for categories, states, and primary actions are encouraged. If the user volunteers a style preference, pass it as styleNote so it is deferred to draw2code_generate. Options are structured for native choice cards when available; otherwise render them as numbered choices. \u201C\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5\u201D ends discovery without requiring a hidden chat input; \u201COther\u201D requires text and is stored directly; silence or \u201C\u8FD8\u6CA1\u60F3\u597D\u201D is an explicit pending decision, not pause or cancellation.",
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      action: {
        type: "string",
        required: true,
        enum: [...CREATE_ACTIONS],
        description: "State-machine action for draw2code_create."
      },
      idea: { type: "string", description: "The user\u2019s new-project idea. Required for action=start." },
      projectName: { type: "string", description: "Agent-inferred semantic product name. Required for action=start; usually 4\u201312 Chinese characters, never copied or clipped from the raw idea, and without an \u201C\u539F\u578B\u201D suffix. Also used as the replacement name for action=rename." },
      styleNote: { type: "string", description: "A style preference volunteered by the user; record for generate, never apply to the prototype." },
      sessionId: { type: "string", description: "Project session ID returned by a prior call." },
      revision: { type: "integer", description: "Expected draft revision for mutation actions." },
      questionId: { type: "string", description: "Question being answered or revised." },
      values: { type: "array", items: { type: "string" }, description: "Selected option IDs. Use one value for single-select questions." },
      otherText: { type: "string", description: "Free-text answer when the user selected \u201Cother\u201D." },
      question: { type: "json", description: "Adaptive product question for action=propose_question. text must be directly displayable as \u201C\u5224\u65AD\uFF1A{insight}\\n\\n\u95EE\u9898\uFF1A{self-contained insight + decision question}\u201D; repeat the product judgment after \u95EE\u9898\uFF1A so the native card remains meaningful even if only that part is used. options must explicitly contain 2\u20134 product directions plus synthesize-now/\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5, unknown/\u8FD8\u6CA1\u60F3\u597D, and other/\u5176\u4ED6. DSH may serialize this JSON object as a string; both forms are accepted." },
      brief: { type: "json", description: "Structured PrototypeBrief for action=synthesize. Exact top-level keys: title, productDefinition, target, coreScenario, coreOutcome, uniqueMechanism[], firstVersionFlow[], includedScope[], excludedScope[], prototypeLayout, pages[], pageRelations[], prototypePrinciples[], acceptanceCriteria[], assumptions[], pendingDecisions[]. prototypeLayout requires platform, viewport{width,height}, arrangement, connectionStyle, representativePageId, comprehensionGoal. Each page requires id, name, goal, size{width,height}, structure:string[], primaryAction, secondaryActions:string[], mockDataGroups:[{name,items:string[]}], states:string[], navigation:string[], annotations:string[], acceptanceCriteria:string[]. Each relation requires fromPageId, toPageId, trigger, result, arrowStyle (solid|dashed), label. Never use mockData or other aliases. DSH may serialize this JSON object as a string; both forms are accepted." },
      stopReason: { type: "string", description: "Why discovery is ready to synthesize early." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: { type: "string", required: true },
          flowVersion: { type: "integer" },
          sessionId: { type: "string" },
          projectId: { type: "string" },
          projectName: { type: "string" },
          projectFile: { type: "string" },
          revision: { type: "integer" },
          question: { type: "json" },
          discovery: { type: "json" },
          brief: { type: "json" },
          briefMarkdown: { type: "string" },
          briefContract: { type: "json" },
          confirmation: { type: "json" },
          assumptions: { type: "json" },
          nameProposal: { type: "json" },
          boardName: { type: "string" },
          activeBoard: { type: "string" },
          nextAction: { type: "string" },
          drawingPlan: { type: "json" },
          error: { type: "json" },
          current: { type: "json" },
          drafts: { type: "json" },
          idempotent: { type: "boolean" }
        }
      },
      render: (_args, value) => {
        if (value.status === "discovery" && value.discovery !== void 0) {
          const discovery = value.discovery;
          if (discovery.nextAction === "synthesize") {
            return text(`${continuation(value)} status=discovery nextAction=synthesize
\u7528\u6237\u5DF2\u9009\u62E9\u76F4\u63A5\u6574\u7406\u6216\u95EE\u9898\u9884\u7B97\u5DF2\u7ECF\u7528\u5B8C\u3002\u5FC5\u987B\u7ACB\u5373\u8C03\u7528 action=synthesize\uFF0C\u5E76\u4E25\u683C\u6309 briefContract \u63D0\u4EA4 stopReason \u4E0E\u5B8C\u6574 PrototypeBrief\uFF1B\u9875\u9762\u771F\u5B9E\u6570\u636E\u5B57\u6BB5\u5FC5\u987B\u53EB mockDataGroups\uFF0C\u683C\u5F0F\u4E3A [{ name, items: string[] }]\uFF1B\u9875\u9762\u5173\u7CFB\u5B57\u6BB5\u5FC5\u987B\u53EB fromPageId/toPageId/trigger/result/arrowStyle/label\u3002\u7981\u6B62\u731C\u522B\u540D\u3001\u8BFB\u53D6\u63D2\u4EF6\u6E90\u7801\u6216\u7EE7\u7EED\u8C03\u7528 action=propose_question\u3002`);
          }
          return text(`${continuation(value)} status=discovery allowedDimensions=${discovery.openDimensions.join(",")} recommendedDimensions=${discovery.recommendedDimensions.join(",")}
\u8BF7\u6839\u636E discovery \u4E2D\u5DF2\u660E\u786E\u4E8B\u5B9E\u3001\u5386\u53F2\u56DE\u7B54\u548C\u5269\u4F59\u95EE\u9898\u9884\u7B97\uFF0C\u5224\u65AD\u4E0B\u4E00\u9879\u6700\u503C\u5F97\u89E3\u51B3\u7684\u4EA7\u54C1\u51B3\u7B56\u3002\u7B2C\u4E00\u9898\u4F18\u5148\u4ECE recommendedDimensions \u524D\u4E24\u9879\u4E2D\u9009\u62E9\uFF0C\u4E0D\u80FD\u5148\u95EE\u6A21\u5757\u3001\u9875\u9762\u6216\u901A\u7528\u4FE1\u606F\u67B6\u6784\u3002\u4FE1\u606F\u4E0D\u8DB3\u65F6\u8C03\u7528 action=propose_question\uFF1Bquestion \u5FC5\u987B\u5305\u542B id\u3001dimension\u3001insight\u3001text\u3001decisionImpact\u3001recommendedOptionId\u3001dependsOn \u548C 2\u20134 \u4E2A\u5E26 description \u7684 options\uFF0C\u5E76\u4E14 dimension \u5FC5\u987B\u9010\u5B57\u4F7F\u7528 allowedDimensions \u4E2D\u7684\u7A33\u5B9A ID\u3002\u4FE1\u606F\u5DF2\u7ECF\u8DB3\u591F\u6216\u7528\u6237\u8981\u6C42\u76F4\u63A5\u6574\u7406\u65F6\u8C03\u7528 action=synthesize\u3002`);
        }
        if (value.status === "question" && value.question !== void 0) {
          const question = value.question;
          const options = question.options.map((option, index) => `${index + 1}. ${option.id} \u2014 ${option.label}${option.description === void 0 ? "" : `\uFF1A${option.description}`}`).join("\n");
          const recommended = question.options.find((option) => option.id === question.recommendedOptionId);
          const insight = question.insight === void 0 || question.text.startsWith("\u5224\u65AD\uFF1A") ? "" : `\u5224\u65AD\uFF1A${question.insight}
`;
          const recommendation = recommended === void 0 ? "" : `
\u63A8\u8350\uFF1A${recommended.label} \u2014 ${recommended.description ?? ""}`;
          const impact = question.decisionImpact === void 0 ? "" : `
\u51B3\u7B56\u5F71\u54CD\uFF1A${question.decisionImpact}`;
          return text(`${continuation(value)} status=question questionId=${question.id}
${insight}${question.text}
${options}${recommendation}${impact}${question.allowOther ? "\n\uFF08\u53EF\u9009\u201C\u5176\u4ED6\u201D\u5E76\u8865\u5145\u8BF4\u660E\uFF09" : ""}
\u8C03\u7528 ask_user_question \u65F6\u5FC5\u987B\u539F\u6837\u590D\u5236 question.askUserQuestionArgs\uFF0C\u4E0D\u80FD\u4E22\u6389\u5224\u65AD\u3001\u9009\u9879\u6216\u201C\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5\u201D\u3002\u4E0B\u4E00\u6B21\u8C03\u7528\u5FC5\u987B\u4F7F\u7528 action=answer\u3001\u4E0A\u9762\u7684 sessionId/revision/questionId\uFF0C\u5E76\u628A\u7528\u6237\u9009\u62E9\u7684 option id \u653E\u5165 values\u3002`);
        }
        if (value.status === "ready") {
          const markdown = value.briefMarkdown ?? "\u9879\u76EE\u7B80\u62A5\u7F3A\u5C11\u53EF\u8BFB Markdown\uFF0C\u8BF7\u4FEE\u590D\u540E\u518D\u786E\u8BA4\u3002";
          return text(`${continuation(value)} status=ready
${markdown}

\u8BF7\u5B8C\u6574\u5C55\u793A\u4EE5\u4E0A\u9879\u76EE\u7B80\u62A5\uFF0C\u4E0D\u8981\u81EA\u884C\u7F29\u5199\u6216\u91CD\u65B0\u603B\u7ED3\u3002\u968F\u540E\u4F7F\u7528\u5BBF\u4E3B ask_user_question \u539F\u6837\u590D\u5236 confirmation.askUserQuestionArgs\uFF1B\u8FD9\u5F20\u5361\u4F1A\u660E\u786E\u5217\u51FA\u5C06\u7ED8\u5236\u7684\u9875\u9762\uFF0C\u5E76\u4E14\u4EC5\u5305\u542B\u201C\u786E\u8BA4\u8FD9\u4E9B\u9875\u9762\u5E76\u7ED8\u5236 / \u8C03\u6574\u9875\u9762\u8303\u56F4 / \u8C03\u6574\u4EA7\u54C1\u65B9\u5411\u201D\u3002\u786E\u8BA4\u540E\u8C03\u7528 action=confirm\u3002\u9009\u62E9\u8C03\u6574\u65F6\u76F4\u63A5\u8C03\u7528 action=propose_question\uFF0C\u53EA\u8FFD\u95EE\u53D7\u5F71\u54CD\u7684\u4E00\u9879\uFF1B\u65E7\u7B80\u62A5\u4F1A\u5931\u6548\uFF0C\u56DE\u7B54\u540E\u5FC5\u987B\u91CD\u65B0 synthesize \u5B8C\u6574\u7B80\u62A5\u3002`);
        }
        if (value.status === "confirmed") {
          const drawingPlan = value.drawingPlan;
          return text(`${continuation(value)} status=confirmed boardName=${value.boardName ?? ""} activeBoard=${value.activeBoard ?? ""} nextAction=${value.nextAction ?? "draw2code_update"} drawingNextAction=${drawingPlan?.nextActionCode ?? "write_pages"} allowedPageIds=${(drawingPlan?.allowedPageIds ?? []).join(",")} remainingPageIds=${(drawingPlan?.remainingPageIds ?? []).join(",")}
\u9879\u76EE\u300C${value.projectName ?? ""}\u300D\u5DF2\u786E\u8BA4\uFF0C\u72EC\u7ACB\u753B\u677F\u5DF2\u521B\u5EFA\u3002\u5FC5\u987B\u4E25\u683C\u6267\u884C drawingPlan\uFF1A\u5F53 drawingNextAction=write_representative \u65F6\uFF0C\u672C\u8F6E\u53EA\u4E3A allowedPageIds \u751F\u6210 ops\uFF1B\u5199\u5165\u540E\u7B49\u5F85\u753B\u5E03\u53EF\u89C1\uFF0C\u518D\u7528 draw2code_update action=review \u548C\u8FD4\u56DE\u7684 reviewToken \u8BB0\u5F55 representative \u590D\u6838\uFF0C\u968F\u540E\u624D\u751F\u6210 remainingPageIds\u3002\u4E0D\u8981\u9884\u5148\u751F\u6210\u5168\u90E8\u9875\u9762\u7684\u5927\u6279 ops\u3002\u6700\u7EC8\u7528 action=review phase=final \u6536\u53E3\uFF0C\u53EA\u6709 completionReady=true \u624D\u80FD\u62A5\u544A\u5B8C\u6210\u3002\u6BCF\u4E2A\u91CD\u590D\u5185\u5BB9\u7EC4\u4EF6\u81F3\u5C11\u63D0\u4F9B 3 \u6761\u53EF\u89C1 mock \u6570\u636E\uFF0C\u4E0D\u8981\u56DE\u5199\u65E7\u753B\u677F\u3002`);
        }
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
      if (draft.status !== "draft" && ["propose_question", "synthesize", "skip", "answer", "revise"].includes(args.action)) {
        return errorResponse("project_not_editable", `\u9879\u76EE\u5F53\u524D\u72B6\u6001\u4E3A ${draft.status}\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u4FEE\u6539\u53D1\u73B0\u95EE\u9898\u6216\u9879\u76EE\u7B80\u62A5`, draft);
      }
      if (args.action === "resume") {
        if (draft.flowVersion === void 0 && draft.status === "draft" && draft.brief === null) {
          const expectedRevision = draft.revision;
          migrateLegacyDraft(draft);
          return persistMutation(projects, args.root, draft, expectedRevision, key, responseFor(projects, draft));
        }
        return responseFor(projects, draft);
      }
      if (args.action === "propose_question") {
        if (draft.flowVersion !== CREATE_FLOW_VERSION) return errorResponse("legacy_upgrade_required", "\u8BF7\u5148\u7528 action=resume \u5347\u7EA7\u65E7\u9879\u76EE\u8349\u7A3F", draft);
        if (typeof args.revision !== "number") return errorResponse("invalid_action", "action=propose_question requires revision", draft);
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        if (draft.currentQuestion !== null) return errorResponse("question_pending", "\u8BF7\u5148\u56DE\u7B54\u5F53\u524D\u95EE\u9898\uFF0C\u518D\u63D0\u51FA\u4E0B\u4E00\u9898", draft);
        const discovery = draft.discovery;
        const isReadyAdjustment = draft.brief !== null;
        const validated = validateAdaptiveQuestion(normalizeStructuredArg(args.question), discovery, { allowAdjustment: isReadyAdjustment });
        if (!validated.ok) return errorResponse(validated.code, validated.message, draft);
        draft.brief = null;
        draft.briefMarkdown = null;
        draft.currentQuestion = validated.question;
        draft.discovery = refreshDiscovery({
          ...discovery,
          questions: [...discovery.questions, validated.question],
          adjustmentQuestionIds: isReadyAdjustment ? [.../* @__PURE__ */ new Set([...discovery.adjustmentQuestionIds ?? [], validated.question.id])] : discovery.adjustmentQuestionIds ?? [],
          stopReason: null
        });
        addHistory(draft, "propose-question", validated.question.id);
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
      }
      if (args.action === "synthesize") {
        if (draft.flowVersion !== CREATE_FLOW_VERSION) return errorResponse("legacy_upgrade_required", "\u8BF7\u5148\u7528 action=resume \u5347\u7EA7\u65E7\u9879\u76EE\u8349\u7A3F", draft);
        if (typeof args.revision !== "number") return errorResponse("invalid_action", "action=synthesize requires revision", draft);
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        if (typeof args.stopReason !== "string" || args.stopReason.trim() === "") return errorResponse("invalid_action", "action=synthesize requires stopReason", draft);
        let discovery = draft.discovery;
        if (draft.currentQuestion !== null) {
          const pending = draft.currentQuestion;
          const prefix = `${pending.id}\uFF1A`;
          draft.answers[pending.id] = { questionId: pending.id, values: ["unknown"], confirmed: true };
          discovery = refreshDiscovery({
            ...discovery,
            assumptions: [
              ...discovery.assumptions.filter((item) => !item.startsWith(prefix)),
              `${prefix}${pending.text}\uFF08\u7528\u6237\u9009\u62E9\u76F4\u63A5\u6574\u7406\uFF0C\u5F53\u524D\u95EE\u9898\u672A\u56DE\u7B54\uFF09`
            ]
          });
          addHistory(draft, "skip-for-synthesize", pending.id, ["unknown"]);
        }
        const normalizedBrief = normalizeStructuredArg(args.brief);
        const briefObject = typeof normalizedBrief === "object" && normalizedBrief !== null && !Array.isArray(normalizedBrief) ? clone2(normalizedBrief) : normalizedBrief;
        if (typeof briefObject === "object" && briefObject !== null && !Array.isArray(briefObject)) {
          const briefRecord = briefObject;
          const pending = Array.isArray(briefRecord.pendingDecisions) ? briefRecord.pendingDecisions.filter((item) => typeof item === "string") : [];
          briefRecord.pendingDecisions = [.../* @__PURE__ */ new Set([...pending, ...discovery.assumptions])];
        }
        const validated = validatePrototypeBrief(briefObject, draft.deferredStyleNote);
        if (!validated.ok) return errorResponse(validated.code, validated.message, draft);
        draft.discovery = {
          ...discovery,
          nextAction: "synthesize",
          stopReason: args.stopReason.trim()
        };
        draft.currentQuestion = null;
        draft.brief = validated.brief;
        draft.briefMarkdown = validated.markdown;
        addHistory(draft, "synthesize");
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
      }
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
      if (args.action === "skip") {
        if (typeof args.revision !== "number" || typeof args.questionId !== "string") {
          return errorResponse("invalid_action", "action=skip requires revision and questionId", draft);
        }
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        if (draft.flowVersion !== CREATE_FLOW_VERSION || draft.currentQuestion === null) return errorResponse("question_not_pending", "\u5F53\u524D\u6CA1\u6709\u53EF\u4EE5\u8DF3\u8FC7\u7684\u95EE\u9898", draft);
        const question2 = draft.currentQuestion;
        if (question2.id !== args.questionId) return errorResponse("invalid_question", `question "${args.questionId}" is not pending`, draft);
        const discovery = draft.discovery;
        const prefix = `${question2.id}\uFF1A`;
        draft.answers[question2.id] = { questionId: question2.id, values: ["unknown"], confirmed: true };
        draft.discovery = refreshDiscovery({
          ...discovery,
          assumptions: [
            ...discovery.assumptions.filter((item) => !item.startsWith(prefix)),
            `${prefix}${question2.text}\uFF08\u7528\u6237\u8DF3\u8FC7\uFF0C\u4FDD\u7559\u4E3A\u5F85\u9A8C\u8BC1\u5047\u8BBE\uFF09`
          ],
          openDimensions: question2.dimension === void 0 ? discovery.openDimensions : [.../* @__PURE__ */ new Set([...discovery.openDimensions, question2.dimension])]
        });
        draft.currentQuestion = null;
        draft.brief = null;
        draft.briefMarkdown = null;
        addHistory(draft, "skip", question2.id, ["unknown"]);
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
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
        if (draft.flowVersion !== CREATE_FLOW_VERSION) {
          draft.brief = buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote);
        }
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
      if (args.action === "answer" && (draft.currentQuestion === null || draft.currentQuestion.id !== args.questionId)) {
        return errorResponse("historical_answer_requires_revise", "action=answer \u53EA\u80FD\u56DE\u7B54\u5F53\u524D\u95EE\u9898\uFF1B\u4FEE\u6539\u5386\u53F2\u7B54\u6848\u5FC5\u987B\u4F7F\u7528 action=revise", draft);
      }
      const question = questionFromDraft(draft, args.questionId);
      if (question === null) return errorResponse("invalid_question", `question "${args.questionId}" is not valid for this project`, draft);
      const validation = validateValues(question, args.values, args.otherText);
      if (validation !== null) return errorResponse("invalid_option", validation, draft);
      if (draft.flowVersion === CREATE_FLOW_VERSION && question.kind === "choice") {
        if (args.values.includes("synthesize-now")) {
          const discovery2 = draft.discovery;
          const prefix = `${question.id}\uFF1A`;
          draft.answers[question.id] = { questionId: question.id, values: ["unknown"], confirmed: true };
          draft.discovery = {
            ...refreshDiscovery({
              ...discovery2,
              assumptions: [
                ...discovery2.assumptions.filter((item) => !item.startsWith(prefix)),
                `${prefix}${question.text}\uFF08\u7528\u6237\u9009\u62E9\u76F4\u63A5\u6574\u7406\uFF0C\u4FDD\u7559\u4E3A\u5F85\u9A8C\u8BC1\u5047\u8BBE\uFF09`
              ],
              openDimensions: question.dimension === void 0 ? discovery2.openDimensions : [.../* @__PURE__ */ new Set([...discovery2.openDimensions, question.dimension])]
            }),
            nextAction: "synthesize",
            stopReason: "\u7528\u6237\u9009\u62E9\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5"
          };
          draft.currentQuestion = null;
          draft.brief = null;
          draft.briefMarkdown = null;
          addHistory(draft, "synthesize-now", question.id, args.values);
          return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
        }
        const selected = question.options.find((option) => option.id === args.values[0]);
        const answerText = args.values.includes("other") ? args.otherText?.trim() ?? "" : selected?.label ?? args.values[0];
        draft.answers[question.id] = {
          questionId: question.id,
          values: args.values,
          ...args.values.includes("other") ? { otherText: args.otherText?.trim() ?? "" } : {},
          confirmed: true
        };
        let discovery = draft.discovery;
        if (args.action === "revise") {
          const invalidated = removeDependentQuestions(discovery, question.id);
          discovery = invalidated.discovery;
          for (const id of invalidated.removedIds) delete draft.answers[id];
        }
        const decisionPrefix = `${question.id}\uFF1A`;
        const resolvedDecisions = discovery.resolvedDecisions.filter((item) => !item.startsWith(decisionPrefix));
        const assumptions = discovery.assumptions.filter((item) => !item.startsWith(decisionPrefix));
        const openDimensions = question.dimension === void 0 ? discovery.openDimensions : args.values.includes("unknown") ? [.../* @__PURE__ */ new Set([...discovery.openDimensions, question.dimension])] : discovery.openDimensions.filter((dimension) => dimension !== question.dimension);
        if (args.values.includes("unknown")) assumptions.push(`${decisionPrefix}${question.text}\uFF08\u7528\u6237\u6682\u672A\u51B3\u5B9A\uFF09`);
        else resolvedDecisions.push(`${decisionPrefix}${answerText}`);
        draft.discovery = refreshDiscovery({ ...discovery, resolvedDecisions, assumptions, openDimensions });
        draft.currentQuestion = null;
        draft.brief = null;
        draft.briefMarkdown = null;
        addHistory(draft, args.action, question.id, args.values, args.otherText);
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
      }
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

// src/prototype-page.ts
function str(value) {
  return typeof value === "string" ? value : "";
}
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function customData(element) {
  return typeof element?.customData === "object" && element.customData !== null ? element.customData : {};
}
function role(element) {
  return str(customData(element).role).trim().toLowerCase();
}
function containsPoint(page, x, y, tolerance = 0) {
  return x >= page.bounds.x - tolerance && y >= page.bounds.y - tolerance && x <= page.bounds.x + page.bounds.width + tolerance && y <= page.bounds.y + page.bounds.height + tolerance;
}
function pageDistance(page, x, y) {
  const right = page.bounds.x + page.bounds.width;
  const bottom = page.bounds.y + page.bounds.height;
  const dx = x < page.bounds.x ? page.bounds.x - x : x > right ? x - right : 0;
  const dy = y < page.bounds.y ? page.bounds.y - y : y > bottom ? y - bottom : 0;
  return Math.hypot(dx, dy);
}
function isPrototypePageLabel(element) {
  return str(element.type) === "text" && role(element) === "prototype-page-label";
}
function isPrototypePageShell(element) {
  return str(element.type) === "rectangle" && role(element) === "prototype-page" && str(customData(element).pageName).trim() !== "";
}
function prototypePageName(element) {
  if (str(element.type) === "frame") return str(element.name).trim();
  return isPrototypePageShell(element) ? str(customData(element).pageName).trim() : "";
}
function prototypePages(elements) {
  const pages = [];
  const names = /* @__PURE__ */ new Set();
  for (const element of elements) {
    const type = str(element.type);
    const pageName = prototypePageName(element);
    if (pageName === "" || names.has(pageName)) continue;
    names.add(pageName);
    pages.push({
      id: str(element.id),
      name: pageName,
      kind: type === "frame" ? "legacy-frame" : "page-shell",
      bounds: {
        x: num(element.x),
        y: num(element.y),
        width: num(element.width),
        height: num(element.height)
      },
      element
    });
  }
  return pages;
}
function pageNameWarnings(elements) {
  const firstByName = /* @__PURE__ */ new Map();
  const warnings = [];
  for (const element of elements) {
    const name2 = prototypePageName(element);
    if (name2 === "") continue;
    const firstId = firstByName.get(name2);
    if (firstId === void 0) {
      firstByName.set(name2, str(element.id));
      continue;
    }
    warnings.push({
      code: "page-name-duplicate",
      id: str(element.id),
      message: `\u9875\u9762\u300C${name2}\u300D\u540C\u65F6\u7528\u4E8E ${firstId} \u548C ${str(element.id)}\uFF0C\u65E0\u6CD5\u6309\u9875\u9762\u540D\u552F\u4E00\u9009\u62E9\uFF1B\u8BF7\u4E3A\u5176\u4E2D\u4E00\u4E2A\u9875\u9762\u8BBE\u7F6E\u4E0D\u540C\u540D\u79F0`
    });
  }
  return warnings;
}
function pageMembershipCandidates(element, pages) {
  const id = str(element.id);
  const ownPage = pages.find((page) => page.id === id);
  if (ownPage !== void 0) return [ownPage];
  if (isPrototypePageLabel(element)) {
    const page = pages.find((candidate) => candidate.id === str(customData(element).pageId));
    return page === void 0 ? [] : [page];
  }
  const explicitFrame = str(element.frameId);
  if (explicitFrame !== "") {
    const page = pages.find((candidate) => candidate.kind === "legacy-frame" && candidate.id === explicitFrame);
    if (page !== void 0) return [page];
  }
  const centerX = num(element.x) + num(element.width) / 2;
  const centerY = num(element.y) + num(element.height) / 2;
  return pages.filter((page) => containsPoint(page, centerX, centerY, 2));
}
function pageForElement(element, pages) {
  const candidates = pageMembershipCandidates(element, pages);
  return candidates.length === 1 ? candidates[0] : void 0;
}
function arrowEndpoint(arrow, atEnd) {
  const points = Array.isArray(arrow.points) ? arrow.points : [];
  const point = Array.isArray(atEnd ? points.at(-1) : points[0]) ? atEnd ? points.at(-1) : points[0] : atEnd ? [num(arrow.width), num(arrow.height)] : [0, 0];
  return { x: num(arrow.x) + num(point[0]), y: num(arrow.y) + num(point[1]) };
}
function endpointPage(arrow, bindingKey, pages, elementsById) {
  const binding = typeof arrow[bindingKey] === "object" && arrow[bindingKey] !== null ? arrow[bindingKey] : {};
  const target = elementsById.get(str(binding.elementId));
  if (target !== void 0) {
    return pageForElement(target, pages);
  }
  const endpoint = arrowEndpoint(arrow, bindingKey === "endBinding");
  const contained = pages.filter((page) => containsPoint(page, endpoint.x, endpoint.y, 2));
  if (contained.length === 1) return contained[0];
  if (contained.length > 1) return void 0;
  return pages.map((page) => ({ page, distance: pageDistance(page, endpoint.x, endpoint.y) })).filter(({ distance }) => distance <= 48).sort((left, right) => left.distance - right.distance)[0]?.page;
}
function internalPageForArrow(arrow, pages, elementsById) {
  const source = endpointPage(arrow, "startBinding", pages, elementsById);
  const target = endpointPage(arrow, "endBinding", pages, elementsById);
  return source !== void 0 && target?.id === source.id ? source : void 0;
}
function relationForArrow(arrow, pages, elementsById) {
  if (str(arrow.type) !== "arrow") return void 0;
  const source = endpointPage(arrow, "startBinding", pages, elementsById);
  const target = endpointPage(arrow, "endBinding", pages, elementsById);
  if (source === void 0 || target === void 0 || source.id === target.id) return void 0;
  const startBinding = typeof arrow.startBinding === "object" && arrow.startBinding !== null ? arrow.startBinding : {};
  const endBinding = typeof arrow.endBinding === "object" && arrow.endBinding !== null ? arrow.endBinding : {};
  const label = [...elementsById.values()].find((element) => {
    return str(element.type) === "text" && str(element.containerId) === str(arrow.id);
  });
  return {
    id: str(arrow.id),
    sourcePage: source.name,
    targetPage: target.name,
    ...str(startBinding.elementId) === "" ? {} : { sourceElementId: str(startBinding.elementId) },
    ...str(endBinding.elementId) === "" ? {} : { targetElementId: str(endBinding.elementId) },
    ...str(label?.text).trim() === "" ? {} : { label: str(label?.text).trim() }
  };
}
function prototypePageRelations(elements, pages = prototypePages(elements)) {
  const elementsById = new Map(elements.map((element) => [str(element.id), element]));
  return elements.filter((element) => str(element.type) === "arrow").flatMap((arrow) => {
    const relation = relationForArrow(arrow, pages, elementsById);
    return relation === void 0 ? [] : [relation];
  });
}
function pageElementIds(page, elements, pages = prototypePages(elements)) {
  const elementsById = new Map(elements.map((element) => [str(element.id), element]));
  const crossPageArrowIds = new Set(
    prototypePageRelations(elements, pages).map((relation) => relation.id)
  );
  return elements.flatMap((element) => {
    if (str(element.id) === page.id || isPrototypePageLabel(element)) return [];
    if (str(element.type) === "text" && crossPageArrowIds.has(str(element.containerId))) return [];
    if (str(element.type) === "arrow") {
      const relation = relationForArrow(element, pages, elementsById);
      if (relation !== void 0) return [];
      const internalPage = internalPageForArrow(element, pages, elementsById);
      if (internalPage !== void 0) return internalPage.id === page.id ? [str(element.id)] : [];
    }
    return pageForElement(element, pages)?.id === page.id ? [str(element.id)] : [];
  });
}
function pageMembershipWarnings(elements, pages = prototypePages(elements)) {
  return elements.flatMap((element) => {
    if (pages.some((page) => page.id === str(element.id)) || isPrototypePageLabel(element) || str(element.type) === "arrow") return [];
    const candidates = pageMembershipCandidates(element, pages);
    if (candidates.length <= 1) return [];
    return [{
      code: "page-membership-ambiguous",
      id: str(element.id),
      message: `${str(element.id)} \u540C\u65F6\u843D\u5728\u9875\u9762\u300C${candidates.map((page) => page.name).join("\u300D\u300C")}\u300D\u4E2D\uFF0C\u65E0\u6CD5\u552F\u4E00\u5224\u65AD\u9875\u9762\u5F52\u5C5E\uFF1B\u8BF7\u79FB\u52A8\u9875\u9762\u6216\u5143\u7D20\u4EE5\u6D88\u9664\u91CD\u53E0`
    }];
  });
}
function publicPrototypePages(elements, pages = prototypePages(elements)) {
  return pages.map((page) => ({
    id: page.id,
    name: page.name,
    kind: page.kind,
    bounds: page.bounds,
    elementIds: pageElementIds(page, elements, pages)
  }));
}

// src/layout.ts
var SHAPE_TYPES = /* @__PURE__ */ new Set(["rectangle", "diamond", "ellipse"]);
var BOTTOM_NAV_MAX_GAP = 96;
var DEFAULT_MOCK_DATA_MIN = 3;
var BOTTOM_NAVIGATION_ITEM_ROLES2 = /* @__PURE__ */ new Set(["bottom-navigation-item", "bottom-nav-item"]);
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
var CONTENT_WARNING_CODES = /* @__PURE__ */ new Set([
  "page-content-too-sparse",
  "page-content-too-dense",
  "above-fold-content-insufficient",
  "continuous-empty-space-too-large",
  "status-emphasis-missing",
  "primary-action-missing",
  "primary-action-ambiguous",
  "visual-hierarchy-flat"
]);
function str2(value) {
  return typeof value === "string" ? value : "";
}
function num2(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function customData2(element) {
  return typeof element.customData === "object" && element.customData !== null ? element.customData : {};
}
function isFocused(element, focusIds) {
  if (focusIds === void 0) return true;
  const id = str2(element.id);
  const frameId = str2(element.frameId);
  const pageId = str2(customData2(element).pageId);
  return focusIds.has(id) || frameId !== "" && focusIds.has(frameId) || pageId !== "" && focusIds.has(pageId);
}
function glyphUnits(value) {
  let units = 0;
  for (const char of value) {
    units += /[\u2e80-\u9fff\uff00-\uffef]/u.test(char) ? 1 : char === " " ? 0.35 : 0.55;
  }
  return units;
}
function estimatedLineCount(element) {
  const text3 = str2(element.text);
  if (text3 === "") return 1;
  const width = Math.max(1, num2(element.width, 160));
  const fontSize = Math.max(8, num2(element.fontSize, 20));
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.62)));
  return text3.split(/\r?\n/u).reduce((count, line) => {
    return count + Math.max(1, Math.ceil(glyphUnits(line) / charsPerLine));
  }, 0);
}
function pageFor(element, pages) {
  return pageForElement(element, pages);
}
function isBottomNavigation(element) {
  const role2 = str2(customData2(element).role).toLowerCase();
  if (role2 === "bottom-navigation" || role2 === "bottom-nav" || role2 === "tabbar") return true;
  return /底部导航|底部选项卡|tabbar|bottom[ -]?navigation/iu.test(str2(element.text));
}
function isBottomNavigationMember(element) {
  return isBottomNavigation(element) || BOTTOM_NAVIGATION_ITEM_ROLES2.has(str2(customData2(element).role).toLowerCase());
}
function isVisibleMockData(element) {
  if (str2(element.type) !== "text" || str2(customData2(element).role).toLowerCase() !== "mock-data") return false;
  const value = str2(element.text).trim();
  if (value.length < 2) return false;
  return !/^(?:lorem ipsum|用户[a-c1-3]?|好友[a-c1-3]?|昵称|标题|内容|消息|示例|item\s*\d*|\.\.\.|…+)$/iu.test(value);
}
function issue(code, element, message) {
  const id = str2(element.id);
  return { code, ...id !== "" ? { id } : {}, message };
}
function inspectPrototypeLayout(elements, options = {}) {
  const pages = prototypePages(elements);
  const pageIds = new Set(pages.map((page) => page.id));
  const elementById = new Map(elements.map((element) => [str2(element.id), element]));
  const bottomNavigationShells = elements.filter((element) => SHAPE_TYPES.has(str2(element.type)) && isBottomNavigation(element));
  const errors = [];
  const warnings = [
    ...pageNameWarnings(elements),
    ...pageMembershipWarnings(elements, pages)
  ];
  for (const element of elements) {
    const type = str2(element.type);
    if (pageIds.has(str2(element.id)) || !isFocused(element, options.focusIds)) continue;
    const text3 = str2(element.text);
    if (SHAPE_TYPES.has(type) && text3.trim() !== "") {
      errors.push(issue(
        "shape-text-not-visible",
        element,
        `${str2(element.id)} is a ${type} with text, but shape text is not a visible label in Excalidraw; add a separate text element and optionally set containerId to ${str2(element.id)}`
      ));
    }
    if (type === "text" && text3 !== "") {
      const containerId = str2(element.containerId);
      const container = containerId === "" ? void 0 : elementById.get(containerId);
      const boundToShape = container !== void 0 && SHAPE_TYPES.has(str2(container.type));
      const directlyFocused = options.focusIds === void 0 || options.focusIds.has(str2(element.id)) || container !== void 0 && options.focusIds.has(str2(container.id));
      const elementRole3 = str2(customData2(element).role).toLowerCase();
      const containerRole = str2(customData2(container ?? {}).role).toLowerCase();
      const componentRole = elementRole3 || containerRole;
      if (containerId !== "" && container === void 0 && directlyFocused) {
        errors.push(issue(
          "container-target-missing",
          element,
          `${str2(element.id)} points to missing container ${containerId}; add the target shape or clear containerId so the label remains visible`
        ));
      }
      if (boundToShape && directlyFocused && componentRole === "") {
        errors.push(issue(
          "component-role-missing",
          element,
          `${str2(element.id)} is bound to ${containerId} without a semantic customData.role; mark the component as button, primary-action, select, input, chip, card, or another explicit product role so draw2code_update can apply the correct text alignment`
        ));
      }
      const bottomNavigationShell = bottomNavigationShells.find((shell) => {
        return num2(element.x) >= num2(shell.x) - 2 && num2(element.y) >= num2(shell.y) - 2 && num2(element.x) + num2(element.width) <= num2(shell.x) + num2(shell.width) + 2 && num2(element.y) + num2(element.height) <= num2(shell.y) + num2(shell.height) + 2;
      });
      const navigationItemFocused = options.focusIds === void 0 || options.focusIds.has(str2(element.id)) || bottomNavigationShell !== void 0 && options.focusIds.has(str2(bottomNavigationShell.id));
      if (bottomNavigationShell !== void 0 && navigationItemFocused && !BOTTOM_NAVIGATION_ITEM_ROLES2.has(elementRole3)) {
        errors.push(issue(
          "bottom-navigation-item-role-missing",
          element,
          `${str2(element.id)} is inside bottom navigation ${str2(bottomNavigationShell.id)} without customData.role=bottom-navigation-item; add the item role so its label is centered within its navigation slot`
        ));
      }
      const lines = estimatedLineCount(element);
      const fontSize = Math.max(8, num2(element.fontSize, 20));
      const lineHeight = Math.max(1, num2(element.lineHeight, 1.25));
      const requiredHeight = Math.ceil(lines * fontSize * lineHeight + 8);
      const explicitHeight = typeof element.height === "number" && Number.isFinite(element.height);
      if (lines > 1 && explicitHeight && num2(element.height) + 2 < requiredHeight) {
        errors.push(issue(
          "text-height-overflow",
          element,
          `${str2(element.id)} text height ${Math.round(num2(element.height))} cannot contain approximately ${lines} lines; use height >= ${requiredHeight} or split the component into separate text elements`
        ));
      }
    }
    const page = pageFor(element, pages);
    if (page !== void 0 && !isPrototypePageLabel(element) && type !== "arrow" && type !== "line") {
      const x1 = num2(element.x);
      const y1 = num2(element.y);
      const x2 = x1 + num2(element.width);
      const y2 = y1 + num2(element.height);
      const fx = page.bounds.x;
      const fy = page.bounds.y;
      const right = fx + page.bounds.width;
      const bottom = fy + page.bounds.height;
      if (x1 < fx - 2 || y1 < fy - 2 || x2 > right + 2 || y2 > bottom + 2) {
        errors.push(issue(
          page.kind === "legacy-frame" ? "frame-overflow" : "page-overflow",
          element,
          `${str2(element.id)} extends outside page ${page.name || page.id}; keep the complete component inside its page boundary`
        ));
      }
    }
    if (isBottomNavigation(element)) {
      const navPage = pageFor(element, pages);
      if (navPage === void 0) {
        warnings.push(issue(
          "bottom-navigation-unpaged",
          element,
          `${str2(element.id)} is marked as bottom navigation but is not inside a prototype page`
        ));
      } else {
        const pageBottom = navPage.bounds.y + navPage.bounds.height;
        const navBottom = num2(element.y) + num2(element.height);
        const gap = pageBottom - navBottom;
        if (gap > BOTTOM_NAV_MAX_GAP) {
          errors.push(issue(
            "bottom-navigation-offset",
            element,
            `${str2(element.id)} is ${Math.round(gap)}px above the page bottom; place the bottom navigation in the bottom safe area (gap <= ${BOTTOM_NAV_MAX_GAP}px)`
          ));
        }
      }
      if (type === "text") {
        errors.push(issue(
          "bottom-navigation-needs-shell",
          element,
          `${str2(element.id)} is a text-only bottom navigation; add a rectangle shell plus separate text labels so the component has a visible boundary and stable geometry`
        ));
      }
    }
  }
  for (const shell of bottomNavigationShells) {
    const items = elements.filter((element) => {
      if (str2(element.type) !== "text" || !BOTTOM_NAVIGATION_ITEM_ROLES2.has(str2(customData2(element).role).toLowerCase())) return false;
      return num2(element.x) >= num2(shell.x) - 2 && num2(element.y) >= num2(shell.y) - 2 && num2(element.x) + num2(element.width) <= num2(shell.x) + num2(shell.width) + 2 && num2(element.y) + num2(element.height) <= num2(shell.y) + num2(shell.height) + 2;
    });
    const shellFocused = isFocused(shell, options.focusIds) || items.some((item) => isFocused(item, options.focusIds));
    if (!shellFocused) continue;
    if (items.length === 0) {
      errors.push(issue(
        "bottom-navigation-items-missing",
        shell,
        `${str2(shell.id)} has no visible bottom-navigation-item labels; add separate text items inside the navigation shell`
      ));
      continue;
    }
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const left = items[leftIndex];
        const right = items[rightIndex];
        const overlaps = num2(left.x) < num2(right.x) + num2(right.width) && num2(left.x) + num2(left.width) > num2(right.x) && num2(left.y) < num2(right.y) + num2(right.height) && num2(left.y) + num2(left.height) > num2(right.y);
        if (!overlaps) continue;
        errors.push(issue(
          "bottom-navigation-item-overlap",
          shell,
          `${str2(left.id)} overlaps ${str2(right.id)} inside ${str2(shell.id)}; give each navigation item its own non-overlapping slot`
        ));
      }
    }
  }
  for (const page of pages) {
    const pageElement = page.element;
    if (str2(customData2(pageElement).role).toLowerCase() !== "prototype-page" || !isFocused(pageElement, options.focusIds)) continue;
    const configuredMinimum = num2(customData2(pageElement).mockDataMin, DEFAULT_MOCK_DATA_MIN);
    const minimum = Math.max(1, Math.floor(configuredMinimum));
    const records = new Set(
      elements.filter((element) => pageFor(element, pages)?.id === page.id && isVisibleMockData(element)).map((element) => str2(element.text).trim())
    );
    if (records.size < minimum) {
      errors.push(issue(
        "mock-data-insufficient",
        pageElement,
        `${page.name || page.id} requires ${minimum} visible mock-data text records; found ${records.size}. Add realistic example names, values, statuses or messages instead of empty boxes and mark each text with customData.role=mock-data`
      ));
    }
  }
  return { errors, warnings };
}
function elementRole(element) {
  return str2(customData2(element).role).trim().toLowerCase();
}
function isPageContent(element, page) {
  const type = str2(element.type);
  if (str2(element.id) === page.id || isPrototypePageLabel(element)) return false;
  if (type === "arrow" || type === "line" || type === "freedraw") return false;
  return num2(element.width) > 0 && num2(element.height) > 0;
}
function qualityIssue(code, page, message) {
  return { code, id: page.id, message };
}
function pageQualityWarnings(page, members) {
  const warnings = [];
  const content = members.filter((element) => isPageContent(element, page));
  const texts = content.filter((element) => str2(element.type) === "text" && str2(element.text).trim() !== "");
  const shapes = content.filter((element) => SHAPE_TYPES.has(str2(element.type)));
  const elementById = new Map(members.map((element) => [str2(element.id), element]));
  const pageTop = page.bounds.y;
  const pageBottom = page.bounds.y + page.bounds.height;
  const aboveFoldBottom = pageTop + page.bounds.height * 0.58;
  const aboveFold = content.filter((element) => num2(element.y) < aboveFoldBottom);
  if (content.length < 8) {
    warnings.push(qualityIssue(
      "page-content-too-sparse",
      page,
      `${page.name} only has ${content.length} visible content elements; add the information needed to understand the page's main task without falling back to empty space`
    ));
  }
  if (content.length > 52) {
    warnings.push(qualityIssue(
      "page-content-too-dense",
      page,
      `${page.name} has ${content.length} visible content elements; group or defer secondary information so the first screen stays scannable`
    ));
  }
  if (aboveFold.length < 4) {
    warnings.push(qualityIssue(
      "above-fold-content-insufficient",
      page,
      `${page.name} has only ${aboveFold.length} meaningful elements in the first screen; expose the page heading, current state, key content, and primary action above the fold`
    ));
  }
  const verticalBoxes = content.map((element) => ({ top: Math.max(pageTop, num2(element.y)), bottom: Math.min(pageBottom, num2(element.y) + num2(element.height)) })).sort((left, right) => left.top - right.top);
  let largestGap = verticalBoxes.length === 0 ? page.bounds.height : Math.max(0, verticalBoxes[0].top - pageTop);
  let coveredBottom = pageTop;
  for (const box of verticalBoxes) {
    largestGap = Math.max(largestGap, box.top - coveredBottom);
    coveredBottom = Math.max(coveredBottom, box.bottom);
  }
  largestGap = Math.max(largestGap, pageBottom - coveredBottom);
  if (largestGap > page.bounds.height * 0.34) {
    warnings.push(qualityIssue(
      "continuous-empty-space-too-large",
      page,
      `${page.name} contains an unexplained vertical empty region of about ${Math.round(largestGap)}px; rebalance the content flow or reserve the space with an explicit product purpose`
    ));
  }
  const fontSizes = texts.map((element) => num2(element.fontSize, 20));
  if (fontSizes.length >= 4 && Math.max(...fontSizes) - Math.min(...fontSizes) < 4) {
    warnings.push(qualityIssue(
      "text-scale-flat",
      page,
      `${page.name} uses nearly one text size for headings, content, and metadata; create at least a clear heading/body/supporting-text hierarchy`
    ));
  }
  const primaryActions = content.filter((element) => PRIMARY_ACTION_ROLES.has(elementRole(element)));
  const primaryActionIds = new Set(primaryActions.map((element) => str2(element.containerId) || str2(element.id)));
  if (primaryActionIds.size === 0) {
    warnings.push(qualityIssue(
      "primary-action-missing",
      page,
      `${page.name} has no semantic primary action; mark the one action that advances the page's core task with customData.role=primary-action`
    ));
  } else if (primaryActionIds.size > 1) {
    warnings.push(qualityIssue(
      "primary-action-ambiguous",
      page,
      `${page.name} exposes ${primaryActionIds.size} primary actions; keep one dominant action and demote the rest`
    ));
  }
  const statusTexts = texts.filter((element) => /进行中|待处理|已完成|已逾期|失败|成功|警告|异常|高优先级|低优先级/iu.test(str2(element.text)));
  const hasSemanticTone = (element) => {
    const ownTone = str2(customData2(element).tone).toLowerCase();
    if (ownTone !== "" && ownTone !== "neutral") return true;
    const container = elementById.get(str2(element.containerId));
    const containerTone = container === void 0 ? "" : str2(customData2(container).tone).toLowerCase();
    return containerTone !== "" && containerTone !== "neutral";
  };
  if (statusTexts.some((element) => !hasSemanticTone(element))) {
    warnings.push(qualityIssue(
      "status-emphasis-missing",
      page,
      `${page.name} contains status or priority text without emphasis on that status element or its bound container; use restrained success, warning, danger, or info tone to support fast scanning`
    ));
  }
  if (shapes.length >= 4) {
    const visualSignatures = new Set(shapes.map((element) => {
      const data = customData2(element);
      return [str2(data.tone).toLowerCase() || "neutral", str2(element.backgroundColor) || "transparent", str2(element.strokeWidth) || "1"].join("|");
    }));
    if (visualSignatures.size <= 1) {
      warnings.push(qualityIssue(
        "visual-hierarchy-flat",
        page,
        `${page.name} gives all major blocks the same fill, tone, and border weight; soften secondary regions and reserve stronger emphasis for the page's primary task`
      ));
    }
  }
  const outlinedShapes = shapes.filter((element) => {
    const background = str2(element.backgroundColor);
    return background === "" || background === "transparent";
  });
  if (shapes.length >= 5 && outlinedShapes.length / shapes.length >= 0.75) {
    warnings.push(qualityIssue(
      "border-overuse",
      page,
      `${page.name} draws ${outlinedShapes.length} of ${shapes.length} shapes as outline-only boxes; use spacing, grouping, and a few semantic fills instead of giving every item equal border weight`
    ));
  }
  for (const element of content) {
    if (!INTERACTIVE_ROLES.has(elementRole(element))) continue;
    if (str2(element.type) === "text") continue;
    if (num2(element.width) < 44 || num2(element.height) < 44) {
      warnings.push(issue(
        "tap-target-too-small",
        element,
        `${str2(element.id)} is ${Math.round(num2(element.width))}\xD7${Math.round(num2(element.height))}px; interactive controls should provide at least a 44\xD744px touch target`
      ));
    }
  }
  const leftOffsets = content.filter((element) => !isBottomNavigationMember(element) && num2(element.width) > page.bounds.width * 0.5).map((element) => Math.round(num2(element.x) - page.bounds.x));
  if (leftOffsets.length >= 4 && Math.max(...leftOffsets) - Math.min(...leftOffsets) > 20) {
    warnings.push(qualityIssue(
      "page-margin-inconsistent",
      page,
      `${page.name} uses inconsistent main-content left margins (${Math.min(...leftOffsets)}\u2013${Math.max(...leftOffsets)}px); align repeated blocks to a stable page grid`
    ));
  }
  const heightsByRole = /* @__PURE__ */ new Map();
  for (const element of content) {
    const role2 = elementRole(element);
    if (role2 === "") continue;
    const values = heightsByRole.get(role2) ?? [];
    values.push(num2(element.height));
    heightsByRole.set(role2, values);
  }
  for (const [role2, heights] of heightsByRole.entries()) {
    if (heights.length < 3 || Math.max(...heights) - Math.min(...heights) <= 8) continue;
    warnings.push(qualityIssue(
      "repeated-control-rhythm-inconsistent",
      page,
      `${page.name} repeats role=${role2} with heights from ${Math.round(Math.min(...heights))}px to ${Math.round(Math.max(...heights))}px; use a consistent component rhythm`
    ));
  }
  return warnings;
}
function inspectPrototypeQuality(elements) {
  const layout = inspectPrototypeLayout(elements);
  const pages = prototypePages(elements);
  const perPage = pages.map((page) => {
    const members = elements.filter((element) => pageForElement(element, pages)?.id === page.id);
    const warnings2 = pageQualityWarnings(page, members);
    return {
      pageId: page.id,
      pageName: page.name,
      qualityScore: Math.max(0, 100 - warnings2.length * 8),
      warnings: warnings2
    };
  });
  const warnings = [...layout.warnings, ...perPage.flatMap((page) => page.warnings)];
  const structurePassed = layout.errors.length === 0 && !layout.warnings.some((warning) => warning.code === "page-membership-ambiguous" || warning.code === "page-name-duplicate");
  const contentPassed = !warnings.some((warning) => CONTENT_WARNING_CODES.has(warning.code));
  return {
    structurePassed,
    contentPassed,
    layoutPassed: layout.errors.length === 0,
    visualReviewRequired: pages.length > 0,
    qualityScore: Math.max(0, 100 - layout.errors.length * 20 - warnings.length * 5),
    warnings,
    pages: perPage
  };
}
function formatLayoutIssues(issues) {
  return issues.map((item) => {
    const value = typeof item === "object" && item !== null ? item : {};
    const code = str2(value.code) || "layout-warning";
    const id = str2(value.id);
    const message = str2(value.message) || JSON.stringify(item);
    return `- ${code}${id === "" ? "" : ` [${id}]`}: ${message}`;
  }).join("\n");
}

// src/tools.ts
function text2(value) {
  return [{ type: "text", text: value }];
}
var MAX_ELEMENTS_JSON = 120 * 1024;
var MAX_READ_DIAGNOSTICS = 20;
var MAX_READ_PAGE_INDEX = 200;
var MAX_READ_RELATIONS = 200;
var SNAPSHOT_CACHE_MAX = 40;
var DEFAULT_BOARD = "prototype";
function str3(value) {
  return typeof value === "string" ? value : "";
}
function num3(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function customData3(value) {
  return typeof value?.customData === "object" && value.customData !== null ? value.customData : {};
}
var boardCache = /* @__PURE__ */ new Map();
var boardHistoryCache = /* @__PURE__ */ new Map();
var pendingReviewWrites = /* @__PURE__ */ new Map();
var PENDING_REVIEW_WRITE_MAX = 20;
var PENDING_REVIEW_WRITE_TTL_MS = 10 * 6e4;
function prunePendingReviewWrites(now2 = Date.now()) {
  for (const [id, pending] of pendingReviewWrites) {
    if (now2 - pending.createdAt > PENDING_REVIEW_WRITE_TTL_MS) pendingReviewWrites.delete(id);
  }
  while (pendingReviewWrites.size >= PENDING_REVIEW_WRITE_MAX) {
    const oldest = [...pendingReviewWrites.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest === void 0) break;
    pendingReviewWrites.delete(oldest.id);
  }
}
function rememberPendingReviewWrite(input) {
  prunePendingReviewWrites();
  const pending = { ...input, id: `pending-${randomUUID2()}`, createdAt: Date.now() };
  pendingReviewWrites.set(pending.id, pending);
  return pending;
}
function pendingReviewWriteFor(root, board, baseRev) {
  prunePendingReviewWrites();
  return [...pendingReviewWrites.values()].filter((pending) => pending.root === root && pending.board === board && Math.abs(pending.baseRev - baseRev) <= 0.5).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}
async function boardOperationalState(store, root, board, revision, scene) {
  const [reveal, representativeReview, history] = await Promise.all([
    store.getBoardReveal(root),
    store.getBoardReview(root, board, "representative"),
    store.versionStorage(root, board)
  ]);
  if (!reveal.ok) throw new Error(`${reveal.error.code}: ${reveal.error.message}`);
  if (!representativeReview.ok) throw new Error(`${representativeReview.error.code}: ${representativeReview.error.message}`);
  if (!history.ok) throw new Error(`${history.error.code}: ${history.error.message}`);
  const currentReveal = reveal.value.request !== null && reveal.value.request.board === board && Math.abs(reveal.value.request.revision - revision) <= 0.5 ? reveal.value.request : null;
  const currentRepresentativeReview = representativeReview.value.receipt !== null && Math.abs(representativeReview.value.receipt.revision - revision) <= 0.5 ? representativeReview.value.receipt : null;
  const pendingWrite = pendingReviewWriteFor(root, board, revision);
  let continuation2;
  if (pendingWrite !== null && currentRepresentativeReview !== null) {
    continuation2 = {
      status: "commit_pending_write",
      pendingUpdateId: pendingWrite.id,
      nextAction: {
        tool: "draw2code_update",
        arguments: { root, name: board, action: "commit_pending", pendingUpdateId: pendingWrite.id }
      }
    };
  } else if (pendingWrite !== null && currentReveal !== null) {
    continuation2 = {
      status: "review_representative",
      reviewToken: currentReveal.id,
      pendingUpdateId: pendingWrite.id,
      canvasAcknowledged: typeof currentReveal.consumedAt === "number",
      nextAction: {
        tool: "draw2code_update",
        arguments: { root, name: board, action: "review", reviewToken: currentReveal.id, phase: "representative" }
      }
    };
  } else if (currentReveal !== null) {
    continuation2 = {
      status: "review_available",
      reviewToken: currentReveal.id,
      canvasAcknowledged: typeof currentReveal.consumedAt === "number",
      nextAction: {
        tool: "draw2code_update",
        arguments: { root, name: board, action: "review", reviewToken: currentReveal.id }
      }
    };
  } else {
    continuation2 = { status: "idle", nextAction: null };
  }
  return {
    capacity: store.measureCapacity(scene),
    history: history.value,
    continuation: continuation2
  };
}
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
    const kind = str3(op.op);
    if (kind === "" && typeof op.element === "object" && op.element !== null) {
      const element = op.element;
      const elementId = str3(element.id);
      if (elementId === "") throw new Error(`${where}.element.id missing or not a string: every element needs a unique non-empty id`);
      return { op: "upsert", elementId, element };
    }
    if (kind === "" && str3(op.id) !== "" && str3(op.type) !== "") {
      return { op: "upsert", elementId: str3(op.id), element: op };
    }
    if (kind === "upsert") {
      if ((op.element === void 0 || op.element === null) && str3(op.id) !== "" && str3(op.type) !== "") {
        const element2 = { ...op };
        delete element2.op;
        return { op: "upsert", elementId: str3(element2.id), element: element2 };
      }
      if (typeof op.element !== "object" || op.element === null) {
        throw new Error(`${where} is "upsert" but missing its element: use {"op":"upsert","element":{"id":"x","type":"rectangle",...}}`);
      }
      const element = op.element;
      const elementId = str3(element.id);
      if (elementId === "") throw new Error(`${where}.element.id missing or not a string: every element needs a unique non-empty id`);
      return { op: "upsert", elementId, element };
    }
    if (kind === "delete") {
      const nestedElement = typeof op.element === "object" && op.element !== null ? op.element : void 0;
      const elementId = str3(op.id) || str3(op.elementId) || str3(nestedElement?.id);
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
function rejectNewPrototypeFrames(currentElements, ops) {
  const existingIds = new Set(currentElements.map((element) => str3(element.id)));
  const candidates = ops.flatMap((op) => {
    if (op.op === "upsert" && op.element !== void 0) return [op.element];
    if (op.op === "replace" && Array.isArray(op.scene?.elements)) {
      return op.scene.elements.filter((item) => typeof item === "object" && item !== null);
    }
    return [];
  });
  const invalid = candidates.find((element) => {
    return str3(element.type) === "frame" && str3(customData3(element).role).trim().toLowerCase() === "prototype-page" && !existingIds.has(str3(element.id));
  });
  if (invalid !== void 0) {
    throw new Error(`prototype-page-frame-deprecated: ${str3(invalid.id)} is a new prototype page using type=frame; use a rectangle with customData.role=prototype-page, customData.pageName, and an external prototype-page-label text instead`);
  }
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
      elements = elements.filter((element) => str3(element.id) !== op.elementId);
      continue;
    }
    if (op.op === "upsert" && op.elementId !== void 0 && op.element !== void 0) {
      const index = elements.findIndex((element) => str3(element.id) === op.elementId);
      if (index === -1) elements.push(op.element);
      else elements[index] = op.element;
    }
  }
  return elements;
}
function fitsInsideFrame(element, frame) {
  const tolerance = 2;
  const left = num3(element.x);
  const top = num3(element.y);
  const right = left + num3(element.width);
  const bottom = top + num3(element.height);
  const frameLeft = num3(frame.x);
  const frameTop = num3(frame.y);
  const frameRight = frameLeft + num3(frame.width);
  const frameBottom = frameTop + num3(frame.height);
  return left >= frameLeft - tolerance && top >= frameTop - tolerance && right <= frameRight + tolerance && bottom <= frameBottom + tolerance;
}
function normalizeFrameLocalCoordinates(currentElements, ops) {
  const prospectiveElements = previewElements(currentElements, ops);
  const frames = /* @__PURE__ */ new Map();
  for (const candidate of prospectiveElements) {
    if (str3(candidate.type) !== "frame" || str3(candidate.id) === "") continue;
    frames.set(str3(candidate.id), normalizeElement(candidate));
  }
  return ops.map((op) => {
    if (op.op !== "upsert" || op.element === void 0 || str3(op.element.type) === "frame") return op;
    const frame = frames.get(str3(op.element.frameId));
    if (frame === void 0) return op;
    const element = normalizeElement(op.element);
    if (fitsInsideFrame(element, frame)) return op;
    const shifted = normalizeElement({
      ...op.element,
      x: num3(element.x) + num3(frame.x),
      y: num3(element.y) + num3(frame.y)
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
function layoutFocusIdsWithPages(ops, currentElements, prospectiveElements) {
  const focusIds = layoutFocusIds(ops);
  if (focusIds === void 0) return void 0;
  for (const elements of [currentElements, prospectiveElements]) {
    const pages = prototypePages(elements);
    for (const element of elements) {
      if (!focusIds.has(str3(element.id))) continue;
      const page = pageForElement(element, pages);
      if (page !== void 0) focusIds.add(page.id);
    }
  }
  return focusIds;
}
function normalizeSemanticUpserts(currentElements, ops) {
  const reconciled = reconcileBoundTextBindings(
    previewElements(currentElements, ops),
    layoutFocusIds(ops)
  );
  const byId = new Map(reconciled.map((element) => [str3(element.id), element]));
  return ops.map((op) => {
    if (op.op !== "upsert" || op.elementId === void 0) return op;
    const element = byId.get(op.elementId);
    return element === void 0 ? op : { ...op, element };
  });
}
function normalizePageShellUpserts(currentElements, ops) {
  const prospective = previewElements(currentElements, ops);
  const pages = prototypePages(prospective);
  const pageShellById = new Map(pages.filter((page) => page.kind === "page-shell").map((page) => [page.id, page]));
  const byId = new Map(prospective.map((element) => [str3(element.id), element]));
  const normalizeElementMembership = (element) => {
    const referencedPageShell = pageShellById.get(str3(element.frameId));
    const withoutFrame = { ...element, frameId: null };
    if (referencedPageShell !== void 0 && pageForElement(withoutFrame, pages)?.id !== referencedPageShell.id) {
      throw new Error(`layout-invalid:
- page-shell-child-coordinates-invalid [${str3(element.id)}]: children of ${referencedPageShell.name} must use canvas-absolute x/y inside the rectangle page shell; frame-local coordinates are supported only for legacy Frames`);
    }
    const page = pageForElement(element, pages);
    return referencedPageShell !== void 0 || page?.kind === "page-shell" ? withoutFrame : element;
  };
  return ops.map((op) => {
    if (op.op === "replace" && Array.isArray(op.scene?.elements)) {
      return {
        ...op,
        scene: {
          ...op.scene,
          elements: op.scene.elements.map((element2) => {
            return typeof element2 === "object" && element2 !== null ? normalizeElementMembership(element2) : element2;
          })
        }
      };
    }
    if (op.op !== "upsert" || op.elementId === void 0) return op;
    const element = byId.get(op.elementId);
    if (element === void 0) return op;
    return { ...op, element: normalizeElementMembership(element) };
  });
}
function validateNewPrototypePageContracts(currentElements, prospectiveElements) {
  const existingIds = new Set(currentElements.map((element) => str3(element.id)));
  const newPages = prototypePages(prospectiveElements).filter((page) => {
    return page.kind === "page-shell" && !existingIds.has(page.id);
  });
  const errors = [];
  for (const page of newPages) {
    const minimum = customData3(page.element).mockDataMin;
    if (typeof minimum !== "number" || !Number.isFinite(minimum) || minimum < 1) {
      errors.push(`prototype-page-mock-min-missing [${page.id}]: ${page.name} must set customData.mockDataMin to a positive number`);
    }
    const labels = prospectiveElements.filter((element) => {
      return str3(element.type) === "text" && str3(customData3(element).role).trim().toLowerCase() === "prototype-page-label" && str3(customData3(element).pageId) === page.id;
    });
    if (labels.length !== 1) {
      errors.push(`prototype-page-label-${labels.length === 0 ? "missing" : "ambiguous"} [${page.id}]: ${page.name} needs exactly one external prototype-page-label text with customData.pageId=${page.id}`);
      continue;
    }
    const label = labels[0];
    if (str3(label.text).trim() === "" || num3(label.y) + num3(label.height) > page.bounds.y + 2) {
      errors.push(`prototype-page-label-invalid [${str3(label.id)}]: ${page.name} label must contain readable text and sit above the rectangle page shell`);
    }
  }
  if (errors.length > 0) throw new Error(`layout-invalid:
${errors.map((error2) => `- ${error2}`).join("\n")}`);
}
function parseVisualReview(input) {
  if (typeof input !== "object" || input === null) return null;
  const value = input;
  const phase = str3(value.phase);
  if (phase !== "representative" && phase !== "final") return null;
  const inspectedPageIds = Array.isArray(value.inspectedPageIds) ? value.inspectedPageIds.filter((item) => typeof item === "string" && item.trim() !== "") : [];
  const observations = Array.isArray(value.observations) ? value.observations.filter((item) => typeof item === "string" && item.trim() !== "") : [];
  return {
    phase,
    passed: value.passed === true,
    boardRevision: typeof value.boardRevision === "number" && Number.isFinite(value.boardRevision) ? value.boardRevision : -1,
    revealRequestId: str3(value.revealRequestId),
    inspectedPageIds,
    observations
  };
}
function parseReviewAction(args) {
  const phase = str3(args.phase);
  if (phase !== "representative" && phase !== "final") {
    throw new Error("visual-review-invalid: action=review requires phase=representative or phase=final");
  }
  const inspectedPageIds = Array.isArray(args.inspectedPageIds) ? args.inspectedPageIds.filter((item) => typeof item === "string" && item.trim() !== "") : [];
  const observations = Array.isArray(args.observations) ? args.observations.filter((item) => typeof item === "string" && item.trim() !== "") : [];
  if (args.passed !== true) throw new Error("visual-review-failed: passed must be true before the workflow can continue");
  if (inspectedPageIds.length === 0) throw new Error("visual-review-invalid: inspectedPageIds must include at least one visible page id");
  if (observations.length === 0) throw new Error("visual-review-invalid: observations must describe what was visibly checked");
  return { phase, passed: true, inspectedPageIds, observations };
}
async function validateVisualReviewEvidence(store, root, boardName, boardRevision, evidence) {
  if (evidence === null) return;
  if (boardRevision === null || Math.abs(evidence.boardRevision - boardRevision) > 0.5) {
    throw new Error(`visual-review-stale: evidence revision ${evidence.boardRevision} does not match current board revision ${boardRevision ?? "missing"}; inspect the latest visible board before reviewing`);
  }
  const reveal = await store.getBoardReveal(root);
  if (!reveal.ok) throw new Error(`${reveal.error.code}: ${reveal.error.message}`);
  const request = reveal.value.request;
  if (request === null || request.id !== evidence.revealRequestId || request.board !== boardName) {
    throw new Error("visual-review-stale: revealRequestId is missing, belongs to another board, or is no longer the latest visible-board reveal; use the rev and revealRequestId from the most recent successful update");
  }
  if (request.revision !== boardRevision) {
    throw new Error(`visual-review-stale: reveal request revision ${request.revision} does not match current board revision ${boardRevision ?? "missing"}`);
  }
  if (typeof request.consumedAt !== "number") {
    throw new Error("visual-review-not-visible: the browser has not acknowledged opening this reveal request; wait for \u753B\u7801 to open before submitting visualReview");
  }
}
function validatePhasedDrawing(currentElements, prospectiveElements, visualReview, storedRepresentativeReviewed = false) {
  const currentPages = prototypePages(currentElements);
  const currentPageIds = new Set(currentPages.map((page) => page.id));
  const newPages = prototypePages(prospectiveElements).filter((page) => !currentPageIds.has(page.id));
  if (currentPages.length === 0 && newPages.length >= 3) {
    throw new Error("visual-review-required: first draw one representative page, inspect it in the visible \u753B\u7801 canvas, then add the remaining pages; do not author three or more unseen pages in the first batch");
  }
  if (currentPages.length > 0 && currentPages.length < 3 && newPages.length > 0 && prototypePages(prospectiveElements).length >= 3) {
    const representativeReviewed = visualReview?.phase === "representative" && visualReview.passed && visualReview.observations.length > 0 && visualReview.inspectedPageIds.some((id) => currentPageIds.has(id));
    if (!representativeReviewed && !storedRepresentativeReviewed) {
      throw new Error("visual-review-required: before adding multiple remaining pages, visibly inspect the existing representative page and call draw2code_update with action=review, the latest reviewToken, phase=representative, passed=true, inspectedPageIds and observations");
    }
  }
}
function reviewedEveryPage(evidence, pages) {
  if (pages.length === 0) return false;
  if (evidence?.phase !== "final" || !evidence.passed || evidence.observations.length === 0) return false;
  const reviewed = new Set(evidence.inspectedPageIds);
  return pages.every((page) => reviewed.has(page.id));
}
function layoutWarnings(elements) {
  const report = inspectPrototypeLayout(elements);
  return [...report.errors, ...report.warnings].map((item) => ({
    code: item.code,
    ...item.id === void 0 ? {} : { id: item.id },
    message: item.message
  }));
}
function boundedPrototypeQuality(report) {
  const pages = report.pages.slice(0, MAX_READ_PAGE_INDEX).map((page) => ({
    ...page,
    warningCount: page.warnings.length,
    warnings: page.warnings.slice(0, MAX_READ_DIAGNOSTICS),
    warningsTruncated: page.warnings.length > MAX_READ_DIAGNOSTICS
  }));
  return {
    ...report,
    warningCount: report.warnings.length,
    warnings: report.warnings.slice(0, MAX_READ_DIAGNOSTICS),
    warningsTruncated: report.warnings.length > MAX_READ_DIAGNOSTICS,
    pageCount: report.pages.length,
    pages,
    pagesTruncated: report.pages.length > MAX_READ_PAGE_INDEX
  };
}
function prototypeQualitySummary(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const qualityScore = typeof value.qualityScore === "number" ? value.qualityScore : 0;
  const warnings = Array.isArray(value.warnings) ? value.warnings.length : 0;
  return `prototype quality: ${qualityScore}/100 \xB7 warnings ${warnings}`;
}
function makeKey(root, name2) {
  return `${root}::${name2}`;
}
function snapshotElementsById(elements) {
  const map = /* @__PURE__ */ new Map();
  for (const element of elements) {
    const id = str3(element.id);
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
    const { updated: _beforeUpdated, ...beforeComparable } = beforeElement;
    const { updated: _afterUpdated, ...afterComparable } = afterElement;
    if (JSON.stringify(beforeComparable) !== JSON.stringify(afterComparable)) modified.add(id);
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
  const type = str3(element.type);
  if (type === "text") {
    const text3 = str3(element.text);
    return `${type}#${str3(element.id)} ${text3.slice(0, 48)}`;
  }
  return `${type}#${str3(element.id)}`;
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
function elementRole2(element) {
  if (typeof element.customData !== "object" || element.customData === null) return "";
  return str3(element.customData.role).toLowerCase();
}
function authoredElementMatches(expected, actual, elementsById) {
  const volatile = /* @__PURE__ */ new Set(["updated", "seed", "versionNonce"]);
  for (const [key, value] of Object.entries(expected)) {
    if (volatile.has(key)) continue;
    if (expected.type === "text" && (key === "textAlign" || key === "verticalAlign")) {
      const container = elementsById.get(str3(actual.containerId));
      const role2 = container === void 0 || elementRole2(container) === "" ? elementRole2(actual) : elementRole2(container);
      const alignment = semanticTextAlignment(role2);
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
  const byId = new Map(elements.map((element) => [str3(element.id), element]));
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
    const id = str3(el.id);
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
  const history = boardHistoryCache.get(key) ?? [];
  const withoutSameRevision = history.filter((item) => Math.abs(item.rev - snapshot.rev) > 0.5);
  boardHistoryCache.set(key, [...withoutSameRevision, snapshot].slice(-6));
  while (boardCache.size > SNAPSHOT_CACHE_MAX) {
    const first = boardCache.keys().next();
    if (first.done) break;
    boardCache.delete(first.value);
    boardHistoryCache.delete(first.value);
  }
}
function snapshotAtRevision(key, revision) {
  return (boardHistoryCache.get(key) ?? []).find((snapshot) => Math.abs(snapshot.rev - revision) <= 0.5);
}
function parseStringArray(value, field) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      throw new Error(`read-scope-invalid: ${field} must be a string array`);
    }
  }
  if (source === void 0) return [];
  if (!Array.isArray(source) || source.some((item) => typeof item !== "string")) {
    throw new Error(`read-scope-invalid: ${field} must be a string array`);
  }
  return [...new Set(source.map((item) => item.trim()).filter(Boolean))];
}
function parseReadRegion(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      throw new Error("read-scope-invalid: region must be {x,y,width,height}");
    }
  }
  if (source === void 0) return null;
  if (typeof source !== "object" || source === null) throw new Error("read-scope-invalid: region must be {x,y,width,height}");
  const record = source;
  const values = ["x", "y", "width", "height"].map((field) => record[field]);
  if (values.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new Error("read-scope-invalid: region x/y/width/height must be finite numbers");
  }
  const [x, y, width, height] = values;
  if (width <= 0 || height <= 0) throw new Error("read-scope-invalid: region width/height must be positive");
  return { x, y, width, height };
}
function intersectsRegion(element, region) {
  const left = num3(element.x);
  const top = num3(element.y);
  const right = left + Math.max(0, num3(element.width));
  const bottom = top + Math.max(0, num3(element.height));
  return right >= region.x && left <= region.x + region.width && bottom >= region.y && top <= region.y + region.height;
}
function describeElement(el) {
  const type = str3(el.type);
  const id = str3(el.id);
  const geom = `@${Math.round(num3(el.x))},${Math.round(num3(el.y))} ${Math.round(num3(el.width))}x${Math.round(num3(el.height))}`;
  if (type === "text") {
    const body = str3(el.text).replace(/\n/g, "\\n").slice(0, 60);
    return `${id} text ${geom} "${body}"`;
  }
  if (type === "frame") return `${id} frame ${geom} "${str3(el.name)}"`;
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
    description: "Read one \u753B\u7801 prototype board. The default detail=index is bounded: it returns page metadata, relations, layered capacity, quality, and continuation without serializing every element. Use detail=full only for a genuinely small board, or select content with pageIds, elementIds, region, or changesSince. Scoped results are byte-capped and paginated with nextCursor. Call once before editing an existing board; do not search chat history for reviewToken or pendingUpdateId. Also required before generating frontend pages. Triggers: \u67E5\u770B\u753B\u677F / \u8BFB\u539F\u578B / board read.",
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      name: { type: "string", description: "Board name. Omit to use the board currently selected in the \u753B\u7801 UI." },
      detail: { type: "string", enum: ["index", "full"], description: "index (default) returns bounded board/page metadata. full explicitly requests all elements, still subject to byte pagination." },
      pageIds: { type: "array", items: { type: "string" }, description: "Return elements belonging to these prototype page ids." },
      elementIds: { type: "array", items: { type: "string" }, description: "Return these exact element ids." },
      region: { type: "json", description: "Return elements intersecting canvas bounds {x,y,width,height}." },
      changesSince: { type: "number", description: "Return elements added or modified since a revision retained by this running host, plus deletedElementIds." },
      cursor: { type: "string", description: "Opaque continuation cursor from a previous scoped read." },
      limit: { type: "number", description: "Maximum selected elements in this page (default 150, max 250)." }
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
          prototypeQuality: { type: "json", required: true },
          capacity: { type: "json", required: true },
          history: { type: "json", required: true },
          continuation: { type: "json", required: true },
          pageNames: { type: "array", items: { type: "string" }, required: true },
          pages: { type: "array", items: { type: "json" }, required: true },
          pageRelations: { type: "array", items: { type: "json" }, required: true },
          frameNames: { type: "array", items: { type: "string" }, required: true },
          file: { type: "string", required: true },
          elements: { type: "json", required: true },
          selection: { type: "json", required: true },
          deletedElementIds: { type: "array", items: { type: "string" }, required: true },
          nextCursor: { type: "string" }
        }
      },
      render: (_args, value) => text2(
        [
          `board: ${value.board ?? ""} \xB7 ${value.elementCount ?? 0} elements`,
          `pages: ${(value.pageNames ?? []).join("\u3001") || "\uFF08\u672A\u8BC6\u522B\uFF09"} \xB7 relations: ${value.pageRelations?.length ?? 0}`,
          `capacity: ${num3(recordValue(value.capacity)?.usedBytes)}/${num3(recordValue(value.capacity)?.maxBytes)} bytes \xB7 continuation: ${str3(recordValue(value.continuation)?.status) || "idle"}`,
          value.activeBoard !== void 0 && value.activeBoard !== value.board ? `\u5F53\u524D\u753B\u677F: ${value.activeBoard}\uFF08\u4E0E\u8BFB\u53D6\u76EE\u6807\u4E0D\u540C\uFF09` : "",
          (value.layoutWarnings ?? []).length > 0 ? `\u539F\u578B\u8D28\u91CF\u63D0\u9192\uFF1A
${formatLayoutIssues(value.layoutWarnings ?? [])}` : "",
          prototypeQualitySummary(value.prototypeQuality),
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
      const pages = prototypePages(scene.elements);
      const relations = prototypePageRelations(scene.elements, pages);
      const qualityWarnings = [
        ...layoutWarnings(scene.elements),
        ...pageMembershipWarnings(scene.elements, pages)
      ].filter((warning, index, all) => all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(warning)) === index);
      const prototypeQuality = inspectPrototypeQuality(scene.elements);
      const returnedPages = pages.slice(0, MAX_READ_PAGE_INDEX);
      const returnedRelations = relations.slice(0, MAX_READ_RELATIONS);
      const returnedWarnings = qualityWarnings.slice(0, MAX_READ_DIAGNOSTICS);
      const operational = await boardOperationalState(store, args.root, target.name, rev, scene);
      const requestedPageIds = parseStringArray(args.pageIds, "pageIds");
      const requestedElementIds = parseStringArray(args.elementIds, "elementIds");
      const region = parseReadRegion(args.region);
      const key = makeKey(args.root, target.name);
      const hasSelectors = requestedPageIds.length > 0 || requestedElementIds.length > 0 || region !== null || typeof args.changesSince === "number";
      const selectedIds = new Set(requestedElementIds);
      const missingPageIds = requestedPageIds.filter((id) => !pages.some((page) => page.id === id));
      for (const page of pages.filter((candidate) => requestedPageIds.includes(candidate.id))) {
        selectedIds.add(page.id);
        for (const id of pageElementIds(page, scene.elements, pages)) selectedIds.add(id);
        for (const label of scene.elements.filter((element) => customData3(element).pageId === page.id)) selectedIds.add(str3(label.id));
      }
      if (region !== null) {
        for (const element of scene.elements) if (intersectsRegion(element, region)) selectedIds.add(str3(element.id));
      }
      let deletedElementIds = [];
      let changeTracking = { status: "not-requested" };
      if (typeof args.changesSince === "number") {
        const previous = Math.abs(args.changesSince - rev) <= 0.5 ? { rev, elements: scene.elements } : snapshotAtRevision(key, args.changesSince);
        if (previous === void 0) {
          changeTracking = {
            status: "unavailable",
            requestedRevision: args.changesSince,
            availableRevisions: (boardHistoryCache.get(key) ?? []).map((snapshot) => snapshot.rev),
            nextAction: "\u91CD\u65B0\u8BFB\u53D6\u76EE\u6807 pageIds \u6216 elementIds\uFF1BchangesSince \u53EA\u4FDD\u8BC1\u5F53\u524D\u5BBF\u4E3B\u8FD1\u671F\u4FEE\u8BA2"
          };
        } else {
          const delta = computeChangeIds(previous.elements, scene.elements);
          for (const id of delta.added) selectedIds.add(id);
          for (const id of delta.modified) selectedIds.add(id);
          deletedElementIds = [...delta.removed];
          changeTracking = {
            status: "available",
            requestedRevision: args.changesSince,
            added: [...delta.added],
            modified: [...delta.modified],
            removed: deletedElementIds
          };
        }
      }
      const selected = args.detail === "full" && !hasSelectors ? scene.elements : hasSelectors ? scene.elements.filter((element) => selectedIds.has(str3(element.id))) : [];
      const cursor = args.cursor === void 0 ? 0 : Number.parseInt(args.cursor, 10);
      if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("read-scope-invalid: cursor is invalid");
      const requestedLimit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.floor(args.limit) : 150;
      const limit = Math.max(1, Math.min(250, requestedLimit));
      const payload = [];
      let nextOffset = cursor;
      while (nextOffset < selected.length && payload.length < limit) {
        const candidate = [...payload, selected[nextOffset]];
        if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > MAX_ELEMENTS_JSON) break;
        payload.push(selected[nextOffset]);
        nextOffset += 1;
      }
      const nextCursor = nextOffset < selected.length ? String(nextOffset) : void 0;
      const summary = payload.length > 0 ? payload.map(describeElement).join("\n") : `index only: ${pages.length} pages, ${scene.elements.length} elements; use pageIds, elementIds, region, changesSince, or detail=full to fetch content`;
      rememberSnapshot(key, { rev, elements: scene.elements });
      return {
        rev,
        board: target.name,
        ...target.activeBoard !== void 0 ? { activeBoard: target.activeBoard } : {},
        elementCount: scene.elements.length,
        pageNames: returnedPages.map((page) => page.name),
        pages: publicPrototypePages(scene.elements, pages).slice(0, MAX_READ_PAGE_INDEX),
        pageRelations: returnedRelations,
        frameNames: returnedPages.map((page) => page.name),
        summary,
        layoutWarnings: returnedWarnings,
        prototypeQuality: boundedPrototypeQuality(prototypeQuality),
        ...operational,
        file: `draw2code/${target.name}.excalidraw.json`,
        elements: payload,
        selection: {
          detail: args.detail ?? "index",
          selectedElementCount: selected.length,
          returnedElementCount: payload.length,
          returnedBytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
          maxReturnedBytes: MAX_ELEMENTS_JSON,
          pageIds: requestedPageIds,
          missingPageIds,
          elementIds: requestedElementIds,
          region,
          changeTracking,
          diagnostics: {
            totalWarnings: qualityWarnings.length,
            returnedWarnings: returnedWarnings.length,
            truncated: qualityWarnings.length > returnedWarnings.length
          },
          pageIndex: {
            totalPages: pages.length,
            returnedPages: returnedPages.length,
            truncated: pages.length > returnedPages.length,
            totalRelations: relations.length,
            returnedRelations: returnedRelations.length,
            relationsTruncated: relations.length > returnedRelations.length
          }
        },
        deletedElementIds,
        ...nextCursor === void 0 ? {} : { nextCursor }
      };
    }
  });
}
function draw2codeUpdateTool(store) {
  return defineTool2({
    name: "draw2code_update",
    description: `Draw on / edit one \u753B\u7801 prototype board with ops \u2014 this is how you turn the user's idea into a visible prototype in the right sidebar. Canonical ops: {op:"upsert",element:{...}} (insert or replace by id), {op:"delete",id}, {op:"clear"}, {op:"replace",scene:{elements:[...]}}. Elements need id + type (rectangle|text|arrow|line|ellipse|diamond|frame) + x/y/width/height (+text for text); missing fields are defaulted. Unambiguous upsert shorthands are accepted: a direct {id,type,...} element, {element:{...}} without op, or flat {op:"upsert",id,type,...}. Delete also accepts elementId or element.id when op="delete". Canvas-absolute x/y are canonical. New prototype pages use an ordinary rectangle with customData.role=prototype-page, customData.pageName, and customData.mockDataMin; add a separate text above it with role=prototype-page-label and pageId. Keep all new-page children frameId=null so user-drawn cross-page arrows cannot be clipped. Existing named Frames remain supported; their unambiguous frame-local coordinates are still converted for compatibility. The board is auto-created when absent. Triggers: \u753B\u539F\u578B / \u753B\u4E00\u4E0B / \u5728\u753B\u677F\u4E0A\u2026 / draw the prototype / update the board. Low-fi quality is checked before writing: multiline text needs enough height, shape text must be a separate text element, and bottom navigation must use a semantic shell in the page bottom safe area. A completed page from draw2code_create must use a rectangle page shell with role=prototype-page, pageName, and mockDataMin (normally 3), plus an external prototype-page-label; mark each visible realistic example text with role=mock-data. Empty boxes and placeholder labels do not satisfy the content gate. Use semantic roles as a component API: page-heading/page-header for headers, content-card/task-card/stat-card/category-card for information blocks, input/select/search-field for form fields, chip/filter-chip for choices, bottom-navigation plus bottom-navigation-item for global navigation, and exactly one primary-action for the page's main task. Page membership is inferred from canvas geometry; containerId is only for one visible label bound to a rectangle/diamond/ellipse. New page children must keep frameId=null. Existing legacy Frame pages and their frameId children remain supported and are never migrated implicitly. For a one-label shape, set the text containerId to the shape id and declare customData.role on the shape or label: button/primary-action/chip/tab labels become center/middle, while input/select/dropdown/search-field values stay left/middle. Missing component roles are rejected instead of silently defaulting labels to the top-left. The tool completes Excalidraw's reciprocal boundElements relation so the label is visible on first render. A bottom-navigation shell uses separate text labels with customData.role=bottom-navigation-item so each slot is centered. Use customData.tone=primary|success|warning|danger|info|neutral on category/status/action shapes for restrained semantic color; explicit strokeColor/backgroundColor always win. Invalid layout returns layout-invalid and is not written. For three or more pages, obey create.drawingPlan and write only the representative page first. After the returned reviewToken is visible in Canvas, call action=review with phase=representative; this pure review does not write or publish another reveal. Then write the remaining pages and finish with action=review phase=final. If remaining-page ops arrive before representative review, the tool preserves them and returns pendingUpdateId; after review, call action=commit_pending with that id and do not regenerate or resend the ops. verified/writeVerified only prove persistence; report completion only when completionReady=true. Omit name to target the board currently selected in the \u753B\u7801 UI; only pass name when the user explicitly names another board. Never edit the scene file with Bash or another direct file-writing path; use this tool so conflicts and read-back verification are enforced.`,
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      name: { type: "string", description: "Board name. Omit to target the board currently selected in the \u753B\u7801 UI." },
      action: { type: "string", enum: ["write", "review", "commit_pending"], description: "write applies ops (default). review records a visible-canvas review without writing the board or publishing a new reveal. commit_pending applies a previously preserved batch after representative review." },
      ops: { type: "json", description: 'Required for action=write. Ops array (or a JSON string encoding it). For a new page, first upsert {id:"page",type:"rectangle",customData:{role:"prototype-page",pageName:"\u9996\u9875",mockDataMin:3},x,y,width,height}, then an external prototype-page-label text and page children with canvas-absolute coordinates and frameId=null. Direct elements, {element:{...}} without op, and flat upserts are accepted when id+type make the intent unambiguous. Delete accepts id, elementId, or element.id. Legacy named Frames remain compatible, including unambiguous frame-local child coordinate conversion.' },
      force: { type: "boolean", description: "\u5DF2\u8BFB\u5230\u51B2\u7A81\u5E76\u4E14\u7528\u6237\u786E\u8BA4\u540E\u53EF\u8BBE\u7F6E\u4E3A true\uFF0C\u5F3A\u5236\u6267\u884C\u3002\u9ED8\u8BA4 false\u3002" },
      safeMode: { type: "boolean", description: "\u662F\u5426\u5728\u6709\u98CE\u9669\u6539\u52A8\u65F6\u8981\u6C42\u786E\u8BA4\uFF08\u9ED8\u8BA4 true\uFF09\u3002\u8BBE\u4E3A false \u4F1A\u76F4\u63A5\u6267\u884C\uFF0C\u53EF\u80FD\u8986\u76D6\u7528\u6237\u624B\u5DE5\u6539\u52A8\u3002" },
      reviewToken: { type: "string", description: "Opaque token returned by the latest successful write. Required for action=review." },
      phase: { type: "string", enum: ["representative", "final"], description: "Review phase for action=review." },
      passed: { type: "boolean", description: "Set true only after the requested pages are visibly inspected." },
      inspectedPageIds: { type: "array", items: { type: "string" }, description: "Visible page-shell ids inspected during action=review." },
      observations: { type: "array", items: { type: "string" }, description: "Concrete visible observations from the review." },
      pendingUpdateId: { type: "string", description: "Preserved write batch returned when representative review is the only blocker. Use with action=commit_pending; do not resend the original ops." },
      visualReview: { type: "json", description: "Deprecated compatibility input. New calls use action=review with reviewToken, phase, passed, inspectedPageIds and observations, without ops." }
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
          writeVerified: { type: "boolean", required: true },
          reviewVerified: { type: "boolean" },
          completionReady: { type: "boolean", required: true },
          nextAction: { type: "string", required: true },
          nextActionCode: { type: "string" },
          nextActionParams: { type: "json" },
          operationBudget: { type: "json" },
          capacity: { type: "json" },
          timings: { type: "json" },
          prototypeQuality: { type: "json", required: true },
          revealRequestId: { type: "string" },
          reviewToken: { type: "string" },
          reviewRequest: { type: "json" },
          pendingUpdateId: { type: "string" },
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
\u8BF7\u5148\u786E\u8BA4\u540E\u518D\u91CD\u8BD5\uFF1A\u5728\u4F60\u786E\u8BA4\u4E86\u4E4B\u540E\uFF0C\u8BF7\u91CD\u65B0\u8C03\u7528 draw2code_update \u5E76\u8BBE\u7F6E force=true\u3002` : `board ${value.targetBoard ?? ""}. verified=${value.verified === true}; writeVerified=${value.writeVerified === true}; reviewVerified=${value.reviewVerified === true}; completionReady=${value.completionReady === true}; visualReviewRequired=${value.prototypeQuality !== null && typeof value.prototypeQuality === "object" && value.prototypeQuality.visualReviewRequired === true}; boardRevision=${value.rev ?? "missing"}; revealRequestId=${value.revealRequestId ?? "missing"}; reviewToken=${value.reviewToken ?? "missing"}; pendingUpdateId=${value.pendingUpdateId ?? "none"}. ${value.applied ?? 0} ops applied, ${value.elementCount ?? 0} elements on board. nextAction=${value.nextActionCode ?? value.nextAction ?? ""}. ${value.nextAction ?? ""}${recordValue(value.timings)?.totalMs === void 0 ? "" : ` toolTime=${num3(recordValue(value.timings)?.totalMs)}ms.`}${value.writeVerified === true ? " The \u753B\u7801 sidebar opens automatically on this board." : ""}${(value.layoutWarnings ?? []).length > 0 ? `
\u7ED3\u6784\u4E0E\u5E03\u5C40\u63D0\u9192\uFF1A
${formatLayoutIssues(value.layoutWarnings ?? [])}` : ""}`
      )
    },
    async execute(args) {
      const startedAt = performance.now();
      const stageTimings = { readMs: 0, preflightMs: 0, writeMs: 0, verificationMs: 0, publishMs: 0 };
      let firstEffectiveWriteAt = null;
      const rounded = (value) => Math.round(value * 10) / 10;
      const timings = () => ({
        scope: "tool-execution",
        excludes: "agent-reasoning-before-tool-call",
        readMs: rounded(stageTimings.readMs),
        preflightMs: rounded(stageTimings.preflightMs),
        writeMs: rounded(stageTimings.writeMs),
        verificationMs: rounded(stageTimings.verificationMs),
        publishMs: rounded(stageTimings.publishMs),
        totalMs: rounded(performance.now() - startedAt),
        timeToFirstEffectiveWriteMs: firstEffectiveWriteAt === null ? null : rounded(firstEffectiveWriteAt - startedAt)
      });
      const safeMode = args.safeMode !== false;
      const force = args.force === true;
      const visualReview = parseVisualReview(args.visualReview);
      let parsedOps = args.ops === void 0 ? [] : parseUpdateOps(args.ops);
      let targetName = args.name;
      let pendingCommit = null;
      const requestedAction = args.action ?? (visualReview !== null && parsedOps.length === 0 ? "review" : "write");
      const action = requestedAction === "commit_pending" ? "write" : requestedAction;
      if (requestedAction === "commit_pending") {
        if (typeof args.pendingUpdateId !== "string" || args.pendingUpdateId === "") {
          throw new Error("pending-update-invalid: action=commit_pending requires pendingUpdateId");
        }
        prunePendingReviewWrites();
        pendingCommit = pendingReviewWrites.get(args.pendingUpdateId) ?? null;
        if (pendingCommit === null || pendingCommit.root !== args.root) {
          throw new Error("pending-update-stale: pendingUpdateId is missing, expired, or belongs to another workspace");
        }
        if (targetName !== void 0 && targetName !== pendingCommit.board) {
          throw new Error("pending-update-stale: pendingUpdateId belongs to another board");
        }
        targetName = pendingCommit.board;
        parsedOps = pendingCommit.ops;
      }
      if (action === "review") {
        if (parsedOps.length > 0) throw new Error("visual-review-requires-empty-ops: action=review cannot mutate the board");
        const target2 = await resolveBoard(store, args.root, targetName);
        const readStartedAt2 = performance.now();
        const board2 = await store.read(args.root, target2.name);
        stageTimings.readMs += performance.now() - readStartedAt2;
        if (!board2.ok) throw new Error(`${board2.error.code}: ${board2.error.message}`);
        const evidence = visualReview === null ? parseReviewAction(args) : {
          phase: visualReview.phase,
          passed: visualReview.passed,
          inspectedPageIds: visualReview.inspectedPageIds,
          observations: visualReview.observations
        };
        const reviewToken = args.reviewToken ?? visualReview?.revealRequestId ?? "";
        if (reviewToken === "") throw new Error("visual-review-invalid: action=review requires reviewToken from the latest successful write");
        if (visualReview !== null) {
          await validateVisualReviewEvidence(store, args.root, target2.name, board2.value.rev, visualReview);
        }
        const pages2 = prototypePages(board2.value.scene.elements);
        const pageIds = new Set(pages2.map((page) => page.id));
        if (!evidence.inspectedPageIds.some((id) => pageIds.has(id))) {
          throw new Error("visual-review-invalid: inspectedPageIds do not include a page on the current board");
        }
        if (evidence.phase === "final" && !pages2.every((page) => evidence.inspectedPageIds.includes(page.id))) {
          throw new Error("visual-review-incomplete: final review must include every current page id");
        }
        const recorded = await store.recordBoardReview(args.root, {
          token: reviewToken,
          board: target2.name,
          boardRevision: board2.value.rev,
          phase: evidence.phase,
          inspectedPageIds: evidence.inspectedPageIds,
          observations: evidence.observations
        });
        if (!recorded.ok) throw new Error(`${recorded.error.code}: ${recorded.error.message}`);
        const prototypeQuality2 = inspectPrototypeQuality(board2.value.scene.elements);
        const completionReady2 = evidence.phase === "final" && prototypeQuality2.structurePassed && prototypeQuality2.contentPassed && prototypeQuality2.layoutPassed && prototypeQuality2.warnings.length === 0;
        prototypeQuality2.visualReviewRequired = !completionReady2 && pages2.length > 0;
        const pendingWrite = evidence.phase === "representative" ? pendingReviewWriteFor(args.root, target2.name, board2.value.rev) : null;
        const nextActionCode2 = completionReady2 ? "complete" : evidence.phase === "representative" ? pendingWrite === null ? "write_remaining_pages" : "commit_pending_write" : "fix_layout";
        const nextAction2 = completionReady2 ? "\u89C6\u89C9\u590D\u6838\u5DF2\u8986\u76D6\u5168\u90E8\u9875\u9762\uFF0C\u4E14\u7ED3\u6784\u3001\u5185\u5BB9\u548C\u5E03\u5C40\u95E8\u7981\u5168\u90E8\u901A\u8FC7" : evidence.phase === "representative" ? pendingWrite === null ? "\u4EE3\u8868\u9875\u590D\u6838\u5DF2\u8BB0\u5F55\uFF1B\u53EF\u4EE5\u5199\u5165\u5176\u4F59\u9875\u9762\uFF0C\u4E0D\u9700\u8981\u518D\u6B21\u4F20\u9012\u65E7 revision \u6216 revealRequestId" : "\u4EE3\u8868\u9875\u590D\u6838\u5DF2\u8BB0\u5F55\uFF1B\u6B64\u524D\u63D0\u4EA4\u7684\u5269\u4F59\u9875\u9762 ops \u5DF2\u4FDD\u7559\uFF0C\u8BF7\u7528 action=commit_pending \u548C pendingUpdateId \u63D0\u4EA4\uFF0C\u4E0D\u8981\u91CD\u53D1\u5927 JSON" : "\u6700\u7EC8\u590D\u6838\u5DF2\u8BB0\u5F55\uFF0C\u4F46\u4ECD\u9700\u5148\u4FEE\u590D prototypeQuality.warnings\uFF0C\u518D\u91CD\u65B0\u67E5\u770B\u6700\u65B0\u753B\u677F";
        const active = await store.getActiveBoard(args.root);
        if (!active.ok) throw new Error(`${active.error.code}: ${active.error.message}`);
        return {
          rev: board2.value.rev,
          targetBoard: target2.name,
          ...active.value.name === null ? {} : { activeBoard: active.value.name },
          elementCount: board2.value.scene.elements.length,
          applied: 0,
          verified: true,
          writeVerified: false,
          reviewVerified: true,
          completionReady: completionReady2,
          nextAction: nextAction2,
          nextActionCode: nextActionCode2,
          capacity: store.measureCapacity(board2.value.scene),
          prototypeQuality: prototypeQuality2,
          revealRequestId: reviewToken,
          reviewToken,
          reviewRequest: {
            token: reviewToken,
            boardRevision: board2.value.rev,
            phase: evidence.phase,
            pageIds: evidence.inspectedPageIds
          },
          ...pendingWrite === null ? {} : { pendingUpdateId: pendingWrite.id },
          layoutWarnings: layoutWarnings(board2.value.scene.elements),
          requiresConfirmation: false,
          pending: false,
          timings: timings()
        };
      }
      if (requestedAction === "write" && args.ops === void 0) throw new Error("invalid arguments: action=write requires ops");
      if (visualReview?.phase === "final" && parsedOps.length > 0) {
        throw new Error("visual-review-final-requires-empty-ops: final visualReview must be submitted after all writes in a separate call with ops=[]");
      }
      const target = await resolveBoard(store, args.root, targetName);
      const readStartedAt = performance.now();
      const board = await store.read(args.root, target.name);
      stageTimings.readMs += performance.now() - readStartedAt;
      if (pendingCommit !== null && (!board.ok || Math.abs(board.value.rev - pendingCommit.baseRev) > 0.5)) {
        throw new Error("pending-update-stale: board changed after the pending batch was preserved; read the latest board and create a new minimal update");
      }
      await validateVisualReviewEvidence(store, args.root, target.name, board.ok ? board.value.rev : null, visualReview);
      const key = makeKey(args.root, target.name);
      const cache = boardCache.get(key);
      const currentElements = board.ok ? board.value.scene.elements : [];
      const preflightStartedAt = performance.now();
      const batchLimits = store.capacityLimits();
      const batchBytes = Buffer.byteLength(JSON.stringify(parsedOps), "utf8");
      if (parsedOps.length > batchLimits.maxBatchOps || batchBytes > batchLimits.maxBatchBytes) {
        stageTimings.preflightMs += performance.now() - preflightStartedAt;
        const prototypeQuality2 = inspectPrototypeQuality(currentElements);
        return {
          rev: board.ok ? board.value.rev : 0,
          targetBoard: target.name,
          ...target.activeBoard === void 0 ? {} : { activeBoard: target.activeBoard },
          elementCount: currentElements.length,
          applied: 0,
          verified: false,
          writeVerified: false,
          reviewVerified: false,
          completionReady: false,
          nextAction: "\u672C\u6B21\u5DE5\u5177\u8C03\u7528\u7684 ops \u8D1F\u8F7D\u8FC7\u5927\uFF1B\u753B\u677F\u672C\u8EAB\u53EF\u80FD\u4ECD\u6709\u5BB9\u91CF\u3002\u6309\u9875\u9762\u6216\u72EC\u7ACB\u6539\u52A8\u62C6\u5206\u672C\u6279\u6B21\u540E\u91CD\u8BD5\u3002",
          nextActionCode: "reduce_batch_size",
          nextActionParams: {
            tool: "draw2code_update",
            arguments: { root: args.root, name: target.name, action: "write", ops: "<one page or one independent change batch>" }
          },
          operationBudget: {
            opCount: parsedOps.length,
            maxOps: batchLimits.maxBatchOps,
            bytes: batchBytes,
            maxBytes: batchLimits.maxBatchBytes
          },
          capacity: store.measureCapacity(board.ok ? board.value.scene : { elements: [] }),
          timings: timings(),
          prototypeQuality: prototypeQuality2,
          layoutWarnings: layoutWarnings(currentElements),
          requiresConfirmation: false,
          pending: false
        };
      }
      rejectNewPrototypeFrames(currentElements, parsedOps);
      const frameNormalizedOps = normalizeFrameLocalCoordinates(currentElements, parsedOps);
      const semanticOps = normalizeSemanticUpserts(currentElements, frameNormalizedOps);
      const ops = normalizePageShellUpserts(currentElements, semanticOps);
      const prospectiveElements = previewElements(currentElements, ops);
      const currentScene = board.ok ? board.value.scene : { elements: [] };
      const currentCapacity = store.measureCapacity(currentScene);
      const projectedCapacity = store.measureCapacity({ ...currentScene, elements: prospectiveElements });
      if (projectedCapacity.canonicalBytes > projectedCapacity.hardCapBytes) {
        stageTimings.preflightMs += performance.now() - preflightStartedAt;
        const prototypeQuality2 = inspectPrototypeQuality(currentElements);
        return {
          rev: board.ok ? board.value.rev : 0,
          targetBoard: target.name,
          ...target.activeBoard === void 0 ? {} : { activeBoard: target.activeBoard },
          elementCount: currentElements.length,
          applied: 0,
          verified: false,
          writeVerified: false,
          reviewVerified: false,
          completionReady: false,
          nextAction: "\u5199\u5165\u540E\u7684\u5B8C\u6574\u753B\u677F\u4F1A\u8D85\u8FC7\u5BB9\u91CF\u786C\u4E0A\u9650\uFF1B\u7F29\u5C0F\u540C\u4E00\u6539\u52A8\u6279\u6B21\u4E0D\u80FD\u89E3\u51B3\u3002\u8BF7\u5148\u5F52\u6863\u6216\u62C6\u5206\u753B\u677F\uFF0C\u518D\u628A\u76EE\u6807\u9875\u9762\u5199\u5165\u65B0\u753B\u677F\u3002",
          nextActionCode: "archive_or_split_board",
          nextActionParams: {
            tool: "draw2code_update",
            arguments: { root: args.root, name: "<new board>", action: "write", ops: "<pages moved from the full board>" }
          },
          capacity: {
            hardCapBytes: projectedCapacity.hardCapBytes,
            softCapBytes: projectedCapacity.softCapBytes,
            canonicalBytes: currentCapacity.canonicalBytes,
            persistedBytes: currentCapacity.persistedBytes,
            remainingBytes: currentCapacity.remainingBytes,
            projectedCanonicalBytes: projectedCapacity.canonicalBytes,
            projectedPersistedBytes: projectedCapacity.persistedBytes,
            excessBytes: projectedCapacity.canonicalBytes - projectedCapacity.hardCapBytes
          },
          timings: timings(),
          prototypeQuality: prototypeQuality2,
          layoutWarnings: layoutWarnings(currentElements),
          requiresConfirmation: false,
          pending: false
        };
      }
      const storedRepresentative = await store.getBoardReview(args.root, target.name, "representative");
      if (!storedRepresentative.ok) throw new Error(`${storedRepresentative.error.code}: ${storedRepresentative.error.message}`);
      const storedRepresentativeReviewed = board.ok && storedRepresentative.value.receipt !== null && Math.abs(storedRepresentative.value.receipt.revision - board.value.rev) <= 0.5 && storedRepresentative.value.receipt.inspectedPageIds.some((id) => prototypePages(currentElements).some((page) => page.id === id));
      try {
        validatePhasedDrawing(currentElements, prospectiveElements, visualReview, storedRepresentativeReviewed);
      } catch (error2) {
        const message = error2 instanceof Error ? error2.message : String(error2);
        const currentPages = prototypePages(currentElements);
        if (!message.startsWith("visual-review-required:") || currentPages.length === 0 || !board.ok || requestedAction !== "write") throw error2;
        const pendingWrite = rememberPendingReviewWrite({
          root: args.root,
          board: target.name,
          baseRev: board.value.rev,
          ops
        });
        const reveal = await store.getBoardReveal(args.root);
        if (!reveal.ok) throw new Error(`${reveal.error.code}: ${reveal.error.message}`);
        const request = reveal.value.request;
        if (request === null || request.board !== target.name || Math.abs(request.revision - board.value.rev) > 0.5) {
          pendingReviewWrites.delete(pendingWrite.id);
          throw error2;
        }
        stageTimings.preflightMs += performance.now() - preflightStartedAt;
        const prototypeQuality2 = inspectPrototypeQuality(currentElements);
        prototypeQuality2.visualReviewRequired = true;
        return {
          rev: board.value.rev,
          targetBoard: target.name,
          ...target.activeBoard === void 0 ? {} : { activeBoard: target.activeBoard },
          elementCount: currentElements.length,
          applied: 0,
          verified: false,
          writeVerified: false,
          reviewVerified: false,
          completionReady: false,
          nextAction: "\u5269\u4F59\u9875\u9762 ops \u5DF2\u5B89\u5168\u6682\u5B58\uFF1B\u5148\u67E5\u770B\u5F53\u524D\u4EE3\u8868\u9875\u5E76\u7528 action=review\u3001reviewToken \u548C phase=representative \u5B8C\u6210\u590D\u6838\uFF0C\u4E4B\u540E\u53EA\u63D0\u4EA4 pendingUpdateId\uFF0C\u4E0D\u8981\u91CD\u53D1\u5927 JSON",
          nextActionCode: "review_representative",
          nextActionParams: {
            tool: "draw2code_update",
            arguments: { root: args.root, name: target.name, action: "review", reviewToken: request.id, phase: "representative" }
          },
          capacity: currentCapacity,
          timings: timings(),
          prototypeQuality: prototypeQuality2,
          revealRequestId: request.id,
          reviewToken: request.id,
          reviewRequest: {
            token: request.id,
            boardRevision: board.value.rev,
            phase: "representative",
            pageIds: currentPages.map((page) => page.id)
          },
          pendingUpdateId: pendingWrite.id,
          layoutWarnings: layoutWarnings(currentElements),
          requiresConfirmation: false,
          pending: false
        };
      }
      validateNewPrototypePageContracts(currentElements, prospectiveElements);
      const layoutReport = inspectPrototypeLayout(prospectiveElements, {
        focusIds: layoutFocusIdsWithPages(ops, currentElements, prospectiveElements)
      });
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
        stageTimings.preflightMs += performance.now() - preflightStartedAt;
        const elementCount = currentElements.length;
        const conflictValues = conflicts;
        const prototypeQuality2 = inspectPrototypeQuality(currentElements);
        return {
          rev: board.ok ? board.value.rev : 0,
          targetBoard: target.name,
          ...target.activeBoard !== void 0 ? { activeBoard: target.activeBoard } : {},
          elementCount,
          applied: 0,
          verified: false,
          writeVerified: false,
          completionReady: false,
          nextAction: "\u5148\u786E\u8BA4\u51B2\u7A81\uFF1B\u672C\u8F6E\u5C1A\u672A\u5199\u5165\uFF0C\u4E5F\u4E0D\u80FD\u8FDB\u5165\u89C6\u89C9\u5B8C\u6210\u9A8C\u6536",
          nextActionCode: "confirm_overwrite",
          nextActionParams: {
            tool: "draw2code_update",
            arguments: { root: args.root, name: target.name, action: "write", force: true }
          },
          capacity: currentCapacity,
          timings: timings(),
          prototypeQuality: prototypeQuality2,
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
      stageTimings.preflightMs += performance.now() - preflightStartedAt;
      const writeStartedAt = performance.now();
      const result = await store.applyOps(args.root, target.name, ops, board.ok ? board.value.rev : void 0);
      stageTimings.writeMs += performance.now() - writeStartedAt;
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      firstEffectiveWriteAt = performance.now();
      const verificationStartedAt = performance.now();
      const refreshed = await store.read(args.root, target.name);
      if (!refreshed.ok) throw new Error(`${refreshed.error.code}: ${refreshed.error.message}`);
      if (refreshed.value.scene.elements.length !== result.value.elementCount) {
        throw new Error("draw2code_update write verification failed: element count changed before read-back");
      }
      const verificationError = verifyAppliedOps(ops, refreshed.value.scene.elements);
      if (verificationError !== null) throw new Error(`draw2code_update write verification failed: ${verificationError}`);
      stageTimings.verificationMs += performance.now() - verificationStartedAt;
      if (pendingCommit !== null) pendingReviewWrites.delete(pendingCommit.id);
      rememberSnapshot(key, { rev: refreshed.value.rev, elements: refreshed.value.scene.elements });
      const publishStartedAt = performance.now();
      const selected = await store.setActiveBoard(args.root, target.name);
      if (!selected.ok) throw new Error(`draw2code_update verified but could not select its board: ${selected.error.code}: ${selected.error.message}`);
      const revealed = await store.publishBoardReveal(args.root, target.name, refreshed.value.rev);
      if (!revealed.ok) throw new Error(`draw2code_update verified but could not queue its board reveal: ${revealed.error.code}: ${revealed.error.message}`);
      stageTimings.publishMs += performance.now() - publishStartedAt;
      const qualityWarnings = layoutWarnings(refreshed.value.scene.elements);
      const pages = prototypePages(refreshed.value.scene.elements);
      const prototypeQuality = inspectPrototypeQuality(refreshed.value.scene.elements);
      const completionReady = ops.length === 0 && reviewedEveryPage(visualReview, pages) && prototypeQuality.structurePassed && prototypeQuality.contentPassed && prototypeQuality.layoutPassed && prototypeQuality.warnings.length === 0;
      prototypeQuality.visualReviewRequired = !completionReady && pages.length > 0;
      const nextActionCode = completionReady ? "complete" : pages.length === 0 ? "write_representative" : !prototypeQuality.structurePassed || !prototypeQuality.contentPassed || !prototypeQuality.layoutPassed || prototypeQuality.warnings.length > 0 ? "fix_layout" : pages.length >= 3 ? "review_final" : "review_visible_board";
      const nextAction = completionReady ? "\u89C6\u89C9\u590D\u6838\u5DF2\u8986\u76D6\u5168\u90E8\u9875\u9762\uFF1B\u53EF\u4EE5\u6839\u636E prototypeQuality \u7684\u5269\u4F59 warnings \u51B3\u5B9A\u662F\u5426\u7EE7\u7EED\u6253\u78E8" : pages.length === 0 ? "\u5F53\u524D\u753B\u677F\u6CA1\u6709\u53EF\u8BC6\u522B\u9875\u9762\uFF1B\u5148\u521B\u5EFA prototype-page" : !prototypeQuality.structurePassed || !prototypeQuality.contentPassed || !prototypeQuality.layoutPassed || prototypeQuality.warnings.length > 0 ? "\u5148\u6309 prototypeQuality.warnings \u4FEE\u590D\u7ED3\u6784\u3001\u9996\u5C4F\u5185\u5BB9\u548C\u5E03\u5C40\uFF1B\u5168\u90E8\u901A\u8FC7\u540E\u5728\u771F\u5B9E\u753B\u677F\u9010\u9875\u68C0\u67E5\uFF0C\u518D\u7528 action=review \u548C\u6700\u65B0 reviewToken \u63D0\u4EA4 phase=final" : ops.length > 0 && visualReview?.phase === "final" ? "\u672C\u8F6E\u4ECD\u5199\u5165\u4E86\u5143\u7D20\uFF0C\u4E0D\u80FD\u540C\u65F6\u8BC1\u660E\u5199\u5165\u540E\u7684\u89C6\u89C9\u7ED3\u679C\uFF1B\u8BF7\u67E5\u770B\u771F\u5B9E\u753B\u677F\u540E\uFF0C\u7528 action=review \u548C\u6700\u65B0 reviewToken \u5355\u72EC\u63D0\u4EA4 phase=final" : "\u5728\u771F\u5B9E\u53EF\u89C1\u753B\u677F\u9010\u9875\u505A\u89C6\u89C9\u68C0\u67E5\uFF1A\u9996\u5C4F\u4EFB\u52A1\u3001\u5C42\u7EA7\u3001\u5BF9\u9F50\u3001mock \u6570\u636E\u548C\u5BFC\u822A\uFF1B\u518D\u7528 action=review\u3001\u6700\u65B0 reviewToken \u548C\u8986\u76D6\u5168\u90E8 page id \u7684 phase=final \u6536\u53E3";
      return {
        rev: result.value.rev,
        targetBoard: target.name,
        activeBoard: selected.value.name,
        elementCount: result.value.elementCount,
        applied: result.value.applied,
        verified: true,
        writeVerified: true,
        reviewVerified: false,
        completionReady,
        nextAction,
        nextActionCode,
        capacity: store.measureCapacity(refreshed.value.scene),
        timings: timings(),
        prototypeQuality,
        revealRequestId: revealed.value.id,
        reviewToken: revealed.value.id,
        reviewRequest: {
          token: revealed.value.id,
          boardRevision: refreshed.value.rev,
          pageIds: pages.map((page) => page.id)
        },
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
function buildGenerateInstructions(board, frameNames, existingPages, visualBrief, referenceStyle) {
  const lines = [
    "\u6309\u4EE5\u4E0B\u8981\u6C42\u751F\u6210\u524D\u7AEF\u9875\u9762\uFF1A",
    "1. \u753B\u677F\u539F\u578B\u662F\u4EA7\u54C1\u4E8B\u5B9E\u6765\u6E90\uFF1A\u5FC5\u987B\u4FDD\u7559" + (frameNames.length > 0 ? "\u300C" + frameNames.join("\u300D\u300C") + "\u300D\u8FD9\u4E9B\u8303\u56F4\u7684" : "\u6574\u5757\u753B\u677F\u7684") + "\u9875\u9762\u3001\u4FE1\u606F\u5C42\u7EA7\u3001\u6587\u6848\u3001mock \u6570\u636E\u3001\u7EC4\u4EF6\u8BED\u4E49\u548C\u4EA4\u4E92\u5173\u7CFB\uFF1B\u7981\u6B62\u6DFB\u52A0\u539F\u578B\u4E2D\u4E0D\u5B58\u5728\u7684\u6A21\u5757\u3001\u9875\u9762\u3001\u89D2\u8272\u3001\u6D41\u7A0B\u6216\u91CD\u5927\u4E1A\u52A1\u89C4\u5219\u3002",
    "2. \u539F\u578B\u4E0D\u662F\u50CF\u7D20\u6A21\u677F\u3002\u7981\u6B62\u7167\u642C Excalidraw \u7684\u7EDD\u5BF9\u5750\u6807\u3001\u65B9\u6846\u5C3A\u5BF8\u548C\u4F4E\u4FDD\u771F\u7A7A\u767D\uFF1B\u4F7F\u7528\u8BED\u4E49\u5316 HTML\u3001\u5185\u5BB9\u6D41\u3001CSS Grid\u3001Flex \u548C\u5BB9\u5668\u7EA6\u675F\u91CD\u65B0\u6392\u7248\u3002absolute/fixed \u53EA\u7528\u4E8E\u786E\u6709\u5FC5\u8981\u7684\u6D6E\u5C42\u3001\u88C5\u9970\u6216\u56FA\u5B9A\u5BFC\u822A\u3002",
    "3. \u82E5\u539F\u578B\u662F\u79FB\u52A8\u7AEF\u5E03\u5C40\uFF0C\u751F\u6210 H5 \u9875\u9762\u672C\u4F53\uFF0C\u4E0D\u8981\u5957\u624B\u673A\u8FB9\u6846\uFF1B\u81F3\u5C11\u9002\u914D 320\u2013430px \u624B\u673A\u5BBD\u5EA6\uFF0C\u5E76\u4FDD\u8BC1\u684C\u9762\u9884\u89C8\u65F6\u5185\u5BB9\u7A33\u5B9A\u5C45\u4E2D\u3001\u65E0\u6A2A\u5411\u6EA2\u51FA\u3002",
    "4. \u8F93\u51FA\u5230 draw2code-pages/" + board + "/index.html\uFF1A\u5355\u6587\u4EF6\u3001\u5185\u8054 CSS/JS\u3001\u53EF\u76F4\u63A5\u5728\u6D4F\u89C8\u5668\u6253\u5F00\uFF1B\u591A\u4E2A\u9875\u9762\u653E\u5728\u540C\u4E00\u6587\u4EF6\u5185\u5E76\u4E92\u76F8\u5BFC\u822A\u3002\u6BCF\u4E2A\u9875\u9762\u6839\u8282\u70B9\u524D\u540E\u5FC5\u987B\u4FDD\u7559 <!-- d2c-page:<\u9875\u9762\u539F\u540D>:start --> \u548C <!-- d2c-page:<\u9875\u9762\u539F\u540D>:end -->\uFF0C\u4F9B\u540E\u7EED\u91CD\u65B0\u751F\u6210\u65F6\u7CBE\u786E\u4FDD\u62A4\u672A\u9009\u9875\u9762\u3002",
    existingPages.length > 0 ? "5. draw2code-pages/" + board + "/ \u5DF2\u6709\u9875\u9762\uFF08" + existingPages.join("\u3001") + "\uFF09\uFF1A\u5148\u8BFB\u53D6\u73B0\u6709 index.html\uFF0C\u6CBF\u7528\u5176\u6280\u672F\u5B9E\u73B0\uFF0C\u53EA\u66F4\u65B0\u672C\u6B21\u8303\u56F4\u5185\u7684\u9875\u9762\uFF0C\u4FDD\u6301\u5176\u4F59\u9875\u9762\u4E0D\u53D8\u3002" : "5. draw2code-pages/" + board + "/ \u76EE\u524D\u4E3A\u7A7A\uFF1A\u4ECE\u96F6\u751F\u6210\uFF0C\u4F46\u4E0D\u80FD\u9000\u5316\u6210\u65E0\u5C42\u7EA7\u7684\u901A\u7528\u6A21\u677F\u3002",
    "6. \u4F7F\u7528\u4EE5\u4E0B\u7ED3\u6784\u5316\u89C6\u89C9\u7B80\u62A5\uFF0C\u800C\u4E0D\u662F\u53EA\u628A\u201C" + visualBrief.direction + "\u201D\u5F53\u4F5C\u7A7A\u6CDB\u5F62\u5BB9\u8BCD\uFF1A\n   - \u6C14\u8D28\uFF1A" + visualBrief.tone + "\n   - \u80CC\u666F\uFF1A" + visualBrief.background + "\n   - \u4E3B\u64CD\u4F5C\uFF1A" + visualBrief.primaryAction + "\n   - \u8BED\u4E49\u8272\uFF1A" + visualBrief.semanticColors + "\n   - \u5BC6\u5EA6\uFF1A" + visualBrief.density + "\n   - \u5B57\u4F53\u5C42\u7EA7\uFF1A" + visualBrief.typeHierarchy + "\n   - \u5E03\u5C40\u7B56\u7565\uFF1A" + visualBrief.layoutStrategy + "\n   - \u52A8\u6548\uFF1A" + visualBrief.motion + "\n   - \u89C6\u89C9\u7126\u70B9\uFF1A" + visualBrief.focalPoint,
    "7. \u9075\u5FAA\u4E13\u4E1A\u524D\u7AEF\u8BBE\u8BA1\u89C4\u8303\uFF1A\u5148\u5EFA\u7ACB CSS \u8BBE\u8BA1\u53D8\u91CF\uFF1B\u6BCF\u9875\u53EA\u7A81\u51FA\u4E00\u4E2A\u4E3B\u8981\u4EFB\u52A1\uFF1B\u907F\u514D\u65E0\u76EE\u7684\u6E10\u53D8\u3001\u8FC7\u5EA6\u5706\u89D2\u3001\u5E73\u5747\u7528\u529B\u548C\u5343\u7BC7\u4E00\u5F8B\u7684 AI \u6A21\u677F\u611F\uFF1B\u771F\u5B9E mock \u6570\u636E\u5FC5\u987B\u53C2\u4E0E\u6392\u7248\u3002",
    referenceStyle === null ? "8. \u7528\u6237\u672C\u6B21\u672A\u63D0\u4F9B\u53C2\u8003\u98CE\u683C\u56FE\uFF1B\u4EE5\u7ED3\u6784\u5316\u89C6\u89C9\u7B80\u62A5\u4E3A\u51C6\uFF0C\u4E0D\u5F97\u9000\u5316\u4E3A\u65E0\u5DEE\u522B\u7684\u901A\u7528\u6A21\u677F\u3002" : "8. \u7528\u6237\u63D0\u4F9B\u7684\u53C2\u8003\u98CE\u683C\u4FE1\u606F\u662F\uFF1A" + referenceStyle + "\u3002\u63D0\u53D6\u5176\u914D\u8272\u5173\u7CFB\u3001\u5B57\u4F53\u611F\u89C9\u3001\u7559\u767D\u3001\u5E03\u5C40\u5BC6\u5EA6\u548C\u7EC4\u4EF6\u6C14\u8D28\uFF0C\u4F46\u9875\u9762\u5185\u5BB9\u4E0E\u6D41\u7A0B\u4ECD\u4EE5\u753B\u677F\u539F\u578B\u4E3A\u51C6\uFF0C\u7981\u6B62\u50CF\u7D20\u7167\u6284\u3002",
    "9. \u53EF\u4EE5\u8865\u5145\u5FC5\u586B\u6821\u9A8C\u3001\u52A0\u8F7D\u3001\u6210\u529F\u63D0\u793A\u548C\u9009\u4E2D\u6001\u7B49\u901A\u7528\u4EA4\u4E92\u53CD\u9988\uFF0C\u4F46\u4E0D\u5F97\u65B0\u589E\u4EA7\u54C1\u4E8B\u5B9E\u3002",
    "10. \u5199\u5165\u540E\u5FC5\u987B\u81EA\u52A8\u6253\u5F00\u771F\u5B9E\u6D4F\u89C8\u5668\u9884\u89C8\uFF0C\u9010\u9875\u622A\u56FE\u5E76\u5B9E\u9645\u9A8C\u8BC1\uFF1A\u6240\u9009\u9875\u9762\u548C mock \u6570\u636E\u53EF\u89C1\u3001\u9875\u9762\u5207\u6362\u4E0E\u6838\u5FC3\u6309\u94AE\u53EF\u7528\u3001\u6838\u5FC3\u6D41\u7A0B\u8D70\u901A\u3001\u63A7\u5236\u53F0\u65E0 error/warning\u3001\u65E0\u6A2A\u5411\u6EA2\u51FA\u6216\u5185\u5BB9\u88C1\u5207\u3001\u6309\u94AE\u6587\u6848\u5C45\u4E2D\u3001\u5E95\u90E8\u5BFC\u822A\u5B8C\u6574\u3002\u53D1\u73B0\u5B9E\u73B0\u95EE\u9898\u8981\u76F4\u63A5\u4FEE\u590D\u5E76\u91CD\u65B0\u9A8C\u8BC1\u3002",
    "11. \u8C03\u7528 action=complete \u65F6\u5FC5\u987B\u63D0\u4EA4 verificationEvidence\uFF1A\u672C\u6B21\u6D4F\u89C8\u5668\u9A8C\u6536\u552F\u4E00 captureId\u3001\u751F\u6210\u5165\u53E3 outputSha256\u3001previewUrl\u3001viewports\uFF1B\u8986\u76D6\u6BCF\u4E2A\u6240\u9009\u9875\u9762\u7684 screenshots[{page,viewport,source,sha256,captureId}]\uFF1B\u6D4F\u89C8\u5668\u5BFC\u51FA\u7684 domSnapshots[{page,source,sha256,captureId}]\uFF1BconsoleErrors\u3001consoleWarnings\u3001domChecks\u3001layoutChecks \u548C interactionChecks\u3002previewUrl \u5185\u5BB9\u54C8\u5E0C\u5FC5\u987B\u7B49\u4E8E outputSha256\uFF1B\u622A\u56FE\u548C DOM \u5FEB\u7167\u5FC5\u987B\u4FDD\u5B58\u5230 workspace \u5185\u3001\u5C5E\u4E8E\u540C\u4E00 captureId\uFF0Csha256 \u5FC5\u987B\u4E0E\u6587\u4EF6\u4E00\u81F4\uFF1B\u4E0D\u80FD\u518D\u7528\u51E0\u4E2A\u81EA\u62A5\u5E03\u5C14\u503C\u4EE3\u66FF\u8BC1\u636E\u3002",
    "12. \u53EA\u6709\u771F\u5B9E\u9884\u89C8\u8BC1\u636E\u901A\u8FC7\u5DE5\u5177\u95E8\u7981\u540E\uFF0C\u624D\u8C03\u7528 draw2code_generate action=complete\uFF1B\u5728 complete \u8FD4\u56DE completed \u4E4B\u524D\u4E0D\u5F97\u5411\u7528\u6237\u62A5\u544A\u751F\u6210\u5B8C\u6210\u3002"
  ];
  return lines.join("\n");
}
var REFERENCE_STYLE_PROMPT = "\u751F\u6210\u524D\u60F3\u786E\u8BA4\u4E00\u4E0B\uFF1A\u4F60\u6709\u6CA1\u6709\u53C2\u8003\u98CE\u683C\u7684\u56FE\u7247\uFF1F\u6709\u7684\u8BDD\u76F4\u63A5\u53D1\u56FE\u5373\u53EF\uFF1B\u6CA1\u6709\u4E5F\u6CA1\u5173\u7CFB\uFF0C\u6211\u4F1A\u7ED3\u5408\u539F\u578B\u667A\u80FD\u63A8\u8350\u89C6\u89C9\u65B9\u5411\u3002";
function normalizeReferenceStyle(value) {
  const normalized = value.trim();
  return /^(?:none|no|没有|无|不需要|暂无)$/iu.test(normalized) ? null : normalized;
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
function pageScopeQuestion(pages, recommended, recommendationReasons = /* @__PURE__ */ new Map()) {
  const recommendedSet = new Set(recommended);
  const orderedPages = [...pages].sort((left, right) => {
    const leftRecommended = recommendedSet.has(left.name) ? 0 : 1;
    const rightRecommended = recommendedSet.has(right.name) ? 0 : 1;
    return leftRecommended - rightRecommended;
  });
  return {
    id: "page-scope",
    text: "\u8FD9\u6B21\u8981\u628A\u54EA\u4E9B\u539F\u578B\u9875\u9762\u751F\u6210\u6210\u53EF\u4F53\u9A8C\u7684\u524D\u7AEF Demo\uFF1F",
    selectionMode: "multiple",
    minSelections: 1,
    allowOther: false,
    options: orderedPages.map((page) => {
      const name2 = page.name;
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
function directlyConnectedPages(elements, requested) {
  if (requested.length === 0) return [];
  const relations = prototypePageRelations(elements);
  const connected = /* @__PURE__ */ new Set();
  for (const relation of relations) {
    if (requested.includes(relation.sourcePage) && !requested.includes(relation.targetPage)) connected.add(relation.targetPage);
    if (requested.includes(relation.targetPage) && !requested.includes(relation.sourcePage)) connected.add(relation.sourcePage);
  }
  return [...connected];
}
function inferDevice(pages) {
  let mobile = 0;
  let desktop = 0;
  for (const page of pages) {
    const width = page.bounds.width;
    const height = page.bounds.height;
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
function visualQuestion(elements, referenceStyle = null) {
  const corpus = elements.map((element) => `${str3(element.name)} ${str3(element.text)}`).join(" ");
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
  const referenceOption = referenceStyle === null ? null : {
    id: "reference-image",
    label: "\u6CBF\u7528\u53C2\u8003\u56FE\uFF08\u63A8\u8350\uFF09",
    valueLabel: `\u53C2\u8003\u56FE\u98CE\u683C\uFF1A${referenceStyle}`,
    description: "\u63D0\u53D6\u53C2\u8003\u56FE\u7684\u89C6\u89C9\u8BED\u8A00\uFF0C\u9875\u9762\u5185\u5BB9\u548C\u4EA4\u4E92\u4ECD\u4EE5\u539F\u578B\u4E3A\u51C6",
    recommended: true,
    reason: "\u7528\u6237\u5DF2\u7ECF\u63D0\u4F9B\u4E86\u660E\u786E\u7684\u89C6\u89C9\u53C2\u8003"
  };
  const normalizedOptions = referenceOption === null ? options : [referenceOption, ...options.map((option) => ({ ...option, recommended: false, reason: void 0 }))];
  return {
    id: "visual-direction",
    text: "\u9996\u6B21\u751F\u6210\u60F3\u91C7\u7528\u54EA\u4E00\u79CD\u6574\u4F53\u89C6\u89C9\u65B9\u5411\uFF1F",
    selectionMode: "single",
    minSelections: 1,
    allowOther: true,
    options: normalizedOptions,
    recommendedValues: [normalizedOptions.find((option) => option.recommended)?.id ?? normalizedOptions[0].id]
  };
}
function elementsInPages(elements, pageNames) {
  const allPages = prototypePages(elements);
  const selected = allPages.filter((page) => pageNames.includes(page.name));
  const selectedIds = new Set(selected.map((page) => page.id));
  const elementIds = new Set(selected.flatMap((page) => pageElementIds(page, elements, allPages)));
  const scoped = elements.filter((element) => selectedIds.has(str3(element.id)) || elementIds.has(str3(element.id)));
  const assigned = new Set(allPages.flatMap((page) => [page.id, ...pageElementIds(page, elements, allPages)]));
  const allRelations = prototypePageRelations(elements, allPages);
  const relations = allRelations.filter((relation) => {
    return pageNames.includes(relation.sourcePage) || pageNames.includes(relation.targetPage);
  });
  const relationIds = new Set(allRelations.map((relation) => relation.id));
  const relationLabelIds = new Set(elements.flatMap((element) => {
    return str3(element.type) === "text" && relationIds.has(str3(element.containerId)) ? [str3(element.id)] : [];
  }));
  const pageLabelIds = new Set(elements.flatMap((element) => {
    return str3(customData3(element).role).toLowerCase() === "prototype-page-label" ? [str3(element.id)] : [];
  }));
  const unassignedElementCount = elements.filter((element) => {
    const id = str3(element.id);
    return !assigned.has(id) && !relationIds.has(id) && !relationLabelIds.has(id) && !pageLabelIds.has(id);
  }).length;
  return { pages: selected, elements: scoped, unassignedElementCount, relations };
}
function emptyPageIssues(pages, elements) {
  const allPages = prototypePages(elements);
  return pages.flatMap((page) => {
    const meaningful = elements.some((element) => {
      if (element === page.element || str3(element.type) !== "text" || str3(element.text).trim() === "") return false;
      return pageForElement(element, allPages)?.id === page.id;
    });
    return meaningful ? [] : [{ code: "page-content-missing", id: page.id, message: `${page.name} \u53EA\u6709\u7A7A\u6846\uFF0C\u65E0\u6CD5\u5224\u65AD\u9875\u9762\u5185\u5BB9\u548C\u7528\u9014` }];
  });
}
function elementBelongsToPage(element, page, pages) {
  return pageForElement(element, pages)?.id === page.id;
}
function semanticMockDataIssues(pages, elements) {
  const repeatedContentPage = /列表|好友|聊天|消息|清单|统计|图表|日历|万年历|雷达|推荐|记录|详情/u;
  const genericUiText = /^(?:首页|列表|好友|聊天|消息|清单|统计|日历|雷达|推荐|详情|返回|保存|提交|确认|取消|搜索|筛选|新增|添加|我的|设置|发送|请输入.*)$/u;
  return pages.flatMap((page) => {
    const name2 = page.name;
    if (!repeatedContentPage.test(name2)) return [];
    const texts = elements.filter((element) => element !== page.element && str3(element.type) === "text" && elementBelongsToPage(element, page, pages));
    let records = 0;
    for (const element of texts) {
      const value = str3(element.text).trim();
      if (value === "" || value === name2 || genericUiText.test(value)) continue;
      const role2 = str3((typeof element.customData === "object" && element.customData !== null ? element.customData : {}).role).toLowerCase();
      const lines = value.split(/\r?\n/u).filter((line) => line.trim().length >= 2).length;
      if (role2 === "mock-data" || /\d|·|：|:|公里|km|米|m\b|已|待|完成|进行中|昨天|今天|刚刚/u.test(value) || value.length >= 8) {
        records += Math.max(1, Math.min(3, lines));
      }
    }
    return records >= 3 ? [] : [{
      code: "mock-data-insufficient",
      id: page.id,
      message: `${name2} \u9700\u8981\u81F3\u5C11 3 \u6761\u53EF\u8BFB mock \u6570\u636E\u5E2E\u52A9\u7406\u89E3\u9875\u9762\uFF1B\u5F53\u524D\u8BC6\u522B\u5230 ${records} \u6761`
    }];
  });
}
function recordValue(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function jsonRecordValue(value) {
  if (typeof value !== "string") return recordValue(value);
  try {
    return recordValue(JSON.parse(value));
  } catch {
    return null;
  }
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
  const sourceText = str3(source).trim();
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
  const hashText = str3(expectedHash).trim().toLowerCase();
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
function expectedPageTexts(pages, elements) {
  return Object.fromEntries(pages.map((page) => {
    const name2 = page.name;
    const texts = elements.filter((element) => str3(element.type) === "text" && elementBelongsToPage(element, page, pages)).flatMap((element) => str3(element.text).split(/\r?\n/gu)).map(normalizedVisibleText).filter((value) => value !== "");
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
  const evidence = jsonRecordValue(raw);
  if (evidence === null) {
    return {
      ok: false,
      code: "verification-evidence-missing",
      message: "\u7F3A\u5C11 verificationEvidence\uFF1B\u5FC5\u987B\u63D0\u4EA4\u771F\u5B9E\u6D4F\u89C8\u5668 URL\u3001\u89C6\u53E3\u3001\u9010\u9875\u622A\u56FE\u3001\u63A7\u5236\u53F0\u3001DOM\u3001\u5E03\u5C40\u548C\u6838\u5FC3\u4EA4\u4E92\u8BC1\u636E"
    };
  }
  const missing = [];
  const failures = [];
  const captureId = str3(evidence.captureId).trim();
  if (captureId === "") missing.push("captureId");
  if (str3(evidence.outputSha256).trim().toLowerCase() !== outputHash) failures.push("outputSha256");
  const previewUrl = str3(evidence.previewUrl).trim();
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
    const validViewports = viewports.filter((viewport) => num3(viewport.width) > 0 && num3(viewport.height) > 0);
    for (const viewport of validViewports) viewportKeys.add(num3(viewport.width) + "x" + num3(viewport.height));
    if (validViewports.length !== viewports.length) missing.push("viewports.width/height");
    if ((draft.device === "mobile" || draft.device === "\u79FB\u52A8\u7AEF H5") && !validViewports.some((viewport) => num3(viewport.width) >= 320 && num3(viewport.width) <= 430 && num3(viewport.height) > num3(viewport.width))) {
      missing.push("320-430px mobile viewport");
    }
    if (draft.device === "desktop" && !validViewports.some((viewport) => num3(viewport.width) >= 1024)) {
      missing.push("desktop viewport >= 1024px");
    }
    if (draft.device === "separate") {
      if (!validViewports.some((viewport) => num3(viewport.width) >= 320 && num3(viewport.width) <= 430)) missing.push("mobile viewport");
      if (!validViewports.some((viewport) => num3(viewport.width) >= 1024)) missing.push("desktop viewport");
    }
  }
  const unselectedEvidencePages = draft.hadExistingIndex ? draft.unselectedFrames ?? [] : [];
  const evidencePages = [.../* @__PURE__ */ new Set([...draft.selectedFrames, ...unselectedEvidencePages])];
  const screenshots = recordArray(evidence.screenshots);
  if (screenshots === null || screenshots.length === 0) {
    missing.push("screenshots");
  } else {
    for (const page of evidencePages) {
      const shot = screenshots.find((candidate) => str3(candidate.page).trim() === page);
      if (shot === void 0) {
        missing.push("screenshot:" + page);
        continue;
      }
      if (str3(shot.captureId).trim() !== captureId) failures.push("screenshot:" + page + ":captureId");
      const viewport = str3(shot.viewport).trim();
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
      const snapshot = domSnapshots.find((candidate) => str3(candidate.page).trim() === page);
      if (snapshot === void 0) {
        missing.push("domSnapshot:" + page);
        continue;
      }
      if (str3(snapshot.captureId).trim() !== captureId) failures.push("domSnapshot:" + page + ":captureId");
      const artifact = await workspaceArtifact(root, snapshot.source, snapshot.sha256);
      if (!artifact.ok) {
        failures.push("domSnapshot:" + page + ":" + artifact.reason);
        continue;
      }
      const domHtml = artifact.bytes.toString("utf8");
      if (!/<html(?:\s|>)/iu.test(domHtml) || !/<body(?:\s|>)/iu.test(domHtml)) {
        failures.push("domSnapshot:" + page + ":not-browser-dom");
        continue;
      }
      const bodyText = normalizedVisibleText(domHtml);
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
      const check = checks.find((item) => str3(item.name) === requiredName);
      if (check === void 0 || str3(check.details).trim() === "") missing.push(field + ":" + requiredName);
      else if (check.passed !== true) failures.push(field + ":" + requiredName);
    }
    for (const check of checks) {
      if (check.passed !== true) failures.push(field + ":" + (str3(check.name) || "unnamed"));
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
    referenceStyle: draft.referenceStyle ?? null,
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
function hostQuestionFor2(question) {
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
        askUserQuestionArgs: hostQuestionFor2(draft.currentQuestion)
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
  const allPages = prototypePages(board.value.scene.elements);
  draft.allFrames = allPages.map((page) => page.name);
  draft.unselectedFrames = draft.allFrames.filter((name2) => !draft.selectedFrames.includes(name2));
  draft.expectedPageTexts = expectedPageTexts(allPages, board.value.scene.elements);
  const scope = elementsInPages(board.value.scene.elements, draft.selectedFrames);
  if (scope.pages.length !== draft.selectedFrames.length) {
    const found = new Set(scope.pages.map((page) => page.name));
    const missing = draft.selectedFrames.filter((name2) => !found.has(name2));
    draft.blockers = [{ code: "page-not-found", message: `\u6240\u9009\u9875\u9762\u5DF2\u4E0D\u5728\u753B\u677F\u4E0A\uFF1A${missing.join("\u3001")}` }];
  } else {
    const report = inspectPrototypeLayout(scope.elements);
    draft.blockers = [
      ...report.errors,
      ...emptyPageIssues(scope.pages, scope.elements),
      ...semanticMockDataIssues(scope.pages, scope.elements)
    ];
    draft.warnings = [
      ...report.warnings,
      ...pageMembershipWarnings(board.value.scene.elements, allPages)
    ].filter((warning, index, all) => all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(warning)) === index);
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
  const scope = elementsInPages(board.value.scene.elements, draft.selectedFrames);
  const existing = await store.existingPages(root, draft.board);
  if (!existing.ok) return generateError(existing.error.code, existing.error.message, draft);
  const summary = scope.elements.map(describeElement).join("\n");
  const elementsJson = JSON.stringify(scope.elements);
  const elementsBytes = Buffer.byteLength(elementsJson, "utf8");
  const payload = elementsBytes <= MAX_ELEMENTS_JSON ? scope.elements : [{ id: "__too_large__", type: "text", text: `scoped elements JSON is ${elementsBytes} UTF-8 bytes (> ${MAX_ELEMENTS_JSON}); draw2code_read the board instead` }];
  const quality = inspectPrototypeLayout(scope.elements);
  const layoutIssues = [...quality.errors, ...quality.warnings];
  const visualBrief = visualBriefFor(draft.visualDirection ?? "\u7B80\u6D01\u73B0\u4EE3", draft.device, draft.selectedFrames);
  const instructions = buildGenerateInstructions(draft.board, draft.selectedFrames, existing.value, visualBrief, draft.referenceStyle ?? null) + (layoutIssues.length > 0 ? `
13. \u539F\u578B\u975E\u963B\u65AD\u63D0\u9192\uFF1A
${formatLayoutIssues(layoutIssues)}` : "");
  return responseFromDraft(draft, {
    nextAction: "write-html-then-preview-and-validate",
    scope: "pages",
    pageNames: draft.selectedFrames,
    frameNames: draft.selectedFrames,
    summary,
    elements: payload,
    pageRelations: scope.relations,
    unassignedElementCount: scope.unassignedElementCount,
    unframedElementCount: scope.unassignedElementCount,
    layoutWarnings: layoutIssues,
    existingPages: existing.value,
    outputDir: `draw2code-pages/${draft.board}/`,
    instructions
  });
}
function draw2codeGenerateTool(store, projects) {
  return defineTool2({
    name: "draw2code_generate",
    description: "Turn selected \u753B\u7801 prototype pages into a verified, interactive, single-file HTML Demo through a resumable choice-first flow. New pages use ordinary rectangle page shells; named Excalidraw Frames remain supported as legacy pages. On any explicit \u201C\u751F\u6210\u9875\u9762 / \u6839\u636E\u753B\u677F\u751F\u6210\u524D\u7AEF / \u91CD\u65B0\u751F\u6210\u201D request, first ask once in ordinary chat whether the user has a reference-style image; do not use ask_user_question for that sentence. If the request already includes a reference image, do not ask again. Then call action=start with referenceStyle set to \u201Cnone\u201D or a concise description/path of the inspected reference. Calls missing referenceStyle return a non-native reference-style-prompt instead of creating a session. The first structured question always asks the user to select pages from every recognized page boundary; pass user-mentioned pages only as recommendations, never skip the choice. Use the host choice UI with all returned options. Then answer the returned visual/device question if present. When status=ready, show the brief once and immediately use the host choice UI with the returned confirmation options; never ask the user to type \u201C\u786E\u8BA4\u201D. Map confirm to action=confirm, revise-scope to action=revise questionId=page-scope, and revise-visual to action=revise questionId=visual-direction. The confirmed result carries elements and instructions for you to write index.html. After writing, automatically open the real preview, capture every selected page, inspect the console and DOM/layout, and exercise the core flow; fix implementation defects without asking. Call action=complete with structured verificationEvidence only after preview passes. Self-reported boolean flags are not accepted as evidence. Never report completion before status=completed. If status=blocked, repair the prototype through draw2code_update first, let the user inspect the board, then call action=recheck with the same sessionId/revision; do not repeat completed choices. action=resume restores interrupted work.",
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      action: { type: "string", enum: ["start", "answer", "revise", "resume", "recheck", "confirm", "complete", "abandon"], description: "Generate state-machine action. Omit only for legacy callers; omission behaves as start." },
      name: { type: "string", description: "Board name. Omit to use the board currently selected in the \u753B\u7801 UI." },
      pages: { type: "array", items: { type: "string" }, description: "User-mentioned prototype page names, used only as recommended defaults on action=start." },
      frames: { type: "array", items: { type: "string" }, description: "Deprecated compatibility alias for pages. If both are supplied they must contain the same names." },
      styleNote: { type: "string", description: "An explicit overall visual request; skips the first-time visual choice." },
      referenceStyle: { type: "string", description: "Required for action=start after the ordinary-chat reference-image prompt. Use \u201Cnone\u201D when the user has no reference; otherwise pass a concise inspected-image description or local reference path. This prompt must not use ask_user_question." },
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
          pageNames: { type: "array", items: { type: "string" } },
          frameNames: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          elements: { type: "json" },
          pageRelations: { type: "json" },
          unassignedElementCount: { type: "integer" },
          unframedElementCount: { type: "integer" },
          layoutWarnings: { type: "json" },
          existingPages: { type: "array", items: { type: "string" } },
          outputDir: { type: "string" },
          instructions: { type: "string" },
          validation: { type: "json" },
          prompt: { type: "string" }
        }
      },
      render: (_args, value) => {
        if (value.status === "reference-style-prompt") {
          return text2(`${value.prompt ?? REFERENCE_STYLE_PROMPT}
\u8FD9\u662F\u4E00\u53E5\u666E\u901A\u5BF9\u8BDD\u8BE2\u95EE\uFF0C\u4E0D\u5F97\u8C03\u7528 ask_user_question\u3002\u7528\u6237\u56DE\u7B54\u540E\uFF0C\u7528 referenceStyle=none \u6216\u53C2\u8003\u56FE\u6458\u8981\u91CD\u65B0\u8C03\u7528 action=start\u3002`);
        }
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
        if (typeof args.referenceStyle !== "string" || args.referenceStyle.trim() === "") {
          return {
            status: "reference-style-prompt",
            prompt: REFERENCE_STYLE_PROMPT,
            nextAction: "ask-reference-style-then-start"
          };
        }
        const referenceStyle = normalizeReferenceStyle(args.referenceStyle);
        const target = await resolveBoard(store, args.root, args.name);
        const board = await store.read(args.root, target.name);
        if (!board.ok) return generateError(board.error.code, board.error.message);
        const duplicatePageNames = pageNameWarnings(board.value.scene.elements);
        if (duplicatePageNames.length > 0) {
          return generateError("page-name-duplicate", duplicatePageNames.map((warning) => warning.message).join("\uFF1B"));
        }
        const pages = prototypePages(board.value.scene.elements);
        if (pages.length === 0) return generateError("no-pages", `\u753B\u677F\u300C${target.name}\u300D\u6CA1\u6709\u53EF\u8BC6\u522B\u7684\u539F\u578B\u9875\u9762\uFF1B\u65B0\u9875\u9762\u5E94\u4F7F\u7528 rectangle + customData.role=prototype-page + customData.pageName\uFF0C\u65E7\u547D\u540D Frame \u4ECD\u517C\u5BB9`);
        const allNames = pages.map((page) => page.name);
        const requestedPages = [...new Set((args.pages ?? []).map((name2) => name2.trim()).filter((name2) => name2 !== ""))];
        const requestedFrames = [...new Set((args.frames ?? []).map((name2) => name2.trim()).filter((name2) => name2 !== ""))];
        if (requestedPages.length > 0 && requestedFrames.length > 0 && JSON.stringify([...requestedPages].sort()) !== JSON.stringify([...requestedFrames].sort())) {
          return generateError("page-scope-conflict", "pages \u4E0E deprecated frames \u6307\u5B9A\u4E86\u4E0D\u540C\u9875\u9762\uFF1B\u8BF7\u53EA\u4F20 pages\uFF0C\u6216\u786E\u4FDD\u4E24\u8005\u5185\u5BB9\u5B8C\u5168\u4E00\u81F4");
        }
        const requested = requestedPages.length > 0 ? requestedPages : requestedFrames;
        const missing = requested.filter((name2) => !allNames.includes(name2));
        if (missing.length > 0) return generateError("page-not-found", `\u753B\u677F\u4E0A\u6CA1\u6709\u8FD9\u4E9B\u9875\u9762\uFF1A${missing.join("\u3001")}\u3002\u73B0\u6709\u9875\u9762\uFF1A${allNames.join("\u3001")}`);
        const settings = await store.readGenerateSettings(args.root, target.name);
        if (!settings.ok) return generateError(settings.error.code, settings.error.message);
        const inherited = settings.value === null ? null : str3(settings.value.visualDirection).trim() || null;
        const projectList = projects === void 0 ? null : await projects.list(args.root);
        const project = projectList?.ok === true ? projectList.value.find((candidate) => candidate.boardName === target.name) : void 0;
        const projectBrief = project?.brief;
        const briefPages = Array.isArray(projectBrief?.pages) ? projectBrief.pages.flatMap((value) => {
          if (typeof value === "string") return allNames.includes(value) ? [value] : [];
          if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
          const name2 = str3(value.name).trim();
          return name2 !== "" && allNames.includes(name2) ? [name2] : [];
        }) : [];
        const deferredStyle = str3(project?.deferredStyleNote).trim();
        const connected = directlyConnectedPages(board.value.scene.elements, requested);
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
          currentQuestion: pageScopeQuestion(pages, recommended, recommendationReasons),
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
          referenceStyle,
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
        if (args.questionId === "page-scope") draft.currentQuestion = pageScopeQuestion(prototypePages(board.value.scene.elements), draft.selectedFrames);
        else if (args.questionId === "visual-direction") draft.currentQuestion = visualQuestion(board.value.scene.elements, draft.referenceStyle ?? null);
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
          const scope = elementsInPages(board.value.scene.elements, selectedFrames);
          const inferred = inferDevice(scope.pages);
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
          draft.currentQuestion = visualQuestion(board.value.scene.elements, draft.referenceStyle ?? null);
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

// references/workflow-contract.md
var workflow_contract_default = "# Draw2Code \u591A\u5BBF\u4E3B Workflow Contract\n\n\u8FD9\u4EFD\u5951\u7EA6\u540C\u65F6\u7EA6\u675F DSH guidance\u3001Codex Skill \u548C MCP instructions\u3002\u5BBF\u4E3B Adapter \u53EA\u8D1F\u8D23\u8F93\u5165\u3001\u9009\u62E9\u9898\u4E0E\u5C55\u793A\uFF1BCreate\u3001Update\u3001Generate \u7684\u72B6\u6001\u3001\u5B58\u50A8\u3001\u51B2\u7A81\u548C\u9A8C\u6536\u7531\u5171\u4EAB Runtime \u51B3\u5B9A\u3002\n\n## \u5524\u9192\u4E0E\u4F1A\u8BDD\n\n- \u4EC5\u5728\u7528\u6237\u660E\u786E\u8BF4 `Draw2Code`\u3001`\u753B\u7801`\uFF0C\u6216\u610F\u56FE\u660E\u786E\u4E3A\u201C\u753B\u539F\u578B\u201D\u65F6\u8FDB\u5165 Draw2Code\u3002\u666E\u901A\u201C\u505A\u4E00\u4E2A App / \u5199\u4E00\u4E2A\u9875\u9762\u201D\u4E0D\u81EA\u52A8\u62E6\u622A\u3002\n- \u540C\u4E00\u4EFB\u52A1\u9996\u6B21\u5524\u9192\u540E\u4FDD\u6301 Draw2Code \u4F1A\u8BDD\uFF1B\u540E\u7EED\u201C\u6539\u9996\u9875\u201D\u201C\u751F\u6210\u9875\u9762\u201D\u4E0D\u8981\u6C42\u91CD\u590D\u5524\u9192\u8BCD\u3002\n- \u201C\u6253\u5F00 Draw2Code / \u753B\u7801\u201D\u201C\u6211\u81EA\u5DF1\u753B\u4E00\u4E0B\u201D\u201C\u6211\u753B\u4E2A\u793A\u610F\u7ED9\u4F60\u201D\u7531\u72EC\u7ACB `draw2code-open` \u5FEB\u901F\u5165\u53E3\u5904\u7406\uFF0C\u53EA\u8C03\u7528\u4E00\u6B21 `draw2code_open`\uFF1A\u4E0D\u8BFB\u53D6\u672C\u5951\u7EA6\u7684\u5176\u4F59\u5DE5\u4F5C\u6D41\uFF0C\u4E0D\u8C03\u7528\u5176\u4ED6 Draw2Code \u5DE5\u5177\uFF0C\u4E0D\u8FDB\u5165\u4EE3\u8868\u9875\u590D\u6838\u6216\u8D28\u91CF\u95E8\u7981\uFF1B\u6709 active board \u5C31\u6062\u590D\uFF0C\u6CA1\u6709\u5219\u5C55\u793A\u7A7A\u72B6\u6001\u4E0E\u521B\u5EFA\u5165\u53E3\u3002\n- \u201C\u6211\u753B\u597D\u4E86\u201D\u201C\u6309\u6211\u753B\u7684\u770B\u770B\u201D\u5148\u8C03\u7528 `draw2code_read` \u8BFB\u53D6\u5F53\u524D\u53EF\u89C1\u753B\u677F\u5E76\u590D\u8FF0\u9875\u9762\u3001\u7EC4\u4EF6\u548C\u4EA4\u4E92\uFF1B\u7528\u6237\u6CA1\u6709\u8981\u6C42\u65F6\u4E0D\u81EA\u52A8\u4FEE\u6539\u6216\u751F\u6210\u3002\n\n## \u5DE5\u5177\u987A\u5E8F\n\n- \u65B0\u4EA7\u54C1\u5148\u8D70 `draw2code_create` \u7684\u53EF\u6062\u590D\u72B6\u6001\u673A\u3002`start` \u8FD4\u56DE `discovery` \u540E\uFF0CAgent \u6839\u636E\u5DF2\u660E\u786E\u4E8B\u5B9E\u3001\u5386\u53F2\u56DE\u7B54\u548C `recommendedDimensions` \u9009\u62E9\u5F53\u524D\u6700\u9AD8\u5F71\u54CD\u7684\u672A\u77E5\u9879\uFF1B\u7B2C\u4E00\u9898\u5FC5\u987B\u4F18\u5148\u91C7\u7528\u63A8\u8350\u7EF4\u5EA6\uFF0C\u4E0D\u80FD\u5148\u95EE\u6A21\u5757\u3001\u9875\u9762\u6216\u901A\u7528\u4FE1\u606F\u67B6\u6784\u3002\u666E\u901A\u5F85\u529E\u4F18\u5148\u6DF1\u6316\u89E6\u53D1\u573A\u666F\u6216\u73B0\u6709\u66FF\u4EE3\uFF0C\u96F7\u8FBE\u793E\u4EA4\u4F18\u5148\u6DF1\u6316\u4FE1\u4EFB\u4E0E\u72EC\u7279\u8FDE\u63A5\u673A\u5236\uFF0C\u7A7F\u642D\u4EA7\u54C1\u4F18\u5148\u6DF1\u6316\u63A8\u8350\u4F9D\u636E\u6216\u4F7F\u7528\u65F6\u523B\u3002\u4FE1\u606F\u4E0D\u8DB3\u65F6\u8C03\u7528 `propose_question`\uFF0C\u6BCF\u6B21\u53EA\u5C55\u793A\u4E00\u4E2A\u5E26 insight\u3001\u53D6\u820D\u8BF4\u660E\u548C\u63A8\u8350\u9879\u7684\u7ED3\u6784\u5316\u95EE\u9898\uFF1B\u4FE1\u606F\u8DB3\u591F\u6216\u7528\u6237\u8981\u6C42\u505C\u6B62\u65F6\u8C03\u7528 `synthesize`\u3002\u7981\u6B62\u56FA\u5B9A\u8BE2\u95EE\u5E73\u53F0\u3001\u7528\u6237\u3001\u76EE\u6807\u3001\u6D41\u7A0B\u3001\u6A21\u5757\u548C\u9875\u9762\uFF0C\u6700\u591A\u63D0\u95EE 10 \u6B21\u3002\n- `synthesize` \u63D0\u4EA4\u4E00\u4EFD\u7ED3\u6784\u5316 `PrototypeBrief`\uFF1B\u5DE5\u5177\u6821\u9A8C\u540E\u786E\u5B9A\u6027\u751F\u6210\u5B8C\u6574 `briefMarkdown`\u3001`pageBlueprints` \u548C `pageMockData`\u3002`ready` \u65F6\u5FC5\u987B\u5B8C\u6574\u5C55\u793A\u8BE5 Markdown\uFF0C\u4E0D\u80FD\u81EA\u884C\u7F29\u5199\uFF1B\u968F\u540E\u7528\u6700\u540E\u4E00\u5F20\u9875\u9762\u8303\u56F4\u786E\u8BA4\u5361\u660E\u786E\u5217\u51FA\u5C06\u7ED8\u5236\u7684\u9875\u9762\uFF0C\u53EA\u8FDB\u884C\u4E00\u6B21\u201C\u786E\u8BA4\u8FD9\u4E9B\u9875\u9762\u5E76\u7ED8\u5236 / \u8C03\u6574\u9875\u9762\u8303\u56F4 / \u8C03\u6574\u4EA7\u54C1\u65B9\u5411\u201D\u786E\u8BA4\u3002\n- \u6BCF\u9053\u539F\u751F\u95EE\u9898\u5361\u7247\u90FD\u4FDD\u7559\u201C\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5\u201D\uFF1B\u9009\u62E9\u540E\u6309 `synthesize-now` \u56DE\u7B54\uFF0C\u5DE5\u5177\u660E\u786E\u8FD4\u56DE `nextAction=synthesize`\u3002\u7528\u6237\u8DF3\u8FC7\u5F53\u524D\u95EE\u9898\u65F6\u8C03\u7528 `skip` \u5E76\u628A\u8BE5\u9879\u4FDD\u7559\u4E3A\u5F85\u9A8C\u8BC1\u5047\u8BBE\uFF1B\u5373\u4F7F\u5DF2\u6709\u5F85\u7B54\u95EE\u9898\u4E5F\u53EF\u8C03\u7528 `synthesize`\u3002`ready` \u540E\u9009\u62E9\u8C03\u6574\u65F6\u76F4\u63A5\u8C03\u7528 `propose_question` \u8FFD\u95EE\u53D7\u5F71\u54CD\u7684\u4E00\u9879\uFF0C\u65E7\u7B80\u62A5\u5931\u6548\uFF0C\u56DE\u7B54\u540E\u5FC5\u987B\u91CD\u65B0\u751F\u6210\u5B8C\u6574\u7B80\u62A5\u3002\n- Create \u8FD4\u56DE `confirmed` \u540E\uFF0C\u6309 `boardName`\u3001\u540C\u4E00\u4EFD `brief` \u548C\u7ED3\u6784\u5316 `drawingPlan` \u8C03\u7528 `draw2code_update`\u3002\u5F53 `drawingPlan.nextActionCode=write_representative` \u65F6\uFF0C\u672C\u8F6E\u53EA\u4E3A `allowedPageIds` \u751F\u6210 ops\uFF0C\u4E0D\u80FD\u9884\u5148\u6784\u9020\u5168\u90E8\u9875\u9762\u3002\u4EE3\u8868\u9875\u5199\u5165\u540E\u7B49\u5F85 Canvas \u6D88\u8D39\u8FD4\u56DE\u7684 reveal\uFF0C\u518D\u4EE5 `action=review`\u3001`reviewToken`\u3001`phase=representative`\u3001`passed=true`\u3001`inspectedPageIds` \u548C `observations` \u5355\u72EC\u8BB0\u5F55\u53EF\u89C1\u590D\u6838\uFF1Breview \u4E0D\u4F20 ops\u3001\u4E0D\u6539\u53D8 revision\u3001\u4E0D\u53D1\u5E03\u65B0 reveal\u3002\u5DE5\u5177\u8FD4\u56DE `nextActionCode=write_remaining_pages` \u540E\u624D\u751F\u6210 `remainingPageIds`\u3002\u5982\u679C Agent \u8BEF\u5728\u590D\u6838\u524D\u63D0\u4EA4\u5176\u4F59\u9875\u9762\uFF0C\u5DE5\u5177\u8FD4\u56DE `nextActionCode=review_representative` \u548C `pendingUpdateId`\uFF0C\u5E76\u4FDD\u7559\u8BE5\u6279 ops\uFF1B\u5B8C\u6210\u4EE3\u8868\u9875\u590D\u6838\u540E\u7528 `action=commit_pending` \u548C\u8BE5 ID \u63D0\u4EA4\uFF0C\u4E0D\u91CD\u65B0\u751F\u6210\u6216\u91CD\u4F20 ops\u3002\u5168\u90E8\u9875\u9762\u5B8C\u6210\u540E\u7528 `action=review`\u3001`phase=final` \u8986\u76D6\u6240\u6709 page id\u3002\u65E7 `visualReview` \u53EA\u4FDD\u7559\u517C\u5BB9\uFF1B\u65B0\u6D41\u7A0B\u4E0D\u624B\u5DE5\u62FC `rev` \u4E0E `revealRequestId`\u3002\u5DF2\u6709\u753B\u677F\u5148\u7528 `draw2code_read detail=index` \u53D6\u5F97\u9875\u9762 id\u3001`capacity`\u3001`continuation` \u548C\u4E0D\u900F\u660E ID\uFF1B\u9700\u8981\u5143\u7D20\u5185\u5BB9\u65F6\u53EA\u6309\u76EE\u6807 `pageIds`\u3001`elementIds`\u3001\u533A\u57DF\u6216 `changesSince` \u7EE7\u7EED\u8BFB\u53D6\uFF0C\u4E0D\u641C\u7D22\u4F1A\u8BDD\u5386\u53F2\uFF0C\u4E5F\u4E0D\u9ED8\u8BA4\u8BFB\u53D6\u6574\u677F\u3002\n- \u5BB9\u91CF\u5206\u4E24\u5C42\u5904\u7406\uFF1A\u5355\u6B21 ops \u8D85\u8FC7 500 \u9879\u6216 512 KiB \u65F6\u8FD4\u56DE `nextActionCode=reduce_batch_size`\uFF0C\u6309\u9875\u9762\u6216\u72EC\u7ACB\u6539\u52A8\u62C6\u6279\uFF1B\u753B\u677F\u6CA1\u6709\u65E5\u5E38\u4E1A\u52A1\u914D\u989D\uFF0C\u9ED8\u8BA4 32 MiB \u53EA\u6807\u8BB0 large\uFF0C256 MiB / 50,000 \u5143\u7D20\u662F\u53EF\u914D\u7F6E\u7684\u5F02\u5E38\u4FDD\u9669\u4E1D\u3002\u771F\u6B63\u89E6\u53D1\u4FDD\u9669\u4E1D\u65F6\u8FD4\u56DE `nextActionCode=archive_or_split_board`\uFF0C\u7F29\u5C0F\u540C\u4E00\u6539\u52A8\u6279\u6B21\u6CA1\u6709\u4F5C\u7528\u3002`capacity` \u5206\u522B\u62A5\u544A canonical\u3001persisted\u3001asset \u4E0E element \u6307\u6807\uFF0C`history` \u72EC\u7ACB\u62A5\u544A gzip checkpoint / delta \u7684\u5386\u53F2\u5360\u7528\u4E0E\u9884\u7B97\uFF1B`update.timings` \u7684\u8303\u56F4\u4EC5\u4E3A\u5DE5\u5177\u6267\u884C\uFF0C\u4E0D\u5305\u542B\u8C03\u7528\u524D\u7684 Agent \u63A8\u7406\u3002\n- \u7701\u7565 `board` / DSH \u7684 `name` \u59CB\u7EC8\u8868\u793A\u7528\u6237\u5F53\u524D\u53EF\u89C1 active board\u3002\u53EA\u6709\u7528\u6237\u660E\u786E\u70B9\u540D\u53E6\u4E00\u5757\u753B\u677F\u65F6\u624D\u663E\u5F0F\u4F20\u5165\u3002\n- MCP/Codex \u4ECE workspace \u5185\u7684\u5B50\u76EE\u5F55\u8C03\u7528\u65F6\uFF0C\u6240\u6709\u753B\u677F\u64CD\u4F5C\u7EDF\u4E00\u5F52\u5230\u5BBF\u4E3B\u6CE8\u518C\u7684 workspace root\uFF1B\u4E0D\u80FD\u56E0\u5F53\u524D cwd \u662F\u5B50\u4ED3\u5E93\u800C\u6084\u6084\u521B\u5EFA\u7B2C\u4E8C\u5957\u753B\u677F\u3002\n- Update \u8FD4\u56DE `requiresConfirmation=true` \u65F6\u505C\u6B62\u5199\u5165\u5E76\u53EA\u8BE2\u95EE\u51B2\u7A81\u8986\u76D6\uFF1B\u5F97\u5230\u786E\u8BA4\u540E\u624D\u4EE5 `force=true` \u91CD\u8BD5\u3002\u4E0D\u5F97\u76F4\u63A5\u5199 `.excalidraw.json` \u7ED5\u8FC7 CAS\u3001\u5E03\u5C40\u95E8\u7981\u548C\u56DE\u8BFB\u9A8C\u8BC1\u3002\n- Generate \u5F00\u59CB\u524D\u5148\u7528\u666E\u901A\u5BF9\u8BDD\u8BE2\u95EE\u7528\u6237\u662F\u5426\u6709\u53C2\u8003\u98CE\u683C\u56FE\u7247\uFF0C\u4E0D\u4F7F\u7528\u5BBF\u4E3B\u9009\u62E9\u9898\uFF1B\u7528\u6237\u5DF2\u9644\u56FE\u65F6\u4E0D\u91CD\u590D\u95EE\u3002\u6709\u56FE\u5219\u67E5\u770B\u540E\u628A\u7B80\u6D01\u6458\u8981\u6216\u8DEF\u5F84\u4F20\u4E3A `referenceStyle`\uFF0C\u6CA1\u6709\u5219\u4F20 `none`\u3002\u968F\u540E\u5FC5\u987B\u6CBF\u7528\u5DE5\u5177\u8FD4\u56DE\u7684 session\u3001revision\u3001question \u4E0E confirmation\uFF1B\u7B2C\u4E00\u5F20\u7ED3\u6784\u5316\u9009\u62E9\u9898\u4ECD\u7136\u662F\u9875\u9762\u591A\u9009\uFF0C\u53EA\u6709 `status=completed` \u4E14\u9A8C\u8BC1\u8BC1\u636E\u901A\u8FC7\u540E\u624D\u80FD\u62A5\u544A\u751F\u6210\u5B8C\u6210\u3002\n\n## \u5C55\u793A\u4E0E\u5171\u540C\u7F16\u8F91\n\n- MCP/Codex \u7684 `draw2code_open` \u9ED8\u8BA4\u4F7F\u7528 `presentation=handoff`\uFF0C\u4E0D\u6CE8\u518C\u9759\u6001 `openai/outputTemplate`\uFF0C\u4E5F\u4E0D\u628A\u52A8\u6001 localhost \u753B\u677F\u5957\u8FDB MCP App iframe\u3002\u5DE5\u5177\u53EA\u51C6\u5907\u77ED\u671F URL \u5E76\u8FD4\u56DE `displayState=handoff-ready`\uFF1B`auto` \u4E0E `inline` \u4EC5\u4F5C\u4E3A\u517C\u5BB9\u522B\u540D\uFF0C\u540C\u6837\u56DE\u9000\u5230 handoff\u3002\u53EA\u6709\u7528\u6237\u660E\u786E\u8981\u6C42\u5916\u90E8\u6D4F\u89C8\u5668\u65F6\u624D\u4F7F\u7528 `presentation=browser`\u3002\n- \u5BBF\u4E3B\u8D1F\u8D23\u628A handoff URL \u5BFC\u822A\u5230\u81EA\u5DF1\u7684\u4FA7\u8FB9\u680F\u6216\u6D4F\u89C8\u5668\u5E76\u9A8C\u8BC1\u53EF\u89C1\u6027\u3002\u5355\u7EAF\u5BFC\u822A\u4F18\u5148\u4F7F\u7528\u5BBF\u4E3B\u539F\u751F\u80FD\u529B\uFF0C\u4E0D\u4E3A\u6B64\u521D\u59CB\u5316\u901A\u7528\u6D4F\u89C8\u5668\u81EA\u52A8\u5316\uFF1B\u53EA\u6709\u9700\u8981 DOM\u3001\u63A7\u5236\u53F0\u6216\u4EA4\u4E92\u8BC1\u636E\u65F6\u624D\u63A5\u7BA1\u6D4F\u89C8\u5668\u3002\u53EA\u6709\u753B\u5E03\u771F\u6B63\u53EF\u89C1\u540E\uFF0CAgent \u624D\u80FD\u62A5\u544A\u201C\u5DF2\u6253\u5F00\u201D\uFF1B\u4E0D\u80FD\u628A URL \u5C31\u7EEA\u6216 daemon \u542F\u52A8\u6210\u529F\u5F53\u4F5C\u53EF\u89C1\u6027\u8BC1\u636E\u3002\u82E5\u672A\u6765\u9700\u8981\u5BF9\u8BDD\u5185\u5D4C\u753B\u677F\uFF0C\u5FC5\u987B\u5355\u72EC\u5B9E\u73B0\u76F4\u63A5\u8FD0\u884C Canvas \u7684 MCP App\uFF0C\u4E0D\u80FD\u6062\u590D\u52A8\u6001 localhost iframe \u58F3\u3002\n- \u540C\u4E00 workspace \u7684\u5916\u90E8\u6D4F\u89C8\u5668\u53EA\u9996\u6B21\u6253\u5F00\u4E00\u6B21\uFF1B\u540E\u7EED\u590D\u7528\u73B0\u6709\u6807\u7B7E\u9875\u5E76\u4F9D\u9760\u4E8B\u4EF6\u5237\u65B0\uFF0C\u4E0D\u80FD\u53CD\u590D\u62A2\u7126\u70B9\u3002\n- `verified=true` / `writeVerified=true` \u53EA\u8BC1\u660E\u76EE\u6807\u753B\u677F\u5199\u76D8\u5E76\u56DE\u8BFB\uFF0C\u4E0D\u4EE3\u8868\u539F\u578B\u5DF2\u7ECF\u5B8C\u6210\u3002\u6210\u529F write \u4F1A\u628A\u76EE\u6807\u8BBE\u4E3A active board\u3001\u53D1\u5E03\u5E26\u76EE\u6807 revision \u7684 reveal request\u3001\u8FD4\u56DE\u4E0D\u900F\u660E `reviewToken` \u5E76\u81EA\u52A8\u6253\u5F00\u753B\u7801\uFF1BCanvas \u5B9E\u9645\u52A0\u8F7D\u5230\u540C\u4E00 board + revision \u540E\u624D\u56DE\u4F20\u6D88\u8D39\u786E\u8BA4\u3002`action=review` \u53EA\u8BB0\u5F55\u8BE5\u53EF\u89C1\u7248\u672C\u7684 review receipt\uFF0C\u8FD4\u56DE `reviewVerified=true`\uFF0C\u4E0D\u4F1A\u5199\u753B\u677F\u6216\u53D1\u5E03\u65B0 reveal\uFF1B\u91CD\u590D\u63D0\u4EA4\u540C\u4E00 token \u662F\u5E42\u7B49\u7684\u3002\u53EA\u6709 final review \u8FD4\u56DE `completionReady=true` \u624D\u8BF4\u660E\u6700\u7EC8\u89C6\u89C9\u590D\u6838\u5DF2\u8986\u76D6\u5168\u90E8\u9875\u9762\uFF0C\u5373\u4F7F\u5982\u6B64\uFF0C\u4ECD\u5E94\u628A `prototypeQuality.warnings` \u4F5C\u4E3A\u7EE7\u7EED\u6253\u78E8\u4F9D\u636E\u3002\n- \u7528\u6237\u62D6\u52A8\u4EA7\u751F\u7684 scene write \u4E0E Agent update \u90FD\u901A\u8FC7 daemon\uFF1BWebSocket \u662F\u4E3B\u901A\u77E5\u901A\u9053\uFF0Crevision polling \u662F\u65AD\u7EBF\u964D\u7EA7\u3002\n- \u72EC\u7ACB\u753B\u7801\u53EF\u4EE5\u5217\u51FA\u5F53\u524D workspace \u548C\u672C\u673A\u5DF2\u7531\u5BBF\u4E3B\u660E\u786E\u6CE8\u518C\u3001\u6301\u4E45\u5316\u4E14\u786E\u5B9E\u542B\u6709\u753B\u677F\u7684\u5176\u4ED6 workspace\uFF1B\u63D2\u4EF6\u7F13\u5B58\u548C\u7A7A root \u4E0D\u8FDB\u5165\u5207\u6362\u83DC\u5355\u3002\u5207\u6362\u524D\u5FC5\u987B\u5148\u843D\u76D8\u5F53\u524D\u5F85\u4FDD\u5B58\u7F16\u8F91\uFF0C\u518D\u7528\u5F53\u524D\u77ED\u671F\u4F1A\u8BDD\u6362\u53D6\u76EE\u6807 root \u7684\u65B0 workspace-scoped token\u3002\u65E7 token \u4E0D\u80FD\u76F4\u63A5\u8BBF\u95EE\u76EE\u6807 root\uFF0CAgent \u5DE5\u5177\u9ED8\u8BA4\u8303\u56F4\u4E5F\u4E0D\u80FD\u56E0\u4E3A UI \u5207\u6362\u800C\u6269\u5927\u3002\n\n## \u6570\u636E\u4E0E\u5B89\u5168\n\n- \u539F\u4F4D\u4F7F\u7528 `draw2code/`\u3001`.active-board.json`\u3001`.projects/`\u3001`.generations/`\u3001`.generate-settings/` \u4E0E `draw2code-pages/`\uFF0C\u4E0D\u5F97\u590D\u5236\u3001\u5BFC\u5165\u6216\u4E3B\u52A8\u8FC1\u79FB\u65E7\u6570\u636E\u3002\n- \u6240\u6709 root \u90FD\u5FC5\u987B realpath \u540E\u843D\u5728 HostContext \u6CE8\u518C workspace \u5185\u3002daemon \u53EA\u76D1\u542C loopback\uFF1B\u4E3B bearer \u4E0D\u8FDB\u5165\u753B\u677F\u9875\u9762\uFF0C\u9875\u9762\u53EA\u6536\u5230\u77ED\u671F\u3001\u6D3B\u52A8\u7EED\u671F\u7684 workspace-scoped token\uFF0C\u53EF\u5728\u8BE5 root \u5185\u7BA1\u7406\u591A\u4E2A\u753B\u677F\u4F46\u4E0D\u80FD\u8DE8 root \u8BBF\u95EE\u3002\n- \u4E0D\u4E0A\u4F20\u753B\u677F\u3001brief\u3001\u9875\u9762\u6216\u9A8C\u8BC1\u8BC1\u636E\u3002\u5355\u753B\u677F\u5143\u7D20\u6570\u3001UTF-8 byte \u4E0A\u9650\u3001\u5386\u53F2\u7248\u672C\u4E0E\u751F\u6210\u8BC1\u636E\u95E8\u7981\u4FDD\u6301\u6709\u6548\u3002\n- \u4E0D\u9012\u5F52\u626B\u63CF\u6574\u53F0\u7535\u8111\u5BFB\u627E workspace\uFF0C\u4E5F\u4E0D\u81EA\u52A8\u590D\u5236\u3001\u5408\u5E76\u6216\u8FC1\u79FB\u4E0D\u540C root \u7684\u753B\u677F\uFF1B\u65B0\u6253\u5F00\u7684\u753B\u7801\u53EA\u83B7\u5F97\u6253\u5F00\u5F53\u65F6\u5DF2\u6CE8\u518C workspace \u7684\u5FEB\u7167\u3002\n";

// src/guidance.ts
var SECTION_ORDER = 220;
var DRAW2CODE_GUIDANCE = [
  "\u65B0\u9879\u76EE\u547D\u540D\u5951\u7EA6\uFF1A\u8C03\u7528 draw2code_create action=start \u524D\uFF0CAgent \u5FC5\u987B\u7406\u89E3\u5B8C\u6574 idea\uFF0C\u5E76\u76F4\u63A5\u6982\u62EC\u4E00\u4E2A\u901A\u5E38\u4E3A 4\u201312 \u4E2A\u4E2D\u6587\u5B57\u7B26\u7684\u8BED\u4E49\u5316 projectName\uFF1B\u540D\u79F0\u5E94\u8BA9\u7528\u6237\u4E00\u773C\u77E5\u9053\u4EA7\u54C1\u662F\u4EC0\u4E48\uFF0C\u4E0D\u80FD\u590D\u5236\u539F\u8BDD\u3001\u622A\u53D6\u524D N \u4E2A\u5B57\u7B26\u6216\u4F9D\u8D56\u5173\u952E\u8BCD\u62FC\u63A5\u89C4\u5219\u3002idea \u4ECD\u5B8C\u6574\u4FDD\u7559\uFF0CprojectName \u5FC5\u987B\u4F5C\u4E3A\u72EC\u7ACB\u53C2\u6570\u663E\u5F0F\u4F20\u5165\u3002\u5DE5\u5177\u53EA\u6821\u9A8C\u540D\u79F0\u662F\u5426\u5408\u6CD5\uFF0C\u4E0D\u8D1F\u8D23\u4ECE idea \u751F\u6210\u540D\u79F0\uFF1B\u786E\u8BA4\u540E\u753B\u677F\u540D\u76F4\u63A5\u4F7F\u7528 projectName\uFF0C\u4E0D\u8FFD\u52A0\u201C\u539F\u578B\u201D\u201C\u8349\u7A3F\u201D\u7B49\u6D41\u7A0B\u540E\u7F00\u3002",
  'draw2code_update \u8C03\u7528\u5951\u7EA6\uFF1A\u63A8\u8350\u628A\u6BCF\u4E2A\u5143\u7D20\u5199\u6210 {op:"upsert",element:{id,type,x,y,...}}\uFF1B\u5DE5\u5177\u4E5F\u517C\u5BB9\u4E09\u79CD\u65E0\u6B67\u4E49 upsert \u7B80\u5199\u2014\u2014\u76F4\u63A5\u5143\u7D20 {id,type,...}\u3001\u7701\u7565 op \u7684 {element:{...}}\u3001\u4EE5\u53CA {op:"upsert",id,type,...}\u3002delete \u63A8\u8350 {op:"delete",id}\uFF0C\u540C\u65F6\u517C\u5BB9 id \u5199\u5728 elementId \u6216 element.id\u3002\u65B0\u9875\u9762\u5FC5\u987B\u4F7F\u7528\u666E\u901A rectangle \u5916\u6846\uFF0C\u8BBE\u7F6E customData.role=prototype-page\u3001customData.pageName \u548C customData.mockDataMin\uFF1B\u9875\u9762\u540D\u7528\u5916\u6846\u4E0A\u65B9\u72EC\u7ACB text\uFF0C\u8BBE\u7F6E role=prototype-page-label \u4E0E pageId\u3002\u9875\u9762\u5B50\u5143\u7D20\u4F7F\u7528\u753B\u5E03\u7EDD\u5BF9\u5750\u6807\u5E76\u4FDD\u6301 frameId=null\uFF0C\u9875\u9762\u5F52\u5C5E\u7531\u51E0\u4F55\u4F4D\u7F6E\u5224\u65AD\u3002\u5DF2\u6709\u547D\u540D Frame \u7EE7\u7EED\u517C\u5BB9\uFF1B\u5176 frameId \u5B50\u5143\u7D20\u4ECD\u652F\u6301\u5B89\u5168\u7684\u5C40\u90E8\u5750\u6807\u6362\u7B97\uFF0C\u4F46\u4E0D\u4F1A\u81EA\u52A8\u8FC1\u79FB\u3002',
  "\u672C\u673A\u5DF2\u5B89\u88C5 dsh-draw2code \u63D2\u4EF6\uFF08\u753B\u7801 \xB7 Draw2Code\uFF09\uFF1ADSH Web GUI \u53F3\u4FA7 better-sidebar \u8FB9\u680F\u91CC\u7684\u300C\u753B\u7801\u300D\u6807\u7B7E\u9875\u3002\u4EC5\u5F53\u7528\u6237\u660E\u786E\u8BF4 Draw2Code\u3001\u753B\u7801\uFF0C\u6216\u610F\u56FE\u660E\u786E\u4E3A\u201C\u753B\u539F\u578B\u201D\u65F6\u8FDB\u5165\u672C\u5DE5\u4F5C\u6D41\uFF1B\u666E\u901A\u7F16\u7801\u8BF7\u6C42\u4E0D\u81EA\u52A8\u62E6\u622A\u3002\u540C\u4E00\u4EFB\u52A1\u9996\u6B21\u5524\u9192\u540E\u4FDD\u6301 Draw2Code \u4F1A\u8BDD\u3002\u65B0\u9879\u76EE\u5148\u8C03\u7528 draw2code_create action=start\uFF0C\u5FE0\u5B9E\u4F20\u5165 idea \u548C Agent \u6982\u62EC\u7684 projectName\uFF0C\u7981\u6B62\u76F4\u63A5 draw2code_update\u3002status=discovery \u65F6\uFF0C\u5148\u8BFB\u53D6 explicitFacts\u3001\u5386\u53F2\u56DE\u7B54\u3001recommendedDimensions \u548C\u5269\u4F59\u9884\u7B97\uFF1A\u7B2C\u4E00\u9898\u5FC5\u987B\u4F18\u5148\u4ECE recommendedDimensions \u524D\u4E24\u9879\u4E2D\u9009\u62E9\uFF0C\u4E0D\u5F97\u5148\u95EE\u6A21\u5757\u3001\u9875\u9762\u6216\u901A\u7528\u4FE1\u606F\u67B6\u6784\uFF1B\u666E\u901A\u5F85\u529E\u5148\u6311\u6218\u5177\u4F53\u89E6\u53D1\u573A\u666F\u6216\u73B0\u6709\u66FF\u4EE3\uFF0C\u96F7\u8FBE\u793E\u4EA4\u5148\u95EE\u4FE1\u4EFB\u4E0E\u72EC\u7279\u8FDE\u63A5\u673A\u5236\uFF0C\u7A7F\u642D\u4EA7\u54C1\u5148\u95EE\u63A8\u8350\u4F9D\u636E\u6216\u4F7F\u7528\u65F6\u523B\u3002\u4FE1\u606F\u4E0D\u8DB3\u5C31\u56F4\u7ED5\u5F53\u524D\u6700\u9AD8\u5F71\u54CD\u7684\u672A\u77E5\u9879\u8C03\u7528 action=propose_question\uFF1Bquestion.text \u5FC5\u987B\u76F4\u63A5\u5199\u6210\u201C\u5224\u65AD\uFF1A{insight}\\n\\n\u95EE\u9898\uFF1A{\u51B3\u7B56\u95EE\u9898}\u201D\uFF0Coptions \u9664\u4EA7\u54C1\u65B9\u5411\u5916\u5FC5\u987B\u663E\u5F0F\u5E26\u4E0A\u201C\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5 / \u8FD8\u6CA1\u60F3\u597D / \u5176\u4ED6\u201D\uFF0C\u5426\u5219\u5DE5\u5177\u4F1A\u62D2\u7EDD\uFF0C\u907F\u514D Agent \u91CD\u7EC4\u5361\u7247\u65F6\u5220\u6389\u5173\u952E\u4FE1\u606F\u3002\u4FE1\u606F\u8DB3\u591F\u6216\u7528\u6237\u8981\u6C42\u76F4\u63A5\u6574\u7406\u65F6\u8C03\u7528 action=synthesize\u3002status=question \u65F6\u7528\u5BBF\u4E3B ask_user_question \u539F\u6837\u5C55\u793A\u4E00\u4E2A\u95EE\u9898\u548C\u5168\u90E8\u9009\u9879\uFF0C\u518D action=answer\uFF1B\u7528\u6237\u8DF3\u8FC7\u65F6\u8C03\u7528 action=skip\uFF0C\u7528\u6237\u8981\u6C42\u76F4\u63A5\u6574\u7406\u65F6\u53EF\u76F4\u63A5 action=synthesize\u3002status=ready \u65F6\u5FC5\u987B\u5B8C\u6574\u5C55\u793A briefMarkdown\uFF0C\u4E0D\u80FD\u538B\u7F29\u6210\u56DE\u7B54\u6458\u8981\uFF1B\u6700\u540E\u518D\u5C55\u793A\u4E00\u5F20\u660E\u786E\u5217\u51FA\u5168\u90E8\u9875\u9762\u7684\u9875\u9762\u8303\u56F4\u786E\u8BA4\u5361\uFF0C\u53EA\u63D0\u4F9B\u201C\u786E\u8BA4\u8FD9\u4E9B\u9875\u9762\u5E76\u7ED8\u5236 / \u8C03\u6574\u9875\u9762\u8303\u56F4 / \u8C03\u6574\u4EA7\u54C1\u65B9\u5411\u201D\u3002\u7528\u6237\u9009\u62E9\u8C03\u6574\u65F6\uFF0C\u76F4\u63A5\u7528 action=propose_question \u8FFD\u95EE\u53D7\u5F71\u54CD\u7684\u4E00\u9879\uFF0C\u5DE5\u5177\u4F1A\u6E05\u9664\u65E7\u7B80\u62A5\uFF0C\u56DE\u7B54\u540E\u91CD\u65B0 synthesize \u5B8C\u6574\u7B80\u62A5\u3002\u786E\u8BA4\u540E action=confirm\uFF0C\u62FF\u5230 boardName \u624D\u8C03\u7528 draw2code_update\u3002\u5DF2\u6709\u9879\u76EE\u5148 draw2code_read \u518D update\uFF1B\u6839\u636E\u753B\u677F\u751F\u6210\u9875\u9762\u65F6\u8C03\u7528 draw2code_generate\u3002",
  "draw2code_create \u81EA\u9002\u5E94\u6DF1\u6316 SOP\uFF1A\u7981\u6B62\u56FA\u5B9A\u4F9D\u6B21\u8BE2\u95EE\u5E73\u53F0\u3001\u7528\u6237\u3001\u76EE\u6807\u3001\u6D41\u7A0B\u3001\u6A21\u5757\u548C\u9875\u9762\uFF0C\u4E5F\u7981\u6B62\u628A\u6A21\u5757\u4E0E\u9875\u9762\u62C6\u6210\u4E24\u9053\u6E05\u5355\u9898\u3002\u7528\u6237\u539F\u8BDD\u5DF2\u660E\u786E\u7684\u4E8B\u5B9E\u4E0D\u80FD\u91CD\u590D\u8FFD\u95EE\u3002\u6BCF\u9898\u5FC5\u987B\u5305\u542B\u57FA\u4E8E\u5F53\u524D\u4EA7\u54C1\u7684 insight\u3001\u4E00\u4E2A\u4F1A\u6539\u53D8\u4EA7\u54C1\u65B9\u5411\u7684\u95EE\u9898\u30012\u20134 \u4E2A\u6709\u771F\u5B9E\u53D6\u820D\u7684\u9009\u9879\u3001recommendedOptionId\u3001decisionImpact \u548C dependsOn\uFF1B\u5DE5\u5177\u81EA\u52A8\u8865\u5145\u201C\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5\u201D\u201C\u8FD8\u6CA1\u60F3\u597D\u201D\u548C\u201C\u5176\u4ED6\u201D\u3002\u7528\u6237\u9009\u62E9 synthesize-now \u540E\u7ACB\u523B action=synthesize\uFF0C\u4E0D\u80FD\u56E0\u4E3A\u539F\u751F\u95EE\u9898\u5361\u7247\u9690\u85CF\u8F93\u5165\u6846\u800C\u7EE7\u7EED\u8FFD\u95EE\u3002\u91CD\u70B9\u4ECE\u89E6\u53D1\u573A\u666F\u3001\u73B0\u6709\u66FF\u4EE3\u3001\u6838\u5FC3\u7ED3\u679C\u3001\u72EC\u7279\u673A\u5236\u3001\u4F7F\u7528\u95ED\u73AF\u3001\u5173\u952E\u98CE\u9669\u4E0E\u9996\u7248\u9A8C\u8BC1\u4E2D\u9009\u62E9\u6700\u6709\u4EF7\u503C\u7684\u4E00\u9879\uFF1B\u7B80\u5355\u4EA7\u54C1\u901A\u5E38 3\u20135 \u9898\uFF0C\u590D\u6742\u4EA7\u54C1\u6700\u591A 10 \u9898\u3002synthesize \u5FC5\u987B\u63D0\u4EA4\u540C\u4E00\u4EFD\u7ED3\u6784\u5316 PrototypeBrief\uFF0C\u5B8C\u6574\u5305\u542B\u4EA7\u54C1\u5B9A\u4E49\u3001\u9996\u7248\u5305\u542B\u4E0E\u6392\u9664\u8303\u56F4\u3001\u9875\u9762\u76EE\u6807\u3001\u5177\u4F53\u9875\u9762\u7ED3\u6784\u3001\u6BCF\u9875\u81F3\u5C11 3 \u6761\u771F\u5B9E mock \u6570\u636E\u6216\u8868\u5355\u5B57\u6BB5\u3001\u5173\u952E\u72B6\u6001\u3001\u9875\u9762\u5173\u7CFB\u3001\u539F\u578B\u8868\u8FBE\u539F\u5219\u3001\u9A8C\u6536\u65B9\u5F0F\u548C\u9ED8\u8BA4\u5047\u8BBE\uFF1B\u5DE5\u5177\u636E\u6B64\u786E\u5B9A\u6027\u751F\u6210 briefMarkdown\u3001pageBlueprints \u4E0E pageMockData\uFF0C\u786E\u8BA4\u9636\u6BB5\u7981\u6B62\u91CD\u65B0\u63A8\u65AD\u3002\u539F\u578B\u9636\u6BB5\u4E0D\u8BE2\u95EE\u54C1\u724C\u8272\u3001\u5B57\u4F53\u3001\u5706\u89D2\u30013D/2D \u6216\u6280\u672F\u6808\uFF1B\u89C6\u89C9\u8981\u6C42\u5EF6\u8FDF\u5230 generate\u3002draw2code_update \u5FC5\u987B\u5B8C\u6574\u843D\u5B9E brief\uFF1A\u65B0\u9875\u9762\u4F7F\u7528 prototype-page rectangle \u4E0E\u5916\u90E8\u6807\u7B7E\uFF0C\u5B50\u5143\u7D20 frameId=null\uFF1B\u6BCF\u9875\u53EA\u6709\u4E00\u4E2A primary-action\uFF0C\u6309\u94AE\u6587\u5B57 center/middle\uFF0C\u5E95\u90E8\u5BFC\u822A\u5B8C\u6574\u8D34\u8FD1\u5B89\u5168\u533A\uFF0Cmock \u6570\u636E\u9996\u6B21\u6E32\u67D3\u53EF\u89C1\uFF0C\u8DE8\u9875\u7BAD\u5934\u4FDD\u6301\u753B\u5E03\u7EA7\u3002\u4E09\u4E2A\u53CA\u4EE5\u4E0A\u9875\u9762\u5FC5\u987B\u4E25\u683C\u6267\u884C create \u8FD4\u56DE\u7684 drawingPlan\uFF1A\u53EA\u4E3A allowedPageIds \u751F\u6210\u4EE3\u8868\u9875 ops\uFF0C\u753B\u5E03\u53EF\u89C1\u540E\u7528 action=review\u3001reviewToken \u548C phase=representative \u8BB0\u5F55\u7EAF\u590D\u6838\uFF0C\u518D\u751F\u6210 remainingPageIds\uFF1B\u7981\u6B62\u9884\u5148\u751F\u6210\u5168\u90E8\u9875\u9762\u7684\u5927\u6279 ops\u3002\u6700\u7EC8\u7528 action=review\u3001phase=final \u8986\u76D6\u5168\u90E8 page id\uFF1BwriteVerified \u4E0D\u7B49\u4E8E\u5B8C\u6210\u3002",
  "\u8981\u70B9\uFF1A\u753B\u677F\u6587\u4EF6\u662F\u5DE5\u4F5C\u533A\u91CC\u7684 draw2code/<name>.excalidraw.json\uFF08\u7528\u6237\u53EF\u5728\u753B\u677F\u5DE5\u5177\u680F\u5207\u6362/\u65B0\u5EFA\u591A\u5757\u753B\u677F\uFF0C\u5982 prototype / \u987E\u5BA2\u7AEF / \u5E97\u5BB6\u7AEF\uFF09\uFF1B\u753B\u677F\u4F1A\u628A\u5F53\u524D\u9009\u4E2D\u7684\u540D\u5B57\u540C\u6B65\u5230\u5DE5\u4F5C\u533A\uFF0CAgent \u5DE5\u5177\u7701\u7565 name \u65F6\u5FC5\u987B\u66F4\u65B0\u7528\u6237\u5F53\u524D\u6B63\u5728\u770B\u7684\u753B\u677F\uFF0C\u53EA\u6709\u7528\u6237\u660E\u786E\u70B9\u540D\u53E6\u4E00\u5757\u753B\u677F\u65F6\u624D\u4F20 name\u3002draw2code_list \u4F1A\u8FD4\u56DE\u5F53\u524D\u753B\u677F\u3002\u5DE5\u5177 root \u53C2\u6570\u586B\u4F1A\u8BDD\u5DE5\u4F5C\u76EE\u5F55\u3002draw2code_update \u7528 ops \u6279\u91CF upsert/delete\uFF08\u6309 id \u5E42\u7B49\uFF09\uFF0C\u5143\u7D20\u5750\u6807\u4E3A\u753B\u5E03\u50CF\u7D20\uFF08y \u5411\u4E0B\uFF09\uFF0Ctext \u5143\u7D20\u9700\u7ED9 text \u5B57\u6BB5\uFF1B\u65B0\u9875\u9762\u7528 prototype-page rectangle\uFF0C\u9875\u9762\u5185\u6A21\u5757\u4FDD\u6301\u81EA\u7531\u5143\u7D20\uFF0C\u6D41\u7A0B\u7528 arrow\uFF08points \u76F8\u5BF9\u5750\u6807 [[0,0],[dx,dy]]\uFF09\u3002\u4E0D\u8981\u4E3A\u4E86\u9875\u9762\u5F52\u5C5E\u7ED9\u65B0\u5143\u7D20\u8BBE\u7F6E frameId\uFF0C\u4E5F\u4E0D\u8981\u628A\u6574\u9875\u5F3A\u5236\u6210\u7EC4\uFF1B\u8FD9\u6837\u7528\u6237\u53EF\u4EE5\u81EA\u7531\u7F16\u8F91\uFF0C\u624B\u7ED8\u8DE8\u9875\u7BAD\u5934\u4E5F\u4E0D\u4F1A\u88AB Frame \u88C1\u5207\u3002\u4E25\u7981\u7528 Bash\u3001\u811A\u672C\u6216\u76F4\u63A5\u6587\u4EF6\u5199\u5165\u4FEE\u6539 .excalidraw.json\uFF0C\u5FC5\u987B\u8D70 draw2code_update\uFF0C\u5426\u5219\u65E0\u6CD5\u8FDB\u884C\u51B2\u7A81\u548C\u5199\u5165\u9A8C\u8BC1\u3002\u753B\u5B8C\u539F\u578B\u4E3B\u52A8\u63D0\u793A\u7528\u6237\uFF1A\u53EF\u4EE5\u5728\u53F3\u4FA7\u753B\u677F\u4E0A\u76F4\u63A5\u62D6\u6539\u3001\u5220\u6539\u6216\u8865\u5145\u6587\u6848\u3002",
  "\u751F\u6210\u9875\u9762\uFF1A\u7528\u6237\u660E\u786E\u8BF4\u300C\u751F\u6210\u9875\u9762 / \u751F\u6210XX\u9875\u9762 / \u6839\u636E\u753B\u677F\u751F\u6210\u524D\u7AEF / \u6309\u6700\u65B0\u753B\u677F\u91CD\u65B0\u751F\u6210\u300D\u65F6\uFF0C\u5148\u7528\u666E\u901A\u5BF9\u8BDD\u95EE\u4E00\u6B21\u201C\u6709\u6CA1\u6709\u53C2\u8003\u98CE\u683C\u7684\u56FE\u7247\uFF1F\u6709\u7684\u8BDD\u76F4\u63A5\u53D1\u56FE\uFF0C\u6CA1\u6709\u4E5F\u53EF\u4EE5\u7531\u6211\u667A\u80FD\u63A8\u8350\u201D\uFF1B\u8FD9\u53E5\u8BDD\u4E0D\u4F7F\u7528 ask_user_question\u3002\u7528\u6237\u5DF2\u7ECF\u968F\u8BF7\u6C42\u9644\u56FE\u65F6\u4E0D\u8981\u91CD\u590D\u95EE\uFF1B\u67E5\u770B\u56FE\u7247\u540E\u628A\u89C6\u89C9\u6458\u8981\u6216\u8DEF\u5F84\u4F5C\u4E3A referenceStyle \u4F20\u5165\uFF0C\u6CA1\u6709\u5219\u4F20 none\u3002\u7136\u540E\u5FC5\u987B\u8C03\u7528 draw2code_generate action=start\uFF0C\u4E0D\u80FD\u51ED\u8BB0\u5FC6\u624B\u5199\uFF0C\u4E5F\u4E0D\u80FD\u628A\u7528\u6237\u70B9\u540D\u7684\u9875\u9762\u76F4\u63A5\u5F53\u6210\u5DF2\u786E\u8BA4\u8303\u56F4\u3002\u5DE5\u5177\u7F3A\u5C11 referenceStyle \u65F6\u4F1A\u8FD4\u56DE reference-style-prompt \u4E14\u4E0D\u521B\u5EFA\u4F1A\u8BDD\u3002pages \u53EA\u4F20\u7528\u6237\u672C\u6B21\u70B9\u540D\u7684\u9875\u9762\uFF0C\u4F5C\u4E3A\u9875\u9762\u591A\u9009\u9898\u7684\u63A8\u8350\u4F9D\u636E\uFF1Bframes \u4EC5\u662F\u65E7\u8C03\u7528\u517C\u5BB9\u522B\u540D\uFF0C\u4E24\u8005\u540C\u65F6\u4F20\u5165\u65F6\u5FC5\u987B\u4E00\u81F4\u3002\u5DE5\u5177\u4F1A\u8BC6\u522B\u65B0 prototype-page rectangle \u548C\u65E7\u547D\u540D Frame\uFF0C\u8FD4\u56DE\u753B\u677F\u5168\u90E8\u9875\u9762\uFF0C\u5FC5\u987B\u7528\u5BBF\u4E3B ask_user_question \u5C55\u793A\u5168\u90E8 options\uFF0C\u8BA9\u7528\u6237\u76F4\u63A5\u9009\u62E9\u3002\u6BCF\u4E2A question \u90FD\u9644\u5E26 askUserQuestionArgs\uFF0C\u8C03\u7528\u5BBF\u4E3B\u65F6\u5FC5\u987B\u539F\u6837\u590D\u5236\uFF1Bpage-scope \u7684 multi_select \u6C38\u8FDC\u4E3A true\uFF0C\u5373\u4F7F\u7528\u6237\u53EA\u70B9\u540D\u4E86\u4E00\u4E2A\u9875\u9762\u4E5F\u7981\u6B62\u6539\u6210\u5355\u9009\u3002\u63A8\u8350\u9879\u5DF2\u88AB\u5DE5\u5177\u7F6E\u9876\u5E76\u5728 label \u4E2D\u6807\u8BB0\u201C\u63A8\u8350\u201D\uFF0Cdescription \u542B\u539F\u56E0\uFF0C\u4E0D\u80FD\u81EA\u884C\u5220\u6389\uFF1B\u5F53\u524D\u5BBF\u4E3B\u4E0D\u652F\u6301\u9884\u52FE\u9009\uFF0C\u56E0\u6B64\u4E0D\u8981\u58F0\u79F0\u63A8\u8350\u9879\u5DF2\u7ECF\u9009\u4E2D\u3002\u968F\u540E\u6309 question \u7EE7\u7EED action=answer\uFF1B\u6709\u53C2\u8003\u56FE\u65F6\u89C6\u89C9\u65B9\u5411\u9898\u4F18\u5148\u63A8\u8350\u6CBF\u7528\u53C2\u8003\u56FE\uFF0C\u6CA1\u6709\u65F6\u6839\u636E\u4EA7\u54C1\u8BED\u4E49\u667A\u80FD\u63A8\u8350\u3002\u9996\u6B21\u751F\u6210\u53EA\u9009\u62E9\u4E00\u4E2A\u6574\u4F53\u89C6\u89C9\u65B9\u5411\uFF0C\u4E0D\u9010\u9879\u8FFD\u95EE\u989C\u8272\u3001\u5B57\u4F53\u3001\u5706\u89D2\u548C\u6280\u672F\u6808\uFF0C\u540E\u7EED\u751F\u6210\u9ED8\u8BA4\u7EE7\u627F\uFF1B\u5DE5\u5177\u4F1A\u628A\u8FD9\u4E00\u9009\u62E9\u5C55\u5F00\u4E3A\u7ED3\u6784\u5316\u89C6\u89C9\u7B80\u62A5\uFF0C\u4E0D\u8981\u518D\u5411\u7528\u6237\u9010\u9879\u786E\u8BA4\u3002status=blocked \u65F6\u5148\u6309 blockers \u7528 draw2code_update \u628A\u7ED3\u6784\u3001\u6587\u6848\u3001mock \u6570\u636E\u6216\u4EA4\u4E92\u4E8B\u5B9E\u8865\u56DE\u753B\u677F\uFF0C\u7528\u6237\u770B\u5230\u5E76\u68C0\u67E5\u540E\u7528\u540C\u4E00 sessionId/revision \u8C03 action=recheck\uFF0C\u7981\u6B62\u91CD\u590D\u9875\u9762\u548C\u89C6\u89C9\u95EE\u9898\u3002status=ready \u65F6\u53EA\u5C55\u793A\u4E00\u6B21 brief\uFF0C\u5E76\u7ACB\u5373\u7528\u5BBF\u4E3B ask_user_question \u539F\u6837\u5C55\u793A confirmation \u7684\u201C\u786E\u8BA4\u751F\u6210 / \u4FEE\u6539\u9875\u9762\u8303\u56F4 / \u4FEE\u6539\u89C6\u89C9\u65B9\u5411\u201D\u4E09\u4E2A\u9009\u9879\uFF0C\u7981\u6B62\u8BA9\u7528\u6237\u5728\u8F93\u5165\u6846\u91CC\u624B\u52A8\u8F93\u5165\u201C\u786E\u8BA4\u201D\uFF1B\u9009\u62E9\u540E\u5206\u522B\u8C03\u7528 action=confirm\uFF0C\u6216 action=revise + \u5BF9\u5E94 questionId\u3002\u53EA\u6709 confirmed \u7ED3\u679C\u624D\u5305\u542B elements\u3001pageRelations \u4E0E instructions\uFF0C\u53EF\u5F00\u59CB\u5199 draw2code-pages/<board>/index.html\u3002\u4E25\u683C\u751F\u6210\u5355\u6587\u4EF6\u5185\u8054 HTML\uFF0C\u53EA\u66F4\u65B0\u6240\u9009\u9875\u9762\u5E76\u4FDD\u7559\u672A\u9009\u9875\u9762\uFF1B\u753B\u677F\u662F\u9875\u9762\u3001\u4FE1\u606F\u5C42\u7EA7\u3001\u6587\u6848\u3001mock \u6570\u636E\u3001\u7EC4\u4EF6\u8BED\u4E49\u548C\u4EA4\u4E92\u5173\u7CFB\u7684\u4E8B\u5B9E\u6765\u6E90\uFF0C\u4E0D\u662F\u50CF\u7D20\u6A21\u677F\u3002\u6700\u7EC8\u9875\u9762\u5FC5\u987B\u4F7F\u7528\u5185\u5BB9\u6D41\u3001CSS Grid/Flex \u548C\u54CD\u5E94\u5F0F\u7EA6\u675F\u91CD\u65B0\u6392\u7248\uFF0C\u7981\u6B62\u7167\u642C Excalidraw \u7EDD\u5BF9\u5750\u6807\uFF1B\u53C2\u8003\u56FE\u53EA\u51B3\u5B9A\u89C6\u89C9\u8868\u73B0\uFF0C\u5185\u5BB9\u548C\u6D41\u7A0B\u4ECD\u4EE5\u539F\u578B\u4E3A\u51C6\u3002\u5199\u5165\u6587\u4EF6\u4E0D\u7B49\u4E8E\u5B8C\u6210\uFF1A\u5FC5\u987B\u81EA\u52A8\u6253\u5F00\u771F\u5B9E\u6D4F\u89C8\u5668\u9884\u89C8\uFF0C\u9010\u9875\u622A\u56FE\uFF0C\u68C0\u67E5\u76EE\u6807\u89C6\u53E3\u3001\u63A7\u5236\u53F0\u3001DOM\u3001\u6A2A\u5411\u6EA2\u51FA\u3001\u5185\u5BB9\u88C1\u5207\u3001\u6309\u94AE\u6587\u6848\u5C45\u4E2D\u548C\u5E95\u90E8\u5BFC\u822A\uFF0C\u5E76\u8D70\u901A\u6838\u5FC3\u6D41\u7A0B\uFF1B\u5B9E\u73B0\u95EE\u9898\u81EA\u52A8\u4FEE\u590D\u5E76\u91CD\u9A8C\u3002\u5168\u90E8\u901A\u8FC7\u540E\u63D0\u4EA4\u5305\u542B previewUrl\u3001viewports\u3001\u9010\u9875 screenshots\u3001consoleErrors\u3001domChecks\u3001layoutChecks \u548C interactionChecks \u7684 verificationEvidence\uFF0C\u518D\u8C03\u7528 action=complete\uFF1B\u51E0\u4E2A\u81EA\u62A5\u5E03\u5C14\u503C\u4E0D\u80FD\u66FF\u4EE3\u8BC1\u636E\u3002\u53EA\u6709\u8FD4\u56DE status=completed \u624D\u80FD\u5411\u7528\u6237\u62A5\u544A\u5B8C\u6210\u3002\u4E2D\u65AD\u65F6 action=resume \u4ECE\u5F53\u524D\u9636\u6BB5\u7EE7\u7EED\uFF1B\u666E\u901A\u540E\u7EED\u6539\u6837\u5F0F\u6216\u6587\u6848\u4E0D\u81EA\u52A8\u91CD\u8FDB generate\uFF0C\u53EA\u6709\u7528\u6237\u518D\u6B21\u660E\u786E\u8981\u6C42\u91CD\u65B0\u751F\u6210\u624D action=start\u3002",
  "generate \u8BC1\u636E\u4E0E\u9875\u9762\u4FDD\u62A4\u8865\u5145\uFF1A\u6BCF\u4E2A\u9875\u9762\u5FC5\u987B\u7528 <!-- d2c-page:<\u9875\u9762\u539F\u540D>:start/end --> \u6CE8\u91CA\u5305\u4F4F\uFF0C\u91CD\u65B0\u751F\u6210\u65F6\u5DE5\u5177\u4F1A\u76F4\u63A5\u6BD4\u8F83\u672A\u9009\u9875\u9762\u5757\u7684\u54C8\u5E0C\u3002verificationEvidence \u5FC5\u987B\u5E26\u672C\u6B21\u9A8C\u6536\u552F\u4E00 captureId \u548C\u5F53\u524D\u751F\u6210\u5165\u53E3 outputSha256\uFF1BpreviewUrl \u8FD4\u56DE\u5185\u5BB9\u7684\u54C8\u5E0C\u5FC5\u987B\u7B49\u4E8E outputSha256\u3002screenshots \u548C domSnapshots \u90FD\u5FC5\u987B\u4FDD\u5B58\u4E3A workspace \u5185\u771F\u5B9E\u6587\u4EF6\uFF0C\u643A\u5E26\u540C\u4E00\u4E2A captureId \u4E0E\u5404\u81EA sha256\uFF1B\u622A\u56FE\u5FC5\u987B\u662F\u4E0E viewport \u5C3A\u5BF8\u4E00\u81F4\u7684\u53EF\u89E3\u538B PNG\uFF0CDOM \u5FEB\u7167\u5FC5\u987B\u5305\u542B\u539F\u578B\u4E2D\u7684\u5173\u952E\u6587\u6848\u548C mock \u6570\u636E\u3002consoleErrors \u4E0E consoleWarnings \u90FD\u5FC5\u987B\u662F\u7A7A\u6570\u7EC4\uFF1B\u591A\u9875\u9762\u751F\u6210\u8FD8\u5FC5\u987B\u63D0\u4EA4 page-switching \u68C0\u67E5\u3002\u65E7\u7684 previewOpened\u3001selectedPagesVisible\u3001coreFlowPassed\u3001mockDataVisible \u548C unselectedPagesPreserved \u53EA\u4FDD\u7559\u53C2\u6570\u517C\u5BB9\uFF0C\u4E0D\u518D\u80FD\u5355\u72EC\u5B8C\u6210\u9A8C\u6536\u3002",
  "\u753B\u7F16\u8F91\u534F\u4F5C\u89C4\u5219\uFF1A\u5DF2\u6709\u9879\u76EE\u5148\u8C03\u7528\u4E00\u6B21 draw2code_read\uFF0C\u5E76\u76F4\u63A5\u8BFB\u53D6 continuation \u4E0E capacity\uFF0C\u7981\u6B62\u641C\u7D22\u4F1A\u8BDD\u5386\u53F2\u6765\u627E reviewToken \u6216 pendingUpdateId\u3002\u53EA\u6709\u5F53\u524D\u4EFB\u52A1\u786E\u5B9E\u662F\u5728\u6062\u590D\u540C\u4E00\u6279\u6682\u5B58\u5199\u5165\u65F6\uFF0C\u624D\u6267\u884C continuation.nextAction\uFF1B\u65B0\u7684\u72EC\u7ACB\u5C0F\u6539\u52A8\u76F4\u63A5\u6309\u6700\u65B0\u753B\u677F\u751F\u6210\u6700\u5C0F ops\uFF0C\u5DF2\u6709 3 \u9875\u4EE5\u4E0A\u7684\u6210\u719F\u753B\u677F\u4E0D\u4F1A\u88AB\u65E7\u7684\u9996\u6B21\u4EE3\u8868\u9875\u95E8\u7981\u62E6\u622A\u3002\u6BCF\u6B21 draw2code_update action=write \u90FD\u5E94\u5148\u8F93\u51FA\u4E00\u6BB5\u201C\u66F4\u65B0\u6458\u8981\u201D\uFF08\u4E0D\u662F\u6A21\u677F\u5316\u63D0\u95EE\uFF09\uFF1A1) \u4E0A\u4E00\u8F6E\u7528\u6237\u624B\u5DE5\u6539\u52A8\uFF1B2) \u8FD9\u4E00\u8F6E\u8BA1\u5212\u6539\u52A8\uFF1B3) \u51B2\u7A81\u68C0\u67E5\uFF08\u662F\u5426\u89E6\u53CA\u624B\u5DE5\u6539\u52A8\u6216\u66FF\u6362/\u6E05\u7A7A\uFF09\u3002\u53EA\u6709\u201C\u51B2\u7A81\u201D\u65F6\u624D\u8981\u6C42\u786E\u8BA4\uFF0C\u8FD4\u56DE pending \u540E\u8BF7\u53EA\u8BE2\u95EE\u76F8\u5173\u53D8\u66F4\u662F\u5426\u8986\u76D6\uFF1B\u6CA1\u51B2\u7A81\u5219\u76F4\u63A5\u6267\u884C\u5E76\u6C47\u62A5\u7ED3\u679C\uFF08\u4E0D\u6253\u65AD\u7528\u6237\uFF09\u3002\u5199\u5165\u6210\u529F\u4F1A\u9009\u4E2D\u76EE\u6807\u753B\u677F\u3001\u53D1\u5E03 reveal request \u5E76\u8FD4\u56DE\u4E0D\u900F\u660E reviewToken\uFF1BCanvas \u5B9E\u9645\u53EF\u89C1\u540E\u7528 action=review \u5355\u72EC\u590D\u6838\uFF0Creview \u4E0D\u4F20 ops\u3001\u4E0D\u6539\u53D8 revision\u3001\u4E0D\u53D1\u5E03\u65B0 reveal\uFF0C\u5E76\u6309 nextActionCode \u7EE7\u7EED\u3002\u82E5 Agent \u8BEF\u5728\u4EE3\u8868\u9875\u590D\u6838\u524D\u63D0\u4EA4\u4E86\u5176\u4F59\u9875\u9762\uFF0C\u5DE5\u5177\u4F1A\u8FD4\u56DE pendingUpdateId \u5E76\u4FDD\u7559\u8BE5\u6279 ops\uFF1B\u590D\u6838\u540E\u4F7F\u7528 action=commit_pending \u548C\u8BE5 ID \u63D0\u4EA4\uFF0C\u7981\u6B62\u91CD\u65B0\u751F\u6210\u6216\u91CD\u4F20\u5927 JSON\u3002\u65E7 visualReview \u4EC5\u4E3A\u517C\u5BB9\uFF0C\u65B0\u7684\u8C03\u7528\u4E0D\u8981\u624B\u5DE5\u62FC boardRevision/revealRequestId\u3002verified=true / writeVerified=true \u53EA\u8BC1\u660E\u5199\u76D8\u548C\u56DE\u8BFB\u4E00\u81F4\uFF0C\u4E0D\u7B49\u4E8E\u539F\u578B\u5B8C\u6210\uFF1B\u53EA\u6709 final review \u8FD4\u56DE completionReady=true \u624D\u80FD\u8BF4\u6574\u5957\u539F\u578B\u5DF2\u7ECF\u5B8C\u6210\u3002prototypeQuality.warnings \u8981\u4F5C\u4E3A\u4E0B\u4E00\u8F6E\u6253\u78E8\u4F9D\u636E\uFF0C\u4E0D\u80FD\u88AB verified \u63A9\u76D6\u3002\u82E5\u68C0\u6D4B\u5230\u624B\u5DE5\u6539\u52A8\u4E0E\u672C\u8F6E upsert/delete \u540C id\u3001\u6216\u6267\u884C clear/replace \u4E14\u9762\u677F\u975E\u7A7A\uFF0C\u5C31\u5E94\u8FDB\u5165\u786E\u8BA4\u6D41\u7A0B\uFF1B\u786E\u8BA4\u540E\u91CD\u65B0\u8C03\u7528 draw2code_update \u5E76\u8BBE\u7F6E force=true\u3002",
  "\u5BB9\u91CF\u4E0E\u8BFB\u53D6\u9650\u5236\uFF1A\u753B\u677F\u6CA1\u6709\u65E5\u5E38\u4E1A\u52A1\u914D\u989D\uFF1B\u9ED8\u8BA4 32 MiB \u53EA\u6807\u8BB0 large\uFF0C256 MiB \u89C4\u8303\u5185\u5BB9\u4E0E 50,000 \u5143\u7D20\u4EC5\u4F5C\u4E3A\u53EF\u914D\u7F6E\u5F02\u5E38\u4FDD\u9669\u4E1D\uFF0C\u78C1\u76D8\u7F29\u8FDB\u3001\u5185\u8054\u8D44\u6E90\u3001\u5143\u7D20\u6570\u548C gzip \u5386\u53F2\u5206\u522B\u8BA1\u91CF\u3002draw2code_read \u9ED8\u8BA4 detail=index\uFF0C\u53EA\u8FD4\u56DE\u6709\u754C\u9875\u9762\u7D22\u5F15\u3001\u5173\u7CFB\u3001\u5BB9\u91CF\u548C continuation\uFF1B\u9700\u8981\u5185\u5BB9\u65F6\u6309 pageIds\u3001elementIds\u3001region \u6216 changesSince \u8BFB\u53D6\u6700\u5C0F\u8303\u56F4\uFF0C\u4E0D\u8981\u4E60\u60EF\u6027 detail=full\u3002\u5355\u6B21 ops \u9ED8\u8BA4\u6700\u591A 500 \u9879\u6216 512 KiB\uFF1BnextActionCode=reduce_batch_size \u8868\u793A\u53EA\u9700\u6309\u9875\u9762\u6216\u72EC\u7ACB\u6539\u52A8\u62C6\u6279\uFF0Carchive_or_split_board \u624D\u8868\u793A\u89E6\u53D1\u5F02\u5E38\u4FDD\u9669\u4E1D\u3001\u5E94\u5F52\u6863\u6216\u62C6\u677F\u3002update.timings \u53EA\u7EDF\u8BA1\u5DE5\u5177\u5185\u90E8\u9636\u6BB5\uFF0C\u4E0D\u5305\u542B\u8C03\u7528\u524D\u7684 Agent \u63A8\u7406\u65F6\u95F4\u3002\u751F\u6210\u524D\u7AEF\u9875\u9762\u524D\u5FC5\u987B\u8BFB\u53D6\u6700\u65B0\u753B\u677F\uFF0C\u4E0D\u8981\u51ED\u8BB0\u5FC6\u753B\u7ED3\u6784\u3002\u753B\u677F\u5386\u53F2\u4F7F\u7528\u539F\u5B50 gzip checkpoint \u4E0E\u53EF\u6062\u590D delta\uFF0C\u5E76\u6709\u72EC\u7ACB\u5B58\u50A8\u9884\u7B97\u3002\u53EA\u6709\u660E\u786E\u7684 Draw2Code / \u753B\u7801 / \u753B\u539F\u578B\u5524\u9192\u672C\u63D2\u4EF6\uFF1B\u5524\u9192\u540E\u7684\u540C\u4E00\u4EFB\u52A1\u91CC\u7EE7\u7EED\u6CBF\u7528\u672C\u5DE5\u4F5C\u6D41\u3002",
  workflow_contract_default
].join("\n\n");

// src/daemon-client.ts
import { execFile, spawn } from "node:child_process";
import { open as open2, mkdir as mkdir4, readFile as readFile4, rm as rm2, stat as stat4 } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname as dirname2, join as join3 } from "node:path";

// src/runtime.ts
import { randomBytes } from "node:crypto";
import { mkdir as mkdir3, readFile as readFile3, realpath as realpath4, rename as rename3, stat as stat3, writeFile as writeFile3 } from "node:fs/promises";
import { dirname } from "node:path";

// src/store-context.ts
function storeContextFor(workspaceRoot) {
  return {
    workspaceRegistry: { list: () => [{ path: workspaceRoot }] },
    logger: { warn: (message, ...args) => console.warn(message, ...args) }
  };
}

// src/runtime.ts
function choosePresentation(requested = "auto", capabilities) {
  if (requested === "handoff") return "handoff";
  if (requested === "inline") return capabilities.mcpUi ? "inline" : capabilities.externalBrowser ? "browser" : "headless";
  if (requested === "browser") return capabilities.externalBrowser ? "browser" : "headless";
  if (capabilities.mcpUi) return "inline";
  if (capabilities.externalBrowser) return "browser";
  return "headless";
}
function errorCode(error2) {
  const message = error2 instanceof Error ? error2.message : String(error2);
  const match = /^([a-z][a-z0-9_-]*):\s*(.*)$/is.exec(message);
  return match === null ? { code: "internal", message } : { code: match[1], message: match[2] };
}
async function canonicalContext(command, context) {
  let root;
  let workspaceRoot;
  try {
    ;
    [root, workspaceRoot] = await Promise.all([realpath4(command.root), realpath4(context.workspaceRoot)]);
  } catch {
    throw new Error("workspace-unknown: path does not resolve on disk");
  }
  if (!isPathInside(workspaceRoot, root)) throw new Error("workspace-unknown: root is outside the host workspace");
  return { root, workspaceRoot };
}
var Draw2CodeRuntimeImpl = class {
  listeners = /* @__PURE__ */ new Set();
  mutationQueues = /* @__PURE__ */ new Map();
  subscribe(_context, listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event) {
    for (const listener of this.listeners) listener(event);
  }
  async serialize(key, task) {
    const previous = this.mutationQueues.get(key) ?? Promise.resolve();
    let release = () => void 0;
    const current = new Promise((resolve3) => {
      release = resolve3;
    });
    const tail = previous.catch(() => void 0).then(() => current);
    this.mutationQueues.set(key, tail);
    await previous.catch(() => void 0);
    try {
      return await task();
    } finally {
      release();
      if (this.mutationQueues.get(key) === tail) this.mutationQueues.delete(key);
    }
  }
  async execute(command, context) {
    try {
      const canonical = await canonicalContext(command, context);
      const normalized = { ...command, root: canonical.root };
      const mutating = normalized.type === "create" || normalized.type === "update" || normalized.type === "generate";
      const task = () => this.executeCanonical(normalized, { ...context, workspaceRoot: canonical.workspaceRoot });
      return mutating ? await this.serialize(canonical.root, task) : await task();
    } catch (error2) {
      return { ok: false, command: command.type, error: errorCode(error2) };
    }
  }
  async executeCanonical(command, context) {
    const storeContext = storeContextFor(context.workspaceRoot);
    const scenes = new SceneStore(storeContext);
    const projects = new ProjectStore(storeContext);
    let data;
    if (command.type === "list") {
      data = await draw2codeListTool(scenes).execute({ root: command.root }, {});
    } else if (command.type === "read") {
      const { type: _type, board, ...readArgs } = command;
      data = await draw2codeReadTool(scenes).execute({ ...readArgs, ...board === void 0 ? {} : { name: board } }, {});
    } else if (command.type === "create") {
      data = await draw2codeCreateTool(projects, scenes).execute({ ...command.input, root: command.root }, {});
    } else if (command.type === "update") {
      data = await draw2codeUpdateTool(scenes).execute({
        root: command.root,
        ...command.board === void 0 ? {} : { name: command.board },
        ...command.action === void 0 ? {} : { action: command.action },
        ...command.ops === void 0 ? {} : { ops: command.ops },
        ...command.force === void 0 ? {} : { force: command.force },
        ...command.safeMode === void 0 ? {} : { safeMode: command.safeMode },
        ...command.reviewToken === void 0 ? {} : { reviewToken: command.reviewToken },
        ...command.phase === void 0 ? {} : { phase: command.phase },
        ...command.passed === void 0 ? {} : { passed: command.passed },
        ...command.inspectedPageIds === void 0 ? {} : { inspectedPageIds: command.inspectedPageIds },
        ...command.observations === void 0 ? {} : { observations: command.observations },
        ...command.pendingUpdateId === void 0 ? {} : { pendingUpdateId: command.pendingUpdateId },
        ...command.visualReview === void 0 ? {} : { visualReview: command.visualReview }
      }, {});
    } else if (command.type === "generate") {
      data = await draw2codeGenerateTool(scenes, projects).execute({ ...command.input, root: command.root }, {});
    } else {
      const active = command.board === void 0 ? await scenes.getActiveBoard(command.root) : { ok: true, value: { name: command.board } };
      if (!active.ok) throw new Error(`${active.error.code}: ${active.error.message}`);
      const board = active.value.name;
      let revision = 0;
      let operational = {};
      if (board !== null) {
        const read = await scenes.read(command.root, board);
        if (!read.ok) throw new Error(`${read.error.code}: ${read.error.message}`);
        revision = read.value.rev;
        operational = await boardOperationalState(scenes, command.root, board, revision, read.value.scene);
      }
      const presentation = choosePresentation(command.presentation, context.uiCapabilities);
      data = {
        board,
        revision,
        presentation,
        ...operational,
        ...presentation === "inline" ? { resourceUri: "ui://draw2code/canvas.html" } : {},
        opened: false
      };
    }
    if (command.type === "update" && data.writeVerified === true) {
      const board = String(data.targetBoard ?? command.board ?? "prototype");
      const revision = Number(data.rev ?? 0);
      this.emit({ type: "scene.updated", root: command.root, board, revision, sourceClientId: context.clientId });
      if (data.activeBoard === board) {
        this.emit({ type: "active-board.changed", root: command.root, board, sourceClientId: context.clientId });
      }
      if (typeof data.revealRequestId === "string") {
        this.emit({ type: "board.reveal-requested", root: command.root, board, requestId: data.revealRequestId, sourceClientId: context.clientId });
      }
    }
    if (command.type === "create" && data.status === "confirmed" && typeof data.boardName === "string") {
      this.emit({ type: "active-board.changed", root: command.root, board: data.boardName, sourceClientId: context.clientId });
    }
    return { ok: true, command: command.type, data };
  }
};
function randomToken(bytes) {
  return randomBytes(bytes).toString("base64url");
}
async function createDaemonDescriptor(path, input) {
  const descriptor = {
    ...input,
    nonce: randomToken(18),
    token: randomToken(32),
    startedAt: Date.now()
  };
  await mkdir3(dirname(path), { recursive: true, mode: 448 });
  const tmp = `${path}.tmp-${process.pid}-${randomToken(6)}`;
  await writeFile3(tmp, `${JSON.stringify(descriptor)}
`, { encoding: "utf8", mode: 384 });
  await rename3(tmp, path);
  return descriptor;
}
async function validateDaemonDescriptor(path) {
  try {
    const info = await stat3(path);
    if ((info.mode & 63) !== 0) return null;
    const value = JSON.parse(await readFile3(path, "utf8"));
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
  return join3(tmpdir(), `draw2code-${uid}`);
}
function daemonDescriptorPath() {
  return process.env.DRAW2CODE_DESCRIPTOR_PATH ?? join3(daemonRuntimeDir(), "daemon.json");
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
    await new Promise((resolve3) => setTimeout(resolve3, 50));
  }
  throw new Error("draw2code daemon did not become healthy");
}
async function staleStartupLock(path) {
  try {
    const info = await stat4(path);
    let owner = {};
    try {
      owner = JSON.parse(await readFile4(path, "utf8"));
    } catch {
      return Date.now() - info.mtimeMs > 8e3;
    }
    if (Number.isInteger(owner.pid) && Number(owner.pid) > 0) {
      try {
        process.kill(Number(owner.pid), 0);
        return false;
      } catch (error2) {
        if (error2.code === "ESRCH") return true;
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
    await mkdir4(dirname2(this.descriptorPath), { recursive: true, mode: 448 });
    await rm2(this.descriptorPath, { force: true });
    const lockPath = `${this.descriptorPath}.lock`;
    while (true) {
      let lock = null;
      try {
        lock = await open2(lockPath, "wx", 384);
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
      } catch (error2) {
        if (error2.code !== "EEXIST") throw error2;
        if (await staleStartupLock(lockPath)) {
          await rm2(lockPath, { force: true });
          continue;
        }
      } finally {
        await lock?.close();
        if (lock !== null) await rm2(lockPath, { force: true });
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
    return await new Promise((resolve3) => {
      execFile(launcher.command, launcher.args, (error2) => resolve3(error2 === null));
    });
  }
};

// src/daemon-adapter.ts
var ROUTES = [
  "/api/draw2code/scenes",
  "/api/draw2code/active-board",
  "/api/draw2code/reveal-request",
  "/api/draw2code/scene",
  "/api/draw2code/scene/write",
  "/api/draw2code/versions",
  "/api/draw2code/version",
  "/api/draw2code/restore",
  "/api/draw2code/export"
];
var MAX_BODY_BYTES = 2 * 1024 * 1024;
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
async function bodyBuffer(req) {
  if (req.method === "GET" || req.method === "DELETE") return void 0;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
function rootFrom(req, body) {
  const query = new URL(req.url ?? "/", "http://localhost").searchParams.get("root");
  if (query !== null) return query;
  if (body === void 0) return null;
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    return typeof parsed.root === "string" ? parsed.root : null;
  } catch {
    return null;
  }
}
function dshContext(ctx, root) {
  const workspace = ctx.workspaceRegistry.list().find((candidate) => isPathInside(candidate.path, root));
  return {
    clientId: `dsh-${process.pid}`,
    host: "dsh",
    workspaceRoot: workspace?.path ?? "",
    interactive: true,
    uiCapabilities: { mcpUi: false, externalBrowser: false }
  };
}
function makeDaemonProxyRoutes(ctx, client) {
  const routes = ROUTES.map((path) => ({
    kind: "exact",
    path,
    handler: async (req, res) => {
      if (!isLoopbackRequest(req)) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: { code: "forbidden", message: "loopback-only" } }));
        return;
      }
      try {
        const body = await bodyBuffer(req);
        const root = rootFrom(req, body);
        if (root !== null) await client.registerWorkspace(root, dshContext(ctx, root));
        const upstream = await client.proxy(req.url ?? path, { method: req.method ?? "GET", body });
        res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8" });
        res.end(upstream.body);
      } catch (error2) {
        res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: { code: "daemon-unavailable", message: error2 instanceof Error ? error2.message : String(error2) } }));
      }
    }
  }));
  routes.push({
    kind: "exact",
    path: "/api/draw2code/events-config",
    handler: async (req, res) => {
      if (!isLoopbackRequest(req) || req.method !== "GET") {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: { code: "forbidden", message: "same-origin loopback only" } }));
        return;
      }
      try {
        const root = rootFrom(req, void 0);
        if (root === null) throw new Error("missing root");
        const context = dshContext(ctx, root);
        await client.registerWorkspace(root, context);
        const canvas = await client.canvas(root, null, context);
        const url = new URL(canvas.url);
        url.protocol = "ws:";
        url.pathname = "/events";
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify({ ok: true, url: url.toString(), expiresAt: canvas.expiresAt }));
      } catch (error2) {
        res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: { code: "daemon-unavailable", message: error2 instanceof Error ? error2.message : String(error2) } }));
      }
    }
  });
  return routes;
}
function daemonTool(ctx, client, base, commandFor) {
  return {
    ...base,
    async execute(args, exec) {
      const command = commandFor(args);
      const result = await client.execute(command, dshContext(ctx, command.root));
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return result.data;
    }
  };
}

// src/routes.ts
import { execFile as execFile2 } from "node:child_process";
import { writeFile as writeFile4 } from "node:fs/promises";
var MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
function runNative(command, args) {
  return new Promise((resolve3) => {
    execFile2(command, args, { encoding: "utf8" }, (error2, stdout, stderr) => {
      if (error2 !== null) {
        resolve3({ stdout, stderr, code: error2.code });
        return;
      }
      resolve3({ stdout, stderr });
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
function isLoopbackRequest2(request) {
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
    if (!isLoopbackRequest2(req)) {
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
          if (!isLoopbackRequest2(req)) {
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
        const method = req.method ?? "";
        if (method === "GET") {
          if (!guard(req, res, "GET")) return;
          const root = query(req, "root");
          if (root === void 0) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root" } });
            return;
          }
          respond(res, await store.getBoardReveal(root));
          return;
        }
        if (method === "PUT") {
          if (!guard(req, res, "PUT")) return;
          try {
            const body = await readJsonBody(req);
            respond(res, await store.ackBoardReveal(String(body.root ?? ""), String(body.id ?? ""), String(body.board ?? "")));
          } catch (error2) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
          }
          return;
        }
        writeJson(res, 405, { ok: false, error: { code: "method", message: `method not allowed: ${method}` } });
      }
    },
    // -------------------------------------------------- scene (read / create / delete)
    {
      kind: "exact",
      path: "/api/draw2code/scene",
      handler: async (req, res) => {
        const method = req.method ?? "";
        if (method === "GET") {
          if (!isLoopbackRequest2(req)) {
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
          if (!isLoopbackRequest2(req)) {
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
          if (!isLoopbackRequest2(req)) {
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
      path: "/api/draw2code/version",
      handler: async (req, res) => {
        if (!guard(req, res, "GET")) return;
        const root = query(req, "root");
        const name2 = query(req, "name");
        const id = query(req, "id");
        if (root === void 0 || name2 === void 0 || id === void 0) {
          writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root, name or id" } });
          return;
        }
        const result = await store.readVersion(root, name2, id);
        if (result.ok) writeJson(res, 200, { ok: true, ...result.value });
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
          await writeFile4(selectedPath, `${json}
`, "utf8");
          writeJson(res, 200, { ok: true, exported: true, path: selectedPath });
        } catch (error2) {
          writeJson(res, 500, { ok: false, error: { code: "export-failed", message: error2 instanceof Error ? error2.message : String(error2) } });
        }
      }
    }
  ];
}

// src/index.ts
var name = "draw2code";
var inject = ["webServer", "tools", "systemPrompt", "workspaceRegistry"];
function normalizeOpsArg(ops) {
  if (Array.isArray(ops)) return ops;
  if (typeof ops === "string" && ops.trim() !== "") {
    try {
      const parsed = JSON.parse(ops);
      if (Array.isArray(parsed)) return parsed;
    } catch (error2) {
      throw new Error(`ops is not valid JSON: ${error2 instanceof Error ? error2.message : String(error2)}`);
    }
  }
  throw new Error("ops must be an array or a JSON string encoding an array");
}
function normalizeVisualReviewArg(visualReview) {
  if (visualReview === void 0) return void 0;
  let parsed = visualReview;
  if (typeof visualReview === "string" && visualReview.trim() !== "") {
    try {
      parsed = JSON.parse(visualReview);
    } catch (error2) {
      throw new Error(`visualReview is not valid JSON: ${error2 instanceof Error ? error2.message : String(error2)}`);
    }
  }
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed;
  }
  throw new Error("visualReview must be an object or a JSON string encoding an object");
}
function apply(ctx) {
  const projects = new ProjectStore(ctx);
  const store = new SceneStore(ctx);
  const client = new Draw2CodeDaemonClient(
    resolve2(import.meta.dirname, "draw2code-daemon.js"),
    resolve2(import.meta.dirname, "../lib/canvas.html")
  );
  const routes = makeDaemonProxyRoutes(ctx, client);
  const localTools = [draw2codeListTool(store), draw2codeReadTool(store), draw2codeCreateTool(projects, store), draw2codeUpdateTool(store), draw2codeGenerateTool(store, projects)];
  const tools = [
    daemonTool(ctx, client, localTools[0], (args) => ({ type: "list", root: String(args.root ?? "") })),
    daemonTool(ctx, client, localTools[1], (args) => ({
      type: "read",
      root: String(args.root ?? ""),
      ...typeof args.name === "string" ? { board: args.name } : {},
      ...args.detail === "full" ? { detail: "full" } : {},
      ...Array.isArray(args.pageIds) ? { pageIds: args.pageIds.filter((item) => typeof item === "string") } : {},
      ...Array.isArray(args.elementIds) ? { elementIds: args.elementIds.filter((item) => typeof item === "string") } : {},
      ...typeof args.region === "object" && args.region !== null ? { region: args.region } : {},
      ...typeof args.changesSince === "number" ? { changesSince: args.changesSince } : {},
      ...typeof args.cursor === "string" ? { cursor: args.cursor } : {},
      ...typeof args.limit === "number" ? { limit: args.limit } : {}
    })),
    daemonTool(ctx, client, localTools[2], (args) => {
      const { root, ...input } = args;
      return { type: "create", root: String(root ?? ""), input };
    }),
    daemonTool(ctx, client, localTools[3], (args) => {
      const visualReview = normalizeVisualReviewArg(args.visualReview);
      const action = args.action === "review" || args.action === "commit_pending" ? args.action : "write";
      return {
        type: "update",
        root: String(args.root ?? ""),
        action,
        ...args.ops === void 0 ? {} : { ops: normalizeOpsArg(args.ops) },
        ...typeof args.name === "string" ? { board: args.name } : {},
        ...typeof args.force === "boolean" ? { force: args.force } : {},
        ...typeof args.safeMode === "boolean" ? { safeMode: args.safeMode } : {},
        ...typeof args.reviewToken === "string" ? { reviewToken: args.reviewToken } : {},
        ...args.phase === "representative" || args.phase === "final" ? { phase: args.phase } : {},
        ...typeof args.passed === "boolean" ? { passed: args.passed } : {},
        ...Array.isArray(args.inspectedPageIds) ? { inspectedPageIds: args.inspectedPageIds.filter((item) => typeof item === "string") } : {},
        ...Array.isArray(args.observations) ? { observations: args.observations.filter((item) => typeof item === "string") } : {},
        ...typeof args.pendingUpdateId === "string" ? { pendingUpdateId: args.pendingUpdateId } : {},
        ...visualReview === void 0 ? {} : { visualReview }
      };
    }),
    daemonTool(ctx, client, localTools[4], (args) => {
      const { root, ...input } = args;
      return { type: "generate", root: String(root ?? ""), input };
    })
  ];
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
  Draw2CodeRuntimeImpl,
  ProjectStore,
  SceneStore,
  apply,
  choosePresentation,
  createDaemonDescriptor,
  draw2codeCreateTool,
  draw2codeGenerateTool,
  draw2codeListTool,
  draw2codeReadTool,
  draw2codeUpdateTool,
  emptyScene,
  formatLayoutIssues,
  inject,
  inspectPrototypeLayout,
  inspectPrototypeQuality,
  isPathInside,
  makeRoutes,
  measureSceneCapacity,
  name,
  normalizeElement,
  normalizeOpsArg,
  normalizeVisualReviewArg,
  validateDaemonDescriptor
};
