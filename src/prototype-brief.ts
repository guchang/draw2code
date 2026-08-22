export interface PrototypeViewport {
  width: number
  height: number
}

export interface PrototypeLayout {
  platform: string
  viewport: PrototypeViewport
  arrangement: string
  connectionStyle: string
  representativePageId: string
  comprehensionGoal: string
}

export interface PrototypeMockDataGroup {
  name: string
  items: string[]
}

export interface PrototypePageBrief {
  id: string
  name: string
  goal: string
  size: PrototypeViewport
  structure: string[]
  primaryAction: string
  secondaryActions: string[]
  mockDataGroups: PrototypeMockDataGroup[]
  states: string[]
  navigation: string[]
  annotations: string[]
  acceptanceCriteria: string[]
}

export interface PrototypePageRelation {
  fromPageId: string
  toPageId: string
  trigger: string
  result: string
  arrowStyle: 'solid' | 'dashed'
  label: string
}

export interface PrototypeBrief {
  title: string
  productDefinition: string
  target: string
  coreScenario: string
  coreOutcome: string
  uniqueMechanism: string[]
  firstVersionFlow: string[]
  includedScope: string[]
  excludedScope: string[]
  prototypeLayout: PrototypeLayout
  pages: PrototypePageBrief[]
  pageRelations: PrototypePageRelation[]
  prototypePrinciples: string[]
  acceptanceCriteria: string[]
  assumptions: string[]
  pendingDecisions: string[]
}

export interface ExecutablePrototypeBrief extends PrototypeBrief {
  briefSchemaVersion: 2
  pageBlueprints: Array<{
    pageId: string
    page: string
    coreTask: string
    primaryAction: string
    aboveFold: string[]
    semanticComponents: Array<{ kind: string; role: string; purpose: string; requiredParts: string[] }>
  }>
  pageMockData: Array<{
    pageId: string
    page: string
    minimumRecords: number
    requiredContent: string[]
    examples: string[]
  }>
  mockDataPolicy: Record<string, unknown>
  prototypeQualityPolicy: Record<string, unknown>
  interactions: string[]
  deferredStyleNote: string | null
}

export type PrototypeBriefResult =
  | { ok: true; brief: ExecutablePrototypeBrief; markdown: string }
  | { ok: false; code: 'brief_quality_invalid'; message: string; issues: string[] }

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim() !== '')) return null
  return value.map((item) => item.trim())
}

function viewportValue(value: unknown): PrototypeViewport | null {
  const object = objectValue(value)
  if (object === null || typeof object.width !== 'number' || typeof object.height !== 'number') return null
  if (!Number.isFinite(object.width) || !Number.isFinite(object.height) || object.width < 240 || object.height < 240) return null
  return { width: object.width, height: object.height }
}

function hasGenericMock(value: string): boolean {
  return /^(?:用户\s*[A-ZＡ-Ｚ]|标题|内容|示例任务|Lorem ipsum|待填|占位)$/iu.test(value.trim())
}

function hasGenericStructure(value: string): boolean {
  return /^(?:顶部区域|底部区域|内容区域|内容卡片|信息模块|列表内容|若干按钮|若干卡片|按钮|卡片|列表)$/u.test(value.trim())
}

const VISUAL_OR_TECH_IMPLEMENTATION_RE = /(?:React|Vue|Svelte|Angular|Next\.?js|Tailwind|TypeScript|技术栈|前端框架|数据库实现|API\s*接口|品牌色|品牌字体|字体(?:风格|家族)|圆角(?:体系|半径|\s*\d+\s*px)|3D|拟物|扁平风)/iu
const POSITIVE_SCOPE_RE = /(?:包含|支持|提供|接入|启用|加入|允许)/u

function normalizedScopeConcept(value: string): string {
  return value
    .replace(/(?:首版|第一版|本轮|原型|功能|能力|页面|明确|不加入|不包含|无需|暂不|推迟|延迟)/gu, '')
    .replace(/[\s，。！？、,.!?：:；;（）()／/\-]/gu, '')
}

