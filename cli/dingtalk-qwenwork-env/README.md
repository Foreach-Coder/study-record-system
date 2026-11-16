# dingtalk-qwenwork-env

隔离的钉钉 DWS（DingTalk Workspace CLI）工作环境：一个环境 = 一个配置目录 + 一套凭据命名空间 + 一个 `dws` 别名。

命令面是纯动作，没有历史包袱的 `qwenwork-env` 子命令前缀：

```text
dingtalk-qwenwork-env list
dingtalk-qwenwork-env add <envName> [--remark 文本] [--profile 组织或身份] [--no-login]
dingtalk-qwenwork-env update <envName> (--remark 文本 | --clear-remark)
dingtalk-qwenwork-env remove <envName>
dingtalk-qwenwork-env login <envName> [--profile 组织或身份]
dingtalk-qwenwork-env context [<envName>] [--dws-command 命令]
dingtalk-qwenwork-env active <envName> | active --default
dingtalk-qwenwork-env --help
```

`active` 是唯一必须跑在当前 PowerShell 会话里的动作（它要改调用方的 `dws` 别名与环境变量）；其它动作都输出一个 JSON 后退出，退出码 0 表示成功、1 表示失败。

## 目录

```text
cli/dingtalk-qwenwork-env/
  dingtalk-qwenwork-env.ps1   # 总入口：active 走 lib/Session.ps1，其余转给 python -m qwen_env
  lib/Session.ps1             # 会话层：别名快照/恢复、变量表应用、失败回滚
  qwen_env/                   # Python 核心：store / keychain / context / login / process / cli
  tests/                      # pytest（python 侧）+ Pester 3.4（会话层）
  .temp/                      # 运行期临时目录，已被 gitignore
```

## 状态目录不能搬

环境和凭据都放在 `%USERPROFILE%\.dingtalk-utils\<envName>\`。**不要移动、不要改名**：

- 凭据命名空间是按目录路径算出来的（`sha256(小写绝对路径)[:16]`），搬家等于所有环境下一次重新设备授权；
- `dingtalk-utils.env.json` 备注、`.dingtalk-utils-isolation.json` 标记、`.dingtalk-utils-isolation.lock` 锁都在同一个目录里；
- 隔离键只复制密文，不解密也不重新加密，DPAPI 归属仍是当前 Windows 用户。

## context 契约

`context` 是给会话层和其它脚本用的纯数据接口，一次返回：

```json
{
  "success": true,
  "mode": "qwenwork",
  "envName": "zxxx-foreach",
  "directory": "C:\\Users\\<user>\\.dingtalk-utils\\zxxx-foreach",
  "keychainDirectory": "...",
  "corePath": "C:\\Users\\<user>\\.qwenworkcn\\bin\\ext\\dws-core-windows-amd64.exe",
  "tempDirectory": "<project>\\.temp\\dingtalk-utils\\zxxx-foreach",
  "env": { "DWS_CONFIG_DIR": "...", "DWS_KEYCHAIN_DIR": "...", "...": "..." }
}
```

`--default` 返回 `mode: "default"`、`envName: null`，`corePath` 指向 PATH 上的 `dws`。Python 调用方（例如 `study-record-sync/sync.py`）拿到 `env` 后整体替换进程环境再跑 `dws`，不需要 PowerShell。

## 状态汇报与失败处理

- 所有动作输出恰好一个 JSON；`success: false` 时带 `errorCode` 与中文 `error`。
- `active` 失败会回滚：别名还原、变量表还原，并抛中文错误；`Constant` 别名直接拒绝，不改环境。
- 删除环境只删 `~/.dingtalk-utils/` 下的直接子目录，拒绝删根目录、拒绝对符号链接/联接目录动手。

## 测试

```powershell
# Python 侧：store / keychain / context / login / process / cli
python -m pytest cli/dingtalk-qwenwork-env/tests -q

# 会话层（Pester 3.4，合成 context，不调 Python、不碰真实凭据）
Invoke-Pester -Script .\cli\dingtalk-qwenwork-env\tests\ps1\Session.Tests.ps1
```

## 迁移说明

本 CLI 从旧工具 `codes/dingtalk-utils` 迁移而来：`modules/qwenwork-env.ps1`、`lib/DwsKeychain.ps1` 与通用零件（进程执行器、JSON、CLI 路由）已按职责重写为 Python + 会话层，旧工具整棵删除。命令面刻意**不保留** `qwenwork-env` 子命令，也不做旧调用兼容——调用方（`study-record-sync/sync.py`、`config.json`、`SKILL.md`）已在同一次迁移里改线。
