# 学习记录系统

一个面向家庭的学习记录工具，用来记录孩子的**作业与待办**、**在校表现**，并按天查看完成情况。

线上地址：<https://study-record.foreach.me>

> 这是一个单家庭使用的个人项目，不是多租户 SaaS，也没有复杂的权限体系。

## 功能

- **今天**：今日进度、按开始日分组的待办、最近表现
- **作业与待办**：待做 / 已完成 / 全部，按类型筛选，支持完成、检查、顺延、编辑、删除
- **在校表现**：按日期范围查看，统计正向/待改进，时间轴浏览，支持编辑
- **记录**：一个 FAB 打开录入 Sheet，可记作业/待办或在校表现
- **详情**：正文 Markdown、图片查看、附件下载、操作栏
- **同步状态**：页面顶部显示钉钉消息的最后同步时间
- **移动端优先**：手机底部导航 + 单 FAB；≥600px 自动切换为左侧导航栏

## 技术栈

| 层 | 选型 |
|---|---|
| 运行时 | Cloudflare Workers |
| 前端 | Vue 3 + Vite + TypeScript + Vue Router |
| 数据库 | Cloudflare D1（SQLite） |
| 文件 | Cloudflare R2（图片与附件） |
| 部署 | `cf` CLI + `cloudflare.config.ts` |
| 单元/接口测试 | Vitest + `@cloudflare/vitest-plugin` |
| 端到端测试 | Playwright |
| CLI | Python 3（标准库，无第三方依赖） |

## 目录

```text
.
├─ src/
│  ├─ shared/          # 日期、假期、分组、校验等纯逻辑
│  ├─ worker/          # Worker 入口、路由、鉴权、写入闸门
│  └─ web/             # Vue 页面、组件、store、样式
├─ migrations/         # D1 迁移
├─ tests/
│  ├─ unit/            # 纯逻辑测试
│  ├─ worker/          # Worker/API 测试
│  ├─ e2e/             # Playwright
│  └─ cli/             # pytest
├─ cli/                # 学习记录 CLI
├─ scripts/            # 密钥生成、数据迁移
├─ public/             # 静态资源与 _headers
├─ cloudflare.config.ts
├─ CUTOVER.md          # 生产切换与回退说明
└─ README.md
```

## 本地开发

### 环境

- Node.js **24.22+**
- npm
- Python 3.10+（仅 CLI / 迁移脚本需要）

### 安装

```bash
npm install
```

生成开发用 secrets，写入 `.dev.vars`：

```bash
python scripts/gen_secrets.py --passcode "local-passcode"
```

把输出写入 `.dev.vars`，再补一行本地地址：

```dotenv
PUBLIC_ORIGIN=http://localhost:5173
```

`.dev.vars` 已在 `.gitignore` 中，**不要提交**。

### 本地 D1

`cloudflare.config.ts` 里的 `accountId`、D1 id、R2 bucket 是当前生产实例；复刻时请换成自己的资源。

```bash
# 本地迁移（把 <database-id> 换成 cloudflare.config.ts 里的 DB id）
npx cf d1 migrations apply <database-id> --local --persist-to .cloudflare/state

# 查看本地数据（如果 npx cf 没有权限，改用全局 cf）
npx cf d1 raw <database-id> --local --persist-to .cloudflare/state \
  --sql "select name from sqlite_master where type='table'"
```

### 启动

```bash
npm run dev
```

打开 <http://localhost:5173>。本地 D1/R2 由 Miniflare 模拟，数据在 `.cloudflare/state/`。

本地调试入口：

- Local Explorer：`http://localhost:5173/cdn-cgi/local/explorer`
- 测试口令：`test-passcode`（仅测试环境）

## 测试

```bash
npm run check       # TypeScript / Vue 类型检查
npm test            # Vitest：shared + Worker/API
npm run test:e2e    # Playwright；需要先启动 npm run dev
npm run test:cli    # pytest：CLI
```

生产 E2E 需要：

```bash
SPIKE_BASE_URL=https://study-record.foreach.me \
E2E_PASSCODE=<生产口令> \
E2E_TOKEN=<生产 API Token> \
npx playwright test
```

> E2E 默认会写入测试数据，并在结束时清理；不要在生产环境随意并发跑多份。

## 部署

```bash
npm run check
npm test
npm run build
npx cf deploy --secrets-file .dev.vars.prod.json
```

生产 secrets 包括：

- `PASSCODE_HASH`
- `SESSION_SECRET`
- `API_TOKEN_HASH`

生成方式：

```bash
python scripts/gen_secrets.py --passcode "<家庭口令>"
```

`API_TOKEN` 只用于 CLI，不写入 Worker 绑定；保存到本机 CLI 配置或密码管理器。

远程 D1 迁移：

```bash
cf d1 migrations apply <database-id>
```

详细切换与回退步骤见 [`CUTOVER.md`](./CUTOVER.md)。

## CLI

CLI 是一个轻量 Python 客户端，读取本机配置：

- Windows：`%APPDATA%\study-record\config.json`
- 其他平台：`~/.config/study-record/config.json`

也可以使用环境变量 `STUDY_RECORD_BASE_URL`、`STUDY_RECORD_TOKEN`。

```bash
python cli/study-record-cli.py students
python cli/study-record-cli.py show --date 2026-11-09
python cli/study-record-cli.py doctor
python cli/study-record-cli.py upload-file ./homework.pdf
```

其余命令见：

```bash
python cli/study-record-cli.py --help
```

配套的 Agent 技能不在本仓库内：

- `study-record`：手动录入/查询
- `study-record-sync`：从钉钉群与家校本同步

## 数据模型

三张业务表：

- `children`：孩子档案
- `tasks`：作业/待办
- `behaviors`：在校表现

辅助表：

- `schema_meta`：schema 版本、同步截止时间
- `audit_log`：写入审计
- `auth_attempts`：登录限流

关键约束：

- 任务去重键：`child_id + title + due_date`
- 表现去重键：`child_id + occurred_on + title`
- 写入走五道闸门：schema 校验 → 业务校验 → 查重 → 写前复核 → 写入回读
- 导入使用全或无批次；失败会清理本批写入
- 图片/附件 URL 只允许本站 `/media/...` 路径
- 删除孩子时，相关记录保留为 `child_id = null` 的孤儿记录，并保留 `child_name` 快照

## 安全说明

- 家庭口令只保存加盐 `SHA-256` hash，不存明文
- 浏览器使用 HMAC 签名、HttpOnly、SameSite=Lax 的会话 Cookie
- CLI 使用 Bearer Token，服务端只保存 token hash
- 登录按 IP 限流；写操作校验 Origin / Sec-Fetch-Site
- 生产 secrets 只放在 Cloudflare secrets 和本机 `.dev.vars*`，仓库中不包含
- 这是单家庭应用，没有角色、多租户或公开注册能力

## 已知限制

- 不提供多用户/角色权限
- 附件类型为 pdf/doc/docx/xls/xlsx/ppt/pptx/txt/zip 与常见图片/音频，单文件 ≤20MB
- 生产数据迁移使用快照 + 短停写切换，不做双写
- 旧 WorkBuddy 页面与旧 `xuexi-record` / `xuexi-sync` 技能保留在切换前，不随本仓库发布

## License

个人项目，暂未附带开源许可证。
