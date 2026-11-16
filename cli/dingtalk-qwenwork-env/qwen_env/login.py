"""Device-code login for DWS.

Mirrors the old ``Invoke-DuDeviceLogin``: run ``dws auth login --device
--no-browser --format json``, follow its output, and only trust a verification
URL that points at DingTalk's own device page. Events are streamed to the
caller so a human can see the user code while the process waits.
"""

from __future__ import annotations

import json
import re
from urllib.parse import unquote, urlencode, urlparse

from . import process

ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
URL_IN_TEXT = re.compile(r"""https://[^\s<>"']+""")
USER_CODE = re.compile(r"^[A-Z0-9]{4,12}(?:-[A-Z0-9]{2,12})?$")
USER_CODE_LINE = re.compile(
    r"^(?:user[_ -]?code|用户码|验证码|用户代码)\s*[:：=]\s*([A-Z0-9-]+)\s*$", re.IGNORECASE
)
KEEP_PARAMS = {"caller", "user_code", "userCode", "lang", "locale", "org_type"}
LANG = re.compile(r"^[a-z]{2}(?:[-_][A-Z]{2})?$")
ORG_TYPE = {"all_with_personal", "personal", "enterprise"}
STATES = {
    "pending",
    "waiting",
    "authorized",
    "authenticated",
    "success",
    "completed",
    "failed",
    "denied",
    "expired",
    "cancelled",
    "canceled",
}
ERROR_CODES = {
    "authorization_pending",
    "slow_down",
    "access_denied",
    "expired_token",
    "invalid_request",
    "invalid_client",
    "unauthorized_client",
    "unsupported_grant_type",
    "invalid_grant",
}
IDENTITY_KEYS = ("corp_id", "corp_name", "user_id", "user_name")
FORBIDDEN_IN_IDENTITY = re.compile(r"[\x00-\x1f\x7f]|token|secret|bearer|https?://", re.IGNORECASE)
DEVICE_PATH = "/oauth2/device/verify.htm"
DEVICE_HOST = "login.dingtalk.com"


def public_device_url(value: object) -> str | None:
    """Return a sanitised device-verification URL, or None when it is not trusted."""
    if not isinstance(value, str) or len(value) > 16384:
        return None
    try:
        parsed = urlparse(value.rstrip(".,;)"))
    except ValueError:
        return None
    if (
        parsed.scheme != "https"
        or parsed.hostname != DEVICE_HOST
        or (parsed.port or 443) != 443
        or parsed.username
        or parsed.password
        or parsed.path != DEVICE_PATH
    ):
        return None

    kept: list[tuple[str, str]] = []
    for pair in parsed.query.split("&"):
        if not pair:
            continue
        key, _, raw = pair.partition("=")
        key = unquote(key.replace("+", " "))
        item = unquote(raw.replace("+", " "))
        keep = (
            (key == "caller" and item == "dws")
            or (key in {"user_code", "userCode"} and bool(USER_CODE.match(item)))
            or (key in {"lang", "locale"} and bool(LANG.match(item)))
            or (key == "org_type" and item in ORG_TYPE)
        )
        if keep:
            kept.append((key, item))
    url = f"https://{DEVICE_HOST}{DEVICE_PATH}"
    if kept:
        url += "?" + urlencode(kept)
    return url


def _accept_int(value: object, *, low: int, high: int) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and not value.is_integer():
        return None
    number = int(value)
    return number if low <= number <= high else None


