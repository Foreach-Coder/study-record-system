"""Behaviour of qwen_env.process.run — the Python replacement for DingtalkUtils.ProcessSession."""

import os
import sys
import time

from qwen_env.process import run

PY = sys.executable


def _python(code: str) -> list[str]:
    return [PY, "-c", code]


def test_reports_stdout_stderr_and_exit_code():
    result = run(_python("import sys;print('out');print('err',file=sys.stderr);sys.exit(3)"))

    assert result.status == "ok"
    assert result.exit_code == 3
    assert result.stdout == "out\n"
    assert result.stderr == "err\n"
    assert result.duration_ms >= 0


def test_environment_is_replaced_not_merged():
    base = {"PATH": os.environ.get("PATH", "")}

    missing = run(_python("import os;print(os.environ.get('QWEN_PROBE',''))"), env=base)
    assert missing.stdout.strip() == ""

    provided = run(
        _python("import os;print(os.environ['QWEN_PROBE'])"),
        env={**base, "QWEN_PROBE": "yes"},
    )
    assert provided.stdout.strip() == "yes"


def test_timeout_kills_the_whole_process_tree(tmp_path):
    marker = tmp_path / "late.txt"
    child = (
        "import pathlib,time;"
        "time.sleep(3);"
        f"pathlib.Path(r'{marker}').write_text('x')"
    )
    parent = (
        "import subprocess,sys,time;"
        f"subprocess.Popen([sys.executable,'-c',{child!r}]);"
        "time.sleep(30)"
    )

    result = run(_python(parent), timeout_s=0.8)

    assert result.status == "timeout"
    assert result.exit_code is None
    time.sleep(4.0)
    assert not marker.exists(), "child process survived the timeout kill"


def test_stdout_limit_marks_too_large_and_truncates():
    result = run(_python("print('x' * 200000)"), stdout_limit=1024)

    assert result.status == "too_large"
    assert len(result.stdout) <= 1024


def test_on_output_receives_chunks_while_running():
    seen: list[tuple[str, str]] = []

    result = run(
        _python("print('a');print('b')"),
        on_output=lambda stream, text: seen.append((stream, text)),
    )

    assert result.status == "ok"
    stdout_text = "".join(text for stream, text in seen if stream == "stdout")
    # Streaming chunks are raw (CRLF preserved); only the captured text is normalised.
    assert stdout_text.replace("\r\n", "\n").strip() == "a\nb"
    assert {stream for stream, _ in seen} == {"stdout"}


def test_spawn_error_is_reported_not_raised():
    result = run([os.path.join(os.environ.get("TEMP", "."), "definitely-not-here.exe")])

    assert result.status == "spawn_error"
    assert result.exit_code is None
    assert "definitely-not-here" in result.stderr
