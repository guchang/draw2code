import type { CreateAnswer, CreateQuestion } from './create-flow.ts'

export const CREATE_FLOW_VERSION = 2
export const MAX_DISCOVERY_QUESTIONS = 10

export const DISCOVERY_DIMENSION_IDS = [
  'trigger-context',
  'existing-alternative',
  'core-outcome',
  'unique-mechanism',
  'core-loop',
  'critical-risk',
  'scope-proof',
  'target-user',
  'target-platform',
  'product-architecture',
] as const

export type DiscoveryDimension = typeof DISCOVERY_DIMENSION_IDS[number]

const DISCOVERY_DIMENSIONS = new Set<DiscoveryDimension>(DISCOVERY_DIMENSION_IDS)

export interface AdaptiveCreateQuestion extends CreateQuestion {
  dimension: DiscoveryDimension
  insight: string
  decisionImpact: string
  recommendedOptionId: string
  dependsOn: string[]
}

const GENERIC_QUESTION_RE = /^(?:这个工具主要服务谁|你的核心目标是什么|首版最重要的是帮助用户完成什么|用户最重要的一条使用流程是什么|第一版需要包含哪些核心模块|首轮原型要画哪些核心页面)[？?]?$/u
const ARCHITECTURE_LIST_RE = /(?:需要哪些|选择哪些|包含哪些).*(?:模块|页面)|(?:核心模块|核心页面).*请选择/iu

export interface DiscoveryState {
  explicitFacts: string[]
  assumptions: string[]
  resolvedDecisions: string[]
  openDimensions: DiscoveryDimension[]
  recommendedDimensions: DiscoveryDimension[]
  questions: AdaptiveCreateQuestion[]
  invalidatedQuestionIds: string[]
  adjustmentQuestionIds: string[]
  questionCount: number
  maxQuestions: number
  remainingQuestions: number
  nextAction: 'propose_question' | 'synthesize'
  stopReason: string | null
}

function platformFact(answers: Record<string, CreateAnswer>): string | null {
  const platform = answers['target-platform']?.values[0]
  if (platform === 'app') return '产品端：App'
  if (platform === 'web') return '产品端：Web'
  if (platform === 'mini-program') return '产品端：小程序'
  return null
}

function domainFacts(idea: string): string[] {
  const facts: string[] = []
  if (/陌生人|社交|交友|附近的人|雷达|碰一碰|好友|聊天/iu.test(idea)) facts.push('产品方向：附近发现与陌生人社交')
  if (/万年历|穿搭|天气|衣橱|服饰/iu.test(idea)) facts.push('产品方向：日期、天气与穿搭建议')
  if (/待办|任务|清单|todo/iu.test(idea)) facts.push('产品方向：任务与待办管理')
  return facts
}

function recommendedDimensions(idea: string): DiscoveryDimension[] {
  if (/陌生人|社交|交友|附近的人|雷达|碰一碰|好友|聊天/iu.test(idea)) return ['unique-mechanism', 'critical-risk', 'core-loop']
  if (/万年历|穿搭|天气|衣橱|服饰/iu.test(idea)) return ['unique-mechanism', 'trigger-context', 'critical-risk']
  if (/待办|任务|清单|todo/iu.test(idea)) return ['trigger-context', 'existing-alternative', 'core-outcome']
  return ['trigger-context', 'core-outcome', 'existing-alternative']
}

export function initialDiscovery(idea: string, answers: Record<string, CreateAnswer>): DiscoveryState {
  const fact = platformFact(answers)
  const explicitFacts = [`用户原话：${idea.trim()}`, ...(fact === null ? [] : [fact]), ...domainFacts(idea)]
  const openDimensions = DISCOVERY_DIMENSION_IDS.filter((dimension) => dimension !== 'target-platform' || fact === null)
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
    nextAction: 'propose_question',
    stopReason: null,
  }
}

export function refreshDiscovery(state: DiscoveryState): DiscoveryState {
  const adjustmentQuestionIds = new Set(state.adjustmentQuestionIds ?? [])
  const questionCount = state.questions.filter((question) => !adjustmentQuestionIds.has(question.id)).length
  const remainingQuestions = Math.max(0, state.maxQuestions - questionCount)
  return {
    ...state,
    questionCount,
    remainingQuestions,
    nextAction: remainingQuestions === 0 ? 'synthesize' : 'propose_question',
  }
}

