"""Run a child process with a clean environment, a timeout that kills the whole tree,
streaming callbacks, and hard caps on captured output.

This replaces ``DingtalkUtils.ProcessSession`` (lib/DuRuntime.cs) for the Python side.
"""

from __future__ import annotations

import os
import subprocess
import threading
import time
from dataclasses import dataclass
from typing import Callable, Mapping, Sequence

STDOUT_LIMIT = 64 * 1024 * 1024
STDERR_LIMIT = 64 * 1024
CHUNK_BYTES = 4096
_IS_WINDOWS = os.name == "nt"

OutputCallback = Callable[[str, str], None]


@dataclass(frozen=True)
class ProcessResult:
    """Outcome of one child process.

    ``status`` is ``ok``, ``timeout``, ``too_large`` or ``spawn_error``.
    ``exit_code`` is ``None`` whenever the child did not finish on its own.
    """

    status: str
    exit_code: int | None
    stdout: str
    stderr: str
    duration_ms: int


def _kill_tree(pid: int) -> None:
    if _IS_WINDOWS:
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return
    try:
        os.killpg(os.getpgid(pid), 9)
    except (OSError, ProcessLookupError):
        pass


class _Pump(threading.Thread):
    """Read one pipe to EOF, keep the first ``limit`` bytes, forward every chunk."""

    def __init__(self, stream, name: str, limit: int, on_output: OutputCallback | None):
        super().__init__(daemon=True)
        self.stream = stream
        self.name_ = name
        self.limit = limit
        self.on_output = on_output
        self.buffer = bytearray()
        self.overflowed = False

    def run(self) -> None:
        while True:
            try:
                chunk = self.stream.read(CHUNK_BYTES)
            except (OSError, ValueError):
                break
            if not chunk:
                break
            if not self.overflowed:
                room = self.limit - len(self.buffer)
                if len(chunk) > room:
                    self.buffer.extend(chunk[:room])
                    self.overflowed = True
                else:
                    self.buffer.extend(chunk)
            if self.on_output is not None:
                self.on_output(self.name_, chunk.decode("utf-8", errors="replace"))

    def text(self) -> str:
        # Windows children write CRLF; callers compare against "\n" text.
        return self.buffer.decode("utf-8", errors="replace").replace("\r\n", "\n")


def run(
    argv: Sequence[str],
    *,
    env: Mapping[str, str] | None = None,
    cwd: str | None = None,
    timeout_s: float = 60.0,
    stdout_limit: int = STDOUT_LIMIT,
    stderr_limit: int = STDERR_LIMIT,
    on_output: OutputCallback | None = None,
) -> ProcessResult:
    """Run ``argv`` and capture its output.

    ``env`` replaces the environment completely when given; pass an explicit
    mapping rather than relying on inheritance. ``on_output`` receives
    ``(stream, text)`` per raw chunk (CRLF preserved) with ``stream`` being
    ``"stdout"`` or ``"stderr"``; the captured ``stdout``/``stderr`` fields are
    normalised to ``\n``. A child that exceeds either limit, or that outlives
    ``timeout_s``, is killed together with its descendants.
    """

    started = time.monotonic()

    try:
        process = subprocess.Popen(
            list(argv),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=dict(env) if env is not None else None,
            cwd=cwd,
            shell=False,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if _IS_WINDOWS else 0,
            start_new_session=not _IS_WINDOWS,
        )
    except (OSError, ValueError) as error:
        return ProcessResult(
            status="spawn_error",
            exit_code=None,
            stdout="",
            stderr=f"{type(error).__name__}: {error} ({list(argv)[0]})",
            duration_ms=int((time.monotonic() - started) * 1000),
        )

    stdout_pump = _Pump(process.stdout, "stdout", stdout_limit, on_output)
    stderr_pump = _Pump(process.stderr, "stderr", stderr_limit, on_output)
    stdout_pump.start()
    stderr_pump.start()

    status = "ok"
    exit_code: int | None = None
    deadline = started + max(timeout_s, 0.0)

    while True:
        if stdout_pump.overflowed or stderr_pump.overflowed:
            status = "too_large"
            _kill_tree(process.pid)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
            break
        remaining = deadline - time.monotonic()
        try:
            exit_code = process.wait(timeout=max(min(remaining, 0.25), 0.01))
            break
        except subprocess.TimeoutExpired:
            if time.monotonic() >= deadline:
                status = "timeout"
                _kill_tree(process.pid)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    pass
                break

    stdout_pump.join(timeout=5)
    stderr_pump.join(timeout=5)

    if status == "ok" and (stdout_pump.overflowed or stderr_pump.overflowed):
        # The child finished before the main loop observed the overflow; the
        # capture is still truncated, so this is a failure, not a success.
        status = "too_large"

    return ProcessResult(
        status=status,
        exit_code=exit_code if status == "ok" else None,
        stdout=stdout_pump.text(),
        stderr=stderr_pump.text(),
        duration_ms=int((time.monotonic() - started) * 1000),
    )
