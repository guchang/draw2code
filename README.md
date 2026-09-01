# Draw2Code · 画码

中文 | [English](README.en.md)

面向 DSH、Codex 与其他 MCP Agent 的人机协作原型工具：先通过结构化提问把产品需求想清楚，再让 Agent 和用户在同一张 Excalidraw 画板上共同修改低保真原型，最后基于已经确认的画板生成并验收前端页面。

Draw2Code 使用一个共享 Core 和按需启动的本地 daemon。DSH 与 Codex 不互相依赖，但同时运行时会打开同一份工作区数据。

## 为什么需要 Draw2Code

Vibe Coding 很容易从一句模糊需求直接跳到代码，结果往往是页面范围没想清楚、用户手工删除的内容被 Agent 恢复，或者 Agent 声称已经画完但用户看不到结果。Draw2Code 把协作过程拆成四个边界明确的阶段：

1. **Create：澄清产品**
   - 当用户提出一个新产品想法时，`draw2code_create` 先提取已经明确的事实，再由 Agent 围绕场景、差异化、核心闭环和关键风险提出产品专属问题。
   - 每题先给产品判断，再提供有真实取舍的可点击选项；不会固定重复询问模块和页面，信息足够即停止，最多 10 题。可跳过单题、直接整理简报，也可在 ready 后只调整受影响的产品决策。
   - 工具把结构化 `PrototypeBrief` 确定性渲染成包含逐页结构、真实 mock 数据、交互关系和验收方式的完整项目简报；最后用一张页面范围确认卡明确列出将绘制的页面，用户确认前不会创建画板。
   - 视觉品牌、颜色和正式前端实现仍留到生成阶段。
2. **Open & Demonstrate：用户画给 Agent 看**
   - 用户说“打开画码，我自己画一下”时，由独立的 `$draw2code-open` 快速入口只调用一次 `draw2code_open`，不加载 Create、Update、Generate、代表页复核或质量门禁；宿主有侧边栏浏览器时通过 handoff URL 在侧边栏显示。
   - 用户说“我画好了”后，Agent 先用 `draw2code_read` 读取并复述页面、组件和交互关系，再按用户指令继续修改或生成。
   - URL 就绪、daemon 启动和画布真正可见是三个不同状态；只有侧边栏实际显示后才报告“已经打开”。
3. **Update：共同画原型**
   - `draw2code_update action=write` 把语义化低保真页面写入 Excalidraw，用户可以直接拖动、删除、改字或添加便签；`action=review` 使用写入返回的 `reviewToken` 记录可见复核，不改画板 revision，也不发布新的 reveal。
   - Agent 更新前读取当前画板；冲突、用户删除、手工修改和版本基线都有保护。
   - Create 会逐页给出核心任务、首屏信息、主操作和语义组件蓝图；3 个及以上页面返回结构化 `drawingPlan`，强制先生成代表页，复核通过后才生成其余页面。若 Agent 仍误提前提交其余页面，Update 会返回 `pendingUpdateId` 暂存该批 ops，复核后以 `action=commit_pending` 直接提交，避免整批 JSON 被丢弃和重新生成。
   - 更新经过落盘回读验证后，DSH 会自动打开画码并切换到目标画板；写入成功与原型完成分开报告，最终必须逐页完成视觉复核。
4. **Generate：生成并验收前端**
   - `draw2code_generate` 开始前先用普通对话询问是否有参考风格图片；随后读取最新画板，让用户多选页面范围，并结合参考图或产品语义智能推荐整体视觉方向。
   - 原型不完整时先回画板修复；不会在 HTML 中偷偷补出未经确认的产品功能。
   - 原型定义产品事实，前端使用 Grid/Flex、内容流和响应式约束重新排版，不复制 Excalidraw 绝对坐标。
   - 页面生成后必须逐页截图，检查控制台、DOM、布局和核心流程；工具会读取 workspace 内的截图/DOM 快照、核对 SHA-256 与视口尺寸，并直接比较未选页面块哈希，证据门禁通过后才会报告完成。

## 主要能力

- DSH 右侧 `dsh-better-sidebar` 中的完整 Excalidraw 画布；
- 多画板创建、切换、删除、历史版本和导出；独立画码可在本机已明确注册的工作区之间切换，各工作区的画板仍原位保存；
- Agent 工具：`draw2code_list`、`draw2code_read`、`draw2code_create`、`draw2code_update`、`draw2code_generate`、`draw2code_open`；
- 用户手工编辑与 Agent 更新之间的三方合并和冲突确认；
- 成功更新后自动展开画码、激活目标画板，同一事件不会反复抢焦点；
- 无 Frame 新页面模型：普通矩形页面外框、外部页面标题、自由组件和不被裁切的手绘跨页箭头；旧命名 Frame 画板继续兼容；
- 原型质量门禁：文字高度、页面边界、底部导航、绑定文字、mock 数据、信息密度、视觉层级、点击区域和页面节奏；
- 内置 153 个产品原型素材，安装后无需单独下载素材库；
- Create 和 Generate 都支持可恢复的结构化流程，会话中断后不会重新询问已完成选择；
- 画板、项目 brief、生成设置和前端产物都保存在用户自己的工作区中。

## 系统要求

- 已安装 DeepSeek Harness，且 `dsh web` 可以正常启动；
- Node.js 22 或更高版本；
- DSH 宿主使用 `dsh-better-sidebar` 0.12.3 或更高版本；Codex 可独立安装，不需要 DSH。

## 在 Codex 中使用

首版通过本地 personal marketplace 安装，不提交公共 Plugin 目录。开发构建并把仓库的 Plugin 产物同步到 `~/plugins/draw2code` 后执行：

```bash
codex plugin add draw2code@personal
```

