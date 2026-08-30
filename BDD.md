# dsh-draw2code BDD 验收说明

`features/draw2code.feature` 面向插件的真实协作契约：workspace 门禁、`draw2code_create` 的自适应产品深挖与可执行项目简报、项目草稿与版本、确认后独立画板、agent 工具、冲突确认、场景持久化、客户端挂载同步、画板切换，以及 `draw2code_generate` 从页面范围选择到真实预览验收的完整产品流程。它不把 Excalidraw 的坐标或 React 内部 ref 当作用户行为。

独立画码额外维护一份用户级“已明确注册工作区”清单：菜单按 root 分组展示原位画板，切换前先保存当前编辑并换取目标 root 的新短期凭据。旧凭据仍不能直接跨 root 读取，Agent 默认操作范围也不随浏览器切换扩大；工具不会扫描整台电脑，也不会自动迁移或合并历史画板。

## 已实现并通过真实宿主验收 — `draw2code_generate` 产品流程

完整决策见 `GENERATE_PRODUCT_FLOW.md`。本节既是产品契约，也是当前实现的验收口径。

### 职责边界

- generate 只负责把用户选定的原型页面转换成经过预览验收的单文件 HTML Demo；不搭建正式前端工程，也不接管生成后的长期修改。
- create 不是强制前置条件：有简报则继承，没有简报则从画板建立生成简报。
- 每次生成都展示全部可识别页面让用户选择；新页面来自语义化 rectangle 页面外框，旧命名 Frame 继续兼容。系统智能推荐并将推荐项置顶、显式标记和解释原因。宿主支持预选时可默认勾选；当前 DSH 不支持预选，因此不能伪装成已选择，用户始终拥有最终范围控制权。
- 首次生成选择整体视觉方向，后续默认继承；不把颜色、字体、圆角和阴影拆成参数问卷。
- 用户只选择一个整体视觉方向，工具在内部把它展开为气质、背景、主操作、语义色、密度、字体层级、布局策略、动效和视觉焦点，不增加额外问答。
- 移动端或桌面端优先从统一页面边界尺寸推断，只有混合布局等真实歧义才询问。

### 原型门禁与确认

- 页面无法理解、核心流程断开、关键操作或 mock 数据缺失属于阻断问题，必须先回画板补齐。
- Agent 自动补齐也要先更新画板并让用户看到，不能只在 HTML 中增加产品内容。
- 次要图标、动画和非核心状态属于非阻断提醒，只在最终简报说明默认值。
- 页面范围、视觉方向和原型检查完成后，只展示一次生成简报并确认，不逐项复述。最终确认使用可点击的“确认生成 / 修改页面范围 / 修改视觉方向”选项，不要求用户手动输入“确认”；修改时只返回对应选择，不重问其他已完成项。

### 输出和完成标准

- 始终输出统一入口的单文件 HTML，不询问技术栈，也不创建 generate 版本历史。
- 画板定义页面、信息层级、文案、mock 数据、组件语义和交互关系；前端使用内容流、CSS Grid/Flex 与响应式约束重新排版，不复制 Excalidraw 绝对坐标。
- 可以补充让已有交互可用的通用反馈，但不能自行发明页面、模块、流程或重大业务规则。
- 生成后自动打开预览、逐页截图、检查目标视口、控制台、DOM、溢出、裁切、按钮居中和底部导航，并实际走通核心流程。
- `action=complete` 必须提交结构化 `verificationEvidence`；工具会用 `outputSha256` 把本地预览绑定到当前生成入口，用 `captureId` 关联同次截图和 DOM 快照，并读取 workspace 内带 SHA-256 的 PNG/DOM 产物，核对视口尺寸与原型关键文案。缺少逐页证据或多页面切换证据、控制台存在 error/warning、布局或交互检查失败时不得进入 completed。
- 生成页面必须保留稳定的 `d2c-page` 起止注释；重新生成时工具直接比较未选页面块哈希，选择全部页面时不要求不存在的“未选页面”证据。
- 实现问题由 Agent 自动修复和复验，产品变化才询问用户。
- 中断后恢复已完成的选择，不交付未验收的半成品。
- 验收通过后 generate 结束，普通修改回到日常协作；只有用户明确要求重新生成时才开启新一轮。

### 产品级实施顺序

1. 准备与选择：事实继承、全页面多选、智能推荐与视觉方向。
2. 原型门禁：阻断/提醒分级、回画板补齐和流程恢复。
3. 统一确认：生成简报和已有内容保护。
4. 生成与验收：单文件产物、自动预览、核心流程验证和自动修复。
5. 中断与收口：恢复准备状态、禁止半成品冒充完成、验收后结束 generate。

