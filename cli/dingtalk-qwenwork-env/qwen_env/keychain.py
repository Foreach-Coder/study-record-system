"""Credential isolation for DWS environments on Windows.

DWS stores DPAPI ciphertext as HKCU string values under
``Software\\DwsCli\\keychain\\dws-cli``. An environment becomes isolated by
copying the ciphertext its identities need into
``...\\dws-cli\\test-<hash of the environment directory>``; the plaintext is
never touched, so no DPAPI call is required.

The isolated namespace is derived from the directory path: moving an
environment silently re-points it at an empty namespace, which is why every
initialised directory carries a marker recording its own path.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
from pathlib import Path
from typing import Protocol

from . import store

SHARED_KEY = "Software\\DwsCli\\keychain\\dws-cli"
_ISOLATED = re.compile(r"^Software\\DwsCli\\keychain\\dws-cli\\test-[0-9a-f]{32}$")
MARKER_NAME = ".dingtalk-utils-isolation.json"
LOCK_NAME = ".dingtalk-utils-isolation.lock"
BACKEND = "windows-dpapi-namespace"
MARKER_LIMIT = 4096


class Registry(Protocol):
    def value_names(self, path: str) -> list[str]: ...
    def get_string(self, path: str, name: str) -> str | None: ...
    def set_string_if_absent(self, path: str, name: str, value: str) -> bool: ...
    def delete_tree(self, path: str) -> None: ...


class WindowsRegistry:
    """HKCU string-value access; never expands environment variables."""

    def __init__(self):
        import winreg

        self._winreg = winreg

    def _open(self, path: str, write: bool):
        return self._winreg.OpenKey(
            self._winreg.HKEY_CURRENT_USER, path, 0, self._winreg.KEY_READ | (self._winreg.KEY_WRITE if write else 0)
        )

    def value_names(self, path: str) -> list[str]:
        try:
            with self._open(path, False) as key:
                return list(self._winreg.EnumValue(key, index)[0] for index in range(self._winreg.QueryInfoKey(key)[1]))
        except FileNotFoundError:
            return []
        except OSError:
            return []

    def get_string(self, path: str, name: str) -> str | None:
        try:
            with self._open(path, False) as key:
                value, kind = self._winreg.QueryValueEx(key, name)[:2]
        except FileNotFoundError:
            return None
        except OSError as error:
            raise ValueError("无法读取加密凭据。") from error
        if kind != self._winreg.REG_SZ or not isinstance(value, str) or not value:
            return None
        return value

    def set_string_if_absent(self, path: str, name: str, value: str) -> bool:
        with self._winreg.CreateKeyEx(self._winreg.HKEY_CURRENT_USER, path, 0, self._winreg.KEY_READ | self._winreg.KEY_WRITE) as key:
            if name in [self._winreg.EnumValue(key, index)[0] for index in range(self._winreg.QueryInfoKey(key)[1])]:
                return False
            self._winreg.SetValueEx(key, name, 0, self._winreg.REG_SZ, value)
            return True

    def delete_tree(self, path: str) -> None:
        try:
            self._winreg.DeleteKey(self._winreg.HKEY_CURRENT_USER, path)
        except FileNotFoundError:
            return
        except OSError as error:
            raise ValueError("无法删除该环境的隔离凭据。") from error


def _normalised_namespace(directory: str | Path) -> str:
    text = str(directory).strip().rstrip("\\/")
    return str(Path(text)).lower()


def registry_path(directory: str | Path) -> str:
    """Isolated namespace for one environment directory."""
    digest = hashlib.sha256(_normalised_namespace(directory).encode("utf-8")).digest()
    return f"{SHARED_KEY}\\test-{digest[:16].hex()}"


def token_value_name(corp_id: str, user_id: str) -> str:
    """Registry value name DWS uses for one identity's auth token."""
    corp = (corp_id or "").strip()
    user = (user_id or "").strip()
    if not corp or not user:
        raise ValueError("环境身份缺少组织或用户标识。")
    digest = hashlib.sha256(f"{corp}\x00{user}".encode("utf-8")).hexdigest()
    account = f"auth-token:id:{digest}"
    return base64.urlsafe_b64encode(account.encode("utf-8")).decode("ascii").rstrip("=")


def read_shared_value(name: str, *, registry: Registry) -> str | None:
    return registry.get_string(SHARED_KEY, name)


def write_isolated_value(path: str, name: str, value: str, *, registry: Registry) -> bool:
    if not _ISOLATED.match(path):
        raise ValueError("拒绝写入隔离命名空间之外的凭据。")
    return registry.set_string_if_absent(path, name, value)


