/**
 * A Draw2Code page is a product-level boundary, not necessarily an
 * Excalidraw Frame. New boards use ordinary rectangle shells so a user's
 * hand-drawn cross-page arrows are never clipped by Frame containment. Named
 * Frames remain readable as a legacy representation.
 */

export type PrototypePageKind = 'page-shell' | 'legacy-frame'

export interface PrototypePageBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PrototypePage {
  id: string
  name: string
  kind: PrototypePageKind
  bounds: PrototypePageBounds
  element: Record<string, unknown>
}

export interface PrototypePageRelation {
  id: string
  sourcePage: string
  targetPage: string
  sourceElementId?: string
  targetElementId?: string
  label?: string
}

export interface PageMembershipWarning {
  code: 'page-membership-ambiguous' | 'page-name-duplicate'
  id: string
  message: string
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function customData(element: Record<string, unknown> | undefined): Record<string, unknown> {
  return typeof element?.customData === 'object' && element.customData !== null
    ? element.customData as Record<string, unknown>
    : {}
}

function role(element: Record<string, unknown> | undefined): string {
  return str(customData(element).role).trim().toLowerCase()
}

function containsPoint(page: PrototypePage, x: number, y: number, tolerance = 0): boolean {
  return x >= page.bounds.x - tolerance
    && y >= page.bounds.y - tolerance
    && x <= page.bounds.x + page.bounds.width + tolerance
    && y <= page.bounds.y + page.bounds.height + tolerance
}

function pageDistance(page: PrototypePage, x: number, y: number): number {
  const right = page.bounds.x + page.bounds.width
  const bottom = page.bounds.y + page.bounds.height
  const dx = x < page.bounds.x ? page.bounds.x - x : x > right ? x - right : 0
  const dy = y < page.bounds.y ? page.bounds.y - y : y > bottom ? y - bottom : 0
  return Math.hypot(dx, dy)
}

export function isPrototypePageLabel(element: Record<string, unknown>): boolean {
  return str(element.type) === 'text' && role(element) === 'prototype-page-label'
}

export function isPrototypePageShell(element: Record<string, unknown>): boolean {
  return str(element.type) === 'rectangle'
    && role(element) === 'prototype-page'
    && str(customData(element).pageName).trim() !== ''
}

function prototypePageName(element: Record<string, unknown>): string {
  if (str(element.type) === 'frame') return str(element.name).trim()
  return isPrototypePageShell(element) ? str(customData(element).pageName).trim() : ''
}

export function prototypePages(elements: Array<Record<string, unknown>>): PrototypePage[] {
  const pages: PrototypePage[] = []
  const names = new Set<string>()
  for (const element of elements) {
    const type = str(element.type)
    const pageName = prototypePageName(element)
    if (pageName === '' || names.has(pageName)) continue
    names.add(pageName)
    pages.push({
      id: str(element.id),
      name: pageName,
      kind: type === 'frame' ? 'legacy-frame' : 'page-shell',
      bounds: {
        x: num(element.x),
        y: num(element.y),
        width: num(element.width),
        height: num(element.height),
      },
      element,
    })
  }
  return pages
}

export function pageNameWarnings(
  elements: Array<Record<string, unknown>>,
): PageMembershipWarning[] {
  const firstByName = new Map<string, string>()
  const warnings: PageMembershipWarning[] = []
  for (const element of elements) {
    const name = prototypePageName(element)
    if (name === '') continue
    const firstId = firstByName.get(name)
    if (firstId === undefined) {
      firstByName.set(name, str(element.id))
      continue
    }
    warnings.push({
      code: 'page-name-duplicate',
      id: str(element.id),
      message: `页面「${name}」同时用于 ${firstId} 和 ${str(element.id)}，无法按页面名唯一选择；请为其中一个页面设置不同名称`,
    })
  }
  return warnings
}

export function pageMembershipCandidates(
  element: Record<string, unknown>,
  pages: PrototypePage[],
): PrototypePage[] {
  const id = str(element.id)
  const ownPage = pages.find((page) => page.id === id)
  if (ownPage !== undefined) return [ownPage]

  if (isPrototypePageLabel(element)) {
    const page = pages.find((candidate) => candidate.id === str(customData(element).pageId))
    return page === undefined ? [] : [page]
  }

  const explicitFrame = str(element.frameId)
  if (explicitFrame !== '') {
    const page = pages.find((candidate) => candidate.kind === 'legacy-frame' && candidate.id === explicitFrame)
    if (page !== undefined) return [page]
  }

  const centerX = num(element.x) + num(element.width) / 2
  const centerY = num(element.y) + num(element.height) / 2
  return pages.filter((page) => containsPoint(page, centerX, centerY, 2))
}

export function pageForElement(
  element: Record<string, unknown>,
  pages: PrototypePage[],
): PrototypePage | undefined {
  const candidates = pageMembershipCandidates(element, pages)
  return candidates.length === 1 ? candidates[0] : undefined
}

function arrowEndpoint(
  arrow: Record<string, unknown>,
  atEnd: boolean,
): { x: number; y: number } {
  const points = Array.isArray(arrow.points) ? arrow.points as unknown[] : []
  const point = Array.isArray(atEnd ? points.at(-1) : points[0])
    ? (atEnd ? points.at(-1) : points[0]) as unknown[]
    : atEnd
      ? [num(arrow.width), num(arrow.height)]
      : [0, 0]
  return { x: num(arrow.x) + num(point[0]), y: num(arrow.y) + num(point[1]) }
}

function endpointPage(
  arrow: Record<string, unknown>,
  bindingKey: 'startBinding' | 'endBinding',
  pages: PrototypePage[],
  elementsById: Map<string, Record<string, unknown>>,
): PrototypePage | undefined {
  const binding = typeof arrow[bindingKey] === 'object' && arrow[bindingKey] !== null
    ? arrow[bindingKey] as Record<string, unknown>
    : {}
  const target = elementsById.get(str(binding.elementId))
  if (target !== undefined) {
    return pageForElement(target, pages)
  }

  const endpoint = arrowEndpoint(arrow, bindingKey === 'endBinding')
  const contained = pages.filter((page) => containsPoint(page, endpoint.x, endpoint.y, 2))
  if (contained.length === 1) return contained[0]
  if (contained.length > 1) return undefined
  return pages
    .map((page) => ({ page, distance: pageDistance(page, endpoint.x, endpoint.y) }))
    .filter(({ distance }) => distance <= 48)
    .sort((left, right) => left.distance - right.distance)[0]?.page
}

function internalPageForArrow(
  arrow: Record<string, unknown>,
  pages: PrototypePage[],
  elementsById: Map<string, Record<string, unknown>>,
): PrototypePage | undefined {
  const source = endpointPage(arrow, 'startBinding', pages, elementsById)
  const target = endpointPage(arrow, 'endBinding', pages, elementsById)
  return source !== undefined && target?.id === source.id ? source : undefined
}

export function relationForArrow(
  arrow: Record<string, unknown>,
  pages: PrototypePage[],
  elementsById: Map<string, Record<string, unknown>>,
): PrototypePageRelation | undefined {
  if (str(arrow.type) !== 'arrow') return undefined
  const source = endpointPage(arrow, 'startBinding', pages, elementsById)
  const target = endpointPage(arrow, 'endBinding', pages, elementsById)
  if (source === undefined || target === undefined || source.id === target.id) return undefined
  const startBinding = typeof arrow.startBinding === 'object' && arrow.startBinding !== null
    ? arrow.startBinding as Record<string, unknown>
    : {}
  const endBinding = typeof arrow.endBinding === 'object' && arrow.endBinding !== null
    ? arrow.endBinding as Record<string, unknown>
    : {}
  const label = [...elementsById.values()].find((element) => {
    return str(element.type) === 'text' && str(element.containerId) === str(arrow.id)
  })
  return {
    id: str(arrow.id),
    sourcePage: source.name,
    targetPage: target.name,
    ...(str(startBinding.elementId) === '' ? {} : { sourceElementId: str(startBinding.elementId) }),
    ...(str(endBinding.elementId) === '' ? {} : { targetElementId: str(endBinding.elementId) }),
    ...(str(label?.text).trim() === '' ? {} : { label: str(label?.text).trim() }),
  }
}

export function prototypePageRelations(
  elements: Array<Record<string, unknown>>,
  pages = prototypePages(elements),
): PrototypePageRelation[] {
  const elementsById = new Map(elements.map((element) => [str(element.id), element]))
  return elements
    .filter((element) => str(element.type) === 'arrow')
    .flatMap((arrow) => {
      const relation = relationForArrow(arrow, pages, elementsById)
      return relation === undefined ? [] : [relation]
    })
}

export function pageElementIds(
  page: PrototypePage,
  elements: Array<Record<string, unknown>>,
  pages = prototypePages(elements),
): string[] {
  const elementsById = new Map(elements.map((element) => [str(element.id), element]))
  const crossPageArrowIds = new Set(
    prototypePageRelations(elements, pages).map((relation) => relation.id),
  )
  return elements.flatMap((element) => {
    if (str(element.id) === page.id || isPrototypePageLabel(element)) return []
    if (str(element.type) === 'text' && crossPageArrowIds.has(str(element.containerId))) return []
    if (str(element.type) === 'arrow') {
      const relation = relationForArrow(element, pages, elementsById)
      if (relation !== undefined) return []
      const internalPage = internalPageForArrow(element, pages, elementsById)
      if (internalPage !== undefined) return internalPage.id === page.id ? [str(element.id)] : []
    }
    return pageForElement(element, pages)?.id === page.id ? [str(element.id)] : []
  })
}

export function pageMembershipWarnings(
  elements: Array<Record<string, unknown>>,
  pages = prototypePages(elements),
): PageMembershipWarning[] {
  return elements.flatMap((element) => {
    if (pages.some((page) => page.id === str(element.id)) || isPrototypePageLabel(element) || str(element.type) === 'arrow') return []
    const candidates = pageMembershipCandidates(element, pages)
    if (candidates.length <= 1) return []
    return [{
      code: 'page-membership-ambiguous' as const,
      id: str(element.id),
      message: `${str(element.id)} 同时落在页面「${candidates.map((page) => page.name).join('」「')}」中，无法唯一判断页面归属；请移动页面或元素以消除重叠`,
    }]
  })
}

export function publicPrototypePages(
  elements: Array<Record<string, unknown>>,
  pages = prototypePages(elements),
): Array<Omit<PrototypePage, 'element'> & { elementIds: string[] }> {
  return pages.map((page) => ({
    id: page.id,
    name: page.name,
    kind: page.kind,
    bounds: page.bounds,
    elementIds: pageElementIds(page, elements, pages),
  }))
}
