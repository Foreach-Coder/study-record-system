import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "migrate_from_workbuddy.py"

TASK_HEADER = "标题,类型,科目,截止日,已完成,已检查,孩子,图片,录入人,正文,开始日\n"
BEHAVIOR_HEADER = "标题,日期,维度,档位,来源,孩子,图片,录入人,正文\n"
CHILD_HEADER = "昵称,生日,年级,学校,班级,班主任,备注\n"


def run_parser(tmp_path, html=""):
    source = tmp_path / "source"
    source.mkdir()
    (source / "孩子档案.csv").write_text(
        CHILD_HEADER + "李律研,2020-05-21T00:00:00Z,一年级,松山湖中心小学,一（12）班,银湲,\n",
        encoding="utf-8-sig",
    )
    (source / "任务表.csv").write_text(
        TASK_HEADER
        + '口算,作业,数学,2026-11-07T00:00:00Z,true,false,李律研,https://example.com/a.jpg,爸爸,"口算一页\n'
        + '![图](https://example.com/b.jpg)\n",2026-11-07T00:00:00Z\n'
        + "跳绳,待办,,2026-11-08T00:00:00Z,false,false,李律研,,爸爸,,2026-11-06T00:00:00Z\n",
        encoding="utf-8-sig",
    )
    (source / "在校表现.csv").write_text(
        BEHAVIOR_HEADER
        + "举手,2026-11-07T00:00:00Z,课堂,积极,老师,李律研,,妈妈,主动举手\n",
        encoding="utf-8-sig",
    )
    if html:
        (source / "学习记录系统.html").write_text(html, encoding="utf-8")
    out = tmp_path / "migration.json"
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--source", str(source), "--out", str(out)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert result.returncode == 0, result.stderr
    return json.loads(out.read_text(encoding="utf-8"))


def test_parses_real_headers_and_aliases(tmp_path):
    data = run_parser(tmp_path)

    assert len(data["children"]) == 1
    child = data["children"][0]
    assert child["legacyId"] == "child-1"
    assert child["nickname"] == "李律研"
    assert child["birthday"] == "2020-05-21"
    assert child["school"] == "松山湖中心小学"
    assert child["className"] == "一（12）班"

    assert [item["kind"] for item in data["items"]] == ["task", "task", "behavior"]
    task = data["items"][0]
    assert task["data"]["legacyId"] == "task-1"
    assert task["data"]["标题"] == "口算"
    assert task["data"]["已完成"] is True
    assert task["data"]["已检查"] is False
    assert task["data"]["截止日"] == "2026-11-07"
    assert task["data"]["录入人"] == "爸爸"
    assert task["data"]["图片"] == ["https://example.com/a.jpg", "https://example.com/b.jpg"]

    second = data["items"][1]["data"]
    assert second["legacyId"] == "task-2"
    assert second["已检查"] is False
    assert second["图片"] == []

    behavior = data["items"][2]
    assert behavior["data"]["legacyId"] == "behavior-1"
    assert behavior["data"]["日期"] == "2026-11-07"
    assert behavior["data"]["维度"] == "课堂"
    assert behavior["data"]["档位"] == "积极"
    assert behavior["data"]["录入人"] == "妈妈"

    # image column + markdown body are both captured, in record order
    assert [image["url"] for image in data["images"]] == [
        "https://example.com/a.jpg",
        "https://example.com/b.jpg",
    ]
    assert data["images"][0]["recordId"] == "task-1"
    assert data["images"][0]["kind"] == "task"
    assert data["warnings"] == []


def test_html_images_are_kept_and_script_urls_skipped(tmp_path):
    html = (
        '<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>'
        '<script src="https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js"></script>'
        '<img src="https://workbuddy-space-static.codebuddy.work/image/x.png">'
    )
    data = run_parser(tmp_path, html=html)
    urls = [image["url"] for image in data["images"]]
    assert "https://workbuddy-space-static.codebuddy.work/image/x.png" in urls
    assert not any("marked" in url or "dompurify" in url for url in urls)
    html_image = next(i for i in data["images"] if i["url"].endswith("x.png"))
    assert html_image["recordId"] is None
    assert html_image["kind"] == "html"
    assert any("https://cdn.jsdelivr.net" in warning for warning in data["warnings"])
