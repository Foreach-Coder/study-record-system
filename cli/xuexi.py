#!/usr/bin/env python3
"""study-record CLI: 学习记录系统的命令行客户端。

支持 `show` / `students` / `import` / `revise` / `upload-image`。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

EXIT_OK, EXIT_USAGE, EXIT_VALIDATION, EXIT_WRITE, EXIT_ENV = 0, 1, 2, 3, 4
DEFAULT_BASE = "https://study-record.foreach.me"
USER_AGENT = "study-record-cli/0.1"
TIMEOUT = 30

SHANGHAI = dt.timezone(dt.timedelta(hours=8))


class CliError(Exception):
    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def today_shanghai() -> str:
    return dt.datetime.now(SHANGHAI).date().isoformat()


def config_path() -> Path:
    override = os.environ.get("STUDY_RECORD_CONFIG")
    if override:
        return Path(override)
    if os.name == "nt":
        appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(appdata) / "study-record" / "config.json"
    return Path.home() / ".config" / "study-record" / "config.json"


def load_config(args) -> tuple[str, str, str | None, str | None]:
    data: dict = {}
    path = config_path()
    if path.exists():
        try:
            loaded = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise CliError(EXIT_ENV, f"配置文件无法读取: {exc}")
        if isinstance(loaded, dict):
            data = loaded

    base = args.base_url or os.environ.get("STUDY_RECORD_BASE_URL") or data.get("baseUrl") or DEFAULT_BASE
    token = args.token or os.environ.get("STUDY_RECORD_TOKEN") or data.get("token")
    child = getattr(args, "child", None) or data.get("child")
    by = getattr(args, "by", None) or data.get("by")
    if not token:
        raise CliError(EXIT_ENV, "缺少 token：--token、STUDY_RECORD_TOKEN 或配置文件")
    return str(base).rstrip("/"), str(token), child, by


def absolute_media(base: str, url: str) -> str:
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if not url.startswith("/"):
        url = "/" + url
    return base + url


class Api:
    def __init__(self, base: str, token: str):
        self.base = base
        self.token = token

    def request(self, method: str, path: str, retry: bool = False, body=None, headers=None):
        request_headers = {
            "accept": "application/json",
            "user-agent": USER_AGENT,
            "authorization": f"Bearer {self.token}",
        }
        data = None
        if isinstance(body, dict):
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            request_headers["content-type"] = "application/json"
        elif isinstance(body, (bytes, bytearray)):
            data = bytes(body)
        if headers:
            for key, value in headers.items():
                request_headers[str(key).lower()] = str(value)
        request = urllib.request.Request(
            f"{self.base}{path}",
            data=data,
            headers=request_headers,
            method=method,
        )
        attempts = 2 if retry else 1
        for attempt in range(attempts):
            last_attempt = attempt == attempts - 1
            try:
                with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                    raw = response.read()
                    if not raw:
                        return None
                    try:
                        return json.loads(raw.decode("utf-8"))
                    except ValueError as exc:
                        raise CliError(EXIT_WRITE, f"服务端返回了非法 JSON: {exc}")
            except urllib.error.HTTPError as exc:
                raw = exc.read()
                message = self._error_message(exc.code, raw)
                if exc.code >= 500 and not last_attempt:
                    continue
                if exc.code >= 500:
                    raise CliError(EXIT_ENV, message)
                if exc.code in (401, 403):
                    raise CliError(EXIT_ENV, message)
                if exc.code == 422:
                    raise CliError(EXIT_VALIDATION, message)
                raise CliError(EXIT_WRITE, message)
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                if not last_attempt:
                    continue
                reason = getattr(exc, "reason", exc)
                raise CliError(EXIT_ENV, f"无法连接 {self.base}: {reason}")
        raise CliError(EXIT_ENV, f"无法连接 {self.base}")

    @staticmethod
    def _error_message(code: int, raw: bytes) -> str:
        text = raw.decode("utf-8", "replace")
        try:
            payload = json.loads(text)
        except ValueError:
            return f"HTTP {code}: {text}" if text else f"HTTP {code}"
        error = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        return f"HTTP {code}"

    def get(self, path: str):
        return self.request("GET", path, retry=True)


def image_block(base: str, item: dict) -> dict:
    images = []
    for image in item.get("images") or []:
        if isinstance(image, dict) and image.get("url"):
            images.append({"imageUrl": absolute_media(base, str(image["url"]))})
    return {"image": {"images": images}}


def task_json(base: str, task: dict) -> dict:
    return {
        "record_id": task["id"],
        "标题": task.get("title"),
        "正文": task.get("body"),
        "类型": "作业" if task.get("type") == "homework" else "待办",
        "科目": task.get("subject"),
        "孩子": task.get("childName"),
        "截止日": task.get("dueDate"),
        "开始日": task.get("startDate"),
        "已完成": bool(task.get("completed")),
        "已检查": bool(task.get("checked")),
        "图片": image_block(base, task),
        "录入人": task.get("createdBy"),
    }


def behavior_json(base: str, item: dict) -> dict:
    return {
        "record_id": item["id"],
        "标题": item.get("title"),
        "正文": item.get("body"),
        "日期": item.get("occurredOn"),
        "维度": item.get("dimension"),
        "档位": item.get("tone"),
        "来源": item.get("source"),
        "孩子": item.get("childName"),
        "图片": image_block(base, item),
        "录入人": item.get("createdBy"),
    }


def resolve_child(children: list[dict], preferred: str | None) -> dict:
    if preferred:
        for child in children:
            if child.get("nickname") == preferred:
                return child
        raise CliError(EXIT_USAGE, f"孩子不存在: {preferred}")
    if len(children) == 1:
        return children[0]
    if not children:
        raise CliError(EXIT_USAGE, "还没有孩子，请先在网页端添加")
    raise CliError(EXIT_USAGE, "存在多个孩子，请用 --child 指定")


def parse_date(value: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise CliError(EXIT_USAGE, f"日期格式应为 YYYY-MM-DD: {value}")
    try:
        return dt.date.fromisoformat(value).isoformat()
    except ValueError:
        raise CliError(EXIT_USAGE, f"日期格式应为 YYYY-MM-DD: {value}")


def load_json_file(path: str) -> dict:
    try:
        raw = Path(path).read_text(encoding="utf-8")
    except OSError as exc:
        raise CliError(EXIT_USAGE, f"无法读取文件 {path}: {exc}")
    try:
        payload = json.loads(raw)
    except ValueError as exc:
        raise CliError(EXIT_USAGE, f"文件不是合法 JSON: {exc}")
    if not isinstance(payload, dict):
        raise CliError(EXIT_USAGE, "文件顶层必须是 JSON 对象")
    return payload


TASK_TYPES = {
    "作业": "homework",
    "功课": "homework",
    "homework": "homework",
    "待办": "todo",
    "任务": "todo",
    "todo": "todo",
}


def relative_media(base: str, url: str) -> str:
    if url.startswith(base):
        url = url[len(base):]
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if not url.startswith("/"):
        url = "/" + url
    return url


def images_from(data: dict, base: str) -> list[dict]:
    raw = data.get("图片", data.get("images"))
    images = []
    if isinstance(raw, dict):
        image = raw.get("image")
        if isinstance(image, dict):
            images = image.get("images") or []
        else:
            images = raw.get("images") or []
    elif isinstance(raw, list):
        images = raw
    result = []
    for entry in images or []:
        if isinstance(entry, dict):
            url = entry.get("imageUrl") or entry.get("url")
            title = entry.get("title")
        else:
            url, title = entry, None
        if not url:
            continue
        result.append({"url": relative_media(base, str(url)), "title": title})
    return result


def pick(data: dict, *keys):
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return None


def normalize_item(kind: str, data: dict, payload: dict, base: str, hint: str | None = None) -> dict:
    child = pick(data, "孩子", "child", "childName") or pick(payload, "child", "孩子", "student")
    by = pick(data, "录入人", "by", "createdBy") or pick(payload, "by", "录入人")
    title = pick(data, "标题", "title")
    body = pick(data, "正文", "body") or ""
    images = images_from(data, base)
    if kind == "task":
        raw_type = str(pick(data, "类型", "type") or hint or "作业")
        task_type = TASK_TYPES.get(raw_type, "homework")
        due = pick(data, "截止日", "dueDate", "due") or pick(payload, "date", "日期")
        item = {
            "childName": child,
            "title": title,
            "body": body,
            "type": task_type,
            "dueDate": due,
            "completed": bool(data.get("已完成", data.get("completed", False))),
            "checked": bool(data.get("已检查", data.get("checked", False))),
            "images": images,
        }
        subject = pick(data, "科目", "subject")
        if subject is not None:
            item["subject"] = subject
        start = pick(data, "开始日", "startDate", "start")
        if start is not None:
            item["startDate"] = start
    else:
        item = {
            "childName": child,
            "title": title,
            "body": body,
            "occurredOn": pick(data, "日期", "occurredOn", "date") or pick(payload, "date", "日期"),
            "images": images,
        }
        for source, target in (("维度", "dimension"), ("dimension", "dimension"),
                               ("档位", "tone"), ("tone", "tone"),
                               ("来源", "source"), ("source", "source")):
            value = data.get(source)
            if value not in (None, ""):
                item[target] = value
    if by is not None:
        item["createdBy"] = by
    return item


def plan_items(payload: dict, base: str) -> list[dict]:
    items: list[dict] = []
    explicit = payload.get("items")
    if isinstance(explicit, list):
        for raw in explicit:
            if not isinstance(raw, dict):
                continue
            raw_kind = str(raw.get("kind") or raw.get("table") or "task")
            kind = "behavior" if raw_kind in ("behavior", "behaviors", "表现", "行为", "在校表现") else "task"
            data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
            hint = raw_kind if raw_kind in TASK_TYPES else None
            items.append({"kind": kind, "data": normalize_item(kind, data, payload, base, hint)})
        return items

    sections = (
        ("homework", "task", "homework"),
        ("作业", "task", "homework"),
        ("todo", "task", "todo"),
        ("待办", "task", "todo"),
        ("behavior", "behavior", None),
        ("behaviors", "behavior", None),
        ("行为", "behavior", None),
        ("表现", "behavior", None),
        ("在校表现", "behavior", None),
    )
    for section, kind, forced in sections:
        value = payload.get(section)
        if value is None:
            continue
        records = value if isinstance(value, list) else [value]
        for record in records:
            if not isinstance(record, dict):
                continue
            data = dict(record)
            if kind == "task" and forced and pick(data, "类型", "type") is None:
                data["类型"] = "作业" if forced == "homework" else "待办"
            items.append({"kind": kind, "data": normalize_item(kind, data, payload, base)})
    return items


def media_type(path: Path) -> str:
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(path.suffix.lower(), "application/octet-stream")


def image_size(data: bytes) -> tuple[int, int]:
    try:
        if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
            width, height = struct.unpack(">II", data[16:24])
            return int(width), int(height)
        if data[:2] == b"\xff\xd8":
            index = 2
            while index + 9 < len(data):
                if data[index] != 0xFF:
                    index += 1
                    continue
                marker = data[index + 1]
                if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                              0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    height, width = struct.unpack(">HH", data[index + 5:index + 9])
                    return int(width), int(height)
                size = struct.unpack(">H", data[index + 2:index + 4])[0]
                index += 2 + size
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            chunk = data[12:16]
            if chunk == b"VP8X" and len(data) >= 30:
                return (int.from_bytes(data[24:27], "little") + 1,
                        int.from_bytes(data[27:30], "little") + 1)
            if chunk == b"VP8 " and len(data) >= 30:
                return (int.from_bytes(data[26:28], "little") & 0x3FFF,
                        int.from_bytes(data[28:30], "little") & 0x3FFF)
            if chunk == b"VP8L" and len(data) >= 25:
                bits = int.from_bytes(data[21:25], "little")
                return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    except (struct.error, IndexError):
        pass
    return 0, 0


def multipart_body(fields: dict, name: str, filename: str, data: bytes, content_type: str):
    boundary = "----xuexi" + uuid.uuid4().hex
    parts = []
    for key, value in fields.items():
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
        )
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n".encode()
        + data
        + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def cmd_show(args, base: str, api: Api) -> None:
    date = parse_date(args.date)
    state = api.get("/api/state") or {}
    child = resolve_child(state.get("children") or [], args.child)
    nickname = child.get("nickname")
    tasks = [
        task for task in state.get("tasks") or []
        if task.get("dueDate") == date and task.get("childName") == nickname
    ]
    behaviors = [
        item for item in state.get("behaviors") or []
        if item.get("occurredOn") == date and item.get("childName") == nickname
    ]
    payload = {
        "student": nickname,
        "date": date,
        "tasks": [task_json(base, task) for task in tasks],
        "behaviors": [behavior_json(base, item) for item in behaviors],
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    else:
        print(f"{date} {nickname}: {len(tasks)} 个任务, {len(behaviors)} 条表现")


def cmd_students(args, base: str, api: Api) -> None:
    state = api.get("/api/state") or {}
    students = [
        {
            "record_id": child.get("id"),
            "name": child.get("nickname"),
            "grade": child.get("grade"),
            "school": child.get("school"),
            "klass": child.get("className"),
            "teacher": child.get("headTeacher"),
        }
        for child in state.get("children") or []
    ]
    if args.json:
        print(json.dumps({"students": students}, ensure_ascii=False))
    else:
        for student in students:
            print(student["name"])


def import_tables(items: list[dict], response: dict, dry_run: bool) -> list[dict]:
    verification = response.get("verification") or {}
    skipped = response.get("skipped") or {}
    tables = []
    for kind, table, label, key in (
        ("task", "task", "作业", "tasks"),
        ("behavior", "behavior", "在校表现", "behaviors"),
    ):
        submitted = sum(1 for item in items if item["kind"] == kind)
        verified = 0 if dry_run else int(verification.get(key) or 0)
        tables.append(
            {
                "table": table,
                "label": label,
                "submitted": submitted,
                "written": verified,
                "verified": verified,
                "skipped": int(skipped.get(key) or 0),
                "failed": 0,
                "unverified": 0,
                "records": [],
            }
        )
    return tables


def cmd_import(args, base: str, api: Api) -> int:
    plan = load_json_file(args.file)
    items = plan_items(plan, base)
    dry_run = bool(args.dry_run)
    body = {
        "mode": "dry-run" if dry_run else "apply",
        "onDuplicate": args.on_duplicate,
        "items": items,
    }
    response = api.request("POST", "/api/import", body=body) or {}
    payload = {
        "dry_run": dry_run,
        "ok": bool(response.get("ok", True)),
        "student": pick(plan, "child", "孩子", "student"),
        "date": pick(plan, "date", "日期") or today_shanghai(),
        "tables": import_tables(items, response, dry_run),
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    else:
        for table in payload["tables"]:
            print(f"{table['label']}: 提交 {table['submitted']}，写入 {table['written']}，跳过 {table['skipped']}")
    return EXIT_OK


REVISE_FIELDS = (
    ("title", "title"),
    ("body", "body"),
    ("subject", "subject"),
    ("due", "dueDate"),
    ("dueDate", "dueDate"),
    ("截止日", "dueDate"),
    ("start", "startDate"),
    ("startDate", "startDate"),
    ("开始日", "startDate"),
)


def cmd_revise(args, base: str, api: Api) -> int:
    payload = load_json_file(args.file)
    table = args.table or payload.get("table") or "task"
    table = "behavior" if table in ("behavior", "行为", "表现", "在校表现", "behaviors") else "task"
    items = payload.get("items") or []
    if not isinstance(items, list):
        raise CliError(EXIT_USAGE, "items 必须是数组")
    label = "作业" if table == "task" else "在校表现"
    path = "/api/tasks" if table == "task" else "/api/behaviors"
    written = 0
    failed = 0
    records = []
    for item in items:
        if not isinstance(item, dict) or not item.get("record_id"):
            failed += 1
            continue
        body = {}
        for source, target in REVISE_FIELDS:
            value = item.get(source)
            if value is not None:
                body[target] = value
        if table == "behavior":
            body = {key: value for key, value in body.items() if key in ("title", "body")}
        record_id = str(item["record_id"])
        try:
            api.request(
                "PATCH",
                f"{path}/{urllib.parse.quote(record_id)}",
                body=body,
            )
        except CliError as exc:
            if exc.code == EXIT_ENV:
                raise
            failed += 1
            continue
        written += 1
        records.append(record_id)
    out = {
        "ok": failed == 0,
        "table": table,
        "label": label,
        "submitted": len(items),
        "written": written,
        "verified": written,
        "failed": failed,
        "unverified": 0,
        "records": records,
    }
    if args.json:
        print(json.dumps(out, ensure_ascii=False))
    else:
        print(f"{label}: 提交 {out['submitted']}，写入 {written}，失败 {failed}")
    return EXIT_OK if failed == 0 else EXIT_WRITE


def cmd_upload_image(args, base: str, api: Api) -> int:
    images = []
    errors = []
    for raw_path in args.paths:
        path = Path(raw_path)
        try:
            data = path.read_bytes()
        except OSError as exc:
            errors.append({"file": path.name, "path": raw_path, "error": str(exc)})
            continue
        width, height = image_size(data)
        body, content_type = multipart_body(
            {"width": width, "height": height}, "file", path.name, data, media_type(path)
        )
        try:
            response = api.request(
                "POST",
                "/api/images",
                body=body,
                headers={"content-type": content_type},
            ) or {}
        except CliError as exc:
            if exc.code == EXIT_ENV:
                raise
            errors.append({"file": path.name, "path": raw_path, "error": exc.message})
            continue
        url = str(response.get("url") or "")
        images.append(
            {
                "file": path.name,
                "path": raw_path,
                "url": absolute_media(base, url),
                "width": int(response.get("width") or width),
                "height": int(response.get("height") or height),
                "bytes": len(data),
                "cached": False,
            }
        )
    payload = {"ok": not errors, "images": images, "errors": errors}
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    else:
        print(f"上传 {len(images)} 张，失败 {len(errors)} 张")
    return EXIT_OK if not errors else EXIT_WRITE


def selected_child(state: dict, args) -> dict:
    return resolve_child(state.get("children") or [], args.child)


def child_tasks(state: dict, nickname: str) -> list[dict]:
    return [
        task for task in state.get("tasks") or []
        if task.get("childName") == nickname
    ]


def completion_targets(args, state: dict) -> list[str]:
    nickname = selected_child(state, args).get("nickname")
    rows = child_tasks(state, nickname)
    if sum(1 for value in (args.record_id, args.find, args.all) if value) > 1:
        raise CliError(EXIT_USAGE, "record_id、--find、--all 只能选一个")
    if args.record_id:
        return [str(args.record_id)]
    if args.find:
        matches = [task for task in rows if args.find in str(task.get("title") or "")]
        if len(matches) != 1:
            raise CliError(
                EXIT_USAGE, f"--find「{args.find}」需要恰好匹配一条，实际匹配 {len(matches)} 条"
            )
        return [str(matches[0]["id"])]
    if args.all:
        want_completed = bool(args.undo)
        return [
            str(task["id"]) for task in rows
            if bool(task.get("completed")) == want_completed
        ]
    raise CliError(EXIT_USAGE, "要给一个 record_id，或者用 --find / --all")


def cmd_completion(args, base: str, api: Api, also_check: bool) -> int:
    if args.record_id and not args.find and not args.all:
        ids = [str(args.record_id)]
    else:
        state = api.get("/api/state") or {}
        ids = completion_targets(args, state)
    completed = not args.undo
    checked = not args.undo
    if not args.dry_run:
        for record_id in ids:
            body = {"completed": completed}
            if also_check:
                body = {"checked": checked, "completed": completed}
            api.request(
                "PATCH",
                f"/api/tasks/{urllib.parse.quote(record_id)}",
                body=body,
            )
    payload = {
        "ok": True,
        "record_id": ids[0] if len(ids) == 1 else None,
        "completed": completed,
    }
    if also_check:
        payload["checked"] = checked
    payload["dry_run"] = bool(args.dry_run)
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    else:
        step = "检查" if also_check else "完成"
        prefix = "[dry-run] 会" if args.dry_run else "已"
        print(f"{prefix}{step} {len(ids)} 条")
    return EXIT_OK


def cmd_pending(args, base: str, api: Api) -> int:
    state = api.get("/api/state") or {}
    child = selected_child(state, args)
    rows = [
        task for task in child_tasks(state, child.get("nickname"))
        if not task.get("completed")
    ]
    rows.sort(key=lambda task: task.get("dueDate") or "9999")
    payload = {"ok": True, "tasks": [task_json(base, task) for task in rows]}
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    else:
        print(f"{child.get('nickname')} · 未完成 {len(rows)} 条")
        for task in rows:
            print(f"  {task.get('dueDate')} {task.get('title')}")
    return EXIT_OK


def cmd_daily(args, base: str, api: Api) -> int:
    date = parse_date(args.date)
    state = api.get("/api/state") or {}
    child = selected_child(state, args)
    nickname = child.get("nickname")
    tasks = [
        task for task in child_tasks(state, nickname)
        if task.get("dueDate") == date
    ]
    behaviors = [
        item for item in state.get("behaviors") or []
        if item.get("occurredOn") == date and item.get("childName") == nickname
    ]
    done = sum(1 for task in tasks if task.get("completed"))
    lines = [f"# {date} 学习记录", "", f"- 任务 {len(tasks)} 个，完成 {done} 个"]
    for task in tasks:
        mark = "x" if task.get("completed") else " "
        lines.append(
            f"- [{mark}] {task.get('childName')} · {task.get('title')}（{task.get('dueDate')}）"
        )
    if behaviors:
        lines += ["", "## 在校表现"]
        for item in behaviors:
            lines.append(f"- {item.get('childName')} · {item.get('title')}：{item.get('body') or ''}")
    markdown = "\n".join(lines)
    if args.json:
        print(json.dumps({"ok": True, "date": date, "markdown": markdown}, ensure_ascii=False))
    else:
        print(markdown)
    return EXIT_OK


def cmd_doctor(args, base: str, api: Api) -> int:
    health = api.get("/api/health") or {}
    state = api.get("/api/state") or {}
    ok = bool(health.get("ok"))
    payload = {
        "ok": ok,
        "schemaVersion": state.get("schemaVersion"),
        "children": len(state.get("children") or []),
        "tasks": len(state.get("tasks") or []),
        "behaviors": len(state.get("behaviors") or []),
        "baseUrl": base,
        "configPath": str(config_path()),
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    else:
        print(f"{'✓' if ok else '✗'} {base}")
        print(f"  schemaVersion={payload['schemaVersion']}")
        print(f"  孩子 {payload['children']} · 任务 {payload['tasks']} · 表现 {payload['behaviors']}")
    return EXIT_OK if ok else EXIT_ENV


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="xuexi.py")
    parser.add_argument("--base-url")
    parser.add_argument("--token")
    parser.add_argument("--child", dest="global_child")
    parser.add_argument("--by", dest="global_by")
    sub = parser.add_subparsers(dest="command", required=True)

    show = sub.add_parser("show")
    show.add_argument("--date", default=None)
    show.add_argument("--json", action="store_true")
    show.add_argument("--child")
    show.add_argument("--by")

    students = sub.add_parser("students")
    students.add_argument("--json", action="store_true")
    students.add_argument("--child")
    students.add_argument("--by")

    import_cmd = sub.add_parser("import")
    import_cmd.add_argument("file")
    import_cmd.add_argument("--json", action="store_true")
    import_cmd.add_argument("--dry-run", action="store_true")
    import_cmd.add_argument("--on-duplicate", choices=("error", "skip"), default="skip")
    import_cmd.add_argument("--child")
    import_cmd.add_argument("--by")

    revise = sub.add_parser("revise")
    revise.add_argument("file")
    revise.add_argument("--table", choices=("task", "behavior"), default=None)
    revise.add_argument("--json", action="store_true")
    revise.add_argument("--child")
    revise.add_argument("--by")

    upload = sub.add_parser("upload-image")
    upload.add_argument("paths", nargs="+")
    upload.add_argument("--json", action="store_true")
    upload.add_argument("--child")
    upload.add_argument("--by")

    for name in ("done", "checked"):
        command = sub.add_parser(name)
        command.add_argument("record_id", nargs="?", default=None)
        command.add_argument("--find", default=None)
        command.add_argument("--all", action="store_true")
        command.add_argument("--dry-run", action="store_true")
        command.add_argument("--undo", action="store_true")
        command.add_argument("--json", action="store_true")
        command.add_argument("--child")
        command.add_argument("--by")

    pending = sub.add_parser("pending")
    pending.add_argument("--json", action="store_true")
    pending.add_argument("--child")
    pending.add_argument("--by")

    daily = sub.add_parser("daily")
    daily.add_argument("--date", default=None)
    daily.add_argument("--json", action="store_true")
    daily.add_argument("--child")
    daily.add_argument("--by")

    doctor = sub.add_parser("doctor")
    doctor.add_argument("--json", action="store_true")
    return parser


def main(argv=None) -> int:
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as exc:
        return EXIT_USAGE if exc.code else EXIT_OK
    try:
        if args.command in ("show", "daily") and args.date is None:
            args.date = today_shanghai()
        base, token, config_child, config_by = load_config(args)
        args.child = getattr(args, "child", None) or getattr(args, "global_child", None) or config_child
        args.by = getattr(args, "by", None) or getattr(args, "global_by", None) or config_by
        api = Api(base, token)
        if args.command == "show":
            cmd_show(args, base, api)
            return EXIT_OK
        if args.command == "students":
            cmd_students(args, base, api)
            return EXIT_OK
        if args.command == "import":
            return cmd_import(args, base, api)
        if args.command == "revise":
            return cmd_revise(args, base, api)
        if args.command == "upload-image":
            return cmd_upload_image(args, base, api)
        if args.command == "done":
            return cmd_completion(args, base, api, also_check=False)
        if args.command == "checked":
            return cmd_completion(args, base, api, also_check=True)
        if args.command == "pending":
            return cmd_pending(args, base, api)
        if args.command == "daily":
            return cmd_daily(args, base, api)
        if args.command == "doctor":
            return cmd_doctor(args, base, api)
        raise CliError(EXIT_USAGE, f"未知命令: {args.command}")
    except CliError as exc:
        print(json.dumps({"ok": False, "error": exc.message}, ensure_ascii=False), file=sys.stderr)
        return exc.code
    except Exception as exc:  # pragma: no cover - 兜底，避免 Python traceback 污染 stderr
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return EXIT_WRITE


if __name__ == "__main__":
    sys.exit(main())
