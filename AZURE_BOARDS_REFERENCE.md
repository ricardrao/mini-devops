# Azure Boards 参考与实现范围

2026-10-06，经用户授权，使用当前用户的既有登录凭据，以只读方式访问 `https://msdata.visualstudio.com/Vienna/_workitems/assignedtome/`，并查看 Vienna 项目下 Nimbus 团队的相关页面与 REST 元数据。没有保存线上工作项、查询或配置，也没有把真实工作项导入本地应用。

## 实际查看的内容

使用真实 Edge 浏览器打开 Work items、工作项详情、Nimbus Backlog items 看板、Backlogs、Sprints Taskboard 和 Queries。进一步打开工作项更多操作菜单、未保存的新建查询编辑器、Sprint Capacity、Sprint Analytics，以及列表 Column Options。REST 读取了团队、工作项类型及状态、看板配置、迭代等元数据。

看板接口返回当前身份 `canEdit=false`，因此列配置细节来自读取配置，并未在线保存配置来试验。没有验证这个账号无法访问的管理功能，也没有把菜单中所有命令都执行一遍。认证信息、线上内容和参考截图只保存在 Git 忽略的本地运行目录中。

## 功能对照

| 页面 | 观察到的行为 | Mini DevOps 2.0 |
| --- | --- | --- |
| Work items | 个人视图、筛选条、列与排序、导入、回收站 | 列表、个人视图、列顺序、多字段筛选、CSV 预览导入、批量修改、回收站 |
| 详情 | 类型与状态、负责人、Area/Iteration、规划字段、讨论、历史、链接、附件、关注及更多操作 | 五种主要类型、工时与 Bug 字段、Markdown 预览、评论编辑留痕、版本冲突、关系/附件/关注/复制/子项 |
| Boards | 团队和层级、可配置列、泳道、分列、WIP、卡片字段 | 独立保存列位置与状态，支持相应配置和拖动、快速创建、子项清单 |
| Backlogs | Epic/Feature/Backlog items 层级、顺序、展开、迭代规划 | 层级树、同类型排序、拖到迭代、团队 Area 范围 |
| Sprints | 以父项分组的 Taskboard、Unparented、Remaining Work | 父项任务泳行、独立任务状态流转、迭代待办、剩余工时 |
| Capacity | 工作日、成员每日容量与活动、个人休假、团队休假 | 计算扣除休假后的总容量及剩余容量，对比 Task/Bug 工作量 |
| Analytics | 迭代剩余工作趋势、理想线 | 本地修订快照燃尽图、工作日理想线、每日数值表；缺失历史留空 |
| Queries | My/Shared、目录、收藏、Field/Operator/Value、And/Or、Results/Editor/Charts | 私有/共享查询、文件夹、收藏、嵌套条件、宏、结果表、按状态图表 |

## 对实现有影响的细节

- Nimbus Backlog items 看板实际有 New、Approved、Active、Committed、In Progress、In Review、Resolved、Done 八列。其中 In Progress、In Review、Resolved 映射到 PBI 的 New 状态，说明列不能简单等同于状态。本地默认配置保留这种映射，可单独修改。
- 类型的状态集合不同。参考的 Task 包含 To Do、In Progress、Active、Done、Removed；Bug 包含更多状态。后端按类型验证，界面同步提供对应选项。
- WIP 上限可以被超过，原版会显示例如 33/5；本地实现为视觉提醒。
- Nimbus 把 Bug 视为任务层级，本地 Sprints 和 Tasks / Bugs 也采用这一安排。
- 项目实际包含 24 种工作项类型及许多企业定制字段。本地选择 Epic、Feature、Product Backlog Item、Task、Bug 五类作为核心，而不是复制组织内部流程。

## 明确的差异

### 按周迭代复查（2026-10-07 UTC）

再次只读打开 Nimbus 的 Sprints 页面并展开迭代选择器。当前页自动定位到 `Vienna\Strontium\CY26Q4\Weekly\Wk02 (Oct 04 - Oct 10)`；上周为 `Wk01 (Sep 27 - Oct 03)`。每个周迭代具有独立的起止日期，本团队按周日到周六划分，工作日配置为周一到周五。

选择器列出团队已选择的迭代，标记 Past / Current / Future，并提供 New Sprint。团队 REST 设置的 `defaultIterationMacro` 为 `@currentIteration`。当前读到的 32 个团队迭代中还包含一个跨季度的未来 Weekly 节点，因此不能将所有迭代都假定为七天，也不能将 Wk 编号等同于 ISO 年度周数。

复查时本地 Sprint 1 的日期是 2026-10-06 至 2026-10-19，属于两周示例；当时缺少原站的 Past / Current / Future 标记及便捷的连续周迭代创建流程。后续已按用户请求加入分组、连续周创建、周次导航及预览后一起安排父子工作项，并保留原有两周迭代。原站仅只读访问，没有修改线上数据。尝试的 `_plans` 地址返回 404，没有据此推断该组织是否启用了 Delivery Plans。

- 不实现组织特有的 IcM、安全扫描、Viva Goals、Feature Timeline、Epic Roadmap 和其他扩展，也不实现 Repos/Pipelines/Test Plans。
- 不连接 Azure 数据同步、Entra SSO、邮件通知；账号与数据独立管理。
- 列、泳道及卡片可配置，但没有完整流程/字段设计器、状态转换规则编辑器或模板系统。
- Queries 是当前项目的平面列表查询；不支持 WIQL 原文、树形/直接链接查询、跨项目查询及完整图表设计器。
- Capacity 每个成员每次迭代配置一种活动，没有多活动拆分或复制前一迭代容量。团队 Area 范围用于筛选，不额外隔离项目内权限。
- 燃尽图从本地快照开始累计，理想线采用当前范围；不能恢复 Azure 历史，不能将升级当天快照当作过去的实际值。
- 详情提供基础 Markdown 编辑与预览，没有完整富文本或附件图片内联编辑。复制工作项不复制评论及附件；不支持跨项目移动。
- 数据量和附件限制见 README；尚未验证大型组织负载、多实例部署或完整 Azure REST API 兼容性。
