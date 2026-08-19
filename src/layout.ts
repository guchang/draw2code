/**
 * Quality checks for agent-authored low-fi prototype geometry.
 *
 * Excalidraw is intentionally permissive: it will happily render a text
 * element whose height can only show the first line, or a rectangle carrying
 * text that has no visible text child. Those scenes are valid JSON but are
 * not useful prototypes, so draw2code_update runs these checks before an
 * agent write reaches disk.
 */

export interface LayoutIssue {
  code: string
  id?: string
  message: string
}

export interface LayoutReport {
  errors: LayoutIssue[]
  warnings: LayoutIssue[]
}

interface LayoutOptions {
  /** Only these elements are allowed to block an incremental agent update. */
  focusIds?: Set<string>
}

const SHAPE_TYPES = new Set(['rectangle', 'diamond', 'ellipse'])
const BOTTOM_NAV_MAX_GAP = 96
const DEFAULT_MOCK_DATA_MIN = 3
const BOTTOM_NAVIGATION_ITEM_ROLES = new Set(['bottom-navigation-item', 'bottom-nav-item'])

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function customData(element: Record<string, unknown>): Record<string, unknown> {
  return typeof element.customData === 'object' && element.customData !== null
    ? element.customData as Record<string, unknown>
    : {}
}

function isFocused(element: Record<string, unknown>, focusIds?: Set<string>): boolean {
  if (focusIds === undefined) return true
  const id = str(element.id)
  const frameId = str(element.frameId)
  return focusIds.has(id) || (frameId !== '' && focusIds.has(frameId))
}

function glyphUnits(value: string): number {
  let units = 0
  for (const char of value) {
    // CJK/full-width glyphs occupy approximately one full font cell. Latin
    // text is narrower, so use a conservative half-cell estimate.
    units += /[\u2e80-\u9fff\uff00-\uffef]/u.test(char) ? 1 : char === ' ' ? 0.35 : 0.55
  }
  return units
}

function estimatedLineCount(element: Record<string, unknown>): number {
  const text = str(element.text)
  if (text === '') return 1
  const width = Math.max(1, num(element.width, 160))
  const fontSize = Math.max(8, num(element.fontSize, 20))
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.62)))
  return text.split(/\r?\n/u).reduce((count, line) => {
    return count + Math.max(1, Math.ceil(glyphUnits(line) / charsPerLine))
  }, 0)
}

function frameFor(
  element: Record<string, unknown>,
  frames: Array<Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const explicit = str(element.frameId)
  if (explicit !== '') return frames.find((frame) => str(frame.id) === explicit)

  const x1 = num(element.x)
  const y1 = num(element.y)
  const x2 = x1 + num(element.width)
  const y2 = y1 + num(element.height)
  return frames.find((frame) => {
    const fx = num(frame.x)
    const fy = num(frame.y)
    return x1 >= fx - 2 && y1 >= fy - 2
      && x2 <= fx + num(frame.width) + 2
      && y2 <= fy + num(frame.height) + 2
  })
}

function isBottomNavigation(element: Record<string, unknown>): boolean {
  const role = str(customData(element).role).toLowerCase()
  if (role === 'bottom-navigation' || role === 'bottom-nav' || role === 'tabbar') return true
  return /底部导航|底部选项卡|tabbar|bottom[ -]?navigation/iu.test(str(element.text))
}

function isPrototypePage(element: Record<string, unknown>): boolean {
  return str(customData(element).role).toLowerCase() === 'prototype-page'
}

function isVisibleMockData(element: Record<string, unknown>): boolean {
  if (str(element.type) !== 'text' || str(customData(element).role).toLowerCase() !== 'mock-data') return false
  const value = str(element.text).trim()
  if (value.length < 2) return false
  return !/^(?:lorem ipsum|用户[a-c1-3]?|好友[a-c1-3]?|昵称|标题|内容|消息|示例|item\s*\d*|\.\.\.|…+)$/iu.test(value)
}

function issue(code: string, element: Record<string, unknown>, message: string): LayoutIssue {
  const id = str(element.id)
  return { code, ...(id !== '' ? { id } : {}), message }
}

/**
 * Inspect a scene using only stable element data. The function deliberately
 * does not know about React or Excalidraw internals, so it can be used by the
 * host tools, tests, and future generate preflight checks alike.
 */
