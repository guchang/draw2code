---
name: draw2code-open
description: Fast path for an explicit request to open Draw2Code or 画码, resume a named board, or let the user draw a quick示意. Use only when opening is the whole request; do not use for product discovery, agent drawing, editing, review, or frontend generation.
---

# 直接打开 Draw2Code / 画码

这是确定性的打开入口。不要分析产品需求，不要读取 workflow contract，也不要加载综合 Draw2Code 工作流。

1. 只调用一次 `draw2code_open`：`root` 使用当前 workspace；只有用户明确点名画板时才传 `board`；始终传 `presentation=handoff`。
2. 收到 `displayState=handoff-ready` 后，使用宿主原生侧边栏导航能力打开返回的短期 `url`；已有同一画码标签页时直接复用。不要初始化通用浏览器自动化或 Computer Use。
3. 没有 active board 时显示画板选择器或空白画布。不要进入需求提问、画板读取、原型修改、页面生成、代表页复核或质量门禁。
4. 导航成功后简短报告结果。URL 已准备但宿主无法导航时，返回可点击 URL，不要声称画布已经可见。
