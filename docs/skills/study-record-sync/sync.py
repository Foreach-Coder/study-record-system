#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""study-record-sync · 把钉钉班级群的学校信息落到学习记录系统。

采集走 study-record-system 的只读桥接 CLI，写入走 study-record-system 的命令行。
本工具只做四件机械的事：取、还原正文、换图、拼文件。判断哪条消息
是什么记录，留给执行它的 Agent。

    python sync.py fetch --date 2026-11-04
    python sync.py parse --input RAW.json --out RUN
    python sync.py media --run RUN
    python sync.py day --run RUN --decisions D.json [--apply]
    python sync.py ledger list
    python sync.py selftest
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent

# 所有工作产物（配置、账本、缓存、运行目录、图片与附件）都在 STUDY_RECORD_SYNC_WORKPLACE
# 指向的目录里。这里不做任何回退：没设置就直接报错，避免又出现第二份数据。
def workspace_root() -> Path:
    raw = os.environ.get("STUDY_RECORD_SYNC_WORKPLACE", "").strip()
    if not raw:
        print(
            "✗ 未设置 STUDY_RECORD_SYNC_WORKPLACE，应指向工作区根下的 .study-record-sync 目录",
            file=sys.stderr,
        )
        raise SystemExit(1)
    path = Path(raw).expanduser()
    if not path.is_absolute():
        print(f"✗ STUDY_RECORD_SYNC_WORKPLACE 必须是绝对路径：{raw}", file=sys.stderr)
        raise SystemExit(1)
    return path


WORK_ROOT = workspace_root()
PROJECT = WORK_ROOT.parent
CONFIG_PATH = WORK_ROOT / "config.json"
CACHE_PATH = WORK_ROOT / "media-cache.json"
LEDGER_PATH = WORK_ROOT / "ledger.json"
RUNS_DIR = WORK_ROOT / "runs"
MEDIA_ROOT = WORK_ROOT / "media"
IMAGES_DIR = MEDIA_ROOT / "images"
FILES_DIR = MEDIA_ROOT / "files"
CLI_ROOT = PROJECT / "codes" / "study-record-system" / "cli"
BRIDGE_CLI = CLI_ROOT / "dingtalk-bridge" / "dingtalk-bridge.ps1"
# QWEN 环境：active 只能在 PowerShell 会话里生效，脚本改用 context 取回该环境的完整
# 变量表 + dws 可执行文件，再直接以该环境跑子进程，不再起 PowerShell。
QWEN_CLI = CLI_ROOT / "dingtalk-qwenwork-env" / "dingtalk-qwenwork-env.ps1"

BEIJING = timezone(timedelta(hours=8))
EXIT_OK, EXIT_USAGE, EXIT_FAIL = 0, 1, 2


# --------------------------------------------------------------------------
# 基础
# --------------------------------------------------------------------------

def say(text: str = "") -> None:
    print(text)


def warn(text: str) -> None:
    print(text, file=sys.stderr)


def die(text: str) -> None:
    warn(f"✗ {text}")
    raise SystemExit(EXIT_USAGE)


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        die(
            f"找不到配置 {CONFIG_PATH}。把 config.json 放到该目录，"
            f"模板见 {SKILL_DIR / 'config.example.json'}"
        )
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def project_path(value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else (PROJECT / p)


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        die(f"找不到文件 {path}")
    except json.JSONDecodeError as exc:
        die(f"{path} 不是合法 JSON：{exc}")


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def norm_text(value: str) -> str:
    text = (value or "").replace("\r\n", "\n").replace("\r", "\n")
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return text.strip("\n")


CHECKLIST_MARK = re.compile(r"^(\s*)([-*+])\s+\[[ xX]\]\s+", re.MULTILINE)


def strip_checklist_marks(text: str) -> str:
    """把 `- [ ]` / `- [x]` 归一成 `- `，让勾选和「转成清单」不算内容变更。"""
    return CHECKLIST_MARK.sub(lambda match: f"{match.group(1)}{match.group(2)} ", text or "")


def fingerprint(title: str, body: str, due: str, start: str = "",
                attachments: list[dict] | None = None) -> str:
    parts = [norm_text(title), norm_text(strip_checklist_marks(body)), due or "", start or ""]
    if attachments:
        parts.append(json.dumps(
            [(str(a.get("name") or ""), str(a.get("url") or ""), int(a.get("size") or 0))
             for a in attachments],
            ensure_ascii=False, sort_keys=True,
        ))
    raw = "\x1f".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def beijing(ms) -> str:
    try:
        ts = int(ms) / 1000
    except (TypeError, ValueError):
        return ""
    return datetime.fromtimestamp(ts, BEIJING).isoformat(timespec="seconds")


# --------------------------------------------------------------------------
# 调 PowerShell 桥接
# --------------------------------------------------------------------------

def run_bridge(args: list[str], *, cwd: Path | None = None, timeout: int = 180) -> dict:
    entry = BRIDGE_CLI
    if not entry.exists():
        die(f"找不到桥接入口 {entry}")

    def quote(value: str) -> str:
        return "'" + str(value).replace("'", "''") + "'"

    inner = "& " + " ".join(quote(a) for a in [str(entry), "bridge", *args])
    script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; " + inner
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        cwd=str(cwd) if cwd else None, capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=timeout,
    )
    stdout = (proc.stdout or "").strip()
    if not stdout:
        tail = (proc.stderr or "").strip().splitlines()[-3:]
        die("桥接没有输出" + ("：" + " / ".join(tail) if tail else "（检查钉钉是否在运行、frida 是否可用）"))
    start = stdout.find("{")
    if start < 0:
        die("桥接输出不是 JSON：" + stdout[:200])
    try:
        return json.loads(stdout[start:])
    except json.JSONDecodeError as exc:
        die(f"桥接 JSON 解析失败：{exc}")


# --------------------------------------------------------------------------
# 桥接卡死时的自救：重启钉钉客户端，等预热，再重试一次
# --------------------------------------------------------------------------

STALL_CODES = {"TIMEOUT", "BRIDGE_PAGE_NOT_FOUND", "INVALID_CEF_RESULT", "NO_CEF_BROWSER", "NO_OUTPUT"}
LAUNCHER_CANDIDATES = (
    Path(r"C:\Program Files (x86)\DingDing\DingtalkLauncher.exe"),
    Path(r"C:\Program Files\DingDing\DingtalkLauncher.exe"),
)


def bridge_stalled(out: dict) -> bool:
    error = out.get("error") if isinstance(out, dict) else None
    code = error.get("code") if isinstance(error, dict) else None
    return (not out.get("success")) and code in STALL_CODES


def powershell(script: str, timeout: int = 90) -> str:
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return (proc.stdout or "").strip()


def client_pid() -> int | None:
    text = powershell(
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8; "
        "Get-Process DingTalk -ErrorAction SilentlyContinue | "
        "Where-Object { $_.MainWindowHandle -ne 0 } | "
        "Sort-Object StartTime | Select-Object -First 1 -ExpandProperty Id"
    )
    return int(text) if text.isdigit() else None