## 本轮新增 — `draw2code_create`

### 工具职责

- `draw2code_create` 是新项目意图的入口，不是 grilling 完成后的收尾工具。
- `action=start` 创建 `draw2code/.projects/<projectId>.json` 草稿并返回 discovery：已明确事实、待解决维度、历史决策和最多 10 题的剩余预算；不会创建画板。
- 信息不足时 Agent 用 `action=propose_question` 提交产品专属 insight、一个决策问题、2–4 个有真实取舍的选项、推荐方向、决策影响和依赖；模型再调用宿主 `ask_user_question` 原样展示。禁止固定依次询问平台、用户、目标、流程、模块和页面。
- `action=answer` 记录一个选择后返回 discovery；`action=skip` 把当前题保留为待验证假设。信息足够或用户要求停止时，Agent 用 `action=synthesize` 提交结构化 `PrototypeBrief`，即使当前题尚未回答也不会卡住。
- 工具校验 `PrototypeBrief` 后确定性生成完整 `briefMarkdown`、`pageBlueprints` 和 `pageMockData`，三者来自同一事实来源。ready 阶段必须完整展示 Markdown，只做一次统一确认。
- 选择“其他”后直接记录自由文字并继续下一题；ready 项目简报是唯一统一确认点，不再逐项复述用户原话。
- `action=confirm` 只在项目简报 ready 且用户确认后创建独立空画板，并把 active-board 指针切到新画板；随后模型必须调用 `draw2code_update`。
- 项目简报和画板是两种事实：简报记录产品意图，画板记录当前可见原型；确认前不写画板，用户删除的画板内容不能由简报自动恢复。

### 草稿状态与可靠性

- `draft`：用户中断或沉默时保持不变，不猜测暂停/取消。
- `ready`：核心问题已完成，等待用户确认简报。
- `confirmed`：需求已确认，独立画板已经创建，等待 `draw2code_update`。
- `abandoned` / `archived`：只有用户明确选择对应动作才进入。
- 每个项目有 `revision`；旧 revision 返回 `stale_revision`，不会覆盖最新草稿。
- 同一 mutation 重试返回缓存的幂等结果，不重复追加回答或推进问题。
- 项目草稿写入前会归档旧版本到 `draw2code/.projects/.versions/<projectId>/`。

### 已实现的自适应 SOP 与项目简报

每轮从触发场景、现有替代、核心结果、独特机制、使用闭环、关键风险和首版验证中选择当前影响最大的一项；用户已经说清楚的信息不重复问，模块和页面由产品判断推导后在最终简报统一确认。简单产品通常 3–5 题，复杂产品最多 10 题；预算按完整问题历史计算，修改答案不会刷新额度。“还没想好”或跳过记录为待验证假设，不理解为暂停或取消；原生问题卡片始终提供“直接整理项目简报”，避免输入框被卡片隐藏后无法停止。视觉风格不在原型阶段应用，主动提供的 `styleNote` 延迟给 `draw2code_generate`。

`PrototypeBrief` 必须完整包含产品定义、首版包含与排除范围、原型布局、逐页目标与具体结构、每页至少 3 条真实 mock 数据或表单字段、关键状态、页面关系、原型表达原则、验收方式和默认假设。工具据此生成可直接给用户阅读的 Markdown，以及 `draw2code_update` 使用的页面蓝图和 mock 数据蓝图；列表、聊天、图表、详情和状态组件不能以空白方框、Lorem ipsum、“用户A”“标题”“内容”等占位。

### 本轮新增 — 低保真原型可读性与语义修复

- `draw2code_update` 把落盘正确性与产品原型质量拆开：兼容字段 `verified` 与规范字段 `writeVerified` 只证明写入及回读一致；`prototypeQuality` 单独报告结构、内容、布局、质量分和 warnings；只有最终 `visualReview` 覆盖全部页面后才返回 `completionReady=true`。
- 空白过多、首屏信息不足、文字层级平、主操作不清、状态无强调、边框滥用、点击区域过小、页面边距或重复控件节奏不一致，会以可执行的质量 warning 返回，不再把“写进去了”误当成“画好了”。
- 首次批量创建 3 个及以上页面会返回 `visual-review-required`；Agent 必须先画一个代表页、在真实画板检查后再铺开剩余页面，并在最后逐页复核。`visualReview` 与最近一次 update 的 `rev`、`revealRequestId` 绑定，且 Canvas 必须已经实际加载并确认同一 board + revision；旧证据不能重放，最终复核必须在写入完成后的独立空 ops 调用中提交。

