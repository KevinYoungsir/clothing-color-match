import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

from PIL import Image


AI_SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(AI_SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_SERVER_ROOT))

from multimodal.providers.runninghub_provider import (
    RunningHubMultimodalProvider,
    load_runninghub_config,
)
from multimodal.schemas import GarmentAnalysisInput


SUPPORTED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("value must be greater than zero")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a privacy-safe RunningHub VLM multi-sample regression."
    )
    parser.add_argument("--image-dir", required=True, type=Path, help="Local image directory")
    parser.add_argument("--output-json", required=True, type=Path, help="Sanitized JSON output")
    parser.add_argument("--max-images", type=positive_int, default=10, help="Maximum images")
    parser.add_argument(
        "--live",
        action="store_true",
        help="Explicitly enable real provider calls; omitted means dry-run scan only",
    )
    return parser.parse_args()


def list_images(image_dir: Path, max_images: int) -> List[Path]:
    if not image_dir.is_dir():
        raise ValueError("image directory does not exist")
    images = sorted(
        path
        for path in image_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES
    )
    return images[:max_images]


def sanitized_configuration() -> Dict[str, object]:
    config = load_runninghub_config()
    return {
        "apiKey": "configured" if config.api_key else "missing",
        "realCallEnabled": config.enable_real_call,
        "modelType": config.model_type,
        "baseUrlHost": urlparse(config.llm_base_url).hostname,
        "model": config.llm_model,
    }


def live_configuration_ready(configuration: Dict[str, object]) -> bool:
    return (
        configuration["apiKey"] == "configured"
        and configuration["realCallEnabled"] is True
        and configuration["modelType"] == "llm_vlm"
    )


def roi_inside_image(roi: Any, image_size: Tuple[int, int]) -> Optional[bool]:
    if roi is None:
        return None
    if not isinstance(roi, dict):
        return False
    values = [roi.get(key) for key in ("x", "y", "width", "height")]
    if not all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in values):
        return False
    x, y, width, height = values
    image_width, image_height = image_size
    return bool(
        x >= 0
        and y >= 0
        and width > 0
        and height > 0
        and x + width <= image_width
        and y + height <= image_height
    )


def dry_run_image(path: Path, file_index: int) -> Dict[str, object]:
    with Image.open(path) as source_image:
        width, height = source_image.size
    return {
        "fileIndex": file_index,
        "imageSize": {"width": width, "height": height},
        "notes": "dry run only; no provider request sent",
    }


def analyze_image(
    provider: RunningHubMultimodalProvider,
    path: Path,
    file_index: int,
) -> Dict[str, object]:
    try:
        with Image.open(path) as source_image:
            image = source_image.convert("RGB")
        image_size = image.size
        result = provider.analyze(
            GarmentAnalysisInput(
                image=image,
                file_name=f"regression-image-{file_index:03d}",
                role="target",
                roi=None,
            )
        )
        response = result.to_response()
        roi_valid = roi_inside_image(response["suggestedRoi"], image_size)
        confidence = response["confidence"]
        confidence_valid = (
            isinstance(confidence, (int, float))
            and not isinstance(confidence, bool)
            and 0 <= confidence <= 1
        )
        direct_apply_safe = response["shouldApplyDirectlyToColorTransfer"] is False
        notes: List[str] = []
        if roi_valid is False:
            notes.append("suggested ROI is outside image bounds")
        if not confidence_valid:
            notes.append("confidence is outside 0-1")
        if not direct_apply_safe:
            notes.append("HIGH RISK: direct color-transfer flag is not false")
        if response["success"] is not True:
            notes.append("provider returned a safe failure")
        return {
            "fileIndex": file_index,
            "imageSize": {"width": image_size[0], "height": image_size[1]},
            "success": bool(
                response["success"] is True
                and roi_valid is not False
                and confidence_valid
                and direct_apply_safe
            ),
            "providerStatus": response["providerStatus"],
            "errorCode": response["errorCode"],
            "garmentCategory": response["garmentCategory"],
            "rawGarmentCategory": response["rawGarmentCategory"],
            "garmentDescription": response["garmentDescription"],
            "suggestedRoi": response["suggestedRoi"],
            "confidence": confidence,
            "riskTags": response["riskTags"],
            "rawRiskTags": response["rawRiskTags"],
            "recommendManualMask": response["recommendManualMask"],
            "shouldApplyDirectlyToColorTransfer": response[
                "shouldApplyDirectlyToColorTransfer"
            ],
            "roiInsideImage": roi_valid,
            "notes": "; ".join(notes) if notes else "validated",
        }
    except Exception as exc:
        return {
            "fileIndex": file_index,
            "imageSize": None,
            "success": False,
            "providerStatus": "local_validation_failed",
            "errorCode": "local_validation_exception",
            "garmentCategory": "unknown",
            "rawGarmentCategory": None,
            "garmentDescription": "",
            "suggestedRoi": None,
            "confidence": 0.0,
            "riskTags": [],
            "rawRiskTags": [],
            "recommendManualMask": True,
            "shouldApplyDirectlyToColorTransfer": False,
            "roiInsideImage": None,
            "notes": f"local validation error: {exc.__class__.__name__}",
        }


