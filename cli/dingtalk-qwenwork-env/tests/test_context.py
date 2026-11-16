import json
import os
from pathlib import Path

import pytest

from qwen_env import context, keychain


class FakeRegistry:
    def __init__(self, seed=None):
        self.tree = {path: dict(values) for path, values in (seed or {}).items()}

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
def fake_home(tmp_path, monkeypatch):
    monkeypatch.setenv("USERPROFILE", str(tmp_path / "home"))
    (tmp_path / "home").mkdir()
    return tmp_path / "home"


@pytest.fixture()
def project(tmp_path):
    root = tmp_path / "project"
    root.mkdir()
    return root


def test_default_mode_uses_project_temp_and_no_dws_vars(project, fake_home, tmp_path, monkeypatch):
    dws = tmp_path / "bin" / "dws.exe"
    dws.parent.mkdir()
    dws.write_bytes(b"MZ")
    monkeypatch.setenv("PATH", str(dws.parent))

    built = context.build_context(None, project_root=project, env={"PATH": str(dws.parent)})

    assert built["mode"] == "default"
    assert built["envName"] is None
    assert built["corePath"] == str(dws)
    assert built["tempDirectory"] == str(project / ".temp" / "dingtalk-utils" / ".default")
    assert Path(built["tempDirectory"]).is_dir()
    assert built["env"]["TEMP"] == built["tempDirectory"]
    assert built["env"]["TMP"] == built["tempDirectory"]
    assert "DWS_CONFIG_DIR" not in built["env"]


def test_qwenwork_mode_builds_isolated_environment(project, fake_home, monkeypatch):
    core = fake_home / ".qwenworkcn" / "bin" / "ext" / "dws-core-windows-amd64.exe"
    core.parent.mkdir(parents=True)
    core.write_bytes(b"MZ")
    registry = FakeRegistry()

    built = context.build_context("school", project_root=project, registry=registry)

    directory = fake_home / ".dingtalk-utils" / "school"
    assert built["mode"] == "qwenwork"
    assert built["envName"] == "school"
    assert built["directory"] == str(directory)
    assert Path(built["keychainDirectory"]).is_dir()
    assert built["corePath"] == str(core)
    env = built["env"]
    assert env["DWS_CONFIG_DIR"] == str(directory)
    assert env["DWS_KEYCHAIN_DIR"] == str(directory / "keychain")
    # Mirrors the old tool: the namespace handed to dws is the environment directory.
    assert env["DWS_KEYCHAIN_TEST_NAMESPACE"] == str(directory)
    assert env["DINGTALK_QWEN_ENV_NAME"] == "school"
    assert env["DINGTALK_QWEN_DWS_COMMAND"] == str(core)
    assert env["DWS_AGENT_PRODUCT"] == "qwenwork"
    assert env["DWS_AGENT_HOST"] == "desktop"
    assert env["DWS_AGENT_VER"] == "1.4.0"
    assert env["DINGTALK_DWS_AGENTCODE"] == "qwenwork"
    assert env["TEMP"] == str(project / ".temp" / "dingtalk-utils" / "school")
    assert keychain.read_marker(directory) is not None


def test_managed_variables_are_dropped_from_parent(project, fake_home, tmp_path):
    core = fake_home / ".qwenworkcn" / "bin" / "ext" / "dws-core-windows-amd64.exe"
    core.parent.mkdir(parents=True)
    core.write_bytes(b"MZ")
    parent = {
        "PATH": os.environ.get("PATH", ""),
        "KEEP_ME": "1",
        "DWS_CONFIG_DIR": r"C:\stale",
        "DINGTALK_UTILS_ENV_NAME": "old",
        "QWEN_AGENT_X": "stale",
        "NODE_OPTIONS": "--inspect",
    }

    built = context.build_context("school", project_root=project, registry=FakeRegistry(), env=parent)

    assert built["env"]["KEEP_ME"] == "1"
    assert built["env"]["DWS_CONFIG_DIR"] == built["directory"]
    assert built["env"]["DINGTALK_QWEN_ENV_NAME"] == "school"
    assert "QWEN_AGENT_X" not in built["env"]
    assert "NODE_OPTIONS" not in built["env"]
    assert "DINGTALK_UTILS_ENV_NAME" not in built["env"]


def test_override_command_wins_and_bad_extensions_rejected(project, fake_home, tmp_path):
    dws = tmp_path / "custom.exe"
    dws.write_bytes(b"MZ")

    built = context.build_context("school", project_root=project, registry=FakeRegistry(), dws_command=str(dws))
    assert built["corePath"] == str(dws)

    with pytest.raises(ValueError):
        context.build_context("school", project_root=project, registry=FakeRegistry(), dws_command=str(tmp_path / "x.cmd"))


def test_missing_core_raises_clear_error(project, fake_home):
    with pytest.raises(ValueError) as captured:
        context.build_context("school", project_root=project, registry=FakeRegistry())
    assert "QwenWork" in str(captured.value)


def test_invalid_env_name_rejected(project, fake_home):
    with pytest.raises(ValueError):
        context.build_context("bad/name", project_root=project, registry=FakeRegistry())