def find_launcher() -> Path | None:
    for candidate in LAUNCHER_CANDIDATES:
        if candidate.exists():
            return candidate
    text = powershell(
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8; "
        "(Get-Process DingTalk -ErrorAction SilentlyContinue | "
        "Sort-Object StartTime | Select-Object -First 1).Path"
    )
    if text:
        exe = Path(text)
        for up in (exe.parent, exe.parent.parent, exe.parent.parent.parent):
            candidate = up / "DingtalkLauncher.exe"
            if candidate.exists():
                return candidate
    return None


def restart_client(wait_seconds: int = 180) -> dict:
    """杀进程重开。硬卡死（CEF 任务队列停摆）只有这一条路能恢复。"""
    cfg = load_config()
    cid = cfg["school"]["cid"]
    launcher = find_launcher()
    if launcher is None:
        return {"success": False, "error": {"code": "LAUNCHER_NOT_FOUND"}}

    powershell("Get-Process frida -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue")
    powershell("Get-Process DingTalk -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue")
    time.sleep(3)
    try:
        subprocess.Popen([str(launcher)])
    except OSError as exc:
        return {"success": False, "error": {"code": "LAUNCH_FAILED", "message": str(exc)[:200]}}

    started = time.time()
    attempts = 0
    while time.time() - started < wait_seconds:
        time.sleep(8)
        attempts += 1
        try:
            probe = run_bridge(["getConversation", "--cid", cid, "--timeout-seconds", "40"])
        except SystemExit:
            probe = {}
        if probe.get("success"):
            return {
                "success": True,
                "attempts": attempts,
                "seconds": round(time.time() - started, 1),
                "pid": probe.get("processId"),
            }
    return {
        "success": False,
        "error": {"code": "RESTART_TIMEOUT", "attempts": attempts, "waited": round(time.time() - started, 1)},
    }


def call_bridge(args: list[str]) -> dict:
    """run_bridge 的宽容版：客户端没开或桥接没输出时返回错误字典，不退出进程。"""
    try:
        return run_bridge(args)
    except SystemExit:
        return {"success": False, "error": {"code": "NO_OUTPUT"}}


def fetch_batch(req_path) -> dict:
    """跑 batch；调不通就重启（或首次启动）钉钉再重试一次。"""
    args = ["batch", "--input", str(req_path), "--timeout-seconds", "120"]
    out = call_bridge(args)
    if not bridge_stalled(out):
        return out

    code = (out.get("error") or {}).get("code")
    running = client_pid() is not None
    say("  " + ("桥接没有响应（" + str(code) + "），重启钉钉后重试……" if running
                 else "钉钉没在运行，先启动客户端……"))
    restart = restart_client()
    if not restart.get("success"):
        out["restart_error"] = restart.get("error")
        return out

    say("  客户端已就绪（" + str(restart.get("seconds")) + " 秒，pid " + str(restart.get("pid")) + "），重试采集……")
    retry = call_bridge(args)
    retry["recovered_by"] = "restart" if retry.get("success") else None
    if not retry.get("success"):
        retry["restart"] = restart
    return retry


# --------------------------------------------------------------------------
# fetch：一次连接取齐四类数据
# --------------------------------------------------------------------------

def qwen_context(env_name: str, command: str) -> dict:
    """问新的 qwen env CLI 要一份会话环境：变量表 + dws 可执行文件。

    active 只能在调用方 PowerShell 会话里生效，所以这里直接跑 Python 模块的
    context 动作拿纯数据，再由 Python 自己带环境跑子进程——全程不启动 PowerShell。
    """
    pkg_root = QWEN_CLI.parent
    if not (pkg_root / "qwen_env" / "__main__.py").exists():
        die(f"找不到 qwen 环境包 {pkg_root}")
    args = ["-m", "qwen_env", "context"]
    if env_name in ("", "--default"):
        args.append("--default")
    else:
        args.append(env_name)
    if command and command != "dws":
        args += ["--dws-command", command]
    env = dict(os.environ)
    env["PYTHONPATH"] = str(pkg_root) + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    proc = subprocess.run(
        [sys.executable, *args], cwd=str(pkg_root), env=env,
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
    )
    stdout = (proc.stdout or "").strip()
    start = stdout.find("{")
    if start < 0:
        die("qwen 环境没有返回 JSON：" + (stdout[:300] or (proc.stderr or "")[:300]))
    try:
        data = json.loads(stdout[start:])
    except json.JSONDecodeError as exc:
        die(f"qwen 环境 JSON 解析失败：{exc}")
    if not data.get("success"):
        die("qwen 环境不可用：" + str(data.get("error") or data.get("errorCode")))
    return data


MANAGED_ENV = re.compile(
    r"^(?:DWS_|DINGTALK_DWS_|DINGTALK_UTILS_|DINGTALK_QWEN_|QWORK_|QODER_|QODERCN_|QODERWORK_|QWENWORK_|QWEN_|QW_)"
    r"|^(?:NODE_OPTIONS|ELECTRON_RUN_AS_NODE|TEMP|TMP)$"
)


def dws_environment(context: dict) -> dict:
    env = {k: v for k, v in os.environ.items() if not MANAGED_ENV.match(k)}
    for name, value in (context.get("env") or {}).items():
        if MANAGED_ENV.match(name):
            env[str(name)] = str(value)
    return env


def run_dws(args: list[str], *, cwd: Path | None = None, timeout: int = 180) -> dict:
    """在 qwenwork 环境里跑 dws，返回 JSON（直接起子进程，不经 PowerShell）。"""
    cfg = load_config()
    env_name = str((cfg.get("dws") or {}).get("env") or "zxxx-foreach")
    command = str((cfg.get("dws") or {}).get("command") or "dws")
    context = qwen_context(env_name, command)
    exe = command if command != "dws" else str(context.get("corePath") or "dws")
    proc = subprocess.run(
        [exe, *args],
        cwd=str(cwd) if cwd else None, env=dws_environment(context),
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
    )
    stdout = (proc.stdout or "").strip()
    if not stdout:
        tail = (proc.stderr or "").strip().splitlines()[-4:]
        die("dws 没有输出" + ("：" + " / ".join(tail) if tail else ""))
    start = stdout.find("{")
    if start < 0:
        die("dws 输出不是 JSON：" + stdout[:300])
    try:
        data = json.loads(stdout[start:])
    except json.JSONDecodeError as exc:
        die(f"dws JSON 解析失败：{exc}")
    if isinstance(data, dict) and data.get("error"):
        error = data["error"]
        message = error.get("message") if isinstance(error, dict) else str(error)
        die(f"dws 失败：{message}")
    return data


def fetch_dws_files(start: str, end: str) -> dict:
    cfg = load_config()
    group = str(cfg["school"].get("openCid") or cfg["school"]["cid"])
    return run_dws([
        "chat", "+chat-messages",
        "--group", group,
        "--start", start, "--end", end,
        "--order", "asc", "--page-all", "--format", "json",
    ])


