# dingtalk-bridge

只读的钉钉客户端桥接命令行。它用 Frida 把一个本地 Agent 注入**已经运行并登录**的桌面钉钉客户端，在客户端自己的 CEF 本地页面里调用 `dingtalk.*` 读取接口，把群、消息、教育角色、家校本、通知、群待办和普通图片读成 JSON。

- 原生 PowerShell 5.1 / 7，不需要 Node.js、独立 EXE 或 `shell-init`。
- 业务 JavaScript 在钉钉客户端的 CEF 页面中执行；PowerShell 只负责参数校验、进程发现、临时 Agent、结果脱敏和 Frida 生命周期。
- 只读：不发送、不发布、不确认、不切换账号、不读写钉钉本地数据库。

## 运行前提

1. Windows 桌面钉钉**正在运行且已登录**，并且已经加载过至少一个提供消息桥接的 `app://desktop.dingtalk.com` 本地页面。本机已验证高级搜索页面可以承载调用，不要求是 IM 会话页；`about:blank` 即使存在同名方法也会被跳过。
2. 钉钉客户端版本必须是通过验证的版本，见[版本门](#版本门)。
3. `frida` CLI 在 PATH 上，或用 `--frida-command` 指定路径：

   ```powershell
   python -m pip install frida-tools
   # 安装后重开终端，使 PATH 生效
   ```

4. Windows PowerShell 5.1 或 PowerShell 7。

## 安装与运行

工具不安装到其他目录、不注册全局命令、不修改 PATH 或 PowerShell 配置。直接使用项目里的 `dingtalk-bridge.ps1`、`lib`、`modules` 和 `scripts`：

```powershell
Set-Location '<仓库根>\cli\dingtalk-bridge'
.\dingtalk-bridge.ps1 bridge --help
.\dingtalk-bridge.ps1 bridge getConversation --cid 10000000001
```

在其他目录时使用完整路径调用；`downloadImage` 的默认输出固定在项目目录 `.temp`，`batch --input` 的相对路径按当前目录解析：

```powershell
& '<仓库根>\cli\dingtalk-bridge\dingtalk-bridge.ps1' bridge listGroupTodos --cid 10000000001
```

## 命令

所有命令都以 `bridge` 开头。CID/MID 是钉钉客户端的**纯数字原生 ID**，不能传 DWS 的 `cid…==` / `msg…==`；`searchGroups` / `getConversation` 返回的 `extension.openConversationId` 才对应 DWS 群。

| 命令 | 参数 | 读取内容 |
| --- | --- | --- |
| `searchGroups` | `--query TEXT` | 群搜索，分页后按原生 CID 去重；返回全部候选，不自动选择重名群 |
| `getConversation` | `--cid CID` | 群资料及原生 CID / openConversationId 映射 |
| `listMessages` | `--cid CID --start ISO --end ISO` | 时间范围内的完整原生消息与媒体引用 |
| `getMessageById` | `--cid CID --message-id MID` | 单条消息，保留原有返回格式 |
| `getMessagesById` | `--cid CID --message-ids MID1,MID2` | 一次连接读取多条，重复 MID 只读一次（1–1000 个） |
| `getEducationRoles` | `--corp-id CORP --class-id CLASS` | 组织角色和班级角色 |
| `listHomework` | `--corp-id CORP --class-id CLASS --student-id STUDENT [--role guardian]` | 家长的家校本列表，默认角色 `guardian` |
| `listHomework` | `--corp-id CORP --class-id CLASS --role teacher` | 教师的班级作业历史，用于目标去重 |
| `getHomework` | `--corp-id CORP --homework-id ID` | 完整作业、附件引用和截止时间 |
| `listNotices` | `--corp-id CORP --class-id CLASS --student-id STUDENT` | 家校通知；保留无班级限制的学校级通知 |
| `getNotice` | `--corp-id CORP --notice-id ID` | 通知详情，不调用已读或确认接口 |
| `listGroupTodos` | `--cid CID` | 群的三个看板及其任务列表 |
| `batch` | `--input FILE [--timeout-seconds N]` | 多个只读请求共用一次 Frida 连接 |
| `downloadImage` | `--resource-id '@MEDIA_ID' [--output PATH]` | 普通图片原图下载，不需要附加 Frida |

每个命令一个示例（组织、班级、学生和消息 ID 需替换为真实值）：

```powershell
.\dingtalk-bridge.ps1 bridge searchGroups --query '示例班'
.\dingtalk-bridge.ps1 bridge getConversation --cid 10000000001
.\dingtalk-bridge.ps1 bridge listMessages --cid 10000000001 --start '2026-11-04' --end '2026-11-05'
.\dingtalk-bridge.ps1 bridge getMessageById --cid 10000000001 --message-id 27609201248057
.\dingtalk-bridge.ps1 bridge getMessagesById --cid 10000000001 --message-ids 27609201248057,27609201248058
.\dingtalk-bridge.ps1 bridge getEducationRoles --corp-id dingYourCorpId --class-id 123456
.\dingtalk-bridge.ps1 bridge listHomework --corp-id dingYourCorpId --class-id 123456 --student-id 789012
.\dingtalk-bridge.ps1 bridge listHomework --corp-id dingYourCorpId --class-id 123456 --role teacher
.\dingtalk-bridge.ps1 bridge getHomework --corp-id dingYourCorpId --class-id 123456 --student-id 789012 --homework-id 654321
.\dingtalk-bridge.ps1 bridge listNotices --corp-id dingYourCorpId --class-id 123456 --student-id 789012 --status UN_HAVE_DONE
.\dingtalk-bridge.ps1 bridge getNotice --corp-id dingYourCorpId --class-id 123456 --student-id 789012 --notice-id 111222
.\dingtalk-bridge.ps1 bridge listGroupTodos --cid 10000000001
.\dingtalk-bridge.ps1 bridge batch --input .temp/requests.json --timeout-seconds 120
.\dingtalk-bridge.ps1 bridge downloadImage --resource-id '@实际媒体ID' --output .temp/image.jpg
```

`getEducationRoles` / `listHomework` 必须给 `--class-id`；`listNotices` 必须给 `--class-id` 和 `--student-id`；`getMessageById` / `getHomework` / `getNotice` 分别必须给 `--message-id` / `--homework-id` / `--notice-id`。`listHomework` 的 `guardian` 必须带 `--student-id`，`teacher` 不接受 `--student-id`。

## 通用选项

| 选项 | 说明 |
| --- | --- |
| `--page-limit N` | 查询页数上限，默认 `100`，范围 1–500 |
| `--max-items N` | 列表/批量详情条数上限，默认 `10000`，范围 1–50000 |
| `--page-size N` | 消息列表和群搜索的每页条数，默认 `50`，范围 1–500 |
| `--status STATUS` | 家长家校本/通知：`ALL`（默认）或 `UN_HAVE_DONE`；教师列表当前只支持 `ALL` |
| `--timeout-seconds N` | 整次读取/批量调用总预算，默认 `60`，范围 1–300；单个原生调用最多等待 8 秒，进程初始化与清理另有短暂开销。`getMessageById` 与 `downloadImage` 不接受此参数 |
| `--frida-command PATH` | 指定 Frida CLI（可执行文件或 `.ps1`），默认从 PATH 查找 `frida` |
| `--help` / `-h` | 显示帮助，不接触钉钉 |

日期及不带偏移的时间按北京时间解释，区间为 `[start,end)`，保留毫秒边界精度。

## 批量读取

`--input` 是 JSON 数组，字段名用 camelCase，与命令行的 kebab-case 对应；允许 1–100 个请求，输入最多 1 MiB，整批在附加进程前完成参数校验：

```json
[
  {
    "method": "listMessages",
    "params": {
      "cid": "10000000001",
      "start": "2026-11-04",
      "end": "2026-11-05",
      "pageSize": 50,
      "pageLimit": 100,
      "maxItems": 10000
    }
  },
  {"method": "listGroupTodos", "params": {"cid": "10000000001"}}
]
```

不接受任意 JavaScript、RPC URI 或写入方法；`downloadImage` 是独立的本地下载命令，不能放进 batch。`results` 按输入顺序返回，每项带 `index`、`method`、`success`、`complete`；列表数据在 `items`，单条数据分别在 `message`、`conversation`、`homework`、`notice`。某项失败不会丢弃其他项，整批 `success=false`。

## 输出与退出码

成功时 stdout 输出一个 JSON 对象，含 `success`、`complete`、`bridge`、`method`、`processId`、`clientVersion`，然后是该方法的数据（或 batch 的 `results`）。`processId` / `clientVersion` 是实际被附加的钉钉进程信息。

- 退出码 `0`：读取成功（`success=true`）。
- 退出码 `1`：`success=false`（例如某页没有读满、预算耗尽、回执失败）或参数/运行错误；错误信息以 `错误：` 前缀写入 **stderr**，stdout 不会混入诊断文本。
- `complete=false` 表示没有读完，不能只看 `items` 有数据就认为采集完整。

分页与完整性细节：`complete=true` 的消息结果只表示**客户端可见历史**读取到范围起点或末尾（`scope="client-visible-history"`、`serverHistoryVerified=false`），不保证远端历史已同步。`PAGE_LIMIT`、`ITEM_LIMIT`、`CURSOR_STALLED`、`TIME_LIMIT`、`NATIVE_TIMEOUT` 等会返回 `success=false/complete=false`，保留已读条目和定位信息；当前没有公开的断点续跑参数。

## 版本门

bridge 依赖钉钉客户端的原生布局，因此对客户端和内置 CEF 各有一道白名单：

- 客户端版本：`modules\bridge\Runtime.ps1` 只接受 `9.0.5.261029005` 和 `9.0.4.261021001`，不匹配时报 `当前钉钉版本 … 尚未验证 bridge 布局。`
- CEF 版本：`scripts\bridge\get-message-by-id.js` 用 `cef_version_info` 读取 8 个整数，只接受 `133.0.6943.142` 配套 CEF build `133.0.0-1526090` 或 `133.0.0-1526100`，不匹配时回执 `UNSUPPORTED_CEF`，对外报 `当前钉钉内置 CEF 版本尚未通过 bridge 布局验证。`

本机已验证组合是钉钉 `9.0.5.261029005` / 内置 CEF `133.0.6943.142`，同时兼容 `9.0.4.261021001`。**钉钉升级后不要绕过版本门**：先跑一条只读命令确认，若出现 `UNSUPPORTED_CEF` 或版本未验证，需要在新的客户端上重新验证 CEF 布局，再更新上述两处白名单并重跑测试，不要跳过检查直接调用。

## 图片下载

`downloadImage` 只接受已验证的普通 `@` 图片媒体 ID（jpg/gif/png/bmp/webp），从固定的钉钉静态图片域名下载；受保护的 `$` 媒体、文件附件、班级圈和打卡不在本 CLI 范围，请继续使用 DWS。

- 默认输出 `项目目录\.temp\dingtalk-bridge\images\<resource-id 的 SHA-256>.<扩展名>`。
- `--output` 可写相对或绝对路径，但解析后必须位于**项目目录 `.temp`** 或**当前目录 `.temp`** 之下，否则报 `图片输出必须位于当前目录或项目的 .temp 目录内。`
- 输出路径上的任何一级目录是目录链接（reparse point）时拒绝写入；目标已存在时拒绝执行，**不覆盖已有文件**。
- 不跟随重定向、不带浏览器 Cookie，单张最多 20 MiB、30 秒；结果返回 `path`、`bytes`、`sha256`。下载过程不调用模型。

## 只读边界

bridge 只调用客户端已有的只读接口：

- 不发送、不撤回、不发布、不确认、不标记已读，不建群，不切换组织或账号。
- 不调用 DWS，不回退到 DWS，不激活或切换 `qwenwork-env` 环境；读取身份固定是当前桌面钉钉的登录身份。
- 不访问钉钉本地数据库、WAL 或凭据存储；不输出 token。
- 输出递归脱敏：`token`、`authorization`、`cookie`、`password`、`secret`、`auth_key`、`api_key`、`pat`、`jwt` 一类字段被移除，URL 中的凭据参数替换为 `[REDACTED]`。
- 只注入 `scripts\bridge` 下白名单内的 6 个 JavaScript 文件，不接受任意脚本或 RPC URI。
- 普通命令不保存业务回执或消息正文到业务状态文件。

## 临时文件

全部位于项目目录内，不写系统临时目录或业务状态：

```text
.temp\dingtalk-bridge\            # Frida 工作目录
  <guid>.js                       # 每次调用生成的临时 Agent，调用结束即删除
  images\                         # downloadImage 默认输出
.temp\dingtalk-utils\.runtime\    # lib\DuRuntime.cs 的 Add-Type 编译缓存
```

## 测试

```powershell
powershell -NoProfile -File .\tests\powershell\run.ps1
node --test tests\bridge-agent-callback.test.cjs tests\bridge-readers.test.cjs
```

PowerShell 测试与 Node 离线测试都使用合成数据和模拟 Frida，不需要真实登录，也不进行任何写操作。

`compare-entries.ps1` 仍在：它当初用来证明本 CLI 与旧工具逐项等价（11 个只读用例，仅规范化 `processId` 等易变字段）。旧工具已删除，`-OldEntry` 现在只在想重跑对照时指向任意一份历史副本，不传就只跑新入口自检：

```powershell
powershell -NoProfile -File .\tests\powershell\compare-entries.ps1 `
  -NewEntry '<仓库根>\cli\dingtalk-bridge\dingtalk-bridge.ps1' `
  -Cid 10000000001 `
  -OutFile .temp\equivalence-report.json
```