class LoginParser:
    """Incrementally read DWS login output and emit deduplicated events."""

    def __init__(self, emit):
        self.emit = emit
        self._pending = {"stdout": "", "stderr": ""}
        self._json = {"stdout": "", "stderr": ""}
        self._seen: set[str] = set()
        self.success = False
        self.explicit_failure = False
        self.error_code: str | None = None
        self.identity: dict[str, str] = {}

    def _send(self, event: dict) -> None:
        if not event:
            return
        key = json.dumps(event, ensure_ascii=False, sort_keys=True)
        if key in self._seen:
            return
        self._seen.add(key)
        self.emit(event)

    def feed(self, stream: str, chunk: str) -> None:
        pending = self._pending[stream] + chunk
        while True:
            index = pending.find("\n")
            if index < 0:
                break
            line, pending = pending[:index], pending[index + 1 :]
            self._line(stream, line)
        self._pending[stream] = pending

    def finish(self, exit_code: int | None) -> dict:
        for stream, pending in self._pending.items():
            if pending:
                self._line(stream, pending)
                self._pending[stream] = ""
        ok = exit_code == 0 and self.success and not self.explicit_failure
        self._send({"state": "completed" if ok else "failed"})
        if ok:
            return {"success": True, **self.identity}
        return {"success": False, "errorCode": self.error_code or "login_failed"}

    def _line(self, stream: str, raw: str) -> None:
        text = ANSI.sub("", raw).strip()
        if not text:
            return
        if self._json[stream] or text.startswith("{"):
            self._json[stream] += text + "\n"
            try:
                parsed = json.loads(self._json[stream])
            except json.JSONDecodeError:
                return
            self._json[stream] = ""
            self._object(parsed, depth=0)
            return
        for match in URL_IN_TEXT.finditer(text):
            url = public_device_url(match.group(0))
            if url:
                self._send({"verificationUri": url})
        match = USER_CODE_LINE.match(text)
        if match and USER_CODE.match(match.group(1)):
            self._send({"userCode": match.group(1)})

    def _object(self, value: object, *, depth: int) -> None:
        if depth > 8 or not isinstance(value, dict):
            return
        if depth == 0 and isinstance(value.get("success"), bool):
            if value["success"]:
                self.success = True
            else:
                self.explicit_failure = True
        event: dict = {}
        for key, item in value.items():
            if key in {"userCode", "user_code"} and isinstance(item, str) and USER_CODE.match(item):
                event["userCode"] = item
            if key in {
                "verificationUri",
                "verification_uri",
                "verification_url",
                "verification_uri_complete",
                "verification_url_complete",
            }:
                url = public_device_url(item)
                if url:
                    event["verificationUri"] = url
            if key in {"expiresIn", "expires_in"}:
                number = _accept_int(item, low=1, high=86400)
                if number is not None:
                    event["expiresIn"] = number
            if key in {"state", "status"} and isinstance(item, str) and item in STATES:
                event["state"] = item
            if key in {"error", "errorCode", "error_code", "code"} and isinstance(item, str) and item in ERROR_CODES:
                self.error_code = item
                event["errorCode"] = item
            if key in IDENTITY_KEYS and isinstance(item, str) and 0 < len(item) <= 128 and not FORBIDDEN_IN_IDENTITY.search(item):
                self.identity[key] = item
        self._send(event)
        for key in ("data", "result", "error", "details"):
            self._object(value.get(key), depth=depth + 1)


def device_login(context: dict, *, profile: str | None = None, emit=None, runner=None, timeout_s: float = 900.0) -> dict:
    """Run the device login and return ``{success, ...identity}``."""
    if profile is not None:
        if not profile or len(profile) > 256 or re.search(r"[\x00-\x20\x7f]", profile) or profile.startswith("-"):
            return {"success": False, "errorCode": "invalid_profile"}

    events = emit or (lambda event: None)
    parser = LoginParser(events)
    argv = [context["corePath"], "auth", "login", "--device", "--no-browser", "--format", "json"]
    if profile is not None:
        argv += ["--profile", profile]
    parser._send({"state": "started"})

    run = runner or process.run
    try:
        result = run(
            argv,
            env=context.get("env"),
            cwd=context.get("tempDirectory"),
            timeout_s=timeout_s,
            stdout_limit=512 * 1024,
            stderr_limit=512 * 1024,
            on_output=parser.feed,
        )
    except Exception:
        parser._send({"state": "failed", "errorCode": "login_process_failed"})
        return {"success": False, "errorCode": "login_process_failed"}

    if result.status != "ok":
        parser._send({"state": "failed", "errorCode": "login_process_failed"})
        return {"success": False, "errorCode": "login_process_failed"}
    return parser.finish(result.exit_code)