def build_batch(cfg: dict, start: str, end: str) -> list[dict]:
    school = cfg["school"]
    return [
        {"method": "listMessages", "params": {
            "cid": school["cid"], "start": start, "end": end,
            "pageSize": 50, "pageLimit": 100, "maxItems": 10000}},
        {"method": "listHomework", "params": {
            "corpId": school["corpId"], "classId": school["classId"],
            "studentId": school["studentId"], "role": "guardian", "status": "ALL"}},
        {"method": "listNotices", "params": {
            "corpId": school["corpId"], "classId": school["classId"],
            "studentId": school["studentId"], "status": "ALL"}},
        {"method": "listGroupTodos", "params": {"cid": school["cid"]}},
    ]


def cmd_fetch(args) -> int:
    cfg = load_config()
    if args.start or args.end:
        if not (args.start and args.end):
            die("--start 和 --end 要一起给")
        start, end = args.start, args.end
    else:
        day = date.fromisoformat(args.date) if args.date else date.today()
        days = max(1, int(args.days))
        start = day.isoformat()
        end = (day + timedelta(days=days)).isoformat()

    run_dir = RUNS_DIR / start.replace("-", "")
    run_dir.mkdir(parents=True, exist_ok=True)
    req_path = run_dir / "requests.json"
    write_json(req_path, build_batch(cfg, start, end))

    say(f"采集 {cfg['school']['groupName']}  [{start}, {end})")
    out = fetch_batch(req_path)
    write_json(run_dir / "raw.json", out)
    try:
        dws = fetch_dws_files(start, end)
        write_json(run_dir / "dws.json", dws)
    except SystemExit:
        warn("  ! DWS 资源索引失败，文件附件将不可用")
        write_json(run_dir / "dws.json", {"messages": []})

    results = out.get("results") or []
    ok = True
    for row in results:
        method = row.get("method")
        success = bool(row.get("success"))
        complete = bool(row.get("complete"))
        count = len(row.get("items") or [])
        flag = "✓" if success and complete else "✗"
        if not (success and complete):
            ok = False
        say(f"  {flag} {method:16s} {count:4d} 条"
            + ("" if complete else f"  未读完：{row.get('error') or row.get('code') or '预算耗尽'}"))
    if not out.get("success", True):
        warn("整批没有全部成功，先看清是哪一项，不要当成「没有数据」。")

    say()
    say(f"原始结果：{run_dir / 'raw.json'}")
    write_json(run_dir / "meta.json", {
        "start": start, "end": end,
        "groupName": cfg["school"]["groupName"],
        "cid": cfg["school"]["cid"],
        "fetchedAt": datetime.now(BEIJING).isoformat(timespec="seconds"),
        "complete": ok,
    })
    return EXIT_OK if ok else EXIT_FAIL


# --------------------------------------------------------------------------
# parse：把卡片正文从 payloadV2 里完整还原
# --------------------------------------------------------------------------

def render_payload(payload_v2: str) -> tuple[str, list[dict], int]:
    """payloadV2 → 纯文本 + 图片引用 + 视频数。顺序保持不变。"""
    try:
        data = json.loads(payload_v2)
    except (TypeError, json.JSONDecodeError):
        return "", [], 0

    pieces: list[str] = []
    images: list[dict] = []
    videos = 0

    def walk(items) -> None:
        nonlocal videos
        for item in items or []:
            kind = item.get("type")
            body = item.get("data") or {}
            if kind == "text":
                pieces.append(str(body.get("text") or ""))
            elif kind == "newLine":
                pieces.append("\n")
            elif kind == "image":
                ref = body.get("url") or ""
                images.append({
                    "ref": ref,
                    "width": (item.get("style") or {}).get("width"),
                    "height": (item.get("style") or {}).get("height"),
                })
                pieces.append(f"[图{len(images)}]")
            elif kind == "video":
                videos += 1
                pieces.append("[视频]")

    for block in data.get("contents") or []:
        text = block.get("text") if isinstance(block.get("text"), dict) else block
        walk(text.get("items"))
        if block is not text:
            walk(block.get("items"))

    return norm_text("".join(pieces)), [i for i in images if i["ref"]], videos


def parse_message(base: dict, senders: dict) -> dict:
    content = base.get("content") or {}
    ext = base.get("extension") or {}

    text, images, videos = "", [], 0
    files: list[dict] = []
    for attachment in content.get("attachments") or []:
        ext = attachment.get("extension") or {}
        if ext.get("type") == "file" or ext.get("f_id"):
            try:
                size = int(ext.get("f_size") or 0)
            except (TypeError, ValueError):
                size = 0
            files.append({
                "name": str(ext.get("f_name") or ext.get("name") or "附件"),
                "size": max(0, size),
                "fileId": str(ext.get("f_id") or ""),
                "mediaId": str(ext.get("mediaId") or ""),
                "localPath": str(attachment.get("filePath") or ""),
                "messageId": str(base.get("messageId") or ""),
                "at": beijing(base.get("createdAt")),
                "type": str(ext.get("f_type") or "application/octet-stream"),
            })
        payload = ext.get("payloadV2")
        if not payload:
            continue
        piece, pics, vids = render_payload(payload)
        if piece or pics:
            text = (text + "\n" + piece).strip() if text else piece
            images.extend(pics)
            videos += vids

    if not text and not images:
        text = str((content.get("textContent") or {}).get("text") or "").strip()

    sender_id = str(base.get("senderOpenId") or "")
    is_card = (ext.get("widgetName") == "richTextMessageBubble") or bool(images or videos or files)
    record = {
        "id": str(base.get("messageId") or ""),
        "at": beijing(base.get("createdAt")),
        "senderId": sender_id,
        "sender": senders.get(sender_id, sender_id or "未知"),
        "withdrawn": str(base.get("recallStatus") or "0") not in ("0", "", "None"),
        "edited": int(ext.get("editCount") or (base.get("extension") or {}).get("editCount") or 0) > 0,
        "text": text,
        "images": images,
        "files": files,
        "videos": videos,
        "kind": "card" if is_card else "text",
    }
    return record


def collect_items(raw: dict) -> list[dict]:
    for row in raw.get("results") or []:
        if row.get("method") == "listMessages":
            return row.get("items") or []
    return raw.get("items") or []


def ms_to_date(value) -> str:
    try:
        ms = int(value)
    except (TypeError, ValueError):
        return ""
    if ms <= 0:
        return ""
    try:
        return datetime.fromtimestamp(ms / 1000, BEIJING).strftime("%Y-%m-%d")
    except (OSError, OverflowError, ValueError):
        return ""


def sec_to_date(value) -> str:
    """家校本和通知的 sendTime 是秒级时间戳。"""
    try:
        sec = int(value)
    except (TypeError, ValueError):
        return ""
    if sec <= 0:
        return ""
    if sec > 10 ** 11:  # 有的字段给的是毫秒
        sec = sec / 1000
    try:
        return datetime.fromtimestamp(sec, BEIJING).strftime("%Y-%m-%d")
    except (OSError, OverflowError, ValueError):
        return ""


