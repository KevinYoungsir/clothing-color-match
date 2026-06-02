import json
from io import BytesIO
from os import getenv
from typing import Any, Dict, Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from segmenters import SegmentInput, get_segmenter


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

    roi_data = parse_json_field(roi)
    prompt_box_data = parse_json_field(promptBox)
    prompt_points_data = parse_json_field(promptPoints)
    segmenter = get_segmenter(getenv("AI_SEGMENTER", "mock"))
    segment_input = SegmentInput(
        image=source_image,
        prompt_box=prompt_box_data,
        prompt_points=prompt_points_data if isinstance(prompt_points_data, list) else None,
        roi=roi_data,
    )
    result = segmenter.segment(segment_input)

    return result.to_response()
