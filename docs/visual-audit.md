# Azure Boards 复刻核对记录

2026-10-07：以现有身份只读访问 Vienna / Nimbus 的原始页面，按 1600 × 1000、浏览器 100% 缩放重新采集。原站截图和页面结构记录保存在本机 `.runtime/azure-reference/audit/ui-*.png`、`ui-*.json`，不提交公司页面内容或登录凭据。

## 本轮核对与修改

| 页面 | 核对结果与处理 |
| --- | --- |
| Work items | 重新采集并检查列表、导航、过滤和工作项入口；沿用此前按原版调整的布局。 |
| 工作项详情 | 重新检查固定头部、属性区、三栏内容、菜单和滚动；保存、撤销、评论、链接与附件通过浏览器回归。 |
| Boards | 去掉常驻过滤栏，改为工具栏切换；层级选择器移到右侧；列宽 220 px、列间距 4 px、卡片宽 204 px。图标、ID、标题同行，修正类型色条和标签溢出。保留 WIP、泳道与分栏。 |
| Backlogs | 删除重复页面标题；命令移到右上；表头提供展开/折叠，列表行高 36 px；规划栏默认收起，可从视图选项打开；列显示设置持久化。 |
| Queries | 改为单一目录列表、共享表头、Favorites / All 切换、右侧搜索和命令栏；支持过滤、目录展开、查询执行与编辑。 |
| Sprints | 复查已有周迭代选择器、任务板、折叠和卡片；原版相同内容的 12 张任务卡宽高比较已通过，任务列 204 px、卡片 186 px。 |
| Capacity | Add user / Save / Revert 移到顶部命令栏；保留表单关联与未保存修改保护；删除表格上方多余命令行，把工作日说明收进容量明细。 |
| Analytics | 检查燃尽图和每日数据，保留真实历史数据；没有记录的历史日期不补造曲线。 |

## 验证

详情标签一致性修复：详情头部现在读取编辑表单的同一个 Tags 字段，展示已有标签、编辑入口与移除按钮。撤销恢复原值，保存后卡片同步更新。浏览器回归验证了新增、移除、撤销、特殊字符显示、保存重开及 Sprint 卡片数据一致；本机工作项 36 的卡片与详情三项标签逐项一致，窄屏编辑框不超出视口。

卡片标签专项复查：原站 Taskboard 确实显示 `Nimbus DRI agent`、`icm` 等工作项标签。本地 `MiniDevOps-Demo`、`Demo:pbi-edit`、`Nimbus v1.0` 是演示数据的字段值，并非原站固定 UI。此次统一 Boards / Sprints 标签组件，放在负责人之后；按原站实测使用 22 px 标签高度、12 px 字号、8 px 顶部间距、34 px 每行占高及 12 px 列表底部间距。单标签及双标签的实际宽高与原站匹配；无标签的 12 张卡片尺寸仍通过对照。工作项数据未删除，标签显示开关继续生效。

- `node test/browser.mjs`：隔离测试数据库中的完整交互回归，包括真实鼠标点击顶部容量保存、撤销、休假、查询筛选、规划栏、列设置、看板配置、拖动、详情导航及周迭代。
- `node test/ui-review.mjs`：登录本机实例，生成八个桌面页面及五个窄屏页面截图，检查页面整体横向溢出及浏览器错误。默认使用本项目已填充的演示实例；容量和分析页选择团队 1、迭代 5。账号从 `DEVOPS_SEED_LOGIN`、`DEVOPS_SEED_PASSWORD` 环境变量读取，地址可用 `DEVOPS_REVIEW_URL` 覆盖。该检查不修改工作项数据。
- 本机结果：`test-results/browser-results.json`、`test-results/ui-review-results.json`；截图 `audit-after-*.png`、`audit-mobile-*.png`。

## 仍有差异，不能据此声称完整复刻

### 顶部搜索与扩展市场入口（2026-10-07）