def strip_html(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    for raw, sub in (("&nbsp;", " "), ("&lt;", "<"), ("&gt;", ">"),
                     ("&amp;", "&"), ("&quot;", '"')):
        text = text.replace(raw, sub)
    return norm_text(text)


def normalize_homework(item: dict) -> dict:
    photos = [p.strip() for p in str(item.get("hwPhoto") or "").split(",") if p.strip()]
    return {
        "source": "homework",
        "id": str(item.get("id") or ""),
        "title": norm_text(str(item.get("hwTitle") or "")),
        "content": strip_html(str(item.get("hwContent") or "")),
        "course": str(item.get("courseName") or ""),
        "deadline": ms_to_date(item.get("hwDeadline")),
        "sentAt": sec_to_date(item.get("sendTime")),
        "teacher": str(item.get("teacherName") or ""),
        "deleted": str(item.get("isDeleted") or "N").upper() == "Y",
        "photos": photos,
    }


def normalize_notice(item: dict) -> dict:
    return {
        "source": "notice",
        "id": str(item.get("id") or ""),
        "title": norm_text(str(item.get("title") or "")),
        "content": strip_html(str(item.get("content") or "")),
        "sentAt": sec_to_date(item.get("sendTime")),
        "signed": str(item.get("signed") or ""),
        "deleted": str(item.get("isDeleted") or "N").upper() == "Y",
    }


def collect_by_method(raw: dict, method: str) -> list[dict]:
    for row in raw.get("results") or []:
        if row.get("method") == method:
            return row.get("items") or []
    return []


def cmd_parse(args) -> int:
    cfg = load_config()
    raw = read_json(Path(args.input))
    run_dir = Path(args.out) if args.out else RUNS_DIR / Path(args.input).parent.name
    run_dir.mkdir(parents=True, exist_ok=True)

    items = collect_items(raw)
    senders = cfg.get("senders") or {}
    messages = [parse_message(item.get("baseMessage") or item, senders) for item in items]
    messages.sort(key=lambda m: m["at"])

    write_json(run_dir / "messages.json", {
        "source": cfg["school"]["groupName"],
        "cid": cfg["school"]["cid"],
        "count": len(messages),
        "messages": messages,
    })

    lines = [f"# {cfg['school']['groupName']} · 消息还原", ""]
    for index, msg in enumerate(messages, start=1):
        flags = []
        if msg["withdrawn"]:
            flags.append("已撤回")
        if msg["edited"]:
            flags.append("已编辑")
        if msg["images"]:
            flags.append(f"{len(msg['images'])} 图")
        if msg["videos"]:
            flags.append(f"{msg['videos']} 视频")
        if msg["files"]:
            flags.append(f"{len(msg['files'])} 附件")
        lines.append(f"## #{index:02d} · {msg['at'][11:16]} · {msg['sender']}"
                     + (f" · {' / '.join(flags)}" if flags else ""))
        lines.append(f"`{msg['id']}`")
        lines.append("")
        lines.append(msg["text"] or "（无文字）")
        for file in msg.get("files") or []:
            lines.append(f"- 附件：{file['name']}（{file.get('size', 0)} bytes）")
        lines.append("")
    (run_dir / "messages.md").write_text("\n".join(lines), encoding="utf-8")

    meta_path = run_dir / "meta.json"
    start = end = ""
    if meta_path.exists():
        meta = read_json(meta_path)
        start, end = meta.get("start") or "", meta.get("end") or ""

    def in_range(row: dict) -> bool:
        if not (start and end):
            return True
        for value in (row.get("sentAt"), row.get("deadline")):
            if value and start <= value < end:
                return True
        return False

    homework = [normalize_homework(i) for i in collect_by_method(raw, "listHomework")]
    for row in homework:
        row["inRange"] = in_range(row)
    homework.sort(key=lambda h: (h["deadline"] or "9999", h["sentAt"]))
    write_json(run_dir / "homework.json", {"count": len(homework), "items": homework})

    fresh_hw = [h for h in homework if not h["deleted"] and h["inRange"]]
    hw_lines = [f"# 家校本 · 作业", "", f"本次范围 [{start}, {end}) 内有 {len(fresh_hw)} 条；"
                f"全部历史 {len(homework)} 条，见 homework.json。", ""]
    for row in fresh_hw:
        hw_lines.append(f"## {row['deadline'] or '无截止'} · {row['course'] or '未标科目'} · {row['title']}")
        hw_lines.append(f"`{row['id']}` · 发布 {row['sentAt']} · {row['teacher']}")
        hw_lines.append("")
        hw_lines.append(row["content"] or "（无正文）")
        hw_lines.append("")
    (run_dir / "homework.md").write_text("\n".join(hw_lines), encoding="utf-8")

    notices = [normalize_notice(i) for i in collect_by_method(raw, "listNotices")]
    for row in notices:
        row["inRange"] = in_range(row)
    notices.sort(key=lambda n: n["sentAt"])
    write_json(run_dir / "notices.json", {"count": len(notices), "items": notices})

    say(f"还原 {len(messages)} 条消息")
    cards = sum(1 for m in messages if m["kind"] == "card")
    pics = sum(len(m["images"]) for m in messages)
    say(f"  卡片 {cards} 条 · 图片 {pics} 张 · 撤回 {sum(1 for m in messages if m['withdrawn'])} 条")
    say(f"家校本 {len(homework)} 条 · 通知 {len(notices)} 条")
    say()
    say(f"人看的：{run_dir / 'messages.md'}、{run_dir / 'homework.md'}")
    say(f"机器用的：{run_dir / 'messages.json'}、{run_dir / 'homework.json'}、{run_dir / 'notices.json'}")
    return EXIT_OK


# --------------------------------------------------------------------------
# media：钉钉图片 → 本地 → CDN 直链
# --------------------------------------------------------------------------

def load_media_cache() -> dict:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


STATIC_MEDIA = "https://static.dingtalk.com/media"
MAX_EDGE = 1280
MAX_UPLOAD = 4 * 1024 * 1024          # 超过这个体积就不往图床传了
UPLOAD_SAFE = 600 * 1024              # base64 膨胀 1.33 倍后逼近后端 1 MiB 单帧上限


def shrink_image(path: Path, max_edge: int = MAX_EDGE, quality: int = 82) -> bool:
    """把过大的原图压到能上传的体积：长边缩到 1280、转真 JPEG。

    后端 upload-image 走 JSON body 传 base64，单帧上限 1 MiB，
    原图 600 KB 以上就会被拒（base64 后 ~1.33 倍）。这里就地覆盖。
    """
    try:
        from PIL import Image
    except ImportError:
        warn("  没有 PIL，跳不过体积限制")
        return False
    try:
        with Image.open(path) as image:
            image = image.convert("RGB")
            image.thumbnail((max_edge, max_edge), Image.LANCZOS)
            image.save(path, "JPEG", quality=quality, optimize=True)
        return True
    except Exception as exc:                      # noqa: BLE001
        warn(f"  压缩失败：{exc}")
        return False


def download_variant(ref: str, width, height, target: Path) -> int:
    """优先取钉钉那边的缩略图：原图常常 8 MB，缩到 1280 宽只剩 120 KB。"""
    mid = ref.lstrip("@")
    urls = []
    if width and height:
        urls.append(f"{STATIC_MEDIA}/{mid}_{width}_{height}.jpg"
                    f"?x-oss-process=image/resize,w_{MAX_EDGE}/quality,q_82")
        urls.append(f"{STATIC_MEDIA}/{mid}_{width}_{height}.jpg")
    for url in urls:
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read()
        except Exception:
            continue
        if len(data) > 1024 and data[:2] == b"\xff\xd8":
            target.write_bytes(data)
            return len(data)
    return 0


def cmd_media(args) -> int:
    run_dir = project_path(args.run)
    source = read_json(run_dir / "messages.json")
    pics: list[dict] = []
    seen: set[str] = set()
    for msg in source.get("messages") or []:
        for pic in msg.get("images") or []:
            ref = pic.get("ref")
            if ref and ref not in seen:
                seen.add(ref)
                pics.append(pic)
    if not pics:
        say("这批消息里没有图片。")
        return EXIT_OK
    limit = int(getattr(args, "limit", 0) or 0)
    if limit > 0:
        pics = pics[:limit]

    cache = load_media_cache()
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, dict] = {}
    failed: list[dict] = []
    total = 0

    for index, pic in enumerate(pics, start=1):
        ref = pic["ref"]
        if ref in cache and cache[ref].get("url"):
            mapping[ref] = cache[ref]
            total += cache[ref].get("bytes") or 0
            say(f"  [{index}/{len(pics)}] 已传过，复用")
            continue

        name = hashlib.sha1(ref.encode("utf-8")).hexdigest()[:16] + ".jpg"
        target = IMAGES_DIR / name
        if not target.exists():
            got = download_variant(ref, pic.get("width"), pic.get("height"), target)
            if not got:
                reply = run_bridge(["downloadImage", "--resource-id", ref,
                                    "--output", f".temp/study-record-sync/images/{name}"])
                if not reply.get("success", True) or not target.exists():
                    failed.append({"ref": ref, "error": reply.get("error") or "下载失败"})
                    continue

        size = target.stat().st_size
        if size > UPLOAD_SAFE:
            # 后端单帧 1 MiB 上限，base64 会膨胀 1.33 倍 → 先压到 700 KB 以内
            if shrink_image(target):
                size = target.stat().st_size
                say(f"  [{index}/{len(pics)}] 原图偏大，已压到 {size // 1024} KB")
        if size > MAX_UPLOAD:
            failed.append({"ref": ref, "error": f"{size // 1024 // 1024} MB 太大，没传"})
            continue

        url = upload_image(target)
        if not url:
            failed.append({"ref": ref, "error": "上传后没拿到地址"})
            continue

        entry = {"url": url, "file": str(target), "bytes": size}
        cache[ref] = entry
        mapping[ref] = entry
        total += size
        write_json(CACHE_PATH, cache)
        say(f"  [{index}/{len(pics)}] {size // 1024} KB → {url.rsplit('/', 1)[-1]}")

    write_json(run_dir / "images.json", mapping)
    say()
    say(f"可用 {len(mapping)} 张，共 {total // 1024} KB"
        + (f"，失败 {len(failed)} 张" if failed else ""))
    for item in failed:
        warn(f"  ✗ {item['ref']}  {item['error']}")

    file_map, file_failed = download_files(source, run_dir)
    if file_map:
        unique_files = {str(v.get("path")): v for v in file_map.values()}
        say(f"文件 {len(unique_files)} 个，已下载/复用")
    for item in file_failed:
        warn(f"  ✗ {item.get('name') or item.get('messageId')}  {item.get('error')}")
    return EXIT_OK if not failed and not file_failed else EXIT_FAIL


