# 验证记录

2026-10-06，Windows，.NET 10，Edge，MySQL 8.0.45。

## 构建

- `dotnet build MiniDevOps.csproj --no-restore`：通过，0 警告、0 错误。
- `dotnet publish MiniDevOps.csproj -c Release -o .runtime/publish-boards-v2 --no-restore`：通过。第一次发布遇到旧服务锁定 Release DLL；停止已核对身份的旧进程后重新发布成功。
- JavaScript 语法检查：通过。
- 开发机无法获取 nuget.org 服务索引时，使用公开微软镜像完成依赖还原：
  `dotnet restore --source https://pkgs.dev.azure.com/dnceng/public/_packaging/dotnet-public/nuget/v3/index.json`。

## 接口

`test/api.test.mjs`、`test/boards.test.mjs` 和 `test/project.test.mjs` 在独立 SQLite 临时数据库和 MySQL 临时数据库分别执行，两个数据库各 21 tests passed（包含父测试及场景）。SQLite 加上迁移测试共 22 项通过。每个 MySQL 测试文件使用全新数据库，执行后已清理。

- 首次初始化、登录会话、重复初始化拒绝、CSRF 及跨来源请求拒绝。
- 管理员创建账号、项目成员管理、跨项目访问拒绝、只读权限。
- 工作项创建、类型及状态校验、负责人和父项归属校验。
- “分配给我”、标题/编号/标签筛选及结果分页。
- 状态流转、并发版本冲突、评论保存与历史记录。
- 父子层级、循环关系拒绝、回收站及父子恢复顺序。
- 迭代日期校验、迭代筛选、个人查询隔离。
- 移除成员后撤销项目访问并清空该成员的分派。
- 服务重启后工作项及评论仍存在，原账号可以重新登录。
- 看板列独立于状态、同状态跨列移动、Doing/Done 分列、泳道、WIP 配置及配置版本冲突。
- 团队 Area 范围、待办排序持久化、容量扣除工作日和休假、避免重复扣除、任务归组、燃尽图缺失/未来日期留空。
- 查询嵌套条件、宏、字段白名单、共享文件夹、收藏、个人查询隔离和所有者权限。
- 关注、最近访问、复制、关系循环校验、危险链接拒绝、附件授权、评论编辑留痕。
- 批量更新与导入的事务回滚。
- 项目概览统计、管理员资料编辑、编辑冲突检查；迭代编辑日期及休假范围校验；删除保护已分配工作项、回收站工作项和团队默认迭代，空迭代删除后容量清理。

## 旧版升级

`test/migration.test.mjs`：1 test passed。使用独立的 v1 SQLite 固定数据集，逐字段比较原有九张数据表，确认 ID、状态、密码哈希、会话、评论、历史和查询保持不变；验证旧会话可继续访问、重启不会重复建团队或基线修订、原账号可登录、保留 PBI 的旧 Resolved 状态并正常编辑。

当前 MySQL 体验库升级前后账号/项目/工作项/评论均为 0，schema 从 1 更新到 2，首次设置状态保持不变。升级前的 SQL 备份保存在被忽略的 `.runtime/before-boards-v2.sql`。非空旧库数据保留由上述 SQLite 固定数据集验证，未宣称在非空 MySQL v1 生产数据上执行过迁移。

## 浏览器

`test/browser.mjs` 使用真实 Edge 无头浏览器，36 个场景检查通过：父项搜索、列表快速编辑、项目概览及资料编辑、迭代编辑、首次设置、新建、文本安全渲染、评论、评论后保存、状态修改、拖动卡片、搜索筛选、查询持久化、刷新恢复、层级待办、迭代、成员设置、看板设置、泳道、分列、快速创建、列与状态独立、父项任务板、容量编辑、燃尽图、查询条件编辑、查询执行、共享查询、查询图表、关注、附件上传、网页链接、分享工作项链接与关闭后刷新、CSV 预览/导入、手机宽度、退出及重新登录。没有捕获到 JavaScript 异常或 CSP 错误。

截图（测试生成的虚构数据，文件不提交 Git）：

- `test-results/work-items.png`
- `test-results/work-item-detail.png`
- `test-results/board.png`
- `test-results/configured-board.png`
- `test-results/sprint-taskboard.png`
- `test-results/sprint-capacity.png`
- `test-results/sprint-burndown.png`
- `test-results/query-editor.png`
- `test-results/query-chart.png`
- `test-results/attachments.png`
- `test-results/mobile.png`

## 样式对齐复查

重新读取真实 Azure 页面 DOM 和计算样式，按实际尺寸修正 48 px 图标导航、54 px 通知区域、列表工具栏、筛选条、固定列宽、14 px 正文、40 px 行高及首行选中样式。补充类型下拉菜单和 Boards 导航菜单。通知标注 Azure DevOps 来源；已按用户要求移除未在本地实现的产品侧栏图标。

样式更新后，原有 32 项 Edge 浏览器场景再次通过。额外在临时测试数据库中检查导航展开/收起、Boards 菜单、筛选显示/隐藏、更多操作菜单、选中后批量编辑入口和全宽详情页；检查桌面页面无多余纵向滚动、手机宽度无页面横向溢出。人工查看了 1600×1000、2048×1030 和 390×844 截图。表格各列位置/宽度、首行位置/高度与同尺寸原站测量值一致，详见 VISUAL_COMPARISON.md。截图使用虚构数据：

