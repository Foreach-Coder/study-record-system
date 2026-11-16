"""Environment storage under ``%USERPROFILE%\\.dingtalk-utils``.

One directory per DWS environment, named after the environment. The directory
itself is the credential namespace (its keychain lives inside), so the layout
must not change without re-authorising every environment.
"""

from __future__ import annotations

import json
import os
import shutil
import stat
from pathlib import Path

ROOT_NAME = ".dingtalk-utils"
MARKER_NAME = "dingtalk-utils.env.json"
REMARK_KEY = "remark"
REMARK_LIMIT = 2000
NAME_LIMIT = 64
_RESERVED = {"con", "prn", "aux", "nul"} | {f"com{i}" for i in range(1, 10)} | {
    f"lpt{i}" for i in range(1, 10)
}


def home_dir() -> Path:
    """User profile directory; ``USERPROFILE`` wins on Windows."""
    raw = os.environ.get("USERPROFILE") or os.environ.get("HOME")
    if not raw:
        raise RuntimeError("USERPROFILE 与 HOME 都没有设置，无法定位主目录。")
    return Path(raw)


def root_dir() -> Path:
    """Directory holding one sub-directory per environment."""
    return home_dir() / ROOT_NAME


def validate_name(name: str) -> bool:
    """Return True when ``name`` is a usable single-segment environment name."""
    if not isinstance(name, str):
        return False
    if not 1 <= len(name) <= NAME_LIMIT:
        return False
    if name != name.strip() or name in {".", ".."}:
        return False
    if name.lower() in _RESERVED:
        return False
    for character in name:
        if character.isalnum() or character in {"_", "-"}:
            continue
        return False
    return True


def env_dir(name: str) -> Path:
    """Absolute path of one environment directory inside the root."""
    if not validate_name(name):
        raise ValueError(f"环境名不合法：{name!r}")
    return root_dir() / name


def is_ordinary_dir(path: Path) -> bool:
    """True for a real directory that is not a symlink or junction."""
    try:
        info = path.lstat()
    except OSError:
        return False
    if stat.S_ISLNK(info.st_mode):
        return False
    if os.name == "nt":
        attributes = getattr(info, "st_file_attributes", 0)
        if attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400):
            return False
    return stat.S_ISDIR(info.st_mode)


def ensure_ordinary_dir(path: Path) -> None:
    """Create ``path`` as plain directories; refuse when it resolves elsewhere."""
    if path.exists() or path.is_symlink():
        if not is_ordinary_dir(path):
            raise ValueError(f"路径已存在但不是普通目录：{path}")
        return
    missing: list[Path] = []
    current = path
    while not current.exists() and not current.is_symlink():
        missing.append(current)
        if current.parent == current:
            break
        current = current.parent
    if not is_ordinary_dir(current):
        raise ValueError(f"父目录不是普通目录：{current}")
    for directory in reversed(missing):
        directory.mkdir()
        if not is_ordinary_dir(directory):
            raise ValueError(f"创建出来的不是普通目录：{directory}")


def _inside_root(path: Path) -> bool:
    root = root_dir().resolve(strict=False)
    target = path.resolve(strict=False)
    return target != root and root in target.parents


def remove_path(path: Path) -> None:
    """Delete ``path`` recursively, but only inside the environment root."""
    if not _inside_root(path):
        raise ValueError(f"拒绝删除环境根目录之外的路径：{path}")
    if not path.exists() and not path.is_symlink():
        return
    if is_ordinary_dir(path):
        shutil.rmtree(path)
    else:
        path.unlink()


def remove_environment(name: str) -> bool:
    """Delete one environment directory; False when it did not exist."""
    directory = env_dir(name)
    if not directory.exists() and not directory.is_symlink():
        return False
    remove_path(directory)
    return True


def _marker_path(directory: Path) -> Path:
    return directory / MARKER_NAME


def read_remark(directory: Path) -> str:
    """Remark stored next to one environment ('' when absent or unreadable)."""
    marker = _marker_path(directory)
    try:
        payload = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ""
    if not isinstance(payload, dict):
        return ""
    remark = payload.get(REMARK_KEY)
    return remark if isinstance(remark, str) else ""


def write_remark(directory: Path, remark: str) -> None:
    """Persist a remark; the marker file is UTF-8 without BOM."""
    if not isinstance(remark, str):
        raise ValueError("备注必须是字符串。")
    if len(remark) > REMARK_LIMIT:
        raise ValueError(f"备注最长 {REMARK_LIMIT} 个字符，当前 {len(remark)}。")
    _marker_path(directory).write_text(
        json.dumps({REMARK_KEY: remark}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def list_environments() -> list[dict]:
    """Environments present on disk, sorted by name, with their remarks."""
    root = root_dir()
    if not root.is_dir():
        return []
    found: list[dict] = []
    for child in sorted(root.iterdir(), key=lambda item: item.name):
        if not validate_name(child.name) or not is_ordinary_dir(child):
            continue
        found.append(
            {
                "envName": child.name,
                "directory": str(child),
                "remark": read_remark(child),
            }
        )
    return found
