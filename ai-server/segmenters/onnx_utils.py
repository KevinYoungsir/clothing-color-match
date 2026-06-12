from dataclasses import dataclass
from os import getenv
from pathlib import Path
from threading import Lock
from time import perf_counter
from typing import Any, Tuple

from PIL import Image, ImageFilter


class MissingOnnxDependency(Exception):
    pass


class OnnxSegmentationError(Exception):
    pass


@dataclass(frozen=True)
class OnnxInputSpec:
    height: int
    layout: str
    name: str
    width: int


DEFAULT_INPUT_SIZE = 512
DEFAULT_CLOTHING_LABELS = (4, 5, 6, 7)
DEFAULT_MASK_THRESHOLD = 0.55
DEFAULT_MASK_GAMMA = 1.4
DEFAULT_MASK_BLUR = 4.0
DEFAULT_KEEP_COMPONENTS = 2
DEFAULT_MIN_COMPONENT_RATIO = 0.002
DEFAULT_BODY_FILTER_KEEP_COMPONENTS = 2
DEFAULT_TARGET_CANDIDATE_THRESHOLDS = (0.25, 0.35, 0.45, 0.55, 0.65, 0.75)
DEFAULT_TARGET_CANDIDATE_GAMMAS = (1.0,)
DEFAULT_TARGET_CANDIDATE_SCORING_EDGE = 96
MIN_SOFT_MASK_FOREGROUND_RATIO = 0.001
MIN_UNPROMPTED_FOREGROUND_RATIO = 0.08
LAST_MASK_DIAGNOSTICS: dict[str, Any] = {}
LAST_ONNX_TIMINGS: dict[str, Any] = {}
ONNX_SESSION_CACHE: dict[str, tuple[int, int, Any]] = {}
ONNX_SESSION_CACHE_LOCK = Lock()


def load_onnx_dependencies() -> Tuple[Any, Any]:
    missing = []

    try:
        import numpy as np
    except ImportError:
        np = None
        missing.append("numpy")

    try:
        import onnxruntime as ort
    except ImportError:
        ort = None
        missing.append("onnxruntime")

    if missing:
        raise MissingOnnxDependency(", ".join(missing))

    return np, ort


def create_onnx_session(model_path: Path, ort: Any) -> Any:
    global LAST_ONNX_TIMINGS

    resolved_path = model_path.expanduser().resolve()

    try:
        stat = resolved_path.stat()
        cache_key = str(resolved_path)
        load_started_at = perf_counter()

        with ONNX_SESSION_CACHE_LOCK:
            cached = ONNX_SESSION_CACHE.get(cache_key)

            if cached and cached[0] == stat.st_mtime_ns and cached[1] == stat.st_size:
                LAST_ONNX_TIMINGS = {
                    **LAST_ONNX_TIMINGS,
                    "sessionCacheHit": True,
                    "sessionLoadMs": (perf_counter() - load_started_at) * 1000,
                }
                return cached[2]

            session = ort.InferenceSession(
                str(resolved_path),
                providers=["CPUExecutionProvider"],
            )
            ONNX_SESSION_CACHE[cache_key] = (stat.st_mtime_ns, stat.st_size, session)
            LAST_ONNX_TIMINGS = {
                **LAST_ONNX_TIMINGS,
                "sessionCacheHit": False,
                "sessionLoadMs": (perf_counter() - load_started_at) * 1000,
            }

            return session
    except Exception as exc:
        raise OnnxSegmentationError(f"模型加载失败：{exc}") from exc


def _read_positive_int_env(name: str, default_value: int) -> int:
    raw_value = getenv(name)

    if raw_value is None or raw_value.strip() == "":
        return default_value

    try:
        parsed_value = int(raw_value)
    except ValueError as exc:
        raise OnnxSegmentationError(f"{name} 必须是正整数，当前值为 {raw_value!r}") from exc

    if parsed_value <= 0:
        raise OnnxSegmentationError(f"{name} 必须大于 0，当前值为 {parsed_value}")

    return parsed_value


def _read_float_env(name: str, default_value: float, min_value: float, max_value: float) -> float:
    raw_value = getenv(name)

    if raw_value is None or raw_value.strip() == "":
        return default_value

    try:
        parsed_value = float(raw_value)
    except ValueError as exc:
        raise OnnxSegmentationError(f"{name} 必须是数字，当前值为 {raw_value!r}") from exc

    if parsed_value < min_value or parsed_value > max_value:
        raise OnnxSegmentationError(
            f"{name} 必须在 {min_value} 到 {max_value} 之间，当前值为 {parsed_value}"
        )

    return parsed_value


def _read_int_env(name: str, default_value: int, min_value: int, max_value: int) -> int:
    raw_value = getenv(name)

    if raw_value is None or raw_value.strip() == "":
        return default_value

    try:
        parsed_value = int(raw_value)
    except ValueError as exc:
        raise OnnxSegmentationError(f"{name} 必须是整数，当前值为 {raw_value!r}") from exc

    if parsed_value < min_value or parsed_value > max_value:
        raise OnnxSegmentationError(
            f"{name} 必须在 {min_value} 到 {max_value} 之间，当前值为 {parsed_value}"
        )

    return parsed_value