def build_summary(results: Sequence[Dict[str, object]]) -> Dict[str, object]:
    category_distribution: Counter[str] = Counter()
    risk_distribution: Counter[str] = Counter()
    for result in results:
        category = result.get("garmentCategory")
        if isinstance(category, str):
            category_distribution[category] += 1
        risk_tags = result.get("riskTags")
        if isinstance(risk_tags, list):
            risk_distribution.update(str(tag) for tag in risk_tags)

    total = len(results)
    success_count = sum(result.get("success") is True for result in results)
    return {
        "total": total,
        "successCount": success_count,
        "failedCount": total - success_count,
        "parseFailedCount": sum(
            result.get("providerStatus") == "invalid_response" for result in results
        ),
        "roiInvalidCount": sum(result.get("roiInsideImage") is False for result in results),
        "manualMaskRecommendedCount": sum(
            result.get("recommendManualMask") is True for result in results
        ),
        "categoryDistribution": dict(sorted(category_distribution.items())),
        "riskTagDistribution": dict(sorted(risk_distribution.items())),
        "allShouldApplyDirectlyToColorTransferFalse": all(
            result.get("shouldApplyDirectlyToColorTransfer") is False for result in results
        ),
    }


def write_output(path: Path, payload: Dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as output_file:
        json.dump(payload, output_file, ensure_ascii=False, indent=2)


def main() -> int:
    args = parse_args()
    try:
        images = list_images(args.image_dir, args.max_images)
    except ValueError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 2

    configuration = sanitized_configuration()
    if args.live and not live_configuration_ready(configuration):
        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "mode": "live",
            "configuration": configuration,
            "results": [],
            "summary": {"total": 0, "preflightFailed": True},
        }
        write_output(args.output_json, payload)
        print(json.dumps({"ok": False, "reason": "live configuration is not ready"}))
        return 2

    if args.live:
        provider = RunningHubMultimodalProvider()
        results = [
            analyze_image(provider, path, file_index)
            for file_index, path in enumerate(images, start=1)
        ]
        summary = build_summary(results)
    else:
        results = [
            dry_run_image(path, file_index)
            for file_index, path in enumerate(images, start=1)
        ]
        summary = {
            "total": len(results),
            "callsAttempted": 0,
            "note": "dry run only; add --live after configuring the backend environment",
        }

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "live" if args.live else "dry_run",
        "configuration": configuration,
        "results": results,
        "summary": summary,
    }
    write_output(args.output_json, payload)
    print(
        json.dumps(
            {
                "ok": True,
                "mode": payload["mode"],
                "processed": len(results),
                "outputWritten": True,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
