# Draw2Code · 画码

中文 | [English](README.en.md)

面向 [DeepSeek Harness（DSH）](https://github.com/DeepSeek-AI/DeepSeek-Harness) 的人机协作原型插件：先通过结构化提问把产品需求想清楚，再让 Agent 和用户在同一张 Excalidraw 画板上共同修改低保真原型，最后基于已经确认的画板生成并验收前端页面。

Draw2Code 是一个独立插件，只读写当前 DSH 工作区中的 `draw2code/` 和 `draw2code-pages/`，不会附带任何演示项目。

## 为什么需要 Draw2Code

Vibe Coding 很容易从一句模糊需求直接跳到代码，结果往往是页面范围没想清楚、用户手工删除的内容被 Agent 恢复，或者 Agent 声称已经画完但用户看不到结果。Draw2Code 把协作过程拆成三个边界明确的阶段：

1. **Create：澄清产品**
   - 当用户提出一个新产品想法时，`draw2code_create` 用可点击选项逐步澄清目标端、核心用户、核心目标、主流程、首版模块和核心页面。
   - 已经明确的信息不会重复询问；视觉品牌、颜色和正式前端实现留到生成阶段。
   - 用户确认最终 brief 之前不会创建画板。
2. **Update：共同画原型**
   - `draw2code_update` 把语义化低保真页面写入 Excalidraw，用户可以直接拖动、删除、改字或添加便签。
   - Agent 更新前读取当前画板；冲突、用户删除、手工修改和版本基线都有保护。
   - 更新经过落盘回读验证后，DSH 会自动打开画码并切换到目标画板。
3. **Generate：生成并验收前端**
   - `draw2code_generate` 读取最新画板，让用户选择页面范围和整体视觉方向。
   - 原型不完整时先回画板修复；不会在 HTML 中偷偷补出未经确认的产品功能。
   - 页面生成后必须打开真实预览并走通核心流程，只有验收完成才会报告完成。

## 主要能力

- DSH 右侧 `dsh-better-sidebar` 中的完整 Excalidraw 画布；
- 多画板创建、切换、删除、历史版本和导出；
- Agent 工具：`draw2code_list`、`draw2code_read`、`draw2code_create`、`draw2code_update`、`draw2code_generate`；
- 用户手工编辑与 Agent 更新之间的三方合并和冲突确认；
- 成功更新后自动展开画码、激活目标画板，同一事件不会反复抢焦点；
- 原型质量门禁：文字高度、frame 边界、底部导航、绑定文字、mock 数据和页面可读性；
- 内置 153 个产品原型素材，安装后无需单独下载素材库；
- Create 和 Generate 都支持可恢复的结构化流程，会话中断后不会重新询问已完成选择；
- 画板、项目 brief、生成设置和前端产物都保存在用户自己的工作区中。

## 系统要求

- 已安装 DeepSeek Harness，且 `dsh web` 可以正常启动；
- Node.js 22 或更高版本；
- `dsh-better-sidebar` 0.12.3 或更高版本。

## 从 GitHub 安装

仓库提交了经过测试的 `dist/` 和 `lib/` 运行产物，因此普通用户不需要在本地构建：

```bash
# 1. 安装右侧栏基础插件
dsh plugin --profile web add dsh-better-sidebar

# 2. 安装 Draw2Code 稳定版
dsh plugin --profile web add github:guchang/draw2code#v0.1.0

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

Draw2Code 只在当前 DSH 工作区内创建以下内容：

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

## 协作与安全边界

- 文件访问受 DSH workspace registry 门禁限制，不能越过已注册工作区；
- `/api/draw2code/*` 仅接受回环地址和同源浏览器请求；
- `draw2code_update` 使用原子写入、revision 和回读验证，不直接修改未知文件；
- 涉及用户手工修改的危险覆盖会返回确认状态，不会静默写入；
- Draw2Code 不上传画板、brief 或生成页面到外部服务；
- 单画板上限为 2000 个元素、512KB。

## 架构

```text
src/
├── index.ts                 # DSH host 插件入口
├── scene-store.ts           # workspace 门禁、场景与版本存储
├── project-store.ts         # Create brief 与版本
├── create-tool.ts           # draw2code_create 工具
├── tools.ts                 # list/read/update/generate 工具
├── layout.ts                # 原型质量门禁
├── routes.ts                # /api/draw2code/*
└── client/
    ├── index.tsx            # better-sidebar 标签注册
    ├── CanvasPanel.tsx      # Excalidraw 画布与多画板 UI
    ├── auto-open.ts         # 更新成功后自动展示目标画板
    ├── sync.ts              # 客户端保存与冲突合并
    └── library-assets/      # 内置产品原型素材
```

Host 端构建到 `dist/index.js`，浏览器端以 DSH module-loader envelope 构建到 `lib/client.js`。`cordis.patch.yml` 负责把插件加入 web profile。

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