def _read_float_list_env(name: str, default_values: Tuple[float, ...], min_value: float, max_value: float) -> Tuple[float, ...]:
    raw_value = getenv(name)

    if raw_value is None or raw_value.strip() == "":
        return default_values

    values = []
    for part in raw_value.split(","):
        stripped = part.strip()
        if not stripped:
            continue

        try:
            parsed_value = float(stripped)
        except ValueError as exc:
            raise OnnxSegmentationError(f"{name} 必须是逗号分隔数字，当前值为 {raw_value!r}") from exc

        if parsed_value < min_value or parsed_value > max_value:
            raise OnnxSegmentationError(
                f"{name} 的每个值必须在 {min_value} 到 {max_value} 之间，当前值为 {parsed_value}"
            )

        values.append(parsed_value)

    if not values:
        raise OnnxSegmentationError(f"{name} 不能为空")

    return tuple(sorted(set(values)))


def parse_clothing_labels_value(raw_value: str, default_labels: Tuple[int, ...] = DEFAULT_CLOTHING_LABELS) -> Tuple[int, ...]:
    if raw_value.strip() == "":
        return default_labels

    labels = []
    for part in raw_value.split(","):
        stripped = part.strip()
        if not stripped:
            continue

        try:
            labels.append(int(stripped))
        except ValueError as exc:
            raise OnnxSegmentationError(
                f"AI_LIGHTWEIGHT_CLOTHING_LABELS 必须是逗号分隔的整数，当前值为 {raw_value!r}"
            ) from exc

    if not labels:
        raise OnnxSegmentationError("AI_LIGHTWEIGHT_CLOTHING_LABELS 不能为空")

    return tuple(sorted(set(labels)))


def _read_clothing_labels() -> Tuple[int, ...]:
    return parse_clothing_labels_value(getenv("AI_LIGHTWEIGHT_CLOTHING_LABELS", ""))


def _dimension_to_int(value: Any, fallback: int | None = None) -> int:
    if isinstance(value, int) and value > 0:
        return value

    if isinstance(value, str) and value.isdigit():
        parsed_value = int(value)
        if parsed_value > 0:
            return parsed_value

    if fallback is not None:
        return fallback

    raise OnnxSegmentationError("模型输入尺寸必须是静态 4D 张量，当前无法自动推断")


def _looks_like_channels(value: Any) -> bool:
    if value in (1, 3, "1", "3"):
        return True

    if isinstance(value, str):
        return value.strip().lower() in {"c", "channel", "channels", "num_channels"}

    return False


def get_input_spec(session: Any) -> OnnxInputSpec:
    inputs = session.get_inputs()

    if not inputs:
        raise OnnxSegmentationError("模型没有可用输入")

    model_input = inputs[0]
    shape = list(model_input.shape)

    if len(shape) != 4:
        raise OnnxSegmentationError(f"暂只支持 4D 图像输入，当前输入形状为 {shape}")

    default_size = _read_positive_int_env("AI_LIGHTWEIGHT_INPUT_SIZE", DEFAULT_INPUT_SIZE)

    if _looks_like_channels(shape[1]):
        return OnnxInputSpec(
            height=_dimension_to_int(shape[2], default_size),
            layout="NCHW",
            name=model_input.name,
            width=_dimension_to_int(shape[3], default_size),
        )

    if _looks_like_channels(shape[3]):
        return OnnxInputSpec(
            height=_dimension_to_int(shape[1], default_size),
            layout="NHWC",
            name=model_input.name,
            width=_dimension_to_int(shape[2], default_size),
        )

    raise OnnxSegmentationError(f"无法识别输入通道位置，当前输入形状为 {shape}")


def preprocess_image(image: Image.Image, spec: OnnxInputSpec, np: Any) -> Any:
    resized = image.convert("RGB").resize((spec.width, spec.height), Image.Resampling.BILINEAR)
    tensor = np.asarray(resized, dtype=np.float32) / 255.0

    if spec.layout == "NCHW":
        tensor = np.transpose(tensor, (2, 0, 1))

    return np.expand_dims(tensor, axis=0).astype(np.float32)


def _sigmoid(array: Any, np: Any) -> Any:
    return 1.0 / (1.0 + np.exp(-array))


def _get_label_probability(class_logits: Any, labels: Tuple[int, ...], axis: int, np: Any) -> Any:
    stable_logits = class_logits.astype(np.float32)
    max_logits = np.max(stable_logits, axis=axis, keepdims=True)
    exp_logits = np.exp(stable_logits - max_logits)
    denominator = np.maximum(np.sum(exp_logits, axis=axis), 1e-12)

    if axis == 0:
        numerator = np.sum(exp_logits[list(labels), :, :], axis=0)
    else:
        numerator = np.sum(exp_logits[:, :, list(labels)], axis=2)

    return np.clip(numerator / denominator, 0.0, 1.0)


def _find_connected_components(binary_mask: Any, np: Any) -> list[dict[str, Any]]:
    height, width = binary_mask.shape
    visited = np.zeros(binary_mask.shape, dtype=bool)
    components: list[dict[str, Any]] = []

    for start_y in range(height):
        for start_x in range(width):
            if visited[start_y, start_x] or not binary_mask[start_y, start_x]:
                continue

            stack = [(start_x, start_y)]
            visited[start_y, start_x] = True
            pixels: list[tuple[int, int]] = []

            while stack:
                x, y = stack.pop()
                pixels.append((x, y))

                for next_x, next_y in (
                    (x - 1, y),
                    (x + 1, y),
                    (x, y - 1),
                    (x, y + 1),
                ):
                    if (
                        next_x < 0
                        or next_x >= width
                        or next_y < 0
                        or next_y >= height
                        or visited[next_y, next_x]
                        or not binary_mask[next_y, next_x]
                    ):
                        continue

                    visited[next_y, next_x] = True
                    stack.append((next_x, next_y))

            components.append({"pixels": pixels, "size": len(pixels)})

    components.sort(key=lambda component: component["size"], reverse=True)
    return components


