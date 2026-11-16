import base64
import hashlib
import json

import pytest

from qwen_env import keychain


class FakeRegistry:
    """Minimal stand-in for HKCU string values: {path: {name: value}}."""

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


def test_registry_path_uses_normalised_directory(tmp_path):
    directory = tmp_path / "School"
    directory.mkdir()
    expected = hashlib.sha256(str(directory).lower().encode("utf-8")).hexdigest()[:32]

    assert keychain.registry_path(directory) == f"Software\\DwsCli\\keychain\\dws-cli\\test-{expected}"
    # Trailing separator and letter case must not change the namespace.
    assert keychain.registry_path(str(directory) + "\\") == keychain.registry_path(directory)
    assert keychain.registry_path(str(directory).upper()) == keychain.registry_path(directory)


def test_token_value_name_is_unpadded_base64url_of_account():
    corp, user = "dingabc", "123456"
    digest = hashlib.sha256((corp + "\0" + user).encode("utf-8")).hexdigest()
    account = "auth-token:id:" + digest
    expected = base64.urlsafe_b64encode(account.encode("utf-8")).decode("ascii").rstrip("=")

    assert keychain.token_value_name(corp, user) == expected
    assert keychain.token_value_name(corp, user) != keychain.token_value_name(user, corp)
    with pytest.raises(ValueError):
        keychain.token_value_name("", user)


def test_marker_round_trip_and_validation(tmp_path):
    directory = tmp_path / "school"
    directory.mkdir()

    assert keychain.read_marker(directory) is None
    keychain.write_marker(directory, directory)
    marker = keychain.read_marker(directory)
    assert marker == {
        "version": 1,
        "backend": "windows-dpapi-namespace",
        "namespace": str(directory),
    }
    keychain.assert_marker(marker, directory)
    keychain.assert_marker(marker, str(directory).upper())

    with pytest.raises(ValueError):
        keychain.assert_marker({"version": 2, "backend": "windows-dpapi-namespace", "namespace": str(directory)}, directory)
    with pytest.raises(ValueError):
        keychain.assert_marker({"version": 1, "backend": "sqlite", "namespace": str(directory)}, directory)
    with pytest.raises(ValueError):
        keychain.assert_marker(marker, tmp_path / "other")


def test_initialize_copies_only_named_profiles(tmp_path):
    directory = tmp_path / "school"
    directory.mkdir()
    profiles = {
        "profiles": [
            {"corpId": "corp1", "userId": "u1"},
            {"corpId": "corp2", "userId": "u2"},
        ]
    }
    (directory / "profiles.json").write_text(json.dumps(profiles), encoding="utf-8")
    shared = "Software\\DwsCli\\keychain\\dws-cli"
    keep = keychain.token_value_name("corp1", "u1")
    copy = keychain.token_value_name("corp2", "u2")
    registry = FakeRegistry({shared: {keep: "CIPHER-KEEP", copy: "CIPHER-COPY", "unrelated": "CIPHER-OTHER"}})

    keychain.initialize_isolation(directory, registry=registry)

    isolated = keychain.registry_path(directory)
    assert registry.tree[isolated] == {keep: "CIPHER-KEEP", copy: "CIPHER-COPY"}
    assert keychain.read_marker(directory) is not None


def test_initialize_keeps_newer_local_credentials(tmp_path):
    directory = tmp_path / "school"
    directory.mkdir()
    name = keychain.token_value_name("corp1", "u1")
    (directory / "profiles.json").write_text(
        json.dumps({"profiles": [{"corpId": "corp1", "userId": "u1"}]}), encoding="utf-8"
    )
    isolated = keychain.registry_path(directory)
    registry = FakeRegistry(
        {
            "Software\\DwsCli\\keychain\\dws-cli": {name: "CIPHER-SHARED"},
            isolated: {name: "CIPHER-LOCAL-NEWER"},
        }
    )

    keychain.initialize_isolation(directory, registry=registry)

    assert registry.tree[isolated][name] == "CIPHER-LOCAL-NEWER"


def test_initialize_marks_empty_environment(tmp_path):
    directory = tmp_path / "empty"
    directory.mkdir()
    registry = FakeRegistry()

    keychain.initialize_isolation(directory, registry=registry)

    assert keychain.read_marker(directory) is not None
    assert registry.value_names(keychain.registry_path(directory)) == []


def test_initialize_is_idempotent_and_rejects_moved_directory(tmp_path):
    directory = tmp_path / "school"
    directory.mkdir()
    registry = FakeRegistry()

    keychain.initialize_isolation(directory, registry=registry)
    keychain.initialize_isolation(directory, registry=registry)

    marker = keychain.read_marker(directory)
    marker["namespace"] = str(tmp_path / "moved")
    keychain.write_marker(directory, directory)
    (directory / ".dingtalk-utils-isolation.json").write_text(json.dumps(marker), encoding="utf-8")
    with pytest.raises(ValueError):
        keychain.initialize_isolation(directory, registry=registry)


def test_remove_isolation_deletes_only_that_path(tmp_path):
    one = tmp_path / "one"
    two = tmp_path / "two"
    one.mkdir()
    two.mkdir()
    registry = FakeRegistry()

    keychain.initialize_isolation(one, registry=registry)
    keychain.initialize_isolation(two, registry=registry)
    keychain.remove_isolation(one, registry=registry)

    assert registry.value_names(keychain.registry_path(one)) == []
    # The other environment's marker must survive; its namespace was never created.
    assert keychain.read_marker(two) is not None
    assert keychain.read_marker(one) is not None


def test_write_isolated_value_rejects_foreign_path():
    with pytest.raises(ValueError):
        keychain.write_isolated_value("Software\\DwsCli\\keychain\\dws-cli", "x", "y", registry=FakeRegistry())
    with pytest.raises(ValueError):
        keychain.write_isolated_value("Software\\Other", "x", "y", registry=FakeRegistry())
