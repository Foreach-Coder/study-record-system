import json
import sys

HELP = """dingtalk-qwenwork-env - DWS 多身份隔离（PS1 总入口 + Python 核心）

  .\\dingtalk-qwenwork-env.ps1 list
  .\\dingtalk-qwenwork-env.ps1 add ENV_NAME [--profile CORP_OR_PROFILE] [--remark TEXT]
  .\\dingtalk-qwenwork-env.ps1 update ENV_NAME (--remark TEXT | --clear-remark)
  .\\dingtalk-qwenwork-env.ps1 active ENV_NAME
  .\\dingtalk-qwenwork-env.ps1 active --default
  .\\dingtalk-qwenwork-env.ps1 remove ENV_NAME
  .\\dingtalk-qwenwork-env.ps1 --help

状态目录固定为 %USERPROFILE%\\.dingtalk-utils\\{envName}，不要移动。
临时文件全部位于项目目录 .temp/dingtalk-qwenwork-env/ 下。
"""


def _utf8_streams() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", newline="\n")
        except (AttributeError, ValueError):
            pass


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def fail(code: str, message: str) -> int:
    emit({"success": False, "errorCode": code, "error": message})
    sys.stderr.write("错误：" + message + "\n")
    sys.stderr.flush()
    return 1


def main(argv: list[str]) -> int:
    _utf8_streams()
    action = argv[0] if argv else "--help"
    if action in ("--help", "-h"):
        sys.stdout.write(HELP)
        return 0
    return fail("unknown_action", f"未知命令：{action}")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))