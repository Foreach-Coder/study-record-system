import json

import pytest

from qwen_env import cli


class FakeRegistry:
    def __init__(self):
        self.tree = {}

    def value_names(self, path):
        return sorted(self.tree.get(path, {}))

    def get_string(self, path, name):
        return self.tree.get(path, {}).get(name)

    def set_string_if_absent(self, path, name, value):
        values = self.tree.setdefault(path, {})
        if name in values:
            return False
        values[name] = value
        return True

    def delete_tree(self, path):
        self.tree.pop(path, None)


@pytest.fixture()
def home(tmp_path, monkeypatch):
    monkeypatch.setenv("USERPROFILE", str(tmp_path))
    core = tmp_path / ".qwenworkcn" / "bin" / "ext" / "dws-core-windows-amd64.exe"
    core.parent.mkdir(parents=True)
    core.write_bytes(b"MZ")
    return tmp_path


def run(argv, *, registry=None, login=None, capsys=None):
    code = cli.main(argv, registry=registry or FakeRegistry(), login=login or (lambda *a, **k: {"success": True}))
    out = capsys.readouterr().out.strip()
    return code, json.loads(out) if out else None


def test_help_lists_actions(home, capsys):
    code, payload = run(["--help"], capsys=capsys)

    assert code == 0
    for action in ("add", "list", "update", "remove", "active", "login", "context"):
        assert action in payload["help"]


def test_unknown_action_fails(home, capsys):
    code = cli.main(["bogus"], registry=FakeRegistry(), login=lambda *a, **k: {})
    payload = json.loads(capsys.readouterr().out)

    assert code == 1
    assert payload["errorCode"] == "unknown_action"


def test_list_empty(home, capsys):
    code, payload = run(["list"], capsys=capsys)

    assert code == 0
    assert payload == {"success": True, "environments": []}


def test_add_creates_environment_and_remark(home, capsys):
    calls = []

    def fake_login(context, **kwargs):
        calls.append(context["envName"])
        return {"success": True, "corp_id": "dingabc"}

    code, payload = run(["add", "school", "--remark", "中心小学"], login=fake_login, capsys=capsys)

    assert code == 0
    assert payload["envName"] == "school"
    assert payload["remark"] == "中心小学"
    assert calls == ["school"]

    code, payload = run(["list"], capsys=capsys)
    assert payload["environments"][0]["envName"] == "school"


def test_add_reports_login_failure_and_cleans_up(home, capsys):
    code = cli.main(
        ["add", "school"],
        registry=FakeRegistry(),
        login=lambda *a, **k: {"success": False, "errorCode": "access_denied"},
    )
    payload = json.loads(capsys.readouterr().out)

    assert code == 1
    assert payload["errorCode"] == "access_denied"
    assert not (home / ".dingtalk-utils" / "school").exists()


def test_update_remark_and_clear(home, capsys):
    run(["add", "school"], capsys=capsys)

    code, payload = run(["update", "school", "--remark", "新备注"], capsys=capsys)
    assert (code, payload["remark"]) == (0, "新备注")

    code, payload = run(["update", "school", "--clear-remark"], capsys=capsys)
    assert (code, payload["remark"]) == (0, "")


def test_remove_deletes_environment(home, capsys):
    run(["add", "school"], capsys=capsys)

    code, payload = run(["remove", "school"], capsys=capsys)

    assert code == 0
    assert payload == {"success": True, "envName": "school", "removed": True}
    assert not (home / ".dingtalk-utils" / "school").exists()


def test_remove_missing_environment_fails(home, capsys):
    code = cli.main(["remove", "school"], registry=FakeRegistry(), login=lambda *a, **k: {})
    payload = json.loads(capsys.readouterr().out)

    assert code == 1
    assert payload["errorCode"] == "environment_not_found"


def test_context_default_mode(home, capsys):
    code, payload = run(["context"], capsys=capsys)

    assert code == 0
    assert payload["mode"] == "default"
    assert payload["corePath"].lower().endswith(".exe")


def test_login_requires_existing_environment(home, capsys):
    code = cli.main(["login", "nope"], registry=FakeRegistry(), login=lambda *a, **k: {})
    payload = json.loads(capsys.readouterr().out)

    assert code == 1
    assert payload["errorCode"] == "environment_not_found"
