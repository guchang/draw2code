/**
 * The model-facing grilling contract for draw2code_create.
 *
 * The question set has a small stable core. Options are contextual so a
 * domain like "万年历穿搭" gets useful semantic choices without turning the
 * tool into a giant industry questionnaire.
 */

export interface CreateOption {
  id: string
  label: string
  description?: string
}

export interface CreateQuestion {
  id: string
  kind: 'choice' | 'interpretation'
  text: string
  selectionMode: 'single' | 'multiple'
  options: CreateOption[]
  allowOther: boolean
  minSelections?: number
  maxSelections?: number
}

export interface CreateAnswer {
  questionId: string
  values: string[]
  otherText?: string
  normalizedText?: string
  confirmed: boolean
}

const PLATFORM_OPTIONS: CreateOption[] = [
  { id: 'web', label: 'Web' },
  { id: 'app', label: 'App' },
  { id: 'both', label: 'Web + App' },
  { id: 'mini-program', label: '小程序' },
  { id: 'unknown', label: '还没想好' },
  { id: 'other', label: '其他' },
]

const USER_OPTIONS: CreateOption[] = [
  { id: 'consumer', label: '普通消费者' },
  { id: 'professional', label: '专业用户' },
  { id: 'team-member', label: '团队成员' },
  { id: 'administrator', label: '管理员' },
  { id: 'unknown', label: '还没想好' },
  { id: 'other', label: '其他' },
]

const GOAL_OPTIONS: CreateOption[] = [
  { id: 'query', label: '查询信息' },
  { id: 'record', label: '记录内容' },
  { id: 'create', label: '创建内容' },
  { id: 'compare', label: '比较和选择' },
  { id: 'transaction', label: '完成交易' },
  { id: 'unknown', label: '还没想好' },
  { id: 'other', label: '其他' },
]

function includesIdea(idea: string, pattern: RegExp): boolean {
  return pattern.test(idea)
}

function isSocialIdea(idea: string): boolean {
  return includesIdea(idea, /陌生人|社交|交友|附近的人|雷达|碰一碰|nfc|好友|聊天/iu)
}

export function explicitAnswersFromIdea(idea: string): Record<string, CreateAnswer> {
  const platforms: string[] = []
  if (/小程序/iu.test(idea)) platforms.push('mini-program')
  if (/\bweb\b|网页|网站/iu.test(idea)) platforms.push('web')
  if (/\bapp\b|移动端|手机应用/iu.test(idea)) platforms.push('app')
  if (platforms.length !== 1) return {}
  return {
    'target-platform': {
      questionId: 'target-platform',
      values: platforms,
      confirmed: true,
    },
  }
}

export function goalOptions(idea: string): CreateOption[] {
  if (isSocialIdea(idea)) {
    return [
      { id: 'discover-nearby', label: '发现附近的人并建立联系' },
      { id: 'meet-verify', label: '线下见面后验证并成为好友' },
      { id: 'chat-network', label: '和已建立联系的人聊天互动' },
      { id: 'safety-control', label: '安全地控制谁可以发现和联系我' },
      { id: 'unknown', label: '还没想好' },
      { id: 'other', label: '其他' },
    ]
  }
  return GOAL_OPTIONS
}