按用户要求移除购物袋（外部扩展市场）入口。原顶部 Search 只是聚焦页面筛选框的按钮，现改为可直接输入的搜索表单，回车或点击搜索图标提交。搜索当前项目的工作项标题或编号（支持 `#编号`），包含已完成项，并清除之前的负责人、团队、状态、迭代等过滤条件；结果仍显示在工作项列表。团队切换器搜索仅匹配团队名称，两者范围不同。当前不是 Azure DevOps 的跨项目全文索引搜索。

本机桌面与窄屏验证覆盖编号搜索、无结果和清空；浏览器回归还覆盖中文标题、跨页面提交、项目范围、已完成/未分配项、结果打开和未保存编辑保护。截图 `test-results/live-global-search.png`、`mobile-global-search.png`。

### 团队看板切换器与目录（2026-10-07）

已只读访问原站 Nimbus 团队切换器和 `/Vienna/_boards/directory`。切换器宽 480 px，列表行高 48 px，按我的团队、其他团队分组；搜索 Nimbus 只返回 My team boards 中的一项。目录包含 Continue where you left off、My favorite boards、My team boards、All team boards，最后一组默认折叠。证据在 `.runtime/azure-reference/audit/team-picker.json`、`boards-directory.json/png`。

本地实现团队搜索、空结果、当前选择、上下键/Enter/Escape、点击外部关闭、目录筛选/折叠、团队跳转和收藏。收藏和最近访问按账号存入数据库，团队资料读取独立成员关系；管理员可在资料面板添加或移除现有项目成员。迁移仅将旧项目成员归入默认团队，不推断额外团队的成员关系；项目访问权限与团队分组仍是不同概念。移除项目成员同时清理其团队关系和看板偏好。

schema 5 已在本地 MySQL 升级，升级前备份 `.runtime/backup-team-directory-v4.sql`。33 项 API/迁移测试通过；完整浏览器回归覆盖分组、搜索、键盘跳转、收藏增删、成员维护与目录往返。本机桌面及 390 px 窄屏验证通过，截图 `test-results/live-team-picker.png`、`live-boards-directory.png`、`mobile-team-picker.png`、`mobile-boards-directory.png`。

### 状态颜色（2026-10-07）

只读查询 Vienna 的 Epic、Feature、Product Backlog Item、Task、Bug 状态定义，并核对原站看板 DOM：New/Approved/To Do 为 `#B2B2B2`，Active/Committed 为 `#007ACC`，Done 为 `#339933`，Removed/Resolved 为白色。Bug 的 In Progress 为 `#FBE74B`，In Review 为 `#5688E0`；Task 的 In Progress 为 `#007ACC`。本地状态圆点按类型与状态共同选择颜色，详情、列表、看板、Sprint 和相关工作项共用渲染方法；修改类型时立即更新圆点。详情目前仍使用原生 select，其展开菜单的选中背景由浏览器绘制，不代表状态颜色。

### 项目选择与父子关系核对（2026-10-07）

直接读取原站工作项 5237764 和 5486475 的 relations：`Hierarchy-Reverse` 为 Parent，`Hierarchy-Forward` 为 Child；5486475 的 Parent 指向 5237764，5237764 的 Child 列表包含 5486475。本地 `parent_id` 保存父项 ID，详情的 Parent 和 Child 双向读取与此一致。浏览器核实本地 #36 的 Parent 为 #35，#35 的 Child 包含 #36。

早期初始示例把 Task/Bug 全部直接挂在 Feature 下，现修正初始化代码以及已确认的 6 条原始示例，采用 Epic → Feature → PBI → Task/Bug；修改前关系保存在 `.runtime/seed-parents-before-repair.json`。这是示例组织方式的调整，不将工作项类型层级设为强制校验规则。API 测试覆盖更换/移除父项的双向更新，以及自循环、间接循环保护。

项目选择框原先按最长选项撑宽，现按当前项目名称自适应宽度，保留原生键盘选择。Edge 实测 My Project 为 90 px，较长项目名为 180 px；切换项目与详情导航验证通过。

### Nimbus Board 逐项核对（2026-10-07）

