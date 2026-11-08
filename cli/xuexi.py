#!/usr/bin/env python3
"""study-record CLI: 学习记录系统的命令行客户端。

Task 25 只实现基础能力：`show` 与 `students`。后续任务会加入
`import` / `revise` / `upload-image` 等命令。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
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
    child = args.child or data.get("child")
    by = args.by or data.get("by")
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

    def request(self, method: str, path: str, retry: bool = False):
        request = urllib.request.Request(
            f"{self.base}{path}",
            headers={
                "accept": "application/json",
                "user-agent": USER_AGENT,
                "authorization": f"Bearer {self.token}",
            },
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
    raise CliError(EXIT_USAGE, "存在多个孩子，请用 --child 指定")


def parse_date(value: str) -> str:
    try:
        return dt.date.fromisoformat(value).isoformat()
    except ValueError:
        raise CliError(EXIT_USAGE, f"日期格式应为 YYYY-MM-DD: {value}")


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
    return parser


def main(argv=None) -> int:
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as exc:
        return EXIT_USAGE if exc.code else EXIT_OK
    try:
        if args.command == "show" and args.date is None:
            args.date = today_shanghai()
        base, token, config_child, config_by = load_config(args)
        args.child = getattr(args, "child", None) or getattr(args, "global_child", None) or config_child
        args.by = getattr(args, "by", None) or getattr(args, "global_by", None) or config_by
        api = Api(base, token)
        if args.command == "show":
            cmd_show(args, base, api)
        elif args.command == "students":
            cmd_students(args, base, api)
        else:
            raise CliError(EXIT_USAGE, f"未知命令: {args.command}")
        return EXIT_OK
    except CliError as exc:
        print(json.dumps({"ok": False, "error": exc.message}, ensure_ascii=False), file=sys.stderr)
        return exc.code
    except Exception as exc:  # pragma: no cover - 兜底，避免 Python traceback 污染 stderr
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return EXIT_WRITE


if __name__ == "__main__":
    sys.exit(main())