def load_dws_resources(run_dir: Path) -> list[dict]:
    path = run_dir / "dws.json"
    if not path.exists():
        return []
    data = read_json(path)
    resources = []
    for message in data.get("messages") or []:
        for ref in message.get("resourceRefs") or []:
            if ref.get("type") not in ("fileId", "file") and ref.get("contentType") != "file":
                continue
            resources.append({
                "name": str(ref.get("name") or ref.get("fileName") or "附件"),
                "resourceId": str(ref.get("resourceId") or ""),
                "resourceIdType": str(ref.get("resourceIdType") or ref.get("type") or "fileId"),
                "messageId": str(message.get("messageId") or ""),
                "createTime": str(message.get("createTime") or ""),
            })
    return resources


def match_dws_resource(file: dict, resources: list[dict]) -> dict | None:
    name = file.get("name") or ""
    at = str(file.get("at") or "")[:16].replace("T", " ")
    candidates = [r for r in resources if r["name"] == name]
    if not candidates:
        return None
    for resource in candidates:
        if resource.get("createTime", "")[:16] == at:
            return resource
    return candidates[0]


def download_files(source: dict, run_dir: Path) -> tuple[dict, list[dict]]:
    messages = source.get("messages") or []
    pending = [f for m in messages for f in (m.get("files") or [])]
    if not pending:
        return {}, []
    resources = load_dws_resources(run_dir)
    base = MEDIA_ROOT
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, dict] = {}
    failed: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for file in pending:
        key = (str(file.get("messageId") or ""), str(file.get("name") or ""))
        if key in seen:
            continue
        seen.add(key)
        name = file.get("name") or "附件"
        message_id = str(file.get("messageId") or "")
        target_dir = FILES_DIR / hashlib.sha1(f"{message_id}:{name}".encode()).hexdigest()[:12]
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / name

        local = str(file.get("localPath") or "")
        if local and Path(local).exists():
            if not target.exists() or target.stat().st_size != Path(local).stat().st_size:
                shutil.copy2(local, target)
        else:
            resource = match_dws_resource(file, resources)
            if not resource or not resource.get("resourceId"):
                failed.append({"name": name, "messageId": message_id, "error": "没有 DWS 资源索引"})
                continue
            rel = target_dir.relative_to(base).as_posix() + "/"
            try:
                run_dws([
                    "chat", "+messages-resource-download",
                    "--type", resource.get("resourceIdType") or "fileId",
                    "--resource-id", resource["resourceId"],
                    "--output", rel,
                    "--overwrite",
                ], cwd=MEDIA_ROOT)
            except SystemExit:
                failed.append({"name": name, "messageId": message_id, "error": "DWS 下载失败"})
                continue
            if not target.exists():
                found = [p for p in target_dir.iterdir() if p.is_file()]
                if found:
                    target = found[0]
        if not target.exists():
            failed.append({"name": name, "messageId": message_id, "error": "下载后文件不存在"})
            continue
        entry = {
            "name": target.name,
            "path": str(target),
            "size": target.stat().st_size,
            "messageId": message_id,
            "type": file.get("type") or "application/octet-stream",
        }
        mapping[f"{message_id}:{name}"] = entry
        mapping.setdefault(f"name:{name}", entry)
        mapping.setdefault(f"name:{target.name}", entry)

    write_json(run_dir / "files.json", mapping)
    return mapping, failed