def _keep_largest_components(alpha: Any, np: Any) -> tuple[Any, int, int]:
    keep_components = _read_int_env(
        "AI_LIGHTWEIGHT_KEEP_COMPONENTS",
        DEFAULT_KEEP_COMPONENTS,
        1,
        50,
    )
    min_component_ratio = _read_float_env(
        "AI_LIGHTWEIGHT_MIN_COMPONENT_RATIO",
        DEFAULT_MIN_COMPONENT_RATIO,
        0.0,
        1.0,
    )
    binary_mask = alpha > 0
    components = _find_connected_components(binary_mask, np)
    min_component_size = max(1, int(round(alpha.size * min_component_ratio)))
    filtered_alpha = np.zeros(alpha.shape, dtype=np.float32)
    kept_count = 0

    for component in components:
        if kept_count >= keep_components:
            break

        if component["size"] < min_component_size:
            continue

        for x, y in component["pixels"]:
            filtered_alpha[y, x] = alpha[y, x]

        kept_count += 1

    return filtered_alpha, len(components), kept_count


def _get_component_params() -> tuple[int, float]:
    keep_components = _read_int_env(
        "AI_LIGHTWEIGHT_KEEP_COMPONENTS",
        DEFAULT_KEEP_COMPONENTS,
        1,
        50,
    )
    min_component_ratio = _read_float_env(
        "AI_LIGHTWEIGHT_MIN_COMPONENT_RATIO",
        DEFAULT_MIN_COMPONENT_RATIO,
        0.0,
        1.0,
    )

    return keep_components, min_component_ratio


def _is_env_enabled(name: str, default_value: bool = True) -> bool:
    raw_value = getenv(name)

    if raw_value is None or raw_value.strip() == "":
        return default_value

    return raw_value.strip().lower() not in {"0", "false", "no", "off"}


def _component_geometry(component: dict[str, Any], width: int, height: int) -> dict[str, Any]:
    pixels = component["pixels"]
    xs = [pixel[0] for pixel in pixels]
    ys = [pixel[1] for pixel in pixels]
    min_x = min(xs)
    max_x = max(xs)
    min_y = min(ys)
    max_y = max(ys)
    bbox_width = max_x - min_x + 1
    bbox_height = max_y - min_y + 1
    center_y = sum(ys) / max(1, len(ys))
    center_x = sum(xs) / max(1, len(xs))
    area_ratio = len(pixels) / max(1, width * height)
    bbox_area_ratio = (bbox_width * bbox_height) / max(1, width * height)
    aspect_ratio = bbox_width / max(1, bbox_height)
    top_ratio = min_y / max(1, height)
    center_y_ratio = center_y / max(1, height)
    width_ratio = bbox_width / max(1, width)
    height_ratio = bbox_height / max(1, height)
    fill_ratio = len(pixels) / max(1, bbox_width * bbox_height)

    return {
        "areaRatio": area_ratio,
        "aspectRatio": aspect_ratio,
        "bbox": {
            "height": bbox_height,
            "width": bbox_width,
            "x": min_x,
            "y": min_y,
        },
        "bboxAreaRatio": bbox_area_ratio,
        "centerXRatio": center_x / max(1, width),
        "centerYRatio": center_y_ratio,
        "fillRatio": fill_ratio,
        "heightRatio": height_ratio,
        "size": len(pixels),
        "topRatio": top_ratio,
        "widthRatio": width_ratio,
    }


def _looks_like_top_artifact(geometry: dict[str, Any]) -> bool:
    is_high_in_image = geometry["centerYRatio"] < 0.34
    is_thin_horizontal = geometry["aspectRatio"] > 2.2 and geometry["heightRatio"] < 0.16
    is_small_upper_piece = (
        geometry["centerYRatio"] < 0.24
        and geometry["heightRatio"] < 0.22
        and geometry["areaRatio"] < 0.10
    )
    is_wide_top_bar = (
        geometry["topRatio"] < 0.18
        and geometry["widthRatio"] > 0.38
        and geometry["heightRatio"] < 0.14
    )

    return (is_high_in_image and is_thin_horizontal) or is_small_upper_piece or is_wide_top_bar


def _score_lower_garment_component(geometry: dict[str, Any]) -> float:
    height_score = min(1.0, geometry["heightRatio"] / 0.45)
    area_score = min(1.0, geometry["areaRatio"] / 0.12)
    lower_center_score = min(1.0, max(0.0, (geometry["centerYRatio"] - 0.18) / 0.42))
    aspect_penalty = 0.0

    if geometry["aspectRatio"] > 1.15:
        aspect_penalty += min(0.6, (geometry["aspectRatio"] - 1.15) * 0.22)

    if geometry["aspectRatio"] < 0.12:
        aspect_penalty += min(0.5, (0.12 - geometry["aspectRatio"]) * 2.5)

    top_penalty = 0.35 if _looks_like_top_artifact(geometry) else 0.0

    return height_score * 2.0 + area_score * 1.4 + lower_center_score - aspect_penalty - top_penalty


