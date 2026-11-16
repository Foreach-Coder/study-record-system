"""Build the environment context for a DWS call.

A context is the answer to "which DWS binary, with which credentials namespace,
and with which temporary directory". It never changes the caller's process
environment: :mod:`qwen_env.session` applies it to the PowerShell session and
:mod:`qwen_env.cli` passes it to a child process.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from . import keychain, store

MANAGED = re.compile(
    r"^(?:DWS_|DINGTALK_DWS_|DINGTALK_UTILS_|DINGTALK_QWEN_|QWORK_|QODER_|QODERCN_|QODERWORK_|QWENWORK_|QWEN_|QW_)"
    r"|^(?:NODE_OPTIONS|ELECTRON_RUN_AS_NODE|TEMP|TMP)$"
)
REJECTED_SUFFIXES = {".cmd", ".bat", ".js", ".mjs", ".cjs"}
CORE_RELATIVE = Path(".qwenworkcn") / "bin" / "ext" / "dws-core-windows-amd64.exe"


def clean_env(env: dict[str, str] | None = None) -> dict[str, str]:
    """Copy ``env`` (default: the current process) without platform-managed keys."""
    source = os.environ if env is None else env
    return {name: value for name, value in source.items() if not MANAGED.match(name)}


def _search_path(env: dict[str, str]) -> list[Path]:
    raw = env.get("PATH", "")
    return [Path(part.strip('"')) for part in raw.split(os.pathsep) if part.strip('"')]


def resolve_core(mode: str, override: str | None, env: dict[str, str]) -> Path:
    """Locate the DWS binary for ``mode`` (``qwenwork`` or ``default``)."""
    candidate = (override or "").strip()
    if not candidate and mode == "qwenwork":
        candidate = env.get("DINGTALK_QWEN_DWS_COMMAND", "").strip()

    if not candidate or candidate == "dws":
        if mode == "qwenwork":
            candidate = str(store.home_dir() / CORE_RELATIVE)
            if not Path(candidate).is_file():
                raise ValueError("未找到 QwenWork 原生 DWS 核心，请用 --dws-command 指定。")
        else:
            for directory in _search_path(env):
                for relative in ((Path("node_modules") / "dingtalk-workspace-cli" / "vendor" / "dws.exe"), Path("dws.exe")):
                    if (directory / relative).is_file():
                        candidate = str(directory / relative)
                        break
                if candidate and Path(candidate).is_file():
                    break
            if not candidate or not Path(candidate).is_file():
                raise ValueError("未找到普通 DWS，请先安装或用 --dws-command 指定。")
    elif not Path(candidate).is_absolute() and "/" not in candidate and "\\" not in candidate:
        found = None
        for directory in _search_path(env):
            if (directory / candidate).is_file():
                found = str(directory / candidate)
                break
        if found is None:
            raise ValueError("未找到指定 DWS 命令。")
        candidate = found

    core = Path(candidate).absolute()
    if not core.is_file():
        raise ValueError("指定 DWS 命令不存在。")
    if core.suffix.lower() in REJECTED_SUFFIXES:
        raise ValueError("请指定原生 DWS，不接受 Node.js 或 cmd/bat 包装。")
    if core.suffix.lower() == ".ps1":
        raise ValueError("请指定原生 DWS 可执行文件，不接受 PowerShell 脚本包装。")
    return core


def build_context(
    env_name: str | None,
    *,
    project_root: str | Path,
    dws_command: str | None = None,
    env: dict[str, str] | None = None,
    registry: keychain.Registry | None = None,
) -> dict:
    """Assemble the context dictionary for one call.

    ``env_name`` of None selects ``default`` mode: no credential namespace is
    involved and only the temporary directory is redirected.
    """
    base = clean_env(env)
    root = Path(project_root).absolute()

    if env_name is not None:
        if not store.validate_name(env_name):
            raise ValueError(f"环境 envName 无效：{env_name!r}")
        mode = "qwenwork"
        directory = store.env_dir(env_name)
        store.ensure_ordinary_dir(directory)
        keychain_directory = directory / "keychain"
        store.ensure_ordinary_dir(keychain_directory)
        temporary = root / ".temp" / "dingtalk-utils" / env_name
        store.ensure_ordinary_dir(temporary)
        namespace = keychain.initialize_isolation(directory, registry=registry)
        core = resolve_core(mode, dws_command, base)
        combined = dict(base)
        combined.update(
            {
                "DINGTALK_QWEN_ENV_NAME": env_name,
                "DINGTALK_QWEN_DWS_COMMAND": str(core),
                "DINGTALK_DWS_AGENTCODE": "qwenwork",
                "DWS_AGENT_PRODUCT": "qwenwork",
                "DWS_AGENT_HOST": "desktop",
                "DWS_AGENT_VER": "1.4.0",
                "DWS_CONFIG_DIR": str(directory),
                "DWS_KEYCHAIN_DIR": str(keychain_directory),
                "DWS_KEYCHAIN_TEST_NAMESPACE": namespace,
                "TEMP": str(temporary),
                "TMP": str(temporary),
            }
        )
        return {
            "success": True,
            "mode": mode,
            "envName": env_name,
            "directory": str(directory),
            "keychainDirectory": str(keychain_directory),
            "corePath": str(core),
            "tempDirectory": str(temporary),
            "env": combined,
        }

    temporary = root / ".temp" / "dingtalk-utils" / ".default"
    store.ensure_ordinary_dir(temporary)
    core = resolve_core("default", dws_command, base)
    combined = dict(base)
    combined["TEMP"] = str(temporary)
    combined["TMP"] = str(temporary)
    return {
        "success": True,
        "mode": "default",
        "envName": None,
        "directory": None,
        "keychainDirectory": None,
        "corePath": str(core),
        "tempDirectory": str(temporary),
        "env": combined,
    }