- `draw2code_update` 除规范的 `{op:"upsert",element:{...}}` 外，也接受直接元素、省略 `op` 的 `element` 包装和字段平铺的 `upsert`；只对同时具有非空 `id + type` 的无歧义输入做兼容，不猜测 bare id 是删除还是修改。`op=delete` 时也兼容 `elementId` 和 `element.id`，避免 Agent 只因移动 id 字段重发整批修改。
- 同一批对相同元素 id 的多次操作按最终净结果读回验证：`upsert→delete` 期望元素不存在，`delete→upsert` 期望最终元素存在；不会因临时中间态已经被后续操作覆盖而误报失败。
- 带 `frameId` 的子元素若原坐标无法落入 frame、而加上 frame 左上角后能完整落入，会被安全识别为 frame 局部坐标并换算为画布绝对坐标；已经正确的绝对坐标保持不变，含义不明确的坐标仍由 `layout-invalid` 阻止写盘。
- 读回校验认可工具自身执行的组件语义对齐修复；例如 Chip 标签从 `left/top` 规范为 `center/middle` 后仍返回 `verified=true`，不会在数据已经落盘后误报失败并诱发重复覆盖。
- `draw2code_update` 写盘前会检查多行或预计换行的 `text` 是否有足够高度；失败返回 `layout-invalid`，不写入半截组件。
- `rectangle`、`diamond`、`ellipse` 不再允许携带依赖 Excalidraw 形状文字的 `text`；按钮、卡片和输入框文案必须使用独立的 `text` 元素。
- `bottom-navigation` 必须使用 `customData.role=bottom-navigation` 的矩形 shell 加独立标签，并位于页面底部安全区；空 shell、互相重叠的栏目和普通一行“底部导航：...”文字都会被拒绝。
- 页面内组件不得越过页面边界；成功写入后工具仍会返回 `layoutWarnings`，让模型能发现旧画板中已有的视觉问题。
- 预检只阻塞本次 Agent 更新涉及的元素；用户已有的旧问题会作为提醒返回，不会阻塞用户继续手工编辑。
- `draw2code_create action=start` 要求 Agent 基于完整需求先概括并显式传入语义化 `projectName`；工具不再用正则、关键词或前 N 字裁剪从原话造名称，只做合法性校验。确认后的画板名直接使用 `projectName`，不追加“原型”后缀；完整 `idea` 仍保存在项目草稿和简报中。
- `draw2code_update` 会把 text 的 `containerId` 补成 Excalidraw 完整双向绑定；普通读取、打开画板和客户端写回不会借机改写既有故障样本。
- Agent 新增绑定文字的组件时必须用 `customData.role` 声明按钮、选择框、输入框、Chip、卡片等产品语义；缺失时返回 `component-role-missing`，不再把未知控件静默写成左上对齐。
- `button`、`primary-action`、`chip`、`tab`、`bottom-navigation-item` 等操作型文案不只规范为 `center/middle`，还会把文字盒缩至真实行高，并按外框几何重新计算垂直中心；`input`、`select`、`dropdown`、`search-field` 等表单值保持 `left/middle`，不会为了修按钮而误改输入内容。
- 底部导航 shell 内的每个独立标签必须设置 `customData.role=bottom-navigation-item`；缺失时返回 `bottom-navigation-item-role-missing`。即使 Agent 错把多个栏目文字都绑定到 shell，update 也会将其修复为独立文字、保留各自槽位并按 shell 垂直居中；空 shell 返回 `bottom-navigation-items-missing`，栏目重叠返回 `bottom-navigation-item-overlap`。
- 新页面归属通过 prototype-page rectangle 的几何范围判断，页面子元素保持 `frameId=null`；`containerId` 只用于形状的唯一绑定标签。旧 Frame 画板仍保留 `frameId` 兼容，若旧 Agent 错把 text 的 `containerId` 指向 frame，update 仍会原子修复为 `containerId=null` 与对应 `frameId`。
- 原型不询问品牌视觉，但允许形状用 `customData.tone` 表达 primary、success、warning、danger、info、neutral 六种语义；使用浅底色和对应描边，且不覆盖显式颜色。
- 完整新页面使用普通 rectangle 外框，设置 `customData.role=prototype-page`、`customData.pageName` 和 `customData.mockDataMin`；外框上方独立 text 使用 `role=prototype-page-label` 与 `pageId`。承载示例记录的可见 text 使用 `role=mock-data`。数量不足或只写无意义占位符时返回 `mock-data-insufficient`，整批更新不落盘。
- 新页面组件不成组、不设 `frameId`，优先保证用户可以直接点选编辑；移动整页需要用户框选页面内容。用户在两个新页面之间手绘 Arrow 时，箭头保持画布级并完整显示，不受页面矩形裁切。
- `draw2code_read` 返回规范字段 `pageNames`、`pages` 和 `pageRelations`，跨页箭头不混入任一页面 UI 内容；deprecated `frameNames` 返回相同页面名供旧调用兼容。
- `draw2code_generate` 使用 `pages` 作为规范范围参数，`frames` 仅作兼容别名；两者同时传入但内容不一致时返回 `page-scope-conflict`。
- 页面矩形重叠导致普通元素同时落在多个页面时返回 `page-membership-ambiguous` warning，不移动或重写用户元素。
- 页面名称重复时读取返回 `page-name-duplicate`，generate 拒绝按名称猜测页面；用户需要先把页面改成唯一名称。