def upload_file(path: Path) -> dict | None:
    cfg = load_config()
    cli = project_path(cfg["paths"]["studyRecordCli"])
    proc = subprocess.run(
        [sys.executable, str(cli), "upload-file", str(path), "--json"],
        cwd=str(project_path(cfg["paths"]["recordDir"])),
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300,
    )
    text = (proc.stdout or "").strip()
    start = text.find("{")
    if start < 0:
        return None
    try:
        data = json.loads(text[start:])
    except json.JSONDecodeError:
        return None
    files = data.get("files") or []
    return files[0] if files and files[0].get("url") else None


def upload_image(path: Path) -> str:
    cfg = load_config()
    cli = project_path(cfg["paths"]["studyRecordCli"])
    proc = subprocess.run(
        [sys.executable, str(cli), "upload-image", str(path), "--json"],
        cwd=str(project_path(cfg["paths"]["recordDir"])),
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180,
    )
    text = (proc.stdout or "").strip()
    start = text.find("{")
    if start < 0:
        return ""
    try:
        data = json.loads(text[start:])
    except json.JSONDecodeError:
        return ""
    for image in data.get("images") or []:
        if image.get("url"):
            return image["url"]
    return ""


# --------------------------------------------------------------------------
# 账本：itemKey → record_id
# --------------------------------------------------------------------------

def load_ledger() -> dict:
    if LEDGER_PATH.exists():
        try:
            data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
            data.setdefault("items", {})
            return data
        except json.JSONDecodeError:
            die(f"账本损坏：{LEDGER_PATH}")
    return {"version": 1, "items": {}}


def save_ledger(ledger: dict) -> None:
    write_json(LEDGER_PATH, ledger)


def cmd_ledger(args) -> int:
    ledger = load_ledger()
    items = ledger.setdefault("items", {})

    if args.action == "list":
        if not items:
            say("账本还是空的。")
            return EXIT_OK
        for key, row in sorted(items.items()):
            say(f"  {row.get('recordId','?'):24s} {row.get('due','----------')}  {row.get('title','')}")
            say(f"      {key}")
        say()
        say(f"共 {len(items)} 条")
        return EXIT_OK

    if args.action == "show":
        if not args.key:
            die("要指定 --key")
        row = items.get(args.key)
        if not row:
            say("账本里没有这条。")
            return EXIT_FAIL
        say(json.dumps(row, ensure_ascii=False, indent=2))
        return EXIT_OK

    if args.action == "set":
        if not (args.key and args.record_id):
            die("要指定 --key 和 --record-id")
        items[args.key] = {
            "recordId": args.record_id,
            "table": args.table or "task",
            "title": args.title or "",
            "due": args.due or "",
            "fingerprint": fingerprint(args.title or "", args.body or "", args.due or ""),
            "updatedAt": datetime.now(BEIJING).isoformat(timespec="seconds"),
        }
        save_ledger(ledger)
        say(f"✓ 已记下 {args.key} → {args.record_id}")
        return EXIT_OK

    if args.action == "sync":
        return ledger_sync(args)

    die(f"不认识的账本动作 {args.action}")
    return EXIT_USAGE


def ledger_sync(args) -> int:
    """把账本补全：按当天实际记录回填 record_id，只填空缺。"""
    ledger = load_ledger()
    items = ledger.setdefault("items", {})
    cfg = load_config()
    cli = project_path(cfg["paths"]["studyRecordCli"])
    day = args.date or date.today().isoformat()

    proc = subprocess.run(
        [sys.executable, str(cli), "show", "--date", day, "--json"],
        cwd=str(project_path(cfg["paths"]["recordDir"])),
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
    )
    text = (proc.stdout or "").strip()
    start = text.find("{")
    if start < 0:
        die("读不到当天的记录，先跑 study-record-cli.py show 看看")
    data = json.loads(text[start:])

    rows = list(data.get("tasks") or []) + list(data.get("behaviors") or [])
    by_title: dict[str, dict] = {}
    for row in rows:
        by_title.setdefault(str(row.get("标题") or ""), row)

    filled = 0
    for key, row in items.items():
        if row.get("recordId"):
            continue
        hit = by_title.get(row.get("title") or "")
        if hit and hit.get("record_id"):
            row["recordId"] = hit["record_id"]
            filled += 1
    save_ledger(ledger)
    say(f"回填 {filled} 条，账本现有 {len(items)} 条")
    return EXIT_OK


# --------------------------------------------------------------------------
# day：判定结果 → study-record-cli 能吃的两份文件
# --------------------------------------------------------------------------

TABLE_MAP = {"homework": "作业", "todo": "待办", "behavior": "表现"}
BEHAVIOR_SOURCE = {"teacher": "老师反馈", "child": "孩子自述", "self": "我的观察"}


