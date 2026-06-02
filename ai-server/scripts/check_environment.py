import importlib.util
from os import getenv
import platform
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List


RECOMMENDED_PYTHON_MINORS = {11, 12}


@dataclass(frozen=True)
class PackageCheck:
    import_name: str
    label: str
    required_for_mock: bool


PACKAGE_CHECKS = [
    PackageCheck("fastapi", "fastapi", True),
    PackageCheck("uvicorn", "uvicorn", True),
    PackageCheck("multipart", "python-multipart", True),
    PackageCheck("PIL", "pillow", True),
    PackageCheck("numpy", "numpy", False),
    PackageCheck("onnxruntime", "onnxruntime", False),
    PackageCheck("cv2", "opencv-python-headless", False),
]


def is_recommended_python() -> bool:
    return sys.version_info.major == 3 and sys.version_info.minor in RECOMMENDED_PYTHON_MINORS


def package_available(import_name: str) -> bool:
    return importlib.util.find_spec(import_name) is not None


def format_status(ok: bool) -> str:
    return "OK" if ok else "MISSING"


def print_python_check() -> None:
    print("Python environment")
    print(f"- Executable: {sys.executable}")
    print(f"- Version: {platform.python_version()}")

    if is_recommended_python():
        print("- Recommendation: OK, Python 3.11 / 3.12 is preferred for ONNX runtime work.")
    else:
        print("- Recommendation: WARN, use Python 3.11 or 3.12 for real ONNX inference.")


def print_package_checks(checks: Iterable[PackageCheck]) -> List[str]:
    missing_required: List[str] = []
    print("\nPython packages")

    for check in checks:
        ok = package_available(check.import_name)
        scope = "required for mock server" if check.required_for_mock else "optional for lightweight inference"
        print(f"- {check.label}: {format_status(ok)} ({scope})")

        if check.required_for_mock and not ok:
            missing_required.append(check.label)

    return missing_required


def print_lightweight_model_check() -> None:
    model_path = getenv("AI_LIGHTWEIGHT_MODEL_PATH")

    print("\nLightweight model")

    if not model_path:
        print("- AI_LIGHTWEIGHT_MODEL_PATH: NOT SET (only needed for real ONNX inference)")
        return

    resolved_model_path = Path(model_path).expanduser()
    status = "OK" if resolved_model_path.exists() else "MISSING"

    print(f"- AI_LIGHTWEIGHT_MODEL_PATH: {resolved_model_path} ({status})")


def main() -> int:
    print_python_check()
    missing_required = print_package_checks(PACKAGE_CHECKS)
    print_lightweight_model_check()

    print("\nNotes")
    print("- requirements.txt keeps the mock FastAPI server dependency set small.")
    print("- requirements-lightweight.txt is optional and reserved for future ONNX inference.")
    print("- Missing lightweight packages are informational only for the current placeholder.")

    if missing_required:
        print("\nAction needed")
        print("- Install mock server dependencies with: pip install -r requirements.txt")
    else:
        print("\nEnvironment check completed.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