安装后新建 Codex 任务，使 Skills 与六个 MCP 工具进入新会话。用户不需要进入单独的 Plugin 页面或手输工具名：选择“打开 Draw2Code / 画码”快速入口，或直接说“打开画码”，只走单次 Open；“用 Draw2Code 帮我设计一个习惯追踪 App”“帮我画原型”等产品任务才进入综合工作流。普通“帮我做一个 App”不会自动进入 Draw2Code。

`draw2code_open` 在 MCP/Codex 中默认使用 `presentation=handoff`：MCP 连接初始化时已后台预热共享 daemon，Open 工具只需返回短期 URL，不注册会生成打不开卡片的静态 `openai/outputTemplate`，由宿主在侧边栏或浏览器打开并验证画布可见。只有显式选择 `presentation=browser` 时才尝试启动外部浏览器。后续更新通过 WebSocket 刷新，断线时继续使用 revision polling，不反复打开窗口。

Draw2Code 把画板注册到 `dsh-better-sidebar` 提供的右侧栏中。DSH 当前只会自动启用用户直接安装的 bundle，不会自动启用另一个插件的传递依赖，因此下面两条安装命令都必须执行。

## 从 GitHub 安装

仓库提交了经过测试的 `dist/` 和 `lib/` 运行产物，因此普通用户不需要在本地构建：

```bash
# 1. 安装右侧栏基础插件
dsh plugin --profile web add dsh-better-sidebar

# 2. 安装 Draw2Code 稳定版
dsh plugin --profile web add github:guchang/draw2code#v0.1.2

# 3. 重启 dsh web；如果已经在运行，请先停止旧进程再启动
dsh web
```

如果是第一次初始化 DSH web profile，pnpm 可能会先暂停 `node-pty` 的原生构建，并在 `$DSH_HOME/profiles/web/pnpm-workspace.yaml`（默认 `~/.dsh/profiles/web/pnpm-workspace.yaml`）写入待确认项。按提示把它设为允许后重跑安装命令：

```yaml
allowBuilds:
  node-pty: true
```

这是 DSH 基础运行时的首次构建授权，不是 Draw2Code 额外执行的安装脚本。

刷新 DSH 页面后，在右侧栏的 `+` 菜单中选择“画码”。随后可以直接在对话中说：

```text
我想创建一个新的习惯追踪 App。
```

Agent 会先调用 `draw2code_create` 澄清需求；确认 brief 后创建独立画板并开始绘制。

### 从源码安装（开发者）

```bash
git clone https://github.com/guchang/draw2code.git
cd draw2code
npm ci
npm test

dsh plugin --profile web add dsh-better-sidebar
dsh plugin --profile web add link:$(pwd)
```

修改源码后运行 `npm run build`，再重启 `dsh web` 并刷新页面。

## 工作区数据

Draw2Code 只在当前宿主注册的工作区内创建以下内容：

```text
draw2code/
├── <画板名>.excalidraw.json   # 原型画板
├── .active-board.json         # 当前画板指针
├── .projects/                 # Create 项目 brief 与版本
├── .generations/              # Generate 可恢复会话
└── .generate-settings/        # 项目级视觉方向

draw2code-pages/
└── <画板名>/index.html        # 生成并验收的前端 Demo
```

这些运行数据已加入 `.gitignore`，不会进入 Draw2Code 源码仓库。

独立画码会记住 Codex、DSH 或其他宿主明确注册过的工作区，并在画板菜单中显示当前工作区及其他已经存在画板的工作区，包括名称、完整路径和画板数量；插件缓存和没有画板的空 root 不进入切换菜单。切换工作区前会先落盘当前待保存内容，再换取目标工作区的新短期凭据；原凭据不能直接读取其他工作区。Draw2Code 不扫描整台电脑，也不会自动复制、合并或迁移不同工作区的画板。

## 协作与安全边界

- 文件访问受 HostContext workspace 门禁限制，root 经 `realpath` 后不能越过已注册工作区；
- daemon 只监听 loopback，descriptor 权限为 `0600`；宿主使用随机 bearer，画板只获得短期 workspace-scoped token；独立画码切换工作区时必须显式换取目标 root 的新 token；
- DSH `/api/draw2code/*` 是隐藏 token 的同源 daemon 代理；
- `draw2code_update` 使用原子写入、revision 和回读验证，不直接修改未知文件；
- 涉及用户手工修改的危险覆盖会返回确认状态，不会静默写入；
- Draw2Code 不上传画板、brief 或生成页面到外部服务；
- 单画板上限为 2000 个元素、512KB。

## 架构

```text
Codex Skill / DSH tools / future MCP clients
                    │
              Host Adapters
                    │
        user-level loopback daemon
                    │
          Draw2CodeRuntime.execute()
                    │
 Create state · Scene/Project store · CAS/merge · Generate gate
                    │
     existing workspace files (no migration)
```

DSH Host 构建到 `dist/index.js`；Codex stdio MCP 与 daemon 分别构建到 `dist/draw2code-mcp.js`、`dist/draw2code-daemon.js`；共享浏览器画板构建到 `lib/canvas.html`。Plugin 清单位于 `.codex-plugin/plugin.json`，跨宿主约束只有一份真值：[workflow contract](references/workflow-contract.md)。

## 开发与验证

```bash
npm ci
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

- 产品行为说明：[BDD.md](BDD.md)
- Generate 产品流程：[GENERATE_PRODUCT_FLOW.md](GENERATE_PRODUCT_FLOW.md)
- Gherkin 契约：[features/draw2code.feature](features/draw2code.feature)

## License

Draw2Code 代码采用 [Apache License 2.0](LICENSE)。内置 Excalidraw 素材继续遵循其上游 MIT License，作者与来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
