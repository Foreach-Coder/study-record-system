import datetime as dt
import json
import os
import socket
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread

import pytest

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "cli" / "xuexi.py"

CHILD_1 = {
    "id": "c1", "nickname": "李律研", "birthday": None, "grade": "三年级",
    "school": "松山湖中心小学", "className": "一(12)班", "headTeacher": "王老师", "note": None,
}
CHILD_2 = {
    "id": "c2", "nickname": "李小明", "birthday": None, "grade": "一年级",
    "school": "松山湖中心小学", "className": "一(3)班", "headTeacher": "陈老师", "note": None,
}
TASK = {
    "id": "t1", "childId": "c1", "childName": "李律研", "title": "数学口算", "body": "一页",
    "type": "homework", "subject": "数学", "dueDate": "2026-11-07", "startDate": "2026-11-07",
    "completed": False, "checked": False, "images": [{"url": "/media/images/a.jpg", "title": None}],
    "createdBy": "爸爸", "createdAt": "2026-11-07T00:00:00.000Z", "updatedAt": "2026-11-07T00:00:00.000Z",
}
TASK_LATER = {**TASK, "id": "t2", "title": "背古诗", "dueDate": "2026-11-08"}
TASK_OTHER_CHILD = {**TASK, "id": "t3", "childId": "c2", "childName": "李小明", "title": "识字"}
BEHAVIOR = {
    "id": "b1", "childId": "c1", "childName": "李律研", "title": "主动帮同学", "body": "帮同学捡笔",
    "occurredOn": "2026-11-07", "dimension": "品德", "tone": "正向", "source": "老师反馈",
    "images": [], "createdBy": "爸爸", "createdAt": "2026-11-07T00:00:00.000Z",
    "updatedAt": "2026-11-07T00:00:00.000Z",
}
BEHAVIOR_OTHER_DAY = {**BEHAVIOR, "id": "b2", "title": "昨天的事", "occurredOn": "2026-11-06"}
STATE = {
    "schemaVersion": 1, "today": "2026-11-07", "serverTime": "2026-11-07T00:00:00.000Z",
    "children": [CHILD_1, CHILD_2],
    "tasks": [TASK, TASK_LATER, TASK_OTHER_CHILD],
    "behaviors": [BEHAVIOR, BEHAVIOR_OTHER_DAY],
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        forced = getattr(self.server, "status", None)
        if forced:
            self._json(forced, {"error": {"code": "forced", "message": f"forced {forced}"}})
            return
        state = getattr(self.server, "state", STATE)
        if self.path.startswith("/api/state"):
            self._json(200, state)
        elif self.path.startswith("/api/health"):
            self._json(200, getattr(self.server, "health", None) or {"ok": True, "d1": True})
        else:
            self._json(404, {"error": {"code": "not_found", "message": "nope"}})

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


@pytest.fixture()
def server():
    servers = []

    def start(state=STATE, status=None, health=None):
        httpd = HTTPServer(("127.0.0.1", 0), Handler)
        httpd.state = state
        httpd.status = status
        httpd.health = health
        Thread(target=httpd.serve_forever, daemon=True).start()
        servers.append(httpd)
        return f"http://127.0.0.1:{httpd.server_port}"

    yield start
    for httpd in servers:
        httpd.shutdown()


@pytest.fixture()
def base(server):
    return server()


def run(tmp_path, *args, base=None):
    command = [sys.executable, str(CLI)]
    if base:
        command += ["--base-url", base, "--token", "test-token"]
    command += list(args)
    env = {
        "PATH": os.environ.get("PATH", ""),
        "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""),
        "STUDY_RECORD_CONFIG": str(tmp_path / "missing.json"),
    }
    return subprocess.run(command, capture_output=True, text=True, timeout=30, env=env)


def test_show_returns_spec_shape(tmp_path, base):
    result = run(tmp_path, "show", "--date", "2026-11-07", "--child", "李律研", "--json", base=base)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)

    assert payload["student"] == "李律研"
    assert payload["date"] == "2026-11-07"
    assert "ok" not in payload
    assert "students" not in payload

    assert [task["record_id"] for task in payload["tasks"]] == ["t1"]
    task = payload["tasks"][0]
    assert task["标题"] == "数学口算"
    assert task["正文"] == "一页"
    assert task["类型"] == "作业"
    assert task["科目"] == "数学"
    assert task["孩子"] == "李律研"
    assert task["截止日"] == "2026-11-07"
    assert task["开始日"] == "2026-11-07"
    assert task["已完成"] is False
    assert task["已检查"] is False
    assert task["录入人"] == "爸爸"
    assert task["图片"] == {"image": {"images": [{"imageUrl": f"{base}/media/images/a.jpg"}]}}

    assert [item["record_id"] for item in payload["behaviors"]] == ["b1"]
    behavior = payload["behaviors"][0]
    assert behavior["标题"] == "主动帮同学"
    assert behavior["日期"] == "2026-11-07"
    assert behavior["维度"] == "品德"
    assert behavior["档位"] == "正向"
    assert behavior["来源"] == "老师反馈"
    assert behavior["孩子"] == "李律研"
    assert behavior["图片"] == {"image": {"images": []}}
    assert behavior["录入人"] == "爸爸"


