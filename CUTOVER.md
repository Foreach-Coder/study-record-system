# 生产切换记录（2026-11-08）

## 生产入口

- URL：https://study-record.foreach.me
- Worker：`study-record`（自定义域已绑定）
- 部署版本：`6ea18219-8b6a-468a-8211-8c8fbfca8376`
- D1：`study-record-db` / `a2f9ad05-48a3-4f35-93c8-008c1bc46d35`（已应用 `0001_init.sql`，schema v1）
- R2：`study-record-media`（APAC）
- 旧 WorkBuddy 页面与表格保持原样，未做双写；需要时可继续作为人工兜底。

## 密钥

- 本地文件：`.dev.vars.prod`（明文 `KEY=VALUE`）与 `.dev.vars.prod.json`（部署用 JSON 副本），均已 gitignore，不入库。
- 共 4 个键：`PASSCODE_HASH`、`SESSION_SECRET`、`API_TOKEN`、`API_TOKEN_HASH`。
- 家庭口令仍是 `test-passcode`；CLI 使用 `API_TOKEN` 一行（不要把 token 写进文档或聊天记录）。
- 注意：`cf deploy --secrets-file` 会做 dotenv `$` 展开，`sha256$<salt>$<digest>` 会被破坏。必须传 JSON 副本（`.dev.vars.prod.json`），不要直接传 `.dev.vars.prod`。重新生成密钥时同样先生成明文再转 JSON。

## 切换步骤（可复现）

```bash
npx cf d1 migrations apply a2f9ad05-48a3-4f35-93c8-008c1bc46d35
python scripts/migrate_from_workbuddy.py --source .referrences --out .cloudflare/migration.prod.json
npm run build
npx cf deploy --secrets-file .dev.vars.prod.json
python scripts/migrate_apply.py --plan .cloudflare/migration.prod.json \
  --base-url https://study-record.foreach.me --token "<API_TOKEN>" \
  --cache .state/migrate-images.prod.json --apply --yes
```

迁移结果：children=1，items=31（26 任务 + 5 在校表现），图片 61 条引用 / 32 个唯一 URL；导入回读 26/26、5/5 通过。`migrate_apply` 默认可重复运行（按 URL 缓存、导入按身份去重 skip）。

## 验证

- `GET /api/health` → `{"ok":true,"d1":true,"schemaVersion":1,...}`
- `GET /api/auth/session` 未登录 → 401（预期）
- CLI `doctor --json` → children 1 / tasks 26 / behaviors 5，schemaVersion 1
- CLI `show --date 2026-11-04 --json` → 当天任务与表现正常、图片 URL 为 `https://study-record.foreach.me/media/...`
- Playwright（`SPIKE_BASE_URL=https://study-record.foreach.me`、`E2E_TOKEN=<prod API_TOKEN>`、`E2E_PASSCODE=test-passcode`）→ 13 passed
- E2E 产生的测试孩子/任务/表现已清理；生产最终为 1 个孩子 / 26 任务 / 5 表现。

## 数据新鲜度

`.referrences` 里的 WorkBuddy 导出只到 **2026-11-04**。上线后需要运行新的同步（青竹园群 + 家校本 → 学习记录系统），把 11-05 之后的数据补上；同步重复运行不会重复建记录，老师改要求走更正。

## 回滚

1. 应用代码：Cloudflare 保留历史版本，用 `npx cf deployments`（或 Dashboard）回滚到上一个版本；或 revert 本次提交后重新 `npm run build && npx cf deploy --secrets-file .dev.vars.prod.json`。
2. 数据：D1 已执行 `0001_init.sql`；如需重来，可删除 tasks/behaviors/children 后重跑迁移（图片按 URL 缓存，R2 对象可复用）。谨慎操作，先备份。
3. 页面兜底：旧 WorkBuddy 页面未被修改，可临时继续使用；不做双写，避免两边分叉。

## 本地缓存（均已 gitignore）

- `.state/migrate-images.prod.json`：URL → `/media/...` 映射缓存。
- `media/`：按 URL 哈希命名的本地图片缓存。
- `.cloudflare/migration.*.json`：迁移计划 / resolved / report。
