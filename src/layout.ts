/**
 * Quality checks for agent-authored low-fi prototype geometry.
 *
 * Excalidraw is intentionally permissive: it will happily render a text
 * element whose height can only show the first line, or a rectangle carrying
 * text that has no visible text child. Those scenes are valid JSON but are
 * not useful prototypes, so draw2code_update runs these checks before an
 * agent write reaches disk.
 */

import {
  isPrototypePageLabel,
  pageForElement,
  pageMembershipWarnings,
  pageNameWarnings,
  prototypePages,
  type PrototypePage,
} from './prototype-page.ts'

export interface LayoutIssue {
  code: string
  id?: string
  message: string
}

export interface LayoutReport {
  errors: LayoutIssue[]
  warnings: LayoutIssue[]
}

export interface PrototypeQualityPageResult {
  pageId: string
  pageName: string
  qualityScore: number
  warnings: LayoutIssue[]
}

export interface PrototypeQualityReport {
  structurePassed: boolean
  contentPassed: boolean
  layoutPassed: boolean
  visualReviewRequired: boolean
  qualityScore: number
  warnings: LayoutIssue[]
  pages: PrototypeQualityPageResult[]
}

interface LayoutOptions {
  /** Only these elements are allowed to block an incremental agent update. */
  focusIds?: Set<string>
}

const SHAPE_TYPES = new Set(['rectangle', 'diamond', 'ellipse'])
const BOTTOM_NAV_MAX_GAP = 96
const DEFAULT_MOCK_DATA_MIN = 3
const BOTTOM_NAVIGATION_ITEM_ROLES = new Set(['bottom-navigation-item', 'bottom-nav-item'])
const PRIMARY_ACTION_ROLES = new Set(['primary-action', 'primary-button'])
const INTERACTIVE_ROLES = new Set([
  ...PRIMARY_ACTION_ROLES,
  'button', 'secondary-action', 'secondary-button', 'danger-button', 'destructive-button',
  'chip', 'filter-chip', 'choice-chip', 'tab', 'tab-item', 'bottom-navigation-item', 'bottom-nav-item',
])
const CONTENT_WARNING_CODES = new Set([
  'page-content-too-sparse',
  'page-content-too-dense',
  'above-fold-content-insufficient',
  'continuous-empty-space-too-large',
  'status-emphasis-missing',
  'primary-action-missing',
  'primary-action-ambiguous',
  'visual-hierarchy-flat',
])

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
  const pageId = str(customData(element).pageId)
  return focusIds.has(id)
    || (frameId !== '' && focusIds.has(frameId))
    || (pageId !== '' && focusIds.has(pageId))
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

function pageFor(
  element: Record<string, unknown>,
  pages: PrototypePage[],
): PrototypePage | undefined {
  return pageForElement(element, pages)
}

function isBottomNavigation(element: Record<string, unknown>): boolean {
  const role = str(customData(element).role).toLowerCase()
  if (role === 'bottom-navigation' || role === 'bottom-nav' || role === 'tabbar') return true
  return /底部导航|底部选项卡|tabbar|bottom[ -]?navigation/iu.test(str(element.text))
}