export function moduleOptions(idea: string): CreateOption[] {
  if (isSocialIdea(idea)) {
    return [
      { id: 'radar-home', label: '雷达首页（扫描附近的人）' },
      { id: 'bump-connect', label: '碰一碰验证与加好友' },
      { id: 'friends-chat', label: '好友与聊天' },
      { id: 'profile-history', label: '个人资料、雷达足迹与碰一碰历史' },
      { id: 'safety-privacy', label: '隐私与安全控制' },
      { id: 'other', label: '其他' },
    ]
  }
  if (includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu)) {
    return [
      { id: 'calendar', label: '万年历 / 日期查询' },
      { id: 'weather', label: '天气信息' },
      { id: 'outfit', label: '穿搭推荐' },
      { id: 'wardrobe', label: '个人衣橱' },
      { id: 'favorite', label: '收藏与分享' },
      { id: 'other', label: '其他' },
    ]
  }
  if (includesIdea(idea, /电商|商城|购物|商品|购买/iu)) {
    return [
      { id: 'catalog', label: '商品浏览' },
      { id: 'search-filter', label: '搜索与筛选' },
      { id: 'detail', label: '商品详情' },
      { id: 'cart', label: '购物车' },
      { id: 'order', label: '订单与支付' },
      { id: 'other', label: '其他' },
    ]
  }
  return [
    { id: 'home', label: '首页 / 总览' },
    { id: 'search-filter', label: '搜索与筛选' },
    { id: 'create-edit', label: '创建与编辑' },
    { id: 'detail', label: '详情页' },
    { id: 'profile', label: '个人中心' },
    { id: 'settings', label: '设置' },
    { id: 'other', label: '其他' },
  ]
}

export function pageOptions(idea: string): CreateOption[] {
  if (isSocialIdea(idea)) {
    return [
      { id: 'radar-home', label: '雷达首页' },
      { id: 'nearby-profile', label: '附近用户资料页' },
      { id: 'bump-confirm', label: '碰一碰验证页' },
      { id: 'friends-chat', label: '好友与聊天页' },
      { id: 'profile-history', label: '个人中心与足迹页' },
      { id: 'other', label: '其他' },
    ]
  }
  if (includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu)) {
    return [
      { id: 'query', label: '日期 / 城市查询页' },
      { id: 'weather', label: '日期与天气页' },
      { id: 'recommendation', label: '穿搭推荐结果页' },
      { id: 'outfit-detail', label: '穿搭详情页' },
      { id: 'wardrobe', label: '个人衣橱页' },
      { id: 'other', label: '其他' },
    ]
  }
  return [
    { id: 'home', label: '首页 / 总览' },
    { id: 'core-action', label: '核心操作页' },
    { id: 'result', label: '结果页' },
    { id: 'detail', label: '详情页' },
    { id: 'profile', label: '个人中心' },
    { id: 'other', label: '其他' },
  ]
}

export function flowOptions(idea: string): CreateOption[] {
  if (isSocialIdea(idea)) {
    return [
      { id: 'radar-bump-chat', label: '雷达发现附近的人 → 见面碰一碰 → 成为好友 → 聊天' },
      { id: 'radar-profile-meet', label: '扫描附近的人 → 查看资料 → 决定是否见面' },
      { id: 'friends-chat', label: '进入好友列表 → 选择好友 → 开始聊天' },
      { id: 'other', label: '其他' },
    ]
  }
  if (includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu)) {
    return [
      { id: 'daily-outfit', label: '选择日期 / 城市 → 获取天气 → 查看穿搭建议' },
      { id: 'weather-recommendation', label: '查看天气 → 直接获得穿搭建议' },
      { id: 'wardrobe-match', label: '选择衣物 → 生成适合当天的搭配' },
      { id: 'other', label: '其他' },
    ]
  }
  return [
    { id: 'browse-result', label: '进入首页 → 浏览内容 → 查看结果' },
    { id: 'input-result', label: '输入条件 → 提交 → 查看结果' },
    { id: 'create-save', label: '创建内容 → 编辑 → 保存' },
    { id: 'search-detail', label: '搜索 / 筛选 → 查看详情 → 完成操作' },
    { id: 'other', label: '其他' },
  ]
}

