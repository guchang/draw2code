# Draw2Code 多宿主 Workflow Contract

这份契约同时约束 DSH guidance、Codex Skill 和 MCP instructions。宿主 Adapter 只负责输入、选择题与展示；Create、Update、Generate 的状态、存储、冲突和验收由共享 Runtime 决定。

## 唤醒与会话

- 仅在用户明确说 `Draw2Code`、`画码`，或意图明确为“画原型”时进入 Draw2Code。普通“做一个 App / 写一个页面”不自动拦截。
- 同一任务首次唤醒后保持 Draw2Code 会话；后续“改首页”“生成页面”不要求重复唤醒词。
- “打开 Draw2Code / 画码”只调用 `draw2code_open`：有 active board 就恢复；没有则展示空状态与创建入口，不能擅自开始 Create。

## 工具顺序

- 新产品先走 `draw2code_create` 的可恢复状态机。每次只展示返回的一个结构化 question；优先使用宿主原生选择题，只有宿主不支持时才退化为完整编号文本。
- Create 返回 `confirmed` 后，按 `boardName`、`brief.pageBlueprints` 和 `brief.pageMockData` 调用 `draw2code_update`。首轮有 3 个及以上页面时先画一个代表页并在可见画板检查，再带 `phase=representative` 的 `visualReview` 添加其余页面；复核必须携带最近一次 update 返回的 `rev` 与 `revealRequestId`，不能重放旧结果。全部页面完成后用空 ops 提交覆盖所有 page id 的 `phase=final` 复核。已有画板修改必须先 `draw2code_read` 再 `draw2code_update`。
- 省略 `board` / DSH 的 `name` 始终表示用户当前可见 active board。只有用户明确点名另一块画板时才显式传入。
- Update 返回 `requiresConfirmation=true` 时停止写入并只询问冲突覆盖；得到确认后才以 `force=true` 重试。不得直接写 `.excalidraw.json` 绕过 CAS、布局门禁和回读验证。
- Generate 必须沿用工具返回的 session、revision、question 与 confirmation；只有 `status=completed` 且验证证据通过后才能报告生成完成。

## 展示与共同编辑

- 第一次创建、读取或用户明确打开时展示画板：支持 MCP UI 就内嵌；否则本地图形环境打开 daemon 的短期 URL；headless 只返回 URL。不要根据宿主产品名分支。
- 同一 workspace 的外部浏览器只首次打开一次；后续依靠事件刷新，不能反复抢焦点。
- `verified=true` / `writeVerified=true` 只证明目标画板写盘并回读，不代表原型已经完成。成功更新会把目标设为 active board、发布带目标 revision 的 reveal request 并自动打开画码；Canvas 实际加载到同一 board + revision 后才回传消费确认。只有此后提交的 `completionReady=true` 才说明最终视觉复核已覆盖全部页面，即使如此，仍应把 `prototypeQuality.warnings` 作为继续打磨依据。
- 用户拖动产生的 scene write 与 Agent update 都通过 daemon；WebSocket 是主通知通道，revision polling 是断线降级。

## 数据与安全

- 原位使用 `draw2code/`、`.active-board.json`、`.projects/`、`.generations/`、`.generate-settings/` 与 `draw2code-pages/`，不得复制、导入或主动迁移旧数据。
- 所有 root 都必须 realpath 后落在 HostContext 注册 workspace 内。daemon 只监听 loopback；主 bearer 不进入画板页面，页面只收到短期 workspace/board scoped token。
- 不上传画板、brief、页面或验证证据。单画板元素数、UTF-8 byte 上限、历史版本与生成证据门禁保持有效。