function parsePage(value: unknown, index: number, issues: string[]): PrototypePageBrief | null {
  const object = objectValue(value)
  if (object === null) {
    issues.push(`pages[${index}] 必须是对象`)
    return null
  }
  const id = textValue(object.id)
  const name = textValue(object.name)
  const goal = textValue(object.goal)
  const size = viewportValue(object.size)
  const structure = stringList(object.structure)
  const primaryAction = textValue(object.primaryAction)
  const secondaryActions = stringList(object.secondaryActions)
  const states = stringList(object.states)
  const navigation = stringList(object.navigation)
  const annotations = stringList(object.annotations)
  const acceptanceCriteria = stringList(object.acceptanceCriteria)
  if (id === null) issues.push(`pages[${index}].id 不能为空`)
  if (name === null) issues.push(`pages[${index}].name 不能为空`)
  if (goal === null || goal.length < 8) issues.push(`pages[${index}].goal 必须说明用户来到页面后的核心任务`)
  if (size === null) issues.push(`pages[${index}].size 必须提供有效页面尺寸`)
  if (structure === null || structure.length < 3) issues.push(`pages[${index}].structure 至少包含 3 条可直接绘制的具体内容`)
  else {
    const generic = structure.find(hasGenericStructure)
    if (generic !== undefined) issues.push(`pages[${index}].structure 包含泛化占位“${generic}”，必须改成可直接绘制的标题、控件文案或内容结构`)
  }
  if (primaryAction === null) issues.push(`pages[${index}].primaryAction 不能为空`)
  if (secondaryActions === null) issues.push(`pages[${index}].secondaryActions 必须是字符串数组`)
  if (states === null) issues.push(`pages[${index}].states 必须是字符串数组`)
  if (navigation === null) issues.push(`pages[${index}].navigation 必须是字符串数组`)
  if (annotations === null) issues.push(`pages[${index}].annotations 必须是字符串数组`)
  if (acceptanceCriteria === null || acceptanceCriteria.length === 0) issues.push(`pages[${index}].acceptanceCriteria 至少包含一项页面专项验收`)

  const rawGroups = Array.isArray(object.mockDataGroups) ? object.mockDataGroups : []
  if (!Array.isArray(object.mockDataGroups)) {
    issues.push(`pages[${index}].mockDataGroups 必须是 [{ name, items: string[] }]，不要使用 mockData、mockDataItems 或对象记录别名`)
  }
  const mockDataGroups: PrototypeMockDataGroup[] = []
  for (const [groupIndex, rawGroup] of rawGroups.entries()) {
    const group = objectValue(rawGroup)
    const groupName = textValue(group?.name)
    const items = stringList(group?.items)
    if (groupName === null || items === null || items.length === 0) {
      issues.push(`pages[${index}].mockDataGroups[${groupIndex}] 必须包含名称和真实数据`)
      continue
    }
    if (items.some(hasGenericMock)) issues.push(`pages[${index}].mockDataGroups[${groupIndex}] 包含无意义占位内容`)
    mockDataGroups.push({ name: groupName, items })
  }
  const mockCount = mockDataGroups.reduce((sum, group) => sum + group.items.length, 0)
  if (mockCount < 3) issues.push(`pages[${index}] 至少需要 3 条首次渲染可见的真实 mock 数据或表单字段`)

  if ([id, name, goal, size, structure, primaryAction, secondaryActions, states, navigation, annotations, acceptanceCriteria].some((item) => item === null)) return null
  return {
    id: id!,
    name: name!,
    goal: goal!,
    size: size!,
    structure: structure!,
    primaryAction: primaryAction!,
    secondaryActions: secondaryActions!,
    mockDataGroups,
    states: states!,
    navigation: navigation!,
    annotations: annotations!,
    acceptanceCriteria: acceptanceCriteria!,
  }
}

function parseRelation(value: unknown, index: number, issues: string[]): PrototypePageRelation | null {
  const object = objectValue(value)
  if (object === null) {
    issues.push(`pageRelations[${index}] 必须是对象`)
    return null
  }
  const fromPageId = textValue(object.fromPageId)
  const toPageId = textValue(object.toPageId)
  const trigger = textValue(object.trigger)
  const result = textValue(object.result)
  const label = textValue(object.label)
  const arrowStyle = object.arrowStyle === 'solid' || object.arrowStyle === 'dashed' ? object.arrowStyle : null
  if (fromPageId === null || toPageId === null || trigger === null || result === null || label === null || arrowStyle === null) {
    issues.push(`pageRelations[${index}] 必须完整说明来源、目标、触发动作、结果、箭头样式和标签`)
    return null
  }
  return { fromPageId, toPageId, trigger, result, label, arrowStyle }
}