export function questionFor(idea: string, answers: Record<string, CreateAnswer>): CreateQuestion | null {
  if (answers['target-platform'] === undefined) {
    return {
      id: 'target-platform',
      kind: 'choice',
      text: '你准备先做哪个端？',
      selectionMode: 'single',
      options: PLATFORM_OPTIONS,
      allowOther: true,
    }
  }
  if (answers['core-user'] === undefined) {
    return {
      id: 'core-user',
      kind: 'choice',
      text: '这个工具主要服务谁？',
      selectionMode: 'single',
      options: USER_OPTIONS,
      allowOther: true,
    }
  }
  if (answers['core-goal'] === undefined) {
    return {
      id: 'core-goal',
      kind: 'choice',
      text: '首版最重要的是帮助用户完成什么？',
      selectionMode: 'single',
      options: goalOptions(idea),
      allowOther: true,
    }
  }
  if (answers['core-flow'] === undefined) {
    return {
      id: 'core-flow',
      kind: 'choice',
      text: '用户最重要的一条使用流程是什么？',
      selectionMode: 'single',
      options: flowOptions(idea),
      allowOther: true,
    }
  }
  if (answers['core-modules'] === undefined) {
    return {
      id: 'core-modules',
      kind: 'choice',
      text: '第一版需要包含哪些核心模块？可以多选。',
      selectionMode: 'multiple',
      options: moduleOptions(idea),
      allowOther: true,
      minSelections: 1,
      maxSelections: 5,
    }
  }
  if (answers['core-pages'] === undefined) {
    return {
      id: 'core-pages',
      kind: 'choice',
      text: '首轮原型要画哪些核心页面？请选择 3–5 个。',
      selectionMode: 'multiple',
      options: pageOptions(idea),
      allowOther: true,
      minSelections: 3,
      maxSelections: 5,
    }
  }
  return null
}

export function questionById(idea: string, questionId: string): CreateQuestion | null {
  const questions: CreateQuestion[] = [
    questionFor(idea, {})!,
    questionFor(idea, { 'target-platform': { questionId: 'target-platform', values: ['web'], confirmed: true } })!,
    questionFor(idea, {
      'target-platform': { questionId: 'target-platform', values: ['web'], confirmed: true },
      'core-user': { questionId: 'core-user', values: ['consumer'], confirmed: true },
    })!,
    questionFor(idea, {
      'target-platform': { questionId: 'target-platform', values: ['web'], confirmed: true },
      'core-user': { questionId: 'core-user', values: ['consumer'], confirmed: true },
      'core-goal': { questionId: 'core-goal', values: ['query'], confirmed: true },
    })!,
    questionFor(idea, {
      'target-platform': { questionId: 'target-platform', values: ['web'], confirmed: true },
      'core-user': { questionId: 'core-user', values: ['consumer'], confirmed: true },
      'core-goal': { questionId: 'core-goal', values: ['query'], confirmed: true },
      'core-flow': { questionId: 'core-flow', values: ['browse-result'], confirmed: true },
    })!,
    questionFor(idea, {
      'target-platform': { questionId: 'target-platform', values: ['web'], confirmed: true },
      'core-user': { questionId: 'core-user', values: ['consumer'], confirmed: true },
      'core-goal': { questionId: 'core-goal', values: ['query'], confirmed: true },
      'core-flow': { questionId: 'core-flow', values: ['browse-result'], confirmed: true },
      'core-modules': { questionId: 'core-modules', values: ['home'], confirmed: true },
    })!,
  ]
  return questions.find((question) => question?.id === questionId) ?? null
}

function selectedLabels(question: CreateQuestion, values: string[]): string[] {
  return values.map((id) => question.options.find((option) => option.id === id)?.label ?? id)
}

function selectedAnswerLabels(question: CreateQuestion, answer: CreateAnswer | undefined): string[] {
  if (answer === undefined) return []
  const labels = selectedLabels(question, answer.values.filter((id) => id !== 'other'))
  if (answer.values.includes('other') && answer.otherText?.trim()) labels.push(answer.otherText.trim())
  return labels
}

