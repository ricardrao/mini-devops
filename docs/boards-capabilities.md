# Azure Boards 与 Mini DevOps 功能对照

2026-10-07 只读检查了 Vienna 的 Queries 目录、新建查询编辑器及 Boards 导航菜单。这里区分实际已实现的功能、Azure 内置模块和组织安装的扩展。

## 当前 Queries

| 能力 | 本地状态 |
| --- | --- |
| My Queries / Shared Queries | 已有，私有查询和共享查询有服务端访问控制 |
| AND / OR 嵌套条件、@Me、@Today±天数、In、Area Under | 已有，按选择的项目范围与当前账号权限执行 |
| 保存、另存为、收藏、运行、结果导出 | 已有；修复收藏操作后没有立即刷新的问题 |
| 文件夹层级 | 现在按 `/` 分层显示，支持逐级展开、过滤和保留展开状态 |
| 重命名、移动查询 | 现在可从行菜单操作，保留条件，校验权限和版本 |
| 最后修改人和时间 | 新增服务端记录，创建/编辑查询和创建文件夹会记录真实操作人、时间；历史空值显示“未记录” |
| 查询图表 | 当前仅支持已加载结果的状态分布，明确标记统计范围 |
| 树形查询 | 已实现源项与子项独立条件、保留匹配路径上的祖先、展开/折叠、保存重开 |
| 直接链接查询 | 已实现 Related、Parent/Child、Predecessor/Successor、Duplicate；正向/反向/双向及必须/可选/无匹配链接 |
| 跨项目查询 | 已实现全部可访问项目或指定项目范围；每次执行重新校验权限，结果显示项目并可打开对应项目的编辑器 |
| WIQL 编辑器、完整查询图表配置 | 尚未实现 |

数据库升级至版本 3，只增加 nullable 的修改记录字段，不伪造历史时间、不改变原有查询条件。迁移测试覆盖旧数据保留与重复启动；接口测试覆盖实际修改人、原所有者保留、移动、权限及版本冲突；浏览器测试覆盖目录、重命名/移动和收藏刷新。

2026-10-07 后续升级至版本 4，新增持久化 Delivery Plans：一个计划可配置最多 20 个团队/层级行，支持跨项目、4/8/12 周时间窗口、未排期列表、选择或拖动迭代排期、工作项详情、前后置依赖与排期重叠提示。配置和排期均校验版本；计划按当前访问权限隐藏团队，修改工作项链接要求两端项目的写权限，并检查跨项目依赖循环。

本地入口：Queries → New query → Query type / Query across projects；Boards 导航 → Delivery Plans。演示查询位于 Shared Queries，交付计划“跨团队版本交付示例”包含 Experience 和 Platform 两个项目的团队。

当前边界：平面结果每页最多 500 项；树形/关联查询范围最多 5000 项，关联结果最多 15000 行；交付计划每个团队/层级最多 2000 项。计划目前按迭代日期排期，依赖以列表及冲突提示呈现，尚未实现原版按工作项起止日期拖拽缩放、里程碑和连线覆盖层。这些限制会显式报错或说明，不默默截断树形或计划数据。

## 截图中的菜单来源

| 入口 | 在该组织中确认的来源 | 本地状态 |
| --- | --- | --- |
| Work items / Boards / Backlogs / Sprints / Queries | Azure Boards 内置 | 已有核心流程，未达到全部功能一致 |
| Delivery Plans | 内置 `_deliveryplans/plans` | 已有跨项目/团队迭代时间线、排期、依赖提示和计划管理；功能边界见上文 |
| Analytics views | 内置 `_analytics` | 尚无 Analytics 数据视图；现有燃尽图不是该模块 |
| Retrospectives | `ms-devlabs.team-retrospectives` 扩展 | 未实现 |
| Wiql Playground | `ms-devlabs.wiql-editor` 扩展 | 未实现 |
| Portfolio plans (Beta) | `ms-devlabs.workitem-feature-timeline-extension` 扩展 | 未实现 |
| Estimate | `ms-devlabs.estimate` 扩展 | 未实现 |
| Areas | 此菜单项是 `ms-eswm.areas` 扩展 | 有基础 Area Path，未实现该扩展视图 |
| Dependency Tracker | `ms-eswm.dependencytracker-int` 扩展 | 有工作项链接，未实现依赖关系追踪界面 |
| My Work | `ms-eswm.mywork` 扩展 | 有 Assigned to me，未实现该扩展模块 |
| Tags | `YodLabs.TagsManager2` 扩展 | 有工作项标签，未实现项目级标签管理器 |

导航中的同名功能不能直接等同：卡片 Tags 与项目标签管理器不同，Assigned to me 与 My Work 扩展也不同。后续扩展应围绕真实的数据和操作实现，而非仅添加导航名称。