export function inspectPrototypeLayout(
  elements: Array<Record<string, unknown>>,
  options: LayoutOptions = {},
): LayoutReport {
  const frames = elements.filter((element) => str(element.type) === 'frame')
  const elementById = new Map(elements.map((element) => [str(element.id), element]))
  const bottomNavigationShells = elements.filter((element) => SHAPE_TYPES.has(str(element.type)) && isBottomNavigation(element))
  const errors: LayoutIssue[] = []
  const warnings: LayoutIssue[] = []

  for (const element of elements) {
    const type = str(element.type)
    if (type === 'frame' || !isFocused(element, options.focusIds)) continue

    const text = str(element.text)
    if (SHAPE_TYPES.has(type) && text.trim() !== '') {
      errors.push(issue(
        'shape-text-not-visible',
        element,
        `${str(element.id)} is a ${type} with text, but shape text is not a visible label in Excalidraw; add a separate text element and optionally set containerId to ${str(element.id)}`,
      ))
    }

    if (type === 'text' && text !== '') {
      const containerId = str(element.containerId)
      const container = containerId === '' ? undefined : elementById.get(containerId)
      const boundToShape = container !== undefined && SHAPE_TYPES.has(str(container.type))
      const directlyFocused = options.focusIds === undefined
        || options.focusIds.has(str(element.id))
        || (container !== undefined && options.focusIds.has(str(container.id)))
      const elementRole = str(customData(element).role).toLowerCase()
      const containerRole = str(customData(container ?? {}).role).toLowerCase()
      const componentRole = elementRole || containerRole
      if (containerId !== '' && container === undefined && directlyFocused) {
        errors.push(issue(
          'container-target-missing',
          element,
          `${str(element.id)} points to missing container ${containerId}; add the target shape or clear containerId so the label remains visible`,
        ))
      }
      if (boundToShape && directlyFocused && componentRole === '') {
        errors.push(issue(
          'component-role-missing',
          element,
          `${str(element.id)} is bound to ${containerId} without a semantic customData.role; mark the component as button, primary-action, select, input, chip, card, or another explicit product role so draw2code_update can apply the correct text alignment`,
        ))
      }

      const bottomNavigationShell = bottomNavigationShells.find((shell) => {
        return num(element.x) >= num(shell.x) - 2
          && num(element.y) >= num(shell.y) - 2
          && num(element.x) + num(element.width) <= num(shell.x) + num(shell.width) + 2
          && num(element.y) + num(element.height) <= num(shell.y) + num(shell.height) + 2
      })
      const navigationItemFocused = options.focusIds === undefined
        || options.focusIds.has(str(element.id))
        || (bottomNavigationShell !== undefined && options.focusIds.has(str(bottomNavigationShell.id)))
      if (bottomNavigationShell !== undefined && navigationItemFocused && !BOTTOM_NAVIGATION_ITEM_ROLES.has(elementRole)) {
        errors.push(issue(
          'bottom-navigation-item-role-missing',
          element,
          `${str(element.id)} is inside bottom navigation ${str(bottomNavigationShell.id)} without customData.role=bottom-navigation-item; add the item role so its label is centered within its navigation slot`,
        ))
      }

      const lines = estimatedLineCount(element)
      const fontSize = Math.max(8, num(element.fontSize, 20))
      const lineHeight = Math.max(1, num(element.lineHeight, 1.25))
      const requiredHeight = Math.ceil(lines * fontSize * lineHeight + 8)
      const explicitHeight = typeof element.height === 'number' && Number.isFinite(element.height)
      if (lines > 1 && explicitHeight && num(element.height) + 2 < requiredHeight) {
        errors.push(issue(
          'text-height-overflow',
          element,
          `${str(element.id)} text height ${Math.round(num(element.height))} cannot contain approximately ${lines} lines; use height >= ${requiredHeight} or split the component into separate text elements`,
        ))
      }
    }

    const frame = frameFor(element, frames)
    if (frame !== undefined && type !== 'arrow' && type !== 'line') {
      const x1 = num(element.x)
      const y1 = num(element.y)
      const x2 = x1 + num(element.width)
      const y2 = y1 + num(element.height)
      const fx = num(frame.x)
      const fy = num(frame.y)
      const right = fx + num(frame.width)
      const bottom = fy + num(frame.height)
      if (x1 < fx - 2 || y1 < fy - 2 || x2 > right + 2 || y2 > bottom + 2) {
        errors.push(issue(
          'frame-overflow',
          element,
          `${str(element.id)} extends outside frame ${str(frame.name) || str(frame.id)}; keep the complete component inside its page frame`,
        ))
      }
    }

    if (isBottomNavigation(element)) {
      const navFrame = frameFor(element, frames)
      if (navFrame === undefined) {
        warnings.push(issue(
          'bottom-navigation-unframed',
          element,
          `${str(element.id)} is marked as bottom navigation but is not inside a page frame`,
        ))
      } else {
        const frameBottom = num(navFrame.y) + num(navFrame.height)
        const navBottom = num(element.y) + num(element.height)
        const gap = frameBottom - navBottom
        if (gap > BOTTOM_NAV_MAX_GAP) {
          errors.push(issue(
            'bottom-navigation-offset',
            element,
            `${str(element.id)} is ${Math.round(gap)}px above the frame bottom; place the bottom navigation in the bottom safe area (gap <= ${BOTTOM_NAV_MAX_GAP}px)`,
          ))
        }
      }

      if (type === 'text') {
        errors.push(issue(
          'bottom-navigation-needs-shell',
          element,
          `${str(element.id)} is a text-only bottom navigation; add a rectangle shell plus separate text labels so the component has a visible boundary and stable geometry`,
        ))
      }
    }
  }

  for (const shell of bottomNavigationShells) {
    const items = elements.filter((element) => {
      if (str(element.type) !== 'text' || !BOTTOM_NAVIGATION_ITEM_ROLES.has(str(customData(element).role).toLowerCase())) return false
      return num(element.x) >= num(shell.x) - 2
        && num(element.y) >= num(shell.y) - 2
        && num(element.x) + num(element.width) <= num(shell.x) + num(shell.width) + 2
        && num(element.y) + num(element.height) <= num(shell.y) + num(shell.height) + 2
    })
    const shellFocused = isFocused(shell, options.focusIds)
      || items.some((item) => isFocused(item, options.focusIds))
    if (!shellFocused) continue
    if (items.length === 0) {
      errors.push(issue(
        'bottom-navigation-items-missing',
        shell,
        `${str(shell.id)} has no visible bottom-navigation-item labels; add separate text items inside the navigation shell`,
      ))
      continue
    }
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const left = items[leftIndex]
        const right = items[rightIndex]
        const overlaps = num(left.x) < num(right.x) + num(right.width)
          && num(left.x) + num(left.width) > num(right.x)
          && num(left.y) < num(right.y) + num(right.height)
          && num(left.y) + num(left.height) > num(right.y)
        if (!overlaps) continue
        errors.push(issue(
          'bottom-navigation-item-overlap',
          shell,
          `${str(left.id)} overlaps ${str(right.id)} inside ${str(shell.id)}; give each navigation item its own non-overlapping slot`,
        ))
      }
    }
  }

  for (const frame of frames) {
    if (!isPrototypePage(frame) || !isFocused(frame, options.focusIds)) continue
    const configuredMinimum = num(customData(frame).mockDataMin, DEFAULT_MOCK_DATA_MIN)
    const minimum = Math.max(1, Math.floor(configuredMinimum))
    const records = new Set(
      elements
        .filter((element) => frameFor(element, frames) === frame && isVisibleMockData(element))
        .map((element) => str(element.text).trim()),
    )
    if (records.size < minimum) {
      errors.push(issue(
        'mock-data-insufficient',
        frame,
        `${str(frame.name) || str(frame.id)} requires ${minimum} visible mock-data text records; found ${records.size}. Add realistic example names, values, statuses or messages instead of empty boxes and mark each text with customData.role=mock-data`,
      ))
    }
  }

  return { errors, warnings }
}

export function formatLayoutIssues(issues: readonly unknown[]): string {
  return issues.map((item) => {
    const value = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {}
    const code = str(value.code) || 'layout-warning'
    const id = str(value.id)
    const message = str(value.message) || JSON.stringify(item)
    return `- ${code}${id === '' ? '' : ` [${id}]`}: ${message}`
  }).join('\n')
}