function semanticComponents(page: PrototypePageBrief): ExecutablePrototypeBrief['pageBlueprints'][number]['semanticComponents'] {
  const components: ExecutablePrototypeBrief['pageBlueprints'][number]['semanticComponents'] = [
    { kind: 'page-header', role: 'page-heading', purpose: '说明页面身份与当前上下文', requiredParts: ['可读页面标题', '必要的日期或状态上下文'] },
    { kind: 'primary-action', role: 'primary-action', purpose: '突出页面唯一主要操作', requiredParts: [page.primaryAction, '居中的可读按钮文字'] },
  ]
  if (page.mockDataGroups.length > 0) components.push({ kind: 'content-card', role: 'content-card', purpose: '承载真实业务内容', requiredParts: ['对象标题', '状态、时间或关键上下文', '首次渲染可见的 mock 数据'] })
  if (page.navigation.length > 0) components.push({ kind: 'bottom-navigation', role: 'bottom-navigation', purpose: '表达全局页面切换', requiredParts: ['完整栏目文字', '清楚的当前选中项', '底部安全区内对齐'] })
  return components
}

function chineseNumber(index: number): string {
  return ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][index] ?? String(index + 1)
}

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n')
}

export function renderPrototypeBriefMarkdown(brief: PrototypeBrief): string {
  const layout = brief.prototypeLayout
  const pages = brief.pages.map((page, index) => {
    const mock = page.mockDataGroups.map((group) => `- ${group.name}\n${group.items.map((item) => `  - \`${item}\``).join('\n')}`).join('\n')
    const interactions = [
      `主操作：${page.primaryAction}`,
      ...page.secondaryActions.map((item) => `次要操作：${item}`),
      ...page.states,
      ...page.navigation.map((item) => `导航：${item}`),
      ...page.annotations.map((item) => `交互标注：${item}`),
    ]
    return [
      `### 页面${chineseNumber(index)}：${page.name}`,
      '',
      `页面目标：${page.goal}`,
      '',
      '页面结构：',
      '',
      bullets(page.structure),
      '',
      '真实 mock 数据：',
      '',
      mock,
      '',
      '关键状态与交互：',
      '',
      bullets(interactions),
      '',
      '页面专项验收：',
      '',
      bullets(page.acceptanceCriteria),
    ].join('\n')
  }).join('\n\n')

  const relations = brief.pageRelations.map((relation) => {
    const from = brief.pages.find((page) => page.id === relation.fromPageId)?.name ?? relation.fromPageId
    const to = brief.pages.find((page) => page.id === relation.toPageId)?.name ?? relation.toPageId
    const style = relation.arrowStyle === 'dashed' ? '虚线箭头' : '实线箭头'
    return `${from} → ${to}：${relation.trigger}；${relation.result}（${style}：${relation.label}）`
  })

  return [
    `# ${brief.title.replace(/原型$/u, '')}原型`,
    '',
    '## 产品定义',
    '',
    brief.productDefinition,
    '',
    `核心用户：${brief.target}`,
    '',
    `核心使用场景：${brief.coreScenario}`,
    '',
    `核心结果：${brief.coreOutcome}`,
    '',
    '核心亮点与独特机制：',
    '',
    bullets(brief.uniqueMechanism),
    '',
    '首版核心流程：',
    '',
    bullets(brief.firstVersionFlow),
    '',
    '首版包含：',
    '',
    bullets(brief.includedScope),
    '',
    '首版明确不包含：',
    '',
    bullets(brief.excludedScope),
    '',
    '## 原型结构',
    '',
    `在当前画板中按照${layout.arrangement}绘制 ${brief.pages.length} 个 \`${layout.viewport.width} × ${layout.viewport.height}\` 的${layout.platform}页面。${layout.connectionStyle}${layout.comprehensionGoal}`,
    '',
    pages,
    '',
    '## 页面关系与交互表达',
    '',
    bullets(relations),
    '',
    '## 原型表达原则',
    '',
    bullets(brief.prototypePrinciples),
    '',
    '## 验收方式',
    '',
    bullets(brief.acceptanceCriteria),
    '',
    '## 默认假设',
    '',
    bullets(brief.assumptions),
    ...(brief.pendingDecisions.length === 0 ? [] : ['', '尚待决定：', '', bullets(brief.pendingDecisions)]),
  ].join('\n')
}

