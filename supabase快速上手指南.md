# Supabase 快速上手指南

Supabase 是一个开源的后端即服务 (BaaS) 平台，本项目已集成 Supabase 用于数据的持久化存储（如脚本导出到服务器）。

## 1. 环境配置

在 `.env.development` 或 `.env.production` 中配置以下变量：

```env
VITE_SUPABASE_URL=你的_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=你的_SUPABASE_ANON_KEY
VITE_ENABLE_SUPABASE=true  # 设置为 true 启用，false 禁用
```

## 2. 代码中使用

本项目已在 `WorkbenchView.tsx` 中集成了 Supabase 导出功能。

### 开关控制
代码中通过 `import.meta.env.VITE_ENABLE_SUPABASE` 来判断是否调用 Supabase API。

```typescript
const enableSupabase = import.meta.env.VITE_ENABLE_SUPABASE === 'true';
if (enableSupabase) {
  // 调用 Supabase 相关逻辑
}
```

## 3. 常用功能

### 数据库 (PostgreSQL)
你可以通过 `supabase.from('table_name').select('*')` 等方式操作数据库。

### 认证 (Auth)
支持邮箱、GitHub、Google 等多种登录方式。

### 存储 (Storage)
用于上传图片、视频等文件。

## 4. 故障排除

1. **Identifier 'modelSelector' has already been declared**: 此错误已修复，主要是由于代码合并时的重复声明。
2. **API 报错**: 请检查 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 是否配置正确。
3. **部署到生产环境**: 确保在生产服务器的环境变量中也配置了这些参数.

---

## Supabase 本地配置详细教程

1. **安装 Docker Desktop 并启动**
   - 访问 https://www.docker.com/products/docker-desktop/ 下载并安装 Docker Desktop。
   - 启动 Docker Desktop，确保其正常运行。

2. **安装 Supabase CLI**
   ```bash
   npm install supabase --save-dev
   # 依赖较大，下载时间较长，请耐心等待
   ```

3. **初始化 Supabase 项目**
   ```bash
   npx supabase init
   ```

4. **启动本地 Supabase 服务**
   ```bash
   npx supabase start
   ```
   - 启动后会自动拉取并运行相关 Docker 容器。
   - 启动完成后，命令行会显示 `project url` 和 `anon/public secret`，如下所示：
     ```
     API URL: http://127.0.0.1:54321
     anon key: sb_publishable_xxx
     ```

5. **访问 Supabase Studio 面板**
   - 打开浏览器访问 http://localhost:54323 进入 Supabase Studio。
   - 这是可视化管理数据库、认证、存储等的后台界面。

6. **创建存储桶（Storage Bucket）**
   - 在 Studio 左侧菜单选择 Storage > Create bucket。
   - Bucket 名称建议与前端代码保持一致（如 `uploads`）。
   - 创建后，建议配置合适的 Policy（策略），如允许匿名用户上传/读取等。

7. **配置前端 .env 文件**
   - 打开 vflow 前端项目的 `.env.development` 或 `.env.production` 文件。
   - 将如下内容：
     ```env
     VITE_SUPABASE_URL=http://127.0.0.1:54321
     VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
     ```
     替换为你在 Supabase CLI 启动后命令行中显示的 `project url` 和 `anon key`。
   - 示例：
     ```env
     VITE_SUPABASE_URL=你的_project_url
     VITE_SUPABASE_ANON_KEY=你的_anon_key
     ```

8. **重启前端项目**
   - 修改 .env 后，需重启前端开发服务器（如 `pnpm run dev` 或 `npm run dev`）。

---

> 如需上传/下载文件，存储桶名称和权限策略需与前端代码一致。建议在 Supabase Studio 中为存储桶配置合适的 RLS Policy。