export function deriveComponents(idea: string, modules: string[]): Array<{ type: string; label: string }> {
  const labels = new Map<string, string>([
    ['calendar', '日期选择器'],
    ['weather', '天气信息卡'],
    ['outfit', '穿搭推荐卡'],
    ['wardrobe', '衣橱列表'],
    ['favorite', '收藏 / 分享操作'],
    ['catalog', '商品列表'],
    ['search-filter', '搜索与筛选器'],
    ['detail', '详情卡片'],
    ['cart', '购物车摘要'],
    ['order', '订单与支付操作'],
    ['home', '首页总览卡片'],
    ['create-edit', '创建 / 编辑表单'],
    ['profile', '用户资料卡'],
    ['settings', '设置列表'],
    ['radar-home', '雷达扫描与附近用户分布'],
    ['bump-connect', '碰一碰验证与加好友操作'],
    ['friends-chat', '好友列表与聊天'],
    ['profile-history', '个人资料、雷达足迹与碰一碰历史'],
    ['safety-privacy', '隐私与安全控制'],
  ])
  return modules.map((id) => ({
    type: id,
    label: labels.get(id) ?? `${id} 模块`,
  })).concat(idea.trim() === '' ? [] : [{ type: 'navigation', label: '页面导航与主流程箭头' }])
}

interface PageMockData {
  pageId: string
  page: string
  minimumRecords: number
  requiredContent: string[]
  examples: string[]
}

interface SemanticComponentSpec {
  kind: string
  role: string
  purpose: string
  requiredParts: string[]
}

const SEMANTIC_COMPONENT_CATALOG: SemanticComponentSpec[] = [
  { kind: 'page-header', role: 'page-heading', purpose: '说明页面身份与当前上下文', requiredParts: ['可读页面标题', '必要的返回、日期或状态上下文'] },
  { kind: 'task-card', role: 'content-card', purpose: '承载一条可操作的真实记录', requiredParts: ['对象标题', '状态或时间', '必要的次级信息'] },
  { kind: 'form-field', role: 'input', purpose: '低成本录入或修改信息', requiredParts: ['字段标签', '真实值或可理解提示', '输入边界'] },
  { kind: 'chip-group', role: 'chip', purpose: '表达少量互斥或筛选选择', requiredParts: ['完整选项文字', '清楚的当前选中项'] },
  { kind: 'stat-card', role: 'stat-card', purpose: '突出一个可比较的关键指标', requiredParts: ['指标名', '数值与单位', '必要的状态说明'] },
  { kind: 'quadrant-grid', role: 'category-card', purpose: '并列呈现四类优先级或状态', requiredParts: ['四个语义标题', '克制的语义色', '每类真实内容'] },
  { kind: 'radar-map', role: 'radar-map', purpose: '表达附近对象相对位置与扫描状态', requiredParts: ['扫描中心', '至少 3 个真实对象点', '距离或在线状态'] },
  { kind: 'conversation-list', role: 'message-list', purpose: '承载联系人与双方对话', requiredParts: ['联系人昵称与时间', '最近消息', '可读的双方消息气泡'] },
  { kind: 'calendar-grid', role: 'calendar-grid', purpose: '表达完整日期结构与当前选择', requiredParts: ['星期标题', '完整日期网格', '明确的选中日期'] },
  { kind: 'outfit-card', role: 'recommendation-card', purpose: '表达一套可理解的穿搭方案', requiredParts: ['搭配名称', '至少 3 件具体单品', '推荐理由和适用条件'] },
  { kind: 'bottom-navigation', role: 'bottom-navigation', purpose: '稳定表达一级页面切换', requiredParts: ['导航 shell', '独立且完整的栏目标签', '明确的当前项'] },
  { kind: 'primary-action', role: 'primary-action', purpose: '推进当前页面的唯一核心任务', requiredParts: ['明确动词文案', '至少 44×44px 点击区域', '与次要操作有层级差'] },
]

interface PageBlueprint {
  pageId: string
  page: string
  coreTask: string
  aboveFold: string[]
  primaryAction: string
  semanticComponents: SemanticComponentSpec[]
}