def read_marker(directory: str | Path) -> dict | None:
    marker_path = Path(directory) / MARKER_NAME
    try:
        if marker_path.stat().st_size > MARKER_LIMIT:
            raise ValueError("环境隔离状态过大。")
        payload = json.loads(marker_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except OSError as error:
        raise ValueError("环境隔离状态损坏，已停止调用 DWS；原凭据未删除。") from error
    except ValueError as error:
        raise ValueError("环境隔离状态损坏，已停止调用 DWS；原凭据未删除。") from error
    if not isinstance(payload, dict):
        raise ValueError("环境隔离状态损坏，已停止调用 DWS；原凭据未删除。")
    return payload


def assert_marker(marker: dict, directory: str | Path) -> None:
    version = marker.get("version")
    backend = marker.get("backend")
    namespace = marker.get("namespace")
    if version != 1 or not isinstance(version, int) or isinstance(version, bool):
        raise ValueError("环境隔离标记版本无效。")
    if backend != BACKEND:
        raise ValueError("环境隔离标记无效或目录已移动，已停止调用 DWS。")
    if not isinstance(namespace, str) or _normalised_namespace(namespace) != _normalised_namespace(directory):
        raise ValueError("环境隔离标记无效或目录已移动，已停止调用 DWS，不能回退到共享凭据。")


def write_marker(directory: str | Path, target: str | Path) -> None:
    """Atomically record that ``target`` owns its isolated namespace."""
    base = Path(directory)
    payload = {"version": 1, "backend": BACKEND, "namespace": str(Path(target))}
    staging = base / ".temp"
    store.ensure_ordinary_dir(staging)
    pending = staging / f"isolation-{hashlib.sha256(payload['namespace'].encode()).hexdigest()[:16]}.json"
    pending.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8", newline="\n")
    try:
        pending.replace(base / MARKER_NAME)
    finally:
        if pending.exists():
            pending.unlink()


class _Lock:
    """Exclusive lock on the environment's lock file (Windows msvcrt)."""

    def __init__(self, path: Path):
        self.path = path
        self.fd: int | None = None

    def __enter__(self):
        import os

        try:
            self.fd = os.open(self.path, os.O_CREAT | os.O_RDWR)
        except OSError as error:
            raise ValueError("该环境正在初始化隔离或无法锁定，请稍后重试。") from error
        try:
            if os.fstat(self.fd).st_size == 0:
                os.write(self.fd, b"\0")
            os.lseek(self.fd, 0, os.SEEK_SET)
            import msvcrt

            msvcrt.locking(self.fd, msvcrt.LK_NBLCK, 1)
        except (ImportError, OSError) as error:
            os.close(self.fd)
            self.fd = None
            raise ValueError("该环境正在初始化隔离或无法锁定，请稍后重试。") from error
        return self

    def __exit__(self, *_exc):
        if self.fd is None:
            return False
        import os

        try:
            os.lseek(self.fd, 0, os.SEEK_SET)
            import msvcrt

            msvcrt.locking(self.fd, msvcrt.LK_UNLCK, 1)
        finally:
            os.close(self.fd)
            self.fd = None
        return False


def _assert_unique_namespace(directory: Path) -> None:
    target = registry_path(directory)
    matches = 0
    try:
        siblings = list(directory.parent.iterdir())
    except OSError:
        siblings = []
    for sibling in siblings:
        if sibling.is_dir() and registry_path(sibling) == target:
            matches += 1
    if matches > 1:
        raise ValueError("存在仅大小写不同的环境目录，DWS 会合并其凭据命名空间；请先改为不同名称。")


def _profiles(directory: Path) -> list[dict]:
    path = directory / "profiles.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except (OSError, ValueError) as error:
        raise ValueError("环境身份清单无效，不能迁移共享凭据。") from error
    profiles = payload.get("profiles") if isinstance(payload, dict) else None
    if profiles is None:
        return []
    if not isinstance(profiles, list):
        raise ValueError("环境身份清单无效，不能迁移共享凭据。")
    names: list[dict] = []
    for profile in profiles:
        if not isinstance(profile, dict) or not isinstance(profile.get("corpId"), str) or not isinstance(profile.get("userId"), str):
            raise ValueError("环境身份清单缺少组织或用户标识。")
        names.append(profile)
    return names


def initialize_isolation(directory: str | Path, *, registry: Registry | None = None) -> str:
    """Make ``directory`` own an isolated credential namespace (idempotent)."""
    target = Path(directory).absolute()
    if not store.is_ordinary_dir(target):
        raise ValueError("隔离环境目录不存在。")
    registry = registry or WindowsRegistry()
    _assert_unique_namespace(target)

    with _Lock(target / LOCK_NAME):
        existing = read_marker(target)
        if existing is not None:
            assert_marker(existing, target)
            return str(target)

        isolated = registry_path(target)
        for profile in _profiles(target):
            name = token_value_name(profile["corpId"], profile["userId"])
            ciphertext = read_shared_value(name, registry=registry)
            if ciphertext is not None:
                write_isolated_value(isolated, name, ciphertext, registry=registry)

        # Mark even empty environments: missing credentials must never re-import later.
        write_marker(target, target)
        return str(target)


def remove_isolation(directory: str | Path, *, registry: Registry | None = None) -> None:
    """Delete the environment's isolated namespace; the shared key is untouched."""
    target = Path(directory).absolute()
    if not store.is_ordinary_dir(target):
        raise ValueError("隔离环境目录不存在。")
    registry = registry or WindowsRegistry()
    _assert_unique_namespace(target)
    marker = read_marker(target)
    if marker is None:
        return
    assert_marker(marker, target)
    registry.delete_tree(registry_path(target))
