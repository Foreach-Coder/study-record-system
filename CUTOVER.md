# 学习记录系统 · 生产切换说明

## 线上地址

- 生产：https://study-record.foreach.me
- 预览：https://study-record-preview.foreach.me

家庭口令与 CLI Token 只保存在密码管理器和本机 `%APPDATA%\study-record\config.json`，不写入仓库。

## 资源

| 资源 | 名称 | 说明 |
|---|---|---|
| Worker | `study-record` | 生产 Worker |
| D1 | `study-record-db` | 三张业务表 + 元数据/审计 |
| R2 | `study-record-media` | 图片 |
| 自定义域 | `study-record.foreach.me` | 生产入口 |

预览资源：Worker `study-record-preview`、D1 `ffc1dc5a-51de-405f-b26c-c9b3dc164233`、R2 `study-record-preview-media`、域 `study-record-preview.foreach.me`。

## 部署

```powershell
npm run check
npm test
npx playwright test
npm run build
npx cf deploy --secrets-file .dev.vars.prod.json
```

生产 secrets：`PASSCODE_HASH`、`SESSION_SECRET`、`API_TOKEN`、`API_TOKEN_HASH`。本地开发用 `.dev.vars`，不得提交。

## 迁移

1. 先创建孩子（`POST /api/children` 或页面）。
2. 用 `scripts/migrate_apply.py` 导入 CSV/HTML 解析结果，图片走 `/api/images`。
3. 导入后 Worker 做字段级回读；失败会清理本批写入。
4. 生产迁移必须重新上传图片到生产 R2，不能复用预览媒体。

## 回退

- Worker：`cf` 控制台回滚到上一个版本。
- 数据：D1 迁移前导出快照；回退时恢复 D1 与 R2 快照。
- 旧 WorkBuddy 页面在切换后不再写入；如需回退，先停写新系统，恢复旧页面入口，避免双写。

## CLI 与技能

- CLI：`cli/study-record-cli.py`，配置在 `%APPDATA%\study-record\config.json`。
- 手动录入技能：`.agents/skills/study-record`。
- 钉钉同步技能：`.agents/skills/study-record-sync`；写入调用新 CLI。
- 旧 `xuexi-record` / `xuexi-sync` 保留不动，切换完成后可停用。

## 数据新鲜度

`.referrences` 快照只到 2026-11-04。2026-11-05 之后的数据需要运行新的 `study-record-sync` 补齐，再判断是否需要再次迁移。