const SOCIAL_PAGE_MOCK_DATA: Record<string, Omit<PageMockData, 'pageId' | 'page'>> = {
  'radar-home': {
    minimumRecords: 3,
    requiredContent: ['当前扫描状态与附近人数', '至少 3 个附近用户的昵称和距离', '主操作与重新扫描操作'],
    examples: ['林小满 · 300m', '周可乐 · 500m', '陈一川 · 800m'],
  },
  'nearby-profile': {
    minimumRecords: 3,
    requiredContent: ['用户昵称、距离和在线状态', '至少 3 项个人资料或兴趣标签', '见面或返回雷达操作'],
    examples: ['林小满 · 距你 300m', '摄影', '周末徒步'],
  },
  'bump-confirm': {
    minimumRecords: 3,
    requiredContent: ['碰一碰对象昵称', '等待、识别与成功结果中的至少 3 条状态信息', '开始聊天与稍后再聊操作'],
    examples: ['正在识别附近设备…', '已确认：林小满', '14:20 成为好友'],
  },
  'friends-chat': {
    minimumRecords: 3,
    requiredContent: ['至少 3 位好友的昵称、最近消息和时间', '聊天标题与在线状态', '至少 3 条可读的双方对话和消息输入操作'],
    examples: ['林小满 · 周末一起去徒步吗？ · 18:42', '周可乐 · 碰一碰成功啦 · 14:20', '陈一川 · 下次一起喝咖啡 · 昨天'],
  },
  'profile-history': {
    minimumRecords: 3,
    requiredContent: ['用户昵称与雷达 ID', '好友数、足迹数、碰一碰次数', '至少 3 条足迹或碰一碰历史记录'],
    examples: ['好友 12', '雷达足迹 38 处', '今天 14:20 · 咖啡店 · 林小满'],
  },
}

const CALENDAR_PAGE_MOCK_DATA: Record<string, Omit<PageMockData, 'pageId' | 'page'>> = {
  query: {
    minimumRecords: 3,
    requiredContent: ['已选城市和日期', '完整可读的当月日期网格', '节气、节假日或宜忌摘要'],
    examples: ['杭州', '2026 年 6 月 21 日', '夏至 · 宜出行'],
  },
  weather: {
    minimumRecords: 3,
    requiredContent: ['日期与城市', '温度和天气状态', '风力、湿度或降水等至少 3 项天气指标'],
    examples: ['杭州 · 6 月 21 日', '26–32°C · 多云', '东南风 3 级 · 湿度 68%'],
  },
  recommendation: {
    minimumRecords: 3,
    requiredContent: ['推荐理由', '至少 3 件具体服饰或配件', '收藏、换一套或查看详情操作'],
    examples: ['亚麻短袖', '浅色休闲裤', '防晒帽'],
  },
  'outfit-detail': {
    minimumRecords: 3,
    requiredContent: ['搭配名称与适用场景', '至少 3 件单品及穿搭说明', '天气适配或注意事项'],
    examples: ['通勤清爽搭配', '亚麻短袖 · 透气', '轻薄外套 · 应对空调房'],
  },
  wardrobe: {
    minimumRecords: 3,
    requiredContent: ['分类与筛选状态', '至少 3 件衣物的名称、类别和状态', '新增衣物或选择搭配操作'],
    examples: ['白色亚麻衬衫 · 上装 · 可穿', '卡其休闲裤 · 下装 · 可穿', '轻薄风衣 · 外套 · 待清洗'],
  },
}

const GENERIC_PAGE_MOCK_DATA: Record<string, Omit<PageMockData, 'pageId' | 'page'>> = {
  home: {
    minimumRecords: 3,
    requiredContent: ['当前状态或摘要', '至少 3 条具有真实语义的内容记录', '清晰的首要操作'],
    examples: ['今日新增 6 条', '待处理 3 条', '最近更新于 10:30'],
  },
  'core-action': {
    minimumRecords: 3,
    requiredContent: ['当前操作对象', '至少 3 个已填写的关键字段或步骤状态', '提交与取消操作'],
    examples: ['当前对象：示例记录', '步骤 2 / 3', '已填写 4 项'],
  },
  result: {
    minimumRecords: 3,
    requiredContent: ['结果标题与摘要', '至少 3 条结果记录或指标', '继续操作或返回入口'],
    examples: ['共找到 12 条结果', '推荐结果 A · 匹配度 92%', '推荐结果 B · 匹配度 87%'],
  },
  detail: {
    minimumRecords: 3,
    requiredContent: ['对象名称与当前状态', '至少 3 项关键属性或记录', '主要操作与返回入口'],
    examples: ['示例对象 · 进行中', '创建于 6 月 21 日', '负责人：林小满'],
  },
  profile: {
    minimumRecords: 3,
    requiredContent: ['用户名称与身份信息', '至少 3 项统计或个人资料', '设置或退出操作'],
    examples: ['林小满', '已完成 28 项', '连续使用 7 天'],
  },
}