function isBottomNavigationMember(element: Record<string, unknown>): boolean {
  return isBottomNavigation(element) || BOTTOM_NAVIGATION_ITEM_ROLES.has(str(customData(element).role).toLowerCase())
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
  const pages = prototypePages(elements)
  const pageIds = new Set(pages.map((page) => page.id))
  const elementById = new Map(elements.map((element) => [str(element.id), element]))
  const bottomNavigationShells = elements.filter((element) => SHAPE_TYPES.has(str(element.type)) && isBottomNavigation(element))
  const errors: LayoutIssue[] = []
  const warnings: LayoutIssue[] = [
    ...pageNameWarnings(elements),
    ...pageMembershipWarnings(elements, pages),
  ]

  for (const element of elements) {
    const type = str(element.type)
    if (pageIds.has(str(element.id)) || !isFocused(element, options.focusIds)) continue

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

    const page = pageFor(element, pages)
    if (page !== undefined && !isPrototypePageLabel(element) && type !== 'arrow' && type !== 'line') {
      const x1 = num(element.x)
      const y1 = num(element.y)
      const x2 = x1 + num(element.width)
      const y2 = y1 + num(element.height)
      const fx = page.bounds.x
      const fy = page.bounds.y
      const right = fx + page.bounds.width
      const bottom = fy + page.bounds.height
      if (x1 < fx - 2 || y1 < fy - 2 || x2 > right + 2 || y2 > bottom + 2) {
        errors.push(issue(
          page.kind === 'legacy-frame' ? 'frame-overflow' : 'page-overflow',
          element,
          `${str(element.id)} extends outside page ${page.name || page.id}; keep the complete component inside its page boundary`,
        ))
      }
    }

    if (isBottomNavigation(element)) {
      const navPage = pageFor(element, pages)
      if (navPage === undefined) {
        warnings.push(issue(
          'bottom-navigation-unpaged',
          element,
          `${str(element.id)} is marked as bottom navigation but is not inside a prototype page`,
        ))
      } else {
        const pageBottom = navPage.bounds.y + navPage.bounds.height
        const navBottom = num(element.y) + num(element.height)
        const gap = pageBottom - navBottom
        if (gap > BOTTOM_NAV_MAX_GAP) {
          errors.push(issue(
            'bottom-navigation-offset',
            element,
            `${str(element.id)} is ${Math.round(gap)}px above the page bottom; place the bottom navigation in the bottom safe area (gap <= ${BOTTOM_NAV_MAX_GAP}px)`,
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

  for (const page of pages) {
    const pageElement = page.element
    if (str(customData(pageElement).role).toLowerCase() !== 'prototype-page'
      || !isFocused(pageElement, options.focusIds)) continue
    const configuredMinimum = num(customData(pageElement).mockDataMin, DEFAULT_MOCK_DATA_MIN)
    const minimum = Math.max(1, Math.floor(configuredMinimum))
    const records = new Set(
      elements
        .filter((element) => pageFor(element, pages)?.id === page.id && isVisibleMockData(element))
        .map((element) => str(element.text).trim()),
    )
    if (records.size < minimum) {
      errors.push(issue(
        'mock-data-insufficient',
        pageElement,
        `${page.name || page.id} requires ${minimum} visible mock-data text records; found ${records.size}. Add realistic example names, values, statuses or messages instead of empty boxes and mark each text with customData.role=mock-data`,
      ))
    }
  }

  return { errors, warnings }
}

function elementRole(element: Record<string, unknown>): string {
  return str(customData(element).role).trim().toLowerCase()
}

function isPageContent(element: Record<string, unknown>, page: PrototypePage): boolean {
  const type = str(element.type)
  if (str(element.id) === page.id || isPrototypePageLabel(element)) return false
  if (type === 'arrow' || type === 'line' || type === 'freedraw') return false
  return num(element.width) > 0 && num(element.height) > 0
}

function qualityIssue(code: string, page: PrototypePage, message: string): LayoutIssue {
  return { code, id: page.id, message }
}

function pageQualityWarnings(
  page: PrototypePage,
  members: Array<Record<string, unknown>>,
): LayoutIssue[] {
  const warnings: LayoutIssue[] = []
  const content = members.filter((element) => isPageContent(element, page))
  const texts = content.filter((element) => str(element.type) === 'text' && str(element.text).trim() !== '')
  const shapes = content.filter((element) => SHAPE_TYPES.has(str(element.type)))
  const elementById = new Map(members.map((element) => [str(element.id), element]))
  const pageTop = page.bounds.y
  const pageBottom = page.bounds.y + page.bounds.height
  const aboveFoldBottom = pageTop + page.bounds.height * 0.58
  const aboveFold = content.filter((element) => num(element.y) < aboveFoldBottom)

  if (content.length < 8) {
    warnings.push(qualityIssue(
      'page-content-too-sparse',
      page,
      `${page.name} only has ${content.length} visible content elements; add the information needed to understand the page's main task without falling back to empty space`,
    ))
  }
  if (content.length > 52) {
    warnings.push(qualityIssue(
      'page-content-too-dense',
      page,
      `${page.name} has ${content.length} visible content elements; group or defer secondary information so the first screen stays scannable`,
    ))
  }
  if (aboveFold.length < 4) {
    warnings.push(qualityIssue(
      'above-fold-content-insufficient',
      page,
      `${page.name} has only ${aboveFold.length} meaningful elements in the first screen; expose the page heading, current state, key content, and primary action above the fold`,
    ))
  }

  const verticalBoxes = content
    .map((element) => ({ top: Math.max(pageTop, num(element.y)), bottom: Math.min(pageBottom, num(element.y) + num(element.height)) }))
    .sort((left, right) => left.top - right.top)
  let largestGap = verticalBoxes.length === 0 ? page.bounds.height : Math.max(0, verticalBoxes[0].top - pageTop)
  let coveredBottom = pageTop
  for (const box of verticalBoxes) {
    largestGap = Math.max(largestGap, box.top - coveredBottom)
    coveredBottom = Math.max(coveredBottom, box.bottom)
  }
  largestGap = Math.max(largestGap, pageBottom - coveredBottom)
  if (largestGap > page.bounds.height * 0.34) {
    warnings.push(qualityIssue(
      'continuous-empty-space-too-large',
      page,
      `${page.name} contains an unexplained vertical empty region of about ${Math.round(largestGap)}px; rebalance the content flow or reserve the space with an explicit product purpose`,
    ))
  }

  const fontSizes = texts.map((element) => num(element.fontSize, 20))
  if (fontSizes.length >= 4 && Math.max(...fontSizes) - Math.min(...fontSizes) < 4) {
    warnings.push(qualityIssue(
      'text-scale-flat',
      page,
      `${page.name} uses nearly one text size for headings, content, and metadata; create at least a clear heading/body/supporting-text hierarchy`,
    ))
  }

  const primaryActions = content.filter((element) => PRIMARY_ACTION_ROLES.has(elementRole(element)))
  const primaryActionIds = new Set(primaryActions.map((element) => str(element.containerId) || str(element.id)))
  if (primaryActionIds.size === 0) {
    warnings.push(qualityIssue(
      'primary-action-missing',
      page,
      `${page.name} has no semantic primary action; mark the one action that advances the page's core task with customData.role=primary-action`,
    ))
  } else if (primaryActionIds.size > 1) {
    warnings.push(qualityIssue(
      'primary-action-ambiguous',
      page,
      `${page.name} exposes ${primaryActionIds.size} primary actions; keep one dominant action and demote the rest`,
    ))
  }

  const statusTexts = texts.filter((element) => /进行中|待处理|已完成|已逾期|失败|成功|警告|异常|高优先级|低优先级/iu.test(str(element.text)))
  const hasSemanticTone = (element: Record<string, unknown>): boolean => {
    const ownTone = str(customData(element).tone).toLowerCase()
    if (ownTone !== '' && ownTone !== 'neutral') return true
    const container = elementById.get(str(element.containerId))
    const containerTone = container === undefined ? '' : str(customData(container).tone).toLowerCase()
    return containerTone !== '' && containerTone !== 'neutral'
  }
  if (statusTexts.some((element) => !hasSemanticTone(element))) {
    warnings.push(qualityIssue(
      'status-emphasis-missing',
      page,
      `${page.name} contains status or priority text without emphasis on that status element or its bound container; use restrained success, warning, danger, or info tone to support fast scanning`,
    ))
  }

  if (shapes.length >= 4) {
    const visualSignatures = new Set(shapes.map((element) => {
      const data = customData(element)
      return [str(data.tone).toLowerCase() || 'neutral', str(element.backgroundColor) || 'transparent', str(element.strokeWidth) || '1'].join('|')
    }))
    if (visualSignatures.size <= 1) {
      warnings.push(qualityIssue(
        'visual-hierarchy-flat',
        page,
        `${page.name} gives all major blocks the same fill, tone, and border weight; soften secondary regions and reserve stronger emphasis for the page's primary task`,
      ))
    }
  }

  const outlinedShapes = shapes.filter((element) => {
    const background = str(element.backgroundColor)
    return background === '' || background === 'transparent'
  })
  if (shapes.length >= 5 && outlinedShapes.length / shapes.length >= 0.75) {
    warnings.push(qualityIssue(
      'border-overuse',
      page,
      `${page.name} draws ${outlinedShapes.length} of ${shapes.length} shapes as outline-only boxes; use spacing, grouping, and a few semantic fills instead of giving every item equal border weight`,
    ))
  }

  for (const element of content) {
    if (!INTERACTIVE_ROLES.has(elementRole(element))) continue
    if (str(element.type) === 'text') continue
    if (num(element.width) < 44 || num(element.height) < 44) {
      warnings.push(issue(
        'tap-target-too-small',
        element,
        `${str(element.id)} is ${Math.round(num(element.width))}×${Math.round(num(element.height))}px; interactive controls should provide at least a 44×44px touch target`,
      ))
    }
  }

  const leftOffsets = content
    .filter((element) => !isBottomNavigationMember(element) && num(element.width) > page.bounds.width * 0.5)
    .map((element) => Math.round(num(element.x) - page.bounds.x))
  if (leftOffsets.length >= 4 && Math.max(...leftOffsets) - Math.min(...leftOffsets) > 20) {
    warnings.push(qualityIssue(
      'page-margin-inconsistent',
      page,
      `${page.name} uses inconsistent main-content left margins (${Math.min(...leftOffsets)}–${Math.max(...leftOffsets)}px); align repeated blocks to a stable page grid`,
    ))
  }

  const heightsByRole = new Map<string, number[]>()
  for (const element of content) {
    const role = elementRole(element)
    if (role === '') continue
    const values = heightsByRole.get(role) ?? []
    values.push(num(element.height))
    heightsByRole.set(role, values)
  }
  for (const [role, heights] of heightsByRole.entries()) {
    if (heights.length < 3 || Math.max(...heights) - Math.min(...heights) <= 8) continue
    warnings.push(qualityIssue(
      'repeated-control-rhythm-inconsistent',
      page,
      `${page.name} repeats role=${role} with heights from ${Math.round(Math.min(...heights))}px to ${Math.round(Math.max(...heights))}px; use a consistent component rhythm`,
    ))
  }
  return warnings
}

/**
 * Report product-prototype quality separately from persistence correctness.
 * Warnings are intentionally non-destructive: the tool can prove a write while
 * still requiring the Agent to inspect and improve the visible prototype.
 */
export function inspectPrototypeQuality(
  elements: Array<Record<string, unknown>>,
): PrototypeQualityReport {
  const layout = inspectPrototypeLayout(elements)
  const pages = prototypePages(elements)
  const perPage = pages.map((page) => {
    const members = elements.filter((element) => pageForElement(element, pages)?.id === page.id)
    const warnings = pageQualityWarnings(page, members)
    return {
      pageId: page.id,
      pageName: page.name,
      qualityScore: Math.max(0, 100 - warnings.length * 8),
      warnings,
    }
  })
  const warnings = [...layout.warnings, ...perPage.flatMap((page) => page.warnings)]
  const structurePassed = layout.errors.length === 0
    && !layout.warnings.some((warning) => warning.code === 'page-membership-ambiguous' || warning.code === 'page-name-duplicate')
  const contentPassed = !warnings.some((warning) => CONTENT_WARNING_CODES.has(warning.code))
  return {
    structurePassed,
    contentPassed,
    layoutPassed: layout.errors.length === 0,
    visualReviewRequired: pages.length > 0,
    qualityScore: Math.max(0, 100 - layout.errors.length * 20 - warnings.length * 5),
    warnings,
    pages: perPage,
  }
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