## 当前审查结论

### 已修复 — `replace` 操作在工具层丢失 `scene`

`src/tools.ts` 的 `parseUpdateOps()` 现在会把 `replace.scene` 传递到 `SceneStore`，因此 `draw2code_update` 的整页替换可以继续进入统一归一化、原子写入和读回验证流程。

修复前的复现证据是：upsert 首次调用返回 `verified: true`；随后同一画板的 replace 返回：

```text
bad-ops: ops[0] is "replace" but missing its scene
```

### 已修复 — 场景写回破坏箭头和链接元数据

`normalizeElement()` 现在会保留合法的 `link`、`startBinding`、`endBinding`、`startArrowhead`、`endArrowhead` 和 `lastCommittedPoint`；缺失或类型不合法的值仍使用安全默认值。浏览器和 agent 继续共享归一化流程，但不会再清空完整 Excalidraw 元素的连接语义。

回归测试现在写入带 `startArrowhead: "arrow"`、`endArrowhead: "triangle"`、双向 binding 和 `https://example.com/prototype` 的 arrow，并断言磁盘读回值保持不变。

### 已修复 — 删除当前活动画板后的旧画面/复写窗口

删除流程现在会阻止新的 debounce save、等待已发出的同板保存完成，再调用 DELETE；删除当前活动画板且没有其他画板时会强制重置 board state，即使 fallback 名称仍是 `prototype` 也不会因为同名提前 return。建议后续在真实宿主中补一条删除活动画板的 UI 回归场景。

### 已修复 — 防抖保存使用了错误的版本基线，可能复活删除内容

原实现只把待保存的 `name + elements` 放进队列，定时器触发时重新读取 `revRef.current`。如果用户删除后 Agent 恰好先写入，用户的旧场景就可能带着 Agent 的新 revision 直接覆盖回去，表现为“Agent 画完的页面消失”或“刚删掉的模块又出现”。

现在每个防抖编辑 burst 会锁定首次编辑时的 `baseRev + baseElements`；后续指针事件只更新候选元素，不移动 compare-and-swap 基线。冲突合并已抽到 `src/client/sync.ts`，并在一次写入发生连续冲突时最多继续重试 3 次，每次都重新读取当前场景后做三方合并。回归覆盖了“用户删除 + Agent 新增页面 + 两次连续冲突”，确认删除内容不会复活、Agent 新增会保留。

### 已修复 — Agent 成功写入但用户看不到：当前画板不再只存在 localStorage

原实现把当前画板名只存在浏览器 `localStorage`，host 侧工具不知道用户正停在哪一块画板；工具调用如果默认写 `prototype`，可以得到磁盘 `verified=true`，但用户眼前可能正在看“顾客端”。

现在浏览器通过 loopback `/api/draw2code/active-board` 将当前画板同步到 workspace 的 `draw2code/.active-board.json`。`draw2code_update`、`draw2code_read` 和 `draw2code_generate` 省略 `name` 时使用这个共享指针。更新在写入并回读验证成功后会选中目标画板、发布绑定 board + revision 的一次性 reveal request，并由常驻客户端监听器自动打开或激活“画码”；Canvas 实际加载该 revision 后才回执，冲突、布局失败和重复轮询不会触发抢焦点。