本轮直接访问 `_boards/board/t/Nimbus/Backlog%20items`，读取实际 DOM 和计算样式，并点击 Task 计数确认其展开内容。纠正前次判断：原版有按工作项类型分开的 annotations，默认收起；展开后包含 Add Task、复选框、类型图标、16 px 头像和单行截断标题。本地此前的统一子项清单不符合该结构，现改为按类型统计及展开。

- 列宽 220 px、列间距 4 px、卡片宽 204 px、卡片纵向间隔 8 px、内容边距 12 px。修正重复内边距导致卡片窄 16 px 的问题。
- 状态行、负责人行、类型计数分别按原站测量，未分配负责人不保留空行。计数忽略 Removed 与回收站子项。
- 原站同一组 76 张卡片仅用于隔离浏览器布局对照，没有导入本地工作项。76 张宽度一致，73 张高度一致；其余样本缺少原站标签或 PR 标记数据。截图和测量数据在 `.runtime/azure-reference/audit/board-fixture.json`、`test-results/nimbus-fixture-local.*`。
- 增加已核实的字段收起、首尾列折叠、团队收藏/资料、页面全屏、卡片编辑标题、移动列/迭代/位置、按类型添加子项与删除。默认隐藏原站当前配置未展示的 Effort。
- 浏览器回归覆盖分组统计、默认收起、完成状态保存、Task/Bug 切换、字段及列折叠、行内编辑、移动、团队入口和全屏退出。本机 MySQL 已验证分类统计返回。

尚不能称为整个页面及全部功能 1:1：Feature Timeline 和 Epic Roadmap 已确认来自 `ms-devlabs.workitem-feature-timeline-extension` 的独立 iframe；它们与 PR、Git 分支、Excel 集成尚未在本地实现。看板设置和 Analytics 仍有布局及能力差异。这些入口不以自创功能冒充原版。

2026-10-07：树形、直接链接和跨项目查询，以及跨团队交付计划已补齐可用流程。原站 Delivery Plans 目录已只读查看；本地新增查询编辑器、树形结果、跨项目关联结果、计划配置与时间线截图。31 项 API/迁移测试通过，浏览器覆盖查询保存重开、目标项目编辑器、计划配置、排期保存及拖动；尚未实现的原站高级计划交互列在功能对照中。

- 查询修改记录已补齐，目录显示 Last modified by；升级前没有记录的信息明确显示“未记录”。更多查询能力差异见 [功能对照](boards-capabilities.md)。
- Backlogs 当前保留默认展开的多层父子结构；原版可按团队设置只显示当前层级。列集合也取决于本地已支持的字段。
- Analytics 尚无原版的高级度量配置、预测及全部统计指标。
- 原站扩展的安全审查、发布状态、AI Summaries、GitHub/分支、Excel、模板与 Portfolio 集成尚未实现，不放置假按钮。
- 团队收藏、部分图标及工具栏细节尚未逐项达到像素一致；不同语言、项目数据和卡片字段配置也会影响换行及高度。
- 已按用户要求移除与 Mini Boards 无关的产品导航；不恢复那些入口。

后续改动先在原版确认页面结构、入口与交互，再在本机实现，最后重复截图与交互验证；此清单用于主动跟踪差异，不要求用户继续逐项找错。

### Work items 行菜单（2026-10-07）

只读访问原站列表并展开三个点，确认原菜单为 Open selected items in Queries、Copy to clipboard、Email...、Delete。移除本地误用的操作模态框，改成按钮下方浮层，无标题、页脚或灰色遮罩。原站菜单外框实测 244.22 × 144 px，上下内边距 8 px，菜单项高 32 px，图标 16 px，图标与文字间距 12 px，圆角 4 px；本地同窗口实测尺寸一致。

支持多选工作项按 ID 打开查询、复制编号/标题/链接、移入回收站，并处理窗口边缘定位、点击外部、Esc 关闭和方向键导航。Email... 使用本机邮件客户端草稿，不等同于 Azure 的服务端邮件功能。浏览器回归通过；本地 MySQL 页面只读截图验证通过，测试删除仅操作隔离测试数据库。参考与本地截图分别在 `.runtime/azure-reference/audit/workitems-row-menu.png`、`test-results/live-workitem-row-menu.png`。