export function removeDependentQuestions(
  state: DiscoveryState,
  questionId: string,
): { discovery: DiscoveryState; removedIds: string[] } {
  const removed = new Set<string>()
  const alreadyInvalidated = new Set(state.invalidatedQuestionIds ?? [])
  let changed = true
  while (changed) {
    changed = false
    for (const question of state.questions) {
      if (question.id === questionId || removed.has(question.id) || alreadyInvalidated.has(question.id)) continue
      if ((question.dependsOn ?? []).some((dependency) => dependency === questionId || removed.has(dependency))) {
        removed.add(question.id)
        changed = true
      }
    }
  }
  const prefixes = [...removed].map((id) => `${id}：`)
  const removedDimensions = state.questions
    .filter((question) => removed.has(question.id))
    .map((question) => question.dimension)
  return {
    discovery: refreshDiscovery({
      ...state,
      invalidatedQuestionIds: [...new Set([...alreadyInvalidated, ...removed])],
      openDimensions: [...new Set([...state.openDimensions, ...removedDimensions])],
      resolvedDecisions: state.resolvedDecisions.filter((item) => !prefixes.some((prefix) => item.startsWith(prefix))),
      assumptions: state.assumptions.filter((item) => !prefixes.some((prefix) => item.startsWith(prefix))),
    }),
    removedIds: [...removed],
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function normalizedQuestionText(value: string): string {
  return value.toLowerCase().replace(/[\s，。！？、,.!?：:；;（）()]/gu, '')
}

const GROUNDING_STOP_WORDS = new Set([
  '一个', '一款', '这个', '用户', '产品', '工具', '应用', '首版', '核心', '页面', '功能', '方向', '问题', '需要', '应该', '什么', 'app', 'web',
])

function groundingTokens(values: string[]): Set<string> {
  const tokens = new Set<string>()
  for (const value of values) {
    const segments = value
      .toLowerCase()
      .replace(/(?:用户原话|产品方向|产品端)：/gu, ' ')
      .split(/[^\p{Script=Han}a-z0-9]+|(?:我想|我要|希望|做|一个|一款|类似|用于|帮助|里面|里的|这个|那个)/giu)
      .filter((segment) => segment.length >= 2)
    for (const segment of segments) {
      if (/^[a-z0-9-]+$/u.test(segment)) {
        if (!GROUNDING_STOP_WORDS.has(segment)) tokens.add(segment)
        continue
      }
      const maxSize = Math.min(6, segment.length)
      for (let size = 2; size <= maxSize; size += 1) {
        for (let index = 0; index <= segment.length - size; index += 1) {
          const token = segment.slice(index, index + size)
          if (!GROUNDING_STOP_WORDS.has(token)) tokens.add(token)
        }
      }
    }
  }
  return tokens
}

export type AdaptiveQuestionResult =
  | { ok: true; question: AdaptiveCreateQuestion }
  | { ok: false; code: string; message: string }

export function validateAdaptiveQuestion(
  value: unknown,
  discovery: DiscoveryState,
  validationOptions: { allowAdjustment?: boolean } = {},
): AdaptiveQuestionResult {
  if (discovery.questionCount >= discovery.maxQuestions && validationOptions.allowAdjustment !== true) {
    return { ok: false, code: 'question_limit_reached', message: `已经达到 ${discovery.maxQuestions} 个问题，必须调用 action=synthesize 整理项目简报` }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, code: 'question_quality_invalid', message: 'question 必须是结构化对象' }
  }
  const input = value as Record<string, unknown>
  if (!nonEmptyString(input.id) || !/^q[0-9a-z_-]+$/iu.test(input.id)) {
    return { ok: false, code: 'question_quality_invalid', message: 'question.id 必须是以 q 开头的稳定标识符' }
  }
  if (!nonEmptyString(input.dimension) || !DISCOVERY_DIMENSIONS.has(input.dimension as DiscoveryDimension)) {
    return { ok: false, code: 'question_quality_invalid', message: `question.dimension 不是允许的产品决策维度；必须使用以下稳定 ID 之一：${DISCOVERY_DIMENSION_IDS.join(', ')}` }
  }
  if (!nonEmptyString(input.insight) || input.insight.trim().length < 18) {
    return { ok: false, code: 'question_quality_invalid', message: '每道题必须先提供基于当前产品的具体判断，不能只补齐字段' }
  }
  if (!nonEmptyString(input.text)) {
    return { ok: false, code: 'question_quality_invalid', message: 'question.text 必须包含“判断：...\n\n问题：...”并可直接用于原生问题卡片' }
  }
  const presentationText = input.text.trim().replace(/\\n/gu, '\n')
  const presentationMatch = /^判断：([\s\S]+?)\s*问题：([\s\S]+)$/u.exec(presentationText)
  if (presentationMatch === null || !normalizedQuestionText(presentationMatch[1]).includes(normalizedQuestionText(input.insight.trim()))) {
    return { ok: false, code: 'question_presentation_invalid', message: 'question.text 必须完整包含当前 insight，格式为“判断：{insight}\n\n问题：{decision question}”，禁止在展示卡片时丢掉产品判断' }
  }
  const questionText = presentationMatch[2].trim()
  if (questionText.length < 6) {
    return { ok: false, code: 'question_quality_invalid', message: 'question.text 中的决策问题必须明确且可回答' }
  }
  const insightTokens = groundingTokens([input.insight.trim()])
  const selfContainedQuestionTokens = groundingTokens([questionText])
  if (![...insightTokens].some((token) => token.length >= 4 && selfContainedQuestionTokens.has(token))) {
    return { ok: false, code: 'question_presentation_invalid', message: '“问题：”后的文字也必须自包含地重述当前产品判断再提出决策（允许同义改写），避免 Agent 只截取问题部分时丢掉 insight' }
  }
  if (GENERIC_QUESTION_RE.test(questionText) || ARCHITECTURE_LIST_RE.test(questionText)) {
    return { ok: false, code: 'question_quality_invalid', message: '不能使用固定的用户、目标、模块或页面问卷；请结合当前产品场景提出有取舍的问题' }
  }
  if (!nonEmptyString(input.decisionImpact) || input.decisionImpact.trim().length < 10) {
    return { ok: false, code: 'question_quality_invalid', message: 'question.decisionImpact 必须说明答案会改变哪项产品决策' }
  }
  const questionId = input.id.trim()
  const dimension = input.dimension.trim() as DiscoveryDimension
  const insight = input.insight.trim()
  const decisionImpact = input.decisionImpact.trim()
  const dependsOn = Array.isArray(input.dependsOn) && input.dependsOn.every(nonEmptyString)
    ? [...new Set(input.dependsOn.map((item) => item.trim()))]
    : []
  const invalidatedQuestionIds = new Set(discovery.invalidatedQuestionIds ?? [])
  const knownQuestionIds = new Set(discovery.questions.filter((question) => !invalidatedQuestionIds.has(question.id)).map((question) => question.id))
  const unknownDependency = dependsOn.find((id) => !knownQuestionIds.has(id))
  if (unknownDependency !== undefined) {
    return { ok: false, code: 'question_quality_invalid', message: `dependsOn 引用了不存在的问题 ${unknownDependency}` }
  }
  if (discovery.questions.some((question) => question.id === questionId)) {
    return { ok: false, code: 'question_duplicate', message: `问题 ${questionId} 已经问过` }
  }
  const fingerprint = normalizedQuestionText(questionText)
  if (discovery.questions.some((question) => normalizedQuestionText(question.text) === fingerprint)) {
    return { ok: false, code: 'question_duplicate', message: '这个问题与历史问题重复，请寻找尚未解决的产品决策' }
  }
  const sameDimension = discovery.questions.find((question) => question.dimension === dimension && !invalidatedQuestionIds.has(question.id))
  if (sameDimension !== undefined && !dependsOn.includes(sameDimension.id)) {
    return { ok: false, code: 'question_duplicate', message: `维度 ${input.dimension} 已经询问过；如需深挖，必须通过 dependsOn 说明依赖` }
  }
  if (!Array.isArray(input.options)) {
    return { ok: false, code: 'question_quality_invalid', message: 'question.options 必须提供 2–4 个具有真实取舍的方向和三个固定控制选项' }
  }
  const requiredControls = [
    ['synthesize-now', '直接整理项目简报'],
    ['unknown', '还没想好'],
    ['other', '其他'],
  ] as const
  for (const [id, label] of requiredControls) {
    const option = input.options.find((item) => objectValue(item)?.id === id)
    const object = objectValue(option)
    if (object?.label !== label || !nonEmptyString(object.description)) {
      return { ok: false, code: 'question_presentation_invalid', message: `question.options 必须显式包含 ${id} / ${label} 及说明，保证原生问题卡片不会删掉用户控制项` }
    }
  }
  const meaningful = input.options.filter((option) => {
    if (typeof option !== 'object' || option === null || Array.isArray(option)) return false
    const candidate = option as Record<string, unknown>
    return candidate.id !== 'unknown' && candidate.id !== 'other' && candidate.id !== 'synthesize-now'
  })
  if (meaningful.length < 2 || meaningful.length > 4) {
    return { ok: false, code: 'question_quality_invalid', message: '每道题必须提供 2–4 个产品专属方向，再由工具补充“还没想好”和“其他”' }
  }
  const options: Array<{ id: string; label: string; description?: string }> = []
  const optionIds = new Set<string>()
  for (const item of meaningful) {
    const option = item as Record<string, unknown>
    if (!nonEmptyString(option.id) || !nonEmptyString(option.label) || !nonEmptyString(option.description) || option.description.trim().length < 8) {
      return { ok: false, code: 'question_quality_invalid', message: '每个选项都必须包含 id、label，以及说明价值、成本或适用条件的 description' }
    }
    if (optionIds.has(option.id.trim())) return { ok: false, code: 'question_quality_invalid', message: `选项 ${option.id.trim()} 重复` }
    optionIds.add(option.id.trim())
    options.push({ id: option.id.trim(), label: option.label.trim(), description: option.description.trim() })
  }
  if (!nonEmptyString(input.recommendedOptionId) || !optionIds.has(input.recommendedOptionId.trim())) {
    return { ok: false, code: 'question_quality_invalid', message: 'recommendedOptionId 必须指向一个真实候选方向' }
  }
  const factTokens = groundingTokens([
    ...discovery.explicitFacts,
    ...discovery.resolvedDecisions,
    ...discovery.assumptions,
  ])
  const questionTokens = groundingTokens([
    insight,
    questionText,
    decisionImpact,
    ...options.flatMap((option) => [option.label, option.description ?? '']),
  ])
  if (![...factTokens].some((token) => questionTokens.has(token))) {
    return {
      ok: false,
      code: 'question_not_grounded',
      message: '问题没有引用当前产品事实、已有答案或明确风险；请先基于 discovery 中的事实重新提出产品专属问题',
    }
  }
  if (discovery.questionCount === 0 && validationOptions.allowAdjustment !== true) {
    const highestValue = discovery.recommendedDimensions.slice(0, 2)
    if (highestValue.length > 0 && !highestValue.includes(dimension)) {
      return {
        ok: false,
        code: 'question_priority_invalid',
        message: `第一题应先深挖当前产品最关键的 ${highestValue.join(' 或 ')}，不要先让用户选择模块、页面或通用信息架构`,
      }
    }
  }
  options.push(
    { id: 'synthesize-now', label: '直接整理项目简报', description: '停止继续提问，基于当前事实与待验证假设生成完整简报。' },
    { id: 'unknown', label: '还没想好', description: '先记录为待验证假设，不把沉默理解为暂停或取消。' },
    { id: 'other', label: '其他', description: '保留用户自己的产品方向和补充说明。' },
  )
  return {
    ok: true,
    question: {
      id: questionId,
      kind: 'choice',
      dimension,
      insight,
      text: questionText,
      decisionImpact,
      recommendedOptionId: input.recommendedOptionId.trim(),
      dependsOn,
      selectionMode: 'single',
      options,
      allowOther: true,
    },
  }
}