- `test-results/azure-work-items-desktop.png`
- `test-results/azure-work-items-wide.png`
- `test-results/azure-detail-wide.png`
- `test-results/azure-detail-mobile.png`

静态文件已同步到本地运行服务和发布目录；本轮不涉及数据库结构修改。

## 本地运行

### Capacity 图标与编辑入口对齐

容量页改为成员头像／休假天数／活动下拉／每日容量列布局，统一使用 SVG 保存、撤销、添加、移除图标，新增个人及团队休假日期选择器。Save / Revert 仅在草稿改变时启用；成员增减和休假选择只修改草稿，点击 Save 才写入。切换页面、迭代或项目时提示未保存容量；原有剩余容量和工作量保留在可展开区域中。

浏览器回归通过，并新增容量脏状态、撤销恢复、休假持久化、成员移除再添加及整体撤销检查。相关接口在 SQLite 和 MySQL 分别通过 8 项场景。实际本地页面检查按钮状态、撤销、日期选择器及管理员账号下 Reason 的可编辑性；未保存实际容量或工作项内容。截图：`live-capacity-aligned.png`、`live-capacity-days.png`、`live-state-reason.png`，位于 `test-results/`。发布目录为 `.runtime/publish-capacity-v5`。

原站截图里的 System.Reason 是流程管理的状态变更原因；本地 reason 字段仍为可选补充说明，未改为模拟原站自动流程，也未改变现有数据。只读成员或回收站工作项仍禁止编辑。

### 周迭代与层级安排

- `test/weekly.test.mjs` 在临时 SQLite 和 MySQL 库各通过 4 tests：跨年七天日期、重复创建复用、同名冲突时整批回滚、只读权限、预览不写入、子项版本冲突、新增子项后拒绝旧预览、跨项目目标拒绝、只移动父项与清空迭代、Done 保持状态、回收站项目不移动。
- 全部 SQLite 接口及迁移测试共 26 项通过；浏览器原有场景加上周迭代预览创建、周次导航、需求及子任务安排检查通过。
- 发布到 `.runtime/publish-weekly-v4`。写入前备份在 `.runtime/before-weekly-planning.sql`。本地项目新增 6 个周迭代，34 条带演示标签的工作项重新安排到周次；原有 10 条基础工作项不变，总数仍为 58。
- 真实本地页面只读验证：自动定位 Wk02、切换 Wk03 后返回本周、打开层级安排预览、读取本周容量；截图 `test-results/live-weekly-sprints.png`、`test-results/live-weekly-schedule-preview.png`。不补造历史燃尽数据，容量仍按每个团队、每次迭代配置。

### 工作项详情页导航修复

工作项编辑器改用非模态显示，仅将背后的内容区设为 inert，左侧导航和顶部项目切换保持可用；普通表单继续使用模态弹窗。导航、切换项目、打开其他表单前检查未保存修改；取消离开时保留草稿和当前项目，关闭后恢复内容区交互。

原有 36 项浏览器场景通过，新增 7 项检查覆盖真实鼠标点击左侧导航、取消离开保留草稿、确认丢弃、取消项目切换、阻止其他弹窗覆盖草稿、普通弹窗模态行为及 Esc 关闭。导航测试使用 CDP 鼠标事件，避免脚本 `.click()` 绕过浏览器模态隔离而漏检。另在本地 MySQL 服务登录后验证新建页打开 Boards 菜单并进入 Backlogs，未写入测试工作项；截图为 `test-results/live-editor-navigation.png`。静态文件及缓存版本已同步到运行服务和发布目录。

- Release 服务运行在 `http://localhost:3220`，首页 HTTP 200。
- `/api/health` 返回 `status=ok, database=mysql, version=2.1.0`；Release 发布目录为 `.runtime/publish-project-v3`。
- 正式体验数据库为独立 `mini_devops`，使用专用、仅获该数据库权限的账号。
- 已按用户请求创建管理员账号，`/api/setup` 返回 `required=false`；账号密码不写入源码或本文档。浏览器自动化使用独立临时测试数据库。

## 2.1 演示项目验证

- 写入前已备份 MySQL 到 `.runtime/before-project-enhancements.sql`。原有 10 条工作项保留，新增 48 条后共 58 条；新增 3 位演示成员、1 个演示团队、前后两个迭代、8 条评论、2 条依赖、1 个附件和 5 个共享查询。
- 示例脚本在独立临时 SQLite 库连续执行两次，第二次新增工作项、成员、评论和查询均为 0。
- 真实本地 MySQL 服务登录后，Edge 检查工作项列表、项目概览、演示看板泳道、迭代任务板、容量和共享查询，未捕获 JavaScript 异常或 CSP 错误。执行 5 个共享查询均有结果：需求 10、受阻 2、当前迭代未完成 28、我的待办 20、高优先级 Bug 5。
- 查看了 `test-results/live-demo-project.png` 和 `test-results/live-demo-board.png`；同目录保存了列表、迭代、容量、查询页面截图。此检查只读取已有项目数据，不进行测试用工作项写入。
- 构建与发布通过，0 警告、0 错误。燃尽图依赖实际修订记录，演示脚本没有伪造历史数据。

未验证大规模数据性能、多实例部署或外部 Azure DevOps 同步。当前实现范围及限制见 README。
