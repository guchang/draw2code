---
name: draw2code
description: Use Draw2Code or 画码 to clarify a product, draw or edit an editable prototype, open the shared canvas, or generate verified frontend pages. Activate for explicit Draw2Code/画码 mentions or a clear request to 画原型; do not activate for a generic request to build an app or write code.
---

# Draw2Code / 画码

使用 Plugin 提供的 `draw2code_*` MCP 工具，不直接读写 `draw2code/*.excalidraw.json`。首次执行前阅读 [共享 workflow contract](../../references/workflow-contract.md)，并在本任务剩余对话中保持 Draw2Code 会话语境。

## 路由

- 用户只说“打开 Draw2Code / 打开画码”：调用 `draw2code_open`。不要开始需求提问。
- 用户明确要从零设计、创建或画一个新产品原型：调用 `draw2code_create action=start`，忠实传入 idea，并基于完整语义概括简短 `projectName`。
- 用户修改现有原型：先 `draw2code_read`，再用 `draw2code_update` 提交最小 ops。
- 用户明确要求根据画板生成或重新生成页面：先用普通对话问一次“有没有参考风格的图片”；这句话不用宿主选择题。有图就先查看并概括，没有则记为 `none`，随后调用 `draw2code_generate action=start` 并传入 `referenceStyle`，继续它返回的状态机直到 completed。用户已经随请求附图时不要重复问。
- 普通“帮我做一个 App / 写一个页面”且没有 Draw2Code、画码或明确画原型意图：不要使用本 Skill。

## 交互

Create 或 Generate 返回 `question.askUserQuestionArgs` 时，用宿主原生选择题原样展示一个问题和全部选项；不得删除“直接整理项目简报”“还没想好”“其他”或推荐项。宿主没有选择题能力时，才用完整编号文本。

Create 的 `start` 返回 `discovery` 时，不要套用固定问卷。先读取 `explicitFacts`、已有回答、`recommendedDimensions` 和剩余预算；第一题优先从推荐维度前两项中选择，不得先问模块、页面或通用信息架构。普通待办先挑战具体触发场景或现有替代，雷达社交先问信任与独特连接机制，穿搭产品先问推荐依据或使用时刻。随后选择当前最影响产品成败的未知项：信息不足时调用 `propose_question`，提交基于当前产品的判断、一个决策问题、2–4 个有取舍的选项、推荐方向、决策影响和依赖。为避免 Agent 重组卡片时删掉关键信息，`question.text` 必须直接写成“判断：{insight}\n\n问题：{决策问题}”，`question.options` 除产品方向外必须显式包含 `synthesize-now / 直接整理项目简报`、`unknown / 还没想好` 和 `other / 其他`。信息足够或用户要求停止时调用 `synthesize`。最多 10 题，模块和页面由前面的产品判断推导，不能拆成两道清单题。

用户跳过当前选择题时调用 `action=skip`，该项会保留为待验证假设；用户要求立即整理时可直接 `synthesize`，不需要先机械回答当前题。`ready` 后若选择调整产品方向或首版范围，直接用 `propose_question` 追问受影响的一项，回答后重新 `synthesize` 完整简报。

Create 返回 `ready` 时，完整展示工具返回的 `briefMarkdown`，不得重新总结、缩写或另写一份简报。随后展示最后一张页面范围确认卡，明确列出将绘制的全部页面，并只提供“确认这些页面并绘制 / 调整页面范围 / 调整产品方向”；确认后的 `draw2code_update` 必须消费同一份 `brief.pages`、`pageBlueprints`、`pageMockData`、`pageRelations` 和验收要求。

`draw2code_update` 返回冲突或 `requiresConfirmation=true` 时，只询问相关覆盖选择；用户确认后用相同 ops 和 `force=true` 重试。无冲突直接继续，不增加模板化确认。Create brief 包含 3 个及以上页面时，先按 `pageBlueprints` 画一个代表页并查看真实画板，再以 `visualReview.phase=representative` 添加剩余页面；visualReview 必须携带最近一次成功 update 返回的 `boardRevision=rev` 和 `revealRequestId`。全部页面可见后查看真实画板，再用空 ops 单独提交 `phase=final`，`inspectedPageIds` 必须覆盖所有页面。

第一次确认画板、第一次读取画板，或用户要求打开时，调用 `draw2code_open`。内嵌 UI、浏览器与 headless 的选择由工具 capability detection 决定；不要自行运行 `/usr/bin/open`，也不要重复打开窗口。

## 完成口径

- Update 的 `verified=true` / `writeVerified=true` 只算写入成功；只有 `completionReady=true` 才能向用户报告整套原型完成。若 `targetBoard !== activeBoard`，说明目标文件已验证但当前画板不可见。
- Generate 只有工具返回 `status=completed` 才算完成；confirmed 只代表可以开始实现和真实预览验收。
- 保留工具返回的 `sessionId`、`revision`、brief、question、blockers 和 verification requirements，不凭对话记忆重造状态。
