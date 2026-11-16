#!/usr/bin/env python3
r"""One-off migration of the study-record-sync media tree and its cache.

The bridge split moved the sync tool under ``cli/``; the media tree used to
live under ``codes/dingtalk-utils/.temp/study-record-sync``.  This script
copies it byte-for-byte, verifies every file with SHA-256, and rewrites the
absolute ``file`` paths recorded in ``.cache/media.json`` so old cache hits
keep resolving.

The migration already ran (200 files, 41,317,805 B, 175 cache entries) and the
old ``codes/dingtalk-utils`` tree has since been deleted, so this script is now
audit-only: it needs an explicit ``--source`` pointing at a backup copy.

    python cli/scripts/migrate-media.py --source D:\backup\study-record-sync
    python cli/scripts/migrate-media.py --source ... --apply
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

DEFAULT_SOURCE: Path | None = None
DEFAULT_TARGET = Path(r"D:\老力与响\codes\study-record-system\cli\.temp\study-record-sync")
DEFAULT_CACHE = Path(r"D:\老力与响\.agents\skills\study-record-sync\.cache\media.json")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def iter_files(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file() and ".temp" not in path.relative_to(root).parts[:1]:
            yield path


def migrate_tree(source: Path, target: Path, apply: bool) -> dict:
    copied = identical = mismatched = 0
    total_bytes = 0
    problems: list[str] = []
    for src in iter_files(source):
        relative = src.relative_to(source)
        dst = target / relative
        total_bytes += src.stat().st_size
        if dst.exists():
            if sha256(src) == sha256(dst):
                identical += 1
                continue
            mismatched += 1
            problems.append(f"内容不一致：{relative}")
            continue
        if apply:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            if sha256(src) != sha256(dst):
                mismatched += 1
                problems.append(f"复制后校验失败：{relative}")
                continue
        copied += 1
    return {
        "source": str(source),
        "target": str(target),
        "files": copied + identical + mismatched,
        "to_copy": copied,
        "identical": identical,
        "mismatched": mismatched,
        "bytes": total_bytes,
        "problems": problems,
    }


def rewrite_cache(cache_path: Path, source: Path, target: Path, apply: bool) -> dict:
    data = json.loads(cache_path.read_text(encoding="utf-8"))
    old_prefix = str(source)
    new_prefix = str(target)
    rewritten = already = 0
    missing: list[str] = []
    changed = False
    for ref, entry in data.items():
        file_value = entry.get("file") if isinstance(entry, dict) else None
        if not isinstance(file_value, str):
            continue
        if file_value.startswith(new_prefix):
            already += 1
            continue
        if not file_value.startswith(old_prefix):
            continue
        candidate = new_prefix + file_value[len(old_prefix):]
        entry["file"] = candidate
        rewritten += 1
        changed = True
        if not Path(candidate).exists():
            missing.append(candidate)
    if apply and changed:
        cache_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "cache": str(cache_path),
        "entries": len(data),
        "rewritten": rewritten,
        "already_new": already,
        "missing_after_rewrite": missing,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="迁移 study-record-sync 媒体目录与缓存路径")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="旧媒体目录（已随 codes/dingtalk-utils 删除，需指向备份）")
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--apply", action="store_true", help="真正复制并改写缓存；默认只检查")
    args = parser.parse_args(argv)

    if args.source is None:
        parser.error("--source is required: the old tree was deleted after the migration")
    if not args.source.is_dir():
        print(f"源目录不存在：{args.source}", file=sys.stderr)
        return 1
    tree = migrate_tree(args.source, args.target, args.apply)
    cache = rewrite_cache(args.cache, args.source, args.target, args.apply) if args.cache.is_file() else None

    print(json.dumps({"applied": args.apply, "tree": tree, "cache": cache}, ensure_ascii=False, indent=2))
    if tree["mismatched"]:
        return 2
    if cache and cache["missing_after_rewrite"]:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