export function derivePageMockData(idea: string, pageIds: string[]): PageMockData[] {
  const pageLabels = new Map(pageOptions(idea).map((option) => [option.id, option.label]))
  const domainSpecs = isSocialIdea(idea)
    ? SOCIAL_PAGE_MOCK_DATA
    : includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu)
      ? CALENDAR_PAGE_MOCK_DATA
      : GENERIC_PAGE_MOCK_DATA
  return pageIds.map((pageId) => {
    const spec = domainSpecs[pageId] ?? GENERIC_PAGE_MOCK_DATA[pageId] ?? {
      minimumRecords: 3,
      requiredContent: ['页面目的说明', '至少 3 条具有真实语义的示例记录', '清晰的主要操作和状态反馈'],
      examples: ['示例记录 1 · 已完成', '示例记录 2 · 进行中', '示例记录 3 · 待处理'],
    }
    return {
      pageId,
      page: pageLabels.get(pageId) ?? pageId,
      ...spec,
    }
  })
}

function pageIntent(pageId: string, pageName: string, requiredContent: string[]): Pick<PageBlueprint, 'coreTask' | 'primaryAction'> {
  const intents: Record<string, Pick<PageBlueprint, 'coreTask' | 'primaryAction'>> = {
    'radar-home': { coreTask: '立即看见附近可发现的人，并决定继续扫描或发起碰一碰', primaryAction: '开始扫描 / 重新扫描' },
    'nearby-profile': { coreTask: '快速判断是否愿意进一步认识当前用户', primaryAction: '发起见面 / 碰一碰' },
    'bump-confirm': { coreTask: '确认线下碰一碰对象并建立好友关系', primaryAction: '确认并开始聊天' },
    'friends-chat': { coreTask: '找到最近联系人并继续一段真实对话', primaryAction: '发送消息' },
    'profile-history': { coreTask: '查看自己的社交身份、关系数据和最近足迹', primaryAction: '编辑个人资料' },
    query: { coreTask: '选择日期和城市并获得可理解的日历结果', primaryAction: '查询当天信息' },
    weather: { coreTask: '看懂目标日期的天气条件与出行影响', primaryAction: '查看穿搭建议' },
    recommendation: { coreTask: '在几秒内理解当天推荐穿搭并选定一套', primaryAction: '采用这套搭配' },
    'outfit-detail': { coreTask: '看懂一套搭配的单品组成、理由和适用场景', primaryAction: '收藏搭配' },
    wardrobe: { coreTask: '浏览自己的衣物状态并选择可用单品', primaryAction: '新增衣物' },
    home: { coreTask: '从总览中识别当前最重要的信息和下一步', primaryAction: '进入当前最重要的任务' },
    'core-action': { coreTask: '以最低操作成本完成核心录入或编辑', primaryAction: '保存并继续' },
    result: { coreTask: '比较关键结果并选择下一步', primaryAction: '采用推荐结果' },
    detail: { coreTask: '理解当前对象的状态、关键信息和可执行操作', primaryAction: '完成当前主要操作' },
    profile: { coreTask: '查看个人状态并进入最常用的账户操作', primaryAction: '编辑个人资料' },
  }
  return intents[pageId] ?? {
    coreTask: `在「${pageName}」首屏完成：${requiredContent[0] ?? '理解当前对象和状态'}`,
    primaryAction: `完成${pageName}的主要操作`,
  }
}