export function validatePrototypeBrief(value: unknown, deferredStyleNote: string | null): PrototypeBriefResult {
  const issues: string[] = []
  const object = objectValue(value)
  if (object === null) return { ok: false, code: 'brief_quality_invalid', message: 'PrototypeBrief 必须是结构化对象', issues: ['brief 不是对象'] }
  const title = textValue(object.title)
  const productDefinition = textValue(object.productDefinition)
  const target = textValue(object.target)
  const coreScenario = textValue(object.coreScenario)
  const coreOutcome = textValue(object.coreOutcome)
  const uniqueMechanism = stringList(object.uniqueMechanism)
  const firstVersionFlow = stringList(object.firstVersionFlow)
  const includedScope = stringList(object.includedScope)
  const excludedScope = stringList(object.excludedScope)
  const prototypePrinciples = stringList(object.prototypePrinciples)
  const acceptanceCriteria = stringList(object.acceptanceCriteria)
  const assumptions = stringList(object.assumptions)
  const pendingDecisions = stringList(object.pendingDecisions)
  if (title === null) issues.push('title 不能为空')
  if (productDefinition === null || productDefinition.length < 30) issues.push('productDefinition 必须用完整自然语言定义产品、核心流程和首版取舍')
  if (target === null) issues.push('target 不能为空')
  if (coreScenario === null) issues.push('coreScenario 不能为空')
  if (coreOutcome === null) issues.push('coreOutcome 不能为空')
  if (uniqueMechanism === null || uniqueMechanism.length === 0) issues.push('uniqueMechanism 至少包含一个产品亮点，或明确说明首版尚未形成差异化')
  if (firstVersionFlow === null || firstVersionFlow.length < 2) issues.push('firstVersionFlow 至少包含两个连续步骤')
  if (includedScope === null || includedScope.length === 0) issues.push('includedScope 不能为空')
  if (excludedScope === null || excludedScope.length === 0) issues.push('excludedScope 不能为空')
  if (prototypePrinciples === null || prototypePrinciples.length < 3) issues.push('prototypePrinciples 至少包含 3 条原型表达原则')
  if (acceptanceCriteria === null || acceptanceCriteria.length < 5) issues.push('acceptanceCriteria 至少包含 5 条可验证标准')
  if (assumptions === null || assumptions.length === 0) issues.push('assumptions 不能为空')
  if (pendingDecisions === null) issues.push('pendingDecisions 必须是字符串数组')

  const layoutObject = objectValue(object.prototypeLayout)
  const viewport = viewportValue(layoutObject?.viewport)
  const platform = textValue(layoutObject?.platform)
  const arrangement = textValue(layoutObject?.arrangement)
  const connectionStyle = textValue(layoutObject?.connectionStyle)
  const representativePageId = textValue(layoutObject?.representativePageId)
  const comprehensionGoal = textValue(layoutObject?.comprehensionGoal)
  if (layoutObject === null || viewport === null || platform === null || arrangement === null || connectionStyle === null || representativePageId === null || comprehensionGoal === null) {
    issues.push('prototypeLayout 必须完整说明平台、尺寸、排列、连线、代表页和 5 秒理解目标')
  }

  const rawPages = Array.isArray(object.pages) ? object.pages : []
  if (rawPages.length === 0) issues.push('pages 至少包含一个页面')
  const pages = rawPages.map((page, index) => parsePage(page, index, issues)).filter((page): page is PrototypePageBrief => page !== null)
  const pageIds = new Set<string>()
  const pageNames = new Set<string>()
  for (const page of pages) {
    if (pageIds.has(page.id)) issues.push(`页面 id ${page.id} 重复`)
    pageIds.add(page.id)
    if (pageNames.has(page.name)) issues.push(`页面名称 ${page.name} 重复`)
    pageNames.add(page.name)
  }
  if (representativePageId !== null && !pageIds.has(representativePageId)) issues.push('prototypeLayout.representativePageId 必须引用真实页面')

  const rawRelations = Array.isArray(object.pageRelations) ? object.pageRelations : []
  const pageRelations = rawRelations.map((relation, index) => parseRelation(relation, index, issues)).filter((relation): relation is PrototypePageRelation => relation !== null)
  if (pages.length > 1 && pageRelations.length === 0) issues.push('多页面原型必须至少提供一条明确的页面关系')
  for (const relation of pageRelations) {
    if (!pageIds.has(relation.fromPageId) || !pageIds.has(relation.toPageId)) issues.push(`页面关系 ${relation.label} 引用了不存在的页面`)
  }

  if (acceptanceCriteria !== null) {
    const corpus = acceptanceCriteria.join('；')
    const required = [
      [/可见|文字/u, '文字首次渲染可见'],
      [/裁切|越界/u, '页面和组件无裁切或越界'],
      [/按钮.*居中|居中.*按钮/u, '按钮文案居中'],
      [/导航/u, '底部导航完整对齐'],
      [/流程|交互|箭头/u, '核心流程或交互关系'],
    ] as const
    for (const [pattern, label] of required) if (!pattern.test(corpus)) issues.push(`acceptanceCriteria 缺少“${label}”验收`)
  }

  const implementationCorpus = [
    productDefinition ?? '',
    ...(uniqueMechanism ?? []),
    ...(firstVersionFlow ?? []),
    ...(includedScope ?? []),
    ...(prototypePrinciples ?? []),
    ...pages.flatMap((page) => [...page.structure, ...page.states, ...page.navigation, ...page.annotations]),
  ].join('；')
  if (VISUAL_OR_TECH_IMPLEMENTATION_RE.test(implementationCorpus)) {
    issues.push('原型简报不能规定品牌视觉或前端技术实现；请把颜色体系、字体、圆角和技术栈推迟到 Generate')
  }
  if (excludedScope !== null && assumptions !== null) {
    const contradiction = assumptions.find((assumption) => {
      if (!POSITIVE_SCOPE_RE.test(assumption)) return false
      const normalizedAssumption = normalizedScopeConcept(assumption)
      return excludedScope.some((excluded) => {
        const concept = normalizedScopeConcept(excluded)
        return concept.length >= 2 && normalizedAssumption.includes(concept)
      })
    })
    if (contradiction !== undefined) issues.push(`默认假设“${contradiction}”与首版明确排除范围矛盾`)
  }

  if (issues.length > 0 || title === null || productDefinition === null || target === null || coreScenario === null || coreOutcome === null || uniqueMechanism === null || firstVersionFlow === null || includedScope === null || excludedScope === null || viewport === null || platform === null || arrangement === null || connectionStyle === null || representativePageId === null || comprehensionGoal === null || prototypePrinciples === null || acceptanceCriteria === null || assumptions === null || pendingDecisions === null) {
    return { ok: false, code: 'brief_quality_invalid', message: `项目简报未通过质量门禁：${issues.join('；')}`, issues }
  }

  const canonical: PrototypeBrief = {
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
    pendingDecisions,
  }
  const brief: ExecutablePrototypeBrief = {
    ...canonical,
    briefSchemaVersion: 2,
    pageBlueprints: pages.map((page) => ({
      pageId: page.id,
      page: page.name,
      coreTask: page.goal,
      primaryAction: page.primaryAction,
      aboveFold: [...page.structure.slice(0, 3), `唯一主要操作：${page.primaryAction}`],
      semanticComponents: semanticComponents(page),
    })),
    pageMockData: pages.map((page) => ({
      pageId: page.id,
      page: page.name,
      minimumRecords: 3,
      requiredContent: page.structure,
      examples: page.mockDataGroups.flatMap((group) => group.items),
    })),
    mockDataPolicy: {
      rule: '列表、聊天、图表、详情和状态组件必须展示真实示例内容，不能使用空白方框、Lorem ipsum、用户A或无含义占位符代替',
      minimumRecordsPerRepeatedComponent: 3,
      visibility: 'mock 数据必须使用首次渲染即可见的独立 text 元素',
    },
    prototypeQualityPolicy: {
      firstScreen: canonical.prototypeLayout.comprehensionGoal,
      hierarchy: '每页只有一个 primary-action；标题、正文和辅助信息形成清楚层级',
      completionRule: 'writeVerified=true 只代表写入一致；逐条通过本简报 acceptanceCriteria 后才能宣布完成',
    },
    interactions: pageRelations.map((relation) => `${relation.fromPageId} → ${relation.toPageId}：${relation.trigger}；${relation.result}`),
    deferredStyleNote,
  }
  return { ok: true, brief, markdown: renderPrototypeBriefMarkdown(canonical) }
}
