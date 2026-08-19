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

type CreateAction = 'start' | 'answer' | 'revise' | 'rename' | 'resume' | 'list' | 'confirm' | 'abandon' | 'archive'

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
}

interface CreateResponse {
  status: string
  sessionId?: string
  projectId?: string
  projectName?: string
  projectFile?: string
  revision?: number
  question?: JsonValue
  brief?: JsonValue
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
  return JSON.stringify({
    action: args.action,
    sessionId: args.sessionId ?? null,
    revision: args.revision ?? null,
    questionId: args.questionId ?? null,
    values: args.values ?? [],
    otherText: args.otherText ?? null,
    projectName: args.projectName ?? null,
  })
}

function draftStatus(draft: ProjectDraft): string {
  if (draft.status === 'draft') return draft.currentQuestion === null ? 'ready' : 'question'
  return draft.status
}

function responseFor(projects: ProjectStore, draft: ProjectDraft, extras: Partial<CreateResponse> = {}): CreateResponse {
  const response: CreateResponse = {
    status: draftStatus(draft),
    sessionId: draft.projectId,
    projectId: draft.projectId,
    projectName: draft.projectName,
    projectFile: projects.fileName(draft.projectId),
    revision: draft.revision,
    ...(draft.currentQuestion === null ? {} : { question: draft.currentQuestion as JsonValue }),
    ...(draft.brief === null ? {} : { brief: draft.brief as JsonValue, assumptions: ((draft.brief as { assumptions?: JsonValue }).assumptions ?? []) }),
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
    currentQuestion: questionFor(idea, answers),
    pendingInterpretation: null,
    brief: null,
    history: [{ revision: 1, action: 'start', at: Date.now() }],
  }
}

/** Stateful entry point for creating a new project through choice-first grilling. */
export function draw2codeCreateTool(projects: ProjectStore, scenes: SceneStore) {
  return defineTool({
    name: 'draw2code_create',
    description: 'Create a new 画码 project through a stateful, choice-first grilling flow. '
      + 'This is the mandatory entry point when the user says they want to create, build, or design a new product from scratch. '
      + 'Call action=start as soon as a new-project intent is clear, even when the idea is incomplete; pass the user\'s idea faithfully without speculative expansion, infer a concise semantic projectName from the entire idea, and do not call draw2code_update first. Never obtain projectName by copying or clipping the beginning of idea. Explicit App/Web/mini-program wording is prefilled and must not be asked again. '
      + 'After every question result, call the host ask_user_question interaction with exactly one question and every returned choice, including “还没想好” and “其他”; never truncate or silently replace options, so the user can select instead of typing. '
      + 'Map the selected label back to its option id, then call this tool again; only use the numbered text fallback when ask_user_question is unavailable. '
      + 'Use action=answer for a choice, action=revise to change an earlier answer, action=rename to accept a project-name edit, '
      + 'action=resume to reopen a draft, action=list to show unfinished projects, and action=confirm only after the user confirms the ready brief. '
      + 'The tool stores product intent separately from scene files. It creates an isolated empty board only after confirmation and returns nextAction=draw2code_update; '
      + 'the model must then call draw2code_update with the returned boardName. projectName is required for action=start, should usually be 4–12 Chinese characters, and becomes the board name directly; never append “原型” or another workflow suffix. The tool validates this Agent-authored name but does not derive it from the raw idea. The prototype is semantic low-fi: do not ask for brand colors, fonts, 3D/2D, flat/skeuomorphic style here, but restrained semantic tones for categories, states, and primary actions are encouraged. '
      + 'If the user volunteers a style preference, pass it as styleNote so it is deferred to draw2code_generate. '
      + 'Options are structured for native choice cards when available; otherwise render them as numbered choices. “Other” requires text and is stored directly; the ready brief is the single confirmation checkpoint, so never add a redundant per-answer paraphrase confirmation.',
    parameters: {
      root: { type: 'string', required: true, description: 'Workspace root (the session working directory).' },
      action: {
        type: 'string',
        required: true,
        enum: ['start', 'answer', 'revise', 'rename', 'resume', 'list', 'confirm', 'abandon', 'archive'],
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
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true },
          sessionId: { type: 'string' },
          projectId: { type: 'string' },
          projectName: { type: 'string' },
          projectFile: { type: 'string' },
          revision: { type: 'integer' },
          question: { type: 'json' },
          brief: { type: 'json' },
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
        if (value.status === 'question' && value.question !== undefined) {
          const question = value.question as unknown as CreateQuestion
          const options = question.options.map((option, index) => `${index + 1}. ${option.id} — ${option.label}`).join('\n')
          return text(`${continuation(value)} status=question questionId=${question.id}\n${question.text}\n${options}${question.allowOther ? '\n（可选“其他”并补充说明）' : ''}\n下一次调用必须使用 action=answer、上面的 sessionId/revision/questionId，并把用户选择的 option id 放入 values。`)
        }
        if (value.status === 'ready') return text(`${continuation(value)} status=ready\n需求已整理完成。brief.pageMockData 是逐页内容蓝图，必须随 brief 一起展示并在绘制时落实；请等待用户统一确认，确认后调用 action=confirm，传入同一个 sessionId 和 revision。`)
        if (value.status === 'confirmed') return text(`${continuation(value)} status=confirmed boardName=${value.boardName ?? ''} activeBoard=${value.activeBoard ?? ''} nextAction=${value.nextAction ?? 'draw2code_update'}\n项目「${value.projectName ?? ''}」已确认，独立画板已创建。下一步必须按 brief.pageMockData 调用 draw2code_update，并明确传入上面的 boardName；每个重复内容组件至少提供 3 条可见 mock 数据，不要回写旧画板。`)
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

      if (args.action === 'resume') return responseFor(projects, draft)

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
        draft.brief = buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote)
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
      const question = questionFromDraft(draft, args.questionId)
      if (question === null) return errorResponse('invalid_question', `question "${args.questionId}" is not valid for this project`, draft)
      const validation = validateValues(question, args.values, args.otherText)
      if (validation !== null) return errorResponse('invalid_option', validation, draft)

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
