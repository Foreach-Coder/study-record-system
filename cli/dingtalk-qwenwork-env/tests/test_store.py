import json
import os

import pytest

from qwen_env import store


def test_validate_name_accepts_ordinary_names():
    assert store.validate_name("zxxx-foreach")
    assert store.validate_name("school_12")
    assert store.validate_name("中心小学")


@pytest.mark.parametrize(
    "name",
    ["", "a" * 65, "bad/name", "bad\\name", "..", "CON", "lpt1", "name.with.dot"],
)
def test_validate_name_rejects_bad_names(name):
    assert not store.validate_name(name)


def test_env_dir_is_direct_child_of_root(tmp_path, monkeypatch):
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    paths = tmp_path / ".dingtalk-utils" / "school"
    paths.mkdir(parents=True)

    assert store.env_dir("school") == paths
    with pytest.raises(ValueError):
        store.env_dir("a/b")


def test_remark_round_trip(tmp_path, monkeypatch):
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    directory = tmp_path / ".dingtalk-utils" / "school"
    directory.mkdir(parents=True)

    assert store.read_remark(directory) == ""
    store.write_remark(directory, "中心小学-Foreach")
    assert store.read_remark(directory) == "中心小学-Foreach"

    payload = json.loads((directory / "dingtalk-utils.env.json").read_text(encoding="utf-8"))
    assert payload == {"remark": "中心小学-Foreach"}

    store.write_remark(directory, "")
    assert store.read_remark(directory) == ""


def test_remark_rejects_too_long(tmp_path, monkeypatch):
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    directory = tmp_path / ".dingtalk-utils" / "school"
    directory.mkdir(parents=True)

    with pytest.raises(ValueError):
        store.write_remark(directory, "x" * 2001)


def test_list_environments_sorted_with_remarks(tmp_path, monkeypatch):
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    root = tmp_path / ".dingtalk-utils"
    (root / "b").mkdir(parents=True)
    (root / "a").mkdir()
    (root / "not a name").mkdir()
    store.write_remark(root / "a", "备注 A")

    listed = store.list_environments()

    assert [item["envName"] for item in listed] == ["a", "b"]
    assert listed[0]["remark"] == "备注 A"
    assert listed[1]["remark"] == ""


def test_remove_environment_deletes_tree(tmp_path, monkeypatch):
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    directory = tmp_path / ".dingtalk-utils" / "school"
    (directory / "keychain").mkdir(parents=True)
    (directory / "keychain" / "x.json").write_text("{}", encoding="utf-8")

    assert store.remove_environment("school") is True
    assert not directory.exists()
    assert store.remove_environment("school") is False


def test_remove_environment_refuses_outside_root(tmp_path, monkeypatch):
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    outside = tmp_path / "outside"
    outside.mkdir()

    with pytest.raises(ValueError):
        store.remove_path(outside)


def test_ensure_ordinary_dir_creates_missing(tmp_path):
    target = tmp_path / "nested" / "dir"

    store.ensure_ordinary_dir(target)
    assert target.is_dir()


def test_ensure_ordinary_dir_rejects_reparse_point(tmp_path):
    if os.name != "nt":
        pytest.skip("junction creation is Windows-only")
    target = tmp_path / "real"
    target.mkdir()
    link = tmp_path / "link"
    import subprocess

    subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(target)], check=True, capture_output=True)

    with pytest.raises(ValueError):
        store.ensure_ordinary_dir(link)
