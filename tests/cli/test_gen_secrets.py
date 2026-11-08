import base64
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "gen_secrets.py"
STORED = re.compile(r"^sha256\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$")


def generate(tmp_path, passcode="test-passcode"):
    out = tmp_path / "secrets.txt"
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--passcode", passcode, "--out", str(out)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert result.returncode == 0, result.stdout + result.stderr
    pairs = {}
    for line in out.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        key, _, value = line.partition("=")
        assert key not in pairs, f"duplicate key {key}"
        pairs[key] = value
    return pairs


def test_generates_required_keys(tmp_path):
    pairs = generate(tmp_path)
    assert set(pairs) == {"PASSCODE_HASH", "SESSION_SECRET", "API_TOKEN", "API_TOKEN_HASH"}
    assert "PASSCODE_SALT" not in pairs
    assert "PUBLIC_ORIGIN" not in pairs


def test_formats_and_passcode_hash(tmp_path):
    pairs = generate(tmp_path, passcode="test-passcode")

    assert re.fullmatch(r"[0-9a-f]{64}", pairs["SESSION_SECRET"])
    assert re.fullmatch(r"[A-Za-z0-9_-]{40,}", pairs["API_TOKEN"])

    for key, secret in (
        ("PASSCODE_HASH", "test-passcode"),
        ("API_TOKEN_HASH", pairs["API_TOKEN"]),
    ):
        match = STORED.fullmatch(pairs[key])
        assert match, f"{key} has unexpected shape"
        salt = base64.b64decode(match.group(1))
        digest = base64.b64decode(match.group(2))
        assert digest == hashlib.sha256(salt + secret.encode("utf-8")).digest(), key