def _apply_lower_garment_body_filter(
    alpha: Any,
    np: Any,
    keep_components_override: int | None = None,
) -> tuple[Any, dict[str, Any]]:
    if not _is_env_enabled("AI_LIGHTWEIGHT_BODY_FILTER", True):
        return alpha, {
            "enabled": False,
            "keptComponentCount": None,
            "removedTopArtifactCount": None,
            "selectedComponents": [],
        }

    binary_mask = alpha > 0
    components = _find_connected_components(binary_mask, np)
    height, width = alpha.shape
    keep_components = (
        max(1, min(10, keep_components_override))
        if keep_components_override is not None
        else _read_int_env(
            "AI_LIGHTWEIGHT_BODY_KEEP_COMPONENTS",
            DEFAULT_BODY_FILTER_KEEP_COMPONENTS,
            1,
            10,
        )
    )
    ranked_components = []
    removed_top_artifacts = 0

    for component in components:
        geometry = _component_geometry(component, width, height)

        if _looks_like_top_artifact(geometry):
            removed_top_artifacts += 1
            continue

        ranked_components.append(
            {
                "component": component,
                "geometry": geometry,
                "score": _score_lower_garment_component(geometry),
            }
        )

    if not ranked_components:
        return alpha, {
            "enabled": True,
            "keptComponentCount": 0,
            "removedTopArtifactCount": removed_top_artifacts,
            "selectedComponents": [],
        }

    ranked_components.sort(key=lambda item: item["score"], reverse=True)
    filtered_alpha = np.zeros(alpha.shape, dtype=np.float32)
    selected_components = ranked_components[:keep_components]

    for item in selected_components:
        for x, y in item["component"]["pixels"]:
            filtered_alpha[y, x] = alpha[y, x]

    return filtered_alpha, {
        "enabled": True,
        "keptComponentCount": len(selected_components),
        "removedTopArtifactCount": removed_top_artifacts,
        "selectedComponents": [
            {
                "bbox": item["geometry"]["bbox"],
                "score": item["score"],
                "size": item["geometry"]["size"],
            }
            for item in selected_components
        ],
    }


def _alpha_array_summary(alpha: Any, np: Any, include_component_count: bool = True) -> dict[str, Any]:
    alpha_array = np.asarray(alpha, dtype=np.float32)

    if alpha_array.size == 0:
        return {
            "bbox": None,
            "componentCount": 0 if include_component_count else None,
            "foregroundRatio": 0.0,
            "maxAlpha": 0,
            "meanAlpha": 0.0,
            "minAlpha": 0,
            "touchesBorder": False,
        }

    if float(np.nanmax(alpha_array)) <= 1.0:
        alpha_255 = np.clip(alpha_array * 255.0, 0, 255)
    else:
        alpha_255 = np.clip(alpha_array, 0, 255)

    binary_mask = alpha_255 > 0
    foreground_pixels = int(np.count_nonzero(binary_mask))
    height, width = alpha_255.shape
    bbox = None
    touches_border = False

    if foreground_pixels > 0:
        ys, xs = np.nonzero(binary_mask)
        min_x = int(xs.min())
        max_x = int(xs.max())
        min_y = int(ys.min())
        max_y = int(ys.max())
        bbox = {
            "height": max_y - min_y + 1,
            "width": max_x - min_x + 1,
            "x": min_x,
            "y": min_y,
        }
        touches_border = min_x <= 0 or min_y <= 0 or max_x >= width - 1 or max_y >= height - 1

    component_count = None
    if include_component_count:
        component_count = len(_find_connected_components(binary_mask, np))

    return {
        "bbox": bbox,
        "componentCount": component_count,
        "foregroundRatio": foreground_pixels / max(1, alpha_255.size),
        "maxAlpha": int(np.nanmax(alpha_255)),
        "meanAlpha": float(np.nanmean(alpha_255)),
        "minAlpha": int(np.nanmin(alpha_255)),
        "touchesBorder": touches_border,
    }


def image_mask_summary(mask: Image.Image, np: Any, include_component_count: bool = True) -> dict[str, Any]:
    return _alpha_array_summary(
        np.asarray(mask.convert("L"), dtype=np.float32),
        np,
        include_component_count=include_component_count,
    )


def get_last_mask_diagnostics() -> dict[str, Any]:
    return dict(LAST_MASK_DIAGNOSTICS)


def get_last_onnx_timings() -> dict[str, Any]:
    return dict(LAST_ONNX_TIMINGS)


