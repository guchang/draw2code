# dsh-draw2code BDD 验收说明

`features/draw2code.feature` 面向插件的真实协作契约：workspace 门禁、`draw2code_create` 的 choice-first grilling、项目草稿与版本、确认后独立画板、agent 工具、冲突确认、场景持久化、客户端挂载同步、画板切换，以及 `draw2code_generate` 从页面范围选择到真实预览验收的完整产品流程。它不把 Excalidraw 的坐标或 React 内部 ref 当作用户行为。

## 已实现、待真实宿主验收 — `draw2code_generate` 产品流程

完整决策见 `GENERATE_PRODUCT_FLOW.md`。本节既是产品契约，也是当前实现的验收口径。

### 职责边界

- generate 只负责把用户选定的原型页面转换成经过预览验收的单文件 HTML Demo；不搭建正式前端工程，也不接管生成后的长期修改。
- create 不是强制前置条件：有简报则继承，没有简报则从画板建立生成简报。
- 每次生成都展示全部 frame 让用户选择；系统智能推荐并将推荐项置顶、显式标记和解释原因。宿主支持预选时可默认勾选；当前 DSH 不支持预选，因此不能伪装成已选择，用户始终拥有最终范围控制权。
- 首次生成选择整体视觉方向，后续默认继承；不把颜色、字体、圆角和阴影拆成参数问卷。
- 移动端或桌面端优先从 frame 推断，只有混合布局等真实歧义才询问。

### 原型门禁与确认

- 页面无法理解、核心流程断开、关键操作或 mock 数据缺失属于阻断问题，必须先回画板补齐。
- Agent 自动补齐也要先更新画板并让用户看到，不能只在 HTML 中增加产品内容。
- 次要图标、动画和非核心状态属于非阻断提醒，只在最终简报说明默认值。
- 页面范围、视觉方向和原型检查完成后，只展示一次生成简报并确认，不逐项复述。最终确认使用可点击的“确认生成 / 修改页面范围 / 修改视觉方向”选项，不要求用户手动输入“确认”；修改时只返回对应选择，不重问其他已完成项。

### 输出和完成标准

- 始终输出统一入口的单文件 HTML，不询问技术栈，也不创建 generate 版本历史。
- 可以补充让已有交互可用的通用反馈，但不能自行发明页面、模块、流程或重大业务规则。
- 生成后自动打开预览并实际走通核心流程；文件写入成功但未通过预览验收时不得报告完成。
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
- `action=start` 创建 `draw2code/.projects/<projectId>.json` 草稿并返回第一个结构化问题；不会创建画板。
- `action=answer` 每次只推进一个问题；模型优先调用宿主 `ask_user_question`，完整传递结构化 options（包括“还没想好”和“其他”），让用户直接选择，不要求用户把选项重新输入聊天框；没有该宿主能力时才降级为编号选择。
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

### 已实现的最小 SOP

核心信息：目标端、核心用户、核心目标、最重要的用户流程、首版核心模块、首轮核心页面。用户原话明确 App/Web/小程序时目标端自动预填；平台/用户/目标/流程默认单选，模块和页面可多选。选项按用户想法动态生成，万年历穿搭会出现日期、天气、穿搭推荐、衣橱等语义选项，陌生人社交会出现雷达发现、碰一碰、好友聊天、足迹与隐私等选项。视觉风格不在原型阶段应用，主动提供的 `styleNote` 延迟给 `draw2code_generate`。

首轮简报默认约束为 3–5 个核心页面、默认成功路径和语义化低保真组件；`brief.pageMockData` 还会按页面给出 `requiredContent`、`minimumRecords` 和可直接绘制的 `examples`。列表、聊天、图表、详情和状态组件默认至少放入 3 条可见 mock 数据，不能以空白方框、Lorem ipsum、“用户A”“标题”“内容”等占位。具体 Excalidraw 元素仍由 `draw2code_update` 按现有冲突检查、内容门禁、读回验证和可见性协议写入。

### 本轮新增 — 低保真原型可读性与语义修复

