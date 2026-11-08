import importlib.util
import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "migrate_apply.py"
CLI = ROOT / "cli" / "xuexi.py"

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24


def load_script():
    spec = importlib.util.spec_from_file_location("migrate_apply", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _record(self):
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length) if length else b""
        self.server.captured.append((self.command, self.path, body))
        return body

    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._record()
        if self.path == "/api/state":
            return self._send(200, {"schemaVersion": 1, "today": "2026-11-07", "serverTime": "", "children": self.server.children, "tasks": [], "behaviors": []})
        if self.path.startswith("/img/"):
            self.send_response(200)
            self.send_header("content-type", "image/png")
            self.send_header("content-length", str(len(PNG)))
            self.end_headers()
            self.wfile.write(PNG)
            return None
        return self._send(404, {"error": {"code": "not_found", "message": "无"}})

    def do_POST(self):
        body = self._record()
        if self.path == "/api/children":
            return self._send(201, {"id": "c1", "nickname": "李律研"})
        if self.path == "/api/images":
            if self.server.fail_upload:
                return self._send(500, {"error": {"code": "internal", "message": "上传失败"}})
            return self._send(201, {"url": "/media/images/test.jpg", "width": 1, "height": 1})
        if self.path == "/api/import":
            return self._send(200, {"ok": True, "mode": "apply", "verification": {"tasks": 1, "behaviors": 0}, "skipped": 0})
        return self._send(404, {"error": {"code": "not_found", "message": "无"}})


def start_server(children=None, fail_upload=False):
    server = HTTPServer(("127.0.0.1", 0), Handler)
    server.children = children or []
    server.fail_upload = fail_upload
    server.captured = []
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def make_plan(tmp_path, image_urls):
    plan = {
        "children": [
            {
                "legacyId": "child-1",
                "nickname": "李律研",
                "birthday": "2020-05-21",
                "grade": "一年级",
                "school": "松山湖中心小学",
                "className": "一（12）班",
                "headTeacher": "银湲",
                "note": None,
            }
        ],
        "items": [
            {
                "kind": "task",
                "data": {
                    "legacyId": "task-1",
                    "孩子": "李律研",
                    "标题": "口算",
                    "正文": "",
                    "类型": "作业",
                    "科目": "数学",
                    "截止日": "2026-11-07",
                    "开始日": None,
                    "已完成": False,
                    "已检查": False,
                    "图片": list(image_urls),
                    "录入人": "爸爸",
                },
            }
        ],
        "images": [{"url": url, "recordId": "task-1", "kind": "task"} for url in image_urls],
        "warnings": [],
    }
    path = tmp_path / "migration.json"
    path.write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
    return path


def run_script(args):
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def test_unique_urls_keeps_order():
    module = load_script()
    urls = ["https://a/1.jpg", "https://a/2.jpg", "https://a/1.jpg", "https://a/3.jpg"]
    assert module.unique_urls(urls) == [
        "https://a/1.jpg",
        "https://a/2.jpg",
        "https://a/3.jpg",
    ]


def test_dry_run_writes_nothing_and_calls_no_api(tmp_path):
    plan = make_plan(tmp_path, ["https://example.com/a.jpg", "https://example.com/a.jpg"])
    result = run_script(["--plan", str(plan), "--dry-run"])
    assert result.returncode == 0, result.stderr
    assert "children=1 items=1 images=2 unique=1" in result.stdout
    assert not (tmp_path / "media").exists()
    assert not (tmp_path / "migration.resolved.json").exists()
    assert not (tmp_path / "migration.report.json").exists()


def test_apply_requires_yes(tmp_path):
    plan = make_plan(tmp_path, [])
    result = run_script(["--plan", str(plan), "--apply", "--token", "t"])
    assert result.returncode != 0
    assert not (tmp_path / "media").exists()


def test_apply_dedupes_uploads_and_rewrites_items(tmp_path):
    server = start_server()
    try:
        base = f"http://127.0.0.1:{server.server_port}"
        url = f"{base}/img/a.png"
        plan = make_plan(tmp_path, [url, url])
        result = run_script(
            [
                "--plan",
                str(plan),
                "--apply",
                "--yes",
                "--base-url",
                base,
                "--token",
                "t",
                "--media-dir",
                str(tmp_path / "media"),
            ]
        )
        assert result.returncode == 0, result.stdout + result.stderr

        paths = [(method, path) for method, path, _ in server.captured]
        assert ("POST", "/api/children") in paths
        assert ("POST", "/api/images") in paths
        assert ("POST", "/api/import") in paths
        assert sum(1 for method, path in paths if path == "/api/images") == 1

        resolved = json.loads((tmp_path / "migration.resolved.json").read_text(encoding="utf-8"))
        assert resolved["items"][0]["data"]["图片"] == ["/media/images/test.jpg", "/media/images/test.jpg"]
        report = json.loads((tmp_path / "migration.report.json").read_text(encoding="utf-8"))
        assert report["uploaded"] == 1
        assert report["failed"] == []
        assert report["import_exit_code"] == 0
        assert len(list((tmp_path / "media").iterdir())) == 1
    finally:
        server.shutdown()


def test_apply_aborts_without_import_when_upload_fails(tmp_path):
    server = start_server(fail_upload=True)
    try:
        base = f"http://127.0.0.1:{server.server_port}"
        plan = make_plan(tmp_path, [f"{base}/img/a.png"])
        result = run_script(
            [
                "--plan",
                str(plan),
                "--apply",
                "--yes",
                "--base-url",
                base,
                "--token",
                "t",
                "--media-dir",
                str(tmp_path / "media"),
            ]
        )
        assert result.returncode == 3, result.stdout + result.stderr
        paths = [path for _, path, _ in server.captured]
        assert "/api/images" in paths
        assert "/api/import" not in paths
        report = json.loads((tmp_path / "migration.report.json").read_text(encoding="utf-8"))
        assert report["uploaded"] == 0
        assert len(report["failed"]) == 1
        assert not (tmp_path / "migration.resolved.json").exists()
    finally:
        server.shutdown()