def build_soft_mask_stages(
    probability: Any,
    image_size: Tuple[int, int],
    np: Any,
    body_keep_components_override: int | None = None,
    blur_override: float | None = None,
    include_component_stats: bool = False,
    gamma_override: float | None = None,
    threshold_override: float | None = None,
) -> dict[str, Any]:
    threshold = (
        threshold_override
        if threshold_override is not None
        else _read_float_env(
            "AI_LIGHTWEIGHT_MASK_THRESHOLD",
            DEFAULT_MASK_THRESHOLD,
            0.0,
            0.99,
        )
    )
    gamma = (
        gamma_override
        if gamma_override is not None
        else _read_float_env("AI_LIGHTWEIGHT_MASK_GAMMA", DEFAULT_MASK_GAMMA, 0.1, 8.0)
    )
    blur_radius = (
        blur_override
        if blur_override is not None
        else _read_float_env("AI_LIGHTWEIGHT_MASK_BLUR", DEFAULT_MASK_BLUR, 0.0, 40.0)
    )
    raw_probability = np.asarray(probability, dtype=np.float32)
    probability_image = Image.fromarray(
        np.clip(raw_probability * 255.0, 0, 255).astype(np.uint8),
        mode="L",
    )

    model_probability = np.asarray(probability_image, dtype=np.float32) / 255.0
    max_probability = float(np.nanmax(model_probability)) if model_probability.size > 0 else 0.0

    remapped_probability = np.clip(
        (model_probability - threshold) / max(1e-6, 1.0 - threshold),
        0.0,
        1.0,
    )
    normalized_alpha = np.where(
        model_probability >= threshold,
        remapped_probability**gamma,
        0.0,
    )
    body_alpha, body_filter_diagnostics = _apply_lower_garment_body_filter(
        normalized_alpha,
        np,
        keep_components_override=body_keep_components_override,
    )
    alpha, connected_component_count, kept_component_count = _keep_largest_components(
        body_alpha,
        np,
    )
    soft_mask = Image.fromarray(np.clip(alpha * 255.0, 0, 255).astype(np.uint8), mode="L")

    if soft_mask.size != image_size:
        soft_mask = soft_mask.resize(image_size, Image.Resampling.BILINEAR)

    if blur_radius > 0:
        soft_mask = soft_mask.filter(ImageFilter.GaussianBlur(radius=blur_radius))

    final_alpha = np.asarray(soft_mask, dtype=np.uint8)

    return {
        "bodyFilterAlpha": body_alpha,
        "bodyFilterDiagnostics": body_filter_diagnostics,
        "bodyFilterSummary": _alpha_array_summary(body_alpha, np, include_component_stats),
        "blurRadius": blur_radius,
        "componentsAlpha": alpha,
        "componentsSummary": _alpha_array_summary(alpha, np, include_component_stats),
        "connectedComponentCount": connected_component_count,
        "finalAlpha": final_alpha,
        "finalMask": soft_mask,
        "finalSummary": _alpha_array_summary(final_alpha, np, include_component_stats),
        "gamma": gamma,
        "keepComponents": _get_component_params()[0],
        "keptComponentCount": kept_component_count,
        "maxProbability": max_probability,
        "rawProbability": raw_probability,
        "rawSummary": _alpha_array_summary(raw_probability, np, include_component_stats),
        "threshold": threshold,
        "thresholdAlpha": normalized_alpha,
        "thresholdSummary": _alpha_array_summary(normalized_alpha, np, include_component_stats),
    }


def _get_bbox_ratios(summary: dict[str, Any], image_size: Tuple[int, int]) -> dict[str, float]:
    bbox = summary.get("bbox")
    image_width, image_height = image_size

    if not bbox:
        return {
            "areaRatio": 0.0,
            "heightRatio": 0.0,
            "widthRatio": 0.0,
        }

    return {
        "areaRatio": (bbox["width"] * bbox["height"]) / max(1, image_width * image_height),
        "heightRatio": bbox["height"] / max(1, image_height),
        "widthRatio": bbox["width"] / max(1, image_width),
    }


def _score_target_closeup_candidate(stages: dict[str, Any], image_size: Tuple[int, int]) -> float:
    summary = stages["finalSummary"]
    bbox = summary.get("bbox")

    if not bbox:
        return -1_000.0

    ratios = _get_bbox_ratios(summary, image_size)
    foreground_ratio = float(summary["foregroundRatio"])
    component_count = summary.get("componentCount") or 0

    if foreground_ratio <= 0:
        return -1_000.0

    if (
        (summary.get("touchesBorder") and ratios["widthRatio"] >= 0.96)
        or ratios["areaRatio"] >= 0.85
        or (summary.get("touchesBorder") and foreground_ratio > 0.50)
    ):
        return -750.0 - foreground_ratio - ratios["areaRatio"]

    if foreground_ratio > 0.70 or ratios["areaRatio"] > 0.92:
        return -500.0 - foreground_ratio

    if ratios["widthRatio"] < 0.10 or ratios["heightRatio"] < 0.16:
        return -100.0 + foreground_ratio

    score = (
        foreground_ratio * 4.0
        + min(0.75, ratios["areaRatio"]) * 3.2
        + min(0.85, ratios["widthRatio"]) * 0.9
        + min(0.90, ratios["heightRatio"]) * 0.9
        + float(summary["meanAlpha"]) / 255.0 * 0.5
    )

    if summary.get("touchesBorder"):
        score -= 0.75

    if ratios["widthRatio"] >= 0.90:
        score -= (ratios["widthRatio"] - 0.90) * 8.0

    if ratios["areaRatio"] >= 0.72:
        score -= (ratios["areaRatio"] - 0.72) * 7.0

    score -= min(0.35, component_count * 0.025)

    return score


def _target_candidate_rejection_reason(
    summary: dict[str, Any],
    ratios: dict[str, float],
    score: float,
) -> str | None:
    if not summary.get("bbox"):
        return "empty_mask"

    foreground_ratio = float(summary.get("foregroundRatio") or 0.0)

    if foreground_ratio <= 0:
        return "empty_mask"

    if foreground_ratio < 0.04:
        return "foreground_too_low"

    if ratios["areaRatio"] < 0.08:
        return "bbox_area_too_small"

    if ratios["widthRatio"] < 0.20:
        return "bbox_too_narrow"

    if ratios["heightRatio"] < 0.22:
        return "bbox_too_short"

    if summary.get("touchesBorder") and ratios["widthRatio"] >= 0.96:
        return "roi_over_coverage"

    if ratios["areaRatio"] >= 0.85:
        return "roi_over_coverage"

    if summary.get("touchesBorder") and foreground_ratio > 0.50:
        return "roi_over_coverage"

    if foreground_ratio > 0.70 or ratios["areaRatio"] > 0.92:
        return "coverage_too_large"

    if score < 0:
        return "low_candidate_score"

    return None


