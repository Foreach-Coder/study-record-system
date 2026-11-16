"""Command line actions for dingtalk-qwenwork-env.

Every action prints exactly one JSON object on stdout and returns a process exit
code (0 success, 1 failure). ``active`` is the only action that cannot live
here: it must change the *calling* PowerShell session, so the .ps1 wrapper
handles it via ``lib/Session.ps1``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from . import context, keychain, login as login_module, store

HELP = """dingtalk-qwenwork-env — 隔离的钉钉 DWS 工作环境

用法：
  dingtalk-qwenwork-env list
  dingtalk-qwenwork-env add <envName> [--remark 文本] [--profile 组织或身份] [--no-login]
  dingtalk-qwenwork-env update <envName> (--remark 文本 | --clear-remark)
  dingtalk-qwenwork-env remove <envName>
  dingtalk-qwenwork-env login <envName> [--profile 组织或身份]
  dingtalk-qwenwork-env context [<envName>]
  dingtalk-qwenwork-env active <envName> | active --default
  dingtalk-qwenwork-env --help

说明：
  list          列出 ~/.dingtalk-utils/ 下的环境及备注
  add           创建环境目录与凭据命名空间，并立即设备授权；加 --no-login 只建目录
  update        只改本地备注，不重新登录、不切换环境
  remove        删除该环境目录（含本地授权）
  login         对已有环境执行设备授权登录
  context       输出调用上下文（供 .ps1 会话层使用）
  active        在当前 PowerShell 会话中设置环境；--default 恢复普通 DWS
"""

ROOT = Path(__file__).resolve().parent.parent


def _utf8_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))
    sys.stdout.flush()


def fail(code: str, message: str) -> int:
    emit({"success": False, "errorCode": code, "error": message})
    return 1


def _parse(arguments: list[str]) -> tuple[list[str], dict]:
    positionals: list[str] = []
    options: dict = {"flags": set(), "values": {}}
    index = 0
    while index < len(arguments):
        item = arguments[index]
        if item.startswith("--"):
            name = item[2:]
            if name in {"remark", "profile", "dws-command"}:
                if index + 1 >= len(arguments):
                    raise ValueError(f"--{name} 缺少取值。")
                options["values"][name] = arguments[index + 1]
                index += 2
                continue
            options["flags"].add(name)
            index += 1
            continue
        positionals.append(item)
        index += 1
    return positionals, options


def _environment(name: str) -> Path:
    if not store.validate_name(name):
        raise ValueError(f"环境名无效：{name!r}")
    directory = store.env_dir(name)
    if not directory.is_dir():
        raise LookupError("environment_not_found")
    return directory


def cmd_list() -> int:
    emit({"success": True, "environments": store.list_environments()})
    return 0


def cmd_add(arguments: list[str], *, registry, login) -> int:
    positionals, options = _parse(arguments)
    if not positionals:
        return fail("missing_env_name", "请提供环境名。")
    name = positionals[0]
    if not store.validate_name(name):
        return fail("invalid_env_name", f"环境名无效：{name!r}")
    remark = options["values"].get("remark")
    if remark is not None:
        try:
            store.assert_remark(remark)
        except ValueError as error:
            return fail("invalid_remark", str(error))

    directory = store.env_dir(name)
    created = not directory.exists()
    store.ensure_ordinary_dir(directory)
    keychain.initialize_isolation(directory, registry=registry)

    result: dict = {"success": True}
    if "--no-login" not in options["flags"]:
        built = context.build_context(name, project_root=ROOT, registry=registry)
        outcome = login(built, profile=options["values"].get("profile"))
        if not outcome.get("success"):
            if created:
                store.remove_environment(name)
            emit(outcome)
            return 1
        result = dict(outcome)

    if remark is not None:
        store.write_remark(directory, remark)
    result.update({"envName": name, "directory": str(directory), "remark": store.read_remark(directory)})
    emit(result)
    return 0


def cmd_update(arguments: list[str]) -> int:
    positionals, options = _parse(arguments)
    if not positionals:
        return fail("missing_env_name", "请提供环境名。")
    try:
        directory = _environment(positionals[0])
    except LookupError:
        return fail("environment_not_found", "环境不存在。")
    except ValueError as error:
        return fail("invalid_env_name", str(error))

    if "clear-remark" in options["flags"]:
        store.write_remark(directory, "")
    elif "remark" in options["values"]:
        try:
            store.write_remark(directory, options["values"]["remark"])
        except ValueError as error:
            return fail("invalid_remark", str(error))
    else:
        return fail("missing_option", "请提供 --remark 或 --clear-remark。")

    emit({"success": True, "envName": positionals[0], "remark": store.read_remark(directory)})
    return 0


def cmd_remove(arguments: list[str]) -> int:
    positionals, _ = _parse(arguments)
    if not positionals:
        return fail("missing_env_name", "请提供环境名。")
    name = positionals[0]
    if not store.validate_name(name):
        return fail("invalid_env_name", f"环境名无效：{name!r}")
    removed = store.remove_environment(name)
    if not removed:
        return fail("environment_not_found", "环境不存在。")
    emit({"success": True, "envName": name, "removed": True})
    return 0


def cmd_login(arguments: list[str], *, registry, login) -> int:
    positionals, options = _parse(arguments)
    if not positionals:
        return fail("missing_env_name", "请提供环境名。")
    name = positionals[0]
    try:
        _environment(name)
    except LookupError:
        return fail("environment_not_found", "环境不存在。")
    except ValueError as error:
        return fail("invalid_env_name", str(error))

    built = context.build_context(
        name,
        project_root=ROOT,
        dws_command=options["values"].get("dws-command"),
        registry=registry,
    )
    outcome = login(built, profile=options["values"].get("profile"))
    emit(outcome)
    return 0 if outcome.get("success") else 1


def cmd_context(arguments: list[str], *, registry) -> int:
    positionals, options = _parse(arguments)
    name = None if "default" in options["flags"] or not positionals else positionals[0]
    if name is not None and not store.validate_name(name):
        return fail("invalid_env_name", f"环境名无效：{name!r}")
    try:
        emit(
            context.build_context(
                name,
                project_root=ROOT,
                dws_command=options["values"].get("dws-command"),
                registry=registry,
            )
        )
    except (ValueError, LookupError) as error:
        return fail("context_failed", str(error))
    return 0


def main(argv: list[str], *, registry=None, login=None) -> int:
    _utf8_streams()
    arguments = list(argv)
    if arguments[:1] == ["-m"]:
        arguments = arguments[2:]
    if not arguments or arguments[0] in {"--help", "-h", "help"}:
        emit({"success": True, "help": HELP})
        return 0

    action, rest = arguments[0], arguments[1:]
    registry = registry or keychain.WindowsRegistry()
    login = login or login_module.device_login

    handlers = {
        "list": lambda: cmd_list(),
        "add": lambda: cmd_add(rest, registry=registry, login=login),
        "update": lambda: cmd_update(rest),
        "remove": lambda: cmd_remove(rest),
        "login": lambda: cmd_login(rest, registry=registry, login=login),
        "context": lambda: cmd_context(rest, registry=registry),
    }
    handler = handlers.get(action)
    if handler is None:
        if action == "active":
            return fail("session_required", "active 需要在 PowerShell 会话中执行：dingtalk-qwenwork-env active <envName>。")
        return fail("unknown_action", f"未知命令：{action}")
    try:
        return handler()
    except LookupError as error:
        return fail(str(error), "环境不存在。")
    except ValueError as error:
        return fail("invalid_argument", str(error))
    except OSError as error:
        return fail("os_error", str(error))