- `draw2code_update` 除规范的 `{op:"upsert",element:{...}}` 外，也接受直接元素、省略 `op` 的 `element` 包装和字段平铺的 `upsert`；只对同时具有非空 `id + type` 的无歧义输入做兼容，不猜测 bare id 是删除还是修改。`op=delete` 时也兼容 `elementId` 和 `element.id`，避免 Agent 只因移动 id 字段重发整批修改。
- 同一批对相同元素 id 的多次操作按最终净结果读回验证：`upsert→delete` 期望元素不存在，`delete→upsert` 期望最终元素存在；不会因临时中间态已经被后续操作覆盖而误报失败。
- 带 `frameId` 的子元素若原坐标无法落入 frame、而加上 frame 左上角后能完整落入，会被安全识别为 frame 局部坐标并换算为画布绝对坐标；已经正确的绝对坐标保持不变，含义不明确的坐标仍由 `layout-invalid` 阻止写盘。
- 读回校验认可工具自身执行的组件语义对齐修复；例如 Chip 标签从 `left/top` 规范为 `center/middle` 后仍返回 `verified=true`，不会在数据已经落盘后误报失败并诱发重复覆盖。
- `draw2code_update` 写盘前会检查多行或预计换行的 `text` 是否有足够高度；失败返回 `layout-invalid`，不写入半截组件。
- `rectangle`、`diamond`、`ellipse` 不再允许携带依赖 Excalidraw 形状文字的 `text`；按钮、卡片和输入框文案必须使用独立的 `text` 元素。
- `bottom-navigation` 必须使用 `customData.role=bottom-navigation` 的矩形 shell 加独立标签，并位于 page frame 底部安全区；空 shell、互相重叠的栏目和普通一行“底部导航：...”文字都会被拒绝。
- frame 内组件不得越过页面边界；成功写入后工具仍会返回 `layoutWarnings`，让模型能发现旧画板中已有的视觉问题。
- 预检只阻塞本次 Agent 更新涉及的元素；用户已有的旧问题会作为提醒返回，不会阻塞用户继续手工编辑。
- `draw2code_create action=start` 要求 Agent 基于完整需求先概括并显式传入语义化 `projectName`；工具不再用正则、关键词或前 N 字裁剪从原话造名称，只做合法性校验。确认后的画板名直接使用 `projectName`，不追加“原型”后缀；完整 `idea` 仍保存在项目草稿和简报中。
- `draw2code_update` 会把 text 的 `containerId` 补成 Excalidraw 完整双向绑定；普通读取、打开画板和客户端写回不会借机改写既有故障样本。
- Agent 新增绑定文字的组件时必须用 `customData.role` 声明按钮、选择框、输入框、Chip、卡片等产品语义；缺失时返回 `component-role-missing`，不再把未知控件静默写成左上对齐。
- `button`、`primary-action`、`chip`、`tab`、`bottom-navigation-item` 等操作型文案不只规范为 `center/middle`，还会把文字盒缩至真实行高，并按外框几何重新计算垂直中心；`input`、`select`、`dropdown`、`search-field` 等表单值保持 `left/middle`，不会为了修按钮而误改输入内容。
- 底部导航 shell 内的每个独立标签必须设置 `customData.role=bottom-navigation-item`；缺失时返回 `bottom-navigation-item-role-missing`。即使 Agent 错把多个栏目文字都绑定到 shell，update 也会将其修复为独立文字、保留各自槽位并按 shell 垂直居中；空 shell 返回 `bottom-navigation-items-missing`，栏目重叠返回 `bottom-navigation-item-overlap`。
- 页面归属必须使用 `frameId`，`containerId` 只用于形状的唯一绑定标签。若 Agent 错把 text 的 `containerId` 指向 frame，update 会原子修复为 `containerId=null` 与对应 `frameId`，避免 mock 数据已经写进 JSON 但画布不显示。
- 原型不询问品牌视觉，但允许形状用 `customData.tone` 表达 primary、success、warning、danger、info、neutral 六种语义；使用浅底色和对应描边，且不覆盖显式颜色。
- 完整页面 frame 使用 `customData.role=prototype-page` 和 `customData.mockDataMin` 声明最低 mock 数据数量；承载示例记录的可见 text 使用 `customData.role=mock-data`。数量不足或只写无意义占位符时返回 `mock-data-insufficient`，整批更新不落盘。

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