def _build_target_closeup_candidate_stages(probability: Any, image_size: Tuple[int, int], np: Any) -> dict[str, Any]:
    thresholds = _read_float_list_env(
        "AI_LIGHTWEIGHT_TARGET_CANDIDATE_THRESHOLDS",
        DEFAULT_TARGET_CANDIDATE_THRESHOLDS,
        0.0,
        0.99,
    )
    gammas = _read_float_list_env(
        "AI_LIGHTWEIGHT_TARGET_CANDIDATE_GAMMAS",
        DEFAULT_TARGET_CANDIDATE_GAMMAS,
        0.1,
        8.0,
    )
    probability_array = np.asarray(probability)

    if probability_array.ndim != 2:
        raise OnnxSegmentationError(
            f"target 候选 probability 必须是二维数组，实际 shape={probability_array.shape}"
        )

    probability_height, probability_width = probability_array.shape
    scoring_scale = min(
        1.0,
        DEFAULT_TARGET_CANDIDATE_SCORING_EDGE / max(1, probability_width, probability_height),
    )
    scoring_size = (
        max(1, int(round(probability_width * scoring_scale))),
        max(1, int(round(probability_height * scoring_scale))),
    )
    scoring_probability = probability_array

    if scoring_size != (probability_width, probability_height):
        scoring_probability = np.asarray(
            Image.fromarray(probability_array.astype(np.float32), mode="F").resize(
                scoring_size,
                Image.Resampling.BILINEAR,
            ),
            dtype=np.float32,
        )

    candidates = []
    candidate_scoring_started_at = perf_counter()

    for threshold in thresholds:
        for gamma in gammas:
            stages = build_soft_mask_stages(
                scoring_probability,
                scoring_size,
                np,
                body_keep_components_override=1,
                blur_override=0.0,
                include_component_stats=True,
                gamma_override=gamma,
                threshold_override=threshold,
            )
            score = _score_target_closeup_candidate(stages, scoring_size)
            summary = stages["finalSummary"]
            ratios = _get_bbox_ratios(summary, scoring_size)
            rejected_reason = _target_candidate_rejection_reason(summary, ratios, score)

            candidates.append(
                {
                    "accepted": rejected_reason is None,
                    "bbox": summary.get("bbox"),
                    "bboxAreaRatio": ratios["areaRatio"],
                    "componentCount": summary.get("componentCount"),
                    "foregroundRatio": summary["foregroundRatio"],
                    "gamma": gamma,
                    "heightRatio": ratios["heightRatio"],
                    "maxAlpha": summary["maxAlpha"],
                    "meanAlpha": summary["meanAlpha"],
                    "rejectedReason": rejected_reason,
                    "score": score,
                    "stages": stages,
                    "threshold": threshold,
                    "touchesBorder": summary.get("touchesBorder"),
                    "widthRatio": ratios["widthRatio"],
                }
            )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    candidate_scoring_ms = (perf_counter() - candidate_scoring_started_at) * 1000

    if not candidates:
        raise OnnxSegmentationError("target 候选 mask 为空")

    accepted_candidates = [candidate for candidate in candidates if candidate["accepted"]]
    selected = accepted_candidates[0] if accepted_candidates else candidates[0]
    selected_stages = build_soft_mask_stages(
        probability,
        image_size,
        np,
        body_keep_components_override=1,
        include_component_stats=False,
        gamma_override=selected["gamma"],
        threshold_override=selected["threshold"],
    )
    selected_reason = (
        "highest_scoring_accepted_candidate"
        if accepted_candidates
        else f"all_candidates_rejected:{selected['rejectedReason'] or 'unknown'}"
    )
    selected_stages = {
        **selected_stages,
        "candidateDiagnostics": [
            {key: value for key, value in candidate.items() if key != "stages"}
            for candidate in candidates
        ],
        "candidateScoringMs": candidate_scoring_ms,
        "candidateScoringSize": {
            "height": scoring_size[1],
            "width": scoring_size[0],
        },
        "selectedCandidate": {key: value for key, value in selected.items() if key != "stages"},
        "selectedReason": selected_reason,
    }

    return selected_stages


