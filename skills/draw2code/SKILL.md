---
name: draw2code
description: Use Draw2Code or 画码 to clarify a product, draw or edit an editable prototype, review a board, or generate verified frontend pages. Activate for explicit requests to design, draw, edit, review, or generate with Draw2Code; when opening the canvas is the whole request, use draw2code-open instead. Do not activate for a generic request to build an app or write code.
---

# Draw2Code / 画码

使用 Plugin 提供的 `draw2code_*` MCP 工具，不直接读写 `draw2code/*.excalidraw.json`。首次执行前阅读 [共享 workflow contract](../../references/workflow-contract.md)，并在本任务剩余对话中保持 Draw2Code 会话语境。

## 路由

- 用户说“我画好了 / 按我画的看看 / 根据这个示意继续”：先调用 `draw2code_read` 读取当前可见画板并复述页面、组件和交互关系；用户没有要求修改或生成时，不要自行调用 Update 或 Generate。
- 用户明确要从零设计、创建或画一个新产品原型：调用 `draw2code_create action=start`，忠实传入 idea，并基于完整语义概括简短 `projectName`。
- 用户修改现有原型：只调用一次 `draw2code_read`，先看 `capacity` 与 `continuation`，再用 `draw2code_update` 提交最小 ops。不要搜索会话历史寻找旧 token；只有当前任务确实在恢复同一批暂存写入时才执行 `continuation.nextAction`，新的独立小改动直接按最新画板继续。
- 用户明确要求根据画板生成或重新生成页面：先用普通对话问一次“有没有参考风格的图片”；这句话不用宿主选择题。有图就先查看并概括，没有则记为 `none`，随后调用 `draw2code_generate action=start` 并传入 `referenceStyle`，继续它返回的状态机直到 completed。用户已经随请求附图时不要重复问。
- 普通“帮我做一个 App / 写一个页面”且没有 Draw2Code、画码或明确画原型意图：不要使用本 Skill。

## 交互

Create 或 Generate 返回 `question.askUserQuestionArgs` 时，用宿主原生选择题原样展示一个问题和全部选项；不得删除“直接整理项目简报”“还没想好”“其他”或推荐项。宿主没有选择题能力时，才用完整编号文本。

Create 的 `start` 返回 `discovery` 时，不要套用固定问卷。先读取 `explicitFacts`、已有回答、`recommendedDimensions` 和剩余预算；第一题优先从推荐维度前两项中选择，不得先问模块、页面或通用信息架构。普通待办先挑战具体触发场景或现有替代，雷达社交先问信任与独特连接机制，穿搭产品先问推荐依据或使用时刻。随后选择当前最影响产品成败的未知项：信息不足时调用 `propose_question`，提交基于当前产品的判断、一个决策问题、2–4 个有取舍的选项、推荐方向、决策影响和依赖。为避免 Agent 重组卡片时删掉关键信息，`question.text` 必须直接写成“判断：{insight}\n\n问题：{决策问题}”，`question.options` 除产品方向外必须显式包含 `synthesize-now / 直接整理项目简报`、`unknown / 还没想好` 和 `other / 其他`。信息足够或用户要求停止时调用 `synthesize`。最多 10 题，模块和页面由前面的产品判断推导，不能拆成两道清单题。

用户跳过当前选择题时调用 `action=skip`，该项会保留为待验证假设；用户要求立即整理时可直接 `synthesize`，不需要先机械回答当前题。`ready` 后若选择调整产品方向或首版范围，直接用 `propose_question` 追问受影响的一项，回答后重新 `synthesize` 完整简报。

Create 返回 `ready` 时，完整展示工具返回的 `briefMarkdown`，不得重新总结、缩写或另写一份简报。随后展示最后一张页面范围确认卡，明确列出将绘制的全部页面，并只提供“确认这些页面并绘制 / 调整页面范围 / 调整产品方向”；确认后的 `draw2code_update` 必须消费同一份 `brief.pages`、`pageBlueprints`、`pageMockData`、`pageRelations` 和验收要求。

`draw2code_update action=write` 返回冲突或 `requiresConfirmation=true` 时，只询问相关覆盖选择；用户确认后用相同 ops 和 `force=true` 重试。无冲突直接继续，不增加模板化确认。Create brief 包含 3 个及以上页面时，严格执行 confirmed 返回的 `drawingPlan`：本轮只为 `allowedPageIds` 生成代表页 ops，禁止预先生成整套大 JSON。写入后等真实画板消费 reveal，再用 `draw2code_update action=review`，传入返回的 `reviewToken`、`phase=representative`、`passed=true`、代表页 id 和可见观察；review 不传 ops，也不会改变 revision 或发布新 reveal。收到 `nextActionCode=write_remaining_pages` 后才生成 `remainingPageIds`。如果工具返回 `pendingUpdateId`，说明误提前提交的剩余页面 ops 已被保存；完成代表页复核后调用 `action=commit_pending` 并只传该 ID，禁止重新生成或重传大 JSON。全部页面可见后，再用 `action=review`、`phase=final` 覆盖所有页面 id。旧 `visualReview` 只为兼容，不在新流程手工拼 `boardRevision` 或 `revealRequestId`。

`draw2code_read` 与 `draw2code_open` 返回精确 `usedBytes`、`remainingBytes` 和当前 `continuation`。生成大批 ops 前先看容量；若 Update 返回 `nextActionCode=reduce_update_scope`，按 `nextActionParams` 拆成较小的独立批次，不要重建原批 JSON。`update.timings` 只统计工具内部读盘、预检、写盘、验证和发布，不包含工具调用前的 Agent 推理时间。已有 3 页以上画板的独立小改动不需要重新完成首次代表页门禁。

第一次确认画板、第一次读取画板，或用户要求打开时，调用 `draw2code_open`。MCP/Codex 默认返回 `presentation=handoff` 的短期 URL，不生成对话内嵌卡片；只有用户明确要求外部浏览器时才传 `presentation=browser`。不要自行运行 `/usr/bin/open`，也不要重复打开窗口。

用户要亲自绘制且宿主提供侧边栏浏览器时，以 `presentation=handoff` 调用 `draw2code_open`。优先复用同一 workspace 的画码标签页并依靠事件刷新；没有时才打开工具返回的短期 `url`。单纯打开或切换 URL 时优先使用宿主原生打开/导航能力，不要为此初始化通用浏览器自动化；只有需要检查画布 DOM、控制台或交互且没有更轻量证据时才接管浏览器。确认标签页已经显示目标画板且画布真正可见后，才能告诉用户“画码已经在侧边栏打开”。若只得到 `displayState=handoff-ready`，但侧边栏未显示，不得把“URL 已准备”误报成“已打开”；无法自动展示时应返回可点击 URL。没有 active board 时展示画板选择器或空白画布，不进入 Create。

## 完成口径

- Update 的 `verified=true` / `writeVerified=true` 只算写入成功；只有 `completionReady=true` 才能向用户报告整套原型完成。若 `targetBoard !== activeBoard`，说明目标文件已验证但当前画板不可见。
- Generate 只有工具返回 `status=completed` 才算完成；confirmed 只代表可以开始实现和真实预览验收。
- 保留工具返回的 `sessionId`、`revision`、brief、question、blockers 和 verification requirements，不凭对话记忆重造状态。
