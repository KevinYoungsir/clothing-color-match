# RunningHub LLM/VLM Live Verification

## Validation Goal

Confirm that the RunningHub OpenAI-compatible LLM/VLM advisory provider can complete one real image-analysis request while preserving the existing ROI, mask, and color-transfer safety boundaries.

## Validation Context

- Validation date: 2026-07-03
- Branch: `feat/runninghub-live-verification-normalization`
- Commit under validation: `41fa7c0`
- Provider: `runninghub`
- Model: `qwen/qwen3.7-plus`
- Base URL: `https://llm.runninghub.cn/v1`
- API Key status: configured
- Test images: 1 approved local image; the image and its local path are not recorded or committed

No API Key value, account identifier, test image, or sensitive local path is included in this report.

## Sanitized Live Result

| Field | Result |
| --- | --- |
| `success` | `true` |
| `provider` | `runninghub` |
| `providerStatus` | `ready` |
| `errorCode` | `null` |
| Raw `garmentCategory` | `polo shirt` |
| `garmentDescription` | Navy blue short-sleeved polo shirt with thin white horizontal stripes, a collar, and a three-button placket. |
| Raw `riskTags` | `striped pattern` |
| `suggestedRoi` | `x=100, y=30, width=1240, height=1380` |
| `confidence` | `0.95` |
| `containsHanger` | `false` |
| `containsMetalClip` | `false` |
| `edgeTouching` | `false` |
| `complexBackground` | `false` |
| `recommendManualMask` | `false` |
| `shouldApplyDirectlyToColorTransfer` | `false` |

## Validation Conclusions

- The real RunningHub `llm_vlm` request path completed successfully.
- The response was valid JSON and passed the provider schema checks.
- Confidence was within the required `0-1` range.
- The suggested ROI passed the original-image boundary validation.
- The response remained advisory and did not directly enter `colorTransfer`.
- Users must still confirm the suggested ROI and final mask before color calibration.

## Findings

The live model returned natural-language values that should not become unstable internal identifiers:

- Category: `polo shirt` rather than the internal `polo` category.
- Risk tag: `striped pattern` rather than the internal `striped_pattern` tag.

The provider now preserves these raw values for diagnostics while exposing normalized values to the frontend.

## Business Value and Safety

The stripe risk is useful because users may need to confirm whether both the garment base color and stripe regions should be calibrated. A stripe risk by itself does not force a manual mask, but the UI still asks the user to confirm the ROI and final mask.

High-risk normalized tags such as hanger, metal clip, edge touching, complex background, partial garment, or strong shadow conservatively enable the manual-mask recommendation. This recommendation does not bypass or modify segmentation and ROI safety gates.

## Next Steps

1. Run a broader sample set covering trousers, jackets, shirts, knitwear, and edge-touching garments.
2. Review unknown category and `unknown_risk` frequency before expanding mappings.
3. Compare suggested ROI usefulness against the final confirmed segmentation mask.
4. Continue treating RunningHub as advisory only.
5. Never commit the API Key or test images.
