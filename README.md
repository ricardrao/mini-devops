# Mini DevOps

独立运行的团队工作管理应用，后端使用 **C# / ASP.NET Core 10 + MySQL / SQLite**，前端工程使用 **React / TypeScript / Fluent UI / Vite**。登录与首次设置已使用 React，已有业务页面通过兼容层保留。界面参考 Azure Boards 的工作项、看板、Backlogs、Sprints、Capacity、Analytics 和 Queries 页面；数据、账号和工作流程由本地应用管理。目录与迁移边界见 [架构说明](docs/architecture.md)，界面对照见 [参考记录](docs/AZURE_BOARDS_REFERENCE.md)。

## 启动

安装 [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) 和 [Node.js 24+](https://nodejs.org/)。Windows 双击 `start.cmd` 会构建前后端并启动，访问 **http://localhost:3220**。首次打开时创建管理员账号，可选择添加示例数据。没有默认账号或密码。

跨平台构建和运行：

```sh
npm ci --prefix frontend
npm run build --prefix frontend
dotnet build MiniDevOps.slnx
dotnet backend/MiniDevOps.Api/bin/Debug/net10.0/MiniDevOps.dll
```

独立开发时，在两个终端分别运行：

```sh
# 后端 API（3220）
dotnet run --project backend/MiniDevOps.Api/MiniDevOps.csproj
# 前端开发服务器（5173，代理 /api 到后端）
npm run dev --prefix frontend
```

开发时访问 **http://127.0.0.1:5173**。发布后的运行环境只需要 .NET，Node.js 用于前端构建和测试。应用不依赖 Azure DevOps 账号或内部服务。Windows 启动端口可通过 `start.cmd -Port 3221` 修改。

## 数据库

当前开发机配置独立 MySQL 数据库及专用账号；连接字符串保存在被 Git 忽略的 `.env` 中。项目自带的源码不包含连接密码。

在其他机器配置 MySQL 8.0（使用 utf8mb4）：

```sql
CREATE DATABASE mini_devops CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
CREATE USER 'mini_devops'@'localhost' IDENTIFIED BY 'replace-with-your-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
ON mini_devops.* TO 'mini_devops'@'localhost';
```

复制 `.env.example` 为 `.env` 并设置连接字符串。首次启动自动建表；数据库由管理员预先创建。应用不会自动切换数据库。

没有 `.env` 时，默认使用 SQLite 文件 `data/devops.db`，适合免配置体验。切换数据库不会迁移已有数据；请在首次使用前选择数据库。MySQL 和 SQLite 均已通过核心接口测试。

## 功能

Capacity 支持活动下拉、个人／团队休假日期选择、添加或移除本迭代容量成员。更改先保存在页面草稿，Save 写入、Revert 恢复；日期与成员权限由服务端验证。头像使用姓名缩写，剩余容量与工作量可展开查看。工作项 Reason 在本应用中是可选的状态补充说明，支持编辑；Azure DevOps 原版由流程生成的 System.Reason 与此不同。

### 按周迭代

Sprints 的“连续创建周迭代”支持预览并创建 1–26 个连续七天周期，可自选开始日、名称前缀和起始周编号。同名同日期的迭代会复用，同名不同日期时整批拒绝。下拉框按当前、未来、过去分组，周卡片支持直接跳转，上周／本周／下周按钮用于切换。未明确选择迭代时优先使用团队指定的默认迭代；未指定默认值时定位当前日期覆盖的最短周期。日期按 UTC 判断。

在 Backlogs 中把工作项拖到 Planning 的目标迭代，或在 Sprints 父项旁点击“安排迭代”，可预览后一起安排需求及全部子工作项，也可以取消包含子项。预览明确包含已完成项；已删除和 Removed 工作项不移动。确认时校验整个层级及每条记录版本，任何冲突都会拒绝整批修改；状态、负责人及工时保持原值，不会自动将未完成项滚动到下一周。

2.1 增加项目概览（完成、受阻、逾期和剩余工时，可点击筛选）、项目资料编辑、迭代编辑与空迭代删除、列表状态/负责人快速编辑，以及详情页父工作项搜索。项目及迭代编辑会拒绝过期表单；删除迭代会检查工作项、回收站和团队默认值。

### 完整演示数据

`scripts/seed-demo.mjs` 为指定项目添加 Nimbus v1.0 演示：2 个 Epic、4 个 Feature、10 个需求、24 个任务、8 个 Bug，包含父子关系、估算和工时、验收条件、8 条评论、2 条依赖、发布清单附件、3 位演示成员、演示团队容量及 5 个共享查询。复用当前迭代，并补充前后两个迭代；没有当前迭代时自动创建。

使用 Node.js 24，在环境变量中设置 `DEVOPS_SEED_LOGIN`、`DEVOPS_SEED_PASSWORD`（已有管理员账号）后执行 `node scripts/seed-demo.mjs`。可选 `DEVOPS_BASE_URL`（默认 `http://localhost:3220`）、`DEVOPS_SEED_PROJECT_ID`（默认 `1`）。演示账号使用随机密码，仅用于分派展示；脚本不会输出或修改现有账号密码。

脚本按稳定标签识别已有演示工作项，可重复执行；已有工作项内容和现有团队配置不会被覆盖。演示团队名为“产品交付演示”，Area 为 `Demo\Nimbus`。燃尽图仅使用实际记录时间，不补造历史工时。

界面按实际 Azure Work items 的尺寸配置窄图标导航、工具栏、固定列宽和 14px 正文。绿色 Boards 菜单包含本地 Work items、Boards、Backlogs、Sprints 和 Queries。左下角可展开导航；列表右上角提供更多筛选、全屏及更多操作。工作项在全宽编辑页打开，按描述、规划字段和关联工作分栏。

顶部可关闭的通知明确标为 Azure DevOps 组织通知并链接回原站，不适用于本地账号。产品图标来自原站的公开静态资源，来源保存在 `frontend/public/assets/azure/sources.json`。尺寸对照见 [VISUAL_COMPARISON.md](docs/VISUAL_COMPARISON.md)。

- 本地账号登录、修改密码、管理员创建账号；项目编辑者与只读成员权限。
- 多项目、项目成员管理；普通成员只可访问加入的项目。
- 工作项列表：分配给我、由我创建、关注、最近访问、全部和回收站；多字段筛选、排序、翻页、列选择和列顺序。
- Epic、Feature、Product Backlog Item、Task、Bug，按类型校验状态；描述、验收标准、简单 Markdown 预览、估算点数、工时、原因、目标日期、阻塞标记及 Bug 复现信息。
- 团队看板：层级切换、列与状态独立映射、拖动卡片、快速创建、泳道、Doing/Done 分列、WIP 提示、完成定义及卡片字段配置。
- Backlogs：父子树、展开折叠、同类型排序、拖到迭代安排工作；团队按 Area Path 筛选范围。
- Sprints：按父项分组的 Taskboard、待办、工作日/个人休假/团队休假与每日容量配置、剩余工作量及燃尽图。
- 工作项关注、复制、创建子项、关联/依赖/重复关系、网页链接、附件上传和下载；校验项目边界与依赖循环。
- 评论与评论编辑记录、工作项历史、版本冲突检测，防止覆盖其他人的更新。
- Queries：My Queries、Shared Queries、文件夹、收藏、条件编辑器、And/Or 嵌套组、比较及包含操作、@Me 和 @Today±天数、结果表和状态分布图。
- 回收站与恢复；有活动子项时不能删除父项，恢复子项前需要先恢复父项。
- 批量编辑、CSV 导入预览及当前页导出；导入或批量更新任一行无效时整批回滚，导出处理表格公式注入。

工作项列表每页 100 项，看板最多 2,000 项，层级待办最多 500 项，迭代最多 5,000 项。CSV 每批最多 200 项；附件每个最多 2 MB，每项最多 20 个/合计 20 MB。估算点数是非负整数，工时支持两位小数。WIP 为超限提示，不阻止移入卡片。

项目范围内的只读成员可以保存自己的查询。管理员具有所有项目的管理权限；分派负责人时仍需要选择项目成员。

这是以 Boards 为核心的 Mini DevOps，不包含 Repos、Pipelines、Test Plans、Azure 数据同步、邮件通知、完整富文本编辑、组织流程设计器或企业扩展。查询支持平面、树形、关联查询和按权限过滤的跨项目查询；交付计划支持跨项目、跨团队查看迭代与依赖。尚不支持完整 WIQL 和 Azure 的全部扩展，具体边界见 [功能对照](docs/boards-capabilities.md)。每个成员每次迭代配置一种容量活动；团队筛选范围不构成额外权限边界。

燃尽图依据本地保存的工作项修订计算 UTC 每日剩余工时；升级前缺少快照的日期和未来日期留空，不伪造历史。理想线按当前估算范围和工作日计算，不是冻结的迭代初始基线。示例数据为虚构内容，不会导入或修改真实 Azure DevOps 工作项。

启动会自动升级到 schema 5，保留账号、工作项编号、状态、评论、查询和会话。升级前请备份数据库；MySQL DDL 自动提交，升级包含存在性检查，可在中断后重试。原版已有的 PBI `Resolved` 状态保持原值，编辑其他字段不会强制改状态。schema 5 增加独立团队成员、个人看板收藏和最近访问；旧项目成员归入默认团队，额外团队成员通过 Team Profile 管理。

## 部署

```sh
npm ci --prefix frontend
npm run build --prefix frontend
dotnet publish backend/MiniDevOps.Api/MiniDevOps.csproj -c Release -o publish
cd publish
dotnet MiniDevOps.dll
```

在运行目录创建 `.env`，或使用环境变量配置。远程访问设置 `DEVOPS_URL=http://0.0.0.0:3220` 及 `DEVOPS_PUBLIC_URL=https://devops.example.com`，通过反向代理提供 HTTPS 并保留 Host。HTTPS 公共地址启用 Secure Cookie。远程首次设置需要 `DEVOPS_SETUP_TOKEN` 或启动日志中的随机设置令牌；首次初始化后设置接口关闭。

建议部署一个应用实例。数据库写入使用事务，MySQL 使用命名锁协调写入；内存中的登录限流不跨实例共享。备份 MySQL 使用其标准一致性备份工具，SQLite 使用在线备份或停止应用后备份数据库。

## 开发与验证

```sh
npm run build --prefix frontend
dotnet build MiniDevOps.slnx
node --test test/*.test.mjs
node test/frontend-dev.mjs
node test/browser.mjs
```

测试需要 Node.js 24+。浏览器测试默认使用 Windows Edge，可通过 `DEVOPS_BROWSER` 指定 Chromium 路径，通过 `DEVOPS_DOTNET` 指定 .NET 主程序。截图写入 `test-results/`。

MySQL 测试要求为 `api.test.mjs`、`boards.test.mjs` **分别提供全新、专用的测试数据库**，通过 `DEVOPS_TEST_MYSQL` 提供连接字符串并逐个运行；测试会在该库建立测试账号与工作项，不能使用正式数据库。迁移测试使用独立 SQLite v1 固定数据集。

代码入口：`backend/MiniDevOps.Api/Program.cs`（服务启动）、`Hosting/`（请求校验与静态托管）、`Data/`（数据库和迁移）、`Features/`（业务模块），以及 `frontend/src/`（前端）。`wwwroot` 只用于后端构建和发布产物，不再保存前端源码。验证记录见 [VERIFICATION.md](docs/VERIFICATION.md)。
