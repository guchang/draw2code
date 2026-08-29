@draw2code
Feature: 画码原型板的人机协作
  作为在 DeepSeek Harness 中进行 vibe coding 的用户
  我希望 AI 和我可以安全地共同编辑 Excalidraw 画板
  这样原型既能快速生成，也不会覆盖我的手工修改或丢失图形语义

  Background:
    Given DeepSeek Harness 已加载 dsh-draw2code 插件
    And 当前会话工作目录已注册为 workspace

  Scenario: 用户亲自画示意时不应进入 Create
    Given 宿主提供可见的侧边栏浏览器
    When 用户说“打开画码，我自己画一下”
    Then agent 应只调用 draw2code_open 且 presentation 为 handoff
    And agent 不应调用 draw2code_create
    And 宿主应在侧边栏打开工具返回的短期 URL
    And 只有画布真正可见后才能报告“画码已经打开”

  Scenario: 用户画完后先读取并复述
    Given 用户已经在当前可见画板中手绘了页面和交互箭头
    When 用户说“我画好了，你看看”
    Then agent 应调用 draw2code_read 读取当前可见画板
    And agent 应先复述页面、组件和交互关系
    But 用户未要求修改或生成时不应调用 draw2code_update 或 draw2code_generate

  Scenario: 明确指定的画板优先于浏览器记忆
    Given 浏览器上次停留在“旧画板”
    When draw2code_open 返回带 board=心情日记 的短期 URL
    Then standalone canvas 首次加载应显示“心情日记”
    And 不应被本地记忆的“旧画板”覆盖

  Scenario: 画板文件只允许从已注册 workspace 读取
    When agent 请求读取当前 workspace 的“prototype”画板
    Then 应返回画板 revision、元素摘要和完整元素数据
    When agent 请求读取 workspace 外的目录
    Then 应拒绝请求并返回 workspace-unknown

  Scenario: Agent 新建原型页面必须使用普通矩形页面外框
    When agent 新增 type 为 rectangle 且 customData.role 为 prototype-page 的“任务列表”页面
    And 页面外框的 customData.pageName 为“任务列表”
    And agent 在页面外框上方新增 customData.role 为 prototype-page-label 的独立标题
    Then 页面外框不应是 Excalidraw frame
    And 页面内部所有控件的 frameId 应为 null
    And 页面控件不应被统一加入 group
    And 用户手工绘制的跨页箭头不应被页面边界裁切

  Scenario: Agent 不应把新的 prototype-page 写成 Frame
    When agent 新增 type 为 frame 且 customData.role 为 prototype-page 的页面
    Then draw2code_update 应返回 prototype-page-frame-deprecated
    And 工具应提示改用带 pageName 的 rectangle 页面外框和外部页面标题
    But 更新已有 legacy Frame 或创建普通非页面 Frame 仍然允许

  Scenario: 兼容旧 Frame 的批量 upsert 仍必须读回验证
    When agent 使用一个 upsert 操作新增 id 为“login-frame”的 frame
    And agent 使用一个 upsert 操作新增位于该 frame 内的 text 元素“用户登录页”
    Then 画板文件中应存在这两个元素
    And text 元素应自动绑定到“login-frame”
    And 工具结果的 verified 应为 true

  Scenario: 常见的无歧义 upsert 简写不应触发反复重试
    When agent 直接提交带 id 和 type 的元素
    And agent 提交省略 op 的 element 包装
    And agent 把 id、type 和几何字段平铺在 op 为 upsert 的对象上
    Then draw2code_update 应统一按 upsert 处理
    And agent 不应因为缺少 op 或 element 包装重新提交整批原型

  Scenario: delete 的目标 id 放在 element 内时不应反复重试
    Given 画板中存在 id 为“旧日期”的元素
    When agent 提交 op 为 delete 且 element.id 为“旧日期”的操作
    Then draw2code_update 应删除该元素并读回验证
    And agent 不应为了移动 id 字段而重复提交整批修改

  Scenario: 同一批对相同 id 的操作应按最终净结果校验
    When agent 在同一批先 upsert 再 delete 临时元素“temp-note”
    Then 读回校验应确认“temp-note”最终不存在
    And 不应因为早先的 upsert 目标不存在而误报 write verification failed
    When agent 在同一批先 delete 再 upsert 元素“final-note”
    Then 读回校验应确认“final-note”最终存在且内容匹配

  Scenario: 明确的 frame 局部坐标应安全换算为画布坐标
    Given 页面 frame 位于画布坐标 x=440 和 y=100
    When agent 新增 frameId 指向该页面且 x=20、y=80 的标题
    And 标题原坐标无法位于 frame 内但平移后能完整位于 frame 内
    Then draw2code_update 应把标题保存到 x=460 和 y=180
    But 已经位于 frame 内的绝对坐标不应再次平移
    And 两种坐标解释都无法完整位于 frame 内时应返回 layout-invalid

  Scenario: 绑定到组件的文字首次渲染就应可见
    When agent 新增一个事项类型外框
    And agent 新增一个 containerId 指向该外框的文字“搬家”
    Then draw2code_update 应在外框的 boundElements 中补入该文字
    And 用户不需要双击外框才能看到“搬家”

  Scenario: 按钮与表单值应按组件语义对齐
    When agent 新增 customData.role 为 primary-action 的按钮及其绑定文案
    And agent 新增 customData.role 为 select 的城市选择框及其绑定文案
    Then 按钮文案应写为 center 和 middle
    And 按钮文案的文字盒应缩至真实行高并在按钮内垂直居中
    And 城市选择框文案应写为 left 和 middle

  Scenario: 工具自动修正语义对齐后仍应通过写入校验
    When agent 把 customData.role 为 chip 的标签写成 left 和 top
    Then draw2code_update 应把标签规范为 center 和 middle
    And 读回校验应以规范后的语义对齐为准
    And 工具不应在已经成功写盘后误报 write verification failed

  Scenario: 绑定文字缺少组件语义时不应猜测对齐方式
    When agent 新增一个有绑定文字但没有 customData.role 的外框
    Then draw2code_update 应返回 component-role-missing
    And 画板文件不应写入这次更新

  Scenario: 底部导航标签必须声明导航项语义
    Given 页面底部已有 customData.role 为 bottom-navigation 的 shell
    When agent 在 shell 内新增没有 customData.role 的独立文字“日历”
    Then draw2code_update 应返回 bottom-navigation-item-role-missing
    When agent 把该文字设置为 customData.role=bottom-navigation-item
    Then 该文字应写为 center 和 middle

  Scenario: 底部导航的多个栏目不能共绑一个 shell
    Given 页面底部已有 customData.role 为 bottom-navigation 的 shell
    When agent 把“日历”“衣橱”“我的”三个 bottom-navigation-item 都绑定到该 shell
    Then draw2code_update 应清除三个文字的 containerId
    And 三个文字应保留各自互不重叠的栏目槽位
    And 三个文字的文字盒应在 shell 内垂直居中
    And shell 不应生成歧义的 boundElements

  Scenario: 空白或重叠的底部导航不应写入
    When agent 只新增 bottom-navigation shell 而没有可见栏目文字
    Then draw2code_update 应返回 bottom-navigation-items-missing
    When agent 新增两个互相重叠的 bottom-navigation-item
    Then draw2code_update 应返回 bottom-navigation-item-overlap

  Scenario: 页面内文字误用 containerId 指向 frame 时仍应可见
    Given agent 新增一个 id 为“radar-page”的 frame
    And agent 错把附近用户文字的 containerId 设置为“radar-page”
    When draw2code_update 写入这次更新
    Then 工具应把该文字的 containerId 修复为 null
    And 工具应把该文字的 frameId 设置为“radar-page”
    And mock 数据不应只存在于 JSON 而在画布上不可见

  Scenario: 低保真原型可以使用克制的语义色
    When agent 为工作清单形状设置 customData.tone 为 primary
    And agent 为生活清单形状设置 customData.tone 为 success
    Then draw2code_update 应写入不同的浅色背景和对应描边
    But 不应推断品牌色或覆盖 agent 显式提供的颜色

  Scenario: 完整原型页必须有用户看得懂的 mock 数据
    Given agent 正在绘制一个 customData.role 为 prototype-page 的好友列表页
    And 该页面要求 customData.mockDataMin 为 3
    When 页面只有 2 条 customData.role 为 mock-data 的可见好友记录
    Then draw2code_update 应返回 layout-invalid
    And 错误应包含 mock-data-insufficient
    When agent 补充第 3 条包含昵称、最近消息和时间的好友记录
    Then draw2code_update 应成功写入
    And 用户不需要猜测空白方框代表什么

  Scenario: agent 可以用 replace 原子替换整块画板
    Given 当前画板中存在旧元素“old-card”
    When agent 使用 replace 操作提交只包含“new-card”的场景
    Then 工具应成功写入并读回验证
    And 画板中不应再存在“old-card”
    And 画板中应存在“new-card”

  Scenario: agent 更新用户没有改过的元素时不应被无谓阻塞
    Given agent 已经记录了当前画板快照
    And 用户只手工新增了元素“user-note”
    When agent 修改未被用户触碰的元素“login-frame”
    Then 工具应直接执行
    And “user-note”应继续保留
    And 工具结果的 verified 应为 true

  Scenario: agent 修改用户刚改过的元素时必须先请求确认
    Given agent 已经记录了元素“login-frame”的快照
    And 用户手工修改了元素“login-frame”的文案
    When agent 再次 upsert 元素“login-frame”
    Then 工具结果的 pending 应为 true
    And 工具结果的 requiresConfirmation 应为 true
    And 工具不应覆盖用户的文案
    When 用户确认覆盖并再次以 force=true 调用
    Then 工具才应写入 agent 的版本

  Scenario: 用户保存后应保留 Excalidraw 图形语义
    Given 画板中有一个带端点箭头、startBinding、endBinding 和 link 的 arrow
    When 用户编辑画板并触发保存
    Then arrow 的 startArrowhead 和 endArrowhead 应保持不变
    And arrow 的 startBinding 和 endBinding 应保持不变
    And arrow 的 link 应保持不变

  Scenario: 跨页箭头应作为页面关系而不是页面 UI 内容
    Given 画板中有“任务列表”和“任务详情”两个 rectangle 原型页面
    And 用户从“任务列表”的按钮手工画出箭头连接“任务详情”
    When agent 读取画板
    Then 箭头的 frameId 应保持 null
    And draw2code_read.pageRelations 应包含“任务列表 → 任务详情”
    And 箭头及其绑定说明文字不应出现在任一页面的 elementIds 中
    When agent 再向“任务详情”新增一个普通组件
    Then 用户手工绘制的箭头、端点绑定和文案应保持不变

  Scenario: 页面区域重叠时不应猜测组件归属
    Given 两个 rectangle 原型页面的区域发生重叠
    And 一个普通组件的中心同时落在两个页面中
    When agent 读取或生成该画板
    Then 工具应返回 page-membership-ambiguous warning
    And 工具不应移动该组件或擅自选择其中一个页面

  Scenario: 新页面与旧 Frame 可以在同一画板共存
    Given 画板中同时存在 rectangle 原型页面和具有名称的 legacy Frame
    When agent 读取、更新或生成该画板
    Then 两类页面都应出现在 pageNames 和 pages 中
    And pages.kind 应分别为 page-shell 和 legacy-frame
    And 工具不应修改现有元素的类型、ID、坐标或绑定

  Scenario: 重复页面名不应被静默丢弃或猜测
    Given 两个不同页面都名为“任务详情”
    When agent 读取画板
    Then layoutWarnings 应包含 page-name-duplicate
    When agent 请求生成页面
    Then draw2code_generate 应返回 page-name-duplicate
    And 用户应先为页面设置唯一名称

  Scenario: 用户删除内容后 agent 新增页面不应复活已删除元素
    Given 用户开始编辑时画板中存在“旧模块”和“保留模块”
    And 用户删除了“旧模块”，但防抖保存尚未完成
    When agent 在同一时间新增“登录页”和“注册页”
    And 用户的保存遇到并发冲突并继续重试合并
    Then 画板中应保留“保留模块”
    And 画板中应存在“登录页”和“注册页”
    And 画板中不应再次出现“旧模块”

  Scenario: 防抖保存必须以首次手工编辑时的版本为冲突基线
    Given 用户在 revision 41 的画板上开始拖动并删除元素
    When agent 在 1 秒防抖窗口内把画板推进到 revision 99
    Then 用户保存仍应以 revision 41 作为 compare-and-swap 基线
    And 用户后续编辑不应把 agent 的整块新内容静默覆盖

  Scenario: 未指定画板时 agent 必须更新用户当前正在看的画板
    Given workspace 中存在“prototype”和“顾客端”画板
    And 用户当前在界面上选中“顾客端”
    When agent 调用 draw2code_update 且省略 name
    Then 更新目标应为“顾客端”
    And 工具结果的 targetBoard 和 activeBoard 都应为“顾客端”
    And “prototype”不应凭空出现相同的新元素

  Scenario: Agent 成功写入非当前画板后应自动展示目标画板
    Given 用户当前在界面上选中“顾客端”
    When agent 明确把更新写入“prototype”
    Then 工具应先读回验证 prototype 已经写入
    And 工具应把 activeBoard 切换为“prototype”
    And 工具应发布一个唯一的 reveal request
    And 当前 DSH 会话应自动展开或激活“画码”
    And 画布应显示“prototype”
    But 写入冲突、布局失败或验证失败时不应发布 reveal request

  Scenario: 同一个成功更新不应反复抢夺用户焦点
    Given 客户端已经消费 reveal request “reveal-1”
    When 客户端轮询再次读到“reveal-1”
    Then 不应再次打开或激活“画码”
    When 客户端读到新的 reveal request “reveal-2”
    Then 应只打开或激活一次“画码”

  Scenario: host 重启后触碰已有元素必须先确认
    Given host 刚刚重启且内存中没有该画板的历史快照
    And 画板中已有元素“用户刚改过”
    When agent upsert 同一个元素 id
    Then 工具结果的 pending 应为 true
    And 工具结果的 requiresConfirmation 应为 true
    And “用户刚改过”不应被覆盖

  Scenario: Agent 用 text 描述旧 Frame 时仍能按页面名生成
    Given agent 新增一个 type 为 frame 且 text 为“用户登录页”的元素
    When agent 请求只生成“用户登录页”
    Then 工具应把该 text 作为 frame name 使用
    And 结果的 frameNames 应包含“用户登录页”

  Scenario: Agent 不应写入会被裁切的多行组件
    Given 页面 frame 中有一个包含五行内容的 text 元素
    When 该 text 元素的 height 只有一行的高度
    Then draw2code_update 应返回 layout-invalid
    And 画板文件不应写入这次不完整的更新

  Scenario: Agent 不应把按钮文案写进形状的不可见 text 字段
    When agent upsert 一个带 text 的 rectangle 作为按钮
    Then draw2code_update 应返回 layout-invalid
    And 错误信息应要求使用独立的 text 元素

  Scenario: Agent 应把底部导航放在页面底部安全区
    Given 页面边界高度为 860
    When bottom-navigation shell 距离页面底部超过安全区
    Then draw2code_update 应返回 layout-invalid
    When bottom-navigation shell 使用矩形外框并贴近页面底部
    Then draw2code_update 应成功写入并返回空的 layoutWarnings

  Scenario: Harness 中打开画码标签页不会用空的挂载回声覆盖已有画板
    Given “prototype”画板文件中已有非空元素
    When 用户在 DeepSeek Harness 右侧打开“画码”标签页
    Then 画布应显示已有元素
    And 画板文件中的元素数量不应因首次挂载而变为 0

  Scenario: 画板菜单可以切换已有画板
    Given workspace 中同时存在“prototype”和“顾客端”画板
    When 用户打开画板菜单并选择“顾客端”
    Then 画板标题应变为“顾客端”
    And 画布应显示“顾客端”的元素
    When 用户再次选择“prototype”
    Then 画板标题应变回“prototype”

  Scenario: 生成页面前返回选定页面和已有页面清单
    Given “prototype”画板包含名为“用户登录页”的 rectangle 原型页面
    And draw2code-pages/prototype/ 中已有 index.html
    When agent 通过 pages 请求只生成“用户登录页”
    Then 工具结果的 pageNames 应只包含“用户登录页”
    And deprecated 的 frameNames 应兼容返回“用户登录页”
    And 工具结果的 existingPages 应包含“index.html”
    And instructions 应要求先读取画板并只更新选定范围

  Scenario: pages 与 frames 兼容参数冲突时不猜测优先级
    Given 当前画板同时包含“任务列表”和“任务详情”
    When agent 传入 pages 为“任务列表”且 frames 为“任务详情”
    Then draw2code_generate 应返回 page-scope-conflict
    When pages 与 frames 表示同一组页面
    Then draw2code_generate 应正常进入页面范围选择

  Scenario: 每次生成前都展示全部页面并提供智能推荐
    Given 当前画板包含“登录页”“注册页”“首页”和“统计页”
    And 用户说“生成登录页”
    When agent 进入 draw2code_generate 的页面范围选择
    Then 用户应看到画板上的全部页面
    And “登录页”应因用户本次点名而置顶并显式标记为推荐
    And 如果宿主支持预选则可以默认勾选，否则应保持未选并等待用户决定
    And 与登录流程直接相关的“注册页”可以被推荐并说明原因
    But 用户可以取消任何推荐页面
    And 不应再单独询问用户是否接受推荐范围

  Scenario: 没有 create 简报的手绘画板也可以直接生成
    Given 用户自己画了一个包含三个可理解页面边界的原型
    And workspace 中没有对应的 draw2code_create 项目简报
    When 用户说“根据画板生成页面”
    Then generate 应从页面边界、文案、组件和流程箭头建立生成简报
    And 不应要求用户先完成一遍 draw2code_create
    And 只应补问画板无法回答且会显著改变结果的事项

  Scenario: 首次生成选择整体视觉方向而不是逐项配置样式
    Given 当前项目没有已确认的视觉方向
    When 用户完成页面范围选择
    Then generate 应提供 3–5 个适合当前产品的整体视觉方向
    And 应标出一个推荐方向
    And 用户可以选择方向、附参考图或自定义补充
    But 不应分别追问颜色、字体、圆角和阴影

  Scenario: 整体视觉方向应在内部展开而不增加用户问题
    Given 用户已经选择“简洁现代”
    When generate 建立最终生成简报
    Then 简报应包含气质、背景、主操作、语义色和信息密度
    And 简报应包含字体层级、响应式布局策略、动效和视觉焦点
    But 不应继续逐项询问这些实现细节

  Scenario: 后续重新生成默认继承视觉方向
    Given 项目第一次生成时已选择“年轻活力”视觉方向
    When 用户明确要求按照最新画板重新生成“统计页”
    Then generate 应默认沿用“年轻活力”
    And 最终生成简报应显示当前沿用的视觉方向
    But 不应要求用户重新回答完整视觉问题

  Scenario: 设备类型优先从原型尺寸推断
    Given 用户选择的页面边界都是手机尺寸
    When generate 准备生成页面
    Then 应默认生成移动端 H5 页面本体
    And 不应重复询问移动端、桌面端或响应式
    But 同一范围同时包含手机和桌面布局时应让用户选择主版本或分别生成

  Scenario: 阻断问题必须先回到画板解决
    Given 用户选择的“好友列表”只有空白卡片且没有 mock 数据
    When generate 执行原型可生成性检查
    Then 应把“页面无法理解”标记为阻断问题
    And 用户应能选择自行补画或让 Agent 自动补齐
    When 用户选择让 Agent 自动补齐
    Then Agent 应先通过 draw2code_update 更新画板
    And 用户应在画板中看到并确认补齐结果
    And 恢复 generate 后不应重复选择页面范围和视觉方向

  Scenario: 非阻断提醒只在最终简报统一说明
    Given 原型核心流程完整但缺少一个辅助图标和次要动画说明
    When generate 执行原型可生成性检查
    Then 这些问题不应阻止生成
    And 不应逐项向用户提问
    And 最终生成简报应说明采用的合理默认值

  Scenario: 生成前只进行一次统一确认
    Given 页面范围、视觉方向和原型检查都已完成
    When generate 准备写入前端页面
    Then 应展示一次包含范围、视觉、提醒、默认假设和已有内容保护的生成简报
    And 用户确认后应立即开始生成
    But 不应在中间重复复述每个选择并询问是否正确

  Scenario: generate 始终输出可体验的单文件 HTML
    Given 用户确认了包含登录页、注册页和首页的生成简报
    When generate 执行生成
    Then 应输出一个可直接打开的 index.html
    And 多个页面应能在同一文件中切换
    And CSS、JavaScript 和非敏感 mock 数据应包含在该文件中
    And 核心按钮、表单和页面跳转应有实际反馈
    And 页面应使用内容流、CSS Grid 或 Flex 重新排版
    And 不应照搬 Excalidraw 的绝对坐标和低保真方框尺寸
    But 不应询问 React、Vue、路由或状态管理技术栈

  Scenario: 再次生成只更新用户选中的页面
    Given index.html 中已有“首页”“清单页”和“统计页”
    And 用户只选择重新生成“统计页”
    When generate 执行更新
    Then “首页”和“清单页”应保持不变
    And 不与最新画板冲突的已有增强应尽量保留
    And 即将覆盖用户明确手工修改时应在最终简报中说明冲突
    But 不应创建 index-v2.html 或其他 generate 历史版本

  Scenario: 生成完成后必须自动预览并走通核心流程
    Given generate 已写出本次选择页面的 index.html
    When Agent 准备报告生成完成
    Then 应先自动打开页面预览
    And 应实际检查所选页面可见、页面切换、核心按钮和 mock 数据
    And 应为每个所选页面保留目标视口截图
    And 应检查控制台 error/warning、横向溢出、内容裁切、按钮文字居中和底部导航完整
    And 应按画板的核心成功流程走一遍
    But 仅有文件写入成功时不得报告“生成完成”

  Scenario: 几个自报布尔值不能替代真实预览证据
    Given generate 已写出页面但没有提交逐页截图、视口和控制台检查
    When Agent 调用 `action=complete`
    Then 工具应返回 verification-evidence-missing 或 verification-evidence-incomplete
    And generate 会话应保持 confirmed
    When Agent 提交覆盖全部页面且所有检查通过的结构化 verificationEvidence
    Then 工具才应返回 completed
    But 证据包含控制台 error/warning 或失败的布局检查时应返回 verification-evidence-failed

  Scenario: 预览证据必须指向可核验的真实产物
    Given Agent 提交了同一 captureId 的截图路径、DOM 快照路径和对应 SHA-256
    And previewUrl 内容哈希等于当前生成入口的 outputSha256
    When 截图文件不存在、位于 workspace 外、哈希不一致或 PNG 尺寸与视口不符
    Then 工具应返回 verification-evidence-failed
    When DOM 快照遗漏原型中的关键文案或 mock 数据
    Then 工具也应拒绝完成

  Scenario: 重新生成时工具直接保护未选页面
    Given 已有 HTML 用 d2c-page 起止注释标记“首页”和“统计页”
    And 用户只选择重新生成“统计页”
    When Agent 修改或删除“首页”页面块
    Then 工具应返回 unselected-pages-changed
    But 用户选择了全部页面时不应要求 unselectedPagesPreserved

  Scenario: 实现问题自动修复而产品变化才询问用户
    Given 自动预览发现按钮无响应和页面跳转错误
    When 修复不需要改变画板中的产品结构和流程
    Then Agent 应自动修复并重新验收
    But 修复需要新增页面、模块或业务规则时应暂停并让用户选择

  Scenario: generate 中断后恢复且不交付半成品
    Given 用户已选择页面和视觉方向但 generate 在验收前中断
    When 用户恢复这次生成
    Then 应从中断阶段继续
    And 不应重复询问已经完成的页面和视觉选择
    And 未通过预览验收的 HTML 不应被报告为完成结果

  Scenario: 生成完成后的普通修改不属于 generate
    Given index.html 已通过预览验收且 generate 已结束
    When 用户说“按钮换成蓝色”或“这里增加一个筛选”
    Then Agent 应把它作为普通页面或原型协作修改处理
    But 不应自动重新进入完整 generate 流程
    When 用户明确说“按照最新画板重新生成”
    Then 才应开始新一轮 generate

  Scenario: 新项目必须先进入自适应 discovery，确认前不创建画板
    When 用户说“我想做一个万年历穿搭工具”
    Then 模型应调用 draw2code_create 的 action=start
    And 工具结果应返回 status 为 discovery
    And 工具结果应列出已明确事实、待解决维度和最多 10 题的剩余预算
    And 模型不应固定返回目标端、核心用户、模块或页面问题
    And 信息不足时模型应调用 action=propose_question 提交产品专属洞察和有取舍的选项
    And 信息足够时模型应调用 action=synthesize 提交完整 PrototypeBrief
    And workspace 中不应创建新的 Excalidraw 画板

  Scenario: 长需求描述不应直接成为画板名称
    When 用户说“万年历工具 可查看公历 农历 节假日 宜忌等传统历法信息的日历应用工具”
    Then Agent 应理解完整需求并概括出简短的语义化项目名
    And Agent 应把项目名作为 projectName 显式传给 draw2code_create
    But Agent 不应从原话截取前 N 个字符作为项目名
    And 用户确认后创建的画板名应直接使用 projectName
    And 画板名不应追加“原型”后缀
    And 完整需求描述仍应保存在项目简报中

  Scenario: 类比式产品描述应提炼为完整的核心产品名
    When 用户说“我想做一个类似龙珠雷达的陌生人社交APP”
    Then Agent 应根据产品语义概括项目名“龙珠雷达社交”
    And draw2code_create 不应自行从用户原话生成或裁剪名称
    And 用户确认后创建的画板名应为“龙珠雷达社交”

  Scenario: 项目简报必须是可直接绘制的完整原型文档
    Given 用户已明确个人四象限待办清单的核心场景、机制、首版流程和范围
    When Agent 调用 action=synthesize 提交 PrototypeBrief
    Then 工具应确定性生成同一份 briefMarkdown、pageBlueprints 和 pageMockData
    And briefMarkdown 应包含产品定义、原型结构、逐页页面目标、页面结构和真实 mock 数据
    And briefMarkdown 应包含页面关系、原型表达原则、验收方式和默认假设
    And 今日四象限页应包含至少 9 条真实任务
    And 编辑页应包含完整的真实编辑案例
    And ready 结果应完整展示 briefMarkdown 而不是“需求已整理完成”的摘要

  Scenario: discovery 每次只推进一个有洞察的问题并保存项目草稿
    Given 用户已经启动“万年历穿搭工具”的 draw2code_create 会话
    When Agent 提交“推荐应基于天气还是用户真实衣橱”的产品专属问题
    Then 问题应先展示 insight，再展示 2–4 个带价值和代价说明的选项
    And 工具应自动补充“还没想好”和“其他”
    And 模型应用 action=answer 提交 questionId 和 option id 后应返回 discovery
    And 项目草稿 revision 应递增
    And 重复提交同一个 revision 的同一个 mutation 应返回幂等结果

  Scenario: discovery 不能无限追问或重复模块和页面
    Given 用户已经连续回答 10 个产品决策问题
    When Agent 继续调用 action=propose_question
    Then 工具应返回 question_limit_reached
    And 要求 Agent 调用 action=synthesize
    But “需要哪些核心模块”和“需要画哪些核心页面”不应作为两道独立问题

  Scenario: 跳过或直接整理不会卡在待回答问题
    Given draw2code_create 当前有一个待回答的产品问题
    When 用户跳过本题
    Then Agent 应调用 action=skip
    And 该决策应保留为待验证假设
    And discovery 应继续判断其他高价值问题
    When 用户在原生问题卡片选择“直接整理项目简报”
    Then Agent 应把 synthesize-now 作为 answer 提交
    And discovery.nextAction 应为 synthesize
    And Agent 可直接调用 action=synthesize
    And 当前未回答问题不应阻止进入 ready

  Scenario: ready 后调整方向只重新打开受影响的决策
    Given 用户已看到完整 briefMarkdown
    When 用户选择“调整首版范围”
    Then Agent 应调用 action=propose_question 只追问受影响的一项
    And 旧 brief 与 briefMarkdown 应立即失效
    And 回答后应重新 synthesize 完整项目简报

  Scenario: 问题预算按完整历史计算且问题必须引用当前产品
    Given 一个依赖问题因修改历史答案而失效
    Then 该问题仍应保留在动态问题历史中并计入最多 10 题
    When Agent 给万年历穿搭产品提交陌生人雷达的连接问题
    Then 工具应返回 question_not_grounded

  Scenario: 用户回答“其他”时不应重复确认同一段原话
    Given draw2code_create 当前正在询问一个产品专属的触发场景问题
    When 用户选择“其他”并输入“每天下班后规划第二天”
    Then 工具应直接记录这条自由文字
    And 工具应返回 discovery 让 Agent 判断下一项最高价值的问题
    And 工具不应再返回 interpretation 复述确认
    And 用户只需在 ready 项目简报统一确认一次

  Scenario: 用户确认简报后才创建独立画板并交给 update
    Given 用户已经看过由 PrototypeBrief 确定性生成的完整 briefMarkdown
    And 当前活动画板“prototype”中有用户原有内容
    When 用户确认项目简报并调用 draw2code_create 的 action=confirm
    Then 工具应创建一个独立的新画板
    And “prototype”中的用户原有内容应保持不变
    And 新画板应为空
    And 工具结果的 nextAction 应为“draw2code_update”
    And 工具结果应返回新画板名称
    And confirmed.brief 应与用户刚才看到的简报来自同一份 PrototypeBrief

  Scenario: 新画板确认后应在当前 Harness 画布中可见
    Given draw2code_create 已确认并把新画板设为 activeBoard
    When 画码客户端轮询到 activeBoard 变化
    Then 画布应切换到新画板
    And agent 用返回的 boardName 调用 draw2code_update 后
    And 工具结果的 targetBoard 与 activeBoard 应相同
    And 画布应显示新增的普通矩形核心页面

  Scenario: grilling 中断不能被猜测成取消
    Given 用户已回答部分 create 问题
    When 用户关闭会话且没有选择任何结束动作
    Then 项目草稿状态仍应为 draft
    And 用户下次可以用 action=resume 继续同一 session
    When 用户明确选择放弃创建
    Then 项目草稿状态才应变为 abandoned
