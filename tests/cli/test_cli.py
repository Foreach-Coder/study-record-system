import datetime as dt
import json
import os
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
        state = getattr(self.server, "state", STATE)
        if self.path.startswith("/api/state"):
            self._json(200, state)
        elif self.path.startswith("/api/health"):
            self._json(200, {"ok": True, "d1": True})
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

    def start(state=STATE):
        httpd = HTTPServer(("127.0.0.1", 0), Handler)
        httpd.state = state
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
