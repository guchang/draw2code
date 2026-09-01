# Draw2Code 多宿主 Workflow Contract

这份契约同时约束 DSH guidance、Codex Skill 和 MCP instructions。宿主 Adapter 只负责输入、选择题与展示；Create、Update、Generate 的状态、存储、冲突和验收由共享 Runtime 决定。

## 唤醒与会话

- 仅在用户明确说 `Draw2Code`、`画码`，或意图明确为“画原型”时进入 Draw2Code。普通“做一个 App / 写一个页面”不自动拦截。
- 同一任务首次唤醒后保持 Draw2Code 会话；后续“改首页”“生成页面”不要求重复唤醒词。
- “打开 Draw2Code / 画码”“我自己画一下”“我画个示意给你”由独立 `draw2code-open` 快速入口处理，只调用一次 `draw2code_open`：不读取本契约的其余工作流，不调用其他 Draw2Code 工具，不进入代表页复核或质量门禁；有 active board 就恢复，没有则展示空状态与创建入口。
- “我画好了”“按我画的看看”先调用 `draw2code_read` 读取当前可见画板并复述页面、组件和交互；用户没有要求时不自动修改或生成。

## 工具顺序

- 新产品先走 `draw2code_create` 的可恢复状态机。`start` 返回 `discovery` 后，Agent 根据已明确事实、历史回答和 `recommendedDimensions` 选择当前最高影响的未知项；第一题必须优先采用推荐维度，不能先问模块、页面或通用信息架构。普通待办优先深挖触发场景或现有替代，雷达社交优先深挖信任与独特连接机制，穿搭产品优先深挖推荐依据或使用时刻。信息不足时调用 `propose_question`，每次只展示一个带 insight、取舍说明和推荐项的结构化问题；信息足够或用户要求停止时调用 `synthesize`。禁止固定询问平台、用户、目标、流程、模块和页面，最多提问 10 次。
- `synthesize` 提交一份结构化 `PrototypeBrief`；工具校验后确定性生成完整 `briefMarkdown`、`pageBlueprints` 和 `pageMockData`。`ready` 时必须完整展示该 Markdown，不能自行缩写；随后用最后一张页面范围确认卡明确列出将绘制的页面，只进行一次“确认这些页面并绘制 / 调整页面范围 / 调整产品方向”确认。
- 每道原生问题卡片都保留“直接整理项目简报”；选择后按 `synthesize-now` 回答，工具明确返回 `nextAction=synthesize`。用户跳过当前问题时调用 `skip` 并把该项保留为待验证假设；即使已有待答问题也可调用 `synthesize`。`ready` 后选择调整时直接调用 `propose_question` 追问受影响的一项，旧简报失效，回答后必须重新生成完整简报。
- Create 返回 `confirmed` 后，按 `boardName`、同一份 `brief` 和结构化 `drawingPlan` 调用 `draw2code_update`。当 `drawingPlan.nextActionCode=write_representative` 时，本轮只为 `allowedPageIds` 生成 ops，不能预先构造全部页面。代表页写入后等待 Canvas 消费返回的 reveal，再以 `action=review`、`reviewToken`、`phase=representative`、`passed=true`、`inspectedPageIds` 和 `observations` 单独记录可见复核；review 不传 ops、不改变 revision、不发布新 reveal。工具返回 `nextActionCode=write_remaining_pages` 后才生成 `remainingPageIds`。如果 Agent 误在复核前提交其余页面，工具返回 `nextActionCode=review_representative` 和 `pendingUpdateId`，并保留该批 ops；完成代表页复核后用 `action=commit_pending` 和该 ID 提交，不重新生成或重传 ops。全部页面完成后用 `action=review`、`phase=final` 覆盖所有 page id。旧 `visualReview` 只保留兼容；新流程不手工拼 `rev` 与 `revealRequestId`。已有画板修改必须先 `draw2code_read` 再 `draw2code_update`。
- 省略 `board` / DSH 的 `name` 始终表示用户当前可见 active board。只有用户明确点名另一块画板时才显式传入。
- MCP/Codex 从 workspace 内的子目录调用时，所有画板操作统一归到宿主注册的 workspace root；不能因当前 cwd 是子仓库而悄悄创建第二套画板。
- Update 返回 `requiresConfirmation=true` 时停止写入并只询问冲突覆盖；得到确认后才以 `force=true` 重试。不得直接写 `.excalidraw.json` 绕过 CAS、布局门禁和回读验证。
- Generate 开始前先用普通对话询问用户是否有参考风格图片，不使用宿主选择题；用户已附图时不重复问。有图则查看后把简洁摘要或路径传为 `referenceStyle`，没有则传 `none`。随后必须沿用工具返回的 session、revision、question 与 confirmation；第一张结构化选择题仍然是页面多选，只有 `status=completed` 且验证证据通过后才能报告生成完成。

