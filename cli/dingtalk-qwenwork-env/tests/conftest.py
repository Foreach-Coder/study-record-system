import sys
from pathlib import Path

# Make "qwen_env" importable when pytest runs from the repository root.
PACKAGE_ROOT = Path(__file__).resolve().parents[1]
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))