def _probability_to_soft_mask(
    probability: Any,
    image_size: Tuple[int, int],
    np: Any,
    use_target_candidates: bool = False,
) -> Image.Image:
    global LAST_MASK_DIAGNOSTICS

    scoring_started_at = perf_counter()
    stages = (
        _build_target_closeup_candidate_stages(probability, image_size, np)
        if use_target_candidates
        else build_soft_mask_stages(probability, image_size, np, include_component_stats=False)
    )
    total_mask_build_ms = (perf_counter() - scoring_started_at) * 1000
    candidate_scoring_ms = float(stages.get("candidateScoringMs") or total_mask_build_ms)
    probability_height, probability_width = np.asarray(probability).shape
    stage_dimensions = {
        "final": {"height": image_size[1], "width": image_size[0]},
        "probability": {"height": probability_height, "width": probability_width},
    }
    raw_summary = stages["rawSummary"]
    threshold_summary = stages["thresholdSummary"]
    body_filter_summary = stages["bodyFilterSummary"]
    components_summary = stages["componentsSummary"]
    final_summary = stages["finalSummary"]

    if not np.isfinite(stages["maxProbability"]) or stages["maxProbability"] < stages["threshold"]:
        LAST_MASK_DIAGNOSTICS = {
            "blurRadius": stages["blurRadius"],
            "connectedComponentCount": stages["connectedComponentCount"],
            "finalAlphaMax": 0,
            "finalAlphaMean": 0.0,
            "finalAlphaMin": 0,
            "gamma": stages["gamma"],
            "keepComponents": stages["keepComponents"],
            "keptComponentCount": stages["keptComponentCount"],
            "rawProbabilityMax": raw_summary["maxAlpha"] / 255.0,
            "rawProbabilityMean": raw_summary["meanAlpha"] / 255.0,
            "rawProbabilityMin": raw_summary["minAlpha"] / 255.0,
            "stageDiagnostics": {
                "bodyFilter": body_filter_summary,
                "components": components_summary,
                "final": final_summary,
                "rawProbability": raw_summary,
                "threshold": threshold_summary,
            },
            "threshold": stages["threshold"],
            "thresholdForegroundRatio": threshold_summary["foregroundRatio"],
            "bodyFilterDiagnostics": stages["bodyFilterDiagnostics"],
            "candidateScoringMs": candidate_scoring_ms,
            "candidateScoringSize": stages.get("candidateScoringSize"),
            "totalMaskBuildMs": total_mask_build_ms,
            "candidateDiagnostics": stages.get("candidateDiagnostics"),
            "selectedCandidate": stages.get("selectedCandidate"),
            "selectedReason": stages.get("selectedReason"),
            "stageDimensions": stage_dimensions,
        }
        raise OnnxSegmentationError(
            f"模型输出服装概率过低，max={stages['maxProbability']:.3f}，threshold={stages['threshold']:.3f}"
        )

    if components_summary["foregroundRatio"] < MIN_SOFT_MASK_FOREGROUND_RATIO:
        LAST_MASK_DIAGNOSTICS = {
            "blurRadius": stages["blurRadius"],
            "connectedComponentCount": stages["connectedComponentCount"],
            "finalAlphaMax": 0,
            "finalAlphaMean": 0.0,
            "finalAlphaMin": 0,
            "gamma": stages["gamma"],
            "keepComponents": stages["keepComponents"],
            "keptComponentCount": stages["keptComponentCount"],
            "rawProbabilityMax": raw_summary["maxAlpha"] / 255.0,
            "rawProbabilityMean": raw_summary["meanAlpha"] / 255.0,
            "rawProbabilityMin": raw_summary["minAlpha"] / 255.0,
            "stageDiagnostics": {
                "bodyFilter": body_filter_summary,
                "components": components_summary,
                "final": final_summary,
                "rawProbability": raw_summary,
                "threshold": threshold_summary,
            },
            "threshold": stages["threshold"],
            "thresholdForegroundRatio": threshold_summary["foregroundRatio"],
            "bodyFilterDiagnostics": stages["bodyFilterDiagnostics"],
            "candidateScoringMs": candidate_scoring_ms,
            "candidateScoringSize": stages.get("candidateScoringSize"),
            "totalMaskBuildMs": total_mask_build_ms,
            "candidateDiagnostics": stages.get("candidateDiagnostics"),
            "selectedCandidate": stages.get("selectedCandidate"),
            "selectedReason": stages.get("selectedReason"),
            "stageDimensions": stage_dimensions,
        }
        raise OnnxSegmentationError(
            f"模型输出服装区域过小，foregroundRatio={components_summary['foregroundRatio']:.6f}，threshold={stages['threshold']:.3f}"
        )

    LAST_MASK_DIAGNOSTICS = {
        "blurRadius": stages["blurRadius"],
        "connectedComponentCount": stages["connectedComponentCount"],
        "finalAlphaMax": final_summary["maxAlpha"],
        "finalAlphaMean": final_summary["meanAlpha"],
        "finalAlphaMin": final_summary["minAlpha"],
        "gamma": stages["gamma"],
        "keepComponents": stages["keepComponents"],
        "keptComponentCount": stages["keptComponentCount"],
        "rawProbabilityMax": raw_summary["maxAlpha"] / 255.0,
        "rawProbabilityMean": raw_summary["meanAlpha"] / 255.0,
        "rawProbabilityMin": raw_summary["minAlpha"] / 255.0,
        "stageDiagnostics": {
            "bodyFilter": body_filter_summary,
            "components": components_summary,
            "final": final_summary,
            "rawProbability": raw_summary,
            "threshold": threshold_summary,
        },
        "threshold": stages["threshold"],
        "thresholdForegroundRatio": threshold_summary["foregroundRatio"],
        "bodyFilterDiagnostics": stages["bodyFilterDiagnostics"],
        "candidateScoringMs": candidate_scoring_ms,
        "candidateScoringSize": stages.get("candidateScoringSize"),
        "totalMaskBuildMs": total_mask_build_ms,
        "candidateDiagnostics": stages.get("candidateDiagnostics"),
        "selectedCandidate": stages.get("selectedCandidate"),
        "selectedReason": stages.get("selectedReason"),
        "stageDimensions": stage_dimensions,
    }

    return stages["finalMask"]


def get_multiclass_label_probability(output: Any, labels: Tuple[int, ...], np: Any) -> tuple[Any, int, str]:
    logits = np.asarray(output)

    if logits.ndim != 4:
        raise OnnxSegmentationError(f"多类别 logits 必须是 4D 输出，当前输出形状为 {logits.shape}")

    if logits.shape[0] != 1:
        raise OnnxSegmentationError(f"暂只支持 batch size 1 输出，当前输出形状为 {logits.shape}")

    if logits.shape[1] > 2:
        label_count = logits.shape[1]
        invalid_labels = [label for label in labels if label < 0 or label >= label_count]
        if invalid_labels:
            raise OnnxSegmentationError(
                f"AI_LIGHTWEIGHT_CLOTHING_LABELS 包含超出模型类别数的标签：{invalid_labels}，模型类别数为 {label_count}"
            )

        return _get_label_probability(logits[0], labels, 0, np), label_count, "NCHW"

    if logits.shape[3] > 2:
        label_count = logits.shape[3]
        invalid_labels = [label for label in labels if label < 0 or label >= label_count]
        if invalid_labels:
            raise OnnxSegmentationError(
                f"AI_LIGHTWEIGHT_CLOTHING_LABELS 包含超出模型类别数的标签：{invalid_labels}，模型类别数为 {label_count}"
            )

        return _get_label_probability(logits[0], labels, 2, np), label_count, "NHWC"

    raise OnnxSegmentationError(f"输出不是多类别 logits，当前输出形状为 {logits.shape}")