现在浏览器通过 loopback `/api/draw2code/active-board` 将当前画板同步到 workspace 的 `draw2code/.active-board.json`。`draw2code_update`、`draw2code_read` 和 `draw2code_generate` 省略 `name` 时使用这个共享指针。更新在写入并回读验证成功后会选中目标画板、发布一次性 reveal request，并由常驻客户端监听器自动打开或激活“画码”；冲突、布局失败和重复轮询不会触发抢焦点。

### 已修复 — host 重启后没有快照会放行已有元素覆盖

`boardCache` 是运行时内存状态，host 重启后为空。旧逻辑在没有快照时会放行对已有 id 的 upsert/delete，无法区分 Agent 自己的旧元素和用户刚改过的元素。现在无快照时只有新增 id 可以直接执行；任何触碰已有 id 的操作都进入确认流程，避免重启把协作保护降级成静默覆盖。

### 已修复 — Agent 把 frame 标题写入 text 时页面生成找不到 frame

实际 Harness 回归中，Agent 传入的 frame 使用了 `text` 而不是 Excalidraw 的 `name`。归一化现在在 `name` 为空时把已写入的 `text` 作为 frame name，保持画框可见性的同时让 `draw2code_generate(frames=[...])` 能按页面名找到它。

## 已验证事实

- `npm run typecheck` 通过。
- `npm run build` 通过，并生成 `dist/index.js` 与 `lib/client.js`。
- `npm test` 通过：当前 68 个 Node 内置回归测试全部通过，覆盖 update 参数容错、同批净结果校验、frame 局部坐标安全换算、按钮文字真实几何居中、底部导航独立栏目/空壳/重叠门禁、语义修复后的读回校验、同步协调、已有画板和首次写入的并发竞争、删除不复活、delete-only 增量布局门禁、UTF-8 容量限制、当前画板目标解析、自动 reveal、项目草稿 revision 竞争、组件语义对齐、用户手工对齐保护、Agent 语义命名、create grilling、原型质量门禁和 generate 关联页推荐/恢复/验收流程。
- 项目包含 Node 内置回归入口和 `features/draw2code.feature` BDD 契约。
- DeepSeek Harness 的真实界面已加载 `画码` 标签页，当前能看到 `prototype` 画板、`新画板` 菜单入口、Excalidraw 工具栏和原型文字元素；这证明插件注册与非空画板挂载路径至少可达。
- 重新启动 `dsh web` 后，`GET /api/draw2code/active-board?root=<workspace>` 与 `GET /api/draw2code/reveal-request?root=<workspace>` 均能从真实 host 返回成功 envelope；仅刷新网页不足以重装 host bundle。
- Harness 真实删除回归确认：用户删除与 Agent 新增发生并发冲突时，旧内容不会复活，Agent 新增内容仍会保留并显示。
- Harness 最终 update 回归确认：新画板“更新容错回归三”只调用一次 `draw2code_update`，14 个 ops 一次应用并返回 `verified=true`；frame 局部坐标、Chip `left/top` 到 `center/middle` 的语义修复、嵌套 delete，以及同批 `upsert→delete` 均未触发重试。活动画板 API 返回该画板，磁盘读回为 12 个元素且 `temp-note` 不存在，真实画布可见“任务详情页”和三条检查项。

## 验收边界

电脑验收只能证明 Harness 中的插件注册、画板显示和菜单交互；它不能替代 host 层的 replace、元数据保留和 workspace 安全测试。当前 host 回归已由 `npm test` 覆盖；客户端删除活动画板仍建议在真实宿主中补充一条 UI 自动化场景。
