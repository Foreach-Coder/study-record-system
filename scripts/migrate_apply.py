#!/usr/bin/env python3
"""Upload WorkBuddy images and apply a migration plan to a deployed worker.

Dry-run only prints counts. Apply creates missing children, downloads and
uploads every unique image once, rewrites every item reference, then imports
the resolved plan through the CLI. Any image failure aborts before importing.
"""
import argparse
import hashlib
import json
import mimetypes
import os
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "cli" / "study-record-cli.py"
UA = {"user-agent": "study-record-migrate/0.1", "accept": "application/json"}
DEFAULT_BASE = "https://study-record-preview.foreach.me"


def unique_urls(urls):
    return list(dict.fromkeys(urls))


def request_json(base, token, method, path, payload=None):
    data = None
    headers = dict(UA)
    headers["authorization"] = f"Bearer {token}"
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["content-type"] = "application/json"
    request = urllib.request.Request(f"{base}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {path} -> {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{method} {path} -> {exc.reason}") from exc
    try:
        return json.loads(raw)
    except ValueError as exc:
        raise RuntimeError(f"{method} {path} -> invalid JSON") from exc


def resize_url(url):
    """Ask the DingTalk OSS to shrink originals before the 5 MiB Worker limit."""
    if "static.dingtalk.com" in url and "x-oss-process" not in url:
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}x-oss-process=image/resize,w_1600/quality,q_82"
    return url


def load_cache(path):
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_cache(path, cache):
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


def download(url, directory):
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    suffix = Path(url.split("?", 1)[0]).suffix or ".jpg"
    path = directory / f"{digest}{suffix}"
    if path.exists():
        return path
    request = urllib.request.Request(
        resize_url(url), headers={"user-agent": "study-record-migrate/0.1"}
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            path.write_bytes(response.read())
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"下载图片失败 {exc.code}: {url}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"下载图片失败 {exc.reason}: {url}") from exc
    return path


def upload(path, base, token):
    boundary = f"----migrate-{uuid.uuid4().hex}"
    content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode("utf-8") + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode("utf-8")
    request = urllib.request.Request(
        f"{base}/api/images",
        data=body,
        method="POST",
        headers={
            **UA,
            "authorization": f"Bearer {token}",
            "content-type": f"multipart/form-data; boundary={boundary}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"上传图片失败 {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"上传图片失败 {exc.reason}") from exc
    url = payload.get("url")
    if not url:
        raise RuntimeError("上传图片失败: 响应缺少 url")
    return url


def ensure_children(plan, base, token):
    state = request_json(base, token, "GET", "/api/state")
    existing = {
        child.get("nickname")
        for child in (state.get("children") or [])
        if isinstance(child, dict)
    }
    created = 0
    for child in plan.get("children") or []:
        nickname = (child.get("nickname") or "").strip()
        if not nickname or nickname in existing:
            continue
        request_json(
            base,
            token,
            "POST",
            "/api/children",
            {
                "nickname": nickname,
                "birthday": child.get("birthday"),
                "grade": child.get("grade"),
                "school": child.get("school"),
                "className": child.get("className"),
                "headTeacher": child.get("headTeacher"),
                "note": child.get("note"),
            },
        )
        existing.add(nickname)
        created += 1
    return created


def rewrite(plan, mapping):
    for item in plan.get("items") or []:
        data = item.get("data")
        if not isinstance(data, dict):
            continue
        urls = data.get("图片")
        if isinstance(urls, list):
            data["图片"] = [mapping.get(url, url) for url in urls]
        body = data.get("正文")
        if isinstance(body, str):
            for old, new in mapping.items():
                body = body.replace(old, new)
            data["正文"] = body
    for image in plan.get("images") or []:
        if isinstance(image, dict) and image.get("url") in mapping:
            image["url"] = mapping[image["url"]]


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def fail(report, report_path, message, code=3):
    write_json(report_path, report)
    print(message, file=sys.stderr)
    return code


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--base-url", default=DEFAULT_BASE)
    parser.add_argument("--token", default=None)
    parser.add_argument("--media-dir", default="media")
    parser.add_argument("--cache", default=".state/migrate-images.json")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    plan_path = Path(args.plan)
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    references = [image.get("url") for image in (plan.get("images") or []) if image.get("url")]
    unique = unique_urls(references)
    counts = (
        f"children={len(plan.get('children') or [])} items={len(plan.get('items') or [])} "
        f"images={len(references)} unique={len(unique)}"
    )

    if args.dry_run:
        print(counts)
        return 0

    if not args.apply or not args.yes:
        print("需要 --apply --yes 才会写入", file=sys.stderr)
        return 1

    token = args.token or os.environ.get("STUDY_RECORD_TOKEN")
    if not token:
        print("缺少 --token 或 STUDY_RECORD_TOKEN", file=sys.stderr)
        return 1

    base = args.base_url.rstrip("/")
    report_path = plan_path.with_name("migration.report.json")
    report = {
        "references": len(references),
        "unique": len(unique),
        "cached": 0,
        "uploaded": 0,
        "failed": [],
        "children_created": 0,
        "import_exit_code": None,
    }

    try:
        report["children_created"] = ensure_children(plan, base, token)
    except Exception as exc:  # noqa: BLE001 - report the concrete API failure
        report["failed"].append({"url": None, "error": f"children: {exc}"})
        return fail(report, report_path, f"创建孩子失败: {exc}")

    media = Path(args.media_dir)
    media.mkdir(parents=True, exist_ok=True)
    cache_path = Path(args.cache)
    cache = load_cache(cache_path)
    mapping = {url: cache[url] for url in unique if isinstance(cache.get(url), str)}
    report["cached"] = len(mapping)
    for url in unique:
        if url in mapping:
            continue
        try:
            local = download(url, media)
            mapping[url] = upload(local, base, token)
            report["uploaded"] += 1
            cache[url] = mapping[url]
            save_cache(cache_path, cache)
        except Exception as exc:  # noqa: BLE001 - collect every image failure
            report["failed"].append({"url": url, "error": str(exc)})

    if report["failed"]:
        save_cache(cache_path, cache)
        return fail(report, report_path, f"图片处理失败，未导入: {report['failed']}")

    save_cache(cache_path, cache)
    rewrite(plan, mapping)
    resolved_path = plan_path.with_name("migration.resolved.json")
    write_json(resolved_path, plan)

    result = subprocess.run(
        [
            sys.executable,
            str(CLI),
            "--base-url",
            base,
            "--token",
            token,
            "import",
            str(resolved_path),
            "--json",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    output = result.stdout or result.stderr
    encoding = sys.stdout.encoding or "utf-8"
    print(output.encode(encoding, "backslashreplace").decode(encoding))
    report["import_exit_code"] = result.returncode
    write_json(report_path, report)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
