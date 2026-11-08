#!/usr/bin/env python3
"""Generate the preview/production secret file in the worker's stored format."""
import argparse
import base64
import hashlib
import secrets
from pathlib import Path


def stored(secret: str, salt: bytes) -> str:
    digest = hashlib.sha256(salt + secret.encode("utf-8")).digest()
    return f"sha256${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--passcode", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    salt = secrets.token_bytes(16)
    token = secrets.token_urlsafe(32)
    lines = [
        f"PASSCODE_HASH={stored(args.passcode, salt)}",
        f"SESSION_SECRET={secrets.token_hex(32)}",
        f"API_TOKEN={token}",
        f"API_TOKEN_HASH={stored(token, secrets.token_bytes(16))}",
    ]
    Path(args.out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