def cmd_day(args) -> int:
    run_dir = project_path(args.run)  # 解析为绝对路径：apply 时子进程 cwd 在别处
    cfg = load_config()
    decisions = read_json(Path(args.decisions))
    ledger = load_ledger()
    known = ledger.get("items") or {}

    images = {}
    images_path = run_dir / "images.json"
    if images_path.exists():
        images = read_json(images_path)
    files = {}
    files_path = run_dir / "files.json"
    if files_path.exists():
        files = read_json(files_path)
    uploaded_files: dict[str, dict] = {}

    # 家校本卡片图（hwPhoto 直链）：按 sources 里的作业 id 自动挂上，
    # 不依赖 Agent 记得把 photos 抄进 decisions
    hw_photos: dict[str, list[str]] = {}
    hw_path = run_dir / "homework.json"
    if hw_path.exists():
        for h in (read_json(hw_path).get("items") or []):
            if h.get("photos"):
                hw_photos[str(h.get("id") or "")] = h["photos"]

    day = decisions.get("date") or date.today().isoformat()
    child = decisions.get("child") or cfg["record"]["child"]
    recorder = decisions.get("by") or cfg["record"]["by"]

    fresh = {"child": child, "date": day, "by": recorder,
             "homework": [], "todo": [], "behavior": []}
    updates: dict[str, list] = {"task": [], "behavior": []}
    unchanged, orphans = [], []
    meta: dict[str, dict] = {}

    for item in decisions.get("items") or []:
        table = str(item.get("table") or "homework").strip().lower()
        label = TABLE_MAP.get(table)
        if not label:
            die(f"不认识的 table：{table}（只认 homework/todo/behavior）")
        title = norm_text(str(item.get("title") or ""))
        if not title:
            die("有一条没写 title")
        body = norm_text(str(item.get("body") or ""))
        due = str(item.get("due") or "") or (day if table != "behavior" else "")
        start = str(item.get("start") or "").strip() or (day if table != "behavior" else "")
        key = str(item.get("itemKey") or "").strip()
        if not key:
            key = f"{table}:{day}:{hashlib.sha1(title.encode()).hexdigest()[:10]}"

        urls: list[str] = []
        for ref in item.get("images") or []:
            hit = images.get(ref)
            if not hit:
                warn(f"  ! 「{title}」的图 {ref} 没换到地址，这条不带图")
                continue
            if hit["url"] not in urls:
                urls.append(hit["url"])
        for url in item.get("urls") or []:
            if url not in urls:
                urls.append(url)
        if table == "homework":
            for src in item.get("sources") or []:
                for url in hw_photos.get(str(src), []):
                    # 家校本图片是 static.dingtalk.com 直链；当前 media 只上传
                    # 消息图片，没有把作业图搬到本站 /media/。不要把外链塞进
                    # 正文，否则详情页会显示破图。
                    if not url.startswith("/media/"):
                        warn(f"  ! 作业图不是本站 media，跳过：{url[:80]}")
                        continue
                    if url not in urls:
                        urls.append(url)
        if urls:
            body = append_images(body, urls)

        attachments: list[dict] = []
        for ref in item.get("attachments") or []:
            if isinstance(ref, dict):
                name = str(ref.get("name") or "")
                message_id = str(ref.get("messageId") or "")
                file_key = f"{message_id}:{name}" if message_id and name else f"name:{name}"
            else:
                text_ref = str(ref)
                file_key = text_ref if ":" in text_ref else f"name:{text_ref}"
            entry = files.get(file_key)
            if not entry:
                warn(f"  ! 「{title}」的附件 {ref} 没有下载到，跳过")
                continue
            path = str(entry.get("path") or "")
            if not path:
                continue
            uploaded = uploaded_files.get(path)
            if not uploaded:
                uploaded = upload_file(Path(path))
                if not uploaded:
                    warn(f"  ! 「{title}」的附件 {entry.get('name')} 上传失败")
                    continue
                uploaded_files[path] = uploaded
            attachments.append({
                "name": entry.get("name") or Path(path).name,
                "url": uploaded.get("url"),
                "size": int(entry.get("size") or 0),
                "type": entry.get("type") or "application/octet-stream",
            })

        record = {"标题": title, "正文": body}
        if attachments:
            record["附件"] = attachments
        # 图片按 Markdown 写入正文；附件字段只留给文件类。
        if table in ("homework", "todo"):
            record["截止日"] = due
            record["开始日"] = start
            record["类型"] = label
        if table == "homework":
            record["科目"] = item.get("subject") or "other"
        if table == "behavior":
            record["日期"] = day
            record["维度"] = item.get("dimension") or "other"
            record["档位"] = item.get("tone") or "neutral"
            record["来源"] = BEHAVIOR_SOURCE.get(str(item.get("source") or "teacher"), "老师反馈")

        fp = fingerprint(title, body, due, start, attachments)
        old = known.get(key)
        if old and old.get("fingerprint") == fp:
            unchanged.append(title)
            continue
        if old and old.get("recordId"):
            patch = {"record_id": old["recordId"], "title": title, "body": body}
            if table in ("homework", "todo") and due:
                patch["due"] = due
                patch["start"] = start
            if attachments:
                patch["attachments"] = attachments
            updates["task" if table != "behavior" else "behavior"].append(patch)
            orphans.append(title)
            meta[key] = {"标题": title, "正文": body,
                         "截止日": due if table != "behavior" else "",
                         "开始日": start if table != "behavior" else "",
                         "附件": attachments}
            continue
        meta[key] = {"标题": title, "正文": body,
                     "截止日": due if table != "behavior" else "",
                     "开始日": start if table != "behavior" else "",
                     "附件": attachments}
        fresh[table].append(record)

    plan_path = run_dir / "day.json"
    write_json(plan_path, fresh)
    revise_path = run_dir / "revise.json"
    write_json(revise_path, [
        {"table": name, "items": rows}
        for name, rows in updates.items() if rows
    ])

    say(f"{child} · {day}")
    say(f"  新增 作业 {len(fresh['homework'])} · 待办 {len(fresh['todo'])} · 表现 {len(fresh['behavior'])}")
    if unchanged:
        say(f"  未变跳过 {len(unchanged)} 条")
    if orphans:
        say(f"  需要更正 {len(orphans)} 条（正文/截止变了）")
        for title in orphans:
            say(f"    ~ {title}")
    has_writes = any(fresh.values()) or any(updates.values())
    if not has_writes:
        say("  没有要写的东西。")
        if args.apply:
            update_sync_cutoff(cfg, latest_message_at(run_dir))
        return EXIT_OK

    say()
    say(f"待写入：{plan_path}")
    if not args.apply:
        say("没有提交。确认没问题后加 --apply。")
        return EXIT_OK

    result = apply_plan(cfg, plan_path, revise_path, key_map=meta)
    if result == EXIT_OK:
        update_sync_cutoff(cfg, latest_message_at(run_dir))
    return result


def latest_message_at(run_dir: Path) -> str | None:
    path = run_dir / "messages.json"
    if not path.exists():
        return None
    values = [str(item.get("at")) for item in (read_json(path).get("messages") or []) if item.get("at")]
    return max(values) if values else None