## 展示与共同编辑

- MCP/Codex 的 `draw2code_open` 默认使用 `presentation=handoff`，不注册静态 `openai/outputTemplate`，也不把动态 localhost 画板套进 MCP App iframe。工具只准备短期 URL 并返回 `displayState=handoff-ready`；`auto` 与 `inline` 仅作为兼容别名，同样回退到 handoff。只有用户明确要求外部浏览器时才使用 `presentation=browser`。
- 宿主负责把 handoff URL 导航到自己的侧边栏或浏览器并验证可见性。单纯导航优先使用宿主原生能力，不为此初始化通用浏览器自动化；只有需要 DOM、控制台或交互证据时才接管浏览器。只有画布真正可见后，Agent 才能报告“已打开”；不能把 URL 就绪或 daemon 启动成功当作可见性证据。若未来需要对话内嵌画板，必须单独实现直接运行 Canvas 的 MCP App，不能恢复动态 localhost iframe 壳。
- 同一 workspace 的外部浏览器只首次打开一次；后续复用现有标签页并依靠事件刷新，不能反复抢焦点。
- `verified=true` / `writeVerified=true` 只证明目标画板写盘并回读，不代表原型已经完成。成功 write 会把目标设为 active board、发布带目标 revision 的 reveal request、返回不透明 `reviewToken` 并自动打开画码；Canvas 实际加载到同一 board + revision 后才回传消费确认。`action=review` 只记录该可见版本的 review receipt，返回 `reviewVerified=true`，不会写画板或发布新 reveal；重复提交同一 token 是幂等的。只有 final review 返回 `completionReady=true` 才说明最终视觉复核已覆盖全部页面，即使如此，仍应把 `prototypeQuality.warnings` 作为继续打磨依据。
- 用户拖动产生的 scene write 与 Agent update 都通过 daemon；WebSocket 是主通知通道，revision polling 是断线降级。
- 独立画码可以列出当前 workspace 和本机已由宿主明确注册、持久化且确实含有画板的其他 workspace；插件缓存和空 root 不进入切换菜单。切换前必须先落盘当前待保存编辑，再用当前短期会话换取目标 root 的新 workspace-scoped token。旧 token 不能直接访问目标 root，Agent 工具默认范围也不能因为 UI 切换而扩大。

## 数据与安全

- 原位使用 `draw2code/`、`.active-board.json`、`.projects/`、`.generations/`、`.generate-settings/` 与 `draw2code-pages/`，不得复制、导入或主动迁移旧数据。
- 所有 root 都必须 realpath 后落在 HostContext 注册 workspace 内。daemon 只监听 loopback；主 bearer 不进入画板页面，页面只收到短期、活动续期的 workspace-scoped token，可在该 root 内管理多个画板但不能跨 root 访问。
- 不上传画板、brief、页面或验证证据。单画板元素数、UTF-8 byte 上限、历史版本与生成证据门禁保持有效。
- 不递归扫描整台电脑寻找 workspace，也不自动复制、合并或迁移不同 root 的画板；新打开的画码只获得打开当时已注册 workspace 的快照。
