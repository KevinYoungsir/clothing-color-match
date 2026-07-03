import json
import re
from io import BytesIO
from os import getenv
from pathlib import Path
from time import perf_counter
from typing import Any, Dict, Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from multimodal import get_multimodal_provider
from multimodal.schemas import GarmentAnalysisInput, normalize_roi
from segmenters import SegmentInput, get_segmenter


app = FastAPI(title="Clothing Color Match AI Segmentation Mock")
AI_SERVER_ROOT = Path(__file__).resolve().parent

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, bool]:
    return {"ok": True}


def parse_json_field(value: Optional[str]) -> Any:
    if not value:
        return None

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def parse_int_field(value: Optional[str]) -> Optional[int]:
    if not value:
        return None

    try:
        return int(value)
    except ValueError:
        return None


def is_env_enabled(name: str, default_value: bool = True) -> bool:
    raw_value = getenv(name)

    if raw_value is None or raw_value.strip() == "":
        return default_value

    return raw_value.strip().lower() not in {"0", "false", "no", "off"}


def sanitize_debug_file_part(value: Optional[str], fallback: str = "unknown") -> str:
    if not value:
        return fallback

    sanitized = re.sub(r"[^A-Za-z0-9_.-]+", "-", value.strip()).strip("-")

    return sanitized or fallback


def save_api_input_debug_image(
    image: Image.Image,
    upload: UploadFile,
    debug_role: Optional[str],
    sample_id: Optional[str],
    image_width: Optional[int],
    image_height: Optional[int],
    roi: Optional[Dict[str, Any]] = None,
    prompt_box: Optional[Dict[str, Any]] = None,
) -> None:
    if not is_env_enabled("AI_DEBUG_SAVE_MASKS", True):
        return

    try:
        role = "reference" if debug_role == "reference" else "target"
        sample_part = sanitize_debug_file_part(sample_id)
        file_stem = "api-input-reference" if role == "reference" else f"api-input-target-{sample_part}"
        debug_dir = AI_SERVER_ROOT / "debug"
        image_path = debug_dir / f"{file_stem}.png"
        json_path = debug_dir / f"{file_stem}.json"
        backend_width, backend_height = image.size
        payload = {
            "backendImageHeight": backend_height,
            "backendImageWidth": backend_width,
            "contentType": upload.content_type,
            "filename": upload.filename,
            "frontendImageHeight": image_height,
            "frontendImageWidth": image_width,
            "promptBox": prompt_box,
            "role": role,
            "roi": roi,
            "sampleId": sample_id,
        }

        debug_dir.mkdir(parents=True, exist_ok=True)
        image.convert("RGBA").save(image_path, format="PNG")

        with json_path.open("w", encoding="utf-8") as output_file:
            json.dump(payload, output_file, ensure_ascii=False, indent=2)

        print(
            f"[ai-server] debug save input role={role} sampleId={sample_id or '-'} path={image_path}",
            flush=True,
        )
    except Exception as exc:
        print(f"[ai-server] debug input save failed: {exc}", flush=True)


@app.post("/analyze-garment")
async def analyze_garment(
    image: UploadFile = File(...),
    role: str = Form(default="target"),
    roi: Optional[str] = Form(default=None),
    provider: str = Form(default="mock"),
) -> Dict[str, object]:
    normalized_role = role.strip().lower()
    if normalized_role not in {"source", "target"}:
        return {
            "success": False,
            "message": "role 必须是 source 或 target",
        }

    try:
        image_bytes = await image.read()
        source_image = Image.open(BytesIO(image_bytes))
        source_image.load()
        source_image = source_image.convert("RGB")
    except Exception:
        return {
            "success": False,
            "message": "无法读取图片",
        }

    try:
        parsed_roi = normalize_roi(
            parse_json_field(roi),
            source_image.size[0],
            source_image.size[1],
        )
        multimodal_provider = get_multimodal_provider(provider)
        result = multimodal_provider.analyze(
            GarmentAnalysisInput(
                image=source_image,
                file_name=image.filename or "uploaded-image",
                role=normalized_role,
                roi=parsed_roi,
            )
        )
    except ValueError as exc:
        return {
            "success": False,
            "message": str(exc),
        }
    except Exception as exc:
        print(f"[ai-server] multimodal analysis failed: {exc}", flush=True)
        return {
            "success": False,
            "message": "多模态识别建议生成失败",
        }

    return {
        "success": True,
        **result.to_response(),
        "message": "mock multimodal analysis completed",
    }


@app.post("/segment-garment")
async def segment_garment(
    image: UploadFile = File(...),
    roi: Optional[str] = Form(default=None),
    promptBox: Optional[str] = Form(default=None),
    promptPoints: Optional[str] = Form(default=None),
    debugRole: Optional[str] = Form(default=None),
    sampleId: Optional[str] = Form(default=None),
    imageWidth: Optional[str] = Form(default=None),
    imageHeight: Optional[str] = Form(default=None),
) -> Dict[str, object]:
    request_started_at = perf_counter()
    print(
        f"[ai-server] request start role={debugRole or '-'} sampleId={sampleId or '-'}",
        flush=True,
    )
    image_bytes = await image.read()

    try:
        decode_started_at = perf_counter()
        source_image = Image.open(BytesIO(image_bytes))
        source_image.load()
        decode_ms = (perf_counter() - decode_started_at) * 1000
        print(f"[ai-server] decode image ms={decode_ms:.2f}", flush=True)
    except Exception:
        print(
            f"[ai-server] total ms={(perf_counter() - request_started_at) * 1000:.2f}",
            flush=True,
        )
        return {
            "message": "无法读取图片",
            "success": False,
        }

    roi_data = parse_json_field(roi)
    prompt_box_data = parse_json_field(promptBox)
    prompt_points_data = parse_json_field(promptPoints)
    parsed_image_width = parse_int_field(imageWidth)
    parsed_image_height = parse_int_field(imageHeight)
    save_api_input_debug_image(
        source_image,
        image,
        debugRole,
        sampleId,
        parsed_image_width,
        parsed_image_height,
        roi_data if isinstance(roi_data, dict) else None,
        prompt_box_data if isinstance(prompt_box_data, dict) else None,
    )
    segmenter = get_segmenter(getenv("AI_SEGMENTER", "mock"))
    segment_input = SegmentInput(
        image=source_image,
        debug_role=debugRole,
        image_height=parsed_image_height,
        image_width=parsed_image_width,
        prompt_box=prompt_box_data,
        prompt_points=prompt_points_data if isinstance(prompt_points_data, list) else None,
        roi=roi_data,
        sample_id=sampleId,
    )
    print(
        "[ai-server] segment role="
        f"{debugRole or '-'} sampleId={sampleId or '-'} "
        f"imageWidth={parsed_image_width or source_image.size[0]} "
        f"imageHeight={parsed_image_height or source_image.size[1]} "
        f"roi={roi_data if isinstance(roi_data, dict) else None} "
        f"promptBox={prompt_box_data if isinstance(prompt_box_data, dict) else None}",
        flush=True,
    )
    result = segmenter.segment(segment_input)
    print(
        f"[ai-server] request total ms={(perf_counter() - request_started_at) * 1000:.2f}",
        flush=True,
    )

    return result.to_response()