def test_show_defaults_to_today_and_single_child(tmp_path, server):
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date().isoformat()
    task = {**TASK, "id": "t9", "dueDate": today, "startDate": today}
    state = {**STATE, "children": [CHILD_1], "tasks": [task], "behaviors": []}
    result = run(tmp_path, "show", "--json", base=server(state))
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["student"] == "李律研"
    assert payload["date"] == today
    assert [item["record_id"] for item in payload["tasks"]] == ["t9"]


def test_show_requires_child_when_ambiguous(tmp_path, base):
    result = run(tmp_path, "show", "--date", "2026-11-07", "--json", base=base)
    assert result.returncode == 1
    assert "孩子" in result.stderr


def test_show_rejects_unknown_child_and_bad_date(tmp_path, base):
    unknown = run(tmp_path, "show", "--date", "2026-11-07", "--child", "不存在", "--json", base=base)
    assert unknown.returncode == 1
    bad_date = run(tmp_path, "show", "--date", "2026-13-01", "--child", "李律研", "--json", base=base)
    assert bad_date.returncode == 1
    compact_date = run(tmp_path, "show", "--date", "20261107", "--child", "李律研", "--json", base=base)
    assert compact_date.returncode == 1


def test_zero_children_is_a_usage_error(tmp_path, server):
    result = run(tmp_path, "show", "--json", base=server({**STATE, "children": []}))
    assert result.returncode == 1
    assert "没有孩子" in result.stderr


def test_http_error_exit_codes(tmp_path, server):
    for status, expected in ((500, 4), (401, 4), (422, 2), (409, 3)):
        result = run(tmp_path, "students", "--json", base=server(status=status))
        assert result.returncode == expected, (status, result.stderr)


def test_connection_refused_exits_4(tmp_path):
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    result = run(tmp_path, "students", "--json", base=f"http://127.0.0.1:{port}")
    assert result.returncode == 4


def test_students_returns_spec_shape(tmp_path, base):
    result = run(tmp_path, "students", "--json", base=base)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert "ok" not in payload
    assert [item["record_id"] for item in payload["students"]] == ["c1", "c2"]
    first = payload["students"][0]
    assert first["name"] == "李律研"
    assert first["grade"] == "三年级"
    assert first["school"] == "松山湖中心小学"
    assert first["klass"] == "一(12)班"
    assert first["teacher"] == "王老师"


def test_missing_token_exits_4(tmp_path):
    result = run(tmp_path, "students", "--json")
    assert result.returncode == 4


def test_offline_is_a_usage_error(tmp_path, base):
    result = run(tmp_path, "show", "--offline", base=base)
    assert result.returncode == 1


PLAN = {
    "child": "李律研",
    "date": "2026-11-07",
    "by": "爸爸",
    "homework": [
        {
            "标题": "数学口算",
            "正文": "一页",
            "类型": "作业",
            "科目": "数学",
            "截止日": "2026-11-07",
            "开始日": "2026-11-07",
            "图片": {"image": {"images": [{"imageUrl": "/media/images/a.jpg"}]}},
        }
    ],
    "todo": [{"标题": "带水杯"}],
    "behavior": [
        {
            "标题": "主动帮同学",
            "正文": "帮同学捡笔",
            "日期": "2026-11-07",
            "维度": "品德",
            "档位": "正向",
            "来源": "老师反馈",
        }
    ],
}

PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff\x9f\xa1"
    b"\x1e\x00\x07\x82\x02\x7f?5\xafY\x00\x00\x00\x00IEND\xaeB`\x82"
)


class WriteHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/state"):
            self._json(200, getattr(self.server, "state", STATE))
        elif self.path.startswith("/api/health"):
            self._json(200, getattr(self.server, "health", None) or {"ok": True, "d1": True})
        else:
            self._json(404, {"error": {"code": "not_found", "message": "nope"}})

    def do_POST(self):
        self._capture()

    def do_PATCH(self):
        self._capture()

    def _capture(self):
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length)
        self.server.captured.append(
            {
                "method": self.command,
                "path": self.path,
                "headers": {key.lower(): value for key, value in self.headers.items()},
                "body": raw,
            }
        )
        self._json(getattr(self.server, "status", 200), getattr(self.server, "reply", {"ok": True}))

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


@pytest.fixture()
def write_server():
    servers = []

    def start(reply, status=200, state=STATE):
        httpd = HTTPServer(("127.0.0.1", 0), WriteHandler)
        httpd.captured = []
        httpd.reply = reply
        httpd.status = status
        httpd.state = state
        Thread(target=httpd.serve_forever, daemon=True).start()
        servers.append(httpd)
        return f"http://127.0.0.1:{httpd.server_port}", httpd

    yield start
    for httpd in servers:
        httpd.shutdown()


def write_json(tmp_path, name, payload):
    path = tmp_path / name
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return path


def test_import_maps_plan_to_child_name(tmp_path, write_server):
    base, httpd = write_server(
        {
            "ok": True,
            "mode": "apply",
            "verification": {"tasks": 2, "behaviors": 1},
            "skipped": {"tasks": 0, "behaviors": 0},
        }
    )
    plan = write_json(tmp_path, "day.json", PLAN)
    result = run(tmp_path, "import", str(plan), "--json", base=base)

    assert result.returncode == 0, result.stderr
    sent = httpd.captured[0]
    assert sent["path"] == "/api/import"
    body = json.loads(sent["body"])
    assert body["mode"] == "apply"
    assert body["onDuplicate"] == "skip"
    assert [item["kind"] for item in body["items"]] == ["task", "task", "behavior"]

    task = body["items"][0]["data"]
    assert task["childName"] == "李律研"
    assert "childId" not in task
    assert task["title"] == "数学口算"
    assert task["type"] == "homework"
    assert task["subject"] == "数学"
    assert task["dueDate"] == "2026-11-07"
    assert task["startDate"] == "2026-11-07"
    assert task["createdBy"] == "爸爸"
    assert task["images"] == [{"url": "/media/images/a.jpg", "title": None}]
    assert body["items"][1]["data"]["type"] == "todo"
    assert body["items"][1]["data"]["childName"] == "李律研"
    behavior = body["items"][2]["data"]
    assert behavior["occurredOn"] == "2026-11-07"
    assert behavior["dimension"] == "品德"
    assert behavior["tone"] == "正向"

    payload = json.loads(result.stdout)
    assert payload["dry_run"] is False
    assert payload["ok"] is True
    assert payload["student"] == "李律研"
    assert payload["date"] == "2026-11-07"
    task_table, behavior_table = payload["tables"]
    assert task_table["table"] == "task"
    assert task_table["label"] == "作业"
    assert (task_table["submitted"], task_table["written"], task_table["verified"]) == (2, 2, 2)
    assert (task_table["skipped"], task_table["failed"], task_table["unverified"]) == (0, 0, 0)
    assert task_table["records"] == []
    assert behavior_table["label"] == "在校表现"
    assert (behavior_table["submitted"], behavior_table["written"]) == (1, 1)


def test_import_dry_run_and_skip(tmp_path, write_server):
    base, httpd = write_server(
        {
            "ok": True,
            "mode": "dry-run",
            "wouldWrite": {"tasks": 2, "behaviors": 1},
            "verification": {"tasks": 0, "behaviors": 0},
            "skipped": {"tasks": 0, "behaviors": 0},
        }
    )
    plan = write_json(tmp_path, "day.json", PLAN)
    result = run(tmp_path, "import", str(plan), "--dry-run", "--on-duplicate", "skip", "--json", base=base)

    assert result.returncode == 0, result.stderr
    body = json.loads(httpd.captured[0]["body"])
    assert body["mode"] == "dry-run"
    assert body["onDuplicate"] == "skip"
    payload = json.loads(result.stdout)
    assert payload["dry_run"] is True
    assert payload["tables"][0]["written"] == 0
    assert payload["tables"][0]["verified"] == 0
    assert payload["tables"][0]["submitted"] == 2