const BOTTOM_NAVIGATION_PAGE_IDS = new Set([
  'home', 'result', 'profile', 'radar-home', 'friends-chat', 'profile-history',
  'query', 'weather', 'recommendation', 'wardrobe',
])

function componentKindsFor(pageId: string, requiredContent: string[]): string[] {
  const kinds = ['page-header']
  const content = requiredContent.join(' ')
  if (pageId === 'radar-home') kinds.push('radar-map')
  if (pageId === 'friends-chat') kinds.push('conversation-list')
  if (pageId === 'query' || pageId === 'weather') kinds.push('calendar-grid')
  if (pageId === 'recommendation' || pageId === 'outfit-detail') kinds.push('outfit-card')
  if (/输入|填写|选择|筛选|搜索|字段|步骤/iu.test(content) || /action|confirm|edit|query/iu.test(pageId)) kinds.push('form-field', 'chip-group')
  if (/指标|统计|数量|状态|摘要|天气|完成率/iu.test(content) || /home|result|profile|weather|recommendation/iu.test(pageId)) kinds.push('stat-card')
  if (pageId !== 'friends-chat' && /列表|记录|单品|内容|用户|好友|至少 3/iu.test(content)) kinds.push('task-card')
  if (BOTTOM_NAVIGATION_PAGE_IDS.has(pageId)) kinds.push('bottom-navigation')
  kinds.push('primary-action')
  return kinds
}

export function derivePageBlueprints(idea: string, pageIds: string[]): PageBlueprint[] {
  const mockByPage = new Map(derivePageMockData(idea, pageIds).map((item) => [item.pageId, item]))
  return pageIds.map((pageId) => {
    const mock = mockByPage.get(pageId)!
    const intent = pageIntent(pageId, mock.page, mock.requiredContent)
    const kinds = new Set(componentKindsFor(pageId, mock.requiredContent))
    return {
      pageId,
      page: mock.page,
      ...intent,
      aboveFold: [
        `页面标题与当前上下文：${mock.page}`,
        ...mock.requiredContent.slice(0, 2),
        `唯一主要操作：${intent.primaryAction}`,
      ],
      semanticComponents: SEMANTIC_COMPONENT_CATALOG.filter((component) => kinds.has(component.kind)),
    }
  })
}

