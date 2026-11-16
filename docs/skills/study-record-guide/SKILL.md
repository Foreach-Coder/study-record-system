---
name: study-record-guide
description: 操作 Cloudflare 版「学习记录系统」（孩子档案 / 作业与待办 / 在校表现）。查孩子、看某天记录、查未完成、生成日报、标记完成/检查、导入或更正记录、上传图片。写入走新 CLI 的校验与回读，不直接改 D1。用户说学习记录系统、记作业、记待办、记在校表现、孩子今天怎么样、作业清单、待办清单时使用。
---

# 学习记录系统 · 操作技能（Cloudflare 版）

线上地址：https://study-record.foreach.me

旧版 WorkBuddy 页面和旧 CLI 仍保留，但本技能只操作新系统。

## 入口

```bash
python "D:/老力与响/codes/study-record-system/cli/study-record/study-record-cli.py" <command> [options]
```

认证优先级：`--token` > `STUDY_RECORD_TOKEN` > `%APPDATA%/study-record/config.json`（Windows）或 `~/.config/study-record/config.json`。Base URL 同理，默认 `https://study-record.foreach.me`。

## 先看现状

```bash
python cli/study-record/study-record-cli.py students
python cli/study-record/study-record-cli.py show --date 2026-11-07
python cli/study-record/study-record-cli.py pending
python cli/study-record/study-record-cli.py daily --date 2026-11-07
python cli/study-record/study-record-cli.py doctor
```

`--date` 接受 `2026-11-07`、`11-07`（当年）、`today`、`yesterday`、`前天`。

- `show` 默认今天；任务按「截止日」、表现按「日期」过滤。
- `pending` 列出未完成任务，含逾期标记。
- `daily` 汇总某天的作业/待办/在校表现。
- `doctor` 检查 API、配置、登录态；401/403 退出码 4。

需要机器可读时加 `--json`；`show` 的 JSON 形状是 `{student,date,tasks,behaviors}`，任务字段为中文（`标题/正文/类型/科目/孩子/截止日/开始日/已完成/已检查/图片/录入人`）。

## 标记完成 / 检查

```bash
python cli/study-record/study-record-cli.py done <record_id>
python cli/study-record/study-record-cli.py done --find "熟读拼音"
python cli/study-record/study-record-cli.py done --all --dry-run
python cli/study-record/study-record-cli.py done --all
python cli/study-record/study-record-cli.py done <record_id> --undo
python cli/study-record/study-record-cli.py checked <record_id>
```

`done` 只改 `completed`；`checked` 同时把 `completed` 置 true。`--find` 必须唯一匹配，否则退出码 1；`--all` 只作用于当前孩子的未完成任务；先 `--dry-run` 看清楚再写。

## 单条录入

新 CLI 没有旧的 `homework/todo/behavior` 子命令。单条录入优先用网页：

- 打开 https://study-record.foreach.me
- 底部「新增记录」/「记表现」
- 选择孩子、类型、科目、日期、正文、图片

也可以用 `import` 传一个 plan 文件（适合批量或脚本）：

```json
{
  "child": "李律研",
  "date": "2026-11-07",
  "by": "爸爸",
  "homework": [
    {"标题": "熟读拼音三表", "正文": "各读 3 遍", "科目": "语文", "截止日": "2026-11-09"}
  ],
  "todo": [
    {"标题": "周四体检", "正文": "在校完成", "截止日": "2026-11-08"}
  ],
  "behavior": [
    {"标题": "入选阅读小榜样", "正文": "班主任在群里公布", "日期": "2026-11-07", "维度": "study", "档位": "positive", "来源": "teacher"}
  ]
}
```

```bash
python cli/study-record/study-record-cli.py import plan.json --dry-run
python cli/study-record/study-record-cli.py import plan.json --on-duplicate skip
```

- 默认 `--on-duplicate skip`：重复条目跳过，不报错。
- `--dry-run` 只校验/查重，不写。
- 图片字段可写 `图片` 对象（旧格式）或 `images` 数组；相对路径会转成 `/media/...`。
- 导入是全有或全无：任何一条不合法，整批不写。

## 更正

```bash
python cli/study-record/study-record-cli.py revise revise.json --table task
```

`revise.json` 里带 `record_id` 和要改的字段；任务可用 `due/start` 或 `截止日/开始日`。只会更新给定字段，不新建。

## 只传图

```bash
python cli/study-record/study-record-cli.py upload-image "D:/照片/板书.jpg"
```

输出绝对 `imageUrl`，同时给出宽高；图片存 R2，`/media/` 需要登录。单图 ≤5 MiB，支持 png/jpeg/webp/gif。

## 边界

- 不直接调 D1，不手改数据表。
- 所有写入都由服务端五道闸门校验并回读；失败会返回非零退出码。
- 退出码：0 成功、1 用法、2 校验、3 写入/HTTP、4 环境/认证。
- 删除孩子会把其记录转为孤儿（`child_id=null`，保留 `child_name`），不会级联删除。