def _parse_multiclass_logits(
    output: Any,
    image_size: Tuple[int, int],
    np: Any,
    use_target_candidates: bool = False,
) -> Image.Image | None:
    logits = np.asarray(output)

    if logits.ndim != 4:
        return None

    if not (logits.shape[1] > 2 or logits.shape[3] > 2):
        return None

    probability, _label_count, _layout = get_multiclass_label_probability(output, _read_clothing_labels(), np)

    return _probability_to_soft_mask(probability, image_size, np, use_target_candidates)


def _squeeze_mask_output(output: Any, np: Any) -> Any:
    mask = np.asarray(output)

    if mask.ndim == 4:
        if mask.shape[0] != 1:
            raise OnnxSegmentationError(f"暂只支持 batch size 1 输出，当前输出形状为 {mask.shape}")

        if mask.shape[1] == 1:
            return mask[0, 0]

        if mask.shape[1] == 2:
            return mask[0, 1]

        if mask.shape[3] == 1:
            return mask[0, :, :, 0]

        if mask.shape[3] == 2:
            return mask[0, :, :, 1]

    if mask.ndim == 3:
        if mask.shape[0] == 1:
            return mask[0]

        if mask.shape[0] == 2:
            return mask[1]

        if mask.shape[2] == 1:
            return mask[:, :, 0]

        if mask.shape[2] == 2:
            return mask[:, :, 1]

    if mask.ndim == 2:
        return mask

    raise OnnxSegmentationError(f"无法解析模型输出为 mask，输出形状为 {mask.shape}")


def parse_mask_output(
    output: Any,
    image_size: Tuple[int, int],
    np: Any,
    use_target_candidates: bool = False,
) -> Image.Image:
    multiclass_mask = _parse_multiclass_logits(output, image_size, np, use_target_candidates)

    if multiclass_mask is not None:
        return multiclass_mask

    mask = _squeeze_mask_output(output, np).astype(np.float32)

    if mask.size == 0:
        raise OnnxSegmentationError("模型输出为空")

    mask_min = float(np.nanmin(mask))
    mask_max = float(np.nanmax(mask))

    if not np.isfinite(mask_min) or not np.isfinite(mask_max):
        raise OnnxSegmentationError("模型输出包含非有限数值")

    if mask_max > 1.0 and mask_min >= 0.0:
        mask = mask / mask_max
    elif mask_min < 0.0 or mask_max > 1.0:
        mask = _sigmoid(mask, np)

    binary_mask = (mask >= 0.5).astype(np.uint8) * 255

    if int(binary_mask.max()) == 0:
        raise OnnxSegmentationError("模型输出没有可用前景区域")

    pil_mask = Image.fromarray(binary_mask, mode="L")

    if pil_mask.size != image_size:
        pil_mask = pil_mask.resize(image_size, Image.Resampling.NEAREST)

    return pil_mask


def run_onnx_first_output(model_path: Path, image: Image.Image) -> tuple[Any, Any, OnnxInputSpec]:
    global LAST_ONNX_TIMINGS

    total_started_at = perf_counter()
    dependencies_started_at = perf_counter()
    np, ort = load_onnx_dependencies()
    dependencies_ms = (perf_counter() - dependencies_started_at) * 1000
    session = create_onnx_session(model_path, ort)
    session_diagnostics = dict(LAST_ONNX_TIMINGS)
    preprocess_started_at = perf_counter()
    input_spec = get_input_spec(session)
    input_tensor = preprocess_image(image, input_spec, np)
    preprocess_ms = (perf_counter() - preprocess_started_at) * 1000

    try:
        inference_started_at = perf_counter()
        outputs = session.run(None, {input_spec.name: input_tensor})
        inference_ms = (perf_counter() - inference_started_at) * 1000
    except Exception as exc:
        raise OnnxSegmentationError(f"模型推理失败：{exc}") from exc

    if not outputs:
        raise OnnxSegmentationError("模型没有输出")

    LAST_ONNX_TIMINGS = {
        **session_diagnostics,
        "dependenciesMs": dependencies_ms,
        "inferenceMs": inference_ms,
        "onnxRunCount": 1,
        "preprocessMs": preprocess_ms,
        "totalOnnxPipelineMs": (perf_counter() - total_started_at) * 1000,
    }

    return outputs[0], np, input_spec


def record_postprocess_diagnostics(mask: Image.Image) -> None:
    global LAST_MASK_DIAGNOSTICS

    try:
        np, _ort = load_onnx_dependencies()
        LAST_MASK_DIAGNOSTICS = {
            **LAST_MASK_DIAGNOSTICS,
            "postprocess": image_mask_summary(mask, np, include_component_count=False),
        }
    except Exception:
        return


def run_onnx_segmentation(
    model_path: Path,
    image: Image.Image,
    use_target_candidates: bool = False,
) -> Image.Image:
    output, np, _input_spec = run_onnx_first_output(model_path, image)

    return parse_mask_output(output, image.size, np, use_target_candidates)
