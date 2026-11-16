import json

import pytest

from qwen_env import login


def test_public_device_url_keeps_only_whitelisted_parameters():
    url = (
        "https://login.dingtalk.com/oauth2/device/verify.htm"
        "?caller=dws&user_code=ABCD-1234&lang=zh-CN&org_type=all_with_personal&evil=1"
    )
    assert login.public_device_url(url) == (
        "https://login.dingtalk.com/oauth2/device/verify.htm"
        "?caller=dws&user_code=ABCD-1234&lang=zh-CN&org_type=all_with_personal"
    )


@pytest.mark.parametrize(
    "value",
    [
        "http://login.dingtalk.com/oauth2/device/verify.htm?caller=dws",
        "https://login.dingtalk.com/other.htm?caller=dws",
        "https://evil.example.com/oauth2/device/verify.htm?caller=dws",
        "https://login.dingtalk.com:8443/oauth2/device/verify.htm?caller=dws",
        "x" * 20000,
        None,
    ],
)
def test_public_device_url_rejects_hostile_values(value):
    assert login.public_device_url(value) is None


def test_parser_collects_user_code_from_plain_text():
    events = []
    parser = login.LoginParser(events.append)

    parser.feed("stdout", "user_code: ABCD-1234\n")

    assert events == [{"userCode": "ABCD-1234"}]


def test_parser_collects_json_identity_and_success():
    events = []
    parser = login.LoginParser(events.append)
    payload = {
        "success": True,
        "data": {
            "userCode": "WXYZ-99",
            "verificationUri": "https://login.dingtalk.com/oauth2/device/verify.htm?user_code=WXYZ-99",
            "expiresIn": 600,
            "corp_id": "dingabc",
            "user_name": "张三",
        },
    }
    parser.feed("stdout", json.dumps(payload) + "\n")
    outcome = parser.finish(0)

    assert outcome["success"] is True
    assert outcome["corp_id"] == "dingabc"
    assert outcome["user_name"] == "张三"
    assert events[0]["userCode"] == "WXYZ-99"
    assert events[0]["expiresIn"] == 600
    assert events[-1] == {"state": "completed"}


def test_parser_reports_explicit_failure():
    events = []
    parser = login.LoginParser(events.append)

    parser.feed("stdout", json.dumps({"success": False, "error": "access_denied"}) + "\n")
    outcome = parser.finish(0)

    assert outcome == {"success": False, "errorCode": "access_denied"}
    assert {"state": "failed"} in events


def test_parser_requires_success_and_exit_zero():
    parser = login.LoginParser(lambda event: None)
    parser.feed("stdout", json.dumps({"data": {"corp_id": "dingabc"}}) + "\n")

    assert parser.finish(1) == {"success": False, "errorCode": "login_failed"}


def test_device_login_rejects_invalid_profile():
    context = {"corePath": "dws.exe", "env": {}, "tempDirectory": "."}

    outcome = login.device_login(context, profile=" -bad")

    assert outcome == {"success": False, "errorCode": "invalid_profile"}


def test_device_login_streams_events_and_returns_identity():
    context = {"corePath": "dws.exe", "env": {}, "tempDirectory": "."}
    events = []

    def runner(argv, **kwargs):
        kwargs["on_output"]("stdout", json.dumps({"success": True, "data": {"corp_id": "dingabc"}}) + "\n")
        return login.process.ProcessResult("ok", 0, "", "", 5)

    outcome = login.device_login(context, emit=events.append, runner=runner)

    assert outcome == {"success": True, "corp_id": "dingabc"}
    assert events[0] == {"state": "started"}
    assert events[-1] == {"state": "completed"}

def test_public_device_url_drops_untrusted_parameters():
    url = "https://login.dingtalk.com/oauth2/device/verify.htm?user_code=bad%20code&caller=evil"

    assert login.public_device_url(url) == "https://login.dingtalk.com/oauth2/device/verify.htm"