def test_import_explicit_todo_keeps_type(tmp_path, write_server):
    base, httpd = write_server(
        {
            "ok": True,
            "mode": "apply",
            "verification": {"tasks": 1, "behaviors": 0},
            "skipped": {"tasks": 0, "behaviors": 0},
        }
    )
    plan = write_json(
        tmp_path,
        "day.json",
        {
            "child": "李律研",
            "date": "2026-11-07",
            "items": [{"kind": "todo", "data": {"标题": "带水杯"}}],
        },
    )
    result = run(tmp_path, "import", str(plan), "--json", base=base)

    assert result.returncode == 0, result.stderr
    body = json.loads(httpd.captured[0]["body"])
    assert body["items"][0]["data"]["type"] == "todo"
    assert body["items"][0]["data"]["childName"] == "李律研"
    assert json.loads(result.stdout)["tables"][0]["submitted"] == 1


def test_import_duplicate_is_a_write_error(tmp_path, write_server):
    base, _ = write_server(
        {"error": {"code": "duplicate", "message": "重复记录"}}, status=409
    )
    plan = write_json(tmp_path, "day.json", PLAN)
    result = run(tmp_path, "import", str(plan), "--json", base=base)
    assert result.returncode == 3


def test_revise_patches_records(tmp_path, write_server):
    base, httpd = write_server({"ok": True, "id": "t1"})
    payload = {
        "table": "task",
        "items": [
            {
                "record_id": "t1",
                "title": "新标题",
                "body": "新正文",
                "due": "2026-11-09",
                "start": "2026-11-07",
                "subject": "语文",
            }
        ],
    }
    plan = write_json(tmp_path, "revise.json", payload)
    result = run(tmp_path, "revise", str(plan), "--json", base=base)

    assert result.returncode == 0, result.stderr
    sent = httpd.captured[0]
    assert sent["method"] == "PATCH"
    assert sent["path"] == "/api/tasks/t1"
    body = json.loads(sent["body"])
    assert body == {
        "title": "新标题",
        "body": "新正文",
        "dueDate": "2026-11-09",
        "startDate": "2026-11-07",
        "subject": "语文",
    }
    out = json.loads(result.stdout)
    assert out["ok"] is True
    assert out["table"] == "task"
    assert out["label"] == "作业"
    assert (out["submitted"], out["written"], out["verified"]) == (1, 1, 1)
    assert (out["failed"], out["unverified"]) == (0, 0)
    assert out["records"] == ["t1"]


def test_revise_auth_error_exits_4(tmp_path, write_server):
    base, _ = write_server(
        {"error": {"code": "unauthorized", "message": "请先登录"}}, status=401
    )
    payload = {"table": "task", "items": [{"record_id": "t1", "title": "新标题"}]}
    plan = write_json(tmp_path, "revise.json", payload)
    result = run(tmp_path, "revise", str(plan), "--json", base=base)
    assert result.returncode == 4


def test_upload_image_posts_multipart(tmp_path, write_server):
    base, httpd = write_server({"url": "/media/images/abc.png", "width": 1, "height": 1})
    image = tmp_path / "one.png"
    image.write_bytes(PNG_1X1)
    result = run(tmp_path, "upload-image", str(image), "--json", base=base)

    assert result.returncode == 0, result.stderr
    sent = httpd.captured[0]
    assert sent["path"] == "/api/images"
    assert sent["headers"]["content-type"].startswith("multipart/form-data; boundary=")
    raw = sent["body"]
    assert b'name="file"' in raw and b'filename="one.png"' in raw
    assert b'name="width"' in raw and b"\r\n\r\n1\r\n" in raw
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["errors"] == []
    item = payload["images"][0]
    assert item["file"] == "one.png"
    assert item["path"] == str(image)
    assert item["url"] == f"{base}/media/images/abc.png"
    assert (item["width"], item["height"], item["bytes"]) == (1, 1, len(PNG_1X1))
    assert item["cached"] is False


def test_upload_image_auth_error_exits_4(tmp_path, write_server):
    base, _ = write_server(
        {"error": {"code": "unauthorized", "message": "请先登录"}}, status=401
    )
    image = tmp_path / "one.png"
    image.write_bytes(PNG_1X1)
    result = run(tmp_path, "upload-image", str(image), "--json", base=base)
    assert result.returncode == 4


def test_upload_image_missing_file_reports_error(tmp_path, write_server):
    base, _ = write_server({"url": "/media/images/abc.png"})
    result = run(tmp_path, "upload-image", str(tmp_path / "nope.png"), "--json", base=base)
    assert result.returncode == 3
    payload = json.loads(result.stdout)
    assert payload["ok"] is False
    assert payload["errors"]


