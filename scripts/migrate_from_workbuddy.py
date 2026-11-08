#!/usr/bin/env python3
"""Parse WorkBuddy CSV/HTML exports into a migration plan.

Reads only the source directory and writes only --out; the source is never
modified. Real exports use the Chinese headers from the WorkBuddy data tables,
with a few legacy aliases kept as fallbacks.
"""
import argparse
import csv
import datetime as dt
import json
import re
from pathlib import Path

URL_RE = re.compile(r"https?://[^\s\"'<>),;\]]+")
MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\((https?://[^)\s]+)\)")
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".gif")
IMAGE_HOSTS = ("workbuddy-space-static.codebuddy.work", "static.dingtalk.com")
SKIP_URL_MARKERS = ("marked", "dompurify", "inject.js")


def read_csv(path):
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def pick(row, *names):
    for name in names:
        value = (row.get(name) or "").strip()
        if value:
            return value
    return ""


def date_only(value):
    text = (value or "").strip()
    if not text:
        return None
    candidate = text[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", candidate):
        return None
    try:
        dt.date.fromisoformat(candidate)
    except ValueError:
        return None
    return candidate


def truthy(value):
    return (value or "").strip().lower() in ("true", "1", "是", "yes")


def is_plausible_image(url):
    lowered = url.lower()
    if any(marker in lowered for marker in SKIP_URL_MARKERS):
        return False
    path = lowered.split("?", 1)[0].split("#", 1)[0]
    if path.endswith(IMAGE_EXTENSIONS):
        return True
    return any(host in lowered for host in IMAGE_HOSTS) and ("/image/" in path or "/media/" in path)


def urls_in(value, warnings, label):
    found = []
    for url in URL_RE.findall(value or ""):
        if is_plausible_image(url):
            found.append(url)
        else:
            warnings.append(f"跳过非图片 URL（{label}）: {url}")
    return found


def body_images(body, warnings, label):
    found = MD_IMAGE_RE.findall(body or "")
    if found:
        result = []
        for url in found:
            if is_plausible_image(url):
                result.append(url)
            else:
                warnings.append(f"跳过非图片 URL（{label}）: {url}")
        return result
    return urls_in(body, warnings, label)


def child_items(rows, warnings):
    children = []
    for index, row in enumerate(rows, start=1):
        nickname = pick(row, "昵称", "孩子")
        if not nickname:
            continue
        children.append(
            {
                "legacyId": f"child-{index}",
                "nickname": nickname,
                "birthday": date_only(pick(row, "生日")),
                "grade": pick(row, "年级") or None,
                "school": pick(row, "学校") or None,
                "className": pick(row, "班级") or None,
                "headTeacher": pick(row, "班主任") or None,
                "note": pick(row, "备注") or None,
            }
        )
    if not children:
        warnings.append("未找到孩子档案")
    return children


def task_items(rows, warnings):
    items, images = [], []
    for index, row in enumerate(rows, start=1):
        title = pick(row, "标题")
        if not title:
            continue
        legacy_id = f"task-{index}"
        body = row.get("正文") or ""
        urls = urls_in(row.get("图片"), warnings, legacy_id) + body_images(
            body, warnings, legacy_id
        )
        images += [
            {"url": url, "recordId": legacy_id, "kind": "task"} for url in urls
        ]
        items.append(
            {
                "kind": "task",
                "data": {
                    "legacyId": legacy_id,
                    "孩子": pick(row, "孩子"),
                    "标题": title,
                    "正文": body,
                    "类型": pick(row, "类型") or "作业",
                    "科目": pick(row, "科目") or None,
                    "截止日": date_only(pick(row, "截止日")),
                    "开始日": date_only(pick(row, "开始日")),
                    "已完成": truthy(pick(row, "已完成", "完成")),
                    "已检查": truthy(pick(row, "已检查")),
                    "图片": urls,
                    "录入人": pick(row, "录入人", "创建人") or None,
                },
            }
        )
    return items, images


def behavior_items(rows, warnings):
    items, images = [], []
    for index, row in enumerate(rows, start=1):
        title = pick(row, "标题")
        if not title:
            continue
        legacy_id = f"behavior-{index}"
        body = row.get("正文") or ""
        urls = urls_in(row.get("图片"), warnings, legacy_id) + body_images(
            body, warnings, legacy_id
        )
        images += [
            {"url": url, "recordId": legacy_id, "kind": "behavior"} for url in urls
        ]
        items.append(
            {
                "kind": "behavior",
                "data": {
                    "legacyId": legacy_id,
                    "孩子": pick(row, "孩子"),
                    "标题": title,
                    "正文": body,
                    "日期": date_only(pick(row, "日期")),
                    "维度": pick(row, "维度", "方面") or None,
                    "档位": pick(row, "档位", "倾向") or None,
                    "来源": pick(row, "来源") or None,
                    "图片": urls,
                    "录入人": pick(row, "录入人", "创建人") or None,
                },
            }
        )
    return items, images


def html_images(path, known_urls, warnings):
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8", errors="ignore")
    images, seen = [], set()
    for url in URL_RE.findall(text):
        if url in known_urls or url in seen:
            continue
        if not is_plausible_image(url):
            if any(marker in url for marker in SKIP_URL_MARKERS):
                warnings.append(f"跳过页面脚本 URL: {url}")
            else:
                warnings.append(f"跳过非图片 URL（html）: {url}")
            continue
        seen.add(url)
        images.append({"url": url, "recordId": None, "kind": "html"})
    return images


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    source = Path(args.source)
    if not source.exists():
        raise SystemExit(f"source not found: {source}")

    warnings = []
    children = child_items(read_csv(source / "孩子档案.csv"), warnings)
    tasks, task_images = task_items(read_csv(source / "任务表.csv"), warnings)
    behaviors, behavior_images = behavior_items(read_csv(source / "在校表现.csv"), warnings)
    csv_images = task_images + behavior_images
    extra = html_images(
        source / "学习记录系统.html", {image["url"] for image in csv_images}, warnings
    )
    payload = {
        "children": children,
        "items": tasks + behaviors,
        "images": csv_images + extra,
        "warnings": warnings,
    }
    Path(args.out).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    unique = len({image["url"] for image in payload["images"]})
    print(
        f"children={len(children)} items={len(payload['items'])} "
        f"images={len(payload['images'])} unique_images={unique}"
    )


if __name__ == "__main__":
    main()