def update_sync_cutoff(cfg: dict, at: str | None) -> None:
    if not at:
        return
    cli = project_path(cfg["paths"]["studyRecordCli"])
    try:
        proc = subprocess.run(
            [sys.executable, "-X", "utf8", str(cli), "sync-status", "--at", at],
            cwd=str(project_path(cfg["paths"]["recordDir"])),
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        warn(f"  ! 信息同步截至时间写入失败：{exc}")
        return
    if proc.returncode != 0:
        warn(f"  ! 信息同步截至时间写入失败：{(proc.stderr or '').strip()[:300]}")
        return
    say(f"  信息同步截至 {at}")


def append_images(body: str, urls: list[str]) -> str:
    missing = [u for u in urls if u and u not in body]
    if not missing:
        return body
    tail = "\n\n".join(f"![]({u})" for u in missing)
    return (body + "\n\n" + tail).strip() if body else tail


def apply_plan(cfg: dict, plan_path: Path, revise_path: Path, key_map: dict) -> int:
    cli = project_path(cfg["paths"]["studyRecordCli"])
    workdir = project_path(cfg["paths"]["recordDir"])

    plan = read_json(plan_path)
    # Windows 管道下子进程默认用 GBK 打印中文 JSON 会崩，强制 UTF-8
    child_env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    if any(plan.get(k) for k in ("homework", "todo", "behavior")):
        proc = subprocess.run(
            [sys.executable, "-X", "utf8", str(cli), "import", str(plan_path), "--json"],
            cwd=str(workdir), capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=300, env=child_env,
        )
        text = (proc.stdout or "").strip()
        start = text.find("{")
        if start < 0:
            warn(text or "写入没有输出")
            return EXIT_FAIL
        result = json.loads(text[start:])
        for table in result.get("tables") or []:
            say(f"  ● {table.get('label')}：写入 {table.get('written', 0)}，"
                f"核验 {table.get('verified', 0)}，跳过 {table.get('skipped', 0)}")
        if not result.get("ok"):
            warn("有记录没落库，先看上面的明细，别急着重跑。")
            return EXIT_FAIL
        remember(cfg, key_map, str(plan.get("date") or date.today().isoformat()))

    if revise_path.exists():
        patches = read_json(revise_path)
        for group in patches:
            if not group.get("items"):
                continue
            tmp = revise_path.with_name(f"revise-{group['table']}.json")
            write_json(tmp, group)
            subprocess.run(
                [sys.executable, "-X", "utf8", str(cli), "revise", str(tmp)],
                cwd=str(workdir), timeout=300, env=child_env,
            )
    say()
    say("完成。")
    return EXIT_OK


def remember(cfg: dict, key_map: dict, day: str) -> None:
    """写完立刻回读当天记录，把 record_id 记进账本。"""
    led = load_ledger()
    items = led.setdefault("items", {})
    dates = {day}
    dates.update(str(item.get("截止日")) for item in key_map.values() if item.get("截止日"))
    rows = []
    for current in sorted(dates):
        proc = subprocess.run(
            [sys.executable, str(project_path(cfg["paths"]["studyRecordCli"])),
             "show", "--date", current, "--json"],
            cwd=str(project_path(cfg["paths"]["recordDir"])),
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120,
        )
        text = (proc.stdout or "").strip()
        start = text.find("{")
        if start < 0:
            continue
        try:
            data = json.loads(text[start:])
        except json.JSONDecodeError:
            continue
        rows.extend(list(data.get("tasks") or []) + list(data.get("behaviors") or []))
    by_title = {str(r.get("标题") or ""): r for r in rows}
    saved = 0
    for key, item in key_map.items():
        hit = by_title.get(item["标题"])
        if not hit or not hit.get("record_id"):
            continue
        items[key] = {
            "recordId": hit["record_id"],
            "table": "behavior" if "日期" in item else "task",
            "title": item["标题"],
            "due": item.get("截止日", ""),
            "fingerprint": fingerprint(item["标题"], item.get("正文", ""), item.get("截止日", ""), item.get("开始日", ""), hit.get("附件") or item.get("附件") or []),
            "updatedAt": datetime.now(BEIJING).isoformat(timespec="seconds"),
        }
        saved += 1
    save_ledger(led)
    if saved:
        say(f"  账本记下 {saved} 条")


# --------------------------------------------------------------------------
# selftest
# --------------------------------------------------------------------------

SAMPLE_V2 = json.dumps({
    "contents": [{"text": {"items": [
        {"type": "text", "data": {"text": "📚语文小结"}},
        {"type": "newLine", "data": {}},
        {"type": "image", "data": {"url": "@lQDPfake1"}, "style": {"width": 1279, "height": 1067}},
        {"type": "newLine", "data": {}},
        {"type": "video", "data": {}},
        {"type": "text", "data": {"text": "阅读小榜样：律研"}},
    ]}}]
}, ensure_ascii=False)


def cmd_selftest(args) -> int:
    total = passed = 0

    def check(name: str, got, want) -> None:
        nonlocal total, passed
        total += 1
        if got == want:
            passed += 1
            say(f"  ✓ {name}")
        else:
            say(f"  ✗ {name}  得到 {got!r}，应为 {want!r}")

    text, images, videos = render_payload(SAMPLE_V2)
    check("正文还原", text, "📚语文小结\n[图1]\n[视频]阅读小榜样：律研")
    check("图片引用", [i["ref"] for i in images], ["@lQDPfake1"])
    check("图片尺寸", images[0]["width"], 1279)
    check("视频计数", videos, 1)

    msg = parse_message({"messageId": 1, "createdAt": 1793785044373,
                         "senderOpenId": "s1", "recallStatus": 0,
                         "extension": {"editCount": "2"},
                         "content": {"attachments": [
                             {"extension": {"payloadV2": SAMPLE_V2}}]}},
                        {"s1": "示例发送人（班主任）"})
    check("发送人", msg["sender"], "示例发送人（班主任）")
    check("已编辑", msg["edited"], True)
    check("未撤回", msg["withdrawn"], False)
    check("是卡片", msg["kind"], "card")

    plain = parse_message({"messageId": 2, "createdAt": 1793785044373,
                           "senderOpenId": "x", "recallStatus": "1",
                           "content": {"textContent": {"text": "  收到  "}}}, {})
    check("纯文本", plain["text"], "收到")
    check("已撤回", plain["withdrawn"], True)

    check("指纹稳定", fingerprint("a", "b", "2026-11-09"),
          fingerprint("a", "b", "2026-11-09"))
    check("指纹敏感", fingerprint("a", "b", "2026-11-09") != fingerprint("a", "b", "2026-11-10"), True)
    check("补图", append_images("正文", ["u1"]), "正文\n\n![](u1)")
    check("不重复补图", append_images("正文\n\n![](u1)", ["u1"]), "正文\n\n![](u1)")
    check("取消息列表", len(collect_items({"results": [{"method": "listMessages", "items": [1, 2]}]})), 2)
    check("北京时间", beijing(1793785044373)[:13], "2026-11-04T17")
    check("桥接入口存在", BRIDGE_CLI.is_file(), True)

    say()
    say(f"{passed} / {total}")
    return EXIT_OK if passed == total else EXIT_FAIL


# --------------------------------------------------------------------------
# 入口
# --------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(prog="sync.py", description="钉钉 → 学习记录系统")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("fetch", help="从钉钉采集一段时间的数据")
    p.add_argument("--date", default=None, help="哪天，默认今天")
    p.add_argument("--days", default="1", help="连续几天，默认 1")
    p.add_argument("--start", default=None, help="自定义起点 YYYY-MM-DD")
    p.add_argument("--end", default=None, help="自定义终点（不含）")
    p.set_defaults(func=cmd_fetch)

    p = sub.add_parser("parse", help="还原消息正文和图片")
    p.add_argument("--input", required=True, help="fetch 产出的 raw.json")
    p.add_argument("--out", default=None, help="输出目录")
    p.set_defaults(func=cmd_parse)

    p = sub.add_parser("media", help="把钉钉图片换成 CDN 直链")
    p.add_argument("--run", required=True, help="parse 的输出目录")
    p.add_argument("--limit", default="0", help="只处理前 N 张，试跑用")
    p.set_defaults(func=cmd_media)

    p = sub.add_parser("day", help="把判定结果拼成录入文件")
    p.add_argument("--run", required=True)
    p.add_argument("--decisions", required=True, help="Agent 写的判定文件")
    p.add_argument("--apply", action="store_true", help="真的写进学习记录系统")
    p.set_defaults(func=cmd_day)

    p = sub.add_parser("ledger", help="查看或维护 itemKey 账本")
    p.add_argument("action", choices=["list", "show", "set", "sync"])
    p.add_argument("--key", default=None)
    p.add_argument("--record-id", dest="record_id", default=None)
    p.add_argument("--title", default=None)
    p.add_argument("--body", default=None)
    p.add_argument("--due", default=None)
    p.add_argument("--table", default="task", choices=["task", "behavior"])
    p.add_argument("--date", default=None)
    p.set_defaults(func=cmd_ledger)

    p = sub.add_parser("selftest", help="离线自检")
    p.set_defaults(func=cmd_selftest)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        warn("已中断")
        raise SystemExit(130)
