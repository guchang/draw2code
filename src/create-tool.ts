import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { type SceneStore } from './scene-store.ts'
import { type ProjectDraft, ProjectStore, newProjectId } from './project-store.ts'
import {
  buildBrief,
  explicitAnswersFromIdea,
  interpretOther,
  questionById,
  questionFor,
  type CreateAnswer,
  type CreateQuestion,
} from './create-flow.ts'
import {
  CREATE_FLOW_VERSION,
  DISCOVERY_DIMENSION_IDS,
  initialDiscovery,
  removeDependentQuestions,
  refreshDiscovery,
  validateAdaptiveQuestion,
  type DiscoveryDimension,
  type DiscoveryState,
} from './create-discovery.ts'
import { validatePrototypeBrief } from './prototype-brief.ts'
import { CREATE_ACTIONS, type CreateAction } from './create-contract.ts'

function text(value: string): ContentBlock[] {
  return [{ type: 'text', text: value }]
}

function continuation(value: CreateResponse): string {
  return [
    '[draw2code_create continuation]',
    `sessionId=${value.sessionId ?? ''}`,
    `revision=${value.revision ?? ''}`,
  ].join(' ')
}

interface CreateArgs {
  root: string
  action: CreateAction
  idea?: string
  projectName?: string
  styleNote?: string
  sessionId?: string
  revision?: number
  questionId?: string
  values?: string[]
  otherText?: string
  question?: unknown
  brief?: unknown
  stopReason?: string
}

interface CreateResponse {
  status: string
  flowVersion?: number
  sessionId?: string
  projectId?: string
  projectName?: string
  projectFile?: string
  revision?: number
  question?: JsonValue
  discovery?: JsonValue
  brief?: JsonValue
  briefMarkdown?: string
  briefContract?: JsonValue
  confirmation?: JsonValue
  assumptions?: JsonValue
  nameProposal?: JsonValue
  boardName?: string
  activeBoard?: string
  nextAction?: string
  error?: JsonValue
  current?: JsonValue
  drafts?: JsonValue
  idempotent?: boolean
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeStructuredArg(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalValue(entry)]))
}

const PROJECT_NAME_MAX_LENGTH = 16
const PROJECT_NAME_RE = /^[\w\u4e00-\u9fa5][\w\u4e00-\u9fa5 -]*$/u

function normalizeProjectName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}

function projectNameValidationError(value: string, rawIdea?: string): string | null {
  if (value === '') return 'projectName 不能为空'
  if (rawIdea !== undefined && value === normalizeProjectName(rawIdea)) {
    return 'projectName 不能直接复制完整 idea；请理解完整需求后重新概括产品名称'
  }
  if (value.length > PROJECT_NAME_MAX_LENGTH) {
    return `projectName 最多 ${PROJECT_NAME_MAX_LENGTH} 个字符；请基于完整需求重新概括，不要截取原话前 ${PROJECT_NAME_MAX_LENGTH} 个字符`
  }
  if (/(?:\s*-\s*)?原型$/u.test(value)) return 'projectName 只写产品名称，不要添加“原型”后缀'
  if (!PROJECT_NAME_RE.test(value)) return 'projectName 只能包含中英文、数字、空格、连字符和下划线'
  return null
}