def test_done_patches_task(tmp_path, write_server):
    base, httpd = write_server({"ok": True})
    result = run(tmp_path, "done", "t1", "--json", base=base)

    assert result.returncode == 0, result.stderr
    sent = httpd.captured[0]
    assert sent["method"] == "PATCH"
    assert sent["path"] == "/api/tasks/t1"
    assert json.loads(sent["body"]) == {"completed": True}
    out = json.loads(result.stdout)
    assert out["ok"] is True
    assert out["record_id"] == "t1"
    assert out["completed"] is True
    assert out["dry_run"] is False


def test_checked_sets_checked_and_completed(tmp_path, write_server):
    base, httpd = write_server({"ok": True})
    result = run(tmp_path, "checked", "t1", "--json", base=base)

    assert result.returncode == 0, result.stderr
    assert json.loads(httpd.captured[0]["body"]) == {"checked": True, "completed": True}
    out = json.loads(result.stdout)
    assert out["checked"] is True
    assert out["completed"] is True


def test_done_find_resolves_one_task(tmp_path, write_server, server):
    base, httpd = write_server({"ok": True})
    result = run(tmp_path, "done", "--find", "数学", "--child", "李律研", "--json", base=base)
    assert result.returncode == 0, result.stderr
    assert [sent["path"] for sent in httpd.captured] == ["/api/tasks/t1"]
    duplicate = {**STATE, "tasks": [TASK, {**TASK, "id": "t9"}]}
    ambiguous = run(
        tmp_path, "done", "--find", "数学", "--child", "李律研", "--json", base=server(duplicate)
    )
    assert ambiguous.returncode == 1


def test_done_all_marks_incomplete_tasks(tmp_path, write_server):
    base, httpd = write_server({"ok": True})
    result = run(tmp_path, "done", "--all", "--child", "李律研", "--json", base=base)
    assert result.returncode == 0, result.stderr
    assert [sent["path"] for sent in httpd.captured] == ["/api/tasks/t1", "/api/tasks/t2"]
    assert all(json.loads(sent["body"]) == {"completed": True} for sent in httpd.captured)


def test_done_dry_run_does_not_patch(tmp_path, write_server):
    base, httpd = write_server({"ok": True})
    result = run(tmp_path, "done", "t1", "--dry-run", "--json", base=base)
    assert result.returncode == 0, result.stderr
    assert httpd.captured == []
    out = json.loads(result.stdout)
    assert out["dry_run"] is True
    assert out["completed"] is True


def test_done_undo_reverses_completion(tmp_path, write_server):
    base, httpd = write_server({"ok": True})
    result = run(tmp_path, "done", "t1", "--undo", "--json", base=base)
    assert result.returncode == 0, result.stderr
    assert json.loads(httpd.captured[0]["body"]) == {"completed": False}
    assert json.loads(result.stdout)["completed"] is False


def test_done_auth_error_exits_4(tmp_path, write_server):
    base, _ = write_server(
        {"error": {"code": "unauthorized", "message": "请先登录"}}, status=401
    )
    result = run(tmp_path, "done", "t1", "--json", base=base)
    assert result.returncode == 4


def test_pending_lists_incomplete_tasks_for_child(tmp_path, base):
    result = run(tmp_path, "pending", "--child", "李律研", "--json", base=base)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert [task["record_id"] for task in payload["tasks"]] == ["t1", "t2"]
    first = payload["tasks"][0]
    assert first["标题"] == "数学口算"
    assert first["类型"] == "作业"
    assert first["孩子"] == "李律研"


def test_daily_renders_selected_child_markdown(tmp_path, base):
    result = run(
        tmp_path, "daily", "--date", "2026-11-07", "--child", "李律研", "--json", base=base
    )
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["date"] == "2026-11-07"
    markdown = payload["markdown"]
    assert markdown.startswith("# 2026-11-07 学习记录")
    assert "- 任务 1 个，完成 0 个" in markdown
    assert "- [ ] 李律研 · 数学口算（2026-11-07）" in markdown
    assert "## 在校表现" in markdown
    assert "李律研 · 主动帮同学：帮同学捡笔" in markdown


def test_doctor_reports_state(tmp_path, base):
    result = run(tmp_path, "doctor", "--json", base=base)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["schemaVersion"] == 1
    assert (payload["children"], payload["tasks"], payload["behaviors"]) == (2, 3, 2)
    assert payload["baseUrl"] == base
    assert payload["configPath"].endswith("missing.json")
    assert "token" not in json.dumps(payload)


def test_doctor_unhealthy_exits_4(tmp_path, server):
    base = server(health={"ok": False, "d1": False})
    result = run(tmp_path, "doctor", "--json", base=base)
    assert result.returncode == 4