export function buildBrief(
  idea: string,
  answers: Record<string, CreateAnswer>,
  deferredStyleNote: string | null,
): Record<string, unknown> {
  const read = (id: string): CreateAnswer | undefined => answers[id]
  const targetQuestion = questionFor(idea, {})!
  const userQuestion = questionFor(idea, { 'target-platform': read('target-platform')! })!
  const goalQuestion = questionFor(idea, {
    'target-platform': read('target-platform')!,
    'core-user': read('core-user')!,
  })!
  const flowQuestion = questionFor(idea, {
    'target-platform': read('target-platform')!,
    'core-user': read('core-user')!,
    'core-goal': read('core-goal')!,
  })!
  const moduleQuestion = questionFor(idea, {
    'target-platform': read('target-platform')!,
    'core-user': read('core-user')!,
    'core-goal': read('core-goal')!,
    'core-flow': read('core-flow')!,
  })!
  const pageQuestion = questionFor(idea, {
    'target-platform': read('target-platform')!,
    'core-user': read('core-user')!,
    'core-goal': read('core-goal')!,
    'core-flow': read('core-flow')!,
    'core-modules': read('core-modules')!,
  })!
  const modules = read('core-modules')?.values ?? []
  const pages = read('core-pages')?.values ?? []
  const pendingDecisions: string[] = []
  const questionPairs: Array<[CreateQuestion, CreateAnswer | undefined]> = [
    [targetQuestion, read('target-platform')],
    [userQuestion, read('core-user')],
    [goalQuestion, read('core-goal')],
    [flowQuestion, read('core-flow')],
    [moduleQuestion, read('core-modules')],
    [pageQuestion, read('core-pages')],
  ]
  for (const [question, answer] of questionPairs) {
    if (answer?.values.includes('unknown')) pendingDecisions.push(`${question.text}（用户暂未决定）`)
    if (answer?.confirmed === false && answer.otherText !== undefined) pendingDecisions.push(`${question.text}（保留用户原话，暂不推断）`)
  }
  return {
    originalIdea: idea,
    targetPlatform: selectedAnswerLabels(targetQuestion, read('target-platform'))[0] ?? null,
    users: selectedAnswerLabels(userQuestion, read('core-user')),
    goal: selectedAnswerLabels(goalQuestion, read('core-goal'))[0] ?? null,
    coreFlow: {
      labels: selectedAnswerLabels(flowQuestion, read('core-flow')),
      userText: read('core-flow')?.otherText ?? read('core-flow')?.normalizedText ?? null,
    },
    modules: selectedAnswerLabels(moduleQuestion, read('core-modules')),
    moduleIds: modules,
    pages: selectedAnswerLabels(pageQuestion, read('core-pages')),
    pageIds: pages,
    components: deriveComponents(idea, modules),
    mockDataPolicy: {
      rule: '列表、聊天、图表、详情和状态组件必须展示真实示例内容，不能使用空白方框、Lorem ipsum、用户A或无含义占位符代替',
      minimumRecordsPerRepeatedComponent: 3,
      visibility: 'mock 数据必须使用首次渲染即可见的独立 text 元素；列表行需同时体现对象、状态和关键上下文',
      updateContract: '完整页面使用 rectangle 外框并设置 customData.role=prototype-page、customData.pageName 和 customData.mockDataMin；页面名使用外框上方独立 text，设置 customData.role=prototype-page-label 和 customData.pageId；页面子元素使用画布绝对坐标并保持 frameId=null；每条示例内容的 text 设置 customData.role=mock-data',
    },
    pageMockData: derivePageMockData(idea, pages),
    pageBlueprints: derivePageBlueprints(idea, pages),
    semanticComponentCatalog: SEMANTIC_COMPONENT_CATALOG,
    prototypeQualityPolicy: {
      firstScreen: '用户应在 5 秒内看懂页面核心任务、当前状态、关键内容和下一步；不能依赖空白方框或 Agent 口头解释',
      hierarchy: '每页只有一个 primary-action；标题、正文和辅助信息至少形成三级可辨层级；重复控件遵循一致的边距、高度和间距节奏',
      phasedDrawing: '首批 3 个及以上页面时，先绘制一个代表页并检查真实画板，再铺开其余页面，最后逐页做一致性复核',
      completionRule: 'writeVerified=true 只代表写入和回读一致；只有提交视觉复核证据并获得 completionReady=true，Agent 才能向用户宣布原型完成',
    },
    interactions: ['页面之间用 Arrow 表达核心成功路径', '首轮只验证默认成功路径'],
    assumptions: [
      '首轮原型限制为 3–5 个核心页面',
      '首轮只绘制默认成功路径，不展开加载、空状态和错误状态',
      '每个重复内容组件至少填充 3 条可读 mock 数据；低保真降低视觉精度，但不省略理解产品所需的信息',
      '原型使用语义化低保真，不处理品牌色、字体和视觉风格；可用克制的语义色区分类别、状态和主要操作',
      '视觉风格和前端技术实现延迟到 draw2code_generate 阶段',
      ...pendingDecisions.map((item) => `${item}；首版采用最小合理默认值，并在后续迭代中补充`),
    ],
    pendingDecisions,
    deferredStyleNote,
    pendingQuestions: [
      '加载、空状态和错误状态将在后续原型迭代中补充',
      '登录、个人中心和管理后台不属于首轮核心闭环，除非用户另行确认',
    ],
  }
}

export function interpretOther(question: CreateQuestion, text: string): string {
  const trimmed = text.trim()
  if (question.id === 'target-platform' && /小程序/iu.test(trimmed)) {
    return '首版优先做小程序，Web 作为后续扩展端'
  }
  if (question.id === 'core-flow') return `核心流程按用户描述：${trimmed}`
  return `按用户描述处理：${trimmed}`
}