function boardNameFromProject(projectName: string, existing: Set<string>): string {
  const base = projectName
  if (!existing.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} ${index}`
    if (!existing.has(candidate)) return candidate
  }
  return `${base} ${Date.now()}`
}

function requestKey(args: CreateArgs): string {
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
    stopReason: args.stopReason ?? null,
  }))
}

function draftStatus(draft: ProjectDraft): string {
  if (draft.status === 'draft') {
    if (draft.currentQuestion !== null) return 'question'
    if (draft.brief !== null) return 'ready'
    if (draft.flowVersion === CREATE_FLOW_VERSION) return 'discovery'
    return 'ready'
  }
  return draft.status
}

const CREATE_DIMENSION_HEADERS: Record<string, string> = {
  'trigger-context': '核心场景',
  'existing-alternative': '现有替代',
  'core-outcome': '核心结果',
  'unique-mechanism': '独特机制',
  'core-loop': '使用闭环',
  'critical-risk': '关键风险',
  'scope-proof': '首版验证',
  'target-user': '核心用户',
  'target-platform': '产品端',
  'product-architecture': '产品结构',
}

function hostQuestionFor(question: CreateQuestion): Record<string, unknown> {
  const prompt = question.insight === undefined
    ? question.text
    : `判断：${question.insight}\n\n问题：${question.text}`
  return {
    questions: [{
      id: question.id,
      question: prompt,
      header: CREATE_DIMENSION_HEADERS[question.dimension ?? ''] ?? '产品决策',
      options: question.options.map((option) => ({ label: option.label, description: option.description ?? '' })),
      multi_select: question.selectionMode === 'multiple',
    }],
  }
}

function displayedQuestionText(question: CreateQuestion): string {
  return question.insight === undefined ? question.text : `判断：${question.insight}\n\n问题：${question.text}`
}

function readyPageNames(brief: unknown): string[] {
  if (typeof brief !== 'object' || brief === null || Array.isArray(brief)) return []
  const pages = (brief as { pages?: unknown }).pages
  if (!Array.isArray(pages)) return []
  return pages.flatMap((page) => {
    if (typeof page !== 'object' || page === null || Array.isArray(page)) return []
    const name = (page as { name?: unknown }).name
    return typeof name === 'string' && name.trim() !== '' ? [name.trim()] : []
  })
}

function createConfirmation(brief: unknown): Record<string, unknown> {
  const pageNames = readyPageNames(brief)
  const pageSummary = pageNames.length === 0
    ? '项目简报中的页面范围'
    : `${pageNames.length} 个页面：${pageNames.join('、')}`
  const question = `计划绘制${pageSummary}。这些就是首版原型需要生成的页面吗？`
  return {
    id: 'create-brief-confirm',
    pageNames,
    question,
    options: [
      { id: 'confirm', label: '确认这些页面并绘制', description: '使用刚刚展示的同一份项目简报和页面范围创建独立画板。' },
      { id: 'adjust-pages', label: '调整页面范围', description: '增删、合并或拆分页面，再重新生成完整项目简报。' },
      { id: 'adjust-direction', label: '调整产品方向', description: '只追问受影响的产品决策，再重新生成完整简报。' },
    ],
    askUserQuestionArgs: {
      questions: [{
        id: 'create-brief-confirm',
        question,
        header: '页面确认',
        options: [
          { label: '确认这些页面并绘制', description: '使用刚刚展示的同一份项目简报和页面范围创建独立画板。' },
          { label: '调整页面范围', description: '增删、合并或拆分页面，再重新生成完整项目简报。' },
          { label: '调整产品方向', description: '只追问受影响的产品决策，再重新生成完整简报。' },
        ],
        multi_select: false,
      }],
    },
  }
}

function prototypeBriefContract(): Record<string, unknown> {
  return {
    requiredTopLevel: [
      'title', 'productDefinition', 'target', 'coreScenario', 'coreOutcome', 'uniqueMechanism',
      'firstVersionFlow', 'includedScope', 'excludedScope', 'prototypeLayout', 'pages',
      'pageRelations', 'prototypePrinciples', 'acceptanceCriteria', 'assumptions', 'pendingDecisions',
    ],
    prototypeLayout: ['platform', 'viewport: { width, height }', 'arrangement', 'connectionStyle', 'representativePageId', 'comprehensionGoal'],
    page: [
      'id', 'name', 'goal', 'size: { width, height }', 'structure: string[]', 'primaryAction',
      'secondaryActions: string[]', 'mockDataGroups: Array<{ name: string, items: string[] }>',
      'states: string[]', 'navigation: string[]', 'annotations: string[]', 'acceptanceCriteria: string[]',
    ],
    pageRelation: ['fromPageId', 'toPageId', 'trigger', 'result', 'arrowStyle: solid|dashed', 'label'],
    rules: [
      'structure 只能放可直接绘制的具体字符串，不放组件对象',
      '每页通过 mockDataGroups 提供至少 3 条真实可见数据或完整表单字段',
      '多页面至少一条 pageRelations，且页面 ID 必须存在',
      '原型阶段不写品牌色、字体、圆角、3D 或前端技术栈',
    ],
  }
}

function responseFor(projects: ProjectStore, draft: ProjectDraft, extras: Partial<CreateResponse> = {}): CreateResponse {
  const status = draftStatus(draft)
  const response: CreateResponse = {
    status,
    ...(draft.flowVersion === undefined ? {} : { flowVersion: draft.flowVersion }),
    sessionId: draft.projectId,
    projectId: draft.projectId,
    projectName: draft.projectName,
    projectFile: projects.fileName(draft.projectId),
    revision: draft.revision,
    ...(draft.currentQuestion === null ? {} : {
      question: {
        ...(draft.currentQuestion as CreateQuestion),
        text: displayedQuestionText(draft.currentQuestion as CreateQuestion),
        askUserQuestionArgs: hostQuestionFor(draft.currentQuestion as CreateQuestion),
      } as unknown as JsonValue,
    }),
    ...(draft.discovery === undefined ? {} : { discovery: draft.discovery as JsonValue }),
    ...(draft.brief === null ? {} : { brief: draft.brief as JsonValue, assumptions: ((draft.brief as { assumptions?: JsonValue }).assumptions ?? []) }),
    ...(draft.briefMarkdown === undefined || draft.briefMarkdown === null ? {} : { briefMarkdown: draft.briefMarkdown }),
    ...(draft.flowVersion === CREATE_FLOW_VERSION && draft.status === 'draft' ? { briefContract: prototypeBriefContract() as JsonValue } : {}),
    ...(status === 'ready' ? { confirmation: createConfirmation(draft.brief) as JsonValue } : {}),
    ...(draft.boardName === null ? {} : { boardName: draft.boardName }),
    ...extras,
  }
  return response
}

function errorResponse(code: string, message: string, current?: ProjectDraft): CreateResponse {
  return {
    status: 'error',
    error: { code, message, recoverable: code !== 'invalid_action' },
    ...(current === undefined ? {} : {
      current: {
        sessionId: current.projectId,
        revision: current.revision,
        status: draftStatus(current),
        question: current.currentQuestion as JsonValue,
      },
    }),
  }
}

function questionFromDraft(draft: ProjectDraft, questionId: string): CreateQuestion | null {
  if (draft.currentQuestion !== null && (draft.currentQuestion as { id?: unknown }).id === questionId) {
    return draft.currentQuestion as CreateQuestion
  }
  if (draft.flowVersion === CREATE_FLOW_VERSION && draft.discovery !== undefined) {
    const discovery = draft.discovery as DiscoveryState
    if ((discovery.invalidatedQuestionIds ?? []).includes(questionId)) return null
    return (discovery.questions.find((question) => question.id === questionId) ?? null)
  }
  return questionById(draft.originalIdea, questionId)
}

function validateValues(question: CreateQuestion, values: string[], otherText: string | undefined): string | null {
  if (values.length === 0) return '至少选择一个答案'
  if (question.selectionMode === 'single' && values.length !== 1) return '这个问题只能选择一个答案'
  if (question.minSelections !== undefined && values.length < question.minSelections) return `至少选择 ${question.minSelections} 项`
  if (question.maxSelections !== undefined && values.length > question.maxSelections) return `最多选择 ${question.maxSelections} 项`
  const allowed = new Set(question.options.map((option) => option.id))
  const invalid = values.find((value) => !allowed.has(value))
  if (invalid !== undefined) return `选项 "${invalid}" 不在当前问题的候选答案中`
  if (values.includes('other') && (otherText === undefined || otherText.trim() === '')) return '选择“其他”时需要补充说明'
  return null
}

function nextAfterAnswer(draft: ProjectDraft): CreateQuestion | null {
  return questionFor(draft.originalIdea, draft.answers)
}

function addHistory(draft: ProjectDraft, action: string, questionId?: string, values?: string[], otherText?: string): void {
  draft.history = [
    ...draft.history,
    {
      revision: draft.revision,
      action,
      at: Date.now(),
      ...(questionId === undefined ? {} : { questionId }),
      ...(values === undefined ? {} : { values }),
      ...(otherText === undefined ? {} : { otherText }),
    },
  ].slice(-100)
}

function clearDownstreamAnswers(draft: ProjectDraft, questionId: string): void {
  const order = ['target-platform', 'core-user', 'core-goal', 'core-flow', 'core-modules', 'core-pages']
  const index = order.indexOf(questionId)
  if (index < 0) return
  for (const id of order.slice(index + 1)) delete draft.answers[id]
}

async function persistMutation(
  projects: ProjectStore,
  root: string,
  draft: ProjectDraft,
  expectedRevision: number,
  key: string,
  response: CreateResponse,
): Promise<CreateResponse> {
  draft.revision = expectedRevision + 1
  draft.lastRequestKey = key
  response.revision = draft.revision
  draft.lastResponse = response
  const saved = await projects.save(root, draft, expectedRevision)
  if (!saved.ok) return errorResponse(saved.error.code, saved.error.message, saved.error.current)
  response.revision = saved.value.revision
  response.projectName = saved.value.projectName
  response.projectFile = projects.fileName(saved.value.projectId)
  return response
}

async function loadSession(projects: ProjectStore, root: string, sessionId: string | undefined): Promise<ProjectDraft | null> {
  if (sessionId === undefined || sessionId.trim() === '') return null
  const result = await projects.read(root, sessionId)
  return result.ok ? result.value : null
}

function initialDraft(idea: string, projectName: string, styleNote: string | null, projectId: string): ProjectDraft {
  const answers = explicitAnswersFromIdea(idea)
  return {
    flowVersion: CREATE_FLOW_VERSION,
    projectId,
    projectName,
    originalIdea: idea.trim(),
    status: 'draft',
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
    history: [{ revision: 1, action: 'start', at: Date.now() }],
  }
}

function migrateLegacyDraft(draft: ProjectDraft): void {
  const discovery = initialDiscovery(draft.originalIdea, draft.answers)
  const legacyDimensionByQuestion: Record<string, typeof DISCOVERY_DIMENSION_IDS[number]> = {
    'target-platform': 'target-platform',
    'core-user': 'target-user',
    'core-goal': 'core-outcome',
    'core-flow': 'core-loop',
    'core-modules': 'product-architecture',
    'core-pages': 'product-architecture',
  }
  const legacyLabelByQuestion: Record<string, string> = {
    'target-platform': '产品端',
    'core-user': '核心用户',
    'core-goal': '核心结果',
    'core-flow': '核心流程',
    'core-modules': '产品结构',
    'core-pages': '页面结构',
  }
  discovery.resolvedDecisions = Object.entries(draft.answers).map(([questionId, answer]) => {
    const legacyQuestion = questionById(draft.originalIdea, questionId)
    const semanticValues = answer.values.map((value) => legacyQuestion?.options.find((option) => option.id === value)?.label ?? value)
    const value = answer.normalizedText ?? answer.otherText ?? semanticValues.join('、')
    return `${legacyLabelByQuestion[questionId] ?? questionId}：${value}`
  })
  const resolvedDimensions = new Set(Object.keys(draft.answers).map((questionId) => legacyDimensionByQuestion[questionId]).filter(Boolean))
  discovery.openDimensions = discovery.openDimensions.filter((dimension) => !resolvedDimensions.has(dimension))
  draft.flowVersion = CREATE_FLOW_VERSION
  draft.currentQuestion = null
  draft.pendingInterpretation = null
  draft.discovery = refreshDiscovery(discovery)
  draft.briefMarkdown = null
  addHistory(draft, 'migrate-create-v2')
}

/** Stateful entry point for adaptive product discovery and executable prototype briefs. */
export function draw2codeCreateTool(projects: ProjectStore, scenes: SceneStore) {
  return defineTool({
    name: 'draw2code_create',
    description: 'Create a new 画码 project through adaptive product discovery and one executable prototype brief. '
      + 'This is the mandatory entry point when the user says they want to create, build, or design a new product from scratch. '
      + 'Call action=start as soon as a new-project intent is clear; pass the user\'s idea faithfully, infer a concise semantic projectName from the entire idea, and never call draw2code_update first. Explicit facts returned in discovery must not be asked again. '
      + 'A discovery result means the Agent must choose the single highest-impact unresolved product decision. If information is insufficient, call action=propose_question with a product-specific insight, one decision question, 2–4 tradeoff-rich options, a recommendation, decisionImpact and dependencies. To make the native card lossless, question.text itself must be “判断：{insight}\\n\\n问题：{self-contained insight + decision question}”; the text after “问题：” must repeat the product judgment so it remains meaningful even if an Agent extracts only that part. question.options must already include synthesize-now/直接整理项目简报, unknown/还没想好 and other/其他 in addition to the product directions. question.dimension must use one returned openDimensions ID exactly: trigger-context, existing-alternative, core-outcome, unique-mechanism, core-loop, critical-risk, scope-proof, target-user, target-platform, or product-architecture. Never invent shorter aliases such as mechanism or risk. Never use the old fixed platform/user/goal/flow/modules/pages sequence, and never ask modules and pages as separate checklist questions. '
      + 'After every question result, call the host ask_user_question interaction with exactly one question and every returned choice, including “直接整理项目简报”, “还没想好” and “其他”; never truncate or silently replace options. Map the selected label back to its option id and call action=answer. The synthesize-now choice returns discovery.nextAction=synthesize. '
      + 'When the core scenario, outcome, unique mechanism, first-version flow and scope are clear—or the user asks to stop—call action=synthesize with stopReason and a complete PrototypeBrief. Discovery may stop early and must stop after ten questions. '
      + 'The tool validates PrototypeBrief, derives pageBlueprints/pageMockData, and deterministically renders briefMarkdown. When status=ready, show the complete briefMarkdown verbatim, then show one explicit page-range confirmation card listing every page: “确认这些页面并绘制 / 调整页面范围 / 调整产品方向”; do not summarize it. '
      + 'Use action=answer for a choice, action=skip when the user skips the pending question, action=revise to change an earlier answer and invalidate only dependent questions, action=rename to edit the project name, '
      + 'action=resume to reopen a draft, action=list to show unfinished projects, and action=confirm only after the user confirms the ready brief. '
      + 'The tool stores product intent separately from scene files. It creates an isolated empty board only after confirmation and returns nextAction=draw2code_update; '
      + 'the model must then call draw2code_update with the returned boardName. projectName is required for action=start, should usually be 4–12 Chinese characters, and becomes the board name directly; never append “原型” or another workflow suffix. The tool validates this Agent-authored name but does not derive it from the raw idea. The prototype is semantic low-fi: do not ask for brand colors, fonts, 3D/2D, flat/skeuomorphic style here, but restrained semantic tones for categories, states, and primary actions are encouraged. '
      + 'If the user volunteers a style preference, pass it as styleNote so it is deferred to draw2code_generate. '
      + 'Options are structured for native choice cards when available; otherwise render them as numbered choices. “直接整理项目简报” ends discovery without requiring a hidden chat input; “Other” requires text and is stored directly; silence or “还没想好” is an explicit pending decision, not pause or cancellation.',
    parameters: {
      root: { type: 'string', required: true, description: 'Workspace root (the session working directory).' },
      action: {
        type: 'string',
        required: true,
        enum: [...CREATE_ACTIONS],
        description: 'State-machine action for draw2code_create.',
      },
      idea: { type: 'string', description: 'The user’s new-project idea. Required for action=start.' },
      projectName: { type: 'string', description: 'Agent-inferred semantic product name. Required for action=start; usually 4–12 Chinese characters, never copied or clipped from the raw idea, and without an “原型” suffix. Also used as the replacement name for action=rename.' },
      styleNote: { type: 'string', description: 'A style preference volunteered by the user; record for generate, never apply to the prototype.' },
      sessionId: { type: 'string', description: 'Project session ID returned by a prior call.' },
      revision: { type: 'integer', description: 'Expected draft revision for mutation actions.' },
      questionId: { type: 'string', description: 'Question being answered or revised.' },
      values: { type: 'array', items: { type: 'string' }, description: 'Selected option IDs. Use one value for single-select questions.' },
      otherText: { type: 'string', description: 'Free-text answer when the user selected “other”.' },
      question: { type: 'json', description: 'Adaptive product question for action=propose_question. text must be directly displayable as “判断：{insight}\\n\\n问题：{self-contained insight + decision question}”; repeat the product judgment after 问题： so the native card remains meaningful even if only that part is used. options must explicitly contain 2–4 product directions plus synthesize-now/直接整理项目简报, unknown/还没想好, and other/其他. DSH may serialize this JSON object as a string; both forms are accepted.' },
      brief: { type: 'json', description: 'Structured PrototypeBrief for action=synthesize. Exact top-level keys: title, productDefinition, target, coreScenario, coreOutcome, uniqueMechanism[], firstVersionFlow[], includedScope[], excludedScope[], prototypeLayout, pages[], pageRelations[], prototypePrinciples[], acceptanceCriteria[], assumptions[], pendingDecisions[]. prototypeLayout requires platform, viewport{width,height}, arrangement, connectionStyle, representativePageId, comprehensionGoal. Each page requires id, name, goal, size{width,height}, structure:string[], primaryAction, secondaryActions:string[], mockDataGroups:[{name,items:string[]}], states:string[], navigation:string[], annotations:string[], acceptanceCriteria:string[]. Each relation requires fromPageId, toPageId, trigger, result, arrowStyle (solid|dashed), label. Never use mockData or other aliases. DSH may serialize this JSON object as a string; both forms are accepted.' },
      stopReason: { type: 'string', description: 'Why discovery is ready to synthesize early.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true },
          flowVersion: { type: 'integer' },
          sessionId: { type: 'string' },
          projectId: { type: 'string' },
          projectName: { type: 'string' },
          projectFile: { type: 'string' },
          revision: { type: 'integer' },
          question: { type: 'json' },
          discovery: { type: 'json' },
          brief: { type: 'json' },
          briefMarkdown: { type: 'string' },
          briefContract: { type: 'json' },
          confirmation: { type: 'json' },
          assumptions: { type: 'json' },
          nameProposal: { type: 'json' },
          boardName: { type: 'string' },
          activeBoard: { type: 'string' },
          nextAction: { type: 'string' },
          error: { type: 'json' },
          current: { type: 'json' },
          drafts: { type: 'json' },
          idempotent: { type: 'boolean' },
        },
      },
      render: (_args, value: CreateResponse) => {
        if (value.status === 'discovery' && value.discovery !== undefined) {
          const discovery = value.discovery as unknown as DiscoveryState
          if (discovery.nextAction === 'synthesize') {
            return text(`${continuation(value)} status=discovery nextAction=synthesize\n用户已选择直接整理或问题预算已经用完。必须立即调用 action=synthesize，并严格按 briefContract 提交 stopReason 与完整 PrototypeBrief；页面真实数据字段必须叫 mockDataGroups，格式为 [{ name, items: string[] }]；页面关系字段必须叫 fromPageId/toPageId/trigger/result/arrowStyle/label。禁止猜别名、读取插件源码或继续调用 action=propose_question。`)
          }
          return text(`${continuation(value)} status=discovery allowedDimensions=${discovery.openDimensions.join(',')} recommendedDimensions=${discovery.recommendedDimensions.join(',')}\n请根据 discovery 中已明确事实、历史回答和剩余问题预算，判断下一项最值得解决的产品决策。第一题优先从 recommendedDimensions 前两项中选择，不能先问模块、页面或通用信息架构。信息不足时调用 action=propose_question；question 必须包含 id、dimension、insight、text、decisionImpact、recommendedOptionId、dependsOn 和 2–4 个带 description 的 options，并且 dimension 必须逐字使用 allowedDimensions 中的稳定 ID。信息已经足够或用户要求直接整理时调用 action=synthesize。`)
        }
        if (value.status === 'question' && value.question !== undefined) {
          const question = value.question as unknown as CreateQuestion
          const options = question.options.map((option, index) => `${index + 1}. ${option.id} — ${option.label}${option.description === undefined ? '' : `：${option.description}`}`).join('\n')
          const recommended = question.options.find((option) => option.id === question.recommendedOptionId)
          const insight = question.insight === undefined || question.text.startsWith('判断：') ? '' : `判断：${question.insight}\n`
          const recommendation = recommended === undefined ? '' : `\n推荐：${recommended.label} — ${recommended.description ?? ''}`
          const impact = question.decisionImpact === undefined ? '' : `\n决策影响：${question.decisionImpact}`
          return text(`${continuation(value)} status=question questionId=${question.id}\n${insight}${question.text}\n${options}${recommendation}${impact}${question.allowOther ? '\n（可选“其他”并补充说明）' : ''}\n调用 ask_user_question 时必须原样复制 question.askUserQuestionArgs，不能丢掉判断、选项或“直接整理项目简报”。下一次调用必须使用 action=answer、上面的 sessionId/revision/questionId，并把用户选择的 option id 放入 values。`)
        }
        if (value.status === 'ready') {
          const markdown = value.briefMarkdown ?? '项目简报缺少可读 Markdown，请修复后再确认。'
          return text(`${continuation(value)} status=ready\n${markdown}\n\n请完整展示以上项目简报，不要自行缩写或重新总结。随后使用宿主 ask_user_question 原样复制 confirmation.askUserQuestionArgs；这张卡会明确列出将绘制的页面，并且仅包含“确认这些页面并绘制 / 调整页面范围 / 调整产品方向”。确认后调用 action=confirm。选择调整时直接调用 action=propose_question，只追问受影响的一项；旧简报会失效，回答后必须重新 synthesize 完整简报。`)
        }
        if (value.status === 'confirmed') return text(`${continuation(value)} status=confirmed boardName=${value.boardName ?? ''} activeBoard=${value.activeBoard ?? ''} nextAction=${value.nextAction ?? 'draw2code_update'}\n项目「${value.projectName ?? ''}」已确认，独立画板已创建。下一步必须同时按 brief.pageBlueprints 和 brief.pageMockData 调用 draw2code_update，并明确传入上面的 boardName；首轮有 3 个及以上页面时先画一个代表页并查看真实画板，再提交 representative visualReview 后添加其余页面，最终只有 completionReady=true 才能报告完成。每个重复内容组件至少提供 3 条可见 mock 数据，不要回写旧画板。`)
        if (value.status === 'drafts') {
          const drafts = (value.drafts as Array<{ sessionId?: string; projectName?: string; status?: string }> | undefined) ?? []
          const summary = drafts.map((draft) => `${draft.sessionId ?? ''} ${draft.projectName ?? ''} (${draft.status ?? ''})`).join('\n')
          return text(`找到 ${drafts.length} 个未完成项目，请让用户选择要继续的项目或创建新项目。\n${summary}`)
        }
        if (value.status === 'error') {
          const current = value.current as { sessionId?: string; revision?: number } | undefined
          return text(`draw2code_create 可恢复错误：${(value.error as { message?: string })?.message ?? 'unknown error'}${current === undefined ? '' : `\n请使用 current.sessionId=${current.sessionId ?? ''}、current.revision=${current.revision ?? ''} 修正后重试。`}`)
        }
        return text(`${continuation(value)} status=${value.status} project=${value.projectName ?? ''}`)
      },
    },
    async execute(args: CreateArgs): Promise<CreateResponse> {
      if (args.action === 'start') {
        const idea = typeof args.idea === 'string' ? args.idea.trim() : ''
        if (idea === '') return errorResponse('invalid_action', 'action=start requires a non-empty idea')
        if (typeof args.projectName !== 'string' || args.projectName.trim() === '') {
          return errorResponse('project_name_required', '请先基于完整需求语义概括一个简短产品名，再用 projectName 重新调用 action=start；不要复制或截取原话')
        }
        const projectName = normalizeProjectName(args.projectName)
        const nameError = projectNameValidationError(projectName, idea)
        if (nameError !== null) return errorResponse('project_name_invalid', nameError)
        const projectId = newProjectId()
        const draft = initialDraft(idea, projectName, args.styleNote?.trim() || null, projectId)
        const created = await projects.create(args.root, draft)
        if (!created.ok) return errorResponse(created.error.code, created.error.message)
        return {
          ...responseFor(projects, created.value),
          nameProposal: {
            suggestedName: projectName,
            choices: [
              { id: 'use', label: '使用这个名称' },
              { id: 'edit', label: '修改名称' },
              { id: 'later', label: '稍后再命名' },
            ],
          },
        }
      }

      if (args.action === 'list') {
        const listed = await projects.list(args.root)
        if (!listed.ok) return errorResponse(listed.error.code, listed.error.message)
        return {
          status: 'drafts',
          drafts: listed.value
            .filter((item) => item.status !== 'archived' && item.status !== 'abandoned')
            .map((item) => ({
              sessionId: item.projectId,
              projectName: item.projectName,
              idea: item.originalIdea,
              status: item.status,
              revision: item.revision,
              updatedAt: item.updatedAt,
              boardName: item.boardName,
            })),
        }
      }

      const sessionId = args.sessionId
      const draft = await loadSession(projects, args.root, sessionId)
      if (draft === null) return errorResponse('session_not_found', '找不到这个项目草稿，请选择恢复已有项目或重新开始')
      const key = requestKey(args)
      if (draft.lastRequestKey === key && draft.lastResponse !== undefined) {
        return { ...(clone(draft.lastResponse) as CreateResponse), idempotent: true }
      }

      if (draft.status !== 'draft' && ['propose_question', 'synthesize', 'skip', 'answer', 'revise'].includes(args.action)) {
        return errorResponse('project_not_editable', `项目当前状态为 ${draft.status}，不能继续修改发现问题或项目简报`, draft)
      }

      if (args.action === 'resume') {
        if (draft.flowVersion === undefined && draft.status === 'draft' && draft.brief === null) {
          const expectedRevision = draft.revision
          migrateLegacyDraft(draft)
          return persistMutation(projects, args.root, draft, expectedRevision, key, responseFor(projects, draft))
        }
        return responseFor(projects, draft)
      }

      if (args.action === 'propose_question') {
        if (draft.flowVersion !== CREATE_FLOW_VERSION) return errorResponse('legacy_upgrade_required', '请先用 action=resume 升级旧项目草稿', draft)
        if (typeof args.revision !== 'number') return errorResponse('invalid_action', 'action=propose_question requires revision', draft)
        if (draft.revision !== args.revision) return errorResponse('stale_revision', `project changed since revision ${args.revision}`, draft)
        if (draft.currentQuestion !== null) return errorResponse('question_pending', '请先回答当前问题，再提出下一题', draft)
        const discovery = draft.discovery as DiscoveryState
        const isReadyAdjustment = draft.brief !== null
        const validated = validateAdaptiveQuestion(normalizeStructuredArg(args.question), discovery, { allowAdjustment: isReadyAdjustment })
        if (!validated.ok) return errorResponse(validated.code, validated.message, draft)
        draft.brief = null
        draft.briefMarkdown = null
        draft.currentQuestion = validated.question
        draft.discovery = refreshDiscovery({
          ...discovery,
          questions: [...discovery.questions, validated.question],
          adjustmentQuestionIds: isReadyAdjustment
            ? [...new Set([...(discovery.adjustmentQuestionIds ?? []), validated.question.id])]
            : discovery.adjustmentQuestionIds ?? [],
          stopReason: null,
        })
        addHistory(draft, 'propose-question', validated.question.id)
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft))
      }

      if (args.action === 'synthesize') {
        if (draft.flowVersion !== CREATE_FLOW_VERSION) return errorResponse('legacy_upgrade_required', '请先用 action=resume 升级旧项目草稿', draft)
        if (typeof args.revision !== 'number') return errorResponse('invalid_action', 'action=synthesize requires revision', draft)
        if (draft.revision !== args.revision) return errorResponse('stale_revision', `project changed since revision ${args.revision}`, draft)
        if (typeof args.stopReason !== 'string' || args.stopReason.trim() === '') return errorResponse('invalid_action', 'action=synthesize requires stopReason', draft)
        let discovery = draft.discovery as DiscoveryState
        if (draft.currentQuestion !== null) {
          const pending = draft.currentQuestion as CreateQuestion
          const prefix = `${pending.id}：`
          draft.answers[pending.id] = { questionId: pending.id, values: ['unknown'], confirmed: true }
          discovery = refreshDiscovery({
            ...discovery,
            assumptions: [
              ...discovery.assumptions.filter((item) => !item.startsWith(prefix)),
              `${prefix}${pending.text}（用户选择直接整理，当前问题未回答）`,
            ],
          })
          addHistory(draft, 'skip-for-synthesize', pending.id, ['unknown'])
        }
        const normalizedBrief = normalizeStructuredArg(args.brief)
        const briefObject: unknown = typeof normalizedBrief === 'object' && normalizedBrief !== null && !Array.isArray(normalizedBrief)
          ? clone(normalizedBrief as Record<string, unknown>)
          : normalizedBrief
        if (typeof briefObject === 'object' && briefObject !== null && !Array.isArray(briefObject)) {
          const briefRecord = briefObject as Record<string, unknown>
          const pending = Array.isArray(briefRecord.pendingDecisions)
            ? briefRecord.pendingDecisions.filter((item): item is string => typeof item === 'string')
            : []
          briefRecord.pendingDecisions = [...new Set([...pending, ...discovery.assumptions])]
        }
        const validated = validatePrototypeBrief(briefObject, draft.deferredStyleNote)
        if (!validated.ok) return errorResponse(validated.code, validated.message, draft)
        draft.discovery = {
          ...discovery,
          nextAction: 'synthesize',
          stopReason: args.stopReason.trim(),
        }
        draft.currentQuestion = null
        draft.brief = validated.brief
        draft.briefMarkdown = validated.markdown
        addHistory(draft, 'synthesize')
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft))
      }

      if (args.action === 'abandon' || args.action === 'archive') {
        if (typeof args.revision !== 'number') return errorResponse('invalid_action', `${args.action} requires revision`, draft)
        if (draft.revision !== args.revision) return errorResponse('stale_revision', `project changed since revision ${args.revision}`, draft)
        draft.status = args.action === 'abandon' ? 'abandoned' : 'archived'
        draft.currentQuestion = null
        addHistory(draft, args.action)
        const response = responseFor(projects, draft)
        return persistMutation(projects, args.root, draft, args.revision, key, response)
      }

      if (args.action === 'rename') {
        if (typeof args.revision !== 'number' || typeof args.projectName !== 'string' || args.projectName.trim() === '') {
          return errorResponse('invalid_action', 'action=rename requires projectName and revision', draft)
        }
        if (draft.revision !== args.revision) return errorResponse('stale_revision', `project changed since revision ${args.revision}`, draft)
        const projectName = normalizeProjectName(args.projectName)
        const nameError = projectNameValidationError(projectName)
        if (nameError !== null) return errorResponse('project_name_invalid', nameError, draft)
        draft.projectName = projectName
        addHistory(draft, 'rename')
        const response = responseFor(projects, draft, {
          nameProposal: { suggestedName: draft.projectName, choices: [{ id: 'use', label: '使用这个名称' }] },
        })
        return persistMutation(projects, args.root, draft, args.revision, key, response)
      }

      if (args.action === 'skip') {
        if (typeof args.revision !== 'number' || typeof args.questionId !== 'string') {
          return errorResponse('invalid_action', 'action=skip requires revision and questionId', draft)
        }
        if (draft.revision !== args.revision) return errorResponse('stale_revision', `project changed since revision ${args.revision}`, draft)
        if (draft.flowVersion !== CREATE_FLOW_VERSION || draft.currentQuestion === null) return errorResponse('question_not_pending', '当前没有可以跳过的问题', draft)
        const question = draft.currentQuestion as CreateQuestion
        if (question.id !== args.questionId) return errorResponse('invalid_question', `question "${args.questionId}" is not pending`, draft)
        const discovery = draft.discovery as DiscoveryState
        const prefix = `${question.id}：`
        draft.answers[question.id] = { questionId: question.id, values: ['unknown'], confirmed: true }
        draft.discovery = refreshDiscovery({
          ...discovery,
          assumptions: [
            ...discovery.assumptions.filter((item) => !item.startsWith(prefix)),
            `${prefix}${question.text}（用户跳过，保留为待验证假设）`,
          ],
          openDimensions: question.dimension === undefined
            ? discovery.openDimensions
            : [...new Set([...discovery.openDimensions, question.dimension as DiscoveryDimension])],
        })
        draft.currentQuestion = null
        draft.brief = null
        draft.briefMarkdown = null
        addHistory(draft, 'skip', question.id, ['unknown'])
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft))
      }

      if (args.action === 'confirm') {
        if (typeof args.revision !== 'number') return errorResponse('invalid_action', 'action=confirm requires revision', draft)
        if (draft.revision !== args.revision) return errorResponse('stale_revision', `project changed since revision ${args.revision}`, draft)
        if (draftStatus(draft) !== 'ready') return errorResponse('not_ready', '项目简报还没有完成，不能确认绘制', draft)
        const boards = await scenes.list(args.root)
        if (!boards.ok) return errorResponse(boards.error.code, boards.error.message, draft)
        const boardName = boardNameFromProject(draft.projectName, new Set(boards.value.map((board) => board.name)))
        const created = await scenes.create(args.root, boardName)
        if (!created.ok) return errorResponse(created.error.code, created.error.message, draft)
        const active = await scenes.setActiveBoard(args.root, boardName)
        if (!active.ok) {
          await scenes.remove(args.root, boardName)
          return errorResponse(active.error.code, active.error.message, draft)
        }
        draft.status = 'confirmed'
        draft.boardName = boardName
        if (draft.flowVersion !== CREATE_FLOW_VERSION) {
          draft.brief = buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote)
        }
        addHistory(draft, 'confirm')
        const response = responseFor(projects, draft, { activeBoard: active.value.name, nextAction: 'draw2code_update' })
        const saved = await persistMutation(projects, args.root, draft, args.revision, key, response)
        if (saved.status === 'error') await scenes.remove(args.root, boardName)
        return saved
      }

      if (args.action !== 'answer' && args.action !== 'revise') return errorResponse('invalid_action', `unsupported action ${args.action}`, draft)
      if (typeof args.revision !== 'number' || typeof args.questionId !== 'string' || !Array.isArray(args.values)) {
        return errorResponse('invalid_action', `${args.action} requires revision, questionId and values`, draft)
      }
      if (draft.revision !== args.revision) return errorResponse('stale_revision', `project changed since revision ${args.revision}`, draft)
      if (args.action === 'answer' && (draft.currentQuestion === null || (draft.currentQuestion as { id?: unknown }).id !== args.questionId)) {
        return errorResponse('historical_answer_requires_revise', 'action=answer 只能回答当前问题；修改历史答案必须使用 action=revise', draft)
      }
      const question = questionFromDraft(draft, args.questionId)
      if (question === null) return errorResponse('invalid_question', `question "${args.questionId}" is not valid for this project`, draft)
      const validation = validateValues(question, args.values, args.otherText)
      if (validation !== null) return errorResponse('invalid_option', validation, draft)

      if (draft.flowVersion === CREATE_FLOW_VERSION && question.kind === 'choice') {
        if (args.values.includes('synthesize-now')) {
          const discovery = draft.discovery as DiscoveryState
          const prefix = `${question.id}：`
          draft.answers[question.id] = { questionId: question.id, values: ['unknown'], confirmed: true }
          draft.discovery = {
            ...refreshDiscovery({
              ...discovery,
              assumptions: [
                ...discovery.assumptions.filter((item) => !item.startsWith(prefix)),
                `${prefix}${question.text}（用户选择直接整理，保留为待验证假设）`,
              ],
              openDimensions: question.dimension === undefined
                ? discovery.openDimensions
                : [...new Set([...discovery.openDimensions, question.dimension as DiscoveryDimension])],
            }),
            nextAction: 'synthesize',
            stopReason: '用户选择直接整理项目简报',
          }
          draft.currentQuestion = null
          draft.brief = null
          draft.briefMarkdown = null
          addHistory(draft, 'synthesize-now', question.id, args.values)
          return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft))
        }
        const selected = question.options.find((option) => option.id === args.values![0])
        const answerText = args.values.includes('other')
          ? args.otherText?.trim() ?? ''
          : selected?.label ?? args.values[0]
        draft.answers[question.id] = {
          questionId: question.id,
          values: args.values,
          ...(args.values.includes('other') ? { otherText: args.otherText?.trim() ?? '' } : {}),
          confirmed: true,
        }
        let discovery = draft.discovery as DiscoveryState
        if (args.action === 'revise') {
          const invalidated = removeDependentQuestions(discovery, question.id)
          discovery = invalidated.discovery
          for (const id of invalidated.removedIds) delete draft.answers[id]
        }
        const decisionPrefix = `${question.id}：`
        const resolvedDecisions = discovery.resolvedDecisions.filter((item) => !item.startsWith(decisionPrefix))
        const assumptions = discovery.assumptions.filter((item) => !item.startsWith(decisionPrefix))
        const openDimensions = question.dimension === undefined
          ? discovery.openDimensions
          : args.values.includes('unknown')
            ? [...new Set([...discovery.openDimensions, question.dimension as DiscoveryDimension])]
            : discovery.openDimensions.filter((dimension) => dimension !== question.dimension)
        if (args.values.includes('unknown')) assumptions.push(`${decisionPrefix}${question.text}（用户暂未决定）`)
        else resolvedDecisions.push(`${decisionPrefix}${answerText}`)
        draft.discovery = refreshDiscovery({ ...discovery, resolvedDecisions, assumptions, openDimensions })
        draft.currentQuestion = null
        draft.brief = null
        draft.briefMarkdown = null
        addHistory(draft, args.action, question.id, args.values, args.otherText)
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft))
      }

      if (question.kind === 'interpretation') {
        const pending = draft.pendingInterpretation
        if (pending === null) return errorResponse('invalid_state', 'no free-text interpretation is waiting for confirmation', draft)
        const choice = args.values[0]
        if (choice === 'edit') {
          draft.pendingInterpretation = null
          draft.currentQuestion = pending.question
          addHistory(draft, 'interpretation-edit', pending.questionId)
          return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft))
        }
        const answer: CreateAnswer = {
          questionId: pending.questionId,
          values: pending.values,
          otherText: pending.otherText,
          ...(choice === 'confirm' ? { normalizedText: pending.normalizedText } : {}),
          confirmed: choice === 'confirm',
        }
        draft.answers[pending.questionId] = answer
        draft.pendingInterpretation = null
        draft.currentQuestion = nextAfterAnswer(draft)
        draft.status = draft.currentQuestion === null ? 'ready' : 'draft'
        draft.brief = draft.currentQuestion === null ? buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote) : null
        addHistory(draft, `interpretation-${choice}`, pending.questionId, pending.values, pending.otherText)
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft))
      }

      if (args.action === 'revise') clearDownstreamAnswers(draft, args.questionId)
      if (args.values.includes('other')) {
        const normalizedText = interpretOther(question, args.otherText ?? '')
        draft.answers[question.id] = {
          questionId: question.id,
          values: args.values,
          otherText: args.otherText?.trim() ?? '',
          normalizedText,
          confirmed: true,
        }
        draft.pendingInterpretation = null
        draft.currentQuestion = nextAfterAnswer(draft)
        draft.status = draft.currentQuestion === null ? 'ready' : 'draft'
        draft.brief = draft.currentQuestion === null ? buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote) : null
        addHistory(draft, 'answer-other', question.id, args.values, args.otherText)
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft))
      }

      draft.answers[question.id] = {
        questionId: question.id,
        values: args.values,
        confirmed: true,
      }
      draft.currentQuestion = nextAfterAnswer(draft)
      draft.status = draft.currentQuestion === null ? 'ready' : 'draft'
      draft.brief = draft.currentQuestion === null ? buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote) : null
      addHistory(draft, args.action, question.id, args.values)
      return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft))
    },
  })
}