### 已修复 — host 重启后没有快照会放行已有元素覆盖

`boardCache` 是运行时内存状态，host 重启后为空。旧逻辑在没有快照时会放行对已有 id 的 upsert/delete，无法区分 Agent 自己的旧元素和用户刚改过的元素。现在无快照时只有新增 id 可以直接执行；任何触碰已有 id 的操作都进入确认流程，避免重启把协作保护降级成静默覆盖。

### 已修复 — Agent 把 frame 标题写入 text 时页面生成找不到 frame

实际 Harness 回归中，Agent 传入的 frame 使用了 `text` 而不是 Excalidraw 的 `name`。归一化现在在 `name` 为空时把已写入的 `text` 作为 frame name，保持画框可见性的同时让 `draw2code_generate(frames=[...])` 能按页面名找到它。

## 已验证事实

- `npm run typecheck` 通过。
- `npm run build` 通过，并生成 `dist/index.js` 与 `lib/client.js`。
- `npm test` 通过：当前 100 个 Node 内置回归测试全部通过，覆盖无 Frame 页面外框与外部标题契约、跨页箭头及绑定文案归类、绑定优先级、同页箭头端点归属、用户手绘箭头保护、mock 数据增量删除门禁、重复页面名拒绝、rectangle/legacy Frame 混合画板、`pages`/`frames` 兼容冲突、update 参数容错、同批净结果校验、legacy Frame 局部坐标安全换算、按钮文字真实几何居中、底部导航门禁、同步协调、删除不复活、UTF-8 容量限制、当前画板目标解析、自动 reveal、create grilling、原型质量门禁和 generate 恢复/验收流程。
- 项目包含 Node 内置回归入口和 `features/draw2code.feature` BDD 契约。
- DeepSeek Harness 的真实界面已加载 `画码` 标签页，当前能看到 `prototype` 画板、`新画板` 菜单入口、Excalidraw 工具栏和原型文字元素；这证明插件注册与非空画板挂载路径至少可达。
- 重新启动 `dsh web` 后，`GET /api/draw2code/active-board?root=<workspace>` 与 `GET /api/draw2code/reveal-request?root=<workspace>` 均能从真实 host 返回成功 envelope；仅刷新网页不足以重装 host bundle。
- Harness 真实删除回归确认：用户删除与 Agent 新增发生并发冲突时，旧内容不会复活，Agent 新增内容仍会保留并显示。
- Harness 最终 update 回归确认：新画板“更新容错回归三”只调用一次 `draw2code_update`，14 个 ops 一次应用并返回 `verified=true`；frame 局部坐标、Chip `left/top` 到 `center/middle` 的语义修复、嵌套 delete，以及同批 `upsert→delete` 均未触发重试。活动画板 API 返回该画板，磁盘读回为 12 个元素且 `temp-note` 不存在，真实画布可见“任务详情页”和三条检查项。
- 无 Frame 真实协作回归确认：真实 DSH 0.3.0 在“无Frame回归”画板显示两个 `prototype-page` rectangle，页面内元素均为 `frameId=null`。用户通过 Excalidraw 箭头工具从“查看详情”按钮手工拖到第二页目标卡片，箭头完整跨过两个页面边界，磁盘读回 `frameId=null`、双端 binding 完整，`draw2code_read.pageRelations` 正确返回“任务列表 → 任务详情”。
- 用户改动保护确认：用户又在真实画布把“评审需求文档 · 14:00”改为“评审需求文档 · 15:00”，随后 Agent 只新增“明天 10:00 复盘”组件；`draw2code_update` 返回 `verified=true`，读回确认手工文案、跨页箭头及其 binding 均未被覆盖，真实画布也同时可见三者。
- Legacy Frame 兼容确认：真实 workspace 的“小猪清单”仍被读取为 5 个 `legacy-frame` 页面，deprecated `frames` 参数可以启动 generate 的 `page-scope` 选择；调用前后原画板 SHA-256 均为 `5307fa45aa5193d2d8c82245492261c8ae6fdd9726debda59fcdbb164bae6d36`，没有自动迁移或重写。

## 验收边界

电脑验收与 host 测试承担不同证据：真实 Harness 已覆盖插件加载、普通矩形页面显示、用户手绘跨页箭头、手工文字修改、Agent 增量更新和 legacy Frame generate 兼容；`npm test` 继续覆盖 replace、元数据保留、冲突合并和 workspace 安全边界。客户端删除活动画板仍建议后续补一条独立 UI 自动化场景。
