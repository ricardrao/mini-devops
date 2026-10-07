# 前后端架构

本项目参考微软公开的 ASP.NET Core、React、TypeScript 和 Fluent UI 技术体系。Azure DevOps 服务的完整内部源码、部署拓扑并未公开；此处不是对其内部实现的声明。

```text
frontend/                         独立 Web 客户端
  src/app/                        React 启动和 Fluent UI 主题
  src/api/                        类型化 HTTP 客户端与会话契约
  src/features/auth/              React / Fluent UI 登录与首次设置
  src/legacy/                     已有工作项、看板等页面的兼容实现
  src/styles/                     已对照原站调整的页面样式
  public/                         图标等静态资源
  dist/                           构建产物，忽略提交
backend/MiniDevOps.Api/            ASP.NET Core API
  Api/                            API 分发、认证与公共规则
  Features/                       工作项、看板、查询、团队、规划和交付计划
  Data/                           数据库访问及迁移
  Hosting/                        请求校验、安全响应头、前端静态托管
test/                             API、迁移和浏览器回归
scripts/                          构建和演示数据工具
```

开发时，Vite 在 `127.0.0.1:5173` 提供前端，ASP.NET Core 在 `127.0.0.1:3220` 提供 API。浏览器使用同源 `/api`；Vite 开发代理转发请求，后端仍校验来源、会话及 CSRF，不开放通配符 CORS。代理目标可通过 `DEVOPS_API_URL` 配置。

发布时，前端先独立编译到 `frontend/dist`，后端发布过程将产物复制到发布包的 `wwwroot`。`wwwroot` 只承担 ASP.NET Core 的静态产物托管，不再是源码目录。也可以由反向代理托管前端，并将同源 `/api` 路径转发到后端；前端 HTML 需要正确配置 Fluent UI 动态样式的 CSP nonce。

前端使用同源 Cookie 会话、类型化请求封装和独立构建。Fluent UI 动态样式通过每次 HTML 响应生成的随机 nonce 放行，不启用 `unsafe-inline`。数据库位置及 `.env` 仍以仓库根目录为基准；发布到独立目录时以启动工作目录为基准，可用 `DEVOPS_CONTENT_ROOT` 覆盖。

## 当前迁移边界

React / TypeScript / Fluent UI 已实际用于登录、首次设置及前端启动。已有工作项、看板、迭代、查询等复杂页面保留在 `src/legacy`，通过显式兼容边界接入，保持已验证的交互；这些页面尚未全部转换成 React 组件。后端按功能归档，仍复用已有 `Api` / `Store` partial class 和事务规则，尚未拆成独立服务层或微服务。这样完成的是可独立开发和构建的前后端工程边界，不宣称完成全量组件迁移。

后续逐个功能迁移到 `src/features`：先保留 API 契约、页面样式与浏览器回归，再用 React 组件替换对应的兼容实现。每完成一个功能，删除其旧实现，避免长期维护两份逻辑。

## 验证

本次拆分通过 TypeScript 检查、Vite 构建、.NET 构建、34 项 API/迁移/静态托管测试、完整浏览器回归及独立 Vite 代理测试。代理测试验证首次设置、Cookie 会话、项目操作和 CSRF 拒绝；静态托管测试验证 CSP nonce、构建资源可访问以及源码和配置文件不可访问。GitHub Actions 执行前后端构建及 API/代理测试，完整浏览器回归可在本地 Edge 或配置的 Chromium 上运行。
