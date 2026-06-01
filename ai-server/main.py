import base64
import json
from io import BytesIO
from typing import Any, Dict, Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw


app = FastAPI(title="Clothing Color Match AI Segmentation Mock")

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


def normalize_roi(value: Any, image_width: int, image_height: int) -> Optional[Dict[str, int]]:
    if not isinstance(value, dict):
        return None

    try:
        x = int(float(value.get("x", 0)))
        y = int(float(value.get("y", 0)))
        width = int(float(value.get("width", 0)))
        height = int(float(value.get("height", 0)))
    except (TypeError, ValueError):
        return None

    left = max(0, min(image_width - 1, x))
    top = max(0, min(image_height - 1, y))
    right = max(left + 1, min(image_width, x + width))
    bottom = max(top + 1, min(image_height, y + height))

    if right <= left or bottom <= top:
        return None

    return {
        "height": bottom - top,
        "width": right - left,
        "x": left,
        "y": top,
    }


def encode_mask_png(mask: Image.Image) -> str:
    buffer = BytesIO()
    mask.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


@app.post("/segment-garment")
async def segment_garment(
    image: UploadFile = File(...),
    roi: Optional[str] = Form(default=None),
    promptBox: Optional[str] = Form(default=None),
    promptPoints: Optional[str] = Form(default=None),
) -> Dict[str, object]:
    image_bytes = await image.read()

    try:
        source_image = Image.open(BytesIO(image_bytes))
        source_image.load()
    except Exception:
        return {
            "message": "无法读取图片",
            "success": False,
        }

    image_width, image_height = source_image.size
    roi_data = parse_json_field(roi)
    prompt_box_data = parse_json_field(promptBox)
    parse_json_field(promptPoints)
    normalized_roi = normalize_roi(roi_data or prompt_box_data, image_width, image_height)

    if not normalized_roi:
        return {
            "message": "需要 roi 或真实 AI 模型",
            "success": False,
        }

    mask = Image.new("L", (image_width, image_height), 0)
    draw = ImageDraw.Draw(mask)
    left = normalized_roi["x"]
    top = normalized_roi["y"]
    right = left + normalized_roi["width"] - 1
    bottom = top + normalized_roi["height"] - 1
    draw.rectangle([left, top, right, bottom], fill=255)

    return {
        "confidence": 0.5,
        "mask": encode_mask_png(mask),
        "message": "mock mask",
        "success": True,
    }
